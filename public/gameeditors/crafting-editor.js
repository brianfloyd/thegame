/**
 * Crafting Recipe Editor - Alpine.js Component
 * 
 * Uses Alpine.js for state management with the unified editor architecture.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';

// Make craftingEditor available globally for Alpine.js
window.craftingEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        // Data
        recipes: [],
        filteredRecipes: [],
        allItems: [],
        selectedRecipe: null,
        isCreating: false,
        loading: false,
        
        // Filters
        filters: {
            search: '',
            tier: '',
            activeOnly: false
        },
        
        // New item forms
        newIngredient: {
            item_id: '',
            quantity: 1
        },
        newOutputItem: {
            item_id: '',
            quantity: 1
        },
        newByproduct: {
            item_id: '',
            quantity: 1,
            chance: 0.1
        },
        
        // Form data
        formData: {
            name: '',
            description: '',
            active: true,
            factory_tier_required: 1,
            crafting_time_ms: 5000,
            success_rate: 70.0,
            return_rate_on_fail: 0.5,
            allow_rune_substitution: false,
            allow_wildcard_runes: false,
            required_ingredients: [],
            required_runes: [],
            output_items: [],
            byproducts: [],
            required_stats: {}
        },
        
        // Preview test values
        testStats: {
            ingenuity: 10,
            resonance: 10,
            acumen: 10
        },
        
        // Preview results
        preview: {
            successRate: 0,
            critChance: 0,
            craftTime: 0,
            craftTimeWithSpeed: 0,
            efficiencyModifier: 0,
            totalOutput: 0,
            critOutput: 0
        },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        // Rune type options
        RUNE_TYPES: [
            { value: 'SPEED', label: 'SPEED' },
            { value: 'EFFICIENCY', label: 'EFFICIENCY' }
        ],

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[CraftingEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[CraftingEditor] EditorBase ready, loading data...');
                    this.loadData();
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
            console.log('[CraftingEditor] Message:', data.type);
            
            switch (data.type) {
                case 'factoryRecipes':
                    this.recipes = data.recipes || [];
                    this.applyFilter();
                    this.loading = false;
                    // If items are already loaded and a recipe is selected, ensure conversion happens
                    if (this.allItems.length > 0 && this.selectedRecipe) {
                        this.populateForm(this.selectedRecipe);
                    }
                    break;
                    
                case 'factoryRecipeCreated':
                    if (data.recipe) {
                        this.recipes.push(data.recipe);
                        this.applyFilter();
                        this.selectRecipe(data.recipe);
                        this.showNotification('Recipe created successfully', 'success');
                    }
                    this.loading = false;
                    this.isCreating = false;
                    break;
                    
                case 'factoryRecipeUpdated':
                    if (data.recipe) {
                        const idx = this.recipes.findIndex(r => r.recipe_id === data.recipe.recipe_id);
                        if (idx !== -1) {
                            this.recipes[idx] = data.recipe;
                        }
                        this.applyFilter();
                        if (this.selectedRecipe && this.selectedRecipe.recipe_id === data.recipe.recipe_id) {
                            this.selectedRecipe = data.recipe;
                            this.populateForm(data.recipe);
                        }
                        this.showNotification('Recipe updated', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'factoryRecipeDeleted':
                    if (data.recipe_id) {
                        this.recipes = this.recipes.filter(r => r.recipe_id !== data.recipe_id);
                        this.applyFilter();
                        if (this.selectedRecipe && this.selectedRecipe.recipe_id === data.recipe_id) {
                            this.selectedRecipe = null;
                            this.resetForm();
                        }
                        this.showNotification('Recipe deleted', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'itemList':
                    this.allItems = data.items || [];
                    // If a recipe is selected, re-populate form to convert item_name to item_id
                    if (this.selectedRecipe) {
                        this.populateForm(this.selectedRecipe);
                    }
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
        
        loadData() {
            this.loading = true;
            EditorBase.send({ type: 'getFactoryRecipes' });
            EditorBase.send({ type: 'getAllItems' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.recipes];
            
            // Search filter
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(r => 
                    r.name.toLowerCase().includes(search) ||
                    (r.description && r.description.toLowerCase().includes(search))
                );
            }
            
            // Tier filter
            if (this.filters.tier) {
                filtered = filtered.filter(r => r.factory_tier_required === parseInt(this.filters.tier));
            }
            
            // Active only filter
            if (this.filters.activeOnly) {
                filtered = filtered.filter(r => r.active);
            }
            
            this.filteredRecipes = filtered;
        },

        // ============================================
        // RECIPE SELECTION
        // ============================================
        
        selectRecipe(recipe) {
            this.selectedRecipe = recipe;
            this.isCreating = false;
            this.populateForm(recipe);
            this.updatePreview();
            // If items are loaded, ensure conversion happens
            if (this.allItems.length > 0) {
                // Re-populate to ensure item_name -> item_id conversion
                this.populateForm(recipe);
            }
        },
        
        populateForm(recipe) {
            // Convert item_name to item_id for ingredients, outputs, and byproducts
            const convertItemNameToId = (items) => {
                if (!Array.isArray(items)) return [];
                return items.map(item => {
                    // If it already has item_id, clean up and return
                    if (item.item_id) {
                        const { item_name, ...cleanItem } = item; // Remove item_name if present
                        return { ...cleanItem, item_id: Number(cleanItem.item_id) }; // Ensure it's a number
                    }
                    // If it has item_name, look up the item_id
                    if (item.item_name) {
                        const foundItem = this.allItems.find(i => 
                            i.name === item.item_name || 
                            i.name.toLowerCase() === item.item_name.toLowerCase()
                        );
                        if (foundItem) {
                            // Convert to item_id and remove item_name
                            const { item_name, ...rest } = item;
                            return { ...rest, item_id: Number(foundItem.id), quantity: rest.quantity || 1 };
                        }
                        // If item not found, keep item_name for now (will convert when items load)
                        console.warn(`[CraftingEditor] Item not found: ${item.item_name}`, {
                            availableItems: this.allItems.map(i => i.name),
                            allItemsCount: this.allItems.length
                        });
                    }
                    // Fallback: return as-is (might be empty/new item)
                    return item;
                });
            };

            this.formData = {
                name: recipe.name || '',
                description: recipe.description || '',
                active: recipe.active ?? true,
                factory_tier_required: recipe.factory_tier_required || 1,
                crafting_time_ms: recipe.crafting_time_ms || 5000,
                success_rate: parseFloat(recipe.success_rate) || 70.0,
                return_rate_on_fail: parseFloat(recipe.return_rate_on_fail) || 0.5,
                allow_rune_substitution: recipe.allow_rune_substitution || false,
                allow_wildcard_runes: recipe.allow_wildcard_runes || false,
                required_ingredients: convertItemNameToId(this.parseJson(recipe.required_ingredients, [])),
                required_runes: this.parseJson(recipe.required_runes, []),
                output_items: convertItemNameToId(this.parseJson(recipe.output_items, [])),
                byproducts: convertItemNameToId(this.parseJson(recipe.byproducts, [])),
                required_stats: this.parseJson(recipe.required_stats, {})
            };
            
            console.log('[CraftingEditor] Form populated:', {
                required_ingredients: this.formData.required_ingredients,
                allItemsCount: this.allItems.length
            });
        },
        
        resetForm() {
            this.formData = {
                name: '',
                description: '',
                active: true,
                factory_tier_required: 1,
                crafting_time_ms: 5000,
                success_rate: 70.0,
                return_rate_on_fail: 0.5,
                allow_rune_substitution: false,
                allow_wildcard_runes: false,
                required_ingredients: [],
                required_runes: [],
                output_items: [],
                byproducts: [],
                required_stats: {}
            };
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        createRecipe() {
            this.selectedRecipe = null;
            this.isCreating = true;
            this.resetForm();
        },
        
        cloneRecipe() {
            if (!this.selectedRecipe) return;
            this.isCreating = true;
            this.formData.name = this.selectedRecipe.name + ' (Copy)';
            this.selectedRecipe = null;
        },
        
        saveRecipe() {
            if (!this.formData.name.trim()) {
                this.showNotification('Recipe name is required', 'error');
                return;
            }
            
            // Validate required stats JSON
            let requiredStats = null;
            if (typeof this.formData.required_stats === 'string' && this.formData.required_stats.trim()) {
                try {
                    requiredStats = JSON.parse(this.formData.required_stats);
                } catch (e) {
                    this.showNotification('Invalid JSON in Required Stats field', 'error');
                    return;
                }
            } else if (typeof this.formData.required_stats === 'object') {
                requiredStats = Object.keys(this.formData.required_stats).length > 0 
                    ? this.formData.required_stats 
                    : null;
            }
            
            const recipe = {
                name: this.formData.name.trim(),
                description: this.formData.description.trim(),
                active: this.formData.active,
                factory_tier_required: parseInt(this.formData.factory_tier_required),
                crafting_time_ms: parseInt(this.formData.crafting_time_ms),
                success_rate: parseFloat(this.formData.success_rate),
                return_rate_on_fail: parseFloat(this.formData.return_rate_on_fail),
                allow_rune_substitution: this.formData.allow_rune_substitution,
                allow_wildcard_runes: this.formData.allow_wildcard_runes,
                required_ingredients: this.formData.required_ingredients.filter(i => i.item_id),
                required_runes: this.formData.required_runes.filter(r => r.type),
                output_items: this.formData.output_items.filter(o => o.item_id),
                byproducts: this.formData.byproducts.filter(b => b.item_id).length > 0 
                    ? this.formData.byproducts.filter(b => b.item_id) 
                    : null,
                required_stats: requiredStats
            };
            
            this.loading = true;
            
            if (this.isCreating || !this.selectedRecipe) {
                EditorBase.send({ type: 'createFactoryRecipe', recipe });
            } else {
                recipe.recipe_id = this.selectedRecipe.recipe_id;
                EditorBase.send({ type: 'updateFactoryRecipe', recipe });
            }
        },
        
        deleteRecipe() {
            if (!this.selectedRecipe) return;
            if (!confirm(`Delete recipe "${this.selectedRecipe.name}"? This cannot be undone.`)) return;
            
            this.loading = true;
            EditorBase.send({ 
                type: 'deleteFactoryRecipe', 
                recipe_id: this.selectedRecipe.recipe_id 
            });
        },

        // ============================================
        // INGREDIENT/RUNE/OUTPUT MANAGEMENT
        // ============================================
        
        addIngredient() {
            if (!this.newIngredient.item_id) {
                this.showNotification('Please select an item', 'error');
                return;
            }
            
            // Check if item already exists
            const existingIndex = this.formData.required_ingredients.findIndex(
                item => item.item_id == this.newIngredient.item_id
            );
            
            if (existingIndex !== -1) {
                // Add to existing quantity
                this.formData.required_ingredients[existingIndex].quantity += parseInt(this.newIngredient.quantity) || 1;
            } else {
                // Add new ingredient
                this.formData.required_ingredients.push({
                    item_id: Number(this.newIngredient.item_id),
                    quantity: parseInt(this.newIngredient.quantity) || 1
                });
            }
            
            // Reset form
            this.newIngredient = { item_id: '', quantity: 1 };
        },
        
        removeIngredient(index) {
            this.formData.required_ingredients.splice(index, 1);
        },
        
        addRune() {
            this.formData.required_runes.push({ type: '' });
        },
        
        removeRune(index) {
            this.formData.required_runes.splice(index, 1);
        },
        
        addOutput() {
            if (!this.newOutputItem.item_id) {
                this.showNotification('Please select an item', 'error');
                return;
            }
            
            // Check if item already exists
            const existingIndex = this.formData.output_items.findIndex(
                item => item.item_id == this.newOutputItem.item_id
            );
            
            if (existingIndex !== -1) {
                // Add to existing quantity
                this.formData.output_items[existingIndex].quantity += parseInt(this.newOutputItem.quantity) || 1;
            } else {
                // Add new output item
                this.formData.output_items.push({
                    item_id: Number(this.newOutputItem.item_id),
                    quantity: parseInt(this.newOutputItem.quantity) || 1
                });
            }
            
            // Reset form
            this.newOutputItem = { item_id: '', quantity: 1 };
            this.updatePreview();
        },
        
        removeOutput(index) {
            this.formData.output_items.splice(index, 1);
            this.updatePreview();
        },
        
        addByproduct() {
            if (!this.newByproduct.item_id) {
                this.showNotification('Please select an item', 'error');
                return;
            }
            
            // Check if item already exists
            const existingIndex = this.formData.byproducts.findIndex(
                item => item.item_id == this.newByproduct.item_id
            );
            
            if (existingIndex !== -1) {
                // Update existing byproduct
                this.formData.byproducts[existingIndex].quantity += parseInt(this.newByproduct.quantity) || 1;
            } else {
                // Add new byproduct
                this.formData.byproducts.push({
                    item_id: Number(this.newByproduct.item_id),
                    quantity: parseInt(this.newByproduct.quantity) || 1,
                    chance: parseFloat(this.newByproduct.chance) || 0.1
                });
            }
            
            // Reset form
            this.newByproduct = { item_id: '', quantity: 1, chance: 0.1 };
        },
        
        removeByproduct(index) {
            this.formData.byproducts.splice(index, 1);
        },

        // ============================================
        // LIVE PREVIEW
        // ============================================
        
        updatePreview() {
            const config = {
                STAT_SCALES: { INGENUITY_SCALE: 0.5, RESONANCE_SCALE: 0.5, ACUMEN_SCALE: 0.3 },
                STAT_WEIGHTS: { INGENUITY_WEIGHT: 0.40, RESONANCE_WEIGHT: 0.40, ACUMEN_WEIGHT: 0.20 },
                CRIT: { BASE_CRIT_CHANCE: 5.0, RESONANCE_CRIT_SCALE: 0.02, ACUMEN_CRIT_SCALE: 0.015, MAX_CRIT_CHANCE: 25.0 },
                SUCCESS: { MAX_SUCCESS_RATE: 95.0, MIN_SUCCESS_RATE: 5.0 },
                RUNE_MODIFIERS: { 
                    SPEED_RUNE_SCALAR: 0.20, STAT_SPEED_SCALAR: 0.01, MAX_SPEED_REDUCTION: 0.70, 
                    EFFICIENCY_RUNE_SCALAR: 0.15, STAT_EFFICIENCY_SCALAR: 0.01, MAX_EFFICIENCY_REDUCTION: 0.50 
                }
            };
            
            const ingenuity = this.testStats.ingenuity;
            const resonance = this.testStats.resonance;
            const acumen = this.testStats.acumen;
            
            // Stat factor calculation
            const ingenuityContribution = (ingenuity * config.STAT_SCALES.INGENUITY_SCALE) * config.STAT_WEIGHTS.INGENUITY_WEIGHT;
            const resonanceContribution = (resonance * config.STAT_SCALES.RESONANCE_SCALE) * config.STAT_WEIGHTS.RESONANCE_WEIGHT;
            const acumenContribution = (acumen * config.STAT_SCALES.ACUMEN_SCALE) * config.STAT_WEIGHTS.ACUMEN_WEIGHT;
            const statFactor = ingenuityContribution + resonanceContribution + acumenContribution;
            
            // Success rate
            let successRate = this.formData.success_rate + statFactor;
            successRate = Math.max(config.SUCCESS.MIN_SUCCESS_RATE, Math.min(config.SUCCESS.MAX_SUCCESS_RATE, successRate));
            
            // Crit chance
            const baseCrit = config.CRIT.BASE_CRIT_CHANCE;
            let critChance = baseCrit + (resonance * config.CRIT.RESONANCE_CRIT_SCALE) + (acumen * config.CRIT.ACUMEN_CRIT_SCALE);
            critChance = Math.min(config.CRIT.MAX_CRIT_CHANCE, Math.max(0, critChance));
            
            // Speed modifier
            const speedReduction = Math.min(
                config.RUNE_MODIFIERS.MAX_SPEED_REDUCTION,
                config.RUNE_MODIFIERS.SPEED_RUNE_SCALAR + (resonance * config.RUNE_MODIFIERS.STAT_SPEED_SCALAR)
            );
            const craftTimeWithSpeed = Math.max(1000, Math.floor(this.formData.crafting_time_ms * (1 - speedReduction)));
            
            // Efficiency modifier
            const efficiencyReduction = Math.min(
                config.RUNE_MODIFIERS.MAX_EFFICIENCY_REDUCTION,
                config.RUNE_MODIFIERS.EFFICIENCY_RUNE_SCALAR + (ingenuity * config.RUNE_MODIFIERS.STAT_EFFICIENCY_SCALAR)
            );
            
            // Output calculation
            let totalOutput = 0;
            this.formData.output_items.forEach(o => {
                totalOutput += parseInt(o.quantity) || 1;
            });
            const critOutput = Math.floor(totalOutput * 1.5);
            
            this.preview = {
                successRate: successRate.toFixed(1),
                statBonus: statFactor.toFixed(1),
                critChance: critChance.toFixed(1),
                craftTime: (this.formData.crafting_time_ms / 1000).toFixed(1),
                craftTimeWithSpeed: (craftTimeWithSpeed / 1000).toFixed(1),
                efficiencyModifier: ((1 - efficiencyReduction) * 100).toFixed(0),
                totalOutput,
                critOutput
            };
        },

        // ============================================
        // UTILITIES
        // ============================================
        
        parseJson(value, defaultValue) {
            if (!value) return defaultValue;
            if (typeof value === 'object') return value;
            try {
                return JSON.parse(value);
            } catch (e) {
                return defaultValue;
            }
        },
        
        getItemName(itemId) {
            if (!itemId) return 'Unknown';
            const item = this.allItems.find(i => i.id == itemId);
            return item ? item.name : 'Unknown';
        },
        
        getItemNameFromIngredient(ingredient) {
            // Handle both item_id and item_name (for backward compatibility)
            if (ingredient.item_id) {
                return this.getItemName(ingredient.item_id);
            } else if (ingredient.item_name) {
                return ingredient.item_name;
            }
            return 'Unknown';
        },
        
        getIngredientItems() {
            return this.allItems.filter(i => i.item_type === 'ingredient' || i.item_type === 'material');
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
        },
        
        canSave() {
            return this.formData.name.trim().length > 0;
        }
    };
};
