using Avalonia;
using Avalonia.Controls;

namespace NovaPOS.Desktop.Controls;

/// <summary>
/// A layer host that never reports a size larger than it was offered.
/// <para>
/// The shell stacks every page on top of each other. Some pages contain
/// horizontally scrolling strips (category pills, table chips) whose natural
/// width is far wider than the window; without this clamp their desired width
/// leaks up the tree and pushes the whole shell — including the pages that are
/// currently hidden — wider than the client area.
/// </para>
/// </summary>
public class ShellHost : Panel
{
    protected override Size MeasureOverride(Size availableSize)
    {
        foreach (var child in Children)
            child.Measure(availableSize);

        double width = double.IsInfinity(availableSize.Width) ? 0 : availableSize.Width;
        double height = double.IsInfinity(availableSize.Height) ? 0 : availableSize.Height;
        return new Size(width, height);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        foreach (var child in Children)
            child.Arrange(new Rect(finalSize));

        return finalSize;
    }
}
