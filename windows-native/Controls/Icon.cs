using Avalonia;
using Avalonia.Controls.Primitives;
using Avalonia.Media;

namespace NovaPOS.Desktop.Controls;

/// <summary>
/// Stroke-rendered vector icon, the native counterpart of the web app's
/// lucide-react icons. Geometries live in Styles/Icons.axaml and are authored in
/// lucide's 24x24 coordinate space, so they scale to whatever Width/Height the
/// icon is given while keeping the 2-unit stroke proportional — exactly how the
/// SVGs behave in the browser.
/// </summary>
public class Icon : TemplatedControl
{
    public static readonly StyledProperty<Geometry?> DataProperty =
        AvaloniaProperty.Register<Icon, Geometry?>(nameof(Data));

    public static readonly StyledProperty<double> StrokeWidthProperty =
        AvaloniaProperty.Register<Icon, double>(nameof(StrokeWidth), 2d);

    public Geometry? Data
    {
        get => GetValue(DataProperty);
        set => SetValue(DataProperty, value);
    }

    public double StrokeWidth
    {
        get => GetValue(StrokeWidthProperty);
        set => SetValue(StrokeWidthProperty, value);
    }
}
