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
├── docs/
│   └── requirements.md
└── game.db (SQLite database, auto-created)
```

## Implementation Steps

### 1. Initialize Project and Dependencies
- Create `package.json` with dependencies:
  - `express` - web server
  - `ws` - WebSocket library
  - `better-sqlite3` - SQLite database (synchronous, faster than sqlite3)
  - `nodemon` - Development tool for auto-restart (dev dependency)
- Set up npm scripts for running the server (`start` and `dev`)

### 2. Database Setup (`database.js`)
- Initialize SQLite database connection
- Create `rooms` table with columns: `id`, `name`, `description`, `x`, `y` (coordinate-based map)
- Create `players` table with columns: `id`, `name` (unique constraint), `current_room_id` (foreign key to rooms)
- Insert initial data:
  - Room 1: name="town square", description="You stand in the center of a bustling town square...", x=0, y=0 (center)
  - Room 2: name="northern room", description="You find yourself in a quiet northern chamber...", x=0, y=1 (north)
  - Room 3: name="southern room", description="You enter a warm southern chamber...", x=0, y=-1 (south)
  - Players: "Fliz" and "Hebron" (both start in town square, current_room_id=1)
- Enhanced room descriptions with detailed narrative text

### 3. Server Setup (`server.js`)
- Create Express server listening on port 3434
- Serve static files from `public/` directory
- Set up WebSocket server using `ws` library
- WebSocket connection handling:
  - Track connected players (player name -> WebSocket connection)
  - Track which room each player is in (from database)
  - Handle player movement: validate direction (N/S/E/W/NE/NW/SE/SW/U/D), check if adjacent room exists at target coordinates, update database
  - Broadcast player join/leave events to all clients in the same room (real-time)
  - Broadcast player movement events when players change rooms
  - Handle player selection and room entry messages
  - Only show connected players in room (not all players from database)
- Movement logic: 
  - Calculate target coordinates (N: y+1, S: y-1, E: x+1, W: x-1, NE: x+1,y+1, etc.)
  - Query database for room at those coordinates
  - Support diagonal directions (NE, NW, SE, SW)
  - Support vertical directions (U, D) - prepared for future z-coordinate implementation
- Error messages: "Ouch! You walked into the wall to the [direction]." when movement fails
- Room persistence: Players rejoin in the room they left

### 4. Frontend - MajorMUD-Style Interface (`public/index.html`)
- Player selection screen with two options: "Fliz" and "Hebron"
- Game view with split layout:
  - **Left 2/3**: Text terminal (MUD-style interface)
  - **Right 1/3**: Divided into 4 quadrants
    - Top-right quadrant: Compass widget
    - Other quadrants: Reserved for future features
- Text terminal displays:
  - Room name (yellow, uppercase)
  - Room description (green, formatted text)
  - "Also here:" section with player names (cyan, inline)
  - Command prompt at bottom with `>` symbol
- Compass widget with all 8 cardinal/intercardinal directions plus Up/Down buttons

### 5. Frontend Styling (`public/style.css`)
- MajorMUD-style retro terminal aesthetic:
  - Black background with green text (#00ff00)
  - Yellow for room names (#ffff00)
  - Cyan for player names (#00ffff)
  - Red for error messages (#ff0000)
  - Monospace font (Courier New)
- Terminal container (2/3 width):
  - Scrollable content area
  - Custom scrollbar styling
  - Command line with prompt
- Right panel (1/3 width):
  - 4-quadrant grid layout
  - Compass widget in top-right quadrant
  - Smaller compass buttons (35px) for compact display
- Compass button states:
  - Available: Bright green border and text
  - Unavailable: Lowlighted (40% opacity, dark colors) but still visible
  - All buttons always visible for centered appearance
- Responsive design for smaller screens

### 6. Frontend WebSocket Client (`public/client.js`)
- Connect to WebSocket server
- Handle player selection: send player name to server
- Text command system:
  - Command line input at bottom of terminal
  - Supports full words: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`, `up`, `down`
  - Supports abbreviations: `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`, `u`, `d`
  - Command normalization and validation
- Compass widget interaction:
  - Clickable direction buttons
  - Only available directions are enabled
  - All directions visible but unavailable ones are lowlighted
- Real-time updates:
  - Listen for room state updates (who's in the room, room details, available exits)
  - Update UI instantly when other players join/leave the current room
  - Update UI instantly when other players move to/from adjacent rooms
  - Display real-time player list
- Player list management:
  - "Also here:" and player names on same line
  - Multiple players comma-separated
  - "No one else is here." when room is empty
  - Automatically removes "No one else is here." when player joins
  - Automatically restores "No one else is here." when last player leaves
- Terminal display:
  - Room name, description, and players displayed in terminal
  - Auto-scroll to bottom on updates
  - Error messages displayed in terminal

### 7. WebSocket Message Protocol
- Client → Server:
  - `{ type: 'selectPlayer', playerName: 'Fliz' }` - when player selects character
  - `{ type: 'move', direction: 'N' }` - when player wants to move (N/S/E/W/NE/NW/SE/SW/U/D)
- Server → Client:
  - `{ type: 'roomUpdate', room: { id, name, description, x, y }, players: ['Fliz'], exits: { north: true, south: true, east: false, west: false, northeast: false, ... } }` - room state updates
  - `{ type: 'playerJoined', playerName: 'Hebron' }` - when someone joins current room
  - `{ type: 'playerLeft', playerName: 'Fliz' }` - when someone leaves current room
  - `{ type: 'moved', room: { id, name, description, x, y }, players: [...], exits: {...} }` - when player successfully moves to new room
  - `{ type: 'error', message: 'Ouch! You walked into the wall to the east.' }` - error messages

## Key Files

1. **package.json** - Project dependencies and scripts
2. **database.js** - SQLite initialization and queries (including coordinate-based room queries)
3. **server.js** - Express server + WebSocket server + movement handling
4. **public/index.html** - Frontend HTML with MajorMUD-style layout
5. **public/style.css** - Retro terminal styling
6. **public/client.js** - WebSocket client and UI logic with text commands
7. **docs/requirements.md** - This documentation file

## Technical Decisions

- Using `better-sqlite3` for synchronous SQLite operations (simpler, faster)
- WebSocket server integrated with Express HTTP server
- Real-time updates via WebSocket broadcasts (no polling)
- Simple JSON message protocol for WebSocket communication
- Coordinate-based map system: rooms have x,y coordinates (e.g., town square at 0,0, north at 0,1, south at 0,-1)
- Movement validation: server checks if adjacent room exists at target coordinates before allowing movement
- Players track their current room in database for persistence (players rejoin where they left)
- Direction mapping: 
  - N=(0,+1), S=(0,-1), E=(+1,0), W=(-1,0)
  - NE=(+1,+1), NW=(-1,+1), SE=(+1,-1), SW=(-1,-1)
  - U/D prepared for future z-coordinate implementation
- Only connected players shown in room (not all players from database)
- MajorMUD-style terminal interface for authentic retro gaming experience
- Text command system with multiple command variations for user convenience
- Compass widget always shows all directions (unavailable ones lowlighted) for visual consistency

## UI/UX Features

- **Layout**: 2/3 terminal, 1/3 right panel (4 quadrants)
- **Terminal**: Retro green-on-black text interface
- **Compass**: Visual navigation widget with all directions visible
- **Commands**: Text-based with multiple input formats
- **Player List**: Inline display with automatic "No one else is here." management
- **Error Messages**: Descriptive wall collision messages
- **Real-time Updates**: Instant visibility of players entering/leaving rooms

## Future Enhancements (Prepared)

- Vertical movement (Up/Down) - requires z-coordinate in database
- Additional UI panels in remaining quadrants
- More rooms and expanded world map
- Additional player commands and interactions
