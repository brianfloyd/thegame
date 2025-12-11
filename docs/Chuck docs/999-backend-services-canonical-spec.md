# Backend Services One-Liner Canonical Questions - Canonical Spec

**Generated:** Based on codebase analysis  
**Methodology:** Code-grounded analysis following scrub prompt template  
**Scope:** All backend services in `services/` directory and related utilities

---

## 1. Define the canonical purpose of each backend service.

### `services/npcCycleEngine.js`
**Purpose:** Handles NPC tick loops, harvest sessions, and periodic room updates. Processes NPC cycles on a timer (1 second interval) independent of player actions.

**Evidence:**
- File: `services/npcCycleEngine.js:1-6`
- Function: `startNPCCycleEngine` (line 434)
- Interval: `NPC_TICK_INTERVAL = 1000` (line 25)

### `services/ticketService.js`
**Purpose:** Centralized async service layer for all ticket operations. Provides CRUD operations, auto-refresh polling, and ticket filtering for both Ticket Editor and TicketsWidget.

**Evidence:**
- File: `services/ticketService.js:1-8`
- Functions: `fetchTickets`, `createTicket`, `updateTicket`, `deleteTicket` (lines 28-169)

### `services/factoryCraftingEngine.js`
**Purpose:** Handles success rate calculations, critical hit chances, overcharge bonuses, and craft roll execution for the factory crafting system.

**Evidence:**
- File: `services/factoryCraftingEngine.js:1-6`
- Functions: `calculateSuccessRate`, `calculateCriticalChance`, `rollCraft`, `executeCraft` (lines 59-384)

### `services/factoryOutputRouter.js`
**Purpose:** Handles routing of crafted items to player inventory or room floor. Also handles event emission for factory crafting events.

**Evidence:**
- File: `services/factoryOutputRouter.js:1-5`
- Functions: `routeOutputs`, `emitFactoryEvent` (lines 93-193)

### `services/factoryQuirks.js`
**Purpose:** Handles factory quirk definitions and modifier applications (stable, chaotic, attuned, worn).

**Evidence:**
- File: `services/factoryQuirks.js:1-11`
- Functions: `getFactoryQuirk`, `applyQuirkToSuccessRate`, `applyQuirkToSpeed` (lines 82-256)

### `services/factoryRecipeMatcher.js`
**Purpose:** Handles recipe matching for the factory crafting system. Supports exact matching, rune substitution, wildcard runes, and tier validation.

**Evidence:**
- File: `services/factoryRecipeMatcher.js:1-9`
- Functions: `matchSingleRecipe`, `findMatchingRecipe` (lines 241-327)

### `services/factoryRuneSystem.js`
**Purpose:** Handles rune type detection, slot validation, and modifier calculations for the factory crafting system.

**Evidence:**
- File: `services/factoryRuneSystem.js:1-12`
- Functions: `validateSlotPlacement`, `calculateSpeedModifier`, `calculateEfficiencyModifier` (lines 67-284)

### `services/factoryAutomation.js`
**Purpose:** STUB - Placeholder functions for future automation features. Not implemented.

**Evidence:**
- File: `services/factoryAutomation.js:1-13`
- All functions are stubs with `console.log('[factoryAutomation] ... - STUB (not implemented)')` (lines 21-135)

---

## 2. List all backend services that must exist.

**Required Services (Implemented):**
1. `npcCycleEngine.js` - Required for NPC processing
2. `ticketService.js` - Required for ticket management
3. `factoryCraftingEngine.js` - Required for factory crafting
4. `factoryOutputRouter.js` - Required for factory output routing
5. `factoryQuirks.js` - Required for factory quirks
6. `factoryRecipeMatcher.js` - Required for recipe matching
7. `factoryRuneSystem.js` - Required for rune system

**Optional Services (Stubs):**
8. `factoryAutomation.js` - Stub, not required for operation

**Evidence:**
- Directory listing: `services/` contains 8 files
- Import statements in `server.js:47-52` show `npcCycleEngine` is required
- Factory services imported in `handlers/game.js` (factory crafting handlers)

---

## 3. State which services are stateless vs stateful.

### Stateless Services:
- `factoryCraftingEngine.js` - Pure calculation functions, no internal state
- `factoryQuirks.js` - Pure quirk definition and modifier functions
- `factoryRecipeMatcher.js` - Pure matching logic, no state
- `factoryRuneSystem.js` - Pure rune validation and calculation functions
- `factoryOutputRouter.js` - Pure routing logic, no internal state
- `ticketService.js` - Stateless CRUD operations (state in database)

**Evidence:**
- No module-level variables or closures storing state
- All functions are pure or async database operations

### Stateful Services:
- `npcCycleEngine.js` - Maintains:
  - `globalConnectedPlayers` (line 413)
  - `playerLastRoomUpdate` Map (line 1054)
  - `playerIntervalCache` Map (line 1058)
  - `GLOBAL_ROOM_UPDATE_INTERVAL` (line 1124)
  - Auto-refresh interval timer (line 442)

- `ticketService.js` - Maintains:
  - `autoRefreshInterval` (line 13)
  - `autoRefreshCallback` (line 14)

**Evidence:**
- `services/npcCycleEngine.js:413-432` - Module-level state variables
- `services/ticketService.js:13-14` - Module-level state for auto-refresh

---

## 4. Specify communication patterns between services.

### Direct Function Calls (Synchronous/Async):
- Factory services call each other directly:
  - `factoryCraftingEngine.js` imports `factoryQuirks.js` (line 9)
  - `factoryCraftingEngine.js` imports `factoryRuneSystem.js` (line 10)
  - `factoryCraftingEngine.js` imports `factoryRecipeMatcher.js` (line 11)
  - `factoryRecipeMatcher.js` imports `factoryRuneSystem.js` (line 13)

**Evidence:**
- `services/factoryCraftingEngine.js:9-11` - Import statements
- `services/factoryRecipeMatcher.js:13` - Import statement

### Database-Mediated Communication:
- All services communicate via `database.js` module
- Services read/write shared database state

**Evidence:**
- All service functions accept `db` parameter
- `services/npcCycleEngine.js:434` - `startNPCCycleEngine(db, ...)`
- `services/ticketService.js:28` - `fetchTickets(db, filters)`

### Shared State References:
- `npcCycleEngine` receives `connectedPlayers` Map reference from `server.js`
- Reference stored at module level and refreshed periodically

**Evidence:**
- `services/npcCycleEngine.js:416-432` - Reference management functions
- `server.js:385` - Passes `connectedPlayers` to `startNPCCycleEngine`

### Event Emission (Factory System):
- `factoryOutputRouter` emits events to database via `db.logFactoryEvent()`

**Evidence:**
- `services/factoryOutputRouter.js:173-193` - `emitFactoryEvent` function
- Events: `FACTORY_CRAFT_STARTED`, `FACTORY_CRAFT_SUCCESS`, `FACTORY_CRAFT_FAILED`, `FACTORY_CRAFT_FIZZLE`, `FACTORY_OUTPUT_CREATED`

---

## 5. Define the authoritative source of truth for each data type.

### NPC State:
- **Source of Truth:** `room_npcs` table, `state` JSONB column
- **Service:** `npcCycleEngine.js`
- **Evidence:** `services/npcCycleEngine.js:102-161` - `endHarvestSession` reads/writes `room_npcs.state`

### Ticket Data:
- **Source of Truth:** `debug_todos` table
- **Service:** `ticketService.js`
- **Evidence:** `services/ticketService.js:40` - `db.listDebugTodos()`, `db.getDebugTodo()`, `db.createDebugTodo()`

### Factory Recipes:
- **Source of Truth:** `crafting_recipes` table
- **Service:** `factoryRecipeMatcher.js` (reads), `handlers/craftingEditor.js` (writes)
- **Evidence:** Recipes passed as parameters to `matchSingleRecipe` (line 241)

### Factory Room Quirks:
- **Source of Truth:** `rooms` table, `factory_quirks` JSONB column
- **Service:** `factoryQuirks.js`
- **Evidence:** `services/factoryQuirks.js:82-112` - `getFactoryQuirk` reads from `room.factory_quirks`

### Factory Events:
- **Source of Truth:** `factory_events` table (assumed, not found in codebase)
- **Service:** `factoryOutputRouter.js`
- **Evidence:** `services/factoryOutputRouter.js:188` - `db.logFactoryEvent()`

### Connected Players:
- **Source of Truth:** `connectedPlayers` Map in `server.js`
- **Service:** `npcCycleEngine.js` (reads), `server.js` (writes)
- **Evidence:** `server.js:143` - `connectedPlayers` Map declaration
- `services/npcCycleEngine.js:413` - Module-level reference

### Player Room Update Intervals:
- **Source of Truth:** `players` table, `room_update_interval_ms` column
- **Service:** `npcCycleEngine.js`
- **Evidence:** `services/npcCycleEngine.js:1067-1114` - `getPlayerRoomUpdateInterval` reads from database

---

## 6. Declare which services may read/write the database.

### Services with Database Read/Write Access:

**`npcCycleEngine.js`:**
- **Reads:** `getAllActiveNPCs()`, `getScriptableNPCById()`, `getPlayerById()`, `getRoomById()`, `getHarvestFormulaConfig()`, `getPlayerCurrentEncumbrance()`, `getItemEncumbrance()`
- **Writes:** `updateNPCState()`, `addRoomItem()`, `addPlayerItem()`, `addPulseEchoes()`, `checkAndApplyTierProgression()`
- **Evidence:** `services/npcCycleEngine.js:471` - `db.getAllActiveNPCs()`, line 160 - `db.updateNPCState()`

**`ticketService.js`:**
- **Reads:** `listDebugTodos()`, `getDebugTodo()`, `getDebugTodosWithSession()`, `getOpenTickets()`
- **Writes:** `createDebugTodo()`, `updateDebugTodo()`, `addTicketTag()`
- **Evidence:** `services/ticketService.js:40` - `db.listDebugTodos()`, line 103 - `db.createDebugTodo()`

**`factoryOutputRouter.js`:**
- **Reads:** `getItemByName()`, `getItemEncumbrance()`, `getPlayerCurrentEncumbrance()`
- **Writes:** `addRoomItem()`, `addPlayerItem()`, `logFactoryEvent()`
- **Evidence:** `services/factoryOutputRouter.js:19-82` - Routing functions call database methods

**Factory Services (Read-Only for Recipes):**
- `factoryCraftingEngine.js` - No direct database access (receives data as parameters)
- `factoryQuirks.js` - No direct database access (reads from room object)
- `factoryRecipeMatcher.js` - No direct database access (receives recipes as parameters)
- `factoryRuneSystem.js` - No direct database access (pure calculations)

**Evidence:**
- No `db` parameter in factory calculation services
- All database operations in `handlers/game.js` factory handlers

---

## 7. Specify error-handling expectations for all services.

### Error Handling Patterns:

**Try-Catch Blocks:**
- `npcCycleEngine.js` - Wraps cycle processing in try-catch (line 442-1046)
- `ticketService.js` - Wraps all async functions in try-catch (lines 38-67, 76-84, etc.)
- `factoryOutputRouter.js` - Wraps `emitFactoryEvent` in try-catch (line 187-192)

**Evidence:**
- `services/npcCycleEngine.js:1044-1046` - Outer try-catch for cycle engine
- `services/ticketService.js:64-67` - Error handling in `fetchTickets`

**Error Logging:**
- All services use `console.error()` for errors
- No structured logging system found

**Evidence:**
- `services/npcCycleEngine.js:1045` - `console.error('Error in NPC cycle engine:', err)`
- `services/ticketService.js:65` - `console.error('[TicketService] Error fetching tickets:', error)`

**Error Propagation:**
- Services throw errors to callers (no error recovery)
- Database errors propagate up

**Evidence:**
- `services/ticketService.js:66` - `throw error;`
- `services/factoryOutputRouter.js:191` - Returns `null` on error, logs error

**Missing Error Handling:**
- No retry logic found
- No timeout handling found
- No circuit breaker pattern found
- No error metrics/observability

---

## 8. Define authentication/authorization requirements.

### Service-Level Authorization:

**No Service-Level Auth:**
- All services are internal modules, called directly by handlers
- No authentication checks within services themselves

**Evidence:**
- No auth middleware in service files
- Services accept `db` and data parameters directly

**Handler-Level Authorization:**
- Authorization enforced in `handlers/` and `routes/api.js`
- God mode checks in handlers, not services

**Evidence:**
- `routes/api.js:520` - `checkGodMode` middleware for editors
- `handlers/game.js` - God mode checks for commands

**Database-Level Authorization:**
- Database connection uses connection string (no per-query auth)
- Row-level security not found in codebase

---

## 9. State how services expose their APIs (REST, events, internal modules).

### Internal Module Exports (CommonJS):

**All services use `module.exports`:**
- `npcCycleEngine.js` - Exports: `startNPCCycleEngine`, `endHarvestSession`, `findPlayerHarvestSession`, etc. (line 1210-1223)
- `ticketService.js` - Exports: `fetchTickets`, `createTicket`, `updateTicket`, etc. (line 347-361)
- `factoryCraftingEngine.js` - Exports calculation functions (line 415-432)
- `factoryOutputRouter.js` - Exports routing functions (line 369-388)
- `factoryQuirks.js` - Exports quirk functions (line 258-279)
- `factoryRecipeMatcher.js` - Exports matching functions (line 402-417)
- `factoryRuneSystem.js` - Exports rune functions (line 352-372)

**Evidence:**
- All service files end with `module.exports = { ... }`
- Imported via `require()` in handlers and server.js

### No REST APIs:
- Services are not exposed as HTTP endpoints
- Only internal function calls

### No Event System:
- No event emitter pattern found
- Factory events logged to database, not emitted to listeners

**Evidence:**
- `services/factoryOutputRouter.js:173` - `emitFactoryEvent` writes to database, doesn't emit events

---

## 10. List required utilities shared across services.

### Utility Modules in `utils/`:

**Required by Services:**
1. **`harvestFormulas.js`** - Used by `npcCycleEngine.js`
   - Functions: `calculateCycleTimeMultiplier`, `checkHarvestHit`, `getHarvestFormulaConfig`, `applyVitalisDrainReduction`, `calculatePulseEchoYield`, `checkAndApplyTierProgression`
   - **Evidence:** `services/npcCycleEngine.js:9-16` - Import statements

2. **`vitalisHelpers.js`** - Used by `npcCycleEngine.js`
   - Functions: `applyVitalisDrain`, `checkVitalisDepletion`
   - **Evidence:** `services/npcCycleEngine.js:18-21` - Import statements

3. **`broadcast.js`** - Used by `npcCycleEngine.js`
   - Functions: `sendPlayerStats`
   - **Evidence:** `services/npcCycleEngine.js:22` - Import statement

4. **`messageCache.js`** - Used by `npcCycleEngine.js`
   - Functions: `getFormattedMessage`
   - **Evidence:** `services/npcCycleEngine.js:17` - Import statement

**Not Used by Services (Used by Handlers/Server):**
5. `email.js` - Email service (used by routes)
6. `markupService.js` - Markup processing (used by handlers)
7. `messageRouter.js` - Message routing (used by handlers)
8. `pathfinding.js` - Pathfinding (used by handlers)
9. `zorkFlag.js` - ZORK flag management (used by handlers)
10. `zorkKnowledge.js` - RAG system (used by handlers)

**Evidence:**
- Directory listing shows 10 utility files
- Only 4 are imported by services
- Others imported by `handlers/` or `server.js`

---

## 11. Define logging and observability standards.

### Logging Patterns:

**Console Logging Only:**
- All services use `console.log()`, `console.error()`, `console.warn()`
- No structured logging framework found
- No log levels (INFO, DEBUG, WARN, ERROR)

**Evidence:**
- `services/npcCycleEngine.js:132` - `console.log('[endHarvestSession] ...')`
- `services/ticketService.js:65` - `console.error('[TicketService] Error ...')`

**Log Prefixes:**
- Services use prefixes: `[NPC Cycle]`, `[TicketService]`, `[factoryAutomation]`
- Inconsistent formatting

**Evidence:**
- `services/npcCycleEngine.js:132` - `console.log('[endHarvestSession] ...')`
- `services/ticketService.js:323` - `console.log('[TicketService] Auto-refresh started ...')`

**No Observability:**
- No metrics collection found
- No performance monitoring found
- No distributed tracing found
- No health check endpoints for services

**Missing:**
- Structured logging (JSON format)
- Log aggregation
- Performance metrics
- Error rate tracking
- Service health endpoints

---

## 12. Specify how services scale or parallelize work.

### No Parallelization Found:

**Sequential Processing:**
- `npcCycleEngine` processes NPCs sequentially in loop (line 474)
- `ticketService` processes tickets sequentially
- Factory services process one craft at a time

**Evidence:**
- `services/npcCycleEngine.js:474` - `for (const roomNpc of activeNPCs)` - sequential loop
- No `Promise.all()` or parallel processing found

**Single Process:**
- All services run in single Node.js process
- No worker threads found
- No cluster mode found

**Evidence:**
- `server.js` - Single Express server
- No `cluster` module imports
- No `worker_threads` usage

**Scaling Limitations:**
- NPC cycle engine runs on fixed 1-second interval
- No horizontal scaling support
- State stored in memory (not shared across processes)

**Evidence:**
- `services/npcCycleEngine.js:25` - `NPC_TICK_INTERVAL = 1000`
- `services/npcCycleEngine.js:413` - Module-level state variables

---

## 13. Declare caching rules and cache ownership.

### Caching Found:

**`npcCycleEngine.js` Caches:**
- `playerIntervalCache` - Caches player room update intervals (line 1058)
- TTL: 60 seconds (line 1059)
- Cache key: `connectionId` or `player_${playerId}` (line 1075)

**Evidence:**
- `services/npcCycleEngine.js:1058-1114` - Cache implementation
- `services/npcCycleEngine.js:1059` - `CACHE_TTL = 60000`

**No Other Caching:**
- No cache for database queries
- No cache for recipes
- No cache for NPC definitions
- No cache for ticket data

**Cache Invalidation:**
- Cache invalidated on TTL expiration or player change (line 1079)
- No manual invalidation methods found

**Evidence:**
- `services/npcCycleEngine.js:1079` - Cache refresh logic

---

## 14. Define retry, timeout, and backoff behavior.

### No Retry Logic Found:
- No retry mechanisms in services
- Database errors propagate immediately
- No exponential backoff found

### No Timeout Handling:
- No timeout configuration found
- Database queries use default pg pool timeouts
- No service-level timeouts

**Evidence:**
- `database.js:14-16` - Pool config shows `connectionTimeoutMillis: 2000` (connection timeout only)
- No query timeouts found

### No Backoff Behavior:
- No backoff strategies found
- Services fail immediately on errors

**Missing:**
- Retry logic for transient failures
- Timeout configuration
- Circuit breaker pattern
- Rate limiting

---

## 15. State how services load or apply formulas.

### Formula Loading:

**`npcCycleEngine.js` Loads Formulas:**
- Calls `getHarvestFormulaConfig(db, 'cycle_time_reduction')` (line 508)
- Calls `getHarvestFormulaConfig(db, 'cooldown_time_reduction')` (line 139)
- Calls `getHarvestFormulaConfig(db, 'room_update_interval_ms')` (line 390)

**Evidence:**
- `services/npcCycleEngine.js:508` - `await getHarvestFormulaConfig(db, 'cycle_time_reduction')`
- `utils/harvestFormulas.js` - Contains `getHarvestFormulaConfig` function

**Formula Application:**
- Formulas applied via utility functions from `harvestFormulas.js`
- `calculateCycleTimeMultiplier` (line 510)
- `checkHarvestHit` (line 557)
- `applyVitalisDrainReduction` (line 243)

**Evidence:**
- `services/npcCycleEngine.js:9-16` - Imports from `harvestFormulas.js`
- Formulas calculated on-demand, not cached

**Factory Formulas:**
- Factory formulas in `config/factoryConfig.js`
- Loaded via `require('../config/factoryConfig')` (line 8 in factory services)

**Evidence:**
- `services/factoryCraftingEngine.js:8` - `const config = require('../config/factoryConfig')`
- Static configuration, not database-loaded

---

## 16. Define service boundaries and forbidden coupling.

### Service Boundaries:

**Factory Services (Tightly Coupled):**
- `factoryCraftingEngine` → `factoryQuirks`, `factoryRuneSystem`, `factoryRecipeMatcher`
- `factoryRecipeMatcher` → `factoryRuneSystem`
- All factory services share `factoryConfig.js`

**Evidence:**
- `services/factoryCraftingEngine.js:9-11` - Imports other factory services
- `services/factoryRecipeMatcher.js:13` - Imports `factoryRuneSystem`

**NPC Cycle Engine (Isolated):**
- Only depends on utilities (`harvestFormulas`, `vitalisHelpers`, `broadcast`, `messageCache`)
- No dependencies on other services

**Evidence:**
- `services/npcCycleEngine.js:9-22` - Only utility imports

**Ticket Service (Isolated):**
- Only depends on `models/ticket.js` and database
- No dependencies on other services

**Evidence:**
- `services/ticketService.js:10` - `const TicketModel = require('../models/ticket.js')`

### Forbidden Coupling (Not Found):
- No circular dependencies found
- Services don't import handlers
- Services don't import `server.js`

**Allowed Coupling:**
- Services can import utilities
- Services can import config files
- Services can import models

**Evidence:**
- No imports of `handlers/` or `server.js` in services
- Only utility and config imports

---

## 17. Specify how services initialize and lifecycle management.

### Initialization:

**`npcCycleEngine.js`:**
- Initialized by `server.js` calling `startNPCCycleEngine()` (line 385)
- Receives `db`, `npcLogic`, `connectedPlayers`, `sendRoomUpdate` parameters
- Sets up interval timer on initialization (line 442)

**Evidence:**
- `server.js:385` - `startNPCCycleEngine(db, npcLogic, connectedPlayers, sendRoomUpdateWrapper)`
- `services/npcCycleEngine.js:434-1050` - Initialization function

**`ticketService.js`:**
- No initialization function
- Functions called on-demand
- Auto-refresh started via `startAutoRefresh()` (line 300)

**Evidence:**
- `services/ticketService.js:300-324` - `startAutoRefresh` function

**Factory Services:**
- No initialization required
- Pure functions, called on-demand

**Evidence:**
- No initialization functions in factory services

### Lifecycle Management:

**No Shutdown Hooks:**
- No cleanup functions found
- No graceful shutdown handling
- Intervals not cleared on shutdown

**Evidence:**
- No `process.on('SIGTERM')` handlers in services
- Intervals run until process exits

**State Cleanup:**
- `npcCycleEngine` cleans up disconnected players from cache (line 1191-1201)
- No other cleanup found

**Evidence:**
- `services/npcCycleEngine.js:1191-1201` - Cache cleanup for disconnected players

---

## Summary

### Strengths:
- Clear service boundaries (factory services grouped, others isolated)
- Stateless design for most services (except npcCycleEngine and ticketService)
- Direct function calls (simple, no over-engineering)
- Database as single source of truth for most data

### Weaknesses:
- No error recovery/retry logic
- No timeout handling
- No observability/metrics
- Sequential processing (no parallelization)
- No graceful shutdown
- Inconsistent logging (console.log only)
- Module-level state in npcCycleEngine (hard to test)

### Risks:
- NPC cycle engine state not shared across processes (can't scale horizontally)
- No retry logic for transient database failures
- No timeout protection for long-running operations
- Cache in npcCycleEngine could become stale
- Factory automation service is stub (referenced but not implemented)

### Missing Features:
- Factory automation (stub only)
- Service health checks
- Performance monitoring
- Distributed tracing
- Structured logging
- Retry/backoff strategies
- Timeout configuration
- Graceful shutdown

