using Avalonia.Controls;
using Avalonia.Interactivity;
using NovaPOS.Desktop.Models;
using System;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Views;

public partial class OrdersPage : UserControl
{
    public MainWindow? ParentWindow { get; set; }

    public OrdersPage()
    {
        InitializeComponent();
    }

    public async void OnNavigate()
    {
        await LoadOrders();
    }

    private async Task LoadOrders()
    {
        if (ParentWindow == null) return;

        try
        {
            var orders = await ParentWindow.Api.GetOrdersAsync();
            OrdersGrid.ItemsSource = orders;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Error loading orders: " + ex.Message);
        }
    }

    private async void OnRefresh(object? sender, RoutedEventArgs e)
    {
        await LoadOrders();
    }

    private async void OnComplete(object? sender, RoutedEventArgs e)
    {
        if (ParentWindow == null) return;

        try
        {
            var selected = OrdersGrid.SelectedItem as OrderRecord;
            if (selected == null) return;

            bool ok = await ParentWindow.Api.CompleteOrderAsync(selected.Id);
            if (ok)
            {
                await LoadOrders();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Error completing order: " + ex.Message);
        }
    }
}
