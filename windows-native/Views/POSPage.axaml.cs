using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using NovaPOS.Desktop.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

public partial class POSPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    private List<MenuCategory> _categories = new();
    private List<PosMenuItem> _menuItems = new();
    private List<CartItem> _cart = new();
    private string? _selectedCategoryId;
    private string _orderType = "dine_in";

    public POSPage()
    {
        InitializeComponent();
        TxtSearch.GetObservable(TextBox.TextProperty).Subscribe(_ => RenderItems());
    }

    public async void OnNavigate()
    {
        if (ParentWindow == null) return;

        try
        {
            _categories = await ParentWindow.Api.GetCategoriesAsync();
            _menuItems = await ParentWindow.Api.GetMenuItemsAsync();

            var tables = await ParentWindow.Api.GetTablesAsync();
            CbTable.ItemsSource = tables.Select(t => t.Number).ToList();
            if (tables.Count > 0) CbTable.SelectedIndex = 0;

            RenderCategories();
            RenderItems();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Error in POS OnNavigate: " + ex.Message);
        }
    }

    private void RenderCategories()
    {
        CategoriesPanel.Children.Clear();

        // "All" button
        var allBtn = new Button { Content = "All", Classes = { "cat-pill" } };
        if (_selectedCategoryId == null) allBtn.Classes.Add("active");
        allBtn.Click += (_, _) => { _selectedCategoryId = null; RenderCategories(); RenderItems(); };
        CategoriesPanel.Children.Add(allBtn);

        foreach (var cat in _categories)
        {
            var catId = cat.Id;
            var btn = new Button { Content = cat.Name, Classes = { "cat-pill" } };
            if (_selectedCategoryId == catId) btn.Classes.Add("active");
            btn.Click += (_, _) => { _selectedCategoryId = catId; RenderCategories(); RenderItems(); };
            CategoriesPanel.Children.Add(btn);
        }
    }

    private void RenderItems()
    {
        ItemsPanel.Children.Clear();

        string query = (TxtSearch.Text ?? "").Trim().ToLower();
        var list = _menuItems.AsEnumerable();

        if (_selectedCategoryId != null)
            list = list.Where(i => i.CategoryId == _selectedCategoryId);
        if (!string.IsNullOrEmpty(query))
            list = list.Where(i => i.Name.ToLower().Contains(query));

        foreach (var item in list)
        {
            int cartQty = _cart.Where(c => c.Item.Id == item.Id).Sum(c => c.Quantity);

            // Card border
            var card = new Border
            {
                Width = 180,
                Height = 160,
                Background = new SolidColorBrush(Color.Parse("#101010")),
                BorderBrush = new SolidColorBrush(Color.Parse("#242424")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(16),
                Margin = new Thickness(6),
                Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
                ClipToBounds = true
            };

            var grid = new Grid();

            // Bottom gradient
            var gradientBg = new Border
            {
                VerticalAlignment = VerticalAlignment.Bottom,
                Height = 80,
                Background = new LinearGradientBrush
                {
                    StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
                    EndPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
                    GradientStops =
                    {
                        new GradientStop(Color.FromArgb(0, 0, 0, 0), 0),
                        new GradientStop(Color.FromArgb(200, 0, 0, 0), 1)
                    }
                }
            };
            grid.Children.Add(gradientBg);

            // Name + Price at bottom left
            var infoPanel = new StackPanel
            {
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(14, 0, 50, 14),
                Spacing = 2
            };

            infoPanel.Children.Add(new TextBlock
            {
                Text = item.Name,
                FontSize = 12,
                FontWeight = FontWeight.SemiBold,
                Foreground = Brushes.White,
                TextWrapping = TextWrapping.Wrap,
                MaxLines = 2
            });

            infoPanel.Children.Add(new TextBlock
            {
                Text = $"₹{item.BasePrice:F0}",
                FontSize = 13,
                FontWeight = FontWeight.Bold,
                Foreground = Brushes.White
            });

            grid.Children.Add(infoPanel);

            // + button or quantity badge (bottom right)
            if (cartQty > 0)
            {
                var badge = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(160, 0, 0, 0)),
                    CornerRadius = new CornerRadius(100),
                    Padding = new Thickness(10, 4),
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Bottom,
                    Margin = new Thickness(0, 0, 10, 14),
                    Child = new TextBlock
                    {
                        Text = cartQty.ToString(),
                        Foreground = Brushes.White,
                        FontSize = 12,
                        FontWeight = FontWeight.SemiBold,
                        HorizontalAlignment = HorizontalAlignment.Center
                    }
                };
                grid.Children.Add(badge);
            }
            else
            {
                var addBtn = new Border
                {
                    Background = new SolidColorBrush(Color.Parse("#E0342A")),
                    CornerRadius = new CornerRadius(100),
                    Width = 30, Height = 30,
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Bottom,
                    Margin = new Thickness(0, 0, 10, 14),
                    Child = new TextBlock
                    {
                        Text = "+",
                        Foreground = Brushes.White,
                        FontSize = 16,
                        FontWeight = FontWeight.Bold,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    }
                };
                grid.Children.Add(addBtn);
            }

            card.Child = grid;

            // Click handler
            var capturedItem = item;
            card.PointerPressed += (_, _) => AddToCart(capturedItem);

            ItemsPanel.Children.Add(card);
        }
    }

    private void AddToCart(PosMenuItem item)
    {
        var existing = _cart.FirstOrDefault(c => c.Item.Id == item.Id);
        if (existing != null)
            existing.Quantity++;
        else
            _cart.Add(new CartItem { Item = item, Quantity = 1 });

        RefreshCart();
        RenderItems(); // update qty badges
    }

    private void RefreshCart()
    {
        var items = _cart.Select(c =>
            $"{c.Item.Name}  x{c.Quantity}  ₹{c.LineTotal:F0}").ToList();
        CartList.ItemsSource = items;

        decimal total = _cart.Sum(c => c.LineTotal);
        LblTotal.Text = $"₹{total:N0}";
        LblCartCount.Text = $"{_cart.Sum(c => c.Quantity)} items";
    }

    // Order type tab handlers
    private void OnSelectDineIn(object? s, RoutedEventArgs e) => SetOrderType("dine_in");
    private void OnSelectTakeaway(object? s, RoutedEventArgs e) => SetOrderType("takeaway");
    private void OnSelectDelivery(object? s, RoutedEventArgs e) => SetOrderType("delivery");

    private void SetOrderType(string type)
    {
        _orderType = type;
        BtnDineIn.Classes.Remove("active");
        BtnTakeaway.Classes.Remove("active");
        BtnDelivery.Classes.Remove("active");

        switch (type)
        {
            case "dine_in": BtnDineIn.Classes.Add("active"); break;
            case "takeaway": BtnTakeaway.Classes.Add("active"); break;
            case "delivery": BtnDelivery.Classes.Add("active"); break;
        }

        TableSection.IsVisible = type == "dine_in";
    }

    private async void OnPlaceOrder(object? sender, RoutedEventArgs e)
    {
        if (ParentWindow == null || _cart.Count == 0) return;

        try
        {
            string tableId = CbTable.SelectedItem?.ToString() ?? "1";
            string custName = TxtCustName.Text ?? "Walk-in";
            string custPhone = TxtCustPhone.Text ?? "";

            var jsonItems = _cart.Select(c =>
                $"{{\"id\":\"{c.Item.Id}\",\"name\":\"{c.Item.Name}\",\"price\":\"{c.Item.BasePrice}\",\"quantity\":{c.Quantity}}}");
            string itemsJson = "[" + string.Join(",", jsonItems) + "]";

            BtnPlaceOrder.IsEnabled = false;
            BtnPlaceOrder.Content = "Placing...";

            var result = await ParentWindow.Api.PlaceOrderAsync(tableId, custName, custPhone, _orderType, itemsJson);

            if (result.success)
            {
                _cart.Clear();
                RefreshCart();
                RenderItems();
                BtnPlaceOrder.Content = "Order Placed ✓";
                await Task.Delay(1500);
            }
            else
            {
                BtnPlaceOrder.Content = "Error: " + result.error;
                await Task.Delay(2000);
            }
        }
        catch (Exception ex)
        {
            BtnPlaceOrder.Content = "Error: " + ex.Message;
            await Task.Delay(2000);
        }
        finally
        {
            BtnPlaceOrder.Content = "Place POS Order";
            BtnPlaceOrder.IsEnabled = true;
        }
    }
}
