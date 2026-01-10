# ✅ **WIDGET OPERATION - CANONICAL SPEC**

**Document Type:** Canonical Reference  
**Last Updated:** Based on codebase analysis  
**Purpose:** Complete specification of how widgets currently operate in gameplay, including existing widget behaviors, message handling, and player interactions.

**Note:** For guidelines on creating new widgets, see `20-11-widget-architecture-canonical.md`.

---

## 1. CURRENT WIDGET SYSTEM OVERVIEW

### 1.1 Widget Registry
**File:** `public/js/widgets/widget_registry.js`

The widget registry defines all available widgets in the game. Each widget has configuration fields that control its visibility, behavior, and placement. See Architecture document for details on these fields.

### 1.2 Widget Manager
**File:** `public/js/core/WidgetManager.js`

The WidgetManager handles widget lifecycle, message routing, and visibility management. It is the single entry point for all widget messages.

---

## 2. EXISTING WIDGETS IN GAMEPLAY

### 2.1 Standard Widgets (`slot: 'standard'`)

#### StatsWidget (`id: 'stats'`)
**File:** `public/js/widgets/StatsWidget.js`

**Gameplay Features:**
- Displays player stats organized by category (stats, abilities, resources, flags)
- Shows assignable points with increment/decrement controls (top 4 attributes only)
- Displays resource bars (HP, Mana) with current/max values
- Shows Pulse Echo progression (echoes and tier)
- Shows Encumbrance with progress bar
- **Default Active:** Yes (order: 10)

**Message Types Handled:**
- `playerStats` - Updates stats display

**Server Messages Sent:**
- `assignAttributePoint` - `{ type: 'assignAttributePoint', statKey: string, action: 'increment'|'decrement' }`

**Player Interaction:**
- Players click increment/decrement buttons to assign attribute points
- Updates are sent immediately to server

---

#### CompassWidget (`id: 'compass'`)
**File:** `public/js/widgets/CompassWidget.js`

**Gameplay Features:**
- Displays directional compass
- Shows available exits from current room
- **Default Active:** Yes (order: 20)

**Message Types Handled:**
- `roomUpdate` - Updates compass with current room exits
- `moved` - Updates compass on room change

---

#### MapWidget (`id: 'map'`)
**File:** `public/js/widgets/MapWidget.js`

**Gameplay Features:**
- Displays room map visualization
- Shows current room and surrounding rooms
- Handles map updates and pathing visualization
- **Default Active:** Yes (order: 30)

**Message Types Handled:**
- `map:data` - Initial map data
- `map:update` - Map updates
- `pathing:modeStarted` - Pathing mode activation
- `pathing:room` - Pathing room selection
- `pathing:saved` - Path saved confirmation
- `paths:all` - All paths list
- `paths:details` - Path details
- `paths:executionStarted` - Path execution started
- `paths:executionResumed` - Path execution resumed
- `paths:executionComplete` - Path execution complete
- `paths:executionStopped` - Path execution stopped
- `paths:executionFailed` - Path execution failed
- `autonav:started` - Auto-navigation started
- `autonav:complete` - Auto-navigation complete
- `autonav:failed` - Auto-navigation failed

---

#### CommsWidget (`id: 'comms'`)
**File:** `public/js/widgets/CommsWidget.js`

**Gameplay Features:**
- Three communication modes: Talk, Resonate, Telepath, Broadcast
- Stores message history in localStorage per player
- Parses markup in messages (especially ZORK responses)
- Layout: Mode buttons → Input box → Chat history (scrollable)
- Auto-scrolls to bottom on new messages
- **Broadcast Mode:** Expands to 2 slots wide, shows broadcast groups list and conversation history
- **Default Active:** Yes (order: 40)

**Message Types Handled:**
- `talked` - Adds to talk history
- `resonated` - Adds to resonate history
- `telepath` - Adds received telepath to history
- `telepathSent` - Adds sent telepath to history
- `playerAuthenticated` - Reloads history
- `broadcast` - Received broadcast message
- `broadcastGroups` - Groups list update
- `broadcastHistory` - Message history for all groups
- `broadcastGroupMembers` - Members list for management
- `broadcastGroupDeleted` - Group deletion notification
- `allPlayers` - All players list for modals

**Storage:**
- localStorage key: `comms_history_${playerName}`
- Stores arrays: `{ talk: Message[], resonate: Message[], telepath: Message[], broadcast: {} }`
- Keeps last 100 messages per channel

**Player Interaction:**
- Players select communication mode via buttons
- Input box for typing messages
- For telepath: Select target player from dropdown
- For broadcast: Select group, double-click to manage, use modals to add/remove members
- History persists across sessions

**Broadcast Features:**
- Left side: List of broadcast groups with numbered badges
- Right side: Conversation history and input box
- Double-click group to open management modal
- Management modal: View members, add/remove members, delete group
- Full conversation history regardless of player presence
- Messages persist in database and appear in terminal_history for offline players

---

#### WarehouseWidget (`id: 'warehouse'`)
**File:** `public/js/widgets/WarehouseWidget.js`

**Gameplay Features:**
- Only visible with warehouse deed (`requiresWarehouse: true`)
- Displays warehouse inventory
- Handles item storage and retrieval
- Order: 50

**Message Types Handled:**
- `warehouseState` - Warehouse inventory and capacity updates

**Requirements:**
- Player must have warehouse deed (checked via `playerState.hasWarehouseDeed`)

---

#### GodModeWidget (`id: 'godmode'`)
**File:** `public/js/widgets/GodModeWidget.js`

**Gameplay Features:**
- Only visible to god mode players (`requiresGod: true`)
- Provides access to game editors and admin tools
- Grid layout with editor buttons (2 columns, 4 rows)
- Editor buttons: Map, NPC, Items, Player, Crafting, Tickets, Formulas, Markup
- Order: 60

**Editor Buttons:**
1. **Map** - Opens map editor (`/map`)
2. **NPC** - Opens NPC editor (`/npc`)
3. **Items** - Opens item editor (`/items`)
4. **Player** - Opens player editor (`/player`)
5. **Crafting** - Opens crafting recipe editor (`/crafting`)
6. **Tickets** - Opens ticket editor (`/tickets`)
7. **Formulas** - Opens global formula editor (`/formulas`)
8. **Markup** - Opens markup convention editor (`/markup`)

**Player Interaction:**
- Click editor button to navigate to editor route
- Routes defined in `handleEditorClick()` method

**Requirements:**
- Player must have god mode (checked via `playerState.isGod`)

---

#### RuneKeeperWidget (`id: 'runekeeper'`)
**File:** `public/js/widgets/RuneKeeperWidget.js`

**Gameplay Features:**
- Displays rune information
- Order: 80

**Message Types Handled:**
- TBD (implementation-specific)

---

### 2.2 Fullwidth Widgets (`slot: 'fullwidth'`)

#### AutomationWidget (`id: 'automation'`)
**File:** `public/js/widgets/AutomationWidget.js`

**Gameplay Features:**
- Fullwidth widget for automation controls
- Path execution and auto-navigation
- Path creation and management
- Order: 70

**Message Types Handled:**
- `paths:all` - All paths list
- `paths:details` - Path details
- `paths:executionStarted` - Path execution started
- `paths:executionResumed` - Path execution resumed
- `paths:executionComplete` - Path execution complete
- `paths:executionStopped` - Path execution stopped
- `paths:executionFailed` - Path execution failed
- `autonav:started` - Auto-navigation started
- `autonav:complete` - Auto-navigation complete
- `autonav:failed` - Auto-navigation failed
- `pathSaved` - Path saved confirmation
- `pathDeleted` - Path deleted confirmation

---

#### TicketsWidget (`id: 'tickets'`)
**File:** `public/js/widgets/TicketsWidget.js`

**Gameplay Features:**
- Only visible to god mode players (`requiresGod: true`)
- Displays ticket list with tabs: Open/Pending, Testing, Backlog
- Shows ticket details (title, status, priority, type, description, repro steps, resolution notes)
- Handles ticket updates and feedback
- Auto-refreshes every 5 seconds
- Order: 90

**Message Types Handled:**
- `ticketsList` - List of tickets from server
- `ticketUpdated` - Ticket update notification
- `ticketFeedbackAdded` - Feedback added notification

**Player Interaction:**
- Tabs: Switch between Open/Pending, Testing, Backlog
- Click ticket to view details
- Create new ticket button
- Refresh button
- Tab selection persists in localStorage
- Filter status persists in localStorage

**Tab Behavior:**
- **Open/Pending:** Shows tickets with status `'open'`
- **Testing:** Shows tickets with status `'in_progress'`
- **Backlog:** Shows tickets with status `'backlog'`

**Requirements:**
- Player must have god mode (checked via `playerState.isGod`)

---

#### InstructionsWidget (`id: 'instructions'`)
**File:** `public/js/widgets/InstructionsWidget.js`

**Gameplay Features:**
- Displays game instructions and help
- Order: 120

**Message Types Handled:**
- TBD (implementation-specific)

---

### 2.3 Auto-Managed Widgets (`autoManaged: true`)

#### NPCWidget (`id: 'npc'`)
**File:** `public/js/widgets/NPCWidget.js`

**Gameplay Features:**
- Auto-shows during NPC harvest or cooldown
- Displays NPC name, status, and progress bar
- Only shows for NPCs being harvested by current player
- Tracks resource gains (pulse echoes, pulse resin) during harvest
- Order: 100

**Visibility Logic:**
- Shows when NPC has `harvestStatus === 'active'` or `harvestStatus === 'cooldown'`
- Checks `harvesting_player_id` matches current player ID
- Widget sets `this.activeNPC = npc` when NPC has active harvest/cooldown
- Widget sets `this.activeNPC = null` when no active NPC
- WidgetManager checks: `shouldShow = !!widget.activeNPC`

**Message Types Handled:**
- `roomUpdate` - Checks for active NPCs, updates harvest progress
- `roomMoved` - Checks for active NPCs
- `playerStats` - Gets player ID for filtering
- `npcWidget:resourceGain` - Direct resource gain updates from server (pulse echoes, pulse resin)

**Direct Server Messaging:**
- Server sends `npcWidget:resourceGain` messages directly during harvest cycles
- Ensures accurate tracking of first item drops even if widget attachment is delayed
- Format: `{ type: 'npcWidget:resourceGain', resourceType: 'pulseEchoes'|'pulseResin', amount: number, total: number }`

**Resource Tracking:**
- Tracks starting stats when harvest begins
- Calculates gains by comparing current vs starting stats
- Handles late attachment by calculating baseline from (current - amount) if starting value not set

---

#### FactoryWidget (`id: 'factory'`)
**File:** `public/js/widgets/FactoryWidget.js`

**Gameplay Features:**
- Auto-shows in factory-type rooms (`requiresFactory: true`)
- Displays 5 factory slots with drag-and-drop
- Shows crafting progress and status
- Handles recipe matching and crafting initiation
- Order: 110

**Visibility Logic:**
- Shows when `room.roomType === 'factory'`
- Widget sets `this.inFactoryRoom = true` when room type is 'factory'
- Widget sets `this.inFactoryRoom = false` when not in factory room
- WidgetManager checks: `shouldShow = widget.inFactoryRoom !== undefined ? widget.inFactoryRoom : this.playerState.inFactoryRoom`

**Message Types Handled:**
- `roomUpdate` - Checks room type, updates factory state
- `roomMoved` - Checks room type
- `factoryWidgetState` - Updates factory state (slots, items, recipes)
- `factoryCraftStarted` - Shows progress bar
- `factoryCraftComplete` - Resets state, shows completion
- `factoryCraftFizzle` - Shows error message

**Player Interaction:**
- Drag items from inventory to factory slots
- Click craft button to start crafting
- View recipe requirements and match status
- Progress bar shows crafting progress

**Requirements:**
- Player must be in factory room (checked via `room.roomType === 'factory'`)

---

## 3. WIDGET MESSAGE ROUTING IN GAMEPLAY

### 3.1 Message Flow
1. **Server** → Sends WebSocket message to client
2. **Game.js** → Receives message, emits to MessageBus
3. **WidgetManager** → Subscribes to MessageBus events, routes to widgets via `handleMessage()`
4. **Widget** → Receives message in `onMessage()` method, updates display

### 3.2 Currently Routed Message Types

**Player State Events:**
- `player:stats` → Routes as `{ type: 'playerStats', stats: data.stats }`
- `room:update` → Routes as `{ type: 'roomUpdate', ...data }`
- `room:moved` → Routes as `{ type: 'moved', ...data }`

**Communication Events:**
- `talked` → Routes as `{ type: 'talked', ...data }`
- `resonated` → Routes as `{ type: 'resonated', ...data }`
- `telepath` → Routes as `{ type: 'telepath', ...data }`
- `telepathSent` → Routes as `{ type: 'telepathSent', ...data }`

**Factory Events:**
- `factoryWidgetState` → Routes as `{ type: 'factoryWidgetState', ...data }`
- `factoryCraftStarted` → Routes as `{ type: 'factoryCraftStarted', ...data }`
- `factoryCraftComplete` → Routes as `{ type: 'factoryCraftComplete', ...data }`
- `factoryCraftFizzle` → Routes as `{ type: 'factoryCraftFizzle', ...data }`

**Map/Pathing Events:**
- `map:data`, `map:update`
- `pathing:modeStarted`, `pathing:room`, `pathing:saved`
- `paths:all`, `paths:details`, `paths:executionStarted`, `paths:executionResumed`, `paths:executionComplete`, `paths:executionStopped`, `paths:executionFailed`
- `autonav:started`, `autonav:complete`, `autonav:failed`
- `pathSaved`, `pathDeleted`

**Ticket Events:**
- `ticketsList` → Routes as `{ type: 'ticketsList', tickets: data.tickets }`
- `ticketUpdated` → Routes as `{ type: 'ticketUpdated', ticket: data.ticket }`
- `ticketFeedbackAdded` → Routes as `{ type: 'ticketFeedbackAdded', ...data }`

**NPC Events:**
- `npcWidget:resourceGain` → Routes directly from server for accurate resource tracking

**Broadcast Events:**
- `broadcast` → Received broadcast message
- `broadcastGroups` → Groups list update
- `broadcastHistory` → Message history for all groups
- `broadcastGroupMembers` → Members list for management
- `broadcastGroupDeleted` → Group deletion notification
- `allPlayers` → All players list for modals

**Config Events:**
- `widget:config` → Updates `activeWidgets` from server, restores widget toggle state

---

## 4. WIDGET LIFECYCLE IN GAMEPLAY

### 4.1 Initialization Flow
1. **Game Startup:** `Game` instance created in `main.js`
2. **WidgetManager Creation:** `game.widgetManager = new WidgetManager(game, WIDGETS)`
3. **Mount All:** `game.widgetManager.mountAll()` called
4. **Widget Creation:** All widgets from registry instantiated, `init()` called on each
5. **Default Active:** Widgets with `defaultActive: true` are activated
6. **Server Config:** Widget config restored from server via `widget:config` message
7. **Visibility Update:** WidgetManager updates visibility based on requirements and toggle state

### 4.2 Attachment/Detachment Flow

**Attachment:**
1. Widget requirements checked (god mode, warehouse deed, factory room)
2. Toggle state checked (`activeWidgets.has(widgetId)`)
3. If conditions met: `render()` called (if Widget-based) → DOM inserted → `onAttach()` called
4. Widget receives messages via `onMessage()`

**Detachment:**
1. `onDetach()` called (cleanup event listeners, intervals)
2. DOM element removed
3. Widget stops receiving messages (unless auto-managed)
4. Toggle state saved to server

### 4.3 Visibility Management

**Regular Widgets:**
- Visibility controlled by requirements AND toggle state
- Requirements: `requiresGod`, `requiresWarehouse`, `requiresFactory`
- Toggle: User clicks icon in toggle bar
- Both conditions must be met for widget to show

**Auto-Managed Widgets:**
- Visibility controlled by widget's internal state
- Widget sets state properties in message handlers:
  - NPCWidget: `this.activeNPC = npc` or `null`
  - FactoryWidget: `this.inFactoryRoom = true` or `false`
- WidgetManager checks state properties after routing messages
- No toggle button (widget appears/disappears automatically)

---

## 5. WIDGET TOGGLE BAR

### 5.1 Toggle Bar Location
- Created in `.right-panel` container
- Contains widget icon buttons (only non-auto-managed widgets)
- Includes exit button

### 5.2 Toggle Bar Behavior
- Icons use SVG paths from registry or first letter fallback
- `active` class when widget is toggled on
- `hidden` class when widget requirements not met
- Updates when player state changes (god mode, warehouse deed, factory room)
- Updates on widget toggle actions
- Updates on initial mount

### 5.3 Toggle Action Flow
1. Player clicks widget icon in toggle bar
2. WidgetManager checks requirements (god, warehouse, factory)
3. If requirements met: Toggle `activeWidgets` Set
4. Attach/detach widget based on new toggle state
5. Update toggle bar visual state
6. Save config to server via `updateWidgetConfig` message
7. Server persists `activeWidgets` array

---

## 6. WIDGET CONFIGURATION PERSISTENCE

### 6.1 Server Storage
- Widget configuration saved to server via WebSocket
- Stores `activeWidgets` array of widget IDs
- Sent on every toggle action
- **Message:** `updateWidgetConfig` - `{ type: 'updateWidgetConfig', config: { activeWidgets: string[] } }`

### 6.2 Server Restoration
- Receives `widget:config` message from server on game start
- Restores `activeWidgets` Set from `data.config.activeWidgets`
- Updates toggle bar and visibility
- Widgets attach/detach based on restored state

### 6.3 Local Storage
- **CommsWidget:** Stores `comms_history_${playerName}` in localStorage
  - Format: `{ talk: Message[], resonate: Message[], telepath: Message[], broadcast: {} }`
  - Keeps last 100 messages per channel
- **TicketsWidget:** Stores `ticketsWidget_tab` and `ticketsWidget_filter` in localStorage
  - Persists selected tab and filter across sessions

---

## 7. WIDGET REQUIREMENTS IN GAMEPLAY

### 7.1 God Mode Requirement
- Checked via `playerState.isGod` (from `player:stats` event)
- Source: `stats.godMode` or `stats.flag_god_mode`
- Widgets: `godmode`, `tickets`

### 7.2 Warehouse Requirement
- Checked via `playerState.hasWarehouseDeed` (from `room:update` event)
- Source: `data.hasWarehouseDeed`
- Widgets: `warehouse`

### 7.3 Factory Requirement
- Checked via `playerState.inFactoryRoom` (from `room:update` or `room:moved`)
- Source: `room.roomType === 'factory'`
- Widgets: `factory` (auto-managed, also checks `widget.inFactoryRoom`)

---

## 8. BEHAVIORAL RULES & INVARIANTS

### 8.1 Enforced Rules
1. **WidgetManager is ONLY message entry point** - Widgets receive messages via `onMessage()`, not direct MessageBus subscriptions (for Widget-based widgets)
2. **Auto-managed widgets always receive messages** - Even when not attached, for state management
3. **Widget order determines DOM insertion order** - Lower order = earlier in DOM
4. **Toggle bar only shows non-auto-managed widgets** - Auto-managed widgets have no toggle button
5. **Widget attachment requires render()** - Widget-based widgets must implement `render()` method

### 8.2 State Transitions

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

## 9. INTERACTIONS WITH OTHER SYSTEMS

### 9.1 Game Core
- **Game instance** - All widgets receive `game` instance for `send()` and `getWebSocket()`
- **MessageBus** - WidgetManager subscribes to events, routes to widgets
- **WebSocket** - Widgets send messages via `game.send()`

### 9.2 Terminal
- Some widgets use `window.terminal.addMessage()` for error messages
- Terminal is separate component, not a widget
- Broadcast messages appear in terminal_history for offline players

### 9.3 Inventory
- Inventory is separate component, not a widget
- FactoryWidget interacts with inventory for drag-and-drop items
- WarehouseWidget displays warehouse inventory (separate from player inventory)

### 9.4 Server Handlers
- Widget messages sent to server handled by `handlers/game.js`
- Server sends widget config updates via `widget:config` message
- Server sends game state updates via various message types (playerStats, roomUpdate, etc.)

---

## 10. FAILURE STATES & ERROR HANDLING

### 10.1 Widget Creation Failures
**File:** `public/js/core/WidgetManager.js`

- **Widget class not found:** Warns and skips widget
- **Widget instantiation error:** Catches and logs error, skips widget
- **Widget missing render():** Throws error in Widget base class

### 10.2 Widget Attachment Failures
**File:** `public/js/core/WidgetManager.js`

- **render() returns null:** Logs error and skips attachment
- **DOM insertion fails:** Browser throws, widget not attached

### 10.3 Message Handling Failures
**File:** `public/js/core/WidgetManager.js`

- **onMessage() throws error:** Caught and logged, other widgets still receive message

### 10.4 Missing Error Handling
- **NOT HANDLED:** WebSocket disconnection during widget message send
- **NOT HANDLED:** localStorage quota exceeded for CommsWidget history
- **NOT HANDLED:** Invalid widget config from server

---

## 11. SERIALIZATION & DATA FLOW

### 11.1 Server to Client

**Widget Config:**
- `widget:config` message contains `{ config: { activeWidgets: string[] } }`

**Game State:**
- Player stats, room data, NPCs, factory state sent via various message types
- Widgets receive via `onMessage()` callback

**Ticket Data:**
- `ticketsList` message contains `{ tickets: Ticket[] }`
- Tickets mapped from database rows using `mapRowsToTickets()` from `ticket.js` model

### 11.2 Client to Server

**Widget Config:**
- `updateWidgetConfig` message contains `{ type: 'updateWidgetConfig', config: { activeWidgets: string[] } }`

**Widget Actions:**
- `assignAttributePoint` - `{ type: 'assignAttributePoint', statKey: string, action: 'increment'|'decrement' }`
- `talk` - `{ type: 'talk', message: string }`
- `resonate` - `{ type: 'resonate', message: string }`
- `telepath` - `{ type: 'telepath', targetPlayer: string, message: string }`
- `broadcast` - `{ type: 'broadcast', groupId: number, message: string }`
- `factoryWidgetAddItem` - `{ type: 'factoryWidgetAddItem', slotIndex: number, itemName: string }`
- `factoryWidgetRemoveItem` - `{ type: 'factoryWidgetRemoveItem', slotIndex: number }`
- `factoryCraft` - `{ type: 'factoryCraft' }`
- `getTickets` - `{ type: 'getTickets', status?: string, limit?: number, includeResolved?: boolean }`

### 11.3 Local Storage

**CommsWidget:**
- Stores `comms_history_${playerName}` in localStorage
- Format: `{ talk: Message[], resonate: Message[], telepath: Message[], broadcast: {} }`
- Message format: `{ playerName: string, message: string, isReceived: boolean, targetPlayer?: string, timestamp: number }`

**TicketsWidget:**
- Stores `ticketsWidget_tab` - Current tab selection ('openPending', 'testing', 'backlog')
- Stores `ticketsWidget_filter` - Current filter status ('open', 'in_progress', 'resolved', 'all')

---

## 12. KNOWN GAPS & MISSING FEATURES

### 12.1 Missing Implementations
1. **Widget resize/drag** - Widgets cannot be resized or repositioned by user
2. **Widget state persistence** - Only activeWidgets persisted, not widget-specific state (except CommsWidget localStorage, TicketsWidget localStorage)
3. **Widget error boundaries** - No error recovery mechanism for widget failures
4. **Widget loading states** - No loading indicators during widget initialization
5. **Widget animations** - No transition animations for show/hide
6. **Widget keyboard shortcuts** - No keyboard shortcuts for widget toggling
7. **Widget tooltips** - Only icon tooltips, no widget content tooltips
8. **Widget refresh** - No manual refresh mechanism for widgets (except TicketsWidget auto-refresh)
9. **Widget export/import** - Cannot export/import widget configurations
10. **Widget themes** - CSS themes exist but not user-selectable

### 12.2 Partial Implementations
1. **Widget order** - Defined but not enforced (duplicates allowed)
2. **Widget validation** - Basic checks but no comprehensive validation
3. **Widget cleanup** - `onDetach()` exists but not always called on page unload

---

## 13. SUMMARY

### 13.1 Current Widget System Strengths
- **Centralized management** - WidgetManager provides single point of control
- **Message routing** - Clean separation between MessageBus and widget message handling
- **Auto-management** - Smart visibility control for context-sensitive widgets (NPC, Factory)
- **Requirement system** - Clean way to gate widgets by player state
- **State persistence** - Widget toggle state persists across sessions
- **Direct server messaging** - NPCWidget receives direct resource updates for accurate tracking

### 13.2 Current Widget System Weaknesses
- **Limited error handling** - Many failure cases not handled gracefully
- **No state persistence** - Widget-specific state not persisted (except CommsWidget, TicketsWidget)
- **No validation** - Registry validation is minimal
- **Hardcoded dependencies** - WidgetManager imports all widgets statically

### 13.3 Current Risks
- **Widget class missing** - If widget class not found, widget silently fails
- **Message routing errors** - Errors in one widget's `onMessage()` don't affect others, but no recovery
- **State desync** - Widget state can desync if messages arrive out of order
- **Memory leaks** - Event listeners may not be cleaned up if `onDetach()` not called

---

**END OF DOCUMENT**
