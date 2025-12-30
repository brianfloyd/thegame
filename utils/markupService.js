/**
 * Universal Markup Service
 * 
 * ALL text that will be displayed in the game UI must go through this service.
 * This ensures consistent markup processing and eliminates regression bugs.
 * 
 * This is the server-side version of the markup parser, ported from the client-side
 * implementation to ensure consistency across the entire system.
 */

// Typewriter effect regex pattern: {{typewriter:delay}}text{{/typewriter}}
// Default delay is 100ms if not specified
const TYPEWRITER_PATTERN = /\{\{typewriter(?::(\d+))?\}\}([\s\S]*?)\{\{\/typewriter\}\}/gi;

// Markup conventions cache (loaded from database)
let markupConventions = {};
let conventionsLoaded = false;

// Player names cache (for auto-wrapping player names with @ symbols)
let playerNamesCache = [];
let playerNamesCacheLoaded = false;
let playerNamesCacheTimestamp = 0;
const PLAYER_NAMES_CACHE_TTL = 60000; // 1 minute cache

/**
 * Load markup conventions from database
 * @param {object} db - Database module
 */
async function loadConventions(db) {
    try {
        const conventions = await db.getAllMarkupConventions();
        markupConventions = {};
        
        // Convert database rows to convention objects
        for (const row of conventions) {
            const key = `convention_${row.id}`;
            markupConventions[key] = {
                syntax: row.syntax,
                opening: row.opening,
                closing: row.closing,
                description: row.description || '',
                example: row.example || '',
                color: row.color || 'keyword',
                effects: row.effects || {}
            };
        }
        
        conventionsLoaded = true;
        console.log(`[MarkupService] Loaded ${conventions.length} markup conventions from database`);
    } catch (e) {
        console.error('[MarkupService] Failed to load markup conventions:', e);
        markupConventions = {};
        conventionsLoaded = true;
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
    
    // CRITICAL: Only add text-shadow (glow) if effects.glow is explicitly true
    // This prevents accidental glow from being applied
    if (effects && effects.glow === true) {
        css += `text-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor, 0 0 20px currentColor;`;
    }
    
    if (effects && effects.bold === true) {
        css += `font-weight: bold;`;
    }
    
    if (effects && effects.flash === true) {
        css += `animation: markup-flash 1s ease-in-out infinite;`;
    }
    
    if (effects && effects.pulse === true) {
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
    
    // Use conventions from database
    const allConventions = markupConventions;
    
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
        // CRITICAL: Exclude matches that are inside existing markup placeholders
        const pattern = new RegExp(`${escapedOpening}((?:[^${escapedClosing}]|${escapedClosing}(?![^${escapedClosing}]*${escapedOpening}))+?)${escapedClosing}`, 'g');
        
        result = result.replace(pattern, (match, content) => {
            // CRITICAL: Skip if this match contains a markup placeholder
            // This prevents nested markup from being processed multiple times
            // When a convention matches content that's already been processed by another convention,
            // that content will have been replaced with a placeholder
            if (match.includes('__MARKUP_')) {
                return match; // Already processed by another convention, skip
            }
            
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
    // CRITICAL: Use global replace to handle multiple occurrences of the same placeholder
    // Process in reverse order to avoid index conflicts if placeholders contain other placeholder strings
    for (let index = placeholders.length - 1; index >= 0; index--) {
        const placeholder = `__MARKUP_${index}__`;
        const span = placeholders[index];
        if (span) {
            // Use global regex to replace all occurrences, escaping special regex chars in placeholder
            const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp(escapedPlaceholder, 'g'), span);
        }
    }
    
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
 * Initialize markup service (load conventions)
 * @param {object} db - Database module
 */
async function initializeMarkupService(db) {
    if (!conventionsLoaded) {
        await loadConventions(db);
    }
}

/**
 * Reload markup conventions from database (for cache invalidation)
 * @param {object} db - Database module
 */
async function reloadMarkupConventions(db) {
    conventionsLoaded = false;
    await loadConventions(db);
}

module.exports = {
    parseMarkupServer,
    parseTypewriterMarkup,
    formatMessageForTerminal,
    initializeMarkupService,
    reloadMarkupConventions,
    loadConventions,
    // Export for testing
    escapeHtml,
    generateMarkupCSS
};

