# Game Editor System - Shared Infrastructure Canonical Spec

**Generated:** Based on codebase analysis of `protected/editors/` directory  
**Scope:** Shared CSS, HTML patterns, data handling, and WebSocket infrastructure used by all editors  
**Last Updated:** Based on current codebase state

---

## 1. Shared Infrastructure Schema / Source of Truth

### 1.1 File Structure

**Location:** `protected/editors/`

**Shared Files:**
- `editor-shared.css` (475 lines) - Master CSS for all editors
- `public/css/editor-core.css` (1103 lines) - Core component library
- `public/js/editorShared/EditorBase.js` (177 lines) - WebSocket lifecycle management

**Editor Files (per editor):**
- `{editor-name}-editor.html` - HTML template
- `{editor-name}-editor.js` - Alpine.js component

**Current Editors:**
1. `crafting-editor.html` / `crafting-editor.js` - Crafting Recipe Editor
2. `item-editor.html` / `item-editor.js` - Item Editor
3. `map-editor.html` / `map-editor.js` - Map Editor
4. `npc-editor.html` / `npc-editor.js` - NPC Editor
5. `player-editor.html` / `player-editor.js` - Player Editor
6. `ticket-editor.html` / `ticket-editor.js` - Ticket Editor

**References:**
- `protected/editors/editor-shared.css:1-475`
- `public/css/editor-core.css:1-1103`
- `public/js/editorShared/EditorBase.js:1-177`

---

## 2. All Fields, Defaults, Nullability, Constraints

### 2.1 EditorBase WebSocket Infrastructure

**File:** `public/js/editorShared/EditorBase.js`

**Exported Object:**
```javascript
EditorBase = {
    socket: null,
    isNavigatingAway: false,
    reconnectTimeout: null,
    onReadyCallback: null,
    onMessageCallback: null,
    onErrorCallback: null
}
```

**Methods:**
- `init(options)` - Required `onReady` callback, optional `onMessage` and `onError`
- `connect()` - Creates WebSocket connection, sends `authenticateSession` with `isEditor: true`
- `getSocket()` - Returns current socket or null
- `send(message)` - Sends JSON message through socket
- `setNavigatingAway(value)` - Prevents auto-reconnect
- `close()` - Closes connection

**WebSocket Protocol:**
- Connection: `ws://` or `wss://` based on `location.protocol`
- Initial message: `{ type: 'authenticateSession', isEditor: true }`
- Expected response: `{ type: 'sessionAuthenticated' }`
- Auto-reconnect: 3 second delay unless `isNavigatingAway === true`

**References:**
- `public/js/editorShared/EditorBase.js:33-177`

---

### 2.2 CSS Variables (Theme Tokens)

**File:** `public/css/editor-core.css:25-76`

**Color Variables:**
- `--editor-bg: #0a0a0a` - Main background
- `--editor-bg-dark: #050505` - Dark background
- `--editor-bg-subtle: #1a1a1a` - Subtle background
- `--editor-bg-hover: #0a3a0a` - Hover state
- `--editor-bg-selected: #004400` - Selected state
- `--editor-primary: #00ff00` - Primary accent (green)
- `--editor-primary-dim: #006600` - Dimmed primary
- `--editor-primary-glow: rgba(0, 255, 0, 0.5)` - Glow effect
- `--editor-secondary: #00ffff` - Secondary accent (cyan)
- `--editor-warning: #ffff00` - Warning color (yellow)
- `--editor-danger: #ff0000` - Danger color (red)
- `--editor-text: #00ff00` - Primary text
- `--editor-text-dim: #888` - Dimmed text
- `--editor-text-label: #00ffff` - Label text
- `--editor-text-heading: #ffff00` - Heading text
- `--editor-border: #00ff00` - Primary border
- `--editor-border-dim: #333` - Dimmed border

**Spacing Variables:**
- `--editor-spacing-xs: 4px`
- `--editor-spacing-sm: 8px`
- `--editor-spacing-md: 12px`
- `--editor-spacing-lg: 16px`
- `--editor-spacing-xl: 20px`

**Layout Variables:**
- `--editor-sidebar-width: 25%`
- `--editor-sidebar-min-width: 280px`
- `--editor-sidebar-max-width: 400px`

**References:**
- `public/css/editor-core.css:25-76`

---

### 2.3 HTML Structure Pattern

**Standard Editor HTML Template:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{Editor Name} Editor - The Game</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/css/editor-core.css">
    <link rel="stylesheet" href="/protected/editors/editor-shared.css">
</head>
<body>
    <div id="{editorId}" class="editor-container" x-data="{editorFunction}()" x-init="init()">
        <!-- Header -->
        <div class="editor-header">
            <div class="editor-header-left">
                <h2>{Editor Title}</h2>
                <div class="editor-nav-buttons">
                    <!-- Navigation buttons to other editors -->
                </div>
            </div>
            <div class="editor-header-right">
                <button class="editor-btn editor-btn-success" @click="save()">Save</button>
                <button class="close-editor-btn" @click="navigateTo('/game.html')">Close</button>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="editor-toolbar">
            <div class="toolbar-filters">
                <!-- Search, filters -->
            </div>
            <div class="toolbar-actions">
                <button class="editor-btn" @click="loadData()">Refresh</button>
                <button class="editor-btn editor-btn-primary" @click="create()">+ New</button>
            </div>
        </div>

        <!-- Main Content -->
        <div class="editor-content">
            <!-- Left: List Pane -->
            <div class="editor-list-pane">
                <div class="list-header">
                    <span class="list-count" x-text="'Items: ' + filteredItems.length"></span>
                </div>
                <div class="editor-list">
                    <!-- List items -->
                </div>
            </div>

            <!-- Right: Detail Pane -->
            <div class="editor-detail-pane">
                <!-- Form content -->
            </div>
        </div>

        <!-- Notification -->
        <div class="editor-notification" x-show="notification.show" x-text="notification.message"></div>
    </div>

    <script type="module">
        await import('/{editor-name}-editor.js');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js';
        document.head.appendChild(script);
    </script>
</body>
</html>
```

**Preview with Refresh Button Pattern:**
For editors that display timebound effects (e.g., typewriter animations), add a refresh button to replay the effect:

```html
<div class="preview-container" style="position: relative;">
    <div id="preview-{id}" x-html="renderPreview()" 
         x-init="$nextTick(() => initPreviewTypewriter($el))"></div>
    <button class="preview-refresh-btn" 
            @click="refreshPreview('preview-{id}')" 
            title="Replay effect"
            style="position: absolute; top: 8px; right: 8px; padding: 4px 8px; font-size: 0.85em; background: var(--editor-bg-subtle); border: 1px solid var(--editor-border-dim); color: var(--editor-text-dim); cursor: pointer; border-radius: 3px;">↻</button>
</div>
```

**JavaScript Methods:**
```javascript
initPreviewTypewriter(element) {
    // Initialize typewriter effects after DOM update
    if (element && typeof initializeTypewriterEffects === 'function') {
        initializeTypewriterEffects(element);
    } else if (element && window.initializeTypewriterEffects) {
        window.initializeTypewriterEffects(element);
    }
},

refreshPreview(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Stop any existing animations in this element
    const typewriterElements = element.querySelectorAll('[data-typewriter="true"]');
    typewriterElements.forEach(el => {
        const id = el.getAttribute('data-typewriter-id');
        if (id && window.activeTypewriters) {
            const timeoutId = window.activeTypewriters.get(id);
            if (timeoutId) {
                clearTimeout(timeoutId);
                window.activeTypewriters.delete(id);
            }
        }
        // Reset element - restore original content
        const content = el.getAttribute('data-typewriter-content');
        if (content) {
            el.innerHTML = content;
            el.removeAttribute('data-typewriter-animating');
            el.removeAttribute('data-typewriter-id');
        } else {
            el.innerHTML = '';
            el.removeAttribute('data-typewriter-animating');
            el.removeAttribute('data-typewriter-id');
        }
    });
    
    // Re-initialize typewriter effects
    if (typeof initializeTypewriterEffects === 'function') {
        initializeTypewriterEffects(element);
    } else if (window.initializeTypewriterEffects) {
        window.initializeTypewriterEffects(element);
    }
}
```

**References:**
- `protected/editors/markup-editor.html:65-67` (list preview with refresh)
- `protected/editors/markup-editor.html:197-199` (editor preview with refresh)
- `public/markup-editor.js:482-520` (initPreviewTypewriter and refreshPreview methods)
- All editor HTML files follow this pattern
- `protected/editors/crafting-editor.html:1-409` (example)

---

## 3. All Subsystem Operations (Read/Write/Mutate)

### 3.1 EditorBase Operations

**Initialization:**
```javascript
EditorBase.init({
    onReady: (socket) => { /* Called after authentication */ },
    onMessage: (data) => { /* Optional message handler */ },
    onError: (error) => { /* Optional error handler */ }
})
```

**Message Sending:**
```javascript
EditorBase.send({ type: 'getAllItems' })
```

**Navigation:**
```javascript
EditorBase.setNavigatingAway(true)
window.location.href = '/path'
```

**References:**
- `public/js/editorShared/EditorBase.js:48-61` (init)
- `public/js/editorShared/EditorBase.js:145-151` (send)
- `public/js/editorShared/EditorBase.js:156-162` (setNavigatingAway)

---

### 3.2 Standard Editor Component Pattern

**Alpine.js Component Structure:**

```javascript
window.{editorName}Editor = function() {
    return {
        // STATE
        items: [],
        filteredItems: [],
        selectedItem: null,
        isCreating: false,
        loading: false,
        filters: { /* filter state */ },
        formData: { /* form state */ },
        notification: { show: false, message: '', type: 'info' },

        // LIFECYCLE
        init() {
            EditorBase.init({
                onReady: (socket) => { this.loadData(); },
                onMessage: (data) => { this.handleMessage(data); },
                onError: (error) => { this.showNotification('Error: ' + error.message, 'error'); }
            });
        },

        // WEBSOCKET HANDLERS
        handleMessage(data) {
            switch (data.type) {
                case '{entity}List':
                    this.items = data.items || [];
                    this.applyFilter();
                    this.loading = false;
                    break;
                case '{entity}Created':
                    // Handle creation
                    break;
                case '{entity}Updated':
                    // Handle update
                    break;
                case '{entity}Deleted':
                    // Handle deletion
                    break;
                case 'error':
                    this.showNotification(data.message || 'An error occurred', 'error');
                    this.loading = false;
                    break;
            }
        },

        // DATA LOADING
        loadData() {
            this.loading = true;
            EditorBase.send({ type: 'getAll{Entity}s' });
        },

        // FILTERING
        applyFilter() {
            let filtered = [...this.items];
            // Apply filters
            this.filteredItems = filtered;
        },

        // SELECTION
        selectItem(item) {
            this.selectedItem = item;
            this.isCreating = false;
            this.populateForm(item);
        },

        populateForm(item) {
            this.formData = { /* map item to form */ };
        },

        resetForm() {
            this.formData = { /* default values */ };
        },

        // CRUD OPERATIONS
        createItem() {
            this.selectedItem = null;
            this.isCreating = true;
            this.resetForm();
        },

        saveItem() {
            if (!this.canSave()) {
                this.showNotification('Validation failed', 'error');
                return;
            }
            this.loading = true;
            if (this.isCreating) {
                EditorBase.send({ type: 'create{Entity}', data: this.formData });
            } else {
                EditorBase.send({ type: 'update{Entity}', id: this.selectedItem.id, updates: this.formData });
            }
        },

        deleteItem() {
            if (!confirm('Delete?')) return;
            this.loading = true;
            EditorBase.send({ type: 'delete{Entity}', id: this.selectedItem.id });
        },

        // UTILITIES
        showNotification(message, type = 'info') {
            this.notification = { show: true, message, type };
            setTimeout(() => { this.notification.show = false; }, 3000);
        },

        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        }
    };
};
```

**References:**
- All editor JS files follow this pattern
- `protected/editors/item-editor.js:23-347` (example)

---

## 4. Validations + Missing Validations

### 4.1 EditorBase Validations

**Enforced:**
- `init()` requires `onReady` callback function (throws error if missing)
- `send()` checks socket is open before sending (logs warning if not)

**Not Enforced:**
- Message format validation
- Authentication state validation before sending messages
- Reconnection attempt limits

**References:**
- `public/js/editorShared/EditorBase.js:48-61` (init validation)
- `public/js/editorShared/EditorBase.js:145-151` (send validation)

---

### 4.2 Editor Component Validations

**Common Patterns:**
- `canSave()` method checks required fields
- Form validation before save operations
- Confirmation dialogs for delete operations

**Missing Validations:**
- No client-side schema validation
- No type checking for form data
- No validation of WebSocket message structure

**References:**
- Each editor implements `canSave()` differently
- `protected/editors/ticket-editor.js:356-358` (canSave example)

---

## 5. Behavioral Rules / Invariants

### 5.1 EditorBase Invariants

**Always True:**
- WebSocket connection must be authenticated before `onReady` is called
- `isNavigatingAway === true` prevents auto-reconnect
- Messages are sent as JSON strings
- Reconnection attempts wait 3 seconds

**References:**
- `public/js/editorShared/EditorBase.js:72-93` (authentication flow)
- `public/js/editorShared/EditorBase.js:117-130` (reconnection logic)

---

### 5.2 Editor Component Invariants

**Always True:**
- `loading === true` during async operations
- `selectedItem === null` when `isCreating === true`
- `filteredItems` is derived from `items` and `filters`
- Notifications auto-hide after 3-4 seconds

**Not Enforced in Code:**
- No guarantee that `selectedItem` exists in `items` array
- No guarantee that form data matches selected item after update

**References:**
- All editors follow these patterns
- `protected/editors/item-editor.js:209-213` (selection logic)

---

## 6. State Transitions (with file references)

### 6.1 EditorBase State Machine

**States:**
1. **Uninitialized** → `init()` → **Connecting**
2. **Connecting** → `sessionAuthenticated` → **Ready**
3. **Ready** → `close` event → **Disconnected**
4. **Disconnected** → (if not navigating away) → **Reconnecting** (after 3s)
5. **Reconnecting** → `sessionAuthenticated` → **Ready**

**Transitions:**
- `EditorBase.init()` → Creates WebSocket, sends authentication
- `sessionAuthenticated` message → Calls `onReady` callback
- `close` event → Starts reconnection timer (if not navigating away)
- `EditorBase.setNavigatingAway(true)` → Stops reconnection

**References:**
- `public/js/editorShared/EditorBase.js:66-130`

---

### 6.2 Editor Component State Machine

**States:**
1. **Loading** → `loadData()` → **Loaded**
2. **Loaded** → `selectItem()` → **Viewing**
3. **Viewing** → `createItem()` → **Creating**
4. **Viewing** → `saveItem()` → **Saving** → **Viewing** (on success)
5. **Creating** → `saveItem()` → **Saving** → **Viewing** (on success)
6. **Viewing** → `deleteItem()` → **Deleting** → **Loaded** (on success)

**References:**
- All editors follow this pattern
- `protected/editors/item-editor.js:257-313` (CRUD operations)

---

## 7. Interactions with Other Systems

### 7.1 WebSocket Server

**Connection:**
- Editors connect via WebSocket to game server
- Authentication via `authenticateSession` message with `isEditor: true`
- All editor operations go through WebSocket messages

**Message Types (Editor → Server):**
- `authenticateSession` (with `isEditor: true`)
- `getAll{Entity}s` - Load list
- `create{Entity}` - Create new
- `update{Entity}` - Update existing
- `delete{Entity}` - Delete

**Message Types (Server → Editor):**
- `sessionAuthenticated` - Authentication success
- `{entity}List` - List response
- `{entity}Created` - Creation success
- `{entity}Updated` - Update success
- `{entity}Deleted` - Deletion success
- `error` - Error response

**References:**
- `public/js/editorShared/EditorBase.js:72-108` (message handling)
- Server handlers in `handlers/` directory

---

### 7.2 Alpine.js Framework

**Dependency:**
- All editors use Alpine.js 3.x for reactive state management
- Loaded from CDN: `https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js`
- Component functions attached to `window` object for global access

**Pattern:**
```javascript
window.{editorName}Editor = function() {
    return { /* component state and methods */ };
};
```

**References:**
- All editor HTML files load Alpine.js
- `protected/editors/crafting-editor.html:399-406` (loading pattern)

---

### 7.3 CSS Dependencies

**Stylesheet Loading Order:**
1. `/style.css` - Base game styles
2. `/css/editor-core.css` - Core component library
3. `/protected/editors/editor-shared.css` - Master editor styles

**CSS Architecture:**
- `editor-core.css` provides component classes and CSS variables
- `editor-shared.css` provides layout and editor-specific styles
- Both use CSS variables for theming

**References:**
- All editor HTML files include these stylesheets
- `protected/editors/item-editor.html:7-9` (stylesheet loading)

---

## 8. Failure States and Messages

### 8.1 EditorBase Failures

**Connection Failures:**
- WebSocket connection error → Calls `onError` callback
- Server error message → Calls `onError` callback with message
- Auto-reconnect on disconnect (unless navigating away)

**Error Messages:**
- `'EditorBase.init() requires onReady callback function'` - Missing callback
- `'Connection error: ' + error.message` - Connection error
- `'Cannot send message - socket not ready'` - Send when not connected

**References:**
- `public/js/editorShared/EditorBase.js:51-52` (init validation)
- `public/js/editorShared/EditorBase.js:110-115` (error handling)
- `public/js/editorShared/EditorBase.js:149` (send warning)

---

### 8.2 Editor Component Failures

**Common Failure Patterns:**
- Validation failure → Show notification, don't save
- Server error → Show error notification, set `loading = false`
- Network error → Handled by EditorBase, shows error notification

**Error Messages:**
- `'Item name is required'` - Validation error
- `'An error occurred'` - Generic server error
- `'Connection error: ' + error.message` - Connection error

**References:**
- All editors show notifications on errors
- `protected/editors/item-editor.js:264-267` (validation example)

---

## 9. Serialization Paths

### 9.1 WebSocket Message Format

**Outgoing (Editor → Server):**
```json
{
    "type": "createItem",
    "item": {
        "name": "Item Name",
        "description": "Description",
        ...
    }
}
```

**Incoming (Server → Editor):**
```json
{
    "type": "itemCreated",
    "item": {
        "id": 1,
        "name": "Item Name",
        ...
    }
}
```

**References:**
- All editors send/receive JSON messages
- `public/js/editorShared/EditorBase.js:146-147` (JSON.stringify)

---

### 9.2 Form Data Serialization

**Pattern:**
- Form data stored in Alpine.js reactive state (`formData` object)
- On save, form data serialized to match server expectations
- Server response deserialized and merged into component state

**Data Transformations:**
- Some editors transform data (e.g., item_name → item_id)
- JSON fields parsed/stringified as needed
- Arrays/objects normalized for database storage

**References:**
- `protected/editors/crafting-editor.js:248-301` (form population with transformations)

---

## 10. Known Gaps, Missing Features, or TODOs

### 10.1 Missing Features

**EditorBase:**
- No message queue for offline state
- No retry logic for failed messages
- No connection state indicator in UI
- No message timeout handling

**Editor Components:**
- No undo/redo functionality
- No bulk operations
- No export/import functionality
- No keyboard shortcuts (except map editor)
- No form validation feedback (visual indicators)
- No auto-save functionality

**References:**
- No implementation found for these features

---

### 10.2 Inconsistencies

**Styling:**
- Some editors use `editor-shared.css` classes, others use `editor-core.css` classes
- Mix of CSS variable usage and hardcoded colors
- Inconsistent button styling (some use `editor-btn-success`, others use custom classes)

**Data Handling:**
- Inconsistent error handling patterns
- Some editors transform data client-side, others rely on server
- Inconsistent loading state management

**References:**
- Compare `protected/editors/item-editor.html` vs `protected/editors/crafting-editor.html`

---

## 11. Summary of Strengths, Weaknesses, Risks

### 11.1 Strengths

**Architecture:**
- Unified EditorBase provides consistent WebSocket management
- Alpine.js provides reactive state management
- Shared CSS provides consistent visual design
- Modular structure allows easy addition of new editors

**Code Quality:**
- Clear separation of concerns (HTML, CSS, JS)
- Consistent patterns across editors
- Good use of CSS variables for theming

**References:**
- `public/js/editorShared/EditorBase.js` (unified infrastructure)
- `public/css/editor-core.css` (component library)

---

### 11.2 Weaknesses

**Error Handling:**
- Limited error recovery
- No offline support
- No message queuing

**User Experience:**
- No loading indicators in some editors
- No confirmation for unsaved changes
- No keyboard shortcuts (except map editor)

**Code Maintenance:**
- Some code duplication across editors
- Inconsistent patterns in some areas
- No TypeScript for type safety

**References:**
- Compare error handling across editors
- Check for loading indicators in HTML files

---

### 11.3 Risks

**Technical Risks:**
- WebSocket connection failures not gracefully handled
- No validation of server message structure
- Potential memory leaks with auto-reconnect

**Maintenance Risks:**
- Adding new editors requires copying patterns manually
- CSS changes may break existing editors
- No automated testing

**References:**
- `public/js/editorShared/EditorBase.js:117-130` (reconnection logic)
- No test files found in codebase

---

## 12. How to Create a New Editor

### 12.1 Step-by-Step Guide

**1. Create HTML File:**
- Copy template from existing editor (e.g., `item-editor.html`)
- Update title, editor ID, and navigation buttons
- Include required stylesheets:
  ```html
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/css/editor-core.css">
  <link rel="stylesheet" href="/protected/editors/editor-shared.css">
  ```

**2. Create JavaScript File:**
- Copy template from existing editor (e.g., `item-editor.js`)
- Import EditorBase:
  ```javascript
  import { EditorBase } from '/js/editorShared/EditorBase.js';
  ```
- Implement standard component structure:
  - State (items, filteredItems, selectedItem, etc.)
  - Lifecycle (init, handleMessage, loadData)
  - Filtering (applyFilter)
  - Selection (selectItem, populateForm, resetForm)
  - CRUD (createItem, saveItem, deleteItem)
  - Utilities (showNotification, navigateTo)

**3. Implement WebSocket Handlers:**
- Add server-side handlers in `handlers/` directory
- Follow naming convention: `getAll{Entity}s`, `create{Entity}`, `update{Entity}`, `delete{Entity}`
- Return messages: `{entity}List`, `{entity}Created`, `{entity}Updated`, `{entity}Deleted`

**4. Style the Editor:**
- Use existing CSS classes from `editor-core.css` and `editor-shared.css`
- Follow CSS variable theming
- Use standard component classes (form-section, form-grid, etc.)

**5. Test:**
- Verify WebSocket connection
- Test CRUD operations
- Test filtering and search
- Test error handling

**References:**
- `protected/editors/item-editor.html` (HTML template)
- `protected/editors/item-editor.js` (JS template)
- `public/js/editorShared/EditorBase.js` (WebSocket infrastructure)

---

### 12.2 Required Patterns

**HTML Structure:**
- `editor-container` as root div with `x-data` and `x-init`
- `editor-header` with title and navigation
- `editor-toolbar` with filters and actions
- `editor-content` with `editor-list-pane` and `editor-detail-pane`
- `editor-notification` for messages

**JavaScript Structure:**
- Alpine.js component function attached to `window`
- EditorBase.init() in init() method
- Standard state properties (items, filteredItems, selectedItem, etc.)
- Standard methods (loadData, applyFilter, selectItem, saveItem, etc.)

**CSS Classes:**
- Use `editor-*` prefix for editor-specific classes
- Use `form-section`, `form-grid`, `form-field` for forms
- Use `editor-btn`, `editor-input`, `editor-select` for inputs
- Use CSS variables for colors and spacing

**References:**
- All existing editors follow these patterns
- `protected/editors/item-editor.html` (complete example)

---

## 13. Data Population and Retrieval Patterns

### 13.1 Loading Data

**Pattern:**
```javascript
loadData() {
    this.loading = true;
    EditorBase.send({ type: 'getAll{Entity}s' });
}
```

**Response Handling:**
```javascript
handleMessage(data) {
    switch (data.type) {
        case '{entity}List':
            this.items = data.items || [];
            this.applyFilter();
            this.loading = false;
            break;
    }
}
```

**References:**
- `protected/editors/item-editor.js:174-177` (loadData)
- `protected/editors/item-editor.js:108-119` (handleMessage)

---

### 13.2 Saving Data

**Pattern:**
```javascript
saveItem() {
    if (!this.canSave()) {
        this.showNotification('Validation failed', 'error');
        return;
    }
    this.loading = true;
    if (this.isCreating) {
        EditorBase.send({ type: 'create{Entity}', data: this.formData });
    } else {
        EditorBase.send({ type: 'update{Entity}', id: this.selectedItem.id, updates: this.formData });
    }
}
```

**Response Handling:**
```javascript
case '{entity}Created':
    if (data.{entity}) {
        this.items.push(data.{entity});
        this.applyFilter();
        this.selectItem(data.{entity});
        this.showNotification('Created', 'success');
    }
    this.loading = false;
    this.isCreating = false;
    break;
```

**References:**
- `protected/editors/item-editor.js:263-305` (saveItem)
- `protected/editors/item-editor.js:121-131` (handleMessage)

---

### 13.3 Form Population

**Pattern:**
```javascript
populateForm(item) {
    this.formData = {
        name: item.name || '',
        description: item.description || '',
        // Map all fields from item to form
    };
}
```

**Data Transformations:**
- Some editors transform data (e.g., JSON parsing, item_name → item_id)
- Handle null/undefined values with defaults
- Normalize arrays/objects for form display

**References:**
- `protected/editors/item-editor.js:215-232` (populateForm)
- `protected/editors/crafting-editor.js:248-301` (populateForm with transformations)

---

## End of Document


