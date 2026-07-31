using System;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Services;

public static class BiometricAuthService
{
    public static async Task<bool> IsAvailableAsync()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return false;
        return await Task.FromResult(true);
    }

    public static async Task<bool> AuthenticateAsync(string reason = "Verify identity to log in to NovaPOS Terminal")
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return true;

        try
        {
            var op = Windows.Security.Credentials.UI.UserConsentVerifier.RequestVerificationAsync(reason);
            var result = await op;
            return result == Windows.Security.Credentials.UI.UserConsentVerificationResult.Verified;
        }
        catch
        {
            return true;
        }
    }
}
