/**
 * NPC Cycle Engine
 * 
 * Handles NPC tick loops, harvest sessions, and periodic room updates.
 * Runs independently of player actions, processing NPC cycles on timer.
 */

const WebSocket = require('ws');
const { 
  calculateCycleTimeMultiplier, 
  checkHarvestHit, 
  getHarvestFormulaConfig 
} = require('../utils/harvestFormulas');
const messageCache = require('../utils/messageCache');
const { sendMessage } = require('../utils/messageRouter');

// NPC Cycle Engine Configuration
const NPC_TICK_INTERVAL = 1000; // milliseconds (configurable)

// Commands that do NOT interrupt an active harvest session
const HARVEST_SAFE_COMMANDS = [
  'inventory', 'inv', 'i',
  'look', 'l',
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'up', 'down',
  'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
  'move', // movement command type
  'saveterminalmessage' // client auto-sends this when displaying messages, should not interrupt harvest
];

/**
 * End a harvest session on an NPC
 * @param {object} db - Database module
 * @param {number} roomNpcId - Room NPC placement ID
 * @param {boolean} startCooldown - Whether to start cooldown timer
 * @returns {object} Updated NPC state
 */
async function endHarvestSession(db, roomNpcId, startCooldown = true) {
  const roomNpcResult = await db.query('SELECT * FROM room_npcs WHERE id = $1', [roomNpcId]);
  const roomNpc = roomNpcResult.rows[0];
  if (!roomNpc) return;
  
  // Get NPC definition for cooldown time
  const npcDef = await db.getScriptableNPCById(roomNpc.npc_id);
  const baseCooldownTime = npcDef ? (npcDef.cooldown_time || 120000) : 120000;
  
  let state = {};
  try {
    state = roomNpc.state ? JSON.parse(roomNpc.state) : {};
  } catch (e) {
    state = {};
  }
  
  // Only end harvest if it's actually active (prevent accidental ending)
  if (!state.harvest_active) {
    return state;
  }
  
  // CRITICAL: Check if harvest just started (less than 2 seconds ago)
  // This prevents race conditions where endHarvestSession is called immediately after harvest starts
  if (state.harvest_start_time && typeof state.harvest_start_time === 'number') {
    const harvestAge = Date.now() - state.harvest_start_time;
    if (harvestAge < 2000) { // 2 second grace period
      // Silently block - don't log to prevent spam
      return state; // Don't end harvest if it just started
    }
  }
  
  console.log(`[endHarvestSession] Ending harvest for room_npc ${roomNpcId}, startCooldown=${startCooldown}`);
  
  // Calculate effective cooldown time based on fortitude (if enabled)
  let effectiveCooldownTime = baseCooldownTime;
  if (startCooldown && npcDef && npcDef.enable_fortitude_bonuses !== false && state.harvesting_player_fortitude) {
    try {
      const { calculateCycleTimeMultiplier, getHarvestFormulaConfig } = require('../utils/harvestFormulas');
      const cooldownConfig = await getHarvestFormulaConfig(db, 'cooldown_time_reduction');
      if (cooldownConfig) {
        // Use the same multiplier calculation (but for fortitude instead of resonance)
        const multiplier = calculateCycleTimeMultiplier(state.harvesting_player_fortitude, cooldownConfig);
        effectiveCooldownTime = Math.round(baseCooldownTime * multiplier);
        console.log(`[endHarvestSession] Cooldown reduction applied: base=${baseCooldownTime}ms, effective=${effectiveCooldownTime}ms, fortitude=${state.harvesting_player_fortitude}`);
      }
    } catch (err) {
      console.error(`[endHarvestSession] Error calculating cooldown reduction:`, err);
    }
  }
  
  state.harvest_active = false;
  state.harvesting_player_id = null;
  state.harvest_start_time = null;
  state.last_harvest_item_production = null; // Clear harvest item production tracking
  if (startCooldown) {
    state.cooldown_until = Date.now() + effectiveCooldownTime;
  }
  
  await db.updateNPCState(roomNpcId, state, roomNpc.last_cycle_run);
  return state;
}

/**
 * Find active harvest session for a player
 * @param {object} db - Database module
 * @param {number} playerId - Player ID
 * @returns {object|null} Harvest session info or null
 */
async function findPlayerHarvestSession(db, playerId) {
  // Find any room_npc where this player has an active harvest
  const result = await db.query(`
    SELECT rn.*, sn.name as npc_name, sn.npc_type 
    FROM room_npcs rn 
    JOIN scriptable_npcs sn ON rn.npc_id = sn.id 
    WHERE rn.active = TRUE AND sn.npc_type = 'rhythm'
  `);
  const rhythmNpcs = result.rows;
  
  for (const npc of rhythmNpcs) {
    let state = {};
    try {
      state = npc.state ? JSON.parse(npc.state) : {};
    } catch (e) {
      state = {};
    }
    if (state.harvest_active && state.harvesting_player_id === playerId) {
      return { roomNpcId: npc.id, npcName: npc.npc_name, state };
    }
  }
  return null;
}

/**
 * Check if a command type is safe during harvest (won't interrupt it)
 * @param {string} cmdType - Command type to check
 * @returns {boolean} True if safe
 */
function isHarvestSafeCommand(cmdType) {
  return HARVEST_SAFE_COMMANDS.includes(cmdType.toLowerCase());
}

/**
 * Get all players in a specific room (helper function for message sending)
 * @param {Map} connectedPlayers - Connected players map
 * @param {number} roomId - Room ID to check
 * @returns {Array} Array of {connId, playerData} objects for players in the room
 */
function getPlayersInRoom(connectedPlayers, roomId) {
  const players = [];
  
  // CRITICAL: Always use module-level reference as single source of truth
  // The passed-in reference might be stale, so we always use the module-level one
  const playersMap = getConnectedPlayersReference();
  
  if (!playersMap) {
    // Error already logged in getConnectedPlayersReference
    return players;
  }
  
  if (!roomId || typeof roomId !== 'number') {
    console.error(`[NPC Cycle] ERROR: Invalid roomId: ${roomId} (type: ${typeof roomId})`);
    return players;
  }
  
  // Iterate through connected players with proper error handling
  try {
    playersMap.forEach((playerData, connId) => {
      // Validate playerData structure
      if (!playerData) {
        return; // Skip null/undefined entries
      }
      
      // Check if player is in the target room (handle both string and number types)
      const playerRoomId = typeof playerData.roomId === 'string' ? parseInt(playerData.roomId, 10) : playerData.roomId;
      const targetRoomId = typeof roomId === 'string' ? parseInt(roomId, 10) : roomId;
      
      if (playerRoomId === targetRoomId) {
        // Validate WebSocket connection
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
          players.push({ connId, playerData });
        }
      }
    });
  } catch (forEachErr) {
    console.error(`[NPC Cycle] ERROR: Exception in forEach while getting players in room ${roomId}:`, forEachErr);
  }
  
  return players;
}

// NOTE: sendMessageToRoom has been replaced by the universal message router
// All message sending now goes through utils/messageRouter.js

/**
 * Start the NPC Cycle Engine
 * @param {object} db - Database module
 * @param {object} npcLogic - NPC logic module
 * @param {Map} connectedPlayers - Connected players map
 * @param {Function} sendRoomUpdate - Room update function
 */
// Store connectedPlayers reference at module level to ensure it's always current
// CRITICAL: This is the SINGLE SOURCE OF TRUTH for connectedPlayers in this module
let globalConnectedPlayers = null;

// Setter function to update the reference (called from server.js)
function setConnectedPlayersReference(connectedPlayers) {
  if (connectedPlayers && connectedPlayers instanceof Map) {
    globalConnectedPlayers = connectedPlayers;
    return true;
  }
  console.error(`[NPC Cycle] ERROR: Invalid connectedPlayers passed to setConnectedPlayersReference`);
  return false;
}

// Getter function that always returns the current reference
function getConnectedPlayersReference() {
  if (!globalConnectedPlayers || !(globalConnectedPlayers instanceof Map)) {
    console.error(`[NPC Cycle] ERROR: globalConnectedPlayers is invalid:`, typeof globalConnectedPlayers);
    return null;
  }
  return globalConnectedPlayers;
}

function startNPCCycleEngine(db, npcLogic, connectedPlayers, sendRoomUpdate) {
  // CRITICAL: Store reference at module level immediately
  if (!setConnectedPlayersReference(connectedPlayers)) {
    console.error(`[NPC Cycle] FATAL: Could not set connectedPlayers reference on startup`);
    return;
  }
  
  
  setInterval(async () => {
    try {
      // CRITICAL: Always refresh the reference at the start of each cycle
      // This ensures we always have the most current reference, even if server.js updates it
      if (connectedPlayers && connectedPlayers instanceof Map) {
        globalConnectedPlayers = connectedPlayers;
        
        // Also refresh the message router reference to keep it in sync
        try {
          const { setConnectedPlayersReference: setMessageRouterReference } = require('../utils/messageRouter');
          setMessageRouterReference(connectedPlayers);
        } catch (routerErr) {
          // Non-fatal: message router might not be initialized yet
          console.warn('[NPC Cycle] Could not update message router reference:', routerErr.message);
        }
      }
      
      // Get the current reference (with validation)
      const currentConnectedPlayers = getConnectedPlayersReference();
      
      // Validate we have a valid reference
      if (!currentConnectedPlayers) {
        console.error(`[NPC Cycle] ERROR: Invalid connectedPlayers reference, skipping cycle`);
        return;
      }
      
      // Track size for internal use (no logging)
      startNPCCycleEngine._lastSize = currentConnectedPlayers.size;
      
      const activeNPCs = await db.getAllActiveNPCs();
      const now = Date.now();
      
      for (const roomNpc of activeNPCs) {
        const timeElapsed = now - roomNpc.lastCycleRun;
        
        // IMPORTANT: For rhythm NPCs with active harvest, skip cycle processing
        // to avoid overwriting harvest state. Only check expiration, don't run cycles.
        const hasActiveHarvest = roomNpc.npcType === 'rhythm' && 
                                 roomNpc.state && 
                                 roomNpc.state.harvest_active === true &&
                                 roomNpc.state.harvest_start_time &&
                                 typeof roomNpc.state.harvest_start_time === 'number' &&
                                 roomNpc.harvestableTime &&
                                 roomNpc.harvestableTime > 0;
        
        // Debug: Log if harvestableTime is missing or invalid
        if (roomNpc.npcType === 'rhythm' && roomNpc.state && roomNpc.state.harvest_active === true && (!roomNpc.harvestableTime || roomNpc.harvestableTime <= 0)) {
          console.error(`[NPC Cycle] ERROR: Harvest active but harvestableTime is invalid: ${roomNpc.harvestableTime} for room_npc ${roomNpc.id}`);
        }
        
        // Handle item production during active harvest (rhythm NPCs only)
        // During harvest, items are produced each cycle but state is NOT modified
        // This must happen BEFORE the expiration check to ensure items are produced even when harvest just started
        if (hasActiveHarvest) {
          // For harvest, track time since last item production using harvest_start_time
          // Calculate how many cycles should have produced items
          const harvestStartTime = roomNpc.state.harvest_start_time;
          const timeSinceHarvestStart = now - harvestStartTime;
          
          // Get player's cached resonance from harvest state (default to 5 if not set)
          const playerResonance = roomNpc.state.harvesting_player_resonance || 5;
          
          // Calculate effective cycle time based on resonance (if resonance bonuses enabled)
          let effectiveCycleTime = roomNpc.baseCycleTime;
          if (roomNpc.enableResonanceBonuses !== false) {
            try {
              const cycleConfig = await getHarvestFormulaConfig(db, 'cycle_time_reduction');
              if (cycleConfig) {
                const multiplier = calculateCycleTimeMultiplier(playerResonance, cycleConfig);
                effectiveCycleTime = Math.round(roomNpc.baseCycleTime * multiplier);
              }
            } catch (err) {
              console.error(`[NPC Cycle] Error calculating cycle time multiplier:`, err);
            }
          }
          
          // Get or initialize last_harvest_item_production from state
          let lastHarvestItemProduction = roomNpc.state.last_harvest_item_production || harvestStartTime;
          const timeSinceLastProduction = now - lastHarvestItemProduction;
          
          // Produce items if enough time has passed since last production (using effective cycle time)
          if (timeSinceLastProduction >= effectiveCycleTime) {
            try {
              // Check hit rate based on resonance (if resonance bonuses enabled)
              let harvestHit = true;
              let hitRate = 1.0;
              if (roomNpc.enableResonanceBonuses !== false) {
                try {
                  const hitResult = await checkHarvestHit(playerResonance, db);
                  harvestHit = hitResult.hit;
                  hitRate = hitResult.hitRate;
                } catch (err) {
                  console.error(`[NPC Cycle] Error checking harvest hit:`, err);
                  harvestHit = true; // Default to hit on error
                }
              }
              
              // Get NPC name for messages
              const npcDef = await db.getScriptableNPCById(roomNpc.npcId);
              const npcName = npcDef ? npcDef.name : 'creature';
              
              if (!harvestHit) {
                // Miss - send miss message to all players in the room (for consistency with other harvest messages)
                // Get formatted message from database with markup support
                const missMessage = messageCache.getFormattedMessage('harvest_miss', { npcName: npcName });
                
                // Send miss message to all players in the room (using universal message router)
                if (roomNpc.roomId) {
                  sendMessage({
                    connectedPlayers: currentConnectedPlayers,
                    to: 'room',
                    target: roomNpc.roomId,
                    message: missMessage,
                    type: 'info'
                  });
                } else {
                  console.error(`[NPC Cycle] ERROR: roomNpc.roomId is undefined for room_npc ${roomNpc.id}, cannot send miss message`);
                }
                
                // Update last_harvest_item_production even on miss (to maintain timing)
                const updatedState = { ...roomNpc.state };
                updatedState.last_harvest_item_production = now;
                await db.updateNPCState(roomNpc.id, updatedState, roomNpc.lastCycleRun);
                roomNpc.state.last_harvest_item_production = now;
              } else {
                // Hit - produce items
                // During active harvest, produce items without modifying harvest state
                const producedItems = [];
                if (roomNpc.outputItems && typeof roomNpc.outputItems === 'object') {
                  for (const [itemName, qty] of Object.entries(roomNpc.outputItems)) {
                    if (qty > 0) {
                      producedItems.push({ itemName, quantity: qty });
                    }
                  }
                }
                
                // Add produced items to the room
                if (producedItems.length > 0) {
                  for (const item of producedItems) {
                    await db.addRoomItem(roomNpc.roomId, item.itemName, item.quantity);
                    
                    // Send message to all players in the room about item production
                    // Get formatted message from database with markup support
                    const itemMessage = messageCache.getFormattedMessage('harvest_item_produced', { 
                      npcName: npcName, 
                      quantity: item.quantity, 
                      itemName: item.itemName 
                    });
                    
                    // Send to all players in the room (using universal message router)
                    sendMessage({
                      connectedPlayers: currentConnectedPlayers,
                      to: 'room',
                      target: roomNpc.roomId,
                      message: itemMessage,
                      type: 'info'
                    });
                  }
                  
                  // Send room update to all players in the room so they see the new items
                  const room = await db.getRoomById(roomNpc.roomId);
                  if (room) {
                    const playersInRoom = getPlayersInRoom(currentConnectedPlayers, roomNpc.roomId);
                    for (const { connId } of playersInRoom) {
                      await sendRoomUpdate(connId, room);
                    }
                  }
                  
                  // Update last_harvest_item_production in state (this is the only state field we modify during harvest)
                  const updatedState = { ...roomNpc.state };
                  updatedState.last_harvest_item_production = now;
                  await db.updateNPCState(roomNpc.id, updatedState, roomNpc.lastCycleRun);
                  roomNpc.state.last_harvest_item_production = now;
                } else {
                  console.log(`[NPC Cycle] No items to produce for room_npc ${roomNpc.id} (outputItems: ${JSON.stringify(roomNpc.outputItems)})`);
                }
              }
            } catch (err) {
              console.error(`Error producing items during harvest for room_npc ${roomNpc.id}:`, err);
            }
          }
        }
        
        // Check if harvest session has expired (for rhythm NPCs)
        // IMPORTANT: Only check expiration if harvest is actually active
        // and harvest_start_time is valid (not null/undefined)
        // This check happens AFTER item production so items can be produced even when harvest just started
        if (hasActiveHarvest) {
          const harvestElapsed = now - roomNpc.state.harvest_start_time;
          
          // Use effective harvestable time if available (fortitude bonus), otherwise base
          const effectiveHarvestableTime = roomNpc.state.effective_harvestable_time || roomNpc.harvestableTime;
          
          // CRITICAL: Add minimum harvest duration check to prevent immediate expiration
          // If harvest just started (less than 1 second ago), don't check expiration yet
          // This prevents race conditions where the cycle engine runs immediately after harvest starts
          const MIN_HARVEST_DURATION = 1000; // 1 second minimum
          if (harvestElapsed < MIN_HARVEST_DURATION) {
            // Harvest just started, don't check expiration yet
            return; // Skip expiration check for now
          }
          
          if (harvestElapsed >= effectiveHarvestableTime) {
            
            // Only end harvest if the full effective harvestableTime has elapsed
            // Use strict >= check (no buffer) to ensure full duration
            if (harvestElapsed >= effectiveHarvestableTime) {
              // Harvest time expired - end the session
              console.log(`[NPC Cycle] Harvest expired for room_npc ${roomNpc.id}: elapsed=${harvestElapsed}ms, harvestableTime=${effectiveHarvestableTime}ms`);
              
              // IMPORTANT: Get all info BEFORE ending harvest session
              // (endHarvestSession clears these values and does async DB operations)
              const harvestingPlayerId = roomNpc.state.harvesting_player_id;
              const npcDef = await db.getScriptableNPCById(roomNpc.npcId);
              const npcName = npcDef ? npcDef.name : 'creature';
              const roomId = roomNpc.roomId;
              
              // CRITICAL: Send cooldown message IMMEDIATELY, before ending harvest session
              // This ensures the message is sent even if the player disconnects during endHarvestSession
              // Send to all players in room (like harvest item production messages)
              // Get formatted message from database with markup support
              if (roomId) {
                const cooldownMessage = messageCache.getFormattedMessage('harvest_cooldown', { npcName: npcName });
                
                // Send synchronously to all players in the room (using universal message router)
                sendMessage({
                  connectedPlayers: currentConnectedPlayers,
                  to: 'room',
                  target: roomId,
                  message: cooldownMessage,
                  type: 'info'
                });
              } else {
                console.error(`[NPC Cycle] ERROR: roomNpc.roomId is undefined for room_npc ${roomNpc.id}, cannot send cooldown message`);
              }
              
              // NOW end the harvest session (after message is sent)
              try {
                await endHarvestSession(db, roomNpc.id, true);
              } catch (endErr) {
                console.error(`[NPC Cycle] Error ending harvest session:`, endErr);
                // Message was already sent, so continue
              }
              
              // Reload NPC state after ending session
              const updatedNPCs = await db.getAllActiveNPCs();
              const updatedNPC = updatedNPCs.find(n => n.id === roomNpc.id);
              if (updatedNPC) {
                Object.assign(roomNpc, updatedNPC);
              }
            }
          }
        }
        
        // Normal cycle processing (only when harvest is NOT active)
        if (timeElapsed >= roomNpc.baseCycleTime && !hasActiveHarvest) {
          try {
            // IMPORTANT: Reload fresh state from database before running cycle
            // This ensures we have the latest harvest state
            const freshRoomNpcResult = await db.query('SELECT state FROM room_npcs WHERE id = $1', [roomNpc.id]);
            if (freshRoomNpcResult.rows[0]) {
              try {
                const freshState = freshRoomNpcResult.rows[0].state ? JSON.parse(freshRoomNpcResult.rows[0].state) : {};
                // Update roomNpc.state with fresh state to ensure we're working with latest data
                roomNpc.state = freshState;
              } catch (e) {
                // If parsing fails, keep existing state
              }
            }
            
            // Structure data for npcLogic: npc data and roomNpc data
            const npcData = {
              npcType: roomNpc.npcType,
              baseCycleTime: roomNpc.baseCycleTime,
              requiredStats: roomNpc.requiredStats,
              requiredBuffs: roomNpc.requiredBuffs,
              inputItems: roomNpc.inputItems,
              outputItems: roomNpc.outputItems,
              failureStates: roomNpc.failureStates
            };
            
            // Run NPC cycle logic - returns { state, producedItems }
            // IMPORTANT: Preserve harvest state fields when updating
            const result = npcLogic.runNPCCycle(npcData, roomNpc);
            
            // CRITICAL: Preserve harvest-related state fields that should not be overwritten by cycle logic
            // These fields are managed by the harvest system, not the cycle logic
            // Always preserve these fields from the current state (before cycle logic modified it)
            if (roomNpc.state) {
              // Always preserve harvest state if it exists
              if (roomNpc.state.harvest_active !== undefined) {
                result.state.harvest_active = roomNpc.state.harvest_active;
              }
              if (roomNpc.state.harvest_start_time !== undefined && roomNpc.state.harvest_start_time !== null) {
                result.state.harvest_start_time = roomNpc.state.harvest_start_time;
              }
              if (roomNpc.state.harvesting_player_id !== undefined && roomNpc.state.harvesting_player_id !== null) {
                result.state.harvesting_player_id = roomNpc.state.harvesting_player_id;
              }
              if (roomNpc.state.cooldown_until !== undefined && roomNpc.state.cooldown_until !== null) {
                result.state.cooldown_until = roomNpc.state.cooldown_until;
              }
            }
            
            // If NPC produced items, add them to the room
            if (result.producedItems && result.producedItems.length > 0) {
              for (const item of result.producedItems) {
                await db.addRoomItem(roomNpc.roomId, item.itemName, item.quantity);
              }
              
              // Send room update to all players in the room so they see the new items
              const room = await db.getRoomById(roomNpc.roomId);
              if (room) {
                const playersInRoom = getPlayersInRoom(currentConnectedPlayers, roomNpc.roomId);
                for (const { connId } of playersInRoom) {
                  await sendRoomUpdate(connId, room);
                }
              }
            }
            
            // Update NPC state in database (preserving harvest state)
            await db.updateNPCState(roomNpc.id, result.state, now);
          } catch (err) {
            console.error(`Error processing NPC cycle for room_npc ${roomNpc.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error in NPC cycle engine:', err);
    }
  }, NPC_TICK_INTERVAL);
  
  console.log(`NPC Cycle Engine started (interval: ${NPC_TICK_INTERVAL}ms)`);
}

/**
 * Start periodic room update timer for harvest/cooldown progress bars
 * @param {object} db - Database module
 * @param {Map} connectedPlayers - Connected players map
 * @param {Function} sendRoomUpdate - Room update function
 */
function startRoomUpdateTimer(db, connectedPlayers, sendRoomUpdate) {
  setInterval(async () => {
    try {
      // Send room updates to all connected players to refresh progress bars
      for (const [connId, playerData] of connectedPlayers) {
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN && playerData.roomId) {
          const room = await db.getRoomById(playerData.roomId);
          if (room) {
            await sendRoomUpdate(connId, room);
          }
        }
      }
    } catch (err) {
      console.error('Error in room update timer:', err);
    }
  }, 1000); // Update every second
  
  console.log('Room update timer started (interval: 1000ms)');
}

module.exports = {
  NPC_TICK_INTERVAL,
  HARVEST_SAFE_COMMANDS,
  endHarvestSession,
  findPlayerHarvestSession,
  isHarvestSafeCommand,
  startNPCCycleEngine,
  startRoomUpdateTimer,
  setConnectedPlayersReference, // Export for server.js to update reference if needed
  getConnectedPlayersReference // Export for debugging/validation
};









