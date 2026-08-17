using Avalonia.Controls;
using Avalonia.Input;
using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Services;

/// <summary>
/// Service to auto-trigger the Windows Touch Keyboard (TabTip.exe) or On-Screen Keyboard (osk.exe)
/// whenever an input box (TextBox) is tapped or focused on touchscreen devices.
/// </summary>
public static class OnScreenKeyboardService
{
    private static DateTime _lastLaunch = DateTime.MinValue;

    /// <summary>
    /// Registers class handlers globally for all TextBox instances in the Avalonia app.
    /// </summary>
    public static void Initialize()
    {
        TextBox.GotFocusEvent.AddClassHandler<TextBox>((textBox, e) =>
        {
            if (ShouldShow(textBox)) Show();
        });

        TextBox.PointerPressedEvent.AddClassHandler<TextBox>((textBox, e) =>
        {
            if (ShouldShow(textBox)) Show();
        });
    }

    private static bool ShouldShow(TextBox? textBox)
    {
        if (textBox == null) return false;
        if (textBox.IsReadOnly || !textBox.IsEffectivelyEnabled || !textBox.IsVisible) return false;
        return TouchSettings.Current.EnableTouchOptimization && TouchSettings.Current.AutoShowTouchKeyboard;
    }

    /// <summary>
    /// Opens the Windows Touch / On-Screen Keyboard asynchronously.
    /// </summary>
    public static void Show()
    {
        // Throttle rapid taps within 600ms
        if ((DateTime.UtcNow - _lastLaunch).TotalMilliseconds < 600) return;
        _lastLaunch = DateTime.UtcNow;

        Task.Run(() =>
        {
            try
            {
                // 1. Try Windows Touch Keyboard (TabTip.exe)
                string commonFiles = Environment.GetFolderPath(Environment.SpecialFolder.CommonProgramFiles);
                string tabTip = Path.Combine(commonFiles, @"microsoft shared\ink\TabTip.exe");

                if (File.Exists(tabTip))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = tabTip,
                        UseShellExecute = true
                    });
                    return;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[OnScreenKeyboardService] TabTip error: " + ex.Message);
            }

            try
            {
                // 2. Fallback to Windows On-Screen Keyboard (System32\osk.exe)
                string system32 = Environment.GetFolderPath(Environment.SpecialFolder.System);
                string osk = Path.Combine(system32, "osk.exe");

                if (File.Exists(osk))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = osk,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[OnScreenKeyboardService] OSK error: " + ex.Message);
            }
        });
    }
}
