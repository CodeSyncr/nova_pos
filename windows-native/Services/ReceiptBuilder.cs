using NovaPOS.Desktop.Models;
using System;
using System.Globalization;

namespace NovaPOS.Desktop.Services;

/// <summary>Thermal bill text, taken from tenant.settings.billTemplates.thermal.</summary>
public class BillTemplate
{
    public bool ShowLogo { get; set; }
    public bool ShowAddress { get; set; } = true;
    public bool ShowPhone { get; set; } = true;
    public bool ShowOrderType { get; set; } = true;
    public bool ShowTable { get; set; } = true;
    public bool ShowThankYou { get; set; } = true;
    public bool ShowTaxLine { get; set; } = true;

    /// <summary>Blank means "use the tenant name".</summary>
    public string HeaderText { get; set; } = "";
    public string TaglineText { get; set; } = "";
    public string AddressText { get; set; } = "";
    public string PhoneText { get; set; } = "";
    public string FooterText { get; set; } = "Thank you! Visit Again.";
}

/// <summary>
/// Renders an order as ESC/POS, following the same layout as
/// <c>printBillNative</c> in src/lib/bill-generator.ts: centred header block,
/// order meta rows, three-column item table, totals, a UPI QR while the order is
/// unpaid, then the footer and review QR.
/// </summary>
public static class ReceiptBuilder
{
    public static byte[] Build(
        OrderRecord order,
        BillTemplate template,
        string tenantName,
        string currencySymbol,
        string? reviewLink,
        string? upiId,
        int charWidth = 48)
    {
        // Thermal heads have no rupee glyph, so amounts print as "Rs".
        string symbol = currencySymbol is "\u20B9" or "₹" ? "Rs" : currencySymbol;
        string Amount(decimal value) => $"{symbol} {value.ToString("0.00", CultureInfo.InvariantCulture)}";

        var encoder = new EscPosEncoder();
        encoder.Initialize();

        // ── Header ─────────────────────────────────────────────────────────
        encoder.AlignCenter();
        encoder.Bold(true);
        encoder.SizeDouble();
        encoder.Line(string.IsNullOrWhiteSpace(template.HeaderText) ? tenantName : template.HeaderText);
        encoder.SizeNormal();
        encoder.Bold(false);

        if (!string.IsNullOrWhiteSpace(template.TaglineText)) encoder.Line(template.TaglineText);
        if (template.ShowAddress && !string.IsNullOrWhiteSpace(template.AddressText)) encoder.Line(template.AddressText);
        if (template.ShowPhone && !string.IsNullOrWhiteSpace(template.PhoneText)) encoder.Line(template.PhoneText);

        encoder.Divider(charWidth);

        // ── Order meta ─────────────────────────────────────────────────────
        encoder.AlignLeft();
        encoder.Row("Order #", "#" + order.ShortId, charWidth);
        encoder.Row("Date", FormatDate(order.CreatedAt), charWidth);

        if (template.ShowOrderType)
            encoder.Row("Type", order.OrderType.Replace('_', ' ').ToUpperInvariant(), charWidth);

        if (template.ShowTable && !string.IsNullOrWhiteSpace(order.TableNumber))
            encoder.Row("Table", order.TableNumber, charWidth);

        if (!string.IsNullOrWhiteSpace(order.CustomerName))
            encoder.Row("Customer", order.CustomerName, charWidth);

        if (!string.IsNullOrWhiteSpace(order.PaymentMethod))
            encoder.Row("Payment", order.PaymentMethod.ToUpperInvariant(), charWidth);

        encoder.Divider(charWidth);

        // ── Items ──────────────────────────────────────────────────────────
        encoder.Bold(true);
        encoder.ThreeColumnRow("ITEM", "QTY", "AMOUNT", charWidth);
        encoder.Bold(false);
        encoder.Divider(charWidth);

        foreach (var item in order.Items)
            encoder.ItemRow(item.Name, item.Quantity, Amount(item.TotalPrice), charWidth);

        encoder.Divider(charWidth);

        // ── Totals ─────────────────────────────────────────────────────────
        if (template.ShowTaxLine && order.Tax > 0) encoder.Row("Tax", Amount(order.Tax), charWidth);
        if (order.SpaceRentalAmount > 0) encoder.Row("Space Rental", Amount(order.SpaceRentalAmount), charWidth);
        if (order.DiscountAmount > 0) encoder.Row("Discount", "-" + Amount(order.DiscountAmount), charWidth);

        encoder.Bold(true);
        encoder.Row("TOTAL", Amount(order.Payable), charWidth);
        encoder.Bold(false);
        encoder.Divider(charWidth);

        // ── Pay-by-UPI block while the order is unsettled ──────────────────
        if (string.IsNullOrWhiteSpace(order.PaymentMethod) && !string.IsNullOrWhiteSpace(upiId))
        {
            encoder.AlignCenter();
            encoder.Bold(true);
            encoder.Line("SCAN TO PAY VIA UPI");
            encoder.Bold(false);
            encoder.Line("UPI ID: " + upiId);
            encoder.Line("Amount: " + Amount(order.Payable));
            encoder.Line();

            string payee = Uri.EscapeDataString(tenantName);
            string amount = order.Payable.ToString("0.00", CultureInfo.InvariantCulture);
            encoder.QrCode($"upi://pay?pa={upiId}&pn={payee}&am={amount}&cu=INR");

            encoder.Line();
            encoder.Divider(charWidth);
        }

        // ── Footer ─────────────────────────────────────────────────────────
        if (template.ShowThankYou && !string.IsNullOrWhiteSpace(template.FooterText))
        {
            encoder.AlignCenter();
            encoder.Line(template.FooterText);
        }

        if (order.Status == "completed" && !string.IsNullOrWhiteSpace(reviewLink))
        {
            encoder.Line();
            encoder.AlignCenter();
            encoder.Bold(true);
            encoder.Line("LEAVE US A GOOGLE REVIEW");
            encoder.Bold(false);
            encoder.Line();
            encoder.QrCode(reviewLink);
            encoder.Line();
        }

        encoder.AlignCenter();
        encoder.Line("ID: " + (order.Id.Length >= 12 ? order.Id[..12] : order.Id));
        encoder.Line(string.Concat(System.Linq.Enumerable.Repeat("* ", charWidth / 2)));

        encoder.Cut();
        return encoder.Encode();
    }

    /// <summary>Hardware self-test slip used by the diagnostics buttons.</summary>
    public static byte[] BuildTestSlip(string tenantName, PrinterTarget target)
    {
        var encoder = new EscPosEncoder();
        int charWidth = target.CharWidth;

        encoder.Initialize();
        encoder.AlignCenter();
        encoder.Bold(true);
        encoder.SizeDouble();
        encoder.Line(string.IsNullOrWhiteSpace(tenantName) ? "NOVAPOS" : tenantName);
        encoder.SizeNormal();
        encoder.Bold(false);
        encoder.Line("Printer self test");
        encoder.Line(DateTime.Now.ToString("dd MMM yyyy  HH:mm", CultureInfo.InvariantCulture));
        encoder.Divider(charWidth);

        encoder.AlignLeft();
        encoder.Row("Transport", target.Describe(), charWidth);
        encoder.Row("Paper", charWidth >= 48 ? "80mm (48 cols)" : "58mm (32 cols)", charWidth);
        encoder.Divider(charWidth);
        encoder.ThreeColumnRow("ITEM", "QTY", "AMOUNT", charWidth);
        encoder.Divider(charWidth);
        encoder.ItemRow("Alignment check", 1, "Rs 0.00", charWidth);
        encoder.Divider(charWidth);

        encoder.AlignCenter();
        encoder.Line("Hardware check complete");
        encoder.Cut();

        return encoder.Encode();
    }

    private static string FormatDate(DateTime value)
    {
        if (value == default) return "-";
        var local = value.ToLocalTime();
        return local.ToString("dd MMM", CultureInfo.InvariantCulture) + " " +
               local.ToString("hh:mm tt", CultureInfo.InvariantCulture);
    }
}
