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
            
            // Restore filters from localStorage
            this.restoreFilters();
            
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
            console.log('[TicketEditor] Received message:', data.type);
            
            switch (data.type) {
                case 'ticketsList':
                    this.tickets = mapRowsToTickets(data.tickets || []);
                    this.applyFilter();
                    this.loading = false;
                    console.log(`[TicketEditor] Loaded ${this.tickets.length} tickets`);
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
            this.loading = true;
            EditorBase.send({
                type: 'getTickets',
                status: null,
                limit: 200,
                includeResolved: true,
                includeDeleted: false
            });
        },
        
        /**
         * Apply filters to ticket list
         */
        applyFilter() {
            let filtered = [...this.tickets];
            
            // Filter by status
            if (this.filters.status !== 'all') {
                filtered = filtered.filter(t => t.status === this.filters.status);
            }
            
            // Filter by priority
            if (this.filters.priority) {
                const priority = parseInt(this.filters.priority);
                filtered = filtered.filter(t => t.priority === priority);
            }
            
            // Filter by ticket type
            if (this.filters.ticketType) {
                filtered = filtered.filter(t => t.ticket_type === this.filters.ticketType);
            }
            
            // Filter by search term
            if (this.filters.search.trim()) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(t => 
                    t.title.toLowerCase().includes(search) ||
                    (t.description && t.description.toLowerCase().includes(search)) ||
                    t.id.toString().includes(search)
                );
            }
            
            // Sort by priority (highest first), then by created_at (newest first)
            filtered.sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority;
                return new Date(b.created_at) - new Date(a.created_at);
            });
            
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
                ticket_type: this.formData.ticket_type,
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
                // Update existing ticket
                EditorBase.send({
                    type: 'updateTicket',
                    ticketId: this.selectedTicket.id,
                    ...payload
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
                    this.filters = { ...this.filters, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.warn('[TicketEditor] Failed to restore filters:', e);
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

