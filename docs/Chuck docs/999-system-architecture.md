# 20 — System Architecture (Canonical One-Liner Answers)

> **Purpose:** This document answers 20 fundamental architecture questions that define the canonical structure, responsibilities, and boundaries of The Game's system architecture. All answers are code-verified and implementation-aligned.

---

## 1. Define the exact purpose of 20-system-architecture.md.

**Answer:** `20-system-architecture.md` is the **high-level architectural constitution** that defines:
- The 20 core systems and their canonical responsibilities
- System boundaries and communication patterns
- Data ownership and state management rules
- Server vs client responsibilities
- Execution model and tick system
- Extension patterns and architectural invariants

**Purpose:** Provides a single source of truth for architectural decisions. All system implementations must align with these definitions. This document serves as the **architectural reference** that 10-series (game operations) and 21-25 series (implementation details) must reference.

**File References:**
- `docs/Chuck docs/00-README.md:76-87` - Planned architecture series
- `docs/Chuck docs/00-README.md:81` - Explicitly mentions this document

---

## 2. List the 20 systems that must be included.

**Answer:** The 20 canonical systems are:

1. **Authentication System** - Account/character management, sessions, email verification
2. **Player System** - Character state, stats, abilities, resources, location
3. **Room/Map System** - Spatial world, coordinates, map connections, room types
4. **Item System** - Item definitions, inventory, encumbrance, item lifecycle
5. **NPC System** - NPC definitions, placements, types, state machines
6. **Harvest Engine** - NPC cycle processing, harvest sessions, timing, formulas
7. **Factory System** - Crafting recipes, runes, quirks, slot mechanics, output routing
8. **Warehouse System** - Private storage, deeds, capacity, room-based access
9. **Bank System** - Currency storage, deposits, withdrawals, auto-conversion
10. **Merchant System** - Buy/sell mechanics, inventory management, pricing
11. **Communication System** - Talk, resonate, telepath, message routing
12. **Widget System** - UI components, visibility, state, slot management
13. **Markup System** - Text styling, conventions, parsing, rendering
14. **Formula System** - Stat-driven math, exponential curves, global formulas
15. **Editor System** - God-mode tools, map/NPC/item/player/crafting editors
16. **Pathfinding/Automation System** - Auto-path, BFS, path execution, loops
17. **Terminal Rendering System** - Message display, scrollback, formatting
18. **Message Routing System** - WebSocket dispatch, handler mapping, authentication
19. **RAG/Knowledge System** - Semantic search, embeddings, knowledge storage
20. **ZORK AI System** - Autonomous agent, Claude integration, game world interaction

**File References:**
- `handlers/index.js:17-144` - Handler mapping shows all systems
- `services/` directory - Background services (NPC cycle, factory, ticket)
- `utils/` directory - Utility systems (formulas, markup, pathfinding, knowledge)
- `docs/GAME-ARCHITECTURE-SUMMARY.md:318-633` - Key systems documentation

---

## 3. State the canonical responsibility of each system.

**Answer:**

1. **Authentication System:** Manages accounts, sessions, character selection, email verification, password reset. Owns `accounts`, `user_characters` tables. Enforces single-session-per-account.

2. **Player System:** Manages character state (stats, abilities, resources, location). Owns `players` table. Provides prefix-based stat detection (`stat_*`, `ability_*`, `resource_*`, `flag_*`).

3. **Room/Map System:** Manages spatial world structure. Owns `maps`, `rooms` tables. Handles coordinate-based navigation, map connections, room types (normal, merchant, factory, warehouse, bank).

4. **Item System:** Manages item definitions and lifecycle. Owns `items`, `player_items`, `room_items` tables. Handles encumbrance, item types, poofable logic.

5. **NPC System:** Manages NPC definitions and placements. Owns `scriptable_npcs`, `room_npcs` tables. Provides type-driven NPC behavior (rhythm, stability, worker, tending, machine, rotation, economic, farm, patrol, threshold, lorekeeper).

6. **Harvest Engine:** Processes NPC cycles, harvest sessions, timing, formulas. Owns harvest session state in `room_npcs.state` JSON. Runs on 1-second tick interval. Applies Resonance/Fortitude formulas.

7. **Factory System:** Manages crafting recipes, runes, quirks, slot mechanics. Owns `factory_recipes`, `factory_runes`, `factory_quirks` tables. Processes crafting via `factoryCraftingEngine.js`, applies formulas (success, crit, speed, efficiency).

8. **Warehouse System:** Manages private storage per player per location. Owns `warehouse_items`, `player_warehouses` tables. Enforces deed-based access, capacity limits, private isolation.

9. **Bank System:** Manages currency storage. Owns `player_bank` table. Handles deposits, withdrawals, auto-conversion (crowns ↔ shards). Room-type-gated (bank rooms only).

10. **Merchant System:** Manages buy/sell transactions. Owns `merchant_items` table. Handles inventory, pricing, regeneration, unlimited stock. Room-type-gated (merchant rooms only).

11. **Communication System:** Routes messages (talk, resonate, telepath). Uses `messageRouter.js`. Broadcasts to rooms, world, or specific players. Integrates with CommsWidget.

12. **Widget System:** Manages UI component visibility and state. Owns `player_widget_config` table. Provides toggleable widgets (stats, compass, map, comms, etc.) and conditional widgets (NPC, factory, warehouse).

13. **Markup System:** Parses and renders text styling. Owns `markup_conventions`, `markup_builtin_edits` tables. Provides client (`Markup.js`) and server (`markupService.js`) parsing.

14. **Formula System:** Defines stat-driven mathematical formulas. Centralized in `utils/harvestFormulas.js`. Uses exponential curve engine. Applied across harvest, attunement, pulse echoes, factory crafting, runes, quirks.

15. **Editor System:** Provides god-mode content editing tools. Handlers: `mapEditor.js`, `npcEditor.js`, `itemEditor.js`, `playerEditor.js`, `craftingEditor.js`. Direct database manipulation, no staging.

16. **Pathfinding/Automation System:** Calculates paths, executes auto-navigation. Uses `utils/pathfinding.js` (BFS). Manages path state, execution, loops. Blocks movement during execution.

17. **Terminal Rendering System:** Displays messages, manages scrollback. Component: `Terminal.js`. Applies markup parsing, formats output, handles idle auto-look.

18. **Message Routing System:** Dispatches WebSocket messages to handlers. `handlers/index.js` provides dispatch function. Maps message types to handler functions. Enforces authentication, harvest interruption.

19. **RAG/Knowledge System:** Provides semantic search over knowledge base. Owns `zork_knowledge` table. Uses OpenAI embeddings (1536 dims). Categories: core_identity, game_design, technical, command_knowledge, world_lore, system_docs, learned_context.

20. **ZORK AI System:** Autonomous AI agent living in game world. Script: `scripts/zork-ai-agent.cjs`. Connects via WebSocket, uses Claude API, has god-mode powers, learns via RAG system.

**File References:**
- `handlers/game.js` - Core game system handlers
- `services/npcCycleEngine.js` - Harvest engine implementation
- `services/factoryCraftingEngine.js` - Factory system implementation
- `utils/harvestFormulas.js` - Formula system implementation
- `docs/Chuck docs/10-14-formula-canonical-spec.md` - Formula system specification

---

## 4. Describe how systems communicate at a high level.

**Answer:**

**Server-Side Communication:**
- **WebSocket Messages:** All player actions → `handlers/index.js` → routes to appropriate handler → handler calls `database.js` functions → handler sends response via WebSocket
- **Background Services:** `npcCycleEngine.js` runs on 1-second interval, reads `room_npcs`, updates state, broadcasts via `broadcast.js`
- **Database Layer:** All systems read/write via `database.js` PostgreSQL connection pool. No direct database access.
- **Event-Driven:** Room updates trigger broadcasts. Harvest sessions trigger state changes. Movement triggers room updates.

**Client-Side Communication:**
- **MessageBus Pattern:** `Game.js` receives WebSocket messages → emits to `MessageBus` → components subscribe to events → components update UI reactively
- **Component System:** ES6 modules, base `Component.js` class, lifecycle methods (`init`, `update`, `destroy`)
- **Event Types:** `room:update`, `playerStats`, `inventory`, `message`, `systemMessage`, etc.

**Cross-Boundary Communication:**
- **WebSocket Protocol:** JSON messages, type-based routing
- **Database as Shared State:** All systems read/write PostgreSQL. No in-memory shared state between systems (except `connectedPlayers` Map for WebSocket routing).

**File References:**
- `handlers/index.js:152-243` - Message dispatch pattern
- `public/js/core/Game.js` - Client-side message routing
- `public/js/core/MessageBus.js` - Event system
- `utils/broadcast.js` - Server-side broadcasting

---

## 5. Specify which systems depend on which others.

**Answer:**

**Core Dependencies (Foundation Layer):**
- **All systems** depend on **Database System** (`database.js`)
- **All systems** depend on **Authentication System** (for player context)
- **All systems** depend on **Message Routing System** (for WebSocket communication)

**Gameplay Dependencies:**
- **Harvest Engine** depends on: NPC System, Player System, Formula System, Room System
- **Factory System** depends on: Item System, Formula System, Room System, Player System
- **Warehouse System** depends on: Item System, Room System, Player System
- **Bank System** depends on: Item System (currency), Room System, Player System
- **Merchant System** depends on: Item System, Room System, Player System
- **Pathfinding System** depends on: Room/Map System
- **Communication System** depends on: Player System, Room System

**UI Dependencies:**
- **Widget System** depends on: Player System, Room System, Item System, NPC System
- **Terminal Rendering** depends on: Markup System, Communication System
- **All UI Components** depend on: MessageBus, Game controller

**Editor Dependencies:**
- **All Editors** depend on: Database System, Authentication System (god-mode check)
- **Map Editor** depends on: Room/Map System
- **NPC Editor** depends on: NPC System, Room System
- **Item Editor** depends on: Item System, Room System (merchant/warehouse)
- **Player Editor** depends on: Player System, Item System (inventory)
- **Crafting Editor** depends on: Factory System, Item System

**AI Dependencies:**
- **ZORK AI System** depends on: RAG/Knowledge System, Communication System, Editor System (god-mode), Database System
- **RAG/Knowledge System** depends on: Database System

**Formula Dependencies:**
- **Formula System** is **dependency-free** (pure math, no side effects)
- **All gameplay systems** depend on Formula System for stat calculations

**File References:**
- `handlers/game.js` - Shows dependencies in handler implementations
- `services/npcCycleEngine.js:434-474` - Harvest engine dependencies
- `services/factoryCraftingEngine.js` - Factory system dependencies
- `utils/harvestFormulas.js` - Formula system (no dependencies)

---

## 6. Define the global execution/tick model.

**Answer:**

**Tick-Based Background Services:**
- **NPC Cycle Engine:** Runs every **1 second** (`NPC_TICK_INTERVAL = 1000ms`). Processes all active NPCs, updates harvest sessions, produces items, manages cooldowns.
- **Room Update Timer:** Checks every **1 second**, sends room updates to players based on per-player `room_update_interval_ms` (default 30 seconds, configurable via formula config).

**Event-Driven Execution:**
- **Player Actions:** WebSocket message → handler → database → response. No tick delay.
- **Movement:** Immediate validation and room update.
- **Harvest:** Starts session, NPC cycle engine processes on tick, player receives updates.

**Per-Player Timers:**
- **Auto-Navigation:** Uses `auto_navigation_time_ms` (default 1000ms) per movement step.
- **Room Updates:** Uses `room_update_interval_ms` (default 30000ms) per player.
- **Idle Auto-Look:** 30-second idle timer, checks every 5 seconds.

**Session Cleanup:**
- **Session Cleanup:** Every 5 minutes.
- **Lore Keeper Engagement Cleanup:** Every 1 minute.

**No Global Game Tick:**
- The game does **not** have a single global game tick. Each system runs on its own interval or event-driven basis.

**File References:**
- `services/npcCycleEngine.js:25` - `NPC_TICK_INTERVAL = 1000`
- `services/npcCycleEngine.js:442` - `setInterval` for NPC cycles
- `services/npcCycleEngine.js:1162` - Room update timer (1-second check)
- `server.js:94-127` - Session cleanup interval (5 minutes)

---

## 7. Specify what lives server-side vs client-side.

**Answer:**

**Server-Side (Node.js/Express):**
- **All game logic:** Movement validation, harvest processing, crafting, formulas, pathfinding
- **Database access:** All reads/writes via `database.js`
- **NPC cycle engine:** Background service processing NPCs
- **WebSocket server:** Message routing, authentication, broadcasting
- **Session management:** Express sessions, account/character sessions
- **Email service:** Verification, password reset
- **Markup parsing:** Server-side parsing via `markupService.js` (for server-generated messages)
- **Formula calculations:** All stat-driven math (`harvestFormulas.js`)
- **ZORK AI agent:** Autonomous agent script

**Client-Side (Browser/ES6 Modules):**
- **UI rendering:** All components (Terminal, StatsWidget, MapWidget, etc.)
- **Markup parsing:** Client-side parsing via `Markup.js` (for all displayed text)
- **WebSocket client:** Connection management, reconnection logic
- **MessageBus:** Event system for component communication
- **Widget state:** UI visibility, slot positions (synced to server via `player_widget_config`)
- **Path preview:** Visual path rendering (calculation done server-side)
- **Command parsing:** Client normalizes commands before sending to server
- **Idle detection:** Client tracks idle time for auto-look

**Shared/Stateful:**
- **Factory widget state:** Server tracks per-connection (`factoryWidgetState` Map), client displays
- **Warehouse widget state:** Server tracks per-connection (`warehouseWidgetState` Map), client displays
- **Connected players:** Server tracks (`connectedPlayers` Map) for WebSocket routing

**File References:**
- `server.js` - Server-side entry point
- `public/js/main.js` - Client-side entry point
- `public/js/core/Game.js` - Client WebSocket management
- `handlers/game.js` - Server-side game logic
- `server.js:149-153` - Server-side widget state Maps

---

## 8. Declare the role of the AI/RAG layer in the architecture.

**Answer:**

**RAG/Knowledge System Role:**
- **Storage:** `zork_knowledge` table stores knowledge chunks with embeddings (optional, 1536 dims)
- **Retrieval:** Semantic search via OpenAI embeddings, keyword fallback, category-based filtering
- **Categories:** core_identity, game_design, technical, command_knowledge, world_lore, system_docs, learned_context
- **Priorities:** 0 (contextual), 1 (important), 2 (always-include)
- **Sources:** system, zork, cursor

**ZORK AI System Role:**
- **Autonomous Agent:** Lives in game world as real player, connects via WebSocket
- **Knowledge Consumer:** Uses RAG system for contextual responses
- **Knowledge Producer:** Can learn via `learnKnowledge` action, stores to RAG system
- **God-Mode Powers:** Can modify game world, execute SQL, create content
- **Dual Persona:** "Chuck" for @Fliz@, "ZORK THE AI LORD" for others

**Cursor Integration:**
- **MCP Tools:** Cursor uses MCP tools (`knowledge_add`, `knowledge_update`, etc.) to store knowledge
- **Autonomous Storage:** `.cursorrules` instructs Cursor to automatically store knowledge after implementing features
- **Shared Knowledge Base:** Both ZORK and Cursor read/write same `zork_knowledge` table

**Architectural Position:**
- **Not Core Game System:** RAG/AI layer is **orthogonal** to gameplay systems. It does not affect player actions, formulas, or game state directly.
- **Development Tool:** Primarily serves development workflow (Cursor) and narrative AI (ZORK).
- **Optional:** Game can run without RAG/AI layer (embeddings are optional, keyword search fallback exists).

**File References:**
- `utils/zorkKnowledge.js` - RAG system utilities
- `scripts/zork-ai-agent.cjs` - ZORK autonomous agent
- `mcp-test-server/tools/knowledge.js` - MCP knowledge tools
- `database.js` - RAG database functions
- `migrations/060_zork_knowledge_system.sql` - RAG schema

---

## 9. Define what belongs in 20 vs what belongs in docs 21–25.

**Answer:**

**20-system-architecture.md (This Document):**
- **High-level system definitions:** What the 20 systems are, their responsibilities
- **Architectural boundaries:** Server vs client, system dependencies, communication patterns
- **Canonical rules:** Invariants, data ownership, extension patterns
- **One-liner answers:** Fundamental architectural questions

**21-backend-services.md (Planned):**
- **Service implementations:** Detailed specs for `services/` directory
- **Background services:** NPC cycle engine, room update timer, session cleanup
- **Utility modules:** `utils/` directory specifications
- **Database layer:** Connection pooling, query patterns, transaction handling

**22-frontend-architecture.md (Planned):**
- **Component system:** ES6 module architecture, Component base class, MessageBus
- **Widget implementations:** Each widget's architecture, state management, lifecycle
- **Client-side utilities:** Markup parsing, pathfinding preview, command normalization
- **WebSocket client:** Connection management, reconnection, message handling

**23-editor-components.md (Planned):**
- **Editor architecture:** God-mode tools, handler patterns, field editors
- **Editor-specific details:** Map editor, NPC editor, item editor, player editor, crafting editor
- **Editor permissions:** God-mode verification, access control
- **Editor workflows:** Create, update, delete patterns

**24-widget-components.md (Planned):**
- **Widget specifications:** Each widget's UI, state, events, integration
- **Widget registry:** Toggleable vs conditional widgets, slot management
- **Widget state persistence:** `player_widget_config` table schema, sync patterns

**25-database-schema-overview.md (Planned):**
- **Schema documentation:** All tables, relationships, constraints
- **Migration patterns:** How migrations are structured, applied
- **Data ownership:** Which system owns which tables

**File References:**
- `docs/Chuck docs/00-README.md:76-87` - Planned architecture series structure

---

## 10. State the canonical data ownership for every major state type.

**Answer:**

**Player State:**
- **Owner:** Player System
- **Storage:** `players` table
- **Mutable By:** Player System (via commands), Editor System (god-mode), Harvest Engine (Vitalis), Attunement System (cooldowns, points)

**Room/Map State:**
- **Owner:** Room/Map System
- **Storage:** `maps`, `rooms` tables
- **Mutable By:** Room/Map System (via movement), Editor System (god-mode)

**Item State:**
- **Owner:** Item System
- **Storage:** `items` (definitions), `player_items` (inventory), `room_items` (ground), `warehouse_items` (warehouse), `player_bank` (bank)
- **Mutable By:** Item System (via take/drop), Harvest Engine (produces items), Factory System (crafts items), Merchant System (buy/sell), Warehouse System (store/withdraw), Bank System (deposit/withdraw)

**NPC State:**
- **Owner:** NPC System (definitions), Harvest Engine (runtime state)
- **Storage:** `scriptable_npcs` (definitions), `room_npcs` (placements + state JSON)
- **Mutable By:** NPC System (definitions), Harvest Engine (cycle state), Editor System (god-mode)

**Harvest Session State:**
- **Owner:** Harvest Engine
- **Storage:** `room_npcs.state` JSON field
- **Mutable By:** Harvest Engine only (NPC cycle tick)

**Factory State:**
- **Owner:** Factory System
- **Storage:** `factory_recipes` (definitions), `factoryWidgetState` Map (per-connection runtime)
- **Mutable By:** Factory System (crafting), Editor System (recipes), Player (slot items)

**Warehouse State:**
- **Owner:** Warehouse System
- **Storage:** `warehouse_items`, `player_warehouses` tables, `warehouseWidgetState` Map (per-connection)
- **Mutable By:** Warehouse System only (store/withdraw commands)

**Bank State:**
- **Owner:** Bank System
- **Storage:** `player_bank` table
- **Mutable By:** Bank System only (deposit/withdraw commands)

**Merchant State:**
- **Owner:** Merchant System
- **Storage:** `merchant_items` table
- **Mutable By:** Merchant System (buy/sell), Editor System (god-mode configuration)

**Widget State:**
- **Owner:** Widget System
- **Storage:** `player_widget_config` table
- **Mutable By:** Widget System (player configuration), Player (via UI)

**Session State:**
- **Owner:** Authentication System
- **Storage:** Express session store, `activeAccountSessions` Map, `connectedPlayers` Map
- **Mutable By:** Authentication System only

**Knowledge State:**
- **Owner:** RAG/Knowledge System
- **Storage:** `zork_knowledge` table
- **Mutable By:** RAG/Knowledge System (via MCP tools, ZORK actions, Cursor)

**File References:**
- `database.js` - Database functions show data ownership
- `handlers/game.js` - Handler implementations show mutation patterns
- `services/npcCycleEngine.js` - Harvest engine state management

---

## 11. Describe required invariants all systems must obey.

**Answer:**

**Data Integrity Invariants:**
1. **Player location:** `players.current_room_id` must reference valid `rooms.id`
2. **Room coordinates:** `rooms.x, y` must be within `maps.width, height`
3. **Item references:** All `item_name` in `player_items`, `room_items`, etc. must exist in `items.name`
4. **NPC references:** `room_npcs.npc_id` must reference valid `scriptable_npcs.id`
5. **Map connections:** `rooms.connected_map_id` must reference valid `maps.id` (if not null)
6. **Vitalis bounds:** `players.resource_vitalis` must be ≤ `players.resource_max_vitalis` and ≥ 0
7. **Encumbrance:** Total item encumbrance in `player_items` must not exceed `players.resource_max_encumbrance` (enforced on take, not continuously)

**State Machine Invariants:**
8. **Harvest sessions:** Only one active harvest session per player at a time
9. **Harvest state:** `room_npcs.state.harvest_active` must be boolean, `harvesting_player_id` must reference valid player (if harvest_active=true)
10. **Cooldown state:** `room_npcs.state.cooldown_until` must be > current time if cooldown active

**System Boundary Invariants:**
11. **God-mode access:** All editor operations require `players.flag_god_mode = 1`
12. **Room-type gates:** Bank commands only work in `room_type = 'bank'`, merchant commands only in `room_type = 'merchant'`, warehouse commands only in `room_type = 'warehouse'`
13. **Session authentication:** All WebSocket messages (except `authenticateSession`) require valid `connectionId` in `connectedPlayers` Map

**Formula Invariants:**
14. **Formula consistency:** All stat-driven calculations must use `utils/harvestFormulas.js` functions
15. **Stat ranges:** Stats must be within configured min/max ranges for formulas (enforced by `calculateExponentialCurve`)

**Communication Invariants:**
16. **Message format:** All WebSocket messages must be valid JSON with `type` field
17. **Broadcast scope:** Room broadcasts only sent to players in that room
18. **Private messages:** Telepath messages only sent to sender and recipient

**File References:**
- `database.js:408-437` - Vitalis validation example
- `handlers/game.js` - Room-type gate checks
- `utils/harvestFormulas.js` - Formula consistency
- `services/npcCycleEngine.js` - Harvest session invariants

---

## 12. Define how editors interact with runtime systems.

**Answer:**

**Direct Database Access:**
- Editors **directly modify** database tables via `database.js` functions
- **No staging:** Changes are immediate and persistent (no draft/preview system)
- **No undo:** Deletions are permanent (no undo system)

**God-Mode Verification:**
- All editor handlers verify `flag_god_mode = 1` before allowing operations
- Verification via `verifyGodMode()` utility function
- Failed verification returns error message, no operation performed

**Editor Types:**
- **Map Editor:** Modifies `maps`, `rooms` tables. Can create/update/delete rooms, connect maps, set room types, manage merchant inventory, manage room items.
- **NPC Editor:** Modifies `scriptable_npcs`, `room_npcs` tables. Can create/update NPC definitions, place/remove NPCs in rooms.
- **Item Editor:** Modifies `items`, `merchant_items` tables. Can create/update items, manage merchant inventory.
- **Player Editor:** Modifies `players`, `player_items` tables. Can update player stats, manage inventory.
- **Crafting Editor:** Modifies `factory_recipes` table. Can create/update/delete recipes.

**Runtime System Interaction:**
- **Immediate Effect:** Editor changes take effect immediately in runtime systems
- **No Validation:** Editors bypass game logic validation (e.g., can set invalid stats, create impossible items)
- **State Sync:** Runtime systems read from database on next operation (no cache invalidation needed for most systems)

**Broadcast Updates:**
- **Map Editor:** Broadcasts room updates to all connected players when rooms change
- **NPC Editor:** No automatic broadcasts (players see changes on next room update)
- **Item Editor:** No automatic broadcasts
- **Player Editor:** Sends `playerStats` update to affected player if connected

**File References:**
- `handlers/mapEditor.js` - Map editor implementation
- `handlers/npcEditor.js` - NPC editor implementation
- `handlers/itemEditor.js` - Item editor implementation
- `handlers/playerEditor.js` - Player editor implementation
- `handlers/craftingEditor.js` - Crafting editor implementation
- `utils/broadcast.js:verifyGodMode` - God-mode verification

---

## 13. Specify boundaries between frontend and backend responsibilities.

**Answer:**

**Backend Responsibilities:**
- **All game logic:** Movement validation, harvest processing, crafting, formulas, pathfinding calculations
- **Data validation:** Input validation, constraint checking, business rule enforcement
- **State management:** Database writes, state transitions, session management
- **Security:** Authentication, authorization, god-mode checks, rate limiting
- **Broadcasting:** Room updates, message routing, multi-player synchronization

**Frontend Responsibilities:**
- **UI rendering:** All visual display, component lifecycle, widget management
- **User input:** Command parsing, normalization, sending to server
- **Client-side UX:** Idle detection, auto-look, path preview rendering, widget toggling
- **Markup parsing:** Client-side markup parsing for all displayed text (server also parses for server-generated messages)
- **Connection management:** WebSocket connection, reconnection logic, heartbeat

**Shared Responsibilities:**
- **Message format:** Both sides must agree on WebSocket message JSON structure
- **Markup conventions:** Both sides parse same markup syntax (client: `Markup.js`, server: `markupService.js`)
- **Widget state:** Server stores in database, client displays and syncs changes

**Boundary Rules:**
1. **No client-side game logic:** Client never calculates formulas, validates movement, or processes harvest cycles
2. **No server-side UI:** Server never renders HTML, manages DOM, or handles user interactions
3. **Server is source of truth:** Client displays server state, never maintains authoritative game state
4. **Client can cache:** Client can cache data for performance (e.g., map data, item definitions) but must refresh on server updates

**File References:**
- `public/js/core/Game.js` - Client responsibilities
- `handlers/game.js` - Backend responsibilities
- `public/js/utils/Markup.js` - Client markup parsing
- `utils/markupService.js` - Server markup parsing

---

## 14. Declare if any systems must remain stateless.

**Answer:**

**Stateless Systems:**
1. **Formula System:** Pure functions, no state. All calculations are deterministic based on inputs (stat values, config). Located in `utils/harvestFormulas.js`.
2. **Pathfinding System:** Pure BFS algorithm, no state. Calculates paths on-demand. Located in `utils/pathfinding.js`.
3. **Markup Parsing:** Pure parsing functions, no state (client: `Markup.js`, server: `markupService.js`). Conventions loaded from database but parsing itself is stateless.

**Stateful Systems:**
- **All other systems** maintain state (database, in-memory Maps, session state, etc.)

**Stateless Design Pattern:**
- **Utility modules** (`utils/`) are designed to be stateless where possible
- **Service modules** (`services/`) are stateful (NPC cycle engine maintains harvest session state, room update timer maintains per-player intervals)

**File References:**
- `utils/harvestFormulas.js` - Stateless formula functions
- `utils/pathfinding.js` - Stateless pathfinding algorithm
- `services/npcCycleEngine.js` - Stateful service (maintains harvest session state)

---

## 15. State where formulas are resolved and who owns them.

**Answer:**

**Formula Resolution:**
- **Location:** `utils/harvestFormulas.js`
- **Resolution:** Server-side only (client never calculates formulas)
- **Pattern:** All formulas use `calculateExponentialCurve()` as base engine

**Formula Ownership:**
- **Owner:** Formula System (canonical specification in `docs/Chuck docs/10-14-formula-canonical-spec.md`)
- **Implementation:** `utils/harvestFormulas.js` contains all formula functions
- **Configuration:** `harvest_formula_config` table stores formula parameters (min/max stat, min/max value, curve exponent)

**Formula Usage:**
- **Harvest Engine:** Uses formulas for cycle time, hit rate, harvestable time, Vitalis drain (`services/npcCycleEngine.js`)
- **Attunement System:** Uses formulas for cooldown, delay, restoration (`handlers/game.js:attune`)
- **Pulse Echo System:** Uses formulas for yield, progression (`handlers/game.js:pulseEcho`)
- **Factory System:** Uses formulas for success rate, crit chance, speed, efficiency (`services/factoryCraftingEngine.js`)
- **Movement System:** Uses encumbrance-based movement delay (formula in `handlers/game.js:move`)

**Formula Invariants:**
- **Single source of truth:** All stat-driven calculations must use `harvestFormulas.js` functions
- **No duplicate math:** Systems cannot implement their own stat calculations
- **Config-driven:** Formula parameters stored in database, loaded at runtime

**File References:**
- `utils/harvestFormulas.js` - Formula implementation
- `docs/Chuck docs/10-14-formula-canonical-spec.md` - Formula specification
- `services/npcCycleEngine.js:10-16` - Harvest engine formula usage
- `services/factoryCraftingEngine.js` - Factory formula usage

---

## 16. Define how widgets relate to the architecture layer.

**Answer:**

**Widget System Architecture:**
- **Layer:** UI/Client layer (frontend components)
- **Base Class:** `Component.js` provides lifecycle methods (`init`, `update`, `destroy`)
- **Event System:** `MessageBus.js` provides pub/sub for component communication
- **State Management:** Widget visibility/config stored in `player_widget_config` table, synced server ↔ client

**Widget Types:**
1. **Toggleable Widgets:** Stats, Compass, Map, Comms, Warehouse, God Mode, Scripting, Rune Keeper. Player can show/hide via UI.
2. **Conditional Widgets:** NPC Widget (shows when NPCs in room), Factory Widget (shows when in factory room), Warehouse Widget (shows when in warehouse room with deed).

**Widget Integration:**
- **Server:** Sends widget state in `roomUpdate` messages (factory widget state, warehouse widget state)
- **Client:** Components subscribe to MessageBus events, update UI reactively
- **State Sync:** Client sends `updateWidgetConfig` to server, server stores in database, broadcasts to other windows

**Widget Boundaries:**
- **No game logic:** Widgets are pure UI components, no game logic
- **Server provides data:** Widgets display server state, never calculate game state
- **Event-driven:** Widgets react to MessageBus events, don't poll

**File References:**
- `public/js/components/` - Widget implementations
- `public/js/core/Component.js` - Base widget class
- `public/js/core/MessageBus.js` - Event system
- `docs/Chuck docs/10-13-widget-system.md` - Widget system specification
- `handlers/game.js:5339-5357` - Widget config handlers

---

## 17. Describe the extension model for future systems.

**Answer:**

**Current Extension Points:**
1. **Handler Registration:** Add handler function to `handlers/index.js:handlerMap`
2. **Component Registration:** Add component to `public/js/main.js`, initialize in entry point
3. **Widget Registration:** Add to `TOGGLEABLE_WIDGETS` array, create component class
4. **Database Migration:** Add migration file to `migrations/` directory, run via `scripts/migrate.js`
5. **Formula Extension:** Add new formula function to `utils/harvestFormulas.js`, use `calculateExponentialCurve()` base

**Extension Patterns:**
- **New Game System:** Create handler in `handlers/`, add to `handlerMap`, add database functions to `database.js`, add migrations
- **New Background Service:** Create service in `services/`, start in `server.js`, use interval timers
- **New Widget:** Create component class extending `Component.js`, subscribe to MessageBus events, register in `main.js`
- **New Editor:** Create handler in `handlers/`, add god-mode verification, add to `handlerMap`

**Limitations:**
- **No plugin system:** Extensions require code changes, no runtime plugin loading
- **No hook system:** No event hooks for systems to extend each other
- **No configuration-driven extensions:** All extensions are code-based

**Best Practices:**
- **Follow existing patterns:** New systems should follow same patterns as existing systems
- **Use canonical formulas:** New stat-driven mechanics must use `harvestFormulas.js`
- **Database-driven where possible:** Use database tables for configuration (e.g., `harvest_formula_config`, `markup_conventions`)
- **Document in 10-series:** New game systems should be documented using scrub methodology (`10-00-scrub-prompt-template.md`)

**File References:**
- `handlers/index.js:17-144` - Handler registration pattern
- `public/js/main.js` - Component registration pattern
- `docs/Chuck docs/10-00-scrub-prompt-template.md` - Documentation methodology

---

## 18. Specify canonical event propagation rules.

**Answer:**

**WebSocket Message Flow:**
1. **Client → Server:** Client sends JSON message → `handlers/index.js:dispatch()` → routes to handler → handler processes → handler sends response
2. **Server → Client:** Handler sends JSON message via `ws.send()` → client `Game.js` receives → emits to MessageBus → components subscribe and update

**Room Update Propagation:**
- **Trigger:** Player movement, NPC cycle produces items, room state changes
- **Scope:** Broadcast to all players in same room (`utils/broadcast.js:sendRoomUpdate`)
- **Format:** `roomUpdate` message with room data, players, NPCs, items, widget state

**Message Propagation:**
- **Talk:** Room-scoped, broadcast to all players in room
- **Resonate:** World-scoped, broadcast to all connected players
- **Telepath:** Player-scoped, sent only to sender and recipient

**Harvest Session Propagation:**
- **Updates:** Sent only to harvesting player (not broadcast to room)
- **Completion:** Broadcast to room when harvest ends (items produced)

**Widget State Propagation:**
- **Config Changes:** Client sends `updateWidgetConfig` → server stores in database → server sends `widgetConfig` to all windows of same player

**Editor Propagation:**
- **Map Editor:** Room changes broadcast `roomUpdate` to all players in affected rooms
- **Other Editors:** No automatic propagation (players see changes on next operation)

**Event Ordering:**
- **No guaranteed ordering:** Events are asynchronous, no strict ordering guarantees
- **Idempotent operations:** Systems should handle duplicate events gracefully

**File References:**
- `handlers/index.js:152-243` - Message dispatch
- `utils/broadcast.js` - Broadcasting utilities
- `utils/messageRouter.js` - Message routing
- `public/js/core/Game.js` - Client message handling

---

## 19. Define what is immutable vs runtime-modifiable.

**Answer:**

**Immutable (Definition-Time Only):**
1. **Item Definitions:** `items` table structure (name, description, type, encumbrance) - only editable via Item Editor (god-mode)
2. **NPC Definitions:** `scriptable_npcs` table structure (name, type, cycle time, formulas) - only editable via NPC Editor (god-mode)
3. **Map Structure:** `maps` table (name, width, height) - only editable via Map Editor (god-mode)
4. **Room Structure:** `rooms` table (name, description, coordinates, map_id) - only editable via Map Editor (god-mode)
5. **Factory Recipes:** `factory_recipes` table - only editable via Crafting Editor (god-mode)
6. **Formula Config:** `harvest_formula_config` table - only editable via NPC Editor formula config modal (god-mode)

**Runtime-Modifiable (Player Actions):**
1. **Player Stats:** `players.stat_*`, `players.ability_*` - modifiable via commands, editor, stat assignment
2. **Player Resources:** `players.resource_vitalis`, `players.pulse_echoes` - modifiable via gameplay
3. **Player Location:** `players.current_room_id` - modifiable via movement
4. **Player Inventory:** `player_items` - modifiable via take/drop/harvest/craft/buy/sell
5. **Room Items:** `room_items` - modifiable via NPC production, player drop/take
6. **NPC State:** `room_npcs.state` JSON - modifiable via harvest sessions, NPC cycles
7. **Merchant Inventory:** `merchant_items.current_qty` - modifiable via buy/sell, regeneration
8. **Warehouse Items:** `warehouse_items` - modifiable via store/withdraw
9. **Bank Balance:** `player_bank` - modifiable via deposit/withdraw
10. **Widget Config:** `player_widget_config` - modifiable via player UI

**Session State (Runtime Only):**
- **WebSocket Connections:** `connectedPlayers` Map - created/destroyed on connect/disconnect
- **Factory Widget State:** `factoryWidgetState` Map - per-connection, cleared on disconnect
- **Warehouse Widget State:** `warehouseWidgetState` Map - per-connection, cleared on disconnect
- **Harvest Sessions:** In-memory state in `room_npcs.state` JSON - created/destroyed on harvest start/end

**File References:**
- `database.js` - Database functions show mutation patterns
- `handlers/game.js` - Runtime modifications
- `handlers/mapEditor.js` - Definition-time modifications
- `services/npcCycleEngine.js` - Runtime state modifications

---

## 20. State the enforcement level: guideline, standard, or constitution.

**Answer:**

**Enforcement Level: CONSTITUTION**

**Rationale:**
- This document defines **fundamental architectural rules** that all systems must follow
- Violations of these rules would break system boundaries, create inconsistencies, or violate invariants
- These are **not suggestions** or **best practices** - they are **architectural requirements**

**Constitutional Rules (Must Always Be Followed):**
1. **System boundaries:** Systems must not directly access other systems' data (must go through owned system)
2. **Data ownership:** Only the owning system can mutate its data
3. **Formula consistency:** All stat-driven calculations must use `harvestFormulas.js`
4. **Server/client separation:** Client never calculates game logic, server never renders UI
5. **Authentication:** All WebSocket messages (except `authenticateSession`) require valid session
6. **God-mode access:** All editor operations require `flag_god_mode = 1`
7. **Room-type gates:** Commands must verify room type before execution
8. **Invariants:** All systems must maintain data integrity invariants

**Enforcement Mechanism:**
- **Code reviews:** Cursor must verify architectural compliance
- **Documentation:** 10-series specs must reference this document
- **Testing:** Systems should test boundary violations
- **Linting:** Future tooling could enforce some rules (e.g., formula usage)

**File References:**
- `docs/Chuck docs/00-README.md:152-156` - Cursor must consult 10-series (which references this document)
- `.cursorrules` - Cursor workflow rules reference architectural patterns

---

# 🏁 End of 20-system-architecture.md

This document serves as the **architectural constitution** for The Game. All system implementations, documentation, and extensions must align with these definitions.

