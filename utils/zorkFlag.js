/**
 * ZORK Flag Management
 * 
 * Manages a file-based flag to control whether ZORK AI should be enabled or disabled.
 * This flag is checked by:
 * - dev-with-mcp.js (before starting ZORK)
 * - zork-ai-agent.cjs (before connecting/reconnecting)
 */

const fs = require('fs');
const path = require('path');

const FLAG_FILE = path.join(__dirname, '..', '.zork-enabled');

/**
 * Check if ZORK is enabled
 * @returns {boolean} True if ZORK should be active, false otherwise
 */
function isZorkEnabled() {
  try {
    // If flag file exists, ZORK is enabled
    return fs.existsSync(FLAG_FILE);
  } catch (error) {
    console.error('[ZORK Flag] Error checking flag:', error);
    // Default to disabled if we can't check
    return false;
  }
}

/**
 * Enable ZORK (create flag file)
 */
function enableZork() {
  try {
    // Create flag file
    fs.writeFileSync(FLAG_FILE, 'enabled', 'utf8');
    console.log('[ZORK Flag] ZORK enabled');
    return true;
  } catch (error) {
    console.error('[ZORK Flag] Error enabling ZORK:', error);
    return false;
  }
}

/**
 * Disable ZORK (remove flag file)
 */
function disableZork() {
  try {
    // Remove flag file if it exists
    if (fs.existsSync(FLAG_FILE)) {
      fs.unlinkSync(FLAG_FILE);
      console.log('[ZORK Flag] ZORK disabled');
    }
    return true;
  } catch (error) {
    console.error('[ZORK Flag] Error disabling ZORK:', error);
    return false;
  }
}

/**
 * Toggle ZORK state
 * @returns {boolean} New state (true if enabled, false if disabled)
 */
function toggleZork() {
  if (isZorkEnabled()) {
    disableZork();
    return false;
  } else {
    enableZork();
    return true;
  }
}

module.exports = {
  isZorkEnabled,
  enableZork,
  disableZork,
  toggleZork
};

