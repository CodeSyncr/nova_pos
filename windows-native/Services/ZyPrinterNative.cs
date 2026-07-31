using System;
using System.Runtime.InteropServices;

namespace NovaPOS.Desktop.Services;

/// <summary>
/// P/Invoke surface for the bundled ZyPrinter SDK (ZyPrinter.dll), declared
/// against the DLL's real export table rather than its header alone.
/// <para>
/// Three facts about this binary shape everything here:
/// </para>
/// <list type="number">
/// <item>
/// It is 32-bit (PE Machine 0x014C), so the host process must be x86. See the
/// PlatformTarget in NovaPOS.csproj.
/// </item>
/// <item>
/// Handles are plain <c>int</c>s, not pointers, so they marshal as <c>int</c>.
/// The vendor's WinForms sample uses <c>IntPtr</c>, which happens to work only
/// because both are four bytes in a 32-bit process.
/// </item>
/// <item>
/// <c>OpenCOM</c> and <c>OpenUsbTO</c> are exported with C++ mangled names
/// (<c>?OpenCOM@@YGHHHH@Z</c>, <c>?OpenUsbTO@@YGHH@Z</c>) because the header
/// leaves <c>USE_EXTERN_C</c> at 0. The sample imports them by plain name, which
/// would throw EntryPointNotFoundException; they are bound via EntryPoint here.
/// </item>
/// </list>
/// <para>
/// Every declaration uses <c>ExactSpelling</c> so the runtime never probes for
/// an A/W suffix that does not exist.
/// </para>
/// </summary>
internal static class ZyPrinterNative
{
    internal const string Dll = "ZyPrinter.dll";

    private const CallingConvention Std = CallingConvention.StdCall;

    // Port identifiers from ZyPrinter.h, used by the SendCmd_* helpers.
    internal const int USB_PORT = 1;
    internal const int COM_PORT = 2;
    internal const int NET_PORT = 3;
    internal const int LPT_PORT = 4;

    // ── USB ────────────────────────────────────────────────────────────────
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int OpenUsb();

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int OpenUsbEx(int vid, int pid);

    /// <summary>Mangled export: <c>int __stdcall OpenUsbTO(int timeOut)</c>.</summary>
    [DllImport(Dll, EntryPoint = "?OpenUsbTO@@YGHH@Z", CallingConvention = Std, ExactSpelling = true)]
    internal static extern int OpenUsbTO(int timeOut);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int WriteUsb(int fs, byte[] sendBuf, int sendBufSize);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int ReadUsb(int fs, byte[] readBuf, int readBufSize);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int CloseUsb(int fs);

    /// <summary>One-shot open/write/close against a specific VID/PID pair.</summary>
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true, CharSet = CharSet.Ansi)]
    internal static extern int usbportwrite(
        [MarshalAs(UnmanagedType.LPStr)] string vid,
        [MarshalAs(UnmanagedType.LPStr)] string pid,
        uint length,
        byte[] data);

    // ── Network ────────────────────────────────────────────────────────────
    /// <summary>Boots the SDK's socket layer. Must succeed before any Connect call.</summary>
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int InitNetSev();

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int ConnectNetPort(int addr, int port, int timeout);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int ConnectNetPortEx(int addr0, int addr1, int addr2, int addr3, int port, int timeout);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int WriteToNetPort(int fs, byte[] sendBuf, int writeSize);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int ReadFromNetPort(int fs, byte[] recvBuf, int recvBufSize);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int CloseNetPor(int fs);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int CloseNetServ();

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int Netportwrite(int addr, int port, int timeout, int length, byte[] data);

    // ── Serial ─────────────────────────────────────────────────────────────
    /// <summary>
    /// Mangled export: <c>int __stdcall OpenCOM(int comm, int baud, int timeOut)</c>.
    /// This is the call the vendor sample uses for serial, and it takes the port
    /// as a number (7 for COM7) rather than a string.
    /// </summary>
    [DllImport(Dll, EntryPoint = "?OpenCOM@@YGHHHH@Z", CallingConvention = Std, ExactSpelling = true)]
    internal static extern int OpenCOM(int comm, int baud, int timeOut);

    /// <summary>
    /// Despite the W suffix the header declares this as <c>char*</c>, so it is
    /// marshalled as ANSI.
    /// </summary>
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true, CharSet = CharSet.Ansi)]
    internal static extern int OpenComW(
        [MarshalAs(UnmanagedType.LPStr)] string com,
        uint baudRate,
        byte parity,
        byte byteSize,
        byte dtrControl,
        byte stopBits);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int WriteCom(int fs, byte[] sendBuf, uint writeSize);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CloseCom(int fs);

    /// <summary>One-shot open/write/close on a COM port.</summary>
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true, CharSet = CharSet.Ansi)]
    internal static extern int comportwrite(
        [MarshalAs(UnmanagedType.LPStr)] string com,
        uint baudRate,
        byte parity,
        byte byteSize,
        byte dtrControl,
        byte stopBits,
        uint length,
        byte[] data);

    // ── Parallel ───────────────────────────────────────────────────────────
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true, CharSet = CharSet.Ansi)]
    internal static extern int OpenLptA([MarshalAs(UnmanagedType.LPStr)] string lptName);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int WriteLpt(int fs, byte[] sendBuf, int sendBufSize);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int CloseLpt(int fs);

    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true, CharSet = CharSet.Ansi)]
    internal static extern int Lptportwrite(
        [MarshalAs(UnmanagedType.LPStr)] string name,
        int length,
        byte[] data);

    // ── SDK-side command helpers ───────────────────────────────────────────
    /// <summary>Cuts the paper on an already-open port. <paramref name="mode"/> 0 is a full cut.</summary>
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int SendCmd_CutPaper(int printerPort, int fs, int mode);

    /// <summary>Feeds <paramref name="line"/> lines (0 &lt; line &lt; 100) on an open port.</summary>
    [DllImport(Dll, CallingConvention = Std, ExactSpelling = true)]
    internal static extern int SendCmd_LineFeed(int printerPort, int fs, int line);
}
