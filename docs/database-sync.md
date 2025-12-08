# Database Sync Guide

Safely sync game content from development to production while protecting all player data.

## Quick Reference

```bash
# Preview changes (dry-run)
npm run sync-dev-to-prod:dry-run

# Actual sync (requires confirmation)
npm run sync-dev-to-prod

# Test sync safety
npm run test-sync-safety
```

### Environment Variables

```bash
# PowerShell
$env:DEV_DATABASE_URL="postgresql://postgres:password@localhost:5432/thegame_dev"
$env:PROD_DATABASE_URL="postgresql://postgres:password@postgres.railway.internal:5432/railway"

# Optional: Include players table (for major stat/ability updates)
$env:SYNC_PLAYERS="true"  # Only set for major player updates!
```

## What Gets Synced

### Always Synced (Game Content)
- Maps (new maps, map sizes)
- Rooms (new rooms, descriptions, connections)
- NPCs (definitions, placements)
- Items (definitions, properties)
- Room Items (items that spawn in rooms)
- Merchant Configurations
- Room Type Colors
- Item Types

### Optional - Players Table (Set `SYNC_PLAYERS=true`)
When `SYNC_PLAYERS=true`:
- Stats (brute_strength, life_force, cunning, intelligence, wisdom)
- Abilities (crafting, lockpicking, stealth, dodge, critical_hit)
- Resources (hit_points, mana, encumbrance limits)
- Flags (god_mode, always_first_time)

**Preserved**: `current_room_id` (player location), `name` (player name)

**WARNING**: Syncing players updates stats/abilities and may reset progress! Only use for major baseline updates.

### NEVER Synced (Protected)
- Accounts
- Player Items (inventory)
- Player Bank
- Terminal History
- Email Verification Tokens
- Password Reset Tokens
- Warehouse Contents
- NPC Greetings (player-specific)
- Item Awards (player-specific)

## Step-by-Step Process

### Step 1: Prepare Changes
1. Make changes in dev environment
2. Test everything works
3. Commit code: `git commit -m "Add new rooms"`

### Step 2: Dry Run (Preview)
```bash
npm run sync-dev-to-prod:dry-run
```

Review output:
- Check which tables will be synced
- Verify record counts
- Ensure no protected tables listed

### Step 3: Actual Sync
```bash
npm run sync-dev-to-prod
```

You'll be prompted:
```
⚠️  WARNING: You are about to sync data to PRODUCTION database!
Type "SYNC PROD" (all caps) to confirm:
```

### Step 4: Verify
1. Check Railway logs for errors
2. Visit production site
3. Verify changes appear
4. Confirm player data intact

## Common Scenarios

### Adding New Content (Safe)
- New rooms, items, NPCs
- Room description updates
- Merchant items

Process: Add → Test → Dry-run → Sync

### Updating Player Stats (Major Updates)
```bash
$env:SYNC_PLAYERS="true"
npm run sync-dev-to-prod:dry-run  # Preview first!
npm run sync-dev-to-prod
```

- Notify users before major updates
- Player inventory/bank preserved
- Only use for baseline stat changes

### Removing Content (Careful Planning)
Before removing items/NPCs/rooms:

```sql
-- Check if players have this item
SELECT COUNT(*) FROM player_items WHERE item_name = 'ItemName';

-- Check if players are in this room
SELECT COUNT(*) FROM players WHERE current_room_id = RoomId;
```

Staged approach:
1. Add replacement content
2. Migrate players if needed
3. Remove old content

## Safety Features

1. **Environment Validation** - Prevents wrong database
2. **Confirmation Required** - Must type "SYNC PROD"
3. **Dry-run Mode** - Preview before changes
4. **Transaction-based** - Rollback on error
5. **Hardcoded Protection** - Protected tables never synced

## Troubleshooting

### Error: "PROD_DATABASE_URL environment variable is required"
Set the environment variable or add to `.env` (don't commit)

### Error: "PROD_DATABASE_URL appears to be a local database"
Get the Railway internal URL from Railway dashboard

### Error: "Table does not exist"
Run migrations first: `npm run migrate`

### Changes Don't Appear
- Clear browser cache
- Verify correct database synced
- Check Railway logs for errors

## Emergency Rollback

### Railway Backups
1. Go to Railway Dashboard → PostgreSQL Service
2. Click "Backups" tab
3. Restore from backup

### Manual Fix
```sql
-- Restore specific data
UPDATE rooms SET description = 'Old description' WHERE id = 123;
```

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/sync-dev-to-prod.js` | Main sync script |
| `scripts/test-sync-safety.js` | Test scenario |

## Safety Checklist

Before each sync:
- [ ] Dry-run completed and reviewed
- [ ] No protected tables in sync list
- [ ] Production database URL is correct
- [ ] Dev changes tested and working
- [ ] Code committed to git
- [ ] Destructive changes planned (if any)
- [ ] Player impact assessed


