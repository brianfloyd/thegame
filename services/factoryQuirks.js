/**
 * Factory Quirks Service
 * 
 * Handles factory quirk definitions and modifier applications.
 * 
 * Quirk types:
 * - stable: +10% success, -15% speed (slower but more reliable)
 * - chaotic: -10% success, +20% speed (faster but riskier)
 * - attuned: 2x rune bonus multiplier (runes more effective)
 * - worn: 10% chance to reduce output by 50% (degraded machine)
 */

const config = require('../config/factoryConfig');

/**
 * Quirk definitions with descriptions and modifiers
 */
const QUIRK_DEFINITIONS = {
  stable: {
    type: 'stable',
    name: 'Stable Factory',
    description: 'This factory operates steadily but slowly. More reliable crafting outcomes.',
    effects: {
      successBonus: 0.10,      // +10% success rate
      speedPenalty: 0.15       // Takes 15% longer
    },
    color: '#4CAF50' // Green
  },
  chaotic: {
    type: 'chaotic',
    name: 'Chaotic Factory',
    description: 'This factory operates erratically but quickly. Faster but less reliable.',
    effects: {
      successPenalty: 0.10,   // -10% success rate
      speedBonus: 0.20        // 20% faster
    },
    color: '#F44336' // Red
  },
  attuned: {
    type: 'attuned',
    name: 'Attuned Factory',
    description: 'This factory resonates with runic energy. Runes are more effective here.',
    effects: {
      runeBonusMultiplier: 2.0  // 2x rune effectiveness
    },
    color: '#9C27B0' // Purple
  },
  worn: {
    type: 'worn',
    name: 'Worn Factory',
    description: 'This factory shows signs of wear. May occasionally produce less output.',
    effects: {
      outputReductionChance: 0.10,  // 10% chance
      outputReductionAmount: 0.50   // 50% output reduction when triggered
    },
    color: '#795548' // Brown
  }
};

/**
 * Get quirk definition by type
 * @param {string} quirkType - Quirk type (stable, chaotic, attuned, worn)
 * @returns {Object|null} Quirk definition or null
 */
function getQuirkDefinition(quirkType) {
  return QUIRK_DEFINITIONS[quirkType] || null;
}

/**
 * Get all quirk definitions
 * @returns {Object} All quirk definitions
 */
function getAllQuirkDefinitions() {
  return { ...QUIRK_DEFINITIONS };
}

/**
 * Extract quirk from room's factory_quirks JSONB field
 * @param {Object} room - Room object with factory_quirks field
 * @returns {Object|null} Parsed quirk object or null
 */
function getFactoryQuirk(room) {
  if (!room || !room.factory_quirks) return null;
  
  let quirks = room.factory_quirks;
  
  // Parse if string
  if (typeof quirks === 'string') {
    try {
      quirks = JSON.parse(quirks);
    } catch (e) {
      console.error('[factoryQuirks] Failed to parse factory_quirks:', e);
      return null;
    }
  }
  
  // Validate quirk type
  if (!quirks.type || !QUIRK_DEFINITIONS[quirks.type]) {
    return null;
  }
  
  // Return normalized quirk object
  return {
    type: quirks.type,
    ...QUIRK_DEFINITIONS[quirks.type],
    // Allow custom modifiers to override defaults
    effects: {
      ...QUIRK_DEFINITIONS[quirks.type].effects,
      ...quirks.modifiers
    }
  };
}

/**
 * Apply quirk modifier to success rate
 * @param {number} baseSuccessRate - Base success rate (0-100)
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {number} Modified success rate
 */
function applyQuirkToSuccessRate(baseSuccessRate, quirk) {
  if (!quirk) return baseSuccessRate;
  
  let modifier = 0;
  
  if (quirk.type === 'stable') {
    modifier = quirk.effects.successBonus || config.QUIRKS.stable.successBonus;
  } else if (quirk.type === 'chaotic') {
    modifier = -(quirk.effects.successPenalty || config.QUIRKS.chaotic.successPenalty);
  }
  
  // Apply as percentage points (modifier is 0.10 = +10%)
  return baseSuccessRate + (modifier * 100);
}

/**
 * Apply quirk modifier to crafting speed
 * @param {number} baseTimeMs - Base crafting time in milliseconds
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {number} Modified crafting time
 */
function applyQuirkToSpeed(baseTimeMs, quirk) {
  if (!quirk) return baseTimeMs;
  
  let speedModifier = 1.0;
  
  if (quirk.type === 'stable') {
    // Slower: takes longer
    speedModifier = 1 + (quirk.effects.speedPenalty || config.QUIRKS.stable.speedPenalty);
  } else if (quirk.type === 'chaotic') {
    // Faster: takes less time
    speedModifier = 1 - (quirk.effects.speedBonus || config.QUIRKS.chaotic.speedBonus);
  }
  
  return Math.floor(baseTimeMs * speedModifier);
}

/**
 * Get rune bonus multiplier from quirk
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {number} Rune bonus multiplier (default 1.0)
 */
function getRuneBonusMultiplier(quirk) {
  if (!quirk || quirk.type !== 'attuned') return 1.0;
  return quirk.effects.runeBonusMultiplier || config.QUIRKS.attuned.runeBonusMultiplier;
}

/**
 * Check if worn quirk triggers output reduction
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {boolean} True if output should be reduced
 */
function checkWornOutputReduction(quirk) {
  if (!quirk || quirk.type !== 'worn') return false;
  
  const chance = quirk.effects.outputReductionChance || config.QUIRKS.worn.outputReductionChance;
  return Math.random() < chance;
}

/**
 * Apply worn quirk output reduction to quantity
 * @param {number} baseQuantity - Base output quantity
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {Object} { quantity: number, reduced: boolean }
 */
function applyWornOutputReduction(baseQuantity, quirk) {
  if (!quirk || quirk.type !== 'worn') {
    return { quantity: baseQuantity, reduced: false };
  }
  
  if (checkWornOutputReduction(quirk)) {
    const reductionAmount = quirk.effects.outputReductionAmount || config.QUIRKS.worn.outputReductionAmount;
    const reducedQuantity = Math.max(1, Math.floor(baseQuantity * (1 - reductionAmount)));
    return { quantity: reducedQuantity, reduced: true };
  }
  
  return { quantity: baseQuantity, reduced: false };
}

/**
 * Get display information for a quirk
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {Object|null} Display info with name, description, color
 */
function getQuirkDisplayInfo(quirk) {
  if (!quirk) return null;
  
  const definition = QUIRK_DEFINITIONS[quirk.type];
  if (!definition) return null;
  
  return {
    type: quirk.type,
    name: definition.name,
    description: definition.description,
    color: definition.color
  };
}

/**
 * Apply all quirk effects and return summary
 * @param {Object} baseValues - { successRate, craftTimeMs, outputQuantity }
 * @param {Object|null} quirk - Quirk object from getFactoryQuirk
 * @returns {Object} Modified values with effect summary
 */
function applyAllQuirkEffects(baseValues, quirk) {
  if (!quirk) {
    return {
      successRate: baseValues.successRate,
      craftTimeMs: baseValues.craftTimeMs,
      outputQuantity: baseValues.outputQuantity,
      runeBonusMultiplier: 1.0,
      quirkApplied: null,
      wornTriggered: false
    };
  }
  
  // Apply success rate modifier
  const successRate = applyQuirkToSuccessRate(baseValues.successRate, quirk);
  
  // Apply speed modifier
  const craftTimeMs = applyQuirkToSpeed(baseValues.craftTimeMs, quirk);
  
  // Get rune bonus multiplier
  const runeBonusMultiplier = getRuneBonusMultiplier(quirk);
  
  // Apply worn output reduction
  const outputResult = applyWornOutputReduction(baseValues.outputQuantity, quirk);
  
  return {
    successRate,
    craftTimeMs,
    outputQuantity: outputResult.quantity,
    runeBonusMultiplier,
    quirkApplied: quirk.type,
    wornTriggered: outputResult.reduced
  };
}

module.exports = {
  // Quirk definitions
  QUIRK_DEFINITIONS,
  getQuirkDefinition,
  getAllQuirkDefinitions,
  
  // Quirk extraction
  getFactoryQuirk,
  
  // Individual modifiers
  applyQuirkToSuccessRate,
  applyQuirkToSpeed,
  getRuneBonusMultiplier,
  checkWornOutputReduction,
  applyWornOutputReduction,
  
  // Display helpers
  getQuirkDisplayInfo,
  
  // Combined application
  applyAllQuirkEffects
};

