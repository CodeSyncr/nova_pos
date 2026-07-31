# Captures the already-running NovaPOS window. Optionally sends a key first so a
# page can be switched (F1 Home / F2 POS / F3 Orders) before the shot is taken.
#
#   powershell -File tools\capture.ps1 -Name home
#   powershell -File tools\capture.ps1 -Name pos -SendKey "{F2}" -Delay 6
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$SendKey = "",
    [int]$Delay = 2
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -Namespace Win -Name Api -MemberDefinition @"
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
"@

# Required for a 1:1 capture on scaled displays.
[void][Win.Api]::SetProcessDPIAware()

$proc = Get-Process -Name NovaPOS -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { throw "NovaPOS is not running" }

$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { throw "no main window handle" }

# A minimised window sits at -32000,-32000 and cannot be captured.
if ([Win.Api]::IsIconic($hwnd)) {
    [void][Win.Api]::ShowWindow($hwnd, 9)   # SW_RESTORE
    Start-Sleep -Milliseconds 700
}
if (-not [Win.Api]::IsZoomed($hwnd)) {
    [void][Win.Api]::ShowWindow($hwnd, 3)   # SW_MAXIMIZE
    Start-Sleep -Milliseconds 700
}

[void][Win.Api]::BringWindowToTop($hwnd)
[void][Win.Api]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 900

if ($SendKey -ne "") {
    [System.Windows.Forms.SendKeys]::SendWait($SendKey)
}

Start-Sleep -Seconds $Delay

$rect = New-Object Win.Api+RECT
[void][Win.Api]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top

$bmp = New-Object System.Drawing.Bitmap $w, $h
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$gfx.Dispose()

$out = Join-Path $PSScriptRoot ("shot-" + $Name + ".png")
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "saved shot-$Name.png (${w}x${h})"
