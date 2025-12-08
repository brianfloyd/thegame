# Railway Deployment Guide

Complete guide to deploying The Game to Railway.

## What's Already Configured

The codebase is production-ready for Railway:

| Feature | Implementation |
|---------|----------------|
| Database | Uses `DATABASE_URL` environment variable |
| Port | Uses `process.env.PORT` (Railway auto-sets) with fallback to 3434 |
| SSL | Database connection uses SSL in production (`NODE_ENV=production`) |
| Migrations | Run automatically on server startup |
| WebSocket | Auto-detects HTTPS and uses `wss://` |
| Session Secret | Uses `SESSION_SECRET` environment variable |
| Build Config | `nixpacks.toml` configured for Node.js 20 |
| Node Version | `package.json` specifies `>=18.0.0` |

## Quick Start

### 1. Create Railway Project

1. Sign up/login at https://railway.app
2. Click **"New Project"**
3. Choose **"Deploy from GitHub repo"** (recommended) or **"Empty Project"**

### 2. Add PostgreSQL Database

1. Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Wait for database to provision (1-2 minutes)
3. Note the service name (e.g., "Postgres")

### 3. Add Application Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. Railway auto-detects Node.js

### 4. Configure Environment Variables

Go to your application service → **"Variables"** tab:

#### Database (Auto-link)
Click **"Reference Variable"** → Select PostgreSQL service → Select `DATABASE_URL`

This creates: `${{Postgres.DATABASE_URL}}`

#### Required Variables

```env
NODE_ENV=production
SESSION_SECRET=<generate_random_hex_string>
```

#### Email Configuration (GoDaddy SMTP)

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=<your_password>
BASE_URL=https://<your-railway-url>.railway.app
```

### 5. Generate SESSION_SECRET

Run locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. Deploy

Railway auto-deploys on push (if GitHub connected), or manually trigger from **"Deployments"** tab.

### 7. Verify Deployment

Check logs for:
- ✓ "PostgreSQL connected"
- ✓ "Migration complete"
- ✓ "Server running on http://0.0.0.0:PORT"
- ✓ "NPC Cycle Engine started"

### 8. Update BASE_URL

After getting your Railway URL, update the `BASE_URL` variable to match.

## Environment Variables Summary

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` or direct connection string | Yes |
| `NODE_ENV` | `production` | Yes |
| `SESSION_SECRET` | Random 64-char hex string | Yes |
| `SMTP_HOST` | `smtpout.secureserver.net` | For email |
| `SMTP_PORT` | `587` | For email |
| `SMTP_SECURE` | `false` | For email |
| `SMTP_USER` | `brian@brianfloyd.me` | For email |
| `SMTP_USERNAME` | `brian` | For email |
| `SMTP_PASSWORD` | Your password | For email |
| `BASE_URL` | `https://<app>.railway.app` | For email links |

## Troubleshooting

### Database Connection Issues

**Error: "Could not connect to PostgreSQL database"**
- Verify `DATABASE_URL` is correctly referenced
- Check PostgreSQL service is running
- Ensure format is: `${{ServiceName.DATABASE_URL}}`

**Error: "SSL connection required"**
- Ensure `NODE_ENV=production` is set
- Code handles SSL automatically: `ssl: { rejectUnauthorized: false }`

### Secret Reference Errors

**Error: "secret SMTP_HOST: not found"**

This happens when variables are incorrectly configured as secret references instead of plain values.

**Solution:**
1. Open Railway dashboard: `railway open`
2. Go to service → **"Variables"** tab
3. For each variable, check if it shows as `${{Service.VARIABLE}}`
4. If so, **DELETE** it and re-add as plain value
5. Only `DATABASE_URL` should use reference format

### Duplicate Variable Errors

**Error: "secret NODE_ENV: not found"**

This happens when duplicate variables exist.

**Solution:**
1. Open Railway dashboard
2. Delete ALL duplicate entries for each variable
3. Keep only one of each with correct value
4. Redeploy

### Migration Issues

**Error: "Migration failed"**
- Check migration logs in deployment output
- Verify all `.sql` files are in `migrations/` directory
- Check that `schema_migrations` table was created

### Build Issues

**Build fails**
- Check `package.json` has `engines.node` >= 18.0.0
- Verify all dependencies are in `dependencies` (not just devDependencies)
- Check build logs for specific errors
- Verify `nixpacks.toml` exists

### WebSocket Issues

- Code auto-detects HTTPS and uses `wss://`
- Railway provides HTTPS automatically
- No additional config needed

### Email Issues

**Emails not sending**
- Verify all SMTP variables are set correctly
- Check Railway logs for email errors
- GoDaddy requires port 587 with `SMTP_SECURE=false`
- Test email configuration locally first

## Railway CLI Commands

```bash
# Install CLI
npm i -g @railway/cli

# Login
railway login

# View project
railway open

# View current variables
railway variables

# Deploy
railway up

# View logs
railway logs

# Check status
railway status
```

## Custom Domain Setup

1. Go to application service → **"Settings"**
2. Click **"Generate Domain"** for Railway subdomain
3. Or click **"Custom Domain"** and follow DNS instructions

## Important Notes

1. **Migrations**: Run automatically on every server start
2. **Database**: Railway PostgreSQL persists data automatically
3. **HTTPS**: Railway provides HTTPS automatically
4. **Sessions**: Currently in-memory (fine for single instance). For multiple instances, add Railway Redis
5. **Environment Variables**: Never commit `.env` - all secrets go in Railway Variables

## Cost Considerations

- Railway offers a free tier with $5/month credit
- PostgreSQL database: ~$5/month on hobby plan
- Monitor usage in Railway dashboard

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check deployment logs for specific errors


