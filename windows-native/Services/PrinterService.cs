using System;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace NovaPOS.Desktop.Services;

public static class ZyPrinter
{
    [DllImport("ZyPrinter.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern IntPtr OpenUsb();

    [DllImport("ZyPrinter.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int WriteUsb(IntPtr h, byte[] buf, int len);

    [DllImport("ZyPrinter.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int CloseUsb(IntPtr h);

    public static bool SendUsb(byte[] data)
    {
        IntPtr h = OpenUsb();
        if (h == IntPtr.Zero || h == new IntPtr(-1)) return false;
        try
        {
            for (int i = 0; i < 3; i++)
            {
                if (WriteUsb(h, data, data.Length) > 0) return true;
            }
            return false;
        }
        finally { CloseUsb(h); }
    }

    public static bool KickDrawerUsb()
    {
        return SendUsb(new byte[] { 0x1B, 0x70, 0x00, 0x1E, 0xFF });
    }
}

public class HardwareBridge
{
    private HttpListener? _listener;
    private Thread? _thread;
    private bool _running;

    public void Start(int port)
    {
        _listener = new HttpListener();
        _listener.Prefixes.Add("http://localhost:" + port + "/");
        _listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
        _listener.Start();
        _running = true;

        _thread = new Thread(ListenLoop) { IsBackground = true };
        _thread.Start();
    }

    public void Stop()
    {
        _running = false;
        _listener?.Stop();
    }

    private void ListenLoop()
    {
        while (_running)
        {
            try
            {
                if (_listener == null) break;
                HttpListenerContext ctx = _listener.GetContext();
                ThreadPool.QueueUserWorkItem((o) => HandleRequest(ctx));
            }
            catch { }
        }
    }

    private void HandleRequest(HttpListenerContext ctx)
    {
        HttpListenerResponse resp = ctx.Response;
        resp.AddHeader("Access-Control-Allow-Origin", "*");
        resp.AddHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        resp.AddHeader("Access-Control-Allow-Headers", "Content-Type, X-Printer-Type, X-Printer-Ip, X-Printer-Port, X-Com-Port, X-Com-Baud");

        if (ctx.Request.HttpMethod == "OPTIONS")
        {
            resp.StatusCode = 200;
            resp.Close();
            return;
        }

        try
        {
            string path = ctx.Request.Url?.AbsolutePath ?? "";
            if (path == "/status")
            {
                Respond(resp, 200, "{\"status\":\"active\",\"sdk\":\"ZyPrinter.dll\",\"version\":\"1.0\"}");
            }
            else if (path == "/open-drawer" && ctx.Request.HttpMethod == "POST")
            {
                bool ok = ZyPrinter.KickDrawerUsb();
                Respond(resp, 200, ok ? "{\"success\":true}" : "{\"success\":false}");
            }
            else if (path == "/print" && ctx.Request.HttpMethod == "POST")
            {
                byte[] data;
                using (MemoryStream ms = new MemoryStream())
                {
                    ctx.Request.InputStream.CopyTo(ms);
                    data = ms.ToArray();
                }
                bool ok = ZyPrinter.SendUsb(data);
                Respond(resp, 200, ok ? "{\"success\":true}" : "{\"success\":false}");
            }
            else
            {
                Respond(resp, 404, "{\"error\":\"Not found\"}");
            }
        }
        catch (Exception ex)
        {
            Respond(resp, 500, "{\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}");
        }
    }

    private void Respond(HttpListenerResponse resp, int status, string json)
    {
        resp.StatusCode = status;
        resp.ContentType = "application/json";
        byte[] buf = Encoding.UTF8.GetBytes(json);
        resp.OutputStream.Write(buf, 0, buf.Length);
        resp.Close();
    }
}
