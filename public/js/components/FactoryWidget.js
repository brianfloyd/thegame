/**
 * FactoryWidget Component
 * 
 * Handles Factory widget display when player is in factory-type rooms.
 * Auto-shows/hides based on room type.
 */

import Component from '../core/Component.js';

export default class FactoryWidget extends Component {
    constructor(game) {
        super(game);
        this.isVisible = false;
        this.currentState = null;
        this.delegationSetup = false;
    }
    
    init() {
        super.init();
        
        // Subscribe to room updates to check for factory rooms
        this.subscribe('room:update', (data) => this.handleRoomUpdate(data));
        this.subscribe('room:moved', (data) => this.handleRoomMoved(data));
        
        // Subscribe to factoryWidgetState messages for direct state updates
        this.subscribe('factoryWidgetState', (data) => this.handleFactoryWidgetState(data));
        
        // Initialize drag and drop using event delegation
        this.initDragDropDelegation();
        
        // Initialize empty slot button handlers
        this.initEmptyButtons();
        
        console.log('[FactoryWidget] Initialized');
    }
    
    /**
     * Initialize drag and drop - attach handlers directly to each slot
     */
    initDragDropDelegation() {
        // Wait for DOM to be ready, then setup
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.attachSlotHandlers());
        } else {
            this.attachSlotHandlers();
        }
    }
    
    /**
     * Attach drag-drop handlers DIRECTLY to each factory slot element
     */
    attachSlotHandlers() {
        console.log('[FactoryWidget] Attaching handlers to all 5 slots');
        
        for (let i = 0; i < 5; i++) {
            this.attachHandlerToSlot(i);
        }
        
        this.delegationSetup = true;
        console.log('[FactoryWidget] All slot handlers attached');
    }
    
    /**
     * Attach handlers to a specific slot by index
     */
    attachHandlerToSlot(slotIndex) {
        const slot = document.getElementById(`factory-slot-${slotIndex}`);
        if (!slot) {
            console.warn(`[FactoryWidget] Slot ${slotIndex} not found in DOM`);
            return;
        }
        
        // Store reference to this widget instance
        const widget = this;
        
        // Remove old handlers by removing the marker
        if (slot._factoryHandlersAttached) {
            console.log(`[FactoryWidget] Slot ${slotIndex} already has handlers`);
            return;
        }
        
        console.log(`[FactoryWidget] Attaching handlers to slot ${slotIndex}`);
        
        // Dragover handler
        slot.ondragover = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
        };
        
        // Dragleave handler  
        slot.ondragleave = function(e) {
            e.stopPropagation();
            this.classList.remove('drag-over');
        };
        
        // Drop handler - THIS IS THE KEY ONE
        slot.ondrop = function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.remove('drag-over');
            
            console.log(`[FactoryWidget] DROP on slot ${slotIndex}`);
            
            try {
                const dragData = e.dataTransfer.getData('text/plain');
                console.log(`[FactoryWidget] Drag data for slot ${slotIndex}:`, dragData);
                
                if (!dragData) {
                    console.warn(`[FactoryWidget] No drag data`);
                    return;
                }
                
                const data = JSON.parse(dragData);
                console.log(`[FactoryWidget] Parsed data:`, data);
                
                const itemName = data.itemName;
                if (!itemName) {
                    console.warn(`[FactoryWidget] No itemName in data`);
                    return;
                }
                
                // Get quantity from input field (default to 1)
                // Rune slots (2, 3, 4) only accept single items, ignore quantity input
                const isRuneSlot = slotIndex >= 2 && slotIndex <= 4;
                let quantity = 1;
                
                if (!isRuneSlot) {
                    // Ingredient slots (0, 1) can use quantity input
                    const quantityInput = document.getElementById('factory-quantity-input');
                    if (quantityInput) {
                        const inputValue = parseInt(quantityInput.value, 10);
                        if (!isNaN(inputValue) && inputValue > 0) {
                            quantity = inputValue;
                        }
                    }
                }
                
                // Build and send message
                const message = {
                    type: 'factoryWidgetAddItem',
                    slotIndex: slotIndex,
                    itemName: itemName,
                    quantity: quantity
                };
                
                console.log(`[FactoryWidget] Sending:`, JSON.stringify(message));
                widget.game.send(message);
                
            } catch (err) {
                console.error(`[FactoryWidget] Drop error:`, err);
            }
        };
        
        // Mark as attached
        slot._factoryHandlersAttached = true;
    }
    
    /**
     * Re-attach handlers (called when widget is shown)
     */
    setupDelegation() {
        // Re-attach handlers to all slots in case DOM was updated
        for (let i = 0; i < 5; i++) {
            const slot = document.getElementById(`factory-slot-${i}`);
            if (slot) {
                // Force re-attach by clearing the flag
                slot._factoryHandlersAttached = false;
            }
        }
        this.attachSlotHandlers();
    }
    
    /**
     * Handle room update events
     */
    handleRoomUpdate(data) {
        this.handleRoomChange(data);
    }
    
    /**
     * Handle room moved events
     */
    handleRoomMoved(data) {
        this.handleRoomChange(data);
    }
    
    /**
     * Handle room change (update or moved)
     */
    handleRoomChange(data) {
        if (!data.room) {
            this.hide();
            return;
        }
        
        const roomType = data.room.roomType || data.room.room_type;
        console.log('[FactoryWidget] Room change detected - roomType:', roomType, 'room:', data.room.name);
        
        if (roomType === 'factory') {
            // In factory room - show widget
            const factoryState = data.factoryWidgetState || { slots: [null, null, null, null, null] };
            console.log('[FactoryWidget] In factory room, showing widget with state:', factoryState);
            this.show(factoryState);
        } else {
            // Not in factory room - hide widget
            console.log('[FactoryWidget] Not in factory room, hiding widget');
            this.hide();
        }
    }
    
    /**
     * Show the Factory widget with state
     */
    show(state) {
        const widget = document.getElementById('widget-factory');
        if (!widget) {
            console.error('[FactoryWidget] Widget element not found: widget-factory');
            return;
        }
        
        this.isVisible = true;
        this.currentState = state || { slots: [null, null, null, null, null] };
        
        // Update widget slots
        this.updateSlots(this.currentState);
        
        // Ensure delegation is setup (only runs once)
        this.setupDelegation();
        
        // Set global flag for updateWidgetDisplay
        if (typeof window.factoryWidgetVisible !== 'undefined') {
            window.factoryWidgetVisible = true;
        }
        
        // Update widget display
        if (typeof window.updateWidgetDisplay === 'function') {
            window.updateWidgetDisplay();
        }
        
        console.log('[FactoryWidget] Widget shown, isVisible:', this.isVisible);
    }
    
    /**
     * Hide the Factory widget
     */
    hide() {
        if (!this.isVisible) return;
        
        this.isVisible = false;
        this.currentState = null;
        
        // Set global flag for updateWidgetDisplay
        if (typeof window.factoryWidgetVisible !== 'undefined') {
            window.factoryWidgetVisible = false;
        }
        
        // Update widget display
        if (typeof window.updateWidgetDisplay === 'function') {
            window.updateWidgetDisplay();
        }
        
        console.log('[FactoryWidget] Widget hidden');
    }
    
    /**
     * Handle factoryWidgetState message directly
     */
    handleFactoryWidgetState(data) {
        if (!data || !data.state) return;
        console.log('[FactoryWidget] Received factoryWidgetState message:', data.state);
        this.currentState = data.state;
        this.updateSlots(data.state);
    }
    
    /**
     * Initialize empty slot button handlers
     */
    initEmptyButtons() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEmptyButtons());
        } else {
            this.setupEmptyButtons();
        }
    }
    
    /**
     * Setup empty slot button event listeners using delegation
     */
    setupEmptyButtons() {
        const container = document.querySelector('.factory-slot-container');
        if (!container) return;
        
        // Use delegation for empty buttons too
        if (container._emptyButtonHandler) {
            container.removeEventListener('click', container._emptyButtonHandler);
        }
        
        container._emptyButtonHandler = (e) => {
            // Check if clicked on empty button
            if (e.target.classList.contains('factory-slot-empty-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const slotIndex = parseInt(e.target.dataset.slot, 10);
                if (!isNaN(slotIndex)) {
                    this.emptySlot(slotIndex);
                }
            }
        };
        
        container.addEventListener('click', container._emptyButtonHandler);
        console.log('[FactoryWidget] Empty button delegation setup');
    }
    
    /**
     * Empty a slot (return items to inventory)
     */
    emptySlot(slotIndex) {
        if (!this.currentState || !this.currentState.slots || !this.currentState.slots[slotIndex]) {
            console.log(`[FactoryWidget] Slot ${slotIndex} is already empty`);
            return;
        }
        
        console.log(`[FactoryWidget] Emptying slot ${slotIndex}`);
        
        // Send message to server to remove item from slot
        this.game.send({
            type: 'factoryWidgetRemoveItem',
            slotIndex: slotIndex
        });
    }
    
    /**
     * Update factory widget slots display
     */
    updateSlots(state) {
        if (!state || !state.slots) return;
        
        // Update all 5 slots (2 supply slots + 3 rune slots)
        for (let i = 0; i < 5; i++) {
            const slotEl = document.getElementById(`factory-slot-${i}`);
            if (!slotEl) continue;
            
            const content = slotEl.querySelector('.factory-slot-content');
            if (!content) continue;
            
            const emptyBtn = slotEl.querySelector('.factory-slot-empty-btn');
            
            if (state.slots[i]) {
                const slot = state.slots[i];
                const isRuneSlot = i >= 2; // Slots 2, 3, 4 are rune slots
                const isRune = slot.itemType === 'rune';
                
                if (isRuneSlot && isRune && slot.runeColor) {
                    // Rune in rune slot - show color on the diamond itself
                    content.textContent = '';
                    content.style.backgroundColor = '';
                    content.style.border = '';
                    content.className = 'factory-slot-content filled';
                    
                    // Set background color on the slot element (the diamond)
                    slotEl.style.setProperty('--rune-color', slot.runeColor);
                    slotEl.style.backgroundColor = slot.runeColor;
                    slotEl.style.borderColor = slot.runeColor;
                    slotEl.style.borderStyle = 'solid';
                    slotEl.classList.add('factory-slot-rune-colored');
                } else {
                    // Regular item - show text
                    if (slot.quantity > 1) {
                        content.textContent = `${slot.itemName} (x${slot.quantity})`;
                    } else {
                        content.textContent = slot.itemName;
                    }
                    content.style.backgroundColor = '';
                    content.style.border = '';
                    content.className = 'factory-slot-content filled';
                    
                    // Clear slot background for non-rune items
                    slotEl.style.removeProperty('--rune-color');
                    slotEl.style.backgroundColor = '';
                    slotEl.style.borderColor = '';
                    slotEl.style.borderStyle = '';
                    slotEl.classList.remove('factory-slot-rune-colored');
                }
                
                // Show empty button when slot has items
                if (emptyBtn) {
                    emptyBtn.style.display = 'block';
                }
            } else {
                content.textContent = '';
                content.style.backgroundColor = '';
                content.style.border = '';
                content.className = 'factory-slot-content';
                
                // Clear slot background when empty
                slotEl.style.removeProperty('--rune-color');
                slotEl.style.backgroundColor = '';
                slotEl.style.borderColor = '';
                slotEl.style.borderStyle = '';
                slotEl.classList.remove('factory-slot-rune-colored');
                
                // Hide empty button when slot is empty
                if (emptyBtn) {
                    emptyBtn.style.display = 'none';
                }
            }
        }
    }
    
    /**
     * Get visibility state
     */
    getVisibility() {
        return this.isVisible;
    }
}
