/**
 * Merchant Editor - Alpine.js Component
 * 
 * Manages merchant rooms and their inventory.
 * All merchant functionality is room-based, not NPC-based.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';

// Make merchantEditor available globally for Alpine.js
window.merchantEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        merchantRooms: [],
        filteredRooms: [],
        selectedRoom: null,
        isCreating: false,
        loading: false,
        
        allItems: [],
        allMaps: [],
        allRooms: [],
        roomInventory: [],
        
        newItemId: '',
        
        formulaOverrideEnabled: false,
        formulaOverride: {
            baseMultiplier: 1.0,
            acumenMultiplier: 0.01,
            maxDiscount: 0.5
        },
        
        showCreateDialog: false,
        createRoomMode: 'new', // 'new' or 'convert'
        newRoomData: {
            mapId: '',
            x: 0,
            y: 0,
            name: '',
            description: ''
        },
        convertRoomId: '',
        
        // Filters
        filters: {
            search: ''
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
            console.log('[MerchantEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[MerchantEditor] EditorBase ready, loading data...');
                    this.loadMerchantRooms();
                    this.loadAllItems();
                    this.loadAllMaps();
                    this.loadAllRooms();
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
        // MESSAGE HANDLING
        // ============================================
        
        handleMessage(data) {
            switch (data.type) {
                case 'merchantRooms':
                    this.merchantRooms = data.rooms || [];
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case 'merchantRoomDetails':
                    if (data.room) {
                        this.selectedRoom = data.room;
                        this.roomInventory = data.room.inventory || [];
                        this.loadFormulaOverride();
                    }
                    this.loading = false;
                    break;
                    
                case 'merchantRoomCreated':
                    this.showNotification('Merchant room created successfully', 'success');
                    this.showCreateDialog = false;
                    this.loadMerchantRooms();
                    break;
                    
                case 'merchantRoomUpdated':
                    this.showNotification('Merchant room updated successfully', 'success');
                    this.loadMerchantRooms();
                    if (this.selectedRoom) {
                        this.selectRoom(this.selectedRoom);
                    }
                    break;
                    
                case 'merchantItemAdded':
                    this.showNotification('Item added to inventory', 'success');
                    if (this.selectedRoom) {
                        this.selectRoom(this.selectedRoom);
                    }
                    break;
                    
                case 'merchantItemUpdated':
                    this.showNotification('Item updated', 'success');
                    if (this.selectedRoom) {
                        this.selectRoom(this.selectedRoom);
                    }
                    break;
                    
                case 'merchantItemRemoved':
                    this.showNotification('Item removed from inventory', 'success');
                    if (this.selectedRoom) {
                        this.selectRoom(this.selectedRoom);
                    }
                    break;
                    
                case 'merchantItemQuantityAdjusted':
                    // Update local inventory
                    const adjustedItem = this.roomInventory.find(i => i.id === data.merchantItemId);
                    if (adjustedItem) {
                        adjustedItem.current_qty = data.current_qty;
                    }
                    break;
                    
                case 'merchantFormulaOverride':
                    this.handleFormulaOverrideMessage(data);
                    break;
                    
                case 'merchantFormulaOverrideSet':
                    this.showNotification('Formula override saved', 'success');
                    break;
                    
                case 'itemList':
                    this.allItems = data.items || [];
                    break;
                    
                case 'allMaps':
                    this.allMaps = data.maps || [];
                    break;
                    
                case 'allRooms':
                    this.handleAllRoomsMessage(data);
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
        
        loadMerchantRooms() {
            this.loading = true;
            EditorBase.send({ type: 'getMerchantRooms' });
        },
        
        loadAllItems() {
            EditorBase.send({ type: 'getAllItems' });
        },
        
        loadAllMaps() {
            EditorBase.send({ type: 'getAllMaps' });
        },
        
        loadAllRooms() {
            EditorBase.send({ type: 'getAllRooms' });
        },
        
        selectRoom(room) {
            this.selectedRoom = room;
            this.isCreating = false;
            this.loading = true;
            EditorBase.send({ type: 'getMerchantRoomDetails', roomId: room.id });
        },
        
        loadFormulaOverride() {
            if (!this.selectedRoom) return;
            
            EditorBase.send({ type: 'getMerchantFormulaOverride', roomId: this.selectedRoom.id });
        },
        
        // ============================================
        // ROOM MANAGEMENT
        // ============================================
        
        showCreateRoomDialog() {
            this.showCreateDialog = true;
            this.createRoomMode = 'new';
            this.newRoomData = {
                mapId: '',
                x: 0,
                y: 0,
                name: '',
                description: ''
            };
            this.convertRoomId = '';
        },
        
        createMerchantRoom() {
            if (this.createRoomMode === 'new') {
                if (!this.newRoomData.mapId || !this.newRoomData.name) {
                    this.showNotification('Please fill in all required fields', 'error');
                    return;
                }
                
                this.loading = true;
                EditorBase.send({
                    type: 'createMerchantRoom',
                    data: this.newRoomData
                });
            } else {
                if (!this.convertRoomId) {
                    this.showNotification('Please select a room to convert', 'error');
                    return;
                }
                
                this.loading = true;
                EditorBase.send({
                    type: 'convertRoomToMerchant',
                    roomId: parseInt(this.convertRoomId)
                });
            }
        },
        
        saveRoom() {
            if (!this.selectedRoom) return;
            
            // Save formula override if enabled
            if (this.formulaOverrideEnabled) {
                EditorBase.send({
                    type: 'setMerchantFormulaOverride',
                    roomId: this.selectedRoom.id,
                    formulaConfig: this.formulaOverride,
                    active: true
                });
            } else {
                EditorBase.send({
                    type: 'setMerchantFormulaOverride',
                    roomId: this.selectedRoom.id,
                    formulaConfig: null,
                    active: false
                });
            }
            
            this.showNotification('Room configuration saved', 'success');
        },
        
        resetForm() {
            this.selectedRoom = null;
            this.roomInventory = [];
            this.newItemId = '';
            this.formulaOverrideEnabled = false;
            this.formulaOverride = {
                baseMultiplier: 1.0,
                acumenMultiplier: 0.01,
                maxDiscount: 0.5
            };
        },
        
        toggleFormulaOverride() {
            if (!this.formulaOverrideEnabled && this.selectedRoom) {
                // Load existing override if any
                EditorBase.send({ type: 'getMerchantFormulaOverride', roomId: this.selectedRoom.id });
            }
        },
        
        // ============================================
        // INVENTORY MANAGEMENT
        // ============================================
        
        addItemToInventory() {
            if (!this.newItemId || !this.selectedRoom) {
                this.showNotification('Please select an item and a room', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'addItemToMerchantInventory',
                roomId: this.selectedRoom.id,
                itemId: parseInt(this.newItemId),
                config: {
                    price: 0,
                    buyable: true,
                    sellable: false,
                    unlimited: true,
                    max_qty: null,
                    min_qty: null,
                    regen_hours: null
                }
            });
            
            this.newItemId = '';
        },
        
        updateMerchantItem(merchantItemId, updates) {
            EditorBase.send({
                type: 'updateMerchantItemConfig',
                merchantItemId: merchantItemId,
                config: updates
            });
        },
        
        removeItemFromInventory(merchantItemId) {
            if (!confirm('Remove this item from merchant inventory?')) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'removeItemFromMerchantInventory',
                merchantItemId: merchantItemId
            });
        },
        
        adjustItemQuantity(merchantItemId, delta) {
            EditorBase.send({
                type: 'adjustMerchantItemQuantity',
                merchantItemId: merchantItemId,
                delta: delta
            });
        },
        
        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.merchantRooms];
            
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(room => 
                    room.name.toLowerCase().includes(search) ||
                    room.map_name.toLowerCase().includes(search)
                );
            }
            
            this.filteredRooms = filtered;
        },
        
        // ============================================
        // NAVIGATION
        // ============================================
        
        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        },
        
        // ============================================
        // NOTIFICATIONS
        // ============================================
        
        showNotification(message, type = 'info') {
            this.notification = {
                show: true,
                message: message,
                type: type
            };
            setTimeout(() => {
                this.notification.show = false;
            }, 3000);
        }
    };
};

