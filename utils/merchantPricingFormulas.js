/**
 * Merchant Pricing Formulas
 * 
 * Calculates final prices for merchant items based on:
 * - Base price from merchant_items
 * - Player acumen stat
 * - Global formula (merchant_pricing_formula_config)
 * - Room-specific formula override (merchant_room_formula_overrides)
 * 
 * Formula: finalPrice = basePrice * baseMultiplier * (1.0 - min(acumen * acumenMultiplier, maxDiscount))
 */

const db = require('../database');

/**
 * Get pricing formula for a room (global + room override if exists)
 * @param {number} roomId - Room ID
 * @returns {Promise<Object>} Formula config: { baseMultiplier, acumenMultiplier, maxDiscount }
 */
async function getPricingFormula(roomId) {
  // Get global formula
  const globalFormula = await db.query(
    `SELECT config_value FROM merchant_pricing_formula_config WHERE config_key = 'global'`
  );
  
  let formula = {
    baseMultiplier: 1.0,
    acumenMultiplier: 0.01,
    maxDiscount: 0.5
  };
  
  if (globalFormula.rows.length > 0 && globalFormula.rows[0].config_value) {
    const config = globalFormula.rows[0].config_value;
    formula = {
      baseMultiplier: config.baseMultiplier || 1.0,
      acumenMultiplier: config.acumenMultiplier || 0.01,
      maxDiscount: config.maxDiscount || 0.5
    };
  }
  
  // Check for room-specific override
  const roomOverride = await db.getMerchantFormulaOverride(roomId);
  
  if (roomOverride && roomOverride.active && roomOverride.formula_config) {
    // Merge room override with global (room override takes precedence)
    const override = roomOverride.formula_config;
    formula = {
      baseMultiplier: override.baseMultiplier ?? formula.baseMultiplier,
      acumenMultiplier: override.acumenMultiplier ?? formula.acumenMultiplier,
      maxDiscount: override.maxDiscount ?? formula.maxDiscount
    };
  }
  
  return formula;
}

/**
 * Calculate final price with acumen discount
 * @param {number} basePrice - Base price from merchant_items
 * @param {number} playerAcumen - Player's acumen stat
 * @param {Object} formula - Formula config from getPricingFormula()
 * @returns {number} Final price (integer, rounded)
 */
function calculatePrice(basePrice, playerAcumen, formula) {
  if (!formula) {
    return basePrice;
  }
  
  // Calculate discount: min(acumen * acumenMultiplier, maxDiscount)
  const discount = Math.min(
    playerAcumen * (formula.acumenMultiplier || 0.01),
    formula.maxDiscount || 0.5
  );
  
  // Apply base multiplier and discount
  const finalPrice = basePrice * (formula.baseMultiplier || 1.0) * (1.0 - discount);
  
  // Round to integer (prices are stored as integers)
  return Math.max(1, Math.round(finalPrice)); // Ensure price is at least 1
}

/**
 * Get pricing formula and calculate price in one call
 * @param {number} basePrice - Base price from merchant_items
 * @param {number} playerAcumen - Player's acumen stat
 * @param {number} roomId - Room ID
 * @returns {Promise<number>} Final price
 */
async function calculatePriceForRoom(basePrice, playerAcumen, roomId) {
  const formula = await getPricingFormula(roomId);
  return calculatePrice(basePrice, playerAcumen, formula);
}

module.exports = {
  getPricingFormula,
  calculatePrice,
  calculatePriceForRoom
};

