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
let formulaConfigs = [];

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
        case 'harvestFormulaConfigs':
            // Received formula configs from server
            showFormulaConfigModal(data.configs);
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
                            <label>Ingenuity</label>
                            <input type="number" id="stat_ingenuity" value="${player.stat_ingenuity || 5}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Resonance</label>
                            <input type="number" id="stat_resonance" value="${player.stat_resonance || 5}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Fortitude</label>
                            <input type="number" id="stat_fortitude" value="${player.stat_fortitude || 5}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Acumen</label>
                            <input type="number" id="stat_acumen" value="${player.stat_acumen || 5}" min="0">
                        </div>
                    </div>
                    
                    <!-- Abilities Row -->
                    <div class="player-section-label">Abilities</div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>Crafting</label>
                            <input type="number" id="ability_crafting" value="${player.ability_crafting || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Attunement</label>
                            <input type="number" id="ability_attunement" value="${player.ability_attunement || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Endurance</label>
                            <input type="number" id="ability_endurance" value="${player.ability_endurance || 0}" min="0">
                        </div>
                        <div class="player-field">
                            <label>Commerce</label>
                            <input type="number" id="ability_commerce" value="${player.ability_commerce || 0}" min="0">
                        </div>
                    </div>
                    
                    <!-- Resources Row -->
                    <div class="player-section-label">Resources</div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>Cur Enc</label>
                            <input type="number" id="current_encumbrance" value="${currentEncumbrance}" readonly class="readonly-field">
                        </div>
                        <div class="player-field">
                            <label>Max Enc</label>
                            <input type="number" id="resource_max_encumbrance" value="${maxEnc}" min="1">
                        </div>
                        <div class="player-field">
                            <label>Assignable Points</label>
                            <input type="number" id="assignable_points" value="${player.assignable_points || 5}" min="0">
                        </div>
                    </div>
                    
                    <!-- Auto-Path Settings Row -->
                    <div class="player-section-label">Auto-Path Settings</div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>Path Delay (ms)</label>
                            <input type="number" id="auto_navigation_time_ms" value="${player.auto_navigation_time_ms || 1000}" min="100" max="10000" title="Delay between movements during auto-navigation (milliseconds)">
                        </div>
                        <div class="player-field">
                            <label>Loop Delay (ms)</label>
                            <input type="number" id="loop_delay_ms" value="${player.loop_delay_ms || 1000}" min="100" max="10000" title="Delay between movements during loop execution (milliseconds)">
                        </div>
                        <div class="player-field">
                            <label>Room Refresh (ms)</label>
                            <input type="number" id="room_update_interval_ms" value="${player.room_update_interval_ms || 30000}" min="1000" max="300000" title="Interval between automatic room updates (milliseconds). Default: 30000 (30 seconds)">
                        </div>
                    </div>
                    
                    <!-- Attunement Settings Row -->
                    <div class="player-section-label">Attunement Settings 
                        <button id="editAttuneFormulasBtn" class="editor-btn" style="float: right; padding: 2px 8px; font-size: 10px;">Edit Global Formulas</button>
                    </div>
                    <div class="player-row">
                        <div class="player-field">
                            <label>Base Points</label>
                            <input type="number" id="base_attunement_points" value="${player.base_attunement_points || 10}" min="1" title="Base vitalis restored when attuning (before bonuses)">
                        </div>
                        <div class="player-field">
                            <label>Cooldown (ms)</label>
                            <input type="number" id="base_attunement_cooldown_ms" value="${player.base_attunement_cooldown_ms || 10000}" min="1000" title="Base cooldown time between attunements (before reductions)">
                        </div>
                        <div class="player-field">
                            <label>Delay (ms)</label>
                            <input type="number" id="base_attunement_delay_ms" value="${player.base_attunement_delay_ms || 2000}" min="0" title="Base delay before vitalis is restored (before reductions)">
                        </div>
                    </div>
                    
                    <!-- Flags Row -->
                    <div class="player-row player-flags-row">
                        <div class="player-field" style="display: flex; align-items: center; gap: 10px;">
                            <label style="color: #00ff00; font-size: 12px; user-select: none;">God Mode:</label>
                            <label class="toggle-switch-small">
                                <input type="checkbox" id="flag_god_mode" ${player.flag_god_mode ? 'checked' : ''}>
                                <span class="toggle-slider-small"></span>
                            </label>
                        </div>
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
    
    // Add formula config button handler
    const editAttuneFormulasBtn = document.getElementById('editAttuneFormulasBtn');
    if (editAttuneFormulasBtn) {
        editAttuneFormulasBtn.addEventListener('click', () => {
            openFormulaConfigEditor();
        });
    }
    
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
        stat_ingenuity: parseInt(document.getElementById('stat_ingenuity')?.value) || 5,
        stat_resonance: parseInt(document.getElementById('stat_resonance')?.value) || 5,
        stat_fortitude: parseInt(document.getElementById('stat_fortitude')?.value) || 5,
        stat_acumen: parseInt(document.getElementById('stat_acumen')?.value) || 5,
        ability_crafting: parseInt(document.getElementById('ability_crafting')?.value) || 0,
        ability_attunement: parseInt(document.getElementById('ability_attunement')?.value) || 0,
        ability_endurance: parseInt(document.getElementById('ability_endurance')?.value) || 0,
        ability_commerce: parseInt(document.getElementById('ability_commerce')?.value) || 0,
        resource_max_encumbrance: parseInt(document.getElementById('resource_max_encumbrance')?.value) || 100,
        assignable_points: parseInt(document.getElementById('assignable_points')?.value) || 5,
        auto_navigation_time_ms: parseInt(document.getElementById('auto_navigation_time_ms')?.value) || 1000,
        loop_delay_ms: parseInt(document.getElementById('loop_delay_ms')?.value) || 1000,
        room_update_interval_ms: parseInt(document.getElementById('room_update_interval_ms')?.value) || 30000,
        base_attunement_points: parseInt(document.getElementById('base_attunement_points')?.value) || 10,
        base_attunement_cooldown_ms: parseInt(document.getElementById('base_attunement_cooldown_ms')?.value) || 10000,
        base_attunement_delay_ms: parseInt(document.getElementById('base_attunement_delay_ms')?.value) || 2000,
        flag_god_mode: document.getElementById('flag_god_mode')?.checked ? 1 : 0
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
    const closePlayerEditorBtn = document.getElementById('closePlayerEditor');
    if (closePlayerEditorBtn) {
        closePlayerEditorBtn.addEventListener('click', () => {
            window.location.href = '/game';
        });
        
        // Add markup button (μ) next to close button
        if (typeof createMarkupButton !== 'undefined') {
            createMarkupButton('Player Editor', closePlayerEditorBtn);
        }
    }
    
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

// Formula Configuration Editor Functions

function openFormulaConfigEditor() {
    // Request formula configs from server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getHarvestFormulaConfigs' }));
    } else {
        showEditorNotification('Not connected to server', 'error');
    }
}

function showFormulaConfigModal(configs) {
    formulaConfigs = configs;
    
    // Remove existing modal if any
    const existing = document.getElementById('formulaConfigModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'formulaConfigModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const cooldownConfig = configs.find(c => c.config_key === 'attunement_cooldown_reduction') || {};
    const restoreConfig = configs.find(c => c.config_key === 'attunement_restore_bonus') || {};
    const delayConfig = configs.find(c => c.config_key === 'attunement_delay_reduction') || {};
    const roomUpdateConfig = configs.find(c => c.config_key === 'room_update_interval_ms') || {};
    
    modal.innerHTML = `
        <div class="formula-config-content" style="
            background: #001a00;
            border: 2px solid #00ff00;
            padding: 20px;
            max-width: 700px;
            max-height: 90vh;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            color: #00ff00;
        ">
            <h2 style="margin-top: 0; border-bottom: 1px solid #006600; padding-bottom: 10px;">Attunement Formula Configuration</h2>
            <p style="font-size: 12px; color: #00ff00; margin-bottom: 20px; padding: 10px; background: rgba(0, 100, 0, 0.3); border: 1px solid #00ff00;">
                <strong>⚠️ GLOBAL FORMULAS:</strong> These formulas apply to <strong>ALL players</strong> in the game. Changes here affect every player's attunement calculations (cooldown reduction, restore bonus, and delay reduction).
            </p>
            
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #00ffff;">Cooldown Reduction</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${cooldownConfig.description || 'Reduces cooldown time between attunements based on Resonance.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Resonance</label>
                        <input type="number" id="cooldownMinResonance" value="${cooldownConfig.min_resonance || 5}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Value (%)</label>
                        <input type="number" id="cooldownMinValue" value="${((cooldownConfig.min_value || 0.05) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Curve Exponent</label>
                        <input type="number" id="cooldownCurveExponent" value="${cooldownConfig.curve_exponent || 2}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Resonance</label>
                        <input type="number" id="cooldownMaxResonance" value="${cooldownConfig.max_resonance || 100}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Value (%)</label>
                        <input type="number" id="cooldownMaxValue" value="${((cooldownConfig.max_value || 0.75) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                </div>
                <div id="cooldownPreview" style="margin-top: 10px; font-size: 11px; color: #888;"></div>
            </div>
            
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #ffa500;">Restore Bonus</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${restoreConfig.description || 'Increases vitalis restored per attunement based on Fortitude.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Fortitude</label>
                        <input type="number" id="restoreMinResonance" value="${restoreConfig.min_resonance || 5}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Value (%)</label>
                        <input type="number" id="restoreMinValue" value="${((restoreConfig.min_value || 0.0) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Curve Exponent</label>
                        <input type="number" id="restoreCurveExponent" value="${restoreConfig.curve_exponent || 2}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Fortitude</label>
                        <input type="number" id="restoreMaxResonance" value="${restoreConfig.max_resonance || 100}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Value (%)</label>
                        <input type="number" id="restoreMaxValue" value="${((restoreConfig.max_value || 1.0) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                </div>
                <div id="restorePreview" style="margin-top: 10px; font-size: 11px; color: #888;"></div>
            </div>
            
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #ff00ff;">Delay Reduction</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${delayConfig.description || 'Reduces delay before vitalis is restored, based on average of (Resonance + Fortitude) / 2.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Avg (Res+Fort)/2</label>
                        <input type="number" id="delayMinResonance" value="${delayConfig.min_resonance || 5}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Value (%)</label>
                        <input type="number" id="delayMinValue" value="${((delayConfig.min_value || 0.0) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Curve Exponent</label>
                        <input type="number" id="delayCurveExponent" value="${delayConfig.curve_exponent || 2}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Avg (Res+Fort)/2</label>
                        <input type="number" id="delayMaxResonance" value="${delayConfig.max_resonance || 100}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Value (%)</label>
                        <input type="number" id="delayMaxValue" value="${((delayConfig.max_value || 0.75) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                </div>
                <div id="delayPreview" style="margin-top: 10px; font-size: 11px; color: #888;"></div>
            </div>
            
            <!-- Game Settings Section -->
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #ffff00;">Game Settings</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    Global default settings that apply to all players. Individual players can override these in the Player Editor.
                </p>
                <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Room Refresh Interval (ms)</label>
                        <input type="number" id="roomUpdateIntervalMs" value="${roomUpdateConfig.min_resonance || 30000}" min="1000" max="300000" step="1000" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                        <span style="font-size: 9px; color: #666;">Global default interval for automatic room updates. Players can override this individually.</span>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="formulaConfigPreviewBtn" style="background: #003300; border: 1px solid #00ff00; color: #00ff00; padding: 8px 16px; cursor: pointer;">Preview</button>
                <button id="formulaConfigSaveBtn" style="background: #004400; border: 1px solid #00ff00; color: #00ff00; padding: 8px 16px; cursor: pointer;">Save</button>
                <button id="formulaConfigCancelBtn" style="background: #330000; border: 1px solid #ff0000; color: #ff6666; padding: 8px 16px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    document.getElementById('formulaConfigCancelBtn').addEventListener('click', () => {
        modal.remove();
    });
    
    document.getElementById('formulaConfigPreviewBtn').addEventListener('click', () => {
        updateFormulaPreview();
    });
    
    document.getElementById('formulaConfigSaveBtn').addEventListener('click', () => {
        saveFormulaConfigs();
        modal.remove();
    });
    
    // Initial preview
    updateFormulaPreview();
}

function updateFormulaPreview() {
    // Cooldown reduction preview
    const cooldownMinRes = parseInt(document.getElementById('cooldownMinResonance')?.value) || 5;
    const cooldownMinVal = (parseFloat(document.getElementById('cooldownMinValue')?.value) || 5) / 100;
    const cooldownMaxRes = parseInt(document.getElementById('cooldownMaxResonance')?.value) || 100;
    const cooldownMaxVal = (parseFloat(document.getElementById('cooldownMaxValue')?.value) || 75) / 100;
    const cooldownExp = parseFloat(document.getElementById('cooldownCurveExponent')?.value) || 2;
    
    const cooldownPreview = document.getElementById('cooldownPreview');
    if (cooldownPreview) {
        const samples = [5, 25, 50, 75, 100];
        const cooldownResults = samples.map(res => {
            const norm = Math.max(0, Math.min(1, (res - cooldownMinRes) / (cooldownMaxRes - cooldownMinRes)));
            const val = cooldownMinVal + (cooldownMaxVal - cooldownMinVal) * Math.pow(norm, cooldownExp);
            return `Res ${res}: ${(val * 100).toFixed(1)}% reduction`;
        });
        cooldownPreview.textContent = cooldownResults.join(' | ');
    }
    
    // Restore bonus preview
    const restoreMinRes = parseInt(document.getElementById('restoreMinResonance')?.value) || 5;
    const restoreMinVal = (parseFloat(document.getElementById('restoreMinValue')?.value) || 0) / 100;
    const restoreMaxRes = parseInt(document.getElementById('restoreMaxResonance')?.value) || 100;
    const restoreMaxVal = (parseFloat(document.getElementById('restoreMaxValue')?.value) || 100) / 100;
    const restoreExp = parseFloat(document.getElementById('restoreCurveExponent')?.value) || 2;
    
    const restorePreview = document.getElementById('restorePreview');
    if (restorePreview) {
        const samples = [5, 25, 50, 75, 100];
        const restoreResults = samples.map(fort => {
            const norm = Math.max(0, Math.min(1, (fort - restoreMinRes) / (restoreMaxRes - restoreMinRes)));
            const val = restoreMinVal + (restoreMaxVal - restoreMinVal) * Math.pow(norm, restoreExp);
            return `Fort ${fort}: ${(val * 100).toFixed(1)}% bonus`;
        });
        restorePreview.textContent = restoreResults.join(' | ');
    }
    
    // Delay reduction preview
    const delayMinRes = parseInt(document.getElementById('delayMinResonance')?.value) || 5;
    const delayMinVal = (parseFloat(document.getElementById('delayMinValue')?.value) || 0) / 100;
    const delayMaxRes = parseInt(document.getElementById('delayMaxResonance')?.value) || 100;
    const delayMaxVal = (parseFloat(document.getElementById('delayMaxValue')?.value) || 75) / 100;
    const delayExp = parseFloat(document.getElementById('delayCurveExponent')?.value) || 2;
    
    const delayPreview = document.getElementById('delayPreview');
    if (delayPreview) {
        const samples = [5, 25, 50, 75, 100];
        const delayResults = samples.map(avgStat => {
            const norm = Math.max(0, Math.min(1, (avgStat - delayMinRes) / (delayMaxRes - delayMinRes)));
            const reduction = delayMinVal + (delayMaxVal - delayMinVal) * Math.pow(norm, delayExp);
            // Show example: if base delay is 2000ms, show what the final delay would be
            const exampleBaseDelay = 2000;
            const finalDelay = Math.max(0, Math.floor(exampleBaseDelay * (1 - reduction)));
            return `Avg ${avgStat}: ${(reduction * 100).toFixed(1)}% reduction (2000ms→${finalDelay}ms)`;
        });
        delayPreview.textContent = delayResults.join(' | ');
    }
}

function saveFormulaConfigs() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showEditorNotification('Not connected to server', 'error');
        return;
    }
    
    // Cooldown reduction config
    const cooldownConfig = {
        config_key: 'attunement_cooldown_reduction',
        min_resonance: parseInt(document.getElementById('cooldownMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('cooldownMinValue')?.value) || 5) / 100,
        max_resonance: parseInt(document.getElementById('cooldownMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('cooldownMaxValue')?.value) || 75) / 100,
        curve_exponent: parseFloat(document.getElementById('cooldownCurveExponent')?.value) || 2
    };
    
    // Restore bonus config
    const restoreConfig = {
        config_key: 'attunement_restore_bonus',
        min_resonance: parseInt(document.getElementById('restoreMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('restoreMinValue')?.value) || 0) / 100,
        max_resonance: parseInt(document.getElementById('restoreMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('restoreMaxValue')?.value) || 100) / 100,
        curve_exponent: parseFloat(document.getElementById('restoreCurveExponent')?.value) || 2
    };
    
    // Delay reduction config
    const delayConfig = {
        config_key: 'attunement_delay_reduction',
        min_resonance: parseInt(document.getElementById('delayMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('delayMinValue')?.value) || 0) / 100,
        max_resonance: parseInt(document.getElementById('delayMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('delayMaxValue')?.value) || 75) / 100,
        curve_exponent: parseFloat(document.getElementById('delayCurveExponent')?.value) || 2
    };
    
    // Room update interval config (uses min_resonance to store the interval value)
    const roomUpdateConfig = {
        config_key: 'room_update_interval_ms',
        min_resonance: parseInt(document.getElementById('roomUpdateIntervalMs')?.value) || 30000,
        min_value: 0,
        max_resonance: 300000, // Max allowed value
        max_value: 0,
        curve_exponent: 0
    };
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: cooldownConfig
    }));
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: restoreConfig
    }));
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: delayConfig
    }));
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: roomUpdateConfig
    }));
    
    showEditorNotification('Attunement formula configurations and game settings saved!');
}

