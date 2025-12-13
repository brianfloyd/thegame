# ✅ **WIDGET OPERATION - CANONICAL SPEC**

**Document Type:** Canonical Reference  
**Last Updated:** Based on codebase analysis  
**Purpose:** Complete specification of widget operation for gameplay, including features, methods, and requirements.

---

## 1. WIDGET SYSTEM OVERVIEW

### 1.1 Source of Truth
- **Widget Registry:** `public/js/widgets/widget_registry.js` (lines 22-155)
  - Defines all available widgets with configuration
  - Each widget has: `id`, `name`, `icon`, `slot`, `requiresGod`, `requiresWarehouse`, `requiresFactory`, `autoManaged`, `defaultActive`, `order`
- **Widget Manager:** `public/js/core/WidgetManager.js` (lines 36-508)
  - Manages widget lifecycle, message routing, and visibility
- **Base Classes:**
  - `Widget` class: `public/js/widgets/Widget.js` (lines 11-79) - Extends Component, provides render-based widgets
  - `Component` class: `public/js/core/Component.js` (lines 7-85) - Base class with MessageBus integration

### 1.2 Widget Types
**File:** `public/js/widgets/widget_registry.js` (lines 22-155)

1. **Standard Widgets** (`slot: 'standard'`):
   - `stats` - Player Stats (order: 10, defaultActive: true)
   - `compass` - Compass (order: 20, defaultActive: true)
   - `map` - Map (order: 30, defaultActive: true)
   - `comms` - Communication (order: 40, defaultActive: true)
   - `warehouse` - Warehouse (order: 50, requiresWarehouse: true)
   - `godmode` - God Mode (order: 60, requiresGod: true)
   - `runekeeper` - Rune Keeper (order: 80)

2. **Fullwidth Widgets** (`slot: 'fullwidth'`):
   - `automation` - Automation (order: 70)
   - `tickets` - Tickets (order: 90, requiresGod: true)

3. **Auto-Managed Widgets** (`autoManaged: true`):
   - `npc` - NPC Activity (order: 100, shows during harvest/cooldown)
   - `factory` - Factory Machine (order: 110, requiresFactory: true, shows in factory rooms)

---

## 2. WIDGET CONFIGURATION FIELDS

**File:** `public/js/widgets/widget_registry.js` (lines 8-21)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (matches `data-widget` attribute) |
| `name` | string | Yes | Display name shown in toggle bar tooltip |
| `icon` | string | Yes | SVG path data for icon (empty string uses first letter fallback) |
| `slot` | string | Yes | Layout type: `'standard'`, `'fullwidth'`, or `'special'` |
| `requiresGod` | boolean | No | Only visible to god mode players (default: false) |
| `requiresWarehouse` | boolean | No | Only visible when player has warehouse deed (default: false) |
| `requiresFactory` | boolean | No | Only visible in factory rooms (default: false) |
| `autoManaged` | boolean | No | Visibility controlled by game state, not user toggle (default: false) |
| `defaultActive` | boolean | No | Whether widget is active by default (default: false) |
| `order` | number | Yes | Display order in toggle bar (lower = earlier) |

---

## 3. WIDGET LIFECYCLE OPERATIONS

### 3.1 Initialization
**File:** `public/js/main.js` (lines 33-35)
```javascript
game.widgetManager = new WidgetManager(game, WIDGETS);
game.widgetManager.mountAll();
```

**File:** `public/js/core/WidgetManager.js` (lines 156-216)
- `mountAll()` creates widget-host container and toggle bar
- Instantiates all widgets from registry
- Calls `widget.init()` on each widget
- Sets default active widgets from `defaultActive` flag
- Updates toggle bar and visibility

### 3.2 Widget Creation
**File:** `public/js/core/WidgetManager.js` (lines 182-209)
- Widgets are instantiated with `new WidgetClass(game, widgetDef.id)` or `new WidgetClass(game)` (fallback)
- Each widget must implement `init()` method
- Widgets stored in `this.widgets` Map keyed by widget ID

### 3.3 Attachment/Detachment
**File:** `public/js/core/WidgetManager.js` (lines 372-437)

**Attach Process:**
1. Check if widget has `render()` method (Widget-based) or finds existing DOM (Component-based)
2. For Widget-based: Call `render()` to get root element, insert into DOM in sorted order
3. Set `widget.attached = true` and `widget.rootElement = rootElement`
4. Call `widget.onAttach()` if available

**Detach Process:**
1. Call `widget.onDetach()` if available
2. Remove `rootElement` from DOM
3. Set `widget.attached = false` and `widget.rootElement = null`

### 3.4 Visibility Management
**File:** `public/js/core/WidgetManager.js` (lines 469-507)

**Auto-Managed Widgets:**
- `npc`: Visible when `widget.activeNPC` is truthy (harvest/cooldown active)
- `factory`: Visible when `playerState.inFactoryRoom === true`

**Regular Widgets:**
- Check requirements (`requiresGod`, `requiresWarehouse`, `requiresFactory`)
- Check toggle state (`activeWidgets.has(widgetId)`)
- Attach/detach based on combined conditions

---

## 4. WIDGET MESSAGE ROUTING

### 4.1 Message Entry Point
**File:** `public/js/core/WidgetManager.js` (lines 443-464)
- **ONLY** `WidgetManager.handleMessage()` routes messages to widgets
- Widgets receive messages via `onMessage()` callback, NOT direct MessageBus subscriptions
- Messages routed to all attached widgets and all auto-managed widgets (even if not attached)

### 4.2 Subscribed Events
**File:** `public/js/core/WidgetManager.js` (lines 57-150)

**Player State Events:**
- `player:stats` - Routes to widgets as `{ type: 'playerStats', stats: data.stats }`
- `room:update` - Routes as `{ type: 'roomUpdate', ...data }`
- `room:moved` - Routes as `{ type: 'moved', ...data }`

**Communication Events:**
- `talked` - Routes as `{ type: 'talked', ...data }`
- `resonated` - Routes as `{ type: 'resonated', ...data }`
- `telepath` - Routes as `{ type: 'telepath', ...data }`
- `telepathSent` - Routes as `{ type: 'telepathSent', ...data }`

**Factory Events:**
- `factoryWidgetState` - Routes as `{ type: 'factoryWidgetState', ...data }`
- `factoryCraftStarted` - Routes as `{ type: 'factoryCraftStarted', ...data }`
- `factoryCraftComplete` - Routes as `{ type: 'factoryCraftComplete', ...data }`
- `factoryCraftFizzle` - Routes as `{ type: 'factoryCraftFizzle', ...data }`

**Map/Pathing Events:**
- `map:data`, `map:update`
- `pathing:modeStarted`, `pathing:room`, `pathing:saved`
- `paths:all`, `paths:details`, `paths:executionStarted`, `paths:executionResumed`, `paths:executionComplete`, `paths:executionStopped`, `paths:executionFailed`
- `autonav:started`, `autonav:complete`, `autonav:failed`
- `pathSaved`, `pathDeleted`

**Ticket Events:**
- `ticketsList`, `ticketUpdated`, `ticketFeedbackAdded`

**Config Events:**
- `widget:config` - Updates `activeWidgets` from server

### 4.3 Widget Message Handling
**File:** `public/js/widgets/Widget.js` (lines 58-60)
- Widgets override `onMessage(msg)` to handle specific message types
- Example: `StatsWidget.onMessage()` handles `playerStats` messages (lines 59-64)

---

## 5. WIDGET BASE CLASS METHODS

### 5.1 Widget Class (Render-Based)
**File:** `public/js/widgets/Widget.js`

**Required Methods:**
- `render()` - **MUST** be overridden, returns single root DOM element (lines 33-35)
- `init()` - Optional override, sets up widget state (NO DOM lookups) (lines 23-26)
- `onAttach()` - Optional override, called after widget attached to DOM (lines 41-43)
- `onDetach()` - Optional override, called before widget detached (lines 49-51)
- `onMessage(msg)` - Optional override, handles backend messages (lines 58-60)
- `update()` - Re-renders widget by replacing root element (lines 66-78)

**Properties:**
- `this.id` - Widget ID from registry
- `this.rootElement` - Root DOM element (set after render)
- `this.attached` - Boolean attachment state
- `this.game` - Game instance (from Component)

### 5.2 Component Class (DOM-Based)
**File:** `public/js/core/Component.js`

**Methods:**
- `init()` - Override to set up component (lines 23-25)
- `render()` - Override to update DOM (lines 31-33)
- `destroy()` - Override to clean up (lines 39-44)
- `subscribe(event, callback)` - Subscribe to MessageBus events (lines 51-59)
- `emit(event, data)` - Emit MessageBus events (lines 66-72)
- `send(message)` - Send message to game server (lines 78-84)

**Properties:**
- `this.game` - Game instance
- `this.messageBus` - MessageBus instance
- `this.subscriptions` - Array of unsubscribe functions

---

## 6. WIDGET FEATURES BY TYPE

### 6.1 StatsWidget
**File:** `public/js/widgets/StatsWidget.js`

**Features:**
- Displays player stats organized by category (stats, abilities, resources, flags)
- Shows assignable points with increment/decrement controls (top 4 attributes only)
- Displays resource bars (HP, Mana) with current/max values
- Shows Pulse Echo progression (echoes and tier)
- Shows Encumbrance with progress bar
- Handles attribute point assignment via `assignAttributePoint` message

**Message Types Handled:**
- `playerStats` - Updates stats display

**Server Messages Sent:**
- `assignAttributePoint` - `{ type: 'assignAttributePoint', statKey: string, action: 'increment'|'decrement' }`

### 6.2 CommsWidget
**File:** `public/js/widgets/CommsWidget.js`

**Features:**
- Three communication modes: Talk, Resonate, Telepath
- Stores message history in localStorage per player
- Parses markup in messages (especially ZORK responses)
- Layout: Mode buttons → Input box → Chat history (scrollable)
- Auto-scrolls to bottom on new messages

**Message Types Handled:**
- `talked` - Adds to talk history
- `resonated` - Adds to resonate history
- `telepath` - Adds received telepath to history
- `telepathSent` - Adds sent telepath to history
- `playerAuthenticated` - Reloads history

**Storage:**
- localStorage key: `comms_history_${playerName}`
- Stores arrays: `{ talk: [], resonate: [], telepath: [] }`
- Keeps last 100 messages per channel

### 6.3 MapWidget
**File:** `public/js/widgets/MapWidget.js` (referenced in registry)

**Features:**
- Displays room map visualization
- Shows current room and surrounding rooms
- Handles map updates and pathing visualization

**Message Types Handled:**
- `map:data`, `map:update`
- `pathing:*` events

### 6.4 NPCWidget (Auto-Managed)
**File:** `public/js/widgets/NPCWidget.js`

**Features:**
- Auto-shows during NPC harvest or cooldown
- Displays NPC name, status, and progress bar
- Only shows for NPCs being harvested by current player
- Uses existing DOM element (`#widget-npc`)

**Visibility Logic:**
- Shows when NPC has `harvestStatus === 'active'` or `harvestStatus === 'cooldown'`
- Checks `harvesting_player_id` matches current player ID
- Hides when no active harvest/cooldown

**Message Types Handled:**
- `room:update` - Checks for active NPCs
- `room:moved` - Checks for active NPCs
- `player:stats` - Gets player ID

### 6.5 FactoryWidget (Auto-Managed)
**File:** `public/js/widgets/FactoryWidget.js`

**Features:**
- Auto-shows in factory-type rooms
- Displays 5 factory slots with drag-and-drop
- Shows crafting progress and status
- Handles recipe matching and crafting initiation
- Uses existing DOM element (`#widget-factory`)

**Visibility Logic:**
- Shows when `room.roomType === 'factory'`
- Hides when leaving factory rooms

**Message Types Handled:**
- `room:update` - Checks room type
- `room:moved` - Checks room type
- `factoryWidgetState` - Updates factory state
- `factoryCraftStarted` - Shows progress
- `factoryCraftComplete` - Resets state
- `factoryCraftFizzle` - Shows error

### 6.6 GodModeWidget
**File:** `public/js/widgets/GodModeWidget.js` (referenced in registry)

**Features:**
- Only visible to god mode players
- Provides access to game editors and admin tools
- Grid layout with editor buttons (2 columns, 4 rows)
- Editor buttons include: Map, NPC, Items, Player, Crafting, Tickets, Formulas, Markup

**Editor Buttons:**
1. **Map** - Opens map editor (`/map`)
2. **NPC** - Opens NPC editor (`/npc`)
3. **Items** - Opens item editor (`/items`)
4. **Player** - Opens player editor (`/player`)
5. **Crafting** - Opens crafting recipe editor (`/crafting`)
6. **Tickets** - Opens ticket editor (`/tickets`)
7. **Formulas** - Opens global formula editor (`/formulas`)
8. **Markup** - Opens markup convention editor (`/markup`)

**Button Click Handling:**
- Each button has `data-action` attribute matching editor name
- Click handler navigates to appropriate route via `window.location.href`
- Routes defined in `handleEditorClick()` method

**Requirements:**
- `requiresGod: true`

### 6.7 WarehouseWidget
**File:** `public/js/widgets/WarehouseWidget.js` (referenced in registry)

**Features:**
- Only visible with warehouse deed
- Displays warehouse inventory
- Handles item storage and retrieval

**Requirements:**
- `requiresWarehouse: true`

### 6.8 AutomationWidget
**File:** `public/js/widgets/AutomationWidget.js` (referenced in registry)

**Features:**
- Fullwidth widget for automation controls
- Path execution and auto-navigation
- Path creation and management

**Message Types Handled:**
- `paths:*` events
- `autonav:*` events

### 6.9 TicketsWidget
**File:** `public/js/widgets/TicketsWidget.js` (referenced in registry)

**Features:**
- Only visible to god mode players
- Displays ticket list and details
- Handles ticket updates and feedback

**Requirements:**
- `requiresGod: true`

**Message Types Handled:**
- `ticketsList`
- `ticketUpdated`
- `ticketFeedbackAdded`

---

## 7. WIDGET TOGGLE BAR

### 7.1 Toggle Bar Creation
**File:** `public/js/core/WidgetManager.js` (lines 221-287)

**Structure:**
- Created in `.right-panel` container
- Contains widget icon buttons (only non-auto-managed widgets)
- Includes exit button moved from elsewhere
- Icons use SVG paths from registry or first letter fallback

### 7.2 Toggle Bar Updates
**File:** `public/js/core/WidgetManager.js` (lines 292-324)

**Update Triggers:**
- Player state changes (god mode, warehouse deed, factory room)
- Widget toggle actions
- Initial mount

**Icon States:**
- `active` class when widget is toggled on
- `hidden` class when widget requirements not met

### 7.3 Widget Toggle
**File:** `public/js/core/WidgetManager.js` (lines 329-350)

**Process:**
1. Check widget requirements (god, warehouse, factory)
2. Toggle `activeWidgets` Set
3. Attach/detach widget
4. Update toggle bar
5. Save config to server via `updateWidgetConfig` message

**Server Message:**
- `updateWidgetConfig` - `{ type: 'updateWidgetConfig', config: { activeWidgets: string[] } }`

---

## 8. WIDGET CONFIGURATION PERSISTENCE

### 8.1 Server Storage
**File:** `public/js/core/WidgetManager.js` (lines 355-367)
- Widget configuration saved to server via WebSocket
- Stores `activeWidgets` array of widget IDs
- Sent on every toggle action

### 8.2 Server Restoration
**File:** `public/js/core/WidgetManager.js` (lines 144-150)
- Receives `widget:config` message from server
- Restores `activeWidgets` Set from `data.config.activeWidgets`
- Updates toggle bar and visibility

---

## 9. WIDGET REQUIREMENTS & VALIDATION

### 9.1 Requirement Checks
**File:** `public/js/core/WidgetManager.js` (lines 300-308, 334-336, 488-493)

**God Mode:**
- Checked via `playerState.isGod` (from `player:stats` event, `stats.godMode` or `stats.flag_god_mode`)

**Warehouse:**
- Checked via `playerState.hasWarehouseDeed` (from `room:update` event, `data.hasWarehouseDeed`)

**Factory:**
- Checked via `playerState.inFactoryRoom` (from `room:update` or `room:moved`, `room.roomType === 'factory'`)

### 9.2 Missing Validations
- **NOT VALIDATED:** Widget ID uniqueness in registry
- **NOT VALIDATED:** Widget class existence before instantiation (warns only)
- **NOT VALIDATED:** Widget render() return value type (errors if null)
- **NOT VALIDATED:** Widget order conflicts (multiple widgets can have same order)

---

## 10. BEHAVIORAL RULES & INVARIANTS

### 10.1 Enforced Rules
1. **WidgetManager is ONLY message entry point** - Widgets receive messages via `onMessage()`, not direct MessageBus subscriptions (Widget-based widgets)
2. **Component-based widgets use MessageBus** - NPCWidget and FactoryWidget subscribe directly to MessageBus events
3. **Auto-managed widgets always receive messages** - Even when not attached, for state management
4. **Widget order determines DOM insertion order** - Lower order = earlier in DOM
5. **Toggle bar only shows non-auto-managed widgets** - Auto-managed widgets have no toggle button
6. **Widget attachment requires render() or existing DOM** - Widget-based widgets must implement `render()`, Component-based widgets find existing elements

### 10.2 State Transitions
**File:** `public/js/core/WidgetManager.js`

**Widget Lifecycle:**
1. **Created** → `init()` called → Stored in `widgets` Map
2. **Attached** → `render()` called (if Widget-based) → `onAttach()` called → `attached = true`
3. **Active** → Receives messages via `onMessage()` → Updates DOM
4. **Detached** → `onDetach()` called → Removed from DOM → `attached = false`
5. **Destroyed** → Removed from Map (on page unload)

**Visibility State:**
- **Hidden** → Requirements not met OR not toggled on
- **Visible** → Requirements met AND toggled on (or auto-managed and conditions met)

---

## 11. INTERACTIONS WITH OTHER SYSTEMS

### 11.1 Game Core
- **Game instance** - All widgets receive `game` instance for `send()` and `getWebSocket()`
- **MessageBus** - WidgetManager subscribes to events, routes to widgets
- **WebSocket** - Widgets send messages via `game.send()`

### 11.2 Terminal
- Some widgets use `window.terminal.addMessage()` for error messages
- Terminal is separate component, not a widget

### 11.3 Inventory
- Inventory is separate component, not a widget
- Some widgets may interact with inventory data

### 11.4 Server Handlers
- Widget messages sent to server handled by `handlers/game.js`
- Server sends widget config updates via `widget:config` message

---

## 12. FAILURE STATES & ERROR HANDLING

### 12.1 Widget Creation Failures
**File:** `public/js/core/WidgetManager.js` (lines 189-208)
- **Widget class not found:** Warns and skips widget
- **Widget instantiation error:** Catches and logs error, skips widget
- **Widget missing render():** Throws error in Widget base class (line 34)

### 12.2 Widget Attachment Failures
**File:** `public/js/core/WidgetManager.js` (lines 384-388)
- **render() returns null:** Logs error and skips attachment
- **DOM insertion fails:** Browser throws, widget not attached

### 12.3 Message Handling Failures
**File:** `public/js/core/WidgetManager.js` (lines 459-461)
- **onMessage() throws error:** Caught and logged, other widgets still receive message

### 12.4 Missing Error Handling
- **NOT HANDLED:** WebSocket disconnection during widget message send
- **NOT HANDLED:** localStorage quota exceeded for CommsWidget history
- **NOT HANDLED:** Invalid widget config from server

---

## 13. SERIALIZATION & DATA FLOW

### 13.1 Server to Client
**Widget Config:**
- `widget:config` message contains `{ config: { activeWidgets: string[] } }`

**Game State:**
- Player stats, room data, NPCs, factory state sent via various message types
- Widgets receive via `onMessage()` callback

### 13.2 Client to Server
**Widget Config:**
- `updateWidgetConfig` message contains `{ type: 'updateWidgetConfig', config: { activeWidgets: string[] } }`

**Widget Actions:**
- Various messages sent by widgets (e.g., `assignAttributePoint`, `talk`, `resonate`, `telepath`)

### 13.3 Local Storage
**CommsWidget:**
- Stores `comms_history_${playerName}` in localStorage
- Format: `{ talk: Message[], resonate: Message[], telepath: Message[] }`
- Message format: `{ playerName: string, message: string, isReceived: boolean, targetPlayer?: string, timestamp: number }`

---

## 14. KNOWN GAPS & MISSING FEATURES

### 14.1 Missing Implementations
1. **Widget resize/drag** - Widgets cannot be resized or repositioned by user
2. **Widget state persistence** - Only activeWidgets persisted, not widget-specific state (except CommsWidget localStorage)
3. **Widget error boundaries** - No error recovery mechanism for widget failures
4. **Widget loading states** - No loading indicators during widget initialization
5. **Widget animations** - No transition animations for show/hide
6. **Widget keyboard shortcuts** - No keyboard shortcuts for widget toggling
7. **Widget tooltips** - Only icon tooltips, no widget content tooltips
8. **Widget refresh** - No manual refresh mechanism for widgets
9. **Widget export/import** - Cannot export/import widget configurations
10. **Widget themes** - CSS themes exist but not user-selectable

### 14.2 Partial Implementations
1. **Widget order** - Defined but not enforced (duplicates allowed)
2. **Widget validation** - Basic checks but no comprehensive validation
3. **Widget cleanup** - `onDetach()` exists but not always called on page unload

---

## 15. SUMMARY

### 15.1 Strengths
- **Centralized management** - WidgetManager provides single point of control
- **Message routing** - Clean separation between MessageBus and widget message handling
- **Flexible architecture** - Supports both render-based (Widget) and DOM-based (Component) widgets
- **Auto-management** - Smart visibility control for context-sensitive widgets
- **Requirement system** - Clean way to gate widgets by player state
- **CSS standardization** - Shared CSS provides consistent styling

### 15.2 Weaknesses
- **Mixed patterns** - Two base classes (Widget vs Component) can be confusing
- **Limited error handling** - Many failure cases not handled gracefully
- **No state persistence** - Widget-specific state not persisted (except CommsWidget)
- **No validation** - Registry validation is minimal
- **Hardcoded dependencies** - WidgetManager imports all widgets statically

### 15.3 Risks
- **Widget class missing** - If widget class not found, widget silently fails
- **Message routing errors** - Errors in one widget's `onMessage()` don't affect others, but no recovery
- **DOM conflicts** - Component-based widgets assume DOM elements exist
- **State desync** - Widget state can desync if messages arrive out of order
- **Memory leaks** - Event listeners may not be cleaned up if `onDetach()` not called

---

**END OF DOCUMENT**
