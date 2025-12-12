/**
 * Item Editor - Alpine.js Component
 * 
 * Uses actual database schema columns from items table.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import {
    ITEM_TYPES,
    ITEM_TYPE_LABELS,
    RUNE_TYPES,
    RUNE_TYPE_LABELS,
    mapRowToItem,
    mapRowsToItems,
    validateItem,
    getItemTypeLabel,
    getRuneTypeLabel,
    isRune,
    isDeed
} from '/js/models/item.js';

// Make itemEditor available globally for Alpine.js
window.itemEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        items: [],
        filteredItems: [],
        selectedItem: null,
        isCreating: false,
        loading: false,
        
        // Filters
        filters: {
            search: '',
            type: 'all',
            activeOnly: false
        },
        
        // Form data - matches actual items table columns
        formData: {
            name: '',
            description: '',
            item_type: 'sundries',
            active: true,
            poofable: false,
            encumbrance: 1,
            // Rune fields
            rune_type: '',
            rune_color: '#0000ff',
            // Deed fields
            deed_warehouse_location_key: '',
            deed_base_max_item_types: 1,
            deed_base_max_quantity_per_type: 100,
            deed_upgrade_tier: 1,
            deed_max_total_items: 100,
            deed_automation_enabled: false
        },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        // Constants for template
        ITEM_TYPES,
        ITEM_TYPE_LABELS,
        RUNE_TYPES,
        RUNE_TYPE_LABELS,

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[ItemEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[ItemEditor] EditorBase ready, loading items...');
                    this.loadItems();
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
            });
        },

        // ============================================
        // WEBSOCKET HANDLERS
        // ============================================
        
        handleMessage(data) {
            console.log('[ItemEditor] Message:', data.type, data);
            
            switch (data.type) {
                case 'itemList':
                    console.log('[ItemEditor] Received items:', data.items?.length || 0);
                    // Use raw data directly
                    this.items = (data.items || []).map(i => ({
                        ...i,
                        item_type: i.item_type || 'sundries',
                        active: i.active ?? true
                    }));
                    console.log('[ItemEditor] Mapped items:', this.items);
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case 'itemCreated':
                    if (data.item) {
                        const item = mapRowToItem(data.item);
                        this.items.push(item);
                        this.applyFilter();
                        this.selectItem(item);
                        this.showNotification('Item created', 'success');
                    }
                    this.loading = false;
                    this.isCreating = false;
                    break;
                    
                case 'itemUpdated':
                    if (data.item) {
                        const item = mapRowToItem(data.item);
                        const idx = this.items.findIndex(i => i.id === item.id);
                        if (idx !== -1) {
                            this.items[idx] = item;
                        }
                        if (this.selectedItem && this.selectedItem.id === item.id) {
                            this.selectedItem = item;
                            this.populateForm(item);
                        }
                        this.applyFilter();
                        this.showNotification('Item updated', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'itemDeleted':
                    if (data.itemId) {
                        this.items = this.items.filter(i => i.id !== data.itemId);
                        if (this.selectedItem && this.selectedItem.id === data.itemId) {
                            this.selectedItem = null;
                            this.resetForm();
                        }
                        this.applyFilter();
                        this.showNotification('Item deleted', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'error':
                    this.showNotification(data.message || 'An error occurred', 'error');
                    this.loading = false;
                    break;
            }
        },

        // ============================================
        // DATA LOADING
        // ============================================
        
        loadItems() {
            this.loading = true;
            EditorBase.send({ type: 'getAllItems' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.items];
            
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(item => 
                    item.name.toLowerCase().includes(search) ||
                    (item.description && item.description.toLowerCase().includes(search))
                );
            }
            
            if (this.filters.type !== 'all') {
                filtered = filtered.filter(item => item.item_type === this.filters.type);
            }
            
            if (this.filters.activeOnly) {
                filtered = filtered.filter(item => item.active);
            }
            
            this.filteredItems = filtered;
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
                name: item.name,
                description: item.description,
                item_type: item.item_type,
                active: item.active,
                poofable: item.poofable,
                encumbrance: item.encumbrance,
                rune_type: item.rune_type || '',
                rune_color: item.rune_color || '#0000ff',
                deed_warehouse_location_key: item.deed_warehouse_location_key || '',
                deed_base_max_item_types: item.deed_base_max_item_types,
                deed_base_max_quantity_per_type: item.deed_base_max_quantity_per_type,
                deed_upgrade_tier: item.deed_upgrade_tier,
                deed_max_total_items: item.deed_max_total_items,
                deed_automation_enabled: item.deed_automation_enabled
            };
        },
        
        resetForm() {
            this.formData = {
                name: '',
                description: '',
                item_type: 'sundries',
                active: true,
                poofable: false,
                encumbrance: 1,
                rune_type: '',
                rune_color: '#0000ff',
                deed_warehouse_location_key: '',
                deed_base_max_item_types: 1,
                deed_base_max_quantity_per_type: 100,
                deed_upgrade_tier: 1,
                deed_max_total_items: 100,
                deed_automation_enabled: false
            };
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        createItem() {
            this.selectedItem = null;
            this.isCreating = true;
            this.resetForm();
        },
        
        saveItem() {
            if (!this.formData.name.trim()) {
                this.showNotification('Item name is required', 'error');
                return;
            }
            
            const itemData = {
                name: this.formData.name.trim(),
                description: this.formData.description.trim(),
                item_type: this.formData.item_type,
                active: this.formData.active,
                poofable: this.formData.poofable,
                encumbrance: parseInt(this.formData.encumbrance)
            };
            
            // Add rune fields if rune type
            if (this.formData.item_type === 'rune') {
                itemData.rune_type = this.formData.rune_type || null;
                itemData.rune_color = this.formData.rune_color;
            }
            
            // Add deed fields if deed type
            if (this.formData.item_type === 'deed') {
                itemData.deed_warehouse_location_key = this.formData.deed_warehouse_location_key || null;
                itemData.deed_base_max_item_types = parseInt(this.formData.deed_base_max_item_types);
                itemData.deed_base_max_quantity_per_type = parseInt(this.formData.deed_base_max_quantity_per_type);
                itemData.deed_upgrade_tier = parseInt(this.formData.deed_upgrade_tier);
                itemData.deed_max_total_items = parseInt(this.formData.deed_max_total_items);
                itemData.deed_automation_enabled = this.formData.deed_automation_enabled;
            }
            
            this.loading = true;
            
            if (this.isCreating) {
                EditorBase.send({ type: 'createItem', item: itemData });
            } else if (this.selectedItem) {
                EditorBase.send({ 
                    type: 'updateItem', 
                    itemId: this.selectedItem.id,
                    updates: itemData 
                });
            }
        },
        
        deleteItem() {
            if (!this.selectedItem) return;
            if (!confirm(`Delete item "${this.selectedItem.name}"?`)) return;
            
            this.loading = true;
            EditorBase.send({ type: 'deleteItem', itemId: this.selectedItem.id });
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
        
        getItemTypeLabel(type) {
            return ITEM_TYPE_LABELS[type] || type;
        },
        
        getRuneTypeLabel(type) {
            return RUNE_TYPE_LABELS[type] || type;
        },
        
        isRune() {
            return this.formData.item_type === 'rune';
        },
        
        isDeed() {
            return this.formData.item_type === 'deed';
        }
    };
};
