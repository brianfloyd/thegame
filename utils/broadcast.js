/**
 * Broadcast and Room Utilities
 * 
 * Shared helper functions for WebSocket broadcasting, room updates,
 * and player stats management.
 */

const WebSocket = require('ws');

/**
 * Get connected players in a specific room
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {number} roomId - Room ID to check
 * @returns {string[]} Array of player names in the room
 */
function getConnectedPlayersInRoom(connectedPlayers, roomId) {
  const players = [];
  connectedPlayers.forEach((playerData, connId) => {
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      players.push(playerData.playerName);
    }
  });
  return players;
}

/**
 * Check if a room is empty (no connected players)
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {number} roomId - Room ID to check
 * @returns {boolean} True if room has no connected players
 */
function isRoomEmpty(connectedPlayers, roomId) {
  let count = 0;
  connectedPlayers.forEach((playerData) => {
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      count++;
    }
  });
  return count === 0;
}

/**
 * Broadcast a message to all players in a room
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {number} roomId - Room ID to broadcast to
 * @param {object} message - Message object to send
 * @param {string|null} excludeConnectionId - Optional connection to exclude
 */
function broadcastToRoom(connectedPlayers, roomId, message, excludeConnectionId = null) {
  connectedPlayers.forEach((playerData, connId) => {
    if (connId === excludeConnectionId) return;
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify(message));
    }
  });
}

/**
 * Broadcast a message to ALL connected players in the world
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {object} message - Message object to send
 * @param {string|null} excludeConnectionId - Optional connection to exclude
 */
function broadcastToAll(connectedPlayers, message, excludeConnectionId = null) {
  connectedPlayers.forEach((playerData, connId) => {
    if (connId === excludeConnectionId) return;
    if (playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify(message));
    }
  });
}

/**
 * Send player stats to a specific player
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {object} db - Database module
 * @param {string} connectionId - Connection ID to send stats to
 */
async function sendPlayerStats(connectedPlayers, db, connectionId) {
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  
  const player = await db.getPlayerByName(playerData.playerName);
  if (!player) return;
  
  const playerStats = db.getPlayerStats(player);
  if (playerStats) {
    playerStats.playerName = player.name;
    playerStats.currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
  }
  
  playerData.ws.send(JSON.stringify({
    type: 'playerStats',
    stats: playerStats || {}
  }));
}

/**
 * Get available exits for a room
 * @param {object} db - Database module
 * @param {object} room - Room object with coordinates and map info
 * @returns {object} Object with direction keys and boolean values
 */
async function getExits(db, room) {
  const exits = {
    north: false,
    south: false,
    east: false,
    west: false,
    northeast: false,
    northwest: false,
    southeast: false,
    southwest: false,
    up: false,
    down: false
  };
  
  // Check for map connections first
  if (room.connection_direction === 'N' && room.connected_map_id) {
    exits.north = true;
  }
  if (room.connection_direction === 'S' && room.connected_map_id) {
    exits.south = true;
  }
  if (room.connection_direction === 'E' && room.connected_map_id) {
    exits.east = true;
  }
  if (room.connection_direction === 'W' && room.connected_map_id) {
    exits.west = true;
  }
  
  // Check for adjacent rooms in same map (only if no map connection in that direction)
  if (!exits.north) {
    exits.north = (await db.getRoomByCoords(room.map_id, room.x, room.y + 1)) != null;
  }
  if (!exits.south) {
    exits.south = (await db.getRoomByCoords(room.map_id, room.x, room.y - 1)) != null;
  }
  if (!exits.east) {
    exits.east = (await db.getRoomByCoords(room.map_id, room.x + 1, room.y)) != null;
  }
  if (!exits.west) {
    exits.west = (await db.getRoomByCoords(room.map_id, room.x - 1, room.y)) != null;
  }
  
  // Diagonal directions (no map connections for these yet)
  exits.northeast = (await db.getRoomByCoords(room.map_id, room.x + 1, room.y + 1)) != null;
  exits.northwest = (await db.getRoomByCoords(room.map_id, room.x - 1, room.y + 1)) != null;
  exits.southeast = (await db.getRoomByCoords(room.map_id, room.x + 1, room.y - 1)) != null;
  exits.southwest = (await db.getRoomByCoords(room.map_id, room.x - 1, room.y - 1)) != null;
  
  return exits;
}

/**
 * Send room update to a player
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {Map} factoryWidgetState - Map of connectionId -> factory state
 * @param {Map} warehouseWidgetState - Map of connectionId -> warehouse state
 * @param {object} db - Database module
 * @param {string} connectionId - Connection ID to send update to
 * @param {object} room - Room object
 * @param {boolean} showFullInfo - Whether to show full room info
 */
async function sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, room, showFullInfo = false) {
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Only get connected players in the room, excluding the current player
  const playersInRoom = getConnectedPlayersInRoom(connectedPlayers, room.id).filter(p => p !== playerData.playerName);
  const exits = await getExits(db, room);
  
  // Get NPCs in the room with harvest progress info
  const now = Date.now();
  const npcsInRoomRaw = await db.getNPCsInRoom(room.id);
  
  // Import harvest formula utilities for effective cycle time calculation
  let harvestFormulas = null;
  try {
    harvestFormulas = require('./harvestFormulas');
  } catch (e) {
    // Formulas module not available, use base cycle time
  }
  
  const npcsInRoom = await Promise.all(npcsInRoomRaw.map(async npc => {
    const baseCycleTime = npc.base_cycle_time || 12000;
    const npcData = {
      id: npc.id,
      name: npc.name,
      description: npc.description,
      state: npc.state,
      color: npc.display_color || npc.color || '#00ffff',
      baseCycleTime: baseCycleTime,
      harvestableTime: npc.harvestableTime || 60000,
      cooldownTime: npc.cooldownTime || 120000
    };
    
    // Calculate harvest/cooldown progress
    if (npc.state.harvest_active && npc.state.harvest_start_time) {
      const harvestElapsed = now - npc.state.harvest_start_time;
      const harvestRemaining = Math.max(0, npcData.harvestableTime - harvestElapsed);
      npcData.harvestProgress = harvestRemaining / npcData.harvestableTime;
      npcData.harvestStatus = 'active';
      
      // Calculate effective cycle time and hit rate based on player's cached resonance
      if (harvestFormulas && npc.state.harvesting_player_resonance) {
        try {
          // Get NPC definition to check if stat bonuses are enabled
          const npcDef = await db.getScriptableNPCById(npc.npcId);
          const enableStatBonuses = npcDef && npcDef.enable_stat_bonuses !== false;
          
          if (enableStatBonuses) {
            // Calculate effective cycle time
            const cycleConfig = await harvestFormulas.getHarvestFormulaConfig(db, 'cycle_time_reduction');
            if (cycleConfig) {
              const multiplier = harvestFormulas.calculateCycleTimeMultiplier(npc.state.harvesting_player_resonance, cycleConfig);
              npcData.effectiveCycleTime = Math.round(baseCycleTime * multiplier);
            }
            
            // Calculate hit rate
            const hitConfig = await harvestFormulas.getHarvestFormulaConfig(db, 'hit_rate');
            if (hitConfig) {
              npcData.hitRate = harvestFormulas.calculateHitRate(npc.state.harvesting_player_resonance, hitConfig);
            }
          } else {
            // Stat bonuses disabled - show 100% hit rate and base cycle time
            npcData.hitRate = 1.0;
          }
        } catch (e) {
          // Error calculating bonuses, use base values (100% hit rate)
          npcData.hitRate = 1.0;
        }
      } else {
        // No resonance cached (shouldn't happen during active harvest, but safety check)
        npcData.hitRate = 1.0;
      }
    } else if (npc.state.cooldown_until && now < npc.state.cooldown_until) {
      const cooldownRemaining = npc.state.cooldown_until - now;
      const cooldownElapsed = npcData.cooldownTime - cooldownRemaining;
      npcData.harvestProgress = cooldownElapsed / npcData.cooldownTime;
      npcData.harvestStatus = 'cooldown';
    } else {
      npcData.harvestProgress = 1.0;
      npcData.harvestStatus = 'ready';
    }
    
    return npcData;
  }));
  
  // Get items on the ground in the room
  const roomItems = await db.getRoomItems(room.id);
  
  // Get map name
  const map = await db.getMapById(room.map_id);
  const mapName = map ? map.name : '';

  // Get factory widget state if room is factory type
  let factoryState = null;
  if (room.room_type === 'factory') {
    const existingState = factoryWidgetState.get(connectionId);
    if (existingState && existingState.roomId === room.id) {
      factoryState = {
        slots: existingState.slots,
        textInput: existingState.textInput || ''
      };
    } else {
      factoryState = {
        slots: [null, null],
        textInput: ''
      };
      factoryWidgetState.set(connectionId, {
        roomId: room.id,
        slots: [null, null],
        textInput: ''
      });
    }
  } else {
    factoryWidgetState.delete(connectionId);
  }

  // Check if player has any warehouse deeds
  let hasWarehouseDeed = false;
  if (playerData && playerData.playerId) {
    hasWarehouseDeed = await db.hasPlayerWarehouseDeed(playerData.playerId);
  }

  // Get warehouse widget state
  // If in warehouse room: show interactive state
  // If not in warehouse room but has deed: show view-only state (first warehouse they have access to)
  let warehouseState = null;
  
  if (playerData && playerData.playerId && hasWarehouseDeed) {
    if (room.room_type === 'warehouse') {
      // In warehouse room - check if player has access
      const warehouseLocationKey = room.id.toString();
      const accessCheck = await db.checkWarehouseAccess(playerData.playerId, warehouseLocationKey);
      
      if (accessCheck.hasAccess) {
        // Initialize warehouse if first time (or if player is always-first-time)
        const player = await db.getPlayerById(playerData.playerId);
        const isAlwaysFirstTime = player && player.flag_always_first_time === 1;
        let capacity = await db.getPlayerWarehouseCapacity(playerData.playerId, warehouseLocationKey);
        if (!capacity || isAlwaysFirstTime) {
          if (isAlwaysFirstTime && capacity) {
            await db.query('DELETE FROM player_warehouses WHERE player_id = $1 AND warehouse_location_key = $2', [playerData.playerId, warehouseLocationKey]);
            await db.query('DELETE FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2', [playerData.playerId, warehouseLocationKey]);
          }
          capacity = await db.initializePlayerWarehouse(playerData.playerId, warehouseLocationKey, accessCheck.deedItem.id);
        }
        
        const items = await db.getWarehouseItems(playerData.playerId, warehouseLocationKey);
        const itemTypeCount = await db.getWarehouseItemTypeCount(playerData.playerId, warehouseLocationKey);
        const deeds = await db.getPlayerWarehouseDeeds(playerData.playerId, warehouseLocationKey);
        
        warehouseState = {
          warehouseLocationKey: warehouseLocationKey,
          items: items,
          capacity: {
            maxItemTypes: capacity.max_item_types,
            maxQuantityPerType: capacity.max_quantity_per_type,
            currentItemTypes: itemTypeCount,
            upgradeTier: capacity.upgrade_tier
          },
          deeds: deeds
        };
        
        warehouseWidgetState.set(connectionId, {
          roomId: room.id,
          warehouseLocationKey: warehouseLocationKey
        });
      }
    } else {
      // Not in warehouse room - find first warehouse player has access to (for view-only)
      const playerItems = await db.getPlayerItems(playerData.playerId);
      const allItems = await db.getAllItems();
      
      for (const playerItem of playerItems) {
        const itemDef = allItems.find(item => item.name === playerItem.item_name);
        if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key) {
          const warehouseLocationKey = itemDef.deed_warehouse_location_key;
          const capacity = await db.getPlayerWarehouseCapacity(playerData.playerId, warehouseLocationKey);
          
          if (capacity) {
            const items = await db.getWarehouseItems(playerData.playerId, warehouseLocationKey);
            const itemTypeCount = await db.getWarehouseItemTypeCount(playerData.playerId, warehouseLocationKey);
            const deeds = await db.getPlayerWarehouseDeeds(playerData.playerId, warehouseLocationKey);
            
            warehouseState = {
              warehouseLocationKey: warehouseLocationKey,
              items: items,
              capacity: {
                maxItemTypes: capacity.max_item_types,
                maxQuantityPerType: capacity.max_quantity_per_type,
                currentItemTypes: itemTypeCount,
                upgradeTier: capacity.upgrade_tier
              },
              deeds: deeds
            };
            break; // Use first warehouse found
          }
        }
      }
    }
  }
  
  if (!warehouseState) {
    warehouseWidgetState.delete(connectionId);
  }

  playerData.ws.send(JSON.stringify({
    type: 'roomUpdate',
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      x: room.x,
      y: room.y,
      mapName: mapName,
      roomType: room.room_type || 'normal'
    },
    players: playersInRoom,
    npcs: npcsInRoom,
    roomItems: roomItems,
    exits: exits,
    showFullInfo: showFullInfo,
    factoryWidgetState: factoryState,
    warehouseWidgetState: warehouseState,
    hasWarehouseDeed: hasWarehouseDeed
  }));
}

/**
 * Find current player from WebSocket connection
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {WebSocket} ws - WebSocket connection to find
 * @returns {string|null} Player name or null if not found
 */
function findPlayerNameByWs(connectedPlayers, ws) {
  let currentPlayerName = null;
  connectedPlayers.forEach((playerData) => {
    if (playerData.ws === ws) {
      currentPlayerName = playerData.playerName;
    }
  });
  return currentPlayerName;
}

/**
 * Verify god mode access for a player
 * @param {object} db - Database module
 * @param {Map} connectedPlayers - Map of connectionId -> player data
 * @param {WebSocket} ws - WebSocket connection
 * @returns {object|null} Player object if god mode, null otherwise
 */
async function verifyGodMode(db, connectedPlayers, ws) {
  const playerName = findPlayerNameByWs(connectedPlayers, ws);
  if (!playerName) return null;
  
  const player = await db.getPlayerByName(playerName);
  if (!player || player.flag_god_mode !== 1) return null;
  
  return player;
}

module.exports = {
  getConnectedPlayersInRoom,
  isRoomEmpty,
  broadcastToRoom,
  broadcastToAll,
  sendPlayerStats,
  getExits,
  sendRoomUpdate,
  findPlayerNameByWs,
  verifyGodMode
};

