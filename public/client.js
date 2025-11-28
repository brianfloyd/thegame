// Build: force cache bust
let ws = null;
let currentPlayerName = null;
let currentRoomId = null; // Track current room to detect room changes

// Widget system state
const TOGGLEABLE_WIDGETS = ['stats', 'compass', 'map', 'communication'];
let activeWidgets = ['stats', 'compass', 'map']; // Currently visible widgets
let npcWidgetVisible = false; // NPC widget is special - auto-managed
let factoryWidgetVisible = false; // Factory widget is special - auto-managed
let factoryWidgetState = { slots: [null, null], textInput: '' }; // Factory widget state

// Communication widget state
let commMode = 'talk'; // 'talk', 'resonate', 'telepath'
let commHistory = {
    talk: [],
    resonate: [],
    telepath: []
};
let commTargetPlayer = null; // For telepathy mode

// Get protocol (ws or wss) based on current page protocol
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

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
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
}

// Handle messages from server
function handleMessage(data) {
    switch (data.type) {
        case 'roomUpdate':
            updateRoomView(data.room, data.players, data.exits, data.npcs, data.roomItems, data.showFullInfo);
            // Handle factory widget state
            if (data.factoryWidgetState !== undefined) {
                if (data.room.roomType === 'factory') {
                    factoryWidgetState = data.factoryWidgetState;
                    showFactoryWidget(factoryWidgetState);
                } else {
                    hideFactoryWidget();
                }
            }
            break;
        case 'inventoryList':
            displayInventory(data.items);
            break;
        case 'playerJoined':
            addPlayerToTerminal(data.playerName, data.direction);
            break;
        case 'playerLeft':
            removePlayerFromTerminal(data.playerName, data.direction);
            break;
        case 'resonated':
            displayResonatedMessage(data.playerName, data.message);
            // Check if this is from current player or another player
            const isResonatedFromSelf = data.playerName === currentPlayerName;
            addToCommHistory('resonate', data.playerName, data.message, !isResonatedFromSelf);
            break;
        case 'talked':
            displayTalkedMessage(data.playerName, data.message);
            // Check if this is from current player or another player
            const isTalkedFromSelf = data.playerName === currentPlayerName;
            addToCommHistory('talk', data.playerName, data.message, !isTalkedFromSelf);
            break;
        case 'telepath':
            displayTelepathMessage(data.fromPlayer, data.message, true);
            addToCommHistory('telepath', data.fromPlayer, data.message, true);
            break;
        case 'telepathSent':
            displayTelepathMessage(data.toPlayer, data.message, false);
            addToCommHistory('telepath', currentPlayerName, data.message, false, data.toPlayer);
            break;
        case 'systemMessage':
            displaySystemMessage(data.message);
            break;
        case 'moved':
            updateRoomView(data.room, data.players, data.exits, data.npcs, data.roomItems, data.showFullInfo);
            break;
        case 'playerStats':
            updatePlayerStats(data.stats);
            // Set current player name and update page title
            if (data.stats.playerName) {
                currentPlayerName = data.stats.playerName;
                document.title = `The Game - ${data.stats.playerName}`;
            }
            // godMode is returned as an object with .value property from dynamic stats system
            if (data.stats.godMode !== undefined) {
                updateGodModeUI(data.stats.godMode.value === true);
            }
            break;
        case 'mapData':
            initializeMap(data.rooms, data.currentRoom, data.mapId, data.roomTypeColors);
            break;
        case 'mapUpdate':
            updateMapPosition(data.currentRoom, data.mapId);
            break;
        case 'error':
            addToTerminal(data.message, 'error');
            break;
        case 'message':
            if (data.message) {
                addToTerminal(data.message, 'info');
            }
            break;
        case 'jumpMaps':
            populateJumpMaps(data.maps);
            break;
        case 'jumpRooms':
            populateJumpRooms(data.rooms);
            break;
        case 'mapEditorData':
            // Check if this is for target map selection in connect mode
            const targetRoomSelect = document.getElementById('targetRoomSelect');
            if (targetRoomSelect && editorMode === 'connect') {
                // This is for populating target room selector
                targetRoomSelect.innerHTML = '<option value="">Select a room...</option>';
                
                // Group rooms by street name (extract street name from room name)
                const roomsByStreet = {};
                data.rooms.forEach(room => {
                    // Extract street name (everything before the number or last word)
                    let streetName = room.name;
                    // Try to extract street name by removing trailing numbers
                    const match = room.name.match(/^(.+?)\s*\d+$/);
                    if (match) {
                        streetName = match[1].trim();
                    } else {
                        // If no number, use the full name
                        streetName = room.name;
                    }
                    
                    if (!roomsByStreet[streetName]) {
                        roomsByStreet[streetName] = [];
                    }
                    roomsByStreet[streetName].push(room);
                });
                
                // Sort street names alphabetically
                const sortedStreets = Object.keys(roomsByStreet).sort();
                
                // Create optgroups for each street
                sortedStreets.forEach(streetName => {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = streetName;
                    
                    // Sort rooms within street by coordinates (x, then y)
                    roomsByStreet[streetName].sort((a, b) => {
                        if (a.x !== b.x) return a.x - b.x;
                        return a.y - b.y;
                    });
                    
                    roomsByStreet[streetName].forEach(room => {
                        const option = document.createElement('option');
                        option.value = `${room.x},${room.y}`;
                        option.textContent = `${room.name} (${room.x}, ${room.y})`;
                        optgroup.appendChild(option);
                    });
                    
                    targetRoomSelect.appendChild(optgroup);
                });
            } else {
                // Normal map editor data load
                editorMapRooms = data.rooms;
                
                // If this is the current player's map, automatically select and highlight their current room
                if (currentMapId && currentMapId === currentEditorMapId && currentRoomPos) {
                    const currentRoom = editorMapRooms.find(r => 
                        r.x === currentRoomPos.x && 
                        r.y === currentRoomPos.y
                    );
                    if (currentRoom) {
                        selectedRoom = currentRoom;
                        selectedRooms = [currentRoom];
                        
                        // Calculate zoom to show 20x20 area centered on current room
                        // Use requestAnimationFrame to ensure canvas is sized
                        requestAnimationFrame(() => {
                            if (mapEditorCanvas) {
                                const canvasWidth = mapEditorCanvas.width;
                                const canvasHeight = mapEditorCanvas.height;
                                const gridWidth = EDITOR_GRID_SIZE * EDITOR_CELL_SIZE;
                                const gridHeight = EDITOR_GRID_SIZE * EDITOR_CELL_SIZE;
                                
                                // Base scale to fit grid in canvas
                                const baseScaleX = canvasWidth / gridWidth;
                                const baseScaleY = canvasHeight / gridHeight;
                                const baseScale = Math.min(baseScaleX, baseScaleY, 1);
                                
                                // Calculate zoom to show exactly 20 cells
                                // We want: 20 cells * cellSize = canvas dimension
                                // cellSize = EDITOR_CELL_SIZE * baseScale * editorZoom
                                // So: 20 * EDITOR_CELL_SIZE * baseScale * editorZoom = canvas dimension
                                const targetCells = 20;
                                const zoomForWidth = (canvasWidth / targetCells) / (EDITOR_CELL_SIZE * baseScale);
                                const zoomForHeight = (canvasHeight / targetCells) / (EDITOR_CELL_SIZE * baseScale);
                                // Use the smaller zoom to ensure both dimensions fit
                                editorZoom = Math.min(zoomForWidth, zoomForHeight);
                                
                                // Now calculate pan to center the current room
                                // The grid is 100x100 centered at map coordinate (0, 0)
                                // Grid center (50, 50) represents map coordinate (0, 0)
                                // Room at map (x, y) is at grid position (50 + x, 50 - y)
                                // 
                                // To center room at (x, y) on canvas:
                                // We want: screenX = canvasWidth/2 and screenY = canvasHeight/2
                                // 
                                // screenX = offsetX + (50 + x) * scaledCellSize
                                // offsetX = centerOffsetX - (editorPanX * scaledCellSize)
                                // centerOffsetX = (canvasWidth - scaledGridWidth) / 2
                                //
                                // So: (canvasWidth - scaledGridWidth)/2 - (editorPanX * scaledCellSize) + (50 + x) * scaledCellSize = canvasWidth/2
                                // Simplifying: -editorPanX + 50 + x = scaledGridWidth/(2*scaledCellSize) = 50
                                // Therefore: editorPanX = x
                                //
                                // For Y (inverted):
                                // screenY = offsetY + (50 - y) * scaledCellSize
                                // offsetY = centerOffsetY + (editorPanY * scaledCellSize)
                                // centerOffsetY = (canvasHeight - scaledGridHeight) / 2
                                //
                                // So: (canvasHeight - scaledGridHeight)/2 + (editorPanY * scaledCellSize) + (50 - y) * scaledCellSize = canvasHeight/2
                                // Simplifying: editorPanY + 50 - y = scaledGridHeight/(2*scaledCellSize) = 50
                                // Therefore: editorPanY = y
                                
                                const centerX = currentRoom.x;
                                const centerY = currentRoom.y;
                                
                                editorPanX = centerX;
                                editorPanY = centerY; // Y is already handled by gridY = 50 - room.y
                                
                                renderMapEditor();
                            }
                        });
                    }
                }
                
                // Update side panel if a room is selected to show connection info
                if (selectedRoom) {
                    updateSidePanel();
                }
                renderMapEditor();
            }
            break;
        case 'mapCreated':
            // Add to map selector and load it
            const mapSelector = document.getElementById('mapSelector');
            if (mapSelector) {
                const option = document.createElement('option');
                option.value = data.mapId;
                option.textContent = data.name;
                mapSelector.appendChild(option);
                mapSelector.value = data.mapId;
            }
            loadMapForEditor(data.mapId);
            break;
        case 'roomCreated':
            // Add room to editor and re-render
            editorMapRooms.push(data.room);
            // If speed mode is active, select the newly created room and keep speed mode active
            if (speedModeActive) {
                selectedRoom = data.room;
                selectedRooms = [data.room];
                // Keep speed mode active so user can continue navigating
                speedModeActive = true;
            } else {
                selectedRoom = null;
                selectedRooms = [];
            }
            updateSidePanel();
            renderMapEditor();
            break;
        case 'roomUpdated':
            // Update room in editor
            const index = editorMapRooms.findIndex(r => r.id === data.room.id);
            if (index !== -1) {
                editorMapRooms[index] = data.room;
                // Update selected room(s) if they're being updated
                if (selectedRoom && selectedRoom.id === data.room.id) {
                    selectedRoom = data.room;
                }
                const selectedIndex = selectedRooms.findIndex(r => r.id === data.room.id);
                if (selectedIndex !== -1) {
                    selectedRooms[selectedIndex] = data.room;
                }
            }
            renderMapEditor();
            updateSidePanel();
            break;
        case 'roomDeleted':
            // Remove room from editor
            if (data.roomId) {
                editorMapRooms = editorMapRooms.filter(r => r.id !== data.roomId);
                // Clear selection if deleted room was selected
                if (selectedRoom && selectedRoom.id === data.roomId) {
                    selectedRoom = null;
                }
                selectedRooms = selectedRooms.filter(r => r.id !== data.roomId);
                // If all selected rooms are deleted, clear selection
                if (selectedRooms.length === 0) {
                    selectedRoom = null;
                }
                renderMapEditor();
                updateSidePanel();
            }
            break;
        case 'allMaps':
            // Store maps data for lookup
            allMapsData = data.maps;
            
            // Populate map selector
            const selector = document.getElementById('mapSelector');
            const targetMapSelect = document.getElementById('targetMapSelect');
            if (selector) {
                selector.innerHTML = '<option value="">Select a map...</option>';
                data.maps.forEach(map => {
                    const option = document.createElement('option');
                    option.value = map.id;
                    option.textContent = map.name;
                    selector.appendChild(option);
                });
                // Set to current player's map if available
                if (currentMapId) {
                    selector.value = currentMapId;
                }
            }
            if (targetMapSelect) {
                targetMapSelect.innerHTML = '<option value="">Select target map...</option>';
                data.maps.forEach(map => {
                    const option = document.createElement('option');
                    option.value = map.id;
                    option.textContent = map.name;
                    targetMapSelect.appendChild(option);
                });
            }
            break;
        case 'mapDisconnected':
            // Update room connection info after disconnection
            if (data.room) {
                const roomIndex = editorMapRooms.findIndex(r => r.id === data.room.id);
                if (roomIndex !== -1) {
                    // Update room data to remove connection
                    editorMapRooms[roomIndex] = {
                        ...editorMapRooms[roomIndex],
                        connected_map_id: null,
                        connected_room_x: null,
                        connected_room_y: null,
                        connection_direction: null
                    };
                    // Update selected room if it's the one that was disconnected
                    if (selectedRoom && selectedRoom.id === data.room.id) {
                        selectedRoom = editorMapRooms[roomIndex];
                        updateSidePanel();
                    }
                }
            }
            renderMapEditor();
            break;
        case 'mapConnected':
            // Reload map data
            if (currentEditorMapId) {
                loadMapForEditor(currentEditorMapId);
            }
            alert('Maps connected successfully!');
            break;
        case 'npcList':
            npcList = data.npcs || [];
            renderNpcList();
            renderNpcForm();
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
                loadNpcPlacements(data.npc.id);
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
                addToTerminal(`NPC placement rooms error: ${data.error}`, 'error');
                return;
            }
            npcPlacementMap = data.map || null;
            npcPlacementRooms = Array.isArray(data.rooms) ? data.rooms : [];
            // Refresh room dropdown if we're currently showing the form
            populateNpcPlacementRooms();
            break;
    }
}

function loadNpcPlacements(npcId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'getNpcPlacements',
        npcId
    }));
}

let npcPlacementRooms = [];
let npcPlacementMap = null;

function populateNpcPlacementRooms() {
    const roomSelect = document.getElementById('npcPlacementRoomSelect');
    if (!roomSelect) return;

    roomSelect.innerHTML = '';

    if (!npcPlacementRooms || npcPlacementRooms.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No rooms available (Moonless Meadow not found)';
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

// Command mapping for all variations
// ============================================================
// COMMAND REGISTRY - Central registry for all game commands
// Add new commands here and they will automatically appear in help
// ============================================================
const COMMAND_REGISTRY = [
    // Movement commands
    { name: 'north', abbrev: 'n', description: 'Move north', category: 'Movement' },
    { name: 'south', abbrev: 's', description: 'Move south', category: 'Movement' },
    { name: 'east', abbrev: 'e', description: 'Move east', category: 'Movement' },
    { name: 'west', abbrev: 'w', description: 'Move west', category: 'Movement' },
    { name: 'northeast', abbrev: 'ne', description: 'Move northeast', category: 'Movement' },
    { name: 'northwest', abbrev: 'nw', description: 'Move northwest', category: 'Movement' },
    { name: 'southeast', abbrev: 'se', description: 'Move southeast', category: 'Movement' },
    { name: 'southwest', abbrev: 'sw', description: 'Move southwest', category: 'Movement' },
    { name: 'up', abbrev: 'u', description: 'Move up', category: 'Movement' },
    { name: 'down', abbrev: 'd', description: 'Move down', category: 'Movement' },
    
    // Information commands
    { name: 'look', abbrev: 'l', description: 'Look at room or target (l <target>)', category: 'Information' },
    { name: 'inventory', abbrev: 'i, inv', description: 'Show your inventory', category: 'Information' },
    { name: 'help', abbrev: '?', description: 'Show available commands', category: 'Information' },
    
    // Item commands
    { name: 'take', abbrev: 't, get, pickup', description: 'Pick up an item (take <item>)', category: 'Items' },
    { name: 'drop', abbrev: null, description: 'Drop an item (drop <item>)', category: 'Items' },
    
    // NPC interaction commands
    { name: 'harvest', abbrev: 'h/p', description: 'Harvest from NPC (harvest <npc>)', category: 'NPC' },
    { name: 'collect', abbrev: 'c', description: 'Alias for harvest', category: 'NPC' },
    { name: 'gather', abbrev: 'g', description: 'Alias for harvest', category: 'NPC' },
    
    // Communication commands
    { name: 'talk', abbrev: 'say, t', description: 'Talk to players in room (talk <message>)', category: 'Communication' },
    { name: 'resonate', abbrev: 'res, r', description: 'Broadcast message to all players (resonate <message>)', category: 'Communication' },
    { name: 'telepath', abbrev: 'tele, tell, whisper', description: 'Private message to player (telepath <player> <message>)', category: 'Communication' },
];

// Build command map from registry for movement commands
const commandMap = {
    'north': 'N', 'n': 'N',
    'south': 'S', 's': 'S',
    'east': 'E', 'e': 'E',
    'west': 'W', 'w': 'W',
    'northeast': 'NE', 'ne': 'NE',
    'northwest': 'NW', 'nw': 'NW',
    'southeast': 'SE', 'se': 'SE',
    'southwest': 'SW', 'sw': 'SW',
    'up': 'U', 'u': 'U',
    'down': 'D', 'd': 'D',
    'look': 'LOOK', 'l': 'LOOK'
};

// Display help - shows all commands from registry
function displayHelp() {
    const terminalContent = document.getElementById('terminalContent');
    
    // Create help container
    const helpDiv = document.createElement('div');
    helpDiv.className = 'help-section';
    
    // Title
    const titleDiv = document.createElement('div');
    titleDiv.className = 'help-title';
    titleDiv.textContent = '=== Available Commands ===';
    helpDiv.appendChild(titleDiv);
    
    // Group commands by category
    const categories = {};
    COMMAND_REGISTRY.forEach(cmd => {
        if (!categories[cmd.category]) {
            categories[cmd.category] = [];
        }
        categories[cmd.category].push(cmd);
    });
    
    // Display each category
    for (const [category, commands] of Object.entries(categories)) {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'help-category';
        categoryDiv.textContent = `[${category}]`;
        helpDiv.appendChild(categoryDiv);
        
        commands.forEach(cmd => {
            const cmdDiv = document.createElement('div');
            cmdDiv.className = 'help-command';
            const abbrevStr = cmd.abbrev ? ` (${cmd.abbrev})` : '';
            cmdDiv.innerHTML = `  <span class="help-cmd-name">${cmd.name}${abbrevStr}</span> - ${cmd.description}`;
            helpDiv.appendChild(cmdDiv);
        });
    }
    
    terminalContent.appendChild(helpDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Normalize command input (uses first word only)
function normalizeCommand(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);
    const key = parts[0].toLowerCase();
    return commandMap[key] || null;
}

// Update room view in terminal - called on room updates
// Only shows full room info when entering a new room
function updateRoomView(room, players, exits, npcs, roomItems, forceFullDisplay = false) {
    const terminalContent = document.getElementById('terminalContent');
    const isNewRoom = room.id !== currentRoomId;
    
    // Track current room
    if (isNewRoom) {
        currentRoomId = room.id;
    }
    
    // Only display full room info when entering a new room or forced (look command)
    if (isNewRoom || forceFullDisplay) {
        // Add separator for readability
        if (terminalContent.children.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'terminal-separator';
            separator.textContent = '─'.repeat(40);
            terminalContent.appendChild(separator);
        }
        
        // Display room name with map name prefix
        const roomNameDiv = document.createElement('div');
        roomNameDiv.className = 'room-name';
        const displayName = room.mapName ? `${room.mapName}, ${room.name}` : room.name;
        roomNameDiv.textContent = displayName;
        terminalContent.appendChild(roomNameDiv);
        
        // Display room description
        const roomDescDiv = document.createElement('div');
        roomDescDiv.className = 'room-description';
        roomDescDiv.textContent = room.description;
        terminalContent.appendChild(roomDescDiv);
        
        // Display players
        const otherPlayers = players ? players.filter(p => p !== currentPlayerName) : [];
        const playersDiv = document.createElement('div');
        playersDiv.className = 'players-section';
        const playersLine = document.createElement('span');
        playersLine.className = 'players-line';
        playersLine.innerHTML = `<span class="players-section-title">Also here:</span>`;
        
        if (otherPlayers.length > 0) {
            otherPlayers.forEach((playerName, index) => {
                const playerSpan = document.createElement('span');
                playerSpan.className = 'player-item';
                playerSpan.setAttribute('data-player', playerName);
                playerSpan.textContent = (index === 0 ? ' ' : ', ') + playerName;
                playersLine.appendChild(playerSpan);
            });
        } else {
            const noPlayers = document.createElement('span');
            noPlayers.className = 'player-item';
            noPlayers.textContent = ' No one else is here.';
            playersLine.appendChild(noPlayers);
        }
        
        playersDiv.appendChild(playersLine);
        terminalContent.appendChild(playersDiv);
        
        // Display NPCs
        if (npcs && npcs.length > 0) {
            const npcsDiv = document.createElement('div');
            npcsDiv.className = 'npcs-section';
            const npcNames = npcs.map(npc => {
                const stateDesc = getNPCStateDescription(npc);
                return npc.name + (stateDesc ? ` (${stateDesc})` : '');
            });
            npcsDiv.innerHTML = `<span class="npcs-section-title">You see here:</span> ${npcNames.join(', ')}`;
            terminalContent.appendChild(npcsDiv);
        }
        
        // Display exits (room items are shown in the dynamic status bar)
        if (exits && exits.length > 0) {
            const exitsDiv = document.createElement('div');
            exitsDiv.className = 'exits-section';
            exitsDiv.innerHTML = `<span class="exits-section-title">Exits:</span> ${exits.join(', ')}`;
            terminalContent.appendChild(exitsDiv);
        }
        
        // Scroll to bottom
        terminalContent.scrollTop = terminalContent.scrollHeight;
    }
    
    // Always update NPC widget state (for harvest/cooldown progress)
    let activeHarvestNPC = null;
    if (npcs && npcs.length > 0) {
        npcs.forEach(npc => {
            if (npc.harvestStatus && (npc.harvestStatus === 'active' || npc.harvestStatus === 'cooldown')) {
                activeHarvestNPC = npc;
            }
        });
    }
    
    if (activeHarvestNPC) {
        showNPCWidget(activeHarvestNPC.name, activeHarvestNPC.harvestStatus, activeHarvestNPC.harvestProgress || 0, {
            baseCycleTime: activeHarvestNPC.baseCycleTime,
            harvestableTime: activeHarvestNPC.harvestableTime,
            cooldownTime: activeHarvestNPC.cooldownTime
        });
    } else {
        hideNPCWidget();
    }
    
    // Always update room items display (dynamic, doesn't scroll)
    updateRoomItemsDisplay(roomItems);
    
    // Update compass buttons
    updateCompassButtons(exits);
    
    // Update coordinates display
    if (room.mapName) {
        currentMapName = room.mapName;
    }
    updateCompassCoordinates(room.x, room.y);
}

// Generate a description from NPC state
function getNPCStateDescription(npc) {
    if (!npc.state || typeof npc.state !== 'object') {
        return null;
    }
    
    // For now, return a simple description based on cycles
    // This can be expanded later with type-specific descriptions
    const cycles = npc.state.cycles || 0;
    
    // Simple state descriptions based on NPC type or cycles
    if (cycles === 0) {
        return 'idle';
    } else if (cycles < 5) {
        return 'active';
    } else {
        return 'pulsing softly';
    }
}

// Display player inventory in terminal as a styled table
function displayInventory(items) {
    const terminalContent = document.getElementById('terminalContent');
    
    if (!items || items.length === 0) {
        addToTerminal('Your inventory is empty.', 'info');
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

// Add player to terminal
function addPlayerToTerminal(playerName, direction) {
    if (playerName === currentPlayerName) return;
    
    const terminalContent = document.getElementById('terminalContent');
    
    // Display entry message
    const entryMsg = document.createElement('div');
    entryMsg.className = 'player-movement-message';
    if (direction) {
        entryMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> enters from the ${direction}.`;
    } else {
        entryMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> has arrived.`;
    }
    terminalContent.appendChild(entryMsg);
    
    // Find the most recent players-line (from current room display)
    // Get all players-lines and use the last one (most recent room)
    const allPlayersLines = terminalContent.querySelectorAll('.players-line');
    const playersLine = allPlayersLines.length > 0 ? allPlayersLines[allPlayersLines.length - 1] : null;
    
    if (playersLine) {
        // Remove "No one else is here." message if it exists
        const noPlayersMsg = playersLine.querySelector('.player-item');
        if (noPlayersMsg && noPlayersMsg.textContent.includes('No one else is here')) {
            noPlayersMsg.remove();
        }
        
        // Check if player already listed
        const existing = playersLine.querySelector(`[data-player="${playerName}"]`);
        if (!existing) {
            const playerSpan = document.createElement('span');
            playerSpan.className = 'player-item';
            playerSpan.setAttribute('data-player', playerName);
            const existingPlayers = playersLine.querySelectorAll('.player-item[data-player]');
            playerSpan.textContent = (existingPlayers.length > 0 ? ', ' : ' ') + playerName;
            playersLine.appendChild(playerSpan);
        }
    }
    
    // Scroll to bottom
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Remove player from terminal
function removePlayerFromTerminal(playerName, direction) {
    const terminalContent = document.getElementById('terminalContent');
    
    // Display departure message
    const departMsg = document.createElement('div');
    departMsg.className = 'player-movement-message';
    if (direction) {
        departMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> left to the ${direction}.`;
    } else {
        departMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> has left.`;
    }
    terminalContent.appendChild(departMsg);
    
    // Find the most recent players-line (from current room display)
    // Get all players-lines and use the last one (most recent room)
    const allPlayersLines = terminalContent.querySelectorAll('.players-line');
    const playersLine = allPlayersLines.length > 0 ? allPlayersLines[allPlayersLines.length - 1] : null;
    const playerElement = playersLine ? playersLine.querySelector(`[data-player="${playerName}"]`) : null;
    
    if (playerElement) {
        // Remove the player and clean up comma spacing
        const text = playerElement.textContent;
        if (text.startsWith(', ')) {
            playerElement.remove();
        } else {
            playerElement.remove();
            // Update next player's comma if needed
            const nextPlayer = playersLine.querySelector('.player-item[data-player]');
            if (nextPlayer && nextPlayer.textContent.startsWith(' ')) {
                nextPlayer.textContent = nextPlayer.textContent.replace(/^ /, '');
            }
        }
        
        // Check if there are any remaining players
        const remainingPlayers = playersLine.querySelectorAll('.player-item[data-player]');
        if (remainingPlayers.length === 0) {
            // No players left, add back "No one else is here." message
            const noPlayers = document.createElement('span');
            noPlayers.className = 'player-item';
            noPlayers.textContent = ' No one else is here.';
            playersLine.appendChild(noPlayers);
        }
    }
    
    // Scroll to bottom
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Add message to terminal
function addToTerminal(message, type = 'info') {
    const terminalContent = document.getElementById('terminalContent');
    const msgDiv = document.createElement('div');
    msgDiv.className = type === 'error' ? 'error-message' : 'info-message';
    msgDiv.textContent = message;
    terminalContent.appendChild(msgDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Display resonated message (world broadcast)
function displayResonatedMessage(playerName, message) {
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'resonated-message';
    messageDiv.innerHTML = `<span class="resonated-player">${escapeHtml(playerName)}</span> resonated <span class="resonated-text">${escapeHtml(message)}</span>!`;
    terminalContent.appendChild(messageDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Display system message (world-wide announcements)
function displaySystemMessage(message) {
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = message;
    terminalContent.appendChild(messageDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Communication Widget Functions
function initCommunicationWidget() {
    const commWidget = document.getElementById('widget-communication');
    if (!commWidget) return;
    
    // Mode selector buttons
    const modeButtons = commWidget.querySelectorAll('.comm-mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            setCommMode(mode);
        });
    });
    
    // Send button
    const sendBtn = document.getElementById('commSendBtn');
    const commInput = document.getElementById('commInput');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            sendCommMessage();
        });
    }
    
    if (commInput) {
        commInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendCommMessage();
            }
        });
    }
}

function setCommMode(mode) {
    commMode = mode;
    
    // Update button states
    const modeButtons = document.querySelectorAll('.comm-mode-btn');
    modeButtons.forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update input placeholder
    const commInput = document.getElementById('commInput');
    if (commInput) {
        if (mode === 'telepath') {
            commInput.placeholder = 'Type player name, then message...';
        } else if (mode === 'resonate') {
            commInput.placeholder = 'Type world broadcast...';
        } else {
            commInput.placeholder = 'Type room message...';
        }
    }
    
    // Render current mode's history
    renderCommHistory();
}

function sendCommMessage() {
    const commInput = document.getElementById('commInput');
    if (!commInput || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    const input = commInput.value.trim();
    if (!input) return;
    
    if (commMode === 'telepath') {
        // Parse: "player message" or "player message text"
        const parts = input.split(/\s+/);
        if (parts.length < 2) {
            addToTerminal('Telepath who? (Format: player message)', 'error');
            return;
        }
        const targetPlayer = parts[0];
        const message = parts.slice(1).join(' ');
        ws.send(JSON.stringify({ type: 'telepath', targetPlayer, message }));
    } else if (commMode === 'resonate') {
        // Add to history immediately (will be confirmed by server response)
        addToCommHistory('resonate', currentPlayerName, input, false);
        ws.send(JSON.stringify({ type: 'resonate', message: input }));
    } else {
        // Add to history immediately (will be confirmed by server response)
        addToCommHistory('talk', currentPlayerName, input, false);
        ws.send(JSON.stringify({ type: 'talk', message: input }));
    }
    
    commInput.value = '';
}

function addToCommHistory(mode, playerName, message, isReceived, targetPlayer = null) {
    if (!commHistory[mode]) {
        commHistory[mode] = [];
    }
    
    const entry = {
        playerName,
        message,
        isReceived,
        targetPlayer,
        timestamp: Date.now()
    };
    
    commHistory[mode].push(entry);
    
    // Keep only last 100 messages per channel
    if (commHistory[mode].length > 100) {
        commHistory[mode] = commHistory[mode].slice(-100);
    }
    
    // Update display if this mode is active
    if (mode === commMode) {
        renderCommHistory();
    }
}

function renderCommHistory() {
    const content = document.getElementById('commChatContent');
    if (!content) return;
    
    const history = commHistory[commMode] || [];
    content.innerHTML = '';
    
    if (history.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'comm-empty';
        emptyMsg.textContent = 'No messages yet...';
        content.appendChild(emptyMsg);
        return;
    }
    
    history.forEach(entry => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `comm-message comm-message-${commMode}`;
        
        let displayText = '';
        if (commMode === 'telepath') {
            if (entry.isReceived) {
                displayText = `<span class="comm-player">${escapeHtml(entry.playerName)}</span> telepaths: ${escapeHtml(entry.message)}`;
            } else {
                const target = entry.targetPlayer || 'unknown';
                displayText = `You telepath <span class="comm-player">${escapeHtml(target)}</span>: ${escapeHtml(entry.message)}`;
            }
        } else if (commMode === 'resonate') {
            if (entry.isReceived) {
                displayText = `<span class="comm-player">${escapeHtml(entry.playerName)}</span> resonated <span class="comm-text">${escapeHtml(entry.message)}</span>!`;
            } else {
                displayText = `You resonated <span class="comm-text">${escapeHtml(entry.message)}</span>!`;
            }
        } else {
            // Talk mode
            if (entry.isReceived) {
                displayText = `<span class="comm-player">${escapeHtml(entry.playerName)}</span>: ${escapeHtml(entry.message)}`;
            } else {
                displayText = `You: ${escapeHtml(entry.message)}`;
            }
        }
        
        msgDiv.innerHTML = displayText;
        content.appendChild(msgDiv);
    });
    
    // Scroll to bottom
    const scroll = document.getElementById('commChatScroll');
    if (scroll) {
        scroll.scrollTop = scroll.scrollHeight;
    }
}

// Display talked message in terminal
function displayTalkedMessage(playerName, message) {
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'talked-message';
    messageDiv.innerHTML = `<span class="talked-player">${escapeHtml(playerName)}</span> says: <span class="talked-text">${escapeHtml(message)}</span>`;
    terminalContent.appendChild(messageDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Display telepath message in terminal
function displayTelepathMessage(playerName, message, isReceived) {
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'telepath-message';
    
    if (isReceived) {
        messageDiv.innerHTML = `<span class="telepath-label">[Telepathy]</span> <span class="telepath-player">${escapeHtml(playerName)}</span> telepaths: <span class="telepath-text">${escapeHtml(message)}</span>`;
    } else {
        messageDiv.innerHTML = `<span class="telepath-label">[Telepathy]</span> You telepath <span class="telepath-player">${escapeHtml(playerName)}</span>: <span class="telepath-text">${escapeHtml(message)}</span>`;
    }
    
    terminalContent.appendChild(messageDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Initialize communication widget when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommunicationWidget);
} else {
    initCommunicationWidget();
}

// Update the room items display bar (dynamic, updates in place)
function updateRoomItemsDisplay(roomItems) {
    const display = document.getElementById('roomItemsDisplay');
    if (!display) return;
    
    if (!roomItems || roomItems.length === 0) {
        display.textContent = 'Nothing';
        display.className = 'room-items-display empty';
        return;
    }
    
    // Build item list with quantities
    const itemStrings = roomItems.map(item => {
        if (item.quantity > 1) {
            return `${item.item_name} <span class="item-count">(x${item.quantity})</span>`;
        }
        return item.item_name;
    });
    
    display.innerHTML = itemStrings.join(', ');
    display.className = 'room-items-display';
}


// Update compass coordinates display
function updateCompassCoordinates(x, y) {
    const coordsElement = document.getElementById('compassCoordinates');
    if (coordsElement) {
        const mapName = currentMapName || 'Unknown';
        coordsElement.textContent = `${mapName}\n(${x}, ${y})`;
    }
}

// Update compass buttons based on available exits
function updateCompassButtons(exits) {
    const compassMap = {
        'N': { btn: document.getElementById('compass-n'), exit: 'north' },
        'S': { btn: document.getElementById('compass-s'), exit: 'south' },
        'E': { btn: document.getElementById('compass-e'), exit: 'east' },
        'W': { btn: document.getElementById('compass-w'), exit: 'west' },
        'NE': { btn: document.getElementById('compass-ne'), exit: 'northeast' },
        'NW': { btn: document.getElementById('compass-nw'), exit: 'northwest' },
        'SE': { btn: document.getElementById('compass-se'), exit: 'southeast' },
        'SW': { btn: document.getElementById('compass-sw'), exit: 'southwest' },
        'U': { btn: document.getElementById('compass-up'), exit: 'up' },
        'D': { btn: document.getElementById('compass-down'), exit: 'down' }
    };
    
    // Update all buttons - make them visible but lowlight unavailable ones
    Object.entries(compassMap).forEach(([dir, { btn, exit }]) => {
        if (btn) {
            const exitKey = exit;
            const isAvailable = exits[exitKey];
            
            if (isAvailable) {
                btn.disabled = false;
                btn.classList.add('available');
                btn.classList.remove('unavailable');
            } else {
                btn.disabled = true;
                btn.classList.remove('available');
                btn.classList.add('unavailable');
            }
        }
    });
}

// Handle player selection
document.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const playerName = btn.getAttribute('data-player');
        selectCharacter(playerName);
    });
});

// Select player and send to server
// Character selection via POST (server-side)
async function selectCharacter(playerName) {
    try {
        const response = await fetch('/api/select-character', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Include cookies for session
            body: JSON.stringify({ playerName })
        });

        const data = await response.json();
        
        if (data.success) {
            // Redirect to game page (session cookie is set)
            window.location.href = '/game';
        } else {
            alert(data.error || 'Failed to select character');
        }
    } catch (error) {
        console.error('Error selecting character:', error);
        alert('Failed to select character. Please try again.');
    }
}

// Handle command input
const commandInput = document.getElementById('commandInput');
commandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const command = commandInput.value.trim();
        if (command) {
            executeCommand(command);
            commandInput.value = '';
        }
    }
});

// Execute command
function executeCommand(command) {
    const raw = command.trim();
    if (!raw) return;

    const parts = raw.split(/\s+/);
    const base = parts[0].toLowerCase();

    // /JUMP - God mode teleport command
    if (base === '/jump' || base === 'jump') {
        if (!godMode) {
            addToTerminal('This command requires god mode.', 'error');
            return;
        }
        openJumpWidget();
        return;
    }

    // HELP / ? - display available commands
    if (base === 'help' || base === '?') {
        displayHelp();
        return;
    }

    // LOOK / L with optional target (NPC name or partial)
    if (base === 'look' || base === 'l') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        const target = parts.slice(1).join(' ');
        const payload = { type: 'look' };
        if (target) {
            payload.target = target;
        }
        ws.send(JSON.stringify(payload));
        return;
    }

    // INVENTORY / INV / I
    if (base === 'inventory' || base === 'inv' || base === 'i') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        ws.send(JSON.stringify({ type: 'inventory' }));
        return;
    }

    // TAKE / T / GET / PICKUP [quantity|all] <item> - partial item name matching
    if (base === 'take' || base === 't' || base === 'get' || base === 'pickup') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length === 0) {
            addToTerminal('Take what?', 'error');
            return;
        }
        
        // Check if first word is a quantity (number or "all")
        let quantity = 1;
        let itemNameParts = rest;
        
        if (rest.length > 1) {
            const firstWord = rest[0].toLowerCase();
            if (firstWord === 'all') {
                quantity = 'all';
                itemNameParts = rest.slice(1);
            } else {
                const parsedQty = parseInt(firstWord, 10);
                if (!isNaN(parsedQty) && parsedQty > 0) {
                    quantity = parsedQty;
                    itemNameParts = rest.slice(1);
                }
            }
        }
        
        const itemName = itemNameParts.join(' ');
        if (!itemName) {
            addToTerminal('Take what?', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'take', itemName, quantity }));
        return;
    }

    // DROP [quantity|all] <item> - no abbreviation (d = down), partial item name matching
    if (base === 'drop') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length === 0) {
            addToTerminal('Drop what?', 'error');
            return;
        }
        
        // Check if first word is a quantity (number or "all")
        let quantity = 1;
        let itemNameParts = rest;
        
        if (rest.length > 1) {
            const firstWord = rest[0].toLowerCase();
            if (firstWord === 'all') {
                quantity = 'all';
                itemNameParts = rest.slice(1);
            } else {
                const parsedQty = parseInt(firstWord, 10);
                if (!isNaN(parsedQty) && parsedQty > 0) {
                    quantity = parsedQty;
                    itemNameParts = rest.slice(1);
                }
            }
        }
        
        const itemName = itemNameParts.join(' ');
        if (!itemName) {
            addToTerminal('Drop what?', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'drop', itemName, quantity }));
        return;
    }

    // HARVEST / H / P / COLLECT / C / GATHER / G <npc> - partial NPC name matching
    if (base === 'harvest' || base === 'h' || base === 'p' || base === 'collect' || base === 'c' || base === 'gather' || base === 'g') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        const target = parts.slice(1).join(' ');
        ws.send(JSON.stringify({ type: 'harvest', target }));
        return;
    }

    // TALK <message> - room chat
    if (base === 'talk' || base === 'say' || base === 't') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const message = parts.slice(1).join(' ');
        if (!message) {
            addToTerminal('Talk what? (talk <message>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'talk', message }));
        return;
    }

    // RESONATE / RES / R <message> - broadcast to all players
    if (base === 'resonate' || base === 'res' || base === 'r') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const message = parts.slice(1).join(' ');
        if (!message) {
            addToTerminal('Resonate what? (resonate <message>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'resonate', message }));
        return;
    }

    // TELEPATH / TELE <player> <message> - private message
    if (base === 'telepath' || base === 'tele' || base === 'tell' || base === 'whisper') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        if (parts.length < 3) {
            addToTerminal('Telepath who? (telepath <player> <message>)', 'error');
            return;
        }
        
        const targetPlayer = parts[1];
        const message = parts.slice(2).join(' ');
        if (!message) {
            addToTerminal('Telepath what? (telepath <player> <message>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'telepath', targetPlayer, message }));
        return;
    }

    const normalized = normalizeCommand(raw);
    if (normalized) {
        movePlayer(normalized);
    } else {
        addToTerminal(`Unknown command: ${command}`, 'error');
    }
}

// Handle compass button clicks
document.querySelectorAll('.compass-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.disabled) {
            const direction = btn.getAttribute('data-direction');
            movePlayer(direction);
        }
    });
});

// Handle keypad movement in main game
function handleKeypadMovement(key) {
    // Keypad to direction mapping (same as map editor)
    // 7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE
    const keypadDirectionMap = {
        '7': 'NW',
        '8': 'N',
        '9': 'NE',
        '4': 'W',
        '6': 'E',
        '1': 'SW',
        '2': 'S',
        '3': 'SE'
    };
    
    const direction = keypadDirectionMap[key];
    if (direction) {
        movePlayer(direction);
    }
}

// Move player
function movePlayer(direction) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addToTerminal('Not connected to server. Please wait...', 'error');
        return;
    }

    ws.send(JSON.stringify({
        type: 'move',
        direction: direction
    }));
}

// Update player stats display (dynamically renders all stats from database)
function updatePlayerStats(stats) {
    const statsContent = document.getElementById('playerStatsContent');
    if (!statsContent || !stats) return;
    
    statsContent.innerHTML = '';
    
    // Group stats by category
    const statsByCategory = {
        stats: [],
        abilities: [],
        resources: [],
        flags: []
    };
    
    // Organize stats by category
    Object.keys(stats).forEach(key => {
        const stat = stats[key];
        if (stat && stat.category && stat.value !== undefined) {
            // Skip max values (they're handled with their base resource)
            if (key.startsWith('max')) return;
            
            statsByCategory[stat.category].push({
                key: key,
                displayName: stat.displayName,
                value: stat.value
            });
        }
    });
    
    // Render Attributes (stats)
    if (statsByCategory.stats.length > 0) {
        const statsSection = createStatSection('Attributes', statsByCategory.stats);
    statsContent.appendChild(statsSection);
    }
    
    // Render Abilities
    if (statsByCategory.abilities.length > 0) {
        const abilitiesSection = createStatSection('Abilities', statsByCategory.abilities);
        statsContent.appendChild(abilitiesSection);
    }
    
    // Render Resources (Hit Points, Mana, etc.)
    if (statsByCategory.resources.length > 0) {
        const processedResources = new Set();
        
        statsByCategory.resources.forEach(resource => {
            // Skip max values (they're handled with their base resource)
            if (resource.key.startsWith('max')) return;
            if (processedResources.has(resource.key)) return;
            
            // Try to find corresponding max value
            // maxHitPoints, maxMana, etc.
            const maxKey = `max${resource.key.charAt(0).toUpperCase() + resource.key.slice(1)}`;
            const maxStat = stats[maxKey];
            
            if (maxStat && maxStat.value !== undefined && maxStat.value > 0) {
                // Resource with max value (HP, Mana) - render with bar
                const resourceSection = createResourceSection(resource.displayName, resource.value, maxStat.value, resource.key);
                statsContent.appendChild(resourceSection);
                processedResources.add(resource.key);
                processedResources.add(maxKey);
            } else if (resource.value !== undefined) {
                // Simple resource without max - render as regular stat
                const resourceSection = createStatSection(resource.displayName, [resource]);
                statsContent.appendChild(resourceSection);
                processedResources.add(resource.key);
            }
        });
    }
    
    // Flags are not displayed in UI (used internally)
    
    // Add Encumbrance display
    if (stats.currentEncumbrance !== undefined) {
        const maxEncumbrance = stats.maxEncumbrance?.value || 100;
        const currentEncumbrance = stats.currentEncumbrance;
        const encumbranceSection = createEncumbranceSection(currentEncumbrance, maxEncumbrance);
        statsContent.appendChild(encumbranceSection);
    }
    
    // Scroll to bottom
    statsContent.scrollTop = statsContent.scrollHeight;
}

// Helper function to create a stat section (Attributes or Abilities)
function createStatSection(title, items) {
    const section = document.createElement('div');
    section.className = 'stats-section';
    
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'stats-section-title';
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);
    
    items.forEach(item => {
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        
        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = item.displayName + ':';
        
        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = item.value;
        
        statItem.appendChild(label);
        statItem.appendChild(value);
        section.appendChild(statItem);
    });
    
    return section;
}

// Helper function to create a resource section (HP, Mana with bars)
function createResourceSection(title, current, max, resourceKey) {
    const section = document.createElement('div');
    section.className = 'stats-section';
    
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'stats-section-title';
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);
    
    const valueDiv = document.createElement('div');
    valueDiv.className = 'stat-item';
    valueDiv.innerHTML = `<span class="stat-value">${current}/${max}</span>`;
    section.appendChild(valueDiv);
    
    // Create progress bar
    const bar = document.createElement('div');
    bar.className = resourceKey === 'hitPoints' ? 'hp-bar' : 'mana-bar';
    const fill = document.createElement('div');
    fill.className = resourceKey === 'hitPoints' ? 'hp-fill' : 'mana-fill';
    const percent = max > 0 ? (current / max) * 100 : 0;
    fill.style.width = percent + '%';
    bar.appendChild(fill);
    section.appendChild(bar);
    
    return section;
}

// Helper function to create encumbrance section with level indicator
function createEncumbranceSection(current, max) {
    const section = document.createElement('div');
    section.className = 'stats-section encumbrance-section';
    
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'stats-section-title';
    sectionTitle.textContent = 'Encumbrance';
    section.appendChild(sectionTitle);
    
    // Calculate level
    const percent = max > 0 ? (current / max) * 100 : 0;
    let level = 'light';
    let levelColor = '#00ff00'; // Green
    
    if (percent >= 100) {
        level = 'stuck';
        levelColor = '#ff0000'; // Red
    } else if (percent >= 66.6) {
        level = 'heavy';
        levelColor = '#ff6600'; // Orange
    } else if (percent >= 33.3) {
        level = 'medium';
        levelColor = '#ffcc00'; // Yellow
    }
    
    const valueDiv = document.createElement('div');
    valueDiv.className = 'stat-item';
    valueDiv.innerHTML = `<span class="stat-value">${current}/${max}</span> <span class="encumbrance-level" style="color: ${levelColor}">(${level})</span>`;
    section.appendChild(valueDiv);
    
    // Create progress bar
    const bar = document.createElement('div');
    bar.className = 'encumbrance-bar';
    const fill = document.createElement('div');
    fill.className = 'encumbrance-fill';
    fill.style.width = Math.min(100, percent) + '%';
    fill.style.backgroundColor = levelColor;
    bar.appendChild(fill);
    section.appendChild(bar);
    
    return section;
}

// Map rendering variables
let mapRooms = [];
let currentRoomPos = { x: 0, y: 0 };
let currentMapId = null;
let currentMapName = null;
let mapCanvas = null;
let mapCtx = null;
let mapTooltip = null; // Tooltip element for room hover info
let roomTypeColors = { // Default colors
    normal: '#00ff00',
    shop: '#0088ff',
    factory: '#ff8800'
};
const MAP_SIZE = 25; // 25x25 grid
const CELL_SIZE = 10; // Size of each cell in pixels

// Initialize map
function initializeMap(rooms, currentRoom, mapId, typeColors) {
    // Filter to only include rooms from the current map (no preview rooms)
    mapRooms = rooms.filter(room => room.mapId === mapId);
    
    // Update room type colors if provided
    if (typeColors) {
        roomTypeColors = { ...roomTypeColors, ...typeColors };
    }
    
    currentRoomPos = { x: currentRoom.x, y: currentRoom.y };
    currentMapId = mapId;
    
    console.log(`Map initialized: ${mapRooms.length} rooms, current position: (${currentRoom.x}, ${currentRoom.y}), mapId: ${mapId}`);
    
    // Update coordinates display
    updateCompassCoordinates(currentRoom.x, currentRoom.y);
    
    mapCanvas = document.getElementById('mapCanvas');
    if (!mapCanvas) return;
    
    mapCtx = mapCanvas.getContext('2d');
    
    // Set canvas size
    const viewport = document.querySelector('.map-viewport');
    if (viewport) {
        mapCanvas.width = viewport.clientWidth;
        mapCanvas.height = viewport.clientHeight;
    }
    
    // Create tooltip element if it doesn't exist
    if (!mapTooltip) {
        mapTooltip = document.createElement('div');
        mapTooltip.id = 'mapTooltip';
        mapTooltip.style.cssText = `
            position: absolute;
            background: #1a1a1a;
            border: 2px solid #00ff00;
            color: #00ff00;
            padding: 6px 10px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            pointer-events: none;
            z-index: 1000;
            display: none;
            white-space: nowrap;
        `;
        viewport.style.position = 'relative'; // Make viewport positioned for tooltip
        viewport.appendChild(mapTooltip);
    }
    
    // Add mouse event listeners for hover tooltips
    setupMapTooltips();
    
    renderMap();
}

// Update map position when player moves
function updateMapPosition(newRoom, mapId) {
    // Check if we're switching maps
    if (mapId && mapId !== currentMapId) {
        // Map switch - we'll get new mapData message, so just update position for now
        currentRoomPos = { x: newRoom.x, y: newRoom.y };
        currentMapId = mapId;
        // Don't render yet - wait for mapData message
    } else {
        // Same map, just update position
        currentRoomPos = { x: newRoom.x, y: newRoom.y };
        if (mapCanvas && mapCtx) {
            renderMap();
        }
    }
}

// Setup map tooltip functionality
function setupMapTooltips() {
    if (!mapCanvas) return;
    
    let hoveredRoom = null;
    
    mapCanvas.addEventListener('mousemove', (e) => {
        const rect = mapCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Find which room is under the mouse
        const room = getRoomAtScreenPosition(x, y);
        
        if (room && room !== hoveredRoom) {
            hoveredRoom = room;
            showMapTooltip(room, e.clientX, e.clientY);
        } else if (!room && hoveredRoom) {
            hoveredRoom = null;
            hideMapTooltip();
        } else if (room && hoveredRoom) {
            // Update tooltip position as mouse moves
            updateMapTooltipPosition(e.clientX, e.clientY);
        }
    });
    
    mapCanvas.addEventListener('mouseleave', () => {
        hoveredRoom = null;
        hideMapTooltip();
    });
}

// Get room at screen coordinates
function getRoomAtScreenPosition(screenX, screenY) {
    if (!mapCanvas || mapRooms.length === 0) return null;
    
    const MAP_SIZE = 25;
    const CELL_SIZE = 10;
    
    // Calculate visible range
    const centerX = currentRoomPos.x;
    const centerY = currentRoomPos.y;
    const halfSize = Math.floor(MAP_SIZE / 2);
    const minX = centerX - halfSize;
    const maxX = centerX + halfSize;
    const minY = centerY - halfSize;
    const maxY = centerY + halfSize;
    
    // Calculate offset for centering
    const offsetX = (mapCanvas.width - MAP_SIZE * CELL_SIZE) / 2;
    const offsetY = (mapCanvas.height - MAP_SIZE * CELL_SIZE) / 2;
    
    // Convert screen coordinates to map coordinates
    const mapX = minX + Math.floor((screenX - offsetX) / CELL_SIZE);
    const mapY = maxY - Math.floor((screenY - offsetY) / CELL_SIZE); // Flip Y
    
    // Find room at these coordinates
    return mapRooms.find(room => 
        room.mapId === currentMapId && 
        room.x === mapX && 
        room.y === mapY
    ) || null;
}

// Show map tooltip
function showMapTooltip(room, mouseX, mouseY) {
    if (!mapTooltip) return;
    
    mapTooltip.innerHTML = `<strong>${room.name || 'Room'}</strong><br>(${room.x}, ${room.y})`;
    mapTooltip.style.display = 'block';
    updateMapTooltipPosition(mouseX, mouseY);
}

// Update tooltip position
function updateMapTooltipPosition(mouseX, mouseY) {
    if (!mapTooltip) return;
    
    const offset = 15; // Offset from cursor
    const viewport = document.querySelector('.map-viewport');
    if (!viewport) return;
    
    const viewportRect = viewport.getBoundingClientRect();
    const tooltipX = mouseX - viewportRect.left + offset;
    const tooltipY = mouseY - viewportRect.top + offset;
    
    mapTooltip.style.left = tooltipX + 'px';
    mapTooltip.style.top = tooltipY + 'px';
    
    // Adjust if tooltip would go off screen
    mapTooltip.style.display = 'block'; // Temporarily show to get dimensions
    const tooltipRect = mapTooltip.getBoundingClientRect();
    if (tooltipRect.right > viewportRect.right) {
        mapTooltip.style.left = (mouseX - viewportRect.left - tooltipRect.width - offset) + 'px';
    }
    if (tooltipRect.bottom > viewportRect.bottom) {
        mapTooltip.style.top = (mouseY - viewportRect.top - tooltipRect.height - offset) + 'px';
    }
}

// Hide map tooltip
function hideMapTooltip() {
    if (mapTooltip) {
        mapTooltip.style.display = 'none';
    }
}

// Render the map
function renderMap() {
    if (!mapCanvas || !mapCtx) return;
    
    // Clear canvas
    mapCtx.fillStyle = '#0a0a0a';
    mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    
    // Calculate viewport bounds (centered on player)
    const centerX = Math.floor(MAP_SIZE / 2);
    const centerY = Math.floor(MAP_SIZE / 2);
    
    const minX = currentRoomPos.x - centerX;
    const maxX = currentRoomPos.x + centerX;
    const minY = currentRoomPos.y - centerY;
    const maxY = currentRoomPos.y + centerY;
    
    // Create a map of rooms by coordinates
    const roomMap = new Map();
    mapRooms.forEach(room => {
        roomMap.set(`${room.x},${room.y}`, room);
    });
    
    // Draw grid and rooms
    const offsetX = (mapCanvas.width - MAP_SIZE * CELL_SIZE) / 2;
    const offsetY = (mapCanvas.height - MAP_SIZE * CELL_SIZE) / 2;
    
    // Draw connections first (so they appear behind rooms)
    mapCtx.strokeStyle = '#333';
    mapCtx.lineWidth = 1;
    
    mapRooms.forEach(room => {
        if (room.x >= minX && room.x <= maxX && room.y >= minY && room.y <= maxY) {
            // Flip Y coordinate (screen Y increases downward, game Y increases upward)
            const screenX = offsetX + (room.x - minX) * CELL_SIZE;
            const screenY = offsetY + (maxY - room.y) * CELL_SIZE;
            const roomCenterX = screenX + CELL_SIZE / 2;
            const roomCenterY = screenY + CELL_SIZE / 2;
            
            // Check for adjacent rooms and draw connections
            const directions = [
                { dx: 0, dy: -1 }, // N
                { dx: 1, dy: -1 }, // NE
                { dx: 1, dy: 0 },  // E
                { dx: 1, dy: 1 },  // SE
                { dx: 0, dy: 1 },  // S
                { dx: -1, dy: 1 }, // SW
                { dx: -1, dy: 0 }, // W
                { dx: -1, dy: -1 } // NW
            ];
            
            directions.forEach(dir => {
                const adjX = room.x + dir.dx;
                const adjY = room.y + dir.dy;
                const adjKey = `${adjX},${adjY}`;
                
                if (roomMap.has(adjKey)) {
                    const adjRoom = roomMap.get(adjKey);
                    if (adjRoom.x >= minX && adjRoom.x <= maxX && adjRoom.y >= minY && adjRoom.y <= maxY) {
                        const adjScreenX = offsetX + (adjRoom.x - minX) * CELL_SIZE;
                        const adjScreenY = offsetY + (maxY - adjRoom.y) * CELL_SIZE;
                        const adjCenterX = adjScreenX + CELL_SIZE / 2;
                        const adjCenterY = adjScreenY + CELL_SIZE / 2;
                        
                        mapCtx.beginPath();
                        mapCtx.moveTo(roomCenterX, roomCenterY);
                        mapCtx.lineTo(adjCenterX, adjCenterY);
                        mapCtx.stroke();
                    }
                }
            });
        }
    });
    
    // Draw rooms (only current map - no preview rooms)
    mapRooms.forEach(room => {
        if (room.x >= minX && room.x <= maxX && room.y >= minY && room.y <= maxY) {
            // Flip Y coordinate (screen Y increases downward, game Y increases upward)
            // Use (maxY - room.y) to correctly invert Y-axis
            const screenX = offsetX + (room.x - minX) * CELL_SIZE;
            const screenY = offsetY + (maxY - room.y) * CELL_SIZE;
            
            // Check if this is the current room
            const isCurrentRoom = room.mapId === currentMapId &&
                                  room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y;
            
            // Check if this room has a connection to another map
            const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
            
            // Draw room square
            if (isCurrentRoom) {
                mapCtx.fillStyle = '#00ff00'; // Bright green for current room (always highlighted)
            } else if (hasConnection) {
                mapCtx.fillStyle = '#ffffff'; // White for rooms with connections
            } else {
                // Use room type color
                const roomType = room.roomType || room.room_type || 'normal';
                mapCtx.fillStyle = roomTypeColors[roomType] || roomTypeColors.normal || '#666';
            }
            mapCtx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            
            // Draw border
            if (isCurrentRoom) {
                mapCtx.strokeStyle = '#ffff00'; // Yellow border for current room
                mapCtx.lineWidth = 2;
            } else if (hasConnection) {
                mapCtx.strokeStyle = '#cccccc'; // Light grey border for connected rooms
                mapCtx.lineWidth = 1;
            } else {
                mapCtx.strokeStyle = '#333'; // Dark border for other rooms
                mapCtx.lineWidth = 1;
            }
            mapCtx.strokeRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
    });
    
    // Always draw current room indicator, even if room not found in mapRooms
    // This ensures the player position is always visible
    if (currentRoomPos.x >= minX && currentRoomPos.x <= maxX && 
        currentRoomPos.y >= minY && currentRoomPos.y <= maxY) {
        const screenX = offsetX + (currentRoomPos.x - minX) * CELL_SIZE;
        const screenY = offsetY + (maxY - currentRoomPos.y) * CELL_SIZE;
        
        // Check if we already drew this room
        const roomExists = mapRooms.some(r => 
            r.mapId === currentMapId && 
            r.x === currentRoomPos.x && 
            r.y === currentRoomPos.y
        );
        
        if (!roomExists) {
            // Draw current room indicator (bright green with yellow border)
            mapCtx.fillStyle = '#00ff00';
            mapCtx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            mapCtx.strokeStyle = '#ffff00';
            mapCtx.lineWidth = 2;
            mapCtx.strokeRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
    }
}


// Initialize WebSocket connection when page loads
connectWebSocket();

// God Mode Variables
let godMode = false;
let godModeBar = null;

// Map Editor Variables
let mapEditor = null;
let mapEditorCanvas = null;
let mapEditorCtx = null;
let currentEditorMapId = null;
let editorMapRooms = [];
let selectedRoom = null;
let editorMode = 'edit'; // 'edit' | 'create' | 'connect'
let connectionSourceRoom = null;
const EDITOR_GRID_SIZE = 100;
const EDITOR_CELL_SIZE = 8;
let editorZoom = 1.0; // Zoom level (1.0 = normal, >1.0 = zoomed in, <1.0 = zoomed out)
let editorPanX = 0; // Pan offset in X direction (in map coordinates)
let editorPanY = 0; // Pan offset in Y direction (in map coordinates)
let speedModeActive = false; // Speed mode for quick room creation
let selectedRooms = []; // Array of selected rooms for mass operations
let isDragging = false; // Track mouse drag for mass selection
let dragStartX = 0; // Drag start X coordinate
let dragStartY = 0; // Drag start Y coordinate
let dragEndX = 0; // Drag end X coordinate
let dragEndY = 0; // Drag end Y coordinate
let allMapsData = []; // Store all maps for lookup by ID

// NPC Editor Variables
let npcEditor = null;
let npcList = [];
let selectedNpc = null;
let npcEditorMode = 'view'; // 'view' | 'create' | 'edit'
let npcPlacements = [];

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

// Open NPC editor
function openNpcEditor() {
    if (!npcEditor) return;

    npcEditor.classList.remove('hidden');
    // Start in list mode until an NPC is selected
    enterNpcListMode();

    // Request NPC list and placement rooms from server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getAllNPCs' }));
        ws.send(JSON.stringify({ type: 'getNpcPlacementRooms' }));
    }
}

// Close NPC editor
function closeNpcEditor() {
    if (npcEditor) {
        npcEditor.classList.add('hidden');
    }
    selectedNpc = null;
    npcEditorMode = 'view';
    enterNpcListMode();
}

function renderNpcList() {
    const listContainer = document.getElementById('npcList');
    const selector = document.getElementById('npcSelector');
    if (!listContainer || !selector) return;

    listContainer.innerHTML = '';
    selector.innerHTML = '<option value=\"\">Select an NPC...</option>';

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

function renderNpcForm() {
    const sidePanel = document.getElementById('npcSidePanelContent');
    if (!sidePanel) return;

    // When editing/creating, switch to detail mode (hide list, expand form)
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
        <div class=\"npc-editor-scrollable\">
            <h3 class=\"npc-editor-title\">${selectedNpc.id ? 'Edit NPC' : 'Create NPC'}</h3>
            <div class=\"npc-editor-form\">
                <!-- Row 1: Name (70%) + Color (30%) -->
                <div class=\"npc-row\">
                    <div class=\"npc-field-group npc-field-name\">
                        <label>Name</label>
                        <input type=\"text\" id=\"npcName\" value=\"${selectedNpc.name || ''}\">
                    </div>
                    <div class=\"npc-field-group npc-field-color\">
                        <label>Color</label>
                        <div class=\"npc-color-wrapper\">
                            <div id=\"npcColorPreview\" class=\"npc-color-preview\"></div>
                            <select id=\"npcColor\">
                            <option value=\"#00ff00\" ${currentColor === '#00ff00' ? 'selected' : ''}>Lime</option>
                            <option value=\"#00ffff\" ${currentColor === '#00ffff' ? 'selected' : ''}>Cyan</option>
                            <option value=\"#ff00ff\" ${currentColor === '#ff00ff' ? 'selected' : ''}>Magenta</option>
                            <option value=\"#ffff00\" ${currentColor === '#ffff00' ? 'selected' : ''}>Yellow</option>
                            <option value=\"#ff8800\" ${currentColor === '#ff8800' ? 'selected' : ''}>Orange</option>
                            <option value=\"#ff0000\" ${currentColor === '#ff0000' ? 'selected' : ''}>Red</option>
                            <option value=\"#8888ff\" ${currentColor === '#8888ff' ? 'selected' : ''}>Periwinkle</option>
                            <option value=\"#ffffff\" ${currentColor === '#ffffff' ? 'selected' : ''}>White</option>
                            <option value=\"#aaaaaa\" ${currentColor === '#aaaaaa' ? 'selected' : ''}>Gray</option>
                            <option value=\"#00aa88\" ${currentColor === '#00aa88' ? 'selected' : ''}>Teal</option>
                            </select>
                        </div>
                    </div>
                </div>
                <!-- Description (full width) -->
                <div class=\"npc-row\">
                    <div class=\"npc-field-group npc-field-full\">
                        <label>Description</label>
                        <textarea id=\"npcDescription\">${selectedNpc.description || ''}</textarea>
                    </div>
                </div>
                <!-- Row 2: Type (25%) + Base ms (25%) + Diff (25%) + Active (25%) -->
                <div class=\"npc-row\">
                    <div class=\"npc-field-group npc-field-quarter\">
                        <label>Type</label>
                        <select id=\"npcType\">
                            <option value=\"rhythm\" ${selectedNpc.npc_type === 'rhythm' ? 'selected' : ''}>rhythm</option>
                            <option value=\"stability\" ${selectedNpc.npc_type === 'stability' ? 'selected' : ''}>stability</option>
                            <option value=\"worker\" ${selectedNpc.npc_type === 'worker' ? 'selected' : ''}>worker</option>
                            <option value=\"tending\" ${selectedNpc.npc_type === 'tending' ? 'selected' : ''}>tending</option>
                            <option value=\"rotation\" ${selectedNpc.npc_type === 'rotation' ? 'selected' : ''}>rotation</option>
                            <option value=\"economic\" ${selectedNpc.npc_type === 'economic' ? 'selected' : ''}>economic</option>
                            <option value=\"farm\" ${selectedNpc.npc_type === 'farm' ? 'selected' : ''}>farm</option>
                            <option value=\"patrol\" ${selectedNpc.npc_type === 'patrol' ? 'selected' : ''}>patrol</option>
                            <option value=\"threshold\" ${selectedNpc.npc_type === 'threshold' ? 'selected' : ''}>threshold</option>
                        </select>
                    </div>
                    <div class=\"npc-field-group npc-field-quarter\">
                        <label>Base ms</label>
                        <input type=\"number\" id=\"npcBaseCycle\" value=\"${selectedNpc.base_cycle_time || 0}\">
                    </div>
                    <div class=\"npc-field-group npc-field-quarter\">
                        <label>Diff</label>
                        <input type=\"number\" id=\"npcDifficulty\" value=\"${selectedNpc.difficulty || 1}\">
                    </div>
                    <div class=\"npc-field-group npc-field-quarter\">
                        <label>Active</label>
                        <select id=\"npcActive\">
                            <option value=\"1\" ${selectedNpc.active ? 'selected' : ''}>Yes</option>
                            <option value=\"0\" ${!selectedNpc.active ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>
                <!-- Row 3: Required Stats (50%) + Required Buffs (50%) -->
                <div class=\"npc-row\">
                    <div class=\"npc-field-group npc-field-half\">
                        <label>Required Stats<span class=\"npc-json-label\"> (JSON)</span></label>
                        <textarea id=\"npcRequiredStats\" class=\"npc-json-textarea\">${selectedNpc.required_stats || ''}</textarea>
                    </div>
                    <div class=\"npc-field-group npc-field-half\">
                        <label>Required Buffs<span class=\"npc-json-label\"> (JSON)</span></label>
                        <textarea id=\"npcRequiredBuffs\" class=\"npc-json-textarea\">${selectedNpc.required_buffs || ''}</textarea>
                    </div>
                </div>
                <!-- Row 4: Input Items (50%) + Output Items (50%) -->
                <div class=\"npc-row\">
                    <div class=\"npc-field-group npc-field-half\">
                        <label>Input Items<span class=\"npc-json-label\"> (JSON)</span></label>
                        <textarea id=\"npcInputItems\" class=\"npc-json-textarea\">${selectedNpc.input_items || ''}</textarea>
                    </div>
                    <div class=\"npc-field-group npc-field-half\">
                        <label>Output Items<span class=\"npc-json-label\"> (JSON)</span></label>
                        <textarea id=\"npcOutputItems\" class=\"npc-json-textarea\">${selectedNpc.output_items || ''}</textarea>
                    </div>
                </div>
                <!-- Row 5: Failure States (full width) -->
                <div class=\"npc-row\">
                    <div class=\"npc-field-group npc-field-full\">
                        <label>Failure States<span class=\"npc-json-label\"> (JSON)</span></label>
                        <textarea id=\"npcFailureStates\" class=\"npc-json-textarea\">${selectedNpc.failure_states || ''}</textarea>
                    </div>
                </div>
                <!-- Save Button -->
                <div class=\"npc-row npc-save-row\">
                    <button id=\"saveNpcBtn\">Save NPC</button>
                </div>
            </div>
            <div class=\"npc-placement-section\">
                <h4>Room Placements</h4>
                <div class=\"npc-placement-controls-horizontal\">
                    <select id=\"npcPlacementMapSelect\" disabled>
                        <option value=\"\">Moonless Meadow</option>
                    </select>
                    <select id=\"npcPlacementRoomSelect\"></select>
                    <button id=\"addNpcPlacementBtn\" class=\"npc-small-btn\">Add to Room</button>
                </div>
                <div id=\"npcPlacementList\" class=\"npc-placement-list\"></div>
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
                addToTerminal('Not connected to server. Please wait...', 'error');
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

    // Populate room dropdown for Moonless Meadow
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
        addToTerminal('Not connected to server. Please wait...', 'error');
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

    if (npcEditorMode === 'edit' && selectedNpc && selectedNpc.id) {
        payloadNpc.id = selectedNpc.id;
        ws.send(JSON.stringify({
            type: 'updateNPC',
            npc: payloadNpc
        }));
        // After save, refresh placements in case NPC id or data changed
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
// Update god mode UI
function updateGodModeUI(hasGodMode) {
    godMode = hasGodMode;
    godModeBar = document.getElementById('godModeBar');
    if (godModeBar) {
        if (hasGodMode) {
            godModeBar.classList.remove('hidden');
        } else {
            godModeBar.classList.add('hidden');
        }
    }

    // Enable NPC editor button when in god mode
    const npcBtn = document.querySelector('.god-mode-btn[data-action="npc"]');
    if (npcBtn) {
        npcBtn.disabled = !hasGodMode;
    }
    
    // Enable Items editor button when in god mode
    const itemsBtn = document.querySelector('.god-mode-btn[data-action="items"]');
    if (itemsBtn) {
        itemsBtn.disabled = !hasGodMode;
    }
    
    // Enable Player editor button when in god mode
    const playerBtn = document.querySelector('.god-mode-btn[data-action="player"]');
    if (playerBtn) {
        playerBtn.disabled = !hasGodMode;
    }
}

// ============================================================
// WIDGET MANAGEMENT SYSTEM
// ============================================================

// Toggle a widget on/off
function toggleWidget(widgetName) {
    if (!TOGGLEABLE_WIDGETS.includes(widgetName)) return;
    
    const isActive = activeWidgets.includes(widgetName);
    
    if (isActive) {
        // Hide the widget
        activeWidgets = activeWidgets.filter(w => w !== widgetName);
    } else {
        // Show the widget
        if (activeWidgets.length >= 4 || (activeWidgets.length >= 3 && npcWidgetVisible)) {
            // At max capacity, replace bottom-right widget (last in array)
            activeWidgets.pop();
        }
        activeWidgets.push(widgetName);
    }
    
    updateWidgetDisplay();
}

// Update the widget display based on activeWidgets state
function updateWidgetDisplay() {
    const slots = document.querySelectorAll('.widget-slot');
    const toggleBar = document.querySelector('.widget-toggle-bar');
    
    // Update toggle bar icons
    TOGGLEABLE_WIDGETS.forEach(widgetName => {
        const icon = toggleBar?.querySelector(`[data-widget="${widgetName}"]`);
        if (icon) {
            if (activeWidgets.includes(widgetName)) {
                icon.classList.add('active');
            } else {
                icon.classList.remove('active');
            }
        }
    });
    
    // Build list of widgets to show (activeWidgets + NPC widget if visible + Factory widget if visible)
    let widgetsToShow = [...activeWidgets];
    if (npcWidgetVisible) {
        widgetsToShow.push('npc');
    }
    if (factoryWidgetVisible) {
        widgetsToShow.push('factory');
    }
    
    // Assign widgets to slots
    slots.forEach((slot, index) => {
        // Hide all widgets in this slot first
        const widgets = slot.querySelectorAll('.widget');
        widgets.forEach(w => w.classList.add('hidden'));
        
        // Show the appropriate widget for this slot
        if (index < widgetsToShow.length) {
            const widgetName = widgetsToShow[index];
            const widget = slot.querySelector(`[data-widget="${widgetName}"]`);
            if (widget) {
                widget.classList.remove('hidden');
            } else {
                // Widget doesn't exist in this slot, need to move it
                const existingWidget = document.getElementById(`widget-${widgetName}`);
                if (existingWidget) {
                    existingWidget.classList.remove('hidden');
                    slot.appendChild(existingWidget);
                }
            }
        } else {
            // Show empty widget placeholder
            const emptyWidget = slot.querySelector('.widget-empty');
            if (emptyWidget) {
                emptyWidget.classList.remove('hidden');
            }
        }
    });
}

// Show the NPC widget (auto-triggered during harvest/cooldown)
function showNPCWidget(npcName, status, progress, timingData = {}) {
    const npcWidget = document.getElementById('widget-npc');
    if (!npcWidget) return;
    
    npcWidgetVisible = true;
    
    // Update widget content
    const nameEl = document.getElementById('npcWidgetName');
    const statusEl = document.getElementById('npcWidgetStatus');
    const progressBar = document.getElementById('npcWidgetProgressBar');
    
    if (nameEl) nameEl.textContent = npcName;
    if (statusEl) statusEl.textContent = status === 'active' ? 'Harvesting...' : 'Recharging...';
    
    if (progressBar) {
        progressBar.className = 'npc-widget-progress-bar';
        progressBar.classList.add(status === 'active' ? 'harvesting' : 'cooldown');
        progressBar.style.width = `${progress * 100}%`;
    }
    
    // Update timing info (convert ms to seconds)
    const pulseEl = document.getElementById('npcWidgetPulse');
    const harvestEl = document.getElementById('npcWidgetHarvest');
    const cooldownEl = document.getElementById('npcWidgetCooldown');
    
    if (pulseEl && timingData.baseCycleTime) {
        pulseEl.textContent = `${(timingData.baseCycleTime / 1000).toFixed(1)}s`;
    }
    if (harvestEl && timingData.harvestableTime) {
        harvestEl.textContent = `${(timingData.harvestableTime / 1000).toFixed(0)}s`;
    }
    if (cooldownEl && timingData.cooldownTime) {
        cooldownEl.textContent = `${(timingData.cooldownTime / 1000).toFixed(0)}s`;
    }
    
    updateWidgetDisplay();
}

// Hide the NPC widget (auto-triggered when harvest/cooldown complete)
function hideNPCWidget() {
    if (!npcWidgetVisible) return;
    
    npcWidgetVisible = false;
    updateWidgetDisplay();
}

// Show the factory widget (auto-triggered when entering factory room)
function showFactoryWidget(state) {
    const factoryWidget = document.getElementById('widget-factory');
    if (!factoryWidget) return;
    
    factoryWidgetVisible = true;
    factoryWidgetState = state || { slots: [null, null], textInput: '' };
    
    updateFactoryWidgetSlots(factoryWidgetState);
    updateWidgetDisplay();
}

// Hide the factory widget (auto-triggered when leaving factory room)
function hideFactoryWidget() {
    if (!factoryWidgetVisible) return;
    
    factoryWidgetVisible = false;
    updateWidgetDisplay();
}

// Update factory widget slots display
function updateFactoryWidgetSlots(state) {
    const slot0 = document.getElementById('factory-slot-0');
    const slot1 = document.getElementById('factory-slot-1');
    const textInput = document.getElementById('factory-text-input');
    
    if (slot0) {
        const content = slot0.querySelector('.factory-slot-content');
        if (content) {
            if (state.slots[0]) {
                content.textContent = state.slots[0].itemName;
                content.className = 'factory-slot-content filled';
            } else {
                content.textContent = '';
                content.className = 'factory-slot-content';
            }
        }
    }
    
    if (slot1) {
        const content = slot1.querySelector('.factory-slot-content');
        if (content) {
            if (state.slots[1]) {
                content.textContent = state.slots[1].itemName;
                content.className = 'factory-slot-content filled';
            } else {
                content.textContent = '';
                content.className = 'factory-slot-content';
            }
        }
    }
    
    if (textInput && state.textInput !== undefined) {
        textInput.value = state.textInput;
    }
}

// Handle factory widget state message
function handleFactoryWidgetState(state) {
    factoryWidgetState = state;
    updateFactoryWidgetSlots(factoryWidgetState);
}

// Initialize factory widget drag and drop handlers
function initFactoryWidgetDragDrop() {
    const slot0 = document.getElementById('factory-slot-0');
    const slot1 = document.getElementById('factory-slot-1');
    
    [slot0, slot1].forEach((slot, index) => {
        if (!slot) return;
        
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
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'factoryWidgetAddItem',
                        slotIndex: index,
                        itemName: itemName
                    }));
                }
            } catch (err) {
                console.error('Error parsing drag data:', err);
            }
        });
    });
}

// Initialize factory widget drag and drop when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFactoryWidgetDragDrop);
} else {
    initFactoryWidgetDragDrop();
}

// Handle factory widget state message
function handleFactoryWidgetState(state) {
    factoryWidgetState = state;
    updateFactoryWidgetSlots(factoryWidgetState);
}

// Initialize widget toggle bar click handlers
function initWidgetToggleBar() {
    const toggleBar = document.querySelector('.widget-toggle-bar');
    if (!toggleBar) return;
    
    toggleBar.querySelectorAll('.widget-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const widgetName = icon.getAttribute('data-widget');
            toggleWidget(widgetName);
        });
    });
}

// ============================================================
// JUMP WIDGET (God Mode Teleport)
// ============================================================
let jumpWidgetMaps = [];
let jumpWidgetRooms = [];
let jumpWidgetCanvas = null;
let jumpWidgetCtx = null;
let jumpWidgetSelectedMap = null;
const JUMP_CELL_SIZE = 15;

function openJumpWidget() {
    const widget = document.getElementById('jumpWidget');
    if (!widget) return;
    
    widget.classList.remove('hidden');
    
    // Initialize canvas
    jumpWidgetCanvas = document.getElementById('jumpMapCanvas');
    jumpWidgetCtx = jumpWidgetCanvas.getContext('2d');
    
    // Request map list from server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getJumpMaps' }));
    }
    
    // Setup event listeners
    const closeBtn = document.getElementById('closeJumpWidget');
    closeBtn.onclick = closeJumpWidget;
    
    const mapSelector = document.getElementById('jumpMapSelector');
    mapSelector.onchange = onJumpMapSelected;
    
    // Canvas click handler
    jumpWidgetCanvas.onclick = onJumpCanvasClick;
    jumpWidgetCanvas.onmousemove = onJumpCanvasHover;
}

function closeJumpWidget() {
    const widget = document.getElementById('jumpWidget');
    if (widget) {
        widget.classList.add('hidden');
    }
    jumpWidgetMaps = [];
    jumpWidgetRooms = [];
    jumpWidgetSelectedMap = null;
}

function populateJumpMaps(maps) {
    jumpWidgetMaps = maps;
    const selector = document.getElementById('jumpMapSelector');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Select a map...</option>';
    maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map.id;
        option.textContent = map.name;
        selector.appendChild(option);
    });
}

function onJumpMapSelected(e) {
    const mapId = parseInt(e.target.value);
    if (!mapId) {
        jumpWidgetRooms = [];
        jumpWidgetSelectedMap = null;
        clearJumpCanvas();
        return;
    }
    
    jumpWidgetSelectedMap = mapId;
    
    // Request rooms for this map
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getJumpRooms', mapId }));
    }
}

function populateJumpRooms(rooms) {
    jumpWidgetRooms = rooms;
    renderJumpMap();
}

function clearJumpCanvas() {
    if (!jumpWidgetCtx) return;
    jumpWidgetCtx.fillStyle = '#050505';
    jumpWidgetCtx.fillRect(0, 0, jumpWidgetCanvas.width, jumpWidgetCanvas.height);
}

function renderJumpMap() {
    if (!jumpWidgetCtx || jumpWidgetRooms.length === 0) {
        clearJumpCanvas();
        return;
    }
    
    // Calculate bounds
    const minX = Math.min(...jumpWidgetRooms.map(r => r.x));
    const maxX = Math.max(...jumpWidgetRooms.map(r => r.x));
    const minY = Math.min(...jumpWidgetRooms.map(r => r.y));
    const maxY = Math.max(...jumpWidgetRooms.map(r => r.y));
    
    const gridWidth = maxX - minX + 1;
    const gridHeight = maxY - minY + 1;
    
    // Size canvas to fit
    const canvasWidth = Math.max(gridWidth * JUMP_CELL_SIZE + 40, 300);
    const canvasHeight = Math.max(gridHeight * JUMP_CELL_SIZE + 40, 300);
    
    jumpWidgetCanvas.width = canvasWidth;
    jumpWidgetCanvas.height = canvasHeight;
    
    // Clear canvas
    jumpWidgetCtx.fillStyle = '#050505';
    jumpWidgetCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate offset to center the map
    const offsetX = Math.floor((canvasWidth - gridWidth * JUMP_CELL_SIZE) / 2);
    const offsetY = Math.floor((canvasHeight - gridHeight * JUMP_CELL_SIZE) / 2);
    
    // Store rendering info for click detection
    jumpWidgetCanvas.dataset.minX = minX;
    jumpWidgetCanvas.dataset.maxY = maxY;
    jumpWidgetCanvas.dataset.offsetX = offsetX;
    jumpWidgetCanvas.dataset.offsetY = offsetY;
    
    // Draw rooms
    jumpWidgetRooms.forEach(room => {
        const screenX = offsetX + (room.x - minX) * JUMP_CELL_SIZE;
        const screenY = offsetY + (maxY - room.y) * JUMP_CELL_SIZE;
        
        // Check if current player is in this room
        const isCurrentRoom = room.x === currentRoomPos.x && 
                              room.y === currentRoomPos.y &&
                              jumpWidgetSelectedMap === currentMapId;
        
        // Room fill color
        if (isCurrentRoom) {
            jumpWidgetCtx.fillStyle = '#00ff00';
        } else if (room.connected_map_id) {
            jumpWidgetCtx.fillStyle = '#ffffff';
        } else {
            jumpWidgetCtx.fillStyle = '#666';
        }
        
        jumpWidgetCtx.fillRect(screenX + 1, screenY + 1, JUMP_CELL_SIZE - 2, JUMP_CELL_SIZE - 2);
        
        // Border
        jumpWidgetCtx.strokeStyle = isCurrentRoom ? '#ffff00' : '#333';
        jumpWidgetCtx.lineWidth = isCurrentRoom ? 2 : 1;
        jumpWidgetCtx.strokeRect(screenX + 1, screenY + 1, JUMP_CELL_SIZE - 2, JUMP_CELL_SIZE - 2);
    });
}

function getJumpRoomAtPosition(canvasX, canvasY) {
    if (!jumpWidgetCanvas || jumpWidgetRooms.length === 0) return null;
    
    const minX = parseInt(jumpWidgetCanvas.dataset.minX);
    const maxY = parseInt(jumpWidgetCanvas.dataset.maxY);
    const offsetX = parseInt(jumpWidgetCanvas.dataset.offsetX);
    const offsetY = parseInt(jumpWidgetCanvas.dataset.offsetY);
    
    // Convert canvas coords to grid coords
    const gridX = Math.floor((canvasX - offsetX) / JUMP_CELL_SIZE) + minX;
    const gridY = maxY - Math.floor((canvasY - offsetY) / JUMP_CELL_SIZE);
    
    // Find room at these coordinates
    return jumpWidgetRooms.find(r => r.x === gridX && r.y === gridY);
}

function onJumpCanvasHover(e) {
    const rect = jumpWidgetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getJumpRoomAtPosition(x, y);
    const infoEl = document.getElementById('jumpHoverInfo');
    
    if (room) {
        infoEl.innerHTML = `<span class="room-name">${room.name}</span> <span class="room-coords">(${room.x}, ${room.y})</span> - Click to teleport`;
        jumpWidgetCanvas.style.cursor = 'pointer';
    } else {
        infoEl.textContent = 'Click a room to teleport';
        jumpWidgetCanvas.style.cursor = 'crosshair';
    }
}

function onJumpCanvasClick(e) {
    const rect = jumpWidgetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getJumpRoomAtPosition(x, y);
    
    if (room) {
        // Teleport to this room
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'jumpToRoom', 
                roomId: room.id 
            }));
            addToTerminal(`Jumping to ${room.name} (${room.x}, ${room.y})...`, 'system');
            closeJumpWidget();
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Hide player selection if we're on game.html (game view is always visible there)
    const gameView = document.getElementById('gameView');
    const playerSelection = document.getElementById('playerSelection');
    if (gameView && !playerSelection) {
        // We're on game.html, connect WebSocket
        connectWebSocket();
        // Initialize widget toggle bar
        initWidgetToggleBar();
        updateWidgetDisplay();
    }
    
    const godModeButtons = document.querySelectorAll('.god-mode-btn');
    godModeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'map') {
                // Navigate to map editor route (session-based, no URL params needed)
                window.location.href = '/map';
            } else if (action === 'npc') {
                // Navigate to NPC editor route (session-based, no URL params needed)
                window.location.href = '/npc';
            } else if (action === 'items') {
                // Navigate to Item editor route (session-based, no URL params needed)
                window.location.href = '/items';
            } else if (action === 'player') {
                // Navigate to Player editor route (session-based, no URL params needed)
                window.location.href = '/player';
            }
            // Other actions (spells, craft) will be implemented later
        });
    });

    // Map editor close button
    const closeEditorBtn = document.getElementById('closeMapEditor');
    if (closeEditorBtn) {
        closeEditorBtn.addEventListener('click', () => {
            closeMapEditor();
        });
    }

    // Create new map button
    const createNewMapBtn = document.getElementById('createNewMapBtn');
    if (createNewMapBtn) {
        createNewMapBtn.addEventListener('click', () => {
            showCreateMapDialog();
        });
    }

    // Connect maps button
    const connectMapsBtn = document.getElementById('connectMapsBtn');
    if (connectMapsBtn) {
        connectMapsBtn.addEventListener('click', () => {
            toggleConnectMode();
        });
    }

    // Map selector
    const mapSelector = document.getElementById('mapSelector');
    if (mapSelector) {
        mapSelector.addEventListener('change', (e) => {
            const mapId = parseInt(e.target.value);
            if (mapId) {
                loadMapForEditor(mapId);
            }
        });
    }

    // Create map dialog
    const createMapConfirm = document.getElementById('createMapConfirm');
    const createMapCancel = document.getElementById('createMapCancel');
    if (createMapConfirm) {
        createMapConfirm.addEventListener('click', () => {
            createNewMap();
        });
    }
    if (createMapCancel) {
        createMapCancel.addEventListener('click', () => {
            hideCreateMapDialog();
        });
    }

    // NPC editor elements
    npcEditor = document.getElementById('npcEditor');
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

    // Initialize map editor canvas
    mapEditor = document.getElementById('mapEditor');
    mapEditorCanvas = document.getElementById('mapEditorCanvas');
    if (mapEditorCanvas) {
        mapEditorCtx = mapEditorCanvas.getContext('2d');
        
        // Set canvas size - use requestAnimationFrame to ensure container is sized
        requestAnimationFrame(() => {
            const container = mapEditorCanvas.parentElement;
            if (container) {
                mapEditorCanvas.width = container.clientWidth;
                mapEditorCanvas.height = container.clientHeight;
            }
        });

        // Handle canvas clicks
        mapEditorCanvas.addEventListener('click', (e) => {
            if (!isDragging) {
                handleMapEditorClick(e);
            }
        });
        
        // Handle mouse down for drag selection
        mapEditorCanvas.addEventListener('mousedown', (e) => {
            isDragging = false;
            const rect = mapEditorCanvas.getBoundingClientRect();
            dragStartX = e.clientX - rect.left;
            dragStartY = e.clientY - rect.top;
        });
        
        // Handle mouse move for drag selection
        mapEditorCanvas.addEventListener('mousemove', (e) => {
            if (e.buttons === 1) { // Left mouse button pressed
                const rect = mapEditorCanvas.getBoundingClientRect();
                dragEndX = e.clientX - rect.left;
                dragEndY = e.clientY - rect.top;
                
                if (Math.abs(dragEndX - dragStartX) > 5 || Math.abs(dragEndY - dragStartY) > 5) {
                    isDragging = true;
                    handleMapEditorDrag();
                }
            }
        });
        
        // Handle mouse up to finish drag
        mapEditorCanvas.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                handleMapEditorDragEnd();
            }
        });
        
        // Handle mouse wheel for zooming
        mapEditorCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            handleMapEditorZoom(e);
        });
    }
    
    // Handle arrow keys for panning and keypad for speed mode (map editor)
    // Handle keypad for player movement (main game)
    document.addEventListener('keydown', (e) => {
        // Check if map editor is open
        const isMapEditorOpen = mapEditor && !mapEditor.classList.contains('hidden');
        
        if (isMapEditorOpen) {
            // Arrow keys for panning
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
                e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                handleMapEditorPan(e.key);
            }
            // Keypad numbers for speed mode navigation
            // Check for keypad: e.location === 3 (keypad) OR e.code starts with 'Numpad'
            else if (e.key >= '1' && e.key <= '9' && (e.location === 3 || e.code.startsWith('Numpad'))) {
                e.preventDefault();
                handleSpeedModeNavigation(e.key);
            }
        } else {
            // Main game keypad navigation
            // Only work if game view is visible and not typing in command input
            const gameView = document.getElementById('gameView');
            const commandInput = document.getElementById('commandInput');
            const isGameViewVisible = gameView && !gameView.classList.contains('hidden');
            const isTypingInInput = document.activeElement === commandInput;
            
            if (isGameViewVisible) {
                // Double-check: make sure we're not in any input field
                const activeTag = document.activeElement.tagName.toLowerCase();
                const isInInput = activeTag === 'input' || activeTag === 'textarea';
                
                // Special case: If focused on command input but numpad is pressed, 
                // blur input and navigate instead
                if (isTypingInInput && e.key >= '1' && e.key <= '9') {
                    const isKeypad = (e.location === 3) || 
                                    (e.code && e.code.startsWith('Numpad'));
                    if (isKeypad) {
                        e.preventDefault();
                        commandInput.blur(); // Switch focus away from command input
                        handleKeypadMovement(e.key);
                        return;
                    }
                }
                
                if (!isInInput) {
                    // Check if it's a number key (1-9) for keypad navigation
                    if (e.key >= '1' && e.key <= '9') {
                        // Check for keypad: e.location === 3 (keypad) OR e.code starts with 'Numpad'
                        const isKeypad = (e.location === 3) || 
                                        (e.code && e.code.startsWith('Numpad'));
                        
                        if (isKeypad) {
                            // Keypad numbers for player movement
                            e.preventDefault();
                            handleKeypadMovement(e.key);
                            return; // Don't process further
                        }
                        // If it's a regular number key (not keypad), focus command input
                        // This allows typing numbers in commands
                        e.preventDefault();
                        commandInput.focus();
                        commandInput.value = commandInput.value + e.key;
                        commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
                        return; // Don't process further
                    } 
                    // Check if it's a printable character (letters, space, etc.) - focus command input
                    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        // Printable character - focus command input and add it
                        e.preventDefault();
                        commandInput.focus();
                        commandInput.value = commandInput.value + e.key;
                        // Position cursor at end
                        commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
                    }
                }
            }
        }
    });
});

// Open map editor
function openMapEditor() {
    if (!mapEditor) return;
    
    mapEditor.classList.remove('hidden');
    
    // Set canvas size - use requestAnimationFrame to ensure container is sized
    requestAnimationFrame(() => {
        if (mapEditorCanvas) {
            const container = mapEditorCanvas.parentElement;
            if (container) {
                mapEditorCanvas.width = container.clientWidth;
                mapEditorCanvas.height = container.clientHeight;
                renderMapEditor();
            }
        }
    });
    
    // Load all maps
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getAllMaps' }));
    }
    
    // Load current player's map by default if available
    if (currentMapId) {
        loadMapForEditor(currentMapId);
        // Set map selector to current map
        const mapSelector = document.getElementById('mapSelector');
        if (mapSelector) {
            mapSelector.value = currentMapId;
        }
    }
}

// Close map editor
function closeMapEditor() {
    if (mapEditor) {
        mapEditor.classList.add('hidden');
    }
    selectedRoom = null;
    editorMode = 'edit';
    connectionSourceRoom = null;
    // Reset zoom and pan when closing
    editorZoom = 1.0;
    editorPanX = 0;
    editorPanY = 0;
}

// Handle map editor zoom
function handleMapEditorZoom(e) {
    const zoomSpeed = 0.1;
    const minZoom = 0.5;
    const maxZoom = 5.0;
    
    if (e.deltaY < 0) {
        // Zoom in
        editorZoom = Math.min(editorZoom + zoomSpeed, maxZoom);
    } else {
        // Zoom out
        editorZoom = Math.max(editorZoom - zoomSpeed, minZoom);
    }
    
    renderMapEditor();
}

// Handle map editor panning
function handleMapEditorPan(direction) {
    const panAmount = 5; // Pan by 5 squares
    
    switch (direction) {
        case 'ArrowUp':
            editorPanY += panAmount;
            break;
        case 'ArrowDown':
            editorPanY -= panAmount;
            break;
        case 'ArrowLeft':
            editorPanX -= panAmount;
            break;
        case 'ArrowRight':
            editorPanX += panAmount;
            break;
    }
    
    renderMapEditor();
}

// Load map for editor
function loadMapForEditor(mapId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    currentEditorMapId = mapId;
    // Reset zoom and pan when loading a new map
    editorZoom = 1.0;
    editorPanX = 0;
    editorPanY = 0;
    ws.send(JSON.stringify({ type: 'getMapEditorData', mapId: mapId }));
}

// Show create map dialog
function showCreateMapDialog() {
    const dialog = document.getElementById('createMapDialog');
    if (dialog) {
        dialog.classList.remove('hidden');
        document.getElementById('newMapName').value = '';
        document.getElementById('newMapDescription').value = '';
    }
}

// Hide create map dialog
function hideCreateMapDialog() {
    const dialog = document.getElementById('createMapDialog');
    if (dialog) {
        dialog.classList.add('hidden');
    }
}

// Create new map
function createNewMap() {
    const name = document.getElementById('newMapName').value.trim();
    const description = document.getElementById('newMapDescription').value.trim();
    
    if (!name) {
        alert('Map name is required');
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'createMap',
        name: name,
        width: 100,
        height: 100,
        description: description
    }));
    
    hideCreateMapDialog();
}

// Toggle connect mode
function toggleConnectMode() {
    if (editorMode === 'connect') {
        editorMode = 'edit';
        connectionSourceRoom = null;
        updateSidePanel();
    } else {
        editorMode = 'connect';
        // If a room is already selected, use it as source room
        if (selectedRoom && selectedRoom.id) {
            connectionSourceRoom = selectedRoom;
        } else {
            connectionSourceRoom = null;
        }
        updateSidePanel();
    }
}

// Handle map editor click
function handleMapEditorClick(e) {
    if (!mapEditorCanvas || !mapEditorCtx) return;
    
    const rect = mapEditorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const canvasWidth = mapEditorCanvas.width;
    const canvasHeight = mapEditorCanvas.height;
    
    // Convert click coordinates to map coordinates (always use 100x100 grid)
    const coords = screenToMapCoords(x, y);
    const mapX = coords ? coords.x : 0;
    const mapY = coords ? coords.y : 0;
    
    if (editorMode === 'connect') {
        // In connect mode, select source room first
        const clickedRoom = editorMapRooms.find(r => r.x === mapX && r.y === mapY);
        if (clickedRoom) {
            connectionSourceRoom = clickedRoom;
            selectedRoom = clickedRoom; // Also set as selected for visual feedback
            selectedRooms = [clickedRoom];
            updateSidePanel();
            renderMapEditor(); // Re-render to show highlight
        }
    } else {
        // In edit/create mode
        const clickedRoom = editorMapRooms.find(r => r.x === mapX && r.y === mapY);
        if (clickedRoom) {
            // Select existing room for editing
            selectedRoom = clickedRoom;
            selectedRooms = [clickedRoom]; // Clear previous selection and set only this room
            updateSidePanel();
            renderMapEditor(); // Re-render to show red highlight
        } else {
            // Clicked empty space - create new room
            selectedRoom = { x: mapX, y: mapY, isNew: true };
            selectedRooms = []; // Clear selection for new room creation
            updateSidePanel();
            renderMapEditor(); // Re-render to show red highlight
        }
    }
}

// Handle speed mode navigation with keypad
function handleSpeedModeNavigation(key) {
    if (!selectedRoom || !selectedRoom.id) {
        // Need a selected room to navigate from
        return;
    }
    
    // Keypad to direction mapping
    // 7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE
    const directionMap = {
        '7': { dx: -1, dy: 1 },  // NW
        '8': { dx: 0, dy: 1 },   // N
        '9': { dx: 1, dy: 1 },   // NE
        '4': { dx: -1, dy: 0 },  // W
        '6': { dx: 1, dy: 0 },   // E
        '1': { dx: -1, dy: -1 }, // SW
        '2': { dx: 0, dy: -1 },  // S
        '3': { dx: 1, dy: -1 }   // SE
    };
    
    const direction = directionMap[key];
    if (!direction) return;
    
    const currentRoom = editorMapRooms.find(r => r.id === selectedRoom.id);
    if (!currentRoom) return;
    
    const newX = currentRoom.x + direction.dx;
    const newY = currentRoom.y + direction.dy;
    
    // Check if room already exists at this location
    const existingRoom = editorMapRooms.find(r => r.x === newX && r.y === newY);
    
    if (existingRoom) {
        // Room exists, just select it and keep speed mode active
        selectedRoom = existingRoom;
        selectedRooms = [existingRoom];
        speedModeActive = true; // Ensure speed mode stays active
        updateSidePanel();
        renderMapEditor();
    } else {
        // Create new room at this location (speed mode)
        const genericName = `Room ${newX},${newY}`;
        const genericDescription = 'A generic room';
        
        // Ensure speed mode is active before creating
        speedModeActive = true;
        createRoom(currentEditorMapId, genericName, genericDescription, newX, newY, 'normal');
        
        // After creation, the room will be added to editorMapRooms via WebSocket message
        // Speed mode will automatically select it and keep it selected
    }
}

// Handle drag selection
function handleMapEditorDrag() {
    if (!mapEditorCanvas || !mapEditorCtx) return;
    
    // Calculate map coordinates for drag start and end
    const startCoords = screenToMapCoords(dragStartX, dragStartY);
    const endCoords = screenToMapCoords(dragEndX, dragEndY);
    
    if (!startCoords || !endCoords) return;
    
    // Find all rooms in the drag rectangle
    const minX = Math.min(startCoords.x, endCoords.x);
    const maxX = Math.max(startCoords.x, endCoords.x);
    const minY = Math.min(startCoords.y, endCoords.y);
    const maxY = Math.max(startCoords.y, endCoords.y);
    
    selectedRooms = editorMapRooms.filter(room => 
        room.x >= minX && room.x <= maxX && room.y >= minY && room.y <= maxY
    );
    
    // Update selection
    if (selectedRooms.length > 0) {
        selectedRoom = selectedRooms[0]; // Set first as primary
    }
    
    updateSidePanel();
    renderMapEditor();
}

// Handle drag end
function handleMapEditorDragEnd() {
    // Drag is complete, selection is already set
    updateSidePanel();
    renderMapEditor();
}

// Convert screen coordinates to map coordinates
function screenToMapCoords(screenX, screenY) {
    if (!mapEditorCanvas) return null;
    
    const canvasWidth = mapEditorCanvas.width;
    const canvasHeight = mapEditorCanvas.height;
    
    // Always use 100x100 grid centered at 0,0
    const gridSize = EDITOR_GRID_SIZE;
    const gridWidth = gridSize * EDITOR_CELL_SIZE;
    const gridHeight = gridSize * EDITOR_CELL_SIZE;
    
    const baseScaleX = canvasWidth / gridWidth;
    const baseScaleY = canvasHeight / gridHeight;
    const baseScale = Math.min(baseScaleX, baseScaleY, 1);
    
    const scaledCellSize = EDITOR_CELL_SIZE * baseScale * editorZoom;
    const scaledGridWidth = gridSize * scaledCellSize;
    const scaledGridHeight = gridSize * scaledCellSize;
    
    const centerOffsetX = (canvasWidth - scaledGridWidth) / 2;
    const centerOffsetY = (canvasHeight - scaledGridHeight) / 2;
    const offsetX = centerOffsetX - (editorPanX * scaledCellSize);
    const offsetY = centerOffsetY + (editorPanY * scaledCellSize);
    
    const gridCenter = Math.floor(gridSize / 2);
    const gridX = Math.floor((screenX - offsetX) / scaledCellSize);
    const gridY = Math.floor((screenY - offsetY) / scaledCellSize);
    
    return {
        x: gridX - gridCenter,
        y: gridCenter - gridY
    };
}

// Render map editor
function renderMapEditor() {
    if (!mapEditorCanvas || !mapEditorCtx) {
        return;
    }
    
    const canvasWidth = mapEditorCanvas.width;
    const canvasHeight = mapEditorCanvas.height;
    
    // Clear canvas
    mapEditorCtx.fillStyle = '#000';
    mapEditorCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Always use 100x100 grid centered at 0,0
    const gridSize = EDITOR_GRID_SIZE;
    const gridWidth = gridSize * EDITOR_CELL_SIZE;
    const gridHeight = gridSize * EDITOR_CELL_SIZE;
    
    // Calculate scale to fit in canvas (base scale, then apply zoom)
    const baseScaleX = canvasWidth / gridWidth;
    const baseScaleY = canvasHeight / gridHeight;
    const baseScale = Math.min(baseScaleX, baseScaleY, 1); // Don't scale up, only down
    
    const scaledCellSize = EDITOR_CELL_SIZE * baseScale * editorZoom;
    const scaledGridWidth = gridSize * scaledCellSize;
    const scaledGridHeight = gridSize * scaledCellSize;
    
    // Center the grid, then apply pan offset
    const centerOffsetX = (canvasWidth - scaledGridWidth) / 2;
    const centerOffsetY = (canvasHeight - scaledGridHeight) / 2;
    const offsetX = centerOffsetX - (editorPanX * scaledCellSize);
    const offsetY = centerOffsetY + (editorPanY * scaledCellSize); // Invert Y for pan
    
    // Create a set of room coordinates for quick lookup
    const roomCoords = new Set();
    editorMapRooms.forEach(room => {
        roomCoords.add(`${room.x},${room.y}`);
    });
    
    // Draw grid lines (only draw visible lines)
    mapEditorCtx.strokeStyle = '#333';
    mapEditorCtx.lineWidth = 1;
    
    // Calculate visible range
    const startX = Math.max(0, Math.floor(-offsetX / scaledCellSize) - 1);
    const endX = Math.min(gridSize, Math.ceil((canvasWidth - offsetX) / scaledCellSize) + 1);
    const startY = Math.max(0, Math.floor(-offsetY / scaledCellSize) - 1);
    const endY = Math.min(gridSize, Math.ceil((canvasHeight - offsetY) / scaledCellSize) + 1);
    
    // Draw vertical lines
    for (let x = startX; x <= endX; x++) {
        const screenX = offsetX + x * scaledCellSize;
        if (screenX >= -scaledCellSize && screenX <= canvasWidth + scaledCellSize) {
            mapEditorCtx.beginPath();
            mapEditorCtx.moveTo(screenX, Math.max(0, offsetY));
            mapEditorCtx.lineTo(screenX, Math.min(canvasHeight, offsetY + scaledGridHeight));
            mapEditorCtx.stroke();
        }
    }
    
    // Draw horizontal lines
    for (let y = startY; y <= endY; y++) {
        const screenY = offsetY + y * scaledCellSize;
        if (screenY >= -scaledCellSize && screenY <= canvasHeight + scaledCellSize) {
            mapEditorCtx.beginPath();
            mapEditorCtx.moveTo(Math.max(0, offsetX), screenY);
            mapEditorCtx.lineTo(Math.min(canvasWidth, offsetX + scaledGridWidth), screenY);
            mapEditorCtx.stroke();
        }
    }
    
    // Helper function to check if a room has adjacent rooms
    function hasAdjacentRoom(room) {
        const directions = [
            { dx: 0, dy: 1 },   // N
            { dx: 0, dy: -1 },  // S
            { dx: 1, dy: 0 },   // E
            { dx: -1, dy: 0 },  // W
            { dx: 1, dy: 1 },   // NE
            { dx: -1, dy: 1 },  // NW
            { dx: 1, dy: -1 },  // SE
            { dx: -1, dy: -1 }  // SW
        ];
        
        return directions.some(dir => {
            const checkX = room.x + dir.dx;
            const checkY = room.y + dir.dy;
            return roomCoords.has(`${checkX},${checkY}`);
        });
    }
    
    // Draw empty cells near rooms (within 2 squares) - only draw visible ones
    if (editorMapRooms.length > 0) {
        const gridCenter = Math.floor(gridSize / 2);
        
        editorMapRooms.forEach(room => {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const checkX = room.x + dx;
                    const checkY = room.y + dy;
                    const key = `${checkX},${checkY}`;
                    if (!roomCoords.has(key)) {
                        // Convert map coordinates to grid coordinates (centered at 0,0)
                        const gridX = checkX + gridCenter;
                        const gridY = gridCenter - checkY; // Invert Y
                        
                        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
                            const screenX = offsetX + gridX * scaledCellSize;
                            const screenY = offsetY + gridY * scaledCellSize;
                            
                            // Only draw if visible on screen
                            if (screenX + scaledCellSize >= 0 && screenX <= canvasWidth &&
                                screenY + scaledCellSize >= 0 && screenY <= canvasHeight) {
                                mapEditorCtx.strokeStyle = '#333';
                                mapEditorCtx.lineWidth = 1;
                                mapEditorCtx.strokeRect(screenX, screenY, scaledCellSize, scaledCellSize);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Draw rooms (only draw visible ones)
    const gridCenter = Math.floor(gridSize / 2);
    editorMapRooms.forEach(room => {
        // Convert map coordinates to grid coordinates (centered at 0,0)
        const gridX = room.x + gridCenter;
        const gridY = gridCenter - room.y; // Invert Y
        
        if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) {
            return; // Room is outside 100x100 grid
        }
        
        const screenX = offsetX + gridX * scaledCellSize;
        const screenY = offsetY + gridY * scaledCellSize;
        
        // Skip if not visible on screen
        if (screenX + scaledCellSize < 0 || screenX > canvasWidth ||
            screenY + scaledCellSize < 0 || screenY > canvasHeight) {
            return;
        }
        
        // Determine color based on room type, name, and adjacency
        // White for rooms with map connections (exit rooms), matching player map view
        let fillColor = '#00ff00'; // Normal (green)
        let borderColor = '#ffff00'; // Yellow border
        
        // Check if room has a connection to another map (exit room)
        const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
        
        if (hasConnection) {
            fillColor = '#ffffff'; // White for rooms with connections (exit rooms)
            borderColor = '#cccccc'; // Light grey border for connected rooms
        } else {
            // Check if room has adjacent rooms (adjoining)
            const isAdjoining = hasAdjacentRoom(room);
            
            if (isAdjoining) {
                fillColor = '#006600'; // Dark green for adjoining rooms
                borderColor = '#004400'; // Darker green border
            } else {
                // Check if room has generic name (starts with "Room ")
                const isGenericName = room.name && room.name.startsWith('Room ');
                
                if (isGenericName) {
                    fillColor = '#0088ff'; // Blue for generic rooms
                    borderColor = '#0066cc'; // Darker blue border
                } else if (room.roomType === 'merchant' || room.room_type === 'merchant') {
                    fillColor = '#0088ff'; // Blue for merchant rooms
                    borderColor = '#0066cc'; // Darker blue border
                }
            }
        }
        
        // Check if this is the player's current room
        const isPlayerRoom = currentMapId && currentMapId === currentEditorMapId && 
                            currentRoomPos && 
                            room.x === currentRoomPos.x && 
                            room.y === currentRoomPos.y;
        
        // Check if room is in selected rooms array (mass selection)
        const isSelected = selectedRooms.some(r => r.id === room.id);
        const isSelectedSingle = selectedRoom && selectedRoom.id === room.id;
        const isAnySelected = isSelected || isSelectedSingle;
        
        // Highlight selected room(s) - red border (takes priority)
        if (isAnySelected) {
            borderColor = '#ff0000'; // Red for selected
            mapEditorCtx.lineWidth = 3;
        } else if (isPlayerRoom) {
            // Player's room but NOT selected - purple outline
            borderColor = '#ff00ff'; // Purple for player's room (not selected)
            mapEditorCtx.lineWidth = 2;
        } else {
            mapEditorCtx.lineWidth = 1;
        }
        
        // Highlight connection source room (overrides other highlights)
        if (connectionSourceRoom && connectionSourceRoom.id === room.id) {
            borderColor = '#ff8800'; // Orange for connection source
            mapEditorCtx.lineWidth = 3;
        }
        
        const cellPadding = Math.max(1, scaledCellSize * 0.1);
        
        // Visual indicator for rooms with map connections (small yellow dot)
        // Note: Room is already white, so we just add a small indicator
        if (hasConnection) {
            const indicatorSize = scaledCellSize * 0.15;
            const indicatorX = screenX + scaledCellSize - indicatorSize - 2;
            const indicatorY = screenY + 2;
            
            mapEditorCtx.fillStyle = '#ffff00'; // Yellow indicator dot
            mapEditorCtx.beginPath();
            mapEditorCtx.arc(indicatorX + indicatorSize/2, indicatorY + indicatorSize/2, indicatorSize/2, 0, Math.PI * 2);
            mapEditorCtx.fill();
        }
        
        mapEditorCtx.fillStyle = fillColor;
        mapEditorCtx.fillRect(screenX + cellPadding, screenY + cellPadding, scaledCellSize - cellPadding * 2, scaledCellSize - cellPadding * 2);
        
        mapEditorCtx.strokeStyle = borderColor;
        mapEditorCtx.strokeRect(screenX + cellPadding, screenY + cellPadding, scaledCellSize - cellPadding * 2, scaledCellSize - cellPadding * 2);
    });
    
    // Draw selected empty space (for new room creation) with red highlight
    if (selectedRoom && selectedRoom.isNew) {
        const gridCenter = Math.floor(gridSize / 2);
        const mapX = selectedRoom.x;
        const mapY = selectedRoom.y;
        
        // Convert map coordinates to grid coordinates (centered at 0,0)
        const gridX = mapX + gridCenter;
        const gridY = gridCenter - mapY; // Invert Y
        
        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
            const screenX = offsetX + gridX * scaledCellSize;
            const screenY = offsetY + gridY * scaledCellSize;
            
            // Only draw if visible on screen
            if (screenX + scaledCellSize >= 0 && screenX <= canvasWidth &&
                screenY + scaledCellSize >= 0 && screenY <= canvasHeight) {
                // Draw red outline for selected empty space
                mapEditorCtx.strokeStyle = '#ff0000'; // Red
                mapEditorCtx.lineWidth = 3;
                mapEditorCtx.strokeRect(screenX, screenY, scaledCellSize, scaledCellSize);
                
                // Also draw a light red fill to make it more visible
                mapEditorCtx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                mapEditorCtx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
            }
        }
    }
}

// Update side panel
function updateSidePanel() {
    const sidePanel = document.getElementById('sidePanelContent');
    if (!sidePanel) return;
    
    if (editorMode === 'connect') {
        if (connectionSourceRoom) {
            // Show connection form
            sidePanel.innerHTML = `
                <h3 style="font-size: 0.9em; margin-bottom: 8px;">Connect Maps</h3>
                <p style="font-size: 0.85em; margin-bottom: 8px;"><strong>Source Room:</strong> ${connectionSourceRoom.name} (${connectionSourceRoom.x}, ${connectionSourceRoom.y})</p>
                <label style="margin-top: 8px;">Direction:</label>
                <select id="connectionDirection" style="margin-bottom: 8px;">
                    <option value="N">North</option>
                    <option value="S">South</option>
                    <option value="E">East</option>
                    <option value="W">West</option>
                    <option value="NE">Northeast</option>
                    <option value="NW">Northwest</option>
                    <option value="SE">Southeast</option>
                    <option value="SW">Southwest</option>
                </select>
                <label style="margin-top: 8px;">Target Map:</label>
                <select id="targetMapSelect" style="margin-bottom: 8px;"></select>
                <label style="margin-top: 8px;">Target Room:</label>
                <select id="targetRoomSelect" style="margin-bottom: 8px;">
                    <option value="">Select a room...</option>
                </select>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <label style="margin: 0; min-width: 20px;">X:</label>
                    <input type="number" id="targetRoomX" value="0" style="flex: 1;">
                    <label style="margin: 0; min-width: 20px; margin-left: 8px;">Y:</label>
                    <input type="number" id="targetRoomY" value="0" style="flex: 1;">
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button id="connectMapsConfirm" style="flex: 1;">Connect</button>
                    <button id="connectMapsCancel" style="flex: 1;">Cancel</button>
                </div>
            `;
            
            // Load maps for target map selector
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'getAllMaps' }));
            }
            
            // Set up target map change handler to load rooms
            const targetMapSelect = document.getElementById('targetMapSelect');
            if (targetMapSelect) {
                targetMapSelect.addEventListener('change', () => {
                    const targetMapId = parseInt(targetMapSelect.value);
                    if (targetMapId) {
                        loadTargetMapRooms(targetMapId);
                    } else {
                        const targetRoomSelect = document.getElementById('targetRoomSelect');
                        if (targetRoomSelect) {
                            targetRoomSelect.innerHTML = '<option value="">Select a room...</option>';
                        }
                    }
                });
            }
            
            // Set up target room select handler to update coordinates
            const targetRoomSelect = document.getElementById('targetRoomSelect');
            if (targetRoomSelect) {
                targetRoomSelect.addEventListener('change', () => {
                    const selectedOption = targetRoomSelect.options[targetRoomSelect.selectedIndex];
                    if (selectedOption.value) {
                        const coords = selectedOption.value.split(',');
                        document.getElementById('targetRoomX').value = coords[0];
                        document.getElementById('targetRoomY').value = coords[1];
                    }
                });
            }
            
            // Set up button handlers
            document.getElementById('connectMapsConfirm').addEventListener('click', () => {
                connectMaps();
            });
            document.getElementById('connectMapsCancel').addEventListener('click', () => {
                connectionSourceRoom = null;
                editorMode = 'edit';
                updateSidePanel();
            });
        } else {
            // Show prompt to select source room
            sidePanel.innerHTML = `
                <h3 style="font-size: 0.9em; margin-bottom: 8px;">Connect Maps</h3>
                <p style="font-size: 0.85em; margin-bottom: 8px;">Click a room on the map to select it as the source room for connection.</p>
                <button id="connectMapsCancel" style="width: 100%; margin-top: 8px;">Cancel</button>
            `;
            
            document.getElementById('connectMapsCancel').addEventListener('click', () => {
                editorMode = 'edit';
                connectionSourceRoom = null;
                updateSidePanel();
            });
        }
    } else if (selectedRoom && selectedRoom.isNew) {
        // Show create room form
        sidePanel.innerHTML = `
            <h3 style="font-size: 0.9em; margin-bottom: 8px;">Create New Room</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label style="margin: 0; min-width: 80px;">Room Name:</label>
                <input type="text" id="newRoomName" placeholder="Enter room name" style="flex: 1;">
            </div>
            <label style="margin-top: 8px;">Description:</label>
            <textarea id="newRoomDescription" placeholder="Enter room description" style="min-height: 60px; margin-bottom: 8px;"></textarea>
            <label style="margin-top: 8px;">Room Type:</label>
            <select id="newRoomType" style="margin-bottom: 8px;">
                <option value="normal">Normal</option>
                <option value="merchant">Merchant</option>
            </select>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label style="margin: 0; min-width: 20px;">X:</label>
                <input type="number" id="newRoomX" value="${selectedRoom.x}" style="flex: 1;">
                <label style="margin: 0; min-width: 20px; margin-left: 8px;">Y:</label>
                <input type="number" id="newRoomY" value="${selectedRoom.y}" style="flex: 1;">
            </div>
            <button id="createRoomConfirm">Create Room</button>
            <button id="createRoomCancel">Cancel</button>
        `;
        
        document.getElementById('createRoomConfirm').addEventListener('click', () => {
            createRoom();
        });
        document.getElementById('createRoomCancel').addEventListener('click', () => {
            selectedRoom = null;
            updateSidePanel();
            renderMapEditor(); // Re-render to remove highlight
        });
    } else if (selectedRooms.length > 1) {
        // Show global edit form for multiple rooms
        const firstRoom = selectedRooms[0];
        sidePanel.innerHTML = `
            <h3 style="font-size: 0.9em; margin-bottom: 8px;">Global Edit (${selectedRooms.length} rooms)</h3>
            <p style="font-size: 0.85em; margin-bottom: 8px; color: #aaa;">Editing ${selectedRooms.length} selected rooms</p>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label style="margin: 0; min-width: 80px;">Room Name:</label>
                <input type="text" id="editRoomName" value="${firstRoom.name}" style="flex: 1;" placeholder="Set name for all rooms">
            </div>
            <label style="margin-top: 8px;">Description:</label>
            <textarea id="editRoomDescription" style="min-height: 60px; margin-bottom: 8px;" placeholder="Set description for all rooms">${firstRoom.description || ''}</textarea>
            <label style="margin-top: 8px;">Room Type:</label>
            <select id="editRoomType" style="margin-bottom: 8px;">
                <option value="normal" ${firstRoom.roomType === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="merchant" ${firstRoom.roomType === 'merchant' ? 'selected' : ''}>Merchant</option>
            </select>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="updateRoomConfirm" style="flex: 1;">Update All Rooms</button>
                <button id="deleteRoomsConfirm" style="flex: 1; background: #cc0000;">Delete All Rooms</button>
            </div>
            <button id="updateRoomCancel" style="width: 100%; margin-top: 8px;">Cancel</button>
        `;
        
        document.getElementById('updateRoomConfirm').addEventListener('click', () => {
            updateMultipleRooms();
        });
        document.getElementById('deleteRoomsConfirm').addEventListener('click', () => {
            deleteRooms(selectedRooms);
        });
        document.getElementById('updateRoomCancel').addEventListener('click', () => {
            selectedRoom = null;
            selectedRooms = [];
            updateSidePanel();
            renderMapEditor();
        });
    } else if (selectedRoom) {
        // Check if room has a connection
        const hasConnection = selectedRoom.connected_map_id !== null && selectedRoom.connected_map_id !== undefined;
        let connectionInfo = '';
        
        if (hasConnection) {
            // Find connected map name
            const connectedMap = allMapsData.find(m => m.id === selectedRoom.connected_map_id);
            const mapName = connectedMap ? connectedMap.name : `Map ID ${selectedRoom.connected_map_id} (Missing)`;
            const direction = selectedRoom.connection_direction || 'Unknown';
            const targetX = selectedRoom.connected_room_x !== null && selectedRoom.connected_room_x !== undefined ? selectedRoom.connected_room_x : '?';
            const targetY = selectedRoom.connected_room_y !== null && selectedRoom.connected_room_y !== undefined ? selectedRoom.connected_room_y : '?';
            
            // Try to find the target room name - check if we need to load that map's rooms
            // For now, we'll show coordinates and try to find in current editorMapRooms if it's the same map
            let roomName = 'Unknown Room';
            let isOrphaned = false;
            const targetRoom = editorMapRooms.find(r => 
                r.mapId === selectedRoom.connected_map_id && 
                r.x === selectedRoom.connected_room_x && 
                r.y === selectedRoom.connected_room_y
            );
            if (targetRoom) {
                roomName = targetRoom.name;
            } else {
                // Room doesn't exist in current editor view - might be orphaned
                isOrphaned = true;
            }
            
            connectionInfo = `
                <div style="background: #1a3a1a; border: 2px solid #00ff00; border-radius: 4px; padding: 6px; margin-bottom: 8px;">
                    <div style="color: #00ff00; font-weight: bold; margin-bottom: 3px; font-size: 0.75em;">Map Connection:</div>
                    <div style="color: #00ff00; font-size: 0.7em; line-height: 1.3;">
                        <div style="margin-bottom: 2px;"><strong>To:</strong> ${mapName}</div>
                        <div style="margin-bottom: 2px;"><strong>Room:</strong> ${roomName}${isOrphaned ? ' <span style="color: #ffaa00;">(Orphaned)</span>' : ''}</div>
                        <div style="margin-bottom: 2px;"><strong>Coords:</strong> (${targetX}, ${targetY})</div>
                        <div style="margin-bottom: 4px;"><strong>Dir:</strong> ${direction}</div>
                        <button id="disconnectMapBtn" style="width: 100%; padding: 4px; background: #cc0000; color: #fff; border: 1px solid #ff0000; border-radius: 2px; font-size: 0.7em; cursor: pointer;">Delete Connection</button>
                    </div>
                </div>
            `;
        }
        
        // Show edit room form (single room)
        sidePanel.innerHTML = `
            <h3 style="font-size: 0.9em; margin-bottom: 8px;">Edit Room</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="min-width: 60px;">X: ${selectedRoom.x}</span>
                <span>Y: ${selectedRoom.y}</span>
            </div>
            ${connectionInfo}
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label style="margin: 0; min-width: 80px;">Room Name:</label>
                <input type="text" id="editRoomName" value="${selectedRoom.name}" style="flex: 1;">
            </div>
            <label style="margin-top: 8px;">Description:</label>
            <textarea id="editRoomDescription" style="min-height: 60px; margin-bottom: 8px;">${selectedRoom.description || ''}</textarea>
            <label style="margin-top: 8px;">Room Type:</label>
            <select id="editRoomType" style="margin-bottom: 8px;">
                <option value="normal" ${selectedRoom.roomType === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="merchant" ${selectedRoom.roomType === 'merchant' ? 'selected' : ''}>Merchant</option>
            </select>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="updateRoomConfirm" style="flex: 1;">Update Room</button>
                <button id="deleteRoomConfirm" style="flex: 1; background: #cc0000;">Delete Room</button>
            </div>
            <button id="updateRoomCancel" style="width: 100%; margin-top: 8px;">Cancel</button>
        `;
        
        document.getElementById('updateRoomConfirm').addEventListener('click', () => {
            updateRoom();
        });
        document.getElementById('deleteRoomConfirm').addEventListener('click', () => {
            deleteRooms([selectedRoom]);
        });
        document.getElementById('updateRoomCancel').addEventListener('click', () => {
            selectedRoom = null;
            selectedRooms = [];
            updateSidePanel();
            renderMapEditor();
        });
        
        // Add disconnect button handler if connection exists
        if (hasConnection) {
            const disconnectBtn = document.getElementById('disconnectMapBtn');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', () => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'disconnectMap',
                            roomId: selectedRoom.id
                        }));
                    }
                });
            }
        }
    } else {
        // Default message
        sidePanel.innerHTML = `
            <p>Select a room to edit or click empty space to create a new room.</p>
            ${editorMode === 'connect' ? '<p><strong>Connect Mode:</strong> Click a room to select as source.</p>' : ''}
        `;
    }
}

// Create room (with optional parameters for speed mode)
function createRoom(mapId, name, description, x, y, roomType) {
    // If called from speed mode, use parameters directly
    if (arguments.length >= 5) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        ws.send(JSON.stringify({
            type: 'createRoom',
            mapId: mapId,
            name: name,
            description: description,
            x: x,
            y: y,
            roomType: roomType || 'normal'
        }));
        return;
    }
    
    // Otherwise, get values from form
    name = document.getElementById('newRoomName').value.trim();
    description = document.getElementById('newRoomDescription').value.trim();
    roomType = document.getElementById('newRoomType').value;
    x = parseInt(document.getElementById('newRoomX').value);
    y = parseInt(document.getElementById('newRoomY').value);
    
    if (!name) {
        alert('Room name is required');
        return;
    }
    
    if (!currentEditorMapId) {
        alert('No map selected');
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'createRoom',
        mapId: currentEditorMapId,
        name: name,
        description: description,
        x: x,
        y: y,
        roomType: roomType
    }));
    
    selectedRoom = null;
    selectedRooms = [];
    updateSidePanel();
}

// Update room (single or multiple)
function updateRoom() {
    const name = document.getElementById('editRoomName').value.trim();
    const description = document.getElementById('editRoomDescription').value.trim();
    const roomType = document.getElementById('editRoomType').value;
    
    if (!name) {
        alert('Room name is required');
        return;
    }
    
    if (selectedRooms.length > 1) {
        updateMultipleRooms();
        return;
    }
    
    if (!selectedRoom || !selectedRoom.id) {
        alert('No room selected');
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'updateRoom',
        roomId: selectedRoom.id,
        name: name,
        description: description,
        roomType: roomType
    }));
    
    selectedRoom = null;
    selectedRooms = [];
    updateSidePanel();
}

// Update multiple rooms
function updateMultipleRooms() {
    const name = document.getElementById('editRoomName').value.trim();
    const description = document.getElementById('editRoomDescription').value.trim();
    const roomType = document.getElementById('editRoomType').value;
    
    if (!name) {
        alert('Room name is required');
        return;
    }
    
    if (selectedRooms.length === 0) {
        alert('No rooms selected');
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Update each room
    selectedRooms.forEach(room => {
        ws.send(JSON.stringify({
            type: 'updateRoom',
            roomId: room.id,
            name: name,
            description: description,
            roomType: roomType
        }));
    });
    
    selectedRoom = null;
    selectedRooms = [];
    updateSidePanel();
}

// Delete rooms (single or multiple)
function deleteRooms(roomsToDelete) {
    if (!roomsToDelete || roomsToDelete.length === 0) {
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Check for connected rooms before deleting (client-side validation)
    const connectedRooms = roomsToDelete.filter(room => 
        (room.connected_map_id !== null && room.connected_map_id !== undefined) ||
        // Also check if any other room connects to this one
        editorMapRooms.some(r => 
            r.connected_map_id === room.mapId && 
            r.connected_room_x === room.x && 
            r.connected_room_y === room.y
        )
    );
    
    if (connectedRooms.length > 0) {
        const roomList = connectedRooms.map(r => `${r.name} (${r.x},${r.y})`).join('\n');
        alert(`Cannot delete rooms that are part of map connections:\n\n${roomList}\n\nPlease disconnect these rooms before deleting.`);
        return;
    }
    
    // Delete each room (server will validate again)
    roomsToDelete.forEach(room => {
        ws.send(JSON.stringify({
            type: 'deleteRoom',
            roomId: room.id
        }));
    });
    
    // Clear selection after delete (will be updated when server confirms)
    // Don't clear immediately in case server rejects
}

// Load rooms for target map
function loadTargetMapRooms(mapId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'getMapEditorData',
        mapId: mapId
    }));
}

// Connect maps
function connectMaps() {
    const direction = document.getElementById('connectionDirection').value;
    const targetMapId = parseInt(document.getElementById('targetMapSelect').value);
    const targetX = parseInt(document.getElementById('targetRoomX').value);
    const targetY = parseInt(document.getElementById('targetRoomY').value);
    
    if (!connectionSourceRoom || !connectionSourceRoom.id) {
        alert('No source room selected');
        return;
    }
    
    if (!targetMapId || isNaN(targetX) || isNaN(targetY)) {
        alert('Please fill in all connection fields');
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'connectMaps',
        sourceRoomId: connectionSourceRoom.id,
        sourceDirection: direction,
        targetMapId: targetMapId,
        targetX: targetX,
        targetY: targetY
    }));
    
    connectionSourceRoom = null;
    editorMode = 'edit';
    selectedRoom = null;
    selectedRooms = [];
    updateSidePanel();
}

// Handle window resize for map editor
window.addEventListener('resize', () => {
    if (mapCanvas && mapCtx) {
        const viewport = document.querySelector('.map-viewport');
        if (viewport) {
            mapCanvas.width = viewport.clientWidth;
            mapCanvas.height = viewport.clientHeight;
            renderMap();
        }
    }
    
    if (mapEditorCanvas && mapEditorCtx) {
        requestAnimationFrame(() => {
            const container = mapEditorCanvas.parentElement;
            if (container) {
                mapEditorCanvas.width = container.clientWidth;
                mapEditorCanvas.height = container.clientHeight;
                renderMapEditor();
            }
        });
    }
});