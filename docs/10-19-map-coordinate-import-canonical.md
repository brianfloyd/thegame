# 10-19 — Map Coordinate System & External Import Specification

**Purpose:** Canonical specification for map coordinates, room connections, and importable map data format. Enables external AI systems to generate valid, importable game maps.

**Classification:** 🟢 CANON APPLY — Architectural Reference

---

## 1. Overview

The game world is organized as a collection of **maps**, each containing **rooms** positioned on a 2D coordinate grid. Rooms connect to adjacent rooms implicitly via coordinate proximity, and to rooms on other maps explicitly via **map connections**.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Map** | A named container for rooms with defined dimensions |
| **Room** | A discrete location with coordinates, name, description, and type |
| **Adjacent Room** | A room reachable by moving ±1 in x, y, or both (8 directions) |
| **Map Connection** | An explicit portal linking a room on one map to a room on another map |
| **Exit** | A valid direction a player can move from the current room |

---

## 2. Coordinate System

### 2.1 Axis Definition

```
           +Y (North)
              ↑
              |
   -X ←——————·———————→ +X
 (West)       |        (East)
              ↓
           -Y (South)
```

| Axis | Direction | Movement |
|------|-----------|----------|
| **+X** | East | `x + 1` |
| **-X** | West | `x - 1` |
| **+Y** | North | `y + 1` |
| **-Y** | South | `y - 1` |

### 2.2 Coordinate Bounds

- **Coordinates are unbounded integers** — no minimum or maximum enforced
- Negative coordinates are valid and commonly used
- Map `width` and `height` are **metadata only** — not enforced constraints
- Rooms can exist outside declared map dimensions

### 2.3 Room Uniqueness

**Constraint:** `UNIQUE(map_id, x, y)`

Each coordinate pair `(x, y)` can have **at most one room** per map. Attempting to create a duplicate room at the same coordinates will fail.

---

## 3. Direction System

### 3.1 Cardinal Directions (4)

| Direction | Abbreviation | Coordinate Delta |
|-----------|--------------|------------------|
| North | `N` | `(0, +1)` |
| South | `S` | `(0, -1)` |
| East | `E` | `(+1, 0)` |
| West | `W` | `(-1, 0)` |

### 3.2 Diagonal Directions (4)

| Direction | Abbreviation | Coordinate Delta |
|-----------|--------------|------------------|
| Northeast | `NE` | `(+1, +1)` |
| Northwest | `NW` | `(-1, +1)` |
| Southeast | `SE` | `(+1, -1)` |
| Southwest | `SW` | `(-1, -1)` |

### 3.3 Vertical Directions (Reserved)

| Direction | Abbreviation | Status |
|-----------|--------------|--------|
| Up | `U` | **Reserved, not implemented** |
| Down | `D` | **Reserved, not implemented** |

### 3.4 Direction to Delta Mapping

```javascript
const DIRECTION_DELTAS = {
    N:  { dx:  0, dy: +1 },
    S:  { dx:  0, dy: -1 },
    E:  { dx: +1, dy:  0 },
    W:  { dx: -1, dy:  0 },
    NE: { dx: +1, dy: +1 },
    NW: { dx: -1, dy: +1 },
    SE: { dx: +1, dy: -1 },
    SW: { dx: -1, dy: -1 }
};
```

---

## 4. Room Adjacency & Exit Generation

### 4.1 Implicit Connections (Same Map)

A room at `(x, y)` has an **implicit exit** in a direction if another room exists at the target coordinates on the **same map**.

**Example:**
- Room A at `(5, 5)` on map 1
- Room B at `(5, 6)` on map 1
- Result: Room A has exit `N` to Room B; Room B has exit `S` to Room A

### 4.2 Exit Detection Algorithm

```javascript
async function getExits(room) {
    const exits = [];
    
    // Check map connections first (override implicit)
    if (room.connection_direction && room.connected_map_id) {
        exits.push(room.connection_direction);
    }
    
    // Check cardinal directions for adjacent rooms (same map)
    for (const [dir, delta] of [['N', {dx:0, dy:1}], ['S', {dx:0, dy:-1}], 
                                  ['E', {dx:1, dy:0}], ['W', {dx:-1, dy:0}]]) {
        if (!exits.includes(dir)) {
            const adjacent = await getRoomByCoords(room.map_id, room.x + delta.dx, room.y + delta.dy);
            if (adjacent) exits.push(dir);
        }
    }
    
    // Check diagonal directions (no map connections for diagonals)
    for (const [dir, delta] of [['NE', {dx:1, dy:1}], ['NW', {dx:-1, dy:1}],
                                  ['SE', {dx:1, dy:-1}], ['SW', {dx:-1, dy:-1}]]) {
        const adjacent = await getRoomByCoords(room.map_id, room.x + delta.dx, room.y + delta.dy);
        if (adjacent) exits.push(dir);
    }
    
    return exits;
}
```

### 4.3 Key Rules

1. **No explicit edge list required** — adjacency is computed from coordinates
2. **Bidirectional by default** — if A→B exists, B→A exists (for same-map adjacency)
3. **Map connections override adjacency** — if a room has a map connection in direction `N`, it connects to another map, not an adjacent room
4. **Diagonal connections cannot cross maps** — map connections are cardinal only (N, S, E, W)

---

## 5. Map Connections (Cross-Map Portals)

### 5.1 Connection Fields

A room with a **map connection** has these fields populated:

| Field | Type | Description |
|-------|------|-------------|
| `connected_map_id` | INTEGER | Target map ID |
| `connected_room_x` | INTEGER | Target room X coordinate |
| `connected_room_y` | INTEGER | Target room Y coordinate |
| `connection_direction` | TEXT | Direction of the portal (`N`, `S`, `E`, `W`) |

### 5.2 Connection Example

**Bidirectional connection between Newhaven and Northern Territory:**

**Room 1 (Source):**
```json
{
    "id": 71,
    "name": "north street 11",
    "x": 0,
    "y": 9,
    "map_id": 1,
    "connected_map_id": 2,
    "connected_room_x": 0,
    "connected_room_y": -5,
    "connection_direction": "N"
}
```

**Room 2 (Target):**
```json
{
    "id": 124,
    "name": "south street 6",
    "x": 0,
    "y": -5,
    "map_id": 2,
    "connected_map_id": 1,
    "connected_room_x": 0,
    "connected_room_y": 9,
    "connection_direction": "S"
}
```

### 5.3 Connection Rules

1. **Connections are one-way in the database** — each room stores its own outbound connection
2. **Bidirectional connections require two records** — both rooms must point to each other
3. **Direction is from the room's perspective** — Room 71's `N` exit leads to map 2
4. **Target coordinates must match an existing room** — or movement will fail at runtime

---

## 6. Room Types

### 6.1 Defined Room Types

| Type | Color | Purpose |
|------|-------|---------|
| `normal` | `#00ff00` | Standard traversable room |
| `merchant` | `#0088ff` | Contains a merchant NPC for buying/selling |
| `factory` | `#ff8800` | Crafting location with factory mechanics |
| `bank` | `#ffff00` | Currency deposit/withdrawal |
| `warehouse` | `#00ffff` | Item storage location |

### 6.2 Type Constraints

- Room type **must exist** in `room_type_colors` table
- Factory rooms use `factory_tier` (1-5) and optionally `factory_quirks` JSONB
- Room type affects available commands and widget behavior

---

## 7. Database Schema Reference

### 7.1 Maps Table

```sql
CREATE TABLE maps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    description TEXT
);
```

### 7.2 Rooms Table

```sql
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    map_id INTEGER NOT NULL REFERENCES maps(id),
    connected_map_id INTEGER REFERENCES maps(id),
    connected_room_x INTEGER,
    connected_room_y INTEGER,
    connection_direction TEXT,
    room_type TEXT NOT NULL DEFAULT 'normal',
    factory_tier INTEGER DEFAULT 1,
    factory_quirks JSONB,
    UNIQUE(map_id, x, y)
);
```

### 7.3 Room Type Colors Table

```sql
CREATE TABLE room_type_colors (
    room_type TEXT PRIMARY KEY,
    color TEXT NOT NULL DEFAULT '#00ff00'
);
```

---

## 8. External Import Format

### 8.1 Map Import JSON Schema

External AI systems should generate maps in this format for import:

```json
{
    "format_version": "1.0",
    "map": {
        "name": "Generated Dungeon",
        "width": 20,
        "height": 20,
        "description": "A procedurally generated dungeon"
    },
    "rooms": [
        {
            "x": 0,
            "y": 0,
            "name": "Entrance Hall",
            "description": "The grand entrance to the dungeon. Torches flicker on the walls.",
            "room_type": "normal"
        },
        {
            "x": 0,
            "y": 1,
            "name": "North Corridor",
            "description": "A narrow corridor leading deeper into the dungeon.",
            "room_type": "normal"
        },
        {
            "x": 1,
            "y": 0,
            "name": "East Alcove",
            "description": "A small alcove with dusty crates.",
            "room_type": "warehouse"
        }
    ],
    "map_connections": []
}
```

### 8.2 Room Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | integer | ✓ | X coordinate |
| `y` | integer | ✓ | Y coordinate |
| `name` | string | ✓ | Room display name |
| `description` | string | ✓ | Room description (supports markup) |
| `room_type` | string | ✓ | One of: `normal`, `merchant`, `factory`, `bank`, `warehouse` |
| `factory_tier` | integer | ○ | 1-5, only for factory rooms |
| `factory_quirks` | object | ○ | JSONB quirk configuration for factories |

### 8.3 Map Connection Object

```json
{
    "source_room": { "x": 0, "y": 10 },
    "target_map_name": "Northern Territory",
    "target_room": { "x": 0, "y": -5 },
    "direction": "N"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_room.x` | integer | ✓ | Source room X in this map |
| `source_room.y` | integer | ✓ | Source room Y in this map |
| `target_map_name` | string | ✓ | Name of target map (must exist) |
| `target_room.x` | integer | ✓ | Target room X in target map |
| `target_room.y` | integer | ✓ | Target room Y in target map |
| `direction` | string | ✓ | Exit direction: `N`, `S`, `E`, `W` |

---

## 9. Import Validation Rules

### 9.1 Pre-Import Checks

1. **No duplicate coordinates** — Each `(x, y)` must be unique within the rooms array
2. **Room types valid** — All `room_type` values must exist in `room_type_colors`
3. **Factory tiers in range** — `factory_tier` must be 1-5 if present
4. **Map connections have targets** — Referenced map and coordinates must exist

### 9.2 Connectivity Validation

For a **well-formed map**, ensure:

1. **All rooms reachable** — No isolated rooms (unless intentional)
2. **Consistent adjacency** — Rooms intended to connect are ±1 coordinate apart
3. **No coordinate gaps** — Consider whether gaps are intentional (impassable terrain) or errors

### 9.3 Recommended Validation Algorithm

```javascript
function validateMapImport(importData) {
    const errors = [];
    const coordSet = new Set();
    
    for (const room of importData.rooms) {
        // Check for duplicates
        const key = `${room.x},${room.y}`;
        if (coordSet.has(key)) {
            errors.push(`Duplicate room at (${room.x}, ${room.y})`);
        }
        coordSet.add(key);
        
        // Check room type
        if (!VALID_ROOM_TYPES.includes(room.room_type)) {
            errors.push(`Invalid room_type "${room.room_type}" at (${room.x}, ${room.y})`);
        }
        
        // Check factory tier
        if (room.factory_tier !== undefined) {
            if (room.factory_tier < 1 || room.factory_tier > 5) {
                errors.push(`Invalid factory_tier ${room.factory_tier} at (${room.x}, ${room.y})`);
            }
        }
    }
    
    return errors;
}
```

---

## 10. Coordinate Patterns for Map Generation

### 10.1 Grid Layout

For regular grid maps (towns, dungeons):

```
(0,2)  (1,2)  (2,2)
(0,1)  (1,1)  (2,1)
(0,0)  (1,0)  (2,0)
```

- All 8 directional movements possible within grid
- Ideal for structured environments

### 10.2 Linear Corridor

```
(0,0) → (1,0) → (2,0) → (3,0) → (4,0)
```

- Only E/W movement
- Use for hallways, tunnels, paths

### 10.3 Branching Path

```
              (1,2)
                ↑
(0,0) → (1,0) → (1,1)
                ↓
              (1,-1) → (2,-1)
```

- Combine linear and junction rooms
- Junction rooms have 3+ exits

### 10.4 Diagonal Paths

```
(0,0) → (1,1) → (2,2) → (3,3)
```

- Players can move diagonally (NE, NW, SE, SW)
- Creates non-rectangular layouts

### 10.5 Sparse/Wilderness Layout

```
(0,0)     (3,1)     (6,0)
    (2,2)     (5,3)
(1,4)     (4,5)     (7,4)
```

- Rooms are NOT adjacent
- Players cannot walk between distant rooms
- Requires map connections or intentional isolation

---

## 11. Example: Complete Import Package

```json
{
    "format_version": "1.0",
    "map": {
        "name": "Crystal Caverns",
        "width": 10,
        "height": 10,
        "description": "An underground cave system with glowing crystals"
    },
    "rooms": [
        {
            "x": 0,
            "y": 0,
            "name": "Cave Entrance",
            "description": "Daylight filters in from the cave mouth. The air grows cooler as you look deeper into the darkness.",
            "room_type": "normal"
        },
        {
            "x": 0,
            "y": 1,
            "name": "Narrow Passage",
            "description": "The passage narrows here. You must duck to avoid the low ceiling.",
            "room_type": "normal"
        },
        {
            "x": 0,
            "y": 2,
            "name": "Crystal Chamber",
            "description": "A vast chamber opens before you. [Glowing crystals] line the walls, casting an ethereal blue light.",
            "room_type": "normal"
        },
        {
            "x": -1,
            "y": 2,
            "name": "West Alcove",
            "description": "A small alcove filled with discarded mining equipment.",
            "room_type": "warehouse"
        },
        {
            "x": 1,
            "y": 2,
            "name": "Crystal Forge",
            "description": "An ancient forge powered by crystal energy. The air shimmers with heat.",
            "room_type": "factory",
            "factory_tier": 2
        },
        {
            "x": 0,
            "y": 3,
            "name": "Underground Lake",
            "description": "A still underground lake stretches before you. Crystals beneath the surface glow faintly.",
            "room_type": "normal"
        }
    ],
    "map_connections": []
}
```

### Resulting Navigation

From **Crystal Chamber** `(0, 2)`:
- **North** → Underground Lake `(0, 3)`
- **South** → Narrow Passage `(0, 1)`
- **East** → Crystal Forge `(1, 2)`
- **West** → West Alcove `(-1, 2)`

---

## 12. Map Import/Export System (Implemented)

### 12.1 WebSocket Handlers

The map import/export system is implemented via WebSocket handlers (God Mode required):

| Message Type | Direction | Description |
|--------------|-----------|-------------|
| `importMap` | Client → Server | Import a new map from canonical JSON format |
| `exportMap` | Client → Server | Export existing map to canonical JSON format |
| `getAvailableConnectionRooms` | Client → Server | Get rooms from a map with available exits for connections |
| `mapImported` | Server → Client | Import success response with map ID and statistics |
| `mapExported` | Server → Client | Export response with canonical JSON data |
| `availableConnectionRooms` | Server → Client | List of rooms with available exit directions |

### 12.2 Import Request Format

**WebSocket Message:**
```json
{
    "type": "importMap",
    "importData": {
        "format_version": "1.0",
        "map": { ... },
        "rooms": [ ... ],
        "map_connections": [ ... ]
    },
    "entranceRoom": { "x": 0, "y": 0 },
    "connectionRoomId": 123,
    "connectionDirection": "N"
}
```

**Optional Connection Parameters:**
- `entranceRoom` - Coordinates of entrance room in imported map
- `connectionRoomId` - Room ID in existing map to connect to
- `connectionDirection` - Direction from connection room (N, S, E, W)

### 12.3 Import Response

```json
{
    "type": "mapImported",
    "mapId": 242,
    "roomsCreated": 6,
    "connectionsCreated": 1,
    "warnings": []
}
```

### 12.4 Export Request Format

**WebSocket Message:**
```json
{
    "type": "exportMap",
    "mapId": 242
}
```

### 12.5 Export Response

```json
{
    "type": "mapExported",
    "mapId": 242,
    "exportData": {
        "format_version": "1.0",
        "map": { ... },
        "rooms": [ ... ],
        "map_connections": [ ... ]
    }
}
```

### 12.6 Database Functions

**Location:** `database.js`

- `exportMap(mapId)` - Exports map to canonical JSON format
- `importMap(importData, entranceRoomCoords, connectionRoomId, connectionDirection)` - Imports map with transaction support
- `validateMapImport(importData)` - Validates import data per canonical spec

### 12.7 MCP Tools

**Location:** `mcp-test-server/tools/mapImport.js`

Available MCP tools for IDE-based operations:
- `map_export` - Export map to JSON (by ID or name)
- `map_import` - Import map from JSON with optional connection setup
- `map_validate` - Validate import data without importing
- `map_list` - List all maps with room counts

### 12.8 Map Editor UI

**Location:** `public/gameeditors/map-editor.html` and `map-editor.js`

The map editor provides:
- **Export Button** - Exports current map to downloadable JSON file
- **Import Dialog** - Allows pasting JSON data and configuring connections
- **Connection UI** - When selecting a map for connection, shows rooms with available exits
- **Room Selection** - Dropdown shows room name, coordinates, and available exit directions
- **Direction Filtering** - Only shows directions that don't already have connections

---

## 13. Best Practices for AI Map Generation

### 13.1 Room Naming

- Use descriptive, unique names within the map
- Include location hints: "North Corridor", "Central Plaza"
- Avoid generic names: "Room 1", "Room 2"

### 13.2 Descriptions

- 1-3 sentences per room
- Include sensory details (sight, sound, smell)
- Use markup for emphasis: `[glowing]`, `/whispered/`, `*important*`
- Reference exits naturally: "A passage leads north"

### 13.3 Layout Design

- **Start with a concept** — dungeon, town, wilderness
- **Define key rooms first** — entrance, boss room, merchant
- **Connect with corridors** — fill gaps with transitional rooms
- **Test walkability** — ensure all rooms are reachable

### 13.4 Room Type Placement

- `merchant` — near entrance or at hub locations
- `warehouse` — off main paths, safe storage areas
- `factory` — dedicated crafting zones
- `bank` — central, secure locations
- `normal` — majority of rooms

---

## 14. File References

**Schema Definitions:**
- `migrations/001_schema.sql:12-34` — Maps and rooms tables
- `migrations/071_add_factory_tier_quirks.sql` — Factory fields

**Exit Generation:**
- `utils/broadcast.js:107-168` — `getExits()` function

**Room Operations:**
- `database.js:47-116` — Room CRUD operations
- `database.js:160-320` — Map import/export functions (`exportMap`, `importMap`, `validateMapImport`)
- `handlers/mapEditor.js:111-456` — Map editor handlers
- `handlers/mapEditor.js:1249-1302` — `getAvailableConnectionRooms` handler
- `handlers/mapEditor.js:755-830` — Map import/export handlers

**Movement Logic:**
- `handlers/game.js:555-1114` — Movement command handler

**Map Editor UI:**
- `public/gameeditors/map-editor.html` — Map editor interface
- `public/gameeditors/map-editor.js` — Map editor logic with numpad navigation and map switching

**MCP Tools:**
- `mcp-test-server/tools/mapImport.js` — MCP tools for map import/export operations

---

**END OF CANONICAL SPEC**
