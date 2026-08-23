using System.Buffers.Binary;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

internal static class BrowserNativeHost
{
    private const string ExpectedOrigin = "chrome-extension://mnjnhakgamhedpkchgmefgekmmbcpmbo/";
    private const string PipePrefix = @"\\.\pipe\daytrace-browser-";
    private const int MaximumMessageBytes = 64 * 1024;
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint OpenExisting = 3;
    private const int ErrorFileNotFound = 2;
    private const int ErrorPipeBusy = 231;

    public static bool ShouldRun(IEnumerable<string> arguments) =>
        arguments.Any(argument => argument.StartsWith("chrome-extension://", StringComparison.OrdinalIgnoreCase));

    public static void Run(string[] arguments)
    {
        try
        {
            var origin = arguments.FirstOrDefault(argument => argument.StartsWith("chrome-extension://", StringComparison.OrdinalIgnoreCase));
            if (!string.Equals(origin, ExpectedOrigin, StringComparison.Ordinal)) throw new InvalidOperationException("Untrusted extension");
            var message = ReadFrame(Console.OpenStandardInput());
            using (JsonDocument.Parse(message)) { }
            var response = ForwardToDaytrace(ResolveDataRoot(), message);
            WriteFrame(Console.OpenStandardOutput(), response);
        }
        catch (Exception error)
        {
            var detail = error.Message switch
            {
                "Untrusted extension" => error.Message,
                "Invalid native message" => error.Message,
                "Daytrace is not running" => error.Message,
                "Daytrace companion configuration is unavailable" => error.Message,
                "Daytrace pipe connection timed out" => error.Message,
                "Daytrace pipe response timed out" => error.Message,
                _ => "Daytrace companion failed",
            };
            WriteFrame(Console.OpenStandardOutput(), JsonSerializer.Serialize(new { ok = false, error = detail }));
        }
    }

    private static string ResolveDataRoot()
    {
        if (Environment.GetEnvironmentVariable("DAYTRACE_BROWSER_HOST_TEST") == "1")
        {
            var isolated = Environment.GetEnvironmentVariable("DAYTRACE_BROWSER_DATA_ROOT");
            if (!string.IsNullOrWhiteSpace(isolated)) return Path.GetFullPath(isolated);
        }
        using var key = Registry.CurrentUser.OpenSubKey(@"Software\Daytrace\BrowserHost", false);
        var root = key?.GetValue("DataRoot") as string;
        if (string.IsNullOrWhiteSpace(root)) throw new InvalidOperationException("Daytrace companion configuration is unavailable");
        return Path.GetFullPath(root);
    }

    private static string ForwardToDaytrace(string root, string message)
    {
        var configFile = Path.Combine(root, "browser-host.json");
        var info = new FileInfo(configFile);
        if (!info.Exists || info.Length <= 0 || info.Length > 16 * 1024) throw new InvalidOperationException("Daytrace is not running");
        using var config = JsonDocument.Parse(File.ReadAllText(configFile, Encoding.UTF8));
        var address = config.RootElement.GetProperty("address").GetString() ?? "";
        var token = config.RootElement.GetProperty("token").GetString() ?? "";
        if (!address.StartsWith(PipePrefix, StringComparison.Ordinal) || !Regex.IsMatch(address[PipePrefix.Length..], "^[a-f0-9]{20}$", RegexOptions.IgnoreCase) || !Regex.IsMatch(token, "^[a-f0-9]{64}$", RegexOptions.IgnoreCase))
            throw new InvalidOperationException("Daytrace companion configuration is unavailable");

        using var pipe = ConnectPipe(address);
        using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, true) { AutoFlush = true };
        writer.WriteLine($"{{\"token\":{JsonSerializer.Serialize(token)},\"message\":{message}}}");
        using var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 1024, true);
        string? response;
        try { response = reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)).GetAwaiter().GetResult(); }
        catch (TimeoutException) { throw new InvalidOperationException("Daytrace pipe response timed out"); }
        if (string.IsNullOrWhiteSpace(response) || Encoding.UTF8.GetByteCount(response) > MaximumMessageBytes) throw new InvalidOperationException("Daytrace companion failed");
        using (JsonDocument.Parse(response)) { }
        return response;
    }

    private static FileStream ConnectPipe(string address)
    {
        var deadline = Environment.TickCount64 + 3_000;
        while (true)
        {
            var handle = CreateFile(address, GenericRead | GenericWrite, 0, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
            if (!handle.IsInvalid) return new FileStream(handle, FileAccess.ReadWrite, 4096, false);
            var error = Marshal.GetLastWin32Error();
            handle.Dispose();
            if (error != ErrorPipeBusy && error != ErrorFileNotFound) throw new InvalidOperationException("Daytrace is not running");
            var remaining = Math.Max(0, deadline - Environment.TickCount64);
            if (remaining == 0 || !WaitNamedPipe(address, (uint)Math.Min(remaining, 3_000))) throw new InvalidOperationException("Daytrace pipe connection timed out");
        }
    }

    private static string ReadFrame(Stream input)
    {
        Span<byte> header = stackalloc byte[4];
        try { input.ReadExactly(header); }
        catch { throw new InvalidOperationException("Invalid native message"); }
        var length = BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (length == 0 || length > MaximumMessageBytes) throw new InvalidOperationException("Invalid native message");
        var body = new byte[length];
        try { input.ReadExactly(body); }
        catch { throw new InvalidOperationException("Invalid native message"); }
        return Encoding.UTF8.GetString(body);
    }

    private static void WriteFrame(Stream output, string response)
    {
        var body = Encoding.UTF8.GetBytes(response);
        if (body.Length > MaximumMessageBytes) body = Encoding.UTF8.GetBytes("{\"ok\":false,\"error\":\"Daytrace companion failed\"}");
        Span<byte> header = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, (uint)body.Length);
        output.Write(header);
        output.Write(body);
        output.Flush();
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string fileName, uint desiredAccess, uint shareMode, IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool WaitNamedPipe(string name, uint timeout);
}
