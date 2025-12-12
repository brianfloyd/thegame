/**
 * Markup Editor - Alpine.js Component
 * 
 * Manages markup conventions from the markup_conventions database table.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import { parseMarkup, MARKUP_COLORS, initializeTypewriterEffects, stopAllTypewriters } from '/js/utils/Markup.js';

// Make markupEditor available globally for Alpine.js
window.markupEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        conventions: [],
        filteredConventions: [],
        selectedConvention: null,
        isCreating: false,
        loading: false,
        previousOpening: '', // Track previous opening token for mirroring
        
        // Filters
        filters: {
            search: ''
        },
        
        // Form data
        formData: {
            syntax: '',
            opening: '',
            closing: '',
            description: '',
            example: '',
            color: 'keyword',
            effects: {
                glow: false,
                bold: false,
                italic: false,
                flash: false,
                pulse: false,
                typewriter: false,
                typewriterDelay: 100
            }
        },
        
        // Conflict detection
        conflictCheck: {
            hasConflict: false,
            conflicting: null
        },
        
        // Preview cache
        previewCache: null,
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        // Constants for template
        MARKUP_COLORS,

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[MarkupEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[MarkupEditor] EditorBase ready, loading conventions...');
                    this.loadConventions();
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
            });
        },

        // ============================================
        // WEBSOCKET HANDLERS
        // ============================================
        
        handleMessage(data) {
            console.log('[MarkupEditor] Message:', data.type, data);
            
            switch (data.type) {
                case 'markupConventionList':
                    console.log('[MarkupEditor] Received conventions:', data.conventions?.length || 0);
                    this.conventions = data.conventions || [];
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case 'markupConventionCreated':
                    if (data.convention) {
                        this.conventions.push(data.convention);
                        this.applyFilter();
                        this.selectConvention(data.convention);
                        this.showNotification('Convention created', 'success');
                    }
                    this.loading = false;
                    this.isCreating = false;
                    break;
                    
                case 'markupConventionUpdated':
                    if (data.convention) {
                        const idx = this.conventions.findIndex(c => c.id === data.convention.id);
                        if (idx !== -1) {
                            this.conventions[idx] = data.convention;
                        }
                        if (this.selectedConvention && this.selectedConvention.id === data.convention.id) {
                            this.selectedConvention = data.convention;
                            this.populateForm(data.convention);
                        }
                        this.applyFilter();
                        this.showNotification('Convention updated', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'markupConventionDeleted':
                    if (data.id) {
                        this.conventions = this.conventions.filter(c => c.id !== data.id);
                        if (this.selectedConvention && this.selectedConvention.id === data.id) {
                            this.selectedConvention = null;
                            this.resetForm();
                        }
                        this.applyFilter();
                        this.showNotification('Convention deleted', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'error':
                    // Check if it's a conflict error
                    if (data.conflict) {
                        this.conflictCheck = {
                            hasConflict: true,
                            conflicting: data.conflict
                        };
                        this.showNotification(data.message || 'Conflict detected', 'error');
                    } else {
                        this.showNotification(data.message || 'An error occurred', 'error');
                    }
                    this.loading = false;
                    break;
            }
        },

        // ============================================
        // DATA LOADING
        // ============================================
        
        loadConventions() {
            this.loading = true;
            EditorBase.send({ type: 'getAllMarkupConventions' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.conventions];
            
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(convention => 
                    (convention.syntax && convention.syntax.toLowerCase().includes(search)) ||
                    (convention.description && convention.description.toLowerCase().includes(search)) ||
                    (convention.opening && convention.opening.toLowerCase().includes(search)) ||
                    (convention.closing && convention.closing.toLowerCase().includes(search))
                );
            }
            
            this.filteredConventions = filtered;
        },

        // ============================================
        // SELECTION
        // ============================================
        
        selectConvention(convention) {
            this.selectedConvention = convention;
            this.isCreating = false;
            this.populateForm(convention);
            this.conflictCheck = { hasConflict: false, conflicting: null };
        },
        
        populateForm(convention) {
            // Parse effects if it's a string
            let effects = convention.effects || {};
            if (typeof effects === 'string') {
                try {
                    effects = JSON.parse(effects);
                } catch (e) {
                    effects = {};
                }
            }
            
            this.formData = {
                syntax: convention.syntax || '',
                opening: convention.opening || '',
                closing: convention.closing || '',
                description: convention.description || '',
                example: convention.example || '',
                color: convention.color || 'keyword',
                effects: {
                    glow: effects.glow || false,
                    bold: effects.bold || false,
                    italic: effects.italic || false,
                    flash: effects.flash || false,
                    pulse: effects.pulse || false,
                    typewriter: effects.typewriter || false,
                    typewriterDelay: effects.typewriterDelay || 100
                }
            };
            
            // Set previous opening for mirroring logic
            this.previousOpening = convention.opening || '';
            
            this.updatePreview();
        },
        
        resetForm() {
            this.formData = {
                syntax: '',
                opening: '',
                closing: '',
                description: '',
                example: '',
                color: 'keyword',
                effects: {
                    glow: false,
                    bold: false,
                    italic: false,
                    flash: false,
                    pulse: false,
                    typewriter: false,
                    typewriterDelay: 100
                }
            };
            this.previousOpening = '';
            this.conflictCheck = { hasConflict: false, conflicting: null };
            this.previewCache = null;
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        createConvention() {
            this.selectedConvention = null;
            this.isCreating = true;
            this.resetForm();
        },
        
        saveConvention() {
            // Validation
            if (!this.formData.syntax || !this.formData.syntax.trim()) {
                this.showNotification('Syntax display is required', 'error');
                return;
            }
            
            if (!this.formData.opening || !this.formData.opening.trim()) {
                this.showNotification('Opening token is required', 'error');
                return;
            }
            
            if (!this.formData.closing || !this.formData.closing.trim()) {
                this.showNotification('Closing token is required', 'error');
                return;
            }
            
            // Check conflicts
            const conflict = this.checkConflicts(this.formData.opening, this.formData.closing, 
                this.isCreating ? null : this.selectedConvention?.id);
            
            if (conflict.hasConflict && !confirm(`Conflict detected with convention: ${conflict.conflicting.syntax}\n\nProceed anyway?`)) {
                return;
            }
            
            // Prepare convention data
            const conventionData = {
                syntax: this.formData.syntax.trim(),
                opening: this.formData.opening.trim(),
                closing: this.formData.closing.trim(),
                description: (this.formData.description || '').trim(),
                example: (this.formData.example || '').trim(),
                color: this.formData.color || 'keyword',
                effects: { ...this.formData.effects }
            };
            
            // Clean up effects - remove false values
            Object.keys(conventionData.effects).forEach(key => {
                if (conventionData.effects[key] === false || conventionData.effects[key] === null || conventionData.effects[key] === undefined) {
                    delete conventionData.effects[key];
                }
            });
            
            this.loading = true;
            this.conflictCheck = { hasConflict: false, conflicting: null };
            
            if (this.isCreating) {
                EditorBase.send({ type: 'createMarkupConvention', convention: conventionData });
            } else if (this.selectedConvention) {
                EditorBase.send({ 
                    type: 'updateMarkupConvention', 
                    id: this.selectedConvention.id,
                    convention: conventionData 
                });
            }
        },
        
        deleteConvention() {
            if (!this.selectedConvention) return;
            if (!confirm(`Delete convention "${this.selectedConvention.syntax}"?`)) return;
            
            this.loading = true;
            EditorBase.send({ type: 'deleteMarkupConvention', id: this.selectedConvention.id });
        },

        // ============================================
        // CONFLICT DETECTION
        // ============================================
        
        checkConflicts(opening, closing, excludeId = null) {
            const conflict = this.conventions.find(c => 
                c.id !== excludeId && (
                    c.opening === opening || 
                    c.closing === closing ||
                    c.opening === closing ||
                    c.closing === opening
                )
            );
            
            return { 
                hasConflict: !!conflict, 
                conflicting: conflict || null 
            };
        },
        
        onOpeningTokenChange() {
            // Mirror closing token to opening token if closing is empty or matches previous opening
            if (!this.formData.closing || this.formData.closing === this.previousOpening) {
                this.formData.closing = this.formData.opening;
            }
            this.previousOpening = this.formData.opening;
            this.checkConflictsOnChange();
        },
        
        checkConflictsOnChange() {
            if (!this.formData.opening || !this.formData.closing) {
                this.conflictCheck = { hasConflict: false, conflicting: null };
                return;
            }
            
            this.conflictCheck = this.checkConflicts(
                this.formData.opening, 
                this.formData.closing,
                this.isCreating ? null : this.selectedConvention?.id
            );
        },

        // ============================================
        // EFFECTS
        // ============================================
        
        updateEffects() {
            // Effects are updated via x-model bindings, just trigger preview update
            this.updatePreview();
        },

        // ============================================
        // PREVIEW RENDERING
        // ============================================
        
        renderPreview() {
            if (!this.formData.example) return '';
            
            // Build test text with current convention syntax
            const testText = this.formData.opening + this.formData.example + this.formData.closing;
            
            // Determine keyword color
            const keywordColor = this.formData.color === 'keyword' ? '#ff00ff' : 
                                 this.formData.color === 'inherit' ? '#00ffff' : 
                                 this.formData.color || '#00ffff';
            
            // Check if this convention has typewriter effect
            if (this.formData.effects.typewriter) {
                // Use parseMarkup which will handle typewriter properly
                // But we need to temporarily add this convention to the parser
                // For now, create the typewriter markup directly
                const delay = this.formData.effects.typewriterDelay || 100;
                const escapedExample = this.escapeHtml(this.formData.example);
                let style = '';
                if (this.formData.color && this.formData.color !== 'keyword' && this.formData.color !== 'inherit') {
                    style += `color: ${this.formData.color};`;
                } else if (this.formData.color === 'keyword') {
                    style += `color: ${keywordColor};`;
                }
                if (this.formData.effects.glow) {
                    style += 'text-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor, 0 0 20px currentColor;';
                }
                if (this.formData.effects.bold) {
                    style += 'font-weight: bold;';
                }
                if (this.formData.effects.italic) {
                    style += 'font-style: italic;';
                }
                return `<span class="typewriter-effect" data-typewriter="true" data-typewriter-delay="${delay}" style="${style}">${escapedExample}</span>`;
            }
            
            // For non-typewriter, create styled preview
            let style = '';
            if (this.formData.color && this.formData.color !== 'keyword' && this.formData.color !== 'inherit') {
                style += `color: ${this.formData.color};`;
            } else if (this.formData.color === 'keyword') {
                style += `color: ${keywordColor};`;
            }
            
            if (this.formData.effects.glow) {
                style += 'text-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor, 0 0 20px currentColor;';
            }
            if (this.formData.effects.bold) {
                style += 'font-weight: bold;';
            }
            if (this.formData.effects.italic) {
                style += 'font-style: italic;';
            }
            
            const escapedExample = this.escapeHtml(this.formData.example);
            return `<span style="${style}">${escapedExample}</span>`;
        },
        
        renderPreviewForList(convention) {
            if (!convention.example) return '';
            
            // Use parseMarkup for list items since conventions are loaded
            const testText = convention.opening + convention.example + convention.closing;
            const keywordColor = convention.color === 'keyword' ? '#ff00ff' : 
                                 convention.color === 'inherit' ? '#00ffff' : 
                                 convention.color || '#00ffff';
            
            try {
                return parseMarkup(testText, keywordColor);
            } catch (e) {
                console.error('[MarkupEditor] Error rendering preview:', e);
                return this.escapeHtml(convention.example);
            }
        },
        
        renderPreviewForConflict(conflicting) {
            if (!conflicting.example) return '';
            
            const testText = conflicting.opening + conflicting.example + conflicting.closing;
            const keywordColor = conflicting.color === 'keyword' ? '#ff00ff' : 
                                 conflicting.color === 'inherit' ? '#00ffff' : 
                                 conflicting.color || '#00ffff';
            
            try {
                return parseMarkup(testText, keywordColor);
            } catch (e) {
                console.error('[MarkupEditor] Error rendering conflict preview:', e);
                return this.escapeHtml(conflicting.example);
            }
        },
        
        updatePreview() {
            // Trigger Alpine.js reactivity
            this.previewCache = Date.now();
        },
        
        initPreviewTypewriter(element) {
            // Initialize typewriter effects after DOM update
            if (element && typeof initializeTypewriterEffects === 'function') {
                initializeTypewriterEffects(element);
            } else if (element && window.initializeTypewriterEffects) {
                window.initializeTypewriterEffects(element);
            }
        },
        
        refreshPreview(elementId) {
            const element = document.getElementById(elementId);
            if (!element) return;
            
            // Stop any existing typewriter animations in this element
            const typewriterElements = element.querySelectorAll('[data-typewriter="true"]');
            typewriterElements.forEach(el => {
                const id = el.getAttribute('data-typewriter-id');
                if (id && window.activeTypewriters) {
                    const timeoutId = window.activeTypewriters.get(id);
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        window.activeTypewriters.delete(id);
                    }
                }
                // Reset element - restore original content
                const content = el.getAttribute('data-typewriter-content');
                if (content) {
                    el.innerHTML = content;
                    el.removeAttribute('data-typewriter-animating');
                    el.removeAttribute('data-typewriter-id');
                } else {
                    // If no stored content, just clear
                    el.innerHTML = '';
                    el.removeAttribute('data-typewriter-animating');
                    el.removeAttribute('data-typewriter-id');
                }
            });
            
            // Re-initialize typewriter effects
            if (typeof initializeTypewriterEffects === 'function') {
                initializeTypewriterEffects(element);
            } else if (window.initializeTypewriterEffects) {
                window.initializeTypewriterEffects(element);
            }
        },
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        // ============================================
        // UTILITIES
        // ============================================
        
        showNotification(message, type = 'info') {
            this.notification = { show: true, message, type };
            setTimeout(() => {
                this.notification.show = false;
            }, 3000);
        },
        
        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        }
    };
};

