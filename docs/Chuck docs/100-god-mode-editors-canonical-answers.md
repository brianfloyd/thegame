# 20 Canonical Clarifying Questions — God Mode Editors
## Answers Based on Codebase Analysis

**Date:** Generated from codebase analysis  
**Method:** Exhaustive code search with file references and line numbers  
**Rule:** Only facts proven in code, no inference

---

## 1. Where is the authoritative code that toggles god-mode on/off for a player? (file + function)

**Answer:** God-mode is NOT toggled by a dedicated toggle function. It is set/updated through:

1. **Player Editor (God Mode Only):**
   - File: `protected/editors/player-editor.js`
   - Function: `updatePlayer()` (line 33-187)
   - Handler: `handlers/playerEditor.js:updatePlayer()` (line 33-187)
   - Field: `flag_god_mode` (set via editor UI)

2. **Direct Database Update:**
   - File: `database.js`
   - Function: `updatePlayer()` (line 408-460)
   - Field: `flag_god_mode` is in `allowedFields` array (line 412)
   - No dedicated toggle function exists

3. **Initial Setup:**
   - File: `scripts/zork-ai-agent.cjs`
   - Lines: 144-147 - Auto-enables god mode for ZORK player if not set
   - SQL: `UPDATE players SET flag_god_mode = 1 WHERE name = $1`

**Conclusion:** There is no "toggle" function. God-mode is set/unset by editing the `flag_god_mode` field (0 or 1) via the Player Editor or direct database update.

---

## 2. What EXACT permissions does god-mode currently grant?

**Answer:** Based on code analysis, god-mode grants:

### A. Editor Access (HTTP Routes)
- **File:** `routes/api.js`
- **Lines:** 520-545
- Routes protected by `checkGodMode` middleware:
  - `/map` - Map Editor
  - `/npc` - NPC Editor  
  - `/items` - Item Editor
  - `/crafting` - Crafting Editor
  - `/player` - Player Editor
  - `/tickets` - Ticket Editor
  - Editor assets (JS/CSS files)

### B. WebSocket Editor Handlers
All editor handlers verify god-mode via `verifyGodMode()`:

1. **Map Editor** (`handlers/mapEditor.js`):
   - `getMapEditorData` (line 25-76)
   - `createMap` (line 81-100)
   - `createRoom` (line 102-140)
   - `deleteRoom` (line 142-180)
   - `updateRoom` (line 182-250)
   - `getAllMaps` (line 252-280)
   - `connectMaps` (line 282-360)
   - `disconnectMap` (line 362-420)
   - `getAllRoomTypeColors` (line 422-450)
   - `setRoomTypeColor` (line 452-500)
   - `getJumpMaps` (line 562-577)
   - `getJumpRooms` (line 578-599)
   - `jumpToRoom` (line 602-756) - **Teleportation**
   - `getRoomItemsForEditor` (line 761-784)
   - `addItemToRoom` (line 789-830)
   - `removeItemFromRoom` (line 832-870)
   - `clearAllItemsFromRoom` (line 872-920)

2. **NPC Editor** (`handlers/npcEditor.js`):
   - `getAllNPCs` (line 14-36)
   - `createNPC` (line 41-104)
   - `updateNPC` (line 109-187)
   - `getNpcPlacements` (line 192-220)
   - `getNpcPlacementRooms` (line 222-256)
   - `addNpcToRoom` (line 258-307)
   - `removeNpcFromRoom` (line 309-402)
   - `updateNpcPlacement` (line 404-435)

3. **Item Editor** (`handlers/itemEditor.js`):
   - `getAllItems` (line 14-64)
   - `createItem` (line 66-87)
   - `updateItem` (line 92-120)
   - `getWarehouseRooms` (line 125-136)

4. **Crafting Editor** (`handlers/craftingEditor.js`):
   - `getAllRecipes` (line 14-40)
   - `createRecipe` (line 42-77)
   - `updateRecipe` (line 77-109)
   - `deleteRecipe` (line 109-141)

5. **Player Editor** (`handlers/playerEditor.js`):
   - `getAllPlayers` (line 17-28)
   - `updatePlayer` (line 33-187) - **Can modify stats, location, inventory**
   - `getPlayerInventory` (line 192-210)
   - `addPlayerInventoryItem` (line 215-271)
   - `removePlayerInventoryItem` (line 276-304)

6. **Game Commands:**
   - `restartServer` (`handlers/game.js:3477-3507`) - Restart server (port 3535 only)
   - `createTicket` (`handlers/game.js:6201-6227`) - Create tickets via editor

### C. Special Permissions
- **Teleportation:** `jumpToRoom()` bypasses pathfinding and room restrictions
- **Player Transportation:** `updatePlayer()` can change `current_room_id` to transport players
- **Stat Editing:** Can modify all player stats via Player Editor
- **Inventory Manipulation:** Can add/remove items from player inventory
- **Room/Map Creation:** Can create, edit, delete rooms and maps
- **NPC Management:** Can create, edit, place, and remove NPCs
- **Item Management:** Can create and edit items
- **Recipe Management:** Can create, edit, delete factory recipes

**Note:** God-mode does NOT bypass:
- Vitalis caps (enforced in `database.js:updatePlayer()` lines 418-436)
- Encumbrance checks in `addPlayerInventoryItem()` (lines 236-251)
- Movement cooldowns (no bypass found in `handlers/game.js:move()`)
- Attunement cooldowns (no bypass found in `handlers/game.js:attune()`)
- Harvest cooldowns (no bypass found in `handlers/game.js:harvest()`)

---

## 3. Is god-mode checked through a single centralized permission function or scattered conditionals?

**Answer:** **Centralized with scattered usage.**

### Centralized Function:
- **File:** `utils/broadcast.js`
- **Function:** `verifyGodMode(db, connectedPlayers, ws)` (lines 558-566)
- **Logic:**
  ```javascript
  async function verifyGodMode(db, connectedPlayers, ws) {
    const playerName = findPlayerNameByWs(connectedPlayers, ws);
    if (!playerName) return null;
    
    const player = await db.getPlayerByName(playerName);
    if (!player || player.flag_god_mode !== 1) return null;
    
    return player;
  }
  ```

### HTTP Middleware:
- **File:** `middleware/session.js`
- **Function:** `checkGodMode(req, res, next)` (lines 129-139)
- **Logic:**
  ```javascript
  if (req.player.flag_god_mode !== 1) {
    return res.status(403).send('God mode required. You do not have access to this page.');
  }
  ```

### Scattered Direct Checks:
1. **`handlers/mapEditor.js:jumpToRoom()`** (line 613):
   ```javascript
   if (!player || player.flag_god_mode !== 1) {
     ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
     return;
   }
   ```

2. **`handlers/game.js:restartServer()`** (line 3483):
   ```javascript
   const player = await verifyGodMode(db, connectedPlayers, ws);
   ```

3. **`handlers/game.js:createTicket()`** (line 6213):
   ```javascript
   if (!playerData.isGodMode) {
     ws.send(JSON.stringify({ type: 'error', message: 'God mode required to create tickets via editor' }));
   }
   ```

**Conclusion:** Most checks use `verifyGodMode()`, but some handlers check `player.flag_god_mode !== 1` directly. HTTP routes use `checkGodMode` middleware.

---

## 4. What fields in the players table represent god-mode?

**Answer:** 

### Primary Field:
- **`flag_god_mode`** (INTEGER, DEFAULT 0)
  - Location: `database.js:412` (in `updatePlayer` allowedFields)
  - Values: 0 = false, 1 = true
  - Check: `player.flag_god_mode !== 1` or `player.flag_god_mode === 1`

### Related Field (Not God-Mode, but Admin-Related):
- **`flag_always_first_time`** (INTEGER, DEFAULT 0)
  - Location: `database.js:378` (in player creation)
  - Purpose: Makes player always experience things for first time (factory default character)
  - Used in: `handlers/game.js:243-244`, `database.js:1254-1256`, `utils/broadcast.js:363`
  - **Note:** This is NOT god-mode, but a separate admin flag

**Conclusion:** Only `flag_god_mode` represents god-mode. `flag_always_first_time` is a separate admin flag.

---

## 5. Is god-mode state persisted across sessions or connection resets?

**Answer:** **YES - Persisted in database.**

- **Storage:** `players.flag_god_mode` column (INTEGER)
- **Persistence:** Database field persists across:
  - Session disconnections
  - Server restarts
  - Connection resets
  - Player logout/login

**Evidence:**
- `database.js:updatePlayer()` (line 408-460) updates `flag_god_mode` in database
- `utils/broadcast.js:verifyGodMode()` (line 562) queries database: `await db.getPlayerByName(playerName)`
- `middleware/session.js:checkGodMode()` (line 134) checks `req.player.flag_god_mode` from session (which loads from database)

**Conclusion:** God-mode is fully persistent. It is stored in the database and survives all disconnections and restarts.

---

## 6. Does god-mode bypass any validations in updatePlayer()?

**Answer:** **NO - God-mode does NOT bypass validations in `updatePlayer()`.**

### Validations That Are NOT Bypassed:

1. **Vitalis Cap Enforcement:**
   - **File:** `database.js:updatePlayer()` (lines 418-436)
   - **Logic:**
     ```javascript
     if (player.resource_vitalis !== undefined) {
       const maxVitalis = player.resource_max_vitalis !== undefined 
         ? player.resource_max_vitalis 
         : (currentPlayer.resource_max_vitalis || 1000);
       
       if (player.resource_vitalis > maxVitalis) {
         console.warn(`[updatePlayer] Attempted to set vitalis (${player.resource_vitalis}) above max (${maxVitalis}). Capping to max.`);
         player.resource_vitalis = maxVitalis;
       }
       if (player.resource_vitalis < 0) {
         player.resource_vitalis = 0;
       }
     }
     ```
   - **Conclusion:** Vitalis is ALWAYS capped at max, even for god-mode edits

2. **Allowed Fields Restriction:**
   - **File:** `database.js:updatePlayer()` (lines 409-416)
   - **Logic:** Only fields in `allowedFields` array can be updated
   - **Fields:** `stat_ingenuity`, `stat_resonance`, `stat_fortitude`, `stat_acumen`, `ability_*`, `resource_*`, `flag_god_mode`, `current_room_id`, etc.
   - **Conclusion:** Cannot update fields not in allowedFields list, even with god-mode

3. **Encumbrance Check in `addPlayerInventoryItem()`:**
   - **File:** `handlers/playerEditor.js:addPlayerInventoryItem()` (lines 236-251)
   - **Logic:** Checks encumbrance before adding items
   - **Conclusion:** Encumbrance is enforced even for god-mode inventory edits

**Conclusion:** God-mode does NOT bypass any validations in `updatePlayer()`. All caps, limits, and field restrictions apply.

---

## 7. Does god-mode bypass cooldowns for movement, attunement, harvest, or factory crafting?

**Answer:** **NO - God-mode does NOT bypass cooldowns.**

### Movement Cooldown:
- **File:** `handlers/game.js:move()` (lines 667-678)
- **Logic:**
  ```javascript
  if (playerData && playerData.nextMoveTime && now < playerData.nextMoveTime) {
    const remainingMs = playerData.nextMoveTime - now;
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `You're moving slowly due to your load... (${(remainingMs / 1000).toFixed(1)}s)` 
    }));
    return;
  }
  ```
- **No god-mode check found** - cooldown applies to all players

### Attunement Cooldown:
- **File:** `handlers/game.js:attune()` (lines 2549-2573)
- **Logic:**
  ```javascript
  if (player.last_attune_time && (now - player.last_attune_time) < effectiveCooldown) {
    const remainingMs = effectiveCooldown - (now - player.last_attune_time);
    // ... send cooldown message and return
    return;
  }
  ```
- **No god-mode check found** - cooldown applies to all players

### Harvest Cooldown:
- **File:** `handlers/game.js:harvest()` (lines 2132-2140)
- **Logic:**
  ```javascript
  if (npcState.cooldown_until && now < npcState.cooldown_until) {
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `This creature is not currently capable of harvest`
    }));
    return;
  }
  ```
- **No god-mode check found** - cooldown applies to all players

### Factory Crafting:
- **File:** `services/factoryCraftingEngine.js`
- **No cooldown system found** - factory crafting uses success rate and timing, not cooldowns

**Conclusion:** God-mode does NOT bypass any cooldowns. Movement, attunement, and harvest cooldowns apply to all players regardless of god-mode status.

---

## 8. Do god-mode players appear as NPCs or special markers in room serialization?

**Answer:** **NO - God-mode players appear as normal players in room serialization.**

### Room Serialization:
- **File:** `utils/broadcast.js:sendRoomUpdate()` (lines 432-463)
- **Logic:**
  ```javascript
  // Add real players first (sort alphabetically for consistent ordering)
  const sortedPlayers = [...playersInRoom].sort();
  sortedPlayers.forEach(playerName => {
    combinedEntities.push(playerName);
  });
  
  // Add NPCs second with state descriptions
  npcsInRoom.forEach(npc => {
    let npcDisplay = npc.name;
    // ... add state description
    combinedEntities.push(npcDisplay);
  });
  ```
- **Conclusion:** Players (including god-mode) are added to `combinedEntities` as player names only. No special markers or NPC designation.

### Character Selection UI:
- **File:** `public/index.html` (lines 432-449)
- **Logic:** God-mode players get a 4-quadrant button (GAME/MAP/NPC/ITEM) in character selection
- **Conclusion:** Special UI in character selection, but NOT in room serialization

**Conclusion:** God-mode players appear as normal players in room serialization. No special markers, NPC designation, or visual indicators in the "Also here:" list.

---

## 9. Does the NPC cycle engine treat god-mode players differently during harvest loops?

**Answer:** **NO - NPC cycle engine does NOT treat god-mode players differently.**

### NPC Cycle Engine:
- **File:** `services/npcCycleEngine.js`
- **No god-mode checks found** in NPC cycle logic
- Harvest sessions are tracked by `player.id`, not god-mode status

### Harvest Session:
- **File:** `handlers/game.js:harvest()` (lines 2152-2160)
- **Logic:** Caches player's `stat_resonance` and `stat_fortitude` for harvest session
- **No god-mode check** - all players treated the same

**Conclusion:** NPC cycle engine treats all players identically. God-mode players receive the same harvest mechanics, cycle times, cooldowns, and bonuses as regular players.

---

## 10. Does god-mode allow teleporting without pathfinding or room restrictions?

**Answer:** **YES - God-mode allows teleportation via `jumpToRoom()`.**

### Teleportation Function:
- **File:** `handlers/mapEditor.js:jumpToRoom()` (lines 602-756)
- **God-mode check:** Line 613 - `if (!player || player.flag_god_mode !== 1)`
- **Logic:**
  ```javascript
  // Update player's room in database
  await db.updatePlayerRoom(targetRoom.id, currentPlayerName);
  
  // Update connected player data
  jumpPlayerData.roomId = targetRoom.id;
  ```
- **Bypasses:**
  - No pathfinding check
  - No room connection validation
  - No exit validation
  - No encumbrance check for movement
  - Direct room ID assignment

### Alternative Teleportation:
- **File:** `handlers/playerEditor.js:updatePlayer()` (lines 67-170)
- **Logic:** Changing `current_room_id` in `updatePlayer()` also teleports players
- **God-mode required:** Line 36 - `verifyGodMode()` check

**Conclusion:** God-mode allows instant teleportation to any room via `jumpToRoom()` or `updatePlayer()` with `current_room_id`. No pathfinding, exit validation, or movement restrictions apply.

---

## 11. Does god-mode allow spawning of NPCs, items, rooms, or modifying room state?

**Answer:** **YES - God-mode allows all of these via editors.**

### NPC Spawning:
- **File:** `handlers/npcEditor.js:addNpcToRoom()` (lines 258-307)
- **God-mode check:** Line 276 - `verifyGodMode()`
- **Function:** Places NPCs in rooms

### Item Spawning:
- **File:** `handlers/mapEditor.js:addItemToRoom()` (lines 789-830)
- **God-mode check:** Line 792 - `verifyGodMode()`
- **Function:** Adds items to room ground

### Room Creation:
- **File:** `handlers/mapEditor.js:createRoom()` (lines 102-140)
- **God-mode check:** Line 114 - `verifyGodMode()`
- **Function:** Creates new rooms

### Room State Modification:
- **File:** `handlers/mapEditor.js:updateRoom()` (lines 182-250)
- **God-mode check:** Line 231 - `verifyGodMode()`
- **Function:** Modifies room name, description, type, connections, factory tier, quirks

**Conclusion:** God-mode allows full world editing: spawning NPCs, items, creating rooms, and modifying all room properties via editor handlers.

---

## 12. Do god-mode editors modify live DB state or in-memory session state?

**Answer:** **BOTH - Editors modify live database state, which affects in-memory session state.**

### Database Modifications:
All editor handlers call database functions that write to PostgreSQL:

1. **Map Editor:**
   - `db.createRoom()` - INSERT into rooms table
   - `db.updateRoom()` - UPDATE rooms table
   - `db.deleteRoom()` - DELETE from rooms table
   - `db.addRoomItem()` - INSERT/UPDATE room_items table

2. **NPC Editor:**
   - `db.createScriptableNPC()` - INSERT into scriptable_npcs table
   - `db.updateScriptableNPC()` - UPDATE scriptable_npcs table
   - `db.addNpcToRoom()` - INSERT into room_npcs table

3. **Item Editor:**
   - `db.createItem()` - INSERT into items table
   - `db.updateItem()` - UPDATE items table

4. **Player Editor:**
   - `db.updatePlayer()` - UPDATE players table
   - `db.addPlayerItem()` - INSERT/UPDATE player_items table

### Session State Updates:
After database changes, editors:
- Send WebSocket messages to update client UI
- Broadcast room updates to connected players
- Refresh stats widgets
- Update factory/warehouse widget state

**Conclusion:** Editors modify live database state (PostgreSQL). In-memory session state (connectedPlayers Map, widget state) is updated via WebSocket messages and room update broadcasts.

---

## 13. Is there any UI in the client (widgets, commands, editor windows) that exposes god-mode tools?

**Answer:** **YES - Multiple UI elements expose god-mode tools.**

### A. God Mode Widget:
- **File:** `public/js/widgets/widget_godmode.js`
- **Visibility:** Only visible when `playerState.isGod === true`
- **Location:** Widget system (`public/js/widgets/widget_registry.js:195`)

### B. Editor Windows (HTTP Routes):
- **File:** `routes/api.js` (lines 520-545)
- **Routes:**
  - `/map` - Map Editor HTML page
  - `/npc` - NPC Editor HTML page
  - `/items` - Item Editor HTML page
  - `/crafting` - Crafting Editor HTML page
  - `/player` - Player Editor HTML page
  - `/tickets` - Ticket Editor HTML page

### C. Character Selection UI:
- **File:** `public/index.html` (lines 432-449)
- **Feature:** God-mode players get 4-quadrant button (GAME/MAP/NPC/ITEM) for quick editor access

### D. Jump/Teleport Widget:
- **File:** `public/js/main.js` (lines 1114-1472)
- **Command:** `/jump` or `jump` command
- **God-mode check:** Line 465 - `if (!godMode) { return; }`
- **Function:** Opens widget to teleport to any room

### E. Jump Command:
- **File:** `public/client.js` (lines 2801-2809)
- **Command:** `/jump` or `jump`
- **God-mode check:** Line 2803 - `if (!godMode) { return; }`

**Conclusion:** God-mode tools are exposed via: God Mode Widget, Editor HTML pages, Jump/Teleport widget, and character selection UI.

---

## 14. Are god-mode commands namespaced consistently?

**Answer:** **PARTIALLY - Some commands are namespaced, but not consistently.**

### Namespaced Commands:
1. **`/jump`** - Teleport command
   - **File:** `public/client.js:2801`, `public/js/main.js:462`
   - **God-mode check:** Yes
   - **Namespace:** `/jump` prefix

### Editor Commands (Not Namespaced):
Editor access is via HTTP routes, not commands:
- `/map` - Map Editor
- `/npc` - NPC Editor
- `/items` - Item Editor
- `/crafting` - Crafting Editor
- `/player` - Player Editor
- `/tickets` - Ticket Editor

### WebSocket Message Types (Not Namespaced):
Editor handlers use message types like:
- `getMapEditorData`, `createMap`, `createRoom`, `deleteRoom`, `updateRoom`
- `getAllNPCs`, `createNPC`, `updateNPC`, `addNpcToRoom`
- `getAllItems`, `createItem`, `updateItem`
- `getAllRecipes`, `createRecipe`, `updateRecipe`
- `getAllPlayers`, `updatePlayer`, `addPlayerInventoryItem`

**Conclusion:** Only `/jump` command is namespaced. Editor access is via HTTP routes and WebSocket message types, which are not consistently namespaced with a prefix like `/gm` or `/edit`.

---

## 15. Does god-mode override encumbrance logic (movement delay)?

**Answer:** **NO - God-mode does NOT override encumbrance logic.**

### Movement Encumbrance Check:
- **File:** `handlers/game.js:move()` (lines 653-691)
- **Logic:**
  ```javascript
  // Check encumbrance level and apply movement restrictions
  const currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
  const maxEncumbrance = player.resource_max_encumbrance || 100;
  const encumbrancePercent = (currentEncumbrance / maxEncumbrance) * 100;
  
  // Stuck - can't move at all
  if (encumbrancePercent >= 100) {
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: "You are too heavy to move. Drop items to lower your encumbrance." 
    }));
    return;
  }
  
  // Determine movement delay based on encumbrance level
  let moveDelay = 0;
  if (encumbrancePercent >= 66.6) {
    moveDelay = 1200; // Heavy: 1.2s delay
  } else if (encumbrancePercent >= 33.3) {
    moveDelay = 700; // Medium: 0.7s delay
  }
  
  // Set next move time for this player
  if (moveDelay > 0 && playerData) {
    playerData.nextMoveTime = now + moveDelay;
  }
  ```
- **No god-mode check found** - encumbrance applies to all players

### Teleportation Bypass:
- **File:** `handlers/mapEditor.js:jumpToRoom()` (lines 602-756)
- **Note:** `jumpToRoom()` bypasses movement entirely (teleports), so encumbrance doesn't apply to teleportation, but this is because teleportation doesn't use the movement system, not because god-mode overrides encumbrance.

**Conclusion:** God-mode does NOT override encumbrance logic for normal movement. However, teleportation (`jumpToRoom()`) bypasses movement entirely, so encumbrance doesn't apply to teleports.

---

## 16. Does god-mode override factory quirks, crafting requirements, or success rate?

**Answer:** **NO - God-mode does NOT override factory quirks, crafting requirements, or success rate.**

### Factory Crafting:
- **File:** `handlers/game.js:factoryWidgetCraft()` (lines 1799-1853)
- **Logic:** Uses `factoryQuirks.getFactoryQuirk(currentRoom)` to get quirks
- **No god-mode check found** - quirks apply to all players

### Success Rate Calculation:
- **File:** `services/factoryCraftingEngine.js:calculateSuccessRate()` (lines 59-85)
- **Logic:** Calculates success rate based on recipe, player stats, and quirks
- **No god-mode check found** - success rate applies to all players

### Crafting Requirements:
- **File:** `services/factoryRecipeMatcher.js`
- **Logic:** Checks required ingredients, runes, and stats
- **No god-mode check found** - requirements apply to all players

**Conclusion:** God-mode does NOT override factory quirks, crafting requirements, or success rate calculations. All factory mechanics apply equally to god-mode and regular players.

---

## 17. Where are error messages or safety guards for non-god players located?

**Answer:** **Error messages are located in multiple places:**

### A. WebSocket Handlers:
1. **`utils/broadcast.js:verifyGodMode()`** (lines 558-566)
   - Returns `null` if player not found or not god-mode
   - Callers check return value and send error

2. **Editor Handlers Pattern:**
   ```javascript
   const player = await verifyGodMode(db, connectedPlayers, ws);
   if (!player) {
     ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
     return;
   }
   ```
   - Used in: `handlers/mapEditor.js`, `handlers/npcEditor.js`, `handlers/itemEditor.js`, `handlers/craftingEditor.js`, `handlers/playerEditor.js`

3. **Direct Checks:**
   - `handlers/mapEditor.js:jumpToRoom()` (line 613-615)
   - `handlers/game.js:restartServer()` (line 3483-3485)
   - `handlers/game.js:createTicket()` (line 6213-6215)

### B. HTTP Middleware:
- **File:** `middleware/session.js:checkGodMode()` (lines 129-139)
- **Error:** `res.status(403).send('God mode required. You do not have access to this page.')`

### C. Client-Side Checks:
- **File:** `public/js/main.js:normalizeCommand()` (lines 465-468)
  ```javascript
  if (!godMode) {
    terminal.addMessage('This command requires god mode.', 'error');
    return null;
  }
  ```
- **File:** `public/client.js:executeCommand()` (lines 2803-2806)
  ```javascript
  if (!godMode) {
    addToTerminal('This command requires god mode.', 'error');
    return;
  }
  ```

**Conclusion:** Error messages are located in: WebSocket handlers (via `verifyGodMode()`), HTTP middleware (`checkGodMode()`), and client-side command validation. All safely reject non-god players.

---

## 18. Does god-mode allow editing NPC state (stats, cycle timers, loot tables)?

**Answer:** **PARTIALLY - God-mode allows editing NPC definitions, but NOT live NPC state.**

### NPC Definition Editing:
- **File:** `handlers/npcEditor.js:updateNPC()` (lines 109-187)
- **God-mode check:** Line 112 - `verifyGodMode()`
- **Editable Fields:**
  - `name`, `description`, `npc_type`
  - `base_cycle_time`, `harvestable_time`, `cooldown_time`
  - `required_stats`, `required_buffs`
  - `input_items`, `output_items`, `output_distribution`
  - `failure_states`, `display_color`
  - Puzzle configuration
  - Lore keeper configuration

### Live NPC State (NOT Editable):
- **File:** `services/npcCycleEngine.js`
- **State stored in:** `room_npcs.state` (JSONB column)
- **Fields:** `harvest_active`, `harvest_start_time`, `cooldown_until`, `cycles`, `harvesting_player_id`, etc.
- **No editor found** for editing live NPC state

### Loot Tables:
- **Field:** `output_items` and `output_distribution` in NPC definition
- **Editable:** Yes, via NPC Editor
- **Location:** `handlers/npcEditor.js:updateNPC()`

**Conclusion:** God-mode allows editing NPC definitions (stats, cycle timers, loot tables) via NPC Editor, but does NOT provide a way to edit live NPC state (active harvest sessions, cooldowns, etc.).

---

## 19. Does god-mode allow room graph manipulation (creating exits, deleting exits, changing coordinates)?

**Answer:** **YES - God-mode allows full room graph manipulation via Map Editor.**

### Room Creation:
- **File:** `handlers/mapEditor.js:createRoom()` (lines 102-140)
- **God-mode check:** Line 114 - `verifyGodMode()`
- **Function:** Creates rooms with coordinates (x, y) and map_id

### Room Updates (Including Coordinates):
- **File:** `handlers/mapEditor.js:updateRoom()` (lines 182-250)
- **God-mode check:** Line 231 - `verifyGodMode()`
- **Editable Fields:** `name`, `description`, `room_type`, `factory_tier`, `factory_quirks`
- **Note:** Coordinates (x, y) are set during creation, not updated via `updateRoom()`

### Map Connections (Exits):
- **File:** `handlers/mapEditor.js:connectMaps()` (lines 282-360)
- **God-mode check:** Line 306 - `verifyGodMode()`
- **Function:** Creates map connections (exits) between rooms
- **Fields:** `connected_map_id`, `connected_room_x`, `connected_room_y`, `connection_direction`

### Disconnect Maps (Delete Exits):
- **File:** `handlers/mapEditor.js:disconnectMap()` (lines 362-420)
- **God-mode check:** Line 417 - `verifyGodMode()`
- **Function:** Removes map connections (deletes exits)

### Room Deletion:
- **File:** `handlers/mapEditor.js:deleteRoom()` (lines 142-180)
- **God-mode check:** Line 114 - `verifyGodMode()`
- **Function:** Deletes rooms from database

**Conclusion:** God-mode allows full room graph manipulation: creating rooms (with coordinates), updating room properties, creating/deleting map connections (exits), and deleting rooms.

---

## 20. Is there ANY authorization layer preventing normal players from invoking god commands by packet injection?

**Answer:** **YES - Authorization is enforced server-side via `verifyGodMode()` and database checks.**

### Server-Side Authorization:

1. **WebSocket Handlers:**
   - **File:** `utils/broadcast.js:verifyGodMode()` (lines 558-566)
   - **Logic:**
     ```javascript
     async function verifyGodMode(db, connectedPlayers, ws) {
       const playerName = findPlayerNameByWs(connectedPlayers, ws);
       if (!playerName) return null;
       
       const player = await db.getPlayerByName(playerName);
       if (!player || player.flag_god_mode !== 1) return null;
       
       return player;
     }
     ```
   - **Security:** Queries database for `flag_god_mode`, not trusting client data

2. **HTTP Routes:**
   - **File:** `middleware/session.js:checkGodMode()` (lines 129-139)
   - **Logic:** Checks `req.player.flag_god_mode !== 1` from session (loaded from database)
   - **Security:** Session data comes from database, not client

3. **Direct Checks:**
   - **File:** `handlers/mapEditor.js:jumpToRoom()` (line 613)
   - **Logic:** `if (!player || player.flag_god_mode !== 1)`
   - **Security:** Re-queries database for player, doesn't trust client

### Client-Side Checks (NOT Security):
- **File:** `public/js/main.js:normalizeCommand()` (line 465)
- **File:** `public/client.js:executeCommand()` (line 2803)
- **Note:** Client-side checks are for UX only, NOT security. Server always validates.

### Potential Vulnerability:
- **File:** `handlers/game.js:authenticateSession()` (lines 214-224)
- **DEV MODE:** Test bypass allows `data.playerName` to authenticate without session
- **Risk:** If test bypass is enabled, packet injection could potentially authenticate as any player
- **Mitigation:** Test bypass should only be enabled in development

**Conclusion:** Authorization is enforced server-side via database queries. Client-side checks are for UX only. All god-mode operations require `flag_god_mode = 1` in the database, preventing packet injection attacks. However, the DEV MODE test bypass in `authenticateSession()` could be a vulnerability if enabled in production.

---

## Summary

### Strengths:
1. **Centralized authorization** via `verifyGodMode()` and `checkGodMode()` middleware
2. **Database-backed** - god-mode state persisted and validated from database
3. **Comprehensive editor system** for world editing
4. **Server-side validation** prevents packet injection

### Weaknesses:
1. **No cooldown bypasses** - god-mode players still subject to movement/attunement/harvest cooldowns
2. **No encumbrance bypass** - god-mode players still subject to encumbrance restrictions
3. **No validation bypasses** - vitalis caps, field restrictions still apply
4. **Inconsistent command namespacing** - only `/jump` is namespaced
5. **DEV MODE test bypass** in `authenticateSession()` could be security risk

### Risks:
1. **Test bypass vulnerability** - `authenticateSession()` allows test authentication without session
2. **No live NPC state editing** - cannot modify active harvest sessions or cooldowns
3. **Teleportation bypasses movement** - but this is intentional, not a bug

---

**End of Answers**

