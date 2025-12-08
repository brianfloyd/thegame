# How to Parse Railway Connection String for DBeaver

## Your Connection String

From Railway Dashboard → PostgreSQL → Connect tab, you'll get:
```
postgresql://postgres:PASSWORD@shinkansen.proxy.rlwy.net:53381/railway
```

## Extract Each Component

**Format**: `postgresql://username:password@host:port/database`

**Visual Breakdown:**
```
postgresql://postgres:PASSWORD@shinkansen.proxy.rlwy.net:53381/railway
                ^^^^^^ ^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^ ^^^^^^^
                user   password host                          port  database
```

**Your Values:**
- **Username**: `postgres` (before the first `:`)
- **Password**: `PASSWORD` (between `:` and `@`) - **This is what you need!**
- **Host**: `shinkansen.proxy.rlwy.net` (between `@` and the next `:`)
- **Port**: `53381` (between host `:` and `/`)
- **Database**: `railway` (after the last `/`)

## Enter in DBeaver

**Main Tab:**
- **Host**: `shinkansen.proxy.rlwy.net`
- **Port**: `53381`
- **Database**: `railway`
- **Username**: `postgres`
- **Password**: `PASSWORD` (extract from connection string - the part between `:` and `@`)

**⚠️ CRITICAL**: 
- **DO NOT paste the full connection string** anywhere in DBeaver
- **Extract the password** from the connection string (between `:` and `@`)
- Enter each field **separately** in DBeaver's connection dialog
- Make sure password has **no spaces** before or after

## Password Authentication Error?

If you get "password authentication failed":

1. **Get fresh connection string** from Railway Dashboard
2. **Extract password** carefully (between `:` and `@`)
3. **Copy password exactly** - no extra characters
4. **Paste into DBeaver** password field
5. **Check "Save password"** checkbox
6. **Test connection** again

