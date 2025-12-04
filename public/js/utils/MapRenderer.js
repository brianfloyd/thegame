/**
 * MapRenderer - Shared map rendering engine
 * 
 * Provides a unified way to render maps across all widgets (map widget, jump widget, etc.)
 * Supports both fixed grid mode (centered viewport) and dynamic bounds mode (fit all rooms)
 */

export default class MapRenderer {
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
     * Set zoom level
     */
    setZoom(zoom) {
        const minZoom = this.minCellSize / this.cellSize;
        const maxZoom = this.maxCellSize ? this.maxCellSize / this.cellSize : 5.0;
        this.zoom = Math.max(minZoom, Math.min(zoom, maxZoom));
    }
    
    /**
     * Set pan offset
     */
    setPan(x, y) {
        this.panX = x;
        this.panY = y;
    }
    
    /**
     * Calculate rendering bounds based on rooms and configuration
     */
    calculateBounds(rooms, centerRoom = null) {
        if (this.gridSize !== null) {
            // Fixed grid mode (like main map widget)
            const halfSize = Math.floor(this.gridSize / 2);
            if (centerRoom) {
                const baseCellSize = Math.min(
                    this.canvas.width / this.gridSize, 
                    this.canvas.height / this.gridSize, 
                    this.cellSize
                );
                const scaledCellSize = baseCellSize * this.zoom;
                
                // Adjust for pan
                const adjustedMinX = centerRoom.x - halfSize + this.panX;
                const adjustedMaxX = centerRoom.x + halfSize + this.panX;
                const adjustedMinY = centerRoom.y - halfSize + this.panY;
                const adjustedMaxY = centerRoom.y + halfSize + this.panY;
                
                const scaledGridWidth = this.gridSize * scaledCellSize;
                const scaledGridHeight = this.gridSize * scaledCellSize;
                
                return {
                    minX: adjustedMinX,
                    maxX: adjustedMaxX,
                    minY: adjustedMinY,
                    maxY: adjustedMaxY,
                    cellSize: scaledCellSize,
                    offsetX: (this.canvas.width - scaledGridWidth) / 2,
                    offsetY: (this.canvas.height - scaledGridHeight) / 2
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
        
        // Apply zoom
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
    render(rooms, centerRoom = null, clearColor = '#000') {
        if (!this.canvas || !this.ctx) return;
        
        // Clear canvas
        this.ctx.fillStyle = clearColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (rooms.length === 0) return;
        
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

