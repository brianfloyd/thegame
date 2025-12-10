/**
 * Ticket Model
 * 
 * Canonical Ticket model used across the entire application:
 * - TicketsWidget (game UI)
 * - Ticket Editor (god-mode)
 * - WebSocket handlers
 * - MCP tools
 * 
 * Normalizes field names to snake_case and maps DB rows to Ticket objects.
 */

/**
 * Valid ticket statuses
 */
const TICKET_STATUSES = ['open', 'backlog', 'in_progress', 'resolved', 'deleted'];

/**
 * Valid ticket types
 */
const TICKET_TYPES = ['bug', 'feature', 'debug', 'manual', 'user'];

/**
 * Valid ticket priorities (1=low, 2=medium, 3=high, 4=critical)
 */
const TICKET_PRIORITIES = [1, 2, 3, 4];

/**
 * Priority labels for display
 */
const PRIORITY_LABELS = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Critical'
};

/**
 * Status emojis for display
 */
const STATUS_EMOJIS = {
    open: '🔴',
    backlog: '📋',
    in_progress: '🟡',
    resolved: '✅',
    deleted: '🗑️'
};

/**
 * Type labels with emojis for display
 */
const TYPE_LABELS = {
    bug: '🐛 Bug',
    feature: '✨ Feature',
    debug: '🔍 Debug',
    manual: '📝 Manual',
    user: '👤 User'
};

/**
 * Map a database row to a normalized Ticket object
 * @param {Object} row - Raw database row from debug_todos table
 * @returns {Object} Normalized ticket object
 */
function mapRowToTicket(row) {
    if (!row) return null;
    
    return {
        id: row.id,
        title: row.title || '',
        description: row.description || '',
        ticket_type: row.ticket_type || 'debug',
        status: row.status || 'open',
        priority: row.priority || 2,
        repro_steps: row.repro_steps || null,
        environment: parseJsonField(row.environment),
        logs: parseJsonField(row.logs),
        resolution_notes: row.resolution_notes || null,
        tags: parseTagsField(row.tags),
        created_by: row.created_by || 'system',
        created_at: row.created_at,
        updated_at: row.updated_at,
        player_id: row.player_id || null,
        player_name: row.player_name || null,
        session_id: row.session_id || null,
        estimated_effort: row.estimated_effort || null
    };
}

/**
 * Map multiple database rows to Ticket objects
 * @param {Array} rows - Array of database rows
 * @returns {Array} Array of normalized ticket objects
 */
function mapRowsToTickets(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToTicket).filter(Boolean);
}

/**
 * Parse JSON field from database (handles string JSON and null)
 * @param {*} field - Database field value
 * @returns {Object|null} Parsed object or null
 */
function parseJsonField(field) {
    if (!field) return null;
    if (typeof field === 'object') return field;
    try {
        return JSON.parse(field);
    } catch {
        return null;
    }
}

/**
 * Parse tags field (handles array, string, and JSON string)
 * @param {*} field - Tags field value
 * @returns {Array} Array of tag strings
 */
function parseTagsField(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
        // Try parsing as JSON first
        try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            // Return as single-element array if not JSON
            return field.trim() ? [field.trim()] : [];
        }
    }
    return [];
}

/**
 * Create a new ticket payload (for database insertion)
 * @param {Object} data - Input ticket data
 * @returns {Object} Formatted payload for database
 */
function createTicketPayload(data) {
    return {
        title: data.title || '',
        description: data.description || '',
        ticket_type: TICKET_TYPES.includes(data.ticket_type) ? data.ticket_type : 'manual',
        status: TICKET_STATUSES.includes(data.status) ? data.status : 'open',
        priority: TICKET_PRIORITIES.includes(data.priority) ? data.priority : 2,
        repro_steps: data.repro_steps || data.reproSteps || null,
        environment: data.environment ? JSON.stringify(data.environment) : null,
        logs: data.logs ? JSON.stringify(data.logs) : null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        created_by: data.created_by || data.createdBy || 'user',
        player_id: data.player_id || data.playerId || null,
        player_name: data.player_name || data.playerName || null,
        session_id: data.session_id || data.sessionId || null,
        estimated_effort: data.estimated_effort || data.estimatedEffort || null
    };
}

/**
 * Create an update payload (only includes provided fields)
 * @param {Object} data - Input update data
 * @returns {Object} Formatted payload for database update
 */
function createUpdatePayload(data) {
    const payload = {};
    
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.ticket_type !== undefined && TICKET_TYPES.includes(data.ticket_type)) {
        payload.ticketType = data.ticket_type;
    }
    if (data.status !== undefined && TICKET_STATUSES.includes(data.status)) {
        payload.status = data.status;
    }
    if (data.priority !== undefined && TICKET_PRIORITIES.includes(data.priority)) {
        payload.priority = data.priority;
    }
    if (data.repro_steps !== undefined) payload.reproSteps = data.repro_steps;
    if (data.resolution_notes !== undefined) payload.resolutionNotes = data.resolution_notes;
    if (data.tags !== undefined) payload.tags = Array.isArray(data.tags) ? data.tags : [];
    
    return payload;
}

/**
 * Validate a ticket object
 * @param {Object} ticket - Ticket to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateTicket(ticket) {
    const errors = [];
    
    if (!ticket.title || ticket.title.trim() === '') {
        errors.push('Title is required');
    }
    if (ticket.title && ticket.title.length > 200) {
        errors.push('Title must be 200 characters or less');
    }
    if (ticket.status && !TICKET_STATUSES.includes(ticket.status)) {
        errors.push(`Invalid status: ${ticket.status}`);
    }
    if (ticket.priority && !TICKET_PRIORITIES.includes(ticket.priority)) {
        errors.push(`Invalid priority: ${ticket.priority}`);
    }
    if (ticket.ticket_type && !TICKET_TYPES.includes(ticket.ticket_type)) {
        errors.push(`Invalid ticket type: ${ticket.ticket_type}`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get color class/style for a ticket based on priority
 * @param {number} priority - Ticket priority
 * @returns {string} CSS class or color
 */
function getPriorityColor(priority) {
    const colors = {
        1: '#666666', // Low - gray
        2: '#00aaff', // Medium - blue
        3: '#ff9900', // High - orange
        4: '#ff0000'  // Critical - red
    };
    return colors[priority] || colors[2];
}

/**
 * Get status color for display
 * @param {string} status - Ticket status
 * @returns {string} Color hex
 */
function getStatusColor(status) {
    const colors = {
        open: '#ff4444',
        backlog: '#888888',
        in_progress: '#ffaa00',
        resolved: '#44ff44',
        deleted: '#444444'
    };
    return colors[status] || colors['open'];
}

// Export for CommonJS (server-side only)
// Client-side version is in public/js/models/ticket.js
module.exports = {
    TICKET_STATUSES,
    TICKET_TYPES,
    TICKET_PRIORITIES,
    PRIORITY_LABELS,
    STATUS_EMOJIS,
    TYPE_LABELS,
    mapRowToTicket,
    mapRowsToTickets,
    createTicketPayload,
    createUpdatePayload,
    validateTicket,
    getPriorityColor,
    getStatusColor,
    parseJsonField,
    parseTagsField
};

