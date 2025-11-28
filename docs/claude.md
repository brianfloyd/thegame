# Node Game Server Implementation Plan

## Project Structure
```
thegame/
├── package.json
├── server.js
├── database.js
├── npcLogic.js
├── public/
│   ├── index.html (landing/character selection page)
│   ├── game.html (main game UI)
│   ├── map-editor.html (standalone map editor)
│   ├── npc-editor.html (standalone NPC editor)
│   ├── style.css
│   ├── client.js (game client)
│   ├── map-editor.js (map editor logic)
│   └── npc-editor.js (NPC editor logic)
├── migrations/
│   ├── 001_schema.sql
│   ├── 002_seed_data.sql
│   └── 003_indexes.sql
├── scripts/
│   ├── migrate.js
│   └── migrate-data.js
├── docs/
│   ├── claude.md
│   └── requirements.md
├── .env (DATABASE_URL for PostgreSQL)
└── nixpacks.toml (Railway deployment config)
```

## Implementation Steps

### 1. Initialize Project and Dependencies
- Create `package.json` with dependencies:
  - `express` - web server
  - `ws` - WebSocket library
  - `pg` - PostgreSQL database client (async with connection pooling)
  - `dotenv` - Environment variable management
  - `express-session` - Session management middleware
  - `cookie-parser` - Cookie parsing middleware
  - `nodemon` - Development tool for auto-restart (dev dependency)
- Set up npm scripts for running the server (`start`, `dev`, `migrate`)
- Environment configuration: `.env` file with `DATABASE_URL` for PostgreSQL connection

### 2. Database Setup (`database.js`)
- Initialize PostgreSQL connection pool using `pg` library
- All database functions are async (return Promises, use `await`)
- Connection string from `DATABASE_URL` environment variable
- SSL configuration for production (Railway)
- Create `maps` table with columns: `id`, `name`, `width`, `height`, `description`
- Create `rooms` table with columns:
  - Basic: `id`, `name`, `description`, `x`, `y` (coordinate-based map)
  - **Map System**: `map_id` (foreign key to maps), `connected_map_id`, `connected_room_x`, `connected_room_y`, `connection_direction`
  - **Room Types**: `room_type` (TEXT, default 'normal') - room classification (normal, merchant, etc.)
  - UNIQUE constraint on `(map_id, x, y)` to prevent duplicate rooms
- Create `players` table with columns:
  - Basic: `id`, `name` (unique constraint), `current_room_id` (foreign key to rooms)
  - **Stats** (all default 10): `brute_strength`, `life_force`, `cunning`, `intelligence`, `wisdom`
  - **Abilities** (all default 0): `crafting`, `lockpicking`, `stealth`, `dodge`, `critical_hit`
  - **Resources**: `hit_points` (default 50), `max_hit_points` (default 50), `mana` (default 0), `max_mana` (default 0)
  - **God Mode**: `god_mode` (INTEGER, default 0) - administrative privileges flag
- Database schema managed via SQL migration files in `migrations/` directory:
  - `001_schema.sql` - Core table definitions (PostgreSQL syntax: SERIAL, BOOLEAN, TIMESTAMP)
  - `002_seed_data.sql` - Initial maps, rooms, players, items, room type colors
  - `003_indexes.sql` - Performance indexes
- Migration runner: `scripts/migrate.js` applies migrations automatically on server start
- Data migration: `scripts/migrate-data.js` exports data from SQLite to PostgreSQL (one-time use)
- Insert initial data:
  - **Maps**:
    - **Newhaven** (20x20): Main town with organized streets
    - **Northern Territory** (10x10): Wild northern area, half the size of Newhaven
  - **Newhaven Map Structure**: 20x20 grid (coordinates -10 to +9)
    - **Perimeter Rooms**: Outer square boundary
      - Westwall Street (x = -10): 20 rooms along western edge
      - Eastwall Street (x = 9): 20 rooms along eastern edge
      - North Street (y = 9): 20 rooms along northern edge
      - South Street (y = -10): 20 rooms along southern edge
    - **Center Street**: Vertical road (x = 0) connecting north to south
      - 20 rooms total, including the 3 original special rooms
      - Town Square at (0, 0) - center intersection
      - Northern Room at (0, 1) - on Center Street
      - Southern Room at (0, -1) - on Center Street
  - **Northern Territory Map Structure**: 10x10 grid (coordinates -5 to +4)
    - **Perimeter Rooms**: Outer square boundary
      - Westwall Street (x = -5): 10 rooms along western edge
      - Eastwall Street (x = 4): 10 rooms along eastern edge
      - North Street (y = 4): 10 rooms along northern edge
      - South Street (y = -5): 10 rooms along southern edge
    - **Center Street**: Vertical road (x = 0) connecting north to south
      - 10 rooms total
      - Intersection with North Street at (0, 4) - "north street 6"
      - Intersection with South Street at (0, -5) - "south street 6" (connection point to Newhaven)
  - **Map Connections**:
    - **Newhaven "north street 11" (0, 9)** ↔ **Northern Territory "south street 6" (0, -5)**
    - Bidirectional connection: North from Newhaven enters Northern Territory, South from Northern Territory returns to Newhaven
    - Connection direction stored in `connection_direction` field ('N' or 'S')
  - **Total Rooms**: ~80 rooms in Newhaven + ~40 rooms in Northern Territory
  - Players: "Fliz" and "Hebron" (both start in town square, current_room_id=1)
  - **Database Cleanup**: Automatic migration removes invalid rooms (district/interior rooms) while preserving player data
  - **Player Stats**:
    - Fliz: All stats 10, all abilities 0, 50/50 HP, 0 Mana (not a caster), **God Mode enabled (1)**
    - Hebron: All stats 10, all abilities 0, 50/50 HP, 10/10 Mana, God Mode disabled (0)
- Enhanced room descriptions with detailed narrative text

### 3. Server Setup (`server.js`)
- Create Express server listening on port 3434
- Serve static files from `public/` directory
- Set up WebSocket server using `ws` library
- WebSocket connection handling:
  - Track connected players using unique `connectionId` per WebSocket (allows multiple tabs/browsers)
  - `connectedPlayers` Map: `connectionId -> { ws, roomId, playerName, playerId, sessionId }`
  - Track which room each player is in (from database)
  - Handle player movement: validate direction (N/S/E/W/NE/NW/SE/SW/U/D), check if adjacent room exists at target coordinates OR if map connection exists, update database
  - Broadcast player join/leave events to all clients in the same room (real-time)
  - Broadcast player movement events when players change rooms
  - Handle player selection and room entry messages
  - Only show connected players in room (not all players from database)
  - Send player stats to client on connection via WebSocket (including `godMode` flag)
  - Send map data with connection info and preview rooms
  - **Map Editor Handlers** (god mode only):
    - Handle `getMapEditorData` - return all rooms for a map
    - Handle `createMap` - create new map with auto-assigned ID
    - Handle `createRoom` - create new room in a map
    - Handle `updateRoom` - update room name, description, and type
    - Handle `getAllMaps` - return list of all maps
    - Handle `connectMaps` - connect two maps with validation
- Movement logic: 
  - **Map Connection Check**: First check if current room has a map connection in the requested direction
  - If connection exists, transition to connected map at specified coordinates
  - Otherwise, calculate target coordinates (N: y+1, S: y-1, E: x+1, W: x-1, NE: x+1,y+1, etc.)
  - Query database for room at those coordinates in the same map
  - Support diagonal directions (NE, NW, SE, SW)
  - Support vertical directions (U, D) - prepared for future z-coordinate implementation
- **Map Transition Handling**:
  - When player moves to a new map, send complete `mapData` message with all rooms from new map
  - Include connection info for preview rooms if the new room has connections
  - Update player's `current_room_id` to the target room in the new map
- **Map Data Messages**:
  - On connection: Send all rooms from current map + preview rooms from connected maps (within 5 units of connection point)
  - On map transition: Send all rooms from new map + preview rooms if applicable
  - Include `mapId` for each room, `connectionInfo` for coordinate transformation
  - Include `mapName` in room updates for display
- Error messages: "Ouch! You walked into the wall to the [direction]." when movement fails
- Room persistence: Players rejoin in the room they left
- **Exit Detection**: `getExits()` function checks for map connections first, then adjacent rooms in same map

### 4. Frontend - MajorMUD-Style Interface (`public/index.html`)
- Player selection screen with two options: "Fliz" and "Hebron"
- Game view with split layout:
  - **Left 2/3**: Text terminal (MUD-style interface)
  - **Right 1/3**: Divided into 4 quadrants
    - Top-left quadrant: Player Stats widget
    - Top-right quadrant: Compass widget with coordinates display
    - Bottom-left quadrant: Map widget (25x25 grid view)
    - Bottom-right quadrant: Reserved for future features
- Text terminal displays:
  - Room name with map name prefix (e.g., "Newhaven, north street 11") (yellow, uppercase)
  - Room description (green, formatted text)
  - "Also here:" section with player names (cyan, inline)
  - **God Mode Button Bar** (visible only to god mode players, fixed above command input):
    - Buttons: "Map", "Items", "Spells", "Craft", "NPC"
    - "Map" button opens map editor (functional)
    - "NPC" button opens NPC editor (functional)
    - Other buttons (Items, Spells, Craft) reserved for future features
  - Command prompt at bottom with `>` symbol
- Compass widget with all 8 cardinal/intercardinal directions plus Up/Down buttons
- **Coordinates Display**: Shows current map name and coordinates (x, y) at bottom of compass widget
- **Map Editor Overlay** (full-screen, hidden by default):
  - 100x100 grid canvas for map editing
  - Side panel for room editing forms
  - Map selector dropdown
  - Create New Map button
  - Connect Maps button
  - Create New Map dialog

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
  - Player Stats widget in top-left quadrant
  - Compass widget in top-right quadrant
  - Map widget in bottom-left quadrant (flexible height, min 200px)
  - Smaller widgets (max-width 100%) for compact display
  - Overflow hidden to prevent content from flowing off screen
- **Player Movement Methods**:
  - Command line: Type direction (n, s, e, w, ne, nw, se, sw, u, d)
  - Compass buttons: Click direction buttons on compass widget
  - Keypad navigation: Use keypad numbers (7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE)
- Compass button states:
  - Available: Bright green border and text
  - Unavailable: Lowlighted (40% opacity, dark colors) but still visible
  - All buttons always visible for centered appearance
- **Compass Coordinates Display**:
  - Green text matching compass theme
  - Centered alignment
  - Top border separator
  - Small font size (0.75em)
  - Shows map name and coordinates on separate lines
- Player Stats widget styling:
  - Retro terminal aesthetic matching game theme
  - Green borders and text (#00ff00)
  - Yellow section titles (#ffff00)
  - Cyan stat labels (#00ffff)
  - Visual HP bar (red) and Mana bar (blue)
  - Compact layout with organized sections
  - Overflow handling for long content
- Map widget styling:
  - Flexible height with minimum 200px
  - Canvas-based rendering
  - Black background with green border
- **God Mode Button Bar** styling:
  - Fixed position above command input
  - Retro terminal aesthetic (green borders, black background)
  - Button hover states
  - Disabled buttons with reduced opacity
- **Map Editor** styling:
  - Full-screen overlay (z-index 1000)
  - 100x100 grid canvas with room squares
  - Room colors: Normal (green #00ff00 fill, yellow #ffff00 border), Merchant (blue #0088ff fill, darker blue #0066cc border)
  - Empty spaces as outlined squares (only near existing rooms)
  - Side panel for room editing forms
  - Dialog overlay for map creation
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
- **Keypad Navigation**:
  - Use keypad numbers for directional movement (3rd navigation method)
  - Keypad mapping: 7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE
  - Only works when game view is visible and not typing in command input
  - Same keypad system as map editor speed mode for consistency
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
  - Room name with map name prefix, description, and players displayed in terminal
  - Auto-scroll to bottom on updates
  - Error messages displayed in terminal
- **Map Display**:
  - 25x25 grid view centered on player's current room
  - Rooms displayed as squares (10x10 pixels)
  - **Current room**: Bright green fill (#00ff00) with yellow border (#ffff00), 2px line width
  - **Other rooms**: Gray fill (#666) with dark border (#333)
  - **Preview rooms**: Dimmer green fill (#1a331a) with dimmer green border (#336633) - rooms from connected maps
  - Connection lines between adjacent rooms in all 8 directions
  - Automatically re-centers when player moves
  - Canvas-based rendering with retro terminal aesthetic
  - Shows all rooms within 25x25 viewport
  - **Coordinate Transformation**: Preview rooms from connected maps are transformed to appear in correct position relative to connection point
  - **Player Indicator Fallback**: Always draws current room indicator even if room not found in mapRooms array
  - **Y-axis Correction**: Properly inverts Y-axis so north appears at top of map
- **Map Preview System**:
  - When near a map connection, shows preview rooms from connected map
  - Preview rooms appear within 5 units of connection point
  - Preview rooms are transformed to appear in correct direction (north of connection shows rooms north, etc.)
  - Preview rooms are visually distinct (dimmer green) to indicate they're from a different map
  - Connection room itself is always included in preview
- **Coordinates Display**:
  - Updates automatically when room changes or map transitions
  - Shows current map name and coordinates (x, y)
  - Displays at bottom of compass widget
  - Format: `MapName\n(x, y)`
- **Keypad Navigation**:
  - Third method of player movement (in addition to command line and compass buttons)
  - Keypad number mapping: 7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE
  - Only active when game view is visible and player is not typing in command input
  - Consistent with map editor speed mode keypad navigation
  - Provides quick directional movement without mouse clicks or typing
- Player stats display:
  - Receives player stats from server on connection
  - Displays all 5 attributes (Brute Strength, Life Force, Cunning, Intelligence, Wisdom)
  - Displays all 5 abilities (Crafting, Lockpicking, Stealth, Dodge, Critical Hit)
  - Shows Hit Points with current/max and visual bar
  - Shows Mana with current/max and visual bar (only if maxMana > 0)
  - Updates automatically when stats change
- **God Mode UI**:
  - Show/hide god mode buttons based on `godMode` flag from `playerStats` message
  - Handle button clicks (Map button opens map editor)
- **Map Editor Implementation**:
  - **State Management**: Tracks current editor map, selected room(s), editor mode (edit/create/connect), zoom level, pan offsets, speed mode status, drag selection state
  - **Fixed 100x100 Grid Rendering**: Canvas-based rendering with automatic centering and scaling
    - All maps display on fixed 100x100 grid centered at 0,0
    - Coordinates adjusted for position relative to grid center
    - No scrolling required - everything fits on screen
    - Grid lines drawn only for visible area (performance optimization)
  - **Zoom System**:
    - Zoom level variable (editorZoom): 1.0 = normal, >1.0 = zoomed in, <1.0 = zoomed out
    - Range: 0.5x to 5.0x
    - Applied to cell size calculation in rendering
    - Mouse wheel event handler on canvas
  - **Pan System**:
    - Pan offset variables (editorPanX, editorPanY): Tracks view offset in map coordinates
    - Arrow key event handler (global, only active when editor open)
    - Pan amount: 5 squares per key press
    - Applied to offset calculation in rendering
  - **Speed Mode System**:
    - Activated when clicking an existing room
    - Keypad navigation (7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE)
    - Automatically creates rooms with generic name "Room X,Y" when navigating to empty spaces
    - Newly created rooms automatically selected and remain selected (red outline) for continued navigation
    - Speed mode state persists after room creation, allowing rapid continuous room placement
    - Navigating to existing rooms selects them and continues speed mode from that room
  - **Room Color System**:
    - Dark green (#006600) for rooms with adjacent rooms (adjoining)
    - Blue (#0088ff) for generic rooms (name starts with "Room ") or merchant rooms
    - Green (#00ff00) for named rooms (non-generic, non-merchant)
    - Color priority: Adjoining > Generic/Merchant > Normal
  - **Mass Selection System**:
    - Mouse drag to select multiple rooms
    - Tracks drag start/end coordinates
    - Converts screen coordinates to map coordinates for selection
    - Updates selectedRooms array with all rooms in drag rectangle
  - **Visual Selection System**:
    - Red highlight (#ff0000) for selected existing rooms
    - Red outline and fill for selected empty spaces (new room creation)
    - All mass-selected rooms show red borders
    - Map re-renders on selection change to show/hide highlights
  - **Room Selection**: Click room to select for editing (shows red border, activates speed mode)
  - **Room Creation**: 
    - Click empty space to create new room (shows red highlight, turns green after creation)
    - Speed mode: Use keypad to quickly create rooms while navigating
  - **Room Editing**: Compact side panel form to edit name, description, and type
  - **Global Edit Mode**: When multiple rooms selected, side panel shows "Global Edit" with ability to update all rooms at once
  - **Delete Functionality**:
    - Delete button for single rooms (shares line with "Update Room")
    - Delete button for mass selection (in Global Edit mode)
    - No confirmation modal
    - Client-side and server-side validation prevents deleting connected rooms
    - Shows alert modal if attempting to delete connected rooms
  - **New Map Creation**: Dialog form to create new map, opens blank 100x100 grid editor
  - **Map Size Calculation**: Auto-calculates map dimensions from room coordinate bounds
  - **Map Connection**: Select source room, choose direction and target map/coordinates
    - Connect mode can be entered with a room already selected (uses that room as source)
    - Or enter connect mode first, then click a room to select as source
    - Target room dropdown organized by street name using optgroups
    - Rooms within each street sorted by coordinates
    - Selecting target room from dropdown auto-fills X and Y coordinates
    - X and Y coordinates editable and displayed on same line
  - **Connection Validation**: Client-side and server-side validation of connections
  - **Click Coordinate Conversion**: Always uses fixed 100x100 grid centered at 0,0, accounts for zoom and pan
  - **Performance Optimization**: Only draws visible grid lines and rooms based on current viewport (zoom/pan)

### 7. WebSocket Message Protocol
- Client → Server:
  - `{ type: 'selectPlayer', playerName: 'Fliz' }` - when player selects character
  - `{ type: 'move', direction: 'N' }` - when player wants to move (N/S/E/W/NE/NW/SE/SW/U/D)
  - **Map Editor Messages** (god mode only):
    - `{ type: 'getMapEditorData', mapId: 1 }` - get all rooms for map editor
    - `{ type: 'createMap', name: 'New Map', width: 100, height: 100, description: '...' }` - create new map
    - `{ type: 'createRoom', mapId: 1, name: 'Room Name', description: '...', x: 0, y: 0, roomType: 'normal' }` - create new room
    - `{ type: 'updateRoom', roomId: 1, name: 'Updated Name', description: '...', roomType: 'merchant' }` - update room properties
    - `{ type: 'getAllMaps' }` - get list of all maps
    - `{ type: 'connectMaps', sourceRoomId: 1, sourceDirection: 'N', targetMapId: 2, targetX: 0, targetY: 0 }` - connect two maps
- Server → Client:
  - `{ type: 'roomUpdate', room: { id, name, description, x, y, mapName }, players: ['Fliz'], exits: { north: true, south: true, east: false, west: false, northeast: false, ... } }` - room state updates
  - `{ type: 'playerJoined', playerName: 'Hebron' }` - when someone joins current room
  - `{ type: 'playerLeft', playerName: 'Fliz' }` - when someone leaves current room
  - `{ type: 'moved', room: { id, name, description, x, y, mapName }, players: [...], exits: {...} }` - when player successfully moves to new room
  - `{ type: 'playerStats', stats: { bruteStrength, lifeForce, cunning, intelligence, wisdom, crafting, lockpicking, stealth, dodge, criticalHit, hitPoints, maxHitPoints, mana, maxMana, godMode: true/false } }` - player stats sent on connection (includes godMode flag)
  - `{ type: 'mapData', rooms: [{ id, name, x, y, mapId, isPreview, originalX, originalY }, ...], currentRoom: { x, y }, mapId: 1, connectionInfo: { direction, currentMapX, currentMapY, connectedMapX, connectedMapY } }` - all rooms data sent on connection or map transition
  - `{ type: 'mapUpdate', currentRoom: { x, y }, mapId: 1 }` - map position update when player moves within same map
  - `{ type: 'error', message: 'Ouch! You walked into the wall to the east.' }` - error messages
  - **Map Editor Messages** (god mode only):
    - `{ type: 'mapEditorData', rooms: [{ id, name, description, x, y, roomType, mapId, ... }], mapId: 1, mapName: 'Newhaven' }` - all rooms for editor
    - `{ type: 'mapCreated', mapId: 1, name: 'New Map' }` - new map created
    - `{ type: 'roomCreated', room: { id, name, description, x, y, roomType, mapId } }` - new room created
    - `{ type: 'roomUpdated', room: { id, name, description, x, y, roomType, mapId } }` - room updated
    - `{ type: 'allMaps', maps: [{ id: 1, name: 'Newhaven' }, ...] }` - list of all maps
    - `{ type: 'mapConnected', sourceRoom: {...}, targetRoom: {...} }` - maps connected successfully

## Key Files

1. **package.json** - Project dependencies and scripts
2. **database.js** - PostgreSQL connection pool, async database queries, multi-map system, room queries, map connections, god mode and room type support, map editor query functions
3. **server.js** - Express server + WebSocket server + movement handling + map transitions + god mode handlers + map editor WebSocket handlers
4. **public/index.html** - Frontend HTML with MajorMUD-style layout, compass coordinates, god mode buttons, map editor overlay
5. **public/style.css** - Retro terminal styling with coordinates display, god mode button bar, map editor styling
6. **public/client.js** - WebSocket client, UI logic, map rendering, preview system, coordinates display, god mode UI, map editor implementation
7. **docs/claude.md** - This documentation file

## Technical Decisions

- Using `pg` (PostgreSQL) with connection pooling for async database operations
- All database functions are async (return Promises, use `await`)
- Schema managed via SQL migration files (no inline schema creation)
- Environment-based configuration: `DATABASE_URL` from `.env` or Railway
- WebSocket server integrated with Express HTTP server
- Real-time updates via WebSocket broadcasts (no polling)
- Simple JSON message protocol for WebSocket communication
- **Multi-Map System**: Separate maps with local coordinates (0,0 at center for each map)
- **Map Connections**: Bidirectional connections between maps at specific rooms
- **Coordinate-based map system**: Rooms have x,y coordinates within their map
- **Map Transitions**: Seamless movement between maps without player awareness
- **Preview System**: Shows rooms from connected maps when near connection points
- Movement validation: server checks if adjacent room exists OR if map connection exists before allowing movement
- Players track their current room in database for persistence (players rejoin where they left)
- Direction mapping: 
  - N=(0,+1), S=(0,-1), E=(+1,0), W=(-1,0)
  - NE=(+1,+1), NW=(-1,+1), SE=(+1,-1), SW=(-1,-1)
  - U/D prepared for future z-coordinate implementation
- Only connected players shown in room (not all players from database)
- MajorMUD-style terminal interface for authentic retro gaming experience
- Text command system with multiple command variations for user convenience
- Compass widget always shows all directions (unavailable ones lowlighted) for visual consistency
- **Coordinate Display**: Always visible current position for navigation reference
- **God Mode System**: Privilege-based administrative interface for map editing and future features
- **Room Type System**: Classification system for rooms (normal, merchant, etc.) with visual distinction
- **Map Editor**: Full-featured map creation and editing tool with 100x100 grid, room management, and map connections

## UI/UX Features

- **Layout**: 2/3 terminal, 1/3 right panel (4 quadrants)
- **Terminal**: Retro green-on-black text interface
- **Room Display**: Map name prefix on room names (e.g., "Newhaven, north street 11")
- **Player Stats**: Comprehensive stat display in top-left quadrant
  - Attributes section (5 stats)
  - Abilities section (5 abilities)
  - Hit Points bar with current/max display
  - Mana bar with current/max display (caster only)
- **Map**: 25x25 grid view in bottom-left quadrant
  - Shows rooms as squares (10x10 pixels) with connection lines
  - Current room highlighted (bright green with yellow border)
  - Preview rooms from connected maps (dimmer green)
  - Automatically centers on player
  - Displays all rooms within viewport
  - Proper Y-axis orientation (north at top)
  - Always shows player indicator even if room data missing
- **Compass**: Visual navigation widget with all directions visible
  - Coordinates display at bottom showing map name and (x, y)
  - Updates automatically on movement and map transitions
- **Commands**: Text-based with multiple input formats
- **Player List**: Inline display with automatic "No one else is here." management
- **Error Messages**: Descriptive wall collision messages
- **Real-time Updates**: Instant visibility of players entering/leaving rooms
- **Map Preview**: Visual indication of connected areas before entering them
- **God Mode Buttons**: Fixed button bar above command input (visible only to god mode players)
  - Map button opens full-screen map editor
  - Other buttons (Items, Spells, Craft, NPC) reserved for future
- **Map Editor**: Full-screen overlay for map creation and editing
  - 100x100 grid canvas with room visualization
  - Room type color coding (normal=green, merchant=blue)
  - Click-to-edit and click-to-create functionality
  - Map connection system with validation
  - Auto-calculated map dimensions based on room bounds

## Player Character System

### Stats (Base 10 for all players)
- **Brute Strength**: Physical power and melee damage potential
- **Life Force**: Vitality and health capacity
- **Cunning**: Deception and tactical thinking
- **Intelligence**: Mental acuity and problem-solving
- **Wisdom**: Insight and magical understanding

### Abilities (Base 0, algorithm-driven later)
- **Crafting**: Ability to create items
- **Lockpicking**: Ability to open locks and containers
- **Stealth**: Ability to move undetected
- **Dodge**: Ability to avoid attacks
- **Critical Hit**: Chance for enhanced damage

### Resources
- **Hit Points**: Current health (50/50 for both players)
- **Mana**: Magical energy (0 for Fliz, 10/10 for Hebron)

### Character Differences
- **Fliz**: Non-caster, 0 Mana, **God Mode enabled** (administrative privileges)
- **Hebron**: Caster, 10/10 Mana, God Mode disabled

## Map System

### Multi-Map Architecture
- **Separate Maps**: Each map is a distinct zone with its own coordinate system
- **Local Coordinates**: Each map has (0,0) at its center
- **Map Connections**: Specific rooms can connect to rooms in other maps
- **Bidirectional**: Connections work in both directions
- **Seamless Transitions**: Players don't realize they're switching maps

### Newhaven Map (20x20)
- **Coordinates**: -10 to +9 in both X and Y
- **Structure**: Perimeter roads + Center Street
  - Perimeter: Westwall, Eastwall, North, South Streets
  - Center Street: Vertical road at x=0
  - Town Square: Center intersection at (0, 0)
- **Connection Point**: "north street 11" at (0, 9) connects north to Northern Territory

### Northern Territory Map (10x10)
- **Coordinates**: -5 to +4 in both X and Y
- **Structure**: Perimeter roads + Center Street
  - Perimeter: Westwall, Eastwall, North, South Streets
  - Center Street: Vertical road at x=0
  - Connection Point: "south street 6" at (0, -5) connects south to Newhaven
- **Half the size** of Newhaven for variety

### Map Widget Features
- **25x25 Viewport**: Shows 25x25 grid area centered on player
- **Dynamic Centering**: Automatically re-centers when player moves
- **Room Visualization**: 
  - Rooms as squares (10x10 pixels)
  - Current room: Bright green fill with yellow border
  - Other rooms: Gray fill with dark border
  - Preview rooms: Dimmer green fill and border
- **Connection Lines**: Gray lines connecting adjacent rooms in all 8 directions
- **Coordinate System**: Y-axis properly inverted (north = up on screen)
- **Preview System**: Shows rooms from connected maps when near connection points
- **Player Indicator**: Always visible, even if room data is missing

### Map Preview System
- **Trigger**: When player is in a room with a map connection
- **Range**: Shows rooms within 5 units of connection point
- **Visual Distinction**: Preview rooms use dimmer green colors
- **Coordinate Transformation**: Preview rooms positioned correctly relative to connection
- **Connection Room**: Always included in preview
- **Purpose**: Allows players to see what's ahead before entering

### Database Management
- **One-Time Cleanup Migration**: Removes invalid rooms (not on perimeter or center street) - runs only once as migration `001_cleanup_invalid_rooms`
  - **Important**: This cleanup was converted to a one-time migration to prevent deletion of user-created rooms via the map editor
  - After the first run, user-created rooms persist across server restarts
- **Player Safety**: Moves players to Town Square before deleting their current room (during one-time cleanup)
- **Migration System**: Uses `schema_migrations` table to track applied migrations and prevent re-running
- **Connection Room Creation**: Automatically ensures connection rooms exist with proper connection info
- **Room Type System**: Rooms can be classified by type (normal, merchant, etc.) with visual distinction
- **Map Size Calculation**: Map dimensions automatically calculated from room coordinate bounds
- **God Mode Support**: Database tracks god mode status per player for administrative features

## Recent Updates

### PostgreSQL Migration (Latest)

#### Database Migration from SQLite to PostgreSQL
- **Complete rewrite** of `database.js` from synchronous SQLite (`better-sqlite3`) to async PostgreSQL (`pg`)
- **Migration System**: SQL-based migrations in `migrations/` directory
  - `001_schema.sql` - Core PostgreSQL schema (SERIAL, BOOLEAN, TIMESTAMP)
  - `002_seed_data.sql` - Initial data (maps, rooms, players, items, room type colors)
  - `003_indexes.sql` - Performance indexes
- **Data Migration Script**: `scripts/migrate-data.js` exports existing SQLite data to PostgreSQL
- **All database functions converted to async**: All 176+ `db.` calls in `server.js` updated to `await`
- **Connection Pooling**: Uses `pg.Pool` for efficient connection management
- **Environment Configuration**: `DATABASE_URL` from `.env` (local) or Railway (production)
- **PostgreSQL Syntax**: 
  - `SERIAL PRIMARY KEY` instead of `INTEGER PRIMARY KEY AUTOINCREMENT`
  - Native `BOOLEAN` type instead of `INTEGER`
  - `TIMESTAMP DEFAULT NOW()` instead of `TEXT DEFAULT CURRENT_TIMESTAMP`
  - `RETURNING id` for inserts instead of `lastInsertRowid`
  - `ON CONFLICT DO NOTHING` instead of `INSERT OR IGNORE`
- **Removed Legacy Code**: All SQLite-specific cleanup functions, inline seeding, and startup normalizers removed

#### Session Bug Fix (Multiplayer Support)
- **Fixed "Session Mismatch" Error**: Changed `connectedPlayers` from `sessionId` key to unique `connectionId` per WebSocket
- **Multiple Browser Support**: Players can now open multiple tabs/browsers with different characters simultaneously
- **Connection Tracking**: Each WebSocket gets unique `connectionId` (e.g., `conn_1`, `conn_2`)
- **Room Update Timer Fix**: Fixed timer loop to use `connectionId` instead of undefined `sessionId`

#### UI Improvements
- **Player Name in HTML Title**: Browser tab title updates to `"The Game - [PlayerName]"` for easy identification
- **Map Editor Enhancements**:
  - Room ID display: Shows database ID below room name field (e.g., "ID: 123")
  - Item selector width: Adjusted from `flex: 1` to `flex: 0.75` to give "Add" button more space
  - Side panel button width: Set to 20% for consistent sizing

### Route-Based Authentication and Session Management

#### Session-Based Authentication System
- **express-session Integration**: Server uses `express-session` middleware with MemoryStore
- **HttpOnly Cookies**: Session cookies are HttpOnly (not accessible via JavaScript)
- **24-Hour Expiration**: Sessions expire after 24 hours of inactivity
- **Server-Side Session Store**: Custom session store (`sessionStore` Map) tracks player data per session

#### Route Structure
- **`/` (Root)**: Landing page with character selection (public/index.html)
- **`/game`**: Main game UI (public/game.html) - requires valid session
- **`/map`**: Map Editor (public/map-editor.html) - requires valid session AND god mode
- **`/npc`**: NPC Editor (public/npc-editor.html) - requires valid session AND god mode

#### Character Selection Flow
1. User visits `/` and sees character selection screen
2. User clicks character button (Fliz or Hebron)
3. Client sends `POST /api/select-character` with `{ playerName }`
4. Server validates player exists, creates session, sets cookie
5. Client redirects to `/game`
6. WebSocket connects and sends `authenticateSession` message
7. Server validates session cookie and associates WebSocket with player

#### Protected Routes Middleware
- **`validateSession(req, res, next)`**: Ensures valid session exists, redirects to `/` if not
- **`optionalSession(req, res, next)`**: Loads session if exists but doesn't require it
- **`checkGodMode(req, res, next)`**: Requires valid session AND `flag_god_mode = 1`

#### WebSocket Authentication
- WebSocket upgrade request includes session cookie
- `getSessionFromRequest(req)` extracts and validates session from cookie
- `authenticateSession` message type validates existing session on WebSocket connect
- Each WebSocket connection gets a unique `connectionId` (e.g., `conn_1`, `conn_2`)
- `connectedPlayers` Map uses `connectionId` as key (not `sessionId`) to support multiple tabs/browsers
- All subsequent WebSocket messages require valid `connectionId` in `connectedPlayers` map
- This allows multiple characters from the same browser to connect simultaneously without conflicts

#### God Mode UI Visibility
- God mode buttons (Map, NPC, Items, Spells, Craft) only visible to god mode players
- `updateGodModeUI(hasGodMode)` adds/removes `hidden` class from button bar
- Non-god mode players see no god mode UI elements
- God mode status from `playerStats.godMode.value` (dynamic stats system)

#### Security Features
- **Rate Limiting**: Character selection limited to 30 attempts per 30 seconds per IP
- **Input Sanitization**: Player names trimmed and validated
- **Session Cleanup**: Expired sessions cleaned up every 5 minutes
- **No URL Parameters**: No sensitive data in URL strings (session-based instead)

#### API Endpoints
- **`POST /api/select-character`**: Creates session for player
  - Request: `{ playerName: string }`
  - Response: `{ success: true, sessionId: string }` or `{ success: false, error: string }`

#### Future Security Roadmap
- Session store can be upgraded to Redis for scalability
- Character selection endpoint can be extended to require password
- Add `accounts` and `user_characters` tables for full account system
- Add password hashing and authentication
- Add account recovery mechanisms

### Code Cleanup (This Update)
- **Removed NPC Seeding Code**: One-time NPC seed data (10 Glowroot NPCs) removed from database.js
- **Removed Duplicate Cleanup**: Duplicate NPC cleanup function no longer needed
- **Fixed ConnectedPlayers Bug**: Fixed bug where god mode checks used sessionId instead of playerName
- **Fixed GodMode Value Access**: Client now correctly accesses `godMode.value` from dynamic stats

### NPC Editor UI Refactoring

#### NPC Editor Layout Structure
- **Fixed Header**: NPC Editor header and toolbar remain fixed at top (never scrolls)
- **Scrollable Form**: Only the NPC edit form panel scrolls with `max-height: calc(100vh - 140px)`
- **Consistent Spacing**: 12px gap between form rows, 10-15px vertical spacing between sections

#### Form Grouping (Horizontal Flex Rows)
- **Row 1**: Name (70% width) + Color (30% width)
- **Row 2**: Type (25%) + Base ms (25%) + Diff (25%) + Active (25%)
- **Row 3**: Required Stats JSON (50%) + Required Buffs JSON (50%) - side-by-side textareas
- **Row 4**: Input Items JSON (50%) + Output Items JSON (50%) - side-by-side textareas
- **Row 5**: Failure States JSON (full width)
- **Textarea Standardization**: All JSON textareas in rows 3 & 4 use `flex: 1; min-height: 80px;` for identical sizing and perfect alignment

#### Label Cleanup
- **Clean Labels**: "Required Stats", "Required Buffs", "Input Items", "Output Items", "Failure States"
- **JSON Sublabels**: Small dimmed "(JSON)" sublabel (8px font, color: #888) under each JSON field label

#### Room Placements UI
- **Horizontal Controls**: Map selector + Room selector + "Add to Room" button in one horizontal row
- **Clean List Format**: `[MapName – RoomName (x,y)] [REMOVE]` with consistent spacing (12px gap between items)
- **Remove Buttons**: Standardized size (160px width, 30px height) matching Save/Add buttons, aligned on right side

#### Save Button
- **Centered**: Save NPC button centered with `margin-top: 20px`
- **Proper Alignment**: Button does not float or misalign

#### CSS Structure
- **Row Containers**: Each logical row wrapped in `.npc-row` flex container with `display: flex; gap: 12px;`
- **Field Groups**: Proper flex sizing for 70/30, 25/25/25/25, 50/50, and full-width layouts
- **Theme Preservation**: Retro green terminal theme maintained (neon green borders, black background, green text)

#### NPC System Features (Previous Implementation)
- **Scriptable NPCs**: Non-combat, deterministic resource-producing NPCs with cycle timers
- **NPC Placement**: NPCs can only be placed in rooms belonging to "Moonless Meadow" map (enforced validation)
- **NPC Cycle Engine**: Background tick loop processes NPC cycles independently of player actions
- **Type-Driven Logic**: NPC behavior routed by type (rhythm, stability, worker, tending, rotation, economic, farm, patrol, threshold)
- **NPC Display**: NPCs appear in room text terminal with color-coded names
- **LOOK Command**: Players can inspect NPCs by typing `look [npc name]` or `l [npc name]` (partial matching supported)
- **NPC Editor**: Full-featured editor for creating and editing NPC definitions
  - All NPC characteristics editable (name, description, type, cycle time, difficulty, stats, buffs, items, failure states)
  - Color picker for NPC display color (10 predefined colors)
  - Room placement management (add/remove NPCs from Moonless Meadow rooms)
  - Compact, organized layout with proper scrolling

### Latest Improvements (Map Editor Fixes)

#### Dynamic Stats System with Prefix-Based Auto-Detection
- **Prefix-Based Column Naming**: Database columns use prefixes to automatically identify stat types
  - `stat_*` - Attributes (base stats like `stat_brute_strength`, `stat_cunning`)
  - `ability_*` - Abilities (skills like `ability_crafting`, `ability_stealth`)
  - `resource_*` - Resources (hit points, mana, etc. like `resource_hit_points`, `resource_mana`)
  - `resource_max_*` - Max values for resources (like `resource_max_hit_points`)
  - `flag_*` - Special boolean flags (like `flag_god_mode`)
- **Auto-Detection**: System automatically queries database schema and detects all columns matching prefix patterns
- **Display Name Generation**: Automatically converts column names to display names (e.g., `stat_brute_strength` → "Brute Strength")
- **CamelCase Conversion**: Automatically converts to JavaScript camelCase (e.g., `stat_brute_strength` → `bruteStrength`)
- **Adding New Stats**: Simply add a database column with the appropriate prefix - no code changes needed!
- **Migration System**: Automatically migrates existing columns to prefixed naming convention
- **Bidirectional Connection Deletion**: Deleting a connection on one end automatically removes it from both ends
- **Orphaned Connection Handling**: Gracefully handles connections where target map/room no longer exists

#### Player Session Management
- **Page Title Updates**: Browser tab title updates to show active player (`"The Game - [PlayerName]"`)
- **Auto-Reconnection**: On WebSocket disconnect/reconnect, system automatically reconnects player based on page title
- **Pending Selection Queue**: If player selection happens before connection is ready, it's queued and executed automatically
- **No Auto-Focus**: Command input no longer auto-focuses on game entry, allowing number pad navigation by default

#### Map Editor Enhancements
- **Auto-Zoom to Player Room**: When opening map editor, automatically zooms to show 20x20 area centered on player's current room
- **Auto-Load Current Map**: Automatically loads and selects player's current map when editor opens
- **Player Room Highlighting**:
  - **Purple Outline**: Player's current room shows purple outline (`#ff00ff`) when NOT selected
  - **Red Outline**: Player's current room shows red outline when selected (same as other selected rooms)
  - Always visible, making it easy to locate player position
- **Exit Room Styling**: Rooms with map connections (exit rooms) display in white (`#ffffff`) matching player map view
  - Light grey border (`#cccccc`) for connected rooms
  - Small yellow indicator dot for quick identification
- **Connection Management UI**:
  - Compact connection info display with smaller font sizes (0.75em title, 0.7em details)
  - "Delete Connection" button to remove map connections
  - Orphaned connections marked with "(Orphaned)" label in orange
  - Improved layout to prevent overflow
- **Improved Side Panel**: Reduced font sizes throughout for better fit
  - Room name, description, and type fields use smaller fonts
  - Better spacing and padding
  - All content fits without scrolling

### God Mode and Map Editor System (Previous)

#### Recent Map Editor Improvements (Alpha Release)
- **Map Centering & Scaling**: Map automatically centers and scales to fit canvas - no scrolling required
- **Empty Map Grid Display**: Full 100x100 grid with all grid lines visible when map has no rooms
- **Zoom & Pan Controls**:
  - **Mouse Wheel Zoom**: Scroll up to zoom in, scroll down to zoom out
    - Zoom range: 0.5x to 5.0x
    - Zoom speed: 0.1 per scroll step
    - Works on both empty maps and maps with rooms
  - **Arrow Key Panning**: Move view by 5 squares in any direction
    - Arrow Up: Pan up (north)
    - Arrow Down: Pan down (south)
    - Arrow Left: Pan left (west)
    - Arrow Right: Pan right (east)
    - Pan resets when loading new map or closing editor
- **Visual Selection Feedback**: Red highlight system for selected rooms and empty spaces
  - Selected existing rooms show red border (#ff0000) with 3px line width
  - Selected empty spaces show red outline with semi-transparent fill (rgba(255, 0, 0, 0.2))
- **Compact Side Panel**: Optimized layout with no scrolling
  - X and Y coordinates on same line (format: "X: [value] Y: [value]")
  - Room name label and input on same line using flexbox
  - Smaller fonts (0.9em for titles, 11px for labels) and reduced spacing
  - Textarea height: 60px min, 80px max
  - All content fits without scrolling
- **Room Creation Feedback**: Newly created rooms automatically appear green after creation
- **Performance Optimization**: Only visible grid lines and rooms are drawn for better performance when zoomed/panned

#### God Mode Implementation
- Added `god_mode` column to players table (INTEGER, default 0)
- Fliz has god mode enabled (value 1), Hebron does not (value 0)
- God mode buttons visible only to players with god mode enabled
- Button bar fixed above command input with retro terminal styling

#### Map Editor Features
- Full-screen map editor overlay with 100x100 grid canvas
- **Auto-centering and scaling**: Map automatically centers and scales to fit canvas (no scrolling required)
- **Empty map support**: Displays full 100x100 grid when map has no rooms for easy room placement
- **Visual selection feedback**: Selected rooms highlighted with red border (#ff0000)
- **Empty space selection**: Clicking empty space shows red outline with semi-transparent fill for new room creation
- Room type system: Normal (green #00ff00) and Merchant (blue #0088ff) with visual distinction
- Click-to-edit existing rooms (name, description, type)
- Click-to-create new rooms in empty spaces
- Create new maps with auto-calculated dimensions
- Map connection system with bidirectional validation
- **Compact side panel**: No scrolling, optimized layout
  - X and Y coordinates on same line (no "Coordinates:" label)
  - Room name label and input on same line
  - Smaller font sizes for better fit
  - All form elements visible without scrolling
- Map selector dropdown for switching between maps

#### Database Enhancements
- Added `room_type` column to rooms table (TEXT, default 'normal')
- Added query functions: `getAllMaps`, `createMap`, `createRoom`, `updateRoom`, `getMapBounds`, `updateMapSize`
- Map dimensions automatically calculated from room coordinate bounds

#### Server Enhancements
- Send `godMode` flag in `playerStats` message
- Map editor WebSocket handlers with god mode validation
- Map connection validation (checks exits, conflicts, bidirectional setup)

#### UI Enhancements
- God mode button bar styling
- Map editor overlay and dialog styling
- Room type color coding in map editor
- Empty space visualization (outlined squares near existing rooms)
- **Map centering**: Automatic centering and scaling of map content to fit canvas
- **Zoom & Pan controls**: Mouse wheel zoom and arrow key panning for better navigation
- **Selection highlighting**: Red visual feedback for selected rooms and empty spaces
- **Compact form layout**: Side panel optimized to fit all content without scrolling
- **Empty map grid**: Full 100x100 grid displayed for maps with no rooms
- **Performance optimization**: Only visible elements drawn based on current viewport

### Map with Connecting Areas Patch

### Multi-Map System
- Implemented separate maps (Newhaven and Northern Territory)
- Added map connection system with bidirectional travel
- Seamless map transitions without player awareness
- Map name display in room names and coordinates

### Map Preview Feature
- Preview rooms from connected maps visible when near connection points
- Visual distinction for preview rooms (dimmer green)
- Coordinate transformation for correct positioning
- Always includes connection room in preview

### Map Rendering Improvements
- Fixed player indicator visibility (always shows current room)
- Corrected Y-axis orientation (north at top)
- Increased room size from 8px to 10px
- Added fallback rendering for missing room data
- Improved viewport calculations

### UI Enhancements
- Added coordinates display to compass widget
- Map name prefix on room names
- Improved layout to prevent overflow
- Better widget sizing and spacing

### Bug Fixes
- Fixed missing connection room creation
- Fixed map data not including mapId for all rooms
- Fixed player indicator not showing in new maps
- Fixed map orientation issues
- Fixed preview room coordinate transformation

## God Mode System

### Overview
God mode is a special privilege system that grants players administrative capabilities. Currently, only Fliz has god mode enabled.

### Features
- **God Mode Flag**: Stored in `players.god_mode` column (INTEGER, 0 or 1)
- **God Mode Buttons**: Visible only to players with god mode enabled
  - Map: Opens map editor (functional)
  - NPC: Opens NPC editor (functional)
  - Items: Reserved for future (disabled)
  - Spells: Reserved for future (disabled)
  - Craft: Reserved for future (disabled)

### Map Editor
- **Fixed 100x100 Grid**: All maps display on a fixed 100x100 grid centered at 0,0
  - Coordinates adjusted for position relative to grid center
  - Makes editing easier and more expandable with zoom
  - Works for both existing maps and new maps
- **Auto-Centering**: Grid automatically centers and scales to fit canvas - no scrolling required
- **Zoom Controls**:
  - Mouse wheel zoom: 0.5x to 5.0x zoom range
  - Zoom speed: 0.1 per scroll step
  - Applied to all maps regardless of room count
  - Zoom resets when loading new map or closing editor
- **Pan Controls**:
  - Arrow keys move view by 5 squares
  - Up/Down arrows: Pan vertically
  - Left/Right arrows: Pan horizontally
  - Pan resets when loading new map or closing editor
- **Speed Mode**:
  - Click a room to activate speed mode
  - Use keypad numbers for directional navigation:
    - 7 = NW, 8 = N, 9 = NE
    - 4 = W, 6 = E
    - 1 = SW, 2 = S, 3 = SE
  - Automatically creates rooms with generic name "Room X,Y" when navigating to empty spaces
  - Newly created rooms are automatically selected and remain selected (red outline) for continued navigation
  - Speed mode stays active after room creation, allowing rapid continuous room placement
  - Navigate to existing rooms to select them and continue from there and remain selected (red outline)
  - Speed mode stays active after room creation for rapid continuous navigation
  - Navigate to existing rooms to select them and continue from there
- **Room Color System**:
  - **Dark Green (#006600)**: Rooms with adjacent/adjoining rooms (connected)
  - **Blue (#0088ff)**: Generic rooms (name starts with "Room ") or merchant rooms
  - **Green (#00ff00)**: Named rooms (non-generic, non-merchant)
  - Color priority: Adjoining > Generic/Merchant > Normal
- **Visual Selection Feedback**:
  - Selected existing rooms: Red border (#ff0000) with 3px line width
  - Selected empty spaces: Red outline with semi-transparent red fill (rgba(255, 0, 0, 0.2))
  - Mass selected rooms: All show red borders
  - Connection source rooms: Orange border (#ff8800)
- **Room Editing**: Click existing room to edit name, description, and type
- **Room Creation**: 
  - Click empty space to create new room (shows red highlight, turns green after creation)
  - Speed mode: Use keypad to quickly create rooms while navigating
- **Mass Selection & Global Edit**:
  - Hold mouse button and drag to select multiple rooms
  - Side panel shows "Global Edit" mode for multiple rooms
  - Update all selected rooms at once (name, description, type)
  - Delete all selected rooms at once
- **Delete Functionality**:
  - Delete button for single rooms (shares line with "Update Room")
  - Delete button for mass selection (in Global Edit mode)
  - No confirmation modal
  - Server-side validation prevents deleting connected rooms
  - Shows alert if attempting to delete connected rooms
- **Map Creation**: Create new maps with auto-calculated size based on room bounds
- **Map Connections**: Connect rooms between maps with validation
  - Source room must have available exit in requested direction
  - Target room must exist and have available exit in opposite direction
  - Bidirectional connection automatically established
  - **Connect Maps Workflow**:
    - Select a room, then click "Connect Maps" button (or click "Connect Maps" then select a room)
    - Source room is automatically set when entering connect mode with a selected room
    - Target map dropdown loads all available maps
    - Target room dropdown groups rooms by street name (using optgroups)
    - Rooms within each street are sorted by coordinates (X, then Y)
    - Selecting a room from dropdown automatically fills X and Y coordinates
    - X and Y coordinates are editable and displayed on same line
    - Cancel button visible and accessible at bottom of form

### Map Editor UI
- Full-screen overlay with 100x100 grid canvas
- **Compact Side Panel**: Optimized layout with no scrolling
  - X and Y coordinates displayed on same line (format: "X: [value] Y: [value]")
  - Room name label and input on same line using flexbox
  - Smaller font sizes (0.9em for titles, 11px for labels)
  - Reduced spacing and textarea height (60px min, 80px max)
  - All form elements visible without scrolling
- Map selector dropdown
- Create New Map button
- Connect Maps button (enters connection mode)
- Empty spaces shown as outlined squares (only near existing rooms when map has rooms)
- **Grid Display**: Full 100x100 grid with all lines visible for empty maps

### Database Schema
- `players.god_mode` (INTEGER, default 0)
- `rooms.room_type` (TEXT, default 'normal')

### WebSocket Messages
- Client → Server:
  - `getMapEditorData` - Get all rooms for map editor
  - `createMap` - Create new map
  - `createRoom` - Create new room
  - `updateRoom` - Update room properties
  - `getAllMaps` - Get list of all maps
  - `connectMaps` - Connect two maps
- Server → Client:
  - `mapEditorData` - All rooms for editor
  - `mapCreated` - New map created
  - `roomCreated` - New room created
  - `roomUpdated` - Room updated
  - `allMaps` - List of all maps
  - `mapConnected` - Maps connected successfully

## PostgreSQL Database

All game data is stored in a PostgreSQL database. Connection string provided via `DATABASE_URL` environment variable (from `.env` locally or Railway in production). This includes:

### Core Tables
| Table | Purpose |
|-------|---------|
| `maps` | Map definitions (name, size, description) |
| `rooms` | Room definitions with coordinates, connections, and types |
| `players` | Player data, stats, abilities, resources, and flags |
| `items` | Master item definitions (name, description, type) |
| `room_items` | Items placed on the ground in rooms |
| `player_items` | Player inventories |
| `scriptable_npcs` | NPC definitions (type, cycle time, input/output items, etc.) |
| `room_npcs` | NPC placements in rooms with state tracking |

### Key Relationships
- `room_items.item_name` references items by name (not foreign key for flexibility)
- `room_npcs.npc_id` references `scriptable_npcs.id`
- `room_npcs.state` is JSON storing NPC runtime state (harvest_active, cooldown, etc.)
- `scriptable_npcs.input_items` defines required items for NPC interactions (JSON)
- `scriptable_npcs.output_items` defines items produced by NPC (JSON)

### NPC input_items Format
Required items for harvesting are stored in `scriptable_npcs.input_items` as JSON:
```json
{"Harvester Rune": 1}
```
This means the player must have 1 "Harvester Rune" in inventory to harvest this NPC.

## Rhythm NPC Harvest Session System

### Overview
Rhythm NPCs (like Pulsewood Harvester) only produce items during active harvest sessions.

### State Machine
```
IDLE → (harvest command + has required items + no cooldown) → HARVESTING
HARVESTING → (unsafe command or room change) → COOLDOWN (2 min)
COOLDOWN → (time expires) → IDLE
```

### State Storage (room_npcs.state JSON)
```json
{
  "harvest_active": true,
  "harvesting_player_id": 123,
  "cooldown_until": 1700000000000,
  "cycles": 15
}
```

### Commands
- `harvest <npc>` / `h <npc>` / `p <npc>` - Start harvest session
- `collect <npc>` / `c <npc>` / `gather <npc>` / `g <npc>` - Aliases

### Safe Commands (don't interrupt harvest)
- Movement: n, s, e, w, ne, nw, se, sw, u, d
- Inventory: inventory, inv, i
- Look: look, l

### Interruption
Any other command or room movement ends the harvest session and starts cooldown.

### Required Items
Required items come from the NPC's `input_items` field in `scriptable_npcs` table.
This is a data relationship, not hardcoded - items can be changed in NPC Editor.

## Recent Updates (Latest Session)

### Encumbrance System
A complete player encumbrance system that limits how much players can carry.

#### Database Changes
- **`items.encumbrance`**: New column storing item weight (INTEGER, default 1)
  - Pulse Resin: 2 encumbrance
  - Harvester Rune: 5 encumbrance
- **`players.resource_max_encumbrance`**: Max carry capacity (INTEGER, default 100)

#### Encumbrance Mechanics
- **Current Encumbrance**: Calculated from player inventory (sum of item weight × quantity)
- **Encumbrance Tiers**:
  - **Light** (0-33.3%): Normal movement
  - **Medium** (33.4-66.6%): 700ms movement delay
  - **Heavy** (66.7-99%): 1200ms movement delay
  - **Stuck** (100%): Cannot move, must drop items

#### Take Command Updates
- Enforces encumbrance limits when picking up items
- `take all` only takes as many as player can carry
- Shows encumbrance in feedback: "You pick up 5 Pulse Resin. (10/100)"
- Warns when encumbrance limits quantity taken

#### Player Stats Widget
- Displays encumbrance as "X/100 (level)" with color-coded bar
- Colors: Green (light), Yellow (medium), Orange (heavy), Red (stuck)
- Updates in real-time when items are picked up/dropped

### Item Editor
Full CRUD editor for item definitions (God Mode only).

#### Features
- Create, edit, and view all item definitions
- Fields: Name, Type, Description, Active, Poofable, **Encumbrance**
- Item types: Sundries, Weapon, Armor, Consumable, Material, Quest
- Poofable items disappear when player leaves room

#### Route
- **`/items`**: Item Editor (requires god mode)

### Player Editor
Comprehensive player stat editor with inventory management (God Mode only).

#### Features
- **Stats Section**: Edit all player attributes, abilities, resources
- **Current Encumbrance**: Read-only field showing calculated encumbrance from inventory
- **Max Encumbrance**: Editable max carry capacity
- **God Mode Flag**: Toggle admin privileges
- **Inventory Management**:
  - View player's inventory with item weights
  - Add items with quantity (enforces encumbrance limits)
  - Remove items from inventory
  - Shows encumbrance per item `(5)` and total `[25]`

#### Route
- **`/player`**: Player Editor (requires god mode)

### Jump Command (God Mode Teleport)
Instant teleport system for god mode players.

#### Command
- `/jump` or `jump`: Opens the Jump Widget

#### Jump Widget Features
- **Map Selector**: Dropdown of all available maps
- **Visual Map**: Canvas rendering of selected map's rooms
- **Room Info**: Hover to see room name and coordinates
- **Click to Teleport**: Click any room to instantly teleport
- Current room highlighted in green with yellow border
- Map connection rooms shown in white

#### Server Handlers
- `getJumpMaps`: Returns all available maps
- `getJumpRooms`: Returns all rooms for selected map
- `jumpToRoom`: Teleports player (handles harvest interruption, notifications)

### Widget System Enhancements

#### Widget Toggle Bar
- Icons at top of widget panel to toggle widgets on/off
- Visual indication: highlighted = active, dimmed = inactive
- Max 4 widgets visible in 2x2 grid
- 5th widget replaces bottom-right slot

#### NPC Widget
- **Auto-shows** during harvest or cooldown
- **Auto-hides** when cooldown complete
- Displays:
  - NPC name
  - Status (Harvesting/Cooling Down/Ready)
  - Progress bar (drains during harvest, fills during cooldown)
  - Timing info: Pulse time, Harvest time, Cooldown time

#### Room Items Display
- Fixed bar above command input showing items on ground
- Updates dynamically without scrolling terminal
- Format: "On the ground: Pulse Resin (5), Harvester Rune (1)"

### Harvest System Updates

#### Harvest Session Lifecycle
```
IDLE → harvest command → HARVESTING (produces items)
HARVESTING → unsafe command/move → COOLDOWN
COOLDOWN → time expires → IDLE (ready)
```

#### Features
- Required items check (needs Harvester Rune)
- Cooldown prevents re-harvesting same NPC
- "This creature is not currently capable of harvest" message during cooldown
- Progress bars in NPC widget
- Item production only during active harvest

### QoL Improvements

#### Numpad Navigation Enhancement
- If focused on command input and numpad pressed, blurs input and navigates
- Allows seamless switching between typing and movement
- Works bidirectionally: regular keys → focus input, numpad → navigate

#### Database Startup Cleanup
- Silenced repetitive startup messages
- Migration messages only show when actually migrating
- Old columns dropped after migration to prevent re-running

#### God Mode Column Fix
- Fixed `god_mode` → `flag_god_mode` references throughout server.js
- Ensures god mode checks work correctly for all features

### Project Structure Update
```
thegame/
├── package.json
├── server.js
├── database.js
├── npcLogic.js
├── public/
│   ├── index.html (landing/character selection)
│   ├── game.html (main game UI with widgets)
│   ├── map-editor.html
│   ├── npc-editor.html
│   ├── item-editor.html (NEW)
│   ├── player-editor.html (NEW)
│   ├── style.css
│   ├── client.js
│   ├── map-editor.js
│   ├── npc-editor.js
│   ├── item-editor.js (NEW)
│   └── player-editor.js (NEW)
├── migrations/
│   ├── 001_schema.sql
│   ├── 002_seed_data.sql
│   └── 003_indexes.sql
├── scripts/
│   ├── migrate.js
│   └── migrate-data.js
├── docs/
│   ├── claude.md
│   └── requirements.md
└── .env (DATABASE_URL for PostgreSQL)
```

### New Database Functions
```javascript
// Encumbrance
getPlayerCurrentEncumbrance(playerId)  // Calculate from inventory
getItemEncumbrance(itemName)           // Get item weight

// Player management
getAllPlayers()                        // List all players
getPlayerById(id)                      // Get player by ID
updatePlayer(player)                   // Update player stats

// Items
createItem(item)                       // Now includes encumbrance
updateItem(item)                       // Now includes encumbrance
```

### New WebSocket Messages
```javascript
// Item Editor
{ type: 'getAllItems' }
{ type: 'itemList', items: [...] }
{ type: 'createItem', item: {...} }
{ type: 'updateItem', item: {...} }

// Player Editor
{ type: 'getAllPlayers' }
{ type: 'playerList', players: [...] }
{ type: 'updatePlayer', player: {...} }
{ type: 'getPlayerInventory', playerId }
{ type: 'playerInventory', inventory: [...], currentEncumbrance }
{ type: 'addPlayerInventoryItem', playerId, itemName, quantity }
{ type: 'removePlayerInventoryItem', playerId, itemName, quantity }

// Jump Widget
{ type: 'getJumpMaps' }
{ type: 'jumpMaps', maps: [...] }
{ type: 'getJumpRooms', mapId }
{ type: 'jumpRooms', rooms: [...] }
{ type: 'jumpToRoom', roomId }
```

## Future Enhancements (Prepared)

- Vertical movement (Up/Down) - requires z-coordinate in database
- Additional UI panels in remaining quadrants
- Expanded world map with more areas and connections
- Additional player commands and interactions
- Ability calculation algorithms based on stats and game elements
- Stat progression and leveling system
- Combat system utilizing stats and abilities
- Map zoom and pan controls
- Room labels on map
- Multiple map connections from single room
- Map-specific features and mechanics
- Fast travel system using map coordinates
- Additional room types (beyond normal and merchant)
- NPC placement in rooms
- Item placement in rooms
- Room deletion functionality
- Encumbrance buffs from items/abilities
- Weight reduction equipment
- Merchant NPCs for buying/selling

