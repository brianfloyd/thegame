/**
 * Markup Helper - Shared utility for text markup conventions
 * Used across all editors (NPC, Map, Item, Player, etc.)
 */

// High-contrast color palette (16 colors)
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
    { name: 'Emerald', value: '#00cc88' }
];

// Built-in markup conventions
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

// Custom markup conventions (loaded from localStorage)
let customMarkupConventions = {};

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

// Save custom conventions to localStorage
function saveCustomConventions() {
    try {
        localStorage.setItem('customMarkupConventions', JSON.stringify(customMarkupConventions));
    } catch (e) {
        console.error('Failed to save custom markup conventions:', e);
    }
}

// Load on initialization
loadCustomConventions();

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
    loadCustomConventions(); // Reload to get latest
    const allConventions = { ...MARKUP_CONVENTIONS, ...customMarkupConventions };
    const conflicts = [];
    
    for (const [key, convention] of Object.entries(allConventions)) {
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
        css += `animation: markup-pulse 2s ease infinite;`;
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show markup reference modal with custom markup editor
 */
function showMarkupReference(editorName = 'Editor') {
    // Remove existing modal if present
    const existing = document.getElementById('markupReferenceModal');
    if (existing) existing.remove();
    
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
    
    // List all current conventions (built-in first)
    Object.entries(MARKUP_CONVENTIONS).forEach(([key, convention]) => {
        // Escape syntax for display in code tag
        const syntaxDisplay = escapeHtml(convention.syntax);
        html += `
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <code style="background: #002200; padding: 5px 10px; color: #00ff00; font-size: 14px;">${syntaxDisplay}</code>
                    <span style="color: #888; font-size: 12px;">${convention.description}</span>
                </div>
                <div style="margin-top: 10px;">
                    <span style="color: #888; font-size: 11px;">Example:</span>
                    <div style="margin-top: 5px; padding: 8px; background: #000; border: 1px solid #003300; color: #00ff00;">
                        ${parseMarkup(convention.example, '#00ffff')}
                    </div>
                </div>
            </div>
        `;
    });
    
    // Then show custom conventions
    loadCustomConventions();
    Object.entries(customMarkupConventions).forEach(([key, convention]) => {
        // Escape syntax for display in code tag
        const syntaxDisplay = escapeHtml(convention.syntax);
        html += `
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(0, 50, 0, 0.3); border: 1px solid #006600;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <code style="background: #002200; padding: 5px 10px; color: #00ff00; font-size: 14px;">${syntaxDisplay}</code>
                    <span style="color: #888; font-size: 12px;">${convention.description}</span>
                    <span style="color: #ff8800; font-size: 10px; margin-left: auto;">(Custom)</span>
                </div>
                <div style="margin-top: 10px;">
                    <span style="color: #888; font-size: 11px;">Example:</span>
                    <div style="margin-top: 5px; padding: 8px; background: #000; border: 1px solid #003300; color: #00ff00;">
                        ${parseMarkup(convention.example, '#00ffff')}
                    </div>
                </div>
            </div>
        `;
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
                    </div>
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
    testInput.addEventListener('input', () => {
        const testText = testInput.value;
        if (testText.trim()) {
            // Parse and render the markup
            const parsed = parseMarkup(testText, '#00ffff');
            testOutput.innerHTML = parsed;
        } else {
            testOutput.innerHTML = '<span style="color: #666;">Type markup above to see preview...</span>';
        }
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
    document.getElementById('saveMarkupBtn').addEventListener('click', () => {
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
        const effects = {
            glow: document.getElementById('newMarkupGlow').checked,
            bold: document.getElementById('newMarkupBold').checked,
            flash: document.getElementById('newMarkupFlash').checked,
            pulse: document.getElementById('newMarkupPulse').checked
        };
        
        // Generate syntax display
        const syntax = `${pattern.opening}text${pattern.closing}`;
        
        // Create convention object
        const conventionKey = currentConflict ? currentConflict.key : `custom_${Date.now()}`;
        const convention = {
            syntax: syntax,
            opening: pattern.opening,
            closing: pattern.closing,
            description: `Custom markup with ${Object.keys(effects).filter(k => effects[k]).join(', ') || 'no'} effects`,
            example: `This is ${syntax.replace('text', 'custom text')} with effects.`,
            color: color,
            effects: effects
        };
        
        // Save the convention
        customMarkupConventions[conventionKey] = convention;
        saveCustomConventions();
        
        // Refresh the modal to show new convention
        modal.remove();
        showMarkupReference(editorName);
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
    
    markupBtn.addEventListener('click', () => {
        showMarkupReference(editorName);
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
window.MARKUP_CONVENTIONS = MARKUP_CONVENTIONS;
window.MARKUP_COLORS = MARKUP_COLORS;

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseMarkup,
        showMarkupReference,
        createMarkupButton,
        MARKUP_CONVENTIONS,
        MARKUP_COLORS
    };
}
