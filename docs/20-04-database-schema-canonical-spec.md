# 999 — Canonical Database Schema Specification
_The authoritative database contract for Cursor and all future backend/server‑side work._

**Analysis Date:** Based on codebase as of migration 088  
**Methodology:** Strict code-based analysis per scrub prompt template  
**All answers derived from:** `migrations/*.sql`, `database.js`, actual database schema queries

---

# 1. Core Rules of the Database Layer

1. **PostgreSQL is the only source of persistent truth.**
   - Evidence: `database.js:11-17` - PostgreSQL connection pool configuration
   - Evidence: `migrations/001_schema.sql:1-3` - All tables defined in PostgreSQL

2. **All writes must go through `database.js` helpers.**
   - Evidence: All game handlers import and use `database.js` functions
   - Evidence: No direct SQL queries in handlers (except via database.js)

3. **Schema MAY NOT be altered unless this canonical spec is updated first.**
   - Evidence: Migration system enforces sequential application
   - Evidence: `scripts/migrate.js:18-100` - Migration runner validates schema changes

4. **JSONB is allowed only for flexible state, NOT for identity, relationships, or core logic.**
   - Evidence: Item relationships use `item_id` INTEGER foreign keys (migrations 076-086)
   - Evidence: JSONB used for: `state`, `metadata`, `config_json`, `required_stats`, `required_buffs`, `input_items`, `output_items`, `failure_states`, `required_ingredients`, `output_items`, `byproducts`, `keywords_responses`, `factory_quirks`, `environment`, `logs`

5. **Every persistent entity must be defined in this spec.**
   - All 39 tables documented below

6. **All constraints, defaults, and rules must be followed by Cursor during creation or modification of code.**
   - Foreign key constraints enforced at database level
   - NOT NULL constraints enforced at database level
   - Unique constraints enforced at database level

---

# 2. Canonical Tables (Authoritative List)

## 2.1 System Tables

### `schema_migrations`
**Purpose:** Tracks applied database migrations  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE (migration filename)
- `applied_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Evidence:** `migrations/001_schema.sql:5-9`

---

## 2.2 World Content Tables

### `maps`
**Purpose:** Map definitions for multi-map world system  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `width` INTEGER NOT NULL
- `height` INTEGER NOT NULL
- `description` TEXT

**Relationships:**
- One-to-many: `maps` → `rooms` (via `rooms.map_id`)

**Evidence:** `migrations/001_schema.sql:12-18`

---

### `rooms`
**Purpose:** Room definitions with coordinate-based positioning  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL
- `description` TEXT NOT NULL
- `x` INTEGER NOT NULL (coordinate within map)
- `y` INTEGER NOT NULL (coordinate within map)
- `map_id` INTEGER NOT NULL REFERENCES maps(id)
- `connected_map_id` INTEGER REFERENCES maps(id) (nullable, for map connections)
- `connected_room_x` INTEGER (nullable, connection target coordinate)
- `connected_room_y` INTEGER (nullable, connection target coordinate)
- `connection_direction` TEXT (nullable, direction of connection)
- `room_type` TEXT NOT NULL DEFAULT 'normal' (normal, merchant, factory, warehouse)
- `factory_tier` INTEGER DEFAULT 1 (migration 071, for factory rooms)
- `factory_quirks` JSONB (migration 071, quirk configuration)

**Constraints:**
- UNIQUE(`map_id`, `x`, `y`) - Coordinate uniqueness within map
- CHECK constraint on `factory_tier` (1-5) if not NULL

**Relationships:**
- Many-to-one: `rooms` → `maps` (via `map_id`)
- One-to-many: `rooms` → `room_items` (via `room_items.room_id`)
- One-to-many: `rooms` → `room_npcs` (via `room_npcs.room_id`)
- One-to-many: `rooms` → `players` (via `players.current_room_id`)
- One-to-many: `rooms` → `merchant_items` (via `merchant_items.room_id`)

**Evidence:** `migrations/001_schema.sql:21-34`, `migrations/071_add_factory_tier_quirks.sql:6-15`

---

### `scriptable_npcs`
**Purpose:** NPC type definitions (templates)  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `description` TEXT NOT NULL
- `npc_type` TEXT NOT NULL (harvestable, merchant, quest, enemy, friendly, neutral, lorekeeper)
- `base_cycle_time` INTEGER NOT NULL (milliseconds)
- `difficulty` INTEGER NOT NULL DEFAULT 1
- `harvestable_time` INTEGER NOT NULL DEFAULT 60000 (milliseconds)
- `cooldown_time` INTEGER NOT NULL DEFAULT 120000 (milliseconds)
- `required_stats` JSONB DEFAULT '{}' (stat requirements)
- `required_buffs` JSONB DEFAULT '[]' (buff requirements)
- `input_items` JSONB DEFAULT '{}' (item_id keys as strings: {"42": 5})
- `output_items` JSONB DEFAULT '{}' (item_id keys as strings: {"42": 5})
- `failure_states` JSONB DEFAULT '[]'
- `display_color` TEXT DEFAULT '#00ff00'
- `scriptable` BOOLEAN NOT NULL DEFAULT TRUE
- `active` BOOLEAN NOT NULL DEFAULT TRUE
- `output_distribution` TEXT NOT NULL DEFAULT 'ground' (ground, player, all_players)
- `harvest_prerequisite_item` TEXT (nullable, legacy - kept for rollback)
- `harvest_prerequisite_item_id` INTEGER REFERENCES items(id) (nullable, migration 078)
- `harvest_prerequisite_message` TEXT (nullable)
- `puzzle_type` TEXT DEFAULT 'none' (none, glow_codex)
- `puzzle_glow_clues` JSONB DEFAULT '[]'
- `puzzle_extraction_pattern` JSONB DEFAULT '[]'
- `puzzle_solution_word` TEXT (nullable)
- `puzzle_success_response` TEXT (nullable)
- `puzzle_failure_response` TEXT (nullable)
- `puzzle_reward_item` TEXT (nullable, legacy - kept for rollback)
- `puzzle_reward_item_id` INTEGER REFERENCES items(id) (nullable, migration 081)
- `puzzle_hint_responses` JSONB DEFAULT '[]'
- `puzzle_followup_responses` JSONB DEFAULT '[]'
- `puzzle_incorrect_attempt_responses` JSONB DEFAULT '[]'
- `puzzle_award_once_only` BOOLEAN DEFAULT FALSE
- `puzzle_award_after_delay` BOOLEAN DEFAULT FALSE
- `puzzle_award_delay_seconds` INTEGER (nullable)
- `puzzle_award_delay_response` TEXT (nullable)
- `enable_resonance_bonuses` BOOLEAN DEFAULT TRUE
- `enable_fortitude_bonuses` BOOLEAN DEFAULT TRUE
- `status_message_idle` TEXT DEFAULT '(idle)'
- `status_message_ready` TEXT DEFAULT '(ready)'
- `status_message_harvesting` TEXT DEFAULT '(harvesting)'
- `status_message_cooldown` TEXT DEFAULT '(cooldown)'
- `hit_vitalis` INTEGER NOT NULL DEFAULT 0
- `miss_vitalis` INTEGER NOT NULL DEFAULT 0
- `pulse_echo_yield` INTEGER NOT NULL DEFAULT 1

**Constraints:**
- CHECK(`puzzle_type` IN ('none', 'glow_codex'))
- CHECK(`output_distribution` IN ('ground', 'player', 'all_players'))
- FOREIGN KEY `harvest_prerequisite_item_id` → `items(id)`
- FOREIGN KEY `puzzle_reward_item_id` → `items(id)`

**Relationships:**
- One-to-many: `scriptable_npcs` → `room_npcs` (via `room_npcs.npc_id`)
- One-to-one: `scriptable_npcs` → `lore_keepers` (via `lore_keepers.npc_id` UNIQUE)

**JSONB Structure - `input_items` / `output_items`:**
- Format: `{"item_id_as_string": quantity}` (e.g., `{"42": 5, "43": 1}`)
- Keys are stringified item IDs (JSONB limitation - keys must be strings)
- Converted to item names by `database.js` helper functions for application use

**Evidence:** 
- `migrations/001_schema.sql:59-92`
- `migrations/078_convert_harvest_prerequisite_to_item_id.sql`
- `migrations/079_convert_npc_input_items_to_ids.sql`
- `migrations/080_convert_npc_output_items_to_ids.sql`
- `migrations/081_convert_puzzle_reward_to_item_id.sql`
- `database.js:721-794` - Conversion functions

---

### `room_npcs`
**Purpose:** NPC placements in rooms (instances)  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `npc_id` INTEGER NOT NULL REFERENCES scriptable_npcs(id)
- `room_id` INTEGER NOT NULL REFERENCES rooms(id)
- `state` TEXT (JSON string, NPC state machine)
- `last_cycle_run` BIGINT (epoch milliseconds)
- `active` BOOLEAN NOT NULL DEFAULT TRUE
- `slot` INTEGER DEFAULT 0
- `spawn_rules` JSONB (nullable)

**Relationships:**
- Many-to-one: `room_npcs` → `scriptable_npcs` (via `npc_id`)
- Many-to-one: `room_npcs` → `rooms` (via `room_id`)

**JSONB Structure - `state`:**
```json
{
  "harvest_active": boolean,
  "harvest_start_time": number,
  "harvesting_player_id": number,
  "cooldown_until": number,
  "last_cycle_timestamp": number,
  "hp": number,
  "custom": {}
}
```

**Evidence:** `migrations/001_schema.sql:83-92`

---

### `items`
**Purpose:** Item master definitions (canonical item catalog)  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `description` TEXT
- `item_type` TEXT NOT NULL DEFAULT 'sundries' (currency, consumable, equipment, deed, rune, etc.)
- `active` BOOLEAN NOT NULL DEFAULT TRUE
- `poofable` BOOLEAN NOT NULL DEFAULT FALSE
- `encumbrance` INTEGER NOT NULL DEFAULT 1
- `rune_type` TEXT (nullable, migration 069, only valid when `item_type = 'rune'`)
- `rune_color` TEXT (nullable, migration 064, hex color for runes)
- `deed_warehouse_location_key` TEXT (nullable, migration 011)
- `deed_base_max_item_types` INTEGER (nullable, migration 014)
- `deed_max_total_items` INTEGER DEFAULT 100 (migration 014)
- `deed_automation_enabled` BOOLEAN DEFAULT FALSE (migration 014)
- `created_at` BIGINT NOT NULL

**Constraints:**
- CHECK(`rune_type` IS NULL OR `rune_type` IN ('PRODUCTION', 'SPEED', 'EFFICIENCY'))
- UNIQUE(`name`)

**Relationships:**
- One-to-many: `items` → `player_items` (via `player_items.item_id`)
- One-to-many: `items` → `room_items` (via `room_items.item_name` - **NOTE: room_items still uses item_name, not item_id**)
- One-to-many: `items` → `warehouse_items` (via `warehouse_items.item_id`)
- One-to-many: `items` → `merchant_items` (via `merchant_items.item_id`)
- One-to-many: `items` → `scriptable_npcs` (via `harvest_prerequisite_item_id`, `puzzle_reward_item_id`)
- One-to-many: `items` → `lore_keepers` (via `puzzle_reward_item_id`)
- One-to-many: `items` → `lore_keeper_item_awards` (via `item_id`)
- One-to-many: `items` → `factory_recipes` (via JSONB `required_ingredients`, `output_items`, `byproducts` with `item_id` keys)

**Evidence:** 
- `migrations/001_schema.sql:95-105`
- `migrations/064_add_rune_color_field.sql`
- `migrations/069_add_rune_type_field.sql`

---

### `room_items`
**Purpose:** Items on the ground in rooms  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `room_id` INTEGER NOT NULL REFERENCES rooms(id)
- `item_name` TEXT NOT NULL (**NOTE: Still uses item_name, not item_id - migration pending**)
- `quantity` INTEGER NOT NULL DEFAULT 1
- `created_at` BIGINT NOT NULL

**Relationships:**
- Many-to-one: `room_items` → `rooms` (via `room_id`)
- Name-based reference: `room_items.item_name` → `items.name` (no FK constraint)

**Evidence:** `migrations/001_schema.sql:107-113`

**Note:** According to `docs/Chuck docs/1001-database-cleanup.md:50-54`, this was marked as completed, but database schema shows `item_name` still exists. Migration may not have been applied or was reverted.

---

## 2.3 Player Tables

### `accounts`
**Purpose:** User account authentication  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `email` TEXT NOT NULL UNIQUE
- `password_hash` TEXT NOT NULL
- `email_verified` BOOLEAN NOT NULL DEFAULT FALSE
- `created_at` BIGINT NOT NULL
- `last_login_at` BIGINT (nullable)

**Constraints:**
- CHECK(email format validation via regex)

**Relationships:**
- One-to-many: `accounts` → `user_characters` (via `user_characters.account_id`)

**Evidence:** `migrations/022_accounts_system.sql:4-12`

---

### `user_characters`
**Purpose:** Links accounts to player characters (one account → many characters)  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `account_id` INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `created_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`account_id`, `player_id`)

**Relationships:**
- Many-to-one: `user_characters` → `accounts` (via `account_id`)
- Many-to-one: `user_characters` → `players` (via `player_id`)

**Evidence:** `migrations/022_accounts_system.sql:17-23`

---

### `players`
**Purpose:** Player character data with dynamic stats system  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `current_room_id` INTEGER NOT NULL REFERENCES rooms(id)
- **Dynamic Stats (prefix-based auto-detection):**
  - `stat_ingenuity` INTEGER NOT NULL DEFAULT 5
  - `stat_resonance` INTEGER NOT NULL DEFAULT 5
  - `stat_fortitude` INTEGER NOT NULL DEFAULT 5
  - `stat_acumen` INTEGER NOT NULL DEFAULT 5
- **Abilities:**
  - `ability_crafting` INTEGER NOT NULL DEFAULT 0
  - `ability_attunement` INTEGER NOT NULL DEFAULT 0
  - `ability_endurance` INTEGER NOT NULL DEFAULT 0
  - `ability_commerce` INTEGER NOT NULL DEFAULT 0
- **Resources:**
  - `resource_max_encumbrance` INTEGER NOT NULL DEFAULT 100
  - `resource_vitalis` INTEGER NOT NULL DEFAULT 100 (migration 046)
  - `resource_max_vitalis` INTEGER NOT NULL DEFAULT 100 (migration 046)
- **Flags:**
  - `flag_god_mode` INTEGER NOT NULL DEFAULT 0
  - `flag_always_first_time` INTEGER NOT NULL DEFAULT 0 (migration 020)
- **Progression:**
  - `assignable_points` INTEGER NOT NULL DEFAULT 5 (migration 027)
  - `pulse_echoes` INTEGER NOT NULL DEFAULT 0 (migration 051)
  - `pulse_echo_tier` INTEGER NOT NULL DEFAULT 1 (migration 051)
- **Timing:**
  - `auto_navigation_time_ms` INTEGER DEFAULT 1000 (migration 034)
  - `loop_delay_ms` INTEGER DEFAULT 1000 (migration 045)
  - `room_update_interval_ms` INTEGER DEFAULT 30000 (migration 057)
  - `last_attune_time` BIGINT (nullable, migration 055)
- **Attunement:**
  - `base_attunement_points` INTEGER NOT NULL DEFAULT 10 (migration 055)
  - `base_attunement_cooldown_ms` INTEGER NOT NULL DEFAULT 60000 (migration 055)
  - `base_attunement_delay_ms` INTEGER NOT NULL DEFAULT 5000 (migration 055)
- **UI:**
  - `widget_config` JSONB (nullable, migration 035)

**Relationships:**
- Many-to-one: `players` → `rooms` (via `current_room_id`)
- One-to-many: `players` → `player_items` (via `player_items.player_id`)
- One-to-many: `players` → `player_bank` (via `player_bank.player_id`)
- One-to-many: `players` → `warehouse_items` (via `warehouse_items.player_id`)
- One-to-many: `players` → `player_warehouses` (via `player_warehouses.player_id`)
- One-to-many: `players` → `loops` (via `loops.player_id`)
- One-to-many: `players` → `terminal_history` (via `terminal_history.player_id`)
- One-to-many: `players` → `lore_keeper_greetings` (via `lore_keeper_greetings.player_id`)
- One-to-many: `players` → `lore_keeper_item_awards` (via `lore_keeper_item_awards.player_id`)

**Evidence:** 
- `migrations/001_schema.sql:37-57`
- `migrations/026_replace_stats_and_abilities.sql`
- `migrations/046_add_vitalis_stat.sql`
- `migrations/051_add_pulse_echoes.sql`
- `migrations/055_add_attunement_base_values.sql`

---

### `player_items`
**Purpose:** Player inventory  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id)
- `item_id` INTEGER NOT NULL REFERENCES items(id) (**Migration 076: converted from item_name**)
- `quantity` INTEGER NOT NULL DEFAULT 1
- `created_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`player_id`, `item_id`) - Prevents duplicate entries

**Relationships:**
- Many-to-one: `player_items` → `players` (via `player_id`)
- Many-to-one: `player_items` → `items` (via `item_id`)

**Evidence:** 
- `migrations/001_schema.sql:116-122` (original schema)
- `migrations/076_convert_player_items_to_item_id.sql` (conversion migration)
- `database.js:1923-1985` - Functions use `item_id` with JOIN to return `item_name`

---

### `player_bank`
**Purpose:** Player currency storage with auto-conversion  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id)
- `currency_name` TEXT NOT NULL
- `quantity` INTEGER NOT NULL DEFAULT 0
- `created_at` BIGINT NOT NULL
- `updated_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`player_id`, `currency_name`)

**Relationships:**
- Many-to-one: `player_bank` → `players` (via `player_id`)

**Evidence:** `migrations/019_player_bank.sql`

---

### `warehouse_items`
**Purpose:** Warehouse storage (private storage per player per warehouse location)  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id)
- `warehouse_location_key` TEXT NOT NULL
- `item_id` INTEGER NOT NULL REFERENCES items(id) (**Migration 077: converted from item_name**)
- `quantity` INTEGER NOT NULL DEFAULT 1
- `created_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`player_id`, `warehouse_location_key`, `item_id`)

**Relationships:**
- Many-to-one: `warehouse_items` → `players` (via `player_id`)
- Many-to-one: `warehouse_items` → `items` (via `item_id`)

**Evidence:** 
- `migrations/011_warehouse_system.sql:5-13` (original schema)
- `migrations/077_convert_warehouse_items_to_item_id.sql` (conversion migration)
- `database.js:1991-2115` - Functions use `item_id` with JOIN to return `item_name`

---

### `player_warehouses`
**Purpose:** Warehouse ownership and configuration  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id)
- `warehouse_location_key` TEXT NOT NULL
- `deed_item_id` INTEGER REFERENCES items(id) (nullable)
- `max_item_types` INTEGER DEFAULT 1
- `max_total_items` INTEGER DEFAULT 100
- `automation_enabled` BOOLEAN DEFAULT FALSE
- `created_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`player_id`, `warehouse_location_key`)

**Relationships:**
- Many-to-one: `player_warehouses` → `players` (via `player_id`)
- Many-to-one: `player_warehouses` → `items` (via `deed_item_id`, nullable)

**Evidence:** `migrations/011_warehouse_system.sql:15-26`

---

## 2.4 Gameplay Tables

### `loops`
**Purpose:** Player navigation loops (saved paths)  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `map_id` INTEGER NOT NULL REFERENCES maps(id)
- `name` TEXT NOT NULL
- `origin_room_id` INTEGER NOT NULL REFERENCES rooms(id)
- `path_type` TEXT DEFAULT 'loop' (migration 036)
- `created_at` BIGINT (migration 036)

**Constraints:**
- UNIQUE(`player_id`, `map_id`, `name`)

**Relationships:**
- Many-to-one: `loops` → `players` (via `player_id`)
- Many-to-one: `loops` → `maps` (via `map_id`)
- Many-to-one: `loops` → `rooms` (via `origin_room_id`)
- One-to-many: `loops` → `loop_steps` (via `loop_steps.loop_id`)

**Evidence:** `migrations/036_add_path_type.sql:2-12`

---

### `loop_steps`
**Purpose:** Waypoints in navigation loops  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `loop_id` INTEGER NOT NULL REFERENCES loops(id) ON DELETE CASCADE
- `room_id` INTEGER NOT NULL REFERENCES rooms(id)
- `step_index` INTEGER NOT NULL
- `created_at` BIGINT (migration 036)

**Constraints:**
- UNIQUE(`loop_id`, `step_index`)

**Relationships:**
- Many-to-one: `loop_steps` → `loops` (via `loop_id`)
- Many-to-one: `loop_steps` → `rooms` (via `room_id`)

**Evidence:** `migrations/036_add_path_type.sql:14-24`

---

### `terminal_history`
**Purpose:** Player command history  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `command` TEXT NOT NULL
- `timestamp` BIGINT NOT NULL

**Relationships:**
- Many-to-one: `terminal_history` → `players` (via `player_id`)

**Evidence:** `migrations/025_terminal_history.sql`

---

## 2.5 NPC Interaction Tables

### `lore_keepers`
**Purpose:** Narrative NPCs with dialogue and puzzle systems  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `npc_id` INTEGER NOT NULL UNIQUE REFERENCES scriptable_npcs(id) ON DELETE CASCADE
- `lore_type` TEXT NOT NULL (dialogue, puzzle)
- `engagement_enabled` BOOLEAN NOT NULL DEFAULT TRUE
- `engagement_delay` INTEGER NOT NULL DEFAULT 3000 (milliseconds)
- `initial_message` TEXT (nullable)
- `initial_message_color` TEXT DEFAULT '#00ffff'
- `keywords_responses` JSONB DEFAULT '{}' (keyword → response mapping for both dialogue and puzzle types)
- `keyword_color` TEXT DEFAULT '#ff00ff'
- `incorrect_response` TEXT DEFAULT 'I do not understand what you mean.'
- `puzzle_mode` TEXT (nullable, word, combination, cipher)
- `puzzle_solution` TEXT (nullable)
- `puzzle_success_message` TEXT (nullable)
- `puzzle_failure_message` TEXT DEFAULT 'That is not the answer I seek.'
- `puzzle_reward_item` TEXT (nullable, legacy - kept for rollback)
- `puzzle_reward_item_id` INTEGER REFERENCES items(id) (nullable, migration 082)
- `puzzle_award_once_only` BOOLEAN DEFAULT FALSE
- `puzzle_award_after_delay` BOOLEAN DEFAULT FALSE
- `puzzle_award_delay_seconds` INTEGER (nullable)
- `puzzle_award_delay_response` TEXT (nullable)
- `created_at` TIMESTAMP NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Constraints:**
- CHECK(`lore_type` IN ('dialogue', 'puzzle'))
- CHECK(`puzzle_mode` IS NULL OR `puzzle_mode` IN ('word', 'combination', 'cipher'))
- UNIQUE(`npc_id`) - One-to-one with scriptable_npcs
- FOREIGN KEY `puzzle_reward_item_id` → `items(id)`

**Relationships:**
- One-to-one: `lore_keepers` → `scriptable_npcs` (via `npc_id` UNIQUE)
- One-to-many: `lore_keepers` → `lore_keeper_greetings` (via `lore_keeper_greetings.npc_id`)
- One-to-many: `lore_keepers` → `lore_keeper_item_awards` (via `lore_keeper_item_awards.npc_id`)

**Evidence:** 
- `migrations/004_lore_keepers.sql`
- `migrations/082_convert_lore_keeper_reward_to_item_id.sql`
- `database.js:1186-1322` - Conversion functions

---

### `lore_keeper_greetings`
**Purpose:** Tracks which players have been greeted by which lore keepers  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `npc_id` INTEGER NOT NULL REFERENCES scriptable_npcs(id) ON DELETE CASCADE
- `first_greeted_at` TIMESTAMP NOT NULL DEFAULT NOW()
- `last_greeted_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Constraints:**
- UNIQUE(`player_id`, `npc_id`)

**Relationships:**
- Many-to-one: `lore_keeper_greetings` → `players` (via `player_id`)
- Many-to-one: `lore_keeper_greetings` → `scriptable_npcs` (via `npc_id`)

**Evidence:** `migrations/005_lore_keeper_greetings.sql`

---

### `lore_keeper_item_awards`
**Purpose:** Tracks items awarded to players by lore keepers  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `npc_id` INTEGER NOT NULL REFERENCES scriptable_npcs(id) ON DELETE CASCADE
- `item_name` TEXT NOT NULL (legacy - kept for rollback)
- `item_id` INTEGER NOT NULL REFERENCES items(id) (**Migration 083: converted from item_name**)
- `awarded_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Constraints:**
- UNIQUE(`player_id`, `npc_id`, `item_id`) - Prevents duplicate awards
- FOREIGN KEY `item_id` → `items(id)`

**Relationships:**
- Many-to-one: `lore_keeper_item_awards` → `players` (via `player_id`)
- Many-to-one: `lore_keeper_item_awards` → `scriptable_npcs` (via `npc_id`)
- Many-to-one: `lore_keeper_item_awards` → `items` (via `item_id`)

**Evidence:** 
- `migrations/009_lore_keeper_item_awards.sql` (original schema)
- `migrations/083_convert_lore_keeper_awards_to_item_id.sql` (conversion migration)
- `database.js:1334-1512` - Functions use `item_id` with JOIN to return `item_name`

---

## 2.6 Merchant System Tables

### `merchant_items`
**Purpose:** Shop inventory in merchant rooms  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `item_id` INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE
- `room_id` INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE
- `quantity` INTEGER NOT NULL DEFAULT -1 (-1 = unlimited)
- `price` INTEGER (nullable, migration 016)
- `config_json` JSONB (nullable, migration 016)
- `created_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`item_id`, `room_id`)

**Relationships:**
- Many-to-one: `merchant_items` → `items` (via `item_id`)
- Many-to-one: `merchant_items` → `rooms` (via `room_id`)

**Evidence:** `migrations/015_merchant_items_system.sql`, `migrations/016_merchant_pricing_fields.sql`

---

## 2.7 Factory System Tables

### `factory_recipes`
**Purpose:** Crafting recipe definitions for factory system  
**Fields:**
- `recipe_id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `description` TEXT
- `required_ingredients` JSONB NOT NULL DEFAULT '[]' (array format: [{"item_id": 42, "quantity": 5}])
- `required_runes` JSONB NOT NULL DEFAULT '[]' (array of rune types: ["SPEED", "EFFICIENCY"])
- `output_items` JSONB NOT NULL DEFAULT '[]' (array format: [{"item_id": 456, "quantity": 1}])
- `success_rate` NUMERIC NOT NULL DEFAULT 70.00
- `required_stats` JSONB (nullable, stat requirements)
- `crafting_time_ms` INTEGER NOT NULL DEFAULT 5000
- `return_rate_on_fail` NUMERIC NOT NULL DEFAULT 0.50
- `factory_tier_required` INTEGER NOT NULL DEFAULT 1
- `byproducts` JSONB (nullable, array format: [{"item_id": 789, "quantity": X, "chance": Y}])
- `allow_rune_substitution` BOOLEAN NOT NULL DEFAULT FALSE
- `allow_wildcard_runes` BOOLEAN NOT NULL DEFAULT FALSE
- `active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` BIGINT NOT NULL

**Constraints:**
- UNIQUE(`name`)
- CHECK: `required_runes` cannot include 'PRODUCTION' (enforced in application code)

**JSONB Structure - `required_ingredients` / `output_items` / `byproducts`:**
- Format: `[{"item_id": integer, "quantity": integer}]`
- For byproducts: `[{"item_id": integer, "quantity": integer, "chance": number}]`
- Converted to item names by `database.js` helper functions for application use

**Relationships:**
- One-to-many: `factory_recipes` → `factory_events` (via `factory_events.recipe_id`)
- JSONB references: `required_ingredients`, `output_items`, `byproducts` contain `item_id` values referencing `items(id)`

**Evidence:** 
- `migrations/070_create_factory_recipes.sql`
- `migrations/084_convert_factory_ingredients_to_item_ids.sql`
- `migrations/085_convert_factory_outputs_to_item_ids.sql`
- `migrations/086_convert_factory_byproducts_to_item_ids.sql`
- `database.js:1682-1820` - Conversion functions

---

### `factory_events`
**Purpose:** Factory crafting event log for analytics and automation  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `event_type` TEXT NOT NULL (FACTORY_CRAFT_STARTED, FACTORY_CRAFT_SUCCESS, FACTORY_CRAFT_FAILED, FACTORY_CRAFT_CRITICAL, FACTORY_CRAFT_FIZZLE, FACTORY_OUTPUT_CREATED)
- `factory_room_id` INTEGER REFERENCES rooms(id) ON DELETE SET NULL
- `player_id` INTEGER REFERENCES players(id) ON DELETE SET NULL
- `recipe_id` INTEGER REFERENCES factory_recipes(recipe_id) ON DELETE SET NULL
- `item_id` INTEGER REFERENCES items(id) ON DELETE SET NULL
- `quantity` INTEGER
- `metadata` JSONB (nullable, additional event data)
- `timestamp` TIMESTAMP NOT NULL DEFAULT NOW()

**Constraints:**
- CHECK(`event_type` IN ('FACTORY_CRAFT_STARTED', 'FACTORY_CRAFT_SUCCESS', 'FACTORY_CRAFT_FAILED', 'FACTORY_CRAFT_CRITICAL', 'FACTORY_CRAFT_FIZZLE', 'FACTORY_OUTPUT_CREATED'))

**Relationships:**
- Many-to-one: `factory_events` → `rooms` (via `factory_room_id`, nullable, SET NULL on delete)
- Many-to-one: `factory_events` → `players` (via `player_id`, nullable, SET NULL on delete)
- Many-to-one: `factory_events` → `factory_recipes` (via `recipe_id`, nullable, SET NULL on delete)
- Many-to-one: `factory_events` → `items` (via `item_id`, nullable, SET NULL on delete)

**Evidence:** `migrations/072_create_factory_events.sql`

---

## 2.8 Configuration Tables

### `harvest_formula_config`
**Purpose:** Formula parameters for harvest calculations  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `config_key` TEXT NOT NULL UNIQUE
- `description` TEXT
- `min_resonance` INTEGER
- `min_value` NUMERIC
- `max_resonance` INTEGER
- `max_value` NUMERIC
- `curve_exponent` NUMERIC
- `updated_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Evidence:** `migrations/030_add_harvest_formula_config.sql`

---

### `item_types`
**Purpose:** Item type definitions  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `item_type` TEXT NOT NULL UNIQUE
- `description` TEXT

**Evidence:** `migrations/013_item_types_system.sql`

---

### `room_type_colors`
**Purpose:** Room type styling configuration  
**Fields:**
- `room_type` TEXT PRIMARY KEY
- `color` TEXT NOT NULL DEFAULT '#00ff00'

**Evidence:** `migrations/001_schema.sql:125-128`

---

### `game_messages`
**Purpose:** Message templates  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `message_key` TEXT NOT NULL UNIQUE
- `message_text` TEXT NOT NULL
- `message_type` TEXT (nullable)

**Evidence:** `migrations/038_game_messages.sql`

---

### `markup_conventions`
**Purpose:** Custom markup syntax definitions  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `syntax` TEXT NOT NULL UNIQUE
- `description` TEXT
- `active` BOOLEAN NOT NULL DEFAULT TRUE

**Evidence:** `migrations/059_create_markup_tables.sql:5-12`

---

### `markup_builtin_edits`
**Purpose:** Built-in markup overrides  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `convention_key` TEXT NOT NULL UNIQUE
- `override_html` TEXT NOT NULL

**Evidence:** `migrations/059_create_markup_tables.sql:19-25`

---

## 2.9 RAG/Knowledge System Tables

### `zork_knowledge`
**Purpose:** Vectorized knowledge base for RAG system  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `category` TEXT NOT NULL (core_identity, command_knowledge, world_lore, interaction_patterns, learned_context, system_docs, game_design, technical)
- `subcategory` TEXT (nullable)
- `title` TEXT NOT NULL
- `content` TEXT NOT NULL
- `embedding` vector(1536) (nullable, requires pgvector extension)
- `priority` INTEGER DEFAULT 0 (0=contextual, 1=important, 2=always-include)
- `source` TEXT DEFAULT 'system' ('system', 'zork', 'cursor')
- `added_by` TEXT (nullable)
- `active` BOOLEAN DEFAULT TRUE (soft delete)
- `created_at` BIGINT NOT NULL
- `updated_at` BIGINT NOT NULL

**Indexes:**
- `idx_zork_knowledge_category_priority` on (category, priority, active)
- `idx_zork_knowledge_source` on (source)
- `idx_zork_knowledge_embedding` ivfflat index on embedding (pgvector)

**Evidence:** `migrations/060_zork_knowledge_system.sql`

---

## 2.10 Debug System Tables

### `debug_sessions`
**Purpose:** Debug observation sessions  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER REFERENCES players(id) ON DELETE CASCADE
- `bug_label` TEXT NOT NULL
- `active` BOOLEAN NOT NULL DEFAULT TRUE
- `started_at` TIMESTAMP NOT NULL DEFAULT NOW()
- `ended_at` TIMESTAMP (nullable)

**Relationships:**
- Many-to-one: `debug_sessions` → `players` (via `player_id`)
- One-to-many: `debug_sessions` → `debug_todos` (via `debug_todos.session_id`)

**Evidence:** `migrations/061_debug_todos.sql:5-13`

---

### `debug_todos`
**Purpose:** Bug tickets with rich context  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `session_id` INTEGER REFERENCES debug_sessions(id) ON DELETE SET NULL
- `player_id` INTEGER REFERENCES players(id) ON DELETE SET NULL (migration 063)
- `player_name` TEXT (migration 063)
- `status` TEXT NOT NULL DEFAULT 'open' (open, in_progress, resolved, deleted, backlog)
- `priority` INTEGER NOT NULL DEFAULT 2 (1=low, 2=medium, 3=high, 4=critical, migration 067)
- `ticket_type` TEXT DEFAULT 'debug' (bug, feature, debug, migration 068)
- `title` TEXT NOT NULL
- `description` TEXT NOT NULL
- `repro_steps` TEXT (nullable)
- `environment` JSONB (nullable)
- `logs` JSONB (nullable)
- `resolution_notes` TEXT (nullable)
- `created_by` TEXT DEFAULT 'cursor'
- `created_at` TIMESTAMP NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Constraints:**
- CHECK(`status` IN ('open', 'in_progress', 'resolved', 'deleted', 'backlog'))
- CHECK(`priority` >= 1 AND `priority` <= 4)
- CHECK(`ticket_type` IN ('bug', 'feature', 'debug'))

**Relationships:**
- Many-to-one: `debug_todos` → `debug_sessions` (via `session_id`, nullable, SET NULL on delete)
- Many-to-one: `debug_todos` → `players` (via `player_id`, nullable, SET NULL on delete)

**Evidence:** 
- `migrations/061_debug_todos.sql:15-34`
- `migrations/062_extend_debug_todos_tickets.sql`
- `migrations/063_add_player_fields_to_tickets.sql`
- `migrations/065_add_ticket_deleted_status.sql`
- `migrations/066_add_backlog_status.sql`
- `migrations/067_update_priority_system.sql`
- `migrations/068_update_ticket_types.sql`

---

## 2.11 Authentication Tables

### `email_verification_tokens`
**Purpose:** Email verification tokens  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `email` TEXT NOT NULL
- `token` TEXT NOT NULL UNIQUE
- `expires_at` BIGINT NOT NULL
- `created_at` BIGINT NOT NULL

**Evidence:** `migrations/024_email_verification_tokens.sql`

---

### `password_reset_tokens`
**Purpose:** Password reset tokens  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `email` TEXT NOT NULL
- `token` TEXT NOT NULL UNIQUE
- `expires_at` BIGINT NOT NULL
- `created_at` BIGINT NOT NULL

**Evidence:** `migrations/024_email_verification_tokens.sql` (likely in same migration)

---

## 2.12 Broadcast System Tables

### `broadcast_groups`
**Purpose:** Named groups of players for broadcast communication  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `created_at` BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
- `created_by_player_id` INTEGER REFERENCES players(id) ON DELETE SET NULL

**Relationships:**
- One-to-many: `broadcast_groups` → `broadcast_group_members` (via `broadcast_group_members.group_id`)
- One-to-many: `broadcast_groups` → `broadcast_messages` (via `broadcast_messages.group_id`)
- Many-to-one: `broadcast_groups` → `players` (via `created_by_player_id`)

**Evidence:** `migrations/088_create_broadcast_system.sql:4-10`

---

### `broadcast_group_members`
**Purpose:** Player membership in broadcast groups  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `group_id` INTEGER NOT NULL REFERENCES broadcast_groups(id) ON DELETE CASCADE
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `joined_at` BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000

**Constraints:**
- UNIQUE(`group_id`, `player_id`) - Player can only be member once per group

**Relationships:**
- Many-to-one: `broadcast_group_members` → `broadcast_groups` (via `group_id`)
- Many-to-one: `broadcast_group_members` → `players` (via `player_id`)

**Evidence:** `migrations/088_create_broadcast_system.sql:12-18`

---

### `broadcast_messages`
**Purpose:** Message history for broadcast groups  
**Fields:**
- `id` SERIAL PRIMARY KEY
- `group_id` INTEGER NOT NULL REFERENCES broadcast_groups(id) ON DELETE CASCADE
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `message` TEXT NOT NULL
- `created_at` BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000

**Relationships:**
- Many-to-one: `broadcast_messages` → `broadcast_groups` (via `group_id`)
- Many-to-one: `broadcast_messages` → `players` (via `player_id`)

**Indexes:**
- `idx_broadcast_messages_group_id` - For querying group message history
- `idx_broadcast_messages_created_at` - For chronological ordering

**Evidence:** `migrations/088_create_broadcast_system.sql:20-26`

---

## 2.13 Metadata Tables

### `stat_metadata`
**Purpose:** Stat definitions and descriptions  
**Fields:**
- `stat_name` TEXT PRIMARY KEY
- `description` TEXT NOT NULL

**Evidence:** Referenced in `docs/requirements.md:566-577`, but not found in migrations - may be planned but not implemented

---

### `ability_metadata`
**Purpose:** Ability definitions and descriptions  
**Fields:**
- `ability_name` TEXT PRIMARY KEY
- `description` TEXT NOT NULL

**Evidence:** Referenced in `docs/requirements.md:566-577`, but not found in migrations - may be planned but not implemented

---

# 3. Item Reference System (Critical Architecture Change)

## 3.1 Direct Foreign Key Relationships (Current State)

**Tables using `item_id` INTEGER foreign keys:**
- `player_items.item_id` → `items(id)` (migration 076)
- `warehouse_items.item_id` → `items(id)` (migration 077)
- `scriptable_npcs.harvest_prerequisite_item_id` → `items(id)` (migration 078)
- `scriptable_npcs.puzzle_reward_item_id` → `items(id)` (migration 081)
- `lore_keepers.puzzle_reward_item_id` → `items(id)` (migration 082)
- `lore_keeper_item_awards.item_id` → `items(id)` (migration 083)
- `merchant_items.item_id` → `items(id)` (original schema)

**Tables still using `item_name` TEXT (name-based references):**
- `room_items.item_name` → `items.name` (no FK constraint, migration pending or reverted)

**JSONB Fields using `item_id` keys (as strings):**
- `scriptable_npcs.input_items` - Format: `{"42": 5}` (migration 079)
- `scriptable_npcs.output_items` - Format: `{"42": 5}` (migration 080)
- `factory_recipes.required_ingredients` - Format: `[{"item_id": 42, "quantity": 5}]` (migration 084)
- `factory_recipes.output_items` - Format: `[{"item_id": 456, "quantity": 1}]` (migration 085)
- `factory_recipes.byproducts` - Format: `[{"item_id": 789, "quantity": X, "chance": Y}]` (migration 086)

**Evidence:**
- All conversion migrations (076-086)
- `database.js:1492-1657` - Helper functions for conversion

---

## 3.2 Conversion Helper Functions

**Location:** `database.js:1548-1657`

### `convertItemIdsToNames(itemsJsonb)`
**Purpose:** Convert JSONB object with `item_id` (string) keys to `item_name` keys  
**Input:** `{"42": 5, "43": 1}`  
**Output:** `{"Pulse Resin": 5, "Raw Fiber": 1}`  
**Usage:** Called when reading NPC `input_items`/`output_items` for application compatibility

**Evidence:** `database.js:1548-1576`

---

### `convertItemNamesToIds(itemsJsonb)`
**Purpose:** Convert JSONB object with `item_name` keys to `item_id` (string) keys  
**Input:** `{"Pulse Resin": 5, "Raw Fiber": 1}`  
**Output:** `{"42": 5, "43": 1}`  
**Usage:** Called when saving NPC `input_items`/`output_items` from editor

**Evidence:** `database.js:1578-1609`

---

### `convertItemArrayIdsToNames(itemsArray)`
**Purpose:** Convert array of objects with `item_id` to `item_name`  
**Input:** `[{"item_id": 42, "quantity": 5}]`  
**Output:** `[{"item_name": "Pulse Resin", "quantity": 5}]`  
**Usage:** Called when reading factory recipe arrays for application compatibility

**Evidence:** `database.js:1621-1657`

---

### `convertItemArrayNamesToIds(itemsArray)`
**Purpose:** Convert array of objects with `item_name` to `item_id`  
**Input:** `[{"item_name": "Pulse Resin", "quantity": 5}]`  
**Output:** `[{"item_id": 42, "quantity": 5}]`  
**Usage:** Called when saving factory recipe arrays from editor

**Evidence:** `database.js:1578-1619`

---

## 3.3 Backward Compatibility Strategy

**Pattern:** Database stores `item_id`, application code receives `item_name`

**Implementation:**
1. **Reading (item_id → item_name):**
   - `getAllScriptableNPCs()`: Converts `input_items` and `output_items` before returning
   - `getScriptableNPCById()`: Converts `input_items` and `output_items` before returning
   - `getAllActiveNPCs()`: Converts `input_items` and `output_items` before returning
   - `getFactoryRecipes()`: Converts `required_ingredients`, `output_items`, `byproducts` before returning
   - `getFactoryRecipeById()`: Converts arrays before returning
   - `getFactoryRecipeByName()`: Converts arrays before returning
   - `getPlayerItems()`: JOINs `items` table to return `item_name` alongside `item_id`
   - `getWarehouseItems()`: JOINs `items` table to return `item_name` alongside `item_id`
   - `getLoreKeeperItemAwards()`: JOINs `items` table to return `item_name` alongside `item_id`
   - `getLoreKeeperByNpcId()`: Converts `puzzle_reward_item_id` to `puzzle_reward_item` (item name)
   - `getLoreKeepersInRoom()`: Converts `puzzle_reward_item_id` to `puzzle_reward_item` (item name)
   - `getNPCsInRoom()`: Converts `puzzle_reward_item_id` to `puzzle_reward_item` (item name)

2. **Writing (item_name → item_id):**
   - `createScriptableNPC()`: Converts `input_items` and `output_items` before saving
   - `updateScriptableNPC()`: Converts `input_items` and `output_items` before saving
   - `createFactoryRecipe()`: Converts arrays before saving
   - `updateFactoryRecipe()`: Converts arrays before saving
   - `addPlayerItem()`: Looks up `item_id` from `itemName` parameter
   - `removePlayerItem()`: Looks up `item_id` from `itemName` parameter
   - `addWarehouseItem()`: Looks up `item_id` from `itemName` parameter
   - `removeWarehouseItem()`: Looks up `item_id` from `itemName` parameter
   - `createLoreKeeper()`: Converts `puzzle_reward_item` (item name) to `puzzle_reward_item_id`
   - `updateLoreKeeper()`: Converts `puzzle_reward_item` (item name) to `puzzle_reward_item_id`
   - `recordLoreKeeperItemAward()`: Looks up `item_id` from `itemName` parameter
   - `hasPlayerBeenAwardedItemByLoreKeeper()`: Looks up `item_id` from `itemName` parameter
   - `getLastLoreKeeperItemAwardTime()`: Looks up `item_id` from `itemName` parameter

**Evidence:** 
- `database.js:721-794` - All conversion logic
- `database.js:1923-1985` - Player items functions
- `database.js:1991-2115` - Warehouse items functions
- `database.js:1186-1322` - Lore keeper functions
- `database.js:1682-1820` - Factory recipe functions

---

# 4. All Subsystem Operations (Read/Write Patterns)

## 4.1 Game Handlers (`handlers/game.js`)

**Read Operations:**
- `getPlayerById()`, `getPlayerByName()` - Player data
- `getRoomById()`, `getRoomByCoords()` - Room data
- `getPlayerItems()` - Inventory (returns `item_name` from JOIN, `database.js:1923`)
- `getRoomItems()` - Ground items (returns `item_name`)
- `getNPCsInRoom()` - NPCs in room (returns `puzzle_reward_item` as item name)
- `getLoreKeepersInRoom()` - Lore keepers (returns `puzzle_reward_item` as item name)
- `getAllActiveNPCs()` - All NPCs (returns `input_items`/`output_items` with item names)
- `getFactoryRecipes()` - Recipes (returns arrays with `item_name`)

**Write Operations:**
- `updatePlayer()` - Player stats, location, resources
- `addPlayerItem()`, `removePlayerItem()` - Inventory (accepts `itemName`, converts to `item_id`)
- `addRoomItem()`, `removeRoomItem()` - Ground items (uses `item_name` directly)
- `updateNPCState()` - NPC state updates
- `addPlayerItem()` - Award items (accepts `itemName`, converts to `item_id`)
- `recordLoreKeeperItemAward()` - Award tracking (accepts `itemName`, converts to `item_id`)

**Evidence:** `handlers/game.js` - All command handlers use database.js functions

---

## 4.2 Editors (`handlers/*Editor.js`)

**Read Operations:**
- `getAllScriptableNPCs()` - NPC list (returns `input_items`/`output_items` with item names)
- `getScriptableNPCById()` - Single NPC (returns `input_items`/`output_items` with item names)
- `getFactoryRecipes()` - Recipe list (returns arrays with `item_name`)
- `getFactoryRecipeById()` - Single recipe (returns arrays with `item_name`)
- `getLoreKeeperByNpcId()` - Lore keeper (returns `puzzle_reward_item` as item name)
- `getLoreKeeperItemAwards()` - Award history (returns `item_name` from JOIN)

**Write Operations:**
- `createScriptableNPC()`, `updateScriptableNPC()` - NPC editing (accepts `input_items`/`output_items` with item names, converts to `item_id`)
- `createFactoryRecipe()`, `updateFactoryRecipe()` - Recipe editing (accepts arrays with `item_name`, converts to `item_id`)
- `createLoreKeeper()`, `updateLoreKeeper()` - Lore keeper editing (accepts `puzzle_reward_item` as item name, converts to `puzzle_reward_item_id`)

**Evidence:** 
- `handlers/npcEditor.js`
- `handlers/craftingEditor.js`
- `public/gameeditors/npc-editor.js` - Frontend expects item names

---

## 4.3 NPC Engine (`npcLogic.js`, `services/npcCycleEngine.js`)

**Read Operations:**
- `getAllActiveNPCs()` - All NPCs (receives `input_items`/`output_items` with item names)
- `getNPCsInRoom()` - Room NPCs (receives `puzzle_reward_item` as item name)

**Write Operations:**
- `updateNPCState()` - NPC state updates
- `addRoomItem()` - Item production (uses `item_name` directly)
- `addPlayerItem()` - Item awards (accepts `itemName`, converts to `item_id`)

**Evidence:** 
- `npcLogic.js`
- `services/npcCycleEngine.js`
- Both consume NPC data with item names (converted by database.js)

---

## 4.4 Factory Engine (`services/factoryCraftingEngine.js`, `services/factoryRecipeMatcher.js`)

**Read Operations:**
- `getFactoryRecipes()` - Recipes (receives arrays with `item_name`)
- `getFactoryRecipeById()` - Single recipe (receives arrays with `item_name`)

**Write Operations:**
- `addRoomItem()`, `addPlayerItem()` - Item creation/consumption (uses `item_name` directly or accepts `itemName`)

**Evidence:** 
- `services/factoryCraftingEngine.js`
- `services/factoryRecipeMatcher.js:48-90` - Uses `item_name` or `itemName` properties

---

# 5. Validations + Missing Validations

## 5.1 Database-Enforced Validations

**Foreign Key Constraints:**
- All `item_id` columns have FOREIGN KEY → `items(id)`
- All `player_id` columns have FOREIGN KEY → `players(id)`
- All `room_id` columns have FOREIGN KEY → `rooms(id)`
- All `npc_id` columns have FOREIGN KEY → `scriptable_npcs(id)`

**NOT NULL Constraints:**
- All primary keys
- All foreign keys (except nullable ones)
- Critical fields: `name`, `description`, `quantity`, etc.

**Unique Constraints:**
- `players.name`, `items.name`, `scriptable_npcs.name`, `factory_recipes.name`
- `rooms(map_id, x, y)`
- `player_items(player_id, item_id)`
- `warehouse_items(player_id, warehouse_location_key, item_id)`
- `lore_keeper_item_awards(player_id, npc_id, item_id)`
- `lore_keepers.npc_id` (one-to-one)

**Check Constraints:**
- `accounts.email` - Email format
- `lore_keepers.lore_type` - IN ('dialogue', 'puzzle')
- `lore_keepers.puzzle_mode` - IN ('word', 'combination', 'cipher')
- `items.rune_type` - IN ('PRODUCTION', 'SPEED', 'EFFICIENCY') or NULL
- `scriptable_npcs.puzzle_type` - IN ('none', 'glow_codex')
- `scriptable_npcs.output_distribution` - IN ('ground', 'player', 'all_players')
- `factory_events.event_type` - IN (6 event types)
- `debug_todos.status` - Implicit enum
- `debug_todos.priority` - >= 1 AND <= 4
- `debug_todos.ticket_type` - IN ('bug', 'feature', 'debug')
- `rooms.factory_tier` - >= 1 AND <= 5 (if not NULL)

**Evidence:** All migrations define constraints

---

## 5.2 Application-Enforced Validations

**Item Name Lookup:**
- `getItemByName()` - Case-insensitive lookup with space/underscore normalization
- Returns null if item not found
- Used before converting `item_name` → `item_id`

**NPC Input/Output Validation:**
- `harvest()` command validates player has required `input_items` (by item name after conversion)
- `checkAndAutoHarvest()` validates prerequisites (by item name after conversion)

**Factory Recipe Validation:**
- `matchIngredients()` validates slot ingredients match recipe requirements (by item name after conversion)
- `checkStatRequirements()` validates player stats meet recipe requirements

**Evidence:** 
- `database.js:1611-1616` - `getItemByName()` function
- `handlers/game.js:2200-2300` - Harvest validation
- `services/factoryRecipeMatcher.js:22-90` - Recipe matching

---

## 5.3 Missing Validations (Not Enforced in Code)

**Invariant NOT enforced:**
- `room_items.item_name` has no FOREIGN KEY constraint (name-based reference, no referential integrity)
- `factory_recipes.required_runes` cannot include 'PRODUCTION' - enforced in application code only, not database constraint
- JSONB `item_id` values in `scriptable_npcs.input_items`/`output_items` are not validated against `items` table (no FK constraint on JSONB contents)
- JSONB `item_id` values in `factory_recipes` arrays are not validated against `items` table (no FK constraint on JSONB contents)

**Evidence:** 
- No FK constraint on `room_items.item_name`
- No CHECK constraint on `factory_recipes.required_runes`
- PostgreSQL does not support FK constraints on JSONB array contents

---

# 6. Behavioral Rules / Invariants

## 6.1 Item Reference Rules

**Rule 1:** All item references MUST use `item_id` INTEGER foreign keys when possible  
**Enforcement:** Database constraints + migration system  
**Exceptions:** `room_items.item_name` (migration pending), JSONB arrays (use `item_id` as values)

**Rule 2:** Application code MUST receive `item_name` for display/editing  
**Enforcement:** `database.js` helper functions convert `item_id` → `item_name` on read

**Rule 3:** Application code MAY send `item_name` when writing  
**Enforcement:** `database.js` helper functions convert `item_name` → `item_id` on write

**Evidence:** All conversion functions in `database.js:1548-1657`

---

## 6.2 NPC Cycle Rules

**Rule 1:** NPCs cycle based on `base_cycle_time`  
**Enforcement:** `services/npcCycleEngine.js` - Cycle timing logic

**Rule 2:** NPCs require `input_items` to be consumed before production  
**Enforcement:** `handlers/game.js:2200-2300` - Harvest validation

**Rule 3:** NPCs produce `output_items` after successful cycle  
**Enforcement:** `npcLogic.js` - Production logic

**Rule 4:** NPCs may require `harvest_prerequisite_item_id` to be in player inventory  
**Enforcement:** `handlers/game.js:2200-2300` - Prerequisite check

**Evidence:** Game handler and NPC engine code

---

## 6.3 Factory Recipe Rules

**Rule 1:** `required_runes` MUST NOT include 'PRODUCTION'  
**Enforcement:** Application code in `database.js:1729-1733`, `database.js:1770-1776`  
**Invariant NOT enforced:** No database constraint

**Rule 2:** Recipe matching requires exact ingredient quantities (adjusted by efficiency modifier)  
**Enforcement:** `services/factoryRecipeMatcher.js:22-90`

**Rule 3:** Recipe success rate calculated from base rate + stat factor + overcharge + quirk modifier  
**Enforcement:** `services/factoryCraftingEngine.js:59-99`

**Evidence:** Factory service code

---

## 6.4 Player State Rules

**Rule 1:** `resource_vitalis` MUST NOT exceed `resource_max_vitalis`  
**Enforcement:** `database.js:468-474` - `updatePlayerVitalis()` caps at max

**Rule 2:** `resource_vitalis` MUST NOT be negative  
**Enforcement:** `database.js:468-474` - Validation in update function

**Rule 3:** Player inventory encumbrance = sum(item.encumbrance * quantity)  
**Enforcement:** `database.js:1976-1985` - `getPlayerCurrentEncumbrance()` calculates from JOIN

**Evidence:** `database.js` validation functions

---

# 7. State Transitions (with file references)

## 7.1 Player Movement

**Transition:** `players.current_room_id` changes  
**Files:** `handlers/game.js:800-950` - Movement commands  
**Database:** `database.js:461-469` - `updatePlayerRoom()`

---

## 7.2 Inventory Changes

**Transition:** `player_items` INSERT/UPDATE/DELETE  
**Files:** `handlers/game.js:1400-1500` - take/drop commands  
**Database:** `database.js:1935-1974` - `addPlayerItem()`, `removePlayerItem()`

---

## 7.3 NPC Harvest Cycle

**Transition:** `room_npcs.state` JSON updates  
**Files:** `handlers/game.js:2200-2400` - harvest command  
**Files:** `services/npcCycleEngine.js` - Auto-harvest cycles  
**Database:** `database.js:1070-1120` - `updateNPCState()`

---

## 7.4 Factory Crafting

**Transition:** `factory_events` INSERT (event log)  
**Files:** `handlers/game.js:4000-4500` - factory craft command  
**Database:** `database.js:1832-1900` - `createFactoryEvent()`

---

# 8. Interactions with Other Systems

## 8.1 Game Handlers → Database

**Pattern:** All handlers import `database.js` and use helper functions  
**Files:** `handlers/game.js`, `handlers/index.js`  
**Evidence:** All handlers use `db.*` functions

---

## 8.2 Editors → Database

**Pattern:** Editors use same `database.js` functions, receive converted data  
**Files:** `handlers/npcEditor.js`, `handlers/craftingEditor.js`  
**Evidence:** Editors receive item names, send item names, conversion happens in database.js

---

## 8.3 NPC Engine → Database

**Pattern:** NPC engine reads NPC definitions, updates NPC state  
**Files:** `npcLogic.js`, `services/npcCycleEngine.js`  
**Evidence:** Consumes `getAllActiveNPCs()` which returns item names

---

## 8.4 Factory Engine → Database

**Pattern:** Factory engine reads recipes, creates events  
**Files:** `services/factoryCraftingEngine.js`, `services/factoryRecipeMatcher.js`  
**Evidence:** Consumes `getFactoryRecipes()` which returns item names

---

## 8.5 Broadcast/Serialization Layer

**Pattern:** Data sent to client includes `item_name` for display  
**Files:** `handlers/game.js` - All WebSocket responses  
**Evidence:** All inventory/item data includes `item_name` field

---

# 9. Failure States and Messages

## 9.1 Database Operation Failures

**Foreign Key Violations:**
- Error: "violates foreign key constraint"
- Occurs when: Referencing non-existent `item_id`, `player_id`, `room_id`, etc.
- Handling: Database throws error, caught by try/catch in handlers

**Unique Constraint Violations:**
- Error: "duplicate key value violates unique constraint"
- Occurs when: Duplicate `(player_id, item_id)` in `player_items`, etc.
- Handling: Database throws error, caught by try/catch in handlers

**Evidence:** PostgreSQL error codes in `database.js` error handling

---

## 9.2 Item Lookup Failures

**Item Not Found:**
- Scenario: `getItemByName()` returns null
- Handling: 
  - `convertItemNamesToIds()`: Warns and keeps original (for backward compatibility)
  - `addPlayerItem()`: Throws error or returns false
  - `recordLoreKeeperItemAward()`: Throws error

**Evidence:** `database.js:1598-1612` - Item lookup error handling

---

## 9.3 Validation Failures

**Missing Required Items:**
- Scenario: Player doesn't have required `input_items` for harvest
- Message: "You need [item name] to harvest this."
- Handling: `handlers/game.js:2200-2300` - Validation before harvest

**Missing Prerequisites:**
- Scenario: Player doesn't have `harvest_prerequisite_item_id`
- Message: Custom message from `harvest_prerequisite_message` field
- Handling: `handlers/game.js:2200-2300` - Prerequisite check

**Evidence:** `handlers/game.js` - All validation logic

---

# 10. Serialization Paths

## 10.1 Client-Bound Data

**Player Inventory:**
- Source: `getPlayerItems()` - Returns `{item_id, item_name, quantity}`
- Sent as: `{item_name, quantity}` (item_id omitted for client)
- File: `handlers/game.js:1400-1500` - Inventory responses

**Room Items:**
- Source: `getRoomItems()` - Returns `{item_name, quantity}`
- Sent as: `{item_name, quantity}`
- File: `handlers/game.js:1200-1300` - Room update responses

**NPC Data:**
- Source: `getNPCsInRoom()` - Returns NPCs with `puzzle_reward_item` as item name
- Sent as: Full NPC object with item names
- File: `handlers/game.js:900-1100` - Room update responses

**Factory Recipes:**
- Source: `getFactoryRecipes()` - Returns recipes with arrays containing `item_name`
- Sent as: Full recipe objects with item names
- File: `handlers/craftingEditor.js` - Recipe list responses

**Evidence:** All WebSocket message construction in handlers

---

## 10.2 Editor-Bound Data

**NPC Editor:**
- Receives: NPCs with `input_items`/`output_items` as objects with `item_name` keys
- Sends: NPCs with `input_items`/`output_items` as objects with `item_name` keys
- Conversion: Happens in `database.js` automatically

**Crafting Editor:**
- Receives: Recipes with arrays containing `item_name`
- Sends: Recipes with arrays containing `item_name`
- Conversion: Happens in `database.js` automatically

**Evidence:** 
- `public/gameeditors/npc-editor.js` - Frontend expects item names
- `handlers/npcEditor.js` - Backend converts automatically

---

# 11. Known Gaps, Missing Features, or TODOs

## 11.1 Pending Migrations

**`room_items.item_name` → `item_id`:**
- Status: Marked as completed in `1001-database-cleanup.md:50-54`, but database schema shows `item_name` still exists
- Impact: No referential integrity for ground items
- Evidence: Database query shows `room_items` still has `item_name` column

---

## 11.2 Legacy Columns (Kept for Rollback Safety)

**Temporary columns (can be dropped after verification):**
- `scriptable_npcs.harvest_prerequisite_item` (TEXT) - Replaced by `harvest_prerequisite_item_id`
- `scriptable_npcs.puzzle_reward_item` (TEXT) - Replaced by `puzzle_reward_item_id`
- `lore_keepers.puzzle_reward_item` (TEXT) - Replaced by `puzzle_reward_item_id`
- `lore_keeper_item_awards.item_name` (TEXT) - Replaced by `item_id`

**Evidence:** All conversion migrations keep old columns temporarily

---

## 11.3 Missing Constraints

**Not Enforced:**
- `factory_recipes.required_runes` cannot include 'PRODUCTION' - Application code only
- JSONB `item_id` values in NPC/recipe JSONB fields - No FK constraint on JSONB contents
- `room_items.item_name` - No FK constraint (name-based reference)

**Evidence:** No database constraints for these cases

---

## 11.4 Metadata Tables Not Found

**Referenced but not implemented:**
- `stat_metadata` - Referenced in docs, not found in migrations
- `ability_metadata` - Referenced in docs, not found in migrations

**Evidence:** `docs/requirements.md:566-577` mentions these, but no migration creates them

---

# 12. Summary of Strengths, Weaknesses, Risks

## 12.1 Strengths

1. **Referential Integrity:** Most item references use direct foreign keys (`item_id`)
2. **Backward Compatibility:** Conversion functions allow gradual migration
3. **Type Safety:** Foreign key constraints prevent orphaned references
4. **Performance:** Indexes on all foreign keys and unique constraints
5. **Migration System:** Sequential, transactional, idempotent migrations

---

## 12.2 Weaknesses

1. **Incomplete Migration:** `room_items` still uses `item_name` (no FK constraint)
2. **JSONB Validation:** No FK constraints on JSONB array contents (application-level only)
3. **Legacy Columns:** Old columns kept temporarily, adds confusion
4. **Name-Based References:** `room_items.item_name` has no referential integrity

---

## 12.3 Risks

1. **Data Integrity:** `room_items.item_name` can reference non-existent items
2. **Orphaned Data:** If item deleted, JSONB references become invalid (no cascade)
3. **Migration Order:** Must apply migrations 076-086 in sequence
4. **Conversion Errors:** If item lookup fails during conversion, data may be lost or invalid

---

# 13. File References

**Core Schema:**
- `migrations/001_schema.sql` - Core table definitions
- `migrations/002-086_*.sql` - All subsequent migrations

**Conversion Migrations:**
- `migrations/076_convert_player_items_to_item_id.sql`
- `migrations/077_convert_warehouse_items_to_item_id.sql`
- `migrations/078_convert_harvest_prerequisite_to_item_id.sql`
- `migrations/079_convert_npc_input_items_to_ids.sql`
- `migrations/080_convert_npc_output_items_to_ids.sql`
- `migrations/081_convert_puzzle_reward_to_item_id.sql`
- `migrations/082_convert_lore_keeper_reward_to_item_id.sql`
- `migrations/083_convert_lore_keeper_awards_to_item_id.sql`
- `migrations/084_convert_factory_ingredients_to_item_ids.sql`
- `migrations/085_convert_factory_outputs_to_item_ids.sql`
- `migrations/086_convert_factory_byproducts_to_item_ids.sql`

**Database Access Layer:**
- `database.js` - All database functions and conversion helpers

**Game Logic:**
- `handlers/game.js` - Game command handlers
- `handlers/npcEditor.js` - NPC editor handlers
- `handlers/craftingEditor.js` - Recipe editor handlers
- `npcLogic.js` - NPC cycle logic
- `services/npcCycleEngine.js` - NPC engine service
- `services/factoryCraftingEngine.js` - Factory crafting service
- `services/factoryRecipeMatcher.js` - Recipe matching service

**Frontend:**
- `public/gameeditors/npc-editor.js` - NPC editor frontend
- `public/js/models/npc.js` - NPC model with normalization

**Documentation:**
- `docs/Chuck docs/1001-database-cleanup.md` - Migration tracking document

---

**END OF CANONICAL SPEC**
