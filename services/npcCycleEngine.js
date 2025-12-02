/**
 * NPC Cycle Engine
 * 
 * Handles NPC tick loops, harvest sessions, and periodic room updates.
 * Runs independently of player actions, processing NPC cycles on timer.
 */

const WebSocket = require('ws');

// NPC Cycle Engine Configuration
const NPC_TICK_INTERVAL = 1000; // milliseconds (configurable)

// Commands that do NOT interrupt an active harvest session
const HARVEST_SAFE_COMMANDS = [
  'inventory', 'inv', 'i',
  'look', 'l',
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'up', 'down',
  'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
  'move' // movement command type
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
  const cooldownTime = npcDef ? (npcDef.cooldown_time || 120000) : 120000;
  
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
  
  state.harvest_active = false;
  state.harvesting_player_id = null;
  state.harvest_start_time = null;
  if (startCooldown) {
    state.cooldown_until = Date.now() + cooldownTime;
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
 * Start the NPC Cycle Engine
 * @param {object} db - Database module
 * @param {object} npcLogic - NPC logic module
 * @param {Map} connectedPlayers - Connected players map
 * @param {Function} sendRoomUpdate - Room update function
 */
function startNPCCycleEngine(db, npcLogic, connectedPlayers, sendRoomUpdate) {
  setInterval(async () => {
    try {
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
        
        // Check if harvest session has expired (for rhythm NPCs)
        // IMPORTANT: Only check expiration if harvest is actually active
        // and harvest_start_time is valid (not null/undefined)
        if (hasActiveHarvest) {
          const harvestElapsed = now - roomNpc.state.harvest_start_time;
          
          // CRITICAL: Add minimum harvest duration check to prevent immediate expiration
          // If harvest just started (less than 1 second ago), don't check expiration yet
          // This prevents race conditions where the cycle engine runs immediately after harvest starts
          const MIN_HARVEST_DURATION = 1000; // 1 second minimum
          if (harvestElapsed < MIN_HARVEST_DURATION) {
            // Harvest just started, skip expiration check this cycle
            continue;
          }
          
          // Debug logging
          if (harvestElapsed < 5000) { // Only log for first 5 seconds to avoid spam
            console.log(`[NPC Cycle] Harvest active: elapsed=${harvestElapsed}ms, harvestableTime=${roomNpc.harvestableTime}ms, remaining=${roomNpc.harvestableTime - harvestElapsed}ms`);
          }
          
          // Only end harvest if the full harvestableTime has elapsed
          // Use strict >= check (no buffer) to ensure full duration
          if (harvestElapsed >= roomNpc.harvestableTime) {
            // Harvest time expired - end the session
            console.log(`[NPC Cycle] Harvest expired for room_npc ${roomNpc.id}: elapsed=${harvestElapsed}ms, harvestableTime=${roomNpc.harvestableTime}ms`);
            const harvestingPlayerId = roomNpc.state.harvesting_player_id;
            // Get NPC name from definition
            const npcDef = await db.getScriptableNPCById(roomNpc.npcId);
            const npcName = npcDef ? npcDef.name : 'creature';
            
            await endHarvestSession(db, roomNpc.id, true);
            
            // Notify the harvesting player if they're still connected
            if (harvestingPlayerId) {
              connectedPlayers.forEach((playerData, connId) => {
                if (playerData.playerId === harvestingPlayerId && 
                    playerData.ws.readyState === WebSocket.OPEN) {
                  playerData.ws.send(JSON.stringify({ 
                    type: 'message', 
                    message: `The harvest has ended and this ${npcName} must recharge before it can be harvested again.` 
                  }));
                }
              });
            }
            
            // Reload NPC state after ending session
            const updatedNPCs = await db.getAllActiveNPCs();
            const updatedNPC = updatedNPCs.find(n => n.id === roomNpc.id);
            if (updatedNPC) {
              Object.assign(roomNpc, updatedNPC);
            }
          }
        }
        
        // Handle item production during active harvest (rhythm NPCs only)
        // During harvest, items are produced each cycle but state is NOT modified
        if (hasActiveHarvest && timeElapsed >= roomNpc.baseCycleTime) {
          try {
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
              }
              
              // Send room update to all players in the room so they see the new items
              const room = await db.getRoomById(roomNpc.roomId);
              if (room) {
                for (const [connId, playerData] of connectedPlayers) {
                  if (playerData.roomId === roomNpc.roomId && playerData.ws.readyState === WebSocket.OPEN) {
                    await sendRoomUpdate(connId, room);
                  }
                }
              }
            }
            
            // Update last_cycle_run timestamp but DO NOT modify state
            // This allows items to be produced each cycle during harvest
            await db.query('UPDATE room_npcs SET last_cycle_run = $1 WHERE id = $2', [now, roomNpc.id]);
            roomNpc.lastCycleRun = now;
          } catch (err) {
            console.error(`Error producing items during harvest for room_npc ${roomNpc.id}:`, err);
          }
        }
        // Normal cycle processing (only when harvest is NOT active)
        else if (timeElapsed >= roomNpc.baseCycleTime && !hasActiveHarvest) {
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
                for (const [connId, playerData] of connectedPlayers) {
                  if (playerData.roomId === roomNpc.roomId && playerData.ws.readyState === WebSocket.OPEN) {
                    await sendRoomUpdate(connId, room);
                  }
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
  startRoomUpdateTimer
};









