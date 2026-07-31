using System;
using System.IO;
using System.Text.Json;

namespace NovaPOS.Desktop.Services;

public class SessionState
{
    public string UserEmail { get; set; } = "";
    public string SavedPassword { get; set; } = ""; // Saved for quick session restore / biometrics
    public string TenantId { get; set; } = "";
    public string TenantName { get; set; } = "";
    public bool BiometricEnabled { get; set; } = false;
    public bool BiometricPrompted { get; set; } = false;
    public bool AutoLoginOnLaunch { get; set; } = true;
    public DateTime LastLoginTime { get; set; } = DateTime.UtcNow;
}

public static class SessionManager
{
    private static readonly string SessionPath =
        Path.Combine(AppContext.BaseDirectory, "session-store.json");

    private static SessionState _current = Load();

    public static SessionState Current => _current;

    public static bool HasSavedSession =>
        !string.IsNullOrWhiteSpace(_current.UserEmail) && !string.IsNullOrWhiteSpace(_current.SavedPassword);

    public static bool IsBiometricConfigured =>
        HasSavedSession && _current.BiometricEnabled;

    public static void SaveSession(string email, string password, string tenantId, string tenantName, bool enableBiometric = false)
    {
        _current = new SessionState
        {
            UserEmail = email,
            SavedPassword = password,
            TenantId = tenantId,
            TenantName = tenantName,
            BiometricEnabled = enableBiometric,
            AutoLoginOnLaunch = true,
            LastLoginTime = DateTime.UtcNow
        };

        Persist();
    }

    public static void SetBiometricEnabled(bool enabled)
    {
        _current.BiometricEnabled = enabled;
        _current.BiometricPrompted = true;
        Persist();
    }

    public static void SetBiometricPrompted(bool prompted)
    {
        _current.BiometricPrompted = prompted;
        Persist();
    }

    public static void ClearSession()
    {
        _current = new SessionState();
        try
        {
            if (File.Exists(SessionPath)) File.Delete(SessionPath);
        }
        catch { }
    }

    private static void Persist()
    {
        try
        {
            File.WriteAllText(SessionPath,
                JsonSerializer.Serialize(_current, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static SessionState Load()
    {
        try
        {
            if (File.Exists(SessionPath))
            {
                var loaded = JsonSerializer.Deserialize<SessionState>(File.ReadAllText(SessionPath));
                if (loaded != null) return loaded;
            }
        }
        catch { }

        return new SessionState();
    }
}
