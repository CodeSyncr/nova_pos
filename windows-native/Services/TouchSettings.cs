using System;
using System.IO;
using System.Text.Json;

namespace NovaPOS.Desktop.Services;

public class TouchConfig
{
    public double DragThreshold { get; set; } = 12.0; // Pixels of movement before tap is treated as scroll
    public bool EnableTouchOptimization { get; set; } = true;
}

public static class TouchSettings
{
    private static readonly string ConfigPath =
        Path.Combine(AppContext.BaseDirectory, "touch-settings.json");

    private static TouchConfig _config = Load();

    public static TouchConfig Current => _config;

    public static double DragThreshold => _config.DragThreshold;

    public static void Save(TouchConfig config)
    {
        _config = config;
        try
        {
            File.WriteAllText(ConfigPath,
                JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static TouchConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var loaded = JsonSerializer.Deserialize<TouchConfig>(File.ReadAllText(ConfigPath));
                if (loaded != null) return loaded;
            }
        }
        catch { }

        return new TouchConfig();
    }
}
