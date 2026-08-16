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
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
    private const uint IDLE_THRESHOLD_MS = 5 * 60_000;

    private static WinEventDelegate? _foregroundDelegate;
    private static IntPtr _foregroundHook;
    private static readonly object Sync = new();
    private static int _inputCount;
    private static uint _lastInputTime;
    private static bool _isIdle;
    private static WindowSnapshot _active = new("Application", "", "", 0, "other");
    private static System.Threading.Timer? _flushTimer;
    private static System.Threading.Timer? _sampleTimer;
    private static System.Threading.Timer? _titleTimer;
    private static System.Threading.Timer? _inputTimer;
    private static readonly bool CollectTitles = Environment.GetEnvironmentVariable("DAYTRACE_COLLECT_TITLES") != "0";
    private static readonly bool CollectInput = Environment.GetEnvironmentVariable("DAYTRACE_COLLECT_INPUT") != "0";
    private static readonly bool CollectTabCount = Environment.GetEnvironmentVariable("DAYTRACE_COLLECT_TAB_COUNT") != "0";

    public static void Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        _active = ReadActiveWindow();
        _lastInputTime = GetLastInputTime();
        _isIdle = GetIdleMilliseconds() >= IDLE_THRESHOLD_MS;
        Emit("foreground", 1, _active);
        if (_isIdle) Emit("idle", 1, _active);

        _foregroundDelegate = OnForeground;
        _foregroundHook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, _foregroundDelegate, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        // A one-second last-input sample captures active seconds without global
        // keyboard/mouse hooks, key data, pointer coordinates, or per-event wakeups.
        _inputTimer = new System.Threading.Timer(_ => SampleInputActivity(), null, 1000, 1000);
        // Sampling only the foreground title avoids the very noisy global
        // accessibility name-change stream while retaining useful context.
        if (CollectTitles) _titleTimer = new System.Threading.Timer(_ => SampleForegroundTitle(), null, 5000, 5000);
        // Coarse batches keep journal writes negligible.
        _flushTimer = new System.Threading.Timer(_ => FlushCounts(), null, 15000, 15000);
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
            _titleTimer?.Dispose();
            _inputTimer?.Dispose();
            if (_foregroundHook != IntPtr.Zero) UnhookWinEvent(_foregroundHook);
        }
    }

    private static void OnForeground(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        FlushCounts();
        var snapshot = ReadWindow(hwnd, true);
        lock (Sync) _active = snapshot;
        if (GetIdleMilliseconds() < IDLE_THRESHOLD_MS) Emit("foreground", 1, snapshot);
    }

    private static void SampleForegroundTitle()
    {
        lock (Sync) { if (_isIdle) return; }
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero || hwnd != GetForegroundWindow()) return;
        var snapshot = ReadWindow(hwnd, false);
        WindowSnapshot previous;
        lock (Sync)
        {
            previous = _active;
            if ((snapshot.Process == previous.Process && snapshot.Title == previous.Title) || IsGenericTitle(snapshot)) return;
            _active = snapshot with { TabCount = previous.Process == snapshot.Process ? previous.TabCount : 0 };
            snapshot = _active;
        }
        FlushCounts(previous);
        Emit("foreground", 1, snapshot);
    }

    private static void SampleInputActivity()
    {
        var current = GetLastInputTime();
        var becameIdle = false;
        var becameActive = false;
        WindowSnapshot snapshot;
        lock (Sync)
        {
            if (current != 0 && current != _lastInputTime)
            {
                _lastInputTime = current;
                if (CollectInput) _inputCount++;
                if (_isIdle) { _isIdle = false; becameActive = true; }
            }
            else if (!_isIdle && GetIdleMilliseconds() >= IDLE_THRESHOLD_MS)
            {
                _isIdle = true;
                becameIdle = true;
            }
            snapshot = _active;
        }
        if (becameIdle) { FlushCounts(snapshot); Emit("idle", 1, snapshot); }
        else if (becameActive) Emit("resume", 1, snapshot);
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
        lock (Sync)
        {
            inputs = _inputCount;
            _inputCount = 0;
        }
        if (inputs > 0) Emit("input", inputs, snapshot);
    }

    private static void SampleActiveWindow()
    {
        var snapshot = ReadWindow(GetForegroundWindow(), true);
        WindowSnapshot previous;
        var changed = false;
        var idle = false;
        lock (Sync)
        {
            previous = _active;
            changed = snapshot.Process != previous.Process || snapshot.Title != previous.Title;
            _active = snapshot;
            idle = _isIdle;
        }
        if (idle) return;
        if (changed)
        {
            FlushCounts(previous);
            Emit("foreground", 1, snapshot);
        }
        else if (GetIdleMilliseconds() < IDLE_THRESHOLD_MS)
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
            var appName = FriendlyName(processName);
            var context = ContextKind(processName);
            var tabCount = CollectTabCount && includeAccessibility && context == "browser" ? CountBrowserTabs(hwnd) : 0;
            return new WindowSnapshot(appName, processName, CollectTitles ? NormalizeWindowTitle(title.ToString()) : "", tabCount, context);
        }
        catch
        {
            return new WindowSnapshot("Application", "", CollectTitles ? NormalizeWindowTitle(title.ToString()) : "", 0, "other");
        }
    }

    private static bool IsGenericTitle(WindowSnapshot snapshot)
    {
        var title = snapshot.Title.Trim();
        if (string.IsNullOrWhiteSpace(title)) return false;
        return title.Equals(snapshot.App, StringComparison.OrdinalIgnoreCase)
            || title.Equals(snapshot.Process, StringComparison.OrdinalIgnoreCase)
            || title.Equals("TelegramDesktop", StringComparison.OrdinalIgnoreCase)
            || title.Equals("Google Chrome", StringComparison.OrdinalIgnoreCase)
            || title.Equals("Microsoft Edge", StringComparison.OrdinalIgnoreCase);
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
        var lastInput = GetLastInputTime();
        return lastInput > 0 ? unchecked((uint)Environment.TickCount - lastInput) : 0;
    }

    private static uint GetLastInputTime()
    {
        var info = new LastInputInfo { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        return GetLastInputInfo(ref info) ? info.Time : 0;
    }

    private static string ContextKind(string process) => process.ToLowerInvariant() switch
    {
        "chrome" or "msedge" or "firefox" or "brave" or "opera" or "vivaldi" => "browser",
        "telegram" or "telegramdesktop" or "slack" or "teams" or "discord" or "signal" or "whatsapp" => "messaging",
        "code" or "devenv" or "webstorm64" or "idea64" or "pycharm64" or "androidstudio" => "editor",
        _ => "other",
    };

    private static string FriendlyName(string process) => process.ToLowerInvariant() switch
    {
        "code" => "Visual Studio Code",
        "chrome" => "Google Chrome",
        "msedge" => "Microsoft Edge",
        "telegram" or "telegramdesktop" => "Telegram Desktop",
        "figma" => "Figma",
        "explorer" => "File Explorer",
        "windowsterminal" => "Windows Terminal",
        "chatgpt" => "ChatGPT",
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

    [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int ptX; public int ptY; }
    [StructLayout(LayoutKind.Sequential)] private struct LastInputInfo { public uint Size; public uint Time; }
    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr module, WinEventDelegate callback, uint processId, uint threadId, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] private static extern sbyte GetMessage(out Message message, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
    [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LastInputInfo info);
}
