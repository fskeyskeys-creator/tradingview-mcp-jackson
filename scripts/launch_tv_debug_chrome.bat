@echo off
REM Launch TradingView in a dedicated, isolated Chrome profile with CDP enabled.
REM Fallback for machines where TradingView Desktop is a Microsoft Store (MSIX) install --
REM MSIX sandboxing strips --remote-debugging-port from the Electron app, so this uses
REM a normal Chrome window pointed at tradingview.com/chart instead. The MCP server
REM connects over CDP the same way either way (see src/connection.js: it just looks
REM for any page target matching tradingview.com/chart).
REM
REM Usage: scripts\launch_tv_debug_chrome.bat [port]

set PORT=%1
if "%PORT%"=="" set PORT=9222

set "PROFILE_DIR=%LOCALAPPDATA%\TradingView-MCP-Profile"

REM Auto-detect Chrome or Edge
set "BROWSER_EXE="
if exist "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"
if "%BROWSER_EXE%"=="" if exist "%PROGRAMFILES(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%PROGRAMFILES(x86)%\Google\Chrome\Application\chrome.exe"
if "%BROWSER_EXE%"=="" if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if "%BROWSER_EXE%"=="" if exist "%PROGRAMFILES(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%PROGRAMFILES(x86)%\Microsoft\Edge\Application\msedge.exe"
if "%BROWSER_EXE%"=="" if exist "%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe"

if "%BROWSER_EXE%"=="" (
    echo Error: Neither Chrome nor Edge was found in the usual install locations.
    echo Install one of them, or edit this script to point at your browser's .exe.
    exit /b 1
)

echo Using browser: %BROWSER_EXE%
echo Profile dir:    %PROFILE_DIR%
echo Starting with --remote-debugging-port=%PORT% ...
start "" "%BROWSER_EXE%" --remote-debugging-port=%PORT% --user-data-dir="%PROFILE_DIR%" "https://www.tradingview.com/chart/"

echo Waiting for CDP to become available...
timeout /t 5 /nobreak >nul

:check
curl -s http://localhost:%PORT%/json/version >nul 2>&1
if %errorlevel% neq 0 (
    echo Still waiting...
    timeout /t 2 /nobreak >nul
    goto check
)

echo.
echo CDP ready at http://localhost:%PORT%
curl -s http://localhost:%PORT%/json/version
echo.
echo If this is the first run, log into TradingView in the window that opened.
