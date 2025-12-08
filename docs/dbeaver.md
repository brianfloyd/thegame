# DBeaver Setup Guide

Connect DBeaver Community Edition to development and production databases with visual indicators.

## Connection Setup

### Development Database (Local)

**Create dev database first:**
```bash
npm run create-dev-db
```

**DBeaver Settings:**
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `thegame_dev`
- **Username**: `postgres`
- **Password**: Your local PostgreSQL password
- **SSL Mode**: `disable`
- **Connection Name**: `🔵 DEV - Local PostgreSQL`

### Production Database (Railway)

**Get connection string from Railway:**
1. Go to Railway Dashboard → Your Project → PostgreSQL Service
2. Click "Connect" tab
3. Copy "Public Network" or "External" connection string

**Parse connection string:**
```
postgresql://postgres:PASSWORD@shinkansen.proxy.rlwy.net:53381/railway
            ^^^^^^^^ ^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^ ^^^^^^^
            username password  host                         port  database
```

**Extract each component:**
- **Username**: `postgres` (before first `:`)
- **Password**: Part between `:` and `@`
- **Host**: Part between `@` and next `:`
- **Port**: Number between host `:` and `/`
- **Database**: `railway` (after last `/`)

**DBeaver Settings:**
- **Host**: (extracted from connection string)
- **Port**: (extracted from connection string)
- **Database**: `railway`
- **Username**: `postgres`
- **Password**: (extracted from connection string)
- **SSL Mode**: `require`
- **Connection Name**: `🔴 PROD - Railway Production`

**CRITICAL**: Do NOT paste the full connection string into DBeaver. Enter each field separately!

## Step-by-Step Setup

### Create Development Connection

1. Click **"New Database Connection"** (plug icon)
2. Select **"PostgreSQL"** → Click **"Next"**
3. **Main Tab**: Enter localhost settings (see above)
4. Check **"Save password"**
5. **Connection Settings Tab**:
   - Name: `🔵 DEV - Local PostgreSQL`
   - Check **"Connect on startup"**
6. **SSL Tab**: Set **SSL Mode** to `disable`
7. Click **"Test Connection"** → **"Finish"**

### Create Production Connection

1. Click **"New Database Connection"**
2. Select **"PostgreSQL"** → Click **"Next"**
3. **Main Tab**: Enter Railway settings (extracted from connection string)
4. Check **"Save password"**
5. **Connection Settings Tab**:
   - Name: `🔴 PROD - Railway Production`
   - Optional: Uncheck "Connect on startup" for safety
6. **SSL Tab**: Set **SSL Mode** to `require`
7. Click **"Test Connection"** → **"Finish"**

### Color Code Connections

1. Right-click connection → **"Edit Connection"**
2. Go to **"Appearance"** tab
3. Set color: Blue for DEV, Red for PROD
4. Click **"OK"**

## Quick Reference

### Connection Names
- `🔵 DEV - Local PostgreSQL` - Local development
- `🔴 PROD - Railway Production` - Railway production

### Common Operations

```sql
-- View accounts
SELECT id, email, email_verified, created_at 
FROM accounts ORDER BY created_at DESC;

-- Safe delete (with transaction)
BEGIN;
DELETE FROM user_characters WHERE account_id = 123;
DELETE FROM accounts WHERE id = 123;
-- Check results, then:
COMMIT;  -- or ROLLBACK;
```

### Keyboard Shortcuts
- `Ctrl+Shift+D` - Database Navigator
- `Ctrl+Alt+S` - SQL Editor
- `F3` - Execute SQL

## Troubleshooting

### "Invalid JDBC URL" Error
**Problem**: Pasted full connection string into DBeaver
**Solution**: Enter each field separately - Host, Port, Database, Username, Password

### "Password authentication failed"
**Solution**:
1. Get fresh connection string from Railway Dashboard
2. Extract password (part between `:` and `@`)
3. Paste into DBeaver password field (no extra spaces)

### "Connection refused"
**Solution**:
1. Use external/public connection string (not `postgres.railway.internal`)
2. Set SSL Mode to `require`
3. Verify host/port extracted correctly

### "Database does not exist"
**Solution**:
```bash
npm run create-dev-db
npm run migrate
```

### Auto-Connect Not Working
**Solution**:
1. Edit connection → Connection Settings tab
2. Check "Connect on startup"
3. Check "Save password"

## Railway CLI Proxy (Alternative)

If external connection doesn't work, use Railway CLI proxy:

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Start proxy (keep terminal open)
railway connect postgres
```

Then connect DBeaver to `localhost:5432` with Railway credentials.

## Best Practices

1. **Always use transactions in production**
   ```sql
   BEGIN;
   -- Your query
   ROLLBACK;  -- or COMMIT;
   ```

2. **Test in DEV first** before running queries in PROD

3. **Verify connection** - Check for 🔵 (dev) or 🔴 (prod) before queries

4. **Use read-only queries first** - SELECT before UPDATE/DELETE


