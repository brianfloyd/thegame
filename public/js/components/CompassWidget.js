/**
 * CompassWidget Component
 * 
 * Handles compass navigation buttons and interactions.
 */

import Component from '../core/Component.js';

export default class CompassWidget extends Component {
    constructor(game) {
        super(game);
        this.compassButtons = {};
        this.coordsElement = null;
        this.currentMapName = null;
    }
    
    init() {
        super.init();
        
        // Get all compass buttons
        this.compassButtons = {
            'N': document.getElementById('compass-n'),
            'S': document.getElementById('compass-s'),
            'E': document.getElementById('compass-e'),
            'W': document.getElementById('compass-w'),
            'NE': document.getElementById('compass-ne'),
            'NW': document.getElementById('compass-nw'),
            'SE': document.getElementById('compass-se'),
            'SW': document.getElementById('compass-sw'),
            'U': document.getElementById('compass-up'),
            'D': document.getElementById('compass-down')
        };
        
        this.coordsElement = document.getElementById('compassCoordinates');
        
        // Set up button click handlers
        Object.entries(this.compassButtons).forEach(([dir, btn]) => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.movePlayer(dir);
                });
            }
        });
        
        // Subscribe to room updates
        this.subscribe('room:update', (data) => this.handleRoomUpdate(data));
        this.subscribe('room:moved', (data) => this.handleRoomUpdate(data));
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
            this.updateButtons(exits);
        }
    }
    
    /**
     * Update compass buttons based on available exits
     */
    updateButtons(exits) {
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


