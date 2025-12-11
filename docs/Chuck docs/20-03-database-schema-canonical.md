# 230 — Canonical Database Schema Specification
_The authoritative database contract for Cursor and all future backend/server‑side work._

This is the **clean, final, usable** version of the Database Canonical Spec. It replaces all prior drafts. Cursor must follow this document EXACTLY whenever touching persistence, migrations, DB helpers, or schema‑dependent logic.

---

# 1. Core Rules of the Database Layer

1. **PostgreSQL is the only source of persistent truth.**
2. All writes must go through `database.js` helpers.
3. Schema MAY NOT be altered unless this canonical spec is updated first.
4. JSONB is allowed only for **flexible state**, NOT for identity, relationships, or core logic.
5. Every persistent entity must be defined in this spec.
6. All constraints, defaults, and rules must be followed by Cursor during creation or modification of code.

---

# 2. Canonical Tables (Authoritative List)
If a table is not listed here, Cursor must treat it as **legacy** and must not modify it.

## 2.1 `players`
Stores long‑term player identity, progression, stats, and flags.

**Fields:**
- `id` (PK)
- `username`
- `display_name`
- `password_hash`
- `current_room_id` (FK → rooms.id)
- `stat_resonance` INT
- `stat_fortitude` INT
- `stat_ingenuity` INT
- `stat_acumen` INT
- `pulse_echoes` INT
- `pulse_echo_tier` INT
- `is_god_mode` BOOLEAN
- `has_warehouse_deed` BOOLEAN
- `auto_navigation_time_ms` INT
- timestamps

**Rules:**
- Stats must be integers.
- `current_room_id` must reference an existing room.

---

## 2.2 `rooms`
Primary world map unit.

**Fields:**
- `id` (PK)
- `name`
- `description` (Markdown/plaintext only)
- `room_type` (normal, factory, warehouse, npc_den, etc.)
- `coords_x`, `coords_y` (unique pair)
- `factory_quirks` JSONB
- `factory_tier` INT
- `environment_flags` JSONB
- timestamps

**Rules:**
- `(coords_x, coords_y)` must be unique.
- No HTML in description.
- `room_type` determines if quirks or factory fields apply.

---

## 2.3 `exits`
Directional connections between rooms.

**Fields:**
- `id` (PK)
- `room_id`
- `direction` TEXT (north, south, east, west, up, down)
- `leads_to_room_id`

**Rules:**
- Bidirectionality is optional but recommended.

---

## 2.4 `items`
Canonical item definitions.

**Fields:**
- `id` (PK)
- `name`
- `description`
- `weight` INT
- `item_type` TEXT
- `rune_type` TEXT? (nullable, only valid when `item_type = 'rune'`)

**Rules:**
- Immutable definitions.
- Rune items must declare `rune_type`.

---

## 2.5 `player_items`
Player inventory.

**Fields:**
- `id`
- `player_id`
- `item_id`
- `quantity`
- timestamps

**Rules:**
- Encumbrance = sum(item.weight * quantity).

---

## 2.6 `room_items`
Items present on the ground.

**Fields:**
- `id`
- `room_id`
- `item_id`
- `quantity`
- `dropped_at`

---

## 2.7 `npcs`
NPC instances placed in rooms.

**Fields:**
- `id`
- `scriptable_npc_id`
- `room_id`
- `state` JSONB

**Rules:**
- `state` must follow canonical NPC State Model.

---

## 2.8 `scriptable_npcs`
Reusable NPC templates.

**Fields:**
- `id`
- `name`
- `description`
- `baseCycleTime`
- `behaviorType`
- `stats` JSONB
- `required_buffs` JSONB (unused placeholder)

---

## 2.9 `factory_recipes`
Crafting rules used by factories.

**Fields:**
- `id`
- `name`
- `inputs` JSONB
- `outputs` JSONB
- `required_stats` JSONB
- `success_rate` INT
- `tier` INT

---

## 2.10 `factory_quirks`
Modifiers applied to rooms of type `factory`.

**Fields:**
- `id`
- `room_id`
- `quirk_type`
- `effects` JSONB

---

## 2.11 `pulse_echoes`
Tracks pulse echo drops for progression.

**Fields:**
- `id`
- `player_id`
- `npc_source_id`
- `created_at`

---

## 2.12 `tickets`
Developer debug + TODO system.

**Fields:**
- `id`
- `owner`
- `title`
- `details`
- `status`
- `session_id`
- timestamps

---

# 3. Canonical JSONB Structures
These MUST match server expectations.

## 3.1 NPC State JSONB
```
{
  "harvest_active": boolean,
  "harvest_start_time": number,
  "cooldown_until": number,
  "last_cycle_timestamp": number,
  "hp": number,
  "custom": { }
}
```

## 3.2 Room Environment Flags
```
{
  "is_safe_zone": boolean,
  "is_dark": boolean,
  "is_hazardous": boolean
}
```

## 3.3 Factory Quirks JSONB
```
{
  "type": "stable" | "chaotic" | "attuned" | "worn",
  "effects": {
    "successBonus": number?,
    "successPenalty": number?,
    "speedBonus": number?,
    "speedPenalty": number?
  }
}
```

---

# 4. DB Access Layer Rules (`database.js`)

### 4.1 Rules
- All CRUD must use existing helper functions.
- New helpers may not be created unless added to this spec.
- All helpers must:
  - Use parameterized SQL
  - Return objects or null, never undefined
  - Enforce type correctness

### 4.2 Example Contracts
`getRoom(id)` **must** return:
```
{
  id, name, description, room_type,
  coords_x, coords_y,
  factory_quirks,
  environment_flags,
  ...
}
```

---

# 5. Referential Integrity Rules

1. `player.current_room_id` must always reference a valid room.
2. NPCs referencing invalid rooms must be skipped and logged.
3. Room deletion must cascade cleanly:
   - Remove exits
   - Remove room_items
   - Remove NPCs
   - Remove quirks
4. Recipes must reference valid item IDs.

---

# 6. Indexing Rules
Required indexes:
- `players.username`
- `rooms(coords_x, coords_y)`
- `exits.room_id`
- `player_items.player_id`
- `room_items.room_id`
- `npcs.room_id`
- `pulse_echoes.player_id`

Cursor must not add indexes without explicit instruction.

---

# 7. Migration Rules

1. All schema changes must have migrations.
2. Migrations must be reversible when possible.
3. Destructive migrations require explicit direction.
4. Defaults must be set for JSONB fields.

---

# 8. TL;DR For Cursor

- **This is the canonical, authoritative schema.**
- No table or field may be altered without updating this spec.
- All DB logic must use existing helpers.
- All JSONB blocks must follow exact structures.
- Referential integrity must be preserved at all times.

**If anything conflicts with this spec, THIS SPEC WINS.**

