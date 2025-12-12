/**
 * GodModeWidget
 * 
 * God mode tools and utilities widget.
 * Provides quick access to various editor interfaces.
 */

import Widget from './Widget.js';

export default class GodModeWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.rootElement = null;
    }
    
    init() {
        super.init();
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        if (this.rootElement) {
            return this.rootElement;
        }
        
        const root = document.createElement('div');
        root.className = 'widget';
        root.id = `widget-${this.id}`;
        root.setAttribute('data-widget', 'godmode');
        
        // Special golden header
        const header = document.createElement('div');
        header.className = 'widget-header godmode-header';
        header.textContent = 'God Mode';
        root.appendChild(header);
        
        // Content with editor buttons
        const content = document.createElement('div');
        content.className = 'widget-content godmode-content';
        root.appendChild(content);
        
        // Editors section
        const editorsSection = document.createElement('div');
        editorsSection.className = 'godmode-section';
        content.appendChild(editorsSection);
        
        const editorsTitle = document.createElement('div');
        editorsTitle.className = 'godmode-section-title';
        editorsTitle.textContent = 'Editors';
        editorsSection.appendChild(editorsTitle);
        
        const editorsGrid = document.createElement('div');
        editorsGrid.className = 'godmode-editor-grid';
        editorsSection.appendChild(editorsGrid);
        
        // Editor buttons
        const editorButtons = [
            { action: 'map', label: 'Map', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
            { action: 'npc', label: 'NPC', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
            { action: 'items', label: 'Items', icon: 'M7 18c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM1 2v2h2l3.6 7.59-1.35 2.45c-.15.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
            { action: 'player', label: 'Player', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' },
            { action: 'crafting', label: 'Crafting', icon: 'M19.36 2.72L20.78 4.14 15.06 9.85C15.06 7.7 13.96 6.28 12 6.28c-1.96 0-3.06 1.42-3.06 3.57l-5.78 5.78L2.72 13.36l5.78-5.78C8.28 5.7 9.7 4.6 11.85 4.6c2.15 0 3.57 1.1 3.57 3.25l5.78-5.78z' },
            { action: 'tickets', label: 'Tickets', icon: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z' }
        ];
        
        editorButtons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'godmode-editor-btn';
            button.setAttribute('data-action', btn.action);
            button.textContent = btn.label;
            
            // Add icon if provided
            if (btn.icon) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('width', '16');
                svg.setAttribute('height', '16');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill', 'currentColor');
                path.setAttribute('d', btn.icon);
                svg.appendChild(path);
                button.insertBefore(svg, button.firstChild);
            }
            
            editorsGrid.appendChild(button);
        });
        
        this.rootElement = root;
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Setup editor button click handlers
        const editorButtons = this.rootElement.querySelectorAll('.godmode-editor-btn');
        editorButtons.forEach(btn => {
            btn.addEventListener('click', this.handleEditorClick);
        });
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        // Remove event listeners
        const editorButtons = this.rootElement.querySelectorAll('.godmode-editor-btn');
        editorButtons.forEach(btn => {
            btn.removeEventListener('click', this.handleEditorClick);
        });
    }
    
    /**
     * Handle editor button clicks
     */
    handleEditorClick = (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        if (!action) return;
        
        // Navigate to appropriate editor
        const routes = {
            'map': '/map',
            'npc': '/npc',
            'items': '/items',
            'player': '/player',
            'crafting': '/crafting',
            'tickets': '/tickets'
        };
        
        const route = routes[action];
        if (route) {
            window.location.href = route;
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        // No specific messages needed for god mode widget
    }
}

