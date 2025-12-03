/**
 * SQLite to PostgreSQL Data Migration Script
 * 
 * Exports data from existing SQLite game.db and imports into PostgreSQL.
 * Run this AFTER running PostgreSQL schema migrations.
 * 
 * Usage:
 *   node scripts/migrate-data.js
 * 
 * Requirements:
 *   - game.db must exist in project root
 *   - DATABASE_URL must be set (PostgreSQL connection string)
 *   - PostgreSQL schema migrations must already be applied
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

// SQLite database path
const SQLITE_PATH = path.join(__dirname, '..', 'game.db');

// PostgreSQL connection
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrateData() {
  console.log('Starting SQLite to PostgreSQL data migration...\n');
  
  // Check if SQLite database exists
  const fs = require('fs');
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`SQLite database not found at: ${SQLITE_PATH}`);
    console.error('Nothing to migrate. Exiting.');
    process.exit(1);
  }
  
  // Open SQLite database
  const sqliteDb = new Database(SQLITE_PATH, { readonly: true });
  console.log('Connected to SQLite database');
  
  // Get PostgreSQL client
  const pgClient = await pgPool.connect();
  console.log('Connected to PostgreSQL database\n');
  
  try {
    // Start PostgreSQL transaction
    await pgClient.query('BEGIN');
    
    // Migrate tables in order (respecting foreign keys)
    
    // 1. Maps
    console.log('Migrating maps...');
    const maps = sqliteDb.prepare('SELECT * FROM maps').all();
    for (const map of maps) {
      await pgClient.query(
        `INSERT INTO maps (id, name, width, height, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO NOTHING`,
        [map.id, map.name, map.width, map.height, map.description]
      );
    }
    console.log(`  Migrated ${maps.length} maps`);
    
    // Reset sequence to max id
    if (maps.length > 0) {
      const maxMapId = Math.max(...maps.map(m => m.id));
      await pgClient.query(`SELECT setval('maps_id_seq', $1)`, [maxMapId]);
    }
    
    // 2. Rooms
    console.log('Migrating rooms...');
    const rooms = sqliteDb.prepare('SELECT * FROM rooms').all();
    for (const room of rooms) {
      await pgClient.query(
        `INSERT INTO rooms (id, name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction, room_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (map_id, x, y) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           connected_map_id = EXCLUDED.connected_map_id,
           connected_room_x = EXCLUDED.connected_room_x,
           connected_room_y = EXCLUDED.connected_room_y,
           connection_direction = EXCLUDED.connection_direction,
           room_type = EXCLUDED.room_type`,
        [room.id, room.name, room.description, room.x, room.y, room.map_id,
         room.connected_map_id, room.connected_room_x, room.connected_room_y,
         room.connection_direction, room.room_type || 'normal']
      );
    }
    console.log(`  Migrated ${rooms.length} rooms`);
    
    // Reset sequence
    if (rooms.length > 0) {
      const maxRoomId = Math.max(...rooms.map(r => r.id));
      await pgClient.query(`SELECT setval('rooms_id_seq', $1)`, [maxRoomId]);
    }
    
    // 3. Players
    console.log('Migrating players...');
    const players = sqliteDb.prepare('SELECT * FROM players').all();
    for (const player of players) {
      await pgClient.query(
        `INSERT INTO players (id, name, current_room_id, 
          stat_brute_strength, stat_life_force, stat_cunning, stat_intelligence, stat_wisdom,
          ability_crafting, ability_lockpicking, ability_stealth, ability_dodge, ability_critical_hit,
          resource_hit_points, resource_max_hit_points, resource_mana, resource_max_mana, resource_max_encumbrance,
          flag_god_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (name) DO UPDATE SET
           current_room_id = EXCLUDED.current_room_id,
           flag_god_mode = EXCLUDED.flag_god_mode`,
        [player.id, player.name, player.current_room_id,
         player.stat_brute_strength || 10, player.stat_life_force || 10,
         player.stat_cunning || 10, player.stat_intelligence || 10, player.stat_wisdom || 10,
         player.ability_crafting || 0, player.ability_lockpicking || 0,
         player.ability_stealth || 0, player.ability_dodge || 0, player.ability_critical_hit || 0,
         player.resource_hit_points || 50, player.resource_max_hit_points || 50,
         player.resource_mana || 0, player.resource_max_mana || 0, player.resource_max_encumbrance || 100,
         player.flag_god_mode || 0]
      );
    }
    console.log(`  Migrated ${players.length} players`);
    
    // Reset sequence
    if (players.length > 0) {
      const maxPlayerId = Math.max(...players.map(p => p.id));
      await pgClient.query(`SELECT setval('players_id_seq', $1)`, [maxPlayerId]);
    }
    
    // 4. Scriptable NPCs
    console.log('Migrating scriptable_npcs...');
    const npcs = sqliteDb.prepare('SELECT * FROM scriptable_npcs').all();
    for (const npc of npcs) {
      await pgClient.query(
        `INSERT INTO scriptable_npcs (id, name, description, npc_type, base_cycle_time, difficulty,
          required_stats, required_buffs, input_items, output_items, failure_states,
          display_color, scriptable, active, harvestable_time, cooldown_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT DO NOTHING`,
        [npc.id, npc.name, npc.description, npc.npc_type, npc.base_cycle_time, npc.difficulty || 1,
         npc.required_stats, npc.required_buffs, npc.input_items, npc.output_items, npc.failure_states,
         npc.display_color || '#00ff00', npc.scriptable !== 0, npc.active !== 0,
         npc.harvestable_time || 60000, npc.cooldown_time || 120000]
      );
    }
    console.log(`  Migrated ${npcs.length} scriptable_npcs`);
    
    // Reset sequence
    if (npcs.length > 0) {
      const maxNpcId = Math.max(...npcs.map(n => n.id));
      await pgClient.query(`SELECT setval('scriptable_npcs_id_seq', $1)`, [maxNpcId]);
    }
    
    // 5. Room NPCs
    console.log('Migrating room_npcs...');
    const roomNpcs = sqliteDb.prepare('SELECT * FROM room_npcs').all();
    for (const rn of roomNpcs) {
      await pgClient.query(
        `INSERT INTO room_npcs (id, npc_id, room_id, state, last_cycle_run, active, slot, spawn_rules)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [rn.id, rn.npc_id, rn.room_id, rn.state || '{}', rn.last_cycle_run || 0,
         rn.active !== 0, rn.slot || 0, rn.spawn_rules]
      );
    }
    console.log(`  Migrated ${roomNpcs.length} room_npcs`);
    
    // Reset sequence
    if (roomNpcs.length > 0) {
      const maxRoomNpcId = Math.max(...roomNpcs.map(rn => rn.id));
      await pgClient.query(`SELECT setval('room_npcs_id_seq', $1)`, [maxRoomNpcId]);
    }
    
    // 6. Items
    console.log('Migrating items...');
    const items = sqliteDb.prepare('SELECT * FROM items').all();
    for (const item of items) {
      await pgClient.query(
        `INSERT INTO items (id, name, description, item_type, active, poofable, encumbrance, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           item_type = EXCLUDED.item_type,
           poofable = EXCLUDED.poofable,
           encumbrance = EXCLUDED.encumbrance`,
        [item.id, item.name, item.description, item.item_type || 'sundries',
         item.active !== 0, item.poofable === 1, item.encumbrance || 1, item.created_at || Date.now()]
      );
    }
    console.log(`  Migrated ${items.length} items`);
    
    // Reset sequence
    if (items.length > 0) {
      const maxItemId = Math.max(...items.map(i => i.id));
      await pgClient.query(`SELECT setval('items_id_seq', $1)`, [maxItemId]);
    }
    
    // 7. Room Items
    console.log('Migrating room_items...');
    const roomItems = sqliteDb.prepare('SELECT * FROM room_items').all();
    for (const ri of roomItems) {
      await pgClient.query(
        `INSERT INTO room_items (id, room_id, item_name, quantity, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [ri.id, ri.room_id, ri.item_name, ri.quantity || 1, ri.created_at || Date.now()]
      );
    }
    console.log(`  Migrated ${roomItems.length} room_items`);
    
    // Reset sequence
    if (roomItems.length > 0) {
      const maxRoomItemId = Math.max(...roomItems.map(ri => ri.id));
      await pgClient.query(`SELECT setval('room_items_id_seq', $1)`, [maxRoomItemId]);
    }
    
    // 8. Player Items
    console.log('Migrating player_items...');
    const playerItems = sqliteDb.prepare('SELECT * FROM player_items').all();
    for (const pi of playerItems) {
      await pgClient.query(
        `INSERT INTO player_items (id, player_id, item_name, quantity, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [pi.id, pi.player_id, pi.item_name, pi.quantity || 1, pi.created_at || Date.now()]
      );
    }
    console.log(`  Migrated ${playerItems.length} player_items`);
    
    // Reset sequence
    if (playerItems.length > 0) {
      const maxPlayerItemId = Math.max(...playerItems.map(pi => pi.id));
      await pgClient.query(`SELECT setval('player_items_id_seq', $1)`, [maxPlayerItemId]);
    }
    
    // 9. Room Type Colors
    console.log('Migrating room_type_colors...');
    const roomTypeColors = sqliteDb.prepare('SELECT * FROM room_type_colors').all();
    for (const rtc of roomTypeColors) {
      await pgClient.query(
        `INSERT INTO room_type_colors (room_type, color)
         VALUES ($1, $2)
         ON CONFLICT (room_type) DO UPDATE SET color = EXCLUDED.color`,
        [rtc.room_type, rtc.color]
      );
    }
    console.log(`  Migrated ${roomTypeColors.length} room_type_colors`);
    
    // Commit transaction
    await pgClient.query('COMMIT');
    console.log('\n✓ Data migration completed successfully!');
    
  } catch (err) {
    await pgClient.query('ROLLBACK');
    console.error('\n✗ Migration failed:', err.message);
    console.error(err.stack);
    throw err;
    
  } finally {
    sqliteDb.close();
    pgClient.release();
    await pgPool.end();
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('\nYou can now delete game.db and game.db-journal');
    process.exit(0);
  })
  .catch(err => {
    process.exit(1);
  });















