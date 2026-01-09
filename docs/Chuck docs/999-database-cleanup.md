# Database Relational Cleanup Audit

**Date:** 2024-12-XX  
**Purpose:** Audit current database structure focusing on relational connections. Identify name-based item references that should be converted to direct foreign key relationships.

## Executive Summary

The database currently has **12 areas** where items are referenced by name (TEXT) instead of using direct foreign key relationships (INTEGER item_id). This creates several issues:
- No referential integrity (orphaned references if item names change)
- No type validation at database level
- Slower queries (string matching vs integer joins)
- Potential for typos and inconsistencies

**Good News:** Some systems already use proper foreign keys:
- ✅ `merchant_items.item_id` → `items(id)`
- ✅ `factory_events.item_id` → `items(id)`
- ✅ `player_warehouses.deed_item_id` → `items(id)`

---

## Priority 1: Critical Inventory & Storage Systems

### 1.1 `room_items.item_name` → `item_id`
**Current:** `item_name TEXT NOT NULL`  
**Target:** `item_id INTEGER NOT NULL REFERENCES items(id)`

**Impact:** High - Items on ground in rooms  
**Data Migration:** Must map all existing `item_name` values to `items.id`  
**Code Changes:** All queries in `handlers/game.js` (take, drop, look commands)

**Example Issue:**
```sql
-- Current (fragile)
SELECT * FROM room_items WHERE item_name = 'Harvester Rune';

-- Target (robust)
SELECT * FROM room_items WHERE item_id = 42;
```
###completed

---

### 1.2 `player_items.item_name` → `item_id`
**Current:** `item_name TEXT NOT NULL`  
**Target:** `item_id INTEGER NOT NULL REFERENCES items(id)`

**Impact:** High - Player inventory system  
**Data Migration:** Must map all existing `item_name` values to `items.id`  
**Code Changes:** All inventory queries, take/drop/harvest commands

**Next Steps:**
##completed

---

### 1.3 `warehouse_items.item_name` → `item_id`
**Current:** `item_name TEXT NOT NULL`  
**Target:** `item_id INTEGER NOT NULL REFERENCES items(id)`

**Impact:** Medium - Warehouse storage system  
**Data Migration:** Must map all existing `item_name` values to `items.id`  
**Code Changes:** Warehouse store/withdraw commands

###completed

**Implementation:**
- ✅ Migration `077_convert_warehouse_items_to_item_id.sql` created
- ✅ Database functions updated: `getWarehouseItems()`, `addWarehouseItem()`, `removeWarehouseItem()`, `getWarehouseItemTypeCount()`, `getWarehouseItemQuantity()`
- ✅ All functions now use `item_id` with JOIN to items table for item names
- ✅ Backward compatibility: Functions still accept `itemName` parameter and convert to `item_id` internally
- ✅ Code in `handlers/game.js` works with updated functions (returns `item_name` from JOIN)

---

## Priority 2: NPC & Harvest Systems

### 2.1 `scriptable_npcs.harvest_prerequisite_item` → `harvest_prerequisite_item_id`
**Current:** `harvest_prerequisite_item TEXT` (stores JSON: `[{"item_name":"Harvester Rune"}]`)  
**Target:** `harvest_prerequisite_item_id INTEGER REFERENCES items(id)`

**Impact:** High - Harvest prerequisite checking  
**Data Migration:** Extract item name from JSON, find item ID  
**Code Changes:** Harvest validation logic in `handlers/game.js` and `services/npcCycleEngine.js`

**Current Data Example:**
```json
[{"item_name":"Harvester Rune"}]
```

**Target:**
```sql
harvest_prerequisite_item_id = 42  -- Direct reference to items.id
```

###completed

**Implementation:**
- ✅ Migration `078_convert_harvest_prerequisite_to_item_id.sql` created and applied
- ✅ Parses JSON array format `[{"item_name":"Harvester Rune"}]` and extracts item_name
- ✅ Looks up item_id from items table and populates new column
- ✅ Added `harvest_prerequisite_item_id INTEGER REFERENCES items(id)` column
- ✅ Data migrated: Pulsewood Tree now has `harvest_prerequisite_item_id = 2` (Harvester Rune)
- ✅ Code updated in `handlers/game.js`: `harvest()` and `checkAndAutoHarvest()` functions
- ✅ Backward compatibility: Code supports both old (JSON) and new (item_id) formats
- ✅ Database functions updated: `createScriptableNPC()` and `updateScriptableNPC()` support new field
- ⚠️ Old `harvest_prerequisite_item` column kept temporarily for rollback safety (can be dropped later)

---

### 2.2 `scriptable_npcs.input_items` (JSONB) - Convert item names to IDs
**Current:** `input_items JSONB` stores `{"item_name": quantity}`  
**Target:** `input_items JSONB` stores `{"item_id": quantity}`

**Impact:** High - NPC input requirements  
**Data Migration:** Transform all JSONB objects from name keys to ID keys  
**Code Changes:** NPC cycle engine, harvest validation

**Current Example:**
```json
{"root_nutrient": 2, "raw_fiber": 1}
```

**Target:**
```json
{"42": 2, "43": 1}  -- item_id as string key (JSONB limitation)
```

**Note:** JSONB keys must be strings, so we'll use stringified item IDs.

###completed

**Implementation:**
- ✅ Migration `079_convert_npc_input_items_to_ids.sql` created
- ✅ Migration `080_convert_npc_output_items_to_ids.sql` created
- ✅ Migration `081_convert_puzzle_reward_to_item_id.sql` created
- ✅ Helper functions added: `convertItemIdsToNames()` and `convertItemNamesToIds()` in `database.js`
- ✅ `getAllScriptableNPCs()`: Converts item_id keys to item_name keys for editor compatibility
- ✅ `getScriptableNPCById()`: Converts item_id keys to item_name keys and puzzle_reward_item_id to puzzle_reward_item
- ✅ `getAllActiveNPCs()`: Converts item_id keys to item_name keys for NPC cycle engine
- ✅ `getNPCsInRoom()`: Converts puzzle_reward_item_id to puzzle_reward_item for handlers
- ✅ `createScriptableNPC()`: Converts item_name keys to item_id keys when saving
- ✅ `updateScriptableNPC()`: Converts item_name keys to item_id keys and puzzle_reward_item to puzzle_reward_item_id when saving
- ✅ `handlers/game.js`: Updated harvest validation to handle both formats (backward compatibility)
- ✅ Editor compatibility: NPC editor (`public/gameeditors/npc-editor.js`) works with item names (converted automatically)
- ✅ NPC model (`public/js/models/npc.js`): Handles both formats during transition
- ⚠️ Old columns kept temporarily for rollback safety (can be dropped later)

---

---
## Priority 3: Lore Keeper System

### 3.1 `lore_keepers.puzzle_reward_item` → `puzzle_reward_item_id`
**Current:** `puzzle_reward_item TEXT`  
**Target:** `puzzle_reward_item_id INTEGER REFERENCES items(id)`

**Impact:** Medium - Lore Keeper puzzle rewards  
**Data Migration:** Lookup item_id by name  
**Code Changes:** Lore Keeper reward logic

###completed

**Implementation:**
- ✅ Migration `082_convert_lore_keeper_reward_to_item_id.sql` created
- ✅ `getLoreKeeperByNpcId()`: Converts puzzle_reward_item_id to puzzle_reward_item (item name) for backward compatibility
- ✅ `getLoreKeepersInRoom()`: Converts puzzle_reward_item_id to puzzle_reward_item for handlers
- ✅ `createLoreKeeper()`: Converts puzzle_reward_item (item name) to puzzle_reward_item_id when saving
- ✅ `updateLoreKeeper()`: Converts puzzle_reward_item (item name) to puzzle_reward_item_id when saving
- ✅ Handlers continue to work with item names (converted automatically)
- ⚠️ Old column kept temporarily for rollback safety (can be dropped later)

---

### 3.2 `lore_keeper_item_awards.item_name` → `item_id`
**Current:** `item_name TEXT NOT NULL`  
**Target:** `item_id INTEGER NOT NULL REFERENCES items(id)`

**Impact:** Low - Award tracking (historical data)  
**Data Migration:** Map existing awards to item IDs  
**Code Changes:** Award tracking queries

###completed

**Implementation:**
- ✅ Migration `083_convert_lore_keeper_awards_to_item_id.sql` created (includes duplicate consolidation)
- ✅ `hasPlayerBeenAwardedItemByLoreKeeper()`: Looks up item_id from item_name, then queries with item_id
- ✅ `recordLoreKeeperItemAward()`: Looks up item_id from item_name, stores both item_id and item_name (for backward compatibility)
- ✅ `getLastLoreKeeperItemAwardTime()`: Looks up item_id from item_name, then queries with item_id
- ✅ `getLoreKeeperItemAwards()`: JOINs items table to return item_name for display
- ✅ Unique constraint added on (player_id, npc_id, item_id) to prevent duplicates
- ⚠️ Old column kept temporarily for rollback safety (can be dropped later)

---

## Priority 4: Factory & Crafting System

### 4.1 `factory_recipes.required_ingredients` (JSONB) - Convert item names to IDs
**Current:** `required_ingredients JSONB` stores `[{"item_name": "Pulse Resin", "quantity": 5}]`  
**Target:** `required_ingredients JSONB` stores `[{"item_id": 123, "quantity": 5}]`

**Impact:** High - Factory crafting system  
**Data Migration:** Transform all arrays from item_name to item_id  
**Code Changes:** Recipe matching logic in `services/factoryRecipeMatcher.js`

**Current Example:**
```json
[{"item_name": "Pulse Resin", "quantity": 5}]
```

**Target:**
```json
[{"item_id": 123, "quantity": 5}]
```

###completed

**Implementation:**
- ✅ Migration `084_convert_factory_ingredients_to_item_ids.sql` created
- ✅ Migration `085_convert_factory_outputs_to_item_ids.sql` created
- ✅ Migration `086_convert_factory_byproducts_to_item_ids.sql` created
- ✅ Helper functions added: `convertItemArrayIdsToNames()` and `convertItemArrayNamesToIds()` in `database.js`
- ✅ `getFactoryRecipes()`: Converts item_id arrays to item_name arrays for backward compatibility
- ✅ `getFactoryRecipeById()`: Converts item_id arrays to item_name arrays
- ✅ `getFactoryRecipeByName()`: Converts item_id arrays to item_name arrays
- ✅ `createFactoryRecipe()`: Converts item_name arrays to item_id arrays when saving
- ✅ `updateFactoryRecipe()`: Converts item_name arrays to item_id arrays when saving
- ✅ `services/factoryRecipeMatcher.js`: Already handles both `item_name` and `itemName` properties, works with converted data
- ✅ No changes needed to factory services - they receive item_name format automatically
- ⚠️ Old format (item_name) is completely replaced with item_id format in database (no backward compatibility column needed)

---

### 4.2 `factory_recipes.output_items` (JSONB) - Convert item names to IDs
**Current:** `output_items JSONB` stores `[{"item_name": "Pulse Crystal", "quantity": 1}]`  
**Target:** `output_items JSONB` stores `[{"item_id": 456, "quantity": 1}]`

**Impact:** High - Factory output production  
**Data Migration:** Same pattern as 4.1  
**Code Changes:** Factory output routing

###completed

**Implementation:** See 4.1 above - handled in same migration and code updates

---

### 4.3 `factory_recipes.byproducts` (JSONB) - Convert item names to IDs
**Current:** `byproducts JSONB` stores `[{"item_name": "...", "quantity": X, "chance": Y}]`  
**Target:** `byproducts JSONB` stores `[{"item_id": 789, "quantity": X, "chance": Y}]`

**Impact:** Medium - Factory byproduct system  
**Data Migration:** Same pattern as 4.1  
**Code Changes:** Byproduct handling

###completed

**Implementation:** See 4.1 above - handled in same migration and code updates

---

## Type Matching Validation

### Current State
The codebase already performs type matching in several places:
- ✅ Factory widget validates `item_type` (ingredient vs rune) in `handlers/game.js`
- ✅ Factory recipes check item types during matching
- ✅ NPCs validate item types for input/output

### Recommendations
1. **Add CHECK constraints** on JSONB fields to validate item_id references exist
2. **Add database functions** to validate item_id in JSONB structures
3. **Add application-level validation** before inserting/updating JSONB with item references

**Example Validation Function:**
```sql
CREATE OR REPLACE FUNCTION validate_item_ids_in_jsonb(
  jsonb_data JSONB,
  key_name TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Validate all item_id values in JSONB exist in items table
  -- Return true if all valid, false otherwise
END;
$$ LANGUAGE plpgsql;
```

---

## Implementation Strategy

### Phase 1: Inventory Systems (Priority 1)
**Estimated Effort:** 2-3 days  
**Risk:** Medium (affects core gameplay)

1. Start with `room_items` (simplest, least data)
2. Then `player_items` (most critical)
3. Finally `warehouse_items` (less critical)

**Testing:**
- Verify all items can be taken/dropped
- Verify inventory displays correctly
- Verify warehouse operations work

---

### Phase 2: NPC Systems (Priority 2)
**Estimated Effort:** 3-4 days  
**Risk:** High (affects NPC behavior)

1. Convert `harvest_prerequisite_item` first (single field)
2. Convert `input_items` JSONB (more complex)
3. Convert `output_items` JSONB
4. Convert `puzzle_reward_item`

**Testing:**
- Verify harvest prerequisites work
- Verify NPCs consume correct items
- Verify NPCs produce correct items
- Verify puzzle rewards work

---

### Phase 3: Factory System (Priority 4)
**Estimated Effort:** 2-3 days  
**Risk:** Medium (affects crafting)

1. Convert `required_ingredients`
2. Convert `output_items`
3. Convert `byproducts`

**Testing:**
- Verify recipe matching works
- Verify crafting produces correct items
- Verify byproducts work

---

### Phase 4: Lore Keeper System (Priority 3)
**Estimated Effort:** 1-2 days  
**Risk:** Low (affects rewards only)

1. Convert `lore_keepers.puzzle_reward_item`
2. Convert `lore_keeper_item_awards.item_name`

**Testing:**
- Verify puzzle rewards work
- Verify award tracking works

---

## Migration Template Pattern

Each migration should follow this pattern:

```sql
-- Migration: XXX_convert_table_column_to_item_id.sql

-- Step 1: Add new column (nullable initially)
ALTER TABLE table_name 
ADD COLUMN item_id INTEGER REFERENCES items(id);

-- Step 2: Populate from existing data
UPDATE table_name 
SET item_id = (
  SELECT id FROM items 
  WHERE LOWER(items.name) = LOWER(table_name.item_name)
)
WHERE item_name IS NOT NULL;

-- Step 3: Validate (check for NULLs that shouldn't exist)
-- This query should return 0 rows:
SELECT * FROM table_name 
WHERE item_name IS NOT NULL AND item_id IS NULL;

-- Step 4: Make NOT NULL and add constraint
ALTER TABLE table_name
ALTER COLUMN item_id SET NOT NULL;

-- Step 5: Drop old column
ALTER TABLE table_name
DROP COLUMN item_name;

-- Step 6: Add index for performance
CREATE INDEX IF NOT EXISTS idx_table_name_item_id ON table_name(item_id);
```

---

## Code Update Checklist

For each migration, update:

- [ ] Database queries in `database.js`
- [ ] Game handlers in `handlers/game.js`
- [ ] NPC cycle engine in `services/npcCycleEngine.js`
- [ ] Factory systems in `services/factoryRecipeMatcher.js`, `services/factoryCraftingEngine.js`
- [ ] Editor handlers (item editor, NPC editor, etc.)
- [ ] ZORK AI agent queries in `scripts/zork-ai-agent.cjs`
- [ ] Any test files

---

## Risk Mitigation

1. **Backup First:** Always backup database before migrations
2. **Test Environment:** Run all migrations in dev first
3. **Data Validation:** Create validation queries to check data integrity
4. **Rollback Plan:** Keep old columns temporarily, drop after verification
5. **Gradual Rollout:** One system at a time, verify before next

---

## Benefits After Completion

1. **Referential Integrity:** Database enforces item relationships
2. **Type Safety:** Foreign keys prevent invalid references
3. **Performance:** Integer joins are faster than string matching
4. **Consistency:** No more typos or name mismatches
5. **Maintainability:** Easier to refactor item names
6. **Query Clarity:** Direct relationships are clearer than name matching

---

## Next Steps for Cursor

1. **Start with Priority 1.1:** Create migration `075_convert_room_items_to_item_id.sql`
2. **Test thoroughly** in dev environment
3. **Update code** to use `item_id` instead of `item_name`
4. **Verify** all room item operations work
5. **Proceed to next priority** item

**Recommended Order:**
1. `room_items` (simplest)
2. `player_items` (most critical)
3. `warehouse_items`
4. `scriptable_npcs.harvest_prerequisite_item` (single field, good test case)
5. `scriptable_npcs.input_items` (JSONB conversion)
6. `scriptable_npcs.output_items` (JSONB conversion)
7. Factory recipes (all three JSONB fields)
8. Lore Keeper systems
9. Final cleanup and validation

---

## Notes

- JSONB keys must be strings, so item IDs will be stored as string keys: `{"42": 5}` instead of `{42: 5}`
- Some systems may need helper functions to convert between item_id and item_name for display
- Consider adding a view or function to get item names from IDs for backward compatibility during transition
- All migrations should be idempotent (safe to run multiple times)












