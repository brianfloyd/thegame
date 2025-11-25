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
            break;
        case 'mapData':
            initializeMap(data.rooms, data.currentRoom);
            break;
        case 'mapUpdate':
            updateMapPosition(data.currentRoom);
            break;
        case 'error':
            addToTerminal('Error: ' + data.message, 'error');
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
    
    // Display room name
    const roomNameDiv = document.createElement('div');
    roomNameDiv.className = 'room-name';
    roomNameDiv.textContent = room.name;
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
let mapCanvas = null;
let mapCtx = null;
const MAP_SIZE = 25; // 25x25 grid
const CELL_SIZE = 8; // Size of each cell in pixels

// Initialize map
function initializeMap(rooms, currentRoom) {
    mapRooms = rooms;
    currentRoomPos = { x: currentRoom.x, y: currentRoom.y };
    
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
function updateMapPosition(newRoom) {
    currentRoomPos = { x: newRoom.x, y: newRoom.y };
    if (mapCanvas && mapCtx) {
        renderMap();
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
    
    // Draw rooms
    mapRooms.forEach(room => {
        if (room.x >= minX && room.x <= maxX && room.y >= minY && room.y <= maxY) {
            // Flip Y coordinate (screen Y increases downward, game Y increases upward)
            const screenX = offsetX + (room.x - minX) * CELL_SIZE;
            const screenY = offsetY + (maxY - room.y) * CELL_SIZE;
            
            // Check if this is the current room
            const isCurrentRoom = room.x === currentRoomPos.x && room.y === currentRoomPos.y;
            
            // Draw room square
            mapCtx.fillStyle = isCurrentRoom ? '#00ff00' : '#666';
            mapCtx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            
            // Draw border
            mapCtx.strokeStyle = isCurrentRoom ? '#ffff00' : '#333';
            mapCtx.lineWidth = isCurrentRoom ? 2 : 1;
            mapCtx.strokeRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
    });
}

// Handle window resize
window.addEventListener('resize', () => {
    if (mapCanvas && mapCtx) {
        const viewport = document.querySelector('.map-viewport');
        if (viewport) {
            mapCanvas.width = viewport.clientWidth;
            mapCanvas.height = viewport.clientHeight;
            renderMap();
        }
    }
});

// Initialize WebSocket connection when page loads
connectWebSocket();
