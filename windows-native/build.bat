@echo off
echo.
echo ==================================================
echo   NovaPOS Windows Desktop - Avalonia UI .NET 10
echo   Target: win-x86 (self-contained)
echo ==================================================
echo.
echo   Built as 32-bit because the bundled printer SDK
echo   (ZyPrinter.dll) is a 32-bit binary and cannot be
echo   loaded by a 64-bit process. Self-contained so the
echo   till needs no x86 .NET runtime installed.
echo.

if not exist "ZyPrinter.dll" (
    echo [ERROR] ZyPrinter.dll is missing from this folder.
    echo         Printing cannot work without it.
    pause
    exit /b 1
)

dotnet publish NovaPOS.csproj -c Release -r win-x86 --self-contained true -o dist
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

if not exist "dist\ZyPrinter.dll" (
    echo.
    echo [ERROR] ZyPrinter.dll did not reach the output folder.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Build complete.
echo Run: dist\NovaPOS.exe
echo.
echo Printer settings are saved to dist\printer-settings.json
echo and can be edited in-app from the Hardware screen (F4).
echo.
echo ==================================================
