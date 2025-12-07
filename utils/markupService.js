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

// Typewriter effect regex pattern: {{typewriter:delay}}text{{/typewriter}}
// Default delay is 100ms if not specified
const TYPEWRITER_PATTERN = /\{\{typewriter(?::(\d+))?\}\}([\s\S]*?)\{\{\/typewriter\}\}/gi;

// Custom markup conventions cache (loaded from database)
let customMarkupConventions = {};
let customConventionsLoaded = false;

// Built-in convention edits cache (loaded from database)
let builtInConventionEdits = {};
let builtInEditsLoaded = false;

/**
 * Load custom markup conventions from database
 * @param {object} db - Database module
 */
async function loadCustomConventions(db) {
    try {
        const conventions = await db.getAllMarkupConventions();
        customMarkupConventions = {};
        
        // Convert database rows to convention objects
        for (const row of conventions) {
            const key = `custom_${row.id}`;
            customMarkupConventions[key] = {
                syntax: row.syntax,
                opening: row.opening,
                closing: row.closing,
                description: row.description || '',
                example: row.example || '',
                color: row.color || 'keyword',
                effects: row.effects || {}
            };
        }
        
        customConventionsLoaded = true;
        console.log(`[MarkupService] Loaded ${conventions.length} custom markup conventions from database`);
    } catch (e) {
        console.error('[MarkupService] Failed to load custom markup conventions:', e);
        customMarkupConventions = {};
        customConventionsLoaded = true;
    }
}

/**
 * Load built-in convention edits from database
 * @param {object} db - Database module
 */
async function loadBuiltInConventionEdits(db) {
    try {
        const edits = await db.getBuiltInConventionEdits();
        builtInConventionEdits = {};
        
        // Store edits by convention key
        for (const row of edits) {
            builtInConventionEdits[row.convention_key] = {
                syntax: row.syntax,
                example: row.example
            };
        }
        
        builtInEditsLoaded = true;
        console.log(`[MarkupService] Loaded ${edits.length} built-in convention edits from database`);
    } catch (e) {
        console.error('[MarkupService] Failed to load built-in convention edits:', e);
        builtInConventionEdits = {};
        builtInEditsLoaded = true;
    }
}

/**
 * Get merged built-in conventions with edits applied
 * @returns {object} MARKUP_CONVENTIONS with edits applied
 */
function getMergedBuiltInConventions() {
    const merged = {};
    
    for (const [key, convention] of Object.entries(MARKUP_CONVENTIONS)) {
        const edit = builtInConventionEdits[key];
        merged[key] = {
            ...convention,
            syntax: edit?.syntax || convention.syntax,
            example: edit?.example || convention.example
        };
    }
    
    return merged;
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
 * Parse typewriter markup and wrap content in a span with data attributes
 * Syntax: {{typewriter:100}}text with other markup{{/typewriter}}
 * The delay is in milliseconds (default 100ms)
 * 
 * @param {string} text - Text potentially containing typewriter markup
 * @returns {string} Text with typewriter spans (data-typewriter, data-typewriter-delay)
 */
function parseTypewriterMarkup(text) {
    if (!text || typeof text !== 'string') return text;
    
    return text.replace(TYPEWRITER_PATTERN, (match, delay, content) => {
        const delayMs = delay ? parseInt(delay, 10) : 100;
        // Wrap in span with data attributes for client-side processing
        // The content inside will be parsed for other markup separately
        return `<span class="typewriter-effect" data-typewriter="true" data-typewriter-delay="${delayMs}">${content}</span>`;
    });
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
    
    // First, process typewriter markup (preserve inner content for further processing)
    // We'll handle typewriter specially to preserve nested markup
    let result = text;
    const typewriterBlocks = [];
    let typewriterIndex = 0;
    
    // Extract typewriter blocks and replace with placeholders
    result = result.replace(TYPEWRITER_PATTERN, (match, delay, content) => {
        const delayMs = delay ? parseInt(delay, 10) : 100;
        const placeholder = `__TYPEWRITER_${typewriterIndex}__`;
        typewriterBlocks[typewriterIndex] = { delay: delayMs, content };
        typewriterIndex++;
        return placeholder;
    });
    
    // Combine built-in (with edits) and custom conventions
    const mergedBuiltIn = getMergedBuiltInConventions();
    const allConventions = { ...mergedBuiltIn, ...customMarkupConventions };
    
    // Sort by opening length (longest first) to handle nested/consecutive patterns
    const sortedConventions = Object.entries(allConventions).sort((a, b) => 
        b[1].opening.length - a[1].opening.length
    );
    
    // Use a placeholder system to avoid double-escaping
    const placeholders = [];
    let placeholderIndex = 0;
    
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
    
    // Now process typewriter blocks - parse their content and wrap in typewriter span
    typewriterBlocks.forEach((block, index) => {
        // Recursively parse the content inside typewriter block (for nested markup)
        const parsedContent = parseMarkupServer(block.content, keywordColor);
        const typewriterHtml = `<span class="typewriter-effect" data-typewriter="true" data-typewriter-delay="${block.delay}">${parsedContent}</span>`;
        result = result.replace(`__TYPEWRITER_${index}__`, typewriterHtml);
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
 * Initialize markup service (load custom conventions and built-in edits)
 * @param {object} db - Database module
 */
async function initializeMarkupService(db) {
    if (!customConventionsLoaded) {
        await loadCustomConventions(db);
    }
    if (!builtInEditsLoaded) {
        await loadBuiltInConventionEdits(db);
    }
}

/**
 * Reload markup conventions from database (for cache invalidation)
 * @param {object} db - Database module
 */
async function reloadMarkupConventions(db) {
    customConventionsLoaded = false;
    builtInEditsLoaded = false;
    await loadCustomConventions(db);
    await loadBuiltInConventionEdits(db);
}

module.exports = {
    parseMarkupServer,
    parseTypewriterMarkup,
    formatMessageForTerminal,
    initializeMarkupService,
    reloadMarkupConventions,
    loadCustomConventions,
    loadBuiltInConventionEdits,
    getMergedBuiltInConventions,
    // Export for testing
    escapeHtml,
    generateMarkupCSS
};

