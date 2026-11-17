@echo off
title Push Updates to mckjam010/wpflyfishing
color 0A
cd /d "%~dp0"

echo ======================================================================
echo   UPDATING CLOUDFLARE: PUSHING TO github.com/mckjam010/wpflyfishing
echo ======================================================================
echo.

git push https://github.com/mckjam010/wpflyfishing.git main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo   [SUCCESS] Code pushed to mckjam010/wpflyfishing!
    echo   Cloudflare is now automatically building and deploying.
    echo   Visit https://trials.wpflyfishing.com in 20 seconds.
    echo ======================================================================
) else (
    echo.
    echo If a GitHub sign-in window popped up, please complete the sign-in
    echo and re-run this script.
)

echo.
pause
