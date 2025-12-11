# 220 — Canonical Backend Services Specification
_For Cursor and future AI work on server-side services_

This document turns the analysis in **`999-backend-services-canonical-spec.md`** into a single, enforceable spec for how backend services under `services/` behave and how they are allowed to evolve.

Cursor must treat this file as **law** for anything touching backend services.

---

## 1. Service Inventory & Single-Sentence Purpose

All services live under `services/`.

**Canonical list:**
1. `npcCycleEngine.js` — Drives the NPC tick loop, harvest sessions, and periodic room/player updates.
2. `ticketService.js` — Provides CRUD and auto-refresh for debug tickets and todo items.
3. `factoryCraftingEngine.js` — Computes factory crafting odds (success, crit, overcharge) and runs craft resolution rolls.
4. `factoryOutputRouter.js` — Delivers crafted outputs to the correct destination (player inventory vs. room floor) and logs factory events.
5. `factoryQuirks.js` — Defines factory quirk types and applies their numeric effects to crafting.
6. `factoryRecipeMatcher.js` — Matches player inputs and rune configurations to a single valid factory recipe.
7. `factoryRuneSystem.js` — Validates runes in slots and computes rune-based stat modifiers.
8. `factoryAutomation.js` — Stub for future factory automation; present but **not implemented**.

No new services may be added without also updating this inventory.

---

## 2. Stateless vs Stateful Services

### 2.1 Stateful Services

These services hold module-level state and therefore have lifecycle considerations:

- **`npcCycleEngine.js`**
  - Holds:
    - `globalConnectedPlayers` reference (Map from `server.js`)
    - `playerLastRoomUpdate` cache
    - `playerIntervalCache` for room update frequency
    - Interval ID for the 1s NPC tick loop
  - Owns the NPC cycle timer and is responsible for cleaning up cache entries for disconnected players.

- **`ticketService.js`**
  - Holds:
    - `autoRefreshInterval` timer ID
    - `autoRefreshCallback`
  - Controls optional ticket auto-refresh polling.

### 2.2 Stateless Services

These services are pure or database-driven with no module-level game state:

- `factoryCraftingEngine.js`
- `factoryOutputRouter.js` (stateless in-game, though it writes to DB)
- `factoryQuirks.js`
- `factoryRecipeMatcher.js`
- `factoryRuneSystem.js`
- `factoryAutomation.js` (stub logging only)

**Rule:** Stateless services must remain stateless; any introduction of module-level state must be explicitly documented and justified here first.

---

## 3. Service Boundaries & Responsibilities

### 3.1 `npcCycleEngine.js`

**Purpose:** Central heartbeat for NPC-driven systems.

**Responsibilities:**
- Run NPC cycles on a fixed interval (1s)
- Manage harvest sessions (start/end, hit checks, yields, cooldowns)
- Update NPC state (`room_npcs.state` JSONB)
- Spawn items into rooms or deliver them to players via DB calls
- Apply Vitalis drain and check depletion via helpers
- Fire room/player updates on configured intervals

**Non-responsibilities (MUST NOT DO):**
- Player command handling
- Factory crafting or recipes
- Ticket CRUD
- Frontend-specific logic or formatting

---

### 3.2 `ticketService.js`

**Purpose:** Async helper layer for **debug tickets / todos** across Ticket Editor and TicketsWidget.

**Responsibilities:**
- List, create, update, delete debug tickets via DB model(s)
- Filter tickets by status, owner, session
- Optional auto-refresh loop (server-side pull for editors/UI)

**Non-responsibilities:**
- Game state changes
- Permission enforcement (handled in routes/handlers)
- UI logic

---

### 3.3 `factoryCraftingEngine.js`

**Purpose:** House all **factory crafting math and resolution logic**.

**Responsibilities:**
- Compute success rate from:
  - Recipe base success
  - Weighted stat factor (Ingenuity, Resonance, Acumen)
  - Overcharge bonus
  - Quirk modifiers
- Compute critical chance from Resonance + Acumen
- Execute craft rolls (success, fail, crit, fizzle) deterministically from RNG
- Provide a single `executeCraft` entry point that returns a structured result

**Non-responsibilities:**
- Managing inventory, encumbrance, or item placement
- Persisting events (delegated to `factoryOutputRouter`)
- Fetching recipes from DB (handlers supply recipes as params)

---

### 3.4 `factoryOutputRouter.js`

**Purpose:** Move crafted outputs to correct location and log events.

**Responsibilities:**
- Given craft result + routing rules:
  - Add items to player inventory, respecting encumbrance
  - Or drop items into the room
- Call DB helpers to create items (`addPlayerItem`, `addRoomItem`)
- Log factory events via `db.logFactoryEvent()`

**Non-responsibilities:**
- Calculating success, crit, or overcharge (delegated to crafting engine)
- Performing permission checks
- Interacting with UI

---

### 3.5 `factoryQuirks.js`

**Purpose:** Define and apply factory room quirk effects.

**Responsibilities:**
- Provide quirk definitions (stable, chaotic, attuned, worn, etc.)
- Given a `room.factory_quirks` JSONB config, return the effective quirk object
- Provide helpers to adjust success rate and speed based on quirk

**Non-responsibilities:**
- Writing `factory_quirks` to DB (editors/DB handle this)
- Craft roll resolution

---

### 3.6 `factoryRecipeMatcher.js`

**Purpose:** Identify the correct recipe given player inputs and rune configuration.

**Responsibilities:**
- Support exact ingredient/rune matches
- Support wildcard runes and substitution rules
- Enforce recipe tier rules
- Resolve ambiguity to a single best match or fail clearly

**Non-responsibilities:**
- Actually performing the craft or consuming items
- Writing any DB state; recipes must be passed in

---

### 3.7 `factoryRuneSystem.js`

**Purpose:** Enforce rune rules and calculate rune-based modifiers.

**Responsibilities:**
- Validate rune type and allowed slots
- Determine which rune is **speed**, **efficiency**, or other types
- Compute speed and efficiency modifiers combining rune properties + player stats

**Non-responsibilities:**
- Persisting rune data to DB
- Recipe matching (beyond identifying rune types)

---

### 3.8 `factoryAutomation.js`

**Purpose:** Future automation, currently **stub-only**.

**Responsibilities (today):**
- Log clearly as STUB when called

**Rules:**
- Cursor must not treat this as implemented logic
- Any future implementation must be explicitly spec’d before coding

---

## 4. Communication & Data Flow

### 4.1 Allowed Communication Patterns

- **Direct imports and function calls** between factory services:
  - `factoryCraftingEngine` → `factoryQuirks`, `factoryRuneSystem`, `factoryRecipeMatcher`
  - `factoryRecipeMatcher` → `factoryRuneSystem`

- **Database-mediated communication** for shared state:
  - All services that touch game/world state use `database.js` helpers

- **Shared references** for NPC engine:
  - `npcCycleEngine` receives and holds a reference to `connectedPlayers` Map from `server.js`

### 4.2 Forbidden Patterns

- No service may import from `handlers/` or `server.js`
- No service may directly know about WebSocket implementation
- No service may emit events to the frontend; only handlers/broadcast utilities may do that

**Rule:** Services are **backend-only helpers**; they output values and DB mutations, not UI instructions.

---

## 5. Database Access Rules

### 5.1 Services With DB Read/Write

- `npcCycleEngine.js`
  - Reads: active NPCs, NPC definitions, player stats, rooms, formula configs, encumbrance
  - Writes: NPC state, room items, player items, pulse echoes, progression

- `ticketService.js`
  - Reads: ticket lists, single tickets, tickets by session
  - Writes: create/update tickets, add tags

- `factoryOutputRouter.js`
  - Reads: item definitions, encumbrance, current inventory
  - Writes: player items, room items, factory events

### 5.2 Services Without Direct DB Access

These must be pure function-style services:
- `factoryCraftingEngine.js`
- `factoryQuirks.js`
- `factoryRecipeMatcher.js`
- `factoryRuneSystem.js`
- `factoryAutomation.js` (stub)

**Rule:** If a service currently does not take a `db` parameter, Cursor must **not** add direct DB calls to it.

---

## 6. Error Handling & Logging

### 6.1 Current Canonical Patterns

- Use `try/catch` around top-level async operations (ticks, ticket fetches, event logging)
- Log failures via `console.error('[ServiceName] message', error)`
- Return `null` or rethrow errors depending on context

### 6.2 What’s Missing (Known Gaps)

These are **known weaknesses**, not bugs:
- No retries
- No timeouts
- No backoff logic
- No structured logging or metrics

Cursor must:
- Preserve existing patterns
- May add clearer error messages
- Must not silently swallow errors

---

## 7. Formula Loading & Application Rules

### 7.1 Harvest/NPC Formulas

- All harvest/attunement/pulse formulas live in `utils/harvestFormulas.js`
- `npcCycleEngine` must call:
  - `getHarvestFormulaConfig(db, key)` for dynamic config
  - `calculateCycleTimeMultiplier`, `checkHarvestHit`, `calculatePulseEchoYield`, etc.

### 7.2 Factory Formulas

- All factory formulas are driven by `config/factoryConfig.js`
- Factory services must import that config and use its values;
  no hardcoded duplicates allowed.

**Rule:** Any new formula must be added to the **global formula layer** first, not embedded into a service ad-hoc.

---

## 8. Caching Rules

### 8.1 NPC Cycle Engine Cache

- Owns a small cache for player room update intervals:
  - Keyed by connection or player ID
  - TTL around 60 seconds
- Cache is refreshed when expired or when player settings change

### 8.2 No Other Service-Level Caches

- No caching for NPC definitions, recipes, or tickets at the service layer

**Rule:** New caches must be:
- Documented here
- Scoped to a single service
- Have explicit TTL and invalidation strategy

---

## 9. Initialization & Lifecycle

### 9.1 `npcCycleEngine`

- Initialized once from `server.js` via `startNPCCycleEngine(db, npcLogic, connectedPlayers, sendRoomUpdate)`
- Starts a `setInterval` tick loop
- Responsible for cleaning stale references to disconnected players

### 9.2 Other Services

- `ticketService` has optional `startAutoRefresh()` for UI/editor context
- All other services are **on-demand only** — no global initialization

### 9.3 Shutdown (Current State)

- No explicit shutdown hooks
- Intervals die with the Node process

**Rule:** If graceful shutdown is introduced, `npcCycleEngine` and `ticketService` must expose a `stop()` or equivalent function, and this spec must be updated.

---

## 10. Architectural Guardrails for Cursor

When Cursor touches backend services, it must:

1. **Respect boundaries.** Don’t let one service take over another’s job.
2. **Keep stateless services stateless.** Any new state must be reviewed and documented.
3. **Preserve DB rules.** Only services already using `db` may issue queries.
4. **Route formulas correctly.** All stat math must go through the formula layer.
5. **Maintain logging.** Improve clarity, don’t remove visibility.
6. **Avoid UI assumptions.** Services never talk directly to the frontend.
7. **Update this document** when a service is added, renamed, or significantly enhanced.

---

## 11. TL;DR

- Backend services are focused, small, and mostly stateless.
- `npcCycleEngine` is the only truly stateful core service and owns the NPC heartbeat.
- Factory services share a tight calculation cluster but do not touch DB directly.
- Tickets are their own isolated concern.
- All future backend service work must fit into this model or explicitly extend it **via this spec**.

If any planned change conflicts with this document, **this document wins until it is updated.**

