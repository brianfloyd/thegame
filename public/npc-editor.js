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
        case 'npcList':
            npcList = data.npcs || [];
            renderNpcList();
            if (selectedNpc) {
                renderNpcForm();
            }
            break;
        case 'npcCreated':
            if (data.npc) {
                npcList.push(data.npc);
                selectedNpc = data.npc;
                npcEditorMode = 'edit';
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
                <!-- Row 2: Type (25%) + Base ms (25%) + Diff (25%) + Active (25%) -->
                <div class="npc-row">
                    <div class="npc-field-group npc-field-quarter">
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
                    <div class="npc-field-group npc-field-quarter">
                        <label>Base ms</label>
                        <input type="number" id="npcBaseCycle" value="${selectedNpc.base_cycle_time || 0}">
                    </div>
                    <div class="npc-field-group npc-field-quarter">
                        <label>Diff</label>
                        <input type="number" id="npcDifficulty" value="${selectedNpc.difficulty || 1}">
                    </div>
                    <div class="npc-field-group npc-field-quarter">
                        <label>Active</label>
                        <select id="npcActive">
                            <option value="1" ${selectedNpc.active ? 'selected' : ''}>Yes</option>
                            <option value="0" ${!selectedNpc.active ? 'selected' : ''}>No</option>
                        </select>
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
                        <label>Output Items<span class="npc-json-label"> (JSON)</span></label>
                        <textarea id="npcOutputItems" class="npc-json-textarea">${selectedNpc.output_items || ''}</textarea>
                    </div>
                </div>
                <!-- Row 5: Failure States (full width) -->
                <div class="npc-row" id="npcStandardFields">
                    <div class="npc-field-group npc-field-full">
                        <label>Failure States<span class="npc-json-label"> (JSON)</span></label>
                        <textarea id="npcFailureStates" class="npc-json-textarea">${selectedNpc.failure_states || ''}</textarea>
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
}

function startCreateNpc() {
    npcEditorMode = 'create';
    selectedNpc = null;
    renderNpcForm();
}

function selectNpcById(id) {
    const npc = npcList.find(n => n.id === id);
    if (!npc) return;
    npcEditorMode = 'edit';
    selectedNpc = { ...npc };
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
    const required_stats = document.getElementById('npcRequiredStats').value.trim();
    const required_buffs = document.getElementById('npcRequiredBuffs').value.trim();
    const input_items = document.getElementById('npcInputItems').value.trim();
    const output_items = document.getElementById('npcOutputItems').value.trim();
    const failure_states = document.getElementById('npcFailureStates').value.trim();
    const display_color = document.getElementById('npcColor') ? document.getElementById('npcColor').value : '#00ff00';
    const active = document.getElementById('npcActive').value === '1' ? 1 : 0;

    if (!name || !npc_type || !base_cycle_time) {
        alert('Name, Type, and Base Cycle Time are required.');
        return;
    }

    const payloadNpc = {
        name,
        description,
        npc_type,
        base_cycle_time,
        difficulty,
        required_stats: required_stats || null,
        required_buffs: required_buffs || null,
        input_items: input_items || null,
        output_items: output_items || null,
        failure_states: failure_states || null,
        display_color,
        active
    };

    // Add Lore Keeper data if this is a lorekeeper type
    if (npc_type === 'lorekeeper') {
        const lkLoreType = document.getElementById('lkLoreType')?.value || 'dialogue';
        const lkEngagementEnabled = document.getElementById('lkEngagementEnabled')?.value === '1';
        const lkEngagementDelay = parseInt(document.getElementById('lkEngagementDelay')?.value, 10) || 3000;
        const lkInitialMessage = document.getElementById('lkInitialMessage')?.value.trim() || null;
        const lkInitialMessageColor = document.getElementById('lkInitialMessageColor')?.value.trim() || '#00ffff';
        const lkKeywordColor = document.getElementById('lkKeywordColor')?.value.trim() || '#ff00ff';
        const lkKeywordsResponses = document.getElementById('lkKeywordsResponses')?.value.trim() || null;
        const lkIncorrectResponse = document.getElementById('lkIncorrectResponse')?.value.trim() || 'I do not understand what you mean.';
        const lkPuzzleMode = document.getElementById('lkPuzzleMode')?.value || 'word';
        const lkPuzzleClues = document.getElementById('lkPuzzleClues')?.value.trim() || null;
        const lkPuzzleSolution = document.getElementById('lkPuzzleSolution')?.value.trim() || null;
        const lkPuzzleSuccessMessage = document.getElementById('lkPuzzleSuccessMessage')?.value.trim() || null;
        const lkPuzzleFailureMessage = document.getElementById('lkPuzzleFailureMessage')?.value.trim() || 'That is not the answer I seek.';

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
            puzzle_failure_message: lkPuzzleFailureMessage
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
    }

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
    
    // Request NPC list and placement maps/rooms from server
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllNPCs' }));
            ws.send(JSON.stringify({ type: 'getNpcPlacementMaps' }));
        }
    }, 500);
});

