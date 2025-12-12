/**
 * Ticket Service
 * 
 * Centralized async service layer for all ticket operations.
 * Used by both the Ticket Editor and TicketsWidget.
 * 
 * All database polling and async behavior is consolidated here.
 */

const TicketModel = require('../models/ticket.js');

// Auto-refresh state
let autoRefreshInterval = null;
let autoRefreshCallback = null;

/**
 * Fetch tickets with optional filters
 * @param {Object} db - Database module
 * @param {Object} filters - Filter options
 * @param {string} [filters.status] - Filter by status (null for all)
 * @param {number} [filters.priority] - Filter by priority
 * @param {string} [filters.ticketType] - Filter by ticket type
 * @param {number} [filters.limit] - Max results (default 100)
 * @param {boolean} [filters.includeResolved] - Include resolved tickets
 * @param {boolean} [filters.includeDeleted] - Include deleted tickets
 * @returns {Promise<Array>} Array of normalized ticket objects
 */
async function fetchTickets(db, filters = {}) {
    const {
        status = null,
        priority = null,
        ticketType = null,
        limit = 100,
        includeResolved = true,
        includeDeleted = false
    } = filters;
    
    try {
        // Get tickets from database
        let tickets = await db.listDebugTodos({ 
            status, 
            limit: limit * 2, // Get extra to allow for filtering
            includeDeleted 
        });
        
        // Apply additional filters
        if (!includeResolved) {
            tickets = tickets.filter(t => t.status !== 'resolved');
        }
        
        if (priority !== null) {
            tickets = tickets.filter(t => t.priority === priority);
        }
        
        if (ticketType !== null) {
            tickets = tickets.filter(t => t.ticket_type === ticketType);
        }
        
        // Limit results
        tickets = tickets.slice(0, limit);
        
        // Normalize to ticket model
        return TicketModel.mapRowsToTickets(tickets);
    } catch (error) {
        console.error('[TicketService] Error fetching tickets:', error);
        throw error;
    }
}

/**
 * Fetch a single ticket by ID
 * @param {Object} db - Database module
 * @param {number} id - Ticket ID
 * @returns {Promise<Object|null>} Normalized ticket object or null
 */
async function fetchTicketById(db, id) {
    try {
        const row = await db.getDebugTodo(id);
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error fetching ticket:', error);
        throw error;
    }
}

/**
 * Create a new ticket
 * @param {Object} db - Database module
 * @param {Object} payload - Ticket data
 * @returns {Promise<Object>} Created ticket object
 */
async function createTicket(db, payload) {
    try {
        // Validate
        const ticketData = TicketModel.createTicketPayload(payload);
        const validation = TicketModel.validateTicket(ticketData);
        
        if (!validation.valid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
        
        // Create in database
        const row = await db.createDebugTodo({
            sessionId: ticketData.session_id,
            title: ticketData.title,
            description: ticketData.description,
            reproSteps: ticketData.repro_steps,
            // environment and logs are now JSONB, so they're already objects
            environment: ticketData.environment || null,
            logs: ticketData.logs || null,
            createdBy: ticketData.created_by,
            ticketType: ticketData.ticket_type,
            priority: ticketData.priority,
            playerId: ticketData.player_id,
            playerName: ticketData.player_name
        });
        
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error creating ticket:', error);
        throw error;
    }
}

/**
 * Update an existing ticket
 * @param {Object} db - Database module
 * @param {number} id - Ticket ID
 * @param {Object} payload - Update data
 * @returns {Promise<Object>} Updated ticket object
 */
async function updateTicket(db, id, payload) {
    try {
        // Prepare update payload
        const updateData = TicketModel.createUpdatePayload(payload);
        
        // Update in database
        const row = await db.updateDebugTodo(id, updateData);
        
        if (!row) {
            throw new Error(`Ticket ${id} not found`);
        }
        
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error updating ticket:', error);
        throw error;
    }
}

/**
 * Delete a ticket (soft delete - sets status to 'deleted')
 * @param {Object} db - Database module
 * @param {number} id - Ticket ID
 * @returns {Promise<Object>} Updated ticket object
 */
async function deleteTicket(db, id) {
    try {
        const row = await db.updateDebugTodo(id, { status: 'deleted' });
        
        if (!row) {
            throw new Error(`Ticket ${id} not found`);
        }
        
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error deleting ticket:', error);
        throw error;
    }
}

/**
 * Add feedback/context to a ticket
 * @param {Object} db - Database module
 * @param {number} id - Ticket ID
 * @param {string} feedback - Feedback text to append
 * @returns {Promise<Object>} Updated ticket object
 */
async function addTicketFeedback(db, id, feedback) {
    try {
        // Get existing ticket
        const existing = await db.getDebugTodo(id);
        if (!existing) {
            throw new Error(`Ticket ${id} not found`);
        }
        
        // Append feedback to resolution_notes
        const existingNotes = existing.resolution_notes || '';
        const timestamp = new Date().toISOString();
        const newNotes = existingNotes 
            ? `${existingNotes}\n\n--- Update ${timestamp} ---\n${feedback}`
            : `--- Update ${timestamp} ---\n${feedback}`;
        
        const row = await db.updateDebugTodo(id, { resolutionNotes: newNotes });
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error adding feedback:', error);
        throw error;
    }
}

/**
 * Get tickets with session info (for detailed views)
 * @param {Object} db - Database module
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of tickets with session info
 */
async function fetchTicketsWithSession(db, filters = {}) {
    const { status = null, limit = 50 } = filters;
    
    try {
        const rows = await db.getDebugTodosWithSession({ status, limit });
        return TicketModel.mapRowsToTickets(rows);
    } catch (error) {
        console.error('[TicketService] Error fetching tickets with session:', error);
        throw error;
    }
}

/**
 * Get open tickets for processing (Cursor workflow)
 * @param {Object} db - Database module
 * @param {Object} options - Options
 * @param {number} [options.sinceId] - Only tickets with ID > sinceId
 * @param {number} [options.limit] - Max results
 * @returns {Promise<Array>} Array of open tickets
 */
async function fetchOpenTicketsForProcessing(db, options = {}) {
    const { sinceId = 0, limit = 10 } = options;
    
    try {
        const tickets = await db.getOpenTickets();
        
        let filtered = tickets;
        
        // Filter by sinceId if provided
        if (sinceId > 0) {
            filtered = tickets.filter(t => t.id > sinceId);
        }
        
        // Sort by priority (critical first) then by ID (oldest first)
        filtered.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return a.id - b.id;
        });
        
        // Limit results
        filtered = filtered.slice(0, limit);
        
        return TicketModel.mapRowsToTickets(filtered);
    } catch (error) {
        console.error('[TicketService] Error fetching open tickets:', error);
        throw error;
    }
}

/**
 * Update ticket priority
 * @param {Object} db - Database module
 * @param {number} id - Ticket ID
 * @param {number} priority - New priority (1-4)
 * @returns {Promise<Object>} Updated ticket object
 */
async function updateTicketPriority(db, id, priority) {
    try {
        if (!TicketModel.TICKET_PRIORITIES.includes(priority)) {
            throw new Error(`Invalid priority: ${priority}`);
        }
        
        const row = await db.updateDebugTodo(id, { priority });
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error updating priority:', error);
        throw error;
    }
}

/**
 * Add tag to ticket
 * @param {Object} db - Database module
 * @param {number} id - Ticket ID
 * @param {string} tag - Tag to add
 * @returns {Promise<Object>} Updated ticket object
 */
async function addTicketTag(db, id, tag) {
    try {
        const row = await db.addTicketTag(id, tag);
        return TicketModel.mapRowToTicket(row);
    } catch (error) {
        console.error('[TicketService] Error adding tag:', error);
        throw error;
    }
}

/**
 * Start auto-refresh polling
 * @param {Object} db - Database module  
 * @param {Function} callback - Callback function receiving tickets array
 * @param {number} intervalMs - Interval in milliseconds (default 5000)
 */
function startAutoRefresh(db, callback, intervalMs = 5000) {
    if (autoRefreshInterval) {
        stopAutoRefresh();
    }
    
    autoRefreshCallback = callback;
    
    const refresh = async () => {
        try {
            const tickets = await fetchTickets(db, { includeResolved: true });
            if (autoRefreshCallback) {
                autoRefreshCallback(tickets);
            }
        } catch (error) {
            console.error('[TicketService] Auto-refresh error:', error);
        }
    };
    
    // Initial fetch
    refresh();
    
    // Start interval
    autoRefreshInterval = setInterval(refresh, intervalMs);
    console.log(`[TicketService] Auto-refresh started (${intervalMs}ms)`);
}

/**
 * Stop auto-refresh polling
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        autoRefreshCallback = null;
        console.log('[TicketService] Auto-refresh stopped');
    }
}

/**
 * Check if auto-refresh is running
 * @returns {boolean}
 */
function isAutoRefreshRunning() {
    return autoRefreshInterval !== null;
}

// Export
module.exports = {
    fetchTickets,
    fetchTicketById,
    createTicket,
    updateTicket,
    deleteTicket,
    addTicketFeedback,
    fetchTicketsWithSession,
    fetchOpenTicketsForProcessing,
    updateTicketPriority,
    addTicketTag,
    startAutoRefresh,
    stopAutoRefresh,
    isAutoRefreshRunning
};


