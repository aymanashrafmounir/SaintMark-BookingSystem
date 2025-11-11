@echo off
chcp 65001 >nul
title Saint Mark Booking System - Auto Installer & Launcher

echo.
echo ========================================
echo 🏛️  Saint Mark Booking System
echo ========================================
echo 🚀 Auto Installer & Launcher
echo ========================================
echo.

:: Check if Node.js is installed
echo [1/6] 🔍 Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo.
    echo 📥 Please install Node.js from: https://nodejs.org/
    echo    - Download the LTS version
    echo    - Run the installer
    echo    - Restart this script after installation
    echo.
    echo 🌐 Opening Node.js download page...
    start https://nodejs.org/
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo ✅ Node.js is installed: %NODE_VERSION%
)

:: Check if npm is available
echo.
echo [2/6] 🔍 Checking npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not available!
    echo Please reinstall Node.js
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo ✅ npm is available: %NPM_VERSION%
)

:: Install backend dependencies
echo.
echo [3/6] 📦 Installing backend dependencies...
cd server
if not exist node_modules (
    echo Installing server packages...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install backend dependencies!
        pause
        exit /b 1
    )
    echo ✅ Backend dependencies installed successfully!
) else (
    echo ✅ Backend dependencies already installed!
)

:: Install frontend dependencies
echo.
echo [4/6] 📦 Installing frontend dependencies...
cd ..\client
if not exist node_modules (
    echo Installing client packages...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install frontend dependencies!
        pause
        exit /b 1
    )
    echo ✅ Frontend dependencies installed successfully!
) else (
    echo ✅ Frontend dependencies already installed!
)

:: Build frontend if needed
echo.
echo [5/6] 🏗️  Building frontend...
if not exist build (
    echo Building React application...
    npm run build
    if %errorlevel% neq 0 (
        echo ❌ Failed to build frontend!
        pause
        exit /b 1
    )
    echo ✅ Frontend built successfully!
) else (
    echo ✅ Frontend build already exists!
)

:: Check and kill existing processes on ports
echo.
echo [6/6] 🔍 Checking for existing services...
netstat -ano | findstr :5000 >nul 2>&1
if %errorlevel% equ 0 (
    echo 🛑 Stopping existing Backend Server...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
        taskkill /PID %%a /F >nul 2>&1
    )
)
netstat -ano | findstr :3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo 🛑 Stopping existing Frontend Server...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        taskkill /PID %%a /F >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul

:: Start services
echo.
echo [6/6] 🚀 Starting services...
echo.
echo ========================================
echo 🎯 Starting Saint Mark Booking System
echo ========================================
echo.
echo 📡 Backend will start on: http://localhost:5000
echo 🌐 Frontend will start on: http://localhost:3000
echo.
echo ⏳ Starting backend server...
cd ..\server
start "Backend Server" cmd /k "echo 🚀 Starting Backend Server... && node index.js"

:: Wait a moment for backend to start
timeout /t 3 /nobreak >nul

echo ⏳ Starting frontend server...
cd ..\client
start "Frontend Server" cmd /k "echo 🌐 Starting Frontend Server... && npm start"

:: Wait a moment for frontend to start
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo ✅ System Started Successfully!
echo ========================================
echo.
echo 🌐 Frontend: http://localhost:3000
echo 📡 Backend:  http://localhost:5000
echo 🔍 Health:   http://localhost:5000/api/health
echo.
echo 🔑 Admin Login:
echo    Username: admin
echo    Password: admin123
echo.
echo 📝 Note: Two command windows will open:
echo    - One for the backend server
echo    - One for the frontend server
echo.
echo 🌐 Opening application in browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo 🎉 Enjoy your booking system!
echo.
echo Press any key to close this window...
pause >nul
