/**
 * Merchant Editor Handlers
 * 
 * Handles WebSocket messages for merchant room management and inventory.
 */

const db = require('../database');
const { verifyGodMode } = require('../utils/broadcast');

async function handleGetMerchantRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const rooms = await db.getMerchantRooms();
    ws.send(JSON.stringify({
      type: 'merchantRooms',
      rooms: rooms
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error getting merchant rooms:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get merchant rooms: ' + error.message
    }));
  }
}

async function handleGetMerchantRoomDetails(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const room = await db.getMerchantRoomWithInventory(data.roomId);
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Merchant room not found'
      }));
      return;
    }
    
    ws.send(JSON.stringify({
      type: 'merchantRoomDetails',
      room: room
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error getting merchant room details:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get merchant room details: ' + error.message
    }));
  }
}

async function handleCreateMerchantRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const { mapId, x, y, name, description } = data.data;
    
    // Create room
    const room = await db.createRoom({
      map_id: parseInt(mapId),
      x: parseInt(x),
      y: parseInt(y),
      name: name,
      description: description || '',
      room_type: 'merchant'
    });
    
    ws.send(JSON.stringify({
      type: 'merchantRoomCreated',
      room: room
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error creating merchant room:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to create merchant room: ' + error.message
    }));
  }
}

async function handleConvertRoomToMerchant(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const room = await db.convertRoomToMerchant(data.roomId);
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room not found'
      }));
      return;
    }
    
    ws.send(JSON.stringify({
      type: 'merchantRoomCreated',
      room: room
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error converting room to merchant:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to convert room to merchant: ' + error.message
    }));
  }
}

async function handleGetMerchantInventory(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const inventory = await db.getMerchantItemsForRoom(data.roomId);
    ws.send(JSON.stringify({
      type: 'merchantInventory',
      inventory: inventory
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error getting merchant inventory:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get merchant inventory: ' + error.message
    }));
  }
}

async function handleAddItemToMerchantInventory(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const { roomId, itemId, config } = data;
    
    const merchantItem = await db.addItemToMerchant(
      parseInt(itemId),
      parseInt(roomId),
      config.unlimited !== false,
      config.max_qty || null,
      config.regen_hours || null,
      config.price || 0,
      config.buyable !== false,
      config.sellable || false,
      config
    );
    
    ws.send(JSON.stringify({
      type: 'merchantItemAdded',
      merchantItem: merchantItem
    }));
    
    // Send updated room details
    const room = await db.getMerchantRoomWithInventory(roomId);
    ws.send(JSON.stringify({
      type: 'merchantRoomDetails',
      room: room
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error adding item to merchant inventory:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to add item to inventory: ' + error.message
    }));
  }
}

async function handleUpdateMerchantItemConfig(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const { merchantItemId, config } = data;
    
    const merchantItem = await db.updateMerchantItem(
      parseInt(merchantItemId),
      config.unlimited,
      config.max_qty,
      config.regen_hours,
      config.price,
      config.buyable,
      config.sellable,
      config
    );
    
    ws.send(JSON.stringify({
      type: 'merchantItemUpdated',
      merchantItem: merchantItem
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error updating merchant item:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to update merchant item: ' + error.message
    }));
  }
}

async function handleRemoveItemFromMerchantInventory(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    await db.removeItemFromMerchant(data.merchantItemId);
    
    ws.send(JSON.stringify({
      type: 'merchantItemRemoved',
      merchantItemId: data.merchantItemId
    }));
    
    // Get merchant item to find room ID
    const merchantItem = await db.getMerchantItemById(data.merchantItemId);
    if (merchantItem) {
      // Send updated room details
      const room = await db.getMerchantRoomWithInventory(merchantItem.room_id);
      ws.send(JSON.stringify({
        type: 'merchantRoomDetails',
        room: room
      }));
    }
  } catch (error) {
    console.error('[MerchantEditor] Error removing item from merchant inventory:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to remove item from inventory: ' + error.message
    }));
  }
}

async function handleAdjustMerchantItemQuantity(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const merchantItem = await db.adjustMerchantItemQuantity(
      parseInt(data.merchantItemId),
      parseInt(data.delta)
    );
    
    ws.send(JSON.stringify({
      type: 'merchantItemQuantityAdjusted',
      merchantItemId: data.merchantItemId,
      current_qty: merchantItem.current_qty
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error adjusting merchant item quantity:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to adjust item quantity: ' + error.message
    }));
  }
}

async function handleGetMerchantFormulaOverride(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const override = await db.getMerchantFormulaOverride(data.roomId);
    
    ws.send(JSON.stringify({
      type: 'merchantFormulaOverride',
      override: override
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error getting merchant formula override:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get formula override: ' + error.message
    }));
  }
}

async function handleSetMerchantFormulaOverride(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const override = await db.setMerchantFormulaOverride(
      data.roomId,
      data.formulaConfig,
      data.active !== false
    );
    
    ws.send(JSON.stringify({
      type: 'merchantFormulaOverrideSet',
      override: override
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error setting merchant formula override:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to set formula override: ' + error.message
    }));
  }
}

async function handleGetAllRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const player = await verifyGodMode(db, connectedPlayers, ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
      return;
    }
    
    const rooms = await db.getAllRooms();
    ws.send(JSON.stringify({
      type: 'allRooms',
      rooms: rooms
    }));
  } catch (error) {
    console.error('[MerchantEditor] Error getting all rooms:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get rooms: ' + error.message
    }));
  }
}

module.exports = {
  handleGetMerchantRooms,
  handleGetMerchantRoomDetails,
  handleCreateMerchantRoom,
  handleConvertRoomToMerchant,
  handleGetMerchantInventory,
  handleAddItemToMerchantInventory,
  handleUpdateMerchantItemConfig,
  handleRemoveItemFromMerchantInventory,
  handleAdjustMerchantItemQuantity,
  handleGetMerchantFormulaOverride,
  handleSetMerchantFormulaOverride,
  handleGetAllRooms
};

