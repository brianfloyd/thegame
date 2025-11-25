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
    FOREIGN KEY (current_room_id) REFERENCES rooms(id)
  )
`);

// Insert initial rooms if they don't exist
const insertRoom = db.prepare(`
  INSERT OR IGNORE INTO rooms (name, description, x, y) 
  VALUES (?, ?, ?, ?)
`);

insertRoom.run('town square', 'You stand in the center of a bustling town square. Cobblestone paths radiate outward from a weathered stone fountain in the center. Market stalls line the edges, though they appear empty at this hour. The air carries the faint scent of fresh bread and distant woodsmoke. To the north and south, pathways lead away from the square.', 0, 0);
insertRoom.run('northern room', 'You find yourself in a quiet northern chamber. The walls are made of smooth, dark stone that seems to absorb the light. A single torch flickers in a sconce, casting dancing shadows across the floor. The room feels ancient and peaceful, with a sense of history embedded in its very stones. A path leads back south to the town square.', 0, 1);
insertRoom.run('southern room', 'You enter a warm southern chamber. The room is bathed in soft golden light from a large window facing south. Comfortable furnishings suggest this was once a gathering place. The air is still and calm, with dust motes drifting lazily in the light. You can see the way back north to the town square.', 0, -1);

// Get town square room ID
const getTownSquare = db.prepare('SELECT id FROM rooms WHERE name = ?');
const townSquare = getTownSquare.get('town square');

// Insert initial players if they don't exist
const insertPlayer = db.prepare(`
  INSERT OR IGNORE INTO players (name, current_room_id) 
  VALUES (?, ?)
`);

insertPlayer.run('Fliz', townSquare.id);
insertPlayer.run('Hebron', townSquare.id);

// Database query functions
const getRoomById = db.prepare('SELECT * FROM rooms WHERE id = ?');
const getRoomByCoords = db.prepare('SELECT * FROM rooms WHERE x = ? AND y = ?');
const getPlayersInRoom = db.prepare('SELECT name FROM players WHERE current_room_id = ?');
const updatePlayerRoom = db.prepare('UPDATE players SET current_room_id = ? WHERE name = ?');
const getPlayerByName = db.prepare('SELECT * FROM players WHERE name = ?');

module.exports = {
  db,
  getRoomById: (id) => getRoomById.get(id),
  getRoomByCoords: (x, y) => getRoomByCoords.get(x, y),
  getPlayersInRoom: (roomId) => getPlayersInRoom.all(roomId).map(row => row.name),
  updatePlayerRoom: (roomId, playerName) => updatePlayerRoom.run(roomId, playerName),
  getPlayerByName: (name) => getPlayerByName.get(name)
};

