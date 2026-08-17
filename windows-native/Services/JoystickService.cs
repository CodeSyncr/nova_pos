using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;

namespace NovaPOS.Desktop.Services;

public enum JoystickAction
{
    None,
    Up,
    Down,
    Left,
    Right,
    ButtonA, // Select / Add Item
    ButtonB, // Back / Cancel
    ButtonX, // Search
    ButtonY  // Checkout / Place Order
}

public class JoystickConfig
{
    public bool Enabled { get; set; } = true;
    public uint SelectedJoystickId { get; set; } = 0;
    public int Deadzone { get; set; } = 16384;
}

public static class JoystickService
{
    private const uint JOY_RETURNX = 0x00000001;
    private const uint JOY_RETURNY = 0x00000002;
    private const uint JOY_RETURNPOV = 0x00000040;
    private const uint JOY_RETURNBUTTONS = 0x00000080;
    private const uint JOY_RETURNALL = JOY_RETURNX | JOY_RETURNY | JOY_RETURNPOV | JOY_RETURNBUTTONS;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOYINFOEX
    {
        public uint dwSize;
        public uint dwFlags;
        public uint dwXpos;
        public uint dwYpos;
        public uint dwZpos;
        public uint dwRpos;
        public uint dwUpos;
        public uint dwVpos;
        public uint dwButtons;
        public uint dwButtonNumber;
        public uint dwPOV;
        public uint dwReserved1;
        public uint dwReserved2;
    }

    [DllImport("winmm.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern uint joyGetPosEx(uint uJoyID, ref JOYINFOEX pji);

    [DllImport("winmm.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern uint joyGetNumDevs();

    private static readonly string ConfigPath =
        Path.Combine(AppContext.BaseDirectory, "joystick-settings.json");

    private static JoystickConfig _config = Load();
    private static Thread? _pollThread;
    private static volatile bool _running;

    private static JoystickAction _lastDirection = JoystickAction.None;
    private static uint _lastButtons = 0;

    public static event Action<JoystickAction>? ActionTriggered;
    public static event Action<string>? StatusChanged;

    public static JoystickConfig Current => _config;

    public static bool IsConnected { get; private set; }
    public static string ControllerName { get; private set; } = "No controller detected";

    public static void Initialize()
    {
        if (_running) return;
        _running = true;

        _pollThread = new Thread(PollLoop)
        {
            IsBackground = true,
            Name = "NovaPOS Joystick Poller"
        };
        _pollThread.Start();
    }

    public static void Stop()
    {
        _running = false;
    }

    public static void Save(JoystickConfig config)
    {
        _config = config;
        try
        {
            File.WriteAllText(ConfigPath,
                JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static JoystickConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var loaded = JsonSerializer.Deserialize<JoystickConfig>(File.ReadAllText(ConfigPath));
                if (loaded != null) return loaded;
            }
        }
        catch { }

        return new JoystickConfig();
    }

    private static void PollLoop()
    {
        var info = new JOYINFOEX
        {
            dwSize = (uint)Marshal.SizeOf<JOYINFOEX>(),
            dwFlags = JOY_RETURNALL
        };

        while (_running)
        {
            try
            {
                if (!_config.Enabled)
                {
                    IsConnected = false;
                    ControllerName = "Joystick disabled in Settings";
                    Thread.Sleep(500);
                    continue;
                }

                uint result = joyGetPosEx(_config.SelectedJoystickId, ref info);
                if (result == 0) // JOYERR_NOERROR
                {
                    if (!IsConnected)
                    {
                        IsConnected = true;
                        ControllerName = $"Gamepad / Joystick (ID {_config.SelectedJoystickId}) Connected";
                        StatusChanged?.Invoke(ControllerName);
                    }

                    ProcessInputs(ref info);
                }
                else
                {
                    if (IsConnected)
                    {
                        IsConnected = false;
                        ControllerName = "No controller detected";
                        StatusChanged?.Invoke(ControllerName);
                    }
                }
            }
            catch { }

            Thread.Sleep(50); // ~20Hz polling rate
        }
    }

    private static void ProcessInputs(ref JOYINFOEX info)
    {
        JoystickAction currentDir = JoystickAction.None;

        // 1. Check POV D-Pad (0 = Up, 9000 = Right, 18000 = Down, 27000 = Left)
        if (info.dwPOV != 65535)
        {
            if (info.dwPOV == 0 || info.dwPOV == 31500 || info.dwPOV == 4500)
                currentDir = JoystickAction.Up;
            else if (info.dwPOV == 18000 || info.dwPOV == 13500 || info.dwPOV == 22500)
                currentDir = JoystickAction.Down;
            else if (info.dwPOV == 27000)
                currentDir = JoystickAction.Left;
            else if (info.dwPOV == 9000)
                currentDir = JoystickAction.Right;
        }

        // 2. Fallback to Analog Thumbstick (Center = 32768)
        if (currentDir == JoystickAction.None)
        {
            if (info.dwYpos < 16384) currentDir = JoystickAction.Up;
            else if (info.dwYpos > 49152) currentDir = JoystickAction.Down;
            else if (info.dwXpos < 16384) currentDir = JoystickAction.Left;
            else if (info.dwXpos > 49152) currentDir = JoystickAction.Right;
        }

        // Fire direction event on initial press
        if (currentDir != JoystickAction.None && currentDir != _lastDirection)
        {
            ActionTriggered?.Invoke(currentDir);
        }
        _lastDirection = currentDir;

        // 3. Process Buttons (Bit 0 = Button 1 / A, Bit 1 = Button 2 / B, Bit 2 = Button 3 / X, Bit 3 = Button 4 / Y)
        uint buttons = info.dwButtons;
        if (buttons != _lastButtons && buttons > 0)
        {
            if ((buttons & 1) != 0) ActionTriggered?.Invoke(JoystickAction.ButtonA);
            if ((buttons & 2) != 0) ActionTriggered?.Invoke(JoystickAction.ButtonB);
            if ((buttons & 4) != 0) ActionTriggered?.Invoke(JoystickAction.ButtonX);
            if ((buttons & 8) != 0) ActionTriggered?.Invoke(JoystickAction.ButtonY);
        }
        _lastButtons = buttons;
    }
}
