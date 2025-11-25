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
            addPlayerToList(data.playerName);
            break;
        case 'playerLeft':
            removePlayerFromList(data.playerName);
            break;
        case 'moved':
            updateRoomView(data.room, data.players, data.exits);
            break;
        case 'error':
            console.error('Server error:', data.message);
            alert('Error: ' + data.message);
            break;
    }
}

// Update room view with current room data
function updateRoomView(room, players, exits) {
    document.getElementById('roomName').textContent = room.name;
    document.getElementById('roomDescription').textContent = room.description;
    
    // Update players list
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';
    players.forEach(playerName => {
        if (playerName !== currentPlayerName) {
            addPlayerToList(playerName);
        }
    });

    // Update navigation buttons based on available exits
    updateNavigationButtons(exits);
}

// Add player to list
function addPlayerToList(playerName) {
    const playersList = document.getElementById('playersList');
    const li = document.createElement('li');
    li.textContent = playerName;
    li.id = `player-${playerName}`;
    playersList.appendChild(li);
}

// Remove player from list
function removePlayerFromList(playerName) {
    const playerElement = document.getElementById(`player-${playerName}`);
    if (playerElement) {
        playerElement.remove();
    }
}

// Update navigation buttons based on available exits
function updateNavigationButtons(exits) {
    const navButtons = {
        'N': document.getElementById('navNorth'),
        'S': document.getElementById('navSouth'),
        'E': document.getElementById('navEast'),
        'W': document.getElementById('navWest')
    };

    Object.keys(navButtons).forEach(direction => {
        const btn = navButtons[direction];
        const exitKey = direction === 'N' ? 'north' : 
                       direction === 'S' ? 'south' : 
                       direction === 'E' ? 'east' : 'west';
        
        if (exits[exitKey]) {
            btn.disabled = false;
            btn.classList.remove('hidden');
        } else {
            btn.disabled = true;
            btn.classList.add('hidden');
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
    document.getElementById('currentPlayerName').textContent = playerName;

    // Send player selection to server
    ws.send(JSON.stringify({
        type: 'selectPlayer',
        playerName: playerName
    }));

    // Show room view, hide player selection
    document.getElementById('playerSelection').classList.add('hidden');
    document.getElementById('roomView').classList.remove('hidden');
}

// Handle navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        
        const direction = btn.getAttribute('data-direction');
        movePlayer(direction);
    });
});

// Move player
function movePlayer(direction) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server. Please wait...');
        return;
    }

    ws.send(JSON.stringify({
        type: 'move',
        direction: direction
    }));
}

// Initialize WebSocket connection when page loads
connectWebSocket();

