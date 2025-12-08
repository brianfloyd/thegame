# Railway CLI Deployment Script (PowerShell)
# Deploys the game to Railway with service name "final production"

$ErrorActionPreference = "Stop"

Write-Host "🚂 Railway CLI Deployment Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Railway CLI is installed
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Railway CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

$railwayVersion = railway --version 2>&1
Write-Host "✅ Railway CLI found: $railwayVersion" -ForegroundColor Green
Write-Host ""

# Check if logged in
Write-Host "🔐 Checking Railway authentication..." -ForegroundColor Cyan
try {
    $whoami = railway whoami 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Already logged in: $whoami" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Not logged in. Please log in..." -ForegroundColor Yellow
        railway login
    }
} catch {
    Write-Host "⚠️  Not logged in. Please log in..." -ForegroundColor Yellow
    railway login
}
Write-Host ""

# Initialize project
Write-Host "📦 Initializing Railway project..." -ForegroundColor Cyan
if (-not (Test-Path ".railway\project.json")) {
    Write-Host "Creating new Railway project..." -ForegroundColor Yellow
    railway init
} else {
    Write-Host "✅ Project already initialized" -ForegroundColor Green
}
Write-Host ""

# Create PostgreSQL database
Write-Host "🗄️  Setting up PostgreSQL database..." -ForegroundColor Cyan
$dbServices = railway service list 2>&1
if ($dbServices -notmatch "postgres") {
    Write-Host "Creating PostgreSQL database service..." -ForegroundColor Yellow
    railway add --service postgres --template postgresql
    Write-Host "⏳ Waiting for database to provision..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
} else {
    Write-Host "✅ PostgreSQL database already exists" -ForegroundColor Green
}
Write-Host ""

# Create application service named "final production"
Write-Host "🎮 Creating application service 'final production'..." -ForegroundColor Cyan
$appServices = railway service list 2>&1
if ($appServices -notmatch "final production") {
    Write-Host "Creating service 'final production'..." -ForegroundColor Yellow
    railway service create "final production"
} else {
    Write-Host "✅ Service 'final production' already exists" -ForegroundColor Green
}
Write-Host ""

# Link to the application service
Write-Host "🔗 Linking to 'final production' service..." -ForegroundColor Cyan
railway link --service "final production"
Write-Host ""

# Set environment variables
Write-Host "⚙️  Setting environment variables..." -ForegroundColor Cyan

# Database URL (reference from postgres service)
Write-Host "Setting DATABASE_URL..." -ForegroundColor Yellow
railway variables set DATABASE_URL='${{postgres.DATABASE_URL}}' --service "final production"

# Production environment
Write-Host "Setting NODE_ENV..." -ForegroundColor Yellow
railway variables set NODE_ENV=production --service "final production"

# Session Secret (generate if not provided)
if (-not $env:SESSION_SECRET) {
    Write-Host "⚠️  SESSION_SECRET not set. Generating one..." -ForegroundColor Yellow
    $sessionSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    Write-Host "Generated SESSION_SECRET (save this for later!)" -ForegroundColor Green
    $env:SESSION_SECRET = $sessionSecret
}
railway variables set SESSION_SECRET="$env:SESSION_SECRET" --service "final production"

# Email configuration
if (-not $env:SMTP_PASSWORD) {
    Write-Host "⚠️  SMTP_PASSWORD not set. Please set it manually in Railway dashboard or set `$env:SMTP_PASSWORD" -ForegroundColor Yellow
}

railway variables set SMTP_HOST=smtpout.secureserver.net --service "final production"
railway variables set SMTP_PORT=587 --service "final production"
railway variables set SMTP_SECURE=false --service "final production"
railway variables set SMTP_USER=brian@brianfloyd.me --service "final production"
railway variables set SMTP_USERNAME=brian --service "final production"

if ($env:SMTP_PASSWORD) {
    railway variables set SMTP_PASSWORD="$env:SMTP_PASSWORD" --service "final production"
}

# BASE_URL will be set after first deployment
Write-Host "⚠️  Note: BASE_URL will need to be set after first deployment with your Railway URL" -ForegroundColor Yellow
Write-Host ""

# Deploy
Write-Host "🚀 Deploying to Railway..." -ForegroundColor Cyan
railway up --service "final production"
Write-Host ""

# Get the deployment URL
Write-Host "🌐 Getting deployment URL..." -ForegroundColor Cyan
try {
    $deploymentUrl = railway domain 2>&1
    if ($LASTEXITCODE -eq 0 -and $deploymentUrl) {
        Write-Host "✅ Deployment URL: $deploymentUrl" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Setting BASE_URL..." -ForegroundColor Yellow
        railway variables set BASE_URL="https://$deploymentUrl" --service "final production"
    } else {
        Write-Host "⚠️  Could not get deployment URL. Check Railway dashboard." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not get deployment URL. Check Railway dashboard." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check deployment logs: railway logs --service 'final production'"
Write-Host "2. Open dashboard: railway open"
Write-Host "3. Verify all environment variables are set correctly"
Write-Host "4. Test the application at your Railway URL"
































