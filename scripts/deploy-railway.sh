#!/bin/bash
# Railway CLI Deployment Script
# Deploys the game to Railway with service name "final production"

set -e  # Exit on error

echo "🚂 Railway CLI Deployment Script"
echo "=================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI found: $(railway --version)"
echo ""

# Check if logged in
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "⚠️  Not logged in. Please log in..."
    railway login
else
    echo "✅ Already logged in: $(railway whoami)"
fi
echo ""

# Initialize project (creates .railway directory if needed)
echo "📦 Initializing Railway project..."
if [ ! -f .railway/project.json ]; then
    echo "Creating new Railway project..."
    railway init
else
    echo "✅ Project already initialized"
fi
echo ""

# Create PostgreSQL database
echo "🗄️  Setting up PostgreSQL database..."
DB_SERVICE=$(railway service list 2>/dev/null | grep -i postgres || echo "")
if [ -z "$DB_SERVICE" ]; then
    echo "Creating PostgreSQL database service..."
    railway add --service postgres --template postgresql
    echo "⏳ Waiting for database to provision..."
    sleep 10
else
    echo "✅ PostgreSQL database already exists"
fi
echo ""

# Create application service named "final production"
echo "🎮 Creating application service 'final production'..."
APP_SERVICE=$(railway service list 2>/dev/null | grep -i "final production" || echo "")
if [ -z "$APP_SERVICE" ]; then
    echo "Creating service 'final production'..."
    railway service create "final production"
else
    echo "✅ Service 'final production' already exists"
fi
echo ""

# Link to the application service
echo "🔗 Linking to 'final production' service..."
railway link --service "final production"
echo ""

# Set environment variables
echo "⚙️  Setting environment variables..."

# Database URL (reference from postgres service)
echo "Setting DATABASE_URL..."
railway variables set DATABASE_URL='${{postgres.DATABASE_URL}}' --service "final production"

# Production environment
echo "Setting NODE_ENV..."
railway variables set NODE_ENV=production --service "final production"

# Session Secret (generate if not provided)
if [ -z "$SESSION_SECRET" ]; then
    echo "⚠️  SESSION_SECRET not set. Generating one..."
    SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "Generated SESSION_SECRET (save this for later!)"
fi
railway variables set SESSION_SECRET="$SESSION_SECRET" --service "final production"

# Email configuration (prompt for password if not set)
if [ -z "$SMTP_PASSWORD" ]; then
    echo "⚠️  SMTP_PASSWORD not set. Please set it manually in Railway dashboard or export SMTP_PASSWORD"
fi

railway variables set SMTP_HOST=smtpout.secureserver.net --service "final production"
railway variables set SMTP_PORT=587 --service "final production"
railway variables set SMTP_SECURE=false --service "final production"
railway variables set SMTP_USER=brian@brianfloyd.me --service "final production"
railway variables set SMTP_USERNAME=brian --service "final production"

if [ -n "$SMTP_PASSWORD" ]; then
    railway variables set SMTP_PASSWORD="$SMTP_PASSWORD" --service "final production"
fi

# BASE_URL will be set after first deployment
echo "⚠️  Note: BASE_URL will need to be set after first deployment with your Railway URL"
echo ""

# Deploy
echo "🚀 Deploying to Railway..."
railway up --service "final production"
echo ""

# Get the deployment URL
echo "🌐 Getting deployment URL..."
DEPLOYMENT_URL=$(railway domain 2>/dev/null || echo "")
if [ -n "$DEPLOYMENT_URL" ]; then
    echo "✅ Deployment URL: $DEPLOYMENT_URL"
    echo ""
    echo "📝 Update BASE_URL in Railway with: https://$DEPLOYMENT_URL"
    railway variables set BASE_URL="https://$DEPLOYMENT_URL" --service "final production"
else
    echo "⚠️  Could not get deployment URL. Check Railway dashboard."
fi
echo ""

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Check deployment logs: railway logs --service 'final production'"
echo "2. Open dashboard: railway open"
echo "3. Verify all environment variables are set correctly"
echo "4. Test the application at your Railway URL"



























