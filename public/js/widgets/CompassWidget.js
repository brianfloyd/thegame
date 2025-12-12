/**
 * CompassWidget
 * 
 * Handles compass navigation buttons and interactions.
 */

import Widget from './Widget.js';

export default class CompassWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.compassButtons = {};
        this.coordsElement = null;
        this.currentMapName = null;
        this.currentExits = {};
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
        root.className = 'widget widget-compass';
        root.setAttribute('data-widget', 'compass');
        
        // Create compass container
        const compassContainer = document.createElement('div');
        compassContainer.className = 'compass-container';
        
        // Create compass grid (3x3 with center)
        const compassGrid = document.createElement('div');
        compassGrid.className = 'compass-grid';
        
        // Create buttons in compass layout
        const directions = [
            { dir: 'NW', label: 'NW', row: 0, col: 0 },
            { dir: 'N', label: 'N', row: 0, col: 1 },
            { dir: 'NE', label: 'NE', row: 0, col: 2 },
            { dir: 'W', label: 'W', row: 1, col: 0 },
            { dir: 'U', label: 'U', row: 1, col: 1 },
            { dir: 'E', label: 'E', row: 1, col: 2 },
            { dir: 'SW', label: 'SW', row: 2, col: 0 },
            { dir: 'S', label: 'S', row: 2, col: 1 },
            { dir: 'SE', label: 'SE', row: 2, col: 2 },
            { dir: 'D', label: 'D', row: 3, col: 1 }
        ];
        
        directions.forEach(({ dir, label, row, col }) => {
            const btn = document.createElement('button');
            btn.className = 'compass-btn unavailable';
            btn.id = `compass-${dir.toLowerCase()}`;
            btn.textContent = label;
            btn.setAttribute('data-direction', dir);
            btn.disabled = true;
            
            // Position in grid
            if (row === 3) {
                // Down button below grid
                btn.style.gridRow = '4';
                btn.style.gridColumn = '2';
            } else {
                btn.style.gridRow = row + 1;
                btn.style.gridColumn = col + 1;
            }
            
            compassGrid.appendChild(btn);
        });
        
        compassContainer.appendChild(compassGrid);
        
        // Create coordinates display
        const coordsContainer = document.createElement('div');
        coordsContainer.className = 'compass-coords';
        const coordsElement = document.createElement('div');
        coordsElement.id = 'compassCoordinates';
        coordsElement.textContent = 'Unknown\n(0, 0)';
        coordsContainer.appendChild(coordsElement);
        
        root.appendChild(compassContainer);
        root.appendChild(coordsContainer);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Get all compass buttons
        this.compassButtons = {
            'N': this.rootElement.querySelector('#compass-n'),
            'S': this.rootElement.querySelector('#compass-s'),
            'E': this.rootElement.querySelector('#compass-e'),
            'W': this.rootElement.querySelector('#compass-w'),
            'NE': this.rootElement.querySelector('#compass-ne'),
            'NW': this.rootElement.querySelector('#compass-nw'),
            'SE': this.rootElement.querySelector('#compass-se'),
            'SW': this.rootElement.querySelector('#compass-sw'),
            'U': this.rootElement.querySelector('#compass-up'),
            'D': this.rootElement.querySelector('#compass-down')
        };
        
        this.coordsElement = this.rootElement.querySelector('#compassCoordinates');
        
        // Set up button click handlers
        Object.entries(this.compassButtons).forEach(([dir, btn]) => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.movePlayer(dir);
                });
            }
        });
        
        // Update with current state if available
        if (this.currentExits && Object.keys(this.currentExits).length > 0) {
            this.updateButtons(this.currentExits);
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomUpdate(msg);
        }
    }
    
    /**
     * Handle room update
     */
    handleRoomUpdate(data) {
        const { room, exits } = data;
        if (room) {
            this.updateCoordinates(room.x, room.y, room.mapName);
        }
        if (exits) {
            this.currentExits = exits;
            this.updateButtons(exits);
        }
    }
    
    /**
     * Update compass buttons based on available exits
     */
    updateButtons(exits) {
        // Exits can be either an array (['N', 'S', 'E']) or an object ({ north: true, south: true })
        // Convert array to object format if needed
        let exitsObj = {};
        
        if (Array.isArray(exits)) {
            // Convert array format to object format
            const directionToKey = {
                'N': 'north',
                'S': 'south',
                'E': 'east',
                'W': 'west',
                'NE': 'northeast',
                'NW': 'northwest',
                'SE': 'southeast',
                'SW': 'southwest',
                'U': 'up',
                'D': 'down'
            };
            
            exits.forEach(dir => {
                const key = directionToKey[dir];
                if (key) {
                    exitsObj[key] = true;
                }
            });
        } else if (exits && typeof exits === 'object') {
            // Already an object, use as-is
            exitsObj = exits;
        }
        
        const exitMap = {
            'N': 'north',
            'S': 'south',
            'E': 'east',
            'W': 'west',
            'NE': 'northeast',
            'NW': 'northwest',
            'SE': 'southeast',
            'SW': 'southwest',
            'U': 'up',
            'D': 'down'
        };
        
        Object.entries(this.compassButtons).forEach(([dir, btn]) => {
            if (btn) {
                const exitKey = exitMap[dir];
                const isAvailable = exitsObj[exitKey] === true;
                
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
    
    /**
     * Update coordinates display
     */
    updateCoordinates(x, y, mapName) {
        if (this.coordsElement) {
            if (mapName) {
                this.currentMapName = mapName;
            }
            const displayName = this.currentMapName || 'Unknown';
            this.coordsElement.textContent = `${displayName}\n(${x}, ${y})`;
        }
    }
    
    /**
     * Move player in direction
     */
    movePlayer(direction) {
        const ws = this.game.getWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            this.game.send({ type: 'move', direction: direction });
        }
    }
}
