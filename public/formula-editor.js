/**
 * Formula Editor - Alpine.js Component
 * 
 * Manages global formula configurations from harvest_formula_config table.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';

// Formula application mapping based on canonical spec
const FORMULA_APPLICATIONS = {
    // Harvest formulas
    'cycle_time_reduction': ['Harvest', 'NPC Cycle'],
    'hit_rate': ['Harvest'],
    'harvestable_time_increase': ['Harvest'],
    'vitalis_drain_reduction': ['Harvest'],
    'cooldown_time_reduction': ['Harvest'],
    
    // Attunement formulas
    'attunement_cooldown_reduction': ['Attunement'],
    'attunement_restore_bonus': ['Attunement'],
    'attunement_delay_reduction': ['Attunement'],
    
    // Pulse Echo formulas
    'pulse_echo_yield_multiplier': ['Pulse Echo'],
    'pulse_echo_resonance_bonus_rate': ['Pulse Echo'],
    'pulse_echo_tier_curve_multiplier': ['Pulse Echo'],
    'pulse_echo_base_cost': ['Pulse Echo'],
    'pulse_echo_minimum_required': ['Pulse Echo'],
    
    // Factory formulas (if any)
    'factory_success_rate': ['Factory'],
    'factory_crit_chance': ['Factory'],
    
    // Other
    'room_update_interval_ms': ['NPC Cycle']
};

// Formula categories
const FORMULA_CATEGORIES = {
    'harvest': ['cycle_time_reduction', 'hit_rate', 'harvestable_time_increase', 'vitalis_drain_reduction', 'cooldown_time_reduction'],
    'attunement': ['attunement_cooldown_reduction', 'attunement_restore_bonus', 'attunement_delay_reduction'],
    'pulse_echo': ['pulse_echo_yield_multiplier', 'pulse_echo_resonance_bonus_rate', 'pulse_echo_tier_curve_multiplier', 'pulse_echo_base_cost', 'pulse_echo_minimum_required'],
    'factory': ['factory_success_rate', 'factory_crit_chance'],
    'other': ['room_update_interval_ms']
};

// Badge color mapping
const BADGE_COLORS = {
    'Harvest': 'blue',
    'Attunement': 'cyan',
    'Pulse Echo': 'yellow',
    'Factory': 'orange',
    'NPC Cycle': 'green'
};

// Make formulaEditor available globally for Alpine.js
window.formulaEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        formulas: [],
        filteredFormulas: [],
        selectedFormula: null,
        loading: false,
        
        // Filters
        filters: {
            search: '',
            category: 'all'
        },
        
        // Form data
        formData: {
            config_key: '',
            description: '',
            min_resonance: 5,
            min_value: 0.05,
            max_resonance: 100,
            max_value: 1.0,
            curve_exponent: 2.0
        },
        
        // Simulation
        simulation: {
            statValue: 50,
            result: 0,
            levels: []
        },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[FormulaEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[FormulaEditor] EditorBase ready, loading formulas...');
                    this.loadFormulas();
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
            console.log('[FormulaEditor] Message:', data.type, data);
            
            switch (data.type) {
                case 'formulaList':
                    console.log('[FormulaEditor] Received formulas:', data.formulas?.length || 0);
                    this.formulas = (data.formulas || []).map(f => ({
                        ...f,
                        min_resonance: parseFloat(f.min_resonance) || 5,
                        min_value: parseFloat(f.min_value) || 0.05,
                        max_resonance: parseFloat(f.max_resonance) || 100,
                        max_value: parseFloat(f.max_value) || 1.0,
                        curve_exponent: parseFloat(f.curve_exponent) || 2.0
                    }));
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case 'formulaUpdated':
                    if (data.formula) {
                        const formula = {
                            ...data.formula,
                            min_resonance: parseFloat(data.formula.min_resonance) || 5,
                            min_value: parseFloat(data.formula.min_value) || 0.05,
                            max_resonance: parseFloat(data.formula.max_resonance) || 100,
                            max_value: parseFloat(data.formula.max_value) || 1.0,
                            curve_exponent: parseFloat(data.formula.curve_exponent) || 2.0
                        };
                        const idx = this.formulas.findIndex(f => f.config_key === formula.config_key);
                        if (idx !== -1) {
                            this.formulas[idx] = formula;
                        }
                        if (this.selectedFormula && this.selectedFormula.config_key === formula.config_key) {
                            this.selectedFormula = formula;
                            this.populateForm(formula);
                        }
                        this.applyFilter();
                        this.showNotification('Formula updated', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'error':
                    this.showNotification(data.message || 'An error occurred', 'error');
                    this.loading = false;
                    break;
            }
        },

        // ============================================
        // DATA LOADING
        // ============================================
        
        loadFormulas() {
            this.loading = true;
            EditorBase.send({ type: 'getAllFormulas' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.formulas];
            
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(formula => 
                    formula.config_key.toLowerCase().includes(search) ||
                    (formula.description && formula.description.toLowerCase().includes(search))
                );
            }
            
            if (this.filters.category !== 'all') {
                const categoryKeys = FORMULA_CATEGORIES[this.filters.category] || [];
                filtered = filtered.filter(formula => 
                    categoryKeys.includes(formula.config_key)
                );
            }
            
            this.filteredFormulas = filtered;
        },

        // ============================================
        // SELECTION
        // ============================================
        
        selectFormula(formula) {
            this.selectedFormula = formula;
            this.populateForm(formula);
            this.updateSimulation();
        },
        
        populateForm(formula) {
            this.formData = {
                config_key: formula.config_key,
                description: formula.description || '',
                min_resonance: parseFloat(formula.min_resonance) || 5,
                min_value: parseFloat(formula.min_value) || 0.05,
                max_resonance: parseFloat(formula.max_resonance) || 100,
                max_value: parseFloat(formula.max_value) || 1.0,
                curve_exponent: parseFloat(formula.curve_exponent) || 2.0
            };
            this.updateSimulation();
        },
        
        resetForm() {
            if (this.selectedFormula) {
                this.populateForm(this.selectedFormula);
                this.updateSimulation();
            }
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        saveFormula() {
            if (!this.selectedFormula) {
                this.showNotification('No formula selected', 'error');
                return;
            }
            
            // Validate form data
            if (this.formData.min_resonance >= this.formData.max_resonance) {
                this.showNotification('Min stat value must be less than max stat value', 'error');
                return;
            }
            
            if (this.formData.min_value > this.formData.max_value) {
                this.showNotification('Min value should not exceed max value', 'error');
                return;
            }
            
            this.loading = true;
            
            const formulaData = {
                config_key: this.selectedFormula.config_key,
                description: this.formData.description,
                min_resonance: parseInt(this.formData.min_resonance),
                min_value: parseFloat(this.formData.min_value),
                max_resonance: parseInt(this.formData.max_resonance),
                max_value: parseFloat(this.formData.max_value),
                curve_exponent: parseFloat(this.formData.curve_exponent)
            };
            
            EditorBase.send({ 
                type: 'updateFormula', 
                formula: formulaData 
            });
        },

        // ============================================
        // SIMULATION
        // ============================================
        
        updateSimulation() {
            if (!this.selectedFormula) return;
            
            // Calculate result for current stat value
            const result = this.calculateFormula(
                this.simulation.statValue,
                this.formData
            );
            this.simulation.result = result;
            
            // Calculate preview at different stat levels
            const levels = [5, 25, 50, 75, 100].map(stat => ({
                stat,
                result: this.calculateFormula(stat, this.formData)
            }));
            this.simulation.levels = levels;
        },
        
        calculateFormula(statValue, config) {
            const { min_resonance, min_value, max_resonance, max_value, curve_exponent } = config;
            
            // Clamp stat to valid range
            const clampedStat = Math.max(min_resonance, Math.min(max_resonance, statValue));
            
            // Calculate normalized position (0 to 1)
            const range = max_resonance - min_resonance;
            if (range <= 0) return parseFloat(min_value);
            
            const normalized = (clampedStat - min_resonance) / range;
            
            // Apply exponential curve
            const curvedNormalized = Math.pow(normalized, parseFloat(curve_exponent));
            
            // Calculate final value
            const minVal = parseFloat(min_value);
            const maxVal = parseFloat(max_value);
            const value = minVal + (maxVal - minVal) * curvedNormalized;
            
            return value;
        },

        // ============================================
        // UTILITIES
        // ============================================
        
        getFormulaBadges(configKey) {
            return FORMULA_APPLICATIONS[configKey] || ['Other'];
        },
        
        getBadgeClass(badge) {
            return BADGE_COLORS[badge] || 'gray';
        },
        
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

