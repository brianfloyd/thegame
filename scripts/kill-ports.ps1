# Kill processes using game server ports
# 
# This script kills any Node.js processes using ports 3434 or 3535
# Useful when ports are stuck after a crash or improper shutdown
#
# Usage: .\scripts\kill-ports.ps1

$separator = "=" * 60
Write-Host $separator -ForegroundColor Cyan
Write-Host "Killing processes on game server ports" -ForegroundColor Yellow
Write-Host $separator -ForegroundColor Cyan
Write-Host ""

$ports = @(3434, 3535)
$killed = 0

foreach ($port in $ports) {
    Write-Host "Checking port $port..." -ForegroundColor White
    
    # Find process using the port
    $netstat = netstat -ano | Select-String ":$port.*LISTENING"
    
    if ($netstat) {
        # Extract PID from netstat output
        $pid = ($netstat -split '\s+')[-1]
        
        if ($pid -match '^\d+$') {
            # Get process info
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            
            if ($process) {
                Write-Host "  Found process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Yellow
                
                # Only kill Node.js processes for safety
                if ($process.ProcessName -eq "node" -or $process.ProcessName -eq "node.exe") {
                    Write-Host "  Killing Node.js process on port $port..." -ForegroundColor Red
                    try {
                        Stop-Process -Id $pid -Force -ErrorAction Stop
                        Write-Host "  Process killed" -ForegroundColor Green
                        $killed++
                    } catch {
                        Write-Host "  Failed to kill process: $_" -ForegroundColor Red
                    }
                } else {
                    Write-Host "  Skipping non-Node.js process (safety)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "  Process not found (may have already exited)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  Port $port is free" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host $separator -ForegroundColor Cyan
if ($killed -gt 0) {
    Write-Host "Killed $killed process(es)" -ForegroundColor Green
} else {
    Write-Host "No processes to kill" -ForegroundColor Green
}
Write-Host $separator -ForegroundColor Cyan
Write-Host ""
