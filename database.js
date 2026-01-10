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

async function updateRoom(roomId, name, description, roomType, factoryTier, connectedMapId, connectedRoomX, connectedRoomY, connectionDirection) {
  await query(
    `UPDATE rooms 
     SET name = $1, 
         description = $2, 
         room_type = $3,
         factory_tier = $5,
         connected_map_id = $6,
         connected_room_x = $7,
         connected_room_y = $8,
         connection_direction = $9
     WHERE id = $4`,
    [name, description, roomType, roomId, factoryTier, connectedMapId, connectedRoomX, connectedRoomY, connectionDirection]
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

async function getPlayerWidgetConfig(playerId) {
  const player = await getPlayerById(playerId);
  if (!player) {
    return { activeWidgets: [], scriptingWidgetPosition: 'top' };
  }
  if (!player.widget_config) {
    return { activeWidgets: [], scriptingWidgetPosition: 'top' };
  }
  try {
    // Use safeJsonParse to handle JSONB columns that may already be objects
    const config = safeJsonParse(player.widget_config, { activeWidgets: [], scriptingWidgetPosition: 'top' }, 'widget_config');
    // Ensure activeWidgets is an array
    if (!Array.isArray(config.activeWidgets)) {
      config.activeWidgets = [];
    }
    return config;
  } catch (e) {
    console.error(`[getPlayerWidgetConfig] Error parsing widget_config for player ${playerId}:`, e, 'Raw value:', player.widget_config);
    return { activeWidgets: [], scriptingWidgetPosition: 'top' };
  }
}

async function updatePlayerWidgetConfig(playerId, config) {
  const configJson = JSON.stringify(config);
  console.log(`Updating widget_config for player ${playerId} to:`, configJson);
  await query(
    'UPDATE players SET widget_config = $1 WHERE id = $2',
    [configJson, playerId]
  );
  // Verify the update
  const player = await getPlayerById(playerId);
  console.log(`Verified widget_config after update:`, player.widget_config);
}

// ============================================================
// Paths and Loops Functions
// ============================================================

async function createPath(playerId, mapId, name, originRoomId, pathType, steps) {
  const createdAt = Date.now();
  
  // Create the loop/path record
  const result = await query(
    `INSERT INTO loops (player_id, map_id, name, origin_room_id, path_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [playerId, mapId, name, originRoomId, pathType, createdAt]
  );
  
  const loopId = result.rows[0].id;
  
  // Add all steps
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await query(
      `INSERT INTO loop_steps (loop_id, step_index, room_id, direction, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [loopId, i, step.roomId, step.direction, createdAt]
    );
  }
  
  return loopId;
}

async function getPathsByPlayerAndMap(playerId, mapId) {
  return getAll(
    'SELECT * FROM loops WHERE player_id = $1 AND map_id = $2 ORDER BY created_at DESC',
    [playerId, mapId]
  );
}

async function getAllPathsByPlayer(playerId) {
  return getAll(
    'SELECT * FROM loops WHERE player_id = $1 ORDER BY created_at DESC',
    [playerId]
  );
}

async function getPathById(pathId) {
  return getOne('SELECT * FROM loops WHERE id = $1', [pathId]);
}

async function getPathSteps(loopId) {
  return getAll(
    'SELECT * FROM loop_steps WHERE loop_id = $1 ORDER BY step_index',
    [loopId]
  );
}

// ============================================================
// Paths and Loops Functions
// ============================================================

async function createPath(playerId, mapId, name, originRoomId, pathType, steps) {
  const createdAt = Date.now();
  
  // Create the loop/path record
  const result = await query(
    `INSERT INTO loops (player_id, map_id, name, origin_room_id, path_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [playerId, mapId, name, originRoomId, pathType, createdAt]
  );
  
  const loopId = result.rows[0].id;
  
  // Add all steps
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await query(
      `INSERT INTO loop_steps (loop_id, step_index, room_id, direction, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [loopId, i, step.roomId, step.direction, createdAt]
    );
  }
  
  return loopId;
}

async function getPathsByPlayerAndMap(playerId, mapId) {
  return getAll(
    'SELECT * FROM loops WHERE player_id = $1 AND map_id = $2 ORDER BY created_at DESC',
    [playerId, mapId]
  );
}

async function getAllPathsByPlayer(playerId) {
  return getAll(
    'SELECT * FROM loops WHERE player_id = $1 ORDER BY created_at DESC',
    [playerId]
  );
}

async function getPathById(pathId) {
  return getOne('SELECT * FROM loops WHERE id = $1', [pathId]);
}

async function getPathSteps(loopId) {
  return getAll(
    'SELECT * FROM loop_steps WHERE loop_id = $1 ORDER BY step_index',
    [loopId]
  );
}

async function deletePath(loopId) {
  // Cascade delete will handle loop_steps
  await query('DELETE FROM loops WHERE id = $1', [loopId]);
  return true;
}

// ============================================================
// Game Messages Functions
// ============================================================

async function getGameMessage(messageKey) {
  return getOne('SELECT * FROM game_messages WHERE message_key = $1', [messageKey]);
}

async function getAllGameMessages(category = null) {
  if (category) {
    return getAll('SELECT * FROM game_messages WHERE category = $1 ORDER BY message_key', [category]);
  }
  return getAll('SELECT * FROM game_messages ORDER BY message_key');
}

async function updateGameMessage(messageKey, messageTemplate, description) {
  const updatedAt = Date.now();
  await query(
    'UPDATE game_messages SET message_template = $1, description = $2, updated_at = $3 WHERE message_key = $4',
    [messageTemplate, description, updatedAt, messageKey]
  );
}

// ============================================================
// Player Functions
// ============================================================

async function getAllPlayers() {
  return getAll('SELECT * FROM players');
}

/**
 * Create a new player based on Hebron's template
 * Copies all stats from Hebron (10/10/10/10/10 stats, 0 abilities, 50/50 HP, 10/10 Mana)
 */
async function createPlayer(name, accountId) {
  // Get town square room (starting location)
  const townSquare = await getOne(
    'SELECT id FROM rooms WHERE name = $1 AND map_id = $2',
    ['town square', 1]
  );
  
  if (!townSquare) {
    throw new Error('Starting room (town square) not found');
  }
  
  // Create player with new stats (5/5/5/5, 0 abilities)
  // Includes base attunement values: 10 points, 10000ms cooldown, 2000ms delay
  const result = await query(
    `INSERT INTO players (
      name, current_room_id,
      stat_ingenuity, stat_resonance, stat_fortitude, stat_acumen,
      ability_crafting, ability_attunement, ability_endurance, ability_commerce,
      assignable_points, flag_god_mode, flag_always_first_time, auto_navigation_time_ms,
      resource_vitalis, resource_max_vitalis,
      base_attunement_points, base_attunement_cooldown_ms, base_attunement_delay_ms
    ) VALUES ($1, $2, 5, 5, 5, 5, 0, 0, 0, 0, 5, 0, 0, 1000, 50, 100, 10, 10000, 2000)
    RETURNING id, name, current_room_id`,
    [name, townSquare.id]
  );
  
  const player = result.rows[0];
  
  // Link player to account
  if (accountId) {
    await query(
      'INSERT INTO user_characters (account_id, player_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [accountId, player.id, Date.now()]
    );
  }
  
  return player;
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
    'stat_ingenuity', 'stat_resonance', 'stat_fortitude', 'stat_acumen',
    'ability_crafting', 'ability_attunement', 'ability_endurance', 'ability_commerce',
    'resource_max_encumbrance', 'assignable_points', 'flag_god_mode', 'current_room_id',
    'auto_navigation_time_ms', 'loop_delay_ms', 'room_update_interval_ms', 'resource_vitalis', 'resource_max_vitalis', 'last_attune_time',
    'base_attunement_points', 'base_attunement_cooldown_ms', 'base_attunement_delay_ms',
    'pulse_echoes', 'pulse_echo_tier'
  ];
  
  // CRITICAL: If updating resource_vitalis, validate it doesn't exceed max
  if (player.resource_vitalis !== undefined) {
    // Get current player data to check max_vitalis
    const currentPlayer = await getPlayerById(player.id);
    if (currentPlayer) {
      const maxVitalis = player.resource_max_vitalis !== undefined 
        ? player.resource_max_vitalis 
        : (currentPlayer.resource_max_vitalis || 1000);
      
      // Cap vitalis at max (never allow exceeding max)
      if (player.resource_vitalis > maxVitalis) {
        console.warn(`[updatePlayer] Attempted to set vitalis (${player.resource_vitalis}) above max (${maxVitalis}). Capping to max.`);
        player.resource_vitalis = maxVitalis;
      }
      // Also ensure it's not negative
      if (player.resource_vitalis < 0) {
        player.resource_vitalis = 0;
      }
    }
  }
  
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

/**
 * Update player Vitalis (atomic operation)
 * @param {number} playerId - Player ID
 * @param {number} newVitalis - New vitalis value
 * @returns {Promise<object>} Updated player object
 */
async function updatePlayerVitalis(playerId, newVitalis) {
  await query(
    'UPDATE players SET resource_vitalis = $1 WHERE id = $2',
    [newVitalis, playerId]
  );
  return getPlayerById(playerId);
}

/**
 * Add pulse echoes to player and check for tier progression (atomic operation)
 * @param {number} playerId - Player ID
 * @param {number} echoesToAdd - Number of pulse echoes to add
 * @returns {Promise<object>} { player, echoesGained, oldTier, newTier, tierIncreased }
 */
async function addPulseEchoes(playerId, echoesToAdd) {
  const player = await getPlayerById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }
  
  const oldEchoes = player.pulse_echoes || 0;
  const oldTier = player.pulse_echo_tier || 1;
  const newEchoes = oldEchoes + echoesToAdd;
  
  // Update pulse echoes
  await query(
    'UPDATE players SET pulse_echoes = $1 WHERE id = $2',
    [newEchoes, playerId]
  );
  
  // Return updated player and tier info (tier calculation happens in harvestFormulas.js)
  const updatedPlayer = await getPlayerById(playerId);
  return {
    player: updatedPlayer,
    echoesGained: echoesToAdd,
    oldTier,
    newTier: updatedPlayer.pulse_echo_tier || 1,
    tierIncreased: (updatedPlayer.pulse_echo_tier || 1) > oldTier
  };
}

/**
 * Update player's pulse echo tier (atomic operation)
 * @param {number} playerId - Player ID
 * @param {number} newTier - New tier value
 * @returns {Promise<object>} Updated player object
 */
async function updatePulseEchoTier(playerId, newTier) {
  await query(
    'UPDATE players SET pulse_echo_tier = $1 WHERE id = $2',
    [newTier, playerId]
  );
  return getPlayerById(playerId);
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

  // Add assignable_points if it exists (handle null as 0)
  if (player.assignable_points !== undefined && player.assignable_points !== null) {
    stats.assignablePoints = {
      value: Number(player.assignable_points) || 0,
      displayName: 'Assignable Points',
      category: 'special'
    };
  } else {
    // Default to 0 if not set
    stats.assignablePoints = {
      value: 0,
      displayName: 'Assignable Points',
      category: 'special'
    };
  }
  
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
  
  // Add base attunement values (non-prefixed fields)
  if (player.base_attunement_points !== undefined) {
    stats.baseAttunementPoints = {
      value: player.base_attunement_points,
      displayName: 'Base Attunement Points',
      category: 'attunement'
    };
  }
  if (player.base_attunement_cooldown_ms !== undefined) {
    stats.baseAttunementCooldownMs = {
      value: player.base_attunement_cooldown_ms,
      displayName: 'Base Attunement Cooldown (ms)',
      category: 'attunement'
    };
  }
  if (player.base_attunement_delay_ms !== undefined) {
    stats.baseAttunementDelayMs = {
      value: player.base_attunement_delay_ms,
      displayName: 'Base Attunement Delay (ms)',
      category: 'attunement'
    };
  }
  
  // Add pulse echo stats (non-prefixed fields)
  if (player.pulse_echoes !== undefined) {
    stats.pulseEchoes = {
      value: player.pulse_echoes,
      displayName: 'Pulse Echoes',
      category: 'progression'
    };
  }
  if (player.pulse_echo_tier !== undefined) {
    stats.pulseEchoTier = {
      value: player.pulse_echo_tier,
      displayName: 'Pulse Echo Tier',
      category: 'progression'
    };
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
    harvestable_time = 60000,
    cooldown_time = 120000,
    required_stats = null,
    required_buffs = null,
    input_items = null,
    output_items = null,
    failure_states = null,
    display_color = '#00ff00',
    puzzle_type = 'none',
    puzzle_glow_clues = null,
    puzzle_extraction_pattern = null,
    puzzle_solution_word = null,
    puzzle_success_response = null,
    puzzle_failure_response = null,
    puzzle_reward_item = null,
    puzzle_hint_responses = null,
    puzzle_followup_responses = null,
    puzzle_incorrect_attempt_responses = null,
    puzzle_award_once_only = false,
    puzzle_award_after_delay = false,
    puzzle_award_delay_seconds = null,
    puzzle_award_delay_response = null,
    harvest_prerequisite_items = null,
    harvest_prerequisite_message = null,
    enable_resonance_bonuses = true,
    enable_fortitude_bonuses = true,
    hit_vitalis = 0,
    miss_vitalis = 0,
    pulse_echo_yield = 1
  } = npc;

  const status_message_idle = npc.status_message_idle || '(idle)';
  const status_message_ready = npc.status_message_ready || '(ready)';
  const status_message_harvesting = npc.status_message_harvesting || '(harvesting)';
  const status_message_cooldown = npc.status_message_cooldown || '(cooldown)';

  const result = await query(
    `INSERT INTO scriptable_npcs (name, description, npc_type, base_cycle_time, difficulty, harvestable_time, cooldown_time, required_stats, required_buffs, input_items, output_items, output_distribution, failure_states, display_color, puzzle_type, puzzle_glow_clues, puzzle_extraction_pattern, puzzle_solution_word, puzzle_success_response, puzzle_failure_response, puzzle_reward_item, puzzle_hint_responses, puzzle_followup_responses, puzzle_incorrect_attempt_responses, puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response, harvest_prerequisite_item, harvest_prerequisite_message, enable_resonance_bonuses, enable_fortitude_bonuses, status_message_idle, status_message_ready, status_message_harvesting, status_message_cooldown, hit_vitalis, miss_vitalis, pulse_echo_yield, scriptable, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, TRUE, TRUE) RETURNING id`,
    [name, description || '', npc_type, base_cycle_time, difficulty, harvestable_time, cooldown_time, required_stats, required_buffs, input_items, output_items, output_distribution, failure_states, display_color, puzzle_type, puzzle_glow_clues, puzzle_extraction_pattern, puzzle_solution_word, puzzle_success_response, puzzle_failure_response, puzzle_reward_item, puzzle_hint_responses, puzzle_followup_responses, puzzle_incorrect_attempt_responses, puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response, harvest_prerequisite_items ? JSON.stringify(harvest_prerequisite_items) : null, harvest_prerequisite_message, enable_resonance_bonuses, enable_fortitude_bonuses, status_message_idle, status_message_ready, status_message_harvesting, status_message_cooldown, hit_vitalis, miss_vitalis, pulse_echo_yield]
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
    harvestable_time = 60000,
    cooldown_time = 120000,
    required_stats = null,
    required_buffs = null,
    input_items = null,
    output_items = null,
    output_distribution = 'ground',
    failure_states = null,
    display_color = '#00ff00',
    active = true,
    puzzle_type = 'none',
    puzzle_glow_clues = null,
    puzzle_extraction_pattern = null,
    puzzle_solution_word = null,
    puzzle_success_response = null,
    puzzle_failure_response = null,
    puzzle_reward_item = null,
    puzzle_hint_responses = null,
    puzzle_followup_responses = null,
    puzzle_incorrect_attempt_responses = null,
    puzzle_award_once_only = false,
    puzzle_award_after_delay = false,
    puzzle_award_delay_seconds = null,
    puzzle_award_delay_response = null,
    enable_resonance_bonuses = true,
    enable_fortitude_bonuses = true,
    status_message_idle = '(idle)',
    status_message_ready = '(ready)',
    status_message_harvesting = '(harvesting)',
    status_message_cooldown = '(cooldown)',
    hit_vitalis = 0,
    miss_vitalis = 0,
    pulse_echo_yield = 1
  } = npc;

  await query(
    `UPDATE scriptable_npcs SET
      name = $1, description = $2, npc_type = $3, base_cycle_time = $4, difficulty = $5, harvestable_time = $6, cooldown_time = $7,
      required_stats = $8, required_buffs = $9, input_items = $10, output_items = $11, output_distribution = $12,
      failure_states = $13, display_color = $14, active = $15,
      puzzle_type = $16, puzzle_glow_clues = $17, puzzle_extraction_pattern = $18,
      puzzle_solution_word = $19, puzzle_success_response = $20, puzzle_failure_response = $21,
      puzzle_reward_item = $22, puzzle_hint_responses = $23, puzzle_followup_responses = $24,
      puzzle_incorrect_attempt_responses = $25, puzzle_award_once_only = $26, puzzle_award_after_delay = $27,
      puzzle_award_delay_seconds = $28, puzzle_award_delay_response = $29,
      harvest_prerequisite_item = COALESCE($30, harvest_prerequisite_item), harvest_prerequisite_message = COALESCE($31, harvest_prerequisite_message),
      enable_resonance_bonuses = $32, enable_fortitude_bonuses = $33,
      status_message_idle = $34, status_message_ready = $35, status_message_harvesting = $36, status_message_cooldown = $37,
      hit_vitalis = $38, miss_vitalis = $39, pulse_echo_yield = $40
     WHERE id = $41`,
    [name, description || '', npc_type, base_cycle_time, difficulty, harvestable_time, cooldown_time, required_stats, required_buffs, input_items, output_items, output_distribution, failure_states, display_color, active, puzzle_type, puzzle_glow_clues, puzzle_extraction_pattern, puzzle_solution_word, puzzle_success_response, puzzle_failure_response, puzzle_reward_item, puzzle_hint_responses, puzzle_followup_responses, puzzle_incorrect_attempt_responses, puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response, npc.harvest_prerequisite_items ? JSON.stringify(npc.harvest_prerequisite_items) : (npc.harvest_prerequisite_item || null), npc.harvest_prerequisite_message || null, enable_resonance_bonuses, enable_fortitude_bonuses, status_message_idle, status_message_ready, status_message_harvesting, status_message_cooldown, hit_vitalis, miss_vitalis, pulse_echo_yield, id]
  );
}

async function getNPCsInRoom(roomId) {
  const rows = await getAll(
    `SELECT rn.id, rn.npc_id, rn.state, rn.slot,
            sn.name, sn.description, sn.display_color, sn.base_cycle_time, sn.harvestable_time, sn.cooldown_time,
            sn.enable_resonance_bonuses, sn.enable_fortitude_bonuses,
            sn.puzzle_type, sn.puzzle_glow_clues, sn.puzzle_extraction_pattern,
            sn.puzzle_solution_word, sn.puzzle_success_response, sn.puzzle_failure_response,
            sn.puzzle_reward_item, sn.puzzle_hint_responses, sn.puzzle_followup_responses,
            sn.puzzle_incorrect_attempt_responses, sn.puzzle_award_once_only, sn.puzzle_award_after_delay,
            sn.puzzle_award_delay_seconds, sn.puzzle_award_delay_response,
            sn.status_message_idle, sn.status_message_ready, sn.status_message_harvesting, sn.status_message_cooldown,
            sn.output_distribution
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
    state: safeJsonParse(row.state, {}, `state (NPC ${row.npc_id}, Room ${roomId})`),
    slot: row.slot,
    base_cycle_time: row.base_cycle_time || 12000,
    harvestableTime: row.harvestable_time || 60000,
    cooldownTime: row.cooldown_time || 120000,
    enable_resonance_bonuses: row.enable_resonance_bonuses !== false,
    enable_fortitude_bonuses: row.enable_fortitude_bonuses !== false,
    puzzleType: row.puzzle_type || 'none',
    puzzleGlowClues: safeJsonParse(row.puzzle_glow_clues, null, `puzzle_glow_clues (NPC ${row.npc_id})`),
    puzzleExtractionPattern: safeJsonParse(row.puzzle_extraction_pattern, null, `puzzle_extraction_pattern (NPC ${row.npc_id})`),
    puzzleSolutionWord: row.puzzle_solution_word,
    puzzleSuccessResponse: row.puzzle_success_response,
    puzzleFailureResponse: row.puzzle_failure_response,
    puzzleRewardItem: row.puzzle_reward_item,
    puzzleHintResponses: safeJsonParse(row.puzzle_hint_responses, null, `puzzle_hint_responses (NPC ${row.npc_id})`),
    puzzleFollowupResponses: safeJsonParse(row.puzzle_followup_responses, null, `puzzle_followup_responses (NPC ${row.npc_id})`),
    puzzleIncorrectAttemptResponses: safeJsonParse(row.puzzle_incorrect_attempt_responses, null, `puzzle_incorrect_attempt_responses (NPC ${row.npc_id})`),
    puzzleAwardOnceOnly: row.puzzle_award_once_only || false,
    puzzleAwardAfterDelay: row.puzzle_award_after_delay || false,
    puzzleAwardDelaySeconds: row.puzzle_award_delay_seconds,
    puzzleAwardDelayResponse: row.puzzle_award_delay_response,
    statusMessageIdle: row.status_message_idle ?? '(idle)',
    statusMessageReady: row.status_message_ready ?? '(ready)',
    statusMessageHarvesting: row.status_message_harvesting ?? '(harvesting)',
    statusMessageCooldown: row.status_message_cooldown ?? '(cooldown)',
    outputDistribution: row.output_distribution || 'ground'
  }));
}

// Helper function to safely parse JSON with error handling
function safeJsonParse(jsonString, defaultValue, fieldName) {
  // Handle null, undefined, or empty values
  if (!jsonString) {
    return defaultValue;
  }
  
  // If already an object/array, return as-is (PostgreSQL JSONB returns objects directly)
  if (typeof jsonString === 'object' && jsonString !== null) {
    return jsonString;
  }
  
  // If it's a string, check if it's empty after trimming
  if (typeof jsonString === 'string') {
    if (jsonString.trim() === '') {
      return defaultValue;
    }
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`Error parsing JSON for field '${fieldName}':`, error.message);
      console.error(`Invalid JSON string:`, jsonString);
      console.error(`NPC ID:`, fieldName.includes('state') ? 'see row details' : 'N/A');
      return defaultValue;
    }
  }
  
  // For any other type, return default
  return defaultValue;
}

async function getAllActiveNPCs() {
  const rows = await getAll(
    `SELECT rn.id, rn.npc_id, rn.room_id, rn.state, rn.last_cycle_run,
            sn.npc_type, sn.base_cycle_time, sn.required_stats,
            sn.required_buffs, sn.input_items, sn.output_items, sn.output_distribution, sn.failure_states,
            sn.display_color, sn.harvestable_time, sn.cooldown_time,
            sn.enable_resonance_bonuses, sn.enable_fortitude_bonuses,
            sn.hit_vitalis, sn.miss_vitalis, sn.pulse_echo_yield
     FROM room_npcs rn
     JOIN scriptable_npcs sn ON rn.npc_id = sn.id
     WHERE rn.active = TRUE AND sn.active = TRUE`
  );
  
  return rows.map(row => {
    try {
      return {
        id: row.id,
        npcId: row.npc_id,
        roomId: row.room_id,
        state: safeJsonParse(row.state, {}, `state (NPC ${row.npc_id}, Room ${row.room_id})`),
        lastCycleRun: row.last_cycle_run || 0,
        npcType: row.npc_type,
        baseCycleTime: row.base_cycle_time,
        requiredStats: safeJsonParse(row.required_stats, {}, `required_stats (NPC ${row.npc_id})`),
        requiredBuffs: safeJsonParse(row.required_buffs, [], `required_buffs (NPC ${row.npc_id})`),
        inputItems: safeJsonParse(row.input_items, {}, `input_items (NPC ${row.npc_id})`),
        outputItems: safeJsonParse(row.output_items, {}, `output_items (NPC ${row.npc_id})`),
        outputDistribution: row.output_distribution || 'ground',
        failureStates: safeJsonParse(row.failure_states, [], `failure_states (NPC ${row.npc_id})`),
        color: row.display_color || '#00ffff',
        harvestableTime: row.harvestable_time || 60000, // Default 60 seconds if not set
        harvestableTime: row.harvestable_time || 60000,
        cooldownTime: row.cooldown_time || 120000,
        enableResonanceBonuses: row.enable_resonance_bonuses !== false, // Default to true
        enableFortitudeBonuses: row.enable_fortitude_bonuses !== false, // Default to true
        hitVitalis: row.hit_vitalis || 0,
        missVitalis: row.miss_vitalis || 0,
        pulseEchoYield: row.pulse_echo_yield || 1
      };
    } catch (error) {
      console.error(`Error processing NPC row (ID: ${row.id}, NPC: ${row.npc_id}, Room: ${row.room_id}):`, error);
      // Return a minimal valid object to prevent complete failure
      return {
        id: row.id,
        npcId: row.npc_id,
        roomId: row.room_id,
        state: {},
        lastCycleRun: row.last_cycle_run || 0,
        npcType: row.npc_type,
        baseCycleTime: row.base_cycle_time,
        requiredStats: {},
        requiredBuffs: [],
        inputItems: {},
        outputItems: {},
        outputDistribution: row.output_distribution || 'ground',
        failureStates: [],
        color: row.display_color || '#00ffff',
        harvestableTime: row.harvestable_time || 60000,
        cooldownTime: row.cooldown_time || 120000
      };
    }
  });
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
  // Note: Moonless Meadow restriction removed - NPCs can now be placed in any map
  
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

// ============================================================================
// Lore Keeper Functions
// ============================================================================

/**
 * Get Lore Keeper config by NPC ID
 */
async function getLoreKeeperByNpcId(npcId) {
  return getOne('SELECT * FROM lore_keepers WHERE npc_id = $1', [npcId]);
}

/**
 * Get all Lore Keepers in a room (with NPC data)
 */
async function getLoreKeepersInRoom(roomId) {
  const rows = await getAll(
    `SELECT lk.*, sn.name, sn.description, sn.display_color
     FROM lore_keepers lk
     JOIN scriptable_npcs sn ON lk.npc_id = sn.id
     JOIN room_npcs rn ON rn.npc_id = sn.id
     WHERE rn.room_id = $1 AND rn.active = TRUE AND sn.active = TRUE`,
    [roomId]
  );
  
  return rows.map(row => ({
    id: row.id,
    npcId: row.npc_id,
    name: row.name,
    description: row.description,
    displayColor: row.display_color || '#00ffff',
    loreType: row.lore_type,
    engagementEnabled: row.engagement_enabled,
    engagementDelay: row.engagement_delay,
    initialMessage: row.initial_message,
    initialMessageColor: row.initial_message_color,
    keywordsResponses: safeJsonParse(row.keywords_responses, {}, `keywords_responses (Lore Keeper ${row.npc_id})`),
    keywordColor: row.keyword_color,
    incorrectResponse: row.incorrect_response,
    puzzleMode: row.puzzle_mode,
    puzzleClues: safeJsonParse(row.puzzle_clues, [], `puzzle_clues (Lore Keeper ${row.npc_id})`),
    puzzleSolution: row.puzzle_solution,
    puzzleSuccessMessage: row.puzzle_success_message,
    puzzleFailureMessage: row.puzzle_failure_message,
    puzzleRewardItem: row.puzzle_reward_item,
    puzzleAwardOnceOnly: row.puzzle_award_once_only || false,
    puzzleAwardAfterDelay: row.puzzle_award_after_delay || false,
    puzzleAwardDelaySeconds: row.puzzle_award_delay_seconds,
    puzzleAwardDelayResponse: row.puzzle_award_delay_response
  }));
}

/**
 * Get Merchant config by NPC ID
 */
async function getMerchantByNpcId(npcId) {
  return getOne('SELECT * FROM merchants WHERE npc_id = $1', [npcId]);
}

/**
 * Create a new Lore Keeper config
 */
async function createLoreKeeper(config) {
  const {
    npc_id,
    lore_type,
    engagement_enabled = true,
    engagement_delay = 3000,
    initial_message = null,
    initial_message_color = '#00ffff',
    keywords_responses = null,
    keyword_color = '#ff00ff',
    incorrect_response = 'I do not understand what you mean.',
    puzzle_mode = null,
    puzzle_clues = null,
    puzzle_solution = null,
    puzzle_success_message = null,
    puzzle_failure_message = 'That is not the answer I seek.',
    puzzle_reward_item = null,
    puzzle_award_once_only = false,
    puzzle_award_after_delay = false,
    puzzle_award_delay_seconds = null,
    puzzle_award_delay_response = null
  } = config;

  const result = await query(
    `INSERT INTO lore_keepers (
      npc_id, lore_type, engagement_enabled, engagement_delay,
      initial_message, initial_message_color,
      keywords_responses, keyword_color, incorrect_response,
      puzzle_mode, puzzle_clues, puzzle_solution, puzzle_success_message, puzzle_failure_message, puzzle_reward_item,
      puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING id`,
    [
      npc_id, lore_type, engagement_enabled, engagement_delay,
      initial_message, initial_message_color,
      keywords_responses, keyword_color, incorrect_response,
      puzzle_mode, puzzle_clues, puzzle_solution, puzzle_success_message, puzzle_failure_message, puzzle_reward_item,
      puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response
    ]
  );

  return result.rows[0].id;
}

/**
 * Update an existing Lore Keeper config
 */
async function updateLoreKeeper(config) {
  const {
    npc_id,
    lore_type,
    engagement_enabled = true,
    engagement_delay = 3000,
    initial_message = null,
    initial_message_color = '#00ffff',
    keywords_responses = null,
    keyword_color = '#ff00ff',
    incorrect_response = 'I do not understand what you mean.',
    puzzle_mode = null,
    puzzle_clues = null,
    puzzle_solution = null,
    puzzle_success_message = null,
    puzzle_failure_message = 'That is not the answer I seek.',
    puzzle_reward_item = null,
    puzzle_award_once_only = false,
    puzzle_award_after_delay = false,
    puzzle_award_delay_seconds = null,
    puzzle_award_delay_response = null
  } = config;

  await query(
    `UPDATE lore_keepers SET
      lore_type = $1, engagement_enabled = $2, engagement_delay = $3,
      initial_message = $4, initial_message_color = $5,
      keywords_responses = $6, keyword_color = $7, incorrect_response = $8,
      puzzle_mode = $9, puzzle_clues = $10, puzzle_solution = $11, 
      puzzle_success_message = $12, puzzle_failure_message = $13, puzzle_reward_item = $14,
      puzzle_award_once_only = $15, puzzle_award_after_delay = $16, puzzle_award_delay_seconds = $17, puzzle_award_delay_response = $18,
      updated_at = NOW()
    WHERE npc_id = $19`,
    [
      lore_type, engagement_enabled, engagement_delay,
      initial_message, initial_message_color,
      keywords_responses, keyword_color, incorrect_response,
      puzzle_mode, puzzle_clues, puzzle_solution, puzzle_success_message, puzzle_failure_message, puzzle_reward_item,
      puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response,
      npc_id
    ]
  );
}

/**
 * Delete Lore Keeper config by NPC ID
 */
async function deleteLoreKeeperByNpcId(npcId) {
  await query('DELETE FROM lore_keepers WHERE npc_id = $1', [npcId]);
}

/**
 * Check if a player has been awarded a specific item by a specific Lore Keeper
 */
async function hasPlayerBeenAwardedItemByLoreKeeper(playerId, npcId, itemName) {
  const result = await getOne(
    'SELECT id FROM lore_keeper_item_awards WHERE player_id = $1 AND npc_id = $2 AND item_name = $3',
    [playerId, npcId, itemName]
  );
  return result !== null;
}

/**
 * Record that a player has been awarded an item by a Lore Keeper
 */
async function recordLoreKeeperItemAward(playerId, npcId, itemName) {
  try {
    await query(
      'INSERT INTO lore_keeper_item_awards (player_id, npc_id, item_name, awarded_at) VALUES ($1, $2, $3, NOW())',
      [playerId, npcId, itemName]
    );
  } catch (err) {
    // If unique constraint violation, player already received this item - that's okay
    if (err.code !== '23505') { // PostgreSQL unique violation error code
      throw err;
    }
  }
}

/**
 * Get the last time a player was awarded an item by a Lore Keeper
 * Returns null if never awarded, or the timestamp if awarded
 */
async function getLastLoreKeeperItemAwardTime(playerId, npcId, itemName) {
  const result = await getOne(
    'SELECT awarded_at FROM lore_keeper_item_awards WHERE player_id = $1 AND npc_id = $2 AND item_name = $3 ORDER BY awarded_at DESC LIMIT 1',
    [playerId, npcId, itemName]
  );
  return result ? result.awarded_at : null;
}

/**
 * Check if a player has been greeted by a Lore Keeper
 */
async function hasPlayerBeenGreetedByLoreKeeper(playerId, npcId) {
  const result = await getOne(
    'SELECT id FROM lore_keeper_greetings WHERE player_id = $1 AND npc_id = $2',
    [playerId, npcId]
  );
  return result !== null;
}

/**
 * Mark a player as having been greeted by a Lore Keeper
 */
async function markPlayerGreetedByLoreKeeper(playerId, npcId) {
  // Check if player has flag_always_first_time - if so, never mark as greeted
  const player = await getPlayerById(playerId);
  if (player && player.flag_always_first_time === 1) {
    // Player is "noob" - always treat as first time, don't mark as greeted
    return;
  }
  
  await query(
    `INSERT INTO lore_keeper_greetings (player_id, npc_id, first_greeted_at, last_greeted_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (player_id, npc_id) 
     DO UPDATE SET last_greeted_at = NOW()`,
    [playerId, npcId]
  );
}

/**
 * Get all Lore Keepers that have greeted a player
 */
async function getGreetedLoreKeepersForPlayer(playerId) {
  // Check if player has flag_always_first_time - if so, always return empty (never greeted)
  const player = await getPlayerById(playerId);
  if (player && player.flag_always_first_time === 1) {
    // Player is "noob" - always treat as first time, never show as greeted
    return [];
  }
  
  const rows = await getAll(
    'SELECT npc_id FROM lore_keeper_greetings WHERE player_id = $1',
    [playerId]
  );
  return rows.map(row => row.npc_id);
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
    `INSERT INTO items (name, description, item_type, active, poofable, encumbrance, 
     deed_warehouse_location_key, deed_base_max_item_types, deed_max_total_items, deed_automation_enabled, 
     rune_color, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      item.name,
      item.description || '',
      item.item_type || 'ingredient',
      item.active !== undefined ? item.active : true,
      item.poofable !== undefined ? item.poofable : false,
      item.encumbrance !== undefined ? item.encumbrance : 1,
      item.deed_warehouse_location_key || null,
      item.deed_base_max_item_types || (item.item_type === 'deed' ? 1 : null),
      item.deed_max_total_items || (item.item_type === 'deed' ? 100 : null),
      item.deed_automation_enabled || false,
      item.rune_color || (item.item_type === 'rune' ? '#0000FF' : null),
      Date.now()
    ]
  );
  return getItemById(result.rows[0].id);
}

async function updateItem(item) {
  await query(
    `UPDATE items SET name = $1, description = $2, item_type = $3, active = $4, poofable = $5, encumbrance = $6,
     deed_warehouse_location_key = $8, deed_base_max_item_types = $9, deed_max_total_items = $10, deed_automation_enabled = $11,
     rune_color = $12
     WHERE id = $7`,
    [
      item.name,
      item.description || '',
      item.item_type || 'ingredient',
      item.active !== undefined ? item.active : true,
      item.poofable !== undefined ? item.poofable : false,
      item.encumbrance !== undefined ? item.encumbrance : 1,
      item.id,
      item.deed_warehouse_location_key || null,
      item.deed_base_max_item_types || (item.item_type === 'deed' ? 1 : null),
      item.deed_max_total_items || (item.item_type === 'deed' ? 100 : null),
      item.deed_automation_enabled || false,
      item.rune_color || (item.item_type === 'rune' ? '#0000FF' : null)
    ]
  );
  return getItemById(item.id);
}

async function getItemEncumbrance(itemName) {
  const item = await getItemByName(itemName);
  return item ? (item.encumbrance || 1) : 1;
}

// ============================================================
// Factory Recipes Functions
// ============================================================

/**
 * Get all factory recipes with optional filters
 * @param {Object} options - Filter options
 * @param {number} options.tier - Filter by factory tier required
 * @param {boolean} options.active - Filter by active status (default: true)
 * @returns {Promise<Array>} Array of recipe objects
 */
async function getFactoryRecipes(options = {}) {
  const { tier, active = true } = options;
  
  let sql = 'SELECT * FROM factory_recipes WHERE 1=1';
  const params = [];
  let paramIndex = 1;
  
  if (active !== undefined && active !== null) {
    sql += ` AND active = $${paramIndex++}`;
    params.push(active);
  }
  
  if (tier !== undefined && tier !== null) {
    sql += ` AND factory_tier_required <= $${paramIndex++}`;
    params.push(tier);
  }
  
  sql += ' ORDER BY name';
  
  return getAll(sql, params);
}

/**
 * Get a single factory recipe by ID
 * @param {number} recipeId - The recipe ID
 * @returns {Promise<Object|null>} Recipe object or null
 */
async function getFactoryRecipeById(recipeId) {
  return getOne('SELECT * FROM factory_recipes WHERE recipe_id = $1', [recipeId]);
}

/**
 * Get a single factory recipe by name
 * @param {string} name - The recipe name
 * @returns {Promise<Object|null>} Recipe object or null
 */
async function getFactoryRecipeByName(name) {
  return getOne('SELECT * FROM factory_recipes WHERE LOWER(name) = LOWER($1)', [name]);
}

/**
 * Create a new factory recipe
 * IMPORTANT: required_runes should NEVER include PRODUCTION runes
 * @param {Object} recipe - Recipe data
 * @returns {Promise<Object>} Created recipe
 */
async function createFactoryRecipe(recipe) {
  // Validate that required_runes doesn't include PRODUCTION
  const requiredRunes = recipe.required_runes || [];
  if (Array.isArray(requiredRunes) && requiredRunes.includes('PRODUCTION')) {
    throw new Error('required_runes cannot include PRODUCTION runes. PRODUCTION runes are a machine requirement, not a recipe requirement.');
  }
  
  const result = await query(
    `INSERT INTO factory_recipes (
      name, description, required_ingredients, required_runes, output_items,
      success_rate, required_stats, crafting_time_ms, return_rate_on_fail,
      factory_tier_required, byproducts, allow_rune_substitution, allow_wildcard_runes, active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING recipe_id`,
    [
      recipe.name,
      recipe.description || '',
      JSON.stringify(recipe.required_ingredients || []),
      JSON.stringify(recipe.required_runes || []),
      JSON.stringify(recipe.output_items || []),
      recipe.success_rate || 70.00,
      recipe.required_stats ? JSON.stringify(recipe.required_stats) : null,
      recipe.crafting_time_ms || 5000,
      recipe.return_rate_on_fail || 0.50,
      recipe.factory_tier_required || 1,
      recipe.byproducts ? JSON.stringify(recipe.byproducts) : null,
      recipe.allow_rune_substitution || false,
      recipe.allow_wildcard_runes || false,
      recipe.active !== undefined ? recipe.active : true
    ]
  );
  
  return getFactoryRecipeById(result.rows[0].recipe_id);
}

/**
 * Update an existing factory recipe
 * @param {number} recipeId - Recipe ID to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated recipe
 */
async function updateFactoryRecipe(recipeId, updates) {
  // Validate that required_runes doesn't include PRODUCTION
  if (updates.required_runes) {
    const requiredRunes = updates.required_runes;
    if (Array.isArray(requiredRunes) && requiredRunes.includes('PRODUCTION')) {
      throw new Error('required_runes cannot include PRODUCTION runes. PRODUCTION runes are a machine requirement, not a recipe requirement.');
    }
  }
  
  const existingRecipe = await getFactoryRecipeById(recipeId);
  if (!existingRecipe) {
    throw new Error(`Recipe with ID ${recipeId} not found`);
  }
  
  await query(
    `UPDATE factory_recipes SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      required_ingredients = COALESCE($3, required_ingredients),
      required_runes = COALESCE($4, required_runes),
      output_items = COALESCE($5, output_items),
      success_rate = COALESCE($6, success_rate),
      required_stats = COALESCE($7, required_stats),
      crafting_time_ms = COALESCE($8, crafting_time_ms),
      return_rate_on_fail = COALESCE($9, return_rate_on_fail),
      factory_tier_required = COALESCE($10, factory_tier_required),
      byproducts = COALESCE($11, byproducts),
      allow_rune_substitution = COALESCE($12, allow_rune_substitution),
      allow_wildcard_runes = COALESCE($13, allow_wildcard_runes),
      active = COALESCE($14, active)
    WHERE recipe_id = $15`,
    [
      updates.name,
      updates.description,
      updates.required_ingredients ? JSON.stringify(updates.required_ingredients) : null,
      updates.required_runes ? JSON.stringify(updates.required_runes) : null,
      updates.output_items ? JSON.stringify(updates.output_items) : null,
      updates.success_rate,
      updates.required_stats ? JSON.stringify(updates.required_stats) : null,
      updates.crafting_time_ms,
      updates.return_rate_on_fail,
      updates.factory_tier_required,
      updates.byproducts ? JSON.stringify(updates.byproducts) : null,
      updates.allow_rune_substitution,
      updates.allow_wildcard_runes,
      updates.active,
      recipeId
    ]
  );
  
  return getFactoryRecipeById(recipeId);
}

/**
 * Delete a factory recipe
 * @param {number} recipeId - Recipe ID to delete
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteFactoryRecipe(recipeId) {
  const result = await query('DELETE FROM factory_recipes WHERE recipe_id = $1', [recipeId]);
  return result.rowCount > 0;
}

// ============================================================
// Factory Events Functions
// ============================================================

/**
 * Log a factory event
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Created event
 */
async function logFactoryEvent(eventData) {
  const result = await query(
    `INSERT INTO factory_events (
      event_type, factory_room_id, player_id, recipe_id, item_id, quantity, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
    [
      eventData.event_type,
      eventData.factory_room_id || null,
      eventData.player_id || null,
      eventData.recipe_id || null,
      eventData.item_id || null,
      eventData.quantity || null,
      eventData.metadata ? JSON.stringify(eventData.metadata) : null
    ]
  );
  
  return getOne('SELECT * FROM factory_events WHERE id = $1', [result.rows[0].id]);
}

/**
 * Get recent factory events
 * @param {Object} options - Filter options
 * @param {number} options.playerId - Filter by player
 * @param {number} options.roomId - Filter by room
 * @param {string} options.eventType - Filter by event type
 * @param {number} options.limit - Max events to return (default 50)
 * @returns {Promise<Array>} Array of event objects
 */
async function getFactoryEvents(options = {}) {
  const { playerId, roomId, eventType, limit = 50 } = options;
  
  let sql = 'SELECT * FROM factory_events WHERE 1=1';
  const params = [];
  let paramIndex = 1;
  
  if (playerId) {
    sql += ` AND player_id = $${paramIndex++}`;
    params.push(playerId);
  }
  
  if (roomId) {
    sql += ` AND factory_room_id = $${paramIndex++}`;
    params.push(roomId);
  }
  
  if (eventType) {
    sql += ` AND event_type = $${paramIndex++}`;
    params.push(eventType);
  }
  
  sql += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
  params.push(limit);
  
  return getAll(sql, params);
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

async function getAllRoomTypes() {
  // Get all room types from room_type_colors table
  return getAll('SELECT room_type FROM room_type_colors ORDER BY room_type', []);
}

async function getAllItemTypes() {
  // Get all item types from item_types table
  return getAll('SELECT item_type FROM item_types ORDER BY item_type', []);
}

async function getWarehouseRooms() {
  // Get all rooms with room_type = 'warehouse' for deed configuration
  return getAll(
    `SELECT r.id, r.name, r.map_id, m.name as map_name, r.x, r.y 
     FROM rooms r 
     JOIN maps m ON r.map_id = m.id 
     WHERE r.room_type = 'warehouse' 
     ORDER BY m.name, r.name`,
    []
  );
}

// ============================================================
// Merchant Items Functions
// ============================================================

async function getMerchantRooms() {
  // Get all rooms with room_type = 'merchant' for item configuration
  return getAll(
    `SELECT r.id, r.name, r.map_id, m.name as map_name, r.x, r.y 
     FROM rooms r 
     JOIN maps m ON r.map_id = m.id 
     WHERE r.room_type = 'merchant' 
     ORDER BY m.name, r.name`,
    []
  );
}

async function getMerchantItems(itemId) {
  // Get all merchant room configurations for a specific item
  return getAll(
    `SELECT mi.id, mi.item_id, mi.room_id, mi.unlimited, mi.max_qty, 
            mi.current_qty, mi.regen_hours, mi.last_regen_time,
            mi.price, mi.buyable, mi.sellable, mi.config_json,
            r.name as room_name, r.map_id, m.name as map_name, r.x, r.y
     FROM merchant_items mi
     JOIN rooms r ON mi.room_id = r.id
     JOIN maps m ON r.map_id = m.id
     WHERE mi.item_id = $1
     ORDER BY m.name, r.name`,
    [itemId]
  );
}

async function addItemToMerchant(itemId, roomId, unlimited = true, maxQty = null, regenHours = null, price = 0, buyable = true, sellable = false, configJson = '{}') {
  // Validate room is merchant type
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  if (room.room_type !== 'merchant') {
    throw new Error('Only merchant rooms can sell items');
  }
  
  // Insert or update merchant item
  const result = await query(
    `INSERT INTO merchant_items (item_id, room_id, unlimited, max_qty, current_qty, regen_hours, last_regen_time, price, buyable, sellable, config_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (item_id, room_id) 
     DO UPDATE SET unlimited = $3, max_qty = $4, regen_hours = $6, price = $8, buyable = $9, sellable = $10, config_json = $11
     RETURNING id`,
    [itemId, roomId, unlimited, maxQty, 0, regenHours, null, price, buyable, sellable, configJson, Date.now()]
  );
  
  return getMerchantItemById(result.rows[0].id);
}

async function getMerchantItemById(id) {
  return getOne(
    `SELECT mi.*, r.name as room_name, r.map_id, m.name as map_name, r.x, r.y
     FROM merchant_items mi
     JOIN rooms r ON mi.room_id = r.id
     JOIN maps m ON r.map_id = m.id
     WHERE mi.id = $1`,
    [id]
  );
}

async function updateMerchantItem(merchantItemId, unlimited, maxQty, regenHours, price = null, buyable = null, sellable = null, configJson = null) {
  // Build dynamic update query based on provided fields
  let updates = [];
  let params = [];
  let paramIndex = 1;
  
  if (unlimited !== null && unlimited !== undefined) {
    updates.push(`unlimited = $${paramIndex++}`);
    params.push(unlimited);
  }
  if (maxQty !== undefined) {
    updates.push(`max_qty = $${paramIndex++}`);
    params.push(maxQty);
  }
  if (regenHours !== undefined) {
    updates.push(`regen_hours = $${paramIndex++}`);
    params.push(regenHours);
  }
  if (price !== null && price !== undefined) {
    updates.push(`price = $${paramIndex++}`);
    params.push(price);
  }
  if (buyable !== null && buyable !== undefined) {
    updates.push(`buyable = $${paramIndex++}`);
    params.push(buyable);
  }
  if (sellable !== null && sellable !== undefined) {
    updates.push(`sellable = $${paramIndex++}`);
    params.push(sellable);
  }
  if (configJson !== null && configJson !== undefined) {
    updates.push(`config_json = $${paramIndex++}`);
    params.push(configJson);
  }
  
  if (updates.length === 0) {
    return getMerchantItemById(merchantItemId);
  }
  
  params.push(merchantItemId);
  await query(
    `UPDATE merchant_items SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );
  return getMerchantItemById(merchantItemId);
}

async function updateMerchantItemFromConfig(merchantItemId, config) {
  // Update merchant item from a parsed JSON config object
  const { unlimited, max_qty, current_qty, regen_hours, buyable, sellable, price } = config;
  
  let updates = [];
  let params = [];
  let paramIndex = 1;
  
  if (unlimited !== undefined) {
    updates.push(`unlimited = $${paramIndex++}`);
    params.push(unlimited);
  }
  if (max_qty !== undefined) {
    updates.push(`max_qty = $${paramIndex++}`);
    params.push(max_qty);
  }
  if (current_qty !== undefined) {
    updates.push(`current_qty = $${paramIndex++}`);
    params.push(current_qty);
  }
  if (regen_hours !== undefined) {
    updates.push(`regen_hours = $${paramIndex++}`);
    params.push(regen_hours);
  }
  if (buyable !== undefined) {
    updates.push(`buyable = $${paramIndex++}`);
    params.push(buyable);
  }
  if (sellable !== undefined) {
    updates.push(`sellable = $${paramIndex++}`);
    params.push(sellable);
  }
  if (price !== undefined) {
    updates.push(`price = $${paramIndex++}`);
    params.push(price);
  }
  
  // Always update config_json with the full config
  updates.push(`config_json = $${paramIndex++}`);
  params.push(JSON.stringify(config));
  
  if (updates.length === 0) {
    return getMerchantItemById(merchantItemId);
  }
  
  params.push(merchantItemId);
  await query(
    `UPDATE merchant_items SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );
  return getMerchantItemById(merchantItemId);
}

async function removeItemFromMerchant(merchantItemId) {
  await query('DELETE FROM merchant_items WHERE id = $1', [merchantItemId]);
  return true;
}

async function getMerchantItemsForRoom(roomId) {
  // Get all items sold in a specific merchant room
  return getAll(
    `SELECT mi.id, mi.item_id, mi.room_id, mi.unlimited, mi.max_qty, 
            mi.current_qty, mi.regen_hours, mi.last_regen_time,
            mi.price, mi.buyable, mi.sellable, mi.config_json,
            i.name as item_name, i.description as item_description, i.item_type
     FROM merchant_items mi
     JOIN items i ON mi.item_id = i.id
     WHERE mi.room_id = $1
     ORDER BY i.name`,
    [roomId]
  );
}

async function getMerchantItemsForList(roomId) {
  // Optimized query for list command - only get buyable items with display info
  return getAll(
    `SELECT mi.id, mi.item_id, mi.unlimited, mi.max_qty, mi.current_qty, mi.price,
            i.name as item_name
     FROM merchant_items mi
     JOIN items i ON mi.item_id = i.id
     WHERE mi.room_id = $1 AND mi.buyable = TRUE
     ORDER BY i.name`,
    [roomId]
  );
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
  // NOTE: After migration 080, some items may have been stored with item IDs as names (e.g., "1" instead of "Pulse Resin")
  const normalized = [];
  for (const item of items) {
    let canonicalName = item.item_name;
    
    // Check if item_name is a numeric string (item ID) - this happens when items were stored with IDs before conversion
    if (!isNaN(parseInt(item.item_name)) && isFinite(item.item_name) && item.item_name.trim() !== '') {
      // Try to look up by ID first
      const itemDefById = await getItemById(parseInt(item.item_name));
      if (itemDefById) {
        canonicalName = itemDefById.name;
      } else {
        // If ID lookup fails, try by name as fallback
        const itemDefByName = await getItemByName(item.item_name);
        canonicalName = itemDefByName ? itemDefByName.name : item.item_name;
      }
    } else {
      // Normal name lookup
      const itemDef = await getItemByName(item.item_name);
      canonicalName = itemDef ? itemDef.name : item.item_name;
    }
    
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
  // First, try to find the item by name (normal case)
  let existing = await getOne(
    `SELECT id, quantity, item_name FROM room_items WHERE room_id = $1 AND LOWER(REPLACE(item_name, '_', ' ')) = LOWER(REPLACE($2, '_', ' ')) LIMIT 1`,
    [roomId, itemName]
  );
  
  // If not found by name, the item might be stored with an item ID as the name (legacy data from migration 080)
  // Try to find it by looking up the item ID and matching against stored IDs
  if (!existing) {
    const itemDef = await getItemByName(itemName);
    if (itemDef) {
      // Try to find room items with this item's ID stored as the name
      existing = await getOne(
        `SELECT id, quantity, item_name FROM room_items WHERE room_id = $1 AND item_name = $2 LIMIT 1`,
        [roomId, itemDef.id.toString()]
      );
    }
  }
  
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
    `SELECT i.name as item_name, SUM(pi.quantity) as quantity
     FROM player_items pi
     JOIN items i ON pi.item_id = i.id
     WHERE pi.player_id = $1
     GROUP BY i.name
     ORDER BY i.name`,
    [playerId]
  );
}

async function addPlayerItem(playerId, itemName, quantity = 1) {
  // Get item_id from item name
  const item = await getItemByName(itemName);
  if (!item) {
    throw new Error(`Item "${itemName}" not found`);
  }
  
  const existing = await getOne(
    'SELECT id, quantity FROM player_items WHERE player_id = $1 AND item_id = $2 LIMIT 1',
    [playerId, item.id]
  );
  
  if (existing) {
    await query('UPDATE player_items SET quantity = quantity + $1 WHERE player_id = $2 AND item_id = $3', [quantity, playerId, item.id]);
  } else {
    await query('INSERT INTO player_items (player_id, item_id, quantity, created_at) VALUES ($1, $2, $3, $4)', [playerId, item.id, quantity, Date.now()]);
  }
}

async function removePlayerItem(playerId, itemName, quantity = 1) {
  // Get item_id from item name
  const item = await getItemByName(itemName);
  if (!item) {
    return false;
  }
  
  const existing = await getOne(
    'SELECT id, quantity FROM player_items WHERE player_id = $1 AND item_id = $2 LIMIT 1',
    [playerId, item.id]
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
     LEFT JOIN items i ON pi.item_id = i.id
     WHERE pi.player_id = $1`,
    [playerId]
  );
  return result ? parseInt(result.total_encumbrance) : 0;
}

// ============================================================
// Warehouse Functions
// ============================================================

async function getWarehouseItems(playerId, warehouseLocationKey) {
  try {
    return await getAll(
      `SELECT i.name as item_name, wi.quantity 
       FROM warehouse_items wi
       JOIN items i ON wi.item_id = i.id
       WHERE wi.player_id = $1 AND wi.warehouse_location_key = $2 
       ORDER BY i.name`,
      [playerId, warehouseLocationKey]
    );
  } catch (error) {
    console.error(`[getWarehouseItems] Error fetching warehouse items for player ${playerId}, location ${warehouseLocationKey}:`, error.message);
    // Return empty array on error to prevent crashes
    return [];
  }
}

async function addWarehouseItem(playerId, warehouseLocationKey, itemName, quantity) {
  // Get item_id from item name
  const item = await getItemByName(itemName);
  if (!item) {
    throw new Error(`Item "${itemName}" not found`);
  }
  
  const existing = await getOne(
    'SELECT id, quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 AND item_id = $3',
    [playerId, warehouseLocationKey, item.id]
  );
  
  if (existing) {
    await query(
      'UPDATE warehouse_items SET quantity = quantity + $1 WHERE id = $2',
      [quantity, existing.id]
    );
  } else {
    await query(
      'INSERT INTO warehouse_items (player_id, warehouse_location_key, item_id, quantity, created_at) VALUES ($1, $2, $3, $4, $5)',
      [playerId, warehouseLocationKey, item.id, quantity, Date.now()]
    );
  }
}

async function removeWarehouseItem(playerId, warehouseLocationKey, itemName, quantity) {
  // Get item_id from item name
  const item = await getItemByName(itemName);
  if (!item) {
    return false;
  }
  
  const existing = await getOne(
    'SELECT id, quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 AND item_id = $3',
    [playerId, warehouseLocationKey, item.id]
  );
  
  if (!existing) return false;
  
  if (existing.quantity <= quantity) {
    await query('DELETE FROM warehouse_items WHERE id = $1', [existing.id]);
  } else {
    await query('UPDATE warehouse_items SET quantity = quantity - $1 WHERE id = $2', [quantity, existing.id]);
  }
  return true;
}

async function getPlayerWarehouseCapacity(playerId, warehouseLocationKey) {
  return getOne(
    'SELECT * FROM player_warehouses WHERE player_id = $1 AND warehouse_location_key = $2',
    [playerId, warehouseLocationKey]
  );
}

async function initializePlayerWarehouse(playerId, warehouseLocationKey, deedItemId) {
  // Get deed configuration
  const deed = await getItemById(deedItemId);
  if (!deed || deed.item_type !== 'deed') {
    throw new Error('Invalid deed item');
  }
  
  const maxItemTypes = deed.deed_base_max_item_types || 1;
  const maxQuantityPerType = deed.deed_base_max_quantity_per_type || 100;
  const upgradeTier = deed.deed_upgrade_tier || 1;
  
  // Check if player has flag_always_first_time - if so, always treat as first time (always initialize)
  const player = await getPlayerById(playerId);
  const isAlwaysFirstTime = player && player.flag_always_first_time === 1;
  
  // Check if warehouse already exists (unless player is always-first-time)
  if (!isAlwaysFirstTime) {
    const existing = await getPlayerWarehouseCapacity(playerId, warehouseLocationKey);
    if (existing) {
      return existing;
    }
  }
  
  // Create new warehouse capacity record (or recreate for always-first-time players)
  const result = await query(
    `INSERT INTO player_warehouses (player_id, warehouse_location_key, deed_item_id, upgrade_tier, max_item_types, max_quantity_per_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [playerId, warehouseLocationKey, deedItemId, upgradeTier, maxItemTypes, maxQuantityPerType, Date.now()]
  );
  
  return result.rows[0];
}

async function getWarehouseItemTypeCount(playerId, warehouseLocationKey) {
  const result = await getOne(
    'SELECT COUNT(DISTINCT item_id) as count FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2',
    [playerId, warehouseLocationKey]
  );
  return result ? parseInt(result.count) : 0;
}

async function getWarehouseItemQuantity(playerId, warehouseLocationKey, itemName) {
  // Get item_id from item name
  const item = await getItemByName(itemName);
  if (!item) {
    return 0;
  }
  
  const result = await getOne(
    'SELECT quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 AND item_id = $3',
    [playerId, warehouseLocationKey, item.id]
  );
  return result ? parseInt(result.quantity) : 0;
}

async function hasPlayerWarehouseDeed(playerId) {
  try {
    // Check if player has any deed items in inventory
    const playerItems = await getPlayerItems(playerId);
    
    if (!playerItems || !Array.isArray(playerItems)) {
      return false;
    }
    
    for (const item of playerItems) {
      if (!item || !item.item_name) {
        continue;
      }
      const itemDef = await getItemByName(item.item_name);
      if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[hasPlayerWarehouseDeed] Error checking warehouse deed for player ${playerId}:`, error);
    // Return false on error to prevent blocking room updates
    return false;
  }
}

async function checkWarehouseAccess(playerId, warehouseLocationKey) {
  // Check if player has a deed item in inventory that matches this warehouse location
  const playerItems = await getPlayerItems(playerId);
  const warehouseLocationKeyStr = warehouseLocationKey.toString();
  
  for (const item of playerItems) {
    const itemDef = await getItemByName(item.item_name);
    if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key === warehouseLocationKeyStr) {
      return { hasAccess: true, deedItem: itemDef };
    }
  }
  
  return { hasAccess: false, deedItem: null };
}

// ============================================================
// Player Bank Functions
// ============================================================

/**
 * Convert shards to optimal format (crowns + shards remainder)
 * @param {number} shards - Total number of shards
 * @returns {Object} { crowns: number, shards: number }
 */
function convertCurrencyToOptimal(shards) {
  const crowns = Math.floor(shards / 100);
  const remainderShards = shards % 100;
  return { crowns, shards: remainderShards };
}

/**
 * Get all currency in bank for a player
 */
async function getPlayerBank(playerId) {
  return getAll(
    'SELECT currency_name, quantity FROM player_bank WHERE player_id = $1 ORDER BY currency_name',
    [playerId]
  );
}

/**
 * Get player's bank balance in optimal format
 */
async function getPlayerBankBalance(playerId) {
  const bankItems = await getPlayerBank(playerId);
  let totalShards = 0;
  
  for (const item of bankItems) {
    // Parse quantity as integer (PostgreSQL may return as string)
    const quantity = parseInt(item.quantity, 10) || 0;
    
    if (item.currency_name === 'Glimmer Shard') {
      totalShards += quantity;
    } else if (item.currency_name === 'Glimmer Crown') {
      totalShards += quantity * 100;
    }
  }
  
  return convertCurrencyToOptimal(totalShards);
}

/**
 * Deposit currency to player bank (with auto-conversion)
 */
async function depositCurrency(playerId, currencyName, quantity) {
  // Get current bank balance
  const bankItems = await getPlayerBank(playerId);
  let currentShards = 0;
  let currentCrowns = 0;
  
  for (const item of bankItems) {
    if (item.currency_name === 'Glimmer Shard') {
      currentShards = item.quantity;
    } else if (item.currency_name === 'Glimmer Crown') {
      currentCrowns = item.quantity;
    }
  }
  
  // Add new currency
  if (currencyName === 'Glimmer Shard') {
    currentShards += quantity;
  } else if (currencyName === 'Glimmer Crown') {
    currentCrowns += quantity;
  }
  
  // Convert to optimal format
  const totalShards = currentShards + (currentCrowns * 100);
  const optimal = convertCurrencyToOptimal(totalShards);
  
  // Update bank
  await query(
    `INSERT INTO player_bank (player_id, currency_name, quantity) 
     VALUES ($1, 'Glimmer Crown', $2)
     ON CONFLICT (player_id, currency_name) DO UPDATE SET quantity = $2`,
    [playerId, optimal.crowns]
  );
  
  if (optimal.shards > 0) {
    await query(
      `INSERT INTO player_bank (player_id, currency_name, quantity) 
       VALUES ($1, 'Glimmer Shard', $2)
       ON CONFLICT (player_id, currency_name) DO UPDATE SET quantity = $2`,
      [playerId, optimal.shards]
    );
  } else {
    // Remove shards if we have 0
    await query(
      'DELETE FROM player_bank WHERE player_id = $1 AND currency_name = $2',
      [playerId, 'Glimmer Shard']
    );
  }
  
  return optimal;
}

/**
 * Withdraw currency from player bank (with auto-conversion)
 */
async function withdrawCurrency(playerId, currencyName, quantity) {
  const bankItems = await getPlayerBank(playerId);
  let totalShards = 0;
  
  for (const item of bankItems) {
    if (item.currency_name === 'Glimmer Shard') {
      totalShards += item.quantity;
    } else if (item.currency_name === 'Glimmer Crown') {
      totalShards += item.quantity * 100;
    }
  }
  
  // Calculate withdrawal in shards
  let withdrawShards = 0;
  if (currencyName === 'Glimmer Shard') {
    withdrawShards = quantity;
  } else if (currencyName === 'Glimmer Crown') {
    withdrawShards = quantity * 100;
  }
  
  if (totalShards < withdrawShards) {
    throw new Error('Insufficient funds in bank');
  }
  
  // Update bank
  const remainingShards = totalShards - withdrawShards;
  const optimal = convertCurrencyToOptimal(remainingShards);
  
  await query(
    `INSERT INTO player_bank (player_id, currency_name, quantity) 
     VALUES ($1, 'Glimmer Crown', $2)
     ON CONFLICT (player_id, currency_name) DO UPDATE SET quantity = $2`,
    [playerId, optimal.crowns]
  );
  
  if (optimal.shards > 0) {
    await query(
      `INSERT INTO player_bank (player_id, currency_name, quantity) 
       VALUES ($1, 'Glimmer Shard', $2)
       ON CONFLICT (player_id, currency_name) DO UPDATE SET quantity = $2`,
      [playerId, optimal.shards]
    );
  } else {
    await query(
      'DELETE FROM player_bank WHERE player_id = $1 AND currency_name = $2',
      [playerId, 'Glimmer Shard']
    );
  }
  
  // Return what was withdrawn (in requested format)
  if (currencyName === 'Glimmer Crown') {
    return { crowns: quantity, shards: 0 };
  } else {
    const withdrawnOptimal = convertCurrencyToOptimal(withdrawShards);
    return withdrawnOptimal;
  }
}

/**
 * Get player's currency from inventory
 */
async function getPlayerCurrency(playerId) {
  const items = await getPlayerItems(playerId);
  let shards = 0;
  let crowns = 0;
  
  for (const item of items) {
    // Parse quantity as integer (PostgreSQL may return as string)
    const quantity = parseInt(item.quantity, 10) || 0;
    
    if (item.item_name === 'Glimmer Shard') {
      shards = quantity;
    } else if (item.item_name === 'Glimmer Crown') {
      crowns = quantity;
    }
  }
  
  return { shards, crowns, totalShards: shards + (crowns * 100) };
}

/**
 * Remove currency from player inventory (with auto-conversion)
 */
async function removePlayerCurrency(playerId, totalShardsNeeded) {
  const currency = await getPlayerCurrency(playerId);
  
  if (currency.totalShards < totalShardsNeeded) {
    throw new Error('Insufficient currency');
  }
  
  // Convert to optimal and remove
  let remainingShards = currency.totalShards - totalShardsNeeded;
  const optimal = convertCurrencyToOptimal(remainingShards);
  
  // Remove all currency first
  await removePlayerItem(playerId, 'Glimmer Shard', currency.shards);
  await removePlayerItem(playerId, 'Glimmer Crown', currency.crowns);
  
  // Add back remaining
  if (optimal.crowns > 0) {
    await addPlayerItem(playerId, 'Glimmer Crown', optimal.crowns);
  }
  if (optimal.shards > 0) {
    await addPlayerItem(playerId, 'Glimmer Shard', optimal.shards);
  }
  
  return optimal;
}

/**
 * Add currency to player inventory (with auto-conversion)
 */
async function addPlayerCurrency(playerId, totalShardsToAdd) {
  const currency = await getPlayerCurrency(playerId);
  const totalShards = currency.totalShards + totalShardsToAdd;
  const optimal = convertCurrencyToOptimal(totalShards);
  
  // Remove all currency first
  await removePlayerItem(playerId, 'Glimmer Shard', currency.shards);
  await removePlayerItem(playerId, 'Glimmer Crown', currency.crowns);
  
  // Add back in optimal format
  if (optimal.crowns > 0) {
    await addPlayerItem(playerId, 'Glimmer Crown', optimal.crowns);
  }
  if (optimal.shards > 0) {
    await addPlayerItem(playerId, 'Glimmer Shard', optimal.shards);
  }
  
  return optimal;
}

async function getPlayerWarehouseDeeds(playerId, warehouseLocationKey) {
  // Get all deed items player owns for this warehouse location
  const playerItems = await getPlayerItems(playerId);
  const warehouseLocationKeyStr = warehouseLocationKey.toString();
  const deeds = [];
  
  for (const item of playerItems) {
    const itemDef = await getItemByName(item.item_name);
    if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key === warehouseLocationKeyStr) {
      deeds.push({
        item_name: itemDef.name,
        item_id: itemDef.id,
        max_item_types: itemDef.deed_base_max_item_types || 1,
        max_quantity_per_type: itemDef.deed_base_max_quantity_per_type || 100,
        upgrade_tier: itemDef.deed_upgrade_tier || 1
      });
    }
  }
  
  return deeds;
}

async function getAllPlayerWarehouseDeeds(playerId) {
  // Get ALL deed items player owns (for auto-store warehouse selection)
  const playerItems = await getPlayerItems(playerId);
  const deeds = [];
  
  for (const item of playerItems) {
    const itemDef = await getItemByName(item.item_name);
    if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key) {
      // Get warehouse room name for display
      const warehouseRoom = await getOne(
        'SELECT id, name FROM rooms WHERE id = $1',
        [parseInt(itemDef.deed_warehouse_location_key)]
      );
      
      deeds.push({
        item_name: itemDef.name,
        item_id: itemDef.id,
        warehouse_location_key: itemDef.deed_warehouse_location_key,
        warehouse_name: warehouseRoom ? warehouseRoom.name : `Warehouse ${itemDef.deed_warehouse_location_key}`,
        max_item_types: itemDef.deed_base_max_item_types || 1,
        max_quantity_per_type: itemDef.deed_base_max_quantity_per_type || 100,
        upgrade_tier: itemDef.deed_upgrade_tier || 1
      });
    }
  }
  
  return deeds;
}

// ============================================================
// Account Functions
// ============================================================

/**
 * Create a new account
 */
async function createAccount(email, passwordHash) {
  const result = await query(
    'INSERT INTO accounts (email, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id, email, email_verified, created_at',
    [email.toLowerCase().trim(), passwordHash, Date.now()]
  );
  return result.rows[0];
}

/**
 * Get account by email
 */
async function getAccountByEmail(email) {
  return getOne(
    'SELECT * FROM accounts WHERE email = $1',
    [email.toLowerCase().trim()]
  );
}

/**
 * Get account by ID
 */
async function getAccountById(accountId) {
  return getOne(
    'SELECT * FROM accounts WHERE id = $1',
    [accountId]
  );
}

/**
 * Check if account is within grace period (7 days) for unverified accounts
 * Returns true if account is verified OR if account was created within last 7 days
 */
async function isAccountWithinGracePeriod(accountId) {
  const account = await getAccountById(accountId);
  if (!account) return false;
  
  // If verified, always allow
  if (account.email_verified) return true;
  
  // Check if account was created within last 7 days
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  return account.created_at >= sevenDaysAgo;
}

/**
 * Calculate days remaining in grace period for unverified accounts
 * Returns null if account is verified, or number of days remaining (0-7, 0 if expired)
 */
async function getDaysRemainingForVerification(accountId) {
  const account = await getAccountById(accountId);
  if (!account) return null;
  
  // If verified, return null (no grace period needed)
  if (account.email_verified) return null;
  
  // Ensure created_at is a number (handle both string and number formats)
  const accountCreatedAt = typeof account.created_at === 'string' 
    ? parseInt(account.created_at, 10) 
    : Number(account.created_at);
  
  // Validate the timestamp is reasonable (should be a millisecond timestamp)
  if (isNaN(accountCreatedAt) || accountCreatedAt <= 0) {
    console.error(`Invalid created_at timestamp for account ${accountId}: ${account.created_at}`);
    return 7; // Default to 7 days if timestamp is invalid
  }
  
  const now = Date.now();
  
  // Calculate milliseconds since account creation
  const msSinceCreation = now - accountCreatedAt;
  
  // Calculate days since creation (using floor to get full days elapsed)
  const daysSinceCreation = Math.floor(msSinceCreation / (24 * 60 * 60 * 1000));
  
  // Calculate days remaining (7 days total grace period)
  // Use Math.max to ensure it never goes below 0
  const daysRemaining = Math.max(0, 7 - daysSinceCreation);
  
  return daysRemaining;
}

/**
 * Update last login timestamp
 */
async function updateLastLogin(accountId) {
  await query(
    'UPDATE accounts SET last_login_at = $1 WHERE id = $2',
    [Date.now(), accountId]
  );
}

/**
 * Get all characters for an account
 */
async function getUserCharacters(accountId) {
  return getAll(
    `SELECT p.id, p.name, p.current_room_id, p.flag_god_mode, p.flag_always_first_time,
            r.name as room_name, r.map_id, m.name as map_name
     FROM user_characters uc
     JOIN players p ON uc.player_id = p.id
     LEFT JOIN rooms r ON p.current_room_id = r.id
     LEFT JOIN maps m ON r.map_id = m.id
     WHERE uc.account_id = $1
     ORDER BY p.name`,
    [accountId]
  );
}

/**
 * Add a character to an account
 */
async function addCharacterToAccount(accountId, playerId) {
  await query(
    'INSERT INTO user_characters (account_id, player_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (account_id, player_id) DO NOTHING',
    [accountId, playerId, Date.now()]
  );
}

/**
 * Remove a character from an account
 */
async function removeCharacterFromAccount(accountId, playerId) {
  await query(
    'DELETE FROM user_characters WHERE account_id = $1 AND player_id = $2',
    [accountId, playerId]
  );
}

// ============================================================
// Email Verification Token Functions
// ============================================================

/**
 * Create email verification token
 */
async function createEmailVerificationToken(accountId, token, expiresAt) {
  await query(
    'INSERT INTO email_verification_tokens (account_id, token, expires_at) VALUES ($1, $2, $3)',
    [accountId, token, expiresAt]
  );
}

/**
 * Get email verification token (if valid and not expired)
 */
async function getEmailVerificationToken(token) {
  return getOne(
    'SELECT * FROM email_verification_tokens WHERE token = $1 AND used = FALSE AND expires_at > $2',
    [token, Date.now()]
  );
}

/**
 * Mark email verification token as used
 */
async function markEmailVerificationTokenUsed(token) {
  await query(
    'UPDATE email_verification_tokens SET used = TRUE WHERE token = $1',
    [token]
  );
}

/**
 * Mark account email as verified
 */
async function verifyAccountEmail(accountId) {
  await query(
    'UPDATE accounts SET email_verified = TRUE WHERE id = $1',
    [accountId]
  );
}

// ============================================================
// Password Reset Token Functions
// ============================================================

/**
 * Create password reset token
 */
async function createPasswordResetToken(accountId, token, expiresAt) {
  await query(
    'INSERT INTO password_reset_tokens (account_id, token, expires_at) VALUES ($1, $2, $3)',
    [accountId, token, expiresAt]
  );
}

/**
 * Get password reset token (if valid and not expired)
 */
async function getPasswordResetToken(token) {
  return getOne(
    'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > $2',
    [token, Date.now()]
  );
}

/**
 * Mark password reset token as used
 */
async function markPasswordResetTokenUsed(token) {
  await query(
    'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
    [token]
  );
}

/**
 * Update account password
 */
async function updateAccountPassword(accountId, newPasswordHash) {
  await query(
    'UPDATE accounts SET password_hash = $1 WHERE id = $2',
    [newPasswordHash, accountId]
  );
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
// Terminal History Functions
// ============================================================

/**
 * Save a terminal message to history
 * Automatically keeps only last 1000 messages per player
 */
async function saveTerminalMessage(playerId, messageText, messageType = 'info', messageHtml = null) {
  // Check if player is noob (flag_always_first_time) - don't persist for noob
  const player = await getPlayerById(playerId);
  if (player && player.flag_always_first_time === 1) {
    return; // Don't save history for noob character
  }
  
  // Insert new message
  await query(
    'INSERT INTO terminal_history (player_id, message_text, message_type, message_html, created_at) VALUES ($1, $2, $3, $4, $5)',
    [playerId, messageText, messageType, messageHtml, Date.now()]
  );
  
  // Keep only last 1000 messages per player
  // Delete older messages
  await query(
    `DELETE FROM terminal_history 
     WHERE player_id = $1 
     AND id NOT IN (
       SELECT id FROM terminal_history 
       WHERE player_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1000
     )`,
    [playerId]
  );
}

/**
 * Get terminal history for a player (last 1000 messages)
 * Returns empty array for noob character
 */
async function getTerminalHistory(playerId) {
  // Check if player is noob - don't return history
  const player = await getPlayerById(playerId);
  if (player && player.flag_always_first_time === 1) {
    return []; // No history for noob character
  }
  
  const rows = await getAll(
    'SELECT message_text, message_type, message_html, created_at FROM terminal_history WHERE player_id = $1 ORDER BY created_at ASC LIMIT 1000',
    [playerId]
  );
  
  return rows.map(row => ({
    text: row.message_text,
    type: row.message_type,
    html: row.message_html,
    timestamp: row.created_at
  }));
}

/**
 * Clear terminal history for a player
 */
async function clearTerminalHistory(playerId) {
  await query('DELETE FROM terminal_history WHERE player_id = $1', [playerId]);
}

// ============================================================
// Stat and Ability Metadata Functions
// ============================================================

/**
 * Get metadata for a single stat
 * @param {string} statName - Stat name without stat_ prefix (e.g., 'ingenuity')
 * @returns {object|null} Metadata object with description or null if not found
 */
async function getStatMetadata(statName) {
  return getOne('SELECT * FROM stat_metadata WHERE stat_name = $1', [statName]);
}

/**
 * Get metadata for a single ability
 * @param {string} abilityName - Ability name without ability_ prefix (e.g., 'crafting')
 * @returns {object|null} Metadata object with description or null if not found
 */
async function getAbilityMetadata(abilityName) {
  return getOne('SELECT * FROM ability_metadata WHERE ability_name = $1', [abilityName]);
}

/**
 * Get all stat metadata as a map
 * @returns {Map<string, string>} Map of stat_name -> description
 */
async function getAllStatMetadata() {
  const rows = await getAll('SELECT stat_name, description FROM stat_metadata');
  const metadata = new Map();
  for (const row of rows) {
    metadata.set(row.stat_name, row.description);
  }
  return metadata;
}

/**
 * Get all ability metadata as a map
 * @returns {Map<string, string>} Map of ability_name -> description
 */
async function getAllAbilityMetadata() {
  const rows = await getAll('SELECT ability_name, description FROM ability_metadata');
  const metadata = new Map();
  for (const row of rows) {
    metadata.set(row.ability_name, row.description);
  }
  return metadata;
}

// ============================================================
// Harvest Formula Config
// ============================================================

/**
 * Get a specific harvest formula config by key
 * @param {string} configKey - 'cycle_time_reduction' or 'hit_rate'
 * @returns {object|null} Config object or null
 */
async function getHarvestFormulaConfig(configKey) {
  return getOne('SELECT * FROM harvest_formula_config WHERE config_key = $1', [configKey]);
}

/**
 * Get all harvest formula configs
 * @returns {object[]} Array of config objects
 */
async function getAllHarvestFormulaConfigs() {
  return getAll('SELECT * FROM harvest_formula_config ORDER BY config_key');
}

/**
 * Update a harvest formula config
 * @param {string} configKey - Config key to update
 * @param {object} updates - Fields to update
 * @returns {object|null} Updated config or null
 */
async function updateHarvestFormulaConfig(configKey, updates) {
  const { min_resonance, min_value, max_resonance, max_value, curve_exponent, description } = updates;
  
  const result = await query(
    `UPDATE harvest_formula_config 
     SET min_resonance = COALESCE($1, min_resonance),
         min_value = COALESCE($2, min_value),
         max_resonance = COALESCE($3, max_resonance),
         max_value = COALESCE($4, max_value),
         curve_exponent = COALESCE($5, curve_exponent),
         description = COALESCE($6, description),
         updated_at = $7
     WHERE config_key = $8
     RETURNING *`,
    [min_resonance, min_value, max_resonance, max_value, curve_exponent, description, Date.now(), configKey]
  );
  
  return result.rows[0] || null;
}

// ============================================================
// Markup Functions
// ============================================================

/**
 * Get all custom markup conventions
 */
async function getAllMarkupConventions() {
  return getAll('SELECT * FROM markup_conventions ORDER BY created_at ASC');
}

/**
 * Get a single markup convention by ID
 */
async function getMarkupConventionById(id) {
  return getOne('SELECT * FROM markup_conventions WHERE id = $1', [id]);
}

/**
 * Create a new markup convention
 */
async function createMarkupConvention(convention) {
  const { syntax, opening, closing, description, example, color, effects } = convention;
  const now = Date.now();
  const result = await query(
    `INSERT INTO markup_conventions (syntax, opening, closing, description, example, color, effects, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [syntax, opening, closing, description || null, example || null, color || null, JSON.stringify(effects || {}), now, now]
  );
  return result.rows[0];
}

/**
 * Update an existing markup convention
 */
async function updateMarkupConvention(id, convention) {
  const { syntax, opening, closing, description, example, color, effects } = convention;
  const now = Date.now();
  const result = await query(
    `UPDATE markup_conventions
     SET syntax = $1,
         opening = $2,
         closing = $3,
         description = $4,
         example = $5,
         color = $6,
         effects = $7,
         updated_at = $8
     WHERE id = $9
     RETURNING *`,
    [syntax, opening, closing, description || null, example || null, color || null, JSON.stringify(effects || {}), now, id]
  );
  return result.rows[0] || null;
}

/**
 * Delete a markup convention
 */
async function deleteMarkupConvention(id) {
  await query('DELETE FROM markup_conventions WHERE id = $1', [id]);
  return true;
}

/**
 * Get all built-in convention edits
 */
async function getBuiltInConventionEdits() {
  return getAll('SELECT * FROM markup_builtin_edits ORDER BY convention_key ASC');
}

/**
 * Get edit for a specific built-in convention
 */
async function getBuiltInConventionEdit(conventionKey) {
  return getOne('SELECT * FROM markup_builtin_edits WHERE convention_key = $1', [conventionKey]);
}

/**
 * Update or insert a built-in convention edit
 */
async function upsertBuiltInConventionEdit(conventionKey, syntax, example) {
  const now = Date.now();
  const result = await query(
    `INSERT INTO markup_builtin_edits (convention_key, syntax, example, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (convention_key)
     DO UPDATE SET
       syntax = EXCLUDED.syntax,
       example = EXCLUDED.example,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [conventionKey, syntax || null, example || null, now]
  );
  return result.rows[0];
}

// ============================================================
// ZORK Knowledge Base Functions
// ============================================================

/**
 * Add a new knowledge chunk to the ZORK knowledge base
 */
async function addZorkKnowledge(category, subcategory, title, content, embedding, priority = 0, source = 'system', addedBy = null) {
  // Check if embedding column exists
  const columnCheck = await query(
    `SELECT column_name, data_type FROM information_schema.columns 
     WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'`
  );
  
  const hasEmbeddingColumn = columnCheck.rows.length > 0;
  const isVectorType = hasEmbeddingColumn && columnCheck.rows[0].data_type === 'USER-DEFINED';
  
  // Format embedding for PostgreSQL vector type
  let embeddingValue = null;
  if (embedding && hasEmbeddingColumn) {
    if (Array.isArray(embedding)) {
      if (isVectorType) {
        // Convert array to PostgreSQL vector format: '[0.1,0.2,0.3,...]'
        embeddingValue = `[${embedding.join(',')}]`;
      } else {
        // Text column - store as JSON
        embeddingValue = JSON.stringify(embedding);
      }
    } else {
      embeddingValue = embedding;
    }
  }
  
  // Build INSERT query based on whether embedding column exists
  let sql;
  const params = [category, subcategory, title, content, priority, source, addedBy];
  
  if (hasEmbeddingColumn && embeddingValue) {
    if (isVectorType) {
      sql = `INSERT INTO zork_knowledge (category, subcategory, title, content, embedding, priority, source, added_by, active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, TRUE, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
             RETURNING *`;
      params.splice(4, 0, embeddingValue); // Insert embedding at position 4
    } else {
      sql = `INSERT INTO zork_knowledge (category, subcategory, title, content, embedding, priority, source, added_by, active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
             RETURNING *`;
      params.splice(4, 0, embeddingValue); // Insert embedding at position 4
    }
  } else {
    sql = `INSERT INTO zork_knowledge (category, subcategory, title, content, priority, source, added_by, active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
           RETURNING *`;
  }
  
  const result = await query(sql, params);
  return result.rows[0];
}

/**
 * Update an existing knowledge chunk
 */
async function updateZorkKnowledge(id, updates) {
  const fields = [];
  const values = [];
  let paramIndex = 1;
  
  if (updates.category !== undefined) {
    fields.push(`category = $${paramIndex++}`);
    values.push(updates.category);
  }
  if (updates.subcategory !== undefined) {
    fields.push(`subcategory = $${paramIndex++}`);
    values.push(updates.subcategory);
  }
  if (updates.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    fields.push(`content = $${paramIndex++}`);
    values.push(updates.content);
  }
  if (updates.embedding !== undefined) {
    fields.push(`embedding = $${paramIndex++}`);
    values.push(updates.embedding);
  }
  if (updates.priority !== undefined) {
    fields.push(`priority = $${paramIndex++}`);
    values.push(updates.priority);
  }
  if (updates.source !== undefined) {
    fields.push(`source = $${paramIndex++}`);
    values.push(updates.source);
  }
  if (updates.active !== undefined) {
    fields.push(`active = $${paramIndex++}`);
    values.push(updates.active);
  }
  
  // Always update updated_at
  fields.push(`updated_at = EXTRACT(EPOCH FROM NOW()) * 1000`);
  
  values.push(id);
  
  const result = await query(
    `UPDATE zork_knowledge SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Search knowledge base using vector similarity (if pgvector available) or keyword search (fallback)
 */
async function searchZorkKnowledge(queryEmbedding, limit = 10, threshold = 0.7, category = null, priority = null) {
  // Check if embedding column exists (pgvector available)
  const columnCheck = await query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'`
  );
  
  const hasVectorColumn = columnCheck.rows.length > 0;
  
  if (hasVectorColumn && queryEmbedding) {
    // Vector similarity search
    let sql = `
      SELECT *, embedding <=> $1::vector AS distance
      FROM zork_knowledge
      WHERE active = TRUE
    `;
    const params = [queryEmbedding];
    let paramIndex = 2;
    
    if (category) {
      sql += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    
    if (priority !== null) {
      sql += ` AND priority >= $${paramIndex++}`;
      params.push(priority);
    }
    
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await query(sql, params);
    // Filter by threshold (distance is cosine distance, lower is better)
    return result.rows.filter(row => row.distance <= (1 - threshold));
  } else {
    // Fallback: keyword-based search on title and content
    // This is a simple fallback - for better results, use full-text search
    const sql = `
      SELECT *
      FROM zork_knowledge
      WHERE active = TRUE
        ${category ? 'AND category = $1' : ''}
        ${priority !== null ? `AND priority >= ${category ? '$2' : '$1'}` : ''}
      ORDER BY priority DESC, created_at DESC
      LIMIT ${category && priority !== null ? '$3' : category || priority !== null ? '$2' : '$1'}
    `;
    
    const params = [];
    if (category) params.push(category);
    if (priority !== null) params.push(priority);
    params.push(limit);
    
    return getAll(sql, params);
  }
}

/**
 * Get knowledge by category and priority
 */
async function getZorkKnowledgeByCategory(category, priority = null) {
  let sql = 'SELECT * FROM zork_knowledge WHERE active = TRUE AND category = $1';
  const params = [category];
  
  if (priority !== null) {
    sql += ' AND priority = $2';
    params.push(priority);
  }
  
  sql += ' ORDER BY priority DESC, created_at DESC';
  
  return getAll(sql, params);
}

/**
 * Get a specific knowledge chunk by ID
 */
async function getZorkKnowledgeById(id) {
  return getOne('SELECT * FROM zork_knowledge WHERE id = $1', [id]);
}

/**
 * Get all always-include knowledge (priority = 2)
 */
async function getAlwaysIncludeKnowledge() {
  return getAll(
    'SELECT * FROM zork_knowledge WHERE active = TRUE AND priority = 2 ORDER BY category, created_at DESC'
  );
}

/**
 * Soft delete a knowledge chunk (set active = false)
 */
async function deleteZorkKnowledge(id) {
  const result = await query(
    'UPDATE zork_knowledge SET active = FALSE, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] || null;
}

// ============================================================
// Debug Observer System
// ============================================================

/**
 * Start a debug observation session for a player
 * @param {number} playerId - The player's ID
 * @param {string} bugLabel - Short description of the bug being observed
 * @returns {Promise<number>} The session ID
 */
async function startDebugSession(playerId, bugLabel) {
  // End any active sessions for this player first
  await query(
    'UPDATE debug_sessions SET active = FALSE, ended_at = NOW() WHERE player_id = $1 AND active = TRUE',
    [playerId]
  );
  
  const result = await query(
    'INSERT INTO debug_sessions (player_id, bug_label) VALUES ($1, $2) RETURNING id',
    [playerId, bugLabel]
  );
  return result.rows[0].id;
}

/**
 * End an active debug session
 * @param {number} sessionId - The session ID to end
 */
async function endDebugSession(sessionId) {
  await query(
    'UPDATE debug_sessions SET active = FALSE, ended_at = NOW() WHERE id = $1',
    [sessionId]
  );
}

/**
 * Get the active debug session for a player
 * @param {number} playerId - The player's ID
 * @returns {Promise<object|null>} The active session or null
 */
async function getActiveDebugSession(playerId) {
  return getOne(
    'SELECT * FROM debug_sessions WHERE player_id = $1 AND active = TRUE ORDER BY started_at DESC LIMIT 1',
    [playerId]
  );
}

/**
 * Get a debug session by ID
 * @param {number} sessionId - The session ID
 * @returns {Promise<object|null>} The session or null
 */
async function getDebugSessionById(sessionId) {
  return getOne('SELECT * FROM debug_sessions WHERE id = $1', [sessionId]);
}

/**
 * Create a debug todo from ZORK's bug analysis
 * @param {object} params - Todo parameters
 * @returns {Promise<object>} The created todo
 */
async function createDebugTodo({ sessionId, title, description, reproSteps, environment, logs, createdBy = 'zork', ticketType = 'bug', priority = 2, playerId = null, playerName = null }) {
  // Validate priority
  if (priority < 1 || priority > 4) {
    throw new Error(`Invalid priority: ${priority}. Must be between 1 and 4.`);
  }
  
  // Validate ticket type
  const validTypes = ['bug', 'feature', 'debug'];
  if (!validTypes.includes(ticketType)) {
    throw new Error(`Invalid ticket_type: ${ticketType}. Must be one of: ${validTypes.join(', ')}`);
  }
  
  const result = await query(
    `INSERT INTO debug_todos 
     (session_id, title, description, repro_steps, environment, logs, created_by, ticket_type, priority, player_id, player_name) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
     RETURNING *`,
    [sessionId, title, description, reproSteps, JSON.stringify(environment || {}), JSON.stringify(logs || {}), createdBy, ticketType, priority, playerId, playerName]
  );
  return result.rows[0];
}

/**
 * List debug todos filtered by status
 * @param {object} options - Filter options
 * @returns {Promise<Array>} List of todos
 */
async function listDebugTodos({ status = null, limit = 50, includeDeleted = false } = {}) {
  let sql = 'SELECT * FROM debug_todos';
  const params = [];
  const conditions = [];
  
  // Filter out deleted tickets by default
  if (!includeDeleted) {
    conditions.push("status != 'deleted'");
  }
  
  if (status) {
    conditions.push('status = $' + (conditions.length + 1));
    params.push(status);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' ORDER BY created_at DESC';
  
  if (limit) {
    sql += ` LIMIT $${params.length + 1}`;
    params.push(limit);
  }
  
  return getAll(sql, params);
}

/**
 * Get a debug todo by ID
 * @param {number} id - The todo ID
 * @returns {Promise<object|null>} The todo or null
 */
async function getDebugTodo(id) {
  return getOne('SELECT * FROM debug_todos WHERE id = $1', [id]);
}

/**
 * Update a debug todo (status, resolution notes)
 * @param {number} id - The todo ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object|null>} The updated todo
 */
async function updateDebugTodo(id, { status, resolutionNotes, title, description, priority, tags, ticketType }) {
  const updates = [];
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    // Validate status
    const validStatuses = ['open', 'backlog', 'in_progress', 'resolved', 'deleted'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    updates.push(`status = $${paramIndex++}`);
    params.push(status);
  }
  
  if (resolutionNotes !== undefined) {
    updates.push(`resolution_notes = $${paramIndex++}`);
    params.push(resolutionNotes);
  }
  
  if (title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    params.push(title);
  }
  
  if (description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(description);
  }
  
  if (priority !== undefined) {
    // Validate priority (1-4)
    if (priority < 1 || priority > 4) {
      throw new Error(`Invalid priority: ${priority}. Must be between 1 and 4.`);
    }
    updates.push(`priority = $${paramIndex++}`);
    params.push(priority);
  }
  
  if (tags !== undefined) {
    updates.push(`tags = $${paramIndex++}`);
    params.push(JSON.stringify(tags));
  }
  
  if (ticketType !== undefined) {
    // Validate ticket type
    const validTypes = ['bug', 'feature', 'debug'];
    if (!validTypes.includes(ticketType)) {
      throw new Error(`Invalid ticket_type: ${ticketType}. Must be one of: ${validTypes.join(', ')}`);
    }
    updates.push(`ticket_type = $${paramIndex++}`);
    params.push(ticketType);
  }
  
  updates.push(`updated_at = NOW()`);
  
  if (updates.length === 1) {
    // Only updated_at, nothing else to update
    return getDebugTodo(id);
  }
  
  params.push(id);
  const sql = `UPDATE debug_todos SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
  
  const result = await query(sql, params);
  return result.rows[0] || null;
}

/**
 * Get debug todos with session info (joined)
 * @param {object} options - Filter options
 * @returns {Promise<Array>} List of todos with session info
 */
async function getDebugTodosWithSession({ status = null, limit = 50 } = {}) {
  let sql = `
    SELECT dt.*, ds.player_id, ds.bug_label, ds.started_at as session_started, p.name as player_name
    FROM debug_todos dt
    LEFT JOIN debug_sessions ds ON dt.session_id = ds.id
    LEFT JOIN players p ON ds.player_id = p.id
  `;
  const params = [];
  
  if (status) {
    sql += ' WHERE dt.status = $1';
    params.push(status);
  }
  
  sql += ' ORDER BY dt.created_at DESC';
  
  if (limit) {
    sql += ` LIMIT $${params.length + 1}`;
    params.push(limit);
  }
  
  return getAll(sql, params);
}

/**
 * Get open tickets ordered by priority
 * @param {object} options - Filter options
 * @returns {Promise<Array>} List of open tickets
 */
async function getOpenTickets({ limit = 50, priority = null, ticketType = null } = {}) {
  let sql = `
    SELECT dt.*, ds.player_id, ds.bug_label, p.name as player_name
    FROM debug_todos dt
    LEFT JOIN debug_sessions ds ON dt.session_id = ds.id
    LEFT JOIN players p ON ds.player_id = p.id
    WHERE dt.status = 'open'
  `;
  const params = [];
  let paramIndex = 1;
  
  if (priority !== null) {
    sql += ` AND dt.priority = $${paramIndex++}`;
    params.push(priority);
  }
  
  if (ticketType) {
    sql += ` AND dt.ticket_type = $${paramIndex++}`;
    params.push(ticketType);
  }
  
  sql += ' ORDER BY dt.priority DESC, dt.created_at ASC';
  
  if (limit) {
    sql += ` LIMIT $${paramIndex++}`;
    params.push(limit);
  }
  
  return getAll(sql, params);
}

/**
 * Update ticket priority
 * @param {number} id - Ticket ID
 * @param {number} priority - New priority (1-4)
 * @returns {Promise<object|null>} Updated ticket
 */
async function updateTicketPriority(id, priority) {
  if (priority < 1 || priority > 4) {
    throw new Error('Priority must be between 1 and 4');
  }
  
  const result = await query(
    'UPDATE debug_todos SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [priority, id]
  );
  return result.rows[0] || null;
}

/**
 * Add tag to ticket
 * @param {number} id - Ticket ID
 * @param {string} tag - Tag to add
 * @returns {Promise<object|null>} Updated ticket
 */
async function addTicketTag(id, tag) {
  // Get current tags
  const ticket = await getDebugTodo(id);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  // Handle JSONB (already an array) or JSON string
  let currentTags = ticket.tags || [];
  if (typeof currentTags === 'string') {
    try {
      currentTags = currentTags.length > 0 ? JSON.parse(currentTags) : [];
    } catch (e) {
      currentTags = [];
    }
  } else if (!Array.isArray(currentTags)) {
    // If it's not a string and not an array, default to empty array
    currentTags = [];
  }
  
  // Add tag if not already present
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
  }
  
  const result = await query(
    'UPDATE debug_todos SET tags = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [JSON.stringify(currentTags), id]
  );
  return result.rows[0] || null;
}

// ============================================================
// Automation Program Functions
// ============================================================

/**
 * Get all active automation programs
 * @returns {Promise<Array>} List of active automation programs
 */
async function getActiveAutomationPrograms() {
  return getAll(
    `SELECT id, player_id, name, description, is_active, execution_state, created_at, updated_at
     FROM automation_programs
     WHERE is_active = TRUE
     ORDER BY created_at ASC`
  );
}

/**
 * Get automation steps for a program
 * @param {number} programId - The program ID
 * @returns {Promise<Array>} List of steps ordered by step_order
 */
async function getAutomationStepsByProgramId(programId) {
  return getAll(
    `SELECT id, program_id, step_order, instruction_type, instruction_config, conditions,
            loop_target_step, loop_max_iterations, created_at
     FROM automation_steps
     WHERE program_id = $1
     ORDER BY step_order ASC`,
    [programId]
  );
}

/**
 * Update an automation program
 * @param {number} id - The program ID
 * @param {string|null} name - New name (optional)
 * @param {string|null} description - New description (optional)
 * @param {boolean|null} isActive - New active status (optional)
 * @param {object|null} executionState - New execution state (optional)
 * @returns {Promise<object|null>} Updated program or null
 */
async function updateAutomationProgram(id, name, description, isActive, executionState) {
  const updates = [];
  const params = [];
  let paramIndex = 1;
  
  if (name !== null && name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(name);
  }
  
  if (description !== null && description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(description);
  }
  
  if (isActive !== null && isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    params.push(isActive);
  }
  
  if (executionState !== null && executionState !== undefined) {
    updates.push(`execution_state = $${paramIndex++}`);
    params.push(typeof executionState === 'string' ? executionState : JSON.stringify(executionState));
  }
  
  if (updates.length === 0) {
    // No updates, just return the current program
    return getOne('SELECT * FROM automation_programs WHERE id = $1', [id]);
  }
  
  updates.push(`updated_at = NOW()`);
  params.push(id);
  
  const sql = `UPDATE automation_programs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
  const result = await query(sql, params);
  return result.rows[0] || null;
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
  createPlayer,
  getAllPlayers,
  getPlayersInRoom,
  updatePlayerRoom,
  updatePlayer,
  updatePlayerVitalis,
  addPulseEchoes,
  updatePulseEchoTier,
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
  
  // Lore Keepers
  getLoreKeeperByNpcId,
  getLoreKeepersInRoom,
  getMerchantByNpcId,
  createLoreKeeper,
  updateLoreKeeper,
  deleteLoreKeeperByNpcId,
  hasPlayerBeenGreetedByLoreKeeper,
  markPlayerGreetedByLoreKeeper,
  getGreetedLoreKeepersForPlayer,
  hasPlayerBeenAwardedItemByLoreKeeper,
  recordLoreKeeperItemAward,
  getLastLoreKeeperItemAwardTime,
  
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
  getAllRoomTypes,
  
  // Item Types
  getAllItemTypes,
  
  // Warehouse Rooms
  getWarehouseRooms,
  
  // Merchant Items
  getMerchantRooms,
  getMerchantItems,
  addItemToMerchant,
  updateMerchantItem,
  updateMerchantItemFromConfig,
  removeItemFromMerchant,
  getMerchantItemsForRoom,
  getMerchantItemsForList,
  
  // Room Items
  getRoomItems,
  addRoomItem,
  removeRoomItem,
  removePoofableItemsFromRoom,
  
  // Player Items
  getPlayerItems,
  addPlayerItem,
  removePlayerItem,
  getPlayerCurrentEncumbrance,
  
  // Warehouse
  getWarehouseItems,
  addWarehouseItem,
  removeWarehouseItem,
  getPlayerWarehouseCapacity,
  initializePlayerWarehouse,
  getWarehouseItemTypeCount,
  getWarehouseItemQuantity,
  hasPlayerWarehouseDeed,
  checkWarehouseAccess,
  getPlayerWarehouseDeeds,
  getAllPlayerWarehouseDeeds,
  
  // Player Bank
  getPlayerBank,
  depositCurrency,
  withdrawCurrency,
  getPlayerBankBalance,
  convertCurrencyToOptimal,
  getPlayerCurrency,
  removePlayerCurrency,
  addPlayerCurrency,
  
  // Accounts
  createAccount,
  getAccountByEmail,
  getAccountById,
  updateLastLogin,
  getUserCharacters,
  addCharacterToAccount,
  removeCharacterFromAccount,
  isAccountWithinGracePeriod,
  getDaysRemainingForVerification,
  
  // Email Verification
  createEmailVerificationToken,
  getEmailVerificationToken,
  markEmailVerificationTokenUsed,
  verifyAccountEmail,
  
  // Password Reset
  createPasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  updateAccountPassword,
  
  // Terminal History
  saveTerminalMessage,
  getTerminalHistory,
  clearTerminalHistory,
  
  // Stat and Ability Metadata
  getStatMetadata,
  getAbilityMetadata,
  getAllStatMetadata,
  getAllAbilityMetadata,
  
  // Harvest Formula Config
  getHarvestFormulaConfig,
  getAllHarvestFormulaConfigs,
  updateHarvestFormulaConfig,
  
  // Markup
  getAllMarkupConventions,
  getMarkupConventionById,
  createMarkupConvention,
  updateMarkupConvention,
  deleteMarkupConvention,
  getBuiltInConventionEdits,
  getBuiltInConventionEdit,
  upsertBuiltInConventionEdit,
  
  // Widget Config
  getPlayerWidgetConfig,
  updatePlayerWidgetConfig,
  
  // Paths and Loops
  createPath,
  getPathsByPlayerAndMap,
  getAllPathsByPlayer,
  getPathById,
  getPathSteps,
  deletePath,
  
  // Game Messages
  getGameMessage,
  getAllGameMessages,
  updateGameMessage,
  
  // ZORK Knowledge Base
  addZorkKnowledge,
  updateZorkKnowledge,
  searchZorkKnowledge,
  getZorkKnowledgeByCategory,
  getZorkKnowledgeById,
  getAlwaysIncludeKnowledge,
  deleteZorkKnowledge,
  
  // Debug Observer System
  startDebugSession,
  endDebugSession,
  getActiveDebugSession,
  getDebugSessionById,
  createDebugTodo,
  listDebugTodos,
  getDebugTodo,
  updateDebugTodo,
  getDebugTodosWithSession,
  
  // Ticket System
  getOpenTickets,
  updateTicketPriority,
  addTicketTag,
  
  // Factory Recipes
  getFactoryRecipes,
  getFactoryRecipeById,
  getFactoryRecipeByName,
  createFactoryRecipe,
  updateFactoryRecipe,
  deleteFactoryRecipe,
  
  // Factory Events
  logFactoryEvent,
  getFactoryEvents,
  
  // Automation Programs
  getActiveAutomationPrograms,
  getAutomationStepsByProgramId,
  updateAutomationProgram
};
