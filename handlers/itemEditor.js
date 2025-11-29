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
  // Also include item types, warehouse rooms, and merchant rooms for the UI
  const itemTypes = await db.getAllItemTypes();
  const itemTypeList = itemTypes.map(it => it.item_type);
  const warehouseRooms = await db.getWarehouseRooms();
  const merchantRooms = await db.getMerchantRooms();
  ws.send(JSON.stringify({ type: 'itemList', items, itemTypes: itemTypeList, warehouseRooms, merchantRooms }));
}

/**
 * Get all item types (for dropdown population)
 */
async function getAllItemTypes(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  // Ensure the 3 valid item types exist in database
  try {
    await db.query(
      `INSERT INTO item_types (item_type, description) VALUES
       ('ingredient', 'Raw materials and ingredients used in crafting and alchemy'),
       ('rune', 'Magical runes and enchanted items'),
       ('deed', 'Property deeds and ownership documents')
       ON CONFLICT (item_type) DO NOTHING`,
      []
    );
  } catch (err) {
    // Ignore errors - types may already exist
    console.log('Note: Could not ensure item types exist:', err.message);
  }

  const itemTypes = await db.getAllItemTypes();
  const itemTypeList = itemTypes.map(it => it.item_type);
  ws.send(JSON.stringify({ type: 'allItemTypes', itemTypes: itemTypeList }));
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

  // Validate item type - must be one of the 3 allowed types
  const allowedTypes = ['ingredient', 'rune', 'deed'];
  if (item.item_type && !allowedTypes.includes(item.item_type)) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid item type: ${item.item_type}. Valid types: ${allowedTypes.join(', ')}` }));
    return;
  }

  try {
    const updatedItem = await db.updateItem(item);
    ws.send(JSON.stringify({ type: 'itemUpdated', item: updatedItem }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update item: ' + err.message }));
  }
}

/**
 * Get all warehouse rooms (for deed configuration)
 */
async function getWarehouseRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const warehouseRooms = await db.getWarehouseRooms();
  ws.send(JSON.stringify({ type: 'warehouseRooms', rooms: warehouseRooms }));
}

/**
 * Get all merchant rooms (for item configuration)
 */
async function getMerchantRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const merchantRooms = await db.getMerchantRooms();
  ws.send(JSON.stringify({ type: 'merchantRooms', rooms: merchantRooms }));
}

/**
 * Get merchant items for a specific item
 */
async function getMerchantItems(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { itemId } = data;
  if (!itemId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Item ID required' }));
    return;
  }

  const merchantItems = await db.getMerchantItems(itemId);
  ws.send(JSON.stringify({ type: 'merchantItems', merchantItems }));
}

/**
 * Add item to merchant room
 */
async function addItemToMerchant(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { itemId, roomId, unlimited, maxQty, regenHours } = data;
  if (!itemId || !roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Item ID and Room ID required' }));
    return;
  }

  try {
    const merchantItem = await db.addItemToMerchant(itemId, roomId, unlimited !== false, maxQty || null, regenHours || null);
    ws.send(JSON.stringify({ type: 'merchantItemAdded', merchantItem }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to add item to merchant: ' + err.message }));
  }
}

/**
 * Update merchant item configuration
 */
async function updateMerchantItem(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { merchantItemId, unlimited, maxQty, regenHours } = data;
  if (!merchantItemId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Merchant Item ID required' }));
    return;
  }

  try {
    const merchantItem = await db.updateMerchantItem(merchantItemId, unlimited !== false, maxQty || null, regenHours || null);
    ws.send(JSON.stringify({ type: 'merchantItemUpdated', merchantItem }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update merchant item: ' + err.message }));
  }
}

/**
 * Remove item from merchant room
 */
async function removeItemFromMerchant(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { merchantItemId } = data;
  if (!merchantItemId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Merchant Item ID required' }));
    return;
  }

  try {
    await db.removeItemFromMerchant(merchantItemId);
    ws.send(JSON.stringify({ type: 'merchantItemRemoved', merchantItemId }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to remove item from merchant: ' + err.message }));
  }
}

module.exports = {
  getAllItems,
  getAllItemTypes,
  getWarehouseRooms,
  getMerchantRooms,
  getMerchantItems,
  addItemToMerchant,
  updateMerchantItem,
  removeItemFromMerchant,
  createItem,
  updateItem
};


