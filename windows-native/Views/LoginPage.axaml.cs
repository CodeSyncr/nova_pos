using Avalonia.Controls;
using Avalonia.Interactivity;
using System;

namespace NovaPOS.Desktop.Views;

public partial class LoginPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    public LoginPage()
    {
        InitializeComponent();
    }

    private async void OnLoginClick(object? sender, RoutedEventArgs e)
    {
        if (ParentWindow == null) return;

        try
        {
            LblError.IsVisible = false;
            BtnLogin.Content = "Signing in...";
            BtnLogin.IsEnabled = false;

            string email = TxtEmail.Text?.Trim() ?? "";
            string password = TxtPassword.Text ?? "";

            var result = await ParentWindow.Api.LoginAsync(email, password);

            if (result.success)
            {
                BtnLogin.Content = "Authenticated ✓";
                BtnLogin.IsEnabled = true;
                ParentWindow.OnLoginSuccess();
            }
            else
            {
                LblError.Text = result.error;
                LblError.IsVisible = true;
                BtnLogin.Content = "Authenticate";
                BtnLogin.IsEnabled = true;
            }
        }
        catch (Exception ex)
        {
            LblError.Text = "Login error: " + ex.Message;
            LblError.IsVisible = true;
            BtnLogin.Content = "Authenticate";
            BtnLogin.IsEnabled = true;
        }
    }
}
