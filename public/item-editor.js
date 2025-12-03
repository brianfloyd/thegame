// Item Editor - Standalone page
// Session-based authentication (no URL params needed)

// WebSocket connection
let ws = null;
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

// Item Editor State
let allItems = [];
let selectedItemId = null;
let allItemTypes = []; // All available item types from database
let warehouseRooms = []; // All warehouse rooms for deed configuration
let merchantRooms = []; // All merchant rooms for item configuration
let merchantItems = []; // Merchant items for currently selected item

// Non-blocking notification for editor errors
function showEditorNotification(message, type = 'info') {
    const existing = document.getElementById('editorNotification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'editorNotification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#660000' : '#003300'};
        border: 2px solid ${type === 'error' ? '#ff0000' : '#00ff00'};
        color: ${type === 'error' ? '#ff6666' : '#00ff00'};
        font-family: 'Courier New', monospace;
        font-size: 14px;
        z-index: 10000;
        max-width: 400px;
        word-wrap: break-word;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) notification.remove();
    }, 5000);
}

// Track if we're intentionally navigating away
let isNavigatingAway = false;

// Connect to WebSocket server
function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        // Authenticate with session
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'authenticateSession' }));
            // Request items and item types
            ws.send(JSON.stringify({ type: 'getAllItems' }));
            ws.send(JSON.stringify({ type: 'getAllItemTypes' }));
            ws.send(JSON.stringify({ type: 'getMerchantRooms' }));
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
        // Only auto-reconnect if we're not intentionally navigating away
        if (!isNavigatingAway) {
            setTimeout(connectWebSocket, 3000);
        }
    };
}

// Handle messages from server
function handleMessage(data) {
    switch (data.type) {
        case 'itemList':
            allItems = data.items;
            if (data.itemTypes) {
                allItemTypes = data.itemTypes;
            }
            if (data.warehouseRooms) {
                warehouseRooms = data.warehouseRooms;
            }
            if (data.merchantRooms) {
                merchantRooms = data.merchantRooms;
            }
            renderItemList();
            updateItemSelector();
            // Refresh form if item is selected to update dropdown
            if (selectedItemId) {
                const item = allItems.find(i => i.id === selectedItemId);
                if (item) {
                    showItemForm(item);
                }
            }
            break;
        case 'merchantRooms':
            if (data.rooms) {
                merchantRooms = data.rooms;
                // Refresh form if item is selected
                if (selectedItemId) {
                    const item = allItems.find(i => i.id === selectedItemId);
                    if (item) {
                        showItemForm(item);
                    }
                }
            }
            break;
        case 'merchantItems':
            if (data.merchantItems) {
                merchantItems = data.merchantItems;
                // Refresh form to show updated merchant items
                if (selectedItemId) {
                    const item = allItems.find(i => i.id === selectedItemId);
                    if (item) {
                        showItemForm(item);
                    }
                }
            }
            break;
        case 'merchantItemAdded':
        case 'merchantItemUpdated':
        case 'merchantItemRemoved':
            // Reload merchant items for the current item
            if (selectedItemId && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'getMerchantItems', itemId: selectedItemId }));
            }
            break;
        case 'warehouseRooms':
            if (data.rooms) {
                warehouseRooms = data.rooms;
                // Refresh form if item is selected and is a deed
                if (selectedItemId) {
                    const item = allItems.find(i => i.id === selectedItemId);
                    if (item && item.item_type === 'deed') {
                        showItemForm(item);
                    }
                }
            }
            break;
        case 'allItemTypes':
            if (data.itemTypes) {
                allItemTypes = data.itemTypes;
                console.log('Loaded item types from database:', allItemTypes);
                // Refresh form if item is selected to update dropdown
                if (selectedItemId) {
                    const item = allItems.find(i => i.id === selectedItemId);
                    if (item) {
                        showItemForm(item);
                    }
                }
            }
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
            showEditorNotification(data.message, 'error');
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
        // Load merchant items for this item
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getMerchantItems', itemId: itemId }));
        }
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
                    ${generateItemTypeOptions(item?.item_type || 'ingredient')}
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
            
            <div class="item-form-group">
                <label>
                    <input type="checkbox" id="itemPoofable" 
                           ${item && item.poofable ? 'checked' : ''}>
                    Poofable (disappears when player leaves room or disconnects)
                </label>
            </div>
            
            <div class="item-form-group">
                <label for="itemEncumbrance">Encumbrance (weight)</label>
                <input type="number" id="itemEncumbrance" class="item-form-input" 
                       value="${item ? (item.encumbrance || 1) : 1}" 
                       min="0" step="1"
                       placeholder="Enter item weight">
            </div>
            
            <div data-deed-config class="item-form-group" style="border-top: 2px solid #00ff00; margin-top: 20px; padding-top: 15px; display: ${item?.item_type === 'deed' ? 'block' : 'none'};">
                <h4 style="color: #ffff00; margin-bottom: 15px;">Deed Configuration</h4>
                
                <div class="item-form-group">
                    <label for="deedWarehouseRoom">Warehouse Room</label>
                    <select id="deedWarehouseRoom" class="item-form-select">
                        <option value="">-- Select Warehouse Room --</option>
                        ${generateWarehouseRoomOptions(item?.deed_warehouse_location_key || '')}
                    </select>
                </div>
                
                <div class="item-form-group">
                    <label for="deedMaxItemTypes">Max Item Types</label>
                    <input type="number" id="deedMaxItemTypes" class="item-form-input" 
                           value="${item ? (item.deed_base_max_item_types || 1) : 1}" 
                           min="1" step="1"
                           placeholder="Number of different item types that can be stored">
                </div>
                
                <div class="item-form-group">
                    <label for="deedMaxTotalItems">Max Total Items</label>
                    <input type="number" id="deedMaxTotalItems" class="item-form-input" 
                           value="${item ? (item.deed_max_total_items || 100) : 100}" 
                           min="1" step="1"
                           placeholder="Total number of items that can be stored">
                </div>
                
                <div class="item-form-group">
                    <label>
                        <input type="checkbox" id="deedAutomation" 
                               ${item && item.deed_automation_enabled ? 'checked' : ''}>
                        Enable Warehouse Automation
                    </label>
                    <div style="font-size: 0.85em; color: #888; margin-top: 5px;">
                        (Feature coming soon - currently for configuration only)
                    </div>
                </div>
            </div>
            
            <div data-merchant-config class="item-form-group" style="border-top: 2px solid #00ff00; margin-top: 20px; padding-top: 15px; display: ${item ? 'block' : 'none'};">
                <h4 style="color: #ffff00; margin-bottom: 15px;">Merchant Configuration</h4>
                <p style="font-size: 0.9em; color: #888; margin-bottom: 15px;">
                    Add this item to merchant rooms here. Configure pricing and inventory settings in the Map Editor.
                </p>
                
                <div class="item-form-group">
                    <label for="merchantRoomSelect">Add to Merchant Room</label>
                    <select id="merchantRoomSelect" class="item-form-select">
                        <option value="">-- Select Merchant Room --</option>
                        ${generateMerchantRoomOptions('')}
                    </select>
                    <button id="addMerchantRoomBtn" class="editor-btn" style="margin-top: 10px; width: 100%;">Add to Merchant</button>
                </div>
                
                <div id="merchantItemsList" class="merchant-items-list" style="margin-top: 20px;">
                    ${renderMerchantItemsList()}
                </div>
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
    
    // Add item type change handler to show/hide deed fields
    const itemTypeSelect = document.getElementById('itemType');
    if (itemTypeSelect) {
        itemTypeSelect.addEventListener('change', () => {
            // Re-render form to show/hide deed fields
            const currentItem = item || {};
            currentItem.item_type = itemTypeSelect.value;
            showItemForm(currentItem);
        });
    }
    
    // Add merchant room handlers
    const addMerchantRoomBtn = document.getElementById('addMerchantRoomBtn');
    if (addMerchantRoomBtn) {
        addMerchantRoomBtn.addEventListener('click', () => {
            const roomSelect = document.getElementById('merchantRoomSelect');
            const roomId = parseInt(roomSelect.value);
            if (!roomId) {
                showEditorNotification('Please select a merchant room', 'error');
                return;
            }
            if (!item || !item.id) {
                showEditorNotification('Item must be saved before adding to merchant', 'error');
                return;
            }
            
            // Add with default unlimited=true
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                    type: 'addItemToMerchant', 
                    itemId: item.id, 
                    roomId: roomId,
                    unlimited: true,
                    maxQty: null,
                    regenHours: null
                }));
            }
        });
    }
    
    // Add handlers for merchant item configuration
    setupMerchantItemHandlers();
}

// Setup event handlers for merchant items (simplified - only remove button)
function setupMerchantItemHandlers() {
    // Handle remove merchant item buttons
    document.querySelectorAll('.remove-merchant-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const merchantItemId = parseInt(e.target.dataset.merchantItemId);
            if (confirm('Remove this item from the merchant room?')) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ 
                        type: 'removeItemFromMerchant', 
                        merchantItemId: merchantItemId
                    }));
                }
            }
        });
    });
}

// Save item (create or update)
function saveItem(itemId) {
    const name = document.getElementById('itemName').value.trim();
    const itemType = document.getElementById('itemType').value;
    const description = document.getElementById('itemDescription').value.trim();
    const active = parseInt(document.getElementById('itemActive').value);
    const poofable = document.getElementById('itemPoofable').checked;
    const encumbrance = parseInt(document.getElementById('itemEncumbrance').value) || 1;
    
    if (!name) {
        alert('Item name is required');
        return;
    }
    
    const item = {
        name,
        item_type: itemType,
        description,
        active,
        poofable,
        encumbrance
    };
    
    // Add deed configuration if item type is deed
    if (itemType === 'deed') {
        const warehouseRoomSelect = document.getElementById('deedWarehouseRoom');
        const maxItemTypesInput = document.getElementById('deedMaxItemTypes');
        const maxTotalItemsInput = document.getElementById('deedMaxTotalItems');
        const automationCheckbox = document.getElementById('deedAutomation');
        
        if (warehouseRoomSelect) {
            item.deed_warehouse_location_key = warehouseRoomSelect.value || null;
        }
        if (maxItemTypesInput) {
            item.deed_base_max_item_types = parseInt(maxItemTypesInput.value) || 1;
        }
        if (maxTotalItemsInput) {
            item.deed_max_total_items = parseInt(maxTotalItemsInput.value) || 100;
        }
        if (automationCheckbox) {
            item.deed_automation_enabled = automationCheckbox.checked;
        }
    }
    
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

// Generate item type options HTML for dropdowns
// Load dynamically from database (item_types table)
function generateItemTypeOptions(selectedType) {
    // If we don't have item types yet, request them and use defaults as fallback
    if (allItemTypes.length === 0) {
        // Request item types from server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllItemTypes' }));
        }
        // Use defaults as fallback until database responds
        const defaults = ['ingredient', 'rune', 'deed'];
        return defaults.map(type => {
            const label = type.charAt(0).toUpperCase() + type.slice(1);
            const selected = type === selectedType ? 'selected' : '';
            return `<option value="${type}" ${selected}>${label}</option>`;
        }).join('');
    }
    
    // Use item types from database
    return allItemTypes.map(type => {
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        const selected = type === selectedType ? 'selected' : '';
        return `<option value="${type}" ${selected}>${label}</option>`;
    }).join('');
}

// Generate warehouse room options HTML for dropdowns
function generateWarehouseRoomOptions(selectedLocationKey) {
    // If we don't have warehouse rooms yet, request them
    if (warehouseRooms.length === 0) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getWarehouseRooms' }));
        }
        return '<option value="">Loading warehouse rooms...</option>';
    }
    
    // Use warehouse rooms from database
    return warehouseRooms.map(room => {
        const locationKey = room.id.toString();
        const label = `${room.map_name} - ${room.name} (${room.x}, ${room.y})`;
        const selected = locationKey === selectedLocationKey ? 'selected' : '';
        return `<option value="${locationKey}" ${selected}>${label}</option>`;
    }).join('');
}

// Generate merchant room options HTML for dropdowns
function generateMerchantRoomOptions(selectedRoomId) {
    // If we don't have merchant rooms yet, request them
    if (merchantRooms.length === 0) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getMerchantRooms' }));
        }
        return '<option value="">Loading merchant rooms...</option>';
    }
    
    // Filter out rooms that already have this item
    const existingRoomIds = merchantItems.map(mi => mi.room_id);
    const availableRooms = merchantRooms.filter(room => !existingRoomIds.includes(room.id));
    
    // Use merchant rooms from database
    return availableRooms.map(room => {
        const roomId = room.id.toString();
        const label = `${room.map_name} - ${room.name} (${room.x}, ${room.y})`;
        const selected = roomId === selectedRoomId ? 'selected' : '';
        return `<option value="${roomId}" ${selected}>${label}</option>`;
    }).join('');
}

// Render merchant items list (simplified - shows room and remove button only)
function renderMerchantItemsList() {
    if (!merchantItems || merchantItems.length === 0) {
        return '<p style="color: #888; font-size: 0.9em;">No merchant rooms configured for this item.</p>';
    }
    
    return merchantItems.map(mi => {
        const roomLabel = `${mi.map_name} - ${mi.room_name} (${mi.x}, ${mi.y})`;
        const priceDisplay = mi.price > 0 ? `${mi.price} gold` : 'Not set';
        
        return `
            <div class="merchant-item-entry" data-merchant-item-id="${mi.id}" style="border: 1px solid #00ff00; padding: 10px; margin-bottom: 10px; background: #001100;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: #ffff00;">${roomLabel}</strong>
                        <div style="font-size: 0.85em; color: #888; margin-top: 4px;">Price: ${priceDisplay}</div>
                    </div>
                    <button class="remove-merchant-item-btn editor-btn" data-merchant-item-id="${mi.id}" style="background: #660000; border-color: #ff0000; color: #ff6666; padding: 5px 10px; font-size: 0.85em;">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    
    // Close button
    const closeItemEditorBtn = document.getElementById('closeItemEditor');
    if (closeItemEditorBtn) {
        closeItemEditorBtn.addEventListener('click', () => {
            window.location.href = '/game';
        });
        
        // Add markup button (μ) next to close button
        if (typeof createMarkupButton !== 'undefined') {
            createMarkupButton('Item Editor', closeItemEditorBtn);
        }
    }

    // Editor navigation buttons
    document.querySelectorAll('.editor-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetEditor = btn.getAttribute('data-editor');
            
            // Mark that we're intentionally navigating away
            isNavigatingAway = true;
            
            // Close WebSocket gracefully before navigating
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close(1000, 'Navigating to another editor');
            }
            
            // Small delay to ensure close message is sent
            setTimeout(() => {
                if (targetEditor === 'map-editor') {
                    window.location.href = '/map-editor.html';
                } else if (targetEditor === 'npc-editor') {
                    window.location.href = '/npc-editor.html';
                }
            }, 100);
        });
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

