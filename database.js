const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'game.db'));

// Create maps table
db.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    description TEXT
  )
`);

// Create rooms table with coordinate-based map and map_id
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    map_id INTEGER NOT NULL,
    connected_map_id INTEGER,
    connected_room_x INTEGER,
    connected_room_y INTEGER,
    connection_direction TEXT,
    UNIQUE(map_id, x, y),
    FOREIGN KEY (map_id) REFERENCES maps(id),
    FOREIGN KEY (connected_map_id) REFERENCES maps(id)
  )
`);

// Create players table with prefix-based column naming
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    current_room_id INTEGER NOT NULL,
    stat_brute_strength INTEGER DEFAULT 10,
    stat_life_force INTEGER DEFAULT 10,
    stat_cunning INTEGER DEFAULT 10,
    stat_intelligence INTEGER DEFAULT 10,
    stat_wisdom INTEGER DEFAULT 10,
    ability_crafting INTEGER DEFAULT 0,
    ability_lockpicking INTEGER DEFAULT 0,
    ability_stealth INTEGER DEFAULT 0,
    ability_dodge INTEGER DEFAULT 0,
    ability_critical_hit INTEGER DEFAULT 0,
    resource_hit_points INTEGER DEFAULT 50,
    resource_max_hit_points INTEGER DEFAULT 50,
    resource_mana INTEGER DEFAULT 0,
    resource_max_mana INTEGER DEFAULT 0,
    FOREIGN KEY (current_room_id) REFERENCES rooms(id)
  )
`);

// Create scriptable_npcs table (Glowroot Region)
db.exec(`
  CREATE TABLE IF NOT EXISTS scriptable_npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    npc_type TEXT NOT NULL,
    base_cycle_time INTEGER NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 1,
    required_stats TEXT,
    required_buffs TEXT,
    input_items TEXT,
    output_items TEXT,
    failure_states TEXT,
    display_color TEXT,
    scriptable BOOLEAN NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT 1
  )
`);

// Ensure NPC names are unique to prevent duplicate seed inserts
// Run a cleanup pass first to merge duplicates, then create the unique index.
try {
  // Function is declared later in this file; function declarations are hoisted.
  if (typeof cleanupDuplicateScriptableNPCs === 'function') {
    cleanupDuplicateScriptableNPCs();
  }
} catch (err) {
  console.error('Error during pre-index NPC cleanup:', err.message);
}

try {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scriptable_npcs_name ON scriptable_npcs(name)
  `);
} catch (err) {
  // If duplicates somehow still exist, don't crash the server;
  // the cleanup function (and UNIQUE index) will be relied on in subsequent runs.
  if (!err.message.includes('UNIQUE') || !err.message.includes('scriptable_npcs.name')) {
    throw err;
  }
  console.error('Could not create unique index on scriptable_npcs.name due to existing duplicates:', err.message);
}

// Create room_npcs table (NPCs placed in rooms)
db.exec(`
  CREATE TABLE IF NOT EXISTS room_npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    state TEXT DEFAULT '{}',
    last_cycle_run INTEGER DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT 1,
    slot INTEGER NOT NULL DEFAULT 0,
    spawn_rules TEXT,
    FOREIGN KEY (npc_id) REFERENCES scriptable_npcs(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )
`);

// Create indexes for room_npcs
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_room_npcs_room_id ON room_npcs(room_id)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_room_npcs_npc_id ON room_npcs(npc_id)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_room_npcs_active ON room_npcs(active)
`);

// Create room_items table (items on the ground in rooms, shared among players)
db.exec(`
  CREATE TABLE IF NOT EXISTS room_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_room_items_room_id ON room_items(room_id)
`);

// Create player_items table (player inventory, no weight limit for now)
db.exec(`
  CREATE TABLE IF NOT EXISTS player_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id)
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_player_items_player_id ON player_items(player_id)
`);

// Add new columns to existing table if they don't exist (for migration)
const addColumnIfNotExists = (tableName, columnName, defaultValue, columnType = 'INTEGER') => {
  try {
    if (defaultValue !== null && defaultValue !== undefined) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} DEFAULT ${defaultValue}`);
    } else {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }
  } catch (err) {
    // Column already exists, ignore error
    if (!err.message.includes('duplicate column name')) {
      throw err;
    }
  }
};

// Migrate existing players table (add new prefixed columns if they don't exist)
// Migration function will handle renaming old columns
addColumnIfNotExists('players', 'stat_brute_strength', 10);
addColumnIfNotExists('players', 'stat_life_force', 10);
addColumnIfNotExists('players', 'stat_cunning', 10);
addColumnIfNotExists('players', 'stat_intelligence', 10);
addColumnIfNotExists('players', 'stat_wisdom', 10);
addColumnIfNotExists('players', 'ability_crafting', 0);
addColumnIfNotExists('players', 'ability_lockpicking', 0);
addColumnIfNotExists('players', 'ability_stealth', 0);
addColumnIfNotExists('players', 'ability_dodge', 0);
addColumnIfNotExists('players', 'ability_critical_hit', 0);
addColumnIfNotExists('players', 'resource_hit_points', 50);
addColumnIfNotExists('players', 'resource_max_hit_points', 50);
addColumnIfNotExists('players', 'resource_mana', 0);
addColumnIfNotExists('players', 'resource_max_mana', 0);
addColumnIfNotExists('players', 'flag_god_mode', 0);

// Migration: add display_color to scriptable_npcs if missing
addColumnIfNotExists('scriptable_npcs', 'display_color', "'#00ff00'", 'TEXT');

// Migrate existing rooms table to include map_id and connection fields
addColumnIfNotExists('rooms', 'map_id', 1);
addColumnIfNotExists('rooms', 'connected_map_id', null);
addColumnIfNotExists('rooms', 'connected_room_x', null);
addColumnIfNotExists('rooms', 'connected_room_y', null);
addColumnIfNotExists('rooms', 'connection_direction', null, 'TEXT');
addColumnIfNotExists('rooms', 'room_type', 'normal', 'TEXT');

// Migration: Clean up unwanted rooms (district rooms, etc.)
function cleanupRooms() {
  const MAP_SIZE = 20;
  const MAP_HALF = Math.floor(MAP_SIZE / 2); // 10
  
  // Get town square room ID (safe room to move players to)
  const getTownSquare = db.prepare('SELECT id FROM rooms WHERE name = ? AND map_id = ?');
  const newhaven = getMapByNameStmt.get('Newhaven');
  if (!newhaven) return;
  
  const townSquare = getTownSquare.get('town square', newhaven.id);
  
  // If town square doesn't exist yet, skip cleanup (will be created below)
  if (!townSquare) {
    return;
  }
  
  // Move any players in rooms we're about to delete to town square (only for Newhaven map)
  const movePlayersFromInvalidRooms = db.prepare(`
    UPDATE players 
    SET current_room_id = ? 
    WHERE current_room_id IN (
      SELECT id FROM rooms 
      WHERE map_id = ? AND NOT (
        x = ? OR x = ? OR y = ? OR y = ? OR x = 0
      )
    )
  `);
  
  movePlayersFromInvalidRooms.run(townSquare.id, newhaven.id, -MAP_HALF, MAP_HALF - 1, -MAP_HALF, MAP_HALF - 1);
  
  // Now delete all rooms that are NOT on perimeter or center street (only for Newhaven map)
  const deleteInvalidRooms = db.prepare(`
    DELETE FROM rooms 
    WHERE map_id = ? AND NOT (
      x = ? OR x = ? OR y = ? OR y = ? OR x = 0
    )
  `);
  
  deleteInvalidRooms.run(newhaven.id, -MAP_HALF, MAP_HALF - 1, -MAP_HALF, MAP_HALF - 1);
  
  console.log('Cleaned up invalid rooms');
}

// Insert maps if they don't exist
const insertMap = db.prepare(`
  INSERT OR IGNORE INTO maps (name, width, height, description) 
  VALUES (?, ?, ?, ?)
`);

insertMap.run('Newhaven', 20, 20, 'The main town of Newhaven, a bustling settlement with well-organized streets.');
insertMap.run('Northern Territory', 10, 10, 'The wild Northern Territory, a rugged landscape north of Newhaven.');

// Get map IDs (prepare statements for reuse)
const getMapByNameStmt = db.prepare('SELECT * FROM maps WHERE name = ?');
const getMapByIdStmt = db.prepare('SELECT * FROM maps WHERE id = ?');
const newhavenMap = getMapByNameStmt.get('Newhaven');
const northernTerritoryMap = getMapByNameStmt.get('Northern Territory');

// Insert initial rooms if they don't exist
const insertRoom = db.prepare(`
  INSERT OR IGNORE INTO rooms (name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Map size: 20x20 grid, centered at (0,0)
// Coordinates range from -10 to +9 in both directions
const MAP_SIZE = 20;
const MAP_HALF = Math.floor(MAP_SIZE / 2); // 10

// Run cleanup on database initialization (after we have town square)
// Note: cleanup will only run if town square exists, otherwise it's skipped
// and will run on next server start after rooms are created

// Create only perimeter and center vertical road
// Perimeter: outer square (20x20)
// Center Street: vertical road down the middle (x = 0)

// Create perimeter rooms for Newhaven (map_id = 1)
for (let coord = -MAP_HALF; coord < MAP_HALF; coord++) {
  // Westwall Street (x = -10)
  insertRoom.run(
    `westwall street ${coord + MAP_HALF + 1}`,
    `You stand on Westwall Street, the western boundary of the town. The street runs north to south along the outer wall. Buildings line the eastern side, while the western side opens to the wilderness beyond.`,
    -MAP_HALF,
    coord,
    newhavenMap.id,
    null, null, null, null
  );
  
  // Eastwall Street (x = 9)
  insertRoom.run(
    `eastwall street ${coord + MAP_HALF + 1}`,
    `You stand on Eastwall Street, the eastern boundary of the town. The street runs north to south along the outer wall. Buildings line the western side, while the eastern side opens to the wilderness beyond.`,
    MAP_HALF - 1,
    coord,
    newhavenMap.id,
    null, null, null, null
  );
  
  // South Street (y = -10)
  insertRoom.run(
    `south street ${coord + MAP_HALF + 1}`,
    `You stand on South Street, the southern boundary of the town. The street runs east to west along the outer wall. Buildings line the northern side, while the southern side opens to the wilderness beyond.`,
    coord,
    -MAP_HALF,
    newhavenMap.id,
    null, null, null, null
  );
  
  // North Street (y = 9) - Check if this is the connection point (north street 11 = coord=0, y=9)
  // north street 11 means coord + MAP_HALF + 1 = 11, so coord = 0
  const isConnectionPoint = (coord === 0);
  insertRoom.run(
    `north street ${coord + MAP_HALF + 1}`,
    `You stand on North Street, the northern boundary of the town. The street runs east to west along the outer wall. Buildings line the southern side, while the northern side opens to the wilderness beyond.${isConnectionPoint ? ' A path leads north into the Northern Territory.' : ''}`,
    coord,
    MAP_HALF - 1,
    newhavenMap.id,
    isConnectionPoint ? northernTerritoryMap.id : null,
    isConnectionPoint ? 0 : null, // Connected to center of Northern Territory's south edge
    isConnectionPoint ? -5 : null, // y = -5 in Northern Territory (south edge)
    isConnectionPoint ? 'N' : null
  );
}

// Create Center Street (vertical road, x = 0)
for (let y = -MAP_HALF; y < MAP_HALF; y++) {
  // Skip corners (already created as perimeter)
  if (y === -MAP_HALF || y === MAP_HALF - 1) continue;
  
  // Existing special rooms (keep their original names and descriptions)
  if (y === 0) {
    insertRoom.run(
      'town square',
      'You stand in the center of a bustling town square. Cobblestone paths radiate outward from a weathered stone fountain in the center. Market stalls line the edges, though they appear empty at this hour. The air carries the faint scent of fresh bread and distant woodsmoke. Center Street continues north and south from here.',
      0,
      y,
      newhavenMap.id,
      null, null, null, null
    );
  } else if (y === 1) {
    insertRoom.run(
      'northern room',
      'You find yourself in a quiet northern chamber. The walls are made of smooth, dark stone that seems to absorb the light. A single torch flickers in a sconce, casting dancing shadows across the floor. The room feels ancient and peaceful, with a sense of history embedded in its very stones. Center Street continues north and south.',
      0,
      y,
      newhavenMap.id,
      null, null, null, null
    );
  } else if (y === -1) {
    insertRoom.run(
      'southern room',
      'You enter a warm southern chamber. The room is bathed in soft golden light from a large window facing south. Comfortable furnishings suggest this was once a gathering place. The air is still and calm, with dust motes drifting lazily in the light. Center Street continues north and south.',
      0,
      y,
      newhavenMap.id,
      null, null, null, null
    );
  } else {
    // Regular Center Street rooms
    insertRoom.run(
      `center street ${y > 0 ? 'north' : 'south'} ${Math.abs(y)}`,
      `You walk along Center Street, the main north-south thoroughfare. The wide cobblestone road is well-maintained, with shops and buildings lining both sides. The street continues to the north and south.`,
      0,
      y,
      newhavenMap.id,
      null, null, null, null
    );
  }
}

// Create Northern Territory map (10x10)
const NT_MAP_SIZE = 10;
const NT_MAP_HALF = Math.floor(NT_MAP_SIZE / 2); // 5

// Create perimeter rooms for Northern Territory (map_id = 2)
for (let coord = -NT_MAP_HALF; coord < NT_MAP_HALF; coord++) {
  // Westwall Street (x = -5)
  insertRoom.run(
    `westwall street ${coord + NT_MAP_HALF + 1}`,
    `You stand on Westwall Street in the Northern Territory. The rugged terrain stretches to the west, while the street runs north to south along the settlement's edge.`,
    -NT_MAP_HALF,
    coord,
    northernTerritoryMap.id,
    null, null, null, null
  );
  
  // Eastwall Street (x = 4)
  insertRoom.run(
    `eastwall street ${coord + NT_MAP_HALF + 1}`,
    `You stand on Eastwall Street in the Northern Territory. The wild landscape extends to the east, while the street runs north to south along the settlement's edge.`,
    NT_MAP_HALF - 1,
    coord,
    northernTerritoryMap.id,
    null, null, null, null
  );
  
  // South Street (y = -5) - Connection point to Newhaven
  const isSouthConnection = (coord === 0);
  // For the connection room (coord === 0), ensure it's created with connection info
  if (isSouthConnection) {
    // Use a direct INSERT that will update if exists
    try {
      db.prepare(`
        INSERT INTO rooms (name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `south street ${coord + NT_MAP_HALF + 1}`,
        `You stand on South Street in the Northern Territory. The street runs east to west along the southern boundary. A path leads south back to Newhaven.`,
        coord,
        -NT_MAP_HALF,
        northernTerritoryMap.id,
        newhavenMap.id,
        0, // Connected to north street 11 in Newhaven (x=0, y=9)
        9, // y = 9 in Newhaven
        'S'
      );
    } catch (err) {
      // Room might already exist, update it
      db.prepare(`
        UPDATE rooms 
        SET connected_map_id = ?, connected_room_x = ?, connected_room_y = ?, connection_direction = ?
        WHERE map_id = ? AND x = ? AND y = ?
      `).run(
        newhavenMap.id, 0, 9, 'S',
        northernTerritoryMap.id, coord, -NT_MAP_HALF
      );
    }
  } else {
    insertRoom.run(
      `south street ${coord + NT_MAP_HALF + 1}`,
      `You stand on South Street in the Northern Territory. The street runs east to west along the southern boundary.`,
      coord,
      -NT_MAP_HALF,
      northernTerritoryMap.id,
      null, null, null, null
    );
  }
  
  // North Street (y = 4) - Special case for intersection with Center Street
  const isNorthIntersection = (coord === 0);
  insertRoom.run(
    `north street ${coord + NT_MAP_HALF + 1}`,
    `You stand on North Street in the Northern Territory. The street runs east to west along the northern boundary.${isNorthIntersection ? ' Center Street continues south from here, connecting to the rest of the settlement.' : ''} The wild lands stretch endlessly to the north.`,
    coord,
    NT_MAP_HALF - 1,
    northernTerritoryMap.id,
    null, null, null, null
  );
}

// Create Center Street for Northern Territory (vertical road, x = 0)
for (let y = -NT_MAP_HALF; y < NT_MAP_HALF; y++) {
  // Skip corners (already created as perimeter)
  if (y === -NT_MAP_HALF || y === NT_MAP_HALF - 1) continue;
  
  insertRoom.run(
    `center street ${y > 0 ? 'north' : 'south'} ${Math.abs(y)}`,
    `You walk along Center Street in the Northern Territory. The road is rougher here than in Newhaven, with fewer buildings and more open space. The street continues to the north and south.`,
    0,
    y,
    northernTerritoryMap.id,
    null, null, null, null
  );
}

// Ensure North Street 6 in Northern Territory is properly connected
// This is the intersection of Center Street and North Street
if (northernTerritoryMap) {
  // First try to update if it exists
  const updateNorthStreet6 = db.prepare(`
    UPDATE rooms 
    SET description = ?
    WHERE map_id = ? AND x = ? AND y = ?
  `);
  const result = updateNorthStreet6.run(
    'You stand at the intersection of North Street and Center Street in the Northern Territory. North Street runs east to west along the northern boundary, while Center Street continues south, connecting to the rest of the settlement. The wild lands stretch endlessly to the north.',
    northernTerritoryMap.id,
    0,  // x = 0 (Center Street)
    4   // y = 4 (North Street, coord = 0, so 0 + 5 + 1 = 6)
  );
  
  // If room doesn't exist, create it
  if (result.changes === 0) {
    try {
      insertRoom.run(
        'north street 6',
        'You stand at the intersection of North Street and Center Street in the Northern Territory. North Street runs east to west along the northern boundary, while Center Street continues south, connecting to the rest of the settlement. The wild lands stretch endlessly to the north.',
        0,
        4,
        northernTerritoryMap.id,
        null, null, null, null
      );
      console.log('Created North Street 6 intersection room');
    } catch (err) {
      // Room might already exist, that's fine
      if (!err.message.includes('UNIQUE constraint')) {
        console.error('Error creating North Street 6:', err);
      }
    }
  } else {
    console.log('Updated North Street 6 to ensure proper connection');
  }
}

// Run cleanup after creating rooms (so town square exists)
cleanupRooms();

// Get town square room ID
const getTownSquare = db.prepare('SELECT id FROM rooms WHERE name = ?');
const townSquare = getTownSquare.get('town square');

// Insert initial players if they don't exist (using prefixed column names)
const insertPlayer = db.prepare(`
  INSERT OR IGNORE INTO players (
    name, current_room_id, 
    stat_brute_strength, stat_life_force, stat_cunning, stat_intelligence, stat_wisdom,
    ability_crafting, ability_lockpicking, ability_stealth, ability_dodge, ability_critical_hit,
    resource_hit_points, resource_max_hit_points, resource_mana, resource_max_mana
  ) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Update existing players with stats if they don't have them set
const updatePlayerStats = db.prepare(`
  UPDATE players SET
    stat_brute_strength = COALESCE(stat_brute_strength, 10),
    stat_life_force = COALESCE(stat_life_force, 10),
    stat_cunning = COALESCE(stat_cunning, 10),
    stat_intelligence = COALESCE(stat_intelligence, 10),
    stat_wisdom = COALESCE(stat_wisdom, 10),
    ability_crafting = COALESCE(ability_crafting, 0),
    ability_lockpicking = COALESCE(ability_lockpicking, 0),
    ability_stealth = COALESCE(ability_stealth, 0),
    ability_dodge = COALESCE(ability_dodge, 0),
    ability_critical_hit = COALESCE(ability_critical_hit, 0),
    resource_hit_points = COALESCE(resource_hit_points, 50),
    resource_max_hit_points = COALESCE(resource_max_hit_points, 50),
    resource_mana = COALESCE(resource_mana, 0),
    resource_max_mana = COALESCE(resource_max_mana, 0)
  WHERE name = ?
`);

// Set specific values for Fliz and Hebron
const setPlayerStats = db.prepare(`
  UPDATE players SET
    stat_brute_strength = ?, stat_life_force = ?, stat_cunning = ?, stat_intelligence = ?, stat_wisdom = ?,
    ability_crafting = ?, ability_lockpicking = ?, ability_stealth = ?, ability_dodge = ?, ability_critical_hit = ?,
    resource_hit_points = ?, resource_max_hit_points = ?, resource_mana = ?, resource_max_mana = ?
  WHERE name = ?
`);

// Fliz: 50/50 HP, 0 Mana (not a caster), god mode enabled
insertPlayer.run('Fliz', townSquare.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0);
setPlayerStats.run(10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0, 'Fliz');
// Set Fliz's flag_god_mode to 1
const setGodMode = db.prepare('UPDATE players SET flag_god_mode = ? WHERE name = ?');
setGodMode.run(1, 'Fliz');

// Hebron: 50/50 HP, 10/10 Mana
insertPlayer.run('Hebron', townSquare.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 10, 10);
setPlayerStats.run(10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 10, 10, 'Hebron');

// Scriptable NPC editor helpers (NPCs are now created/edited via NPC Editor UI)
const getAllScriptableNPCsStmt = db.prepare('SELECT * FROM scriptable_npcs ORDER BY id');
const getScriptableNPCByIdStmt = db.prepare('SELECT * FROM scriptable_npcs WHERE id = ?');

const createScriptableNPCStmt = db.prepare(`
  INSERT INTO scriptable_npcs (
    name,
    description,
    npc_type,
    base_cycle_time,
    difficulty,
    required_stats,
    required_buffs,
    input_items,
    output_items,
    failure_states,
    display_color,
    scriptable,
    active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
`);

const updateScriptableNPCStmt = db.prepare(`
  UPDATE scriptable_npcs SET
    name = ?,
    description = ?,
    npc_type = ?,
    base_cycle_time = ?,
    difficulty = ?,
    required_stats = ?,
    required_buffs = ?,
    input_items = ?,
    output_items = ?,
    failure_states = ?,
    display_color = ?,
    active = ?
  WHERE id = ?
`);

function getAllScriptableNPCs() {
  return getAllScriptableNPCsStmt.all();
}

function getScriptableNPCById(id) {
  return getScriptableNPCByIdStmt.get(id);
}

function createScriptableNPC(npc) {
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

  const result = createScriptableNPCStmt.run(
    name,
    description || '',
    npc_type,
    base_cycle_time,
    difficulty,
    required_stats || null,
    required_buffs || null,
    input_items || null,
    output_items || null,
    failure_states || null,
    display_color || '#00ff00'
  );

  return result.lastInsertRowid;
}

function updateScriptableNPC(npc) {
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
    active = 1
  } = npc;

  updateScriptableNPCStmt.run(
    name,
    description || '',
    npc_type,
    base_cycle_time,
    difficulty,
    required_stats || null,
    required_buffs || null,
    input_items || null,
    output_items || null,
    failure_states || null,
    display_color || '#00ff00',
    active ? 1 : 0,
    id
  );
}

// Spawn initial NPCs in Moonless Meadow rooms
try {
  const moonlessMeadowMap = getMapByNameStmt.get('Moonless Meadow');
  if (moonlessMeadowMap) {
    // Get all rooms from Moonless Meadow (use direct query since getRoomsByMap not yet defined)
    const getRoomsByMapTemp = db.prepare('SELECT * FROM rooms WHERE map_id = ?');
    const moonlessRooms = getRoomsByMapTemp.all(moonlessMeadowMap.id);
    
    // Get all NPCs from scriptable_npcs
    const getAllNPCsStmt = db.prepare('SELECT * FROM scriptable_npcs WHERE active = 1');
    const allNPCs = getAllNPCsStmt.all();
    
    // Spawn NPCs in a handful of rooms (3-5 rooms, distributing NPCs)
    const roomsToUse = moonlessRooms.slice(0, Math.min(5, moonlessRooms.length));
    
    if (roomsToUse.length > 0 && allNPCs.length > 0) {
      let npcIndex = 0;
      let slotCounter = 0;
      
      // Distribute NPCs across rooms
      for (let roomIndex = 0; roomIndex < roomsToUse.length && npcIndex < allNPCs.length; roomIndex++) {
        const room = roomsToUse[roomIndex];
        slotCounter = 0;
        
        // Place 2-3 NPCs per room (or until we run out)
        const npcsPerRoom = Math.min(3, Math.ceil(allNPCs.length / roomsToUse.length));
        for (let i = 0; i < npcsPerRoom && npcIndex < allNPCs.length; i++) {
          const npc = allNPCs[npcIndex];
          try {
            placeNPCInRoom(npc.id, room.id, slotCounter, { cycles: 0 });
            console.log(`Spawned ${npc.name} in room ${room.name} (${room.x}, ${room.y})`);
            slotCounter++;
            npcIndex++;
          } catch (err) {
            console.error(`Failed to spawn ${npc.name} in room ${room.id}:`, err.message);
            npcIndex++; // Skip this NPC and continue
          }
        }
      }
      
      console.log(`Spawned ${npcIndex} NPCs in Moonless Meadow`);
    } else {
      console.log('Moonless Meadow has no rooms or no NPCs available for spawning');
    }
  } else {
    console.log('Moonless Meadow map not found - skipping NPC spawning');
  }
} catch (err) {
  console.error('Error spawning initial NPCs:', err);
}

// Ensure the connection room exists in Northern Territory (south street 6 at x=0, y=-5)
const newhaven = getMapByNameStmt.get('Newhaven');
const northernTerritory = getMapByNameStmt.get('Northern Territory');
if (newhaven && northernTerritory) {
  // First try to update existing room
  const updateStmt = db.prepare(`
    UPDATE rooms 
    SET name = ?, description = ?, connected_map_id = ?, connected_room_x = ?, connected_room_y = ?, connection_direction = ?
    WHERE map_id = ? AND x = ? AND y = ?
  `);
  const updateResult = updateStmt.run(
    'south street 6',
    'You stand on South Street in the Northern Territory. The street runs east to west along the southern boundary. A path leads south back to Newhaven.',
    newhaven.id,
    0,
    9,
    'S',
    northernTerritory.id,
    0,
    -5
  );
  
  // If no room was updated, insert it
  if (updateResult.changes === 0) {
    db.prepare(`
      INSERT INTO rooms (name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'south street 6',
      'You stand on South Street in the Northern Territory. The street runs east to west along the southern boundary. A path leads south back to Newhaven.',
      0,
      -5,
      northernTerritory.id,
      newhaven.id,
      0,
      9,
      'S'
    );
    console.log('Created connection room: Northern Territory (0,-5)');
  } else {
    console.log('Updated connection room: Northern Territory (0,-5)');
  }
  
  // Ensure north street 6 exists at (0, 4) in Northern Territory
  // This is the intersection of North Street and Center Street
  const checkNorthStreet6 = db.prepare('SELECT id FROM rooms WHERE map_id = ? AND x = ? AND y = ?');
  const northStreet6 = checkNorthStreet6.get(northernTerritory.id, 0, 4);
  if (!northStreet6) {
    // Create the missing north street 6 room
    try {
      db.prepare(`
        INSERT INTO rooms (name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'north street 6',
        'You stand on North Street in the Northern Territory. The street runs east to west along the northern boundary. Center Street continues south from here, connecting to the rest of the settlement. The wild lands stretch endlessly to the north.',
        0,
        4,
        northernTerritory.id,
        null, null, null, null
      );
      console.log('Created North Street 6 intersection room');
    } catch (err) {
      // If it already exists with a different name, update it
      db.prepare(`
        UPDATE rooms 
        SET name = ?, description = ?
        WHERE map_id = ? AND x = ? AND y = ?
      `).run(
        'north street 6',
        'You stand on North Street in the Northern Territory. The street runs east to west along the northern boundary. Center Street continues south from here, connecting to the rest of the settlement. The wild lands stretch endlessly to the north.',
        northernTerritory.id, 0, 4
      );
      console.log('Updated existing room to North Street 6');
    }
  }
  
  // Set up the map connection at north street 11 (x=0, y=9 in Newhaven)
  const updateConnection = db.prepare(`
    UPDATE rooms 
    SET connected_map_id = ?, 
        connected_room_x = ?, 
        connected_room_y = ?, 
        connection_direction = ?
    WHERE map_id = ? AND x = ? AND y = ?
  `);
  updateConnection.run(
    northernTerritory.id,  // connected_map_id
    0,                     // connected_room_x (center of Northern Territory's south edge)
    -5,                    // connected_room_y (y = -5 in Northern Territory)
    'N',                   // connection_direction
    newhaven.id,           // map_id (Newhaven)
    0,                     // x = 0
    9                      // y = 9 (north street 11)
  );
  console.log('Map connection established: Newhaven (0,9) <-> Northern Territory (0,-5)');
}

// Also set up the reverse connection from Northern Territory back to Newhaven
const updateReverseConnection = db.prepare(`
  UPDATE rooms 
  SET connected_map_id = ?, 
      connected_room_x = ?, 
      connected_room_y = ?, 
      connection_direction = ?
  WHERE map_id = ? AND x = ? AND y = ?
`);
if (newhaven && northernTerritory) {
  updateReverseConnection.run(
    newhaven.id,           // connected_map_id (back to Newhaven)
    0,                     // connected_room_x (north street 11)
    9,                     // connected_room_y (y = 9 in Newhaven)
    'S',                   // connection_direction (south from Northern Territory)
    northernTerritory.id,  // map_id (Northern Territory)
    0,                     // x = 0
    -5                     // y = -5 (south street 6)
  );
  console.log('Reverse map connection established: Northern Territory (0,-5) <-> Newhaven (0,9)');
}

// Database query functions
const getRoomById = db.prepare('SELECT * FROM rooms WHERE id = ?');
const getRoomByCoords = db.prepare('SELECT * FROM rooms WHERE map_id = ? AND x = ? AND y = ?');
const getRoomsByMap = db.prepare('SELECT * FROM rooms WHERE map_id = ?');
// Migration: Copy data from old columns to new prefixed columns
// This handles the transition from old column names to prefix-based naming
function migrateColumnsToPrefixes() {
  const columnMigrations = [
    // Stats (attributes)
    { old: 'brute_strength', new: 'stat_brute_strength' },
    { old: 'life_force', new: 'stat_life_force' },
    { old: 'cunning', new: 'stat_cunning' },
    { old: 'intelligence', new: 'stat_intelligence' },
    { old: 'wisdom', new: 'stat_wisdom' },
    // Abilities
    { old: 'crafting', new: 'ability_crafting' },
    { old: 'lockpicking', new: 'ability_lockpicking' },
    { old: 'stealth', new: 'ability_stealth' },
    { old: 'dodge', new: 'ability_dodge' },
    { old: 'critical_hit', new: 'ability_critical_hit' },
    // Resources
    { old: 'hit_points', new: 'resource_hit_points' },
    { old: 'max_hit_points', new: 'resource_max_hit_points' },
    { old: 'mana', new: 'resource_mana' },
    { old: 'max_mana', new: 'resource_max_mana' },
    // Flags
    { old: 'god_mode', new: 'flag_god_mode' }
  ];

  try {
    const tableInfo = db.prepare("PRAGMA table_info(players)").all();
    const existingColumns = tableInfo.map(col => col.name);
    const needsMigration = columnMigrations.some(m => existingColumns.includes(m.old) && existingColumns.includes(m.new));

    if (needsMigration) {
      console.log('Migrating player data from old columns to prefixed columns...');
      
      // Copy data from old columns to new columns if both exist
      columnMigrations.forEach(migration => {
        if (existingColumns.includes(migration.old) && existingColumns.includes(migration.new)) {
          try {
            db.exec(`UPDATE players SET ${migration.new} = ${migration.old} WHERE ${migration.new} IS NULL OR ${migration.new} = 0`);
            console.log(`Migrated data: ${migration.old} -> ${migration.new}`);
          } catch (err) {
            console.error(`Error migrating data for ${migration.old}:`, err.message);
          }
        }
      });
      
      console.log('Data migration complete.');
    }
  } catch (err) {
    console.error('Error during column migration:', err.message);
  }
}

// Auto-detect stats, abilities, resources, and flags from database schema
// Uses prefix-based naming: stat_*, ability_*, resource_*, flag_*
function detectPlayerAttributes() {
  const tableInfo = db.prepare("PRAGMA table_info(players)").all();
  const attributes = {
    stats: [],
    abilities: [],
    resources: [],
    flags: []
  };

  tableInfo.forEach(column => {
    const colName = column.name;
    
    // Convert snake_case to camelCase and generate display name
    const toCamelCase = (str) => {
      return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    };
    
    const toDisplayName = (str) => {
      // Remove prefix and convert to title case
      const withoutPrefix = str.replace(/^(stat_|ability_|resource_|flag_)/, '');
      return withoutPrefix
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

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
      // Check if this is a max value (resource_max_*)
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
        // Regular resource (not max)
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
  });

  return attributes;
}

// Helper function to dynamically extract stats from a player record
// Uses auto-detection based on column name prefixes
function getPlayerStats(player) {
  if (!player) return null;
  
  const attributes = detectPlayerAttributes();
  const stats = {};
  
  // Extract stats (attributes)
  attributes.stats.forEach(stat => {
    if (player[stat.dbColumn] !== undefined) {
      stats[stat.camelCase] = {
        value: player[stat.dbColumn],
        displayName: stat.displayName,
        category: 'stats'
      };
    }
  });
  
  // Extract abilities
  attributes.abilities.forEach(ability => {
    if (player[ability.dbColumn] !== undefined) {
      stats[ability.camelCase] = {
        value: player[ability.dbColumn],
        displayName: ability.displayName,
        category: 'abilities'
      };
    }
  });
  
  // Extract resources
  attributes.resources.forEach(resource => {
    if (resource.isMax) {
      // Max values are handled with their base resource
      return;
    }
    
    if (player[resource.dbColumn] !== undefined) {
      stats[resource.camelCase] = {
        value: player[resource.dbColumn],
        displayName: resource.displayName,
        category: 'resources'
      };
      
      // Add max value if it exists
      if (resource.maxColumn && player[resource.maxColumn] !== undefined) {
        const maxResource = attributes.resources.find(r => r.dbColumn === resource.maxColumn && r.isMax);
        if (maxResource) {
          stats[maxResource.camelCase] = {
            value: player[resource.maxColumn],
            displayName: maxResource.displayName,
            category: 'resources'
          };
        }
      }
    }
  });
  
  // Extract flags
  attributes.flags.forEach(flag => {
    if (player[flag.dbColumn] !== undefined) {
      stats[flag.camelCase] = {
        value: player[flag.dbColumn] === 1,
        displayName: flag.displayName,
        category: 'flags'
      };
    }
  });
  
  return stats;
}

const getPlayersInRoom = db.prepare('SELECT name FROM players WHERE current_room_id = ?');
const updatePlayerRoom = db.prepare('UPDATE players SET current_room_id = ? WHERE name = ?');
const getPlayerByName = db.prepare('SELECT * FROM players WHERE name = ?');
const getAllRooms = db.prepare('SELECT * FROM rooms');

// New query functions for map editor
const getAllMapsStmt = db.prepare('SELECT * FROM maps ORDER BY id');
const createMapStmt = db.prepare('INSERT INTO maps (name, width, height, description) VALUES (?, ?, ?, ?)');
const createRoomStmt = db.prepare('INSERT INTO rooms (name, description, x, y, map_id, room_type) VALUES (?, ?, ?, ?, ?, ?)');
const updateRoomStmt = db.prepare('UPDATE rooms SET name = ?, description = ?, room_type = ? WHERE id = ?');
const updateMapSizeStmt = db.prepare('UPDATE maps SET width = ?, height = ? WHERE id = ?');
const getMapBoundsStmt = db.prepare('SELECT MIN(x) as minX, MAX(x) as maxX, MIN(y) as minY, MAX(y) as maxY FROM rooms WHERE map_id = ?');

function getAllMaps() {
  return getAllMapsStmt.all();
}

function createMap(name, width, height, description) {
  const result = createMapStmt.run(name, width, height, description);
  return result.lastInsertRowid;
}

function createRoom(name, description, x, y, mapId, roomType = 'normal') {
  const result = createRoomStmt.run(name, description, x, y, mapId, roomType);
  return result.lastInsertRowid;
}

function updateRoom(roomId, name, description, roomType) {
  updateRoomStmt.run(name, description, roomType, roomId);
}

function getMapBounds(mapId) {
  return getMapBoundsStmt.get(mapId);
}

function updateMapSize(mapId) {
  const bounds = getMapBounds(mapId);
  if (bounds && bounds.minX !== null) {
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    updateMapSizeStmt.run(width, height, mapId);
    return { width, height };
  }
  return null;
}

// Disconnect a room from its map connection (clears connection on both ends)
const disconnectRoomStmt = db.prepare('UPDATE rooms SET connected_map_id = NULL, connected_room_x = NULL, connected_room_y = NULL, connection_direction = NULL WHERE id = ?');
const disconnectTargetRoomStmt = db.prepare(`
  UPDATE rooms 
  SET connected_map_id = NULL, connected_room_x = NULL, connected_room_y = NULL, connection_direction = NULL 
  WHERE map_id = ? AND x = ? AND y = ?
`);

function disconnectRoom(roomId) {
  const room = getRoomById.get(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  
  // Clear connection on this room
  disconnectRoomStmt.run(roomId);
  
  // If this room has a connection, try to clear it on the other end
  if (room.connected_map_id && room.connected_room_x !== null && room.connected_room_y !== null) {
    try {
      // Try to disconnect the target room (may not exist if orphaned)
      disconnectTargetRoomStmt.run(room.connected_map_id, room.connected_room_x, room.connected_room_y);
    } catch (err) {
      // Target room may not exist (orphaned connection) - that's okay
      console.log(`Note: Could not disconnect target room (may be orphaned): ${err.message}`);
    }
  }
  
  return true;
}

// NPC helper functions
const validateMoonlessMeadowRoomStmt = db.prepare(`
  SELECT r.id, r.map_id, m.name as map_name
  FROM rooms r
  JOIN maps m ON r.map_id = m.id
  WHERE r.id = ?
`);

function validateMoonlessMeadowRoom(roomId) {
  const result = validateMoonlessMeadowRoomStmt.get(roomId);
  if (!result) {
    throw new Error(`Room ${roomId} not found`);
  }
  if (result.map_name !== 'Moonless Meadow') {
    throw new Error(`Room ${roomId} is not in Moonless Meadow map. NPCs can only be placed in Moonless Meadow.`);
  }
  return true;
}

const getNPCsInRoomStmt = db.prepare(`
  SELECT rn.id, rn.npc_id, rn.state, rn.slot,
         sn.name, sn.description, sn.display_color
  FROM room_npcs rn
  JOIN scriptable_npcs sn ON rn.npc_id = sn.id
  WHERE rn.room_id = ? AND rn.active = 1
  ORDER BY rn.slot
`);

function getNPCsInRoom(roomId) {
  return getNPCsInRoomStmt.all(roomId).map(row => ({
    id: row.id,
    npcId: row.npc_id,
    name: row.name,
    description: row.description,
    color: row.display_color || '#00ffff',
    state: row.state ? JSON.parse(row.state) : {},
    slot: row.slot
  }));
}

const getAllActiveNPCsStmt = db.prepare(`
  SELECT rn.id, rn.npc_id, rn.room_id, rn.state, rn.last_cycle_run,
         sn.npc_type, sn.base_cycle_time, sn.required_stats, 
         sn.required_buffs, sn.input_items, sn.output_items, sn.failure_states,
         sn.display_color
  FROM room_npcs rn
  JOIN scriptable_npcs sn ON rn.npc_id = sn.id
  WHERE rn.active = 1 AND sn.active = 1
`);

function getAllActiveNPCs() {
  return getAllActiveNPCsStmt.all().map(row => ({
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
    color: row.display_color || '#00ffff'
  }));
}

const placeNPCInRoomStmt = db.prepare(`
  INSERT INTO room_npcs (npc_id, room_id, state, last_cycle_run, active, slot, spawn_rules)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function placeNPCInRoom(npcId, roomId, slot = 0, initialState = {}, spawnRules = null) {
  // Validate room belongs to Moonless Meadow
  validateMoonlessMeadowRoom(roomId);
  
  const stateJson = JSON.stringify(initialState);
  const spawnRulesJson = spawnRules ? JSON.stringify(spawnRules) : null;
  const lastCycleRun = Date.now();
  
  const result = placeNPCInRoomStmt.run(
    npcId,
    roomId,
    stateJson,
    lastCycleRun,
    1, // active
    slot,
    spawnRulesJson
  );
  
  return result.lastInsertRowid;
}

const getNpcPlacementsStmt = db.prepare(`
  SELECT rn.id, rn.npc_id, rn.room_id, rn.slot,
         r.name AS room_name, r.x, r.y,
         m.id AS map_id, m.name AS map_name
  FROM room_npcs rn
  JOIN rooms r ON rn.room_id = r.id
  JOIN maps m ON r.map_id = m.id
  WHERE rn.npc_id = ? AND rn.active = 1
  ORDER BY m.name, r.name, rn.slot
`);

const deleteNpcPlacementStmt = db.prepare('DELETE FROM room_npcs WHERE id = ?');

function getNpcPlacements(npcId) {
  return getNpcPlacementsStmt.all(npcId);
}

function deleteNpcPlacement(placementId) {
  // Simple delete; room-level invariants handled by application logic
  deleteNpcPlacementStmt.run(placementId);
}

// Rooms available for NPC placement for a given map.
// Currently just returns all rooms in the map; higher-level logic enforces
// Moonless Meadow-only placement.
function getRoomsForNpcPlacement(mapId) {
  return getRoomsByMap.all(mapId).map(r => ({
    id: r.id,
    name: r.name,
    x: r.x,
    y: r.y,
    map_id: r.map_id
  }));
}

const updateNPCStateStmt = db.prepare(`
  UPDATE room_npcs
  SET state = ?, last_cycle_run = ?
  WHERE id = ?
`);

function updateNPCState(roomNpcId, state, lastCycleRun) {
  const stateJson = JSON.stringify(state);
  updateNPCStateStmt.run(stateJson, lastCycleRun, roomNpcId);
}

// ============================================================
// Room Items (ground inventory) functions
// ============================================================

const getRoomItemsStmt = db.prepare(`
  SELECT item_name, SUM(quantity) as quantity
  FROM room_items
  WHERE room_id = ?
  GROUP BY item_name
  ORDER BY item_name
`);

const addRoomItemStmt = db.prepare(`
  INSERT INTO room_items (room_id, item_name, quantity, created_at)
  VALUES (?, ?, ?, ?)
`);

const updateRoomItemQtyStmt = db.prepare(`
  UPDATE room_items
  SET quantity = quantity + ?
  WHERE room_id = ? AND item_name = ?
`);

const getRoomItemByNameStmt = db.prepare(`
  SELECT id, quantity FROM room_items
  WHERE room_id = ? AND item_name = ?
  LIMIT 1
`);

const deleteRoomItemStmt = db.prepare(`
  DELETE FROM room_items WHERE id = ?
`);

const decrementRoomItemStmt = db.prepare(`
  UPDATE room_items SET quantity = quantity - ? WHERE id = ?
`);

function getRoomItems(roomId) {
  return getRoomItemsStmt.all(roomId);
}

function addRoomItem(roomId, itemName, quantity = 1) {
  const existing = getRoomItemByNameStmt.get(roomId, itemName);
  if (existing) {
    updateRoomItemQtyStmt.run(quantity, roomId, itemName);
  } else {
    addRoomItemStmt.run(roomId, itemName, quantity, Date.now());
  }
}

function removeRoomItem(roomId, itemName, quantity = 1) {
  const existing = getRoomItemByNameStmt.get(roomId, itemName);
  if (!existing) return false;
  
  if (existing.quantity <= quantity) {
    // Remove entire row
    deleteRoomItemStmt.run(existing.id);
  } else {
    // Decrement quantity
    decrementRoomItemStmt.run(quantity, existing.id);
  }
  return true;
}

// ============================================================
// Player Items (inventory) functions
// ============================================================

const getPlayerItemsStmt = db.prepare(`
  SELECT item_name, SUM(quantity) as quantity
  FROM player_items
  WHERE player_id = ?
  GROUP BY item_name
  ORDER BY item_name
`);

const addPlayerItemStmt = db.prepare(`
  INSERT INTO player_items (player_id, item_name, quantity, created_at)
  VALUES (?, ?, ?, ?)
`);

const updatePlayerItemQtyStmt = db.prepare(`
  UPDATE player_items
  SET quantity = quantity + ?
  WHERE player_id = ? AND item_name = ?
`);

const getPlayerItemByNameStmt = db.prepare(`
  SELECT id, quantity FROM player_items
  WHERE player_id = ? AND item_name = ?
  LIMIT 1
`);

const deletePlayerItemStmt = db.prepare(`
  DELETE FROM player_items WHERE id = ?
`);

const decrementPlayerItemStmt = db.prepare(`
  UPDATE player_items SET quantity = quantity - ? WHERE id = ?
`);

function getPlayerItems(playerId) {
  return getPlayerItemsStmt.all(playerId);
}

function addPlayerItem(playerId, itemName, quantity = 1) {
  const existing = getPlayerItemByNameStmt.get(playerId, itemName);
  if (existing) {
    updatePlayerItemQtyStmt.run(quantity, playerId, itemName);
  } else {
    addPlayerItemStmt.run(playerId, itemName, quantity, Date.now());
  }
}

function removePlayerItem(playerId, itemName, quantity = 1) {
  const existing = getPlayerItemByNameStmt.get(playerId, itemName);
  if (!existing) return false;
  
  if (existing.quantity <= quantity) {
    // Remove entire row
    deletePlayerItemStmt.run(existing.id);
  } else {
    // Decrement quantity
    decrementPlayerItemStmt.run(quantity, existing.id);
  }
  return true;
}

module.exports = {
  db,
  getRoomById: (id) => getRoomById.get(id),
  getRoomByCoords: (mapId, x, y) => getRoomByCoords.get(mapId, x, y),
  getRoomsByMap: (mapId) => getRoomsByMap.all(mapId),
  getPlayersInRoom: (roomId) => getPlayersInRoom.all(roomId).map(row => row.name),
  updatePlayerRoom: (roomId, playerName) => updatePlayerRoom.run(roomId, playerName),
  getPlayerByName: (name) => getPlayerByName.get(name),
  getAllRooms: () => getAllRooms.all(),
  getMapByName: (name) => getMapByNameStmt.get(name),
  getMapById: (id) => getMapByIdStmt.get(id),
  getAllMaps,
  createMap,
  createRoom,
  updateRoom,
  getMapBounds,
  updateMapSize,
  getPlayerStats,
  detectPlayerAttributes,
  disconnectRoom,
  // NPC functions
  getNPCsInRoom,
  getAllActiveNPCs,
  placeNPCInRoom,
  updateNPCState,
  validateMoonlessMeadowRoom,
  // Scriptable NPC definitions
  getAllScriptableNPCs,
  getScriptableNPCById,
  createScriptableNPC,
  updateScriptableNPC,
  // NPC placements
  getNpcPlacements,
  deleteNpcPlacement,
  getRoomsForNpcPlacement,
  // Room items (ground inventory)
  getRoomItems,
  addRoomItem,
  removeRoomItem,
  // Player items (inventory)
  getPlayerItems,
  addPlayerItem,
  removePlayerItem
};

// Run migration after all columns are added
// This copies data from old column names to new prefixed column names
migrateColumnsToPrefixes();

