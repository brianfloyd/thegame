/**
 * Item Model - Client-side ES6 Module
 * 
 * Canonical Item model matching the actual database schema.
 * Based on migrations/001_schema.sql and subsequent migrations.
 */

/**
 * Valid item types (from migrations/013_item_types_system.sql)
 */
export const ITEM_TYPES = [
    'sundries',     // Default type
    'ingredient',   // Raw materials for crafting
    'rune',         // Magical runes
    'deed'          // Property deeds
];

/**
 * Valid rune types (from migrations/069_add_rune_type_field.sql)
 */
export const RUNE_TYPES = [
    'PRODUCTION',
    'SPEED',
    'EFFICIENCY'
];

/**
 * Item type display labels
 */
export const ITEM_TYPE_LABELS = {
    sundries: '📦 Sundries',
    ingredient: '🧪 Ingredient',
    rune: '💎 Rune',
    deed: '📜 Deed'
};

/**
 * Rune type display labels
 */
export const RUNE_TYPE_LABELS = {
    PRODUCTION: '⚙️ Production',
    SPEED: '⚡ Speed',
    EFFICIENCY: '✨ Efficiency'
};

/**
 * Map a server item object to a normalized Item
 * Matches actual database columns from items table
 * @param {Object} row - Raw item from server
 * @returns {Object} Normalized item object
 */
export function mapRowToItem(row) {
    if (!row) return null;
    
    return {
        // Core fields (001_schema.sql)
        id: row.id,
        name: row.name || '',
        description: row.description || '',
        item_type: row.item_type || 'sundries',
        active: row.active ?? true,
        poofable: row.poofable ?? false,
        encumbrance: row.encumbrance ?? 1,
        created_at: row.created_at,
        
        // Rune fields (069_add_rune_type_field.sql, 064_add_rune_color_field.sql)
        rune_type: row.rune_type || null,
        rune_color: row.rune_color || '#0000ff',
        
        // Deed fields (011_warehouse_system.sql, 014_deed_configuration_fields.sql)
        deed_warehouse_location_key: row.deed_warehouse_location_key || null,
        deed_base_max_item_types: row.deed_base_max_item_types ?? 1,
        deed_base_max_quantity_per_type: row.deed_base_max_quantity_per_type ?? 100,
        deed_upgrade_tier: row.deed_upgrade_tier ?? 1,
        deed_max_total_items: row.deed_max_total_items ?? 100,
        deed_automation_enabled: row.deed_automation_enabled ?? false
    };
}

/**
 * Map multiple server item objects to Items
 * @param {Array} rows - Array of server items
 * @returns {Array} Array of normalized item objects
 */
export function mapRowsToItems(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToItem).filter(Boolean);
}

/**
 * Validate an item object
 * @param {Object} item - Item to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateItem(item) {
    const errors = [];
    
    if (!item.name || item.name.trim().length === 0) {
        errors.push('Item name is required');
    }
    
    if (item.item_type && !ITEM_TYPES.includes(item.item_type)) {
        errors.push(`Invalid item type: ${item.item_type}. Valid: ${ITEM_TYPES.join(', ')}`);
    }
    
    if (item.rune_type && !RUNE_TYPES.includes(item.rune_type)) {
        errors.push(`Invalid rune type: ${item.rune_type}. Valid: ${RUNE_TYPES.join(', ')}`);
    }
    
    if (item.encumbrance !== undefined && item.encumbrance < 0) {
        errors.push('Encumbrance cannot be negative');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get display label for item type
 * @param {string} type - Item type
 * @returns {string} Display label
 */
export function getItemTypeLabel(type) {
    return ITEM_TYPE_LABELS[type] || type;
}

/**
 * Get display label for rune type
 * @param {string} type - Rune type
 * @returns {string} Display label
 */
export function getRuneTypeLabel(type) {
    return RUNE_TYPE_LABELS[type] || type;
}

/**
 * Check if item is a rune
 * @param {Object} item - Item object
 * @returns {boolean} Whether item is a rune
 */
export function isRune(item) {
    return item && item.item_type === 'rune';
}

/**
 * Check if item is a deed
 * @param {Object} item - Item object
 * @returns {boolean} Whether item is a deed
 */
export function isDeed(item) {
    return item && item.item_type === 'deed';
}
