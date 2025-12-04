// NPC Editor - Standalone page
// Session-based authentication (no URL params needed)

// WebSocket connection
let ws = null;
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

// NPC Editor Variables
let npcEditor = null;
let npcList = [];
let selectedNpc = null;
let npcEditorMode = 'view'; // 'view' | 'create' | 'edit'
let npcPlacements = [];
let npcPlacementRooms = [];
let npcPlacementMap = null;
let npcPlacementMaps = []; // List of all maps for placement selection
let allItems = []; // List of all available items for reward dropdown

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

// Restore persisted NPC selection from localStorage
function restoreNpcSelection() {
    const savedMode = localStorage.getItem('npcEditorMode');
    const savedId = localStorage.getItem('npcEditorSelectedId');
    
    if (savedMode === 'create') {
        // Restore create mode
        startCreateNpc();
    } else if (savedMode === 'edit' && savedId) {
        // Restore selected NPC
        const npcId = parseInt(savedId, 10);
        if (!isNaN(npcId)) {
            const npc = npcList.find(n => n.id === npcId);
            if (npc) {
                selectNpcById(npcId);
                return true; // Successfully restored
            }
        }
    }
    return false; // Nothing to restore
}

// Handle messages from server
function handleMessage(data) {
    switch (data.type) {
        case 'npcList':
            npcList = data.npcs || [];
            renderNpcList();
            // Try to restore persisted selection
            const restored = restoreNpcSelection();
            if (!restored && selectedNpc) {
                // If restoration failed but we have a selected NPC, render it
                renderNpcForm();
            }
            break;
        case 'npcCreated':
            if (data.npc) {
                npcList.push(data.npc);
                selectedNpc = data.npc;
                npcEditorMode = 'edit';
                // Persist the newly created NPC
                localStorage.setItem('npcEditorSelectedId', data.npc.id.toString());
                localStorage.setItem('npcEditorMode', 'edit');
                renderNpcList();
                renderNpcForm();
                loadNpcPlacements(data.npc.id);
            }
            break;
        case 'npcUpdated':
            if (data.npc) {
                const idx = npcList.findIndex(n => n.id === data.npc.id);
                if (idx !== -1) {
                    npcList[idx] = data.npc;
                } else {
                    npcList.push(data.npc);
                }
                selectedNpc = data.npc;
                npcEditorMode = 'edit';
                // Persist the updated NPC
                localStorage.setItem('npcEditorSelectedId', data.npc.id.toString());
                localStorage.setItem('npcEditorMode', 'edit');
                renderNpcList();
                renderNpcForm();
            }
            break;
        case 'npcPlacements':
            if (selectedNpc && data.npcId === selectedNpc.id) {
                npcPlacements = data.placements || [];
                renderNpcPlacements();
            }
            break;
        case 'npcPlacementAdded':
            if (selectedNpc) {
                loadNpcPlacements(selectedNpc.id);
            }
            break;
        case 'npcPlacementRemoved':
            if (selectedNpc && data.npcId === selectedNpc.id) {
                npcPlacements = data.placements || [];
                renderNpcPlacements();
            }
            break;
        case 'npcPlacementRooms':
            if (data.error) {
                alert(`NPC placement rooms error: ${data.error}`);
                return;
            }
            npcPlacementMap = data.map || null;
            npcPlacementRooms = Array.isArray(data.rooms) ? data.rooms : [];
            populateNpcPlacementRooms();
            break;
        case 'npcPlacementMaps':
            npcPlacementMaps = Array.isArray(data.maps) ? data.maps : [];
            populateNpcPlacementMaps();
            break;
        case 'itemList':
            allItems = data.items || [];
            // Repopulate reward item dropdowns if form is already rendered
            if (selectedNpc) {
                populateRewardItemDropdowns();
            }
            break;
        case 'harvestFormulaConfigs':
            showFormulaConfigModal(data.configs || []);
            break;
        case 'harvestFormulaConfigUpdated':
            showEditorNotification('Formula config updated successfully!');
            break;
        case 'error':
            showEditorNotification(data.message, 'error');
            break;
    }
}

// Close NPC editor - navigate back to main game
function closeNpcEditor() {
    // Navigate to main game (session-based, no params needed)
    window.location.href = '/game';
}

function enterNpcListMode() {
    if (npcEditor) {
        npcEditor.classList.remove('npc-detail-mode');
    }
    const listContainer = document.getElementById('npcListContainer');
    if (listContainer) {
        listContainer.style.display = 'flex';
    }
    const sidePanel = document.getElementById('npcEditorSidePanel');
    if (sidePanel) {
        sidePanel.style.width = '300px';
    }
}

function enterNpcDetailMode() {
    if (npcEditor) {
        npcEditor.classList.add('npc-detail-mode');
    }
    const listContainer = document.getElementById('npcListContainer');
    if (listContainer) {
        listContainer.style.display = 'none';
    }
    const sidePanel = document.getElementById('npcEditorSidePanel');
    if (sidePanel) {
        sidePanel.style.width = '100%';
    }
}

function renderNpcList() {
    const listContainer = document.getElementById('npcList');
    const selector = document.getElementById('npcSelector');
    if (!listContainer || !selector) return;

    listContainer.innerHTML = '';
    selector.innerHTML = '<option value="">Select an NPC...</option>';

    npcList.forEach(npc => {
        const item = document.createElement('div');
        item.className = 'npc-list-item' + (selectedNpc && selectedNpc.id === npc.id ? ' selected' : '');
        item.textContent = `#${npc.id} - ${npc.name} [${npc.npc_type}]`;
        item.addEventListener('click', () => {
            selectNpcById(npc.id);
            selector.value = String(npc.id);
        });
        listContainer.appendChild(item);

        const option = document.createElement('option');
        option.value = npc.id;
        option.textContent = `${npc.name} [${npc.npc_type}]`;
        selector.appendChild(option);
    });
    
    // Set selector value if an NPC is selected
    if (selectedNpc && selectedNpc.id) {
        selector.value = String(selectedNpc.id);
    }
}

function loadNpcPlacements(npcId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'getNpcPlacements',
        npcId
    }));
}

function populateNpcPlacementRooms() {
    const roomSelect = document.getElementById('npcPlacementRoomSelect');
    if (!roomSelect) return;

    roomSelect.innerHTML = '';

    if (!npcPlacementRooms || npcPlacementRooms.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No rooms available';
        roomSelect.appendChild(opt);
        return;
    }

    npcPlacementRooms.forEach(room => {
        const opt = document.createElement('option');
        opt.value = room.id;
        opt.textContent = `${room.name} (${room.x},${room.y})`;
        roomSelect.appendChild(opt);
    });
}

function populateNpcPlacementMaps() {
    const mapSelect = document.getElementById('npcPlacementMapSelect');
    if (!mapSelect) return;

    mapSelect.innerHTML = '';

    if (!npcPlacementMaps || npcPlacementMaps.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No maps available';
        mapSelect.appendChild(opt);
        return;
    }

    npcPlacementMaps.forEach(map => {
        const opt = document.createElement('option');
        opt.value = map.id;
        opt.textContent = map.name;
        mapSelect.appendChild(opt);
    });
    
    // Select first map and load its rooms
    if (npcPlacementMaps.length > 0) {
        mapSelect.value = npcPlacementMaps[0].id;
        loadRoomsForMap(npcPlacementMaps[0].id);
    }
}

function loadRoomsForMap(mapId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'getNpcPlacementRooms',
        mapId: mapId
    }));
}

function loadAllPlacementMaps() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'getNpcPlacementMaps'
    }));
}

function renderNpcPlacements() {
    const listEl = document.getElementById('npcPlacementList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!npcPlacements || npcPlacements.length === 0) {
        listEl.textContent = 'No placements yet.';
        return;
    }

    npcPlacements.forEach(p => {
        const row = document.createElement('div');
        row.className = 'npc-placement-item';
        const label = document.createElement('span');
        label.textContent = `${p.map_name || ''} – ${p.room_name || 'Room'} (${p.x},${p.y})`;
        row.appendChild(label);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'npc-placement-remove';
        removeBtn.addEventListener('click', () => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({
                type: 'removeNpcFromRoom',
                placementId: p.id,
                npcId: selectedNpc ? selectedNpc.id : null
            }));
        });
        row.appendChild(removeBtn);

        listEl.appendChild(row);
    });
}

// Populate reward item dropdowns with available items
function populateRewardItemDropdowns() {
    // Populate glow_codex puzzle reward item dropdown
    const glowCodexRewardSelect = document.getElementById('npcPuzzleRewardItem');
    if (glowCodexRewardSelect) {
        glowCodexRewardSelect.innerHTML = '<option value="">None (no reward)</option>';
        allItems.forEach(item => {
            if (item.active) { // Only show active items
                const option = document.createElement('option');
                option.value = item.name;
                option.textContent = item.name;
                if (selectedNpc && selectedNpc.puzzle_reward_item === item.name) {
                    option.selected = true;
                }
                glowCodexRewardSelect.appendChild(option);
            }
        });
    }
    
    // Populate Lore Keeper puzzle reward item dropdown
    const lkPuzzleRewardSelect = document.getElementById('lkPuzzleRewardItem');
    if (lkPuzzleRewardSelect) {
        lkPuzzleRewardSelect.innerHTML = '<option value="">None (no reward)</option>';
        allItems.forEach(item => {
            if (item.active) { // Only show active items
                const option = document.createElement('option');
                option.value = item.name;
                option.textContent = item.name;
                if (selectedNpc && selectedNpc.lorekeeper && selectedNpc.lorekeeper.puzzle_reward_item === item.name) {
                    option.selected = true;
                }
                lkPuzzleRewardSelect.appendChild(option);
            }
        });
    }
    
    // Populate Harvest Prerequisite Item dropdown
    const harvestPrerequisiteSelect = document.getElementById('npcHarvestPrerequisiteItem');
    if (harvestPrerequisiteSelect) {
        harvestPrerequisiteSelect.innerHTML = '<option value="">None (no prerequisite)</option>';
        allItems.forEach(item => {
            if (item.active) { // Only show active items
                const option = document.createElement('option');
                option.value = item.name;
                option.textContent = item.name;
                if (selectedNpc && selectedNpc.harvest_prerequisite_item === item.name) {
                    option.selected = true;
                }
                harvestPrerequisiteSelect.appendChild(option);
            }
        });
    }
    
    // Populate Output Items list
    populateOutputItemsList();
}

// Parse output_items JSON and populate the output items list
function populateOutputItemsList() {
    const container = document.getElementById('npcOutputItemsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Parse existing output_items JSON
    let outputItems = {};
    if (selectedNpc && selectedNpc.output_items) {
        try {
            outputItems = JSON.parse(selectedNpc.output_items);
        } catch (e) {
            console.error('Error parsing output_items:', e);
            outputItems = {};
        }
    }
    
    // Create list items for each output item
    Object.entries(outputItems).forEach(([itemName, quantity]) => {
        addOutputItemRow(itemName, quantity);
    });
    
    // If no items, show empty state
    if (Object.keys(outputItems).length === 0) {
        container.innerHTML = '<div class="npc-output-items-empty">No output items configured</div>';
    }
}

// Add a new output item row
function addOutputItemRow(itemName = '', quantity = 1) {
    const container = document.getElementById('npcOutputItemsList');
    if (!container) return;
    
    // Remove empty state message if present
    const emptyMsg = container.querySelector('.npc-output-items-empty');
    if (emptyMsg) emptyMsg.remove();
    
    const row = document.createElement('div');
    row.className = 'npc-output-item-row';
    row.innerHTML = `
        <select class="npc-output-item-select">
            <option value="">Select item...</option>
        </select>
        <input type="number" class="npc-output-item-qty" value="${quantity}" min="1" placeholder="Qty" style="width: 80px;">
        <button type="button" class="npc-output-item-remove npc-small-btn">Remove</button>
    `;
    
    // Populate dropdown with items
    const select = row.querySelector('.npc-output-item-select');
    allItems.forEach(item => {
        if (item.active) {
            const option = document.createElement('option');
            option.value = item.name;
            option.textContent = item.name;
            if (itemName && item.name === itemName) {
                option.selected = true;
            }
            select.appendChild(option);
        }
    });
    
    // Remove button handler
    row.querySelector('.npc-output-item-remove').addEventListener('click', () => {
        row.remove();
        // Show empty state if no items left
        if (container.children.length === 0) {
            container.innerHTML = '<div class="npc-output-items-empty">No output items configured</div>';
        }
    });
    
    container.appendChild(row);
}

function renderNpcForm() {
    const sidePanel = document.getElementById('npcSidePanelContent');
    if (!sidePanel) return;

    enterNpcDetailMode();

    if (npcEditorMode === 'create') {
        selectedNpc = {
            id: null,
            name: '',
            description: '',
            npc_type: 'rhythm',
            base_cycle_time: 3000,
            difficulty: 1,
            required_stats: '',
            required_buffs: '',
            input_items: '',
            output_items: '',
            failure_states: '',
            active: 1
        };
    }

    if (!selectedNpc) {
        sidePanel.innerHTML = '<p>Select an NPC from the list or create a new NPC.</p>';
        return;
    }

    const currentColor = selectedNpc.display_color || selectedNpc.color || '#00ff00';

    sidePanel.innerHTML = `
        <div class="npc-editor-scrollable">
            <h3 class="npc-editor-title">${selectedNpc.id ? 'Edit NPC' : 'Create NPC'}</h3>
            <div class="npc-editor-form">
                <!-- Row 1: Name (70%) + Color (30%) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-name">
                        <label>Name</label>
                        <input type="text" id="npcName" value="${selectedNpc.name || ''}">
                    </div>
                    <div class="npc-field-group npc-field-color">
                        <label>Color</label>
                        <div class="npc-color-wrapper">
                            <div id="npcColorPreview" class="npc-color-preview"></div>
                            <select id="npcColor">
                            <option value="#00ff00" ${currentColor === '#00ff00' ? 'selected' : ''}>Lime</option>
                            <option value="#00ffff" ${currentColor === '#00ffff' ? 'selected' : ''}>Cyan</option>
                            <option value="#ff00ff" ${currentColor === '#ff00ff' ? 'selected' : ''}>Magenta</option>
                            <option value="#ffff00" ${currentColor === '#ffff00' ? 'selected' : ''}>Yellow</option>
                            <option value="#ff8800" ${currentColor === '#ff8800' ? 'selected' : ''}>Orange</option>
                            <option value="#ff0000" ${currentColor === '#ff0000' ? 'selected' : ''}>Red</option>
                            <option value="#8888ff" ${currentColor === '#8888ff' ? 'selected' : ''}>Periwinkle</option>
                            <option value="#ffffff" ${currentColor === '#ffffff' ? 'selected' : ''}>White</option>
                            <option value="#aaaaaa" ${currentColor === '#aaaaaa' ? 'selected' : ''}>Gray</option>
                            <option value="#00aa88" ${currentColor === '#00aa88' ? 'selected' : ''}>Teal</option>
                            </select>
                        </div>
                    </div>
                </div>
                <!-- Description (full width) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-full">
                        <label>Description</label>
                        <textarea id="npcDescription">${selectedNpc.description || ''}</textarea>
                    </div>
                </div>
                <!-- Row 2: Type (16.67%) + Base ms (16.67%) + Diff (16.67%) + Harvestable (16.67%) + Cooldown (16.67%) + Active (16.67%) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-sixth">
                        <label>Type</label>
                        <select id="npcType">
                            <option value="rhythm" ${selectedNpc.npc_type === 'rhythm' ? 'selected' : ''}>rhythm</option>
                            <option value="stability" ${selectedNpc.npc_type === 'stability' ? 'selected' : ''}>stability</option>
                            <option value="worker" ${selectedNpc.npc_type === 'worker' ? 'selected' : ''}>worker</option>
                            <option value="tending" ${selectedNpc.npc_type === 'tending' ? 'selected' : ''}>tending</option>
                            <option value="rotation" ${selectedNpc.npc_type === 'rotation' ? 'selected' : ''}>rotation</option>
                            <option value="economic" ${selectedNpc.npc_type === 'economic' ? 'selected' : ''}>economic</option>
                            <option value="farm" ${selectedNpc.npc_type === 'farm' ? 'selected' : ''}>farm</option>
                            <option value="patrol" ${selectedNpc.npc_type === 'patrol' ? 'selected' : ''}>patrol</option>
                            <option value="threshold" ${selectedNpc.npc_type === 'threshold' ? 'selected' : ''}>threshold</option>
                            <option value="lorekeeper" ${selectedNpc.npc_type === 'lorekeeper' ? 'selected' : ''}>lorekeeper</option>
                        </select>
                    </div>
                    <div class="npc-field-group npc-field-sixth">
                        <label>Base ms</label>
                        <input type="number" id="npcBaseCycle" value="${selectedNpc.base_cycle_time || 0}">
                    </div>
                    <div class="npc-field-group npc-field-sixth">
                        <label>Diff</label>
                        <input type="number" id="npcDifficulty" value="${selectedNpc.difficulty || 1}">
                    </div>
                    <div class="npc-field-group npc-field-sixth">
                        <label>Harvestable (ms)</label>
                        <input type="number" id="npcHarvestable" value="${selectedNpc.harvestable_time || selectedNpc.harvestableTime || 60000}">
                    </div>
                    <div class="npc-field-group npc-field-sixth">
                        <label>Cooldown (ms)</label>
                        <input type="number" id="npcCooldown" value="${selectedNpc.cooldown_time || selectedNpc.cooldownTime || 120000}">
                    </div>
                    <div class="npc-field-group npc-field-sixth">
                        <label>Active</label>
                        <select id="npcActive">
                            <option value="1" ${selectedNpc.active ? 'selected' : ''}>Yes</option>
                            <option value="0" ${!selectedNpc.active ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>
                <!-- Row 2.5: Harvest Prerequisite Item (50%) + Harvest Prerequisite Message (50%) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-half">
                        <label>Harvest Prerequisite Item</label>
                        <select id="npcHarvestPrerequisiteItem">
                            <option value="">None (no prerequisite)</option>
                        </select>
                    </div>
                    <div class="npc-field-group npc-field-half">
                        <label>Harvest Prerequisite Message</label>
                        <input type="text" id="npcHarvestPrerequisiteMessage" value="${selectedNpc.harvest_prerequisite_message || ''}" placeholder="You lack the required item to harvest from this creature.">
                    </div>
                </div>
                <!-- Row 3: Required Stats (50%) + Required Buffs (50%) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-half">
                        <label>Required Stats<span class="npc-json-label"> (JSON)</span></label>
                        <textarea id="npcRequiredStats" class="npc-json-textarea">${selectedNpc.required_stats || ''}</textarea>
                    </div>
                    <div class="npc-field-group npc-field-half">
                        <label>Required Buffs<span class="npc-json-label"> (JSON)</span></label>
                        <textarea id="npcRequiredBuffs" class="npc-json-textarea">${selectedNpc.required_buffs || ''}</textarea>
                    </div>
                </div>
                <!-- Row 4: Input Items (50%) + Output Items (50%) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-half">
                        <label>Input Items<span class="npc-json-label"> (JSON)</span></label>
                        <textarea id="npcInputItems" class="npc-json-textarea">${selectedNpc.input_items || ''}</textarea>
                    </div>
                    <div class="npc-field-group npc-field-half">
                        <label>Output Items</label>
                        <div id="npcOutputItemsContainer" class="npc-output-items-container">
                            <div id="npcOutputItemsList" class="npc-output-items-list"></div>
                            <button type="button" id="addOutputItemBtn" class="npc-small-btn" style="margin-top: 8px;">+ Add Item</button>
                        </div>
                    </div>
                </div>
                <!-- Row 5: Failure States (full width) -->
                <div class="npc-row" id="npcStandardFields">
                    <div class="npc-field-group npc-field-full">
                        <label>Failure States<span class="npc-json-label"> (JSON)</span></label>
                        <textarea id="npcFailureStates" class="npc-json-textarea">${selectedNpc.failure_states || ''}</textarea>
                    </div>
                </div>
                
                <!-- Glow Codex Puzzle Section (shown when puzzle_type = glow_codex) -->
                <div id="glowCodexPuzzleFields" class="glow-codex-section" style="display: ${selectedNpc.puzzle_type === 'glow_codex' ? 'block' : 'none'};">
                    <div class="npc-section-title">Glow Codex Puzzle</div>
                    <!-- Row GC1: Puzzle Type -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Puzzle Type</label>
                            <select id="npcPuzzleType">
                                <option value="none" ${(selectedNpc.puzzle_type || 'none') === 'none' ? 'selected' : ''}>none</option>
                                <option value="glow_codex" ${selectedNpc.puzzle_type === 'glow_codex' ? 'selected' : ''}>glow_codex</option>
                            </select>
                        </div>
                    </div>
                    <!-- Row GC2: Glow Clues (JSON array) -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Glow Clues<span class="npc-json-label"> (JSON array: ["clue with <glowword>", ...])</span></label>
                            <textarea id="npcPuzzleGlowClues" class="npc-json-textarea" placeholder='["Pulsewood <resin> is the first...", "If you quiet your breath, you can feel the natural <hum>..."]'>${selectedNpc.puzzle_glow_clues || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row GC3: Extraction Pattern + Solution -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-half">
                            <label>Extraction Pattern<span class="npc-json-label"> (JSON array: [1,2,3,4])</span></label>
                            <input type="text" id="npcPuzzleExtractionPattern" value="${selectedNpc.puzzle_extraction_pattern || '[1,2,3,4]'}" placeholder="[1,2,3,4]">
                        </div>
                        <div class="npc-field-group npc-field-half">
                            <label>Solution Word</label>
                            <input type="text" id="npcPuzzleSolutionWord" value="${selectedNpc.puzzle_solution_word || ''}" placeholder="rune">
                        </div>
                    </div>
                    <!-- Row GC4: Success Response -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Success Response</label>
                            <textarea id="npcPuzzleSuccessResponse" class="npc-textarea">${selectedNpc.puzzle_success_response || 'Yes… you have seen the hidden thread. Take this. You will need it.'}</textarea>
                        </div>
                    </div>
                    <!-- Row GC5: Failure Response -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Failure Response</label>
                            <textarea id="npcPuzzleFailureResponse" class="npc-textarea">${selectedNpc.puzzle_failure_response || 'That is not the answer I seek.'}</textarea>
                        </div>
                    </div>
                    <!-- Row GC6: Reward Item -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Reward Item (optional)</label>
                            <select id="npcPuzzleRewardItem">
                                <option value="">None (no reward)</option>
                            </select>
                        </div>
                    </div>
                    <!-- Row GC6a: Award Behavior (compact) -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label style="margin-bottom: 4px;">Award Behavior</label>
                            <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px;">
                                    <input type="checkbox" id="npcPuzzleAwardOnceOnly" ${selectedNpc.puzzle_award_once_only ? 'checked' : ''}>
                                    <span>Once per player</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px;">
                                    <input type="checkbox" id="npcPuzzleAwardAfterDelay" ${selectedNpc.puzzle_award_after_delay ? 'checked' : ''}>
                                    <span>After delay</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <!-- Row GC6b: Delay Settings (shown when "After delay" is checked) -->
                    <div class="npc-row" id="npcPuzzleDelaySettings" style="display: ${selectedNpc.puzzle_award_after_delay ? 'flex' : 'none'};">
                        <div class="npc-field-group npc-field-half">
                            <label>Delay (sec)</label>
                            <input type="number" id="npcPuzzleAwardDelaySeconds" min="1" value="${selectedNpc.puzzle_award_delay_seconds || 3600}" placeholder="3600" style="width: 100px;">
                        </div>
                        <div class="npc-field-group npc-field-half">
                            <label>Delay Message</label>
                            <input type="text" id="npcPuzzleAwardDelayResponse" value="${selectedNpc.puzzle_award_delay_response || ''}" placeholder="Wait before asking again.">
                        </div>
                    </div>
                    <!-- Row GC7: Puzzle Hint Responses -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Puzzle Hint Responses<span class="npc-json-label"> (JSON array: ["hint1", "hint2", ...])</span></label>
                            <textarea id="npcPuzzleHintResponses" class="npc-json-textarea" placeholder='["Look to the glowwords, but only in the order I spoke them.", "Each truth hides a letter—first, second, third, and fourth."]'>${selectedNpc.puzzle_hint_responses || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row GC8: Puzzle Followup Responses -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Puzzle Followup Responses<span class="npc-json-label"> (JSON array: ["response1", "response2", ...])</span></label>
                            <textarea id="npcPuzzleFollowupResponses" class="npc-json-textarea" placeholder='["What do you mean?", "Can you explain?", "I need more help."]'>${selectedNpc.puzzle_followup_responses || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row GC9: Puzzle Incorrect Attempt Responses -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Puzzle Incorrect Attempt Responses<span class="npc-json-label"> (JSON array: ["response1", "response2", ...])</span></label>
                            <textarea id="npcPuzzleIncorrectAttemptResponses" class="npc-json-textarea" placeholder='["That is not the answer I seek.", "Try again.", "Look more carefully."]'>${selectedNpc.puzzle_incorrect_attempt_responses || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row GC10: Template Button -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <button type="button" id="loadGlowCodexTemplate" class="npc-template-btn">Load Example Template</button>
                        </div>
                    </div>
                </div>
                
                <!-- Lore Keeper Specific Fields (shown when type = lorekeeper) -->
                <div id="loreKeeperFields" class="lorekeeper-section" style="display: ${selectedNpc.npc_type === 'lorekeeper' ? 'block' : 'none'};">
                    <div class="npc-section-title">Lore Keeper Configuration</div>
                    <!-- Row LK1: Lore Type + Engagement Enabled + Engagement Delay -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-third">
                            <label>Lore Type</label>
                            <select id="lkLoreType">
                                <option value="dialogue" ${selectedNpc.lorekeeper?.lore_type === 'dialogue' ? 'selected' : ''}>dialogue</option>
                                <option value="puzzle" ${selectedNpc.lorekeeper?.lore_type === 'puzzle' ? 'selected' : ''}>puzzle</option>
                            </select>
                        </div>
                        <div class="npc-field-group npc-field-third">
                            <label>Engagement</label>
                            <select id="lkEngagementEnabled">
                                <option value="1" ${selectedNpc.lorekeeper?.engagement_enabled !== false ? 'selected' : ''}>Enabled</option>
                                <option value="0" ${selectedNpc.lorekeeper?.engagement_enabled === false ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <div class="npc-field-group npc-field-third">
                            <label>Delay (ms)</label>
                            <input type="number" id="lkEngagementDelay" value="${selectedNpc.lorekeeper?.engagement_delay || 3000}">
                        </div>
                    </div>
                    <!-- Row LK2: Initial Message (full width) -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <label>Initial Message</label>
                            <textarea id="lkInitialMessage" class="npc-textarea">${selectedNpc.lorekeeper?.initial_message || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row LK3: Initial Message Color + Keyword Color -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-half">
                            <label>Initial Msg Color</label>
                            <input type="text" id="lkInitialMessageColor" value="${selectedNpc.lorekeeper?.initial_message_color || '#00ffff'}" placeholder="#00ffff">
                        </div>
                        <div class="npc-field-group npc-field-half">
                            <label>Keyword Color</label>
                            <input type="text" id="lkKeywordColor" value="${selectedNpc.lorekeeper?.keyword_color || '#ff00ff'}" placeholder="#ff00ff">
                        </div>
                    </div>
                    
                    <!-- Dialogue-specific fields -->
                    <div id="lkDialogueFields" style="display: ${(selectedNpc.lorekeeper?.lore_type || 'dialogue') === 'dialogue' ? 'block' : 'none'};">
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Keywords/Responses<span class="npc-json-label"> (JSON: {"keyword": "response", ...})</span></label>
                                <textarea id="lkKeywordsResponses" class="npc-json-textarea">${selectedNpc.lorekeeper?.keywords_responses || ''}</textarea>
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Incorrect Response</label>
                                <input type="text" id="lkIncorrectResponse" value="${selectedNpc.lorekeeper?.incorrect_response || 'I do not understand what you mean.'}">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Puzzle-specific fields -->
                    <div id="lkPuzzleFields" style="display: ${selectedNpc.lorekeeper?.lore_type === 'puzzle' ? 'block' : 'none'};">
                        <!-- Keywords/Responses (shared with dialogue) -->
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Keywords/Responses<span class="npc-json-label"> (JSON: {"keyword": "response", ...})</span></label>
                                <textarea id="lkPuzzleKeywordsResponses" class="npc-json-textarea">${selectedNpc.lorekeeper?.keywords_responses || ''}</textarea>
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Incorrect Response</label>
                                <input type="text" id="lkPuzzleIncorrectResponse" value="${selectedNpc.lorekeeper?.incorrect_response || 'I do not understand what you mean.'}">
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-half">
                                <label>Puzzle Mode</label>
                                <select id="lkPuzzleMode">
                                    <option value="word" ${selectedNpc.lorekeeper?.puzzle_mode === 'word' ? 'selected' : ''}>word</option>
                                    <option value="combination" ${selectedNpc.lorekeeper?.puzzle_mode === 'combination' ? 'selected' : ''}>combination</option>
                                    <option value="cipher" ${selectedNpc.lorekeeper?.puzzle_mode === 'cipher' ? 'selected' : ''}>cipher</option>
                                </select>
                            </div>
                            <div class="npc-field-group npc-field-half">
                                <label>Solution</label>
                                <input type="text" id="lkPuzzleSolution" value="${selectedNpc.lorekeeper?.puzzle_solution || ''}">
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Clues<span class="npc-json-label"> (JSON array: ["clue1", "clue2", ...])</span></label>
                                <textarea id="lkPuzzleClues" class="npc-json-textarea">${selectedNpc.lorekeeper?.puzzle_clues || ''}</textarea>
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Success Message</label>
                                <textarea id="lkPuzzleSuccessMessage" class="npc-textarea">${selectedNpc.lorekeeper?.puzzle_success_message || ''}</textarea>
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Failure Message</label>
                                <input type="text" id="lkPuzzleFailureMessage" value="${selectedNpc.lorekeeper?.puzzle_failure_message || 'That is not the answer I seek.'}">
                            </div>
                        </div>
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label>Reward Item (optional)</label>
                                <select id="lkPuzzleRewardItem">
                                    <option value="">None (no reward)</option>
                                </select>
                            </div>
                        </div>
                        <!-- Lore Keeper Award Behavior (compact) -->
                        <div class="npc-row">
                            <div class="npc-field-group npc-field-full">
                                <label style="margin-bottom: 4px;">Award Behavior</label>
                                <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
                                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lkPuzzleAwardOnceOnly" ${selectedNpc.lorekeeper?.puzzle_award_once_only ? 'checked' : ''}>
                                        <span>Once per player</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lkPuzzleAwardAfterDelay" ${selectedNpc.lorekeeper?.puzzle_award_after_delay ? 'checked' : ''}>
                                        <span>After delay</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <!-- Lore Keeper Delay Settings (shown when "After delay" is checked) -->
                        <div class="npc-row" id="lkPuzzleDelaySettings" style="display: ${selectedNpc.lorekeeper?.puzzle_award_after_delay ? 'flex' : 'none'};">
                            <div class="npc-field-group npc-field-half">
                                <label>Delay (sec)</label>
                                <input type="number" id="lkPuzzleAwardDelaySeconds" min="1" value="${selectedNpc.lorekeeper?.puzzle_award_delay_seconds || 3600}" placeholder="3600" style="width: 100px;">
                            </div>
                            <div class="npc-field-group npc-field-half">
                                <label>Delay Message</label>
                                <input type="text" id="lkPuzzleAwardDelayResponse" value="${selectedNpc.lorekeeper?.puzzle_award_delay_response || ''}" placeholder="Wait before asking again.">
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Advanced Section (Stat Bonuses) -->
                <div id="advancedSection" class="advanced-section">
                    <div class="npc-section-title">Advanced Settings</div>
                    <!-- Row ADV1: Stat Bonus Checkboxes -->
                    <div class="npc-row">
                        <div class="npc-field-group" style="flex: 0 0 auto; min-width: 200px; max-width: 250px;">
                            <label style="margin-bottom: 8px;">Stat Bonuses</label>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px;">
                                    <input type="checkbox" id="npcEnableResonanceBonuses" ${selectedNpc.enable_resonance_bonuses !== false ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                                    <span>Resonance (cycle time & hit rate)</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px;">
                                    <input type="checkbox" id="npcEnableFortitudeBonuses" ${selectedNpc.enable_fortitude_bonuses !== false ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                                    <span>Fortitude (cooldown & harvest time)</span>
                                </label>
                            </div>
                        </div>
                        <div class="npc-field-group" style="flex: 1 1 auto;">
                            <label>Formula Config</label>
                            <button type="button" id="openFormulaConfigBtn" class="npc-small-btn" style="width: 100%;">Edit Global Formulas</button>
                        </div>
                    </div>
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <p class="npc-help-text" style="color: #888; font-size: 11px; margin: 0;">
                                Resonance affects harvest cycle time and hit rate. Fortitude affects cooldown reduction and harvest duration increase.
                                Higher stats = better bonuses.
                            </p>
                        </div>
                    </div>
                    <!-- Row ADV2: Status Messages (with markup support) -->
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-full">
                            <div class="npc-section-title" style="margin-top: 20px; margin-bottom: 10px;">Status Messages</div>
                            <p class="npc-help-text" style="color: #888; font-size: 11px; margin-bottom: 10px;">
                                Customize status messages displayed next to NPC name in rooms. Supports markup (e.g., !Pulsing! for red text).
                            </p>
                        </div>
                    </div>
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-half">
                            <label>Idle Status</label>
                            <input type="text" id="npcStatusMessageIdle" value="${selectedNpc.status_message_idle || '(idle)'}" placeholder="(idle)">
                        </div>
                        <div class="npc-field-group npc-field-half">
                            <label>Ready Status</label>
                            <input type="text" id="npcStatusMessageReady" value="${selectedNpc.status_message_ready || '(ready)'}" placeholder="(ready)">
                        </div>
                    </div>
                    <div class="npc-row">
                        <div class="npc-field-group npc-field-half">
                            <label>Harvesting Status</label>
                            <input type="text" id="npcStatusMessageHarvesting" value="${selectedNpc.status_message_harvesting || '(harvesting)'}" placeholder="(harvesting)">
                        </div>
                        <div class="npc-field-group npc-field-half">
                            <label>Cooldown Status</label>
                            <input type="text" id="npcStatusMessageCooldown" value="${selectedNpc.status_message_cooldown || '(cooldown)'}" placeholder="(cooldown)">
                        </div>
                    </div>
                </div>
                
                <!-- Save Button -->
                <div class="npc-row npc-save-row">
                    <button id="saveNpcBtn">Save NPC</button>
                </div>
            </div>
            <div class="npc-placement-section">
                <h4>Room Placements</h4>
                <div class="npc-placement-controls-horizontal">
                    <select id="npcPlacementMapSelect">
                        <option value="">Select Map...</option>
                    </select>
                    <select id="npcPlacementRoomSelect"></select>
                    <button id="addNpcPlacementBtn" class="npc-small-btn">Add to Room</button>
                </div>
                <div id="npcPlacementList" class="npc-placement-list"></div>
            </div>
        </div>
    `;

    const saveBtn = document.getElementById('saveNpcBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveNpc();
        });
    }

    // Wire up color preview square
    const colorSelect = document.getElementById('npcColor');
    const colorPreview = document.getElementById('npcColorPreview');
    if (colorSelect && colorPreview) {
        const applyColor = () => {
            const c = colorSelect.value || '#00ff00';
            colorPreview.style.backgroundColor = c;
        };
        colorSelect.addEventListener('change', applyColor);
        applyColor();
    }

    // Wire up NPC type change to show/hide Lore Keeper fields
    const npcTypeSelect = document.getElementById('npcType');
    const loreKeeperFields = document.getElementById('loreKeeperFields');
    if (npcTypeSelect && loreKeeperFields) {
        npcTypeSelect.addEventListener('change', () => {
            const isLoreKeeper = npcTypeSelect.value === 'lorekeeper';
            loreKeeperFields.style.display = isLoreKeeper ? 'block' : 'none';
        });
    }

    // Wire up Lore Type change to show/hide dialogue vs puzzle fields
    const lkLoreTypeSelect = document.getElementById('lkLoreType');
    const lkDialogueFields = document.getElementById('lkDialogueFields');
    const lkPuzzleFields = document.getElementById('lkPuzzleFields');
    if (lkLoreTypeSelect && lkDialogueFields && lkPuzzleFields) {
        lkLoreTypeSelect.addEventListener('change', () => {
            const isDialogue = lkLoreTypeSelect.value === 'dialogue';
            lkDialogueFields.style.display = isDialogue ? 'block' : 'none';
            lkPuzzleFields.style.display = isDialogue ? 'none' : 'block';
        });
    }

    // Wire up Puzzle Type change to show/hide Glow Codex fields
    const puzzleTypeSelect = document.getElementById('npcPuzzleType');
    const glowCodexFields = document.getElementById('glowCodexPuzzleFields');
    if (puzzleTypeSelect && glowCodexFields) {
        puzzleTypeSelect.addEventListener('change', () => {
            const isGlowCodex = puzzleTypeSelect.value === 'glow_codex';
            glowCodexFields.style.display = isGlowCodex ? 'block' : 'none';
        });
    }

    // Wire up Award Behavior checkboxes for Glow Codex puzzles (mutually exclusive)
    const npcPuzzleAwardOnceOnly = document.getElementById('npcPuzzleAwardOnceOnly');
    const npcPuzzleAwardAfterDelay = document.getElementById('npcPuzzleAwardAfterDelay');
    const npcPuzzleDelaySettings = document.getElementById('npcPuzzleDelaySettings');
    if (npcPuzzleAwardOnceOnly && npcPuzzleAwardAfterDelay) {
        npcPuzzleAwardOnceOnly.addEventListener('change', () => {
            if (npcPuzzleAwardOnceOnly.checked && npcPuzzleAwardAfterDelay.checked) {
                npcPuzzleAwardAfterDelay.checked = false;
                if (npcPuzzleDelaySettings) npcPuzzleDelaySettings.style.display = 'none';
            }
        });
        npcPuzzleAwardAfterDelay.addEventListener('change', () => {
            if (npcPuzzleAwardAfterDelay.checked && npcPuzzleAwardOnceOnly.checked) {
                npcPuzzleAwardOnceOnly.checked = false;
            }
            if (npcPuzzleDelaySettings) {
                npcPuzzleDelaySettings.style.display = npcPuzzleAwardAfterDelay.checked ? 'flex' : 'none';
            }
        });
    }

    // Wire up Award Behavior checkboxes for Lore Keeper puzzles (mutually exclusive)
    const lkPuzzleAwardOnceOnly = document.getElementById('lkPuzzleAwardOnceOnly');
    const lkPuzzleAwardAfterDelay = document.getElementById('lkPuzzleAwardAfterDelay');
    const lkPuzzleDelaySettings = document.getElementById('lkPuzzleDelaySettings');
    if (lkPuzzleAwardOnceOnly && lkPuzzleAwardAfterDelay) {
        lkPuzzleAwardOnceOnly.addEventListener('change', () => {
            if (lkPuzzleAwardOnceOnly.checked && lkPuzzleAwardAfterDelay.checked) {
                lkPuzzleAwardAfterDelay.checked = false;
                if (lkPuzzleDelaySettings) lkPuzzleDelaySettings.style.display = 'none';
            }
        });
        lkPuzzleAwardAfterDelay.addEventListener('change', () => {
            if (lkPuzzleAwardAfterDelay.checked && lkPuzzleAwardOnceOnly.checked) {
                lkPuzzleAwardOnceOnly.checked = false;
            }
            if (lkPuzzleDelaySettings) {
                lkPuzzleDelaySettings.style.display = lkPuzzleAwardAfterDelay.checked ? 'flex' : 'none';
            }
        });
    }

    const addPlacementBtn = document.getElementById('addNpcPlacementBtn');
    const roomSelect = document.getElementById('npcPlacementRoomSelect');
    if (addPlacementBtn && roomSelect && selectedNpc && selectedNpc.id) {
        addPlacementBtn.addEventListener('click', () => {
            const roomId = parseInt(roomSelect.value, 10);
            if (!roomId) {
                alert('Select a room first.');
                return;
            }
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                alert('Not connected to server. Please wait...');
                return;
            }
            ws.send(JSON.stringify({
                type: 'addNpcToRoom',
                npcId: selectedNpc.id,
                roomId,
                slot: 0
            }));
        });
    }

    // Wire up map select change to load rooms for that map
    const mapSelect = document.getElementById('npcPlacementMapSelect');
    if (mapSelect) {
        mapSelect.addEventListener('change', () => {
            const mapId = parseInt(mapSelect.value, 10);
            if (mapId) {
                loadRoomsForMap(mapId);
            }
        });
    }

    // Populate maps dropdown (if maps are already loaded)
    if (npcPlacementMaps.length > 0) {
        populateNpcPlacementMaps();
    }
    
    populateNpcPlacementRooms();
    renderNpcPlacements();
    
    // Populate reward item dropdowns
    populateRewardItemDropdowns();
    
    // Enable JavaScript-based textarea resizing
    enableTextareaResize();
    
    // Wire up formula config button
    const openFormulaConfigBtn = document.getElementById('openFormulaConfigBtn');
    if (openFormulaConfigBtn) {
        openFormulaConfigBtn.addEventListener('click', () => {
            openFormulaConfigEditor();
        });
    }
}

// Enable JavaScript-based textarea resizing with custom drag handles
function enableTextareaResize() {
    const form = document.querySelector('.npc-editor-form');
    if (!form) return;
    
    const textareas = form.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        // Skip if already has a resize handle
        if (textarea.parentElement.querySelector('.textarea-resize-handle')) return;
        
        // Wrap textarea in a container for positioning
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'block';
        wrapper.style.width = '100%';
        
        textarea.parentNode.insertBefore(wrapper, textarea);
        wrapper.appendChild(textarea);
        
        // Create resize handle
        const handle = document.createElement('div');
        handle.className = 'textarea-resize-handle';
        handle.style.cssText = `
            position: absolute;
            bottom: 2px;
            right: 2px;
            width: 16px;
            height: 16px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, #00ff00 50%);
            opacity: 0.7;
            z-index: 10;
        `;
        wrapper.appendChild(handle);
        
        // Set initial explicit height if not set
        if (!textarea.style.height) {
            textarea.style.height = textarea.offsetHeight + 'px';
        }
        
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        
        const onMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            startY = e.clientY;
            startHeight = textarea.offsetHeight;
            
            document.body.style.cursor = 'nwse-resize';
            document.body.style.userSelect = 'none';
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        
        const onMouseMove = (e) => {
            if (!isResizing) return;
            e.preventDefault();
            
            const deltaY = e.clientY - startY;
            const newHeight = Math.max(60, startHeight + deltaY);
            textarea.style.height = newHeight + 'px';
        };
        
        const onMouseUp = (e) => {
            if (!isResizing) return;
            isResizing = false;
            
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        handle.addEventListener('mousedown', onMouseDown);
    });
}

function startCreateNpc() {
    npcEditorMode = 'create';
    selectedNpc = null;
    // Persist create mode in localStorage
    localStorage.setItem('npcEditorMode', 'create');
    localStorage.removeItem('npcEditorSelectedId');
    renderNpcForm();
}

function selectNpcById(id) {
    const npc = npcList.find(n => n.id === id);
    if (!npc) return;
    npcEditorMode = 'edit';
    selectedNpc = { ...npc };
    // Persist selected NPC ID in localStorage
    localStorage.setItem('npcEditorSelectedId', id.toString());
    localStorage.setItem('npcEditorMode', 'edit');
    renderNpcList();
    renderNpcForm();
    loadNpcPlacements(npc.id);
}

function saveNpc() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server. Please wait...');
        return;
    }

    const name = document.getElementById('npcName').value.trim();
    const description = document.getElementById('npcDescription').value.trim();
    const npc_type = document.getElementById('npcType').value;
    const base_cycle_time = parseInt(document.getElementById('npcBaseCycle').value, 10) || 0;
    const difficulty = parseInt(document.getElementById('npcDifficulty').value, 10) || 1;
    const harvestable_time = parseInt(document.getElementById('npcHarvestable')?.value, 10) || 60000;
    const cooldown_time = parseInt(document.getElementById('npcCooldown')?.value, 10) || 120000;
    const harvest_prerequisite_item = document.getElementById('npcHarvestPrerequisiteItem')?.value.trim() || null;
    const harvest_prerequisite_message = document.getElementById('npcHarvestPrerequisiteMessage')?.value.trim() || null;
    const required_stats = document.getElementById('npcRequiredStats').value.trim();
    const required_buffs = document.getElementById('npcRequiredBuffs').value.trim();
    const input_items = document.getElementById('npcInputItems').value.trim();
    
    // Build output_items JSON from the dynamic list
    const outputItemsList = document.getElementById('npcOutputItemsList');
    const output_items = {};
    if (outputItemsList) {
        const rows = outputItemsList.querySelectorAll('.npc-output-item-row');
        rows.forEach(row => {
            const itemSelect = row.querySelector('.npc-output-item-select');
            const qtyInput = row.querySelector('.npc-output-item-qty');
            if (itemSelect && itemSelect.value && qtyInput) {
                const itemName = itemSelect.value.trim();
                const quantity = parseInt(qtyInput.value, 10) || 1;
                if (itemName) {
                    output_items[itemName] = quantity;
                }
            }
        });
    }
    
    const failure_states = document.getElementById('npcFailureStates').value.trim();
    const display_color = document.getElementById('npcColor') ? document.getElementById('npcColor').value : '#00ff00';
    const active = document.getElementById('npcActive').value === '1' ? 1 : 0;

    if (!name || !npc_type || !base_cycle_time) {
        alert('Name, Type, and Base Cycle Time are required.');
        return;
    }

    const puzzle_type = document.getElementById('npcPuzzleType')?.value || 'none';
    const puzzle_glow_clues = document.getElementById('npcPuzzleGlowClues')?.value.trim() || null;
    const puzzle_extraction_pattern = document.getElementById('npcPuzzleExtractionPattern')?.value.trim() || null;
    const puzzle_solution_word = document.getElementById('npcPuzzleSolutionWord')?.value.trim() || null;
    const puzzle_success_response = document.getElementById('npcPuzzleSuccessResponse')?.value.trim() || null;
    const puzzle_failure_response = document.getElementById('npcPuzzleFailureResponse')?.value.trim() || null;
    const puzzle_reward_item = document.getElementById('npcPuzzleRewardItem')?.value || null;
    const puzzle_hint_responses = document.getElementById('npcPuzzleHintResponses')?.value.trim() || null;
    const puzzle_followup_responses = document.getElementById('npcPuzzleFollowupResponses')?.value.trim() || null;
    const puzzle_incorrect_attempt_responses = document.getElementById('npcPuzzleIncorrectAttemptResponses')?.value.trim() || null;
    
    // Award behavior fields (checkboxes - if neither checked, award every time)
    const puzzle_award_once_only = document.getElementById('npcPuzzleAwardOnceOnly')?.checked || false;
    const puzzle_award_after_delay = document.getElementById('npcPuzzleAwardAfterDelay')?.checked || false;
    const puzzle_award_delay_seconds = puzzle_award_after_delay ? parseInt(document.getElementById('npcPuzzleAwardDelaySeconds')?.value, 10) || 3600 : null;
    const puzzle_award_delay_response = puzzle_award_after_delay ? (document.getElementById('npcPuzzleAwardDelayResponse')?.value.trim() || null) : null;
    
    // Advanced settings
    const enable_resonance_bonuses = document.getElementById('npcEnableResonanceBonuses')?.checked !== false;
    const enable_fortitude_bonuses = document.getElementById('npcEnableFortitudeBonuses')?.checked !== false;
    
    // Status messages (with markup support)
    const status_message_idle = document.getElementById('npcStatusMessageIdle')?.value.trim() || '(idle)';
    const status_message_ready = document.getElementById('npcStatusMessageReady')?.value.trim() || '(ready)';
    const status_message_harvesting = document.getElementById('npcStatusMessageHarvesting')?.value.trim() || '(harvesting)';
    const status_message_cooldown = document.getElementById('npcStatusMessageCooldown')?.value.trim() || '(cooldown)';

    const payloadNpc = {
        name,
        description,
        npc_type,
        base_cycle_time,
        difficulty,
        harvestable_time,
        cooldown_time,
        harvest_prerequisite_item: harvest_prerequisite_item || null,
        harvest_prerequisite_message: harvest_prerequisite_message || null,
        required_stats: required_stats || null,
        required_buffs: required_buffs || null,
        input_items: input_items || null,
        output_items: Object.keys(output_items).length > 0 ? JSON.stringify(output_items) : null,
        failure_states: failure_states || null,
        display_color,
        active,
        puzzle_type,
        puzzle_glow_clues,
        puzzle_extraction_pattern,
        puzzle_solution_word,
        puzzle_success_response,
        puzzle_failure_response,
        puzzle_reward_item,
        puzzle_hint_responses,
        puzzle_followup_responses,
        puzzle_incorrect_attempt_responses,
        puzzle_award_once_only,
        puzzle_award_after_delay,
        puzzle_award_delay_seconds,
        puzzle_award_delay_response,
        enable_resonance_bonuses,
        enable_fortitude_bonuses,
        status_message_idle,
        status_message_ready,
        status_message_harvesting,
        status_message_cooldown
    };

    // Add Lore Keeper data if this is a lorekeeper type
    if (npc_type === 'lorekeeper') {
        const lkLoreType = document.getElementById('lkLoreType')?.value || 'dialogue';
        // Get keywords/responses - use puzzle-specific field if puzzle type, otherwise dialogue field
        const lkKeywordsResponses = lkLoreType === 'puzzle' 
            ? (document.getElementById('lkPuzzleKeywordsResponses')?.value.trim() || null)
            : (document.getElementById('lkKeywordsResponses')?.value.trim() || null);
        const lkIncorrectResponse = lkLoreType === 'puzzle'
            ? (document.getElementById('lkPuzzleIncorrectResponse')?.value.trim() || 'I do not understand what you mean.')
            : (document.getElementById('lkIncorrectResponse')?.value.trim() || 'I do not understand what you mean.');
        const lkEngagementEnabled = document.getElementById('lkEngagementEnabled')?.value === '1';
        const lkEngagementDelay = parseInt(document.getElementById('lkEngagementDelay')?.value, 10) || 3000;
        const lkInitialMessage = document.getElementById('lkInitialMessage')?.value.trim() || null;
        const lkInitialMessageColor = document.getElementById('lkInitialMessageColor')?.value.trim() || '#00ffff';
        const lkKeywordColor = document.getElementById('lkKeywordColor')?.value.trim() || '#ff00ff';
        const lkPuzzleMode = document.getElementById('lkPuzzleMode')?.value || 'word';
        const lkPuzzleClues = document.getElementById('lkPuzzleClues')?.value.trim() || null;
        const lkPuzzleSolution = document.getElementById('lkPuzzleSolution')?.value.trim() || null;
        const lkPuzzleSuccessMessage = document.getElementById('lkPuzzleSuccessMessage')?.value.trim() || null;
        const lkPuzzleFailureMessage = document.getElementById('lkPuzzleFailureMessage')?.value.trim() || 'That is not the answer I seek.';
        const lkPuzzleRewardItem = document.getElementById('lkPuzzleRewardItem')?.value || null;
        
        // Lore Keeper award behavior fields (checkboxes - if neither checked, award every time)
        const lkPuzzleAwardOnceOnly = document.getElementById('lkPuzzleAwardOnceOnly')?.checked || false;
        const lkPuzzleAwardAfterDelay = document.getElementById('lkPuzzleAwardAfterDelay')?.checked || false;
        const lkPuzzleAwardDelaySeconds = lkPuzzleAwardAfterDelay ? parseInt(document.getElementById('lkPuzzleAwardDelaySeconds')?.value, 10) || 3600 : null;
        const lkPuzzleAwardDelayResponse = lkPuzzleAwardAfterDelay ? (document.getElementById('lkPuzzleAwardDelayResponse')?.value.trim() || null) : null;

        payloadNpc.lorekeeper = {
            lore_type: lkLoreType,
            engagement_enabled: lkEngagementEnabled,
            engagement_delay: lkEngagementDelay,
            initial_message: lkInitialMessage,
            initial_message_color: lkInitialMessageColor,
            keyword_color: lkKeywordColor,
            keywords_responses: lkKeywordsResponses,
            incorrect_response: lkIncorrectResponse,
            puzzle_mode: lkPuzzleMode,
            puzzle_clues: lkPuzzleClues,
            puzzle_solution: lkPuzzleSolution,
            puzzle_success_message: lkPuzzleSuccessMessage,
            puzzle_failure_message: lkPuzzleFailureMessage,
            puzzle_reward_item: lkPuzzleRewardItem,
            puzzle_award_once_only: lkPuzzleAwardOnceOnly,
            puzzle_award_after_delay: lkPuzzleAwardAfterDelay,
            puzzle_award_delay_seconds: lkPuzzleAwardDelaySeconds,
            puzzle_award_delay_response: lkPuzzleAwardDelayResponse
        };
    }

    if (npcEditorMode === 'edit' && selectedNpc && selectedNpc.id) {
        payloadNpc.id = selectedNpc.id;
        ws.send(JSON.stringify({
            type: 'updateNPC',
            npc: payloadNpc
        }));
        if (selectedNpc && selectedNpc.id) {
            loadNpcPlacements(selectedNpc.id);
        }
    } else {
        ws.send(JSON.stringify({
            type: 'createNPC',
            npc: payloadNpc
        }));
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    npcEditor = document.getElementById('npcEditor');
    
    // Close button
    const closeNpcEditorBtn = document.getElementById('closeNpcEditor');
    if (closeNpcEditorBtn) {
        closeNpcEditorBtn.addEventListener('click', () => {
            closeNpcEditor();
        });
        
        // Add markup button (μ) next to close button
        if (typeof createMarkupButton !== 'undefined') {
            createMarkupButton('NPC Editor', closeNpcEditorBtn);
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
                } else if (targetEditor === 'item-editor') {
                    window.location.href = '/item-editor.html';
                }
            }, 100);
        });
    });

    const createNewNpcBtn = document.getElementById('createNewNpcBtn');
    if (createNewNpcBtn) {
        createNewNpcBtn.addEventListener('click', () => {
            startCreateNpc();
        });
    }

    const npcSelector = document.getElementById('npcSelector');
    if (npcSelector) {
        npcSelector.addEventListener('change', (e) => {
            const npcId = parseInt(e.target.value, 10);
            if (!isNaN(npcId)) {
                selectNpcById(npcId);
            }
        });
    }
    
    // Start in list mode
    enterNpcListMode();
    
    // Connect to WebSocket and initialize
    connectWebSocket();
    
    // Request NPC list, placement maps/rooms, and items from server
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllNPCs' }));
            ws.send(JSON.stringify({ type: 'getNpcPlacementMaps' }));
            ws.send(JSON.stringify({ type: 'getAllItems' }));
        }
    }, 500);
    
    // Add output item button handler
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'addOutputItemBtn') {
            addOutputItemRow();
        }
    });
});

// ============================================================
// Formula Config Editor
// ============================================================

let formulaConfigs = [];

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
    
    const cycleConfig = configs.find(c => c.config_key === 'cycle_time_reduction') || {};
    const hitConfig = configs.find(c => c.config_key === 'hit_rate') || {};
    const cooldownConfig = configs.find(c => c.config_key === 'cooldown_time_reduction') || {};
    const harvestableConfig = configs.find(c => c.config_key === 'harvestable_time_increase') || {};
    
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
            <h2 style="margin-top: 0; border-bottom: 1px solid #006600; padding-bottom: 10px;">Harvest Formula Configuration</h2>
            
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #00ffff;">Cycle Time Reduction</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${cycleConfig.description || 'Reduces time between item production cycles during harvest.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Resonance</label>
                        <input type="number" id="cycleMinResonance" value="${cycleConfig.min_resonance || 5}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Value (%)</label>
                        <input type="number" id="cycleMinValue" value="${((cycleConfig.min_value || 0.05) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Curve Exponent</label>
                        <input type="number" id="cycleCurveExponent" value="${cycleConfig.curve_exponent || 2}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Resonance</label>
                        <input type="number" id="cycleMaxResonance" value="${cycleConfig.max_resonance || 100}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Value (%)</label>
                        <input type="number" id="cycleMaxValue" value="${((cycleConfig.max_value || 0.75) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                </div>
                <div id="cyclePreview" style="margin-top: 10px; font-size: 11px; color: #888;"></div>
            </div>
            
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #ffa500;">Hit Rate</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${hitConfig.description || 'Chance to successfully produce items each harvest cycle.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Resonance</label>
                        <input type="number" id="hitMinResonance" value="${hitConfig.min_resonance || 5}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Value (%)</label>
                        <input type="number" id="hitMinValue" value="${((hitConfig.min_value || 0.5) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Curve Exponent</label>
                        <input type="number" id="hitCurveExponent" value="${hitConfig.curve_exponent || 2}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Resonance</label>
                        <input type="number" id="hitMaxResonance" value="${hitConfig.max_resonance || 100}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Value (%)</label>
                        <input type="number" id="hitMaxValue" value="${((hitConfig.max_value || 1.0) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                </div>
                <div id="hitPreview" style="margin-top: 10px; font-size: 11px; color: #888;"></div>
            </div>
            
            <div class="formula-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <h3 style="margin-top: 0; color: #ff8800;">Cooldown Time Reduction</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${cooldownConfig.description || 'Reduces cooldown time after harvest based on Fortitude.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Fortitude</label>
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
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Fortitude</label>
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
                <h3 style="margin-top: 0; color: #ff00ff;">Harvestable Time Increase</h3>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">
                    ${harvestableConfig.description || 'Increases total harvest duration based on Fortitude.'}
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Fortitude</label>
                        <input type="number" id="harvestableMinResonance" value="${harvestableConfig.min_resonance || 5}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Min Value (%)</label>
                        <input type="number" id="harvestableMinValue" value="${((harvestableConfig.min_value || 0.05) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Curve Exponent</label>
                        <input type="number" id="harvestableCurveExponent" value="${harvestableConfig.curve_exponent || 2}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Fortitude</label>
                        <input type="number" id="harvestableMaxResonance" value="${harvestableConfig.max_resonance || 100}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; margin-bottom: 4px;">Max Value (%)</label>
                        <input type="number" id="harvestableMaxValue" value="${((harvestableConfig.max_value || 0.5) * 100).toFixed(1)}" step="0.1" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px;">
                    </div>
                </div>
                <div id="harvestablePreview" style="margin-top: 10px; font-size: 11px; color: #888;"></div>
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
    // Cycle time reduction preview
    const cycleMinRes = parseInt(document.getElementById('cycleMinResonance')?.value) || 5;
    const cycleMinVal = (parseFloat(document.getElementById('cycleMinValue')?.value) || 5) / 100;
    const cycleMaxRes = parseInt(document.getElementById('cycleMaxResonance')?.value) || 100;
    const cycleMaxVal = (parseFloat(document.getElementById('cycleMaxValue')?.value) || 75) / 100;
    const cycleExp = parseFloat(document.getElementById('cycleCurveExponent')?.value) || 2;
    
    const cyclePreview = document.getElementById('cyclePreview');
    if (cyclePreview) {
        const samples = [5, 25, 50, 75, 100];
        const cycleResults = samples.map(res => {
            const norm = Math.max(0, Math.min(1, (res - cycleMinRes) / (cycleMaxRes - cycleMinRes)));
            const val = cycleMinVal + (cycleMaxVal - cycleMinVal) * Math.pow(norm, cycleExp);
            return `Res ${res}: ${(val * 100).toFixed(1)}% reduction`;
        });
        cyclePreview.textContent = cycleResults.join(' | ');
    }
    
    // Hit rate preview
    const hitMinRes = parseInt(document.getElementById('hitMinResonance')?.value) || 5;
    const hitMinVal = (parseFloat(document.getElementById('hitMinValue')?.value) || 50) / 100;
    const hitMaxRes = parseInt(document.getElementById('hitMaxResonance')?.value) || 100;
    const hitMaxVal = (parseFloat(document.getElementById('hitMaxValue')?.value) || 100) / 100;
    const hitExp = parseFloat(document.getElementById('hitCurveExponent')?.value) || 2;
    
    const hitPreview = document.getElementById('hitPreview');
    if (hitPreview) {
        const samples = [5, 25, 50, 75, 100];
        const hitResults = samples.map(res => {
            const norm = Math.max(0, Math.min(1, (res - hitMinRes) / (hitMaxRes - hitMinRes)));
            const val = hitMinVal + (hitMaxVal - hitMinVal) * Math.pow(norm, hitExp);
            return `Res ${res}: ${(val * 100).toFixed(1)}% hit`;
        });
        hitPreview.textContent = hitResults.join(' | ');
    }
    
    // Cooldown time reduction preview
    const cooldownMinRes = parseInt(document.getElementById('cooldownMinResonance')?.value) || 5;
    const cooldownMinVal = (parseFloat(document.getElementById('cooldownMinValue')?.value) || 5) / 100;
    const cooldownMaxRes = parseInt(document.getElementById('cooldownMaxResonance')?.value) || 100;
    const cooldownMaxVal = (parseFloat(document.getElementById('cooldownMaxValue')?.value) || 75) / 100;
    const cooldownExp = parseFloat(document.getElementById('cooldownCurveExponent')?.value) || 2;
    
    const cooldownPreview = document.getElementById('cooldownPreview');
    if (cooldownPreview) {
        const samples = [5, 25, 50, 75, 100];
        const cooldownResults = samples.map(fort => {
            const norm = Math.max(0, Math.min(1, (fort - cooldownMinRes) / (cooldownMaxRes - cooldownMinRes)));
            const val = cooldownMinVal + (cooldownMaxVal - cooldownMinVal) * Math.pow(norm, cooldownExp);
            return `Fort ${fort}: ${(val * 100).toFixed(1)}% reduction`;
        });
        cooldownPreview.textContent = cooldownResults.join(' | ');
    }
    
    // Harvestable time increase preview
    const harvestableMinRes = parseInt(document.getElementById('harvestableMinResonance')?.value) || 5;
    const harvestableMinVal = (parseFloat(document.getElementById('harvestableMinValue')?.value) || 5) / 100;
    const harvestableMaxRes = parseInt(document.getElementById('harvestableMaxResonance')?.value) || 100;
    const harvestableMaxVal = (parseFloat(document.getElementById('harvestableMaxValue')?.value) || 50) / 100;
    const harvestableExp = parseFloat(document.getElementById('harvestableCurveExponent')?.value) || 2;
    
    const harvestablePreview = document.getElementById('harvestablePreview');
    if (harvestablePreview) {
        const samples = [5, 25, 50, 75, 100];
        const harvestableResults = samples.map(fort => {
            const norm = Math.max(0, Math.min(1, (fort - harvestableMinRes) / (harvestableMaxRes - harvestableMinRes)));
            const val = harvestableMinVal + (harvestableMaxVal - harvestableMinVal) * Math.pow(norm, harvestableExp);
            return `Fort ${fort}: ${(val * 100).toFixed(1)}% increase`;
        });
        harvestablePreview.textContent = harvestableResults.join(' | ');
    }
}

function saveFormulaConfigs() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showEditorNotification('Not connected to server', 'error');
        return;
    }
    
    // Cycle time reduction config
    const cycleConfig = {
        config_key: 'cycle_time_reduction',
        min_resonance: parseInt(document.getElementById('cycleMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('cycleMinValue')?.value) || 5) / 100,
        max_resonance: parseInt(document.getElementById('cycleMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('cycleMaxValue')?.value) || 75) / 100,
        curve_exponent: parseFloat(document.getElementById('cycleCurveExponent')?.value) || 2
    };
    
    // Hit rate config
    const hitConfig = {
        config_key: 'hit_rate',
        min_resonance: parseInt(document.getElementById('hitMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('hitMinValue')?.value) || 50) / 100,
        max_resonance: parseInt(document.getElementById('hitMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('hitMaxValue')?.value) || 100) / 100,
        curve_exponent: parseFloat(document.getElementById('hitCurveExponent')?.value) || 2
    };
    
    // Cooldown time reduction config
    const cooldownConfig = {
        config_key: 'cooldown_time_reduction',
        min_resonance: parseInt(document.getElementById('cooldownMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('cooldownMinValue')?.value) || 5) / 100,
        max_resonance: parseInt(document.getElementById('cooldownMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('cooldownMaxValue')?.value) || 75) / 100,
        curve_exponent: parseFloat(document.getElementById('cooldownCurveExponent')?.value) || 2
    };
    
    // Harvestable time increase config
    const harvestableConfig = {
        config_key: 'harvestable_time_increase',
        min_resonance: parseInt(document.getElementById('harvestableMinResonance')?.value) || 5,
        min_value: (parseFloat(document.getElementById('harvestableMinValue')?.value) || 5) / 100,
        max_resonance: parseInt(document.getElementById('harvestableMaxResonance')?.value) || 100,
        max_value: (parseFloat(document.getElementById('harvestableMaxValue')?.value) || 50) / 100,
        curve_exponent: parseFloat(document.getElementById('harvestableCurveExponent')?.value) || 2
    };
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: cycleConfig
    }));
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: hitConfig
    }));
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: cooldownConfig
    }));
    
    ws.send(JSON.stringify({
        type: 'updateHarvestFormulaConfig',
        config: harvestableConfig
    }));
    
    showEditorNotification('Formula configurations saved!');
}

