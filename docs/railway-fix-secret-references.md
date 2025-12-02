# Fix Railway Secret Reference Errors

## Current Issue

Error: `secret SMTP_HOST: not found`

Railway's build system is trying to reference `SMTP_HOST` (and likely other variables) as secrets from another service, but they should be plain environment variables.

## Root Cause

When variables are set via Railway CLI or dashboard, they might be incorrectly configured as **secret references** (like `${{Service.SMTP_HOST}}`) instead of **plain values**.

## Solution: Fix Variables in Railway Dashboard

Since your git repo isn't attached and you're deploying via CLI, you need to ensure all variables are set as **plain values**, not secret references.

### Steps:

1. **Open Railway Dashboard**:
   ```bash
   railway open
   ```
   Or: https://railway.com/project/d2f41f4a-4ddb-4c2f-a3ee-b3f716990c2e

2. **Go to "final production" service → "Variables" tab**

3. **For EACH variable, check if it's a reference or plain value**:
   - If it shows as `${{Service.VARIABLE}}` → **DELETE IT**
   - If it shows as a plain value (like `smtpout.secureserver.net`) → **KEEP IT**

4. **Re-add variables as plain values** (delete and recreate if needed):

   ```
   SMTP_HOST = smtpout.secureserver.net
   SMTP_PORT = 587
   SMTP_SECURE = false
   SMTP_USER = brian@brianfloyd.me
   SMTP_USERNAME = brian
   SMTP_PASSWORD = Hh37683768!
   NODE_ENV = production
   SESSION_SECRET = bde93c5c94d38119c483287bb33fc25d8c99a246b62d940ddcb62b33d02b9b61
   BASE_URL = https://final-production-production.up.railway.app
   DATABASE_URL = postgresql://postgres:SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG@postgres.railway.internal:5432/railway
   ```

5. **For DATABASE_URL specifically**:
   - You can either use the direct connection string (shown above)
   - OR use "Reference Variable" button to properly link to PostgreSQL service
   - If using reference, it should show as: `${{Postgres.DATABASE_URL}}` (where "Postgres" is your database service name)

6. **After fixing all variables, redeploy**:
   ```bash
   railway up
   ```

## Quick Checklist

Make sure these variables are set as **plain values** (not references):
- [ ] `SMTP_HOST` = `smtpout.secureserver.net` (plain text)
- [ ] `SMTP_PORT` = `587` (plain text)
- [ ] `SMTP_SECURE` = `false` (plain text)
- [ ] `SMTP_USER` = `brian@brianfloyd.me` (plain text)
- [ ] `SMTP_USERNAME` = `brian` (plain text)
- [ ] `SMTP_PASSWORD` = `Hh37683768!` (plain text)
- [ ] `NODE_ENV` = `production` (plain text)
- [ ] `SESSION_SECRET` = `bde93c5c94d38119c483287bb33fc25d8c99a246b62d940ddcb62b33d02b9b61` (plain text)
- [ ] `BASE_URL` = `https://final-production-production.up.railway.app` (plain text)
- [ ] `DATABASE_URL` = either direct connection string OR `${{Postgres.DATABASE_URL}}` (reference is OK for this one)

## Alternative: Attach Git Repo

If you want to attach your git repo for automatic deployments:

1. In Railway dashboard, go to "final production" service
2. Go to "Settings" → "Source"
3. Connect your GitHub repository
4. Railway will auto-deploy on pushes

This might also help with variable management.









