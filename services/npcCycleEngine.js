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
        
        // Check if harvest session has expired (for rhythm NPCs)
        if (roomNpc.npcType === 'rhythm' && roomNpc.state && roomNpc.state.harvest_active && roomNpc.state.harvest_start_time) {
          const harvestElapsed = now - roomNpc.state.harvest_start_time;
          if (harvestElapsed >= roomNpc.harvestableTime) {
            // Harvest time expired - end the session
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
        
        // Check if enough time has passed for this NPC's cycle
        if (timeElapsed >= roomNpc.baseCycleTime) {
          try {
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
            const result = npcLogic.runNPCCycle(npcData, roomNpc);
            
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
            
            // Update NPC state in database (just the state part)
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

