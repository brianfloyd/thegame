/**
 * RuneKeeperWidget
 * 
 * Displays ASCII art from runekeeper.txt file.
 */

import Widget from './Widget.js';

export default class RuneKeeperWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.asciiArt = null;
        this.loaded = false;
    }
    
    init() {
        super.init();
        // Store widget state only
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget';
        root.setAttribute('data-widget', 'runekeeper');
        
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Rune Keeper';
        root.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'widget-content';
        content.id = 'runekeeperContent';
        
        if (this.asciiArt) {
            const pre = document.createElement('pre');
            pre.className = 'runekeeper-art';
            pre.textContent = this.asciiArt;
            content.appendChild(pre);
        } else {
            const loading = document.createElement('div');
            loading.textContent = 'Loading...';
            content.appendChild(loading);
        }
        
        root.appendChild(content);
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        if (!this.loaded && !this.asciiArt) {
            this.loadAsciiArt();
        }
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        // Cleanup handled by DOM removal
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        // No messages needed for this widget
    }
    
    /**
     * Load ASCII art from file
     */
    async loadAsciiArt() {
        try {
            const response = await fetch('/ascii-images/runekeeper.txt');
            if (response.ok) {
                this.asciiArt = await response.text();
                this.loaded = true;
                
                if (this.rootElement) {
                    const content = this.rootElement.querySelector('#runekeeperContent');
                    if (content) {
                        content.innerHTML = '';
                        const pre = document.createElement('pre');
                        pre.className = 'runekeeper-art';
                        pre.textContent = this.asciiArt;
                        content.appendChild(pre);
                    }
                }
            }
        } catch (error) {
            console.error('[RuneKeeperWidget] Failed to load ASCII art:', error);
            if (this.rootElement) {
                const content = this.rootElement.querySelector('#runekeeperContent');
                if (content) {
                    content.textContent = 'Failed to load art.';
                }
            }
        }
    }
}

