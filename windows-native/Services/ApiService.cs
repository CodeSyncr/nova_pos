using NovaPOS.Desktop.Models;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Services;

public class ApiService
{
    private const string SUPABASE_URL = "https://yrqyuiyblhkomfbklpzy.supabase.co";
    private const string SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycXl1aXlibGhrb21mYmtscHp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY0NjgyMCwiZXhwIjoyMDk1MjIyODIwfQ.5JyuiYLx_rhO4lAR9I9mHAwvZqYO7XTEJcJfpS9YDJ4";

    private readonly HttpClient _http;

    // Auth state
    public bool IsAuthenticated { get; private set; }
    public string AccessToken { get; private set; } = "";
    public string UserId { get; private set; } = "";
    public string UserEmail { get; private set; } = "";
    public string TenantId { get; private set; } = "";
    public string TenantName { get; private set; } = "";
    public string DisplayName { get; private set; } = "";
    public string CurrencySymbol { get; private set; } = "\u20B9";
    public decimal TaxRate { get; private set; }

    /// <summary>Tables configured in tenant settings (same source the web POS uses).</summary>
    public List<TableRecord> ConfiguredTables { get; private set; } = new();

    // ── Bill data, read from tenant.settings for the thermal receipt ─────────

    /// <summary>UPI handle used for the pay-by-QR block on unsettled bills.</summary>
    public string? UpiId { get; private set; }

    /// <summary>Google review URL printed as a QR on completed bills.</summary>
    public string? ReviewLink { get; private set; }

    /// <summary>tenant.settings.billTemplates.thermal, with defaults when absent.</summary>
    public BillTemplate Thermal { get; private set; } = new();

    public ApiService()
    {
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    public async Task<(bool success, string error)> LoginAsync(string email, string password)
    {
        try
        {
            string url = SUPABASE_URL + "/auth/v1/token?grant_type=password";
            string body = JsonSerializer.Serialize(new { email, password });

            var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Add("apikey", SUPABASE_KEY);
            req.Content = new StringContent(body, Encoding.UTF8, "application/json");

            var resp = await _http.SendAsync(req);
            string res = await resp.Content.ReadAsStringAsync();

            using var doc = Parse(res);
            var root = doc?.RootElement;

            if (!resp.IsSuccessStatusCode)
            {
                string? message =
                    Str(root, "error_description") ??
                    Str(root, "msg") ??
                    Str(root, "message") ??
                    Str(root, "error");
                return (false, message ?? $"Authentication failed ({(int)resp.StatusCode})");
            }

            string? token = Str(root, "access_token");
            if (string.IsNullOrEmpty(token))
                return (false, "Token missing from response.");

            AccessToken = token;

            if (root.HasValue && root.Value.TryGetProperty("user", out var user))
            {
                UserId = Str(user, "id") ?? "";
                UserEmail = Str(user, "email") ?? email;
            }
            else
            {
                UserEmail = email;
            }

            IsAuthenticated = true;
            await LoadWorkspaceAsync();
            return (true, "");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public void Logout()
    {
        IsAuthenticated = false;
        AccessToken = "";
        UserId = "";
        UserEmail = "";
        TenantId = "";
        TenantName = "";
        DisplayName = "";
        ConfiguredTables = new List<TableRecord>();
    }

    /// <summary>Resolves tenant, display name, currency and tax rate after sign-in.</summary>
    private async Task LoadWorkspaceAsync()
    {
        try
        {
            string json = await GetAsync($"profile_tenants?profile_id=eq.{UserId}&select=tenant_id&limit=1");
            using var doc = Parse(json);
            if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                TenantId = Str(doc.RootElement[0], "tenant_id") ?? "";
        }
        catch { }

        if (!string.IsNullOrEmpty(TenantId))
        {
            try
            {
                string json = await GetAsync($"tenants?id=eq.{TenantId}&select=name,settings&limit=1");
                using var doc = Parse(json);
                if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                {
                    var tenant = doc.RootElement[0];
                    TenantName = Str(tenant, "name") ?? "";

                    if (tenant.TryGetProperty("settings", out var settings) &&
                        settings.ValueKind == JsonValueKind.Object)
                    {
                        CurrencySymbol = Str(settings, "currencySymbol") ?? CurrencySymbol;
                        TaxRate = Dec(settings, "taxRate");

                        UpiId = Blank(Str(settings, "upiId"));
                        ReviewLink = Blank(Str(settings, "googleReviewLink") ?? Str(settings, "reviewLink"));
                        Thermal = ReadThermalTemplate(settings);

                        if (settings.TryGetProperty("tables", out var tables) &&
                            tables.ValueKind == JsonValueKind.Array)
                        {
                            ConfiguredTables = tables.EnumerateArray()
                                .Select(t => new TableRecord
                                {
                                    Id = Str(t, "id") ?? "",
                                    Number = Str(t, "name") ?? Str(t, "number") ?? ""
                                })
                                .Where(t => !string.IsNullOrEmpty(t.Number))
                                .ToList();
                        }
                    }
                }
            }
            catch { }
        }

        try
        {
            string json = await GetAsync($"profiles?id=eq.{UserId}&select=full_name&limit=1");
            using var doc = Parse(json);
            if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                DisplayName = Str(doc.RootElement[0], "full_name") ?? "";
        }
        catch { }

        if (string.IsNullOrWhiteSpace(DisplayName))
        {
            int at = UserEmail.IndexOf('@');
            DisplayName = at > 0 ? UserEmail[..at] : UserEmail;
        }
    }

    // ── Menu ────────────────────────────────────────────────────────────────
    public async Task<List<MenuCategory>> GetCategoriesAsync()
    {
        var list = new List<MenuCategory>();
        try
        {
            string json = await GetAsync($"menu_categories?tenant_id=eq.{TenantId}&order=position.asc");
            using var doc = Parse(json);
            if (doc == null || doc.RootElement.ValueKind != JsonValueKind.Array) return list;

            foreach (var d in doc.RootElement.EnumerateArray())
            {
                list.Add(new MenuCategory
                {
                    Id = Str(d, "id") ?? "",
                    Name = Str(d, "name") ?? "",
                    Position = (int)Dec(d, "position")
                });
            }
        }
        catch { }
        return list;
    }

    /// <summary>
    /// Same embedded select the web POS page uses, so variants and the toppings
    /// linked to each item come down with the menu in one round trip.
    /// </summary>
    private const string MenuItemSelect =
        "id,name,description,base_price,category_id,image_url," +
        "menu_item_variants(id,name,price_modifier,is_default)," +
        "menu_item_toppings(topping:topping_id(id,name,price,description))";

    public async Task<List<PosMenuItem>> GetMenuItemsAsync()
    {
        var list = new List<PosMenuItem>();
        try
        {
            string json = await GetAsync(
                $"menu_items?tenant_id=eq.{TenantId}&is_active=eq.true&select={MenuItemSelect}");
            using var doc = Parse(json);
            if (doc == null || doc.RootElement.ValueKind != JsonValueKind.Array) return list;

            foreach (var d in doc.RootElement.EnumerateArray())
            {
                var item = new PosMenuItem
                {
                    Id = Str(d, "id") ?? "",
                    Name = Str(d, "name") ?? "Unnamed",
                    Description = Str(d, "description"),
                    BasePrice = Dec(d, "base_price"),
                    CategoryId = Str(d, "category_id") ?? "",
                    ImageUrl = Str(d, "image_url")
                };

                if (d.TryGetProperty("menu_item_variants", out var variants) &&
                    variants.ValueKind == JsonValueKind.Array)
                {
                    foreach (var v in variants.EnumerateArray())
                    {
                        item.Variants.Add(new MenuItemVariant
                        {
                            Id = Str(v, "id") ?? "",
                            Name = Str(v, "name") ?? "",
                            PriceModifier = Dec(v, "price_modifier"),
                            IsDefault = Str(v, "is_default") == "true"
                        });
                    }
                }

                if (d.TryGetProperty("menu_item_toppings", out var links) &&
                    links.ValueKind == JsonValueKind.Array)
                {
                    foreach (var link in links.EnumerateArray())
                    {
                        if (!link.TryGetProperty("topping", out var topping)) continue;

                        // The embed resolves to an object, or an array when the
                        // relationship is treated as one-to-many.
                        var element = topping.ValueKind == JsonValueKind.Array
                            ? (topping.GetArrayLength() > 0 ? topping[0] : default)
                            : topping;

                        if (element.ValueKind != JsonValueKind.Object) continue;

                        string id = Str(element, "id") ?? "";
                        if (id.Length == 0 || item.Toppings.Any(t => t.Id == id)) continue;

                        item.Toppings.Add(new ToppingOption
                        {
                            Id = id,
                            Name = Str(element, "name") ?? "",
                            Price = Dec(element, "price"),
                            Description = Str(element, "description")
                        });
                    }
                }

                list.Add(item);
            }
        }
        catch { }
        return list;
    }

    /// <summary>
    /// Tables come from tenant settings (as on web); occupancy is derived from
    /// orders that haven't been completed or cancelled.
    /// </summary>
    public async Task<List<TableRecord>> GetTablesAsync()
    {
        var tables = ConfiguredTables
            .Select(t => new TableRecord { Id = t.Id, Number = t.Number })
            .ToList();

        if (tables.Count == 0)
        {
            try
            {
                string json = await GetAsync($"tables?tenant_id=eq.{TenantId}&select=id,number");
                using var doc = Parse(json);
                if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    tables = doc.RootElement.EnumerateArray()
                        .Select(d => new TableRecord
                        {
                            Id = Str(d, "id") ?? "",
                            Number = Str(d, "number") ?? ""
                        })
                        .Where(t => !string.IsNullOrEmpty(t.Number))
                        .ToList();
                }
            }
            catch { }
        }

        try
        {
            string json = await GetAsync(
                $"orders?tenant_id=eq.{TenantId}&status=not.in.(completed,cancelled)&select=table_number");
            using var doc = Parse(json);
            if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var busy = doc.RootElement.EnumerateArray()
                    .Select(d => Str(d, "table_number"))
                    .Where(n => !string.IsNullOrEmpty(n))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                foreach (var t in tables)
                    t.IsOccupied = busy.Contains(t.Number);
            }
        }
        catch { }

        return tables;
    }

    // ── Orders ──────────────────────────────────────────────────────────────
    // payment_method matters to the bill: ReceiptBuilder prints the pay-by-UPI QR
    // only while an order is unsettled, so omitting it made every receipt show one.
    // order_items carries id/menu_item_id/variant_id/unit_price so an order can be
    // edited: a save needs line identity to tell an amended line from a new one.
    private const string OrderSelect =
        "id,table_number,customer_name,customer_phone,order_type,subtotal,tax,discount_amount,discount_type,discount_value,space_rental_amount,total,status,payment_method,created_at," +
        "order_items(id,menu_item_id,variant_id,name,quantity,unit_price,total_price,notes)";

    public async Task<List<OrderRecord>> GetOrdersAsync(int limit = 120)
    {
        var list = new List<OrderRecord>();
        try
        {
            string json = await GetAsync(
                $"orders?tenant_id=eq.{TenantId}&select={OrderSelect}&order=created_at.desc&limit={limit}");
            using var doc = Parse(json);
            if (doc == null || doc.RootElement.ValueKind != JsonValueKind.Array) return list;

            foreach (var d in doc.RootElement.EnumerateArray())
                list.Add(ReadOrder(d));
        }
        catch { }
        return list;
    }

    /// <summary>
    /// Fetches one order with its lines. Used after placing an order at the till so
    /// the receipt carries the server-assigned id and timestamp rather than a local
    /// reconstruction.
    /// </summary>
    public async Task<OrderRecord?> GetOrderAsync(string orderId)
    {
        if (string.IsNullOrWhiteSpace(orderId)) return null;

        try
        {
            string json = await GetAsync($"orders?id=eq.{orderId}&select={OrderSelect}&limit=1");
            using var doc = Parse(json);
            if (doc == null || doc.RootElement.ValueKind != JsonValueKind.Array ||
                doc.RootElement.GetArrayLength() == 0)
            {
                return null;
            }

            return ReadOrder(doc.RootElement[0]);
        }
        catch { return null; }
    }

    public async Task<DashboardSnapshot> GetDashboardAsync()
    {
        var snap = new DashboardSnapshot();
        try
        {
            var now = DateTime.Now;
            string todayStart = new DateTime(now.Year, now.Month, now.Day).ToString("o");
            string yesterdayStart = new DateTime(now.Year, now.Month, now.Day).AddDays(-1).ToString("o");

            // Today's orders, with items, so top sellers can be computed locally.
            string todayJson = await GetAsync(
                $"orders?tenant_id=eq.{TenantId}&created_at=gte.{Uri.EscapeDataString(todayStart)}&select={OrderSelect}&order=created_at.desc");

            var today = new List<OrderRecord>();
            using (var doc = Parse(todayJson))
            {
                if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array)
                    today.AddRange(doc.RootElement.EnumerateArray().Select(ReadOrder));
            }

            var completed = today.Where(o => o.Status == "completed").ToList();
            snap.TodayRevenue = completed.Sum(o => o.Total);
            snap.OrdersToday = today.Count;
            snap.CompletedToday = completed.Count;
            snap.AvgTicket = completed.Count > 0 ? snap.TodayRevenue / completed.Count : 0;
            snap.RecentOrders = today.Take(6).ToList();

            snap.Customers = today
                .Select(o => (string.IsNullOrWhiteSpace(o.CustomerPhone) ? o.CustomerName : o.CustomerPhone).Trim().ToLowerInvariant())
                .Where(k => k.Length > 0)
                .Distinct()
                .Count();

            snap.TopItems = today
                .SelectMany(o => o.Items)
                .GroupBy(i => i.Name)
                .Select(g => new TopItem
                {
                    Name = g.Key,
                    Quantity = g.Sum(i => i.Quantity),
                    Revenue = g.Sum(i => i.TotalPrice)
                })
                .OrderByDescending(i => i.Quantity)
                .Take(5)
                .ToList();

            // Yesterday's completed revenue, for the trend pill.
            string ydayJson = await GetAsync(
                $"orders?tenant_id=eq.{TenantId}&status=eq.completed&created_at=gte.{Uri.EscapeDataString(yesterdayStart)}&created_at=lt.{Uri.EscapeDataString(todayStart)}&select=total");
            decimal yesterdayRevenue = 0;
            using (var doc = Parse(ydayJson))
            {
                if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array)
                    yesterdayRevenue = doc.RootElement.EnumerateArray().Sum(d => Dec(d, "total"));
            }

            snap.RevenueChangePct = yesterdayRevenue > 0
                ? (int)Math.Round((double)((snap.TodayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
                : snap.TodayRevenue > 0 ? 100 : 0;

            // Active (not completed/cancelled) orders across all days.
            string activeJson = await GetAsync(
                $"orders?tenant_id=eq.{TenantId}&status=in.(pending,confirmed,preparing,ready)&select={OrderSelect}&order=created_at.desc&limit=10");
            using (var doc = Parse(activeJson))
            {
                if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Array)
                    snap.ActiveOrders = doc.RootElement.EnumerateArray().Select(ReadOrder).ToList();
            }

            snap.PendingCount = snap.ActiveOrders.Count;
        }
        catch { }
        return snap;
    }

    public async Task<bool> UpdateOrderStatusAsync(string orderId, string status)
    {
        try
        {
            string body = status == "completed"
                ? JsonSerializer.Serialize(new { status, completed_at = DateTime.UtcNow.ToString("o") })
                : JsonSerializer.Serialize(new { status });

            var resp = await PatchAsync($"orders?id=eq.{orderId}", body);
            return resp;
        }
        catch { return false; }
    }

    public Task<bool> CompleteOrderAsync(string orderId) => UpdateOrderStatusAsync(orderId, "completed");

    /// <summary>
    /// Saves an edited order: reconciles its lines, then rewrites the header with
    /// the recomputed money figures.
    /// <para>
    /// Lines are reconciled rather than replaced wholesale — removed lines are
    /// deleted, amended lines patched, new lines inserted — so order_items ids stay
    /// stable for anything referencing them, and an untouched line generates no
    /// write at all.
    /// </para>
    /// <para>
    /// PostgREST gives no cross-table transaction here, so the header is written
    /// last: if a line write fails the totals still describe the lines actually
    /// stored, rather than promising a total the items don't add up to.
    /// </para>
    /// </summary>
    public async Task<(bool success, string error)> UpdateOrderAsync(OrderEditDraft draft)
    {
        if (string.IsNullOrWhiteSpace(draft.OrderId))
            return (false, "The order is missing an id.");

        if (!draft.HasLines)
            return (false, "An order needs at least one item. Cancel it instead.");

        try
        {
            // ── Removed lines ──────────────────────────────────────────────
            var removedIds = draft.Lines
                .Where(l => l.IsRemoved && !l.IsNew)
                .Select(l => l.Id)
                .ToList();

            if (removedIds.Count > 0)
            {
                string list = string.Join(",", removedIds.Select(Uri.EscapeDataString));
                if (!await DeleteAsync($"order_items?id=in.({list})"))
                    return (false, "Could not remove the deleted items.");
            }

            // ── Amended lines ──────────────────────────────────────────────
            foreach (var line in draft.Lines.Where(l => l.IsModified))
            {
                string body = JsonSerializer.Serialize(new Dictionary<string, object?>
                {
                    ["quantity"] = line.Quantity,
                    ["unit_price"] = line.UnitPrice,
                    ["total_price"] = line.LineTotal,
                    ["notes"] = line.Notes
                });

                if (!await PatchAsync($"order_items?id=eq.{Uri.EscapeDataString(line.Id)}", body))
                    return (false, $"Could not update '{line.Name}'.");
            }

            // ── Added lines ────────────────────────────────────────────────
            var added = draft.Lines.Where(l => l.IsNew && !l.IsRemoved).ToList();
            if (added.Count > 0)
            {
                var payload = added.Select(l => new Dictionary<string, object?>
                {
                    ["order_id"] = draft.OrderId,
                    ["menu_item_id"] = l.MenuItemId,
                    ["variant_id"] = l.VariantId,
                    ["name"] = l.Name,
                    ["quantity"] = l.Quantity,
                    ["unit_price"] = l.UnitPrice,
                    ["total_price"] = l.LineTotal,
                    ["notes"] = l.Notes
                }).ToList();

                string response = await PostAsync("order_items", JsonSerializer.Serialize(payload));

                bool ok;
                using (var doc = Parse(response))
                {
                    ok = doc != null &&
                         doc.RootElement.ValueKind == JsonValueKind.Array &&
                         doc.RootElement.GetArrayLength() == payload.Count;

                    if (!ok && doc != null && doc.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        string? message = Str(doc.RootElement, "message") ?? Str(doc.RootElement, "details");
                        return (false, message ?? "Could not add the new items.");
                    }
                }

                if (!ok) return (false, "Could not add the new items.");
            }

            // ── Header ─────────────────────────────────────────────────────
            var header = new Dictionary<string, object?>
            {
                ["table_number"] = draft.OrderType == "dine_in" && draft.TableNumber.Length > 0
                    ? draft.TableNumber
                    : null,
                ["order_type"] = draft.OrderType,
                ["customer_name"] = Blank(draft.CustomerName),
                ["customer_phone"] = Blank(draft.CustomerPhone),
                ["subtotal"] = draft.Subtotal,
                ["tax"] = draft.Tax,
                ["discount_amount"] = draft.DiscountAmount,
                ["discount_type"] = draft.DiscountKind switch
                {
                    OrderDiscountKind.Percent => "percent",
                    OrderDiscountKind.Flat => "flat",
                    _ => null
                },
                ["discount_value"] = draft.DiscountKind == OrderDiscountKind.None
                    ? null
                    : draft.DiscountInput,
                ["space_rental_amount"] = draft.SpaceRentalAmount,
                ["total"] = draft.Total,
                ["payment_method"] = Blank(draft.PaymentMethod)
            };

            if (!await PatchAsync($"orders?id=eq.{draft.OrderId}", JsonSerializer.Serialize(header)))
                return (false, "The items were saved but the order totals were not.");

            return (true, "");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Writes the order the same shape the web <c>createOrder</c> server action
    /// does — order_type, tax, and per-item variant_id / unit_price / notes — so a
    /// customised line survives into the order history and onto the bill. Talking
    /// to Supabase directly also means the till doesn't need the web server up.
    /// </summary>
    /// <returns>
    /// The new order's id on success, so the caller can fetch it back and print a
    /// receipt without reconstructing the order locally.
    /// </returns>
    public async Task<(bool success, string error, string orderId)> PlaceOrderAsync(
        string tableNumber,
        string customerName,
        string customerPhone,
        string orderType,
        List<CartItem> cart)
    {
        try
        {
            decimal subtotal = cart.Sum(c => c.LineTotal);
            decimal tax = Math.Round(subtotal * (TaxRate / 100m), 2);
            decimal total = subtotal + tax;

            var order = new Dictionary<string, object?>
            {
                ["tenant_id"] = TenantId,
                ["table_number"] = orderType == "dine_in" && tableNumber.Length > 0 ? tableNumber : null,
                ["order_type"] = orderType,
                ["customer_name"] = customerName.Length > 0 ? customerName : null,
                ["customer_phone"] = customerPhone.Length > 0 ? customerPhone : null,
                ["subtotal"] = subtotal,
                ["tax"] = tax,
                ["discount_amount"] = 0,
                ["total"] = total,
                ["status"] = "pending"
            };

            if (UserId.Length > 0) order["created_by"] = UserId;

            string created = await PostAsync("orders", JsonSerializer.Serialize(new[] { order }));

            string? orderId = null;
            string? insertError = null;
            using (var doc = Parse(created))
            {
                if (doc != null)
                {
                    if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                        orderId = Str(doc.RootElement[0], "id");
                    else if (doc.RootElement.ValueKind == JsonValueKind.Object)
                        insertError = Str(doc.RootElement, "message") ?? Str(doc.RootElement, "details");
                }
            }

            if (string.IsNullOrEmpty(orderId))
                return (false, insertError ?? "Could not create the order", "");

            var items = cart.Select(c => new Dictionary<string, object?>
            {
                ["order_id"] = orderId,
                ["menu_item_id"] = c.Item.Id,
                ["variant_id"] = c.Variant?.Id,
                ["name"] = c.Item.Name,
                ["quantity"] = c.Quantity,
                ["unit_price"] = c.UnitPrice,
                ["total_price"] = c.LineTotal,
                ["notes"] = c.Notes
            }).ToList();

            string itemsResponse = await PostAsync("order_items", JsonSerializer.Serialize(items));

            bool itemsOk;
            using (var doc = Parse(itemsResponse))
            {
                itemsOk = doc != null &&
                          doc.RootElement.ValueKind == JsonValueKind.Array &&
                          doc.RootElement.GetArrayLength() == items.Count;

                if (!itemsOk)
                {
                    insertError = doc != null && doc.RootElement.ValueKind == JsonValueKind.Object
                        ? Str(doc.RootElement, "message") ?? Str(doc.RootElement, "details")
                        : null;
                }
            }

            if (!itemsOk)
            {
                // Don't leave a headless order behind.
                await DeleteAsync("orders?id=eq." + orderId);
                return (false, insertError ?? "Could not save the order lines", "");
            }

            return (true, "", orderId);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, "");
        }
    }

    /// <summary>
    /// Reads tenant.settings.billTemplates.thermal. Unset keys keep the
    /// <see cref="BillTemplate"/> defaults, so a tenant that never opened the bill
    /// designer still gets a sensible receipt.
    /// </summary>
    private static BillTemplate ReadThermalTemplate(JsonElement settings)
    {
        var template = new BillTemplate();

        if (!settings.TryGetProperty("billTemplates", out var templates) ||
            templates.ValueKind != JsonValueKind.Object ||
            !templates.TryGetProperty("thermal", out var thermal) ||
            thermal.ValueKind != JsonValueKind.Object)
        {
            return template;
        }

        template.ShowLogo = Bool(thermal, "showLogo", template.ShowLogo);
        template.ShowAddress = Bool(thermal, "showAddress", template.ShowAddress);
        template.ShowPhone = Bool(thermal, "showPhone", template.ShowPhone);
        template.ShowOrderType = Bool(thermal, "showOrderType", template.ShowOrderType);
        template.ShowTable = Bool(thermal, "showTable", template.ShowTable);
        template.ShowThankYou = Bool(thermal, "showThankYou", template.ShowThankYou);
        template.ShowTaxLine = Bool(thermal, "showTaxLine", template.ShowTaxLine);

        template.HeaderText = Str(thermal, "headerText") ?? template.HeaderText;
        template.TaglineText = Str(thermal, "taglineText") ?? template.TaglineText;
        template.AddressText = Str(thermal, "addressText") ?? template.AddressText;
        template.PhoneText = Str(thermal, "phoneText") ?? template.PhoneText;
        template.FooterText = Str(thermal, "footerText") ?? template.FooterText;

        return template;
    }

    private static bool Bool(JsonElement parent, string key, bool fallback)
    {
        if (parent.ValueKind != JsonValueKind.Object) return fallback;
        if (!parent.TryGetProperty(key, out var value)) return fallback;

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => !string.Equals(value.GetString(), "false", StringComparison.OrdinalIgnoreCase),
            JsonValueKind.Number => value.TryGetDecimal(out var n) && n != 0,
            _ => fallback
        };
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // ── Reading helpers ─────────────────────────────────────────────────────
    private static OrderRecord ReadOrder(JsonElement d)
    {
        var order = new OrderRecord
        {
            Id = Str(d, "id") ?? "",
            TableNumber = Str(d, "table_number") ?? "",
            CustomerName = Str(d, "customer_name") ?? "",
            CustomerPhone = Str(d, "customer_phone") ?? "",
            OrderType = Str(d, "order_type") ?? "dine_in",
            Subtotal = Dec(d, "subtotal"),
            Tax = Dec(d, "tax"),
            DiscountAmount = Dec(d, "discount_amount"),
            SpaceRentalAmount = Dec(d, "space_rental_amount"),
            Total = Dec(d, "total"),
            Status = (Str(d, "status") ?? "pending").ToLowerInvariant(),
            PaymentMethod = Blank(Str(d, "payment_method")),
            DiscountType = Blank(Str(d, "discount_type"))
        };

        if (d.ValueKind == JsonValueKind.Object &&
            d.TryGetProperty("discount_value", out var discountValue) &&
            discountValue.ValueKind == JsonValueKind.Number &&
            discountValue.TryGetDecimal(out var parsedDiscount))
        {
            order.DiscountValue = parsedDiscount;
        }

        if (DateTime.TryParse(Str(d, "created_at"), CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var created))
        {
            order.CreatedAt = created;
        }

        if (d.TryGetProperty("order_items", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var i in items.EnumerateArray())
            {
                order.Items.Add(new OrderItemRecord
                {
                    Id = Str(i, "id") ?? "",
                    MenuItemId = Blank(Str(i, "menu_item_id")),
                    VariantId = Blank(Str(i, "variant_id")),
                    Name = Str(i, "name") ?? "",
                    Quantity = (int)Dec(i, "quantity"),
                    UnitPrice = Dec(i, "unit_price"),
                    TotalPrice = Dec(i, "total_price"),
                    Notes = Str(i, "notes")
                });
            }
        }

        return order;
    }

    private static JsonDocument? Parse(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonDocument.Parse(json); }
        catch { return null; }
    }

    private static string? Str(JsonElement? parent, string key)
        => parent.HasValue ? Str(parent.Value, key) : null;

    private static string? Str(JsonElement parent, string key)
    {
        if (parent.ValueKind != JsonValueKind.Object) return null;
        if (!parent.TryGetProperty(key, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };
    }

    private static decimal Dec(JsonElement parent, string key)
    {
        if (parent.ValueKind != JsonValueKind.Object) return 0;
        if (!parent.TryGetProperty(key, out var value)) return 0;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var d)) return d;
        if (value.ValueKind == JsonValueKind.String &&
            decimal.TryParse(value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var s)) return s;
        return 0;
    }

    // ── HTTP ────────────────────────────────────────────────────────────────
    private async Task<string> GetAsync(string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, SUPABASE_URL + "/rest/v1/" + path);
        req.Headers.Add("apikey", SUPABASE_KEY);
        if (!string.IsNullOrEmpty(AccessToken))
            req.Headers.Add("Authorization", "Bearer " + AccessToken);

        var resp = await _http.SendAsync(req);
        return await resp.Content.ReadAsStringAsync();
    }

    private async Task<bool> PatchAsync(string path, string jsonBody)
    {
        var req = new HttpRequestMessage(new HttpMethod("PATCH"), SUPABASE_URL + "/rest/v1/" + path);
        req.Headers.Add("apikey", SUPABASE_KEY);
        if (!string.IsNullOrEmpty(AccessToken))
            req.Headers.Add("Authorization", "Bearer " + AccessToken);
        req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

        var resp = await _http.SendAsync(req);
        return resp.IsSuccessStatusCode;
    }

    private async Task<string> PostAsync(string path, string jsonBody)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, SUPABASE_URL + "/rest/v1/" + path);
        req.Headers.Add("apikey", SUPABASE_KEY);
        if (!string.IsNullOrEmpty(AccessToken))
            req.Headers.Add("Authorization", "Bearer " + AccessToken);
        req.Headers.Add("Prefer", "return=representation");
        req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

        var resp = await _http.SendAsync(req);
        return await resp.Content.ReadAsStringAsync();
    }

    private async Task<bool> DeleteAsync(string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Delete, SUPABASE_URL + "/rest/v1/" + path);
        req.Headers.Add("apikey", SUPABASE_KEY);
        if (!string.IsNullOrEmpty(AccessToken))
            req.Headers.Add("Authorization", "Bearer " + AccessToken);

        var resp = await _http.SendAsync(req);
        return resp.IsSuccessStatusCode;
    }

    /// <summary>Formats money the way the web app does: symbol + grouped integer.</summary>
    public string Money(decimal value) =>
        CurrencySymbol + value.ToString("N0", CultureInfo.GetCultureInfo("en-IN"));
}
