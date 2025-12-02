/**
 * Message Dispatcher
 * 
 * Routes incoming WebSocket messages to appropriate handlers
 * based on message type.
 */

const gameHandlers = require('./game');
const mapEditorHandlers = require('./mapEditor');
const npcEditorHandlers = require('./npcEditor');
const itemEditorHandlers = require('./itemEditor');
const playerEditorHandlers = require('./playerEditor');
const { isHarvestSafeCommand, findPlayerHarvestSession, endHarvestSession } = require('../services/npcCycleEngine');

// Map of message types to handler functions
const handlerMap = {
  // Game handlers
  authenticateSession: gameHandlers.authenticateSession,
  move: gameHandlers.move,
  look: gameHandlers.look,
  inventory: gameHandlers.inventory,
  take: gameHandlers.take,
  drop: gameHandlers.drop,
  factoryWidgetAddItem: gameHandlers.factoryWidgetAddItem,
  harvest: gameHandlers.harvest,
  resonate: gameHandlers.resonate,
  talk: gameHandlers.talk,
  ask: gameHandlers.ask,
  telepath: gameHandlers.telepath,
  solve: gameHandlers.solve,
  clue: gameHandlers.clue,
  greet: gameHandlers.greet,
  restartServer: gameHandlers.restartServer,
  warehouse: gameHandlers.warehouse,
  store: gameHandlers.store,
  withdraw: gameHandlers.withdraw,
  list: gameHandlers.list,
  deposit: gameHandlers.deposit,
  balance: gameHandlers.balance,
  buy: gameHandlers.buy,
  sell: gameHandlers.sell,
  wealth: gameHandlers.wealth,
  who: gameHandlers.who,
  saveTerminalMessage: gameHandlers.saveTerminalMessage,
  assignAttributePoint: gameHandlers.assignAttributePoint,
  
  // Map editor handlers
  getMapEditorData: mapEditorHandlers.getMapEditorData,
  createMap: mapEditorHandlers.createMap,
  createRoom: mapEditorHandlers.createRoom,
  deleteRoom: mapEditorHandlers.deleteRoom,
  updateRoom: mapEditorHandlers.updateRoom,
  getAllMaps: mapEditorHandlers.getAllMaps,
  connectMaps: mapEditorHandlers.connectMaps,
  disconnectMap: mapEditorHandlers.disconnectMap,
  getAllRoomTypeColors: mapEditorHandlers.getAllRoomTypeColors,
  getAllRoomTypes: mapEditorHandlers.getAllRoomTypes,
  setRoomTypeColor: mapEditorHandlers.setRoomTypeColor,
  getJumpMaps: mapEditorHandlers.getJumpMaps,
  getJumpRooms: mapEditorHandlers.getJumpRooms,
  jumpToRoom: mapEditorHandlers.jumpToRoom,
  getRoomItemsForEditor: mapEditorHandlers.getRoomItemsForEditor,
  addItemToRoom: mapEditorHandlers.addItemToRoom,
  removeItemFromRoom: mapEditorHandlers.removeItemFromRoom,
  clearAllItemsFromRoom: mapEditorHandlers.clearAllItemsFromRoom,
  getMerchantInventory: mapEditorHandlers.getMerchantInventory,
  addItemToMerchantRoom: mapEditorHandlers.addItemToMerchantRoom,
  updateMerchantItemConfig: mapEditorHandlers.updateMerchantItemConfig,
  removeMerchantItem: mapEditorHandlers.removeMerchantItem,
  
  // NPC editor handlers
  getAllNPCs: npcEditorHandlers.getAllNPCs,
  createNPC: npcEditorHandlers.createNPC,
  updateNPC: npcEditorHandlers.updateNPC,
  getNpcPlacements: npcEditorHandlers.getNpcPlacements,
  getNpcPlacementRooms: npcEditorHandlers.getNpcPlacementRooms,
  getNpcPlacementMaps: npcEditorHandlers.getNpcPlacementMaps,
  addNpcToRoom: npcEditorHandlers.addNpcToRoom,
  removeNpcFromRoom: npcEditorHandlers.removeNpcFromRoom,
  
  // Item editor handlers
  getAllItems: itemEditorHandlers.getAllItems,
  getAllItemTypes: itemEditorHandlers.getAllItemTypes,
  getWarehouseRooms: itemEditorHandlers.getWarehouseRooms,
  getMerchantRooms: itemEditorHandlers.getMerchantRooms,
  getMerchantItems: itemEditorHandlers.getMerchantItems,
  addItemToMerchant: itemEditorHandlers.addItemToMerchant,
  updateMerchantItem: itemEditorHandlers.updateMerchantItem,
  removeItemFromMerchant: itemEditorHandlers.removeItemFromMerchant,
  createItem: itemEditorHandlers.createItem,
  updateItem: itemEditorHandlers.updateItem,
  
  // Player editor handlers
  getAllPlayers: playerEditorHandlers.getAllPlayers,
  updatePlayer: playerEditorHandlers.updatePlayer,
  getPlayerInventory: playerEditorHandlers.getPlayerInventory,
  addPlayerInventoryItem: playerEditorHandlers.addPlayerInventoryItem,
  removePlayerInventoryItem: playerEditorHandlers.removePlayerInventoryItem
};

/**
 * Dispatch a message to the appropriate handler
 * @param {object} ctx - Context object with ws, db, connectedPlayers, etc.
 * @param {object} data - Parsed message data with type field
 * @returns {Promise<object|undefined>} Handler result (for authenticateSession)
 */
async function dispatch(ctx, data) {
  const { type } = data;
  
  if (!type) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Message type required' }));
    return;
  }
  
  // Special handling for authenticateSession - returns connection info
  if (type === 'authenticateSession') {
    return await handlerMap.authenticateSession(ctx, data);
  }
  
  // All other messages require authentication
  if (!ctx.connectionId || !ctx.connectedPlayers.has(ctx.connectionId)) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated. Please authenticate first.' }));
    return;
  }
  
  // Get player data for harvest interruption check
  const playerData = ctx.connectedPlayers.get(ctx.connectionId);
  ctx.playerName = playerData.playerName;
  
  // Harvest interruption check (for non-safe commands)
  if (playerData.playerId && type) {
    const cmdType = type.toLowerCase();
    const isSafeCommand = isHarvestSafeCommand(cmdType);
    const isHarvestCmd = cmdType === 'harvest';
    
    if (!isSafeCommand && !isHarvestCmd) {
      const activeSession = await findPlayerHarvestSession(ctx.db, playerData.playerId);
      if (activeSession) {
        await endHarvestSession(ctx.db, activeSession.roomNpcId, true);
        ctx.ws.send(JSON.stringify({ 
          type: 'message', 
          message: 'Your harvesting has been interrupted.' 
        }));
      }
    }
  }
  
  // Find and call the handler
  const handler = handlerMap[type];
  if (!handler) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${type}` }));
    return;
  }
  
  return await handler(ctx, data);
}

/**
 * Get all registered message types
 * @returns {string[]} Array of message type names
 */
function getMessageTypes() {
  return Object.keys(handlerMap);
}

module.exports = {
  dispatch,
  getMessageTypes,
  handlerMap
};

