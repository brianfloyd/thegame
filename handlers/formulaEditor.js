/**
 * Formula Editor Handlers
 * 
 * Handles WebSocket messages for the global formula editor.
 */

/**
 * Get all formula configurations
 */
async function getAllFormulas(ctx, data) {
  const { ws, db } = ctx;
  
  try {
    const formulas = await db.getAllHarvestFormulaConfigs();
    ws.send(JSON.stringify({
      type: 'formulaList',
      formulas
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get formulas: ' + err.message }));
  }
}

/**
 * Update a formula configuration
 */
async function updateFormula(ctx, data) {
  const { ws, db } = ctx;
  const { formula } = data;
  
  if (!formula || !formula.config_key) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid formula data' }));
    return;
  }
  
  try {
    const { clearConfigCache } = require('../utils/harvestFormulas');
    
    const updated = await db.updateHarvestFormulaConfig(formula.config_key, {
      min_resonance: formula.min_resonance,
      min_value: formula.min_value,
      max_resonance: formula.max_resonance,
      max_value: formula.max_value,
      curve_exponent: formula.curve_exponent,
      description: formula.description
    });
    
    // Clear the cache so new values take effect immediately
    clearConfigCache();
    
    // If this is the room update interval config, update the global default
    if (formula.config_key === 'room_update_interval_ms') {
      const { setGlobalRoomUpdateInterval } = require('../services/npcCycleEngine');
      const interval = formula.min_value || formula.min_resonance || 30000;
      setGlobalRoomUpdateInterval(interval);
      console.log(`[FormulaEditor] Updated global room update interval to ${interval}ms`);
    }
    
    ws.send(JSON.stringify({
      type: 'formulaUpdated',
      formula: updated
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update formula: ' + err.message }));
  }
}

module.exports = {
  getAllFormulas,
  updateFormula
};


