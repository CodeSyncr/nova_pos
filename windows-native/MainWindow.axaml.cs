using Avalonia.Controls;
using Avalonia.Interactivity;
using NovaPOS.Desktop.Services;

namespace NovaPOS.Desktop;

public partial class MainWindow : Window
{
    public ApiService Api { get; } = new();

    private Button? _activeNavBtn;

    public MainWindow()
    {
        InitializeComponent();
        PageLogin.ParentWindow = this;
        PageHome.ParentWindow = this;
        PagePOS.ParentWindow = this;
        PageOrders.ParentWindow = this;

        SetActiveNav(BtnNavLogin);
    }

    private void SetActiveNav(Button btn)
    {
        // Remove active class from previous
        if (_activeNavBtn != null)
            _activeNavBtn.Classes.Remove("active");

        btn.Classes.Add("active");
        _activeNavBtn = btn;
    }

    public void ShowPage(string page)
    {
        PageLogin.IsVisible = page == "login";
        PageHome.IsVisible = page == "home";
        PagePOS.IsVisible = page == "pos";
        PageOrders.IsVisible = page == "orders";

        switch (page)
        {
            case "login": SetActiveNav(BtnNavLogin); break;
            case "home": SetActiveNav(BtnNavHome); PageHome.OnNavigate(); break;
            case "pos": SetActiveNav(BtnNavPOS); PagePOS.OnNavigate(); break;
            case "orders": SetActiveNav(BtnNavOrders); PageOrders.OnNavigate(); break;
        }
    }

    public void OnLoginSuccess()
    {
        BtnNavLogin.IsVisible = false; // Hide login nav after auth
        ShowPage("home");
    }

    private void OnNavHome(object? sender, RoutedEventArgs e)
    {
        if (!Api.IsAuthenticated) { ShowPage("login"); return; }
        ShowPage("home");
    }

    private void OnNavPOS(object? sender, RoutedEventArgs e)
    {
        if (!Api.IsAuthenticated) { ShowPage("login"); return; }
        ShowPage("pos");
    }

    private void OnNavOrders(object? sender, RoutedEventArgs e)
    {
        if (!Api.IsAuthenticated) { ShowPage("login"); return; }
        ShowPage("orders");
    }

    private void OnNavLogin(object? sender, RoutedEventArgs e)
    {
        ShowPage("login");
    }
}
