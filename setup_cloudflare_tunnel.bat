@echo off
title Cloudflare Tunnel Setup for wpflyfishing.com
color 0B

echo ========================================================
echo   CLOUDFLARE TUNNEL - WPFLYFISHING.COM LIVE HOSTING
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Check if cloudflared.exe exists
if not exist "cloudflared.exe" (
    echo [INFO] cloudflared.exe not found. Downloading official Cloudflare client...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
    if exist "cloudflared.exe" (
        echo [OK] cloudflared.exe downloaded successfully.
    ) else (
        echo [ERROR] Failed to download cloudflared.exe. Please download manually from:
        echo https://github.com/cloudflare/cloudflared/releases
        pause
        exit /b 1
    )
)

echo.
echo Choose hosting mode:
echo [1] Quick Cloudflare Tunnel (Instant HTTPS link, no login required)
echo [2] Bind to wpflyfishing.com (Login to Cloudflare account with your Namecheap domain)
echo.
set /p choice="Enter choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo Starting Cloudflare Quick Tunnel on port 8585...
    echo Your public HTTPS URL will appear below shortly:
    echo.
    .\cloudflared.exe tunnel --url http://localhost:8585
) else (
    echo.
    echo Step 1: Authorizing your Cloudflare account with wpflyfishing.com...
    echo A browser window will open to approve the tunnel.
    .\cloudflared.exe tunnel login
    echo.
    echo Step 2: Creating tunnel 'trials-wpflyfishing'...
    .\cloudflared.exe tunnel create trials-wpflyfishing
    echo.
    echo Step 3: Routing trials.wpflyfishing.com to the tunnel...
    .\cloudflared.exe tunnel route dns trials-wpflyfishing trials.wpflyfishing.com
    echo.
    echo Step 4: Running tunnel for http://localhost:8585...
    .\cloudflared.exe tunnel run --url http://localhost:8585 trials-wpflyfishing
)

pause
