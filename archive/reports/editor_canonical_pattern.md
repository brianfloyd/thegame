# Canonical Editor Pattern

This document defines the EXACT pattern all editors must follow, based on the Ticket Editor implementation.

---

## File Structure

Each editor domain requires:

```
public/
  <domain>-editor.html    # HTML template with Alpine directives
  <domain>-editor.js      # Alpine component + logic
  <domain>-editor.css     # Domain-specific styles (optional)

public/js/models/
  <domain>.js             # Data model + mapping functions

public/css/
  editor-core.css         # Shared editor styles (already exists)
```

---

## HTML Template Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Domain] Editor - The Game</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/css/editor-core.css">
    <link rel="stylesheet" href="/[domain]-editor.css">
</head>
<body>
    <div id="[domain]Editor" class="editor-container" x-data="[domain]Editor()" x-init="init()">
        
        <!-- Header -->
        <div class="editor-header">
            <div class="editor-header-left">
                <h2>🏷️ [Domain] Editor</h2>
                <div class="editor-nav-buttons">
                    <button class="editor-nav-btn" @click="navigateTo('/map')">Map</button>
                    <button class="editor-nav-btn" @click="navigateTo('/npc')">NPC</button>
                    <button class="editor-nav-btn" @click="navigateTo('/items')">Item</button>
                    <button class="editor-nav-btn" @click="navigateTo('/player')">Player</button>
                    <button class="editor-nav-btn" @click="navigateTo('/crafting-editor')">Crafting</button>
                    <button class="editor-nav-btn" @click="navigateTo('/tickets')">Tickets</button>
                </div>
            </div>
            <div class="editor-header-right">
                <button class="editor-btn editor-btn-success" @click="save()" :disabled="!canSave()">Save</button>
                <button class="close-editor-btn" @click="navigateTo('/game.html')">Close</button>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="editor-toolbar">
            <div class="toolbar-filters">
                <!-- Domain-specific filters -->
                <input type="text" class="editor-input search-input" 
                       placeholder="Search..." 
                       x-model="filters.search" 
                       @input="applyFilter()">
            </div>
            <div class="toolbar-actions">
                <button class="editor-btn" @click="loadItems()" :disabled="loading">
                    <span x-show="!loading">↻ Refresh</span>
                    <span x-show="loading">Loading...</span>
                </button>
                <button class="editor-btn editor-btn-primary" @click="createNew()">+ New</button>
            </div>
        </div>

        <!-- Main Content (Two-Pane Layout) -->
        <div class="editor-content">
            
            <!-- Left Pane: List -->
            <div class="editor-list-pane">
                <div class="list-header">
                    <span class="list-count" x-text="'Items: ' + filteredItems.length"></span>
                </div>
                <div class="item-list">
                    <template x-for="item in filteredItems" :key="item.id">
                        <div class="list-item" 
                             :class="{ 'selected': selectedItem && selectedItem.id === item.id }"
                             @click="selectItem(item)">
                            <div class="list-item-name" x-text="item.name"></div>
                            <div class="list-item-meta" x-text="item.type"></div>
                        </div>
                    </template>
                    <div class="empty-list" x-show="filteredItems.length === 0">
                        <span x-show="loading">Loading...</span>
                        <span x-show="!loading">No items found.</span>
                    </div>
                </div>
            </div>

            <!-- Right Pane: Detail Form -->
            <div class="editor-detail-pane">
                <template x-if="!selectedItem && !isCreating">
                    <div class="empty-detail">
                        <p>Select an item or create a new one.</p>
                    </div>
                </template>

                <template x-if="selectedItem || isCreating">
                    <div class="detail-form">
                        <!-- Form Actions -->
                        <div class="form-actions">
                            <div class="action-buttons-left">
                                <button class="editor-btn editor-btn-warning" @click="clone()">Clone</button>
                                <button class="editor-btn editor-btn-danger" @click="deleteItem()">Delete</button>
                            </div>
                            <div class="action-buttons-right">
                                <button class="editor-btn" @click="cancel()">Cancel</button>
                                <button class="editor-btn editor-btn-success" @click="save()" :disabled="!canSave()">
                                    <span x-text="isCreating ? 'Create' : 'Save'"></span>
                                </button>
                            </div>
                        </div>

                        <!-- Form Sections -->
                        <div class="form-section">
                            <div class="section-header">Basic Information</div>
                            <div class="form-grid">
                                <!-- Fields using form-field, editor-input, etc. -->
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- Notification -->
        <div class="editor-notification" 
             x-show="notification.show" 
             x-text="notification.message"
             :class="{ 'notification-error': notification.type === 'error' }">
        </div>
    </div>

    <!-- Scripts -->
    <script type="module">
        await import('/[domain]-editor.js');
    </script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</body>
</html>
```

---

## JavaScript Component Structure

```javascript
/**
 * [Domain] Editor - Alpine.js Component
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import {
    // Model imports
    mapRowTo[Domain],
    mapRowsTo[Domain]s,
    validate[Domain]
} from '/js/models/[domain].js';

window.[domain]Editor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        // List data
        items: [],
        filteredItems: [],
        
        // Selection
        selectedItem: null,
        isCreating: false,
        
        // Loading state
        loading: false,
        
        // Filters
        filters: {
            search: '',
            type: 'all'
        },
        
        // Form data (mirrors model structure)
        formData: {
            name: '',
            type: '',
            // ... domain fields
        },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[Domain]Editor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    this.loadItems();
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            this.restoreFilters();
            
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
            });
        },

        // ============================================
        // WEBSOCKET HANDLERS
        // ============================================
        
        handleMessage(data) {
            console.log('[Domain]Editor] Message:', data.type);
            
            switch (data.type) {
                case '[domain]List':
                    this.items = mapRowsTo[Domain]s(data.items || []);
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case '[domain]Created':
                    // Handle created
                    break;
                    
                case '[domain]Updated':
                    // Handle updated
                    break;
                    
                case '[domain]Deleted':
                    // Handle deleted
                    break;
                    
                case 'error':
                    this.showNotification(data.message, 'error');
                    this.loading = false;
                    break;
            }
        },

        // ============================================
        // DATA LOADING
        // ============================================
        
        loadItems() {
            this.loading = true;
            EditorBase.send({ type: 'getAll[Domain]s' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.items];
            
            // Search filter
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(item => 
                    item.name.toLowerCase().includes(search)
                );
            }
            
            // Type filter
            if (this.filters.type !== 'all') {
                filtered = filtered.filter(item => item.type === this.filters.type);
            }
            
            this.filteredItems = filtered;
            this.saveFilters();
        },
        
        saveFilters() {
            localStorage.setItem('[domain]EditorFilters', JSON.stringify(this.filters));
        },
        
        restoreFilters() {
            const saved = localStorage.getItem('[domain]EditorFilters');
            if (saved) {
                try {
                    this.filters = { ...this.filters, ...JSON.parse(saved) };
                } catch (e) { }
            }
        },

        // ============================================
        // SELECTION
        // ============================================
        
        selectItem(item) {
            this.selectedItem = item;
            this.isCreating = false;
            this.populateForm(item);
        },
        
        populateForm(item) {
            this.formData = {
                name: item.name || '',
                type: item.type || '',
                // ... copy all fields
            };
        },
        
        resetForm() {
            this.formData = {
                name: '',
                type: '',
                // ... reset all fields
            };
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        createNew() {
            this.selectedItem = null;
            this.isCreating = true;
            this.resetForm();
        },
        
        save() {
            if (!this.canSave()) return;
            
            this.loading = true;
            
            const payload = {
                ...this.formData
            };
            
            if (this.isCreating) {
                EditorBase.send({ type: 'create[Domain]', ...payload });
            } else {
                EditorBase.send({ type: 'update[Domain]', id: this.selectedItem.id, ...payload });
            }
        },
        
        deleteItem() {
            if (!this.selectedItem) return;
            if (!confirm('Are you sure?')) return;
            
            this.loading = true;
            EditorBase.send({ type: 'delete[Domain]', id: this.selectedItem.id });
        },
        
        clone() {
            if (!this.selectedItem) return;
            
            this.isCreating = true;
            this.selectedItem = null;
            this.formData.name = this.formData.name + ' (Copy)';
        },
        
        cancel() {
            this.isCreating = false;
            if (this.selectedItem) {
                this.populateForm(this.selectedItem);
            } else {
                this.resetForm();
            }
        },
        
        canSave() {
            return this.formData.name && this.formData.name.trim() !== '';
        },

        // ============================================
        // UTILITIES
        // ============================================
        
        showNotification(message, type = 'info') {
            this.notification = { show: true, message, type };
            setTimeout(() => {
                this.notification.show = false;
            }, 3000);
        },
        
        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        },
        
        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            return new Date(dateStr).toLocaleDateString();
        }
    };
};
```

---

## Required CSS Classes

All editors use these shared classes from `editor-core.css`:

**Layout:**
- `.editor-container` - Full-screen container
- `.editor-header` - Top header bar
- `.editor-toolbar` - Filter/action bar
- `.editor-content` - Two-pane content area
- `.editor-list-pane` - Left sidebar (25%)
- `.editor-detail-pane` - Right detail area (75%)

**Forms:**
- `.form-section` - Grouped fields
- `.section-header` - Section title
- `.form-grid` - Grid layout for fields
- `.form-field` - Field container
- `.editor-input` - Text input
- `.editor-select` - Dropdown
- `.editor-textarea` - Multi-line input

**Buttons:**
- `.editor-btn` - Base button
- `.editor-btn-primary` - Primary action
- `.editor-btn-success` - Save action
- `.editor-btn-warning` - Clone action
- `.editor-btn-danger` - Delete action
- `.editor-nav-btn` - Navigation button
- `.close-editor-btn` - Close button

**List:**
- `.list-item` - List row
- `.list-item.selected` - Selected row
- `.list-item-name` - Item name
- `.list-item-meta` - Item metadata

**State:**
- `.empty-list` - No items message
- `.empty-detail` - No selection message
- `.editor-notification` - Toast notification

---

## Migration Checklist

For each editor:

- [ ] Create model file: `/js/models/[domain].js`
- [ ] Convert JS to Alpine component pattern
- [ ] Update HTML with Alpine directives
- [ ] Replace DOM manipulation with reactive binding
- [ ] Use EditorBase for WebSocket
- [ ] Use shared CSS classes
- [ ] Add filter persistence (localStorage)
- [ ] Add notification system
- [ ] Test CRUD operations
- [ ] Test responsive layout
- [ ] Archive legacy files

---

## Domain-Specific Notes

### Item Editor
- Fields: id, name, description, item_type, rune_type, stackable, max_stack, icon, created_at
- Simple form, good starting point

### NPC Editor
- Fields: id, name, type, description, dialogue, harvest_time, hit_rate, cooldown, reward_items
- Complex: dialogue editor, reward items grid

### Player Editor
- Fields: id, name, email, stats (JSON), inventory, current_room, current_map
- Read-only fields for game state

### Crafting Editor
- Fields: id, name, tier, required_ingredients (JSON), required_runes (JSON), output_items (JSON), required_stats (JSON)
- Complex: multiple JSON grid editors

### Map Editor
- Most complex: canvas rendering, room connections, NPC placement
- May need hybrid approach (Alpine + canvas)


