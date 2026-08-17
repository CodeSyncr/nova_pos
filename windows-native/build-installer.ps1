# NovaPOS Windows Build & Installer Generator
$ErrorActionPreference = "Stop"

# Stop any running instances of NovaPOS to prevent file locking
Stop-Process -Name "NovaPOS" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  NovaPOS Windows Desktop Installer & Update Build" -ForegroundColor Cyan
Write-Host "  Version: 1.2.0 | Target: win-x86 (SingleFile)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$ProjectDir = $PSScriptRoot
Set-Location $ProjectDir

# 1. Publish Single-File Executable
Write-Host "[1/3] Publishing standalone executable (NovaPOS.exe)..." -ForegroundColor Yellow
dotnet publish NovaPOS.csproj -c Release -r win-x86 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -o "$ProjectDir\dist-singlefile"

if (-not (Test-Path "$ProjectDir\dist-singlefile\NovaPOS.exe")) {
    Write-Error "Build failed: dist-singlefile\NovaPOS.exe not found!"
    exit 1
}

# 2. Compile Inno Setup Installer
Write-Host "[2/3] Compiling Windows Installer (NovaPOS-Setup.exe)..." -ForegroundColor Yellow
$IsccPath = "C:\Users\yashk\AppData\Local\Programs\Inno Setup 6\ISCC.exe"

if (-not (Test-Path $IsccPath)) {
    $IsccPath = (Get-Command "ISCC.exe" -ErrorAction SilentlyContinue).Path
}

if (-not $IsccPath -or -not (Test-Path $IsccPath)) {
    Write-Error "ISCC.exe (Inno Setup Compiler) not found! Please check Inno Setup installation."
    exit 1
}

& $IsccPath "$ProjectDir\installer.iss"

if (-not (Test-Path "$ProjectDir\dist-installer\NovaPOS-Setup.exe")) {
    Write-Error "Installer build failed: dist-installer\NovaPOS-Setup.exe not found!"
    exit 1
}

# 3. Create version.json for active development updates
Write-Host "[3/3] Generating update metadata (version.json)..." -ForegroundColor Yellow
$VersionInfo = @{
    version = "1.2.0"
    buildDate = (Get-Date).ToString("o")
    installerName = "NovaPOS-Setup.exe"
    downloadUrl = "https://github.com/CodeSyncr/nova_pos/releases/latest/download/NovaPOS-Setup.exe"
    releaseNotes = "Active development update: Auto-recalculate discounts & scrollable mobile navigation"
    mandatory = $false
} | ConvertTo-Json -Depth 3

$VersionInfo | Out-File -FilePath "$ProjectDir\dist-installer\version.json" -Encoding utf8

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Windows Installer & Executable Built!" -ForegroundColor Green
Write-Host " Single File EXE : dist-singlefile\NovaPOS.exe" -ForegroundColor White
Write-Host " Setup Installer : dist-installer\NovaPOS-Setup.exe" -ForegroundColor White
Write-Host " Update Metadata : dist-installer\version.json" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
