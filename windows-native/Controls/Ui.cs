using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Styling;
using System;

namespace NovaPOS.Desktop.Controls;

/// <summary>
/// Small factory helpers for the pieces of UI that have to be built in code
/// (menu cards, order cards, list rows). They pull the exact same brushes and
/// geometries the XAML uses so code-built and markup-built UI stay identical.
/// </summary>
public static class Ui
{
    public static IBrush Brush(string key) =>
        Application.Current?.FindResource(key) as IBrush ?? Brushes.Transparent;

    public static Geometry? Glyph(string name) =>
        Application.Current?.FindResource("Icon." + name) as Geometry;

    public static FontFamily SansFont =>
        Application.Current?.FindResource("FontSans") as FontFamily ?? FontFamily.Default;

    /// <summary>A lucide icon at the given pixel size.</summary>
    public static Icon Ico(string name, double size = 16, string? brushKey = null, double stroke = 2)
    {
        var icon = new Icon
        {
            Data = Glyph(name),
            Width = size,
            Height = size,
            StrokeWidth = stroke,
            VerticalAlignment = VerticalAlignment.Center
        };
        if (brushKey != null) icon.Foreground = Brush(brushKey);
        return icon;
    }

    public static TextBlock Text(
        string text,
        double size = 13,
        string brushKey = "WhiteBrush",
        FontWeight weight = FontWeight.Normal,
        double letterSpacing = 0)
    {
        return new TextBlock
        {
            Text = text,
            FontSize = size,
            FontWeight = weight,
            Foreground = Brush(brushKey),
            LetterSpacing = letterSpacing,
            VerticalAlignment = VerticalAlignment.Center
        };
    }

    /// <summary>Numeric label — semibold by default, like the web's money figures.</summary>
    public static TextBlock Num(
        string text,
        double size = 13,
        string brushKey = "WhiteBrush",
        FontWeight weight = FontWeight.SemiBold)
        => Text(text, size, brushKey, weight);

    /// <summary>A rounded-full status/type badge: icon + label on a tinted pill.</summary>
    public static Border Badge(
        string label,
        string bgKey,
        string fgKey,
        string? iconName = null,
        double fontSize = 10,
        FontWeight weight = FontWeight.Bold,
        double letterSpacing = 0.6,
        string? borderKey = null)
    {
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 4,
            VerticalAlignment = VerticalAlignment.Center
        };

        if (iconName != null)
            row.Children.Add(Ico(iconName, 12, fgKey, 2.2));

        row.Children.Add(Text(label, fontSize, fgKey, weight, letterSpacing));

        return new Border
        {
            Background = Brush(bgKey),
            BorderBrush = borderKey != null ? Brush(borderKey) : Brushes.Transparent,
            BorderThickness = new Thickness(borderKey != null ? 1 : 0),
            CornerRadius = new CornerRadius(100),
            Padding = new Thickness(8, 2.5, 9, 3),
            Child = row,
            VerticalAlignment = VerticalAlignment.Center
        };
    }

    /// <summary>The small coloured dot used in timelines and alert rows.</summary>
    public static Ellipse Dot(string brushKey, double size = 8)
        => new()
        {
            Width = size,
            Height = size,
            Fill = Brush(brushKey),
            VerticalAlignment = VerticalAlignment.Center
        };

    /// <summary>1px hairline divider (divide-y divide-white/[0.06]).</summary>
    public static Border Hairline(double top = 0, double bottom = 0, string brushKey = "White06Brush")
        => new()
        {
            Height = 1,
            Background = Brush(brushKey),
            Margin = new Thickness(0, top, 0, bottom)
        };

    /// <summary>
    /// Panel shell: rounded-[28px] border-white/[0.08] with the vertical white
    /// wash the web panels use.
    /// </summary>
    public static Border Panel(Control content, double radius = 28, double padding = 24)
        => new()
        {
            CornerRadius = new CornerRadius(radius),
            BorderBrush = Brush("White08Brush"),
            BorderThickness = new Thickness(1),
            Background = Brush("PanelGradientBrush"),
            Padding = new Thickness(padding),
            Child = content
        };

    public static StackPanel Row(double spacing = 8, params Control[] children)
    {
        var panel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = spacing,
            VerticalAlignment = VerticalAlignment.Center
        };
        foreach (var child in children) panel.Children.Add(child);
        return panel;
    }

    public static StackPanel Col(double spacing = 8, params Control[] children)
    {
        var panel = new StackPanel { Spacing = spacing };
        foreach (var child in children) panel.Children.Add(child);
        return panel;
    }

    public static Button IconButton(string iconName, string classes, string tip, double iconSize = 16)
    {
        var button = new Button { Content = Ico(iconName, iconSize) };
        foreach (var c in classes.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            button.Classes.Add(c);
        ToolTip.SetTip(button, tip);
        return button;
    }

    public static Button TextButton(string label, string classes, string? iconName = null, double iconSize = 14)
    {
        var button = new Button();
        foreach (var c in classes.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            button.Classes.Add(c);

        if (iconName == null)
        {
            button.Content = label;
        }
        else
        {
            button.Content = Row(6, Ico(iconName, iconSize), new TextBlock
            {
                Text = label,
                VerticalAlignment = VerticalAlignment.Center
            });
        }

        return button;
    }

    /// <summary>Empty-state line: py-8 text-center text-sm text-white/30.</summary>
    public static TextBlock EmptyLine(string message)
    {
        var tb = Text(message, 13, "White30Brush");
        tb.HorizontalAlignment = HorizontalAlignment.Center;
        tb.Margin = new Thickness(0, 26, 0, 26);
        tb.TextAlignment = TextAlignment.Center;
        return tb;
    }
}
