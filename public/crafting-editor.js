/**
 * Crafting Recipe Editor - Refactored with Unified Editor Components
 * 
 * Uses the new standardized editor layout:
 * - ListSidebar for recipe list + search + actions
 * - SectionBox for grouped fields
 * - FieldGrid for multi-column layouts
 * - ToggleSwitch for boolean fields
 * - JSONGridEditor for ingredients, outputs, byproducts
 */

import { 
    SectionBox, 
    FieldGrid, 
    ToggleSwitch, 
    ListSidebar, 
    JSONGridEditor 
} from './js/editorComponents/index.js';

// WebSocket connection
let ws = null;
const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host;

// Editor State
let allRecipes = [];
let allItems = [];
let selectedRecipeId = null;
let sidebarEl = null;
let isNavigatingAway = false;

// ============================================
// NOTIFICATION SYSTEM
// ============================================
function showNotification(message, type = 'info') {
    const existing = document.getElementById('editorNotification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'editorNotification';
    notification.className = 'editor-notification' + (type === 'error' ? ' editor-notification--error' : '');
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) notification.remove();
    }, 5000);
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================
function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        // Authenticate with session
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'authenticateSession' }));
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (!isNavigatingAway) {
            setTimeout(connectWebSocket, 3000);
        }
    };
}

// ============================================
// MESSAGE HANDLERS
// ============================================
function handleMessage(data) {
    switch (data.type) {
        case 'factoryRecipes':
            allRecipes = data.recipes || [];
            updateSidebar();
            if (selectedRecipeId) {
                const recipe = allRecipes.find(r => r.recipe_id === selectedRecipeId);
                if (recipe) showRecipeForm(recipe);
            }
            break;
            
        case 'factoryRecipe':
            const idx = allRecipes.findIndex(r => r.recipe_id === data.recipe.recipe_id);
            if (idx !== -1) {
                allRecipes[idx] = data.recipe;
            } else {
                allRecipes.push(data.recipe);
            }
            updateSidebar();
            showRecipeForm(data.recipe);
            break;
            
        case 'factoryRecipeCreated':
            allRecipes.push(data.recipe);
            updateSidebar();
            selectRecipe(data.recipe.recipe_id);
            showNotification(`Recipe "${data.recipe.name}" created successfully!`);
            break;
            
        case 'factoryRecipeUpdated':
            const updateIdx = allRecipes.findIndex(r => r.recipe_id === data.recipe.recipe_id);
            if (updateIdx !== -1) {
                allRecipes[updateIdx] = data.recipe;
            }
            updateSidebar();
            showRecipeForm(data.recipe);
            showNotification(`Recipe "${data.recipe.name}" saved successfully!`);
            break;
            
        case 'factoryRecipeDeleted':
            allRecipes = allRecipes.filter(r => r.recipe_id !== data.recipe_id);
            updateSidebar();
            if (selectedRecipeId === data.recipe_id) {
                selectedRecipeId = null;
                showEmptyState();
            }
            showNotification('Recipe deleted');
            break;
            
        case 'itemList':
            allItems = data.items || [];
            if (selectedRecipeId) {
                const recipe = allRecipes.find(r => r.recipe_id === selectedRecipeId);
                if (recipe) showRecipeForm(recipe);
            }
            break;
            
        case 'error':
            showNotification(data.message, 'error');
            break;
    }
}

// ============================================
// SIDEBAR MANAGEMENT
// ============================================
function initSidebar() {
    const container = document.getElementById('recipeSidebar');
    
    sidebarEl = ListSidebar.create({
        title: 'Recipes',
        searchPlaceholder: 'Search recipes...',
        items: allRecipes,
        renderItem: (recipe) => ({
            name: recipe.name,
            meta: `ID: ${recipe.recipe_id} | Tier: ${recipe.factory_tier_required}`,
            inactive: !recipe.active
        }),
        getItemId: (recipe) => recipe.recipe_id,
        onSelect: (recipe) => selectRecipe(recipe.recipe_id),
        onCreate: () => createNewRecipe(),
        onClone: () => cloneRecipe(),
        onDelete: () => deleteRecipe()
    });
    
    container.appendChild(sidebarEl);
}

function updateSidebar() {
    if (sidebarEl) {
        ListSidebar.setItems(sidebarEl, allRecipes);
        ListSidebar.setSelected(sidebarEl, selectedRecipeId);
    }
}

function selectRecipe(recipeId) {
    selectedRecipeId = recipeId;
    ListSidebar.setSelected(sidebarEl, recipeId);
    
    const recipe = allRecipes.find(r => r.recipe_id === recipeId);
    if (recipe) {
        showRecipeForm(recipe);
    }
}

// ============================================
// EMPTY STATE
// ============================================
function showEmptyState() {
    const container = document.getElementById('craftingEditorForm');
    container.innerHTML = '<p class="editor-hint">Select a recipe to edit or click "New" to create one.</p>';
}

// ============================================
// RECIPE FORM
// ============================================
function showRecipeForm(recipe = null) {
    const container = document.getElementById('craftingEditorForm');
    const isNew = !recipe || !recipe.recipe_id;
    
    // Parse JSON fields
    const requiredIngredients = parseJSON(recipe?.required_ingredients, []);
    const requiredRunes = parseJSON(recipe?.required_runes, []);
    const outputItems = parseJSON(recipe?.output_items, []);
    const byproducts = parseJSON(recipe?.byproducts, []);
    const requiredStats = parseJSON(recipe?.required_stats, {});
    
    container.innerHTML = '';
    
    // Form Title
    const title = document.createElement('h3');
    title.className = 'editor-form-title';
    title.textContent = isNew ? 'Create New Recipe' : 'Edit Recipe';
    container.appendChild(title);
    
    // ========== CORE FIELDS SECTION ==========
    const coreSection = SectionBox.create({ title: 'Core Details' });
    const coreContent = SectionBox.getContent(coreSection);
    
    // Row 1: Name (full width)
    const nameGrid = FieldGrid.create({ columns: 2 });
    nameGrid.appendChild(FieldGrid.field({
        label: 'Recipe Name',
        required: true,
        input: FieldGrid.input({ id: 'recipeName', value: recipe?.name || '', placeholder: 'Enter recipe name' }),
        fullWidth: true
    }));
    coreContent.appendChild(nameGrid);
    
    // Row 2: 3-column grid
    const row2Grid = FieldGrid.create({ columns: 3 });
    
    row2Grid.appendChild(FieldGrid.field({
        label: 'Factory Tier',
        input: FieldGrid.input({ id: 'recipeTier', type: 'number', value: recipe?.factory_tier_required || 1, min: 1, max: 5 })
    }));
    
    row2Grid.appendChild(FieldGrid.field({
        label: 'Craft Time (ms)',
        input: FieldGrid.input({ id: 'recipeCraftTime', type: 'number', value: recipe?.crafting_time_ms || 5000, min: 1000, step: 100 })
    }));
    
    // Active toggle
    const activeToggle = ToggleSwitch.create({
        id: 'recipeActive',
        label: 'Active',
        checked: recipe ? recipe.active : true
    });
    const activeGroup = document.createElement('div');
    activeGroup.className = 'field-group';
    const activeLabel = document.createElement('label');
    activeLabel.className = 'field-label';
    activeLabel.textContent = 'Status';
    activeGroup.appendChild(activeLabel);
    activeGroup.appendChild(activeToggle);
    row2Grid.appendChild(activeGroup);
    
    coreContent.appendChild(row2Grid);
    
    // Row 3: 2-column grid
    const row3Grid = FieldGrid.create({ columns: 2 });
    
    row3Grid.appendChild(FieldGrid.field({
        label: 'Base Success Rate (%)',
        input: FieldGrid.input({ id: 'recipeSuccessRate', type: 'number', value: parseFloat(recipe?.success_rate || 70).toFixed(1), min: 0, max: 100, step: 0.1 })
    }));
    
    row3Grid.appendChild(FieldGrid.field({
        label: 'Return Rate on Fail (0-1)',
        input: FieldGrid.input({ id: 'recipeReturnRate', type: 'number', value: parseFloat(recipe?.return_rate_on_fail || 0.5).toFixed(2), min: 0, max: 1, step: 0.01 })
    }));
    
    coreContent.appendChild(row3Grid);
    
    // Description (full width)
    const descGrid = FieldGrid.create({ columns: 2 });
    descGrid.appendChild(FieldGrid.field({
        label: 'Description',
        input: FieldGrid.textarea({ id: 'recipeDescription', value: recipe?.description || '', placeholder: 'Recipe description', rows: 2 }),
        fullWidth: true
    }));
    coreContent.appendChild(descGrid);
    
    container.appendChild(coreSection);
    
    // ========== INGREDIENTS SECTION ==========
    const ingredientsSection = SectionBox.create({ title: 'Required Ingredients' });
    const ingredientsContent = SectionBox.getContent(ingredientsSection);
    
    const ingredientItems = allItems.filter(i => i.item_type === 'ingredient');
    const ingredientOptions = ingredientItems.map(i => ({ value: i.id, label: i.name }));
    
    const ingredientsGrid = JSONGridEditor.create({
        fields: [
            { key: 'item_id', type: 'select', options: ingredientOptions, placeholder: 'Select item...', flex: '1' },
            { key: 'quantity', type: 'number', min: 1, default: 1, flex: '0 0 80px' }
        ],
        data: requiredIngredients.map(ing => ({
            item_id: ing.item_id || (allItems.find(i => i.name === ing.item_name)?.id || ''),
            quantity: ing.quantity || 1
        })),
        emptyText: 'No ingredients added',
        addText: '+ Add Ingredient'
    });
    ingredientsGrid.id = 'ingredientsList';
    ingredientsContent.appendChild(ingredientsGrid);
    container.appendChild(ingredientsSection);
    
    // ========== RUNES SECTION ==========
    const runesSection = SectionBox.create({ title: 'Required Runes (PRODUCTION excluded)' });
    const runesContent = SectionBox.getContent(runesSection);
    
    const runeOptions = [
        { value: 'SPEED', label: 'SPEED' },
        { value: 'EFFICIENCY', label: 'EFFICIENCY' }
    ];
    
    const runesGrid = JSONGridEditor.create({
        fields: [
            { key: 'type', type: 'select', options: runeOptions, placeholder: 'Select rune type...', flex: '1' }
        ],
        data: requiredRunes.map(r => ({ type: typeof r === 'string' ? r : r.type })),
        emptyText: 'No runes required (PRODUCTION is machine requirement)',
        addText: '+ Add Rune'
    });
    runesGrid.id = 'runesList';
    runesContent.appendChild(runesGrid);
    
    // Rune toggles
    const runeTogglesGrid = FieldGrid.create({ columns: 2 });
    
    const subToggle = ToggleSwitch.create({
        id: 'allowRuneSubstitution',
        label: 'Allow Rune Substitution',
        checked: recipe?.allow_rune_substitution || false,
        small: true
    });
    const subGroup = document.createElement('div');
    subGroup.className = 'field-group';
    subGroup.appendChild(subToggle);
    runeTogglesGrid.appendChild(subGroup);
    
    const wildToggle = ToggleSwitch.create({
        id: 'allowWildcardRunes',
        label: 'Allow Wildcard Runes',
        checked: recipe?.allow_wildcard_runes || false,
        small: true
    });
    const wildGroup = document.createElement('div');
    wildGroup.className = 'field-group';
    wildGroup.appendChild(wildToggle);
    runeTogglesGrid.appendChild(wildGroup);
    
    runesContent.appendChild(runeTogglesGrid);
    container.appendChild(runesSection);
    
    // ========== OUTPUT ITEMS SECTION ==========
    const outputSection = SectionBox.create({ title: 'Output Items' });
    const outputContent = SectionBox.getContent(outputSection);
    
    const outputOptions = allItems.map(i => ({ value: i.id, label: i.name }));
    
    const outputGrid = JSONGridEditor.create({
        fields: [
            { key: 'item_id', type: 'select', options: outputOptions, placeholder: 'Select item...', flex: '1' },
            { key: 'quantity', type: 'number', min: 1, default: 1, flex: '0 0 80px' }
        ],
        data: outputItems.map(out => ({
            item_id: out.item_id || (allItems.find(i => i.name === out.item_name)?.id || ''),
            quantity: out.quantity || 1
        })),
        emptyText: 'No output items added',
        addText: '+ Add Output Item'
    });
    outputGrid.id = 'outputItemsList';
    outputContent.appendChild(outputGrid);
    container.appendChild(outputSection);
    
    // ========== BYPRODUCTS SECTION ==========
    const byproductsSection = SectionBox.create({ title: 'Byproducts (Optional)', collapsible: true, collapsed: byproducts.length === 0 });
    const byproductsContent = SectionBox.getContent(byproductsSection);
    
    const byproductsGrid = JSONGridEditor.create({
        fields: [
            { key: 'item_id', type: 'select', options: outputOptions, placeholder: 'Select item...', flex: '1' },
            { key: 'quantity', type: 'number', min: 1, default: 1, flex: '0 0 60px' },
            { key: 'chance', type: 'number', min: 0, max: 1, step: 0.01, default: 0.1, flex: '0 0 80px' }
        ],
        data: byproducts.map(bp => ({
            item_id: bp.item_id || (allItems.find(i => i.name === bp.item_name)?.id || ''),
            quantity: bp.quantity || 1,
            chance: bp.chance || 0.1
        })),
        emptyText: 'No byproducts added',
        addText: '+ Add Byproduct'
    });
    byproductsGrid.id = 'byproductsList';
    byproductsContent.appendChild(byproductsGrid);
    container.appendChild(byproductsSection);
    
    // ========== REQUIRED STATS SECTION ==========
    const statsSection = SectionBox.create({ title: 'Required Stats (JSON)', collapsible: true, collapsed: Object.keys(requiredStats).length === 0 });
    const statsContent = SectionBox.getContent(statsSection);
    
    const statsTextarea = FieldGrid.textarea({
        id: 'requiredStats',
        value: Object.keys(requiredStats).length > 0 ? JSON.stringify(requiredStats, null, 2) : '',
        placeholder: '{"stat_ingenuity": 10, "stat_resonance": 5}',
        rows: 4
    });
    statsContent.appendChild(statsTextarea);
    container.appendChild(statsSection);
    
    // ========== LIVE PREVIEW SECTION ==========
    const previewSection = SectionBox.create({ title: 'Live Preview', collapsible: true });
    const previewContent = SectionBox.getContent(previewSection);
    previewContent.innerHTML = `
        <div class="preview-panel">
            <div id="livePreview" class="preview-panel-content">
                <p>Enter test stats below to see calculated values.</p>
            </div>
            <div class="field-grid field-grid--3col" style="margin-top: 12px;">
                <div class="field-group">
                    <label class="field-label">Test Ingenuity</label>
                    <input type="number" id="testIngenuity" value="10" min="0" class="editor-input">
                </div>
                <div class="field-group">
                    <label class="field-label">Test Resonance</label>
                    <input type="number" id="testResonance" value="10" min="0" class="editor-input">
                </div>
                <div class="field-group">
                    <label class="field-label">Test Acumen</label>
                    <input type="number" id="testAcumen" value="10" min="0" class="editor-input">
                </div>
            </div>
            <button type="button" id="updatePreviewBtn" class="editor-btn" style="margin-top: 12px; width: 100%;">Update Preview</button>
        </div>
    `;
    container.appendChild(previewSection);
    
    // ========== STICKY SAVE BAR ==========
    const saveBar = document.createElement('div');
    saveBar.className = 'editor-sticky-save';
    
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveRecipeBtn';
    saveBtn.className = 'editor-btn editor-btn--primary';
    saveBtn.textContent = isNew ? 'Create Recipe' : 'Save Recipe';
    saveBtn.addEventListener('click', () => saveRecipe(recipe?.recipe_id || null));
    saveBar.appendChild(saveBtn);
    
    if (!isNew) {
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'deleteRecipeBtn';
        deleteBtn.className = 'editor-btn editor-btn--danger';
        deleteBtn.textContent = 'Delete Recipe';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete recipe "${recipe.name}"? This cannot be undone.`)) {
                deleteRecipeById(recipe.recipe_id);
            }
        });
        saveBar.appendChild(deleteBtn);
    }
    
    container.appendChild(saveBar);
    
    // Setup preview
    setupPreviewListeners();
    updateLivePreview();
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function parseJSON(value, defaultValue) {
    if (!value) return defaultValue;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        return defaultValue;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// LIVE PREVIEW
// ============================================
function setupPreviewListeners() {
    ['testIngenuity', 'testResonance', 'testAcumen'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                clearTimeout(window.previewUpdateTimeout);
                window.previewUpdateTimeout = setTimeout(updateLivePreview, 500);
            });
        }
    });
    
    const updateBtn = document.getElementById('updatePreviewBtn');
    if (updateBtn) {
        updateBtn.addEventListener('click', updateLivePreview);
    }
}

function updateLivePreview() {
    const previewDiv = document.getElementById('livePreview');
    if (!previewDiv) return;
    
    const ingenuity = parseInt(document.getElementById('testIngenuity')?.value) || 10;
    const resonance = parseInt(document.getElementById('testResonance')?.value) || 10;
    const acumen = parseInt(document.getElementById('testAcumen')?.value) || 10;
    
    const baseSuccessRate = parseFloat(document.getElementById('recipeSuccessRate')?.value) || 70.0;
    const craftTimeMs = parseInt(document.getElementById('recipeCraftTime')?.value) || 5000;
    
    // Config values (matching factoryCraftingEngine)
    const config = {
        STAT_SCALES: { INGENUITY_SCALE: 0.5, RESONANCE_SCALE: 0.5, ACUMEN_SCALE: 0.3 },
        STAT_WEIGHTS: { INGENUITY_WEIGHT: 0.40, RESONANCE_WEIGHT: 0.40, ACUMEN_WEIGHT: 0.20 },
        CRIT: { BASE_CRIT_CHANCE: 5.0, RESONANCE_CRIT_SCALE: 0.02, ACUMEN_CRIT_SCALE: 0.015, MAX_CRIT_CHANCE: 25.0 },
        SUCCESS: { MAX_SUCCESS_RATE: 95.0, MIN_SUCCESS_RATE: 5.0 },
        RUNE_MODIFIERS: { SPEED_RUNE_SCALAR: 0.20, STAT_SPEED_SCALAR: 0.01, MAX_SPEED_REDUCTION: 0.70, EFFICIENCY_RUNE_SCALAR: 0.15, STAT_EFFICIENCY_SCALAR: 0.01, MAX_EFFICIENCY_REDUCTION: 0.50 }
    };
    
    // Calculate stat factor
    const ingenuityContribution = (ingenuity * config.STAT_SCALES.INGENUITY_SCALE) * config.STAT_WEIGHTS.INGENUITY_WEIGHT;
    const resonanceContribution = (resonance * config.STAT_SCALES.RESONANCE_SCALE) * config.STAT_WEIGHTS.RESONANCE_WEIGHT;
    const acumenContribution = (acumen * config.STAT_SCALES.ACUMEN_SCALE) * config.STAT_WEIGHTS.ACUMEN_WEIGHT;
    const statFactor = ingenuityContribution + resonanceContribution + acumenContribution;
    
    // Final success rate
    let finalSuccessRate = baseSuccessRate + statFactor;
    finalSuccessRate = Math.max(config.SUCCESS.MIN_SUCCESS_RATE, Math.min(config.SUCCESS.MAX_SUCCESS_RATE, finalSuccessRate));
    
    // Crit chance
    const baseCrit = config.CRIT.BASE_CRIT_CHANCE;
    const resonanceCritBonus = resonance * config.CRIT.RESONANCE_CRIT_SCALE;
    const acumenCritBonus = acumen * config.CRIT.ACUMEN_CRIT_SCALE;
    let critChance = baseCrit + resonanceCritBonus + acumenCritBonus;
    critChance = Math.min(config.CRIT.MAX_CRIT_CHANCE, Math.max(0, critChance));
    
    // Speed modifier (with rune)
    const speedRuneBonus = config.RUNE_MODIFIERS.SPEED_RUNE_SCALAR;
    const statSpeedBonus = resonance * config.RUNE_MODIFIERS.STAT_SPEED_SCALAR;
    let totalSpeedReduction = speedRuneBonus + statSpeedBonus;
    totalSpeedReduction = Math.min(config.RUNE_MODIFIERS.MAX_SPEED_REDUCTION, totalSpeedReduction);
    const speedModifier = 1 - totalSpeedReduction;
    const craftTimeWithSpeed = Math.max(1000, Math.floor(craftTimeMs * speedModifier));
    
    // Efficiency modifier (with rune)
    const efficiencyRuneBonus = config.RUNE_MODIFIERS.EFFICIENCY_RUNE_SCALAR;
    const statEfficiencyBonus = ingenuity * config.RUNE_MODIFIERS.STAT_EFFICIENCY_SCALAR;
    let totalEfficiencyReduction = efficiencyRuneBonus + statEfficiencyBonus;
    totalEfficiencyReduction = Math.min(config.RUNE_MODIFIERS.MAX_EFFICIENCY_REDUCTION, totalEfficiencyReduction);
    const efficiencyModifier = 1 - totalEfficiencyReduction;
    
    // Output quantities
    const outputGrid = document.getElementById('outputItemsList');
    let totalOutputQuantity = 0;
    if (outputGrid) {
        const data = JSONGridEditor.getData(outputGrid);
        data.forEach(row => {
            totalOutputQuantity += parseInt(row.quantity) || 1;
        });
    }
    const critOutputQuantity = Math.floor(totalOutputQuantity * 1.5);
    
    previewDiv.innerHTML = `
        <div style="line-height: 1.8;">
            <div><strong>Success Rate:</strong> ${finalSuccessRate.toFixed(1)}% (Base: ${baseSuccessRate.toFixed(1)}% + Stats: ${statFactor.toFixed(1)}%)</div>
            <div><strong>Crit Chance:</strong> ${critChance.toFixed(1)}%</div>
            <div><strong>Craft Time:</strong> ${(craftTimeMs / 1000).toFixed(1)}s → ${(craftTimeWithSpeed / 1000).toFixed(1)}s with Speed Rune</div>
            <div><strong>Efficiency:</strong> ${(efficiencyModifier * 100).toFixed(0)}% ingredient use with Efficiency Rune</div>
            <div><strong>Expected Output:</strong> ${totalOutputQuantity} items (${critOutputQuantity} on crit)</div>
        </div>
    `;
}

// ============================================
// CRUD OPERATIONS
// ============================================
function createNewRecipe() {
    selectedRecipeId = null;
    ListSidebar.setSelected(sidebarEl, null);
    showRecipeForm(null);
}

function cloneRecipe() {
    if (!selectedRecipeId) return;
    
    const recipe = allRecipes.find(r => r.recipe_id === selectedRecipeId);
    if (!recipe) return;
    
    const cloned = {
        ...recipe,
        name: recipe.name + ' (Copy)',
        recipe_id: undefined
    };
    
    selectedRecipeId = null;
    ListSidebar.setSelected(sidebarEl, null);
    showRecipeForm(cloned);
}

function deleteRecipe() {
    if (!selectedRecipeId) return;
    
    const recipe = allRecipes.find(r => r.recipe_id === selectedRecipeId);
    if (!recipe) return;
    
    if (confirm(`Delete recipe "${recipe.name}"? This cannot be undone.`)) {
        deleteRecipeById(recipe.recipe_id);
    }
}

function deleteRecipeById(recipeId) {
    if (!recipeId) return;
    ws.send(JSON.stringify({ type: 'deleteFactoryRecipe', recipe_id: recipeId }));
}

function saveRecipe(recipeId) {
    const name = document.getElementById('recipeName')?.value.trim();
    if (!name) {
        showNotification('Recipe name is required', 'error');
        return;
    }
    
    // Collect ingredients
    const ingredientsGrid = document.getElementById('ingredientsList');
    const ingredientsData = ingredientsGrid ? JSONGridEditor.getData(ingredientsGrid) : [];
    const ingredients = ingredientsData
        .filter(row => row.item_id)
        .map(row => {
            const item = allItems.find(i => i.id == row.item_id);
            return {
                item_id: parseInt(row.item_id),
                item_name: item?.name || '',
                quantity: parseInt(row.quantity) || 1
            };
        });
    
    // Collect runes
    const runesGrid = document.getElementById('runesList');
    const runesData = runesGrid ? JSONGridEditor.getData(runesGrid) : [];
    const runes = runesData
        .filter(row => row.type && row.type !== 'PRODUCTION')
        .map(row => row.type);
    
    // Collect outputs
    const outputGrid = document.getElementById('outputItemsList');
    const outputData = outputGrid ? JSONGridEditor.getData(outputGrid) : [];
    const outputs = outputData
        .filter(row => row.item_id)
        .map(row => {
            const item = allItems.find(i => i.id == row.item_id);
            return {
                item_id: parseInt(row.item_id),
                item_name: item?.name || '',
                quantity: parseInt(row.quantity) || 1
            };
        });
    
    // Collect byproducts
    const byproductsGrid = document.getElementById('byproductsList');
    const byproductsData = byproductsGrid ? JSONGridEditor.getData(byproductsGrid) : [];
    const byproducts = byproductsData
        .filter(row => row.item_id)
        .map(row => {
            const item = allItems.find(i => i.id == row.item_id);
            return {
                item_id: parseInt(row.item_id),
                item_name: item?.name || '',
                quantity: parseInt(row.quantity) || 1,
                chance: parseFloat(row.chance) || 0.1
            };
        });
    
    // Parse required stats
    let requiredStats = {};
    const statsText = document.getElementById('requiredStats')?.value.trim();
    if (statsText) {
        try {
            requiredStats = JSON.parse(statsText);
        } catch (e) {
            showNotification('Invalid JSON in Required Stats field', 'error');
            return;
        }
    }
    
    // Get toggle values
    const activeToggle = document.getElementById('recipeActive');
    const active = activeToggle ? ToggleSwitch.isChecked(activeToggle.closest('.toggle-switch')) : true;
    
    const subToggle = document.getElementById('allowRuneSubstitution');
    const allowRuneSubstitution = subToggle ? ToggleSwitch.isChecked(subToggle.closest('.toggle-switch')) : false;
    
    const wildToggle = document.getElementById('allowWildcardRunes');
    const allowWildcardRunes = wildToggle ? ToggleSwitch.isChecked(wildToggle.closest('.toggle-switch')) : false;
    
    const recipe = {
        name,
        description: document.getElementById('recipeDescription')?.value.trim() || '',
        active,
        factory_tier_required: parseInt(document.getElementById('recipeTier')?.value) || 1,
        crafting_time_ms: parseInt(document.getElementById('recipeCraftTime')?.value) || 5000,
        success_rate: parseFloat(document.getElementById('recipeSuccessRate')?.value) || 70.0,
        return_rate_on_fail: parseFloat(document.getElementById('recipeReturnRate')?.value) || 0.5,
        required_ingredients: ingredients,
        required_runes: runes,
        output_items: outputs,
        byproducts: byproducts.length > 0 ? byproducts : null,
        required_stats: Object.keys(requiredStats).length > 0 ? requiredStats : null,
        allow_rune_substitution: allowRuneSubstitution,
        allow_wildcard_runes: allowWildcardRunes
    };
    
    if (recipeId) {
        recipe.recipe_id = recipeId;
        ws.send(JSON.stringify({ type: 'updateFactoryRecipe', recipe }));
    } else {
        ws.send(JSON.stringify({ type: 'createFactoryRecipe', recipe }));
    }
}

// ============================================
// NAVIGATION
// ============================================
function closeCraftingEditor() {
    isNavigatingAway = true;
    window.location.href = '/game';
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Close button
    const closeBtn = document.getElementById('closeCraftingEditor');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCraftingEditor);
    }
    
    // Editor navigation
    document.querySelectorAll('.editor-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetEditor = btn.getAttribute('data-editor');
            isNavigatingAway = true;
            
            if (targetEditor === 'map-editor') {
                window.location.href = '/map';
            } else if (targetEditor === 'npc-editor') {
                window.location.href = '/npc';
            } else if (targetEditor === 'item-editor') {
                window.location.href = '/items';
            }
        });
    });
    
    // Initialize sidebar
    initSidebar();
    
    // Connect WebSocket
    connectWebSocket();
    
    // Request editor data after a short delay to allow authentication to complete
    // (Same pattern as map-editor.js uses)
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('[CraftingEditor] Requesting initial data after authentication delay...');
            ws.send(JSON.stringify({ type: 'getFactoryRecipes' }));
            ws.send(JSON.stringify({ type: 'getAllItems' }));
        }
    }, 500);
});
