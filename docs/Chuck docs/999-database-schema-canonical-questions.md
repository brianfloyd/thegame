# Database Schema Overview: One-Liner Canonical Questions

**Analysis Date:** Based on codebase as of migration 072  
**Methodology:** Strict code-based analysis per scrub prompt template  
**All answers derived from:** `migrations/*.sql`, `database.js`, `scripts/sync-dev-to-prod.js`

---

## 1. Define the canonical purpose of the database within the architecture.

**Answer:** The database serves as the single source of truth for all game state, content definitions, and player data. It stores:
- Game world content (maps, rooms, NPCs, items)
- Player state (stats, inventory, location, bank)
- Game mechanics configuration (formulas, recipes, runes)
- System data (accounts, knowledge base, debug tickets)

**Evidence:**
- `database.js:1-6` - PostgreSQL connection pool for all game data
- `migrations/001_schema.sql:1-3` - Core schema creates all game tables
- `scripts/sync-dev-to-prod.js:30-67` - Database sync distinguishes game content vs player data

---

## 2. List all core tables that must exist in the schema.

**Answer:** Core tables (from `migrations/001_schema.sql` and subsequent migrations):

**System Tables:**
- `schema_migrations` - Migration tracking

**World Content Tables:**
- `maps` - Map definitions
- `rooms` - Room definitions with coordinates
- `scriptable_npcs` - NPC type definitions
- `room_npcs` - NPC placements in rooms
- `items` - Item master definitions
- `room_items` - Items on ground in rooms
- `room_type_colors` - Room type styling

**Player Tables:**
- `accounts` - User accounts (migration 022)
- `user_characters` - Account-to-player links (migration 022)
- `players` - Player characters with dynamic stats
- `player_items` - Player inventory
- `player_bank` - Player currency storage (migration 019)
- `player_warehouses` - Warehouse ownership (migration 011)
- `warehouse_items` - Warehouse storage (migration 011)

**Gameplay Tables:**
- `loops` - Player navigation loops (migration 036)
- `loop_steps` - Loop waypoints (migration 036)
- `terminal_history` - Command history (migration 025)
- `lore_keepers` - Narrative NPCs (migration 004)
- `lore_keeper_greetings` - Player greeting state (migration 005)
- `lore_keeper_item_awards` - Awarded items (migration 009)

**Merchant System:**
- `merchant_items` - Shop inventory (migration 015)

**Factory System:**
- `factory_recipes` - Crafting recipes (migration 070)
- `factory_events` - Crafting event log (migration 072)

**Configuration Tables:**
- `harvest_formula_config` - Formula parameters (migration 030)
- `item_types` - Item type definitions (migration 013)
- `game_messages` - Message templates (migration 038)

**Markup System:**
- `markup_conventions` - Custom markup (migration 059)
- `markup_builtin_edits` - Built-in overrides (migration 059)

**RAG/Knowledge System:**
- `zork_knowledge` - Vectorized knowledge base (migration 060)

**Debug System:**
- `debug_sessions` - Observation sessions (migration 061)
- `debug_todos` - Bug tickets (migration 061)

**Authentication:**
- `email_verification_tokens` - Email verification (migration 024)
- `password_reset_tokens` - Password resets (migration 024)

**Evidence:**
- `migrations/001_schema.sql:5-136` - Core table definitions
- All subsequent migrations add or modify tables
- `scripts/sync-dev-to-prod.js:34-45` - Lists game content tables

---

## 3. Declare the authoritative owner of each table.

**Answer:** Based on write patterns in `database.js` and sync rules:

**Game Content (Editors/Admin):**
- `maps`, `rooms`, `scriptable_npcs`, `room_npcs`, `items`, `room_items`, `room_type_colors`, `item_types`, `merchant_items`, `lore_keepers`, `factory_recipes`, `harvest_formula_config`, `game_messages`, `markup_conventions`, `markup_builtin_edits`

**Player Data (Game Handlers):**
- `players` (location, stats updated by game handlers)
- `player_items` (inventory managed by game handlers)
- `player_bank` (currency managed by game handlers)
- `warehouse_items`, `player_warehouses` (warehouse system)
- `loops`, `loop_steps` (navigation system)
- `terminal_history` (command logging)
- `lore_keeper_greetings`, `lore_keeper_item_awards` (player-specific NPC state)

**System/Admin:**
- `accounts`, `user_characters` (auth system)
- `email_verification_tokens`, `password_reset_tokens` (auth system)
- `zork_knowledge` (RAG system, MCP tools)
- `debug_sessions`, `debug_todos` (debug system, ZORK/Cursor)
- `factory_events` (event logging)
- `schema_migrations` (migration runner)

**Evidence:**
- `database.js` - All write functions show ownership
- `scripts/sync-dev-to-prod.js:34-67` - Distinguishes game content (syncable) vs player data (protected)

---

## 4. Specify required fields for each core entity.

**Answer:** Required fields per table (NOT NULL constraints):

**maps:**
- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT NOT NULL UNIQUE)
- `width` (INTEGER NOT NULL)
- `height` (INTEGER NOT NULL)

**rooms:**
- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `description` (TEXT NOT NULL)
- `x` (INTEGER NOT NULL)
- `y` (INTEGER NOT NULL)
- `map_id` (INTEGER NOT NULL REFERENCES maps(id))
- `room_type` (TEXT NOT NULL DEFAULT 'normal')
- UNIQUE constraint: `(map_id, x, y)`

**players:**
- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT NOT NULL UNIQUE)
- `current_room_id` (INTEGER NOT NULL REFERENCES rooms(id))
- All stat/ability/resource columns have NOT NULL with defaults

**scriptable_npcs:**
- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `description` (TEXT NOT NULL)
- `npc_type` (TEXT NOT NULL)
- `base_cycle_time` (INTEGER NOT NULL)
- `scriptable` (BOOLEAN NOT NULL DEFAULT TRUE)
- `active` (BOOLEAN NOT NULL DEFAULT TRUE)
- `harvestable_time` (INTEGER NOT NULL DEFAULT 60000)
- `cooldown_time` (INTEGER NOT NULL DEFAULT 120000)

**items:**
- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT NOT NULL UNIQUE)
- `item_type` (TEXT NOT NULL DEFAULT 'sundries')
- `active` (BOOLEAN NOT NULL DEFAULT TRUE)
- `poofable` (BOOLEAN NOT NULL DEFAULT FALSE)
- `encumbrance` (INTEGER NOT NULL DEFAULT 1)
- `created_at` (BIGINT NOT NULL)

**accounts:**
- `id` (SERIAL PRIMARY KEY)
- `email` (TEXT NOT NULL UNIQUE)
- `password_hash` (TEXT NOT NULL)
- `email_verified` (BOOLEAN NOT NULL DEFAULT FALSE)
- `created_at` (BIGINT NOT NULL)
- CHECK constraint: email format validation

**Evidence:**
- `migrations/001_schema.sql` - Core table definitions
- `migrations/022_accounts_system.sql:4-12` - Accounts table
- All migrations show NOT NULL constraints

---

## 5. Define relationships between entities (one-to-one, one-to-many, many-to-many).

**Answer:** Relationships from foreign keys:

**One-to-Many:**
- `maps` → `rooms` (map_id)
- `rooms` → `players` (current_room_id)
- `rooms` → `room_npcs` (room_id)
- `rooms` → `room_items` (room_id)
- `rooms` → `merchant_items` (room_id)
- `scriptable_npcs` → `room_npcs` (npc_id)
- `players` → `player_items` (player_id)
- `players` → `player_bank` (player_id)
- `players` → `loops` (player_id)
- `players` → `terminal_history` (player_id)
- `players` → `lore_keeper_greetings` (player_id)
- `players` → `lore_keeper_item_awards` (player_id)
- `players` → `warehouse_items` (player_id)
- `players` → `player_warehouses` (player_id)
- `accounts` → `user_characters` (account_id)
- `user_characters` → `players` (player_id)
- `loops` → `loop_steps` (loop_id)
- `items` → `merchant_items` (item_id)
- `items` → `player_items` (via item_name, not FK)
- `items` → `room_items` (via item_name, not FK)
- `factory_recipes` → `factory_events` (recipe_id)
- `rooms` → `factory_events` (factory_room_id)
- `players` → `factory_events` (player_id)
- `items` → `factory_events` (item_id)
- `scriptable_npcs` → `lore_keepers` (npc_id, UNIQUE)
- `debug_sessions` → `debug_todos` (session_id)

**One-to-One:**
- `scriptable_npcs` → `lore_keepers` (npc_id UNIQUE)

**Many-to-Many (via junction tables):**
- `accounts` ↔ `players` via `user_characters`
- `players` ↔ `items` via `player_items` (inventory)
- `rooms` ↔ `items` via `room_items` (ground items)
- `rooms` ↔ `scriptable_npcs` via `room_npcs` (NPC placements)

**Self-Referential:**
- `rooms.connected_map_id` → `maps(id)` (map connections)
- `rooms.connected_room_x/y` (room connections)

**Evidence:**
- `migrations/001_schema.sql:27-28,40,85-86,109,118` - Foreign key definitions
- `migrations/022_accounts_system.sql:19-20` - Account-player relationship
- `migrations/004_lore_keepers.sql:6` - UNIQUE constraint for one-to-one

---

## 6. State which tables are immutable vs runtime-modifiable.

**Answer:** Based on sync rules and write patterns:

**Immutable (Game Content - Only via Migrations/Editors):**
- `maps` - Map definitions (editors only)
- `scriptable_npcs` - NPC definitions (editors only)
- `items` - Item master definitions (editors only)
- `room_type_colors` - Configuration (editors only)
- `item_types` - Type definitions (editors only)
- `harvest_formula_config` - Formula parameters (migrations/editors)
- `game_messages` - Message templates (editors)
- `markup_conventions`, `markup_builtin_edits` - Markup config (editors)
- `factory_recipes` - Recipe definitions (editors)
- `schema_migrations` - Migration tracking (migration runner only)

**Runtime-Modifiable (Game Handlers):**
- `rooms` - Room descriptions, connections (editors), but room state is runtime
- `room_npcs` - NPC placements (editors), but NPC state is runtime
- `room_items` - Ground items (runtime)
- `players` - All player state (runtime)
- `player_items` - Inventory (runtime)
- `player_bank` - Currency (runtime)
- `warehouse_items`, `player_warehouses` - Warehouse state (runtime)
- `loops`, `loop_steps` - Navigation (runtime)
- `terminal_history` - Command log (runtime)
- `lore_keeper_greetings`, `lore_keeper_item_awards` - Player-specific state (runtime)
- `merchant_items` - Shop inventory (runtime + editors)
- `factory_events` - Event log (runtime)
- `zork_knowledge` - Knowledge base (MCP tools, runtime)
- `debug_sessions`, `debug_todos` - Debug system (runtime)

**Authentication (Runtime):**
- `accounts`, `user_characters` - Account management (runtime)
- `email_verification_tokens`, `password_reset_tokens` - Auth tokens (runtime)

**Evidence:**
- `scripts/sync-dev-to-prod.js:34-67` - Lists syncable (game content) vs protected (player data)
- `database.js` - Write functions show runtime modifications

---

## 7. Declare indexing requirements and performance expectations.

**Answer:** Indexes defined in `migrations/003_indexes.sql` and subsequent migrations:

**Core Indexes:**
- `idx_room_npcs_room_id` - Room NPC lookups
- `idx_room_npcs_npc_id` - NPC placement lookups
- `idx_room_npcs_active` - Active NPC filtering
- `idx_room_items_room_id` - Room item lookups
- `idx_player_items_player_id` - Player inventory lookups
- `idx_rooms_map_id` - Map room queries
- `idx_rooms_coords` - Coordinate lookups (map_id, x, y)
- `idx_players_current_room` - Players in room queries
- `idx_accounts_email` - Email lookups (migration 022)
- `idx_user_characters_account_id`, `idx_user_characters_player_id` - Account-player links
- `idx_scriptable_npcs_name` - NPC name lookups (UNIQUE)
- `idx_warehouse_items_player_location` - Warehouse queries (migration 011)
- `idx_merchant_items_room_id`, `idx_merchant_items_item_id` - Merchant queries (migration 015)
- `idx_harvest_formula_config_key` - Formula config lookups (migration 030)
- `idx_factory_recipes_active` - Active recipe filtering (migration 070)
- `idx_factory_events_type`, `idx_factory_events_player`, `idx_factory_events_room`, `idx_factory_events_timestamp`, `idx_factory_events_recipe` - Event queries (migration 072)
- `idx_zork_knowledge_category_priority`, `idx_zork_knowledge_source` - Knowledge queries (migration 060)
- `idx_zork_knowledge_embedding` - Vector similarity search (migration 060, pgvector)
- `idx_debug_todos_status`, `idx_debug_sessions_active`, `idx_debug_sessions_player` - Debug queries (migration 061)
- `idx_items_rune_type`, `idx_items_rune_color` - Rune lookups (migrations 064, 069)
- `idx_loops_player_map`, `idx_loop_steps_loop_id` - Navigation queries (migration 036)

**Performance Expectations:**
- Room lookups by coordinates: O(log n) via composite index
- Player inventory: O(log n) via player_id index
- NPC state updates: O(log n) via room_id index
- Vector similarity search: Optimized via ivfflat index (pgvector)

**Evidence:**
- `migrations/003_indexes.sql` - Core performance indexes
- All subsequent migrations add indexes for new tables/columns
- `migrations/060_zork_knowledge_system.sql:79-81` - Vector index with ivfflat

---

## 8. Specify canonical naming conventions for tables and fields.

**Answer:** Naming conventions from schema:

**Table Names:**
- Lowercase, snake_case
- Plural nouns for collections: `players`, `rooms`, `items`, `maps`
- Descriptive compound names: `scriptable_npcs`, `room_npcs`, `player_items`, `room_items`, `warehouse_items`, `player_warehouses`, `lore_keeper_greetings`, `lore_keeper_item_awards`, `email_verification_tokens`, `password_reset_tokens`, `factory_recipes`, `factory_events`, `debug_sessions`, `debug_todos`, `harvest_formula_config`, `markup_conventions`, `markup_builtin_edits`, `zork_knowledge`

**Column Names:**
- Lowercase, snake_case
- Primary keys: `id` (SERIAL)
- Foreign keys: `{table}_id` (e.g., `player_id`, `room_id`, `map_id`, `npc_id`, `item_id`)
- Boolean flags: `active`, `scriptable`, `poofable`, `unlimited`, `email_verified`
- Timestamps: `created_at` (BIGINT epoch milliseconds or TIMESTAMP), `updated_at`, `applied_at`, `last_login_at`, `last_cycle_run`, `awarded_at`, `first_greeted_at`, `last_greeted_at`, `started_at`, `ended_at`
- Player stats: Prefix-based `stat_*`, `ability_*`, `resource_*`, `flag_*`
- JSON fields: `state` (TEXT JSON), `metadata` (JSONB), `config_json` (JSONB), `environment` (JSONB), `logs` (JSONB), `required_ingredients` (JSONB), `required_runes` (JSONB), `output_items` (JSONB), `required_stats` (JSONB), `byproducts` (JSONB), `effects` (JSONB)
- Vector fields: `embedding` (vector(1536))

**Special Patterns:**
- Coordinates: `x`, `y`
- Quantities: `quantity`, `max_qty`, `current_qty`
- Time values: `*_time_ms`, `*_time`, `*_delay_ms`, `*_cooldown_ms`, `*_interval_ms`
- Status fields: `status` (TEXT with enum values)
- Type fields: `*_type` (TEXT)
- Color fields: `color`, `rune_color`, `display_color`

**Evidence:**
- `migrations/001_schema.sql` - All table and column names
- `docs/requirements.md:566-577` - Dynamic stats system uses prefix patterns
- All migrations follow consistent naming

---

## 9. Define rules for soft deletes vs hard deletes.

**Answer:** Soft delete patterns:

**Soft Deletes (active flag or status field):**
- `scriptable_npcs.active` - NPC definitions (BOOLEAN, default TRUE)
- `room_npcs.active` - NPC placements (BOOLEAN, default TRUE)
- `items.active` - Item definitions (BOOLEAN, default TRUE)
- `factory_recipes.active` - Recipe definitions (BOOLEAN, default TRUE)
- `zork_knowledge.active` - Knowledge chunks (BOOLEAN, default TRUE)
- `debug_todos.status` - Tickets can be 'deleted' (soft delete, cursor ignores) (migration 065)
- `debug_sessions.active` - Debug sessions (BOOLEAN, default TRUE)

**Hard Deletes (CASCADE or SET NULL):**
- `room_npcs` - DELETE FROM room_npcs (hard delete)
- `player_items` - DELETE when quantity reaches 0
- `room_items` - DELETE when quantity reaches 0
- `loops` - DELETE with CASCADE to loop_steps
- `lore_keepers` - DELETE with CASCADE from scriptable_npcs
- `factory_recipes` - DELETE (hard delete)
- `merchant_items` - DELETE (hard delete)
- `accounts` - DELETE with CASCADE to user_characters
- `players` - DELETE with CASCADE to player_items, player_bank, etc.

**Foreign Key Delete Actions:**
- `ON DELETE CASCADE`: `user_characters`, `player_items`, `player_bank`, `warehouse_items`, `player_warehouses`, `loops`, `loop_steps`, `terminal_history`, `lore_keeper_greetings`, `lore_keeper_item_awards`, `merchant_items`, `debug_sessions` (player_id)
- `ON DELETE SET NULL`: `factory_events` (all FKs), `debug_todos` (session_id, player_id)
- No explicit action (default RESTRICT): Most other FKs

**Evidence:**
- `migrations/001_schema.sql:74,89,101` - active flags
- `migrations/065_add_ticket_deleted_status.sql:9` - Soft delete via status
- `migrations/022_accounts_system.sql:19-20` - CASCADE deletes
- `migrations/072_create_factory_events.sql:18-27` - SET NULL deletes

---

## 10. State which systems may write to which tables.

**Answer:** Write access patterns from `database.js` and sync rules:

**Game Handlers (`handlers/game.js`):**
- `players` - Update location, stats, resources
- `player_items` - Inventory management
- `player_bank` - Currency updates
- `room_items` - Ground items
- `room_npcs` - NPC state updates
- `loops`, `loop_steps` - Navigation
- `terminal_history` - Command logging
- `lore_keeper_greetings`, `lore_keeper_item_awards` - NPC interactions
- `warehouse_items`, `player_warehouses` - Warehouse operations
- `merchant_items` - Shop transactions
- `factory_events` - Crafting event logging

**Editors (`handlers/*Editor.js`):**
- `maps`, `rooms` - World editing
- `scriptable_npcs`, `room_npcs` - NPC editing
- `items` - Item editing
- `room_items` - Room item placement
- `merchant_items` - Shop configuration
- `lore_keepers` - Lore keeper editing
- `factory_recipes` - Recipe editing
- `room_type_colors` - Room styling
- `game_messages` - Message templates
- `harvest_formula_config` - Formula configuration

**Authentication System (`routes/api.js`, `middleware/auth.js`):**
- `accounts` - Account creation, login tracking
- `user_characters` - Character linking
- `email_verification_tokens`, `password_reset_tokens` - Auth token management

**NPC Engine (`npcLogic.js`, `services/npcCycleEngine.js`):**
- `room_npcs` - State updates, cycle timing

**Factory Engine (`services/factoryCraftingEngine.js`):**
- `factory_events` - Event logging
- `room_items`, `player_items` - Item creation/consumption

**RAG/Knowledge System (`utils/zorkKnowledge.js`, MCP tools):**
- `zork_knowledge` - Knowledge storage, updates, deletions

**Debug System (ZORK, Cursor via MCP):**
- `debug_sessions` - Session management
- `debug_todos` - Ticket creation, updates

**Migration Runner (`scripts/migrate.js`):**
- `schema_migrations` - Migration tracking

**Evidence:**
- `database.js` - All write functions show system ownership
- `scripts/sync-dev-to-prod.js:34-67` - Distinguishes game content (editors) vs player data (handlers)

---

## 11. Specify data integrity constraints enforced at the DB layer.

**Answer:** Constraints from migrations:

**Primary Keys:**
- All tables have `id SERIAL PRIMARY KEY` or equivalent
- `room_type_colors.room_type` - TEXT PRIMARY KEY

**Unique Constraints:**
- `maps.name` - UNIQUE
- `players.name` - UNIQUE
- `items.name` - UNIQUE
- `scriptable_npcs.name` - UNIQUE
- `rooms(map_id, x, y)` - UNIQUE (coordinate uniqueness)
- `user_characters(account_id, player_id)` - UNIQUE
- `player_bank(player_id, currency_name)` - UNIQUE
- `player_warehouses(player_id, warehouse_location_key)` - UNIQUE
- `merchant_items(item_id, room_id)` - UNIQUE
- `loops(player_id, map_id, name)` - UNIQUE
- `loop_steps(loop_id, step_index)` - UNIQUE
- `harvest_formula_config.config_key` - UNIQUE
- `factory_recipes.name` - UNIQUE
- `markup_builtin_edits.convention_key` - UNIQUE
- `lore_keepers.npc_id` - UNIQUE (one-to-one)
- `schema_migrations.name` - UNIQUE

**Foreign Key Constraints:**
- All foreign keys have REFERENCES with appropriate actions
- `rooms.map_id` → `maps(id)` - NOT NULL
- `rooms.connected_map_id` → `maps(id)` - NULLABLE
- `players.current_room_id` → `rooms(id)` - NOT NULL
- `room_npcs.npc_id` → `scriptable_npcs(id)` - NOT NULL
- `room_npcs.room_id` → `rooms(id)` - NOT NULL
- And many more (see question 5)

**Check Constraints:**
- `accounts.email` - Email format validation (regex)
- `lore_keepers.lore_type` - IN ('dialogue', 'puzzle')
- `lore_keepers.puzzle_mode` - IN ('word', 'combination', 'cipher')
- `items.rune_type` - IN ('PRODUCTION', 'SPEED', 'EFFICIENCY') or NULL (migration 069)
- `factory_events.event_type` - IN ('FACTORY_CRAFT_STARTED', 'FACTORY_CRAFT_SUCCESS', 'FACTORY_CRAFT_FAILED', 'FACTORY_CRAFT_CRITICAL', 'FACTORY_CRAFT_FIZZLE', 'FACTORY_OUTPUT_CREATED') (migration 072)
- `debug_todos.status` - Implicit enum (open, in_progress, resolved, deleted, backlog)

**NOT NULL Constraints:**
- See question 4 for required fields

**Default Values:**
- Most columns have DEFAULT values
- Booleans default to FALSE or TRUE
- Integers default to 0 or specified values
- Timestamps default to NOW() or epoch milliseconds

**Evidence:**
- `migrations/001_schema.sql` - Core constraints
- `migrations/022_accounts_system.sql:11` - Email CHECK constraint
- `migrations/004_lore_keepers.sql:9,24` - CHECK constraints
- `migrations/069_add_rune_type_field.sql:11-13` - Rune type CHECK
- `migrations/072_create_factory_events.sql:51-60` - Event type CHECK

---

## 12. Define migration rules and versioning requirements.

**Answer:** Migration system from `scripts/migrate.js`:

**Migration File Naming:**
- Format: `NNN_description.sql` (zero-padded 3-digit number)
- Sorted alphabetically to ensure order
- Examples: `001_schema.sql`, `002_seed_data.sql`, `072_create_factory_events.sql`

**Migration Tracking:**
- `schema_migrations` table tracks applied migrations
- Columns: `id`, `name` (UNIQUE), `applied_at`
- Prevents duplicate application

**Migration Execution:**
- Runs on server startup via `scripts/migrate.js`
- Transactional: Each migration runs in BEGIN/COMMIT
- Rollback on error: ROLLBACK on failure
- Skips already-applied migrations

**Versioning Requirements:**
- Sequential numbering (001, 002, 003...)
- No gaps in sequence (enforced by alphabetical sort)
- Each migration is idempotent (uses IF NOT EXISTS, ON CONFLICT DO NOTHING)
- Migrations are additive (rarely remove columns, use soft deletes)

**Migration Content Rules:**
- Use `CREATE TABLE IF NOT EXISTS` for new tables
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for new columns
- Use `ON CONFLICT DO NOTHING` for seed data
- Use `DROP CONSTRAINT IF EXISTS` before adding constraints
- Include indexes in migrations
- Include comments for documentation

**Evidence:**
- `scripts/migrate.js:18-100` - Migration runner logic
- `migrations/001_schema.sql:5-9` - schema_migrations table
- All migrations follow IF NOT EXISTS pattern

---

## 13. Declare how runes, formulas, recipes, and NPCs must be represented.

**Answer:** Representation from migrations:

**Runes:**
- Stored in `items` table with `item_type = 'rune'`
- `rune_type` field: 'PRODUCTION', 'SPEED', 'EFFICIENCY' (migration 069)
- `rune_color` field: Hex color string (migration 064)
- `rune_type` CHECK constraint: NULL or IN ('PRODUCTION', 'SPEED', 'EFFICIENCY')
- Index: `idx_items_rune_type` on (item_type, rune_type) WHERE item_type = 'rune'
- PRODUCTION runes required by factory machines (slot 2)
- SPEED/EFFICIENCY runes optional in recipes (slots 3-4)

**Formulas:**
- Stored in `harvest_formula_config` table (migration 030)
- Columns: `id`, `config_key` (UNIQUE), `description`, `min_resonance`, `min_value`, `max_resonance`, `max_value`, `curve_exponent`, `updated_at`
- Formula types: `cycle_time_reduction`, `hit_rate`, `cooldown_time_reduction`, `harvestable_time_increase`, `vitalis_drain_reduction`, `pulse_echo_*` (multiple), `attunement_*` (multiple), `room_update_interval_ms`
- Formula calculation: Uses resonance stat with curve exponent for interpolation
- Formula implementation: `utils/harvestFormulas.js`

**Recipes:**
- Stored in `factory_recipes` table (migration 070)
- Columns: `recipe_id`, `name` (UNIQUE), `description`, `required_ingredients` (JSONB), `required_runes` (JSONB), `output_items` (JSONB), `success_rate`, `required_stats` (JSONB), `crafting_time_ms`, `return_rate_on_fail`, `factory_tier_required`, `byproducts` (JSONB), `allow_rune_substitution`, `allow_wildcard_runes`, `active`, `created_at`
- `required_runes` - Array of rune types (SPEED, EFFICIENCY only, NEVER PRODUCTION)
- `required_ingredients` - Array of {item_name, quantity}
- `output_items` - Array of {item_name, quantity}
- `required_stats` - Optional JSONB with stat requirements
- Index: `idx_factory_recipes_active` WHERE active = true

**NPCs:**
- Definitions in `scriptable_npcs` table
- Columns: `id`, `name` (UNIQUE), `description`, `npc_type`, `base_cycle_time`, `difficulty`, `required_stats`, `required_buffs`, `input_items`, `output_items`, `failure_states`, `display_color`, `scriptable`, `active`, `harvestable_time`, `cooldown_time`, plus many harvest/attunement fields
- Placements in `room_npcs` table
- Columns: `id`, `npc_id` (FK), `room_id` (FK), `state` (TEXT JSON), `last_cycle_run`, `active`, `slot`, `spawn_rules`
- State stored as JSON text in `state` field
- Cycle timing: `last_cycle_run` (BIGINT epoch milliseconds)
- Special NPCs: `lore_keepers` table for narrative NPCs (one-to-one with scriptable_npcs)

**Evidence:**
- `migrations/064_add_rune_color_field.sql` - Rune color
- `migrations/069_add_rune_type_field.sql` - Rune types
- `migrations/030_add_harvest_formula_config.sql` - Formula config
- `migrations/070_create_factory_recipes.sql` - Recipe structure
- `migrations/001_schema.sql:59-92` - NPC tables

---

## 14. Define how player state is stored and updated.

**Answer:** Player state from `players` table and `database.js`:

**Player Table Structure:**
- `id` - Primary key
- `name` - UNIQUE player name
- `current_room_id` - Location (FK to rooms)
- Dynamic stats: `stat_*`, `ability_*`, `resource_*`, `flag_*` (prefix-based auto-detection)
- `assignable_points` - Stat allocation points
- `widget_config` - JSONB widget preferences
- `auto_navigation_time_ms` - Navigation timing
- `loop_delay_ms` - Loop delay
- `room_update_interval_ms` - Room update frequency
- `resource_vitalis`, `resource_max_vitalis` - Vitalis resource
- `last_attune_time` - Attunement cooldown
- `base_attunement_points`, `base_attunement_cooldown_ms`, `base_attunement_delay_ms` - Attunement config
- `pulse_echoes`, `pulse_echo_tier` - Pulse echo currency

**Player State Updates:**
- `updatePlayer()` function in `database.js:408-460`
- Allowed fields: stats, abilities, resources, flags, location, timing configs
- Validation: `resource_vitalis` capped at `resource_max_vitalis`, never negative
- Atomic updates: Single UPDATE query with all changed fields

**Related Player State Tables:**
- `player_items` - Inventory (item_name, quantity)
- `player_bank` - Currency storage (currency_name, quantity)
- `player_warehouses` - Warehouse ownership
- `warehouse_items` - Warehouse storage
- `loops`, `loop_steps` - Navigation paths
- `terminal_history` - Command history
- `lore_keeper_greetings` - NPC greeting state
- `lore_keeper_item_awards` - Awarded items tracking

**State Update Patterns:**
- Location: `updatePlayerRoom()` - Updates current_room_id
- Stats: `updatePlayer()` - Updates stat/ability fields
- Resources: `updatePlayer()` - Updates resource fields with validation
- Inventory: `addPlayerItem()`, `removePlayerItem()`, `updatePlayerItemQuantity()`
- Bank: `addPlayerBankCurrency()`, `removePlayerBankCurrency()`
- Vitalis: `updatePlayerVitalis()` - Validates max, caps at max
- Pulse Echoes: `updatePlayerPulseEchoes()`, `updatePlayerPulseEchoTier()`

**Evidence:**
- `database.js:408-460` - updatePlayer() function with validation
- `database.js:470-493` - Vitalis update with capping
- `database.js:494-516` - Pulse echo updates
- `migrations/026_replace_stats_and_abilities.sql` - Stat system migration

---

## 15. Declare caching expectations and DB read/write patterns.

**Answer:** Caching and access patterns:

**No Explicit Caching Layer:**
- No Redis or in-memory cache mentioned in codebase
- Database queries are direct via PostgreSQL connection pool
- Pool configuration: max 20 connections, 30s idle timeout, 2s connection timeout

**Read Patterns:**
- Frequent reads: Room data, player data, NPC state, inventory
- Lookups by ID: `getRoomById()`, `getPlayerById()`, `getPlayerByName()`
- Lookups by coordinates: `getRoomByCoords()` - Uses composite index
- Lookups by foreign key: `getRoomsByMap()`, `getPlayersInRoom()`, `getRoomNPCs()`
- Vector search: `searchZorkKnowledge()` - Uses pgvector ivfflat index

**Write Patterns:**
- Player updates: Frequent, atomic (single UPDATE)
- Inventory updates: Frequent, atomic (INSERT/UPDATE/DELETE)
- NPC state updates: Frequent, atomic (UPDATE state JSON)
- Event logging: Append-only (`factory_events`)
- Batch operations: None explicitly, but transactions used

**Transaction Usage:**
- Migrations: Each migration in transaction (BEGIN/COMMIT/ROLLBACK)
- Sync script: Full sync in transaction
- Game handlers: Not explicitly transactional in `database.js` (individual queries)

**Connection Pool:**
- PostgreSQL connection pool via `pg.Pool`
- Max 20 connections
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds
- SSL in production, no SSL in development

**Performance Expectations:**
- Indexed lookups: O(log n)
- Coordinate lookups: O(log n) via composite index
- Vector search: Optimized via ivfflat (approximate nearest neighbor)
- No explicit caching, relies on PostgreSQL query cache and indexes

**Evidence:**
- `database.js:11-17` - Connection pool configuration
- `scripts/migrate.js:68-81` - Transaction usage in migrations
- `scripts/sync-dev-to-prod.js:362-408` - Transaction usage in sync
- All queries use parameterized queries ($1, $2, etc.)

---

## 16. Specify logging/audit table requirements.

**Answer:** Logging and audit tables:

**Event Logging:**
- `factory_events` - Factory crafting event log (migration 072)
  - Columns: `id`, `event_type`, `factory_room_id`, `player_id`, `recipe_id`, `item_id`, `quantity`, `metadata` (JSONB), `timestamp`
  - Event types: FACTORY_CRAFT_STARTED, FACTORY_CRAFT_SUCCESS, FACTORY_CRAFT_FAILED, FACTORY_CRAFT_CRITICAL, FACTORY_CRAFT_FIZZLE, FACTORY_OUTPUT_CREATED
  - Indexes: `idx_factory_events_type`, `idx_factory_events_player`, `idx_factory_events_room`, `idx_factory_events_timestamp`, `idx_factory_events_recipe`, `idx_factory_events_player_time`
  - Append-only log for analytics and automation hooks

**Command History:**
- `terminal_history` - Player command history (migration 025)
  - Columns: `id`, `player_id` (FK), `command`, `timestamp`
  - Tracks all player commands
  - ON DELETE CASCADE with players

**Debug/Audit:**
- `debug_sessions` - Debug observation sessions (migration 061)
  - Columns: `id`, `player_id`, `bug_label`, `active`, `started_at`, `ended_at`
  - Tracks active debug sessions
- `debug_todos` - Bug tickets with rich context (migration 061)
  - Columns: `id`, `session_id`, `status`, `title`, `description`, `repro_steps`, `environment` (JSONB), `logs` (JSONB), `resolution_notes`, `created_by`, `created_at`, `updated_at`
  - Audit trail for bug fixes

**Migration Tracking:**
- `schema_migrations` - Migration audit trail
  - Columns: `id`, `name`, `applied_at`
  - Tracks all applied migrations

**No General Audit Trail:**
- No `audit_log` or `change_log` table for general data changes
- No tracking of who modified what and when (except migrations)
- Player data changes not logged (inventory, stats, etc.)

**Evidence:**
- `migrations/025_terminal_history.sql` - Command history
- `migrations/061_debug_todos.sql` - Debug system
- `migrations/072_create_factory_events.sql` - Factory event log
- `migrations/001_schema.sql:5-9` - Migration tracking

---

## 17. Define rules for optional vs required foreign keys.

**Answer:** Foreign key nullability from schema:

**Required Foreign Keys (NOT NULL):**
- `rooms.map_id` → `maps(id)` - Every room must belong to a map
- `rooms.connected_map_id` → `maps(id)` - If connection exists, must reference valid map (but can be NULL)
- `players.current_room_id` → `rooms(id)` - Every player must be in a room
- `room_npcs.npc_id` → `scriptable_npcs(id)` - Every placement must reference NPC definition
- `room_npcs.room_id` → `rooms(id)` - Every placement must be in a room
- `room_items.room_id` → `rooms(id)` - Every ground item must be in a room
- `player_items.player_id` → `players(id)` - Every inventory item must belong to player
- `player_bank.player_id` → `players(id)` - Every bank entry must belong to player
- `user_characters.account_id` → `accounts(id)` - Every character link must have account
- `user_characters.player_id` → `players(id)` - Every character link must have player
- `loops.player_id` → `players(id)` - Every loop must belong to player
- `loops.map_id` → `maps(id)` - Every loop must be on a map
- `loops.origin_room_id` → `rooms(id)` - Every loop must have origin room
- `loop_steps.loop_id` → `loops(id)` - Every step must belong to loop
- `loop_steps.room_id` → `rooms(id)` - Every step must reference room
- `merchant_items.item_id` → `items(id)` - Every merchant item must reference item
- `merchant_items.room_id` → `rooms(id)` - Every merchant item must be in room
- `lore_keepers.npc_id` → `scriptable_npcs(id)` - Every lore keeper must reference NPC
- `lore_keeper_greetings.player_id` → `players(id)` - Every greeting must belong to player
- `lore_keeper_greetings.npc_id` → `scriptable_npcs(id)` - Every greeting must reference NPC
- `lore_keeper_item_awards.player_id` → `players(id)` - Every award must belong to player
- `lore_keeper_item_awards.npc_id` → `scriptable_npcs(id)` - Every award must reference NPC
- `warehouse_items.player_id` → `players(id)` - Every warehouse item must belong to player
- `player_warehouses.player_id` → `players(id)` - Every warehouse must belong to player
- `terminal_history.player_id` → `players(id)` - Every command must belong to player
- `debug_sessions.player_id` → `players(id)` - Every debug session must belong to player

**Optional Foreign Keys (NULLABLE):**
- `rooms.connected_map_id` → `maps(id)` - Room may not have connection
- `rooms.connected_room_x`, `connected_room_y` - Connection coordinates (nullable)
- `player_warehouses.deed_item_id` → `items(id)` - Warehouse may not have deed item
- `factory_events.factory_room_id` → `rooms(id)` - Event may not have room (SET NULL on delete)
- `factory_events.player_id` → `players(id)` - Event may not have player (SET NULL on delete)
- `factory_events.recipe_id` → `factory_recipes(recipe_id)` - Event may not have recipe (SET NULL on delete)
- `factory_events.item_id` → `items(id)` - Event may not have item (SET NULL on delete)
- `debug_todos.session_id` → `debug_sessions(id)` - Todo may not have session (SET NULL on delete)
- `debug_todos.player_id` → `players(id)` - Todo may not have player (SET NULL on delete, migration 063)

**Pattern:**
- Core relationships: Required (NOT NULL)
- Optional relationships: Nullable (e.g., connections, optional references)
- Audit/event tables: Often nullable (SET NULL on delete to preserve history)

**Evidence:**
- `migrations/001_schema.sql` - All FK definitions
- `migrations/072_create_factory_events.sql:18-27` - SET NULL pattern
- `migrations/061_debug_todos.sql:17` - SET NULL on session_id

---

## 18. Declare how RAG-related data must be stored (if applicable).

**Answer:** RAG system from migration 060:

**Table: `zork_knowledge`**
- Primary storage for vectorized knowledge base
- Shared between ZORK (in-game) and Cursor (MCP tools)

**Schema:**
- `id` - SERIAL PRIMARY KEY
- `category` - TEXT NOT NULL (core_identity, command_knowledge, world_lore, interaction_patterns, learned_context, system_docs, game_design, technical)
- `subcategory` - TEXT (optional, e.g., 'markup', 'transportation', 'npc', 'persona_chuck', 'persona_zork')
- `title` - TEXT NOT NULL (short descriptive title)
- `content` - TEXT NOT NULL (actual knowledge chunk)
- `priority` - INTEGER DEFAULT 0
  - 0 = contextual (semantic search only)
  - 1 = important (loads when category is relevant)
  - 2 = always-include (bypasses similarity search, always in context)
- `source` - TEXT DEFAULT 'system' ('system', 'zork', 'cursor')
- `added_by` - TEXT (player/user who added)
- `active` - BOOLEAN DEFAULT TRUE (soft delete)
- `created_at` - BIGINT (epoch milliseconds)
- `updated_at` - BIGINT (epoch milliseconds)
- `embedding` - vector(1536) (pgvector extension, optional if pgvector not available)

**Indexes:**
- `idx_zork_knowledge_category_priority` - On (category, priority, active) for fast filtering
- `idx_zork_knowledge_source` - On (source) for source tracking
- `idx_zork_knowledge_embedding` - ivfflat index on embedding for vector similarity search (lists=100)

**Storage Requirements:**
- Requires pgvector extension for vector support
- Embedding dimension: 1536 (OpenAI text-embedding-3-small)
- Vector index: ivfflat with cosine distance (vector_cosine_ops)
- Graceful degradation: Table created without embedding column if pgvector unavailable

**Access Patterns:**
- Semantic search: `searchZorkKnowledge()` - Uses vector similarity
- Category filtering: `getZorkKnowledgeByCategory()` - Uses category/priority index
- Always-include: `getAlwaysIncludeKnowledge()` - Priority 2, bypasses search
- CRUD: `addZorkKnowledge()`, `updateZorkKnowledge()`, `deleteZorkKnowledge()` (soft delete)

**Evidence:**
- `migrations/060_zork_knowledge_system.sql` - Complete RAG schema
- `utils/zorkKnowledge.js` - Embedding generation and storage
- MCP tools in `mcp-test-server/tools/knowledge.js` - Knowledge access

---

## 19. Specify rules for schema expansion and future-proofing.

**Answer:** Future-proofing patterns from migrations:

**Additive Migrations:**
- Migrations are additive (rarely remove columns)
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for new columns
- Use `CREATE TABLE IF NOT EXISTS` for new tables
- Use `ON CONFLICT DO NOTHING` for seed data

**Dynamic Stats System:**
- Prefix-based auto-detection: `stat_*`, `ability_*`, `resource_*`, `flag_*`
- New stats can be added via migration without code changes
- System queries schema on startup to detect columns
- Metadata tables: `stat_metadata`, `ability_metadata` (referenced in docs, not found in migrations)

**JSON/JSONB Fields:**
- Flexible storage: `state` (TEXT JSON), `metadata` (JSONB), `config_json` (JSONB)
- Allows schema evolution without column changes
- Used in: `room_npcs.state`, `factory_events.metadata`, `merchant_items.config_json`, `debug_todos.environment`, `debug_todos.logs`, `factory_recipes.*` (multiple JSONB fields)

**Soft Deletes:**
- `active` flags allow hiding without deletion
- `status` fields allow state transitions
- Preserves data for future reference

**Extension Support:**
- pgvector extension: Graceful degradation if unavailable
- Migration 060 checks for extension availability before adding vector column

**Naming Conventions:**
- Consistent naming allows programmatic access
- Prefix patterns enable dynamic discovery

**Backward Compatibility:**
- Default values on new columns maintain compatibility
- NULLABLE new columns don't break existing queries
- Migration idempotency (IF NOT EXISTS) allows safe re-runs

**Evidence:**
- All migrations use IF NOT EXISTS patterns
- `migrations/060_zork_knowledge_system.sql:7-20` - Extension checking
- `docs/requirements.md:566-577` - Dynamic stats system
- JSONB usage throughout migrations

---

## 20. State enforcement level: guideline, standard, or canonical law.

**Answer:** Enforcement level based on codebase:

**Canonical Law (Database-Enforced):**
- Primary keys, unique constraints, foreign keys, check constraints
- NOT NULL constraints
- Data types and defaults
- Migration versioning and tracking
- These are enforced by PostgreSQL and cannot be bypassed

**Standard (Application-Enforced):**
- Naming conventions (snake_case, prefixes)
- Soft delete patterns (active flags)
- Write access patterns (which systems write to which tables)
- Transaction usage
- These are enforced by application code and database.js functions

**Guideline (Documentation-Enforced):**
- Schema expansion patterns
- Future-proofing practices
- Best practices for migrations
- These are documented but not automatically enforced

**Evidence:**
- Database constraints are hard requirements (PostgreSQL enforces)
- Application patterns are in code (database.js, handlers)
- Guidelines are in docs (requirements.md, cursor-workflow.md)

---

## Summary

**Database Purpose:** Single source of truth for game state, content, and player data.

**Core Tables:** 30+ tables covering world content, players, gameplay, configuration, and systems.

**Ownership:** Clear separation between game content (editors), player data (handlers), and system data (various systems).

**Relationships:** Primarily one-to-many with foreign keys, some one-to-one (lore_keepers), many-to-many via junction tables.

**Immutability:** Game content definitions are immutable (editors only), player data is runtime-modifiable.

**Indexing:** Comprehensive indexing on foreign keys, unique constraints, and query patterns. Vector indexing for RAG system.

**Naming:** Lowercase snake_case for tables and columns, prefix-based patterns for dynamic stats.

**Deletes:** Mix of soft deletes (active flags, status fields) and hard deletes (CASCADE, SET NULL).

**Write Access:** Game handlers, editors, auth system, NPC engine, factory engine, RAG system, debug system each own specific tables.

**Constraints:** Primary keys, unique constraints, foreign keys, check constraints, NOT NULL, defaults all enforced at DB layer.

**Migrations:** Sequential numbered files, transactional, idempotent, tracked in schema_migrations table.

**Representation:** Runes in items table, formulas in config table, recipes in factory_recipes table, NPCs in scriptable_npcs + room_npcs tables.

**Player State:** Dynamic prefix-based stats system, stored in players table with related tables for inventory, bank, navigation, etc.

**Caching:** No explicit caching layer, relies on PostgreSQL query cache and indexes. Connection pool with 20 max connections.

**Logging:** factory_events for crafting, terminal_history for commands, debug_sessions/debug_todos for debugging, schema_migrations for migration audit.

**Foreign Keys:** Core relationships required (NOT NULL), optional relationships nullable, audit tables use SET NULL.

**RAG Storage:** zork_knowledge table with vector(1536) embeddings, pgvector extension, priority system, category/subcategory organization.

**Future-Proofing:** Additive migrations, dynamic stats system, JSON/JSONB fields, soft deletes, extension support, backward compatibility.

**Enforcement:** Database constraints are canonical law, application patterns are standards, documentation provides guidelines.

---

**File References:**
- `migrations/001_schema.sql` - Core schema
- `migrations/002-072_*.sql` - All migrations
- `database.js` - Database access layer
- `scripts/migrate.js` - Migration runner
- `scripts/sync-dev-to-prod.js` - Sync rules
- `docs/requirements.md` - Dynamic stats system
- `migrations/060_zork_knowledge_system.sql` - RAG system
- `migrations/070_create_factory_recipes.sql` - Recipe system
- `migrations/069_add_rune_type_field.sql` - Rune system


