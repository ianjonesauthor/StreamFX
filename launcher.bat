@echo off
TITLE StreamFX Live Launcher
:: Change window text color to cyan/green vibe
color 0A

echo ===================================================
echo             Starting StreamFX Live...
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH!
    echo Please install Node.js from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b
)

:: 2. Check if node_modules exists, install if missing
if not exist "node_modules\" (
    echo [INFO] First time setup detected. Installing dependencies...
    call npm install
    echo.
)

:: 3. Open Dashboard and Overlay in default browser (giving it a brief moment first)
echo [INFO] Opening StreamFX Live Dashboard & Overlay...
start http://localhost:3000
start http://localhost:3000/overlay.html

echo.
echo ===================================================
echo     StreamFX Live is running! 
echo     Press Ctrl+C in this window to stop the server.
echo ===================================================
echo.

:: 4. Run Node server directly in this window (blocking/running live)
node server.js