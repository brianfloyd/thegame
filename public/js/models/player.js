/**
 * Player Model - Client-side ES6 Module
 * 
 * Canonical Player model matching the actual database schema.
 * Based on migrations/001_schema.sql and subsequent ALTER TABLE migrations.
 */

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
 * Player stats (prefix: stat_)
 */
export const PLAYER_STATS = ['ingenuity', 'resonance', 'fortitude', 'acumen'];

/**
 * Player abilities (prefix: ability_)
 */
export const PLAYER_ABILITIES = ['crafting', 'attunement', 'endurance', 'commerce'];

/**
 * Player resources (prefix: resource_)
 */
export const PLAYER_RESOURCES = ['vitalis', 'max_vitalis', 'max_encumbrance'];

/**
 * Player flags (prefix: flag_)
 */
export const PLAYER_FLAGS = ['god_mode', 'always_first_time'];

/**
 * Stat display labels
 */
export const STAT_LABELS = {
    stat_ingenuity: '🔧 Ingenuity',
    stat_resonance: '🎵 Resonance',
    stat_fortitude: '🛡️ Fortitude',
    stat_acumen: '👁️ Acumen'
};

/**
 * Ability display labels
 */
export const ABILITY_LABELS = {
    ability_crafting: '⚒️ Crafting',
    ability_attunement: '✨ Attunement',
    ability_endurance: '💪 Endurance',
    ability_commerce: '💰 Commerce'
};

/**
 * Resource display labels
 */
export const RESOURCE_LABELS = {
    resource_vitalis: '💚 Vitalis',
    resource_max_vitalis: '💚 Max Vitalis',
    resource_max_encumbrance: '📦 Max Encumbrance'
};

/**
 * Flag display labels
 */
export const FLAG_LABELS = {
    flag_god_mode: '👁️ God Mode',
    flag_always_first_time: '🌟 Always First Time'
};

/**
 * Map a server player object to normalized Player
 * @param {Object} row - Raw player from server
 * @returns {Object} Normalized player object
 */
export function mapRowToPlayer(row) {
    if (!row) return null;
    
    return {
        // Core fields
        id: row.id,
        name: row.name || '',
        current_room_id: row.current_room_id,
        
        // Stats (prefix: stat_)
        stat_ingenuity: row.stat_ingenuity ?? 5,
        stat_resonance: row.stat_resonance ?? 5,
        stat_fortitude: row.stat_fortitude ?? 5,
        stat_acumen: row.stat_acumen ?? 5,
        
        // Abilities (prefix: ability_)
        ability_crafting: row.ability_crafting ?? 0,
        ability_attunement: row.ability_attunement ?? 0,
        ability_endurance: row.ability_endurance ?? 0,
        ability_commerce: row.ability_commerce ?? 0,
        
        // Resources (prefix: resource_)
        resource_vitalis: row.resource_vitalis ?? 50,
        resource_max_vitalis: row.resource_max_vitalis ?? 100,
        resource_max_encumbrance: row.resource_max_encumbrance ?? 100,
        
        // Assignable points
        assignable_points: row.assignable_points ?? 5,
        
        // Flags (prefix: flag_)
        flag_god_mode: row.flag_god_mode ?? 0,
        flag_always_first_time: row.flag_always_first_time ?? 0,
        
        // Pulse echoes
        pulse_echoes: row.pulse_echoes ?? 0,
        pulse_echo_tier: row.pulse_echo_tier ?? 1,
        
        // Attunement settings
        base_attunement_points: row.base_attunement_points ?? 10,
        base_attunement_cooldown_ms: row.base_attunement_cooldown_ms ?? 10000,
        base_attunement_delay_ms: row.base_attunement_delay_ms ?? 2000,
        last_attune_time: row.last_attune_time,
        
        // UI/Automation settings
        auto_navigation_time_ms: row.auto_navigation_time_ms ?? 1000,
        loop_delay_ms: row.loop_delay_ms ?? 1000,
        room_update_interval_ms: row.room_update_interval_ms ?? 30000,
        widget_config: parseJsonField(row.widget_config) || { activeWidgets: [], scriptingWidgetPosition: 'top' },
        
        // Related data (may be populated by joins)
        current_room: row.current_room || null,
        inventory: row.inventory || []
    };
}

/**
 * Map multiple server player objects
 * @param {Array} rows - Array of server players
 * @returns {Array} Array of normalized player objects
 */
export function mapRowsToPlayers(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToPlayer).filter(Boolean);
}

/**
 * Validate a player object
 * @param {Object} player - Player to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validatePlayer(player) {
    const errors = [];
    
    if (!player.name || player.name.trim().length === 0) {
        errors.push('Player name is required');
    }
    
    if (player.name && player.name.length > 50) {
        errors.push('Player name must be 50 characters or less');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get stat display label
 * @param {string} key - Column key (e.g., 'stat_ingenuity')
 * @returns {string} Display label
 */
export function getStatLabel(key) {
    return STAT_LABELS[key] || ABILITY_LABELS[key] || RESOURCE_LABELS[key] || FLAG_LABELS[key] || key;
}
