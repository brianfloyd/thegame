/**
 * FactoryWidget - Auto-managed widget for factory crafting
 * 
 * Handles Factory widget display when player is in factory-type rooms.
 * Auto-shows/hides based on room type.
 * 
 * **ARCHITECTURE:** Extends Widget (render-based) - ALL panel widgets use Widget system
 */

import Widget from './Widget.js';

export default class FactoryWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.currentState = null;
        this.delegationSetup = false;
        this.isCrafting = false;
        this.craftProgress = 0;
        this.craftProgressInterval = null;
        this.inFactoryRoom = false; // Track factory room state for visibility
    }
    
    init() {
        super.init();
        // No DOM lookups in init - done in onAttach
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-factory widget-theme-factory';
        root.setAttribute('data-widget', 'factory');
        root.id = 'widget-factory';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Factory Machine';
        root.appendChild(header);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'widget-content';
        
        // Quantity input (for ingredient slots)
        const quantityInputContainer = document.createElement('div');
        quantityInputContainer.style.cssText = 'margin-bottom: 10px; display: flex; align-items: center; gap: 8px;';
        
        const quantityLabel = document.createElement('label');
        quantityLabel.textContent = 'Quantity:';
        quantityLabel.style.cssText = 'color: #ff8800; font-size: 10px;';
        
        const quantityInput = document.createElement('input');
        quantityInput.id = 'factory-quantity-input';
        quantityInput.type = 'number';
        quantityInput.min = '1';
        quantityInput.value = '1';
        quantityInput.className = 'widget-input';
        quantityInput.style.cssText = 'width: 60px; padding: 4px;';
        
        quantityInputContainer.appendChild(quantityLabel);
        quantityInputContainer.appendChild(quantityInput);
        content.appendChild(quantityInputContainer);
        
        // Ingredient slots container (2 slots in a row)
        const ingredientContainer = document.createElement('div');
        ingredientContainer.className = 'factory-ingredient-container';
        
        // Create 2 ingredient slots
        for (let i = 0; i < 2; i++) {
            const slot = document.createElement('div');
            slot.id = `factory-slot-${i}`;
            slot.className = 'widget-factory-slot';
            
            // Slot label
            const slotLabel = document.createElement('div');
            slotLabel.className = 'factory-slot-label';
            slotLabel.style.cssText = 'font-size: 9px; color: #888; margin-bottom: 4px; text-transform: uppercase;';
            if (i === 0) slotLabel.textContent = 'Ingredient 1';
            else if (i === 1) slotLabel.textContent = 'Ingredient 2';
            slot.appendChild(slotLabel);
            
            // Slot content
            const slotContent = document.createElement('div');
            slotContent.className = 'factory-slot-content';
            slotContent.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; min-height: 40px; color: #ff8800; font-size: 10px; text-align: center;';
            slot.appendChild(slotContent);
            
            // Empty button (hidden initially)
            const emptyBtn = document.createElement('button');
            emptyBtn.className = 'factory-slot-empty-btn widget-btn widget-btn-small';
            emptyBtn.setAttribute('data-slot', i.toString());
            emptyBtn.textContent = 'Empty';
            emptyBtn.style.cssText = 'display: none; margin-top: 4px; width: 100%; font-size: 9px; padding: 2px 4px;';
            slot.appendChild(emptyBtn);
            
            ingredientContainer.appendChild(slot);
        }
        
        content.appendChild(ingredientContainer);
        
        // Rune slots container (3 slots in a row)
        const runeContainer = document.createElement('div');
        runeContainer.className = 'factory-rune-slots';
        runeContainer.style.cssText = 'margin-bottom: 10px;';
        
        // Create 3 rune slots
        for (let i = 2; i < 5; i++) {
            const slot = document.createElement('div');
            slot.id = `factory-slot-${i}`;
            slot.className = 'widget-factory-slot factory-slot-rune';
            
            // Slot label
            const slotLabel = document.createElement('div');
            slotLabel.className = 'factory-slot-label';
            slotLabel.style.cssText = 'font-size: 9px; color: #888; margin-bottom: 4px; text-transform: uppercase;';
            if (i === 2) slotLabel.textContent = 'Production Rune';
            else if (i === 3) slotLabel.textContent = 'Enhancement Rune';
            else if (i === 4) slotLabel.textContent = 'Modifier Rune';
            slot.appendChild(slotLabel);
            
            // Slot content
            const slotContent = document.createElement('div');
            slotContent.className = 'factory-slot-content';
            slotContent.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; min-height: 40px; color: #ff8800; font-size: 10px; text-align: center;';
            slot.appendChild(slotContent);
            
            // Empty button (hidden initially)
            const emptyBtn = document.createElement('button');
            emptyBtn.className = 'factory-slot-empty-btn widget-btn widget-btn-small';
            emptyBtn.setAttribute('data-slot', i.toString());
            emptyBtn.textContent = 'Empty';
            emptyBtn.style.cssText = 'display: none; margin-top: 4px; width: 100%; font-size: 9px; padding: 2px 4px;';
            slot.appendChild(emptyBtn);
            
            runeContainer.appendChild(slot);
        }
        
        content.appendChild(runeContainer);
        
        // Craft button
        const craftBtn = document.createElement('button');
        craftBtn.id = 'factory-craft-btn';
        craftBtn.className = 'widget-btn widget-btn-primary';
        craftBtn.textContent = 'Craft';
        craftBtn.style.cssText = 'width: 100%; margin-bottom: 10px; display: none;';
        content.appendChild(craftBtn);
        
        // Progress container (hidden initially)
        const progressContainer = document.createElement('div');
        progressContainer.id = 'factory-progress-container';
        progressContainer.style.cssText = 'display: none; margin-bottom: 10px;';
        
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width: 100%; height: 20px; background: #0a0a0a; border: 1px solid #ff8800; border-radius: 4px; overflow: hidden; margin-bottom: 4px;';
        
        const progressFill = document.createElement('div');
        progressFill.id = 'factory-progress-fill';
        progressFill.style.cssText = 'height: 100%; width: 0%; background: #ff8800; transition: width 0.1s linear;';
        progressBar.appendChild(progressFill);
        progressContainer.appendChild(progressBar);
        
        const progressText = document.createElement('div');
        progressText.id = 'factory-progress-text';
        progressText.style.cssText = 'text-align: center; color: #ff8800; font-size: 10px;';
        progressText.textContent = 'Crafting...';
        progressContainer.appendChild(progressText);
        
        content.appendChild(progressContainer);
        
        // Message element
        const messageEl = document.createElement('div');
        messageEl.id = 'factory-message';
        messageEl.style.cssText = 'display: none; padding: 8px; margin-top: 10px; border: 1px solid #ff8800; border-radius: 4px; font-size: 10px; text-align: center;';
        content.appendChild(messageEl);
        
        root.appendChild(content);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Attach drag-drop handlers to slots
        this.attachSlotHandlers();
        
        // Setup empty button handlers
        this.setupEmptyButtons();
        
        // Setup craft button handler
        this.setupCraftButton();
        
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        // Clean up progress interval
        if (this.craftProgressInterval) {
            clearInterval(this.craftProgressInterval);
            this.craftProgressInterval = null;
        }
        
        // Clear state
        this.currentState = null;
        this.isCrafting = false;
        this.inFactoryRoom = false;
    }
    
    /**
     * Handle backend messages routed from WidgetManager
     */
    onMessage(msg) {
        if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomChange(msg);
        } else if (msg.type === 'factoryWidgetState') {
            this.handleFactoryWidgetState(msg);
        } else if (msg.type === 'factoryCraftStarted') {
            this.handleCraftStarted(msg);
        } else if (msg.type === 'factoryCraftComplete') {
            this.handleCraftComplete(msg);
        } else if (msg.type === 'factoryCraftFizzle') {
            this.handleCraftFizzle(msg);
        }
    }
    
    /**
     * Handle room change (update or moved)
     */
    handleRoomChange(data) {
        if (!data.room) {
            this.inFactoryRoom = false;
            return;
        }
        
        const roomType = data.room.roomType || data.room.room_type;
        
        if (roomType === 'factory') {
            // In factory room - update state
            this.inFactoryRoom = true;
            const factoryState = data.factoryWidgetState || { slots: [null, null, null, null, null] };
            this.currentState = factoryState;
            this.updateSlots(factoryState);
        } else {
            // Not in factory room
            this.inFactoryRoom = false;
        }
    }
    
    /**
     * Handle factoryWidgetState message directly
     */
    handleFactoryWidgetState(data) {
        if (!data || !data.state) return;
        this.currentState = data.state;
        this.updateSlots(data.state);
    }
    
    /**
     * Attach drag-drop handlers DIRECTLY to each factory slot element
     */
    attachSlotHandlers() {
        if (!this.rootElement) return;
        
        for (let i = 0; i < 5; i++) {
            this.attachHandlerToSlot(i);
        }
        
        this.delegationSetup = true;
    }
    
    /**
     * Attach handlers to a specific slot by index
     */
    attachHandlerToSlot(slotIndex) {
        const slot = this.rootElement.querySelector(`#factory-slot-${slotIndex}`);
        if (!slot) {
            console.warn(`[FactoryWidget] Slot ${slotIndex} not found in DOM`);
            return;
        }
        
        // Store reference to this widget instance
        const widget = this;
        
        // Remove old handlers by removing the marker
        if (slot._factoryHandlersAttached) {
            return;
        }
        
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
                    const quantityInput = widget.rootElement.querySelector('#factory-quantity-input');
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
     * Setup empty slot button event listeners using delegation
     */
    setupEmptyButtons() {
        if (!this.rootElement) return;
        
        const container = this.rootElement.querySelector('.factory-slot-container');
        if (!container) return;
        
        // Use delegation for empty buttons
        if (container._emptyButtonHandler) {
            container.removeEventListener('click', container._emptyButtonHandler);
        }
        
        const widget = this;
        container._emptyButtonHandler = (e) => {
            // Check if clicked on empty button
            if (e.target.classList.contains('factory-slot-empty-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const slotIndex = parseInt(e.target.dataset.slot, 10);
                if (!isNaN(slotIndex)) {
                    widget.emptySlot(slotIndex);
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
        if (!this.rootElement || !state || !state.slots) return;
        
        // Update all 5 slots (2 supply slots + 3 rune slots)
        for (let i = 0; i < 5; i++) {
            const slotEl = this.rootElement.querySelector(`#factory-slot-${i}`);
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
        
        // Update craft button visibility based on Production Rune presence
        this.updateCraftButtonVisibility();
    }
    
    /**
     * Initialize craft button handler
     */
    setupCraftButton() {
        if (!this.rootElement) return;
        
        const craftBtn = this.rootElement.querySelector('#factory-craft-btn');
        if (!craftBtn) return;
        
        const widget = this;
        craftBtn.addEventListener('click', () => {
            if (widget.isCrafting) return;
            widget.startCraft();
        });
        
        console.log('[FactoryWidget] Craft button handler setup');
    }
    
    /**
     * Check if Production Rune is in slot 2 (required for crafting)
     */
    hasProductionRune() {
        if (!this.currentState || !this.currentState.slots) return false;
        
        const slot2 = this.currentState.slots[2];
        if (!slot2 || !slot2.itemName) return false;
        
        // Check if it's a production rune by type or name
        if (slot2.runeType === 'PRODUCTION') return true;
        
        const name = (slot2.itemName || '').toLowerCase();
        return name.includes('production') || name.includes('factory') || name.includes('harvester');
    }
    
    /**
     * Update craft button visibility based on Production Rune presence
     */
    updateCraftButtonVisibility() {
        if (!this.rootElement) return;
        
        const craftBtn = this.rootElement.querySelector('#factory-craft-btn');
        if (!craftBtn) return;
        
        const hasRune = this.hasProductionRune();
        craftBtn.style.display = hasRune && !this.isCrafting ? 'block' : 'none';
    }
    
    /**
     * Start crafting
     */
    startCraft() {
        if (this.isCrafting) return;
        if (!this.hasProductionRune()) {
            this.showMessage('A Production Rune is required in the production slot to craft.', 'error');
            return;
        }
        
        console.log('[FactoryWidget] Starting craft');
        this.game.send({ type: 'factoryCraft' });
    }
    
    /**
     * Handle craft started message
     */
    handleCraftStarted(data) {
        if (!this.rootElement) return;
        
        console.log('[FactoryWidget] Craft started:', data);
        
        this.isCrafting = true;
        this.craftProgress = 0;
        
        // Hide craft button, show progress
        const craftBtn = this.rootElement.querySelector('#factory-craft-btn');
        const progressContainer = this.rootElement.querySelector('#factory-progress-container');
        const progressFill = this.rootElement.querySelector('#factory-progress-fill');
        const progressText = this.rootElement.querySelector('#factory-progress-text');
        
        if (craftBtn) craftBtn.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) {
            progressText.textContent = `Crafting ${data.recipeName || 'item'}...`;
        }
        
        // Show success rate info
        this.showMessage(`Crafting ${data.recipeName || 'item'} (${data.successRate || '?'}% success, ${data.critChance || '?'}% crit)`, 'info');
        
        // Start progress animation
        const craftTimeMs = data.craftTimeMs || 5000;
        const updateInterval = 100;
        const totalUpdates = craftTimeMs / updateInterval;
        let currentUpdate = 0;
        
        this.craftProgressInterval = setInterval(() => {
            currentUpdate++;
            const progress = Math.min(100, (currentUpdate / totalUpdates) * 100);
            
            const fill = this.rootElement?.querySelector('#factory-progress-fill');
            if (fill) {
                fill.style.width = `${progress}%`;
            }
            
            if (currentUpdate >= totalUpdates) {
                clearInterval(this.craftProgressInterval);
                this.craftProgressInterval = null;
            }
        }, updateInterval);
    }
    
    /**
     * Handle craft complete message
     */
    handleCraftComplete(data) {
        if (!this.rootElement) return;
        
        console.log('[FactoryWidget] Craft complete:', data);
        
        this.isCrafting = false;
        
        // Clear progress interval if still running
        if (this.craftProgressInterval) {
            clearInterval(this.craftProgressInterval);
            this.craftProgressInterval = null;
        }
        
        // Hide progress
        const progressContainer = this.rootElement.querySelector('#factory-progress-container');
        if (progressContainer) progressContainer.style.display = 'none';
        
        // Show result message
        if (data.success) {
            const critText = data.critical ? ' CRITICAL SUCCESS!' : '';
            this.showMessage(data.message || `Successfully crafted!${critText}`, data.critical ? 'critical' : 'success');
        } else {
            this.showMessage(data.message || 'Crafting failed.', 'failure');
        }
        
        // Update craft button visibility (it will reappear if Production Rune still present)
        this.updateCraftButtonVisibility();
    }
    
    /**
     * Handle craft fizzle message (invalid recipe)
     */
    handleCraftFizzle(data) {
        if (!this.rootElement) return;
        
        console.log('[FactoryWidget] Craft fizzle:', data);
        
        this.isCrafting = false;
        
        // Clear progress interval if running
        if (this.craftProgressInterval) {
            clearInterval(this.craftProgressInterval);
            this.craftProgressInterval = null;
        }
        
        // Hide progress
        const progressContainer = this.rootElement.querySelector('#factory-progress-container');
        if (progressContainer) progressContainer.style.display = 'none';
        
        // Show fizzle message
        this.showMessage(data.message || 'The ingredients don\'t form a valid recipe.', 'fizzle');
        
        // Update craft button visibility
        this.updateCraftButtonVisibility();
    }
    
    /**
     * Show a message in the factory widget
     */
    showMessage(text, type = 'info') {
        if (!this.rootElement) return;
        
        const messageEl = this.rootElement.querySelector('#factory-message');
        if (!messageEl) return;
        
        messageEl.textContent = text;
        messageEl.className = `factory-message factory-message-${type}`;
        messageEl.style.display = 'block';
        
        // Auto-hide after delay
        setTimeout(() => {
            if (messageEl.parentElement) {
                messageEl.style.display = 'none';
            }
        }, type === 'critical' || type === 'success' ? 5000 : 3000);
    }
    
    /**
     * Get visibility state (for WidgetManager)
     * WidgetManager checks this.inFactoryRoom to determine visibility
     */
    getVisibility() {
        return this.inFactoryRoom;
    }
}
