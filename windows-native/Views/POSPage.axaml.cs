using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Models;
using NovaPOS.Desktop.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

public partial class POSPage : UserControl
{
    /// <summary>Decode width for menu artwork — roughly 2× the widest card.</summary>
    private const int ArtworkDecodeWidth = 460;

    public MainWindow? ParentWindow { get; set; }

    private List<MenuCategory> _categories = new();
    private List<PosMenuItem> _menuItems = new();
    private List<TableRecord> _tables = new();
    private readonly List<CartItem> _cart = new();

    private string? _selectedCategoryId;
    private string _orderType = "dine_in";
    private TableRecord? _selectedTable;
    private bool _loaded;
    private bool _placing;

    // Customisation sheet state
    private PosMenuItem? _modalItem;
    private MenuItemVariant? _modalVariant;
    private readonly List<ToppingOption> _modalToppings = new();
    private int _modalQty = 1;

    public POSPage()
    {
        InitializeComponent();
        TxtSearch.GetObservable(TextBox.TextProperty).Subscribe(_ => RenderItems());
        TxtAddOnSearch.GetObservable(TextBox.TextProperty).Subscribe(_ => OnAddOnQueryChanged());
        KeyDown += OnPageKeyDown;
    }

    private void OnPageKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && CustomiseOverlay.IsVisible)
        {
            CloseCustomise();
            e.Handled = true;
        }
    }

    public async void OnNavigate()
    {
        if (ParentWindow == null) return;
        var api = ParentWindow.Api;

        RefreshCart();

        if (_loaded)
        {
            // Only table occupancy can change while the app is open.
            _tables = await api.GetTablesAsync();
            RenderTables();
            return;
        }

        try
        {
            _categories = await api.GetCategoriesAsync();
            _menuItems = await api.GetMenuItemsAsync();
            _tables = await api.GetTablesAsync();

            // The web POS opens on the Pizza category when one exists.
            var pizza = _categories.FirstOrDefault(c => Regex.IsMatch(c.Name, "pizza", RegexOptions.IgnoreCase));
            _selectedCategoryId = pizza?.Id;

            _loaded = true;

            RenderCategories();
            RenderTables();
            RenderItems();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("POS load failed: " + ex.Message);
        }
    }

    // ── Categories ──────────────────────────────────────────────────────────
    private void RenderCategories()
    {
        CategoriesPanel.Children.Clear();
        CategoriesPanel.Children.Add(CategoryPill("All", null));

        foreach (var category in _categories)
            CategoriesPanel.Children.Add(CategoryPill(category.Name, category.Id));
    }

    private Button CategoryPill(string label, string? id)
    {
        var button = new Button { Content = label };
        button.Classes.Add("pill");
        if (_selectedCategoryId == id) button.Classes.Add("active");

        button.Click += (_, _) =>
        {
            _selectedCategoryId = id;
            RenderCategories();
            RenderItems();
        };

        return button;
    }

    // ── Menu cards ──────────────────────────────────────────────────────────
    private IEnumerable<PosMenuItem> VisibleItems()
    {
        string query = (TxtSearch.Text ?? "").Trim();
        IEnumerable<PosMenuItem> items = _menuItems;

        if (query.Length > 0)
        {
            // Searching spans every category, cheapest first — same as web.
            return items
                .Where(i => i.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .OrderBy(i => i.BasePrice);
        }

        if (_selectedCategoryId != null)
            items = items.Where(i => i.CategoryId == _selectedCategoryId);

        return items.OrderBy(i => i.BasePrice);
    }

    private void RenderItems()
    {
        ItemsPanel.Children.Clear();

        var items = VisibleItems().ToList();
        ItemsEmpty.IsVisible = items.Count == 0;
        ItemsScroller.IsVisible = items.Count > 0;

        foreach (var item in items)
            ItemsPanel.Children.Add(BuildMenuCard(item));
    }

    private Border BuildMenuCard(PosMenuItem item)
    {
        int quantity = _cart.Where(c => c.Item.Id == item.Id).Sum(c => c.Quantity);
        bool customisable = item.NeedsCustomisation;

        // Size and spacing are owned by the ResponsiveGrid so cards stretch to
        // fill the row, exactly like the CSS grid on web.
        var card = new Border
        {
            CornerRadius = new CornerRadius(16),
            BorderBrush = Ui.Brush(quantity > 0 ? "Brand40Brush" : "White08Brush"),
            BorderThickness = new Thickness(1),
            Background = Ui.Brush("White03Brush"),
            ClipToBounds = true,
            Cursor = new Cursor(StandardCursorType.Hand)
        };

        card.Transitions = new Transitions
        {
            new BrushTransition
            {
                Property = Border.BorderBrushProperty,
                Duration = TimeSpan.FromMilliseconds(150)
            }
        };

        var layers = new Panel();

        // Bundled placeholder shows instantly; the real photo fades in behind the
        // scrim once it has downloaded (mirrors MenuItemImage on web).
        var image = new Image
        {
            Stretch = Stretch.UniformToFill,
            Source = ImageCache.Placeholder
        };
        layers.Children.Add(image);
        LoadArtworkAsync(image, item.ImageUrl);

        layers.Children.Add(new Border { Background = Ui.Brush("CardScrimBrush") });

        // "customizable" chip, top-left — same hint the web card shows.
        if (customisable)
        {
            layers.Children.Add(new Border
            {
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(8, 8, 0, 0),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(6, 2, 6, 3),
                Background = Ui.Brush("Black45Brush"),
                Child = Ui.Text("customizable", 10, "White80Brush", FontWeight.Medium)
            });
        }

        var bottom = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(12, 0, 12, 12)
        };

        var name = new TextBlock
        {
            Text = item.Name,
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            Foreground = Brushes.White,
            TextWrapping = TextWrapping.Wrap,
            MaxLines = 2,
            TextTrimming = TextTrimming.CharacterEllipsis,
            LineHeight = 16
        };

        var price = Ui.Num(Money(item.BasePrice), 13, "WhiteBrush", FontWeight.Bold);
        price.Margin = new Thickness(0, 3, 0, 0);
        price.HorizontalAlignment = HorizontalAlignment.Left;

        var info = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 8, 0) };
        info.Children.Add(name);
        info.Children.Add(price);
        bottom.Children.Add(info);

        Control control = quantity > 0 ? BuildStepper(item, quantity) : BuildAddButton(item);
        control.VerticalAlignment = VerticalAlignment.Bottom;
        Grid.SetColumn(control, 1);
        bottom.Children.Add(control);

        layers.Children.Add(bottom);
        card.Child = layers;

        card.PointerEntered += (_, _) =>
        {
            if (_cart.All(c => c.Item.Id != item.Id))
                card.BorderBrush = Ui.Brush("Brand40Brush");
        };
        card.PointerExited += (_, _) =>
        {
            bool inCart = _cart.Any(c => c.Item.Id == item.Id);
            card.BorderBrush = Ui.Brush(inCart ? "Brand40Brush" : "White08Brush");
        };
        card.PointerPressed += (_, e) =>
        {
            if (e.GetCurrentPoint(card).Properties.IsLeftButtonPressed) HandleItemClick(item);
        };

        return card;
    }

    private static async void LoadArtworkAsync(Image target, string? url)
    {
        Bitmap? bitmap = await ImageCache.RemoteAsync(url, ArtworkDecodeWidth);
        if (bitmap != null) target.Source = bitmap;
    }

    private Button BuildAddButton(PosMenuItem item)
    {
        var button = new Button { Content = Ui.Ico("Plus", 16) };
        button.Classes.Add("add");
        button.Click += (_, e) =>
        {
            e.Handled = true;
            HandleItemClick(item);
        };
        return button;
    }

    private Border BuildStepper(PosMenuItem item, int quantity)
    {
        var minus = new Button { Content = Ui.Ico("Minus", 14) };
        minus.Classes.Add("step");
        minus.Width = 28;
        minus.Height = 28;
        minus.Click += (_, e) =>
        {
            e.Handled = true;
            Decrement(item);
        };

        var plus = new Button { Content = Ui.Ico("Plus", 14) };
        plus.Classes.Add("step");
        plus.Width = 28;
        plus.Height = 28;
        plus.Click += (_, e) =>
        {
            e.Handled = true;
            HandleItemClick(item);
        };

        var count = Ui.Num(quantity.ToString(), 13, "WhiteBrush");
        count.MinWidth = 18;
        count.TextAlignment = TextAlignment.Center;

        var row = Ui.Row(2, minus, count, plus);

        return new Border
        {
            Background = Ui.Brush("Black40Brush"),
            BorderBrush = Ui.Brush("White20Brush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(100),
            Padding = new Thickness(2),
            Child = row
        };
    }

    // ── Tables ──────────────────────────────────────────────────────────────
    private void RenderTables()
    {
        TablesPanel.Children.Clear();

        if (_tables.Count == 0)
        {
            TablesPanel.Children.Add(Ui.Text("No tables configured", 12, "White30Brush"));
            return;
        }

        // Occupied first, exactly like the web picker.
        foreach (var table in _tables.OrderByDescending(t => t.IsOccupied))
        {
            var captured = table;
            var button = new Button { Content = table.Number };
            button.Classes.Add("chip");
            if (table.IsOccupied) button.Classes.Add("busy");
            if (_selectedTable?.Number == table.Number) button.Classes.Add("active");

            button.Click += (_, _) =>
            {
                _selectedTable = _selectedTable?.Number == captured.Number ? null : captured;
                RenderTables();
                RefreshCart();
            };

            TablesPanel.Children.Add(button);
        }
    }

    // ── Cart ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Items with a choice to make open the sheet; everything else goes straight
    /// into the cart on its default variant. Same branch as the web POS.
    /// </summary>
    private void HandleItemClick(PosMenuItem item)
    {
        if (item.NeedsCustomisation) OpenCustomise(item);
        else AddToCart(item, item.DefaultVariant, new List<ToppingOption>(), 1);
    }

    private void AddToCart(PosMenuItem item, MenuItemVariant? variant, List<ToppingOption> toppings, int quantity)
    {
        var line = new CartItem
        {
            Item = item,
            Variant = variant,
            Toppings = toppings.ToList(),
            Quantity = quantity
        };

        // Merge identical configurations rather than stacking duplicate rows.
        var existing = _cart.FirstOrDefault(c => c.Signature == line.Signature);
        if (existing != null) existing.Quantity += quantity;
        else _cart.Add(line);

        RefreshCart();
        RenderItems();
    }

    /// <summary>Steps down the first cart line for this item, as the web card does.</summary>
    private void Decrement(PosMenuItem item)
    {
        var existing = _cart.FirstOrDefault(c => c.Item.Id == item.Id);
        if (existing == null) return;

        if (existing.Quantity <= 1) _cart.Remove(existing);
        else existing.Quantity--;

        RefreshCart();
        RenderItems();
    }

    private void DecrementLine(CartItem line)
    {
        if (line.Quantity <= 1) _cart.Remove(line);
        else line.Quantity--;

        RefreshCart();
        RenderItems();
    }

    private void IncrementLine(CartItem line)
    {
        line.Quantity++;
        RefreshCart();
        RenderItems();
    }

    private void RefreshCart()
    {
        CartItemsPanel.Children.Clear();

        foreach (var line in _cart)
            CartItemsPanel.Children.Add(BuildCartRow(line));

        int count = _cart.Sum(c => c.Quantity);
        bool any = _cart.Count > 0;

        CartEmpty.IsVisible = !any;
        CustomerSection.IsVisible = any;
        CartFooter.IsVisible = any;
        CartCountPill.IsVisible = count > 0;
        LblCartCount.Text = count == 1 ? "1 item" : count + " items";

        decimal subtotal = _cart.Sum(c => c.LineTotal);
        decimal taxRate = ParentWindow?.Api.TaxRate ?? 0;
        decimal tax = subtotal * (taxRate / 100m);

        RowTax.IsVisible = taxRate > 0;
        LblTaxLabel.Text = $"Tax ({taxRate.ToString("0.##")}%)";
        LblTax.Text = Money(tax);
        LblTotal.Text = Money(subtotal + tax);

        bool needsTable = _orderType == "dine_in" && _selectedTable == null;
        LblCartHint.IsVisible = any && needsTable;
        BtnPlaceOrder.IsEnabled = any && !needsTable && !_placing;
        LblTableRequired.IsVisible = _selectedTable == null;
    }

    private Border BuildCartRow(CartItem line)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto") };

        var details = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 8, 0),
            Spacing = 1
        };

        details.Children.Add(new TextBlock
        {
            Text = line.Item.Name,
            FontSize = 13,
            FontWeight = FontWeight.Medium,
            Foreground = Brushes.White,
            TextTrimming = TextTrimming.CharacterEllipsis
        });

        // "Large · 2 add-ons"
        string subtitle = line.Subtitle;
        if (subtitle.Length > 0)
        {
            details.Children.Add(new TextBlock
            {
                Text = subtitle,
                FontSize = 11,
                Foreground = Ui.Brush("White40Brush"),
                TextTrimming = TextTrimming.CharacterEllipsis
            });
        }

        grid.Children.Add(details);

        var minus = new Button { Content = Ui.Ico("Minus", 12) };
        minus.Classes.Add("step");
        minus.Width = 24;
        minus.Height = 24;
        minus.Click += (_, _) => DecrementLine(line);

        var plus = new Button { Content = Ui.Ico("Plus", 12) };
        plus.Classes.Add("step");
        plus.Width = 24;
        plus.Height = 24;
        plus.Click += (_, _) => IncrementLine(line);

        var count = Ui.Num(line.Quantity.ToString(), 12, "WhiteBrush");
        count.MinWidth = 16;
        count.TextAlignment = TextAlignment.Center;

        var stepper = new Border
        {
            Background = Ui.Brush("White03Brush"),
            BorderBrush = Ui.Brush("White10Brush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(100),
            Padding = new Thickness(2),
            VerticalAlignment = VerticalAlignment.Center,
            Child = Ui.Row(1, minus, count, plus)
        };
        Grid.SetColumn(stepper, 1);
        grid.Children.Add(stepper);

        var total = Ui.Num(Money(line.LineTotal), 13, "WhiteBrush");
        total.Width = 62;
        total.TextAlignment = TextAlignment.Right;
        Grid.SetColumn(total, 2);
        grid.Children.Add(total);

        return new Border
        {
            CornerRadius = new CornerRadius(12),
            Background = Ui.Brush("White02Brush"),
            BorderBrush = Ui.Brush("White06Brush"),
            BorderThickness = new Thickness(1),
            Padding = new Thickness(12, 8),
            Child = grid
        };
    }

    // ── Customisation sheet ─────────────────────────────────────────────────
    private void OpenCustomise(PosMenuItem item)
    {
        _modalItem = item;
        _modalVariant = item.DefaultVariant;
        _modalToppings.Clear();
        _modalQty = 1;

        LblModalName.Text = item.Name;
        LblModalBase.Text = "Base " + Money(item.BasePrice);

        bool hasDescription = !string.IsNullOrWhiteSpace(item.Description);
        LblModalDescription.IsVisible = hasDescription;
        LblModalDescription.Text = item.Description ?? "";

        // A single variant isn't a choice — the web hides the row too.
        VariantSection.IsVisible = item.Variants.Count > 1;
        AddOnSection.IsVisible = item.Toppings.Count > 0;

        TxtAddOnSearch.Text = "";
        AddOnListHost.IsVisible = false;
        IcoAddOnChevron.RenderTransform = null;

        RenderVariants();
        RenderAddOns();
        RefreshModalTotals();

        CustomiseOverlay.IsVisible = true;
    }

    private void CloseCustomise()
    {
        CustomiseOverlay.IsVisible = false;
        _modalItem = null;
        _modalToppings.Clear();
    }

    private void OnCloseCustomise(object? sender, RoutedEventArgs e) => CloseCustomise();

    private void OnCustomiseBackdrop(object? sender, PointerPressedEventArgs e) => CloseCustomise();

    private void OnModalQtyMinus(object? sender, RoutedEventArgs e)
    {
        _modalQty = Math.Max(1, _modalQty - 1);
        RefreshModalTotals();
    }

    private void OnModalQtyPlus(object? sender, RoutedEventArgs e)
    {
        _modalQty++;
        RefreshModalTotals();
    }

    private void RenderVariants()
    {
        VariantsPanel.Children.Clear();
        if (_modalItem == null) return;

        foreach (var variant in _modalItem.Variants)
        {
            var captured = variant;
            bool selected = _modalVariant?.Id == variant.Id;

            var label = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 5,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            label.Children.Add(new TextBlock
            {
                Text = variant.Name,
                FontSize = 12,
                FontWeight = FontWeight.Medium,
                VerticalAlignment = VerticalAlignment.Center
            });

            if (variant.PriceModifier != 0)
            {
                label.Children.Add(new TextBlock
                {
                    Text = (variant.PriceModifier > 0 ? "+" : "\u2212") + Money(Math.Abs(variant.PriceModifier)),
                    FontSize = 12,
                    Opacity = 0.7,
                    VerticalAlignment = VerticalAlignment.Center
                });
            }

            var button = new Button { Content = label };
            button.Classes.Add("chip");
            button.CornerRadius = new CornerRadius(100);
            button.Padding = new Thickness(12, 6);
            if (selected) button.Classes.Add("active");

            button.Click += (_, _) =>
            {
                _modalVariant = captured;
                RenderVariants();
                RefreshModalTotals();
            };

            VariantsPanel.Children.Add(button);
        }
    }

    private void OnAddOnSearchFocus(object? sender, GotFocusEventArgs e) => SetAddOnListOpen(true);

    private void OnToggleAddOnList(object? sender, RoutedEventArgs e) => SetAddOnListOpen(!AddOnListHost.IsVisible);

    private void OnAddOnQueryChanged()
    {
        if (!string.IsNullOrEmpty(TxtAddOnSearch.Text)) SetAddOnListOpen(true);
        RenderAddOnList();
    }

    private void SetAddOnListOpen(bool open)
    {
        AddOnListHost.IsVisible = open;
        IcoAddOnChevron.RenderTransform = open ? new RotateTransform(180) : null;
        if (open) RenderAddOnList();
    }

    private void RenderAddOns()
    {
        RenderAddOnChips();
        RenderAddOnList();
    }

    private void RenderAddOnChips()
    {
        AddOnChipsPanel.Children.Clear();
        AddOnCountPill.IsVisible = _modalToppings.Count > 0;
        LblAddOnCount.Text = _modalToppings.Count.ToString();

        foreach (var topping in _modalToppings.ToList())
        {
            var captured = topping;

            var remove = new Button { Content = Ui.Ico("X", 12) };
            remove.Classes.Add("step");
            remove.Width = 18;
            remove.Height = 18;
            remove.Foreground = Ui.Brush("BrandBrush");
            remove.Click += (_, _) => ToggleTopping(captured);

            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 4,
                VerticalAlignment = VerticalAlignment.Center
            };
            row.Children.Add(Ui.Text(topping.Name, 12, "BrandBrush"));
            row.Children.Add(remove);

            AddOnChipsPanel.Children.Add(new Border
            {
                CornerRadius = new CornerRadius(100),
                Padding = new Thickness(9, 2, 4, 3),
                Background = Ui.Brush("Brand15Brush"),
                Child = row
            });
        }
    }

    private void RenderAddOnList()
    {
        AddOnListPanel.Children.Clear();
        if (_modalItem == null) return;

        string query = (TxtAddOnSearch.Text ?? "").Trim();
        var matches = query.Length == 0
            ? _modalItem.Toppings
            : _modalItem.Toppings
                .Where(t => t.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .ToList();

        if (matches.Count == 0)
        {
            var empty = Ui.Text("No add-ons found", 12, "White30Brush");
            empty.HorizontalAlignment = HorizontalAlignment.Center;
            empty.Margin = new Thickness(0, 18, 0, 18);
            AddOnListPanel.Children.Add(empty);
            return;
        }

        foreach (var topping in matches)
        {
            var captured = topping;
            bool selected = _modalToppings.Any(t => t.Id == topping.Id);

            var box = new Border
            {
                Width = 16,
                Height = 16,
                CornerRadius = new CornerRadius(4),
                BorderThickness = new Thickness(1),
                BorderBrush = Ui.Brush(selected ? "BrandBrush" : "White25Brush"),
                Background = selected ? Ui.Brush("BrandBrush") : Brushes.Transparent,
                VerticalAlignment = VerticalAlignment.Center
            };
            if (selected) box.Child = Ui.Ico("Check", 10, "WhiteBrush", 3);

            var left = Ui.Row(10, box, Ui.Text(topping.Name, 13, "WhiteBrush"));

            var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            grid.Children.Add(left);

            var price = Ui.Num("+" + Money(topping.Price), 12, "White45Brush", FontWeight.Normal);
            Grid.SetColumn(price, 1);
            grid.Children.Add(price);

            var row = new Button
            {
                Content = grid,
                Background = selected ? Ui.Brush("Brand10Brush") : Brushes.Transparent,
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(10, 7),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch
            };
            row.Classes.Add("ghost");
            row.Click += (_, _) => ToggleTopping(captured);

            AddOnListPanel.Children.Add(row);
        }
    }

    private void ToggleTopping(ToppingOption topping)
    {
        var existing = _modalToppings.FirstOrDefault(t => t.Id == topping.Id);
        if (existing != null) _modalToppings.Remove(existing);
        else _modalToppings.Add(topping);

        RenderAddOns();
        RefreshModalTotals();
    }

    private void RefreshModalTotals()
    {
        if (_modalItem == null) return;

        LblModalQty.Text = _modalQty.ToString();

        decimal unit = _modalItem.BasePrice
                       + (_modalVariant?.PriceModifier ?? 0)
                       + _modalToppings.Sum(t => t.Price);

        LblModalTotal.Text = Money(unit * _modalQty);
    }

    private void OnModalAddToCart(object? sender, RoutedEventArgs e)
    {
        if (_modalItem == null) return;

        AddToCart(_modalItem, _modalVariant, _modalToppings.ToList(), _modalQty);
        CloseCustomise();
    }

    // ── Order type ──────────────────────────────────────────────────────────
    private void OnSelectDineIn(object? sender, RoutedEventArgs e) => SetOrderType("dine_in");

    private void OnSelectTakeaway(object? sender, RoutedEventArgs e) => SetOrderType("takeaway");

    private void OnSelectDelivery(object? sender, RoutedEventArgs e) => SetOrderType("delivery");

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

        if (type != "dine_in") _selectedTable = null;

        TableSection.IsVisible = type == "dine_in";
        RenderTables();
        RefreshCart();
    }

    // ── Placing the order ───────────────────────────────────────────────────
    private async void OnPlaceOrder(object? sender, RoutedEventArgs e)
    {
        if (ParentWindow == null || _cart.Count == 0 || _placing) return;
        if (_orderType == "dine_in" && _selectedTable == null) return;

        _placing = true;
        BtnPlaceOrder.IsEnabled = false;
        LblPlace.Text = "Placing order…";

        try
        {
            var result = await ParentWindow.Api.PlaceOrderAsync(
                _selectedTable?.Number ?? "",
                TxtCustName.Text?.Trim() ?? "",
                TxtCustPhone.Text?.Trim() ?? "",
                _orderType,
                _cart);

            if (result.success)
            {
                _cart.Clear();
                _selectedTable = null;
                TxtCustName.Text = "";
                TxtCustPhone.Text = "";

                LblPlace.Text = "Order placed";
                RenderItems();

                _tables = await ParentWindow.Api.GetTablesAsync();
                RenderTables();

                // Read the order back so the receipt carries the id and timestamp
                // the server assigned, then print if the till is set to do so.
                if (PrinterService.Target.AutoPrintOnPlace && result.orderId.Length > 0)
                {
                    LblPlace.Text = "Printing…";
                    var placed = await ParentWindow.Api.GetOrderAsync(result.orderId);
                    if (placed != null)
                        await BillPrinter.AutoPrintAsync(ParentWindow.Api, placed, enabled: true);
                }

                await Task.Delay(1400);
            }
            else
            {
                LblPlace.Text = Shorten(result.error);
                IcoPlace.Data = Ui.Glyph("CircleAlert");
                await Task.Delay(2600);
                IcoPlace.Data = Ui.Glyph("CircleCheckBig");
            }
        }
        catch (Exception ex)
        {
            LblPlace.Text = Shorten(ex.Message);
            await Task.Delay(2600);
        }
        finally
        {
            _placing = false;
            LblPlace.Text = "Place order";
            RefreshCart();
        }
    }

    private static string Shorten(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return "Could not place order";
        return message.Length <= 34 ? message : message[..34] + "…";
    }

    private string Money(decimal value) => ParentWindow?.Api.Money(value) ?? "\u20B9" + value.ToString("N0");
}
