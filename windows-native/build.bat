@echo off
echo.
echo ==================================================
echo   NovaPOS Windows Desktop — Avalonia UI .NET 10
echo ==================================================
echo.

dotnet build NovaPOS.csproj -c Release
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

xcopy /y /q /s bin\Release\net10.0\* . >nul 2>nul
echo.
echo [SUCCESS] Avalonia UI Desktop build complete!
echo Output executable: NovaPOS.exe (.NET 10.0)
echo.
echo ==================================================
