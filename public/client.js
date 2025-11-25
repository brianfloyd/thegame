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

// Initialize WebSocket connection when page loads
connectWebSocket();
