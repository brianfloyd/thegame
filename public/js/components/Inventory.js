/**
 * Inventory Component
 * 
 * Handles inventory display.
 */

import Component from '../core/Component.js';

export default class Inventory extends Component {
    constructor(game) {
        super(game);
    }
    
    init() {
        super.init();
        
        // Subscribe to inventory updates
        this.subscribe('inventory:update', (data) => this.displayInventory(data.items));
    }
    
    /**
     * Display inventory
     */
    displayInventory(items) {
        const terminalContent = document.getElementById('terminalContent');
        if (!terminalContent) return;
        
        if (!items || items.length === 0) {
            this.emit('terminal:message', { message: 'Your inventory is empty.', type: 'info' });
            return;
        }
        
        // Create container
        const container = document.createElement('div');
        container.className = 'inventory-display';
        
        // Add title
        const title = document.createElement('div');
        title.className = 'inventory-title';
        title.textContent = 'Inventory';
        container.appendChild(title);
        
        // Build HTML table
        const table = document.createElement('table');
        table.className = 'inventory-table';
        
        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const thItem = document.createElement('th');
        thItem.textContent = 'Item';
        const thQty = document.createElement('th');
        thQty.textContent = 'Qty';
        headerRow.appendChild(thItem);
        headerRow.appendChild(thQty);
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body rows
        const tbody = document.createElement('tbody');
        items.forEach(item => {
            const row = document.createElement('tr');
            row.draggable = true;
            row.dataset.itemName = item.item_name;
            row.dataset.quantity = item.quantity;
            row.style.cursor = 'grab';
            
            // Drag start handler
            row.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    itemName: item.item_name,
                    quantity: item.quantity
                }));
                e.dataTransfer.effectAllowed = 'move';
                row.style.opacity = '0.5';
            });
            
            // Drag end handler
            row.addEventListener('dragend', (e) => {
                row.style.opacity = '1';
            });
            
            const tdItem = document.createElement('td');
            tdItem.textContent = item.item_name;
            const tdQty = document.createElement('td');
            tdQty.textContent = item.quantity;
            row.appendChild(tdItem);
            row.appendChild(tdQty);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        
        container.appendChild(table);
        terminalContent.appendChild(container);
        terminalContent.scrollTop = terminalContent.scrollHeight;
    }
    
    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

