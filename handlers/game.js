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
const { verifyGodMode } = require('../utils/broadcast');
const messageCache = require('../utils/messageCache');

// Track Lore Keeper engagement timers per connectionId
const loreKeeperEngagementTimers = new Map();

// Track active Glow Codex puzzles per player (connectionId -> { npcId, npcName, puzzleType, clueIndex })
const activeGlowCodexPuzzles = new Map();

/**
 * Check if a player should receive an award based on award behavior settings
 * Returns { shouldAward: boolean, delayMessage: string | null }
 */
async function checkAwardEligibility(db, playerId, npcId, itemName, awardOnceOnly, awardAfterDelay, delaySeconds) {
  // If no restrictions, award every time
  if (!awardOnceOnly && !awardAfterDelay) {
    return { shouldAward: true, delayMessage: null };
  }
  
  // Check if player has been awarded before
  const lastAwardTime = await db.getLastLoreKeeperItemAwardTime(playerId, npcId, itemName);
  
  if (!lastAwardTime) {
    // Never awarded before, can award
    return { shouldAward: true, delayMessage: null };
  }
  
  // If award_once_only is true, don't award again
  if (awardOnceOnly) {
    return { shouldAward: false, delayMessage: null };
  }
  
  // If award_after_delay is true, check if enough time has passed
  if (awardAfterDelay && delaySeconds) {
    const now = new Date();
    const lastAward = new Date(lastAwardTime);
    const secondsSinceAward = Math.floor((now - lastAward) / 1000);
    
    if (secondsSinceAward >= delaySeconds) {
      // Enough time has passed, can award
      return { shouldAward: true, delayMessage: null };
    } else {
      // Not enough time has passed, return delay message
      const remainingSeconds = delaySeconds - secondsSinceAward;
      return { shouldAward: false, delayMessage: `You must wait ${remainingSeconds} more seconds before receiving this reward again.` };
    }
  }
  
  // Default: don't award
  return { shouldAward: false, delayMessage: null };
}

/**
 * Extract letters from glow codex clues based on extraction pattern
 * Helper function for debugging/validation (backend only)
 * @param {Array<string>} glowClues - Array of clue strings with <glowword> markers
 * @param {Array<number>} extractionPattern - Array of 1-based indices
 * @returns {string} Extracted word
 */
function extractGlowCodexLetters(glowClues, extractionPattern) {
  if (!glowClues || !extractionPattern || glowClues.length !== extractionPattern.length) {
    return '';
  }
  
  const letters = [];
  for (let i = 0; i < glowClues.length; i++) {
    const clue = glowClues[i];
    const patternIndex = extractionPattern[i] - 1; // Convert to 0-based
    
    // Extract text inside <>
    const match = clue.match(/<([^>]+)>/);
    if (!match) {
      continue;
    }
    
    const glowWord = match[1];
    if (patternIndex >= 0 && patternIndex < glowWord.length) {
      letters.push(glowWord[patternIndex]);
    }
  }
  
  return letters.join('').toLowerCase();
}

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
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, session, sessionId, playerName, activeCharacterWindows } = ctx;
  
  // Get windowId from message data or context (fallback to context for backward compatibility)
  const windowId = data.windowId || ctx.windowId || null;
  
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

  // If player has flag_always_first_time, reset them to town square in Newhaven
  if (player.flag_always_first_time === 1) {
    // Get all rooms on map 1 (Newhaven) and find town square
    const newhavenRooms = await db.getRoomsByMap(1);
    const townSquare = newhavenRooms.find(r => r.name.toLowerCase() === 'town square');
    
    if (townSquare) {
      await db.updatePlayerRoom(townSquare.id, playerName);
      player.current_room_id = townSquare.id;
    } else {
      // Fallback: try to get room at coordinates (0, 0) on map 1
      const fallbackRoom = await db.getRoomByCoords(1, 0, 0);
      if (fallbackRoom) {
        await db.updatePlayerRoom(fallbackRoom.id, playerName);
        player.current_room_id = fallbackRoom.id;
      }
    }
  }

  // Check if this player is already connected
  // If reconnecting (window was closed and reopened), allow it
  // If different window, disconnect old connection
  let existingConnectionId = null;
  let existingWindowId = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id) {
      existingConnectionId = connId;
      existingWindowId = playerData.windowId;
      break;
    }
  }
  
  if (existingConnectionId) {
    const oldPlayerData = connectedPlayers.get(existingConnectionId);
    const oldRoomId = oldPlayerData.roomId;
    const oldWs = oldPlayerData.ws;
    
    // Check if old connection is still open
    const oldConnectionOpen = oldWs && oldWs.readyState === WebSocket.OPEN;
    
    // If same windowId and old connection is closed, this is a reconnection - allow it
    if (existingWindowId === windowId && windowId !== null && !oldConnectionOpen) {
      console.log(`Player ${player.name} reconnecting with same windowId (${windowId}), old connection was closed...`);
      // Remove old closed connection entry
      connectedPlayers.delete(existingConnectionId);
      cancelLoreKeeperEngagement(existingConnectionId);
      // Continue below to create new connection
    } else if (oldConnectionOpen) {
      // Old connection is still open - disconnect it (new window opened or different windowId)
      console.log(`Player ${player.name} already connected (${existingConnectionId}), disconnecting old connection...`);
      
      // End any active harvest sessions for the old connection
      if (oldPlayerData.playerId) {
        const activeSession = await findPlayerHarvestSession(db, oldPlayerData.playerId);
        if (activeSession) {
          await endHarvestSession(db, activeSession.roomNpcId, true);
        }
      }
      
      // Drop factory widget items and remove poofable items for old connection
      if (oldRoomId) {
        const factoryState = factoryWidgetState.get(existingConnectionId);
        const oldRoom = await db.getRoomById(oldRoomId);
        
        if (factoryState && factoryState.roomId === oldRoomId && oldRoom && oldRoom.room_type === 'factory') {
          // Drop items from factory slots to room ground
          for (let i = 0; i < factoryState.slots.length; i++) {
            const slot = factoryState.slots[i];
            if (slot && slot.itemName) {
              await db.addRoomItem(oldRoomId, slot.itemName, slot.quantity);
            }
          }
          factoryWidgetState.delete(existingConnectionId);
          
          // Check if room is now empty and remove poofable items
          if (isRoomEmpty(connectedPlayers, oldRoomId)) {
            await db.removePoofableItemsFromRoom(oldRoomId);
          }
        }
        
        // Clean up warehouse widget state
        warehouseWidgetState.delete(existingConnectionId);
        
        // Notify others in the room that player left (from old connection)
        broadcastToRoom(connectedPlayers, oldRoomId, {
          type: 'playerLeft',
          playerName: player.name
        }, existingConnectionId);
        
        // Update room for others (remove player from room)
        const updatedRoom = await db.getRoomById(oldRoomId);
        for (const [otherConnId, otherPlayerData] of connectedPlayers) {
          if (otherPlayerData.roomId === oldRoomId && otherConnId !== existingConnectionId) {
            await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, updatedRoom);
          }
        }
      }
      
      // Remove from connectedPlayers
      connectedPlayers.delete(existingConnectionId);
      
      // Cancel any Lore Keeper engagement timers
      cancelLoreKeeperEngagement(existingConnectionId);
      
      // Send force close message to old client
      if (oldWs.readyState === WebSocket.OPEN) {
        oldWs.send(JSON.stringify({ 
          type: 'forceClose', 
          message: 'Another session has connected with this character. This window will be closed.' 
        }));
        // Give the client a moment to receive the message, then close the connection
        setTimeout(() => {
          if (oldWs.readyState === WebSocket.OPEN) {
            oldWs.close(1000, 'Replaced by new connection');
          }
        }, 100);
      }
      
      // Broadcast system message: player left the game (from old connection)
      const leftMessage = messageCache.getFormattedMessage('player_left_game', { playerName: player.name });
      broadcastToAll(connectedPlayers, {
        type: 'systemMessage',
        message: leftMessage
      });
      
      console.log(`Old connection ${existingConnectionId} for player ${player.name} has been disconnected`);
    } else {
      // Old connection is closed but different windowId - just clean up
      console.log(`Player ${player.name} old connection (${existingConnectionId}) was closed, cleaning up...`);
      connectedPlayers.delete(existingConnectionId);
      cancelLoreKeeperEngagement(existingConnectionId);
      // Continue below to create new connection
    }
  }

  // Generate unique connection ID for this WebSocket
  const connectionId = `conn_${ctx.nextConnectionId++}`;
  
  // Store the connectionId on the ws object for cleanup on disconnect
  ws.connectionId = connectionId;

  // Store connection using unique connectionId (only one connection per player allowed)
  const room = await db.getRoomById(player.current_room_id);
  
  // Get accountId from session
  // sessionData from getSessionFromRequest contains accountId
  const accountId = (session && session.sessionData && session.sessionData.accountId) || null;
  
  connectedPlayers.set(connectionId, { 
    ws, 
    roomId: room.id, 
    playerName: player.name,
    playerId: player.id,
    sessionId: sessionId,
    windowId: windowId || null,
    accountId: accountId
  });
  
  // Register/update window in activeCharacterWindows if windowId is provided
  // This updates the entry if it exists (reconnection) or creates a new one
  if (windowId && activeCharacterWindows) {
    activeCharacterWindows.set(player.id, {
      windowId: windowId,
      playerName: player.name,
      accountId: accountId,
      openedAt: Date.now(), // Reset grace period on reconnection
      connectionId: connectionId
    });
    console.log(`Registered/updated window ${windowId} for player ${player.name} (playerId: ${player.id})`);
  }

  // Send initial room update (with full info for first display)
  await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, room, true);

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
  const enteredMessage = messageCache.getFormattedMessage('player_entered_game', { playerName: player.name });
  broadcastToAll(connectedPlayers, {
    type: 'systemMessage',
    message: enteredMessage
  }, connectionId);
  
  // Send room update to all other players in the room so they see the new player
  const otherPlayersInRoom = getConnectedPlayersInRoom(connectedPlayers, room.id).filter(p => p !== player.name);
  for (const otherPlayerName of otherPlayersInRoom) {
    // Find connection ID for this player
    for (const [otherConnId, otherPlayerData] of connectedPlayers.entries()) {
      if (otherPlayerData.playerName === otherPlayerName && otherPlayerData.roomId === room.id) {
        await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, room, false);
        break;
      }
    }
  }

  // Send map data (only rooms from current map - no preview of connected maps)
  const mapRooms = await db.getRoomsByMap(room.map_id);
  const allRooms = mapRooms.map(r => ({
    id: r.id,
    name: r.name,
    x: r.x,
    y: r.y,
    mapId: r.map_id,
    roomType: r.room_type || 'normal',
    connected_map_id: r.connected_map_id || null,
    connected_room_x: r.connected_room_x || null,
    connected_room_y: r.connected_room_y || null,
    connection_direction: r.connection_direction || null
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
  // Send formatted message from database
  const arrivedMessage = messageCache.getFormattedMessage('player_arrived', { playerName: playerName });
  broadcastToRoom(connectedPlayers, room.id, {
    type: 'playerJoined',
    playerName: playerName,
    message: arrivedMessage
  }, connectionId);

  // Trigger Lore Keeper engagement for entering this room
  await triggerLoreKeeperEngagement(db, connectedPlayers, connectionId, room.id);

  // Load and send widget config
  const widgetConfig = await db.getPlayerWidgetConfig(player.id);
  ws.send(JSON.stringify({
    type: 'widgetConfig',
    config: widgetConfig
  }));

  // Load and send terminal history (excludes noob character automatically)
  const terminalHistory = await db.getTerminalHistory(player.id);
  if (terminalHistory.length > 0) {
    ws.send(JSON.stringify({
      type: 'terminalHistory',
      messages: terminalHistory
    }));
  }

  // Automatically trigger look command to display current room (as if player typed 'look')
  // This ensures the room description is shown after the backscroll
  await look({ ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId }, {});

  console.log(`Player ${playerName} connected (${connectionId}) in room ${room.name}`);
  return { authenticated: true, connectionId };
}

/**
 * Handle saveTerminalMessage - save a terminal message to history
 */
async function saveTerminalMessage(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  if (!connectionId || !playerName) {
    return; // Silently fail if not authenticated
  }
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    return; // Silently fail if player not found
  }
  
  // Save message to history (automatically excludes noob character)
  await db.saveTerminalMessage(
    player.id,
    data.message || '',
    data.messageType || 'info',
    data.messageHtml || null
  );
}

/**
 * Handle player movement
 */
async function move(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId, sessionId, playerName } = ctx;
  
  if (!sessionId || !playerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  // Check if auto-navigation or path execution is active
  const playerData = connectedPlayers.get(connectionId);
  
  // Check path execution first (higher priority)
  if (playerData && playerData.pathExecution && playerData.pathExecution.isActive) {
    // If paused, allow manual movement
    if (playerData.pathExecution.isPaused) {
      // Path is paused - allow manual movement
      // This will clear the pause state on the client side if player moves
    } else {
      // Path is active and not paused - check if this is an execution move
      const { steps, currentStep, isLooping } = playerData.pathExecution;
      // Calculate the actual step index (handle loop wrapping) - same logic as executeNextPathStep
      let actualStep = currentStep;
      if (currentStep >= steps.length && isLooping) {
        actualStep = currentStep % steps.length;
      }
      if (actualStep < steps.length && steps.length > 0) {
        const expectedStep = steps[actualStep];
        const moveDirection = data.direction ? data.direction.toUpperCase() : null;
        const expectedDirection = expectedStep.direction ? expectedStep.direction.toUpperCase() : null;
        // If this move matches the expected step, allow it (it's from path execution)
        console.log(`[Path Execution Check] currentStep=${currentStep}, actualStep=${actualStep}, moveDirection=${moveDirection}, expectedDirection=${expectedDirection}, stepCount=${steps.length}, isLooping=${isLooping}`);
        if (moveDirection && expectedDirection && moveDirection === expectedDirection) {
          // This is the path execution move, allow it to proceed
          console.log(`[Path Execution] Move allowed: ${moveDirection}`);
        } else {
          // Manual move attempt during path execution - block it
          console.log(`[Path Execution] Move blocked: direction mismatch or missing data`);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Path/Loop execution is active. Please wait for it to complete or stop it first.' 
          }));
          return;
        }
      } else {
        // Should not happen, but block manual moves
        console.log(`[Path Execution] Move blocked: invalid step index`);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Path/Loop execution is active. Please wait for it to complete or stop it first.' 
        }));
        return;
      }
    }
  } else if (playerData && playerData.autoNavigation && playerData.autoNavigation.isActive) {
    // Check if this move is part of auto-navigation (matches current step)
    const { path, currentStep } = playerData.autoNavigation;
    if (currentStep < path.length) {
      const expectedStep = path[currentStep];
      const moveDirection = data.direction ? data.direction.toUpperCase() : null;
      // If this move matches the expected step, allow it (it's from auto-navigation)
      if (moveDirection === expectedStep.direction.toUpperCase()) {
        // This is the auto-navigation move, allow it to proceed
      } else {
        // Manual move attempt during auto-navigation - block it
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Auto-navigation is active. Please wait for it to complete.' 
        }));
        return;
      }
    } else {
      // Path complete but auto-navigation still active - block manual moves
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Auto-navigation is active. Please wait for it to complete.' 
      }));
      return;
    }
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
  // playerData already declared above for auto-navigation check
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
    
    // If auto-navigation is active, stop it
    if (playerData && playerData.autoNavigation && playerData.autoNavigation.isActive) {
      clearAutoNavigation(connectedPlayers, connectionId);
      ws.send(JSON.stringify({ 
        type: 'autoNavigationFailed',
        message: `Auto-navigation stopped: ${directionName} path blocked.` 
      }));
    } else {
      // Get wall collision message from database
      const wallMessage = messageCache.getFormattedMessage('movement_wall_collision', { direction: directionName });
      ws.send(JSON.stringify({ type: 'error', message: wallMessage }));
    }
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
            await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, updatedOldRoom);
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
          await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, oldRoom);
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
  // Send formatted message from database
  const leftMessage = leftDirection 
    ? messageCache.getFormattedMessage('player_left_to', { playerName: playerName, direction: leftDirection })
    : messageCache.getFormattedMessage('player_left', { playerName: playerName });
  broadcastToRoom(connectedPlayers, oldRoomId, {
    type: 'playerLeft',
    playerName: playerName,
    direction: leftDirection,
    message: leftMessage
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

  // Get formatted messages for the new room
  
  // Combine players and NPCs (players first, then NPCs)
  // Sort players alphabetically for consistent ordering
  const combinedEntities = [];
  const sortedPlayers = [...playersInNewRoom].sort();
  sortedPlayers.forEach(playerName => {
    combinedEntities.push(playerName);
  });
  npcsInNewRoom.forEach(npc => {
    let npcDisplay = npc.name;
    if (npc.state && typeof npc.state === 'object') {
      const cycles = npc.state.cycles || 0;
      let statusMessage = '';
      if (cycles === 0) {
        statusMessage = npc.statusMessageIdle || '(idle)';
      } else if (npc.state.harvest_active) {
        statusMessage = npc.statusMessageHarvesting || '(harvesting)';
      } else if (npc.state.cooldown_until && Date.now() < npc.state.cooldown_until) {
        statusMessage = npc.statusMessageCooldown || '(cooldown)';
      } else {
        statusMessage = npc.statusMessageReady || '(ready)';
      }
      if (statusMessage) {
        npcDisplay += ' ' + statusMessage;
      }
    }
    combinedEntities.push(npcDisplay);
  });
  
  // Format exits as comma-separated string
  const exitsString = exits.length > 0 ? exits.join(', ') : 'None';
  
  // Format room items
  const itemsString = roomItemsInNewRoom.length > 0 
    ? roomItemsInNewRoom.map(item => (item.name || item.item_name) + (item.quantity > 1 ? ` (${item.quantity})` : '')).join(', ')
    : 'Nothing';
  
  // Get formatted messages
  let alsoHereMessage = '';
  if (combinedEntities.length > 0) {
    alsoHereMessage = messageCache.getFormattedMessage('room_also_here', {
      '[char|NPC array]': combinedEntities
    });
  } else {
    alsoHereMessage = messageCache.getFormattedMessage('room_no_one_here');
  }
  
  const obviousExitsMessage = messageCache.getFormattedMessage('room_obvious_exits', {
    '[directions array]': exits.length > 0 ? exits : []
  });
  
  const onGroundMessage = messageCache.getFormattedMessage('room_on_ground', {
    '[items array]': itemsString
  });

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
      factoryWidgetState: factoryState,
      messages: {
        alsoHere: alsoHereMessage,
        obviousExits: obviousExitsMessage,
        onGround: onGroundMessage
      }
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
  // Send formatted message from database
  const entersMessage = enteredFrom
    ? messageCache.getFormattedMessage('player_enters_from', { playerName: playerName, direction: enteredFrom })
    : messageCache.getFormattedMessage('player_arrived', { playerName: playerName });
  broadcastToRoom(connectedPlayers, targetRoom.id, {
    type: 'playerJoined',
    playerName: playerName,
    direction: enteredFrom,
    message: entersMessage
  }, connectionId);
  
  // Send room update to all other players in the new room so they see the updated "Also here:" list
  const otherPlayersInNewRoom = getConnectedPlayersInRoom(connectedPlayers, targetRoom.id).filter(p => p !== playerName);
  for (const otherPlayerName of otherPlayersInNewRoom) {
    // Find connection ID for this player
    for (const [otherConnId, otherPlayerData] of connectedPlayers.entries()) {
      if (otherPlayerData.playerName === otherPlayerName && otherPlayerData.roomId === targetRoom.id) {
        await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, targetRoom, false);
        break;
      }
    }
  }

  // Trigger Lore Keeper engagement for entering the new room
  await triggerLoreKeeperEngagement(db, connectedPlayers, connectionId, targetRoom.id);

  console.log(`Player ${playerName} moved from room ${oldRoomId} to room ${targetRoom.id}`);
  
  // Continue path execution or auto-navigation if active
  if (playerData.pathExecution && playerData.pathExecution.isActive) {
    // Path execution move
    playerData.pathExecution.currentStep++;
    playerData.pathExecution.timeoutId = null;
    
    // Continue to next step
    executeNextPathStep(ctx, connectionId);
  } else if (playerData.autoNavigation && playerData.autoNavigation.isActive) {
    // Auto-navigation move
    playerData.autoNavigation.currentStep++;
    playerData.autoNavigation.timeoutId = null;
    
    // Continue to next step
    executeNextAutoNavigationStep(ctx, connectionId);
  }
}

/**
 * Handle look command
 */
async function look(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId } = ctx;
  
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
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom, true);
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

  // Build description output for all matching NPCs (with markup support)
  const lines = matches.map(npc => {
    const desc = npc.description || 'You see nothing special.';
    return `${npc.name}: ${desc}`;
  });

  ws.send(JSON.stringify({
    type: 'message',
    message: lines.join('\n'),
    html: true // Enable HTML rendering for markup
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
  const hasWarehouseDeed = await db.hasPlayerWarehouseDeed(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items, hasWarehouseDeed }));
}

/**
 * Handle take command
 */
async function take(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId, playerName } = ctx;
  
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
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId, playerName } = ctx;
  
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
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom);
    
    // Send updated player stats (encumbrance changed)
    await sendPlayerStats(connectedPlayers, db, connectionId);
  }
}

/**
 * Handle factory widget add item
 */
async function factoryWidgetAddItem(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId, playerName } = ctx;
  
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
  
  // Check harvest prerequisite item (single item required for harvesting)
  if (npcDef.harvest_prerequisite_item) {
    const playerItems = await db.getPlayerItems(player.id);
    const hasPrerequisite = playerItems.some(i => 
      i.item_name.toLowerCase() === npcDef.harvest_prerequisite_item.toLowerCase()
    );
    
    if (!hasPrerequisite) {
      // Use customizable message or default
      const message = npcDef.harvest_prerequisite_message || 
                     `You lack the required item to harvest from ${roomNpc.name}.`;
      ws.send(JSON.stringify({ type: 'message', message }));
      return;
    }
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
  
  // Start harvest session - track start time and cache player's stats
  npcState.harvest_active = true;
  npcState.harvesting_player_id = player.id;
  npcState.harvest_start_time = now;
  npcState.cooldown_until = null;
  // Cache player's resonance and fortitude stats for the entire harvest session
  // This ensures consistent bonuses throughout the harvest
  npcState.harvesting_player_resonance = player.stat_resonance || 5;
  npcState.harvesting_player_fortitude = player.stat_fortitude || 5;
  
  // Get NPC definition to verify harvestableTime and calculate effective harvestable time
  const baseHarvestableTime = npcDef.harvestable_time || 60000;
  
  // Calculate effective harvestable time based on fortitude (if enabled)
  let effectiveHarvestableTime = baseHarvestableTime;
  if (npcDef && npcDef.enable_fortitude_bonuses !== false && npcState.harvesting_player_fortitude) {
    try {
      const { calculateEffectiveHarvestableTime } = require('../utils/harvestFormulas');
      effectiveHarvestableTime = await calculateEffectiveHarvestableTime(baseHarvestableTime, npcState.harvesting_player_fortitude, db);
      console.log(`[Harvest] Harvestable time increase applied: base=${baseHarvestableTime}ms, effective=${effectiveHarvestableTime}ms, fortitude=${npcState.harvesting_player_fortitude}`);
    } catch (err) {
      console.error(`[Harvest] Error calculating harvestable time increase:`, err);
    }
  }
  
  // Store effective harvestable time in state for use by cycle engine
  npcState.effective_harvestable_time = effectiveHarvestableTime;
  
  console.log(`[Harvest] Starting harvest for player ${player.name} on ${roomNpc.name} (room_npc ${roomNpc.id}), harvestableTime=${effectiveHarvestableTime}ms, resonance=${npcState.harvesting_player_resonance}, fortitude=${npcState.harvesting_player_fortitude}`);
  
  // Update NPC state in database
  await db.updateNPCState(roomNpc.id, npcState, roomNpc.last_cycle_run || now);
  
  // Verify the state was saved correctly
  const verifyResult = await db.query('SELECT state FROM room_npcs WHERE id = $1', [roomNpc.id]);
  if (verifyResult.rows[0]) {
    try {
      const savedState = verifyResult.rows[0].state ? JSON.parse(verifyResult.rows[0].state) : {};
      if (savedState.harvest_active && savedState.harvest_start_time) {
        console.log(`[Harvest] State saved correctly: harvest_active=${savedState.harvest_active}, harvest_start_time=${savedState.harvest_start_time}`);
      } else {
        console.error(`[Harvest] ERROR: State not saved correctly! harvest_active=${savedState.harvest_active}, harvest_start_time=${savedState.harvest_start_time}`);
      }
    } catch (e) {
      console.error(`[Harvest] ERROR: Failed to parse saved state:`, e);
    }
  }
  
  // Get formatted message from database
  const beginMessage = messageCache.getFormattedMessage('harvest_begin', { npcName: roomNpc.name });
  ws.send(JSON.stringify({ type: 'message', message: beginMessage }));
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
  
  // Check if player has an active Glow Codex puzzle
  const activePuzzle = activeGlowCodexPuzzles.get(connectionId);
  if (activePuzzle) {
    // Player is solving a puzzle - route all messages through puzzle solver
    const npcsInRoom = await db.getNPCsInRoom(currentRoom.id);
    const puzzleNpc = npcsInRoom.find(n => n.npcId === activePuzzle.npcId);
    
    if (puzzleNpc && puzzleNpc.puzzleType === 'glow_codex') {
      const messageLower = message.toLowerCase();
      
      // Check if message is a question-like input (help, explain, hint, what, how)
      const isQuestion = /(help|explain|hint|what|how|clarify|tell|more|again)/i.test(message);
      
      // Check if message exactly matches the solution
      const sanitizedInput = message.trim().toLowerCase();
      const solution = puzzleNpc.puzzleSolutionWord ? puzzleNpc.puzzleSolutionWord.toLowerCase() : '';
      
      if (sanitizedInput === solution && solution) {
        // Correct answer!
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'loreKeeperMessage',
          npcName: puzzleNpc.name,
          npcColor: puzzleNpc.color,
          message: puzzleNpc.puzzleSuccessResponse || 'Yes... you have seen the hidden thread.',
          messageColor: '#00ff00',
          isSuccess: true
        });
        
        // Grant reward item if specified and eligible
        if (puzzleNpc.puzzleRewardItem) {
          const eligibility = await checkAwardEligibility(
            db, 
            player.id, 
            puzzleNpc.npcId, 
            puzzleNpc.puzzleRewardItem,
            puzzleNpc.puzzleAwardOnceOnly || false,
            puzzleNpc.puzzleAwardAfterDelay || false,
            puzzleNpc.puzzleAwardDelaySeconds
          );
          
          if (eligibility.shouldAward) {
            await db.addPlayerItem(player.id, puzzleNpc.puzzleRewardItem, 1);
            await db.recordLoreKeeperItemAward(player.id, puzzleNpc.npcId, puzzleNpc.puzzleRewardItem);
            ws.send(JSON.stringify({
              type: 'message',
              message: `You receive ${puzzleNpc.puzzleRewardItem}.`
            }));
            
            // Send updated inventory
            const updatedItems = await db.getPlayerItems(player.id);
            ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
            await sendPlayerStats(connectedPlayers, db, connectionId);
          } else if (eligibility.delayMessage || puzzleNpc.puzzleAwardDelayResponse) {
            // Show delay response message
            const delayMessage = puzzleNpc.puzzleAwardDelayResponse || eligibility.delayMessage;
            ws.send(JSON.stringify({
              type: 'message',
              message: delayMessage
            }));
          }
        }
        
        // Clear active puzzle
        activeGlowCodexPuzzles.delete(connectionId);
        
        // Still broadcast the player's message to room
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'talked',
          playerName: player.name,
          message: message
        });
        
        return;
      } else if (isQuestion) {
        // Question-like input - return hint or followup response
        let responses = null;
        if (puzzleNpc.puzzleHintResponses && puzzleNpc.puzzleHintResponses.length > 0) {
          responses = puzzleNpc.puzzleHintResponses;
        } else if (puzzleNpc.puzzleFollowupResponses && puzzleNpc.puzzleFollowupResponses.length > 0) {
          responses = puzzleNpc.puzzleFollowupResponses;
        }
        
        if (responses && responses.length > 0) {
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];
          ws.send(JSON.stringify({
            type: 'loreKeeperMessage',
            npcName: puzzleNpc.name,
            npcColor: puzzleNpc.color,
            message: randomResponse,
            messageColor: puzzleNpc.color || '#00ffff',
            keywordColor: puzzleNpc.color || '#ff00ff'
          }));
        } else {
          // Fallback to followup responses or default
          const fallbackResponses = puzzleNpc.puzzleFollowupResponses || ['What do you mean?'];
          const randomResponse = Array.isArray(fallbackResponses) 
            ? fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]
            : fallbackResponses;
          ws.send(JSON.stringify({
            type: 'loreKeeperMessage',
            npcName: puzzleNpc.name,
            npcColor: puzzleNpc.color,
            message: randomResponse,
            messageColor: puzzleNpc.color || '#00ffff',
            keywordColor: puzzleNpc.color || '#ff00ff'
          }));
        }
        
        // Still broadcast the player's message to room
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'talked',
          playerName: player.name,
          message: message
        });
        
        return;
      } else if (/[a-zA-Z]/.test(message)) {
        // Message contains letters - likely an answer attempt
        let responses = null;
        if (puzzleNpc.puzzleIncorrectAttemptResponses && puzzleNpc.puzzleIncorrectAttemptResponses.length > 0) {
          responses = puzzleNpc.puzzleIncorrectAttemptResponses;
        } else if (puzzleNpc.puzzleFailureResponse) {
          responses = [puzzleNpc.puzzleFailureResponse];
        }
        
        if (responses && responses.length > 0) {
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];
          ws.send(JSON.stringify({
            type: 'loreKeeperMessage',
            npcName: puzzleNpc.name,
            npcColor: puzzleNpc.color,
            message: randomResponse,
            messageColor: '#ff6666',
            isFailure: true
          }));
        } else {
          // Default failure response
          ws.send(JSON.stringify({
            type: 'loreKeeperMessage',
            npcName: puzzleNpc.name,
            npcColor: puzzleNpc.color,
            message: 'That is not the answer I seek.',
            messageColor: '#ff6666',
            isFailure: true
          }));
        }
        
        // Still broadcast the player's message to room
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'talked',
          playerName: player.name,
          message: message
        });
        
        return;
      } else {
        // Default to followup responses for non-question, non-answer inputs
        let responses = null;
        if (puzzleNpc.puzzleFollowupResponses && puzzleNpc.puzzleFollowupResponses.length > 0) {
          responses = puzzleNpc.puzzleFollowupResponses;
        }
        
        if (responses && responses.length > 0) {
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];
          ws.send(JSON.stringify({
            type: 'loreKeeperMessage',
            npcName: puzzleNpc.name,
            npcColor: puzzleNpc.color,
            message: randomResponse,
            messageColor: puzzleNpc.color || '#00ffff',
            keywordColor: puzzleNpc.color || '#ff00ff'
          }));
        }
        
        // Still broadcast the player's message to room
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'talked',
          playerName: player.name,
          message: message
        });
        
        return;
      }
    } else {
      // Puzzle NPC no longer in room or puzzle type changed - clear puzzle
      activeGlowCodexPuzzles.delete(connectionId);
    }
  }
  
  // Broadcast to all players in the same room (including sender)
  broadcastToRoom(connectedPlayers, currentRoom.id, {
    type: 'talked',
    playerName: player.name,
    message: message
  });
  
  // Check for NPCs with Glow Codex puzzles (start puzzle if player talks to them or asks them)
  const npcsInRoom = await db.getNPCsInRoom(currentRoom.id);
  const messageLower = message.toLowerCase();
  
  for (const npc of npcsInRoom) {
    if (npc.puzzleType === 'glow_codex' && npc.puzzleGlowClues && npc.puzzleGlowClues.length > 0) {
      // Check if player mentioned this NPC by name
      const npcNameLower = npc.name.toLowerCase();
      const mentionedNpc = messageLower.includes(npcNameLower) || 
          npcNameLower.split(' ').some(part => messageLower.includes(part));
      
      if (mentionedNpc) {
        // Check if message is a question (help, explain, hint, what, how)
        const isQuestion = /(help|explain|hint|what|how|clarify|tell|more|again)/i.test(message);
        
        // Start the puzzle - set active puzzle state
        activeGlowCodexPuzzles.set(connectionId, {
          npcId: npc.npcId,
          npcName: npc.name,
          puzzleType: npc.puzzleType,
          clueIndex: 0
        });
        
        if (isQuestion) {
          // If it's a question, respond with hint or followup response
          let responses = null;
          if (npc.puzzleHintResponses && npc.puzzleHintResponses.length > 0) {
            responses = npc.puzzleHintResponses;
          } else if (npc.puzzleFollowupResponses && npc.puzzleFollowupResponses.length > 0) {
            responses = npc.puzzleFollowupResponses;
          }
          
          if (responses && responses.length > 0) {
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            ws.send(JSON.stringify({
              type: 'loreKeeperMessage',
              npcName: npc.name,
              npcColor: npc.color,
              message: randomResponse,
              messageColor: npc.color || '#00ffff',
              keywordColor: npc.color || '#ff00ff'
            }));
          } else {
            // Fallback: send all clues in sequence
            for (let i = 0; i < npc.puzzleGlowClues.length; i++) {
              const clue = npc.puzzleGlowClues[i];
              setTimeout(() => {
                ws.send(JSON.stringify({
                  type: 'loreKeeperMessage',
                  npcName: npc.name,
                  npcColor: npc.color,
                  message: clue,
                  messageColor: npc.color || '#00ffff',
                  keywordColor: npc.color || '#ff00ff'
                }));
              }, i * 1000); // Stagger clues by 1 second each
            }
          }
        } else {
          // Not a question - send all clues in sequence
          for (let i = 0; i < npc.puzzleGlowClues.length; i++) {
            const clue = npc.puzzleGlowClues[i];
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'loreKeeperMessage',
                npcName: npc.name,
                npcColor: npc.color,
                message: clue,
                messageColor: npc.color || '#00ffff',
                keywordColor: npc.color || '#ff00ff'
              }));
            }, i * 1000); // Stagger clues by 1 second each
          }
        }
        
        break; // Only start one puzzle at a time
      }
    }
  }
  
  // Check for Lore Keeper puzzle solutions FIRST (before keywords)
  // This allows players to solve puzzles by saying the solution word
  const loreKeepers = await db.getLoreKeepersInRoom(currentRoom.id);
  
  for (const lk of loreKeepers) {
    // Check if this is a puzzle-type Lore Keeper with a solution
    if (lk.loreType === 'puzzle' && lk.puzzleSolution) {
      const npcNameLower = lk.name.toLowerCase();
      const mentionedNpc = messageLower.includes(npcNameLower) || 
          npcNameLower.split(' ').some(part => messageLower.includes(part));
      
      // Check if message exactly matches the solution (case-insensitive)
      const sanitizedMessage = message.trim().toLowerCase();
      const solution = lk.puzzleSolution.toLowerCase().trim();
      
      // Check if message is exactly the solution (with or without NPC name)
      const isExactSolution = sanitizedMessage === solution;
      // Or if NPC is mentioned and message contains the solution word
      const containsSolution = mentionedNpc && messageLower.includes(solution);
      
      if (isExactSolution || containsSolution) {
        // Correct solution! Award success
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
        
        // Award reward item if specified and eligible
        if (lk.puzzleRewardItem) {
          const eligibility = await checkAwardEligibility(
            db, 
            player.id, 
            lk.npcId, 
            lk.puzzleRewardItem,
            lk.puzzleAwardOnceOnly || false,
            lk.puzzleAwardAfterDelay || false,
            lk.puzzleAwardDelaySeconds
          );
          
          if (eligibility.shouldAward) {
            await db.addPlayerItem(player.id, lk.puzzleRewardItem, 1);
            await db.recordLoreKeeperItemAward(player.id, lk.npcId, lk.puzzleRewardItem);
            ws.send(JSON.stringify({
              type: 'message',
              message: `You receive ${lk.puzzleRewardItem}.`
            }));
            
            // Send updated inventory
            const updatedItems = await db.getPlayerItems(player.id);
            ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
            await sendPlayerStats(connectedPlayers, db, connectionId);
          } else if (eligibility.delayMessage || lk.puzzleAwardDelayResponse) {
            // Show delay response message
            const delayMessage = lk.puzzleAwardDelayResponse || eligibility.delayMessage;
            ws.send(JSON.stringify({
              type: 'message',
              message: delayMessage
            }));
          }
        }
        
        // Still broadcast the player's message to room
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'talked',
          playerName: player.name,
          message: message
        });
        
        return; // Exit early - puzzle solved
      }
    }
  }
  
  // Check for Lore Keeper keyword triggers (both dialogue and puzzle types)
  for (const lk of loreKeepers) {
    // Both dialogue and puzzle types support keywords/responses
    if (!lk.keywordsResponses) {
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
 * Handle ask command - same as talk but specifically for NPC dialogue
 * Format: ask <npc> <question>
 */
async function ask(ctx, data) {
  // Extract NPC name and question from message
  const fullMessage = (data.message || '').trim();
  if (!fullMessage) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Ask what? (ask <npc> <question>)' }));
    return;
  }
  
  // For now, treat ask the same as talk - the talk handler will detect NPC mentions
  // and handle puzzle dialogue appropriately
  await talk(ctx, { ...data, message: fullMessage });
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
    
    // Award reward item if specified and eligible
    if (lk.puzzleRewardItem) {
      const eligibility = await checkAwardEligibility(
        db, 
        player.id, 
        lk.npcId, 
        lk.puzzleRewardItem,
        lk.puzzleAwardOnceOnly || false,
        lk.puzzleAwardAfterDelay || false,
        lk.puzzleAwardDelaySeconds
      );
      
      if (eligibility.shouldAward) {
        await db.addPlayerItem(player.id, lk.puzzleRewardItem, 1);
        await db.recordLoreKeeperItemAward(player.id, lk.npcId, lk.puzzleRewardItem);
        ws.send(JSON.stringify({
          type: 'message',
          message: `You receive ${lk.puzzleRewardItem}.`
        }));
        
        // Send updated inventory
        const updatedItems = await db.getPlayerItems(player.id);
        ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
        await sendPlayerStats(connectedPlayers, db, connectionId);
      } else if (eligibility.delayMessage || lk.puzzleAwardDelayResponse) {
        // Show delay response message
        const delayMessage = lk.puzzleAwardDelayResponse || eligibility.delayMessage;
        ws.send(JSON.stringify({
          type: 'message',
          message: delayMessage
        }));
      }
    }
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
  // Clear active Glow Codex puzzles
  activeGlowCodexPuzzles.delete(connectionId);
}

/**
 * Restart the server (only works on port 3535, god mode required)
 */
async function restartServer(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  // Verify god mode
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }
  
  // Check if server is running on port 3535
  const currentPort = process.env.PORT || '3434';
  if (currentPort !== '3535') {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Server restart is only available on the stable server (port 3535).' 
    }));
    return;
  }
  
  // Send confirmation message to client
  ws.send(JSON.stringify({ 
    type: 'message', 
    message: 'Restarting server... You will be disconnected.' 
  }));
  
  // Give client a moment to receive the message, then exit
  setTimeout(() => {
    console.log('Server restart requested by god mode user');
    process.exit(0);
  }, 500);
}

/**
 * Handle warehouse command - open warehouse widget
 * Allows view-only access from anywhere if player has a deed
 * Full interaction only when in the specific warehouse room
 */
async function warehouse(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
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
  
  // Check if player has any warehouse deed
  const hasDeed = await db.hasPlayerWarehouseDeed(player.id);
  if (!hasDeed) {
    ws.send(JSON.stringify({ type: 'error', message: 'You need a warehouse deed to access storage.' }));
    return;
  }
  
  // Determine which warehouse to show
  let warehouseLocationKey = null;
  let accessCheck = null;
  
  // If in a warehouse room, use that warehouse
  if (currentRoom.room_type === 'warehouse') {
    warehouseLocationKey = currentRoom.id.toString();
    accessCheck = await db.checkWarehouseAccess(player.id, warehouseLocationKey);
    
    // If player has access to this warehouse, use it
    if (accessCheck.hasAccess) {
      // Initialize warehouse if first time
      let capacity = await db.getPlayerWarehouseCapacity(player.id, warehouseLocationKey);
      if (!capacity) {
        capacity = await db.initializePlayerWarehouse(player.id, warehouseLocationKey, accessCheck.deedItem.id);
      }
      
      // Get warehouse items
      const items = await db.getWarehouseItems(player.id, warehouseLocationKey);
      const itemTypeCount = await db.getWarehouseItemTypeCount(player.id, warehouseLocationKey);
      
      // Get owned deeds for this location
      const deeds = await db.getPlayerWarehouseDeeds(player.id, warehouseLocationKey);
      
      ws.send(JSON.stringify({
        type: 'warehouseWidgetState',
        state: {
          warehouseLocationKey: warehouseLocationKey,
          items: items,
          capacity: {
            maxItemTypes: capacity.max_item_types,
            maxQuantityPerType: capacity.max_quantity_per_type,
            currentItemTypes: itemTypeCount,
            upgradeTier: capacity.upgrade_tier
          },
          deeds: deeds
        }
      }));
      return;
    }
  }
  
  // Not in warehouse room or don't have access to current warehouse
  // Find first warehouse the player has access to (for view-only)
  const playerItems = await db.getPlayerItems(player.id);
  const allItems = await db.getAllItems();
  
  for (const playerItem of playerItems) {
    const itemDef = allItems.find(item => item.name === playerItem.item_name);
    if (itemDef && itemDef.item_type === 'deed' && itemDef.deed_warehouse_location_key) {
      warehouseLocationKey = itemDef.deed_warehouse_location_key;
      
      // Get warehouse data for view-only
      const capacity = await db.getPlayerWarehouseCapacity(player.id, warehouseLocationKey);
      if (capacity) {
        const items = await db.getWarehouseItems(player.id, warehouseLocationKey);
        const itemTypeCount = await db.getWarehouseItemTypeCount(player.id, warehouseLocationKey);
        const deeds = await db.getPlayerWarehouseDeeds(player.id, warehouseLocationKey);
        
        ws.send(JSON.stringify({
          type: 'warehouseWidgetState',
          state: {
            warehouseLocationKey: warehouseLocationKey,
            items: items,
            capacity: {
              maxItemTypes: capacity.max_item_types,
              maxQuantityPerType: capacity.max_quantity_per_type,
              currentItemTypes: itemTypeCount,
              upgradeTier: capacity.upgrade_tier
            },
            deeds: deeds
          }
        }));
        return;
      }
    }
  }
  
  // If we get here, player has a deed but no warehouse initialized yet
  // This shouldn't happen, but send empty state
  ws.send(JSON.stringify({
    type: 'warehouseWidgetState',
    state: {
      warehouseLocationKey: null,
      items: [],
      capacity: {
        maxItemTypes: 0,
        maxQuantityPerType: 0,
        currentItemTypes: 0,
        upgradeTier: 1
      },
      deeds: []
    }
  }));
}

/**
 * Handle store command - store items from inventory to warehouse
 */
async function store(ctx, data) {
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
  
  // Validate player is in warehouse room
  if (currentRoom.room_type !== 'warehouse') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a warehouse room to store items.' }));
    return;
  }
  
  const warehouseLocationKey = currentRoom.id.toString();
  
  // Check if player has access via deed
  const accessCheck = await db.checkWarehouseAccess(player.id, warehouseLocationKey);
  if (!accessCheck.hasAccess) {
    ws.send(JSON.stringify({ type: 'error', message: 'You need a warehouse deed to access this storage.' }));
    return;
  }
  
  // Initialize warehouse if first time (or if player is always-first-time)
  // For always-first-time players, always reinitialize to ensure fresh state
  const isAlwaysFirstTime = player.flag_always_first_time === 1;
  let capacity = await db.getPlayerWarehouseCapacity(player.id, warehouseLocationKey);
  if (!capacity || isAlwaysFirstTime) {
    // If always-first-time, delete existing warehouse first to ensure fresh start
    if (isAlwaysFirstTime && capacity) {
      await db.query('DELETE FROM player_warehouses WHERE player_id = $1 AND warehouse_location_key = $2', [player.id, warehouseLocationKey]);
      await db.query('DELETE FROM warehouse_items WHERE player_id = $1 AND warehouse_location_key = $2', [player.id, warehouseLocationKey]);
    }
    capacity = await db.initializePlayerWarehouse(player.id, warehouseLocationKey, accessCheck.deedItem.id);
  }
  
  const query = (data.itemName || '').toLowerCase().trim();
  if (!query) {
    ws.send(JSON.stringify({ type: 'message', message: 'Store what?' }));
    return;
  }
  
  // Parse quantity (default to 1, or "all", or a number)
  let requestedQuantity = data.quantity !== undefined ? data.quantity : 1;
  const isAll = requestedQuantity === 'all' || requestedQuantity === 'All';
  
  // Get player inventory
  const playerItems = await db.getPlayerItems(player.id);
  const matches = playerItems.filter(i => i.item_name.toLowerCase().includes(query));
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't have "${query}".` }));
    return;
  }
  
  if (matches.length > 1) {
    const names = matches.map(i => i.item_name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
  }
  
  const item = matches[0];
  const availableQuantity = item.quantity;
  
  // Determine how many to store
  let quantityToStore;
  if (isAll) {
    quantityToStore = availableQuantity;
  } else {
    quantityToStore = parseInt(requestedQuantity, 10);
    if (isNaN(quantityToStore) || quantityToStore < 1) {
      ws.send(JSON.stringify({ type: 'message', message: 'Invalid quantity.' }));
      return;
    }
    
    if (quantityToStore > availableQuantity) {
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `You only have ${availableQuantity} ${item.item_name}.` 
      }));
      return;
    }
  }
  
  // Check capacity limits
  const existingQuantity = await db.getWarehouseItemQuantity(player.id, warehouseLocationKey, item.item_name);
  const itemTypeCount = await db.getWarehouseItemTypeCount(player.id, warehouseLocationKey);
  
  // Check if adding new item type
  if (existingQuantity === 0) {
    if (itemTypeCount >= capacity.max_item_types) {
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `Warehouse capacity limit reached. You can only store ${capacity.max_item_types} different item type(s).` 
      }));
      return;
    }
  }
  
  // Check quantity limit per type
  const newTotalQuantity = existingQuantity + quantityToStore;
  if (newTotalQuantity > capacity.max_quantity_per_type) {
    const canStore = capacity.max_quantity_per_type - existingQuantity;
    if (canStore <= 0) {
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `Quantity limit reached for ${item.item_name}. Maximum ${capacity.max_quantity_per_type} per item type.` 
      }));
      return;
    }
    quantityToStore = canStore;
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `You can only store ${canStore} more ${item.item_name} (limit: ${capacity.max_quantity_per_type} per type).` 
    }));
  }
  
  // Remove from player inventory and add to warehouse
  await db.removePlayerItem(player.id, item.item_name, quantityToStore);
  await db.addWarehouseItem(player.id, warehouseLocationKey, item.item_name, quantityToStore);
  
  // Send feedback message
  let message;
  if (quantityToStore === 1) {
    message = `You store ${item.item_name} in the warehouse.`;
  } else {
    message = `You store ${quantityToStore} ${item.item_name} in the warehouse.`;
  }
  ws.send(JSON.stringify({ type: 'message', message }));
  
  // Send updated warehouse widget state
  const updatedItems = await db.getWarehouseItems(player.id, warehouseLocationKey);
  const updatedItemTypeCount = await db.getWarehouseItemTypeCount(player.id, warehouseLocationKey);
  const deeds = await db.getPlayerWarehouseDeeds(player.id, warehouseLocationKey);
  
  ws.send(JSON.stringify({
    type: 'warehouseWidgetState',
    state: {
      warehouseLocationKey: warehouseLocationKey,
      items: updatedItems,
      capacity: {
        maxItemTypes: capacity.max_item_types,
        maxQuantityPerType: capacity.max_quantity_per_type,
        currentItemTypes: updatedItemTypeCount,
        upgradeTier: capacity.upgrade_tier
      },
      deeds: deeds
    }
  }));
  
  // Send updated inventory
  const updatedInventory = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedInventory }));
  
  // Send updated player stats (encumbrance changed)
  await sendPlayerStats(connectedPlayers, db, connectionId);
}

/**
 * Handle withdraw command - withdraw items from warehouse to inventory
 */
async function withdraw(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Route to bank withdraw if in bank room
  if (currentRoom.room_type === 'bank') {
    return await withdrawBank(ctx, data);
  }
  
  // Otherwise, handle warehouse withdraw (existing logic)
  // Validate player is in warehouse room
  if (currentRoom.room_type !== 'warehouse') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a warehouse or bank room to withdraw.' }));
    return;
  }
  
  const warehouseLocationKey = currentRoom.id.toString();
  
  // Check if player has access via deed
  const accessCheck = await db.checkWarehouseAccess(player.id, warehouseLocationKey);
  if (!accessCheck.hasAccess) {
    ws.send(JSON.stringify({ type: 'error', message: 'You need a warehouse deed to access this storage.' }));
    return;
  }
  
  const query = (data.itemName || '').toLowerCase().trim();
  if (!query) {
    ws.send(JSON.stringify({ type: 'message', message: 'Withdraw what?' }));
    return;
  }
  
  // Parse quantity (default to 1, or "all", or a number)
  let requestedQuantity = data.quantity !== undefined ? data.quantity : 1;
  const isAll = requestedQuantity === 'all' || requestedQuantity === 'All';
  
  // Get warehouse items
  const warehouseItems = await db.getWarehouseItems(player.id, warehouseLocationKey);
  const matches = warehouseItems.filter(i => i.item_name.toLowerCase().includes(query));
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't have "${query}" stored here.` }));
    return;
  }
  
  if (matches.length > 1) {
    const names = matches.map(i => i.item_name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
  }
  
  const item = matches[0];
  const availableQuantity = item.quantity;
  
  // Determine how many to withdraw
  let quantityToWithdraw;
  if (isAll) {
    quantityToWithdraw = availableQuantity;
  } else {
    quantityToWithdraw = parseInt(requestedQuantity, 10);
    if (isNaN(quantityToWithdraw) || quantityToWithdraw < 1) {
      ws.send(JSON.stringify({ type: 'message', message: 'Invalid quantity.' }));
      return;
    }
    
    if (quantityToWithdraw > availableQuantity) {
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `You only have ${availableQuantity} ${item.item_name} stored.` 
      }));
      return;
    }
  }
  
  // Check encumbrance limits
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
  
  // Limit by encumbrance if needed
  if (quantityToWithdraw > maxCanCarry) {
    quantityToWithdraw = maxCanCarry;
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `You can only carry ${maxCanCarry} ${item.item_name} (encumbrance limit).` 
    }));
  }
  
  // Remove from warehouse and add to player inventory
  await db.removeWarehouseItem(player.id, warehouseLocationKey, item.item_name, quantityToWithdraw);
  await db.addPlayerItem(player.id, item.item_name, quantityToWithdraw);
  
  // Send feedback message
  let message;
  const newEncumbrance = currentEncumbrance + (quantityToWithdraw * itemEncumbrance);
  if (quantityToWithdraw === 1) {
    message = `You withdraw ${item.item_name} from the warehouse. (${newEncumbrance}/${maxEncumbrance})`;
  } else {
    message = `You withdraw ${quantityToWithdraw} ${item.item_name} from the warehouse. (${newEncumbrance}/${maxEncumbrance})`;
  }
  ws.send(JSON.stringify({ type: 'message', message }));
  
  // Send updated warehouse widget state
  const capacity = await db.getPlayerWarehouseCapacity(player.id, warehouseLocationKey);
  const updatedItems = await db.getWarehouseItems(player.id, warehouseLocationKey);
  const updatedItemTypeCount = await db.getWarehouseItemTypeCount(player.id, warehouseLocationKey);
  const deeds = await db.getPlayerWarehouseDeeds(player.id, warehouseLocationKey);
  
  ws.send(JSON.stringify({
    type: 'warehouseWidgetState',
    state: {
      warehouseLocationKey: warehouseLocationKey,
      items: updatedItems,
      capacity: {
        maxItemTypes: capacity.max_item_types,
        maxQuantityPerType: capacity.max_quantity_per_type,
        currentItemTypes: updatedItemTypeCount,
        upgradeTier: capacity.upgrade_tier
      },
      deeds: deeds
    }
  }));
  
  // Send updated inventory
  const updatedInventory = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedInventory }));
  
  // Send updated player stats (encumbrance changed)
  await sendPlayerStats(connectedPlayers, db, connectionId);
}

/**
 * Handle list command - list items for sale in merchant room
 */
async function list(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is merchant type
  if (currentRoom.room_type !== 'merchant') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a merchant room to list items for sale.' }));
    return;
  }
  
  // Get merchant items for this room
  const merchantItems = await db.getMerchantItemsForList(currentRoom.id);
  
  if (!merchantItems || merchantItems.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: 'This merchant has nothing for sale.' }));
    return;
  }
  
  // Format and send the merchant inventory list
  ws.send(JSON.stringify({ 
    type: 'merchantList', 
    items: merchantItems.map(item => ({
      name: item.item_name,
      quantity: item.unlimited ? '∞' : `${item.current_qty}${item.max_qty ? '/' + item.max_qty : ''}`,
      price: item.price,
      inStock: item.unlimited || item.current_qty > 0
    }))
  }));
}

/**
 * Handle deposit command - deposit currency to bank
 */
async function deposit(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is bank type
  if (currentRoom.room_type !== 'bank') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a bank to deposit currency.' }));
    return;
  }
  
  const { currencyName, quantity } = data;
  if (!currencyName || !quantity) {
    ws.send(JSON.stringify({ type: 'error', message: 'Usage: deposit <quantity> <currency> or deposit all <currency>' }));
    return;
  }
  
  try {
    // Find currency item by partial name with improved matching
    const allItems = await db.getAllItems();
    const currencyItems = allItems.filter(i => i.item_type === 'currency');
    
    // Normalize input for matching
    const normalizedInput = currencyName.toLowerCase().trim();
    
    // Get player's inventory first to check what currencies they actually have
    const playerItems = await db.getPlayerItems(player.id);
    
    // Build list of currencies player actually has (with quantities)
    const playerCurrencyItems = currencyItems.map(currencyItem => {
      const playerItem = playerItems.find(pi => pi.item_name === currencyItem.name);
      const quantity = playerItem ? parseInt(playerItem.quantity, 10) || 0 : 0;
      return { currencyItem, quantity };
    }).filter(pci => pci.quantity > 0); // Only currencies player has
    
    // Try to match currency with better logic
    let matchedCurrency = null;
    
    // Handle "glimmer", "glim", "g" as synonyms - match based on what player has
    const glimmerSynonyms = ['glimmer', 'glim', 'g'];
    if (glimmerSynonyms.includes(normalizedInput)) {
      if (playerCurrencyItems.length > 0) {
        // Prefer higher value currencies (crowns over shards) if multiple available
        // Sort by name length (longer names often indicate higher value, e.g., "Crown" vs "Shard")
        playerCurrencyItems.sort((a, b) => {
          // Check for "crown" in name (higher value)
          const aIsCrown = a.currencyItem.name.toLowerCase().includes('crown');
          const bIsCrown = b.currencyItem.name.toLowerCase().includes('crown');
          if (aIsCrown && !bIsCrown) return -1;
          if (!aIsCrown && bIsCrown) return 1;
          // Otherwise sort by name length
          return b.currencyItem.name.length - a.currencyItem.name.length;
        });
        matchedCurrency = playerCurrencyItems[0].currencyItem;
      }
    } else {
      // For specific currency names, try to match
      for (const item of currencyItems) {
        const itemNameLower = item.name.toLowerCase();
        
        // Exact match (case-insensitive)
        if (itemNameLower === normalizedInput) {
          matchedCurrency = item;
          break;
        }
        
        // Check if input contains full item name or vice versa
        if (itemNameLower.includes(normalizedInput) || normalizedInput.includes(itemNameLower)) {
          matchedCurrency = item;
          break;
        }
        
        // Handle singular/plural variations
        // "shards" should match "Glimmer Shard", "crowns" should match "Glimmer Crown"
        if (normalizedInput === 'shards' && itemNameLower.includes('shard') && !itemNameLower.includes('crown')) {
          matchedCurrency = item;
          break;
        }
        if (normalizedInput === 'shard' && itemNameLower.includes('shard') && !itemNameLower.includes('crown')) {
          matchedCurrency = item;
          break;
        }
        if (normalizedInput === 'crowns' && itemNameLower.includes('crown')) {
          matchedCurrency = item;
          break;
        }
        if (normalizedInput === 'crown' && itemNameLower.includes('crown')) {
          matchedCurrency = item;
          break;
        }
      }
      
      // If we matched a currency, verify player has it
      if (matchedCurrency) {
        const playerHasIt = playerItems.find(pi => pi.item_name === matchedCurrency.name && parseInt(pi.quantity, 10) > 0);
        if (!playerHasIt) {
          matchedCurrency = null; // Player doesn't have this currency
        }
      }
    }
    
    if (!matchedCurrency) {
      ws.send(JSON.stringify({ type: 'error', message: `Currency "${currencyName}" not found. Available currencies: ${currencyItems.map(i => i.name).join(', ')}` }));
      return;
    }
    
    // Get player's inventory quantity for this specific currency item
    const playerCurrencyItem = playerItems.find(item => item.item_name === matchedCurrency.name);
    const playerCurrencyQuantity = playerCurrencyItem ? parseInt(playerCurrencyItem.quantity, 10) || 0 : 0;
    
    let amountToDeposit = 0;
    
    if (quantity === 'all' || quantity === 'a') {
      amountToDeposit = playerCurrencyQuantity;
    } else {
      amountToDeposit = parseInt(quantity);
      if (isNaN(amountToDeposit) || amountToDeposit <= 0) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid quantity.' }));
        return;
      }
    }
    
    if (amountToDeposit <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: `You don't have any ${matchedCurrency.name} to deposit.` }));
      return;
    }
    
    // Check if player has enough
    if (playerCurrencyQuantity < amountToDeposit) {
      ws.send(JSON.stringify({ type: 'error', message: `You don't have enough ${matchedCurrency.name}. You have ${playerCurrencyQuantity}.` }));
      return;
    }
    
    // Remove from inventory and deposit to bank
    await db.removePlayerItem(player.id, matchedCurrency.name, amountToDeposit);
    const optimal = await db.depositCurrency(player.id, matchedCurrency.name, amountToDeposit);
    
    // Build deposit message using actual currency name from database
    let message = `Deposited ${amountToDeposit} ${matchedCurrency.name}${amountToDeposit !== 1 ? 's' : ''}`;
    
    message += `. Bank balance: `;
    const balance = await db.getPlayerBankBalance(player.id);
    
    // Format balance using currency items from database
    // Note: getPlayerBankBalance still returns hardcoded {crowns, shards} structure
    // This is a limitation of the current database functions that should be refactored
    // For now, we'll match currency items by name patterns
    const balanceParts = [];
    for (const currencyItem of currencyItems) {
      const itemNameLower = currencyItem.name.toLowerCase();
      if (itemNameLower.includes('crown') && balance.crowns > 0) {
        balanceParts.push(`${balance.crowns} ${currencyItem.name}${balance.crowns !== 1 ? 's' : ''}`);
      } else if (itemNameLower.includes('shard') && !itemNameLower.includes('crown') && balance.shards > 0) {
        balanceParts.push(`${balance.shards} ${currencyItem.name}${balance.shards !== 1 ? 's' : ''}`);
      }
    }
    
    if (balanceParts.length > 0) {
      message += balanceParts.join(', ');
    } else {
      message += '0';
    }
    
    ws.send(JSON.stringify({ type: 'message', message }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Handle withdraw command - withdraw currency from bank (called from main withdraw function)
 */
async function withdrawBank(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is bank type
  if (currentRoom.room_type !== 'bank') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a bank to withdraw currency.' }));
    return;
  }
  
  // For bank withdrawals, client sends itemName (which is actually currencyName)
  // Support both currencyName and itemName for compatibility
  const currencyName = data.currencyName || data.itemName;
  const quantity = data.quantity;
  
  if (!currencyName || !quantity) {
    ws.send(JSON.stringify({ type: 'error', message: 'Usage: withdraw <quantity> <currency> or withdraw all <currency>' }));
    return;
  }
  
  try {
    // Find currency item by partial name with improved matching
    const allItems = await db.getAllItems();
    const currencyItems = allItems.filter(i => i.item_type === 'currency');
    
    // Normalize input for matching
    const normalizedInput = currencyName.toLowerCase().trim();
    
    // Get bank balance first to check what currencies are actually in the bank
    const bankBalance = await db.getPlayerBankBalance(player.id);
    
    // Build list of currencies available in bank (with quantities)
    // Note: bankBalance returns {crowns, shards} which is hardcoded structure
    // We'll match this to currency items dynamically
    const bankCurrencyItems = [];
    for (const currencyItem of currencyItems) {
      const itemNameLower = currencyItem.name.toLowerCase();
      let bankQuantity = 0;
      
      if (itemNameLower.includes('crown') && bankBalance.crowns > 0) {
        bankQuantity = bankBalance.crowns;
      } else if (itemNameLower.includes('shard') && !itemNameLower.includes('crown') && bankBalance.shards > 0) {
        bankQuantity = bankBalance.shards;
      }
      
      if (bankQuantity > 0) {
        bankCurrencyItems.push({ currencyItem, quantity: bankQuantity });
      }
    }
    
    // Try to match currency with better logic
    let matchedCurrency = null;
    let bankCurrencyQuantity = 0;
    
    // Handle "glimmer", "glim", "g" as synonyms - match based on what's in bank
    const glimmerSynonyms = ['glimmer', 'glim', 'g'];
    if (glimmerSynonyms.includes(normalizedInput)) {
      if (bankCurrencyItems.length > 0) {
        // Prefer higher value currencies (crowns over shards) if multiple available
        bankCurrencyItems.sort((a, b) => {
          const aIsCrown = a.currencyItem.name.toLowerCase().includes('crown');
          const bIsCrown = b.currencyItem.name.toLowerCase().includes('crown');
          if (aIsCrown && !bIsCrown) return -1;
          if (!aIsCrown && bIsCrown) return 1;
          return b.currencyItem.name.length - a.currencyItem.name.length;
        });
        matchedCurrency = bankCurrencyItems[0].currencyItem;
        bankCurrencyQuantity = bankCurrencyItems[0].quantity;
      }
    } else {
      // For specific currency names, try to match
      for (const item of currencyItems) {
        const itemNameLower = item.name.toLowerCase();
        
        // Exact match (case-insensitive)
        if (itemNameLower === normalizedInput) {
          matchedCurrency = item;
          // Find quantity in bank
          for (const bci of bankCurrencyItems) {
            if (bci.currencyItem.name === item.name) {
              bankCurrencyQuantity = bci.quantity;
              break;
            }
          }
          break;
        }
        
        // Check if input contains full item name or vice versa
        if (itemNameLower.includes(normalizedInput) || normalizedInput.includes(itemNameLower)) {
          matchedCurrency = item;
          // Find quantity in bank
          for (const bci of bankCurrencyItems) {
            if (bci.currencyItem.name === item.name) {
              bankCurrencyQuantity = bci.quantity;
              break;
            }
          }
          break;
        }
        
        // Handle singular/plural variations
        if (normalizedInput === 'shards' && itemNameLower.includes('shard') && !itemNameLower.includes('crown')) {
          matchedCurrency = item;
          for (const bci of bankCurrencyItems) {
            if (bci.currencyItem.name === item.name) {
              bankCurrencyQuantity = bci.quantity;
              break;
            }
          }
          break;
        }
        if (normalizedInput === 'shard' && itemNameLower.includes('shard') && !itemNameLower.includes('crown')) {
          matchedCurrency = item;
          for (const bci of bankCurrencyItems) {
            if (bci.currencyItem.name === item.name) {
              bankCurrencyQuantity = bci.quantity;
              break;
            }
          }
          break;
        }
        if (normalizedInput === 'crowns' && itemNameLower.includes('crown')) {
          matchedCurrency = item;
          for (const bci of bankCurrencyItems) {
            if (bci.currencyItem.name === item.name) {
              bankCurrencyQuantity = bci.quantity;
              break;
            }
          }
          break;
        }
        if (normalizedInput === 'crown' && itemNameLower.includes('crown')) {
          matchedCurrency = item;
          for (const bci of bankCurrencyItems) {
            if (bci.currencyItem.name === item.name) {
              bankCurrencyQuantity = bci.quantity;
              break;
            }
          }
          break;
        }
      }
    }
    
    if (!matchedCurrency) {
      ws.send(JSON.stringify({ type: 'error', message: `Currency "${currencyName}" not found. Available currencies in bank: ${bankCurrencyItems.map(bci => bci.currencyItem.name).join(', ') || 'none'}` }));
      return;
    }
    
    // If we matched but don't have it in bank, check if it's just not in bank
    if (bankCurrencyQuantity === 0) {
      // Check if this currency exists in bank at all
      const itemNameLower = matchedCurrency.name.toLowerCase();
      let hasInBank = false;
      if (itemNameLower.includes('crown') && bankBalance.crowns > 0) {
        hasInBank = true;
        bankCurrencyQuantity = bankBalance.crowns;
      } else if (itemNameLower.includes('shard') && !itemNameLower.includes('crown') && bankBalance.shards > 0) {
        hasInBank = true;
        bankCurrencyQuantity = bankBalance.shards;
      }
      
      if (!hasInBank) {
        ws.send(JSON.stringify({ type: 'error', message: `You don't have any ${matchedCurrency.name} in the bank.` }));
        return;
      }
    }
    
    let amountToWithdraw = 0;
    
    if (quantity === 'all' || quantity === 'a') {
      amountToWithdraw = bankCurrencyQuantity;
    } else {
      amountToWithdraw = parseInt(quantity);
      if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid quantity.' }));
        return;
      }
    }
    
    if (amountToWithdraw <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: `You don't have any ${matchedCurrency.name} in the bank.` }));
      return;
    }
    
    // Check if bank has enough
    if (bankCurrencyQuantity < amountToWithdraw) {
      ws.send(JSON.stringify({ type: 'error', message: `Insufficient ${matchedCurrency.name} in bank. You have ${bankCurrencyQuantity}.` }));
      return;
    }
    
    // Withdraw from bank and add to inventory
    const withdrawn = await db.withdrawCurrency(player.id, matchedCurrency.name, amountToWithdraw);
    
    // Add withdrawn currency to inventory using dynamic currency names
    // Note: withdrawCurrency returns {crowns, shards} which is hardcoded
    // We'll match this to currency items dynamically
    for (const currencyItem of currencyItems) {
      const itemNameLower = currencyItem.name.toLowerCase();
      if (itemNameLower.includes('crown') && withdrawn.crowns > 0) {
        await db.addPlayerItem(player.id, currencyItem.name, withdrawn.crowns);
      } else if (itemNameLower.includes('shard') && !itemNameLower.includes('crown') && withdrawn.shards > 0) {
        await db.addPlayerItem(player.id, currencyItem.name, withdrawn.shards);
      }
    }
    
    // Build withdrawal message using actual currency names from database
    let message = `Withdrew `;
    const withdrawnParts = [];
    for (const currencyItem of currencyItems) {
      const itemNameLower = currencyItem.name.toLowerCase();
      if (itemNameLower.includes('crown') && withdrawn.crowns > 0) {
        withdrawnParts.push(`${withdrawn.crowns} ${currencyItem.name}${withdrawn.crowns !== 1 ? 's' : ''}`);
      } else if (itemNameLower.includes('shard') && !itemNameLower.includes('crown') && withdrawn.shards > 0) {
        withdrawnParts.push(`${withdrawn.shards} ${currencyItem.name}${withdrawn.shards !== 1 ? 's' : ''}`);
      }
    }
    
    if (withdrawnParts.length > 0) {
      message += withdrawnParts.join(', ');
    } else {
      message += `${amountToWithdraw} ${matchedCurrency.name}${amountToWithdraw !== 1 ? 's' : ''}`;
    }
    
    message += `. Bank balance: `;
    const newBalance = await db.getPlayerBankBalance(player.id);
    
    // Format balance using currency items from database
    const balanceParts = [];
    for (const currencyItem of currencyItems) {
      const itemNameLower = currencyItem.name.toLowerCase();
      if (itemNameLower.includes('crown') && newBalance.crowns > 0) {
        balanceParts.push(`${newBalance.crowns} ${currencyItem.name}${newBalance.crowns !== 1 ? 's' : ''}`);
      } else if (itemNameLower.includes('shard') && !itemNameLower.includes('crown') && newBalance.shards > 0) {
        balanceParts.push(`${newBalance.shards} ${currencyItem.name}${newBalance.shards !== 1 ? 's' : ''}`);
      }
    }
    
    if (balanceParts.length > 0) {
      message += balanceParts.join(', ');
    } else {
      message += '0';
    }
    
    ws.send(JSON.stringify({ type: 'message', message }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Handle balance command - show bank balance
 */
async function balance(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is bank type
  if (currentRoom.room_type !== 'bank') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a bank to check your balance.' }));
    return;
  }
  
  try {
    const balance = await db.getPlayerBankBalance(player.id);
    let message = 'Bank Balance: ';
    if (balance.crowns > 0) {
      message += `${balance.crowns} Glimmer Crown${balance.crowns !== 1 ? 's' : ''}`;
      if (balance.shards > 0) {
        message += `, ${balance.shards} Glimmer Shard${balance.shards !== 1 ? 's' : ''}`;
      }
    } else if (balance.shards > 0) {
      message += `${balance.shards} Glimmer Shard${balance.shards !== 1 ? 's' : ''}`;
    } else {
      message += '0 Glimmer Shards';
    }
    
    ws.send(JSON.stringify({ type: 'message', message }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Handle wealth command - show total wealth in Glimmer shards
 */
async function wealth(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  try {
    // Get currency from inventory (wallet)
    const walletCurrency = await db.getPlayerCurrency(player.id);
    // walletCurrency.totalShards already includes conversion (crowns * 100 + shards)
    const walletShards = walletCurrency.totalShards;
    
    // Get currency from bank
    const bankBalance = await db.getPlayerBankBalance(player.id);
    const bankShards = (bankBalance.crowns * 100) + bankBalance.shards;
    
    // Calculate total
    const totalShards = walletShards + bankShards;
    
    // Format message with green emphasis on numbers
    let message = `Total wealth: <span style="color: #00ff00;">${totalShards}</span> glimmer shard${totalShards !== 1 ? 's' : ''}<br>`;
    message += `Wallet: <span style="color: #00ff00;">${walletShards}</span> glimmer shard${walletShards !== 1 ? 's' : ''}<br>`;
    message += `Bank: <span style="color: #00ff00;">${bankShards}</span> glimmer shard${bankShards !== 1 ? 's' : ''}`;
    
    ws.send(JSON.stringify({ type: 'message', message, html: true }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Handle buy command - buy item from merchant
 */
async function buy(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is merchant type
  if (currentRoom.room_type !== 'merchant') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a merchant room to buy items.' }));
    return;
  }
  
  const { itemName, quantity = 1 } = data;
  if (!itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Usage: buy <item> [quantity]' }));
    return;
  }
  
  try {
    // Get merchant items for this room
    const merchantItems = await db.getMerchantItemsForRoom(currentRoom.id);
    
    // Find item by partial name matching
    const allItems = await db.getAllItems();
    const matchedItems = allItems.filter(item => 
      item.name.toLowerCase().includes(itemName.toLowerCase()) ||
      itemName.toLowerCase().includes(item.name.toLowerCase())
    );
    
    if (matchedItems.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: `Item "${itemName}" not found.` }));
      return;
    }
    
    if (matchedItems.length > 1) {
      ws.send(JSON.stringify({ type: 'error', message: `Which did you mean: ${matchedItems.map(i => i.name).join(', ')}?` }));
      return;
    }
    
    const targetItem = matchedItems[0];
    const merchantItem = merchantItems.find(mi => mi.item_id === targetItem.id);
    
    if (!merchantItem) {
      ws.send(JSON.stringify({ type: 'error', message: `"${targetItem.name}" is not for sale here.` }));
      return;
    }
    
    // Check if item is buyable
    if (!merchantItem.buyable) {
      ws.send(JSON.stringify({ type: 'error', message: `"${targetItem.name}" cannot be purchased.` }));
      return;
    }
    
    // Check stock
    if (!merchantItem.unlimited && merchantItem.current_qty < quantity) {
      ws.send(JSON.stringify({ type: 'error', message: `Insufficient stock. Only ${merchantItem.current_qty} available.` }));
      return;
    }
    
    // Check price
    const totalPrice = merchantItem.price * quantity;
    if (totalPrice <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'This item is not priced.' }));
      return;
    }
    
    // Check player has enough currency
    const playerCurrency = await db.getPlayerCurrency(player.id);
    if (playerCurrency.totalShards < totalPrice) {
      ws.send(JSON.stringify({ type: 'error', message: `Insufficient currency. You need ${totalPrice} shards worth (${db.convertCurrencyToOptimal(totalPrice).crowns} crowns, ${db.convertCurrencyToOptimal(totalPrice).shards} shards).` }));
      return;
    }
    
    // Remove currency from player (with auto-conversion)
    await db.removePlayerCurrency(player.id, totalPrice);
    
    // Add item to player inventory
    await db.addPlayerItem(player.id, targetItem.name, quantity);
    
    // Update merchant inventory (if not unlimited)
    if (!merchantItem.unlimited) {
      await db.query(
        'UPDATE merchant_items SET current_qty = current_qty - $1 WHERE id = $2',
        [quantity, merchantItem.id]
      );
    }
    
    const optimal = db.convertCurrencyToOptimal(totalPrice);
    let priceMsg = '';
    if (optimal.crowns > 0) {
      priceMsg += `${optimal.crowns} Glimmer Crown${optimal.crowns !== 1 ? 's' : ''}`;
      if (optimal.shards > 0) {
        priceMsg += `, ${optimal.shards} Glimmer Shard${optimal.shards !== 1 ? 's' : ''}`;
      }
    } else {
      priceMsg += `${optimal.shards} Glimmer Shard${optimal.shards !== 1 ? 's' : ''}`;
    }
    
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `Purchased ${quantity} ${targetItem.name}${quantity !== 1 ? '(s)' : ''} for ${priceMsg}.` 
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Handle sell command - sell item to merchant
 */
async function sell(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const currentRoom = await db.getRoomById(player.current_room_id);
  if (!currentRoom) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Check if room is merchant type
  if (currentRoom.room_type !== 'merchant') {
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a merchant room to sell items.' }));
    return;
  }
  
  const { itemName, quantity = 1 } = data;
  if (!itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Usage: sell <item> [quantity]' }));
    return;
  }
  
  try {
    // Get player inventory
    const playerItems = await db.getPlayerItems(player.id);
    
    // Find item by partial name matching
    const matchedItems = playerItems.filter(item => 
      item.item_name.toLowerCase().includes(itemName.toLowerCase()) ||
      itemName.toLowerCase().includes(item.item_name.toLowerCase())
    );
    
    if (matchedItems.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: `You don't have "${itemName}".` }));
      return;
    }
    
    if (matchedItems.length > 1) {
      ws.send(JSON.stringify({ type: 'error', message: `Which did you mean: ${matchedItems.map(i => i.item_name).join(', ')}?` }));
      return;
    }
    
    const targetItem = matchedItems[0];
    
    // Check if player has enough
    if (targetItem.quantity < quantity) {
      ws.send(JSON.stringify({ type: 'error', message: `You only have ${targetItem.quantity} ${targetItem.item_name}.` }));
      return;
    }
    
    // Get merchant items for this room
    const merchantItems = await db.getMerchantItemsForRoom(currentRoom.id);
    const itemDef = await db.getItemByName(targetItem.item_name);
    const merchantItem = merchantItems.find(mi => mi.item_id === itemDef.id);
    
    // Check if merchant buys this item
    if (!merchantItem || !merchantItem.sellable) {
      ws.send(JSON.stringify({ type: 'error', message: `This merchant does not buy "${targetItem.item_name}".` }));
      return;
    }
    
    // Calculate payment (use merchant's price)
    const totalPayment = merchantItem.price * quantity;
    if (totalPayment <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'This merchant does not pay for this item.' }));
      return;
    }
    
    // Remove item from player inventory
    await db.removePlayerItem(player.id, targetItem.item_name, quantity);
    
    // Add currency to player (with auto-conversion)
    await db.addPlayerCurrency(player.id, totalPayment);
    
    // Update merchant inventory (if not unlimited)
    if (!merchantItem.unlimited) {
      await db.query(
        'UPDATE merchant_items SET current_qty = current_qty + $1 WHERE id = $2',
        [quantity, merchantItem.id]
      );
    }
    
    const optimal = db.convertCurrencyToOptimal(totalPayment);
    let paymentMsg = '';
    if (optimal.crowns > 0) {
      paymentMsg += `${optimal.crowns} Glimmer Crown${optimal.crowns !== 1 ? 's' : ''}`;
      if (optimal.shards > 0) {
        paymentMsg += `, ${optimal.shards} Glimmer Shard${optimal.shards !== 1 ? 's' : ''}`;
      }
    } else {
      paymentMsg += `${optimal.shards} Glimmer Shard${optimal.shards !== 1 ? 's' : ''}`;
    }
    
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: `Sold ${quantity} ${targetItem.item_name}${quantity !== 1 ? '(s)' : ''} for ${paymentMsg}.` 
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Handle who command - show all players currently in the world
 */
async function who(ctx, data) {
  const { ws, db, connectedPlayers, playerName } = ctx;
  
  try {
    // Get all connected players
    const playersList = [];
    
    for (const [connectionId, playerData] of connectedPlayers.entries()) {
      // Skip if WebSocket is not open
      if (!playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      
      // Get player info
      const player = await db.getPlayerByName(playerData.playerName);
      if (!player) continue;
      
      // Get room info
      const room = await db.getRoomById(player.current_room_id);
      if (!room) continue;
      
      // Get map info
      const map = await db.getMapById(room.map_id);
      if (!map) continue;
      
      playersList.push({
        name: player.name,
        mapName: map.name,
        roomName: room.name,
        x: room.x,
        y: room.y
      });
    }
    
    // Sort by player name
    playersList.sort((a, b) => a.name.localeCompare(b.name));
    
    // Build HTML table
    let html = '<div class="who-list">';
    html += '<table class="who-table">';
    html += '<thead><tr>';
    html += '<th>Player</th>';
    html += '<th>Map</th>';
    html += '<th>Location</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    if (playersList.length === 0) {
      html += '<tr><td colspan="3" style="text-align: center; color: #888;">No other players are currently in the world.</td></tr>';
    } else {
      playersList.forEach(player => {
        html += '<tr>';
        html += `<td><strong>${escapeHtml(player.name)}</strong></td>`;
        html += `<td>${escapeHtml(player.mapName)}</td>`;
        html += `<td>${escapeHtml(player.roomName)} (${player.x}, ${player.y})</td>`;
        html += '</tr>';
      });
    }
    
    html += '</tbody></table>';
    html += '</div>';
    
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: html,
      html: true
    }));
  } catch (err) {
    console.error('Who command error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get player list' }));
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Assign attribute point (increment or decrement)
 * Increment: increases stat by 1, decreases assignable_points by 1
 * Decrement: decreases stat by 1, increases assignable_points by 1
 */
async function assignAttributePoint(ctx, data) {
  const { statKey, action } = data;
  const { db, connectionId, connectedPlayers } = ctx;
  
  if (!statKey || !action) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Missing statKey or action' }));
    return;
  }
  
  if (action !== 'increment' && action !== 'decrement') {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Invalid action. Must be increment or decrement' }));
    return;
  }
  
  // Get player data
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  // Get current player data
  const player = await db.getPlayerById(playerData.playerId);
  if (!player) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: 'Player not found in database' }));
    return;
  }
  
  // Validate stat column name (whitelist to prevent SQL injection)
  const allowedStatColumns = ['stat_ingenuity', 'stat_resonance', 'stat_fortitude', 'stat_acumen'];
  if (!allowedStatColumns.includes(statKey)) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: `Invalid stat: ${statKey}` }));
    return;
  }
  
  // Validate stat column exists in player data
  if (player[statKey] === undefined && player[statKey] !== 0) {
    ctx.ws.send(JSON.stringify({ type: 'error', message: `Stat ${statKey} not found` }));
    return;
  }
  
  const currentStatValue = player[statKey] || 0;
  const currentAssignablePoints = player.assignable_points || 0;
  
  // Validate increment: need assignable points > 0
  if (action === 'increment') {
    if (currentAssignablePoints <= 0) {
      ctx.ws.send(JSON.stringify({ type: 'error', message: 'No assignable points available' }));
      return;
    }
    
    // Update: increment stat, decrement assignable_points
    // Use parameterized query with whitelisted column name
    await db.query(
      `UPDATE players SET ${statKey} = ${statKey} + 1, assignable_points = assignable_points - 1 WHERE id = $1`,
      [playerData.playerId]
    );
  }
  
  // Validate decrement: need stat > 1 (minimum is 1)
  if (action === 'decrement') {
    if (currentStatValue <= 1) {
      ctx.ws.send(JSON.stringify({ type: 'error', message: 'Cannot decrease stat below 1' }));
      return;
    }
    
    // Update: decrement stat, increment assignable_points
    await db.query(
      `UPDATE players SET ${statKey} = ${statKey} - 1, assignable_points = assignable_points + 1 WHERE id = $1`,
      [playerData.playerId]
    );
  }
  
  // Get updated player data
  const updatedPlayer = await db.getPlayerById(playerData.playerId);
  
  // Send updated stats
  const playerStats = db.getPlayerStats(updatedPlayer);
  if (playerStats) {
    playerStats.playerName = updatedPlayer.name;
    playerStats.currentEncumbrance = await db.getPlayerCurrentEncumbrance(playerData.playerId);
  }
  
  ctx.ws.send(JSON.stringify({
    type: 'playerStats',
    stats: playerStats || {}
  }));
}

/**
 * Get all maps for auto-path selection
 */
async function getAutoPathMaps(ctx, data) {
  const { ws, db } = ctx;
  
  try {
    const maps = await db.getAllMaps();
    ws.send(JSON.stringify({ type: 'autoPathMaps', maps }));
  } catch (err) {
    console.error('Get auto-path maps error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get maps' }));
  }
}

/**
 * Get all rooms in a map for auto-path selection
 */
async function getAutoPathRooms(ctx, data) {
  const { ws, db } = ctx;
  const { mapId } = data;
  
  if (!mapId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map ID required' }));
    return;
  }
  
  try {
    const rooms = await db.getRoomsByMap(mapId);
    ws.send(JSON.stringify({ type: 'autoPathRooms', rooms }));
  } catch (err) {
    console.error('Get auto-path rooms error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get rooms' }));
  }
}

/**
 * Calculate path from player's current room to target room
 */
async function calculateAutoPath(ctx, data) {
  const { ws, db, playerName } = ctx;
  const { targetRoomId } = data;
  
  if (!targetRoomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Target room ID required' }));
    return;
  }
  
  if (!playerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  try {
    const player = await db.getPlayerByName(playerName);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
      return;
    }
    
    const currentRoomId = player.current_room_id;
    const { findPath } = require('../utils/pathfinding');
    
    const path = await findPath(currentRoomId, targetRoomId, db);
    
    if (path === null) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'No path found to destination.' 
      }));
      return;
    }
    
    ws.send(JSON.stringify({ 
      type: 'autoPathCalculated', 
      path,
      success: true 
    }));
  } catch (err) {
    console.error('Calculate auto-path error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to calculate path' }));
  }
}

/**
 * Start auto-navigation along a calculated path
 */
async function startAutoNavigation(ctx, data) {
  const { ws, db, connectedPlayers, connectionId, playerName } = ctx;
  const { path } = data;
  
  if (!path || !Array.isArray(path) || path.length === 0) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid path' }));
    return;
  }
  
  if (!playerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  try {
    const playerData = connectedPlayers.get(connectionId);
    if (!playerData) {
      ws.send(JSON.stringify({ type: 'error', message: 'Player not connected' }));
      return;
    }
    
    // Store auto-navigation state
    playerData.autoNavigation = {
      path,
      currentStep: 0,
      isActive: true,
      timeoutId: null
    };
    
    // Begin first movement step
    executeNextAutoNavigationStep(ctx, connectionId);
    
    ws.send(JSON.stringify({ 
      type: 'autoNavigationStarted',
      message: 'Auto-navigation started. Movement commands are now blocked.'
    }));
  } catch (err) {
    console.error('Start auto-navigation error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to start auto-navigation' }));
  }
}

/**
 * Execute the next step in auto-navigation
 */
async function executeNextAutoNavigationStep(ctx, connectionId) {
  const { db, connectedPlayers, ws, factoryWidgetState, warehouseWidgetState, sessionId, playerName } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData || !playerData.autoNavigation || !playerData.autoNavigation.isActive) {
    return; // Auto-navigation not active or cleared
  }
  
  const { path, currentStep } = playerData.autoNavigation;
  
  // Check if we've completed the path
  if (currentStep >= path.length) {
    // Navigation complete
    playerData.autoNavigation = null;
    
    // Check if there's a pending path execution
    if (playerData.pendingPathExecution) {
      // Start path execution immediately
      const pendingPath = playerData.pendingPathExecution;
      playerData.pendingPathExecution = null;
      
      // Start path execution
      playerData.pathExecution = {
        pathId: pendingPath.pathId,
        pathType: pendingPath.pathType,
        steps: pendingPath.steps,
        currentStep: 0,
        isActive: true,
        timeoutId: null,
        isLooping: pendingPath.pathType === 'loop'
      };
      
      // Begin first path step
      executeNextPathStep(ctx, connectionId);
      
      if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        playerData.ws.send(JSON.stringify({ 
          type: 'autoNavigationComplete',
          message: 'Reached path origin. Starting path execution...'
        }));
      }
    } else {
      if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        playerData.ws.send(JSON.stringify({ 
          type: 'autoNavigationComplete',
          message: 'Auto-navigation complete! You have reached your destination.'
        }));
      }
    }
    return;
  }
  
  // Get the next step
  const step = path[currentStep];
  
  // Get player to check auto_navigation_time_ms
  const player = await db.getPlayerByName(playerData.playerName);
  const delayMs = (player && player.auto_navigation_time_ms) ? player.auto_navigation_time_ms : 1000;
  
  // Wait for delay, then execute move
  const timeoutId = setTimeout(async () => {
    // Check if auto-navigation is still active
    if (!playerData.autoNavigation || !playerData.autoNavigation.isActive) {
      return;
    }
    
    // Call move handler directly (not via WebSocket)
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      try {
        // Ensure ctx has all required properties for move handler
        const moveCtx = {
          ws: playerData.ws,
          db,
          connectedPlayers,
          factoryWidgetState,
          warehouseWidgetState,
          connectionId,
          sessionId,
          playerName: playerData.playerName
        };
        
        // Call move handler directly - it will check auto-navigation state and allow the move
        await move(moveCtx, { direction: step.direction });
        
        // Note: currentStep is incremented in the move handler after successful move
        // The move handler calls executeNextAutoNavigationStep to continue
      } catch (err) {
        // Move failed - stop auto-navigation
        console.error('Auto-navigation move error:', err);
        clearAutoNavigation(connectedPlayers, connectionId);
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
          playerData.ws.send(JSON.stringify({ 
            type: 'autoNavigationFailed',
            message: 'Auto-navigation stopped due to an error: ' + (err.message || err.toString())
          }));
        }
      }
    } else {
      // WebSocket closed - stop auto-navigation
      clearAutoNavigation(connectedPlayers, connectionId);
    }
  }, delayMs);
  
  // Store timeout ID for cleanup
  playerData.autoNavigation.timeoutId = timeoutId;
}

/**
 * Clear auto-navigation state (called on failure or disconnect)
 */
function clearAutoNavigation(connectedPlayers, connectionId) {
  const playerData = connectedPlayers.get(connectionId);
  if (playerData && playerData.autoNavigation) {
    if (playerData.autoNavigation.timeoutId) {
      clearTimeout(playerData.autoNavigation.timeoutId);
    }
    playerData.autoNavigation = null;
  }
}

async function getWidgetConfig(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const config = await db.getPlayerWidgetConfig(playerData.playerId);
  ws.send(JSON.stringify({ type: 'widgetConfig', config }));
}

async function updateWidgetConfig(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { config } = data;
  if (!config || typeof config !== 'object') {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid config' }));
    return;
  }
  
  console.log(`Saving widget config for player ${playerData.playerId}:`, config);
  await db.updatePlayerWidgetConfig(playerData.playerId, config);
  console.log(`Widget config saved successfully for player ${playerData.playerId}`);
  ws.send(JSON.stringify({ type: 'widgetConfigUpdated', config }));
}

async function startPathingMode(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const room = await db.getRoomById(playerData.roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // Return current room and map data for pathing mode initialization
  ws.send(JSON.stringify({
    type: 'pathingModeStarted',
    room: {
      id: room.id,
      name: room.name,
      x: room.x,
      y: room.y,
      mapId: room.map_id
    },
    mapId: room.map_id
  }));
}

async function addPathStep(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { roomId, previousRoomId } = data;
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
    return;
  }
  
  const room = await db.getRoomById(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  // If there's a previous room, validate adjacency
  if (previousRoomId) {
    const previousRoom = await db.getRoomById(previousRoomId);
    if (!previousRoom) {
      ws.send(JSON.stringify({ type: 'error', message: 'Previous room not found' }));
      return;
    }
    
    // Check if rooms are adjacent (manhattan distance of 1)
    const dx = Math.abs(room.x - previousRoom.x);
    const dy = Math.abs(room.y - previousRoom.y);
    if (dx + dy !== 1) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rooms must be adjacent' }));
      return;
    }
    
    // Calculate direction
    let direction = '';
    if (room.y < previousRoom.y) direction = 'N';
    else if (room.y > previousRoom.y) direction = 'S';
    else if (room.x > previousRoom.x) direction = 'E';
    else if (room.x < previousRoom.x) direction = 'W';
    
    ws.send(JSON.stringify({
      type: 'pathStepAdded',
      room: {
        id: room.id,
        name: room.name,
        x: room.x,
        y: room.y,
        mapId: room.map_id
      },
      direction: direction
    }));
  } else {
    // First step, no direction needed
    ws.send(JSON.stringify({
      type: 'pathStepAdded',
      room: {
        id: room.id,
        name: room.name,
        x: room.x,
        y: room.y,
        mapId: room.map_id
      },
      direction: null
    }));
  }
}

async function savePath(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { name, pathType, steps, mapId, originRoomId } = data;
  if (!name || !pathType || !steps || !Array.isArray(steps) || steps.length === 0) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid path data' }));
    return;
  }
  
  if (pathType !== 'loop' && pathType !== 'path') {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid path type' }));
    return;
  }
  
  try {
    const pathId = await db.createPath(playerData.playerId, mapId, name, originRoomId, pathType, steps);
    ws.send(JSON.stringify({
      type: 'pathSaved',
      pathId: pathId,
      name: name,
      pathType: pathType
    }));
  } catch (error) {
    console.error('Error saving path:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to save path: ' + error.message }));
  }
}

async function cancelPathing(ctx, data) {
  const { ws, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  ws.send(JSON.stringify({ type: 'pathingCancelled' }));
}

/**
 * Get map data for a specific map ID
 * Used when pathing crosses map boundaries or when entering pathing mode
 */
async function getMapData(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const { mapId } = data;
  if (!mapId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map ID required' }));
    return;
  }

  try {
    // Get all rooms from the specified map
    const mapRooms = await db.getRoomsByMap(mapId);
    const allRooms = mapRooms.map(r => ({
      id: r.id,
      name: r.name,
      x: r.x,
      y: r.y,
      mapId: r.map_id,
      roomType: r.room_type || 'normal',
      connected_map_id: r.connected_map_id || null,
      connected_room_x: r.connected_room_x || null,
      connected_room_y: r.connected_room_y || null,
      connection_direction: r.connection_direction || null
    }));

    // Get room type colors
    const roomTypeColors = await db.getAllRoomTypeColors();
    const colorMap = {};
    roomTypeColors.forEach(rtc => {
      colorMap[rtc.room_type] = rtc.color;
    });

    // Get current room for the player
    const playerRoom = await db.getRoomById(playerData.roomId);
    const currentRoom = playerRoom ? {
      x: playerRoom.x,
      y: playerRoom.y,
      id: playerRoom.id
    } : null;

    ws.send(JSON.stringify({
      type: 'mapData',
      rooms: allRooms,
      roomTypeColors: colorMap,
      currentRoom: currentRoom,
      mapId: mapId
    }));
  } catch (error) {
    console.error('Error getting map data:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get map data: ' + error.message }));
  }
}

/**
 * Get a room from a different map for pathing mode
 * Used when pathing crosses map boundaries
 */
async function getPathingRoom(ctx, data) {
  const { ws, db } = ctx;
  const { mapId, x, y } = data;
  
  if (!mapId || x === undefined || y === undefined) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map ID, X, and Y coordinates required' }));
    return;
  }
  
  try {
    const room = await db.getRoomByCoords(mapId, x, y);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }
    
    // Get the direction from the previous step or use CONNECTION
    const direction = data.direction || 'CONNECTION';
    
    ws.send(JSON.stringify({
      type: 'pathingRoom',
      room: {
        id: room.id,
        name: room.name,
        x: room.x,
        y: room.y,
        mapId: room.map_id,
        connected_map_id: room.connected_map_id,
        connected_room_x: room.connected_room_x,
        connected_room_y: room.connected_room_y,
        connection_direction: room.connection_direction
      },
      direction: direction
    }));
  } catch (error) {
    console.error('Error getting pathing room:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get room: ' + error.message }));
  }
}

/**
 * Get all paths/loops for the current player across all maps
 */
/**
 * Get game messages from cache (for client preloading)
 */
async function getGameMessages(ctx, data) {
  const { ws } = ctx;
  const category = data.category || null;

  try {
    const messages = await ctx.db.getAllGameMessages(category);
    ws.send(JSON.stringify({
      type: 'gameMessages',
      messages: messages
    }));
  } catch (error) {
    console.error('Error getting game messages:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get messages: ' + error.message }));
  }
}

async function getAllPlayerPaths(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  try {
    const paths = await db.getAllPathsByPlayer(playerData.playerId);
    ws.send(JSON.stringify({
      type: 'allPlayerPaths',
      paths: paths
    }));
  } catch (error) {
    console.error('Error getting all player paths:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get paths: ' + error.message }));
  }
}

/**
 * Get detailed information about a specific path/loop including all steps
 */
async function getPathDetails(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const { pathId } = data;
  if (!pathId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Path ID required' }));
    return;
  }

  try {
    const path = await db.getPathById(pathId);
    if (!path) {
      ws.send(JSON.stringify({ type: 'error', message: 'Path not found' }));
      return;
    }

    // Verify path belongs to player (security check)
    if (path.player_id !== playerData.playerId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
      return;
    }

    // Get all steps for this path
    const steps = await db.getPathSteps(pathId);
    
    // Get room details for each step
    const stepsWithDetails = await Promise.all(steps.map(async (step) => {
      const room = await db.getRoomById(step.room_id);
      return {
        stepIndex: step.step_index,
        roomId: step.room_id,
        roomName: room ? room.name : 'Unknown',
        x: room ? room.x : null,
        y: room ? room.y : null,
        direction: step.direction,
        mapId: room ? room.map_id : null
      };
    }));

    ws.send(JSON.stringify({
      type: 'pathDetails',
      path: {
        id: path.id,
        name: path.name,
        pathType: path.path_type,
        originRoomId: path.origin_room_id,
        mapId: path.map_id
      },
      steps: stepsWithDetails
    }));
  } catch (error) {
    console.error('Error getting path details:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get path details: ' + error.message }));
  }
}

/**
 * Start executing a path or loop
 */
async function startPathExecution(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const { pathId } = data;
  if (!pathId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Path ID required' }));
    return;
  }

  try {
    // Get path details
    const path = await db.getPathById(pathId);
    if (!path) {
      ws.send(JSON.stringify({ type: 'error', message: 'Path not found' }));
      return;
    }

    // Verify path belongs to player
    if (path.player_id !== playerData.playerId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
      return;
    }

    // Get path steps
    const steps = await db.getPathSteps(pathId);
    if (!steps || steps.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'Path has no steps' }));
      return;
    }
    
    // Filter out steps with empty directions (these shouldn't exist, but handle gracefully)
    const validSteps = steps.filter(s => s.direction && s.direction.trim() !== '');
    if (validSteps.length === 0) {
      console.error('Path execution: No valid steps with directions found');
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Path has no valid steps with directions. Please recreate the path.' 
      }));
      return;
    }
    
    if (validSteps.length < steps.length) {
      console.warn(`Path execution: Filtered out ${steps.length - validSteps.length} steps with empty directions`);
    }
    
    console.log(`Path execution: Loaded ${validSteps.length} valid steps with directions:`, validSteps.map(s => s.direction));

    // Check if player is at origin room
    const isAtOrigin = playerData.roomId === path.origin_room_id;

    if (!isAtOrigin) {
      // Need to navigate to origin first
      const { findPath } = require('../utils/pathfinding');
      const autoPath = await findPath(playerData.roomId, path.origin_room_id, db);
      
      if (autoPath === null) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'No path found to origin room.' 
        }));
        return;
      }

      // Store pending path execution (use filtered valid steps)
      playerData.pendingPathExecution = {
        pathId: path.id,
        pathType: path.path_type,
        steps: validSteps.map(s => ({ direction: s.direction, roomId: s.room_id })),
        originRoomId: path.origin_room_id
      };

      // Start auto-navigation to origin
      playerData.autoNavigation = {
        path: autoPath,
        currentStep: 0,
        isActive: true,
        timeoutId: null
      };

      // Begin first movement step
      executeNextAutoNavigationStep(ctx, connectionId);

      ws.send(JSON.stringify({ 
        type: 'pathExecutionStarted',
        message: 'Navigating to path origin...',
        needsNavigation: true
      }));
    } else {
      // Already at origin, start path execution immediately (use filtered valid steps)
      playerData.pathExecution = {
        pathId: path.id,
        pathType: path.path_type,
        steps: validSteps.map(s => ({ direction: s.direction, roomId: s.room_id })),
        currentStep: 0,
        isActive: true,
        timeoutId: null,
        isLooping: path.path_type === 'loop'
      };

      // Begin first path step
      executeNextPathStep(ctx, connectionId);

      ws.send(JSON.stringify({ 
        type: 'pathExecutionStarted',
        message: 'Path execution started.',
        needsNavigation: false
      }));
    }
  } catch (error) {
    console.error('Error starting path execution:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to start path execution: ' + error.message }));
  }
}

/**
 * Execute the next step in path/loop execution
 */
async function executeNextPathStep(ctx, connectionId) {
  const { db, connectedPlayers, factoryWidgetState, warehouseWidgetState, sessionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData || !playerData.pathExecution || !playerData.pathExecution.isActive || playerData.pathExecution.isPaused) {
    return; // Path execution not active, cleared, or paused
  }
  
  const { steps, currentStep, isLooping } = playerData.pathExecution;
  
  // Calculate the actual step index (handle loop wrapping)
  let stepIndex = currentStep;
  if (currentStep >= steps.length) {
    if (isLooping) {
      // Loop: wrap to beginning
      stepIndex = currentStep % steps.length;
      playerData.pathExecution.currentStep = stepIndex;
    } else {
      // Path: stop execution
      playerData.pathExecution = null;
      if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        playerData.ws.send(JSON.stringify({ 
          type: 'pathExecutionComplete',
          message: 'Path execution complete!'
        }));
      }
      return;
    }
  }
  
  // Get the next step
  const step = steps[stepIndex];
  
  if (!step || !step.direction) {
    console.error('Invalid step in path execution:', step, 'at index', stepIndex);
    clearPathExecution(connectedPlayers, connectionId);
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify({ 
        type: 'pathExecutionFailed',
        message: 'Path execution stopped: invalid step data'
      }));
    }
    return;
  }
  
  // Get player to check auto_loop_time_ms
  const player = await db.getPlayerByName(playerData.playerName);
  const delayMs = (player && player.auto_loop_time_ms) ? player.auto_loop_time_ms : 2000;
  
  // Wait for delay, then execute move
  const timeoutId = setTimeout(async () => {
    // Check if path execution is still active
    if (!playerData.pathExecution || !playerData.pathExecution.isActive) {
      return;
    }
    
    // Call move handler directly
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      try {
        const moveCtx = {
          ws: playerData.ws,
          db,
          connectedPlayers,
          factoryWidgetState,
          warehouseWidgetState,
          connectionId,
          sessionId,
          playerName: playerData.playerName
        };
        
        // Call move handler - it will check path execution state and allow the move
        console.log(`Path execution: Executing step ${stepIndex}/${steps.length}, direction: ${step.direction}, currentStep: ${playerData.pathExecution.currentStep}`);
        await move(moveCtx, { direction: step.direction });
        
        // Note: currentStep is incremented in the move handler after successful move
        // The move handler calls executeNextPathStep to continue
      } catch (err) {
        // Move failed - stop path execution
        console.error('Path execution move error:', err);
        clearPathExecution(connectedPlayers, connectionId);
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
          playerData.ws.send(JSON.stringify({ 
            type: 'pathExecutionFailed',
            message: 'Path execution stopped due to an error: ' + (err.message || err.toString())
          }));
        }
      }
    } else {
      // WebSocket closed - stop path execution
      clearPathExecution(connectedPlayers, connectionId);
    }
  }, delayMs);
  
  // Store timeout ID for cleanup
  playerData.pathExecution.timeoutId = timeoutId;
}

/**
 * Clear path execution state
 */
function clearPathExecution(connectedPlayers, connectionId) {
  const playerData = connectedPlayers.get(connectionId);
  if (playerData && playerData.pathExecution) {
    if (playerData.pathExecution.timeoutId) {
      clearTimeout(playerData.pathExecution.timeoutId);
    }
    playerData.pathExecution = null;
  }
  if (playerData && playerData.pendingPathExecution) {
    playerData.pendingPathExecution = null;
  }
}

/**
 * Stop path/loop execution (pause)
 */
async function stopPathExecution(ctx, data) {
  const { ws, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  // Store pause state (don't clear pathExecution, just mark as paused)
  if (playerData.pathExecution && playerData.pathExecution.isActive) {
    playerData.pathExecution.isPaused = true;
    // Clear timeout but keep execution state
    if (playerData.pathExecution.timeoutId) {
      clearTimeout(playerData.pathExecution.timeoutId);
      playerData.pathExecution.timeoutId = null;
    }
  } else {
    clearPathExecution(connectedPlayers, connectionId);
  }
  
  ws.send(JSON.stringify({ 
    type: 'pathExecutionStopped',
    message: 'Path/Loop execution paused.'
  }));
}

/**
 * Continue path/loop execution after pause
 */
async function continuePathExecution(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  
  console.log('[continuePathExecution] Called - connectionId:', connectionId, 'data:', data);
  
  if (!playerData || !playerData.playerId) {
    console.log('[continuePathExecution] Not authenticated');
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const { pathId } = data;
  if (!pathId) {
    console.log('[continuePathExecution] No pathId provided');
    ws.send(JSON.stringify({ type: 'error', message: 'Path ID required' }));
    return;
  }

  console.log('[continuePathExecution] Checking pathExecution state:', {
    exists: !!playerData.pathExecution,
    isPaused: playerData.pathExecution?.isPaused,
    pathId: playerData.pathExecution?.pathId,
    requestedPathId: pathId
  });

  // Check if path execution exists and is paused
  if (!playerData.pathExecution || !playerData.pathExecution.isPaused) {
    console.log('[continuePathExecution] No paused path execution found');
    ws.send(JSON.stringify({ type: 'error', message: 'No paused path execution to continue' }));
    return;
  }

  // Verify path ID matches
  if (playerData.pathExecution.pathId !== pathId) {
    console.log('[continuePathExecution] Path ID mismatch');
    ws.send(JSON.stringify({ type: 'error', message: 'Path ID mismatch' }));
    return;
  }

  console.log('[continuePathExecution] Resuming execution from step:', playerData.pathExecution.currentStep);

  // Resume execution
  playerData.pathExecution.isPaused = false;
  playerData.pathExecution.isActive = true;
  
  // Continue from current step (don't reset, just continue)
  executeNextPathStep(ctx, connectionId);
  
  console.log('[continuePathExecution] Sending pathExecutionResumed message');
  
  ws.send(JSON.stringify({ 
    type: 'pathExecutionResumed',
    message: 'Path/Loop execution resumed.'
  }));
}

module.exports = {
  authenticateSession,
  getWidgetConfig,
  updateWidgetConfig,
  getGameMessages,
  startPathingMode,
  addPathStep,
  savePath,
  cancelPathing,
  getPathingRoom,
  getMapData,
  getAllPlayerPaths,
  getPathDetails,
  startPathExecution,
  stopPathExecution,
  continuePathExecution,
  move,
  look,
  inventory,
  take,
  drop,
  factoryWidgetAddItem,
  harvest,
  resonate,
  talk,
  ask,
  telepath,
  solve,
  clue,
  greet,
  restartServer,
  cleanupLoreKeeperEngagement,
  warehouse,
  store,
  withdraw,
  list,
  deposit,
  balance,
  buy,
  sell,
  wealth,
  who,
  saveTerminalMessage,
  assignAttributePoint,
  getAutoPathMaps,
  getAutoPathRooms,
  calculateAutoPath,
  startAutoNavigation
};

