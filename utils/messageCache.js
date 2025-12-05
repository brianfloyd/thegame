/**
 * Message Cache Utility
 * 
 * Provides in-memory caching for game UI messages loaded from database.
 * Messages are loaded at server startup and can be reloaded when updated.
 */

const db = require('../database');

// In-memory message cache
const messageCache = new Map();

/**
 * Load all messages from database into cache
 * @param {string|null} category - Optional category filter
 */
async function loadMessageCache(category = null) {
  try {
    const messages = await db.getAllGameMessages(category);
    messageCache.clear();
    messages.forEach(msg => {
      messageCache.set(msg.message_key, msg);
    });
    console.log(`[MessageCache] Loaded ${messages.length} messages${category ? ` (category: ${category})` : ''}`);
  } catch (error) {
    console.error('[MessageCache] Error loading messages:', error);
  }
}

/**
 * Get message from cache
 * @param {string} messageKey - Message key
 * @returns {object|null} Message object or null if not found
 */
function getMessage(messageKey) {
  return messageCache.get(messageKey) || null;
}

/**
 * Replace placeholders in message template
 * @param {string} template - Message template with placeholders
 * @param {object} placeholders - Object with placeholder values
 * @returns {string} Formatted message
 */
function replacePlaceholders(template, placeholders = {}) {
  let result = template;
  
  // Handle array placeholders: {[char|NPC array]}, {[directions array]}, {[items array]}
  if (placeholders['[char|NPC array]']) {
    const array = placeholders['[char|NPC array]'];
    const formatted = Array.isArray(array) ? array.join(', ') : array;
    result = result.replace('{[char|NPC array]}', formatted);
  }
  
  if (placeholders['[directions array]'] !== undefined) {
    const array = placeholders['[directions array]'];
    const formatted = Array.isArray(array) && array.length > 0 ? array.join(', ') : (array.length === 0 ? 'None' : array);
    result = result.replace('{[directions array]}', formatted);
  }
  
  if (placeholders['[items array]']) {
    const array = placeholders['[items array]'];
    const formatted = Array.isArray(array) ? array.join(', ') : array;
    result = result.replace('{[items array]}', formatted);
  }
  
  // Handle simple variable placeholders: {variable}
  Object.keys(placeholders).forEach(key => {
    if (!key.startsWith('[') && !key.endsWith(']')) {
      const value = placeholders[key];
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
  });
  
  return result;
}

/**
 * Get formatted message with placeholders replaced
 * @param {string} messageKey - Message key
 * @param {object} placeholders - Placeholder values
 * @returns {string} Formatted message or fallback
 */
function getFormattedMessage(messageKey, placeholders = {}) {
  const message = getMessage(messageKey);
  if (!message) {
    console.warn(`[MessageCache] Message not found: ${messageKey}, cache size: ${messageCache.size}`);
    // Return fallback based on message key
    if (messageKey === 'room_also_here') {
      const entities = placeholders['[char|NPC array]'] || [];
      const formatted = Array.isArray(entities) ? entities.join(', ') : entities;
      return 'Also here: ' + (formatted || 'No one else is here.');
    }
    if (messageKey === 'room_no_one_here') {
      return 'No one else is here.';
    }
    if (messageKey === 'room_obvious_exits') {
      const directions = placeholders['[directions array]'] || [];
      const formatted = Array.isArray(directions) ? directions.join(', ') : directions;
      return 'Obvious exits: ' + (formatted || 'None');
    }
    if (messageKey === 'room_on_ground') {
      return 'On the ground: ' + (placeholders['[items array]'] || 'Nothing');
    }
    // Harvest message fallbacks
    if (messageKey === 'harvest_begin') {
      return `You begin harvesting the ${placeholders.npcName || 'creature'}.`;
    }
    if (messageKey === 'harvest_miss') {
      return `Your harvest from ${placeholders.npcName || 'creature'} misses this cycle.`;
    }
    if (messageKey === 'harvest_item_produced') {
      return `${placeholders.npcName || 'creature'} pulses ${placeholders.quantity || 0} ${placeholders.itemName || 'item'} for harvest.`;
    }
    if (messageKey === 'harvest_cooldown') {
      return `${placeholders.npcName || 'creature'} has been harvested and must cooldown before continue harvest.`;
    }
    if (messageKey === 'vitalis_drain_hit') {
      return `[Hit] ${placeholders.drainAmount || 0} Vitalis has been drained. (${placeholders.vitalis || 0} / ${placeholders.maxVitalis || 100})`;
    }
    if (messageKey === 'vitalis_drain_miss') {
      return `[Miss] ${placeholders.drainAmount || 0} Vitalis has been drained. (${placeholders.vitalis || 0} / ${placeholders.maxVitalis || 100})`;
    }
    return messageKey; // Fallback to key itself
  }
  
  const template = message.message_template;
  const result = replacePlaceholders(template, placeholders);
  
  return result;
}

/**
 * Reload message cache (useful after database updates)
 * @param {string|null} category - Optional category filter
 */
async function reloadMessageCache(category = null) {
  await loadMessageCache(category);
}

module.exports = {
  loadMessageCache,
  getMessage,
  getFormattedMessage,
  replacePlaceholders,
  reloadMessageCache
};

