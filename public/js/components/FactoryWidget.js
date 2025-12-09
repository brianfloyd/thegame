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
    }
    
    init() {
        super.init();
        
        // Subscribe to room updates to check for factory rooms
        this.subscribe('room:update', (data) => this.handleRoomUpdate(data));
        this.subscribe('room:moved', (data) => this.handleRoomMoved(data));
        
        // Subscribe to factoryWidgetState messages for direct state updates
        this.subscribe('factoryWidgetState', (data) => this.handleFactoryWidgetState(data));
        
        // Initialize drag and drop handlers
        this.initDragDrop();
        
        // Initialize empty slot button handlers
        this.initEmptyButtons();
        
        console.log('[FactoryWidget] Initialized');
    }
    
    /**
     * Initialize drag and drop handlers for factory slots
     */
    initDragDrop() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupDragDrop());
        } else {
            this.setupDragDrop();
        }
    }
    
    /**
     * Setup drag and drop event listeners
     */
    setupDragDrop() {
        // All 5 slots support drag and drop (2 supply slots + 3 rune slots)
        for (let i = 0; i < 5; i++) {
            const slot = document.getElementById(`factory-slot-${i}`);
            if (!slot) {
                console.warn(`[FactoryWidget] Slot ${i} not found`);
                continue;
            }
            
            // Allow drop
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                slot.classList.add('drag-over');
            });
            
            slot.addEventListener('dragleave', (e) => {
                slot.classList.remove('drag-over');
            });
            
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const itemName = data.itemName;
                    
                    if (!itemName) return;
                    
                    // Send message to server to add item to slot
                    this.game.send({
                        type: 'factoryWidgetAddItem',
                        slotIndex: i,
                        itemName: itemName
                    });
                    
                    console.log(`[FactoryWidget] Dropped ${itemName} into slot ${i}`);
                } catch (err) {
                    console.error('[FactoryWidget] Error parsing drag data:', err);
                }
            });
        }
        
        console.log('[FactoryWidget] Drag and drop initialized');
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
     * Setup empty slot button event listeners
     */
    setupEmptyButtons() {
        for (let i = 0; i < 5; i++) {
            const btn = document.querySelector(`#factory-slot-${i} .factory-slot-empty-btn`);
            if (!btn) {
                console.warn(`[FactoryWidget] Empty button for slot ${i} not found`);
                continue;
            }
            
            // Remove existing listener if any (to prevent duplicates)
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.emptySlot(i);
            });
        }
        
        console.log('[FactoryWidget] Empty slot buttons initialized');
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
                    // Rune in rune slot - show color on the diamond itself, not the content
                    content.textContent = ''; // No text
                    content.style.backgroundColor = '';
                    content.style.border = '';
                    content.className = 'factory-slot-content filled';
                    
                    // Set background color on the slot element (the diamond)
                    // Set CSS variable for the CSS rule, and also set inline style as fallback
                    slotEl.style.setProperty('--rune-color', slot.runeColor);
                    slotEl.style.backgroundColor = slot.runeColor;
                    slotEl.style.borderColor = slot.runeColor;
                    slotEl.style.borderStyle = 'solid';
                    slotEl.classList.add('factory-slot-rune-colored');
                } else {
                    // Regular item or non-rune in rune slot - show text
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
        
        // Re-setup empty buttons after DOM update (in case buttons were recreated)
        this.setupEmptyButtons();
    }
    
    /**
     * Get visibility state
     */
    getVisibility() {
        return this.isVisible;
    }
}

