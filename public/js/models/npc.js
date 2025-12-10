/**
 * NPC Model - Client-side ES6 Module
 * 
 * Canonical NPC model matching the actual scriptable_npcs table schema.
 * Based on migrations/001_schema.sql and subsequent migrations.
 */

/**
 * Valid NPC types (used in npc_type column)
 */
export const NPC_TYPES = [
    'harvestable',
    'merchant',
    'quest',
    'enemy',
    'friendly',
    'neutral'
];

/**
 * NPC type display labels
 */
export const NPC_TYPE_LABELS = {
    harvestable: '🌿 Harvestable',
    merchant: '🏪 Merchant',
    quest: '📜 Quest',
    enemy: '⚔️ Enemy',
    friendly: '😊 Friendly',
    neutral: '😐 Neutral'
};

/**
 * Parse JSON field safely
 * @param {*} field - Field value
 * @returns {Object|Array|null} Parsed value
 */
function parseJsonField(field) {
    if (!field) return null;
    if (typeof field === 'object') return field;
    try {
        return JSON.parse(field);
    } catch {
        return null;
    }
}

/**
 * Normalize output_items to array format
 * Database may store as object {} or array [], always convert to array
 * Format: [{"item_name": "Pulse Resin", "quantity": 1, "chance": 1.0}]
 * @param {*} outputItems - Raw output_items value
 * @returns {Array} Normalized array of output items
 */
function normalizeOutputItems(outputItems) {
    if (!outputItems) return [];
    
    // If it's a string, try to parse it (might be double-encoded)
    if (typeof outputItems === 'string') {
        try {
            const parsed = JSON.parse(outputItems);
            return normalizeOutputItems(parsed); // Recursively normalize the parsed result
        } catch (e) {
            console.warn('[NPC Model] Failed to parse output_items string:', outputItems, e);
            return [];
        }
    }
    
    // If already an array, ensure it has the correct structure
    if (Array.isArray(outputItems)) {
        return outputItems.map(item => {
            if (typeof item === 'string') {
                // Array of strings: ["Pulse Resin"] -> [{item_name: "Pulse Resin", quantity: 1}]
                return { item_name: item, quantity: 1, chance: 1.0 };
            }
            // Already in correct format, just ensure all fields exist
            return {
                item_name: item.item_name || '',
                quantity: item.quantity || 1,
                chance: item.chance !== undefined ? item.chance : 1.0
            };
        });
    }
    
    // If it's an object, convert to array format
    if (typeof outputItems === 'object') {
        const items = [];
        for (const [itemName, value] of Object.entries(outputItems)) {
            if (typeof value === 'number') {
                // Simple format: {"Pulse Resin": 1} -> quantity
                items.push({
                    item_name: itemName,
                    quantity: value,
                    chance: 1.0
                });
            } else if (typeof value === 'object' && value !== null) {
                // Complex format: {"Pulse Resin": {quantity: 1, chance: 0.5}}
                items.push({
                    item_name: itemName,
                    quantity: value.quantity || 1,
                    chance: value.chance !== undefined ? value.chance : 1.0
                });
            }
        }
        return items;
    }
    
    console.warn('[NPC Model] output_items in unexpected format:', outputItems, typeof outputItems);
    return [];
}

/**
 * Map a server NPC object to a normalized NPC
 * Matches actual database columns from scriptable_npcs table
 * @param {Object} row - Raw NPC from server
 * @returns {Object} Normalized NPC object
 */
export function mapRowToNpc(row) {
    if (!row) return null;
    
    return {
        // Core fields (001_schema.sql)
        id: row.id,
        name: row.name || '',
        description: row.description || '',
        npc_type: row.npc_type || 'neutral',
        
        // Cycle/timing fields
        base_cycle_time: row.base_cycle_time ?? 5000,
        difficulty: row.difficulty ?? 1,
        harvestable_time: row.harvestable_time ?? 60000,
        cooldown_time: row.cooldown_time ?? 120000,
        
        // JSON fields for configuration
        required_stats: parseJsonField(row.required_stats) || {},
        required_buffs: parseJsonField(row.required_buffs) || [],
        input_items: parseJsonField(row.input_items) || [],
        // output_items: normalize to array format [{"item_name": "...", "quantity": 1, "chance": 1.0}]
        // Database stores as TEXT (JSON string), parse first then normalize
        output_items: (() => {
            const raw = row.output_items;
            const parsed = parseJsonField(raw);
            const normalized = normalizeOutputItems(parsed);
            if (raw && normalized.length === 0) {
                console.warn('[NPC Model] output_items normalization failed:', { raw, parsed, normalized });
            }
            return normalized;
        })(),
        failure_states: parseJsonField(row.failure_states) || [],
        
        // Display
        display_color: row.display_color || '#00ff00',
        
        // State flags
        scriptable: row.scriptable ?? true,
        active: row.active ?? true,
        
        // Pulse echo (052_add_npc_pulse_echo_yield.sql)
        pulse_echo_yield: row.pulse_echo_yield ?? 1,
        
        // Output distribution (044_npc_output_distribution.sql)
        // Values: 'ground', 'player', 'all_players'
        output_distribution: row.output_distribution || 'ground',
        
        // Harvest prerequisites (029_add_harvest_prerequisite.sql)
        // Database stores as TEXT (harvest_prerequisite_item), can be JSON array or single string
        // Try parsing as JSON first, but if it fails or is null, use the raw value
        harvest_prerequisite_items: (() => {
            const raw = row.harvest_prerequisite_item;
            const parsed = parseJsonField(raw);
            const value = parsed !== null ? parsed : (raw || null);
            const normalized = normalizeHarvestPrerequisites(value);
            if (raw && normalized.length === 0) {
                console.warn('[NPC Model] harvest_prerequisite_items normalization failed:', { raw, parsed, value, normalized });
            }
            return normalized;
        })(),
        harvest_prerequisite_message: row.harvest_prerequisite_message || null
    };
}

/**
 * Normalize harvest_prerequisite_item to array format
 * Database may store as single TEXT (item name) or JSON array
 * Format: [{"item_name": "Harvester Rune"}] or ["Harvester Rune"]
 * @param {*} prerequisite - Raw harvest_prerequisite_item value
 * @returns {Array} Normalized array of prerequisite items
 */
function normalizeHarvestPrerequisites(prerequisite) {
    if (!prerequisite) return [];
    
    // If it's a string (single item name like "Harvester Rune"), convert to array
    if (typeof prerequisite === 'string') {
        // Check if it's a JSON string that needs parsing
        if (prerequisite.trim().startsWith('[') || prerequisite.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(prerequisite);
                return normalizeHarvestPrerequisites(parsed); // Recursively normalize
            } catch (e) {
                // Not valid JSON, treat as plain item name
                return [{ item_name: prerequisite.trim() }];
            }
        }
        // Plain string item name
        return [{ item_name: prerequisite.trim() }];
    }
    
    // If it's already an array
    if (Array.isArray(prerequisite)) {
        return prerequisite.map(item => {
            if (typeof item === 'string') {
                return { item_name: item };
            }
            // Already has item_name property
            return {
                item_name: item.item_name || item.name || '',
                quantity: item.quantity || 1
            };
        });
    }
    
    // If it's an object, convert to array
    if (typeof prerequisite === 'object') {
        return Object.keys(prerequisite).map(itemName => ({
            item_name: itemName
        }));
    }
    
    return [];
}

/**
 * Map multiple server NPC objects to NPCs
 * @param {Array} rows - Array of server NPCs
 * @returns {Array} Array of normalized NPC objects
 */
export function mapRowsToNpcs(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToNpc).filter(Boolean);
}

/**
 * Validate an NPC object
 * @param {Object} npc - NPC to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateNpc(npc) {
    const errors = [];
    
    if (!npc.name || npc.name.trim().length === 0) {
        errors.push('NPC name is required');
    }
    
    if (!npc.description || npc.description.trim().length === 0) {
        errors.push('NPC description is required');
    }
    
    if (npc.npc_type && !NPC_TYPES.includes(npc.npc_type)) {
        errors.push(`Invalid NPC type: ${npc.npc_type}. Valid: ${NPC_TYPES.join(', ')}`);
    }
    
    if (npc.base_cycle_time !== undefined && npc.base_cycle_time < 0) {
        errors.push('Base cycle time cannot be negative');
    }
    
    if (npc.difficulty !== undefined && npc.difficulty < 1) {
        errors.push('Difficulty must be at least 1');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get display label for NPC type
 * @param {string} type - NPC type
 * @returns {string} Display label
 */
export function getNpcTypeLabel(type) {
    return NPC_TYPE_LABELS[type] || type;
}

/**
 * Check if NPC is harvestable type
 * @param {Object} npc - NPC object
 * @returns {boolean} Whether NPC is harvestable type
 */
export function isHarvestable(npc) {
    return npc && npc.npc_type === 'harvestable';
}

/**
 * Default output item structure for output_items JSON field
 */
export function createDefaultOutputItem() {
    return {
        item_name: '',
        quantity: 1,
        chance: 1.0
    };
}

/**
 * Default input item structure for input_items JSON field
 */
export function createDefaultInputItem() {
    return {
        item_name: '',
        quantity: 1
    };
}

/**
 * Default harvest prerequisite item structure
 */
export function createDefaultHarvestPrerequisite() {
    return {
        item_name: ''
    };
}

/**
 * Default required stat structure for required_stats JSON field
 */
export function createDefaultRequiredStat() {
    return {
        stat: '',
        min_value: 0
    };
}
