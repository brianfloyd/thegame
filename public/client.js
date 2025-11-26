let ws = null;
let currentPlayerName = null;

// Get protocol (ws or wss) based on current page protocol
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.hostname}:3434`;

// Connect to WebSocket server
function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
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
            updateRoomView(data.room, data.players, data.exits);
            break;
        case 'playerJoined':
            addPlayerToTerminal(data.playerName);
            break;
        case 'playerLeft':
            removePlayerFromTerminal(data.playerName);
            break;
        case 'moved':
            updateRoomView(data.room, data.players, data.exits);
            break;
        case 'playerStats':
            updatePlayerStats(data.stats);
            if (data.stats.godMode !== undefined) {
                updateGodModeUI(data.stats.godMode);
            }
            break;
        case 'mapData':
            initializeMap(data.rooms, data.currentRoom, data.mapId, data.connectionInfo);
            break;
        case 'mapUpdate':
            updateMapPosition(data.currentRoom, data.mapId);
            break;
        case 'error':
            addToTerminal(data.message, 'error');
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
        case 'mapConnected':
            // Reload map data
            if (currentEditorMapId) {
                loadMapForEditor(currentEditorMapId);
            }
            alert('Maps connected successfully!');
            break;
    }
}

// Command mapping for all variations
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
    'down': 'D', 'd': 'D'
};

// Normalize command input
function normalizeCommand(input) {
    const cmd = input.trim().toLowerCase();
    return commandMap[cmd] || null;
}

// Update room view in terminal
function updateRoomView(room, players, exits) {
    const terminalContent = document.getElementById('terminalContent');
    
    // Clear terminal
    terminalContent.innerHTML = '';
    
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
    const playersSection = document.createElement('div');
    playersSection.className = 'players-section';
    
    const playersLine = document.createElement('div');
    playersLine.className = 'players-line';
    
    const playersTitle = document.createElement('span');
    playersTitle.className = 'players-section-title';
    playersTitle.textContent = 'Also here:';
    playersLine.appendChild(playersTitle);
    
    // Filter out current player
    const otherPlayers = players.filter(p => p !== currentPlayerName);
    
    if (otherPlayers.length === 0) {
        const noPlayers = document.createElement('span');
        noPlayers.className = 'player-item';
        noPlayers.textContent = ' No one else is here.';
        playersLine.appendChild(noPlayers);
    } else {
        otherPlayers.forEach((playerName, index) => {
            const playerSpan = document.createElement('span');
            playerSpan.className = 'player-item';
            playerSpan.setAttribute('data-player', playerName);
            playerSpan.textContent = (index > 0 ? ', ' : ' ') + playerName;
            playersLine.appendChild(playerSpan);
        });
    }
    
    playersSection.appendChild(playersLine);
    terminalContent.appendChild(playersSection);
    
    // Scroll to bottom
    terminalContent.scrollTop = terminalContent.scrollHeight;
    
    // Update compass buttons
    updateCompassButtons(exits);
    
    // Update coordinates display
    if (room.mapName) {
        currentMapName = room.mapName;
    }
    updateCompassCoordinates(room.x, room.y);
}

// Add player to terminal
function addPlayerToTerminal(playerName) {
    if (playerName === currentPlayerName) return;
    
    const terminalContent = document.getElementById('terminalContent');
    const playersLine = terminalContent.querySelector('.players-line');
    
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
function removePlayerFromTerminal(playerName) {
    const terminalContent = document.getElementById('terminalContent');
    const playersLine = terminalContent.querySelector('.players-line');
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
        selectPlayer(playerName);
    });
});

// Select player and send to server
function selectPlayer(playerName) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server. Please wait...');
        return;
    }

    currentPlayerName = playerName;

    // Send player selection to server
    ws.send(JSON.stringify({
        type: 'selectPlayer',
        playerName: playerName
    }));

    // Show game view, hide player selection
    document.getElementById('playerSelection').classList.add('hidden');
    document.getElementById('gameView').classList.remove('hidden');
    
    // Focus command input
    document.getElementById('commandInput').focus();
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
    const direction = normalizeCommand(command);
    
    if (direction) {
        movePlayer(direction);
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

// Update player stats display
function updatePlayerStats(stats) {
    const statsContent = document.getElementById('playerStatsContent');
    if (!statsContent) return;
    
    statsContent.innerHTML = '';
    
    // Stats Section
    const statsSection = document.createElement('div');
    statsSection.className = 'stats-section';
    
    const statsTitle = document.createElement('div');
    statsTitle.className = 'stats-section-title';
    statsTitle.textContent = 'Attributes';
    statsSection.appendChild(statsTitle);
    
    const statItems = [
        { label: 'Brute Strength', value: stats.bruteStrength },
        { label: 'Life Force', value: stats.lifeForce },
        { label: 'Cunning', value: stats.cunning },
        { label: 'Intelligence', value: stats.intelligence },
        { label: 'Wisdom', value: stats.wisdom }
    ];
    
    statItems.forEach(stat => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = stat.label + ':';
        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = stat.value;
        item.appendChild(label);
        item.appendChild(value);
        statsSection.appendChild(item);
    });
    
    statsContent.appendChild(statsSection);
    
    // Abilities Section
    const abilitiesSection = document.createElement('div');
    abilitiesSection.className = 'stats-section';
    
    const abilitiesTitle = document.createElement('div');
    abilitiesTitle.className = 'stats-section-title';
    abilitiesTitle.textContent = 'Abilities';
    abilitiesSection.appendChild(abilitiesTitle);
    
    const abilityItems = [
        { label: 'Crafting', value: stats.crafting },
        { label: 'Lockpicking', value: stats.lockpicking },
        { label: 'Stealth', value: stats.stealth },
        { label: 'Dodge', value: stats.dodge },
        { label: 'Critical Hit', value: stats.criticalHit }
    ];
    
    abilityItems.forEach(ability => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = ability.label + ':';
        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = ability.value;
        item.appendChild(label);
        item.appendChild(value);
        abilitiesSection.appendChild(item);
    });
    
    statsContent.appendChild(abilitiesSection);
    
    // Hit Points Section
    const hpSection = document.createElement('div');
    hpSection.className = 'stats-section';
    
    const hpTitle = document.createElement('div');
    hpTitle.className = 'stats-section-title';
    hpTitle.textContent = 'Hit Points';
    hpSection.appendChild(hpTitle);
    
    const hpValue = document.createElement('div');
    hpValue.className = 'stat-item';
    hpValue.innerHTML = `<span class="stat-value">${stats.hitPoints}/${stats.maxHitPoints}</span>`;
    hpSection.appendChild(hpValue);
    
    const hpBar = document.createElement('div');
    hpBar.className = 'hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = 'hp-fill';
    const hpPercent = (stats.hitPoints / stats.maxHitPoints) * 100;
    hpFill.style.width = hpPercent + '%';
    hpBar.appendChild(hpFill);
    hpSection.appendChild(hpBar);
    
    statsContent.appendChild(hpSection);
    
    // Mana Section (only if player has mana)
    if (stats.maxMana > 0) {
        const manaSection = document.createElement('div');
        manaSection.className = 'stats-section';
        
        const manaTitle = document.createElement('div');
        manaTitle.className = 'stats-section-title';
        manaTitle.textContent = 'Mana';
        manaSection.appendChild(manaTitle);
        
        const manaValue = document.createElement('div');
        manaValue.className = 'stat-item';
        manaValue.innerHTML = `<span class="stat-value">${stats.mana}/${stats.maxMana}</span>`;
        manaSection.appendChild(manaValue);
        
        const manaBar = document.createElement('div');
        manaBar.className = 'mana-bar';
        const manaFill = document.createElement('div');
        manaFill.className = 'mana-fill';
        const manaPercent = (stats.mana / stats.maxMana) * 100;
        manaFill.style.width = manaPercent + '%';
        manaBar.appendChild(manaFill);
        manaSection.appendChild(manaBar);
        
        statsContent.appendChild(manaSection);
    }
}

// Map rendering variables
let mapRooms = [];
let currentRoomPos = { x: 0, y: 0 };
let currentMapId = null;
let currentMapName = null;
let mapCanvas = null;
let mapCtx = null;
const MAP_SIZE = 25; // 25x25 grid
const CELL_SIZE = 10; // Size of each cell in pixels

// Store connection info for coordinate transformation
let connectionInfo = null;

// Initialize map
function initializeMap(rooms, currentRoom, mapId, connInfo) {
    connectionInfo = connInfo;
    
    // Transform preview room coordinates to appear in the correct position
    mapRooms = rooms.map(room => {
        if (room.isPreview && connectionInfo) {
            // Transform preview room coordinates based on connection direction
            const offsetX = room.originalX - connectionInfo.connectedMapX;
            const offsetY = room.originalY - connectionInfo.connectedMapY;
            
            // Apply offset based on connection direction
            let transformedX = connectionInfo.currentMapX;
            let transformedY = connectionInfo.currentMapY;
            
            if (connectionInfo.direction === 'N') {
                transformedX += offsetX;
                transformedY += 1 + offsetY; // Continue north from current position
            } else if (connectionInfo.direction === 'S') {
                transformedX += offsetX;
                transformedY -= 1 + Math.abs(offsetY); // Continue south
            } else if (connectionInfo.direction === 'E') {
                transformedX += 1 + offsetX;
                transformedY += offsetY; // Continue east
            } else if (connectionInfo.direction === 'W') {
                transformedX -= 1 + Math.abs(offsetX);
                transformedY += offsetY; // Continue west
            }
            
            return {
                ...room,
                x: transformedX,
                y: transformedY,
                mapId: room.mapId // Preserve original mapId for preview rooms
            };
        }
        return room;
    });
    
    currentRoomPos = { x: currentRoom.x, y: currentRoom.y };
    currentMapId = mapId;
    
    console.log(`Map initialized: ${rooms.length} rooms, current position: (${currentRoom.x}, ${currentRoom.y}), mapId: ${mapId}`, connectionInfo);
    console.log(`Current room position: x=${currentRoomPos.x}, y=${currentRoomPos.y}, mapId=${currentMapId}`);
    console.log(`Map rooms sample:`, mapRooms.slice(0, 5).map(r => ({ x: r.x, y: r.y, mapId: r.mapId, isPreview: r.isPreview })));
    
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
    
    // Draw rooms (current map first, then preview rooms)
    mapRooms.forEach(room => {
        const isPreview = room.isPreview || false;
        const isCurrentMap = !isPreview && room.mapId === currentMapId;
        
        if (room.x >= minX && room.x <= maxX && room.y >= minY && room.y <= maxY) {
            // Flip Y coordinate (screen Y increases downward, game Y increases upward)
            // Use (maxY - room.y) to correctly invert Y-axis
            const screenX = offsetX + (room.x - minX) * CELL_SIZE;
            const screenY = offsetY + (maxY - room.y) * CELL_SIZE;
            
            // Check if this is the current room
            // For current map rooms, check exact coordinates
            // For preview rooms, we don't highlight them as current
            const isCurrentRoom = !isPreview && 
                                  room.mapId === currentMapId &&
                                  room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y;
            
            // Draw room square
            if (isCurrentRoom) {
                mapCtx.fillStyle = '#00ff00'; // Bright green for current room
            } else if (isPreview) {
                mapCtx.fillStyle = '#1a331a'; // Dimmer green for preview rooms
            } else {
                mapCtx.fillStyle = '#666'; // Grey for other rooms
            }
            mapCtx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            
            // Draw border
            if (isCurrentRoom) {
                mapCtx.strokeStyle = '#ffff00'; // Yellow border for current room
                mapCtx.lineWidth = 2;
            } else if (isPreview) {
                mapCtx.strokeStyle = '#336633'; // Dimmer green border for preview
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
            !r.isPreview && 
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
}

// Handle god mode button clicks
document.addEventListener('DOMContentLoaded', () => {
    const godModeButtons = document.querySelectorAll('.god-mode-btn');
    godModeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'map') {
                openMapEditor();
            }
            // Other actions (items, spells, craft, npc) will be implemented later
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
            else if (e.key >= '1' && e.key <= '9' && e.location === 3) { // Keypad location
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
            
            if (isGameViewVisible && !isTypingInInput && e.key >= '1' && e.key <= '9' && e.location === 3) {
                // Keypad numbers for player movement
                e.preventDefault();
                handleKeypadMovement(e.key);
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
    
    // Load current player's map if available
    if (currentMapId) {
        loadMapForEditor(currentMapId);
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
            updateSidePanel();
            renderMapEditor(); // Re-render to show red highlight
        } else {
            // Clicked empty space - create new room
            selectedRoom = { x: mapX, y: mapY, isNew: true };
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
        // Dark green if room has adjacent rooms, otherwise normal colors
        let fillColor = '#00ff00'; // Normal (green)
        let borderColor = '#ffff00'; // Yellow border
        
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
        
        // Check if room is in selected rooms array (mass selection)
        const isSelected = selectedRooms.some(r => r.id === room.id);
        
        // Highlight selected room(s)
        if (isSelected) {
            borderColor = '#ff0000'; // Red for selected
            mapEditorCtx.lineWidth = 3;
        } else if (selectedRoom && selectedRoom.id === room.id) {
            borderColor = '#ff0000'; // Red for selected
            mapEditorCtx.lineWidth = 3;
        } else {
            mapEditorCtx.lineWidth = 1;
        }
        
        // Highlight connection source room
        if (connectionSourceRoom && connectionSourceRoom.id === room.id) {
            borderColor = '#ff8800'; // Orange for connection source
            mapEditorCtx.lineWidth = 3;
        }
        
        const cellPadding = Math.max(1, scaledCellSize * 0.1);
        
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
        // Show edit room form (single room)
        sidePanel.innerHTML = `
            <h3 style="font-size: 0.9em; margin-bottom: 8px;">Edit Room</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="min-width: 60px;">X: ${selectedRoom.x}</span>
                <span>Y: ${selectedRoom.y}</span>
            </div>
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