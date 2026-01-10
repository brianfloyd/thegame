/**
 * MapWidget
 * 
 * Handles map canvas rendering and room visualization.
 * Includes pathing mode for creating paths/loops.
 */

import Widget from './Widget.js';
import MapRenderer from '../utils/MapRenderer.js';

export default class MapWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.mapCanvas = null;
        this.mapCtx = null;
        this.mapRenderer = null;
        this.mapRooms = [];
        this.currentRoom = null;
        this.currentMapId = null;
        this.roomTypeColors = {};
        
        // Connected map data for junction rooms
        this.connectedMapData = null;
        
        // Pathing mode state
        this.pathingModeActive = false;
        this.pathStartRoom = null;
        this.pathingCursorRoom = null;
        this.currentPath = [];
        
        // God mode state (for double-click to open map editor)
        this.godMode = false;
        
        // Viewport size (20x20 grid)
        this.VIEWPORT_SIZE = 20;
    }
    
    init() {
        super.init();
        // No DOM lookups in init - done in onAttach
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-map';
        root.setAttribute('data-widget', 'map');
        root.id = 'widget-map';
        
        // Create header with controls
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '8px';
        
        // Create title container with info icon
        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = '8px';
        
        const title = document.createElement('h3');
        title.textContent = 'Map';
        title.style.margin = '0';
        titleContainer.appendChild(title);
        
        // Create info icon with tooltip
        const infoIcon = document.createElement('span');
        infoIcon.textContent = '(i)';
        infoIcon.style.cursor = 'help';
        infoIcon.style.color = '#888';
        infoIcon.style.fontSize = '0.9em';
        infoIcon.style.fontStyle = 'italic';
        infoIcon.style.position = 'relative';
        infoIcon.style.userSelect = 'none';
        infoIcon.title = 'Zoom in and out using mouse wheel\nNavigate using command line, compass, or number keys\nRecenter map using arrow keys';
        
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'map-info-tooltip';
        tooltip.style.display = 'none';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '100%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.marginBottom = '5px';
        tooltip.style.padding = '8px 12px';
        tooltip.style.backgroundColor = '#1a1a2e';
        tooltip.style.border = '1px solid #667eea';
        tooltip.style.borderRadius = '4px';
        tooltip.style.color = '#fff';
        tooltip.style.fontSize = '0.85em';
        tooltip.style.whiteSpace = 'pre-line';
        tooltip.style.textAlign = 'left';
        tooltip.style.zIndex = '1000';
        tooltip.style.minWidth = '200px';
        tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        tooltip.textContent = 'Zoom in and out using mouse wheel\nNavigate using command line, compass, or number keys\nRecenter map using arrow keys';
        
        // Add hover handlers
        infoIcon.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        infoIcon.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        infoIcon.appendChild(tooltip);
        titleContainer.appendChild(infoIcon);
        header.appendChild(titleContainer);
        
        // Create pathing mode controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '8px';
        controlsContainer.style.alignItems = 'center';
        
        // Create Path button
        const createPathBtn = document.createElement('button');
        createPathBtn.id = 'createPathBtn';
        createPathBtn.className = 'ticket-action-btn'; // Reuse existing button style
        createPathBtn.textContent = 'Create Path';
        createPathBtn.style.display = 'inline-block';
        controlsContainer.appendChild(createPathBtn);
        
        // Exit Pathing button (hidden initially)
        const exitPathingBtn = document.createElement('button');
        exitPathingBtn.id = 'exitPathingBtn';
        exitPathingBtn.className = 'ticket-action-btn';
        exitPathingBtn.textContent = 'Exit Pathing';
        exitPathingBtn.style.display = 'none';
        controlsContainer.appendChild(exitPathingBtn);
        
        // End Path button (hidden initially)
        const endPathBtn = document.createElement('button');
        endPathBtn.id = 'endPathBtn';
        endPathBtn.className = 'ticket-action-btn';
        endPathBtn.textContent = 'End Path';
        endPathBtn.style.display = 'none';
        controlsContainer.appendChild(endPathBtn);
        
        header.appendChild(controlsContainer);
        root.appendChild(header);
        
        // Create pathing mode indicator (hidden initially)
        const pathingIndicator = document.createElement('div');
        pathingIndicator.id = 'pathingModeIndicator';
        pathingIndicator.style.display = 'none';
        pathingIndicator.style.padding = '8px';
        pathingIndicator.style.backgroundColor = '#1a1a2e';
        pathingIndicator.style.border = '1px solid #667eea';
        pathingIndicator.style.borderRadius = '4px';
        pathingIndicator.style.margin = '8px';
        
        const pathStepCounter = document.createElement('div');
        pathStepCounter.id = 'pathStepCounter';
        pathStepCounter.style.color = '#00ffff';
        pathStepCounter.style.fontWeight = 'bold';
        pathStepCounter.textContent = 'Steps: 0';
        pathingIndicator.appendChild(pathStepCounter);
        
        const pathingModeMessage = document.createElement('div');
        pathingModeMessage.id = 'pathingModeMessage';
        pathingModeMessage.style.color = '#aaa';
        pathingModeMessage.style.fontSize = '0.9em';
        pathingModeMessage.style.marginTop = '4px';
        pathingModeMessage.textContent = 'Pathing Mode Active - Click rooms to build path';
        pathingIndicator.appendChild(pathingModeMessage);
        
        root.appendChild(pathingIndicator);
        
        // Create canvas container - uses 98% of available widget space
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'map-viewport';
        
        const canvas = document.createElement('canvas');
        canvas.id = 'mapCanvas';
        canvasContainer.appendChild(canvas);
        
        root.appendChild(canvasContainer);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        this.mapCanvas = this.rootElement.querySelector('#mapCanvas');
        if (this.mapCanvas) {
            this.mapCtx = this.mapCanvas.getContext('2d');
            this.setupCanvas();
        }
        
        // Initialize pathing mode handlers (buttons are now in the widget)
        this.initPathingModeHandlers();
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'map:data') {
            this.handleMapData(msg);
        } else if (msg.type === 'map:update') {
            this.handleMapUpdate(msg);
        } else if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            if (msg.room) {
                // Update currentRoom - try to find matching room in mapRooms first for consistency
                const matchingRoom = this.mapRooms.find(r => 
                    r.id === msg.room.id || 
                    (r.x === msg.room.x && r.y === msg.room.y && r.mapId === (msg.room.mapId || this.currentMapId))
                );
                this.currentRoom = matchingRoom || msg.room;
                this.renderMap();
            }
        } else if (msg.type === 'playerStats' && msg.stats) {
            if (msg.stats.godMode !== undefined) {
                this.godMode = msg.stats.godMode.value === true || msg.stats.godMode === true;
            }
        } else if (msg.type === 'pathing:modeStarted') {
            // Pathing mode started
        } else if (msg.type === 'pathing:room') {
            this.handlePathingRoom(msg);
        } else if (msg.type === 'pathing:saved') {
            this.handlePathSaved(msg);
        }
    }
    
    /**
     * Initialize pathing mode button handlers
     */
    initPathingModeHandlers() {
        // Buttons are now in the widget's DOM
        const createPathBtn = this.rootElement?.querySelector('#createPathBtn') || document.getElementById('createPathBtn');
        const exitPathingBtn = this.rootElement?.querySelector('#exitPathingBtn') || document.getElementById('exitPathingBtn');
        const endPathBtn = this.rootElement?.querySelector('#endPathBtn') || document.getElementById('endPathBtn');
        
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
            // Function to update canvas size to fill viewport (accounting for padding)
            // CRITICAL: Canvas has two sizes - display (CSS) and drawing buffer (width/height)
            // These must be synchronized for proper rendering
            const updateCanvasSize = () => {
                // Ensure CSS makes canvas fill the viewport content area (98% of widget space)
                // The viewport has 1% padding, so clientWidth/clientHeight gives us the 98% area
                this.mapCanvas.style.width = '100%';
                this.mapCanvas.style.height = '100%';
                
                // Get the viewport's content area dimensions (excludes padding)
                // This is the actual pixel space available for the canvas
                const width = Math.floor(viewport.clientWidth) || 400;
                const height = Math.floor(viewport.clientHeight) || 400;
                
                // Set canvas internal drawing buffer to match display size
                // canvas.width/height are the source of truth for all map coordinate calculations
                // They must match the actual pixel dimensions the canvas is displayed at
                if (this.mapCanvas.width !== width || this.mapCanvas.height !== height) {
                    this.mapCanvas.width = width;
                    this.mapCanvas.height = height;
                }
                
                // Update grid dimensions to match canvas aspect ratio
                // Keep rows fixed at VIEWPORT_SIZE, compute cols from aspect ratio
                // This ensures the map uses the full width of the widget
                if (this.mapRenderer && width > 0 && height > 0) {
                    const gridRows = this.VIEWPORT_SIZE; // Keep 20 rows
                    const gridCols = Math.round(gridRows * (width / height)); // Compute cols from aspect ratio
                    
                    // Update renderer with new canvas dimensions and grid size
                    this.mapRenderer.canvas = this.mapCanvas;
                    this.mapRenderer.ctx = this.mapCtx;
                    this.mapRenderer.gridSize = { cols: gridCols, rows: gridRows };
                }
                this.renderMap();
            };
            
            // Set initial size
            updateCanvasSize();
            
            // Observe viewport size changes
            const resizeObserver = new ResizeObserver(() => {
                updateCanvasSize();
            });
            resizeObserver.observe(viewport);
        }
        
        // Initialize MapRenderer with dynamic grid sizing
        // Grid will be updated in updateCanvasSize() to match aspect ratio
        this.mapRenderer = new MapRenderer({
            canvas: this.mapCanvas,
            ctx: this.mapCtx,
            cellSize: 10,
            gridSize: { cols: this.VIEWPORT_SIZE, rows: this.VIEWPORT_SIZE }, // Will be updated dynamically
            zoom: 1.0,
            panX: 0,
            panY: 0,
            minCellSize: 4, // Reduced from 8 to allow 50% smaller cells (2x more map area)
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
        
        // Add double-click handler to open map editor (god mode only)
        this.mapCanvas.addEventListener('dblclick', (e) => {
            // Check if god mode is active
            if (this.godMode) {
                e.preventDefault();
                window.location.href = '/map';
            }
        });
        
        // Add mouse wheel handler for zoom
        this.mapCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const currentZoom = this.mapRenderer.zoom;
            // Use multiplicative zoom: zoom out shows 100% more map (2x area)
            // To show 2x more area, zoom = currentZoom / 2.0 = currentZoom * 0.5
            // To zoom in by same factor, zoom = currentZoom * 2.0
            const zoomFactor = 2.0;
            if (e.deltaY < 0) {
                // Zoom in
                this.mapRenderer.setZoom(currentZoom * zoomFactor);
            } else {
                // Zoom out - show 100% more of the map
                this.mapRenderer.setZoom(currentZoom / zoomFactor);
            }
            this.renderMap();
        });
        
        // Setup keyboard handlers
        this.setupKeyboardHandlers();
        
        // Initial render (will show empty/black if no data yet)
        this.renderMap();
    }
    
    /**
     * Setup keyboard handlers for zoom, pan, and pathing mode
     */
    setupKeyboardHandlers() {
        // Store reference to handler so we can remove it later
        this.keyboardHandler = (e) => {
            // Check if map widget is visible
            if (!this.rootElement || this.rootElement.classList.contains('hidden')) {
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
        
        this.renderMap();
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
                    this.game.send({
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
            this.renderMap();
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
        
        // Store connected map data for junction rooms
        this.connectedMapData = data.connectedMapData || null;
        
        // If there's a pending pathing step, add it now
        if (window.pendingPathingStep) {
            const step = window.pendingPathingStep;
            window.pendingPathingStep = null;
            this.addPathStep(step.room, step.direction);
        }
        
        // Ensure canvas is sized before rendering
        if (this.mapCanvas && this.mapCanvas.width === 0) {
            const viewport = this.mapCanvas.parentElement;
            if (viewport) {
                this.mapCanvas.width = viewport.clientWidth || 400;
                this.mapCanvas.height = viewport.clientHeight || 400;
                if (this.mapRenderer) {
                    this.mapRenderer.canvas = this.mapCanvas;
                    this.mapRenderer.ctx = this.mapCtx;
                }
            }
        }
        
        this.renderMap();
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
        // Update connected map data (could be null if player left a junction)
        this.connectedMapData = data.connectedMapData || null;
        this.renderMap();
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
        // Compare by ID first, then fall back to coordinates if IDs don't match (handles type mismatches)
        if (!this.pathingModeActive && this.currentRoom) {
            const idMatch = room.id === this.currentRoom.id || 
                           String(room.id) === String(this.currentRoom.id);
            const coordMatch = room.x === this.currentRoom.x && 
                             room.y === this.currentRoom.y &&
                             room.mapId === this.currentMapId;
            
            if (idMatch || coordMatch) {
                return { color: '#ffff00', width: 2 }; // Yellow border for current room
            }
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
     * When on a junction room, renders both current map and connected map
     */
    renderMap() {
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
        
        // Check if we need to render connected map (junction room)
        const hasConnectedMap = !this.pathingModeActive && this.connectedMapData && 
                                this.connectedMapData.rooms && this.connectedMapData.rooms.length > 0;
        
        if (hasConnectedMap) {
            // Render dual-map view
            this.renderDualMap(currentMapRooms, centerRoom);
        } else {
            // Single map render
            this.mapRenderer.render(currentMapRooms, centerRoom);
        }
        
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
     * Render dual-map view when on a junction room
     * Splits canvas based on connection direction and renders both maps seamlessly
     */
    renderDualMap(currentMapRooms, centerRoom) {
        const ctx = this.mapCtx;
        const canvasWidth = this.mapCanvas.width;
        const canvasHeight = this.mapCanvas.height;
        
        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        const connectionDir = this.connectedMapData.connectionDirection?.toUpperCase() || 'S';
        const connectedRooms = this.connectedMapData.rooms;
        const connectedEntryRoom = this.connectedMapData.entryRoom;
        
        // Determine split orientation based on connection direction
        // S/N = vertical split, E/W = horizontal split
        const isVerticalSplit = connectionDir === 'S' || connectionDir === 'N';
        
        // Calculate split dimensions (50% each, no separator - maps touch directly)
        let currentMapRect, connectedMapRect;
        
        if (isVerticalSplit) {
            const halfHeight = Math.floor(canvasHeight / 2);
            if (connectionDir === 'S') {
                // Connected map is south, so it goes on bottom
                currentMapRect = { x: 0, y: 0, width: canvasWidth, height: halfHeight };
                connectedMapRect = { x: 0, y: halfHeight, width: canvasWidth, height: canvasHeight - halfHeight };
            } else {
                // N: Connected map is north, goes on top
                connectedMapRect = { x: 0, y: 0, width: canvasWidth, height: halfHeight };
                currentMapRect = { x: 0, y: halfHeight, width: canvasWidth, height: canvasHeight - halfHeight };
            }
        } else {
            const halfWidth = Math.floor(canvasWidth / 2);
            if (connectionDir === 'E') {
                // Connected map is east, goes on right
                currentMapRect = { x: 0, y: 0, width: halfWidth, height: canvasHeight };
                connectedMapRect = { x: halfWidth, y: 0, width: canvasWidth - halfWidth, height: canvasHeight };
            } else {
                // W: Connected map is west, goes on left
                connectedMapRect = { x: 0, y: 0, width: halfWidth, height: canvasHeight };
                currentMapRect = { x: halfWidth, y: 0, width: canvasWidth - halfWidth, height: canvasHeight };
            }
        }
        
        // Determine anchor edges so the junction rooms touch at the boundary
        // Current map's junction should be at the edge facing the connected map
        // Connected map's entry should be at the edge facing the current map
        let currentAnchor, connectedAnchor;
        if (connectionDir === 'S') {
            currentAnchor = 'bottom';  // Junction at bottom of current map region
            connectedAnchor = 'top';   // Entry at top of connected map region
        } else if (connectionDir === 'N') {
            currentAnchor = 'top';
            connectedAnchor = 'bottom';
        } else if (connectionDir === 'E') {
            currentAnchor = 'right';
            connectedAnchor = 'left';
        } else { // W
            currentAnchor = 'left';
            connectedAnchor = 'right';
        }
        
        // Render current map with junction anchored at edge
        this.renderMapInRegion(currentMapRooms, centerRoom, currentMapRect, this.roomTypeColors, true, currentAnchor);
        
        // Render connected map with entry anchored at edge
        const connectedCenterRoom = connectedEntryRoom || connectedRooms[0];
        this.renderMapInRegion(connectedRooms, connectedCenterRoom, connectedMapRect, 
                               this.connectedMapData.roomTypeColors || this.roomTypeColors, false, connectedAnchor);
    }
    
    /**
     * Render a map within a specific rectangular region of the canvas
     * @param {string} anchor - Where to anchor the center room: 'center', 'top', 'bottom', 'left', 'right'
     */
    renderMapInRegion(rooms, centerRoom, rect, roomTypeColors, isCurrentMap, anchor = 'center') {
        if (!rooms || rooms.length === 0 || !centerRoom) return;
        
        const ctx = this.mapCtx;
        
        // Save context state
        ctx.save();
        
        // Clip to the region
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        
        // Calculate grid size based on region dimensions
        const gridRows = Math.floor(this.VIEWPORT_SIZE / 2); // Smaller grid for split view
        const aspectRatio = rect.width / rect.height;
        const gridCols = Math.round(gridRows * aspectRatio);
        
        // Calculate cell size with current zoom applied
        const baseCellSizeX = rect.width / gridCols;
        const baseCellSizeY = rect.height / gridRows;
        const baseCellSize = Math.min(baseCellSizeX, baseCellSizeY);
        
        // Apply zoom from main renderer
        const zoomFactor = this.mapRenderer.zoom < 1.0 ? (1.0 / this.mapRenderer.zoom) : 1.0;
        let cellSize = baseCellSize * this.mapRenderer.zoom;
        cellSize = Math.max(cellSize, this.mapRenderer.minCellSize);
        
        // Calculate expanded bounds for zoomed out view
        const halfCols = Math.floor(gridCols / 2 * zoomFactor);
        const halfRows = Math.floor(gridRows / 2 * zoomFactor);
        
        const minX = centerRoom.x - halfCols + this.mapRenderer.panX;
        const maxX = centerRoom.x + halfCols + this.mapRenderer.panX;
        const minY = centerRoom.y - halfRows + this.mapRenderer.panY;
        const maxY = centerRoom.y + halfRows + this.mapRenderer.panY;
        
        // Calculate grid dimensions
        const expandedGridCols = halfCols * 2 + 1;
        const expandedGridRows = halfRows * 2 + 1;
        const scaledGridWidth = expandedGridCols * cellSize;
        const scaledGridHeight = expandedGridRows * cellSize;
        
        // Calculate offsets within the region based on anchor
        // The anchor determines where the center room should appear in the region
        let offsetX, offsetY;
        
        // Calculate center room's position within the grid
        const centerRoomGridX = centerRoom.x - minX;
        const centerRoomGridY = maxY - centerRoom.y;
        
        switch (anchor) {
            case 'top':
                // Center room should be at top of region
                offsetX = rect.x + Math.floor((rect.width - scaledGridWidth) / 2);
                offsetY = rect.y - centerRoomGridY * cellSize + cellSize / 2;
                break;
            case 'bottom':
                // Center room should be at bottom of region
                offsetX = rect.x + Math.floor((rect.width - scaledGridWidth) / 2);
                offsetY = rect.y + rect.height - (centerRoomGridY + 1) * cellSize - cellSize / 2;
                break;
            case 'left':
                // Center room should be at left of region
                offsetX = rect.x - centerRoomGridX * cellSize + cellSize / 2;
                offsetY = rect.y + Math.floor((rect.height - scaledGridHeight) / 2);
                break;
            case 'right':
                // Center room should be at right of region
                offsetX = rect.x + rect.width - (centerRoomGridX + 1) * cellSize - cellSize / 2;
                offsetY = rect.y + Math.floor((rect.height - scaledGridHeight) / 2);
                break;
            default: // 'center'
                offsetX = rect.x + Math.floor((rect.width - scaledGridWidth) / 2);
                offsetY = rect.y + Math.floor((rect.height - scaledGridHeight) / 2);
        }
        
        // Create room map for drawing
        const roomMap = new Map();
        rooms.forEach(room => {
            roomMap.set(`${room.x},${room.y}`, room);
        });
        
        // Draw connections first
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        const directions = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
        ];
        
        rooms.forEach(room => {
            if (room.x < minX || room.x > maxX || room.y < minY || room.y > maxY) return;
            
            const screenX = offsetX + (room.x - minX) * cellSize;
            const screenY = offsetY + (maxY - room.y) * cellSize;
            const roomCenterX = screenX + cellSize / 2;
            const roomCenterY = screenY + cellSize / 2;
            
            directions.forEach(dir => {
                const adjKey = `${room.x + dir.dx},${room.y + dir.dy}`;
                if (roomMap.has(adjKey)) {
                    const adjRoom = roomMap.get(adjKey);
                    if (adjRoom.x >= minX && adjRoom.x <= maxX && 
                        adjRoom.y >= minY && adjRoom.y <= maxY) {
                        const adjScreenX = offsetX + (adjRoom.x - minX) * cellSize;
                        const adjScreenY = offsetY + (maxY - adjRoom.y) * cellSize;
                        
                        ctx.beginPath();
                        ctx.moveTo(roomCenterX, roomCenterY);
                        ctx.lineTo(adjScreenX + cellSize / 2, adjScreenY + cellSize / 2);
                        ctx.stroke();
                    }
                }
            });
        });
        
        // Draw rooms
        rooms.forEach(room => {
            if (room.x < minX || room.x > maxX || room.y < minY || room.y > maxY) return;
            
            const screenX = offsetX + (room.x - minX) * cellSize;
            const screenY = offsetY + (maxY - room.y) * cellSize;
            
            // Get room color
            const hasConnection = room.connected_map_id !== null && room.connected_map_id !== undefined;
            let fillColor = hasConnection ? '#ffffff' : (roomTypeColors[room.roomType] || '#666');
            
            // Highlight current room in current map
            const isCurrent = isCurrentMap && this.currentRoom && 
                             room.x === this.currentRoom.x && room.y === this.currentRoom.y;
            
            // Highlight entry room in connected map
            const isEntry = !isCurrentMap && this.connectedMapData?.entryRoom &&
                           room.x === this.connectedMapData.entryRoom.x && 
                           room.y === this.connectedMapData.entryRoom.y;
            
            // Draw room fill
            ctx.fillStyle = fillColor;
            const roomSize = Math.max(1, cellSize - 2);
            ctx.fillRect(screenX + 1, screenY + 1, roomSize, roomSize);
            
            // Draw border
            if (isCurrent) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2;
            } else if (isEntry) {
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
            } else if (hasConnection) {
                ctx.strokeStyle = '#cccccc';
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = this.darkenColor(fillColor, 0.5);
                ctx.lineWidth = 1;
            }
            ctx.strokeRect(screenX + 1, screenY + 1, roomSize, roomSize);
        });
        
        // Restore context state
        ctx.restore();
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
        this.game.send({ type: 'getMapData', mapId: this.currentMapId });
        
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
        const createPathBtn = this.rootElement?.querySelector('#createPathBtn') || document.getElementById('createPathBtn');
        const exitPathingBtn = this.rootElement?.querySelector('#exitPathingBtn') || document.getElementById('exitPathingBtn');
        const endPathBtn = this.rootElement?.querySelector('#endPathBtn') || document.getElementById('endPathBtn');
        const pathingIndicator = this.rootElement?.querySelector('#pathingModeIndicator') || document.getElementById('pathingModeIndicator');
        
        if (createPathBtn) createPathBtn.style.display = 'none';
        if (exitPathingBtn) exitPathingBtn.style.display = 'inline-block';
        if (endPathBtn) endPathBtn.style.display = 'inline-block';
        if (pathingIndicator) pathingIndicator.style.display = 'flex';
        
        this.updatePathStepCounter();
        
        // Request pathing mode start from server
        this.game.send({ type: 'startPathingMode' });
        
        // Emit recordStart event for automation widget
        this.game.messageBus.emit('recordStart', {
            startRoom: this.pathStartRoom
        });
        
        // Re-render map
        this.renderMap();
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
        const createPathBtn = this.rootElement?.querySelector('#createPathBtn') || document.getElementById('createPathBtn');
        const exitPathingBtn = this.rootElement?.querySelector('#exitPathingBtn') || document.getElementById('exitPathingBtn');
        const endPathBtn = this.rootElement?.querySelector('#endPathBtn') || document.getElementById('endPathBtn');
        const pathingIndicator = this.rootElement?.querySelector('#pathingModeIndicator') || document.getElementById('pathingModeIndicator');
        
        if (createPathBtn) createPathBtn.style.display = 'inline-block';
        if (exitPathingBtn) exitPathingBtn.style.display = 'none';
        if (endPathBtn) endPathBtn.style.display = 'none';
        if (pathingIndicator) pathingIndicator.style.display = 'none';
        
        // Cancel on server
        this.game.send({ type: 'cancelPathing' });
        
        // Emit recordStop event for automation widget
        this.game.messageBus.emit('recordStop', {
            pathLength: this.currentPath.length
        });
        
        // Re-render map
        this.renderMap();
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
        this.renderMap();
    }
    
    /**
     * Update path step counter
     */
    updatePathStepCounter() {
        const counter = this.rootElement?.querySelector('#pathStepCounter') || document.getElementById('pathStepCounter');
        const messageSpan = this.rootElement?.querySelector('#pathingModeMessage') || document.getElementById('pathingModeMessage');
        
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
            this.renderMap();
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
            if (window.terminal) {
                window.terminal.addMessage('Please enter a path name.', 'error');
            }
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
            if (window.terminal) {
                window.terminal.addMessage('Cannot save path: No valid steps with directions found.', 'error');
            }
            return;
        }
        
        this.game.send({
            type: 'savePath',
            name: name,
            pathType: pathType,
            mapId: this.currentMapId,
            originRoomId: this.pathStartRoom.id,
            steps: validSteps
        });
        
        // Events will be emitted in handlePathSaved() when server responds with pathId
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
            this.game.send({ type: 'getMapData', mapId: room.mapId });
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
        if (window.terminal) {
            window.terminal.addMessage(`${pathTypeLabel} "${data.name}" saved successfully!`, 'success');
        }
        
        // Emit savePath or saveLoop event for automation widget
        // Use pathId from server response, or fall back to current path length
        const pathId = data.pathId || data.id;
        const stepCount = this.currentPath ? this.currentPath.length : 0;
        
        if (data.pathType === 'loop') {
            this.game.messageBus.emit('saveLoop', {
                name: data.name,
                pathId: pathId,
                steps: stepCount,
                startRoom: this.pathStartRoom
            });
        } else {
            this.game.messageBus.emit('savePath', {
                name: data.name,
                pathId: pathId,
                steps: stepCount,
                startRoom: this.pathStartRoom,
                endRoom: this.pathingCursorRoom
            });
        }
        
        this.exitPathingMode();
    }
}


