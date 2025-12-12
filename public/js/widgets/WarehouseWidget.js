/**
 * WarehouseWidget
 * 
 * Warehouse storage widget for managing warehouse items.
 */

import Widget from './Widget.js';

export default class WarehouseWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.warehouseState = null;
    }
    
    init() {
        super.init();
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget';
        root.setAttribute('data-widget', 'warehouse');
        
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Warehouse';
        root.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'widget-content';
        
        if (this.warehouseState) {
            // Render warehouse state
            const itemsList = document.createElement('div');
            itemsList.className = 'warehouse-items';
            
            if (this.warehouseState.items && this.warehouseState.items.length > 0) {
                this.warehouseState.items.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'warehouse-item';
                    itemDiv.textContent = `${item.item_name} x${item.quantity}`;
                    itemsList.appendChild(itemDiv);
                });
            } else {
                itemsList.textContent = 'No items stored.';
            }
            
            content.appendChild(itemsList);
        } else {
            content.textContent = 'No warehouse access.';
        }
        
        root.appendChild(content);
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Setup if needed
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        // Cleanup handled by DOM removal
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            if (msg.warehouseWidgetState) {
                this.warehouseState = msg.warehouseWidgetState;
                if (this.rootElement) {
                    const newRoot = this.render();
                    if (this.rootElement.parentElement) {
                        this.rootElement.parentElement.replaceChild(newRoot, this.rootElement);
                        this.rootElement = newRoot;
                        this.onAttach();
                    }
                }
            }
        }
    }
}

