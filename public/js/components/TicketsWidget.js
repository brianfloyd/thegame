/**
 * Tickets Widget
 * 
 * Displays and manages tickets (bugs, feature requests, work tickets)
 * Allows viewing past tickets, closing tickets, adding feedback
 */

import Component from '../core/Component.js';

export default class TicketsWidget extends Component {
    constructor(game) {
        super(game);
        this.tickets = [];
        this.filterStatus = 'open'; // 'open', 'in_progress', 'resolved', 'all'
        this.showResolved = false;
        this.lastSuccessfulLoad = null; // Track last successful ticket load
        this.isLoading = false; // Prevent concurrent loads
        this.currentTab = 'openPending'; // 'openPending' or 'testing'
        this.godMode = false; // Track god mode status
    }
    
    init() {
        super.init();
        
        this.container = document.getElementById('ticketsWidget');
        if (!this.container) {
            console.error('[TicketsWidget] Container not found');
            return;
        }
        
        // Restore filter from localStorage if available
        if (typeof localStorage !== 'undefined') {
            const savedFilter = localStorage.getItem('ticketsWidget_filter');
            if (savedFilter && ['open', 'in_progress', 'resolved', 'all'].includes(savedFilter)) {
                this.filterStatus = savedFilter;
                console.log(`[TicketsWidget] Restored filter from localStorage: ${this.filterStatus}`);
            }
        }
        
        this.setupEventListeners();
        this.loadTickets();
        
        // Subscribe to ticket updates
        this.subscribe('ticketUpdated', (data) => this.handleTicketUpdated(data));
        this.subscribe('ticketFeedbackAdded', (data) => this.handleTicketFeedbackAdded(data));
        this.subscribe('ticketsList', (data) => this.handleTicketsList(data));
        
        // Auto-refresh tickets every 5 seconds to see status changes
        this.autoRefreshInterval = setInterval(() => {
            this.loadTickets();
        }, 5000);
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
            }
        };
        
        this.container.addEventListener('click', this._eventDelegationHandler);
    }
    
    setTab(tab) {
        if (!['openPending', 'testing'].includes(tab)) return;
        this.currentTab = tab;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_tab', tab);
        }
        console.log(`[TicketsWidget] Switched to tab: ${tab}`);
        this.render();
    }
    
    setFilter(status) {
        console.log(`[TicketsWidget] Setting filter to: ${status}`);
        this.filterStatus = status;
        // Save filter to localStorage to persist across refreshes
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_filter', status);
        }
        this.render();
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
            console.log('[TicketsWidget] Already loading, skipping duplicate request');
            return;
        }
        
        this.isLoading = true;
        console.log(`[TicketsWidget] Loading tickets with filter: ${this.filterStatus}, includeResolved: ${this.showResolved || this.filterStatus === 'resolved'}`);
        
            // Request ALL tickets, let client do the filtering
            // This prevents server-side filtering from returning empty arrays
            ws.send(JSON.stringify({
                type: 'getTickets',
                status: null, // Always get all tickets, filter on client
                limit: 100,
                includeResolved: true, // Get all tickets including resolved
                includeDeleted: false // Don't include deleted tickets
            }));
    }
    
    
    handleTicketsList(data) {
        this.isLoading = false; // Mark loading as complete
        
        console.log('[TicketsWidget] ========== handleTicketsList START ==========');
        console.log('[TicketsWidget] Current filter status BEFORE update: "${this.filterStatus}"');
        
        // CRITICAL: Save filter to localStorage before any operations
        const savedFilter = this.filterStatus;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketsWidget_filter', savedFilter);
            console.log(`[TicketsWidget] Saved filter to localStorage: "${savedFilter}"`);
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
            console.log(`[TicketsWidget] Received ${data.tickets.length} tickets from server`);
            console.log(`[TicketsWidget] Ticket statuses from server:`, data.tickets.map(t => `#${t.id}:${t.status}`).join(', '));
            
            // CRITICAL: Restore filter from localStorage in case it was lost
            if (typeof localStorage !== 'undefined') {
                const storedFilter = localStorage.getItem('ticketsWidget_filter');
                if (storedFilter && ['open', 'in_progress', 'resolved', 'all'].includes(storedFilter)) {
                    if (this.filterStatus !== storedFilter) {
                        console.warn(`[TicketsWidget] Filter mismatch! Current: "${this.filterStatus}", Stored: "${storedFilter}", restoring from localStorage`);
                        this.filterStatus = storedFilter;
                    }
                }
            }
            
            // Always update tickets array with fresh data from server
            this.tickets = data.tickets;
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
            
            console.log(`[TicketsWidget] Updated tickets array, now has ${this.tickets.length} tickets`);
            console.log(`[TicketsWidget] Current filter AFTER update: "${this.filterStatus}"`);
            console.log('[TicketsWidget] ========== About to call render() ==========');
            
            // Render with current filter (don't change filter)
            this.render();
            
            console.log('[TicketsWidget] ========== handleTicketsList END ==========');
        } else {
            console.error('[TicketsWidget] Received non-array tickets:', typeof data.tickets, data.tickets);
            // Don't clear tickets if we get bad data - keep existing ones
        }
    }
    
    handleTicketUpdated(data) {
        // If ticket was deleted, immediately remove it from local array to prevent stale display
        if (data.ticket && data.ticket.status === 'deleted') {
            console.log(`[TicketsWidget] Ticket #${data.ticketId} was deleted, removing from local array immediately`);
            this.tickets = this.tickets.filter(t => t && t.id !== data.ticketId);
            // Re-render immediately to reflect deletion
            this.render();
        }
        
        // Reload tickets after update to get fresh data from server
        this.loadTickets();
    }
    
    handleTicketFeedbackAdded(data) {
        // Reload tickets after feedback added
        this.loadTickets();
    }
    
    render() {
        if (!this.container) {
            console.error('[TicketsWidget] Container not found, cannot render');
            return;
        }
        
        // CRITICAL: Preserve filter status - don't let it get reset
        const filterBeforeRender = this.filterStatus;
        console.log(`[TicketsWidget] RENDER START - Filter: "${filterBeforeRender}", Tickets: ${this.tickets.length}`);
        
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
        
        console.log(`[TicketsWidget] Rendering with ${this.tickets.length} total tickets, filter: "${this.filterStatus}"`);
        
        // CRITICAL: Filter tickets and store result
        let filtered = this.filterTickets();
        console.log(`[TicketsWidget] After filtering: ${filtered.length} tickets shown`);
        console.log(`[TicketsWidget] Filtered array reference:`, filtered);
        console.log(`[TicketsWidget] Filtered array length:`, filtered.length);
        
        // Verify filter wasn't changed during filtering
        if (this.filterStatus !== filterBeforeRender) {
            console.error(`[TicketsWidget] FILTER WAS CHANGED DURING RENDER! Was "${filterBeforeRender}", now "${this.filterStatus}"`);
            this.filterStatus = filterBeforeRender; // Restore it
            // Re-filter with correct filter
            filtered = this.filterTickets();
            console.log(`[TicketsWidget] Re-filtered with restored filter: ${filtered.length} tickets`);
        }
        
        // Final verification - log what we're about to display
        console.log(`[TicketsWidget] FINAL - Displaying ${filtered.length} tickets with filter "${this.filterStatus}"`);
        if (filtered.length > 0) {
            filtered.forEach(t => {
                console.log(`[TicketsWidget]   - Ticket #${t.id}: status="${t.status}"`);
            });
        } else {
            console.log(`[TicketsWidget]   - No tickets to display (filter: "${this.filterStatus}")`);
        }
        
        // CRITICAL SAFETY CHECK: Double-verify filtered array matches filter
        if (this.filterStatus !== 'all') {
            const invalidTickets = filtered.filter(t => t && t.status !== this.filterStatus);
            if (invalidTickets.length > 0) {
                console.error(`[TicketsWidget] CRITICAL ERROR: Filtered array contains ${invalidTickets.length} tickets that don't match filter "${this.filterStatus}"!`);
                invalidTickets.forEach(t => {
                    console.error(`[TicketsWidget]   - Invalid ticket #${t.id}: status="${t.status}" (expected "${this.filterStatus}")`);
                });
                // Re-filter to fix it - create a NEW array
                filtered = this.tickets.filter(t => t && t.status === this.filterStatus);
                console.log(`[TicketsWidget] Re-filtered: ${filtered.length} tickets now match filter "${this.filterStatus}"`);
            }
        }
        
        // CRITICAL: Create a new const to ensure we use the filtered array
        const ticketsToDisplay = [...filtered]; // Create a copy to prevent any reference issues
        console.log(`[TicketsWidget] Created ticketsToDisplay array with ${ticketsToDisplay.length} tickets`);
        
        // Filter tickets based on current tab
        let tabTickets = [];
        let tabTitle = '';
        let tabCount = 0;
        
        if (this.currentTab === 'openPending') {
            // Tab 1: Open and Pending tickets (open status)
            tabTickets = ticketsToDisplay.filter(t => t.status === 'open');
            tabTitle = 'Open/Pending';
            tabCount = tabTickets.length;
        } else if (this.currentTab === 'testing') {
            // Tab 2: Testing - in_progress tickets with AC
            tabTickets = ticketsToDisplay.filter(t => t.status === 'in_progress' && t.resolution_notes);
            tabTitle = 'Testing';
            tabCount = tabTickets.length;
        }
        
        let html = `
            <div class="tickets-widget-header">
                <h3>Tickets</h3>
                <div class="tickets-tabs">
                    <button class="ticket-tab-btn ${this.currentTab === 'openPending' ? 'active' : ''}" id="ticketsTabOpenPending" data-tab="openPending">Open/Pending</button>
                    <button class="ticket-tab-btn ${this.currentTab === 'testing' ? 'active' : ''}" id="ticketsTabTesting" data-tab="testing">Testing</button>
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
                const statusEmoji = ticket.status === 'open' ? '🔴' : ticket.status === 'in_progress' ? '🟡' : '✅';
                const priorityText = ['', 'Low', 'Medium', 'High', 'Critical'][ticket.priority || 2];
                
                // Check if Cursor is working on this (in_progress status means Cursor is working)
                const cursorWorking = ticket.status === 'in_progress';
                const cursorIndicator = cursorWorking ? '<span class="cursor-working-indicator" title="Cursor is working on this ticket">🤖 Cursor Working...</span>' : '';
                
                // Tab-specific actions
                let actionButtons = '';
                if (this.currentTab === 'openPending') {
                    // Tab 1: Open/Pending - can move to pending, send to cursor, delete
                    actionButtons = `
                        <button class="ticket-action-btn" onclick="ticketsWidget.viewTicket(${ticket.id})">View</button>
                        <button class="ticket-action-btn" onclick="ticketsWidget.sendToCursor(${ticket.id})">Send to Cursor</button>
                        <button class="ticket-action-btn" onclick="ticketsWidget.deleteTicket(${ticket.id})">Delete</button>
                    `;
                } else if (this.currentTab === 'testing') {
                    // Tab 2: Testing - can resolve, add context (resubmits to cursor), delete
                    actionButtons = `
                        <button class="ticket-action-btn" onclick="ticketsWidget.viewTicket(${ticket.id})">View</button>
                        <button class="ticket-action-btn" onclick="ticketsWidget.resolveTicket(${ticket.id})">Resolve</button>
                        <button class="ticket-action-btn" onclick="ticketsWidget.addContext(${ticket.id})">Add Context</button>
                        <button class="ticket-action-btn" onclick="ticketsWidget.deleteTicket(${ticket.id})">Delete</button>
                    `;
                }
                
                html += `
                    <div class="ticket-item ${cursorWorking ? 'cursor-working' : ''}" data-ticket-id="${ticket.id}">
                        <div class="ticket-header">
                            <span class="ticket-status">${statusEmoji}</span>
                            <span class="ticket-id">#${ticket.id}</span>
                            <span class="ticket-title">${this.escapeHtml(ticket.title)}</span>
                            <span class="ticket-priority">${priorityText}</span>
                            ${cursorIndicator}
                        </div>
                        <div class="ticket-meta">
                            <span class="ticket-type">${ticket.ticket_type || 'debug'}</span>
                            <span class="ticket-created">${new Date(ticket.created_at).toLocaleDateString()}</span>
                            ${ticket.created_by ? `<span class="ticket-creator">by ${this.escapeHtml(ticket.created_by)}</span>` : ''}
                            ${ticket.updated_at && ticket.updated_at !== ticket.created_at ? `<span class="ticket-updated">Updated: ${new Date(ticket.updated_at).toLocaleString()}</span>` : ''}
                        </div>
                        ${ticket.description ? `<div class="ticket-description">${this.escapeHtml(ticket.description.substring(0, 100))}${ticket.description.length > 100 ? '...' : ''}</div>` : ''}
                        ${cursorWorking && ticket.resolution_notes ? `<div class="ticket-resolution-preview">${this.escapeHtml(ticket.resolution_notes.substring(0, 150))}${ticket.resolution_notes.length > 150 ? '...' : ''}</div>` : ''}
                        <div class="ticket-actions">
                            ${actionButtons}
                        </div>
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
        // Event listeners are set via onclick in the HTML for simplicity
        // Store reference for global access
        if (typeof window !== 'undefined') {
            window.ticketsWidget = this;
        }
    }
    
    viewTicket(ticketId) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) return;
        
        // Show ticket details in a dialog
        this.showTicketDetails(ticket);
    }
    
    showTicketDetails(ticket) {
        // Create or get details dialog
        let dialog = document.getElementById('ticketDetailsDialog');
        if (!dialog) {
            dialog = this.createTicketDetailsDialog();
        }
        
        const content = dialog.querySelector('.ticket-details-content');
        content.innerHTML = `
            <div class="ticket-details-header">
                <h3>Ticket #${ticket.id}: ${this.escapeHtml(ticket.title)}</h3>
                <button class="ticket-details-close" onclick="document.getElementById('ticketDetailsDialog').classList.add('hidden')">×</button>
            </div>
            <div class="ticket-details-body">
                <div class="ticket-detail-row">
                    <strong>Status:</strong> ${ticket.status}
                </div>
                <div class="ticket-detail-row">
                    <strong>Priority:</strong> ${['', 'Low', 'Medium', 'High', 'Critical'][ticket.priority || 2]}
                </div>
                <div class="ticket-detail-row">
                    <strong>Type:</strong> ${ticket.ticket_type || 'debug'}
                </div>
                <div class="ticket-detail-row">
                    <strong>Created:</strong> ${new Date(ticket.created_at).toLocaleString()}
                </div>
                ${ticket.created_by ? `<div class="ticket-detail-row"><strong>Created by:</strong> ${this.escapeHtml(ticket.created_by)}</div>` : ''}
                ${ticket.description ? `<div class="ticket-detail-section"><strong>Description:</strong><div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.description)}</div></div>` : ''}
                ${ticket.repro_steps ? `<div class="ticket-detail-section"><strong>Repro Steps:</strong><div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.repro_steps)}</div></div>` : ''}
                ${ticket.resolution_notes ? `<div class="ticket-detail-section"><strong>Resolution Notes:</strong><div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.resolution_notes)}</div></div>` : ''}
            </div>
        `;
        
        dialog.classList.remove('hidden');
    }
    
    createTicketDetailsDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'ticketDetailsDialog';
        dialog.className = 'ticket-details-dialog-overlay hidden';
        dialog.innerHTML = `
            <div class="ticket-details-dialog">
                <div class="ticket-details-content"></div>
            </div>
        `;
        document.body.appendChild(dialog);
        return dialog;
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
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'updateTicket',
            ticketId: ticketId,
            status: status,
            resolutionNotes: resolutionNotes
        }));
    }
    
    submitFeedback(ticketId, feedback) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[TicketsWidget] Not connected');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'addTicketFeedback',
            ticketId: ticketId,
            feedback: feedback
        }));
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
}

