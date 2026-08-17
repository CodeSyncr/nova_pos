using System;
using System.Collections.Generic;
using System.Linq;

namespace NovaPOS.Desktop.Models;

public class MenuCategory
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Position { get; set; }
}

public class MenuItemVariant
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal PriceModifier { get; set; }
    public bool IsDefault { get; set; }
}

public class ToppingOption
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string? Description { get; set; }
}

public class PosMenuItem
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public string CategoryId { get; set; } = "";
    public string? ImageUrl { get; set; }
    public List<MenuItemVariant> Variants { get; set; } = new();
    public List<ToppingOption> Toppings { get; set; } = new();

    /// <summary>
    /// Same rule the web POS uses to decide between "add straight to cart" and
    /// "open the customisation sheet".
    /// </summary>
    public bool NeedsCustomisation => Variants.Count > 1 || Toppings.Count > 0;

    public MenuItemVariant? DefaultVariant =>
        Variants.FirstOrDefault(v => v.IsDefault) ?? Variants.FirstOrDefault();
}

public class CartItem
{
    public PosMenuItem Item { get; set; } = new();
    public MenuItemVariant? Variant { get; set; }
    public List<ToppingOption> Toppings { get; set; } = new();
    public int Quantity { get; set; }

    public decimal UnitPrice =>
        Item.BasePrice + (Variant?.PriceModifier ?? 0) + Toppings.Sum(t => t.Price);

    public decimal LineTotal => UnitPrice * Quantity;

    /// <summary>Identity for merging: same item, same variant, same set of add-ons.</summary>
    public string Signature =>
        Item.Id + "|" + (Variant?.Id ?? "") + "|" +
        string.Join(",", Toppings.Select(t => t.Id).OrderBy(id => id, StringComparer.Ordinal));

    /// <summary>"Large · 2 add-ons" — the sub-line shown under the cart row.</summary>
    public string Subtitle
    {
        get
        {
            var parts = new List<string>();
            if (Variant != null && !string.IsNullOrWhiteSpace(Variant.Name)) parts.Add(Variant.Name);
            if (Toppings.Count > 0)
                parts.Add(Toppings.Count == 1 ? "1 add-on" : Toppings.Count + " add-ons");
            return string.Join(" · ", parts);
        }
    }

    /// <summary>Note persisted on the order item, worded exactly as createOrder does.</summary>
    public string? Notes
    {
        get
        {
            string toppings = string.Join(", ", Toppings.Select(t => t.Name));
            if (Variant != null)
            {
                return toppings.Length > 0
                    ? $"Variant: {Variant.Name}, Toppings: {toppings}"
                    : $"Variant: {Variant.Name}";
            }
            return toppings.Length > 0 ? $"Toppings: {toppings}" : null;
        }
    }
}

public class OrderItemRecord
{
    /// <summary>
    /// The order_items row id. Needed to edit an order: without it a saved change
    /// can't tell an amended line from a new one.
    /// </summary>
    public string Id { get; set; } = "";

    public string? MenuItemId { get; set; }
    public string? VariantId { get; set; }
    public string Name { get; set; } = "";
    public int Quantity { get; set; }

    /// <summary>Price for one unit, as stored. Kept so quantity edits can re-total.</summary>
    public decimal UnitPrice { get; set; }

    public decimal TotalPrice { get; set; }
    public string? Notes { get; set; }

    /// <summary>Falls back to dividing the line total when unit_price is absent.</summary>
    public decimal EffectiveUnitPrice =>
        UnitPrice > 0 ? UnitPrice
        : Quantity > 0 ? decimal.Round(TotalPrice / Quantity, 2)
        : 0;
}

public class OrderRecord
{
    public string Id { get; set; } = "";
    public string ShortId => Id.Length >= 8 ? Id[..8].ToUpperInvariant() : Id.ToUpperInvariant();
    public string TableNumber { get; set; } = "";
    public string CustomerName { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public string OrderType { get; set; } = "dine_in";
    public decimal Subtotal { get; set; }
    public decimal Tax { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal SpaceRentalAmount { get; set; }
    public decimal Total { get; set; }
    public string Status { get; set; } = "pending";
    public string? PaymentMethod { get; set; }
    public string? DiscountType { get; set; }
    public decimal? DiscountValue { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<OrderItemRecord> Items { get; set; } = new();

    public int ItemCount => Items.Sum(i => i.Quantity);

    /// <summary>Matches the web card, which recomputes the payable figure.</summary>
    public decimal Payable => Subtotal + Tax - DiscountAmount + SpaceRentalAmount;

    public string RelativeTime
    {
        get
        {
            if (CreatedAt == default) return "";
            var minutes = (int)Math.Floor((DateTime.Now - CreatedAt.ToLocalTime()).TotalMinutes);
            if (minutes < 1) return "Just now";
            if (minutes < 60) return minutes + "m ago";
            var hours = minutes / 60;
            if (hours < 24) return hours + "h ago";
            return (hours / 24) + "d ago";
        }
    }

    public string ClockTime => CreatedAt == default
        ? ""
        : CreatedAt.ToLocalTime().ToString("hh:mm tt");
}

/// <summary>How a discount is expressed on an order.</summary>
public enum OrderDiscountKind
{
    None,
    Flat,
    Percent
}

/// <summary>
/// One editable line of an order being amended. Carries the values it was loaded
/// with so a save can tell an untouched line from a changed one and issue the
/// minimum number of writes.
/// </summary>
public class OrderLineDraft
{
    /// <summary>order_items.id, or empty for a line added during this edit.</summary>
    public string Id { get; set; } = "";

    public string? MenuItemId { get; set; }
    public string? VariantId { get; set; }
    public string Name { get; set; } = "";
    public int Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public string? Notes { get; set; }

    /// <summary>Marked for deletion. Kept in the list so the edit stays undoable.</summary>
    public bool IsRemoved { get; set; }

    // ── Loaded state, for change detection ──────────────────────────────────
    public int OriginalQuantity { get; set; }
    public decimal OriginalUnitPrice { get; set; }
    public string? OriginalNotes { get; set; }

    public bool IsNew => string.IsNullOrEmpty(Id);

    public decimal LineTotal => decimal.Round(UnitPrice * Quantity, 2);

    /// <summary>True when an existing line's stored values no longer match the draft.</summary>
    public bool IsModified =>
        !IsNew && !IsRemoved &&
        (Quantity != OriginalQuantity ||
         UnitPrice != OriginalUnitPrice ||
         (Notes ?? "") != (OriginalNotes ?? ""));

    public static OrderLineDraft From(OrderItemRecord item)
    {
        decimal unit = item.EffectiveUnitPrice;

        return new OrderLineDraft
        {
            Id = item.Id,
            MenuItemId = item.MenuItemId,
            VariantId = item.VariantId,
            Name = item.Name,
            Quantity = item.Quantity,
            UnitPrice = unit,
            Notes = item.Notes,
            OriginalQuantity = item.Quantity,
            OriginalUnitPrice = unit,
            OriginalNotes = item.Notes
        };
    }

    /// <summary>A brand-new line built from the menu, priced like the POS cart does.</summary>
    public static OrderLineDraft FromMenu(PosMenuItem item, MenuItemVariant? variant, int quantity = 1)
        => new()
        {
            MenuItemId = item.Id,
            VariantId = variant?.Id,
            Name = item.Name,
            Quantity = quantity,
            UnitPrice = item.BasePrice + (variant?.PriceModifier ?? 0),
            Notes = variant != null && !string.IsNullOrWhiteSpace(variant.Name)
                ? "Variant: " + variant.Name
                : null
        };

    /// <summary>Merge key, so bumping an existing line beats adding a duplicate.</summary>
    public string Signature => (MenuItemId ?? Name) + "|" + (VariantId ?? "");
}

/// <summary>
/// A working copy of an order while it is being edited. Nothing here touches the
/// server until it is saved, so an abandoned edit leaves the order untouched.
/// <para>
/// Totals follow the same arithmetic as <c>ApiService.PlaceOrderAsync</c> and
/// <c>OrderRecord.Payable</c>: tax is charged on the undiscounted subtotal, and the
/// discount comes off afterwards. Changing that here would make edited orders
/// disagree with newly placed ones.
/// </para>
/// </summary>
public class OrderEditDraft
{
    public string OrderId { get; set; } = "";
    public string ShortId { get; set; } = "";
    public string Status { get; set; } = "pending";

    public string TableNumber { get; set; } = "";
    public string CustomerName { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public string OrderType { get; set; } = "dine_in";
    public string? PaymentMethod { get; set; }

    public OrderDiscountKind DiscountKind { get; set; } = OrderDiscountKind.None;
    public decimal DiscountInput { get; set; }
    public decimal SpaceRentalAmount { get; set; }

    /// <summary>Percentage, taken from tenant settings at the time of the edit.</summary>
    public decimal TaxRate { get; set; }

    public List<OrderLineDraft> Lines { get; set; } = new();

    public IEnumerable<OrderLineDraft> ActiveLines => Lines.Where(l => !l.IsRemoved);

    public bool HasLines => ActiveLines.Any();

    public int ItemCount => ActiveLines.Sum(l => l.Quantity);

    public decimal Subtotal => decimal.Round(ActiveLines.Sum(l => l.LineTotal), 2);

    public decimal DiscountAmount
    {
        get
        {
            decimal amount = DiscountKind switch
            {
                OrderDiscountKind.Percent => Subtotal * (DiscountInput / 100m),
                OrderDiscountKind.Flat => DiscountInput,
                _ => 0
            };

            // Never let a discount exceed the bill or go negative.
            return decimal.Round(Math.Clamp(amount, 0, Subtotal), 2);
        }
    }

    public decimal Tax => decimal.Round(Subtotal * (TaxRate / 100m), 2);

    public decimal Total => decimal.Round(Subtotal + Tax - DiscountAmount + SpaceRentalAmount, 2);

    /// <summary>True when anything at all would be written on save.</summary>
    public bool IsDirty { get; set; }

    public static OrderEditDraft From(OrderRecord order, decimal taxRate)
    {
        var draft = new OrderEditDraft
        {
            OrderId = order.Id,
            ShortId = order.ShortId,
            Status = order.Status,
            TableNumber = order.TableNumber,
            CustomerName = order.CustomerName,
            CustomerPhone = order.CustomerPhone,
            OrderType = order.OrderType,
            PaymentMethod = order.PaymentMethod,
            SpaceRentalAmount = order.SpaceRentalAmount,
            TaxRate = taxRate,
            Lines = order.Items.Select(OrderLineDraft.From).ToList()
        };

        // Prefer the stored discount kind; fall back to a flat amount when only the
        // money figure was recorded.
        draft.DiscountKind = order.DiscountType?.ToLowerInvariant() switch
        {
            "percent" or "percentage" => OrderDiscountKind.Percent,
            "flat" or "fixed" or "amount" => OrderDiscountKind.Flat,
            _ => order.DiscountAmount > 0 ? OrderDiscountKind.Flat : OrderDiscountKind.None
        };

        draft.DiscountInput = draft.DiscountKind switch
        {
            OrderDiscountKind.Percent => order.DiscountValue ?? 0,
            OrderDiscountKind.Flat => order.DiscountValue ?? order.DiscountAmount,
            _ => 0
        };

        return draft;
    }

    /// <summary>
    /// Adds a menu item, bumping the quantity of an identical line rather than
    /// creating a duplicate — the same merge rule the POS cart uses.
    /// </summary>
    public void AddFromMenu(PosMenuItem item, MenuItemVariant? variant)
    {
        var candidate = OrderLineDraft.FromMenu(item, variant);

        var existing = ActiveLines.FirstOrDefault(l => l.Signature == candidate.Signature);
        if (existing != null) existing.Quantity++;
        else Lines.Add(candidate);

        IsDirty = true;
    }

    /// <summary>
    /// Applies the amended values back onto the record the list is showing, so the
    /// card refreshes without another round trip.
    /// </summary>
    public void ApplyTo(OrderRecord order)
    {
        order.TableNumber = TableNumber;
        order.CustomerName = CustomerName;
        order.CustomerPhone = CustomerPhone;
        order.OrderType = OrderType;
        order.PaymentMethod = PaymentMethod;
        order.Subtotal = Subtotal;
        order.Tax = Tax;
        order.DiscountAmount = DiscountAmount;
        order.SpaceRentalAmount = SpaceRentalAmount;
        order.Total = Total;
        order.DiscountType = DiscountKind switch
        {
            OrderDiscountKind.Percent => "percent",
            OrderDiscountKind.Flat => "flat",
            _ => null
        };
        order.DiscountValue = DiscountKind == OrderDiscountKind.None ? null : DiscountInput;

        order.Items = ActiveLines
            .Select(l => new OrderItemRecord
            {
                Id = l.Id,
                MenuItemId = l.MenuItemId,
                VariantId = l.VariantId,
                Name = l.Name,
                Quantity = l.Quantity,
                UnitPrice = l.UnitPrice,
                TotalPrice = l.LineTotal,
                Notes = l.Notes
            })
            .ToList();
    }
}

public class TableRecord
{
    public string Id { get; set; } = "";
    public string Number { get; set; } = "";
    public bool IsOccupied { get; set; }
}

public class TopItem
{
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
    public decimal Revenue { get; set; }
}

/// <summary>Everything the dashboard renders, matching the web owner dashboard.</summary>
public class DashboardSnapshot
{
    public decimal TodayRevenue { get; set; }
    public int OrdersToday { get; set; }
    public int CompletedToday { get; set; }
    public int PendingCount { get; set; }
    public int Customers { get; set; }
    public decimal AvgTicket { get; set; }
    public int RevenueChangePct { get; set; }
    public List<OrderRecord> ActiveOrders { get; set; } = new();
    public List<OrderRecord> RecentOrders { get; set; } = new();
    public List<TopItem> TopItems { get; set; } = new();
}
