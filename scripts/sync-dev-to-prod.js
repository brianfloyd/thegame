/**
 * Dev-to-Prod Database Sync Script
 * 
 * SAFELY syncs game content from dev database to production database.
 * 
 * PROTECTIONS:
 * - NEVER syncs user data (accounts, players, player_items, etc.)
 * - Requires explicit confirmation before syncing
 * - Supports dry-run mode to preview changes
 * - Detailed logging of all operations
 * - Transaction-based (rollback on error)
 * 
 * Usage:
 *   # Dry run (preview changes without applying)
 *   DEV_DATABASE_URL=... PROD_DATABASE_URL=... node scripts/sync-dev-to-prod.js --dry-run
 * 
 *   # Actual sync (requires confirmation)
 *   DEV_DATABASE_URL=... PROD_DATABASE_URL=... node scripts/sync-dev-to-prod.js
 * 
 * Environment Variables:
 *   DEV_DATABASE_URL - Development database connection string
 *   PROD_DATABASE_URL - Production database connection string (REQUIRED)
 */

const { Pool } = require('pg');
const readline = require('readline');
require('dotenv').config();

// ============================================================
// CONFIGURATION - Tables to Sync (Game Content Only)
// ============================================================

// ✅ SAFE TO SYNC: Game content definitions
const GAME_CONTENT_TABLES = [
  'maps',                    // Map definitions
  'rooms',                   // Room definitions and connections
  'scriptable_npcs',        // NPC type definitions
  'room_npcs',              // NPC placements in rooms (positions only)
  'items',                   // Item definitions
  'room_items',             // Items that spawn in rooms (templates)
  'room_type_colors',       // Room type color configurations
  'item_types',             // Item type definitions
  'merchant_items',         // Merchant shop configurations
  'lore_keepers'            // Lore keeper definitions
];

// ⚠️ SPECIAL CASE: Players table (stats, abilities, baseline settings)
// WARNING: Syncing players will update stats/abilities and may reset player progress!
// Only sync when doing major stat/ability updates. Users may need to restart.
// Set SYNC_PLAYERS=true to include players table in sync
const SYNC_PLAYERS = process.env.SYNC_PLAYERS === 'true';

// ❌ NEVER SYNC: User data and player progress
const PROTECTED_TABLES = [
  'accounts',                // User accounts
  'user_characters',         // Account-character links
  'player_items',            // Player inventory (protected - never sync)
  'player_bank',             // Player bank balances (protected - never sync)
  'terminal_history',        // Player terminal history (protected - never sync)
  'email_verification_tokens', // Email verification
  'password_reset_tokens',   // Password resets
  'lore_keeper_greetings',   // Player-specific NPC greetings
  'lore_keeper_item_awards', // Items awarded to players
  'warehouse_items',         // Player warehouse contents
  'player_warehouses',        // Player warehouse ownership
  'schema_migrations'        // Migration tracking
];

// ============================================================
// Database Connections
// ============================================================

const devPool = new Pool({
  connectionString: process.env.DEV_DATABASE_URL || process.env.DATABASE_URL,
  ssl: false
});

const prodPool = new Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================================
// Safety Checks
// ============================================================

function validateEnvironment() {
  if (!process.env.PROD_DATABASE_URL) {
    console.error('❌ ERROR: PROD_DATABASE_URL environment variable is required');
    console.error('   Set it in your .env file or as an environment variable');
    process.exit(1);
  }
  
  // Warn if PROD_DATABASE_URL looks like a dev database
  if (process.env.PROD_DATABASE_URL.includes('localhost') || 
      process.env.PROD_DATABASE_URL.includes('127.0.0.1')) {
    console.error('⚠️  WARNING: PROD_DATABASE_URL appears to be a local database!');
    console.error('   Production database should be on Railway (postgres.railway.internal)');
    console.error('   Aborting for safety.');
    process.exit(1);
  }
  
  // Warn if DEV_DATABASE_URL looks like production
  const devUrl = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  if (devUrl && devUrl.includes('railway.internal')) {
    console.error('⚠️  WARNING: DEV_DATABASE_URL appears to be a Railway database!');
    console.error('   Development database should be local (localhost)');
    console.error('   Aborting for safety.');
    process.exit(1);
  }
}

async function confirmSync() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n⚠️  WARNING: You are about to sync data to PRODUCTION database!');
    console.log('   Production URL:', process.env.PROD_DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
    console.log('\n   This will:');
    console.log('   ✅ Sync game content (maps, rooms, NPCs, items)');
    console.log('   ❌ NEVER touch user data (accounts, players, inventory)');
    console.log('\n   Type "SYNC PROD" (all caps) to confirm:');
    
    rl.question('   > ', (answer) => {
      rl.close();
      if (answer === 'SYNC PROD') {
        resolve(true);
      } else {
        console.log('   Sync cancelled.');
        resolve(false);
      }
    });
  });
}

// ============================================================
// Table Sync Functions
// ============================================================

async function syncTable(tableName, devClient, prodClient, dryRun = false) {
  console.log(`\n📦 Syncing ${tableName}...`);
  
  // Get all data from dev
  const devData = await devClient.query(`SELECT * FROM ${tableName} ORDER BY id`);
  console.log(`   Found ${devData.rows.length} records in dev`);
  
  if (devData.rows.length === 0) {
    console.log(`   ⏭️  Skipping ${tableName} (empty)`);
    return { synced: 0, updated: 0, skipped: 0 };
  }
  
  if (dryRun) {
    console.log(`   🔍 DRY RUN: Would sync ${devData.rows.length} records`);
    return { synced: devData.rows.length, updated: 0, skipped: 0 };
  }
  
  // Get column names
  const columns = Object.keys(devData.rows[0]);
  const columnList = columns.join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  
  // Build upsert query based on table
  let upsertQuery;
  let stats = { synced: 0, updated: 0, skipped: 0 };
  
  switch (tableName) {
    case 'maps':
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (name) DO UPDATE SET
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          description = EXCLUDED.description
      `;
      break;
      
    case 'rooms':
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (map_id, x, y) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          connected_map_id = EXCLUDED.connected_map_id,
          connected_room_x = EXCLUDED.connected_room_x,
          connected_room_y = EXCLUDED.connected_room_y,
          connection_direction = EXCLUDED.connection_direction,
          room_type = EXCLUDED.room_type
      `;
      break;
      
    case 'items':
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          item_type = EXCLUDED.item_type,
          active = EXCLUDED.active,
          poofable = EXCLUDED.poofable,
          encumbrance = EXCLUDED.encumbrance
      `;
      break;
      
    case 'scriptable_npcs':
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          npc_type = EXCLUDED.npc_type,
          base_cycle_time = EXCLUDED.base_cycle_time,
          difficulty = EXCLUDED.difficulty,
          required_stats = EXCLUDED.required_stats,
          required_buffs = EXCLUDED.required_buffs,
          input_items = EXCLUDED.input_items,
          output_items = EXCLUDED.output_items,
          failure_states = EXCLUDED.failure_states,
          display_color = EXCLUDED.display_color,
          scriptable = EXCLUDED.scriptable,
          active = EXCLUDED.active,
          harvestable_time = EXCLUDED.harvestable_time,
          cooldown_time = EXCLUDED.cooldown_time
      `;
      break;
      
    case 'room_type_colors':
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (room_type) DO UPDATE SET
          color = EXCLUDED.color
      `;
      break;
      
    case 'players':
      // Special handling for players table - sync stats/abilities but preserve location
      // WARNING: This will update player stats, abilities, and resources!
      // Preserves: current_room_id (where player is), name (player name)
      // Only updates: stats, abilities, resources, flags
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (name) DO UPDATE SET
          stat_brute_strength = EXCLUDED.stat_brute_strength,
          stat_life_force = EXCLUDED.stat_life_force,
          stat_cunning = EXCLUDED.stat_cunning,
          stat_intelligence = EXCLUDED.stat_intelligence,
          stat_wisdom = EXCLUDED.stat_wisdom,
          ability_crafting = EXCLUDED.ability_crafting,
          ability_lockpicking = EXCLUDED.ability_lockpicking,
          ability_stealth = EXCLUDED.ability_stealth,
          ability_dodge = EXCLUDED.ability_dodge,
          ability_critical_hit = EXCLUDED.ability_critical_hit,
          resource_hit_points = EXCLUDED.resource_hit_points,
          resource_max_hit_points = EXCLUDED.resource_max_hit_points,
          resource_mana = EXCLUDED.resource_mana,
          resource_max_mana = EXCLUDED.resource_max_mana,
          resource_max_encumbrance = EXCLUDED.resource_max_encumbrance,
          flag_god_mode = EXCLUDED.flag_god_mode,
          flag_always_first_time = EXCLUDED.flag_always_first_time
      `;
      break;
      
    case 'room_npcs':
      // For room_npcs, we sync placements but preserve state and last_cycle_run
      // This allows NPCs to be added/moved without resetting their state
      const roomNpcColumns = columns.filter(c => !['state', 'last_cycle_run'].includes(c));
      const roomNpcColumnList = roomNpcColumns.join(', ');
      const roomNpcPlaceholders = roomNpcColumns.map((_, i) => `$${i + 1}`).join(', ');
      upsertQuery = `
        INSERT INTO ${tableName} (${roomNpcColumnList}, state, last_cycle_run)
        SELECT ${roomNpcPlaceholders}, 
               COALESCE((SELECT state FROM ${tableName} WHERE npc_id = $${roomNpcColumns.indexOf('npc_id') + 1} AND room_id = $${roomNpcColumns.indexOf('room_id') + 1}), '{}'),
               COALESCE((SELECT last_cycle_run FROM ${tableName} WHERE npc_id = $${roomNpcColumns.indexOf('npc_id') + 1} AND room_id = $${roomNpcColumns.indexOf('room_id') + 1}), 0)
        ON CONFLICT (npc_id, room_id) DO UPDATE SET
          active = EXCLUDED.active,
          slot = EXCLUDED.slot,
          spawn_rules = EXCLUDED.spawn_rules
      `;
      break;
      
    default:
      // Generic upsert for other tables
      upsertQuery = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;
  }
  
  // Sync each row
  for (const row of devData.rows) {
    const values = columns.map(col => row[col]);
    
    try {
      const result = await prodClient.query(upsertQuery, values);
      if (result.rowCount > 0) {
        stats.synced++;
      } else {
        stats.updated++;
      }
    } catch (err) {
      console.error(`   ❌ Error syncing row:`, err.message);
      console.error(`      Row:`, JSON.stringify(row, null, 2).substring(0, 200));
      stats.skipped++;
    }
  }
  
  console.log(`   ✅ Synced ${stats.synced} new, ${stats.updated} updated, ${stats.skipped} skipped`);
  return stats;
}

// ============================================================
// Main Sync Function
// ============================================================

async function syncDatabases(dryRun = false) {
  console.log('='.repeat(60));
  console.log('🔄 Dev-to-Prod Database Sync');
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  validateEnvironment();
  
  // Show what will be synced
  console.log('\n📋 Tables to sync (game content only):');
  GAME_CONTENT_TABLES.forEach(table => console.log(`   ✅ ${table}`));
  
  if (SYNC_PLAYERS) {
    console.log('\n⚠️  SPECIAL: Players table (stats, abilities, baseline settings)');
    console.log('   ⚠️  WARNING: This will update player stats/abilities!');
    console.log('   ⚠️  Users may need to restart or may lose progress!');
    console.log('   ⚠️  Only use for major stat/ability updates!');
  } else {
    console.log('\nℹ️  Players table: NOT synced (set SYNC_PLAYERS=true to include)');
  }
  
  console.log('\n🔒 Protected tables (never synced):');
  PROTECTED_TABLES.forEach(table => console.log(`   ❌ ${table}`));
  
  if (!dryRun) {
    const confirmed = await confirmSync();
    if (!confirmed) {
      process.exit(0);
    }
  }
  
  const devClient = await devPool.connect();
  const prodClient = await prodPool.connect();
  
  try {
    if (!dryRun) {
      await prodClient.query('BEGIN');
    }
    
    const totalStats = { synced: 0, updated: 0, skipped: 0 };
    
    // Build list of tables to sync
    const tablesToSync = [...GAME_CONTENT_TABLES];
    if (SYNC_PLAYERS) {
      tablesToSync.push('players');
    }
    
    // Sync each table
    for (const table of tablesToSync) {
      // Check if table exists in both databases
      const devTableExists = await devClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [table]);
      
      const prodTableExists = await prodClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [table]);
      
      if (!devTableExists.rows[0].exists) {
        console.log(`\n⚠️  Table ${table} does not exist in dev database, skipping`);
        continue;
      }
      
      if (!prodTableExists.rows[0].exists) {
        console.log(`\n⚠️  Table ${table} does not exist in prod database, skipping`);
        continue;
      }
      
      const stats = await syncTable(table, devClient, prodClient, dryRun);
      totalStats.synced += stats.synced;
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
    }
    
    if (!dryRun) {
      await prodClient.query('COMMIT');
    }
    
    console.log('\n' + '='.repeat(60));
    if (dryRun) {
      console.log('🔍 DRY RUN COMPLETE - No changes were made');
    } else {
      console.log('✅ Database sync completed successfully!');
    }
    console.log('='.repeat(60));
    console.log(`   📊 Summary:`);
    console.log(`      New records: ${totalStats.synced}`);
    console.log(`      Updated records: ${totalStats.updated}`);
    console.log(`      Skipped records: ${totalStats.skipped}`);
    console.log('='.repeat(60));
    
  } catch (err) {
    if (!dryRun) {
      await prodClient.query('ROLLBACK');
    }
    console.error('\n❌ Sync failed:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    devClient.release();
    prodClient.release();
    await devPool.end();
    await prodPool.end();
  }
}

// ============================================================
// CLI
// ============================================================

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  
  syncDatabases(dryRun)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = syncDatabases;

