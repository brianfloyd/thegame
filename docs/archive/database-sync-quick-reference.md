# Database Sync - Quick Reference

## Quick Commands

```bash
# Preview changes (dry-run)
npm run sync-dev-to-prod:dry-run

# Actual sync (requires confirmation)
npm run sync-dev-to-prod

# Test sync safety
npm run test-sync-safety
```

## Environment Variables

```bash
# PowerShell
$env:DEV_DATABASE_URL="postgresql://postgres:password@localhost:5432/thegame_dev"
$env:PROD_DATABASE_URL="postgresql://postgres:password@postgres.railway.internal:5432/railway"

# Optional: Include players table (for major stat/ability updates)
$env:SYNC_PLAYERS="true"  # Only set for major player updates!

# Or add to .env file (don't commit!)
```

## What Gets Synced ✅

**Always Synced:**
- Maps, Rooms, NPCs, Items
- Merchant configurations
- Room type colors
- Item types

**Optional (Set SYNC_PLAYERS=true):**
- Players table (stats, abilities, baseline settings)
- ⚠️ WARNING: Updates player stats/abilities!
- ⚠️ Users may need to restart or lose progress!
- Only for major stat/ability updates!

## What's Protected ❌

- Accounts (never synced)
- Player Items (inventory - never synced)
- Bank balances (never synced)
- Terminal history (never synced)
- Warehouse contents (never synced)
- Email/password tokens (never synced)

## Safety Features

1. ✅ Environment validation (prevents wrong database)
2. ✅ Confirmation required ("SYNC PROD")
3. ✅ Dry-run mode
4. ✅ Transaction-based (rollback on error)
5. ✅ Hardcoded protection list

## Workflow

1. Make changes in dev
2. Test in dev
3. `npm run sync-dev-to-prod:dry-run` (preview)
4. `npm run sync-dev-to-prod` (sync)
5. Verify in production

## Full Documentation

See `docs/database-sync-guide.md` for complete guide.

