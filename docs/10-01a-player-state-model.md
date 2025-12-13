# 10.1 — Player State Model (Canonical Documentation)

> **Source:** Derived from complete codebase analysis (DB schema, handlers, editors, automation, harvesting, rendering stack).  
> **Purpose:** Provide Cursor an authoritative, implementation‑aligned Player State Specification.

---

# 1. Single Source of Truth

The **database** (`players` table) is the authoritative source of player state.

**Flow:**
```
DB  →  Server Memory  →  Client Session
```

### DB → Server
Loaded via:
- `getPlayerById(id)`
- `getPlayerByName(name)`

### Server → Client
Sent via:
- `playerStats` message
- `roomUpdate` messages

**connectedPlayers Map does NOT store full player state** — only connection/session metadata.

---

# 2. Full Player Model (All Known Fields)

Pulled from migrations + database.js.

### Core Identity
- `id`
- `name`
- `current_room_id`

### Stats (prefix: `stat_`)
- `stat_ingenuity`
- `stat_resonance`
- `stat_fortitude`
- `stat_acumen`

### Abilities (prefix: `ability_`)
- `ability_crafting`
- `ability_attunement`
- `ability_endurance`
- `ability_commerce`

### Resources (prefix: `resource_`)
- `resource_vitalis`
- `resource_max_vitalis`
- `resource_max_encumbrance`

### Special Progression
- `assignable_points`
- `pulse_echoes`
- `pulse_echo_tier`

### Player Flags (permissions + behaviors)
- `flag_god_mode`
- `flag_always_first_time`

### Timing Configuration
- `auto_navigation_time_ms`
- `loop_delay_ms`
- `room_update_interval_ms`
- `base_attunement_points`
- `base_attunement_cooldown_ms`
- `base_attunement_delay_ms`
- `last_attune_time`

### UI Config
- `widget_config` (JSON)

---

# 3. Invariants

### Vitalis
```
0 ≤ resource_vitalis ≤ resource_max_vitalis
```
Enforced in:
- `updatePlayer()`
- `applyVitalisDrain()`

### Encumbrance
```
current_encumbrance ≤ resource_max_encumbrance
```
Enforced in:
- Movement
- `take` command
- Editor add‑item

### Room Validity
Player must always reference an existing room.

### Assignable Points
Assumed ≥ 0 (not explicitly enforced in code).

---

# 4. Where Stats Are Calculated

### Stored directly in DB
No derived or dynamic stat calculations.

### Dynamically computed values:
- Encumbrance → summed from inventory
- Vitalis drain formulas → via `harvestFormulas.js`

### No buff/debuff engine exists
All modifiers are immediate formula-based, not stateful.

---

# 5. Systems That Mutate Player State

### Movement
- Updates `current_room_id`

### Harvest Engine
- Drains vitalis
- Produces pulse echoes / tier ups

### Editors
- Patch any allowed field

### Attunement system
- Updates `last_attune_time`

### Vitalis Helpers
- `updatePlayerVitalis()` → atomic updates

### What does NOT mutate stats:
- Factory crafting
- Automation

---

# 6. Mutation Pattern (Canonical)

**Pattern (preferred):**
```
1. Load player
2. Validate new value(s)
3. db.updatePlayer()
4. sendPlayerStats() to client
```

### Exceptions (Direct SQL Updates)
- `updatePlayerRoom()`
- `updatePlayerVitalis()`
- `addPulseEchoes()`

These bypass `updatePlayer()`’s validation chain.

---

# 7. Sync Model (DB ↔ Server ↔ Client)

### DB → Server
Loaded on demand. Server does *not* automatically keep a complete cached player object.

### Server → Client Sync
Triggered by:
- room changes
- stat-changing events
- harvest cycles
- manual editor changes

### Desync Risks
- If updatePlayer() is used without sendPlayerStats()
- If multiple concurrent DB writes occur

---

# 8. Persistent vs Non‑Persistent Player State

### Persists (DB-backed)
- All stats, abilities, resources
- Room
- Inventory
- Bank
- Warehouse
- Widget config

### Resets (server-memory)
- autoNavigation
- pathExecution
- harvest sessions
- widget room states (factory, warehouse)
- NPC highlights

---

# 9. Cleanup Rules (Disconnect / Movement / End Loop)

### Cleaned Up
- autoNavigation
- harvest sessions
- warehouse & factory widget state

### NOT Cleaned Up (Potential Bugs)
- pathExecution object
- autoHarvest inside pathExecution
- NPC targeting state

---

# 10. Encumbrance Rules

### Calculated from inventory
```
SUM(item.encumbrance × qty)
```

### Enforced in:
- movement
- take command
- editor give

### NOT enforced in:
- harvesting
- crafting
- automation

This is a known gap.

---

# 11. Vitalis Drain Rules

### Drain occurs only in harvest cycles.
Bounded by:
```
max(vitalis - drainAmount, 0)
```

### Zero Vitalis Triggers
- end harvest
- halt automation
- require attunement

---

# 12. Automation State Model

### Stored only in memory:
```
playerData.autoNavigation
playerData.pathExecution
```

### Cleared:
- on disconnect
- on manual movement
- on completion

### Never persisted
Client may think automation is active, but server has no state → **potential desync**.

---

# 13. Timing Model Integration

Player timing fields influence:
- auto-navigation delay
- loop delay
- room update interval

Harvest timing is *NOT* stored on the player — derived per-cycle using:
- NPC base cycle time
- player resonance modifiers

---

# 14. Room Transition Enforcement

Movement validates:
- current room exists
- exit exists
- map connections
- coordinate adjacency

God-mode can override via `jumpToRoom()`.

---

# 15. Player Flags (Permissions)

### `flag_god_mode`
- Enables all editors, map tools, overrides

### `flag_always_first_time`
- Disables lorekeeper progression tracking
- Resets terminal history
- Ignores warehouse existence

---

# 16. Buff/Debuff System Status

**Not implemented.**

Cursor must:
- NOT assume buffs exist
- NOT generate buff logic unless requested
- NOT add temp stat modifiers outside harvest formulas

---

# 17. Player Snapshot Sent to Client

### Includes:
- All stats (dynamic format via `getPlayerStats()`)
- playerName
- currentEncumbrance
- room context (players, NPCs, items, exits)
- warehouse/factory state if applicable

### Does NOT include:
- full inventory
- bank
- warehouse content
- automation state

---

# 18. Factory Use of Player State

Factory uses player stats **read‑only**:
- ingenuity
- resonance
- acumen

Does **not** mutate:
- stats
- abilities
- encumbrance

This is intended behavior.

---

# 19. Inventory Rules

### Stacking
Same item name stacks automatically.

### No slot limit
Encumbrance is the limiting system.

### Warehouse separation
Warehouse does not count toward encumbrance.

---

# 20. Failure States

### Vitalis
- 0 → harvest ends + automation stops

### Encumbrance
- movement blocked
- picking up items blocked

### Invalid movement
- exit does not exist
- room does not exist

### Harvest errors
- missing prerequisite item
- missing required item
- NPC not harvestable

### Automation Pauses
- pathExecution pause (no user message)

### Editor errors
- god mode required

---

# End of 10.1 — Player State Model

