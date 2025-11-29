/**
 * Map Editor Handlers
 * 
 * WebSocket handlers for map management (God Mode only)
 * Handles: getMapEditorData, createMap, createRoom, deleteRoom, updateRoom,
 *          getAllMaps, connectMaps, disconnectMap, getAllRoomTypeColors,
 *          setRoomTypeColor, getJumpMaps, getJumpRooms, jumpToRoom,
 *          getRoomItemsForEditor, addItemToRoom, removeItemFromRoom, clearAllItemsFromRoom
 */

const WebSocket = require('ws');
const { 
  verifyGodMode, 
  getExits, 
  broadcastToRoom, 
  getConnectedPlayersInRoom,
  isRoomEmpty,
  sendRoomUpdate 
} = require('../utils/broadcast');
const { findPlayerHarvestSession, endHarvestSession } = require('../services/npcCycleEngine');

/**
 * Get map editor data for a specific map
 */
async function getMapEditorData(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const mapId = data.mapId;
  const map = await db.getMapById(mapId);
  if (!map) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map not found' }));
    return;
  }

  const rooms = await db.getRoomsByMap(mapId);
  const roomTypeColors = await db.getAllRoomTypeColors();
  const colorMap = {};
  roomTypeColors.forEach(rtc => {
    colorMap[rtc.room_type] = rtc.color;
  });
  
  // Get all room types for dropdown population
  const roomTypes = await db.getAllRoomTypes();
  const roomTypeList = roomTypes.map(rt => rt.room_type);
  
  ws.send(JSON.stringify({
    type: 'mapEditorData',
    rooms: rooms.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      x: r.x,
      y: r.y,
      roomType: r.room_type || 'normal',
      mapId: r.map_id,
      connected_map_id: r.connected_map_id,
      connected_room_x: r.connected_room_x,
      connected_room_y: r.connected_room_y,
      connection_direction: r.connection_direction
    })),
    roomTypeColors: colorMap,
    roomTypes: roomTypeList,
    mapId: map.id,
    mapName: map.name
  }));
}

/**
 * Create a new map
 */
async function createMap(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { name, width, height, description } = data;
  if (!name) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map name required' }));
    return;
  }

  try {
    const mapId = await db.createMap(name, width || 100, height || 100, description || '');
    ws.send(JSON.stringify({
      type: 'mapCreated',
      mapId: mapId,
      name: name
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create map: ' + err.message }));
  }
}

/**
 * Create a new room in a map
 */
async function createRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { mapId, name, description, x, y, roomType } = data;
  if (!name || mapId === undefined || x === undefined || y === undefined) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
    return;
  }

  // Validate room type - must be one of the 4 allowed types
  const validRoomType = roomType || 'normal';
  const allowedTypes = ['normal', 'merchant', 'factory', 'warehouse'];
  if (!allowedTypes.includes(validRoomType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid room type: ${validRoomType}. Valid types: ${allowedTypes.join(', ')}` }));
    return;
  }
  
  // Also verify it exists in room_type_colors table
  const allRoomTypes = await db.getAllRoomTypes();
  const dbTypes = allRoomTypes.map(rt => rt.room_type);
  if (!dbTypes.includes(validRoomType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Room type ${validRoomType} not found in database. Please add it to room_type_colors first.` }));
    return;
  }

  // Check if room already exists at these coordinates
  const existing = await db.getRoomByCoords(mapId, x, y);
  if (existing) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room already exists at these coordinates' }));
    return;
  }

  try {
    const roomId = await db.createRoom(name, description || '', x, y, mapId, validRoomType);
    const room = await db.getRoomById(roomId);
    
    // Update map size based on new room
    await db.updateMapSize(mapId);
    
    ws.send(JSON.stringify({
      type: 'roomCreated',
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        x: room.x,
        y: room.y,
        roomType: room.room_type || 'normal',
        mapId: room.map_id
      }
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create room: ' + err.message }));
  }
}

/**
 * Delete a room
 */
async function deleteRoom(ctx, data) {
  const { ws, db } = ctx;
  
  const { roomId } = data;
  
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID is required' }));
    return;
  }
  
  // Get room to check if it's connected
  const room = await db.getRoomById(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is part of a map connection
  if (room.connected_map_id !== null && room.connected_map_id !== undefined) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Cannot delete room "${room.name}" (${room.x},${room.y}) - it is part of a map connection. Please disconnect it first.` 
    }));
    return;
  }
  
  // Check if any other room connects to this room (incoming connection)
  const allRooms = await db.getAllRooms();
  const connectingRoom = allRooms.find(r => 
    r.connected_map_id === room.map_id && 
    r.connected_room_x === room.x && 
    r.connected_room_y === room.y
  );
  
  if (connectingRoom) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Cannot delete room "${room.name}" (${room.x},${room.y}) - another room connects to it. Please disconnect it first.` 
    }));
    return;
  }
  
  // Delete the room
  await db.query('DELETE FROM rooms WHERE id = $1', [roomId]);
  
  // Notify client
  ws.send(JSON.stringify({ type: 'roomDeleted', roomId: roomId }));
}

/**
 * Update a room
 */
async function updateRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId, name, description, roomType } = data;
  if (!roomId || !name) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
    return;
  }

  // Validate room type - must be one of the 4 allowed types
  const validRoomType = roomType || 'normal';
  const allowedTypes = ['normal', 'merchant', 'factory', 'warehouse'];
  if (!allowedTypes.includes(validRoomType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid room type: ${validRoomType}. Valid types: ${allowedTypes.join(', ')}` }));
    return;
  }
  
  // Also verify it exists in room_type_colors table
  const allRoomTypes = await db.getAllRoomTypes();
  const dbTypes = allRoomTypes.map(rt => rt.room_type);
  if (!dbTypes.includes(validRoomType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Room type ${validRoomType} not found in database. Please add it to room_type_colors first.` }));
    return;
  }

  try {
    await db.updateRoom(roomId, name, description || '', validRoomType);
    const room = await db.getRoomById(roomId);
    
    ws.send(JSON.stringify({
      type: 'roomUpdated',
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        x: room.x,
        y: room.y,
        roomType: room.room_type || 'normal',
        mapId: room.map_id
      }
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update room: ' + err.message }));
  }
}

/**
 * Get all maps
 */
async function getAllMaps(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const maps = await db.getAllMaps();
  ws.send(JSON.stringify({
    type: 'allMaps',
    maps: maps.map(m => ({ id: m.id, name: m.name }))
  }));
}

/**
 * Connect two maps
 */
async function connectMaps(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { sourceRoomId, sourceDirection, targetMapId, targetX, targetY } = data;
  
  // Get source room
  const sourceRoom = await db.getRoomById(sourceRoomId);
  if (!sourceRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Source room not found' }));
    return;
  }

  // Validate source room has available exit in requested direction
  const exits = await getExits(db, sourceRoom);
  const directionMap = {
    'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
    'NE': 'northeast', 'NW': 'northwest', 'SE': 'southeast', 'SW': 'southwest'
  };
  const exitKey = directionMap[sourceDirection];
  if (!exitKey || exits[exitKey]) {
    ws.send(JSON.stringify({ type: 'error', message: 'Source room already has exit in that direction' }));
    return;
  }

  // Check if target room exists
  const targetRoom = await db.getRoomByCoords(targetMapId, targetX, targetY);
  if (!targetRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Target room does not exist at those coordinates' }));
    return;
  }

  // Calculate opposite direction
  const oppositeDir = {
    'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
    'NE': 'SW', 'NW': 'SE', 'SE': 'NW', 'SW': 'NE'
  };
  const targetDirection = oppositeDir[sourceDirection];

  // Validate target room has available exit in opposite direction
  const targetExits = await getExits(db, targetRoom);
  const targetExitKey = directionMap[targetDirection];
  if (!targetExitKey || targetExits[targetExitKey]) {
    ws.send(JSON.stringify({ type: 'error', message: 'Target room already has exit in opposite direction' }));
    return;
  }

  // Update source room with connection
  await db.query(`
    UPDATE rooms 
    SET connected_map_id = $1, connected_room_x = $2, connected_room_y = $3, connection_direction = $4
    WHERE id = $5
  `, [targetMapId, targetX, targetY, sourceDirection, sourceRoomId]);

  // Update target room with reverse connection
  await db.query(`
    UPDATE rooms 
    SET connected_map_id = $1, connected_room_x = $2, connected_room_y = $3, connection_direction = $4
    WHERE id = $5
  `, [sourceRoom.map_id, sourceRoom.x, sourceRoom.y, targetDirection, targetRoom.id]);

  // Get updated rooms
  const updatedSource = await db.getRoomById(sourceRoomId);
  const updatedTarget = await db.getRoomById(targetRoom.id);

  ws.send(JSON.stringify({
    type: 'mapConnected',
    sourceRoom: {
      id: updatedSource.id,
      name: updatedSource.name,
      x: updatedSource.x,
      y: updatedSource.y,
      mapId: updatedSource.map_id
    },
    targetRoom: {
      id: updatedTarget.id,
      name: updatedTarget.name,
      x: updatedTarget.x,
      y: updatedTarget.y,
      mapId: updatedTarget.map_id
    }
  }));
}

/**
 * Disconnect a map connection from a room
 */
async function disconnectMap(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId } = data;
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
    return;
  }

  try {
    const room = await db.getRoomById(roomId);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }

    // Disconnect the room (handles both ends and orphaned connections)
    await db.disconnectRoom(roomId);

    // Get updated room
    const updatedRoom = await db.getRoomById(roomId);

    ws.send(JSON.stringify({
      type: 'mapDisconnected',
      room: {
        id: updatedRoom.id,
        name: updatedRoom.name,
        x: updatedRoom.x,
        y: updatedRoom.y,
        mapId: updatedRoom.map_id
      }
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to disconnect: ' + err.message }));
  }
}

/**
 * Get all room type colors
 */
async function getAllRoomTypeColors(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const roomTypeColors = await db.getAllRoomTypeColors();
  const colorMap = {};
  roomTypeColors.forEach(rtc => {
    colorMap[rtc.room_type] = rtc.color;
  });
  ws.send(JSON.stringify({ type: 'roomTypeColors', colors: colorMap }));
}

/**
 * Get all room types (for dropdown population)
 */
async function getAllRoomTypes(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  // Ensure warehouse exists in database (in case migration hasn't run)
  try {
    await db.setRoomTypeColor('warehouse', '#00ffff');
  } catch (err) {
    // Ignore errors - warehouse may already exist
    console.log('Note: Could not ensure warehouse room type exists:', err.message);
  }

  // Remove 'shop' if it exists (consolidate to 'merchant')
  try {
    // First convert any rooms with 'shop' type to 'merchant'
    await db.query('UPDATE rooms SET room_type = $1 WHERE room_type = $2', ['merchant', 'shop']);
    // Then delete 'shop' from room_type_colors
    await db.query('DELETE FROM room_type_colors WHERE room_type = $1', ['shop']);
  } catch (err) {
    // Ignore errors - shop may not exist
    console.log('Note: Could not remove shop room type:', err.message);
  }

  const roomTypes = await db.getAllRoomTypes();
  const roomTypeList = roomTypes.map(rt => rt.room_type);
  ws.send(JSON.stringify({ type: 'allRoomTypes', roomTypes: roomTypeList }));
}

/**
 * Set a room type color
 */
async function setRoomTypeColor(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomType, color } = data;
  if (!roomType || !color) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room type and color required' }));
    return;
  }

  try {
    await db.setRoomTypeColor(roomType, color);
    ws.send(JSON.stringify({
      type: 'roomTypeColorUpdated',
      roomType,
      color
    }));
    
    // Broadcast to all connected map editors to refresh colors
    for (const [_, playerData] of connectedPlayers) {
      if (playerData.ws.readyState === WebSocket.OPEN) {
        const otherPlayer = await db.getPlayerByName(playerData.playerName);
        if (otherPlayer && otherPlayer.flag_god_mode === 1) {
          const roomTypeColors = await db.getAllRoomTypeColors();
          const colorMap = {};
          roomTypeColors.forEach(rtc => {
            colorMap[rtc.room_type] = rtc.color;
          });
          playerData.ws.send(JSON.stringify({
            type: 'roomTypeColors',
            colors: colorMap
          }));
        }
      }
    }
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to set room type color: ' + err.message }));
  }
}

/**
 * Get maps for jump/teleport widget
 */
async function getJumpMaps(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const maps = await db.getAllMaps();
  ws.send(JSON.stringify({ type: 'jumpMaps', maps }));
}

/**
 * Get rooms for jump/teleport widget
 */
async function getJumpRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { mapId } = data;
  if (!mapId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map ID required' }));
    return;
  }

  const rooms = await db.getRoomsByMap(mapId);
  ws.send(JSON.stringify({ type: 'jumpRooms', rooms }));
}

/**
 * Teleport player to a room
 */
async function jumpToRoom(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, connectionId } = ctx;
  
  if (!connectionId || !connectedPlayers.has(connectionId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
    return;
  }
  const jumpPlayerData = connectedPlayers.get(connectionId);
  const currentPlayerName = jumpPlayerData.playerName;

  const player = await db.getPlayerByName(currentPlayerName);
  if (!player || player.flag_god_mode !== 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId } = data;
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
    return;
  }

  const targetRoom = await db.getRoomById(roomId);
  if (!targetRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }

  // Update player's room in database
  await db.updatePlayerRoom(targetRoom.id, currentPlayerName);
  
  // Update connected player data
  const oldRoomId = jumpPlayerData.roomId;
  jumpPlayerData.roomId = targetRoom.id;

  // End any active harvest session
  if (jumpPlayerData.playerId) {
    const activeSession = await findPlayerHarvestSession(db, jumpPlayerData.playerId);
    if (activeSession) {
      await endHarvestSession(db, activeSession.roomNpcId, true);
    }
  }

  // Drop factory widget items to ground if player was in factory room
  const oldFactoryState = factoryWidgetState.get(connectionId);
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
      factoryWidgetState.delete(connectionId);
      
      // Check if room is now empty and remove poofable items
      if (isRoomEmpty(connectedPlayers, oldRoomId)) {
        await db.removePoofableItemsFromRoom(oldRoomId);
      }
    }
  } else {
    // Remove poofable items from old room
    await db.removePoofableItemsFromRoom(oldRoomId);
  }

  // Notify players in old room
  broadcastToRoom(connectedPlayers, oldRoomId, {
    type: 'playerLeft',
    playerName: currentPlayerName
  }, connectionId);

  // Get new room data
  const playersInNewRoom = getConnectedPlayersInRoom(connectedPlayers, targetRoom.id).filter(p => p !== currentPlayerName);
  const exits = await getExits(db, targetRoom);
  const map = await db.getMapById(targetRoom.map_id);
  const npcsInNewRoomRaw = await db.getNPCsInRoom(targetRoom.id);
  const npcsInNewRoom = npcsInNewRoomRaw.map(npc => ({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    state: npc.state,
    color: npc.color
  }));
  const roomItems = await db.getRoomItems(targetRoom.id);

  // Get factory widget state if room is factory type
  let factoryState = null;
  if (targetRoom.room_type === 'factory') {
    const existingState = factoryWidgetState.get(connectionId);
    if (existingState && existingState.roomId === targetRoom.id) {
      factoryState = {
        slots: existingState.slots,
        textInput: existingState.textInput || ''
      };
    } else {
      // Initialize empty factory state
      factoryState = {
        slots: [null, null],
        textInput: ''
      };
      factoryWidgetState.set(connectionId, {
        roomId: targetRoom.id,
        slots: [null, null],
        textInput: ''
      });
    }
  } else {
    // Clear factory state if leaving factory room
    factoryWidgetState.delete(connectionId);
  }

  // Send moved message to player
  ws.send(JSON.stringify({
    type: 'moved',
    room: {
      ...targetRoom,
      roomType: targetRoom.room_type || 'normal'
    },
    players: playersInNewRoom,
    exits: exits,
    npcs: npcsInNewRoom,
    roomItems: roomItems,
    mapName: map ? map.name : '',
    showFullInfo: true,
    factoryWidgetState: factoryState
  }));

  // Send map update
  const mapRooms = await db.getRoomsByMap(targetRoom.map_id);
  ws.send(JSON.stringify({
    type: 'mapData',
    rooms: mapRooms.map(r => ({
      id: r.id,
      name: r.name,
      x: r.x,
      y: r.y,
      mapId: r.map_id,
      roomType: r.room_type,
      connected_map_id: r.connected_map_id
    })),
    currentRoom: { x: targetRoom.x, y: targetRoom.y },
    mapId: targetRoom.map_id
  }));

  // Notify players in new room
  broadcastToRoom(connectedPlayers, targetRoom.id, {
    type: 'playerJoined',
    playerName: currentPlayerName
  }, connectionId);

  ws.send(JSON.stringify({ 
    type: 'message', 
    message: `Teleported to ${targetRoom.name}` 
  }));
}

/**
 * Get room items for map editor
 */
async function getRoomItemsForEditor(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId } = data;
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
    return;
  }

  const roomItems = await db.getRoomItems(roomId);
  const allItems = await db.getAllItems();
  ws.send(JSON.stringify({
    type: 'roomItemsForEditor',
    roomId,
    roomItems,
    allItems
  }));
}

/**
 * Add item to room
 */
async function addItemToRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId, itemName, quantity } = data;
  if (!roomId || !itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID and item name required' }));
    return;
  }

  try {
    await db.addRoomItem(roomId, itemName, quantity || 1);
    const roomItems = await db.getRoomItems(roomId);
    ws.send(JSON.stringify({
      type: 'roomItemAdded',
      roomId,
      itemName,
      roomItems
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to add item: ' + err.message }));
  }
}

/**
 * Remove item from room
 */
async function removeItemFromRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId, itemName, quantity } = data;
  if (!roomId || !itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID and item name required' }));
    return;
  }

  try {
    await db.removeRoomItem(roomId, itemName, quantity || 1);
    const roomItems = await db.getRoomItems(roomId);
    ws.send(JSON.stringify({
      type: 'roomItemRemoved',
      roomId,
      itemName,
      roomItems
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to remove item: ' + err.message }));
  }
}

/**
 * Clear all items from a room
 */
async function clearAllItemsFromRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { roomId } = data;
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
    return;
  }

  try {
    // Get all items in room and remove them all
    const currentItems = await db.getRoomItems(roomId);
    for (const item of currentItems) {
      await db.removeRoomItem(roomId, item.item_name, item.quantity);
    }
    ws.send(JSON.stringify({
      type: 'roomItemsCleared',
      roomId,
      roomItems: []
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to clear items: ' + err.message }));
  }
}

module.exports = {
  getMapEditorData,
  createMap,
  createRoom,
  deleteRoom,
  updateRoom,
  getAllMaps,
  connectMaps,
  disconnectMap,
  getAllRoomTypeColors,
  getAllRoomTypes,
  setRoomTypeColor,
  getJumpMaps,
  getJumpRooms,
  jumpToRoom,
  getRoomItemsForEditor,
  addItemToRoom,
  removeItemFromRoom,
  clearAllItemsFromRoom
};


