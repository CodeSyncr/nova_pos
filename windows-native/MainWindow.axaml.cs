using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Services;

namespace NovaPOS.Desktop;

public partial class MainWindow : Window
{
    private const double RailCollapsed = 76;
    private const double RailExpanded = 288;

    public ApiService Api { get; } = new();

    /// <summary>
    /// Local print bridge for the web app. Owned here so it lives exactly as long
    /// as the window and can be reconfigured from the hardware settings page.
    /// </summary>
    public HardwareBridge Bridge { get; } = new();

    private Button? _activeNav;

    public MainWindow()
    {
        InitializeComponent();

        PageLogin.ParentWindow = this;
        PageHome.ParentWindow = this;
        PagePOS.ParentWindow = this;
        PageOrders.ParentWindow = this;
        PageSettings.ParentWindow = this;

        Sidebar.IsVisible = false;
        SetActiveNav(BtnNavHome);

        // Function-key navigation: terminals are usually driven from the keyboard.
        AddHandler(KeyDownEvent, OnShellKeyDown, handledEventsToo: true);

        ApplyBridgeSettings();
        Closed += OnWindowClosed;
    }

    /// <summary>
    /// Starts, stops or moves the print bridge to match the saved printer settings.
    /// Called at startup and whenever those settings are saved.
    /// </summary>
    public void ApplyBridgeSettings()
    {
        var target = PrinterService.Target;

        if (!target.BridgeEnabled)
        {
            Bridge.Stop();
            return;
        }

        // Restart when the port moved; Start() is a no-op if it's already serving.
        if (Bridge.IsRunning && Bridge.Port != target.BridgePort) Bridge.Stop();

        if (!Bridge.Start(target.BridgePort) && Bridge.LastError != null)
        {
            ToastHost.Warning($"Print bridge could not open port {target.BridgePort}: {Bridge.LastError}");
        }
    }

    /// <summary>Releases the printer port and the SDK's socket layer on the way out.</summary>
    private void OnWindowClosed(object? sender, System.EventArgs e)
    {
        Bridge.Stop();
        PrinterService.Shutdown();
    }

    private void OnShellKeyDown(object? sender, KeyEventArgs e)
    {
        if (!Api.IsAuthenticated) return;

        switch (e.Key)
        {
            case Key.F1: ShowPage("home"); break;
            case Key.F2: ShowPage("pos"); break;
            case Key.F3: ShowPage("orders"); break;
            case Key.F4: ShowPage("settings"); break;
            default: return;
        }

        e.Handled = true;
    }

    // ── Rail hover expansion (matches the web sidebar's mouse-enter behaviour) ─
    private void OnSidebarEnter(object? sender, PointerEventArgs e) => SetRailExpanded(true);

    private void OnSidebarExit(object? sender, PointerEventArgs e) => SetRailExpanded(false);

    /// <summary>
    /// Labels are removed rather than clipped, the way the web rail drops its
    /// <c>span</c>s when collapsed — a half-cut glyph reads as a rendering bug.
    /// </summary>
    private void SetRailExpanded(bool expanded)
    {
        Sidebar.Width = expanded ? RailExpanded : RailCollapsed;

        BrandText.IsVisible = expanded;
        LblNavHome.IsVisible = expanded;
        LblNavPOS.IsVisible = expanded;
        LblNavOrders.IsVisible = expanded;
        LblNavSettings.IsVisible = expanded;
        LblStatus.IsVisible = expanded;
        LblLogout.IsVisible = expanded;
    }

    private void SetActiveNav(Button button)
    {
        _activeNav?.Classes.Remove("active");
        button.Classes.Add("active");
        _activeNav = button;
    }

    public void ShowPage(string page)
    {
        bool login = page == "login";

        PageLogin.IsVisible = login;
        Sidebar.IsVisible = !login;
        ContentArea.IsVisible = !login;

        PageHome.IsVisible = page == "home";
        PagePOS.IsVisible = page == "pos";
        PageOrders.IsVisible = page == "orders";
        PageSettings.IsVisible = page == "settings";

        switch (page)
        {
            case "home":
                SetActiveNav(BtnNavHome);
                PageHome.OnNavigate();
                break;
            case "pos":
                SetActiveNav(BtnNavPOS);
                PagePOS.OnNavigate();
                break;
            case "orders":
                SetActiveNav(BtnNavOrders);
                PageOrders.OnNavigate();
                break;
            case "settings":
                SetActiveNav(BtnNavSettings);
                PageSettings.OnNavigate();
                break;
        }
    }

    public void OnLoginSuccess()
    {
        LblCafe.Text = string.IsNullOrWhiteSpace(Api.TenantName)
            ? "pizzeria da cafe"
            : Api.TenantName.ToLowerInvariant();

        ShowPage("home");
    }

    private void OnNavHome(object? sender, RoutedEventArgs e) => Navigate("home");

    private void OnNavPOS(object? sender, RoutedEventArgs e) => Navigate("pos");

    private void OnNavOrders(object? sender, RoutedEventArgs e) => Navigate("orders");

    private void OnNavSettings(object? sender, RoutedEventArgs e) => Navigate("settings");

    private void Navigate(string page) => ShowPage(Api.IsAuthenticated ? page : "login");

    private void OnLogout(object? sender, RoutedEventArgs e)
    {
        Api.Logout();
        SetRailExpanded(false);
        ShowPage("login");
    }
}
