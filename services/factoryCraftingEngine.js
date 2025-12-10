/**
 * Factory Crafting Engine Service
 * 
 * Handles success rate calculations, critical hit chances, overcharge bonuses,
 * and craft roll execution for the factory crafting system.
 */

const config = require('../config/factoryConfig');
const quirksSystem = require('./factoryQuirks');
const runeSystem = require('./factoryRuneSystem');
const recipeMatcher = require('./factoryRecipeMatcher');

/**
 * Calculate the stat factor contribution to success rate
 * Formula: ((ingenuity * scale) * weight) + ((resonance * scale) * weight) + ((acumen * scale) * weight)
 * 
 * @param {Object} playerStats - Player stats object
 * @returns {number} Stat factor contribution (percentage points)
 */
function calculateStatFactor(playerStats) {
  const scales = config.STAT_SCALES;
  const weights = config.STAT_WEIGHTS;
  
  const ingenuity = playerStats?.stat_ingenuity || 0;
  const resonance = playerStats?.stat_resonance || 0;
  const acumen = playerStats?.stat_acumen || 0;
  
  const ingenuityContribution = (ingenuity * scales.INGENUITY_SCALE) * weights.INGENUITY_WEIGHT;
  const resonanceContribution = (resonance * scales.RESONANCE_SCALE) * weights.RESONANCE_WEIGHT;
  const acumenContribution = (acumen * scales.ACUMEN_SCALE) * weights.ACUMEN_WEIGHT;
  
  return ingenuityContribution + resonanceContribution + acumenContribution;
}

/**
 * Calculate overcharge bonus from stats exceeding requirements
 * @param {Object} recipe - Recipe with required_stats
 * @param {Object} playerStats - Player stats object
 * @returns {number} Overcharge bonus (percentage points)
 */
function calculateOverchargeBonus(recipe, playerStats) {
  if (!recipe.required_stats) return 0;
  
  const statResult = recipeMatcher.checkStatRequirements(recipe.required_stats, playerStats);
  return statResult.overcharge || 0;
}

/**
 * Calculate the final success rate for a crafting attempt
 * 
 * Formula:
 * finalRate = clamp(baseRate + statFactor + overcharge + quirkModifier, MIN, MAX)
 * 
 * @param {Object} recipe - Recipe object with success_rate and required_stats
 * @param {Object} playerStats - Player stats object
 * @param {Object|null} quirk - Factory quirk from quirksSystem.getFactoryQuirk
 * @returns {Object} { rate: number, breakdown: Object }
 */
function calculateSuccessRate(recipe, playerStats, quirk = null) {
  const successConfig = config.SUCCESS;
  
  // Base success rate from recipe (percentage)
  const baseRate = parseFloat(recipe.success_rate) || 70.0;
  
  // Stat factor contribution
  const statFactor = calculateStatFactor(playerStats);
  
  // Overcharge bonus from exceeding stat requirements
  const overchargeBonus = calculateOverchargeBonus(recipe, playerStats);
  
  // Quirk modifier (applied by quirks system)
  let quirkModifier = 0;
  if (quirk) {
    if (quirk.type === 'stable') {
      quirkModifier = (quirk.effects?.successBonus || config.QUIRKS.stable.successBonus) * 100;
    } else if (quirk.type === 'chaotic') {
      quirkModifier = -(quirk.effects?.successPenalty || config.QUIRKS.chaotic.successPenalty) * 100;
    }
  }
  
  // Calculate final rate
  let finalRate = baseRate + statFactor + overchargeBonus + quirkModifier;
  
  // Clamp to valid range
  finalRate = Math.max(successConfig.MIN_SUCCESS_RATE, Math.min(successConfig.MAX_SUCCESS_RATE, finalRate));
  
  return {
    rate: finalRate,
    breakdown: {
      base: baseRate,
      statFactor: statFactor,
      overchargeBonus: overchargeBonus,
      quirkModifier: quirkModifier,
      quirkType: quirk?.type || null,
      final: finalRate,
      capped: finalRate >= successConfig.MAX_SUCCESS_RATE || finalRate <= successConfig.MIN_SUCCESS_RATE
    }
  };
}

/**
 * Calculate critical hit chance
 * 
 * Formula:
 * critChance = clamp(baseCrit + (resonance * resonanceScale) + (acumen * acumenScale), 0, MAX)
 * 
 * @param {Object} playerStats - Player stats object
 * @returns {Object} { chance: number, breakdown: Object }
 */
function calculateCriticalChance(playerStats) {
  const critConfig = config.CRIT;
  
  const resonance = playerStats?.stat_resonance || 0;
  const acumen = playerStats?.stat_acumen || 0;
  
  const baseCrit = critConfig.BASE_CRIT_CHANCE;
  const resonanceBonus = resonance * critConfig.RESONANCE_CRIT_SCALE;
  const acumenBonus = acumen * critConfig.ACUMEN_CRIT_SCALE;
  
  let totalChance = baseCrit + resonanceBonus + acumenBonus;
  
  // Cap at maximum
  const cappedChance = Math.min(critConfig.MAX_CRIT_CHANCE, Math.max(0, totalChance));
  
  return {
    chance: cappedChance,
    breakdown: {
      base: baseCrit,
      resonanceBonus: resonanceBonus,
      acumenBonus: acumenBonus,
      total: totalChance,
      capped: cappedChance,
      maxCrit: critConfig.MAX_CRIT_CHANCE
    }
  };
}

/**
 * Execute a craft roll to determine success/failure and critical
 * @param {number} successRate - Success rate percentage (0-100)
 * @param {number} critChance - Critical chance percentage (0-100)
 * @returns {Object} { success: boolean, critical: boolean, rolls: Object }
 */
function rollCraft(successRate, critChance) {
  // Roll for success
  const successRoll = Math.random() * 100;
  const success = successRoll <= successRate;
  
  // Roll for critical (only if successful)
  let critical = false;
  let critRoll = null;
  
  if (success) {
    critRoll = Math.random() * 100;
    critical = critRoll <= critChance;
  }
  
  return {
    success,
    critical,
    rolls: {
      successRoll: successRoll.toFixed(2),
      successThreshold: successRate.toFixed(2),
      critRoll: critRoll !== null ? critRoll.toFixed(2) : null,
      critThreshold: critChance.toFixed(2)
    }
  };
}

/**
 * Calculate final craft time with all modifiers applied
 * @param {Object} recipe - Recipe with crafting_time_ms
 * @param {Array} slots - Factory slots array
 * @param {Object} playerStats - Player stats
 * @param {Object|null} quirk - Factory quirk
 * @returns {Object} { timeMs: number, breakdown: Object }
 */
function calculateCraftTime(recipe, slots, playerStats, quirk = null) {
  const baseTime = recipe.crafting_time_ms || config.TIMING.DEFAULT_CRAFT_TIME_MS;
  
  // Get speed rune modifier
  const speedRune = runeSystem.getSpeedRune(slots);
  const speedModifier = runeSystem.calculateSpeedModifier(speedRune, playerStats, quirk);
  
  // Apply to base time
  let modifiedTime = Math.floor(baseTime * speedModifier);
  
  // Apply quirk time modifier (stable/chaotic already affects speed modifier, but apply direct time changes here)
  if (quirk) {
    modifiedTime = quirksSystem.applyQuirkToSpeed(modifiedTime, quirk);
  }
  
  // Enforce minimum
  const finalTime = Math.max(config.TIMING.MIN_CRAFT_TIME_MS, modifiedTime);
  
  return {
    timeMs: finalTime,
    breakdown: {
      base: baseTime,
      speedModifier: speedModifier,
      hasSpeedRune: !!speedRune,
      quirkApplied: quirk?.type || null,
      final: finalTime
    }
  };
}

/**
 * Calculate output quantities with critical bonus and quirk effects
 * @param {Array} outputItems - Recipe's output_items array
 * @param {boolean} critical - Whether this was a critical success
 * @param {Object|null} quirk - Factory quirk
 * @returns {Object} { items: Array, wornTriggered: boolean }
 */
function calculateOutputQuantities(outputItems, critical, quirk = null) {
  let items = outputItems;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch (e) { items = []; }
  }
  
  if (!items || items.length === 0) {
    return { items: [], wornTriggered: false };
  }
  
  const critMultiplier = critical ? config.CRIT.CRIT_OUTPUT_MULTIPLIER : 1.0;
  let wornTriggered = false;
  
  const calculatedItems = items.map(item => {
    let quantity = (item.quantity || 1);
    
    // Apply critical multiplier (round down)
    quantity = Math.floor(quantity * critMultiplier);
    
    // Apply worn quirk (if applicable)
    if (quirk && quirk.type === 'worn') {
      const wornResult = quirksSystem.applyWornOutputReduction(quantity, quirk);
      quantity = wornResult.quantity;
      if (wornResult.reduced) wornTriggered = true;
    }
    
    // Ensure at least 1
    quantity = Math.max(1, quantity);
    
    return {
      ...item,
      quantity,
      originalQuantity: item.quantity || 1
    };
  });
  
  return {
    items: calculatedItems,
    wornTriggered
  };
}

/**
 * Calculate byproducts (additional items that may be produced)
 * @param {Array} byproducts - Recipe's byproducts array
 * @returns {Array} Items that were produced as byproducts
 */
function rollByproducts(byproducts) {
  if (!byproducts) return [];
  
  let items = byproducts;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch (e) { return []; }
  }
  
  if (!items || items.length === 0) return [];
  
  const produced = [];
  
  for (const byproduct of items) {
    const chance = parseFloat(byproduct.chance) || 0;
    const roll = Math.random();
    
    if (roll <= chance) {
      produced.push({
        item_name: byproduct.item_name || byproduct.itemName,
        item_id: byproduct.item_id,
        quantity: byproduct.quantity || 1,
        rolled: roll.toFixed(3),
        threshold: chance.toFixed(3)
      });
    }
  }
  
  return produced;
}

/**
 * Calculate ingredients to return on failure
 * @param {Array} consumedIngredients - Ingredients that were consumed from slots
 * @param {number} returnRate - Fraction of ingredients to return (0-1)
 * @returns {Array} Ingredients to return to player
 */
function calculateReturnedIngredients(consumedIngredients, returnRate) {
  if (!consumedIngredients || consumedIngredients.length === 0) return [];
  if (returnRate <= 0) return [];
  
  return consumedIngredients.map(ing => ({
    itemName: ing.itemName || ing.item_name,
    quantity: Math.floor((ing.quantity || 1) * returnRate)
  })).filter(ing => ing.quantity > 0);
}

/**
 * Execute a complete craft cycle
 * This is the main entry point for crafting execution.
 * 
 * @param {Object} params - Crafting parameters
 * @param {Object} params.recipe - Matched recipe
 * @param {Array} params.slots - Factory slots array
 * @param {Object} params.playerStats - Player stats
 * @param {Object|null} params.quirk - Factory quirk
 * @param {Object} params.matchResult - Result from recipe matcher
 * @returns {Object} Complete craft execution result
 */
function executeCraft(params) {
  const { recipe, slots, playerStats, quirk, matchResult } = params;
  
  // Calculate success rate
  const successResult = calculateSuccessRate(recipe, playerStats, quirk);
  
  // Calculate critical chance
  const critResult = calculateCriticalChance(playerStats);
  
  // Calculate craft time
  const timeResult = calculateCraftTime(recipe, slots, playerStats, quirk);
  
  // Roll for success and critical
  const rollResult = rollCraft(successResult.rate, critResult.chance);
  
  // Prepare result object
  const result = {
    recipeName: recipe.name,
    recipeId: recipe.recipe_id,
    success: rollResult.success,
    critical: rollResult.critical,
    craftTimeMs: timeResult.timeMs,
    
    // Detailed calculations
    successRate: successResult,
    critChance: critResult,
    craftTime: timeResult,
    rollDetails: rollResult.rolls,
    
    // Output (calculated after determining success/critical)
    outputs: { items: [], byproducts: [], wornTriggered: false },
    returnedIngredients: [],
    
    // Metadata
    quirkApplied: quirk?.type || null,
    timestamp: Date.now()
  };
  
  if (rollResult.success) {
    // Calculate outputs with critical bonus
    const outputResult = calculateOutputQuantities(recipe.output_items, rollResult.critical, quirk);
    result.outputs.items = outputResult.items;
    result.outputs.wornTriggered = outputResult.wornTriggered;
    
    // Roll for byproducts
    result.outputs.byproducts = rollByproducts(recipe.byproducts);
    
    // Success message
    if (rollResult.critical) {
      result.message = `Critical success! Crafted ${recipe.name} with bonus output.`;
    } else {
      result.message = `Successfully crafted ${recipe.name}.`;
    }
  } else {
    // Calculate returned ingredients
    const returnRate = parseFloat(recipe.return_rate_on_fail) || config.FAILURE.DEFAULT_RETURN_RATE;
    const consumedIngredients = matchResult?.ingredients?.details || [];
    result.returnedIngredients = calculateReturnedIngredients(consumedIngredients, returnRate);
    
    // Failure message
    result.message = `Crafting failed. ${Math.floor(returnRate * 100)}% of ingredients returned.`;
  }
  
  return result;
}

/**
 * Get a preview of crafting chances without executing
 * @param {Object} recipe - Recipe object
 * @param {Array} slots - Factory slots
 * @param {Object} playerStats - Player stats
 * @param {Object|null} quirk - Factory quirk
 * @returns {Object} Preview of success rate, crit chance, and craft time
 */
function getCraftPreview(recipe, slots, playerStats, quirk = null) {
  const successResult = calculateSuccessRate(recipe, playerStats, quirk);
  const critResult = calculateCriticalChance(playerStats);
  const timeResult = calculateCraftTime(recipe, slots, playerStats, quirk);
  
  return {
    recipeName: recipe.name,
    successRate: successResult.rate.toFixed(1) + '%',
    critChance: critResult.chance.toFixed(1) + '%',
    craftTimeMs: timeResult.timeMs,
    craftTimeSeconds: (timeResult.timeMs / 1000).toFixed(1),
    
    // Detailed breakdowns for UI
    breakdown: {
      success: successResult.breakdown,
      crit: critResult.breakdown,
      time: timeResult.breakdown
    }
  };
}

module.exports = {
  // Core calculation functions
  calculateStatFactor,
  calculateOverchargeBonus,
  calculateSuccessRate,
  calculateCriticalChance,
  calculateCraftTime,
  calculateOutputQuantities,
  calculateReturnedIngredients,
  
  // Roll functions
  rollCraft,
  rollByproducts,
  
  // Main execution
  executeCraft,
  getCraftPreview
};




