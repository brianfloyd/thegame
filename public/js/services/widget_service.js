/**
 * Widget Service
 * 
 * Centralized service for widget data operations.
 * Provides unified async behavior, subscriptions, polling, and event bus integration.
 * 
 * All widget data flows should use this service to eliminate divergent refresh logic.
 */

/**
 * Subscription registry
 * Maps event types to callback arrays
 */
const subscriptions = new Map();

/**
 * Polling intervals
 * Maps widget types to interval IDs
 */
const pollingIntervals = new Map();

/**
 * Last data cache
 * Maps widget types to their last received data
 */
const dataCache = new Map();

/**
 * Subscribe to widget updates
 * @param {string} type - Update type (e.g., 'tickets', 'factory', 'warehouse')
 * @param {Function} callback - Callback function receiving data
 * @returns {Function} Unsubscribe function
 */
export function subscribeToUpdates(type, callback) {
    if (!subscriptions.has(type)) {
        subscriptions.set(type, []);
    }
    
    subscriptions.get(type).push(callback);
    
    // Return unsubscribe function
    return () => {
        const callbacks = subscriptions.get(type);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    };
}

/**
 * Unsubscribe all callbacks for a type
 * @param {string} type - Update type
 */
export function unsubscribe(type) {
    subscriptions.delete(type);
}

/**
 * Unsubscribe all callbacks for all types
 */
export function unsubscribeAll() {
    subscriptions.clear();
}

/**
 * Notify subscribers of an update
 * @param {string} type - Update type
 * @param {*} data - Data to send to subscribers
 */
export function notifySubscribers(type, data) {
    const callbacks = subscriptions.get(type);
    if (callbacks) {
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`[WidgetService] Error in ${type} subscriber:`, e);
            }
        });
    }
    
    // Cache the data
    dataCache.set(type, { data, timestamp: Date.now() });
}

/**
 * Get cached data for a type
 * @param {string} type - Widget type
 * @returns {Object|null} Cached data object with { data, timestamp } or null
 */
export function getCachedData(type) {
    return dataCache.get(type) || null;
}

/**
 * Clear cached data for a type
 * @param {string} type - Widget type
 */
export function clearCache(type) {
    dataCache.delete(type);
}

/**
 * Clear all cached data
 */
export function clearAllCache() {
    dataCache.clear();
}

/**
 * Refresh widget data by sending a WebSocket request
 * @param {string} type - Widget type
 * @param {Object} [options] - Additional options to send
 */
export function refreshWidget(type, options = {}) {
    const ws = getWebSocket();
    if (!ws) {
        console.warn(`[WidgetService] Cannot refresh ${type}: WebSocket not available`);
        return;
    }
    
    // Map widget types to message types
    const messageTypes = {
        tickets: 'getTickets',
        factory: 'getFactoryWidgetState',
        warehouse: 'warehouse',
        inventory: 'inventory',
        stats: 'getPlayerStats',
        npc: 'getNpcActivity'
    };
    
    const messageType = messageTypes[type];
    if (!messageType) {
        console.warn(`[WidgetService] Unknown widget type: ${type}`);
        return;
    }
    
    ws.send(JSON.stringify({ type: messageType, ...options }));
}

/**
 * Start polling for widget updates
 * @param {string} type - Widget type
 * @param {number} intervalMs - Polling interval in milliseconds
 * @param {Object} [options] - Additional options to send with each request
 */
export function startPolling(type, intervalMs = 5000, options = {}) {
    // Stop any existing polling for this type
    stopPolling(type);
    
    // Initial fetch
    refreshWidget(type, options);
    
    // Start interval
    const intervalId = setInterval(() => {
        refreshWidget(type, options);
    }, intervalMs);
    
    pollingIntervals.set(type, intervalId);
    console.log(`[WidgetService] Started polling for ${type} every ${intervalMs}ms`);
}

/**
 * Stop polling for widget updates
 * @param {string} type - Widget type
 */
export function stopPolling(type) {
    const intervalId = pollingIntervals.get(type);
    if (intervalId) {
        clearInterval(intervalId);
        pollingIntervals.delete(type);
        console.log(`[WidgetService] Stopped polling for ${type}`);
    }
}

/**
 * Stop all polling
 */
export function stopAllPolling() {
    pollingIntervals.forEach((intervalId, type) => {
        clearInterval(intervalId);
        console.log(`[WidgetService] Stopped polling for ${type}`);
    });
    pollingIntervals.clear();
}

/**
 * Get WebSocket connection
 * @returns {WebSocket|null} WebSocket instance or null
 */
export function getWebSocket() {
    return window.game?.getWebSocket?.() || null;
}

/**
 * Send WebSocket message
 * @param {Object} message - Message to send
 * @returns {boolean} Whether the message was sent
 */
export function sendMessage(message) {
    const ws = getWebSocket();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
    }
    console.warn('[WidgetService] Cannot send message: WebSocket not available');
    return false;
}

/**
 * Get message bus
 * @returns {Object|null} Message bus instance or null
 */
export function getMessageBus() {
    return window.game?.messageBus || null;
}

/**
 * Emit event to message bus
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
export function emitEvent(event, data) {
    const messageBus = getMessageBus();
    if (messageBus) {
        messageBus.emit(event, data);
    }
}

/**
 * Listen to message bus event
 * @param {string} event - Event name
 * @param {Function} callback - Event handler
 * @returns {Function} Unsubscribe function
 */
export function listenToEvent(event, callback) {
    const messageBus = getMessageBus();
    if (messageBus) {
        messageBus.on(event, callback);
        return () => messageBus.off(event, callback);
    }
    return () => {};
}

/**
 * Initialize widget service with WebSocket message handlers
 * Call this once when the game initializes
 */
export function initializeWidgetService() {
    const messageBus = getMessageBus();
    if (!messageBus) {
        console.warn('[WidgetService] Cannot initialize: Message bus not available');
        return;
    }
    
    // Subscribe to relevant WebSocket messages and notify widget subscribers
    
    // Tickets
    messageBus.on('ticketsList', (data) => {
        notifySubscribers('tickets', data);
    });
    messageBus.on('ticketUpdated', (data) => {
        notifySubscribers('tickets', data);
    });
    
    // Factory
    messageBus.on('factoryWidgetState', (data) => {
        notifySubscribers('factory', data);
    });
    
    // Warehouse
    messageBus.on('warehouseWidgetState', (data) => {
        notifySubscribers('warehouse', data);
    });
    
    // Inventory
    messageBus.on('inventoryList', (data) => {
        notifySubscribers('inventory', data);
    });
    
    // Player stats
    messageBus.on('player:stats', (data) => {
        notifySubscribers('stats', data);
    });
    
    // NPC activity
    messageBus.on('harvestStarted', (data) => {
        notifySubscribers('npc', { ...data, visible: true });
    });
    messageBus.on('harvestEnded', (data) => {
        notifySubscribers('npc', { ...data, visible: false });
    });
    
    // Room updates (for factory/warehouse detection)
    messageBus.on('room:update', (data) => {
        notifySubscribers('room', data);
    });
    
    console.log('[WidgetService] Initialized');
}

/**
 * Clean up widget service
 * Call this when the game is closing
 */
export function cleanupWidgetService() {
    stopAllPolling();
    unsubscribeAll();
    clearAllCache();
    console.log('[WidgetService] Cleaned up');
}

// Export default for convenience
export default {
    subscribeToUpdates,
    unsubscribe,
    unsubscribeAll,
    notifySubscribers,
    getCachedData,
    clearCache,
    clearAllCache,
    refreshWidget,
    startPolling,
    stopPolling,
    stopAllPolling,
    getWebSocket,
    sendMessage,
    getMessageBus,
    emitEvent,
    listenToEvent,
    initializeWidgetService,
    cleanupWidgetService
};


