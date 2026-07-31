using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Input;
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
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

public partial class OrdersPage : UserControl
{
    /// <summary>Status vocabulary copied from the web page's statusConfig map.</summary>
    private static readonly (string Key, string Label, string Bg, string Fg, string Icon)[] Statuses =
    {
        ("pending", "Pending", "Brand20Brush", "BrandBrush", "Clock"),
        ("confirmed", "Confirmed", "White10Brush", "White70Brush", "CircleCheckBig"),
        ("preparing", "Preparing", "White10Brush", "White70Brush", "ChefHat"),
        ("ready", "Ready", "White10Brush", "White70Brush", "Package"),
        ("completed", "Completed", "White15Brush", "WhiteBrush", "CircleCheckBig"),
        ("cancelled", "Cancelled", "Brand20Brush", "BrandBrush", "CircleX")
    };

    public MainWindow? ParentWindow { get; set; }

    private List<OrderRecord> _orders = new();
    private string? _statusFilter;
    private string? _updatingId;
    private string? _printingId;

    // ── Editor state ────────────────────────────────────────────────────────
    private OrderRecord? _editing;
    private OrderEditDraft? _draft;
    private bool _saving;

    /// <summary>Menu, loaded on first use so opening the page stays cheap.</summary>
    private List<PosMenuItem> _menu = new();
    private List<TableRecord> _tables = new();
    private bool _menuLoaded;

    public OrdersPage()
    {
        InitializeComponent();
        TxtSearch.GetObservable(TextBox.TextProperty).Subscribe(_ => Render());
        TxtEditItemSearch.GetObservable(TextBox.TextProperty).Subscribe(_ => RenderSearchResults());
        TxtEditDiscount.GetObservable(TextBox.TextProperty).Subscribe(_ => OnDiscountTyped());
        KeyDown += OnPageKeyDown;
        RenderFilters();
    }

    private void OnPageKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && EditOverlay.IsVisible)
        {
            CloseEditor();
            e.Handled = true;
        }
    }

    private string _dateRange = "today"; // default to Today's orders as requested

    public async void OnNavigate()
    {
        RenderDatePills();
        await LoadAsync();
    }

    private async void OnSelectDateToday(object? sender, RoutedEventArgs e) => await SwitchDateRange("today");
    private async void OnSelectDateYesterday(object? sender, RoutedEventArgs e) => await SwitchDateRange("yesterday");
    private async void OnSelectDateWeek(object? sender, RoutedEventArgs e) => await SwitchDateRange("week");
    private async void OnSelectDateMonth(object? sender, RoutedEventArgs e) => await SwitchDateRange("month");
    private async void OnSelectDateAll(object? sender, RoutedEventArgs e) => await SwitchDateRange("all");

    private async Task SwitchDateRange(string range)
    {
        _dateRange = range;
        RenderDatePills();
        await LoadAsync();
    }

    private void RenderDatePills()
    {
        Activate(BtnDateToday, _dateRange == "today");
        Activate(BtnDateYesterday, _dateRange == "yesterday");
        Activate(BtnDateWeek, _dateRange == "week");
        Activate(BtnDateMonth, _dateRange == "month");
        Activate(BtnDateAll, _dateRange == "all");
    }

    private async Task LoadAsync()
    {
        if (ParentWindow == null) return;

        try
        {
            DateTime? fromDate = null;
            DateTime? toDate = null;
            DateTime today = DateTime.Today;

            switch (_dateRange)
            {
                case "today":
                    fromDate = today;
                    toDate = today.AddDays(1).AddTicks(-1);
                    break;
                case "yesterday":
                    fromDate = today.AddDays(-1);
                    toDate = today.AddTicks(-1);
                    break;
                case "week":
                    int diff = (7 + (today.DayOfWeek - DayOfWeek.Monday)) % 7;
                    fromDate = today.AddDays(-1 * diff);
                    toDate = today.AddDays(1).AddTicks(-1);
                    break;
                case "month":
                    fromDate = new DateTime(today.Year, today.Month, 1);
                    toDate = today.AddDays(1).AddTicks(-1);
                    break;
                case "all":
                    fromDate = null;
                    toDate = null;
                    break;
            }

            _orders = await ParentWindow.Api.GetOrdersAsync(fromDate, toDate);
            Render();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Orders load failed: " + ex.Message);
        }
    }

    // ── Filters ─────────────────────────────────────────────────────────────
    private void RenderFilters()
    {
        FiltersPanel.Children.Clear();
        FiltersPanel.Children.Add(FilterPill("All", null, null));

        foreach (var status in Statuses)
            FiltersPanel.Children.Add(FilterPill(status.Label, status.Key, status.Icon));
    }

    private Button FilterPill(string label, string? key, string? iconName)
    {
        var button = new Button();
        button.Classes.Add("pill");
        if (_statusFilter == key) button.Classes.Add("active");

        button.Content = iconName == null
            ? label
            : Ui.Row(7, Ui.Ico(iconName, 14), new TextBlock
            {
                Text = label,
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center
            });

        button.Click += (_, _) =>
        {
            _statusFilter = key;
            RenderFilters();
            Render();
        };

        return button;
    }

    // ── Grid ────────────────────────────────────────────────────────────────
    private IEnumerable<OrderRecord> Visible()
    {
        IEnumerable<OrderRecord> list = _orders;

        if (_statusFilter != null)
            list = list.Where(o => o.Status == _statusFilter);

        string query = (TxtSearch.Text ?? "").Trim();
        if (query.Length > 0)
        {
            list = list.Where(o =>
                o.Id.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                o.CustomerName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                o.CustomerPhone.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                o.TableNumber.Contains(query, StringComparison.OrdinalIgnoreCase));
        }

        return list;
    }

    private void Render()
    {
        if (ParentWindow == null) return;

        int active = _orders.Count(o => o.Status is "pending" or "confirmed" or "preparing" or "ready");
        LblLiveCount.Text = active + " active";
        LblSubtitle.Text = _orders.Count == 0
            ? "Live order feed from every channel"
            : $"{_orders.Count} order{(_orders.Count == 1 ? "" : "s")} in the current window";

        var list = Visible().ToList();

        OrdersPanel.Children.Clear();
        OrdersEmpty.IsVisible = list.Count == 0;
        OrdersScroller.IsVisible = list.Count > 0;
        LblEmptyTitle.Text = _orders.Count == 0 ? "No orders yet" : "Nothing matches that filter";

        foreach (var order in list)
            OrdersPanel.Children.Add(BuildOrderCard(order, ParentWindow.Api));
    }

    private Border BuildOrderCard(OrderRecord order, ApiService api)
    {
        var meta = Statuses.FirstOrDefault(s => s.Key == order.Status);
        if (meta.Key == null) meta = Statuses[0];

        var body = new StackPanel { Spacing = 0 };

        // ── Header: id + status badge ──────────────────────────────────────
        var head = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        head.Children.Add(Ui.Text("Order #" + order.ShortId, 15, "WhiteBrush", FontWeight.Bold));

        var badge = Ui.Badge(meta.Label.ToUpperInvariant(), meta.Bg, meta.Fg, meta.Icon);
        Grid.SetColumn(badge, 1);
        head.Children.Add(badge);
        body.Children.Add(head);

        // ── Type + elapsed chips ───────────────────────────────────────────
        var chips = new WrapPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 10, 0, 0) };

        var typeRow = Ui.Row(5, Ui.Ico(TypeIcon(order.OrderType), 12, "BrandBrush", 2.2),
            Ui.Text(TypeLabel(order.OrderType), 10, "White65Brush", FontWeight.Medium));
        if (!string.IsNullOrWhiteSpace(order.TableNumber))
            typeRow.Children.Add(Ui.Text("· Table " + order.TableNumber, 10, "White30Brush"));

        chips.Children.Add(Chip(typeRow));
        chips.Children.Add(Chip(Ui.Row(5, Ui.Ico("Calendar", 12, "White50Brush", 2.2),
            Ui.Text(order.RelativeTime, 10, "White50Brush"))));
        body.Children.Add(chips);

        // ── Customer strip ─────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(order.CustomerName))
        {
            var customer = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
            };
            customer.Children.Add(Ui.Ico("User", 13, "White40Brush"));

            var nameText = Ui.Text(order.CustomerName, 12, "White65Brush", FontWeight.Medium);
            nameText.Margin = new Thickness(7, 0, 0, 0);
            nameText.TextTrimming = TextTrimming.CharacterEllipsis;
            Grid.SetColumn(nameText, 1);
            customer.Children.Add(nameText);

            if (!string.IsNullOrWhiteSpace(order.CustomerPhone))
            {
                var phone = Ui.Text(order.CustomerPhone, 10, "White30Brush");
                Grid.SetColumn(phone, 2);
                customer.Children.Add(phone);
            }

            body.Children.Add(new Border
            {
                Margin = new Thickness(0, 10, 0, 0),
                CornerRadius = new CornerRadius(9),
                Padding = new Thickness(10, 5),
                Background = Ui.Brush("White02Brush"),
                BorderBrush = Ui.Brush("White05Brush"),
                BorderThickness = new Thickness(1),
                Child = customer
            });
        }

        body.Children.Add(new Border
        {
            Margin = new Thickness(0, 14, 0, 0),
            BorderBrush = Ui.Brush("White06Brush"),
            BorderThickness = new Thickness(0, 0, 0, 1)
        });

        // ── Line items ─────────────────────────────────────────────────────
        var lines = new StackPanel { Margin = new Thickness(0, 12, 0, 0), Spacing = 0 };

        foreach (var item in order.Items.Take(5))
        {
            var row = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                Margin = new Thickness(0, 5, 0, 5)
            };

            var qty = Ui.Num(item.Quantity + "x", 12, "BrandBrush");
            qty.VerticalAlignment = VerticalAlignment.Top;
            qty.Margin = new Thickness(0, 1, 0, 0);
            row.Children.Add(qty);

            // Variant / add-on detail is stored on the line's notes, e.g.
            // "Variant: Large, Toppings: Olives, Jalapeño".
            var nameBlock = new StackPanel { Margin = new Thickness(8, 0, 8, 0), Spacing = 1 };
            nameBlock.Children.Add(new TextBlock
            {
                Text = item.Name,
                FontSize = 13,
                FontWeight = FontWeight.Medium,
                Foreground = Ui.Brush("WhiteBrush"),
                TextTrimming = TextTrimming.CharacterEllipsis
            });

            if (!string.IsNullOrWhiteSpace(item.Notes))
            {
                nameBlock.Children.Add(new TextBlock
                {
                    Text = item.Notes,
                    FontSize = 10,
                    Foreground = Ui.Brush("White40Brush"),
                    TextWrapping = TextWrapping.Wrap,
                    MaxLines = 2,
                    TextTrimming = TextTrimming.CharacterEllipsis
                });
            }

            Grid.SetColumn(nameBlock, 1);
            row.Children.Add(nameBlock);

            var price = Ui.Num(api.Money(item.TotalPrice), 12, "White70Brush", FontWeight.Medium);
            price.VerticalAlignment = VerticalAlignment.Top;
            price.Margin = new Thickness(0, 1, 0, 0);
            Grid.SetColumn(price, 2);
            row.Children.Add(price);

            lines.Children.Add(new Border
            {
                BorderBrush = Ui.Brush("White05Brush"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Child = row
            });
        }

        if (order.Items.Count > 5)
        {
            var more = Ui.Text($"+{order.Items.Count - 5} more item{(order.Items.Count - 5 == 1 ? "" : "s")}",
                11, "White40Brush");
            more.HorizontalAlignment = HorizontalAlignment.Center;
            more.Margin = new Thickness(0, 6, 0, 0);
            lines.Children.Add(more);
        }

        if (order.Items.Count == 0)
            lines.Children.Add(Ui.EmptyLine("No line items recorded"));

        body.Children.Add(lines);

        // ── Totals ─────────────────────────────────────────────────────────
        var totals = new StackPanel { Spacing = 5, Margin = new Thickness(0, 14, 0, 0) };

        if (order.Tax > 0) totals.Children.Add(TotalRow("Tax", api.Money(order.Tax), "White40Brush"));
        if (order.SpaceRentalAmount > 0)
            totals.Children.Add(TotalRow("Space rental", api.Money(order.SpaceRentalAmount), "White40Brush"));
        if (order.DiscountAmount > 0)
            totals.Children.Add(TotalRow("Discount", "-" + api.Money(order.DiscountAmount), "Brand85Brush"));

        var totalRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Margin = new Thickness(0, 3, 0, 0) };
        totalRow.Children.Add(Ui.Text("Total", 13, "WhiteBrush", FontWeight.SemiBold));
        var totalValue = Ui.Num(api.Money(order.Payable), 20, "BrandBrush", FontWeight.Bold);
        Grid.SetColumn(totalValue, 1);
        totalRow.Children.Add(totalValue);
        totals.Children.Add(totalRow);

        body.Children.Add(new Border
        {
            Margin = new Thickness(0, 2, 0, 0),
            BorderBrush = Ui.Brush("White06Brush"),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = totals
        });

        // ── Actions ────────────────────────────────────────────────────────
        var actions = BuildActions(order);
        if (actions != null)
        {
            actions.Margin = new Thickness(0, 14, 0, 0);
            body.Children.Add(actions);
        }

        // ── Card shell with the status accent bar ──────────────────────────
        var accent = new Border
        {
            Height = 3,
            Background = Ui.Brush(meta.Bg),
            VerticalAlignment = VerticalAlignment.Top
        };

        var content = new Panel();
        content.Children.Add(accent);
        body.Margin = new Thickness(20, 20, 20, 20);
        content.Children.Add(body);

        // Width and gaps come from the ResponsiveGrid.
        var card = new Border
        {
            CornerRadius = new CornerRadius(16),
            ClipToBounds = true,
            Background = Ui.Brush("White02Brush"),
            BorderBrush = Ui.Brush("White06Brush"),
            BorderThickness = new Thickness(1),
            Child = content
        };

        card.Transitions = new Transitions
        {
            new BrushTransition { Property = Border.BorderBrushProperty, Duration = TimeSpan.FromMilliseconds(200) }
        };
        card.PointerEntered += (_, _) => card.BorderBrush = Ui.Brush("White15Brush");
        card.PointerExited += (_, _) => card.BorderBrush = Ui.Brush("White06Brush");

        return card;
    }

    private static Border Chip(Control content) => new()
    {
        CornerRadius = new CornerRadius(100),
        Padding = new Thickness(8, 3),
        Margin = new Thickness(0, 0, 8, 0),
        Background = Ui.Brush("White03Brush"),
        BorderBrush = Ui.Brush("White05Brush"),
        BorderThickness = new Thickness(1),
        Child = content
    };

    private static Grid TotalRow(string label, string value, string brushKey)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        grid.Children.Add(Ui.Text(label, 12, brushKey));
        var v = Ui.Num(value, 12, brushKey, FontWeight.Medium);
        Grid.SetColumn(v, 1);
        grid.Children.Add(v);
        return grid;
    }

    /// <summary>Status-driven action row, matching the web card's progression.</summary>
    private Grid? BuildActions(OrderRecord order)
    {
        bool closed = order.Status is "completed" or "cancelled";
        var (label, next, icon, primary) = order.Status switch
        {
            "pending" => ("Confirm order", "confirmed", "CircleCheckBig", true),
            "confirmed" => ("Start cooking", "preparing", "ChefHat", false),
            "preparing" => ("Mark ready", "ready", "Package", false),
            "ready" => ("Complete order", "completed", "CircleCheckBig", true),
            _ => (null, null, null, false)
        };

        // A closed order still needs a reprint button, so the row is always built.
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        bool busy = _updatingId == order.Id;

        if (label != null && next != null && icon != null)
        {
            var advance = Ui.TextButton(busy ? "Updating…" : label, primary ? "brand" : "soft", icon, 14);
            advance.Height = 36;
            advance.CornerRadius = new CornerRadius(12);
            advance.FontSize = 12;
            advance.HorizontalAlignment = HorizontalAlignment.Stretch;
            advance.Margin = new Thickness(0, 0, 8, 0);
            advance.IsEnabled = !busy;
            advance.Click += (_, _) => UpdateStatus(order, next);
            grid.Children.Add(advance);
        }
        else if (closed)
        {
            // Nothing left to advance — let the print button carry the row.
            var spacer = Ui.TextButton("Reprint bill", "soft", "Printer", 14);
            spacer.Height = 36;
            spacer.CornerRadius = new CornerRadius(12);
            spacer.FontSize = 12;
            spacer.HorizontalAlignment = HorizontalAlignment.Stretch;
            spacer.Margin = new Thickness(0, 0, 8, 0);
            spacer.IsEnabled = _printingId != order.Id;
            spacer.Click += (_, _) => PrintBill(order);
            grid.Children.Add(spacer);
        }

        if (!closed)
        {
            var icons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 8,
                VerticalAlignment = VerticalAlignment.Center
            };

            // A settled or cancelled order is history; only live orders are editable.
            var edit = Ui.IconButton("Pencil", "icon", "Edit order");
            edit.Width = 36;
            edit.Height = 36;
            edit.IsEnabled = !busy;
            edit.Click += (_, _) => OpenEditor(order);
            icons.Children.Add(edit);

            var print = Ui.IconButton("Printer", "icon", "Print bill");
            print.Width = 36;
            print.Height = 36;
            print.IsEnabled = _printingId != order.Id;
            print.Click += (_, _) => PrintBill(order);
            icons.Children.Add(print);

            var cancel = Ui.IconButton("CircleX", "icon", "Cancel order");
            cancel.Width = 36;
            cancel.Height = 36;
            cancel.IsEnabled = !busy;
            cancel.Click += (_, _) => UpdateStatus(order, "cancelled");
            icons.Children.Add(cancel);

            Grid.SetColumn(icons, 1);
            grid.Children.Add(icons);
        }

        return grid;
    }

    private static string TypeLabel(string type) => type switch
    {
        "dine_in" => "Dine In",
        "takeaway" => "Takeaway",
        "delivery" => "Delivery",
        _ => string.IsNullOrWhiteSpace(type) ? "Order" : type
    };

    private static string TypeIcon(string type) => type switch
    {
        "takeaway" => "Package",
        "delivery" => "Bike",
        _ => "ChefHat"
    };

    // ── Mutations ───────────────────────────────────────────────────────────
    private async void UpdateStatus(OrderRecord order, string status)
    {
        if (ParentWindow == null || _updatingId != null) return;

        _updatingId = order.Id;
        Render();

        bool ok = await ParentWindow.Api.UpdateOrderStatusAsync(order.Id, status);
        if (ok) order.Status = status;

        _updatingId = null;
        Render();

        // Completing an order is the moment the customer wants the bill.
        if (ok && status == "completed")
            await BillPrinter.AutoPrintAsync(ParentWindow.Api, order, PrinterService.Target.AutoPrintOnComplete);
    }

    /// <summary>Prints or reprints a bill for one order.</summary>
    private async void PrintBill(OrderRecord order)
    {
        if (ParentWindow == null || _printingId != null) return;

        _printingId = order.Id;
        Render();

        try
        {
            await BillPrinter.PrintBillWithToastAsync(ParentWindow.Api, order);
        }
        finally
        {
            _printingId = null;
            Render();
        }
    }

    private async void OnRefresh(object? sender, RoutedEventArgs e)
    {
        BtnRefresh.IsEnabled = false;
        LblRefresh.Text = "Refreshing…";

        await LoadAsync();

        LblRefresh.Text = "Refresh";
        BtnRefresh.IsEnabled = true;
    }

    // ════ Order editor ══════════════════════════════════════════════════════

    private async void OpenEditor(OrderRecord order)
    {
        if (ParentWindow == null) return;

        _editing = order;
        _draft = OrderEditDraft.From(order, ParentWindow.Api.TaxRate);

        LblEditTitle.Text = "Edit order #" + order.ShortId;
        LblEditSubtitle.Text = order.Status.ToUpperInvariant() + " · placed " + order.RelativeTime;

        TxtEditName.Text = _draft.CustomerName;
        TxtEditPhone.Text = _draft.CustomerPhone;
        TxtEditItemSearch.Text = "";
        TxtEditDiscount.Text = _draft.DiscountInput > 0
            ? _draft.DiscountInput.ToString("0.##", CultureInfo.InvariantCulture)
            : "";

        EditOverlay.IsVisible = true;
        RenderEditor();

        // Tables and the menu are only needed inside the editor.
        if (!_menuLoaded)
        {
            try
            {
                _menu = await ParentWindow.Api.GetMenuItemsAsync();
                _tables = await ParentWindow.Api.GetTablesAsync();
                _menuLoaded = true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("Editor menu load failed: " + ex.Message);
            }

            if (EditOverlay.IsVisible) RenderEditor();
        }
    }

    private void OnCloseEdit(object? sender, RoutedEventArgs e) => CloseEditor();

    private void OnEditBackdrop(object? sender, PointerPressedEventArgs e) => CloseEditor();

    private void CloseEditor()
    {
        if (_saving) return;

        EditOverlay.IsVisible = false;
        _editing = null;
        _draft = null;
    }

    /// <summary>Repaints every part of the sheet that depends on the draft.</summary>
    private void RenderEditor()
    {
        if (_draft == null) return;

        Activate(BtnEditDineIn, _draft.OrderType == "dine_in");
        Activate(BtnEditTakeaway, _draft.OrderType == "takeaway");
        Activate(BtnEditDelivery, _draft.OrderType == "delivery");
        PanelEditTable.IsVisible = _draft.OrderType == "dine_in";

        Activate(BtnDiscNone, _draft.DiscountKind == OrderDiscountKind.None);
        Activate(BtnDiscFlat, _draft.DiscountKind == OrderDiscountKind.Flat);
        Activate(BtnDiscPct, _draft.DiscountKind == OrderDiscountKind.Percent);
        TxtEditDiscount.IsVisible = _draft.DiscountKind != OrderDiscountKind.None;
        TxtEditDiscount.Watermark = _draft.DiscountKind == OrderDiscountKind.Percent ? "% off" : "Amount off";

        string? pay = _draft.PaymentMethod?.ToLowerInvariant();
        Activate(BtnPayNone, string.IsNullOrEmpty(pay));
        Activate(BtnPayCash, pay == "cash");
        Activate(BtnPayUpi, pay == "upi");
        Activate(BtnPayCard, pay == "card");

        RenderEditTables();
        RenderEditLines();
        RenderSearchResults();
        RenderEditTotals();
    }

    private static void Activate(Button button, bool active)
    {
        if (active) button.Classes.Add("active");
        else button.Classes.Remove("active");
    }

    private void RenderEditTables()
    {
        EditTablesPanel.Children.Clear();
        if (_draft == null) return;

        var tables = _tables.Count > 0 ? _tables : ParentWindow?.Api.ConfiguredTables ?? new List<TableRecord>();

        if (tables.Count == 0)
        {
            EditTablesPanel.Children.Add(Ui.Text("No tables configured", 12, "White30Brush"));
            return;
        }

        foreach (var table in tables)
        {
            var button = new Button { Content = "T" + table.Number };
            button.Classes.Add("chip");
            if (_draft.TableNumber == table.Number) button.Classes.Add("active");

            var captured = table;
            button.Click += (_, _) =>
            {
                // Tapping the selected table clears it.
                _draft.TableNumber = _draft.TableNumber == captured.Number ? "" : captured.Number;
                _draft.IsDirty = true;
                RenderEditor();
            };

            EditTablesPanel.Children.Add(button);
        }
    }

    private void RenderEditLines()
    {
        EditLinesPanel.Children.Clear();
        if (_draft == null) return;

        foreach (var line in _draft.Lines)
            EditLinesPanel.Children.Add(BuildEditLine(line));

        LblEditItemCount.Text = _draft.ItemCount == 1 ? "1 item" : _draft.ItemCount + " items";
        LblEditNoLines.IsVisible = !_draft.HasLines;
    }

    private Border BuildEditLine(OrderLineDraft line)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto") };

        var details = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Spacing = 1 };

        var name = Ui.Text(line.Name, 13, line.IsRemoved ? "White30Brush" : "WhiteBrush", FontWeight.Medium);
        name.TextTrimming = TextTrimming.CharacterEllipsis;
        if (line.IsRemoved) name.TextDecorations = TextDecorations.Strikethrough;
        details.Children.Add(name);

        var parts = new List<string> { Money(line.UnitPrice) + " each" };
        if (!string.IsNullOrWhiteSpace(line.Notes)) parts.Add(line.Notes!);
        if (line.IsNew) parts.Add("new");

        var subtitle = Ui.Text(string.Join(" · ", parts), 11, "White40Brush");
        subtitle.TextTrimming = TextTrimming.CharacterEllipsis;
        details.Children.Add(subtitle);

        grid.Children.Add(details);

        if (line.IsRemoved)
        {
            var undo = Ui.TextButton("Undo", "soft", "RefreshCw", 12);
            undo.Height = 28;
            undo.FontSize = 11;
            undo.CornerRadius = new CornerRadius(10);
            undo.Click += (_, _) =>
            {
                line.IsRemoved = false;
                _draft!.IsDirty = true;
                RenderEditor();
            };
            Grid.SetColumn(undo, 2);
            grid.Children.Add(undo);
        }
        else
        {
            // Quantity stepper
            var stepper = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 1,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            var minus = new Button { Content = Ui.Ico("Minus", 12), Width = 24, Height = 24 };
            minus.Classes.Add("step");
            minus.Click += (_, _) => StepLine(line, -1);
            stepper.Children.Add(minus);

            var count = Ui.Num(line.Quantity.ToString(), 12, "WhiteBrush");
            count.MinWidth = 18;
            count.TextAlignment = TextAlignment.Center;
            stepper.Children.Add(count);

            var plus = new Button { Content = Ui.Ico("Plus", 12), Width = 24, Height = 24 };
            plus.Classes.Add("step");
            plus.Click += (_, _) => StepLine(line, 1);
            stepper.Children.Add(plus);

            var total = Ui.Num(Money(line.LineTotal), 12, "WhiteBrush");
            total.MinWidth = 62;
            total.TextAlignment = TextAlignment.Right;
            total.Margin = new Thickness(6, 0, 0, 0);
            stepper.Children.Add(total);

            Grid.SetColumn(stepper, 1);
            grid.Children.Add(stepper);

            var remove = Ui.IconButton("Trash2", "step", "Remove item", 13);
            remove.Width = 26;
            remove.Height = 26;
            remove.Click += (_, _) => RemoveLine(line);
            Grid.SetColumn(remove, 2);
            grid.Children.Add(remove);
        }

        return new Border
        {
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(12, 8),
            Background = Ui.Brush(line.IsRemoved ? "White02Brush" : "White03Brush"),
            BorderBrush = Ui.Brush("White06Brush"),
            BorderThickness = new Thickness(1),
            Child = grid
        };
    }

    private void StepLine(OrderLineDraft line, int delta)
    {
        if (_draft == null) return;

        int next = line.Quantity + delta;

        // Stepping the last unit down removes the line rather than storing a zero.
        if (next <= 0)
        {
            RemoveLine(line);
            return;
        }

        line.Quantity = next;
        _draft.IsDirty = true;
        RenderEditor();
    }

    private void RemoveLine(OrderLineDraft line)
    {
        if (_draft == null) return;

        // A line added during this edit can just disappear; an existing one is
        // tombstoned so the save knows to delete it, and so Undo still works.
        if (line.IsNew) _draft.Lines.Remove(line);
        else line.IsRemoved = true;

        _draft.IsDirty = true;
        RenderEditor();
    }

    private void RenderSearchResults()
    {
        EditSearchResults.Children.Clear();
        if (_draft == null) return;

        string query = (TxtEditItemSearch.Text ?? "").Trim();
        if (query.Length == 0) return;

        if (!_menuLoaded)
        {
            EditSearchResults.Children.Add(Ui.Text("Loading the menu…", 12, "White30Brush"));
            return;
        }

        var matches = _menu
            .Where(m => m.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
            .Take(6)
            .ToList();

        if (matches.Count == 0)
        {
            EditSearchResults.Children.Add(Ui.Text("Nothing on the menu matches that", 12, "White30Brush"));
            return;
        }

        foreach (var item in matches)
            EditSearchResults.Children.Add(BuildSearchRow(item));
    }

    private Border BuildSearchRow(PosMenuItem item)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };

        var variant = item.DefaultVariant;
        decimal price = item.BasePrice + (variant?.PriceModifier ?? 0);

        var details = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Spacing = 1 };
        details.Children.Add(Ui.Text(item.Name, 13, "WhiteBrush", FontWeight.Medium));

        // The editor adds the default variant only; full customisation stays in POS.
        string subtitle = variant != null && !string.IsNullOrWhiteSpace(variant.Name)
            ? Money(price) + " · " + variant.Name
            : Money(price);
        details.Children.Add(Ui.Text(subtitle, 11, "White40Brush"));

        grid.Children.Add(details);

        var add = Ui.TextButton("Add", "soft", "Plus", 12);
        add.Height = 30;
        add.FontSize = 11;
        add.CornerRadius = new CornerRadius(10);
        add.Click += (_, _) =>
        {
            _draft!.AddFromMenu(item, variant);
            TxtEditItemSearch.Text = "";
            RenderEditor();
        };
        Grid.SetColumn(add, 1);
        grid.Children.Add(add);

        return new Border
        {
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(12, 7),
            Background = Ui.Brush("White02Brush"),
            BorderBrush = Ui.Brush("White06Brush"),
            BorderThickness = new Thickness(1),
            Child = grid
        };
    }

    private void RenderEditTotals()
    {
        if (_draft == null) return;

        var parts = new List<string> { "Subtotal " + Money(_draft.Subtotal) };
        if (_draft.Tax > 0) parts.Add("tax " + Money(_draft.Tax));
        if (_draft.DiscountAmount > 0) parts.Add("less " + Money(_draft.DiscountAmount));
        if (_draft.SpaceRentalAmount > 0) parts.Add("rental " + Money(_draft.SpaceRentalAmount));

        LblEditBreakdown.Text = string.Join("  ·  ", parts);
        LblEditTotal.Text = Money(_draft.Total);

        BtnEditSave.IsEnabled = !_saving && _draft.HasLines;
    }

    // ── Field handlers ──────────────────────────────────────────────────────
    private void OnEditDineIn(object? sender, RoutedEventArgs e) => SetEditType("dine_in");

    private void OnEditTakeaway(object? sender, RoutedEventArgs e) => SetEditType("takeaway");

    private void OnEditDelivery(object? sender, RoutedEventArgs e) => SetEditType("delivery");

    private void SetEditType(string type)
    {
        if (_draft == null) return;

        _draft.OrderType = type;

        // A table only means something for dine-in.
        if (type != "dine_in") _draft.TableNumber = "";

        _draft.IsDirty = true;
        RenderEditor();
    }

    private void OnDiscountNone(object? sender, RoutedEventArgs e) => SetDiscountKind(OrderDiscountKind.None);

    private void OnDiscountFlat(object? sender, RoutedEventArgs e) => SetDiscountKind(OrderDiscountKind.Flat);

    private void OnDiscountPercent(object? sender, RoutedEventArgs e) => SetDiscountKind(OrderDiscountKind.Percent);

    private void SetDiscountKind(OrderDiscountKind kind)
    {
        if (_draft == null) return;

        _draft.DiscountKind = kind;
        if (kind == OrderDiscountKind.None)
        {
            _draft.DiscountInput = 0;
            TxtEditDiscount.Text = "";
        }

        _draft.IsDirty = true;
        RenderEditor();
    }

    private void OnDiscountTyped()
    {
        if (_draft == null || _draft.DiscountKind == OrderDiscountKind.None) return;

        string raw = (TxtEditDiscount.Text ?? "").Trim();

        _draft.DiscountInput =
            decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) && value > 0
                ? value
                : 0;

        _draft.IsDirty = true;
        RenderEditTotals();
    }

    private void OnPayUnpaid(object? sender, RoutedEventArgs e) => SetPayment(null);

    private void OnPayCash(object? sender, RoutedEventArgs e) => SetPayment("cash");

    private void OnPayUpi(object? sender, RoutedEventArgs e) => SetPayment("upi");

    private void OnPayCard(object? sender, RoutedEventArgs e) => SetPayment("card");

    private void SetPayment(string? method)
    {
        if (_draft == null) return;

        _draft.PaymentMethod = method;
        _draft.IsDirty = true;
        RenderEditor();
    }

    // ── Saving ──────────────────────────────────────────────────────────────
    private async void OnSaveEdit(object? sender, RoutedEventArgs e)
    {
        if (ParentWindow == null || _draft == null || _editing == null || _saving) return;

        if (!_draft.HasLines)
        {
            ToastHost.Error("An order needs at least one item. Cancel it instead.");
            return;
        }

        // Text boxes are only read here, so typing never fights the re-render.
        _draft.CustomerName = (TxtEditName.Text ?? "").Trim();
        _draft.CustomerPhone = (TxtEditPhone.Text ?? "").Trim();

        _saving = true;
        BtnEditSave.IsEnabled = false;
        LblEditSave.Text = "Saving…";

        try
        {
            var result = await ParentWindow.Api.UpdateOrderAsync(_draft);

            if (result.success)
            {
                // Fold the change into the card that's already on screen.
                _draft.ApplyTo(_editing);

                _saving = false;
                EditOverlay.IsVisible = false;
                _editing = null;
                _draft = null;

                Render();
                ToastHost.Success("Order updated");

                // Re-read so server-assigned line ids replace the local placeholders.
                await LoadAsync();
            }
            else
            {
                ToastHost.Error(string.IsNullOrWhiteSpace(result.error)
                    ? "Could not save the order"
                    : result.error);
            }
        }
        catch (Exception ex)
        {
            ToastHost.Error("Could not save the order: " + ex.Message);
        }
        finally
        {
            _saving = false;
            LblEditSave.Text = "Save changes";
            if (_draft != null) RenderEditTotals();
        }
    }

    private string Money(decimal value) => ParentWindow?.Api.Money(value) ?? "\u20B9" + value.ToString("N0");
}
