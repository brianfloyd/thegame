# Editor Systems Canonical Specification

**Analysis Date:** Based on codebase analysis  
**Scope:** All God Mode editor systems (Player, Map, Item, NPC, Crafting, Ticketing)  
**Method:** Direct code examination with file/line citations

This document defines the **complete, code-verified canonical behavior** of all editor systems in The Game. All facts are grounded in real code, with file references where possible.

---

# 1. Editor System Architecture Overview

## 1.1 Common Architecture Pattern

All editors follow the same architectural pattern:

**Location:** `handlers/` directory
- `handlers/playerEditor.js` - Player management
- `handlers/mapEditor.js` - Map and room management
- `handlers/itemEditor.js` - Item definition management
- `handlers/npcEditor.js` - NPC template and placement management
- `handlers/craftingEditor.js` - Factory recipe management
- `handlers/game.js` - Ticket management (integrated with game handlers)

**Routing:** `handlers/index.js` - Routes WebSocket messages to appropriate editor handlers

**Access Control:** All editors require God Mode verification via `utils/broadcast.js:verifyGodMode()`

**Communication:** WebSocket-based, JSON message protocol

**Evidence:**
- `handlers/index.js:17-144` - Handler routing map
- `handlers/playerEditor.js:1-343` - Player editor structure
- `handlers/mapEditor.js:1-1054` - Map editor structure
- `handlers/itemEditor.js:1-286` - Item editor structure
- `handlers/npcEditor.js:1-484` - NPC editor structure
- `handlers/craftingEditor.js:1-173` - Crafting editor structure
- `handlers/game.js:6203-6450` - Ticket handlers

---

# 2. Player Editor System

## 2.1 Schema / Source of Truth

**Primary Table:** `players` table in PostgreSQL

**Defined in:**
- `migrations/001_schema.sql` (base schema)
- Subsequent migrations (046, 051, 055, 027, 034, 035, 057)

**Core Fields:**
- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL UNIQUE`
- `current_room_id INTEGER NOT NULL REFERENCES rooms(id)`
- **Stats:** `stat_ingenuity`, `stat_resonance`, `stat_fortitude`, `stat_acumen` (all INT DEFAULT 5)
- **Abilities:** `ability_crafting`, `ability_attunement`, `ability_endurance`, `ability_commerce` (all INT DEFAULT 0)
- `resource_max_encumbrance INTEGER DEFAULT 100`
- `assignable_points INTEGER DEFAULT 5`
- `flag_god_mode INTEGER DEFAULT 0`
- `resource_vitalis INTEGER DEFAULT 50`
- `resource_max_vitalis INTEGER DEFAULT 100`
- `pulse_echoes INTEGER DEFAULT 0`
- `pulse_echo_tier INTEGER DEFAULT 1`
- Additional timing and config fields

**Evidence:**
- `migrations/001_schema.sql` - Base player schema
- `database.js:360-397` - `createPlayer()` function shows all default values

---

## 2.2 All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `id`, `name` (UNIQUE), `current_room_id`
- All stat_* fields (default 5)
- All ability_* fields (default 0)
- `resource_max_encumbrance` (default 100)
- `assignable_points` (default 5)
- `flag_god_mode` (default 0)
- Vitalis fields
- Pulse echo fields

### Nullable Fields
- `last_attune_time`
- `widget_config`
- `loop_delay_ms`
- `flag_always_first_time`

---

## 2.3 Player Editor Operations (Read/Write/Mutate)

### Read Operations

**`getAllPlayers()`**
- Location: `handlers/playerEditor.js:17-28`
- Calls: `database.js:getAllPlayers()`
- Returns: Array of all player objects
- Access: God mode required

**`getPlayerInventory(playerId)`**
- Location: `handlers/playerEditor.js:192-210`
- Calls: `database.js:getPlayerItems()`, `database.js:getPlayerCurrentEncumbrance()`
- Returns: Inventory array + current encumbrance
- Access: God mode required

### Write Operations

**`updatePlayer(player)`**
- Location: `handlers/playerEditor.js:33-187`
- Calls: `database.js:updatePlayer()`
- Validates: Player ID required, god mode required
- Special handling:
  - If `current_room_id` changed → transports player (lines 68-170)
  - Ends active harvest sessions (lines 84-93)
  - Drops factory widget items to ground if leaving factory room (lines 96-118)
  - Removes poofable items from old room (lines 111-117)
  - Broadcasts player left/joined messages (lines 120-164)
  - Sends room updates to affected players (lines 129-170)
  - Always sends stats update to transported player (lines 174-179)
- Access: God mode required

**`addPlayerInventoryItem(playerId, itemName, quantity)`**
- Location: `handlers/playerEditor.js:215-271`
- Validates:
  - Item exists in items table (lines 227-231)
  - Uses canonical item name from database (lines 234)
  - Checks encumbrance limit (lines 243-251)
- Calls: `database.js:addPlayerItem()`
- Updates: Sends stats update if player is online (lines 266-270)
- Access: God mode required

**`removePlayerInventoryItem(playerId, itemName, quantity)`**
- Location: `handlers/playerEditor.js:276-304`
- Calls: `database.js:removePlayerItem()`
- Updates: Sends stats update if player is online (lines 299-303)
- Access: God mode required

---

## 2.4 Validations + Missing Validations

### Implemented Validations
- God mode required for all operations `handlers/playerEditor.js:20-24, 36-40, 195-199, 218-222, 279-283`
- Player ID required for update `handlers/playerEditor.js:43-46`
- Item must exist in items table before granting `handlers/playerEditor.js:227-231`
- Encumbrance check before adding items `handlers/playerEditor.js:243-251`
- Vitalis bounds enforced in `database.js:updatePlayer()` (caps at max_vitalis, ensures ≥ 0)

### Missing Validations
- No validation that player exists before update (relies on database error)
- No validation for negative quantities in add/remove inventory
- No validation for stat ranges (can set stats to any value)
- No validation for ability ranges
- No validation for assignable_points bounds
- No validation for pulse_echo values
- No validation that room exists when updating `current_room_id` (relies on foreign key)

---

## 2.5 Behavioral Rules / Invariants

### Enforced by Code
- Vitalis: `0 ≤ vitalis ≤ max_vitalis` (enforced in `database.js:updatePlayer()`)
- Encumbrance: Checked before adding items, but not enforced on direct stat updates
- Player name: Unique (database constraint)
- Room foreign key: Enforced at database level

### Not Enforced
- Stat maximums
- Ability bounds
- Assignable points can go negative via direct update
- Pulse echo values unconstrained
- Room existence not validated before transport

---

## 2.6 State Transitions (with file references)

### Player Update → Room Transport
1. **Handler:** `handlers/playerEditor.js:33-187` (`updatePlayer`)
2. **Check:** Room ID changed (line 69)
3. **Cleanup:** End harvest session `handlers/playerEditor.js:84-93`
4. **Cleanup:** Drop factory items `handlers/playerEditor.js:96-118`
5. **Cleanup:** Remove poofable items `handlers/playerEditor.js:111-117`
6. **Broadcast:** Player left old room `handlers/playerEditor.js:120-127`
7. **Broadcast:** Player joined new room `handlers/playerEditor.js:143-150`
8. **Update:** Send room updates to affected players `handlers/playerEditor.js:129-170`
9. **Update:** Send stats to transported player `handlers/playerEditor.js:174-179`

### Inventory Addition
1. **Handler:** `handlers/playerEditor.js:215-271` (`addPlayerInventoryItem`)
2. **Validate:** Item exists `handlers/playerEditor.js:227-231`
3. **Validate:** Encumbrance check `handlers/playerEditor.js:243-251`
4. **Database:** `database.js:addPlayerItem()` (line 254)
5. **Update:** Send stats if online `handlers/playerEditor.js:266-270`

---

## 2.7 Interactions with Other Systems

### NPC Cycle Engine
- Ends harvest sessions on room transport `handlers/playerEditor.js:84-93`
- Uses: `services/npcCycleEngine.js:findPlayerHarvestSession()`, `endHarvestSession()`

### Factory System
- Drops factory widget items to ground on room exit `handlers/playerEditor.js:96-118`
- Clears factory widget state `handlers/playerEditor.js:108`

### Broadcast System
- Uses: `utils/broadcast.js:verifyGodMode()`, `sendPlayerStats()`, `sendRoomUpdate()`, `broadcastToRoom()`, `getConnectedPlayersInRoom()`, `isRoomEmpty()`

### Database Layer
- All operations go through `database.js` helpers
- No direct SQL in editor handlers

---

## 2.8 Failure States & Error Messages

### Errors Sent to Client
- "God mode required" - `handlers/playerEditor.js:22, 38, 197, 220, 281`
- "Player id required" - `handlers/playerEditor.js:44`
- "Player not found" - `handlers/playerEditor.js:239`
- "Item does not exist in the items table" - `handlers/playerEditor.js:229`
- "Would exceed encumbrance limit" - `handlers/playerEditor.js:249`
- "Failed to update player" - `handlers/playerEditor.js:185`

### System-Level Failures
- Database constraint violations (name unique, FK room)
- Missing player in connectedPlayers (logged, non-fatal) `handlers/playerEditor.js:181`

---

## 2.9 Serialization Path

### Player List
- Sent as: `{ type: 'playerList', players: [...] }` `handlers/playerEditor.js:27`
- Format: Raw database player objects

### Player Updated
- Sent as: `{ type: 'playerUpdated', player: updatedPlayer }` `handlers/playerEditor.js:65`
- Format: Updated player object from database

### Inventory
- Sent as: `{ type: 'playerInventory', inventory: [...], currentEncumbrance: N }` `handlers/playerEditor.js:205-209`
- Format: Array of `{ item_name, quantity }` + encumbrance number

### Inventory Updated
- Sent as: `{ type: 'playerInventoryUpdated', inventory: [...], currentEncumbrance: N }` `handlers/playerEditor.js:259-263, 292-296`

---

## 2.10 Known Gaps / Missing Features

- No player deletion endpoint
- No player rename functionality
- No bulk operations (update multiple players)
- No validation for stat/ability ranges
- No audit logging of editor changes
- No rollback mechanism
- No validation that target room exists before transport

---

# 3. Map Editor System

## 3.1 Schema / Source of Truth

**Primary Tables:**
- `maps` - Map definitions
- `rooms` - Room instances
- `room_type_colors` - Room type color definitions

**Defined in:**
- `migrations/001_schema.sql:21-34` (rooms table)
- `migrations/071_add_factory_tier_quirks.sql:6-15` (factory fields)

**Core Room Fields:**
- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL`
- `description TEXT NOT NULL`
- `x INTEGER NOT NULL`
- `y INTEGER NOT NULL`
- `map_id INTEGER NOT NULL REFERENCES maps(id)`
- `room_type TEXT NOT NULL DEFAULT 'normal'`
- `connected_map_id INTEGER REFERENCES maps(id)`
- `connected_room_x INTEGER`
- `connected_room_y INTEGER`
- `connection_direction TEXT`
- `factory_tier INTEGER DEFAULT 1` (nullable, 1-5 or NULL)
- `factory_quirks JSONB` (nullable)

**Constraints:**
- UNIQUE `(map_id, x, y)` - Prevents duplicate rooms at same coordinates
- CHECK `factory_tier >= 1 AND factory_tier <= 5` (or NULL)

**Evidence:**
- `migrations/001_schema.sql:21-34` - Base room schema
- `migrations/071_add_factory_tier_quirks.sql:6-15` - Factory fields
- `database.js:67-73` - `createRoom()` function

---

## 3.2 All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `id`, `name`, `description`, `x`, `y`, `map_id`, `room_type` (default 'normal')

### Optional Fields (Nullable)
- `connected_map_id`, `connected_room_x`, `connected_room_y`, `connection_direction`
- `factory_tier` (default 1, nullable for non-factory rooms)
- `factory_quirks` (nullable)

---

## 3.3 Map Editor Operations (Read/Write/Mutate)

### Read Operations

**`getMapEditorData(mapId)`**
- Location: `handlers/mapEditor.js:25-76`
- Returns: Rooms array, room type colors, room types list, all items
- Access: God mode required

**`getAllMaps()`**
- Location: `handlers/mapEditor.js:303-317`
- Returns: Array of all maps `{ id, name }`
- Access: God mode required

**`getAllRoomTypeColors()`**
- Location: `handlers/mapEditor.js:460-475`
- Returns: Color map keyed by room type
- Access: God mode required

**`getAllRoomTypes()`**
- Location: `handlers/mapEditor.js:480-511`
- Ensures: Warehouse type exists, removes 'shop' type (consolidates to 'merchant')
- Returns: Array of room type strings
- Access: God mode required

**`getJumpMaps()`**
- Location: `handlers/mapEditor.js:564-575`
- Returns: All maps for teleport widget
- Access: God mode required

**`getJumpRooms(mapId)`**
- Location: `handlers/mapEditor.js:580-597`
- Returns: All rooms in specified map
- Access: God mode required

**`getRoomItemsForEditor(roomId)`**
- Location: `handlers/mapEditor.js:761-784`
- Returns: Room items + all items list
- Access: God mode required

### Write Operations

**`createMap(name, width, height, description)`**
- Location: `handlers/mapEditor.js:81-106`
- Validates: Name required (lines 91-94)
- Calls: `database.js:createMap()`
- Returns: `{ type: 'mapCreated', mapId, name }`
- Access: God mode required

**`createRoom(mapId, name, description, x, y, roomType)`**
- Location: `handlers/mapEditor.js:111-171`
- Validates:
  - Required fields present (lines 121-124)
  - Room type in allowed list ['normal', 'merchant', 'bank', 'warehouse'] (lines 128-132)
  - Room type exists in `room_type_colors` table (lines 135-140)
  - No existing room at coordinates (lines 143-147)
- Calls: `database.js:createRoom()`, `database.js:updateMapSize()`
- Returns: `{ type: 'roomCreated', room: {...} }`
- Access: God mode required

**`updateRoom(roomId, name, description, roomType, factory_tier, ...)`**
- Location: `handlers/mapEditor.js:228-298`
- Validates:
  - Required fields present (lines 239-242)
  - Room type in allowed list ['normal', 'merchant', 'bank', 'warehouse', 'factory'] (lines 245-250)
  - Room type exists in `room_type_colors` table (lines 253-258)
- Accepts: Both camelCase (`roomType`) and snake_case (`room_type`) (line 238)
- Calls: `database.js:updateRoom()`
- Returns: `{ type: 'roomUpdated', room: {...} }`
- Access: God mode required

**`deleteRoom(roomId)`**
- Location: `handlers/mapEditor.js:176-223`
- Validates:
  - Room ID required (lines 181-184)
  - Room exists (lines 187-191)
  - Room not part of outgoing map connection (lines 194-200)
  - No incoming map connections (lines 203-216)
- Calls: Direct SQL DELETE (line 219)
- Returns: `{ type: 'roomDeleted', roomId }`
- Access: No god mode check (should be added)

**`connectMaps(sourceRoomId, sourceDirection, targetMapId, targetX, targetY)`**
- Location: `handlers/mapEditor.js:322-409`
- Validates:
  - Source room exists (lines 334-338)
  - Source room has available exit in requested direction (lines 341-350)
  - Target room exists (lines 353-357)
  - Target room has available exit in opposite direction (lines 367-372)
- Updates: Both source and target rooms with bidirectional connection (lines 375-386)
- Returns: `{ type: 'mapConnected', sourceRoom: {...}, targetRoom: {...} }`
- Access: God mode required

**`disconnectMap(roomId)`**
- Location: `handlers/mapEditor.js:414-455`
- Calls: `database.js:disconnectRoom()` (handles both ends)
- Returns: `{ type: 'mapDisconnected', room: {...} }`
- Access: God mode required

**`setRoomTypeColor(roomType, color)`**
- Location: `handlers/mapEditor.js:516-559`
- Validates: Room type and color required (lines 526-529)
- Calls: `database.js:setRoomTypeColor()`
- Broadcasts: Updates to all connected god mode players (lines 540-555)
- Returns: `{ type: 'roomTypeColorUpdated', roomType, color }`
- Access: God mode required

**`jumpToRoom(roomId)`**
- Location: `handlers/mapEditor.js:602-756`
- Validates: Player selected, god mode required, room ID required, room exists
- Special handling:
  - Ends active harvest session (lines 638-643)
  - Drops factory widget items to ground (lines 646-664)
  - Removes poofable items from old room (lines 666-667)
  - Broadcasts player left/joined messages (lines 671-674, 747-750)
  - Sends full room update to player (lines 714-727)
  - Sends map data update (lines 730-744)
- Access: God mode required

**`addItemToRoom(roomId, itemName, quantity)`**
- Location: `handlers/mapEditor.js:789-816`
- Validates: Room ID and item name required (lines 799-802)
- Calls: `database.js:addRoomItem()`
- Returns: `{ type: 'roomItemAdded', roomId, itemName, roomItems: [...] }`
- Access: God mode required

**`removeItemFromRoom(roomId, itemName, quantity)`**
- Location: `handlers/mapEditor.js:821-848`
- Validates: Room ID and item name required (lines 831-834)
- Calls: `database.js:removeRoomItem()`
- Returns: `{ type: 'roomItemRemoved', roomId, itemName, roomItems: [...] }`
- Access: God mode required

**`clearAllItemsFromRoom(roomId)`**
- Location: `handlers/mapEditor.js:853-882`
- Validates: Room ID required (lines 863-866)
- Calls: `database.js:removeRoomItem()` for each item
- Returns: `{ type: 'roomItemsCleared', roomId, roomItems: [] }`
- Access: God mode required

### Merchant Operations

**`getMerchantInventory(roomId)`**
- Location: `handlers/mapEditor.js:887-904`
- Calls: `database.js:getMerchantItemsForRoom()`
- Returns: `{ type: 'merchantInventory', roomId, merchantItems: [...] }`
- Access: God mode required

**`addItemToMerchantRoom(itemId, roomId)`**
- Location: `handlers/mapEditor.js:909-953`
- Creates: Default merchant config JSON (lines 926-934)
- Calls: `database.js:addItemToMerchant()`
- Returns: Updated merchant inventory
- Access: God mode required

**`updateMerchantItemConfig(merchantItemId, config, roomId)`**
- Location: `handlers/mapEditor.js:958-995`
- Validates: Config is valid JSON (lines 975-980)
- Calls: `database.js:updateMerchantItemFromConfig()`
- Returns: Updated merchant inventory
- Access: God mode required

**`removeMerchantItem(merchantItemId, roomId)`**
- Location: `handlers/mapEditor.js:1000-1028`
- Calls: `database.js:removeItemFromMerchant()`
- Returns: Updated merchant inventory
- Access: God mode required

---

## 3.4 Validations + Missing Validations

### Implemented Validations
- God mode required (most operations)
- Required fields validation (createRoom, updateRoom, deleteRoom)
- Room type in allowed list (createRoom, updateRoom)
- Room type exists in database (createRoom, updateRoom)
- No duplicate room at coordinates (createRoom)
- Room exists before delete/update (deleteRoom, updateRoom)
- No outgoing map connection before delete (deleteRoom)
- No incoming map connections before delete (deleteRoom)
- Source/target rooms exist for map connection (connectMaps)
- Available exits for map connection (connectMaps)

### Missing Validations
- No coordinate bounds checking (can create rooms at negative coordinates)
- No validation that map exists before creating room
- No validation for factory_tier range in application (only database constraint)
- No validation that factory_quirks JSON is valid structure
- No validation that room has players before deletion
- No validation that room has items/NPCs before deletion
- No validation for description length
- No validation for room name uniqueness (multiple rooms can have same name)

---

## 3.5 Behavioral Rules / Invariants

### Enforced by Code
- Unique coordinates per map (database UNIQUE constraint)
- Map foreign key (database constraint)
- Factory tier range 1-5 or NULL (database CHECK constraint)
- Room type default 'normal' (database DEFAULT)
- Bidirectional map connections (connectMaps creates both directions)

### Not Enforced
- Map connection bidirectionality integrity (can be broken manually)
- Factory tier consistency (non-factory rooms can have factory_tier set)
- Coordinate bounds
- Room deletion safety (can delete rooms with players/items/NPCs)

---

## 3.6 State Transitions (with file references)

### Room Creation
1. **Handler:** `handlers/mapEditor.js:111-171` (`createRoom`)
2. **Validation:** All validations pass (lines 121-147)
3. **Database:** `database.js:createRoom()` (line 150)
4. **Database:** `database.js:updateMapSize()` (line 154)
5. **Response:** `{ type: 'roomCreated', room: {...} }` (lines 156-167)

### Room Update
1. **Handler:** `handlers/mapEditor.js:228-298` (`updateRoom`)
2. **Validation:** All validations pass (lines 239-258)
3. **Database:** `database.js:updateRoom()` (lines 262-272)
4. **Response:** `{ type: 'roomUpdated', room: {...} }` (lines 275-294)

### Room Deletion
1. **Handler:** `handlers/mapEditor.js:176-223` (`deleteRoom`)
2. **Validation:** All validations pass (lines 181-216)
3. **Database:** Direct SQL DELETE (line 219)
4. **Response:** `{ type: 'roomDeleted', roomId }` (line 222)
5. **Cascade:** Foreign key constraints will orphan `room_items` and `room_npcs` records

### Map Connection
1. **Handler:** `handlers/mapEditor.js:322-409` (`connectMaps`)
2. **Validation:** Source/target rooms exist, exits available (lines 334-372)
3. **Database:** Two UPDATE queries (lines 375-386)
4. **Response:** `{ type: 'mapConnected', sourceRoom: {...}, targetRoom: {...} }` (lines 392-408)

### Player Teleport (jumpToRoom)
1. **Handler:** `handlers/mapEditor.js:602-756` (`jumpToRoom`)
2. **Database:** `database.js:updatePlayerRoom()` (line 631)
3. **Cleanup:** End harvest session (lines 638-643)
4. **Cleanup:** Drop factory items (lines 646-664)
5. **Cleanup:** Remove poofable items (lines 666-667)
6. **Broadcast:** Player left old room (lines 671-674)
7. **Send:** Full room update to player (lines 714-727)
8. **Send:** Map data update (lines 730-744)
9. **Broadcast:** Player joined new room (lines 747-750)

---

## 3.7 Interactions with Other Systems

### NPC Cycle Engine
- Ends harvest sessions on teleport `handlers/mapEditor.js:638-643`

### Factory System
- Drops factory widget items on room exit `handlers/mapEditor.js:646-664`
- Manages factory widget state `handlers/mapEditor.js:691-711`

### Broadcast System
- Uses: `utils/broadcast.js:verifyGodMode()`, `getExits()`, `broadcastToRoom()`, `getConnectedPlayersInRoom()`, `isRoomEmpty()`, `sendRoomUpdate()`

### Database Layer
- All operations go through `database.js` helpers (except deleteRoom which uses direct SQL)

---

## 3.8 Failure States & Error Messages

### Errors Sent to Client
- "God mode required" - Multiple locations
- "Map not found" - `handlers/mapEditor.js:37`
- "Missing required fields" - `handlers/mapEditor.js:122, 240`
- "Invalid room type: X. Valid types: ..." - `handlers/mapEditor.js:130, 248`
- "Room type X not found in database" - `handlers/mapEditor.js:138, 256`
- "Room already exists at these coordinates" - `handlers/mapEditor.js:145`
- "Room not found" - `handlers/mapEditor.js:189, 432`
- "Cannot delete room - it is part of a map connection" - `handlers/mapEditor.js:195-199`
- "Source room already has exit in that direction" - `handlers/mapEditor.js:348`
- "Target room does not exist at those coordinates" - `handlers/mapEditor.js:355`
- "Target room already has exit in opposite direction" - `handlers/mapEditor.js:370`
- "Failed to create/update/delete room" - Multiple locations

---

## 3.9 Serialization Path

### Map Editor Data
- Sent as: `{ type: 'mapEditorData', rooms: [...], roomTypeColors: {...}, roomTypes: [...], allItems: [...] }` `handlers/mapEditor.js:55-75`

### Room Created/Updated
- Sent as: `{ type: 'roomCreated'/'roomUpdated', room: {...} }` `handlers/mapEditor.js:156-167, 275-294`

### Room Items
- Sent as: `{ type: 'roomItemsForEditor', roomId, roomItems: [...], allItems: [...] }` `handlers/mapEditor.js:778-783`

---

## 3.10 Known Gaps / Missing Features

- No coordinate bounds validation
- No validation that map exists before room creation
- No validation for factory_quirks JSON structure
- No room deletion safety checks (players/items/NPCs)
- No room name uniqueness enforcement
- No description length limits
- No bulk operations (create/update multiple rooms)
- No room template system
- No undo/rollback mechanism
- No audit logging

---

# 4. Item Editor System

## 4.1 Schema / Source of Truth

**Primary Table:** `items` table in PostgreSQL

**Defined in:**
- `migrations/001_schema.sql:95-104` (base schema)

**Core Fields:**
- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL UNIQUE`
- `description TEXT` (nullable)
- `item_type TEXT NOT NULL DEFAULT 'sundries'`
- `active BOOLEAN NOT NULL DEFAULT TRUE`
- `poofable BOOLEAN NOT NULL DEFAULT FALSE`
- `encumbrance INTEGER NOT NULL DEFAULT 0`
- `created_at BIGINT NOT NULL`
- `rune_color TEXT` (nullable, for rune items)
- `rune_type TEXT` (nullable, for rune items)
- Deed fields (nullable, for deed items)

**Evidence:**
- `migrations/001_schema.sql:95-104` - Base item schema
- `database.js:createItem()`, `database.js:updateItem()` - Item operations

---

## 4.2 All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `id`, `name` (UNIQUE), `item_type` (default 'sundries'), `active` (default TRUE), `poofable` (default FALSE), `encumbrance` (default 0), `created_at`

### Nullable Fields
- `description`, `rune_color`, `rune_type`, deed fields

---

## 4.3 Item Editor Operations (Read/Write/Mutate)

### Read Operations

**`getAllItems()`**
- Location: `handlers/itemEditor.js:13-29`
- Returns: Items array, item types list, warehouse rooms, merchant rooms
- Calls: `database.js:getAllItems()`, `database.js:getAllItemTypes()`, `database.js:getWarehouseRooms()`, `database.js:getMerchantRooms()`
- Access: God mode required

**`getAllItemTypes()`**
- Location: `handlers/itemEditor.js:34-61`
- Ensures: Three valid item types exist ('ingredient', 'rune', 'deed') (lines 45-56)
- Returns: Array of item type strings
- Access: God mode required

**`getWarehouseRooms()`**
- Location: `handlers/itemEditor.js:125-136`
- Returns: Array of warehouse room objects
- Access: God mode required

**`getMerchantRooms()`**
- Location: `handlers/itemEditor.js:141-152`
- Returns: Array of merchant room objects
- Access: God mode required

**`getMerchantItems(itemId)`**
- Location: `handlers/itemEditor.js:157-174`
- Returns: Array of merchant items for specific item
- Access: God mode required

### Write Operations

**`createItem(item)`**
- Location: `handlers/itemEditor.js:66-87`
- Validates: Item name required (lines 76-79)
- Calls: `database.js:createItem()`
- Returns: `{ type: 'itemCreated', item: newItem }`
- Access: God mode required

**`updateItem(item)`**
- Location: `handlers/itemEditor.js:92-120`
- Validates:
  - Item ID required (lines 102-105)
  - Item type in allowed list ['ingredient', 'rune', 'deed'] (lines 108-112)
- Calls: `database.js:updateItem()`
- Returns: `{ type: 'itemUpdated', item: updatedItem }`
- Access: God mode required

**`addItemToMerchant(itemId, roomId)`**
- Location: `handlers/itemEditor.js:179-220`
- Creates: Default merchant config JSON (lines 196-204)
- Calls: `database.js:addItemToMerchant()`
- Returns: `{ type: 'merchantItemAdded', merchantItem }`
- Access: God mode required

**`updateMerchantItem(merchantItemId, unlimited, maxQty, regenHours)`**
- Location: `handlers/itemEditor.js:225-246`
- Calls: `database.js:updateMerchantItem()`
- Returns: `{ type: 'merchantItemUpdated', merchantItem }`
- Access: God mode required

**`removeItemFromMerchant(merchantItemId)`**
- Location: `handlers/itemEditor.js:251-272`
- Calls: `database.js:removeItemFromMerchant()`
- Returns: `{ type: 'merchantItemRemoved', merchantItemId }`
- Access: God mode required

---

## 4.4 Validations + Missing Validations

### Implemented Validations
- God mode required for all operations
- Item name required for create (lines 76-79)
- Item ID required for update (lines 102-105)
- Item type in allowed list ['ingredient', 'rune', 'deed'] (lines 108-112)
- Item name uniqueness (database constraint)

### Missing Validations
- No validation for encumbrance range (can be negative)
- No validation for rune_type when item_type is 'rune'
- No validation for rune_color format
- No validation for deed fields when item_type is 'deed'
- No validation for description length
- No validation that item exists before update (relies on database error)
- No validation for merchant item configuration JSON structure

---

## 4.5 Behavioral Rules / Invariants

### Enforced by Code
- Item name unique (database constraint)
- Item type validation (application level, lines 108-112)
- Three valid item types enforced: 'ingredient', 'rune', 'deed'

### Not Enforced
- Rune items should have rune_type set
- Deed items should have deed fields set
- Encumbrance should be non-negative
- Item type consistency (can set item_type without setting related fields)

---

## 4.6 State Transitions (with file references)

### Item Creation
1. **Handler:** `handlers/itemEditor.js:66-87` (`createItem`)
2. **Validation:** Name required (lines 76-79)
3. **Database:** `database.js:createItem()` (line 82)
4. **Response:** `{ type: 'itemCreated', item: newItem }` (line 83)

### Item Update
1. **Handler:** `handlers/itemEditor.js:92-120` (`updateItem`)
2. **Validation:** ID required, item type valid (lines 102-112)
3. **Database:** `database.js:updateItem()` (line 115)
4. **Response:** `{ type: 'itemUpdated', item: updatedItem }` (line 116)

---

## 4.7 Interactions with Other Systems

### Merchant System
- Adds items to merchant rooms `handlers/itemEditor.js:179-220`
- Updates merchant item configuration `handlers/itemEditor.js:225-246`

### Warehouse System
- Provides warehouse rooms list for deed configuration `handlers/itemEditor.js:125-136`

### Database Layer
- All operations go through `database.js` helpers

---

## 4.8 Failure States & Error Messages

### Errors Sent to Client
- "God mode required" - Multiple locations
- "Item name required" - `handlers/itemEditor.js:77`
- "Item id required" - `handlers/itemEditor.js:103`
- "Invalid item type: X. Valid types: ..." - `handlers/itemEditor.js:110`
- "Item ID and Room ID required" - `handlers/itemEditor.js:189`
- "Merchant Item ID required" - `handlers/itemEditor.js:236, 261`
- "Failed to create/update item" - Multiple locations

---

## 4.9 Serialization Path

### Item List
- Sent as: `{ type: 'itemList', items: [...], itemTypes: [...], warehouseRooms: [...], merchantRooms: [...] }` `handlers/itemEditor.js:28`

### Item Created/Updated
- Sent as: `{ type: 'itemCreated'/'itemUpdated', item: {...} }` `handlers/itemEditor.js:83, 116`

---

## 4.10 Known Gaps / Missing Features

- No item deletion endpoint
- No validation for encumbrance range
- No validation for rune/deed field consistency
- No bulk operations
- No item template system
- No audit logging

---

# 5. NPC Editor System

## 5.1 Schema / Source of Truth

**Primary Tables:**
- `scriptable_npcs` - NPC templates
- `room_npcs` - NPC placements in rooms
- `lore_keepers` - Lorekeeper-specific configuration

**Defined in:**
- `migrations/001_schema.sql:83-92` (room_npcs)
- Additional migrations for scriptable_npcs and lore_keepers

**Core Scriptable NPC Fields:**
- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL`
- `description TEXT`
- `npc_type TEXT NOT NULL`
- `base_cycle_time INTEGER NOT NULL`
- `display_color TEXT` (default '#00ff00')
- `behaviorType TEXT`
- `stats JSONB`
- Additional harvest/lorekeeper fields

**Core Room NPC Fields:**
- `id SERIAL PRIMARY KEY`
- `npc_id INTEGER REFERENCES scriptable_npcs(id)`
- `room_id INTEGER REFERENCES rooms(id)`
- `state JSONB`
- `last_cycle_run BIGINT`
- `active BOOLEAN`
- `slot INTEGER`
- `spawn_rules JSONB`

**Evidence:**
- `database.js:createScriptableNPC()`, `database.js:updateScriptableNPC()` - NPC operations
- `database.js:placeNPCInRoom()`, `database.js:deleteNpcPlacement()` - Placement operations

---

## 5.2 All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `id`, `name`, `npc_type`, `base_cycle_time` for scriptable_npcs
- `id`, `npc_id`, `room_id` for room_npcs

### Nullable Fields
- `description`, `display_color` (defaults to '#00ff00'), `stats`, `state`, `spawn_rules`

---

## 5.3 NPC Editor Operations (Read/Write/Mutate)

### Read Operations

**`getAllNPCs()`**
- Location: `handlers/npcEditor.js:14-36`
- Calls: `database.js:getAllScriptableNPCs()`
- Attaches: Lorekeeper data for lorekeeper type NPCs (lines 26-30)
- Returns: `{ type: 'npcList', npcs: [...] }`
- Access: God mode required

**`getNpcPlacements(npcId)`**
- Location: `handlers/npcEditor.js:192-213`
- Calls: `database.js:getNpcPlacements()`
- Returns: `{ type: 'npcPlacements', npcId, placements: [...] }`
- Access: God mode required

**`getNpcPlacementRooms(mapId)`**
- Location: `handlers/npcEditor.js:218-249`
- Calls: `database.js:getRoomsForNpcPlacement()`
- Returns: `{ type: 'npcPlacementRooms', map: {...}, rooms: [...] }`
- Access: God mode required

**`getNpcPlacementMaps()`**
- Location: `handlers/npcEditor.js:254-268`
- Calls: `database.js:getAllMaps()`
- Returns: `{ type: 'npcPlacementMaps', maps: [...] }`
- Access: God mode required

**`getHarvestFormulaConfigs()`**
- Location: `handlers/npcEditor.js:337-349`
- Calls: `database.js:getAllHarvestFormulaConfigs()`
- Returns: `{ type: 'harvestFormulaConfigs', configs: [...] }`
- Access: No god mode check (should be added)

**`getLoreKeeperHistory(npcId)`**
- Location: `handlers/npcEditor.js:399-427`
- Calls: `database.js:getLoreKeeperGreetings()`, `database.js:getLoreKeeperItemAwards()`
- Returns: `{ type: 'loreKeeperHistory', npcId, greetings: [...], itemAwards: [...] }`
- Access: God mode required

### Write Operations

**`createNPC(npc)`**
- Location: `handlers/npcEditor.js:41-104`
- Validates: Required fields present (name, npc_type, base_cycle_time) (lines 52-55)
- Sets: Default display_color '#00ff00' if not provided (lines 57-59)
- Calls: `database.js:createScriptableNPC()` (line 62)
- Special: Creates lore_keepers record if npc_type is 'lorekeeper' (lines 65-88)
- Returns: `{ type: 'npcCreated', npc: created }`
- Access: God mode required

**`updateNPC(npc)`**
- Location: `handlers/npcEditor.js:109-187`
- Validates: Required fields present (lines 120-123)
- Sets: Default display_color '#00ff00' if not provided (lines 125-127)
- Handles: Lorekeeper type transitions (lines 130-171)
  - If changing to lorekeeper: Creates or updates lore_keepers record
  - If changing from lorekeeper: Deletes lore_keepers record
- Calls: `database.js:updateScriptableNPC()` (line 135)
- Returns: `{ type: 'npcUpdated', npc: updated }`
- Access: God mode required

**`addNpcToRoom(npcId, roomId, slot)`**
- Location: `handlers/npcEditor.js:273-300`
- Validates: NPC ID and room ID required (lines 283-286)
- Calls: `database.js:placeNPCInRoom()` (line 290)
- Returns: `{ type: 'npcPlacementAdded', placement: {...} }`
- Access: God mode required

**`removeNpcFromRoom(placementId, npcId)`**
- Location: `handlers/npcEditor.js:305-332`
- Validates: Placement ID required (lines 315-318)
- Calls: `database.js:deleteNpcPlacement()` (line 321)
- Returns: `{ type: 'npcPlacementRemoved', placementId, npcId, placements: [...] }`
- Access: God mode required

**`updateHarvestFormulaConfig(config)`**
- Location: `handlers/npcEditor.js:354-394`
- Validates: Config key required (lines 358-361)
- Calls: `database.js:updateHarvestFormulaConfig()` (lines 366-372)
- Clears: Formula config cache `utils/harvestFormulas.js:clearConfigCache()` (line 375)
- Updates: Global room update interval if config_key is 'room_update_interval_ms' (lines 379-385)
- Returns: `{ type: 'harvestFormulaConfigUpdated', config_key }`
- Access: No god mode check (should be added)

**`clearLoreKeeperHistory(npcId, clearGreetings, clearItemAwards)`**
- Location: `handlers/npcEditor.js:432-468`
- Validates: NPC ID required (lines 442-445)
- Calls: `database.js:clearLoreKeeperGreetings()`, `database.js:clearLoreKeeperItemAwards()` (lines 448-453)
- Returns: Updated history
- Access: God mode required

---

## 5.4 Validations + Missing Validations

### Implemented Validations
- God mode required (most operations)
- Required fields validation (createNPC, updateNPC)
- NPC ID and room ID required for placement (addNpcToRoom)
- Placement ID required for removal (removeNpcFromRoom)
- Config key required for formula update (updateHarvestFormulaConfig)

### Missing Validations
- No validation for npc_type values
- No validation for base_cycle_time range (can be negative or zero)
- No validation for display_color format
- No validation that NPC exists before update
- No validation that room exists before placement
- No validation for slot number range
- No validation for harvest formula config values
- No validation for lorekeeper configuration JSON structure

---

## 5.5 Behavioral Rules / Invariants

### Enforced by Code
- Lorekeeper type creates/updates/deletes lore_keepers record automatically (lines 65-88, 138-171)
- Display color defaults to '#00ff00' if not provided (lines 57-59, 125-127)
- Formula config cache cleared on update (line 375)
- Global room update interval updated if config_key matches (lines 379-385)

### Not Enforced
- NPC type consistency
- Base cycle time must be positive
- Slot number must be valid
- Lorekeeper configuration structure

---

## 5.6 State Transitions (with file references)

### NPC Creation
1. **Handler:** `handlers/npcEditor.js:41-104` (`createNPC`)
2. **Validation:** Required fields present (lines 52-55)
3. **Database:** `database.js:createScriptableNPC()` (line 62)
4. **Special:** Create lore_keepers if type is 'lorekeeper' (lines 65-88)
5. **Response:** `{ type: 'npcCreated', npc: created }` (lines 97-100)

### NPC Update with Type Change
1. **Handler:** `handlers/npcEditor.js:109-187` (`updateNPC`)
2. **Check:** Type changed from/to lorekeeper (lines 132-133)
3. **Database:** `database.js:updateScriptableNPC()` (line 135)
4. **Transition:** Create/update/delete lore_keepers record (lines 138-171)
5. **Response:** `{ type: 'npcUpdated', npc: updated }` (lines 180-183)

### NPC Placement
1. **Handler:** `handlers/npcEditor.js:273-300` (`addNpcToRoom`)
2. **Validation:** NPC ID and room ID required (lines 283-286)
3. **Database:** `database.js:placeNPCInRoom()` (line 290)
4. **Response:** `{ type: 'npcPlacementAdded', placement: {...} }` (lines 293-296)

---

## 5.7 Interactions with Other Systems

### Harvest Formula System
- Updates formula configs `handlers/npcEditor.js:354-394`
- Clears formula cache `utils/harvestFormulas.js:clearConfigCache()`

### NPC Cycle Engine
- Updates global room update interval `services/npcCycleEngine.js:setGlobalRoomUpdateInterval()`

### Lorekeeper System
- Manages lore_keepers table records
- Tracks greeting and item award history

### Database Layer
- All operations go through `database.js` helpers

---

## 5.8 Failure States & Error Messages

### Errors Sent to Client
- "God mode required" - Multiple locations
- "Missing required NPC fields" - `handlers/npcEditor.js:53, 121`
- "NPC id required" - `handlers/npcEditor.js:203`
- "NPC id and Room id are required" - `handlers/npcEditor.js:284`
- "Placement id required" - `handlers/npcEditor.js:316`
- "Invalid config data" - `handlers/npcEditor.js:359`
- "Failed to create/update NPC" - Multiple locations

---

## 5.9 Serialization Path

### NPC List
- Sent as: `{ type: 'npcList', npcs: [...] }` `handlers/npcEditor.js:32-35`
- Format: NPC objects with attached lorekeeper data if applicable

### NPC Created/Updated
- Sent as: `{ type: 'npcCreated'/'npcUpdated', npc: {...} }` `handlers/npcEditor.js:97-100, 180-183`

### NPC Placements
- Sent as: `{ type: 'npcPlacements', npcId, placements: [...] }` `handlers/npcEditor.js:208-212`

---

## 5.10 Known Gaps / Missing Features

- No NPC deletion endpoint
- No validation for npc_type values
- No validation for base_cycle_time range
- No validation for slot numbers
- No bulk operations
- No NPC template system
- No audit logging

---

# 6. Crafting Editor System

## 6.1 Schema / Source of Truth

**Primary Table:** `factory_recipes` table in PostgreSQL

**Defined in:**
- Factory recipe migrations

**Core Fields:**
- `recipe_id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL`
- `inputs JSONB` - Required ingredients
- `outputs JSONB` - Crafted items
- `required_stats JSONB` - Stat requirements
- `success_rate INTEGER` - Base success percentage
- `tier INTEGER` - Factory tier required
- `active BOOLEAN` - Whether recipe is active
- Additional fields for timing, crit, etc.

**Evidence:**
- `database.js:createFactoryRecipe()`, `database.js:updateFactoryRecipe()` - Recipe operations

---

## 6.2 All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `recipe_id`, `name`

### Nullable/Optional Fields
- `inputs`, `outputs`, `required_stats`, `success_rate`, `tier`, `active`

---

## 6.3 Crafting Editor Operations (Read/Write/Mutate)

### Read Operations

**`getFactoryRecipes()`**
- Location: `handlers/craftingEditor.js:14-34`
- Calls: `database.js:getFactoryRecipes({ active: null })` - Gets all recipes, not just active
- Returns: `{ type: 'factoryRecipes', recipes: [...] }`
- Access: God mode required

**`getFactoryRecipe(recipe_id)`**
- Location: `handlers/craftingEditor.js:39-69`
- Validates: Recipe ID required (lines 49-52)
- Calls: `database.js:getFactoryRecipeById()`
- Returns: `{ type: 'factoryRecipe', recipe: {...} }` or error if not found
- Access: God mode required

### Write Operations

**`createFactoryRecipe(recipe)`**
- Location: `handlers/craftingEditor.js:74-101`
- Validates: Recipe name required (lines 84-87)
- Calls: `database.js:createFactoryRecipe()` (line 90)
- Returns: `{ type: 'factoryRecipeCreated', recipe: createdRecipe }`
- Access: God mode required

**`updateFactoryRecipe(recipe)`**
- Location: `handlers/craftingEditor.js:106-133`
- Validates: Recipe ID required (lines 116-119)
- Calls: `database.js:updateFactoryRecipe()` (line 122)
- Returns: `{ type: 'factoryRecipeUpdated', recipe: updatedRecipe }`
- Access: God mode required

**`deleteFactoryRecipe(recipe_id)`**
- Location: `handlers/craftingEditor.js:138-164`
- Validates: Recipe ID required (lines 148-151)
- Calls: `database.js:deleteFactoryRecipe()` (line 154)
- Returns: `{ type: 'factoryRecipeDeleted', recipe_id }`
- Access: God mode required

---

## 6.4 Validations + Missing Validations

### Implemented Validations
- God mode required for all operations
- Recipe name required for create (lines 84-87)
- Recipe ID required for update/delete (lines 116-119, 148-151)
- Recipe exists check for get/update/delete

### Missing Validations
- No validation for recipe name uniqueness
- No validation for inputs/outputs JSONB structure
- No validation for required_stats JSONB structure
- No validation for success_rate range (0-100)
- No validation for tier range
- No validation that input/output items exist in items table
- No validation for recipe structure consistency

---

## 6.5 Behavioral Rules / Invariants

### Enforced by Code
- Recipe ID must exist for update/delete operations

### Not Enforced
- Recipe name uniqueness
- Input/output item existence
- Success rate bounds
- Tier bounds
- Recipe structure consistency

---

## 6.6 State Transitions (with file references)

### Recipe Creation
1. **Handler:** `handlers/craftingEditor.js:74-101` (`createFactoryRecipe`)
2. **Validation:** Name required (lines 84-87)
3. **Database:** `database.js:createFactoryRecipe()` (line 90)
4. **Response:** `{ type: 'factoryRecipeCreated', recipe: createdRecipe }` (lines 93-96)

### Recipe Update
1. **Handler:** `handlers/craftingEditor.js:106-133` (`updateFactoryRecipe`)
2. **Validation:** Recipe ID required (lines 116-119)
3. **Database:** `database.js:updateFactoryRecipe()` (line 122)
4. **Response:** `{ type: 'factoryRecipeUpdated', recipe: updatedRecipe }` (lines 125-128)

### Recipe Deletion
1. **Handler:** `handlers/craftingEditor.js:138-164` (`deleteFactoryRecipe`)
2. **Validation:** Recipe ID required (lines 148-151)
3. **Database:** `database.js:deleteFactoryRecipe()` (line 154)
4. **Response:** `{ type: 'factoryRecipeDeleted', recipe_id }` (lines 156-159)

---

## 6.7 Interactions with Other Systems

### Factory Crafting Engine
- Recipes used by `services/factoryRecipeMatcher.js` for matching
- Recipes used by `services/factoryCraftingEngine.js` for success calculations

### Database Layer
- All operations go through `database.js` helpers

---

## 6.8 Failure States & Error Messages

### Errors Sent to Client
- "God mode required" - Multiple locations
- "Recipe name is required" - `handlers/craftingEditor.js:85`
- "recipe_id required" - `handlers/craftingEditor.js:50, 117, 149`
- "Recipe not found" - `handlers/craftingEditor.js:57`
- "Failed to create/update/delete recipe" - Multiple locations

---

## 6.9 Serialization Path

### Recipe List
- Sent as: `{ type: 'factoryRecipes', recipes: [...] }` `handlers/craftingEditor.js:26-29`

### Single Recipe
- Sent as: `{ type: 'factoryRecipe', recipe: {...} }` `handlers/craftingEditor.js:61-64`

### Recipe Created/Updated/Deleted
- Sent as: `{ type: 'factoryRecipeCreated'/'factoryRecipeUpdated'/'factoryRecipeDeleted', recipe/recipe_id }` `handlers/craftingEditor.js:93-96, 125-128, 156-159`

---

## 6.10 Known Gaps / Missing Features

- No validation for recipe structure
- No validation for input/output item existence
- No validation for success_rate bounds
- No validation for tier bounds
- No recipe template system
- No bulk operations
- No audit logging

---

# 7. Ticketing Editor System

## 7.1 Schema / Source of Truth

**Primary Table:** `debug_todos` table in PostgreSQL

**Defined in:**
- Ticket/debug system migrations

**Core Fields:**
- `id SERIAL PRIMARY KEY`
- `title TEXT NOT NULL`
- `description TEXT`
- `ticket_type TEXT` - 'bug', 'feature', 'debug', 'manual', 'user'
- `status TEXT` - 'open', 'backlog', 'in_progress', 'resolved', 'deleted'
- `priority INTEGER` - 1 (low), 2 (medium), 3 (high), 4 (critical)
- `repro_steps TEXT`
- `environment JSONB`
- `logs JSONB`
- `resolution_notes TEXT`
- `tags TEXT[]` or JSONB
- `created_by TEXT`
- `created_at BIGINT`
- `updated_at BIGINT`
- `player_id INTEGER`
- `player_name TEXT`
- `session_id INTEGER`
- `estimated_effort INTEGER`

**Evidence:**
- `models/ticket.js:1-266` - Ticket model definition
- `database.js:createDebugTodo()`, `database.js:updateDebugTodo()` - Ticket operations

---

## 7.2 All Fields, Defaults, Nullability, Constraints

### Required Fields (NOT NULL)
- `id`, `title`

### Nullable/Optional Fields
- `description`, `ticket_type` (default 'debug'), `status` (default 'open'), `priority` (default 2), `repro_steps`, `environment`, `logs`, `resolution_notes`, `tags`, `created_by`, `player_id`, `player_name`, `session_id`, `estimated_effort`

### Valid Values
- `ticket_type`: ['bug', 'feature', 'debug', 'manual', 'user'] `models/ticket.js:21`
- `status`: ['open', 'backlog', 'in_progress', 'resolved', 'deleted'] `models/ticket.js:16`
- `priority`: [1, 2, 3, 4] `models/ticket.js:26`

---

## 7.3 Ticketing Editor Operations (Read/Write/Mutate)

### Read Operations

**`getTickets(status, limit, includeResolved)`**
- Location: `handlers/game.js:6295-6331`
- Calls: `database.js:listDebugTodos()`
- Filters: By status if provided, excludes resolved if `includeResolved = false`
- Returns: `{ type: 'ticketsList', tickets: [...], count: N }`
- Access: Authenticated (no god mode required for viewing)

**`getTicket(ticketId)`** (via ticketService)
- Location: `services/ticketService.js:76-84` (`fetchTicketById`)
- Calls: `database.js:getDebugTodo()`
- Returns: Normalized ticket object
- Access: Via service layer

### Write Operations

**`createTicket(title, description, priority, ticket_type, status, ...)`**
- Location: `handlers/game.js:6203-6290`
- Validates:
  - God mode required (lines 6213-6216)
  - Title required (lines 6230-6233)
  - Priority 1-4 (lines 6236-6239)
  - Ticket type in valid list (lines 6242-6245)
  - Status in valid list (lines 6249-6253)
- Calls: `database.js:createDebugTodo()` (line 6256)
- Updates: Additional fields if provided (tags, resolution_notes, status) (lines 6268-6278)
- Returns: `{ type: 'ticketCreated', ticket: {...} }`
- Access: God mode required

**`createZorkTicket(title, description, priority, ticketType)`**
- Location: `handlers/game.js:6114-6199`
- Validates:
  - Title required (lines 6125-6128)
  - Ticket type in valid list (lines 6138-6140)
- Calls: `database.js:createDebugTodo()` (line 6148)
- Creates: Trigger file for auto-ticket processor (lines 6170-6193)
- Returns: `{ type: 'zorkTicketCreated', ticketId, message }`
- Access: Authenticated (no god mode required - for user bug reports)

**`updateTicket(ticketId, status, feedback, resolutionNotes, priority, ...)`**
- Location: `handlers/game.js:6336-6415`
- Validates:
  - Ticket ID required (lines 6347-6350)
  - Status in valid list if provided (lines 6353-6357)
  - Priority 1-4 if provided (lines 6360-6364)
  - Ticket type in valid list if provided (lines 6367-6371)
- Calls: `database.js:updateDebugTodo()` (line 6374)
- Special: Appends feedback to resolution_notes with timestamp (lines 6380-6395)
- Returns: `{ type: 'ticketUpdated', ticket: updatedTicket }`
- Access: Authenticated (no god mode required for own tickets, god mode for all)

**`addTicketFeedback(ticketId, feedback)`**
- Location: `handlers/game.js:6417-6450`
- Validates: Ticket ID and feedback required (lines 6428-6431)
- Calls: `database.js:getDebugTodo()`, `database.js:updateDebugTodo()`
- Appends: Feedback to resolution_notes with timestamp
- Returns: `{ type: 'ticketFeedbackAdded', ticket: updatedTicket }`
- Access: Authenticated

### Service Layer Operations

**`fetchTickets(db, filters)`** (via ticketService)
- Location: `services/ticketService.js:28-68`
- Filters: By status, priority, ticketType, includeResolved, includeDeleted
- Calls: `database.js:listDebugTodos()`
- Normalizes: Uses `TicketModel.mapRowsToTickets()`
- Returns: Array of normalized ticket objects

**`createTicket(db, payload)`** (via ticketService)
- Location: `services/ticketService.js:92-122`
- Validates: Uses `TicketModel.validateTicket()`
- Calls: `database.js:createDebugTodo()`
- Returns: Normalized ticket object

**`updateTicket(db, id, payload)`** (via ticketService)
- Location: `services/ticketService.js:131-148`
- Calls: `database.js:updateDebugTodo()`
- Returns: Normalized ticket object

**`deleteTicket(db, id)`** (via ticketService)
- Location: `services/ticketService.js:156-169`
- Soft delete: Sets status to 'deleted'
- Returns: Updated ticket object

**`addTicketFeedback(db, id, feedback)`** (via ticketService)
- Location: `services/ticketService.js:178-199`
- Appends: Feedback to resolution_notes with timestamp
- Returns: Updated ticket object

**`fetchOpenTicketsForProcessing(db, options)`** (via ticketService)
- Location: `services/ticketService.js:227-254`
- Filters: Tickets with ID > sinceId, sorted by priority then ID
- Returns: Array of open tickets for Cursor processing

---

## 7.4 Validations + Missing Validations

### Implemented Validations
- Title required for create (lines 6230-6233, 6125-6128)
- Title max length 200 characters `models/ticket.js:197-199`
- Priority 1-4 validation (lines 6236-6239, 6360-6364)
- Ticket type in valid list (lines 6242-6245, 6367-6371)
- Status in valid list (lines 6249-6253, 6353-6357)
- Ticket ID required for update/feedback (lines 6347-6350, 6428-6431)
- Ticket exists check for update/feedback

### Missing Validations
- No validation for description length
- No validation for repro_steps length
- No validation for resolution_notes length
- No validation for environment/logs JSONB structure
- No validation for tags array format
- No validation for estimated_effort range

---

## 7.5 Behavioral Rules / Invariants

### Enforced by Code
- Title required (application level)
- Priority 1-4 (application level)
- Ticket type in valid list (application level)
- Status in valid list (application level)
- Soft delete (sets status to 'deleted', doesn't actually delete)
- Feedback appended with timestamp `services/ticketService.js:188-191`

### Not Enforced
- Title uniqueness
- Description length
- JSONB field structure validation

---

## 7.6 State Transitions (with file references)

### Ticket Creation
1. **Handler:** `handlers/game.js:6203-6290` (`createTicket`) or `handlers/game.js:6114-6199` (`createZorkTicket`)
2. **Validation:** All validations pass
3. **Database:** `database.js:createDebugTodo()` (line 6256 or 6148)
4. **Special:** Create trigger file for auto-processing (ZORK tickets only, lines 6170-6193)
5. **Response:** `{ type: 'ticketCreated'/'zorkTicketCreated', ticket/ticketId }` (lines 6280-6283, 6160-6163)

### Ticket Update
1. **Handler:** `handlers/game.js:6336-6415` (`updateTicket`)
2. **Validation:** All validations pass
3. **Database:** `database.js:updateDebugTodo()` (line 6374)
4. **Response:** `{ type: 'ticketUpdated', ticket: updatedTicket }` (lines 6400-6403)

### Ticket Feedback
1. **Handler:** `handlers/game.js:6417-6450` (`addTicketFeedback`)
2. **Validation:** Ticket ID and feedback required
3. **Database:** `database.js:getDebugTodo()`, `database.js:updateDebugTodo()`
4. **Append:** Feedback with timestamp to resolution_notes
5. **Response:** `{ type: 'ticketFeedbackAdded', ticket: updatedTicket }` (lines 6443-6446)

---

## 7.7 Interactions with Other Systems

### Auto-Ticket Processing
- Creates trigger files in `.tickets/` directory for auto-processing `handlers/game.js:6170-6193`
- Trigger file format: `{ ticketId, title, priority, ticketType }`

### Ticket Service Layer
- Provides normalized ticket operations `services/ticketService.js`
- Handles auto-refresh polling `services/ticketService.js:300-324`

### Ticket Model
- Normalizes field names `models/ticket.js:65-88`
- Validates ticket data `models/ticket.js:191-214`
- Provides display helpers (colors, labels, emojis) `models/ticket.js:221-245`

### Database Layer
- All operations go through `database.js` helpers

---

## 7.8 Failure States & Error Messages

### Errors Sent to Client
- "Not authenticated" - `handlers/game.js:6208, 6299, 6341, 6422`
- "God mode required to create tickets via editor" - `handlers/game.js:6214`
- "Ticket title is required" - `handlers/game.js:6231, 6127`
- "Priority must be between 1 (low) and 4 (critical)" - `handlers/game.js:6237`
- "Ticket type must be one of: ..." - `handlers/game.js:6239, 6139`
- "Status must be one of: ..." - `handlers/game.js:6251`
- "Ticket ID is required" - `handlers/game.js:6348, 6429`
- "Invalid status/priority/ticket type" - Multiple locations
- "Ticket not found" - `handlers/game.js:6435`
- "Failed to create/update ticket" - Multiple locations

---

## 7.9 Serialization Path

### Ticket List
- Sent as: `{ type: 'ticketsList', tickets: [...], count: N }` `handlers/game.js:6322-6326`
- Format: Raw database ticket objects

### Single Ticket
- Sent as: `{ type: 'ticketCreated'/'ticketUpdated'/'ticketFeedbackAdded', ticket: {...} }` Multiple locations
- Format: Normalized ticket object from database

### ZORK Ticket Created
- Sent as: `{ type: 'zorkTicketCreated', ticketId, message }` `handlers/game.js:6160-6163`

---

## 7.10 Known Gaps / Missing Features

- No hard delete endpoint (only soft delete)
- No validation for description/repro_steps length
- No validation for JSONB field structures
- No ticket assignment system
- No ticket comments/threading
- No ticket attachments
- No ticket search/filtering beyond basic status/priority
- No ticket export functionality

---

# 8. Common Editor Patterns

## 8.1 God Mode Verification

**Pattern:** All editor operations (except ticket viewing) require god mode verification.

**Implementation:**
```javascript
const player = await verifyGodMode(db, connectedPlayers, ws);
if (!player) {
  ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
  return;
}
```

**Location:** `utils/broadcast.js:verifyGodMode()` `utils/broadcast.js:558-566`

**Evidence:**
- `handlers/playerEditor.js:20-24` - getAllPlayers
- `handlers/mapEditor.js:28-32` - getMapEditorData
- `handlers/itemEditor.js:16-20` - getAllItems
- `handlers/npcEditor.js:17-21` - getAllNPCs
- `handlers/craftingEditor.js:17-21` - getFactoryRecipes
- `handlers/game.js:6213-6216` - createTicket (editor version)

---

## 8.2 Error Handling Pattern

**Pattern:** All editors use try/catch with error messages sent to client.

**Implementation:**
```javascript
try {
  // Operation
  ws.send(JSON.stringify({ type: 'success', data }));
} catch (err) {
  console.error('[Editor] Error:', err);
  ws.send(JSON.stringify({ type: 'error', message: 'Failed: ' + err.message }));
}
```

**Evidence:**
- `handlers/playerEditor.js:48-186` - updatePlayer
- `handlers/mapEditor.js:149-170` - createRoom
- `handlers/itemEditor.js:81-86` - createItem
- `handlers/npcEditor.js:61-103` - createNPC
- `handlers/craftingEditor.js:89-100` - createFactoryRecipe

---

## 8.3 WebSocket Message Protocol

**Pattern:** All editors use JSON WebSocket messages with `type` field.

**Request Format:**
```json
{
  "type": "operationName",
  "data": { ... }
}
```

**Response Format:**
```json
{
  "type": "operationResult",
  "data": { ... }
}
```

**Error Format:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

**Evidence:**
- `handlers/index.js:17-144` - Handler routing map
- All editor handlers use this pattern

---

## 8.4 Database Access Pattern

**Pattern:** All editors use `database.js` helper functions, never direct SQL (except deleteRoom).

**Evidence:**
- `handlers/playerEditor.js:64` - `db.updatePlayer()`
- `handlers/mapEditor.js:150` - `db.createRoom()`
- `handlers/itemEditor.js:82` - `db.createItem()`
- `handlers/npcEditor.js:62` - `db.createScriptableNPC()`
- `handlers/craftingEditor.js:90` - `db.createFactoryRecipe()`
- Exception: `handlers/mapEditor.js:219` - Direct SQL DELETE for deleteRoom

---

# 9. Summary of Strengths, Weaknesses, Risks

## Strengths
- Consistent god mode verification pattern
- Centralized database access through helpers
- Comprehensive error handling
- Real-time updates via WebSocket
- Special handling for room transport (harvest sessions, factory items, poofable items)
- Ticket system supports both god mode and user-created tickets

## Weaknesses
- Inconsistent validation (some fields validated, others not)
- Missing validations for many operations
- No audit logging of editor changes
- No undo/rollback mechanism
- Some operations use direct SQL instead of helpers (deleteRoom)
- Missing god mode checks in some operations (deleteRoom, getHarvestFormulaConfigs, updateHarvestFormulaConfig)
- No bulk operations
- Limited error recovery

## Risks
- Data corruption from missing validations
- Orphaned records from room deletion
- Inconsistent state from failed operations
- Security risk from missing god mode checks
- No way to track who made what changes
- No way to revert accidental changes

---

**End of Editor Systems Canonical Specification**

