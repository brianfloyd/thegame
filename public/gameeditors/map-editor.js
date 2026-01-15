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
        playerCurrentLocation: null, // { mapId, roomId, room: { id, x, y } }
        pendingRoomSelection: null, // { x, y } - room to select after map loads
        
        // Related data
        allNpcs: [],
        allItems: [],
        roomNPCs: [], // NPCs in the currently selected room
        availableNPCs: [], // All active NPCs available for adding to room
        newRoomNPCId: '', // Selected NPC ID for adding to room (empty string or string ID)
        
        // Selection
        selectedRoom: null,
        selectedRooms: [],
        isCreatingRoom: false,
        
        // Editor modes
        editorMode: 'select', // 'select', 'create', 'connect', 'massNpc'
        connectionSource: null,
        massNpcId: null,
        massNpcQuantity: 1,
        
        // Event handler references (for cleanup)
        keydownHandler: null,
        
        // Canvas state
        canvas: null,
        ctx: null,
        zoom: 1.0,
        panX: 0,
        panY: 0,
        resizeObserver: null,
        
        // Mouse drag state for panning
        isPanning: false,
        panStartX: 0,
        panStartY: 0,
        panStartPanX: 0,
        panStartPanY: 0,
        
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
            connected_room_id: '', // Selected room ID (will be converted to x, y on save)
            connected_room_x: '',
            connected_room_y: '',
            connection_direction: ''
        },
        
        // Connection room data
        connectionRooms: [], // Rooms from the selected connection map
        pendingConnectionTarget: null, // {x, y} to select after rooms load
        
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
        showImportMapDialog: false,
        
        // Import/Export state
        importMapData: {
            jsonData: '',
            entranceRoom: { x: null, y: null },
            connectionMapId: '',
            connectionRoomId: '',
            connectionDirection: '',
            validationErrors: [],
            validationWarnings: []
        },
        availableConnectionRooms: [],
        
        // Constants for template
        ROOM_TYPES,
        ROOM_TYPE_LABELS,

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            EditorBase.init({
                onReady: (socket) => {
                    // Request player's current location first
                    EditorBase.send({ type: 'getPlayerCurrentLocation' });
                    this.loadMaps();
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            // Initialize canvas after DOM is ready - use multiple strategies to ensure layout is complete
            this.$nextTick(() => {
                // Use requestAnimationFrame to ensure layout has been calculated
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Double RAF ensures layout is painted
                        this.initCanvas();
                        
                        // Additional delayed resize as fallback for complex layouts
                        setTimeout(() => {
                            if (this.canvas) {
                                this.resizeCanvas();
                            }
                        }, 100);
                        
                        // One more resize after a longer delay to catch any late layout changes
                        setTimeout(() => {
                            if (this.canvas) {
                                this.resizeCanvas();
                            }
                        }, 500);
                    });
                });
            });
            
            // Restore room type colors from localStorage
            this.restoreRoomTypeColors();
            
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
                // Cleanup ResizeObserver
                if (this.resizeObserver) {
                    this.resizeObserver.disconnect();
                }
            });
            
            // Set up keyboard shortcuts (only once)
            if (!this.keydownHandler) {
                this.keydownHandler = (e) => this.handleKeyDown(e);
                window.addEventListener('keydown', this.keydownHandler);
            }
        },
        
        initCanvas() {
            this.canvas = document.getElementById('mapCanvas');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                
                // Resize canvas to fill container
                this.resizeCanvas();
                
                // Handle window resize with debouncing
                let resizeTimeout;
                const handleResize = () => {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => {
                        this.resizeCanvas();
                    }, 100);
                };
                window.addEventListener('resize', handleResize);
                
                // Use ResizeObserver to watch container size changes
                const container = this.canvas.parentElement;
                if (container && window.ResizeObserver) {
                    this.resizeObserver = new ResizeObserver(() => {
                        // Use requestAnimationFrame to ensure layout is complete
                        requestAnimationFrame(() => {
                            this.resizeCanvas();
                        });
                    });
                    this.resizeObserver.observe(container);
                }
                
                // Canvas event listeners
                this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
                this.canvas.addEventListener('wheel', (e) => this.handleCanvasWheel(e));
                this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
                this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
                this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
                this.canvas.addEventListener('mouseleave', (e) => this.handleCanvasMouseLeave(e));
                // Prevent context menu on middle mouse button
                this.canvas.addEventListener('contextmenu', (e) => {
                    if (e.button === 1) {
                        e.preventDefault();
                    }
                });
                
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
                // Wait for next frame to ensure layout is complete
                requestAnimationFrame(() => {
                    // Get actual container dimensions using multiple methods for reliability
                    const rect = container.getBoundingClientRect();
                    // Use rect dimensions if valid, otherwise fall back to computed styles
                    let width = rect.width;
                    let height = rect.height;
                    
                    // If rect dimensions are 0 or invalid, try computed styles
                    if (width <= 0 || height <= 0) {
                        const computedStyle = window.getComputedStyle(container);
                        width = parseFloat(computedStyle.width) || container.clientWidth || 800;
                        height = parseFloat(computedStyle.height) || container.clientHeight || 600;
                    }
                    
                    // Ensure minimum dimensions
                    width = Math.max(width, 100);
                    height = Math.max(height, 100);
                    
                    // Only update if dimensions actually changed to avoid unnecessary renders
                    if (this.canvas.width !== width || this.canvas.height !== height) {
                        this.canvas.width = width;
                        this.canvas.height = height;
                        this.render();
                    }
                });
            }
        },

        // ============================================
        // WEBSOCKET HANDLERS
        // ============================================
        
        handleMessage(data) {
            switch (data.type) {
                case 'playerCurrentLocation':
                    // Store player's current location
                    this.playerCurrentLocation = {
                        mapId: data.mapId,
                        roomId: data.roomId,
                        room: data.room
                    };
                    // If maps are already loaded, select the player's map
                    if (this.maps.length > 0 && this.playerCurrentLocation.mapId) {
                        this.selectMap(this.playerCurrentLocation.mapId);
                    }
                    break;
                    
                case 'allMaps':
                    // Maps come as { id, name } - simple format
                    this.maps = (data.maps || []).map(m => ({
                        id: m.id,
                        name: m.name || `Map ${m.id}`
                    }));
                    this.loading = false;
                    // Auto-select player's current map if available, otherwise first map
                    if (!this.currentMap && this.maps.length > 0) {
                        if (this.playerCurrentLocation && this.playerCurrentLocation.mapId) {
                            // Check if player's map exists in the maps list
                            const playerMap = this.maps.find(m => m.id === this.playerCurrentLocation.mapId);
                            if (playerMap) {
                                this.selectMap(this.playerCurrentLocation.mapId);
                            } else {
                                this.selectMap(this.maps[0].id);
                            }
                        } else {
                            this.selectMap(this.maps[0].id);
                        }
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
                            // Map connection fields (use explicit null check to allow 0 as valid coordinate)
                            connected_map_id: r.connected_map_id || null,
                            connected_room_x: r.connected_room_x !== null && r.connected_room_x !== undefined ? r.connected_room_x : null,
                            connected_room_y: r.connected_room_y !== null && r.connected_room_y !== undefined ? r.connected_room_y : null,
                            connection_direction: r.connection_direction || null,
                            // Factory fields
                            factory_tier: r.factory_tier || null
                        }));
                    }
                    // Store room type colors from database
                    if (data.roomTypeColors) {
                        this.roomTypeColors = { ...ROOM_TYPE_COLORS, ...data.roomTypeColors };
                    }
                    
                    // Check if we have a pending room selection (from map transition)
                    if (this.pendingRoomSelection) {
                        const targetRoom = this.rooms.find(r => 
                            r.x === this.pendingRoomSelection.x && 
                            r.y === this.pendingRoomSelection.y
                        );
                        if (targetRoom) {
                            this.selectRoom(targetRoom);
                            this.centerOnRoom(targetRoom);
                        }
                        this.pendingRoomSelection = null;
                    } else {
                        // Center on player's current room if available (from data.currentRoom or playerCurrentLocation)
                        let roomToSelect = data.currentRoom;
                        if (!roomToSelect && this.playerCurrentLocation && this.playerCurrentLocation.room &&
                            this.currentMap && this.currentMap.id === this.playerCurrentLocation.mapId) {
                            roomToSelect = this.playerCurrentLocation.room;
                        }
                        if (roomToSelect) {
                            const currentRoom = this.rooms.find(r => r.id === roomToSelect.id);
                            if (currentRoom) {
                                this.centerOnRoom(currentRoom);
                                this.selectRoom(currentRoom);
                            }
                        }
                    }
                    this.loading = false;
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
                            // Map connection fields (use explicit null check to allow 0 as valid coordinate)
                            connected_map_id: r.connected_map_id || null,
                            connected_room_x: r.connected_room_x !== null && r.connected_room_x !== undefined ? r.connected_room_x : null,
                            connected_room_y: r.connected_room_y !== null && r.connected_room_y !== undefined ? r.connected_room_y : null,
                            connection_direction: r.connection_direction || null,
                            // Factory fields
                            factory_tier: r.factory_tier || null
                        }));
                    }
                    if (data.roomTypeColors) {
                        this.roomTypeColors = { ...ROOM_TYPE_COLORS, ...data.roomTypeColors };
                    }
                    // Center on player's current room if this is their map
                    if (this.playerCurrentLocation && this.playerCurrentLocation.room &&
                        this.currentMap && this.currentMap.id === this.playerCurrentLocation.mapId) {
                        const currentRoom = this.rooms.find(r => r.id === this.playerCurrentLocation.room.id);
                        if (currentRoom) {
                            this.centerOnRoom(currentRoom);
                            this.selectRoom(currentRoom);
                        }
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
                    
                case 'roomNPCsForEditor':
                    if (data.roomId && this.selectedRoom && this.selectedRoom.id === data.roomId) {
                        // Preserve the currently selected NPC ID BEFORE any updates
                        const currentSelection = this.newRoomNPCId ? String(this.newRoomNPCId) : '';
                        
                        this.roomNPCs = data.roomNPCs || [];
                        // Update available NPCs - keep IDs as numbers (they'll be converted to strings in the dropdown)
                        this.availableNPCs = data.allNPCs || [];
                        
                        // Only clear selection if it no longer exists in the new list
                        // Otherwise, preserve it so Alpine can maintain the dropdown binding
                        if (currentSelection && currentSelection !== '') {
                            const stillAvailable = this.availableNPCs.find(npc => String(npc.id) === currentSelection);
                            if (!stillAvailable) {
                                // Selection no longer available, clear it
                                this.newRoomNPCId = '';
                            }
                            // If still available, DON'T modify newRoomNPCId - let Alpine maintain the binding
                        }
                    }
                    this.loading = false;
                    break;
                    
                case 'npcPlacementAdded':
                    // Reload NPCs for the room after adding
                    if (this.selectedRoom && !this.selectedRoom.isNew) {
                        this.loadRoomNPCs(this.selectedRoom.id);
                    }
                    this.showNotification('NPC added to room', 'success');
                    break;
                    
                case 'mapExported':
                    // Download the exported map as JSON file
                    if (data.exportData) {
                        const jsonStr = JSON.stringify(data.exportData, null, 2);
                        const blob = new Blob([jsonStr], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `map-${data.mapId}-${data.exportData.map.name.replace(/\s+/g, '-')}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        this.showNotification('Map exported successfully', 'success');
                    }
                    break;
                    
                case 'mapImported':
                    // Reload maps and select the new map
                    this.showNotification(
                        `Map imported successfully! Created ${data.roomsCreated} rooms and ${data.connectionsCreated} connections.`,
                        'success'
                    );
                    if (data.warnings && data.warnings.length > 0) {
                        console.warn('Import warnings:', data.warnings);
                    }
                    this.showImportMapDialog = false;
                    this.importMapData = {
                        jsonData: '',
                        entranceRoom: { x: null, y: null },
                        connectionRoomId: '',
                        connectionDirection: '',
                        validationErrors: [],
                        validationWarnings: []
                    };
                    // Reload maps list and select the new map
                    this.loadMaps();
                    setTimeout(() => {
                        if (data.mapId) {
                            this.selectMap(data.mapId);
                        }
                    }, 500);
                    break;
                    
                case 'availableConnectionRooms':
                    // This can be for import dialog or room connection
                    // Use mapId from response to determine context
                    if (data.mapId && this.formData && this.formData.connected_map_id && 
                        parseInt(data.mapId) === parseInt(this.formData.connected_map_id)) {
                        // This is for the room connection form
                        this.connectionRooms = data.rooms || [];
                        
                        // If we have a pending connection target, try to find and select it
                        if (this.pendingConnectionTarget) {
                            const targetRoom = this.connectionRooms.find(r => 
                                r.x === this.pendingConnectionTarget.x && 
                                r.y === this.pendingConnectionTarget.y
                            );
                            if (targetRoom) {
                                this.formData.connected_room_id = targetRoom.id.toString();
                                // Preserve direction when loading existing connection
                                this.selectConnectionRoom(targetRoom.id.toString(), true);
                            }
                            this.pendingConnectionTarget = null;
                        }
                    } else {
                        // This is for the import dialog
                        this.availableConnectionRooms = data.rooms || [];
                    }
                    break;
                    
                case 'npcPlacementRemoved':
                    // Reload NPCs for the room after removing
                    if (this.selectedRoom && !this.selectedRoom.isNew) {
                        this.loadRoomNPCs(this.selectedRoom.id);
                    }
                    this.showNotification('NPC removed from room', 'success');
                    this.loading = false;
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
                        
                        // Show appropriate notification based on connection status
                        if (data.connectionWarning) {
                            this.showNotification(data.connectionWarning, 'warning');
                        } else if (data.bidirectionalCreated) {
                            this.showNotification('Room updated with bidirectional map connection', 'success');
                        } else {
                            this.showNotification('Room updated', 'success');
                        }
                        
                        // Reload map data to refresh connections and room data
                        // Preserve the selected room so it remains selected after reload
                        const selectedRoomId = this.selectedRoom?.id;
                        if (this.currentMap) {
                            this.selectMap(this.currentMap.id, selectedRoomId ? 
                                { x: this.selectedRoom.x, y: this.selectedRoom.y } : null);
                        }
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
        
        selectMap(mapId, targetRoomCoords = null) {
            this.currentMap = this.maps.find(m => m.id === parseInt(mapId));
            this.loading = true;
            this.selectedRoom = null;
            this.selectedRooms = [];
            this.resetRoomForm();
            
            // Store target room coordinates if provided (for map transitions)
            if (targetRoomCoords) {
                this.pendingRoomSelection = targetRoomCoords;
            } else {
                this.pendingRoomSelection = null;
            }
            
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
            // Load NPCs for the selected room if it's not a new room
            if (room && !room.isNew) {
                this.loadRoomNPCs(room.id);
            } else {
                this.roomNPCs = [];
            }
            this.render();
        },
        
        loadRoomNPCs(roomId) {
            if (!roomId) return;
            // Preserve the current NPC selection when reloading
            const currentSelection = this.newRoomNPCId;
            EditorBase.send({ type: 'getRoomNPCsForEditor', roomId: roomId });
            // Note: selection will be restored in roomNPCsForEditor handler if still valid
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
            // Update properties individually for better Alpine reactivity
            this.formData.name = room.name || '';
            this.formData.description = room.description || '';
            this.formData.room_type = room.room_type || 'normal';
            this.formData.factory_tier = room.factory_tier || 1;
            // Convert to string for Alpine.js select binding
            this.formData.connected_map_id = room.connected_map_id ? String(room.connected_map_id) : '';
            this.formData.connected_room_id = ''; // Will be set after loading connection rooms
            // Use explicit null/undefined check to allow 0 as valid coordinate
            this.formData.connected_room_x = room.connected_room_x !== null && room.connected_room_x !== undefined ? room.connected_room_x : '';
            this.formData.connected_room_y = room.connected_room_y !== null && room.connected_room_y !== undefined ? room.connected_room_y : '';
            this.formData.connection_direction = room.connection_direction || '';
            
            // Clear connection rooms - will be loaded if room has a connection
            this.connectionRooms = [];
            
            // If room has a connection, load the connection rooms for that map
            if (room.connected_map_id) {
                this.loadConnectionRoomsForMap(room.connected_map_id, room.connected_room_x, room.connected_room_y);
            }
        },
        
        resetRoomForm() {
            this.formData = {
                name: '',
                description: '',
                room_type: 'normal',
                factory_tier: 1,
                connected_map_id: '',
                connected_room_id: '',
                connected_room_x: '',
                connected_room_y: '',
                connection_direction: ''
            };
            this.roomNPCs = [];
            this.newRoomNPCId = '';
            this.connectionRooms = [];
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
            
            // Get coordinates from selected room if room ID is set
            let connectedRoomX = this.formData.connected_room_x;
            let connectedRoomY = this.formData.connected_room_y;
            
            if (this.formData.connected_room_id) {
                const selectedConnectionRoom = this.connectionRooms.find(r => r.id === parseInt(this.formData.connected_room_id));
                if (selectedConnectionRoom) {
                    connectedRoomX = selectedConnectionRoom.x;
                    connectedRoomY = selectedConnectionRoom.y;
                }
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'updateRoom',
                roomId: this.selectedRoom.id,
                name: this.formData.name.trim(),
                description: this.formData.description.trim(),
                room_type: this.formData.room_type,
                factory_tier: this.formData.room_type === 'factory' ? parseInt(this.formData.factory_tier) : null,
                // Map connection fields (matching database schema)
                // Use explicit null check to allow 0 as valid coordinate
                connected_map_id: this.formData.connected_map_id ? parseInt(this.formData.connected_map_id) : null,
                connected_room_x: connectedRoomX !== null && connectedRoomX !== undefined && connectedRoomX !== '' ? parseInt(connectedRoomX) : null,
                connected_room_y: connectedRoomY !== null && connectedRoomY !== undefined && connectedRoomY !== '' ? parseInt(connectedRoomY) : null,
                connection_direction: this.formData.connection_direction || null
            });
        },
        
        // ============================================
        // MAP CONNECTION HELPERS
        // ============================================
        
        loadConnectionRoomsForMap(mapId, targetX = null, targetY = null) {
            if (!mapId) {
                this.connectionRooms = [];
                this.formData.connected_room_id = '';
                return;
            }
            
            EditorBase.send({
                type: 'getAvailableConnectionRooms',
                mapId: parseInt(mapId)
            });
            
            // If we have target coordinates, try to find and select that room
            if (targetX !== null && targetY !== null) {
                // This will be handled in the message handler after rooms load
                this.pendingConnectionTarget = { x: targetX, y: targetY };
            }
        },
        
        selectConnectionRoom(roomId, preserveDirection = false) {
            if (!roomId) {
                this.formData.connected_room_x = '';
                this.formData.connected_room_y = '';
                this.formData.connection_direction = '';
                return;
            }
            
            const room = this.connectionRooms.find(r => r.id === parseInt(roomId));
            if (room) {
                this.formData.connected_room_x = room.x;
                this.formData.connected_room_y = room.y;
                // Only reset direction if not preserving (new selection vs loading existing)
                if (!preserveDirection) {
                    this.formData.connection_direction = '';
                }
            }
        },
        
        getAvailableDirectionsForConnectionRoom() {
            // Exit direction is based on the SOURCE room (currently selected room on current map)
            // We can only use directions where there is NO adjacent room on the current map
            if (!this.selectedRoom) return [];

            const currentX = this.selectedRoom.x;
            const currentY = this.selectedRoom.y;

            // Direction offsets: direction -> {dx, dy}
            const directionOffsets = {
                'N': { dx: 0, dy: -1 },
                'S': { dx: 0, dy: 1 },
                'E': { dx: 1, dy: 0 },
                'W': { dx: -1, dy: 0 },
                'NE': { dx: 1, dy: -1 },
                'NW': { dx: -1, dy: -1 },
                'SE': { dx: 1, dy: 1 },
                'SW': { dx: -1, dy: 1 }
            };

            let availableDirections = [];

            // Check each direction - only include if no room exists in that direction
            for (const [dir, offset] of Object.entries(directionOffsets)) {
                const adjacentX = currentX + offset.dx;
                const adjacentY = currentY + offset.dy;

                // Check if a room exists at the adjacent position on the current map
                const roomExists = this.rooms.some(r => r.x === adjacentX && r.y === adjacentY);

                if (!roomExists) {
                    availableDirections.push(dir);
                }
            }

            // If we have a current direction set (editing existing connection),
            // include it in the list even if it's occupied
            // (because this connection already uses that direction)
            if (this.formData.connection_direction && !availableDirections.includes(this.formData.connection_direction)) {
                availableDirections.push(this.formData.connection_direction);
            }

            // Sort directions consistently: N, S, E, W, then diagonals
            const order = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
            availableDirections.sort((a, b) => order.indexOf(a) - order.indexOf(b));

            return availableDirections;
        },
        
        getDirectionLabel(dir) {
            const labels = {
                'N': 'North',
                'S': 'South',
                'E': 'East',
                'W': 'West',
                'NE': 'Northeast',
                'NW': 'Northwest',
                'SE': 'Southeast',
                'SW': 'Southwest'
            };
            return labels[dir] || dir;
        },
        
        getOppositeDirection(dir) {
            const opposites = {
                'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
                'NE': 'SW', 'NW': 'SE', 'SE': 'NW', 'SW': 'NE'
            };
            return opposites[dir] || dir;
        },
        
        getOppositeDirectionLabel(dir) {
            return this.getDirectionLabel(this.getOppositeDirection(dir));
        },
        
        getSelectedConnectionRoom() {
            if (!this.formData.connected_room_id) return null;
            return this.connectionRooms.find(r => r.id === parseInt(this.formData.connected_room_id)) || null;
        },

        // Check if the target room has the opposite direction available
        // Returns true if the reverse connection can be created (no room exists in that direction on target map)
        isReverseConnectionValid() {
            if (!this.formData.connection_direction) return true;
            const targetRoom = this.getSelectedConnectionRoom();
            if (!targetRoom) return true;

            const oppositeDir = this.getOppositeDirection(this.formData.connection_direction);
            // Check if the target room has the opposite direction available
            return targetRoom.availableDirections && targetRoom.availableDirections.includes(oppositeDir);
        },

        getConnectionRoomName() {
            const room = this.getSelectedConnectionRoom();
            return room ? room.name : '';
        },

        getConnectionRoomCoords() {
            const room = this.getSelectedConnectionRoom();
            return room ? `(${room.x}, ${room.y})` : '';
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
        // NPC MANAGEMENT
        // ============================================
        
        addNPCToRoom() {
            // Validate inputs
            if (!this.selectedRoom || this.selectedRoom.isNew) {
                this.showNotification('Please select a room first', 'error');
                return;
            }
            
            // Check if NPC is selected
            const selectedId = this.newRoomNPCId;
            if (!selectedId || selectedId === '' || selectedId === null) {
                this.showNotification('Please select an NPC to add', 'error');
                return;
            }
            
            if (this.loading) {
                return; // Prevent double-clicks
            }
            
            const npcId = parseInt(String(selectedId));
            if (isNaN(npcId)) {
                this.showNotification('Invalid NPC selection', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'addNpcToRoom',
                npcId: npcId,
                roomId: this.selectedRoom.id,
                slot: 0
            });
            // Don't clear newRoomNPCId here - wait for successful response
        },
        
        removeNPCFromRoom(placementId, npcId) {
            if (!placementId || !this.selectedRoom || this.selectedRoom.isNew) {
                return;
            }
            
            if (!confirm('Remove this NPC from the room?')) {
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'removeNpcFromRoom',
                placementId: placementId,
                npcId: npcId
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
            
            // Draw info box background
            const infoLines = [
                `Zoom: ${(this.zoom * 100).toFixed(0)}%`,
                `Mode: ${this.editorMode}`,
                this.currentMap ? `Map: ${this.currentMap.name}` : 'Map: None'
            ];
            
            ctx.font = '12px Courier New';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Calculate box dimensions
            const padding = 8;
            const lineHeight = 15;
            const maxWidth = Math.max(...infoLines.map(line => ctx.measureText(line).width));
            const boxWidth = maxWidth + (padding * 2);
            const boxHeight = (infoLines.length * lineHeight) + (padding * 2);
            const boxX = 10;
            const boxY = 10;
            
            // Draw background box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            
            // Draw border
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 1;
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
            
            // Draw text
            ctx.fillStyle = '#00ff00';
            infoLines.forEach((line, index) => {
                ctx.fillText(line, boxX + padding, boxY + padding + (index * lineHeight));
            });
        },

        // ============================================
        // CANVAS EVENT HANDLERS
        // ============================================
        
        handleCanvasClick(e) {
            // Ignore middle mouse button clicks (used for panning)
            if (e.button === 1) {
                return;
            }
            
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
            if (this.isPanning && (e.buttons & 4) === 4) {
                // Middle mouse button (button 4) is still held down
                const rect = this.canvas.getBoundingClientRect();
                const currentX = e.clientX - rect.left;
                const currentY = e.clientY - rect.top;
                
                // Calculate pixel delta
                const deltaX = currentX - this.panStartX;
                const deltaY = currentY - this.panStartY;
                
                // Convert pixel movement to map coordinate movement
                // Need to account for zoom level
                const width = this.canvas.width;
                const height = this.canvas.height;
                const gridWidth = GRID_SIZE * CELL_SIZE;
                const gridHeight = GRID_SIZE * CELL_SIZE;
                const baseScale = Math.min(width / gridWidth, height / gridHeight, 1);
                const scaledCellSize = CELL_SIZE * baseScale * this.zoom;
                
                // Convert pixel delta to map coordinate delta
                // Negative deltaX means dragging right (pan left in map coords)
                // Positive deltaY means dragging down (pan down in map coords)
                const mapDeltaX = -deltaX / scaledCellSize;
                const mapDeltaY = deltaY / scaledCellSize;
                
                // Update pan position
                this.panX = this.panStartPanX + mapDeltaX;
                this.panY = this.panStartPanY + mapDeltaY;
                
                this.render();
            }
        },
        
        handleCanvasMouseDown(e) {
            // Check for middle mouse button (button 1 = left, 2 = right, 4 = middle)
            if (e.button === 1) {
                e.preventDefault(); // Prevent default middle-click behavior (scroll)
                this.isPanning = true;
                const rect = this.canvas.getBoundingClientRect();
                this.panStartX = e.clientX - rect.left;
                this.panStartY = e.clientY - rect.top;
                this.panStartPanX = this.panX;
                this.panStartPanY = this.panY;
                
                // Change cursor to indicate panning
                this.canvas.style.cursor = 'grabbing';
            }
        },
        
        handleCanvasMouseUp(e) {
            if (e.button === 1) {
                this.isPanning = false;
                this.canvas.style.cursor = 'default';
            }
        },
        
        handleCanvasMouseLeave(e) {
            // Stop panning if mouse leaves canvas
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = 'default';
            }
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
            
            // Numpad navigation: works when a room is selected (any mode)
            if (e.code?.startsWith('Numpad') && this.selectedRoom && !this.selectedRoom.isNew) {
                e.preventDefault();
                e.stopPropagation(); // Prevent event from bubbling to other handlers
                
                // Map numpad keys to directions
                const numpadToDirection = {
                    'Numpad7': 'NW',
                    'Numpad8': 'N',
                    'Numpad9': 'NE',
                    'Numpad4': 'W',
                    'Numpad6': 'E',
                    'Numpad1': 'SW',
                    'Numpad2': 'S',
                    'Numpad3': 'SE',
                    'Numpad5': null // No direction
                };
                
                const direction = numpadToDirection[e.code];
                if (!direction) {
                    // Numpad5 - just refresh
                    this.render();
                    return;
                }
                
                // Check if current room has a map connection in this direction
                if (this.selectedRoom.connected_map_id && 
                    this.selectedRoom.connection_direction === direction) {
                    // This is a map transition - switch to the connected map
                    const targetMapId = this.selectedRoom.connected_map_id;
                    const targetX = this.selectedRoom.connected_room_x;
                    const targetY = this.selectedRoom.connected_room_y;
                    
                    // Switch to the connected map with target room coordinates
                    this.selectMap(targetMapId, { x: targetX, y: targetY });
                    return;
                }
                
                // Normal same-map navigation
                // Get current room position
                const currentX = this.selectedRoom.x;
                const currentY = this.selectedRoom.y;
                let newX = currentX;
                let newY = currentY;
                
                // Calculate new position based on numpad direction
                switch (e.code) {
                    case 'Numpad4': // West
                        newX = currentX - 1;
                        break;
                    case 'Numpad6': // East
                        newX = currentX + 1;
                        break;
                    case 'Numpad8': // North
                        newY = currentY + 1;
                        break;
                    case 'Numpad2': // South
                        newY = currentY - 1;
                        break;
                    case 'Numpad7': // Northwest
                        newX = currentX - 1;
                        newY = currentY + 1;
                        break;
                    case 'Numpad9': // Northeast
                        newX = currentX + 1;
                        newY = currentY + 1;
                        break;
                    case 'Numpad1': // Southwest
                        newX = currentX - 1;
                        newY = currentY - 1;
                        break;
                    case 'Numpad3': // Southeast
                        newX = currentX + 1;
                        newY = currentY - 1;
                        break;
                    default:
                        return;
                }
                
                // Check if room exists at new position
                const existingRoom = this.rooms.find(r => r.x === newX && r.y === newY);
                if (existingRoom) {
                    // Room exists - navigate to it
                    this.selectRoom(existingRoom);
                    this.centerOnRoom(existingRoom);
                } else if (this.editorMode === 'create') {
                    // No room exists and we're in create mode - create new room
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
                } else {
                    // Room doesn't exist and not in create mode - just show notification
                    this.showNotification(`No room at (${newX}, ${newY})`, 'info');
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
        // MAP IMPORT/EXPORT
        // ============================================
        
        exportMap() {
            if (!this.currentMap) {
                this.showNotification('No map selected', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'exportMap',
                mapId: this.currentMap.id
            });
        },
        
        async validateImportMap() {
            if (!this.importMapData.jsonData) {
                this.showNotification('Please paste map JSON data', 'error');
                return;
            }
            
            try {
                // Parse JSON to validate structure
                const parsed = JSON.parse(this.importMapData.jsonData);
                
                // Send validation request (we'll need to add a validate endpoint or use import with dry-run)
                // For now, we'll do basic client-side validation
                this.importMapData.validationErrors = [];
                this.importMapData.validationWarnings = [];
                
                if (!parsed.format_version) {
                    this.importMapData.validationErrors.push('Missing format_version field');
                }
                if (!parsed.map) {
                    this.importMapData.validationErrors.push('Missing map field');
                } else {
                    if (!parsed.map.name) {
                        this.importMapData.validationErrors.push('Map name is required');
                    }
                }
                if (!Array.isArray(parsed.rooms)) {
                    this.importMapData.validationErrors.push('Rooms must be an array');
                }
                
                if (this.importMapData.validationErrors.length === 0) {
                    this.showNotification('Basic validation passed. Import will perform full validation.', 'success');
                } else {
                    this.showNotification('Validation found errors', 'error');
                }
            } catch (e) {
                this.importMapData.validationErrors = ['Invalid JSON: ' + e.message];
                this.showNotification('Invalid JSON format', 'error');
            }
        },
        
        loadAvailableConnectionRooms() {
            if (!this.currentMap) return;
            EditorBase.send({
                type: 'getAvailableConnectionRooms',
                mapId: this.currentMap.id
            });
        },
        
        openImportDialog() {
            this.showImportMapDialog = true;
            // Reset connection map selection
            this.importMapData.connectionMapId = '';
            this.availableConnectionRooms = [];
        },
        
        loadImportConnectionRooms(mapId) {
            if (!mapId) {
                this.availableConnectionRooms = [];
                this.importMapData.connectionRoomId = '';
                return;
            }
            
            EditorBase.send({
                type: 'getAvailableConnectionRooms',
                mapId: parseInt(mapId)
            });
        },
        
        selectImportConnectionRoom(roomId) {
            if (!roomId) {
                this.importMapData.connectionDirection = '';
                return;
            }
            
            // Reset direction to allow user to select from available
            this.importMapData.connectionDirection = '';
        },
        
        getImportAvailableDirections() {
            if (!this.importMapData.connectionRoomId) return [];
            
            const room = this.availableConnectionRooms.find(r => r.id === parseInt(this.importMapData.connectionRoomId));
            if (!room) return [];
            
            return room.availableDirections || [];
        },
        
        getImportConnectionRoomName() {
            if (!this.importMapData.connectionRoomId) return '';
            const room = this.availableConnectionRooms.find(r => r.id === parseInt(this.importMapData.connectionRoomId));
            return room ? room.name : '';
        },
        
        getImportConnectionRoomCoords() {
            if (!this.importMapData.connectionRoomId) return '';
            const room = this.availableConnectionRooms.find(r => r.id === parseInt(this.importMapData.connectionRoomId));
            return room ? `(${room.x}, ${room.y})` : '';
        },
        
        closeImportDialog() {
            this.showImportMapDialog = false;
            // Reset import data
            this.importMapData = {
                jsonData: '',
                entranceRoom: { x: null, y: null },
                connectionMapId: '',
                connectionRoomId: '',
                connectionDirection: '',
                validationErrors: [],
                validationWarnings: []
            };
            this.availableConnectionRooms = [];
        },
        
        importMap() {
            if (!this.importMapData.jsonData) {
                this.showNotification('Please paste map JSON data', 'error');
                return;
            }
            
            try {
                // Parse JSON to ensure it's valid
                const parsed = JSON.parse(this.importMapData.jsonData);
                
                // Build import request
                const importRequest = {
                    type: 'importMap',
                    importData: parsed
                };
                
                // Add entrance room if specified
                if (this.importMapData.entranceRoom.x !== null && 
                    this.importMapData.entranceRoom.x !== undefined &&
                    this.importMapData.entranceRoom.y !== null && 
                    this.importMapData.entranceRoom.y !== undefined) {
                    importRequest.entranceRoom = {
                        x: parseInt(this.importMapData.entranceRoom.x),
                        y: parseInt(this.importMapData.entranceRoom.y)
                    };
                }
                
                // Add connection if specified
                if (this.importMapData.connectionMapId && this.importMapData.connectionRoomId && this.importMapData.connectionDirection) {
                    importRequest.connectionRoomId = parseInt(this.importMapData.connectionRoomId);
                    importRequest.connectionDirection = this.importMapData.connectionDirection;
                }
                
                this.loading = true;
                EditorBase.send(importRequest);
            } catch (e) {
                this.showNotification('Invalid JSON format: ' + e.message, 'error');
                this.loading = false;
            }
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
        },
        
        // Computed property for button disabled state
        isAddNPCButtonDisabled() {
            const hasNPC = this.newRoomNPCId && this.newRoomNPCId !== '';
            const hasRoom = this.selectedRoom && !this.selectedRoom.isNew;
            return !hasNPC || !hasRoom || this.loading;
        }
    };
};
