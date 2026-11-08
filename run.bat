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

:: 3. Start Node server in a new window
echo [INFO] Launching Node.js Server (server.js)...
start "StreamFX Live Server" cmd /k "node server.js"

:: 4. Wait 3 seconds for server to initialize
echo [INFO] Waiting for server to start...
timeout /t 3 /nobreak >nul

:: 5. Open Dashboard and Overlay in default browser
echo [INFO] Opening StreamFX Live Dashboard...
start http://localhost:3000

echo [INFO] Opening StreamFX Live Overlay (for OBS Browser Source)...
start http://localhost:3000/overlay.html

echo.
echo ===================================================
echo     StreamFX Live is running! 
echo     Close the server command window to stop it.
echo ===================================================
echo.
pause