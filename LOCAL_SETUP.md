# 🏛️ Saint Mark Booking System - Local Setup

## 🚀 One-Click Launch (Auto-Install Everything)

### Option 1: Complete Auto-Installer (Recommended)
```bash
# Double-click this file - installs everything automatically
install_and_run.bat
```

### Option 2: PowerShell Auto-Installer (Advanced)
```powershell
# Right-click and "Run with PowerShell" - full auto-installation
.\install_and_run.ps1
```

### Option 3: Quick Start (If Node.js already installed)
```bash
# Double-click this file for quick start
quick_start.bat
```

### Option 4: Original Scripts
```bash
# Original launcher (requires manual setup)
run_local.bat
```

## 📋 What These Scripts Do

### 🆕 New Auto-Install Scripts:
1. **Check Node.js**: Automatically detects if Node.js is installed
2. **Auto-Install Node.js**: Uses winget to install Node.js if missing
3. **Install Dependencies**: Automatically installs all backend and frontend packages
4. **Build Frontend**: Builds React app if needed
5. **Start Services**: Launches both backend and frontend
6. **Open Browser**: Automatically opens the application

### 🔧 Original Scripts:
1. **Check Dependencies**: Verifies Node.js is installed
2. **Install Packages**: Automatically installs backend dependencies
3. **Build Frontend**: Builds React app if needed (uses existing build if available)
4. **Start Backend**: Launches the Node.js server on port 5000
5. **Start Frontend**: Serves the React app on port 3000
6. **Open Browser**: Automatically opens the application

## 🌐 Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/api/health

## 🔧 Requirements

- **Windows**: The batch files are designed for Windows
- **Internet**: Required for initial package installation
- **Node.js**: Will be installed automatically by the new scripts

## 📁 File Structure

```
SaintMark-BookingSystem/
├── install_and_run.bat      # 🆕 Complete auto-installer
├── install_and_run.ps1      # 🆕 PowerShell auto-installer
├── quick_start.bat          # 🆕 Quick start (if Node.js exists)
├── run_local.bat            # Original launcher
├── run_local.ps1            # Original PowerShell launcher
├── launcher.html            # Web-based launcher
├── LOCAL_SETUP.md           # This file
├── client/
│   └── build/               # Pre-built React app
└── server/                  # Node.js backend
```

## 🛠️ Troubleshooting

### If Node.js is not found:
1. **New Scripts**: Will automatically install Node.js using winget
2. **Manual Install**: Download from https://nodejs.org/
3. **Restart**: Restart the script after installation

### If ports are busy:
- Close other applications using ports 3000 or 5000
- Or modify the port numbers in the scripts

### If build fails:
- Check your internet connection
- Ensure you have write permissions in the project folder
- Try running as administrator

### If winget is not available:
- The PowerShell script will open the Node.js download page
- Install Node.js manually and restart the script

## 🎯 Features

### 🆕 New Auto-Install Scripts:
- ✅ **Zero Configuration**: Just run and go
- ✅ **Auto-Install Node.js**: Installs Node.js if missing
- ✅ **Smart Detection**: Detects existing installations
- ✅ **Error Handling**: Comprehensive error checking
- ✅ **Progress Tracking**: Shows installation progress
- ✅ **Service Monitoring**: Monitors running services

### Original Scripts:
- ✅ **Zero Configuration**: Just run and go
- ✅ **Auto-Install**: Downloads dependencies automatically
- ✅ **Smart Build**: Uses existing build if available
- ✅ **Auto-Open**: Opens browser automatically
- ✅ **Health Check**: Monitors application status
- ✅ **Cross-Platform**: Works on Windows (PowerShell version)

## 🔑 Admin Login

- **Username**: `admin`
- **Password**: `admin123`

## 📞 Support

If you encounter any issues:
1. Check the console output for error messages
2. Ensure all requirements are met
3. Try running as administrator
4. Check firewall settings for port access
5. For new scripts: Check if winget is available for auto-installation

---

**Enjoy your local booking system! 🎉**
