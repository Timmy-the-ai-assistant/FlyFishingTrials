@echo off
title Fly Fishing Trials App & Tournament Manager
color 0A

echo ========================================================
echo   FLY FISHING TRIALS - 4-SESSION TOURNAMENT MANAGER
echo ========================================================
echo.
echo Starting web server on http://localhost:8585 ...
echo Mobile / Riverbank access available via your Wi-Fi network.
echo.

cd /d "%~dp0"

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" app.py 8585
) else (
    python app.py 8585 2>nul || py app.py 8585
)

pause
