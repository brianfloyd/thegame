/**
 * Map Editor - Hybrid Alpine.js + Canvas Component
 * 
 * Uses Alpine.js for state management and UI chrome,
 * with canvas rendering for the map visualization.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import {
    ROOM_TYPES,
    ROOM_TYPE_LABELS,
    ROOM_TYPE_COLORS,
    DIRECTIONS,
    mapRowToMap,
    mapRowsToMaps,
    mapRowToRoom,
    mapRowsToRooms,
    validateRoom,
    validateMap,
    getRoomTypeLabel,
    getRoomTypeColor
} from '/js/models/room.js';

// Canvas rendering constants
const GRID_SIZE = 100;
const CELL_SIZE = 8;

// Make mapEditor available globally for Alpine.js
window.mapEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        // Map data
        maps: [],
        currentMap: null,
        rooms: [],
        
        // Related data
        allNpcs: [],
        allItems: [],
        
        // Selection
        selectedRoom: null,
        selectedRooms: [],
        isCreatingRoom: false,
        
        // Editor modes
        editorMode: 'select', // 'select', 'create', 'connect', 'massNpc'
        connectionSource: null,
        massNpcId: null,
        massNpcQuantity: 1,
        
        // Canvas state
        canvas: null,
        ctx: null,
        zoom: 1.0,
        panX: 0,
        panY: 0,
        
        // Loading state
        loading: false,
        
        // Filters
        filters: {
            search: ''
        },
        
        // Form data (matches database schema)
        formData: {
            name: '',
            description: '',
            room_type: 'normal',
            factory_tier: 1,
            // Map connection fields
            connected_map_id: '',
            connected_room_x: '',
            connected_room_y: '',
            connection_direction: ''
        },
        
        // New map form
        newMapForm: {
            name: '',
            description: ''
        },
        
        // Room type colors (editable)
        roomTypeColors: { ...ROOM_TYPE_COLORS },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        // Dialogs
        showCreateMapDialog: false,
        showRoomTypeColorsDialog: false,
        
        // Constants for template
        ROOM_TYPES,
        ROOM_TYPE_LABELS,

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[MapEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[MapEditor] EditorBase ready, loading maps...');
                    this.loadMaps();
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            // Initialize canvas after DOM is ready - use setTimeout to ensure layout is complete
            this.$nextTick(() => {
                // Small delay to ensure layout is complete
                setTimeout(() => {
                    this.initCanvas();
                    console.log('[MapEditor] Canvas initialized');
                }, 100);
            });
            
            // Restore room type colors from localStorage
            this.restoreRoomTypeColors();
            
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
            });
            
            // Set up keyboard shortcuts
            window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        },
        
        initCanvas() {
            this.canvas = document.getElementById('mapCanvas');
            if (this.canvas) {
                console.log('[MapEditor] Found canvas element');
                this.ctx = this.canvas.getContext('2d');
                
                // Resize canvas to fill container
                this.resizeCanvas();
                
                // Handle window resize
                window.addEventListener('resize', () => this.resizeCanvas());
                
                // Canvas event listeners
                this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
                this.canvas.addEventListener('wheel', (e) => this.handleCanvasWheel(e));
                this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
                
                // Initial render
                this.render();
            } else {
                console.error('[MapEditor] Canvas element not found!');
            }
        },
        
        resizeCanvas() {
            if (!this.canvas) return;
            const container = this.canvas.parentElement;
            if (container) {
                // Get actual container dimensions
                const rect = container.getBoundingClientRect();
                const width = rect.width || container.clientWidth || 800;
                const height = rect.height || container.clientHeight || 600;
                
                this.canvas.width = width;
                this.canvas.height = height;
                console.log(`[MapEditor] Canvas resized to ${width}x${height}`);
                this.render();
            }
        },

        // ============================================
        // WEBSOCKET HANDLERS
        // ============================================
        
        handleMessage(data) {
            console.log('[MapEditor] Message:', data.type, data);
            
            switch (data.type) {
                case 'allMaps':
                    // Maps come as { id, name } - simple format
                    this.maps = (data.maps || []).map(m => ({
                        id: m.id,
                        name: m.name || `Map ${m.id}`
                    }));
                    this.loading = false;
                    console.log('[MapEditor] Loaded maps:', this.maps.length);
                    // Auto-select first map if none selected
                    if (!this.currentMap && this.maps.length > 0) {
                        this.selectMap(this.maps[0].id);
                    }
                    break;
                    
                case 'mapData':
                    // Server sends { rooms, roomTypeColors, currentRoom, mapId }
                    // Update current map reference
                    if (data.mapId) {
                        this.currentMap = this.maps.find(m => m.id === data.mapId) || { id: data.mapId, name: `Map ${data.mapId}` };
                    }
                    // Map rooms from server format (matches database schema)
                    if (data.rooms) {
                        this.rooms = (data.rooms || []).map(r => ({
                            id: r.id,
                            map_id: r.mapId || r.map_id,
                            name: r.name || '',
                            description: r.description || '',
                            x: r.x ?? 0,
                            y: r.y ?? 0,
                            room_type: r.roomType || r.room_type || 'normal',
                            // Map connection fields
                            connected_map_id: r.connected_map_id || null,
                            connected_room_x: r.connected_room_x || null,
                            connected_room_y: r.connected_room_y || null,
                            connection_direction: r.connection_direction || null,
                            // Factory fields
                            factory_tier: r.factory_tier || null
                        }));
                    }
                    // Store room type colors from database
                    if (data.roomTypeColors) {
                        this.roomTypeColors = { ...ROOM_TYPE_COLORS, ...data.roomTypeColors };
                    }
                    // Center on player's current room if available
                    if (data.currentRoom) {
                        const currentRoom = this.rooms.find(r => r.id === data.currentRoom.id);
                        if (currentRoom) {
                            this.centerOnRoom(currentRoom);
                            this.selectRoom(currentRoom);
                        }
                    }
                    this.loading = false;
                    console.log('[MapEditor] Loaded rooms:', this.rooms.length);
                    this.render();
                    break;
                    
                case 'mapEditorData':
                    // Alternative response from getMapEditorData handler
                    if (data.mapId) {
                        this.currentMap = { id: data.mapId, name: data.mapName || `Map ${data.mapId}` };
                    }
                    if (data.rooms) {
                        this.rooms = (data.rooms || []).map(r => ({
                            id: r.id,
                            map_id: r.mapId || r.map_id,
                            name: r.name || '',
                            description: r.description || '',
                            x: r.x ?? 0,
                            y: r.y ?? 0,
                            room_type: r.roomType || r.room_type || 'normal',
                            // Map connection fields
                            connected_map_id: r.connected_map_id || null,
                            connected_room_x: r.connected_room_x || null,
                            connected_room_y: r.connected_room_y || null,
                            connection_direction: r.connection_direction || null,
                            // Factory fields
                            factory_tier: r.factory_tier || null
                        }));
                    }
                    if (data.roomTypeColors) {
                        this.roomTypeColors = { ...ROOM_TYPE_COLORS, ...data.roomTypeColors };
                    }
                    this.loading = false;
                    this.render();
                    break;
                    
                case 'npcList':
                    this.allNpcs = data.npcs || [];
                    break;
                    
                case 'itemList':
                    this.allItems = data.items || [];
                    break;
                    
                case 'roomCreated':
                    if (data.room) {
                        const room = mapRowToRoom(data.room);
                        this.rooms.push(room);
                        this.selectRoom(room);
                        this.render();
                        this.showNotification('Room created', 'success');
                    }
                    this.loading = false;
                    this.isCreatingRoom = false;
                    break;
                    
                case 'roomUpdated':
                    if (data.room) {
                        const room = mapRowToRoom(data.room);
                        const index = this.rooms.findIndex(r => r.id === room.id);
                        if (index !== -1) {
                            this.rooms[index] = room;
                        }
                        if (this.selectedRoom && this.selectedRoom.id === room.id) {
                            this.selectedRoom = room;
                            this.populateRoomForm(room);
                        }
                        this.render();
                        this.showNotification('Room updated', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'roomDeleted':
                    if (data.roomId) {
                        this.rooms = this.rooms.filter(r => r.id !== data.roomId);
                        if (this.selectedRoom && this.selectedRoom.id === data.roomId) {
                            this.selectedRoom = null;
                            this.resetRoomForm();
                        }
                        this.render();
                        this.showNotification('Room deleted', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'mapCreated':
                    if (data.map) {
                        const map = mapRowToMap(data.map);
                        this.maps.push(map);
                        this.selectMap(map.id);
                        this.showNotification('Map created', 'success');
                    }
                    this.loading = false;
                    this.showCreateMapDialog = false;
                    break;
                    
                case 'error':
                    this.showNotification(data.message || 'An error occurred', 'error');
                    this.loading = false;
                    break;
            }
        },

        // ============================================
        // DATA LOADING
        // ============================================
        
        loadMaps() {
            this.loading = true;
            EditorBase.send({ type: 'getAllMaps' });
            EditorBase.send({ type: 'getAllNPCs' });
            EditorBase.send({ type: 'getAllItems' });
        },
        
        selectMap(mapId) {
            this.loading = true;
            this.selectedRoom = null;
            this.selectedRooms = [];
            this.resetRoomForm();
            EditorBase.send({ type: 'getMapData', mapId: parseInt(mapId) });
        },

        // ============================================
        // ROOM SELECTION
        // ============================================
        
        selectRoom(room) {
            this.selectedRoom = room;
            this.selectedRooms = [room];
            this.isCreatingRoom = false;
            this.populateRoomForm(room);
            this.render();
        },
        
        selectRoomAt(x, y) {
            const room = this.rooms.find(r => r.x === x && r.y === y);
            if (room) {
                this.selectRoom(room);
            } else if (this.editorMode === 'create') {
                // Create new room at empty position
                this.startCreateRoom(x, y);
            }
        },
        
        startCreateRoom(x, y) {
            this.isCreatingRoom = true;
            this.selectedRoom = { x, y, isNew: true };
            this.resetRoomForm();
            this.formData.name = `Room (${x}, ${y})`;
            this.render();
        },
        
        populateRoomForm(room) {
            this.formData = {
                name: room.name || '',
                description: room.description || '',
                room_type: room.room_type || 'normal',
                factory_tier: room.factory_tier || 1,
                connected_map_id: room.connected_map_id || '',
                connected_room_x: room.connected_room_x || '',
                connected_room_y: room.connected_room_y || '',
                connection_direction: room.connection_direction || ''
            };
        },
        
        resetRoomForm() {
            this.formData = {
                name: '',
                description: '',
                room_type: 'normal',
                factory_tier: 1,
                connected_map_id: '',
                connected_room_x: '',
                connected_room_y: '',
                connection_direction: ''
            };
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        createRoom() {
            if (!this.currentMap || !this.selectedRoom?.isNew) return;
            if (!this.formData.name.trim()) {
                this.showNotification('Room name is required', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'createRoom',
                mapId: this.currentMap.id,
                x: this.selectedRoom.x,
                y: this.selectedRoom.y,
                name: this.formData.name.trim(),
                description: this.formData.description.trim(),
                room_type: this.formData.room_type
            });
        },
        
        saveRoom() {
            if (!this.selectedRoom || this.selectedRoom.isNew) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'updateRoom',
                roomId: this.selectedRoom.id,
                name: this.formData.name.trim(),
                description: this.formData.description.trim(),
                room_type: this.formData.room_type,
                factory_tier: this.formData.room_type === 'factory' ? parseInt(this.formData.factory_tier) : null,
                // Map connection fields (matching database schema)
                connected_map_id: this.formData.connected_map_id ? parseInt(this.formData.connected_map_id) : null,
                connected_room_x: this.formData.connected_room_x ? parseInt(this.formData.connected_room_x) : null,
                connected_room_y: this.formData.connected_room_y ? parseInt(this.formData.connected_room_y) : null,
                connection_direction: this.formData.connection_direction || null
            });
        },
        
        deleteRoom() {
            if (!this.selectedRoom || this.selectedRoom.isNew) return;
            if (!confirm(`Delete room "${this.selectedRoom.name}"?`)) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'deleteRoom',
                roomId: this.selectedRoom.id
            });
        },
        
        createMap() {
            if (!this.newMapForm.name.trim()) {
                this.showNotification('Map name is required', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'createMap',
                name: this.newMapForm.name.trim(),
                description: this.newMapForm.description.trim()
            });
        },

        // ============================================
        // EDITOR MODES
        // ============================================
        
        setMode(mode) {
            this.editorMode = mode;
            if (mode !== 'connect') {
                this.connectionSource = null;
            }
            if (mode !== 'massNpc') {
                this.massNpcId = null;
            }
            this.showNotification(`Mode: ${mode}`, 'info');
        },
        
        toggleConnectMode() {
            if (this.editorMode === 'connect') {
                this.setMode('select');
            } else {
                this.setMode('connect');
            }
        },
        
        toggleMassNpcMode() {
            if (this.editorMode === 'massNpc') {
                this.setMode('select');
            } else {
                this.setMode('massNpc');
            }
        },

        // ============================================
        // CANVAS RENDERING
        // ============================================
        
        render() {
            if (!this.canvas || !this.ctx) return;
            
            const ctx = this.ctx;
            const width = this.canvas.width;
            const height = this.canvas.height;
            
            // Clear canvas
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            
            if (!this.currentMap) {
                ctx.fillStyle = '#333';
                ctx.font = '16px Courier New';
                ctx.textAlign = 'center';
                ctx.fillText('Select a map to edit', width / 2, height / 2);
                return;
            }
            
            // Calculate grid parameters
            const gridWidth = GRID_SIZE * CELL_SIZE;
            const gridHeight = GRID_SIZE * CELL_SIZE;
            const baseScale = Math.min(width / gridWidth, height / gridHeight, 1);
            const scaledCellSize = CELL_SIZE * baseScale * this.zoom;
            const scaledGridWidth = GRID_SIZE * scaledCellSize;
            const scaledGridHeight = GRID_SIZE * scaledCellSize;
            
            const centerOffsetX = (width - scaledGridWidth) / 2;
            const centerOffsetY = (height - scaledGridHeight) / 2;
            const offsetX = centerOffsetX - (this.panX * scaledCellSize);
            const offsetY = centerOffsetY + (this.panY * scaledCellSize);
            
            const gridCenter = Math.floor(GRID_SIZE / 2);
            
            // Draw grid lines (visible range only)
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            
            const startX = Math.max(0, Math.floor(-offsetX / scaledCellSize) - 1);
            const endX = Math.min(GRID_SIZE, Math.ceil((width - offsetX) / scaledCellSize) + 1);
            const startY = Math.max(0, Math.floor(-offsetY / scaledCellSize) - 1);
            const endY = Math.min(GRID_SIZE, Math.ceil((height - offsetY) / scaledCellSize) + 1);
            
            for (let x = startX; x <= endX; x++) {
                const screenX = offsetX + x * scaledCellSize;
                ctx.beginPath();
                ctx.moveTo(screenX, 0);
                ctx.lineTo(screenX, height);
                ctx.stroke();
            }
            
            for (let y = startY; y <= endY; y++) {
                const screenY = offsetY + y * scaledCellSize;
                ctx.beginPath();
                ctx.moveTo(0, screenY);
                ctx.lineTo(width, screenY);
                ctx.stroke();
            }
            
            // Draw rooms
            this.rooms.forEach(room => {
                const gridX = room.x + gridCenter;
                const gridY = gridCenter - room.y;
                
                const screenX = offsetX + gridX * scaledCellSize;
                const screenY = offsetY + gridY * scaledCellSize;
                
                // Skip if off-screen
                if (screenX + scaledCellSize < 0 || screenX > width ||
                    screenY + scaledCellSize < 0 || screenY > height) return;
                
                // Get room color
                let fillColor = this.roomTypeColors[room.room_type] || this.roomTypeColors.normal || '#00ff00';
                let borderColor = '#666';
                
                // Check if connected to another map
                if (room.connected_map_id) {
                    fillColor = '#ffffff';
                    borderColor = '#cccccc';
                }
                
                // Check selection state
                const isSelected = this.selectedRoom && this.selectedRoom.id === room.id;
                const isInSelection = this.selectedRooms.some(r => r.id === room.id);
                
                if (isSelected || isInSelection) {
                    borderColor = '#ff0000';
                    ctx.lineWidth = 3;
                } else if (this.connectionSource && this.connectionSource.id === room.id) {
                    borderColor = '#ff8800';
                    ctx.lineWidth = 3;
                } else {
                    ctx.lineWidth = 1;
                }
                
                const padding = Math.max(1, scaledCellSize * 0.1);
                
                // Draw room
                ctx.fillStyle = fillColor;
                ctx.fillRect(screenX + padding, screenY + padding, 
                            scaledCellSize - padding * 2, scaledCellSize - padding * 2);
                
                ctx.strokeStyle = borderColor;
                ctx.strokeRect(screenX + padding, screenY + padding, 
                              scaledCellSize - padding * 2, scaledCellSize - padding * 2);
                
                // Draw connection indicator
                if (room.connected_map_id) {
                    const indicatorSize = scaledCellSize * 0.15;
                    ctx.fillStyle = '#ffff00';
                    ctx.beginPath();
                    ctx.arc(screenX + scaledCellSize - indicatorSize, screenY + indicatorSize, 
                           indicatorSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            
            // Draw new room indicator
            if (this.selectedRoom?.isNew) {
                const gridX = this.selectedRoom.x + gridCenter;
                const gridY = gridCenter - this.selectedRoom.y;
                const screenX = offsetX + gridX * scaledCellSize;
                const screenY = offsetY + gridY * scaledCellSize;
                
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(screenX, screenY, scaledCellSize, scaledCellSize);
                ctx.setLineDash([]);
                
                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
            }
            
            // Draw zoom level
            ctx.fillStyle = '#00ff00';
            ctx.font = '12px Courier New';
            ctx.textAlign = 'left';
            ctx.fillText(`Zoom: ${(this.zoom * 100).toFixed(0)}%`, 10, 20);
            ctx.fillText(`Mode: ${this.editorMode}`, 10, 35);
            if (this.currentMap) {
                ctx.fillText(`Map: ${this.currentMap.name}`, 10, 50);
            }
        },

        // ============================================
        // CANVAS EVENT HANDLERS
        // ============================================
        
        handleCanvasClick(e) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const coords = this.screenToMapCoords(x, y);
            if (coords) {
                this.selectRoomAt(coords.x, coords.y);
            }
        },
        
        handleCanvasWheel(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom = Math.max(0.5, Math.min(5.0, this.zoom + delta));
            this.render();
        },
        
        handleCanvasMouseMove(e) {
            // Could add hover effects here
        },
        
        screenToMapCoords(screenX, screenY) {
            if (!this.canvas) return null;
            
            const width = this.canvas.width;
            const height = this.canvas.height;
            const gridWidth = GRID_SIZE * CELL_SIZE;
            const gridHeight = GRID_SIZE * CELL_SIZE;
            const baseScale = Math.min(width / gridWidth, height / gridHeight, 1);
            const scaledCellSize = CELL_SIZE * baseScale * this.zoom;
            const scaledGridWidth = GRID_SIZE * scaledCellSize;
            const scaledGridHeight = GRID_SIZE * scaledCellSize;
            
            const centerOffsetX = (width - scaledGridWidth) / 2;
            const centerOffsetY = (height - scaledGridHeight) / 2;
            const offsetX = centerOffsetX - (this.panX * scaledCellSize);
            const offsetY = centerOffsetY + (this.panY * scaledCellSize);
            
            const gridCenter = Math.floor(GRID_SIZE / 2);
            
            const gridX = Math.floor((screenX - offsetX) / scaledCellSize);
            const gridY = Math.floor((screenY - offsetY) / scaledCellSize);
            
            const mapX = gridX - gridCenter;
            const mapY = gridCenter - gridY;
            
            return { x: mapX, y: mapY };
        },
        
        handleKeyDown(e) {
            // Skip if typing in input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            const panAmount = 5;
            
            // Arrow keys always pan the canvas
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.panX -= panAmount;
                    this.render();
                    return;
                case 'ArrowRight':
                    e.preventDefault();
                    this.panX += panAmount;
                    this.render();
                    return;
                case 'ArrowUp':
                    e.preventDefault();
                    this.panY += panAmount;
                    this.render();
                    return;
                case 'ArrowDown':
                    e.preventDefault();
                    this.panY -= panAmount;
                    this.render();
                    return;
            }
            
            // Numpad navigation: only works in create mode when a room is selected
            if (e.code?.startsWith('Numpad') && this.editorMode === 'create' && this.selectedRoom) {
                e.preventDefault();
                
                // Get current room position
                const currentX = this.selectedRoom.x;
                const currentY = this.selectedRoom.y;
                let newX = currentX;
                let newY = currentY;
                
                // Calculate new position based on numpad direction
                switch (e.code) {
                    case 'Numpad4': // Left
                        newX = currentX - 1;
                        break;
                    case 'Numpad6': // Right
                        newX = currentX + 1;
                        break;
                    case 'Numpad8': // Up
                        newY = currentY + 1;
                        break;
                    case 'Numpad2': // Down
                        newY = currentY - 1;
                        break;
                    case 'Numpad7': // Up-Left
                        newX = currentX - 1;
                        newY = currentY + 1;
                        break;
                    case 'Numpad9': // Up-Right
                        newX = currentX + 1;
                        newY = currentY + 1;
                        break;
                    case 'Numpad1': // Down-Left
                        newX = currentX - 1;
                        newY = currentY - 1;
                        break;
                    case 'Numpad3': // Down-Right
                        newX = currentX + 1;
                        newY = currentY - 1;
                        break;
                    case 'Numpad5': // Center (no movement)
                        this.render();
                        return;
                    default:
                        return;
                }
                
                // Check if room exists at new position
                const existingRoom = this.rooms.find(r => r.x === newX && r.y === newY);
                if (existingRoom) {
                    // Room exists - just navigate to it (no creation)
                    this.selectRoom(existingRoom);
                } else {
                    // No room exists - create new room instantly
                    if (!this.currentMap) return;
                    this.loading = true;
                    EditorBase.send({
                        type: 'createRoom',
                        mapId: this.currentMap.id,
                        x: newX,
                        y: newY,
                        name: `Room (${newX}, ${newY})`,
                        description: '',
                        room_type: 'normal'
                    });
                    // The room will be created via the roomCreated message handler
                }
                this.render();
                return;
            }
            
            // Other keyboard shortcuts
            switch (e.key) {
                case 'c':
                    if (!e.ctrlKey) {
                        e.preventDefault();
                        this.setMode('create');
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.setMode('select');
                    this.selectedRoom = null;
                    this.isCreatingRoom = false;
                    this.render();
                    break;
            }
        },
        
        centerOnRoom(room) {
            if (!room) return;
            this.panX = room.x;
            this.panY = room.y;
            this.render();
        },
        
        centerOnMap() {
            // Center on the map's center point (average of all rooms)
            if (this.rooms.length === 0) return;
            const avgX = this.rooms.reduce((sum, r) => sum + r.x, 0) / this.rooms.length;
            const avgY = this.rooms.reduce((sum, r) => sum + r.y, 0) / this.rooms.length;
            this.panX = avgX;
            this.panY = avgY;
            this.render();
        },
        
        resetView() {
            this.zoom = 1.0;
            this.panX = 0;
            this.panY = 0;
            this.render();
        },

        // ============================================
        // ROOM TYPE COLORS
        // ============================================
        
        saveRoomTypeColors() {
            localStorage.setItem('mapEditorRoomTypeColors', JSON.stringify(this.roomTypeColors));
            this.showRoomTypeColorsDialog = false;
            this.render();
            this.showNotification('Room type colors saved', 'success');
        },
        
        restoreRoomTypeColors() {
            const saved = localStorage.getItem('mapEditorRoomTypeColors');
            if (saved) {
                try {
                    this.roomTypeColors = { ...ROOM_TYPE_COLORS, ...JSON.parse(saved) };
                } catch (e) { }
            }
        },
        
        resetRoomTypeColors() {
            this.roomTypeColors = { ...ROOM_TYPE_COLORS };
        },

        // ============================================
        // UTILITIES
        // ============================================
        
        showNotification(message, type = 'info') {
            this.notification = { show: true, message, type };
            setTimeout(() => {
                this.notification.show = false;
            }, 3000);
        },
        
        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        },
        
        getRoomTypeLabel(type) {
            return ROOM_TYPE_LABELS[type] || type;
        },
        
        getFilteredRooms() {
            if (!this.filters.search) return this.rooms;
            const search = this.filters.search.toLowerCase();
            return this.rooms.filter(room => 
                room.name.toLowerCase().includes(search) ||
                (room.description && room.description.toLowerCase().includes(search))
            );
        }
    };
};
