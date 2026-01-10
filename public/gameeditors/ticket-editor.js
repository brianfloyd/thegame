/**
 * Ticket Editor - Alpine.js Component
 * 
 * Uses EditorBase for WebSocket management and provides a unified
 * ticket management interface following the same patterns as other editors.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import {
    TICKET_STATUSES,
    TICKET_TYPES,
    TICKET_PRIORITIES,
    PRIORITY_LABELS,
    STATUS_EMOJIS,
    TYPE_LABELS,
    mapRowToTicket,
    mapRowsToTickets,
    validateTicket
} from '/js/models/ticket.js';

// Make ticketEditor available globally for Alpine.js
window.ticketEditor = function() {
    return {
        // State
        tickets: [],
        filteredTickets: [],
        selectedTicket: null,
        isCreating: false,
        loading: false,
        autoRefresh: true,
        refreshIntervalMs: 5000,
        autoRefreshInterval: null,
        
        // Filters
        filters: {
            status: 'all',
            priority: '',
            ticketType: '',
            search: ''
        },
        
        // Form data
        formData: {
            title: '',
            description: '',
            ticket_type: 'bug',
            status: 'open',
            priority: 2,
            repro_steps: '',
            resolution_notes: '',
            tags: []
        },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        /**
         * Initialize the editor
         */
        init() {
            console.log('[TicketEditor] Initializing...');
            
            // Restore filters from localStorage FIRST (before loading tickets)
            this.restoreFilters();
            
            // Validate filters after restore
            if (!['all', 'open', 'backlog', 'in_progress', 'resolved'].includes(this.filters.status)) {
                console.warn(`[TicketEditor] Invalid status filter after restore: "${this.filters.status}", resetting to 'all'`);
                this.filters.status = 'all';
            }
            
            console.log('[TicketEditor] Initial filters:', this.filters);
            
            // Initialize EditorBase
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[TicketEditor] EditorBase ready, loading tickets...');
                    this.loadTickets();
                    
                    // Start auto-refresh
                    if (this.autoRefresh) {
                        this.startAutoRefresh();
                    }
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            // Handle page unload
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
                this.stopAutoRefresh();
            });
        },
        
        /**
         * Handle WebSocket messages
         */
        handleMessage(data) {
            console.log('[TicketEditor] Received message:', data.type, data);
            
            switch (data.type) {
                case 'ticketsList':
                    console.log(`[TicketEditor] Received ticketsList with ${data.tickets ? data.tickets.length : 0} tickets`);
                    console.log('[TicketEditor] Raw tickets data:', data.tickets);
                    
                    // Map tickets
                    this.tickets = mapRowsToTickets(data.tickets || []);
                    console.log(`[TicketEditor] Mapped to ${this.tickets.length} tickets`);
                    
                    // Debug: Show status breakdown
                    if (this.tickets.length > 0) {
                        const statusBreakdown = {};
                        this.tickets.forEach(t => {
                            const status = t && t.status ? t.status : 'undefined';
                            statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
                        });
                        console.log('[TicketEditor] Ticket status breakdown:', statusBreakdown);
                        console.log('[TicketEditor] Current filter status:', this.filters.status);
                        console.log('[TicketEditor] Sample ticket:', this.tickets[0]);
                    }
                    
                    // Ensure filteredTickets array exists (Alpine.js reactivity)
                    if (!this.filteredTickets) {
                        this.filteredTickets = [];
                    }
                    
                    // Apply filters
                    this.applyFilter();
                    this.loading = false;
                    
                    console.log(`[TicketEditor] Final state: ${this.tickets.length} total tickets, ${this.filteredTickets ? this.filteredTickets.length : 0} filtered tickets`);
                    
                    // If no tickets showing but tickets exist, check all filters and auto-reset
                    if (this.tickets.length > 0 && (!this.filteredTickets || this.filteredTickets.length === 0)) {
                        const availableStatuses = [...new Set(this.tickets.map(t => t && t.status ? t.status : 'undefined').filter(Boolean))];
                        // Normalize priorities to numbers for comparison
                        const availablePriorities = [...new Set(this.tickets.map(t => {
                            if (!t || t.priority === null || t.priority === undefined) return null;
                            const p = typeof t.priority === 'number' ? t.priority : parseInt(t.priority);
                            return isNaN(p) ? null : p;
                        }).filter(p => p !== null))];
                        const availableTypes = [...new Set(this.tickets.map(t => t && t.ticket_type ? t.ticket_type : 'undefined').filter(Boolean))];
                        
                        console.log('[TicketEditor] Available filter values:', {
                            statuses: availableStatuses,
                            priorities: availablePriorities,
                            types: availableTypes
                        });
                        
                        const filterIssues = [];
                        let shouldReset = false;
                        
                        // Check status filter
                        if (this.filters.status !== 'all' && !availableStatuses.includes(this.filters.status)) {
                            filterIssues.push(`status "${this.filters.status}"`);
                            shouldReset = true;
                        }
                        
                        // Check priority filter
                        if (this.filters.priority) {
                            const priorityNum = parseInt(this.filters.priority);
                            if (!availablePriorities.includes(priorityNum)) {
                                filterIssues.push(`priority ${priorityNum}`);
                                shouldReset = true;
                            }
                        }
                        
                        // Check ticket type filter
                        if (this.filters.ticketType && !availableTypes.includes(this.filters.ticketType)) {
                            filterIssues.push(`type "${this.filters.ticketType}"`);
                            shouldReset = true;
                        }
                        
                        console.warn('[TicketEditor] WARNING: Tickets loaded but none match current filters!', {
                            totalTickets: this.tickets.length,
                            currentFilters: this.filters,
                            availableStatuses: availableStatuses,
                            availablePriorities: availablePriorities,
                            availableTypes: availableTypes,
                            filterIssues: filterIssues
                        });
                        
                        // Auto-reset filters if they're too restrictive
                        if (shouldReset) {
                            console.log(`[TicketEditor] Auto-resetting filters (${filterIssues.join(', ')} filter out all tickets)`);
                            
                            // Reset problematic filters
                            if (this.filters.status !== 'all' && !availableStatuses.includes(this.filters.status)) {
                                this.filters.status = 'all';
                            }
                            if (this.filters.priority && !availablePriorities.includes(parseInt(this.filters.priority))) {
                                this.filters.priority = '';
                            }
                            if (this.filters.ticketType && !availableTypes.includes(this.filters.ticketType)) {
                                this.filters.ticketType = '';
                            }
                            
                            // Re-apply filters
                            this.applyFilter();
                            this.showNotification(`No tickets match current filters (${filterIssues.join(', ')}). Filters reset to show all tickets.`, 'info');
                        }
                    }
                    break;
                    
                case 'ticketCreated':
                    if (data.ticket) {
                        const ticket = mapRowToTicket(data.ticket);
                        this.tickets.unshift(ticket);
                        this.selectTicket(ticket);
                        this.applyFilter();
                        this.showNotification(`Ticket #${ticket.id} created`, 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'ticketUpdated':
                    if (data.ticket) {
                        const ticket = mapRowToTicket(data.ticket);
                        const index = this.tickets.findIndex(t => t.id === ticket.id);
                        if (index !== -1) {
                            this.tickets[index] = ticket;
                        }
                        // Update selected ticket if it's the same one
                        if (this.selectedTicket && this.selectedTicket.id === ticket.id) {
                            this.selectedTicket = ticket;
                            this.populateForm(ticket);
                        }
                        this.applyFilter();
                        this.showNotification(`Ticket #${ticket.id} updated`, 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'ticketDeleted':
                    if (data.ticketId) {
                        this.tickets = this.tickets.filter(t => t.id !== data.ticketId);
                        if (this.selectedTicket && this.selectedTicket.id === data.ticketId) {
                            this.selectedTicket = null;
                            this.resetForm();
                        }
                        this.applyFilter();
                        this.showNotification(`Ticket #${data.ticketId} deleted`, 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'error':
                    this.showNotification(data.message || 'An error occurred', 'error');
                    this.loading = false;
                    break;
            }
        },
        
        /**
         * Load tickets from server
         */
        loadTickets() {
            console.log('[TicketEditor] Loading tickets...');
            this.loading = true;
            EditorBase.send({
                type: 'getTickets',
                status: null,
                limit: 200,
                includeResolved: true,
                includeDeleted: false
            });
            console.log('[TicketEditor] Sent getTickets message');
        },
        
        /**
         * Apply filters to ticket list
         */
        applyFilter() {
            console.log('[TicketEditor] applyFilter() called', {
                ticketsCount: this.tickets.length,
                filters: this.filters
            });
            
            let filtered = [...this.tickets];
            console.log('[TicketEditor] Starting with', filtered.length, 'tickets');
            
            // Filter by status
            if (this.filters.status !== 'all') {
                const beforeStatus = filtered.length;
                filtered = filtered.filter(t => {
                    const matches = t && t.status === this.filters.status;
                    if (!matches && t) {
                        console.log(`[TicketEditor] Filtering out ticket #${t.id} - status "${t.status}" !== filter "${this.filters.status}"`);
                    }
                    return matches;
                });
                console.log(`[TicketEditor] After status filter (${this.filters.status}): ${beforeStatus} -> ${filtered.length}`);
            } else {
                console.log('[TicketEditor] Status filter is "all", showing all tickets');
            }
            
            // Filter by priority
            if (this.filters.priority) {
                const beforePriority = filtered.length;
                const priority = parseInt(this.filters.priority);
                
                // Get available priorities before filtering (for debugging)
                const availablePrioritiesBefore = [...new Set(filtered.map(t => {
                    if (!t) return null;
                    return typeof t.priority === 'number' ? t.priority : parseInt(t.priority);
                }).filter(p => p !== null && !isNaN(p)))];
                
                filtered = filtered.filter(t => {
                    if (!t) return false;
                    const ticketPriority = typeof t.priority === 'number' ? t.priority : parseInt(t.priority);
                    const matches = ticketPriority === priority;
                    if (!matches && t) {
                        console.log(`[TicketEditor] Filtering out ticket #${t.id} - priority ${ticketPriority} !== filter ${priority}`);
                    }
                    return matches;
                });
                
                console.log(`[TicketEditor] After priority filter (${priority}): ${beforePriority} -> ${filtered.length}`);
                if (filtered.length === 0 && beforePriority > 0) {
                    console.warn(`[TicketEditor] Priority filter ${priority} filtered out all ${beforePriority} tickets. Available priorities before filter:`, availablePrioritiesBefore);
                }
            }
            
            // Filter by ticket type
            if (this.filters.ticketType) {
                const beforeType = filtered.length;
                filtered = filtered.filter(t => t && t.ticket_type === this.filters.ticketType);
                console.log(`[TicketEditor] After ticket type filter (${this.filters.ticketType}): ${beforeType} -> ${filtered.length}`);
            }
            
            // Filter by search term
            if (this.filters.search.trim()) {
                const beforeSearch = filtered.length;
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(t => 
                    t && (
                        (t.title && t.title.toLowerCase().includes(search)) ||
                        (t.description && t.description.toLowerCase().includes(search)) ||
                        t.id.toString().includes(search)
                    )
                );
                console.log(`[TicketEditor] After search filter ("${this.filters.search}"): ${beforeSearch} -> ${filtered.length}`);
            }
            
            // Sort by priority (highest first), then by created_at (newest first)
            filtered.sort((a, b) => {
                if (!a || !b) return 0;
                if (b.priority !== a.priority) return b.priority - a.priority;
                return new Date(b.created_at) - new Date(a.created_at);
            });
            
            console.log(`[TicketEditor] Final filtered count: ${filtered.length} tickets`);
            if (filtered.length > 0) {
                console.log('[TicketEditor] Sample filtered tickets:', filtered.slice(0, 3).map(t => `#${t.id}:${t.status}`));
            } else if (this.tickets.length > 0) {
                console.warn('[TicketEditor] WARNING: All tickets filtered out!', {
                    totalTickets: this.tickets.length,
                    filters: this.filters,
                    ticketStatuses: [...new Set(this.tickets.map(t => t.status))]
                });
            }
            
            this.filteredTickets = filtered;
            
            // Save filters to localStorage
            this.saveFilters();
        },
        
        /**
         * Select a ticket for viewing/editing
         */
        selectTicket(ticket) {
            this.selectedTicket = ticket;
            this.isCreating = false;
            this.populateForm(ticket);
        },
        
        /**
         * Populate form with ticket data
         */
        populateForm(ticket) {
            this.formData = {
                title: ticket.title || '',
                description: ticket.description || '',
                ticket_type: ticket.ticket_type || 'bug',
                status: ticket.status || 'open',
                priority: ticket.priority || 2,
                repro_steps: ticket.repro_steps || '',
                resolution_notes: ticket.resolution_notes || '',
                tags: Array.isArray(ticket.tags) ? [...ticket.tags] : []
            };
        },
        
        /**
         * Reset form to defaults
         */
        resetForm() {
            this.formData = {
                title: '',
                description: '',
                ticket_type: 'bug',
                status: 'open',
                priority: 2,
                repro_steps: '',
                resolution_notes: '',
                tags: []
            };
        },
        
        /**
         * Create a new ticket
         */
        createTicket() {
            this.selectedTicket = null;
            this.isCreating = true;
            this.resetForm();
        },
        
        /**
         * Clone the selected ticket
         */
        cloneTicket() {
            if (!this.selectedTicket) return;
            
            this.isCreating = true;
            this.formData = {
                ...this.formData,
                title: `[Clone] ${this.formData.title}`,
                status: 'open',
                resolution_notes: ''
            };
            this.selectedTicket = null;
        },
        
        /**
         * Save the current ticket (create or update)
         */
        saveTicket() {
            if (!this.canSave()) {
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }
            
            this.loading = true;
            
            const payload = {
                title: this.formData.title.trim(),
                description: this.formData.description.trim(),
                ticket_type: this.formData.ticket_type, // createTicket expects snake_case
                status: this.formData.status,
                priority: parseInt(this.formData.priority),
                repro_steps: this.formData.repro_steps.trim() || null,
                resolution_notes: this.formData.resolution_notes.trim() || null,
                tags: this.formData.tags
            };
            
            if (this.isCreating) {
                // Create new ticket
                EditorBase.send({
                    type: 'createTicket',
                    ...payload,
                    created_by: 'god_mode'
                });
                this.isCreating = false;
            } else if (this.selectedTicket) {
                // Update existing ticket (updateTicket accepts both snake_case and camelCase)
                EditorBase.send({
                    type: 'updateTicket',
                    ticketId: this.selectedTicket.id,
                    ticketType: payload.ticket_type, // updateTicket prefers camelCase
                    status: payload.status,
                    priority: payload.priority,
                    reproSteps: payload.repro_steps,
                    resolutionNotes: payload.resolution_notes,
                    title: payload.title,
                    description: payload.description,
                    tags: payload.tags
                });
            }
        },
        
        /**
         * Delete the selected ticket
         */
        deleteTicket() {
            if (!this.selectedTicket) return;
            
            if (!confirm(`Are you sure you want to delete ticket #${this.selectedTicket.id}?`)) {
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'updateTicket',
                ticketId: this.selectedTicket.id,
                status: 'deleted'
            });
        },
        
        /**
         * Cancel editing
         */
        cancelEdit() {
            this.isCreating = false;
            if (this.selectedTicket) {
                this.populateForm(this.selectedTicket);
            } else {
                this.resetForm();
            }
        },
        
        /**
         * Check if the form can be saved
         */
        canSave() {
            return this.formData.title.trim().length > 0;
        },
        
        /**
         * Add a tag
         */
        addTag(event) {
            const input = event.target;
            const tag = input.value.trim().replace(',', '');
            
            if (tag && !this.formData.tags.includes(tag)) {
                this.formData.tags.push(tag);
            }
            
            input.value = '';
        },
        
        /**
         * Remove a tag
         */
        removeTag(index) {
            this.formData.tags.splice(index, 1);
        },
        
        /**
         * Toggle auto-refresh
         */
        toggleAutoRefresh() {
            if (this.autoRefresh) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        },
        
        /**
         * Start auto-refresh interval
         */
        startAutoRefresh() {
            this.stopAutoRefresh();
            this.autoRefreshInterval = setInterval(() => {
                if (!this.loading) {
                    this.loadTickets();
                }
            }, this.refreshIntervalMs);
            console.log('[TicketEditor] Auto-refresh started');
        },
        
        /**
         * Stop auto-refresh interval
         */
        stopAutoRefresh() {
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
                console.log('[TicketEditor] Auto-refresh stopped');
            }
        },
        
        /**
         * Navigate to another page
         */
        navigateTo(url) {
            EditorBase.setNavigatingAway(true);
            this.stopAutoRefresh();
            window.location.href = url;
        },
        
        /**
         * Show notification
         */
        showNotification(message, type = 'info') {
            this.notification = {
                show: true,
                message,
                type
            };
            
            setTimeout(() => {
                this.notification.show = false;
            }, 4000);
        },
        
        /**
         * Save filters to localStorage
         */
        saveFilters() {
            localStorage.setItem('ticketEditor_filters', JSON.stringify(this.filters));
        },
        
        /**
         * Restore filters from localStorage
         */
        restoreFilters() {
            try {
                const saved = localStorage.getItem('ticketEditor_filters');
                if (saved) {
                    const restored = JSON.parse(saved);
                    console.log('[TicketEditor] Restoring filters from localStorage:', restored);
                    this.filters = { ...this.filters, ...restored };
                    // Ensure status filter is valid
                    if (this.filters.status && !['all', 'open', 'backlog', 'in_progress', 'resolved'].includes(this.filters.status)) {
                        console.warn(`[TicketEditor] Invalid restored status filter: "${this.filters.status}", resetting to 'all'`);
                        this.filters.status = 'all';
                    }
                } else {
                    console.log('[TicketEditor] No saved filters found in localStorage, using defaults');
                }
            } catch (e) {
                console.warn('[TicketEditor] Failed to restore filters:', e);
                // Reset to defaults on error
                this.filters = {
                    status: 'all',
                    priority: '',
                    ticketType: '',
                    search: ''
                };
            }
        },
        
        // Display helpers
        getStatusEmoji(status) {
            return STATUS_EMOJIS[status] || '❓';
        },
        
        getPriorityLabel(priority) {
            return PRIORITY_LABELS[priority] || 'Unknown';
        },
        
        getTypeLabel(type) {
            return TYPE_LABELS[type] || type;
        },
        
        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            return date.toLocaleDateString();
        },
        
        formatDateTime(dateStr) {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            return date.toLocaleString();
        }
    };
};

