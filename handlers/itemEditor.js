/**
 * Item Editor Handlers
 * 
 * WebSocket handlers for item management (God Mode only)
 * Handles: getAllItems, createItem, updateItem
 */

const { verifyGodMode } = require('../utils/broadcast');

/**
 * Get all items
 */
async function getAllItems(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const items = await db.getAllItems();
  ws.send(JSON.stringify({ type: 'itemList', items }));
}

/**
 * Create a new item
 */
async function createItem(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { item } = data;
  if (!item || !item.name) {
    ws.send(JSON.stringify({ type: 'error', message: 'Item name required' }));
    return;
  }

  try {
    const newItem = await db.createItem(item);
    ws.send(JSON.stringify({ type: 'itemCreated', item: newItem }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create item: ' + err.message }));
  }
}

/**
 * Update an existing item
 */
async function updateItem(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { item } = data;
  if (!item || !item.id) {
    ws.send(JSON.stringify({ type: 'error', message: 'Item id required' }));
    return;
  }

  try {
    const updatedItem = await db.updateItem(item);
    ws.send(JSON.stringify({ type: 'itemUpdated', item: updatedItem }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update item: ' + err.message }));
  }
}

module.exports = {
  getAllItems,
  createItem,
  updateItem
};

