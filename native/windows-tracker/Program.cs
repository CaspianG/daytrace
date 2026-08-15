using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

internal static class Program
{
    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_MBUTTONDOWN = 0x0207;

    private static WinEventDelegate? _foregroundDelegate;
    private static HookDelegate? _keyboardDelegate;
    private static HookDelegate? _mouseDelegate;
    private static IntPtr _foregroundHook;
    private static IntPtr _keyboardHook;
    private static IntPtr _mouseHook;
    private static readonly object Sync = new();
    private static int _inputCount;
    private static int _clickCount;
    private static WindowSnapshot _active = new("Приложение", "", "");
    private static System.Threading.Timer? _flushTimer;

    public static void Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        _active = ReadActiveWindow();
        Emit("foreground", 1, _active);

        _foregroundDelegate = OnForeground;
        _keyboardDelegate = OnKeyboard;
        _mouseDelegate = OnMouse;
        _foregroundHook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, _foregroundDelegate, 0, 0, WINEVENT_OUTOFCONTEXT);
        _keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardDelegate, GetModuleHandle(null), 0);
        _mouseHook = SetWindowsHookEx(WH_MOUSE_LL, _mouseDelegate, GetModuleHandle(null), 0);
        _flushTimer = new System.Threading.Timer(_ => FlushCounts(), null, 2000, 2000);

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
            if (_foregroundHook != IntPtr.Zero) UnhookWinEvent(_foregroundHook);
            if (_keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(_keyboardHook);
            if (_mouseHook != IntPtr.Zero) UnhookWindowsHookEx(_mouseHook);
        }
    }

    private static void OnForeground(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        FlushCounts();
        _active = ReadWindow(hwnd);
        Emit("foreground", 1, _active);
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
        int inputs;
        int clicks;
        lock (Sync)
        {
            inputs = _inputCount;
            clicks = _clickCount;
            _inputCount = 0;
            _clickCount = 0;
        }
        if (inputs > 0) Emit("input", inputs, _active);
        if (clicks > 0) Emit("click", clicks, _active);
    }

    private static WindowSnapshot ReadActiveWindow() => ReadWindow(GetForegroundWindow());

    private static WindowSnapshot ReadWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return new WindowSnapshot("Приложение", "", "");
        var title = new StringBuilder(512);
        GetWindowText(hwnd, title, title.Capacity);
        GetWindowThreadProcessId(hwnd, out var processId);
        try
        {
            using var process = Process.GetProcessById((int)processId);
            var processName = process.ProcessName;
            var appName = string.IsNullOrWhiteSpace(process.MainWindowTitle) ? processName : FriendlyName(processName);
            return new WindowSnapshot(appName, processName, title.ToString());
        }
        catch
        {
            return new WindowSnapshot("Приложение", "", title.ToString());
        }
    }

    private static string FriendlyName(string process) => process.ToLowerInvariant() switch
    {
        "code" => "Visual Studio Code",
        "chrome" => "Google Chrome",
        "msedge" => "Microsoft Edge",
        "telegram" => "Telegram Desktop",
        "figma" => "Figma",
        "explorer" => "Проводник",
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
        };
        Console.WriteLine(JsonSerializer.Serialize(payload));
        Console.Out.Flush();
    }

    private sealed record WindowSnapshot(string App, string Process, string Title);
    private delegate void WinEventDelegate(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);
    private delegate IntPtr HookDelegate(int code, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int ptX; public int ptY; }
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
}
