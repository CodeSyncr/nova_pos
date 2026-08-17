using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using System;
using System.Collections.Generic;

namespace NovaPOS.Desktop.Controls;

public enum ToastKind
{
    Success,
    Error,
    Warning,
    Info
}

/// <summary>
/// Bottom-right toast stack, mirroring src/components/ui/toast.tsx: an icon, the
/// message, and a dismiss button on a tinted translucent card. Success is neutral
/// white, errors and warnings pick up the brand red.
/// </summary>
public class ToastHost : Panel
{
    private static ToastHost? _current;

    private readonly StackPanel _stack;

    public ToastHost()
    {
        _stack = new StackPanel
        {
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 20, 20)
        };

        Children.Add(_stack);
        IsHitTestVisible = true;

        // The host itself must not swallow clicks meant for the page beneath it.
        Background = null;

        AttachedToVisualTree += (_, _) => _current = this;
        DetachedFromVisualTree += (_, _) =>
        {
            if (ReferenceEquals(_current, this)) _current = null;
        };
    }

    public static void Success(string message, int milliseconds = 3000) => Show(message, ToastKind.Success, milliseconds);

    public static void Error(string message, int milliseconds = 4500) => Show(message, ToastKind.Error, milliseconds);

    public static void Warning(string message, int milliseconds = 4000) => Show(message, ToastKind.Warning, milliseconds);

    public static void Info(string message, int milliseconds = 3000) => Show(message, ToastKind.Info, milliseconds);

    public static void Show(string message, ToastKind kind = ToastKind.Info, int milliseconds = 3000)
    {
        var host = _current;
        if (host == null || string.IsNullOrWhiteSpace(message)) return;

        if (Dispatcher.UIThread.CheckAccess()) host.Add(message, kind, milliseconds);
        else Dispatcher.UIThread.Post(() => host.Add(message, kind, milliseconds));
    }

    private void Add(string message, ToastKind kind, int milliseconds)
    {
        var (background, border, iconName, iconBrush) = Palette(kind);

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto") };

        row.Children.Add(Ui.Ico(iconName, 20, iconBrush, 2));

        var text = new TextBlock
        {
            Text = message,
            FontSize = 13,
            FontWeight = FontWeight.Medium,
            Foreground = Ui.Brush("WhiteBrush"),
            TextWrapping = TextWrapping.Wrap,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(12, 0, 12, 0)
        };
        Grid.SetColumn(text, 1);
        row.Children.Add(text);

        var card = new Border
        {
            MinWidth = 300,
            MaxWidth = 420,
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(14, 12),
            Background = Ui.Brush(background),
            BorderBrush = Ui.Brush(border),
            BorderThickness = new Thickness(1),
            BoxShadow = BoxShadows.Parse("0 16 40 -12 #CC000000"),
            Opacity = 0,
            RenderTransform = new TranslateTransform(0, 16)
        };

        var close = new Button { Content = Ui.Ico("X", 14) };
        close.Classes.Add("step");
        close.Width = 24;
        close.Height = 24;
        close.Foreground = Ui.Brush("White60Brush");
        close.Click += (_, _) => Remove(card);
        Grid.SetColumn(close, 2);
        row.Children.Add(close);

        card.Child = row;

        card.Transitions = new Transitions
        {
            new DoubleTransition
            {
                Property = OpacityProperty,
                Duration = TimeSpan.FromMilliseconds(180),
                Easing = new CubicEaseOut()
            }
        };

        _stack.Children.Add(card);

        // Let the transition pick up the change on the next frame.
        Dispatcher.UIThread.Post(() =>
        {
            card.Opacity = 1;
            card.RenderTransform = null;
        }, DispatcherPriority.Render);

        if (milliseconds > 0)
        {
            DispatcherTimer.RunOnce(() => Remove(card), TimeSpan.FromMilliseconds(milliseconds));
        }
    }

    private void Remove(Border card)
    {
        if (!_stack.Children.Contains(card)) return;

        card.Opacity = 0;
        DispatcherTimer.RunOnce(() => _stack.Children.Remove(card), TimeSpan.FromMilliseconds(200));
    }

    private static (string Background, string Border, string Icon, string IconBrush) Palette(ToastKind kind) => kind switch
    {
        ToastKind.Success => ("White10Brush", "White20Brush", "CircleCheckBig", "WhiteBrush"),
        ToastKind.Error => ("Brand15Brush", "Brand30Brush", "CircleAlert", "BrandBrush"),
        ToastKind.Warning => ("Brand10Brush", "Brand30Brush", "TriangleAlert", "BrandBrush"),
        _ => ("White03Brush", "White10Brush", "Info", "White70Brush")
    };
}
