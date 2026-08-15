using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows.Automation;

internal static class Program
{
    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint EVENT_OBJECT_NAMECHANGE = 0x800C;
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_MBUTTONDOWN = 0x0207;

    private static WinEventDelegate? _foregroundDelegate;
    private static WinEventDelegate? _nameChangeDelegate;
    private static HookDelegate? _keyboardDelegate;
    private static HookDelegate? _mouseDelegate;
    private static IntPtr _foregroundHook;
    private static IntPtr _nameChangeHook;
    private static IntPtr _keyboardHook;
    private static IntPtr _mouseHook;
    private static readonly object Sync = new();
    private static int _inputCount;
    private static int _clickCount;
    private static WindowSnapshot _active = new("Application", "", "", 0, "other");
    private static System.Threading.Timer? _flushTimer;
    private static System.Threading.Timer? _sampleTimer;

    public static void Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        _active = ReadActiveWindow();
        Emit("foreground", 1, _active);

        _foregroundDelegate = OnForeground;
        _nameChangeDelegate = OnNameChange;
        _keyboardDelegate = OnKeyboard;
        _mouseDelegate = OnMouse;
        _foregroundHook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, _foregroundDelegate, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        _nameChangeHook = SetWinEventHook(EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_NAMECHANGE, IntPtr.Zero, _nameChangeDelegate, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        _keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardDelegate, GetModuleHandle(null), 0);
        _mouseHook = SetWindowsHookEx(WH_MOUSE_LL, _mouseDelegate, GetModuleHandle(null), 0);
        // Coarse batches keep hook wakeups and journal writes negligible.
        _flushTimer = new System.Threading.Timer(_ => FlushCounts(), null, 10000, 10000);
        // One accessibility sample per minute keeps long reading/review sessions
        // accurate and observes browser tab counts without continuous polling.
        _sampleTimer = new System.Threading.Timer(_ => SampleActiveWindow(), null, 60000, 60000);

        try
        {
            while (GetMessage(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref message);
                DispatchMessage(ref message);
            }
        }
        finally
        {
            FlushCounts();
            _flushTimer?.Dispose();
            _sampleTimer?.Dispose();
            if (_foregroundHook != IntPtr.Zero) UnhookWinEvent(_foregroundHook);
            if (_nameChangeHook != IntPtr.Zero) UnhookWinEvent(_nameChangeHook);
            if (_keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(_keyboardHook);
            if (_mouseHook != IntPtr.Zero) UnhookWindowsHookEx(_mouseHook);
        }
    }

    private static void OnForeground(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        FlushCounts();
        var snapshot = ReadWindow(hwnd, true);
        lock (Sync) _active = snapshot;
        Emit("foreground", 1, snapshot);
    }

    private static void OnNameChange(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (hwnd == IntPtr.Zero || hwnd != GetForegroundWindow()) return;
        var snapshot = ReadWindow(hwnd, false);
        WindowSnapshot previous;
        lock (Sync)
        {
            previous = _active;
            if (snapshot.Process == previous.Process && snapshot.Title == previous.Title) return;
            _active = snapshot with { TabCount = previous.Process == snapshot.Process ? previous.TabCount : 0 };
            snapshot = _active;
        }
        FlushCounts(previous);
        Emit("foreground", 1, snapshot);
    }

    private static IntPtr OnKeyboard(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
        {
            lock (Sync) _inputCount++;
        }
        return CallNextHookEx(_keyboardHook, code, wParam, lParam);
    }

    private static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && (wParam == (IntPtr)WM_LBUTTONDOWN || wParam == (IntPtr)WM_RBUTTONDOWN || wParam == (IntPtr)WM_MBUTTONDOWN))
        {
            lock (Sync) _clickCount++;
        }
        return CallNextHookEx(_mouseHook, code, wParam, lParam);
    }

    private static void FlushCounts()
    {
        WindowSnapshot snapshot;
        lock (Sync) snapshot = _active;
        FlushCounts(snapshot);
    }

    private static void FlushCounts(WindowSnapshot snapshot)
    {
        int inputs;
        int clicks;
        lock (Sync)
        {
            inputs = _inputCount;
            clicks = _clickCount;
            _inputCount = 0;
            _clickCount = 0;
        }
        if (inputs > 0) Emit("input", inputs, snapshot);
        if (clicks > 0) Emit("click", clicks, snapshot);
    }

    private static void SampleActiveWindow()
    {
        var snapshot = ReadWindow(GetForegroundWindow(), true);
        WindowSnapshot previous;
        var changed = false;
        lock (Sync)
        {
            previous = _active;
            changed = snapshot.Process != previous.Process || snapshot.Title != previous.Title;
            _active = snapshot;
        }
        if (changed)
        {
            FlushCounts(previous);
            Emit("foreground", 1, snapshot);
        }
        else if (GetIdleMilliseconds() < 5 * 60_000)
        {
            Emit("heartbeat", 1, snapshot);
        }
    }

    private static WindowSnapshot ReadActiveWindow() => ReadWindow(GetForegroundWindow(), true);

    private static WindowSnapshot ReadWindow(IntPtr hwnd, bool includeAccessibility)
    {
        if (hwnd == IntPtr.Zero) return new WindowSnapshot("Application", "", "", 0, "other");
        var title = new StringBuilder(512);
        GetWindowText(hwnd, title, title.Capacity);
        GetWindowThreadProcessId(hwnd, out var processId);
        try
        {
            using var process = Process.GetProcessById((int)processId);
            var processName = process.ProcessName;
            var appName = string.IsNullOrWhiteSpace(process.MainWindowTitle) ? processName : FriendlyName(processName);
            var context = ContextKind(processName);
            var tabCount = includeAccessibility && context == "browser" ? CountBrowserTabs(hwnd) : 0;
            return new WindowSnapshot(appName, processName, NormalizeWindowTitle(title.ToString()), tabCount, context);
        }
        catch
        {
            return new WindowSnapshot("Application", "", NormalizeWindowTitle(title.ToString()), 0, "other");
        }
    }

    private static string NormalizeWindowTitle(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category != UnicodeCategory.Format && !char.IsControl(character)) builder.Append(character);
        }
        var normalized = Regex.Replace(builder.ToString(), @"\s+", " ").Trim();
        // Telegram may expose unread badges and volatile internal message IDs
        // in the native title. They are not user context and would create noise.
        normalized = Regex.Replace(normalized, @"^\(\d+\)\s*", "");
        normalized = Regex.Replace(normalized, @"\s+\(\d{5,}\)$", "");
        return normalized;
    }

    private static int CountBrowserTabs(IntPtr hwnd)
    {
        try
        {
            var root = AutomationElement.FromHandle(hwnd);
            var tabs = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem));
            var visible = 0;
            foreach (AutomationElement tab in tabs)
            {
                try { if (!tab.Current.IsOffscreen) visible++; } catch { }
            }
            return Math.Clamp(visible, 0, 200);
        }
        catch
        {
            return 0;
        }
    }

    private static uint GetIdleMilliseconds()
    {
        var info = new LastInputInfo { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        return GetLastInputInfo(ref info) ? unchecked((uint)Environment.TickCount - info.Time) : 0;
    }

    private static string ContextKind(string process) => process.ToLowerInvariant() switch
    {
        "chrome" or "msedge" or "firefox" or "brave" or "opera" or "vivaldi" => "browser",
        "telegram" or "slack" or "teams" or "discord" or "signal" or "whatsapp" => "messaging",
        "code" or "devenv" or "webstorm64" or "idea64" or "pycharm64" => "editor",
        _ => "other",
    };

    private static string FriendlyName(string process) => process.ToLowerInvariant() switch
    {
        "code" => "Visual Studio Code",
        "chrome" => "Google Chrome",
        "msedge" => "Microsoft Edge",
        "telegram" => "Telegram Desktop",
        "figma" => "Figma",
        "explorer" => "File Explorer",
        "windowsterminal" => "Windows Terminal",
        _ => process,
    };

    private static void Emit(string kind, int count, WindowSnapshot snapshot)
    {
        var payload = new
        {
            at = DateTimeOffset.Now.ToString("O"),
            kind,
            count,
            app = snapshot.App,
            process = snapshot.Process,
            title = snapshot.Title,
            context = snapshot.Context,
            tabCount = snapshot.TabCount,
        };
        Console.WriteLine(JsonSerializer.Serialize(payload));
        Console.Out.Flush();
    }

    private sealed record WindowSnapshot(string App, string Process, string Title, int TabCount, string Context);
    private delegate void WinEventDelegate(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);
    private delegate IntPtr HookDelegate(int code, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int ptX; public int ptY; }
    [StructLayout(LayoutKind.Sequential)] private struct LastInputInfo { public uint Size; public uint Time; }
    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr module, WinEventDelegate callback, uint processId, uint threadId, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr SetWindowsHookEx(int idHook, HookDelegate callback, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? moduleName);
    [DllImport("user32.dll")] private static extern sbyte GetMessage(out Message message, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
    [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LastInputInfo info);
}
