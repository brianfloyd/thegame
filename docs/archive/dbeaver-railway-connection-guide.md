# DBeaver Setup Guide: Automated Dev & Prod Connections

## Overview

This guide sets up DBeaver Community Edition to automatically connect to both your **local development** and **Railway production** databases with clear visual indicators, so you always know which database you're working with.

## Features

- ✅ **Automatic connections** on DBeaver startup
- ✅ **Clear visual indicators** (color coding, naming)
- ✅ **Persistent configuration** (saved passwords, auto-connect)
- ✅ **Easy switching** between dev and prod
- ✅ **Safety warnings** to prevent accidents

## Step 1: Get Connection Details

### Development Database (Local)

**First, create the dev database if it doesn't exist:**

```bash
npm run create-dev-db
```

This will create `thegame_dev` database. Then configure DBeaver:

Your local PostgreSQL connection:
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `thegame_dev` (or your dev database name)
- **Username**: `postgres` (or your local username)
- **Password**: (your local PostgreSQL password)

**From your .env file:**
```
DEV_DATABASE_URL=postgresql://postgres:password@localhost:5432/thegame_dev
```

**⚠️ If database doesn't exist**: Run `npm run create-dev-db` first, then run migrations with `npm run migrate`

### Production Database (Railway)

1. **Go to Railway Dashboard**: https://railway.app
2. **Navigate to**: Your Project → PostgreSQL Service
3. **Click "Connect" tab**
4. **Get External Connection String**:
   - Look for "Public Network" or "External" connection
   - Should look like: `postgresql://postgres:PASSWORD@containers-us-west-XXX.railway.app:5432/railway`

**Extract from connection string:**

Your connection string format: `postgresql://username:password@host:port/database`

**Example connection string:**
```
postgresql://postgres:SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG@shinkansen.proxy.rlwy.net:53381/railway
```

**Break it down:**
- **Username**: `postgres` (before the first `:`)
- **Password**: `SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG` (between `:` and `@`)
- **Host**: `shinkansen.proxy.rlwy.net` (between `@` and the next `:`)
- **Port**: `53381` (between host `:` and `/`)
- **Database**: `railway` (after the last `/`)

**⚠️ CRITICAL**: 
- Use the **external/public** connection, not the internal one!
- **DO NOT paste the full connection string** into any DBeaver field
- **Enter each component separately** in DBeaver's connection dialog
- DBeaver will show "Invalid JDBC URL" if you paste the full string

## Step 2: Create Development Connection

### 2.1 Create New Connection

1. **Open DBeaver**
2. **Click "New Database Connection"** (plug icon) or `File` → `New` → `Database Connection`
3. **Select "PostgreSQL"**
4. **Click "Next"**

### 2.2 Configure Development Connection

**Main Tab:**
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `thegame_dev` (or your dev database name)
- **Username**: `postgres` (or your local username)
- **Password**: (enter your local PostgreSQL password)
- ✅ **Check "Save password"**

**Connection Settings Tab:**
- **Connection name**: `🔵 DEV - Local PostgreSQL`
- ✅ **Check "Connect on startup"** (auto-connects when DBeaver opens)
- ✅ **Check "Show all databases"** (optional)

**Driver Properties Tab:**
- Leave defaults (usually works fine)

**SSL Tab:**
- **SSL Mode**: `disable` (local doesn't need SSL)

### 2.3 Test and Save

1. **Click "Test Connection"**
2. **Download driver if prompted**
3. **Wait for "Connected" message**
4. **Click "Finish"**

## Step 3: Create Production Connection

### 3.1 Create New Connection

1. **Right-click in Database Navigator** → `New` → `Database Connection`
2. **Select "PostgreSQL"**
3. **Click "Next"**

### 3.2 Configure Production Connection

**Main Tab:**
- **Host**: `shinkansen.proxy.rlwy.net` 
  - Extract from connection string: the part between `@` and `:`
- **Port**: `53381`
  - Extract from connection string: the number between the host `:` and `/`
- **Database**: `railway`
  - Extract from connection string: the part after the last `/`
- **Username**: `postgres`
  - Extract from connection string: the part before the first `:`
- **Password**: `SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG`
  - Extract from connection string: the part between `:` and `@`
- ✅ **Check "Save password"**

**⚠️ CRITICAL**: 
- **DO NOT paste the full connection string** (`postgresql://...`) into any field!
- DBeaver will show "Invalid JDBC URL" error if you do this
- Enter each component **separately** in the individual fields
- Connection string format: `postgresql://username:password@host:port/database`

**Connection Settings Tab:**
- **Connection name**: `🔴 PROD - Railway Production`
- ✅ **Check "Connect on startup"** (auto-connects when DBeaver opens)
- ⚠️ **Uncheck "Connect on startup"** if you want manual connection (safer)

**SSL Tab (CRITICAL!):**
- **SSL Mode**: `require` or `verify-full`
- Railway requires SSL for external connections

**Driver Properties Tab:**
- Leave defaults

### 3.3 Test and Save

1. **Click "Test Connection"**
2. **Wait for "Connected" message**
3. **Click "Finish"**

## Step 4: Visual Indicators (Color Coding)

### 4.1 Color Code Connections

**Development (Blue):**
1. **Right-click** `🔵 DEV - Local PostgreSQL` connection
2. **Select "Edit Connection"**
3. **Go to "Appearance" tab** (or "General" → "Appearance")
4. **Set Icon/Color**: Choose blue icon or set background color
5. **Click "OK"**

**Production (Red):**
1. **Right-click** `🔴 PROD - Railway Production` connection
2. **Select "Edit Connection"**
3. **Go to "Appearance" tab**
4. **Set Icon/Color**: Choose red icon or set background color
5. **Click "OK"**

### 4.2 Alternative: Use Connection Icons

DBeaver supports emoji/unicode in connection names:
- `🔵 DEV - Local PostgreSQL` (already using blue circle)
- `🔴 PROD - Railway Production` (already using red circle)

You can also use:
- `🟢 DEV` / `🔴 PROD`
- `[DEV] Local` / `[PROD] Railway`
- `DEV 🏠` / `PROD ☁️`

## Step 5: Auto-Connect Configuration

### 5.1 Enable Auto-Connect

For each connection:

1. **Right-click connection** → `Edit Connection`
2. **Connection Settings tab**
3. ✅ **Check "Connect on startup"**
4. **Click "OK"**

**Result**: Both databases will auto-connect when DBeaver starts!

### 5.2 Optional: Auto-Connect Only Dev

For safety, you might want to:
- ✅ Auto-connect DEV (safe, local)
- ❌ Manual connect PROD (safer, requires explicit action)

**To disable auto-connect for PROD:**
1. **Right-click** `🔴 PROD - Railway Production` → `Edit Connection`
2. **Uncheck "Connect on startup"**
3. **Click "OK"**

## Step 6: Connection Organization

### 6.1 Create Connection Folder

1. **Right-click in Database Navigator** → `New` → `Folder`
2. **Name**: `The Game Databases`
3. **Drag connections** into the folder:
   - `🔵 DEV - Local PostgreSQL`
   - `🔴 PROD - Railway Production`

### 6.2 Alternative: Use Project

1. **Right-click in Database Navigator** → `New` → `Project`
2. **Name**: `The Game`
3. **Drag connections** into project

## Step 7: Safety Features

### 7.1 Add Connection Warnings

**For Production Connection:**

1. **Right-click** `🔴 PROD - Railway Production` → `Edit Connection`
2. **Go to "Connection Settings" tab**
3. **Add description**: 
   ```
   ⚠️ PRODUCTION DATABASE ⚠️
   Real user data - be careful!
   Always use transactions for DELETE/UPDATE
   ```
4. **Click "OK"**

### 7.2 SQL Editor Warnings

Create a template for production queries:

1. **Right-click** `🔴 PROD - Railway Production` → `SQL Editor` → `New SQL Script`
2. **Add header comment**:
   ```sql
   -- ⚠️ PRODUCTION DATABASE ⚠️
   -- Real user data - be careful!
   -- Always use transactions:
   
   BEGIN;
   -- Your query here
   -- Verify results
   -- ROLLBACK;  -- Undo if wrong
   -- COMMIT;    -- Save if correct
   ```
3. **Save as template**: `File` → `Save As` → `prod-template.sql`

## Step 8: Verify Setup

### 8.1 Test Auto-Connect

1. **Close DBeaver completely**
2. **Reopen DBeaver**
3. **Check Database Navigator**:
   - ✅ `🔵 DEV - Local PostgreSQL` should show as connected (green checkmark)
   - ✅ `🔴 PROD - Railway Production` should show as connected (if auto-connect enabled)

### 8.2 Test Connections

**Development:**
1. **Expand** `🔵 DEV - Local PostgreSQL`
2. **Expand** `Schemas` → `public` → `Tables`
3. **Right-click** `accounts` → `View Data`
4. **Should show dev data**

**Production:**
1. **Expand** `🔴 PROD - Railway Production`
2. **Expand** `Schemas` → `public` → `Tables`
3. **Right-click** `accounts` → `View Data`
4. **Should show production data (real users)**

## Step 9: Quick Reference

### Connection Names

- `🔵 DEV - Local PostgreSQL` - Local development database
- `🔴 PROD - Railway Production` - Railway production database

### Quick Access

**Keyboard Shortcuts:**
- `Ctrl+Shift+D` - Database Navigator
- `Ctrl+Alt+S` - SQL Editor
- `F3` - Execute SQL

**Context Menu:**
- Right-click connection → `SQL Editor` → `New SQL Script`
- Right-click table → `View Data` or `Edit Data`

### Common Operations

**View Accounts:**
```sql
SELECT id, email, email_verified, created_at 
FROM accounts 
ORDER BY created_at DESC;
```

**Delete Account (with transaction):**
```sql
BEGIN;
DELETE FROM user_characters WHERE account_id = 123;
DELETE FROM accounts WHERE id = 123;
-- Check results, then:
COMMIT;  -- or ROLLBACK;
```

**Update Account:**
```sql
BEGIN;
UPDATE accounts 
SET email = 'newemail@example.com' 
WHERE id = 123;
-- Verify, then:
COMMIT;  -- or ROLLBACK;
```

## Step 10: Troubleshooting

### Auto-Connect Not Working

**Problem**: Connections don't auto-connect on startup

**Solution**:
1. Check "Connect on startup" is enabled for each connection
2. Verify passwords are saved (check "Save password")
3. Check DBeaver settings: `Window` → `Preferences` → `Connections` → `Auto-connect`

### Invalid JDBC URL Error

**Problem**: "Invalid JDBC URL: postgresql://..."

**Solution**: 
- **DO NOT paste the full connection string** into DBeaver
- DBeaver needs individual fields, not the full connection string
- Extract each component from the connection string:
  ```
  postgresql://username:password@host:port/database
  ```
- Enter them separately:
  - **Host**: `host` part (e.g., `shinkansen.proxy.rlwy.net`)
  - **Port**: `port` part (e.g., `53381`)
  - **Database**: `database` part (e.g., `railway`)
  - **Username**: `username` part (e.g., `postgres`)
  - **Password**: `password` part (the part after the colon in user:pass)

### Can't Connect to Railway

**Problem**: "Connection refused" or "Connection timeout"

**Solutions**:
1. **Verify external connection**: Make sure you're using the external/public connection string, NOT `postgres.railway.internal`
2. **Check SSL**: Set SSL Mode to `require` in connection settings
3. **Verify credentials**: Double-check username/password from Railway dashboard
4. **Verify host/port**: Make sure you extracted them correctly from the connection string
5. **Try Railway CLI proxy** (see Alternative Method below)

### Password Not Saved

**Problem**: DBeaver asks for password every time

**Solution**:
1. **Edit connection** → **Main tab**
2. ✅ **Check "Save password"**
3. **Enter password** and test connection
4. **Click "OK"**

### Database Does Not Exist

**Problem**: `FATAL: database "thegame_dev" does not exist`

**Solution**:
1. **Create the dev database**:
   ```bash
   npm run create-dev-db
   ```
2. **Run migrations** to set up schema:
   ```bash
   npm run migrate
   ```
3. **Then try connecting in DBeaver again**

**Alternative**: If you want to use an existing database:
1. **Check what databases exist** (connect to `postgres` database first)
2. **Update DBeaver connection** to use existing database name
3. **Or create new database** using the script above

### Password Authentication Failed

**Problem**: `FATAL: password authentication failed for user "postgres"`

**Solution**:
1. **Get the correct password from Railway**:
   - Go to Railway Dashboard → Your Project → PostgreSQL Service
   - Click "Connect" tab
   - Copy the connection string
   - Extract the password (the part between `:` and `@`)

2. **Update DBeaver connection**:
   - Right-click connection → `Edit Connection`
   - Go to "Main" tab
   - Enter the correct password in "Password" field
   - ✅ Check "Save password"
   - Click "Test Connection"

3. **Verify connection string format**:
   ```
   postgresql://postgres:PASSWORD@shinkansen.proxy.rlwy.net:53381/railway
   ```
   - Password is between `:` and `@`
   - Make sure you're copying the entire password (no spaces)

### Wrong Database Connected

**Problem**: Connected to wrong database

**Solution**:
1. **Check connection name** in Database Navigator (should show 🔵 DEV or 🔴 PROD)
2. **Check host** in connection settings:
   - DEV: `localhost`
   - PROD: `shinkansen.proxy.rlwy.net` (or your Railway host)
3. **Disconnect and reconnect** if needed

## Alternative: Railway CLI Proxy Method

If Railway doesn't provide external connection, use Railway CLI proxy:

### Setup Proxy

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Create proxy script** (`scripts/railway-db-proxy.ps1`):
   ```powershell
   # Railway Database Proxy
   # Keeps a local tunnel to Railway database
   Write-Host "Starting Railway database proxy..." -ForegroundColor Yellow
   Write-Host "Keep this window open while using DBeaver" -ForegroundColor Yellow
   railway connect postgres
   ```

4. **Run proxy**:
   ```bash
   .\scripts\railway-db-proxy.ps1
   ```

5. **Connect DBeaver to localhost**:
   - Host: `localhost`
   - Port: `5432` (or port Railway shows)
   - Database: `railway`
   - Username: `postgres`
   - Password: (from Railway)

**Note**: Keep the proxy terminal open while using DBeaver!

## Advanced: Connection Scripts

### Auto-Start Railway Proxy (Windows)

Create `scripts/start-dbeaver-with-proxy.ps1`:

```powershell
# Start Railway proxy and DBeaver
Write-Host "Starting Railway database proxy..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "railway connect postgres" -WindowStyle Minimized

Write-Host "Waiting 3 seconds for proxy to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "Starting DBeaver..." -ForegroundColor Green
Start-Process "C:\Program Files\DBeaver\dbeaver.exe"  # Adjust path if needed
```

**Usage**: Run this script to start both proxy and DBeaver automatically.

## Best Practices

### 1. Always Use Transactions in Production

```sql
BEGIN;
-- Your query
-- Verify results
ROLLBACK;  -- Undo
-- or
COMMIT;    -- Save
```

### 2. Test in Dev First

- Test queries in `🔵 DEV` first
- Verify results
- Then run in `🔴 PROD` if needed

### 3. Visual Verification

- Always check connection name before running queries
- Look for 🔵 (dev) or 🔴 (prod) indicator
- Check host in connection details if unsure

### 4. Backup Before Major Changes

- Railway keeps automatic backups
- Check Railway Dashboard → PostgreSQL → Backups
- Can restore if needed

### 5. Use Read-Only Queries First

```sql
-- Always SELECT first
SELECT * FROM accounts WHERE id = 123;

-- Then UPDATE/DELETE if correct
BEGIN;
UPDATE accounts SET email = 'new@example.com' WHERE id = 123;
COMMIT;
```

## Quick Checklist

- [ ] Dev connection created (`🔵 DEV - Local PostgreSQL`)
- [ ] Prod connection created (`🔴 PROD - Railway Production`)
- [ ] Passwords saved for both connections
- [ ] Auto-connect enabled (or manual for prod)
- [ ] Color coding/appearance set
- [ ] Connections tested and working
- [ ] Safety warnings added to prod connection
- [ ] Verified which database you're connected to

## Summary

You now have:
- ✅ **Automatic connections** on DBeaver startup
- ✅ **Clear visual indicators** (🔵 DEV / 🔴 PROD)
- ✅ **Persistent configuration** (saved passwords)
- ✅ **Easy database switching**
- ✅ **Safety features** (warnings, transactions)

**Connection Names:**
- `🔵 DEV - Local PostgreSQL` - Your local development database
- `🔴 PROD - Railway Production` - Railway production database

**Always verify** which connection you're using before running queries!

## Support

- **DBeaver Docs**: https://dbeaver.com/docs/
- **Railway Docs**: https://docs.railway.app
- **Railway Dashboard**: https://railway.app

