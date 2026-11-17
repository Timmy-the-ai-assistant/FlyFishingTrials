@echo off
title Fly Fishing Trials - Public Online Tunnel
color 0B

echo ========================================================
echo   FLY FISHING TRIALS - HOST ONLINE VIA LOCALTUNNEL
echo ========================================================
echo.
echo Creating a secure public HTTPS link for riverbank anglers...
echo (Ensure start_app.bat is running in another window)
echo.

npx localtunnel --port 8585

pause
