# Saint Mark Booking System - Auto Installer & Launcher
# PowerShell Script

# Set console encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Function to write colored output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Function to check if Node.js is installed
function Test-NodeJS {
    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $true, $nodeVersion
        }
    }
    catch {
        return $false, $null
    }
    return $false, $null
}

# Function to install Node.js automatically
function Install-NodeJS {
    Write-ColorOutput "📥 Node.js not found. Attempting to install..." "Yellow"
    
    # Check if winget is available
    try {
        winget --version >$null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "🔧 Installing Node.js using winget..." "Cyan"
            winget install OpenJS.NodeJS
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "✅ Node.js installed successfully!" "Green"
                Write-ColorOutput "🔄 Please restart this script to continue." "Yellow"
                return $true
            }
        }
    }
    catch {
        Write-ColorOutput "❌ winget not available" "Red"
    }
    
    # Fallback: Open download page
    Write-ColorOutput "🌐 Opening Node.js download page..." "Cyan"
    Start-Process "https://nodejs.org/"
    Write-ColorOutput "📝 Please install Node.js manually and restart this script." "Yellow"
    return $false
}

# Function to run command with error handling
function Invoke-SafeCommand {
    param(
        [string]$Command,
        [string]$WorkingDirectory = ".",
        [string]$Description = ""
    )
    
    if ($Description) {
        Write-ColorOutput "🔄 $Description" "Cyan"
    }
    
    Push-Location $WorkingDirectory
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $LASTEXITCODE"
        }
        return $true
    }
    catch {
        Write-ColorOutput "❌ Error: $($_.Exception.Message)" "Red"
        return $false
    }
    finally {
        Pop-Location
    }
}

# Main execution
Clear-Host
Write-ColorOutput "========================================" "Magenta"
Write-ColorOutput "🏛️  Saint Mark Booking System" "Magenta"
Write-ColorOutput "========================================" "Magenta"
Write-ColorOutput "🚀 Auto Installer & Launcher" "Magenta"
Write-ColorOutput "========================================" "Magenta"
Write-Host ""

# Step 1: Check Node.js
Write-ColorOutput "[1/6] 🔍 Checking Node.js installation..." "Cyan"
$nodeInstalled, $nodeVersion = Test-NodeJS

if (-not $nodeInstalled) {
    Write-ColorOutput "❌ Node.js is not installed!" "Red"
    $installSuccess = Install-NodeJS
    if (-not $installSuccess) {
        Read-Host "Press Enter to exit"
        exit 1
    }
    exit 0
} else {
    Write-ColorOutput "✅ Node.js is installed: $nodeVersion" "Green"
}

# Step 2: Check npm
Write-ColorOutput "`n[2/6] 🔍 Checking npm..." "Cyan"
try {
    $npmVersion = npm --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✅ npm is available: $npmVersion" "Green"
    } else {
        throw "npm not available"
    }
}
catch {
    Write-ColorOutput "❌ npm is not available!" "Red"
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 3: Install backend dependencies
Write-ColorOutput "`n[3/6] 📦 Installing backend dependencies..." "Cyan"
if (-not (Test-Path "server\node_modules")) {
    $success = Invoke-SafeCommand "npm install" "server" "Installing server packages..."
    if (-not $success) {
        Write-ColorOutput "❌ Failed to install backend dependencies!" "Red"
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-ColorOutput "✅ Backend dependencies installed successfully!" "Green"
} else {
    Write-ColorOutput "✅ Backend dependencies already installed!" "Green"
}

# Step 4: Install frontend dependencies
Write-ColorOutput "`n[4/6] 📦 Installing frontend dependencies..." "Cyan"
if (-not (Test-Path "client\node_modules")) {
    $success = Invoke-SafeCommand "npm install" "client" "Installing client packages..."
    if (-not $success) {
        Write-ColorOutput "❌ Failed to install frontend dependencies!" "Red"
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-ColorOutput "✅ Frontend dependencies installed successfully!" "Green"
} else {
    Write-ColorOutput "✅ Frontend dependencies already installed!" "Green"
}

# Step 5: Build frontend
Write-ColorOutput "`n[5/6] 🏗️  Building frontend..." "Cyan"
if (-not (Test-Path "client\build")) {
    $success = Invoke-SafeCommand "npm run build" "client" "Building React application..."
    if (-not $success) {
        Write-ColorOutput "❌ Failed to build frontend!" "Red"
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-ColorOutput "✅ Frontend built successfully!" "Green"
} else {
    Write-ColorOutput "✅ Frontend build already exists!" "Green"
}

# Step 6: Start services
Write-ColorOutput "`n[6/6] 🚀 Starting services..." "Cyan"
Write-ColorOutput "`n========================================" "Magenta"
Write-ColorOutput "🎯 Starting Saint Mark Booking System" "Magenta"
Write-ColorOutput "========================================" "Magenta"
Write-Host ""

Write-ColorOutput "📡 Backend will start on: http://localhost:5000" "Yellow"
Write-ColorOutput "🌐 Frontend will start on: http://localhost:3000" "Yellow"
Write-Host ""

# Start backend
Write-ColorOutput "⏳ Starting backend server..." "Cyan"
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\server
    node index.js
}

# Wait for backend to start
Start-Sleep -Seconds 3

# Start frontend
Write-ColorOutput "⏳ Starting frontend server..." "Cyan"
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\client
    npm start
}

# Wait for frontend to start
Start-Sleep -Seconds 5

Write-ColorOutput "`n========================================" "Magenta"
Write-ColorOutput "✅ System Started Successfully!" "Magenta"
Write-ColorOutput "========================================" "Magenta"
Write-Host ""

Write-ColorOutput "🌐 Frontend: http://localhost:3000" "Green"
Write-ColorOutput "📡 Backend:  http://localhost:5000" "Green"
Write-ColorOutput "🔍 Health:   http://localhost:5000/api/health" "Green"
Write-Host ""

Write-ColorOutput "🔑 Admin Login:" "Yellow"
Write-ColorOutput "   Username: admin" "White"
Write-ColorOutput "   Password: admin123" "White"
Write-Host ""

Write-ColorOutput "🌐 Opening application in browser..." "Cyan"
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

Write-ColorOutput "`n🎉 Enjoy your booking system!" "Green"
Write-ColorOutput "`n📝 To stop the services, close this window or press Ctrl+C" "Yellow"

# Keep the script running and show job status
try {
    while ($true) {
        Start-Sleep -Seconds 10
        
        # Check if jobs are still running
        if ($backendJob.State -ne "Running" -or $frontendJob.State -ne "Running") {
            Write-ColorOutput "`n⚠️  One or more services have stopped!" "Yellow"
            break
        }
        
        # Show status
        Write-ColorOutput "`r🔄 Services running... Backend: $($backendJob.State), Frontend: $($frontendJob.State)" "Cyan" -NoNewline
    }
}
catch {
    Write-ColorOutput "`n🛑 Stopping services..." "Yellow"
    Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
}

Read-Host "`nPress Enter to exit"
