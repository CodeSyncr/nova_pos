# Development-only visual check: launches the app, signs in with the workspace
# credentials passed on the command line, then captures Home / POS / Orders.
# Read-only — it never places or mutates an order.
param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][string]$Password
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
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
"@

# Without this the capture happens in virtualised coordinates on a scaled
# display, producing a stretched and clipped screenshot.
[void][Win.Api]::SetProcessDPIAware()

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "bin\Release\net10.0\NovaPOS.exe"

Get-Process -Name NovaPOS -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 700

$proc = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 6
$proc.Refresh()
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { throw "no window" }

function Focus-App {
    [void][Win.Api]::ShowWindow($hwnd, 3)
    [void][Win.Api]::BringWindowToTop($hwnd)
    [void][Win.Api]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 1200
}

function Save-Shot([string]$name) {
    $rect = New-Object Win.Api+RECT
    [void][Win.Api]::GetWindowRect($hwnd, [ref]$rect)
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
    $gfx.Dispose()
    $out = Join-Path $PSScriptRoot ("shot-" + $name + ".png")
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "saved shot-$name.png (${w}x${h})"
}

Focus-App
Start-Sleep -Seconds 2

# Warm-up key: the very first synthetic input after activation is sometimes
# swallowed while the window finishes coming to the foreground.
[System.Windows.Forms.SendKeys]::SendWait("{HOME}")
Start-Sleep -Milliseconds 700

[System.Windows.Forms.SendKeys]::SendWait($Email)
Start-Sleep -Milliseconds 900
Save-Shot "login-typed"

# Enter moves from the email field to the (masked) password field.
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait($Password)
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

Start-Sleep -Seconds 10
Save-Shot "home"

[System.Windows.Forms.SendKeys]::SendWait("{F2}")
Start-Sleep -Seconds 9
Save-Shot "pos"

[System.Windows.Forms.SendKeys]::SendWait("{F3}")
Start-Sleep -Seconds 8
Save-Shot "orders"

Stop-Process -Id $proc.Id -Force
Write-Output "done"
