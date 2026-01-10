/**
 * Ticket Model - Client-side ES6 Module
 * 
 * Canonical Ticket model for client-side components:
 * - TicketsWidget (game UI)
 * - Ticket Editor
 * 
 * Provides consistent field normalization and display helpers.
 */

/**
 * Valid ticket statuses
 */
export const TICKET_STATUSES = ['open', 'backlog', 'in_progress', 'resolved', 'deleted'];

/**
 * Valid ticket types (must match database constraint from migration 068)
 */
export const TICKET_TYPES = ['bug', 'feature', 'debug'];

/**
 * Valid ticket priorities (1=low, 2=medium, 3=high, 4=critical)
 */
export const TICKET_PRIORITIES = [1, 2, 3, 4];

/**
 * Priority labels for display
 */
export const PRIORITY_LABELS = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Critical'
};

/**
 * Status emojis for display
 */
export const STATUS_EMOJIS = {
    open: '🔴',
    backlog: '📋',
    in_progress: '🟡',
    resolved: '✅',
    deleted: '🗑️'
};

/**
 * Type labels with emojis for display (must match valid ticket types)
 */
export const TYPE_LABELS = {
    bug: '🐛 Bug',
    feature: '✨ Feature',
    debug: '🔍 Debug'
};

/**
 * Parse JSON field from server (handles string JSON and null)
 * @param {*} field - Field value
 * @returns {Object|null} Parsed object or null
 */
export function parseJsonField(field) {
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
export function parseTagsField(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
        try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return field.trim() ? [field.trim()] : [];
        }
    }
    return [];
}

/**
 * Map a server ticket object to a normalized Ticket
 * @param {Object} row - Raw ticket from server
 * @returns {Object} Normalized ticket object
 */
export function mapRowToTicket(row) {
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
 * Map multiple server ticket objects to Tickets
 * @param {Array} rows - Array of server tickets
 * @returns {Array} Array of normalized ticket objects
 */
export function mapRowsToTickets(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToTicket).filter(Boolean);
}

/**
 * Validate a ticket object
 * @param {Object} ticket - Ticket to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateTicket(ticket) {
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
 * Get color for a ticket based on priority
 * @param {number} priority - Ticket priority
 * @returns {string} Color hex
 */
export function getPriorityColor(priority) {
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
export function getStatusColor(status) {
    const colors = {
        open: '#ff4444',
        backlog: '#888888',
        in_progress: '#ffaa00',
        resolved: '#44ff44',
        deleted: '#444444'
    };
    return colors[status] || colors['open'];
}

// Default export for convenience
export default {
    TICKET_STATUSES,
    TICKET_TYPES,
    TICKET_PRIORITIES,
    PRIORITY_LABELS,
    STATUS_EMOJIS,
    TYPE_LABELS,
    mapRowToTicket,
    mapRowsToTickets,
    validateTicket,
    getPriorityColor,
    getStatusColor,
    parseJsonField,
    parseTagsField
};


