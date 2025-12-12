/**
 * Markup Helper - Shared utility for text markup conventions
 * Used across all editors (NPC, Map, Item, Player, etc.)
 */

// High-contrast color palette (17 colors)
const MARKUP_COLORS = [
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

// Markup conventions (loaded from database via API)
let markupConventions = {};

// Track active typewriter animations (for cleanup)
const activeTypewriterTimeouts = new Map();

// Check for and migrate localStorage data to database
async function migrateLocalStorageMarkup() {
    try {
        // Check if there's old localStorage data
        const stored = localStorage.getItem('customMarkupConventions');
        if (!stored) {
            return { migrated: false, count: 0 };
        }
        
        const localStorageConventions = JSON.parse(stored);
        const conventionKeys = Object.keys(localStorageConventions);
        
        if (conventionKeys.length === 0) {
            return { migrated: false, count: 0 };
        }
        
        console.log(`[MarkupHelper] Found ${conventionKeys.length} conventions in localStorage, migrating to database...`);
        
        let migratedCount = 0;
        let errorCount = 0;
        
        // Migrate each convention to database
        for (const key of conventionKeys) {
            const convention = localStorageConventions[key];
            
            // Skip if it doesn't have required fields
            if (!convention.opening || !convention.closing) {
                console.warn(`[MarkupHelper] Skipping invalid convention ${key}:`, convention);
                continue;
            }
            
            try {
                // Create convention in database
                await saveCustomConvention({
                    syntax: convention.syntax || `${convention.opening}text${convention.closing}`,
                    opening: convention.opening,
                    closing: convention.closing,
                    description: convention.description || '',
                    example: convention.example || '',
                    color: convention.color || 'keyword',
                    effects: convention.effects || {}
                });
                
                migratedCount++;
                console.log(`[MarkupHelper] Migrated convention: ${convention.syntax || key}`);
            } catch (e) {
                console.error(`[MarkupHelper] Failed to migrate convention ${key}:`, e);
                errorCount++;
            }
        }
        
        // Clear localStorage after successful migration
        if (migratedCount > 0) {
            localStorage.removeItem('markupConventions');
            console.log(`[MarkupHelper] Migration complete: ${migratedCount} conventions migrated, ${errorCount} errors. localStorage cleared.`);
        }
        
        return { migrated: migratedCount > 0, count: migratedCount, errors: errorCount };
    } catch (e) {
        console.error('[MarkupHelper] Error during localStorage migration:', e);
        return { migrated: false, count: 0, error: e.message };
    }
}

// Load custom conventions from API
async function loadCustomConventions() {
    try {
        console.log('[MarkupHelper] Fetching custom conventions from API...');
        const response = await fetch('/api/markup/conventions');
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[MarkupHelper] API error ${response.status}:`, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let conventions = await response.json();
        console.log(`[MarkupHelper] API returned ${conventions.length} conventions:`, conventions);
        
        // If no conventions in database, check for localStorage migration
        if (conventions.length === 0) {
            const migrationResult = await migrateLocalStorageMarkup();
            if (migrationResult.migrated) {
                console.log(`[MarkupHelper] ✅ Successfully migrated ${migrationResult.count} convention(s) from localStorage to database`);
                if (migrationResult.errors > 0) {
                    console.warn(`[MarkupHelper] ⚠️ ${migrationResult.errors} convention(s) failed to migrate`);
                }
                // Reload after migration
                const reloadResponse = await fetch('/api/markup/conventions');
                if (reloadResponse.ok) {
                    const reloadedConventions = await reloadResponse.json();
                    console.log(`[MarkupHelper] After migration, found ${reloadedConventions.length} conventions in database`);
                    // Use reloaded conventions
                    conventions = reloadedConventions;
                }
            } else {
                // Check if localStorage exists but migration wasn't needed (maybe already migrated)
                const stored = localStorage.getItem('markupConventions');
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (Object.keys(parsed).length > 0) {
                            console.log(`[MarkupHelper] Found ${Object.keys(parsed).length} convention(s) in localStorage but migration returned no results. They may need manual migration.`);
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }

        // Convert array to object format (keyed by convention_<id>)
        markupConventions = {};
        for (const conv of conventions) {
            if (!conv || !conv.id) {
                console.warn('[MarkupHelper] Skipping invalid convention:', conv);
                continue;
            }
            
            const key = `convention_${conv.id}`;
            
            // Parse effects if it's a string (shouldn't happen with JSONB, but be safe)
            let effects = conv.effects || {};
            if (typeof effects === 'string') {
                try {
                    effects = JSON.parse(effects);
                } catch (e) {
                    console.warn(`[MarkupHelper] Failed to parse effects for convention ${conv.id}:`, e);
                    effects = {};
                }
            }
            
            markupConventions[key] = {
                syntax: conv.syntax || '',
                opening: conv.opening || '',
                closing: conv.closing || '',
                description: conv.description || '',
                example: conv.example || '',
                color: conv.color || 'keyword',
                effects: effects
            };
            
            console.log(`[MarkupHelper] Loaded convention ${key}:`, markupConventions[key]);
        }
        
        console.log(`[MarkupHelper] Successfully loaded ${Object.keys(markupConventions).length} markup conventions`);
        
        // If we got 0 conventions but the user expects some, log a warning
        if (Object.keys(markupConventions).length === 0) {
            console.warn('[MarkupHelper] No conventions found in database. If you expected to see conventions here, they may need to be recreated.');
        }
    } catch (e) {
        console.error('[MarkupHelper] Failed to load custom markup conventions:', e);
        console.error('[MarkupHelper] Error stack:', e.stack);
        
        // If it's a 403, it might be a god mode issue
        if (e.message && e.message.includes('403')) {
            console.error('[MarkupHelper] API returned 403 - you may need god mode to access markup conventions');
        }
        
        markupConventions = {};
    }
}

// Save custom convention to API
async function saveCustomConvention(convention, conventionId = null) {
    try {
        const url = conventionId 
            ? `/api/markup/conventions/${conventionId}`
            : '/api/markup/conventions';
        const method = conventionId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(convention)
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        const saved = await response.json();
        
        // Reload conventions to get updated list
        await loadCustomConventions();
        
        return saved;
    } catch (e) {
        console.error('Failed to save custom markup convention:', e);
        throw e;
    }
}

// Delete custom convention from API
async function deleteCustomConvention(conventionId) {
    try {
        const response = await fetch(`/api/markup/conventions/${conventionId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        // Reload conventions to get updated list
        await loadCustomConventions();
        
        return true;
    } catch (e) {
        console.error('Failed to delete custom markup convention:', e);
        throw e;
    }
}

// Load on initialization (async, but don't block)
loadCustomConventions().catch(e => console.error('Initial load failed:', e));

/**
 * Detect opening and closing sequences from a pattern
 * Supports: single (.text.), double (..text..), mixed (,.text.,)
 */
function detectConventionPattern(pattern) {
    if (!pattern || pattern.length < 1) return null;
    
    // Try to detect pattern type
    const len = pattern.length;
    const firstChar = pattern[0];
    const lastChar = pattern[len - 1];
    
    // Single character convention (e.g., ".text.")
    if (len === 1) {
        return {
            opening: firstChar,
            closing: firstChar,
            type: 'single'
        };
    }
    
    // Double character convention (e.g., "..text..")
    if (len === 2 && firstChar === lastChar) {
        return {
            opening: firstChar + firstChar,
            closing: lastChar + lastChar,
            type: 'double'
        };
    }
    
    // Mixed double convention (e.g., ",.text.,")
    if (len === 2 && firstChar !== lastChar) {
        return {
            opening: firstChar + lastChar,
            closing: lastChar + firstChar,
            type: 'mixed'
        };
    }
    
    // For longer patterns, assume symmetric
    const half = Math.floor(len / 2);
    const opening = pattern.substring(0, half);
    const closing = pattern.substring(half).split('').reverse().join('');
    
    return {
        opening: opening,
        closing: closing,
        type: 'custom'
    };
}

/**
 * Check for conflicts with existing conventions
 */
function checkConventionConflict(opening, closing) {
    // Note: loadCustomConventions is async, but this function is synchronous
    // The conventions should already be loaded when this is called
    const conflicts = [];
    
    for (const [key, convention] of Object.entries(markupConventions)) {
        if (convention.opening === opening && convention.closing === closing) {
            conflicts.push({ key, convention });
        }
    }
    
    return conflicts;
}

/**
 * Generate CSS for markup effects
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
 * Parse markup in text and convert to HTML spans
 * @param {string} text - Text with markup
 * @param {string} keywordColor - Color for <text> markup (default: '#ff00ff')
 * @returns {string} HTML with styled spans
 */
function parseMarkup(text, keywordColor = '#ff00ff') {
    if (!text) return '';

    // Note: loadCustomConventions is async, but this function is synchronous
    // The conventions should already be loaded when this is called
    const glowColor = keywordColor || '#ff00ff';
    
    // Use conventions from database
    const allConventions = markupConventions;
    
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
    
    // Now escape any remaining HTML that wasn't part of markup
    result = escapeHtml(result);
    
    // Replace placeholders with actual spans (they're already safe HTML)
    placeholders.forEach((span, index) => {
        result = result.replace(`__MARKUP_${index}__`, span);
    });
    
    return result;
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
 * Initialize typewriter effects on elements with data-typewriter attribute
 * This is called after HTML is inserted into the DOM
 * @param {HTMLElement} container - Container element to search for typewriter elements
 */
function initializeTypewriterEffects(container) {
    if (!container) return;
    
    // Find all typewriter elements, including nested ones
    const typewriterElements = container.querySelectorAll('[data-typewriter="true"]');
    
    typewriterElements.forEach((element, index) => {
        // Stop any existing animation for this element
        const existingId = element.getAttribute('data-typewriter-id');
        if (existingId && activeTypewriterTimeouts.has(existingId)) {
            clearTimeout(activeTypewriterTimeouts.get(existingId));
            activeTypewriterTimeouts.delete(existingId);
        }
        
        // Reset initialization state if content was replaced
        if (element.getAttribute('data-typewriter-initialized') === 'true') {
            // If content is empty or animating, it's already running - skip
            if (element.innerHTML === '' || element.getAttribute('data-typewriter-animating') === 'true') {
                return;
            }
            // Otherwise, content was replaced - re-initialize
            element.removeAttribute('data-typewriter-initialized');
            element.removeAttribute('data-typewriter-animating');
        }
        
        const delay = parseInt(element.getAttribute('data-typewriter-delay') || '100', 10);
        const fullContent = element.innerHTML;
        
        // If no content, skip
        if (!fullContent || fullContent.trim() === '') {
            return;
        }
        
        // Create unique ID for this animation
        const typewriterId = `tw_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
        element.setAttribute('data-typewriter-id', typewriterId);
        
        // Store original content and clear element
        element.setAttribute('data-typewriter-content', fullContent);
        element.innerHTML = '';
        element.style.visibility = 'visible';
        element.setAttribute('data-typewriter-initialized', 'true');
        element.setAttribute('data-typewriter-animating', 'true');
        
        // Parse HTML content into segments (tags, entities, text)
        const segments = parseHtmlForTypewriter(fullContent);
        let currentIndex = 0;
        
        function typeNext() {
            // Check if animation was cancelled (element removed or re-initialized)
            if (element.getAttribute('data-typewriter-id') !== typewriterId) {
                activeTypewriterTimeouts.delete(typewriterId);
                return;
            }
            
            if (currentIndex >= segments.length) {
                // Animation complete
                element.removeAttribute('data-typewriter-animating');
                activeTypewriterTimeouts.delete(typewriterId);
                return; // Done
            }
            
            const segment = segments[currentIndex];
            if (segment.isTag) {
                // For HTML tags, append immediately
                element.innerHTML += segment.content;
                currentIndex++;
                typeNext();
            } else {
                // For text/entities, append character by character
                const char = segment.content[0];
                element.innerHTML += char;
                segment.content = segment.content.substring(1);
                
                if (segment.content.length === 0) {
                    currentIndex++;
                }
                
                if (currentIndex < segments.length || segment.content.length > 0) {
                    const timeoutId = setTimeout(typeNext, delay);
                    activeTypewriterTimeouts.set(typewriterId, timeoutId);
                } else {
                    // Animation complete
                    element.removeAttribute('data-typewriter-animating');
                    activeTypewriterTimeouts.delete(typewriterId);
                }
            }
        }
        
        // Start typing
        typeNext();
    });
}

/**
 * Parse HTML into segments for typewriter effect
 * Handles HTML tags and entities as single units
 */
function parseHtmlForTypewriter(html) {
    const segments = [];
    let i = 0;
    
    while (i < html.length) {
        if (html[i] === '<') {
            // Find end of tag
            const tagEnd = html.indexOf('>', i);
            if (tagEnd !== -1) {
                segments.push({
                    content: html.substring(i, tagEnd + 1),
                    isTag: true
                });
                i = tagEnd + 1;
            } else {
                segments.push({ content: html[i], isTag: false });
                i++;
            }
        } else if (html[i] === '&') {
            // Handle HTML entities
            const entityEnd = html.indexOf(';', i);
            if (entityEnd !== -1 && entityEnd - i < 10) {
                segments.push({
                    content: html.substring(i, entityEnd + 1),
                    isTag: false
                });
                i = entityEnd + 1;
            } else {
                segments.push({ content: html[i], isTag: false });
                i++;
            }
        } else {
            segments.push({ content: html[i], isTag: false });
            i++;
        }
    }
    
    return segments;
}

/**
 * Show markup reference modal with custom markup editor
 */
async function showMarkupReference(editorName = 'Editor') {
    // Remove existing modal if present
    const existing = document.getElementById('markupReferenceModal');
    if (existing) existing.remove();

    // Reload data from API
    await loadCustomConventions();
    
    // Debug: Log what we loaded
    console.log(`[MarkupHelper] Showing markup reference. Conventions loaded:`, Object.keys(markupConventions).length);
    if (Object.keys(markupConventions).length > 0) {
        console.log(`[MarkupHelper] Convention keys:`, Object.keys(markupConventions));
    }
    
    const modal = document.createElement('div');
    modal.id = 'markupReferenceModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
        font-family: 'Courier New', monospace;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: #001a00;
        border: 2px solid #00ff00;
        padding: 20px;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        color: #00ff00;
        position: relative;
    `;
    
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #006600; padding-bottom: 10px;">
            <h2 style="margin: 0; color: #00ffff;">Markup Reference - ${editorName}</h2>
            <button id="closeMarkupModal" style="background: #330000; border: 1px solid #ff0000; color: #ff6666; padding: 5px 10px; cursor: pointer; font-size: 16px;">×</button>
        </div>
        <div style="margin-bottom: 20px;">
            <p style="color: #888; font-size: 12px; margin-bottom: 15px;">
                Use these markup conventions to add visual effects to your text. Markup is processed when text is displayed in-game.
            </p>
    `;
    
    // Show all conventions from database
    let conventionIndex = 0;
    const conventionKeys = Object.keys(markupConventions); // Store keys for deletion
    
    // Debug: Log conventions before rendering
    console.log(`[MarkupHelper] Rendering ${conventionKeys.length} conventions`);
    console.log(`[MarkupHelper] Conventions object:`, markupConventions);
    
    if (conventionKeys.length === 0) {
        html += `
            <div style="margin-top: 20px; margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <p style="color: #888; font-size: 12px; margin: 0; margin-bottom: 10px;">
                    No custom markup conventions found in the database.
                </p>
                <p style="color: #ff8800; font-size: 11px; margin: 0;">
                    <strong>Note:</strong> If you created conventions that are working in-game but not showing here, 
                    they may need to be recreated. The server cache will reload automatically when you create new conventions.
                </p>
                <p style="color: #888; font-size: 11px; margin: 5px 0 0 0;">
                    Create a new convention below, or ask ZORK to create one for you.
                </p>
            </div>
        `;
    }
    
    Object.entries(markupConventions).forEach(([key, convention]) => {
        console.log(`[MarkupHelper] Rendering convention: ${key}`, convention);
        // Escape syntax for display in code tag (make it editable)
        const syntaxDisplay = escapeHtml(convention.syntax);
        const syntaxInputId = `conventionSyntax_${conventionIndex}`;
        const exampleId = `markupExample_${conventionIndex}`;
        const exampleTextId = `conventionExampleText_${conventionIndex}`;
        const hasEffects = convention.effects && Object.keys(convention.effects).length > 0;
        const replayButton = hasEffects ? `<button id="replayConvention_${conventionIndex}" style="background: #003300; border: 1px solid #00ff00; color: #00ff00; padding: 3px 8px; cursor: pointer; font-size: 10px; margin-left: 5px; font-family: 'Courier New', monospace;">↻ Replay</button>` : '';
        const deleteButton = `<button id="deleteConvention_${conventionIndex}" style="background: #330000; border: 1px solid #ff0000; color: #ff6666; padding: 3px 8px; cursor: pointer; font-size: 10px; margin-left: 5px; font-family: 'Courier New', monospace;">✕ Delete</button>`;
        html += `
            <div id="convention_${conventionIndex}" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <code id="${syntaxInputId}" contenteditable="true" style="background: #002200; padding: 5px 10px; color: #00ff00; font-size: 14px; cursor: text; min-width: 80px; display: inline-block; border: 1px solid transparent;" onblur="this.style.border='1px solid transparent'" onfocus="this.style.border='1px solid #00ff00'">${syntaxDisplay}</code>
                    <span style="color: #888; font-size: 12px;">${convention.description}</span>
                </div>
                <div style="margin-top: 10px;">
                    <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 5px;">
                        <span style="color: #888; font-size: 11px;">Example Text:</span>
                        ${replayButton}
                        ${deleteButton}
                    </div>
                    <input type="text" id="${exampleTextId}" value="${escapeHtml(convention.example)}" style="width: 100%; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px; font-family: 'Courier New', monospace; font-size: 12px; margin-bottom: 5px;">
                    <div id="${exampleId}" style="margin-top: 5px; padding: 8px; background: #000; border: 1px solid #003300; color: #00ff00;">
                        ${parseMarkup(convention.example, '#00ffff')}
                    </div>
                </div>
            </div>
        `;
        conventionIndex++;
    });
    
    // Custom markup editor
    html += `
            <div style="margin-top: 30px; padding: 20px; background: rgba(50, 0, 0, 0.3); border: 1px solid #660000;">
                <h3 style="margin-top: 0; color: #ff6666;">Add Custom Markup</h3>
                <p style="color: #888; font-size: 11px; margin-bottom: 15px;">
                    Create custom markup conventions. Enter opening characters (closing is automatically determined).
                </p>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; color: #888; font-size: 11px; margin-bottom: 5px;">Opening Sequence:</label>
                    <input type="text" id="newMarkupOpening" placeholder="e.g., . or .. or ,." maxlength="4" style="width: 200px; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px; font-family: 'Courier New', monospace;">
                    <span style="color: #888; font-size: 10px; margin-left: 10px;">Examples: . (single), .. (double), ,. (mixed)</span>
                </div>
                
                <div id="markupConflictWarning" style="display: none; padding: 10px; background: rgba(100, 0, 0, 0.5); border: 1px solid #ff0000; margin-bottom: 15px; color: #ff6666; font-size: 11px;">
                    <strong>Conflict detected!</strong> This convention already exists. Would you like to edit it or choose another?
                    <div style="margin-top: 10px;">
                        <button id="editConflictBtn" style="background: #003300; border: 1px solid #00ff00; color: #00ff00; padding: 5px 15px; cursor: pointer; margin-right: 10px;">Edit Existing</button>
                        <button id="cancelConflictBtn" style="background: #330000; border: 1px solid #ff0000; color: #ff6666; padding: 5px 15px; cursor: pointer;">Cancel</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; color: #888; font-size: 11px; margin-bottom: 5px;">Color:</label>
                    <select id="newMarkupColor" style="width: 200px; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px; font-family: 'Courier New', monospace;">
                        <option value="inherit">Inherit (preserve parent color)</option>
                        <option value="keyword">Keyword/NPC Color</option>
    `;
    
    // Add color options
    MARKUP_COLORS.forEach(color => {
        html += `<option value="${color.value}">${color.name}</option>`;
    });
    
    html += `
                    </select>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; color: #888; font-size: 11px; margin-bottom: 5px;">Effects:</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" id="newMarkupGlow" checked>
                            <span>Glow</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" id="newMarkupBold">
                            <span>Bold</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" id="newMarkupFlash">
                            <span>Flash</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" id="newMarkupPulse">
                            <span>Pulse</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" id="newMarkupTypewriter">
                            <span>Typewriter</span>
                        </label>
                    </div>
                </div>
                
                <div id="typewriterDelayContainer" style="display: none; margin-top: 10px; margin-bottom: 15px;">
                    <label style="display: block; color: #888; font-size: 11px; margin-bottom: 5px;">Typewriter Delay (ms):</label>
                    <input type="number" id="newMarkupTypewriterDelay" value="100" min="10" max="1000" step="10" style="width: 150px; background: #002200; border: 1px solid #006600; color: #00ff00; padding: 5px; font-family: 'Courier New', monospace;">
                    <span style="color: #888; font-size: 10px; margin-left: 10px;">Delay between characters (10-1000ms)</span>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: rgba(0, 0, 0, 0.5); border: 1px solid #003300;">
                    <h4 style="margin-top: 0; color: #00ffff; font-size: 12px;">Test & Preview</h4>
                    <textarea id="markupTestInput" placeholder="Type your text with markup here to see a preview... (e.g., <test> or [test] or !test! or ..test..)" style="width: 100%; min-height: 60px; background: #000; border: 1px solid #003300; color: #00ff00; padding: 8px; font-family: 'Courier New', monospace; font-size: 12px; margin-bottom: 10px;"></textarea>
                    <div style="padding: 10px; background: #000; border: 1px solid #003300; min-height: 40px;">
                        <span style="color: #888; font-size: 10px;">Preview:</span>
                        <div id="markupTestOutput" style="margin-top: 5px; min-height: 20px; color: #00ff00; font-family: 'Courier New', monospace;"></div>
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <button id="saveMarkupBtn" style="background: #003300; border: 1px solid #00ff00; color: #00ff00; padding: 8px 20px; cursor: pointer; font-weight: bold;">Save Custom Markup</button>
                </div>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Store the count for later use
    const totalConventions = conventionIndex;
    
    // Store convention examples for replay
    const conventionExamples = [];
    
    // Store examples with keys for reference
    Object.entries(markupConventions).forEach(([key, convention]) => {
        conventionExamples.push({
            key: key,
            example: convention.example,
            effects: convention.effects
        });
    });
    
    /**
     * Replay effect for an example
     * Returns the element (may be a new element if replaced for CSS animations)
     */
    function replayEffect(exampleDiv, exampleText, effects) {
        // Stop any existing typewriter animations
        const existingTypewriters = exampleDiv.querySelectorAll('[data-typewriter="true"]');
        existingTypewriters.forEach(el => {
            const id = el.getAttribute('data-typewriter-id');
            if (id && activeTypewriterTimeouts.has(id)) {
                clearTimeout(activeTypewriterTimeouts.get(id));
                activeTypewriterTimeouts.delete(id);
            }
        });
        
        // Store the original ID and parent
        const originalId = exampleDiv.id;
        const parent = exampleDiv.parentNode;
        
        // For CSS animations (flash, pulse), we need to force a reflow to restart them
        // This is done by removing and re-adding the element
        if (effects && (effects.flash || effects.pulse)) {
            // Force animation restart by cloning the element
            const cloned = exampleDiv.cloneNode(false); // Clone without children
            cloned.id = originalId; // Preserve ID
            cloned.style.cssText = exampleDiv.style.cssText; // Preserve styles
            cloned.innerHTML = parseMarkup(exampleText, '#00ffff'); // Re-render with fresh markup
            parent.replaceChild(cloned, exampleDiv);
            
            // Re-initialize typewriter if needed
            if (effects.typewriter && typeof initializeTypewriterEffects === 'function') {
                setTimeout(() => {
                    initializeTypewriterEffects(cloned);
                }, 50);
            }
            
            return cloned; // Return new element
        } else {
            // For non-animation effects or typewriter-only, just re-render
            exampleDiv.innerHTML = parseMarkup(exampleText, '#00ffff');
            
            // Re-initialize typewriter effect if needed
            if (effects && effects.typewriter && typeof initializeTypewriterEffects === 'function') {
                setTimeout(() => {
                    initializeTypewriterEffects(exampleDiv);
                }, 50);
            }
            
            return exampleDiv; // Return same element
        }
    }
    
        // Initialize typewriter effects for all example displays (after DOM is ready)
        // This must happen after modal is appended to document.body
        setTimeout(() => {
        // Initialize typewriter effects in all convention examples
        for (let i = 0; i < totalConventions; i++) {
            const exampleDiv = document.getElementById(`markupExample_${i}`);
            if (exampleDiv && typeof initializeTypewriterEffects === 'function') {
                initializeTypewriterEffects(exampleDiv);
            }
        }
        
        // Set up editable text handlers (moved here to ensure DOM is ready)
        
        /**
         * Extract text value from syntax (e.g., "<text>" -> "text", "[text]" -> "text", "!text!" -> "text", "<test text one>" -> "test text one")
         */
        function extractTextFromSyntax(syntax) {
            if (!syntax || syntax.length < 2) {
                return 'text';
            }
            
            // Try specific patterns first (more reliable)
            const specificPatterns = [
                /^<(.+?)>$/,  // <text> or <test text one>
                /^\[(.+?)\]$/, // [text] or [test text one]
                /^!(.+?)!$/,   // !text! or !test text one!
            ];
            
            for (const pattern of specificPatterns) {
                const match = syntax.match(pattern);
                if (match && match[1]) {
                    return match[1]; // Return the captured text (full string)
                }
            }
            
            // Fallback: try to extract anything between first and last character
            // This handles custom syntax patterns
            if (syntax.length > 2) {
                return syntax.substring(1, syntax.length - 1);
            }
            
            return 'text'; // fallback
        }
        
        
        // Add editable syntax handlers for conventions
        for (let i = 0; i < totalConventions; i++) {
            const syntaxElement = document.getElementById(`conventionSyntax_${i}`);
            const exampleTextInput = document.getElementById(`conventionExampleText_${i}`);
            if (syntaxElement && conventionExamples[i]) {
                const key = conventionExamples[i].key;
                const convention = markupConventions[key];
                
                syntaxElement.addEventListener('blur', async () => {
                    const newSyntax = syntaxElement.textContent.trim();
                    if (newSyntax && newSyntax !== convention.syntax) {
                        // Update stored syntax
                        markupConventions[key].syntax = newSyntax;
                        
                        // Extract opening and closing from syntax
                        const textValue = extractTextFromSyntax(newSyntax);
                        const opening = convention.opening;
                        const closing = convention.closing;
                        
                        // Update example text based on new syntax
                        const currentExample = convention.example || '';
                        const escapedOpening = opening.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const escapedClosing = closing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const pattern = new RegExp(`${escapedOpening}([^${escapedClosing}]+)${escapedClosing}`, 'g');
                        const newExampleText = currentExample.replace(pattern, (match, oldText) => {
                            return `${opening}${textValue}${closing}`;
                        });
                        
                        // If no replacement happened, create a new example
                        const finalExample = pattern.test(currentExample) ? newExampleText : `This is ${opening}${textValue}${closing} with effects.`;
                        markupConventions[key].example = finalExample;
                        
                        // Update the example input field
                        if (exampleTextInput) {
                            exampleTextInput.value = finalExample;
                        }
                        
                        // Save to API
                        try {
                            const conventionId = parseInt(key.replace('convention_', ''));
                            if (!isNaN(conventionId)) {
                                await saveCustomConvention(markupConventions[key], conventionId);
                            }
                        } catch (err) {
                            console.error('Failed to save convention syntax:', err);
                            alert('Failed to save: ' + err.message);
                        }
                        
                        // Update example display
                        const exampleDiv = document.getElementById(`markupExample_${i}`);
                        if (exampleDiv) {
                            exampleDiv.innerHTML = parseMarkup(finalExample, '#00ffff');
                            if (convention.effects?.typewriter && typeof initializeTypewriterEffects === 'function') {
                                setTimeout(() => {
                                    initializeTypewriterEffects(exampleDiv);
                                }, 50);
                            }
                        }
                    }
                });
                
                // Prevent Enter key from creating new lines
                syntaxElement.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        syntaxElement.blur();
                    }
                });
            }
        }
        
        // Add editable text input handlers for conventions
        for (let i = 0; i < totalConventions; i++) {
            const exampleTextInput = document.getElementById(`conventionExampleText_${i}`);
            const exampleDiv = document.getElementById(`markupExample_${i}`);
            if (exampleTextInput && exampleDiv && conventionExamples[i]) {
                let saveTimeout = null;
                exampleTextInput.addEventListener('input', () => {
                    const newText = exampleTextInput.value;
                    // Update stored text in convention
                    const key = conventionExamples[i].key;
                    if (markupConventions[key]) {
                        markupConventions[key].example = newText;
                        
                        // Debounce saving to API
                        if (saveTimeout) {
                            clearTimeout(saveTimeout);
                        }
                        saveTimeout = setTimeout(async () => {
                            try {
                                // Extract convention ID from key (convention_<id>)
                                const conventionId = parseInt(key.replace('convention_', ''));
                                if (!isNaN(conventionId)) {
                                    const convention = markupConventions[key];
                                    await saveCustomConvention(convention, conventionId);
                                }
                            } catch (err) {
                                console.error('Failed to save convention:', err);
                                alert('Failed to save: ' + err.message);
                            }
                        }, 500);
                    }
                    // Update display
                    exampleDiv.innerHTML = parseMarkup(newText, '#00ffff');
                    // Re-initialize typewriter if needed
                    if (conventionExamples[i].effects?.typewriter && typeof initializeTypewriterEffects === 'function') {
                        setTimeout(() => {
                            initializeTypewriterEffects(exampleDiv);
                        }, 50);
                    }
                });
            }
        }
        
        // Add replay button handlers for conventions
        for (let i = 0; i < totalConventions; i++) {
            const replayBtn = document.getElementById(`replayConvention_${i}`);
            if (replayBtn && conventionExamples[i]) {
                replayBtn.addEventListener('click', () => {
                    const exampleDiv = document.getElementById(`markupExample_${i}`);
                    const exampleTextInput = document.getElementById(`conventionExampleText_${i}`);
                    if (exampleDiv && exampleTextInput) {
                        const currentText = exampleTextInput.value;
                        replayEffect(exampleDiv, currentText, conventionExamples[i].effects);
                    }
                });
            }
        }
        
        // Add delete button handlers for conventions
        for (let i = 0; i < totalConventions; i++) {
            const deleteBtn = document.getElementById(`deleteConvention_${i}`);
            if (deleteBtn && conventionExamples[i]) {
                deleteBtn.addEventListener('click', async () => {
                    const key = conventionExamples[i].key;
                    if (confirm(`Are you sure you want to delete the markup convention "${markupConventions[key]?.syntax || key}"?`)) {
                        try {
                            // Extract convention ID from key (convention_<id>)
                            const conventionId = parseInt(key.replace('convention_', ''));
                            if (!isNaN(conventionId)) {
                                await deleteCustomConvention(conventionId);
                                // Remove from DOM
                                const conventionDiv = document.getElementById(`convention_${i}`);
                                if (conventionDiv) {
                                    conventionDiv.remove();
                                }
                            } else {
                                throw new Error('Invalid convention ID');
                            }
                        } catch (err) {
                            console.error('Failed to delete convention:', err);
                            alert('Failed to delete: ' + err.message);
                        }
                    }
                });
            }
        }
    }, 200); // Give DOM time to render
    
    // Add CSS animations if not already added
    if (!document.getElementById('markupAnimations')) {
        const style = document.createElement('style');
        style.id = 'markupAnimations';
        style.textContent = `
            @keyframes markup-flash {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
            @keyframes markup-pulse {
                0%, 100% { font-size: 1em; }
                50% { font-size: 0.75em; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Close button handler
    document.getElementById('closeMarkupModal').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Test input handler (live preview)
    const testInput = document.getElementById('markupTestInput');
    const testOutput = document.getElementById('markupTestOutput');
    let previewTimeout = null;
    
    testInput.addEventListener('input', () => {
        const testText = testInput.value;
        
        // Clear any existing timeout
        if (previewTimeout) {
            clearTimeout(previewTimeout);
        }
        
        // Debounce the preview update slightly to avoid re-initializing during typing
        previewTimeout = setTimeout(() => {
            if (testText.trim()) {
                // Stop any existing typewriter animations in the preview
                const existingTypewriters = testOutput.querySelectorAll('[data-typewriter="true"]');
                existingTypewriters.forEach(el => {
                    const id = el.getAttribute('data-typewriter-id');
                    if (id && activeTypewriterTimeouts.has(id)) {
                        clearTimeout(activeTypewriterTimeouts.get(id));
                        activeTypewriterTimeouts.delete(id);
                    }
                });
                
                // Parse and render the markup
                const parsed = parseMarkup(testText, '#00ffff');
                testOutput.innerHTML = parsed;
                
                // Initialize typewriter effects if any were created
                // Use local function (defined in this file) or global if available
                if (typeof initializeTypewriterEffects === 'function') {
                    // Small delay to ensure DOM is updated
                    setTimeout(() => {
                        initializeTypewriterEffects(testOutput);
                    }, 50);
                } else if (typeof window !== 'undefined' && typeof window.initializeTypewriterEffects === 'function') {
                    setTimeout(() => {
                        window.initializeTypewriterEffects(testOutput);
                    }, 50);
                }
            } else {
                // Stop any existing animations when clearing
                const existingTypewriters = testOutput.querySelectorAll('[data-typewriter="true"]');
                existingTypewriters.forEach(el => {
                    const id = el.getAttribute('data-typewriter-id');
                    if (id && activeTypewriterTimeouts.has(id)) {
                        clearTimeout(activeTypewriterTimeouts.get(id));
                        activeTypewriterTimeouts.delete(id);
                    }
                });
                testOutput.innerHTML = '<span style="color: #666;">Type markup above to see preview...</span>';
            }
        }, 300); // Debounce 300ms
    });
    
    // Initial preview message
    testOutput.innerHTML = '<span style="color: #666;">Type markup above to see preview...</span>';
    
    // Opening sequence input handler (check for conflicts)
    const openingInput = document.getElementById('newMarkupOpening');
    const conflictWarning = document.getElementById('markupConflictWarning');
    let currentConflict = null;
    
    openingInput.addEventListener('input', () => {
        const opening = openingInput.value.trim();
        if (opening) {
            const pattern = detectConventionPattern(opening);
            if (pattern) {
                const conflicts = checkConventionConflict(pattern.opening, pattern.closing);
                if (conflicts.length > 0) {
                    currentConflict = conflicts[0];
                    conflictWarning.style.display = 'block';
                } else {
                    currentConflict = null;
                    conflictWarning.style.display = 'none';
                }
            } else {
                conflictWarning.style.display = 'none';
            }
        } else {
            conflictWarning.style.display = 'none';
        }
    });
    
    // Typewriter checkbox handler - show/hide delay input
    const typewriterCheckbox = document.getElementById('newMarkupTypewriter');
    const typewriterDelayContainer = document.getElementById('typewriterDelayContainer');
    if (typewriterCheckbox && typewriterDelayContainer) {
        typewriterCheckbox.addEventListener('change', () => {
            typewriterDelayContainer.style.display = typewriterCheckbox.checked ? 'block' : 'none';
        });
    }
    
    // Edit conflict button
    document.getElementById('editConflictBtn').addEventListener('click', () => {
        if (currentConflict) {
            // Load existing convention for editing
            const existing = currentConflict.convention;
            openingInput.value = existing.opening;
            document.getElementById('newMarkupColor').value = existing.color || 'inherit';
            document.getElementById('newMarkupGlow').checked = existing.effects?.glow || false;
            document.getElementById('newMarkupBold').checked = existing.effects?.bold || false;
            document.getElementById('newMarkupFlash').checked = existing.effects?.flash || false;
            document.getElementById('newMarkupPulse').checked = existing.effects?.pulse || false;
            const typewriterChecked = existing.effects?.typewriter || false;
            document.getElementById('newMarkupTypewriter').checked = typewriterChecked;
            if (typewriterDelayContainer) {
                typewriterDelayContainer.style.display = typewriterChecked ? 'block' : 'none';
            }
            document.getElementById('newMarkupTypewriterDelay').value = existing.effects?.typewriterDelay || 100;
            conflictWarning.style.display = 'none';
        }
    });
    
    // Cancel conflict button
    document.getElementById('cancelConflictBtn').addEventListener('click', () => {
        openingInput.value = '';
        conflictWarning.style.display = 'none';
        currentConflict = null;
    });
    
    // Save markup button
    document.getElementById('saveMarkupBtn').addEventListener('click', async () => {
        const opening = openingInput.value.trim();
        if (!opening) {
            alert('Please enter an opening sequence.');
            return;
        }
        
        const pattern = detectConventionPattern(opening);
        if (!pattern) {
            alert('Invalid pattern. Use 1-4 characters (e.g., . or .. or ,.)');
            return;
        }
        
        // Check for conflicts (unless editing)
        if (!currentConflict) {
            const conflicts = checkConventionConflict(pattern.opening, pattern.closing);
            if (conflicts.length > 0) {
                alert('This convention already exists. Please edit the existing one or choose a different pattern.');
                return;
            }
        }
        
        const color = document.getElementById('newMarkupColor').value;
        const typewriterChecked = document.getElementById('newMarkupTypewriter').checked;
        const typewriterDelay = parseInt(document.getElementById('newMarkupTypewriterDelay').value) || 100;
        
        const effects = {
            glow: document.getElementById('newMarkupGlow').checked,
            bold: document.getElementById('newMarkupBold').checked,
            flash: document.getElementById('newMarkupFlash').checked,
            pulse: document.getElementById('newMarkupPulse').checked,
            typewriter: typewriterChecked,
            typewriterDelay: typewriterChecked ? typewriterDelay : undefined
        };
        
        // Generate syntax display
        const syntax = `${pattern.opening}text${pattern.closing}`;
        
        // Create convention object
        const effectNames = Object.keys(effects).filter(k => effects[k] && k !== 'typewriterDelay');
        const description = effectNames.length > 0 
            ? `Custom markup with ${effectNames.join(', ')} effects`
            : 'Custom markup with no effects';
        const convention = {
            syntax: syntax,
            opening: pattern.opening,
            closing: pattern.closing,
            description: description,
            example: `This is ${syntax.replace('text', 'custom text')} with effects.`,
            color: color,
            effects: effects
        };
        
        // Save the convention to API
        try {
            if (currentConflict) {
                // Update existing convention
                const conventionId = parseInt(currentConflict.key.replace('convention_', ''));
                if (!isNaN(conventionId)) {
                    await saveCustomConvention(convention, conventionId);
                } else {
                    throw new Error('Invalid convention ID');
                }
            } else {
                // Create new convention
                await saveCustomConvention(convention);
            }
            
            // Refresh the modal to show new convention
            modal.remove();
            showMarkupReference(editorName);
        } catch (err) {
            console.error('Failed to save custom convention:', err);
            alert('Failed to save: ' + err.message);
        }
    });
}

/**
 * Create markup button (μ) next to close button
 */
function createMarkupButton(editorName, closeButton) {
    const existing = document.getElementById(`markupBtn_${editorName}`);
    if (existing) return existing;
    
    if (!closeButton || !closeButton.parentNode) {
        console.warn('Cannot create markup button: close button or parent not found');
        return null;
    }
    
    const markupBtn = document.createElement('button');
    markupBtn.id = `markupBtn_${editorName}`;
    markupBtn.innerHTML = 'μ';
    markupBtn.title = 'Markup Reference';
    markupBtn.style.cssText = `
        position: relative;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #003300;
        border: 1px solid #00ff00;
        color: #00ff00;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        font-family: 'Courier New', monospace;
        vertical-align: middle;
    `;
    
    markupBtn.addEventListener('mouseenter', () => {
        markupBtn.style.background = '#004400';
        markupBtn.style.borderColor = '#00ff88';
    });
    
    markupBtn.addEventListener('mouseleave', () => {
        markupBtn.style.background = '#003300';
        markupBtn.style.borderColor = '#00ff00';
    });
    
    markupBtn.addEventListener('click', async () => {
        await showMarkupReference(editorName);
    });
    
    const header = closeButton.parentNode;
    if (header) {
        header.insertBefore(markupBtn, closeButton);
    }
    
    return markupBtn;
}

// Make functions globally available
window.parseMarkup = parseMarkup;
window.showMarkupReference = showMarkupReference;
window.createMarkupButton = createMarkupButton;
window.MARKUP_COLORS = MARKUP_COLORS;

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseMarkup,
        showMarkupReference,
        createMarkupButton,
        MARKUP_COLORS
    };
}
