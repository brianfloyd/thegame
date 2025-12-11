# Room Subsystem Architecture - Canonical Spec

**Generated from codebase analysis following scrub prompt methodology**

## 1. Room Schema / Source of Truth

### Primary Table: `rooms`

**Location:** `migrations/001_schema.sql:21-34`

```sql
CREATE TABLE IF NOT EXISTS rooms (
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
    UNIQUE(map_id, x, y)
);
```

### Additional Fields Added by Migrations

**Location:** `migrations/071_add_factory_tier_quirks.sql:6-15`
- `factory_tier INTEGER DEFAULT 1` - Factory tier level (1-5), constrained by CHECK constraint
- `factory_quirks JSONB` - JSON object with quirk type and modifiers

**Constraint:** `migrations/071_add_factory_tier_quirks.sql:22-23`
CHECK (factory_tier IS NULL OR (factory_tier >= 1 AND factory_tier <= 5))

### Related Tables

**`room_items`** - Items on ground in rooms
- Location: `migrations/001_schema.sql:107-113`
- Foreign key: `room_id INTEGER NOT NULL REFERENCES rooms(id)`
- Fields: `id`, `room_id`, `item_name`, `quantity`, `created_at`

**`room_npcs`** - NPC placements in rooms
- Location: `migrations/001_schema.sql:83-92`
- Foreign key: `room_id INTEGER NOT NULL REFERENCES rooms(id)`
- Fields: `id`, `npc_id`, `room_id`, `state`, `last_cycle_run`, `active`, `slot`, `spawn_rules`

**`room_type_colors`** - Room type color definitions
- Location: `migrations/001_schema.sql:125-128`
- Primary key: `room_type TEXT PRIMARY KEY`
- Fields: `room_type`, `color`

---

## 2. All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `id` - SERIAL PRIMARY KEY (auto-generated)
- `name` - TEXT NOT NULL
- `description` - TEXT NOT NULL
- `x` - INTEGER NOT NULL
- `y` - INTEGER NOT NULL
- `map_id` - INTEGER NOT NULL REFERENCES maps(id)
- `room_type` - TEXT NOT NULL DEFAULT 'normal'

### Optional Fields (Nullable)
- `connected_map_id` - INTEGER REFERENCES maps(id) - NULL if no map connection
- `connected_room_x` - INTEGER - NULL if no map connection
- `connected_room_y` - INTEGER - NULL if no map connection
- `connection_direction` - TEXT - NULL if no map connection
- `factory_tier` - INTEGER DEFAULT 1 - NULL for non-factory rooms
- `factory_quirks` - JSONB - NULL if no quirks

### Constraints
1. **UNIQUE constraint:** `(map_id, x, y)` - Prevents duplicate rooms at same coordinates
   - Location: `migrations/001_schema.sql:33`
2. **Foreign key:** `map_id REFERENCES maps(id)` - Ensures map exists
   - Location: `migrations/001_schema.sql:27`
3. **Foreign key:** `connected_map_id REFERENCES maps(id)` - Ensures connected map exists
   - Location: `migrations/001_schema.sql:28`
4. **CHECK constraint:** `factory_tier >= 1 AND factory_tier <= 5` (or NULL)
   - Location: `migrations/071_add_factory_tier_quirks.sql:22-23`

### Defaults
- `room_type` - DEFAULT 'normal'
- `factory_tier` - DEFAULT 1 (for factory rooms)

---

## 3. All Subsystem Operations (Read/Write/Mutate)

### Read Operations

**`getRoomById(id)`**
- Location: `database.js:47-49`
- Query: `SELECT * FROM rooms WHERE id = $1`
- Returns: Single room object or null

**`getRoomByCoords(mapId, x, y)`**
- Location: `database.js:51-53`
- Query: `SELECT * FROM rooms WHERE map_id = $1 AND x = $2 AND y = $3`
- Returns: Single room object or null

**`getRoomsByMap(mapId)`**
- Location: `database.js:55-57`
- Query: `SELECT * FROM rooms WHERE map_id = $1`
- Returns: Array of room objects

**`getRoomByName(name)`**
- Location: `database.js:59-61`
- Query: `SELECT * FROM rooms WHERE LOWER(name) = LOWER($1)`
- Returns: Single room object or null

**`getAllRooms()`**
- Location: `database.js:63-65`
- Query: `SELECT * FROM rooms`
- Returns: Array of all room objects

**`getNPCsInRoom(roomId)`**
- Location: `database.js:847-899`
- Query: Complex JOIN with `room_npcs` and `scriptable_npcs`
- Returns: Array of NPC objects with state, puzzle config, status messages

**`getRoomItems(roomId)`**
- Location: `database.js:1888-1909`
- Query: `SELECT item_name, SUM(quantity) as quantity FROM room_items WHERE room_id = $1 GROUP BY item_name`
- Returns: Array of items with normalized names and quantities

**`getWarehouseRooms()`**
- Location: `database.js:1664-1674`
- Query: `SELECT r.* FROM rooms r WHERE r.room_type = 'warehouse'`
- Returns: Array of warehouse room objects

### Write Operations

**`createRoom(name, description, x, y, mapId, roomType = 'normal')`**
- Location: `database.js:67-73`
- Query: `INSERT INTO rooms (name, description, x, y, map_id, room_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`
- Atomicity: Single INSERT, not transactional
- Returns: New room ID

**`updateRoom(roomId, name, description, roomType, factoryTier, connectedMapId, connectedRoomX, connectedRoomY, connectionDirection)`**
- Location: `database.js:75-89`
- Query: `UPDATE rooms SET name = $1, description = $2, room_type = $3, factory_tier = $5, connected_map_id = $6, connected_room_x = $7, connected_room_y = $8, connection_direction = $9 WHERE id = $4`
- Atomicity: Single UPDATE, not transactional
- Updates all fields regardless of whether they changed

**`disconnectRoom(roomId)`**
- Location: `database.js:91-116`
- Query: Two UPDATEs (one on source room, one on target room if exists)
- Atomicity: NOT transactional - second UPDATE can fail silently
- Clears connection fields on both ends of connection

**`addRoomItem(roomId, itemName, quantity = 1)`**
- Location: `database.js:1911-1925`
- Logic: Checks for existing item, updates quantity or inserts new
- Atomicity: Two queries (SELECT then UPDATE/INSERT), not transactional
- Normalizes item names to canonical form

**`removeRoomItem(roomId, itemName, quantity = 1)`**
- Location: `database.js:1927-1941`
- Logic: Finds existing item, deletes if quantity <= requested, otherwise decrements
- Atomicity: Two queries (SELECT then UPDATE/DELETE), not transactional
- Returns: boolean (true if item existed and was removed)

**`removePoofableItemsFromRoom(roomId)`**
- Location: `database.js:1943-1955`
- Query: `DELETE FROM room_items WHERE room_id = $1 AND item_name IN (SELECT name FROM items WHERE poofable = TRUE)`
- Atomicity: Single DELETE, not transactional

### Mutate Operations

**Room state is mutated at runtime by:**
1. NPC cycle engine - updates `room_npcs.state` JSON
2. Factory widget state - stored in memory (`factoryWidgetState` Map)
3. Warehouse widget state - stored in memory (`warehouseWidgetState` Map)
4. Connected players tracking - stored in memory (`connectedPlayers` Map)

**No direct room table mutations at runtime** - room data is read-only during gameplay.

---

## 4. Validations + Missing Validations

### Validations Present

**In `createRoom` handler:**
- Location: `handlers/mapEditor.js:111-171`
- Validates: God mode required (line 114-118)
- Validates: Required fields present (line 121-124)
- Validates: Room type in allowed list ['normal', 'merchant', 'bank', 'warehouse'] (line 128-132)
- Validates: Room type exists in `room_type_colors` table (line 135-140)
- Validates: No existing room at coordinates (line 143-147)

**In `updateRoom` handler:**
- Location: `handlers/mapEditor.js:228-298`
- Validates: God mode required (line 231-235)
- Validates: Required fields present (line 239-242)
- Validates: Room type in allowed list ['normal', 'merchant', 'bank', 'warehouse', 'factory'] (line 245-250)
- Validates: Room type exists in `room_type_colors` table (line 253-258)

**In `deleteRoom` handler:**
- Location: `handlers/mapEditor.js:176-223`
- Validates: Room ID required (line 181-184)
- Validates: Room exists (line 187-191)
- Validates: Room not part of outgoing map connection (line 194-200)
- Validates: No incoming map connections (line 203-216)

**In movement handler:**
- Location: `handlers/game.js:555-1114`
- Validates: Direction provided and valid (line 702-713)
- Validates: Target room exists (line 767-789)
- Validates: Encumbrance level (line 654-665)
- Validates: Movement cooldown (line 671-678)

**In exit generation:**
- Location: `utils/broadcast.js:107-168`
- Validates: Adjacent rooms exist before adding to exits array
- Validates: Map connections exist before adding to exits array

### Missing Validations

1. **Coordinate bounds checking** - NOT enforced
   - No validation that x/y coordinates are within map bounds
   - No validation that coordinates are non-negative
   - Location: `handlers/mapEditor.js:111-171` (createRoom)

2. **Map connection integrity** - PARTIALLY enforced
   - Validates outgoing connection exists, but does NOT validate:
     - Target room exists at connected coordinates
     - Target room is actually connected back (bidirectional validation)
     - Connection direction matches actual room relationship
   - Location: `handlers/mapEditor.js:322-409` (connectMaps)

3. **Room type consistency** - PARTIALLY enforced
   - Validates room type exists in `room_type_colors`, but does NOT validate:
     - Factory rooms have `factory_tier` set
     - Non-factory rooms have `factory_tier = NULL`
     - Warehouse rooms have proper warehouse configuration
   - Location: `handlers/mapEditor.js:228-298` (updateRoom)

4. **Room deletion cascade** - NOT validated
   - Does NOT check if players are in room before deletion
   - Does NOT check if room_items exist (will be orphaned by FK constraint)
   - Does NOT check if room_npcs exist (will be orphaned by FK constraint)
   - Location: `handlers/mapEditor.js:176-223` (deleteRoom)

5. **Factory tier constraint** - Database enforced, but NOT validated in application
   - CHECK constraint exists in DB, but application does not validate before update
   - Location: `migrations/071_add_factory_tier_quirks.sql:22-23`

6. **Room name uniqueness** - NOT enforced
   - Multiple rooms can have same name (no UNIQUE constraint)
   - `getRoomByName` may return wrong room if duplicates exist

7. **Description length** - NOT validated
   - No max length constraint on description field

---

## 5. Behavioral Rules / Invariants

### Enforced Invariants

1. **Unique coordinates per map** - Enforced by UNIQUE constraint
   - Location: `migrations/001_schema.sql:33`
   - Cannot create two rooms at same (map_id, x, y)

2. **Map foreign key** - Enforced by foreign key constraint
   - Location: `migrations/001_schema.sql:27`
   - Cannot create room with non-existent map_id

3. **Factory tier range** - Enforced by CHECK constraint
   - Location: `migrations/071_add_factory_tier_quirks.sql:22-23`
   - factory_tier must be 1-5 or NULL

4. **Room type default** - Enforced by DEFAULT constraint
   - Location: `migrations/001_schema.sql:32`
   - New rooms default to 'normal' type

### Invariants NOT Enforced in Code

1. **Map connection bidirectionality** - NOT enforced
   - Room A can connect to Room B without Room B connecting back
   - Location: `handlers/mapEditor.js:322-409` (connectMaps)

2. **Room type consistency** - NOT enforced
   - Factory rooms can have NULL factory_tier
   - Non-factory rooms can have factory_tier set
   - Location: `database.js:75-89` (updateRoom)

3. **Coordinate bounds** - NOT enforced
   - Rooms can be created at negative coordinates
   - Rooms can be created outside map bounds
   - Location: `handlers/mapEditor.js:111-171` (createRoom)

4. **Room deletion safety** - NOT enforced
   - Rooms can be deleted while players are inside
   - Rooms can be deleted with items/NPCs present
   - Location: `handlers/mapEditor.js:176-223` (deleteRoom)

5. **Exit validity** - NOT enforced
   - Exits are generated dynamically, no validation that all exits lead to valid rooms
   - Location: `utils/broadcast.js:107-168` (getExits)

---

## 6. State Transitions (with file references)

### Room Creation
1. **Handler:** `handlers/mapEditor.js:111-171` (createRoom)
2. **Database:** `database.js:67-73` (createRoom)
3. **Map update:** `database.js:149-158` (updateMapSize) - called after room creation
4. **Client notification:** `handlers/mapEditor.js:156-167` (roomCreated message)

### Room Update
1. **Handler:** `handlers/mapEditor.js:228-298` (updateRoom)
2. **Database:** `database.js:75-89` (updateRoom)
3. **Client notification:** `handlers/mapEditor.js:275-296` (roomUpdated message)

### Room Deletion
1. **Handler:** `handlers/mapEditor.js:176-223` (deleteRoom)
2. **Database:** `database.js:219` (DELETE FROM rooms)
3. **Cascade:** Foreign key constraints will orphan `room_items` and `room_npcs` records
4. **Client notification:** `handlers/mapEditor.js:222` (roomDeleted message)

### Player Movement (Room Transition)
1. **Handler:** `handlers/game.js:555-1114` (move)
2. **Validation:** Direction, target room existence, encumbrance (lines 702-789)
3. **Database update:** `database.js:792` (updatePlayerRoom)
4. **State cleanup:** Factory widget items dropped to ground (lines 808-839)
5. **Poofable items:** Removed from old room (line 842)
6. **Notifications:**
   - `playerLeft` to old room (line 877-882)
   - `moved` to player (line 991-1013)
   - `playerJoined` to new room (line 1064-1069)
   - `roomUpdate` to other players (line 1077)

### Map Connection
1. **Handler:** `handlers/mapEditor.js:322-409` (connectMaps)
2. **Validation:** Source room exists, target room exists, direction available (lines 334-365)
3. **Database update:** `database.js:75-89` (updateRoom) - updates connection fields
4. **Client notification:** `handlers/mapEditor.js:375-409` (mapsConnected message)

### Map Disconnection
1. **Handler:** `handlers/mapEditor.js:411-456` (disconnectMap)
2. **Database:** `database.js:91-116` (disconnectRoom)
3. **Bidirectional cleanup:** Attempts to clear connection on both ends (lines 104-113)
4. **Client notification:** `handlers/mapEditor.js:448-456` (mapDisconnected message)

---

## 7. Interactions with Other Systems

### Game Handlers
- **Movement:** `handlers/game.js:555-1114` - Reads room data, validates exits, updates player position
- **Look:** `handlers/game.js:1119-1200` - Reads room data, sends room update
- **Take/Drop:** `handlers/game.js:1250-1450` - Modifies `room_items` via `addRoomItem`/`removeRoomItem`

### Map Editor
- **Create/Update/Delete:** `handlers/mapEditor.js:111-298` - Full CRUD operations
- **Connect Maps:** `handlers/mapEditor.js:322-409` - Sets up map connections
- **Jump to Room:** `handlers/mapEditor.js:602-756` - Teleports player to room

### NPC Cycle Engine
- **NPC State:** `services/npcCycleEngine.js:434-1050` - Reads `room_npcs`, updates state JSON
- **Item Output:** `services/npcCycleEngine.js:634-1013` - Adds items to rooms via `addRoomItem`
- **Room Updates:** Triggers `sendRoomUpdate` when NPC state changes

### Factory System
- **Factory Detection:** `handlers/game.js:911-930` - Checks `room.room_type === 'factory'`
- **Factory State:** Stored in memory (`factoryWidgetState` Map), keyed by connectionId
- **Item Drop:** `handlers/game.js:808-839` - Drops factory widget items to room ground on exit
- **Factory Tier:** `handlers/game.js:1809` - Reads `room.factory_tier` for recipe filtering
- **Factory Quirks:** `handlers/game.js:1799` - Reads `room.factory_quirks` for crafting modifiers

### Warehouse System
- **Warehouse Detection:** `handlers/game.js:3544` - Checks `room.room_type === 'warehouse'`
- **Warehouse Access:** `handlers/game.js:3654-3659` - Validates player is in warehouse room
- **Location Key:** Uses `room.id.toString()` as warehouse location key

### Broadcast/Serialization
- **Room Updates:** `utils/broadcast.js:180-533` - Serializes room data to client
- **Exit Generation:** `utils/broadcast.js:107-168` - Generates available exits
- **NPC Serialization:** `utils/broadcast.js:195-306` - Formats NPCs with state for client

### Pathfinding
- **Adjacent Rooms:** `utils/pathfinding.js:12-51` - Finds adjacent rooms for pathfinding
- **Path Calculation:** `utils/pathfinding.js:61-147` - Uses room coordinates and connections

### Server Session State
- **Connected Players:** `server.js:188-344` - Tracks `roomId` per connection
- **Factory Widget State:** `server.js:factoryWidgetState` Map - Per-connection factory state
- **Warehouse Widget State:** `server.js:warehouseWidgetState` Map - Per-connection warehouse state

---

## 8. Failure States and Messages

### Movement Failures

**Invalid direction:**
- Message: `"Invalid direction"` or `"Direction is required"`
- Location: `handlers/game.js:702-713`
- Recovery: Player remains in current room

**Target room not found:**
- Message: `"Ouch! You walked into the wall to the [direction]."` (from message cache)
- Location: `handlers/game.js:767-789`
- Recovery: Player remains in current room, auto-navigation stopped if active

**Encumbrance too high:**
- Message: `"You are too heavy to move. Drop items to lower your encumbrance."`
- Location: `handlers/game.js:659-665`
- Recovery: Player cannot move until encumbrance reduced

**Movement cooldown:**
- Message: `"You're moving slowly due to your load... (X.Xs)"`
- Location: `handlers/game.js:671-678`
- Recovery: Player must wait for cooldown to expire

### Room Creation Failures

**Missing fields:**
- Message: `"Missing required fields"`
- Location: `handlers/mapEditor.js:121-124`
- Recovery: Operation aborted

**Invalid room type:**
- Message: `"Invalid room type: X. Valid types: ..."`
- Location: `handlers/mapEditor.js:128-132`
- Recovery: Operation aborted

**Room type not in database:**
- Message: `"Room type X not found in database. Please add it to room_type_colors first."`
- Location: `handlers/mapEditor.js:135-140`
- Recovery: Operation aborted

**Room already exists:**
- Message: `"Room already exists at these coordinates"`
- Location: `handlers/mapEditor.js:143-147`
- Recovery: Operation aborted

**Database error:**
- Message: `"Failed to create room: [error message]"`
- Location: `handlers/mapEditor.js:168-170`
- Recovery: Operation aborted, error logged

### Room Deletion Failures

**Room not found:**
- Message: `"Room not found"`
- Location: `handlers/mapEditor.js:188-191`
- Recovery: Operation aborted

**Room has outgoing connection:**
- Message: `"Cannot delete room "[name]" (x,y) - it

