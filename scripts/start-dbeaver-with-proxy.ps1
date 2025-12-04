# Start DBeaver with Railway Database Proxy
# 
# This script:
# 1. Starts Railway database proxy in background
# 2. Waits for proxy to initialize
# 3. Launches DBeaver
#
# Usage: .\scripts\start-dbeaver-with-proxy.ps1
#
# Note: Adjust DBeaver path below if needed

Write-Host "=" -NoNewline -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Starting DBeaver with Railway Proxy" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""

# Check if Railway CLI is installed
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayInstalled) {
    Write-Host "ERROR: Railway CLI not found!" -ForegroundColor Red
    Write-Host "Install with: npm install -g @railway/cli" -ForegroundColor Yellow
    Write-Host "Then login with: railway login" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# DBeaver executable path (adjust if needed)
$dbeaverPaths = @(
    "C:\Program Files\DBeaver\dbeaver.exe",
    "C:\Program Files (x86)\DBeaver\dbeaver.exe",
    "$env:LOCALAPPDATA\DBeaver\dbeaver.exe",
    "$env:ProgramFiles\DBeaver\dbeaver.exe"
)

$dbeaverPath = $null
foreach ($path in $dbeaverPaths) {
    if (Test-Path $path) {
        $dbeaverPath = $path
        break
    }
}

if (-not $dbeaverPath) {
    Write-Host "ERROR: DBeaver not found!" -ForegroundColor Red
    Write-Host "Please install DBeaver or update the path in this script." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Common locations:" -ForegroundColor White
    foreach ($path in $dbeaverPaths) {
        Write-Host "  $path" -ForegroundColor Gray
    }
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting Railway database proxy..." -ForegroundColor Green
Write-Host "  (Proxy will run in minimized window)" -ForegroundColor Gray

# Start Railway proxy in minimized window
$proxyScript = Join-Path $PSScriptRoot "railway-db-proxy.ps1"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$proxyScript'" -WindowStyle Minimized

Write-Host "Waiting 5 seconds for proxy to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "Starting DBeaver..." -ForegroundColor Green
Write-Host "  Path: $dbeaverPath" -ForegroundColor Gray

# Start DBeaver
Start-Process $dbeaverPath

Write-Host ""
Write-Host "=" -NoNewline -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""
Write-Host "Railway proxy is running in background." -ForegroundColor White
Write-Host "DBeaver should open automatically." -ForegroundColor White
Write-Host ""
Write-Host "To stop the proxy, close the minimized PowerShell window." -ForegroundColor Yellow
Write-Host ""
















