/**
 * Game Handlers
 * 
 * WebSocket handlers for core gameplay
 * Handles: authenticateSession, move, look, inventory, take, drop, harvest, factoryWidgetAddItem, resonate, talk, telepath, solve, clue
 */

const WebSocket = require('ws');
const { 
  getConnectedPlayersInRoom, 
  isRoomEmpty, 
  broadcastToRoom,
  broadcastToAll, 
  sendPlayerStats,
  getExits,
  sendRoomUpdate 
} = require('../utils/broadcast');
const { findPlayerHarvestSession, endHarvestSession } = require('../services/npcCycleEngine');

// Track Lore Keeper engagement timers per connectionId
const loreKeeperEngagementTimers = new Map();

/**
 * Cancel any pending Lore Keeper engagement for a connection
 */
function cancelLoreKeeperEngagement(connectionId) {
  const timers = loreKeeperEngagementTimers.get(connectionId);
  if (timers) {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    loreKeeperEngagementTimers.delete(connectionId);
  }
}

/**
 * Trigger Lore Keeper engagement for a player entering a room
 * Only sends initial message if player hasn't already been greeted by this NPC (persists across sessions)
 */
async function triggerLoreKeeperEngagement(db, connectedPlayers, connectionId, roomId) {
  // Cancel any existing engagement timers
  cancelLoreKeeperEngagement(connectionId);
  
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || playerData.ws.readyState !== WebSocket.OPEN || !playerData.playerId) {
    return;
  }
  
  // Get Lore Keepers in the room
  const loreKeepers = await db.getLoreKeepersInRoom(roomId);
  if (!loreKeepers || loreKeepers.length === 0) {
    return;
  }
  
  const timers = [];
  
  for (const lk of loreKeepers) {
    if (!lk.engagementEnabled || !lk.initialMessage) {
      continue;
    }
    
    // Check database to see if player has already been greeted by this Lore Keeper
    const hasBeenGreeted = await db.hasPlayerBeenGreetedByLoreKeeper(playerData.playerId, lk.npcId);
    if (hasBeenGreeted) {
      continue;
    }
    
    // Set up delayed engagement
    const timer = setTimeout(async () => {
      // Verify player is still in the room and connected
      const currentPlayerData = connectedPlayers.get(connectionId);
      if (!currentPlayerData || 
          currentPlayerData.ws.readyState !== WebSocket.OPEN ||
          currentPlayerData.roomId !== roomId) {
        return;
      }
      
      // Mark as greeted in database before sending (so re-entering room won't re-trigger)
      await db.markPlayerGreetedByLoreKeeper(currentPlayerData.playerId, lk.npcId);
      
      // Send engagement message to the player only
      currentPlayerData.ws.send(JSON.stringify({
        type: 'loreKeeperMessage',
        npcName: lk.name,
        npcColor: lk.displayColor,
        message: lk.initialMessage,
        messageColor: lk.initialMessageColor,
        keywordColor: lk.keywordColor
      }));
    }, lk.engagementDelay);
    
    timers.push(timer);
  }
  
  if (timers.length > 0) {
    loreKeeperEngagementTimers.set(connectionId, timers);
  }
}

/**
 * Authenticate a WebSocket session
 */
async function authenticateSession(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, session, sessionId, playerName } = ctx;
  
  // Validate session
  if (!session || !sessionId) {
    ws.send(JSON.stringify({ type: 'error', message: 'No valid session. Please select a character first.' }));
    return { authenticated: false };
  }

  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return { authenticated: false };
  }

  // Generate unique connection ID for this WebSocket
  const connectionId = `conn_${ctx.nextConnectionId++}`;
  
  // Store the connectionId on the ws object for cleanup on disconnect
  ws.connectionId = connectionId;

  // Store connection using unique connectionId (allows same player from multiple tabs)
  const room = await db.getRoomById(player.current_room_id);
  connectedPlayers.set(connectionId, { 
    ws, 
    roomId: room.id, 
    playerName: player.name,
    playerId: player.id,
    sessionId: sessionId
  });

  // Send initial room update (with full info for first display)
  await sendRoomUpdate(connectedPlayers, factoryWidgetState, db, connectionId, room, true);

  // Send player stats (dynamically extracted using configuration)
  const playerStats = db.getPlayerStats(player);
  if (playerStats) {
    playerStats.playerName = player.name;
    playerStats.currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
  }
  ws.send(JSON.stringify({
    type: 'playerStats',
    stats: playerStats || {}
  }));

  // Broadcast system message: player entered the game
  broadcastToAll(connectedPlayers, {
    type: 'systemMessage',
    message: `${player.name} has entered the game.`
  }, connectionId);

  // Send map data (only rooms from current map - no preview of connected maps)
  const mapRooms = await db.getRoomsByMap(room.map_id);
  const allRooms = mapRooms.map(r => ({
    id: r.id,
    name: r.name,
    x: r.x,
    y: r.y,
    mapId: r.map_id,
    roomType: r.room_type || 'normal',
    connected_map_id: r.connected_map_id || null
  }));
  
  // Get room type colors
  const roomTypeColors = await db.getAllRoomTypeColors();
  const colorMap = {};
  roomTypeColors.forEach(rtc => {
    colorMap[rtc.room_type] = rtc.color;
  });
  
  ws.send(JSON.stringify({
    type: 'mapData',
    rooms: allRooms,
    roomTypeColors: colorMap,
    currentRoom: {
      x: room.x,
      y: room.y
    },
    mapId: room.map_id
  }));

  // Notify others in the room (exclude this connection)
  broadcastToRoom(connectedPlayers, room.id, {
    type: 'playerJoined',
    playerName: playerName
  }, connectionId);

  // Trigger Lore Keeper engagement for entering this room
  await triggerLoreKeeperEngagement(db, connectedPlayers, connectionId, room.id);

  console.log(`Player ${playerName} connected (${connectionId}) in room ${room.name}`);
  return { authenticated: true, connectionId };
}

/**
 * Handle player movement
 */
async function move(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, connectionId, sessionId, playerName } = ctx;
  
  if (!sessionId || !playerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }

  // Check encumbrance level and apply movement restrictions
  const currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
  const maxEncumbrance = player.resource_max_encumbrance || 100;
  const encumbrancePercent = (currentEncumbrance / maxEncumbrance) * 100;
  
  // Stuck - can't move at all
  if (encumbrancePercent >= 100) {
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: "You are too heavy to move. Drop items to lower your encumbrance." 
    }));
    return;
  }
  
  // Check if player has a movement cooldown in progress
  const playerData = connectedPlayers.get(connectionId);
  const now = Date.now();
  
  if (playerData && playerData.nextMoveTime && now < playerData.nextMoveTime) {
    const remainingMs = playerData.nextMoveTime - now;
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `You're moving slowly due to your load... (${(remainingMs / 1000).toFixed(1)}s)` 
    }));
    return;
  }
  
  // Determine movement delay based on encumbrance level
  let moveDelay = 0;
  if (encumbrancePercent >= 66.6) {
    moveDelay = 1200; // Heavy: 1.2s delay
  } else if (encumbrancePercent >= 33.3) {
    moveDelay = 700; // Medium: 0.7s delay
  }
  
  // Set next move time for this player
  if (moveDelay > 0 && playerData) {
    playerData.nextMoveTime = now + moveDelay;
  }

  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }

  const direction = data.direction.toUpperCase();
  
  // Check if current room has a map connection in this direction
  let targetRoom = null;
  let isMapTransition = false;
  
  if (currentRoom.connection_direction === direction && currentRoom.connected_map_id) {
    // This is a map transition
    isMapTransition = true;
    targetRoom = await db.getRoomByCoords(
      currentRoom.connected_map_id,
      currentRoom.connected_room_x,
      currentRoom.connected_room_y
    );
  } else {
    // Normal movement within same map
    let targetX = currentRoom.x;
    let targetY = currentRoom.y;

    // Handle all direction variations
    if (direction === 'N') {
      targetY += 1;
    } else if (direction === 'S') {
      targetY -= 1;
    } else if (direction === 'E') {
      targetX += 1;
    } else if (direction === 'W') {
      targetX -= 1;
    } else if (direction === 'NE') {
      targetX += 1;
      targetY += 1;
    } else if (direction === 'NW') {
      targetX -= 1;
      targetY += 1;
    } else if (direction === 'SE') {
      targetX += 1;
      targetY -= 1;
    } else if (direction === 'SW') {
      targetX -= 1;
      targetY -= 1;
    } else if (direction === 'U' || direction === 'UP') {
      ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
      return;
    } else if (direction === 'D' || direction === 'DOWN') {
      ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
      return;
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid direction' }));
      return;
    }

    // Check if target room exists in same map
    targetRoom = await db.getRoomByCoords(currentRoom.map_id, targetX, targetY);
  }
  
  if (!targetRoom) {
    // Convert direction code to readable name
    const directionNames = {
      'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
      'NE': 'northeast', 'NW': 'northwest', 'SE': 'southeast', 'SW': 'southwest',
      'U': 'up', 'UP': 'up', 'D': 'down', 'DOWN': 'down'
    };
    const directionName = directionNames[direction] || direction.toLowerCase();
    ws.send(JSON.stringify({ type: 'error', message: `Ouch! You walked into the wall to the ${directionName}.` }));
    return;
  }

  // Update player's room
  await db.updatePlayerRoom(targetRoom.id, playerName);
  const oldRoomId = playerData.roomId;
  playerData.roomId = targetRoom.id;

  // End any active harvest session when moving rooms
  if (playerData.playerId) {
    const activeSession = await findPlayerHarvestSession(db, playerData.playerId);
    if (activeSession) {
      await endHarvestSession(db, activeSession.roomNpcId, true);
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: 'Your harvesting has been interrupted.' 
      }));
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
      
      // Send room update to players still in old room to refresh items
      const updatedOldRoom = await db.getRoomById(oldRoomId);
      if (updatedOldRoom) {
        for (const [otherConnId, otherPlayerData] of connectedPlayers) {
          if (otherPlayerData.roomId === oldRoomId && 
              otherPlayerData.ws.readyState === WebSocket.OPEN &&
              otherConnId !== connectionId) {
            await sendRoomUpdate(connectedPlayers, factoryWidgetState, db, otherConnId, updatedOldRoom);
          }
        }
      }
    }
  } else {
    // Remove poofable items from old room when player leaves (non-factory rooms)
    await db.removePoofableItemsFromRoom(oldRoomId);
    
    // Send room update to players still in old room to refresh items
    const oldRoom = await db.getRoomById(oldRoomId);
    if (oldRoom) {
      for (const [otherConnId, otherPlayerData] of connectedPlayers) {
        if (otherPlayerData.roomId === oldRoomId && 
            otherPlayerData.ws.readyState === WebSocket.OPEN &&
            otherConnId !== connectionId) {
          await sendRoomUpdate(connectedPlayers, factoryWidgetState, db, otherConnId, oldRoom);
        }
      }
    }
  }

  // Direction names for messages
  const directionNamesForMsg = {
    'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
    'NE': 'northeast', 'NW': 'northwest', 'SE': 'southeast', 'SW': 'southwest',
    'U': 'up', 'D': 'down'
  };
  const oppositeDirection = {
    'N': 'south', 'S': 'north', 'E': 'west', 'W': 'east',
    'NE': 'southwest', 'NW': 'southeast', 'SE': 'northwest', 'SW': 'northeast',
    'U': 'below', 'D': 'above'
  };
  const leftDirection = directionNamesForMsg[direction] || direction.toLowerCase();
  const enteredFrom = oppositeDirection[direction] || 'somewhere';

  // Notify players in old room
  broadcastToRoom(connectedPlayers, oldRoomId, {
    type: 'playerLeft',
    playerName: playerName,
    direction: leftDirection
  }, connectionId);

  // Send moved message to moving player
  const playersInNewRoom = getConnectedPlayersInRoom(connectedPlayers, targetRoom.id).filter(p => p !== playerName);
  const exits = await getExits(db, targetRoom);
  
  // Get map name
  const map = await db.getMapById(targetRoom.map_id);
  const mapName = map ? map.name : '';
  
  // Get NPCs in the new room
  const npcsInNewRoomRaw = await db.getNPCsInRoom(targetRoom.id);
  const npcsInNewRoom = npcsInNewRoomRaw.map(npc => ({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    state: npc.state,
    color: npc.color
  }));
  
  // Get items on the ground in the new room
  const roomItemsInNewRoom = await db.getRoomItems(targetRoom.id);

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

  if (playerData.ws.readyState === WebSocket.OPEN) {
    playerData.ws.send(JSON.stringify({
      type: 'moved',
      room: {
        id: targetRoom.id,
        name: targetRoom.name,
        description: targetRoom.description,
        x: targetRoom.x,
        y: targetRoom.y,
        mapName: mapName,
        roomType: targetRoom.room_type || 'normal'
      },
      players: playersInNewRoom,
      npcs: npcsInNewRoom,
      roomItems: roomItemsInNewRoom,
      exits: exits,
      showFullInfo: true,
      factoryWidgetState: factoryState
    }));

    // If this was a map transition, send new map data
    if (isMapTransition) {
      const newMapRooms = await db.getRoomsByMap(targetRoom.map_id);
      const allRooms = newMapRooms.map(r => ({
        id: r.id,
        name: r.name,
        x: r.x,
        y: r.y,
        mapId: r.map_id,
        roomType: r.room_type || 'normal',
        connected_map_id: r.connected_map_id || null
      }));
      
      const roomTypeColors = await db.getAllRoomTypeColors();
      const colorMap = {};
      roomTypeColors.forEach(rtc => {
        colorMap[rtc.room_type] = rtc.color;
      });
      
      playerData.ws.send(JSON.stringify({
        type: 'mapData',
        rooms: allRooms,
        roomTypeColors: colorMap,
        currentRoom: {
          x: targetRoom.x,
          y: targetRoom.y
        },
        mapId: targetRoom.map_id
      }));
    } else {
      // Just update map position
      playerData.ws.send(JSON.stringify({
        type: 'mapUpdate',
        currentRoom: {
          x: targetRoom.x,
          y: targetRoom.y
        },
        mapId: targetRoom.map_id
      }));
    }
  }

  // Notify players in new room
  broadcastToRoom(connectedPlayers, targetRoom.id, {
    type: 'playerJoined',
    playerName: playerName,
    direction: enteredFrom
  }, connectionId);

  // Trigger Lore Keeper engagement for entering the new room
  await triggerLoreKeeperEngagement(db, connectedPlayers, connectionId, targetRoom.id);

  console.log(`Player ${playerName} moved from room ${oldRoomId} to room ${targetRoom.id}`);
}

/**
 * Handle look command
 */
async function look(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, connectionId } = ctx;
  
  if (!connectionId || !connectedPlayers.has(connectionId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
    return;
  }
  const lookPlayerData = connectedPlayers.get(connectionId);

  const player = await db.getPlayerByName(lookPlayerData.playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }

  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const target = (data.target || '').trim();
  if (!target) {
    // No specific target: send full room update (same as entering room)
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, db, connectionId, currentRoom, true);
    return;
  }

  // LOOK at NPC in room by (partial) name match
  const npcsInRoom = await db.getNPCsInRoom(currentRoom.id);
  const query = target.toLowerCase();
  const matches = npcsInRoom.filter(npc => 
    npc.name && npc.name.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    ws.send(JSON.stringify({
      type: 'message',
      message: `You don't see "${target}" here.`
    }));
    return;
  }

  // Build description output for all matching NPCs
  const lines = matches.map(npc => {
    const desc = npc.description || 'You see nothing special.';
    return `${npc.name}: ${desc}`;
  });

  ws.send(JSON.stringify({
    type: 'message',
    message: lines.join('\n')
  }));
}

/**
 * Handle inventory command
 */
async function inventory(ctx, data) {
  const { ws, db, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const items = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items }));
}

/**
 * Handle take command
 */
async function take(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const query = (data.itemName || '').toLowerCase().trim();
  if (!query) {
    ws.send(JSON.stringify({ type: 'message', message: 'Take what?' }));
    return;
  }
  
  // Parse quantity (default to 1, or "all", or a number)
  let requestedQuantity = data.quantity !== undefined ? data.quantity : 1;
  const isAll = requestedQuantity === 'all' || requestedQuantity === 'All';
  
  const roomItems = await db.getRoomItems(currentRoom.id);
  const matches = roomItems.filter(i => i.item_name.toLowerCase().includes(query));
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `There is no "${query}" here.` }));
  } else if (matches.length > 1) {
    const names = matches.map(i => i.item_name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
  } else {
    const item = matches[0];
    const availableQuantity = item.quantity;
    
    // Calculate encumbrance limits
    const currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
    const maxEncumbrance = player.resource_max_encumbrance || 100;
    const remainingCapacity = maxEncumbrance - currentEncumbrance;
    const itemEncumbrance = await db.getItemEncumbrance(item.item_name);
    
    // How many can fit in remaining capacity?
    const maxCanCarry = Math.floor(remainingCapacity / itemEncumbrance);
    
    if (maxCanCarry <= 0) {
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `You can't carry any more. You're at ${currentEncumbrance}/${maxEncumbrance} encumbrance.` 
      }));
      return;
    }
    
    // Determine how many to take
    let quantityToTake;
    if (isAll) {
      quantityToTake = Math.min(availableQuantity, maxCanCarry);
    } else {
      quantityToTake = parseInt(requestedQuantity, 10);
      if (isNaN(quantityToTake) || quantityToTake < 1) {
        ws.send(JSON.stringify({ type: 'message', message: 'Invalid quantity.' }));
        return;
      }
      
      if (quantityToTake > availableQuantity) {
        ws.send(JSON.stringify({ 
          type: 'message', 
          message: `There are only ${availableQuantity} ${item.item_name} here.` 
        }));
        return;
      }
      
      // Limit by encumbrance if needed
      if (quantityToTake > maxCanCarry) {
        quantityToTake = maxCanCarry;
      }
    }
    
    // Remove from room and add to player inventory
    await db.removeRoomItem(currentRoom.id, item.item_name, quantityToTake);
    await db.addPlayerItem(player.id, item.item_name, quantityToTake);
    
    // Send feedback message
    let message;
    const newEncumbrance = currentEncumbrance + (quantityToTake * itemEncumbrance);
    if (quantityToTake === 1) {
      message = `You pick up ${item.item_name}. (${newEncumbrance}/${maxEncumbrance})`;
    } else {
      message = `You pick up ${quantityToTake} ${item.item_name}. (${newEncumbrance}/${maxEncumbrance})`;
    }
    
    // Notify if encumbrance limited the pickup
    if (isAll && maxCanCarry < availableQuantity) {
      message += ` You can only carry ${maxCanCarry}.`;
    } else if (!isAll && requestedQuantity > maxCanCarry) {
      message += ` You can only carry ${maxCanCarry}.`;
    }
    
    ws.send(JSON.stringify({ type: 'message', message }));
    
    // Send updated room to player to refresh items on ground
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, db, connectionId, currentRoom);
    
    // Send updated player stats (encumbrance changed)
    await sendPlayerStats(connectedPlayers, db, connectionId);
  }
}

/**
 * Handle drop command
 */
async function drop(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const query = (data.itemName || '').toLowerCase().trim();
  if (!query) {
    ws.send(JSON.stringify({ type: 'message', message: 'Drop what?' }));
    return;
  }
  
  // Parse quantity (default to 1, or "all", or a number)
  let requestedQuantity = data.quantity !== undefined ? data.quantity : 1;
  const isAll = requestedQuantity === 'all' || requestedQuantity === 'All';
  
  const playerItems = await db.getPlayerItems(player.id);
  const matches = playerItems.filter(i => i.item_name.toLowerCase().includes(query));
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't have "${query}".` }));
  } else if (matches.length > 1) {
    const names = matches.map(i => i.item_name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
  } else {
    const item = matches[0];
    const availableQuantity = item.quantity;
    
    // Determine how many to drop
    let quantityToDrop;
    if (isAll) {
      quantityToDrop = availableQuantity;
    } else {
      quantityToDrop = parseInt(requestedQuantity, 10);
      if (isNaN(quantityToDrop) || quantityToDrop < 1) {
        ws.send(JSON.stringify({ type: 'message', message: 'Invalid quantity.' }));
        return;
      }
      
      if (quantityToDrop > availableQuantity) {
        ws.send(JSON.stringify({ 
          type: 'message', 
          message: `You only have ${availableQuantity} ${item.item_name}.` 
        }));
        return;
      }
    }
    
    // Remove from player inventory and add to room
    await db.removePlayerItem(player.id, item.item_name, quantityToDrop);
    await db.addRoomItem(currentRoom.id, item.item_name, quantityToDrop);
    
    // Send feedback message
    let message;
    if (quantityToDrop === 1) {
      message = `You drop ${item.item_name}.`;
    } else {
      message = `You drop ${quantityToDrop} ${item.item_name}.`;
    }
    ws.send(JSON.stringify({ type: 'message', message }));
    
    // Send updated room to player to refresh items on ground
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, db, connectionId, currentRoom);
    
    // Send updated player stats (encumbrance changed)
    await sendPlayerStats(connectedPlayers, db, connectionId);
  }
}

/**
 * Handle factory widget add item
 */
async function factoryWidgetAddItem(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  // Validate player is in factory room
  if (currentRoom.room_type !== 'factory') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a factory room to use the machine.' }));
    return;
  }
  
  const slotIndex = data.slotIndex;
  if (slotIndex !== 0 && slotIndex !== 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid slot index.' }));
    return;
  }
  
  const itemName = data.itemName;
  if (!itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Item name required.' }));
    return;
  }
  
  // Check player has the item in inventory
  const playerItems = await db.getPlayerItems(player.id);
  const item = playerItems.find(i => i.item_name.toLowerCase() === itemName.toLowerCase());
  
  if (!item || item.quantity < 1) {
    ws.send(JSON.stringify({ type: 'error', message: `You don't have "${itemName}".` }));
    return;
  }
  
  // Get or initialize factory widget state
  let factoryState = factoryWidgetState.get(connectionId);
  if (!factoryState || factoryState.roomId !== currentRoom.id) {
    factoryState = {
      roomId: currentRoom.id,
      slots: [null, null],
      textInput: ''
    };
    factoryWidgetState.set(connectionId, factoryState);
  }
  
  // Check if slot can accept this item
  const currentSlot = factoryState.slots[slotIndex];
  if (currentSlot !== null) {
    // Slot is occupied - check if it's the same item type
    if (currentSlot.itemName.toLowerCase() !== item.item_name.toLowerCase()) {
      ws.send(JSON.stringify({ type: 'error', message: 'That slot already contains a different item type.' }));
      return;
    }
    // Same item type - will stack
  }
  
  // Remove 1 item from player inventory
  await db.removePlayerItem(player.id, item.item_name, 1);
  
  // Add item to slot (stack if same type, or create new entry)
  if (currentSlot && currentSlot.itemName.toLowerCase() === item.item_name.toLowerCase()) {
    // Stack: increase quantity
    currentSlot.quantity += 1;
  } else {
    // New item in slot
    factoryState.slots[slotIndex] = {
      itemName: item.item_name,
      quantity: 1
    };
  }
  
  // Send updated factory widget state
  ws.send(JSON.stringify({
    type: 'factoryWidgetState',
    state: {
      slots: factoryState.slots,
      textInput: factoryState.textInput
    }
  }));
  
  // Send updated inventory
  const updatedItems = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
  
  // Send updated player stats (encumbrance changed)
  await sendPlayerStats(connectedPlayers, db, connectionId);
}

/**
 * Handle harvest command
 */
async function harvest(ctx, data) {
  const { ws, db, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const query = (data.target || '').toLowerCase().trim();
  if (!query) {
    ws.send(JSON.stringify({ type: 'message', message: 'Harvest from what?' }));
    return;
  }
  
  // Find NPC in room by partial name match
  const npcsInRoom = await db.getNPCsInRoom(currentRoom.id);
  const npcMatches = npcsInRoom.filter(n => n.name && n.name.toLowerCase().includes(query));
  
  if (npcMatches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't see "${query}" here.` }));
    return;
  }
  
  if (npcMatches.length > 1) {
    const names = npcMatches.map(n => n.name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
  }
  
  const roomNpc = npcMatches[0];
  
  // Get NPC definition to check type and required items
  const npcDef = await db.getScriptableNPCById(roomNpc.npcId);
  if (!npcDef) {
    ws.send(JSON.stringify({ type: 'message', message: `${roomNpc.name} cannot be harvested.` }));
    return;
  }
  
  // Only rhythm NPCs can be harvested
  if (npcDef.npc_type !== 'rhythm') {
    ws.send(JSON.stringify({ type: 'message', message: `${roomNpc.name} cannot be harvested.` }));
    return;
  }
  
  // Check required items from NPC's input_items definition (data relationship)
  let requiredItems = {};
  try {
    requiredItems = npcDef.input_items ? JSON.parse(npcDef.input_items) : {};
  } catch (e) {
    requiredItems = {};
  }
  
  // Verify player has all required items
  if (Object.keys(requiredItems).length > 0) {
    const playerItems = await db.getPlayerItems(player.id);
    for (const [itemName, requiredQty] of Object.entries(requiredItems)) {
      const playerItem = playerItems.find(i => 
        i.item_name.toLowerCase() === itemName.toLowerCase()
      );
      if (!playerItem || playerItem.quantity < requiredQty) {
        ws.send(JSON.stringify({ type: 'message', message: `You lack the ${itemName}.` }));
        return;
      }
    }
  }
  
  // Get fresh NPC state from database
  const freshRoomNpcResult = await db.query('SELECT * FROM room_npcs WHERE id = $1', [roomNpc.id]);
  const freshRoomNpc = freshRoomNpcResult.rows[0];
  let npcState = {};
  try {
    npcState = freshRoomNpc && freshRoomNpc.state ? JSON.parse(freshRoomNpc.state) : {};
  } catch (e) {
    npcState = {};
  }
  
  // Check if NPC is on cooldown - no harvesting allowed during cooldown
  const now = Date.now();
  if (npcState.cooldown_until && now < npcState.cooldown_until) {
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `This creature is not currently capable of harvest`
    }));
    return;
  }
  
  // Check if already being harvested by someone
  if (npcState.harvest_active) {
    if (npcState.harvesting_player_id === player.id) {
      ws.send(JSON.stringify({ type: 'message', message: `You are already harvesting the ${roomNpc.name}.` }));
    } else {
      ws.send(JSON.stringify({ type: 'message', message: `Someone is already harvesting the ${roomNpc.name}.` }));
    }
    return;
  }
  
  // Start harvest session - track start time
  npcState.harvest_active = true;
  npcState.harvesting_player_id = player.id;
  npcState.harvest_start_time = now;
  npcState.cooldown_until = null;
  
  // Update NPC state in database
  await db.updateNPCState(roomNpc.id, npcState, roomNpc.last_cycle_run || now);
  
  ws.send(JSON.stringify({ type: 'message', message: `You begin harvesting the ${roomNpc.name}.` }));
}

/**
 * Handle resonate command - broadcast message to all players
 */
async function resonate(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const message = (data.message || '').trim();
  if (!message) {
    ws.send(JSON.stringify({ type: 'error', message: 'Resonate what? (resonate <message>)' }));
    return;
  }
  
  // Broadcast to all players (including sender)
  broadcastToAll(connectedPlayers, {
    type: 'resonated',
    playerName: player.name,
    message: message
  });
}

/**
 * Handle talk command - broadcast message to players in same room
 * Also checks for Lore Keeper keyword triggers
 */
async function talk(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const message = (data.message || '').trim();
  if (!message) {
    ws.send(JSON.stringify({ type: 'error', message: 'Talk what? (talk <message>)' }));
    return;
  }
  
  // Broadcast to all players in the same room (including sender)
  broadcastToRoom(connectedPlayers, currentRoom.id, {
    type: 'talked',
    playerName: player.name,
    message: message
  });
  
  // Check for Lore Keeper keyword triggers
  const loreKeepers = await db.getLoreKeepersInRoom(currentRoom.id);
  const messageLower = message.toLowerCase();
  
  for (const lk of loreKeepers) {
    if (lk.loreType !== 'dialogue' || !lk.keywordsResponses) {
      continue;
    }
    
    // Check each keyword
    let foundKeyword = false;
    for (const [keyword, response] of Object.entries(lk.keywordsResponses)) {
      if (messageLower.includes(keyword.toLowerCase())) {
        // Found matching keyword - send response to room
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'loreKeeperMessage',
          npcName: lk.name,
          npcColor: lk.displayColor,
          message: response,
          messageColor: lk.initialMessageColor,
          keywordColor: lk.keywordColor
        });
        foundKeyword = true;
        break; // Only respond once per Lore Keeper
      }
    }
    
    // If player spoke but no keyword matched, send incorrect response
    // (only if the Lore Keeper was mentioned by name in the message)
    if (!foundKeyword && lk.incorrectResponse) {
      const npcNameLower = lk.name.toLowerCase();
      if (messageLower.includes(npcNameLower) || 
          npcNameLower.split(' ').some(part => messageLower.includes(part))) {
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'loreKeeperMessage',
          npcName: lk.name,
          npcColor: lk.displayColor,
          message: lk.incorrectResponse,
          messageColor: lk.initialMessageColor,
          keywordColor: lk.keywordColor
        });
      }
    }
  }
}

/**
 * Handle telepath command - private message to specific player
 */
async function telepath(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const targetPlayerName = (data.targetPlayer || '').trim();
  if (!targetPlayerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Telepath who? (telepath <player> <message>)' }));
    return;
  }
  
  const message = (data.message || '').trim();
  if (!message) {
    ws.send(JSON.stringify({ type: 'error', message: 'Telepath what? (telepath <player> <message>)' }));
    return;
  }
  
  // Find target player's connection
  let targetConnectionId = null;
  for (const [connId, playerData] of connectedPlayers) {
    if (playerData.playerName.toLowerCase() === targetPlayerName.toLowerCase() && 
        playerData.ws.readyState === WebSocket.OPEN) {
      targetConnectionId = connId;
      break;
    }
  }
  
  if (!targetConnectionId) {
    ws.send(JSON.stringify({ type: 'error', message: `You don't sense ${targetPlayerName} in the world.` }));
    return;
  }
  
  const targetPlayerData = connectedPlayers.get(targetConnectionId);
  
  // Send to target player
  targetPlayerData.ws.send(JSON.stringify({
    type: 'telepath',
    fromPlayer: player.name,
    message: message
  }));
  
  // Send confirmation to sender
  ws.send(JSON.stringify({
    type: 'telepathSent',
    toPlayer: targetPlayerData.playerName,
    message: message
  }));
}

/**
 * Handle solve command - attempt to solve a Lore Keeper puzzle
 */
async function solve(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const target = (data.target || '').trim().toLowerCase();
  if (!target) {
    ws.send(JSON.stringify({ type: 'error', message: 'Solve what? (solve <npc> <answer>)' }));
    return;
  }
  
  const answer = (data.answer || '').trim();
  if (!answer) {
    ws.send(JSON.stringify({ type: 'error', message: 'Solve with what answer? (solve <npc> <answer>)' }));
    return;
  }
  
  // Get Lore Keepers in the room
  const loreKeepers = await db.getLoreKeepersInRoom(currentRoom.id);
  
  // Find puzzle-type Lore Keeper by partial name match
  const puzzleKeepers = loreKeepers.filter(lk => 
    lk.loreType === 'puzzle' && 
    lk.name.toLowerCase().includes(target)
  );
  
  if (puzzleKeepers.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't see "${target}" here to solve.` }));
    return;
  }
  
  if (puzzleKeepers.length > 1) {
    const names = puzzleKeepers.map(lk => lk.name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
  }
  
  const lk = puzzleKeepers[0];
  
  // Check if puzzle has a solution configured
  if (!lk.puzzleSolution) {
    ws.send(JSON.stringify({ type: 'message', message: `${lk.name} has no puzzle to solve.` }));
    return;
  }
  
  // Compare answer (case-insensitive)
  const isCorrect = answer.toLowerCase() === lk.puzzleSolution.toLowerCase();
  
  if (isCorrect) {
    // Success - broadcast to room
    const successMessage = lk.puzzleSuccessMessage || 'Correct! The puzzle is solved.';
    broadcastToRoom(connectedPlayers, currentRoom.id, {
      type: 'loreKeeperMessage',
      npcName: lk.name,
      npcColor: lk.displayColor,
      message: successMessage,
      messageColor: '#00ff00', // Green for success
      keywordColor: lk.keywordColor,
      isSuccess: true
    });
    
    // Future: Could update puzzle_solved state, trigger events, grant items, etc.
  } else {
    // Failure - send only to the player
    const failureMessage = lk.puzzleFailureMessage || 'That is not the answer I seek.';
    ws.send(JSON.stringify({
      type: 'loreKeeperMessage',
      npcName: lk.name,
      npcColor: lk.displayColor,
      message: failureMessage,
      messageColor: '#ff6666', // Red for failure
      keywordColor: lk.keywordColor,
      isFailure: true
    }));
  }
}

/**
 * Handle clue command - get a clue from a Lore Keeper puzzle
 */
async function clue(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const target = (data.target || '').trim().toLowerCase();
  if (!target) {
    ws.send(JSON.stringify({ type: 'error', message: 'Get clue from whom? (clue <npc>)' }));
    return;
  }
  
  // Get Lore Keepers in the room
  const loreKeepers = await db.getLoreKeepersInRoom(currentRoom.id);
  
  // Find puzzle-type Lore Keeper by partial name match
  const puzzleKeepers = loreKeepers.filter(lk => 
    lk.loreType === 'puzzle' && 
    lk.name.toLowerCase().includes(target)
  );
  
  if (puzzleKeepers.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't see "${target}" here.` }));
    return;
  }
  
  if (puzzleKeepers.length > 1) {
    const names = puzzleKeepers.map(lk => lk.name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
  }
  
  const lk = puzzleKeepers[0];
  
  // Check if puzzle has clues configured
  if (!lk.puzzleClues || lk.puzzleClues.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `${lk.name} offers no clues.` }));
    return;
  }
  
  // Get clue index from player data or room_npcs state (for now just cycle through)
  // Simple implementation: cycle through clues based on a hash of player+npc+time
  const clueIndex = Math.floor(Date.now() / 30000) % lk.puzzleClues.length;
  const clueText = lk.puzzleClues[clueIndex];
  
  // Send clue to player only
  ws.send(JSON.stringify({
    type: 'loreKeeperMessage',
    npcName: lk.name,
    npcColor: lk.displayColor,
    message: clueText,
    messageColor: lk.keywordColor || '#ffff00',
    keywordColor: lk.keywordColor
  }));
}

/**
 * Handle greet command - re-trigger Lore Keeper initial message
 */
async function greet(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
    return;
  }
  
  const target = (data.target || '').trim().toLowerCase();
  if (!target) {
    ws.send(JSON.stringify({ type: 'error', message: 'Greet whom? (greet <npc>)' }));
    return;
  }
  
  // Get Lore Keepers in the room
  const loreKeepers = await db.getLoreKeepersInRoom(currentRoom.id);
  
  // Find Lore Keeper by partial name match
  const matches = loreKeepers.filter(lk => 
    lk.name.toLowerCase().includes(target)
  );
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't see "${target}" here to greet.` }));
    return;
  }
  
  if (matches.length > 1) {
    const names = matches.map(lk => lk.name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
  }
  
  const lk = matches[0];
  
  // Check if Lore Keeper has an initial message
  if (!lk.initialMessage) {
    ws.send(JSON.stringify({ type: 'message', message: `${lk.name} nods silently.` }));
    return;
  }
  
  // Send the initial message (greet always works, even if already greeted)
  ws.send(JSON.stringify({
    type: 'loreKeeperMessage',
    npcName: lk.name,
    npcColor: lk.displayColor,
    message: lk.initialMessage,
    messageColor: lk.initialMessageColor,
    keywordColor: lk.keywordColor
  }));
  
  // Mark as greeted in database (in case they hadn't been greeted yet, or update last_greeted_at)
  await db.markPlayerGreetedByLoreKeeper(player.id, lk.npcId);
}

/**
 * Cleanup function to cancel engagement timers when player disconnects
 */
function cleanupLoreKeeperEngagement(connectionId) {
  cancelLoreKeeperEngagement(connectionId);
  // Note: Greeted state is now persisted in database, no need to clear in-memory state
}

module.exports = {
  authenticateSession,
  move,
  look,
  inventory,
  take,
  drop,
  factoryWidgetAddItem,
  harvest,
  resonate,
  talk,
  telepath,
  solve,
  clue,
  greet,
  cleanupLoreKeeperEngagement
};

