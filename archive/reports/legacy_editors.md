# Legacy Editors Report

Generated: 2024-12-10

## Summary

The following editors need to be upgraded to the new unified Alpine.js-based architecture:

| Editor | Location | Status | Priority |
|--------|----------|--------|----------|
| Map Editor | `public/map-editor.js` | Legacy (vanilla JS) | High |
| NPC Editor | `public/npc-editor.js` | Legacy (vanilla JS) | High |
| Item Editor | `public/item-editor.js` | Legacy (vanilla JS) | High |
| Player Editor | `public/player-editor.js` | Legacy (vanilla JS) | Medium |
| Crafting Editor | `public/crafting-editor.js` | Legacy (vanilla JS) | Medium |
| **Ticket Editor** | `public/ticket-editor.js` | **CANONICAL** | N/A |

---

## Detailed Analysis

### 1. Map Editor (`public/map-editor.js`, `public/map-editor.html`)

**Current State:**
- Lines: ~2250
- Uses: EditorBase for WebSocket ✓
- UI Framework: Vanilla JS DOM manipulation ✗
- Layout: Custom grid-based layout ✗
- State Management: Global variables ✗

**Components:**
- Map canvas with zoom/pan
- Room list sidebar
- Room detail form (multi-tab)
- Room connections panel
- NPC placement panel
- Item placement panel
- Merchant inventory management
- Mass NPC add mode

**Issues:**
- No Alpine.js reactive data binding
- Manual DOM updates throughout
- Inline event listeners
- State scattered in global variables
- No shared CSS classes
- No uniform form controls

---

### 2. NPC Editor (`public/npc-editor.js`, `public/npc-editor.html`)

**Current State:**
- Lines: ~2000
- Uses: EditorBase for WebSocket ✓
- UI Framework: Vanilla JS DOM manipulation ✗
- Layout: Two-pane (list + detail) ✓
- State Management: Global variables ✗

**Components:**
- NPC list sidebar
- NPC detail form
- Dialogue editor
- Harvest configuration
- Reward/output items
- NPC placement map

**Issues:**
- No Alpine.js reactive data binding
- Manual DOM updates (`innerHTML`, `querySelector`)
- No model-based data mapping
- No shared form components
- CSS not using editor-core.css

---

### 3. Item Editor (`public/item-editor.js`, `public/item-editor.html`)

**Current State:**
- Lines: ~650
- Uses: EditorBase for WebSocket ✓
- UI Framework: Vanilla JS DOM manipulation ✗
- Layout: Two-pane (list + detail) ✓
- State Management: Global variables ✗

**Components:**
- Item list sidebar
- Item detail form
- Item type selector
- Merchant room configuration
- Warehouse deed configuration

**Issues:**
- No Alpine.js reactive data binding
- Manual DOM manipulation
- No model layer
- No shared components
- Inconsistent styling

---

### 4. Player Editor (`public/player-editor.js`, `public/player-editor.html`)

**Current State:**
- Lines: ~900
- Uses: EditorBase for WebSocket ✓
- UI Framework: Vanilla JS DOM manipulation ✗
- Layout: Two-pane (list + detail) ✓
- State Management: Global variables ✗

**Components:**
- Player list sidebar
- Player detail form
- Stats editor
- Inventory viewer
- Position editor (map/room)

**Issues:**
- No Alpine.js reactive data binding
- Manual DOM updates
- No model layer
- No shared form controls
- Inline CSS

---

### 5. Crafting Editor (`public/crafting-editor.js`, `public/crafting-editor.html`)

**Current State:**
- Lines: ~800
- Uses: EditorBase for WebSocket ✓
- UI Framework: Vanilla JS DOM manipulation ✗
- Layout: Two-pane (list + detail) ✓
- State Management: Global variables ✗

**Components:**
- Recipe list sidebar
- Recipe detail form
- Ingredient grid editor
- Rune grid editor
- Output items grid
- Required stats grid
- Live preview panel

**Issues:**
- No Alpine.js reactive data binding
- Uses custom JSON grid editors
- No model layer
- Some shared CSS usage
- Manual DOM updates

---

## Canonical Reference: Ticket Editor

The Ticket Editor (`public/ticket-editor.js`) represents the target architecture:

**Architecture:**
- Alpine.js component: `window.ticketEditor = function() { ... }`
- EditorBase for WebSocket lifecycle
- Model imports for data mapping
- Reactive state: `tickets`, `filteredTickets`, `selectedTicket`, `formData`
- Methods: `init()`, `loadTickets()`, `handleMessage()`, `selectTicket()`, `saveTicket()`, etc.

**Layout:**
- Full-screen editor container
- Header with nav buttons + save/close
- Toolbar with filters + actions
- Two-pane content: list (25%) + detail (75%)

**CSS:**
- Uses `editor-core.css` for shared components
- Uses `ticket-editor.css` for domain-specific styling

---

## Migration Priority

1. **Item Editor** - Simplest, good starting point
2. **NPC Editor** - Medium complexity, many shared patterns
3. **Player Editor** - Medium complexity
4. **Crafting Editor** - Complex JSON grids
5. **Map Editor** - Most complex, canvas-based

---

## Next Steps

1. Create canonical pattern documentation
2. Create/update domain services
3. Migrate each editor to new architecture
4. Archive legacy code
5. Validate all editors


