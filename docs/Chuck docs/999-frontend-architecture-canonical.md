# Frontend Architecture One-Liner Canonical Questions - Code Analysis

**Analysis Date:** Based on codebase analysis  
**Scope:** Frontend layer (`public/` directory)  
**Method:** Direct code examination with file/line citations

---

## 1. Define the canonical purpose of the frontend layer.

**Canonical Purpose:** The frontend layer provides the client-side user interface for "The Game", managing real-time WebSocket communication with the server, rendering game state through modular components, and handling all user interactions. It is a **server-driven UI** that displays game state received via WebSocket messages but maintains local UI state (widget visibility, scroll lock, etc.) independently.

**Evidence:**
- `public/js/core/Game.js:1-6` - Main game controller manages WebSocket connection and message routing
- `public/js/main.js:1-5` - Entry point initializes Game controller and all UI components
- `public/game.html:10-377` - HTML structure defines terminal (2/3) and widget panel (1/3) layout

---

## 2. List all required frontend modules/components at the architectural level.

**Required Modules:**

### Core System:
- **Game** (`public/js/core/Game.js`) - WebSocket manager, message router, global state
- **MessageBus** (`public/js/core/MessageBus.js`) - Centralized pub/sub event system
- **Component** (`public/js/core/Component.js`) - Base class for all UI components

### UI Components (all extend Component):
- **Terminal** (`public/js/components/Terminal.js`) - Text terminal for game output
- **StatsWidget** (`public/js/components/StatsWidget.js`) - Player stats display
- **MapWidget** (`public/js/components/MapWidget.js`) - Map visualization
- **CompassWidget** (`public/js/components/CompassWidget.js`) - Directional navigation
- **CommsWidget** (`public/js/components/CommsWidget.js`) - Chat/communication
- **Inventory** (`public/js/components/Inventory.js`) - Player inventory
- **NPCWidget** (`public/js/components/NPCWidget.js`) - NPC activity display
- **FactoryWidget** (`public/js/components/FactoryWidget.js`) - Factory crafting interface
- **TicketsWidget** (`public/js/components/TicketsWidget.js`) - Ticket management (god mode)

### Widget System:
- **widget_manager** (`public/js/widgets/widget_manager.js`) - Alpine.js component for widget visibility
- **widget_registry** (`public/js/widgets/widget_registry.js`) - Widget definitions and configuration

### Utilities:
- **MapRenderer** (`public/js/utils/MapRenderer.js`) - Map canvas rendering
- **Markup** (`public/js/utils/Markup.js`) - Text markup parsing and rendering

**Evidence:**
- `public/js/main.js:7-17` - All component imports
- `public/js/main.js:23-31` - Component initialization
- `public/js/widgets/widget_registry.js:22-151` - Widget definitions

---

## 3. Specify the state management strategy (local, global store, server-driven).

**State Management Strategy:** **Hybrid - Primarily server-driven with local UI state persistence**

**Server-Driven State:**
- Game state (player stats, room data, inventory) arrives via WebSocket messages
- Server is source of truth for game mechanics
- All gameplay state is updated through `MessageBus` events triggered by server messages

**Local UI State:**
- Widget visibility/active state persisted in `localStorage` (key: `'widgetManager_activeWidgets'`)
- Terminal scroll lock state (not persisted)
- Command input state (ephemeral)
- Tab ID in `sessionStorage` (key: `'gameTabId'`)
- Custom markup conventions cached in `localStorage` (key: `'customMarkupConventions'`)

**Global Access Pattern:**
- `window.game` - Global Game instance (set in `main.js`)
- `window.terminal` - Global Terminal reference
- `window.gameState` - Player state object (referenced but not consistently set)
- `window.widgetManager` - Alpine.js widget manager function

**Evidence:**
- `public/js/widgets/widget_manager.js:21` - localStorage key for widget state
- `public/js/widgets/widget_manager.js:99-131` - Restore from localStorage, save to localStorage
- `public/js/core/Game.js:54-59` - Tab ID in sessionStorage
- `public/js/utils/Markup.js:77` - Custom conventions in localStorage
- `public/js/main.js:34-38` - Global window references

---

## 4. Declare how the frontend syncs with server state.

**Server Sync Mechanism:** **WebSocket-driven event system with MessageBus pub/sub**

**Flow:**
1. **Connection:** `Game.connect()` establishes WebSocket connection (`public/js/core/Game.js:149-244`)
2. **Authentication:** On connect, sends `{ type: 'authenticateSession', windowId }` message (`public/js/core/Game.js:198-203`)
3. **Message Handling:** `Game.handleMessage()` receives server messages and routes to MessageBus (`public/js/core/Game.js:249-692`)
4. **Event Distribution:** MessageBus emits typed events (e.g., `'room:update'`, `'player:stats'`) to subscribed components
5. **Component Updates:** Components subscribe via `Component.subscribe()` and update their DOM in response

**Sync Triggers:**
- Server sends WebSocket messages (no polling for game state)
- Components update UI immediately on event receipt
- No client-side state prediction or optimistic updates

**Evidence:**
- `public/js/core/Game.js:182` - WebSocket creation
- `public/js/core/Game.js:206-213` - Message parsing and routing
- `public/js/core/Game.js:249-692` - Message type switching and MessageBus emission
- `public/js/core/MessageBus.js:18-31` - Event emission to subscribers
- `public/js/core/Component.js:51-58` - Component subscription mechanism

---

## 5. Define the canonical event/message handling model.

**Event/Message Model:** **Two-tier pub/sub system**

**Tier 1: WebSocket Message Types (Server → Client)**
Server sends JSON messages with `type` field. `Game.handleMessage()` switches on `type` and emits MessageBus events.

**Tier 2: MessageBus Events (Internal Frontend)**
Components subscribe to MessageBus events (e.g., `'room:update'`, `'player:stats'`, `'terminal:message'`) and react by updating DOM.

**Message Flow:**
```
Server WebSocket Message (JSON) 
  → Game.handleMessage() (switches on type)
    → MessageBus.emit(eventName, data)
      → Component.subscribe(eventName, callback)
        → Component updates DOM
```

**Naming Convention:**
- Server messages: `camelCase` (e.g., `roomUpdate`, `playerStats`)
- MessageBus events: `namespace:action` (e.g., `room:update`, `player:stats`, `terminal:message`)

**Evidence:**
- `public/js/core/Game.js:249-692` - Message type switching with MessageBus emissions
- `public/js/core/MessageBus.js:18-31` - Event emission
- `public/js/components/Terminal.js:90-99` - Component subscription pattern
- `public/js/components/StatsWidget.js:25` - StatsWidget subscribes to `'player:stats'`

---

## 6. State which responsibilities belong only to the client (never server).

**Client-Only Responsibilities:**

1. **UI State Management:**
   - Widget visibility/active state (`widget_manager.js`)
   - Terminal scroll lock toggle
   - Command input field state
   - Modal/dialog visibility

2. **User Input Processing:**
   - Command normalization (`main.js:123-2655` - `normalizeCommand()`)
   - Keyboard shortcuts (e.g., `/r` repeat command)
   - Voice input recognition (Web Speech API)

3. **Local Persistence:**
   - Widget preferences (`localStorage`)
   - Tab ID generation (`sessionStorage`)
   - Custom markup conventions cache

4. **DOM Manipulation:**
   - All rendering and visual updates
   - Terminal message display with markup parsing
   - Widget panel layout
   - Map canvas rendering

5. **Browser API Integration:**
   - Popup window management
   - Voice recognition
   - File uploads (ticket screenshots)
   - Tab/window communication (postMessage)

6. **Client-Side Validation:**
   - Command syntax validation before sending
   - Input sanitization for display
   - UI feedback (e.g., "Not connected" warning)

**Evidence:**
- `public/js/widgets/widget_manager.js:136-142` - Widget state saved to localStorage
- `public/js/main.js:123-2655` - Command normalization (client-side)
- `public/js/components/Terminal.js:19-23` - Voice recognition setup (client-only API)
- `public/js/core/Game.js:701-703` - Connection check before sending (client validation)

---

## 7. Specify how UI updates and reactivity must behave.

**UI Update Model:** **Event-driven imperative updates (not reactive framework)**

**Reactivity:**
- **Alpine.js** used ONLY for widget manager state (`widget_manager.js`) - minimal reactive usage
- **All other components** use imperative DOM updates via `innerHTML`, `classList`, `appendChild`, etc.
- Components call `render()` or update methods directly when MessageBus events fire

**Update Triggers:**
1. MessageBus event received → Component callback → DOM update
2. User interaction → Direct DOM update + optional server message
3. Widget manager Alpine.js reactivity → DOM class toggling

**Update Pattern:**
```javascript
subscribe('player:stats', (data) => {
    this.updateStats(data.stats);  // Imperative DOM update
});
```

**No Reactive Bindings:**
- No two-way data binding
- No virtual DOM
- Direct DOM manipulation is the standard

**Evidence:**
- `public/js/components/StatsWidget.js:31-34` - `innerHTML = ''` followed by imperative DOM construction
- `public/js/components/Terminal.js:90-99` - Subscription with callback that updates DOM
- `public/js/widgets/widget_manager.js:301-333` - Alpine.js reactivity ONLY for widget manager
- `public/game.html:505` - Alpine.js loaded but used minimally

---

## 8. Define rendering rules for widgets and dynamic components.

**Widget Rendering Rules:**

**Widget System:**
- Widgets are defined in `widget_registry.js` with metadata (id, name, slot, requirements)
- Widget visibility controlled by `widget_manager` Alpine.js component
- Widgets render in **4-slot grid** (standard widgets) or **full-width** (special widgets)
- Auto-managed widgets (NPC, Factory) shown/hidden by game state, not user toggle

**Widget Visibility Logic:**
1. Widget must be **available** (check `isWidgetAvailable()` - god mode, warehouse deed, factory room)
2. Widget must be **active** (in `activeWidgets` array, max 4)
3. Widget panel DOM element must have `hidden` class toggled

**Dynamic Component Rendering:**
- Components extend `Component` base class
- Components implement `init()` (DOM setup) and update methods (DOM updates)
- No templating system - direct DOM manipulation
- Terminal uses `Markup.parse()` for all message rendering (required)

**Rendering Order:**
1. `main.js` creates Game instance
2. Components instantiated with Game reference
3. Components call `init()` to attach DOM references
4. Components subscribe to MessageBus events
5. On event, components update DOM imperatively

**Evidence:**
- `public/js/widgets/widget_registry.js:22-151` - Widget definitions with availability requirements
- `public/js/widgets/widget_manager.js:338-381` - Widget panel visibility logic
- `public/js/components/StatsWidget.js:31-100` - Imperative DOM construction
- `public/js/components/Terminal.js:9` - Markup.parse() import (must be used)

---

## 9. Declare how Alpine.js (or equivalent) should be used.

**Alpine.js Usage:** **Minimal - widget manager only**

**Current Usage:**
- **ONLY** used for `widgetManager()` Alpine.js component (`widget_manager.js`)
- Widget manager tracks `activeWidgets` array reactively
- Widget manager updates DOM classes based on reactive state

**Where Alpine.js is NOT Used:**
- Terminal component (imperative DOM)
- StatsWidget (imperative DOM)
- MapWidget (canvas rendering)
- All other components (imperative DOM)
- No `x-data`, `x-show`, `x-if`, `x-for` directives in HTML (except widget manager)

**Alpine.js Pattern:**
```javascript
// widget_manager.js exports function that returns Alpine data object
export function widgetManager() {
    return {
        activeWidgets: [],
        toggleWidget(widgetId) { /* ... */ }
    };
}
// Made globally available: window.widgetManager = widgetManager
```

**Restriction:** Alpine.js should NOT be extended to other components. Standard is imperative DOM updates via Component class.

**Evidence:**
- `public/js/widgets/widget_manager.js:27-430` - Only Alpine.js component
- `public/game.html:505` - Alpine.js loaded from CDN
- `grep` results show no `x-data`, `x-show` directives in HTML
- All components use imperative DOM updates

---

## 10. Specify boundaries between gameplay UI and editor UI.

**Boundary: Separate HTML files and no shared components**

**Gameplay UI:**
- **Entry:** `public/index.html` (login/character selection)
- **Game View:** `public/game.html` (main game interface)
- **Location:** `public/` directory
- **Framework:** ES6 modules, Component class, MessageBus

**Editor UI:**
- **Location:** `protected/editors/` directory (separate from gameplay)
- **Files:** `map-editor.html`, `npc-editor.html`, `item-editor.html`, etc.
- **Access:** God mode players only, opened via popup from character selection
- **No Shared Code:** Editors use separate JS files in `protected/editors/` (no imports from `public/js/`)

**Access Pattern:**
- Character selection screen detects god mode
- God mode players get 4-quadrant button (game/map-editor/npc-editor/item-editor)
- Clicking editor quadrant opens popup with editor URL

**Evidence:**
- `public/index.html:516-564` - `selectCharacterForMode()` opens editor popups
- `public/index.html:433-480` - God mode quadrant buttons for editors
- Project structure shows `protected/editors/` separate from `public/`
- No editor imports found in `public/js/` components

---

## 11. Define how the frontend loads schemas, formulas, or config.

**Config Loading:** **On-demand fetch from API endpoints with localStorage caching**

**Pattern:**
1. Component needs config → calls `fetch('/api/endpoint')`
2. On success → parse JSON and use
3. On failure → fall back to `localStorage` cache if available
4. Cache result in `localStorage` for offline/fallback

**Current Examples:**
- **Custom Markup Conventions:** `fetch('/api/markup/conventions')` → cache in `localStorage` key `'customMarkupConventions'` (`public/js/utils/Markup.js:73-130`)
- **Widget Config:** Received via WebSocket `widgetConfig` message (`public/js/core/Game.js:496-500`)
- **No formulas/schemas loaded:** Formulas computed server-side, not exposed to client

**No Pre-loading:** Configs loaded when needed, not at page load.

**Evidence:**
- `public/js/utils/Markup.js:66-130` - `loadCustomConventions()` with fetch + localStorage fallback
- `public/js/core/Game.js:496-500` - Widget config via WebSocket (not fetch)
- No schema loading code found in codebase
- No formula loading code found (server-side only)

---

## 12. State error display and user feedback standards.

**Error Display Standards:**

**Terminal Errors:**
- Errors shown in terminal via `terminal.addMessage(message, 'error')`
- Error messages parsed through `Markup.parse()` (same as regular messages)
- Errors appear in terminal scroll area, not separate error panel

**Connection Errors:**
- "Not connected to server. Please wait..." shown in terminal (`main.js:90`)
- Connection warnings throttled (5 second cooldown) (`main.js:78-92`)

**Form Errors:**
- Error divs with class `error-message` (red text, `#d32f2f` color)
- Errors shown inline below form fields
- Example: `#loginError`, `#registerError` in `index.html`

**Widget Errors:**
- Console.error for developer debugging
- User-facing errors shown in widget content or terminal
- Factory widget shows messages in widget (`FactoryWidget.js:494`)

**Error Handling:**
- Try/catch blocks log to console but do not show user alerts
- Failed operations silently fail or show terminal message
- No global error handler (components handle their own errors)

**Evidence:**
- `public/style.css:121-126` - `.error-message` styling (red, `#d32f2f`)
- `public/js/main.js:78-92` - Connection error with cooldown
- `public/js/components/Terminal.js` - Error messages via `addMessage(..., 'error')`
- `public/game.html:23` - Error div in login form

---

## 13. Specify network interaction rules (polling, websockets, fetch).

**Network Interaction Rules:**

**Primary: WebSocket (Game State)**
- **Protocol:** WebSocket (`ws://` or `wss://` based on page protocol)
- **URL:** `location.host` (same origin)
- **Purpose:** All game state updates, real-time events
- **Reconnection:** Auto-reconnect after 3 seconds on disconnect (`Game.js:237-243`)
- **Authentication:** Sends `authenticateSession` on connect

**Secondary: Fetch API (HTTP)**
- **Purpose:** Config loading, API calls (markup conventions, ticket operations)
- **Tab ID:** All fetch requests include `X-Tab-ID` header (overridden globally) (`Game.js:65-80`)
- **Credentials:** `credentials: 'include'` for authenticated requests

**No Polling:**
- No `setInterval` for state polling
- Only polling is session validity check (every 2 seconds) for multi-tab detection (`index.html:120-156`)
- Only polling is active windows check (every 3 seconds) for character selection (`index.html:983-1019`)

**Rules:**
1. WebSocket for all gameplay state
2. Fetch for config/API calls
3. No polling for game state
4. Tab ID must be included in all requests

**Evidence:**
- `public/js/core/Game.js:28-29` - WebSocket URL construction
- `public/js/core/Game.js:65-80` - Fetch override with tab ID
- `public/js/core/Game.js:237-243` - Auto-reconnection
- `public/index.html:122-156` - Session validity polling (non-game state)

---

## 14. Define canonical lifecycle hooks for pages/widgets.

**Component Lifecycle:**

**Base Component Class:**
1. **Constructor:** Receives Game instance, sets up MessageBus reference
2. **init():** Override to set DOM references, attach event listeners, subscribe to MessageBus
3. **render():** Override to update DOM (called manually, not automatic)
4. **destroy():** Override to clean up subscriptions, remove listeners

**No Automatic Lifecycle:**
- No `mounted()`, `unmounted()`, `updated()` hooks
- Lifecycle is manual: components call `init()` after instantiation, update methods when events fire

**Widget Lifecycle (Alpine.js):**
- **init():** Alpine.js calls when component initializes
- Reactive updates trigger DOM changes automatically (Alpine.js handles)

**Page Lifecycle:**
- `index.html`: `checkAuth()` on page load (`index.html:1038`)
- `game.html`: `main.js` runs immediately (module script)

**Evidence:**
- `public/js/core/Component.js:23-44` - Component base class lifecycle methods
- `public/js/main.js:42-50` - Components call `init()` manually
- `public/js/widgets/widget_manager.js:54-74` - Alpine.js `init()` hook
- `public/index.html:166-203` - `checkAuth()` on page load

---

## 15. State performance expectations and optimization priorities.

**Performance Expectations:**

**Optimization Priorities (implied by code):**

1. **Message Throttling:**
   - Connection warnings: 5 second cooldown (`main.js:78`)
   - Disconnect messages: shown once per disconnect session (`Game.js:32, 224-227`)

2. **Local Caching:**
   - Markup conventions cached in localStorage (`Markup.js:77`)
   - Widget state cached in localStorage (`widget_manager.js:136`)

3. **DOM Updates:**
   - Terminal uses `innerHTML` (may cause reflows but acceptable for terminal)
   - No virtual DOM (direct manipulation for simplicity)

4. **No Performance Optimizations Found:**
   - No debouncing of input handlers
   - No request batching
   - No lazy loading of components
   - No code splitting

**Performance Assumptions:**
- Real-time WebSocket updates acceptable (server controls rate)
- Terminal scroll performance acceptable (may slow with many messages)
- Widget re-renders acceptable (imperative updates are fast enough)

**Evidence:**
- `public/js/main.js:78` - Connection warning cooldown
- `public/js/core/Game.js:32` - Disconnect message flag
- `public/js/utils/Markup.js:77` - localStorage caching
- No performance monitoring code found

---

## 16. Declare how components communicate with one another.

**Component Communication: MessageBus pub/sub only**

**Pattern:**
1. Component A needs to notify Component B → Component A emits MessageBus event
2. Component B subscribes to event → receives data in callback
3. No direct component-to-component references (except Game instance shared)

**Communication Methods:**
- **MessageBus Events:** Primary method (e.g., `messageBus.emit('room:update', data)`)
- **Global Window Objects:** Limited use (`window.game`, `window.terminal`)
- **Shared Game Instance:** Components receive Game in constructor, can call `game.send()`

**No Direct Communication:**
- Components do NOT hold references to other components
- Components do NOT call methods on other components directly
- All inter-component communication via MessageBus

**Evidence:**
- `public/js/core/Component.js:66-72` - `emit()` method for MessageBus
- `public/js/components/Terminal.js:90-99` - Subscribing to multiple events
- `public/js/core/Game.js:252-264` - Game emits `room:update` event
- No component-to-component direct calls found

---

## 17. Define mutability rules for client-side state.

**Mutability Rules:**

**Server State (Immutable from Client):**
- Player stats, room data, inventory - **read-only** on client
- Client receives updates, never modifies server state directly
- All mutations sent via WebSocket messages to server

**Local UI State (Mutable):**
- Widget visibility/active state - **mutable** via widget manager
- Terminal scroll lock - **mutable** via toggle
- Command input value - **mutable** (user input)
- Component internal state (e.g., `currentRoomId` in Game) - **mutable** for tracking

**State Update Rules:**
1. Server state → Update via MessageBus events only
2. Local UI state → Update directly in component
3. Shared local state (widgets) → Update via widget manager

**No State Validation:**
- Client does not validate server state
- Client trusts server messages
- Client does not sync-check or validate state consistency

**Evidence:**
- `public/js/core/Game.js:252` - `currentRoomId` updated from server message
- `public/js/components/StatsWidget.js:31` - Stats cleared and rebuilt from server data
- `public/js/widgets/widget_manager.js:210-244` - Widget state mutated directly
- No state validation code found

---

## 18. Specify how the UI should behave when desynced.

**Desync Handling: Not explicitly implemented**

**Current Behavior:**
- **No desync detection:** Client does not check for state inconsistencies
- **Server authority:** Client always accepts server messages as truth
- **No rollback:** If client state differs from server, server message overwrites it
- **Reconnection:** On reconnect, server sends current state, client replaces local state

**Implicit Desync Resolution:**
- Server messages overwrite client state
- Components rebuild DOM from server data on every update
- No optimistic updates (client doesn't predict state)

**Missing:**
- No desync detection logic
- No conflict resolution
- No "state out of sync" warnings
- No state comparison checks

**Evidence:**
- `public/js/core/Game.js:249-264` - Server messages directly update state
- `public/js/components/StatsWidget.js:34` - Stats cleared and rebuilt (no merge logic)
- No desync detection code found
- No state comparison code found

---

## 19. Declare theming and style system responsibilities.

**Theming System: Single CSS file, no theming system**

**Style System:**
- **Single CSS file:** `public/style.css` (5868 lines)
- **No CSS preprocessor:** Plain CSS
- **No CSS modules:** Global styles
- **No theming variables:** Hard-coded colors (e.g., `#00ff00`, `#1a1a1a`, `#667eea`)
- **No dark/light mode:** Single dark theme only

**Styling Approach:**
- **Class-based:** Components use CSS classes (e.g., `.widget`, `.terminal`, `.error-message`)
- **Inline styles:** Limited use for dynamic values (e.g., progress bars)
- **No CSS-in-JS:** Styles in separate CSS file

**Color Scheme (from CSS):**
- Background: `#1a1a1a` (dark)
- Text: `#00ff00` (green terminal)
- Accent: `#667eea` (purple)
- Error: `#d32f2f` (red)

**Responsibility:**
- CSS file defines all visual styling
- Components add/remove classes for state changes
- No runtime style generation (except inline for dynamic values)

**Evidence:**
- `public/style.css:1-5868` - Single CSS file
- `public/style.css:7-13` - Body styling with hard-coded colors
- `public/style.css:121-126` - Error message styling
- No CSS variables or theming code found

---

## 20. State enforcement level: guideline, standard, or canonical law.

**Enforcement Level: Standard (with some canonical requirements)**

**Canonical Law (Must Follow):**
1. **MessageBus for all events:** All component communication via MessageBus (enforced by Component base class)
2. **Markup.parse() for terminal messages:** All terminal messages MUST use Markup.parse() (enforced by Terminal component)
3. **Component extends Component:** All UI components MUST extend Component base class
4. **WebSocket for game state:** All game state updates via WebSocket (no polling)
5. **Tab ID in requests:** All fetch requests include X-Tab-ID header (enforced by fetch override)

**Standard (Should Follow):**
1. **Imperative DOM updates:** Standard pattern (not enforced, but consistent)
2. **Alpine.js minimal usage:** Standard (only widget manager)
3. **localStorage for preferences:** Standard pattern
4. **Error display in terminal:** Standard pattern

**Guideline (Recommended):**
1. **Component lifecycle:** init(), render(), destroy() pattern
2. **File organization:** Components in `components/`, utils in `utils/`
3. **Naming conventions:** camelCase for methods, kebab-case for CSS classes

**Evidence:**
- `public/js/core/Component.js:8-85` - Component base class enforces MessageBus pattern
- `public/js/components/Terminal.js:9` - Markup.parse() import (required)
- `public/js/core/Game.js:65-80` - Fetch override enforces tab ID
- Codebase consistency shows standards followed but not strictly enforced

---

## Summary of Strengths, Weaknesses, Risks

### Strengths:
- Clear separation of concerns (Game, MessageBus, Components)
- Consistent event-driven architecture
- Server-driven state prevents client-side cheating
- Modular component system

### Weaknesses:
- No desync detection or handling
- No performance optimizations (debouncing, batching)
- Large single CSS file (5868 lines)
- No error boundaries or global error handling
- Limited Alpine.js usage inconsistent with full reactive approach

### Risks:
- Terminal performance may degrade with many messages (innerHTML usage)
- No state validation (client trusts server completely)
- Manual lifecycle management (easy to forget cleanup)
- No testing infrastructure visible

---

## File Reference Summary

**Core Files:**
- `public/js/core/Game.js` - WebSocket and message routing
- `public/js/core/MessageBus.js` - Event system
- `public/js/core/Component.js` - Base component class
- `public/js/main.js` - Entry point

**Component Files:**
- `public/js/components/*.js` - All UI components

**Widget Files:**
- `public/js/widgets/widget_manager.js` - Widget visibility manager
- `public/js/widgets/widget_registry.js` - Widget definitions

**HTML Files:**
- `public/index.html` - Login/character selection
- `public/game.html` - Main game interface

**Style Files:**
- `public/style.css` - All styles

---

**End of Canonical Spec**

