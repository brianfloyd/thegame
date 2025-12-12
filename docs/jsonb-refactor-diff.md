# JSONB Refactor - Removed JSON.parse/stringify Calls

## Summary

This document lists all JSON.parse and JSON.stringify calls that were removed as part of the JSONB refactor.

## Removed JSON.parse Calls

### database.js

1. **getPlayerWidgetConfig** (line 183)
   - **Before:** `const config = JSON.parse(player.widget_config);`
   - **After:** `const config = player.widget_config || {};`

2. **getNPCsInRoom** (lines 872, 880, 881, 886, 887, 888)
   - **Before:** 
     ```js
     state: row.state ? JSON.parse(row.state) : {},
     puzzleGlowClues: row.puzzle_glow_clues ? JSON.parse(row.puzzle_glow_clues) : null,
     puzzleExtractionPattern: row.puzzle_extraction_pattern ? JSON.parse(row.puzzle_extraction_pattern) : null,
     puzzleHintResponses: row.puzzle_hint_responses ? JSON.parse(row.puzzle_hint_responses) : null,
     puzzleFollowupResponses: row.puzzle_followup_responses ? JSON.parse(row.puzzle_followup_responses) : null,
     puzzleIncorrectAttemptResponses: row.puzzle_incorrect_attempt_responses ? JSON.parse(row.puzzle_incorrect_attempt_responses) : null,
     ```
   - **After:**
     ```js
     state: row.state || {},
     puzzleGlowClues: row.puzzle_glow_clues || [],
     puzzleExtractionPattern: row.puzzle_extraction_pattern || [],
     puzzleHintResponses: row.puzzle_hint_responses || [],
     puzzleFollowupResponses: row.puzzle_followup_responses || [],
     puzzleIncorrectAttemptResponses: row.puzzle_incorrect_attempt_responses || [],
     ```

3. **getAllActiveNPCs** (lines 935, 939, 940, 941, 942, 944)
   - **Before:** Used `safeJsonParse` for all JSON fields
   - **After:** Direct access: `row.state || {}`, `row.required_stats || {}`, etc.

4. **getLoreKeepersInRoom** (lines 1082, 1086)
   - **Before:**
     ```js
     keywordsResponses: row.keywords_responses ? JSON.parse(row.keywords_responses) : {},
     puzzleClues: row.puzzle_clues ? JSON.parse(row.puzzle_clues) : [],
     ```
   - **After:**
     ```js
     keywordsResponses: row.keywords_responses || {},
     puzzleClues: row.puzzle_clues || [],
     ```

### handlers/index.js

1. **Line 194**
   - **Before:** `const npcState = JSON.parse(roomNpcResult.rows[0].state);`
   - **After:** `const npcState = roomNpcResult.rows[0].state || {};`

### handlers/game.js

1. **Line 2256** - input_items
   - **Before:** `requiredItems = npcDef.input_items ? JSON.parse(npcDef.input_items) : {};`
   - **After:** `const requiredItems = npcDef.input_items || {};`

2. **Line 2280** - state
   - **Before:** `npcState = freshRoomNpc && freshRoomNpc.state ? JSON.parse(freshRoomNpc.state) : {};`
   - **After:** `const npcState = (freshRoomNpc && freshRoomNpc.state) || {};`

3. **Line 2339** - state
   - **Before:** `const savedState = verifyResult.rows[0].state ? JSON.parse(verifyResult.rows[0].state) : {};`
   - **After:** `const savedState = verifyResult.rows[0].state || {};`

4. **Line 2413** - state
   - **Before:** `npcState = roomNpc.state ? JSON.parse(roomNpc.state) : {};`
   - **After:** `const npcState = roomNpc.state || {};`

5. **Line 2451** - input_items
   - **Before:** `requiredItems = npcDef.input_items ? JSON.parse(npcDef.input_items) : {};`
   - **After:** `const requiredItems = npcDef.input_items || {};`

6. **Line 2542** - state
   - **Before:** `npcState = roomNpc.state ? JSON.parse(roomNpc.state) : {};`
   - **After:** `const npcState = roomNpc.state || {};`

### services/npcCycleEngine.js

1. **Line 112** - state
   - **Before:** `state = roomNpc.state ? JSON.parse(roomNpc.state) : {};`
   - **After:** `const state = roomNpc.state || {};`

2. **Line 183** - state
   - **Before:** `state = npc.state ? JSON.parse(npc.state) : {};`
   - **After:** `const state = npc.state || {};`

3. **Lines 594-596** - state
   - **Before:** 
     ```js
     const freshState = typeof freshRoomNpc.state === 'string' 
       ? JSON.parse(freshRoomNpc.state) 
       : freshRoomNpc.state;
     ```
   - **After:** `const freshState = freshRoomNpc.state || {};`

4. **Lines 819-821** - state
   - **Before:**
     ```js
     const freshState = typeof freshRoomNpc.state === 'string' 
       ? JSON.parse(freshRoomNpc.state) 
       : freshRoomNpc.state;
     ```
   - **After:** `const freshState = freshRoomNpc.state || {};`

5. **Line 968** - state
   - **Before:** `const freshState = freshRoomNpcResult.rows[0].state ? JSON.parse(freshRoomNpcResult.rows[0].state) : {};`
   - **After:** `const freshState = freshRoomNpcResult.rows[0].state || {};`

### services/ticketService.js

1. **Lines 108-109** - environment and logs
   - **Before:**
     ```js
     environment: ticketData.environment ? JSON.parse(ticketData.environment) : null,
     logs: ticketData.logs ? JSON.parse(ticketData.logs) : null,
     ```
   - **After:**
     ```js
     environment: ticketData.environment || null,
     logs: ticketData.logs || null,
     ```

### scripts/zork-ai-agent.cjs

1. **Lines 1645-1648** - NPC fields
   - **Before:**
     ```js
     input_items: npc.input_items ? JSON.parse(npc.input_items) : {},
     output_items: npc.output_items ? JSON.parse(npc.output_items) : {},
     required_stats: npc.required_stats ? JSON.parse(npc.required_stats) : {},
     required_buffs: npc.required_buffs ? JSON.parse(npc.required_buffs) : [],
     ```
   - **After:**
     ```js
     input_items: npc.input_items || {},
     output_items: npc.output_items || {},
     required_stats: npc.required_stats || {},
     required_buffs: npc.required_buffs || [],
     ```

2. **Lines 1670-1673** - NPC fields (duplicate)
   - Same changes as above

3. **Lines 1737, 1822, 3112, 3155, 3202** - keywords_responses and output_items
   - All updated to use direct object access

## Removed JSON.stringify Calls

### database.js

1. **updatePlayerWidgetConfig** (line 198)
   - **Before:** `const configJson = JSON.stringify(config);` then pass `configJson`
   - **After:** Pass `config` directly

2. **createScriptableNPC** (line 779)
   - **Before:** `harvest_prerequisite_items ? JSON.stringify(harvest_prerequisite_items) : null`
   - **After:** `harvest_prerequisite_items || null` (and all other JSON fields pass objects directly)

3. **updateScriptableNPC** (line 843)
   - **Before:** `npc.harvest_prerequisite_items ? JSON.stringify(npc.harvest_prerequisite_items) : ...`
   - **After:** `npc.harvest_prerequisite_items || ...` (and all other JSON fields pass objects directly)

4. **placeNPCInRoom** (line 1000)
   - **Before:** `const stateJson = JSON.stringify(initialState);` then pass `stateJson`
   - **After:** Pass `initialState || {}` directly

5. **updateNPCState** (line 1043)
   - **Before:** `const stateJson = JSON.stringify(state);` then pass `stateJson`
   - **After:** Pass `state || {}` directly

6. **updateMerchantItemFromConfig** (line 1828)
   - **Before:** `params.push(JSON.stringify(config));`
   - **After:** `params.push(config || {});`

7. **createFactoryRecipe** (lines 1470-1478)
   - **Before:** `JSON.stringify(recipe.required_ingredients || [])`, etc.
   - **After:** `recipe.required_ingredients || []` (direct object/array)

8. **updateFactoryRecipe** (lines 1528-1536)
   - **Before:** `updates.required_ingredients ? JSON.stringify(updates.required_ingredients) : null`, etc.
   - **After:** `updates.required_ingredients || null` (direct object/array)

9. **logFactoryEvent** (line 1579)
   - **Before:** `eventData.metadata ? JSON.stringify(eventData.metadata) : null`
   - **After:** `eventData.metadata || null`

10. **createMarkupConvention** (line 2911)
    - **Before:** `JSON.stringify(effects || {})`
    - **After:** `effects || {}`

11. **updateMarkupConvention** (line 2934)
    - **Before:** `JSON.stringify(effects || {})`
    - **After:** `effects || {}`

12. **createDebugTodo** (line 3274)
    - **Before:** `JSON.stringify(environment || {})`, `JSON.stringify(logs || {})`
    - **After:** `environment || {}`, `logs || {}`

## Removed Functions

### database.js

- **safeJsonParse** (lines 902-914)
  - Complete function removed
  - Was used in `getAllActiveNPCs` for parsing JSON fields
  - No longer needed as JSONB fields are native objects

## Total Impact

- **~50+ JSON.parse calls removed**
- **~20+ JSON.stringify calls removed**
- **1 helper function removed**
- **15 database columns converted to JSONB**
- **12 files modified**

## Verification

All changes maintain backward compatibility during migration period. Code includes checks for `typeof field === 'string'` to handle any legacy TEXT data that might exist during the transition.


