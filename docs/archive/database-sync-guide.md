# Database Sync Guide: Dev to Production

## Overview

This guide explains how to safely sync game content from your development database to production, while **protecting all player data**.

## ⚠️ Important Safety Rules

1. **NEVER sync user data** - Accounts, players, inventory, bank balances are NEVER touched
2. **Always dry-run first** - Preview changes before applying
3. **Backup production** - Railway auto-backups, but verify before major syncs
4. **Test in dev first** - Make sure your changes work in dev before syncing
5. **Plan destructive changes** - Removing items/NPCs that players have requires careful planning

## What Gets Synced ✅

**Game Content (Safe to Sync - Always):**
- Maps (new maps, map sizes)
- Rooms (new rooms, room descriptions, connections)
- NPCs (NPC definitions, placements in rooms)
- Items (item definitions, properties)
- Room Items (items that spawn in rooms)
- Merchant Configurations
- Room Type Colors
- Item Types

**Players Table (Optional - Major Updates Only):**
- ⚠️ **Stats** (brute_strength, life_force, cunning, intelligence, wisdom)
- ⚠️ **Abilities** (crafting, lockpicking, stealth, dodge, critical_hit)
- ⚠️ **Resources** (hit_points, mana, encumbrance limits)
- ⚠️ **Flags** (god_mode, always_first_time)
- **Preserved**: `current_room_id` (player location), `name` (player name)

**To sync players table:** Set `SYNC_PLAYERS=true` environment variable

**⚠️ WARNING:** Syncing players will update stats/abilities and may reset player progress! Only use for major stat/ability updates. Users may need to restart or may lose progress.

## What NEVER Gets Synced ❌

**User Data (Protected - Never):**
- Accounts (user accounts)
- Player Items (player inventory) - **NEVER synced**
- Player Bank (bank balances) - **NEVER synced**
- Terminal History - **NEVER synced**
- Email Verification Tokens
- Password Reset Tokens
- Warehouse Contents
- NPC Greetings (player-specific)
- Item Awards (player-specific)

## Prerequisites

1. **Separate Databases**: 
   - Dev database: Local PostgreSQL or separate Railway database
   - Prod database: Railway production database

2. **Environment Variables**:
   ```env
   # In your .env file (for local dev database)
   DEV_DATABASE_URL=postgresql://postgres:password@localhost:5432/thegame_dev
   
   # Production database (get from Railway dashboard)
   PROD_DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/railway
   
   # Optional: Include players table in sync (for major stat/ability updates)
   # WARNING: This will update player stats/abilities!
   SYNC_PLAYERS=true
   ```

3. **Railway Database URL**:
   - Go to Railway Dashboard → Your Project → PostgreSQL Service
   - Click "Connect" → Copy the "Internal" connection string
   - This is your `PROD_DATABASE_URL`

## Step-by-Step Sync Process

### Step 1: Prepare Your Changes

1. **Work in Dev**: Make all your changes in the dev environment
   - Add new rooms, items, NPCs
   - Update room descriptions
   - Configure merchants
   - Test everything works

2. **Commit Your Code**: 
   ```bash
   git add .
   git commit -m "Add new rooms and items"
   ```

### Step 2: Dry Run (Preview Changes)

**Always run dry-run first to see what will change:**

```bash
# Set environment variables (PowerShell)
$env:DEV_DATABASE_URL="postgresql://postgres:password@localhost:5432/thegame_dev"
$env:PROD_DATABASE_URL="postgresql://postgres:password@postgres.railway.internal:5432/railway"

# Optional: Include players table (for major stat/ability updates)
$env:SYNC_PLAYERS="true"  # Only set this for major player stat updates!

# Run dry-run
npm run sync-dev-to-prod:dry-run
```

**Review the output:**
- Check which tables will be synced
- Verify record counts look correct
- Ensure no protected tables are listed

### Step 3: Actual Sync

**If dry-run looks good, run the actual sync:**

```bash
npm run sync-dev-to-prod
```

**You will be prompted:**
```
⚠️  WARNING: You are about to sync data to PRODUCTION database!
   Production URL: postgresql://postgres:****@postgres.railway.internal:5432/railway

   This will:
   ✅ Sync game content (maps, rooms, NPCs, items)
   ❌ NEVER touch user data (accounts, players, inventory)

   Type "SYNC PROD" (all caps) to confirm:
   > 
```

**Type exactly:** `SYNC PROD` (all caps, no quotes)

### Step 4: Verify Sync

1. **Check Railway Logs**: Verify no errors occurred
2. **Test in Production**: 
   - Visit `https://thegame.brianfloyd.me`
   - Verify new rooms/items/NPCs appear
   - Check that player data is intact (login, inventory, etc.)

## Test Scenario: Verify Safety

Run the test scenario to verify sync safety:

```bash
npm run test-sync-safety
```

This will:
1. Add a test item to DEV
2. Add a test account to PROD
3. Prompt you to run the sync
4. Verify that:
   - ✅ Item synced from DEV to PROD
   - ✅ Account NOT synced (protected)
   - ✅ Account preserved in PROD

## Common Scenarios

### Scenario 1: Adding New Content

**Safe - No Planning Needed:**
- Adding new rooms ✅
- Adding new items ✅
- Adding new NPCs ✅
- Updating room descriptions ✅
- Adding merchant items ✅

**Process:**
1. Add in dev
2. Test in dev
3. Dry-run sync
4. Sync to prod

### Scenario 1b: Updating Player Stats/Abilities (Major Updates)

**⚠️ Special Case - Requires Planning:**
- Updating baseline stats for all players ⚠️
- Adding new abilities ⚠️
- Changing ability defaults ⚠️
- Updating resource limits ⚠️

**Process:**
1. **Plan the update:**
   - Document what stats/abilities are changing
   - Notify users that major update is coming
   - Warn users they may need to restart

2. **Update in dev:**
   - Modify player baseline stats/abilities
   - Test thoroughly in dev
   - Verify all players get updated correctly

3. **Sync with players table:**
   ```bash
   $env:SYNC_PLAYERS="true"
   npm run sync-dev-to-prod:dry-run  # Preview first!
   npm run sync-dev-to-prod
   ```

4. **Verify in production:**
   - Check that player stats updated
   - Verify players can still log in
   - Monitor for issues

**⚠️ Important Notes:**
- Player location (`current_room_id`) is preserved
- Player inventory (`player_items`) is NOT affected
- Player bank (`player_bank`) is NOT affected
- Only use for major baseline updates, not steady-state production

### Scenario 2: Modifying Existing Content

**Requires Planning:**
- Changing item properties (encumbrance, poofable) ⚠️
- Modifying NPC behavior ⚠️
- Updating room connections ⚠️

**Process:**
1. Plan impact on existing players
2. Add in dev
3. Test thoroughly
4. Dry-run sync
5. Sync to prod
6. Monitor for issues

### Scenario 3: Removing Content

**Requires Careful Planning:**
- Removing items that players own ❌
- Removing NPCs that players interact with ❌
- Removing rooms players are in ❌

**Process:**
1. **Check player usage:**
   ```sql
   -- Check if any players have this item
   SELECT COUNT(*) FROM player_items WHERE item_name = 'ItemName';
   
   -- Check if any players are in this room
   SELECT COUNT(*) FROM players WHERE current_room_id = RoomId;
   ```

2. **Plan migration:**
   - Replace items with alternatives
   - Move players to safe rooms
   - Give players notice

3. **Execute in stages:**
   - Stage 1: Add replacement content
   - Stage 2: Migrate players (if needed)
   - Stage 3: Remove old content

### Scenario 4: Schema Changes

**Schema changes are handled by migrations, not sync:**
- New columns → Add migration file
- New tables → Add migration file
- Migrations run automatically on Railway deploy

**Sync only handles DATA, not SCHEMA**

## Troubleshooting

### Error: "PROD_DATABASE_URL environment variable is required"

**Solution:** Set the environment variable:
```bash
$env:PROD_DATABASE_URL="postgresql://..."
```

Or add to `.env` file (but don't commit it!)

### Error: "PROD_DATABASE_URL appears to be a local database"

**Solution:** You're pointing to the wrong database. Get the Railway internal URL from Railway dashboard.

### Error: "Table does not exist"

**Solution:** 
- Run migrations first: `npm run migrate`
- Or the table might be new - add a migration for it

### Sync Succeeded But Changes Don't Appear

**Possible Causes:**
1. **Cache**: Clear browser cache
2. **Server Restart**: Railway might need to restart
3. **Wrong Database**: Verify you synced to the correct database
4. **Transaction Rollback**: Check Railway logs for errors

## Best Practices

1. **Sync Regularly**: Don't let dev and prod drift too far apart
2. **Document Changes**: Keep notes on what you're syncing
3. **Test After Sync**: Always verify changes in production
4. **Backup Before Major Changes**: Railway auto-backups, but verify
5. **Communicate Changes**: Let players know about major updates

## Safety Checklist

Before each sync, verify:

- [ ] Dry-run completed and reviewed
- [ ] No protected tables in sync list
- [ ] Production database URL is correct
- [ ] Dev changes tested and working
- [ ] Code committed to git
- [ ] Destructive changes planned (if any)
- [ ] Player impact assessed (if modifying existing content)

## Emergency Rollback

If something goes wrong:

1. **Railway Backups**: Railway keeps automatic backups
   - Go to Railway Dashboard → PostgreSQL Service
   - Click "Backups" tab
   - Restore from backup

2. **Manual Fix**: If you know what went wrong, fix it directly:
   ```sql
   -- Example: Restore a room description
   UPDATE rooms SET description = 'Old description' WHERE id = 123;
   ```

3. **Contact Support**: If unsure, contact Railway support

## Advanced: Selective Table Sync

To sync only specific tables, modify `GAME_CONTENT_TABLES` in `scripts/sync-dev-to-prod.js`:

```javascript
const GAME_CONTENT_TABLES = [
  'maps',        // Only sync maps
  'rooms'       // Only sync rooms
  // Comment out others
];
```

## Questions?

- Check Railway logs for errors
- Verify environment variables
- Test in dev first
- Use dry-run mode
- Run test scenario: `npm run test-sync-safety`

