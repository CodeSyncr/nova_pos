# Launches the built app, brings its window to the foreground, grabs just that
# window and writes it to tools/shot-<name>.png. Verification helper only.
param(
    [string]$Name = "app",
    [int]$WaitSeconds = 7,
    [switch]$KeepRunning
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -Namespace Win -Name Api -MemberDefinition @"
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
"@

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "bin\Release\net10.0\NovaPOS.exe"
if (-not (Test-Path $exe)) { throw "missing $exe" }

$existing = Get-Process -Name NovaPOS -ErrorAction SilentlyContinue
if ($existing) { $existing | Stop-Process -Force; Start-Sleep -Milliseconds 700 }

$proc = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds $WaitSeconds

$proc.Refresh()
if ($proc.HasExited) {
    Write-Output "process exited early: $($proc.ExitCode)"
    exit 1
}

$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) {
    Start-Sleep -Seconds 3
    $proc.Refresh()
    $hwnd = $proc.MainWindowHandle
}
if ($hwnd -eq [IntPtr]::Zero) { throw "no main window handle" }

[void][Win.Api]::ShowWindow($hwnd, 3)          # SW_MAXIMIZE
[void][Win.Api]::BringWindowToTop($hwnd)
[void][Win.Api]::SetForegroundWindow($hwnd)
Start-Sleep -Seconds 3

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

if (-not $KeepRunning) { Stop-Process -Id $proc.Id -Force }

Write-Output "saved $out (${w}x${h})"
