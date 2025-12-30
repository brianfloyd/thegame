/**
 * AutomationWidget
 * 
 * Comprehensive automation control widget with:
 * - Auto-loop execution
 * - 9 toggle settings with player ability gating
 * - Toggle state persistence in widget_config
 * - Standardized CSS classes
 * - Future feature stubs (auto-collect, auto-store, auto-deliver, auto-craft)
 * 
 * Note: Auto-navigation has been moved to CompassWidget
 * 
 * Canon: 10-16-automation-engine.md
 */

import Widget from './Widget.js';

// Toggle configuration with ability/stat gating
const TOGGLE_CONFIG = {
    autoLoop: {
        label: 'Auto-Loop Execution',
        category: 'movement',
        gating: null, // Always available
        requiresAbility: null,
        requiresStat: null,
        requiresWarehouse: false,
        requiresFactory: false,
        implemented: true
    },
    autoHarvest: {
        label: 'Auto-Harvest (Loops)',
        category: 'harvest',
        gating: 'ability_attunement >= 5 OR stat_resonance >= 10',
        requiresAbility: { attunement: 5 },
        requiresStat: { resonance: 10 },
        requiresWarehouse: false,
        requiresFactory: false,
        implemented: true
    },
    autoAttune: {
        label: 'Auto-Attune',
        category: 'harvest',
        gating: 'ability_attunement >= 10 AND stat_resonance >= 15',
        requiresAbility: { attunement: 10 },
        requiresStat: { resonance: 15 },
        requiresWarehouse: false,
        requiresFactory: false,
        implemented: false // Future feature
    },
    autoCollect: {
        label: 'Auto-Collect',
        category: 'items',
        gating: 'stat_acumen >= 10 OR ability_commerce >= 5',
        requiresAbility: { commerce: 5 },
        requiresStat: { acumen: 10 },
        requiresWarehouse: false,
        requiresFactory: false,
        implemented: false // Canon §6.1 - Future feature
    },
    autoStore: {
        label: 'Auto-Store',
        category: 'items',
        gating: 'requiresWarehouse AND stat_acumen >= 15',
        requiresAbility: null,
        requiresStat: { acumen: 15 },
        requiresWarehouse: true,
        requiresFactory: false,
        implemented: false // Canon §6.2 - Future feature
    },
    autoSell: {
        label: 'Auto-Sell',
        category: 'items',
        gating: 'ability_commerce >= 10 AND stat_acumen >= 20',
        requiresAbility: { commerce: 10 },
        requiresStat: { acumen: 20 },
        requiresWarehouse: false,
        requiresFactory: false,
        implemented: false // Future feature
    },
    autoDeliver: {
        label: 'Auto-Deliver',
        category: 'factory',
        gating: 'requiresFactory AND stat_ingenuity >= 15 AND ability_crafting >= 10',
        requiresAbility: { crafting: 10 },
        requiresStat: { ingenuity: 15 },
        requiresWarehouse: false,
        requiresFactory: true,
        implemented: false // Canon §6.3 - Future feature
    },
    autoCraft: {
        label: 'Auto-Craft',
        category: 'factory',
        gating: 'requiresFactory AND stat_ingenuity >= 20 AND ability_crafting >= 15',
        requiresAbility: { crafting: 15 },
        requiresStat: { ingenuity: 20 },
        requiresWarehouse: false,
        requiresFactory: true,
        implemented: false // Canon §6.4 - Future feature
    },
    autoCraftLoop: {
        label: 'Auto-Craft Loop',
        category: 'factory',
        gating: 'requiresFactory AND stat_ingenuity >= 25 AND ability_crafting >= 20',
        requiresAbility: { crafting: 20 },
        requiresStat: { ingenuity: 25 },
        requiresWarehouse: false,
        requiresFactory: true,
        implemented: false // Canon §6.4 - Future feature
    }
};

export default class AutomationWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        
        // Path/Loop state
        this.allPlayerPaths = [];
        this.selectedPathId = null;
        this.isPathExecuting = false;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        this.pathPreviewData = null;
        
        // Toggle states (loaded from widget_config)
        this.toggleStates = {};
        
        // Player stats/abilities (for gating)
        this.playerStats = {};
        this.hasWarehouse = false;
        this.inFactoryRoom = false;
        
        // Execution tracking
        this.executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: 0,
            isLooping: false,
            loopCount: 0,
            isActive: false
        };
        
        // Room position tracking
        this.currentRoomPosForAutoPath = null;
        this.currentMapIdForAutoPath = null;
    }
    
    init() {
        super.init();
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-fullwidth';
        root.setAttribute('data-widget', 'automation');
        root.id = 'automationWidget';
        
        // Header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Automation';
        root.appendChild(header);
        
        // Content
        const content = document.createElement('div');
        content.className = 'widget-content';
        
        // Path/Loop selection section - HIDDEN (kept in code for future popup implementation)
        // const pathSection = this.renderPathSelection();
        // content.appendChild(pathSection);
        
        // Control buttons - HIDDEN (kept in code for future use)
        // const controlsSection = this.renderControls();
        // content.appendChild(controlsSection);
        
        // Toggle settings section
        const togglesSection = this.renderToggleSettings();
        content.appendChild(togglesSection);
        
        // Execution status panel
        const statusSection = this.renderStatusPanel();
        content.appendChild(statusSection);
        
        root.appendChild(content);
        return root;
    }
    
    /**
     * Render path/loop selection section
     */
    renderPathSelection() {
        const section = document.createElement('div');
        section.className = 'widget-section';
        
        const label = document.createElement('label');
        label.className = 'widget-section-title';
        label.textContent = 'Path/Loop:';
        label.style.fontSize = '13px'; // Increased font size
        section.appendChild(label);
        
        const select = document.createElement('select');
        select.id = 'pathLoopSelect';
        select.className = 'widget-select';
        select.style.fontSize = '13px'; // Increased font size
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select Path/Loop...';
        select.appendChild(placeholder);
        section.appendChild(select);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'deletePathBtn';
        deleteBtn.className = 'widget-btn widget-btn-danger';
        deleteBtn.textContent = 'Delete Path';
        deleteBtn.style.fontSize = '12px'; // Increased font size
        deleteBtn.disabled = true;
        section.appendChild(deleteBtn);
        
        return section;
    }
    
    /**
     * Render control buttons
     */
    renderControls() {
        const container = document.createElement('div');
        container.className = 'widget-btn-group';
        
        const startBtn = document.createElement('button');
        startBtn.id = 'startPathBtn';
        startBtn.className = 'widget-btn widget-btn-primary';
        startBtn.textContent = 'Start';
        startBtn.style.fontSize = '12px'; // Increased font size
        startBtn.disabled = true;
        container.appendChild(startBtn);
        
        const stopBtn = document.createElement('button');
        stopBtn.id = 'stopPathBtn';
        stopBtn.className = 'widget-btn widget-btn-danger';
        stopBtn.textContent = 'Stop';
        stopBtn.style.fontSize = '12px'; // Increased font size
        stopBtn.style.display = 'none';
        container.appendChild(stopBtn);
        
        const continueBtn = document.createElement('button');
        continueBtn.id = 'continuePathBtn';
        continueBtn.className = 'widget-btn widget-btn-primary';
        continueBtn.textContent = 'Continue';
        continueBtn.style.fontSize = '12px'; // Increased font size
        continueBtn.style.display = 'none';
        container.appendChild(continueBtn);
        
        return container;
    }
    
    /**
     * Render toggle settings section
     */
    renderToggleSettings() {
        const container = document.createElement('div');
        container.className = 'widget-section';
        
        const title = document.createElement('div');
        title.className = 'widget-section-title';
        title.textContent = 'Toggle Settings';
        title.style.fontSize = '14px';
        container.appendChild(title);
        
        // Create horizontal grid container for ALL toggles (no categories)
        // Grid designed to fit all toggles in 2 rows
        const togglesGrid = document.createElement('div');
        togglesGrid.className = 'toggles-grid';
        togglesGrid.style.display = 'grid';
        // Calculate: 10 toggles total, 2 rows = 5 columns
        togglesGrid.style.gridTemplateColumns = 'repeat(5, 1fr)';
        togglesGrid.style.gap = '8px';
        togglesGrid.style.marginTop = '10px';
        
        // Add all toggles in flat list (no grouping)
        Object.entries(TOGGLE_CONFIG).forEach(([key, config]) => {
            const toggleCard = this.renderToggleCard(key, config);
            togglesGrid.appendChild(toggleCard);
        });
        
        container.appendChild(togglesGrid);
        
        return container;
    }
    
    /**
     * Render a single toggle card (framed container)
     * Compact size, toggle slider above label
     */
    renderToggleCard(key, config) {
        // Create framed card container (smaller, more compact)
        const card = document.createElement('div');
        card.className = 'toggle-card';
        card.setAttribute('data-toggle-key', key);
        card.style.padding = '6px';
        card.style.border = '1px solid #333';
        card.style.borderRadius = '4px';
        card.style.backgroundColor = '#0a0a0a';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.gap = '4px';
        card.style.minHeight = '60px';
        card.style.cursor = 'pointer';
        
        // Create toggle switch (canonical structure matching editor EXACTLY)
        // Structure MUST be: <label><input><span class="toggle-slider"></span><span class="toggle-label"></span></label>
        // The CSS selector .toggle-switch input:checked + .toggle-slider requires slider to be immediate sibling
        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'toggle-switch';
        toggleSwitch.setAttribute('data-toggle-key', key);
        toggleSwitch.style.display = 'flex';
        toggleSwitch.style.flexDirection = 'column';
        toggleSwitch.style.alignItems = 'center';
        toggleSwitch.style.gap = '4px';
        toggleSwitch.style.width = '100%';
        
        // Hidden checkbox input (MUST be first child for CSS selector to work)
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `toggle_${key}`;
        checkbox.setAttribute('data-toggle-key', key);
        checkbox.checked = false;
        checkbox.disabled = false;
        toggleSwitch.appendChild(checkbox);
        
        // Toggle slider (MUST be immediate sibling after checkbox for CSS selector to work)
        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggleSwitch.appendChild(slider);
        
        // Label text (below slider, clearly visible)
        const label = document.createElement('span');
        label.className = 'toggle-label';
        label.textContent = config.label;
        label.style.textAlign = 'center';
        label.style.wordWrap = 'break-word';
        label.style.lineHeight = '1.2';
        label.style.fontSize = '11px'; // Smaller font
        toggleSwitch.appendChild(label);
        
        card.appendChild(toggleSwitch);
        
        // Status indicator (only show if locked, not for "Coming Soon")
        // Positioned at bottom of card with margin
        const statusSpan = document.createElement('span');
        statusSpan.className = 'toggle-status';
        statusSpan.setAttribute('data-status-key', key);
        statusSpan.style.fontSize = '9px';
        statusSpan.style.color = '#888';
        statusSpan.style.textAlign = 'center';
        statusSpan.style.marginTop = 'auto'; // Push to bottom
        statusSpan.style.marginBottom = '2px'; // Small gap from bottom
        statusSpan.style.minHeight = '12px'; // Reserve space but may be empty
        card.appendChild(statusSpan);
        
        // Tooltip for requirements
        card.title = this.getToggleTooltip(config);
        
        // Make entire card clickable (but don't interfere with toggle switch clicks)
        card.addEventListener('click', (e) => {
            // Only handle clicks on card itself or status span, not on toggle switch
            if (e.target === card || e.target === statusSpan) {
                e.stopPropagation();
                const checkbox = card.querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.disabled) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        
        return card;
    }
    
    /**
     * Render status panel
     */
    renderStatusPanel() {
        const panel = document.createElement('div');
        panel.id = 'automationStatus';
        panel.className = 'widget-section';
        panel.style.display = 'none';
        
        const title = document.createElement('div');
        title.className = 'widget-section-title';
        title.textContent = 'Execution Status';
        title.style.fontSize = '14px'; // Increased font size
        panel.appendChild(title);
        
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '10px';
        
        // Rooms visited
        const roomsLabel = document.createElement('div');
        roomsLabel.className = 'widget-stat-label';
        roomsLabel.textContent = 'Rooms Visited:';
        roomsLabel.style.fontSize = '13px'; // Increased font size
        grid.appendChild(roomsLabel);
        
        const roomsValue = document.createElement('div');
        roomsValue.id = 'totalRoomsVisited';
        roomsValue.className = 'widget-stat-value';
        roomsValue.textContent = '0';
        roomsValue.style.fontSize = '13px'; // Increased font size
        grid.appendChild(roomsValue);
        
        // Position
        const posLabel = document.createElement('div');
        posLabel.className = 'widget-stat-label';
        posLabel.textContent = 'Position:';
        posLabel.style.fontSize = '13px'; // Increased font size
        grid.appendChild(posLabel);
        
        const posValue = document.createElement('div');
        posValue.id = 'pathPosition';
        posValue.className = 'widget-stat-value';
        posValue.textContent = '0/0';
        posValue.style.fontSize = '13px'; // Increased font size
        grid.appendChild(posValue);
        
        // Loop counter (hidden by default)
        const loopContainer = document.createElement('div');
        loopContainer.id = 'loopCounterContainer';
        loopContainer.style.display = 'none';
        loopContainer.style.gridColumn = '1 / -1';
        loopContainer.style.marginTop = '10px';
        loopContainer.style.paddingTop = '10px';
        loopContainer.style.borderTop = '1px solid #333';
        
        const loopLabel = document.createElement('div');
        loopLabel.className = 'widget-stat-label';
        loopLabel.textContent = 'Loop Count:';
        loopLabel.style.fontSize = '13px'; // Increased font size
        loopContainer.appendChild(loopLabel);
        
        const loopValue = document.createElement('div');
        loopValue.id = 'loopCounter';
        loopValue.className = 'widget-stat-value';
        loopValue.textContent = '0';
        loopValue.style.fontSize = '1.4em'; // Increased from 1.2em
        loopValue.style.fontWeight = 'bold';
        loopValue.style.color = '#ff00ff';
        loopContainer.appendChild(loopValue);
        
        grid.appendChild(loopContainer);
        panel.appendChild(grid);
        
        return panel;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        this.setupEventListeners();
        this.loadToggleStates();
        this.loadAllPlayerPaths();
        
        // Listen for player stats updates
        this.game.messageBus.on('player:stats', (data) => {
            if (data.stats) {
                this.updatePlayerStats(data.stats);
            }
        });
        
        // Listen for room updates (for warehouse/factory detection)
        this.game.messageBus.on('room:update', (data) => {
            if (data.hasWarehouseDeed !== undefined) {
                this.hasWarehouse = data.hasWarehouseDeed;
            }
            if (data.room?.roomType) {
                this.inFactoryRoom = data.room.roomType === 'factory';
            }
            this.updateToggleStates();
        });
        
        // Listen for authentication
        const authHandler = () => {
            setTimeout(() => {
                this.loadAllPlayerPaths();
                this.loadToggleStates();
            }, 500);
        };
        this.game.messageBus.on('player:authenticated', authHandler);
        this._authHandler = authHandler;
        
        // Try to load immediately if already authenticated
        if (this.game.currentPlayerName) {
            setTimeout(() => {
                this.loadAllPlayerPaths();
                this.loadToggleStates();
            }, 500);
        }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const pathSelect = this.rootElement.querySelector('#pathLoopSelect');
        const startBtn = this.rootElement.querySelector('#startPathBtn');
        const stopBtn = this.rootElement.querySelector('#stopPathBtn');
        const continueBtn = this.rootElement.querySelector('#continuePathBtn');
        const deleteBtn = this.rootElement.querySelector('#deletePathBtn');
        
        if (pathSelect) {
            pathSelect.addEventListener('change', () => this.onPathSelectChange());
        }
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startPathExecution());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopPathExecution());
        }
        
        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.continuePathExecution());
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSelectedPath());
        }
        
        // Setup toggle listeners - simplified to avoid conflicts
        Object.keys(TOGGLE_CONFIG).forEach(key => {
            const checkbox = this.rootElement.querySelector(`#toggle_${key}`);
            if (!checkbox) return;
            
            // Primary handler: change event (fires when checkbox state actually changes)
            // This is the ONLY place we handle state changes to avoid conflicts
            checkbox.addEventListener('change', (e) => {
                const newState = e.target.checked;
                console.log(`[AutomationWidget] Checkbox ${key} changed to ${newState}`);
                
                // Update state immediately
                this.toggleStates[key] = newState;
                
                // Update UI (status, card border) without calling updateToggleStates which might reset checkbox
                const statusSpan = this.rootElement.querySelector(`[data-status-key="${key}"]`);
                const card = this.rootElement.querySelector(`.toggle-card[data-toggle-key="${key}"]`);
                
                if (statusSpan) {
                    statusSpan.textContent = newState ? '[ON]' : '[OFF]';
                    statusSpan.style.color = newState ? '#00ff00' : '#888';
                }
                
                if (card) {
                    card.style.borderColor = newState ? '#00ff00' : '#333';
                }
                
                // Handle other logic (server save, etc.)
                this.handleToggleChange(key, newState);
            });
        });
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'paths:all') {
            this.handleAllPlayerPaths(msg);
        } else if (msg.type === 'paths:details') {
            this.handlePathDetails(msg);
        } else if (msg.type === 'pathSaved') {
            if (window.terminal) {
                window.terminal.addMessage(`Path "${msg.name}" saved successfully!`, 'info');
            }
        } else if (msg.type === 'pathDeleted') {
            this.handlePathDeleted(msg);
        } else if (msg.type === 'paths:executionStarted') {
            this.handlePathExecutionStarted(msg);
        } else if (msg.type === 'paths:executionResumed') {
            this.handlePathExecutionResumed(msg);
        } else if (msg.type === 'paths:executionComplete') {
            this.handlePathExecutionComplete(msg);
        } else if (msg.type === 'paths:executionStopped') {
            this.handlePathExecutionStopped(msg);
        } else if (msg.type === 'paths:executionFailed') {
            this.handlePathExecutionFailed(msg);
        } else if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomMovement(msg);
        } else if (msg.type === 'playerStats' && msg.stats) {
            this.updatePlayerStats(msg.stats);
        } else if (msg.type === 'widgetConfig') {
            this.loadToggleStatesFromConfig(msg.config);
        }
    }
    
    /**
     * Load toggle states from widget_config
     */
    loadToggleStates() {
        // Request widget config from server
        this.game.send({ type: 'getWidgetConfig' });
    }
    
    /**
     * Load toggle states from config object
     */
    loadToggleStatesFromConfig(config) {
        if (config && config.automation && config.automation.toggles) {
            this.toggleStates = config.automation.toggles;
        } else {
            this.toggleStates = {};
        }
        this.updateToggleUI();
    }
    
    /**
     * Save toggle states to widget_config
     */
    saveToggleStates() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        // Get current widget config
        this.game.send({ type: 'getWidgetConfig' });
        
        // We'll update it when we receive the response
        // For now, store locally and update on next getWidgetConfig response
        this._pendingToggleStates = { ...this.toggleStates };
    }
    
    /**
     * Update player stats for gating
     */
    updatePlayerStats(stats) {
        this.playerStats = {};
        
        // Extract stat and ability values
        Object.entries(stats).forEach(([key, statObj]) => {
            if (statObj && typeof statObj === 'object' && statObj.value !== undefined) {
                // Convert camelCase to snake_case for matching
                const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
                this.playerStats[`stat_${snakeKey}`] = statObj.value;
                this.playerStats[`ability_${snakeKey}`] = statObj.value;
            }
        });
        
        // Also check direct stat/ability keys
        Object.entries(stats).forEach(([key, value]) => {
            if (key.startsWith('stat_') || key.startsWith('ability_')) {
                if (typeof value === 'object' && value.value !== undefined) {
                    this.playerStats[key] = value.value;
                } else if (typeof value === 'number') {
                    this.playerStats[key] = value;
                }
            }
        });
        
        this.updateToggleStates();
    }
    
    /**
     * Check if toggle can be enabled based on player abilities/stats
     */
    canEnableToggle(toggleKey) {
        const config = TOGGLE_CONFIG[toggleKey];
        if (!config) return false;
        
        // Always available
        if (!config.gating) return true;
        
        // Check warehouse requirement
        if (config.requiresWarehouse && !this.hasWarehouse) return false;
        
        // Check factory requirement
        if (config.requiresFactory && !this.inFactoryRoom) return false;
        
        // Check ability requirements (OR logic - any ability meets requirement)
        if (config.requiresAbility) {
            let abilityMet = false;
            for (const [ability, minValue] of Object.entries(config.requiresAbility)) {
                const abilityKey = `ability_${ability}`;
                const currentValue = this.playerStats[abilityKey] || 0;
                if (currentValue >= minValue) {
                    abilityMet = true;
                    break;
                }
            }
            if (abilityMet) return true;
        }
        
        // Check stat requirements (OR logic - any stat meets requirement)
        if (config.requiresStat) {
            let statMet = false;
            for (const [stat, minValue] of Object.entries(config.requiresStat)) {
                const statKey = `stat_${stat}`;
                const currentValue = this.playerStats[statKey] || 0;
                if (currentValue >= minValue) {
                    statMet = true;
                    break;
                }
            }
            if (statMet) return true;
        }
        
        // If we have requirements but none were met
        if (config.requiresAbility || config.requiresStat) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Get tooltip text for toggle
     */
    getToggleTooltip(config) {
        if (!config.implemented) {
            return 'Coming Soon - Feature not yet implemented';
        }
        
        const requirements = [];
        
        if (config.requiresAbility) {
            for (const [ability, minValue] of Object.entries(config.requiresAbility)) {
                const abilityKey = `ability_${ability}`;
                const current = this.playerStats[abilityKey] || 0;
                const status = current >= minValue ? '✓' : '✗';
                requirements.push(`${status} ${ability}: ${current}/${minValue}`);
            }
        }
        
        if (config.requiresStat) {
            for (const [stat, minValue] of Object.entries(config.requiresStat)) {
                const statKey = `stat_${stat}`;
                const current = this.playerStats[statKey] || 0;
                const status = current >= minValue ? '✓' : '✗';
                requirements.push(`${status} ${stat}: ${current}/${minValue}`);
            }
        }
        
        if (config.requiresWarehouse) {
            requirements.push(`${this.hasWarehouse ? '✓' : '✗'} Warehouse Deed`);
        }
        
        if (config.requiresFactory) {
            requirements.push(`${this.inFactoryRoom ? '✓' : '✗'} Factory Room`);
        }
        
        return requirements.length > 0 ? requirements.join('\n') : 'No requirements';
    }
    
    /**
     * Update toggle UI based on current state and gating
     */
    updateToggleStates() {
        Object.entries(TOGGLE_CONFIG).forEach(([key, config]) => {
            const checkbox = this.rootElement.querySelector(`#toggle_${key}`);
            const statusSpan = this.rootElement.querySelector(`[data-status-key="${key}"]`);
            const toggleSwitch = this.rootElement.querySelector(`label[data-toggle-key="${key}"]`);
            const card = this.rootElement.querySelector(`.toggle-card[data-toggle-key="${key}"]`);
            
            if (!checkbox || !statusSpan || !toggleSwitch || !card) return;
            
            const canEnable = this.canEnableToggle(key);
            const isEnabled = this.toggleStates[key] === true;
            
            // Update checkbox state - sync with toggleStates
            // IMPORTANT: Only update if state differs to avoid interfering with user clicks
            if (checkbox.checked !== isEnabled) {
                checkbox.checked = isEnabled;
            }
            checkbox.disabled = false; // Always allow clicking for UI testing
            
            // Update status indicator (show state, but allow all toggles to be clickable)
            if (isEnabled) {
                statusSpan.textContent = '[ON]';
                statusSpan.style.color = '#00ff00';
                statusSpan.style.display = 'block';
            } else {
                statusSpan.textContent = '[OFF]';
                statusSpan.style.color = '#888';
                statusSpan.style.display = 'block';
            }
            
            // Update toggle switch and card styling (all toggles are clickable)
            toggleSwitch.style.opacity = '1';
            toggleSwitch.style.cursor = 'pointer';
            card.style.opacity = '1';
            card.style.cursor = 'pointer';
            card.style.borderColor = isEnabled ? '#00ff00' : '#333';
            
            // Optional: Show visual hint for locked/unimplemented (but still allow clicking)
            if (!canEnable && !isEnabled) {
                card.style.borderStyle = 'dashed';
            } else {
                card.style.borderStyle = 'solid';
            }
            
            // Update tooltip
            card.title = this.getToggleTooltip(config);
        });
    }
    
    /**
     * Update toggle UI (just visual, no gating check)
     */
    updateToggleUI() {
        Object.keys(TOGGLE_CONFIG).forEach(key => {
            const checkbox = this.rootElement.querySelector(`#toggle_${key}`);
            if (checkbox) {
                checkbox.checked = this.toggleStates[key] === true;
            }
        });
        this.updateToggleStates();
    }
    
    /**
     * Handle toggle change
     */
    handleToggleChange(key, checked) {
        const config = TOGGLE_CONFIG[key];
        if (!config) return;
        
        // Update state immediately
        this.toggleStates[key] = checked;
        
        // Ensure checkbox state matches (don't let updateToggleStates override it)
        const checkbox = this.rootElement.querySelector(`#toggle_${key}`);
        if (checkbox) {
            checkbox.checked = checked;
        }
        
        // Update status indicator and card styling (but don't override checkbox state)
        const statusSpan = this.rootElement.querySelector(`[data-status-key="${key}"]`);
        const card = this.rootElement.querySelector(`.toggle-card[data-toggle-key="${key}"]`);
        
        if (statusSpan) {
            if (checked) {
                statusSpan.textContent = '[ON]';
                statusSpan.style.color = '#00ff00';
                statusSpan.style.display = 'block';
            } else {
                statusSpan.textContent = '[OFF]';
                statusSpan.style.color = '#888';
                statusSpan.style.display = 'block';
            }
        }
        
        if (card) {
            card.style.borderColor = checked ? '#00ff00' : '#333';
        }
        
        // Log the change (even if not implemented)
        console.log(`[AutomationWidget] Toggle ${key} changed to ${checked}${!config.implemented ? ' (not implemented)' : ''}`);
        
        // Only save to server and show messages if toggle is implemented and can be enabled
        if (config.implemented) {
            // Check if can enable (only show warning, don't prevent toggle)
            if (checked && !this.canEnableToggle(key)) {
                if (window.terminal) {
                    window.terminal.addMessage(`Note: ${config.label} is enabled but requirements not met.`, 'warning');
                }
            }
            
            // Special handling for auto-harvest (send to server immediately)
            if (key === 'autoHarvest' && this.isPathExecuting) {
                // Auto-harvest state is sent with path execution, not separately
            }
            
            // Save to server (only for implemented toggles)
            this.saveToggleStatesToServer();
        } else {
            // For unimplemented toggles, just show a console message
            console.log(`[AutomationWidget] Toggle ${key} is not yet implemented`);
        }
    }
    
    /**
     * Save toggle states to server via widget_config
     */
    saveToggleStatesToServer() {
        // Get current config first, then update
        this.game.send({ 
            type: 'updateWidgetConfig',
            config: {
                automation: {
                    toggles: { ...this.toggleStates }
                }
            }
        });
    }
    
    /**
     * Load all player paths
     */
    loadAllPlayerPaths() {
        const ws = this.game.getWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            this.game.send({ type: 'getAllPlayerPaths' });
        }
    }
    
    /**
     * Handle all player paths from server
     */
    handleAllPlayerPaths(data) {
        this.allPlayerPaths = data.paths || [];
        this.populatePathDropdown();
    }
    
    /**
     * Populate path dropdown
     */
    populatePathDropdown() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        if (!dropdown) return;
        
        dropdown.innerHTML = '<option value="">Select Path/Loop...</option>';
        
        this.allPlayerPaths.forEach(path => {
            const option = document.createElement('option');
            option.value = path.id;
            const typeLabel = path.path_type === 'loop' ? '[Loop]' : '[Path]';
            option.textContent = `${typeLabel} ${path.name} (Map: ${path.map_id})`;
            dropdown.appendChild(option);
        });
        
        this.updateDeletePathButton();
    }
    
    /**
     * Handle path selection change
     */
    onPathSelectChange() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        const startBtn = this.rootElement.querySelector('#startPathBtn');
        
        if (!dropdown || !startBtn) return;
        
        this.selectedPathId = dropdown.value ? parseInt(dropdown.value) : null;
        startBtn.disabled = !this.selectedPathId || this.isPathExecuting;
        this.updateDeletePathButton();
        
        if (this.selectedPathId && !this.isPathExecuting) {
            this.game.send({ type: 'getPathDetails', pathId: this.selectedPathId });
        }
    }
    
    /**
     * Update delete path button
     */
    updateDeletePathButton() {
        const deleteBtn = this.rootElement.querySelector('#deletePathBtn');
        if (!deleteBtn) return;
        deleteBtn.disabled = !this.selectedPathId || this.isPathExecuting;
    }
    
    /**
     * Delete selected path
     */
    deleteSelectedPath() {
        if (!this.selectedPathId) return;
        
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        if (!selectedPath) return;
        
        const pathType = selectedPath.path_type === 'loop' ? 'Loop' : 'Path';
        if (window.terminal) {
            window.terminal.addMessage(`${pathType} "${selectedPath.name}" deleted.`, 'info');
        }
        
        this.game.send({ type: 'deletePath', pathId: this.selectedPathId });
    }
    
    /**
     * Handle path details
     */
    handlePathDetails(data) {
        if (data.path && data.steps) {
            this.pathPreviewData = {
                path: data.path,
                steps: data.steps,
                playerRooms: data.steps.map(step => ({
                    roomId: step.roomId,
                    roomName: step.roomName,
                    x: step.x,
                    y: step.y,
                    direction: step.direction,
                    mapId: step.mapId
                }))
            };
            
            if (this.executionTracking.isActive && this.executionTracking.totalPathSteps === 0) {
                this.executionTracking.totalPathSteps = data.steps.length;
                this.updateAutomationStatus();
            }
        }
    }
    
    /**
     * Handle path deleted
     */
    handlePathDeleted(data) {
        if (this.selectedPathId === data.pathId) {
            this.selectedPathId = null;
            const dropdown = this.rootElement.querySelector('#pathLoopSelect');
            if (dropdown) dropdown.value = '';
            this.updateDeletePathButton();
        }
        
        if (window.terminal) {
            window.terminal.addMessage('Path deleted successfully.', 'info');
        }
    }
    
    /**
     * Start path execution
     */
    startPathExecution() {
        if (!this.selectedPathId) {
            if (window.terminal) {
                window.terminal.addMessage('Please select a path or loop first.', 'error');
            }
            return;
        }
        
        if (this.isPathExecuting && !this.isPathPaused) {
            if (window.terminal) {
                window.terminal.addMessage('Path/Loop execution is already active.', 'error');
            }
            return;
        }
        
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        const isLoop = selectedPath && selectedPath.path_type === 'loop';
        
        if (selectedPath && (!this.pathPreviewData || !this.pathPreviewData.playerRooms)) {
            this.game.send({ type: 'getPathDetails', pathId: this.selectedPathId });
        }
        
        // Use auto-harvest toggle state for loops
        const autoHarvestEnabled = isLoop ? (this.toggleStates.autoHarvest === true) : false;
        
        this.game.send({ 
            type: 'startPathExecution', 
            pathId: this.selectedPathId,
            autoHarvestEnabled: autoHarvestEnabled
        });
    }
    
    /**
     * Stop path execution
     */
    stopPathExecution() {
        if (!this.isPathExecuting) return;
        
        const mapWidget = this.game?.widgetManager?.widgets?.get('map');
        if (mapWidget && this.currentRoomPosForAutoPath && this.currentMapIdForAutoPath) {
            const currentRoom = mapWidget.mapRooms?.find(r => 
                r.mapId === this.currentMapIdForAutoPath && 
                r.x === this.currentRoomPosForAutoPath.x && 
                r.y === this.currentRoomPosForAutoPath.y
            );
            
            if (currentRoom) {
                this.pausedPathRoomId = currentRoom.id;
                this.isPathPaused = true;
            }
        } else {
            this.isPathPaused = true;
        }
        
        this.game.send({ type: 'stopPathExecution' });
    }
    
    /**
     * Continue path execution
     */
    continuePathExecution() {
        if (!this.isPathPaused || !this.selectedPathId) {
            if (window.terminal) {
                window.terminal.addMessage('No paused path to continue.', 'error');
            }
            return;
        }
        
        if (this.pausedPathRoomId) {
            const mapWidget = this.game?.widgetManager?.widgets?.get('map');
            if (!mapWidget || !this.currentRoomPosForAutoPath || !this.currentMapIdForAutoPath) {
                if (window.terminal) {
                    window.terminal.addMessage('Cannot continue: Current room not found.', 'error');
                }
                this.isPathPaused = false;
                this.pausedPathRoomId = null;
                this.updatePathExecutionUI();
                return;
            }
            
            const currentRoom = mapWidget.mapRooms?.find(r => 
                r.mapId === this.currentMapIdForAutoPath && 
                r.x === this.currentRoomPosForAutoPath.x && 
                r.y === this.currentRoomPosForAutoPath.y
            );
            
            if (!currentRoom || currentRoom.id !== this.pausedPathRoomId) {
                if (window.terminal) {
                    window.terminal.addMessage('Cannot continue: You have moved from where you stopped. Please restart the path.', 'error');
                }
                this.isPathPaused = false;
                this.pausedPathRoomId = null;
                this.updatePathExecutionUI();
                return;
            }
        }
        
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        this.game.send({ type: 'continuePathExecution', pathId: this.selectedPathId });
    }
    
    /**
     * Handle path execution started
     */
    handlePathExecutionStarted(data) {
        this.isPathExecuting = true;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        if (selectedPath) {
            const isLooping = selectedPath.path_type === 'loop';
            
            let totalSteps = 0;
            if (data.stepCount) {
                totalSteps = data.stepCount;
            } else if (this.pathPreviewData && this.pathPreviewData.steps) {
                totalSteps = this.pathPreviewData.steps.length;
            } else if (this.pathPreviewData && this.pathPreviewData.playerRooms) {
                totalSteps = this.pathPreviewData.playerRooms.length;
            }
            
            this.executionTracking = {
                totalRoomsVisited: 0,
                currentPathStep: 0,
                totalPathSteps: totalSteps,
                isLooping: isLooping,
                loopCount: 1,
                isActive: true
            };
            
            this.showAutomationStatus();
        }
        
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution resumed
     */
    handlePathExecutionResumed(data) {
        this.isPathExecuting = true;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        this.executionTracking.isActive = true;
        this.showAutomationStatus();
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution complete
     */
    handlePathExecutionComplete(data) {
        if (this.executionTracking.isLooping) {
            this.executionTracking.loopCount++;
            this.executionTracking.totalRoomsVisited = 0;
            this.executionTracking.currentPathStep = 0;
            this.updateAutomationStatus();
        } else {
            this.executionTracking.totalRoomsVisited = this.executionTracking.totalPathSteps;
            this.updateAutomationStatus();
            this.isPathExecuting = false;
            this.executionTracking.isActive = false;
            this.updatePathExecutionUI();
            
            setTimeout(() => {
                this.hideAutomationStatus();
            }, 2000);
        }
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution stopped
     */
    handlePathExecutionStopped(data) {
        this.isPathExecuting = false;
        this.executionTracking.isActive = false;
        this.hideAutomationStatus();
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle path execution failed
     */
    handlePathExecutionFailed(data) {
        this.isPathExecuting = false;
        this.executionTracking.isActive = false;
        this.hideAutomationStatus();
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'error');
        }
    }
    
    
    /**
     * Handle room movement
     */
    handleRoomMovement(data) {
        if (data.room) {
            this.currentRoomPosForAutoPath = { x: data.room.x, y: data.room.y };
            this.currentMapIdForAutoPath = data.room.mapId;
            
            if (this.executionTracking.isActive && this.isPathExecuting) {
                this.executionTracking.totalRoomsVisited++;
                this.updatePathStepPosition();
            } else if (this.executionTracking.isActive && !this.isPathExecuting) {
                this.executionTracking.isActive = false;
            }
        }
    }
    
    /**
     * Update path step position
     */
    updatePathStepPosition() {
        if (!this.executionTracking.isActive) return;
        
        this.executionTracking.currentPathStep = Math.min(
            this.executionTracking.totalRoomsVisited,
            this.executionTracking.totalPathSteps
        );
        
        this.updateAutomationStatus();
    }
    
    /**
     * Update path execution UI
     */
    updatePathExecutionUI() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        const startBtn = this.rootElement.querySelector('#startPathBtn');
        const stopBtn = this.rootElement.querySelector('#stopPathBtn');
        const continueBtn = this.rootElement.querySelector('#continuePathBtn');
        
        if (!dropdown || !startBtn || !stopBtn || !continueBtn) return;
        
        if (this.isPathExecuting && !this.isPathPaused) {
            dropdown.disabled = true;
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            continueBtn.style.display = 'none';
        } else if (this.isPathPaused) {
            dropdown.disabled = true;
            startBtn.style.display = 'none';
            stopBtn.style.display = 'none';
            continueBtn.style.display = 'inline-block';
        } else {
            dropdown.disabled = false;
            startBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            continueBtn.style.display = 'none';
            startBtn.disabled = !this.selectedPathId;
        }
    }
    
    /**
     * Show automation status
     */
    showAutomationStatus() {
        const statusEl = this.rootElement.querySelector('#automationStatus');
        if (!statusEl) return;
        
        statusEl.style.display = 'block';
        this.updateAutomationStatus();
    }
    
    /**
     * Hide automation status
     */
    hideAutomationStatus() {
        const statusEl = this.rootElement.querySelector('#automationStatus');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
        
        this.executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: 0,
            isLooping: false,
            loopCount: 0,
            isActive: false
        };
    }
    
    /**
     * Update automation status display
     */
    updateAutomationStatus() {
        if (!this.executionTracking.isActive) return;
        
        const totalRoomsEl = this.rootElement.querySelector('#totalRoomsVisited');
        const pathPositionEl = this.rootElement.querySelector('#pathPosition');
        const loopCounterEl = this.rootElement.querySelector('#loopCounter');
        const loopCounterContainer = this.rootElement.querySelector('#loopCounterContainer');
        
        if (totalRoomsEl) {
            totalRoomsEl.textContent = this.executionTracking.totalRoomsVisited;
        }
        
        if (pathPositionEl) {
            if (this.executionTracking.totalPathSteps > 0) {
                if (this.executionTracking.isLooping) {
                    let currentStepInLoop;
                    if (this.executionTracking.totalRoomsVisited === 0) {
                        currentStepInLoop = 0;
                    } else {
                        currentStepInLoop = ((this.executionTracking.totalRoomsVisited - 1) % this.executionTracking.totalPathSteps) + 1;
                    }
                    pathPositionEl.textContent = `${currentStepInLoop}/${this.executionTracking.totalPathSteps}`;
                } else {
                    const currentStep = Math.min(this.executionTracking.totalRoomsVisited, this.executionTracking.totalPathSteps);
                    pathPositionEl.textContent = `${currentStep}/${this.executionTracking.totalPathSteps}`;
                }
            } else {
                pathPositionEl.textContent = '0/0';
            }
        }
        
        if (loopCounterEl && loopCounterContainer) {
            if (this.executionTracking.isLooping) {
                loopCounterContainer.style.display = 'block';
                loopCounterEl.textContent = this.executionTracking.loopCount;
            } else {
                loopCounterContainer.style.display = 'none';
            }
        }
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        if (this._authHandler) {
            this.game.messageBus.off('player:authenticated', this._authHandler);
        }
    }
}

