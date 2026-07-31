using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using NovaPOS.Desktop.Models;

namespace NovaPOS.Desktop.Services;

public class ApiService
{
    private const string SUPABASE_URL = "https://yrqyuiyblhkomfbklpzy.supabase.co";
    private const string SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycXl1aXlibGhrb21mYmtscHp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY0NjgyMCwiZXhwIjoyMDk1MjIyODIwfQ.5JyuiYLx_rhO4lAR9I9mHAwvZqYO7XTEJcJfpS9YDJ4";
    private const string LOCAL_API_URL = "http://localhost:3000";

    private readonly HttpClient _http;

    // Auth state
    public bool IsAuthenticated { get; private set; }
    public string AccessToken { get; private set; } = "";
    public string UserId { get; private set; } = "";
    public string UserEmail { get; private set; } = "";
    public string TenantId { get; private set; } = "";

    public ApiService()
    {
        _http = new HttpClient();
        _http.Timeout = TimeSpan.FromSeconds(15);
    }

    public async Task<(bool success, string error)> LoginAsync(string email, string password)
    {
        try
        {
            string url = SUPABASE_URL + "/auth/v1/token?grant_type=password";
            string body = $"{{\"email\":\"{email}\",\"password\":\"{password}\"}}";

            var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Add("apikey", SUPABASE_KEY);
            req.Content = new StringContent(body, Encoding.UTF8, "application/json");

            var resp = await _http.SendAsync(req);
            string res = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                string? errorDesc = GetJsonString(res, "error_description") ?? GetJsonString(res, "msg");
                return (false, errorDesc ?? $"Authentication failed ({resp.StatusCode})");
            }

            string? token = GetJsonString(res, "access_token");
            string? retEmail = GetJsonString(res, "email");
            var matchId = Regex.Match(res, "\"id\":\\s*\"([^\"]+)\"");
            string userId = matchId.Success ? matchId.Groups[1].Value : "";

            if (string.IsNullOrEmpty(token))
                return (false, "Token missing from response.");

            AccessToken = token;
            UserId = userId;
            UserEmail = retEmail ?? email;

            // Get tenant ID
            try
            {
                string tenantRes = await GetSupabaseAsync("profile_tenants?profile_id=eq." + userId + "&select=tenant_id");
                var tenants = ParseJsonArray(tenantRes);
                TenantId = tenants.Count > 0 && tenants[0].ContainsKey("tenant_id")
                    ? tenants[0]["tenant_id"] : "00000000-0000-0000-0000-000000000000";
            }
            catch
            {
                TenantId = "00000000-0000-0000-0000-000000000000";
            }

            IsAuthenticated = true;
            return (true, "");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public async Task<List<MenuCategory>> GetCategoriesAsync()
    {
        var list = new List<MenuCategory>();
        try
        {
            string json = await GetSupabaseAsync("menu_categories?tenant_id=eq." + TenantId + "&order=position.asc");
            var arr = ParseJsonArray(json);
            foreach (var d in arr)
            {
                int pos = 0;
                int.TryParse(d.GetValueOrDefault("position", "0"), out pos);
                list.Add(new MenuCategory
                {
                    Id = d.GetValueOrDefault("id", ""),
                    Name = d.GetValueOrDefault("name", ""),
                    Position = pos
                });
            }
        }
        catch { }
        return list;
    }

    public async Task<List<PosMenuItem>> GetMenuItemsAsync()
    {
        var list = new List<PosMenuItem>();
        try
        {
            string json = await GetSupabaseAsync("menu_items?tenant_id=eq." + TenantId + "&is_active=eq.true");
            var arr = ParseJsonArray(json);
            foreach (var d in arr)
            {
                decimal price = 0;
                decimal.TryParse(d.GetValueOrDefault("base_price", "0"), out price);
                list.Add(new PosMenuItem
                {
                    Id = d.GetValueOrDefault("id", ""),
                    Name = d.GetValueOrDefault("name", "Unnamed"),
                    BasePrice = price,
                    CategoryId = d.GetValueOrDefault("category_id", ""),
                    ImageUrl = d.GetValueOrDefault("image_url", null)
                });
            }
        }
        catch { }
        return list;
    }

    public async Task<List<TableRecord>> GetTablesAsync()
    {
        var list = new List<TableRecord>();
        try
        {
            string json = await GetSupabaseAsync("tables?tenant_id=eq." + TenantId + "&is_active=eq.true");
            var arr = ParseJsonArray(json);
            foreach (var d in arr)
            {
                list.Add(new TableRecord
                {
                    Id = d.GetValueOrDefault("id", ""),
                    Number = d.GetValueOrDefault("number", "")
                });
            }
        }
        catch { }
        return list;
    }

    public async Task<List<OrderRecord>> GetOrdersAsync()
    {
        var list = new List<OrderRecord>();
        try
        {
            string json = await GetSupabaseAsync("orders?tenant_id=eq." + TenantId + "&select=id,table_number,customer_name,total,status,created_at&order=created_at.desc");
            var arr = ParseJsonArray(json);
            foreach (var d in arr)
            {
                decimal total = 0;
                decimal.TryParse(d.GetValueOrDefault("total", "0"), out total);
                string date = d.GetValueOrDefault("created_at", "");
                var dm = Regex.Match(date, @"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})");
                if (dm.Success) date = dm.Groups[1].Value + " " + dm.Groups[2].Value;

                list.Add(new OrderRecord
                {
                    Id = d.GetValueOrDefault("id", ""),
                    TableNumber = d.GetValueOrDefault("table_number", "-"),
                    CustomerName = d.GetValueOrDefault("customer_name", "Walk-in"),
                    Total = total,
                    Status = d.GetValueOrDefault("status", "pending"),
                    CreatedAt = date
                });
            }
        }
        catch { }
        return list;
    }

    public async Task<(decimal sales, int pending, int completed)> GetDashboardStatsAsync()
    {
        decimal sales = 0; int pending = 0; int completed = 0;
        try
        {
            string json = await GetSupabaseAsync("orders?tenant_id=eq." + TenantId + "&select=total,status");
            var arr = ParseJsonArray(json);
            foreach (var o in arr)
            {
                decimal tot = 0;
                decimal.TryParse(o.GetValueOrDefault("total", "0"), out tot);
                string status = o.GetValueOrDefault("status", "").ToLower();
                if (status == "completed") { sales += tot; completed++; }
                else if (status == "pending") { pending++; }
            }
        }
        catch { }
        return (sales, pending, completed);
    }

    public async Task<bool> CompleteOrderAsync(string orderId)
    {
        try
        {
            await PatchSupabaseAsync("orders?id=eq." + orderId, "{\"status\":\"completed\"}");
            return true;
        }
        catch { return false; }
    }

    public async Task<(bool success, string error)> PlaceOrderAsync(string tableId, string customerName, string customerPhone, string orderType, string itemsJson)
    {
        try
        {
            string tableVal = orderType.ToLower() == "dine_in" ? tableId : "";
            string body = $"{{\"tenantId\":\"{TenantId}\",\"tableId\":\"{tableVal}\",\"customerName\":\"{customerName}\",\"customerPhone\":\"{customerPhone}\",\"orderType\":\"{orderType}\",\"items\":{itemsJson}}}";

            var req = new HttpRequestMessage(HttpMethod.Post, LOCAL_API_URL + "/api/orders");
            req.Content = new StringContent(body, Encoding.UTF8, "application/json");
            req.Headers.Add("Origin", LOCAL_API_URL);
            req.Headers.Add("Referer", LOCAL_API_URL + "/");

            var resp = await _http.SendAsync(req);
            string res = await resp.Content.ReadAsStringAsync();

            var successMatch = Regex.Match(res, "\"success\":\\s*(true|false)");
            if (successMatch.Success && successMatch.Groups[1].Value == "true")
                return (true, "");

            string? errMsg = GetJsonString(res, "error");
            return (false, errMsg ?? "Unknown server response");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // ── Supabase Async HTTP Helpers ─────────────────────────────────────
    private async Task<string> GetSupabaseAsync(string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, SUPABASE_URL + "/rest/v1/" + path);
        req.Headers.Add("apikey", SUPABASE_KEY);
        if (!string.IsNullOrEmpty(AccessToken))
            req.Headers.Add("Authorization", "Bearer " + AccessToken);

        var resp = await _http.SendAsync(req);
        return await resp.Content.ReadAsStringAsync();
    }

    private async Task<string> PatchSupabaseAsync(string path, string jsonBody)
    {
        var req = new HttpRequestMessage(new HttpMethod("PATCH"), SUPABASE_URL + "/rest/v1/" + path);
        req.Headers.Add("apikey", SUPABASE_KEY);
        if (!string.IsNullOrEmpty(AccessToken))
            req.Headers.Add("Authorization", "Bearer " + AccessToken);
        req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

        var resp = await _http.SendAsync(req);
        return await resp.Content.ReadAsStringAsync();
    }

    // ── Simple JSON parsing ────────────────────────────────────────────
    private static string? GetJsonString(string json, string key)
    {
        var match = Regex.Match(json, "\"" + key + "\":\\s*\"([^\"]*)\"");
        return match.Success ? match.Groups[1].Value : null;
    }

    private static List<Dictionary<string, string>> ParseJsonArray(string json)
    {
        var list = new List<Dictionary<string, string>>();
        if (string.IsNullOrEmpty(json)) return list;
        var matches = Regex.Matches(json, @"\{([^{}]+)\}");
        foreach (Match m in matches)
        {
            var dict = new Dictionary<string, string>();
            var pairs = Regex.Matches(m.Groups[1].Value, @"""([^""]+)""\s*:\s*(""([^""]*)""|([^,{}]+))");
            foreach (Match p in pairs)
            {
                string k = p.Groups[1].Value;
                string v = p.Groups[3].Success ? p.Groups[3].Value : p.Groups[4].Value.Trim();
                dict[k] = v;
            }
            list.Add(dict);
        }
        return list;
    }
}
