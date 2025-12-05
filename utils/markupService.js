/**
 * Universal Markup Service
 * 
 * ALL text that will be displayed in the game UI must go through this service.
 * This ensures consistent markup processing and eliminates regression bugs.
 * 
 * This is the server-side version of the markup parser, ported from the client-side
 * implementation to ensure consistency across the entire system.
 */

// Built-in markup conventions (same as client-side)
const MARKUP_CONVENTIONS = {
    angleBrackets: {
        syntax: '<text>',
        opening: '<',
        closing: '>',
        description: 'Glows with keyword/NPC color (default purple/cyan)',
        example: 'The <ancient artifact> glows brightly.',
        color: 'keyword',
        effects: { glow: true }
    },
    squareBrackets: {
        syntax: '[text]',
        opening: '[',
        closing: ']',
        description: 'Glows with same color (preserved/inherited)',
        example: 'You see [something mysterious] in the distance.',
        color: 'inherit',
        effects: { glow: true }
    },
    exclamation: {
        syntax: '!text!',
        opening: '!',
        closing: '!',
        description: 'Glows red (emphasis/warning)',
        example: '!Danger! The path ahead is treacherous.',
        color: '#ff0000',
        effects: { glow: true }
    }
};

// Custom markup conventions cache (loaded from database)
let customMarkupConventions = {};
let customConventionsLoaded = false;

/**
 * Load custom markup conventions from database
 * @param {object} db - Database module
 */
async function loadCustomConventions(db) {
    try {
        // Check if database has a table for custom markup conventions
        // For now, we'll use an empty object - custom conventions can be added later
        // if needed via database or configuration
        customMarkupConventions = {};
        customConventionsLoaded = true;
    } catch (e) {
        console.error('[MarkupService] Failed to load custom markup conventions:', e);
        customMarkupConventions = {};
        customConventionsLoaded = true;
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generate CSS for markup effects
 * @param {object} effects - Effects object (glow, bold, flash, pulse)
 * @param {string} color - Color value
 * @returns {string} CSS string
 */
function generateMarkupCSS(effects, color) {
    let css = '';
    
    if (color && color !== 'inherit' && color !== 'keyword') {
        css += `color: ${color};`;
    }
    
    if (effects.glow) {
        css += `text-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor, 0 0 20px currentColor;`;
    }
    
    if (effects.bold) {
        css += `font-weight: bold;`;
    }
    
    if (effects.flash) {
        css += `animation: markup-flash 1s ease-in-out infinite;`;
    }
    
    if (effects.pulse) {
        css += `display: inline-block; transform-origin: center; vertical-align: baseline; animation: markup-pulse 2s ease 3;`;
    }
    
    return css;
}

/**
 * Parse markup in text and convert to HTML spans (server-side)
 * @param {string} text - Text with markup
 * @param {string} keywordColor - Color for <text> markup (default: '#ff00ff')
 * @returns {string} HTML with styled spans
 */
function parseMarkupServer(text, keywordColor = '#ff00ff') {
    if (!text || typeof text !== 'string') return '';
    
    const glowColor = keywordColor || '#ff00ff';
    
    // Combine built-in and custom conventions
    const allConventions = { ...MARKUP_CONVENTIONS, ...customMarkupConventions };
    
    // Sort by opening length (longest first) to handle nested/consecutive patterns
    const sortedConventions = Object.entries(allConventions).sort((a, b) => 
        b[1].opening.length - a[1].opening.length
    );
    
    // Use a placeholder system to avoid double-escaping
    const placeholders = [];
    let placeholderIndex = 0;
    let result = text;
    
    // Process each convention BEFORE escaping HTML
    for (const [key, convention] of sortedConventions) {
        const opening = convention.opening;
        const closing = convention.closing;
        
        // Escape special regex characters
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedOpening = escapeRegex(opening);
        const escapedClosing = escapeRegex(closing);
        
        // Create regex pattern - match content between opening and closing
        const pattern = new RegExp(`${escapedOpening}((?:[^${escapedClosing}]|${escapedClosing}(?![^${escapedClosing}]*${escapedOpening}))+?)${escapedClosing}`, 'g');
        
        result = result.replace(pattern, (match, content) => {
            // Escape the content to prevent XSS
            const escapedContent = escapeHtml(content);
            
            // Determine color
            let color = convention.color;
            if (color === 'keyword') {
                color = glowColor;
            } else if (color === 'inherit') {
                color = 'inherit';
            }
            
            // Generate CSS
            const css = generateMarkupCSS(convention.effects || {}, color);
            const className = `markup-${key}`;
            
            // Store the span HTML
            const placeholder = `__MARKUP_${placeholderIndex}__`;
            placeholders[placeholderIndex] = `<span class="${className}" style="${css}">${escapedContent}</span>`;
            placeholderIndex++;
            
            return placeholder;
        });
    }
    
    // Now escape any remaining HTML that wasn't part of markup
    result = escapeHtml(result);
    
    // Replace placeholders with actual spans (they're already safe HTML)
    placeholders.forEach((span, index) => {
        result = result.replace(`__MARKUP_${index}__`, span);
    });
    
    return result;
}

/**
 * Format message for terminal display
 * @param {string} text - Raw text with markup
 * @param {string} type - Message type ('info', 'error', 'system')
 * @param {string} keywordColor - Color for <text> markup (default: '#00ffff')
 * @returns {string} Complete HTML string ready for client
 */
function formatMessageForTerminal(text, type = 'info', keywordColor = '#00ffff') {
    if (!text || typeof text !== 'string') {
        console.error('[MarkupService] formatMessageForTerminal: Invalid text input:', typeof text, text);
        return '';
    }
    
    try {
        // Parse markup
        const parsedContent = parseMarkupServer(text, keywordColor);
        
        // Determine CSS class based on type
        const messageClass = type === 'error' ? 'error-message' : 'info-message';
        
        // Return complete HTML structure
        return `<div class="${messageClass}">${parsedContent}</div>`;
    } catch (err) {
        console.error('[MarkupService] Error in formatMessageForTerminal:', err);
        // Fallback: return escaped text
        const messageClass = type === 'error' ? 'error-message' : 'info-message';
        return `<div class="${messageClass}">${escapeHtml(text)}</div>`;
    }
}

/**
 * Initialize markup service (load custom conventions)
 * @param {object} db - Database module
 */
async function initializeMarkupService(db) {
    if (!customConventionsLoaded) {
        await loadCustomConventions(db);
    }
}

module.exports = {
    parseMarkupServer,
    formatMessageForTerminal,
    initializeMarkupService,
    loadCustomConventions,
    // Export for testing
    escapeHtml,
    generateMarkupCSS
};

