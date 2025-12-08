/**
 * Simple Markdown Parser for Terminal Messages
 * 
 * Converts markdown syntax to HTML for better formatting in terminal
 * Supports: line breaks, bulleted lists, numbered lists, bold, italic, code blocks
 */

/**
 * Convert markdown to HTML
 * @param {string} text - Markdown text
 * @returns {string} - HTML with markdown converted
 */
export function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Normalize line breaks
    let result = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Process line by line to handle lists properly
    const lines = result.split('\n');
    const processedLines = [];
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    let listItems = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Check for bulleted list item (must be at start of line or after whitespace)
        const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
        // Check for numbered list item
        const numberMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        
        if (bulletMatch) {
            // Bulleted list item
            if (!inList || listType !== 'ul') {
                // Close previous list if any
                if (inList && listItems.length > 0) {
                    processedLines.push(listItems.join(''));
                    processedLines.push(`</${listType}>`);
                }
                // Start new bulleted list
                processedLines.push('<ul>');
                inList = true;
                listType = 'ul';
                listItems = [];
            }
            listItems.push(`<li>${bulletMatch[1]}</li>`);
        } else if (numberMatch) {
            // Numbered list item
            if (!inList || listType !== 'ol') {
                // Close previous list if any
                if (inList && listItems.length > 0) {
                    processedLines.push(listItems.join(''));
                    processedLines.push(`</${listType}>`);
                }
                // Start new numbered list
                processedLines.push('<ol>');
                inList = true;
                listType = 'ol';
                listItems = [];
            }
            listItems.push(`<li>${numberMatch[2]}</li>`);
        } else {
            // Not a list item
            if (inList && listItems.length > 0) {
                // Close current list
                processedLines.push(listItems.join(''));
                processedLines.push(`</${listType}>`);
                inList = false;
                listType = null;
                listItems = [];
            }
            // Add regular line (preserve original line)
            processedLines.push(line);
        }
    }
    
    // Close any open list
    if (inList && listItems.length > 0) {
        processedLines.push(listItems.join(''));
        processedLines.push(`</${listType}>`);
    }
    
    result = processedLines.join('\n');
    
    // Convert **bold** to <strong>
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em> (but not if it's part of **bold**)
    // Match *text* but not **text** or *text* that's part of **text**
    result = result.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    
    // Convert `code` to <code>
    result = result.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    
    // Convert line breaks to <br> (but preserve HTML tags)
    // We need to be careful not to break HTML tags
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

/**
 * Combine markdown and markup parsing
 * First parse markdown, then parse markup syntax
 * @param {string} text - Text with markdown and markup
 * @param {string} keywordColor - Color for markup keywords
 * @param {Function} parseMarkupFn - Function to parse markup (from Markup.js)
 * @returns {string} - HTML with both markdown and markup processed
 */
export function parseMarkdownAndMarkup(text, keywordColor = '#00ffff', parseMarkupFn) {
    if (!text || typeof text !== 'string') return '';
    
    // First parse markdown to get HTML structure
    let html = parseMarkdown(text);
    
    // Then parse markup syntax within the HTML
    if (parseMarkupFn && typeof parseMarkupFn === 'function') {
        html = parseMarkupFn(html, keywordColor);
    }
    
    return html;
}
