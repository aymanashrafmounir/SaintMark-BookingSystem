@echo off
chcp 65001 >nul
title Saint Mark Booking System - Quick Start

echo.
echo ========================================
echo 🏛️  Saint Mark Booking System
echo ========================================
echo 🚀 Quick Start
echo ========================================
echo.

:: Check Node.js
echo 🔍 Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo 📥 Please install from: https://nodejs.org/
    start https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js found!

:: Install dependencies
echo.
echo 📦 Installing dependencies...
cd server
if not exist node_modules (
    echo Installing server packages...
    npm install
)
cd ..\client
if not exist node_modules (
    echo Installing client packages...
    npm install
)

:: Build if needed
echo.
echo 🏗️  Building frontend...
if not exist build (
    npm run build
)

:: Check and kill existing processes on ports
echo.
echo 🔍 Checking for existing services...
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
echo 🚀 Starting services...
cd ..\server
start "Backend" cmd /k "node index.js"
timeout /t 3 /nobreak >nul

cd ..\client
start "Frontend" cmd /k "npm start"
timeout /t 5 /nobreak >nul

echo.
echo ✅ System started!
echo 🌐 Frontend: http://localhost:3000
echo 📡 Backend: http://localhost:5000
echo.
echo 🔑 Login: admin / admin123
echo.
start http://localhost:3000
echo Press any key to close...
pause >nul
