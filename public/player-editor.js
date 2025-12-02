// Player Editor - God Mode page
// Session-based authentication (no URL params needed)

// WebSocket connection
let ws = null;
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

// Player Editor State
let allPlayers = [];
let selectedPlayerId = null;
let allItems = [];
let playerInventory = [];
let currentEncumbrance = 0;

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
        case 'roomUpdate':
        case 'playerStats':
            // Authentication succeeded - now request player list and items
            if (allPlayers.length === 0) {
                ws.send(JSON.stringify({ type: 'getAllPlayers' }));
                ws.send(JSON.stringify({ type: 'getAllItems' }));
            }
            break;
        case 'playerList':
            allPlayers = data.players;
            renderPlayerList();
            updatePlayerSelector();
            break;
        case 'playerUpdated':
            const idx = allPlayers.findIndex(p => p.id === data.player.id);
            if (idx !== -1) {
                allPlayers[idx] = data.player;
            }
            renderPlayerList();
            updatePlayerSelector();
            showPlayerForm(data.player);
            // Reload inventory after player update
            if (data.player.id === selectedPlayerId) {
                ws.send(JSON.stringify({ type: 'getPlayerInventory', playerId: data.player.id }));
            }
            showEditorNotification('Player updated successfully', 'info');
            break;
        case 'itemList':
            allItems = data.items || [];
            updateItemSelector();
            // If a player is selected, refresh the item selector in the form
            if (selectedPlayerId) {
                const player = allPlayers.find(p => p.id === selectedPlayerId);
                if (player) {
                    updateItemSelector();
                }
            }
            break;
        case 'playerInventory':
            playerInventory = data.inventory || [];
            currentEncumbrance = data.currentEncumbrance || 0;
            renderInventory();
            break;
        case 'playerInventoryUpdated':
            playerInventory = data.inventory || [];
            currentEncumbrance = data.currentEncumbrance || 0;
            renderInventory();
            showEditorNotification('Inventory updated', 'info');
            break;
        case 'error':
            showEditorNotification(data.message, 'error');
            break;
    }
}

// Render the player list
function renderPlayerList() {
    const listContainer = document.getElementById('playerList');
    listContainer.innerHTML = '';

    allPlayers.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-list-item' + (player.id === selectedPlayerId ? ' selected' : '');
        playerDiv.dataset.playerId = player.id;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-list-name';
        nameSpan.textContent = player.name;
        
        const godModeSpan = document.createElement('span');
        godModeSpan.className = 'player-list-badge';
        godModeSpan.textContent = player.flag_god_mode ? 'GOD' : '';
        
        playerDiv.appendChild(nameSpan);
        playerDiv.appendChild(godModeSpan);
        
        playerDiv.addEventListener('click', () => selectPlayer(player.id));
        listContainer.appendChild(playerDiv);
    });
}

// Update player selector dropdown
function updatePlayerSelector() {
    const selector = document.getElementById('playerSelector');
    selector.innerHTML = '<option value="">Select a player...</option>';
    
    allPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        if (player.id === selectedPlayerId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

// Select a player
function selectPlayer(playerId) {
    selectedPlayerId = playerId;
    renderPlayerList();
    updatePlayerSelector();
    
    const player = allPlayers.find(p => p.id === playerId);
    if (player) {
        showPlayerForm(player);
        // Request player inventory
        ws.send(JSON.stringify({ type: 'getPlayerInventory', playerId }));
    }
}

// Show player edit form
function showPlayerForm(player) {
    const panel = document.getElementById('playerPanelContent');
    const maxEnc = player.resource_max_encumbrance || 100;
    
    panel.innerHTML = `
        <div class="player-editor-form">
            <h3 class="player-editor-title">Edit: ${escapeHtml(player.name)}</h3>
            
            <!-- Two Column Layout -->
            <div class="player-columns">
                <!-- Left Column: Stats -->
                <div class="player-stats-column">
                    <!-- Attributes Row -->
                    <div class="player-section-label">Attributes</div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>Brute</label>
                            <input type="number" id="stat_brute_strength" value="${player.stat_brute_strength || 10}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Life</label>
                            <input type="number" id="stat_life_force" value="${player.stat_life_force || 10}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Cunning</label>
                            <input type="number" id="stat_cunning" value="${player.stat_cunning || 10}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Intel</label>
                            <input type="number" id="stat_intelligence" value="${player.stat_intelligence || 10}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Wisdom</label>
                            <input type="number" id="stat_wisdom" value="${player.stat_wisdom || 10}" min="0">
                        </div>
                    </div>
                    
                    <!-- Abilities Row -->
                    <div class="player-section-label">Abilities</div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>Craft</label>
                            <input type="number" id="ability_crafting" value="${player.ability_crafting || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Lock</label>
                            <input type="number" id="ability_lockpicking" value="${player.ability_lockpicking || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Stealth</label>
                            <input type="number" id="ability_stealth" value="${player.ability_stealth || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Dodge</label>
                            <input type="number" id="ability_dodge" value="${player.ability_dodge || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Crit</label>
                            <input type="number" id="ability_critical_hit" value="${player.ability_critical_hit || 0}" min="0">
                        </div>
                    </div>
                    
                    <!-- Resources Row -->
                    <div class="player-section-label">Resources</div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>HP</label>
                            <input type="number" id="resource_hit_points" value="${player.resource_hit_points || 50}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Max HP</label>
                            <input type="number" id="resource_max_hit_points" value="${player.resource_max_hit_points || 50}" min="1">
                        </div>
                        <div class="player-field">
                            <label>Mana</label>
                            <input type="number" id="resource_mana" value="${player.resource_mana || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Max Mana</label>
                            <input type="number" id="resource_max_mana" value="${player.resource_max_mana || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Cur Enc</label>
                            <input type="number" id="current_encumbrance" value="${currentEncumbrance}" readonly class="readonly-field">
                        </div>
                        <div class="player-field">
                            <label>Max Enc</label>
                            <input type="number" id="resource_max_encumbrance" value="${maxEnc}" min="1">
                        </div>
                    </div>
                    
                    <!-- Flags Row -->
                    <div class="player-row player-flags-row">
                        <label class="player-checkbox">
                            <input type="checkbox" id="flag_god_mode" ${player.flag_god_mode ? 'checked' : ''}>
                            <span>God Mode</span>
                        </label>
                        <button id="savePlayerBtn" class="editor-btn player-save-btn">Save Player</button>
                    </div>
                </div>
                
                <!-- Right Column: Inventory -->
                <div class="player-inventory-column">
                    <div class="player-section-label">Inventory <span id="encumbranceDisplay" class="encumbrance-display">(0/${maxEnc})</span></div>
                    
                    <!-- Add Item Row -->
                    <div class="inventory-add-row">
                        <select id="addItemSelect" class="inventory-select">
                            <option value="">Select item...</option>
                        </select>
                        <input type="number" id="addItemQty" class="inventory-qty" value="1" min="1">
                        <button id="addItemBtn" class="editor-btn inventory-add-btn">Add</button>
                    </div>
                    
                    <!-- Inventory List -->
                    <div id="inventoryList" class="inventory-list">
                        <div class="inventory-empty">Loading...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add save handler
    document.getElementById('savePlayerBtn').addEventListener('click', () => {
        savePlayer(player.id);
    });
    
    // Add item handler
    document.getElementById('addItemBtn').addEventListener('click', () => {
        addItemToInventory();
    });
    
    // Populate item selector if items already loaded
    if (allItems.length > 0) {
        updateItemSelector();
    }
    
    // Request inventory if player is selected
    if (player.id === selectedPlayerId) {
        ws.send(JSON.stringify({ type: 'getPlayerInventory', playerId: player.id }));
    }
}

// Save player
function savePlayer(playerId) {
    const player = {
        id: playerId,
        stat_ingenuity: parseInt(document.getElementById('stat_ingenuity').value) || 5,
        stat_resonance: parseInt(document.getElementById('stat_resonance').value) || 5,
        stat_fortitude: parseInt(document.getElementById('stat_fortitude').value) || 5,
        stat_acumen: parseInt(document.getElementById('stat_acumen').value) || 5,
        ability_crafting: parseInt(document.getElementById('ability_crafting').value) || 0,
        ability_attunement: parseInt(document.getElementById('ability_attunement').value) || 0,
        ability_endurance: parseInt(document.getElementById('ability_endurance').value) || 0,
        ability_commerce: parseInt(document.getElementById('ability_commerce').value) || 0,
        resource_max_encumbrance: parseInt(document.getElementById('resource_max_encumbrance').value) || 100,
        flag_god_mode: document.getElementById('flag_god_mode').checked ? 1 : 0
    };
    
    ws.send(JSON.stringify({ type: 'updatePlayer', player }));
}

// Update item selector dropdown
function updateItemSelector() {
    const selector = document.getElementById('addItemSelect');
    if (!selector) {
        console.log('Item selector not found - form not rendered yet');
        return;
    }
    
    console.log('Updating item selector with', allItems.length, 'items');
    
    selector.innerHTML = '<option value="">Select item...</option>';
    
    allItems.forEach(item => {
        // Check active as number (1) or truthy value
        if (item.active === 1 || item.active === true) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (${item.encumbrance || 1})`;
            option.dataset.encumbrance = item.encumbrance || 1;
            option.dataset.name = item.name;
            selector.appendChild(option);
            console.log('Added item:', item.name);
        }
    });
}

// Render inventory list
function renderInventory() {
    const listContainer = document.getElementById('inventoryList');
    const encDisplay = document.getElementById('encumbranceDisplay');
    const curEncField = document.getElementById('current_encumbrance');
    
    if (!listContainer) return;
    
    // Update encumbrance display
    const player = allPlayers.find(p => p.id === selectedPlayerId);
    const maxEnc = player ? (player.resource_max_encumbrance || 100) : 100;
    
    // Update the current encumbrance field in Resources section
    if (curEncField) {
        curEncField.value = currentEncumbrance;
    }
    
    if (encDisplay) {
        const percent = maxEnc > 0 ? (currentEncumbrance / maxEnc) * 100 : 0;
        let color = '#00ff00';
        if (percent >= 100) color = '#ff0000';
        else if (percent >= 66.6) color = '#ff6600';
        else if (percent >= 33.3) color = '#ffcc00';
        encDisplay.innerHTML = `(<span style="color:${color}">${currentEncumbrance}/${maxEnc}</span>)`;
    }
    
    if (playerInventory.length === 0) {
        listContainer.innerHTML = '<div class="inventory-empty">Empty</div>';
        return;
    }
    
    listContainer.innerHTML = '';
    
    playerInventory.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'inventory-item';
        
        // Find item definition for encumbrance
        const itemDef = allItems.find(i => i.name.toLowerCase() === item.item_name.toLowerCase());
        const enc = itemDef ? (itemDef.encumbrance || 1) : 1;
        const totalEnc = enc * item.quantity;
        
        itemDiv.innerHTML = `
            <span class="inventory-item-name">${escapeHtml(item.item_name)} <span class="item-enc">(${enc})</span></span>
            <span class="inventory-item-qty">x${item.quantity} <span class="item-enc-total">[${totalEnc}]</span></span>
            <button class="inventory-remove-btn" data-item="${escapeHtml(item.item_name)}">-</button>
        `;
        
        listContainer.appendChild(itemDiv);
    });
    
    // Add remove handlers
    listContainer.querySelectorAll('.inventory-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            removeItemFromInventory(btn.dataset.item);
        });
    });
}

// Add item to player inventory
function addItemToInventory() {
    const selector = document.getElementById('addItemSelect');
    const qtyInput = document.getElementById('addItemQty');
    
    if (!selector || !selector.value) {
        showEditorNotification('Select an item first', 'error');
        return;
    }
    
    const selectedOption = selector.options[selector.selectedIndex];
    const itemName = selectedOption.dataset.name;
    const itemEnc = parseInt(selectedOption.dataset.encumbrance) || 1;
    const quantity = parseInt(qtyInput.value) || 1;
    
    // Check encumbrance limit
    const player = allPlayers.find(p => p.id === selectedPlayerId);
    const maxEnc = player ? (player.resource_max_encumbrance || 100) : 100;
    const totalNewEnc = itemEnc * quantity;
    
    if (currentEncumbrance + totalNewEnc > maxEnc) {
        const canAdd = Math.floor((maxEnc - currentEncumbrance) / itemEnc);
        if (canAdd <= 0) {
            showEditorNotification(`Cannot add - player at max encumbrance (${currentEncumbrance}/${maxEnc})`, 'error');
            return;
        }
        showEditorNotification(`Can only add ${canAdd} (encumbrance limit)`, 'error');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'addPlayerInventoryItem',
        playerId: selectedPlayerId,
        itemName: itemName,
        quantity: quantity
    }));
    
    // Reset
    selector.value = '';
    qtyInput.value = '1';
}

// Remove item from player inventory
function removeItemFromInventory(itemName) {
    ws.send(JSON.stringify({
        type: 'removePlayerInventoryItem',
        playerId: selectedPlayerId,
        itemName: itemName,
        quantity: 1
    }));
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
    document.getElementById('closePlayerEditor').addEventListener('click', () => {
        window.location.href = '/game';
    });
    
    // Player selector change
    document.getElementById('playerSelector').addEventListener('change', (e) => {
        const playerId = parseInt(e.target.value);
        if (playerId) {
            selectPlayer(playerId);
        }
    });
    
    // Player list and items are requested after authentication completes
    // (see handleMessage for roomUpdate/playerStats)
});



