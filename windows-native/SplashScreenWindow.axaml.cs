using Avalonia.Controls;
using Avalonia.Threading;
using System;
using System.Threading.Tasks;

namespace NovaPOS.Desktop;

public partial class SplashScreenWindow : Window
{
    public SplashScreenWindow()
    {
        InitializeComponent();
    }

    public async Task RunInitializationAsync(Action<string, double> onProgress)
    {
        // Step 1: Core runtime
        onProgress("Loading POS desktop environment...", 25);
        await Task.Delay(400);

        // Step 2: Hardware bridge
        onProgress("Initializing hardware printer bridge...", 55);
        await Task.Delay(400);

        // Step 3: Cloud sync & Supabase
        onProgress("Connecting cloud API services...", 85);
        await Task.Delay(400);

        // Step 4: Ready
        onProgress("Starting NovaPOS Terminal...", 100);
        await Task.Delay(300);
    }

    public void UpdateProgress(string status, double percent)
    {
        Dispatcher.UIThread.Post(() =>
        {
            LblStatus.Text = status;
            ProgressBar.Value = percent;
        });
    }
}
