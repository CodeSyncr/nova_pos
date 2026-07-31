using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using NovaPOS.Desktop.Controls;
using System;

namespace NovaPOS.Desktop.Views;

public partial class LoginPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    private bool _busy;

    public LoginPage()
    {
        InitializeComponent();

        // A terminal operator should be able to start typing straight away.
        AttachedToVisualTree += (_, _) => TxtEmail.Focus();
    }

    private void OnToggleReveal(object? sender, RoutedEventArgs e)
    {
        bool reveal = !TxtPassword.RevealPassword;
        TxtPassword.RevealPassword = reveal;
        IcoReveal.Data = Ui.Glyph(reveal ? "EyeOff" : "Eye");
        ToolTip.SetTip(BtnReveal, reveal ? "Hide password" : "Show password");
    }

    private void OnFieldKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key is not (Key.Enter or Key.Tab)) return;

        // Enter walks the form the way a till operator expects: email → password
        // → submit. Tab is made explicit so focus can never skip the password box.
        if (ReferenceEquals(sender, TxtEmail))
        {
            TxtPassword.Focus();
            TxtPassword.CaretIndex = TxtPassword.Text?.Length ?? 0;
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Enter)
        {
            SignIn();
            e.Handled = true;
            return;
        }

        TxtEmail.Focus();
        e.Handled = true;
    }

    private void OnLoginClick(object? sender, RoutedEventArgs e) => SignIn();

    private async void SignIn()
    {
        if (_busy || ParentWindow == null) return;

        string email = TxtEmail.Text?.Trim() ?? "";
        string password = TxtPassword.Text ?? "";

        if (email.Length == 0 || password.Length == 0)
        {
            ShowError("Enter your email and password to continue.");
            return;
        }

        SetBusy(true);
        ErrorBox.IsVisible = false;

        try
        {
            var result = await ParentWindow.Api.LoginAsync(email, password);

            if (result.success)
            {
                LblLogin.Text = "Signed in";
                IcoLogin.Data = Ui.Glyph("CircleCheckBig");
                ParentWindow.OnLoginSuccess();
                ResetButton();
            }
            else
            {
                ShowError(result.error);
                SetBusy(false);
            }
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        _busy = busy;
        BtnLogin.IsEnabled = !busy;
        TxtEmail.IsEnabled = !busy;
        TxtPassword.IsEnabled = !busy;
        LblLogin.Text = busy ? "Signing in…" : "Sign in";
        IcoLogin.IsVisible = !busy;
    }

    private void ResetButton()
    {
        _busy = false;
        BtnLogin.IsEnabled = true;
        TxtEmail.IsEnabled = true;
        TxtPassword.IsEnabled = true;
        LblLogin.Text = "Sign in";
        IcoLogin.Data = Ui.Glyph("ArrowRight");
        IcoLogin.IsVisible = true;
        TxtPassword.Text = "";
    }

    private void ShowError(string message)
    {
        LblError.Text = string.IsNullOrWhiteSpace(message) ? "Sign-in failed. Try again." : message;
        ErrorBox.IsVisible = true;
    }
}
