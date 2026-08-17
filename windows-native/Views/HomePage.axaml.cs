using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Models;
using NovaPOS.Desktop.Services;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

public partial class HomePage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    public HomePage()
    {
        InitializeComponent();
    }

    public async void OnNavigate()
    {
        if (ParentWindow == null) return;
        var api = ParentWindow.Api;

        LblGreeting.Text = Greeting() + ",";
        LblName.Text = string.IsNullOrWhiteSpace(api.DisplayName) ? "there" : api.DisplayName;
        LblTenant.Text = string.IsNullOrWhiteSpace(api.TenantName) ? "—" : api.TenantName;
        LblEmail.Text = string.IsNullOrWhiteSpace(api.UserEmail) ? "—" : api.UserEmail;

        try
        {
            var snap = await api.GetDashboardAsync();
            Render(snap, api);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Dashboard load failed: " + ex.Message);
        }
    }

    private static string Greeting()
    {
        int hour = DateTime.Now.Hour;
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    }

    private void Render(DashboardSnapshot snap, ApiService api)
    {
        LblRevenue.Text = api.Money(snap.TodayRevenue);
        LblRevenueMeta.Text =
            $"{snap.CompletedToday} order{(snap.CompletedToday == 1 ? "" : "s")} completed" +
            $"  ·  {api.Money(snap.AvgTicket)} avg ticket";

        // Trend pill: white for growth, brand red for decline (same as web).
        if (snap.RevenueChangePct != 0)
        {
            bool up = snap.RevenueChangePct > 0;
            TrendPill.IsVisible = true;
            TrendPill.Background = Ui.Brush(up ? "White10Brush" : "Brand15Brush");
            IcoTrend.Data = Ui.Glyph(up ? "TrendingUp" : "TrendingDown");
            IcoTrend.Foreground = Ui.Brush(up ? "WhiteBrush" : "BrandBrush");
            LblTrend.Text = Math.Abs(snap.RevenueChangePct) + "%";
            LblTrend.Foreground = Ui.Brush(up ? "WhiteBrush" : "BrandBrush");
        }
        else
        {
            TrendPill.IsVisible = false;
        }

        BuildMiniStats(snap);
        BuildActiveOrders(snap, api);
        BuildTopSellers(snap);
        BuildRecentOrders(snap, api);
    }

    // ── Hairline mini-stat column ───────────────────────────────────────────
    private void BuildMiniStats(DashboardSnapshot snap)
    {
        MiniStats.Children.Clear();

        var rows = new (string Icon, string Label, string Value, bool Accent)[]
        {
            ("Receipt", "ORDERS TODAY", snap.OrdersToday.ToString(), false),
            ("Clock", "PENDING", snap.PendingCount.ToString(), snap.PendingCount > 0),
            ("Users", "CUSTOMERS", snap.Customers.ToString(), false)
        };

        for (int i = 0; i < rows.Length; i++)
        {
            var (icon, label, value, accent) = rows[i];

            if (i > 0)
                MiniStats.Children.Add(Ui.Hairline());

            var grid = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Margin = new Thickness(34, 22, 34, 22)
            };

            var left = Ui.Row(10,
                Ui.Ico(icon, 16, "White40Brush"),
                Ui.Text(label, 11, "White40Brush", FontWeight.Medium, 2.0));
            grid.Children.Add(left);

            var figure = Ui.Num(value, 24, accent ? "BrandBrush" : "WhiteBrush");
            Grid.SetColumn(figure, 1);
            grid.Children.Add(figure);

            MiniStats.Children.Add(grid);
        }
    }

    // ── Active orders ───────────────────────────────────────────────────────
    private void BuildActiveOrders(DashboardSnapshot snap, ApiService api)
    {
        LblActiveCount.Text = snap.PendingCount.ToString();
        ActiveOrdersBody.Children.Clear();

        if (snap.ActiveOrders.Count == 0)
        {
            ActiveOrdersBody.Children.Add(Ui.EmptyLine("Floor is quiet — no active orders"));
            return;
        }

        var list = snap.ActiveOrders.Take(5).ToList();
        for (int i = 0; i < list.Count; i++)
        {
            if (i > 0) ActiveOrdersBody.Children.Add(Ui.Hairline());

            var order = list[i];
            var grid = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Margin = new Thickness(0, 11, 0, 11)
            };

            string title = !string.IsNullOrWhiteSpace(order.CustomerName)
                ? order.CustomerName
                : PrettyOrderType(order.OrderType);

            var titleRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
            titleRow.Children.Add(Ui.Text(title, 13, "WhiteBrush", FontWeight.Medium));
            if (!string.IsNullOrWhiteSpace(order.TableNumber))
                titleRow.Children.Add(Ui.Text("· " + order.TableNumber, 13, "White35Brush"));

            var metaRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
            metaRow.Children.Add(Ui.Text(order.ClockTime, 11, "White35Brush"));
            metaRow.Children.Add(Ui.Text("·", 11, "White20Brush"));
            metaRow.Children.Add(Ui.Text(Capitalise(order.Status), 11, "Brand85Brush"));

            var col = Ui.Col(3, titleRow, metaRow);
            grid.Children.Add(col);

            var total = Ui.Num(api.Money(order.Payable), 13, "WhiteBrush");
            Grid.SetColumn(total, 1);
            grid.Children.Add(total);

            ActiveOrdersBody.Children.Add(grid);
        }
    }

    // ── Top sellers (popularity bars) ───────────────────────────────────────
    private void BuildTopSellers(DashboardSnapshot snap)
    {
        TopSellersBody.Children.Clear();

        if (snap.TopItems.Count == 0)
        {
            TopSellersBody.Children.Add(Ui.EmptyLine("No sales yet today"));
            return;
        }

        int max = snap.TopItems.Max(i => i.Quantity);
        if (max <= 0) max = 1;

        for (int i = 0; i < snap.TopItems.Count; i++)
        {
            var item = snap.TopItems[i];
            double fraction = Math.Max(0.08, (double)item.Quantity / max);

            var bar = new Border
            {
                Background = Ui.Brush("Brand12Brush"),
                CornerRadius = new CornerRadius(8),
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 2, 0, 2)
            };

            var barHost = new Grid { Height = 38 };
            barHost.Children.Add(bar);

            // Width is a fraction of the panel, resolved on layout.
            barHost.SizeChanged += (_, e) => bar.Width = e.NewSize.Width * fraction;

            var content = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Margin = new Thickness(10, 0, 10, 0)
            };

            var left = Ui.Row(10,
                Ui.Num((i + 1).ToString(), 12, "BrandBrush", FontWeight.Bold),
                Ui.Text(item.Name, 13, "WhiteBrush"));
            content.Children.Add(left);

            var qty = Ui.Num(item.Quantity + "×", 12, "White50Brush", FontWeight.Normal);
            Grid.SetColumn(qty, 1);
            content.Children.Add(qty);

            barHost.Children.Add(content);
            TopSellersBody.Children.Add(barHost);
        }
    }

    // ── Recent orders (two columns, like the web grid) ──────────────────────
    private void BuildRecentOrders(DashboardSnapshot snap, ApiService api)
    {
        RecentOrdersBody.Children.Clear();

        if (snap.RecentOrders.Count == 0)
        {
            RecentOrdersBody.Children.Add(Ui.EmptyLine("No orders today"));
            return;
        }

        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,40,*") };
        var left = new StackPanel();
        var right = new StackPanel();
        Grid.SetColumn(right, 2);
        grid.Children.Add(left);
        grid.Children.Add(right);

        for (int i = 0; i < snap.RecentOrders.Count; i++)
        {
            var target = i % 2 == 0 ? left : right;
            target.Children.Add(RecentOrderRow(snap.RecentOrders[i], api));
        }

        RecentOrdersBody.Children.Add(grid);
    }

    private static Border RecentOrderRow(OrderRecord order, ApiService api)
    {
        var row = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Margin = new Thickness(0, 10, 0, 10)
        };

        string title = !string.IsNullOrWhiteSpace(order.CustomerName)
            ? order.CustomerName
            : PrettyOrderType(order.OrderType);

        var left = Ui.Row(12,
            Ui.Dot(StatusDotBrush(order.Status), 10),
            Ui.Col(2,
                Ui.Text(title, 13, "WhiteBrush"),
                Ui.Text(order.ClockTime, 11, "White35Brush")));
        row.Children.Add(left);

        var total = Ui.Num(api.Money(order.Payable), 13, "WhiteBrush", FontWeight.Medium);
        Grid.SetColumn(total, 1);
        row.Children.Add(total);

        return new Border
        {
            BorderBrush = Ui.Brush("White05Brush"),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = row
        };
    }

    private static string StatusDotBrush(string status) => status switch
    {
        "ready" => "WhiteBrush",
        "completed" => "White40Brush",
        "cancelled" => "Brand40Brush",
        _ => "BrandBrush"
    };

    private static string PrettyOrderType(string type) => type switch
    {
        "dine_in" => "Dine in",
        "takeaway" => "Takeaway",
        "delivery" => "Delivery",
        _ => string.IsNullOrWhiteSpace(type) ? "Order" : Capitalise(type)
    };

    private static string Capitalise(string value) =>
        string.IsNullOrEmpty(value) ? value : char.ToUpperInvariant(value[0]) + value[1..];

    // ── Navigation ──────────────────────────────────────────────────────────
    private void OnViewAllOrders(object? sender, RoutedEventArgs e) => ParentWindow?.ShowPage("orders");

    // ── Hardware diagnostics ────────────────────────────────────────────────
    // Both buttons act on the transport saved in hardware settings, not USB only,
    // so the dashboard reflects however this till is actually wired.
    private async void OnTestPrint(object? sender, RoutedEventArgs e)
    {
        BtnTestPrint.IsEnabled = false;
        string original = LblTestPrint.Text ?? "Test receipt print";

        var target = PrinterService.Target;
        string tenant = ParentWindow?.Api.TenantName ?? "NovaPOS";

        var result = await BillPrinter.PrintTestSlipAsync(tenant, target);

        LblTestPrint.Text = result.Success ? "Receipt sent" : "Printer not detected";
        if (!result.Success && result.Error != null) ToastHost.Error(result.Error);

        await Task.Delay(1800);
        LblTestPrint.Text = original;
        BtnTestPrint.IsEnabled = true;
    }

    private async void OnKickDrawer(object? sender, RoutedEventArgs e)
    {
        BtnKickDrawer.IsEnabled = false;
        string original = LblKickDrawer.Text ?? "Kick cash drawer";

        bool ok = await BillPrinter.OpenDrawerAsync(PrinterService.Target);

        LblKickDrawer.Text = ok ? "Drawer opened" : "Drawer not detected";
        if (!ok && PrinterService.LastError != null) ToastHost.Error(PrinterService.LastError);

        await Task.Delay(1800);
        LblKickDrawer.Text = original;
        BtnKickDrawer.IsEnabled = true;
    }
}
