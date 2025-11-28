/**
 * PostgreSQL Database Module
 * 
 * Provides async database access using pg Pool.
 * All functions are async and return Promises.
 */

const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// ============================================================
// Core Query Helpers
// ============================================================

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

async function getOne(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

async function getAll(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

// ============================================================
// Room Functions
// ============================================================

async function getRoomById(id) {
  return getOne('SELECT * FROM rooms WHERE id = $1', [id]);
}

async function getRoomByCoords(mapId, x, y) {
  return getOne('SELECT * FROM rooms WHERE map_id = $1 AND x = $2 AND y = $3', [mapId, x, y]);
}

async function getRoomsByMap(mapId) {
  return getAll('SELECT * FROM rooms WHERE map_id = $1', [mapId]);
}

async function getRoomByName(name) {
  return getOne('SELECT * FROM rooms WHERE LOWER(name) = LOWER($1)', [name]);
}

async function getAllRooms() {
  return getAll('SELECT * FROM rooms');
}

async function createRoom(name, description, x, y, mapId, roomType = 'normal') {
  const result = await query(
    'INSERT INTO rooms (name, description, x, y, map_id, room_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [name, description, x, y, mapId, roomType]
  );
  return result.rows[0].id;
}

async function updateRoom(roomId, name, description, roomType) {
  await query(
    'UPDATE rooms SET name = $1, description = $2, room_type = $3 WHERE id = $4',
    [name, description, roomType, roomId]
  );
}

async function disconnectRoom(roomId) {
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  
  // Clear connection on this room
  await query(
    'UPDATE rooms SET connected_map_id = NULL, connected_room_x = NULL, connected_room_y = NULL, connection_direction = NULL WHERE id = $1',
    [roomId]
  );
  
  // If this room has a connection, try to clear it on the other end
  if (room.connected_map_id && room.connected_room_x !== null && room.connected_room_y !== null) {
    try {
      await query(
        'UPDATE rooms SET connected_map_id = NULL, connected_room_x = NULL, connected_room_y = NULL, connection_direction = NULL WHERE map_id = $1 AND x = $2 AND y = $3',
        [room.connected_map_id, room.connected_room_x, room.connected_room_y]
      );
    } catch (err) {
      console.log(`Note: Could not disconnect target room (may be orphaned): ${err.message}`);
    }
  }
  
  return true;
}

// ============================================================
// Map Functions
// ============================================================

async function getMapByName(name) {
  return getOne('SELECT * FROM maps WHERE name = $1', [name]);
}

async function getMapById(id) {
  return getOne('SELECT * FROM maps WHERE id = $1', [id]);
}

async function getAllMaps() {
  return getAll('SELECT * FROM maps ORDER BY id');
}

async function createMap(name, width, height, description) {
  const result = await query(
    'INSERT INTO maps (name, width, height, description) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, width, height, description]
  );
  return result.rows[0].id;
}

async function getMapBounds(mapId) {
  return getOne(
    'SELECT MIN(x) as "minX", MAX(x) as "maxX", MIN(y) as "minY", MAX(y) as "maxY" FROM rooms WHERE map_id = $1',
    [mapId]
  );
}

async function updateMapSize(mapId) {
  const bounds = await getMapBounds(mapId);
  if (bounds && bounds.minX !== null) {
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    await query('UPDATE maps SET width = $1, height = $2 WHERE id = $3', [width, height, mapId]);
    return { width, height };
  }
  return null;
}

// ============================================================
// Player Functions
// ============================================================

async function getPlayerByName(name) {
  return getOne('SELECT * FROM players WHERE name = $1', [name]);
}

async function getPlayerById(id) {
  return getOne('SELECT * FROM players WHERE id = $1', [id]);
}

async function getAllPlayers() {
  return getAll('SELECT * FROM players');
}

async function getPlayersInRoom(roomId) {
  const rows = await getAll('SELECT name FROM players WHERE current_room_id = $1', [roomId]);
  return rows.map(row => row.name);
}

async function updatePlayerRoom(roomId, playerName) {
  await query('UPDATE players SET current_room_id = $1 WHERE name = $2', [roomId, playerName]);
}

async function updatePlayer(player) {
  const allowedFields = [
    'stat_brute_strength', 'stat_life_force', 'stat_cunning', 'stat_intelligence', 'stat_wisdom',
    'ability_crafting', 'ability_lockpicking', 'ability_stealth', 'ability_dodge', 'ability_critical_hit',
    'resource_hit_points', 'resource_max_hit_points', 'resource_mana', 'resource_max_mana',
    'resource_max_encumbrance', 'flag_god_mode', 'current_room_id'
  ];
  
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  for (const field of allowedFields) {
    if (player[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      values.push(player[field]);
      paramCount++;
    }
  }
  
  if (updates.length === 0) {
    return getPlayerById(player.id);
  }
  
  values.push(player.id);
  const sql = `UPDATE players SET ${updates.join(', ')} WHERE id = $${paramCount}`;
  await query(sql, values);
  
  return getPlayerById(player.id);
}

// ============================================================
// Dynamic Stats Detection (PostgreSQL version)
// ============================================================

async function detectPlayerAttributes() {
  const result = await query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'players' 
    ORDER BY ordinal_position
  `);
  
  const attributes = {
    stats: [],
    abilities: [],
    resources: [],
    flags: []
  };

  const toCamelCase = (str) => {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  };
  
  const toDisplayName = (str) => {
    const withoutPrefix = str.replace(/^(stat_|ability_|resource_|flag_)/, '');
    return withoutPrefix
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  for (const row of result.rows) {
    const colName = row.column_name;
    
    if (colName.startsWith('stat_')) {
      const baseName = colName.replace('stat_', '');
      attributes.stats.push({
        dbColumn: colName,
        displayName: toDisplayName(colName),
        camelCase: toCamelCase(baseName)
      });
    } else if (colName.startsWith('ability_')) {
      const baseName = colName.replace('ability_', '');
      attributes.abilities.push({
        dbColumn: colName,
        displayName: toDisplayName(colName),
        camelCase: toCamelCase(baseName)
      });
    } else if (colName.startsWith('resource_')) {
      const baseName = colName.replace('resource_', '');
      if (baseName.startsWith('max_')) {
        const resourceName = baseName.replace('max_', '');
        attributes.resources.push({
          dbColumn: colName,
          displayName: `Max ${toDisplayName('resource_' + resourceName)}`,
          camelCase: 'max' + toCamelCase(resourceName).charAt(0).toUpperCase() + toCamelCase(resourceName).slice(1),
          isMax: true,
          baseResource: toCamelCase(resourceName)
        });
      } else {
        attributes.resources.push({
          dbColumn: colName,
          displayName: toDisplayName(colName),
          camelCase: toCamelCase(baseName),
          isMax: false,
          maxColumn: `resource_max_${baseName}`
        });
      }
    } else if (colName.startsWith('flag_')) {
      const baseName = colName.replace('flag_', '');
      attributes.flags.push({
        dbColumn: colName,
        displayName: toDisplayName(colName),
        camelCase: toCamelCase(baseName)
      });
    }
  }

  return attributes;
}

function getPlayerStats(player) {
  if (!player) return null;
  
  // Synchronous version using cached attributes or building from player object
  const stats = {};
  
  const toCamelCase = (str) => {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  };
  
  const toDisplayName = (str) => {
    const withoutPrefix = str.replace(/^(stat_|ability_|resource_|flag_)/, '');
    return withoutPrefix
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  for (const key of Object.keys(player)) {
    if (key.startsWith('stat_')) {
      const baseName = key.replace('stat_', '');
      stats[toCamelCase(baseName)] = {
        value: player[key],
        displayName: toDisplayName(key),
        category: 'stats'
      };
    } else if (key.startsWith('ability_')) {
      const baseName = key.replace('ability_', '');
      stats[toCamelCase(baseName)] = {
        value: player[key],
        displayName: toDisplayName(key),
        category: 'abilities'
      };
    } else if (key.startsWith('resource_')) {
      const baseName = key.replace('resource_', '');
      if (!baseName.startsWith('max_')) {
        stats[toCamelCase(baseName)] = {
          value: player[key],
          displayName: toDisplayName(key),
          category: 'resources'
        };
      } else {
        const resourceName = baseName.replace('max_', '');
        stats['max' + toCamelCase(resourceName).charAt(0).toUpperCase() + toCamelCase(resourceName).slice(1)] = {
          value: player[key],
          displayName: `Max ${toDisplayName('resource_' + resourceName)}`,
          category: 'resources'
        };
      }
    } else if (key.startsWith('flag_')) {
      const baseName = key.replace('flag_', '');
      stats[toCamelCase(baseName)] = {
        value: player[key] === 1,
        displayName: toDisplayName(key),
        category: 'flags'
      };
    }
  }
  
  return stats;
}

// ============================================================
// NPC Functions
// ============================================================

async function getAllScriptableNPCs() {
  return getAll('SELECT * FROM scriptable_npcs ORDER BY id');
}

async function getScriptableNPCById(id) {
  return getOne('SELECT * FROM scriptable_npcs WHERE id = $1', [id]);
}

async function createScriptableNPC(npc) {
  const {
    name,
    description,
    npc_type,
    base_cycle_time,
    difficulty = 1,
    required_stats = null,
    required_buffs = null,
    input_items = null,
    output_items = null,
    failure_states = null,
    display_color = '#00ff00'
  } = npc;

  const result = await query(
    `INSERT INTO scriptable_npcs (name, description, npc_type, base_cycle_time, difficulty, required_stats, required_buffs, input_items, output_items, failure_states, display_color, scriptable, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, TRUE) RETURNING id`,
    [name, description || '', npc_type, base_cycle_time, difficulty, required_stats, required_buffs, input_items, output_items, failure_states, display_color]
  );

  return result.rows[0].id;
}

async function updateScriptableNPC(npc) {
  const {
    id,
    name,
    description,
    npc_type,
    base_cycle_time,
    difficulty = 1,
    required_stats = null,
    required_buffs = null,
    input_items = null,
    output_items = null,
    failure_states = null,
    display_color = '#00ff00',
    active = true
  } = npc;

  await query(
    `UPDATE scriptable_npcs SET 
      name = $1, description = $2, npc_type = $3, base_cycle_time = $4, difficulty = $5,
      required_stats = $6, required_buffs = $7, input_items = $8, output_items = $9,
      failure_states = $10, display_color = $11, active = $12
     WHERE id = $13`,
    [name, description || '', npc_type, base_cycle_time, difficulty, required_stats, required_buffs, input_items, output_items, failure_states, display_color, active, id]
  );
}

async function getNPCsInRoom(roomId) {
  const rows = await getAll(
    `SELECT rn.id, rn.npc_id, rn.state, rn.slot,
            sn.name, sn.description, sn.display_color, sn.harvestable_time, sn.cooldown_time
     FROM room_npcs rn
     JOIN scriptable_npcs sn ON rn.npc_id = sn.id
     WHERE rn.room_id = $1 AND rn.active = TRUE
     ORDER BY rn.slot`,
    [roomId]
  );
  
  return rows.map(row => ({
    id: row.id,
    npcId: row.npc_id,
    name: row.name,
    description: row.description,
    color: row.display_color || '#00ffff',
    state: row.state ? JSON.parse(row.state) : {},
    slot: row.slot,
    harvestableTime: row.harvestable_time || 60000,
    cooldownTime: row.cooldown_time || 120000
  }));
}

async function getAllActiveNPCs() {
  const rows = await getAll(
    `SELECT rn.id, rn.npc_id, rn.room_id, rn.state, rn.last_cycle_run,
            sn.npc_type, sn.base_cycle_time, sn.required_stats, 
            sn.required_buffs, sn.input_items, sn.output_items, sn.failure_states,
            sn.display_color, sn.harvestable_time, sn.cooldown_time
     FROM room_npcs rn
     JOIN scriptable_npcs sn ON rn.npc_id = sn.id
     WHERE rn.active = TRUE AND sn.active = TRUE`
  );
  
  return rows.map(row => ({
    id: row.id,
    npcId: row.npc_id,
    roomId: row.room_id,
    state: row.state ? JSON.parse(row.state) : {},
    lastCycleRun: row.last_cycle_run || 0,
    npcType: row.npc_type,
    baseCycleTime: row.base_cycle_time,
    requiredStats: row.required_stats ? JSON.parse(row.required_stats) : {},
    requiredBuffs: row.required_buffs ? JSON.parse(row.required_buffs) : [],
    inputItems: row.input_items ? JSON.parse(row.input_items) : {},
    outputItems: row.output_items ? JSON.parse(row.output_items) : {},
    failureStates: row.failure_states ? JSON.parse(row.failure_states) : [],
    color: row.display_color || '#00ffff',
    harvestableTime: row.harvestable_time || 60000,
    cooldownTime: row.cooldown_time || 120000
  }));
}

async function validateMoonlessMeadowRoom(roomId) {
  const result = await getOne(
    `SELECT r.id, r.map_id, m.name as map_name
     FROM rooms r
     JOIN maps m ON r.map_id = m.id
     WHERE r.id = $1`,
    [roomId]
  );
  
  if (!result) {
    throw new Error(`Room ${roomId} not found`);
  }
  if (result.map_name !== 'Moonless Meadow') {
    throw new Error(`Room ${roomId} is not in Moonless Meadow map. NPCs can only be placed in Moonless Meadow.`);
  }
  return true;
}

async function placeNPCInRoom(npcId, roomId, slot = 0, initialState = {}, spawnRules = null) {
  await validateMoonlessMeadowRoom(roomId);
  
  const stateJson = JSON.stringify(initialState);
  const spawnRulesJson = spawnRules ? JSON.stringify(spawnRules) : null;
  const lastCycleRun = Date.now();
  
  const result = await query(
    `INSERT INTO room_npcs (npc_id, room_id, state, last_cycle_run, active, slot, spawn_rules)
     VALUES ($1, $2, $3, $4, TRUE, $5, $6) RETURNING id`,
    [npcId, roomId, stateJson, lastCycleRun, slot, spawnRulesJson]
  );
  
  return result.rows[0].id;
}

async function getNpcPlacements(npcId) {
  return getAll(
    `SELECT rn.id, rn.npc_id, rn.room_id, rn.slot,
            r.name AS room_name, r.x, r.y,
            m.id AS map_id, m.name AS map_name
     FROM room_npcs rn
     JOIN rooms r ON rn.room_id = r.id
     JOIN maps m ON r.map_id = m.id
     WHERE rn.npc_id = $1 AND rn.active = TRUE
     ORDER BY m.name, r.name, rn.slot`,
    [npcId]
  );
}

async function deleteNpcPlacement(placementId) {
  await query('DELETE FROM room_npcs WHERE id = $1', [placementId]);
}

async function getRoomsForNpcPlacement(mapId) {
  const rows = await getAll('SELECT id, name, x, y, map_id FROM rooms WHERE map_id = $1', [mapId]);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    x: r.x,
    y: r.y,
    map_id: r.map_id
  }));
}

async function updateNPCState(roomNpcId, state, lastCycleRun) {
  const stateJson = JSON.stringify(state);
  await query('UPDATE room_npcs SET state = $1, last_cycle_run = $2 WHERE id = $3', [stateJson, lastCycleRun, roomNpcId]);
}

// ============================================================
// Items Functions
// ============================================================

async function getAllItems() {
  return getAll('SELECT * FROM items ORDER BY name');
}

async function getItemById(id) {
  return getOne('SELECT * FROM items WHERE id = $1', [id]);
}

async function getItemByName(name) {
  return getOne(
    `SELECT * FROM items WHERE LOWER(REPLACE(name, ' ', '_')) = LOWER(REPLACE($1, ' ', '_'))`,
    [name]
  );
}

async function createItem(item) {
  const result = await query(
    `INSERT INTO items (name, description, item_type, active, poofable, encumbrance, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      item.name,
      item.description || '',
      item.item_type || 'sundries',
      item.active !== undefined ? item.active : true,
      item.poofable !== undefined ? item.poofable : false,
      item.encumbrance !== undefined ? item.encumbrance : 1,
      Date.now()
    ]
  );
  return getItemById(result.rows[0].id);
}

async function updateItem(item) {
  await query(
    `UPDATE items SET name = $1, description = $2, item_type = $3, active = $4, poofable = $5, encumbrance = $6 WHERE id = $7`,
    [
      item.name,
      item.description || '',
      item.item_type || 'sundries',
      item.active !== undefined ? item.active : true,
      item.poofable !== undefined ? item.poofable : false,
      item.encumbrance !== undefined ? item.encumbrance : 1,
      item.id
    ]
  );
  return getItemById(item.id);
}

async function getItemEncumbrance(itemName) {
  const item = await getItemByName(itemName);
  return item ? (item.encumbrance || 1) : 1;
}

// ============================================================
// Room Type Colors Functions
// ============================================================

async function getRoomTypeColor(roomType) {
  const result = await getOne('SELECT color FROM room_type_colors WHERE room_type = $1', [roomType || 'normal']);
  return result ? result.color : '#00ff00';
}

async function getAllRoomTypeColors() {
  return getAll('SELECT * FROM room_type_colors ORDER BY room_type');
}

async function setRoomTypeColor(roomType, color) {
  await query(
    `INSERT INTO room_type_colors (room_type, color) VALUES ($1, $2)
     ON CONFLICT (room_type) DO UPDATE SET color = $2`,
    [roomType, color]
  );
  return getRoomTypeColor(roomType);
}

// ============================================================
// Room Items Functions (Ground Inventory)
// ============================================================

async function getRoomItems(roomId) {
  const items = await getAll(
    `SELECT item_name, SUM(quantity) as quantity
     FROM room_items
     WHERE room_id = $1
     GROUP BY item_name
     ORDER BY item_name`,
    [roomId]
  );
  
  // Normalize item names to canonical names
  const normalized = [];
  for (const item of items) {
    const itemDef = await getItemByName(item.item_name);
    const canonicalName = itemDef ? itemDef.name : item.item_name;
    normalized.push({
      item_name: canonicalName,
      quantity: parseInt(item.quantity)
    });
  }
  return normalized;
}

async function addRoomItem(roomId, itemName, quantity = 1) {
  const itemDef = await getItemByName(itemName);
  const canonicalName = itemDef ? itemDef.name : itemName;
  
  const existing = await getOne(
    `SELECT id, quantity FROM room_items WHERE room_id = $1 AND LOWER(REPLACE(item_name, '_', ' ')) = LOWER(REPLACE($2, '_', ' ')) LIMIT 1`,
    [roomId, canonicalName]
  );
  
  if (existing) {
    await query('UPDATE room_items SET quantity = quantity + $1 WHERE room_id = $2 AND item_name = $3', [quantity, roomId, canonicalName]);
  } else {
    await query('INSERT INTO room_items (room_id, item_name, quantity, created_at) VALUES ($1, $2, $3, $4)', [roomId, canonicalName, quantity, Date.now()]);
  }
}

async function removeRoomItem(roomId, itemName, quantity = 1) {
  const existing = await getOne(
    `SELECT id, quantity FROM room_items WHERE room_id = $1 AND LOWER(REPLACE(item_name, '_', ' ')) = LOWER(REPLACE($2, '_', ' ')) LIMIT 1`,
    [roomId, itemName]
  );
  
  if (!existing) return false;
  
  if (existing.quantity <= quantity) {
    await query('DELETE FROM room_items WHERE id = $1', [existing.id]);
  } else {
    await query('UPDATE room_items SET quantity = quantity - $1 WHERE id = $2', [quantity, existing.id]);
  }
  return true;
}

async function removePoofableItemsFromRoom(roomId) {
  const result = await query(
    `DELETE FROM room_items 
     WHERE room_id = $1 AND LOWER(REPLACE(item_name, '_', ' ')) IN (
       SELECT LOWER(REPLACE(name, '_', ' ')) FROM items WHERE poofable = TRUE
     )`,
    [roomId]
  );
  if (result.rowCount > 0) {
    console.log(`Removed ${result.rowCount} poofable item(s) from room ${roomId}`);
  }
  return result.rowCount;
}

// ============================================================
// Player Items Functions (Inventory)
// ============================================================

async function getPlayerItems(playerId) {
  return getAll(
    `SELECT item_name, SUM(quantity) as quantity
     FROM player_items
     WHERE player_id = $1
     GROUP BY item_name
     ORDER BY item_name`,
    [playerId]
  );
}

async function addPlayerItem(playerId, itemName, quantity = 1) {
  const existing = await getOne(
    'SELECT id, quantity FROM player_items WHERE player_id = $1 AND item_name = $2 LIMIT 1',
    [playerId, itemName]
  );
  
  if (existing) {
    await query('UPDATE player_items SET quantity = quantity + $1 WHERE player_id = $2 AND item_name = $3', [quantity, playerId, itemName]);
  } else {
    await query('INSERT INTO player_items (player_id, item_name, quantity, created_at) VALUES ($1, $2, $3, $4)', [playerId, itemName, quantity, Date.now()]);
  }
}

async function removePlayerItem(playerId, itemName, quantity = 1) {
  const existing = await getOne(
    'SELECT id, quantity FROM player_items WHERE player_id = $1 AND item_name = $2 LIMIT 1',
    [playerId, itemName]
  );
  
  if (!existing) return false;
  
  if (existing.quantity <= quantity) {
    await query('DELETE FROM player_items WHERE id = $1', [existing.id]);
  } else {
    await query('UPDATE player_items SET quantity = quantity - $1 WHERE id = $2', [quantity, existing.id]);
  }
  return true;
}

async function getPlayerCurrentEncumbrance(playerId) {
  const result = await getOne(
    `SELECT COALESCE(SUM(pi.quantity * COALESCE(i.encumbrance, 1)), 0) as total_encumbrance
     FROM player_items pi
     LEFT JOIN items i ON LOWER(REPLACE(pi.item_name, '_', ' ')) = LOWER(REPLACE(i.name, '_', ' '))
     WHERE pi.player_id = $1`,
    [playerId]
  );
  return result ? parseInt(result.total_encumbrance) : 0;
}

// ============================================================
// Connection Pool Management
// ============================================================

async function closePool() {
  await pool.end();
}

async function testConnection() {
  try {
    const result = await query('SELECT NOW()');
    console.log('PostgreSQL connected:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('PostgreSQL connection failed:', err.message);
    return false;
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  pool,
  query,
  testConnection,
  closePool,
  
  // Rooms
  getRoomById,
  getRoomByCoords,
  getRoomsByMap,
  getRoomByName,
  getAllRooms,
  createRoom,
  updateRoom,
  disconnectRoom,
  
  // Maps
  getMapByName,
  getMapById,
  getAllMaps,
  createMap,
  getMapBounds,
  updateMapSize,
  
  // Players
  getPlayerByName,
  getPlayerById,
  getAllPlayers,
  getPlayersInRoom,
  updatePlayerRoom,
  updatePlayer,
  getPlayerStats,
  detectPlayerAttributes,
  
  // NPCs
  getAllScriptableNPCs,
  getScriptableNPCById,
  createScriptableNPC,
  updateScriptableNPC,
  getNPCsInRoom,
  getAllActiveNPCs,
  validateMoonlessMeadowRoom,
  placeNPCInRoom,
  getNpcPlacements,
  deleteNpcPlacement,
  getRoomsForNpcPlacement,
  updateNPCState,
  
  // Items
  getAllItems,
  getItemById,
  getItemByName,
  createItem,
  updateItem,
  getItemEncumbrance,
  
  // Room Type Colors
  getRoomTypeColor,
  getAllRoomTypeColors,
  setRoomTypeColor,
  
  // Room Items
  getRoomItems,
  addRoomItem,
  removeRoomItem,
  removePoofableItemsFromRoom,
  
  // Player Items
  getPlayerItems,
  addPlayerItem,
  removePlayerItem,
  getPlayerCurrentEncumbrance
};
