# Node Game Server Implementation Plan

## Project Structure
```
thegame/
├── package.json
├── server.js
├── database.js
├── public/
│   ├── index.html
│   ├── style.css
│   └── client.js
└── game.db (SQLite database, auto-created)
```

## Implementation Steps

### 1. Initialize Project and Dependencies
- Create `package.json` with dependencies:
  - `express` - web server
  - `ws` - WebSocket library
  - `better-sqlite3` - SQLite database (synchronous, faster than sqlite3)
- Set up npm scripts for running the server

### 2. Database Setup (`database.js`)
- Initialize SQLite database connection
- Create `rooms` table with columns: `id`, `name`, `description`, `x`, `y` (coordinate-based map)
- Create `players` table with columns: `id`, `name` (unique constraint), `current_room_id` (foreign key to rooms)
- Insert initial data:
  - Room 1: name="town square", description="a simple room", x=0, y=0 (center)
  - Room 2: name="northern room", description="a room to the north", x=0, y=1 (north)
  - Room 3: name="southern room", description="a room to the south", x=0, y=-1 (south)
  - Players: "Fliz" and "Hebron" (both start in town square, current_room_id=1)

### 3. Server Setup (`server.js`)
- Create Express server listening on port 3434
- Serve static files from `public/` directory
- Set up WebSocket server using `ws` library
- WebSocket connection handling:
  - Track connected players (player name -> WebSocket connection)
  - Track which room each player is in (from database)
  - Handle player movement: validate direction (N/S/E/W), check if adjacent room exists at target coordinates, update database
  - Broadcast player join/leave events to all clients in the same room (real-time)
  - Broadcast player movement events when players change rooms
  - Handle player selection and room entry messages
- Movement logic: calculate target coordinates (N: y+1, S: y-1, E: x+1, W: x-1), query database for room at those coordinates

### 4. Frontend - Player Selection (`public/index.html`)
- HTML structure with player selection screen
- Two buttons/options: "Fliz" and "Hebron"
- Hidden room view (shown after player selection)
- Display current player name and room name
- Navigation buttons: North, South, East, West (only show if room exists in that direction)
- List of players currently in the room (updates in real-time)

### 5. Frontend Styling (`public/style.css`)
- Modern, clean UI for player selection
- Room view styling
- Navigation button styling (grid layout for N/S/E/W)
- Player list styling

### 6. Frontend WebSocket Client (`public/client.js`)
- Connect to WebSocket server
- Handle player selection: send player name to server
- Handle navigation: send movement direction (N/S/E/W) to server
- Listen for room state updates (who's in the room, room details, available exits)
- Update UI instantly when other players join/leave the current room
- Update UI instantly when other players move to/from adjacent rooms
- Display real-time player list
- Show/hide navigation buttons based on available exits from server

### 7. WebSocket Message Protocol
- Client → Server:
  - `{ type: 'selectPlayer', playerName: 'Fliz' }` - when player selects character
  - `{ type: 'move', direction: 'N' }` - when player wants to move (N/S/E/W)
- Server → Client:
  - `{ type: 'roomUpdate', room: { id, name, description, x, y }, players: ['Fliz', 'Hebron'], exits: { north: true, south: true, east: false, west: false } }` - room state updates
  - `{ type: 'playerJoined', playerName: 'Hebron' }` - when someone joins current room
  - `{ type: 'playerLeft', playerName: 'Fliz' }` - when someone leaves current room
  - `{ type: 'moved', room: { id, name, description, x, y }, players: [...], exits: {...} }` - when player successfully moves to new room

## Key Files to Create

1. **package.json** - Project dependencies and scripts
2. **database.js** - SQLite initialization and queries (including coordinate-based room queries)
3. **server.js** - Express server + WebSocket server + movement handling
4. **public/index.html** - Frontend HTML with navigation buttons
5. **public/style.css** - Frontend styling
6. **public/client.js** - WebSocket client and UI logic with movement handling

## Technical Decisions
- Using `better-sqlite3` for synchronous SQLite operations (simpler, faster)
- WebSocket server integrated with Express HTTP server
- Real-time updates via WebSocket broadcasts (no polling)
- Simple JSON message protocol for WebSocket communication
- Coordinate-based map system: rooms have x,y coordinates (e.g., town square at 0,0, north at 0,1, south at 0,-1)
- Movement validation: server checks if adjacent room exists at target coordinates before allowing movement
- Players track their current room in database for persistence
- Direction mapping: N=(0,+1), S=(0,-1), E=(+1,0), W=(-1,0)

