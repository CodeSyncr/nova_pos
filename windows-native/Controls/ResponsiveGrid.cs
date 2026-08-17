using Avalonia;
using Avalonia.Controls;
using System;

namespace NovaPOS.Desktop.Controls;

/// <summary>
/// The native equivalent of the web's card grids
/// (<c>grid-cols-2 md:grid-cols-3 xl:grid-cols-4 … auto-rows-fr</c>):
/// as many equal-width columns as fit at <see cref="MinItemWidth"/>, items
/// stretched to fill the row, and every card in a row sharing the tallest
/// height. A plain WrapPanel can't do this — fixed-width children leave a ragged
/// gap on the right.
/// </summary>
public class ResponsiveGrid : Panel
{
    public static readonly StyledProperty<double> MinItemWidthProperty =
        AvaloniaProperty.Register<ResponsiveGrid, double>(nameof(MinItemWidth), 220d);

    public static readonly StyledProperty<double> GapProperty =
        AvaloniaProperty.Register<ResponsiveGrid, double>(nameof(Gap), 12d);

    /// <summary>Fixed row height; 0 means "as tall as the tallest card in the row".</summary>
    public static readonly StyledProperty<double> ItemHeightProperty =
        AvaloniaProperty.Register<ResponsiveGrid, double>(nameof(ItemHeight), 0d);

    static ResponsiveGrid()
    {
        AffectsMeasure<ResponsiveGrid>(MinItemWidthProperty, GapProperty, ItemHeightProperty);
    }

    public double MinItemWidth
    {
        get => GetValue(MinItemWidthProperty);
        set => SetValue(MinItemWidthProperty, value);
    }

    public double Gap
    {
        get => GetValue(GapProperty);
        set => SetValue(GapProperty, value);
    }

    public double ItemHeight
    {
        get => GetValue(ItemHeightProperty);
        set => SetValue(ItemHeightProperty, value);
    }

    private int _columns = 1;
    private double _itemWidth;
    private double[] _rowHeights = Array.Empty<double>();

    private int ColumnCount(double available)
    {
        if (double.IsInfinity(available) || available <= 0) return 1;
        int columns = (int)Math.Floor((available + Gap) / (MinItemWidth + Gap));
        return Math.Max(1, columns);
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        int count = Children.Count;
        if (count == 0)
        {
            _rowHeights = Array.Empty<double>();
            return new Size();
        }

        _columns = ColumnCount(availableSize.Width);
        _itemWidth = double.IsInfinity(availableSize.Width)
            ? MinItemWidth
            : Math.Max(1, (availableSize.Width - Gap * (_columns - 1)) / _columns);

        int rows = (int)Math.Ceiling(count / (double)_columns);
        _rowHeights = new double[rows];

        var childConstraint = new Size(_itemWidth, ItemHeight > 0 ? ItemHeight : double.PositiveInfinity);

        for (int i = 0; i < count; i++)
        {
            var child = Children[i];
            child.Measure(childConstraint);

            int row = i / _columns;
            double height = ItemHeight > 0 ? ItemHeight : child.DesiredSize.Height;
            if (height > _rowHeights[row]) _rowHeights[row] = height;
        }

        double total = 0;
        for (int r = 0; r < rows; r++)
        {
            total += _rowHeights[r];
            if (r < rows - 1) total += Gap;
        }

        double width = double.IsInfinity(availableSize.Width)
            ? _itemWidth * _columns + Gap * (_columns - 1)
            : availableSize.Width;

        return new Size(width, total);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        if (Children.Count == 0) return finalSize;

        int columns = Math.Max(1, _columns);
        double itemWidth = Math.Max(1, (finalSize.Width - Gap * (columns - 1)) / columns);

        double y = 0;
        int row = -1;

        for (int i = 0; i < Children.Count; i++)
        {
            int currentRow = i / columns;
            if (currentRow != row)
            {
                if (row >= 0) y += _rowHeights[row] + Gap;
                row = currentRow;
            }

            int column = i % columns;
            double x = column * (itemWidth + Gap);
            double height = row < _rowHeights.Length ? _rowHeights[row] : Children[i].DesiredSize.Height;

            Children[i].Arrange(new Rect(x, y, itemWidth, height));
        }

        return finalSize;
    }
}
