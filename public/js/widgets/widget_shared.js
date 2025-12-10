/**
 * Widget Shared Utilities
 * 
 * Shared state helpers, async subscription patterns, refresh handlers,
 * and utility functions used by all widgets.
 */

/**
 * Base widget mixin providing shared functionality
 * Widgets should spread this into their Alpine.js data:
 * 
 * export function MyWidget() {
 *   return {
 *     ...widgetShared(),
 *     // widget-specific logic
 *   };
 * }
 */
export function widgetShared() {
    return {
        // Shared state
        _subscriptions: [],
        _refreshInterval: null,
        _loading: false,
        _error: null,
        _lastUpdate: null,
        
        /**
         * Subscribe to a message bus event
         * @param {string} event - Event name
         * @param {Function} callback - Event handler
         */
        subscribe(event, callback) {
            if (window.game?.messageBus) {
                window.game.messageBus.on(event, callback);
                this._subscriptions.push({ event, callback });
            }
        },
        
        /**
         * Unsubscribe from all events
         */
        unsubscribeAll() {
            if (window.game?.messageBus) {
                this._subscriptions.forEach(({ event, callback }) => {
                    window.game.messageBus.off(event, callback);
                });
            }
            this._subscriptions = [];
        },
        
        /**
         * Start auto-refresh polling
         * @param {Function} refreshFn - Function to call on each refresh
         * @param {number} intervalMs - Interval in milliseconds (default 5000)
         */
        startAutoRefresh(refreshFn, intervalMs = 5000) {
            this.stopAutoRefresh();
            this._refreshInterval = setInterval(() => {
                if (!this._loading) {
                    refreshFn();
                }
            }, intervalMs);
        },
        
        /**
         * Stop auto-refresh polling
         */
        stopAutoRefresh() {
            if (this._refreshInterval) {
                clearInterval(this._refreshInterval);
                this._refreshInterval = null;
            }
        },
        
        /**
         * Set loading state
         * @param {boolean} loading - Loading state
         */
        setLoading(loading) {
            this._loading = loading;
        },
        
        /**
         * Set error state
         * @param {string|null} error - Error message or null
         */
        setError(error) {
            this._error = error;
        },
        
        /**
         * Update last update timestamp
         */
        markUpdated() {
            this._lastUpdate = Date.now();
        },
        
        /**
         * Get time since last update in seconds
         * @returns {number} Seconds since last update
         */
        getSecondsSinceUpdate() {
            if (!this._lastUpdate) return Infinity;
            return Math.floor((Date.now() - this._lastUpdate) / 1000);
        },
        
        /**
         * Send WebSocket message
         * @param {Object} message - Message to send
         */
        sendMessage(message) {
            const ws = window.game?.getWebSocket?.();
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            } else {
                console.warn('[Widget] WebSocket not available');
            }
        },
        
        /**
         * Emit event to message bus
         * @param {string} event - Event name
         * @param {*} data - Event data
         */
        emit(event, data) {
            window.game?.messageBus?.emit(event, data);
        },
        
        /**
         * Clean up widget resources
         * Call this when widget is destroyed
         */
        destroy() {
            this.unsubscribeAll();
            this.stopAutoRefresh();
        },
        
        /**
         * Escape HTML for safe display
         * @param {string} text - Text to escape
         * @returns {string} Escaped text
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        
        /**
         * Format date for display
         * @param {string|number|Date} date - Date to format
         * @returns {string} Formatted date string
         */
        formatDate(date) {
            if (!date) return 'N/A';
            const d = new Date(date);
            return d.toLocaleDateString();
        },
        
        /**
         * Format date and time for display
         * @param {string|number|Date} date - Date to format
         * @returns {string} Formatted date/time string
         */
        formatDateTime(date) {
            if (!date) return 'N/A';
            const d = new Date(date);
            return d.toLocaleString();
        },
        
        /**
         * Format relative time (e.g., "2 minutes ago")
         * @param {string|number|Date} date - Date to format
         * @returns {string} Relative time string
         */
        formatRelativeTime(date) {
            if (!date) return 'N/A';
            const d = new Date(date);
            const now = Date.now();
            const diff = now - d.getTime();
            
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
            if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
            if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
            return 'Just now';
        }
    };
}

/**
 * Create a debounced function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Create a throttled function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit = 300) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Check if player has god mode
 * @returns {boolean} Whether player has god mode
 */
export function isGodMode() {
    if (window.gameState?.isGod !== undefined) return window.gameState.isGod;
    if (typeof window.godMode !== 'undefined') return window.godMode;
    return false;
}

/**
 * Check if player has warehouse deed
 * @returns {boolean} Whether player has warehouse deed
 */
export function hasWarehouseDeed() {
    if (window.gameState?.hasWarehouseDeed !== undefined) return window.gameState.hasWarehouseDeed;
    if (typeof window.hasWarehouseDeed !== 'undefined') return window.hasWarehouseDeed;
    return false;
}

/**
 * Get current room type
 * @returns {string|null} Current room type or null
 */
export function getCurrentRoomType() {
    return window.gameState?.currentRoom?.room_type || null;
}

/**
 * Check if player is in a factory room
 * @returns {boolean} Whether player is in a factory room
 */
export function isInFactoryRoom() {
    return getCurrentRoomType() === 'factory';
}

/**
 * Check if player is in a warehouse room
 * @returns {boolean} Whether player is in a warehouse room
 */
export function isInWarehouseRoom() {
    return getCurrentRoomType() === 'warehouse';
}

// CSS class constants for consistent styling
export const WIDGET_CLASSES = {
    // Widget container states
    active: 'widget-active',
    inactive: 'widget-inactive',
    hidden: 'hidden',
    loading: 'widget-loading',
    error: 'widget-error',
    
    // Icon states
    iconActive: 'active',
    iconInactive: 'widget-inactive',
    iconHidden: 'hidden',
    
    // Priority indicators (for tickets, etc.)
    priorityLow: 'priority-1',
    priorityMedium: 'priority-2',
    priorityHigh: 'priority-3',
    priorityCritical: 'priority-4',
    
    // Status indicators
    statusOpen: 'status-open',
    statusInProgress: 'status-in-progress',
    statusResolved: 'status-resolved'
};

// Export default for convenience
export default {
    widgetShared,
    debounce,
    throttle,
    isGodMode,
    hasWarehouseDeed,
    getCurrentRoomType,
    isInFactoryRoom,
    isInWarehouseRoom,
    WIDGET_CLASSES
};


