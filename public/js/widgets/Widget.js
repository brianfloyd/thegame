/**
 * Widget - Base class for all widgets
 * 
 * Extends Component and provides widget-specific lifecycle methods.
 * Widgets receive messages via onMessage() callback from WidgetManager,
 * not through direct MessageBus subscriptions.
 */

import Component from '../core/Component.js';

export default class Widget extends Component {
    constructor(game, id) {
        super(game);
        this.id = id;
        this.rootElement = null;
        this.attached = false;
    }
    
    /**
     * Initialize the widget
     * Override this method to set up widget state (NO DOM lookups)
     */
    init() {
        super.init();
        // Store widget state only - no DOM element lookups
    }
    
    /**
     * Render the widget
     * MUST be overridden - returns SINGLE root DOM element
     * @returns {HTMLElement} Single root element containing all widget content
     */
    render() {
        throw new Error(`Widget ${this.id} must implement render() method`);
    }
    
    /**
     * Called after widget is attached to DOM
     * Override to set up event listeners and initialize behavior
     */
    onAttach() {
        // Override in subclasses
    }
    
    /**
     * Called before widget is detached from DOM
     * Override to clean up event listeners and state
     */
    onDetach() {
        // Override in subclasses
    }
    
    /**
     * Handle backend messages routed from WidgetManager
     * Override to handle specific message types
     * @param {Object} msg - Message object from server
     */
    onMessage(msg) {
        // Override in subclasses
    }
    
    /**
     * Update widget by re-rendering
     * Replaces the root element in DOM if attached
     */
    update() {
        if (!this.attached || !this.rootElement) return;
        
        const parent = this.rootElement.parentElement;
        if (!parent) return;
        
        const newRoot = this.render();
        if (newRoot) {
            parent.replaceChild(newRoot, this.rootElement);
            this.rootElement = newRoot;
            this.onAttach();
        }
    }
}

