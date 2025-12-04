// Build: force cache bust
let ws = null;
let currentPlayerName = null;
let currentRoomId = null; // Track current room to detect room changes

// Popup window tracking
let isPopupWindow = false;
let windowId = null;
let parentWindow = null;
let heartbeatInterval = null;

// Widget system state
const TOGGLEABLE_WIDGETS = ['stats', 'compass', 'map', 'comms', 'warehouse', 'godmode', 'scripting', 'runekeeper'];
// All widgets start off by default - empty widget panel
let activeWidgets = [];
let scriptingWidgetPosition = 'top'; // 'top' or 'bottom' - which row the scripting widget occupies
let restartRequested = false; // Track if server restart was requested
let npcWidgetVisible = false; // NPC widget is special - auto-managed
let factoryWidgetVisible = false; // Factory widget is special - auto-managed
let factoryWidgetState = { slots: [null, null], textInput: '' }; // Factory widget state
let warehouseWidgetVisible = false; // Warehouse widget visibility (toggleable)
let warehouseWidgetState = null; // Warehouse widget state
let hasWarehouseDeed = false; // Track if player has any warehouse deeds
let isInWarehouseRoom = false; // Track if player is currently in a warehouse room

// Pathing mode state
let pathingModeActive = false;
let currentPath = []; // Array of path steps: [{roomId, roomName, x, y, direction}, ...]
let pathStartRoom = null;
let pathingCursorRoom = null;

// Path/Loop execution state
let allPlayerPaths = []; // All paths/loops for the player
let selectedPathId = null; // Currently selected path/loop
let isPathExecuting = false; // Execution state
let isPathPaused = false; // Paused state (stopped mid-execution)
let pausedPathRoomId = null; // Room ID where path was paused
let pathPreviewData = null; // Preview route data

// Communication widget state
let commMode = 'talk'; // 'talk', 'resonate', 'telepath'
let commHistory = {
    talk: [],
    resonate: [],
    telepath: []
};
let commTargetPlayer = null; // For telepathy mode

// Idle auto-look system
let lastInteractionTime = Date.now(); // Track last keypad/command line interaction
let idleLookInterval = null; // Interval for checking idle time
const IDLE_LOOK_DELAY = 30000; // 30 seconds of inactivity before auto-look

// Load Rune Keeper ASCII art (reloads each time widget is shown)
function loadRuneKeeperArt() {
    const contentDiv = document.getElementById('runekeeperContent');
    if (!contentDiv) {
        console.error('Rune Keeper content div not found');
        return;
    }
    
    // Always reload the file with cache-busting timestamp
    const cacheBuster = `?t=${Date.now()}`;
    const url = `/ascii-images/runekeeper.txt${cacheBuster}`;
    console.log('Loading Rune Keeper art from:', url);
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(text => {
            if (!text || text.trim() === '') {
                throw new Error('File is empty');
            }
            
            // Center the ASCII art by finding the longest line and padding all lines
            const lines = text.split('\n');
            // Filter out completely empty lines for maxLength calculation
            const nonEmptyLines = lines.filter(line => line.trimEnd().length > 0);
            if (nonEmptyLines.length === 0) {
                throw new Error('No content in file');
            }
            
            // Find the longest line (excluding trailing whitespace)
            const maxLength = Math.max(...nonEmptyLines.map(line => line.trimEnd().length));
            
            // Center each line by padding it
            const centeredLines = lines.map(line => {
                const trimmed = line.trimEnd();
                if (trimmed.length === 0) return '';
                const padding = Math.max(0, Math.floor((maxLength - trimmed.length) / 2));
                return ' '.repeat(padding) + trimmed;
            });
            
            contentDiv.textContent = centeredLines.join('\n');
            console.log('Rune Keeper art loaded successfully');
        })
        .catch(error => {
            console.error('Error loading Rune Keeper art:', error);
            contentDiv.textContent = `Error loading ASCII art: ${error.message}`;
        });
}

// Load comms history from localStorage
function loadCommsHistory() {
    if (!currentPlayerName) return;
    
    try {
        const stored = localStorage.getItem(`comms_history_${currentPlayerName}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with existing (in case we already have some messages)
            commHistory.talk = parsed.talk || [];
            commHistory.resonate = parsed.resonate || [];
            commHistory.telepath = parsed.telepath || [];
            
            // Keep only last 100 per channel
            if (commHistory.talk.length > 100) commHistory.talk = commHistory.talk.slice(-100);
            if (commHistory.resonate.length > 100) commHistory.resonate = commHistory.resonate.slice(-100);
            if (commHistory.telepath.length > 100) commHistory.telepath = commHistory.telepath.slice(-100);
            
            // Re-render if widget is visible
            if (commMode) {
                renderCommHistory();
            }
        }
    } catch (e) {
        console.error('Failed to load comms history:', e);
    }
}

// Save comms history to localStorage
function saveCommsHistory() {
    if (!currentPlayerName) return;
    
    try {
        localStorage.setItem(`comms_history_${currentPlayerName}`, JSON.stringify(commHistory));
    } catch (e) {
        console.error('Failed to save comms history:', e);
    }
}

// Generate unique tab ID for this browser window/tab
// This ensures each tab has its own independent session
let tabId = sessionStorage.getItem('gameTabId');
if (!tabId) {
    tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('gameTabId', tabId);
}

// Override fetch to include tab ID in all requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const [url, options = {}] = args;
    if (!options.headers) {
        options.headers = {};
    }
    if (options.headers instanceof Headers) {
        options.headers.set('X-Tab-ID', tabId);
    } else if (typeof options.headers === 'object') {
        options.headers['X-Tab-ID'] = tabId;
    }
    return originalFetch.apply(this, args);
};

// Get protocol (ws or wss) based on current page protocol
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

// Connect to WebSocket server
// Initialize popup detection and communication
(function initPopupDetection() {
    // Check if opened as popup
    const urlParams = new URLSearchParams(window.location.search);
    const isPopup = urlParams.get('popup') === 'true';
    const popupWindowId = urlParams.get('windowId');
    const popupPlayerName = urlParams.get('playerName');
    
    if (isPopup && window.opener) {
        isPopupWindow = true;
        windowId = popupWindowId;
        parentWindow = window.opener;
        
        // Notify parent that window is open
        parentWindow.postMessage({
            type: 'WINDOW_OPENED',
            playerName: popupPlayerName,
            windowId: windowId
        }, window.location.origin);
        
        // Set up heartbeat
        heartbeatInterval = setInterval(() => {
            if (parentWindow && !parentWindow.closed) {
                parentWindow.postMessage({
                    type: 'WINDOW_HEARTBEAT',
                    playerName: popupPlayerName,
                    windowId: windowId
                }, window.location.origin);
            } else {
                // Parent window closed, stop heartbeat
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }
            }
        }, 2000); // Send heartbeat every 2 seconds
        
        // Listen for close requests from parent
        window.addEventListener('message', (event) => {
            // Security: Only accept messages from same origin
            if (event.origin !== window.location.origin) {
                return;
            }
            
            const { type, playerName: msgPlayerName } = event.data;
            
            if (type === 'WINDOW_CLOSE_REQUEST' && msgPlayerName === popupPlayerName) {
                // Parent requested close - close this window
                window.close();
            }
        });
        
        // Notify parent when window is closing
        window.addEventListener('beforeunload', () => {
            if (parentWindow && !parentWindow.closed) {
                parentWindow.postMessage({
                    type: 'WINDOW_CLOSED',
                    playerName: popupPlayerName,
                    windowId: windowId
                }, window.location.origin);
            }
            
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
        });
        
        // Handle focus/blur events
        window.addEventListener('focus', () => {
            if (parentWindow && !parentWindow.closed) {
                parentWindow.postMessage({
                    type: 'WINDOW_HEARTBEAT',
                    playerName: popupPlayerName,
                    windowId: windowId
                }, window.location.origin);
            }
        });
        
        window.addEventListener('blur', () => {
            if (parentWindow && !parentWindow.closed) {
                parentWindow.postMessage({
                    type: 'WINDOW_HEARTBEAT',
                    playerName: popupPlayerName,
                    windowId: windowId
                }, window.location.origin);
            }
        });
    }
})();

function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        
        // Authenticate with session
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'authenticateSession',
                windowId: windowId || null
            }));
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
        
        // Stop idle look timer on disconnect
        stopIdleLookTimer();
        
        // If restart was requested, redirect to character selection
        if (restartRequested) {
            restartRequested = false; // Clear flag
            window.location.href = '/';
            return;
        }
        
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
}

// Handle messages from server
function handleMessage(data) {
    switch (data.type) {
        case 'widgetConfig':
            // Load saved widget configuration
            if (data.config) {
                console.log('Loading widget config:', data.config);
                // Ensure activeWidgets is an array
                if (data.config.activeWidgets && Array.isArray(data.config.activeWidgets)) {
                    activeWidgets = data.config.activeWidgets;
                } else {
                    console.log('activeWidgets is not a valid array, resetting to empty');
                    activeWidgets = [];
                }
                if (data.config.scriptingWidgetPosition) {
                    scriptingWidgetPosition = data.config.scriptingWidgetPosition;
                } else {
                    scriptingWidgetPosition = 'top';
                }
                console.log('Applied widget config - activeWidgets:', activeWidgets, 'scriptingWidgetPosition:', scriptingWidgetPosition);
                updateWidgetDisplay();
            }
            break;
        case 'widgetConfigUpdated':
            // Config was saved successfully
            break;
        case 'pathingModeStarted':
            // Pathing mode started, room data received
            break;
        case 'pathStepAdded':
            // Server confirmed path step addition (not used in simplified version, but keep for compatibility)
            // Path steps are now added directly client-side using existing rooms
            break;
        case 'pathingRoom':
            // Server returned a room from a different map for pathing
            if (data.room && pathingModeActive) {
                console.log(`Pathing: Received pathingRoom response - room ${data.room.id} (${data.room.x}, ${data.room.y}) on map ${data.room.mapId}`);
                
                // Add the room to mapRooms if it's not already there
                const roomExists = mapRooms.some(r => r.id === data.room.id);
                if (!roomExists) {
                    mapRooms.push(data.room);
                    console.log(`Pathing: Added room ${data.room.id} to mapRooms`);
                }
                
                // Update current map if we've moved to a different map
                // Request full map data for the new map to load all rooms
                const currentPathingMapId = pathingCursorRoom && pathingCursorRoom.mapId ? pathingCursorRoom.mapId : currentMapId;
                if (data.room.mapId !== currentPathingMapId) {
                    console.log(`Pathing: Switching maps from ${currentPathingMapId} to ${data.room.mapId}`);
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'getMapData', mapId: data.room.mapId }));
                        // Note: mapData handler will update currentMapId and re-render
                        // We'll add the step after the map loads
                        // Store pending step for when map loads
                        window.pendingPathingStep = {
                            room: data.room,
                            direction: data.direction || 'CONNECTION'
                        };
                        return;
                    }
                }
                
                // Add the room to the path (same map, or map data already loaded)
                const direction = data.direction || 'CONNECTION';
                console.log(`Pathing: Adding room ${data.room.id} to path with direction ${direction}`);
                addPathStep(data.room, direction);
            }
            break;
        case 'pathSaved':
            // Path was saved successfully
            const pathTypeLabel = data.pathType === 'loop' ? 'Loop' : 'Path';
            addToTerminal(`${pathTypeLabel} "${data.name}" saved successfully!`, 'success');
            exitPathingMode();
            // Reload paths list
            if (activeWidgets.includes('scripting')) {
                loadAllPlayerPaths();
            }
            break;
        case 'allPlayerPaths':
            // Store all paths/loops
            allPlayerPaths = data.paths || [];
            populatePathDropdown();
            break;
        case 'pathDetails':
            // Path details received for preview
            if (data.path && data.steps) {
                calculatePathPreview(data.path, data.steps);
            }
            break;
        case 'pathExecutionStarted':
            // Path/Loop execution started
            isPathExecuting = true;
            isPathPaused = false;
            pausedPathRoomId = null;
            addToTerminal(data.message || 'Path/Loop execution started.', 'success');
            updatePathExecutionUI();
            // Close preview dialog if open
            const previewDialog = document.getElementById('pathPreviewDialog');
            if (previewDialog) {
                previewDialog.style.display = 'none';
            }
            break;
        case 'pathExecutionResumed':
            // Path/Loop execution resumed (from continue)
            isPathExecuting = true;
            isPathPaused = false;
            pausedPathRoomId = null;
            addToTerminal(data.message || 'Path/Loop execution resumed.', 'success');
            updatePathExecutionUI();
            break;
        case 'pathExecutionComplete':
            // Path execution completed (paths only, loops don't complete)
            isPathExecuting = false;
            addToTerminal(data.message || 'Path execution complete!', 'success');
            updatePathExecutionUI();
            break;
        case 'pathExecutionStopped':
            // Path/Loop execution stopped
            isPathExecuting = false;
            addToTerminal(data.message || 'Path/Loop execution stopped.', 'info');
            updatePathExecutionUI();
            break;
        case 'pathExecutionFailed':
            // Path/Loop execution failed
            isPathExecuting = false;
            addToTerminal(data.message || 'Path/Loop execution failed.', 'error');
            updatePathExecutionUI();
            break;
        case 'pathingCancelled':
            // Pathing was cancelled
            break;
        case 'roomUpdate':
            // Start idle look timer when player enters game (first room update)
            if (currentPlayerName && !idleLookInterval) {
                startIdleLookTimer();
            }
            updateRoomView(data.room, data.players, data.exits, data.npcs, data.roomItems, data.showFullInfo, data.messages);
            // Check if path is paused and player has moved to a different room
            if (isPathPaused && pausedPathRoomId && data.room) {
                if (data.room.id !== pausedPathRoomId) {
                    // Player has moved from paused room - clear pause state
                    isPathPaused = false;
                    pausedPathRoomId = null;
                    updatePathExecutionUI();
                }
            }
            // Track if we're in a warehouse room
            isInWarehouseRoom = data.room.roomType === 'warehouse';
            // Handle factory widget state
            if (data.factoryWidgetState !== undefined) {
                if (data.room.roomType === 'factory') {
                    factoryWidgetState = data.factoryWidgetState;
                    showFactoryWidget(factoryWidgetState);
                } else {
                    hideFactoryWidget();
                }
            }
            // Handle warehouse widget state (only if widget is toggled on)
            if (data.hasWarehouseDeed !== undefined) {
                hasWarehouseDeed = data.hasWarehouseDeed;
                updateWidgetDisplay(); // Update icon visibility
            }
            if (data.warehouseWidgetState !== undefined && activeWidgets.includes('warehouse')) {
                // Always show warehouse widget state if provided (view-only when not in warehouse room)
                if (data.warehouseWidgetState !== null) {
                    warehouseWidgetState = data.warehouseWidgetState;
                    updateWarehouseWidget(warehouseWidgetState);
                } else {
                    // No state - show empty
                    updateWarehouseWidget(null);
                }
            }
            break;
        case 'inventoryList':
            displayInventory(data.items);
            // Check if player has warehouse deeds
            if (data.hasWarehouseDeed !== undefined) {
                hasWarehouseDeed = data.hasWarehouseDeed;
                updateWidgetDisplay(); // Update icon visibility
            }
            break;
        case 'playerJoined':
            addPlayerToTerminal(data.playerName, data.direction, data.message);
            break;
        case 'playerLeft':
            removePlayerFromTerminal(data.playerName, data.direction, data.message);
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
        case 'loreKeeperMessage':
            displayLoreKeeperMessage(data.npcName, data.npcColor, data.message, data.messageColor, data.isSuccess, data.isFailure, data.keywordColor);
            // Add to talk history in comms widget (Lore Keepers participate in room conversation)
            // Pass the full message with <> markers and colors for styling
            addToCommHistory('talk', data.npcName, data.message, true, null, {
                isLoreKeeper: true,
                npcColor: data.npcColor,
                messageColor: data.messageColor,
                keywordColor: data.keywordColor,
                isSuccess: data.isSuccess,
                isFailure: data.isFailure
            });
            break;
        case 'moved':
            updateRoomView(data.room, data.players, data.exits, data.npcs, data.roomItems, data.showFullInfo, data.messages);
            // Track if we're in a warehouse room
            isInWarehouseRoom = data.room.roomType === 'warehouse';
            // Handle factory widget state
            if (data.factoryWidgetState !== undefined) {
                if (data.room.roomType === 'factory') {
                    factoryWidgetState = data.factoryWidgetState;
                    showFactoryWidget(factoryWidgetState);
                } else {
                    hideFactoryWidget();
                }
            }
            // Handle warehouse widget state (only if widget is toggled on)
            if (data.hasWarehouseDeed !== undefined) {
                hasWarehouseDeed = data.hasWarehouseDeed;
                updateWidgetDisplay(); // Update icon visibility
            }
            if (data.warehouseWidgetState !== undefined && activeWidgets.includes('warehouse')) {
                // Always show warehouse widget state if provided (view-only when not in warehouse room)
                if (data.warehouseWidgetState !== null) {
                    warehouseWidgetState = data.warehouseWidgetState;
                    updateWarehouseWidget(warehouseWidgetState);
                } else {
                    // No state - show empty
                    updateWarehouseWidget(null);
                }
            }
            break;
        case 'playerStats':
            updatePlayerStats(data.stats);
            // Set current player name and update page title
            if (data.stats.playerName) {
                const previousPlayerName = currentPlayerName;
                currentPlayerName = data.stats.playerName;
                document.title = `The Game - ${data.stats.playerName}`;
                
                // Load comms history for this player if name changed
                if (previousPlayerName !== currentPlayerName) {
                    loadCommsHistory();
                }
            }
            // godMode is returned as an object with .value property from dynamic stats system
            if (data.stats.godMode !== undefined) {
                updateGodModeUI(data.stats.godMode.value === true);
            }
            break;
        case 'mapData':
            // In pathing mode, merge rooms instead of replacing (for cross-map pathing)
            if (pathingModeActive) {
                // Merge new rooms into mapRooms instead of replacing
                // Also update existing rooms with connection fields if they're missing
                data.rooms.forEach(newRoom => {
                    const existingRoomIndex = mapRooms.findIndex(r => r.id === newRoom.id);
                    if (existingRoomIndex >= 0) {
                        // Update existing room with connection fields if they're missing or if new data has them
                        const existingRoom = mapRooms[existingRoomIndex];
                        if (!existingRoom.connection_direction && newRoom.connection_direction) {
                            existingRoom.connection_direction = newRoom.connection_direction;
                        }
                        if (!existingRoom.connected_room_x && newRoom.connected_room_x !== null && newRoom.connected_room_x !== undefined) {
                            existingRoom.connected_room_x = newRoom.connected_room_x;
                        }
                        if (!existingRoom.connected_room_y && newRoom.connected_room_y !== null && newRoom.connected_room_y !== undefined) {
                            existingRoom.connected_room_y = newRoom.connected_room_y;
                        }
                        if (!existingRoom.connected_map_id && newRoom.connected_map_id !== null && newRoom.connected_map_id !== undefined) {
                            existingRoom.connected_map_id = newRoom.connected_map_id;
                        }
                    } else {
                        // New room, add it
                        mapRooms.push(newRoom);
                    }
                });
                // Update current map ID
                currentMapId = data.mapId;
                // If there's a pending pathing step, add it now
                if (window.pendingPathingStep) {
                    const step = window.pendingPathingStep;
                    window.pendingPathingStep = null;
                    addPathStep(step.room, step.direction);
                }
                // Re-render map
                renderMap();
            } else {
                // Normal mode - replace rooms
                initializeMap(data.rooms, data.currentRoom, data.mapId, data.roomTypeColors);
            }
            // If map widget is visible, ensure it renders
            if (activeWidgets.includes('map') && mapCanvas && mainMapRenderer) {
                requestAnimationFrame(() => {
                    const viewport = document.querySelector('.map-viewport');
                    if (viewport && mapCanvas) {
                        const newWidth = viewport.clientWidth;
                        const newHeight = viewport.clientHeight;
                        if (newWidth > 0 && newHeight > 0) {
                            mapCanvas.width = newWidth;
                            mapCanvas.height = newHeight;
                            mainMapRenderer.canvas = mapCanvas;
                            mainMapRenderer.ctx = mapCtx;
                            renderMap();
                        }
                    }
                });
            }
            break;
        case 'mapUpdate':
            updateMapPosition(data.currentRoom, data.mapId);
            break;
        case 'warehouseWidgetState':
            warehouseWidgetState = data.state;
            updateWarehouseWidget(warehouseWidgetState);
            break;
        case 'terminalHistory':
            // Load persisted terminal history
            if (data.messages && Array.isArray(data.messages)) {
                const terminalContent = document.getElementById('terminalContent');
                if (terminalContent) {
                    // Clear existing content first
                    terminalContent.innerHTML = '';
                    
                    // Add separator to indicate history
                    const separator = document.createElement('div');
                    separator.className = 'terminal-separator';
                    separator.textContent = '─'.repeat(40);
                    separator.style.color = '#666';
                    separator.style.fontStyle = 'italic';
                    terminalContent.appendChild(separator);
                    
                    const historyLabel = document.createElement('div');
                    historyLabel.className = 'info-message';
                    historyLabel.style.color = '#666';
                    historyLabel.style.fontStyle = 'italic';
                    historyLabel.textContent = 'Previous session history:';
                    terminalContent.appendChild(historyLabel);
                    
                    // Add all history messages
                    data.messages.forEach(msg => {
                        const msgDiv = document.createElement('div');
                        msgDiv.className = msg.type === 'error' ? 'error-message' : 'info-message';
                        if (msg.html) {
                            msgDiv.innerHTML = msg.html;
                        } else {
                            msgDiv.textContent = msg.text;
                        }
                        terminalContent.appendChild(msgDiv);
                    });
                    
                    // Add separator after history
                    const separatorAfter = document.createElement('div');
                    separatorAfter.className = 'terminal-separator';
                    separatorAfter.textContent = '─'.repeat(40);
                    separatorAfter.style.color = '#666';
                    separatorAfter.style.fontStyle = 'italic';
                    terminalContent.appendChild(separatorAfter);
                    
                    terminalContent.scrollTop = terminalContent.scrollHeight;
                }
            }
            break;
        case 'forceClose':
            // Another session has connected - close this window
            console.log('Force close requested:', data.message);
            // Display message briefly before closing
            if (data.message) {
                const terminalContent = document.getElementById('terminalContent');
                if (terminalContent) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message';
                    errorDiv.style.color = '#ff0000';
                    errorDiv.style.fontWeight = 'bold';
                    errorDiv.style.padding = '10px';
                    errorDiv.style.margin = '10px 0';
                    errorDiv.textContent = data.message;
                    terminalContent.appendChild(errorDiv);
                    terminalContent.scrollTop = terminalContent.scrollHeight;
                }
            }
            // Close the window after a brief delay to show the message
            if (isPopupWindow) {
                setTimeout(() => {
                    window.close();
                }, 1000);
            } else {
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            }
            break;
        case 'error':
            if (data.message) {
                addToTerminal(data.message, 'error');
            }
            break;
        case 'error':
            addToTerminal(data.message, 'error');
            break;
        case 'message':
            if (data.message) {
                if (data.html) {
                    // Support HTML formatting for messages
                    const terminalContent = document.getElementById('terminalContent');
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'info-message';
                    // Check if message contains HTML table (like who command) - don't parse markup for those
                    const isHtmlTable = data.message.includes('<table') || data.message.includes('<div class="who-list">');
                    if (isHtmlTable) {
                        // Direct HTML insertion for tables (who command, etc.)
                        msgDiv.innerHTML = data.message;
                    } else if (typeof parseMarkup !== 'undefined') {
                        // Apply markup parsing for other HTML messages (NPC descriptions, room descriptions, etc.)
                        msgDiv.innerHTML = parseMarkup(data.message, '#00ffff');
                    } else {
                        msgDiv.innerHTML = data.message;
                    }
                    terminalContent.appendChild(msgDiv);
                    terminalContent.scrollTop = terminalContent.scrollHeight;
                    
                    // Save HTML message to history
                    if (currentPlayerName && ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'saveTerminalMessage',
                            message: data.message,
                            messageType: 'info',
                            messageHtml: msgDiv.innerHTML
                        }));
                    }
                } else {
                    // Apply markup parsing to plain text messages too
                    if (typeof parseMarkup !== 'undefined') {
                        const terminalContent = document.getElementById('terminalContent');
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'info-message';
                        msgDiv.innerHTML = parseMarkup(data.message, '#00ffff');
                        terminalContent.appendChild(msgDiv);
                        terminalContent.scrollTop = terminalContent.scrollHeight;
                        
                        // Save plain text message to history too
                        if (currentPlayerName && ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'saveTerminalMessage',
                                message: data.message,
                                messageType: 'info',
                                messageHtml: msgDiv.innerHTML
                            }));
                        }
                    } else {
                        addToTerminal(data.message, 'info');
                    }
                }
            }
            break;
        case 'merchantList':
            displayMerchantList(data.items);
            break;
        case 'jumpMaps':
            populateJumpMaps(data.maps);
            break;
        case 'jumpRooms':
            populateJumpRooms(data.rooms);
            break;
        case 'autoPathMaps':
            populateAutoPathMaps(data.maps);
            break;
        case 'autoPathRooms':
            populateAutoPathRooms(data.rooms);
            break;
        case 'autoPathCalculated':
            if (data.success && data.path) {
                autoNavigationPath = data.path;
                displayAutoPathSummary(data.path);
                
                // Check if this was for path preview
                if (window.pendingPathPreview) {
                    const pending = window.pendingPathPreview;
                    window.pendingPathPreview = null;
                    
                    // Convert auto-path to algorithm rooms format
                    // Path structure: { roomId, direction, roomName, mapId, mapName }
                    const algorithmRooms = data.path.map(step => ({
                        roomId: step.roomId,
                        roomName: step.roomName || 'Unknown',
                        x: step.x || null,
                        y: step.y || null,
                        direction: step.direction,
                        mapId: step.mapId,
                        mapName: step.mapName || `Map ${step.mapId}`
                    }));
                    
                    showPathPreview({
                        algorithmRooms: algorithmRooms,
                        playerRooms: pending.playerRooms,
                        path: pending.path
                    });
                }
            } else {
                addToTerminal(data.message || 'Failed to calculate path', 'error');
                if (window.pendingPathPreview) {
                    window.pendingPathPreview = null;
                }
            }
            break;
        case 'autoNavigationStarted':
            isAutoNavigating = true;
            updateCompassButtonsState();
            if (data.message) {
                addToTerminal(data.message, 'info');
            }
            break;
        case 'autoNavigationComplete':
            isAutoNavigating = false;
            autoNavigationPath = null;
            updateCompassButtonsState();
            if (data.message) {
                addToTerminal(data.message, 'info');
            }
            break;
        case 'autoNavigationFailed':
            isAutoNavigating = false;
            autoNavigationPath = null;
            updateCompassButtonsState();
            if (data.message) {
                addToTerminal(data.message, 'error');
            }
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
                // Use the room object we just added to editorMapRooms
                // It's the last item in the array since we just pushed it
                const createdRoom = editorMapRooms[editorMapRooms.length - 1];
                // Set selection - use the room from the array to ensure same reference
                selectedRoom = createdRoom;
                selectedRooms = [createdRoom];
                // Keep speed mode active so user can continue navigating
                speedModeActive = true;
                // Force update to ensure selection is visible
                updateSidePanel();
                // Render immediately - the room is already in editorMapRooms
                renderMapEditor();
            } else {
                selectedRoom = null;
                selectedRooms = [];
                updateSidePanel();
                renderMapEditor();
            }
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
                // Set to current player's map if available and load it
                if (currentMapId) {
                    selector.value = currentMapId;
                    // If map editor is open, load the current map
                    if (mapEditor && !mapEditor.classList.contains('hidden')) {
                        loadMapForEditor(currentMapId);
                    }
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
    { name: 'who', abbrev: null, description: 'Show all players currently in the world', category: 'Information' },
    { name: 'help', abbrev: '?', description: 'Show available commands', category: 'Information' },
    
    // Item commands
    { name: 'take', abbrev: 't, get, pickup', description: 'Pick up an item (take <item>)', category: 'Items' },
    { name: 'drop', abbrev: null, description: 'Drop an item (drop <item>)', category: 'Items' },
    
    // Warehouse commands
    { name: 'warehouse', abbrev: 'wh', description: 'Open warehouse widget (if in warehouse room)', category: 'Warehouse' },
    { name: 'store', abbrev: 'st', description: 'Store item to warehouse (store <item> [quantity])', category: 'Warehouse' },
    { name: 'withdraw', abbrev: 'wd', description: 'Withdraw item from warehouse (withdraw <item> [quantity])', category: 'Warehouse' },
    
    // Merchant commands
    { name: 'list', abbrev: 'li, ls', description: 'List items for sale (merchant rooms only)', category: 'Merchant' },
    { name: 'buy', abbrev: 'b', description: 'Buy item from merchant (buy <item> [quantity])', category: 'Merchant' },
    { name: 'sell', abbrev: 's [item]', description: 'Sell item to merchant (sell <item> [quantity] or s <item> [quantity])', category: 'Merchant' },
    
    // Bank commands
    { name: 'deposit', abbrev: 'dep', description: 'Deposit currency to bank (deposit <quantity|all> <currency>)', category: 'Bank' },
    { name: 'balance', abbrev: 'bal', description: 'Check bank balance (bank rooms only)', category: 'Bank' },
    { name: 'wealth', abbrev: null, description: 'Show total wealth in Glimmer shards (wallet + bank)', category: 'Bank' },
    
    // NPC interaction commands
    { name: 'harvest', abbrev: 'h/p', description: 'Harvest from NPC (harvest <npc>)', category: 'NPC' },
    { name: 'collect', abbrev: 'c', description: 'Alias for harvest', category: 'NPC' },
    { name: 'gather', abbrev: 'g', description: 'Alias for harvest', category: 'NPC' },
    
    // Lore Keeper interaction commands
    { name: 'solve', abbrev: 'sol', description: 'Attempt puzzle solution (solve <npc> <answer>)', category: 'Lore Keeper' },
    { name: 'clue', abbrev: 'cl', description: 'Get puzzle clue from NPC (clue <npc>)', category: 'Lore Keeper' },
    { name: 'greet', abbrev: 'gr, hello, hi', description: 'Greet a Lore Keeper NPC (greet <npc>)', category: 'Lore Keeper' },
    
    // Communication commands
    { name: 'talk', abbrev: 'say, t', description: 'Talk to players in room (talk <message>)', category: 'Communication' },
    { name: 'ask', abbrev: null, description: 'Ask NPC a question (ask <npc> <question>)', category: 'Communication' },
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
    
    // Create table
    const table = document.createElement('table');
    table.className = 'help-table';
    
    // Create table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headerCommand = document.createElement('th');
    headerCommand.textContent = 'Command';
    headerCommand.className = 'help-table-header';
    const headerDescription = document.createElement('th');
    headerDescription.textContent = 'Description';
    headerDescription.className = 'help-table-header';
    headerRow.appendChild(headerCommand);
    headerRow.appendChild(headerDescription);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create table body
    const tbody = document.createElement('tbody');
    
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
        // Category header row
        const categoryRow = document.createElement('tr');
        const categoryCell = document.createElement('td');
        categoryCell.colSpan = 2;
        categoryCell.className = 'help-category';
        categoryCell.textContent = `[${category}]`;
        categoryRow.appendChild(categoryCell);
        tbody.appendChild(categoryRow);
        
        // Commands in this category
        commands.forEach(cmd => {
            const cmdRow = document.createElement('tr');
            cmdRow.className = 'help-command-row';
            
            // Command name cell
            const cmdNameCell = document.createElement('td');
            cmdNameCell.className = 'help-cmd-name-cell';
            const abbrevStr = cmd.abbrev ? ` (${cmd.abbrev})` : '';
            cmdNameCell.innerHTML = `<span class="help-cmd-name">${cmd.name}${abbrevStr}</span>`;
            
            // Description cell
            const descCell = document.createElement('td');
            descCell.className = 'help-cmd-desc-cell';
            descCell.textContent = cmd.description;
            
            cmdRow.appendChild(cmdNameCell);
            cmdRow.appendChild(descCell);
            tbody.appendChild(cmdRow);
        });
    }
    
    table.appendChild(tbody);
    helpDiv.appendChild(table);
    
    terminalContent.appendChild(helpDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Display merchant list in terminal
function displayMerchantList(items) {
    const terminalContent = document.getElementById('terminalContent');
    
    // Create merchant list container
    const listDiv = document.createElement('div');
    listDiv.className = 'merchant-list-section';
    
    // Header
    const header = document.createElement('div');
    header.className = 'merchant-list-header';
    header.textContent = 'Merchant Inventory:';
    listDiv.appendChild(header);
    
    // Create table
    const table = document.createElement('table');
    table.className = 'merchant-list-table';
    
    // Table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thItem = document.createElement('th');
    thItem.textContent = 'Item';
    const thQty = document.createElement('th');
    thQty.textContent = 'Qty';
    const thPrice = document.createElement('th');
    thPrice.textContent = 'Price';
    headerRow.appendChild(thItem);
    headerRow.appendChild(thQty);
    headerRow.appendChild(thPrice);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    items.forEach(item => {
        const row = document.createElement('tr');
        if (!item.inStock) {
            row.className = 'out-of-stock';
        }
        
        const tdName = document.createElement('td');
        tdName.textContent = item.name;
        
        const tdQty = document.createElement('td');
        tdQty.textContent = item.quantity;
        tdQty.className = 'merchant-qty';
        
        const tdPrice = document.createElement('td');
        tdPrice.textContent = item.price > 0 ? `${item.price} gold` : 'Free';
        tdPrice.className = 'merchant-price';
        if (!item.inStock) {
            tdPrice.textContent += ' (out of stock)';
        }
        
        row.appendChild(tdName);
        row.appendChild(tdQty);
        row.appendChild(tdPrice);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    listDiv.appendChild(table);
    
    terminalContent.appendChild(listDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Normalize command input (uses first word only)
// Returns null if command has additional parts (not a pure direction)
function normalizeCommand(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);
    const key = parts[0].toLowerCase();
    
    // Guardrail: If there are additional parts after a directional command,
    // don't treat it as a direction - let it fall through to other command handlers
    if (parts.length > 1) {
        // Check if this is a directional command
        const direction = commandMap[key];
        if (direction) {
            // This is a directional command with additional text - don't treat as direction
            return null;
        }
    }
    
    return commandMap[key] || null;
}

// Update room view in terminal - called on room updates
// Only shows full room info when entering a new room
function updateRoomView(room, players, exits, npcs, roomItems, forceFullDisplay = false, messages = null) {
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
            saveTerminalContentToHistory('─'.repeat(40), 'info');
        }
        
        // Display room name with map name prefix
        const roomNameDiv = document.createElement('div');
        roomNameDiv.className = 'room-name';
        const displayName = room.mapName ? `${room.mapName}, ${room.name}` : room.name;
        roomNameDiv.textContent = displayName;
        terminalContent.appendChild(roomNameDiv);
        saveTerminalContentToHistory(displayName, 'info');
        
        // Display room description (with markup parsing)
        const roomDescDiv = document.createElement('div');
        roomDescDiv.className = 'room-description';
        if (typeof parseMarkup !== 'undefined' && room.description) {
            // Apply markup parsing to room description
            roomDescDiv.innerHTML = parseMarkup(room.description, '#00ffff');
        } else {
            roomDescDiv.textContent = room.description;
        }
        terminalContent.appendChild(roomDescDiv);
        saveTerminalContentToHistory(room.description, 'info');
        
        // Display players and NPCs combined (using formatted message from server)
        if (messages && messages.alsoHere) {
            const alsoHereDiv = document.createElement('div');
            alsoHereDiv.className = 'players-section';
            const alsoHereLine = document.createElement('span');
            alsoHereLine.className = 'players-line';
            
            // Parse markup and set innerHTML first
            if (typeof parseMarkup !== 'undefined') {
                alsoHereLine.innerHTML = parseMarkup(messages.alsoHere, '#00ffff');
            } else {
                alsoHereLine.textContent = messages.alsoHere;
            }
            
            // Add click handlers for player names by replacing them in the parsed HTML
            // Do this carefully to preserve the message structure
            const otherPlayers = players ? players.filter(p => p !== currentPlayerName) : [];
            otherPlayers.forEach(playerName => {
                // Find all text nodes and replace player names with clickable spans
                const walker = document.createTreeWalker(alsoHereLine, NodeFilter.SHOW_TEXT);
                const nodesToProcess = [];
                let node;
                while (node = walker.nextNode()) {
                    // Only process if the text contains the player name as a whole word
                    // and the parent is not already a player-item
                    const parent = node.parentNode;
                    if (parent && !parent.classList.contains('player-item') && 
                        !parent.querySelector(`[data-player="${playerName}"]`) &&
                        new RegExp(`\\b${playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(node.textContent)) {
                        nodesToProcess.push(node);
                    }
                }
                
                // Process each text node
                nodesToProcess.forEach(textNode => {
                    const text = textNode.textContent;
                    const regex = new RegExp(`\\b(${playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'g');
                    if (!regex.test(text)) return;
                    
                    const parent = textNode.parentNode;
                    if (!parent) return;
                    
                    // Split text by player name and create fragments
                    const parts = text.split(regex);
                    const fragment = document.createDocumentFragment();
                    
                    for (let i = 0; i < parts.length; i++) {
                        if (parts[i] === playerName) {
                            // Create clickable player span
                            const playerSpan = document.createElement('span');
                            playerSpan.className = 'player-item';
                            playerSpan.setAttribute('data-player', playerName);
                            playerSpan.textContent = playerName;
                            fragment.appendChild(playerSpan);
                        } else if (parts[i]) {
                            // Add text node
                            fragment.appendChild(document.createTextNode(parts[i]));
                        }
                    }
                    
                    // Replace the original text node with the fragment
                    parent.replaceChild(fragment, textNode);
                });
            });
            
            alsoHereDiv.appendChild(alsoHereLine);
            terminalContent.appendChild(alsoHereDiv);
            saveTerminalContentToHistory(messages.alsoHere, 'info');
        } else {
            // Fallback to old logic if messages not available
            const otherPlayers = players ? players.filter(p => p !== currentPlayerName) : [];
            const playersDiv = document.createElement('div');
            playersDiv.className = 'players-section';
            const playersLine = document.createElement('span');
            playersLine.className = 'players-line';
            
            // Combine players and NPCs
            // Use server-formatted message if available (includes proper comma formatting and markup)
            if (messages && messages.alsoHere) {
                // Server already formatted it with commas and markup
                if (typeof parseMarkup !== 'undefined') {
                    playersLine.innerHTML = `<span class="players-section-title">Also here:</span> ${parseMarkup(messages.alsoHere.replace('Also here: ', ''), '#00ffff')}`;
                } else {
                    playersLine.innerHTML = `<span class="players-section-title">Also here:</span> ${messages.alsoHere.replace('Also here: ', '')}`;
                }
                saveTerminalContentToHistory(messages.alsoHere, 'info');
            } else {
                // Fallback: format manually (shouldn't happen if server sends messages.alsoHere)
                const combinedEntities = [];
                otherPlayers.forEach(p => combinedEntities.push(p));
                if (npcs && npcs.length > 0) {
                    npcs.forEach(npc => {
                        let npcDisplay = npc.name;
                        // Use status messages from NPC data if available
                        if (npc.state && typeof npc.state === 'object') {
                            const cycles = npc.state.cycles || 0;
                            let statusMessage = '';
                            if (cycles === 0) {
                                statusMessage = npc.statusMessageIdle || '(idle)';
                            } else if (npc.state.harvest_active || npc.harvestStatus === 'active') {
                                statusMessage = npc.statusMessageHarvesting || '(harvesting)';
                            } else if ((npc.state.cooldown_until && Date.now() < npc.state.cooldown_until) || npc.harvestStatus === 'cooldown') {
                                statusMessage = npc.statusMessageCooldown || '(cooldown)';
                            } else {
                                statusMessage = npc.statusMessageReady || '(ready)';
                            }
                            if (statusMessage) {
                                npcDisplay += ' ' + statusMessage;
                            }
                        }
                        combinedEntities.push(npcDisplay);
                    });
                }
                
                if (combinedEntities.length > 0) {
                    const formattedList = combinedEntities.join(', ');
                    if (typeof parseMarkup !== 'undefined') {
                        playersLine.innerHTML = `<span class="players-section-title">Also here:</span> ${parseMarkup(formattedList, '#00ffff')}`;
                    } else {
                        playersLine.innerHTML = `<span class="players-section-title">Also here:</span> ${formattedList}`;
                    }
                    saveTerminalContentToHistory('Also here: ' + formattedList, 'info');
                } else {
                    playersLine.innerHTML = `<span class="players-section-title">Also here:</span> <span class="player-item">No one else is here.</span>`;
                    saveTerminalContentToHistory('Also here: No one else is here.', 'info');
                }
            }
            
            playersDiv.appendChild(playersLine);
            terminalContent.appendChild(playersDiv);
        }
        
        // Display exits (using formatted message from server)
        // Always display if message is provided, even if exits array is empty (to preserve markup)
        if (messages && messages.obviousExits && messages.obviousExits.trim() !== '') {
            const exitsDiv = document.createElement('div');
            exitsDiv.className = 'exits-section';
            
            // Parse markup and set innerHTML
            if (typeof parseMarkup !== 'undefined') {
                exitsDiv.innerHTML = parseMarkup(messages.obviousExits, '#00ffff');
            } else {
                exitsDiv.textContent = messages.obviousExits;
            }
            
            terminalContent.appendChild(exitsDiv);
            saveTerminalContentToHistory(messages.obviousExits, 'info');
        } else {
            if (exits && exits.length > 0) {
                // Fallback to old logic if message not available
                const exitsDiv = document.createElement('div');
                exitsDiv.className = 'exits-section';
                const exitsText = `Obvious exits: ${exits.join(', ')}`;
                exitsDiv.innerHTML = `<span class="exits-section-title">Obvious exits:</span> ${exits.join(', ')}`;
                terminalContent.appendChild(exitsDiv);
                saveTerminalContentToHistory(exitsText, 'info');
            }
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
            effectiveCycleTime: activeHarvestNPC.effectiveCycleTime,
            hitRate: activeHarvestNPC.hitRate,
            baseHarvestableTime: activeHarvestNPC.baseHarvestableTime || activeHarvestNPC.harvestableTime,
            effectiveHarvestableTime: activeHarvestNPC.effectiveHarvestableTime,
            baseCooldownTime: activeHarvestNPC.baseCooldownTime || activeHarvestNPC.cooldownTime,
            effectiveCooldownTime: activeHarvestNPC.effectiveCooldownTime
        });
    } else {
        hideNPCWidget();
    }
    
    // Always update room items display (dynamic, doesn't scroll)
    updateRoomItemsDisplay(roomItems, messages);
    
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
function addPlayerToTerminal(playerName, direction, message) {
    if (playerName === currentPlayerName) return;
    
    const terminalContent = document.getElementById('terminalContent');
    
    // Display entry message (use provided message from server or generate fallback)
    const entryMsg = document.createElement('div');
    entryMsg.className = 'player-movement-message';
    if (message && typeof parseMarkup !== 'undefined') {
        // Use server-provided formatted message with markup
        entryMsg.innerHTML = parseMarkup(message, '#00ffff');
    } else {
        // Fallback to old format if message not provided
        if (direction) {
            entryMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> enters from the ${direction}.`;
        } else {
            entryMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> has arrived.`;
        }
    }
    terminalContent.appendChild(entryMsg);
    
    // Find the most recent players-line (from current room display)
    // Get all players-lines and use the last one (most recent room)
    const allPlayersLines = terminalContent.querySelectorAll('.players-line');
    const playersLine = allPlayersLines.length > 0 ? allPlayersLines[allPlayersLines.length - 1] : null;
    
    // Don't manually add players to the "Also here" line - let the server send a room update
    // with the properly formatted message that includes all players and NPCs in correct order
    // The room update will be triggered by the server when a player enters
    
    // Scroll to bottom
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Remove player from terminal
function removePlayerFromTerminal(playerName, direction, message) {
    const terminalContent = document.getElementById('terminalContent');
    
    // Display departure message (use provided message from server or generate fallback)
    const departMsg = document.createElement('div');
    departMsg.className = 'player-movement-message';
    if (message && typeof parseMarkup !== 'undefined') {
        // Use server-provided formatted message with markup
        departMsg.innerHTML = parseMarkup(message, '#00ffff');
    } else {
        // Fallback to old format if message not provided
        if (direction) {
            departMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> left to the ${direction}.`;
        } else {
            departMsg.innerHTML = `<span class="player-name-highlight">${playerName}</span> has left.`;
        }
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

// Helper function to save terminal content to history
function saveTerminalContentToHistory(text, type = 'info', html = null) {
    if (currentPlayerName && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'saveTerminalMessage',
            message: text,
            messageType: type,
            messageHtml: html
        }));
    }
}

// Add message to terminal
function addToTerminal(message, type = 'info', saveToHistory = true) {
    const terminalContent = document.getElementById('terminalContent');
    const msgDiv = document.createElement('div');
    msgDiv.className = type === 'error' ? 'error-message' : 'info-message';
    
    // Apply markup parsing if available
    if (typeof parseMarkup !== 'undefined') {
        msgDiv.innerHTML = parseMarkup(message, '#00ffff');
    } else {
        msgDiv.textContent = message;
    }
    
    terminalContent.appendChild(msgDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
    
    // Save to terminal history (if player is connected and not noob)
    if (saveToHistory) {
        saveTerminalContentToHistory(message, type);
    }
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
    if (typeof parseMarkup !== 'undefined') {
        // Use server-provided formatted message with markup
        messageDiv.innerHTML = parseMarkup(message, '#00ffff');
    } else {
        // Fallback to plain text if parseMarkup not available
        messageDiv.textContent = message;
    }
    terminalContent.appendChild(messageDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Parse Lore Keeper message text and make <text> glow (purple), [text] glow (same color), and !text! glow (red)
function parseLoreKeeperGlow(text, keywordColor) {
    // First escape HTML to prevent XSS
    const escaped = escapeHtml(text);
    const glowColor = keywordColor || '#ff00ff';
    
    // Replace [text] with glowing span that preserves original color (inherit)
    let result = escaped.replace(/\[([^\]]+)\]/g, `<span class="lorekeeper-glow-preserve">$1</span>`);
    
    // Replace <text> with glowing span that uses keyword color (purple)
    result = result.replace(/&lt;([^&]+)&gt;/g, `<span class="lorekeeper-glow" style="color: ${glowColor}">$1</span>`);
    
    // Replace !text! with glowing span that uses red color
    result = result.replace(/!([^!]+)!/g, `<span class="lorekeeper-glow" style="color: #ff0000">$1</span>`);
    
    return result;
}

// Display Lore Keeper message (narrative NPC speech)
function displayLoreKeeperMessage(npcName, npcColor, message, messageColor, isSuccess, isFailure, keywordColor) {
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'lorekeeper-message';
    
    // Apply success/failure styling
    if (isSuccess) {
        messageDiv.classList.add('lorekeeper-success');
    } else if (isFailure) {
        messageDiv.classList.add('lorekeeper-failure');
    }
    
    // Build the message HTML with glow effect for <text>
    const npcColorStyle = npcColor || '#00ffff';
    const msgColorStyle = messageColor || '#cccccc';
    const parsedMessage = parseLoreKeeperGlow(message, keywordColor || npcColor);
    
    messageDiv.innerHTML = `<span class="lorekeeper-name" style="color: ${npcColorStyle}">${escapeHtml(npcName)}</span> says "<span class="lorekeeper-text" style="color: ${msgColorStyle}">${parsedMessage}</span>"`;
    
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'lorekeeper-resize-handle';
    messageDiv.appendChild(resizeHandle);
    
    // Make resizable
    makeLoreKeeperResizable(messageDiv, resizeHandle);
    
    terminalContent.appendChild(messageDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Make a Lore Keeper message box resizable by dragging the corner handle
function makeLoreKeeperResizable(messageDiv, resizeHandle) {
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    
    const handleMouseDown = (e) => {
        // Only handle left mouse button
        if (e.button !== 0) return;
        
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // Get current dimensions - use offsetWidth/offsetHeight for more reliable values
        startWidth = messageDiv.offsetWidth;
        startHeight = messageDiv.offsetHeight;
        
        // If dimensions are 0 or invalid, use computed style or defaults
        if (!startWidth || startWidth < 200) {
            const computedStyle = window.getComputedStyle(messageDiv);
            startWidth = parseInt(computedStyle.width, 10) || messageDiv.scrollWidth || 200;
        }
        if (!startHeight || startHeight < 50) {
            const computedStyle = window.getComputedStyle(messageDiv);
            startHeight = parseInt(computedStyle.height, 10) || messageDiv.scrollHeight || 50;
        }
        
        // Set explicit dimensions if not already set
        if (!messageDiv.style.width) {
            messageDiv.style.width = startWidth + 'px';
        }
        if (!messageDiv.style.height) {
            messageDiv.style.height = startHeight + 'px';
        }
        
        // Prevent default behavior and stop propagation
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nwse-resize';
        
        // Add active class for visual feedback
        messageDiv.classList.add('resizing');
    };
    
    const handleMouseMove = (e) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        const newWidth = startWidth + deltaX;
        const newHeight = startHeight + deltaY;
        
        // Apply minimum size constraints
        const minWidth = 200;
        const minHeight = 50;
        
        if (newWidth >= minWidth) {
            messageDiv.style.width = newWidth + 'px';
        }
        if (newHeight >= minHeight) {
            messageDiv.style.height = newHeight + 'px';
        }
        
        e.preventDefault();
        e.stopPropagation();
    };
    
    const handleMouseUp = (e) => {
        if (isResizing) {
            isResizing = false;
            // Restore text selection
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            messageDiv.classList.remove('resizing');
        }
    };
    
    // Attach event listeners with capture phase to ensure they fire
    resizeHandle.addEventListener('mousedown', handleMouseDown, { capture: true, passive: false });
    
    // Use window for mousemove/mouseup to catch events even if mouse leaves element
    window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
    window.addEventListener('mouseleave', handleMouseUp, { capture: true });
    
    // Clean up on element removal (optional, but good practice)
    const observer = new MutationObserver(() => {
        if (!document.body.contains(messageDiv)) {
            window.removeEventListener('mousemove', handleMouseMove, { capture: true });
            window.removeEventListener('mouseup', handleMouseUp, { capture: true });
            window.removeEventListener('mouseleave', handleMouseUp, { capture: true });
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Communication Widget Functions
// Initialize pathing mode handlers
function initPathingModeHandlers() {
    const createPathBtn = document.getElementById('createPathBtn');
    const exitPathingBtn = document.getElementById('exitPathingBtn');
    const endPathBtn = document.getElementById('endPathBtn');
    const savePathBtn = document.getElementById('savePathBtn');
    const cancelPathNameBtn = document.getElementById('cancelPathNameBtn');
    const closePathNameModal = document.getElementById('closePathNameModal');
    const pathNameModal = document.getElementById('pathNameModal');
    
    if (createPathBtn) {
        createPathBtn.addEventListener('click', enterPathingMode);
    }
    if (exitPathingBtn) {
        exitPathingBtn.addEventListener('click', exitPathingMode);
    }
    if (endPathBtn) {
        endPathBtn.addEventListener('click', endPath);
    }
    if (savePathBtn) {
        savePathBtn.addEventListener('click', () => {
            const input = document.getElementById('pathNameInput');
            const errorDiv = document.getElementById('pathNameError');
            if (!input || !input.value.trim()) {
                if (errorDiv) {
                    errorDiv.textContent = 'Please enter a path name';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            if (errorDiv) {
                errorDiv.style.display = 'none';
            }
            
            const pathData = window.pendingPathData;
            if (pathData) {
                savePath(input.value.trim(), pathData.pathType);
                if (pathNameModal) {
                    pathNameModal.style.display = 'none';
                }
                window.pendingPathData = null;
            }
        });
    }
    if (cancelPathNameBtn) {
        cancelPathNameBtn.addEventListener('click', () => {
            if (pathNameModal) {
                pathNameModal.style.display = 'none';
            }
            window.pendingPathData = null;
        });
    }
    if (closePathNameModal) {
        closePathNameModal.addEventListener('click', () => {
            if (pathNameModal) {
                pathNameModal.style.display = 'none';
            }
            window.pendingPathData = null;
        });
    }
}

function initCommunicationWidget() {
    const commWidget = document.getElementById('widget-comms');
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

function addToCommHistory(mode, playerName, message, isReceived, targetPlayer = null, loreKeeperStyle = null) {
    if (!commHistory[mode]) {
        commHistory[mode] = [];
    }
    
    const entry = {
        playerName,
        message,
        isReceived,
        targetPlayer,
        timestamp: Date.now(),
        loreKeeperStyle // Store Lore Keeper styling info if provided
    };
    
    commHistory[mode].push(entry);
    
    // Keep only last 100 messages per channel
    if (commHistory[mode].length > 100) {
        commHistory[mode] = commHistory[mode].slice(-100);
    }
    
    // Save to localStorage
    saveCommsHistory();
    
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
            // Talk mode - check for Lore Keeper styling
            if (entry.loreKeeperStyle && entry.loreKeeperStyle.isLoreKeeper) {
                const style = entry.loreKeeperStyle;
                const npcColor = style.npcColor || '#00ffff';
                const msgColor = style.messageColor || '#cccccc';
                const keywordColor = style.keywordColor || npcColor;
                
                // Apply glow effect to <text> markers
                const parsedMessage = parseLoreKeeperGlow(entry.message, keywordColor);
                
                // Add success/failure classes
                if (style.isSuccess) {
                    msgDiv.classList.add('comm-lorekeeper-success');
                } else if (style.isFailure) {
                    msgDiv.classList.add('comm-lorekeeper-failure');
                }
                msgDiv.classList.add('comm-lorekeeper');
                
                displayText = `<span class="comm-player" style="color: ${npcColor}">${escapeHtml(entry.playerName)}</span> says "<span style="color: ${msgColor}">${parsedMessage}</span>"`;
            } else if (entry.isReceived) {
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
    document.addEventListener('DOMContentLoaded', initPathingModeHandlers);
} else {
    initCommunicationWidget();
    initPathingModeHandlers();
}

// Update the room items display bar (dynamic, updates in place)
function updateRoomItemsDisplay(roomItems, messages) {
    const display = document.getElementById('roomItemsDisplay');
    const label = document.querySelector('.room-status-label');
    if (!display) return;
    
    // Use formatted message from server if available
    if (messages && messages.onGround) {
        // Extract just the items part (after "On the ground: ")
        const itemsPart = messages.onGround.replace(/^On the ground:\s*/i, '');
        
        // Update label if it exists
        if (label) {
            if (typeof parseMarkup !== 'undefined') {
                label.innerHTML = parseMarkup('On the ground:', '#00ffff');
            } else {
                label.textContent = 'On the ground:';
            }
        }
        
        // Parse markup for items part
        if (typeof parseMarkup !== 'undefined') {
            display.innerHTML = parseMarkup(itemsPart, '#00ffff');
        } else {
            display.textContent = itemsPart;
        }
        
        display.className = itemsPart === 'Nothing' ? 'room-items-display empty' : 'room-items-display';
        return;
    }
    
    // Fallback to old logic
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
    // Reset idle timer on any keypress in command input
    resetIdleTimer();
    
    if (e.key === 'Enter') {
        const command = commandInput.value.trim();
        if (command) {
            executeCommand(command);
            commandInput.value = '';
        }
    }
});

// Also track typing in command input (not just Enter)
commandInput.addEventListener('input', () => {
    resetIdleTimer();
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

    // WHO - show all players in the world
    if (base === 'who') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        ws.send(JSON.stringify({ type: 'who' }));
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

    // ASK <npc> <question> - ask NPC a question
    if (base === 'ask') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const message = parts.slice(1).join(' ');
        if (!message) {
            addToTerminal('Ask what? (ask <npc> <question>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'ask', message }));
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

    // SOLVE / SOL <npc> <answer> - attempt puzzle solution
    if (base === 'solve' || base === 'sol') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        if (parts.length < 3) {
            addToTerminal('Solve what? (solve <npc> <answer>)', 'error');
            return;
        }
        
        const target = parts[1];
        const answer = parts.slice(2).join(' ');
        if (!answer) {
            addToTerminal('Solve with what answer? (solve <npc> <answer>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'solve', target, answer }));
        return;
    }

    // CLUE / CL <npc> - get puzzle clue
    if (base === 'clue' || base === 'cl') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const target = parts.slice(1).join(' ');
        if (!target) {
            addToTerminal('Get clue from whom? (clue <npc>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'clue', target }));
        return;
    }
    
    // WAREHOUSE / WH - open warehouse widget
    if (base === 'warehouse' || base === 'wh') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'warehouse' }));
        return;
    }
    
    // STORE / ST [quantity|all] <item> - store item to warehouse
    if (base === 'store' || base === 'st') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length === 0) {
            addToTerminal('Store what?', 'error');
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
            addToTerminal('Store what?', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'store', itemName, quantity }));
        return;
    }
    
    // LIST / LI / LS - list items for sale in merchant room
    if (base === 'list' || base === 'li' || base === 'ls') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'list' }));
        return;
    }
    
    // DEPOSIT / DEP <quantity|all> <currency> - deposit currency to bank
    if (base === 'deposit' || base === 'dep') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length < 2) {
            addToTerminal('Usage: deposit <quantity|all> <currency>', 'error');
            return;
        }
        
        const quantity = rest[0].toLowerCase() === 'all' ? 'all' : rest[0];
        const currencyName = rest.slice(1).join(' ');
        
        ws.send(JSON.stringify({ type: 'deposit', currencyName, quantity }));
        return;
    }
    
    // WITHDRAW / WD / W <quantity|all> <currency> - withdraw currency from bank (if in bank room)
    // Note: withdraw also handles warehouse items, server routes based on room type
    // Note: 'w' alone is west (movement), but 'w [quantity] [currency]' is withdraw (has qualifier)
    if (base === 'withdraw' || base === 'wd' || (base === 'w' && parts.length > 1)) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length === 0) {
            addToTerminal('Withdraw what?', 'error');
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
            addToTerminal('Withdraw what?', 'error');
            return;
        }
        
        // Send both itemName (for warehouse) and currencyName (for bank)
        // Server will route based on room type
        ws.send(JSON.stringify({ type: 'withdraw', itemName, currencyName: itemName, quantity }));
        return;
    }
    
    // BALANCE / BAL - show bank balance
    if (base === 'balance' || base === 'bal') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'balance' }));
        return;
    }
    
    // WEALTH - show total wealth in Glimmer shards
    if (base === 'wealth') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'wealth' }));
        return;
    }
    
    // BUY <item> [quantity] - buy item from merchant
    if (base === 'buy' || base === 'b') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length === 0) {
            addToTerminal('Buy what?', 'error');
            return;
        }
        
        let quantity = 1;
        let itemNameParts = rest;
        
        // Check if first word is a number (quantity)
        if (rest.length > 1) {
            const parsedQty = parseInt(rest[0], 10);
            if (!isNaN(parsedQty) && parsedQty > 0) {
                quantity = parsedQty;
                itemNameParts = rest.slice(1);
            }
        }
        
        const itemName = itemNameParts.join(' ');
        if (!itemName) {
            addToTerminal('Buy what?', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'buy', itemName, quantity }));
        return;
    }
    
    // SELL <item> [quantity] - sell item to merchant
    // Note: 's' alone is south (movement), but 's [item]' is sell (has qualifier)
    if (base === 'sell' || (base === 's' && parts.length > 1)) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const rest = parts.slice(1);
        if (rest.length === 0) {
            addToTerminal('Sell what?', 'error');
            return;
        }
        
        let quantity = 1;
        let itemNameParts = rest;
        
        // Check if first word is a number (quantity)
        if (rest.length > 1) {
            const parsedQty = parseInt(rest[0], 10);
            if (!isNaN(parsedQty) && parsedQty > 0) {
                quantity = parsedQty;
                itemNameParts = rest.slice(1);
            }
        }
        
        const itemName = itemNameParts.join(' ');
        if (!itemName) {
            addToTerminal('Sell what?', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'sell', itemName, quantity }));
        return;
    }

    // GREET / GR / HELLO / HI <npc> - greet a Lore Keeper to hear initial message
    if (base === 'greet' || base === 'gr' || base === 'hello' || base === 'hi') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addToTerminal('Not connected to server. Please wait...', 'error');
            return;
        }
        
        const target = parts.slice(1).join(' ');
        if (!target) {
            addToTerminal('Greet whom? (greet <npc>)', 'error');
            return;
        }
        
        ws.send(JSON.stringify({ type: 'greet', target }));
        return;
    }

    const normalized = normalizeCommand(raw);
    if (normalized) {
        // Block movement commands during auto-navigation
        if (isAutoNavigating) {
            addToTerminal('Auto-navigation is active. Please wait for it to complete.', 'error');
            return;
        }
        movePlayer(normalized);
    } else {
        addToTerminal(`Unknown command: ${command}`, 'error');
    }
}

// Handle compass button clicks
document.querySelectorAll('.compass-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.disabled && !isAutoNavigating) {
            const direction = btn.getAttribute('data-direction');
            movePlayer(direction);
        } else if (isAutoNavigating) {
            addToTerminal('Auto-navigation is active. Please wait for it to complete.', 'error');
        }
    });
});

// Handle keypad movement in main game
function handleKeypadMovement(key) {
    // Reset idle timer on keypad movement
    resetIdleTimer();
    
    // If in pathing mode, handle pathing navigation instead
    if (pathingModeActive) {
        handlePathingModeKeypad(key);
        return;
    }
    
    // Block keypad movement during auto-navigation
    if (isAutoNavigating) {
        addToTerminal('Auto-navigation is active. Please wait for it to complete.', 'error');
        return;
    }
    
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
    // In pathing mode, intercept movement and add to path instead
    if (pathingModeActive && pathingCursorRoom) {
        // Calculate target room based on direction (supports cardinal and diagonal)
        const directionMap = {
            'N': { dx: 0, dy: 1 },
            'S': { dx: 0, dy: -1 },
            'E': { dx: 1, dy: 0 },
            'W': { dx: -1, dy: 0 },
            'NE': { dx: 1, dy: 1 },
            'NW': { dx: -1, dy: 1 },
            'SE': { dx: 1, dy: -1 },
            'SW': { dx: -1, dy: -1 }
        };
        
        const dir = directionMap[direction];
        if (dir) {
            const targetX = pathingCursorRoom.x + dir.dx;
            const targetY = pathingCursorRoom.y + dir.dy;
            
            // Find room at target position - check current map first (use pathing cursor's map if in pathing mode)
            const searchMapId = pathingCursorRoom && pathingCursorRoom.mapId ? pathingCursorRoom.mapId : currentMapId;
            let targetRoom = mapRooms.find(r => 
                r.mapId === searchMapId && 
                r.x === targetX && 
                r.y === targetY
            );
            
            // If not found in current map, check if current room has a connection in this direction
            if (!targetRoom && pathingCursorRoom) {
                const currentRoom = mapRooms.find(r => r.id === pathingCursorRoom.id);
                if (currentRoom && currentRoom.connected_map_id && 
                    currentRoom.connection_direction) {
                    // Check if direction matches (case-insensitive)
                    const connectionDir = currentRoom.connection_direction.toUpperCase();
                    const moveDir = direction.toUpperCase();
                    if (connectionDir === moveDir) {
                        // This is a map connection - request the connected room from server
                        console.log(`Pathing: Map connection detected - direction ${direction} to map ${currentRoom.connected_map_id} at (${currentRoom.connected_room_x}, ${currentRoom.connected_room_y})`);
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'getPathingRoom',
                                mapId: currentRoom.connected_map_id,
                                x: currentRoom.connected_room_x,
                                y: currentRoom.connected_room_y,
                                direction: direction
                            }));
                            // Wait for response - this will be handled in handleMessage
                            return;
                        }
                    } else {
                        console.log(`Pathing: Connection direction mismatch - room has ${connectionDir}, trying ${moveDir}`);
                    }
                }
            }
            
            if (targetRoom) {
                // Allow revisiting any room - remove restriction
                // Only special case: if going back to immediately previous room, undo the last step
                const isPreviousRoom = currentPath.length > 0 && 
                                      currentPath[currentPath.length - 1].roomId === targetRoom.id;
                
                if (isPreviousRoom && currentPath.length > 1) {
                    console.log(`Pathing: Going back to previous room, removing last step`);
                    currentPath.pop();
                    updatePathStepCounter();
                    renderMap();
                } else {
                    console.log(`Pathing: Adding room ${targetRoom.id} (${targetRoom.x}, ${targetRoom.y}) direction ${direction} from cursor (${pathingCursorRoom.x}, ${pathingCursorRoom.y})`);
                    addPathStep(targetRoom, direction);
                }
            } else {
                console.log(`Pathing: Room at (${targetX}, ${targetY}) does not exist for direction ${direction} from cursor (${pathingCursorRoom.x}, ${pathingCursorRoom.y})`);
            }
        }
        return; // Don't move actual character
    }
    
    // Block movement during auto-navigation
    if (isAutoNavigating) {
        addToTerminal('Auto-navigation is active. Please wait for it to complete.', 'error');
        return;
    }
    
    // If path is paused and player manually moves, clear pause state
    if (isPathPaused && pausedPathRoomId) {
        const currentRoom = mapRooms.find(r => 
            r.mapId === currentMapId && 
            r.x === currentRoomPos.x && 
            r.y === currentRoomPos.y
        );
        if (currentRoom && currentRoom.id !== pausedPathRoomId) {
            // Player has moved from paused room - clear pause state
            isPathPaused = false;
            pausedPathRoomId = null;
            updatePathExecutionUI();
        }
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addToTerminal('Not connected to server. Please wait...', 'error');
        return;
    }

    // Reset idle timer on movement
    resetIdleTimer();
    
    ws.send(JSON.stringify({
        type: 'move',
        direction: direction
    }));
}

// Idle auto-look timer functions
function resetIdleTimer() {
    lastInteractionTime = Date.now();
}

function startIdleLookTimer() {
    // Clear any existing timer
    stopIdleLookTimer();
    
    // Reset interaction time
    resetIdleTimer();
    
    // Check for idle state every 5 seconds
    idleLookInterval = setInterval(() => {
        const timeSinceLastInteraction = Date.now() - lastInteractionTime;
        
        // Only trigger if player is in game (has WebSocket connection and currentPlayerName)
        if (ws && ws.readyState === WebSocket.OPEN && currentPlayerName && timeSinceLastInteraction >= IDLE_LOOK_DELAY) {
            // Trigger look command
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'look' }));
                // Reset timer after triggering look
                resetIdleTimer();
            }
        }
    }, 5000); // Check every 5 seconds
}

function stopIdleLookTimer() {
    if (idleLookInterval) {
        clearInterval(idleLookInterval);
        idleLookInterval = null;
    }
}

// Update player stats display (dynamically renders all stats from database)
function updatePlayerStats(stats) {
    const statsContent = document.getElementById('playerStatsContent');
    if (!statsContent || !stats) return;
    
    statsContent.innerHTML = '';
    
    // Get assignable points first (before processing other stats)
    const assignablePoints = stats.assignablePoints?.value || 0;
    
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
            
            // Skip assignablePoints (handled separately)
            if (key === 'assignablePoints') return;
            
            // Only process known categories
            if (statsByCategory[stat.category]) {
                statsByCategory[stat.category].push({
                    key: key,
                    displayName: stat.displayName,
                    value: stat.value
                });
            }
        }
    });
    
    // Render Assignable Points if available
    if (stats.assignablePoints !== undefined) {
        const assignableSection = document.createElement('div');
        assignableSection.className = 'stats-section assignable-points-section';
        const assignableTitle = document.createElement('div');
        assignableTitle.className = 'stats-section-title';
        assignableTitle.textContent = 'Assignable Points';
        assignableSection.appendChild(assignableTitle);
        const assignableValue = document.createElement('div');
        assignableValue.className = 'stat-item';
        assignableValue.innerHTML = `<span class="stat-value">${assignablePoints}</span>`;
        assignableSection.appendChild(assignableValue);
        statsContent.appendChild(assignableSection);
    }
    
    // Render Attributes (stats) - with controls if assignable points > 0
    if (statsByCategory.stats.length > 0) {
        const statsSection = createStatSection('Attributes', statsByCategory.stats, assignablePoints > 0, assignablePoints);
        statsContent.appendChild(statsSection);
    }
    
    // Render Abilities (no controls)
    if (statsByCategory.abilities.length > 0) {
        const abilitiesSection = createStatSection('Abilities', statsByCategory.abilities, false);
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
// showControls: true for attributes (if assignable points > 0), false for abilities
// assignablePoints: current assignable points value (for button state)
function createStatSection(title, items, showControls = false, assignablePoints = 0) {
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
        
        const valueContainer = document.createElement('div');
        valueContainer.style.display = 'flex';
        valueContainer.style.alignItems = 'center';
        valueContainer.style.gap = '8px';
        
        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = item.value;
        value.setAttribute('data-stat-key', item.key);
        
        // Only show controls for attributes (when showControls is true)
        if (showControls) {
            // Stat controls group (increment/decrement buttons)
            const controlsGroup = document.createElement('div');
            controlsGroup.className = 'stat-controls';
            controlsGroup.setAttribute('data-stat-key', item.key);
            
            const decrementBtn = document.createElement('button');
            decrementBtn.className = 'stat-control-btn';
            decrementBtn.textContent = '−';
            // Decrement disabled if stat value is 1 or less (can't go below 1)
            decrementBtn.disabled = !showControls || item.value <= 1;
            decrementBtn.setAttribute('aria-label', `Decrease ${item.displayName}`);
            decrementBtn.setAttribute('data-action', 'decrement');
            decrementBtn.setAttribute('data-stat-key', item.key);
            
            const incrementBtn = document.createElement('button');
            incrementBtn.className = 'stat-control-btn';
            incrementBtn.textContent = '+';
            // Increment disabled if no assignable points available
            incrementBtn.disabled = !showControls || assignablePoints <= 0;
            incrementBtn.setAttribute('aria-label', `Increase ${item.displayName}`);
            incrementBtn.setAttribute('data-action', 'increment');
            incrementBtn.setAttribute('data-stat-key', item.key);
            
            // Add click handlers
            incrementBtn.addEventListener('click', () => {
                handleAttributePointChange(item.key, 'increment');
            });
            
            decrementBtn.addEventListener('click', () => {
                handleAttributePointChange(item.key, 'decrement');
            });
            
            controlsGroup.appendChild(decrementBtn);
            controlsGroup.appendChild(incrementBtn);
            
            valueContainer.appendChild(value);
            valueContainer.appendChild(controlsGroup);
        } else {
            // No controls for abilities
            valueContainer.appendChild(value);
        }
        
        statItem.appendChild(label);
        statItem.appendChild(valueContainer);
        section.appendChild(statItem);
    });
    
    return section;
}

// Handle attribute point assignment (increment/decrement)
function handleAttributePointChange(statKey, action) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addToTerminal('Not connected to server. Please wait...', 'error');
        return;
    }
    
    // Convert camelCase back to database column name (e.g., 'ingenuity' -> 'stat_ingenuity')
    const dbColumnName = `stat_${statKey}`;
    
    ws.send(JSON.stringify({
        type: 'assignAttributePoint',
        statKey: dbColumnName,
        action: action // 'increment' or 'decrement'
    }));
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
// ============================================================
// REUSABLE MAP RENDERER UTILITY
// ============================================================

/**
 * Centralized map rendering utility for all map widgets
 * Handles coordinate conversion, room drawing, click/hover detection
 */
class MapRenderer {
    constructor(config) {
        this.canvas = config.canvas;
        this.ctx = config.ctx;
        this.cellSize = config.cellSize || 10;
        this.gridSize = config.gridSize || null; // null = dynamic, number = fixed grid
        this.zoom = config.zoom || 1.0;
        this.panX = config.panX || 0;
        this.panY = config.panY || 0;
        this.minCellSize = config.minCellSize || 8;
        this.maxCellSize = config.maxCellSize || null;
        
        // Callbacks
        this.onRoomClick = config.onRoomClick || null;
        this.onRoomHover = config.onRoomHover || null;
        this.getRoomColor = config.getRoomColor || this.defaultRoomColor;
        this.getRoomBorder = config.getRoomBorder || this.defaultRoomBorder;
        this.shouldDrawConnections = config.shouldDrawConnections || false;
        
        // Internal state
        this.renderedBounds = null; // { minX, maxX, minY, maxY, offsetX, offsetY, cellSize }
    }
    
    /**
     * Calculate rendering bounds based on rooms and configuration
     */
    calculateBounds(rooms, centerRoom = null) {
        if (this.gridSize !== null) {
            // Fixed grid mode (like main map widget)
            const halfSize = Math.floor(this.gridSize / 2);
            if (centerRoom) {
                return {
                    minX: centerRoom.x - halfSize,
                    maxX: centerRoom.x + halfSize,
                    minY: centerRoom.y - halfSize,
                    maxY: centerRoom.y + halfSize,
                    cellSize: this.cellSize,
                    offsetX: (this.canvas.width - this.gridSize * this.cellSize) / 2,
                    offsetY: (this.canvas.height - this.gridSize * this.cellSize) / 2
                };
            }
        }
        
        // Dynamic bounds mode (like jump/auto-path widgets)
        if (rooms.length === 0) {
            return null;
        }
        
        const minX = Math.min(...rooms.map(r => r.x));
        const maxX = Math.max(...rooms.map(r => r.x));
        const minY = Math.min(...rooms.map(r => r.y));
        const maxY = Math.max(...rooms.map(r => r.y));
        
        const gridWidth = maxX - minX + 1;
        const gridHeight = maxY - minY + 1;
        
        // Calculate cell size to fit canvas
        let cellSize = this.cellSize;
        if (this.canvas && this.canvas.width && this.canvas.height) {
            const cellSizeX = Math.floor((this.canvas.width - 40) / gridWidth);
            const cellSizeY = Math.floor((this.canvas.height - 40) / gridHeight);
            cellSize = Math.min(cellSizeX, cellSizeY);
            if (this.maxCellSize) cellSize = Math.min(cellSize, this.maxCellSize);
            cellSize = Math.max(cellSize, this.minCellSize);
        }
        
        // Apply zoom if in editor mode
        if (this.zoom !== 1.0) {
            cellSize = cellSize * this.zoom;
        }
        
        const offsetX = Math.floor((this.canvas.width - gridWidth * cellSize) / 2) - (this.panX * cellSize);
        const offsetY = Math.floor((this.canvas.height - gridHeight * cellSize) / 2) + (this.panY * cellSize);
        
        return { minX, maxX, minY, maxY, cellSize, offsetX, offsetY };
    }
    
    /**
     * Convert screen coordinates to map coordinates
     */
    screenToMap(screenX, screenY) {
        if (!this.renderedBounds) return null;
        
        const { minX, maxY, cellSize, offsetX, offsetY } = this.renderedBounds;
        const gridX = Math.floor((screenX - offsetX) / cellSize) + minX;
        const gridY = maxY - Math.floor((screenY - offsetY) / cellSize);
        
        return { x: gridX, y: gridY };
    }
    
    /**
     * Convert map coordinates to screen coordinates
     */
    mapToScreen(mapX, mapY) {
        if (!this.renderedBounds) return null;
        
        const { minX, maxY, cellSize, offsetX, offsetY } = this.renderedBounds;
        const screenX = offsetX + (mapX - minX) * cellSize;
        const screenY = offsetY + (maxY - mapY) * cellSize;
        
        return { x: screenX, y: screenY };
    }
    
    /**
     * Get room at screen position
     */
    getRoomAtPosition(screenX, screenY, rooms) {
        const coords = this.screenToMap(screenX, screenY);
        if (!coords) return null;
        
        return rooms.find(r => r.x === coords.x && r.y === coords.y) || null;
    }
    
    /**
     * Draw a single room
     */
    drawRoom(room, bounds) {
        if (!this.ctx || !bounds) return;
        
        const { minX, maxY, cellSize, offsetX, offsetY } = bounds;
        
        // Check if room is in visible bounds
        if (room.x < bounds.minX || room.x > bounds.maxX || 
            room.y < bounds.minY || room.y > bounds.maxY) {
            return;
        }
        
        const screenX = offsetX + (room.x - minX) * cellSize;
        const screenY = offsetY + (maxY - room.y) * cellSize;
        
        // Get room styling
        const fillColor = this.getRoomColor(room);
        const border = this.getRoomBorder(room);
        
        // Draw room fill
        this.ctx.fillStyle = fillColor;
        const roomSize = cellSize - 2;
        this.ctx.fillRect(screenX + 1, screenY + 1, roomSize, roomSize);
        
        // Draw border
        this.ctx.strokeStyle = border.color || '#333';
        this.ctx.lineWidth = border.width || 1;
        this.ctx.strokeRect(screenX + 1, screenY + 1, roomSize, roomSize);
        
        return { screenX, screenY, roomSize };
    }
    
    /**
     * Draw connections between adjacent rooms
     */
    drawConnections(rooms, bounds, roomMap) {
        if (!this.ctx || !bounds || !this.shouldDrawConnections) return;
        
        const { minX, maxX, minY, maxY, cellSize, offsetX, offsetY } = bounds;
        
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        
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
        
        rooms.forEach(room => {
            if (room.x < minX || room.x > maxX || room.y < minY || room.y > maxY) return;
            
            const screenX = offsetX + (room.x - minX) * cellSize;
            const screenY = offsetY + (maxY - room.y) * cellSize;
            const roomCenterX = screenX + cellSize / 2;
            const roomCenterY = screenY + cellSize / 2;
            
            directions.forEach(dir => {
                const adjX = room.x + dir.dx;
                const adjY = room.y + dir.dy;
                const adjKey = `${adjX},${adjY}`;
                
                if (roomMap && roomMap.has(adjKey)) {
                    const adjRoom = roomMap.get(adjKey);
                    if (adjRoom.x >= minX && adjRoom.x <= maxX && 
                        adjRoom.y >= minY && adjRoom.y <= maxY) {
                        const adjScreenX = offsetX + (adjRoom.x - minX) * cellSize;
                        const adjScreenY = offsetY + (maxY - adjRoom.y) * cellSize;
                        const adjCenterX = adjScreenX + cellSize / 2;
                        const adjCenterY = adjScreenY + cellSize / 2;
                        
                        this.ctx.beginPath();
                        this.ctx.moveTo(roomCenterX, roomCenterY);
                        this.ctx.lineTo(adjCenterX, adjCenterY);
                        this.ctx.stroke();
                    }
                }
            });
        });
    }
    
    /**
     * Render map with rooms
     */
    render(rooms, centerRoom = null, clearColor = '#0a0a0a') {
        if (!this.canvas || !this.ctx) return;
        
        // Clear canvas
        this.ctx.fillStyle = clearColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Calculate bounds
        this.renderedBounds = this.calculateBounds(rooms, centerRoom);
        if (!this.renderedBounds) return;
        
        // Create room map for connections
        const roomMap = this.shouldDrawConnections ? new Map() : null;
        if (roomMap) {
            rooms.forEach(room => {
                roomMap.set(`${room.x},${room.y}`, room);
            });
        }
        
        // Draw connections first (behind rooms)
        if (this.shouldDrawConnections) {
            this.drawConnections(rooms, this.renderedBounds, roomMap);
        }
        
        // Draw rooms
        rooms.forEach(room => {
            this.drawRoom(room, this.renderedBounds);
        });
        
        // Store bounds in canvas dataset for click detection
        if (this.canvas) {
            this.canvas.dataset.minX = this.renderedBounds.minX;
            this.canvas.dataset.maxY = this.renderedBounds.maxY;
            this.canvas.dataset.offsetX = this.renderedBounds.offsetX;
            this.canvas.dataset.offsetY = this.renderedBounds.offsetY;
            this.canvas.dataset.cellSize = this.renderedBounds.cellSize;
        }
    }
    
    /**
     * Default room color function
     */
    defaultRoomColor(room) {
        return '#666';
    }
    
    /**
     * Default room border function
     */
    defaultRoomBorder(room) {
        return { color: '#333', width: 1 };
    }
}

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

// Main map renderer instance
let mainMapRenderer = null;

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
    
    // Initialize or update MapRenderer
    mainMapRenderer = new MapRenderer({
        canvas: mapCanvas,
        ctx: mapCtx,
        cellSize: CELL_SIZE,
        gridSize: MAP_SIZE,
        shouldDrawConnections: true,
        getRoomColor: (room) => {
            const isCurrentRoom = room.mapId === currentMapId &&
                                  room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y;
            const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
            
            if (isCurrentRoom) {
                return '#00ff00'; // Bright green for current room
            } else if (hasConnection) {
                return '#ffffff'; // White for rooms with connections
            } else {
                const roomType = room.roomType || room.room_type || 'normal';
                return roomTypeColors[roomType] || roomTypeColors.normal || '#666';
            }
        },
        getRoomBorder: (room) => {
            const isCurrentRoom = room.mapId === currentMapId &&
                                  room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y;
            const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
            
            if (isCurrentRoom) {
                return { color: '#ffff00', width: 2 }; // Yellow border for current room
            } else if (hasConnection) {
                return { color: '#cccccc', width: 1 }; // Light grey border for connected rooms
            } else {
                return { color: '#333', width: 1 }; // Dark border for other rooms
            }
        }
    });
    
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

// ============================================================
// Path/Loop Execution Functions
// ============================================================

function loadAllPlayerPaths() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentPlayerName) return;
    
    ws.send(JSON.stringify({ type: 'getAllPlayerPaths' }));
}

function populatePathDropdown() {
    const dropdown = document.getElementById('pathLoopSelect');
    if (!dropdown) return;
    
    // Clear existing options except the first placeholder
    dropdown.innerHTML = '<option value="">Select Path/Loop...</option>';
    
    // Add all paths/loops
    allPlayerPaths.forEach(path => {
        const option = document.createElement('option');
        option.value = path.id;
        const typeLabel = path.path_type === 'loop' ? '[Loop]' : '[Path]';
        option.textContent = `${typeLabel} ${path.name} (Map: ${path.map_id})`;
        dropdown.appendChild(option);
    });
}

function onPathSelectChange() {
    const dropdown = document.getElementById('pathLoopSelect');
    const startBtn = document.getElementById('startPathBtn');
    
    if (!dropdown || !startBtn) return;
    
    selectedPathId = dropdown.value ? parseInt(dropdown.value) : null;
    
    // Enable/disable start button
    startBtn.disabled = !selectedPathId || isPathExecuting;
    
    // If path selected, request details for preview
    if (selectedPathId && !isPathExecuting) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getPathDetails', pathId: selectedPathId }));
        }
    } else {
        // Hide preview if no path selected
        const previewDialog = document.getElementById('pathPreviewDialog');
        if (previewDialog) {
            previewDialog.style.display = 'none';
        }
    }
}

async function calculatePathPreview(path, steps) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentPlayerName) return;
    
    // Get current room
    const currentRoom = mapRooms.find(r => 
        r.mapId === currentMapId && 
        r.x === currentRoomPos.x && 
        r.y === currentRoomPos.y
    );
    
    if (!currentRoom) {
        console.error('Current room not found for path preview');
        return;
    }
    
    const algorithmRooms = [];
    const playerRooms = steps.map(step => ({
        roomId: step.roomId,
        roomName: step.roomName,
        x: step.x,
        y: step.y,
        direction: step.direction,
        mapId: step.mapId,
        isAlgorithm: false
    }));
    
    // Check if player is at origin
    const isAtOrigin = currentRoom.id === path.originRoomId;
    
    if (!isAtOrigin) {
        // Need to calculate path to origin
        if (ws && ws.readyState === WebSocket.OPEN) {
            // Request path calculation
            ws.send(JSON.stringify({ 
                type: 'calculateAutoPath', 
                targetRoomId: path.originRoomId 
            }));
            
            // Store pending preview calculation
            window.pendingPathPreview = {
                path: path,
                playerRooms: playerRooms
            };
            return;
        }
    }
    
    // Show preview with just player rooms (already at origin)
    showPathPreview({
        algorithmRooms: [],
        playerRooms: playerRooms,
        path: path
    });
}

function showPathPreview(routeData) {
    const previewDialog = document.getElementById('pathPreviewDialog');
    const previewContent = document.getElementById('pathPreviewContent');
    
    if (!previewDialog || !previewContent) return;
    
    pathPreviewData = routeData;
    
    let html = '';
    
    // Algorithm route section (if any)
    if (routeData.algorithmRooms && routeData.algorithmRooms.length > 0) {
        html += `<div style="margin-bottom: 10px;"><strong style="color: #888;">Algorithm Route (${routeData.algorithmRooms.length} rooms):</strong></div>`;
        routeData.algorithmRooms.forEach((step, index) => {
            const prevMapId = routeData.algorithmRooms[index - 1]?.mapId || currentMapId;
            const mapTransition = step.mapId !== prevMapId 
                ? `<span style="color: #888; font-style: italic;">→ Map: ${step.mapName || step.mapId}</span> ` 
                : '';
            html += `<div style="color: #888; font-style: italic; margin-left: 10px;">${mapTransition}${step.direction} → ${step.roomName}</div>`;
        });
        html += '<div style="margin-top: 10px; margin-bottom: 10px; border-top: 1px solid #333;"></div>';
    }
    
    // Player path/loop section
    const pathTypeLabel = routeData.path.pathType === 'loop' ? 'Loop' : 'Path';
    html += `<div style="margin-bottom: 10px;"><strong style="color: #00ff00;">Your ${pathTypeLabel} (${routeData.playerRooms.length} rooms):</strong></div>`;
    routeData.playerRooms.forEach((step, index) => {
        const prevMapId = routeData.playerRooms[index - 1]?.mapId || currentMapId;
        const mapTransition = step.mapId !== prevMapId 
            ? `<span style="color: #00ff00;">→ Map: ${step.mapId}</span> ` 
            : '';
        html += `<div style="color: #00ff00; margin-left: 10px;">${mapTransition}${step.direction} → ${step.roomName}</div>`;
    });
    
    previewContent.innerHTML = html;
    previewDialog.style.display = 'block';
}

function startPathExecution() {
    if (!selectedPathId) {
        addToTerminal('Please select a path or loop first.', 'error');
        return;
    }
    
    if (isPathExecuting && !isPathPaused) {
        addToTerminal('Path/Loop execution is already active.', 'error');
        return;
    }
    
    // Clear any pause state when starting fresh
    isPathPaused = false;
    pausedPathRoomId = null;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'startPathExecution', 
            pathId: selectedPathId 
        }));
    }
}

function stopPathExecution() {
    if (!isPathExecuting) return;
    
    // Get current room ID for pause tracking
    const currentRoom = mapRooms.find(r => 
        r.mapId === currentMapId && 
        r.x === currentRoomPos.x && 
        r.y === currentRoomPos.y
    );
    
    if (currentRoom) {
        pausedPathRoomId = currentRoom.id;
        isPathPaused = true;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stopPathExecution' }));
    }
}

function continuePathExecution() {
    console.log('[continuePathExecution] Called - isPathPaused:', isPathPaused, 'selectedPathId:', selectedPathId);
    
    if (!isPathPaused || !selectedPathId) {
        console.log('[continuePathExecution] Validation failed');
        addToTerminal('No paused path to continue.', 'error');
        return;
    }
    
    // Check if still in the same room
    const currentRoom = mapRooms.find(r => 
        r.mapId === currentMapId && 
        r.x === currentRoomPos.x && 
        r.y === currentRoomPos.y
    );
    
    console.log('[continuePathExecution] Current room:', currentRoom?.id, 'Paused room:', pausedPathRoomId);
    
    if (!currentRoom || currentRoom.id !== pausedPathRoomId) {
        // Player has moved - can't continue
        addToTerminal('Cannot continue: You have moved from where you stopped. Please restart the path.', 'error');
        isPathPaused = false;
        pausedPathRoomId = null;
        updatePathExecutionUI();
        return;
    }
    
    // Resume execution - navigation will be locked again
    isPathPaused = false;
    pausedPathRoomId = null;
    
    console.log('[continuePathExecution] Sending continuePathExecution message, pathId:', selectedPathId);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'continuePathExecution',
            pathId: selectedPathId
        }));
    } else {
        console.error('[continuePathExecution] WebSocket not ready');
        addToTerminal('Not connected to server.', 'error');
    }
}

function updatePathExecutionUI() {
    const dropdown = document.getElementById('pathLoopSelect');
    const startBtn = document.getElementById('startPathBtn');
    const stopBtn = document.getElementById('stopPathBtn');
    const continueBtn = document.getElementById('continuePathBtn');
    
    if (!dropdown || !startBtn || !stopBtn || !continueBtn) return;
    
    if (isPathExecuting) {
        // Execution active
        dropdown.disabled = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        continueBtn.style.display = 'none';
    } else if (isPathPaused) {
        // Execution paused
        dropdown.disabled = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        continueBtn.style.display = 'block';
    } else {
        // Execution inactive
        dropdown.disabled = false;
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        continueBtn.style.display = 'none';
        startBtn.disabled = !selectedPathId;
    }
}

// ============================================================
// Pathing Mode Functions
// ============================================================

function enterPathingMode() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentPlayerName) return;
    
    pathingModeActive = true;
    
    // Request fresh map data to ensure all connection fields are loaded
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getMapData', mapId: currentMapId }));
    }
    
    // Get current room info
    const currentRoom = mapRooms.find(r => 
        r.mapId === currentMapId && 
        r.x === currentRoomPos.x && 
        r.y === currentRoomPos.y
    );
    
    if (!currentRoom) {
        console.error('Current room not found for pathing mode');
        return;
    }
    
    // Initialize path with current room as first step
    pathStartRoom = {
        id: currentRoom.id,
        name: currentRoom.name,
        x: currentRoom.x,
        y: currentRoom.y,
        mapId: currentRoom.mapId
    };
    
    pathingCursorRoom = { ...pathStartRoom };
    currentPath = [{
        roomId: pathStartRoom.id,
        roomName: pathStartRoom.name,
        x: pathStartRoom.x,
        y: pathStartRoom.y,
        direction: null,
        stepIndex: 0
    }];
    
    // Update UI
    document.getElementById('createPathBtn').style.display = 'none';
    document.getElementById('exitPathingBtn').style.display = 'inline-block';
    document.getElementById('endPathBtn').style.display = 'inline-block';
    document.getElementById('pathingModeIndicator').style.display = 'flex';
    updatePathStepCounter();
    
    // Request pathing mode start from server
    ws.send(JSON.stringify({ type: 'startPathingMode' }));
    
    // Re-render map to show pathing indicators
    renderMap();
}

function exitPathingMode() {
    pathingModeActive = false;
    currentPath = [];
    pathStartRoom = null;
    pathingCursorRoom = null;
    
    // Update UI
    document.getElementById('createPathBtn').style.display = 'inline-block';
    document.getElementById('exitPathingBtn').style.display = 'none';
    document.getElementById('endPathBtn').style.display = 'none';
    document.getElementById('pathingModeIndicator').style.display = 'none';
    
    // Cancel on server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cancelPathing' }));
    }
    
    // Re-render map
    renderMap();
}

function addPathStep(room, direction) {
    // Double-check room exists in mapRooms before adding
    // Verify room exists in mapRooms (should always be true since we get it from mapRooms)
    // Allow rooms from any map (for cross-map pathing)
    const roomExists = mapRooms.some(r => 
        r.id === room.id && 
        r.x === room.x && 
        r.y === room.y
    );
    
    if (!roomExists) {
        console.error('Cannot add path step - room does not exist in mapRooms:', room);
        return;
    }
    
    const step = {
        roomId: room.id,
        roomName: room.name,
        x: room.x,
        y: room.y,
        mapId: room.mapId || currentMapId,
        direction: direction,
        stepIndex: currentPath.length
    };
    
    currentPath.push(step);
    pathingCursorRoom = { 
        id: room.id,
        name: room.name,
        x: room.x,
        y: room.y,
        mapId: room.mapId || (pathingCursorRoom && pathingCursorRoom.mapId) || currentMapId
    };
    
    console.log(`Pathing: Updated cursor to room ${pathingCursorRoom.id} (${pathingCursorRoom.x}, ${pathingCursorRoom.y}) on map ${pathingCursorRoom.mapId}`);
    updatePathStepCounter();
    renderMap(); // Re-render to show updated path
}

function updatePathStepCounter() {
    const counter = document.getElementById('pathStepCounter');
    const messageSpan = document.getElementById('pathingModeMessage');
    
    if (counter) {
        counter.textContent = `Steps: ${currentPath.length}`;
    }
    
    // Update message based on whether path has started (more than just starting room)
    if (messageSpan) {
        if (currentPath.length > 1 && pathingCursorRoom) {
            // Path has started - show current room name and coordinates
            messageSpan.textContent = `${pathingCursorRoom.name} (${pathingCursorRoom.x}, ${pathingCursorRoom.y})`;
        } else {
            // Path hasn't started yet - show instruction message
            messageSpan.textContent = 'Pathing Mode Active - Click rooms to build path';
        }
    }
}

function handlePathingModeClick(event) {
    if (!pathingModeActive || !mapCanvas || !pathingCursorRoom) return;
    
    const rect = mapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Get room at click position using existing map widget function
    let room = getRoomAtScreenPosition(x, y);
    
    // If room not found, check if we're clicking on a map connection
    if (!room && pathingCursorRoom) {
        const currentRoom = mapRooms.find(r => r.id === pathingCursorRoom.id);
        // Check if clicking near the connection direction - this is approximate
        // The actual connection check will happen when we calculate direction
    }
    
    if (!room) return;
    
    // Check if room is on a different map - if so, check if it's a valid connection
    if (room.mapId !== pathingCursorRoom.mapId) {
        const currentRoom = mapRooms.find(r => r.id === pathingCursorRoom.id);
        if (currentRoom && currentRoom.connected_map_id === room.mapId &&
            currentRoom.connected_room_x === room.x &&
            currentRoom.connected_room_y === room.y) {
            // This is a valid map connection - allow it
            const direction = currentRoom.connection_direction || 'CONNECTION';
            addPathStep(room, direction);
            return;
        } else {
            // Room is on different map but not a valid connection
            return;
        }
    }
    
    // Check if room is adjacent to current cursor position (allows cardinal and diagonal)
    const dx = room.x - pathingCursorRoom.x;
    const dy = room.y - pathingCursorRoom.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Allow adjacent rooms (cardinal: dx=0,dy=±1 or dx=±1,dy=0) or diagonal (dx=±1,dy=±1)
    if (absDx > 1 || absDy > 1 || (absDx === 0 && absDy === 0)) {
        // Not adjacent
        return;
    }
    
    // Allow revisiting any room - remove restriction on "already in path"
    // Users can backtrack or cross paths as needed
    // Only special case: if going back to immediately previous room, undo the last step
    const isPreviousRoom = currentPath.length > 0 && 
                          currentPath[currentPath.length - 1].roomId === room.id;
    
    // If going back to previous room, remove the last step (undo)
    if (isPreviousRoom && currentPath.length > 1) {
        console.log(`Pathing: Going back to previous room, removing last step`);
        currentPath.pop();
        updatePathStepCounter();
        renderMap();
        return;
    }
    
    // Calculate direction (supports cardinal and diagonal)
    let direction = '';
    if (dy < 0) direction = 'N';  // North component
    else if (dy > 0) direction = 'S';  // South component
    
    if (dx > 0) direction += 'E';  // East component
    else if (dx < 0) direction += 'W';  // West component
    
    // If no direction calculated, skip (shouldn't happen)
    if (!direction) return;
    
    // Add step directly - no server call needed, just use existing rooms
    addPathStep(room, direction);
}

function handlePathingModeKeypad(key) {
    if (!pathingModeActive || !pathingCursorRoom) return;
    
    // Keypad to direction mapping - supports cardinal and diagonal
    // 7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE
    const directionMap = {
        '7': { dx: -1, dy: 1, dir: 'NW' },  // NW
        '8': { dx: 0, dy: 1, dir: 'N' },   // N
        '9': { dx: 1, dy: 1, dir: 'NE' },   // NE
        '4': { dx: -1, dy: 0, dir: 'W' },  // W
        '6': { dx: 1, dy: 0, dir: 'E' },   // E
        '1': { dx: -1, dy: -1, dir: 'SW' }, // SW
        '2': { dx: 0, dy: -1, dir: 'S' },   // S
        '3': { dx: 1, dy: -1, dir: 'SE' }   // SE
    };
    
    const dir = directionMap[key];
    if (!dir) {
        // Invalid key - ignore
        return;
    }
    
    const targetX = pathingCursorRoom.x + dir.dx;
    const targetY = pathingCursorRoom.y + dir.dy;
    
    // Find room at target position - check current map first
    // Use pathing cursor's map if in pathing mode
    const searchMapId = pathingCursorRoom && pathingCursorRoom.mapId ? pathingCursorRoom.mapId : currentMapId;
    let targetRoom = mapRooms.find(r => 
        r.mapId === searchMapId && 
        r.x === targetX && 
        r.y === targetY
    );
    
    // If not found in current map, check if current room has a connection in this direction
    if (!targetRoom && pathingCursorRoom) {
        const currentRoom = mapRooms.find(r => r.id === pathingCursorRoom.id);
        if (currentRoom && currentRoom.connected_map_id && 
            currentRoom.connection_direction) {
            // Check if direction matches (case-insensitive)
            const connectionDir = currentRoom.connection_direction.toUpperCase();
            const moveDir = dir.dir.toUpperCase();
            if (connectionDir === moveDir) {
                // This is a map connection - request the connected room from server
                console.log(`Pathing: Map connection detected - direction ${dir.dir} to map ${currentRoom.connected_map_id} at (${currentRoom.connected_room_x}, ${currentRoom.connected_room_y})`);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'getPathingRoom',
                        mapId: currentRoom.connected_map_id,
                        x: currentRoom.connected_room_x,
                        y: currentRoom.connected_room_y,
                        direction: dir.dir
                    }));
                    // Wait for response - this will be handled in handleMessage
                    return;
                }
            } else {
                console.log(`Pathing: Connection direction mismatch - room has ${connectionDir}, trying ${moveDir}`);
            }
        } else if (currentRoom && currentRoom.connected_map_id) {
            console.log(`Pathing: Room has connection but direction check failed. Connection dir: ${currentRoom.connection_direction}, Move dir: ${dir.dir}`);
        }
    }
    
    if (!targetRoom) {
        // Room doesn't exist - can't add to path
        console.log(`Pathing: Room at (${targetX}, ${targetY}) does not exist on current map`);
        return;
    }
    
    // Allow revisiting any room - remove restriction
    // Only special case: if going back to immediately previous room, undo the last step
    const isPreviousRoom = currentPath.length > 0 && 
                          currentPath[currentPath.length - 1].roomId === targetRoom.id;
    
    if (isPreviousRoom && currentPath.length > 1) {
        console.log(`Pathing: Going back to previous room, removing last step`);
        currentPath.pop();
        updatePathStepCounter();
        renderMap();
        return;
    }
    
    // Add step directly - no server call needed, just use existing rooms
    console.log(`Pathing: Adding room ${targetRoom.id} (${targetX}, ${targetY}) direction ${dir.dir} from cursor (${pathingCursorRoom.x}, ${pathingCursorRoom.y})`);
    addPathStep(targetRoom, dir.dir);
}

function endPath() {
    if (!pathingModeActive || currentPath.length === 0) return;
    
    // Check if it's a loop (ends at start room)
    const isLoop = pathingCursorRoom.id === pathStartRoom.id;
    const pathType = isLoop ? 'loop' : 'path';
    
    // Generate suggested name
    let suggestedName = '';
    if (isLoop) {
        suggestedName = `Loop: ${pathStartRoom.name} to ${pathStartRoom.name}`;
    } else {
        suggestedName = `Path: ${pathStartRoom.name} to ${pathingCursorRoom.name}`;
    }
    
    // Show name input modal
    const modal = document.getElementById('pathNameModal');
    const input = document.getElementById('pathNameInput');
    const typeText = document.getElementById('pathNameModalType');
    
    if (modal && input && typeText) {
        typeText.textContent = isLoop ? 'This is a loop (starts and ends at the same room).' : 'This is a path (starts and ends at different rooms).';
        input.value = suggestedName;
        modal.style.display = 'block';
        
        // Store path data for saving
        window.pendingPathData = {
            pathType: pathType,
            suggestedName: suggestedName
        };
    }
}

function savePath(name, pathType) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentPlayerName) return;
    if (!currentPath || currentPath.length === 0) return;
    
    // Convert path steps to format expected by server
    // Filter out steps without directions (shouldn't happen, but be safe)
    const validSteps = currentPath
        .filter(step => step.direction && step.direction.trim() !== '')
        .map(step => ({
            roomId: step.roomId,
            direction: step.direction
        }));
    
    if (validSteps.length === 0) {
        addToTerminal('Cannot save path: No valid steps with directions found.', 'error');
        return;
    }
    
    if (validSteps.length < currentPath.length) {
        console.warn(`Filtered out ${currentPath.length - validSteps.length} steps without directions when saving path`);
    }
    
    ws.send(JSON.stringify({
        type: 'savePath',
        name: name,
        pathType: pathType,
        mapId: currentMapId,
        originRoomId: pathStartRoom.id,
        steps: validSteps
    }));
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
    
    // Double-click to open map editor (god mode only)
    // Add click handler for pathing mode
    mapCanvas.addEventListener('click', (e) => {
        if (pathingModeActive) {
            handlePathingModeClick(e);
            return;
        }
    });
    
    mapCanvas.addEventListener('dblclick', (e) => {
        if (godMode) {
            window.location.href = '/map';
        }
    });
    
}

// Get room at screen coordinates
function getRoomAtScreenPosition(screenX, screenY) {
    if (!mainMapRenderer || mapRooms.length === 0) return null;
    
    return mainMapRenderer.getRoomAtPosition(screenX, screenY, mapRooms.filter(room => room.mapId === currentMapId));
}

// Show map tooltip
function showMapTooltip(room, mouseX, mouseY) {
    if (!mapTooltip) return;
    
    const roomId = room.id || 'N/A';
    mapTooltip.innerHTML = `<strong>${room.name || 'Room'}</strong><br>(${room.x}, ${room.y})<br>ID: ${roomId}`;
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
    if (!mainMapRenderer) return;
    
    // In pathing mode, use the pathing cursor's map, otherwise use current map
    const renderMapId = pathingModeActive && pathingCursorRoom ? pathingCursorRoom.mapId : currentMapId;
    
    // Filter to only rooms from the map we're rendering
    const currentMapRooms = mapRooms.filter(room => room.mapId === renderMapId);
    
    // In pathing mode, center on pathing cursor instead of actual player position
    const centerRoom = pathingModeActive && pathingCursorRoom ? pathingCursorRoom : currentRoomPos;
    
    // Render using MapRenderer
    mainMapRenderer.render(currentMapRooms, centerRoom);
    
    // If in pathing mode, draw pathing indicators
    // Use the same coordinate system as MapRenderer.drawRoom() to ensure perfect alignment
    if (pathingModeActive && mainMapRenderer.renderedBounds) {
        const { minX, maxX, minY, maxY, cellSize, offsetX, offsetY } = mainMapRenderer.renderedBounds;
        const ctx = mainMapRenderer.ctx;
        
        // Use same room drawing coordinates as MapRenderer.drawRoom()
        // Rooms are drawn at screenX + 1, screenY + 1 with size cellSize - 2
        const roomSize = cellSize - 2;
        
        // Draw path rooms - only highlight rooms that actually exist in mapRooms
        currentPath.forEach((step, index) => {
            // Verify this room exists in mapRooms before drawing
            const roomExists = currentMapRooms.some(r => 
                r.id === step.roomId && 
                r.x === step.x && 
                r.y === step.y
            );
            
            if (!roomExists) {
                console.warn('Path step references non-existent room:', step);
                return; // Skip drawing if room doesn't exist
            }
            
            if (step.x >= minX && step.x <= maxX && step.y >= minY && step.y <= maxY) {
                // Use exact same coordinates as MapRenderer.drawRoom()
                const screenX = offsetX + (step.x - minX) * cellSize;
                const screenY = offsetY + (maxY - step.y) * cellSize;
                
                // Highlight path rooms (overlay on existing room using same coordinates)
                ctx.fillStyle = 'rgba(136, 136, 255, 0.5)';
                ctx.fillRect(screenX + 1, screenY + 1, roomSize, roomSize);
                ctx.strokeStyle = '#6666cc';
                ctx.lineWidth = 2;
                ctx.strokeRect(screenX + 1, screenY + 1, roomSize, roomSize);
                
                // Draw start room with special indicator
                if (index === 0 && pathStartRoom) {
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                    ctx.fillRect(screenX + 1, screenY + 1, roomSize, roomSize);
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(screenX + 1, screenY + 1, roomSize, roomSize);
                }
            }
        });
        
        // Draw current cursor position - only if room exists
        if (pathingCursorRoom) {
            const cursorRoomExists = currentMapRooms.some(r => 
                r.id === pathingCursorRoom.id && 
                r.x === pathingCursorRoom.x && 
                r.y === pathingCursorRoom.y
            );
            
            if (cursorRoomExists && 
                pathingCursorRoom.x >= minX && pathingCursorRoom.x <= maxX && 
                pathingCursorRoom.y >= minY && pathingCursorRoom.y <= maxY) {
                // Use exact same coordinates as MapRenderer.drawRoom()
                const screenX = offsetX + (pathingCursorRoom.x - minX) * cellSize;
                const screenY = offsetY + (maxY - pathingCursorRoom.y) * cellSize;
                
                // Draw cursor indicator (overlay on existing room using same coordinates)
                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                ctx.fillRect(screenX + 1, screenY + 1, roomSize, roomSize);
                ctx.strokeStyle = '#ffaa00';
                ctx.lineWidth = 2;
                ctx.strokeRect(screenX + 1, screenY + 1, roomSize, roomSize);
            }
        }
        
        // Draw connections between path rooms (only between existing rooms)
        ctx.strokeStyle = '#8888ff';
        ctx.lineWidth = 1;
        for (let i = 0; i < currentPath.length - 1; i++) {
            const step1 = currentPath[i];
            const step2 = currentPath[i + 1];
            
            // Verify both rooms exist
            const room1Exists = currentMapRooms.some(r => r.id === step1.roomId);
            const room2Exists = currentMapRooms.some(r => r.id === step2.roomId);
            
            if (room1Exists && room2Exists &&
                step1.x >= minX && step1.x <= maxX && step1.y >= minY && step1.y <= maxY &&
                step2.x >= minX && step2.x <= maxX && step2.y >= minY && step2.y <= maxY) {
                // Use room centers for connection lines (matching MapRenderer.drawConnections)
                const x1 = offsetX + (step1.x - minX) * cellSize;
                const y1 = offsetY + (maxY - step1.y) * cellSize;
                const x2 = offsetX + (step2.x - minX) * cellSize;
                const y2 = offsetY + (maxY - step2.y) * cellSize;
                
                const centerX1 = x1 + cellSize / 2;
                const centerY1 = y1 + cellSize / 2;
                const centerX2 = x2 + cellSize / 2;
                const centerY2 = y2 + cellSize / 2;
                
                ctx.beginPath();
                ctx.moveTo(centerX1, centerY1);
                ctx.lineTo(centerX2, centerY2);
                ctx.stroke();
            }
        }
    }
    
    // Always draw current room indicator, even if room not found in mapRooms
    // This ensures the player position is always visible
    if (mainMapRenderer.renderedBounds) {
        const { minX, maxX, minY, maxY, cellSize, offsetX, offsetY } = mainMapRenderer.renderedBounds;
        
        if (currentRoomPos.x >= minX && currentRoomPos.x <= maxX && 
            currentRoomPos.y >= minY && currentRoomPos.y <= maxY) {
            const screenX = offsetX + (currentRoomPos.x - minX) * cellSize;
            const screenY = offsetY + (maxY - currentRoomPos.y) * cellSize;
            
            // Check if we already drew this room
            const roomExists = currentMapRooms.some(r => 
                r.x === currentRoomPos.x && 
                r.y === currentRoomPos.y
            );
            
            if (!roomExists) {
                // Draw current room indicator (bright green with yellow border)
                mapCtx.fillStyle = '#00ff00';
                mapCtx.fillRect(screenX + 1, screenY + 1, cellSize - 2, cellSize - 2);
                mapCtx.strokeStyle = '#ffff00';
                mapCtx.lineWidth = 2;
                mapCtx.strokeRect(screenX + 1, screenY + 1, cellSize - 2, cellSize - 2);
            }
        }
    }
}


// Initialize WebSocket connection when page loads
connectWebSocket();

// God Mode Variables
let godMode = false;

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
                            <option value=\"lorekeeper\" ${selectedNpc.npc_type === 'lorekeeper' ? 'selected' : ''}>lorekeeper</option>
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
                <div class=\"npc-row\" id=\"npcStandardFields\">
                    <div class=\"npc-field-group npc-field-full\">
                        <label>Failure States<span class=\"npc-json-label\"> (JSON)</span></label>
                        <textarea id=\"npcFailureStates\" class=\"npc-json-textarea\">${selectedNpc.failure_states || ''}</textarea>
                    </div>
                </div>
                
                <!-- Glow Codex Puzzle Section (shown when puzzle_type = glow_codex) -->
                <div id=\"glowCodexPuzzleFields\" class=\"glow-codex-section\" style=\"display: ${selectedNpc.puzzle_type === 'glow_codex' ? 'block' : 'none'};\">
                    <div class=\"npc-section-title\">Glow Codex Puzzle</div>
                    <!-- Row GC1: Puzzle Type -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <label>Puzzle Type</label>
                            <select id=\"npcPuzzleType\">
                                <option value=\"none\" ${(selectedNpc.puzzle_type || 'none') === 'none' ? 'selected' : ''}>none</option>
                                <option value=\"glow_codex\" ${selectedNpc.puzzle_type === 'glow_codex' ? 'selected' : ''}>glow_codex</option>
                            </select>
                        </div>
                    </div>
                    <!-- Row GC2: Glow Clues (JSON array) -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <label>Glow Clues<span class=\"npc-json-label\"> (JSON array: [\"clue with <glowword>\", ...])</span></label>
                            <textarea id=\"npcPuzzleGlowClues\" class=\"npc-json-textarea\" placeholder='[\"Pulsewood <resin> is the first...\", \"If you quiet your breath, you can feel the natural <hum>...\"]'>${selectedNpc.puzzle_glow_clues || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row GC3: Extraction Pattern + Solution -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-half\">
                            <label>Extraction Pattern<span class=\"npc-json-label\"> (JSON array: [1,2,3,4])</span></label>
                            <input type=\"text\" id=\"npcPuzzleExtractionPattern\" value=\"${selectedNpc.puzzle_extraction_pattern || '[1,2,3,4]'}\" placeholder=\"[1,2,3,4]\">
                        </div>
                        <div class=\"npc-field-group npc-field-half\">
                            <label>Solution Word</label>
                            <input type=\"text\" id=\"npcPuzzleSolutionWord\" value=\"${selectedNpc.puzzle_solution_word || ''}\" placeholder=\"rune\">
                        </div>
                    </div>
                    <!-- Row GC4: Success Response -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <label>Success Response</label>
                            <textarea id=\"npcPuzzleSuccessResponse\" class=\"npc-textarea\">${selectedNpc.puzzle_success_response || 'Yes… you have seen the hidden thread. Take this. You will need it.'}</textarea>
                        </div>
                    </div>
                    <!-- Row GC5: Failure Response -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <label>Failure Response</label>
                            <textarea id=\"npcPuzzleFailureResponse\" class=\"npc-textarea\">${selectedNpc.puzzle_failure_response || 'That is not the answer I seek.'}</textarea>
                        </div>
                    </div>
                    <!-- Row GC6: Reward Item -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <label>Reward Item (optional)</label>
                            <input type=\"text\" id=\"npcPuzzleRewardItem\" value=\"${selectedNpc.puzzle_reward_item || ''}\" placeholder=\"Harvester Rune\">
                        </div>
                    </div>
                    <!-- Row GC7: Template Button -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <button type=\"button\" id=\"loadGlowCodexTemplate\" class=\"npc-template-btn\">Load Example Template</button>
                        </div>
                    </div>
                </div>
                
                <!-- Lore Keeper Specific Fields (shown when type = lorekeeper) -->
                <div id=\"loreKeeperFields\" class=\"lorekeeper-section\" style=\"display: ${selectedNpc.npc_type === 'lorekeeper' ? 'block' : 'none'};\">
                    <div class=\"npc-section-title\">Lore Keeper Configuration</div>
                    <!-- Row LK1: Lore Type + Engagement Enabled + Engagement Delay -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-third\">
                            <label>Lore Type</label>
                            <select id=\"lkLoreType\">
                                <option value=\"dialogue\" ${selectedNpc.lorekeeper?.lore_type === 'dialogue' ? 'selected' : ''}>dialogue</option>
                                <option value=\"puzzle\" ${selectedNpc.lorekeeper?.lore_type === 'puzzle' ? 'selected' : ''}>puzzle</option>
                            </select>
                        </div>
                        <div class=\"npc-field-group npc-field-third\">
                            <label>Engagement</label>
                            <select id=\"lkEngagementEnabled\">
                                <option value=\"1\" ${selectedNpc.lorekeeper?.engagement_enabled !== false ? 'selected' : ''}>Enabled</option>
                                <option value=\"0\" ${selectedNpc.lorekeeper?.engagement_enabled === false ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <div class=\"npc-field-group npc-field-third\">
                            <label>Delay (ms)</label>
                            <input type=\"number\" id=\"lkEngagementDelay\" value=\"${selectedNpc.lorekeeper?.engagement_delay || 3000}\">
                        </div>
                    </div>
                    <!-- Row LK2: Initial Message (full width) -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-full\">
                            <label>Initial Message</label>
                            <textarea id=\"lkInitialMessage\" class=\"npc-textarea\">${selectedNpc.lorekeeper?.initial_message || ''}</textarea>
                        </div>
                    </div>
                    <!-- Row LK3: Initial Message Color + Keyword Color -->
                    <div class=\"npc-row\">
                        <div class=\"npc-field-group npc-field-half\">
                            <label>Initial Msg Color</label>
                            <input type=\"text\" id=\"lkInitialMessageColor\" value=\"${selectedNpc.lorekeeper?.initial_message_color || '#00ffff'}\" placeholder=\"#00ffff\">
                        </div>
                        <div class=\"npc-field-group npc-field-half\">
                            <label>Keyword Color</label>
                            <input type=\"text\" id=\"lkKeywordColor\" value=\"${selectedNpc.lorekeeper?.keyword_color || '#ff00ff'}\" placeholder=\"#ff00ff\">
                        </div>
                    </div>
                    
                    <!-- Dialogue-specific fields -->
                    <div id=\"lkDialogueFields\" style=\"display: ${(selectedNpc.lorekeeper?.lore_type || 'dialogue') === 'dialogue' ? 'block' : 'none'};\">
                        <div class=\"npc-row\">
                            <div class=\"npc-field-group npc-field-full\">
                                <label>Keywords/Responses<span class=\"npc-json-label\"> (JSON: {\"keyword\": \"response\", ...})</span></label>
                                <textarea id=\"lkKeywordsResponses\" class=\"npc-json-textarea\">${selectedNpc.lorekeeper?.keywords_responses || ''}</textarea>
                            </div>
                        </div>
                        <div class=\"npc-row\">
                            <div class=\"npc-field-group npc-field-full\">
                                <label>Incorrect Response</label>
                                <input type=\"text\" id=\"lkIncorrectResponse\" value=\"${selectedNpc.lorekeeper?.incorrect_response || 'I do not understand what you mean.'}\">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Puzzle-specific fields -->
                    <div id=\"lkPuzzleFields\" style=\"display: ${selectedNpc.lorekeeper?.lore_type === 'puzzle' ? 'block' : 'none'};\">
                        <div class=\"npc-row\">
                            <div class=\"npc-field-group npc-field-half\">
                                <label>Puzzle Mode</label>
                                <select id=\"lkPuzzleMode\">
                                    <option value=\"word\" ${selectedNpc.lorekeeper?.puzzle_mode === 'word' ? 'selected' : ''}>word</option>
                                    <option value=\"combination\" ${selectedNpc.lorekeeper?.puzzle_mode === 'combination' ? 'selected' : ''}>combination</option>
                                    <option value=\"cipher\" ${selectedNpc.lorekeeper?.puzzle_mode === 'cipher' ? 'selected' : ''}>cipher</option>
                                </select>
                            </div>
                            <div class=\"npc-field-group npc-field-half\">
                                <label>Solution</label>
                                <input type=\"text\" id=\"lkPuzzleSolution\" value=\"${selectedNpc.lorekeeper?.puzzle_solution || ''}\">
                            </div>
                        </div>
                        <div class=\"npc-row\">
                            <div class=\"npc-field-group npc-field-full\">
                                <label>Clues<span class=\"npc-json-label\"> (JSON array: [\"clue1\", \"clue2\", ...])</span></label>
                                <textarea id=\"lkPuzzleClues\" class=\"npc-json-textarea\">${selectedNpc.lorekeeper?.puzzle_clues || ''}</textarea>
                            </div>
                        </div>
                        <div class=\"npc-row\">
                            <div class=\"npc-field-group npc-field-full\">
                                <label>Success Message</label>
                                <textarea id=\"lkPuzzleSuccessMessage\" class=\"npc-textarea\">${selectedNpc.lorekeeper?.puzzle_success_message || ''}</textarea>
                            </div>
                        </div>
                        <div class=\"npc-row\">
                            <div class=\"npc-field-group npc-field-full\">
                                <label>Failure Message</label>
                                <input type=\"text\" id=\"lkPuzzleFailureMessage\" value=\"${selectedNpc.lorekeeper?.puzzle_failure_message || 'That is not the answer I seek.'}\">
                            </div>
                        </div>
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

    // Wire up NPC type change to show/hide Lore Keeper fields
    const npcTypeSelect = document.getElementById('npcType');
    const loreKeeperFields = document.getElementById('loreKeeperFields');
    const standardFields = document.getElementById('npcStandardFields');
    if (npcTypeSelect && loreKeeperFields) {
        npcTypeSelect.addEventListener('change', () => {
            const isLoreKeeper = npcTypeSelect.value === 'lorekeeper';
            loreKeeperFields.style.display = isLoreKeeper ? 'block' : 'none';
            // Optionally hide standard NPC fields for Lore Keepers
            // if (standardFields) standardFields.style.display = isLoreKeeper ? 'none' : 'block';
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

    // Wire up template button
    const templateBtn = document.getElementById('loadGlowCodexTemplate');
    if (templateBtn) {
        templateBtn.addEventListener('click', () => {
            const glowCluesEl = document.getElementById('npcPuzzleGlowClues');
            const extractionPatternEl = document.getElementById('npcPuzzleExtractionPattern');
            const solutionEl = document.getElementById('npcPuzzleSolutionWord');
            const successEl = document.getElementById('npcPuzzleSuccessResponse');
            const failureEl = document.getElementById('npcPuzzleFailureResponse');
            const rewardEl = document.getElementById('npcPuzzleRewardItem');
            
            if (glowCluesEl) {
                glowCluesEl.value = JSON.stringify([
                    "Pulsewood <resin> is the first substance every seeker must learn; without it, no Binder can form.",
                    "If you quiet your breath, you can feel the natural <hum> beneath Newhaven.",
                    "Ancient Pulsewood trunks are wrapped in living <vines> for centuries.",
                    "Every Lore Keeper shapes a single <rune> to keep the Pulse in balance."
                ], null, 2);
            }
            if (extractionPatternEl) extractionPatternEl.value = '[1,2,3,4]';
            if (solutionEl) solutionEl.value = 'rune';
            if (successEl) successEl.value = 'Yes… you have seen the hidden thread. Take this. You will need it.';
            if (failureEl) failureEl.value = 'That is not the answer I seek.';
            if (rewardEl) rewardEl.value = 'Harvester Rune';
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

    const puzzle_type = document.getElementById('npcPuzzleType')?.value || 'none';
    const puzzle_glow_clues = document.getElementById('npcPuzzleGlowClues')?.value.trim() || null;
    const puzzle_extraction_pattern = document.getElementById('npcPuzzleExtractionPattern')?.value.trim() || null;
    const puzzle_solution_word = document.getElementById('npcPuzzleSolutionWord')?.value.trim() || null;
    const puzzle_success_response = document.getElementById('npcPuzzleSuccessResponse')?.value.trim() || null;
    const puzzle_failure_response = document.getElementById('npcPuzzleFailureResponse')?.value.trim() || null;
    const puzzle_reward_item = document.getElementById('npcPuzzleRewardItem')?.value.trim() || null;

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
        active,
        puzzle_type,
        puzzle_glow_clues,
        puzzle_extraction_pattern,
        puzzle_solution_word,
        puzzle_success_response,
        puzzle_failure_response,
        puzzle_reward_item
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
    
    // Show/hide god mode widget icon based on god mode
    const godmodeIcon = document.getElementById('godmode-widget-icon');
    if (godmodeIcon) {
        if (hasGodMode) {
            godmodeIcon.classList.remove('hidden');
        } else {
            godmodeIcon.classList.add('hidden');
            // Also hide the widget if it's visible
            const widget = document.getElementById('widget-godmode');
            if (widget) {
                widget.classList.add('hidden');
            }
            // Remove godmode from active widgets
            activeWidgets = activeWidgets.filter(w => w !== 'godmode');
        }
    }
    
    updateWidgetDisplay();
    saveWidgetConfig();
}

// ============================================================
// WIDGET MANAGEMENT SYSTEM
// ============================================================

// Toggle a widget on/off
function toggleWidget(widgetName) {
    if (!TOGGLEABLE_WIDGETS.includes(widgetName)) return;
    
    const isActive = activeWidgets.includes(widgetName);
    
    // Special handling for scripting widget
    if (widgetName === 'scripting') {
        if (isActive) {
            // Hide scripting widget
            activeWidgets = activeWidgets.filter(w => w !== 'scripting');
        } else {
            // Show scripting widget - it takes 2 slots
            // Scripting takes 2 slots, so we need to clear space if needed
            // Only keep widgets that fit (scripting + up to 2 other widgets)
            if (activeWidgets.length >= 2) {
                // Remove widgets to make room, but keep scripting
                activeWidgets = activeWidgets.filter(w => w !== 'scripting');
                // Keep only the first 2 widgets (or none if we want empty slots)
                activeWidgets = activeWidgets.slice(0, 2);
            }
            activeWidgets.push('scripting');
        }
        updateWidgetDisplay();
        saveWidgetConfig();
        return;
    }
    
    if (isActive) {
        // Hide the widget (but don't allow hiding if it would leave no widgets)
        // Also, if hiding stats, make sure we have room for automatic widgets
        // Don't allow hiding map or comms if scripting is open
        if (activeWidgets.includes('scripting')) {
            if (widgetName === 'map' || widgetName === 'comms') {
                return; // Can't hide map/comms when scripting is open
            }
        }
        
        const willHaveSpace = activeWidgets.length > 1 || (npcWidgetVisible || factoryWidgetVisible);
        if (!willHaveSpace && widgetName !== 'stats') {
            // Can't hide the last toggleable widget unless it's stats
            return;
        }
        activeWidgets = activeWidgets.filter(w => w !== widgetName);
    } else {
        // Show the widget
        // If scripting is open, we can only show map or comms
        if (activeWidgets.includes('scripting')) {
            if (widgetName !== 'map' && widgetName !== 'comms') {
                return; // Can't show other widgets when scripting is open
            }
        }
        
        // Calculate available slots (4 total, minus automatic widgets, minus scripting if active)
        const automaticWidgetCount = (npcWidgetVisible ? 1 : 0) + (factoryWidgetVisible ? 1 : 0);
        const scriptingTakesSlots = activeWidgets.includes('scripting') ? 2 : 0;
        const maxToggleableWidgets = 4 - automaticWidgetCount - scriptingTakesSlots;
        
        if (activeWidgets.length >= maxToggleableWidgets) {
            // At max capacity - automatically remove stats and put new widget in top-left
            if (activeWidgets.includes('stats')) {
                // Remove stats and add new widget at the beginning (top-left position)
                activeWidgets = activeWidgets.filter(w => w !== 'stats');
                if (widgetName === 'stats') {
                    // If adding stats back, put it first
                    activeWidgets = ['stats', ...activeWidgets];
                } else {
                    // Put new widget first (top-left position)
                    activeWidgets = [widgetName, ...activeWidgets];
                }
            } else {
                // No stats in list, just remove last widget
                activeWidgets.pop();
                if (widgetName === 'stats') {
                    // If adding stats, put it first
                    activeWidgets = ['stats', ...activeWidgets];
                } else {
                    activeWidgets.push(widgetName);
                }
            }
        } else {
            // Have space, just add the widget
            if (widgetName === 'stats') {
                // Stats always goes first
                activeWidgets = ['stats', ...activeWidgets.filter(w => w !== 'stats')];
            } else {
                activeWidgets.push(widgetName);
            }
        }
        
        // If toggling warehouse widget on, request warehouse data
        if (widgetName === 'warehouse' && hasWarehouseDeed) {
            // Request warehouse widget state (will show read-only if not in warehouse room)
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'warehouse' }));
            }
        }
    }
    
    updateWidgetDisplay();
    saveWidgetConfig();
}

// Save widget configuration to database
function saveWidgetConfig() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentPlayerName) return;
    
    const config = {
        activeWidgets: activeWidgets,
        scriptingWidgetPosition: scriptingWidgetPosition
    };
    
    console.log('Saving widget config:', config);
    ws.send(JSON.stringify({
        type: 'updateWidgetConfig',
        config: config
    }));
}

// Update the widget display based on activeWidgets state
// activeWidgets is the SOURCE OF TRUTH - this function makes the UI match it
function updateWidgetDisplay() {
    const slots = document.querySelectorAll('.widget-slot');
    const toggleBar = document.querySelector('.widget-toggle-bar');
    
    // Step 1: Update toggle bar icons
    // - Show/hide icons based on availability (godmode only if god mode, warehouse only if has deed)
    // - Highlight active icons (those in activeWidgets)
    TOGGLEABLE_WIDGETS.forEach(widgetName => {
        const icon = toggleBar?.querySelector(`[data-widget="${widgetName}"]`);
        if (!icon) return;
        
        // Handle icon visibility
        if (widgetName === 'godmode') {
            if (godMode) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
                return; // Don't process further for hidden godmode icon
            }
        } else if (widgetName === 'warehouse') {
            if (hasWarehouseDeed) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
                return; // Don't process further for hidden warehouse icon
            }
        }
        
        // Update active state (highlighted = in activeWidgets)
        if (activeWidgets.includes(widgetName)) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    });
    
    // Update compass button states based on auto-navigation
    updateCompassButtonsState();
    
    // Step 2: Handle scripting widget specially (takes 2 slots)
    const scriptingIsActive = activeWidgets.includes('scripting');
    
    if (scriptingIsActive) {
        // Hide all regular widgets first (except map, comms, and scripting)
        TOGGLEABLE_WIDGETS.forEach(widgetName => {
            const widget = document.getElementById(`widget-${widgetName}`);
            if (widget && widgetName !== 'scripting' && widgetName !== 'map' && widgetName !== 'comms') {
                widget.classList.add('hidden');
            }
        });
        
        // Hide auto-managed widgets
        ['npc', 'factory'].forEach(widgetName => {
            const widget = document.getElementById(`widget-${widgetName}`);
            if (widget) {
                widget.classList.add('hidden');
            }
        });
        
        // Get regular slots (0, 1, 2, 3)
        const regularSlots = document.querySelectorAll('.widget-slot[data-slot="0"], .widget-slot[data-slot="1"], .widget-slot[data-slot="2"], .widget-slot[data-slot="3"]');
        const scriptingTopSlot = document.querySelector('.scripting-widget-slot[data-slot="scripting-top"]');
        const scriptingBottomSlot = document.querySelector('.scripting-widget-slot[data-slot="scripting-bottom"]');
        const scriptingWidget = document.getElementById('widget-scripting');
        const mapWidget = document.getElementById('widget-map');
        const commsWidget = document.getElementById('widget-comms');
        
        // Hide scripting slots first
        if (scriptingTopSlot) scriptingTopSlot.style.display = 'none';
        if (scriptingBottomSlot) scriptingBottomSlot.style.display = 'none';
        
        // Load paths when scripting widget becomes visible
        if (activeWidgets.includes('scripting')) {
            loadAllPlayerPaths();
        }
        
        // Position scripting widget based on scriptingWidgetPosition
        if (scriptingWidgetPosition === 'top') {
            // Top row: scripting takes slots 0-1, map/comms take slots 2-3
            if (scriptingTopSlot && scriptingWidget) {
                scriptingTopSlot.style.display = 'block';
                if (scriptingWidget.parentElement !== scriptingTopSlot) {
                    scriptingTopSlot.appendChild(scriptingWidget);
                }
                scriptingWidget.classList.remove('hidden');
            }
            
            // Show map and comms in bottom row (slots 2 and 3) only if they're in activeWidgets
            if (activeWidgets.includes('map') && mapWidget && regularSlots[2]) {
                regularSlots[2].style.display = 'block';
                if (mapWidget.parentElement !== regularSlots[2]) {
                    regularSlots[2].appendChild(mapWidget);
                }
                mapWidget.classList.remove('hidden');
                // Ensure map renders when shown
                if (mapCanvas && mainMapRenderer) {
                    requestAnimationFrame(() => {
                        const viewport = document.querySelector('.map-viewport');
                        if (viewport && mapCanvas) {
                            const newWidth = viewport.clientWidth;
                            const newHeight = viewport.clientHeight;
                            if (newWidth > 0 && newHeight > 0) {
                                mapCanvas.width = newWidth;
                                mapCanvas.height = newHeight;
                                mainMapRenderer.canvas = mapCanvas;
                                mainMapRenderer.ctx = mapCtx;
                                renderMap();
                            }
                        }
                    });
                }
            } else if (mapWidget) {
                mapWidget.classList.add('hidden');
            }
            
            if (activeWidgets.includes('comms') && commsWidget && regularSlots[3]) {
                regularSlots[3].style.display = 'block';
                if (commsWidget.parentElement !== regularSlots[3]) {
                    regularSlots[3].appendChild(commsWidget);
                }
                commsWidget.classList.remove('hidden');
            } else if (commsWidget) {
                commsWidget.classList.add('hidden');
            }
            
            // Hide top row regular slots (0 and 1) since scripting spans them
            if (regularSlots[0]) regularSlots[0].style.display = 'none';
            if (regularSlots[1]) regularSlots[1].style.display = 'none';
        } else {
            // Bottom row: map/comms take slots 0-1, scripting takes slots 2-3
            if (scriptingBottomSlot && scriptingWidget) {
                scriptingBottomSlot.style.display = 'block';
                if (scriptingWidget.parentElement !== scriptingBottomSlot) {
                    scriptingBottomSlot.appendChild(scriptingWidget);
                }
                scriptingWidget.classList.remove('hidden');
            }
            
            // Show map and comms in top row (slots 0 and 1) only if they're in activeWidgets
            if (activeWidgets.includes('map') && mapWidget && regularSlots[0]) {
                regularSlots[0].style.display = 'block';
                if (mapWidget.parentElement !== regularSlots[0]) {
                    regularSlots[0].appendChild(mapWidget);
                }
                mapWidget.classList.remove('hidden');
                // Ensure map renders when shown
                if (mapCanvas && mainMapRenderer) {
                    requestAnimationFrame(() => {
                        const viewport = document.querySelector('.map-viewport');
                        if (viewport && mapCanvas) {
                            const newWidth = viewport.clientWidth;
                            const newHeight = viewport.clientHeight;
                            if (newWidth > 0 && newHeight > 0) {
                                mapCanvas.width = newWidth;
                                mapCanvas.height = newHeight;
                                mainMapRenderer.canvas = mapCanvas;
                                mainMapRenderer.ctx = mapCtx;
                                renderMap();
                            }
                        }
                    });
                }
            } else if (mapWidget) {
                mapWidget.classList.add('hidden');
            }
            
            if (activeWidgets.includes('comms') && commsWidget && regularSlots[1]) {
                regularSlots[1].style.display = 'block';
                if (commsWidget.parentElement !== regularSlots[1]) {
                    regularSlots[1].appendChild(commsWidget);
                }
                commsWidget.classList.remove('hidden');
            } else if (commsWidget) {
                commsWidget.classList.add('hidden');
            }
            
            // Hide bottom row regular slots (2 and 3) since scripting spans them
            if (regularSlots[2]) regularSlots[2].style.display = 'none';
            if (regularSlots[3]) regularSlots[3].style.display = 'none';
        }
        
        // Make scripting widget draggable to switch position
        if (scriptingWidget) {
            scriptingWidget.draggable = true;
            scriptingWidget.dataset.widgetName = 'scripting';
        }
        
        // Initialize drag and drop handlers
        initWidgetDragDrop();
        return; // Early return for scripting mode
    }
    
    // Step 3: Normal widget display (scripting not active)
    // Hide scripting widget slots
    document.querySelectorAll('.scripting-widget-slot').forEach(slot => {
        slot.style.display = 'none';
    });
    
    // Show regular slots (0, 1, 2, 3) - will be hidden individually if empty
    document.querySelectorAll('.widget-slot[data-slot="0"], .widget-slot[data-slot="1"], .widget-slot[data-slot="2"], .widget-slot[data-slot="3"]').forEach(slot => {
        slot.style.display = 'block';
    });
    
    // Build list of widgets to actually display in slots
    // Auto-managed widgets (factory, npc) take priority, then activeWidgets
    let widgetsToShow = [];
    
    // Factory widget takes slot if visible (auto-managed)
    if (factoryWidgetVisible) {
        widgetsToShow.push('factory');
    }
    
    // NPC widget takes slot if visible (auto-managed)
    if (npcWidgetVisible) {
        widgetsToShow.push('npc');
    }
    
    // Add toggleable widgets from activeWidgets (filtered by availability)
    const filteredActiveWidgets = activeWidgets.filter(w => {
        if (w === 'godmode' && !godMode) return false;
        if (w === 'warehouse' && !hasWarehouseDeed) return false;
        return true;
    });
    widgetsToShow.push(...filteredActiveWidgets);
    
    // Limit to 4 slots
    widgetsToShow = widgetsToShow.slice(0, 4);
    
    // Step 4: Hide ALL widgets first (clean slate)
    // Hide all toggleable widgets
    TOGGLEABLE_WIDGETS.forEach(widgetName => {
        const widget = document.getElementById(`widget-${widgetName}`);
        if (widget) {
            widget.classList.add('hidden');
        }
    });
    // Also hide auto-managed widgets if not in widgetsToShow
    ['npc', 'factory'].forEach(widgetName => {
        const widget = document.getElementById(`widget-${widgetName}`);
        if (widget && !widgetsToShow.includes(widgetName)) {
            widget.classList.add('hidden');
        }
    });
    // Hide empty widget placeholders
    document.querySelectorAll('.widget-empty').forEach(w => w.classList.add('hidden'));
    
    // Step 5: Show widgets in their slots
    const regularSlots = document.querySelectorAll('.widget-slot[data-slot]:not([data-slot^="scripting"])');
    regularSlots.forEach((slot, index) => {
        if (index < widgetsToShow.length) {
            const widgetName = widgetsToShow[index];
            const widgetId = `widget-${widgetName}`;
            const widget = document.getElementById(widgetId);
            
            if (widget) {
                // Show the slot since it has a widget
                slot.style.display = 'block';
                
                // Move widget to this slot if needed
                if (widget.parentElement !== slot) {
                    slot.appendChild(widget);
                }
                widget.classList.remove('hidden');
                
                // Special handling for map widget - ensure it renders when shown
                if (widgetName === 'map' && mapCanvas && mainMapRenderer) {
                    // Use requestAnimationFrame to ensure viewport has dimensions
                    requestAnimationFrame(() => {
                        const viewport = document.querySelector('.map-viewport');
                        if (viewport && mapCanvas) {
                            const newWidth = viewport.clientWidth;
                            const newHeight = viewport.clientHeight;
                            if (newWidth > 0 && newHeight > 0) {
                                mapCanvas.width = newWidth;
                                mapCanvas.height = newHeight;
                                // Update renderer canvas reference
                                mainMapRenderer.canvas = mapCanvas;
                                mainMapRenderer.ctx = mapCtx;
                                renderMap();
                            }
                        }
                    });
                }
                
                // Special handling for runekeeper widget - load ASCII art
                if (widgetName === 'runekeeper') {
                    loadRuneKeeperArt();
                }
                
                // Make toggleable widgets draggable
                if (TOGGLEABLE_WIDGETS.includes(widgetName)) {
                    widget.draggable = true;
                    widget.dataset.widgetName = widgetName;
                }
            } else {
                // Widget not found - hide the slot
                slot.style.display = 'none';
            }
        } else {
            // Hide empty slots - don't show placeholder
            slot.style.display = 'none';
        }
    });
    
    // Initialize drag and drop handlers
    initWidgetDragDrop();
}

// Initialize widget drag and drop (using event delegation)
let widgetDragDropInitialized = false;
function initWidgetDragDrop() {
    // Only initialize once
    if (widgetDragDropInitialized) return;
    widgetDragDropInitialized = true;
    
    // Use event delegation on widget grid to handle drag and drop
    const widgetGrid = document.querySelector('.widget-grid');
    if (!widgetGrid) return;
    
    // Handle dragstart on widgets
    widgetGrid.addEventListener('dragstart', (e) => {
        const widget = e.target.closest('.widget[draggable="true"]');
        if (!widget) return;
        
        const widgetName = widget.dataset.widgetName;
        if (!widgetName) return;
        
        e.dataTransfer.setData('text/plain', widgetName);
        e.dataTransfer.effectAllowed = 'move';
        widget.style.opacity = '0.5';
    });
    
    // Handle dragend on widgets
    widgetGrid.addEventListener('dragend', (e) => {
        const widget = e.target.closest('.widget[draggable="true"]');
        if (!widget) return;
        
        widget.style.opacity = '1';
        // Remove drag-over class from all slots
        document.querySelectorAll('.widget-slot').forEach(slot => {
            slot.classList.remove('widget-drag-over');
        });
    });
    
    // Handle dragover on slots
    widgetGrid.addEventListener('dragover', (e) => {
        const slot = e.target.closest('.widget-slot');
        if (!slot) return;
        
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('widget-drag-over');
    });
    
    // Handle dragleave on slots
    widgetGrid.addEventListener('dragleave', (e) => {
        const slot = e.target.closest('.widget-slot');
        if (!slot) return;
        
        // Only remove class if we're actually leaving the slot
        const rect = slot.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            slot.classList.remove('widget-drag-over');
        }
    });
    
    // Handle drop on slots
    widgetGrid.addEventListener('drop', (e) => {
        const slot = e.target.closest('.widget-slot');
        if (!slot) return;
        
        e.preventDefault();
        slot.classList.remove('widget-drag-over');
        
        const widgetName = e.dataTransfer.getData('text/plain');
        if (!widgetName) return;
        
        // Special handling for scripting widget - detect row change
        if (widgetName === 'scripting' && activeWidgets.includes('scripting')) {
            const slotData = slot.dataset.slot;
            if (slotData === 'scripting-top' || slotData === 'scripting-bottom') {
                // Toggle scripting widget position
                scriptingWidgetPosition = slotData === 'scripting-top' ? 'top' : 'bottom';
                updateWidgetDisplay();
                saveWidgetConfig();
                return;
            }
            // If dropped on a regular slot, determine which row
            const slotIndex = parseInt(slotData) || 0;
            if (slotIndex < 2 && scriptingWidgetPosition !== 'top') {
                scriptingWidgetPosition = 'top';
                updateWidgetDisplay();
                saveWidgetConfig();
                return;
            } else if (slotIndex >= 2 && scriptingWidgetPosition !== 'bottom') {
                scriptingWidgetPosition = 'bottom';
                updateWidgetDisplay();
                saveWidgetConfig();
                return;
            }
        }
        
        // Get slot index
        const slotIndex = parseInt(slot.dataset.slot) || 0;
        
        // Reorder activeWidgets array
        reorderWidget(widgetName, slotIndex);
    });
}

// Reorder widgets based on drag and drop
function reorderWidget(widgetName, targetSlotIndex) {
    // Don't allow reordering automatic widgets (NPC/Factory/Warehouse) or stats to slot 0
    if (widgetName === 'npc' || widgetName === 'factory' || widgetName === 'warehouse') {
        return; // Automatic widgets can't be reordered
    }
    
    // Build list of widgets to show (matching updateWidgetDisplay priority)
    let widgetsToShow = [];
    
    // Slot 0: Factory widget (if in factory room)
    if (factoryWidgetVisible) {
        widgetsToShow.push('factory');
    }
    
    // Slot 1: NPC widget (if harvesting)
    if (npcWidgetVisible) {
        widgetsToShow.push('npc');
    }
    
    // Slot 2: Warehouse widget (if in warehouse room)
    if (warehouseWidgetVisible) {
        widgetsToShow.push('warehouse');
    }
    
    // Remaining slots: Toggleable widgets
    widgetsToShow.push(...activeWidgets);
    
    // Find current position of widget
    const currentIndex = widgetsToShow.indexOf(widgetName);
    if (currentIndex === -1) return; // Widget not in list
    
    // Can't move to reserved slots
    if (targetSlotIndex === 0 && factoryWidgetVisible) {
        return; // Slot 0 is for factory widget
    }
    if (targetSlotIndex === 1 && npcWidgetVisible) {
        return; // Slot 1 is for NPC widget
    }
    if (targetSlotIndex === 2 && warehouseWidgetVisible) {
        return; // Slot 2 is for warehouse widget
    }
    
    // Remove from current position
    widgetsToShow.splice(currentIndex, 1);
    
    // Adjust target index to account for automatic widgets
    // Factory is slot 0, NPC is slot 1, Warehouse is slot 2, then toggleable widgets
    let adjustedTargetIndex = targetSlotIndex;
    const factoryOffset = factoryWidgetVisible ? 1 : 0;
    const npcOffset = npcWidgetVisible ? 1 : 0;
    const warehouseOffset = warehouseWidgetVisible ? 1 : 0;
    adjustedTargetIndex = targetSlotIndex - factoryOffset - npcOffset - warehouseOffset;
    // Clamp to valid range for toggleable widgets
    adjustedTargetIndex = Math.max(0, Math.min(adjustedTargetIndex, widgetsToShow.length));
    
    // Insert at target position
    widgetsToShow.splice(adjustedTargetIndex, 0, widgetName);
    
    // Update activeWidgets (remove NPC and factory from the list)
    const toggleableWidgets = widgetsToShow.filter(w => w !== 'npc' && w !== 'factory');
    activeWidgets = toggleableWidgets;
    
    // Update display
    updateWidgetDisplay();
    saveWidgetConfig();
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
    const hitRateEl = document.getElementById('npcWidgetHitRate');
    const resonanceNotePulse = document.getElementById('npcWidgetResonanceNote');
    const resonanceNoteHitRate = document.getElementById('npcWidgetHitRateNote');
    
    if (pulseEl && timingData.baseCycleTime) {
        // Show effective cycle time if available (resonance bonus applied), otherwise base
        const displayCycleTime = timingData.effectiveCycleTime || timingData.baseCycleTime;
        pulseEl.textContent = `${(displayCycleTime / 1000).toFixed(1)}s`;
        
        // Show resonance note if effective cycle time is different from base
        if (resonanceNotePulse) {
            if (timingData.effectiveCycleTime && timingData.effectiveCycleTime !== timingData.baseCycleTime) {
                resonanceNotePulse.style.display = 'inline';
            } else {
                resonanceNotePulse.style.display = 'none';
            }
        }
    }
    
    if (hitRateEl && timingData.hitRate !== undefined) {
        hitRateEl.textContent = `${(timingData.hitRate * 100).toFixed(0)}%`;
        
        // Show resonance note if hit rate is less than 100%
        if (resonanceNoteHitRate) {
            if (timingData.hitRate < 1.0) {
                resonanceNoteHitRate.style.display = 'inline';
            } else {
                resonanceNoteHitRate.style.display = 'none';
            }
        }
    }
    
    const harvestNote = document.getElementById('npcWidgetHarvestNote');
    if (harvestEl && timingData.baseHarvestableTime) {
        // Show effective harvestable time if available (fortitude bonus applied), otherwise base
        const displayHarvestableTime = timingData.effectiveHarvestableTime || timingData.baseHarvestableTime;
        // Use 1 decimal place to show partial second increases
        harvestEl.textContent = `${(displayHarvestableTime / 1000).toFixed(1)}s`;
        
        // Show fortitude note if effective harvestable time is different from base
        if (harvestNote) {
            if (timingData.effectiveHarvestableTime && timingData.effectiveHarvestableTime !== timingData.baseHarvestableTime) {
                harvestNote.style.display = 'inline';
            } else {
                harvestNote.style.display = 'none';
            }
        }
    }
    const cooldownNote = document.getElementById('npcWidgetCooldownNote');
    if (cooldownEl && timingData.baseCooldownTime) {
        // Show effective cooldown time if available (fortitude bonus applied), otherwise base
        const displayCooldownTime = timingData.effectiveCooldownTime || timingData.baseCooldownTime;
        // Use 1 decimal place to show partial second reductions (e.g., 9.5s instead of rounding to 10s)
        cooldownEl.textContent = `${(displayCooldownTime / 1000).toFixed(1)}s`;
        
        // Show fortitude note if effective cooldown time is different from base
        if (cooldownNote) {
            if (timingData.effectiveCooldownTime && timingData.effectiveCooldownTime !== timingData.baseCooldownTime) {
                cooldownNote.style.display = 'inline';
            } else {
                cooldownNote.style.display = 'none';
            }
        }
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
                const slot = state.slots[0];
                if (slot.quantity > 1) {
                    content.textContent = `${slot.itemName} (x${slot.quantity})`;
                } else {
                    content.textContent = slot.itemName;
                }
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
                const slot = state.slots[1];
                if (slot.quantity > 1) {
                    content.textContent = `${slot.itemName} (x${slot.quantity})`;
                } else {
                    content.textContent = slot.itemName;
                }
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

// Warehouse widget is now toggleable - these functions are no longer used for auto-show/hide
// Keeping for backwards compatibility but widget visibility is controlled by toggleWidget()

// Update warehouse widget display
function updateWarehouseWidget(state) {
    const warehouseWidget = document.getElementById('widget-warehouse');
    if (!warehouseWidget) return;
    
    warehouseWidgetState = state;
    
    // If not in warehouse room, disable interactions but show data
    const storeBtn = document.getElementById('warehouse-store-btn');
    const withdrawBtn = document.getElementById('warehouse-withdraw-btn');
    const storeItemInput = document.getElementById('warehouse-store-item');
    const storeQuantityInput = document.getElementById('warehouse-store-quantity');
    const withdrawItemInput = document.getElementById('warehouse-withdraw-item');
    const withdrawQuantityInput = document.getElementById('warehouse-withdraw-quantity');
    
    // Determine if we're in interactive mode (in warehouse room) or view-only mode
    const isInteractive = isInWarehouseRoom && state && state.warehouseLocationKey;
    
    if (!isInteractive) {
        // Read-only mode: disable all inputs and buttons
        if (storeBtn) storeBtn.disabled = true;
        if (withdrawBtn) withdrawBtn.disabled = true;
        if (storeItemInput) storeItemInput.disabled = true;
        if (storeQuantityInput) storeQuantityInput.disabled = true;
        if (withdrawItemInput) withdrawItemInput.disabled = true;
        if (withdrawQuantityInput) withdrawQuantityInput.disabled = true;
        
        // Show read-only message
        const infoNote = warehouseWidget.querySelector('.warehouse-info-note');
        if (infoNote) {
            if (state && state.warehouseLocationKey) {
                infoNote.textContent = 'View-only mode. You must be in a warehouse room to store or withdraw items.';
            } else {
                infoNote.textContent = 'You need a warehouse deed to access storage.';
            }
            infoNote.style.color = '#ffaa00';
        }
        
        // Still show data if available (view-only mode)
        if (state) {
            // Update displays with state data
            const capacityDisplay = document.getElementById('warehouse-capacity-display');
            if (capacityDisplay && state.capacity) {
                capacityDisplay.textContent = `${state.capacity.currentItemTypes}/${state.capacity.maxItemTypes} types`;
            }
            
            const storedDisplay = document.getElementById('warehouse-stored-display');
            if (storedDisplay && state.items) {
                const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);
                const maxCapacity = state.capacity ? state.capacity.maxItemTypes * state.capacity.maxQuantityPerType : 0;
                storedDisplay.textContent = `${totalItems}/${maxCapacity} stored`;
            }
            
            const deedsList = document.getElementById('warehouse-deeds-list');
            if (deedsList) {
                if (state.deeds && state.deeds.length > 0) {
                    deedsList.innerHTML = state.deeds.map(deed => 
                        `<div>${deed.item_name} (Tier ${deed.upgrade_tier})</div>`
                    ).join('');
                } else {
                    deedsList.innerHTML = '<div style="color: #666;">No deeds</div>';
                }
            }
            
            const itemsList = document.getElementById('warehouse-items-list');
            if (itemsList) {
                if (state.items && state.items.length > 0) {
                    itemsList.innerHTML = state.items.map(item => 
                        `<div><span>${item.item_name}</span><span>${item.quantity}</span></div>`
                    ).join('');
                } else {
                    itemsList.innerHTML = '<div style="color: #666;">Empty</div>';
                }
            }
        }
        return;
    }
    
    // Interactive mode: enable all inputs and buttons
    if (storeBtn) storeBtn.disabled = false;
    if (withdrawBtn) withdrawBtn.disabled = false;
    if (storeItemInput) storeItemInput.disabled = false;
    if (storeQuantityInput) storeQuantityInput.disabled = false;
    if (withdrawItemInput) withdrawItemInput.disabled = false;
    if (withdrawQuantityInput) withdrawQuantityInput.disabled = false;
    
    // Update info note
    const infoNote = warehouseWidget.querySelector('.warehouse-info-note');
    if (infoNote) {
        infoNote.textContent = 'You are in a shared warehouse building. Storage shown here is yours alone.';
        infoNote.style.color = '#00ffff';
    }
    
    // Interactive mode: show full widget with actions
    if (!state) return;
    
    // Update capacity display
    const capacityDisplay = document.getElementById('warehouse-capacity-display');
    if (capacityDisplay && state.capacity) {
        capacityDisplay.textContent = `${state.capacity.currentItemTypes}/${state.capacity.maxItemTypes} types`;
    }
    
    // Update stored display
    const storedDisplay = document.getElementById('warehouse-stored-display');
    if (storedDisplay && state.items) {
        const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);
        const maxCapacity = state.capacity ? state.capacity.maxItemTypes * state.capacity.maxQuantityPerType : 0;
        storedDisplay.textContent = `${totalItems}/${maxCapacity} stored`;
    }
    
    // Update deeds list
    const deedsList = document.getElementById('warehouse-deeds-list');
    if (deedsList) {
        if (state.deeds && state.deeds.length > 0) {
            deedsList.innerHTML = state.deeds.map(deed => 
                `<div>${deed.item_name} (Tier ${deed.upgrade_tier})</div>`
            ).join('');
        } else {
            deedsList.innerHTML = '<div style="color: #666;">No deeds</div>';
        }
    }
    
    // Update items list
    const itemsList = document.getElementById('warehouse-items-list');
    if (itemsList) {
        if (state.items && state.items.length > 0) {
            itemsList.innerHTML = state.items.map(item => 
                `<div><span>${item.item_name}</span><span>${item.quantity}</span></div>`
            ).join('');
        } else {
            itemsList.innerHTML = '<div style="color: #666;">Empty</div>';
        }
    }
}

// Initialize warehouse widget button handlers
function initWarehouseWidgetHandlers() {
    const storeBtn = document.getElementById('warehouse-store-btn');
    const withdrawBtn = document.getElementById('warehouse-withdraw-btn');
    const storeItemInput = document.getElementById('warehouse-store-item');
    const storeQuantityInput = document.getElementById('warehouse-store-quantity');
    const withdrawItemInput = document.getElementById('warehouse-withdraw-item');
    const withdrawQuantityInput = document.getElementById('warehouse-withdraw-quantity');
    
    if (storeBtn) {
        storeBtn.addEventListener('click', () => {
            const itemName = storeItemInput ? storeItemInput.value.trim() : '';
            const quantity = storeQuantityInput ? storeQuantityInput.value.trim() : '1';
            
            if (!itemName) {
                addToTerminal('Store what?', 'error');
                return;
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'store',
                    itemName: itemName,
                    quantity: quantity === '' ? 1 : quantity
                }));
            }
            
            if (storeItemInput) storeItemInput.value = '';
            if (storeQuantityInput) storeQuantityInput.value = '';
        });
    }
    
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', () => {
            const itemName = withdrawItemInput ? withdrawItemInput.value.trim() : '';
            const quantity = withdrawQuantityInput ? withdrawQuantityInput.value.trim() : '1';
            
            if (!itemName) {
                addToTerminal('Withdraw what?', 'error');
                return;
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'withdraw',
                    itemName: itemName,
                    quantity: quantity === '' ? 1 : quantity
                }));
            }
            
            if (withdrawItemInput) withdrawItemInput.value = '';
            if (withdrawQuantityInput) withdrawQuantityInput.value = '';
        });
    }
    
    // Allow Enter key to submit
    if (storeItemInput) {
        storeItemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && storeBtn) {
                storeBtn.click();
            }
        });
    }
    
    if (withdrawItemInput) {
        withdrawItemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && withdrawBtn) {
                withdrawBtn.click();
            }
        });
    }
}

// Initialize warehouse widget handlers when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWarehouseWidgetHandlers);
} else {
    initWarehouseWidgetHandlers();
}

// Initialize widget toggle bar click handlers
function initWidgetToggleBar() {
    const toggleBar = document.querySelector('.widget-toggle-bar');
    if (!toggleBar) return;
    
    // Handle widget toggle icons
    toggleBar.querySelectorAll('.widget-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const widgetName = icon.getAttribute('data-widget');
            toggleWidget(widgetName);
        });
    });
    
    // Handle exit to character selection button
    const exitBtn = document.getElementById('exitToCharacterSelection');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            // Don't disconnect WebSocket - keep player active on server
            // Just close the window or redirect
            if (isPopupWindow) {
                // If in popup, close the window (connection stays active)
                window.close();
            } else {
                // If in main window, redirect to character selection page (connection stays active)
                window.location.href = '/';
            }
            // Note: WebSocket connection remains open, player stays active on server
        });
    }
}

// ============================================================
// JUMP WIDGET (God Mode Teleport)
// ============================================================
let jumpWidgetMaps = [];
let jumpWidgetRooms = [];
let jumpWidgetCanvas = null;
let jumpWidgetCtx = null;
let jumpWidgetSelectedMap = null;
let jumpWidgetRenderer = null;
const JUMP_CELL_SIZE = 15;

function openJumpWidget() {
    const widget = document.getElementById('jumpWidget');
    if (!widget) return;
    
    widget.classList.remove('hidden');
    
    // Initialize canvas
    jumpWidgetCanvas = document.getElementById('jumpMapCanvas');
    jumpWidgetCtx = jumpWidgetCanvas.getContext('2d');
    
    // Initialize MapRenderer for jump widget
    jumpWidgetRenderer = new MapRenderer({
        canvas: jumpWidgetCanvas,
        ctx: jumpWidgetCtx,
        cellSize: JUMP_CELL_SIZE,
        gridSize: null, // Dynamic bounds
        maxCellSize: JUMP_CELL_SIZE,
        minCellSize: 8,
        getRoomColor: (room) => {
            const isCurrentRoom = room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y &&
                                  jumpWidgetSelectedMap === currentMapId;
            if (isCurrentRoom) {
                return '#00ff00';
            } else if (room.connected_map_id) {
                return '#ffffff';
            } else {
                return '#666';
            }
        },
        getRoomBorder: (room) => {
            const isCurrentRoom = room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y &&
                                  jumpWidgetSelectedMap === currentMapId;
            return isCurrentRoom ? { color: '#ffff00', width: 2 } : { color: '#333', width: 1 };
        }
    });
    
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
    if (!jumpWidgetCtx || !jumpWidgetCanvas) return;
    jumpWidgetCtx.fillStyle = '#050505';
    jumpWidgetCtx.fillRect(0, 0, jumpWidgetCanvas.width, jumpWidgetCanvas.height);
}

function renderJumpMap() {
    if (!jumpWidgetRenderer || jumpWidgetRooms.length === 0) {
        clearJumpCanvas();
        return;
    }
    
    // Calculate dynamic canvas size based on room bounds
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
    
    // Render using MapRenderer
    jumpWidgetRenderer.render(jumpWidgetRooms, null, '#050505');
}

function getJumpRoomAtPosition(canvasX, canvasY) {
    if (!jumpWidgetRenderer || jumpWidgetRooms.length === 0) return null;
    return jumpWidgetRenderer.getRoomAtPosition(canvasX, canvasY, jumpWidgetRooms);
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

// ============================================================
// AUTO-PATH PANEL
// ============================================================

let isAutoNavigating = false;
let autoNavigationPath = null;
let autoPathMaps = [];
let autoPathRooms = [];
let autoPathCanvas = null;
let autoPathCtx = null;
let autoPathSelectedMap = null;
let autoPathSelectedRoom = null;
let autoPathRenderer = null;
const AUTO_PATH_CELL_SIZE = 15;

function openAutoPathPanel() {
    const panel = document.getElementById('autoPathPanel');
    if (!panel) return;
    
    panel.classList.remove('hidden');
    
    // Initialize canvas
    autoPathCanvas = document.getElementById('autoPathMapCanvas');
    autoPathCtx = autoPathCanvas.getContext('2d');
    
    // Initialize MapRenderer for auto-path widget
    autoPathRenderer = new MapRenderer({
        canvas: autoPathCanvas,
        ctx: autoPathCtx,
        cellSize: AUTO_PATH_CELL_SIZE,
        gridSize: null, // Dynamic bounds
        maxCellSize: AUTO_PATH_CELL_SIZE,
        minCellSize: 8,
        getRoomColor: (room) => {
            const isCurrentRoom = currentRoomPos && currentMapId &&
                                  room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y &&
                                  autoPathSelectedMap === currentMapId;
            const isSelectedRoom = autoPathSelectedRoom && autoPathSelectedRoom.id === room.id;
            
            if (isCurrentRoom) {
                return '#00ff00';
            } else if (isSelectedRoom) {
                return '#ff8800';
            } else if (room.connected_map_id) {
                return '#ffffff';
            } else {
                return '#666';
            }
        },
        getRoomBorder: (room) => {
            const isCurrentRoom = currentRoomPos && currentMapId &&
                                  room.x === currentRoomPos.x && 
                                  room.y === currentRoomPos.y &&
                                  autoPathSelectedMap === currentMapId;
            const isSelectedRoom = autoPathSelectedRoom && autoPathSelectedRoom.id === room.id;
            
            if (isCurrentRoom) {
                return { color: '#ffff00', width: 2 };
            } else if (isSelectedRoom) {
                return { color: '#ff8800', width: 2 };
            } else {
                return { color: '#333', width: 1 };
            }
        }
    });
    
    // Request map list from server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getAutoPathMaps' }));
    }
    
    // Setup event listeners
    const closeBtn = document.getElementById('closeAutoPathPanel');
    if (closeBtn) {
        closeBtn.onclick = closeAutoPathPanel;
    }
    
    const mapSelector = document.getElementById('autoPathMapSelect');
    if (mapSelector) {
        mapSelector.onchange = onAutoPathMapSelected;
    }
    
    // Canvas click and hover handlers
    if (autoPathCanvas) {
        autoPathCanvas.onclick = onAutoPathCanvasClick;
        autoPathCanvas.onmousemove = onAutoPathCanvasHover;
    }
    
    // GO button handler
    const goBtn = document.getElementById('autoPathGoBtn');
    if (goBtn) {
        goBtn.onclick = startAutoNavigation;
    }
}

function closeAutoPathPanel() {
    const panel = document.getElementById('autoPathPanel');
    if (panel) {
        panel.classList.add('hidden');
    }
    autoPathMaps = [];
    autoPathRooms = [];
    autoPathSelectedMap = null;
    autoPathSelectedRoom = null;
    const summary = document.getElementById('autoPathSummary');
    if (summary) {
        summary.style.display = 'none';
    }
}

function populateAutoPathMaps(maps) {
    autoPathMaps = maps;
    const selector = document.getElementById('autoPathMapSelect');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Select a map...</option>';
    maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map.id;
        option.textContent = map.name;
        selector.appendChild(option);
    });
}

function onAutoPathMapSelected(e) {
    const mapId = parseInt(e.target.value);
    if (!mapId) {
        autoPathRooms = [];
        autoPathSelectedMap = null;
        clearAutoPathCanvas();
        return;
    }
    
    autoPathSelectedMap = mapId;
    
    // Request rooms for this map
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getAutoPathRooms', mapId }));
    }
}

function populateAutoPathRooms(rooms) {
    autoPathRooms = rooms;
    renderAutoPathMap();
}

function clearAutoPathCanvas() {
    if (!autoPathCtx || !autoPathCanvas) return;
    autoPathCtx.fillStyle = '#050505';
    autoPathCtx.fillRect(0, 0, autoPathCanvas.width, autoPathCanvas.height);
}

function renderAutoPathMap() {
    if (!autoPathRenderer || autoPathRooms.length === 0) {
        clearAutoPathCanvas();
        return;
    }
    
    // Get container dimensions
    const container = autoPathCanvas.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth - 30; // Account for padding
    const containerHeight = container.clientHeight - 30;
    
    // Size canvas to fit container
    const minX = Math.min(...autoPathRooms.map(r => r.x));
    const maxX = Math.max(...autoPathRooms.map(r => r.x));
    const minY = Math.min(...autoPathRooms.map(r => r.y));
    const maxY = Math.max(...autoPathRooms.map(r => r.y));
    
    const gridWidth = maxX - minX + 1;
    const gridHeight = maxY - minY + 1;
    
    // Calculate cell size to fit container, but maintain minimum size
    const cellSizeX = Math.floor((containerWidth - 40) / gridWidth);
    const cellSizeY = Math.floor((containerHeight - 40) / gridHeight);
    const cellSize = Math.max(Math.min(cellSizeX, cellSizeY, AUTO_PATH_CELL_SIZE), 8);
    
    // Size canvas to fit container
    const canvasWidth = Math.min(gridWidth * cellSize + 40, containerWidth);
    const canvasHeight = Math.min(gridHeight * cellSize + 40, containerHeight);
    
    autoPathCanvas.width = canvasWidth;
    autoPathCanvas.height = canvasHeight;
    
    // Update renderer cell size
    autoPathRenderer.cellSize = cellSize;
    autoPathRenderer.maxCellSize = cellSize;
    
    // Render using MapRenderer
    autoPathRenderer.render(autoPathRooms, null, '#050505');
}

function getAutoPathRoomAtPosition(canvasX, canvasY) {
    if (!autoPathRenderer || autoPathRooms.length === 0) return null;
    return autoPathRenderer.getRoomAtPosition(canvasX, canvasY, autoPathRooms);
}

function onAutoPathCanvasHover(e) {
    if (!autoPathCanvas) return;
    const rect = autoPathCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getAutoPathRoomAtPosition(x, y);
    const infoEl = document.getElementById('autoPathHoverInfo');
    
    if (room) {
        infoEl.innerHTML = `<span class="room-name">${room.name}</span> <span class="room-coords">(${room.x}, ${room.y})</span> - Click to set destination`;
        autoPathCanvas.style.cursor = 'pointer';
    } else {
        infoEl.textContent = 'Select a map, then click a room to set destination';
        autoPathCanvas.style.cursor = 'crosshair';
    }
}

function onAutoPathCanvasClick(e) {
    if (!autoPathCanvas) return;
    const rect = autoPathCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getAutoPathRoomAtPosition(x, y);
    
    if (room) {
        autoPathSelectedRoom = room;
        renderAutoPathMap();
        
        // Calculate path
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'calculateAutoPath', 
                targetRoomId: room.id 
            }));
        }
    }
}

function displayAutoPathSummary(path) {
    const summary = document.getElementById('autoPathSummary');
    const stepsDiv = document.getElementById('autoPathSteps');
    
    if (!summary || !stepsDiv) return;
    
    if (!path || path.length === 0) {
        stepsDiv.innerHTML = '<div class="path-step">Already at destination!</div>';
    } else {
        stepsDiv.innerHTML = '';
        let lastMapId = null;
        path.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'path-step';
            
            // Show map transition if map changed
            let mapTransition = '';
            if (step.mapId && step.mapId !== lastMapId && lastMapId !== null) {
                mapTransition = `<span class="path-map-transition">→ Entering ${step.mapName || 'Unknown Map'}</span><br>`;
            }
            lastMapId = step.mapId;
            
            stepDiv.innerHTML = mapTransition + `<span class="path-direction">${step.direction}</span> → <span class="path-room">${step.roomName}</span>`;
            stepsDiv.appendChild(stepDiv);
        });
    }
    
    summary.style.display = 'block';
}

function startAutoNavigation() {
    if (!autoNavigationPath || autoNavigationPath.length === 0) {
        addToTerminal('No path to navigate', 'error');
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'startAutoNavigation', 
            path: autoNavigationPath 
        }));
        isAutoNavigating = true;
        updateCompassButtonsState();
        closeAutoPathPanel();
        addToTerminal('Auto-navigation started. Movement commands are now blocked.', 'info');
    }
}

function updateCompassButtonsState() {
    document.querySelectorAll('.compass-btn').forEach(btn => {
        if (isAutoNavigating) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
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
        
        // Setup scripting widget walk button
        const scriptingWalkBtn = document.getElementById('scripting-walk-btn');
        if (scriptingWalkBtn) {
            scriptingWalkBtn.addEventListener('click', () => {
                openAutoPathPanel();
            });
        }
        
        // Path/Loop execution controls
        const pathLoopSelect = document.getElementById('pathLoopSelect');
        if (pathLoopSelect) {
            pathLoopSelect.addEventListener('change', onPathSelectChange);
        }
        
        const startPathBtn = document.getElementById('startPathBtn');
        if (startPathBtn) {
            startPathBtn.addEventListener('click', startPathExecution);
        }
        
        const stopPathBtn = document.getElementById('stopPathBtn');
        if (stopPathBtn) {
            stopPathBtn.addEventListener('click', stopPathExecution);
        }
        
        const continuePathBtn = document.getElementById('continuePathBtn');
        if (continuePathBtn) {
            console.log('[Setup] Adding event listener to continuePathBtn');
            continuePathBtn.addEventListener('click', () => {
                console.log('[continuePathBtn] Click event fired');
                continuePathExecution();
            });
        } else {
            console.error('[Setup] continuePathBtn not found!');
        }
        
        const closePathPreviewBtn = document.getElementById('closePathPreviewBtn');
        if (closePathPreviewBtn) {
            closePathPreviewBtn.addEventListener('click', () => {
                const previewDialog = document.getElementById('pathPreviewDialog');
                if (previewDialog) {
                    previewDialog.style.display = 'none';
                }
            });
        }
        
        // Run a delayed sync to catch any widgets that might be visible but not in activeWidgets
        // This fixes cases where widgets are shown by default or by other code
        setTimeout(() => {
            updateWidgetDisplay();
        }, 100);
        
        // Add restart server button click handler
        const restartBtn = document.getElementById('restartServerBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                if (!godMode) {
                    addToTerminal('This action requires god mode.', 'error');
                    return;
                }
                
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    addToTerminal('Not connected to server.', 'error');
                    return;
                }
                
                // Restart server immediately
                restartRequested = true;
                ws.send(JSON.stringify({ type: 'restartServer' }));
            });
        }
    }
    
    // God Mode widget editor buttons
    const godModeEditorButtons = document.querySelectorAll('.godmode-editor-btn');
    godModeEditorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'map') {
                window.location.href = '/map';
            } else if (action === 'npc') {
                window.location.href = '/npc';
            } else if (action === 'items') {
                window.location.href = '/items';
            } else if (action === 'player') {
                window.location.href = '/player';
            }
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
    console.log('openMapEditor called, mapEditor element:', mapEditor);
    if (!mapEditor) {
        console.error('mapEditor element not found!');
        // Try to find it again
        mapEditor = document.getElementById('mapEditor');
        console.log('Retrying to find mapEditor:', mapEditor);
        if (!mapEditor) {
            console.error('mapEditor still not found after retry');
            return;
        }
    }
    
    console.log('Removing hidden class from mapEditor');
    mapEditor.classList.remove('hidden');
    console.log('mapEditor classes after remove:', mapEditor.className);
    
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
    // Use setTimeout to ensure getAllMaps response is processed first
    setTimeout(() => {
        if (currentMapId) {
            loadMapForEditor(currentMapId);
            // Set map selector to current map
            const mapSelector = document.getElementById('mapSelector');
            if (mapSelector) {
                mapSelector.value = currentMapId;
            }
        }
    }, 100);
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
        // Compare by id if both have id, otherwise compare by reference or coordinates
        const isSelected = selectedRooms.some(r => {
            if (r && r.id && room && room.id) return r.id === room.id;
            if (r && room && r.x === room.x && r.y === room.y) return true;
            return r === room;
        });
        const isSelectedSingle = selectedRoom && (
            (selectedRoom.id && room.id && selectedRoom.id === room.id) ||
            (selectedRoom.x === room.x && selectedRoom.y === room.y && (!selectedRoom.map_id || !room.map_id || selectedRoom.map_id === room.map_id)) ||
            selectedRoom === room
        );
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