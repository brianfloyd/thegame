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
  getAutoPathMaps: gameHandlers.getAutoPathMaps,
  getAutoPathRooms: gameHandlers.getAutoPathRooms,
  calculateAutoPath: gameHandlers.calculateAutoPath,
  startAutoNavigation: gameHandlers.startAutoNavigation,
  
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
  getHarvestFormulaConfigs: npcEditorHandlers.getHarvestFormulaConfigs,
  updateHarvestFormulaConfig: npcEditorHandlers.updateHarvestFormulaConfig,
  
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
  // IMPORTANT: Only interrupt for commands that are NOT safe AND NOT the harvest command itself
  // Also skip this check entirely if the command type is undefined or empty
  if (playerData.playerId && type && typeof type === 'string') {
    const cmdType = type.toLowerCase();
    const isSafeCommand = isHarvestSafeCommand(cmdType);
    const isHarvestCmd = cmdType === 'harvest';
    
    // Only interrupt harvest for commands that are not safe and not the harvest command
    if (!isSafeCommand && !isHarvestCmd) {
      const activeSession = await findPlayerHarvestSession(ctx.db, playerData.playerId);
      if (activeSession) {
        // Check if harvest just started (less than 2 seconds ago) - if so, don't interrupt
        // This prevents race conditions where a command is sent immediately after harvest starts
        const roomNpcResult = await ctx.db.query('SELECT state FROM room_npcs WHERE id = $1', [activeSession.roomNpcId]);
        if (roomNpcResult.rows[0] && roomNpcResult.rows[0].state) {
          try {
            const npcState = JSON.parse(roomNpcResult.rows[0].state);
            if (npcState.harvest_start_time && typeof npcState.harvest_start_time === 'number') {
              const harvestAge = Date.now() - npcState.harvest_start_time;
              if (harvestAge < 2000) {
                // Harvest just started, don't interrupt it
                // Continue to handler without interrupting
              } else {
                // Harvest has been active for more than 2 seconds, safe to interrupt
                await endHarvestSession(ctx.db, activeSession.roomNpcId, true);
                ctx.ws.send(JSON.stringify({ 
                  type: 'message', 
                  message: 'Your harvesting has been interrupted.' 
                }));
              }
            } else {
              // No harvest_start_time, proceed with interruption
              await endHarvestSession(ctx.db, activeSession.roomNpcId, true);
              ctx.ws.send(JSON.stringify({ 
                type: 'message', 
                message: 'Your harvesting has been interrupted.' 
              }));
            }
          } catch (e) {
            // If we can't parse state, proceed with interruption
            await endHarvestSession(ctx.db, activeSession.roomNpcId, true);
            ctx.ws.send(JSON.stringify({ 
              type: 'message', 
              message: 'Your harvesting has been interrupted.' 
            }));
          }
        } else {
          // No state found, proceed with interruption
          await endHarvestSession(ctx.db, activeSession.roomNpcId, true);
          ctx.ws.send(JSON.stringify({ 
            type: 'message', 
            message: 'Your harvesting has been interrupted.' 
          }));
        }
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

