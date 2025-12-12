# 10-13 — Widget System (Canonical Specification)

Widgets are modular UI components rendered client-side (Alpine.js components) and synchronized with state and events from the server.  
This document defines all widget types, their conditions, data models, UX rules, and how they integrate with the rest of the game architecture.

Widgets fall into four categories:

1. **Standard Widgets** — Always available, always active  
2. **Conditional Widgets** — Appear only in certain rooms or contexts  
3. **God Mode Widgets** — Only visible to god-mode players  
4. **Experimental / Optional Widgets** — Non-core features

This document is authoritative: all future widgets must follow pattern, naming, visibility rules, and state management conventions defined here.

---

# 🟦 1. Widget System Principles

### 1.1 Widgets are Independent Modules
Each widget extends the `Widget` base class (which extends `Component`) and implements:
- `render()`: Creates and returns its own DOM structure
- `onAttach()`: Sets up event listeners after DOM attachment
- `onMessage(msg)`: Handles backend messages routed by WidgetManager
- `onDetach()`: Optional cleanup before removal

Widgets are managed by `WidgetManager` which handles:
- Mounting/unmounting based on visibility rules
- Message routing from backend to widgets
- Lifecycle management

Widgets must **never** assume the existence of another widget unless explicitly documented.

**Reference:** `public/js/widgets/Widget.js:11-81`, `public/js/core/WidgetManager.js:431-449`

---

### 1.2 Widget Visibility Model

Widgets may be:
- **Permanent** — always visible on the widget bar  
- **Conditional** — only visible when game conditions are met  
- **Hidden** — fully removed from UI when conditions are false  

Visibility is server-authoritative when applicable (factory, NPC harvest).

---

### 1.3 Standardized Widget Behavior
All widgets follow these universal behaviors:

- Collapsible  
- Removable from screen  
- Restorable from the widget tray  
- Persist last active/hidden state per player session  
- Communicate with server via WebSocket  
- Render instantly upon receiving state updates  

---

### 1.4 Widget Slot System
Widgets appear in one of two zones:

- **Standard bar** (fixed set of icons)  
- **Conditional slot** (NPC, factory, etc.)  

Conditional widgets **override the conditional slot**; only one conditional widget is shown at a time.

---

---

# 🟩 2. Standard Widgets (Always Available)

These widgets are available to all players from the moment they enter the world.

---

## **2.1 Player Stats Widget**

Displays:

- Vitalis (current/max)
- Pulse Echoes  
- Encumbrance  
- Player attributes (Ingenuity, Resonance, Acumen, Fortitude, etc.)  
- Unassigned stat points  
- Buffs / debuffs (if implemented)

Behavior:
- Always visible  
- Updates whenever player stats change  
- Emits no server commands except stat allocation  

State sourced from:
- `playerUpdate` server messages  

---

## **2.2 Compass Widget**

Displays:

- Current map name  
- Coordinates within map  
- Graphical representation of obvious exits (directions lit when available)  
- Clickable navigation (north, east, west, south, diagonals, up/down)

Behavior:
- Movement commands sent via WebSocket  
- Reflects dynamically updated room exit data  

Sources:
- `roomData` server messages  

---

## **2.3 Map Widget**

Provides:
- Visual map position  
- Path recording (manual)  
- Loop recording (manual)  
- Path/loop saving to player-local data  
- Path selection and playback for automation widget

Behavior:
- Client-side state only  
- No server persistence  
- Emits:
  - `recordStart`
  - `recordStop`
  - `savePath`
  - `saveLoop`

Server only involved during automation execution (Widget 2.5).

---

## **2.4 Comms Widget**

A running conversation log for:

- **Room talk** (talk, "." shorthand)  
- **NPC speech** (Lorekeepers & NPC harvest messages)  
- **World broadcasts** (resonate)  
- **Private messages** (telepath)  

Behavior:
- Maintains scrollback history  
- Supports filtering (if implemented later)  
- Supports NPC highlighting  
- Auto-scrolls unless user is reading prior messages  

Sources:
- `talk`
- `roomMessage`
- `npcMessage`
- `resonate`
- `telepath`

---

## **2.5 Automation Widget**

Controls for:

- Auto-navigate to a specific room  
- Auto-loop playback  
- Auto-harvest toggle (only active when near harvestable NPCs)  
- Auto-path interruption when player moves manually  

Behavior:
- Client-side UI  
- Server-side execution  
- Server enforces:
  - Path validity  
  - Movement pacing  
  - NPC interactions during automation  
  - Harvest toggle only during autopilot  

Sources:
- `automationStatus`
- `autoHarvestPaused`
- `pathComplete`

---

# 🟨 3. Conditional Widgets (Context-Driven)

Widgets that only appear under certain game conditions.

---

## **3.1 NPC Harvest Widget**

Appears only when:

- Player is in a room with harvestable NPC  
- Player has targeted NPC for harvesting  
- Harvest cycle is active or NPC is in cooldown  

Displays:

- Target NPC name  
- Harvest cycle timer  
- Cooldown timer  
- Buff/debuff indicators  
- Harvest countdown animation  
- Button(s) for manual harvest ("Harvest", "Stop")  
- Vitalis drain indicators  

Populates using:

- `harvestBegin`
- `harvestMiss`
- `harvestHit`
- `harvestCooldown`
- `harvestEnd`
- `vitalisDrain`

When harvest stops → widget disappears.

---

## **3.2 Factory Widget**

Appears only when:

- Room type is `factory`  
- Player is physically inside the factory  

Provides:

- Slot UI (ingredients, production rune, speed rune, efficiency rune)  
- Craft time countdown  
- Craft success/crit indicators  
- Output summary  
- State persistence per connection  

Sources:
- `factoryWidgetState`
- `factoryCraftStarted`
- `factoryCraftComplete`
- `factoryCraftFizzle`

---

## **3.3 Warehouse Widget (Conditional Widget)**

The Warehouse Widget provides players with access to long-term storage.  
It is a **conditional widget**: it only appears when both of the following are true:

1. The player **possesses a Warehouse Deed** (inventory flag)  
2. The player **opens the widget manually** from the widget bar  

The widget is **never auto-shown** based on room type.

---

### Core Purpose  
The Warehouse Widget allows players to:

- View warehouse inventory  
- Store items  
- Withdraw items  
- Organize long-term storage separate from personal inventory  

It is intentionally **not** a crafting interface, not a room-bound widget, and not integrated into automation loops.

---

### Interaction Model

Players interact using the following canonical commands:

```
warehouse / wh            // Opens the widget (server sends warehouse state)
store <item> [qty]        // Stores item(s) into warehouse
store all <item>          // Stores all instances of item
withdraw <item> [qty]     // Withdraws item(s)
withdraw all <item>       // Withdraws entire stack
w <qty> <item>            // Shortcut for withdraw
```

All warehouse actions must originate through:

- Commands  
- Widget UI interactions (which internally call the same commands)

No widget-only logic exists — everything routes through server commands.

---

### Visibility Rules

- The Warehouse Widget icon is **hidden** unless the player has a Warehouse Deed.
- When visible, it may be opened anywhere (not room-gated).
- Warehouse contents are tied to **player ID**, not connection ID or room.

If a player **loses** their deed (consumed, sold, dropped, or removed), the widget immediately disappears from the widget bar.

---

### Warehouse State (Canonical Structure)

Warehouse state is persistent and stored in the database:

```
warehouse_items (
    player_id,
    item_name,
    quantity,
    created_at,
    updated_at
)
```

Widget loads this state on open:

```
server → client: warehouseState { items: [...] }
```

All changes must be reflected server-side and broadcast back to the widget.

---

### Functional Rules

- Items stored **do not** encumber the player.
- Items can be withdrawn until encumbrance threshold is reached.
- Stacks consolidate on both store and withdraw.
- Warehouse access is unlimited and global (not tied to a room).
- There is no cooldown or timer associated with warehouse actions.

---

### Error Handling

The widget must communicate standard errors:

- Not enough items in inventory → `store_failed`
- Not enough items in warehouse → `withdraw_failed`
- Encumbrance restriction → `encumbrance_limit_reached`
- Warehouse not accessible → `missing_warehouse_deed`

---

### Summary

The Warehouse Widget is:

- A **conditional** widget  
- A **player-owned system**, not a room system  
- A **command-driven interface** with a UI surface  
- Hidden unless the player possesses the required deed  
- Persistent, global, and purely inventory-focused  
- Architected to match all other minimalist, state-synced widgets



# 🟥 4. God Mode Widgets (Dev & Admin Only)

Visible only when:

`player.isGodMode === true`

---

## **4.1 God Mode Panel Widget**

Allows:

- Room editor  
- NPC editor  
- Player editor  
- Item editor  
- Crafting recipe editor  
- Map utilities  
- Formula editor  
- Engine debugging tools (timers, cycles, NPC states)

This widget must never be visible or accessible to normal players.

---

## **4.2 Ticket Widget (Cursor AI Integration)**

Two-way communication between:

- Player (god-mode dev)  
- Cursor AI agent

Used for:

- Bug submissions  
- Feature requests  
- Dev logs  
- In-game snippet extraction  
- Automated ticket creation  

Behaviors:

- Sends ticket JSON to backend  
- Displays Cursor responses  
- Maintains conversation per ticket  

Visible only in god mode.

---

# 🟪 5. Experimental Widgets (Optional)

## **5.1 ASCII Widget**

Loads ASCII art files and displays them in a dedicated panel.

Rules:

- Must not interfere with core widget bar  
- May be hidden behind "experimental" toggle  
- No gameplay impact  

This widget is non-core and may be deprecated or extended in future.

---

# 🟫 6. Widget Integration Rules (Critical Canon)

### 6.1 Only one conditional widget may appear at a time
Priority:
1. NPC Harvest  
2. Factory  
3. Lorekeeper (future)  
4. Any other context widget  

When contexts overlap, earlier priority wins.

---

### 6.2 Widgets must not block movement or core gameplay
Widgets may overlay but must not prevent inputs unless modal purposefully invoked.

---

### 6.3 Widget state must be ephemeral unless documented
State may persist:
- Across rooms (stats, comms)
- Within a room (factory crafting)
- Within a session (widget collapsed/expanded)
- But never across sessions unless explicitly implemented  

---

### 6.4 All widgets communicate via WebSocket messages
No widget modifies game state directly.  
All server-side state comes from:

- `game.js` routes  
- Engine controllers  
- Widget service layer  

---

# 🏁 End of 10-13-widget-system.md
This document defines all widget types, behaviors, visibility rules, and integration patterns.  
All widget development must strictly adhere to the specifications above.

