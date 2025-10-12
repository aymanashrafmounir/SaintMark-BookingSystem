@echo off
chcp 65001 >nul
title Saint Mark Booking System - Stop Services

echo.
echo ========================================
echo 🏛️  Saint Mark Booking System
echo ========================================
echo 🛑 Stop Services
echo ========================================
echo.

echo 🔍 Checking for running services...

:: Check port 5000 (Backend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    echo 🛑 Stopping Backend Server (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Backend Server stopped successfully
    ) else (
        echo ❌ Failed to stop Backend Server
    )
)

:: Check port 3000 (Frontend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo 🛑 Stopping Frontend Server (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Frontend Server stopped successfully
    ) else (
        echo ❌ Failed to stop Frontend Server
    )
)

:: Check for Node.js processes
echo.
echo 🔍 Checking for Node.js processes...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo 🛑 Stopping all Node.js processes...
    taskkill /IM node.exe /F >nul 2>&1
    echo ✅ All Node.js processes stopped
) else (
    echo ✅ No Node.js processes found
)

echo.
echo ========================================
echo ✅ All services stopped!
echo ========================================
echo.
echo You can now run the system again using:
echo - install_and_run.bat
echo - quick_start.bat
echo.
pause
