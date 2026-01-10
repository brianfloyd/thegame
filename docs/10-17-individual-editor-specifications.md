# Game Editor System - Individual Editor Specifications

**Generated:** Based on codebase analysis of `public/gameeditors/` directory  
**Scope:** Detailed specifications for each individual editor  
**Last Updated:** Based on codebase analysis

**Related Canon:**
- `10-18-emoji-reference.md` - Canonical emoji usage standards for editor display labels

---

## Table of Contents

1. [Crafting Editor](#1-crafting-editor)
2. [Item Editor](#2-item-editor)
3. [Map Editor](#3-map-editor)
4. [NPC Editor](#4-npc-editor)
5. [Player Editor](#5-player-editor)
6. [Ticket Editor](#6-ticket-editor)
7. [Formula Editor](#7-formula-editor)

---

## 1. Crafting Editor

### 1.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/crafting-editor.html` (409 lines)
- `public/gameeditors/crafting-editor.js` (623 lines)

**Database Table:** `factory_recipes` (inferred from code)

**References:**
- `public/gameeditors/crafting-editor.html:1-409`
- `public/gameeditors/crafting-editor.js:1-623`

---

### 1.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    name: '',                    // Required
    description: '',
    active: true,
    factory_tier_required: 1,
    crafting_time_ms: 5000,
    success_rate: 70.0,
    return_rate_on_fail: 0.5,
    allow_rune_substitution: false,
    allow_wildcard_runes: false,
    required_ingredients: [],    // Array of { item_id, quantity }
    required_runes: [],          // Array of { type }
    output_items: [],            // Array of { item_id, quantity }
    byproducts: [],              // Array of { item_id, quantity, chance }
    required_stats: {}           // JSON object
}
```

**Filters:**
```javascript
filters: {
    search: '',
    tier: '',        // '1', '2', '3', or ''
    activeOnly: false
}
```

**References:**
- `public/gameeditors/crafting-editor.js:47-62` (formData)
- `public/gameeditors/crafting-editor.js:25-29` (filters)

---

### 1.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getFactoryRecipes` - Load all recipes
- `getAllItems` - Load items for dropdowns
- `createFactoryRecipe` - Create new recipe
- `updateFactoryRecipe` - Update existing recipe
- `deleteFactoryRecipe` - Delete recipe

**WebSocket Messages (Server → Client):**
- `factoryRecipes` - Recipe list response
- `factoryRecipeCreated` - Creation success
- `factoryRecipeUpdated` - Update success
- `factoryRecipeDeleted` - Deletion success
- `itemList` - Item list response
- `error` - Error response

**CRUD Operations:**
- `loadData()` - Loads recipes and items
- `createRecipe()` - Sets isCreating flag, resets form
- `saveRecipe()` - Validates and sends create/update message
- `deleteRecipe()` - Confirms and sends delete message
- `cloneRecipe()` - Creates copy with "(Copy)" suffix

**Ingredient/Output Management:**
- `addIngredient()` - Adds item to required_ingredients
- `removeIngredient(index)` - Removes ingredient
- `addOutput()` - Adds item to output_items
- `removeOutput(index)` - Removes output
- `addByproduct()` - Adds item to byproducts
- `removeByproduct(index)` - Removes byproduct
- `addRune()` - Adds rune to required_runes
- `removeRune(index)` - Removes rune

**References:**
- `public/gameeditors/crafting-editor.js:197-201` (loadData)
- `public/gameeditors/crafting-editor.js:326-398` (CRUD)
- `public/gameeditors/crafting-editor.js:404-503` (ingredient/output management)

---

### 1.4 Validations + Missing Validations

**Enforced:**
- Recipe name required (trimmed, non-empty)
- Required stats JSON validation (if provided as string)
- Item ID required for ingredients/outputs/byproducts

**Not Enforced:**
- Factory tier range validation (1-5)
- Success rate range validation (0-100)
- Crafting time minimum validation
- Duplicate ingredient/output detection

**References:**
- `public/gameeditors/crafting-editor.js:339-343` (name validation)
- `public/gameeditors/crafting-editor.js:345-358` (JSON validation)

---

### 1.5 Behavioral Rules / Invariants

**Always True:**
- `required_ingredients` must have `item_id` and `quantity`
- `output_items` must have `item_id` and `quantity`
- `byproducts` must have `item_id`, `quantity`, and `chance` (0-1)
- `required_runes` must have `type` (SPEED or EFFICIENCY)
- PRODUCTION rune is excluded from required_runes (machine requirement)

**Not Enforced:**
- No validation that item_id exists in items table
- No validation that factory_tier_required matches factory room tier

**References:**
- `public/gameeditors/crafting-editor.js:370-377` (save validation)
- `public/gameeditors/crafting-editor.js:208` (PRODUCTION exclusion note)

---

### 1.6 State Transitions

**Recipe Selection:**
- Click recipe in list → `selectRecipe()` → `populateForm()` → `updatePreview()`
- If items not loaded, waits for `itemList` message then re-populates

**Creation:**
- Click "+ New Recipe" → `createRecipe()` → `isCreating = true` → Form ready
- Save → `saveRecipe()` → `loading = true` → Server response → `isCreating = false`

**References:**
- `public/gameeditors/crafting-editor.js:236-246` (selectRecipe)
- `public/gameeditors/crafting-editor.js:326-330` (createRecipe)

---

### 1.7 Interactions with Other Systems

**Item System:**
- Loads all items via `getAllItems`
- Converts `item_name` to `item_id` when populating form
- Filters items by type for ingredient selection (ingredient/material only)

**Live Preview System:**
- Calculates success rate, crit chance, craft time with runes
- Uses test stats (ingenuity, resonance, acumen) for calculations
- Updates preview on form changes

**References:**
- `public/gameeditors/crafting-editor.js:178-184` (itemList handler)
- `public/gameeditors/crafting-editor.js:509-570` (updatePreview)

---

### 1.8 Failure States and Messages

**Error Messages:**
- `'Recipe name is required'` - Name validation
- `'Invalid JSON in Required Stats field'` - JSON parse error
- `'Please select an item'` - Missing item selection
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/gameeditors/crafting-editor.js:340-342` (name validation)
- `public/gameeditors/crafting-editor.js:351-352` (JSON validation)

---

### 1.9 Serialization Paths

**Form to Server:**
- `required_ingredients`: Array filtered to items with `item_id`
- `required_runes`: Array filtered to runes with `type`
- `output_items`: Array filtered to items with `item_id`
- `byproducts`: Array filtered to items with `item_id`, or `null` if empty
- `required_stats`: JSON object or `null` if empty

**Server to Form:**
- `required_ingredients`: May have `item_name` or `item_id`, converted to `item_id`
- `output_items`: Same conversion
- `byproducts`: Same conversion
- `required_runes`: Array of objects with `type`
- `required_stats`: JSON object

**References:**
- `public/gameeditors/crafting-editor.js:360-377` (save serialization)
- `public/gameeditors/crafting-editor.js:248-301` (form population)

---

### 1.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No recipe import/export
- No bulk operations
- No recipe templates
- No validation of item availability
- No preview of recipe costs

**References:**
- No implementation found

---

## 2. Item Editor

### 2.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/item-editor.html` (245 lines)
- `public/gameeditors/item-editor.js` (348 lines)

**Database Table:** `items` (confirmed from code)

**References:**
- `public/gameeditors/item-editor.html:1-245`
- `public/gameeditors/item-editor.js:1-348`

---

### 2.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    name: '',                    // Required
    description: '',
    item_type: 'sundries',       // Required
    active: true,
    poofable: false,
    encumbrance: 1,
    // Rune fields (only if item_type === 'rune')
    rune_type: '',
    rune_color: '#0000ff',
    // Deed fields (only if item_type === 'deed')
    deed_warehouse_location_key: '',
    deed_base_max_item_types: 1,
    deed_base_max_quantity_per_type: 100,
    deed_upgrade_tier: 1,
    deed_max_total_items: 100,
    deed_automation_enabled: false
}
```

**Item Types:**
- `sundries` (default) - ✅ Supported in frontend and backend
- `ingredient` - ✅ Supported in frontend and backend
- `rune` - ✅ Supported in frontend and backend
- `deed` - ✅ Supported in frontend and backend

**Note:** Backend validation was updated to match frontend model (all 4 types now supported). Previously backend only allowed 3 types, excluding 'sundries'.

**Filters:**
```javascript
filters: {
    search: '',
    type: 'all',        // 'all' or specific type
    activeOnly: false
}
```

**References:**
- `public/gameeditors/item-editor.js:43-60` (formData)
- `public/gameeditors/item-editor.js:36-40` (filters)
- `public/gameeditors/item-editor.js:8-20` (imports from item.js model)

---

### 2.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getAllItems` - Load all items
- `createItem` - Create new item
- `updateItem` - Update existing item
- `deleteItem` - Delete item (⚠️ Handler missing - frontend calls but no backend handler)

**WebSocket Messages (Server → Client):**
- `itemList` - Item list response
- `itemCreated` - Creation success
- `itemUpdated` - Update success
- `itemDeleted` - Deletion success
- `error` - Error response

**Note:** Backend handlers exist for merchant operations but are not exposed via Item Editor UI:
- `addItemToMerchant` - Add item to merchant room (handler exists in `handlers/itemEditor.js`, no UI)
- `getMerchantItems` - Get merchant items for an item (handler exists, no UI)
- `updateMerchantItem` - Update merchant item config (handler exists, no UI)
- `removeItemFromMerchant` - Remove item from merchant (handler exists, no UI)

**CRUD Operations:**
- `loadItems()` - Loads all items
- `createItem()` - Sets isCreating flag, resets form
- `saveItem()` - Validates and sends create/update message
- `deleteItem()` - Confirms and sends delete message

**Conditional Fields:**
- Rune fields shown only when `item_type === 'rune'`
- Deed fields shown only when `item_type === 'deed'`

**References:**
- `public/gameeditors/item-editor.js:174-177` (loadItems)
- `public/gameeditors/item-editor.js:257-313` (CRUD)
- `public/gameeditors/item-editor.js:156-173` (conditional sections)

---

### 2.4 Validations + Missing Validations

**Enforced:**
- Item name required (trimmed, non-empty)
- Item type required

**Not Enforced:**
- Rune type validation when item_type is 'rune'
- Deed field validation when item_type is 'deed'
- Encumbrance range validation
- Color format validation for rune_color

**References:**
- `public/gameeditors/item-editor.js:264-267` (name validation)

---

### 2.5 Behavioral Rules / Invariants

**Always True:**
- Rune fields only sent when `item_type === 'rune'`
- Deed fields only sent when `item_type === 'deed'`
- `active` defaults to `true`
- `poofable` defaults to `false`
- `encumbrance` defaults to `1`

**Not Enforced:**
- No validation that rune_type is valid when item_type is 'rune'
- No validation that deed fields are complete when item_type is 'deed'

**References:**
- `public/gameeditors/item-editor.js:278-292` (conditional field sending)

---

### 2.6 State Transitions

**Item Selection:**
- Click item in list → `selectItem()` → `populateForm()` → Form ready

**Creation:**
- Click "+ New Item" → `createItem()` → `isCreating = true` → Form ready
- Save → `saveItem()` → `loading = true` → Server response → `isCreating = false`

**References:**
- `public/gameeditors/item-editor.js:209-213` (selectItem)
- `public/gameeditors/item-editor.js:257-261` (createItem)

---

### 2.7 Interactions with Other Systems

**Item Model:**
- Uses `mapRowToItem` and `mapRowsToItems` from `/js/models/item.js`
- Uses `ITEM_TYPES`, `ITEM_TYPE_LABELS`, `RUNE_TYPES`, `RUNE_TYPE_LABELS` constants
- Uses `isRune()` and `isDeed()` helper functions

**References:**
- `public/gameeditors/item-editor.js:8-20` (imports)

---

### 2.8 Failure States and Messages

**Error Messages:**
- `'Item name is required'` - Name validation
- `'An error occurred'` - Generic server error
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/gameeditors/item-editor.js:264-267` (name validation)

---

### 2.9 Serialization Paths

**Form to Server:**
- Base fields always sent
- Rune fields sent only if `item_type === 'rune'`
- Deed fields sent only if `item_type === 'deed'`
- `encumbrance` parsed as integer

**Server to Form:**
- All fields mapped directly from database row
- Null values handled with defaults

**References:**
- `public/gameeditors/item-editor.js:269-304` (saveItem serialization)
- `public/gameeditors/item-editor.js:215-232` (populateForm)

---

### 2.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No item import/export
- No bulk operations
- No item templates
- No validation of item type constraints
- **No delete handler** - Frontend calls `deleteItem` but handler is missing in `handlers/itemEditor.js`
- **No UI to add items to merchants** - Backend handler `addItemToMerchant` exists but no UI in Item Editor or Map Editor
- **No merchant inventory management UI** - Cannot configure merchant items (price, buyable, sellable) from any editor

**References:**
- `public/gameeditors/item-editor.js:307-313` (deleteItem calls handler that doesn't exist)
- `handlers/itemEditor.js:179-220` (addItemToMerchant handler exists but unused)
- `handlers/mapEditor.js:1032-1076` (addItemToMerchantRoom handler exists but no UI calls it)

---

## 3. Map Editor

### 3.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/map-editor.html` (268 lines)
- `public/gameeditors/map-editor.js` (922 lines)

**Database Tables:** `maps`, `rooms` (inferred from code)

**References:**
- `public/gameeditors/map-editor.html:1-268`
- `public/gameeditors/map-editor.js:1-922`

---

### 3.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    name: '',                    // Required
    description: '',
    room_type: 'normal',
    factory_tier: 1,             // Only if room_type === 'factory'
    // Map connection fields
    connected_map_id: '',
    connected_room_x: '',
    connected_room_y: '',
    connection_direction: ''      // N, S, E, W, NE, NW, SE, SW
}
```

**New Map Form:**
```javascript
newMapForm: {
    name: '',                    // Required
    description: ''
}
```

**Canvas State:**
```javascript
zoom: 1.0,                       // 0.5 to 5.0
panX: 0,
panY: 0
```

**Editor Modes:**
- `'select'` - Select existing rooms
- `'create'` - Create new rooms

**Filters:**
```javascript
filters: {
    search: ''
}
```

**References:**
- `public/gameeditors/map-editor.js:71-81` (formData)
- `public/gameeditors/map-editor.js:84-87` (newMapForm)
- `public/gameeditors/map-editor.js:56-60` (canvas state)

---

### 3.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getAllMaps` - Load all maps
- `getMapData` - Load rooms for specific map
- `getAllNPCs` - Load NPCs (for placement)
- `getAllItems` - Load items (for room items)
- `createMap` - Create new map
- `createRoom` - Create new room
- `updateRoom` - Update existing room
- `deleteRoom` - Delete room

**WebSocket Messages (Server → Client):**
- `allMaps` - Map list response
- `mapData` - Room data response
- `mapEditorData` - Alternative room data response
- `roomCreated` - Creation success
- `roomUpdated` - Update success
- `roomDeleted` - Deletion success
- `mapCreated` - Map creation success
- `error` - Error response

**CRUD Operations:**
- `loadMaps()` - Loads all maps
- `selectMap(mapId)` - Loads rooms for map
- `createMap()` - Creates new map
- `createRoom()` - Creates new room at selected coordinates
- `saveRoom()` - Updates existing room
- `deleteRoom()` - Deletes room

**Canvas Operations:**
- `render()` - Renders map on canvas
- `initCanvas()` - Initializes canvas element
- `resizeCanvas()` - Resizes canvas to container
- `handleCanvasClick(e)` - Handles room selection/creation
- `handleCanvasWheel(e)` - Handles zoom
- `screenToMapCoords(x, y)` - Converts screen to map coordinates

**References:**
- `public/gameeditors/map-editor.js:353-358` (loadMaps)
- `public/gameeditors/map-editor.js:360-366` (selectMap)
- `public/gameeditors/map-editor.js:526-669` (canvas rendering)

---

### 3.4 Validations + Missing Validations

**Enforced:**
- Room name required for creation
- Map name required for creation

**Not Enforced:**
- Room coordinate uniqueness
- Map connection validation
- Factory tier validation when room_type is 'factory'
- Room type validation

**References:**
- `public/gameeditors/map-editor.js:430-433` (room name validation)
- `public/gameeditors/map-editor.js:478-481` (map name validation)

---

### 3.5 Behavioral Rules / Invariants

**Always True:**
- Canvas uses fixed 100x100 grid centered at (0,0)
- Rooms stored with x,y coordinates
- Grid center = (50, 50) in grid coordinates
- Map coordinates = grid coordinates - grid center
- Factory tier only sent when `room_type === 'factory'`

**Not Enforced:**
- No validation that connected_map_id exists
- No validation that connected_room coordinates exist
- No validation that room coordinates are within bounds

**References:**
- `public/gameeditors/map-editor.js:25-26` (GRID_SIZE, CELL_SIZE constants)
- `public/gameeditors/map-editor.js:545-558` (grid calculation)

---

### 3.6 State Transitions

**Map Selection:**
- Select map from dropdown → `selectMap(mapId)` → `loading = true` → Server response → Rooms loaded → Canvas rendered

**Room Creation:**
- Switch to 'create' mode → Click canvas → `selectRoomAt(x, y)` → `startCreateRoom(x, y)` → Form ready → Save → `createRoom()` → Server response → Room added to list

**Room Selection:**
- Click room in list or canvas → `selectRoom(room)` → `populateRoomForm(room)` → Form ready

**References:**
- `public/gameeditors/map-editor.js:360-366` (selectMap)
- `public/gameeditors/map-editor.js:390-396` (startCreateRoom)

---

### 3.7 Interactions with Other Systems

**Room Model:**
- Uses `mapRowToRoom`, `mapRowsToRooms` from `/js/models/room.js`
- Uses `ROOM_TYPES`, `ROOM_TYPE_LABELS`, `ROOM_TYPE_COLORS` constants

**Canvas Rendering:**
- Custom canvas-based rendering (not using standard HTML/CSS)
- Handles zoom, pan, grid lines, room rendering
- Keyboard shortcuts for navigation (arrow keys, numpad)

**Room Type Colors:**
- Loaded from database
- Editable via dialog
- Saved to localStorage

**References:**
- `public/gameeditors/map-editor.js:9-22` (imports)
- `public/gameeditors/map-editor.js:872-890` (room type colors)

---

### 3.8 Failure States and Messages

**Error Messages:**
- `'Room name is required'` - Room name validation
- `'Map name is required'` - Map name validation
- `'An error occurred'` - Generic server error
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/gameeditors/map-editor.js:430-433` (room validation)
- `public/gameeditors/map-editor.js:478-481` (map validation)

---

### 3.9 Serialization Paths

**Form to Server:**
- Room data sent with mapId, x, y coordinates
- Factory tier sent only if `room_type === 'factory'`
- Map connection fields sent as integers or null

**Server to Form:**
- Rooms include map_id, x, y, room_type, factory_tier
- Map connection fields may be null
- Room type colors loaded separately

**References:**
- `public/gameeditors/map-editor.js:436-444` (createRoom)
- `public/gameeditors/map-editor.js:447-464` (saveRoom)

---

### 3.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No room import/export
- No bulk room operations
- No room templates
- No validation of map connections
- No room item management in editor (handled separately)

**References:**
- No implementation found

---

## 4. NPC Editor

### 4.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/npc-editor.html` (626 lines)
- `public/gameeditors/npc-editor.js` (1045 lines)

**Database Table:** `scriptable_npcs` (confirmed from code)

**References:**
- `public/gameeditors/npc-editor.html:1-626`
- `public/gameeditors/npc-editor.js:1-1045`

---

### 4.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    name: '',                    // Required
    description: '',             // Required
    npc_type: 'neutral',
    base_cycle_time: 5000,
    difficulty: 1,
    harvestable_time: 60000,
    cooldown_time: 120000,
    required_stats: {},
    required_buffs: [],
    input_items: [],
    output_items: [],            // Array of { item_name, quantity, chance }
    output_distribution: 'ground', // 'ground' or 'player'
    harvest_prerequisite_items: [], // Array of { item_name }
    harvest_prerequisite_message: '',
    failure_states: [],
    display_color: '#00ff00',
    scriptable: true,
    active: true,
    pulse_echo_yield: 1,
    status_message_idle: '(idle)',
    status_message_ready: '(ready)',
    status_message_harvesting: '(harvesting)',
    status_message_cooldown: '(cooldown)'
}
```

**Lorekeeper Data (if npc_type === 'lorekeeper'):**
```javascript
lorekeeperData: {
    lore_type: 'dialogue',       // 'dialogue' or 'puzzle'
    engagement_enabled: true,
    engagement_delay: 3000,
    initial_message: '',
    initial_message_color: '#00ffff',
    keywords_responses: {},       // JSON object (used for both dialogue and puzzle types)
    keyword_color: '#ff00ff',
    incorrect_response: 'I do not understand what you mean.',
    puzzle_mode: null,            // 'word', 'combination', 'cipher'
    puzzle_solution: '',
    puzzle_success_message: '',
    puzzle_failure_message: 'That is not the answer I seek.',
    puzzle_reward_item: null,
    puzzle_award_once_only: false,
    puzzle_award_after_delay: false,
    puzzle_award_delay_seconds: null,
    puzzle_award_delay_response: null
}
```

**Merchant Data (if npc_type === 'merchant'):**
```javascript
merchantData: {
    engagement_enabled: true,
    engagement_delay: 3000,
    initial_message: '',
    initial_message_color: '#00ffff',
    keywords_responses: {},       // JSON object for keyword:response dialogue
    keyword_color: '#ff00ff',
    incorrect_response: 'I do not understand what you mean.'
}
```

**Note:** Merchant NPCs are dialogue-only NPCs. They are not harvestable and do not have timing or output configurations. Merchant inventory is managed separately in the Merchant Editor and is room-based, not NPC-based.

**Tabs:**
- `'basic'` - Basic information and display
- `'timing'` - Timing configuration and status messages (hidden for lorekeeper and merchant types)
- `'output'` - Output items and harvest prerequisites (hidden for lorekeeper and merchant types)
- `'lorekeeper'` - Lorekeeper-specific configuration (only for lorekeeper type)
- `'merchant'` - Merchant-specific configuration (only for merchant type)
- `'history'` - Lorekeeper history (greetings, item awards, only for lorekeeper type)

**Filters:**
```javascript
filters: {
    search: '',
    type: 'all',                  // 'all', 'scriptable', 'lorekeeper'
    harvestableOnly: false
}
```

**References:**
- `public/gameeditors/npc-editor.js:62-85` (formData)
- `public/gameeditors/npc-editor.js:117-136` (lorekeeperData)
- `public/gameeditors/npc-editor.js:95` (activeTab)

---

### 4.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getAllNPCs` - Load all NPCs
- `getAllItems` - Load items for dropdowns
- `getNpcPlacements` - Load room placements for NPC
- `getNpcPlacementMaps` - Load maps for placement
- `getNpcPlacementRooms` - Load rooms for map
- `getLoreKeeperHistory` - Load lorekeeper history
- `createNPC` - Create new NPC
- `updateNPC` - Update existing NPC
- `deleteNPC` - Delete NPC
- `addNpcToRoom` - Add NPC to room
- `removeNpcFromRoom` - Remove NPC from room
- `clearLoreKeeperHistory` - Clear lorekeeper history

**WebSocket Messages (Server → Client):**
- `npcList` - NPC list response
- `itemList` - Item list response
- `npcCreated` - Creation success
- `npcUpdated` - Update success
- `npcDeleted` - Deletion success
- `loreKeeperHistory` - History response
- `error` - Error response

**CRUD Operations:**
- `loadNpcs()` - Loads all NPCs and items
- `createNpc()` - Sets isCreating flag, resets form
- `saveNpc()` - Validates and sends create/update message
- `deleteNpc()` - Confirms and sends delete message

**Output Item Management:**
- `addOutputItem()` - Adds item to output_items
- `removeOutputItem(index)` - Removes output item
- `addHarvestPrerequisite()` - Adds item to harvest_prerequisite_items
- `removeHarvestPrerequisite(index)` - Removes prerequisite

**Lorekeeper Operations:**
- `loadLoreKeeperHistory(npcId)` - Loads history
- `clearLoreKeeperHistory(clearGreetings, clearItemAwards)` - Clears history

**Merchant Operations:**
- Merchant NPCs use the same keyword:response dialogue system as lorekeepers
- Merchant inventory is managed in the Merchant Editor (room-based, not NPC-based)
- Merchant NPCs are not harvestable and do not have timing or output configurations

**References:**
- `public/gameeditors/npc-editor.js:289-293` (loadNpcs)
- `public/gameeditors/npc-editor.js:612-731` (CRUD)
- `public/gameeditors/npc-editor.js:745-816` (output management)

---

### 4.4 Validations + Missing Validations

**Enforced:**
- NPC name required (trimmed, non-empty)
- NPC description required (trimmed, non-empty)
- Output item name required
- Harvest prerequisite item name required

**Not Enforced:**
- NPC type validation
- Timing values range validation
- Output item quantity/chance validation
- Lorekeeper puzzle solution validation
- JSON field validation (keywords_responses)

**References:**
- `public/gameeditors/npc-editor.js:619-626` (name/description validation)

---

### 4.5 Behavioral Rules / Invariants

**Always True:**
- `output_items` stored as object `{"Item Name": quantity}` in database, displayed as array
- `harvest_prerequisite_items` stored as JSON array in database
- Lorekeeper data only sent when `npc_type === 'lorekeeper'`
- Merchant data only sent when `npc_type === 'merchant'`
- Timing tab hidden for lorekeeper and merchant types (merchants are not harvestable)
- Output tab hidden for lorekeeper and merchant types (merchants are not harvestable)
- Lorekeeper tab only shown for lorekeeper type
- Merchant tab only shown for merchant type
- History tab only shown for lorekeeper type

**Not Enforced:**
- No validation that output item names exist in items table
- No validation that harvest prerequisite items exist
- No validation that lorekeeper puzzle solution matches puzzle mode

**References:**
- `public/gameeditors/npc-editor.js:628-640` (output_items conversion)
- `public/gameeditors/npc-editor.js:674-714` (lorekeeper data)

---

### 4.6 State Transitions

**NPC Selection:**
- Click NPC in list → `selectNpc()` → `loadPlacements()` → `loadLoreKeeperHistory()` (if lorekeeper) → `populateForm()` → `activeTab = 'basic'`

**Tab Switching:**
- Click tab → `activeTab = '{tabName}'` → Tab content shown/hidden based on NPC type

**Lorekeeper Data:**
- When selecting lorekeeper NPC → `populateForm()` → `lorekeeperData` populated from `npc.lorekeeper` object
- When selecting non-lorekeeper NPC → `lorekeeperData` reset to defaults

**Merchant Data:**
- When selecting merchant NPC → `populateForm()` → `merchantData` populated from `npc.merchant` object
- When selecting non-merchant NPC → `merchantData` reset to defaults
- Merchant NPCs automatically switch to 'merchant' tab when selected

**References:**
- `public/gameeditors/npc-editor.js:335-360` (selectNpc)
- `public/gameeditors/npc-editor.js:362-579` (populateForm)

---

### 4.7 Interactions with Other Systems

**NPC Model:**
- Uses `mapRowToNpc`, `mapRowsToNpcs` from `/js/models/npc.js`
- Uses `NPC_TYPES`, `NPC_TYPE_LABELS` constants
- Normalizes `output_items` from object to array format

**Item System:**
- Loads all items for dropdowns
- Uses item names (not IDs) for output_items and harvest_prerequisite_items

**Room Placement System:**
- Manages NPC placement in rooms via separate handlers
- Loads maps and rooms for placement selection

**Lorekeeper System:**
- Manages lorekeeper-specific data (dialogue, puzzles)
- Tracks player greetings and item awards
- Uses keywords_responses for both dialogue responses and puzzle clues

**Merchant System:**
- Manages merchant-specific dialogue (greetings, keyword:response system)
- Merchant NPCs provide narrative shopkeeper presence in merchant rooms
- Merchant inventory is managed separately in Merchant Editor (room-based)
- Merchant NPCs are not harvestable and do not participate in harvest cycles

**References:**
- `public/gameeditors/npc-editor.js:7-18` (imports)
- `public/gameeditors/npc-editor.js:864-996` (room placement)
- `public/gameeditors/npc-editor.js:1002-1021` (lorekeeper history)

---

### 4.8 Failure States and Messages

**Error Messages:**
- `'NPC name is required'` - Name validation
- `'NPC description is required'` - Description validation
- `'Please select an item'` - Missing item selection
- `'An error occurred'` - Generic server error
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/gameeditors/npc-editor.js:619-626` (validation)

---

### 4.9 Serialization Paths

**Form to Server:**
- `output_items`: Converted from array to object format `{"Item Name": quantity}` (not used for merchant type)
- `harvest_prerequisite_items`: Converted to JSON string (not used for merchant type)
- `lorekeeper`: Sent as object with all lorekeeper fields (only if `npc_type === 'lorekeeper'`)
- `merchant`: Sent as object with all merchant fields (only if `npc_type === 'merchant'`)
- `keywords_responses`: Sent as JSON string (used for both dialogue responses and puzzle clues)

**Server to Form:**
- `output_items`: Normalized from object to array by `mapRowToNpc` (not used for merchant type)
- `harvest_prerequisite_items`: Parsed from JSON string to array (not used for merchant type)
- `lorekeeper`: Loaded as object from database (only for lorekeeper type)
- `merchant`: Loaded as object from database (only for merchant type)
- `keywords_responses`: Loaded as JSONB object from database (used for both dialogue and puzzle types)

**References:**
- `public/gameeditors/npc-editor.js:628-640` (output_items conversion)
- `public/gameeditors/npc-editor.js:680-683` (keywords_responses conversion)
- `public/gameeditors/npc-editor.js:362-579` (form population)

---

### 4.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No NPC import/export
- No bulk operations
- No NPC templates
- No validation of output item names
- No JSON validation for lorekeeper fields

**References:**
- No implementation found

---

## 5. Player Editor

### 5.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/player-editor.html` (357 lines)
- `public/gameeditors/player-editor.js` (433 lines)

**Database Table:** `players` (confirmed from code)

**References:**
- `public/gameeditors/player-editor.html:1-357`
- `public/gameeditors/player-editor.js:1-433`

---

### 5.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    name: '',                    // Read-only
    // Stats (stat_*)
    stat_ingenuity: 5,
    stat_resonance: 5,
    stat_fortitude: 5,
    stat_acumen: 5,
    // Abilities (ability_*)
    ability_crafting: 0,
    ability_attunement: 0,
    ability_endurance: 0,
    ability_commerce: 0,
    // Resources (resource_*)
    resource_vitalis: 50,
    resource_max_vitalis: 100,
    resource_max_encumbrance: 100,
    // Points
    assignable_points: 5,
    // Flags (flag_*)
    flag_god_mode: 0,
    flag_always_first_time: 0,
    // Pulse
    pulse_echoes: 0,
    pulse_echo_tier: 1,
    // Attunement
    base_attunement_points: 10,
    base_attunement_cooldown_ms: 10000,
    base_attunement_delay_ms: 2000,
    // UI Settings
    auto_navigation_time_ms: 1000,
    loop_delay_ms: 1000,
    room_update_interval_ms: 30000
}
```

**Inventory Data:**
```javascript
inventoryData: {
    inventory: [],               // Array of { item_name, quantity }
    currentEncumbrance: 0
}
```

**New Inventory Item:**
```javascript
newInventoryItem: {
    itemName: '',
    quantity: 1
}
```

**Tabs:**
- `'stats'` - Player stats and assignable points
- `'abilities'` - Player abilities
- `'resources'` - Vitalis, pulse echoes, attunement, inventory
- `'settings'` - Flags and timing settings

**Filters:**
```javascript
filters: {
    search: '',
    godModeOnly: false
}
```

**References:**
- `public/gameeditors/player-editor.js:40-72` (formData)
- `public/gameeditors/player-editor.js:78-81` (inventoryData)
- `public/gameeditors/player-editor.js:84-87` (newInventoryItem)

---

### 5.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getAllPlayers` - Load all players
- `getAllItems` - Load items for inventory dropdown
- `getPlayerInventory` - Load player inventory
- `updatePlayer` - Update player stats/abilities/resources
- `addPlayerInventoryItem` - Add item to inventory
- `removePlayerInventoryItem` - Remove item from inventory

**WebSocket Messages (Server → Client):**
- `playerList` - Player list response
- `itemList` - Item list response
- `playerData` - Player data response
- `playerInventory` - Inventory response
- `playerInventoryUpdated` - Inventory update success
- `playerUpdated` - Player update success
- `error` - Error response

**CRUD Operations:**
- `loadPlayers()` - Loads all players
- `selectPlayer(player)` - Selects player, loads inventory
- `savePlayer()` - Updates player (no create/delete)

**Inventory Operations:**
- `loadInventory(playerId)` - Loads player inventory
- `addInventoryItem()` - Adds item to inventory
- `removeInventoryItem(itemName, quantity)` - Removes item from inventory

**References:**
- `public/gameeditors/player-editor.js:216-219` (loadPlayers)
- `public/gameeditors/player-editor.js:246-301` (selection and inventory)

---

### 5.4 Validations + Missing Validations

**Enforced:**
- Player must be selected before saving
- Item name and quantity required for adding inventory item
- Quantity required and must be >= 1 for removing inventory item

**Not Enforced:**
- Stat/ability/resource range validation
- Assignable points validation
- Inventory encumbrance validation
- Item name existence validation

**References:**
- `public/gameeditors/player-editor.js:371-372` (player selection)
- `public/gameeditors/player-editor.js:267-271` (add inventory validation)

---

### 5.5 Behavioral Rules / Invariants

**Always True:**
- Players cannot be created or deleted (read-only list)
- Only one player can be selected at a time
- Inventory loaded automatically when player selected
- All numeric fields parsed as integers on save

**Not Enforced:**
- No validation that inventory items exist
- No validation that encumbrance doesn't exceed max
- No validation that vitalis doesn't exceed max

**References:**
- `public/gameeditors/player-editor.js:246-250` (selectPlayer)
- `public/gameeditors/player-editor.js:371-402` (savePlayer)

---

### 5.6 State Transitions

**Player Selection:**
- Click player in list → `selectPlayer()` → `populateForm()` → `loadInventory()` → Form ready

**Inventory Management:**
- Add item → `addInventoryItem()` → `loading = true` → Server response → Inventory updated
- Remove item → `removeInventoryItem()` → `loading = true` → Server response → Inventory updated

**References:**
- `public/gameeditors/player-editor.js:246-250` (selectPlayer)
- `public/gameeditors/player-editor.js:267-301` (inventory operations)

---

### 5.7 Interactions with Other Systems

**Player Model:**
- Uses `mapRowToPlayer`, `mapRowsToPlayers` from `/js/models/player.js`
- Uses `PLAYER_STATS`, `PLAYER_ABILITIES`, `STAT_LABELS`, `ABILITY_LABELS` constants

**Item System:**
- Loads all items for inventory dropdown
- Uses item names (not IDs) for inventory

**Markup System:**
- Uses `parseMarkup` from `/js/utils/Markup.js` for player name display

**References:**
- `public/gameeditors/player-editor.js:7-19` (imports)
- `public/gameeditors/player-editor.js:416-420` (formatPlayerName)

---

### 5.8 Failure States and Messages

**Error Messages:**
- `'Please select an item and enter a quantity'` - Add inventory validation
- `'Please enter a valid quantity'` - Remove inventory validation
- `'An error occurred'` - Generic server error
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/gameeditors/player-editor.js:268-271` (add inventory validation)
- `public/gameeditors/player-editor.js:288-292` (remove inventory validation)

---

### 5.9 Serialization Paths

**Form to Server:**
- All numeric fields parsed as integers
- Updates sent as object with only changed fields (or all fields)

**Server to Form:**
- All fields mapped directly from database row
- Inventory loaded separately via `getPlayerInventory`

**References:**
- `public/gameeditors/player-editor.js:371-402` (savePlayer)
- `public/gameeditors/player-editor.js:303-337` (populateForm)

---

### 5.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No player creation/deletion
- No bulk operations
- No player templates
- No validation of stat/ability ranges
- No inventory encumbrance validation

**References:**
- No implementation found

---

## 6. Ticket Editor

### 6.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/ticket-editor.html` (280 lines)
- `public/gameeditors/ticket-editor.js` (487 lines)

**Database Table:** `tickets` (inferred from code)

**References:**
- `public/gameeditors/ticket-editor.html:1-280`
- `public/gameeditors/ticket-editor.js:1-487`

---

### 6.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    title: '',                   // Required, max 200 chars
    description: '',
    ticket_type: 'bug',          // 'bug', 'feature', 'debug' (matches database constraint)
    status: 'open',              // 'open', 'backlog', 'in_progress', 'resolved', 'deleted'
    priority: 2,                 // 1 (low), 2 (medium), 3 (high), 4 (critical)
    repro_steps: '',
    resolution_notes: '',
    tags: []                     // Array of strings
}
```

**Filters:**
```javascript
filters: {
    status: 'all',               // 'all', 'open', 'backlog', 'in_progress', 'resolved'
    priority: '',                // '', '1', '2', '3', '4'
    ticketType: '',              // '', 'bug', 'feature', 'debug' (matches database constraint)
    search: ''
}
```

**Auto-Refresh:**
```javascript
autoRefresh: true,
refreshIntervalMs: 5000
```

**References:**
- `public/gameeditors/ticket-editor.js:43-52` (formData)
- `public/gameeditors/ticket-editor.js:35-40` (filters)
- `public/gameeditors/ticket-editor.js:30-32` (auto-refresh)

---

### 6.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getTickets` - Load tickets (with filters)
- `createTicket` - Create new ticket
- `updateTicket` - Update existing ticket

**WebSocket Messages (Server → Client):**
- `ticketsList` - Ticket list response
- `ticketCreated` - Creation success
- `ticketUpdated` - Update success
- `ticketDeleted` - Deletion success (via update with status='deleted')
- `error` - Error response

**CRUD Operations:**
- `loadTickets()` - Loads all tickets
- `createTicket()` - Sets isCreating flag, resets form
- `saveTicket()` - Validates and sends create/update message
- `deleteTicket()` - Updates ticket status to 'deleted'
- `cloneTicket()` - Creates copy with "[Clone]" prefix

**Tag Management:**
- `addTag(event)` - Adds tag on Enter or comma
- `removeTag(index)` - Removes tag

**Auto-Refresh:**
- `toggleAutoRefresh()` - Toggles auto-refresh
- `startAutoRefresh()` - Starts interval (5 seconds)
- `stopAutoRefresh()` - Stops interval

**Filter Persistence:**
- `saveFilters()` - Saves filters to localStorage
- `restoreFilters()` - Restores filters from localStorage

**References:**
- `public/gameeditors/ticket-editor.js:162-171` (loadTickets)
- `public/gameeditors/ticket-editor.js:261-321` (CRUD)
- `public/gameeditors/ticket-editor.js:363-379` (tag management)
- `public/gameeditors/ticket-editor.js:384-414` (auto-refresh)

---

### 6.4 Validations + Missing Validations

**Enforced:**
- Ticket title required (trimmed, non-empty)
- Title max length 200 characters (HTML maxlength attribute)

**Not Enforced:**
- Priority range validation (1-4)
- Status validation
- Ticket type validation
- Tag format validation

**References:**
- `public/gameeditors/ticket-editor.js:287-290` (title validation)
- `public/gameeditors/ticket-editor.html:144` (maxlength attribute)

---

### 6.5 Behavioral Rules / Invariants

**Always True:**
- Tickets sorted by priority (highest first), then by created_at (newest first)
- Auto-refresh runs every 5 seconds when enabled
- Filters persisted to localStorage
- Deletion sets status to 'deleted' (soft delete)

**Not Enforced:**
- No validation that created_by exists
- No validation that tags are unique
- No validation that resolution_notes required when status is 'resolved'

**References:**
- `public/gameeditors/ticket-editor.js:205-209` (sorting)
- `public/gameeditors/ticket-editor.js:326-339` (deleteTicket)

---

### 6.6 State Transitions

**Ticket Selection:**
- Click ticket in list → `selectTicket()` → `populateForm()` → Form ready

**Creation:**
- Click "+ New Ticket" → `createTicket()` → `isCreating = true` → Form ready
- Save → `saveTicket()` → `loading = true` → Server response → `isCreating = false` → Ticket selected

**Auto-Refresh:**
- Toggle checkbox → `toggleAutoRefresh()` → Starts/stops interval
- Interval → `loadTickets()` (if not loading) → Updates list

**References:**
- `public/gameeditors/ticket-editor.js:220-224` (selectTicket)
- `public/gameeditors/ticket-editor.js:261-265` (createTicket)
- `public/gameeditors/ticket-editor.js:395-401` (auto-refresh interval)

---

### 6.7 Interactions with Other Systems

**Ticket Model:**
- Uses `mapRowToTicket`, `mapRowsToTickets` from `/js/models/ticket.js`
- Uses `TICKET_STATUSES`, `TICKET_TYPES`, `TICKET_PRIORITIES`, `PRIORITY_LABELS`, `STATUS_EMOJIS`, `TYPE_LABELS` constants
- **Valid Ticket Types:** `TICKET_TYPES = ['bug', 'feature', 'debug']` (matches database constraint in `debug_todos.ticket_type`)

**LocalStorage:**
- Filters saved to `ticketEditor_filters` key
- Persists across page reloads

**Database Schema:**
- `debug_todos.ticket_type` CHECK constraint: `IN ('bug', 'feature', 'debug')`
- See `20-04-database-schema-canonical-spec.md` section 5.5 for full schema

**References:**
- `public/gameeditors/ticket-editor.js:8-19` (imports)
- `public/gameeditors/ticket-editor.js:443-459` (filter persistence)
- `public/js/models/ticket.js` (TICKET_TYPES, TYPE_LABELS constants)
- `migrations/068_update_ticket_types.sql` (database constraint)

---

### 6.8 Failure States and Messages

**Error Messages:**
- `'Please fill in all required fields'` - Validation error
- `'An error occurred'` - Generic server error
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/gameeditors/ticket-editor.js:287-290` (validation)

---

### 6.9 Serialization Paths

**Form to Server:**
- `title`, `description`, `repro_steps`, `resolution_notes`: Trimmed strings or null if empty
- `priority`: Parsed as integer
- `tags`: Array of strings
- `created_by`: Set to 'god_mode' for new tickets

**Server to Form:**
- All fields mapped directly from database row
- `tags`: Parsed from JSON if string, or used as array

**References:**
- `public/gameeditors/ticket-editor.js:294-303` (saveTicket serialization)
- `public/gameeditors/ticket-editor.js:229-240` (populateForm)

---

### 6.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No ticket import/export
- No bulk operations
- No ticket templates
- No attachment support
- No comment system
- No assignment system
- No due dates

**References:**
- No implementation found

---

## 7. Formula Editor

### 7.1 Schema / Source of Truth

**Files:**
- `public/gameeditors/formula-editor.html` (259 lines)
- `public/formula-editor.js` (351 lines)

**Database Table:** `harvest_formula_config` (confirmed from code)

**References:**
- `public/gameeditors/formula-editor.html:1-259`
- `public/formula-editor.js:1-351`
- `handlers/formulaEditor.js:1-72`

---

### 7.2 All Fields, Defaults, Nullability, Constraints

**Form Data Structure:**
```javascript
formData: {
    config_key: '',                // Read-only, unique identifier
    description: '',               // Editable description
    min_resonance: 5,              // Stat value for minimum effect (integer)
    min_value: 0.05,               // Minimum formula output (numeric)
    max_resonance: 100,            // Stat value for maximum effect (integer)
    max_value: 1.0,                // Maximum formula output (numeric)
    curve_exponent: 2.0            // Exponential curve shape (0.1-10, numeric)
}
```

**Simulation Data:**
```javascript
simulation: {
    statValue: 50,                 // Test stat value for simulation
    result: 0,                     // Calculated result for test stat
    levels: []                     // Array of { stat, result } for preview levels
}
```

**Filters:**
```javascript
filters: {
    search: '',                    // Search by config_key or description
    category: 'all'                // 'all', 'harvest', 'attunement', 'pulse_echo', 'factory', 'other'
}
```

**Formula Categories:**
- `harvest`: cycle_time_reduction, hit_rate, harvestable_time_increase, vitalis_drain_reduction, cooldown_time_reduction
- `attunement`: attunement_cooldown_reduction, attunement_restore_bonus, attunement_delay_reduction
- `pulse_echo`: pulse_echo_yield_multiplier, pulse_echo_resonance_bonus_rate, pulse_echo_tier_curve_multiplier, pulse_echo_base_cost, pulse_echo_minimum_required
- `factory`: factory_success_rate, factory_crit_chance
- `other`: room_update_interval_ms

**Formula Applications (Badge System):**
- Formulas display badges indicating where they are applied (Harvest, Attunement, Pulse Echo, Factory, NPC Cycle)
- Badge colors: blue (Harvest), cyan (Attunement), yellow (Pulse Echo), orange (Factory), green (NPC Cycle), gray (Other)

**References:**
- `public/formula-editor.js:74-83` (formData)
- `public/formula-editor.js:85-90` (simulation)
- `public/formula-editor.js:69-72` (filters)
- `public/formula-editor.js:9-54` (formula mappings and categories)

---

### 7.3 All Subsystem Operations

**WebSocket Messages (Client → Server):**
- `getAllFormulas` - Load all formula configurations

**WebSocket Messages (Server → Client):**
- `formulaList` - Formula list response
- `formulaUpdated` - Update success
- `error` - Error response

**CRUD Operations:**
- `loadFormulas()` - Loads all formulas from database
- `selectFormula(formula)` - Selects formula, populates form, updates simulation
- `saveFormula()` - Validates and sends update message (no create/delete - formulas are system-defined)
- `resetForm()` - Resets form to original selected formula values

**Simulation Operations:**
- `updateSimulation()` - Calculates result for current stat value and preview levels
- `calculateFormula(statValue, config)` - Core exponential curve calculation
  - Formula: `value = minValue + (maxValue - minValue) * ((stat - minStat) / (maxStat - minStat))^exponent`
  - Clamps stat to valid range
  - Returns calculated value

**Filtering:**
- `applyFilter()` - Filters by search term and category
- Search matches config_key or description (case-insensitive)
- Category filter uses predefined category mappings

**References:**
- `public/formula-editor.js:181-184` (loadFormulas)
- `public/formula-editor.js:215-278` (selection and CRUD)
- `public/formula-editor.js:284-323` (simulation)
- `public/formula-editor.js:190-209` (filtering)
- `handlers/formulaEditor.js:10-22` (getAllFormulas)
- `handlers/formulaEditor.js:27-66` (updateFormula)

---

### 7.4 Validations + Missing Validations

**Enforced:**
- Formula must be selected before saving
- `min_resonance` must be less than `max_resonance`
- `min_value` should not exceed `max_value` (warning, not error)
- All numeric fields parsed as appropriate types (integers for resonance, floats for values)

**Not Enforced:**
- Curve exponent range validation (0.1-10) - only HTML min/max attributes
- Stat value range validation (no maximum enforced)
- Formula value range validation (no min/max enforced)
- Description length validation

**References:**
- `public/formula-editor.js:246-260` (validation)

---

### 7.5 Behavioral Rules / Invariants

**Always True:**
- Formulas cannot be created or deleted (read-only list, update-only operations)
- `config_key` is immutable (read-only field)
- Simulation updates automatically when form values change (via `@input` handlers)
- Preview levels calculated at stat values: 5, 25, 50, 75, 100
- Formula calculation uses exponential curve: `normalized = (stat - minStat) / (maxStat - minStat)`, `curved = normalized^exponent`, `value = minValue + (maxValue - minValue) * curved`
- Badges displayed based on `FORMULA_APPLICATIONS` mapping
- Formula cache cleared on update to ensure immediate effect

**Not Enforced:**
- No validation that formula exists in database before update
- No validation that formula is actually used in game systems

**Special Handling:**
- `room_update_interval_ms` formula updates global NPC cycle engine interval when saved
- Formula cache cleared via `clearConfigCache()` after update

**References:**
- `public/formula-editor.js:302-323` (calculateFormula)
- `handlers/formulaEditor.js:37-57` (updateFormula with cache clearing)

---

### 7.6 State Transitions

**Formula Selection:**
- Click formula in list → `selectFormula()` → `populateForm()` → `updateSimulation()` → Form ready with simulation

**Formula Update:**
- Edit form fields → `updateSimulation()` called on `@input` → Simulation preview updates
- Click "Save Formula" → `saveFormula()` → `loading = true` → Server response → `formulaUpdated` → Formula list updated → `loading = false`

**Form Reset:**
- Click "Reset" → `resetForm()` → `populateForm()` → `updateSimulation()` → Form restored to original values

**References:**
- `public/formula-editor.js:215-239` (selection and reset)
- `public/formula-editor.js:245-278` (saveFormula)

---

### 7.7 Interactions with Other Systems

**Formula System:**
- Uses `harvest_formula_config` table (despite name, contains all formula types)
- Formulas used by: harvest system, attunement system, pulse echo system, factory system, NPC cycle engine
- Formula cache managed by `utils/harvestFormulas.js` - cleared on update

**Database Functions:**
- `getAllHarvestFormulaConfigs()` - Returns all formulas
- `updateHarvestFormulaConfig(configKey, updates)` - Updates formula parameters

**NPC Cycle Engine:**
- Special handling for `room_update_interval_ms` - updates global interval when saved
- Uses `setGlobalRoomUpdateInterval()` from `services/npcCycleEngine.js`

**Badge System:**
- Formulas display application badges based on `FORMULA_APPLICATIONS` mapping
- Badge colors defined in `BADGE_COLORS` constant
- Badges shown in both list view and detail view

**References:**
- `public/formula-editor.js:9-54` (formula mappings)
- `handlers/formulaEditor.js:14` (database call)
- `handlers/formulaEditor.js:52-56` (NPC cycle engine integration)

---

### 7.8 Failure States and Messages

**Error Messages:**
- `'No formula selected'` - Attempting to save without selection
- `'Min stat value must be less than max stat value'` - Validation error
- `'Min value should not exceed max value'` - Validation warning
- `'Failed to get formulas: ' + err.message` - Database error
- `'Failed to update formula: ' + err.message` - Update error
- `'Connection error: ' + error.message` - WebSocket error

**References:**
- `public/formula-editor.js:246-260` (validation errors)
- `handlers/formulaEditor.js:20, 64` (server errors)

---

### 7.9 Serialization Paths

**Form to Server:**
- `config_key`: Read-only, sent as identifier
- `description`: Trimmed string or empty string
- `min_resonance`: Parsed as integer
- `min_value`: Parsed as float
- `max_resonance`: Parsed as integer
- `max_value`: Parsed as float
- `curve_exponent`: Parsed as float

**Server to Form:**
- All numeric fields parsed with `parseFloat()` or defaults applied
- `description`: String or empty string
- `config_key`: Used as unique identifier

**Simulation Calculation:**
- Uses same exponential curve formula as server-side `calculateExponentialCurve()`
- Stat value clamped to `[min_resonance, max_resonance]` range
- Normalized to 0-1 range, then exponent applied
- Final value interpolated between min_value and max_value

**References:**
- `public/formula-editor.js:264-272` (saveFormula serialization)
- `public/formula-editor.js:221-231` (populateForm)
- `public/formula-editor.js:302-323` (calculateFormula)

---

### 7.10 Known Gaps, Missing Features, or TODOs

**Missing Features:**
- No formula creation (formulas are system-defined)
- No formula deletion (formulas are system-defined)
- No formula import/export
- No bulk operations
- No formula templates
- No validation that formula parameters are within reasonable ranges
- No formula history/versioning
- No formula testing in actual gameplay context
- No formula comparison (before/after values)

**Partial Implementations:**
- Simulation preview shows calculated values but doesn't test in actual game systems
- Badge system shows applications but doesn't validate formulas are actually used

**References:**
- No implementation found for missing features

---

## Summary of All Editors

### Common Patterns

**All editors share:**
- Two-pane layout (list + detail)
- Alpine.js for state management
- EditorBase for WebSocket management
- Shared CSS styling
- Standard CRUD operations
- Filtering and search
- Notification system

**Differences:**
- Map editor uses canvas for visualization
- NPC editor has tabs and lorekeeper-specific features
- Player editor is read-only (no create/delete)
- Ticket editor has auto-refresh and filter persistence
- Crafting editor has live preview and complex item management
- Formula editor is update-only (no create/delete), includes real-time simulation preview

**References:**
- All editor files follow similar patterns with editor-specific variations

---

## End of Document



