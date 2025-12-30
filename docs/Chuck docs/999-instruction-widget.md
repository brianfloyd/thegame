# Instructions Widget + Automation Engine - Planning Document

**Document Type:** Reference Analysis & Design  
**Created:** 2025-01-27  
**Status:** Planning Only - No Implementation  
**Purpose:** Design a new Automation Engine supporting stackable, declarative player commands with sentence-style automation, and a new Instructions Widget (full-width) that exposes this engine to players.

---

## Executive Summary

This document proposes a **new Automation Engine** and **Instructions Widget** that enables players to create declarative automation programs using sentence-style syntax. The system is designed as a standalone engine (similar to NPC Cycle Engine) but player-authored, with full serialization, interruptibility, and safety guardrails.

**Key Design Principles:**
- Engine parity with NPC Cycle Engine (conceptual, not code reuse)
- Player-authored automation programs
- Stackable, declarative instructions
- Clause-based logic (UNTIL/WHILE/IF)
- Variable thresholds (min/max bounds for vitalis)
- Deterministic, tick-based execution
- Full separation from existing automation systems
- Integration with auto-harvest/auto-loop systems

---

## 1. Automation Engine Architecture

### 1.1 Module Structure

**Proposed Location:** `services/automationEngine.js`

**Rationale:**
- Follows existing pattern: `services/npcCycleEngine.js`
- Services layer is for independent, tick-based engines
- Keeps engine logic separate from handlers

**File Structure:**
```
services/
├── automationEngine.js          # Main engine (NEW)
├── npcCycleEngine.js            # Reference pattern (existing)
└── [other services]
```

### 1.2 Engine Core Responsibilities

The Automation Engine will manage:

1. **Program Lifecycle**
   - Load programs from database
   - Initialize execution state
   - Track active programs per player
   - Handle pause/resume/stop

2. **Step Execution**
   - Execute instructions in sequence
   - Evaluate conditions before each step
   - Handle step failures gracefully
   - Track execution progress

3. **Condition Evaluation**
   - Evaluate UNTIL/WHILE/IF clauses
   - Check variable thresholds (vitalis min/max)
   - Validate game state conditions
   - Determine next step or loop

4. **Tick-Based Scheduling**
   - Use `setInterval` pattern (like NPC Cycle Engine)
   - Respect player timing settings
   - Handle multiple programs per player
   - Prevent execution conflicts

5. **Safety Guardrails**
   - Validate instructions before execution
   - Prevent infinite loops
   - Enforce resource limits
   - Stop on invalid state

6. **Auto-Harvest/Loop Integration**
   - Support custom loop instructions
   - Integrate with existing auto-harvest system
   - Handle movement within loops
   - Support nested loop structures

### 1.3 Execution Flow Pattern

Mirrors NPC Cycle Engine pattern:

```javascript
// Pattern from npcCycleEngine.js:426-434
setInterval(async () => {
  try {
    // Get all active automation programs
    const activePrograms = await getActiveAutomationPrograms(db);
    
    for (const program of activePrograms) {
      // Check if program should execute this tick
      if (shouldExecuteStep(program, now)) {
        await executeAutomationStep(db, program, connectedPlayers);
      }
    }
  } catch (error) {
    console.error('[Automation Engine] Error:', error);
  }
}, AUTOMATION_TICK_INTERVAL);
```

**Integration Points:**
- `database.js` - Load/save program state
- `handlers/game.js` - Request actions (harvest, attune, move, etc.)
- `connectedPlayers` Map - Access player sessions
- MessageBus - Send status updates to widgets
- Existing auto-harvest system - For auto-harvest instructions

### 1.4 State Management

**Per-Program Execution State:**
```javascript
{
  programId: number,
  playerId: number,
  currentStepIndex: number,
  executionState: 'idle' | 'running' | 'paused' | 'stopped',
  pauseReason: string | null,
  lastExecutionTime: timestamp,
  loopCount: number,
  currentLoopId: number | null,  // For custom loop instructions
  loopIterationCount: { [loopId]: number },  // Track iterations per loop
  variableValues: { [key: string]: any },
  conditionCache: { [conditionId]: boolean },
  harvestState: {  // For auto-harvest integration
    isHarvesting: boolean,
    targetNPCs: string[],
    collectedItems: { [itemName]: number }
  }
}
```

**Storage:** JSONB field in `automation_programs.execution_state`

---

## 2. Data Model Proposal

### 2.1 New Tables

#### `automation_programs`
**Purpose:** Store player-authored automation programs

**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `name` TEXT NOT NULL (user-friendly program name)
- `description` TEXT (optional program description)
- `is_active` BOOLEAN NOT NULL DEFAULT FALSE
- `execution_state` JSONB DEFAULT '{}' (current execution state)
- `created_at` TIMESTAMP NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Indexes:**
- `idx_automation_programs_player_id` ON `automation_programs(player_id)`
- `idx_automation_programs_active` ON `automation_programs(player_id, is_active)` WHERE `is_active = TRUE`

**Rationale:**
- One-to-many: players → programs
- JSONB for flexible execution state (following canon pattern)
- Active flag for quick filtering

#### `automation_steps`
**Purpose:** Ordered steps within a program

**Fields:**
- `id` SERIAL PRIMARY KEY
- `program_id` INTEGER NOT NULL REFERENCES automation_programs(id) ON DELETE CASCADE
- `step_order` INTEGER NOT NULL (sequence within program)
- `instruction_type` TEXT NOT NULL CHECK (instruction_type IN ('harvest', 'auto_harvest', 'attune', 'deliver', 'wait', 'loop', 'loop_custom', 'collect', 'store', 'move', 'factory_insert_item', 'factory_insert_rune', 'factory_start', 'factory_repeat', 'factory_store_output'))
- `instruction_config` JSONB NOT NULL DEFAULT '{}' (instruction-specific parameters)
- `conditions` JSONB DEFAULT '[]' (array of condition objects)
- `loop_target_step` INTEGER (nullable, for loop instructions - step to loop back to)
- `loop_max_iterations` INTEGER (nullable, for loop instructions - max iterations)
- `created_at` TIMESTAMP NOT NULL DEFAULT NOW()

**Constraints:**
- UNIQUE(`program_id`, `step_order`) - Ensure ordered sequence
- CHECK(`step_order` > 0) - Positive step numbers
- CHECK(`loop_max_iterations` IS NULL OR `loop_max_iterations` > 0) - Positive loop iterations

**Indexes:**
- `idx_automation_steps_program_id` ON `automation_steps(program_id, step_order)`

**Rationale:**
- Normalized: separate table for steps (allows multiple steps per program)
- JSONB for flexible instruction config (e.g., `{npcName: "Pulsewood Tree", itemName: "Pulse Resin"}`)
- JSONB array for conditions (supports multiple conditions per step)
- Support for custom loops with target step and max iterations

#### `automation_conditions`
**Purpose:** Condition definitions for steps

**Fields:**
- `id` SERIAL PRIMARY KEY
- `step_id` INTEGER NOT NULL REFERENCES automation_steps(id) ON DELETE CASCADE
- `condition_type` TEXT NOT NULL CHECK (condition_type IN ('until', 'while', 'if'))
- `condition_target` TEXT NOT NULL (what to check: 'inventory', 'vitalis', 'room_type', 'npc_present', etc.)
- `operator` TEXT NOT NULL CHECK (operator IN ('>=', '<=', '==', '!=', '>', '<'))
- `threshold_value` INTEGER NOT NULL (comparison value)
- `threshold_min` INTEGER (nullable, for variable thresholds - min bound)
- `threshold_max` INTEGER (nullable, for variable thresholds - max bound)
- `item_name` TEXT (nullable, for inventory conditions)
- `variable_name` TEXT (optional, for variable thresholds)

**Indexes:**
- `idx_automation_conditions_step_id` ON `automation_conditions(step_id)`

**Rationale:**
- Normalized conditions (allows multiple conditions per step)
- Supports variable thresholds via `threshold_min`/`threshold_max` bounds
- Type-safe operators
- Item name for inventory-specific conditions

### 2.2 Instruction Types

**Core Instructions:**
- `harvest` - Harvest from specific NPC
- `auto_harvest` - Auto-harvest from multiple NPCs (pseudo-instruction, integrates with existing system)
- `attune` - Attune with vitalis min/max bounds
- `collect` - Collect items from ground
- `store` - Store items to warehouse
- `deliver` - Deliver items to factory
- `wait` - Wait for specified duration
- `move` - Move in direction (for custom loops)

**Loop Instructions:**
- `loop` - Loop back to beginning of program
- `loop_custom` - Loop back to specific step (custom loop)

**Factory Instructions:**
- `factory_insert_item` - Insert item into factory slot
- `factory_insert_rune` - Insert rune into factory slot
- `factory_start` - Start factory machine
- `factory_repeat` - Repeat factory production N times
- `factory_store_output` - Store factory output to warehouse

### 2.3 Example Data Structure

**Complex Program Example:**
```json
{
  "id": 1,
  "player_id": 42,
  "name": "Custom Loop 1",
  "is_active": true,
  "execution_state": {
    "currentStepIndex": 3,
    "executionState": "running",
    "lastExecutionTime": 1234567890,
    "loopCount": 0,
    "currentLoopId": 1,
    "loopIterationCount": { "1": 2 },
    "harvestState": {
      "isHarvesting": false,
      "targetNPCs": ["Pulsewood Tree", "Resin Blob"],
      "collectedItems": { "Pulse Resin": 25 }
    }
  }
}
```

**Steps for Complex Example:**
```json
[
  {
    "step_order": 1,
    "instruction_type": "loop_custom",
    "instruction_config": {
      "loopName": "Main Harvest Loop",
      "targetStep": 2  // Loop back to step 2
    },
    "loop_max_iterations": null,  // Infinite loop
    "conditions": []
  },
  {
    "step_order": 2,
    "instruction_type": "auto_harvest",
    "instruction_config": {
      "npcNames": ["Pulsewood Tree", "Resin Blob"],
      "targetItems": ["Pulse Resin"]
    },
    "conditions": []
  },
  {
    "step_order": 3,
    "instruction_type": "collect",
    "instruction_config": {
      "itemName": "Pulse Resin"
    },
    "conditions": [
      {
        "type": "if",
        "target": "inventory",
        "itemName": "Pulse Resin",
        "operator": "<",
        "threshold": 50
      }
    ]
  },
  {
    "step_order": 4,
    "instruction_type": "store",
    "instruction_config": {
      "itemName": "Pulse Resin",
      "quantity": 50,
      "warehouseRoomId": 123
    },
    "conditions": [
      {
        "type": "if",
        "target": "inventory",
        "itemName": "Pulse Resin",
        "operator": ">",
        "threshold": 50
      }
    ]
  },
  {
    "step_order": 5,
    "instruction_type": "move",
    "instruction_config": {
      "direction": "N",
      "targetRoomId": 456  // Factory room
    },
    "conditions": []
  },
  {
    "step_order": 6,
    "instruction_type": "deliver",
    "instruction_config": {
      "itemName": "Pulse Resin",
      "quantity": 20
    },
    "conditions": []
  },
  {
    "step_order": 7,
    "instruction_type": "factory_insert_item",
    "instruction_config": {
      "slotIndex": 0,
      "itemName": "Pulse Resin",
      "quantity": 5
    },
    "conditions": []
  },
  {
    "step_order": 8,
    "instruction_type": "factory_insert_rune",
    "instruction_config": {
      "slotIndex": 0,
      "runeType": "PRODUCTION"
    },
    "conditions": []
  },
  {
    "step_order": 9,
    "instruction_type": "factory_insert_rune",
    "instruction_config": {
      "slotIndex": 1,
      "runeType": "EFFICIENCY"
    },
    "conditions": []
  },
  {
    "step_order": 10,
    "instruction_type": "factory_start",
    "instruction_config": {},
    "conditions": []
  },
  {
    "step_order": 11,
    "instruction_type": "factory_repeat",
    "instruction_config": {
      "repeatCount": 3
    },
    "conditions": []
  },
  {
    "step_order": 12,
    "instruction_type": "factory_store_output",
    "instruction_config": {
      "itemName": "Pulse Crystal",
      "quantity": 4,
      "warehouseRoomId": 123
    },
    "conditions": []
  },
  {
    "step_order": 13,
    "instruction_type": "loop",
    "instruction_config": {
      "targetStep": 1  // Restart loop
    },
    "conditions": []
  }
]
```

---

## 3. Variability & Threshold Logic

### 3.1 Vitalis-Based Attunement

**Critical Change:** Attunement instructions use **vitalis min/max**, not attune level.

**Attune Instruction Config:**
```json
{
  "instruction_type": "attune",
  "instruction_config": {
    "vitalis_min": 10,  // Attune until vitalis >= min
    "vitalis_max": 50   // Stop attuning when vitalis >= max
  },
  "conditions": [
    {
      "type": "until",
      "target": "vitalis",
      "operator": ">=",
      "threshold": 50,
      "threshold_min": 10,  // Configurable min bound
      "threshold_max": 50   // Configurable max bound
    }
  ]
}
```

**Execution Logic:**
- Check current vitalis
- If vitalis < `vitalis_min` → Execute attune
- If vitalis >= `vitalis_max` → Stop attuning, move to next step
- If vitalis between min/max → Continue attuning until max reached

### 3.2 Variable Threshold System

**Design:** Support configurable min/max bounds for thresholds

**Example Use Cases:**
- Attune until vitalis >= X (where X ∈ [10–50], player-configurable)
- Harvest until Y items (where Y ∈ [1–100])
- Pause if Vitalis < Z (where Z ∈ [0–100])

**Threshold Fields:**
- `threshold_value` - The target value
- `threshold_min` - Minimum allowed value (for validation)
- `threshold_max` - Maximum allowed value (for validation)

### 3.3 Validation Layer

**Location:** `services/automationEngine.js` (validation functions)

**Validation Rules:**
1. **Bounds Checking**
   - Min must be <= Max
   - Values must be within game limits (e.g., Vitalis 0-100)
   - Integer values only (no decimals)
   - Vitalis thresholds must be 0-100

2. **Context Validation**
   - Item names must exist in `items` table
   - NPC names must exist in current room
   - Room IDs must exist
   - Factory slots must be valid (0-2 for items, 0-1 for runes)

3. **State Validation**
   - Program must be in valid state to start
   - Steps must be in valid sequence
   - Conditions must be evaluable
   - Loop targets must be valid step numbers

**Validation Functions:**
```javascript
async function validateProgram(db, programId) {
  // Check all steps are valid
  // Check all conditions are evaluable
  // Check thresholds are within bounds
  // Check loop targets are valid
  // Return { valid: boolean, errors: string[] }
}

async function validateThreshold(threshold, minBound, maxBound) {
  // Ensure threshold is within bounds
  // Return validation result
}

async function validateAttuneConfig(config) {
  // Ensure vitalis_min <= vitalis_max
  // Ensure both are 0-100
  // Return validation result
}
```

### 3.4 Invalid State Prevention

**Guardrails:**
- Engine refuses to start invalid programs
- Engine stops if state becomes invalid during execution
- Widget prevents saving invalid programs
- Database constraints prevent invalid data

**Error Handling:**
- Invalid programs → `executionState: 'stopped'`, `pauseReason: 'invalid_program'`
- Invalid thresholds → Validation error, program not saved
- Invalid conditions → Step skipped, warning logged
- Invalid loop targets → Program not saved, error shown

---

## 4. Instructions Widget Design

### 4.1 Widget Specification

**Name:** `InstructionsWidget`

**Base Class:** `Widget` (render-based, panel widget)

**File Location:** `public/js/widgets/InstructionsWidget.js`

**Registry Entry:**
```javascript
{
    id: 'instructions',
    name: 'Instructions',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z', // Info icon SVG
    slot: 'fullwidth', // Full-width widget (spans both columns)
    requiresGod: false,
    requiresWarehouse: false,
    requiresFactory: false,
    autoManaged: false,
    defaultActive: false,
    order: 110
}
```

**Widget Theme:** Standard theme (green border, matches existing widgets)

**CSS Class:** `widget-fullwidth` (applied automatically for fullwidth slot)

### 4.2 Widget Structure

**Header:** Icon + "INSTRUCTIONS" text (icon-first layout per canon)

**Content Sections:**
1. **Program List** - Display all player programs (left column)
2. **Program Editor** - Create/edit program steps (right column)
3. **Runtime Status** - Show active program execution state (bottom, full width)

### 4.3 UI Flow (Proposed)

**Main View (Two-Column Layout):**
- **Left Column:** Program list (name, active status, edit button, delete button)
- **Right Column:** Program editor (when program selected)
- **Bottom:** Runtime status (current step, execution state, loop count)

**Program Editor:**
- Program name/description fields
- Step list (ordered, draggable for reordering)
- Add step button
- Step editor panel
- Save/Cancel buttons

**Step Editor:**
- Instruction type dropdown (all instruction types)
- Instruction-specific config panel:
  - **Harvest:** NPC selector, target item selector
  - **Auto-Harvest:** Multi-NPC selector, target items selector
  - **Attune:** Vitalis min/max inputs (NOT attune level)
  - **Collect:** Item selector, quantity
  - **Store:** Item selector, quantity, warehouse room selector
  - **Deliver:** Item selector, quantity
  - **Move:** Direction selector, target room selector
  - **Factory:** Slot selector, item/rune selector
  - **Loop:** Target step selector, max iterations
- Condition builder (UNTIL/WHILE/IF, target, operator, threshold)
- Variable threshold inputs (min/max bounds)

### 4.4 Token-Based Clause Selection

**Design:** No free-text scripting - all clauses via UI controls

**Clause Types:**
- **UNTIL** - Continue until condition met
- **WHILE** - Continue while condition true
- **IF** - Conditional step execution (skip if false)

**Condition Targets (Dropdown):**
- Inventory (item quantity)
- Vitalis (current vitalis level)
- Room Type
- NPC Present
- Factory State
- Custom variable

**Operators (Dropdown):**
- `>=`, `<=`, `==`, `!=`, `>`, `<`

**Threshold Input:**
- Number input with min/max validation
- Variable selector (if using variable thresholds)
- For vitalis: Min/Max bounds (0-100)

### 4.5 Widget CSS

**Sizing:** Full-width widget (spans both columns in 2-column grid)

**CSS Classes:** Use standardized classes from `widget-shared.css`:
- `.widget-section` for sections
- `.widget-btn`, `.widget-btn-primary` for buttons
- `.widget-input`, `.widget-select` for inputs
- `.widget-list`, `.widget-list-item` for program list
- `.widget-fullwidth` (applied automatically)

**Layout:**
- Two-column layout for program list + editor
- Full-width status bar at bottom
- Responsive to widget container size

**No custom theme needed** - use standard green theme

### 4.6 Message Handling

**Widget Receives:**
- `automation:programs` - List of player programs
- `automation:programUpdated` - Program saved/updated
- `automation:executionState` - Current execution state
- `automation:stepComplete` - Step execution complete
- `automation:programStopped` - Program stopped/paused
- `automation:loopIteration` - Loop iteration update

**Widget Sends:**
- `createAutomationProgram` - Create new program
- `updateAutomationProgram` - Update program
- `deleteAutomationProgram` - Delete program
- `startAutomationProgram` - Start execution
- `stopAutomationProgram` - Stop execution
- `pauseAutomationProgram` - Pause execution
- `reorderSteps` - Reorder steps in program

---

## 5. Integration & Safety Boundaries

### 5.1 What Automation Engine CAN Do

**Read Operations:**
- Read player state (inventory, stats, room, vitalis)
- Read NPC state (harvestable, cooldown)
- Read room state (items, NPCs, room type)
- Read program state from database
- Read factory state (slots, recipes, status)

**Action Requests:**
- Request harvest via `handlers/game.js::harvest()`
- Request auto-harvest via existing auto-harvest system
- Request attune via `handlers/game.js::attune()`
- Request movement via `handlers/game.js::move()`
- Request item operations via existing handlers
- Request factory operations via existing handlers

**State Updates:**
- Update program execution state (JSONB in database)
- Send status messages to widget
- Track execution progress
- Track loop iterations

### 5.2 What Automation Engine CANNOT Do

**Direct Mutations:**
- Cannot directly modify player inventory
- Cannot directly modify NPC state
- Cannot directly modify room state
- Cannot directly modify factory state
- Cannot bypass command handlers

**Bypass Rules:**
- Must use command handlers for all actions
- Must respect existing game rules (cooldowns, requirements)
- Cannot execute faster than configured timers
- Cannot bypass validation
- Must respect factory cooldowns and requirements

### 5.3 Safety Guardrails

**Execution Limits:**
- Max steps per program: 100 (configurable)
- Max loops per program: 1000 (configurable)
- Max loop iterations per custom loop: 10000 (configurable)
- Max execution time: 1 hour (configurable)
- Max programs per player: 10 (configurable)

**Interruption Rules:**
- Manual movement → Stop all programs
- Player disconnect → Stop all programs
- Invalid state → Stop program
- Resource depletion → Pause program (if configured)
- Factory errors → Stop program, notify player

**Error Handling:**
- Step failures → Log error, stop program
- Invalid conditions → Skip step, continue
- Database errors → Stop program, notify player
- Loop target invalid → Stop program, error message

### 5.4 Integration with Existing Systems

**NPC Cycle Engine:**
- Automation Engine requests harvests
- NPC Cycle Engine processes harvests
- No direct interaction - via command handlers

**Auto-Harvest System (Existing):**
- `auto_harvest` instruction integrates with existing auto-harvest
- Uses existing auto-harvest logic and timing
- Respects existing auto-harvest settings
- Pauses program during auto-harvest execution

**Automation Widget (Existing):**
- Instructions Widget is separate
- Automation Widget handles auto-navigation/loops
- Instructions Widget handles declarative programs
- Both can coexist (different use cases)

**Factory System:**
- Factory instructions use existing factory handlers
- Respects factory cooldowns and requirements
- Validates factory slots and recipes
- Handles factory errors gracefully

**Command System:**
- Automation Engine sends commands via WebSocket
- Commands go through normal command handlers
- Respects all existing command validation

---

## 6. Complex Execution Flow Example

### 6.1 Program Example (User's Complex Loop)

**Player Creates:**
```
Program: "Custom Loop 1"

Step 1: Loop Custom "Main Harvest Loop" (target: Step 2)
Step 2: Auto-Harvest Pulsewood Trees and Resin Blobs
Step 3: Collect Pulse Resin IF inventory < 50
Step 4: Store 50 Pulse Resin in Warehouse (Room 123) IF inventory > 50
Step 5: Move to Factory Room (Room 456)
Step 6: Deliver 20 Pulse Resin to Factory
Step 7: Insert 5 Pulse Resin in Factory Slot 0
Step 8: Insert Production Rune in Factory Slot 0
Step 9: Insert Efficiency Rune in Factory Slot 1
Step 10: Start Factory Machine
Step 11: Repeat Factory Production 3 more times
Step 12: Store 4 Pulse Crystals in Warehouse (Room 123)
Step 13: Restart Loop (back to Step 1)
```

### 6.2 Execution Flow

```
1. Player starts program
2. Engine loads program from database
3. Engine initializes execution state
4. Engine enters tick loop

Tick 1 (Step 1 - Loop Custom):
  - Evaluate: Loop to Step 2
  - Set currentLoopId = 1
  - Set loopIterationCount[1] = 0
  - Move to Step 2

Tick 2 (Step 2 - Auto-Harvest):
  - Execute: Start auto-harvest for Pulsewood Trees and Resin Blobs
  - Pause program execution
  - Wait for auto-harvest to complete
  - Resume program execution
  - Move to Step 3

Tick 3 (Step 3 - Collect IF):
  - Evaluate condition: Pulse Resin < 50? Yes (e.g., 25)
  - Execute: Collect Pulse Resin from ground
  - Check inventory: Pulse Resin = 30
  - Move to Step 4

Tick 4 (Step 4 - Store IF):
  - Evaluate condition: Pulse Resin > 50? No (30)
  - Skip step (condition false)
  - Move to Step 5

Tick 5 (Step 5 - Move):
  - Execute: Move to Factory Room (Room 456)
  - Wait for movement completion
  - Move to Step 6

Tick 6 (Step 6 - Deliver):
  - Execute: Deliver 20 Pulse Resin to Factory
  - Wait for delivery completion
  - Move to Step 7

Tick 7-9 (Steps 7-9 - Factory Setup):
  - Execute: Insert items/runes into factory slots
  - Wait for each insertion
  - Move to next step

Tick 10 (Step 10 - Start Factory):
  - Execute: Start factory machine
  - Wait for factory to start
  - Move to Step 11

Tick 11 (Step 11 - Repeat Factory):
  - Execute: Repeat factory production 3 times
  - Wait for all productions to complete
  - Move to Step 12

Tick 12 (Step 12 - Store Output):
  - Execute: Store 4 Pulse Crystals in Warehouse
  - Wait for storage completion
  - Move to Step 13

Tick 13 (Step 13 - Restart Loop):
  - Execute: Loop back to Step 1
  - Increment loopIterationCount[1]
  - Reset to Step 1
  - Continue execution

... (loop repeats)
```

---

## 7. Auto-Harvest Integration

### 7.1 Auto-Harvest Instruction

**Instruction Type:** `auto_harvest`

**Config:**
```json
{
  "instruction_type": "auto_harvest",
  "instruction_config": {
    "npcNames": ["Pulsewood Tree", "Resin Blob"],
    "targetItems": ["Pulse Resin"],
    "harvestAll": true  // Harvest from all matching NPCs
  }
}
```

**Execution:**
- Integrates with existing auto-harvest system
- Uses player's auto-harvest settings
- Pauses program execution during harvest
- Resumes when harvest completes
- Tracks collected items in execution state

### 7.2 Custom Loop Integration

**Instruction Type:** `loop_custom`

**Config:**
```json
{
  "instruction_type": "loop_custom",
  "instruction_config": {
    "loopName": "Main Harvest Loop",
    "targetStep": 2
  },
  "loop_max_iterations": null  // null = infinite loop
}
```

**Execution:**
- Tracks loop ID and iteration count
- Validates target step exists
- Enforces max iterations if set
- Updates execution state with loop progress

---

## 8. Factory Instruction Details

### 8.1 Factory Instructions

**Insert Item:**
```json
{
  "instruction_type": "factory_insert_item",
  "instruction_config": {
    "slotIndex": 0,
    "itemName": "Pulse Resin",
    "quantity": 5
  }
}
```

**Insert Rune:**
```json
{
  "instruction_type": "factory_insert_rune",
  "instruction_config": {
    "slotIndex": 0,
    "runeType": "PRODUCTION"  // or "SPEED", "EFFICIENCY"
  }
}
```

**Start Machine:**
```json
{
  "instruction_type": "factory_start",
  "instruction_config": {}
}
```

**Repeat Production:**
```json
{
  "instruction_type": "factory_repeat",
  "instruction_config": {
    "repeatCount": 3
  }
}
```

**Store Output:**
```json
{
  "instruction_type": "factory_store_output",
  "instruction_config": {
    "itemName": "Pulse Crystal",
    "quantity": 4,
    "warehouseRoomId": 123
  }
}
```

### 8.2 Factory Execution Flow

1. Validate factory room
2. Validate factory slots available
3. Insert items/runes in sequence
4. Start factory machine
5. Wait for production completion
6. Repeat if specified
7. Store outputs to warehouse

---

## 9. Proposed Canon Updates (DO NOT APPLY)

### 9.1 Database Schema Canon (`docs/20-04-database-schema-canonical-spec.md`)

**Add Section:**
```
### `automation_programs`
**Purpose:** Player-authored automation programs
**Fields:**
- `id` SERIAL PRIMARY KEY
- `player_id` INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
- `name` TEXT NOT NULL
- `description` TEXT
- `is_active` BOOLEAN NOT NULL DEFAULT FALSE
- `execution_state` JSONB DEFAULT '{}'
- `created_at` TIMESTAMP NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMP NOT NULL DEFAULT NOW()

### `automation_steps`
**Purpose:** Ordered steps within automation programs
**Fields:**
- `id` SERIAL PRIMARY KEY
- `program_id` INTEGER NOT NULL REFERENCES automation_programs(id) ON DELETE CASCADE
- `step_order` INTEGER NOT NULL
- `instruction_type` TEXT NOT NULL
- `instruction_config` JSONB NOT NULL DEFAULT '{}'
- `conditions` JSONB DEFAULT '[]'
- `loop_target_step` INTEGER
- `loop_max_iterations` INTEGER
- `created_at` TIMESTAMP NOT NULL DEFAULT NOW()

### `automation_conditions`
**Purpose:** Condition definitions for automation steps
**Fields:**
- `id` SERIAL PRIMARY KEY
- `step_id` INTEGER NOT NULL REFERENCES automation_steps(id) ON DELETE CASCADE
- `condition_type` TEXT NOT NULL
- `condition_target` TEXT NOT NULL
- `operator` TEXT NOT NULL
- `threshold_value` INTEGER NOT NULL
- `threshold_min` INTEGER
- `threshold_max` INTEGER
- `item_name` TEXT
- `variable_name` TEXT
```

### 9.2 Widget Architecture Canon (`docs/20-11-widget-architecture-canonical.md`)

**Add Section:**
```
### Widget Sizing Classes
- `slot: 'standard'` - Standard widget (1 grid cell, half-width)
- `slot: 'fullwidth'` - Full-width widget (spans 2 columns)
- `slot: 'special'` - Auto-managed widgets

**CSS Classes:**
- `.widget-fullwidth` - Applied automatically for fullwidth slot
- Standard widgets use default grid cell sizing (no special class needed)
```

**Add to Widget Examples:**
```
### Instructions Widget Pattern
- Render-based widget
- Fullwidth slot (spans both columns)
- Token-based clause selection
- Program list and editor (two-column layout)
- Runtime status display
```

### 9.3 Automation Engine Canon (`docs/10-16-automation-engine.md`)

**Add Section:**
```
# 9. Declarative Automation Programs (NEW)

Players can create automation programs using the Instructions Widget.

Programs consist of:
- Ordered steps (Harvest, Auto-Harvest, Attune, Deliver, Wait, Loop, Collect, Store, Factory operations)
- Conditions (UNTIL/WHILE/IF clauses)
- Variable thresholds (configurable min/max bounds for vitalis)
- Custom loops (loop back to specific steps)

Attunement:
- Uses vitalis min/max bounds (NOT attune level)
- Attunes until vitalis >= min, stops when vitalis >= max

Auto-Harvest Integration:
- `auto_harvest` instruction integrates with existing auto-harvest system
- Pauses program execution during harvest
- Resumes when harvest completes

Execution:
- Tick-based engine (separate from auto-navigation/auto-loop)
- Respects player timing settings
- Interruptible by manual movement
- Safe guardrails enforced
```

---

## 10. Implementation Phases (Suggested)

### Phase 1: Core Engine
- Database tables and migrations
- Basic engine structure (tick loop)
- Simple instruction types (Harvest, Attune, Wait)
- Basic condition evaluation
- Vitalis-based attunement

### Phase 2: Widget & UI
- Instructions Widget implementation (full-width)
- Program list and editor (two-column layout)
- Step builder UI
- Token-based clause selection
- Vitalis min/max inputs for attunement

### Phase 3: Auto-Harvest & Loops
- Auto-harvest instruction integration
- Custom loop instructions
- Loop iteration tracking
- Movement instructions

### Phase 4: Factory & Advanced Features
- Factory instructions (insert, start, repeat, store)
- Collect/Store/Deliver instructions
- Complex condition evaluation
- Variable thresholds

### Phase 5: Polish & Safety
- Comprehensive validation
- Error handling
- Performance optimization
- Documentation

---

## 11. References

**Canon Documents:**
- `docs/10-16-automation-engine.md` - Existing automation patterns
- `docs/20-11-widget-architecture-canonical.md` - Widget architecture
- `docs/20-04-database-schema-canonical-spec.md` - Database schema patterns
- `docs/10-04-commands.md` - Command system patterns

**Code References:**
- `services/npcCycleEngine.js` - Engine pattern reference
- `public/js/widgets/Widget.js` - Widget base class
- `public/js/widgets/widget_registry.js` - Widget registry pattern
- `public/css/widget-shared.css` - Widget CSS standards
- `handlers/game.js` - Command handlers for actions

---

**END OF PLANNING DOCUMENT**






