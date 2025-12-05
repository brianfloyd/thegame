# Fix Vitalis Drain Migrations Guide

## Problem
Migrations 048, 049, and 050 were marked as applied but didn't actually execute, leaving the database without the required columns and configurations for the Vitalis drain system.

## Solution Options

### Option 1: Run with Railway CLI (Recommended)
If your database is hosted on Railway:

```powershell
# Make sure Railway CLI is installed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project (if not already linked)
railway link

# Run the fix script
railway run node scripts/fix-vitalis-drain-migrations.js
```

### Option 2: Run SQL Directly
If you have direct access to the PostgreSQL database:

#### Using Railway CLI:
```powershell
railway connect postgres
```
Then in the psql prompt:
```sql
\i scripts/fix-vitalis-drain-migrations.sql
```

#### Using psql directly:
```powershell
psql your-connection-string -f scripts/fix-vitalis-drain-migrations.sql
```

### Option 3: Set Up Local Environment
If you want to run locally, create/update your `.env` file:

```env
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=development
```

Then run:
```powershell
node scripts/fix-vitalis-drain-migrations.js
```

## What Gets Fixed

The script adds the following to your database:

1. **NPC Vitalis Drain Columns** (Migration 048):
   - `scriptable_npcs.hit_vitalis` - Vitalis drain amount on successful harvest
   - `scriptable_npcs.miss_vitalis` - Vitalis drain amount on failed harvest

2. **Vitalis Drain Reduction Formula** (Migration 049):
   - Adds `vitalis_drain_reduction` configuration to `harvest_formula_config`
   - Reduces drain based on fortitude + resonance stats

3. **Vitalis Drain Messages** (Migration 050):
   - `vitalis_drain_hit` - Message shown when Vitalis is drained on hit
   - `vitalis_drain_miss` - Message shown when Vitalis is drained on miss

## Verification

After running the fix, verify the changes worked:

```sql
-- Check if columns exist
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'scriptable_npcs' AND column_name IN ('hit_vitalis', 'miss_vitalis');

-- Check formula config
SELECT * FROM harvest_formula_config WHERE config_key = 'vitalis_drain_reduction';

-- Check messages
SELECT * FROM game_messages WHERE message_key IN ('vitalis_drain_hit', 'vitalis_drain_miss');
```

## Troubleshooting

### Error: "client password must be a string"
- Your DATABASE_URL environment variable is not set or is invalid
- Solution: Use Railway CLI or set up your .env file properly

### Error: "relation does not exist"
- Your database schema is not initialized
- Solution: Run migrations first: `npm run migrate` or `railway run npm run migrate`

### Error: "duplicate key value"
- The migration was already partially applied
- Solution: The script handles this automatically with `ON CONFLICT` clauses


