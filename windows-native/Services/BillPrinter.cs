using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Models;
using System;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Services;

/// <summary>
/// Bridges the UI and the printer: turns an order into ESC/POS with the tenant's
/// bill template, hands it to <see cref="PrinterService"/>, and reports the outcome
/// as a toast.
/// <para>
/// Every native call runs on a worker thread. USB and socket writes block, and a
/// printer that is off or out of paper can stall for the full open timeout — long
/// enough to freeze the till's UI if called inline.
/// </para>
/// </summary>
public static class BillPrinter
{
    /// <summary>Renders and prints a bill, optionally popping the drawer for cash.</summary>
    public static Task<PrintResult> PrintBillAsync(ApiService api, OrderRecord order)
    {
        var target = PrinterService.Target;

        byte[] payload;
        try
        {
            payload = ReceiptBuilder.Build(
                order,
                api.Thermal,
                api.TenantName,
                api.CurrencySymbol,
                api.ReviewLink,
                api.UpiId,
                target.CharWidth);
        }
        catch (Exception ex)
        {
            return Task.FromResult(PrintResult.Fail("Could not lay out the bill: " + ex.Message));
        }

        bool cash = string.Equals(order.PaymentMethod, "cash", StringComparison.OrdinalIgnoreCase);
        bool kick = cash && target.KickDrawerOnCash;

        return Task.Run(() =>
        {
            var result = PrinterService.SendJob(payload, target);

            // The drawer only opens once the bill is safely out.
            if (result.Success && kick) PrinterService.OpenDrawer(target);

            return result;
        });
    }

    /// <summary>Prints a bill and surfaces success or failure as a toast.</summary>
    public static async Task<bool> PrintBillWithToastAsync(ApiService api, OrderRecord order)
    {
        var result = await PrintBillAsync(api, order);

        if (result.Success) ToastHost.Success($"Bill for #{order.ShortId} sent to the printer");
        else ToastHost.Error(Describe(result.Error, "Could not print the bill"));

        return result.Success;
    }

    /// <summary>
    /// Auto-print hook. Stays silent when the feature is switched off, and only
    /// warns on failure so a busy till isn't spammed with confirmations.
    /// </summary>
    public static async Task AutoPrintAsync(ApiService api, OrderRecord order, bool enabled)
    {
        if (!enabled) return;

        var result = await PrintBillAsync(api, order);
        if (!result.Success)
            ToastHost.Warning(Describe(result.Error, $"Auto-print failed for #{order.ShortId}"));
    }

    /// <summary>Diagnostics: a self-test slip on the currently configured target.</summary>
    public static Task<PrintResult> PrintTestSlipAsync(string tenantName, PrinterTarget target)
    {
        byte[] payload = ReceiptBuilder.BuildTestSlip(tenantName, target);
        return Task.Run(() => PrinterService.SendJob(payload, target));
    }

    public static Task<PrintResult> ProbeAsync(PrinterTarget target)
        => Task.Run(() => PrinterService.Probe(target));

    public static Task<bool> OpenDrawerAsync(PrinterTarget target)
        => Task.Run(() => PrinterService.OpenDrawer(target));

    private static string Describe(string? error, string fallback)
        => string.IsNullOrWhiteSpace(error) ? fallback : fallback + ": " + error;
}
