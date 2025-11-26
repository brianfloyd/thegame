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
- Create `players` table with columns:
  - Basic: `id`, `name` (unique constraint), `current_room_id` (foreign key to rooms)
  - **Stats** (all default 10): `brute_strength`, `life_force`, `cunning`, `intelligence`, `wisdom`
  - **Abilities** (all default 0): `crafting`, `lockpicking`, `stealth`, `dodge`, `critical_hit`
  - **Resources**: `hit_points` (default 50), `max_hit_points` (default 50), `mana` (default 0), `max_mana` (default 0)
- Database migration: Automatically adds new columns to existing databases
- Insert initial data:
  - **Map Structure**: 20x20 grid (coordinates -10 to +9)
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
  - **Total Rooms**: ~80 rooms (perimeter + center street, with corner overlap)
  - Players: "Fliz" and "Hebron" (both start in town square, current_room_id=1)
  - **Database Cleanup**: Automatic migration removes invalid rooms (district/interior rooms) while preserving player data
  - **Player Stats**:
    - Fliz: All stats 10, all abilities 0, 50/50 HP, 0 Mana (not a caster)
    - Hebron: All stats 10, all abilities 0, 50/50 HP, 10/10 Mana
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
  - Send player stats to client on connection via WebSocket
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
    - Top-left quadrant: Player Stats widget
    - Top-right quadrant: Compass widget
    - Bottom-left quadrant: Map widget (25x25 grid view)
    - Bottom-right quadrant: Reserved for future features
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
  - Player Stats widget in top-left quadrant
  - Compass widget in top-right quadrant
  - Smaller widgets (max-width 200px) for compact display
- Compass button states:
  - Available: Bright green border and text
  - Unavailable: Lowlighted (40% opacity, dark colors) but still visible
  - All buttons always visible for centered appearance
- Player Stats widget styling:
  - Retro terminal aesthetic matching game theme
  - Green borders and text (#00ff00)
  - Yellow section titles (#ffff00)
  - Cyan stat labels (#00ffff)
  - Visual HP bar (red) and Mana bar (blue)
  - Compact layout with organized sections
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
- Map display:
  - 25x25 grid view centered on player's current room
  - Rooms displayed as squares (current room highlighted in green with yellow border)
  - Connection lines between adjacent rooms in all 8 directions
  - Automatically re-centers when player moves
  - Canvas-based rendering with retro terminal aesthetic
  - Shows all rooms within 25x25 viewport
- Player stats display:
  - Receives player stats from server on connection
  - Displays all 5 attributes (Brute Strength, Life Force, Cunning, Intelligence, Wisdom)
  - Displays all 5 abilities (Crafting, Lockpicking, Stealth, Dodge, Critical Hit)
  - Shows Hit Points with current/max and visual bar
  - Shows Mana with current/max and visual bar (only if maxMana > 0)
  - Updates automatically when stats change

### 7. WebSocket Message Protocol
- Client → Server:
  - `{ type: 'selectPlayer', playerName: 'Fliz' }` - when player selects character
  - `{ type: 'move', direction: 'N' }` - when player wants to move (N/S/E/W/NE/NW/SE/SW/U/D)
- Server → Client:
  - `{ type: 'roomUpdate', room: { id, name, description, x, y }, players: ['Fliz'], exits: { north: true, south: true, east: false, west: false, northeast: false, ... } }` - room state updates
  - `{ type: 'playerJoined', playerName: 'Hebron' }` - when someone joins current room
  - `{ type: 'playerLeft', playerName: 'Fliz' }` - when someone leaves current room
  - `{ type: 'moved', room: { id, name, description, x, y }, players: [...], exits: {...} }` - when player successfully moves to new room
  - `{ type: 'playerStats', stats: { bruteStrength, lifeForce, cunning, intelligence, wisdom, crafting, lockpicking, stealth, dodge, criticalHit, hitPoints, maxHitPoints, mana, maxMana } }` - player stats sent on connection
  - `{ type: 'mapData', rooms: [{ id, name, x, y }, ...], currentRoom: { x, y } }` - all rooms data sent on connection
  - `{ type: 'mapUpdate', currentRoom: { x, y } }` - map position update when player moves
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
- **Player Stats**: Comprehensive stat display in top-left quadrant
  - Attributes section (5 stats)
  - Abilities section (5 abilities)
  - Hit Points bar with current/max display
  - Mana bar with current/max display (caster only)
- **Map**: 25x25 grid view in bottom-left quadrant
  - Shows rooms as squares with connection lines
  - Current room highlighted (green with yellow border)
  - Automatically centers on player
  - Displays all rooms within viewport
- **Compass**: Visual navigation widget with all directions visible
- **Commands**: Text-based with multiple input formats
- **Player List**: Inline display with automatic "No one else is here." management
- **Error Messages**: Descriptive wall collision messages
- **Real-time Updates**: Instant visibility of players entering/leaving rooms

## Player Character System

### Dynamic Stats System (Prefix-Based Auto-Detection)
The stats system is **fully dynamic** and uses **prefix-based auto-detection**. Stats are automatically detected from database column names using naming conventions:
- **`stat_*`** - Attributes (base stats like `stat_brute_strength`, `stat_cunning`)
- **`ability_*`** - Abilities (skills like `ability_crafting`, `ability_stealth`)
- **`resource_*`** - Resources (hit points, mana, etc. like `resource_hit_points`, `resource_mana`)
- **`resource_max_*`** - Max values for resources (like `resource_max_hit_points`, `resource_max_mana`)
- **`flag_*`** - Special boolean flags (like `flag_god_mode`)

**How It Works:**
- The system queries the database schema on startup
- Automatically detects all columns matching the prefix patterns
- Generates display names from column names (e.g., `stat_brute_strength` → "Brute Strength")
- Converts to camelCase for JavaScript (e.g., `stat_brute_strength` → `bruteStrength`)

**How to Add a New Stat:**
1. Add the column to the database with the appropriate prefix:
   ```sql
   ALTER TABLE players ADD COLUMN stat_new_stat_name INTEGER DEFAULT 10;
   ```
2. **That's it!** The system will automatically detect and display it - no code changes needed!

**Examples:**
- Add a new attribute: `stat_charisma` → automatically appears in "Attributes" section
- Add a new ability: `ability_archery` → automatically appears in "Abilities" section
- Add a new resource: `resource_energy` and `resource_max_energy` → automatically appears with a progress bar

### Current Stats (Base 10 for all players)
- **Brute Strength**: Physical power and melee damage potential
- **Life Force**: Vitality and health capacity
- **Cunning**: Deception and tactical thinking
- **Intelligence**: Mental acuity and problem-solving
- **Wisdom**: Insight and magical understanding

### Current Abilities (Base 0, algorithm-driven later)
- **Crafting**: Ability to create items
- **Lockpicking**: Ability to open locks and containers
- **Stealth**: Ability to move undetected
- **Dodge**: Ability to avoid attacks
- **Critical Hit**: Chance for enhanced damage

### Resources
- **Hit Points**: Current health (50/50 for both players)
- **Mana**: Magical energy (0 for Fliz, 10/10 for Hebron)

### Character Differences
- **Fliz**: Non-caster, 0 Mana
- **Hebron**: Caster, 10/10 Mana

## Map System

### Structure
- **20x20 Grid**: Coordinates range from -10 to +9 in both X and Y directions
- **Perimeter**: Outer square boundary roads
  - Westwall Street (x = -10): Western boundary
  - Eastwall Street (x = 9): Eastern boundary
  - North Street (y = 9): Northern boundary
  - South Street (y = -10): Southern boundary
- **Center Street**: Vertical road (x = 0) connecting north to south
  - Passes through Town Square at center (0, 0)
  - Includes original special rooms (Northern Room, Southern Room)

### Map Widget Features
- **25x25 Viewport**: Shows 25x25 grid area centered on player
- **Dynamic Centering**: Automatically re-centers when player moves
- **Room Visualization**: 
  - Rooms as squares (8x8 pixels)
  - Current room: Green fill with yellow border
  - Other rooms: Gray fill with dark border
- **Connection Lines**: Gray lines connecting adjacent rooms in all 8 directions
- **Coordinate System**: Y-axis properly inverted (north = up on screen)

### Database Management
- **Automatic Cleanup**: Removes invalid rooms (not on perimeter or center street)
- **Player Safety**: Moves players to Town Square before deleting their current room
- **Migration**: Handles existing databases gracefully

## Scriptable NPCs System (Glowroot Region)

### Database Structure
- **Table**: `scriptable_npcs`
- **Purpose**: Stores NPCs that can be interacted with through scriptable mechanics
- **Columns**:
  - `id`: Primary key
  - `name`: NPC name
  - `description`: NPC description
  - `npc_type`: Type of interaction (rhythm, stability, worker, tending, machine, rotation, economic, farm, patrol, threshold)
  - `base_cycle_time`: Base time in milliseconds for interaction cycles
  - `difficulty`: Difficulty level (1-2)
  - `required_stats`: JSON object of required stat values (e.g., `{"wisdom":4}`)
  - `required_buffs`: JSON array of required buffs (e.g., `["spore_resist"]`)
  - `input_items`: JSON object of required input items (e.g., `{"root_nutrient":2}`)
  - `output_items`: JSON object of output items (e.g., `{"lumin_spore":1}`)
  - `failure_states`: JSON array of possible failure states (e.g., `["pulse_missed"]`)
  - `scriptable`: Boolean flag (default 1)
  - `active`: Boolean flag (default 1)

### Glowroot Region NPCs
The following 10 NPCs have been added to the database:

1. **Glowroot Pulsecap** (rhythm, difficulty 1)
   - Requires: Wisdom 4, spore_resist buff
   - Output: lumin_spore
   - Cycle time: 3500ms

2. **Embergut Shroomling** (stability, difficulty 2)
   - Requires: Intelligence 6, heat_resist buff
   - Output: ember_gel
   - Cycle time: 6000ms

3. **Mycelium Forager** (worker, difficulty 1)
   - Requires: Crafting 5, steady_hands buff, 2x root_nutrient
   - Output: glowroot_dust
   - Cycle time: 7000ms

4. **Lantern Moth Swarm** (tending, difficulty 1)
   - Requires: Wisdom 5, calm buff, nectar_drop
   - Output: liquid_lumen
   - Cycle time: 5000ms

5. **Biotide Condenser** (machine, difficulty 1)
   - Requires: Intelligence 4, cooling_aura buff, humid_air
   - Output: biotide
   - Cycle time: 8000ms

6. **Crystalbloom Weaver** (rotation, difficulty 2)
   - Requires: Crafting 7, Intelligence 5, precision buff, 2x raw_fiber
   - Output: woven_glowfiber
   - Cycle time: 9000ms

7. **Glowroot Barter Wisp** (economic, difficulty 1)
   - Requires: Cunning 4, clarity buff, 4x copper_bit
   - Output: trade_spore
   - Cycle time: 4000ms

8. **Silkroot Crawler Nest** (farm, difficulty 1)
   - Requires: Wisdom 3, Crafting 3, gentle_touch buff, crawler_feed
   - Output: 2x glow_silk
   - Cycle time: 6500ms

9. **Ooze-Walker Collector** (patrol, difficulty 2)
   - Requires: Dexterity 5, slick_grip buff
   - Output: ooze_core
   - Cycle time: 7000ms

10. **Aetherbud Sprite** (threshold, difficulty 2)
    - Requires: Wisdom 7, Intelligence 5, aether_sense buff
    - Output: aether_bud
    - Cycle time: 5200ms

### Implementation Status
- **Database Schema**: ✅ Created
- **NPC Data**: ✅ Inserted (10 NPCs)
- **Game Logic**: ✅ Cycle engine with type-driven scaffolding
- **Room Placement**: ✅ `room_npcs` table with Moonless Meadow-only enforcement
- **NPC Editing (God Mode)**: ✅ NPC editor overlay with CRUD support

### NPC Editing (God Mode)

- **Access**: Second God Mode button (`NPC`) in the button bar (visible only to god mode players)
- **Overlay**: Full-screen editor overlay similar to Map Editor
  - Left side: Scrollable NPC list (`#npcList`) and dropdown selector (`#npcSelector`)
  - Right side: Compact side panel with NPC detail form
- **NPC List**:
  - Shows all `scriptable_npcs` entries (id, name, npc_type)
  - Click to select NPC for editing (highlighted row)
  - Dropdown selector mirrors the list and can also select NPCs
- **NPC Detail Form**:
  - Fields:
    - `name`
    - `description`
    - `npc_type` (rhythm, stability, worker, tending, rotation, economic, farm, patrol, threshold)
    - `base_cycle_time` (ms)
    - `difficulty`
    - `required_stats` (JSON)
    - `required_buffs` (JSON array)
    - `input_items` (JSON)
    - `output_items` (JSON)
    - `failure_states` (JSON array)
    - `active` (Yes/No)
  - Supports:
    - Editing existing NPCs
    - Creating new NPCs (`Create New NPC` button)
    - Saving changes via `Save NPC` button
- **WebSocket Messages (NPC Editor)**:
  - Client → Server:
    - `{ type: 'getAllNPCs' }` — load all scriptable NPCs (god mode only)
    - `{ type: 'createNPC', npc: { ...fields } }` — create new NPC definition
    - `{ type: 'updateNPC', npc: { id, ...fields } }` — update existing NPC
  - Server → Client:
    - `{ type: 'npcList', npcs: [...] }` — complete NPC list
    - `{ type: 'npcCreated', npc: { ... } }` — newly created NPC
    - `{ type: 'npcUpdated', npc: { ... } }` — updated NPC
- **Placement Rule**:
  - NPC definitions editable globally
  - Actual room placement (`room_npcs`) remains restricted to rooms in the **Moonless Meadow** map

## Inventory System

### Database Tables

#### `room_items` - Items on the ground in rooms
- `id`: Primary key
- `room_id`: Foreign key to rooms
- `item_name`: Text name of item
- `quantity`: Number of items (stacks)
- `created_at`: Timestamp when item was placed

#### `player_items` - Player inventory
- `id`: Primary key
- `player_id`: Foreign key to players
- `item_name`: Text name of item
- `quantity`: Number of items (stacks)
- `created_at`: Timestamp when item was acquired

### Commands

| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `help` | `?` | Display all available commands |
| `inventory` | `inv`, `i` | Display player inventory |
| `take <item>` | `t <item>` | Pick up item from ground (partial name matching) |
| `drop <item>` | (none, `d` = down) | Drop item to ground (partial name matching) |
| `harvest <npc>` | `h <npc>` | Harvest items from NPC (partial name matching) |
| `collect <npc>` | `c <npc>` | Alias for harvest |
| `gather <npc>` | `g <npc>` | Alias for harvest |

### Dynamic Command Registry
Commands are registered in `COMMAND_REGISTRY` array in `client.js`. To add a new command:
1. Add an entry to `COMMAND_REGISTRY` with `name`, `abbrev`, `description`, and `category`
2. The command will automatically appear in `help` output
3. Add the command handler in `executeCommand()` function

### Partial Name Matching
- Commands support partial item/NPC name matching (case-insensitive)
- If multiple items match (e.g., "s" matches "shroud" and "sword"), prompts for clarification: "Which did you mean: shroud, sword?"
- Single match proceeds automatically

### NPC Item Production (Rhythm NPCs)
- Rhythm-type NPCs produce items every cycle based on their `output_items` definition
- Produced items are added to the room's ground inventory (`room_items`)
- Items accumulate over time as NPC cycles continue

### UI Display
- Room view shows "On the ground: item_name (xQuantity)" section
- Items displayed in gold/yellow color (#ffcc00)
- Inventory command shows "You are carrying: ..." or "Your inventory is empty."

### WebSocket Messages

#### Client → Server
- `{ type: 'inventory' }` - Request inventory list
- `{ type: 'take', itemName: 'partial_name' }` - Take item from ground
- `{ type: 'drop', itemName: 'partial_name' }` - Drop item to ground
- `{ type: 'harvest', target: 'partial_npc_name' }` - Harvest from NPC

#### Server → Client
- `{ type: 'inventoryList', items: [{ item_name, quantity }] }` - Player inventory
- `{ type: 'message', message: 'You pick up item_name.' }` - Action feedback
- Room updates (`roomUpdate`, `moved`) now include `roomItems` array

## Future Enhancements (Prepared)

- Vertical movement (Up/Down) - requires z-coordinate in database
- Additional UI panels in remaining quadrants
- Expanded world map with more areas
- Additional player commands and interactions
- Ability calculation algorithms based on stats and game elements
- Stat progression and leveling system
- Combat system utilizing stats and abilities
- Map zoom and pan controls
- Room labels on map
