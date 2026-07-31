using System;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NovaPOS.Desktop.Services;

public enum PrinterTransport
{
    Usb,
    Network,
    Serial,
    Parallel,
    Bluetooth,
    WindowsSpooler
}

/// <summary>
/// Mirrors <c>PrinterConfig</c> in src/lib/zy-printer.ts so the settings screen,
/// the native print path and the bridge headers all speak the same language.
/// </summary>
public class PrinterTarget
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public PrinterTransport Transport { get; set; } = PrinterTransport.Usb;

    public string Ip { get; set; } = "192.168.1.100";
    public int Port { get; set; } = 9100;
    public int ComPort { get; set; } = 1;
    public int ComBaud { get; set; } = 19200;
    public string LptName { get; set; } = "LPT1";

    /// <summary>Bluetooth virtual COM port (e.g. COM4) or Bluetooth address.</summary>
    public string BtComPort { get; set; } = "COM4";
    public int BtBaud { get; set; } = 9600;

    /// <summary>Windows installed printer name (e.g. "POS-80" or "Bluetooth POS Printer").</summary>
    public string SpoolerName { get; set; } = "POS-80";

    /// <summary>Milliseconds the SDK waits when opening a port.</summary>
    public int OpenTimeout { get; set; } = 4000;

    /// <summary>Optional USB VID/PID. Both zero means "take the first printer found".</summary>
    public int UsbVid { get; set; }
    public int UsbPid { get; set; }

    /// <summary>Characters per line: 48 for 80mm paper, 32 for 58mm.</summary>
    public int CharWidth { get; set; } = 48;

    /// <summary>Print a receipt automatically when an order is completed.</summary>
    public bool AutoPrintOnComplete { get; set; }

    /// <summary>Print a receipt automatically as soon as an order is placed at the till.</summary>
    public bool AutoPrintOnPlace { get; set; }

    /// <summary>Pop the cash drawer when an order is settled in cash.</summary>
    public bool KickDrawerOnCash { get; set; } = true;

    /// <summary>Serve the local HTTP bridge so the web app can reach this printer.</summary>
    public bool BridgeEnabled { get; set; } = true;

    public int BridgePort { get; set; } = 18181;

    public PrinterTarget Clone() => new()
    {
        Transport = Transport,
        Ip = Ip,
        Port = Port,
        ComPort = ComPort,
        ComBaud = ComBaud,
        LptName = LptName,
        BtComPort = BtComPort,
        BtBaud = BtBaud,
        SpoolerName = SpoolerName,
        OpenTimeout = OpenTimeout,
        UsbVid = UsbVid,
        UsbPid = UsbPid,
        CharWidth = CharWidth,
        AutoPrintOnComplete = AutoPrintOnComplete,
        AutoPrintOnPlace = AutoPrintOnPlace,
        KickDrawerOnCash = KickDrawerOnCash,
        BridgeEnabled = BridgeEnabled,
        BridgePort = BridgePort
    };

    public string Describe() => Transport switch
    {
        PrinterTransport.Network => $"Network · {Ip}:{Port}",
        PrinterTransport.Serial => $"Serial · COM{ComPort} @ {ComBaud}",
        PrinterTransport.Parallel => $"Parallel · {LptName}",
        PrinterTransport.Bluetooth => $"Bluetooth · {BtComPort} @ {BtBaud}",
        PrinterTransport.WindowsSpooler => $"Windows Spooler · {SpoolerName}",
        _ => "USB · ZyPrinter SDK"
    };

    /// <summary>
    /// Identity of the physical port. When this changes the cached SDK handle is
    /// stale and has to be reopened.
    /// </summary>
    internal string PortKey() => Transport switch
    {
        PrinterTransport.Network => $"net:{Ip}:{Port}",
        PrinterTransport.Serial => $"com:{ComPort}:{ComBaud}",
        PrinterTransport.Parallel => $"lpt:{LptName}",
        PrinterTransport.Bluetooth => $"bt:{BtComPort}:{BtBaud}",
        PrinterTransport.WindowsSpooler => $"winspool:{SpoolerName}",
        _ => $"usb:{UsbVid:X4}:{UsbPid:X4}"
    };

    /// <summary>The wire value used by the bridge's X-Printer-Type header.</summary>
    public static PrinterTransport ParseTransport(string? value) => value?.ToLowerInvariant() switch
    {
        "net" or "network" or "tcp" => PrinterTransport.Network,
        "com" or "serial" => PrinterTransport.Serial,
        "lpt" or "parallel" => PrinterTransport.Parallel,
        "bt" or "bluetooth" or "spp" => PrinterTransport.Bluetooth,
        "spooler" or "windows" or "winspool" => PrinterTransport.WindowsSpooler,
        _ => PrinterTransport.Usb
    };
}

/// <summary>Outcome of a print attempt, so callers can report something useful.</summary>
public readonly record struct PrintResult(bool Success, string? Error)
{
    public static PrintResult Ok => new(true, null);

    public static PrintResult Fail(string error) => new(false, error);
}

/// <summary>
/// Raw Printing Helper using Win32 winspool.drv API to print raw ESC/POS byte streams directly
/// to any Windows printer installed in Devices &amp; Printers (including Bluetooth thermal printers).
/// </summary>
internal static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string? pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string? pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string? pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes)
    {
        if (string.IsNullOrWhiteSpace(szPrinterName)) return false;
        Int32 dwWritten = 0;
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;

        di.pDocName = "NovaPOS Bill";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Trim(), out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    bSuccess = WritePrinter(hPrinter, pBytes, pBytes.Length, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}

/// <summary>
/// Single funnel for every byte that reaches a printer, whether the job came from
/// this app's UI or from the browser through <see cref="HardwareBridge"/>.
/// Supports USB, Network, Serial, Parallel, Bluetooth SPP and Windows Spooler.
/// </summary>
public static class PrinterService
{
    private const int MaxAttempts = 3;

    private static readonly object Gate = new();

    private static readonly string SettingsPath =
        Path.Combine(AppContext.BaseDirectory, "printer-settings.json");

    private static PrinterTarget _target = Load();

    // Cached open port, mirroring the sample's hUsb / hNet / hCOM fields.
    private static int _handle;
    private static string _handleKey = "";
    private static int _handlePortId;

    private static bool _netStackReady;
    private static bool? _sdkProbe;
    private static string? _sdkDetail;

    /// <summary>Last failure reason, surfaced by the settings screen.</summary>
    public static string? LastError { get; private set; }

    public static PrinterTarget Target
    {
        get { lock (Gate) return _target; }
    }

    /// <summary>True while a port is open and cached.</summary>
    public static bool IsConnected
    {
        get { lock (Gate) return _handle > 0; }
    }

    public static void Save(PrinterTarget target)
    {
        lock (Gate)
        {
            // Settings may have moved the printer to another port entirely.
            if (target.PortKey() != _handleKey) CloseHandle();

            _target = target;
            try
            {
                File.WriteAllText(SettingsPath,
                    JsonSerializer.Serialize(target, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch
            {
                // A read-only install directory shouldn't break printing.
            }
        }
    }

    private static PrinterTarget Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var loaded = JsonSerializer.Deserialize<PrinterTarget>(File.ReadAllText(SettingsPath));
                if (loaded != null) return loaded;
            }
        }
        catch { }

        return new PrinterTarget();
    }

    // ── SDK availability ───────────────────────────────────────────────────

    public static bool SdkAvailable
    {
        get
        {
            if (_sdkProbe.HasValue) return _sdkProbe.Value;

            string path = Path.Combine(AppContext.BaseDirectory, ZyPrinterNative.Dll);

            if (!File.Exists(path))
            {
                _sdkDetail = $"{ZyPrinterNative.Dll} was not found next to NovaPOS.exe.";
                LastError = _sdkDetail;
                _sdkProbe = false;
                return false;
            }

            string? machine = ReadPeMachine(path);
            bool hostIs64 = Environment.Is64BitProcess;

            if (machine == "x86" && hostIs64)
            {
                _sdkDetail = $"{ZyPrinterNative.Dll} is 32-bit but NovaPOS is running as 64-bit. Rebuild with PlatformTarget x86.";
                LastError = _sdkDetail;
                _sdkProbe = false;
                return false;
            }

            if (machine == "x64" && !hostIs64)
            {
                _sdkDetail = $"{ZyPrinterNative.Dll} is 64-bit but NovaPOS is running as 32-bit.";
                LastError = _sdkDetail;
                _sdkProbe = false;
                return false;
            }

            if (!NativeLibrary.TryLoad(path, out _))
            {
                _sdkDetail = $"{ZyPrinterNative.Dll} could not be loaded. A dependency may be missing.";
                LastError = _sdkDetail;
                _sdkProbe = false;
                return false;
            }

            _sdkDetail = $"{ZyPrinterNative.Dll} loaded ({machine ?? "unknown"}).";
            _sdkProbe = true;
            return true;
        }
    }

    public static string SdkStatus
    {
        get
        {
            bool ok = SdkAvailable;
            return _sdkDetail ?? (ok ? "SDK ready." : "SDK unavailable.");
        }
    }

    private static string? ReadPeMachine(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            var header = new byte[0x40];
            if (stream.Read(header, 0, header.Length) < header.Length) return null;

            int peOffset = BitConverter.ToInt32(header, 0x3C);
            stream.Position = peOffset;

            var coff = new byte[6];
            if (stream.Read(coff, 0, coff.Length) < coff.Length) return null;
            if (coff[0] != (byte)'P' || coff[1] != (byte)'E') return null;

            return BitConverter.ToUInt16(coff, 4) switch
            {
                0x014C => "x86",
                0x8664 => "x64",
                0xAA64 => "arm64",
                _ => null
            };
        }
        catch { return null; }
    }

    // ── Public print surface ───────────────────────────────────────────────

    public static bool Send(byte[] data, PrinterTarget? target = null) => SendJob(data, target).Success;

    public static PrintResult SendJob(byte[] data, PrinterTarget? target = null)
    {
        if (data.Length == 0) return PrintResult.Ok;
        target ??= Target;

        // Windows Spooler works directly via winspool.drv without requiring ZyPrinter.dll
        if (target.Transport == PrinterTransport.WindowsSpooler)
        {
            lock (Gate)
            {
                bool ok = RawPrinterHelper.SendBytesToPrinter(target.SpoolerName, data);
                if (ok)
                {
                    LastError = null;
                    return PrintResult.Ok;
                }
                return Record($"Could not print to Windows printer '{target.SpoolerName}'. Check printer name in Printers & Devices.");
            }
        }

        // Bluetooth SPP can use direct COM port serial connection if SDK unavailable
        if (target.Transport == PrinterTransport.Bluetooth)
        {
            lock (Gate)
            {
                bool ok = WriteBluetooth(data, target);
                if (ok)
                {
                    LastError = null;
                    return PrintResult.Ok;
                }
                return Record($"Could not print to Bluetooth printer on {target.BtComPort}. Ensure printer is paired & powered on.");
            }
        }

        if (!SdkAvailable) return PrintResult.Fail(_sdkDetail ?? "Printer SDK unavailable.");

        lock (Gate)
        {
            try
            {
                return Write(data, target);
            }
            catch (DllNotFoundException)
            {
                CloseHandle();
                return Record($"{ZyPrinterNative.Dll} was not found next to NovaPOS.exe.");
            }
            catch (BadImageFormatException)
            {
                CloseHandle();
                return Record($"{ZyPrinterNative.Dll} is 32-bit; NovaPOS must run as x86.");
            }
            catch (EntryPointNotFoundException ex)
            {
                CloseHandle();
                return Record("The printer SDK is missing an expected export: " + ex.Message);
            }
            catch (Exception ex)
            {
                CloseHandle();
                return Record(ex.Message);
            }
        }
    }

    public static bool OpenDrawer(PrinterTarget? target = null)
        => Send(new byte[] { 0x1B, 0x70, 0x00, 0x1E, 0xFF }, target);

    public static PrintResult Probe(PrinterTarget? target = null)
        => SendJob(new byte[] { 0x1B, 0x40 }, target);

    public static PrintResult Cut(int feedLines = 4, PrinterTarget? target = null)
    {
        target ??= Target;
        if (target.Transport == PrinterTransport.WindowsSpooler || target.Transport == PrinterTransport.Bluetooth)
        {
            // Standard ESC/POS cut bytes
            byte[] cutBytes = new byte[] { 0x1D, 0x56, 0x42, 0x00 };
            return SendJob(cutBytes, target);
        }

        if (!SdkAvailable) return PrintResult.Fail(_sdkDetail ?? "Printer SDK unavailable.");

        lock (Gate)
        {
            try
            {
                if (!EnsureOpen(target)) return Record(CannotOpen(target));

                if (feedLines is > 0 and < 100)
                    ZyPrinterNative.SendCmd_LineFeed(_handlePortId, _handle, feedLines);

                bool ok = ZyPrinterNative.SendCmd_CutPaper(_handlePortId, _handle, 0) > 0;
                if (!ok) return Record("The printer did not accept the cut command.");

                LastError = null;
                return PrintResult.Ok;
            }
            catch (Exception ex)
            {
                CloseHandle();
                return Record(ex.Message);
            }
        }
    }

    public static void Shutdown()
    {
        lock (Gate)
        {
            CloseHandle();

            if (_netStackReady)
            {
                try { ZyPrinterNative.CloseNetServ(); } catch { }
                _netStackReady = false;
            }
        }
    }

    // ── Write loop ─────────────────────────────────────────────────────────

    private static PrintResult Write(byte[] data, PrinterTarget target)
    {
        string? failure = null;

        for (int attempt = 0; attempt < MaxAttempts; attempt++)
        {
            if (!EnsureOpen(target))
            {
                failure = CannotOpen(target);
                continue;
            }

            int written = target.Transport switch
            {
                PrinterTransport.Network => ZyPrinterNative.WriteToNetPort(_handle, data, data.Length),
                PrinterTransport.Serial => ZyPrinterNative.WriteCom(_handle, data, (uint)data.Length),
                PrinterTransport.Parallel => ZyPrinterNative.WriteLpt(_handle, data, data.Length),
                PrinterTransport.Bluetooth => WriteBluetooth(data, target) ? data.Length : 0,
                _ => ZyPrinterNative.WriteUsb(_handle, data, data.Length)
            };

            if (written > 0)
            {
                LastError = null;
                return PrintResult.Ok;
            }

            failure = $"{target.Describe()} refused the job.";
            CloseHandle();
        }

        if (OneShot(data, target))
        {
            LastError = null;
            return PrintResult.Ok;
        }

        return Record(failure ?? "The printer did not accept the job.");
    }

    private static bool WriteBluetooth(byte[] data, PrinterTarget target)
    {
        string portName = target.BtComPort.Trim().ToUpperInvariant();
        if (!portName.StartsWith("COM")) portName = "COM" + portName;

        int baud = target.BtBaud > 0 ? target.BtBaud : 9600;

        try
        {
            int written = ZyPrinterNative.comportwrite(portName, (uint)baud, 0, 8, 1, 0, (uint)data.Length, data);
            if (written > 0) return true;
        }
        catch { }

        try
        {
            using var port = new SerialPort(portName, baud, Parity.None, 8, StopBits.One);
            port.ReadTimeout = 1000;
            port.WriteTimeout = 3000;
            port.Open();
            port.Write(data, 0, data.Length);
            port.Close();
            return true;
        }
        catch { }

        return false;
    }

    private static bool OneShot(byte[] data, PrinterTarget target)
    {
        try
        {
            switch (target.Transport)
            {
                case PrinterTransport.Serial:
                    return ZyPrinterNative.comportwrite(
                        "COM" + target.ComPort, (uint)target.ComBaud,
                        0, 8, 1, 0, (uint)data.Length, data) > 0;

                case PrinterTransport.Parallel:
                    return ZyPrinterNative.Lptportwrite(target.LptName, data.Length, data) > 0;

                case PrinterTransport.Network:
                    if (!TryPackAddress(target.Ip, out int packed)) return false;
                    return ZyPrinterNative.Netportwrite(
                        packed, target.Port, target.OpenTimeout, data.Length, data) > 0;

                case PrinterTransport.Bluetooth:
                    return WriteBluetooth(data, target);

                default:
                    return false;
            }
        }
        catch { return false; }
    }

    // ── Port management ────────────────────────────────────────────────────

    private static bool EnsureOpen(PrinterTarget target)
    {
        string key = target.PortKey();

        if (_handle > 0)
        {
            if (_handleKey == key) return true;
            CloseHandle();
        }

        int handle = target.Transport switch
        {
            PrinterTransport.Network => OpenNetwork(target),
            PrinterTransport.Serial => OpenSerial(target),
            PrinterTransport.Parallel => ZyPrinterNative.OpenLptA(target.LptName),
            _ => OpenUsb(target)
        };

        if (handle <= 0) return false;

        _handle = handle;
        _handleKey = key;
        _handlePortId = target.Transport switch
        {
            PrinterTransport.Network => ZyPrinterNative.NET_PORT,
            PrinterTransport.Serial => ZyPrinterNative.COM_PORT,
            PrinterTransport.Parallel => ZyPrinterNative.LPT_PORT,
            _ => ZyPrinterNative.USB_PORT
        };

        return true;
    }

    private static int OpenUsb(PrinterTarget target)
    {
        if (target.UsbVid > 0 && target.UsbPid > 0)
        {
            int byId = ZyPrinterNative.OpenUsbEx(target.UsbVid, target.UsbPid);
            if (byId > 0) return byId;
        }

        try
        {
            int openTo = ZyPrinterNative.OpenUsbTO(target.OpenTimeout);
            if (openTo > 0) return openTo;
        }
        catch (EntryPointNotFoundException)
        {
        }

        return ZyPrinterNative.OpenUsb();
    }

    private static int OpenNetwork(PrinterTarget target)
    {
        if (!TryPackAddress(target.Ip, out int packed)) return -1;

        if (!_netStackReady)
        {
            if (ZyPrinterNative.InitNetSev() <= 0) return -1;
            _netStackReady = true;
        }

        byte[] octets = IPAddress.Parse(target.Ip).GetAddressBytes();
        return ZyPrinterNative.ConnectNetPortEx(
            octets[0], octets[1], octets[2], octets[3], target.Port, target.OpenTimeout);
    }

    private static int OpenSerial(PrinterTarget target)
    {
        try
        {
            int handle = ZyPrinterNative.OpenCOM(target.ComPort, target.ComBaud, target.OpenTimeout);
            if (handle > 0) return handle;
        }
        catch (EntryPointNotFoundException)
        {
        }

        return ZyPrinterNative.OpenComW("COM" + target.ComPort, (uint)target.ComBaud, 0, 8, 1, 0);
    }

    private static void CloseHandle()
    {
        if (_handle <= 0)
        {
            _handle = 0;
            _handleKey = "";
            return;
        }

        try
        {
            switch (_handlePortId)
            {
                case ZyPrinterNative.NET_PORT: ZyPrinterNative.CloseNetPor(_handle); break;
                case ZyPrinterNative.COM_PORT: ZyPrinterNative.CloseCom(_handle); break;
                case ZyPrinterNative.LPT_PORT: ZyPrinterNative.CloseLpt(_handle); break;
                default: ZyPrinterNative.CloseUsb(_handle); break;
            }
        }
        catch { }

        _handle = 0;
        _handleKey = "";
        _handlePortId = 0;
    }

    private static bool TryPackAddress(string ip, out int packed)
    {
        packed = 0;
        if (!IPAddress.TryParse(ip, out var address)) return false;

        byte[] octets = address.GetAddressBytes();
        if (octets.Length != 4) return false;

        packed = (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3];
        return true;
    }

    private static string CannotOpen(PrinterTarget target) => target.Transport switch
    {
        PrinterTransport.Network => $"Could not reach the printer at {target.Ip}:{target.Port}.",
        PrinterTransport.Serial => $"COM{target.ComPort} did not open. Check the port number and baud rate.",
        PrinterTransport.Parallel => $"{target.LptName} did not open.",
        PrinterTransport.Bluetooth => $"Bluetooth port {target.BtComPort} did not open.",
        PrinterTransport.WindowsSpooler => $"Windows printer '{target.SpoolerName}' could not be opened.",
        _ => "No USB printer responded. Check the cable and that it is powered on."
    };

    private static PrintResult Record(string error)
    {
        LastError = error;
        return PrintResult.Fail(error);
    }
}
