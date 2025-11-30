# Railway Deployment - Summary

## What's Already Configured ✓

Your codebase is already set up for Railway deployment:

1. **Database**: Uses `DATABASE_URL` environment variable ✓
2. **Port**: Uses `process.env.PORT` (Railway auto-sets this) ✓
3. **SSL**: Database connection uses SSL in production ✓
4. **Migrations**: Run automatically on server startup ✓
5. **WebSocket**: Auto-detects HTTPS and uses `wss://` ✓
6. **Session Secret**: Uses `SESSION_SECRET` environment variable ✓
7. **Build Config**: `nixpacks.toml` already exists ✓
8. **Node Version**: `package.json` specifies `>=18.0.0` ✓

## What You Need to Do

### 1. Create Railway Account & Project
- Sign up at https://railway.app
- Create new project
- Add PostgreSQL database service
- Add application service (connect GitHub repo)

### 2. Set Environment Variables

**Critical Variables:**
```env
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Use "Reference Variable" in Railway
NODE_ENV=production
SESSION_SECRET=<generate_random_hex_string>
```

**Email Configuration:**
```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=<your_password>
BASE_URL=https://<your-railway-url>.railway.app
```

### 3. Deploy

Railway will:
- Auto-detect Node.js from `package.json`
- Run `npm install` (from `nixpacks.toml`)
- Run `npm start` (which runs `node server.js`)
- Server automatically runs migrations on startup
- Server automatically connects to PostgreSQL

### 4. Verify

Check deployment logs for:
- ✓ PostgreSQL connection success
- ✓ Migrations completed
- ✓ Server started
- ✓ NPC Cycle Engine started

## Quick Commands

**Generate SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Test locally with production-like env:**
```bash
# Set DATABASE_URL to Railway's PostgreSQL URL
export DATABASE_URL="postgresql://..."
export NODE_ENV=production
npm start
```

## Documentation Files

- **Detailed Guide**: `docs/railway-deployment-guide.md`
- **Quick Checklist**: `docs/railway-quick-start.md`
- **This Summary**: `docs/railway-deployment-summary.md`

## Important Notes

1. **Migrations**: Run automatically on every server start (see `server.js` line 278-279)
2. **Database**: Railway PostgreSQL persists data automatically
3. **HTTPS**: Railway provides HTTPS automatically, WebSocket code handles `wss://`
4. **Sessions**: Currently in-memory (fine for single instance). For multiple instances, consider Railway Redis
5. **Environment Variables**: Never commit `.env` - all secrets go in Railway Variables

## Support

- Railway Docs: https://docs.railway.app
- Check deployment logs in Railway dashboard
- Verify all environment variables are set correctly

## Next Steps After Deployment

1. Test user registration/login
2. Test character creation
3. Test game features (movement, NPCs, items, warehouse, etc.)
4. Monitor Railway logs
5. Invite testers!
6. Set up custom domain (optional)


