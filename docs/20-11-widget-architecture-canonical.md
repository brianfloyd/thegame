# ✅ **WIDGET ARCHITECTURE - CANONICAL SPEC**

**Document Type:** Canonical Reference  
**Last Updated:** Based on codebase analysis  
**Purpose:** Complete specification of widget architecture, CSS structure, and blueprint for adding new widgets seamlessly to the widgets panel.

**Note:** For details on how existing widgets operate in gameplay, see `10-15-widget-operation-canonical.md`.

---

## 1. WIDGET ARCHITECTURE OVERVIEW

### 1.1 Widget File Structure
```
public/
├── js/
│   ├── core/
│   │   ├── WidgetManager.js      # Widget lifecycle and message routing
│   │   ├── Component.js          # Base class for DOM-based components (non-panel UI)
│   │   └── Game.js               # Game instance with MessageBus
│   └── widgets/
│       ├── Widget.js             # Base class for render-based widgets (ALL panel widgets)
│       ├── widget_registry.js    # Widget definitions and configuration
│       ├── StatsWidget.js        # Example render-based widget
│       ├── CommsWidget.js        # Example render-based widget
│       ├── NPCWidget.js          # Example auto-managed widget
│       └── FactoryWidget.js      # Example auto-managed widget
├── css/
│   └── widget-shared.css         # Shared CSS for all widgets
└── game.html                     # Links widget-shared.css
```

### 1.2 Architecture Patterns

**CRITICAL: Two Base Classes for Different Use Cases**

The codebase uses TWO different base classes for different purposes. Understanding when to use each is essential:

#### 1. **Widget** (`public/js/widgets/Widget.js`) - Render-based widgets
   - **USE FOR: ALL panel widgets** (widgets that appear in the right-side widget panel)
   - Implement `render()` to return DOM element
   - WidgetManager attaches/detaches DOM automatically
   - Receive messages via `onMessage()` callback from WidgetManager
   - Lifecycle: `init()` → `render()` → `onAttach()` → `onMessage()` → `onDetach()`
   - **Examples:** StatsWidget, MapWidget, CompassWidget, CommsWidget, TicketsWidget, NPCWidget, FactoryWidget
   - **Pattern:** Widget creates its own DOM structure in `render()`, WidgetManager manages lifecycle

#### 2. **Component** (`public/js/core/Component.js`) - DOM-based components
   - **USE FOR: Non-panel UI components** (components that are NOT in the widget panel)
   - Find existing DOM elements that are already in `game.html`
   - Subscribe to MessageBus directly using `subscribe()`
   - No `render()` method - DOM elements must already exist
   - **Examples:** Terminal (main game interface), Inventory (displays in terminal)
   - **Pattern:** Component finds existing DOM elements, subscribes to events directly

#### When to Use Each Pattern

**✅ USE WIDGET SYSTEM:**
- Creating a new widget for the right-side widget panel
- Widget should appear in widget toggle bar
- Widget needs to be managed by WidgetManager (auto-show/hide, toggle on/off)
- Widget should follow standard widget lifecycle
- **ALL panel widgets MUST use Widget system**

**✅ USE COMPONENT SYSTEM:**
- Creating UI that is NOT in the widget panel
- Component uses existing DOM elements in `game.html` (like `terminalContent`, `roomItemsDisplay`)
- Component needs direct MessageBus subscriptions
- Component is part of the main game interface (not a panel widget)
- **Examples:** Terminal, Inventory, or other non-panel UI components

#### Migration Rule

**If you're adding a new widget to the widget panel → Use Widget system**
**If you're adding UI that's not in the widget panel → Use Component system**

**DO NOT mix patterns:**
- ❌ Don't use Component for panel widgets
- ❌ Don't use Widget for non-panel components
- ✅ All panel widgets (standard, fullwidth, special/auto-managed) use Widget
- ✅ All non-panel components use Component

---

## 2. WIDGET CSS ARCHITECTURE

### 2.1 CSS File Location
**File:** `public/css/widget-shared.css`

**Inclusion:**
**File:** `public/game.html`
```html
<link rel="stylesheet" href="css/widget-shared.css">
```

### 2.2 Core Widget Structure CSS

**Base Widget Container:**
**File:** `public/css/widget-shared.css` (lines 12-24)
```css
.widget {
    position: relative;
    background: #1a1a1a;
    border: 2px solid #00ff00;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
    overflow: hidden;
    min-height: 0;
    height: 100%;
    font-family: 'Courier New', monospace;
}
```

**Widget Header:**
**File:** `public/css/widget-shared.css` (lines 27-38)
```css
.widget-header {
    color: #cccccc;  /* Light gray */
    text-align: center;
    padding: 8px;
    font-size: 0.85em;
    text-transform: uppercase;
    font-weight: bold;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
    pointer-events: none;
    user-select: none;
}
```

**Widget Content:**
**File:** `public/css/widget-shared.css` (lines 41-48)
```css
.widget-content {
    flex: 1;
    padding: 8px;
    overflow-y: auto;
    overflow-x: hidden;
    color: #00ff00;
    font-size: 10px;
}
```

### 2.3 Widget Theme Variants

**Standard Theme (Default - Green):**
**File:** `public/css/widget-shared.css` (lines 55-63)
```css
.widget-theme-standard {
    border-color: #00ff00;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
}
.widget-theme-standard .widget-header {
    color: #cccccc;
    border-bottom-color: #333;
}
```

**Factory Theme (Orange):**
**File:** `public/css/widget-shared.css` (lines 66-76)
```css
.widget-theme-factory {
    border-color: #ff8800;
    box-shadow: 0 0 15px rgba(255, 136, 0, 0.6);
    background: #0a0a0a;
}
.widget-theme-factory .widget-header {
    color: #cccccc;
    border-bottom-color: #ff8800;
    background: #1a1a1a;
}
```

**NPC Theme (Orange/Amber):**
**File:** `public/css/widget-shared.css` (lines 79-87)
```css
.widget-theme-npc {
    border-color: #ff8800;
    box-shadow: 0 0 15px rgba(255, 136, 0, 0.6);
}
.widget-theme-npc .widget-header {
    color: #cccccc;
    border-bottom-color: #663300;
}
```

**God Mode Theme (Yellow/Gold):**
**File:** `public/css/widget-shared.css` (lines 90-99)
```css
.widget-theme-godmode {
    border-color: #ffcc00;
    box-shadow: 0 0 15px rgba(255, 204, 0, 0.5);
}
.widget-theme-godmode .widget-header {
    color: #cccccc;
    border-bottom-color: #ffcc00;
    background: linear-gradient(135deg, #1a1a0a 0%, #2a2a0a 100%);
}
```

**Warehouse Theme:**
**File:** `public/css/widget-shared.css` (lines 102-110)
```css
.widget-theme-warehouse {
    border-color: #00ffff;
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
}
.widget-theme-warehouse .widget-header {
    color: #cccccc;
    border-bottom-color: #00ffff;
}
```

### 2.4 Standardized UI Components

**Buttons:**
**File:** `public/css/widget-shared.css` (lines 106-228)
- `.widget-btn` - Standard button
- `.widget-btn-primary` - Primary action (green)
- `.widget-btn-danger` - Destructive action (red)
- `.widget-btn-success` - Success action (green)
- `.widget-btn-small` - Compact button
- `.widget-btn-icon` - Icon-only button
- `.widget-btn-group` - Button container
- `.widget-mode-btn` - Mode/tab button (for CommsWidget)

**Modals:**
**File:** `public/css/widget-shared.css` (lines 318-450)
- `.broadcast-group-modal-overlay` - Full-screen modal overlay
- `.broadcast-group-modal` - Modal container
- `.broadcast-group-modal-header` - Modal header with title and close button
- `.broadcast-group-modal-content` - Scrollable content area
- `.broadcast-group-modal-footer` - Footer with action buttons
- `.broadcast-group-players-list` - Scrollable list container
- `.broadcast-group-member-item` - Member list item with remove button
- `.broadcast-group-selected-chip` - Selected player chip with remove button

**Inputs:**
**File:** `public/css/widget-shared.css` (lines 234-277)
- `.widget-input` - Text input
- `.widget-select` - Dropdown select
- `.widget-textarea` - Multi-line textarea
- `.widget-input-group` - Input with button side-by-side

**Text & Formatting:**
**File:** `public/css/widget-shared.css` (lines 284-350)
- `.widget-section` - Section container
- `.widget-section-title` - Section header
- `.widget-stat-row` - Stat display row
- `.widget-stat-label` - Stat label
- `.widget-stat-value` - Stat value
- `.widget-text-primary` - Primary text color
- `.widget-text-secondary` - Secondary text color
- `.widget-text-muted` - Muted text color

**Progress Indicators:**
**File:** `public/css/widget-shared.css` (lines 357-420)
- `.widget-progress` - Progress bar container
- `.widget-progress-bar` - Progress bar fill
- `.widget-progress-label` - Progress text label

**Lists & Tables:**
**File:** `public/css/widget-shared.css` (lines 427-500)
- `.widget-list` - List container
- `.widget-list-item` - List item
- `.widget-table` - Table container
- `.widget-table-header` - Table header row
- `.widget-table-row` - Table data row
- `.widget-table-cell` - Table cell

---

## 3. WIDGET REGISTRY STRUCTURE

### 3.1 Registry File
**File:** `public/js/widgets/widget_registry.js`

### 3.2 Widget Definition Format
```javascript
{
    id: 'unique-widget-id',           // Required: Unique identifier
    name: 'Display Name',            // Required: Human-readable name
    icon: 'M12 12...',               // Required: SVG path data (or '' for fallback)
    slot: 'standard',                // Required: 'standard', 'fullwidth', or 'special'
    requiresGod: false,              // Optional: Only for god mode players
    requiresWarehouse: false,        // Optional: Only with warehouse deed
    requiresFactory: false,          // Optional: Only in factory rooms
    autoManaged: false,              // Optional: Auto-show/hide based on state
    defaultActive: false,            // Optional: Active by default
    order: 100                       // Required: Display order (lower = earlier)
}
```

### 3.3 Slot Types
- **`'standard'`** - Normal widget, appears in standard widget panel (single slot width)
- **`'fullwidth'`** - Wide widget, takes full width (spans 2 columns)
- **`'special'`** - Auto-managed widgets (NPC, Factory) - uses special slot

**Dynamic Width:**
- CommsWidget uses `widget-fullwidth` class to expand to 2 slots when broadcast mode is selected
- Applied via `this.rootElement.classList.add('widget-fullwidth')` in `setCommMode()`
- Removed when switching to other modes

### 3.4 Registry Functions
**File:** `public/js/widgets/widget_registry.js` (lines 162-246)
- `getWidgetById(id)` - Get widget definition by ID
- `getToggleableWidgets()` - Get widgets that can be toggled
- `getAutoManagedWidgets()` - Get auto-managed widgets
- `getAvailableWidgets(playerState)` - Get widgets available to player
- `getDefaultActiveWidgets(playerState)` - Get default active widgets
- `isWidgetAvailable(widgetId, playerState)` - Check if widget available

---

## 4. WIDGET MANAGER INTEGRATION

### 4.1 WidgetManager Import
**File:** `public/js/core/WidgetManager.js` (lines 9-19)
```javascript
import StatsWidget from '../widgets/StatsWidget.js';
import MapWidget from '../widgets/MapWidget.js';
// ... all widget imports
```

**Widget Class Mapping:**
**File:** `public/js/core/WidgetManager.js` (lines 22-34)
```javascript
const WIDGET_CLASSES = {
    stats: StatsWidget,
    map: MapWidget,
    // ... all widget classes
};
```

### 4.2 Initialization
**File:** `public/js/main.js` (lines 33-35)
```javascript
game.widgetManager = new WidgetManager(game, WIDGETS);
game.widgetManager.mountAll();
```

---

## 5. BLUEPRINT: ADDING A NEW WIDGET

### 5.1 Step-by-Step Process

#### Step 1: Create Widget Class File
**Location:** `public/js/widgets/YourWidget.js`

**For Render-Based Widget (Required for ALL panel widgets):**
```javascript
import Widget from './Widget.js';

export default class YourWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        // Initialize widget state (NO DOM lookups)
        this.yourData = null;
    }
    
    init() {
        super.init();
        // Set up widget state only (NO DOM lookups)
    }
    
    render() {
        // Create root element
        const root = document.createElement('div');
        root.className = 'widget widget-yourwidget';
        root.setAttribute('data-widget', 'yourwidget');
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Your Widget';
        root.appendChild(header);
        
        // Create content
        const content = document.createElement('div');
        content.className = 'widget-content';
        content.id = 'yourWidgetContent';
        root.appendChild(content);
        
        return root;
    }
    
    onAttach() {
        // Get DOM references
        this.content = this.rootElement.querySelector('#yourWidgetContent');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize widget behavior
        this.loadData();
    }
    
    onDetach() {
        // Clean up event listeners
        if (this._eventHandler) {
            this.rootElement.removeEventListener('click', this._eventHandler);
        }
    }
    
    onMessage(msg) {
        // Handle backend messages
        if (msg.type === 'yourMessageType') {
            this.updateWidget(msg.data);
        }
    }
    
    setupEventListeners() {
        // Use event delegation to avoid losing listeners on re-render
        this._eventHandler = (e) => {
            // Handle clicks
        };
        this.rootElement.addEventListener('click', this._eventHandler);
    }
    
    updateWidget(data) {
        if (!this.content) return;
        // Update widget display
    }
    
    loadData() {
        // Request data from server if needed
        this.game.send({ type: 'getYourData' });
    }
}
```

**For Component-Based Component (ONLY for non-panel UI - NOT for widgets):**
```javascript
import Component from '../core/Component.js';

export default class YourComponent extends Component {
    constructor(game) {
        super(game);
        // Initialize state
    }
    
    init() {
        super.init();
        
        // Subscribe to MessageBus events directly
        this.subscribe('room:update', (data) => this.handleRoomUpdate(data));
        
        // Find existing DOM elements (must exist in game.html)
        this.widget = document.getElementById('your-component');
        this.content = document.getElementById('yourComponentContent');
    }
    
    handleRoomUpdate(data) {
        // Update component based on data
        if (this.content) {
            this.content.innerHTML = 'Updated content';
        }
    }
}
```

**NOTE:** Component pattern is ONLY for non-panel UI components (like Terminal, Inventory).
**ALL panel widgets MUST use Widget system above.**

#### Step 2: Add Widget to Registry
**File:** `public/js/widgets/widget_registry.js`

Add to `WIDGETS` array:
```javascript
{
    id: 'yourwidget',
    name: 'Your Widget',
    icon: 'M12 12...',  // SVG path or '' for first letter
    slot: 'standard',   // or 'fullwidth' or 'special'
    requiresGod: false,
    requiresWarehouse: false,
    requiresFactory: false,
    autoManaged: false,  // true for auto-show/hide
    defaultActive: false,
    order: 120          // Unique order number
}
```

#### Step 3: Import Widget in WidgetManager
**File:** `public/js/core/WidgetManager.js`

Add import at top:
```javascript
import YourWidget from '../widgets/YourWidget.js';
```

Add to `WIDGET_CLASSES` mapping:
```javascript
const WIDGET_CLASSES = {
    // ... existing widgets
    yourwidget: YourWidget
};
```

#### Step 4: Add Message Routing (If Needed)
**File:** `public/js/core/WidgetManager.js`

If your widget needs new message types, add to `subscribeToGameEvents()` method:
```javascript
this.messageBus.on('yourEvent', (data) => {
    this.handleMessage({ type: 'yourMessageType', ...data });
});
```

#### Step 5: Add CSS Theme (Optional)
**File:** `public/css/widget-shared.css`

If widget needs unique theme:
```css
/* Your Widget Theme */
.widget-theme-yourwidget {
    border-color: #yourcolor;
    box-shadow: 0 0 15px rgba(yourcolor, 0.5);
}

.widget-theme-yourwidget .widget-header {
    color: #cccccc;
    border-bottom-color: #yourcolor;
}
```

Apply theme in `render()`:
```javascript
root.className = 'widget widget-yourwidget widget-theme-yourwidget';
```

#### Step 6: Use Standardized CSS Classes
Use shared CSS classes for consistent styling:
- `.widget-btn`, `.widget-btn-primary` for buttons
- `.widget-input` for inputs
- `.widget-section`, `.widget-section-title` for sections
- `.widget-stat-row`, `.widget-stat-label`, `.widget-stat-value` for stats
- `.widget-table` for tables
- `.widget-progress` for progress bars
- `.toggle-switch`, `.toggle-slider`, `.toggle-label` for toggle switches (canonical pattern)

**Toggle Switch Example (REQUIRED structure):**
```html
<label class="toggle-switch">
    <input type="checkbox" id="myToggle">
    <span class="toggle-slider"></span>
    <span class="toggle-label">Enable Feature</span>
</label>
```

**Implementation Notes:**
- The checkbox MUST be the first child of the label
- The slider MUST be the immediate next sibling (for CSS selector `input:checked + .toggle-slider` to work)
- The label can be placed after the slider
- CSS is located in `public/css/widget-shared.css` and matches `editor-core.css` exactly
- All toggle switches automatically get sliding animation and green highlight when checked

**All widgets MUST use this exact toggle switch structure and CSS to match editor style.**

---

## 6. WIDGET DOM STRUCTURE

### 6.1 Standard Widget Structure
```html
<div class="widget widget-[id]" data-widget="[id]">
    <div class="widget-header">Widget Title</div>
    <div class="widget-content">
        <!-- Widget content here -->
    </div>
</div>
```

### 6.2 Widget Host Container
**File:** `public/js/core/WidgetManager.js` (lines 168-176)
- Container ID: `#widget-host`
- Located in: `.right-panel`
- Widgets inserted in order by `order` field

### 6.3 Toggle Bar Structure
**File:** `public/js/core/WidgetManager.js` (lines 221-287)
- Container: `.widget-toggle-bar`
- Icons: `.widget-icon` buttons
- Active state: `.active` class
- Hidden state: `.hidden` class

---

## 7. MESSAGE ROUTING ARCHITECTURE

### 7.1 Message Flow
1. **Game events** → MessageBus emits events
2. **WidgetManager subscribes** → Listens to MessageBus
3. **WidgetManager routes** → Calls `widget.onMessage(msg)` on all relevant widgets
4. **Widget handles** → Widget processes message in `onMessage()` method

### 7.2 Adding Message Types
**File:** `public/js/core/WidgetManager.js` (lines 57-150)

To route new message type:
1. Subscribe to MessageBus event in `subscribeToGameEvents()`
2. Call `this.handleMessage({ type: 'yourType', ...data })`
3. Widgets handle in their `onMessage()` method

**Example:**
```javascript
this.messageBus.on('yourEvent', (data) => {
    this.handleMessage({ type: 'yourMessageType', ...data });
});
```

Then in your widget:
```javascript
onMessage(msg) {
    if (msg.type === 'yourMessageType') {
        // Handle the message
    }
}
```

---

## 8. WIDGET VISIBILITY LOGIC

### 8.1 Regular Widgets
**File:** `public/js/core/WidgetManager.js` (lines 487-497)
- Check requirements (`requiresGod`, `requiresWarehouse`, `requiresFactory`)
- Check toggle state (`activeWidgets.has(widgetId)`)
- Attach if both conditions met
- User controls visibility via toggle bar

### 8.2 Auto-Managed Widgets (Conditional Widgets)
**File:** `public/js/core/WidgetManager.js` (lines 477-485)
- Visibility controlled by widget's internal state
- Widget sets visibility state in message handlers
- WidgetManager checks widget's state properties to determine visibility
- **NPC Widget Example:**
  - Widget sets `this.activeNPC = npc` when NPC has active harvest/cooldown
  - Widget sets `this.activeNPC = null` when no active NPC
  - WidgetManager checks: `shouldShow = !!widget.activeNPC`
- **Factory Widget Example:**
  - Widget sets `this.inFactoryRoom = true` when room type is 'factory'
  - Widget sets `this.inFactoryRoom = false` when not in factory room
  - WidgetManager checks: `shouldShow = widget.inFactoryRoom !== undefined ? widget.inFactoryRoom : this.playerState.inFactoryRoom`
- **CRITICAL:** Auto-managed widgets MUST set their visibility state properties in message handlers
- WidgetManager calls `updateVisibility()` after routing messages, so widgets have a chance to update state first

**Implementation Pattern for Auto-Managed Widgets:**
```javascript
// In widget's onMessage()
onMessage(msg) {
    if (msg.type === 'roomUpdate') {
        // Check conditions for visibility
        const shouldShow = this.checkVisibilityConditions(msg.data);
        this.visible = shouldShow; // Set state property
        
        // Update display if attached
        if (this.attached) {
            this.updateDisplay();
        }
    }
}

// WidgetManager checks this property in updateVisibility()
```

---

## 9. CSS CLASS REFERENCE

### 9.1 Core Structure Classes
- `.widget` - Base widget container
- `.widget-header` - Widget title header
- `.widget-content` - Widget content area
- `.widget-theme-[name]` - Theme variant

### 9.2 Button Classes
- `.widget-btn` - Standard button
- `.widget-btn-primary` - Primary action
- `.widget-btn-danger` - Destructive action
- `.widget-btn-success` - Success action
- `.widget-btn-small` - Small button
- `.widget-btn-icon` - Icon button
- `.widget-btn-group` - Button container
- `.widget-mode-btn` - Mode/tab button

### 9.3 Input Classes
- `.widget-input` - Text input
- `.widget-select` - Dropdown
- `.widget-textarea` - Textarea
- `.widget-input-group` - Input with button

### 9.4 Layout Classes
- `.widget-section` - Section container
- `.widget-section-title` - Section header
- `.widget-stat-row` - Stat row
- `.widget-stat-label` - Stat label
- `.widget-stat-value` - Stat value

### 9.5 Progress Classes
- `.widget-progress` - Progress container
- `.widget-progress-bar` - Progress bar
- `.widget-progress-label` - Progress label

### 9.6 Table Classes
- `.widget-table` - Table container
- `.widget-table-header` - Header row
- `.widget-table-row` - Data row
- `.widget-table-cell` - Table cell

### 9.7 List Classes
- `.widget-list` - List container
- `.widget-list-item` - List item

### 9.8 Toggle Switch Classes (Canonical)
- `.toggle-switch` - Toggle switch container (label element)
- `.toggle-slider` - Visual slider element
- `.toggle-label` - Label text next to toggle
- `.toggle-switch--small` - Small variant (36x18px)

**Canonical HTML Structure (REQUIRED):**
```html
<label class="toggle-switch">
    <input type="checkbox" id="toggle_xxx">
    <span class="toggle-slider"></span>
    <span class="toggle-label">Label Text</span>
</label>
```

**CSS Location:** `public/css/widget-shared.css` (matches `editor-core.css` pattern exactly)

**CSS Variables (defined in `:root`):**
- `--toggle-width: 44px` - Width of toggle slider track
- `--toggle-height: 22px` - Height of toggle slider track
- `--toggle-knob-size: 16px` - Size of the sliding knob
- `--toggle-knob-offset: 2px` - Offset from edges for knob positioning
- `--editor-primary: #00ff00` - Green color for active state
- `--editor-primary-glow: rgba(0, 255, 0, 0.5)` - Glow effect for active state
- `--editor-border-dim: #333` - Border color for inactive state
- `--editor-text: #00ff00` - Text color for label
- `--editor-spacing-sm: 8px` - Gap between slider and label

**CSS Behavior:**
- Checkbox is hidden (`opacity: 0`, `width: 0`, `height: 0`, `position: absolute`)
- Slider track changes background and border color when checked
- Knob (`.toggle-slider::before`) is a vertical line (5px wide, height matches `--toggle-knob-size`)
- Knob slides from left to right when checked
- Smooth 0.3s transition on all state changes
- Green glow effect when toggle is active
- Disabled state shows reduced opacity
- Small variant uses 4px wide knob

**Complete CSS Specification:**
The toggle switch CSS in `widget-shared.css` matches `editor-core.css` lines 492-565 exactly. All widgets MUST use this CSS without modification to maintain consistency.

**Visual States:**
- **Unchecked:** Dark background, grey border, vertical line knob on left, grey knob
- **Checked:** Green-tinted background, green border, vertical line knob on right, green knob with glow
- **Disabled:** Reduced opacity (0.4), not-allowed cursor
- **Focus:** Green glow outline

**Knob Design:**
- Standard: 5px wide vertical line, height matches `--toggle-knob-size` (16px)
- Small variant: 4px wide vertical line, height matches `--toggle-knob-size` (12px)
- Border radius: 2px (slightly rounded corners)
- Slides horizontally from left to right when toggled

**CSS Files:**
- `public/css/widget-shared.css` - For widget toggles
- `public/css/editor-core.css` - For editor toggles
- Both files use IDENTICAL toggle switch CSS for consistency

**All widgets and editors MUST use this exact structure and CSS for toggle switches to maintain consistency across the application.**

---

## 10. WIDGET PATTERNS & EXAMPLES

### 10.1 Simple Display Widget (StatsWidget Pattern)
- Render-based
- Receives data via `onMessage()`
- Updates DOM in update method
- No user interaction

### 10.2 Interactive Widget (CommsWidget Pattern)
- Render-based
- User input (text input, buttons)
- Sends messages to server
- Stores state in localStorage
- Multiple modes/tabs: Talk, Resonate, Telepath, Broadcast
- **Broadcast Mode Features:**
  - Expands widget to 2 slots wide (fullwidth) when broadcast tab selected
  - Left slot: Scrollable list of broadcast groups with numbered badges
  - Right slot: Conversation history and input box
  - Double-click group to open management modal
  - Management modal: View members, add/remove members, delete group
  - Full conversation history regardless of player presence
  - Messages persist in database and appear in terminal_history for offline players

### 10.3 Auto-Managed Widget (NPCWidget Pattern)

#### Direct Server-to-Widget Messaging for Resource Tracking

**Pattern:** For widgets monitoring server-side processes (like NPC cycle engine), use direct WebSocket messages for precise, real-time updates.

**Why:** Inventory/stats updates may arrive late or miss the first item drop. Direct messages from the process ensure accurate tracking.

**Implementation:**

**Server-side (NPC Cycle Engine):**
```javascript
// When pulse echoes are awarded during harvest
playerData.ws.send(JSON.stringify({
  type: 'npcWidget:resourceGain',
  resourceType: 'pulseEchoes',
  amount: echoYield,
  total: totalEchoes
}));

// When pulse resin is added to inventory
playerData.ws.send(JSON.stringify({
  type: 'npcWidget:resourceGain',
  resourceType: 'pulseResin',
  amount: item.quantity,
  total: pulseResinQuantity
}));
```

**Client-side routing:**
1. `Game.js` receives `npcWidget:resourceGain` → emits to MessageBus
2. `WidgetManager.js` listens to MessageBus → routes to widgets via `handleMessage()`
3. `NPCWidget.js` receives in `onMessage()` → calls `handleDirectResourceGain()`

**Widget handler:**
```javascript
handleDirectResourceGain(msg) {
    // If starting value not set, calculate it from (current - amount)
    // This ensures we capture the first drop even if tracking started late
    if (this.harvestStartStats.pulseEchoes === null) {
        this.harvestStartStats.pulseEchoes = msg.total - msg.amount;
    }
    this.currentPulseEchoes = msg.total;
    this.updateResourceGains();
}
```

**Benefits:**
- **Precise timing:** Updates arrive exactly when resources are produced
- **No missed drops:** First item drop is always captured (by calculating baseline)
- **Event-driven:** Direct connection between process and widget
- **Accurate totals:** Server sends exact current totals

**When to use:**
- Widgets monitoring server-side processes (NPC cycles, crafting, etc.)
- When timing accuracy is critical
- When inventory/stats updates may arrive late or miss events

**Visibility State Management:**
- Widget sets `this.activeNPC = npc` when harvest/cooldown active
- Widget sets `this.activeNPC = null` when no active NPC
- WidgetManager checks `!!widget.activeNPC` to determine visibility

### 10.4 Complex Interactive Widget (FactoryWidget Pattern)
- **Widget-based** (render-based)
- Implements `render()` to create DOM structure
- Receives messages via `onMessage()` from WidgetManager
- Drag-and-drop functionality
- Multiple states (idle, crafting, complete)
- Complex UI interactions
- Tracks `inFactoryRoom` property for visibility
- WidgetManager checks `widget.inFactoryRoom` to determine visibility

---

## 11. BEST PRACTICES

### 11.1 Widget Development
1. **Use standardized CSS classes** - Maintains consistency
2. **Follow base class pattern** - Extend Widget for ALL panel widgets
3. **Handle errors gracefully** - Check for null DOM elements
4. **Clean up in onDetach()** - Remove event listeners, clear intervals
5. **Use widget theme** - Apply theme class for unique appearance
6. **Test visibility logic** - Ensure requirements work correctly
7. **Document message types** - Comment which messages widget handles
8. **Use event delegation** - Prevents losing listeners on re-render
9. **NO DOM lookups in init()** - Only in `onAttach()` or query from `this.rootElement`
10. **Set visibility state for auto-managed widgets** - WidgetManager checks properties

### 11.2 CSS Guidelines
1. **Use widget-shared.css classes** - Don't create custom classes unless necessary
2. **Follow theme pattern** - Create theme variant if widget needs unique colors
3. **Maintain retro aesthetic** - Keep terminal/retro styling
4. **Test responsive behavior** - Ensure widgets work at different sizes
5. **Use flexbox** - Widget content should use flex layout
6. **Use toggle switch canonical structure** - Always use exact HTML structure for toggles

### 11.3 Registry Guidelines
1. **Unique IDs** - Ensure widget ID is unique
2. **Meaningful order** - Use order numbers with gaps (10, 20, 30) for easy insertion
3. **Clear requirements** - Set `requiresGod`, `requiresWarehouse`, `requiresFactory` appropriately
4. **Icon selection** - Use SVG path or empty string for first letter fallback
5. **Slot type** - Choose `standard`, `fullwidth`, or `special` appropriately
6. **Auto-managed flag** - Set `autoManaged: true` only if widget controls its own visibility

---

## 12. TROUBLESHOOTING

### 12.1 Widget Not Appearing
- Check widget is in registry with correct ID
- Check widget class is imported in WidgetManager
- Check widget class is in WIDGET_CLASSES mapping
- Check widget requirements are met
- Check widget is toggled on (if not auto-managed)
- Check browser console for errors

### 12.2 Widget Not Receiving Messages
- Check WidgetManager subscribes to message type in `subscribeToGameEvents()`
- Check WidgetManager routes message via `handleMessage()`
- Check widget implements `onMessage()` method
- Check widget is attached (for regular widgets)
- Check widget is auto-managed (for auto-managed widgets, they always receive messages)
- Check message type matches what widget expects

### 12.3 Widget Styling Issues
- Check widget-shared.css is linked in game.html
- Check widget uses standardized CSS classes
- Check theme class is applied if using theme
- Check CSS specificity (widget classes should override)
- Check toggle switch uses canonical HTML structure

### 12.4 Widget Not Updating
- Check `onMessage()` is called (add console.log)
- Check widget updates DOM in message handler
- Check DOM elements exist before updating
- Check for JavaScript errors in console
- Check message data structure matches expected format

### 12.5 Auto-Managed Widget Not Showing/Hiding
- Check widget sets visibility state property in message handlers
- Check WidgetManager checks correct state property
- Check state property is set BEFORE WidgetManager calls `updateVisibility()`
- Check conditions for visibility are correct
- Check widget receives messages needed to determine visibility

---

## 13. MIGRATION GUIDE

### 13.1 Converting Legacy Widget to New System
1. **Identify base class** - Widget (render-based) or Component (DOM-based)
2. **Move to widgets folder** - `public/js/widgets/YourWidget.js`
3. **Add to registry** - Add definition to `widget_registry.js`
4. **Import in WidgetManager** - Add import and mapping
5. **Update CSS** - Use widget-shared.css classes
6. **Remove legacy code** - Remove old widget code and CSS
7. **Test thoroughly** - Ensure all functionality works

### 13.2 Converting Component to Widget (For Panel Widgets Only)
**Only convert if the component is a panel widget!**

If you have a Component that should be in the widget panel:
1. **Change base class** - Extend Widget instead of Component
2. **Implement render()** - Create DOM structure in render() (don't rely on existing HTML)
3. **Move DOM lookups** - From init() to onAttach() (or use querySelector on this.rootElement)
4. **Change message handling** - Use onMessage() instead of subscribe()
5. **Update visibility logic** - Set visibility state (like `this.activeNPC` or `this.inFactoryRoom`) for auto-managed widgets
6. **Update registry** - Ensure widget ID matches
7. **Update WidgetManager** - Ensure visibility checks use widget's state properties

**DO NOT convert Terminal or Inventory** - they are NOT panel widgets and should remain Component-based.

---

## 14. ADDING NEW WIDGET CHECKLIST

### 14.1 Required Steps
- [ ] Create widget class file in `public/js/widgets/YourWidget.js`
- [ ] Extend Widget base class (NOT Component)
- [ ] Implement `render()` method (returns root DOM element)
- [ ] Implement `onAttach()` method (DOM lookups, event listeners)
- [ ] Implement `onDetach()` method (cleanup event listeners, intervals)
- [ ] Implement `onMessage()` method (handle backend messages)
- [ ] Add widget definition to `widget_registry.js`
- [ ] Import widget class in `WidgetManager.js`
- [ ] Add widget to `WIDGET_CLASSES` mapping in `WidgetManager.js`
- [ ] Use standardized CSS classes from `widget-shared.css`
- [ ] Add CSS theme if needed (optional)
- [ ] Test widget appears and functions correctly
- [ ] Test message routing (if widget receives messages)
- [ ] Test visibility logic (requirements and toggle state)
- [ ] Test cleanup on detach (no memory leaks)

### 14.2 Optional Steps
- [ ] Add message routing in `WidgetManager.subscribeToGameEvents()` (if new message type)
- [ ] Add localStorage persistence (if widget needs state persistence)
- [ ] Add auto-refresh interval (if widget needs periodic updates)
- [ ] Add toggle switch (use canonical structure)
- [ ] Add modal dialogs (use broadcast modal pattern as reference)

---

## 15. SUMMARY

### 15.1 Architecture Strengths
- **Standardized CSS** - Consistent styling across all widgets
- **Flexible base classes** - Supports render-based widgets and DOM-based components
- **Centralized management** - WidgetManager handles all lifecycle
- **Clean message routing** - Single entry point for widget messages
- **Requirement system** - Easy way to gate widgets by player state
- **Theme system** - Easy way to customize widget appearance
- **Auto-management** - Smart visibility control for context-sensitive widgets

### 15.2 Key Files
- **WidgetManager.js** - Core widget management
- **Widget.js** - Render-based widget base class (ALL panel widgets)
- **Component.js** - DOM-based component base class (non-panel UI only)
- **widget_registry.js** - Widget definitions
- **widget-shared.css** - Shared styling

### 15.3 Critical Rules
1. **ALL panel widgets MUST extend Widget** (not Component)
2. **ALL panel widgets MUST implement render()** method
3. **NO DOM lookups in init()** - Only in onAttach()
4. **Use event delegation** - Prevents losing listeners on re-render
5. **Auto-managed widgets MUST set visibility state properties**
6. **Use canonical toggle switch structure** - Exact HTML required
7. **Use standardized CSS classes** - Maintain consistency

---

**END OF DOCUMENT**
