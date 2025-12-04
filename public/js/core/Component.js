/**
 * Component - Base class for UI components
 * 
 * Provides lifecycle methods and MessageBus integration for all UI components.
 */

export default class Component {
    constructor(game = null) {
        if (!game || !game.messageBus) {
            console.error('Component requires a Game instance with a MessageBus.');
            throw new Error('Missing Game instance or MessageBus.');
        }
        this.game = game;
        this.messageBus = game.messageBus;
        this.subscriptions = [];
        this.initialized = false;
    }
    
    /**
     * Initialize the component
     * Override this method in subclasses to set up DOM references and event listeners
     */
    init() {
        this.initialized = true;
    }
    
    /**
     * Render the component
     * Override this method in subclasses to update the DOM based on current state
     */
    render() {
        // Override in subclasses
    }
    
    /**
     * Destroy the component
     * Override this method in subclasses to clean up event listeners
     */
    destroy() {
        // Unsubscribe from all events
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
        this.initialized = false;
    }
    
    /**
     * Subscribe to a MessageBus event
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     */
    subscribe(event, callback) {
        if (!this.messageBus) {
            console.error('[Component] Cannot subscribe: MessageBus not available');
            return () => {};
        }
        const unsubscribe = this.messageBus.on(event, callback);
        this.subscriptions.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * Emit an event to MessageBus
     * @param {string} event - Event name
     * @param {object} data - Event data
     */
    emit(event, data = {}) {
        if (!this.messageBus) {
            console.error('[Component] Cannot emit: MessageBus not available');
            return;
        }
        this.messageBus.emit(event, data);
    }
    
    /**
     * Send message to game server
     * @param {object} message - Message object to send
     */
    send(message) {
        if (!this.game) {
            console.error('[Component] Cannot send: Game instance not available');
            return;
        }
        this.game.send(message);
    }
}


