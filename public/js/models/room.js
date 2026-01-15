/**
 * Room/Map Model - Client-side ES6 Module
 * 
 * Canonical Room and Map models for client-side components.
 * Provides consistent field normalization and validation.
 */

/**
 * Valid room types - from database room_type_colors table
 * IMPORTANT: Only these 5 types exist in the database
 */
export const ROOM_TYPES = [
    'normal',
    'merchant',
    'factory',
    'warehouse',
    'bank'
];

/**
 * Room type display labels
 */
export const ROOM_TYPE_LABELS = {
    normal: '🏠 Normal',
    merchant: '🏪 Merchant',
    factory: '🏭 Factory',
    warehouse: '📦 Warehouse',
    bank: '🏦 Bank'
};

/**
 * Room type colors (for canvas rendering) - matches database
 */
export const ROOM_TYPE_COLORS = {
    normal: '#00ff00',
    merchant: '#0088ff',
    factory: '#ff8800',
    warehouse: '#00ffff',
    bank: '#ffff00'
};

/**
 * Map a server map object to normalized Map
 * @param {Object} row - Raw map from server
 * @returns {Object} Normalized map object
 */
export function mapRowToMap(row) {
    if (!row) return null;
    
    return {
        id: row.id,
        name: row.name || '',
        description: row.description || '',
        width: row.width || 100,
        height: row.height || 100,
        is_default: row.is_default ?? false,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

/**
 * Map multiple server map objects
 * @param {Array} rows - Array of server maps
 * @returns {Array} Array of normalized map objects
 */
export function mapRowsToMaps(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToMap).filter(Boolean);
}

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
 * Map a server room object to normalized Room
 * Fields match database schema from migrations/001_schema.sql + 071_add_factory_tier_quirks.sql
 * 
 * @param {Object} row - Raw room from server
 * @returns {Object} Normalized room object
 */
export function mapRowToRoom(row) {
    if (!row) return null;
    
    return {
        // Core fields from rooms table
        id: row.id,
        map_id: row.map_id || row.mapId,
        name: row.name || '',
        description: row.description || '',
        x: row.x ?? 0,
        y: row.y ?? 0,
        room_type: row.room_type || row.roomType || 'normal',
        
        // Map connection fields (use explicit null check to allow 0 as valid coordinate)
        connected_map_id: row.connected_map_id || null,
        connected_room_x: row.connected_room_x !== null && row.connected_room_x !== undefined ? row.connected_room_x : null,
        connected_room_y: row.connected_room_y !== null && row.connected_room_y !== undefined ? row.connected_room_y : null,
        connection_direction: row.connection_direction || null,
        
        // Factory fields (from migration 071)
        factory_tier: row.factory_tier || null,
        factory_quirks: parseJsonField(row.factory_quirks) || null
    };
}

/**
 * Map multiple server room objects
 * @param {Array} rows - Array of server rooms
 * @returns {Array} Array of normalized room objects
 */
export function mapRowsToRooms(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(mapRowToRoom).filter(Boolean);
}

/**
 * Validate a room object
 * @param {Object} room - Room to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateRoom(room) {
    const errors = [];
    
    if (!room.name || room.name.trim().length === 0) {
        errors.push('Room name is required');
    }
    
    if (room.name && room.name.length > 100) {
        errors.push('Room name must be 100 characters or less');
    }
    
    if (room.room_type && !ROOM_TYPES.includes(room.room_type)) {
        errors.push(`Invalid room type: ${room.room_type}`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a map object
 * @param {Object} map - Map to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateMap(map) {
    const errors = [];
    
    if (!map.name || map.name.trim().length === 0) {
        errors.push('Map name is required');
    }
    
    if (map.name && map.name.length > 100) {
        errors.push('Map name must be 100 characters or less');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get display label for room type
 * @param {string} type - Room type
 * @returns {string} Display label
 */
export function getRoomTypeLabel(type) {
    return ROOM_TYPE_LABELS[type] || type;
}

/**
 * Get color for room type
 * @param {string} type - Room type
 * @returns {string} Color hex value
 */
export function getRoomTypeColor(type) {
    return ROOM_TYPE_COLORS[type] || '#00ff00';
}

/**
 * Direction opposites for exit connections
 */
export const DIRECTION_OPPOSITES = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    up: 'down',
    down: 'up',
    northeast: 'southwest',
    northwest: 'southeast',
    southeast: 'northwest',
    southwest: 'northeast'
};

/**
 * Get all valid directions
 */
export const DIRECTIONS = Object.keys(DIRECTION_OPPOSITES);

