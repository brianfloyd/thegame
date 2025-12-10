/**
 * Widget Manager
 * 
 * Unified Alpine.js component for managing widget visibility and state.
 * Controls the widget toggle bar and 4-slot widget rotation.
 */

import { 
    WIDGETS,
    getWidgetById,
    getToggleableWidgets,
    getAvailableWidgets,
    getDefaultActiveWidgets,
    isWidgetAvailable
} from './widget_registry.js';

// Maximum number of active widgets in the 4-slot grid
const MAX_ACTIVE_WIDGETS = 4;

// Local storage key for persisting widget state
const STORAGE_KEY = 'widgetManager_activeWidgets';

/**
 * Widget Manager Alpine.js component
 * Usage: x-data="widgetManager()"
 */
export function widgetManager() {
    return {
        // All available widgets for this player
        widgets: [],
        
        // Currently active widget IDs (max 4)
        activeWidgets: [],
        
        // Player state
        playerState: {
            isGod: false,
            hasWarehouseDeed: false,
            inFactoryRoom: false
        },
        
        // Auto-managed widget visibility state
        autoManagedState: {
            npc: false,
            factory: false
        },
        
        // Initialization flag
        initialized: false,
        
        /**
         * Initialize the widget manager
         */
        init() {
            console.log('[WidgetManager] Initializing...');
            
            // Get player state from global game state if available
            this.loadPlayerState();
            
            // Load available widgets based on player state
            this.widgets = getAvailableWidgets(this.playerState);
            
            // Restore active widgets from localStorage or use defaults
            this.restoreActiveWidgets();
            
            // Subscribe to game events for state updates
            this.subscribeToGameEvents();
            
            // Initial UI update
            this.updateWidgetDisplay();
            
            this.initialized = true;
            console.log('[WidgetManager] Initialized with widgets:', this.widgets.map(w => w.id));
        },
        
        /**
         * Load player state from global game state
         */
        loadPlayerState() {
            // Check for global game state
            if (window.gameState) {
                this.playerState.isGod = window.gameState.isGod || false;
                this.playerState.hasWarehouseDeed = window.gameState.hasWarehouseDeed || false;
                this.playerState.inFactoryRoom = window.gameState.inFactoryRoom || false;
            }
            
            // Also check for legacy global variables
            if (typeof window.godMode !== 'undefined') {
                this.playerState.isGod = window.godMode;
            }
            if (typeof window.hasWarehouseDeed !== 'undefined') {
                this.playerState.hasWarehouseDeed = window.hasWarehouseDeed;
            }
        },
        
        /**
         * Restore active widgets from localStorage or use defaults
         */
        restoreActiveWidgets() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const savedWidgets = JSON.parse(saved);
                    // Filter to only include widgets that are still available
                    this.activeWidgets = savedWidgets.filter(id => 
                        isWidgetAvailable(id, this.playerState) && 
                        !getWidgetById(id)?.autoManaged
                    );
                }
            } catch (e) {
                console.warn('[WidgetManager] Failed to restore widgets from localStorage:', e);
            }
            
            // If no saved widgets or none valid, use defaults
            if (this.activeWidgets.length === 0) {
                this.activeWidgets = getDefaultActiveWidgets(this.playerState);
            }
            
            // Ensure we have at least some widgets if possible
            if (this.activeWidgets.length === 0) {
                const available = this.widgets.filter(w => !w.autoManaged);
                if (available.length > 0) {
                    this.activeWidgets = [available[0].id];
                }
            }
            
            // Limit to max
            if (this.activeWidgets.length > MAX_ACTIVE_WIDGETS) {
                this.activeWidgets = this.activeWidgets.slice(0, MAX_ACTIVE_WIDGETS);
            }
        },
        
        /**
         * Save active widgets to localStorage
         */
        saveActiveWidgets() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.activeWidgets));
            } catch (e) {
                console.warn('[WidgetManager] Failed to save widgets to localStorage:', e);
            }
        },
        
        /**
         * Subscribe to game events for state updates
         */
        subscribeToGameEvents() {
            // Listen for god mode changes
            if (window.game?.messageBus) {
                window.game.messageBus.on('player:stats', (data) => {
                    if (data.stats?.godMode !== undefined) {
                        const newGodMode = data.stats.godMode.value === true || data.stats.godMode === true;
                        if (this.playerState.isGod !== newGodMode) {
                            this.playerState.isGod = newGodMode;
                            this.onPlayerStateChanged();
                        }
                    }
                });
                
                // Listen for room changes (factory/warehouse detection)
                window.game.messageBus.on('room:update', (data) => {
                    if (data.room) {
                        const newInFactory = data.room.room_type === 'factory';
                        const newHasWarehouse = data.hasWarehouseDeed || this.playerState.hasWarehouseDeed;
                        
                        if (this.playerState.inFactoryRoom !== newInFactory || 
                            this.playerState.hasWarehouseDeed !== newHasWarehouse) {
                            this.playerState.inFactoryRoom = newInFactory;
                            this.playerState.hasWarehouseDeed = newHasWarehouse;
                            this.onPlayerStateChanged();
                        }
                    }
                });
                
                // Listen for NPC widget visibility (auto-managed)
                window.game.messageBus.on('npc:activity', (data) => {
                    this.autoManagedState.npc = data.visible || false;
                    this.updateWidgetDisplay();
                });
                
                // Listen for factory widget visibility (auto-managed)
                window.game.messageBus.on('factory:state', (data) => {
                    this.autoManagedState.factory = data.visible || false;
                    this.updateWidgetDisplay();
                });
            }
        },
        
        /**
         * Handle player state changes (god mode, warehouse deed, room type)
         */
        onPlayerStateChanged() {
            // Refresh available widgets
            this.widgets = getAvailableWidgets(this.playerState);
            
            // Remove any active widgets that are no longer available
            this.activeWidgets = this.activeWidgets.filter(id => 
                isWidgetAvailable(id, this.playerState)
            );
            
            // Update display
            this.updateWidgetDisplay();
            this.saveActiveWidgets();
        },
        
        /**
         * Toggle a widget on/off
         * @param {string} widgetId - Widget ID to toggle
         */
        toggleWidget(widgetId) {
            const widget = getWidgetById(widgetId);
            if (!widget) {
                console.warn('[WidgetManager] Unknown widget:', widgetId);
                return;
            }
            
            // Can't toggle auto-managed widgets
            if (widget.autoManaged) {
                console.warn('[WidgetManager] Cannot toggle auto-managed widget:', widgetId);
                return;
            }
            
            // Check if available
            if (!isWidgetAvailable(widgetId, this.playerState)) {
                console.warn('[WidgetManager] Widget not available:', widgetId);
                return;
            }
            
            const isActive = this.isActive(widgetId);
            
            if (isActive) {
                // Deactivate widget
                this.activeWidgets = this.activeWidgets.filter(id => id !== widgetId);
            } else {
                // Activate widget
                if (this.activeWidgets.length >= MAX_ACTIVE_WIDGETS) {
                    // Remove the last widget to make room
                    this.activeWidgets.pop();
                }
                this.activeWidgets.push(widgetId);
            }
            
            this.updateWidgetDisplay();
            this.saveActiveWidgets();
        },
        
        /**
         * Select a widget (activate if not active)
         * @param {string} widgetId - Widget ID to select
         */
        selectWidget(widgetId) {
            if (!this.isActive(widgetId)) {
                this.toggleWidget(widgetId);
            }
        },
        
        /**
         * Check if a widget is currently active
         * @param {string} widgetId - Widget ID
         * @returns {boolean} Whether the widget is active
         */
        isActive(widgetId) {
            return this.activeWidgets.includes(widgetId);
        },
        
        /**
         * Check if a widget icon should be visible in the toggle bar
         * @param {string} widgetId - Widget ID
         * @returns {boolean} Whether the widget icon is visible
         */
        isIconVisible(widgetId) {
            const widget = getWidgetById(widgetId);
            if (!widget || widget.autoManaged) return false;
            return isWidgetAvailable(widgetId, this.playerState);
        },
        
        /**
         * Get CSS classes for a widget icon
         * @param {string} widgetId - Widget ID
         * @returns {string} CSS classes
         */
        getIconClasses(widgetId) {
            const classes = ['widget-icon'];
            
            if (this.isActive(widgetId)) {
                classes.push('active', 'widget-active');
            } else {
                classes.push('widget-inactive');
            }
            
            if (!this.isIconVisible(widgetId)) {
                classes.push('hidden');
            }
            
            return classes.join(' ');
        },
        
        /**
         * Update the widget display (DOM updates)
         */
        updateWidgetDisplay() {
            // Update toggle bar icons
            const toggleBar = document.getElementById('widgetToggleBar') || 
                              document.querySelector('.widget-toggle-bar');
            
            if (toggleBar) {
                this.widgets.forEach(widget => {
                    if (widget.autoManaged) return;
                    
                    const icon = toggleBar.querySelector(`[data-widget="${widget.id}"]`);
                    if (icon) {
                        // Update visibility
                        if (this.isIconVisible(widget.id)) {
                            icon.classList.remove('hidden');
                        } else {
                            icon.classList.add('hidden');
                        }
                        
                        // Update active state
                        if (this.isActive(widget.id)) {
                            icon.classList.add('active', 'widget-active');
                            icon.classList.remove('widget-inactive');
                        } else {
                            icon.classList.remove('active', 'widget-active');
                            icon.classList.add('widget-inactive');
                        }
                    }
                });
            }
            
            // Update widget panels
            this.updateWidgetPanels();
        },
        
        /**
         * Update widget panel visibility
         */
        updateWidgetPanels() {
            // Get all widget slots
            const slots = document.querySelectorAll('.widget-slot');
            let slotIndex = 0;
            
            // First, hide all toggleable widgets
            this.widgets.forEach(widget => {
                if (widget.autoManaged) return;
                const panel = document.getElementById(`widget-${widget.id}`);
                if (panel) {
                    panel.classList.add('hidden');
                }
            });
            
            // Show active widgets in order
            this.activeWidgets.forEach((widgetId, index) => {
                const widget = getWidgetById(widgetId);
                if (!widget || widget.autoManaged) return;
                
                const panel = document.getElementById(`widget-${widgetId}`);
                if (panel) {
                    panel.classList.remove('hidden');
                }
            });
            
            // Handle auto-managed widgets
            const npcPanel = document.getElementById('widget-npc');
            if (npcPanel) {
                if (this.autoManagedState.npc) {
                    npcPanel.classList.remove('hidden');
                } else {
                    npcPanel.classList.add('hidden');
                }
            }
            
            const factoryPanel = document.getElementById('widget-factory');
            if (factoryPanel) {
                if (this.autoManagedState.factory || this.playerState.inFactoryRoom) {
                    factoryPanel.classList.remove('hidden');
                } else {
                    factoryPanel.classList.add('hidden');
                }
            }
        },
        
        /**
         * Get the list of toggleable widgets for the UI
         * @returns {Array} Toggleable widget definitions
         */
        getToggleableWidgets() {
            return getToggleableWidgets().filter(w => 
                isWidgetAvailable(w.id, this.playerState)
            );
        },
        
        /**
         * Update player state externally
         * @param {Object} newState - New player state
         */
        updatePlayerState(newState) {
            let changed = false;
            
            if (newState.isGod !== undefined && this.playerState.isGod !== newState.isGod) {
                this.playerState.isGod = newState.isGod;
                changed = true;
            }
            if (newState.hasWarehouseDeed !== undefined && this.playerState.hasWarehouseDeed !== newState.hasWarehouseDeed) {
                this.playerState.hasWarehouseDeed = newState.hasWarehouseDeed;
                changed = true;
            }
            if (newState.inFactoryRoom !== undefined && this.playerState.inFactoryRoom !== newState.inFactoryRoom) {
                this.playerState.inFactoryRoom = newState.inFactoryRoom;
                changed = true;
            }
            
            if (changed) {
                this.onPlayerStateChanged();
            }
        },
        
        /**
         * Update auto-managed widget state
         * @param {string} widgetId - Widget ID
         * @param {boolean} visible - Whether widget should be visible
         */
        setAutoManagedVisible(widgetId, visible) {
            if (this.autoManagedState[widgetId] !== undefined) {
                this.autoManagedState[widgetId] = visible;
                this.updateWidgetDisplay();
            }
        }
    };
}

// Make globally available for Alpine.js
window.widgetManager = widgetManager;

// Export for ES modules
export default widgetManager;


