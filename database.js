const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'game.db'));

// Create rooms table with coordinate-based map
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    UNIQUE(x, y)
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
const addColumnIfNotExists = (columnName, defaultValue) => {
  try {
    db.exec(`ALTER TABLE players ADD COLUMN ${columnName} INTEGER DEFAULT ${defaultValue}`);
  } catch (err) {
    // Column already exists, ignore error
    if (!err.message.includes('duplicate column name')) {
      throw err;
    }
  }
};

// Migrate existing table
addColumnIfNotExists('brute_strength', 10);
addColumnIfNotExists('life_force', 10);
addColumnIfNotExists('cunning', 10);
addColumnIfNotExists('intelligence', 10);
addColumnIfNotExists('wisdom', 10);
addColumnIfNotExists('crafting', 0);
addColumnIfNotExists('lockpicking', 0);
addColumnIfNotExists('stealth', 0);
addColumnIfNotExists('dodge', 0);
addColumnIfNotExists('critical_hit', 0);
addColumnIfNotExists('hit_points', 50);
addColumnIfNotExists('max_hit_points', 50);
addColumnIfNotExists('mana', 0);
addColumnIfNotExists('max_mana', 0);

// Migration: Clean up unwanted rooms (district rooms, etc.)
function cleanupRooms() {
  const MAP_SIZE = 20;
  const MAP_HALF = Math.floor(MAP_SIZE / 2); // 10
  
  // Get town square room ID (safe room to move players to)
  const getTownSquare = db.prepare('SELECT id FROM rooms WHERE name = ?');
  const townSquare = getTownSquare.get('town square');
  
  // If town square doesn't exist yet, skip cleanup (will be created below)
  if (!townSquare) {
    return;
  }
  
  // Move any players in rooms we're about to delete to town square
  const movePlayersFromInvalidRooms = db.prepare(`
    UPDATE players 
    SET current_room_id = ? 
    WHERE current_room_id IN (
      SELECT id FROM rooms 
      WHERE NOT (
        x = ? OR x = ? OR y = ? OR y = ? OR x = 0
      )
    )
  `);
  
  movePlayersFromInvalidRooms.run(townSquare.id, -MAP_HALF, MAP_HALF - 1, -MAP_HALF, MAP_HALF - 1);
  
  // Now delete all rooms that are NOT on perimeter or center street
  const deleteInvalidRooms = db.prepare(`
    DELETE FROM rooms 
    WHERE NOT (
      x = ? OR x = ? OR y = ? OR y = ? OR x = 0
    )
  `);
  
  deleteInvalidRooms.run(-MAP_HALF, MAP_HALF - 1, -MAP_HALF, MAP_HALF - 1);
  
  console.log('Cleaned up invalid rooms');
}

// Insert initial rooms if they don't exist
const insertRoom = db.prepare(`
  INSERT OR IGNORE INTO rooms (name, description, x, y) 
  VALUES (?, ?, ?, ?)
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

// Create perimeter rooms
for (let coord = -MAP_HALF; coord < MAP_HALF; coord++) {
  // Westwall Street (x = -10)
  insertRoom.run(
    `westwall street ${coord + MAP_HALF + 1}`,
    `You stand on Westwall Street, the western boundary of the town. The street runs north to south along the outer wall. Buildings line the eastern side, while the western side opens to the wilderness beyond.`,
    -MAP_HALF,
    coord
  );
  
  // Eastwall Street (x = 9)
  insertRoom.run(
    `eastwall street ${coord + MAP_HALF + 1}`,
    `You stand on Eastwall Street, the eastern boundary of the town. The street runs north to south along the outer wall. Buildings line the western side, while the eastern side opens to the wilderness beyond.`,
    MAP_HALF - 1,
    coord
  );
  
  // South Street (y = -10)
  insertRoom.run(
    `south street ${coord + MAP_HALF + 1}`,
    `You stand on South Street, the southern boundary of the town. The street runs east to west along the outer wall. Buildings line the northern side, while the southern side opens to the wilderness beyond.`,
    coord,
    -MAP_HALF
  );
  
  // North Street (y = 9)
  insertRoom.run(
    `north street ${coord + MAP_HALF + 1}`,
    `You stand on North Street, the northern boundary of the town. The street runs east to west along the outer wall. Buildings line the southern side, while the northern side opens to the wilderness beyond.`,
    coord,
    MAP_HALF - 1
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
      y
    );
  } else if (y === 1) {
    insertRoom.run(
      'northern room',
      'You find yourself in a quiet northern chamber. The walls are made of smooth, dark stone that seems to absorb the light. A single torch flickers in a sconce, casting dancing shadows across the floor. The room feels ancient and peaceful, with a sense of history embedded in its very stones. Center Street continues north and south.',
      0,
      y
    );
  } else if (y === -1) {
    insertRoom.run(
      'southern room',
      'You enter a warm southern chamber. The room is bathed in soft golden light from a large window facing south. Comfortable furnishings suggest this was once a gathering place. The air is still and calm, with dust motes drifting lazily in the light. Center Street continues north and south.',
      0,
      y
    );
  } else {
    // Regular Center Street rooms
    insertRoom.run(
      `center street ${y > 0 ? 'north' : 'south'} ${Math.abs(y)}`,
      `You walk along Center Street, the main north-south thoroughfare. The wide cobblestone road is well-maintained, with shops and buildings lining both sides. The street continues to the north and south.`,
      0,
      y
    );
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

// Fliz: 50/50 HP, 0 Mana (not a caster)
insertPlayer.run('Fliz', townSquare.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0);
setPlayerStats.run(10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0, 'Fliz');

// Hebron: 50/50 HP, 10/10 Mana
insertPlayer.run('Hebron', townSquare.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 10, 10);
setPlayerStats.run(10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 10, 10, 'Hebron');

// Database query functions
const getRoomById = db.prepare('SELECT * FROM rooms WHERE id = ?');
const getRoomByCoords = db.prepare('SELECT * FROM rooms WHERE x = ? AND y = ?');
const getPlayersInRoom = db.prepare('SELECT name FROM players WHERE current_room_id = ?');
const updatePlayerRoom = db.prepare('UPDATE players SET current_room_id = ? WHERE name = ?');
const getPlayerByName = db.prepare('SELECT * FROM players WHERE name = ?');
const getAllRooms = db.prepare('SELECT * FROM rooms');

module.exports = {
  db,
  getRoomById: (id) => getRoomById.get(id),
  getRoomByCoords: (x, y) => getRoomByCoords.get(x, y),
  getPlayersInRoom: (roomId) => getPlayersInRoom.all(roomId).map(row => row.name),
  updatePlayerRoom: (roomId, playerName) => updatePlayerRoom.run(roomId, playerName),
  getPlayerByName: (name) => getPlayerByName.get(name),
  getAllRooms: () => getAllRooms.all()
};

