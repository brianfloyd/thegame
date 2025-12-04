/**
 * Player Editor Handlers
 * 
 * WebSocket handlers for player management (God Mode only)
 * Handles: getAllPlayers, updatePlayer, getPlayerInventory, 
 *          addPlayerInventoryItem, removePlayerInventoryItem
 */

const { verifyGodMode, sendPlayerStats } = require('../utils/broadcast');

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

  const { player } = data;
  if (!player || !player.id) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player id required' }));
    return;
  }

  try {
    const updatedPlayer = await db.updatePlayer(player);
    ws.send(JSON.stringify({ type: 'playerUpdated', player: updatedPlayer }));
  } catch (err) {
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
  
  // Check encumbrance
  const targetPlayer = await db.getPlayerById(playerId);
  if (!targetPlayer) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentEnc = await db.getPlayerCurrentEncumbrance(playerId);
  const maxEnc = targetPlayer.resource_max_encumbrance || 100;
  const itemEnc = await db.getItemEncumbrance(itemName);
  const totalNewEnc = itemEnc * quantity;
  
  if (currentEnc + totalNewEnc > maxEnc) {
    ws.send(JSON.stringify({ type: 'error', message: `Would exceed encumbrance limit (${currentEnc + totalNewEnc}/${maxEnc})` }));
    return;
  }
  
  await db.addPlayerItem(playerId, itemName, quantity);
  
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















