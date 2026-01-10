/**
 * Tickets Widget
 * 
 * Displays and manages tickets (bugs, feature requests, work tickets)
 * Allows viewing past tickets, closing tickets, adding feedback
 * 
 * Uses shared ticket model from /js/models/ticket.js for consistent
 * field handling across the application.
 */

import Widget from './Widget.js';
import {
    TICKET_STATUSES,
    TICKET_TYPES,
    TICKET_PRIORITIES,
    PRIORITY_LABELS,
    STATUS_EMOJIS,
    TYPE_LABELS,
    mapRowToTicket,
    mapRowsToTickets,
    getPriorityColor,
    getStatusColor
} from '../models/ticket.js';

export default class TicketsWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.tickets = [];
        this.filterStatus = 'open'; // 'open', 'in_progress', 'resolved', 'all'
        this.showResolved = false;
        this.lastSuccessfulLoad = null; // Track last successful ticket load
        this.isLoading = false; // Prevent concurrent loads
        this.currentTab = 'openPending'; // 'openPending', 'backlog', or 'testing'
        this.godMode = false; // Track god mode status
    }
    
    init() {
        super.init();
        // No DOM lookups in init - done in onAttach
        
        // Restore filter from localStorage if available
        if (typeof localStorage !== 'undefined') {
            const savedFilter = localStorage.getItem('ticketsWidget_filter');
            if (savedFilter && ['open', 'in_progress', 'resolved', 'all'].includes(savedFilter)) {
                this.filterStatus = savedFilter;
            }
        }
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-fullwidth';
        root.setAttribute('data-widget', 'tickets');
        root.id = 'ticketsWidget';
        
        // Container will be populated by renderTickets() in onAttach
        // For now, return empty container
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        this.container = this.rootElement;
        
        // Restore tab from localStorage if available
        if (typeof localStorage !== 'undefined') {
            const savedTab = localStorage.getItem('ticketsWidget_tab');
            if (savedTab && ['openPending', 'testing', 'backlog'].includes(savedTab)) {
                this.currentTab = savedTab;
            } else {
                // Default to openPending if no saved tab or invalid tab
                this.currentTab = 'openPending';
                localStorage.setItem('ticketsWidget_tab', 'openPending');
            }
        } else {
            // No localStorage, default to openPending
            this.currentTab = 'openPending';
        }
        
        this.setupEventListeners();
        this.loadTickets();
        
        // Auto-refresh tickets every 5 seconds to see status changes
        this.autoRefreshInterval = setInterval(() => {
            this.loadTickets();
        }, 5000);
        
        // Initial render
        this.renderTickets();
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'ticketUpdated') {
            this.handleTicketUpdated(msg);
        } else if (msg.type === 'ticketFeedbackAdded') {
            this.handleTicketFeedbackAdded(msg);
        } else if (msg.type === 'ticketsList') {
            this.handleTicketsList(msg);
        }
    }
    
    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        super.destroy();
    }
    
    setupEventListeners() {
        // Use event delegation on the container to avoid losing listeners on re-render
        if (!this.container) return;
        
        // Remove old listeners if they exist
        if (this._eventDelegationHandler) {
            this.container.removeEventListener('click', this._eventDelegationHandler);
        }
        
        // Create a single delegated event handler
        this._eventDelegationHandler = (e) => {
            const target = e.target;
            
            // Tab buttons
            if (target.classList.contains('ticket-tab-btn')) {
                e.preventDefault();
                const tab = target.dataset.tab;
                if (tab) {
                    this.setTab(tab);
                }
            } else if (target.id === 'ticketsRefresh') {
                e.preventDefault();
                this.loadTickets();
            } else if (target.id === 'ticketsCreateNew') {
                e.preventDefault();
                e.stopPropagation();
                this.openCreateTicketDialog();
            } else if (target.closest('.ticket-item')) {
                // Handle ticket item clicks
                const ticketItem = target.closest('.ticket-item');
                if (ticketItem) {
                    const ticketId = parseInt(ticketItem.dataset.ticketId);
                    if (ticketId && !isNaN(ticketId)) {
                        // Only trigger if not clicking on action buttons or their children
                        if (!target.closest('.ticket-actions-compact') && !target.closest('button')) {
                            this.viewTicket(ticketId);
                        }
                    }
                }
            }
        };
        
        this.container.addEventListener('click', this._eventDelegationHandler);
    }
    
    setTab(tab) {
        if (!['openPending', 'testing', 'backlog'].includes(tab)) {
            console.warn(`[TicketsWidget] Invalid tab: "${tab}", ignoring`);
            return;
        }
        this.currentTab = tab;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_tab', tab);
        }
        this.renderTickets();
    }
    
    setFilter(status) {
        this.filterStatus = status;
        // Save filter to localStorage to persist across refreshes
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_filter', status);
        }
        this.renderTickets();
    }
    
    toggleResolved() {
        this.showResolved = !this.showResolved;
        this.loadTickets();
    }
    
    loadTickets() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[TicketsWidget] Not connected, skipping load');
            return;
        }
        
        // Prevent concurrent loads
        if (this.isLoading) {
            return;
        }
        
        this.isLoading = true;
        
        // Request ALL tickets, let client do the filtering
        // This prevents server-side filtering from returning empty arrays
        this.game.send({
            type: 'getTickets',
            status: null, // Always get all tickets, filter on client
            limit: 100,
            includeResolved: true, // Get all tickets including resolved
            includeDeleted: false // Don't include deleted tickets
        });
        
        // Set a timeout to reset isLoading if no response comes back
        // This prevents the widget from getting stuck in loading state
        setTimeout(() => {
            if (this.isLoading) {
                console.warn('[TicketsWidget] Load timeout - no response received after 5 seconds, resetting isLoading');
                this.isLoading = false;
            }
        }, 5000);
    }
    
    
    handleTicketsList(data) {
        this.isLoading = false; // Mark loading as complete
        
        // CRITICAL: Save filter to localStorage before any operations
        const savedFilter = this.filterStatus;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_filter', savedFilter);
        }
        
        // Validate data structure
        if (!data) {
            console.warn('[TicketsWidget] Received null/undefined data, keeping existing tickets');
            return;
        }
        
        if (!data.tickets) {
            console.warn('[TicketsWidget] Received data without tickets property:', data);
            // Keep existing tickets if data is invalid
            return;
        }
        
        // Update tickets from server response
        if (Array.isArray(data.tickets)) {
            // CRITICAL: Restore filter from localStorage in case it was lost
            if (typeof localStorage !== 'undefined') {
                const storedFilter = localStorage.getItem('ticketsWidget_filter');
                if (storedFilter && ['open', 'in_progress', 'resolved', 'all'].includes(storedFilter)) {
                    if (this.filterStatus !== storedFilter) {
                        this.filterStatus = storedFilter;
                    }
                }
            }
            
            // Always update tickets array with fresh data from server
            // Use mapRowsToTickets for consistent normalization
            this.tickets = mapRowsToTickets(data.tickets);
            
            // Ensure all tickets have valid status (safety check and normalization)
            this.tickets.forEach(ticket => {
                if (!ticket.status) {
                    console.warn(`[TicketsWidget] Ticket #${ticket.id} has missing status, defaulting to 'open'`);
                    ticket.status = 'open';
                } else {
                    // Normalize status: trim whitespace and ensure lowercase
                    const normalizedStatus = ticket.status.trim().toLowerCase();
                    if (normalizedStatus !== ticket.status) {
                        ticket.status = normalizedStatus;
                    }
                    
                    // Check if normalized status is valid
                    if (!TICKET_STATUSES.includes(ticket.status)) {
                        console.warn(`[TicketsWidget] Ticket #${ticket.id} has invalid status: "${ticket.status}", defaulting to 'open'`);
                        ticket.status = 'open';
                    }
                }
            });
            
            this.lastSuccessfulLoad = Date.now();
            
            // CRITICAL: Verify filter is still correct after updating tickets
            if (this.filterStatus !== savedFilter) {
                console.error(`[TicketsWidget] FILTER WAS LOST! Was "${savedFilter}", now "${this.filterStatus}", restoring...`);
                this.filterStatus = savedFilter;
                // Save again
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('ticketsWidget_filter', savedFilter);
                }
            }
            
            // Render with current filter (don't change filter)
            this.renderTickets();
        } else {
            console.error('[TicketsWidget] Received non-array tickets:', typeof data.tickets, data.tickets);
            // Don't clear tickets if we get bad data - keep existing ones
        }
    }
    
    handleTicketUpdated(data) {
        // If ticket was deleted, immediately remove it from local array to prevent stale display
        if (data.ticket && data.ticket.status === 'deleted') {
            this.tickets = this.tickets.filter(t => t && t.id !== data.ticketId);
            // Re-render immediately to reflect deletion
            this.renderTickets();
            
            // Close modal if it's open for this ticket
            const dialog = document.getElementById('ticketDetailsDialog');
            if (dialog && !dialog.classList.contains('hidden')) {
                dialog.classList.add('hidden');
            }
            return;
        }
        
        // Update local ticket data immediately
        if (data.ticket && data.ticketId) {
            const ticketIndex = this.tickets.findIndex(t => t.id === data.ticketId);
            if (ticketIndex >= 0) {
                this.tickets[ticketIndex] = data.ticket;
                console.log(`[TicketsWidget] Updated local ticket #${data.ticketId} with status: ${data.ticket.status}`);
            } else {
                // Ticket not in local array, add it
                this.tickets.push(data.ticket);
            }
        }
        
        // If modal is open for this ticket, refresh it
        const dialog = document.getElementById('ticketDetailsDialog');
        if (dialog && !dialog.classList.contains('hidden') && data.ticketId) {
            console.log('[TicketsWidget] Refreshing open modal for updated ticket #' + data.ticketId);
            // Use the updated ticket data from the response
            if (data.ticket) {
                this.showTicketDetails(data.ticketId);
            }
        }
        
        // Re-render widget to show updated status
        this.renderTickets();
        
        // Reload tickets after update to get fresh data from server (but don't wait for it)
        this.loadTickets();
    }
    
    handleTicketFeedbackAdded(data) {
        // Reload tickets after feedback added
        this.loadTickets();
    }
    
    renderTickets() {
        if (!this.container) {
            console.error('[TicketsWidget] Container not found, cannot render');
            // Try to get container from rootElement
            if (this.rootElement) {
                console.log('[TicketsWidget] Attempting to use rootElement as container');
                this.container = this.rootElement;
            } else {
                return;
            }
        }
        
        // CRITICAL: Preserve filter status - don't let it get reset
        const filterBeforeRender = this.filterStatus;
        
        // Ensure filter status is valid BEFORE filtering
        if (!['open', 'in_progress', 'resolved', 'all'].includes(this.filterStatus)) {
            console.warn(`[TicketsWidget] Invalid filter status: ${this.filterStatus}, resetting to 'open'`);
            this.filterStatus = 'open';
            // Save to localStorage
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('ticketsWidget_filter', 'open');
            }
        } else {
            // Filter is valid - make sure it's saved to localStorage
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('ticketsWidget_filter', this.filterStatus);
            }
        }
        
        console.log(`[TicketsWidget] Rendering with ${this.tickets.length} total tickets, filter: "${this.filterStatus}", currentTab: "${this.currentTab}"`);
        
        // Ensure currentTab is valid
        if (!this.currentTab || !['openPending', 'testing', 'backlog'].includes(this.currentTab)) {
            console.warn(`[TicketsWidget] Invalid currentTab: "${this.currentTab}", defaulting to 'openPending'`);
            this.currentTab = 'openPending';
            // Save to localStorage
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('ticketsWidget_tab', 'openPending');
            }
        }
        
        // Filter out deleted tickets first
        let filtered = this.tickets.filter(t => t && t.status !== 'deleted');
        
        // Filter tickets based on current tab (tabs work independently of filterStatus)
        let tabTickets = [];
        let tabTitle = '';
        let tabCount = 0;
        
        if (this.currentTab === 'openPending') {
            // Tab 1: Open and Pending tickets (open status)
            tabTickets = filtered.filter(t => t && t.status === 'open');
            tabTitle = 'Open/Pending';
            tabCount = tabTickets.length;
        } else if (this.currentTab === 'testing') {
            // Tab 2: Testing - ALL in_progress tickets
            tabTickets = filtered.filter(t => t && t.status === 'in_progress');
            tabTitle = 'Testing';
            tabCount = tabTickets.length;
        } else {
            console.error(`[TicketsWidget] Unknown currentTab: "${this.currentTab}"`);
            tabTitle = 'Unknown';
            tabCount = 0;
        }
        
        let html = `
            <div class="tickets-widget-header">
                <h3>Tickets</h3>
                <div class="tickets-tabs">
                    <button class="ticket-tab-btn ${this.currentTab === 'openPending' ? 'active' : ''}" id="ticketsTabOpenPending" data-tab="openPending">Open/Pending</button>
                    <button class="ticket-tab-btn ${this.currentTab === 'testing' ? 'active' : ''}" id="ticketsTabTesting" data-tab="testing">Testing</button>
                    <button class="ticket-action-btn" id="ticketsCreateNew" style="margin-left: auto;">+ New Ticket</button>
                    <button class="ticket-filter-btn" id="ticketsRefresh">Refresh</button>
                </div>
            </div>
            <div class="tickets-tab-content">
                <div class="tickets-tab-title">${tabTitle} (${tabCount})</div>
                <div class="tickets-list">
        `;
        
        console.log(`[TicketsWidget] Rendering tab "${this.currentTab}" with ${tabTickets.length} tickets`);
        
        if (tabTickets.length === 0) {
            html += `<div class="tickets-empty">No ${tabTitle.toLowerCase()} tickets found.</div>`;
        } else {
            tabTickets.forEach(ticket => {
                const statusEmoji = STATUS_EMOJIS[ticket.status] || '❓';
                const priorityText = PRIORITY_LABELS[ticket.priority] || 'Medium';
                const ticketTypeText = TYPE_LABELS[ticket.ticket_type] || TYPE_LABELS['debug'];
                
                // Check if Cursor is working on this (in_progress status means Cursor is working)
                const cursorWorking = ticket.status === 'in_progress';
                const cursorIndicator = cursorWorking ? '<span class="cursor-working-indicator" title="Cursor is working on this ticket">🤖 Cursor Working...</span>' : '';
                
                // Only show Resolve button on testing tab
                let actionButtons = '';
                if (this.currentTab === 'testing') {
                    actionButtons = `
                        <button class="ticket-action-btn" onclick="event.stopPropagation(); ticketsWidget.resolveTicket(${ticket.id})">Resolve</button>
                    `;
                }
                
                html += `
                    <div class="ticket-item ${cursorWorking ? 'cursor-working' : ''}" data-ticket-id="${ticket.id}">
                        <div class="ticket-header-compact">
                            <span class="ticket-status">${statusEmoji}</span>
                            <span class="ticket-id">#${ticket.id}</span>
                            <span class="ticket-title-compact">${this.escapeHtml(ticket.title)}</span>
                            ${cursorIndicator}
                        </div>
                        <div class="ticket-meta-compact">
                            <span class="ticket-type-compact">${ticketTypeText}</span>
                            <span class="ticket-priority-badge priority-${ticket.priority || 2}">${priorityText}</span>
                        </div>
                        ${actionButtons ? `<div class="ticket-actions-compact">${actionButtons}</div>` : ''}
                    </div>
                `;
            });
        }
        
        html += `
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        
        // Re-setup event listeners for dynamically created buttons
        this.setupTicketActionListeners();
        
        // Re-setup filter button listeners (they get recreated in innerHTML)
        // But we use event delegation now, so this is just for safety
        const filterButtons = this.container.querySelectorAll('.ticket-filter-btn');
        filterButtons.forEach(btn => {
            // Event delegation handles this, but ensure buttons are clickable
            if (!btn.hasAttribute('data-listener-set')) {
                btn.setAttribute('data-listener-set', 'true');
            }
        });
    }
    
    filterTickets() {
        console.log(`[TicketsWidget] ========== filterTickets START ==========`);
        console.log(`[TicketsWidget] Current filter: "${this.filterStatus}"`);
        
        if (!Array.isArray(this.tickets)) {
            console.warn('[TicketsWidget] tickets is not an array:', this.tickets);
            return [];
        }
        
        // CRITICAL: Restore filter from localStorage if it's invalid or missing
        const validFilters = ['open', 'in_progress', 'resolved', 'all'];
        const originalFilter = this.filterStatus;
        
        if (!validFilters.includes(this.filterStatus)) {
            console.warn(`[TicketsWidget] Invalid filter status "${this.filterStatus}"`);
            // Try to restore from localStorage
            if (typeof localStorage !== 'undefined') {
                const storedFilter = localStorage.getItem('ticketsWidget_filter');
                if (storedFilter && validFilters.includes(storedFilter)) {
                    console.log(`[TicketsWidget] Restoring filter from localStorage: "${storedFilter}"`);
                    this.filterStatus = storedFilter;
                } else {
                    console.warn(`[TicketsWidget] No valid stored filter, using 'all'`);
                    this.filterStatus = 'all';
                }
            } else {
                this.filterStatus = 'all';
            }
        }
        
        // Save filter to localStorage to ensure it persists
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_filter', this.filterStatus);
        }
        
        console.log(`[TicketsWidget] Filtering ${this.tickets.length} tickets with filter: "${this.filterStatus}"`);
        console.log(`[TicketsWidget] All ticket statuses:`, this.tickets.map(t => `#${t.id}:${t.status || 'MISSING'}`).join(', '));
        
        if (this.filterStatus === 'all') {
            console.log(`[TicketsWidget] Showing all ${this.tickets.length} tickets`);
            return this.tickets;
        }
        
        const filtered = this.tickets.filter(t => {
            if (!t) {
                console.warn(`[TicketsWidget] Ticket is null/undefined`);
                return false;
            }
            // CRITICAL: Always filter out deleted tickets, regardless of filter
            if (t.status === 'deleted') {
                console.log(`[TicketsWidget] Filtering OUT deleted ticket #${t.id}`);
                return false;
            }
            if (!t.status) {
                console.warn(`[TicketsWidget] Ticket #${t.id} missing status property`);
                return false;
            }
            const matches = t.status === this.filterStatus;
            if (!matches) {
                console.log(`[TicketsWidget] Filtering OUT ticket #${t.id}: status "${t.status}" !== filter "${this.filterStatus}"`);
            } else {
                console.log(`[TicketsWidget] Filtering IN ticket #${t.id}: status "${t.status}" === filter "${this.filterStatus}"`);
            }
            return matches;
        });
        
        console.log(`[TicketsWidget] Filtered ${this.tickets.length} tickets to ${filtered.length} with filter "${this.filterStatus}"`);
        console.log(`[TicketsWidget] Filtered ticket IDs:`, filtered.length > 0 ? filtered.map(t => `#${t.id}(${t.status})`).join(', ') : 'NONE');
        console.log(`[TicketsWidget] ========== filterTickets END ==========`);
        
        return filtered;
    }
    
    setupTicketActionListeners() {
        // Event listeners are set via onclick/onchange in the HTML for simplicity
        // Store reference for global access
        if (typeof window !== 'undefined') {
            window.ticketsWidget = this;
        }
    }
    
    handleStatusChange(selectElement) {
        const ticketId = parseInt(selectElement.dataset.ticketId);
        const newStatus = selectElement.value;
        console.log('[TicketsWidget] Status change requested:', newStatus, 'ticketId:', ticketId);
        
        // Update local ticket data immediately (optimistic update)
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (ticket) {
            const oldStatus = ticket.status;
            ticket.status = newStatus;
            ticket.updated_at = new Date().toISOString();
            console.log(`[TicketsWidget] Updated local ticket #${ticketId} status from "${oldStatus}" to "${newStatus}"`);
        } else {
            console.error(`[TicketsWidget] Ticket #${ticketId} not found in local tickets array`);
        }
        
        // Find the dialog to update UI
        const dialog = document.getElementById('ticketDetailsDialog');
        const actualDialog = dialog ? dialog.querySelector('.ticket-details-dialog') : null;
        
        if (actualDialog) {
            // Update the displayed status badge immediately
            const statusBadge = actualDialog.querySelector('.ticket-status-badge');
            if (statusBadge) {
                statusBadge.textContent = newStatus;
                statusBadge.className = `ticket-status-badge ticket-status-${newStatus}`;
                console.log(`[TicketsWidget] Updated status badge to "${newStatus}"`);
            }
            
            // Update status emoji in header
            const statusEmoji = newStatus === 'open' ? '🔴' : newStatus === 'in_progress' ? '🟡' : '✅';
            const statusEmojiEl = actualDialog.querySelector('.ticket-details-status');
            if (statusEmojiEl) {
                statusEmojiEl.textContent = statusEmoji;
            }
        }
        
        // Save to server immediately - don't wait for user to close window
        console.log(`[TicketsWidget] Sending status update to server: ticketId=${ticketId}, status=${newStatus}`);
        this.updateTicketStatus(ticketId, newStatus, null);
        
        // The handleTicketUpdated will refresh the modal automatically when server responds
    }
    
    viewTicket(ticketId) {
        console.log('[TicketsWidget] viewTicket called with ticketId:', ticketId);
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) {
            console.error(`[TicketsWidget] Ticket #${ticketId} not found in tickets array (${this.tickets.length} tickets)`);
            return;
        }
        
        console.log('[TicketsWidget] Found ticket:', ticket.title);
        // Show ticket details in a dialog
        this.showTicketDetails(ticketId);
    }
    
    showTicketDetails(ticketId) {
        console.log('[TicketsWidget] showTicketDetails called with ticketId:', ticketId);
        // Find ticket in current list
        let ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) {
            console.warn(`[TicketsWidget] Ticket #${ticketId} not found in tickets array (${this.tickets.length} tickets)`);
            console.log('[TicketsWidget] Available ticket IDs:', this.tickets.map(t => t.id).join(', '));
            // Try to reload tickets to get the latest data
            this.loadTickets();
            // Wait a bit and try again
            setTimeout(() => {
                ticket = this.tickets.find(t => t.id === ticketId);
                if (!ticket) {
                    console.error(`[TicketsWidget] Ticket #${ticketId} still not found after reload`);
                    return;
                }
                this.showTicketDetails(ticketId);
            }, 500);
            return;
        }
        
        console.log('[TicketsWidget] Found ticket:', ticket.title, 'status:', ticket.status);
        
        // Create or get details dialog
        let dialog = document.getElementById('ticketDetailsDialog');
        if (!dialog) {
            console.log('[TicketsWidget] Creating new ticket details dialog');
            dialog = this.createTicketDetailsDialog();
        } else {
            console.log('[TicketsWidget] Using existing ticket details dialog');
        }
        
        const statusEmoji = STATUS_EMOJIS[ticket.status] || '❓';
        const priorityText = PRIORITY_LABELS[ticket.priority] || 'Medium';
        
        const content = dialog.querySelector('.ticket-details-content');
        content.innerHTML = `
            <div class="ticket-details-header">
                <div class="ticket-details-title-row">
                    <span class="ticket-details-status">${statusEmoji}</span>
                    <h3>#${ticket.id}: ${this.escapeHtml(ticket.title)}</h3>
                </div>
                <div class="ticket-details-actions">
                    <select class="ticket-status-select" data-ticket-id="${ticket.id}" data-action="change-status" onchange="ticketsWidget.handleStatusChange(this)">
                        <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                        <option value="backlog" ${ticket.status === 'backlog' ? 'selected' : ''}>Backlog</option>
                        <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                    ${ticket.status === 'open' || ticket.status === 'backlog' ? `<button class="ticket-action-btn" data-action="edit" data-ticket-id="${ticket.id}">Edit</button>` : ''}
                    ${ticket.status === 'in_progress' || ticket.status === 'resolved' ? `<button class="ticket-action-btn" data-action="add-context" data-ticket-id="${ticket.id}">Add Context</button>` : ''}
                    ${ticket.status !== 'deleted' ? `<button class="ticket-action-btn ticket-action-delete" data-action="delete" data-ticket-id="${ticket.id}">Delete</button>` : ''}
                </div>
                <button class="ticket-details-close" onclick="document.getElementById('ticketDetailsDialog').classList.add('hidden')">×</button>
            </div>
            <div class="ticket-details-body">
                <div class="ticket-details-section">
                    <div class="ticket-detail-row">
                        <strong>Status:</strong> <span class="ticket-status-badge ticket-status-${ticket.status}">${ticket.status}</span>
                    </div>
                    <div class="ticket-detail-row">
                        <strong>Priority:</strong> <span class="ticket-priority-badge ticket-priority-${ticket.priority || 2}">${priorityText}</span>
                    </div>
                    <div class="ticket-detail-row">
                        <strong>Type:</strong> ${ticket.ticket_type || 'debug'}
                    </div>
                    <div class="ticket-detail-row">
                        <strong>Created:</strong> ${new Date(ticket.created_at).toLocaleString()}
                    </div>
                    ${ticket.created_by ? `<div class="ticket-detail-row"><strong>Created by:</strong> ${this.escapeHtml(ticket.created_by)}</div>` : ''}
                    ${ticket.player_name ? `<div class="ticket-detail-row"><strong>Player:</strong> ${this.escapeHtml(ticket.player_name)}</div>` : ''}
                </div>
                ${ticket.description ? `
                    <div class="ticket-details-section">
                        <strong>Description:</strong>
                        <div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.description)}</div>
                    </div>
                ` : ''}
                ${ticket.repro_steps ? `
                    <div class="ticket-details-section">
                        <strong>Reproduction Steps:</strong>
                        <div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.repro_steps)}</div>
                    </div>
                ` : ''}
                ${ticket.resolution_notes ? `
                    <div class="ticket-details-section">
                        <strong>Resolution Notes & Context:</strong>
                        <div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.resolution_notes)}</div>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Setup event handlers
        this.setupTicketDetailsHandlers(dialog, ticket.id);
        
        // Setup drag handler for header (header is recreated in innerHTML)
        const actualDialog = dialog.querySelector('.ticket-details-dialog');
        if (actualDialog && dialog._setupDrag) {
            // Wait a moment for DOM to update, then setup drag
            setTimeout(() => {
                dialog._setupDrag();
            }, 50);
        }
        
        console.log('[TicketsWidget] Showing ticket details dialog');
        dialog.classList.remove('hidden');
        console.log('[TicketsWidget] Dialog hidden class removed, dialog should be visible');
    }
    
    setupTicketDetailsHandlers(dialog, ticketId) {
        // Find the actual dialog content element (not the overlay)
        const actualDialog = dialog.querySelector('.ticket-details-dialog');
        if (!actualDialog) {
            console.error('[TicketsWidget] Could not find .ticket-details-dialog element');
            return;
        }
        
        // Status change is now handled via inline onchange attribute in the HTML
        // No need to attach event listeners here - the onchange="ticketsWidget.handleStatusChange(this)" handles it
        
        // Action buttons - search within the actual dialog content
        actualDialog.querySelectorAll('[data-action]').forEach(btn => {
            // Remove old listeners by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const ticketId = parseInt(e.target.dataset.ticketId);
                console.log('[TicketsWidget] Ticket action clicked:', action, 'ticketId:', ticketId);
                
                if (action === 'edit') {
                    this.editTicket(ticketId);
                } else if (action === 'add-context') {
                    this.addContext(ticketId);
                } else if (action === 'delete') {
                    this.deleteTicket(ticketId);
                }
            });
        });
    }
    
    createTicketDetailsDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'ticketDetailsDialog';
        overlay.className = 'ticket-details-dialog-overlay hidden';
        
        const dialog = document.createElement('div');
        dialog.className = 'ticket-details-dialog';
        dialog.innerHTML = `<div class="ticket-details-content"></div>`;
        
        overlay.appendChild(dialog);
        
        // Make dialog draggable
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        const startDrag = (e) => {
            // Only drag from header area, not from buttons/inputs
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) {
                return;
            }
            const headerEl = dialog.querySelector('.ticket-details-header');
            if (!headerEl || !headerEl.contains(e.target)) {
                return;
            }
            isDragging = true;
            const rect = dialog.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            dialog.style.cursor = 'grabbing';
            e.preventDefault();
        };
        
        const drag = (e) => {
            if (!isDragging) return;
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;
            
            // Keep dialog within viewport
            const maxX = window.innerWidth - dialog.offsetWidth;
            const maxY = window.innerHeight - dialog.offsetHeight;
            
            dialog.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            dialog.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
            dialog.style.transform = 'none';
        };
        
        const stopDrag = () => {
            isDragging = false;
            dialog.style.cursor = '';
        };
        
        // Make resizable
        let isResizing = false;
        let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
        
        // startResize is now handled directly in resizeHandle mousedown
        
        const doResize = (e) => {
            if (!isResizing) return;
            const deltaX = e.clientX - resizeStart.x;
            const deltaY = e.clientY - resizeStart.y;
            
            const newWidth = Math.max(400, Math.min(resizeStart.width + deltaX, window.innerWidth - 20));
            const newHeight = Math.max(300, Math.min(resizeStart.height + deltaY, window.innerHeight - 20));
            
            dialog.style.width = newWidth + 'px';
            dialog.style.height = newHeight + 'px';
        };
        
        const stopResize = () => {
            isResizing = false;
        };
        
        // Setup drag on header (will be set up when header is added)
        const setupDragOnHeader = () => {
            const headerEl = dialog.querySelector('.ticket-details-header');
            if (headerEl) {
                // Remove old listener if exists
                if (headerEl._dragHandler) {
                    headerEl.removeEventListener('mousedown', headerEl._dragHandler);
                }
                headerEl._dragHandler = startDrag;
                headerEl.addEventListener('mousedown', startDrag);
                console.log('[TicketsWidget] Drag handler attached to header');
            } else {
                console.warn('[TicketsWidget] Header not found for drag setup');
            }
        };
        
        // Setup resize on dialog - use a dedicated resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = 'position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 1000; background: linear-gradient(135deg, transparent 0%, transparent 40%, #00ff00 40%, #00ff00 60%, transparent 60%, transparent 100%); pointer-events: auto;';
        dialog.appendChild(resizeHandle);
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            const rect = dialog.getBoundingClientRect();
            resizeStart.x = e.clientX;
            resizeStart.y = e.clientY;
            resizeStart.width = rect.width;
            resizeStart.height = rect.height;
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Setup document-level listeners
        const mouseMoveHandler = (e) => {
            drag(e);
            doResize(e);
        };
        
        const mouseUpHandler = () => {
            stopDrag();
            stopResize();
        };
        
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        
        // Store cleanup
        overlay._cleanup = () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                overlay.classList.add('hidden');
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Setup header drag after dialog is shown (header is added dynamically)
        overlay._setupDrag = setupDragOnHeader;
        
        document.body.appendChild(overlay);
        return overlay;
    }
    
    closeTicket(ticketId) {
        // Use bespoke dialog instead of prompt
        this.showCloseTicketDialog(ticketId);
    }
    
    reopenTicket(ticketId) {
        // Use bespoke dialog instead of confirm
        this.showReopenTicketDialog(ticketId);
    }
    
    addFeedback(ticketId) {
        // Use bespoke dialog instead of prompt
        this.showFeedbackDialog(ticketId);
    }
    
    showCloseTicketDialog(ticketId) {
        const dialog = this.createBespokeDialog('Close Ticket', 'Add resolution notes (optional):', (notes) => {
            this.updateTicketStatus(ticketId, 'resolved', notes);
        });
        dialog.classList.remove('hidden');
    }
    
    showReopenTicketDialog(ticketId) {
        const dialog = this.createBespokeDialog('Reopen Ticket', 'Reopen this ticket as a regression bug? Add notes (optional):', (notes) => {
            this.updateTicketStatus(ticketId, 'open', 'Reopened as regression bug' + (notes ? '\n' + notes : ''));
        });
        dialog.classList.remove('hidden');
    }
    
    showFeedbackDialog(ticketId) {
        const dialog = this.createBespokeDialog('Add Feedback', 'Add feedback for Cursor:', (feedback) => {
            if (feedback && feedback.trim()) {
                this.submitFeedback(ticketId, feedback.trim());
            }
        });
        dialog.classList.remove('hidden');
    }
    
    createBespokeDialog(title, label, onSubmit) {
        // Create or reuse dialog
        let dialog = document.getElementById('ticketActionDialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'ticketActionDialog';
            dialog.className = 'zork-ticket-dialog-overlay hidden';
            dialog.innerHTML = `
                <div class="zork-ticket-dialog">
                    <div class="zork-ticket-dialog-header">
                        <h3 id="ticketActionTitle">${this.escapeHtml(title)}</h3>
                        <button class="zork-ticket-dialog-close" onclick="document.getElementById('ticketActionDialog').classList.add('hidden')">×</button>
                    </div>
                    <div class="zork-ticket-dialog-content">
                        <label id="ticketActionLabel">${this.escapeHtml(label)}</label>
                        <textarea id="ticketActionInput" class="zork-ticket-textarea" rows="4" placeholder="Paste screenshots with Ctrl+V"></textarea>
                        <div id="ticketActionError" class="zork-ticket-error hidden"></div>
                    </div>
                    <div class="zork-ticket-dialog-buttons">
                        <button id="ticketActionSubmit" class="zork-ticket-btn zork-ticket-btn-primary">Submit</button>
                        <button id="ticketActionCancel" class="zork-ticket-btn zork-ticket-btn-secondary">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
        }
        
        // Get elements
        const submitBtn = dialog.querySelector('#ticketActionSubmit');
        const cancelBtn = dialog.querySelector('#ticketActionCancel');
        const input = dialog.querySelector('#ticketActionInput');
        const errorDiv = dialog.querySelector('#ticketActionError');
        const titleEl = dialog.querySelector('#ticketActionTitle');
        
        // Remove old event listeners by cloning and replacing buttons (cleanest way)
        const newSubmitBtn = submitBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // Store current onSubmit callback on the dialog element so we can access it
        dialog._currentOnSubmit = onSubmit;
        
        // Setup new handlers with current onSubmit callback
        newSubmitBtn.addEventListener('click', () => {
            const currentInput = dialog.querySelector('#ticketActionInput');
            const value = currentInput ? currentInput.value.trim() : '';
            dialog.classList.add('hidden');
            if (currentInput) currentInput.value = '';
            errorDiv.classList.add('hidden');
            errorDiv.textContent = '';
            // Use the stored callback
            if (dialog._currentOnSubmit) {
                dialog._currentOnSubmit(value);
            }
        });
        
        newCancelBtn.addEventListener('click', () => {
            const currentInput = dialog.querySelector('#ticketActionInput');
            dialog.classList.add('hidden');
            if (currentInput) currentInput.value = '';
            errorDiv.classList.add('hidden');
            errorDiv.textContent = '';
        });
        
        // Remove old paste handler if it exists
        if (input._pasteHandler) {
            input.removeEventListener('paste', input._pasteHandler);
        }
        if (input._keydownHandler) {
            input.removeEventListener('keydown', input._keydownHandler);
        }
        
        // Submit on Ctrl+Enter (remove old listener first)
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        // Store reference to newInput for paste handler
        newInput._keydownHandler = (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                newSubmitBtn.click();
            }
        };
        newInput.addEventListener('keydown', newInput._keydownHandler);
        
        // Handle image paste (screenshots) - same as ticket creation
        newInput._pasteHandler = async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            console.log('[TicketsWidget] Paste event detected in createBespokeDialog');
            
            // Look for image in clipboard
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                
                // Check if it's an image
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault(); // Prevent default paste behavior
                    e.stopPropagation();
                    
                    console.log('[TicketsWidget] Image detected in clipboard, processing...');
                    
                    const blob = item.getAsFile();
                    if (!blob) continue;
                    
                    // Convert to base64
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64Image = event.target.result;
                        const imageSizeKB = Math.round(base64Image.length / 1024);
                        
                        console.log('[TicketsWidget] Image converted to base64, size:', imageSizeKB, 'KB');
                        
                        // Check size limit (5MB base64 = ~3.75MB actual)
                        if (imageSizeKB > 5120) {
                            errorDiv.textContent = `Image too large (${imageSizeKB}KB). Maximum size is 5MB.`;
                            errorDiv.classList.remove('hidden');
                            return;
                        }
                        
                        // Insert image markdown at cursor position
                        const cursorPos = newInput.selectionStart;
                        const textBefore = newInput.value.substring(0, cursorPos);
                        const textAfter = newInput.value.substring(cursorPos);
                        
                        // Insert image as markdown-style embed
                        const imageMarkdown = `\n\n![Screenshot](${base64Image})\n\n`;
                        newInput.value = textBefore + imageMarkdown + textAfter;
                        
                        // Move cursor after inserted image
                        const newCursorPos = cursorPos + imageMarkdown.length;
                        newInput.setSelectionRange(newCursorPos, newCursorPos);
                        
                        // Show success message
                        const successMsg = document.createElement('div');
                        successMsg.className = 'ticket-image-success';
                        successMsg.textContent = `✓ Screenshot pasted (${imageSizeKB}KB)`;
                        successMsg.style.cssText = 'color: #00ff00; font-size: 11px; margin-top: 5px;';
                        
                        // Remove any existing success message
                        const existingSuccess = newInput.parentElement.querySelector('.ticket-image-success');
                        if (existingSuccess) {
                            existingSuccess.remove();
                        }
                        
                        // Hide error if present
                        errorDiv.classList.add('hidden');
                        
                        // Insert success message after textarea
                        newInput.parentElement.insertBefore(successMsg, newInput.nextSibling);
                        
                        // Remove success message after 3 seconds
                        setTimeout(() => {
                            if (successMsg.parentElement) {
                                successMsg.remove();
                            }
                        }, 3000);
                        
                        // Focus back on input
                        newInput.focus();
                    };
                    
                    reader.onerror = () => {
                        console.error('[TicketsWidget] Error reading image file');
                        errorDiv.textContent = 'Failed to process image. Please try again.';
                        errorDiv.classList.remove('hidden');
                    };
                    
                    reader.readAsDataURL(blob);
                    break; // Only process first image
                }
            }
        };
        newInput.addEventListener('paste', newInput._pasteHandler, true); // Use capture phase
        
        // Update title, label, and input
        if (titleEl) titleEl.textContent = title;
        const labelEl = dialog.querySelector('#ticketActionLabel');
        if (labelEl) labelEl.textContent = label;
        if (newInput) {
            newInput.value = '';
            newInput.placeholder = 'Paste screenshots with Ctrl+V';
        }
        
        // Clear any previous errors
        if (errorDiv) {
            errorDiv.classList.add('hidden');
            errorDiv.textContent = '';
        }
        
        return dialog;
    }
    
    updateTicketStatus(ticketId, status, resolutionNotes = null) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[TicketsWidget] Not connected');
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server. Cannot update ticket status.', 'error');
            }
            return;
        }
        
        console.log('[TicketsWidget] Sending status update:', { ticketId, status, resolutionNotes: resolutionNotes ? 'yes' : 'no' });
        
        this.game.send({
            type: 'updateTicket',
            ticketId: ticketId,
            status: status,
            resolutionNotes: resolutionNotes
        });
        
        // Show feedback
        if (window.terminal) {
            window.terminal.addMessage(`Ticket #${ticketId} status updated to ${status}.`, 'info');
        }
    }
    
    submitFeedback(ticketId, feedback) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[TicketsWidget] Not connected');
            return;
        }
        
        this.game.send({
            type: 'addTicketFeedback',
            ticketId: ticketId,
            feedback: feedback
        });
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Render ticket text with image support
     * Converts markdown-style image syntax ![alt](data:image/...) to actual img tags
     */
    renderTicketTextWithImages(text) {
        if (!text) return '';
        
        // Escape HTML first
        let escaped = this.escapeHtml(text);
        
        // Convert markdown-style images to HTML img tags
        // Pattern: ![alt](data:image/type;base64,...)
        const imagePattern = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
        escaped = escaped.replace(imagePattern, (match, alt, dataUri) => {
            // Validate it's a data URI
            if (!dataUri.startsWith('data:image/')) {
                return match; // Return original if not valid
            }
            
            // Create img tag with base64 data
            return `<img src="${dataUri}" alt="${this.escapeHtml(alt || 'Screenshot')}" class="ticket-screenshot" style="max-width: 100%; height: auto; border: 2px solid #00ff00; border-radius: 4px; margin: 10px 0; display: block;" />`;
        });
        
        // Convert line breaks to <br>
        escaped = escaped.replace(/\n/g, '<br>');
        
        return escaped;
    }
    
    // New methods for tab-specific actions
    sendToCursor(ticketId) {
        // Send ticket to cursor (mark as in_progress and trigger auto-processor)
        this.updateTicketStatus(ticketId, 'in_progress', null);
    }
    
    changeStatus(ticketId, newStatus) {
        // Change ticket status (open, backlog, in_progress, resolved)
        const validStatuses = ['open', 'backlog', 'in_progress', 'resolved'];
        if (!validStatuses.includes(newStatus)) {
            console.error(`[TicketsWidget] Invalid status: ${newStatus}`);
            return;
        }
        this.updateTicketStatus(ticketId, newStatus, null);
    }
    
    deleteTicket(ticketId) {
        // Use bespoke dialog instead of confirm
        this.showDeleteTicketDialog(ticketId);
    }
    
    showDeleteTicketDialog(ticketId) {
        const dialog = this.createBespokeDialog('Delete Ticket', 'Are you sure you want to delete this ticket? It will be marked as deleted and Cursor will ignore it. Type "DELETE" to confirm:', (confirmation) => {
            if (confirmation && confirmation.trim().toUpperCase() === 'DELETE') {
                this.updateTicketStatus(ticketId, 'deleted', null);
                // Reload tickets after delete
                setTimeout(() => {
                    this.loadTickets();
                }, 500);
            } else {
                // Show error if confirmation doesn't match
                const errorDiv = dialog.querySelector('#ticketActionError');
                if (errorDiv) {
                    errorDiv.textContent = 'Confirmation text does not match. Ticket not deleted.';
                    errorDiv.classList.remove('hidden');
                }
            }
        });
        dialog.classList.remove('hidden');
    }
    
    resolveTicket(ticketId) {
        // Resolve ticket (mark as resolved)
        this.showCloseTicketDialog(ticketId);
    }
    
    editTicket(ticketId) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) {
            console.error('[TicketsWidget] Ticket not found:', ticketId);
            return;
        }
        
        // Only allow editing open/backlog tickets
        if (ticket.status !== 'open' && ticket.status !== 'backlog') {
            console.warn('[TicketsWidget] Cannot edit ticket that is not open or backlog');
            return;
        }
        
        this.showEditTicketDialog(ticket);
    }
    
    showEditTicketDialog(ticket) {
        // Create or get edit dialog
        let dialog = document.getElementById('editTicketDialog');
        if (!dialog) {
            dialog = this.createEditTicketDialog();
        }
        
        // Populate form with current ticket data
        const titleInput = dialog.querySelector('#editTicketTitle');
        const descriptionInput = dialog.querySelector('#editTicketDescription');
        const prioritySelect = dialog.querySelector('#editTicketPriority');
        const typeSelect = dialog.querySelector('#editTicketType');
        const errorDiv = dialog.querySelector('#editTicketError');
        
        if (titleInput) titleInput.value = ticket.title || '';
        if (descriptionInput) descriptionInput.value = ticket.description || '';
        if (prioritySelect) prioritySelect.value = ticket.priority || 2;
        if (typeSelect) typeSelect.value = ticket.ticket_type || 'bug';
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.add('hidden');
        }
        
        // Store ticket ID on dialog
        dialog._ticketId = ticket.id;
        
        // Setup handlers
        this.setupEditTicketDialogHandlers();
        
        // Show dialog
        dialog.classList.remove('hidden');
        
        // Focus title input
        setTimeout(() => {
            if (titleInput) titleInput.focus();
        }, 100);
    }
    
    createEditTicketDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'editTicketDialog';
        overlay.className = 'zork-ticket-dialog-overlay hidden';
        overlay.innerHTML = `
            <div class="zork-ticket-dialog">
                <div class="zork-ticket-dialog-header">
                    <h3>Edit Ticket</h3>
                    <button id="closeEditTicketDialog" class="zork-ticket-dialog-close">×</button>
                </div>
                <div class="zork-ticket-dialog-content">
                    <label for="editTicketTitle">Title:</label>
                    <input type="text" id="editTicketTitle" class="zork-ticket-input" placeholder="Ticket title" maxlength="200">
                    
                    <label for="editTicketDescription">Description:</label>
                    <textarea id="editTicketDescription" class="zork-ticket-textarea" placeholder="Ticket description" rows="8"></textarea>
                    
                    <div style="display: flex; gap: 16px; margin-top: 12px;">
                        <div style="flex: 1;">
                            <label for="editTicketPriority">Priority:</label>
                            <select id="editTicketPriority" class="zork-ticket-input">
                                <option value="1">Low</option>
                                <option value="2" selected>Medium</option>
                                <option value="3">High</option>
                                <option value="4">Critical</option>
                            </select>
                        </div>
                        <div style="flex: 1;">
                            <label for="editTicketType">Type:</label>
                            <select id="editTicketType" class="zork-ticket-input">
                                <option value="bug" selected>Bug</option>
                                <option value="feature">Feature</option>
                                <option value="debug">Debug</option>
                            </select>
                        </div>
                    </div>
                    <div id="editTicketError" class="zork-ticket-error hidden"></div>
                </div>
                <div class="zork-ticket-dialog-buttons">
                    <button id="editTicketSubmit" class="zork-ticket-btn zork-ticket-btn-primary">Save Changes</button>
                    <button id="editTicketCancel" class="zork-ticket-btn zork-ticket-btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }
    
    setupEditTicketDialogHandlers() {
        const dialog = document.getElementById('editTicketDialog');
        const submitBtn = document.getElementById('editTicketSubmit');
        const cancelBtn = document.getElementById('editTicketCancel');
        const closeBtn = document.getElementById('closeEditTicketDialog');
        const errorDiv = document.getElementById('editTicketError');
        const titleInput = document.getElementById('editTicketTitle');
        const descriptionInput = document.getElementById('editTicketDescription');
        
        if (!dialog || !submitBtn || !cancelBtn || !closeBtn) {
            console.error('[TicketsWidget] Edit ticket dialog elements not found');
            return;
        }
        
        // Remove old handlers if they exist
        if (dialog._handlersSetup) {
            return; // Already setup
        }
        
        const closeDialog = () => {
            dialog.classList.add('hidden');
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.classList.add('hidden');
            }
        };
        
        const handleSubmit = () => {
            const ticketId = dialog._ticketId;
            if (!ticketId) {
                console.error('[TicketsWidget] No ticket ID on edit dialog');
                return;
            }
            
            const title = titleInput ? titleInput.value.trim() : '';
            const description = descriptionInput ? descriptionInput.value.trim() : '';
            const priority = parseInt(document.getElementById('editTicketPriority')?.value || '2', 10);
            const ticketType = document.getElementById('editTicketType')?.value || 'bug';
            
            if (!title) {
                if (errorDiv) {
                    errorDiv.textContent = 'Title is required.';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }
            
            // Send update to server
            const ws = this.game.getWebSocket();
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.error('[TicketsWidget] Not connected');
                if (errorDiv) {
                    errorDiv.textContent = 'Not connected to server.';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }
            
            this.game.send({
                type: 'updateTicket',
                ticketId: ticketId,
                title: title,
                description: description,
                priority: priority,
                ticketType: ticketType
            });
            
            closeDialog();
            
            // The handleTicketUpdated will refresh the modal automatically when server responds
            // Just reload tickets to get fresh data
            setTimeout(() => {
                this.loadTickets();
            }, 300);
        };
        
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', closeDialog);
        closeBtn.addEventListener('click', closeDialog);
        
        // Close on overlay click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
        
        // Submit on Enter in title (but not in description)
        if (titleInput) {
            titleInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    descriptionInput?.focus();
                }
            });
        }
        
        dialog._handlersSetup = true;
    }
    
    addContext(ticketId) {
        // Use static HTML dialog (like zorkTicketDialog) - EXACT pattern from Terminal.js
        this.showAddContextDialog(ticketId);
    }
    
    showAddContextDialog(ticketId) {
        const dialog = document.getElementById('addContextDialog');
        const input = document.getElementById('addContextInput');
        const errorDiv = document.getElementById('addContextError');
        
        if (!dialog || !input || !errorDiv) {
            console.error('[TicketsWidget] Add Context dialog elements not found');
            return;
        }
        
        // Clear previous values
        input.value = '';
        errorDiv.textContent = '';
        errorDiv.classList.add('hidden');
        
        // Always setup handlers (like Terminal.js does - it guards internally)
        this.setupAddContextDialogHandlers(ticketId);
        
        // Show dialog
        dialog.classList.remove('hidden');
        
        // Focus input
        setTimeout(() => input.focus(), 100);
    }
    
    setupAddContextDialogHandlers(ticketId) {
        const dialog = document.getElementById('addContextDialog');
        const input = document.getElementById('addContextInput');
        const submitBtn = document.getElementById('addContextSubmit');
        const cancelBtn = document.getElementById('addContextCancel');
        const closeBtn = document.getElementById('closeAddContextDialog');
        const errorDiv = document.getElementById('addContextError');
        
        if (!dialog || !input || !submitBtn || !cancelBtn || !closeBtn || !errorDiv) {
            console.error('[TicketsWidget] Add Context dialog elements not found for handler setup');
            return;
        }
        
        // If handlers are already set up, just update ticket ID and return (like Terminal.js pattern)
        if (dialog._handlersSetup) {
            dialog._currentTicketId = ticketId;
            return;
        }
        
        // Store ticket ID on dialog
        dialog._currentTicketId = ticketId;
        
        const closeDialog = () => {
            dialog.classList.add('hidden');
            errorDiv.classList.add('hidden');
            input.value = '';
        };
        
        // Setup image paste handler - EXACTLY like Terminal.js create ticket dialog
        input._pasteHandler = async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            // Look for image in clipboard
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault();
                    console.log('[TicketsWidget] Image detected in clipboard, processing...');
                    
                    const file = item.getAsFile();
                    if (!file) continue;
                    
                    // Convert to base64
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64Image = event.target.result;
                        const imageSizeKB = Math.round(base64Image.length / 1024);
                        
                        console.log('[TicketsWidget] Image converted to base64, size:', imageSizeKB, 'KB');
                        
                        // Check size limit (5MB base64 = ~3.75MB actual)
                        if (imageSizeKB > 5120) {
                            errorDiv.textContent = `Image too large (${imageSizeKB}KB). Maximum size is 5MB.`;
                            errorDiv.classList.remove('hidden');
                            return;
                        }
                        
                        // Insert image markdown at cursor position
                        const cursorPos = input.selectionStart;
                        const textBefore = input.value.substring(0, cursorPos);
                        const textAfter = input.value.substring(cursorPos);
                        
                        // Insert image as markdown-style embed
                        const imageMarkdown = `\n\n![Screenshot](${base64Image})\n\n`;
                        input.value = textBefore + imageMarkdown + textAfter;
                        
                        // Move cursor after inserted image
                        const newCursorPos = cursorPos + imageMarkdown.length;
                        input.setSelectionRange(newCursorPos, newCursorPos);
                        
                        // Show success message
                        const successMsg = document.createElement('div');
                        successMsg.className = 'ticket-image-success';
                        successMsg.textContent = `✓ Screenshot pasted (${imageSizeKB}KB)`;
                        successMsg.style.cssText = 'color: #00ff00; font-size: 11px; margin-top: 5px;';
                        
                        // Remove any existing success message
                        const existing = input.parentElement.querySelector('.ticket-image-success');
                        if (existing) existing.remove();
                        
                        input.parentElement.appendChild(successMsg);
                        
                        // Remove success message after 3 seconds
                        setTimeout(() => {
                            if (successMsg.parentElement) {
                                successMsg.remove();
                            }
                        }, 3000);
                        
                        input.focus();
                    };
                    
                    reader.onerror = () => {
                        console.error('[TicketsWidget] Error reading image file');
                        errorDiv.textContent = 'Error processing image. Please try again.';
                        errorDiv.classList.remove('hidden');
                    };
                    
                    reader.readAsDataURL(file);
                    break;
                }
            }
        };
        
        // Attach paste handler - EXACTLY like Terminal.js
        input.addEventListener('paste', input._pasteHandler);
        
        // Submit handler
        const handleSubmit = () => {
            const context = input.value.trim();
            if (!context) {
                errorDiv.textContent = 'Please enter some context or feedback.';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            const currentTicketId = dialog._currentTicketId || ticketId;
            
            // Add context as feedback, then reopen ticket
            this.submitFeedback(currentTicketId, context);
            setTimeout(() => {
                this.updateTicketStatus(currentTicketId, 'open', 'Resubmitted with additional context');
            }, 500);
            
            closeDialog();
        };
        
        // Attach button handlers
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', closeDialog);
        closeBtn.addEventListener('click', closeDialog);
        
        // Close on overlay click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
        
        // Submit on Ctrl+Enter
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                handleSubmit();
            }
        });
        
        // Escape to close
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !dialog.classList.contains('hidden')) {
                closeDialog();
            }
        });
        
        // Mark handlers as set up
        dialog._handlersSetup = true;
    }
    
    openCreateTicketDialog() {
        console.log('[TicketsWidget] openCreateTicketDialog called');
        // Open the ZORK ticket creation dialog (reuse Terminal's dialog)
        // Try multiple ways to access terminal component
        let terminal = null;
        
        // Method 1: Check if terminal is stored globally
        if (typeof window !== 'undefined' && window.terminal) {
            terminal = window.terminal;
            console.log('[TicketsWidget] Found terminal via window.terminal');
        }
        
        // Method 2: Try to get from game object
        if (!terminal && this.game && this.game.terminal) {
            terminal = this.game.terminal;
            console.log('[TicketsWidget] Found terminal via game.terminal');
        }
        
        if (terminal && typeof terminal.openZorkTicketDialog === 'function') {
            console.log('[TicketsWidget] Calling terminal.openZorkTicketDialog()');
            terminal.openZorkTicketDialog();
        } else {
            console.warn('[TicketsWidget] Terminal not found or openZorkTicketDialog not available, trying direct dialog access');
            // Fallback: try to find and open the dialog directly
            const dialog = document.getElementById('zorkTicketDialog');
            if (dialog) {
                console.log('[TicketsWidget] Found zorkTicketDialog, opening directly');
                dialog.classList.remove('hidden');
                const titleInput = document.getElementById('zorkTicketTitle');
                if (titleInput) {
                    setTimeout(() => titleInput.focus(), 100);
                }
                // Also try to setup handlers if dialog exists
                if (terminal && typeof terminal.setupZorkTicketDialogHandlers === 'function') {
                    terminal.setupZorkTicketDialogHandlers();
                }
            } else {
                console.error('[TicketsWidget] Could not find ticket creation dialog');
                // Use bespoke dialog instead of alert
                if (this.game && this.game.messageBus) {
                    if (window.terminal) {
                        window.terminal.addMessage('Ticket creation dialog not available. Please use the Z button in the command line.', 'error');
                    }
                } else {
                    alert('Ticket creation dialog not available. Please use the Z button in the command line.');
                }
            }
        }
    }
}

