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
        gating: null, // No stat/ability requirements - only item prerequisites
        requiresAbility: null,
        requiresStat: null,
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
        gating: 'requiresWarehouse',
        requiresAbility: null,
        requiresStat: null, // Only warehouse deed required
        requiresWarehouse: true,
        requiresFactory: false,
        implemented: true // Canon §6.2 - Auto-store to warehouse
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
        this.lastSelectedPathId = null; // Track path changes
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
        
        // Auto-Store state
        this.autoStoreConfig = {
            available: false,
            warehouses: [],
            storableItems: [],
            currentSettings: null
        };
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
        
        // Toggle settings section (icon buttons at top)
        const togglesSection = this.renderToggleSettings();
        content.appendChild(togglesSection);
        
        // Flexible grid system for static info and interactive elements
        const gridContainer = this.renderGridSystem();
        content.appendChild(gridContainer);
        
        root.appendChild(content);
        return root;
    }
    
    /**
     * Render flexible grid system for static info and interactive elements
     */
    renderGridSystem() {
        const gridContainer = document.createElement('div');
        gridContainer.className = 'automation-grid-container';
        
        // Left column: Loaded Path (1/3 width)
        const leftColumn = document.createElement('div');
        leftColumn.className = 'automation-grid-left';
        leftColumn.style.display = 'flex';
        leftColumn.style.flexDirection = 'column';
        leftColumn.style.gap = '10px';
        
        const pathSelectCell = this.renderPathSelectCell();
        leftColumn.appendChild(pathSelectCell);
        
        gridContainer.appendChild(leftColumn);
        
        // Right column: Auto-Store configuration (2/3 width)
        const rightColumn = document.createElement('div');
        rightColumn.className = 'automation-grid-right';
        rightColumn.style.display = 'flex';
        rightColumn.style.flexDirection = 'column';
        rightColumn.style.gap = '10px';
        
        // Auto-Store configuration panel
        const autoStorePanel = this.renderAutoStorePanel();
        rightColumn.appendChild(autoStorePanel);
        
        gridContainer.appendChild(rightColumn);
        
        return gridContainer;
    }
    
    /**
     * Render path selection cell for grid
     */
    renderPathSelectCell() {
        const cell = document.createElement('div');
        cell.className = 'automation-grid-cell';
        cell.style.display = 'flex';
        cell.style.flexDirection = 'column';
        cell.style.gap = '6px';
        
        const label = document.createElement('label');
        label.className = 'automation-grid-label';
        label.textContent = 'Loaded Path:';
        label.style.fontSize = '12px';
        label.style.color = '#ffff00';
        label.style.fontWeight = 'bold';
        cell.appendChild(label);
        
        const select = document.createElement('select');
        select.id = 'pathLoopSelect';
        select.className = 'automation-grid-select';
        select.style.fontSize = '12px';
        select.style.padding = '4px';
        select.style.background = '#0a0a0a';
        select.style.border = '1px solid #333';
        select.style.borderRadius = '4px';
        select.style.color = '#00ff00';
        select.style.fontFamily = "'Courier New', monospace";
        
        // Default "None" option
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'None';
        select.appendChild(noneOption);
        
        cell.appendChild(select);
        
        // Step info row (horizontal: Step on left, Auto Steps on right)
        const stepInfoRow = document.createElement('div');
        stepInfoRow.style.display = 'flex';
        stepInfoRow.style.flexDirection = 'row';
        stepInfoRow.style.justifyContent = 'space-between';
        stepInfoRow.style.alignItems = 'flex-start';
        stepInfoRow.style.marginTop = '4px';
        cell.appendChild(stepInfoRow);
        
        // Left side: Step and Loops (vertical)
        const leftStepContainer = document.createElement('div');
        leftStepContainer.style.display = 'flex';
        leftStepContainer.style.flexDirection = 'column';
        leftStepContainer.style.gap = '2px';
        stepInfoRow.appendChild(leftStepContainer);
        
        // Step info display
        const stepInfo = document.createElement('div');
        stepInfo.id = 'pathStepInfo';
        stepInfo.className = 'automation-step-info';
        stepInfo.style.fontSize = '11px';
        stepInfo.style.color = '#00ff00';
        stepInfo.style.fontFamily = "'Courier New', monospace";
        stepInfo.textContent = 'Steps: 0';
        leftStepContainer.appendChild(stepInfo);
        
        // Loop counter display (hidden by default, shown when looping, appears under Step)
        const loopCounter = document.createElement('div');
        loopCounter.id = 'pathLoopCounter';
        loopCounter.className = 'automation-loop-counter';
        loopCounter.style.fontSize = '11px';
        loopCounter.style.color = '#ff00ff';
        loopCounter.style.fontFamily = "'Courier New', monospace";
        loopCounter.style.display = 'none';
        loopCounter.textContent = 'Loops: 0';
        leftStepContainer.appendChild(loopCounter);
        
        // Right side: Auto Steps (top right, aligned with Step)
        const autoStepsContainer = document.createElement('div');
        autoStepsContainer.id = 'autoStepsContainer';
        autoStepsContainer.style.display = 'none'; // Hidden until first auto step
        autoStepsContainer.style.flexDirection = 'column';
        autoStepsContainer.style.alignItems = 'flex-end';
        autoStepsContainer.style.fontSize = '11px';
        autoStepsContainer.style.fontFamily = "'Courier New', monospace";
        autoStepsContainer.style.lineHeight = '1.2';
        stepInfoRow.appendChild(autoStepsContainer);
        
        const autoStepsLabel = document.createElement('div');
        autoStepsLabel.style.display = 'flex';
        autoStepsLabel.style.flexDirection = 'column';
        autoStepsLabel.style.alignItems = 'center';
        autoStepsLabel.style.color = '#888';
        
        const autoLine1 = document.createElement('span');
        autoLine1.textContent = 'Auto';
        autoLine1.style.display = 'block';
        autoStepsLabel.appendChild(autoLine1);
        
        const autoLine2 = document.createElement('span');
        autoLine2.textContent = 'Steps:';
        autoLine2.style.display = 'block';
        autoStepsLabel.appendChild(autoLine2);
        
        autoStepsContainer.appendChild(autoStepsLabel);
        
        const totalStepsValue = document.createElement('div');
        totalStepsValue.id = 'totalAutoSteps';
        totalStepsValue.className = 'automation-stat-value';
        totalStepsValue.textContent = '0';
        totalStepsValue.style.color = '#00ffff';
        totalStepsValue.style.padding = '2px 6px';
        totalStepsValue.style.border = '1px solid #555';
        totalStepsValue.style.borderRadius = '3px';
        totalStepsValue.style.backgroundColor = '#1a1a1a';
        totalStepsValue.style.marginTop = '2px';
        totalStepsValue.style.minWidth = '20px';
        totalStepsValue.style.textAlign = 'center';
        autoStepsContainer.appendChild(totalStepsValue);
        
        return cell;
    }
    
    /**
     * Render auto-store configuration panel
     */
    renderAutoStorePanel() {
        const panel = document.createElement('div');
        panel.id = 'autoStorePanel';
        panel.className = 'automation-grid-cell auto-store-panel';
        panel.style.display = 'none'; // Hidden by default, shown when warehouse deed exists
        panel.style.flexDirection = 'column';
        panel.style.gap = '8px';
        panel.style.padding = '8px';
        panel.style.backgroundColor = '#0a0a0a';
        panel.style.border = '1px solid #333';
        panel.style.borderRadius = '4px';
        
        // Panel header
        const header = document.createElement('div');
        header.className = 'auto-store-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '4px';
        
        const title = document.createElement('span');
        title.textContent = 'Auto-Store';
        title.style.fontSize = '12px';
        title.style.color = '#ffff00';
        title.style.fontWeight = 'bold';
        header.appendChild(title);
        
        panel.appendChild(header);
        
        // Item to store
        const itemRow = document.createElement('div');
        itemRow.className = 'auto-store-row';
        itemRow.style.display = 'flex';
        itemRow.style.alignItems = 'center';
        itemRow.style.gap = '8px';
        
        const itemLabel = document.createElement('label');
        itemLabel.textContent = 'Item:';
        itemLabel.style.fontSize = '11px';
        itemLabel.style.color = '#888';
        itemLabel.style.minWidth = '55px';
        itemRow.appendChild(itemLabel);
        
        const itemSelect = document.createElement('select');
        itemSelect.id = 'autoStoreItemSelect';
        itemSelect.className = 'automation-grid-select';
        itemSelect.style.flex = '1';
        itemSelect.style.fontSize = '11px';
        itemSelect.style.padding = '3px';
        itemSelect.style.background = '#0a0a0a';
        itemSelect.style.border = '1px solid #333';
        itemSelect.style.borderRadius = '3px';
        itemSelect.style.color = '#00ff00';
        itemSelect.style.fontFamily = "'Courier New', monospace";
        
        const itemNoneOption = document.createElement('option');
        itemNoneOption.value = '';
        itemNoneOption.textContent = 'Select item...';
        itemSelect.appendChild(itemNoneOption);
        
        itemRow.appendChild(itemSelect);
        panel.appendChild(itemRow);
        
        // Warehouse to store in
        const warehouseRow = document.createElement('div');
        warehouseRow.className = 'auto-store-row';
        warehouseRow.style.display = 'flex';
        warehouseRow.style.alignItems = 'center';
        warehouseRow.style.gap = '8px';
        
        const warehouseLabel = document.createElement('label');
        warehouseLabel.textContent = 'Warehouse:';
        warehouseLabel.style.fontSize = '11px';
        warehouseLabel.style.color = '#888';
        warehouseLabel.style.minWidth = '55px';
        warehouseRow.appendChild(warehouseLabel);
        
        const warehouseSelect = document.createElement('select');
        warehouseSelect.id = 'autoStoreWarehouseSelect';
        warehouseSelect.className = 'automation-grid-select';
        warehouseSelect.style.flex = '1';
        warehouseSelect.style.fontSize = '11px';
        warehouseSelect.style.padding = '3px';
        warehouseSelect.style.background = '#0a0a0a';
        warehouseSelect.style.border = '1px solid #333';
        warehouseSelect.style.borderRadius = '3px';
        warehouseSelect.style.color = '#00ffff';
        warehouseSelect.style.fontFamily = "'Courier New', monospace";
        
        const warehouseNoneOption = document.createElement('option');
        warehouseNoneOption.value = '';
        warehouseNoneOption.textContent = 'Select warehouse...';
        warehouseSelect.appendChild(warehouseNoneOption);
        
        warehouseRow.appendChild(warehouseSelect);
        panel.appendChild(warehouseRow);
        
        // Min/Max inventory thresholds row
        const thresholdsRow = document.createElement('div');
        thresholdsRow.className = 'auto-store-row';
        thresholdsRow.style.display = 'flex';
        thresholdsRow.style.alignItems = 'center';
        thresholdsRow.style.gap = '8px';
        
        // Min inventory
        const minLabel = document.createElement('label');
        minLabel.textContent = 'Min:';
        minLabel.style.fontSize = '11px';
        minLabel.style.color = '#888';
        minLabel.title = 'Minimum quantity to keep in inventory (store when above this)';
        thresholdsRow.appendChild(minLabel);
        
        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.id = 'autoStoreMinInventory';
        minInput.min = '0';
        minInput.value = '0';
        minInput.style.width = '50px';
        minInput.style.fontSize = '11px';
        minInput.style.padding = '3px';
        minInput.style.background = '#0a0a0a';
        minInput.style.border = '1px solid #333';
        minInput.style.borderRadius = '3px';
        minInput.style.color = '#00ff00';
        minInput.style.fontFamily = "'Courier New', monospace";
        minInput.style.textAlign = 'center';
        thresholdsRow.appendChild(minInput);
        
        // Max inventory
        const maxLabel = document.createElement('label');
        maxLabel.textContent = 'Max:';
        maxLabel.style.fontSize = '11px';
        maxLabel.style.color = '#888';
        maxLabel.title = 'Maximum quantity to keep in inventory (stop storing when at this)';
        thresholdsRow.appendChild(maxLabel);
        
        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.id = 'autoStoreMaxInventory';
        maxInput.min = '0';
        maxInput.value = '10';
        maxInput.style.width = '50px';
        maxInput.style.fontSize = '11px';
        maxInput.style.padding = '3px';
        maxInput.style.background = '#0a0a0a';
        maxInput.style.border = '1px solid #333';
        maxInput.style.borderRadius = '3px';
        maxInput.style.color = '#00ff00';
        maxInput.style.fontFamily = "'Courier New', monospace";
        maxInput.style.textAlign = 'center';
        thresholdsRow.appendChild(maxInput);
        
        panel.appendChild(thresholdsRow);
        
        // Status/info row
        const statusRow = document.createElement('div');
        statusRow.id = 'autoStoreStatus';
        statusRow.className = 'auto-store-status';
        statusRow.style.fontSize = '10px';
        statusRow.style.color = '#666';
        statusRow.style.marginTop = '4px';
        statusRow.style.textAlign = 'center';
        statusRow.textContent = 'Configure auto-store settings above';
        panel.appendChild(statusRow);
        
        return panel;
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
     * Render toggle settings section - icon buttons horizontally at top
     */
    renderToggleSettings() {
        const container = document.createElement('div');
        container.className = 'widget-section';
        container.style.padding = '8px';
        container.style.borderBottom = '1px solid #333';
        
        // Create horizontal container for icon buttons
        const iconBar = document.createElement('div');
        iconBar.className = 'automation-icon-bar';
        iconBar.style.display = 'flex';
        iconBar.style.gap = '6px';
        iconBar.style.alignItems = 'center';
        iconBar.style.flexWrap = 'wrap';
        iconBar.style.justifyContent = 'flex-start';
        
        // Add all toggles as icon buttons
        Object.entries(TOGGLE_CONFIG).forEach(([key, config]) => {
            const iconBtn = this.renderToggleIcon(key, config);
            iconBar.appendChild(iconBtn);
        });
        
        container.appendChild(iconBar);
        
        return container;
    }
    
    /**
     * Get icon SVG path for a toggle key
     */
    getToggleIcon(key) {
        // Icon paths (SVG path data) for each toggle, or emoji for special cases
        const icons = {
            autoLoop: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
            autoHarvest: '🌿', // Use emoji instead of SVG
            autoAttune: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5M12 2v20',
            autoCollect: 'M19 13h-4v4h-2v-4H9v-2h4V7h2v4h4v2z',
            autoStore: 'M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C12.96 2.54 12.05 2 11 2 9.34 2 8 3.34 8 5c0 .35.07.69.18 1H6c-1.11 0-1.99.89-1.99 2L4 19c0 1.11.89 2 2 2h12c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 8h12v11H6V8z',
            autoSell: 'M7 18c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
            autoDeliver: 'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
            autoCraft: 'M19.36 2.72L20.78 4.14l-1.42 1.42L17.94 4.14l1.42-1.42zM11 10v2h-1v-2h1zm-1 5v-2h1v2h-1zm-4-5h2v1H6v-1zm5-5v1h-1V5h1zm-4 2.5l-1.42-1.42L4.14 4.14 2.72 5.56 4.14 6.97l1.42-1.42zm15 7.5l-1.42-1.42L17.94 15.5l-1.42 1.42 1.42 1.42 1.42-1.42zm-15 0l1.42 1.42L6.97 18.5l-1.42-1.42L4.14 17.08l1.42 1.42zM12 22c-5.52 0-10-4.48-10-10S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8z',
            autoCraftLoop: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01 0-.02 0 0h2c0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4H8l4-4v3c4.42 0 8 3.58 8 8 0 1.57-.45 3.03-1.24 4.26l-1.46-1.46c.45-.83.7-1.79.7-2.8z'
        };
        return icons[key] || null;
    }
    
    /**
     * Render a single toggle as an icon button
     */
    renderToggleIcon(key, config) {
        const iconBtn = document.createElement('button');
        iconBtn.className = 'widget-icon automation-toggle-icon';
        iconBtn.setAttribute('data-toggle-key', key);
        iconBtn.title = config.label + (config.implemented ? '' : ' (Coming Soon)');
        
        // Create SVG icon
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        
        const iconPath = this.getToggleIcon(key);
        if (iconPath) {
            // Check if it's an emoji (string with emoji) or SVG path
            if (iconPath.length <= 4 && /[\p{Emoji}]/u.test(iconPath)) {
                // It's an emoji - use text instead of SVG path
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', '12');
                text.setAttribute('y', '16');
                text.setAttribute('font-size', '16');
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', 'currentColor');
                text.textContent = iconPath;
                svg.appendChild(text);
            } else {
                // It's an SVG path
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill', 'currentColor');
                path.setAttribute('d', iconPath);
                svg.appendChild(path);
            }
        } else {
            // Fallback: use first letter of label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', '12');
            text.setAttribute('y', '16');
            text.setAttribute('font-size', '14');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', 'currentColor');
            text.textContent = config.label.charAt(0).toUpperCase();
            svg.appendChild(text);
        }
        
        iconBtn.appendChild(svg);
        
        // Click handler - special handling for autoLoop
        if (key === 'autoLoop') {
            // Left click handler
            iconBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.isPathExecuting) {
                    // Currently executing: pause/resume
                    if (this.isPathPaused) {
                        // Paused: resume
                        this.continuePathExecution();
                    } else {
                        // Running: pause
                        this.pausePathExecution();
                    }
                } else {
                    // Not executing: start path execution
                    if (this.selectedPathId) {
                        this.startPathExecution();
                    } else {
                        if (window.terminal) {
                            window.terminal.addMessage('Please select a path or loop first.', 'error');
                        }
                    }
                }
            });
            
            // Right click handler (for stop when paused)
            iconBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (this.isPathPaused) {
                    // Right-click when paused: stop
                    this.stopPathExecutionWithVisualFeedback(iconBtn);
                }
            });
        } else {
            // Other toggles: toggle state
            iconBtn.addEventListener('click', () => {
                const isEnabled = this.toggleStates[key] === true;
                const newState = !isEnabled;
                this.handleToggleChange(key, newState);
            });
        }
        
        return iconBtn;
    }
    
    /**
     * Render status panel (static info)
     */
    renderStatusPanel() {
        const panel = document.createElement('div');
        panel.id = 'automationStatus';
        panel.className = 'automation-grid-cell';
        panel.style.display = 'none';
        panel.style.flexDirection = 'column';
        panel.style.gap = '6px';
        
        const title = document.createElement('div');
        title.className = 'automation-grid-label';
        title.textContent = 'Execution Status';
        title.style.fontSize = '12px';
        title.style.color = '#ffff00';
        title.style.fontWeight = 'bold';
        panel.appendChild(title);
        
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '8px';
        
        // Rooms visited
        const roomsLabel = document.createElement('div');
        roomsLabel.className = 'automation-stat-label';
        roomsLabel.textContent = 'Rooms:';
        roomsLabel.style.fontSize = '11px';
        roomsLabel.style.color = '#888';
        grid.appendChild(roomsLabel);
        
        const roomsValue = document.createElement('div');
        roomsValue.id = 'totalRoomsVisited';
        roomsValue.className = 'automation-stat-value';
        roomsValue.textContent = '0';
        roomsValue.style.fontSize = '11px';
        roomsValue.style.color = '#00ff00';
        grid.appendChild(roomsValue);
        
        // Position
        const posLabel = document.createElement('div');
        posLabel.className = 'automation-stat-label';
        posLabel.textContent = 'Position:';
        posLabel.style.fontSize = '11px';
        posLabel.style.color = '#888';
        grid.appendChild(posLabel);
        
        const posValue = document.createElement('div');
        posValue.id = 'pathPosition';
        posValue.className = 'automation-stat-value';
        posValue.textContent = '0/0';
        posValue.style.fontSize = '11px';
        posValue.style.color = '#00ff00';
        grid.appendChild(posValue);
        
        // Loop counter (hidden by default)
        const loopContainer = document.createElement('div');
        loopContainer.id = 'loopCounterContainer';
        loopContainer.style.display = 'none';
        loopContainer.style.gridColumn = '1 / -1';
        loopContainer.style.marginTop = '6px';
        loopContainer.style.paddingTop = '6px';
        loopContainer.style.borderTop = '1px solid #333';
        
        const loopLabel = document.createElement('div');
        loopLabel.className = 'automation-stat-label';
        loopLabel.textContent = 'Loop Count:';
        loopLabel.style.fontSize = '11px';
        loopLabel.style.color = '#888';
        loopContainer.appendChild(loopLabel);
        
        const loopValue = document.createElement('div');
        loopValue.id = 'loopCounter';
        loopValue.className = 'automation-stat-value';
        loopValue.textContent = '0';
        loopValue.style.fontSize = '14px';
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
                // If player has warehouse deed, load auto-store config
                if (this.hasWarehouse) {
                    this.loadAutoStoreConfig();
                } else {
                    this.hideAutoStorePanel();
                }
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
        
        // Listen directly to messageBus for path execution events (backup to onMessage)
        this.game.messageBus.on('paths:executionStarted', (data) => {
            console.log('[AutomationWidget] Direct messageBus listener received paths:executionStarted:', data);
            this.handlePathExecutionStarted(data);
        });
        
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
        
        // Initialize Auto-Loop icon state
        this.updateAutoLoopIconState();
        
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
        
        // Icon buttons are handled in renderToggleIcon click handlers
        // No need for checkbox listeners anymore
        
        // Setup auto-store listeners
        this.setupAutoStoreListeners();
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
        } else if (msg.type === 'paths:executionStarted') {
            console.log('[AutomationWidget] onMessage received paths:executionStarted:', msg);
            this.handlePathExecutionStarted(msg);
        } else if (msg.type === 'paths:executionResumed') {
            this.handlePathExecutionResumed(msg);
        } else if (msg.type === 'paths:executionComplete') {
            this.handlePathExecutionComplete(msg);
        } else if (msg.type === 'paths:executionStopped') {
            this.handlePathExecutionStopped(msg);
        } else if (msg.type === 'paths:executionFailed') {
            this.handlePathExecutionFailed(msg);
        } else if (msg.type === 'autonav:complete' || msg.type === 'autoNavigationComplete') {
            // Auto-navigation complete - reset step counters since navigation steps don't count
            if (this.isPathExecuting && this.executionTracking && this.executionTracking.needsNavigation) {
                console.log('[AutomationWidget] ✅ Auto-navigation complete, starting path execution tracking');
                this.executionTracking.totalRoomsVisited = 0; // Reset counter - navigation steps don't count
                this.executionTracking.currentPathStep = 0;
                this.executionTracking.needsNavigation = false; // Navigation is done
                this.executionTracking.isActive = true; // Ensure tracking is active
                this.executionTracking.justReachedOrigin = true; // Flag to prevent incrementing on arrival at origin
                // Update display to show Step: 1/33 (we're at origin, which is step 1)
                this.updatePathStepInfo();
            }
        } else if (msg.type === 'paths:executionStarted') {
            // Handle case where path execution starts immediately (no navigation needed)
            // This might be a duplicate, but ensure isActive is set correctly
            if (this.isPathExecuting && this.executionTracking) {
                // If needsNavigation is false, ensure isActive is true
                if (!this.executionTracking.needsNavigation && !this.executionTracking.isActive) {
                    console.log('[AutomationWidget] ✅ Path execution started without navigation, activating tracking');
                    this.executionTracking.isActive = true;
                    this.updatePathStepInfo();
                }
            }
        } else if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomMovement(msg);
        } else if (msg.type === 'playerStats' && msg.stats) {
            this.updatePlayerStats(msg.stats);
        } else if (msg.type === 'widgetConfig') {
            this.loadToggleStatesFromConfig(msg.config);
        } else if (msg.type === 'autoStoreConfig') {
            this.handleAutoStoreConfig(msg);
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
            const iconBtn = this.rootElement.querySelector(`.automation-toggle-icon[data-toggle-key="${key}"]`);
            if (!iconBtn) return;
            
            // Special handling for autoLoop - don't use toggle state, use path selection
            if (key === 'autoLoop') {
                this.updateAutoLoopIconState();
                return;
            }
            
            const isEnabled = this.toggleStates[key] === true;
            const canEnable = this.canEnableToggle(key);
            
            // Update icon button active state (highlight/lowlight)
            if (isEnabled) {
                iconBtn.classList.add('active');
            } else {
                iconBtn.classList.remove('active');
            }
            
            // Optional: Show visual hint for locked/unimplemented
            if (!canEnable && !isEnabled) {
                iconBtn.style.opacity = '0.5';
            } else {
                iconBtn.style.opacity = '1';
            }
            
            // Update tooltip
            iconBtn.title = config.label + (config.implemented ? '' : ' (Coming Soon)') + '\n' + this.getToggleTooltip(config);
        });
    }
    
    /**
     * Update toggle UI (just visual, no gating check)
     */
    updateToggleUI() {
        // Icon buttons are updated via updateToggleStates
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
        
        // Update icon button active state
        const iconBtn = this.rootElement.querySelector(`.automation-toggle-icon[data-toggle-key="${key}"]`);
        if (iconBtn) {
            if (checked) {
                iconBtn.classList.add('active');
            } else {
                iconBtn.classList.remove('active');
            }
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
            
            // Special handling for auto-store - show/hide panel
            if (key === 'autoStore') {
                if (checked) {
                    // Load config and show panel
                    this.loadAutoStoreConfig();
                } else {
                    // Hide panel
                    this.hideAutoStorePanel();
                }
            }
            
            // Save to server (only for implemented toggles)
            this.saveToggleStatesToServer();
        } else {
            // For unimplemented toggles, just show a console message
            console.log(`[AutomationWidget] Toggle ${key} is not yet implemented`);
        }
        
        // Update all toggle states to refresh UI
        this.updateToggleStates();
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
        this.updateAutoLoopIconState();
    }
    
    /**
     * Populate path dropdown
     */
    populatePathDropdown() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        if (!dropdown) return;
        
        // Clear existing options except "None"
        dropdown.innerHTML = '<option value="">None</option>';
        
        // Add all paths/loops
        this.allPlayerPaths.forEach(path => {
            const option = document.createElement('option');
            option.value = path.id;
            const typeLabel = path.path_type === 'loop' ? '[Loop]' : '[Path]';
            option.textContent = `${typeLabel} ${path.name}`;
            dropdown.appendChild(option);
        });
        
        // Update Auto-Loop icon state based on selection
        this.updateAutoLoopIconState();
    }
    
    /**
     * Handle path selection change
     */
    onPathSelectChange() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        if (!dropdown) return;
        
        const newPathId = dropdown.value ? parseInt(dropdown.value) : null;
        const pathChanged = newPathId !== this.lastSelectedPathId;
        
        this.selectedPathId = newPathId;
        this.lastSelectedPathId = newPathId;
        
        // Update step info display
        this.updatePathStepInfo();
        
        // Update Auto-Loop icon state
        this.updateAutoLoopIconState();
        
        if (this.selectedPathId && !this.isPathExecuting) {
            this.game.send({ type: 'getPathDetails', pathId: this.selectedPathId });
        }
    }
    
    /**
     * Update path step info display
     */
    updatePathStepInfo() {
        const stepInfo = this.rootElement.querySelector('#pathStepInfo');
        const loopCounter = this.rootElement.querySelector('#pathLoopCounter');
        if (!stepInfo) return;
        
        if (!this.selectedPathId) {
            stepInfo.textContent = 'Steps: 0';
            if (loopCounter) loopCounter.style.display = 'none';
            return;
        }
        
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        if (!selectedPath) {
            stepInfo.textContent = 'Steps: 0';
            if (loopCounter) loopCounter.style.display = 'none';
            return;
        }
        
        // Get total steps from path preview data or execution tracking
        let totalSteps = 0;
        if (this.executionTracking && this.executionTracking.totalPathSteps > 0) {
            totalSteps = this.executionTracking.totalPathSteps;
        } else if (this.pathPreviewData && this.pathPreviewData.steps) {
            totalSteps = this.pathPreviewData.steps.length;
        }
        
        // Check if we should show current step (executing) or total steps (not executing)
        // isExecuting is true when: path is executing AND tracking exists AND tracking is active
        const isExecuting = this.isPathExecuting && 
                           this.executionTracking && 
                           this.executionTracking.isActive === true;
        
        // Debug: Log state when path is executing but display shows total steps
        if (this.isPathExecuting && !isExecuting) {
            console.warn('[AutomationWidget] ⚠️ Path executing but isExecuting=false:', {
                isPathExecuting: this.isPathExecuting,
                hasExecutionTracking: !!this.executionTracking,
                isActive: this.executionTracking?.isActive,
                needsNavigation: this.executionTracking?.needsNavigation
            });
        }
        
        if (isExecuting && totalSteps > 0) {
            // Show current step when executing (1-based: 1/34, 2/34, etc.)
            // totalRoomsVisited counts how many path steps we've completed
            // When at origin: totalRoomsVisited = 0 → show 1/34 (at starting room, step 1)
            // After first path move: totalRoomsVisited = 1 → show 2/34 (moved to second room, step 2)
            // After second path move: totalRoomsVisited = 2 → show 3/34 (moved to third room, step 3)
            // Note: totalRoomsVisited should be 0 when we first reach origin, then increment with each path step
            let currentStep = this.executionTracking.totalRoomsVisited + 1;
            
            // Ensure we don't show step 0 or negative steps
            if (currentStep < 1) {
                currentStep = 1;
            }
            
            if (this.executionTracking.isLooping && this.executionTracking.totalPathSteps > 0) {
                // For loops, wrap around when we exceed total steps
                if (currentStep > this.executionTracking.totalPathSteps) {
                    currentStep = ((this.executionTracking.totalRoomsVisited) % this.executionTracking.totalPathSteps) + 1;
                }
            } else {
                // For paths, cap at total steps
                currentStep = Math.min(currentStep, this.executionTracking.totalPathSteps);
            }
            
            stepInfo.textContent = `Step: ${currentStep}/${totalSteps}`;
            stepInfo.style.color = '#00ff00';
            
            // Show loop counter if looping
            if (this.executionTracking.isLooping && loopCounter) {
                loopCounter.style.display = 'block';
                loopCounter.textContent = `Loops: ${this.executionTracking.loopCount || 1}`;
            } else if (loopCounter) {
                loopCounter.style.display = 'none';
            }
        } else {
            // Show total steps when not executing
            stepInfo.textContent = `Steps: ${totalSteps}`;
            stepInfo.style.color = '#888';
            if (loopCounter) loopCounter.style.display = 'none';
        }
    }
    
    /**
     * Update total auto steps display
     */
    updateTotalAutoSteps() {
        const totalStepsEl = this.rootElement.querySelector('#totalAutoSteps');
        const autoStepsContainer = this.rootElement.querySelector('#autoStepsContainer');
        
        if (this.executionTracking && this.executionTracking.totalAutoSteps !== undefined) {
            // Show container when first step is taken (totalAutoSteps > 0)
            if (autoStepsContainer) {
                if (this.executionTracking.totalAutoSteps > 0) {
                    autoStepsContainer.style.display = 'flex';
                } else {
                    autoStepsContainer.style.display = 'none';
                }
            }
            
            // Update the value
            if (totalStepsEl) {
                totalStepsEl.textContent = this.executionTracking.totalAutoSteps.toString();
            }
        }
    }
    
    /**
     * Update Auto-Loop icon state based on path selection and execution state
     */
    updateAutoLoopIconState() {
        const autoLoopIcon = this.rootElement.querySelector('.automation-toggle-icon[data-toggle-key="autoLoop"]');
        if (!autoLoopIcon) return;
        
        const hasPathSelected = this.selectedPathId !== null;
        const isExecuting = this.isPathExecuting;
        const isPaused = this.isPathPaused;
        
        // Remove all state classes first
        autoLoopIcon.classList.remove('disabled', 'active', 'paused', 'stopping');
        
        if (!hasPathSelected) {
            // No path selected: disabled/lowlit
            autoLoopIcon.classList.add('disabled');
            autoLoopIcon.style.opacity = '0.3';
            autoLoopIcon.style.cursor = 'not-allowed';
            autoLoopIcon.title = 'Auto-Loop Execution - Select a path/loop first';
        } else if (isExecuting && !isPaused) {
            // Path executing: active/highlighted green (click to pause)
            autoLoopIcon.classList.add('active');
            autoLoopIcon.style.opacity = '1';
            autoLoopIcon.style.cursor = 'pointer';
            autoLoopIcon.title = 'Auto-Loop Execution - Running... Click to pause';
        } else if (isPaused) {
            // Path paused: yellow highlight (left click to resume, right click to stop)
            autoLoopIcon.classList.add('paused');
            autoLoopIcon.style.opacity = '1';
            autoLoopIcon.style.cursor = 'pointer';
            autoLoopIcon.title = 'Auto-Loop Execution - Paused... Left click to resume, Right click to stop';
        } else {
            // Path selected but not executing: enabled but not active
            autoLoopIcon.style.opacity = '1';
            autoLoopIcon.style.cursor = 'pointer';
            autoLoopIcon.title = 'Auto-Loop Execution - Click to start path/loop from current location';
        }
    }
    
    /**
     * Stop path execution with visual feedback (red flash)
     */
    stopPathExecutionWithVisualFeedback(iconBtn) {
        // Flash red briefly
        iconBtn.classList.add('stopping');
        iconBtn.classList.remove('paused', 'active');
        
        // Stop the path execution
        this.stopPathExecution();
        
        // Remove red flash after brief delay
        setTimeout(() => {
            iconBtn.classList.remove('stopping');
            this.updateAutoLoopIconState();
        }, 300);
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
            }
            
            // Update step info display
            this.updatePathStepInfo();
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
     * Start path execution (from Auto-Loop icon or resume)
     */
    startPathExecution() {
        if (!this.selectedPathId) {
            if (window.terminal) {
                window.terminal.addMessage('Please select a path or loop first.', 'error');
            }
            return;
        }
        
        // Check if path changed - if so, navigate to path first
        const pathChanged = this.selectedPathId !== this.lastSelectedPathId;
        if (pathChanged && this.isPathExecuting) {
            // Path changed while executing - stop current and navigate to new path
            this.stopPathExecution();
            this.lastSelectedPathId = this.selectedPathId;
            // Navigation will be handled by the path execution system
        }
        
        // If we're starting fresh (not resuming), fully reset execution tracking
        if (!this.isPathPaused) {
            // Fully reset execution tracking to start from beginning
            this.executionTracking = {
                totalRoomsVisited: 0,
                currentPathStep: 0,
                totalPathSteps: 0,
                isLooping: false,
                loopCount: 1,
                isActive: false,
                needsNavigation: false,
                originRoomId: null,
                justReachedOrigin: false,
                totalAutoSteps: 0 // Reset total auto steps when starting fresh
            };
        }
        
        if (this.isPathExecuting && !this.isPathPaused) {
            // Already executing and not paused - do nothing (shouldn't happen)
            return;
        }
        
        // Ensure we're not paused when starting
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        const isLoop = selectedPath && selectedPath.path_type === 'loop';
        
        if (selectedPath && (!this.pathPreviewData || !this.pathPreviewData.playerRooms)) {
            this.game.send({ type: 'getPathDetails', pathId: this.selectedPathId });
        }
        
        // Use auto-harvest toggle state for loops and paths
        const autoHarvestEnabled = this.toggleStates.autoHarvest === true;
        
        // Immediately update icon state optimistically (will be confirmed by server response)
        this.isPathExecuting = true;
        this.isPathPaused = false;
        this.updateAutoLoopIconState();
        
        this.game.send({ 
            type: 'startPathExecution', 
            pathId: this.selectedPathId,
            autoHarvestEnabled: autoHarvestEnabled
        });
    }
    
    /**
     * Pause path execution
     */
    pausePathExecution() {
        if (!this.isPathExecuting || this.isPathPaused) return;
        
        // Store current room position for pause
        const mapWidget = this.game?.widgetManager?.widgets?.get('map');
        if (mapWidget && this.currentRoomPosForAutoPath && this.currentMapIdForAutoPath) {
            const currentRoom = mapWidget.mapRooms?.find(r => 
                r.mapId === this.currentMapIdForAutoPath && 
                r.x === this.currentRoomPosForAutoPath.x && 
                r.y === this.currentRoomPosForAutoPath.y
            );
            
            if (currentRoom) {
                this.pausedPathRoomId = currentRoom.id;
            }
        }
        
        this.isPathPaused = true;
        this.game.send({ type: 'stopPathExecution', isPause: true });
        
        // Update UI
        this.updateAutoLoopIconState();
    }
    
    /**
     * Stop path execution (completely stop, not pause)
     */
    stopPathExecution() {
        // Reset all execution state so clicking play again starts from beginning
        this.isPathExecuting = false;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        // Fully reset execution tracking to ensure clean restart
        if (this.executionTracking) {
            this.executionTracking.isActive = false;
            this.executionTracking.totalRoomsVisited = 0;
            this.executionTracking.currentPathStep = 0;
            this.executionTracking.needsNavigation = false;
            this.executionTracking.justReachedOrigin = false;
            this.executionTracking.originRoomId = null;
            this.executionTracking.loopCount = 1; // Reset loop count when stopping
            this.executionTracking.totalAutoSteps = 0; // Reset total auto steps when stopping
            this.updateTotalAutoSteps();
        }
        
        // Update last selected path to current selection (so it starts from beginning)
        this.lastSelectedPathId = this.selectedPathId;
        
        // Send stop message (not pause) to fully clear server-side state
        this.game.send({ type: 'stopPathExecution', isPause: false });
        
        // Update UI
        this.updateAutoLoopIconState();
        this.updatePathStepInfo();
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
        
        // Resume execution - update state optimistically
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        this.isPathExecuting = true;
        
        // Immediately update icon state from yellow (paused) to green (active)
        this.updateAutoLoopIconState();
        
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
            
            const needsNavigation = data.needsNavigation === true;
            // Get origin room ID from path preview data, selected path, or server message
            let originRoomId = null;
            if (data.originRoomId) {
                // Server explicitly provides origin room ID
                originRoomId = data.originRoomId;
            } else if (this.pathPreviewData && this.pathPreviewData.steps && this.pathPreviewData.steps.length > 0) {
                originRoomId = this.pathPreviewData.steps[0].roomId;
            } else if (selectedPath && selectedPath.originRoomId) {
                originRoomId = selectedPath.originRoomId;
            }
            
            this.executionTracking = {
                totalRoomsVisited: 0,
                currentPathStep: 0, // 0-based, will display as 1/34 when execution starts
                totalPathSteps: totalSteps,
                isLooping: isLooping,
                loopCount: 1,
                isActive: !needsNavigation, // Only active if not navigating (if navigating, will be activated after autonav completes)
                needsNavigation: needsNavigation, // Track if we're navigating to origin
                originRoomId: originRoomId, // Store origin room ID to detect when we reach it
                justReachedOrigin: false, // Flag to prevent incrementing on the movement that reaches origin
                totalAutoSteps: 0 // Total automated steps (navigation + path steps)
            };
            
            console.log('[AutomationWidget] ✅ Path execution tracking initialized:', {
                needsNavigation: this.executionTracking.needsNavigation,
                isActive: this.executionTracking.isActive,
                totalPathSteps: this.executionTracking.totalPathSteps,
                isPathExecuting: this.isPathExecuting
            });
            
        } else {
            console.warn('[AutomationWidget] Path execution started but selectedPath not found:', this.selectedPathId);
            // Initialize executionTracking even if path not found, to prevent errors
            this.executionTracking = {
                totalRoomsVisited: 0,
                currentPathStep: 0,
                totalPathSteps: 0,
                isLooping: false,
                loopCount: 1,
                isActive: false,
                needsNavigation: false
            };
        }
        
        // Update UI - immediately show step 1/34 when starting (if not navigating)
        this.updateAutoLoopIconState();
        this.updatePathStepInfo(); // This should show "Step: 1/34" immediately (if active)
        this.updatePathExecutionUI();
        this.updateTotalAutoSteps(); // Initialize total auto steps display
        
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
        this.updateAutoLoopIconState();
        this.updatePathStepInfo();
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
            // Loop completed one iteration - increment loop count
            this.executionTracking.loopCount++;
            // Reset for next loop iteration
            this.executionTracking.totalRoomsVisited = 0;
            this.executionTracking.currentPathStep = 0;
            this.updateAutomationStatus();
            this.updatePathStepInfo(); // Update to show new loop count
            // Loops continue, so keep icon active
            this.updateAutoLoopIconState();
        } else {
            // Path (not loop) completed - fully stop execution
            this.executionTracking.totalRoomsVisited = this.executionTracking.totalPathSteps;
            this.isPathExecuting = false;
            this.isPathPaused = false;
            this.executionTracking.isActive = false;
            
            // Fully reset execution tracking for paths
            this.executionTracking.totalRoomsVisited = 0;
            this.executionTracking.currentPathStep = 0;
            this.executionTracking.needsNavigation = false;
            this.executionTracking.justReachedOrigin = false;
            this.executionTracking.originRoomId = null;
            
            // Update UI to reflect stopped state
            this.updateAutoLoopIconState();
            this.updatePathExecutionUI();
            this.updatePathStepInfo();
            this.updateTotalAutoSteps();
        }
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution stopped
     */
    handlePathExecutionStopped(data) {
        // Only clear paused state if we're not actually paused (i.e., this is a full stop)
        // If isPathPaused is true, we want to keep it paused
        if (!this.isPathPaused) {
            this.isPathExecuting = false;
            this.executionTracking.isActive = false;
        }
        
        this.updateAutoLoopIconState();
        this.updatePathStepInfo();
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
        this.updateAutoLoopIconState();
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
            // mapId might not be in room object, try mapName or get from map widget
            if (data.room.mapId) {
                this.currentMapIdForAutoPath = data.room.mapId;
            } else if (data.room.mapName) {
                // Try to get mapId from mapName via map widget
                const mapWidget = this.game?.widgetManager?.widgets?.get('map');
                if (mapWidget && mapWidget.mapData) {
                    const map = mapWidget.mapData.find(m => m.name === data.room.mapName);
                    if (map) {
                        this.currentMapIdForAutoPath = map.id;
                    }
                }
            }
            
            // Check if we're executing a path and should track this movement
            if (this.executionTracking && this.isPathExecuting) {
                // If we were navigating, check if we've reached the origin room
                // This is a fallback in case autonav:complete message wasn't received
                if (this.executionTracking.needsNavigation && !this.executionTracking.isActive && data.room) {
                    const currentRoomId = data.room.id;
                    const originRoomId = this.executionTracking.originRoomId;
                    
                    // If we're at the origin room, navigation is complete
                    if (originRoomId && currentRoomId === originRoomId) {
                        console.log('[AutomationWidget] ✅ Reached origin room, navigation complete, activating tracking');
                        this.executionTracking.needsNavigation = false;
                        this.executionTracking.isActive = true;
                        this.executionTracking.totalRoomsVisited = 0; // Reset counter - navigation steps don't count
                        this.executionTracking.currentPathStep = 0;
                        this.executionTracking.justReachedOrigin = true; // Flag to prevent incrementing on this movement
                        // Update display immediately to show Step: 1/33
                        this.updatePathStepInfo();
                        // Don't increment counter for this movement (we just reached origin, haven't started path yet)
                        return;
                    } else {
                        // Still navigating - count as auto step but not as path step
                        if (this.executionTracking.totalAutoSteps !== undefined) {
                            this.executionTracking.totalAutoSteps++;
                            this.updateTotalAutoSteps();
                        }
                        console.log('[AutomationWidget] ⚠️ Room movement - still navigating to origin:', {
                            currentRoomId: currentRoomId,
                            originRoomId: originRoomId,
                            needsNavigation: this.executionTracking.needsNavigation,
                            isActive: this.executionTracking.isActive,
                            totalAutoSteps: this.executionTracking.totalAutoSteps
                        });
                        return; // Don't count this movement as path step
                    }
                }
                
                // Only count steps if tracking is active and not in navigation phase
                if (this.executionTracking.isActive && !this.executionTracking.needsNavigation) {
                    // If we just reached the origin, don't increment on this movement
                    // The next movement (first path step) will be the first increment
                    if (this.executionTracking.justReachedOrigin) {
                        console.log('[AutomationWidget] Just reached origin, clearing flag - next movement will be step 1');
                        this.executionTracking.justReachedOrigin = false;
                        // Don't increment - we're at origin (step 1), haven't moved to first path step yet
                        this.updatePathStepInfo(); // Ensure display shows Step: 1/33
                        return;
                    }
                    
                    const currentRoomId = data.room?.id;
                    const originRoomId = this.executionTracking.originRoomId;
                    
                    // Check if this movement completes a loop iteration (for loops only)
                    const wasAtLastStep = this.executionTracking.isLooping && 
                                         this.executionTracking.totalRoomsVisited >= this.executionTracking.totalPathSteps - 1;
                    
                    // Increment counter for path steps
                    this.executionTracking.totalRoomsVisited++;
                    
                    // Increment total auto steps (includes both navigation and path steps)
                    if (this.executionTracking.totalAutoSteps !== undefined) {
                        this.executionTracking.totalAutoSteps++;
                        this.updateTotalAutoSteps();
                    }
                    
                    // If we just completed a loop iteration, increment loop count and reset step counter
                    if (this.executionTracking.isLooping && wasAtLastStep && 
                        this.executionTracking.totalRoomsVisited >= this.executionTracking.totalPathSteps) {
                        console.log('[AutomationWidget] ✅ Loop iteration complete, incrementing loop count');
                        this.executionTracking.loopCount++;
                        // Reset step counter for next loop iteration (but keep totalAutoSteps)
                        this.executionTracking.totalRoomsVisited = 0;
                        this.executionTracking.currentPathStep = 0;
                    }
                    console.log('[AutomationWidget] ✅ Room movement - incrementing step:', {
                        totalRoomsVisited: this.executionTracking.totalRoomsVisited,
                        currentPathStep: this.executionTracking.currentPathStep,
                        needsNavigation: this.executionTracking.needsNavigation,
                        isActive: this.executionTracking.isActive,
                        isPathExecuting: this.isPathExecuting,
                        currentRoomId: currentRoomId,
                        originRoomId: originRoomId
                    });
                    this.updatePathStepPosition();
                    this.updatePathStepInfo(); // Update step display
                } else {
                    console.log('[AutomationWidget] ⚠️ Room movement - skipping (still navigating):', {
                        needsNavigation: this.executionTracking.needsNavigation,
                        isActive: this.executionTracking.isActive,
                        totalRoomsVisited: this.executionTracking.totalRoomsVisited
                    });
                }
            } else {
                console.log('[AutomationWidget] ⚠️ Room movement - not tracking:', {
                    hasExecutionTracking: !!this.executionTracking,
                    isActive: this.executionTracking?.isActive,
                    isPathExecuting: this.isPathExecuting
                });
                if (this.executionTracking && this.executionTracking.isActive && !this.isPathExecuting) {
                    this.executionTracking.isActive = false;
                }
            }
        }
    }
    
    /**
     * Update path step position
     */
    updatePathStepPosition() {
        if (!this.executionTracking.isActive) return;
        
        // Step calculation is now done directly in updatePathStepInfo() using totalRoomsVisited
        // This function is kept for compatibility but doesn't need to calculate currentPathStep anymore
        this.updatePathStepInfo();
    }
    
    /**
     * Update path execution UI
     */
    updatePathExecutionUI() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        if (!dropdown) return;
        
        // Disable dropdown while executing
        dropdown.disabled = this.isPathExecuting;
    }
    
    /**
     * Show automation status
     */
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        if (this._authHandler) {
            this.game.messageBus.off('player:authenticated', this._authHandler);
        }
    }
    
    // ============================================================
    // Auto-Store Methods
    // ============================================================
    
    /**
     * Load auto-store configuration from server
     */
    loadAutoStoreConfig() {
        console.log('[AutomationWidget] Loading auto-store config...');
        const ws = this.game.getWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            this.game.send({ type: 'getAutoStoreConfig' });
        } else {
            console.warn('[AutomationWidget] WebSocket not open, cannot load auto-store config');
        }
    }
    
    /**
     * Handle auto-store configuration response from server
     */
    handleAutoStoreConfig(data) {
        console.log('[AutomationWidget] Received auto-store config:', data);
        
        this.autoStoreConfig = {
            available: data.available || false,
            warehouses: data.warehouses || [],
            storableItems: data.storableItems || [],
            currentSettings: data.currentSettings || null
        };
        
        console.log(`[AutomationWidget] Auto-store available: ${this.autoStoreConfig.available}, warehouses: ${this.autoStoreConfig.warehouses.length}, items: ${this.autoStoreConfig.storableItems.length}`);
        
        if (this.autoStoreConfig.available) {
            console.log('[AutomationWidget] Showing auto-store panel');
            this.showAutoStorePanel();
            this.populateAutoStoreDropdowns();
            if (this.autoStoreConfig.currentSettings) {
                this.loadAutoStoreSettings(this.autoStoreConfig.currentSettings);
            }
        } else {
            console.log('[AutomationWidget] Hiding auto-store panel (not available)');
            this.hideAutoStorePanel();
        }
    }
    
    /**
     * Show auto-store panel
     */
    showAutoStorePanel() {
        const panel = this.rootElement.querySelector('#autoStorePanel');
        console.log('[AutomationWidget] showAutoStorePanel - panel found:', !!panel);
        if (panel) {
            panel.style.display = 'flex';
            console.log('[AutomationWidget] Panel display set to flex');
        }
    }
    
    /**
     * Hide auto-store panel
     */
    hideAutoStorePanel() {
        const panel = this.rootElement.querySelector('#autoStorePanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }
    
    /**
     * Populate auto-store dropdowns with data
     */
    populateAutoStoreDropdowns() {
        // Populate item dropdown
        const itemSelect = this.rootElement.querySelector('#autoStoreItemSelect');
        if (itemSelect) {
            // Keep the first option (Select item...)
            itemSelect.innerHTML = '<option value="">Select item...</option>';
            
            for (const item of this.autoStoreConfig.storableItems) {
                const option = document.createElement('option');
                option.value = item.item_name;
                option.textContent = `${item.item_name} (${item.quantity})`;
                itemSelect.appendChild(option);
            }
        }
        
        // Populate warehouse dropdown
        const warehouseSelect = this.rootElement.querySelector('#autoStoreWarehouseSelect');
        if (warehouseSelect) {
            // Keep the first option (Select warehouse...)
            warehouseSelect.innerHTML = '<option value="">Select warehouse...</option>';
            
            for (const warehouse of this.autoStoreConfig.warehouses) {
                const option = document.createElement('option');
                option.value = warehouse.warehouse_location_key;
                option.textContent = warehouse.warehouse_name;
                warehouseSelect.appendChild(option);
            }
        }
    }
    
    /**
     * Load auto-store settings into UI
     */
    loadAutoStoreSettings(settings) {
        if (!settings) return;
        
        const itemSelect = this.rootElement.querySelector('#autoStoreItemSelect');
        const warehouseSelect = this.rootElement.querySelector('#autoStoreWarehouseSelect');
        const minInput = this.rootElement.querySelector('#autoStoreMinInventory');
        const maxInput = this.rootElement.querySelector('#autoStoreMaxInventory');
        
        if (itemSelect && settings.itemName) {
            itemSelect.value = settings.itemName;
        }
        if (warehouseSelect && settings.warehouseLocationKey) {
            warehouseSelect.value = settings.warehouseLocationKey;
        }
        if (minInput && settings.minInventory !== undefined) {
            minInput.value = settings.minInventory;
        }
        if (maxInput && settings.maxInventory !== undefined) {
            maxInput.value = settings.maxInventory;
        }
        
        this.updateAutoStoreStatus();
    }
    
    /**
     * Save auto-store settings to server
     */
    saveAutoStoreSettings() {
        const itemSelect = this.rootElement.querySelector('#autoStoreItemSelect');
        const warehouseSelect = this.rootElement.querySelector('#autoStoreWarehouseSelect');
        const minInput = this.rootElement.querySelector('#autoStoreMinInventory');
        const maxInput = this.rootElement.querySelector('#autoStoreMaxInventory');
        
        const settings = {
            itemName: itemSelect?.value || null,
            warehouseLocationKey: warehouseSelect?.value || null,
            minInventory: parseInt(minInput?.value, 10) || 0,
            maxInventory: parseInt(maxInput?.value, 10) || 10
        };
        
        // Save to widget config
        this.game.send({
            type: 'updateWidgetConfig',
            config: {
                automation: {
                    autoStore: settings
                }
            }
        });
        
        this.updateAutoStoreStatus();
    }
    
    /**
     * Update auto-store status display
     */
    updateAutoStoreStatus() {
        const statusEl = this.rootElement.querySelector('#autoStoreStatus');
        if (!statusEl) return;
        
        const itemSelect = this.rootElement.querySelector('#autoStoreItemSelect');
        const warehouseSelect = this.rootElement.querySelector('#autoStoreWarehouseSelect');
        const minInput = this.rootElement.querySelector('#autoStoreMinInventory');
        const maxInput = this.rootElement.querySelector('#autoStoreMaxInventory');
        
        const itemName = itemSelect?.value;
        const warehouseKey = warehouseSelect?.value;
        const min = parseInt(minInput?.value, 10) || 0;
        const max = parseInt(maxInput?.value, 10) || 10;
        
        if (!itemName || !warehouseKey) {
            statusEl.textContent = 'Configure auto-store settings above';
            statusEl.style.color = '#666';
        } else if (min >= max) {
            statusEl.textContent = 'Min must be less than Max';
            statusEl.style.color = '#ff4444';
        } else {
            statusEl.textContent = `Store ${itemName} when inventory > ${min}`;
            statusEl.style.color = '#00ff00';
        }
    }
    
    /**
     * Setup auto-store event listeners
     */
    setupAutoStoreListeners() {
        const itemSelect = this.rootElement.querySelector('#autoStoreItemSelect');
        const warehouseSelect = this.rootElement.querySelector('#autoStoreWarehouseSelect');
        const minInput = this.rootElement.querySelector('#autoStoreMinInventory');
        const maxInput = this.rootElement.querySelector('#autoStoreMaxInventory');
        
        if (itemSelect) {
            itemSelect.addEventListener('change', () => this.saveAutoStoreSettings());
        }
        if (warehouseSelect) {
            warehouseSelect.addEventListener('change', () => this.saveAutoStoreSettings());
        }
        if (minInput) {
            minInput.addEventListener('change', () => this.saveAutoStoreSettings());
        }
        if (maxInput) {
            maxInput.addEventListener('change', () => this.saveAutoStoreSettings());
        }
    }
}

