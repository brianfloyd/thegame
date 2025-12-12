/**
 * Widget Registry
 * 
 * Central registry of ALL widgets with their configuration.
 * Used by the widget manager to determine which widgets to show.
 */

/**
 * Widget definitions
 * Each widget has:
 * - id: Unique identifier (matches data-widget attribute)
 * - name: Display name
 * - icon: SVG icon path or inline SVG
 * - slot: 'standard' for 4-slot rotation, 'special' for auto-managed, 'fullwidth' for wide widgets
 * - requiresGod: Only visible to god mode players
 * - requiresWarehouse: Only visible when player has warehouse deed
 * - requiresFactory: Only visible in factory rooms
 * - autoManaged: Widget visibility is controlled by game state, not user toggle
 * - defaultActive: Whether widget is active by default
 * - order: Display order in toggle bar (lower = earlier)
 */
export const WIDGETS = [
    {
        id: 'stats',
        name: 'Player Stats',
        icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
        slot: 'standard',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: true,
        order: 10
    },
    {
        id: 'compass',
        name: 'Compass',
        icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z',
        slot: 'standard',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: true,
        order: 20
    },
    {
        id: 'map',
        name: 'Map',
        icon: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
        slot: 'standard',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: true,
        order: 30
    },
    {
        id: 'comms',
        name: 'Comms',
        icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z',
        slot: 'standard',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: true,
        order: 40
    },
    {
        id: 'warehouse',
        name: 'Warehouse',
        icon: 'M10 20v-6H4v6h6zm8 0v-6h-6v6h6zm-10-8H2V4h6v8zm8 0h-6V4h6v8zm-10 2h6v4H4v-4zm8 0h6v4h-6v-4z',
        slot: 'standard',
        requiresGod: false,
        requiresWarehouse: true,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: false,
        order: 50
    },
    {
        id: 'godmode',
        name: 'God Mode',
        icon: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
        slot: 'standard',
        requiresGod: true,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: false,
        order: 60
    },
    {
        id: 'automation',
        name: 'Automation',
        icon: 'M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zm-2 10H6V7h12v12zm-9-6c-.83 0-1.5-.67-1.5-1.5S8.17 10 9 10s1.5.67 1.5 1.5S9.83 13 9 13zm7.5-1.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5zM8 15h8v2H8v-2z',
        slot: 'fullwidth',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: false,
        order: 70
    },
    {
        id: 'runekeeper',
        name: 'Rune Keeper',
        icon: '',
        slot: 'standard',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: false,
        order: 80
    },
    {
        id: 'tickets',
        name: 'Tickets',
        icon: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
        slot: 'fullwidth',
        requiresGod: true,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: false,
        defaultActive: false,
        order: 90
    },
    {
        id: 'npc',
        name: 'NPC Activity',
        icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
        slot: 'special',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: false,
        autoManaged: true, // Shows during harvest/cooldown
        defaultActive: false,
        order: 100
    },
    {
        id: 'factory',
        name: 'Factory Machine',
        icon: 'M19.36 2.72L20.78 4.14L19.36 5.56L17.94 4.14L19.36 2.72M12 8L13.41 9.41L12 10.83L10.59 9.41L12 8z',
        slot: 'special',
        requiresGod: false,
        requiresWarehouse: false,
        requiresFactory: true,
        autoManaged: true, // Shows in factory rooms
        defaultActive: false,
        order: 110
    }
];

/**
 * Get widget definition by ID
 * @param {string} id - Widget ID
 * @returns {Object|null} Widget definition or null
 */
export function getWidgetById(id) {
    return WIDGETS.find(w => w.id === id) || null;
}

/**
 * Get all widgets that can appear in the toggle bar
 * @returns {Array} Toggleable widget definitions
 */
export function getToggleableWidgets() {
    return WIDGETS.filter(w => !w.autoManaged).sort((a, b) => a.order - b.order);
}

/**
 * Get all auto-managed widgets
 * @returns {Array} Auto-managed widget definitions
 */
export function getAutoManagedWidgets() {
    return WIDGETS.filter(w => w.autoManaged);
}

/**
 * Get available widgets for a player based on their state
 * @param {Object} playerState - Player state object
 * @param {boolean} playerState.isGod - Whether player has god mode
 * @param {boolean} playerState.hasWarehouseDeed - Whether player has warehouse deed
 * @param {boolean} playerState.inFactoryRoom - Whether player is in a factory room
 * @returns {Array} Array of widget definitions available to this player
 */
export function getAvailableWidgets(playerState = {}) {
    const { isGod = false, hasWarehouseDeed = false, inFactoryRoom = false } = playerState;
    
    return WIDGETS.filter(widget => {
        // God mode widgets only for god mode players
        if (widget.requiresGod && !isGod) return false;
        
        // Warehouse widget only for players with deed
        if (widget.requiresWarehouse && !hasWarehouseDeed) return false;
        
        // Factory widget only in factory rooms
        if (widget.requiresFactory && !inFactoryRoom) return false;
        
        return true;
    }).sort((a, b) => a.order - b.order);
}

/**
 * Get default active widgets for a player
 * @param {Object} playerState - Player state object
 * @returns {Array<string>} Array of widget IDs that should be active by default
 */
export function getDefaultActiveWidgets(playerState = {}) {
    return getAvailableWidgets(playerState)
        .filter(w => w.defaultActive && !w.autoManaged)
        .map(w => w.id);
}

/**
 * Check if a widget is available for a player
 * @param {string} widgetId - Widget ID
 * @param {Object} playerState - Player state object
 * @returns {boolean} Whether the widget is available
 */
export function isWidgetAvailable(widgetId, playerState = {}) {
    const widget = getWidgetById(widgetId);
    if (!widget) return false;
    
    const { isGod = false, hasWarehouseDeed = false, inFactoryRoom = false } = playerState;
    
    if (widget.requiresGod && !isGod) return false;
    if (widget.requiresWarehouse && !hasWarehouseDeed) return false;
    if (widget.requiresFactory && !inFactoryRoom) return false;
    
    return true;
}

// Export default for convenience
export default {
    WIDGETS,
    getWidgetById,
    getToggleableWidgets,
    getAutoManagedWidgets,
    getAvailableWidgets,
    getDefaultActiveWidgets,
    isWidgetAvailable
};


