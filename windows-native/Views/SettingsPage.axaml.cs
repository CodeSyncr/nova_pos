using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;
using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Services;
using System;
using System.Globalization;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

/// <summary>
/// Printer and hardware configuration. Edits a working copy of
/// <see cref="PrinterTarget"/> and only commits it on save, so a half-typed IP
/// address never reaches a live print job.
/// </summary>
public partial class SettingsPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    private PrinterTransport _transport = PrinterTransport.Usb;
    private int _charWidth = 48;
    private bool _busy;

    public SettingsPage()
    {
        InitializeComponent();
    }

    public void OnNavigate()
    {
        LoadFrom(PrinterService.Target);
        RefreshSdkCard();
        RefreshBridgeBadge();
    }

    // ── Loading ────────────────────────────────────────────────────────────
    private void LoadFrom(PrinterTarget target)
    {
        _transport = target.Transport;
        _charWidth = target.CharWidth >= 48 ? 48 : 32;

        TxtIp.Text = target.Ip;
        TxtPort.Text = target.Port.ToString(CultureInfo.InvariantCulture);
        TxtCom.Text = target.ComPort.ToString(CultureInfo.InvariantCulture);
        TxtBaud.Text = target.ComBaud.ToString(CultureInfo.InvariantCulture);
        TxtLpt.Text = target.LptName;
        TxtBtCom.Text = target.BtComPort;
        TxtBtBaud.Text = target.BtBaud.ToString(CultureInfo.InvariantCulture);
        TxtSpoolerName.Text = target.SpoolerName;

        TxtVid.Text = target.UsbVid > 0 ? target.UsbVid.ToString("X4") : "";
        TxtPid.Text = target.UsbPid > 0 ? target.UsbPid.ToString("X4") : "";

        ChkAutoPlace.IsChecked = target.AutoPrintOnPlace;
        ChkAutoComplete.IsChecked = target.AutoPrintOnComplete;
        ChkDrawer.IsChecked = target.KickDrawerOnCash;

        ChkBridge.IsChecked = target.BridgeEnabled;
        TxtBridgePort.Text = target.BridgePort.ToString(CultureInfo.InvariantCulture);

        RenderTransport();
        RenderPaper();
    }

    /// <summary>Reads the form into a target, keeping unparsable fields at their saved value.</summary>
    private PrinterTarget Collect()
    {
        var target = PrinterService.Target.Clone();

        target.Transport = _transport;
        target.CharWidth = _charWidth;

        if (!string.IsNullOrWhiteSpace(TxtIp.Text)) target.Ip = TxtIp.Text.Trim();
        if (TryInt(TxtPort.Text, out int port) && port is > 0 and <= 65535) target.Port = port;
        if (TryInt(TxtCom.Text, out int com) && com > 0) target.ComPort = com;
        if (TryInt(TxtBaud.Text, out int baud) && baud > 0) target.ComBaud = baud;
        if (!string.IsNullOrWhiteSpace(TxtLpt.Text)) target.LptName = TxtLpt.Text.Trim();
        if (!string.IsNullOrWhiteSpace(TxtBtCom.Text)) target.BtComPort = TxtBtCom.Text.Trim();
        if (TryInt(TxtBtBaud.Text, out int btBaud) && btBaud > 0) target.BtBaud = btBaud;
        if (!string.IsNullOrWhiteSpace(TxtSpoolerName.Text)) target.SpoolerName = TxtSpoolerName.Text.Trim();

        target.UsbVid = TryHex(TxtVid.Text, out int vid) ? vid : 0;
        target.UsbPid = TryHex(TxtPid.Text, out int pid) ? pid : 0;

        target.AutoPrintOnPlace = ChkAutoPlace.IsChecked == true;
        target.AutoPrintOnComplete = ChkAutoComplete.IsChecked == true;
        target.KickDrawerOnCash = ChkDrawer.IsChecked == true;

        target.BridgeEnabled = ChkBridge.IsChecked == true;
        if (TryInt(TxtBridgePort.Text, out int bridgePort) && bridgePort is > 0 and <= 65535)
            target.BridgePort = bridgePort;

        return target;
    }

    private static bool TryInt(string? text, out int value)
        => int.TryParse((text ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out value);

    private static bool TryHex(string? text, out int value)
    {
        value = 0;
        string raw = (text ?? "").Trim().TrimStart('0', 'x', 'X');
        if (raw.Length == 0) return false;

        return int.TryParse(raw, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out value) && value > 0;
    }

    // ── Transport + paper pickers ──────────────────────────────────────────
    private void OnPickUsb(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.Usb);

    private void OnPickNetwork(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.Network);

    private void OnPickSerial(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.Serial);

    private void OnPickParallel(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.Parallel);

    private void OnPickBluetooth(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.Bluetooth);

    private void OnPickSpooler(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.WindowsSpooler);

    private void SetTransport(PrinterTransport transport)
    {
        _transport = transport;
        RenderTransport();
    }

    private void RenderTransport()
    {
        Activate(BtnUsb, _transport == PrinterTransport.Usb);
        Activate(BtnNet, _transport == PrinterTransport.Network);
        Activate(BtnSerial, _transport == PrinterTransport.Serial);
        Activate(BtnParallel, _transport == PrinterTransport.Parallel);
        Activate(BtnBluetooth, _transport == PrinterTransport.Bluetooth);
        Activate(BtnSpooler, _transport == PrinterTransport.WindowsSpooler);

        PanelUsb.IsVisible = _transport == PrinterTransport.Usb;
        PanelNet.IsVisible = _transport == PrinterTransport.Network;
        PanelSerial.IsVisible = _transport == PrinterTransport.Serial;
        PanelParallel.IsVisible = _transport == PrinterTransport.Parallel;
        PanelBluetooth.IsVisible = _transport == PrinterTransport.Bluetooth;
        PanelSpooler.IsVisible = _transport == PrinterTransport.WindowsSpooler;
    }

    private void OnPick80(object? sender, RoutedEventArgs e)
    {
        _charWidth = 48;
        RenderPaper();
    }

    private void OnPick58(object? sender, RoutedEventArgs e)
    {
        _charWidth = 32;
        RenderPaper();
    }

    private void RenderPaper()
    {
        Activate(BtnPaper80, _charWidth >= 48);
        Activate(BtnPaper58, _charWidth < 48);
    }

    private static void Activate(Button button, bool active)
    {
        if (active) button.Classes.Add("active");
        else button.Classes.Remove("active");
    }

    // ── Status cards ───────────────────────────────────────────────────────
    private void RefreshSdkCard()
    {
        bool ok = PrinterService.SdkAvailable;

        LblSdkTitle.Text = ok ? "Printer SDK ready" : "Printer SDK unavailable";
        LblSdkDetail.Text = PrinterService.SdkStatus;
        LblSdkBadge.Text = ok ? "LOADED" : "ERROR";

        SdkBadge.Background = Ui.Brush(ok ? "White15Brush" : "Brand20Brush");
        LblSdkBadge.Foreground = Ui.Brush(ok ? "Emerald400Brush" : "BrandBrush");
        IcoSdk.Foreground = Ui.Brush(ok ? "Emerald400Brush" : "BrandBrush");
        IcoSdk.Data = Ui.Glyph(ok ? "Usb" : "TriangleAlert");
    }

    private void RefreshBridgeBadge()
    {
        var bridge = ParentWindow?.Bridge;
        bool running = bridge?.IsRunning == true;

        LblBridge.Text = running ? "LISTENING · " + bridge!.Port : "STOPPED";
        BridgeBadge.Background = Ui.Brush(running ? "White15Brush" : "White10Brush");
        LblBridge.Foreground = Ui.Brush(running ? "Emerald400Brush" : "White70Brush");
    }

    // ── Actions ────────────────────────────────────────────────────────────
    private void OnSave(object? sender, RoutedEventArgs e)
    {
        var target = Collect();
        PrinterService.Save(target);

        // The bridge may have been switched on, off, or moved to another port.
        ParentWindow?.ApplyBridgeSettings();

        LoadFrom(PrinterService.Target);
        RefreshBridgeBadge();

        ToastHost.Success("Hardware settings saved · " + target.Describe());
    }

    private async void OnTestPrint(object? sender, RoutedEventArgs e)
    {
        var target = Collect();
        string tenant = ParentWindow?.Api.TenantName ?? "NovaPOS";

        await RunAsync(BtnTest, LblTest, "Printing…", "Test print",
            () => BillPrinter.PrintTestSlipAsync(tenant, target),
            "Test slip sent to " + target.Describe(),
            "Test print failed");
    }

    private async void OnOpenDrawer(object? sender, RoutedEventArgs e)
    {
        var target = Collect();

        await RunAsync(BtnDrawer, LblDrawer, "Opening…", "Open drawer",
            async () =>
            {
                bool ok = await BillPrinter.OpenDrawerAsync(target);
                return ok ? PrintResult.Ok : PrintResult.Fail(PrinterService.LastError ?? "The drawer did not respond.");
            },
            "Cash drawer pulse sent",
            "Could not open the drawer");
    }

    private async void OnProbe(object? sender, RoutedEventArgs e)
    {
        var target = Collect();

        await RunAsync(BtnProbe, LblProbe, "Checking…", "Check connection",
            () => BillPrinter.ProbeAsync(target),
            target.Describe() + " responded",
            "No response from " + target.Describe());

        RefreshSdkCard();
    }

    /// <summary>
    /// Runs one hardware action with a busy label, so a printer that takes the full
    /// open timeout to fail doesn't look like a frozen window.
    /// </summary>
    private async Task RunAsync(
        Button button,
        TextBlock label,
        string busyText,
        string idleText,
        Func<Task<PrintResult>> action,
        string successMessage,
        string failurePrefix)
    {
        if (_busy) return;

        _busy = true;
        button.IsEnabled = false;
        label.Text = busyText;

        try
        {
            var result = await action();

            if (result.Success) ToastHost.Success(successMessage);
            else ToastHost.Error(string.IsNullOrWhiteSpace(result.Error)
                ? failurePrefix
                : failurePrefix + ": " + result.Error);
        }
        catch (Exception ex)
        {
            ToastHost.Error(failurePrefix + ": " + ex.Message);
        }
        finally
        {
            label.Text = idleText;
            button.IsEnabled = true;
            _busy = false;
        }
    }
}
