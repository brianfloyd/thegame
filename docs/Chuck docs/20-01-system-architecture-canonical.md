# 200 — **Canonical System Architecture Specification**
_The authoritative architectural definition for all future Cursor‑driven development._

This document consolidates and formalizes all system‑level decisions extracted from your uploaded file (`999-system-architecture.md`). It is written for **Cursor**, ensuring it ALWAYS respects the true architecture of the game and never invents patterns, structures, or layers that do not exist.

---

# 1. **High‑Level Architecture Overview**
The game is built as a **real‑time multiplayer system** with:
- **Node.js backend server** (authoritative game state)
- **PostgreSQL database** (persistent world + player data)
- **WebSocket layer** (real‑time communication)
- **Browser client** (HTML/CSS/JS + custom widgets)

The architecture is message‑driven, event‑based, and tightly scoped. There is **one world**, one source of truth, and the server ALWAYS wins.

---

# 2. **Backend Server Responsibilities**
The backend is fully authoritative and is responsible for:
- Player connection lifecycle
- Command parsing and handling
- NPC cycle engine (1s interval)
- Harvest engine logic
- Attunement system
- Movement and navigation
- Item system and inventory logic
- Crafting and factory systems
- Room + map management
- God Mode editor systems
- Broadcasting game state updates

The server is **stateless per request** except for in‑memory structures like:
- Active WebSockets
- Connected players map
- NPC engine state
- Factory widget ephemeral state

Persistent truth lives in Postgres.

---

# 3. **Database Architecture (Canonical)**
PostgreSQL serves as the **single persistent data store**. Key tables include:
- `players`
- `rooms`
- `exits`
- `items`
- `player_items`
- `npcs`
- `scriptable_npcs`
- `room_items`
- `factory_recipes`
- `factory_quirks`
- `pulse_echoes`
- `session`

All reads/writes go through **database.js**, which provides safe CRUD wrappers.
Cursor must never write raw SQL unless it follows patterns already present.

---

# 4. **WebSocket Communication Layer**
All player <→ server interaction happens through:
- A single WebSocket endpoint
- "Handlers" mapped by command type
- Dedicated outbound message types (talked, telepath, systemMessage, loreKeeperMessage, npcEvent, stats updates, room updates, etc.)

Messages must always conform to canonical formats documented in the communication spec.
No new message types may be invented without explicit approval.

---

# 5. **Client Architecture**
The client is HTML + JS, architecture defined by:
- **Main game loop** powered by inbound WebSocket messages
- **UI Widgets** (StatsWidget, InventoryWidget, CommsWidget, MapWidget, FactoryWidget, NPCWidget, etc.)
- **Command parser** (client echoes commands to server)
- **Terminal output system**

Widgets do NOT contain game logic. They display server‑generated truth.

---

# 6. **Canonical Runtime Loops**
### 6.1 NPC Cycle Engine
- Runs every 1000 ms
- Processes active NPCs
- Runs harvest logic, cooldowns, yield events
- Emits npcEvent messages

### 6.2 Player Tick Systems
Players have **no autonomous tick** except:
- Movement cooldown checks
- Harvest progression (triggered by NPC engine)

### 6.3 Factory Crafting Engine
- Triggered by player actions only
- Stateless except ephemeral per‑connection widget state
- Reads crafting formulas + recipes from DB + config

---

# 7. **Command Architecture**
Every command:
1. Comes from client → server WebSocket
2. Is routed by handler name (`talk`, `move`, `take`, `attune`, `resonate`, `factoryCraft`, etc.)
3. Runs prechecks (rate limits, cooldowns, validation)
4. Executes game logic
5. Produces outbound messages

Commands must be:
- Deterministic
- Logged when relevant
- Modular (never cross‑contaminate subsystems)

---

# 8. **Subsystems (Canonical Responsibilities)**
This section declares responsibility boundaries Cursor MUST honor.

### 8.1 Movement System
- Validates exits
- Handles encumbrance delays
- Cancels harvest
- Updates room membership + sends room updates

### 8.2 Harvest System
- Driven by NPC engine
- Uses canonical formulas only
- Can be interrupted by movement, new commands, or room changes

### 8.3 Attunement System
- Uses 3 stat formulas
- Has cooldown, delay, and restore outcomes
- Sends systemMessages for all outcomes

### 8.4 Factory System
- Governs crafting, runes, quirks, overcharge
- Must use canonical crafting + rune formulas only
- Widget state is **ephemeral per tab**

### 8.5 Item System
- Manages inventory, rooms, take/drop, encumbrance
- All items reference DB definitions

### 8.6 Lorekeeper System
- NPC dialogue is separate from talk system
- Driven by `loreKeeperMessage`
- Keyword‑triggered

### 8.7 Pulse Echo System
- Manages yield + tier progression
- Formula‑driven

### 8.8 Player State Model
- Must use canonical schema
- No new fields may be added casually

---

# 9. **Editor Architecture (God Mode)**
Each editor is a **network tool** with:
- WebSocket command endpoints
- HTTP entrypoints
- CRUD operations through database.js
- Real‑time broadcast on change

Editors include:
- Room Editor
- NPC Editor
- Item Editor
- Map Editor
- Player Editor
- Factory Recipe Editor
- Potentially Formula Editor (future)

God Mode gating:
```
if (!player.isGodMode) deny()
```
No exceptions.

---

# 10. **Broadcasting Architecture**
Canonical broadcasting rules:
- Players inside a room receive room updates
- Adjacent rooms receive exit changes
- All players receive world broadcasts (`resonated`)
- Only intended recipients receive `telepath` and `message`
- UI widgets reevaluate state upon receiving updates

Cursor must always use existing broadcast utilities:
- `broadcastToRoom()`
- `broadcastToAll()`
- `sendPlayerStats()`
- `sendRoomUpdate()`

No new broadcast patterns may be invented without approval.

---

# 11. **Global Formula Integration**
All systems must use the canonical formulas defined in **10.14 — Global Formula Spec**.
Cursor must:
- Never duplicate math logic
- Never embed formula variations locally
- Always reference the universal formula engine

---

# 12. **Error Handling Rules**
The system must:
- Fail gracefully
- Emit `systemMessage` when errors affect the player
- Log internal errors but not expose stack traces to the client

Cursor must follow this pattern when extending handlers.

---

# 13. **Security Principles**
- Server is authoritative
- Never trust client input
- All destructive actions require God Mode
- WebSocket messages must be validated for type + schema
- SQL must use parameterized queries

---

# 14. **Performance Requirements**
- NPC engine must run within 1s interval
- No blocking operations inside tick loops
- Batch DB reads when possible
- Teleports, room edits, and crafting must resolve in <100ms

Cursor must optimize accordingly.

---

# 15. **Architectural Invariants (Unbreakable Rules)**
1. Server always wins
2. One world, one NPC engine
3. DB is the only persistent truth
4. Stats and formulas are global and canonical
5. Editors require God Mode
6. Client displays — server decides
7. All systems must be event‑based, not polling

Cursor may NEVER violate these invariants.

---

# 16. **TL;DR**
This document defines the **true architecture of the entire game**. Cursor must use this as the governing blueprint for all implementation work, refactoring, editor development, formula modifications, and subsystem expansion.

**If any new system conflicts with this document, this document wins.**

