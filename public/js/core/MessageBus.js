/**
 * MessageBus - Centralized Event System
 * 
 * Provides a pub/sub event bus for all UI updates and game state changes.
 * All components subscribe to events they care about, ensuring loose coupling.
 */

class MessageBus {
    constructor() {
        this.listeners = {};
    }
    
    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name (e.g., 'terminal:message', 'room:update')
     * @param {object} data - Event data
     */
    emit(event, data = {}) {
        if (!this.listeners[event]) {
            return;
        }
        
        // Call all listeners for this event
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[MessageBus] Error in listener for ${event}:`, error);
            }
        });
    }
    
    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        
        this.listeners[event].push(callback);
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    }
    
    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function to remove
     */
    off(event, callback) {
        if (!this.listeners[event]) {
            return;
        }
        
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }
    
    /**
     * Remove all listeners for an event (or all events if no event specified)
     * @param {string|null} event - Event name, or null to clear all
     */
    clear(event = null) {
        if (event) {
            delete this.listeners[event];
        } else {
            this.listeners = {};
        }
    }
}

// Export singleton instance
export default new MessageBus();






