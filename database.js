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

// Create players table
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    current_room_id INTEGER NOT NULL,
    brute_strength INTEGER DEFAULT 10,
    life_force INTEGER DEFAULT 10,
    cunning INTEGER DEFAULT 10,
    intelligence INTEGER DEFAULT 10,
    wisdom INTEGER DEFAULT 10,
    crafting INTEGER DEFAULT 0,
    lockpicking INTEGER DEFAULT 0,
    stealth INTEGER DEFAULT 0,
    dodge INTEGER DEFAULT 0,
    critical_hit INTEGER DEFAULT 0,
    hit_points INTEGER DEFAULT 50,
    max_hit_points INTEGER DEFAULT 50,
    mana INTEGER DEFAULT 0,
    max_mana INTEGER DEFAULT 0,
    FOREIGN KEY (current_room_id) REFERENCES rooms(id)
  )
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

// Migrate existing players table
addColumnIfNotExists('players', 'brute_strength', 10);
addColumnIfNotExists('players', 'life_force', 10);
addColumnIfNotExists('players', 'cunning', 10);
addColumnIfNotExists('players', 'intelligence', 10);
addColumnIfNotExists('players', 'wisdom', 10);
addColumnIfNotExists('players', 'crafting', 0);
addColumnIfNotExists('players', 'lockpicking', 0);
addColumnIfNotExists('players', 'stealth', 0);
addColumnIfNotExists('players', 'dodge', 0);
addColumnIfNotExists('players', 'critical_hit', 0);
addColumnIfNotExists('players', 'hit_points', 50);
addColumnIfNotExists('players', 'max_hit_points', 50);
addColumnIfNotExists('players', 'mana', 0);
addColumnIfNotExists('players', 'max_mana', 0);
addColumnIfNotExists('players', 'god_mode', 0);

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

// Insert initial players if they don't exist
const insertPlayer = db.prepare(`
  INSERT OR IGNORE INTO players (
    name, current_room_id, 
    brute_strength, life_force, cunning, intelligence, wisdom,
    crafting, lockpicking, stealth, dodge, critical_hit,
    hit_points, max_hit_points, mana, max_mana
  ) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Update existing players with stats if they don't have them set
const updatePlayerStats = db.prepare(`
  UPDATE players SET
    brute_strength = COALESCE(brute_strength, 10),
    life_force = COALESCE(life_force, 10),
    cunning = COALESCE(cunning, 10),
    intelligence = COALESCE(intelligence, 10),
    wisdom = COALESCE(wisdom, 10),
    crafting = COALESCE(crafting, 0),
    lockpicking = COALESCE(lockpicking, 0),
    stealth = COALESCE(stealth, 0),
    dodge = COALESCE(dodge, 0),
    critical_hit = COALESCE(critical_hit, 0),
    hit_points = COALESCE(hit_points, 50),
    max_hit_points = COALESCE(max_hit_points, 50),
    mana = COALESCE(mana, 0),
    max_mana = COALESCE(max_mana, 0)
  WHERE name = ?
`);

// Set specific values for Fliz and Hebron
const setPlayerStats = db.prepare(`
  UPDATE players SET
    brute_strength = ?, life_force = ?, cunning = ?, intelligence = ?, wisdom = ?,
    crafting = ?, lockpicking = ?, stealth = ?, dodge = ?, critical_hit = ?,
    hit_points = ?, max_hit_points = ?, mana = ?, max_mana = ?
  WHERE name = ?
`);

// Fliz: 50/50 HP, 0 Mana (not a caster), god mode enabled
insertPlayer.run('Fliz', townSquare.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0);
setPlayerStats.run(10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0, 'Fliz');
// Set Fliz's god_mode to 1
const setGodMode = db.prepare('UPDATE players SET god_mode = ? WHERE name = ?');
setGodMode.run(1, 'Fliz');

// Hebron: 50/50 HP, 10/10 Mana
insertPlayer.run('Hebron', townSquare.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 10, 10);
setPlayerStats.run(10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 10, 10, 'Hebron');

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
  updateMapSize
};

