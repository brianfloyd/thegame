// Map Editor - Standalone page
// Session-based authentication (no URL params needed)

// WebSocket connection
let ws = null;
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

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
let editorZoom = 1.0;
let editorPanX = 0;
let editorPanY = 0;
let speedModeActive = false;
let selectedRooms = [];
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
let allMapsData = [];
let currentMapId = null; // For player's current map
let allItemsData = []; // For item placement in rooms
let merchantInventory = []; // For merchant room inventory management
let playerCurrentRoom = null; // Player's current room coordinates for centering
let roomTypeColors = { // Default colors
    normal: '#00ff00',
    merchant: '#0088ff',
    factory: '#ff8800',
    warehouse: '#00ffff'
};
let allRoomTypes = []; // All available room types from database
let mapEditorTooltip = null; // Tooltip element for room hover info in editor

// Non-blocking notification for editor errors
function showEditorNotification(message, type = 'info') {
    // Remove existing notification
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
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
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
        case 'mapEditorData':
            editorMapRooms = data.rooms.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                x: r.x,
                y: r.y,
                roomType: r.roomType || r.room_type || 'normal',
                mapId: r.mapId || r.map_id,
                connected_map_id: r.connected_map_id,
                connected_room_x: r.connected_room_x,
                connected_room_y: r.connected_room_y,
                connection_direction: r.connection_direction
            }));
            if (data.roomTypeColors) {
                roomTypeColors = { ...roomTypeColors, ...data.roomTypeColors };
            }
            if (data.roomTypes) {
                allRoomTypes = data.roomTypes;
            }
            if (data.allItems) {
                allItemsData = data.allItems;
            }
            currentEditorMapId = data.mapId;
            renderMapEditor();
            updateSidePanel();
            break;
        case 'allRoomTypes':
            if (data.roomTypes) {
                allRoomTypes = data.roomTypes;
                console.log('Loaded room types from database:', allRoomTypes);
                // Refresh any open dialogs that use room types
                const dialog = document.getElementById('roomTypeColorsDialog');
                if (dialog && !dialog.classList.contains('hidden')) {
                    showRoomTypeColorsDialog();
                }
                // Always refresh side panel when room types are loaded (to update dropdowns)
                updateSidePanel();
            }
            break;
        case 'roomTypeColors':
            if (data.colors) {
                roomTypeColors = { ...roomTypeColors, ...data.colors };
                renderMapEditor(); // Re-render to update colors
                // Update dialog if open
                const dialog = document.getElementById('roomTypeColorsDialog');
                if (dialog && !dialog.classList.contains('hidden')) {
                    showRoomTypeColorsDialog(); // Refresh dialog
                }
            }
            break;
        case 'roomTypeColorUpdated':
            // Color was updated, refresh dialog and re-render map
            if (data.roomType && data.color) {
                roomTypeColors[data.roomType] = data.color;
                renderMapEditor();
                const dialog = document.getElementById('roomTypeColorsDialog');
                if (dialog && !dialog.classList.contains('hidden')) {
                    showRoomTypeColorsDialog(); // Refresh dialog
                }
            }
            break;
        case 'allMaps':
            allMapsData = data.maps;
            const mapSelector = document.getElementById('mapSelector');
            if (mapSelector) {
                mapSelector.innerHTML = '<option value="">Select a map...</option>';
                data.maps.forEach(map => {
                    const option = document.createElement('option');
                    option.value = map.id;
                    option.textContent = map.name;
                    mapSelector.appendChild(option);
                });
                
                // Auto-select player's current map if we have it and haven't loaded a map yet
                if (currentMapId && !currentEditorMapId) {
                    mapSelector.value = currentMapId;
                    loadMapForEditor(currentMapId);
                }
            }
            break;
        case 'mapCreated':
            const mapSelector2 = document.getElementById('mapSelector');
            if (mapSelector2) {
                const option = document.createElement('option');
                option.value = data.mapId;
                option.textContent = data.name;
                mapSelector2.appendChild(option);
                mapSelector2.value = data.mapId;
            }
            loadMapForEditor(data.mapId);
            break;
        case 'roomCreated':
            editorMapRooms.push({
                id: data.room.id,
                name: data.room.name,
                description: data.room.description,
                x: data.room.x,
                y: data.room.y,
                roomType: data.room.roomType || 'normal',
                mapId: data.room.mapId
            });
            if (speedModeActive && selectedRoom && selectedRoom.isNew) {
                // Find the newly created room and select it
                const newRoom = editorMapRooms.find(r => r.x === selectedRoom.x && r.y === selectedRoom.y);
                if (newRoom) {
                    selectedRoom = newRoom;
                    selectedRooms = [newRoom];
                    speedModeActive = true; // Keep speed mode active
                }
            } else {
                selectedRoom = null;
                selectedRooms = [];
            }
            updateSidePanel();
            renderMapEditor();
            break;
        case 'roomUpdated':
            const idx = editorMapRooms.findIndex(r => r.id === data.room.id);
            if (idx !== -1) {
                editorMapRooms[idx] = {
                    ...editorMapRooms[idx],
                    name: data.room.name,
                    description: data.room.description,
                    roomType: data.room.roomType || 'normal'
                };
                if (selectedRoom && selectedRoom.id === data.room.id) {
                    selectedRoom = editorMapRooms[idx];
                    selectedRooms = selectedRooms.map(r => r.id === data.room.id ? editorMapRooms[idx] : r);
                }
            }
            updateSidePanel();
            renderMapEditor();
            break;
        case 'roomDeleted':
            editorMapRooms = editorMapRooms.filter(r => r.id !== data.roomId);
            if (selectedRoom && selectedRoom.id === data.roomId) {
                selectedRoom = null;
            }
            selectedRooms = selectedRooms.filter(r => r.id !== data.roomId);
            updateSidePanel();
            renderMapEditor();
            break;
        case 'mapConnected':
            // Reload current map to get updated connection info
            if (currentEditorMapId) {
                loadMapForEditor(currentEditorMapId);
            }
            editorMode = 'edit';
            connectionSourceRoom = null;
            selectedRoom = null;
            selectedRooms = [];
            break;
        case 'mapDisconnected':
            // Reload current map to get updated connection info
            if (currentEditorMapId) {
                loadMapForEditor(currentEditorMapId);
            }
            if (selectedRoom && selectedRoom.id === data.room.id) {
                selectedRoom = editorMapRooms.find(r => r.id === data.room.id);
                updateSidePanel();
            }
            renderMapEditor();
            break;
        case 'roomItemsForEditor':
            // Update the room items section in the side panel
            updateRoomItemsSection(data.roomId, data.roomItems, data.allItems);
            break;
        case 'roomItemAdded':
        case 'roomItemRemoved':
        case 'roomItemsCleared':
            // Refresh item section
            if (selectedRoom && selectedRoom.id === data.roomId) {
                updateRoomItemsSection(data.roomId, data.roomItems, null);
            }
            break;
        case 'merchantInventory':
            // Update the merchant inventory section in the side panel
            if (selectedRoom && selectedRoom.id === data.roomId) {
                merchantInventory = data.merchantItems || [];
                updateMerchantInventorySection(data.roomId, merchantInventory);
            }
            break;
        case 'mapData':
            // Store current map info for player room highlighting and auto-centering
            currentMapId = data.mapId;
            playerCurrentRoom = data.currentRoom; // { x, y }
            // The actual map loading will happen in 'allMaps' handler after maps are populated
            break;
        case 'error':
            showEditorNotification(data.message, 'error');
            break;
    }
}

// Close map editor - navigate back to main game
function closeMapEditor() {
    // Navigate to main game (session-based, no params needed)
    window.location.href = '/game';
}

// Load map for editor
function loadMapForEditor(mapId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    currentEditorMapId = mapId;
    
    // If this is the player's current map and we know their room, zoom and center on it
    if (mapId === currentMapId && playerCurrentRoom) {
        // Set zoom to show roughly 20x20 area
        editorZoom = 2.5;
        // Pan to center on player's room
        // editorPanX positive = view moves right (shows higher X)
        // editorPanY positive = view moves up (shows higher Y)
        editorPanX = playerCurrentRoom.x;
        editorPanY = playerCurrentRoom.y;
    } else {
        editorZoom = 1.0;
        editorPanX = 0;
        editorPanY = 0;
    }
    
    ws.send(JSON.stringify({ type: 'getMapEditorData', mapId: mapId }));
    // Also request room types if we don't have them yet
    if (allRoomTypes.length === 0) {
        ws.send(JSON.stringify({ type: 'getAllRoomTypes' }));
    }
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

// Show room type colors dialog
function showRoomTypeColorsDialog() {
    const dialog = document.getElementById('roomTypeColorsDialog');
    const content = document.getElementById('roomTypeColorsContent');
    if (!dialog || !content) return;
    
    // Clear previous content (except description)
    const description = content.querySelector('p');
    content.innerHTML = '';
    if (description) {
        content.appendChild(description);
    }
    
    // If we don't have room types yet, request them
    if (allRoomTypes.length === 0) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllRoomTypes' }));
        }
        // Show message and return - will refresh when room types arrive
        const message = document.createElement('div');
        message.textContent = 'Loading room types...';
        message.style.color = '#00ff00';
        content.appendChild(message);
        return;
    }
    
    // Room types to show - dynamically from database
    const roomTypes = allRoomTypes.map(type => ({
        type: type,
        label: type.charAt(0).toUpperCase() + type.slice(1)
    }));
    
    // Create color picker for each room type
    roomTypes.forEach(rt => {
        const currentColor = roomTypeColors[rt.type] || '#00ff00';
        const colorRow = document.createElement('div');
        colorRow.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px; background: #1a1a1a; border: 1px solid #333;';
        
        const label = document.createElement('label');
        label.textContent = rt.label;
        label.style.cssText = 'min-width: 80px; color: #00ff00;';
        colorRow.appendChild(label);
        
        const colorPreview = document.createElement('div');
        colorPreview.style.cssText = `width: 30px; height: 30px; background: ${currentColor}; border: 2px solid #00ff00; cursor: pointer;`;
        colorRow.appendChild(colorPreview);
        
        const colorSelect = document.createElement('select');
        colorSelect.id = `roomTypeColor_${rt.type}`;
        colorSelect.style.cssText = 'flex: 1; background: #000; color: #00ff00; border: 1px solid #00ff00; padding: 4px;';
        
        // Same color options as NPC editor
        const colors = [
            { value: '#00ff00', label: 'Lime' },
            { value: '#00ffff', label: 'Cyan' },
            { value: '#ff00ff', label: 'Magenta' },
            { value: '#ffff00', label: 'Yellow' },
            { value: '#ff8800', label: 'Orange' },
            { value: '#ff0000', label: 'Red' },
            { value: '#8888ff', label: 'Periwinkle' },
            { value: '#ffffff', label: 'White' },
            { value: '#aaaaaa', label: 'Gray' },
            { value: '#00aa88', label: 'Teal' }
        ];
        
        colors.forEach(color => {
            const option = document.createElement('option');
            option.value = color.value;
            option.textContent = color.label;
            if (color.value === currentColor) {
                option.selected = true;
            }
            colorSelect.appendChild(option);
        });
        
        colorSelect.addEventListener('change', () => {
            const newColor = colorSelect.value;
            colorPreview.style.backgroundColor = newColor;
            // Save immediately
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'setRoomTypeColor',
                    roomType: rt.type,
                    color: newColor
                }));
            }
        });
        
        colorRow.appendChild(colorSelect);
        content.appendChild(colorRow);
    });
    
    dialog.classList.remove('hidden');
}

// Hide room type colors dialog
function hideRoomTypeColorsDialog() {
    const dialog = document.getElementById('roomTypeColorsDialog');
    if (dialog) {
        dialog.classList.add('hidden');
    }
}

// Generate room type options HTML for dropdowns
// Load dynamically from database (room_type_colors table)
function generateRoomTypeOptions(selectedType) {
    // If we don't have room types yet, request them and use defaults as fallback
    if (allRoomTypes.length === 0) {
        // Request room types from server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllRoomTypes' }));
        }
        // Use defaults as fallback until database responds
        const defaults = ['normal', 'merchant', 'factory', 'warehouse'];
        return defaults.map(type => {
            const label = type.charAt(0).toUpperCase() + type.slice(1);
            const selected = type === selectedType ? 'selected' : '';
            return `<option value="${type}" ${selected}>${label}</option>`;
        }).join('');
    }
    
    // Use room types from database
    return allRoomTypes.map(type => {
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        const selected = type === selectedType ? 'selected' : '';
        return `<option value="${type}" ${selected}>${label}</option>`;
    }).join('');
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
    
    const coords = screenToMapCoords(x, y);
    const mapX = coords ? coords.x : 0;
    const mapY = coords ? coords.y : 0;
    
    if (editorMode === 'connect') {
        const clickedRoom = editorMapRooms.find(r => r.x === mapX && r.y === mapY);
        if (clickedRoom) {
            connectionSourceRoom = clickedRoom;
            selectedRoom = clickedRoom;
            selectedRooms = [clickedRoom];
            updateSidePanel();
            renderMapEditor();
        }
    } else {
        const clickedRoom = editorMapRooms.find(r => r.x === mapX && r.y === mapY);
        if (clickedRoom) {
            selectedRoom = clickedRoom;
            selectedRooms = [clickedRoom];
            speedModeActive = true; // Activate speed mode when selecting a room
            updateSidePanel();
            renderMapEditor();
        } else {
            selectedRoom = { x: mapX, y: mapY, isNew: true };
            selectedRooms = [];
            updateSidePanel();
            renderMapEditor();
        }
    }
}

// Handle speed mode navigation
function handleSpeedModeNavigation(key) {
    if (!selectedRoom || !selectedRoom.id) return;
    
    const directionMap = {
        '7': { dx: -1, dy: 1 }, '8': { dx: 0, dy: 1 }, '9': { dx: 1, dy: 1 },
        '4': { dx: -1, dy: 0 }, '6': { dx: 1, dy: 0 },
        '1': { dx: -1, dy: -1 }, '2': { dx: 0, dy: -1 }, '3': { dx: 1, dy: -1 }
    };
    
    const direction = directionMap[key];
    if (!direction) return;
    
    const currentRoom = editorMapRooms.find(r => r.id === selectedRoom.id);
    if (!currentRoom) return;
    
    const newX = currentRoom.x + direction.dx;
    const newY = currentRoom.y + direction.dy;
    
    const existingRoom = editorMapRooms.find(r => r.x === newX && r.y === newY);
    
    if (existingRoom) {
        selectedRoom = existingRoom;
        selectedRooms = [existingRoom];
        speedModeActive = true;
        updateSidePanel();
        renderMapEditor();
    } else {
        speedModeActive = true;
        createRoom(currentEditorMapId, `Room ${newX},${newY}`, 'A generic room', newX, newY, 'normal');
    }
}

// Handle drag selection
function handleMapEditorDrag() {
    if (!mapEditorCanvas || !mapEditorCtx) return;
    
    const startCoords = screenToMapCoords(dragStartX, dragStartY);
    const endCoords = screenToMapCoords(dragEndX, dragEndY);
    
    if (!startCoords || !endCoords) return;
    
    const minX = Math.min(startCoords.x, endCoords.x);
    const maxX = Math.max(startCoords.x, endCoords.x);
    const minY = Math.min(startCoords.y, endCoords.y);
    const maxY = Math.max(startCoords.y, endCoords.y);
    
    selectedRooms = editorMapRooms.filter(room => 
        room.x >= minX && room.x <= maxX && room.y >= minY && room.y <= maxY
    );
    
    if (selectedRooms.length > 0) {
        selectedRoom = selectedRooms[0];
    }
    
    updateSidePanel();
    renderMapEditor();
}

// Convert screen coordinates to map coordinates
function screenToMapCoords(screenX, screenY) {
    if (!mapEditorCanvas) return null;
    
    const canvasWidth = mapEditorCanvas.width;
    const canvasHeight = mapEditorCanvas.height;
    
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

// Handle map editor tooltip
function handleMapEditorTooltip(e) {
    if (!mapEditorCanvas || !mapEditorTooltip) return;
    
    const rect = mapEditorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Use existing screenToMapCoords function to get room coordinates
    const coords = screenToMapCoords(x, y);
    if (!coords) {
        hideMapEditorTooltip();
        return;
    }
    
    // Find room at these coordinates
    const room = editorMapRooms.find(r => r.x === coords.x && r.y === coords.y);
    
    if (room) {
        showMapEditorTooltip(room, e.clientX, e.clientY);
    } else {
        hideMapEditorTooltip();
    }
}

// Show map editor tooltip
function showMapEditorTooltip(room, mouseX, mouseY) {
    if (!mapEditorTooltip) return;
    
    mapEditorTooltip.innerHTML = `<strong>${room.name || 'Room'}</strong><br>(${room.x}, ${room.y})`;
    mapEditorTooltip.style.display = 'block';
    updateMapEditorTooltipPosition(mouseX, mouseY);
}

// Update map editor tooltip position
function updateMapEditorTooltipPosition(mouseX, mouseY) {
    if (!mapEditorTooltip) return;
    
    const offset = 15; // Offset from cursor
    const container = mapEditorCanvas ? mapEditorCanvas.parentElement : null;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const tooltipX = mouseX - containerRect.left + offset;
    const tooltipY = mouseY - containerRect.top + offset;
    
    mapEditorTooltip.style.left = tooltipX + 'px';
    mapEditorTooltip.style.top = tooltipY + 'px';
    
    // Adjust if tooltip would go off screen
    mapEditorTooltip.style.display = 'block'; // Temporarily show to get dimensions
    const tooltipRect = mapEditorTooltip.getBoundingClientRect();
    if (tooltipRect.right > containerRect.right) {
        mapEditorTooltip.style.left = (mouseX - containerRect.left - tooltipRect.width - offset) + 'px';
    }
    if (tooltipRect.bottom > containerRect.bottom) {
        mapEditorTooltip.style.top = (mouseY - containerRect.top - tooltipRect.height - offset) + 'px';
    }
}

// Hide map editor tooltip
function hideMapEditorTooltip() {
    if (mapEditorTooltip) {
        mapEditorTooltip.style.display = 'none';
    }
}

// Render map editor (simplified version - includes essential rendering)
function renderMapEditor() {
    if (!mapEditorCanvas || !mapEditorCtx) return;
    
    const canvasWidth = mapEditorCanvas.width;
    const canvasHeight = mapEditorCanvas.height;
    
    mapEditorCtx.fillStyle = '#000';
    mapEditorCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
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
    
    const roomCoords = new Set();
    editorMapRooms.forEach(room => {
        roomCoords.add(`${room.x},${room.y}`);
    });
    
    // Draw grid lines (visible range only)
    mapEditorCtx.strokeStyle = '#333';
    mapEditorCtx.lineWidth = 1;
    
    const startX = Math.max(0, Math.floor(-offsetX / scaledCellSize) - 1);
    const endX = Math.min(gridSize, Math.ceil((canvasWidth - offsetX) / scaledCellSize) + 1);
    const startY = Math.max(0, Math.floor(-offsetY / scaledCellSize) - 1);
    const endY = Math.min(gridSize, Math.ceil((canvasHeight - offsetY) / scaledCellSize) + 1);
    
    for (let x = startX; x <= endX; x++) {
        const screenX = offsetX + x * scaledCellSize;
        if (screenX >= -scaledCellSize && screenX <= canvasWidth + scaledCellSize) {
            mapEditorCtx.beginPath();
            mapEditorCtx.moveTo(screenX, Math.max(0, offsetY));
            mapEditorCtx.lineTo(screenX, Math.min(canvasHeight, offsetY + scaledGridHeight));
            mapEditorCtx.stroke();
        }
    }
    
    for (let y = startY; y <= endY; y++) {
        const screenY = offsetY + y * scaledCellSize;
        if (screenY >= -scaledCellSize && screenY <= canvasHeight + scaledCellSize) {
            mapEditorCtx.beginPath();
            mapEditorCtx.moveTo(Math.max(0, offsetX), screenY);
            mapEditorCtx.lineTo(Math.min(canvasWidth, offsetX + scaledGridWidth), screenY);
            mapEditorCtx.stroke();
        }
    }
    
    // Draw empty cells near rooms
    if (editorMapRooms.length > 0) {
        const gridCenter = Math.floor(gridSize / 2);
        editorMapRooms.forEach(room => {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const checkX = room.x + dx;
                    const checkY = room.y + dy;
                    const key = `${checkX},${checkY}`;
                    if (!roomCoords.has(key)) {
                        const gridX = checkX + gridCenter;
                        const gridY = gridCenter - checkY;
                        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
                            const screenX = offsetX + gridX * scaledCellSize;
                            const screenY = offsetY + gridY * scaledCellSize;
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
    
    // Draw rooms
    const gridCenter = Math.floor(gridSize / 2);
    editorMapRooms.forEach(room => {
        const gridX = room.x + gridCenter;
        const gridY = gridCenter - room.y;
        
        if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return;
        
        const screenX = offsetX + gridX * scaledCellSize;
        const screenY = offsetY + gridY * scaledCellSize;
        
        if (screenX + scaledCellSize < 0 || screenX > canvasWidth ||
            screenY + scaledCellSize < 0 || screenY > canvasHeight) return;
        
        let fillColor = roomTypeColors.normal || '#00ff00';
        let borderColor = '#ffff00';
        
        const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
        
        if (hasConnection) {
            fillColor = '#ffffff';
            borderColor = '#cccccc';
        } else {
            // Use room type color if available
            const roomType = room.roomType || 'normal';
            if (roomTypeColors[roomType]) {
                fillColor = roomTypeColors[roomType];
                // Darken border color by reducing RGB values
                const color = roomTypeColors[roomType];
                const hex = color.replace('#', '');
                const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 50);
                const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 50);
                const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 50);
                borderColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
        }
        
        const isSelected = selectedRooms.some(r => r.id === room.id) || (selectedRoom && selectedRoom.id === room.id);
        const isPlayerRoom = currentMapId === currentEditorMapId && 
                             playerCurrentRoom && 
                             room.x === playerCurrentRoom.x && 
                             room.y === playerCurrentRoom.y;
        
        if (isSelected) {
            borderColor = '#ff0000';
            mapEditorCtx.lineWidth = 3;
        } else if (isPlayerRoom) {
            // Highlight player's current room with purple
            borderColor = '#ff00ff';
            mapEditorCtx.lineWidth = 3;
        } else if (connectionSourceRoom && connectionSourceRoom.id === room.id) {
            borderColor = '#ff8800';
            mapEditorCtx.lineWidth = 3;
        } else {
            mapEditorCtx.lineWidth = 1;
        }
        
        const cellPadding = Math.max(1, scaledCellSize * 0.1);
        
        if (hasConnection) {
            const indicatorSize = scaledCellSize * 0.15;
            const indicatorX = screenX + scaledCellSize - indicatorSize - 2;
            const indicatorY = screenY + 2;
            mapEditorCtx.fillStyle = '#ffff00';
            mapEditorCtx.beginPath();
            mapEditorCtx.arc(indicatorX + indicatorSize/2, indicatorY + indicatorSize/2, indicatorSize/2, 0, Math.PI * 2);
            mapEditorCtx.fill();
        }
        
        mapEditorCtx.fillStyle = fillColor;
        mapEditorCtx.fillRect(screenX + cellPadding, screenY + cellPadding, scaledCellSize - cellPadding * 2, scaledCellSize - cellPadding * 2);
        
        mapEditorCtx.strokeStyle = borderColor;
        mapEditorCtx.strokeRect(screenX + cellPadding, screenY + cellPadding, scaledCellSize - cellPadding * 2, scaledCellSize - cellPadding * 2);
    });
    
    // Draw selected empty space
    if (selectedRoom && selectedRoom.isNew) {
        const gridCenter = Math.floor(gridSize / 2);
        const mapX = selectedRoom.x;
        const mapY = selectedRoom.y;
        const gridX = mapX + gridCenter;
        const gridY = gridCenter - mapY;
        
        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
            const screenX = offsetX + gridX * scaledCellSize;
            const screenY = offsetY + gridY * scaledCellSize;
            
            if (screenX + scaledCellSize >= 0 && screenX <= canvasWidth &&
                screenY + scaledCellSize >= 0 && screenY <= canvasHeight) {
                mapEditorCtx.strokeStyle = '#ff0000';
                mapEditorCtx.lineWidth = 3;
                mapEditorCtx.strokeRect(screenX, screenY, scaledCellSize, scaledCellSize);
                mapEditorCtx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                mapEditorCtx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
            }
        }
    }
}

// Update side panel (simplified - includes essential forms)
// Update the room items section in the side panel
function updateRoomItemsSection(roomId, roomItems, allItems) {
    // Store allItems if provided
    if (allItems) {
        allItemsData = allItems;
    }
    
    const section = document.getElementById('roomItemsSection');
    const itemSelect = document.getElementById('itemToAdd');
    
    if (!section) return;
    
    // Update items list
    if (roomItems && roomItems.length > 0) {
        let html = roomItems.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px; background: #1a1a1a; margin-bottom: 2px; font-size: 0.8em;">
                <span style="color: #00ff00;">${item.item_name} (x${item.quantity})</span>
                <button class="remove-item-btn" data-item="${item.item_name}" style="padding: 2px 6px; font-size: 0.75em; background: #660000; border: 1px solid #ff0000; color: #ff6666; cursor: pointer;">-1</button>
            </div>
        `).join('');
        
        // Add Clear All button
        html += `<button id="clearAllItemsBtn" style="width: 100%; margin-top: 6px; padding: 4px 8px; font-size: 0.75em; background: #440000; border: 1px solid #ff0000; color: #ff6666; cursor: pointer;">Clear All Items</button>`;
        
        section.innerHTML = html;
        
        // Add click handlers for remove buttons
        section.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemName = btn.dataset.item;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'removeItemFromRoom',
                        roomId: roomId,
                        itemName: itemName,
                        quantity: 1
                    }));
                }
            });
        });
        
        // Add click handler for Clear All button
        const clearAllBtn = document.getElementById('clearAllItemsBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'clearAllItemsFromRoom',
                        roomId: roomId
                    }));
                }
            });
        }
    } else {
        section.innerHTML = '<p style="font-size: 0.8em; color: #888;">No items in room</p>';
    }
    
    // Populate item dropdown (for room floor items)
    if (itemSelect && allItemsData.length > 0) {
        itemSelect.innerHTML = '<option value="">Select item...</option>';
        allItemsData.forEach(item => {
            const option = document.createElement('option');
            option.value = item.name;
            option.textContent = item.name;
            itemSelect.appendChild(option);
        });
    }
    
    // Also populate merchant item dropdown if it exists (for merchant rooms)
    const merchantItemSelect = document.getElementById('merchantItemToAdd');
    if (merchantItemSelect && allItemsData.length > 0) {
        merchantItemSelect.innerHTML = '<option value="">Select item...</option>';
        allItemsData.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            merchantItemSelect.appendChild(option);
        });
    }
}

// Update merchant inventory section
function updateMerchantInventorySection(roomId, merchantItems) {
    const section = document.getElementById('merchantInventorySection');
    if (!section) return;
    
    if (merchantItems && merchantItems.length > 0) {
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.75em; margin-bottom: 8px;">
                <thead>
                    <tr style="background: #002244; color: #0088ff;">
                        <th style="padding: 4px; text-align: left; border-bottom: 1px solid #0088ff;">Item</th>
                        <th style="padding: 4px; text-align: center; border-bottom: 1px solid #0088ff; width: 50px;">Qty</th>
                        <th style="padding: 4px; text-align: right; border-bottom: 1px solid #0088ff; width: 60px;">Price</th>
                        <th style="padding: 4px; text-align: center; border-bottom: 1px solid #0088ff; width: 80px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        merchantItems.forEach(item => {
            const qtyDisplay = item.unlimited ? '∞' : `${item.current_qty}${item.max_qty ? '/' + item.max_qty : ''}`;
            const priceDisplay = item.price > 0 ? item.price : '0';
            const configJson = item.config_json || JSON.stringify({
                unlimited: item.unlimited,
                max_qty: item.max_qty,
                current_qty: item.current_qty,
                regen_hours: item.regen_hours,
                buyable: item.buyable,
                sellable: item.sellable,
                price: item.price
            });
            
            html += `
                <tr style="background: #001133;">
                    <td style="padding: 4px; color: #00ff00;">${item.item_name}</td>
                    <td style="padding: 4px; text-align: center; color: #ffff00;">${qtyDisplay}</td>
                    <td style="padding: 4px; text-align: right; color: #ffcc00;">${priceDisplay}</td>
                    <td style="padding: 4px; text-align: center;">
                        <button class="edit-merchant-item-btn" data-merchant-item-id="${item.id}" data-item-name="${item.item_name}" data-config='${escapeHtml(configJson)}' style="padding: 2px 4px; font-size: 0.85em; background: #002244; border: 1px solid #0088ff; color: #0088ff; cursor: pointer; margin-right: 2px;">Edit</button>
                        <button class="remove-merchant-item-btn" data-merchant-item-id="${item.id}" style="padding: 2px 4px; font-size: 0.85em; background: #440000; border: 1px solid #ff0000; color: #ff6666; cursor: pointer;">X</button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        section.innerHTML = html;
        
        // Add click handlers for edit buttons
        section.querySelectorAll('.edit-merchant-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const merchantItemId = parseInt(btn.dataset.merchantItemId);
                const itemName = btn.dataset.itemName;
                const config = btn.dataset.config;
                showMerchantItemConfigEditor(merchantItemId, itemName, config, roomId);
            });
        });
        
        // Add click handlers for remove buttons
        section.querySelectorAll('.remove-merchant-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const merchantItemId = parseInt(btn.dataset.merchantItemId);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'removeMerchantItem',
                        merchantItemId: merchantItemId,
                        roomId: roomId
                    }));
                }
            });
        });
    } else {
        section.innerHTML = '<p style="font-size: 0.8em; color: #888;">No items in merchant inventory</p>';
    }
}

// Escape HTML for attributes
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#39;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
}

// Show merchant item config editor (modal/dialog)
function showMerchantItemConfigEditor(merchantItemId, itemName, configJson, roomId) {
    // Default config structure - ALL fields that should always be shown
    const defaultConfig = {
        unlimited: true,
        max_qty: null,
        current_qty: 0,
        regen_hours: null,
        buyable: true,
        sellable: false,
        price: 0
    };
    
    // Parse config if it's a string
    let config;
    try {
        const parsedConfig = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
        // Merge with defaults to ensure all fields are present
        config = { ...defaultConfig, ...parsedConfig };
    } catch (e) {
        config = { ...defaultConfig };
    }
    
    // Format the JSON nicely with all fields in consistent order
    const orderedConfig = {
        unlimited: config.unlimited,
        max_qty: config.max_qty,
        current_qty: config.current_qty,
        regen_hours: config.regen_hours,
        buyable: config.buyable,
        sellable: config.sellable,
        price: config.price
    };
    const formattedConfig = JSON.stringify(orderedConfig, null, 2);
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'merchantItemConfigModal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    overlay.innerHTML = `
        <div style="background: #0a0a0a; border: 2px solid #0088ff; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <h3 style="color: #0088ff; margin-top: 0; margin-bottom: 15px;">Edit Merchant Item: ${itemName}</h3>
            <p style="font-size: 0.85em; color: #888; margin-bottom: 15px;">
                Configure item properties using JSON. Available fields:<br>
                • unlimited: true/false - Shop never runs out<br>
                • max_qty: number - Maximum inventory<br>
                • current_qty: number - Current inventory<br>
                • regen_hours: number - Hours to regenerate (e.g., 1.5 = 90 min)<br>
                • buyable: true/false - Can players buy this<br>
                • sellable: true/false - Can players sell this to merchant<br>
                • price: number - Cost in gold
            </p>
            <textarea id="merchantItemConfigJson" style="width: 100%; height: 200px; font-family: 'Courier New', monospace; font-size: 0.85em; background: #111; border: 1px solid #0088ff; color: #00ff00; padding: 8px; box-sizing: border-box;">${formattedConfig}</textarea>
            <div id="merchantItemConfigError" style="color: #ff6666; font-size: 0.85em; margin-top: 8px; display: none;"></div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="saveMerchantItemConfig" style="flex: 1; padding: 8px; background: #002244; border: 2px solid #0088ff; color: #0088ff; cursor: pointer; font-family: 'Courier New', monospace;">Save</button>
                <button id="cancelMerchantItemConfig" style="flex: 1; padding: 8px; background: #220000; border: 2px solid #ff6666; color: #ff6666; cursor: pointer; font-family: 'Courier New', monospace;">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Save button handler
    document.getElementById('saveMerchantItemConfig').addEventListener('click', () => {
        const jsonText = document.getElementById('merchantItemConfigJson').value;
        const errorDiv = document.getElementById('merchantItemConfigError');
        
        try {
            const parsedConfig = JSON.parse(jsonText);
            
            // Validate required fields
            if (parsedConfig.unlimited === undefined) parsedConfig.unlimited = true;
            if (parsedConfig.buyable === undefined) parsedConfig.buyable = true;
            if (parsedConfig.sellable === undefined) parsedConfig.sellable = false;
            if (parsedConfig.price === undefined) parsedConfig.price = 0;
            
            // Send to server
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'updateMerchantItemConfig',
                    merchantItemId: merchantItemId,
                    config: parsedConfig,
                    roomId: roomId
                }));
            }
            
            // Close modal
            overlay.remove();
        } catch (e) {
            errorDiv.textContent = 'Invalid JSON: ' + e.message;
            errorDiv.style.display = 'block';
        }
    });
    
    // Cancel button handler
    document.getElementById('cancelMerchantItemConfig').addEventListener('click', () => {
        overlay.remove();
    });
    
    // Close on click outside
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

function updateSidePanel() {
    const sidePanel = document.getElementById('sidePanelContent');
    if (!sidePanel) return;
    
    if (editorMode === 'connect') {
        if (connectionSourceRoom) {
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
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'getAllMaps' }));
            }
            
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
            
            document.getElementById('connectMapsConfirm').addEventListener('click', () => {
                connectMaps();
            });
            document.getElementById('connectMapsCancel').addEventListener('click', () => {
                connectionSourceRoom = null;
                editorMode = 'edit';
                updateSidePanel();
            });
        } else {
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
                ${generateRoomTypeOptions('normal')}
            </select>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label style="margin: 0; min-width: 20px;">X:</label>
                <input type="number" id="newRoomX" value="${selectedRoom.x}" style="flex: 1;">
                <label style="margin: 0; min-width: 20px; margin-left: 8px;">Y:</label>
                <input type="number" id="newRoomY" value="${selectedRoom.y}" style="flex: 1;">
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="createRoomConfirm" style="flex: 1; padding: 8px 12px; min-width: 0; background: #0a0a0a; border: 2px solid #00ff00; color: #00ff00; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px; white-space: nowrap;">Create Room</button>
                <button id="createRoomCancel" style="flex: 1; padding: 8px 12px; min-width: 0; background: #0a0a0a; border: 2px solid #00ff00; color: #00ff00; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px; white-space: nowrap;">Cancel</button>
            </div>
        `;
        
        document.getElementById('createRoomConfirm').addEventListener('click', () => {
            createRoom();
        });
        document.getElementById('createRoomCancel').addEventListener('click', () => {
            selectedRoom = null;
            updateSidePanel();
            renderMapEditor();
        });
    } else if (selectedRooms.length > 1) {
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
                ${generateRoomTypeOptions(firstRoom.roomType || 'normal')}
            </select>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="updateRoomConfirm" style="flex: 1; padding: 8px 12px; min-width: 0; background: #0a0a0a; border: 2px solid #00ff00; color: #00ff00; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px; white-space: nowrap;">Update All Rooms</button>
                <button id="deleteRoomsConfirm" style="flex: 1; padding: 8px 12px; min-width: 0; background: #cc0000; border: 2px solid #ff0000; color: #fff; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px; white-space: nowrap;">Delete All Rooms</button>
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
        const hasConnection = selectedRoom.connected_map_id !== null && selectedRoom.connected_map_id !== undefined;
        let connectionInfo = '';
        
        if (hasConnection) {
            const connectedMap = allMapsData.find(m => m.id === selectedRoom.connected_map_id);
            const mapName = connectedMap ? connectedMap.name : `Map ID ${selectedRoom.connected_map_id} (Missing)`;
            const direction = selectedRoom.connection_direction || 'Unknown';
            const targetX = selectedRoom.connected_room_x !== null && selectedRoom.connected_room_x !== undefined ? selectedRoom.connected_room_x : '?';
            const targetY = selectedRoom.connected_room_y !== null && selectedRoom.connected_room_y !== undefined ? selectedRoom.connected_room_y : '?';
            
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
        
        sidePanel.innerHTML = `
            <h3 style="font-size: 0.9em; margin-bottom: 8px;">Edit Room</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="min-width: 60px;">X: ${selectedRoom.x}</span>
                <span>Y: ${selectedRoom.y}</span>
            </div>
            ${connectionInfo}
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label style="margin: 0; min-width: 80px;">Room Name:</label>
                <input type="text" id="editRoomName" value="${selectedRoom.name}" style="flex: 1;" placeholder="Room name">
            </div>
            <div style="font-size: 0.75em; color: #888; margin-bottom: 8px;">ID: ${selectedRoom.id}</div>
            <label style="margin-top: 8px;">Description:</label>
            <textarea id="editRoomDescription" style="min-height: 60px; margin-bottom: 8px;">${selectedRoom.description || ''}</textarea>
            <label style="margin-top: 8px;">Room Type:</label>
            <select id="editRoomType" style="margin-bottom: 8px;">
                ${generateRoomTypeOptions(selectedRoom.roomType || 'normal')}
            </select>
            
            <!-- Room Items Section (Items on Floor) -->
            <div style="border-top: 1px solid #ffff00; margin-top: 12px; padding-top: 8px; background: #1a1a00; padding: 8px; border-radius: 4px;">
                <h4 style="font-size: 0.85em; margin-bottom: 4px; color: #ffff00;">🗺️ Items on Floor</h4>
                <p style="font-size: 0.65em; color: #888; margin-bottom: 8px; font-style: italic;">Physical items lying on the ground that players can pick up</p>
                <div id="roomItemsSection" style="margin-bottom: 8px;">
                    <p style="font-size: 0.8em; color: #888;">Loading items...</p>
                </div>
                <div style="display: flex; gap: 6px; margin-bottom: 4px; align-items: stretch;">
                    <select id="itemToAdd" style="flex: 0.75; font-size: 0.8em; min-width: 0;">
                        <option value="">Select item...</option>
                    </select>
                    <button id="addItemBtn" style="padding: 4px 12px; font-size: 0.8em; white-space: nowrap; flex-shrink: 0; background: #333300; border-color: #ffff00; color: #ffff00;">Drop</button>
                </div>
            </div>
            
            <!-- Merchant Inventory Section (only for merchant rooms) -->
            ${selectedRoom.roomType === 'merchant' ? `
            <div style="border-top: 1px solid #0088ff; margin-top: 12px; padding-top: 8px; background: #001133; padding: 8px; border-radius: 4px;">
                <h4 style="font-size: 0.85em; margin-bottom: 4px; color: #0088ff;">🏪 Merchant Stock</h4>
                <p style="font-size: 0.65em; color: #888; margin-bottom: 8px; font-style: italic;">Items the merchant sells - use 'list' command in-game to view</p>
                <div id="merchantInventorySection" style="margin-bottom: 8px;">
                    <p style="font-size: 0.8em; color: #888;">Loading merchant items...</p>
                </div>
                <div style="display: flex; gap: 6px; margin-bottom: 4px; align-items: stretch;">
                    <select id="merchantItemToAdd" style="flex: 0.75; font-size: 0.8em; min-width: 0;">
                        <option value="">Select item...</option>
                    </select>
                    <button id="addMerchantItemBtn" style="padding: 4px 12px; font-size: 0.8em; white-space: nowrap; flex-shrink: 0; background: #002255; border-color: #0088ff; color: #0088ff;">Stock</button>
                </div>
            </div>
            ` : ''}
            
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="updateRoomConfirm" style="flex: 1; padding: 8px 12px; min-width: 0; background: #0a0a0a; border: 2px solid #00ff00; color: #00ff00; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px; white-space: nowrap;">Update Room</button>
                <button id="deleteRoomConfirm" style="flex: 1; padding: 8px 12px; min-width: 0; background: #cc0000; border: 2px solid #ff0000; color: #fff; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px; white-space: nowrap;">Delete Room</button>
            </div>
            <button id="updateRoomCancel" style="width: 100%; margin-top: 8px; padding: 8px 12px; background: #0a0a0a; border: 2px solid #00ff00; color: #00ff00; font-family: 'Courier New', monospace; cursor: pointer; font-size: 12px;">Cancel</button>
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
        
        // Add item button handler
        document.getElementById('addItemBtn').addEventListener('click', () => {
            const itemSelect = document.getElementById('itemToAdd');
            const itemName = itemSelect.value;
            if (itemName && selectedRoom.id) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'addItemToRoom',
                        roomId: selectedRoom.id,
                        itemName: itemName,
                        quantity: 1
                    }));
                }
            }
        });
        
        // Request room items for this room
        if (selectedRoom.id && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'getRoomItemsForEditor',
                roomId: selectedRoom.id
            }));
        }
        
        // Request merchant inventory if this is a merchant room
        if (selectedRoom.roomType === 'merchant' && selectedRoom.id && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'getMerchantInventory',
                roomId: selectedRoom.id
            }));
            
            // Populate merchant item dropdown
            const merchantItemSelect = document.getElementById('merchantItemToAdd');
            if (merchantItemSelect && allItemsData.length > 0) {
                merchantItemSelect.innerHTML = '<option value="">Select item...</option>' + 
                    allItemsData.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
            }
            
            // Add merchant item button handler
            const addMerchantItemBtn = document.getElementById('addMerchantItemBtn');
            if (addMerchantItemBtn) {
                addMerchantItemBtn.addEventListener('click', () => {
                    const itemSelect = document.getElementById('merchantItemToAdd');
                    const itemId = parseInt(itemSelect.value);
                    if (itemId && selectedRoom.id) {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'addItemToMerchantRoom',
                                roomId: selectedRoom.id,
                                itemId: itemId
                            }));
                        }
                    }
                });
            }
        }
        
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
        sidePanel.innerHTML = `
            <p>Select a room to edit or click empty space to create a new room.</p>
            ${editorMode === 'connect' ? '<p><strong>Connect Mode:</strong> Click a room to select as source.</p>' : ''}
        `;
    }
}

// Create room
function createRoom(mapId, name, description, x, y, roomType) {
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

// Update room
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

// Delete rooms
function deleteRooms(roomsToDelete) {
    if (!roomsToDelete || roomsToDelete.length === 0) return;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const connectedRooms = roomsToDelete.filter(room => 
        (room.connected_map_id !== null && room.connected_map_id !== undefined) ||
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
    
    roomsToDelete.forEach(room => {
        ws.send(JSON.stringify({
            type: 'deleteRoom',
            roomId: room.id
        }));
    });
}

// Load rooms for target map
function loadTargetMapRooms(mapId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'getMapEditorData', mapId: mapId }));
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

// Handle map editor zoom
function handleMapEditorZoom(e) {
    const zoomSpeed = 0.1;
    const minZoom = 0.5;
    const maxZoom = 5.0;
    
    if (e.deltaY < 0) {
        editorZoom = Math.min(editorZoom + zoomSpeed, maxZoom);
    } else {
        editorZoom = Math.max(editorZoom - zoomSpeed, minZoom);
    }
    
    renderMapEditor();
}

// Handle map editor panning
function handleMapEditorPan(direction) {
    const panAmount = 5;
    
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    mapEditor = document.getElementById('mapEditor');
    mapEditorCanvas = document.getElementById('mapEditorCanvas');
    if (mapEditorCanvas) {
        mapEditorCtx = mapEditorCanvas.getContext('2d');
        
        requestAnimationFrame(() => {
            const container = mapEditorCanvas.parentElement;
            if (container) {
                mapEditorCanvas.width = container.clientWidth;
                mapEditorCanvas.height = container.clientHeight;
                
                // Create tooltip element if it doesn't exist
                if (!mapEditorTooltip) {
                    mapEditorTooltip = document.createElement('div');
                    mapEditorTooltip.id = 'mapEditorTooltip';
                    mapEditorTooltip.style.cssText = `
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
                    container.style.position = 'relative'; // Make container positioned for tooltip
                    container.appendChild(mapEditorTooltip);
                }
                
                renderMapEditor();
            }
        });

        mapEditorCanvas.addEventListener('click', (e) => {
            if (!isDragging) {
                handleMapEditorClick(e);
            }
        });
        
        mapEditorCanvas.addEventListener('mousedown', (e) => {
            isDragging = false;
            const rect = mapEditorCanvas.getBoundingClientRect();
            dragStartX = e.clientX - rect.left;
            dragStartY = e.clientY - rect.top;
        });
        
        mapEditorCanvas.addEventListener('mousemove', (e) => {
            if (e.buttons === 1) {
                const rect = mapEditorCanvas.getBoundingClientRect();
                dragEndX = e.clientX - rect.left;
                dragEndY = e.clientY - rect.top;
                
                if (Math.abs(dragEndX - dragStartX) > 5 || Math.abs(dragEndY - dragStartY) > 5) {
                    isDragging = true;
                    handleMapEditorDrag();
                }
            }
            
            // Handle tooltip (only when not dragging)
            if (!isDragging && e.buttons === 0) {
                handleMapEditorTooltip(e);
            } else {
                hideMapEditorTooltip();
            }
        });
        
        mapEditorCanvas.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                handleMapEditorDragEnd();
            }
        });
        
        mapEditorCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            handleMapEditorZoom(e);
        });
        
        mapEditorCanvas.addEventListener('mouseleave', () => {
            hideMapEditorTooltip();
        });
    }
    
    // Close button
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

    // Room type colors button
    const roomTypeColorsBtn = document.getElementById('roomTypeColorsBtn');
    if (roomTypeColorsBtn) {
        roomTypeColorsBtn.addEventListener('click', () => {
            showRoomTypeColorsDialog();
            // Request current room type colors and room types from server
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'getAllRoomTypeColors' }));
                ws.send(JSON.stringify({ type: 'getAllRoomTypes' }));
            }
        });
    }

    // Room type colors dialog close button
    const roomTypeColorsClose = document.getElementById('roomTypeColorsClose');
    if (roomTypeColorsClose) {
        roomTypeColorsClose.addEventListener('click', () => {
            hideRoomTypeColorsDialog();
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
    
    // Handle arrow keys for panning and keypad for speed mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
            e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            handleMapEditorPan(e.key);
        } else if (e.key >= '1' && e.key <= '9' && (e.location === 3 || e.code.startsWith('Numpad'))) {
            e.preventDefault();
            handleSpeedModeNavigation(e.key);
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
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
    
    // Connect to WebSocket and initialize
    connectWebSocket();
    
    // Load all maps
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getAllMaps' }));
        }
    }, 500);
});

