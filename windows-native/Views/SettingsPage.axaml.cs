using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;
using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Services;
using System;
using System.Globalization;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

public partial class SettingsPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    private PrinterTransport _transport = PrinterTransport.Usb;
    private int _charWidth = 48;
    private bool _busy;
    private string _activeTab = "printer";

    public SettingsPage()
    {
        InitializeComponent();

        SliderTouchThreshold.PropertyChanged += (s, e) =>
        {
            if (e.Property == Slider.ValueProperty && e.NewValue is double val)
            {
                TxtTouchThreshold.Text = Math.Round(val).ToString(CultureInfo.InvariantCulture);
            }
        };

        JoystickService.ActionTriggered += OnJoystickAction;
        JoystickService.StatusChanged += OnJoystickStatusChanged;
    }

    public void OnNavigate()
    {
        LoadFrom(PrinterService.Target);
        LoadTouchSettings();
        LoadJoystickSettings();
        LoadAccountInfo();

        RefreshSdkCard();
        RefreshBridgeBadge();
        SwitchTab("printer");
    }

    // ── Tab Navigation ──────────────────────────────────────────────────────
    private void OnSelectPrinterTab(object? sender, RoutedEventArgs e) => SwitchTab("printer");
    private void OnSelectTouchTab(object? sender, RoutedEventArgs e) => SwitchTab("touch");
    private void OnSelectJoystickTab(object? sender, RoutedEventArgs e) => SwitchTab("joystick");
    private void OnSelectAccountTab(object? sender, RoutedEventArgs e) => SwitchTab("account");

    private void SwitchTab(string tab)
    {
        _activeTab = tab;

        Activate(BtnTabPrinter, tab == "printer");
        Activate(BtnTabTouch, tab == "touch");
        Activate(BtnTabJoystick, tab == "joystick");
        Activate(BtnTabAccount, tab == "account");

        SectionPrinter.IsVisible = tab == "printer";
        SectionTouch.IsVisible = tab == "touch";
        SectionJoystick.IsVisible = tab == "joystick";
        SectionAccount.IsVisible = tab == "account";
    }

    // ── Loading ────────────────────────────────────────────────────────────
    private void LoadFrom(PrinterTarget target)
    {
        _transport = target.Transport;
        _charWidth = target.CharWidth >= 48 ? 48 : 32;

        TxtBtCom.Text = target.BtComPort;
        TxtBtBaud.Text = target.BtBaud.ToString(CultureInfo.InvariantCulture);

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

    private void LoadTouchSettings()
    {
        var touch = TouchSettings.Current;
        SliderTouchThreshold.Value = touch.DragThreshold;
        TxtTouchThreshold.Text = touch.DragThreshold.ToString(CultureInfo.InvariantCulture);
        ChkTouchOptimize.IsChecked = touch.EnableTouchOptimization;
    }

    private void LoadJoystickSettings()
    {
        var js = JoystickService.Current;
        ChkJoystickEnable.IsChecked = js.Enabled;
        LblJoystickStatus.Text = JoystickService.ControllerName;
    }

    private void LoadAccountInfo()
    {
        if (ParentWindow != null)
        {
            LblAccountTenant.Text = string.IsNullOrWhiteSpace(ParentWindow.Api.TenantName)
                ? "Pizzeria Da Cafe"
                : ParentWindow.Api.TenantName;
            LblAccountUser.Text = ParentWindow.Api.UserEmail;
        }
    }

    private void OnJoystickAction(JoystickAction action)
    {
        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
        {
            LblLastJoystickAction.Text = action.ToString();
        });
    }

    private void OnJoystickStatusChanged(string status)
    {
        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
        {
            LblJoystickStatus.Text = status;
        });
    }

    private void OnLogoutFromSettings(object? sender, RoutedEventArgs e)
    {
        if (ParentWindow != null)
        {
            ParentWindow.Api.Logout();
            ParentWindow.ShowPage("login");
            ToastHost.Success("Logged out of POS terminal");
        }
    }

    // ── Collecting ─────────────────────────────────────────────────────────
    private PrinterTarget CollectPrinter()
    {
        var target = PrinterService.Target.Clone();

        target.Transport = _transport;
        target.CharWidth = _charWidth;

        if (!string.IsNullOrWhiteSpace(TxtBtCom.Text)) target.BtComPort = TxtBtCom.Text.Trim();
        if (TryInt(TxtBtBaud.Text, out int btBaud) && btBaud > 0) target.BtBaud = btBaud;

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

    private void CollectAndSaveTouch()
    {
        double thresh = 12.0;
        if (double.TryParse(TxtTouchThreshold.Text, NumberStyles.Float, CultureInfo.InvariantCulture, out double parsed))
            thresh = Math.Clamp(parsed, 4.0, 40.0);

        TouchSettings.Save(new TouchConfig
        {
            DragThreshold = thresh,
            EnableTouchOptimization = ChkTouchOptimize.IsChecked == true
        });
    }

    private void CollectAndSaveJoystick()
    {
        JoystickService.Save(new JoystickConfig
        {
            Enabled = ChkJoystickEnable.IsChecked == true
        });
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
    private void OnPickBluetooth(object? sender, RoutedEventArgs e) => SetTransport(PrinterTransport.Bluetooth);

    private void SetTransport(PrinterTransport transport)
    {
        _transport = transport;
        RenderTransport();
    }

    private void RenderTransport()
    {
        Activate(BtnUsb, _transport != PrinterTransport.Bluetooth);
        Activate(BtnBluetooth, _transport == PrinterTransport.Bluetooth);

        PanelUsb.IsVisible = _transport != PrinterTransport.Bluetooth;
        PanelBluetooth.IsVisible = _transport == PrinterTransport.Bluetooth;
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

    // ── Diagnostics + saving ───────────────────────────────────────────────
    private void RefreshSdkCard()
    {
        bool ok = PrinterService.SdkAvailable;
        LblSdkTitle.Text = ok ? "ZyPrinter SDK (x86)" : "Printer SDK Warning";
        LblSdkDetail.Text = PrinterService.SdkStatus;

        SdkCard.Background = Ui.Brush(ok ? "White03Brush" : "Red08Brush");
        SdkCard.BorderBrush = Ui.Brush(ok ? "White08Brush" : "Red20Brush");

        LblSdkBadge.Text = ok ? "READY" : "MISSING";
        LblSdkBadge.Foreground = Ui.Brush(ok ? "White70Brush" : "RedBrush");
        SdkBadge.Background = Ui.Brush(ok ? "White10Brush" : "Red20Brush");
    }

    private void RefreshBridgeBadge()
    {
        bool running = ParentWindow?.Bridge.IsRunning ?? false;
        LblBridge.Text = running ? $"RUNNING ON PORT {ParentWindow?.Bridge.Port}" : "STOPPED";
        LblBridge.Foreground = Ui.Brush(running ? "GreenBrush" : "White70Brush");
        BridgeBadge.Background = Ui.Brush(running ? "Green20Brush" : "White10Brush");
    }

    private async void OnTestPrint(object? sender, RoutedEventArgs e)
    {
        if (_busy) return;
        _busy = true;

        string tenant = ParentWindow?.Api.TenantName ?? "Pizzeria Da Cafe";
        PrinterTarget target = CollectPrinter();

        var result = await BillPrinter.PrintTestSlipAsync(tenant, target);
        if (result.Success) ToastHost.Success("Test slip printed");
        else ToastHost.Error(result.Error ?? "Could not print test slip");

        _busy = false;
    }

    private async void OnTestDrawer(object? sender, RoutedEventArgs e)
    {
        if (_busy) return;
        _busy = true;

        PrinterTarget target = CollectPrinter();
        bool ok = await BillPrinter.OpenDrawerAsync(target);
        if (ok) ToastHost.Success("Drawer kick pulse sent");
        else ToastHost.Error(PrinterService.LastError ?? "Could not open cash drawer");

        _busy = false;
    }

    private void OnSave(object? sender, RoutedEventArgs e)
    {
        PrinterTarget target = CollectPrinter();
        PrinterService.Save(target);

        CollectAndSaveTouch();
        CollectAndSaveJoystick();

        ParentWindow?.ApplyBridgeSettings();
        RefreshBridgeBadge();

        ToastHost.Success("Settings saved successfully");
    }
}
