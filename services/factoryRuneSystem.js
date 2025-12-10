/**
 * Factory Rune System Service
 * 
 * Handles rune type detection, slot validation, and modifier calculations
 * for the factory crafting system.
 * 
 * IMPORTANT: Fixed semantic slot mapping with NO cross-slot flexibility:
 * - Slot 0-1: Ingredient slots (accept ingredient items ONLY)
 * - Slot 2: Production rune slot (MUST contain PRODUCTION rune)
 * - Slot 3: Optional speed rune slot (SPEED runes ONLY)
 * - Slot 4: Optional efficiency rune slot (EFFICIENCY runes ONLY)
 */

const config = require('../config/factoryConfig');

/**
 * Extract rune_type from an item
 * @param {Object} item - Item object with rune_type field
 * @returns {string|null} Rune type (PRODUCTION, SPEED, EFFICIENCY) or null
 */
function getRuneType(item) {
  if (!item) return null;
  if (item.item_type !== 'rune') return null;
  return item.rune_type || null;
}

/**
 * Get rune_color for display
 * @param {Object} item - Item object with rune_color field
 * @returns {string|null} Hex color string or null
 */
function getRuneColor(item) {
  if (!item) return null;
  if (item.item_type !== 'rune') return null;
  return item.rune_color || '#0000FF'; // Default blue
}

/**
 * Check if an item is a rune
 * @param {Object} item - Item object
 * @returns {boolean} True if item is a rune
 */
function isRune(item) {
  return item && item.item_type === 'rune';
}

/**
 * Check if an item is an ingredient
 * @param {Object} item - Item object
 * @returns {boolean} True if item is an ingredient
 */
function isIngredient(item) {
  return item && item.item_type === 'ingredient';
}

/**
 * Validate that a rune can be placed in a specific slot
 * ENFORCES STRICT SLOT-TO-RUNE-TYPE MAPPING:
 * - Slot 2: PRODUCTION only
 * - Slot 3: SPEED only
 * - Slot 4: EFFICIENCY only
 * 
 * @param {number} slotIndex - Slot index (0-4)
 * @param {Object} item - Item to place in slot
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateSlotPlacement(slotIndex, item) {
  if (!item) {
    return { valid: false, error: 'No item provided' };
  }
  
  const slotConfig = config.SLOTS;
  
  // Check ingredient slots (0-1)
  if (slotConfig.INGREDIENT_SLOTS.includes(slotIndex)) {
    if (!isIngredient(item)) {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} is an ingredient slot and only accepts ingredients. "${item.name || item.item_name}" is a ${item.item_type}.`
      };
    }
    return { valid: true, error: null };
  }
  
  // Check rune slots (2-4)
  if (slotIndex === slotConfig.PRODUCTION_RUNE_SLOT) {
    if (!isRune(item)) {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} is the production rune slot and only accepts runes.`
      };
    }
    const runeType = getRuneType(item);
    if (runeType !== 'PRODUCTION') {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} requires a PRODUCTION rune. "${item.name || item.item_name}" is a ${runeType || 'unknown type'} rune.`
      };
    }
    return { valid: true, error: null };
  }
  
  if (slotIndex === slotConfig.SPEED_RUNE_SLOT) {
    if (!isRune(item)) {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} is the speed rune slot and only accepts runes.`
      };
    }
    const runeType = getRuneType(item);
    if (runeType !== 'SPEED') {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} requires a SPEED rune. "${item.name || item.item_name}" is a ${runeType || 'unknown type'} rune.`
      };
    }
    return { valid: true, error: null };
  }
  
  if (slotIndex === slotConfig.EFFICIENCY_RUNE_SLOT) {
    if (!isRune(item)) {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} is the efficiency rune slot and only accepts runes.`
      };
    }
    const runeType = getRuneType(item);
    if (runeType !== 'EFFICIENCY') {
      return { 
        valid: false, 
        error: `Slot ${slotIndex} requires an EFFICIENCY rune. "${item.name || item.item_name}" is a ${runeType || 'unknown type'} rune.`
      };
    }
    return { valid: true, error: null };
  }
  
  return { valid: false, error: `Invalid slot index: ${slotIndex}` };
}

/**
 * Check if Production Rune is in slot 2 (machine requirement)
 * @param {Array} slots - Factory slots array
 * @returns {boolean} True if Production Rune is present
 */
function hasProductionRune(slots) {
  if (!slots || !Array.isArray(slots)) return false;
  
  const productionSlot = slots[config.SLOTS.PRODUCTION_RUNE_SLOT];
  if (!productionSlot) return false;
  
  // Check if it's a production rune
  return productionSlot.itemType === 'rune' && 
         (productionSlot.runeType === 'PRODUCTION' || 
          productionSlot.itemName?.toLowerCase().includes('production') ||
          productionSlot.itemName?.toLowerCase().includes('factory') ||
          productionSlot.itemName?.toLowerCase().includes('harvester'));
}

/**
 * Get the speed rune from slots (if present)
 * @param {Array} slots - Factory slots array
 * @returns {Object|null} Speed rune slot data or null
 */
function getSpeedRune(slots) {
  if (!slots || !Array.isArray(slots)) return null;
  
  const speedSlot = slots[config.SLOTS.SPEED_RUNE_SLOT];
  if (!speedSlot) return null;
  
  if (speedSlot.itemType === 'rune' && speedSlot.runeType === 'SPEED') {
    return speedSlot;
  }
  
  return null;
}

/**
 * Get the efficiency rune from slots (if present)
 * @param {Array} slots - Factory slots array
 * @returns {Object|null} Efficiency rune slot data or null
 */
function getEfficiencyRune(slots) {
  if (!slots || !Array.isArray(slots)) return null;
  
  const efficiencySlot = slots[config.SLOTS.EFFICIENCY_RUNE_SLOT];
  if (!efficiencySlot) return null;
  
  if (efficiencySlot.itemType === 'rune' && efficiencySlot.runeType === 'EFFICIENCY') {
    return efficiencySlot;
  }
  
  return null;
}

/**
 * Calculate speed modifier based on speed rune and player stats
 * Returns a multiplier < 1 (e.g., 0.8 = 20% faster)
 * 
 * @param {Object|null} speedRune - Speed rune data from slot
 * @param {Object} playerStats - Player stats object
 * @param {Object|null} quirk - Factory quirk (may modify rune effectiveness)
 * @returns {number} Speed modifier (1.0 = no change, 0.8 = 20% faster)
 */
function calculateSpeedModifier(speedRune, playerStats, quirk = null) {
  const runeConfig = config.RUNE_MODIFIERS;
  
  // Base: no modifier (1.0 = normal speed)
  if (!speedRune) {
    // Still apply stat bonus even without rune
    const statBonus = (playerStats?.stat_resonance || 0) * runeConfig.STAT_SPEED_SCALAR;
    return Math.max(1 - statBonus, 1 - runeConfig.MAX_SPEED_REDUCTION);
  }
  
  // Calculate rune contribution
  let runeBonus = runeConfig.SPEED_RUNE_SCALAR;
  
  // Apply quirk modifier if attuned factory
  if (quirk && quirk.type === 'attuned') {
    runeBonus *= config.QUIRKS.attuned.runeBonusMultiplier;
  }
  
  // Add stat contribution
  const statBonus = (playerStats?.stat_resonance || 0) * runeConfig.STAT_SPEED_SCALAR;
  
  // Calculate total reduction
  let totalReduction = runeBonus + statBonus;
  
  // Apply quirk speed bonuses/penalties
  if (quirk) {
    if (quirk.type === 'stable') {
      // Stable factory: speed penalty (slower)
      totalReduction -= config.QUIRKS.stable.speedPenalty;
    } else if (quirk.type === 'chaotic') {
      // Chaotic factory: speed bonus (faster)
      totalReduction += config.QUIRKS.chaotic.speedBonus;
    }
  }
  
  // Cap at maximum reduction
  totalReduction = Math.min(totalReduction, runeConfig.MAX_SPEED_REDUCTION);
  totalReduction = Math.max(totalReduction, 0); // Don't go negative
  
  return 1 - totalReduction;
}

/**
 * Calculate efficiency modifier based on efficiency rune and player stats
 * Returns a multiplier < 1 (e.g., 0.85 = 15% fewer ingredients)
 * 
 * @param {Object|null} efficiencyRune - Efficiency rune data from slot
 * @param {Object} playerStats - Player stats object
 * @param {Object|null} quirk - Factory quirk (may modify rune effectiveness)
 * @returns {number} Efficiency modifier (1.0 = no change, 0.85 = 15% reduction)
 */
function calculateEfficiencyModifier(efficiencyRune, playerStats, quirk = null) {
  const runeConfig = config.RUNE_MODIFIERS;
  
  // Base: no modifier (1.0 = normal consumption)
  if (!efficiencyRune) {
    // Still apply stat bonus even without rune
    const statBonus = (playerStats?.stat_ingenuity || 0) * runeConfig.STAT_EFFICIENCY_SCALAR;
    return Math.max(1 - statBonus, 1 - runeConfig.MAX_EFFICIENCY_REDUCTION);
  }
  
  // Calculate rune contribution
  let runeBonus = runeConfig.EFFICIENCY_RUNE_SCALAR;
  
  // Apply quirk modifier if attuned factory
  if (quirk && quirk.type === 'attuned') {
    runeBonus *= config.QUIRKS.attuned.runeBonusMultiplier;
  }
  
  // Add stat contribution
  const statBonus = (playerStats?.stat_ingenuity || 0) * runeConfig.STAT_EFFICIENCY_SCALAR;
  
  // Calculate total reduction
  let totalReduction = runeBonus + statBonus;
  
  // Cap at maximum reduction
  totalReduction = Math.min(totalReduction, runeConfig.MAX_EFFICIENCY_REDUCTION);
  totalReduction = Math.max(totalReduction, 0); // Don't go negative
  
  return 1 - totalReduction;
}

/**
 * Apply efficiency modifier to ingredient quantities
 * Rounds up to ensure at least 1 of each ingredient
 * 
 * @param {Array} ingredients - Array of {item_name, quantity} objects
 * @param {number} efficiencyModifier - Efficiency modifier from calculateEfficiencyModifier
 * @returns {Array} Modified ingredient quantities
 */
function applyEfficiencyToIngredients(ingredients, efficiencyModifier) {
  if (!ingredients || !Array.isArray(ingredients)) return [];
  
  return ingredients.map(ing => ({
    ...ing,
    quantity: Math.max(1, Math.ceil(ing.quantity * efficiencyModifier))
  }));
}

/**
 * Apply speed modifier to crafting time
 * 
 * @param {number} baseTimeMs - Base crafting time in milliseconds
 * @param {number} speedModifier - Speed modifier from calculateSpeedModifier
 * @returns {number} Modified crafting time (floored, minimum enforced)
 */
function applySpeedToCraftTime(baseTimeMs, speedModifier) {
  const modifiedTime = Math.floor(baseTimeMs * speedModifier);
  return Math.max(modifiedTime, config.TIMING.MIN_CRAFT_TIME_MS);
}

/**
 * Get all runes from factory slots
 * @param {Array} slots - Factory slots array
 * @returns {Object} { production: Object|null, speed: Object|null, efficiency: Object|null }
 */
function getRunesFromSlots(slots) {
  return {
    production: hasProductionRune(slots) ? slots[config.SLOTS.PRODUCTION_RUNE_SLOT] : null,
    speed: getSpeedRune(slots),
    efficiency: getEfficiencyRune(slots)
  };
}

/**
 * Get all ingredients from factory slots
 * @param {Array} slots - Factory slots array
 * @returns {Array} Array of ingredient slot data
 */
function getIngredientsFromSlots(slots) {
  if (!slots || !Array.isArray(slots)) return [];
  
  const ingredients = [];
  for (const slotIndex of config.SLOTS.INGREDIENT_SLOTS) {
    const slot = slots[slotIndex];
    if (slot && slot.itemName) {
      ingredients.push({
        slotIndex,
        itemName: slot.itemName,
        quantity: slot.quantity || 1,
        itemType: slot.itemType
      });
    }
  }
  
  return ingredients;
}

module.exports = {
  // Rune type detection
  getRuneType,
  getRuneColor,
  isRune,
  isIngredient,
  
  // Slot validation
  validateSlotPlacement,
  hasProductionRune,
  getSpeedRune,
  getEfficiencyRune,
  getRunesFromSlots,
  getIngredientsFromSlots,
  
  // Modifier calculations
  calculateSpeedModifier,
  calculateEfficiencyModifier,
  applyEfficiencyToIngredients,
  applySpeedToCraftTime
};

