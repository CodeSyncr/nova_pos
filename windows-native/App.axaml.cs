using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using System.Threading.Tasks;

namespace NovaPOS.Desktop;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override async void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var splash = new SplashScreenWindow();
            desktop.MainWindow = splash;
            splash.Show();

            await splash.RunInitializationAsync((status, percent) =>
            {
                splash.UpdateProgress(status, percent);
            });

            var mainWindow = new MainWindow();
            mainWindow.WindowState = WindowState.FullScreen;

            desktop.MainWindow = mainWindow;
            mainWindow.Show();
            splash.Close();
        }

        base.OnFrameworkInitializationCompleted();
    }
}
