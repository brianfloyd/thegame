/**
 * StateVerifier - Verifies game state and database values
 * 
 * Provides:
 * - Direct database access for verification
 * - Player stats verification
 * - Room state verification
 * - Inventory and bank access
 */

import pg from 'pg';

let pool = null;

/**
 * Initialize database connection pool
 */
export function initDatabase(connectionString) {
  if (!connectionString) {
    connectionString = process.env.DATABASE_URL;
  }
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }
  pool = new pg.Pool({ connectionString });
}

/**
 * Get database connection pool
 */
export function getPool() {
  if (!pool) {
    initDatabase();
  }
  return pool;
}

/**
 * Execute a query and return rows
 */
export async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Execute a query and return first row
 */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Verify player stats match expected values
 */
export async function verifyPlayerStats(playerId, expectedStats) {
  const player = await queryOne('SELECT * FROM players WHERE id = $1', [playerId]);
  
  if (!player) {
    return { success: false, error: 'Player not found' };
  }
  
  const mismatches = [];
  for (const [key, expected] of Object.entries(expectedStats)) {
    // Convert camelCase to snake_case for database column names
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    const actual = player[dbKey] ?? player[key];
    
    if (actual !== expected) {
      mismatches.push({ field: key, expected, actual });
    }
  }
  
  return {
    success: mismatches.length === 0,
    mismatches,
    player,
  };
}

/**
 * Verify room state (NPCs, items, etc.)
 */
export async function verifyRoomState(roomId, expected) {
  const room = await queryOne('SELECT * FROM rooms WHERE id = $1', [roomId]);
  
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  const npcs = await query(
    'SELECT rn.*, sn.name FROM room_npcs rn JOIN scriptable_npcs sn ON rn.npc_id = sn.id WHERE rn.room_id = $1',
    [roomId]
  );
  
  const items = await query('SELECT * FROM room_items WHERE room_id = $1', [roomId]);
  
  const mismatches = [];
  
  if (expected.npcCount !== undefined && npcs.length !== expected.npcCount) {
    mismatches.push({ field: 'npcCount', expected: expected.npcCount, actual: npcs.length });
  }
  
  if (expected.itemCount !== undefined && items.length !== expected.itemCount) {
    mismatches.push({ field: 'itemCount', expected: expected.itemCount, actual: items.length });
  }
  
  return {
    success: mismatches.length === 0,
    mismatches,
    room,
    npcs,
    items,
  };
}

/**
 * Get player inventory
 */
export async function getPlayerInventory(playerId) {
  return query('SELECT * FROM player_items WHERE player_id = $1', [playerId]);
}

/**
 * Get player bank balance
 */
export async function getPlayerBank(playerId) {
  return query('SELECT * FROM player_bank WHERE player_id = $1', [playerId]);
}




