/**
 * MapWidget Component
 * 
 * Handles map canvas rendering and room visualization.
 * Includes pathing mode for creating paths/loops.
 */

import Component from '../core/Component.js';
import MapRenderer from '../utils/MapRenderer.js';

export default class MapWidget extends Component {
    constructor(game) {
        super(game);
        this.mapCanvas = null;
        this.mapCtx = null;
        this.mapRenderer = null;
        this.mapRooms = [];
        this.currentRoom = null;
        this.currentMapId = null;
        this.roomTypeColors = {};
        
        // Pathing mode state
        this.pathingModeActive = false;
        this.pathStartRoom = null;
        this.pathingCursorRoom = null;
        this.currentPath = [];
        
        // Viewport size (20x20 grid)
        this.VIEWPORT_SIZE = 20;
    }
    
    init() {
        super.init();
        
        this.mapCanvas = document.getElementById('mapCanvas');
        if (this.mapCanvas) {
            this.mapCtx = this.mapCanvas.getContext('2d');
            this.setupCanvas();
        }
        
        // Initialize pathing mode handlers
        this.initPathingModeHandlers();
        
        // Subscribe to map events
        this.subscribe('map:data', (data) => this.handleMapData(data));
        this.subscribe('map:update', (data) => this.handleMapUpdate(data));
        this.subscribe('room:update', (data) => {
            if (data.room) {
                this.currentRoom = data.room;
                this.render();
            }
        });
        
        // Subscribe to pathing mode messages
        this.subscribe('pathing:modeStarted', () => {
            // Pathing mode started
        });
        this.subscribe('pathing:room', (data) => {
            this.handlePathingRoom(data);
        });
        this.subscribe('pathing:saved', (data) => {
            this.handlePathSaved(data);
        });
    }
    
    /**
     * Initialize pathing mode button handlers
     */
    initPathingModeHandlers() {
        const createPathBtn = document.getElementById('createPathBtn');
        const exitPathingBtn = document.getElementById('exitPathingBtn');
        const endPathBtn = document.getElementById('endPathBtn');
        
        if (createPathBtn) {
            createPathBtn.addEventListener('click', () => this.enterPathingMode());
        }
        if (exitPathingBtn) {
            exitPathingBtn.addEventListener('click', () => this.exitPathingMode());
        }
        if (endPathBtn) {
            endPathBtn.addEventListener('click', () => this.endPath());
        }
        
        // Canvas click handler will be set up after canvas is initialized
        
        // Handle path name modal
        const savePathBtn = document.getElementById('savePathBtn');
        const cancelPathNameBtn = document.getElementById('cancelPathNameBtn');
        const closePathNameModal = document.getElementById('closePathNameModal');
        
        if (savePathBtn) {
            savePathBtn.addEventListener('click', () => {
                const input = document.getElementById('pathNameInput');
                const pathData = window.pendingPathData;
                if (input && pathData) {
                    this.savePath(input.value.trim(), pathData.pathType);
                }
            });
        }
        if (cancelPathNameBtn) {
            cancelPathNameBtn.addEventListener('click', () => {
                this.hidePathNameModal();
            });
        }
        if (closePathNameModal) {
            closePathNameModal.addEventListener('click', () => {
                this.hidePathNameModal();
            });
        }
    }
    
    /**
     * Setup canvas
     */
    setupCanvas() {
        if (!this.mapCanvas) return;
        
        const viewport = this.mapCanvas.parentElement;
        if (viewport) {
            const resizeObserver = new ResizeObserver(() => {
                this.mapCanvas.width = viewport.clientWidth;
                this.mapCanvas.height = viewport.clientHeight;
                if (this.mapRenderer) {
                    this.mapRenderer.canvas = this.mapCanvas;
                    this.mapRenderer.ctx = this.mapCtx;
                }
                this.render();
            });
            resizeObserver.observe(viewport);
            
            // Initial size
            this.mapCanvas.width = viewport.clientWidth;
            this.mapCanvas.height = viewport.clientHeight;
        }
        
        // Initialize MapRenderer
        this.mapRenderer = new MapRenderer({
            canvas: this.mapCanvas,
            ctx: this.mapCtx,
            cellSize: 10,
            gridSize: this.VIEWPORT_SIZE, // Fixed 20x20 grid
            zoom: 1.0,
            panX: 0,
            panY: 0,
            minCellSize: 8,
            maxCellSize: null,
            shouldDrawConnections: true,
            getRoomColor: (room) => this.getRoomColor(room),
            getRoomBorder: (room) => this.getRoomBorder(room)
        });
        
        // Add click handler to canvas for pathing mode
        this.mapCanvas.addEventListener('click', (e) => {
            if (this.pathingModeActive) {
                this.handlePathingModeClick(e);
            }
        });
        
        // Add mouse wheel handler for zoom
        this.mapCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const currentZoom = this.mapRenderer.zoom;
            if (e.deltaY < 0) {
                // Zoom in
                this.mapRenderer.setZoom(currentZoom + zoomSpeed);
            } else {
                // Zoom out
                this.mapRenderer.setZoom(currentZoom - zoomSpeed);
            }
            this.render();
        });
        
        // Setup keyboard handlers
        this.setupKeyboardHandlers();
    }
    
    /**
     * Setup keyboard handlers for zoom, pan, and pathing mode
     */
    setupKeyboardHandlers() {
        // Store reference to handler so we can remove it later
        this.keyboardHandler = (e) => {
            // Check if map widget is visible
            const mapWidget = document.getElementById('widget-map');
            if (!mapWidget || mapWidget.classList.contains('hidden')) {
                return;
            }
            
            // Check if command input has focus (don't intercept if typing)
            const commandInput = document.getElementById('commandInput');
            if (commandInput && document.activeElement === commandInput) {
                return;
            }
            
            // Arrow keys for panning
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
                e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                this.handlePan(e.key);
                return;
            }
            
            // Number keys for pathing mode
            if (this.pathingModeActive && e.key >= '1' && e.key <= '9') {
                // Check if numpad or regular number key
                if (e.location === 3 || e.code.startsWith('Numpad') || 
                    (e.key >= '1' && e.key <= '9' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
                    e.preventDefault();
                    this.handlePathingModeKeypad(e.key);
                    return;
                }
            }
        };
        
        document.addEventListener('keydown', this.keyboardHandler);
    }
    
    /**
     * Handle panning with arrow keys
     */
    handlePan(direction) {
        if (!this.mapRenderer) return;
        
        const panAmount = 5; // Pan by 5 squares
        const currentPanX = this.mapRenderer.panX;
        const currentPanY = this.mapRenderer.panY;
        
        switch (direction) {
            case 'ArrowUp':
                this.mapRenderer.setPan(currentPanX, currentPanY + panAmount);
                break;
            case 'ArrowDown':
                this.mapRenderer.setPan(currentPanX, currentPanY - panAmount);
                break;
            case 'ArrowLeft':
                this.mapRenderer.setPan(currentPanX - panAmount, currentPanY);
                break;
            case 'ArrowRight':
                this.mapRenderer.setPan(currentPanX + panAmount, currentPanY);
                break;
        }
        
        this.render();
    }
    
    /**
     * Handle pathing mode keypad input
     */
    handlePathingModeKeypad(key) {
        if (!this.pathingModeActive || !this.pathingCursorRoom) return;
        
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
            return;
        }
        
        const targetX = this.pathingCursorRoom.x + dir.dx;
        const targetY = this.pathingCursorRoom.y + dir.dy;
        
        // Find room at target position
        const searchMapId = this.pathingCursorRoom && this.pathingCursorRoom.mapId ? this.pathingCursorRoom.mapId : this.currentMapId;
        let targetRoom = this.mapRooms.find(r => 
            r.mapId === searchMapId && 
            r.x === targetX && 
            r.y === targetY
        );
        
        // If not found in current map, check if current room has a connection in this direction
        if (!targetRoom && this.pathingCursorRoom) {
            const currentRoom = this.mapRooms.find(r => r.id === this.pathingCursorRoom.id);
            if (currentRoom && currentRoom.connected_map_id && 
                currentRoom.connection_direction) {
                const connectionDir = currentRoom.connection_direction.toUpperCase();
                const moveDir = dir.dir.toUpperCase();
                if (connectionDir === moveDir) {
                    // This is a map connection - request the connected room from server
                    this.send({
                        type: 'getPathingRoom',
                        mapId: currentRoom.connected_map_id,
                        x: currentRoom.connected_room_x,
                        y: currentRoom.connected_room_y,
                        direction: dir.dir
                    });
                    return;
                }
            }
        }
        
        if (!targetRoom) {
            return;
        }
        
        // If going back to previous room, remove the last step (undo)
        const isPreviousRoom = this.currentPath.length > 0 && 
                              this.currentPath[this.currentPath.length - 1].roomId === targetRoom.id;
        
        if (isPreviousRoom && this.currentPath.length > 1) {
            this.currentPath.pop();
            // Update cursor to previous room
            if (this.currentPath.length > 0) {
                const prevStep = this.currentPath[this.currentPath.length - 1];
                this.pathingCursorRoom = this.mapRooms.find(r => r.id === prevStep.roomId);
                if (!this.pathingCursorRoom) {
                    this.pathingCursorRoom = {
                        id: prevStep.roomId,
                        name: prevStep.roomName,
                        x: prevStep.x,
                        y: prevStep.y,
                        mapId: prevStep.mapId
                    };
                }
            }
            this.updatePathStepCounter();
            this.render();
            return;
        }
        
        // Add step to path
        this.addPathStep(targetRoom, dir.dir);
    }
    
    /**
     * Handle map data
     */
    handleMapData(data) {
        // In pathing mode, merge rooms instead of replacing (for cross-map pathing)
        if (this.pathingModeActive) {
            const newRooms = data.rooms || [];
            newRooms.forEach(newRoom => {
                const exists = this.mapRooms.some(r => r.id === newRoom.id);
                if (!exists) {
                    this.mapRooms.push(newRoom);
                }
            });
        } else {
            this.mapRooms = data.rooms || [];
        }
        
        this.currentMapId = data.mapId;
        this.currentRoom = data.currentRoom;
        this.roomTypeColors = data.roomTypeColors || {};
        
        // If there's a pending pathing step, add it now
        if (window.pendingPathingStep) {
            const step = window.pendingPathingStep;
            window.pendingPathingStep = null;
            this.addPathStep(step.room, step.direction);
        }
        
        this.render();
    }
    
    /**
     * Handle map update
     */
    handleMapUpdate(data) {
        if (data.currentRoom) {
            this.currentRoom = data.currentRoom;
        }
        if (data.mapId) {
            this.currentMapId = data.mapId;
        }
        this.render();
    }
    
    /**
     * Get room color callback for MapRenderer
     */
    getRoomColor(room) {
        // Check for map connection first (should be white)
        const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
        if (hasConnection) {
            // In pathing mode, still check for path highlighting
            if (this.pathingModeActive) {
                const isInPath = this.currentPath.some(step => step.roomId === room.id);
                const isPathingCursor = this.pathingCursorRoom && room.id === this.pathingCursorRoom.id;
                const isPathStart = this.pathStartRoom && room.id === this.pathStartRoom.id;
                
                if (isPathingCursor) {
                    return '#00ff00'; // Green for cursor (overrides connection color)
                } else if (isPathStart) {
                    return '#0088ff'; // Blue for start (overrides connection color)
                } else if (isInPath) {
                    return '#ff8800'; // Orange for path rooms (overrides connection color)
                }
            }
            return '#ffffff'; // White for rooms with connections
        }
        
        const roomType = room.roomType || 'normal';
        let fillColor = this.roomTypeColors[roomType] || '#666';
        
        // In pathing mode, highlight path rooms
        if (this.pathingModeActive) {
            const isInPath = this.currentPath.some(step => step.roomId === room.id);
            const isPathingCursor = this.pathingCursorRoom && room.id === this.pathingCursorRoom.id;
            const isPathStart = this.pathStartRoom && room.id === this.pathStartRoom.id;
            
            if (isPathingCursor) {
                fillColor = '#00ff00'; // Green for cursor
            } else if (isPathStart) {
                fillColor = '#0088ff'; // Blue for start
            } else if (isInPath) {
                fillColor = '#ff8800'; // Orange for path rooms
            }
        }
        
        return fillColor;
    }
    
    /**
     * Get room border callback for MapRenderer
     */
    getRoomBorder(room) {
        // Check for map connection first
        const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
        
        // In pathing mode, highlight path rooms (overrides connection border)
        if (this.pathingModeActive) {
            const isPathingCursor = this.pathingCursorRoom && room.id === this.pathingCursorRoom.id;
            const isPathStart = this.pathStartRoom && room.id === this.pathStartRoom.id;
            const isInPath = this.currentPath.some(step => step.roomId === room.id);
            
            if (isPathingCursor) {
                return { color: '#ffff00', width: 2 }; // Yellow border
            } else if (isPathStart) {
                return { color: '#00ffff', width: 2 }; // Cyan border
            } else if (isInPath) {
                return { color: '#ffaa00', width: 1 };
            }
        }
        
        // Check for current room (if not in pathing mode)
        if (!this.pathingModeActive && this.currentRoom && room.id === this.currentRoom.id) {
            return { color: '#ffff00', width: 2 }; // Yellow border for current room
        }
        
        // Connection rooms get light grey border
        if (hasConnection) {
            return { color: '#cccccc', width: 1 }; // Light grey border for connected rooms
        }
        
        // Default border
        const roomType = room.roomType || 'normal';
        const baseColor = this.roomTypeColors[roomType] || '#666';
        const borderColor = this.darkenColor(baseColor, 0.5);
        return { color: borderColor, width: 1 };
    }
    
    /**
     * Render map using shared MapRenderer
     */
    render() {
        if (!this.mapRenderer || !this.mapCanvas || !this.mapCtx) return;
        if (this.mapRooms.length === 0 || !this.currentRoom) {
            // Clear canvas if no rooms
            this.mapCtx.fillStyle = '#000';
            this.mapCtx.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);
            return;
        }
        
        // In pathing mode, center on pathing cursor instead of actual player position
        const centerRoom = this.pathingModeActive && this.pathingCursorRoom ? this.pathingCursorRoom : this.currentRoom;
        
        // In pathing mode, use the pathing cursor's map, otherwise use current map
        const renderMapId = this.pathingModeActive && this.pathingCursorRoom ? this.pathingCursorRoom.mapId : this.currentMapId;
        
        // Filter to only rooms from the map we're rendering
        const currentMapRooms = this.mapRooms.filter(room => room.mapId === renderMapId);
        
        // Render using MapRenderer
        this.mapRenderer.render(currentMapRooms, centerRoom);
        
        // Draw path lines in pathing mode (overlay on top)
        if (this.pathingModeActive && this.currentPath.length > 1 && this.mapRenderer.renderedBounds) {
            const { minX, maxX, minY, maxY, cellSize, offsetX, offsetY } = this.mapRenderer.renderedBounds;
            const ctx = this.mapCtx;
            
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < this.currentPath.length - 1; i++) {
                const step1 = this.currentPath[i];
                const step2 = this.currentPath[i + 1];
                
                // Only draw if both rooms are in viewport
                if (step1.x >= minX && step1.x <= maxX &&
                    step1.y >= minY && step1.y <= maxY &&
                    step2.x >= minX && step2.x <= maxX &&
                    step2.y >= minY && step2.y <= maxY) {
                    
                    const screen1 = this.mapRenderer.mapToScreen(step1.x, step1.y);
                    const screen2 = this.mapRenderer.mapToScreen(step2.x, step2.y);
                    
                    if (screen1 && screen2) {
                        const x1 = screen1.x + cellSize / 2;
                        const y1 = screen1.y + cellSize / 2;
                        const x2 = screen2.x + cellSize / 2;
                        const y2 = screen2.y + cellSize / 2;
                        
                        if (i === 0) {
                            ctx.moveTo(x1, y1);
                        }
                        ctx.lineTo(x2, y2);
                    }
                }
            }
            ctx.stroke();
        }
    }
    
    /**
     * Darken a hex color
     */
    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.floor((num >> 16) * (1 - percent));
        const g = Math.floor(((num >> 8) & 0x00FF) * (1 - percent));
        const b = Math.floor((num & 0x0000FF) * (1 - percent));
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    
    /**
     * Get room at screen position (for pathing mode clicks)
     */
    getRoomAtScreenPosition(screenX, screenY) {
        if (!this.mapRenderer || this.mapRooms.length === 0 || !this.currentRoom) return null;
        
        // In pathing mode, use the pathing cursor's map, otherwise use current map
        const renderMapId = this.pathingModeActive && this.pathingCursorRoom ? this.pathingCursorRoom.mapId : this.currentMapId;
        
        // Filter to only rooms from the map we're rendering
        const currentMapRooms = this.mapRooms.filter(room => room.mapId === renderMapId);
        
        // Use MapRenderer to get room at position
        return this.mapRenderer.getRoomAtPosition(screenX, screenY, currentMapRooms);
    }
    
    /**
     * Enter pathing mode
     */
    enterPathingMode() {
        const ws = this.game?.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        this.pathingModeActive = true;
        
        // Request fresh map data
        this.send({ type: 'getMapData', mapId: this.currentMapId });
        
        // Get current room info
        const currentRoom = this.mapRooms.find(r => 
            r.mapId === this.currentMapId && 
            r.x === this.currentRoom.x && 
            r.y === this.currentRoom.y
        );
        
        if (!currentRoom) {
            console.error('Current room not found for pathing mode');
            return;
        }
        
        // Initialize path with current room as first step
        this.pathStartRoom = {
            id: currentRoom.id,
            name: currentRoom.name,
            x: currentRoom.x,
            y: currentRoom.y,
            mapId: currentRoom.mapId
        };
        
        this.pathingCursorRoom = { ...this.pathStartRoom };
        this.currentPath = [{
            roomId: this.pathStartRoom.id,
            roomName: this.pathStartRoom.name,
            x: this.pathStartRoom.x,
            y: this.pathStartRoom.y,
            direction: null,
            stepIndex: 0
        }];
        
        // Update UI
        const createPathBtn = document.getElementById('createPathBtn');
        const exitPathingBtn = document.getElementById('exitPathingBtn');
        const endPathBtn = document.getElementById('endPathBtn');
        const pathingIndicator = document.getElementById('pathingModeIndicator');
        
        if (createPathBtn) createPathBtn.style.display = 'none';
        if (exitPathingBtn) exitPathingBtn.style.display = 'inline-block';
        if (endPathBtn) endPathBtn.style.display = 'inline-block';
        if (pathingIndicator) pathingIndicator.style.display = 'flex';
        
        this.updatePathStepCounter();
        
        // Request pathing mode start from server
        this.send({ type: 'startPathingMode' });
        
        // Re-render map
        this.render();
    }
    
    /**
     * Exit pathing mode
     */
    exitPathingMode() {
        this.pathingModeActive = false;
        this.currentPath = [];
        this.pathStartRoom = null;
        this.pathingCursorRoom = null;
        
        // Update UI
        const createPathBtn = document.getElementById('createPathBtn');
        const exitPathingBtn = document.getElementById('exitPathingBtn');
        const endPathBtn = document.getElementById('endPathBtn');
        const pathingIndicator = document.getElementById('pathingModeIndicator');
        
        if (createPathBtn) createPathBtn.style.display = 'inline-block';
        if (exitPathingBtn) exitPathingBtn.style.display = 'none';
        if (endPathBtn) endPathBtn.style.display = 'none';
        if (pathingIndicator) pathingIndicator.style.display = 'none';
        
        // Cancel on server
        this.send({ type: 'cancelPathing' });
        
        // Re-render map
        this.render();
    }
    
    /**
     * Add path step
     */
    addPathStep(room, direction) {
        const roomExists = this.mapRooms.some(r => 
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
            mapId: room.mapId || this.currentMapId,
            direction: direction,
            stepIndex: this.currentPath.length
        };
        
        this.currentPath.push(step);
        this.pathingCursorRoom = { 
            id: room.id,
            name: room.name,
            x: room.x,
            y: room.y,
            mapId: room.mapId || (this.pathingCursorRoom && this.pathingCursorRoom.mapId) || this.currentMapId
        };
        
        this.updatePathStepCounter();
        this.render();
    }
    
    /**
     * Update path step counter
     */
    updatePathStepCounter() {
        const counter = document.getElementById('pathStepCounter');
        const messageSpan = document.getElementById('pathingModeMessage');
        
        if (counter) {
            counter.textContent = `Steps: ${this.currentPath.length}`;
        }
        
        if (messageSpan) {
            if (this.currentPath.length > 1 && this.pathingCursorRoom) {
                messageSpan.textContent = `${this.pathingCursorRoom.name} (${this.pathingCursorRoom.x}, ${this.pathingCursorRoom.y})`;
            } else {
                messageSpan.textContent = 'Pathing Mode Active - Click rooms to build path';
            }
        }
    }
    
    /**
     * Handle pathing mode click
     */
    handlePathingModeClick(event) {
        if (!this.pathingModeActive || !this.mapCanvas || !this.pathingCursorRoom) return;
        
        const rect = this.mapCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Get room at click position
        let room = this.getRoomAtScreenPosition(x, y);
        
        if (!room) return;
        
        // Check if room is on a different map - if so, check if it's a valid connection
        if (room.mapId !== this.pathingCursorRoom.mapId) {
            const currentRoom = this.mapRooms.find(r => r.id === this.pathingCursorRoom.id);
            if (currentRoom && currentRoom.connected_map_id === room.mapId &&
                currentRoom.connected_room_x === room.x &&
                currentRoom.connected_room_y === room.y) {
                // This is a valid map connection - allow it
                const direction = currentRoom.connection_direction || 'CONNECTION';
                this.addPathStep(room, direction);
                return;
            } else {
                // Room is on different map but not a valid connection
                return;
            }
        }
        
        // Check if room is adjacent to current cursor position
        const dx = room.x - this.pathingCursorRoom.x;
        const dy = room.y - this.pathingCursorRoom.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        
        // Allow adjacent rooms (cardinal or diagonal)
        if (absDx > 1 || absDy > 1 || (absDx === 0 && absDy === 0)) {
            return;
        }
        
        // If going back to previous room, remove the last step (undo)
        const isPreviousRoom = this.currentPath.length > 0 && 
                              this.currentPath[this.currentPath.length - 1].roomId === room.id;
        
        if (isPreviousRoom && this.currentPath.length > 1) {
            this.currentPath.pop();
            // Update cursor to previous room
            if (this.currentPath.length > 0) {
                const prevStep = this.currentPath[this.currentPath.length - 1];
                this.pathingCursorRoom = this.mapRooms.find(r => r.id === prevStep.roomId);
                if (!this.pathingCursorRoom) {
                    this.pathingCursorRoom = {
                        id: prevStep.roomId,
                        name: prevStep.roomName,
                        x: prevStep.x,
                        y: prevStep.y,
                        mapId: prevStep.mapId
                    };
                }
            }
            this.updatePathStepCounter();
            this.render();
            return;
        }
        
        // Calculate direction
        let direction = '';
        if (dy < 0) direction = 'N';
        if (dy > 0) direction = 'S';
        if (dx > 0) direction += 'E';
        if (dx < 0) direction += 'W';
        
        this.addPathStep(room, direction);
    }
    
    /**
     * End path and show save dialog
     */
    endPath() {
        if (!this.pathingModeActive || this.currentPath.length === 0) return;
        
        // Check if it's a loop (ends at start room)
        const isLoop = this.pathingCursorRoom.id === this.pathStartRoom.id;
        const pathType = isLoop ? 'loop' : 'path';
        
        // Generate suggested name
        let suggestedName = '';
        if (isLoop) {
            suggestedName = `Loop: ${this.pathStartRoom.name} to ${this.pathStartRoom.name}`;
        } else {
            suggestedName = `Path: ${this.pathStartRoom.name} to ${this.pathingCursorRoom.name}`;
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
    
    /**
     * Save path
     */
    savePath(name, pathType) {
        if (!name || name.trim() === '') {
            this.emit('terminal:error', { message: 'Please enter a path name.' });
            return;
        }
        
        if (!this.currentPath || this.currentPath.length === 0) return;
        
        // Convert path steps to format expected by server
        const validSteps = this.currentPath
            .filter(step => step.direction && step.direction.trim() !== '')
            .map(step => ({
                roomId: step.roomId,
                direction: step.direction
            }));
        
        if (validSteps.length === 0) {
            this.emit('terminal:error', { message: 'Cannot save path: No valid steps with directions found.' });
            return;
        }
        
        this.send({
            type: 'savePath',
            name: name,
            pathType: pathType,
            mapId: this.currentMapId,
            originRoomId: this.pathStartRoom.id,
            steps: validSteps
        });
        
        this.hidePathNameModal();
    }
    
    /**
     * Hide path name modal
     */
    hidePathNameModal() {
        const modal = document.getElementById('pathNameModal');
        if (modal) {
            modal.style.display = 'none';
        }
        window.pendingPathData = null;
    }
    
    /**
     * Handle pathing room from server (for cross-map pathing)
     */
    handlePathingRoom(data) {
        if (!data.room || !this.pathingModeActive) return;
        
        const room = data.room;
        const direction = data.direction || 'CONNECTION';
        
        // Add room to mapRooms if not already there
        const roomExists = this.mapRooms.some(r => r.id === room.id);
        if (!roomExists) {
            this.mapRooms.push(room);
        }
        
        // If room is on different map, request full map data
        const currentPathingMapId = this.pathingCursorRoom && this.pathingCursorRoom.mapId ? this.pathingCursorRoom.mapId : this.currentMapId;
        if (room.mapId !== currentPathingMapId) {
            this.send({ type: 'getMapData', mapId: room.mapId });
            // Store pending step
            window.pendingPathingStep = {
                room: room,
                direction: direction
            };
            return;
        }
        
        // Add the room to the path
        this.addPathStep(room, direction);
    }
    
    /**
     * Handle path saved
     */
    handlePathSaved(data) {
        const pathTypeLabel = data.pathType === 'loop' ? 'Loop' : 'Path';
        this.emit('terminal:message', { 
            message: `${pathTypeLabel} "${data.name}" saved successfully!`, 
            type: 'success' 
        });
        this.exitPathingMode();
    }
}


