# 16 — Automation Engine (Canonical Specification)

The Automation Engine governs all automated player movement and automated in-room actions.  
This includes auto-navigation (point-to-point travel) and auto-loop execution (repeating paths with automated harvesting behavior).

This system operates independently of the NPC Harvest Engine, the Factory Engine, and manual player commands, but may pause or stop based on game state changes.

---

# 1. Core Purpose

The Automation Engine is responsible for:

- Executing movement steps in sequence (navigation and loops)
- Pausing/resuming based on harvesting requirements
- Integrating with the NPC Harvest Engine for auto-harvest
- Managing timing intervals between steps
- Tracking execution state for the Automation Widget
- Following canonical stop/pause rules
- Providing a foundation for future automated actions:
  - auto-collect
  - auto-store (warehouse)
  - auto-deliver (factory)
  - auto-craft loops

Automation must always respect:
- Player state
- Room constraints
- Movement validity
- Harvest engine pausing rules
- Manual movement interruption
- Server-authoritative timing

---

# 2. High-Level System Structure

Automation consists of two primary modes:

```
Auto-Navigation (one-time path)
Auto-Loop Execution (repeatable loop with auto-harvest)
```

Both modes share:

- Execution timers  
- Step-by-step movement  
- Failure handling  
- Manual-interrupt handling  
- Standardized state machine  

Automation is managed server-side in the player session’s `automationState`.

---

# 3. Auto-Navigation (One-Time Path Execution)

Auto-navigation moves a player from their current room to a selected destination room using a generated path.

## 3.1 How Auto-Navigation Begins
- Initiated via Automation Widget (UI-only; no text command)
- Player selects:
  - Map
  - Destination room
- Server generates path using A* algorithm
- User presses **GO**

Server stores:
```
player.automationState = {
  mode: 'autoNavigation',
  path: [directions],
  currentStep: 0,
  isActive: true
}
```

---

## 3.2 Step Execution Flow

Each step:
1. Wait `player.auto_navigation_time_ms` (default 1000ms)
2. Execute movement command (N/E/S/etc)
3. If movement succeeds → increment step
4. If movement fails → stop automation

Server schedule:
```
setTimeout(executeNextAutoNavigationStep, auto_navigation_time_ms)
```

---

## 3.3 Stopping Conditions

Auto-navigation stops when:

- Player completes final step  
- A movement attempt fails  
- Path becomes invalid  
- Player manually moves  
- Player disconnects  
- Player teleports/jumps  

State cleared via:
```
clearAutoNavigation()
```

---

## 3.4 Vitalis Interaction

Auto-navigation **does not** require or consume Vitalis.  
It continues regardless of Vitalis state.

Vitalis only affects NPC harvesting.

---

# 4. Auto-Loop Execution (Repeatable Path With Auto-Harvest)

Auto-loop executes a saved looped path from the database (`paths.path_type = 'loop'`).

Loops support repeated traversal and optional auto-harvesting.

---

## 4.1 How Loops Begin

Initiated via Automation Widget:
- Select saved loop
- Press **Start**

Server loads:
```
player.automationState = {
  mode: 'loop',
  steps: [...],
  currentStep: 0,
  loopCount: 0,
  isLooping: true,
  isPaused: false,
  isActive: true
}
```

Loop timing uses:
```
player.auto_loop_time_ms
```
Default: 2000ms.

---

## 4.2 Loop Behavior

Each step:
1. Wait loop delay
2. Attempt movement
3. After entering room:
   - Check for eligible NPCs
   - If auto-harvest enabled → pause loop
   - Perform automated harvesting
   - Resume loop when room is fully harvested
4. Continue to next step

---

## 4.3 Harvest Integration (Canonical Pattern)

Auto-loop is the **only** automation mode that integrates with NPC harvesting.

Sequence:

```
Enter room →
Check rhythm NPCs →
If NPC is harvestable AND autoHarvest = true →
Pause loop →
Run NPC Harvest Engine →
If Vitalis > 0:
    Continue harvesting next eligible NPCs
Else:
    Pause loop permanently (vitalis_depleted)
After all harvesting complete:
    Resume loop from next step
```

---

## 4.4 Pausing Rules

### Loop pauses when:
- Harvest begins
- Vitalis reaches 0
- NPC requires missing items (skip NPC, but continue loop)
- Harvest engine explicitly reports pause state
- Player opens certain widgets (optional future rules)

### Loop does **not** pause when:
- Player chats (talk/resonate/telepath)
- NPC broadcasts appear
- Other players enter/leave

---

## 4.5 Stopping Rules

Loop stops when:

- Player manually moves
- Movement direction fails
- Player disconnects
- Player teleports/jumps
- Path data becomes invalid
- Error during step execution

Server message examples:
```
'Path execution stopped by manual movement.'
'Path execution stopped: invalid step data.'
'Path execution stopped due to an error: <reason>'
```

---

# 5. Automation Widget Integration

Automation Widget displays:

- Current automation mode  
- Step count  
- Loop iteration count  
- Pause reasons  
- Whether auto-harvest is active  
- Total rooms visited  
- Execution timers  

Widget receives server events for:

```
automation_state_update
loop_paused
loop_resumed
automation_stopped
loop_harvest_begin
loop_harvest_complete
```

---

# 6. Future Automation Expansion (Canonical Stubs)

The Automation Engine will eventually support:

## 6.1 Auto-Collect
Automatically pick up ground items that match:
- Player preferences  
- Auto-loot filter rules  
- Encumbrance constraints  

Trigger:
```
After entering a room (if auto_collect enabled)
```

## 6.2 Auto-Store (Warehouse)
Automatically store items when:
- Player enters a warehouse room
- Warehouse deed exists
- Storage capacity available

Action:
```
store <item> <qty>
```

## 6.3 Auto-Deliver (Factory)
Automatically:
- Deliver ingredients to factory
- Insert runes if missing
- Execute craft cycles
- Retrieve outputs

Integrated with:
- Factory widget  
- Factory crafting engine  

## 6.4 Auto-Crafting Loops
Higher-tier automation enabling:

```
Collect → Store → Deliver → Craft → Return Output → Repeat
```

This becomes the backbone of macro-factory gameplay.

---

# 7. Standardized Automation State Model

Across all automation modes, state follows:

```
IDLE
 → ACTIVE
 → PAUSED (optional)
 → STOPPED (terminal)
```

Automation is always reset on:

- Disconnection  
- Manual movement  
- Fatal path errors  

Automation must never continue beyond an invalid state.

---

# 8. Conflict Prevention (Cursor Rules)

Cursor must obey:

1. Never merge auto-navigation and auto-loop internal logic  
2. Never integrate harvesting into auto-navigation  
3. Always pause loop on harvest start  
4. Always stop automation on manual movement  
5. Never modify Harvest Engine logic from within Automation Engine  
6. Never change cooldown rules  
7. Never automatically resume after Vitalis depletion  
8. Always validate path steps before executing  
9. Always use server-authoritative movement  
10. Never execute automation faster than configured timers  

---

# End of 16-automation-engine.md
This document defines the canonical behavior of all automated player actions and how automation interacts with movement, harvesting, error states, and future expansion.
