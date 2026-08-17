using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace NovaPOS.Desktop.Services;

/// <summary>
/// Local HTTP server the browser talks to (see src/lib/zy-printer.ts). The
/// deployed web app can't reach USB hardware, so it posts ESC/POS bytes here and
/// this process forwards them to the attached printer through ZyPrinter.dll.
/// <para>
/// SECURITY: the listener binds to loopback only, but it is unauthenticated and
/// answers with <c>Access-Control-Allow-Origin: *</c> because the calling page is
/// served from a different origin. Any page open in a browser on this machine, and
/// any local process, can therefore print or pop the cash drawer. It can be turned
/// off in printer settings when the web app isn't used.
/// </para>
/// </summary>
public class HardwareBridge
{
    public const int DefaultPort = 18181;

    /// <summary>Refuse absurd payloads rather than buffering them.</summary>
    private const int MaxJobBytes = 4 * 1024 * 1024;

    private HttpListener? _listener;
    private Thread? _thread;
    private volatile bool _running;

    public bool IsRunning => _running;

    public int Port { get; private set; } = DefaultPort;

    public string? LastError { get; private set; }

    public bool Start(int port = DefaultPort)
    {
        if (_running) return true;

        Port = port;
        try
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://localhost:{port}/");
            _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
            _listener.Start();
            _running = true;
            LastError = null;

            _thread = new Thread(ListenLoop) { IsBackground = true, Name = "NovaPOS hardware bridge" };
            _thread.Start();
            return true;
        }
        catch (Exception ex)
        {
            // Most often: another NovaPOS instance already owns the port.
            LastError = ex.Message;
            _running = false;
            _listener = null;
            return false;
        }
    }

    public void Stop()
    {
        _running = false;
        try { _listener?.Stop(); } catch { }
        try { _listener?.Close(); } catch { }
        _listener = null;
    }

    private void ListenLoop()
    {
        while (_running)
        {
            try
            {
                if (_listener == null) break;
                HttpListenerContext context = _listener.GetContext();
                ThreadPool.QueueUserWorkItem(_ => HandleRequest(context));
            }
            catch
            {
                // Listener stopped, or a malformed request — keep serving.
            }
        }
    }

    private void HandleRequest(HttpListenerContext context)
    {
        HttpListenerResponse response = context.Response;
        response.AddHeader("Access-Control-Allow-Origin", "*");
        response.AddHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        response.AddHeader("Access-Control-Allow-Headers",
            "Content-Type, X-Printer-Type, X-Printer-Ip, X-Printer-Port, X-Com-Port, X-Com-Baud, X-Bt-Com, X-Bt-Baud, X-Spooler-Name");

        if (context.Request.HttpMethod == "OPTIONS")
        {
            response.StatusCode = 200;
            response.Close();
            return;
        }

        try
        {
            string path = context.Request.Url?.AbsolutePath ?? "";

            if (path == "/status")
            {
                Respond(response, 200, new
                {
                    status = "active",
                    sdk = ZyPrinterNative.Dll,
                    version = "1.3",
                    sdkAvailable = PrinterService.SdkAvailable,
                    connected = PrinterService.IsConnected,
                    printer = PrinterService.Target.Describe(),
                    charWidth = PrinterService.Target.CharWidth
                });
                return;
            }

            if (path == "/open-drawer" && context.Request.HttpMethod == "POST")
            {
                bool opened = PrinterService.OpenDrawer(TargetFromHeaders(context.Request));
                Respond(response, 200, new { success = opened, error = opened ? null : PrinterService.LastError });
                return;
            }

            if (path == "/cut" && context.Request.HttpMethod == "POST")
            {
                var cut = PrinterService.Cut(target: TargetFromHeaders(context.Request));
                Respond(response, 200, new { success = cut.Success, error = cut.Error });
                return;
            }

            if (path == "/print" && context.Request.HttpMethod == "POST")
            {
                if (context.Request.ContentLength64 > MaxJobBytes)
                {
                    Respond(response, 413, new { success = false, error = "Print job too large." });
                    return;
                }

                byte[] payload = ReadCapped(context.Request.InputStream);
                if (payload.Length == 0)
                {
                    Respond(response, 400, new { success = false, error = "Empty print job." });
                    return;
                }

                var result = PrinterService.SendJob(payload, TargetFromHeaders(context.Request));
                Respond(response, 200, new { success = result.Success, error = result.Error });
                return;
            }

            Respond(response, 404, new { error = "Not found" });
        }
        catch (Exception ex)
        {
            Respond(response, 500, new { error = ex.Message });
        }
    }

    private static byte[] ReadCapped(Stream input)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;

        while ((read = input.Read(chunk, 0, chunk.Length)) > 0)
        {
            if (buffer.Length + read > MaxJobBytes) break;
            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    /// <summary>
    /// Honours the X-Printer-* headers the web client sends, falling back to the
    /// printer configured on this machine.
    /// </summary>
    private static PrinterTarget TargetFromHeaders(HttpListenerRequest request)
    {
        string? type = request.Headers["X-Printer-Type"];
        if (string.IsNullOrWhiteSpace(type)) return PrinterService.Target;

        var target = PrinterService.Target.Clone();
        target.Transport = PrinterTarget.ParseTransport(type);

        if (target.Transport == PrinterTransport.Network)
        {
            string? ip = request.Headers["X-Printer-Ip"];
            if (!string.IsNullOrWhiteSpace(ip)) target.Ip = ip;
            if (int.TryParse(request.Headers["X-Printer-Port"], out int port) && port > 0) target.Port = port;
        }
        else if (target.Transport == PrinterTransport.Serial)
        {
            if (int.TryParse(request.Headers["X-Com-Port"], out int com) && com > 0) target.ComPort = com;
            if (int.TryParse(request.Headers["X-Com-Baud"], out int baud) && baud > 0) target.ComBaud = baud;
        }
        else if (target.Transport == PrinterTransport.Bluetooth)
        {
            string? btCom = request.Headers["X-Bt-Com"];
            if (!string.IsNullOrWhiteSpace(btCom)) target.BtComPort = btCom;
            if (int.TryParse(request.Headers["X-Bt-Baud"], out int baud) && baud > 0) target.BtBaud = baud;
        }
        else if (target.Transport == PrinterTransport.WindowsSpooler)
        {
            string? spooler = request.Headers["X-Spooler-Name"];
            if (!string.IsNullOrWhiteSpace(spooler)) target.SpoolerName = spooler;
        }

        return target;
    }

    private static void Respond(HttpListenerResponse response, int status, object payload)
    {
        try
        {
            response.StatusCode = status;
            response.ContentType = "application/json";

            byte[] body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
            response.ContentLength64 = body.Length;
            response.OutputStream.Write(body, 0, body.Length);
        }
        catch { }
        finally
        {
            try { response.Close(); } catch { }
        }
    }
}
