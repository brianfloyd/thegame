# Database Schema Audit Report
**Date:** 2025-01-27  
**Scope:** Full database schema and code interaction patterns  
**Status:** Analysis Complete - Recommendations Only (No Changes Made)

## Executive Summary

This audit examined the database schema across 33 tables and how the application code reads, writes, and parses data. The database has evolved organically with 72 migrations, resulting in some inconsistencies in type usage, JSON storage patterns, and constraint enforcement. While the system is functional, there are opportunities to improve type safety, consistency, and maintainability.

## Key Findings

### 1. Type Inconsistencies

#### 1.1 Boolean vs Integer Flags
**Issue:** The `players` table uses `INTEGER` for boolean flags instead of `BOOLEAN`.

**Affected Columns:**
- `players.flag_god_mode` - INTEGER NOT NULL DEFAULT 0
- `players.flag_always_first_time` - INTEGER NOT NULL DEFAULT 0

**Code Impact:**
- Code checks: `player.flag_always_first_time === 1` (lines 1256, 1276, 2078, 2653, 2685, 2709 in database.js)
- Code writes: Uses 0/1 values
- Inconsistent with other boolean columns (e.g., `scriptable_npcs.active`, `merchant_items.buyable`)

**Recommendation:**
- Migrate `flag_god_mode` and `flag_always_first_time` to BOOLEAN type
- Update all code references from `=== 1` to direct boolean checks
- This improves type safety and aligns with PostgreSQL best practices

**Priority:** Medium (functional but inconsistent)

---

### 2. JSON Storage Pattern Inconsistencies

#### 2.1 Mixed JSON Storage Approaches
**Issue:** The database uses both TEXT (with JSON.stringify/parse) and JSONB for JSON data, creating inconsistency.

**TEXT-based JSON Fields:**
- `scriptable_npcs.required_stats` - TEXT (stored as JSON string)
- `scriptable_npcs.required_buffs` - TEXT
- `scriptable_npcs.input_items` - TEXT
- `scriptable_npcs.output_items` - TEXT
- `scriptable_npcs.failure_states` - TEXT
- `scriptable_npcs.puzzle_glow_clues` - TEXT
- `scriptable_npcs.puzzle_extraction_pattern` - TEXT
- `scriptable_npcs.puzzle_hint_responses` - TEXT
- `scriptable_npcs.puzzle_followup_responses` - TEXT
- `scriptable_npcs.puzzle_incorrect_attempt_responses` - TEXT
- `room_npcs.state` - TEXT NOT NULL DEFAULT '{}'
- `merchant_items.config_json` - TEXT DEFAULT '{}'
- `players.widget_config` - TEXT (with default JSON string)
- `lore_keepers.keywords_responses` - TEXT
- `lore_keepers.puzzle_clues` - TEXT

**JSONB Fields (Modern Approach):**
- `factory_recipes.required_ingredients` - JSONB
- `factory_recipes.required_runes` - JSONB
- `factory_recipes.output_items` - JSONB
- `factory_recipes.required_stats` - JSONB
- `factory_recipes.byproducts` - JSONB
- `factory_events.metadata` - JSONB
- `rooms.factory_quirks` - JSONB
- `debug_todos.environment` - JSONB
- `debug_todos.logs` - JSONB
- `markup_conventions.effects` - JSONB

**Code Pattern:**
```javascript
// TEXT fields require manual JSON.stringify/parse
const stateJson = JSON.stringify(initialState);
await query('INSERT INTO room_npcs (state) VALUES ($1)', [stateJson]);
const state = row.state ? JSON.parse(row.state) : {};

// JSONB fields can be used directly
await query('INSERT INTO factory_recipes (required_ingredients) VALUES ($1)', [recipe.required_ingredients]);
```

**Issues:**
1. **Performance:** JSONB is faster for querying and indexing
2. **Type Safety:** JSONB validates JSON structure at insert time
3. **Query Capabilities:** JSONB supports PostgreSQL JSON operators (`->`, `->>`, `@>`)
4. **Code Complexity:** TEXT fields require manual parsing with error handling (`safeJsonParse` function exists but not used consistently)

**Recommendation:**
- Migrate all TEXT JSON fields to JSONB where appropriate
- Update code to use JSONB directly (no stringify/parse needed)
- Remove `safeJsonParse` helper or limit its use to legacy data migration
- This provides better performance, type safety, and query capabilities

**Priority:** High (affects performance and maintainability)

---

### 3. Missing Constraints and Validation

#### 3.1 Enum-like TEXT Fields Without CHECK Constraints
**Issue:** Several TEXT fields act as enums but lack CHECK constraints to enforce valid values.

**Affected Fields:**
- `rooms.room_type` - TEXT NOT NULL DEFAULT 'normal'
  - Valid values: 'normal', 'merchant', 'factory', 'warehouse'
  - No constraint enforces this
  
- `scriptable_npcs.puzzle_type` - TEXT DEFAULT 'none'
  - Valid values: 'none', 'glow_codex', etc.
  - Has CHECK constraint: `check_puzzle_type` (good!)
  
- `scriptable_npcs.output_distribution` - TEXT NOT NULL DEFAULT 'ground'
  - Valid values: 'ground', 'inventory', etc.
  - Has CHECK constraint: `chk_output_distribution` (good!)
  
- `debug_todos.status` - TEXT NOT NULL DEFAULT 'open'
  - Valid values: 'open', 'in_progress', 'resolved', 'backlog'
  - No constraint enforces this
  
- `debug_todos.ticket_type` - TEXT DEFAULT 'bug'
  - Valid values: 'bug', 'feature', 'debug'
  - Has CHECK constraint: `debug_todos_ticket_type_check` (good!)
  
- `factory_events.event_type` - TEXT NOT NULL
  - Has CHECK constraint: `factory_events_type_check` (good!)
  
- `loops.path_type` - TEXT DEFAULT 'loop'
  - Valid values: 'loop', 'path'
  - No constraint enforces this

**Recommendation:**
- Add CHECK constraints for all enum-like TEXT fields
- This prevents invalid data at the database level
- Improves data integrity and makes valid values explicit

**Priority:** Medium (data integrity)

---

#### 3.2 Missing Range Constraints
**Issue:** Numeric fields lack CHECK constraints to enforce valid ranges.

**Examples:**
- `players.stat_*` fields (ingenuity, resonance, fortitude, acumen) - INTEGER
  - No minimum/maximum enforced
  - Code may validate but database doesn't
  
- `players.resource_vitalis` - INTEGER NOT NULL DEFAULT 50
  - Code enforces: `resource_vitalis <= resource_max_vitalis` (line 428-430)
  - No database constraint enforces this relationship
  
- `players.pulse_echoes` - INTEGER NOT NULL DEFAULT 0
  - Should be >= 0 (no negative values)
  - No constraint enforces this
  
- `debug_todos.priority` - INTEGER DEFAULT 2
  - Valid range: 1-4 (low, medium, high, critical)
  - Has CHECK constraint: `debug_todos_priority_check` (good!)

**Recommendation:**
- Add CHECK constraints for numeric ranges where business rules exist
- Add composite constraints for relationships (e.g., `resource_vitalis <= resource_max_vitalis`)
- This enforces business rules at the database level, preventing invalid states

**Priority:** Medium (data integrity)

---

#### 3.3 Missing Foreign Key Constraints
**Issue:** Some relationships lack foreign key constraints.

**Examples:**
- `room_items.item_name` - TEXT NOT NULL
  - References `items.name` but no foreign key constraint
  - Uses TEXT instead of INTEGER ID (denormalized)
  
- `player_items.item_name` - TEXT NOT NULL
  - References `items.name` but no foreign key constraint
  - Uses TEXT instead of INTEGER ID (denormalized)
  
- `warehouse_items.item_name` - TEXT NOT NULL
  - References `items.name` but no foreign key constraint
  - Uses TEXT instead of INTEGER ID (denormalized)

**Note:** This appears to be an intentional design choice (denormalization for performance), but it means:
- No referential integrity enforcement
- Item name changes could orphan records
- No cascade delete behavior

**Recommendation:**
- Document this as an intentional design pattern
- OR consider migrating to item_id foreign keys if referential integrity is needed
- If keeping TEXT names, add application-level validation

**Priority:** Low (appears intentional, but should be documented)

---

### 4. Timestamp Inconsistencies

#### 4.1 Mixed Timestamp Types
**Issue:** The database uses both BIGINT (milliseconds since epoch) and TIMESTAMP types.

**BIGINT Timestamps (Milliseconds):**
- `players.last_attune_time` - BIGINT
- `loops.created_at` - BIGINT NOT NULL
- `loop_steps.created_at` - BIGINT NOT NULL
- `factory_recipes.created_at` - BIGINT NOT NULL
- `factory_events.timestamp` - BIGINT NOT NULL
- `game_messages.created_at` - BIGINT NOT NULL
- `game_messages.updated_at` - BIGINT NOT NULL
- `zork_knowledge.created_at` - BIGINT
- `zork_knowledge.updated_at` - BIGINT
- Most `created_at` fields in item/inventory tables

**TIMESTAMP Types:**
- `schema_migrations.applied_at` - TIMESTAMP NOT NULL DEFAULT NOW()
- `debug_sessions.started_at` - TIMESTAMP WITH TIME ZONE DEFAULT now()
- `debug_sessions.ended_at` - TIMESTAMP WITH TIME ZONE
- `debug_todos.created_at` - TIMESTAMP WITH TIME ZONE DEFAULT now()
- `debug_todos.updated_at` - TIMESTAMP WITH TIME ZONE DEFAULT now()
- `lore_keeper_greetings.first_greeted_at` - TIMESTAMP DEFAULT now()
- `lore_keeper_greetings.last_greeted_at` - TIMESTAMP DEFAULT now()
- `lore_keeper_item_awards.awarded_at` - TIMESTAMP DEFAULT now()
- `lore_keepers.created_at` - TIMESTAMP DEFAULT now()
- `lore_keepers.updated_at` - TIMESTAMP DEFAULT now()

**Issues:**
1. **Inconsistency:** Two different timestamp systems
2. **Timezone Handling:** BIGINT doesn't store timezone info, TIMESTAMP WITH TIME ZONE does
3. **Query Complexity:** Different types require different query patterns
4. **Default Values:** BIGINT uses `EXTRACT(EPOCH FROM NOW()) * 1000`, TIMESTAMP uses `now()`

**Recommendation:**
- Standardize on one timestamp type:
  - **Option A:** Use TIMESTAMP WITH TIME ZONE everywhere (PostgreSQL best practice)
  - **Option B:** Use BIGINT everywhere (if JavaScript millisecond timestamps are required)
- If keeping BIGINT, document why (JavaScript compatibility)
- Consider timezone requirements for future features

**Priority:** Low (functional but inconsistent)

---

### 5. Default Value Inconsistencies

#### 5.1 Missing Defaults
**Issue:** Some columns that should have defaults don't, requiring application code to always provide values.

**Examples:**
- `scriptable_npcs.required_stats` - TEXT (nullable, no default)
  - Code often passes `null` or `{}`
  - Could default to `'{}'` or use JSONB with default `'{}'::jsonb`
  
- `room_npcs.state` - TEXT NOT NULL DEFAULT '{}' (good!)
  
- `merchant_items.config_json` - TEXT DEFAULT '{}' (good!)

**Recommendation:**
- Review nullable columns and add defaults where appropriate
- Reduces application code complexity
- Ensures consistent data even if application code has bugs

**Priority:** Low (minor improvement)

---

### 6. Naming Convention Inconsistencies

#### 6.1 Code vs Database Naming
**Issue:** Database uses snake_case, but code sometimes uses camelCase when mapping results.

**Examples:**
- Database: `room_npcs.last_cycle_run`
- Code mapping: `lastCycleRun: row.last_cycle_run` (line 936)
- Database: `scriptable_npcs.base_cycle_time`
- Code mapping: `base_cycle_time: row.base_cycle_time` (line 874) - inconsistent!

**Recommendation:**
- Standardize on consistent mapping patterns
- Either always use snake_case in code, or always convert to camelCase
- Document the chosen convention

**Priority:** Low (cosmetic, but affects maintainability)

---

### 7. Data Validation Patterns

#### 7.1 Application-Level Validation Without Database Enforcement
**Issue:** Code performs validation that could be enforced at the database level.

**Example:**
```javascript
// database.js lines 418-436
if (player.resource_vitalis !== undefined) {
  const currentPlayer = await getPlayerById(player.id);
  if (currentPlayer) {
    const maxVitalis = player.resource_max_vitalis !== undefined 
      ? player.resource_max_vitalis 
      : (currentPlayer.resource_max_vitalis || 1000);
    
    if (player.resource_vitalis > maxVitalis) {
      console.warn(`[updatePlayer] Attempted to set vitalis (${player.resource_vitalis}) above max (${maxVitalis}). Capping to max.`);
      player.resource_vitalis = maxVitalis;
    }
    if (player.resource_vitalis < 0) {
      player.resource_vitalis = 0;
    }
  }
}
```

**Recommendation:**
- Add database CHECK constraint: `resource_vitalis >= 0 AND resource_vitalis <= resource_max_vitalis`
- This enforces the rule at the database level
- Application code can still validate, but database is the source of truth
- Prevents invalid data even if application code has bugs

**Priority:** Medium (data integrity)

---

### 8. JSON Field Parsing Patterns

#### 8.1 Inconsistent Error Handling
**Issue:** JSON parsing uses different patterns across the codebase.

**Patterns Found:**
1. **Direct parsing with fallback:**
   ```javascript
   state: row.state ? JSON.parse(row.state) : {}
   ```

2. **Safe parsing function:**
   ```javascript
   function safeJsonParse(jsonString, defaultValue, fieldName) {
     if (!jsonString || jsonString.trim() === '') {
       return defaultValue;
     }
     try {
       return JSON.parse(jsonString);
     } catch (error) {
       console.error(`Error parsing JSON for field '${fieldName}':`, error.message);
       return defaultValue;
     }
   }
   ```

3. **Used inconsistently:**
   - `getNPCsInRoom` uses direct parsing (line 872)
   - `getAllActiveNPCs` uses `safeJsonParse` (line 935)

**Recommendation:**
- Standardize on one pattern
- If using TEXT JSON fields, always use `safeJsonParse`
- If migrating to JSONB, remove parsing entirely (PostgreSQL handles it)
- Document the chosen pattern

**Priority:** Medium (code quality)

---

## Summary of Recommendations

### High Priority
1. **Migrate TEXT JSON fields to JSONB** - Improves performance, type safety, and query capabilities
2. **Standardize JSON parsing patterns** - Use consistent error handling

### Medium Priority
3. **Add CHECK constraints for enum-like TEXT fields** - Enforce valid values at database level
4. **Add CHECK constraints for numeric ranges** - Enforce business rules
5. **Migrate boolean flags from INTEGER to BOOLEAN** - Improve type safety
6. **Add database-level validation for relationships** - e.g., `resource_vitalis <= resource_max_vitalis`

### Low Priority
7. **Standardize timestamp types** - Choose BIGINT or TIMESTAMP WITH TIME ZONE consistently
8. **Add missing default values** - Reduce application code complexity
9. **Standardize naming conventions** - Document snake_case vs camelCase mapping
10. **Document intentional design choices** - e.g., TEXT item_name instead of foreign keys

---

## Migration Strategy Recommendations

If implementing these changes:

1. **Phase 1: Non-Breaking Improvements**
   - Add CHECK constraints (doesn't change existing data)
   - Add missing defaults (doesn't break existing code)
   - Document design choices

2. **Phase 2: Type Migrations**
   - Migrate INTEGER flags to BOOLEAN
   - Migrate TEXT JSON to JSONB
   - Update application code in parallel

3. **Phase 3: Standardization**
   - Standardize timestamp types
   - Standardize naming conventions
   - Add comprehensive constraints

**Testing Strategy:**
- Test all migrations on development database first
- Verify application code handles new types correctly
- Test rollback procedures
- Update MCP tools if schema changes affect them

---

## Stable Patterns for Future Development

Based on this audit, here are recommended patterns for Cursor to follow:

### JSON Storage
- **Use JSONB** for all JSON data (not TEXT with JSON.stringify)
- **No manual parsing needed** - PostgreSQL handles JSONB natively
- **Use JSON operators** for querying: `->`, `->>`, `@>`

### Boolean Fields
- **Use BOOLEAN type** (not INTEGER 0/1)
- **Direct boolean checks** in code (not `=== 1`)

### Enum Fields
- **Use TEXT with CHECK constraints** to enforce valid values
- **Document valid values** in migration comments

### Timestamps
- **Choose one type and stick with it:**
  - TIMESTAMP WITH TIME ZONE for timezone-aware data
  - BIGINT for JavaScript millisecond compatibility
- **Use consistent default patterns**

### Constraints
- **Add CHECK constraints** for business rules
- **Add foreign key constraints** where referential integrity is needed
- **Document intentional denormalization** (e.g., item_name instead of item_id)

### Naming
- **Database: snake_case** (PostgreSQL convention)
- **Code mapping: Document chosen pattern** (snake_case or camelCase)
- **Be consistent** within each table/function

---

## Conclusion

The database schema is functional and well-structured overall. The main areas for improvement are:

1. **Type consistency** (boolean flags, JSON storage)
2. **Constraint enforcement** (enums, ranges, relationships)
3. **Standardization** (timestamps, naming, patterns)

These improvements will enhance:
- **Type safety** - Prevents invalid data
- **Performance** - JSONB is faster than TEXT JSON
- **Maintainability** - Consistent patterns are easier to work with
- **Data integrity** - Database-level enforcement is more reliable

No critical issues were found that would cause data loss or corruption. All recommendations are improvements to quality, consistency, and maintainability.




