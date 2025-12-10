/**
 * Factory Crafting System Configuration
 * 
 * Contains all configurable parameters for the factory crafting system including:
 * - Stat scale constants
 * - Rune modifier values
 * - Success/failure formulas
 * - Critical hit calculations
 * - Default values and caps
 */

module.exports = {
  // ============================================================
  // Stat Scale Constants
  // These determine how much each stat contributes to crafting success
  // ============================================================
  
  STAT_SCALES: {
    // Each point of ingenuity adds this much to success rate calculation
    INGENUITY_SCALE: 0.5,
    // Each point of resonance adds this much to success rate calculation
    RESONANCE_SCALE: 0.5,
    // Each point of acumen adds this much to success rate calculation
    ACUMEN_SCALE: 0.3
  },
  
  // Stat weights in success formula (should sum to 1.0)
  STAT_WEIGHTS: {
    INGENUITY_WEIGHT: 0.40,  // 40% of stat factor
    RESONANCE_WEIGHT: 0.40,  // 40% of stat factor
    ACUMEN_WEIGHT: 0.20     // 20% of stat factor
  },
  
  // ============================================================
  // Critical Hit Configuration
  // ============================================================
  
  CRIT: {
    // Base critical hit chance (percentage)
    BASE_CRIT_CHANCE: 5.0,
    // Each point of resonance adds this much crit chance
    RESONANCE_CRIT_SCALE: 0.02,
    // Each point of acumen adds this much crit chance
    ACUMEN_CRIT_SCALE: 0.015,
    // Maximum crit chance (cap)
    MAX_CRIT_CHANCE: 25.0,
    // Crit bonus multiplier (1.5 = 50% bonus output)
    CRIT_OUTPUT_MULTIPLIER: 1.5
  },
  
  // ============================================================
  // Rune Modifier Configuration
  // ============================================================
  
  RUNE_MODIFIERS: {
    // Speed rune reduces crafting time by this fraction (0.2 = 20% faster)
    SPEED_RUNE_SCALAR: 0.20,
    // Stat contribution to speed modifier per point of resonance
    STAT_SPEED_SCALAR: 0.01,
    // Maximum speed reduction (0.7 = cannot reduce time below 30%)
    MAX_SPEED_REDUCTION: 0.70,
    
    // Efficiency rune reduces ingredient consumption by this fraction (0.15 = 15% fewer ingredients)
    EFFICIENCY_RUNE_SCALAR: 0.15,
    // Stat contribution to efficiency per point of ingenuity
    STAT_EFFICIENCY_SCALAR: 0.01,
    // Maximum efficiency reduction (0.5 = cannot reduce ingredients below 50%)
    MAX_EFFICIENCY_REDUCTION: 0.50,
    
    // Diminishing returns multipliers for stacking runes
    // Applied when multiple runes of same type would theoretically stack
    // Currently only one rune per slot is allowed, so this is future-proofing
    DIMINISHING_RETURNS: [1.0, 0.8, 0.6]
  },
  
  // ============================================================
  // Success Rate Configuration
  // ============================================================
  
  SUCCESS: {
    // Maximum success rate cap (95% = always 5% failure chance minimum)
    MAX_SUCCESS_RATE: 95.0,
    // Minimum success rate floor (5% = always 5% success chance minimum)
    MIN_SUCCESS_RATE: 5.0,
    
    // Overcharge bonus: bonus per exceeded stat threshold
    // If player's stat exceeds recipe's required_stats by threshold, they get bonus
    OVERCHARGE_BONUS_PER_THRESHOLD: 2.0,  // +2% per exceeded threshold
    OVERCHARGE_THRESHOLD_AMOUNT: 5  // Stat must exceed requirement by this much per bonus
  },
  
  // ============================================================
  // Factory Quirk Modifiers
  // ============================================================
  
  QUIRKS: {
    stable: {
      description: 'Stable factory - more reliable but slower',
      successBonus: 0.10,      // +10% success rate
      speedPenalty: 0.15       // -15% speed (takes longer)
    },
    chaotic: {
      description: 'Chaotic factory - faster but riskier',
      successPenalty: 0.10,   // -10% success rate
      speedBonus: 0.20        // +20% speed (faster)
    },
    attuned: {
      description: 'Attuned factory - runes are more effective',
      runeBonusMultiplier: 2.0  // 2x rune effectiveness
    },
    worn: {
      description: 'Worn factory - may produce less output',
      outputReductionChance: 0.10,  // 10% chance to trigger
      outputReductionAmount: 0.50   // Reduce output by 50% when triggered
    }
  },
  
  // ============================================================
  // Slot Configuration
  // IMPORTANT: Fixed semantic slots with NO cross-slot flexibility
  // ============================================================
  
  SLOTS: {
    // Ingredient slots (accept ingredient items ONLY)
    INGREDIENT_SLOTS: [0, 1],
    // Production rune slot (MUST contain PRODUCTION rune)
    PRODUCTION_RUNE_SLOT: 2,
    // Speed rune slot (SPEED runes ONLY)
    SPEED_RUNE_SLOT: 3,
    // Efficiency rune slot (EFFICIENCY runes ONLY)
    EFFICIENCY_RUNE_SLOT: 4,
    // Total number of slots
    TOTAL_SLOTS: 5,
    
    // Slot type mapping for validation
    SLOT_TYPES: {
      0: 'ingredient',
      1: 'ingredient',
      2: 'production_rune',
      3: 'speed_rune',
      4: 'efficiency_rune'
    },
    
    // Valid rune types per slot
    VALID_RUNE_TYPES_PER_SLOT: {
      2: ['PRODUCTION'],
      3: ['SPEED'],
      4: ['EFFICIENCY']
    }
  },
  
  // ============================================================
  // Factory Tier Configuration
  // ============================================================
  
  TIERS: {
    // Minimum tier level
    MIN_TIER: 1,
    // Maximum tier level
    MAX_TIER: 5,
    // Default tier for new factories
    DEFAULT_TIER: 1
  },
  
  // ============================================================
  // Crafting Time Configuration
  // ============================================================
  
  TIMING: {
    // Default crafting time in milliseconds
    DEFAULT_CRAFT_TIME_MS: 5000,
    // Minimum crafting time (even with max speed bonuses)
    MIN_CRAFT_TIME_MS: 1000,
    // Progress update interval for UI
    PROGRESS_UPDATE_INTERVAL_MS: 100
  },
  
  // ============================================================
  // Failure Recovery Configuration
  // ============================================================
  
  FAILURE: {
    // Default fraction of ingredients returned on failure
    DEFAULT_RETURN_RATE: 0.50,
    // Runes are consumed on failure (not returned)
    RUNES_CONSUMED_ON_FAILURE: true,
    // Ingredients in slots after failure (cleared)
    CLEAR_INGREDIENT_SLOTS_ON_FAILURE: true
  },
  
  // ============================================================
  // Output Routing Configuration
  // ============================================================
  
  OUTPUT: {
    // Priority order for output routing
    // 'inventory' = try player inventory first
    // 'floor' = drop to room floor
    ROUTING_PRIORITY: ['inventory', 'floor'],
    // What happens if inventory is full
    OVERFLOW_TO_FLOOR: true
  }
};

