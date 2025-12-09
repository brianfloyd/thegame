# Setup Network Access for Game Server (Port 3434)
# This script configures Windows Firewall to allow incoming connections on port 3434

Write-Host "Setting up network access for game server on port 3434..." -ForegroundColor Cyan

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Remove existing rule if it exists
$existingRule = Get-NetFirewallRule -DisplayName "Game Server Port 3434" -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "Removing existing firewall rule..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName "Game Server Port 3434" -ErrorAction SilentlyContinue
}

# Create new firewall rule
try {
    New-NetFirewallRule -DisplayName "Game Server Port 3434" `
        -Direction Inbound `
        -LocalPort 3434 `
        -Protocol TCP `
        -Action Allow `
        -Description "Allows incoming connections to the game server on port 3434" | Out-Null
    
    Write-Host "✓ Firewall rule created successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to create firewall rule: $_" -ForegroundColor Red
    exit 1
}

# Get local IP address
Write-Host "`nYour local IP addresses:" -ForegroundColor Cyan
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike "127.*" -and 
    $_.IPAddress -notlike "169.254.*" 
} | Select-Object -ExpandProperty IPAddress

if ($ipAddresses) {
    foreach ($ip in $ipAddresses) {
        Write-Host "  → http://$ip`:3434" -ForegroundColor Green
    }
} else {
    Write-Host "  Could not determine IP address. Run 'ipconfig' to find it manually." -ForegroundColor Yellow
}

Write-Host "`nSetup complete! Other computers on your network can now connect using the IP addresses above." -ForegroundColor Green
Write-Host "Make sure your server is running with: npm start (or node server.js)" -ForegroundColor Yellow


