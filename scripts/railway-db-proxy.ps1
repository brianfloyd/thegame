# Railway Database Proxy
# Keeps a local tunnel to Railway database for DBeaver connection
# 
# Usage: .\scripts\railway-db-proxy.ps1
# Keep this window open while using DBeaver

Write-Host "=" -NoNewline -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Railway Database Proxy" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""
Write-Host "This script creates a local tunnel to Railway PostgreSQL database." -ForegroundColor White
Write-Host "Keep this window open while using DBeaver." -ForegroundColor White
Write-Host ""
Write-Host "To connect DBeaver:" -ForegroundColor Green
Write-Host "  Host: localhost" -ForegroundColor White
Write-Host "  Port: 5432 (or port shown below)" -ForegroundColor White
Write-Host "  Database: railway" -ForegroundColor White
Write-Host "  Username: postgres" -ForegroundColor White
Write-Host "  Password: (from Railway dashboard)" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the proxy" -ForegroundColor Yellow
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

# Start Railway proxy
Write-Host "Starting Railway database proxy..." -ForegroundColor Green
railway connect postgres
















