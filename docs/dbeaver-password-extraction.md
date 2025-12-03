# How to Extract Password from Railway Connection String

## Your Connection String

From Railway, you'll get something like:
```
postgresql://postgres:SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG@shinkansen.proxy.rlwy.net:53381/railway
```

## Extract the Password

**Format**: `postgresql://username:password@host:port/database`

**To extract password:**
1. Find the part between the first `:` and `@`
2. In the example above: `SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG`

**Step by step:**
```
postgresql://postgres:SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG@shinkansen.proxy.rlwy.net:53381/railway
                ^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^
                user   password (this part!)              @
```

## Enter in DBeaver

**Main Tab → Authentication:**
- **Username**: `postgres`
- **Password**: `SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG` (the extracted password)
- ✅ **Check "Save password"**

## Common Mistakes

1. **Including the colon**: Don't include `:` before the password
2. **Including the @**: Don't include `@` after the password
3. **Extra spaces**: Make sure there are no leading/trailing spaces
4. **Wrong password**: Make sure you're using the password from the **external/public** connection string, not internal

## Get Fresh Connection String

If password doesn't work:

1. **Go to Railway Dashboard**: https://railway.app
2. **Navigate to**: Your Project → PostgreSQL Service
3. **Click "Connect" tab**
4. **Copy the "Public Network" or "External" connection string**
5. **Extract password** using the method above
6. **Update DBeaver** with the new password










