// Map Editor - Standalone page
// Session-based authentication (no URL params needed)

// WebSocket connection
let ws = null;
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.hostname}:3434`;

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
            currentEditorMapId = data.mapId;
            renderMapEditor();
            updateSidePanel();
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
        case 'mapData':
            // Store current map info for player room highlighting
            currentMapId = data.mapId;
            break;
        case 'error':
            alert(data.message);
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
        
        let fillColor = '#00ff00';
        let borderColor = '#ffff00';
        
        const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
        
        if (hasConnection) {
            fillColor = '#ffffff';
            borderColor = '#cccccc';
        } else {
            const directions = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                              { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }];
            const isAdjoining = directions.some(dir => {
                const checkX = room.x + dir.dx;
                const checkY = room.y + dir.dy;
                return roomCoords.has(`${checkX},${checkY}`);
            });
            
            if (isAdjoining) {
                fillColor = '#006600';
                borderColor = '#004400';
            } else if (room.name && room.name.startsWith('Room ')) {
                fillColor = '#0088ff';
                borderColor = '#0066cc';
            } else if (room.roomType === 'merchant') {
                fillColor = '#0088ff';
                borderColor = '#0066cc';
            }
        }
        
        const isSelected = selectedRooms.some(r => r.id === room.id) || (selectedRoom && selectedRoom.id === room.id);
        
        if (isSelected) {
            borderColor = '#ff0000';
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

