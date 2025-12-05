/**
 * Vitalis Helper Functions
 * 
 * Handles Vitalis drain application during harvest cycles
 */

/**
 * Apply Vitalis drain to a player
 * Loads current vitalis, subtracts drain, persists, and returns new value
 * 
 * @param {object} db - Database module
 * @param {number} playerId - Player ID
 * @param {number} drainAmount - Amount of Vitalis to drain
 * @returns {Promise<number>} New vitalis value after drain
 */
async function applyVitalisDrain(db, playerId, drainAmount) {
  const player = await db.getPlayerById(playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }
  
  const currentVitalis = player.resource_vitalis || 0;
  const newVitalis = Math.max(0, currentVitalis - drainAmount);
  
  await db.updatePlayerVitalis(playerId, newVitalis);
  return newVitalis;
}

/**
 * Check if player's Vitalis has been depleted
 * 
 * @param {number} newVitalis - Current vitalis value after drain
 * @returns {boolean} True if vitalis <= 0
 */
function checkVitalisDepletion(newVitalis) {
  return newVitalis <= 0;
}

module.exports = {
  applyVitalisDrain,
  checkVitalisDepletion
};


