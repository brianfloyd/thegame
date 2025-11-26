// Item Editor - Standalone page
// Session-based authentication (no URL params needed)

// WebSocket connection
let ws = null;
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.hostname}:3434`;

// Item Editor State
let allItems = [];
let selectedItemId = null;

// Connect to WebSocket server
function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        // Authenticate with session
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'authenticateSession' }));
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
    };
}

// Handle messages from server
function handleMessage(data) {
    switch (data.type) {
        case 'itemList':
            allItems = data.items;
            renderItemList();
            updateItemSelector();
            break;
        case 'itemCreated':
            allItems.push(data.item);
            renderItemList();
            updateItemSelector();
            selectItem(data.item.id);
            break;
        case 'itemUpdated':
            const idx = allItems.findIndex(i => i.id === data.item.id);
            if (idx !== -1) {
                allItems[idx] = data.item;
            }
            renderItemList();
            updateItemSelector();
            showItemForm(data.item);
            break;
        case 'error':
            alert(data.message);
            break;
    }
}

// Render the item list
function renderItemList() {
    const listContainer = document.getElementById('itemList');
    listContainer.innerHTML = '';

    allItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-list-item' + (item.id === selectedItemId ? ' selected' : '');
        itemDiv.dataset.itemId = item.id;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-list-name';
        nameSpan.textContent = item.name;
        
        const typeSpan = document.createElement('span');
        typeSpan.className = 'item-list-type';
        typeSpan.textContent = item.item_type;
        
        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(typeSpan);
        
        itemDiv.addEventListener('click', () => selectItem(item.id));
        listContainer.appendChild(itemDiv);
    });
}

// Update item selector dropdown
function updateItemSelector() {
    const selector = document.getElementById('itemSelector');
    selector.innerHTML = '<option value="">Select an item...</option>';
    
    allItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        if (item.id === selectedItemId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

// Select an item
function selectItem(itemId) {
    selectedItemId = itemId;
    renderItemList();
    updateItemSelector();
    
    const item = allItems.find(i => i.id === itemId);
    if (item) {
        showItemForm(item);
    }
}

// Show item edit form
function showItemForm(item = null) {
    const panel = document.getElementById('itemPanelContent');
    const isNew = !item;
    
    panel.innerHTML = `
        <div class="item-editor-form">
            <h3 class="item-form-title">${isNew ? 'Create New Item' : 'Edit Item'}</h3>
            
            <div class="item-form-group">
                <label for="itemName">Name</label>
                <input type="text" id="itemName" class="item-form-input" 
                       value="${item ? escapeHtml(item.name) : ''}" 
                       placeholder="Enter item name">
            </div>
            
            <div class="item-form-group">
                <label for="itemType">Type</label>
                <select id="itemType" class="item-form-select">
                    <option value="sundries" ${item?.item_type === 'sundries' ? 'selected' : ''}>Sundries</option>
                    <option value="weapon" ${item?.item_type === 'weapon' ? 'selected' : ''}>Weapon</option>
                    <option value="armor" ${item?.item_type === 'armor' ? 'selected' : ''}>Armor</option>
                    <option value="consumable" ${item?.item_type === 'consumable' ? 'selected' : ''}>Consumable</option>
                    <option value="material" ${item?.item_type === 'material' ? 'selected' : ''}>Material</option>
                    <option value="quest" ${item?.item_type === 'quest' ? 'selected' : ''}>Quest</option>
                </select>
            </div>
            
            <div class="item-form-group">
                <label for="itemDescription">Description</label>
                <textarea id="itemDescription" class="item-form-textarea" 
                          placeholder="Enter item description" rows="6">${item ? escapeHtml(item.description || '') : ''}</textarea>
            </div>
            
            <div class="item-form-group">
                <label for="itemActive">Active</label>
                <select id="itemActive" class="item-form-select">
                    <option value="1" ${!item || item.active ? 'selected' : ''}>Yes</option>
                    <option value="0" ${item && !item.active ? 'selected' : ''}>No</option>
                </select>
            </div>
            
            <div class="item-form-actions">
                <button id="saveItemBtn" class="editor-btn item-save-btn">${isNew ? 'Create Item' : 'Save Item'}</button>
            </div>
        </div>
    `;
    
    // Add save handler
    document.getElementById('saveItemBtn').addEventListener('click', () => {
        saveItem(item ? item.id : null);
    });
}

// Save item (create or update)
function saveItem(itemId) {
    const name = document.getElementById('itemName').value.trim();
    const itemType = document.getElementById('itemType').value;
    const description = document.getElementById('itemDescription').value.trim();
    const active = parseInt(document.getElementById('itemActive').value);
    
    if (!name) {
        alert('Item name is required');
        return;
    }
    
    const item = {
        name,
        item_type: itemType,
        description,
        active
    };
    
    if (itemId) {
        // Update existing
        item.id = itemId;
        ws.send(JSON.stringify({ type: 'updateItem', item }));
    } else {
        // Create new
        ws.send(JSON.stringify({ type: 'createItem', item }));
    }
}

// Show create new item form
function showCreateForm() {
    selectedItemId = null;
    renderItemList();
    document.getElementById('itemSelector').value = '';
    showItemForm(null);
}

// Escape HTML for safe display
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    
    // Close button
    document.getElementById('closeItemEditor').addEventListener('click', () => {
        window.location.href = '/game';
    });
    
    // Create new item button
    document.getElementById('createNewItemBtn').addEventListener('click', showCreateForm);
    
    // Item selector change
    document.getElementById('itemSelector').addEventListener('change', (e) => {
        const itemId = parseInt(e.target.value);
        if (itemId) {
            selectItem(itemId);
        }
    });
    
    // Request item list after WebSocket connects
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllItems' }));
        }
    }, 500);
});

