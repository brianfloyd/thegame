# Railway Deployment Guide

Complete step-by-step guide to deploy your game to Railway for external testing.

## Prerequisites

- Railway account (sign up at https://railway.app)
- GitHub account (if using GitHub integration)
- Your game code committed to a Git repository

## Step 1: Create a New Railway Project

1. Go to https://railway.app and log in
2. Click **"New Project"** or **"Create Project"**
3. Choose one of these options:
   - **"Deploy from GitHub repo"** (recommended) - Connect your GitHub account and select your repository
   - **"Empty Project"** - We'll add services manually

## Step 2: Add PostgreSQL Database Service

1. In your Railway project, click **"+ New"** or **"Add Service"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically create a PostgreSQL database
4. Wait for the database to provision (usually 1-2 minutes)

## Step 3: Get Database Connection String

1. Click on your PostgreSQL service
2. Go to the **"Variables"** tab
3. Find the `DATABASE_URL` variable (Railway automatically creates this)
4. Copy the connection string (you'll need it for the app service)

## Step 4: Add Your Application Service

1. In your Railway project, click **"+ New"** or **"Add Service"**
2. Select **"GitHub Repo"** (if using GitHub) or **"Empty Service"** (if deploying manually)
3. If using GitHub:
   - Select your repository
   - Railway will auto-detect Node.js and start building
4. If using Empty Service:
   - Click **"Settings"** → **"Source"**
   - Connect your GitHub repository or upload your code

## Step 5: Configure Environment Variables

1. Click on your application service
2. Go to the **"Variables"** tab
3. Click **"New Variable"** and add the following:

### Required Variables

```env
# Database (Railway auto-provides this, but verify it exists)
DATABASE_URL=<automatically provided by Railway PostgreSQL service>

# Server Configuration
NODE_ENV=production
PORT=<automatically set by Railway, but defaults to 3434>

# Email Configuration (GoDaddy SMTP)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=<your_godaddy_email_password>
BASE_URL=https://<your-railway-app-url>.railway.app

# Session Secret (generate a random string)
SESSION_SECRET=<generate_a_random_string_here>
```

### Generating SESSION_SECRET

Run this command locally to generate a secure random string:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `SESSION_SECRET` value.

## Step 6: Link Database to Application

1. In your application service, go to **"Variables"** tab
2. Click **"Reference Variable"**
3. Select your PostgreSQL service
4. Select `DATABASE_URL`
5. Railway will automatically add it as `${{Postgres.DATABASE_URL}}`

**OR** manually add:
- Variable name: `DATABASE_URL`
- Value: `${{Postgres.DATABASE_URL}}` (replace "Postgres" with your actual database service name)

## Step 7: Configure Build Settings

Railway should auto-detect Node.js from your `package.json`, but verify:

1. Go to your application service → **"Settings"**
2. Check **"Build Command"** - should be empty (uses `npm install` by default)
3. Check **"Start Command"** - should be `npm start` (which runs `node server.js`)
4. Verify **"Root Directory"** is set correctly (usually `/` or empty)

## Step 8: Deploy

1. Railway will automatically deploy when you:
   - Push to your connected GitHub branch (if using GitHub integration)
   - Or manually trigger a deploy from the **"Deployments"** tab
2. Watch the build logs in the **"Deployments"** tab
3. Wait for deployment to complete (usually 2-5 minutes)

## Step 9: Verify Deployment

1. Once deployed, Railway will provide a URL like: `https://your-app-name.up.railway.app`
2. Click on the URL or go to **"Settings"** → **"Generate Domain"** to get a custom domain
3. Test the application:
   - Visit the URL in your browser
   - Try logging in/registering
   - Verify database connection works
   - Check that migrations ran (check Railway logs)

## Step 10: Check Logs for Issues

1. Go to your application service → **"Deployments"** tab
2. Click on the latest deployment
3. Check the logs for:
   - Database connection success
   - Migrations running successfully
   - Server starting on correct port
   - Any error messages

### Expected Log Output

You should see:
```
PostgreSQL connected: [timestamp]
Running PostgreSQL migrations...
  Applying 001_schema.sql...
  ...
Migration complete
Server running on http://0.0.0.0:PORT - Build [timestamp]
NPC Cycle Engine started (interval: 1000ms)
Room update timer started (interval: 1000ms)
Email service ready to send messages
```

## Step 11: Update BASE_URL

1. After getting your Railway URL, update the `BASE_URL` environment variable:
   - Go to **Variables** tab
   - Edit `BASE_URL`
   - Set it to: `https://your-app-name.up.railway.app`
2. Redeploy (Railway will auto-redeploy when you change variables)

## Step 12: Set Up Custom Domain (Optional)

1. Go to your application service → **"Settings"**
2. Click **"Generate Domain"** for a Railway subdomain
3. Or add a custom domain:
   - Click **"Custom Domain"**
   - Add your domain
   - Follow DNS configuration instructions

## Troubleshooting

### Database Connection Issues

**Error: "Could not connect to PostgreSQL database"**
- Verify `DATABASE_URL` is correctly referenced
- Check that PostgreSQL service is running
- Ensure the variable reference format is correct: `${{ServiceName.DATABASE_URL}}`

**Error: "SSL connection required"**
- The code already handles this with `ssl: { rejectUnauthorized: false }` in production
- Verify `NODE_ENV=production` is set

### Migration Issues

**Error: "Migration failed"**
- Check migration logs in Railway deployment logs
- Verify all migration files are in the `migrations/` directory
- Check that `schema_migrations` table was created

### Port Issues

**Error: "Port already in use"**
- Railway automatically sets `PORT` environment variable
- Your code uses `process.env.PORT || 3434`, which should work
- Verify Railway is setting the PORT variable (check Variables tab)

### Email Issues

**Emails not sending**
- Verify all SMTP variables are set correctly
- Check Railway logs for email errors
- Test email configuration locally first
- GoDaddy SMTP may require specific port/secure settings

### Build Issues

**Build fails**
- Check that `package.json` has correct `engines.node` (>=18.0.0)
- Verify all dependencies are in `package.json` (not just devDependencies)
- Check build logs for specific error messages
- Ensure `nixpacks.toml` is correct (already configured)

## Important Notes

1. **Migrations Run Automatically**: Your `server.js` runs migrations on startup (line 278-279), so they'll run automatically on each deploy
2. **Database Persistence**: Railway PostgreSQL databases persist data, but verify your plan includes persistent storage
3. **Environment Variables**: Never commit `.env` file to Git. All secrets should be in Railway Variables
4. **WebSocket Support**: Railway supports WebSockets, but ensure your app uses `wss://` in production (check `client.js` for WebSocket URL logic)
5. **Session Storage**: Currently using in-memory sessions. For production with multiple instances, consider Redis (Railway offers Redis service)

## Next Steps After Deployment

1. Test user registration and login
2. Test character creation
3. Test game functionality (movement, NPCs, items, etc.)
4. Monitor Railway logs for errors
5. Set up Railway notifications for deployment failures
6. Consider setting up Railway's monitoring/analytics

## Cost Considerations

- Railway offers a free tier with $5/month credit
- PostgreSQL database: ~$5/month on free tier
- Application hosting: Free on hobby plan
- Monitor usage in Railway dashboard

## Security Checklist

- [ ] All sensitive variables in Railway (not in code)
- [ ] `SESSION_SECRET` is a strong random string
- [ ] `SMTP_PASSWORD` is secure
- [ ] `NODE_ENV=production` is set
- [ ] Database connection uses SSL
- [ ] HTTPS is enabled (Railway provides this automatically)

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check deployment logs for specific errors























