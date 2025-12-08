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

// Custom markup conventions (loaded from API/database)
let customMarkupConventions = {};
let customConventionsLoaded = false;

// Active typewriter animations (for cleanup)
const activeTypewriters = new Map();

// Load custom conventions from API (same as markup-helper.js)
async function loadCustomConventions() {
    // If already loaded, return cached (but allow force reload)
    if (customConventionsLoaded && Object.keys(customMarkupConventions).length > 0) {
        return;
    }
    
    try {
        const response = await fetch('/api/markup/conventions');
        if (!response.ok) {
            // If API fails (e.g., not logged in or no god mode), fall back to localStorage
            console.warn('[Markup] API failed, checking localStorage fallback...');
            const stored = localStorage.getItem('customMarkupConventions');
            if (stored) {
                try {
                    customMarkupConventions = JSON.parse(stored);
                    console.log('[Markup] Loaded conventions from localStorage fallback');
                    customConventionsLoaded = true;
                    return;
                } catch (e) {
                    console.error('[Markup] Failed to parse localStorage conventions:', e);
                }
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const conventions = await response.json();
        
        // Convert array to object format (keyed by custom_<id>)
        customMarkupConventions = {};
        for (const conv of conventions) {
            if (!conv || !conv.id) {
                continue;
            }
            
            const key = `custom_${conv.id}`;
            
            // Parse effects if it's a string (shouldn't happen with JSONB, but be safe)
            let effects = conv.effects || {};
            if (typeof effects === 'string') {
                try {
                    effects = JSON.parse(effects);
                } catch (e) {
                    effects = {};
                }
            }
            
            customMarkupConventions[key] = {
                syntax: conv.syntax || '',
                opening: conv.opening || '',
                closing: conv.closing || '',
                description: conv.description || '',
                example: conv.example || '',
                color: conv.color || 'keyword',
                effects: effects
            };
        }
        
        customConventionsLoaded = true;
        console.log(`[Markup] Loaded ${Object.keys(customMarkupConventions).length} custom conventions from API`);
    } catch (e) {
        console.error('[Markup] Failed to load custom markup conventions:', e);
        customMarkupConventions = {};
        customConventionsLoaded = true; // Mark as loaded to prevent infinite retries
    }
}

// Force reload conventions (e.g., after creating new ones)
export async function reloadCustomConventions() {
    customConventionsLoaded = false;
    await loadCustomConventions();
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
    
    if (effects.italic) {
        css += `font-style: italic;`;
    }
    
    if (effects.fontSize) {
        css += `font-size: ${effects.fontSize};`;
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
    
    // Load custom conventions if not already loaded (async, but we'll use cached version)
    // Note: This is called synchronously, so we use cached conventions
    // Conventions should be pre-loaded when the page loads
    if (!customConventionsLoaded) {
        // Trigger async load (won't block, will use empty object for now)
        loadCustomConventions().catch(() => {});
    }
    
    const glowColor = keywordColor || '#ff00ff';
    
    // Combine built-in and custom conventions
    const allConventions = { ...MARKUP_CONVENTIONS, ...customMarkupConventions };
    
    // Separate line-start patterns from regular patterns
    const lineStartConventions = [];
    const regularConventions = [];
    
    for (const [key, convention] of Object.entries(allConventions)) {
        if (convention.opening.startsWith('^') || convention.closing === '' || convention.closing === '$') {
            lineStartConventions.push([key, convention]);
        } else {
            regularConventions.push([key, convention]);
        }
    }
    
    // Sort by opening length (longest first) to handle nested/consecutive patterns
    const sortedLineStartConventions = lineStartConventions.sort((a, b) => 
        b[1].opening.length - a[1].opening.length
    );
    const sortedRegularConventions = regularConventions.sort((a, b) => 
        b[1].opening.length - a[1].opening.length
    );
    
    // CRITICAL: Check if input contains markdown HTML tags BEFORE processing
    // If so, we need to protect them from being processed as markup
    const markdownTagPattern = /<\/?(ul|ol|li|br|strong|em|code|p)\b[^>]*>/i;
    const hasMarkdownHtml = markdownTagPattern.test(text);
    
    // If markdown HTML is present, protect HTML tags by replacing them with placeholders
    const htmlTagPlaceholders = [];
    let htmlTagIndex = 0;
    let result = text;
    
    if (hasMarkdownHtml) {
        // Replace HTML tags with placeholders to protect them
        result = result.replace(/<([^>]+)>/g, (match, tagContent) => {
            // Check if it's a markdown HTML tag
            if (markdownTagPattern.test(match)) {
                const placeholder = `__HTMLTAG_${htmlTagIndex}__`;
                htmlTagPlaceholders[htmlTagIndex] = match;
                htmlTagIndex++;
                return placeholder;
            }
            // Not a markdown tag, keep as-is (might be from markup placeholders)
            return match;
        });
    }
    
    // Use a placeholder system to avoid double-escaping
    const placeholders = [];
    let placeholderIndex = 0;
    
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
        for (const [key, convention] of sortedRegularConventions) {
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
    
    // FIRST: Process regular conventions (standard opening/closing patterns)
    // This processes all markup including any that might be inside line-start patterns
    for (const [key, convention] of sortedRegularConventions) {
        const opening = convention.opening;
        const closing = convention.closing;
        
        // Escape special regex characters
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedOpening = escapeRegex(opening);
        const escapedClosing = escapeRegex(closing);
        
        // Create regex pattern - match content between opening and closing
        // Standard pattern for regular conventions
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
            
            // Handle typewriter effect - wrap in span with data attributes
            let spanContent = escapedContent;
            if (convention.effects?.typewriter) {
                const delay = convention.effects.typewriterDelay || 100;
                spanContent = `<span class="typewriter-effect" data-typewriter="true" data-typewriter-delay="${delay}">${escapedContent}</span>`;
            }
            
            // Store the span HTML
            const placeholder = `__MARKUP_${placeholderIndex}__`;
            placeholders[placeholderIndex] = `<span class="${className}" style="${css}">${spanContent}</span>`;
            placeholderIndex++;
            
            return placeholder;
        });
    }
    
    // Now handle escaping - if we protected HTML tags, restore them first
    if (hasMarkdownHtml && htmlTagPlaceholders.length > 0) {
        // Restore HTML tag placeholders
        htmlTagPlaceholders.forEach((tag, index) => {
            result = result.replace(`__HTMLTAG_${index}__`, tag);
        });
        
        // Now escape only text content, preserving HTML tags
        const parts = result.split(/(<[^>]*>)/);
        let processed = '';
        
        for (const part of parts) {
            if (part.startsWith('<') && part.endsWith('>')) {
                // HTML tag - preserve it (already safe)
                processed += part;
            } else if (part) {
                // Text content - escape it to prevent XSS
                // But preserve placeholders that will be replaced later
                if (part.includes('__MARKUP_') || part.includes('__TYPEWRITER_')) {
                    // Contains placeholders - split and preserve them
                    const placeholderParts = part.split(/(__(?:MARKUP|TYPEWRITER)_\d+__)/);
                    for (const placeholderPart of placeholderParts) {
                        if (placeholderPart.match(/^__(?:MARKUP|TYPEWRITER)_\d+__$/)) {
                            // Placeholder - keep as-is
                            processed += placeholderPart;
                        } else if (placeholderPart) {
                            // Text - escape it
                            processed += escapeHtml(placeholderPart);
                        }
                    }
                } else {
                    // Plain text - escape it
                    processed += escapeHtml(part);
                }
            }
        }
        result = processed;
    } else {
        // No markdown HTML - escape everything as before
        result = escapeHtml(result);
    }
    
    // Replace typewriter placeholders with actual spans (they're already safe HTML)
    typewriterBlocks.forEach((span, index) => {
        result = result.replace(`__TYPEWRITER_${index}__`, span);
    });
    
    // SECOND: Process line-start patterns (after regular markup is processed)
    // These match entire lines and wrap content that may already have markup placeholders
    for (const [key, convention] of sortedLineStartConventions) {
        const opening = convention.opening;
        const closing = convention.closing;
        
        // For line-start patterns, handle the regex properly
        let cleanOpening = opening.replace(/^\^/, ''); // Remove ^ for matching
        // Unescape double backslashes that might be in the database
        cleanOpening = cleanOpening.replace(/\\\\/g, '\\');
        
        // Build regex pattern - escape special chars but preserve regex patterns like \d+
        // We need to be careful: if cleanOpening contains \d, we want to keep it as \d in the regex
        let escapedCleanOpening = '';
        for (let i = 0; i < cleanOpening.length; i++) {
            const char = cleanOpening[i];
            if (char === '\\' && i + 1 < cleanOpening.length) {
                // Escape sequence like \d, \., etc. - keep as-is
                escapedCleanOpening += char + cleanOpening[i + 1];
                i++; // Skip next char
            } else if (/[.*+?${}()|[\]\\]/.test(char)) {
                // Escape regex special chars
                escapedCleanOpening += '\\' + char;
            } else {
                escapedCleanOpening += char;
            }
        }
        
        let pattern;
        if (closing === '' || closing === '$') {
            // Line-end pattern - match from opening to end of line
            pattern = new RegExp(`^${escapedCleanOpening}(.+?)$`, 'gm');
        } else {
            // Line-start pattern with closing
            const escapedCleanClosing = escapeRegex(closing);
            pattern = new RegExp(`^${escapedCleanOpening}(.+?)${escapedCleanClosing}`, 'gm');
        }
        
        result = result.replace(pattern, (match, content) => {
            // Content may already have placeholders from regular markup - replace them first
            let processedContent = content;
            let hasPlaceholders = false;
            
            placeholders.forEach((span, index) => {
                if (processedContent.includes(`__MARKUP_${index}__`)) {
                    hasPlaceholders = true;
                    processedContent = processedContent.replace(`__MARKUP_${index}__`, span);
                }
            });
            
            // If content had placeholders (which are already safe HTML), don't escape
            // Otherwise, escape the text content
            let finalContent;
            if (hasPlaceholders) {
                // Content already contains HTML spans from placeholders - use directly
                finalContent = processedContent;
            } else {
                // Plain text content - escape it
                finalContent = escapeHtml(processedContent);
            }
            
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
            
            // Create the span
            const span = `<span class="${className}" style="${css}">${finalContent}</span>`;
            
            return span;
        });
    }
    
    // Replace regular markup placeholders with actual spans (they're already safe HTML)
    placeholders.forEach((span, index) => {
        result = result.replace(`__MARKUP_${index}__`, span);
    });
    
    // Convert line breaks to <br> tags (but preserve existing HTML structure)
    // Split by HTML tags to avoid breaking them
    const htmlParts = result.split(/(<[^>]+>)/);
    let finalResult = '';
    for (const part of htmlParts) {
        if (part.startsWith('<') && part.endsWith('>')) {
            // HTML tag - keep as-is
            finalResult += part;
        } else {
            // Text content - convert line breaks to <br>
            finalResult += part.replace(/\n/g, '<br>');
        }
    }
    
    return finalResult;
}

// Make initializeTypewriterEffects available globally for markup-helper.js
if (typeof window !== 'undefined') {
    window.initializeTypewriterEffects = initializeTypewriterEffects;
    window.reloadCustomConventions = reloadCustomConventions;
    
    // Pre-load conventions when module loads (if in browser)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            loadCustomConventions().catch(() => {});
        });
    } else {
        // DOM already loaded, load immediately
        loadCustomConventions().catch(() => {});
    }
}












