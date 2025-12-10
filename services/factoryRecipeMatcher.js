/**
 * Factory Recipe Matcher Service
 * 
 * Handles recipe matching for the factory crafting system.
 * Supports exact matching, rune substitution, wildcard runes, and tier validation.
 * 
 * IMPORTANT: Production Rune is NOT part of recipe matching.
 * Production Rune is a machine requirement validated separately.
 * Recipes only specify SPEED and EFFICIENCY rune requirements.
 */

const config = require('../config/factoryConfig');
const runeSystem = require('./factoryRuneSystem');

/**
 * Check if ingredients in slots match recipe requirements
 * @param {Array} recipeIngredients - Recipe's required_ingredients array
 * @param {Array} slotIngredients - Ingredients from factory slots
 * @param {number} efficiencyModifier - Efficiency modifier to adjust required quantities
 * @returns {Object} { matches: boolean, missingIngredients: Array, excessIngredients: Array }
 */
function matchIngredients(recipeIngredients, slotIngredients, efficiencyModifier = 1.0) {
  const result = {
    matches: true,
    missingIngredients: [],
    excessIngredients: [],
    details: []
  };
  
  if (!recipeIngredients || recipeIngredients.length === 0) {
    // Recipe doesn't require ingredients
    result.excessIngredients = slotIngredients.filter(i => i && i.itemName);
    return result;
  }
  
  // Build a map of slot ingredients by name (case-insensitive)
  const slotMap = new Map();
  for (const slot of slotIngredients) {
    if (!slot || !slot.itemName) continue;
    
    const name = slot.itemName.toLowerCase();
    const existing = slotMap.get(name) || { itemName: slot.itemName, quantity: 0 };
    existing.quantity += slot.quantity || 1;
    slotMap.set(name, existing);
  }
  
  // Check each required ingredient
  for (const required of recipeIngredients) {
    const requiredName = (required.item_name || required.itemName || '').toLowerCase();
    // Apply efficiency modifier to required quantity (round up, minimum 1)
    const baseQuantity = required.quantity || 1;
    const requiredQuantity = Math.max(1, Math.ceil(baseQuantity * efficiencyModifier));
    
    const slotIngredient = slotMap.get(requiredName);
    
    if (!slotIngredient) {
      // Missing ingredient entirely
      result.matches = false;
      result.missingIngredients.push({
        itemName: required.item_name || required.itemName,
        required: requiredQuantity,
        have: 0
      });
    } else if (slotIngredient.quantity < requiredQuantity) {
      // Not enough of this ingredient
      result.matches = false;
      result.missingIngredients.push({
        itemName: required.item_name || required.itemName,
        required: requiredQuantity,
        have: slotIngredient.quantity
      });
    } else {
      result.details.push({
        itemName: required.item_name || required.itemName,
        required: requiredQuantity,
        have: slotIngredient.quantity,
        match: true
      });
      // Mark as used
      slotMap.delete(requiredName);
    }
  }
  
  // Any remaining ingredients in slots are excess
  for (const [, ingredient] of slotMap) {
    result.excessIngredients.push(ingredient);
  }
  
  return result;
}

/**
 * Check if runes in slots match recipe requirements
 * IMPORTANT: Only checks SPEED (slot 3) and EFFICIENCY (slot 4) runes.
 * Production Rune (slot 2) is NOT part of recipe matching.
 * 
 * @param {Array} recipeRunes - Recipe's required_runes array (e.g., ['SPEED', 'EFFICIENCY'])
 * @param {Array} slots - Factory slots array
 * @param {boolean} allowWildcard - If true, accept any rune in required slots
 * @returns {Object} { matches: boolean, missingRunes: Array }
 */
function matchRunes(recipeRunes, slots, allowWildcard = false) {
  const result = {
    matches: true,
    missingRunes: [],
    presentRunes: []
  };
  
  if (!recipeRunes || recipeRunes.length === 0) {
    // Recipe doesn't require any optional runes
    return result;
  }
  
  // Get runes from slots (excluding production rune)
  const speedSlot = slots?.[config.SLOTS.SPEED_RUNE_SLOT];
  const efficiencySlot = slots?.[config.SLOTS.EFFICIENCY_RUNE_SLOT];
  
  for (const requiredRuneType of recipeRunes) {
    const runeType = requiredRuneType.toUpperCase();
    
    // Skip PRODUCTION - it's never part of recipe requirements
    if (runeType === 'PRODUCTION') {
      console.warn('[factoryRecipeMatcher] Recipe incorrectly includes PRODUCTION rune. Skipping.');
      continue;
    }
    
    if (runeType === 'SPEED') {
      if (!speedSlot || !speedSlot.itemName) {
        result.matches = false;
        result.missingRunes.push('SPEED');
      } else if (!allowWildcard && speedSlot.runeType !== 'SPEED') {
        // Wrong rune type in speed slot
        result.matches = false;
        result.missingRunes.push('SPEED');
      } else {
        result.presentRunes.push({ type: 'SPEED', slot: speedSlot });
      }
    } else if (runeType === 'EFFICIENCY') {
      if (!efficiencySlot || !efficiencySlot.itemName) {
        result.matches = false;
        result.missingRunes.push('EFFICIENCY');
      } else if (!allowWildcard && efficiencySlot.runeType !== 'EFFICIENCY') {
        // Wrong rune type in efficiency slot
        result.matches = false;
        result.missingRunes.push('EFFICIENCY');
      } else {
        result.presentRunes.push({ type: 'EFFICIENCY', slot: efficiencySlot });
      }
    }
  }
  
  return result;
}

/**
 * Check if player stats meet recipe requirements
 * @param {Object} requiredStats - Recipe's required_stats object
 * @param {Object} playerStats - Player's stats object
 * @returns {Object} { meets: boolean, missing: Array, overcharge: number }
 */
function checkStatRequirements(requiredStats, playerStats) {
  const result = {
    meets: true,
    missing: [],
    overcharge: 0,
    exceededStats: []
  };
  
  if (!requiredStats) {
    return result;
  }
  
  // Parse if string
  let required = requiredStats;
  if (typeof required === 'string') {
    try {
      required = JSON.parse(required);
    } catch (e) {
      console.error('[factoryRecipeMatcher] Failed to parse required_stats:', e);
      return result;
    }
  }
  
  const overchargeConfig = config.SUCCESS;
  
  for (const [statName, requiredValue] of Object.entries(required)) {
    const playerValue = playerStats?.[statName] || 0;
    
    if (playerValue < requiredValue) {
      result.meets = false;
      result.missing.push({
        stat: statName,
        required: requiredValue,
        have: playerValue
      });
    } else {
      // Check for overcharge bonus
      const excess = playerValue - requiredValue;
      if (excess >= overchargeConfig.OVERCHARGE_THRESHOLD_AMOUNT) {
        const bonusCount = Math.floor(excess / overchargeConfig.OVERCHARGE_THRESHOLD_AMOUNT);
        result.overcharge += bonusCount * overchargeConfig.OVERCHARGE_BONUS_PER_THRESHOLD;
        result.exceededStats.push({
          stat: statName,
          required: requiredValue,
          have: playerValue,
          bonusCount
        });
      }
    }
  }
  
  return result;
}

/**
 * Check if factory room tier meets recipe requirement
 * @param {number} requiredTier - Recipe's factory_tier_required
 * @param {number} roomTier - Room's factory_tier
 * @returns {Object} { meets: boolean, required: number, have: number }
 */
function checkTierRequirement(requiredTier, roomTier) {
  const required = requiredTier || 1;
  const have = roomTier || 1;
  
  return {
    meets: have >= required,
    required,
    have
  };
}

/**
 * Match a single recipe against current factory state
 * @param {Object} recipe - Recipe object from database
 * @param {Array} slots - Factory slots array
 * @param {Object} playerStats - Player stats object
 * @param {number} roomTier - Factory room tier
 * @param {number} efficiencyModifier - Efficiency modifier for ingredient reduction
 * @returns {Object} Match result with details
 */
function matchSingleRecipe(recipe, slots, playerStats, roomTier = 1, efficiencyModifier = 1.0) {
  const result = {
    matches: true,
    recipe: recipe,
    ingredients: null,
    runes: null,
    stats: null,
    tier: null,
    errors: []
  };
  
  // Parse recipe fields if they're strings
  let requiredIngredients = recipe.required_ingredients;
  let requiredRunes = recipe.required_runes;
  let requiredStats = recipe.required_stats;
  
  if (typeof requiredIngredients === 'string') {
    try { requiredIngredients = JSON.parse(requiredIngredients); } catch (e) { requiredIngredients = []; }
  }
  if (typeof requiredRunes === 'string') {
    try { requiredRunes = JSON.parse(requiredRunes); } catch (e) { requiredRunes = []; }
  }
  if (typeof requiredStats === 'string') {
    try { requiredStats = JSON.parse(requiredStats); } catch (e) { requiredStats = null; }
  }
  
  // Get ingredients from slots
  const slotIngredients = runeSystem.getIngredientsFromSlots(slots);
  
  // Check ingredients
  result.ingredients = matchIngredients(requiredIngredients, slotIngredients, efficiencyModifier);
  if (!result.ingredients.matches) {
    result.matches = false;
    result.errors.push('Missing or insufficient ingredients');
  }
  
  // Check runes (SPEED and EFFICIENCY only)
  result.runes = matchRunes(requiredRunes, slots, recipe.allow_wildcard_runes);
  if (!result.runes.matches) {
    result.matches = false;
    result.errors.push('Missing required runes');
  }
  
  // Check stats
  result.stats = checkStatRequirements(requiredStats, playerStats);
  if (!result.stats.meets) {
    result.matches = false;
    result.errors.push('Insufficient stats');
  }
  
  // Check tier
  result.tier = checkTierRequirement(recipe.factory_tier_required, roomTier);
  if (!result.tier.meets) {
    result.matches = false;
    result.errors.push(`Factory tier ${result.tier.have} is below required tier ${result.tier.required}`);
  }
  
  return result;
}

/**
 * Find matching recipe from all available recipes
 * Returns the first matching recipe or null if none match.
 * 
 * @param {Array} recipes - Array of recipe objects
 * @param {Array} slots - Factory slots array
 * @param {Object} playerStats - Player stats object
 * @param {number} roomTier - Factory room tier
 * @param {number} efficiencyModifier - Efficiency modifier for ingredient reduction
 * @returns {Object|null} First matching recipe result or null
 */
function findMatchingRecipe(recipes, slots, playerStats, roomTier = 1, efficiencyModifier = 1.0) {
  if (!recipes || recipes.length === 0) {
    return null;
  }
  
  for (const recipe of recipes) {
    if (!recipe.active) continue;
    
    const result = matchSingleRecipe(recipe, slots, playerStats, roomTier, efficiencyModifier);
    if (result.matches) {
      return result;
    }
  }
  
  return null;
}

/**
 * Get match results for all recipes (for debugging/UI)
 * @param {Array} recipes - Array of recipe objects
 * @param {Array} slots - Factory slots array
 * @param {Object} playerStats - Player stats object
 * @param {number} roomTier - Factory room tier
 * @param {number} efficiencyModifier - Efficiency modifier for ingredient reduction
 * @returns {Array} Array of match results for each recipe
 */
function getAllRecipeMatches(recipes, slots, playerStats, roomTier = 1, efficiencyModifier = 1.0) {
  if (!recipes || recipes.length === 0) {
    return [];
  }
  
  return recipes.map(recipe => matchSingleRecipe(recipe, slots, playerStats, roomTier, efficiencyModifier));
}

/**
 * Calculate adjusted ingredient quantities based on efficiency
 * @param {Array} recipeIngredients - Recipe's required_ingredients
 * @param {number} efficiencyModifier - Efficiency modifier from rune system
 * @returns {Array} Adjusted ingredient requirements
 */
function calculateAdjustedIngredients(recipeIngredients, efficiencyModifier) {
  if (!recipeIngredients || efficiencyModifier >= 1.0) {
    return recipeIngredients;
  }
  
  let ingredients = recipeIngredients;
  if (typeof ingredients === 'string') {
    try { ingredients = JSON.parse(ingredients); } catch (e) { return recipeIngredients; }
  }
  
  return ingredients.map(ing => ({
    ...ing,
    quantity: Math.max(1, Math.ceil((ing.quantity || 1) * efficiencyModifier))
  }));
}

/**
 * Validate recipe doesn't contain PRODUCTION runes (design constraint)
 * @param {Array} requiredRunes - Recipe's required_runes array
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateRecipeRuneRequirements(requiredRunes) {
  if (!requiredRunes || requiredRunes.length === 0) {
    return { valid: true, error: null };
  }
  
  let runes = requiredRunes;
  if (typeof runes === 'string') {
    try { runes = JSON.parse(runes); } catch (e) { return { valid: true, error: null }; }
  }
  
  for (const runeType of runes) {
    if (runeType.toUpperCase() === 'PRODUCTION') {
      return {
        valid: false,
        error: 'Recipe incorrectly specifies PRODUCTION rune. PRODUCTION runes are a machine requirement, not a recipe requirement.'
      };
    }
    
    if (!['SPEED', 'EFFICIENCY'].includes(runeType.toUpperCase())) {
      return {
        valid: false,
        error: `Invalid rune type "${runeType}" in recipe. Only SPEED and EFFICIENCY are valid recipe rune requirements.`
      };
    }
  }
  
  return { valid: true, error: null };
}

module.exports = {
  // Core matching functions
  matchIngredients,
  matchRunes,
  checkStatRequirements,
  checkTierRequirement,
  
  // Recipe matching
  matchSingleRecipe,
  findMatchingRecipe,
  getAllRecipeMatches,
  
  // Utility functions
  calculateAdjustedIngredients,
  validateRecipeRuneRequirements
};



