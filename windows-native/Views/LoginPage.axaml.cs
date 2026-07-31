using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using NovaPOS.Desktop.Controls;
using NovaPOS.Desktop.Services;
using System;

namespace NovaPOS.Desktop.Views;

public partial class LoginPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    private bool _busy;

    public LoginPage()
    {
        InitializeComponent();

        AttachedToVisualTree += (_, _) =>
        {
            CheckSavedSession();
            TxtEmail.Focus();
        };
    }

    public void CheckSavedSession()
    {
        if (SessionManager.HasSavedSession)
        {
            var session = SessionManager.Current;
            TxtEmail.Text = session.UserEmail;
            TxtPassword.Text = session.SavedPassword;

            CardBiometric.IsVisible = session.BiometricEnabled;
            LblSavedAccount.Text = session.UserEmail;
        }
        else
        {
            CardBiometric.IsVisible = false;
        }
    }

    private async void OnBiometricLoginClick(object? sender, RoutedEventArgs e)
    {
        if (_busy || ParentWindow == null || !SessionManager.HasSavedSession) return;

        bool verified = await BiometricAuthService.AuthenticateAsync("Verify identity to log in to NovaPOS Terminal");
        if (verified)
        {
            var session = SessionManager.Current;
            TxtEmail.Text = session.UserEmail;
            TxtPassword.Text = session.SavedPassword;
            SignIn();
        }
        else
        {
            ShowError("Biometric authentication was cancelled or not recognized.");
        }
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
                // Save persistent session for auto-login & biometrics across launches
                SessionManager.SaveSession(
                    email,
                    password,
                    ParentWindow.Api.TenantId ?? "",
                    ParentWindow.Api.TenantName ?? "Pizzeria Da Cafe"
                );

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
        LblLogin.Text = busy ? "Signing in…" : "Sign in";
    }

    private void ShowError(string? message)
    {
        LblError.Text = string.IsNullOrWhiteSpace(message) ? "Could not sign in" : message;
        ErrorBox.IsVisible = true;
    }

    private void ResetButton()
    {
        _busy = false;
        BtnLogin.IsEnabled = true;
        LblLogin.Text = "Sign in";
        IcoLogin.Data = Ui.Glyph("ArrowRight");
    }
}
