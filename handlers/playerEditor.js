/**
 * Player Editor Handlers
 * 
 * WebSocket handlers for player management (God Mode only)
 * Handles: getAllPlayers, updatePlayer, getPlayerInventory, 
 *          addPlayerInventoryItem, removePlayerInventoryItem
 */

const { verifyGodMode, sendPlayerStats, sendRoomUpdate, broadcastToRoom, getConnectedPlayersInRoom, isRoomEmpty } = require('../utils/broadcast');
const { findPlayerHarvestSession, endHarvestSession } = require('../services/npcCycleEngine');
const messageCache = require('../utils/messageCache');
const WebSocket = require('ws');

/**
 * Get all players
 */
async function getAllPlayers(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const players = await db.getAllPlayers();
  ws.send(JSON.stringify({ type: 'playerList', players }));
}

/**
 * Update a player
 */
async function updatePlayer(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const currentPlayer = await verifyGodMode(db, connectedPlayers, ws);
  if (!currentPlayer) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  // Support both formats: { player: { id, ... } } and { playerId, updates: { ... } }
  let player;
  if (data.player && data.player.id) {
    // Format 1: { player: { id, ...fields } }
    player = data.player;
  } else if (data.playerId && data.updates) {
    // Format 2: { playerId, updates: { ...fields } }
    player = {
      id: data.playerId,
      ...data.updates
    };
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Player id required' }));
    return;
  }

  if (!player || !player.id) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player id required' }));
    return;
  }

  try {
    // Get old room ID before update (if player is online)
    const updatedPlayerId = player.id;
    let oldRoomId = null;
    let playerConnectionId = null;
    let playerData = null;
    
    for (const [connId, pd] of connectedPlayers) {
      if (pd.playerId === updatedPlayerId) {
        oldRoomId = pd.roomId;
        playerConnectionId = connId;
        playerData = pd;
        break;
      }
    }
    
    const updatedPlayer = await db.updatePlayer(player);
    ws.send(JSON.stringify({ type: 'playerUpdated', player: updatedPlayer }));
    
    // Check if current_room_id was changed (transportation)
    const newRoomId = updatedPlayer.current_room_id;
    const roomChanged = oldRoomId && newRoomId && oldRoomId !== newRoomId;
    
    // If the updated player is online, handle room change and refresh stats
    if (playerConnectionId && playerData) {
      // Update connectedPlayers roomId if room changed
      if (roomChanged) {
        playerData.roomId = newRoomId;
        connectedPlayers.set(playerConnectionId, playerData);
        console.log(`[updatePlayer] ✅ Player ${updatedPlayerId} transported from room ${oldRoomId} to room ${newRoomId}`);
        
        // Get factory and warehouse widget state from ctx
        const factoryWidgetState = ctx.factoryWidgetState || new Map();
        const warehouseWidgetState = ctx.warehouseWidgetState || new Map();
        
        // End any active harvest session (same as jumpToRoom)
        if (playerData.playerId) {
          const activeSession = await findPlayerHarvestSession(db, playerData.playerId);
          if (activeSession) {
            await endHarvestSession(db, activeSession.roomNpcId, true);
            playerData.ws.send(JSON.stringify({ 
              type: 'message', 
              message: 'Your harvesting has been interrupted.' 
            }));
          }
        }
        
        // Drop factory widget items to ground if player was in factory room (same as jumpToRoom)
        const oldFactoryState = factoryWidgetState.get(playerConnectionId);
        if (oldFactoryState && oldFactoryState.roomId === oldRoomId) {
          const oldRoom = await db.getRoomById(oldRoomId);
          if (oldRoom && oldRoom.room_type === 'factory') {
            // Drop items from factory slots to room ground
            for (let i = 0; i < oldFactoryState.slots.length; i++) {
              const slot = oldFactoryState.slots[i];
              if (slot && slot.itemName) {
                await db.addRoomItem(oldRoomId, slot.itemName, slot.quantity);
              }
            }
            // Clear factory state
            factoryWidgetState.delete(playerConnectionId);
            
            // Check if room is now empty and remove poofable items
            if (isRoomEmpty(connectedPlayers, oldRoomId)) {
              await db.removePoofableItemsFromRoom(oldRoomId);
            }
          }
        } else {
          // Remove poofable items from old room when player leaves (non-factory rooms)
          await db.removePoofableItemsFromRoom(oldRoomId);
        }
        
        // Notify players in old room that player left (same as jumpToRoom)
        const displayPlayerNameForLeft = playerData.playerName.replace(/@/g, '');
        const leftMessage = messageCache.getFormattedMessage('player_left', { playerName: displayPlayerNameForLeft });
        broadcastToRoom(connectedPlayers, oldRoomId, {
          type: 'playerLeft',
          playerName: playerData.playerName,
          message: leftMessage
        }, playerConnectionId);
        
        // Notify players in old room (refresh room view)
        const otherPlayersInOldRoom = getConnectedPlayersInRoom(connectedPlayers, oldRoomId).filter(p => p !== playerData.playerName);
        for (const otherPlayerName of otherPlayersInOldRoom) {
          for (const [otherConnId, otherPlayerData] of connectedPlayers.entries()) {
            if (otherPlayerData.playerName === otherPlayerName && otherPlayerData.roomId === oldRoomId) {
              const oldRoom = await db.getRoomById(oldRoomId);
              if (oldRoom) {
                await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, oldRoom, false);
              }
              break;
            }
          }
        }
        
        // Notify players in new room that player joined
        const displayPlayerName = playerData.playerName.replace(/@/g, '');
        const joinedMessage = messageCache.getFormattedMessage('player_arrived', { playerName: displayPlayerName });
        broadcastToRoom(connectedPlayers, newRoomId, {
          type: 'playerJoined',
          playerName: playerData.playerName,
          message: joinedMessage
        }, playerConnectionId);
        
        // Send room update to other players in new room
        const otherPlayersInNewRoom = getConnectedPlayersInRoom(connectedPlayers, newRoomId).filter(p => p !== playerData.playerName);
        for (const otherPlayerName of otherPlayersInNewRoom) {
          for (const [otherConnId, otherPlayerData] of connectedPlayers.entries()) {
            if (otherPlayerData.playerName === otherPlayerName && otherPlayerData.roomId === newRoomId) {
              const newRoom = await db.getRoomById(newRoomId);
              if (newRoom) {
                await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, newRoom, false);
              }
              break;
            }
          }
        }
        
        // Send room update to the transported player (full info)
        const newRoom = await db.getRoomById(newRoomId);
        if (newRoom) {
          await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, playerConnectionId, newRoom, true);
        }
      }
      
      // Always refresh stats widget
      try {
        await sendPlayerStats(connectedPlayers, db, playerConnectionId);
        console.log(`[updatePlayer] ✅ Sent stats update to player ${updatedPlayerId} (connection ${playerConnectionId}, name: ${playerData.playerName})`);
      } catch (statsError) {
        console.error(`[updatePlayer] ❌ Failed to send stats update to player ${updatedPlayerId}:`, statsError);
      }
    } else {
      console.log(`[updatePlayer] ⚠️ Player ${updatedPlayerId} not found in connected players (may be offline)`);
    }
  } catch (err) {
    console.error(`[updatePlayer] ❌ Error updating player:`, err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update player: ' + err.message }));
  }
}

/**
 * Get player inventory
 */
async function getPlayerInventory(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const currentPlayer = await verifyGodMode(db, connectedPlayers, ws);
  if (!currentPlayer) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { playerId } = data;
  const inventory = await db.getPlayerItems(playerId);
  const currentEncumbrance = await db.getPlayerCurrentEncumbrance(playerId);
  
  ws.send(JSON.stringify({ 
    type: 'playerInventory', 
    inventory,
    currentEncumbrance
  }));
}

/**
 * Add item to player inventory
 */
async function addPlayerInventoryItem(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const currentPlayer = await verifyGodMode(db, connectedPlayers, ws);
  if (!currentPlayer) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { playerId, itemName, quantity } = data;
  
  // Validate item exists in items table before granting
  const itemData = await db.getItemByName(itemName);
  if (!itemData) {
    ws.send(JSON.stringify({ type: 'error', message: `Item "${itemName}" does not exist in the items table. Only items that exist in the database can be granted to players.` }));
    return;
  }
  
  // Use the canonical item name from the database (in case of name mismatch)
  const canonicalItemName = itemData.name;
  
  // Check encumbrance
  const targetPlayer = await db.getPlayerById(playerId);
  if (!targetPlayer) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentEnc = await db.getPlayerCurrentEncumbrance(playerId);
  const maxEnc = targetPlayer.resource_max_encumbrance || 100;
  const itemEnc = await db.getItemEncumbrance(canonicalItemName);
  const totalNewEnc = itemEnc * quantity;
  
  if (currentEnc + totalNewEnc > maxEnc) {
    ws.send(JSON.stringify({ type: 'error', message: `Would exceed encumbrance limit (${currentEnc + totalNewEnc}/${maxEnc})` }));
    return;
  }
  
  // Use canonical name to ensure consistency
  await db.addPlayerItem(playerId, canonicalItemName, quantity);
  
  const inventory = await db.getPlayerItems(playerId);
  const newEncumbrance = await db.getPlayerCurrentEncumbrance(playerId);
  
  ws.send(JSON.stringify({ 
    type: 'playerInventoryUpdated', 
    inventory,
    currentEncumbrance: newEncumbrance
  }));
  
  // If this player is online, update their stats
  for (const [connId, pd] of connectedPlayers) {
    if (pd.playerId === playerId) {
      await sendPlayerStats(connectedPlayers, db, connId);
    }
  }
}

/**
 * Remove item from player inventory
 */
async function removePlayerInventoryItem(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const currentPlayer = await verifyGodMode(db, connectedPlayers, ws);
  if (!currentPlayer) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { playerId, itemName, quantity } = data;
  
  await db.removePlayerItem(playerId, itemName, quantity);
  
  const inventory = await db.getPlayerItems(playerId);
  const newEncumbrance = await db.getPlayerCurrentEncumbrance(playerId);
  
  ws.send(JSON.stringify({ 
    type: 'playerInventoryUpdated', 
    inventory,
    currentEncumbrance: newEncumbrance
  }));
  
  // If this player is online, update their stats
  for (const [connId, pd] of connectedPlayers) {
    if (pd.playerId === playerId) {
      await sendPlayerStats(connectedPlayers, db, connId);
    }
  }
}

module.exports = {
  getAllPlayers,
  updatePlayer,
  getPlayerInventory,
  addPlayerInventoryItem,
  removePlayerInventoryItem
};






























