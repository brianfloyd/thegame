# 20 Canonical Scrub Questions — God Mode Editors
## Answers Based on Exhaustive Codebase Analysis

**Date:** Generated from codebase analysis  
**Method:** Exhaustive code search with file references and line numbers  
**Rule:** Only facts proven in code, no inference

---

## 1. Where in the codebase is the term "God Mode", "Editor Mode", or "Admin Editor" explicitly referenced?

**Answer:** Terms are referenced throughout the codebase:

### "God Mode" / "god mode" / "god-mode":
- **Primary term:** "god mode" (most common), "God Mode" (UI), "god-mode" (CSS classes)
- **Files with explicit references:**
  - `utils/broadcast.js:558` - `verifyGodMode()` function
  - `middleware/session.js:129` - `checkGodMode()` middleware
  - `handlers/game.js:19` - Import `verifyGodMode`
  - `handlers/mapEditor.js:13` - Import `verifyGodMode`
  - `handlers/npcEditor.js:9` - Import `verifyGodMode`
  - `handlers/itemEditor.js` - Uses `verifyGodMode`
  - `handlers/craftingEditor.js:9` - Import `verifyGodMode`
  - `handlers/playerEditor.js:9` - Import `verifyGodMode`
  - `public/client.js:5720` - `updateGodModeUI()` function
  - `public/index.html:433` - Character selection UI: `if (char.flag_god_mode)`
  - `public/js/widgets/widget_registry.js:185` - `playerState.isGod` parameter
  - `public/js/widgets/widget_shared.js:232` - `isGodMode()` function
  - `routes/api.js:17` - `checkGodMode` middleware parameter
  - `scripts/zork-ai-agent.cjs:807` - `speakerIsGod` variable
  - `docs/Chuck docs/20-god-mode-editors-canonical-answers.md` - Comprehensive documentation

### "Editor Mode" / "editor mode":
- **File:** `handlers/game.js:416` - `if (data.isEditor === true)` check
- **File:** `public/js/editorShared/EditorBase.js:78` - `isEditor: true` in authenticateSession

### "Admin Editor":
- **NOT FOUND** - No explicit "Admin Editor" term found in codebase

### "GM" / "gm":
- **NOT FOUND** - No "GM" abbreviation found for god mode

### "Overseer":
- **NOT FOUND** - No "Overseer" term found

**Conclusion:** "God Mode" is the primary term used throughout. "Editor Mode" exists as `isEditor` flag for editor connections. No "Admin Editor", "GM", or "Overseer" terms found.

---

## 2. Is there a permission model implemented that distinguishes normal players from god-mode users?

**Answer:** **YES - Permission model exists via database flag and verification functions.**

### Database Field:
- **Table:** `players`
- **Field:** `flag_god_mode` (INTEGER, DEFAULT 0)
- **Values:** 0 = normal player, 1 = god-mode user
- **Location:** `database.js:412` (in `updatePlayer` allowedFields)

### Permission Check Functions:

1. **WebSocket Verification:**
   - **File:** `utils/broadcast.js:558-566`
   - **Function:** `verifyGodMode(db, connectedPlayers, ws)`
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

2. **HTTP Middleware:**
   - **File:** `middleware/session.js:129-139`
   - **Function:** `checkGodMode(req, res, next)`
   - **Logic:**
     ```javascript
     if (req.player.flag_god_mode !== 1) {
       return res.status(403).send('God mode required. You do not have access to this page.');
     }
     ```

3. **Client-Side Flag:**
   - **File:** `public/client.js:5720-5742`
   - **Function:** `updateGodModeUI(hasGodMode)`
   - **Variable:** `godMode` (boolean)
   - **State:** `window.gameState.isGod` (boolean)

**Conclusion:** Permission model uses `flag_god_mode` database field with centralized verification functions (`verifyGodMode()`, `checkGodMode()`). Client-side maintains `godMode` boolean flag.

---

## 3. How does a player enter God Mode?

**Answer:** **NOT FOUND - No explicit "enter" command or function exists.**

### Methods to Enable God Mode:

1. **Player Editor (God Mode Only):**
   - **File:** `protected/editors/player-editor.js`
   - **Handler:** `handlers/playerEditor.js:updatePlayer()` (line 33-187)
   - **Method:** Edit `flag_god_mode` field from 0 to 1 via Player Editor UI
   - **Requirement:** Must already have god-mode to access Player Editor

2. **Direct Database Update:**
   - **File:** `database.js:updatePlayer()` (line 408-460)
   - **Method:** SQL: `UPDATE players SET flag_god_mode = 1 WHERE id = $1`
   - **Access:** Requires direct database access or another god-mode user

3. **Initial Setup (ZORK Only):**
   - **File:** `scripts/zork-ai-agent.cjs:144-147`
   - **Method:** Auto-enables god mode for ZORK player on startup if not set
   - **SQL:** `UPDATE players SET flag_god_mode = 1 WHERE name = $1`

**Conclusion:** No explicit "enter" command. God-mode is enabled by setting `flag_god_mode = 1` via Player Editor (requires existing god-mode) or direct database update. No in-game command like `/godmode` or `/enter` exists.

---

## 4. How does a player exit God Mode?

**Answer:** **NOT FOUND - No explicit "exit" command or function exists.**

### Methods to Disable God Mode:

1. **Player Editor (God Mode Only):**
   - **File:** `protected/editors/player-editor.js`
   - **Handler:** `handlers/playerEditor.js:updatePlayer()` (line 33-187)
   - **Method:** Edit `flag_god_mode` field from 1 to 0 via Player Editor UI
   - **Requirement:** Must have god-mode to access Player Editor

2. **Direct Database Update:**
   - **File:** `database.js:updatePlayer()` (line 408-460)
   - **Method:** SQL: `UPDATE players SET flag_god_mode = 0 WHERE id = $1`
   - **Access:** Requires direct database access or another god-mode user

**Conclusion:** No explicit "exit" command. God-mode is disabled by setting `flag_god_mode = 0` via Player Editor or direct database update. No in-game command like `/exitgodmode` exists. God-mode does NOT auto-exit on disconnect.

---

## 5. Is God Mode activated per-account, per-session, or per-connection?

**Answer:** **Per-player (database-persisted), checked per-connection.**

### Activation Scope:

1. **Database Persistence:**
   - **Field:** `players.flag_god_mode` (INTEGER)
   - **Scope:** Per-player record (not per-account)
   - **Persistence:** Survives sessions, connections, server restarts
   - **Location:** `database.js:412` (in `updatePlayer` allowedFields)

2. **Connection-Level Check:**
   - **File:** `utils/broadcast.js:verifyGodMode()` (line 558-566)
   - **Logic:** Queries database per WebSocket connection
   - **File:** `middleware/session.js:checkGodMode()` (line 129-139)
   - **Logic:** Checks `req.player.flag_god_mode` from session (loaded from database)

3. **Session State:**
   - **File:** `public/client.js:5720-5742`
   - **Variable:** `godMode` (boolean, per-connection state)
   - **Source:** Set from `playerStats` message on connection

**Conclusion:** God-mode is **per-player** (database field), checked **per-connection** (each WebSocket connection verifies against database). Not per-account (multiple characters per account can have different god-mode status). Persists across sessions and server restarts.

---

## 6. Is there a centralized permission check function for God Mode actions, or is access verified locally per feature?

**Answer:** **Centralized with scattered direct checks.**

### Centralized Functions:

1. **WebSocket Handlers:**
   - **File:** `utils/broadcast.js:558-566`
   - **Function:** `verifyGodMode(db, connectedPlayers, ws)`
   - **Usage:** Used by all editor handlers (map, npc, item, crafting, player)
   - **Pattern:**
     ```javascript
     const player = await verifyGodMode(db, connectedPlayers, ws);
     if (!player) {
       ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
       return;
     }
     ```

2. **HTTP Routes:**
   - **File:** `middleware/session.js:129-139`
   - **Function:** `checkGodMode(req, res, next)`
   - **Usage:** Applied to all editor routes in `routes/api.js:520-545`

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

**Conclusion:** Most checks use centralized `verifyGodMode()` function, but some handlers check `player.flag_god_mode !== 1` directly. HTTP routes use centralized `checkGodMode()` middleware. Pattern is mostly centralized with some scattered direct checks.

---

## 7. What capabilities exist today for God Mode users?

**Answer:** **Comprehensive world editing capabilities via editors and commands.**

### A. Editor Capabilities (HTTP + WebSocket):

1. **Map Editor:**
   - Create, edit, delete maps
   - Create, edit, delete rooms
   - Modify room coordinates, descriptions, types
   - Create/delete map connections (exits)
   - Set room type colors
   - Add/remove items from rooms
   - Teleport to any room (`jumpToRoom`)

2. **NPC Editor:**
   - Create, edit NPC definitions
   - Place/remove NPCs in rooms
   - Edit NPC stats, cycle times, loot tables
   - Edit Lore Keeper configuration
   - Edit harvest formula configs (global formulas)

3. **Item Editor:**
   - Create, edit item definitions
   - Modify item properties (encumbrance, type, description)

4. **Crafting Editor:**
   - Create, edit, delete factory recipes
   - Modify recipe requirements, outputs, success rates

5. **Player Editor:**
   - Edit player stats, abilities, resources
   - Modify player inventory (add/remove items)
   - Transport players (change `current_room_id`)
   - Enable/disable god-mode for other players

6. **Ticket Editor:**
   - Create, view, update tickets
   - Access via `Z` key (still requires god-mode)

### B. Game Commands:

1. **`/jump`** - Teleport to any room (opens jump widget)
   - **File:** `public/client.js:2801-2809`
   - **File:** `public/js/main.js:462-471`

2. **`restartServer`** - Restart server (port 3535 only)
   - **File:** `handlers/game.js:3477-3510`

### C. Formula Configuration:

- **Edit harvest formulas** (cycle time, hit rate, cooldown, harvestable time)
- **File:** `handlers/npcEditor.js:337-394`
- **Functions:** `getHarvestFormulaConfigs()`, `updateHarvestFormulaConfig()`

**Conclusion:** God-mode users have comprehensive world editing capabilities: full CRUD on maps, rooms, NPCs, items, recipes, players; teleportation; server restart; formula configuration. All via editors and specific commands.

---

## 8. Which commands are currently allowed only for God Mode?

**Answer:** **Only `/jump` command is god-mode restricted.**

### God-Mode Only Commands:

1. **`/jump` or `jump`:**
   - **File:** `public/client.js:2801-2809`
   - **File:** `public/js/main.js:462-471`
   - **Check:** `if (!godMode) { return; }`
   - **Function:** Opens jump/teleport widget

2. **`restartServer` (WebSocket message):**
   - **File:** `handlers/game.js:3477-3510`
   - **Check:** `verifyGodMode()` (line 3483)
   - **Function:** Restarts server (port 3535 only)

### Editor Access (Not Commands):

- Editor pages are HTTP routes, not commands:
  - `/map`, `/npc`, `/items`, `/crafting`, `/player`, `/tickets`
  - Protected by `checkGodMode` middleware

**Conclusion:** Only `/jump` command is god-mode restricted. `restartServer` is a WebSocket message, not a command. Editor access is via HTTP routes, not commands.

---

## 9. Does any editor UI exist for God Mode (panels, widgets, overlays), or is everything command-driven?

**Answer:** **YES - Comprehensive editor UI exists (panels, widgets, overlays).**

### A. Editor HTML Pages (Full-Screen Overlays):

1. **Map Editor:**
   - **File:** `protected/editors/map-editor.html`
   - **Route:** `/map`
   - **UI:** Full-screen overlay with canvas map visualization

2. **NPC Editor:**
   - **File:** `protected/editors/npc-editor.html`
   - **Route:** `/npc`
   - **UI:** Full-screen overlay with NPC list and detail form

3. **Item Editor:**
   - **File:** `protected/editors/item-editor.html`
   - **Route:** `/items`
   - **UI:** Full-screen overlay with item list and detail form

4. **Crafting Editor:**
   - **File:** `protected/editors/crafting-editor.html`
   - **Route:** `/crafting`
   - **UI:** Full-screen overlay with recipe list and detail form

5. **Player Editor:**
   - **File:** `protected/editors/player-editor.html`
   - **Route:** `/player`
   - **UI:** Full-screen overlay with player list and detail form

6. **Ticket Editor:**
   - **File:** `protected/editors/ticket-editor.html`
   - **Route:** `/tickets`
   - **UI:** Full-screen overlay with ticket list and detail form

### B. God Mode Widget:

- **File:** `public/js/widgets/widget_registry.js:195` - Widget definition
- **Visibility:** Only when `playerState.isGod === true`
- **Icon:** `godmode-widget-icon` (shown/hidden via `updateGodModeUI()`)
- **File:** `public/client.js:5720-5742` - `updateGodModeUI()` function

### C. Character Selection UI:

- **File:** `public/index.html:432-449`
- **Feature:** God-mode players get 4-quadrant button (GAME/MAP/NPC/ITEM) for quick editor access

### D. Jump/Teleport Widget:

- **File:** `public/js/main.js:1114-1472`
- **Command:** `/jump` opens widget
- **UI:** Interactive map widget for teleportation

**Conclusion:** Comprehensive editor UI exists: full-screen editor overlays for all editors, God Mode widget, character selection UI, and jump/teleport widget. Not command-driven - primarily UI-based.

---

## 10. Are there any server-side safeguards preventing accidental destructive use of God Mode (deleting rooms, corrupting data, nuking NPCs)?

**Answer:** **PARTIAL - Some safeguards exist, but limited.**

### Existing Safeguards:

1. **God-Mode Verification:**
   - **File:** `utils/broadcast.js:verifyGodMode()` (line 558-566)
   - **Safeguard:** All editor operations require god-mode verification
   - **Prevention:** Non-god players cannot access editors

2. **Database Constraints:**
   - **Foreign keys:** Prevent orphaned records
   - **NOT NULL constraints:** Prevent invalid data
   - **Location:** Database schema (migrations)

3. **Field Validation:**
   - **File:** `database.js:updatePlayer()` (lines 418-436)
   - **Safeguard:** Vitalis capped at max (prevents overflow)
   - **File:** `handlers/playerEditor.js:addPlayerInventoryItem()` (lines 236-251)
   - **Safeguard:** Encumbrance check before adding items

### Missing Safeguards:

1. **No Confirmation Dialogs:**
   - Room deletion: No "Are you sure?" prompt
   - NPC deletion: No confirmation
   - Item deletion: No confirmation
   - Map deletion: No confirmation

2. **No Undo System:**
   - Deletions are permanent
   - No rollback mechanism

3. **No Backup Before Deletion:**
   - Rooms/NPCs/items deleted without backup
   - No audit trail of deletions

4. **No Cascade Protection:**
   - Deleting rooms with players: No check
   - Deleting NPCs in active harvest: No check
   - Deleting items in player inventory: No check

**Conclusion:** Limited safeguards exist (god-mode verification, database constraints, field validation). Missing: confirmation dialogs, undo system, backup before deletion, cascade protection. Destructive operations can be performed without confirmation.

---

## 11. Is there a logging or audit trail for God Mode actions?

**Answer:** **NO - No dedicated audit trail exists.**

### Existing Logging:

1. **Console Logs:**
   - **File:** `handlers/game.js:3507` - `console.log('Server restart requested by god mode user')`
   - **File:** `handlers/game.js:418` - `console.log('Editor connection authenticated...')`
   - **File:** `handlers/game.js:6285` - `console.log('[Ticket Editor] Ticket #${ticket.id} created by ${playerData.playerName}')`
   - **File:** `scripts/zork-ai-agent.cjs:875` - `console.log('[ZORK] Executing ${actions.length} action(s) for god-mode player...')`

2. **No Database Audit Table:**
   - No `god_mode_actions` table
   - No `audit_log` table
   - No tracking of who modified what

3. **No Action Logging:**
   - Room creation/deletion: Not logged
   - NPC creation/deletion: Not logged
   - Item creation/deletion: Not logged
   - Player stat modifications: Not logged
   - Formula config changes: Not logged

**Conclusion:** No dedicated audit trail exists. Only console logs for some operations (server restart, ticket creation, ZORK actions). No database table tracking god-mode actions. No "Player X modified room Y" logging.

---

## 12. Does God Mode allow real-time world mutation (editing rooms/NPCs/items while the world is running), and if so, how is state sync handled?

**Answer:** **YES - Real-time world mutation is allowed, with immediate database updates and WebSocket broadcasts.**

### Real-Time Mutation:

1. **Database Updates:**
   - **File:** All editor handlers call database functions directly
   - **Examples:**
     - `handlers/mapEditor.js:createRoom()` - `db.createRoom()` (INSERT)
     - `handlers/npcEditor.js:updateNPC()` - `db.updateScriptableNPC()` (UPDATE)
     - `handlers/itemEditor.js:createItem()` - `db.createItem()` (INSERT)
   - **Result:** Changes written to database immediately

2. **State Sync:**

   a. **Room Updates:**
      - **File:** `handlers/mapEditor.js:updateRoom()` (lines 182-250)
      - **Sync:** No explicit broadcast to players in room
      - **Result:** Players see changes on next `look` or room update

   b. **NPC Updates:**
      - **File:** `handlers/npcEditor.js:updateNPC()` (lines 109-187)
      - **Sync:** No explicit broadcast
      - **Result:** NPC changes visible on next room update

   c. **Item Updates:**
      - **File:** `handlers/itemEditor.js:updateItem()` (lines 92-120)
      - **Sync:** No explicit broadcast
      - **Result:** Item changes visible when item is next accessed

   d. **Player Updates:**
      - **File:** `handlers/playerEditor.js:updatePlayer()` (lines 33-187)
      - **Sync:** Sends `playerStats` update if player is online (line 175)
      - **Sync:** Sends `roomUpdate` if `current_room_id` changed (line 169)
      - **Result:** Player sees stat/room changes immediately

3. **Formula Config Updates:**
   - **File:** `handlers/npcEditor.js:updateHarvestFormulaConfig()` (lines 354-394)
   - **Sync:** Clears config cache (line 375)
   - **Sync:** Updates global room update interval if applicable (line 380-384)
   - **Result:** Formula changes take effect immediately

**Conclusion:** Real-time world mutation is allowed. Changes are written to database immediately. State sync is **incomplete** - some changes (rooms, NPCs, items) are not broadcast to players in real-time. Players see changes on next room update or interaction. Player updates are synced immediately via WebSocket.

---

## 13. Is there a dedicated API endpoint layer for God Mode operations, or are they folded into normal game command handlers?

**Answer:** **BOTH - Dedicated HTTP routes for editors, WebSocket handlers for operations.**

### A. HTTP API Endpoints (Editor Pages):

- **File:** `routes/api.js:520-545`
- **Routes:**
  - `GET /map` - Map Editor page
  - `GET /npc` - NPC Editor page
  - `GET /items` - Item Editor page
  - `GET /crafting` - Crafting Editor page
  - `GET /player` - Player Editor page
  - `GET /tickets` - Ticket Editor page
  - `GET /:file(map|npc|item|player|ticket|crafting)-editor.:ext(js|css)` - Editor assets
- **Protection:** `checkGodMode` middleware

### B. WebSocket Handlers (Operations):

- **File:** `handlers/index.js` - Message router
- **Handlers:**
  - `handlers/mapEditor.js` - Map operations
  - `handlers/npcEditor.js` - NPC operations
  - `handlers/itemEditor.js` - Item operations
  - `handlers/craftingEditor.js` - Recipe operations
  - `handlers/playerEditor.js` - Player operations
- **Protection:** `verifyGodMode()` function

### C. Mixed Operations:

- **File:** `handlers/game.js`
- **Operations:**
  - `restartServer` (line 3477) - God-mode only
  - `createTicket` (line 6201) - God-mode only
  - Other commands: Normal game commands (not god-mode restricted)

**Conclusion:** Dedicated HTTP API endpoints exist for editor pages. WebSocket handlers handle operations. Some god-mode operations are in `handlers/game.js` alongside normal commands. Architecture is **mixed** - dedicated editor endpoints + WebSocket handlers + some operations in game handlers.

---

## 14. Do God Mode editors manipulate the live database directly, or do they modify in-memory state that is later persisted?

**Answer:** **Direct database manipulation - changes are immediate and persistent.**

### Database Operations:

1. **All Editor Handlers Call Database Functions:**
   - **Map Editor:** `db.createRoom()`, `db.updateRoom()`, `db.deleteRoom()` - Direct INSERT/UPDATE/DELETE
   - **NPC Editor:** `db.createScriptableNPC()`, `db.updateScriptableNPC()` - Direct INSERT/UPDATE
   - **Item Editor:** `db.createItem()`, `db.updateItem()` - Direct INSERT/UPDATE
   - **Crafting Editor:** `db.createFactoryRecipe()`, `db.updateFactoryRecipe()` - Direct INSERT/UPDATE
   - **Player Editor:** `db.updatePlayer()`, `db.addPlayerItem()` - Direct UPDATE/INSERT

2. **No In-Memory Staging:**
   - No draft state
   - No preview state
   - No "save" vs "apply" distinction
   - Changes are committed immediately

3. **Session State Updates:**
   - After database changes, editors send WebSocket messages to update client UI
   - Broadcast room updates to connected players (for some operations)
   - Refresh stats widgets (for player updates)

**Conclusion:** Editors manipulate the live database directly. All changes are immediate and persistent. No in-memory staging or draft system exists. Changes are committed to PostgreSQL immediately upon editor save.

---

## 15. Is there a schema for draft/preview changes before committing them to the world?

**Answer:** **NO - No draft/preview schema exists for editor changes.**

### Existing Preview Systems (Not Drafts):

1. **Crafting Editor Preview:**
   - **File:** `protected/editors/crafting-editor.html:262-271`
   - **Function:** Live preview of success rate, crit chance, craft time
   - **Type:** Calculation preview (not draft state)
   - **Location:** Client-side only, not persisted

2. **Path Preview (Not Editor-Related):**
   - **File:** `public/js/main.js:2259-2302`
   - **Function:** Preview path execution route
   - **Type:** UI preview (not draft state)
   - **Location:** Client-side only, not persisted

3. **Color Preview (UI Only):**
   - **File:** `protected/editors/npc-editor.html:74` - NPC color preview
   - **Type:** Visual preview (not draft state)

### Missing Draft System:

- No `draft_rooms` table
- No `draft_npcs` table
- No `draft_items` table
- No "Save Draft" vs "Publish" workflow
- No preview mode for editors

**Conclusion:** No draft/preview schema exists. Editors commit changes immediately to live database. Only client-side calculation previews exist (crafting success rate, path preview). No staging or draft system for editor changes.

---

## 16. Can God Mode users impersonate players, test NPC cycles, or freeze world state?

**Answer:** **PARTIALLY - Some capabilities exist, but not comprehensive.**

### A. Player Impersonation:

- **NOT FOUND** - No explicit impersonation system
- **Workaround:** God-mode users can edit any player's stats/location via Player Editor
- **File:** `handlers/playerEditor.js:updatePlayer()` (line 33-187)
- **Capability:** Can modify any player's stats, inventory, location
- **Limitation:** Cannot "become" another player (no session switching)

### B. Test NPC Cycles:

- **NOT FOUND** - No explicit test mode for NPC cycles
- **Workaround:** God-mode users can:
  - Edit NPC definitions (cycle times, outputs)
  - Place NPCs in rooms
  - Harvest NPCs (same as regular players)
- **Limitation:** Cannot freeze NPC cycles or run test cycles

### C. Freeze World State:

- **NOT FOUND** - No freeze/pause system
- **Workaround:** None - world continues running
- **Limitation:** Cannot pause NPC cycles, harvest sessions, or world state

**Conclusion:** Limited testing capabilities exist. God-mode users can edit players/NPCs but cannot impersonate players, test NPC cycles in isolation, or freeze world state. No dedicated testing/simulation tools found.

---

## 17. Are God Mode editors allowed to modify formulas or configs at runtime, or is all formula configuration static?

**Answer:** **YES - God-mode users can modify formulas/configs at runtime.**

### Runtime Formula Modification:

1. **Harvest Formula Configs:**
   - **File:** `handlers/npcEditor.js:337-394`
   - **Functions:**
     - `getHarvestFormulaConfigs()` - Get all formula configs
     - `updateHarvestFormulaConfig()` - Update formula config
   - **Configs:**
     - `cycle_time_reduction` - Resonance-based cycle time reduction
     - `hit_rate` - Resonance-based hit rate
     - `cooldown_time_reduction` - Fortitude-based cooldown reduction
     - `harvestable_time_increase` - Fortitude-based harvestable time increase
     - `room_update_interval_ms` - Global room update interval
   - **Runtime Effect:**
     - **File:** `handlers/npcEditor.js:375` - `clearConfigCache()` called on update
     - **File:** `handlers/npcEditor.js:380-384` - Updates global room update interval immediately
     - **Result:** Changes take effect immediately (cache cleared)

2. **Factory Recipe Configs:**
   - **File:** `handlers/craftingEditor.js`
   - **Functions:** `createRecipe()`, `updateRecipe()`, `deleteRecipe()`
   - **Configs:** Success rate, crafting time, required stats, outputs
   - **Runtime Effect:** Changes take effect immediately (no cache)

3. **NPC Configs:**
   - **File:** `handlers/npcEditor.js:updateNPC()`
   - **Configs:** Cycle times, outputs, stats, buffs
   - **Runtime Effect:** Changes apply to new harvest sessions (existing sessions use cached stats)

**Conclusion:** God-mode users can modify formulas/configs at runtime. Harvest formula configs are cached but cache is cleared on update. Factory recipe and NPC configs take effect immediately. All formula configuration is **dynamic**, not static.

---

## 18. Are God Mode commands or panels extensible?

**Answer:** **PARTIALLY - Some extensibility exists, but no plugin architecture.**

### Existing Extensibility:

1. **Command Registry:**
   - **File:** `public/client.js:1341-1398` - `COMMAND_REGISTRY` array
   - **File:** `public/js/main.js:599-663` - `COMMAND_REGISTRY` array
   - **Extensibility:** Commands can be added to registry
   - **Limitation:** Requires code changes, not runtime extensible

2. **Widget Registry:**
   - **File:** `public/js/widgets/widget_registry.js:1-247`
   - **Extensibility:** Widgets can be added to `WIDGETS` array
   - **Limitation:** Requires code changes, not runtime extensible

3. **Editor Pattern:**
   - **File:** `public/js/editorShared/EditorBase.js` - Base class for editors
   - **Extensibility:** New editors can extend `EditorBase`
   - **Pattern:** All editors follow same pattern (CRUD operations)
   - **Limitation:** Requires code changes, not runtime extensible

### Missing Extensibility:

- **No Plugin Architecture:**
  - No plugin registry
  - No hook system
  - No extension points
  - No runtime plugin loading

- **No Command Extension API:**
  - No way to register new commands at runtime
  - No command hook system
  - No third-party command support

**Conclusion:** Limited extensibility exists (command/widget/editor registries), but requires code changes. No plugin architecture, hook system, or runtime extensibility found. Extensibility is **code-based**, not **plugin-based**.

---

## 19. Is there any front-end widget or UI that visually indicates a user is in God Mode?

**Answer:** **YES - Multiple visual indicators exist.**

### A. God Mode Widget Icon:

- **File:** `public/client.js:5720-5742` - `updateGodModeUI()` function
- **Element:** `godmode-widget-icon` (shown/hidden based on god-mode)
- **Visibility:** Only visible when `hasGodMode === true`
- **Location:** Widget icon bar

### B. Character Selection UI:

- **File:** `public/index.html:432-449`
- **Feature:** God-mode players get 4-quadrant button (GAME/MAP/NPC/ITEM)
- **Visual:** Different button style for god-mode characters
- **Badge:** "GOD" badge shown in Player Editor list
  - **File:** `protected/editors/player-editor.html:64`
  - **Class:** `player-god-badge`
  - **CSS:** `protected/editors/player-editor.css:148`

### C. Editor Access:

- **Routes:** `/map`, `/npc`, `/items`, `/crafting`, `/player`, `/tickets`
- **Visual:** Editor pages are only accessible to god-mode users
- **Indicator:** Access to editors itself is an indicator

### D. Client-Side State:

- **Variable:** `godMode` (boolean) in `public/client.js:5076`
- **State:** `window.gameState.isGod` (boolean) in `public/js/main.js:714`
- **Usage:** Controls visibility of god-mode features

**Conclusion:** Multiple visual indicators exist: God Mode widget icon, 4-quadrant character selection button, "GOD" badge in Player Editor, and access to editor pages. No explicit "GOD MODE" badge in game UI, but indicators exist.

---

## 20. Is there any explicit separation between Content Editors (room/NPC/item designers), System Operators (god-mode, simulation tools), and Developers (debug tooling)?

**Answer:** **NO - All capabilities are merged under one "God Mode" umbrella.**

### Current Structure:

1. **Single Permission Level:**
   - **Field:** `flag_god_mode` (INTEGER, 0 or 1)
   - **Scope:** All-or-nothing access
   - **No separation:** Content editing, system operations, and debug tools all require same flag

2. **All Capabilities Under God Mode:**
   - **Content Editors:** Map, NPC, Item, Crafting, Player editors
   - **System Operators:** Server restart, formula config, teleportation
   - **Developers:** No explicit debug tooling found (except console logs)

3. **No Role-Based Access:**
   - No `role` field in players table
   - No `permission_level` field
   - No separate flags for different capabilities
   - No content_editor vs system_operator distinction

### Missing Separation:

- **No Content Editor Role:**
  - Cannot grant room/NPC/item editing without full god-mode

- **No System Operator Role:**
  - Cannot grant server restart/formula config without full god-mode

- **No Developer Role:**
  - No separate debug tooling access

- **No Granular Permissions:**
  - Cannot grant "edit rooms only" or "edit formulas only"

**Conclusion:** No explicit separation exists. All capabilities (content editing, system operations, debug tools) are merged under single `flag_god_mode` flag. No role-based access control or granular permissions found. Single "God Mode" umbrella covers all administrative capabilities.

---

## Summary

### Strengths:
1. **Centralized authorization** via `verifyGodMode()` and `checkGodMode()`
2. **Comprehensive editor UI** for all world editing
3. **Real-time world mutation** with immediate database updates
4. **Runtime formula configuration** with cache clearing
5. **Visual indicators** for god-mode status

### Weaknesses:
1. **No audit trail** - No logging of god-mode actions
2. **Limited safeguards** - No confirmation dialogs, undo system, or backups
3. **Incomplete state sync** - Some changes not broadcast in real-time
4. **No draft/preview system** - Changes committed immediately
5. **No role separation** - All capabilities under single flag
6. **No testing tools** - Cannot impersonate players, test NPC cycles, or freeze state
7. **No plugin architecture** - Extensibility requires code changes

### Risks:
1. **Destructive operations** can be performed without confirmation
2. **No audit trail** makes it impossible to track who changed what
3. **All-or-nothing access** - Cannot grant limited permissions
4. **No undo system** - Deletions are permanent

---

**End of Answers**

