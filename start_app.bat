@echo off
title Fly Fishing Trials App & Tournament Manager
color 0A

echo ========================================================
echo   FLY FISHING TRIALS - 4-SESSION TOURNAMENT MANAGER
echo   Local Web Access: http://localhost:8585
echo ========================================================
echo.

cd /d "%~dp0"

set "PYTHON_EXE="

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) else if exist "C:\Python311\python.exe" (
    set "PYTHON_EXE=C:\Python311\python.exe"
) else (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON_EXE=python"
)

if not defined PYTHON_EXE (
    where py >nul 2>&1
    if not errorlevel 1 set "PYTHON_EXE=py"
)

if not defined PYTHON_EXE (
    echo [ERROR] Python 3 was not found on your system!
    echo Please ensure Python 3.11 is installed.
    pause
    exit /b 1
)

echo Starting Fly Fishing Trials on port 8585 using: %PYTHON_EXE%
echo.

"%PYTHON_EXE%" app.py 8585

if errorlevel 1 (
    echo.
    echo Server stopped or encountered an error.
    pause
)
