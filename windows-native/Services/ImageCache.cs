using Avalonia.Media.Imaging;
using Avalonia.Platform;
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace NovaPOS.Desktop.Services;

/// <summary>
/// Loads bundled and remote images. Menu-item artwork is fetched once, decoded at
/// display width and kept in memory, mirroring the web app's progressive
/// behaviour: the bundled placeholder shows immediately and the real photo
/// replaces it when it arrives.
/// </summary>
public static class ImageCache
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly ConcurrentDictionary<string, Task<Bitmap?>> Remote = new();
    private static readonly ConcurrentDictionary<string, Bitmap?> Local = new();

    /// <summary>Loads an image embedded via AvaloniaResource (avares:// URI).</summary>
    public static Bitmap? Asset(string name)
    {
        return Local.GetOrAdd(name, static key =>
        {
            try
            {
                var uri = new Uri("avares://NovaPOS/Assets/" + key);
                using var stream = AssetLoader.Open(uri);
                return new Bitmap(stream);
            }
            catch
            {
                return null;
            }
        });
    }

    public static Bitmap? Placeholder => Asset("placeholder.jpg");

    /// <summary>Downloads and decodes a remote image, or null when unavailable.</summary>
    public static Task<Bitmap?> RemoteAsync(string? url, int decodeWidth = 420)
    {
        if (string.IsNullOrWhiteSpace(url)) return Task.FromResult<Bitmap?>(null);
        if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            return Task.FromResult<Bitmap?>(null);

        return Remote.GetOrAdd(url, key => DownloadAsync(key, decodeWidth));
    }

    private static async Task<Bitmap?> DownloadAsync(string url, int decodeWidth)
    {
        try
        {
            var bytes = await Http.GetByteArrayAsync(url).ConfigureAwait(false);
            using var stream = new MemoryStream(bytes);
            return Bitmap.DecodeToWidth(stream, decodeWidth, BitmapInterpolationMode.HighQuality);
        }
        catch
        {
            return null;
        }
    }
}
