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
    puzzle_award_delay_response = null
  } = npc;

  const result = await query(
    `INSERT INTO scriptable_npcs (name, description, npc_type, base_cycle_time, difficulty, required_stats, required_buffs, input_items, output_items, failure_states, display_color, puzzle_type, puzzle_glow_clues, puzzle_extraction_pattern, puzzle_solution_word, puzzle_success_response, puzzle_failure_response, puzzle_reward_item, puzzle_hint_responses, puzzle_followup_responses, puzzle_incorrect_attempt_responses, puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response, scriptable, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, TRUE, TRUE) RETURNING id`,
    [name, description || '', npc_type, base_cycle_time, difficulty, required_stats, required_buffs, input_items, output_items, failure_states, display_color, puzzle_type, puzzle_glow_clues, puzzle_extraction_pattern, puzzle_solution_word, puzzle_success_response, puzzle_failure_response, puzzle_reward_item, puzzle_hint_responses, puzzle_followup_responses, puzzle_incorrect_attempt_responses, puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response]
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
    puzzle_award_delay_response = null
  } = npc;

  await query(
    `UPDATE scriptable_npcs SET
      name = $1, description = $2, npc_type = $3, base_cycle_time = $4, difficulty = $5,
      required_stats = $6, required_buffs = $7, input_items = $8, output_items = $9,
      failure_states = $10, display_color = $11, active = $12,
      puzzle_type = $13, puzzle_glow_clues = $14, puzzle_extraction_pattern = $15,
      puzzle_solution_word = $16, puzzle_success_response = $17, puzzle_failure_response = $18,
      puzzle_reward_item = $19, puzzle_hint_responses = $20, puzzle_followup_responses = $21,
      puzzle_incorrect_attempt_responses = $22, puzzle_award_once_only = $23, puzzle_award_after_delay = $24,
      puzzle_award_delay_seconds = $25, puzzle_award_delay_response = $26
     WHERE id = $27`,
    [name, description || '', npc_type, base_cycle_time, difficulty, required_stats, required_buffs, input_items, output_items, failure_states, display_color, active, puzzle_type, puzzle_glow_clues, puzzle_extraction_pattern, puzzle_solution_word, puzzle_success_response, puzzle_failure_response, puzzle_reward_item, puzzle_hint_responses, puzzle_followup_responses, puzzle_incorrect_attempt_responses, puzzle_award_once_only, puzzle_award_after_delay, puzzle_award_delay_seconds, puzzle_award_delay_response, id]
  );
}

async function getNPCsInRoom(roomId) {
  const rows = await getAll(
    `SELECT rn.id, rn.npc_id, rn.state, rn.slot,
            sn.name, sn.description, sn.display_color, sn.harvestable_time, sn.cooldown_time,
            sn.puzzle_type, sn.puzzle_glow_clues, sn.puzzle_extraction_pattern,
            sn.puzzle_solution_word, sn.puzzle_success_response, sn.puzzle_failure_response,
            sn.puzzle_reward_item, sn.puzzle_hint_responses, sn.puzzle_followup_responses,
            sn.puzzle_incorrect_attempt_responses, sn.puzzle_award_once_only, sn.puzzle_award_after_delay,
            sn.puzzle_award_delay_seconds, sn.puzzle_award_delay_response
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
    cooldownTime: row.cooldown_time || 120000,
    puzzleType: row.puzzle_type || 'none',
    puzzleGlowClues: row.puzzle_glow_clues ? JSON.parse(row.puzzle_glow_clues) : null,
    puzzleExtractionPattern: row.puzzle_extraction_pattern ? JSON.parse(row.puzzle_extraction_pattern) : null,
    puzzleSolutionWord: row.puzzle_solution_word,
    puzzleSuccessResponse: row.puzzle_success_response,
    puzzleFailureResponse: row.puzzle_failure_response,
    puzzleRewardItem: row.puzzle_reward_item,
    puzzleHintResponses: row.puzzle_hint_responses ? JSON.parse(row.puzzle_hint_responses) : null,
    puzzleFollowupResponses: row.puzzle_followup_responses ? JSON.parse(row.puzzle_followup_responses) : null,
    puzzleIncorrectAttemptResponses: row.puzzle_incorrect_attempt_responses ? JSON.parse(row.puzzle_incorrect_attempt_responses) : null,
    puzzleAwardOnceOnly: row.puzzle_award_once_only || false,
    puzzleAwardAfterDelay: row.puzzle_award_after_delay || false,
    puzzleAwardDelaySeconds: row.puzzle_award_delay_seconds,
    puzzleAwardDelayResponse: row.puzzle_award_delay_response
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
    keywordsResponses: row.keywords_responses ? JSON.parse(row.keywords_responses) : {},
    keywordColor: row.keyword_color,
    incorrectResponse: row.incorrect_response,
    puzzleMode: row.puzzle_mode,
    puzzleClues: row.puzzle_clues ? JSON.parse(row.puzzle_clues) : [],
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
     deed_warehouse_location_key, deed_base_max_item_types, deed_max_total_items, deed_automation_enabled, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
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
      Date.now()
    ]
  );
  return getItemById(result.rows[0].id);
}

async function updateItem(item) {
  await query(
    `UPDATE items SET name = $1, description = $2, item_type = $3, active = $4, poofable = $5, encumbrance = $6,
     deed_warehouse_location_key = $8, deed_base_max_item_types = $9, deed_max_total_items = $10, deed_automation_enabled = $11
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
      item.deed_automation_enabled || false
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
// Warehouse Functions
// ============================================================

async function getWarehouseItems(playerId, warehouseLocationKey) {
  return getAll(
    'SELECT item_name, quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 ORDER BY item_name',
    [playerId, warehouseLocationKey]
  );
}

async function addWarehouseItem(playerId, warehouseLocationKey, itemName, quantity) {
  const existing = await getOne(
    'SELECT id, quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 AND item_name = $3',
    [playerId, warehouseLocationKey, itemName]
  );
  
  if (existing) {
    await query(
      'UPDATE warehouse_items SET quantity = quantity + $1 WHERE id = $2',
      [quantity, existing.id]
    );
  } else {
    await query(
      'INSERT INTO warehouse_items (player_id, warehouse_location_key, item_name, quantity, created_at) VALUES ($1, $2, $3, $4, $5)',
      [playerId, warehouseLocationKey, itemName, quantity, Date.now()]
    );
  }
}

async function removeWarehouseItem(playerId, warehouseLocationKey, itemName, quantity) {
  const existing = await getOne(
    'SELECT id, quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 AND item_name = $3',
    [playerId, warehouseLocationKey, itemName]
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
    'SELECT COUNT(DISTINCT item_name) as count FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2',
    [playerId, warehouseLocationKey]
  );
  return result ? parseInt(result.count) : 0;
}

async function getWarehouseItemQuantity(playerId, warehouseLocationKey, itemName) {
  const result = await getOne(
    'SELECT quantity FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2 AND item_name = $3',
    [playerId, warehouseLocationKey, itemName]
  );
  return result ? parseInt(result.quantity) : 0;
}

async function hasPlayerWarehouseDeed(playerId) {
  // Check if player has any deed items in inventory
  const playerItems = await getPlayerItems(playerId);
  
  for (const item of playerItems) {
    const itemDef = await getItemByName(item.item_name);
    if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key) {
      return true;
    }
  }
  
  return false;
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
  
  // Lore Keepers
  getLoreKeeperByNpcId,
  getLoreKeepersInRoom,
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
  removeCharacterFromAccount
};
