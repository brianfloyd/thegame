/**
 * Harvest Formula Utilities
 * 
 * Calculates resonance-based bonuses for harvesting mechanics:
 * - Cycle time reduction: Higher resonance reduces time between item production cycles
 * - Hit rate: Higher resonance increases chance to successfully produce items each cycle
 * 
 * All formulas use an exponential curve that can be configured via the database.
 */

// Cache for formula configs to avoid repeated database queries
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60000; // 1 minute cache TTL

/**
 * Calculate a value using the exponential curve formula
 * 
 * Formula: value = minValue + (maxValue - minValue) * ((resonance - minResonance) / (maxResonance - minResonance))^exponent
 * 
 * @param {number} resonance - Player's resonance stat value
 * @param {object} config - Formula configuration object
 * @returns {number} Calculated value between minValue and maxValue
 */
function calculateExponentialCurve(resonance, config) {
  const { min_resonance, min_value, max_resonance, max_value, curve_exponent } = config;
  
  // Clamp resonance to valid range
  const clampedResonance = Math.max(min_resonance, Math.min(max_resonance, resonance));
  
  // Calculate normalized position (0 to 1)
  const range = max_resonance - min_resonance;
  if (range <= 0) return parseFloat(min_value);
  
  const normalized = (clampedResonance - min_resonance) / range;
  
  // Apply exponential curve
  const curvedNormalized = Math.pow(normalized, parseFloat(curve_exponent));
  
  // Calculate final value
  const minVal = parseFloat(min_value);
  const maxVal = parseFloat(max_value);
  const value = minVal + (maxVal - minVal) * curvedNormalized;
  
  return value;
}

/**
 * Calculate cycle time reduction based on player resonance
 * Returns the multiplier to apply to base cycle time (e.g., 0.75 means 75% of original time)
 * 
 * @param {number} resonance - Player's resonance stat value
 * @param {object} config - Cycle time reduction config from database
 * @returns {number} Cycle time multiplier (1 - reduction percentage)
 */
function calculateCycleTimeMultiplier(resonance, config) {
  const reduction = calculateExponentialCurve(resonance, config);
  // Return multiplier (1 - reduction), clamped to minimum of 0.1 (90% max reduction)
  return Math.max(0.1, 1 - reduction);
}

/**
 * Calculate hit rate based on player resonance
 * Returns the probability of successfully producing items (0 to 1)
 * 
 * @param {number} resonance - Player's resonance stat value
 * @param {object} config - Hit rate config from database
 * @returns {number} Hit rate probability (0 to 1)
 */
function calculateHitRate(resonance, config) {
  const hitRate = calculateExponentialCurve(resonance, config);
  // Clamp to valid probability range
  return Math.max(0, Math.min(1, hitRate));
}

/**
 * Calculate harvestable time multiplier based on player fortitude
 * Returns the multiplier to apply to base harvestable time (e.g., 1.05 means 5% increase)
 * 
 * @param {number} fortitude - Player's fortitude stat value
 * @param {object} config - Harvestable time increase config from database
 * @returns {number} Harvestable time multiplier (1.0 to max, e.g., 1.5 for 50% increase)
 */
function calculateHarvestableTimeMultiplier(fortitude, config) {
  const increase = calculateExponentialCurve(fortitude, config);
  // Return multiplier (1 + increase), e.g., 0.05 increase = 1.05 multiplier
  return 1 + increase;
}

/**
 * Check if a harvest attempt hits (produces items) based on hit rate
 * Uses enhanced randomness with entropy to prevent predictable patterns
 * 
 * @param {number} resonance - Player's resonance stat value
 * @param {object} config - Hit rate config from database
 * @returns {boolean} True if hit (produce items), false if miss
 */
function rollHarvestHit(resonance, config) {
  const hitRate = calculateHitRate(resonance, config);
  
  // Enhanced randomness: use high-resolution time for additional entropy
  // This prevents predictable patterns that can occur when cycles happen at regular intervals
  let timeEntropy = 0;
  try {
    // Use performance.now() for microsecond precision if available
    if (typeof performance !== 'undefined' && performance.now) {
      timeEntropy = (performance.now() % 1); // Fractional milliseconds
    } else {
      // Fallback to Date.now() with process.hrtime if available
      const now = Date.now();
      timeEntropy = (now % 1000) / 1000; // Fractional part of milliseconds
    }
  } catch (e) {
    // If performance API not available, just use Math.random()
  }
  
  // Generate multiple random numbers and combine them
  // This breaks any patterns that might occur with single Math.random() calls
  const r1 = Math.random();
  const r2 = Math.random();
  const r3 = Math.random();
  
  // Combine using a hash-like function to maintain good distribution
  // XOR the fractional parts to mix entropy
  const combined = ((r1 * 1000) ^ (r2 * 1000) ^ (r3 * 1000) ^ (timeEntropy * 1000)) % 1000 / 1000;
  
  // Final random value: mix combined hash with fresh random
  const roll = (combined + Math.random()) / 2;
  
  return roll < hitRate;
}

/**
 * Get harvest formula config from database (with caching)
 * 
 * @param {object} db - Database module
 * @param {string} configKey - Config key ('cycle_time_reduction' or 'hit_rate')
 * @returns {object|null} Config object or null if not found
 */
async function getHarvestFormulaConfig(db, configKey) {
  // Check cache
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache[configKey] || null;
  }
  
  // Reload cache
  await refreshConfigCache(db);
  return configCache ? (configCache[configKey] || null) : null;
}

/**
 * Get all harvest formula configs from database (with caching)
 * 
 * @param {object} db - Database module
 * @returns {object} Map of config_key -> config object
 */
async function getAllHarvestFormulaConfigs(db) {
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache;
  }
  
  await refreshConfigCache(db);
  return configCache || {};
}

/**
 * Refresh the config cache from database
 * 
 * @param {object} db - Database module
 */
async function refreshConfigCache(db) {
  try {
    const result = await db.query('SELECT * FROM harvest_formula_config');
    configCache = {};
    for (const row of result.rows) {
      configCache[row.config_key] = row;
    }
    configCacheTime = Date.now();
  } catch (err) {
    console.error('Error refreshing harvest formula config cache:', err);
    // Keep existing cache if refresh fails
  }
}

/**
 * Clear the config cache (call after updates)
 */
function clearConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

/**
 * Calculate effective cycle time for a harvest session
 * 
 * @param {number} baseCycleTime - Base cycle time in milliseconds
 * @param {number} resonance - Player's resonance stat value
 * @param {object} db - Database module
 * @returns {number} Effective cycle time in milliseconds
 */
async function calculateEffectiveCycleTime(baseCycleTime, resonance, db) {
  const config = await getHarvestFormulaConfig(db, 'cycle_time_reduction');
  if (!config) {
    // No config found, return base cycle time
    return baseCycleTime;
  }
  
  const multiplier = calculateCycleTimeMultiplier(resonance, config);
  return Math.round(baseCycleTime * multiplier);
}

/**
 * Check if harvest produces items this cycle
 * 
 * @param {number} resonance - Player's resonance stat value
 * @param {object} db - Database module
 * @returns {object} { hit: boolean, hitRate: number }
 */
async function checkHarvestHit(resonance, db) {
  const config = await getHarvestFormulaConfig(db, 'hit_rate');
  if (!config) {
    // No config found, always hit
    return { hit: true, hitRate: 1.0 };
  }
  
  const hitRate = calculateHitRate(resonance, config);
  const hit = rollHarvestHit(resonance, config);
  return { hit, hitRate };
}

/**
 * Calculate effective harvestable time for a harvest session
 * 
 * @param {number} baseHarvestableTime - Base harvestable time in milliseconds
 * @param {number} fortitude - Player's fortitude stat value
 * @param {object} db - Database module
 * @returns {number} Effective harvestable time in milliseconds
 */
async function calculateEffectiveHarvestableTime(baseHarvestableTime, fortitude, db) {
  const config = await getHarvestFormulaConfig(db, 'harvestable_time_increase');
  if (!config) {
    // No config found, return base harvestable time
    return baseHarvestableTime;
  }
  
  const multiplier = calculateHarvestableTimeMultiplier(fortitude, config);
  return Math.round(baseHarvestableTime * multiplier);
}

/**
 * Calculate Vitalis drain reduction based on average of fortitude and resonance stats
 * Uses exponential curve formula similar to cycle_time_reduction
 * 
 * @param {number} fortitude - Player's fortitude stat value
 * @param {number} resonance - Player's resonance stat value
 * @param {object} config - Vitalis drain reduction config from database
 * @returns {number} Reduction multiplier (0 to 1, where 1 = 100% reduction)
 */
function calculateVitalisDrainReduction(fortitude, resonance, config) {
  // Calculate average of fortitude and resonance
  const averageStat = (fortitude + resonance) / 2;
  
  // Use exponential curve with the average stat value
  const reduction = calculateExponentialCurve(averageStat, config);
  
  // Return reduction multiplier (0 to 1)
  return Math.max(0, Math.min(1, reduction));
}

/**
 * Apply Vitalis drain reduction to a base drain amount
 * Gets config from database and calculates reduced drain
 * 
 * @param {number} baseDrain - Base Vitalis drain amount (from NPC hit_vitalis or miss_vitalis)
 * @param {number} fortitude - Player's fortitude stat value
 * @param {number} resonance - Player's resonance stat value
 * @param {object} db - Database module
 * @returns {Promise<number>} Final drain amount after reduction (minimum 1)
 */
async function applyVitalisDrainReduction(baseDrain, fortitude, resonance, db) {
  // Get vitalis_drain_reduction config from database
  const config = await getHarvestFormulaConfig(db, 'vitalis_drain_reduction');
  
  if (!config) {
    // No config found, return base drain (no reduction)
    return Math.max(1, baseDrain);
  }
  
  // Calculate reduction using the new function
  const reduction = calculateVitalisDrainReduction(fortitude, resonance, config);
  
  // Apply reduction: finalDrain = baseDrain * (1 - reduction)
  // Minimum drain is always 1
  return Math.max(1, Math.floor(baseDrain * (1 - reduction)));
}

/**
 * Get a human-readable summary of the formula effects at different resonance levels
 * Useful for displaying in UI
 * 
 * @param {object} config - Formula config object
 * @param {number[]} samplePoints - Array of resonance values to calculate
 * @returns {object[]} Array of { resonance, value, percentage } objects
 */
function getFormulaSummary(config, samplePoints = [5, 25, 50, 75, 100]) {
  return samplePoints.map(resonance => {
    const value = calculateExponentialCurve(resonance, config);
    return {
      resonance,
      value: value.toFixed(4),
      percentage: (value * 100).toFixed(1) + '%'
    };
  });
}

module.exports = {
  calculateExponentialCurve,
  calculateCycleTimeMultiplier,
  calculateHitRate,
  rollHarvestHit,
  calculateHarvestableTimeMultiplier,
  getHarvestFormulaConfig,
  getAllHarvestFormulaConfigs,
  refreshConfigCache,
  clearConfigCache,
  calculateEffectiveCycleTime,
  calculateEffectiveHarvestableTime,
  checkHarvestHit,
  calculateVitalisDrainReduction,
  applyVitalisDrainReduction,
  getFormulaSummary
};

