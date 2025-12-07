/**
 * Markup Utility - Parse markup in text and convert to HTML spans
 * Extracted from markup-helper.js for use in component architecture
 */

// High-contrast color palette (17 colors)
export const MARKUP_COLORS = [
    { name: 'Cyan', value: '#00ffff' },
    { name: 'Magenta', value: '#ff00ff' },
    { name: 'Yellow', value: '#ffff00' },
    { name: 'Red', value: '#ff0000' },
    { name: 'Green', value: '#00ff00' },
    { name: 'Blue', value: '#0000ff' },
    { name: 'Orange', value: '#ff8800' },
    { name: 'Pink', value: '#ff88ff' },
    { name: 'Lime', value: '#88ff00' },
    { name: 'Aqua', value: '#00ff88' },
    { name: 'Purple', value: '#8800ff' },
    { name: 'Gold', value: '#ffaa00' },
    { name: 'White', value: '#ffffff' },
    { name: 'Silver', value: '#cccccc' },
    { name: 'Crimson', value: '#cc0000' },
    { name: 'Emerald', value: '#00cc88' },
    { name: 'Dark Gray', value: '#666666' }
];

// Built-in markup conventions
export const MARKUP_CONVENTIONS = {
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

// Custom markup conventions (loaded from localStorage)
let customMarkupConventions = {};

// Active typewriter animations (for cleanup)
const activeTypewriters = new Map();

// Load custom conventions from localStorage
function loadCustomConventions() {
    try {
        const stored = localStorage.getItem('customMarkupConventions');
        if (stored) {
            customMarkupConventions = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load custom markup conventions:', e);
        customMarkupConventions = {};
    }
}

/**
 * Initialize typewriter effects on elements with data-typewriter attribute
 * This is called after HTML is inserted into the DOM
 * @param {HTMLElement} container - Container element to search for typewriter elements
 */
export function initializeTypewriterEffects(container) {
    if (!container) return;
    
    const typewriterElements = container.querySelectorAll('[data-typewriter="true"]');
    
    typewriterElements.forEach((element, index) => {
        const delay = parseInt(element.getAttribute('data-typewriter-delay') || '100', 10);
        const fullContent = element.innerHTML;
        
        // Store original content and clear element
        element.setAttribute('data-typewriter-content', fullContent);
        element.innerHTML = '';
        element.style.visibility = 'visible';
        
        // Create a unique ID for this typewriter instance
        const typewriterId = `typewriter_${Date.now()}_${index}`;
        element.setAttribute('data-typewriter-id', typewriterId);
        
        // Start typewriter animation
        animateTypewriter(element, fullContent, delay, typewriterId);
    });
}

/**
 * Animate typewriter effect character by character
 * Handles HTML tags properly (doesn't split them)
 * @param {HTMLElement} element - Element to animate
 * @param {string} htmlContent - Full HTML content to type
 * @param {number} delay - Delay between characters in ms
 * @param {string} typewriterId - Unique ID for this animation
 */
function animateTypewriter(element, htmlContent, delay, typewriterId) {
    // Parse HTML to extract characters and tags
    const segments = parseHtmlForTypewriter(htmlContent);
    let currentIndex = 0;
    let currentHtml = '';
    
    function typeNextSegment() {
        if (currentIndex >= segments.length) {
            // Animation complete
            activeTypewriters.delete(typewriterId);
            element.removeAttribute('data-typewriter-animating');
            return;
        }
        
        const segment = segments[currentIndex];
        currentHtml += segment.content;
        element.innerHTML = currentHtml;
        currentIndex++;
        
        // If it's a tag, don't delay (type next immediately)
        // If it's a character, delay before next
        const nextDelay = segment.isTag ? 0 : delay;
        
        const timeoutId = setTimeout(typeNextSegment, nextDelay);
        activeTypewriters.set(typewriterId, timeoutId);
    }
    
    element.setAttribute('data-typewriter-animating', 'true');
    typeNextSegment();
}

/**
 * Parse HTML content into segments of characters and tags
 * Tags are kept whole, characters are individual
 * @param {string} html - HTML content
 * @returns {Array<{content: string, isTag: boolean}>} Array of segments
 */
function parseHtmlForTypewriter(html) {
    const segments = [];
    let i = 0;
    
    while (i < html.length) {
        if (html[i] === '<') {
            // Find end of tag
            const tagEnd = html.indexOf('>', i);
            if (tagEnd !== -1) {
                // Include the entire tag as one segment
                segments.push({
                    content: html.substring(i, tagEnd + 1),
                    isTag: true
                });
                i = tagEnd + 1;
            } else {
                // Malformed HTML, treat < as character
                segments.push({ content: html[i], isTag: false });
                i++;
            }
        } else if (html[i] === '&') {
            // Handle HTML entities (e.g., &amp;, &lt;, etc.)
            const entityEnd = html.indexOf(';', i);
            if (entityEnd !== -1 && entityEnd - i < 10) {
                // Include entire entity as one segment
                segments.push({
                    content: html.substring(i, entityEnd + 1),
                    isTag: false // Entities show as characters
                });
                i = entityEnd + 1;
            } else {
                segments.push({ content: html[i], isTag: false });
                i++;
            }
        } else {
            // Regular character
            segments.push({ content: html[i], isTag: false });
            i++;
        }
    }
    
    return segments;
}

/**
 * Stop all active typewriter animations
 */
export function stopAllTypewriters() {
    activeTypewriters.forEach((timeoutId) => {
        clearTimeout(timeoutId);
    });
    activeTypewriters.clear();
}

// Generate CSS for markup effects
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Parse markup in text and convert to HTML spans
 * @param {string} text - Text with markup
 * @param {string} keywordColor - Color for <text> markup (default: '#ff00ff')
 * @returns {string} HTML with styled spans
 */
export function parseMarkup(text, keywordColor = '#ff00ff') {
    if (!text) return '';
    
    // Reload custom conventions in case they were updated
    loadCustomConventions();
    
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
    
    // First, extract typewriter blocks and replace with placeholders
    // Typewriter pattern: {{typewriter:delay}}content{{/typewriter}}
    const TYPEWRITER_PATTERN = /\{\{typewriter(?::(\d+))?\}\}([\s\S]*?)\{\{\/typewriter\}\}/gi;
    const typewriterBlocks = [];
    let typewriterIndex = 0;
    
    result = result.replace(TYPEWRITER_PATTERN, (match, delay, content) => {
        const delayMs = delay ? parseInt(delay, 10) : 100;
        // Process content inside typewriter for other markup first
        // Use placeholders to avoid double-escaping
        const innerPlaceholders = [];
        let innerPlaceholderIndex = 0;
        let processedContent = content;
        
        // Process other markup conventions inside typewriter content
        for (const [key, convention] of sortedConventions) {
            const opening = convention.opening;
            const closing = convention.closing;
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedOpening = escapeRegex(opening);
            const escapedClosing = escapeRegex(closing);
            const pattern = new RegExp(`${escapedOpening}((?:[^${escapedClosing}]|${escapedClosing}(?![^${escapedClosing}]*${escapedOpening}))+?)${escapedClosing}`, 'g');
            
            processedContent = processedContent.replace(pattern, (match, innerContent) => {
                const escapedContent = escapeHtml(innerContent);
                let color = convention.color;
                if (color === 'keyword') {
                    color = glowColor;
                } else if (color === 'inherit') {
                    color = 'inherit';
                }
                const css = generateMarkupCSS(convention.effects || {}, color);
                const className = `markup-${key}`;
                const placeholder = `__INNER_${innerPlaceholderIndex}__`;
                innerPlaceholders[innerPlaceholderIndex] = `<span class="${className}" style="${css}">${escapedContent}</span>`;
                innerPlaceholderIndex++;
                return placeholder;
            });
        }
        
        // Escape any remaining HTML in the content
        processedContent = escapeHtml(processedContent);
        
        // Replace inner placeholders with actual spans
        innerPlaceholders.forEach((span, index) => {
            processedContent = processedContent.replace(`__INNER_${index}__`, span);
        });
        
        // Store the typewriter span HTML
        const placeholder = `__TYPEWRITER_${typewriterIndex}__`;
        typewriterBlocks[typewriterIndex] = `<span class="typewriter-effect" data-typewriter="true" data-typewriter-delay="${delayMs}">${processedContent}</span>`;
        typewriterIndex++;
        
        return placeholder;
    });
    
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
    
    // Replace typewriter placeholders with actual spans (they're already safe HTML)
    typewriterBlocks.forEach((span, index) => {
        result = result.replace(`__TYPEWRITER_${index}__`, span);
    });
    
    // Replace placeholders with actual spans (they're already safe HTML)
    placeholders.forEach((span, index) => {
        result = result.replace(`__MARKUP_${index}__`, span);
    });
    
    return result;
}












