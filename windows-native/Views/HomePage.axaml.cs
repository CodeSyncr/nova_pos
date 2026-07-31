using Avalonia.Controls;
using System;

namespace NovaPOS.Desktop.Views;

public partial class HomePage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    public HomePage()
    {
        InitializeComponent();
    }

    public async void OnNavigate()
    {
        if (ParentWindow == null) return;

        try
        {
            LblWelcome.Text = "Welcome, " + ParentWindow.Api.UserEmail;

            var stats = await ParentWindow.Api.GetDashboardStatsAsync();
            LblSales.Text = $"Rs. {stats.sales:N2}";
            LblPending.Text = stats.pending.ToString();
            LblCompleted.Text = stats.completed.ToString();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Error loading home stats: " + ex.Message);
        }
    }
}
