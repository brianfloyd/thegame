/**
 * CompassWidget
 * 
 * Handles compass navigation buttons and auto-navigation to any room.
 * Features:
 * - Compass direction buttons for manual movement
 * - Auto-navigation: select any room from any map
 * - Pathfinding algorithm calculates fastest route
 * - Route preview before navigation
 * - Respects player auto_navigation_time_ms setting
 * 
 * Canon: Auto-navigation moved from AutomationWidget per user request
 */

import Widget from './Widget.js';

export default class CompassWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.compassButtons = {};
        this.coordsElement = null;
        this.currentMapName = null;
        this.currentExits = {};
        this.currentRoomId = null;
        this.currentRoom = null;
        
        // Auto-navigation state
        this.maps = [];
        this.rooms = [];
        this.selectedMapId = null;
        this.selectedRoomId = null;
        this.calculatedPath = null;
        this.isNavigating = false;
    }
    
    init() {
        super.init();
        // Request maps on init (will be sent after widget is attached)
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
        
        // Create auto-navigation section
        const navSection = this.renderAutoNavigationSection();
        root.appendChild(navSection);
        
        return root;
    }
    
    /**
     * Render auto-navigation section
     */
    renderAutoNavigationSection() {
        const section = document.createElement('div');
        section.className = 'widget-section';
        section.style.marginTop = '10px';
        
        // Toggle switch for auto-navigation
        const toggleContainer = document.createElement('div');
        toggleContainer.style.marginBottom = '10px';
        toggleContainer.style.display = 'flex';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.gap = '8px';
        
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-switch';
        
        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.id = 'compassAutoNavToggle';
        toggleCheckbox.checked = false;
        
        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'toggle-slider';
        
        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(toggleSlider);
        
        // Label text separate from toggle switch to avoid overlap
        const toggleLabelText = document.createElement('span');
        toggleLabelText.className = 'toggle-label';
        toggleLabelText.textContent = 'Auto-Navigation';
        toggleLabelText.style.fontSize = '12px';
        toggleLabelText.style.marginLeft = '25px'; // Move text to the right to avoid overlap
        
        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleLabelText);
        section.appendChild(toggleContainer);
        
        // Navigation controls container (hidden by default)
        const navControls = document.createElement('div');
        navControls.id = 'compassNavControls';
        navControls.style.display = 'none';
        
        // Map selection
        const mapContainer = document.createElement('div');
        mapContainer.style.marginBottom = '8px';
        
        const mapLabel = document.createElement('label');
        mapLabel.className = 'widget-stat-label';
        mapLabel.textContent = 'Map:';
        mapLabel.style.fontSize = '11px';
        mapContainer.appendChild(mapLabel);
        
        const mapSelect = document.createElement('select');
        mapSelect.id = 'compassMapSelect';
        mapSelect.className = 'widget-select';
        mapSelect.style.fontSize = '11px';
        mapSelect.style.width = '100%';
        const mapPlaceholder = document.createElement('option');
        mapPlaceholder.value = '';
        mapPlaceholder.textContent = 'Select a map...';
        mapSelect.appendChild(mapPlaceholder);
        mapContainer.appendChild(mapSelect);
        
        navControls.appendChild(mapContainer);
        
        // Room selection
        const roomContainer = document.createElement('div');
        roomContainer.style.marginBottom = '8px';
        
        const roomLabel = document.createElement('label');
        roomLabel.className = 'widget-stat-label';
        roomLabel.textContent = 'Room:';
        roomLabel.style.fontSize = '11px';
        roomContainer.appendChild(roomLabel);
        
        const roomSelect = document.createElement('select');
        roomSelect.id = 'compassRoomSelect';
        roomSelect.className = 'widget-select';
        roomSelect.style.fontSize = '11px';
        roomSelect.style.width = '100%';
        roomSelect.disabled = true;
        const roomPlaceholder = document.createElement('option');
        roomPlaceholder.value = '';
        roomPlaceholder.textContent = 'Select a room...';
        roomSelect.appendChild(roomPlaceholder);
        roomContainer.appendChild(roomSelect);
        
        navControls.appendChild(roomContainer);
        
        // Calculate path button
        const calcBtn = document.createElement('button');
        calcBtn.id = 'compassCalculateBtn';
        calcBtn.className = 'widget-btn widget-btn-primary';
        calcBtn.textContent = 'Calculate Route';
        calcBtn.style.fontSize = '11px';
        calcBtn.style.width = '100%';
        calcBtn.style.marginBottom = '8px';
        calcBtn.disabled = true;
        navControls.appendChild(calcBtn);
        
        // Route display (hidden until path calculated)
        const routeContainer = document.createElement('div');
        routeContainer.id = 'compassRouteDisplay';
        routeContainer.className = 'widget-section';
        routeContainer.style.display = 'none';
        routeContainer.style.marginTop = '8px';
        routeContainer.style.padding = '8px';
        routeContainer.style.backgroundColor = '#0a0a0a';
        routeContainer.style.border = '1px solid #333';
        routeContainer.style.borderRadius = '4px';
        
        const routeTitle = document.createElement('div');
        routeTitle.className = 'widget-section-title';
        routeTitle.textContent = 'Route Preview';
        routeTitle.style.fontSize = '12px';
        routeTitle.style.marginBottom = '8px';
        routeContainer.appendChild(routeTitle);
        
        const routeList = document.createElement('div');
        routeList.id = 'compassRouteList';
        routeList.style.fontSize = '10px';
        routeList.style.color = '#00ff00';
        routeList.style.maxHeight = '150px';
        routeList.style.overflowY = 'auto';
        routeContainer.appendChild(routeList);
        
        navControls.appendChild(routeContainer);
        
        // Go button (hidden until path calculated)
        const goBtn = document.createElement('button');
        goBtn.id = 'compassGoBtn';
        goBtn.className = 'widget-btn widget-btn-success';
        goBtn.textContent = 'Go';
        goBtn.style.fontSize = '13px';
        goBtn.style.fontWeight = 'bold';
        goBtn.style.width = '100%';
        goBtn.style.marginTop = '12px';
        goBtn.style.marginBottom = '8px';
        goBtn.style.padding = '10px';
        goBtn.style.display = 'none';
        navControls.appendChild(goBtn);
        
        // Stop button (hidden until navigating)
        const stopBtn = document.createElement('button');
        stopBtn.id = 'compassStopBtn';
        stopBtn.className = 'widget-btn widget-btn-danger';
        stopBtn.textContent = 'Stop Navigation';
        stopBtn.style.fontSize = '11px';
        stopBtn.style.width = '100%';
        stopBtn.style.marginTop = '8px';
        stopBtn.style.display = 'none';
        navControls.appendChild(stopBtn);
        
        section.appendChild(navControls);
        
        return section;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Set up auto-navigation toggle
        const autoNavToggle = this.rootElement.querySelector('#compassAutoNavToggle');
        if (autoNavToggle) {
            autoNavToggle.addEventListener('change', () => this.onAutoNavToggleChanged());
        }
        
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
        
        // Set up auto-navigation handlers
        const mapSelect = this.rootElement.querySelector('#compassMapSelect');
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        const goBtn = this.rootElement.querySelector('#compassGoBtn');
        const stopBtn = this.rootElement.querySelector('#compassStopBtn');
        
        if (mapSelect) {
            mapSelect.addEventListener('change', () => this.onMapSelected());
        }
        
        if (roomSelect) {
            roomSelect.addEventListener('change', () => this.onRoomSelected());
        }
        
        if (calcBtn) {
            calcBtn.addEventListener('click', () => this.calculateRoute());
        }
        
        if (goBtn) {
            goBtn.addEventListener('click', () => this.startNavigation());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopNavigation());
        }
        
        // Update with current state if available
        if (this.currentExits && Object.keys(this.currentExits).length > 0) {
            this.updateButtons(this.currentExits);
        }
    }
    
    /**
     * Handle auto-navigation toggle change
     */
    onAutoNavToggleChanged() {
        const toggle = this.rootElement.querySelector('#compassAutoNavToggle');
        const navControls = this.rootElement.querySelector('#compassNavControls');
        
        if (!toggle || !navControls) return;
        
        if (toggle.checked) {
            // Show navigation controls
            navControls.style.display = 'block';
            // Request maps if not already loaded
            if (this.maps.length === 0) {
                this.game.send({ type: 'getAutoPathMaps' });
            }
        } else {
            // Hide navigation controls
            navControls.style.display = 'none';
            // Reset state
            this.selectedMapId = null;
            this.selectedRoomId = null;
            this.calculatedPath = null;
            this.hideRouteDisplay();
            
            // Clear selections
            const mapSelect = this.rootElement.querySelector('#compassMapSelect');
            const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
            if (mapSelect) mapSelect.value = '';
            if (roomSelect) {
                roomSelect.value = '';
                roomSelect.disabled = true;
            }
            
            // Stop navigation if active
            if (this.isNavigating) {
                this.stopNavigation();
            }
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomUpdate(msg);
        } else if (msg.type === 'autopath:maps') {
            this.handleMapsReceived(msg.maps);
        } else if (msg.type === 'autopath:rooms') {
            this.handleRoomsReceived(msg.rooms);
        } else if (msg.type === 'autopath:calculated') {
            this.handlePathCalculated(msg.path);
        } else if (msg.type === 'autonav:started') {
            this.handleNavigationStarted(msg);
        } else if (msg.type === 'autonav:complete') {
            this.handleNavigationComplete(msg);
        } else if (msg.type === 'autonav:failed') {
            this.handleNavigationFailed(msg);
        }
    }
    
    /**
     * Handle maps received from server
     */
    handleMapsReceived(maps) {
        this.maps = maps || [];
        const mapSelect = this.rootElement.querySelector('#compassMapSelect');
        if (!mapSelect) return;
        
        // Clear existing options except placeholder
        mapSelect.innerHTML = '<option value="">Select a map...</option>';
        
        this.maps.forEach(map => {
            const option = document.createElement('option');
            option.value = map.id;
            option.textContent = map.name;
            mapSelect.appendChild(option);
        });
    }
    
    /**
     * Handle rooms received from server
     */
    handleRoomsReceived(rooms) {
        this.rooms = rooms || [];
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        if (!roomSelect) return;
        
        // Clear existing options except placeholder
        roomSelect.innerHTML = '<option value="">Select a room...</option>';
        
        // Sort rooms by name for easier selection
        const sortedRooms = [...this.rooms].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        sortedRooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room.id;
            const coords = `(${room.x}, ${room.y})`;
            option.textContent = `${room.name} ${coords}`;
            option.setAttribute('data-room-name', room.name);
            option.setAttribute('data-room-x', room.x);
            option.setAttribute('data-room-y', room.y);
            roomSelect.appendChild(option);
        });
        
        roomSelect.disabled = false;
    }
    
    /**
     * Handle map selection
     */
    onMapSelected() {
        const mapSelect = this.rootElement.querySelector('#compassMapSelect');
        if (!mapSelect) return;
        
        const mapId = parseInt(mapSelect.value);
        this.selectedMapId = mapId;
        this.selectedRoomId = null;
        this.calculatedPath = null;
        
        // Clear room selection
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        if (roomSelect) {
            roomSelect.innerHTML = '<option value="">Select a room...</option>';
            roomSelect.disabled = !mapId;
        }
        
        // Disable calculate button
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        if (calcBtn) {
            calcBtn.disabled = !mapId;
        }
        
        // Hide route display
        this.hideRouteDisplay();
        
        // Request rooms for selected map
        if (mapId) {
            this.game.send({ type: 'getAutoPathRooms', mapId });
        }
    }
    
    /**
     * Handle room selection
     */
    onRoomSelected() {
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        if (!roomSelect) return;
        
        const roomId = parseInt(roomSelect.value);
        this.selectedRoomId = roomId;
        this.calculatedPath = null;
        
        // Enable/disable calculate button
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        if (calcBtn) {
            calcBtn.disabled = !roomId || this.isNavigating;
        }
        
        // Hide route display
        this.hideRouteDisplay();
    }
    
    /**
     * Calculate route to selected room
     */
    calculateRoute() {
        if (!this.selectedRoomId || !this.currentRoomId) {
            if (window.terminal) {
                window.terminal.addMessage('Please select a destination room.', 'error');
            }
            return;
        }
        
        if (this.selectedRoomId === this.currentRoomId) {
            if (window.terminal) {
                window.terminal.addMessage('You are already at the selected room.', 'info');
            }
            return;
        }
        
        // Request path calculation from server
        this.game.send({ 
            type: 'calculateAutoPath', 
            targetRoomId: this.selectedRoomId 
        });
        
        // Show loading state
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        if (calcBtn) {
            calcBtn.disabled = true;
            calcBtn.textContent = 'Calculating...';
        }
    }
    
    /**
     * Handle path calculated response
     */
    handlePathCalculated(path) {
        this.calculatedPath = path;
        
        // Reset calculate button
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        if (calcBtn) {
            calcBtn.disabled = false;
            calcBtn.textContent = 'Calculate Route';
        }
        
        if (!path || path.length === 0) {
            if (window.terminal) {
                window.terminal.addMessage('No path found to destination.', 'error');
            }
            return;
        }
        
        // Display route
        this.displayRoute(path);
        
        // Show Go button (make it prominent)
        const goBtn = this.rootElement.querySelector('#compassGoBtn');
        if (goBtn) {
            goBtn.style.display = 'block';
            // Scroll to Go button to make it visible
            setTimeout(() => {
                goBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }
    
    /**
     * Display calculated route
     */
    displayRoute(path) {
        const routeContainer = this.rootElement.querySelector('#compassRouteDisplay');
        const routeList = this.rootElement.querySelector('#compassRouteList');
        if (!routeContainer || !routeList) return;
        
        routeList.innerHTML = '';
        
        if (path.length === 0) {
            routeList.textContent = 'Already at destination';
            routeContainer.style.display = 'block';
            return;
        }
        
        // Display route steps
        path.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.style.padding = '4px 0';
            stepDiv.style.borderBottom = index < path.length - 1 ? '1px solid #333' : 'none';
            
            const stepNum = document.createElement('span');
            stepNum.textContent = `${index + 1}. `;
            stepNum.style.color = '#ffff00';
            stepDiv.appendChild(stepNum);
            
            const direction = document.createElement('span');
            direction.textContent = `${step.direction} → `;
            direction.style.color = '#00ffff';
            stepDiv.appendChild(direction);
            
            const roomName = document.createElement('span');
            roomName.textContent = step.roomName || `Room ${step.roomId}`;
            roomName.style.color = '#00ff00';
            stepDiv.appendChild(roomName);
            
            if (step.mapName) {
                const mapName = document.createElement('span');
                mapName.textContent = ` (${step.mapName})`;
                mapName.style.color = '#888';
                stepDiv.appendChild(mapName);
            }
            
            routeList.appendChild(stepDiv);
        });
        
        // Show route container
        routeContainer.style.display = 'block';
        
        // Show summary
        const summary = document.createElement('div');
        summary.style.marginTop = '8px';
        summary.style.paddingTop = '8px';
        summary.style.borderTop = '1px solid #333';
        summary.style.fontSize = '10px';
        summary.style.color = '#888';
        summary.textContent = `Total steps: ${path.length}`;
        routeList.appendChild(summary);
    }
    
    /**
     * Hide route display
     */
    hideRouteDisplay() {
        const routeContainer = this.rootElement.querySelector('#compassRouteDisplay');
        const goBtn = this.rootElement.querySelector('#compassGoBtn');
        
        if (routeContainer) {
            routeContainer.style.display = 'none';
        }
        
        if (goBtn) {
            goBtn.style.display = 'none';
        }
        
        this.calculatedPath = null;
    }
    
    /**
     * Start auto-navigation
     */
    startNavigation() {
        if (!this.calculatedPath || this.calculatedPath.length === 0) {
            if (window.terminal) {
                window.terminal.addMessage('No route calculated. Please calculate a route first.', 'error');
            }
            return;
        }
        
        // Send path to server to start auto-navigation
        this.game.send({
            type: 'startAutoNavigation',
            path: this.calculatedPath
        });
        
        this.isNavigating = true;
        
        // Update UI
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        const goBtn = this.rootElement.querySelector('#compassGoBtn');
        const stopBtn = this.rootElement.querySelector('#compassStopBtn');
        const mapSelect = this.rootElement.querySelector('#compassMapSelect');
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        
        if (calcBtn) calcBtn.disabled = true;
        if (goBtn) goBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (mapSelect) mapSelect.disabled = true;
        if (roomSelect) roomSelect.disabled = true;
    }
    
    /**
     * Stop auto-navigation
     */
    stopNavigation() {
        // Server will handle stopping via manual movement
        // Just update UI state
        this.isNavigating = false;
        
        const calcBtn = this.rootElement.querySelector('#compassCalculateBtn');
        const goBtn = this.rootElement.querySelector('#compassGoBtn');
        const stopBtn = this.rootElement.querySelector('#compassStopBtn');
        const mapSelect = this.rootElement.querySelector('#compassMapSelect');
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        
        if (calcBtn) calcBtn.disabled = !this.selectedRoomId;
        if (goBtn && this.calculatedPath) goBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (mapSelect) mapSelect.disabled = false;
        if (roomSelect) roomSelect.disabled = false;
    }
    
    /**
     * Handle navigation started
     */
    handleNavigationStarted(data) {
        this.isNavigating = true;
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle navigation complete
     */
    handleNavigationComplete(data) {
        this.isNavigating = false;
        
        // Reset UI
        this.stopNavigation();
        this.hideRouteDisplay();
        this.selectedRoomId = null;
        this.calculatedPath = null;
        
        // Clear selections
        const mapSelect = this.rootElement.querySelector('#compassMapSelect');
        const roomSelect = this.rootElement.querySelector('#compassRoomSelect');
        if (mapSelect) mapSelect.value = '';
        if (roomSelect) {
            roomSelect.value = '';
            roomSelect.disabled = true;
        }
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle navigation failed
     */
    handleNavigationFailed(data) {
        this.isNavigating = false;
        this.stopNavigation();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'error');
        }
    }
    
    /**
     * Handle room update
     */
    handleRoomUpdate(data) {
        const { room, exits } = data;
        if (room) {
            this.currentRoomId = room.id;
            this.currentRoom = room;
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
