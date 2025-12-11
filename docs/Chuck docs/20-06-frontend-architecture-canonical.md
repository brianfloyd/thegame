# 210 — Canonical Frontend Architecture Specification
_For Cursor and future AI work on the client layer_

This document turns the Q&A analysis in **`999-frontend-architecture-canonical.md`** into a **single canonical spec** for how the frontend of the game is structured and must behave. Cursor should treat this as **law** when generating or refactoring client code.

---

## 1. Canonical Purpose of the Frontend

The frontend is a **server-driven UI** for The Game. Its job is to:
- Maintain a **WebSocket connection** to the server
- Receive JSON messages from the server and turn them into MessageBus events
- Render those events through modular UI components (widgets + terminal)
- Manage **local UI state only** (widget visibility, scroll lock, text input, etc.)

**The server decides game state. The client displays it.**

---

## 2. Core Modules & Required Components

### 2.1 Core System
- **Game** (`core/Game.js`)
  - Manages WebSocket connection
  - Routes inbound messages
  - Sends outbound messages
  - Holds minimal global client state (e.g., `currentRoomId`)

- **MessageBus** (`core/MessageBus.js`)
  - Central pub/sub event hub
  - All components communicate via events, not direct calls

- **Component** (`core/Component.js`)
  - Base class for all UI components
  - Provides `subscribe`, `emit`, and lifecycle hooks (`init`, `destroy`)

- **Entry Point** (`main.js`)
  - Creates the `Game` instance
  - Instantiates all components
  - Calls `init()` on each component
  - Wires global references (`window.game`, `window.terminal`, etc.)

### 2.2 Primary UI Components (All Extend `Component`)
- `Terminal` — text output + command echo + error display
- `StatsWidget` — player stats/resources/flags
- `MapWidget` — map canvas
- `CompassWidget` — directional navigation state
- `CommsWidget` — chat/comms feed
- `Inventory` — inventory list and encumbrance
- `NPCWidget` — NPC activity / harvest
- `FactoryWidget` — factory crafting UI
- `TicketsWidget` — ticketing (god mode only)

### 2.3 Widget System
- **Widget Registry** (`widgets/widget_registry.js`)
  - Declares all widgets, their IDs, slots, availability rules (god mode, warehouse deed, room type, etc.)

- **Widget Manager** (`widgets/widget_manager.js`)
  - Alpine.js component that tracks which widgets are active
  - Handles visibility, slot limits, and persistence in `localStorage`

### 2.4 Utilities
- `MapRenderer` — renders map to canvas
- `Markup` — parses and renders terminal markup

All new frontend features must slot into this structure rather than inventing their own patterns.

---

## 3. State Management Strategy

The frontend uses a **hybrid model**:

1. **Server-driven state (authoritative):**
   - Player stats
   - Room data
   - Inventory
   - NPCs, items in room
   - Factory states, harvest states, echoes, etc.
   - Comes **only** via WebSocket messages

2. **Local UI state (non-authoritative):**
   - Widget visibility (persisted to `localStorage`)
   - Terminal scroll lock
   - Command input contents
   - Tab ID for multi-tab tracking (`sessionStorage`)
   - Cached markup config (`localStorage`)

Rules:
- Server state is **never mutated directly** by the client
- UI state is free to mutate locally but must not be treated as game truth

---

## 4. WebSocket + MessageBus Event Model

### 4.1 WebSocket Layer
- Single WebSocket connection per tab
- URL derived from `location.host` and page protocol
- On connect, client sends `authenticateSession` with `windowId`/tab ID
- On message:
  - JSON is parsed
  - `Game.handleMessage()` dispatches based on `type`
  - Appropriate MessageBus event(s) are emitted
- On disconnect:
  - Game shows a disconnect notice
  - Attempts auto-reconnect after a delay

### 4.2 MessageBus Layer
- All inter-component communication goes through MessageBus
- Pattern:
  - Server → WebSocket message (e.g., `type: "roomUpdate"`)
  - Game → `MessageBus.emit('room:update', payload)`
  - Components → `subscribe('room:update', callback)`

### 4.3 Naming Conventions
- Server messages: `camelCase` types (`roomUpdate`, `playerStats`, `terminalMessage`, etc.)
- Frontend events: `namespace:action` (`room:update`, `player:stats`, `terminal:message`)

Cursor must preserve this two-tier event model when adding new behavior.

---

## 5. Client-Only Responsibilities

The frontend must **never** implement game logic. Its responsibilities are limited to:

1. **UI State & Layout**
   - Toggling widgets on/off and layout (slots, full-width widgets)
   - Handling scroll lock, popups, modals

2. **User Input Processing**
   - Command normalization before send
   - Keyboard shortcuts (e.g., repeat last command)
   - Voice input handling (when enabled)

3. **Rendering**
   - Updating DOM in response to MessageBus events
   - Drawing map canvas
   - Rendering text with markup

4. **Local Persistence**
   - Saving UI preferences to `localStorage` or `sessionStorage`

5. **Browser Integrations**
   - File upload for tickets
   - Multiple window/tab behaviors

Game rules, formulas, cooldowns, and authoritative checks **must stay on the server**.

---

## 6. UI Update & Reactivity Model

### 6.1 Imperative DOM Updates (Standard)
- Components extend `Component`
- They:
  - Capture DOM references on `init()`
  - Subscribe to one or more MessageBus events
  - On event, they imperatively update DOM via `innerHTML`, `appendChild`, `classList`, etc.
- No virtual DOM, no diffing, no framework-level reactivity

### 6.2 Alpine.js Scope
- Alpine.js is **used only** for the widget manager
- No other components may adopt Alpine.js or similar reactivity without explicit direction

**Rule:**
> For everything except the widget manager, the canonical pattern is: _MessageBus event → component callback → imperative DOM update._

---

## 7. Widget Rendering Rules

### 7.1 Widget Registry Contract
Each widget entry defines:
- `id` — must match DOM and component logic
- `name` — label for UI
- `slot` — `standard`, `special`, `fullwidth`
- `requiresGod`, `requiresWarehouse`, `requiresFactory`, etc.
- `autoManaged` — if true, shown/hidden by game state
- `defaultActive` — if true, active on first load
- `order` — display ordering in toggle bar

### 7.2 Widget Manager Behavior
- Tracks `activeWidgets` array (max 4 for standard widgets)
- Persists active widget list in `localStorage`
- Applies CSS classes to hide/show widget DOM containers
- Determines whether a widget is available based on:
  - God mode flag
  - Room type
  - Player flags (warehouse deed, etc.)

Any new widget must:
- Be declared in `widget_registry`
- Respect slot rules
- Respect availability rules

---

## 8. Gameplay UI vs Editor UI Boundaries

### 8.1 Gameplay UI
- Files in `public/`
- Main pages: `index.html` (login/character select), `game.html` (game)
- Uses core `Game`, `MessageBus`, `Component`, widgets

### 8.2 Editor UI (God Mode)
- Files in `protected/editors/`
- Opened as popups from character selection when player is God Mode
- Implement their **own JS** — do **not** import `public/js/components/*.js`
- Editors are **separate apps**, not in-game widgets

Rule:
> No gameplay component should depend on editor code, and editor UIs must not depend on gameplay components.

---

## 9. Network Interaction Rules

### 9.1 WebSocket
- Used for **all game state** changes
- No polling for gameplay state
- WebSocket is mandatory for real-time play

### 9.2 Fetch / HTTP
- Used for:
  - Loading markup conventions
  - Ticket-related APIs
  - Misc config where needed
- All fetch calls must include `X-Tab-ID` header (overridden globally in `Game.js`)

### 9.3 Polling
- Allowed **only** for session validity checks and multi-tab coordination on the login/character screen
- Never for core game state

---

## 10. Component Lifecycle & Communication

### 10.1 Component Lifecycle
Standard pattern:
1. Constructor: store `game`, set up MessageBus
2. `init()`: capture DOM elements, subscribe to events, attach listeners
3. Update methods: respond to events and manipulate DOM
4. `destroy()`: unsubscribe and clean up if necessary

There is no automatic mount/unmount system; lifecycle is manual.

### 10.2 Inter-Component Communication
- Must be **MessageBus-only** (no direct cross-component calls)
- Components may:
  - Emit events (`this.emit('terminal:message', data)`)
  - Subscribe to events (`this.subscribe('room:update', cb)`)

Limited globals exist (`window.game`, `window.terminal`) but should be **read-only helpers**, not a primary communication path.

---

## 11. Error & Feedback Standards

### 11.1 Errors in Gameplay
- Shown in terminal using `Terminal.addMessage(message, 'error')`
- Messages go through `Markup.parse()`

### 11.2 Form & UI Errors
- Displayed in inline error elements with `.error-message` styling
- Used primarily for login/register flows

### 11.3 Connection Errors
- A friendly "Not connected" style message in terminal
- Throttled so it doesn’t spam

No global error overlay; failures are communicated through terminal and component-level UI.

---

## 12. Styling & Theming

- Single CSS file: `style.css`
- Dark theme only (terminal green-on-dark + purple accents)
- Class-based styling, no CSS modules
- No CSS variables / theming system

Frontend changes should:
- Reuse existing classes when possible
- Avoid framework-specific styling systems
- Keep layout consistent: terminal ~2/3, widgets ~1/3 by default

---

## 13. Performance Expectations

- WebSocket message rates are controlled by the server
- Client must:
  - Avoid unnecessary re-renders
  - Use simple imperative DOM patterns
  - Cache expensive config (markup conventions, widget state) in localStorage
- It is acceptable for the terminal to be DOM-heavy, but mass reflows should be avoided where reasonable.

No additional performance layers (virtual DOM, memoization, etc.) are currently mandated.

---

## 14. Canonical Enforcement Levels

**Canonical law (must):**
- All gameplay state via WebSocket + MessageBus
- All UI components extend `Component`
- All inter-component communication via MessageBus
- Markup parsing for terminal output via `Markup.parse()`
- Widget availability/visibility managed exclusively by widget manager + registry
- Editor UIs live under `protected/editors/` and are **not** reused in-game

**Standards (should):**
- Imperative DOM updates
- Minimal Alpine.js usage (widget manager only)
- Errors surfaced through terminal when tied to gameplay

**Guidelines (recommended):**
- Keep new code consistent with existing file structure and naming
- Use MessageBus namespaces (`player:*`, `room:*`, `terminal:*`, `widget:*`)

---

## 15. TL;DR for Cursor

1. **Server speaks JSON → Game routes → MessageBus emits → Components render.**
2. The client never implements game logic; it is a **display + input** layer.
3. All UI pieces must flow through `Game`, `MessageBus`, `Component`, and the widget system.
4. New behavior must plug into this architecture, not bypass it.

If any new frontend design conflicts with this document, **this document wins.**

