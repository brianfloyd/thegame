/**
 * InstructionsWidget
 * 
 * Displays game instructions and help information.
 */

import Widget from './Widget.js';

export default class InstructionsWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.content = null;
    }
    
    init() {
        super.init();
        // No DOM lookups in init - done in onAttach
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-instructions';
        root.setAttribute('data-widget', 'instructions');
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Instructions';
        root.appendChild(header);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'widget-content';
        content.id = 'instructionsContent';
        root.appendChild(content);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        this.content = this.rootElement.querySelector('#instructionsContent');
        
        // Display default instructions if no content has been set
        if (this.content && !this.content.innerHTML.trim()) {
            this.displayDefaultInstructions();
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'instructions' && msg.content) {
            this.updateContent(msg.content);
        }
    }
    
    /**
     * Update instructions content
     */
    updateContent(content) {
        if (!this.content) return;
        this.content.innerHTML = content;
    }
    
    /**
     * Display default instructions
     */
    displayDefaultInstructions() {
        if (!this.content) return;
        
        const defaultContent = `
            <div class="instructions-section">
                <h3>Welcome to the Game</h3>
                <p>Use the command line at the bottom to interact with the world.</p>
                <p>Type 'help' for a list of available commands.</p>
            </div>
        `;
        
        this.content.innerHTML = defaultContent;
    }
}
