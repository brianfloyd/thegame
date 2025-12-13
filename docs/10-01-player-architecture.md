# 10.1 — Player Subsystem Canonical Specification

This document captures the **exact, code‑verified canonical behavior** of the **Player / Character** subsystem. No assumptions, extrapolations, or inferred features are included. All facts are grounded in real code, with file references where possible.

---

# 1. Schema / Source of Truth
The **players** table in PostgreSQL is the definitive source of truth.
Defined in:
- `migrations/001_schema.sql` (base schema)
- Subsequent migrations (046, 051, 055, 027, 034, 035, 057)

### Core Fields (001_schema.sql)
- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL UNIQUE`
- `current_room_id INTEGER NOT NULL REFERENCES rooms(id)`
- **Stats:** `stat_ingenuity`, `stat_resonance`, `stat_fortitude`, `stat_acumen` (all INT DEFAULT 5)
- **Abilities:** `ability_crafting`, `ability_attunement`, `ability_endurance`, `ability_commerce` (all INT DEFAULT 0)
- `resource_max_encumbrance INTEGER DEFAULT 100`
- `assignable_points INTEGER DEFAULT 5`
- `flag_god_mode INTEGER DEFAULT 0`

### Additional Fields Added by Migrations
- Vitalis system:
  - `resource_vitalis INTEGER DEFAULT 50`
  - `resource_max_vitalis INTEGER DEFAULT 100`
  - `last_attune_time BIGINT`
- Pulse system:
  - `pulse_echoes INTEGER DEFAULT 0`
  - `pulse_echo_tier INTEGER DEFAULT 1`
- Attunement base values:
  - `base_attunement_points INTEGER DEFAULT 10`
  - `base_attunement_cooldown_ms INTEGER DEFAULT 10000`
  - `base_attunement_delay_ms INTEGER DEFAULT 2000`
- Misc config:
  - `auto_navigation_time_ms INTEGER DEFAULT 1000`
  - `widget_config TEXT JSON default`
  - `loop_delay_ms INTEGER`
  - `room_update_interval_ms INTEGER DEFAULT 30000`
  - `flag_always_first_time INTEGER`

---

# 2. Fields, Defaults, Nullability, Constraints

### Required (NOT NULL)
- id
- name (UNIQUE)
- current_room_id
- All stat_* fields
- All ability_* fields
- resource_max_encumbrance
- assignable_points
- flag_god_mode
- vitalis fields
- pulse_echo fields
- attunement fields
- auto_navigation_time_ms
- room_update_interval_ms

### Nullable
- `last_attune_time`
- `widget_config`
- `loop_delay_ms`
- `flag_always_first_time`

---

# 3. Player Operations (Read, Write, Mutate)
Defined primarily in `database.js` and `handlers/game.js`.

## Reads
- **`getPlayerById(id)`** `database.js:168`
- **`getPlayerByName(name)`** `database.js:164`
- **`getAllPlayers()`** `database.js:352`
- **`getPlayersInRoom(roomId)`** `database.js:399`
- **`getPlayerStats(player)`** `database.js:604–719`
- **`detectPlayerAttributes()`** `database.js:527–602`
- **`getPlayerWidgetConfig(playerId)`** `database.js:172–195`
- **`getPlayerCurrentEncumbrance(playerId)`** `database.js:2001–2010`

## Writes
### Creation
- **`createPlayer(name, accountId)`** `database.js:360–397`
  - Initializes defaults exactly as in schema.

### Updates
- **`updatePlayer(player)`** `database.js:408–460`
  - Whitelists allowed fields.
  - Validates vitalis:
    - Caps at max_vitalis
    - Ensures ≥ 0

- **`updatePlayerRoom(roomId, playerName)`** `database.js:404–406`
  - _No validation_ for room existence.

- **`updatePlayerVitalis(playerId, newVitalis)`** `database.js:468–474`
  - _No validation._

- **`addPulseEchoes(playerId, echoesToAdd)`** `database.js:482–507`
  - No validation for negative values.

- **`updatePulseEchoTier(...)`** `database.js:515–521`

- **`updatePlayerWidgetConfig(...)`** `database.js:197–207`

### Attribute Assignment
- Implemented in `handlers/game.js:4978–5065`
- Direct SQL updates
- Validates:
  - assignable_points > 0 (increment)
  - stat > 1 (decrement)
  - Only whitelisted stats can be changed

---

# 4. Validations (Present & Missing)

### **Implemented Validations**
- Vitalis <= max_vitalis (db.js)
- Vitalis >= 0 (db.js)
- Stat decrement requires value > 1 (game.js)
- Stat increment requires assignable_points > 0 (game.js)
- Starting room must exist to create character
- updatePlayer only updates whitelisted fields

### **Missing / Not Implemented**
- No max cap on stats
- No max/min validation on abilities
- assignable_points can be negative via updatePlayer
- pulse_echoes can be negative
- pulse_echo_tier can be < 1
- room ID is not verified in updatePlayerRoom
- No validation for widget_config JSON
- updatePlayerVitalis has no bound checks

---

# 5. Behavioral Rules / Invariants

### Enforced by Code
- Vitalis Always 0 ≤ vitalis ≤ max_vitalis
- Stats cannot drop below 1 (only through decrement handler)
- Assignable points must exist for increment
- Player name is unique (DB)
- Room foreign key enforced at DB-level only

### Not Enforced
- No stat maximum
- No ability minimum/maximum
- assignable_points can go negative outside stat handler
- pulse_echo values unconstrained
- No invariants for attunement base values
- No invariants for encumbrance resource

---

# 6. State Transitions

### Player Creation → Starting State
- stats = 5/5/5/5
- abilities = 0/0/0/0
- vitalis = 50/100
- pulse = 0 tier 1
- assignable_points = 5
- current_room_id = "town square"

### Movement
- updatePlayerRoom
- Harvest sessions and factory widget states cleared on movement (game.js)
- Room update sent to client

### Stat Assignment
- Increment/decrement along with assignable_points change

### Vitalis Change
- updatePlayerVitalis OR updatePlayer
- May exceed bounds if using updatePlayerVitalis

### Pulse Echo Progression
- addPulseEchoes → calls external tier calculation

---

# 7. Subsystem Interactions

### NPC Cycle Engine
- Awards pulse echoes
- Reads stats for harvest formulas

### Harvest System
- Uses stat_resonance, stat_fortitude, abilities

### Attunement
- Uses vitalis, last_attune_time, base_attunement_*

### Inventory/Encumbrance
- Encumbrance checked for movement & take

### Warehouse
- Uses flags

### Serialization
- sendPlayerStats sends stats + encumbrance to client

### Session State
- connectedPlayers holds temp state, NOT saved in DB

---

# 8. Failure States & Error Messages

### Errors Sent to Client
- No assignable points
- Cannot decrease stat below 1
- Player not found
- Invalid stat key

### System-Level Failures
- Starting room missing → throws
- DB constraint violations (name unique, FK room)
- Widget config parse error logged
- Vitalis overflow capped w/ warning

---

# 9. Serialization Path
Located in `utils/broadcast.js:80–99`.

### Serialized
- stats (detected via prefixes)
- abilities
- resources
- flags
- assignable_points
- pulse echo progression
- attunement base values
- playerName
- currentEncumbrance (calculated)

### Not Serialized
- last_attune_time
- widget_config (sent separately)
- raw DB fields
- room info (separate message)

---

# 10. Known Gaps / Missing Features
- No stat maximum enforcement
- No ability bounds
- No validation for assignable_points negative
- No validation for pulse_echo or tier bounds
- No room validation on updatePlayerRoom
- No schema validation for widget_config
- updatePlayerVitalis bypasses validation
- Race conditions in stat assignment
- No player deletion or rename system
- No audit logging

---

# 11. Strengths / Weaknesses / Risks

### Strengths
- Prefix-based auto-detected stat system
- Clear whitelisted update model
- Vitalis validation exists
- Character creation enforces consistent defaults

### Weaknesses
- Many missing validations
- Direct SQL updates bypass invariants
- Inconsistent enforcement of stat ranges
- Risk of data corruption

### Risks
- Negative values possible
- Invalid room IDs possible
- Race conditions during rapid stat assignment
- Desync between DB and in-memory state

---

**End of Canonical Player Specification**

