# Railway Quick Start Checklist

Quick reference for deploying to Railway. See `railway-deployment-guide.md` for detailed instructions.

## Pre-Deployment Checklist

- [ ] Code is committed to Git repository
- [ ] All sensitive data removed from code (moved to environment variables)
- [ ] `.env` file is in `.gitignore` (already done)
- [ ] `package.json` has correct `engines.node` (>=18.0.0) ✓
- [ ] `nixpacks.toml` exists and is correct ✓

## Railway Setup Steps

### 1. Create Project
- [ ] Sign up/login to Railway (https://railway.app)
- [ ] Click "New Project"
- [ ] Choose "Deploy from GitHub repo" or "Empty Project"

### 2. Add PostgreSQL
- [ ] Click "+ New" → "Database" → "Add PostgreSQL"
- [ ] Wait for database to provision
- [ ] Note the service name (e.g., "Postgres")

### 3. Add Application
- [ ] Click "+ New" → "GitHub Repo" (or "Empty Service")
- [ ] Select your repository
- [ ] Railway will auto-detect Node.js

### 4. Configure Environment Variables

Go to your application service → "Variables" tab and add:

#### Database (Auto-linked)
- [ ] `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (use "Reference Variable" button)

#### Required Variables
- [ ] `NODE_ENV` = `production`
- [ ] `SESSION_SECRET` = `<generate_random_string>` (see below)
- [ ] `SMTP_HOST` = `smtpout.secureserver.net`
- [ ] `SMTP_PORT` = `587`
- [ ] `SMTP_SECURE` = `false`
- [ ] `SMTP_USER` = `brian@brianfloyd.me`
- [ ] `SMTP_USERNAME` = `brian`
- [ ] `SMTP_PASSWORD` = `<your_password>`
- [ ] `BASE_URL` = `https://<your-railway-url>.railway.app` (update after first deploy)

### 5. Generate SESSION_SECRET

Run locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output to `SESSION_SECRET` variable.

### 6. Deploy

- [ ] Railway auto-deploys on push (if GitHub connected)
- [ ] Or manually trigger from "Deployments" tab
- [ ] Watch build logs

### 7. Verify

- [ ] Check deployment logs for:
  - ✓ "PostgreSQL connected"
  - ✓ "Migration complete"
  - ✓ "Server running on http://0.0.0.0:PORT"
- [ ] Visit your Railway URL
- [ ] Test login/registration
- [ ] Test game functionality

### 8. Update BASE_URL

- [ ] After getting Railway URL, update `BASE_URL` variable
- [ ] Redeploy (auto-redeploys on variable change)

## Environment Variables Summary

```env
# Auto-provided by Railway
DATABASE_URL=${{Postgres.DATABASE_URL}}
PORT=<auto-set>

# Required
NODE_ENV=production
SESSION_SECRET=<random_hex_string>

# Email (GoDaddy)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=<your_password>
BASE_URL=https://<your-app>.railway.app
```

## Common Issues

### Database Connection Fails
- Verify `DATABASE_URL` is referenced correctly
- Check PostgreSQL service is running
- Format: `${{ServiceName.DATABASE_URL}}`

### Migrations Fail
- Check migration logs in deployment output
- Verify all `.sql` files are in `migrations/` directory

### WebSocket Issues
- Code auto-detects HTTPS and uses `wss://`
- Railway provides HTTPS automatically
- No additional config needed

### Build Fails
- Check `package.json` has all dependencies (not just devDependencies)
- Verify Node.js version (>=18.0.0)
- Check build logs for specific errors

## Railway URLs

- Dashboard: https://railway.app
- Docs: https://docs.railway.app
- Support: Railway Discord

## Next Steps

1. Test all game features
2. Monitor logs for errors
3. Set up custom domain (optional)
4. Invite testers!













