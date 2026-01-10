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
const { isZorkEnabled, enableZork, disableZork } = require('../utils/zorkFlag');

// Factory crafting system services
const factoryConfig = require('../config/factoryConfig');
const factoryRuneSystem = require('../services/factoryRuneSystem');
const factoryQuirks = require('../services/factoryQuirks');
const factoryRecipeMatcher = require('../services/factoryRecipeMatcher');
const factoryCraftingEngine = require('../services/factoryCraftingEngine');
const factoryOutputRouter = require('../services/factoryOutputRouter');

// Track Lore Keeper engagement timers per connectionId
const loreKeeperEngagementTimers = new Map();

// Track active Glow Codex puzzles per player (connectionId -> { npcId, npcName, puzzleType, clueIndex })
const activeGlowCodexPuzzles = new Map();

/**
 * Get connected map data when player is on a junction room
 * Returns null if not on a junction, or { rooms, mapId, mapName, connectionDirection } if on junction
 * @param {object} db - Database module
 * @param {object} currentRoom - The current room object (must have connected_map_id, connection_direction)
 * @param {object} colorMap - Room type colors map
 * @returns {object|null} Connected map data or null
 */
async function getConnectedMapData(db, currentRoom, colorMap) {
  // Check if current room is a junction (has connected_map_id)
  if (!currentRoom || !currentRoom.connected_map_id) {
    return null;
  }
  
  try {
    // Get all rooms from the connected map
    const connectedMapRooms = await db.getRoomsByMap(currentRoom.connected_map_id);
    const connectedMap = await db.getMapById(currentRoom.connected_map_id);
    
    if (!connectedMapRooms || connectedMapRooms.length === 0) {
      return null;
    }
    
    const rooms = connectedMapRooms.map(r => ({
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
    
    // Find the entry point room in the connected map (the room we would arrive at)
    const entryRoom = connectedMapRooms.find(r => 
      r.x === currentRoom.connected_room_x && 
      r.y === currentRoom.connected_room_y
    );
    
    return {
      rooms: rooms,
      mapId: currentRoom.connected_map_id,
      mapName: connectedMap ? connectedMap.name : 'Unknown',
      connectionDirection: currentRoom.connection_direction || null,
      entryRoom: entryRoom ? { x: entryRoom.x, y: entryRoom.y, id: entryRoom.id } : null,
      roomTypeColors: colorMap
    };
  } catch (error) {
    console.error('Error getting connected map data:', error);
    return null;
  }
}

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
/**
 * Strip @ symbols from player name for display
 */
function stripPlayerNameMarkup(playerName) {
  if (!playerName) return playerName;
  return playerName.replace(/^@+|@+$/g, '');
}

async function authenticateSession(ctx, data) {
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, session, sessionId, activeCharacterWindows } = ctx;
  // Use let for playerName since it may be updated during session restoration
  let playerName = ctx.playerName;
  
  // Get windowId from message data or context (fallback to context for backward compatibility)
  const windowId = data.windowId || ctx.windowId || null;
  
  // DEV MODE: Test bypass - allow direct authentication with playerName in data (only if no session exists)
  // This allows MCP test tools to connect without HTTP session
  let testPlayerName = null;
  let hasValidSession = session && sessionId && session.sessionData && session.sessionData.playerName;
  
  // SESSION RESTORATION: Try to restore session FIRST if we have sessionId (cookie exists) but no sessionData (server restart)
  // This must happen BEFORE test bypass check to properly restore sessions
  const needsRestore = session && session.needsRestore;
  if (!hasValidSession && sessionId && (needsRestore || !session?.sessionData) && data.playerName) {
    const restorePlayerName = data.playerName;
    const restorePlayer = await db.getPlayerByName(restorePlayerName);
    
    if (restorePlayer) {
      // Get account_id for this player from user_characters table
      const userCharacterResult = await db.query(
        'SELECT account_id FROM user_characters WHERE player_id = $1 LIMIT 1',
        [restorePlayer.id]
      );
      
      if (userCharacterResult && userCharacterResult.rows && userCharacterResult.rows.length > 0) {
        const accountId = userCharacterResult.rows[0].account_id;
        
        // Restore session in sessionStore (imported from middleware)
        const { sessionStore } = require('../middleware/session');
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        sessionStore.set(sessionId, {
          accountId: accountId,
          playerName: restorePlayerName,
          playerId: restorePlayer.id,
          createdAt: Date.now(),
          expiresAt: expiresAt
        });
        
        console.log(`[authenticateSession] ✅ Restored session for ${restorePlayerName} after server restart`);
        
        // Re-fetch session from store to get updated data
        const restoredSessionData = sessionStore.get(sessionId);
        
        // Update session object to reflect restored session (session is passed by reference)
        if (session) {
          session.sessionData = restoredSessionData;
          session.needsRestore = false; // Clear the restore flag
        }
        
        // Update context playerName for downstream use (use restored name)
        ctx.playerName = restorePlayerName;
        // Also update local playerName variable to use restored value
        playerName = restorePlayerName;
        
        // Mark session as valid now that it's restored
        hasValidSession = true;
      }
    }
  }
  
  // Only use test bypass if we still don't have a valid session and no sessionId (no cookie = dev mode)
  if (!hasValidSession && !sessionId && data.playerName) {
    // Verify player exists
    const testPlayer = await db.getPlayerByName(data.playerName);
    if (testPlayer) {
      testPlayerName = data.playerName;
      console.log(`[authenticateSession] Using test bypass for ${testPlayerName} (no session cookie)`);
    }
  }
  
  // Validate session (or test bypass)
  if (!hasValidSession) {
    if (!testPlayerName) {
      ws.send(JSON.stringify({ type: 'error', message: 'No valid session. Please select a character first.' }));
      return { authenticated: false };
    }
  }

  // Use playerName from context if it was updated during restoration
  const effectivePlayerName = testPlayerName || (ctx.playerName || playerName);
  const player = await db.getPlayerByName(effectivePlayerName);
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
      await db.updatePlayerRoom(townSquare.id, effectivePlayerName);
      player.current_room_id = townSquare.id;
    } else {
      // Fallback: try to get room at coordinates (0, 0) on map 1
      const fallbackRoom = await db.getRoomByCoords(1, 0, 0);
      if (fallbackRoom) {
        await db.updatePlayerRoom(fallbackRoom.id, effectivePlayerName);
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
      // Remove old closed connection entry
      connectedPlayers.delete(existingConnectionId);
      cancelLoreKeeperEngagement(existingConnectionId);
      // Continue below to create new connection
    } else if (oldConnectionOpen) {
      // Old connection is still open - disconnect it (new window opened or different windowId)
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
      const displayPlayerName = stripPlayerNameMarkup(player.name);
      const leftMessage = messageCache.getFormattedMessage('player_left_game', { playerName: displayPlayerName });
      broadcastToAll(connectedPlayers, {
        type: 'systemMessage',
        message: leftMessage
      });
    } else {
      // Old connection is closed but different windowId - just clean up
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
  
  // CRITICAL: End any stale harvest sessions from previous connections
  // This prevents harvests from continuing after logout/login
  const activeSession = await findPlayerHarvestSession(db, player.id);
  if (activeSession) {
    await endHarvestSession(db, activeSession.roomNpcId, true, 'player_reconnected');
  }
  
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
  }

  // Editor connections: Send sessionAuthenticated and skip game-specific setup
  if (data.isEditor === true) {
    ws.send(JSON.stringify({ type: 'sessionAuthenticated' }));
    return { authenticated: true, connectionId };
  }

  // Game connections: Continue with game-specific setup
  
  // Reset auto-harvest toggle on login (should not persist across sessions)
  // This prevents auto-harvest from starting automatically when a player logs in
  const loginWidgetConfig = await db.getPlayerWidgetConfig(player.id);
  if (loginWidgetConfig?.automation?.toggles?.autoHarvest === true) {
    loginWidgetConfig.automation.toggles.autoHarvest = false;
    await db.updatePlayerWidgetConfig(player.id, loginWidgetConfig);
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
  const displayPlayerName = stripPlayerNameMarkup(player.name);
  const enteredMessage = messageCache.getFormattedMessage('player_entered_game', { playerName: displayPlayerName });
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
  
  // Check if player is on a junction room - if so, include connected map data
  const connectedMapData = await getConnectedMapData(db, room, colorMap);
  
  ws.send(JSON.stringify({
    type: 'mapData',
    rooms: allRooms,
    roomTypeColors: colorMap,
    currentRoom: {
      x: room.x,
      y: room.y
    },
    mapId: room.map_id,
    connectedMapData: connectedMapData
  }));

  // Notify others in the room (exclude this connection)
  // Send formatted message from database
  // Reuse displayPlayerName (already set above, but use effectivePlayerName for consistency)
  const displayPlayerNameForArrival = stripPlayerNameMarkup(effectivePlayerName);
  const arrivedMessage = messageCache.getFormattedMessage('player_arrived', { playerName: displayPlayerNameForArrival });
  broadcastToRoom(connectedPlayers, room.id, {
    type: 'playerJoined',
    playerName: effectivePlayerName,
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
 * Handle getCommsHistory - retrieve comms history from database
 */
async function getCommsHistory(ctx, data) {
  const { ws, db, connectionId, playerName } = ctx;
  
  if (!connectionId || !playerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const player = await db.getPlayerByName(playerName);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  // Get comms history from database
  const commsHistory = await db.getCommsHistory(player.id);
  
  // Fill in player name for sent telepath messages
  const playerNameClean = player.name.replace(/^@|@$/g, '');
  commsHistory.telepath.forEach(msg => {
    if (!msg.isReceived && !msg.playerName) {
      msg.playerName = playerNameClean;
    }
  });
  
  // Send to client
  ws.send(JSON.stringify({
    type: 'commsHistory',
    history: commsHistory
  }));
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
        if (moveDirection && expectedDirection && moveDirection === expectedDirection) {
          // This is the path execution move, allow it to proceed
        } else {
          // Manual move detected during path execution - stop path execution and allow move
          clearPathExecution(connectedPlayers, connectionId);
          ws.send(JSON.stringify({ 
            type: 'paths:executionStopped',
            message: 'Path/Loop execution stopped by manual movement.' 
          }));
          // Continue with the move command
        }
      } else {
        // Invalid step index - stop path execution and allow move
        clearPathExecution(connectedPlayers, connectionId);
        ws.send(JSON.stringify({ 
          type: 'paths:executionStopped',
          message: 'Path/Loop execution stopped by manual movement.' 
        }));
        // Continue with the move command
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
        // Manual move detected during auto-navigation - stop auto-navigation and allow move
        if (playerData.autoNavigation.timeoutId) {
          clearTimeout(playerData.autoNavigation.timeoutId);
        }
        playerData.autoNavigation = null;
        ws.send(JSON.stringify({ 
          type: 'autopath:stopped',
          message: 'Auto-navigation stopped by manual movement.' 
        }));
        // Continue with the move command
      }
    } else {
      // Path complete but auto-navigation still active - stop it and allow move
      if (playerData.autoNavigation.timeoutId) {
        clearTimeout(playerData.autoNavigation.timeoutId);
      }
      playerData.autoNavigation = null;
      ws.send(JSON.stringify({ 
        type: 'autopath:stopped',
        message: 'Auto-navigation stopped by manual movement.' 
      }));
      // Continue with the move command
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

  const direction = data.direction ? data.direction.toUpperCase() : null;
  
  // Validate that direction is provided and is a valid movement direction
  if (!direction) {
    ws.send(JSON.stringify({ type: 'error', message: 'Direction is required' }));
    return;
  }
  
  // Only process up/down if this is explicitly a move command with U/D/UP/DOWN
  // This prevents false positives from commands like "look up" or "pick up"
  const validDirections = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'U', 'UP', 'D', 'DOWN'];
  if (!validDirections.includes(direction)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid direction' }));
    return;
  }
  
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
      // Only show this message if it's explicitly a move command with up/down
      ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
      return;
    } else if (direction === 'D' || direction === 'DOWN') {
      // Only show this message if it's explicitly a move command with up/down
      ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
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
  const displayPlayerName = stripPlayerNameMarkup(playerName);
  const leftMessage = leftDirection 
    ? messageCache.getFormattedMessage('player_left_to', { playerName: displayPlayerName, direction: leftDirection })
    : messageCache.getFormattedMessage('player_left', { playerName: displayPlayerName });
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
  const npcNow = Date.now();
  const npcsInNewRoom = npcsInNewRoomRaw.map(npc => {
    // Compute harvestStatus based on NPC state (same logic as sendRoomUpdate)
    let harvestStatus = 'ready';
    if (npc.state && npc.state.harvest_active) {
      harvestStatus = 'active';
    } else if (npc.state && npc.state.cooldown_until && npcNow < npc.state.cooldown_until) {
      harvestStatus = 'cooldown';
    }
    
    return {
      id: npc.id,
      name: npc.name,
      description: npc.description,
      state: npc.state,
      color: npc.color,
      harvestStatus: harvestStatus,
      statusMessageIdle: npc.statusMessageIdle,
      statusMessageReady: npc.statusMessageReady,
      statusMessageHarvesting: npc.statusMessageHarvesting,
      statusMessageCooldown: npc.statusMessageCooldown
    };
  });
  
  // Get items on the ground in the new room
  const roomItemsInNewRoom = await db.getRoomItems(targetRoom.id);

  // Get factory widget state if room is factory type
  let factoryState = null;
  if (targetRoom.room_type === 'factory') {
    const existingState = factoryWidgetState.get(connectionId);
    if (existingState && existingState.roomId === targetRoom.id) {
      factoryState = {
        slots: existingState.slots.length === 5 ? existingState.slots : [...existingState.slots, null, null, null, null].slice(0, 5) // Ensure 5 slots
      };
    } else {
      // Initialize empty factory state
      factoryState = {
        slots: [null, null, null, null, null] // 5 slots: 2 supply + 3 rune
      };
      factoryWidgetState.set(connectionId, {
        roomId: targetRoom.id,
        slots: [null, null, null, null, null] // 5 slots: 2 supply + 3 rune
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
    // Strip @ symbols from player name for display
    const displayName = stripPlayerNameMarkup(playerName);
    combinedEntities.push(displayName);
  });
  npcsInNewRoom.forEach(npc => {
    let npcDisplay = npc.name;
    if (npc.state && typeof npc.state === 'object') {
      const cycles = npc.state.cycles || 0;
      let statusMessage = '';
      if (cycles === 0) {
        statusMessage = npc.statusMessageIdle ?? '(idle)';
      } else if (npc.state.harvest_active) {
        statusMessage = npc.statusMessageHarvesting ?? '(harvesting)';
      } else if (npc.state.cooldown_until && Date.now() < npc.state.cooldown_until) {
        statusMessage = npc.statusMessageCooldown ?? '(cooldown)';
      } else {
        statusMessage = npc.statusMessageReady ?? '(ready)';
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

    // Get room type colors for connected map data
    const roomTypeColors = await db.getAllRoomTypeColors();
    const colorMap = {};
    roomTypeColors.forEach(rtc => {
      colorMap[rtc.room_type] = rtc.color;
    });
    
    // Check if player is on a junction room - if so, include connected map data
    const connectedMapData = await getConnectedMapData(db, targetRoom, colorMap);
    
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
        connected_map_id: r.connected_map_id || null,
        connected_room_x: r.connected_room_x || null,
        connected_room_y: r.connected_room_y || null,
        connection_direction: r.connection_direction || null
      }));
      
      playerData.ws.send(JSON.stringify({
        type: 'mapData',
        rooms: allRooms,
        roomTypeColors: colorMap,
        currentRoom: {
          x: targetRoom.x,
          y: targetRoom.y
        },
        mapId: targetRoom.map_id,
        connectedMapData: connectedMapData
      }));
    } else {
      // Just update map position - but also include connected map data if on junction
      playerData.ws.send(JSON.stringify({
        type: 'mapUpdate',
        currentRoom: {
          x: targetRoom.x,
          y: targetRoom.y
        },
        mapId: targetRoom.map_id,
        connectedMapData: connectedMapData
      }));
    }
  }

  // Notify players in new room
  // Send formatted message from database
  // Reuse displayPlayerName variable (already declared above for left message)
  const displayPlayerNameForEnter = stripPlayerNameMarkup(playerName);
  const entersMessage = enteredFrom
    ? messageCache.getFormattedMessage('player_enters_from', { playerName: displayPlayerNameForEnter, direction: enteredFrom })
    : messageCache.getFormattedMessage('player_arrived', { playerName: displayPlayerNameForEnter });
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
  
  // Continue path execution or auto-navigation if active
  if (playerData.pathExecution && playerData.pathExecution.isActive) {
    // Path execution move
    playerData.pathExecution.currentStep++;
    playerData.pathExecution.timeoutId = null;
    
    // Check for auto-harvest if enabled (works for loops and paths, including navigation)
    if (playerData.pathExecution.autoHarvestEnabled && 
        !playerData.pathExecution.isPaused) {
      // Check for harvestable NPCs in the new room
      await checkAndAutoHarvest(ctx, connectionId, targetRoom.id, playerData.playerId);
    }
    
    // Continue to next step (will be paused if auto-harvest started)
    if (!playerData.pathExecution.isPaused) {
      executeNextPathStep(ctx, connectionId);
    }
  } else if (playerData.autoNavigation && playerData.autoNavigation.isActive) {
    // Auto-navigation move
    playerData.autoNavigation.currentStep++;
    playerData.autoNavigation.timeoutId = null;
    
    // Check for auto-harvest if enabled during navigation
    if (playerData.pendingPathExecution && playerData.pendingPathExecution.autoHarvestEnabled) {
      await checkAndAutoHarvest(ctx, connectionId, targetRoom.id, playerData.playerId);
    }
    
    // Continue to next step
    executeNextAutoNavigationStep(ctx, connectionId);
  } else {
    // Regular move (not in path execution or auto-navigation)
    // Check for auto-harvest if enabled (only if widget config has it enabled)
    const widgetConfig = await db.getPlayerWidgetConfig(playerData.playerId);
    if (widgetConfig?.automation?.toggles?.autoHarvest === true) {
      await checkAndAutoHarvest(ctx, connectionId, targetRoom.id, playerData.playerId);
    }
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
    // Check for auto-harvest if enabled (only if widget config has it enabled)
    const widgetConfig = await db.getPlayerWidgetConfig(lookPlayerData.playerId);
    if (widgetConfig?.automation?.toggles?.autoHarvest === true) {
      // Only check if not already harvesting (prevent duplicate starts)
      const isAlreadyHarvesting = (lookPlayerData.standaloneHarvestState && lookPlayerData.standaloneHarvestState.isHarvesting) ||
                                  (lookPlayerData.pathExecution && lookPlayerData.pathExecution.autoHarvestState && lookPlayerData.pathExecution.autoHarvestState.isHarvesting);
      if (!isAlreadyHarvesting) {
        await checkAndAutoHarvest(ctx, connectionId, currentRoom.id, lookPlayerData.playerId);
      }
    }
    
    // IMPORTANT: Update connectedPlayers roomId if it differs from database
    // This ensures the server's state matches the database (e.g., for teleportation)
    const oldRoomId = lookPlayerData.roomId;
    const playerActuallyMoved = oldRoomId && oldRoomId !== currentRoom.id;
    
    if (lookPlayerData.roomId !== currentRoom.id) {
      lookPlayerData.roomId = currentRoom.id;
      connectedPlayers.set(connectionId, lookPlayerData);
      
      // If the player moved to a different room, notify other players in both rooms
      if (playerActuallyMoved) {
        // Notify players in the old room that this player left
        const otherPlayersInOldRoom = getConnectedPlayersInRoom(connectedPlayers, oldRoomId).filter(p => p !== lookPlayerData.playerName);
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
        
        // Notify players in the new room that this player joined
        const displayPlayerNameForJoin = stripPlayerNameMarkup(lookPlayerData.playerName);
        const joinedMessage = messageCache.getFormattedMessage('player_arrived', { playerName: displayPlayerNameForJoin });
        broadcastToRoom(connectedPlayers, currentRoom.id, {
          type: 'playerJoined',
          playerName: lookPlayerData.playerName,
          message: joinedMessage
        }, connectionId);
        
        // IMPORTANT: Only send room updates to other players when the player actually moved rooms
        // This prevents the room update timer from being reset unnecessarily when someone just uses "look"
        const otherPlayersInNewRoom = getConnectedPlayersInRoom(connectedPlayers, currentRoom.id).filter(p => p !== lookPlayerData.playerName);
        for (const otherPlayerName of otherPlayersInNewRoom) {
          for (const [otherConnId, otherPlayerData] of connectedPlayers.entries()) {
            if (otherPlayerData.playerName === otherPlayerName && otherPlayerData.roomId === currentRoom.id) {
              await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, currentRoom, false);
              break;
            }
          }
        }
      }
    }
    
    // Send room update to the player who used look (always, so they see current state)
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom, true);
    
    return;
  }

  // Check if target is a direction - normalize direction names
  const directionMap = {
    'n': 'N', 'north': 'N',
    's': 'S', 'south': 'S',
    'e': 'E', 'east': 'E',
    'w': 'W', 'west': 'W',
    'ne': 'NE', 'northeast': 'NE', 'northe': 'NE',
    'nw': 'NW', 'northwest': 'NW', 'northw': 'NW',
    'se': 'SE', 'southeast': 'SE', 'southe': 'SE',
    'sw': 'SW', 'southwest': 'SW', 'southw': 'SW',
    'u': 'U', 'up': 'U',
    'd': 'D', 'down': 'D'
  };
  
  const targetLower = target.toLowerCase();
  const directionCode = directionMap[targetLower];
  
  if (directionCode) {
    // This is a direction - check if it's a valid exit
    const exits = await getExits(db, currentRoom);
    
    if (exits.includes(directionCode)) {
      // Valid exit - find the target room and show its details
      let targetRoom = null;
      
      // Handle up/down directions (not yet implemented for movement, but might be in exits)
      if (directionCode === 'U' || directionCode === 'D') {
        ws.send(JSON.stringify({
          type: 'message',
          message: 'Up/Down movement is not yet implemented, so you cannot look in that direction.'
        }));
        return;
      }
      
      // Check if current room has a map connection in this direction
      if (currentRoom.connection_direction === directionCode && currentRoom.connected_map_id) {
        // Map transition
        targetRoom = await db.getRoomByCoords(
          currentRoom.connected_map_id,
          currentRoom.connected_room_x,
          currentRoom.connected_room_y
        );
      } else {
        // Normal adjacent room in same map
        let targetX = currentRoom.x;
        let targetY = currentRoom.y;
        
        if (directionCode === 'N') {
          targetY += 1;
        } else if (directionCode === 'S') {
          targetY -= 1;
        } else if (directionCode === 'E') {
          targetX += 1;
        } else if (directionCode === 'W') {
          targetX -= 1;
        } else if (directionCode === 'NE') {
          targetX += 1;
          targetY += 1;
        } else if (directionCode === 'NW') {
          targetX -= 1;
          targetY += 1;
        } else if (directionCode === 'SE') {
          targetX += 1;
          targetY -= 1;
        } else if (directionCode === 'SW') {
          targetX -= 1;
          targetY -= 1;
        }
        
        targetRoom = await db.getRoomByCoords(currentRoom.map_id, targetX, targetY);
      }
      
      if (targetRoom) {
        // Convert direction code to readable name for message
        const directionNames = {
          'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
          'NE': 'northeast', 'NW': 'northwest', 'SE': 'southeast', 'SW': 'southwest',
          'U': 'up', 'D': 'down'
        };
        const directionName = directionNames[directionCode] || directionCode.toLowerCase();
        
        // Get "Looking..." prefix message
        const lookPrefix = messageCache.getFormattedMessage('look_direction_prefix', { direction: directionName });
        
        // Send room update for the target room with prefix
        // Get players and NPCs in target room
        const playersInTargetRoom = getConnectedPlayersInRoom(connectedPlayers, targetRoom.id);
        const npcsInTargetRoom = await db.getNPCsInRoom(targetRoom.id);
        const targetRoomItems = await db.getRoomItems(targetRoom.id);
        const targetRoomExits = await getExits(db, targetRoom);
        
        // Get map name
        const map = await db.getMapById(targetRoom.map_id);
        const mapName = map ? map.name : '';
        
        // Format NPCs with state descriptions
        const now = Date.now();
        const formattedNPCs = await Promise.all(npcsInTargetRoom.map(async npc => {
          const baseCycleTime = npc.base_cycle_time || 12000;
          const npcData = {
            id: npc.id,
            name: npc.name,
            description: npc.description,
            state: npc.state,
            color: npc.display_color || npc.color || '#00ffff',
            baseCycleTime: baseCycleTime,
            harvestableTime: npc.harvestableTime || 60000,
            cooldownTime: npc.cooldownTime || 120000,
            statusMessageIdle: npc.statusMessageIdle ?? '(idle)',
            statusMessageReady: npc.statusMessageReady ?? '(ready)',
            statusMessageHarvesting: npc.statusMessageHarvesting ?? '(harvesting)',
            statusMessageCooldown: npc.statusMessageCooldown ?? '(cooldown)'
          };
          
          // Calculate harvest/cooldown progress (simplified version)
          if (npc.state && npc.state.harvest_active && npc.state.harvest_start_time) {
            const harvestElapsed = now - npc.state.harvest_start_time;
            const effectiveHarvestableTime = npc.state.effective_harvestable_time || npcData.harvestableTime;
            const harvestRemaining = Math.max(0, effectiveHarvestableTime - harvestElapsed);
            npcData.harvestProgress = harvestRemaining / effectiveHarvestableTime;
            npcData.harvestStatus = 'active';
          } else if (npc.state && npc.state.cooldown_until && now < npc.state.cooldown_until) {
            const cooldownRemaining = npc.state.cooldown_until - now;
            const baseCooldownTime = npcData.cooldownTime;
            npcData.harvestProgress = (baseCooldownTime - cooldownRemaining) / baseCooldownTime;
            npcData.harvestStatus = 'cooldown';
          } else {
            npcData.harvestProgress = 1.0;
            npcData.harvestStatus = 'ready';
          }
          
          return npcData;
        }));
        
        // Combine players and NPCs for display
        const combinedEntities = [...playersInTargetRoom].sort();
        formattedNPCs.forEach(npc => {
          let npcDisplay = npc.name;
          if (npc.state && typeof npc.state === 'object') {
            const cycles = npc.state.cycles || 0;
            let statusMessage = '';
            if (cycles === 0) {
              statusMessage = npc.statusMessageIdle ?? '(idle)';
            } else if (npc.harvestStatus === 'active') {
              statusMessage = npc.statusMessageHarvesting ?? '(harvesting)';
            } else if (npc.harvestStatus === 'cooldown') {
              statusMessage = npc.statusMessageCooldown ?? '(cooldown)';
            } else {
              statusMessage = npc.statusMessageReady ?? '(ready)';
            }
            if (statusMessage) {
              npcDisplay += ' ' + statusMessage;
            }
          }
          combinedEntities.push(npcDisplay);
        });
        
        // Format messages
        let alsoHereMessage = '';
        if (combinedEntities.length > 0) {
          alsoHereMessage = messageCache.getFormattedMessage('room_also_here', {
            '[char|NPC array]': combinedEntities
          });
        } else {
          alsoHereMessage = messageCache.getFormattedMessage('room_no_one_here');
        }
        
        const exitsForMessage = targetRoomExits.length > 0 ? targetRoomExits : [];
        const obviousExitsMessage = messageCache.getFormattedMessage('room_obvious_exits', {
          '[directions array]': exitsForMessage
        });
        
        const itemsString = targetRoomItems.length > 0 
          ? targetRoomItems.map(item => {
              const itemName = item.item_name || item.name;
              return itemName + (item.quantity > 1 ? ` (${item.quantity})` : '');
            }).join(', ')
          : 'Nothing';
        
        const onGroundMessage = messageCache.getFormattedMessage('room_on_ground', {
          '[items array]': itemsString
        });
        
        // Process markup
        const { parseMarkupServer } = require('../utils/markupService');
        const processedDescription = targetRoom.description ? parseMarkupServer(targetRoom.description, '#00ffff') : '';
        const processedAlsoHere = alsoHereMessage ? parseMarkupServer(alsoHereMessage, '#00ffff') : '';
        const processedObviousExits = obviousExitsMessage ? parseMarkupServer(obviousExitsMessage, '#00ffff') : '';
        const processedOnGround = onGroundMessage ? parseMarkupServer(onGroundMessage, '#00ffff') : '';
        
        // Send room update with "Looking..." prefix
        ws.send(JSON.stringify({
          type: 'roomUpdate',
          room: {
            id: targetRoom.id,
            name: targetRoom.name,
            description: targetRoom.description,
            descriptionHtml: processedDescription,
            x: targetRoom.x,
            y: targetRoom.y,
            mapName: mapName,
            roomType: targetRoom.room_type || 'normal'
          },
          players: playersInTargetRoom,
          npcs: formattedNPCs,
          roomItems: targetRoomItems,
          exits: targetRoomExits,
          showFullInfo: true,
          messages: {
            prefix: lookPrefix, // Add prefix to indicate this is a look, not actual room entry
            alsoHere: alsoHereMessage, // Raw text (for backward compatibility)
            alsoHereHtml: processedAlsoHere, // Pre-processed HTML with markup
            obviousExits: obviousExitsMessage, // Raw text (for backward compatibility)
            obviousExitsHtml: processedObviousExits, // Pre-processed HTML with markup
            onGround: onGroundMessage, // Raw text (for backward compatibility)
            onGroundHtml: processedOnGround // Pre-processed HTML with markup
          },
          isLooking: true // Flag to indicate this is a look command, not actual movement
        }));
        
        return;
      }
    } else {
      // Invalid direction (no exit) - show random whimsical message
      const wallMessages = [
        'look_direction_wall_1',
        'look_direction_wall_2',
        'look_direction_wall_3',
        'look_direction_wall_4',
        'look_direction_wall_5'
      ];
      
      // Select random message
      const randomIndex = Math.floor(Math.random() * wallMessages.length);
      const wallMessage = messageCache.getFormattedMessage(wallMessages[randomIndex]);
      
      ws.send(JSON.stringify({
        type: 'message',
        message: wallMessage
      }));
      
      return;
    }
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
 * Find best matching item(s) from a list using improved matching algorithm
 * Prioritizes: 1) Exact match, 2) Starts-with match, 3) Longest match, 4) Substring match
 * @param {Array} items - Array of items with item_name property
 * @param {string} query - Search query (case-insensitive)
 * @returns {Array} Array of matching items, sorted by match quality
 */
function findMatchingItems(items, query) {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
  
  // Score each item based on match quality
  const scored = items.map(item => {
    const itemNameLower = item.item_name.toLowerCase();
    let score = 0;
    
    // Exact match gets highest priority
    if (itemNameLower === queryLower) {
      score = 1000;
    }
    // Starts-with match gets second priority
    else if (itemNameLower.startsWith(queryLower)) {
      score = 800;
      // Longer exact start gets higher score
      score += queryLower.length;
    }
    // Check if all query words match word starts (word-boundary matching)
    else {
      const itemWords = itemNameLower.split(/\s+/).filter(w => w.length > 0);
      let allWordsMatchAsStarts = true;
      let wordStartMatches = 0;
      
      // Check if each query word matches the start of an item word
      for (const queryWord of queryWords) {
        let wordMatched = false;
        for (const itemWord of itemWords) {
          if (itemWord.startsWith(queryWord)) {
            wordMatched = true;
            wordStartMatches++;
            break;
          }
        }
        if (!wordMatched) {
          allWordsMatchAsStarts = false;
          break;
        }
      }
      
      if (allWordsMatchAsStarts && wordStartMatches === queryWords.length) {
        // All words match as starts - good match
        score = 600 + wordStartMatches * 10;
        // Prefer matches where item word count matches query word count
        if (itemWords.length === queryWords.length) {
          score += 50;
        }
      }
      // Contains match (substring) - lower priority, but only if no word-boundary match
      else if (itemNameLower.includes(queryLower)) {
        score = 400;
        // Longer matching substring gets higher score
        score += queryLower.length;
      }
      // No match at all
      else {
        return null;
      }
    }
    
    // Prefer shorter item names when scores are similar (more specific)
    score -= itemNameLower.length * 0.1;
    
    return { item, score };
  }).filter(result => result !== null);
  
  // Sort by score (highest first), then by item name length (shorter first for same score)
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.item.item_name.length - b.item.item_name.length;
  });
  
  return scored.map(result => result.item);
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
  
  // Enrich items with item_type and rune_color for display
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const itemData = await db.getItemByName(item.item_name);
    return {
      ...item,
      item_type: itemData?.item_type || null,
      rune_color: itemData?.rune_color || null
    };
  }));
  
  const hasWarehouseDeed = await db.hasPlayerWarehouseDeed(player.id);
  
  // Check if this is a silent request (for widgets, not terminal display)
  const silent = data.silent === true;
  
  ws.send(JSON.stringify({ 
    type: 'inventoryList', 
    items: enrichedItems, 
    hasWarehouseDeed,
    silent: silent // Pass through silent flag
  }));
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
  const matches = findMatchingItems(roomItems, query);
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `There is no "${query}" here.` }));
    return;
  } else if (matches.length > 1) {
    const names = matches.map(i => i.item_name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
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
    
    // Send updated room to player to refresh items on ground (immediate, no delay)
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom);
    
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
  const matches = findMatchingItems(playerItems, query);
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `You don't have "${query}".` }));
    return;
  } else if (matches.length > 1) {
    const names = matches.map(i => i.item_name).join(', ');
    ws.send(JSON.stringify({ type: 'message', message: `Which did you mean: ${names}?` }));
    return;
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
      
      // If requesting more than available, drop all available (don't error)
      if (quantityToDrop > availableQuantity) {
        quantityToDrop = availableQuantity;
        ws.send(JSON.stringify({ 
          type: 'message', 
          message: `You only have ${availableQuantity} ${item.item_name}. Dropping all ${availableQuantity}.` 
        }));
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
  
  // Comprehensive defensive logging
  console.log('[factoryWidgetAddItem] Called with data:', {
    dataType: typeof data,
    dataValue: data,
    hasSlotIndex: data ? ('slotIndex' in data) : false,
    hasItemName: data ? ('itemName' in data) : false,
    slotIndexValue: data ? data.slotIndex : 'N/A',
    itemNameValue: data ? data.itemName : 'N/A'
  });
  
  // Defensive null check
  if (!data || typeof data !== 'object') {
    console.error('[factoryWidgetAddItem] Invalid data - not an object:', data);
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid data received for factoryWidgetAddItem' }));
    return;
  }
  
  // Check required fields BEFORE accessing them
  if (!('slotIndex' in data)) {
    console.error('[factoryWidgetAddItem] Missing slotIndex in data:', data);
    ws.send(JSON.stringify({ type: 'error', message: 'slotIndex is required' }));
    return;
  }
  
  if (!('itemName' in data)) {
    console.error('[factoryWidgetAddItem] Missing itemName in data:', data);
    ws.send(JSON.stringify({ type: 'error', message: 'itemName is required' }));
    return;
  }
  
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
  
  // Parse slot index - accept both string and number
  const slotIndex = parseInt(data.slotIndex, 10);
  
  if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 4) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid slot index. Must be 0-4. Received: ${data.slotIndex}` }));
    return;
  }
  
  const itemName = data.itemName;
  if (!itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Item name required.' }));
    return;
  }
  
  // Parse quantity (default to 1 if not provided)
  const requestedQuantity = parseInt(data.quantity, 10) || 1;
  if (isNaN(requestedQuantity) || requestedQuantity < 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid quantity. Must be 1 or more.' }));
    return;
  }
  
  // Validate item type for slot
  // Slots 0, 1 are ingredient slots - only accept items with item_type === 'ingredient'
  // Slots 2, 3, 4 are rune slots - only accept items with item_type === 'rune'
  const isIngredientSlot = slotIndex >= 0 && slotIndex <= 1;
  const isRuneSlot = slotIndex >= 2 && slotIndex <= 4;
  
  // Rune slots only accept single items (quantity must be 1)
  if (isRuneSlot && requestedQuantity > 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Rune slots only accept one item at a time. Quantity must be 1.' }));
    return;
  }
  
  // Check player has the item in inventory
  const playerItems = await db.getPlayerItems(player.id);
  const inventoryItem = playerItems.find(i => i.item_name.toLowerCase() === itemName.toLowerCase());
  
  if (!inventoryItem || inventoryItem.quantity < 1) {
    ws.send(JSON.stringify({ type: 'error', message: `You don't have "${itemName}".` }));
    return;
  }
  
  // Use the canonical item name from inventory (might differ from client-sent name)
  const canonicalItemName = inventoryItem.item_name;
  
  // Ensure requested quantity doesn't exceed available inventory
  const actualQuantity = Math.min(requestedQuantity, inventoryItem.quantity);
  if (actualQuantity < requestedQuantity) {
    ws.send(JSON.stringify({ type: 'error', message: `You only have ${inventoryItem.quantity} "${canonicalItemName}". Requested ${requestedQuantity}.` }));
    return;
  }
  
  // Get full item data (including item_type and rune_color) - use canonical name from inventory
  let itemData = await db.getItemByName(canonicalItemName);
  
  if (!itemData) {
    // Try with the original itemName as fallback
    itemData = await db.getItemByName(itemName);
    
    if (!itemData) {
      // Try a case-insensitive search directly in the database
      try {
        const caseInsensitiveResult = await db.query(
          `SELECT * FROM items WHERE LOWER(REPLACE(name, ' ', '_')) = LOWER(REPLACE($1, ' ', '_')) OR LOWER(name) = LOWER($1) LIMIT 1`,
          [canonicalItemName]
        );
        if (caseInsensitiveResult && caseInsensitiveResult.rows && caseInsensitiveResult.rows.length > 0) {
          itemData = caseInsensitiveResult.rows[0];
        }
      } catch (dbError) {
        console.error(`[factoryWidgetAddItem] Database query error:`, dbError);
      }
      
      if (!itemData) {
        // Item doesn't exist in items table - create it with defaults
        // This can happen if items were added to inventory directly
        console.warn(`[factoryWidgetAddItem] Item "${canonicalItemName}" not found in items table, creating it with defaults`);
        try {
          // Determine item_type based on slot or default to 'sundries'
          let defaultItemType = 'sundries';
          if (isRuneSlot) {
            defaultItemType = 'rune';
          } else if (isIngredientSlot) {
            defaultItemType = 'ingredient';
          }
          
          // Create the item in the database
          itemData = await db.createItem({
            name: canonicalItemName,
            description: `${canonicalItemName} (auto-created)`,
            item_type: defaultItemType,
            active: true,
            poofable: false,
            encumbrance: 1,
            rune_color: defaultItemType === 'rune' ? '#0000FF' : null
          });
        } catch (createError) {
          console.error(`[factoryWidgetAddItem] Failed to create item "${canonicalItemName}":`, createError);
          ws.send(JSON.stringify({ type: 'error', message: `Item "${canonicalItemName}" not found in database and could not be created. Please contact an administrator.` }));
          return;
        }
      }
    }
  }
  const isIngredient = itemData.item_type === 'ingredient';
  const isRune = itemData.item_type === 'rune';
  
  if (isIngredientSlot && !isIngredient) {
    ws.send(JSON.stringify({ type: 'error', message: `Ingredient slots only accept ingredients. "${itemName}" is a ${itemData.item_type || 'unknown type'}.` }));
    return;
  }
  
  if (isRuneSlot && !isRune) {
    ws.send(JSON.stringify({ type: 'error', message: `Rune slots only accept runes. "${itemName}" is a ${itemData.item_type || 'unknown type'}.` }));
    return;
  }
  
  // Get or initialize factory widget state
  let factoryState = factoryWidgetState.get(connectionId);
  if (!factoryState || factoryState.roomId !== currentRoom.id) {
    factoryState = {
      roomId: currentRoom.id,
      slots: [null, null, null, null, null] // 5 slots: 2 supply slots + 3 rune slots
    };
    factoryWidgetState.set(connectionId, factoryState);
  }
  
  // Check if slot can accept this item
  const currentSlot = factoryState.slots[slotIndex];
  if (currentSlot !== null && currentSlot && currentSlot.itemName) {
    // Slot is occupied - check if it's the same item type
    // Use canonicalItemName for comparison
    if (currentSlot.itemName.toLowerCase() !== canonicalItemName.toLowerCase()) {
      ws.send(JSON.stringify({ type: 'error', message: 'That slot already contains a different item type.' }));
      return;
    }
    // Same item type - will stack
  }
  
  // Add item to slot (stack if same type, or create new entry)
  // Use canonicalItemName for consistency
  if (currentSlot && currentSlot.itemName && currentSlot.itemName.toLowerCase() === canonicalItemName.toLowerCase()) {
    // Stack: increase quantity by actualQuantity
    currentSlot.quantity += actualQuantity;
  } else {
    // New item in slot - include item_type, rune_type, and rune_color for display and craft detection
    factoryState.slots[slotIndex] = {
      itemName: canonicalItemName,
      quantity: actualQuantity,
      itemType: itemData.item_type,
      runeType: itemData.rune_type || null,
      runeColor: itemData.rune_color || null
    };
  }
  
  // Remove actualQuantity items from player inventory using canonical name
  await db.removePlayerItem(player.id, canonicalItemName, actualQuantity);
  
  // Send updated factory widget state
  ws.send(JSON.stringify({
    type: 'factoryWidgetState',
    state: {
      slots: factoryState.slots // 5 slots: 2 supply + 3 rune
    }
  }));
  
  // Send updated inventory
  const updatedItems = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
  
  // Send updated player stats (encumbrance changed)
  await sendPlayerStats(connectedPlayers, db, connectionId);
}

/**
 * Handle factory widget remove item (empty slot)
 */
async function factoryWidgetRemoveItem(ctx, data) {
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
  
  // Parse slot index - accept both string and number
  const slotIndex = parseInt(data.slotIndex, 10);
  if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 4) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid slot index. Must be 0-4. Received: ${data.slotIndex}` }));
    return;
  }
  
  // Get factory widget state
  let factoryState = factoryWidgetState.get(connectionId);
  if (!factoryState || factoryState.roomId !== currentRoom.id) {
    ws.send(JSON.stringify({ type: 'error', message: 'No items in factory machine.' }));
    return;
  }
  
  const slot = factoryState.slots[slotIndex];
  if (!slot || !slot.itemName) {
    ws.send(JSON.stringify({ type: 'error', message: 'That slot is already empty.' }));
    return;
  }
  
  // Return items to player inventory
  await db.addPlayerItem(player.id, slot.itemName, slot.quantity);
  
  // Clear the slot
  factoryState.slots[slotIndex] = null;
  
  // Send updated factory widget state
  ws.send(JSON.stringify({
    type: 'factoryWidgetState',
    state: {
      slots: factoryState.slots // 5 slots: 2 supply + 3 rune
    }
  }));
  
  // Send updated inventory
  const updatedItems = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
  
  // Send updated player stats (encumbrance changed)
  await sendPlayerStats(connectedPlayers, db, connectionId);
}

/**
 * Handle factory craft command
 * Validates recipe match, calculates success/crit, executes craft, handles fizzle, routes outputs
 * 
 * IMPORTANT: Production Rune (slot 2) is a machine requirement, NOT part of recipes.
 * Fixed semantic slots: 0-1 = ingredients, 2 = production rune, 3 = speed rune, 4 = efficiency rune
 */
async function factoryCraft(ctx, data) {
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
    ws.send(JSON.stringify({ type: 'error', message: 'You must be in a factory room to craft.' }));
    return;
  }
  
  // Get factory widget state
  let factoryState = factoryWidgetState.get(connectionId);
  if (!factoryState || factoryState.roomId !== currentRoom.id) {
    factoryState = {
      roomId: currentRoom.id,
      slots: [null, null, null, null, null]
    };
    factoryWidgetState.set(connectionId, factoryState);
  }
  
  const slots = factoryState.slots;
  
  // MACHINE REQUIREMENT: Check for Production Rune in slot 2
  if (!factoryRuneSystem.hasProductionRune(slots)) {
    ws.send(JSON.stringify({ type: 'error', message: 'A Production Rune is required in the production slot to craft.' }));
    return;
  }
  
  // Get room tier and quirk
  const roomTier = currentRoom.factory_tier || 1;
  const quirk = factoryQuirks.getFactoryQuirk(currentRoom);
  
  // Get player stats
  const playerStats = db.getPlayerStats(player);
  
  // Calculate efficiency modifier (for ingredient reduction)
  const efficiencyRune = factoryRuneSystem.getEfficiencyRune(slots);
  const efficiencyModifier = factoryRuneSystem.calculateEfficiencyModifier(efficiencyRune, playerStats, quirk);
  
  // Get all active recipes for this tier
  const recipes = await db.getFactoryRecipes({ tier: roomTier, active: true });
  
  let recipe;
  let craftResult;
  let isFizzle = false;
  let matchResult = null;
  
  if (!recipes || recipes.length === 0) {
    // No recipes available - create a fizzle craft
    isFizzle = true;
    
    // Create a dummy recipe for fizzle (just for timing/display purposes)
    recipe = {
      recipe_id: null,
      name: 'No Recipe Available',
      base_time: 5000, // Default 5 second craft time for fizzle
      success_rate: 0
    };
    
    // Create a fizzle craft result
    craftResult = {
      recipeName: 'No Recipe Available',
      recipeId: null,
      success: false,
      critical: false,
      craftTimeMs: 5000, // Default craft time
      successRate: { rate: 0 },
      critChance: { chance: 0 },
      craftTime: { timeMs: 5000 },
      outputs: { items: [], byproducts: [], wornTriggered: false },
      returnedIngredients: [],
      message: 'No recipes are available for this factory.'
    };
  } else {
    // Find matching recipe
    matchResult = factoryRecipeMatcher.findMatchingRecipe(
      recipes,
      slots,
      playerStats,
      roomTier,
      efficiencyModifier
    );
    
    if (!matchResult) {
      // No recipe matched - create a fizzle craft that will run normally then eject everything
      isFizzle = true;
      
      // Create a dummy recipe for fizzle (just for timing/display purposes)
      recipe = {
        recipe_id: null,
        name: 'Invalid Recipe',
        base_time: 5000, // Default 5 second craft time for fizzle
        success_rate: 0
      };
      
      // Create a fizzle craft result
      craftResult = {
        recipeName: 'Invalid Recipe',
        recipeId: null,
        success: false,
        critical: false,
        craftTimeMs: 5000, // Default craft time
        successRate: { rate: 0 },
        critChance: { chance: 0 },
        craftTime: { timeMs: 5000 },
        outputs: { items: [], byproducts: [], wornTriggered: false },
        returnedIngredients: [],
        message: 'The ingredients in the machine don\'t form a valid recipe.'
      };
    } else {
      recipe = matchResult.recipe;
      
      // Execute the craft
      craftResult = factoryCraftingEngine.executeCraft({
        recipe,
        slots,
        playerStats,
        quirk,
        matchResult
      });
    }
  }
  
  // Emit craft started event (only if not a fizzle)
  if (!isFizzle) {
    await factoryOutputRouter.emitCraftStarted(db, player.id, currentRoom.id, recipe.recipe_id, recipe.name);
  }
  
  // Send craft started message to client (for progress bar)
  ws.send(JSON.stringify({
    type: 'factoryCraftStarted',
    recipeName: recipe.name,
    craftTimeMs: craftResult.craftTimeMs,
    successRate: craftResult.successRate.rate.toFixed(1),
    critChance: craftResult.critChance.chance.toFixed(1)
  }));
  
  // Wait for craft time (simulated production delay)
  await new Promise(resolve => setTimeout(resolve, craftResult.craftTimeMs));
  
  // Process result
  if (isFizzle) {
    // Fizzle: Eject all items from machine to ground
    
    // Eject all items from all slots to the ground
    for (let i = 0; i < factoryState.slots.length; i++) {
      const slot = factoryState.slots[i];
      if (slot && slot.itemName) {
        await db.addRoomItem(currentRoom.id, slot.itemName, slot.quantity);
      }
    }
    
    // Clear all slots
    factoryState.slots = [null, null, null, null, null];
    
    // Emit fizzle event
    await factoryOutputRouter.emitCraftFizzle(db, player.id, currentRoom.id, craftResult.message);
    
    // Send fizzle message
    ws.send(JSON.stringify({
      type: 'factoryCraftFizzle',
      message: craftResult.message + ' All items have been ejected to the ground.'
    }));
    
    // Send updated factory widget state
    ws.send(JSON.stringify({
      type: 'factoryWidgetState',
      state: {
        slots: factoryState.slots
      }
    }));
    
    // Send updated inventory (in case anything changed)
    const updatedItems = await db.getPlayerItems(player.id);
    ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
    
    // Send updated player stats (encumbrance may have changed)
    await sendPlayerStats(connectedPlayers, db, connectionId);
    
    // Send updated room (items on floor have changed)
    await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom);
    
    return; // Exit early for fizzle - don't process success/failure
    
  } else if (craftResult.success) {
    // Normalize output items to ensure they have item_name property
    const normalizedOutputs = craftResult.outputs.items.map(item => ({
      item_name: item.item_name || item.itemName,
      item_id: item.item_id || null,
      quantity: item.quantity || 1
    }));
    
    // Route outputs to inventory or floor
    const routingResult = await factoryOutputRouter.routeOutputs(
      db,
      normalizedOutputs,
      player,
      currentRoom,
      true // player is in room (they initiated the craft)
    );
    
    // Also route byproducts
    if (craftResult.outputs.byproducts && craftResult.outputs.byproducts.length > 0) {
      await factoryOutputRouter.routeOutputs(
        db,
        craftResult.outputs.byproducts,
        player,
        currentRoom,
        true
      );
    }
    
    // Consume ingredients from slots
    const ingredientSlots = factoryConfig.SLOTS.INGREDIENT_SLOTS;
    for (const slotIndex of ingredientSlots) {
      factoryState.slots[slotIndex] = null;
    }
    
    // Eject production rune to ground after crafting (per user requirement)
    // Production rune is ejected but other runes stay in slots
    const productionRuneSlot = factoryConfig.SLOTS.PRODUCTION_RUNE_SLOT;
    if (factoryState.slots[productionRuneSlot]) {
      const productionRune = factoryState.slots[productionRuneSlot];
      await db.addRoomItem(currentRoom.id, productionRune.itemName, productionRune.quantity);
      factoryState.slots[productionRuneSlot] = null; // Clear slot 2
    }
    
    // Keep other runes (speed/efficiency) in slots
    
    // Build success message
    const message = factoryOutputRouter.buildCraftResultMessage(craftResult, routingResult);
    
    // Emit success event
    await factoryOutputRouter.emitCraftSuccess(
      db,
      player.id,
      currentRoom.id,
      recipe.recipe_id,
      routingResult.results,
      craftResult.critical
    );
    
    // Emit output created events (for automation hooks)
    await factoryOutputRouter.emitOutputCreated(
      db,
      player.id,
      currentRoom.id,
      recipe.recipe_id,
      craftResult.outputs.items
    );
    
    // Send craft complete message
    ws.send(JSON.stringify({
      type: 'factoryCraftComplete',
      success: true,
      critical: craftResult.critical,
      recipeName: recipe.name,
      outputs: craftResult.outputs.items,
      byproducts: craftResult.outputs.byproducts,
      message,
      wornTriggered: craftResult.outputs.wornTriggered
    }));
    
  } else {
    // Craft failed
    
    // Return ingredients based on return rate
    if (craftResult.returnedIngredients && craftResult.returnedIngredients.length > 0) {
      await factoryOutputRouter.returnIngredients(db, craftResult.returnedIngredients, player);
    }
    
    // Clear ingredient slots
    const ingredientSlots = factoryConfig.SLOTS.INGREDIENT_SLOTS;
    for (const slotIndex of ingredientSlots) {
      factoryState.slots[slotIndex] = null;
    }
    
    // Keep runes in slots (per design requirement)
    // Runes are NOT consumed on failure either
    
    // Emit failure event
    await factoryOutputRouter.emitCraftFailed(
      db,
      player.id,
      currentRoom.id,
      recipe.recipe_id,
      craftResult.returnedIngredients
    );
    
    // Send craft complete message (failure)
    ws.send(JSON.stringify({
      type: 'factoryCraftComplete',
      success: false,
      critical: false,
      recipeName: recipe.name,
      message: craftResult.message,
      returnedIngredients: craftResult.returnedIngredients
    }));
  }
  
  // Send updated factory widget state
  ws.send(JSON.stringify({
    type: 'factoryWidgetState',
    state: {
      slots: factoryState.slots
    }
  }));
  
  // Send updated inventory
  const updatedItems = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
  
  // Send updated player stats (encumbrance may have changed)
  await sendPlayerStats(connectedPlayers, db, connectionId);
  
  // Send updated room (items on floor may have changed)
  await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom);
}

/**
 * Handle craft fizzle (invalid recipe or no Production Rune)
 * Returns Production Rune to inventory and clears all slots
 */
async function handleCraftFizzle(ctx, factoryState, player, room, reason) {
  const { ws, db, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId } = ctx;
  
  // Get production rune from slot 2 to return it
  const productionRune = factoryOutputRouter.getProductionRuneForReturn(factoryState.slots);
  
  if (productionRune) {
    // Return production rune to inventory
    await db.addPlayerItem(player.id, productionRune.itemName, productionRune.quantity);
  }
  
  // Clear all slots
  factoryState.slots = factoryOutputRouter.clearAllSlots(factoryState.slots);
  
  // Emit fizzle event
  await factoryOutputRouter.emitCraftFizzle(db, player.id, room.id, reason);
  
  // Send fizzle message
  ws.send(JSON.stringify({
    type: 'factoryCraftFizzle',
    message: reason + (productionRune ? ` Your ${productionRune.itemName} has been returned.` : '')
  }));
  
  // Send updated factory widget state
  ws.send(JSON.stringify({
    type: 'factoryWidgetState',
    state: {
      slots: factoryState.slots
    }
  }));
  
  // Send updated inventory
  const updatedItems = await db.getPlayerItems(player.id);
  ws.send(JSON.stringify({ type: 'inventoryList', items: updatedItems }));
  
  // Send updated player stats
  await sendPlayerStats(connectedPlayers, db, connectionId);
}

/**
 * Handle harvest command
 */
async function harvest(ctx, data) {
  const { ws, db, playerName, connectedPlayers, factoryWidgetState, warehouseWidgetState, connectionId } = ctx;
  
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
  
  // Only rhythm NPCs and harvestable NPCs (which map to rhythm behavior) can be harvested
  if (npcDef.npc_type !== 'rhythm' && npcDef.npc_type !== 'harvestable') {
    ws.send(JSON.stringify({ type: 'message', message: `${roomNpc.name} cannot be harvested.` }));
    return;
  }
  
  // Check harvest prerequisite item (single item required for harvesting)
  // Now uses direct item_id foreign key instead of parsing JSON
  // Backward compatibility: supports both new (item_id) and old (JSON) formats
  let requiredItemName = null;
  
  if (npcDef.harvest_prerequisite_item_id) {
    // New format: direct item_id foreign key
    const requiredItem = await db.getItemById(npcDef.harvest_prerequisite_item_id);
    if (!requiredItem) {
      console.error(`[Harvest] ERROR: harvest_prerequisite_item_id ${npcDef.harvest_prerequisite_item_id} not found in items table`);
      ws.send(JSON.stringify({ type: 'error', message: 'Harvest prerequisite item configuration error.' }));
      return;
    }
    requiredItemName = requiredItem.name;
  } else if (npcDef.harvest_prerequisite_item) {
    // Old format: JSON array - parse and extract item_name
    // Handle JSONB (already an object) or JSON string
    let prerequisiteData = npcDef.harvest_prerequisite_item;
    if (typeof prerequisiteData === 'string') {
      try {
        prerequisiteData = JSON.parse(prerequisiteData);
      } catch (e) {
        prerequisiteData = null;
      }
    } else if (prerequisiteData && typeof prerequisiteData === 'object') {
      // JSONB column - already an object, use as-is
      prerequisiteData = prerequisiteData;
    } else {
      prerequisiteData = null;
    }
    
    if (prerequisiteData) {
      try {
        if (Array.isArray(prerequisiteData) && prerequisiteData.length > 0 && prerequisiteData[0].item_name) {
          requiredItemName = prerequisiteData[0].item_name;
        } else if (typeof prerequisiteData === 'string') {
          // Fallback: treat as plain string item name
          requiredItemName = prerequisiteData;
        }
      } catch (e) {
        console.error(`[Harvest] ERROR parsing harvest_prerequisite_item JSON:`, e);
      }
    } else {
      // Fallback: treat as plain string
      requiredItemName = npcDef.harvest_prerequisite_item;
    }
  }
  
  if (requiredItemName) {
    const playerItems = await db.getPlayerItems(player.id);
    
    // Check silently (no inventory display, no debug logging for normal harvests)
    const hasPrerequisite = playerItems.some(i => {
      const itemName = (i.item_name || '').toLowerCase().trim();
      return itemName === requiredItemName.toLowerCase().trim();
    });
    
    if (!hasPrerequisite) {
      // Use customizable message or default
      const message = npcDef.harvest_prerequisite_message || 
                     `You lack the required item to harvest from ${roomNpc.name}.`;
      ws.send(JSON.stringify({ type: 'message', message }));
      return;
    }
  }
  
  // Check required items from NPC's input_items definition (data relationship)
  // input_items is now JSONB, and may have item_id (as string) keys or item_name keys (backward compatibility)
  let requiredItems = npcDef.input_items || {};
  
  // Convert item_id keys to item_name keys for lookup (if needed)
  // Check if first key is numeric (item_id) or text (item_name)
  const firstKey = Object.keys(requiredItems)[0];
  if (firstKey && !isNaN(parseInt(firstKey, 10))) {
    // Keys are item_ids, convert to item_names
    requiredItems = await db.convertItemIdsToNames(requiredItems);
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
  // state is now JSONB, so it's already an object
  const npcState = (freshRoomNpc && freshRoomNpc.state) || {};
  
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
    } catch (err) {
      console.error(`[Harvest] Error calculating harvestable time increase:`, err);
    }
  }
  
  // Store effective harvestable time in state for use by cycle engine
  npcState.effective_harvestable_time = effectiveHarvestableTime;
  
  // Initialize last_harvest_item_production to 0 to ensure first cycle triggers immediately
  // The cycle engine checks: timeSinceLastProduction >= effectiveCycleTime
  // By setting this to 0, timeSinceLastProduction will be ~current timestamp (huge), guaranteeing first cycle fires
  npcState.last_harvest_item_production = 0;
  
  
  
  // Update NPC state in database
  await db.updateNPCState(roomNpc.id, npcState, roomNpc.last_cycle_run || now);
  
  // Verify the state was saved correctly
  const verifyResult = await db.query('SELECT state FROM room_npcs WHERE id = $1', [roomNpc.id]);
  if (verifyResult.rows[0]) {
    try {
      // state is now JSONB, so it's already an object
      const savedState = verifyResult.rows[0].state || {};
      if (savedState.harvest_active && savedState.harvest_start_time) {
      } else {
        console.error(`[Harvest] ERROR: State not saved correctly! harvest_active=${savedState.harvest_active}, harvest_start_time=${savedState.harvest_start_time}`);
      }
    } catch (e) {
      console.error(`[Harvest] ERROR: Failed to parse saved state:`, e);
    }
  }
  
  // Get formatted message from database
  const beginMessage = messageCache.getFormattedMessage('harvest_begin', { npcName: roomNpc.name });
  // Format message using markup service for consistency
  const { formatMessageForTerminal } = require('../utils/markupService');
  const html = formatMessageForTerminal(beginMessage, 'info', '#00ffff');
  // Send message with correct format (matching message router format)
  ws.send(JSON.stringify({
    type: 'terminal:message',
    message: beginMessage,
    html: html,
    messageType: 'info'
  }));
  
  // Send room update immediately so NPC widget appears
  // This ensures the conditional widget shows up right when harvest begins
  await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom, false);
}

/**
 * Check for harvestable NPCs in a room and start auto-harvest if enabled
 */
async function checkAndAutoHarvest(ctx, connectionId, roomId, playerId) {
  const { db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  // Check if auto-harvest is enabled for path execution, auto-navigation, or standalone
  let autoHarvestEnabled = false;
  let harvestState = null;
  
  if (playerData && playerData.pathExecution && playerData.pathExecution.isActive) {
    if (!playerData.pathExecution.autoHarvestEnabled) {
      return; // Auto-harvest not enabled
    }
    autoHarvestEnabled = true;
    
    // Initialize autoHarvestState if not exists (can happen if auto-harvest is toggled mid-loop)
    if (!playerData.pathExecution.autoHarvestState) {
      playerData.pathExecution.autoHarvestState = { isHarvesting: false, currentNpcId: null, pendingNpcs: [] };
    }
    harvestState = playerData.pathExecution.autoHarvestState;
    
    // Don't check if already harvesting
    if (harvestState.isHarvesting) {
      return;
    }
  } else if (playerData && playerData.autoNavigation && playerData.autoNavigation.isActive) {
    // Check if auto-harvest is enabled during auto-navigation (via pendingPathExecution)
    if (playerData.pendingPathExecution && playerData.pendingPathExecution.autoHarvestEnabled) {
      autoHarvestEnabled = true;
      // During navigation, we don't have a harvest state yet, so we'll track it temporarily
      // We'll need to prevent multiple harvests during navigation
      if (!playerData.autoNavigation.harvestState) {
        playerData.autoNavigation.harvestState = { isHarvesting: false, currentNpcId: null, pendingNpcs: [] };
      }
      harvestState = playerData.autoNavigation.harvestState;
      
      // Don't check if already harvesting
      if (harvestState.isHarvesting) {
        return;
      }
    } else {
      return; // No auto-harvest enabled during navigation
    }
  } else if (playerData) {
    // Standalone auto-harvest (not in path/loop) - check widget config
    const widgetConfig = await db.getPlayerWidgetConfig(playerId);
    const autoHarvestToggle = widgetConfig?.automation?.toggles?.autoHarvest;
    
    if (autoHarvestToggle === true) {
      autoHarvestEnabled = true;
      // Create standalone harvest state if it doesn't exist
      if (!playerData.standaloneHarvestState) {
        playerData.standaloneHarvestState = { isHarvesting: false, currentNpcId: null, pendingNpcs: [] };
      }
      harvestState = playerData.standaloneHarvestState;
      
      // Don't check if already harvesting
      if (harvestState.isHarvesting) {
        return;
      }
    } else {
      return; // Auto-harvest not enabled
    }
  } else {
    return; // No player data
  }
  
  try {
    // Get all NPCs in the room
    const npcsInRoom = await db.getNPCsInRoom(roomId);
    if (!npcsInRoom || npcsInRoom.length === 0) {
      return; // No NPCs in room
    }
    
    const player = await db.getPlayerById(playerId);
    if (!player) {
      return;
    }
    
    // Get player items for prerequisite checks
    const playerItems = await db.getPlayerItems(playerId);
    
    // Filter for harvestable NPCs
    const harvestableNPCs = [];
    
    for (const roomNpc of npcsInRoom) {
      // Get NPC definition
      const npcDef = await db.getScriptableNPCById(roomNpc.npcId);
      if (!npcDef) {
        continue; // NPC definition not found
      }
      // Check if NPC type is harvestable (rhythm or harvestable)
      if (npcDef.npc_type !== 'rhythm' && npcDef.npc_type !== 'harvestable') {
        continue; // Not a harvestable NPC
      }
      
      // Get NPC state
      // state is now JSONB, so it's already an object
      const npcState = roomNpc.state || {};
      
      // Check if on cooldown
      const now = Date.now();
      if (npcState.cooldown_until && now < npcState.cooldown_until) {
        continue; // Skip NPCs on cooldown
      }
      
      // Check if already being harvested
      if (npcState.harvest_active) {
        continue; // Skip NPCs already being harvested
      }
      
      // Check prerequisite item (now uses direct item_id foreign key)
      // Backward compatibility: supports both new (item_id) and old (JSON) formats
      let requiredItemName = null;
      
      if (npcDef.harvest_prerequisite_item_id) {
        // New format: direct item_id foreign key
        const requiredItem = await db.getItemById(npcDef.harvest_prerequisite_item_id);
        if (!requiredItem) {
          console.error(`[Auto-Harvest] ERROR: harvest_prerequisite_item_id ${npcDef.harvest_prerequisite_item_id} not found in items table`);
          continue; // Skip NPCs with invalid prerequisite item configuration
        }
        requiredItemName = requiredItem.name;
      } else if (npcDef.harvest_prerequisite_item) {
        // Old format: JSON array - parse and extract item_name
        // Handle JSONB (already an object) or JSON string
        let prerequisiteData = npcDef.harvest_prerequisite_item;
        if (typeof prerequisiteData === 'string') {
          try {
            prerequisiteData = JSON.parse(prerequisiteData);
          } catch (e) {
            prerequisiteData = null;
          }
        } else if (prerequisiteData && typeof prerequisiteData === 'object') {
          // JSONB column - already an object, use as-is
          prerequisiteData = prerequisiteData;
        } else {
          prerequisiteData = null;
        }
        
        if (prerequisiteData) {
          try {
            if (Array.isArray(prerequisiteData) && prerequisiteData.length > 0 && prerequisiteData[0].item_name) {
              requiredItemName = prerequisiteData[0].item_name;
            } else if (typeof prerequisiteData === 'string') {
              requiredItemName = prerequisiteData;
            }
          } catch (e) {
            console.error(`[Auto-Harvest] ERROR parsing harvest_prerequisite_item JSON:`, e);
            requiredItemName = npcDef.harvest_prerequisite_item;
          }
        }
      }
      
      if (requiredItemName) {
        const hasPrerequisite = playerItems.some(i => 
          (i.item_name || '').toLowerCase().trim() === requiredItemName.toLowerCase().trim()
        );
        if (!hasPrerequisite) {
          // Send skip message
          const skipMessage = messageCache.getFormattedMessage('auto_harvest_skip_missing_item', {
            npcName: roomNpc.name,
            itemName: requiredItemName
          });
          if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
            playerData.ws.send(JSON.stringify({ type: 'message', message: skipMessage }));
          }
          continue; // Skip NPCs requiring items player lacks
        }
      }
      
      // Check input_items requirements
      // input_items is now JSONB, and may have item_id (as string) keys or item_name keys (backward compatibility)
      let requiredItems = npcDef.input_items || {};
      
      // Convert item_id keys to item_name keys for lookup (if needed)
      const firstKey = Object.keys(requiredItems)[0];
      if (firstKey && !isNaN(parseInt(firstKey, 10))) {
        // Keys are item_ids, convert to item_names
        requiredItems = await db.convertItemIdsToNames(requiredItems);
      }
      
      let hasAllItems = true;
      for (const [itemName, requiredQty] of Object.entries(requiredItems)) {
        const playerItem = playerItems.find(i => 
          i.item_name.toLowerCase() === itemName.toLowerCase()
        );
        if (!playerItem || playerItem.quantity < requiredQty) {
          hasAllItems = false;
          break;
        }
      }
      
      if (!hasAllItems) {
        // Send skip message for missing input items
        const missingItems = Object.keys(requiredItems).filter(itemName => {
          const playerItem = playerItems.find(i => 
            i.item_name.toLowerCase() === itemName.toLowerCase()
          );
          return !playerItem || playerItem.quantity < requiredItems[itemName];
        });
        const skipMessage = messageCache.getFormattedMessage('auto_harvest_skip_missing_item', {
          npcName: roomNpc.name,
          itemName: missingItems[0] || 'required items'
        });
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
          playerData.ws.send(JSON.stringify({ type: 'message', message: skipMessage }));
        }
        continue; // Skip NPCs requiring items player lacks
      }
      
      // NPC is harvestable
      harvestableNPCs.push(roomNpc);
    }
    
    if (harvestableNPCs.length === 0) {
      return; // No harvestable NPCs
    }
    
    // Store pending NPCs and start harvesting the first one
    harvestState.pendingNpcs = harvestableNPCs.map(npc => npc.id);
    
    // Set isHarvesting flag IMMEDIATELY to prevent duplicate calls from race conditions
    harvestState.isHarvesting = true;
    harvestState.currentNpcId = harvestableNPCs[0].id;
    
    // Pause execution if this is path execution (not navigation)
    if (playerData.pathExecution) {
      playerData.pathExecution.isPaused = true; // Pause path/loop execution
    }
    // Note: During auto-navigation, we don't pause navigation, we just harvest
    
    // Start harvesting the first NPC
    await autoStartHarvest(ctx, connectionId, harvestableNPCs[0].id, playerId);
    
  } catch (error) {
    console.error('[checkAndAutoHarvest] Error:', error);
    // Resume execution if error occurs
    if (playerData && playerData.pathExecution) {
      playerData.pathExecution.isPaused = false;
      playerData.pathExecution.autoHarvestState.pendingNpcs = [];
    }
    if (playerData && playerData.autoNavigation && playerData.autoNavigation.harvestState) {
      playerData.autoNavigation.harvestState.pendingNpcs = [];
    }
  }
}

/**
 * Automatically start harvest for an NPC (without user input)
 */
async function autoStartHarvest(ctx, connectionId, roomNpcId, playerId) {
  const { db, connectedPlayers, factoryWidgetState, warehouseWidgetState } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.ws) {
    return;
  }
  
  try {
    const player = await db.getPlayerById(playerId);
    if (!player) {
      return;
    }
    
    // Get room NPC
    const roomNpcResult = await db.query('SELECT * FROM room_npcs WHERE id = $1', [roomNpcId]);
    if (!roomNpcResult.rows[0]) {
      return;
    }
    const roomNpc = roomNpcResult.rows[0];
    
    // Get NPC definition
    const npcDef = await db.getScriptableNPCById(roomNpc.npc_id);
    if (!npcDef) {
      return;
    }
    // Check if NPC type is harvestable (rhythm or harvestable)
    if (npcDef.npc_type !== 'rhythm' && npcDef.npc_type !== 'harvestable') {
      console.log(`[autoStartHarvest] NPC ${roomNpc.npc_id} is type ${npcDef.npc_type}, not harvestable`);
      return;
    }
    
    // Get fresh NPC state
    // state is now JSONB, so it's already an object
    const npcState = roomNpc.state || {};
    
    // Check if already being harvested or on cooldown
    const now = Date.now();
    if (npcState.harvest_active || (npcState.cooldown_until && now < npcState.cooldown_until)) {
      // Skip this NPC and try next one
      if (playerData.pathExecution && playerData.pathExecution.autoHarvestState.pendingNpcs.length > 0) {
        playerData.pathExecution.autoHarvestState.pendingNpcs.shift(); // Remove this NPC
        if (playerData.pathExecution.autoHarvestState.pendingNpcs.length > 0) {
          // Try next NPC
          await autoStartHarvest(ctx, connectionId, playerData.pathExecution.autoHarvestState.pendingNpcs[0], playerId);
        } else {
          // No more NPCs, resume loop
          await resumeLoopAfterHarvest(ctx, connectionId, roomNpcId);
        }
      }
      return;
    }
    
    // Start harvest session (same logic as harvest handler)
    // Ensure state is an object (JSONB might already be an object)
    if (!npcState || typeof npcState !== 'object') {
      npcState = {};
    }
    npcState.harvest_active = true;
    npcState.harvesting_player_id = player.id;
    npcState.harvest_start_time = now;
    npcState.cooldown_until = null;
    npcState.harvesting_player_resonance = player.stat_resonance || 5;
    npcState.harvesting_player_fortitude = player.stat_fortitude || 5;
    
    // Calculate effective harvestable time
    const baseHarvestableTime = npcDef.harvestable_time || 60000;
    let effectiveHarvestableTime = baseHarvestableTime;
    if (npcDef && npcDef.enable_fortitude_bonuses !== false && npcState.harvesting_player_fortitude) {
      try {
        const { calculateEffectiveHarvestableTime } = require('../utils/harvestFormulas');
        effectiveHarvestableTime = await calculateEffectiveHarvestableTime(baseHarvestableTime, npcState.harvesting_player_fortitude, db);
      } catch (err) {
        console.error(`[autoStartHarvest] Error calculating harvestable time:`, err);
      }
    }
    
    npcState.effective_harvestable_time = effectiveHarvestableTime;
    
    // Update NPC state
    await db.updateNPCState(roomNpcId, npcState, roomNpc.last_cycle_run || now);
    
    // Verify state was saved correctly
    const verifyResult = await db.query('SELECT state FROM room_npcs WHERE id = $1', [roomNpcId]);
    if (verifyResult.rows[0]) {
      const savedState = verifyResult.rows[0].state || {};
      if (!(savedState.harvest_active && savedState.harvesting_player_id === player.id)) {
        console.error(`[autoStartHarvest] ERROR: State not saved correctly! harvest_active=${savedState.harvest_active}, player_id=${savedState.harvesting_player_id}`);
      }
    }
    
    // Update auto-harvest state (path execution or standalone)
    if (playerData.pathExecution) {
      playerData.pathExecution.autoHarvestState.isHarvesting = true;
      playerData.pathExecution.autoHarvestState.currentNpcId = roomNpcId;
    } else if (playerData.standaloneHarvestState) {
      playerData.standaloneHarvestState.isHarvesting = true;
      playerData.standaloneHarvestState.currentNpcId = roomNpcId;
    }
    
    // Send messages (use npcDef.name since room_npcs doesn't have name field)
    const npcName = npcDef.name || 'creature';
    const autoMessage = messageCache.getFormattedMessage('auto_harvest_begin', { npcName: npcName });
    const beginMessage = messageCache.getFormattedMessage('harvest_begin', { npcName: npcName });
    
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      // Send auto-harvest message with markup
      const { formatMessageForTerminal } = require('../utils/markupService');
      const autoHtml = formatMessageForTerminal(autoMessage, 'info', '#00ffff');
      playerData.ws.send(JSON.stringify({
        type: 'terminal:message',
        message: autoMessage,
        html: autoHtml,
        messageType: 'info'
      }));
      // Send harvest begin message in same format as manual harvest
      const html = formatMessageForTerminal(beginMessage, 'info', '#00ffff');
      playerData.ws.send(JSON.stringify({
        type: 'terminal:message',
        message: beginMessage,
        html: html,
        messageType: 'info'
      }));
    }
    
    // Send room update so client sees the harvest state change and NPC widget appears
    // Small delay to ensure state is fully committed to database
    setTimeout(async () => {
      const { sendRoomUpdate } = require('../utils/broadcast');
      const currentRoom = await db.getRoomById(player.current_room_id);
      if (currentRoom) {
        await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom, false);
      }
    }, 150);
    
  } catch (error) {
    console.error('[autoStartHarvest] Error:', error);
    // Resume loop if error occurs
    if (playerData && playerData.pathExecution) {
      await resumeLoopAfterHarvest(ctx, connectionId, roomNpcId);
    }
  }
}

/**
 * Resume loop execution after harvest completes
 */
async function resumeLoopAfterHarvest(ctx, connectionId, roomNpcId) {
  const { connectedPlayers, db } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    return;
  }
  
  // Handle path execution harvest state
  if (playerData.pathExecution && playerData.pathExecution.isActive) {
    // Remove current NPC from pending list
    if (playerData.pathExecution.autoHarvestState.currentNpcId === roomNpcId) {
      const pendingIndex = playerData.pathExecution.autoHarvestState.pendingNpcs.indexOf(roomNpcId);
      if (pendingIndex !== -1) {
        playerData.pathExecution.autoHarvestState.pendingNpcs.splice(pendingIndex, 1);
      }
    }
    
    // Check if there are more NPCs to harvest
    if (playerData.pathExecution.autoHarvestState.pendingNpcs.length > 0) {
      // Start harvesting the next NPC
      const nextNpcId = playerData.pathExecution.autoHarvestState.pendingNpcs[0];
      const player = await db.getPlayerById(playerData.playerId);
      if (player) {
        await autoStartHarvest(ctx, connectionId, nextNpcId, playerData.playerId);
      }
      return;
    }
    
    // No more NPCs, resume loop execution
    playerData.pathExecution.autoHarvestState.isHarvesting = false;
    playerData.pathExecution.autoHarvestState.currentNpcId = null;
    playerData.pathExecution.isPaused = false;
    
    // Send message
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify({ 
        type: 'message', 
        message: 'Finished harvesting. Continuing path...' 
      }));
    }
    
    // Resume path execution - call directly (same module)
    await executeNextPathStep(ctx, connectionId);
  }
  
  // Handle standalone harvest state (not in path)
  if (playerData.standaloneHarvestState && playerData.standaloneHarvestState.isHarvesting) {
    // Remove current NPC from pending list
    if (playerData.standaloneHarvestState.currentNpcId === roomNpcId) {
      const pendingIndex = playerData.standaloneHarvestState.pendingNpcs.indexOf(roomNpcId);
      if (pendingIndex !== -1) {
        playerData.standaloneHarvestState.pendingNpcs.splice(pendingIndex, 1);
      }
    }
    
    // Check if there are more NPCs to harvest
    if (playerData.standaloneHarvestState.pendingNpcs.length > 0) {
      // Start harvesting the next NPC
      const nextNpcId = playerData.standaloneHarvestState.pendingNpcs[0];
      const player = await db.getPlayerById(playerData.playerId);
      if (player) {
        await autoStartHarvest(ctx, connectionId, nextNpcId, playerData.playerId);
      }
      return;
    }
    
    // No more NPCs, clear harvest state
    playerData.standaloneHarvestState.isHarvesting = false;
    playerData.standaloneHarvestState.currentNpcId = null;
    
    // Send message
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify({ 
        type: 'message', 
        message: 'Finished harvesting.' 
      }));
    }
  }
}

/**
 * Break active harvest when auto-harvest is disabled
 */
async function breakActiveHarvest(ctx, connectionId, playerId, reason = 'auto_harvest_disabled') {
  const { db, connectedPlayers, factoryWidgetState, warehouseWidgetState } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData) {
    return;
  }
  
  const { findPlayerHarvestSession, endHarvestSession } = require('../services/npcCycleEngine');
  
  // Find active harvest session for this player
  const activeSession = await findPlayerHarvestSession(db, playerId);
  if (activeSession) {
    
    // End the harvest session (startCooldown = true so NPC enters cooldown properly)
    await endHarvestSession(db, activeSession.roomNpcId, true, reason);
    
    // Clear harvest state
    if (playerData.pathExecution && playerData.pathExecution.autoHarvestState) {
      playerData.pathExecution.autoHarvestState.isHarvesting = false;
      playerData.pathExecution.autoHarvestState.currentNpcId = null;
      playerData.pathExecution.autoHarvestState.pendingNpcs = [];
      
      // Resume path execution if it was paused
      if (playerData.pathExecution.isPaused && playerData.pathExecution.isActive) {
        playerData.pathExecution.isPaused = false;
        executeNextPathStep(ctx, connectionId);
      }
    }
    
    if (playerData.standaloneHarvestState) {
      playerData.standaloneHarvestState.isHarvesting = false;
      playerData.standaloneHarvestState.currentNpcId = null;
      playerData.standaloneHarvestState.pendingNpcs = [];
    }
    
    // Send message
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify({ 
        type: 'message', 
        message: 'Auto-harvest stopped.' 
      }));
    }
    
    // Send room update so client sees the harvest has ended and NPC widget disappears
    const { sendRoomUpdate } = require('../utils/broadcast');
    const player = await db.getPlayerById(playerId);
    if (player && player.current_room_id) {
      const currentRoom = await db.getRoomById(player.current_room_id);
      if (currentRoom) {
        await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connectionId, currentRoom, false);
      }
    }
  } else {
      // Even if no session found, clear the harvest state in playerData
      if (playerData.pathExecution && playerData.pathExecution.autoHarvestState) {
        playerData.pathExecution.autoHarvestState.isHarvesting = false;
        playerData.pathExecution.autoHarvestState.currentNpcId = null;
        playerData.pathExecution.autoHarvestState.pendingNpcs = [];
      }
      if (playerData.standaloneHarvestState) {
        playerData.standaloneHarvestState.isHarvesting = false;
        playerData.standaloneHarvestState.currentNpcId = null;
        playerData.standaloneHarvestState.pendingNpcs = [];
      }
    }
}

/**
 * Handle attune command - restore Vitalis
 * Uses formula-based system for cooldown, restore amount, and delay
 */
async function attune(ctx, data) {
  const { ws, db, playerName } = ctx;
  
  // Import harvest formula functions
  const { 
    calculateAttunementCooldownReduction, 
    calculateAttunementRestoreBonus, 
    calculateAttunementDelayReduction 
  } = require('../utils/harvestFormulas');
  
  try {
    const player = await db.getPlayerByName(playerName);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
      return;
    }
    
    const now = Date.now();
    const resonance = player.stat_resonance || 5;
    const fortitude = player.stat_fortitude || 5;
    
    // Get base attunement values from player (with defaults)
    const baseCooldown = player.base_attunement_cooldown_ms || 10000;
    const basePoints = player.base_attunement_points || 10;
    const baseDelay = player.base_attunement_delay_ms || 2000;
    
    // Calculate effective cooldown using resonance
    const cooldownMultiplier = await calculateAttunementCooldownReduction(resonance, db);
    const effectiveCooldown = Math.round(baseCooldown * cooldownMultiplier);
    
    // Check cooldown
    if (player.last_attune_time && (now - player.last_attune_time) < effectiveCooldown) {
      const remainingMs = effectiveCooldown - (now - player.last_attune_time);
      const remainingSec = Math.ceil(remainingMs / 1000);
      
      const cooldownMessage = messageCache.getFormattedMessage('attune_cooldown', {});
      const { formatMessageForTerminal } = require('../utils/markupService');
      
      let rawMessage;
      if (!cooldownMessage || cooldownMessage === 'attune_cooldown') {
        // Fallback if message not in cache
        rawMessage = `Your connection is still stabilizing. You need ${remainingSec} more second${remainingSec !== 1 ? 's' : ''} before you can attune again.`;
      } else {
        rawMessage = cooldownMessage;
      }
      
      const html = formatMessageForTerminal(rawMessage, 'info', '#00ffff');
      ws.send(JSON.stringify({
        type: 'terminal:message',
        message: rawMessage,
        html: html,
        messageType: 'info'
      }));
      return;
    }
    
    // Calculate effective restore using fortitude
    const restoreMultiplier = await calculateAttunementRestoreBonus(fortitude, db);
    const effectiveRestore = Math.round(basePoints * restoreMultiplier);
    
    // Calculate effective delay using average of resonance and fortitude
    const delayMultiplier = await calculateAttunementDelayReduction(resonance, fortitude, db);
    const effectiveDelay = Math.round(baseDelay * delayMultiplier);
    
    // Calculate final vitalis values
    const currentVitalis = player.resource_vitalis || 0;
    const maxVitalis = player.resource_max_vitalis || 100;
    const newVitalis = Math.min(currentVitalis + effectiveRestore, maxVitalis);
    
    // Update last_attune_time immediately (to prevent spam during delay)
    await db.updatePlayer({
      id: player.id,
      last_attune_time: now
    });
    
    // Send initial message with typewriter effect (vitalis will be granted after delay)
    // Use typewriter markup for the message
    const { formatMessageForTerminal } = require('../utils/markupService');
    const attuneMessage = `{{typewriter:100}}You kneel and attune to the pulse beneath your feet. Your Vitalis surges. (${newVitalis} / ${maxVitalis}){{/typewriter}}`;
    const html = formatMessageForTerminal(attuneMessage, 'info', '#00ffff');
    
    ws.send(JSON.stringify({
      type: 'terminal:message',
      message: attuneMessage,
      html: html,
      messageType: 'info'
    }));
    
    // After the delay, actually grant the vitalis points
    setTimeout(async () => {
      try {
        // Re-fetch player to get current vitalis (in case it changed)
        const currentPlayer = await db.getPlayerByName(playerName);
        if (!currentPlayer) return;
        
        const currentVitalisNow = currentPlayer.resource_vitalis || 0;
        const finalVitalis = Math.min(currentVitalisNow + effectiveRestore, maxVitalis);
        
        // Update player with new vitalis
        await db.updatePlayer({
          id: currentPlayer.id,
          resource_vitalis: finalVitalis
        });
        
        // Update player stats widget
        if (ctx.connectionId && ctx.connectedPlayers) {
          const { sendPlayerStats } = require('../utils/broadcast');
          await sendPlayerStats(ctx.connectedPlayers, db, ctx.connectionId);
        }
      } catch (delayError) {
        console.error('[attune] Error in delayed vitalis grant:', delayError);
      }
    }, effectiveDelay);
    
  } catch (error) {
    console.error('[attune] Error:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'An error occurred while attuning. Please try again.' 
    }));
  }
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
    let foundKeyword = false;
    
    // Check keywords_responses for all lorekeeper types (dialogue and puzzle)
    // For puzzle-type lorekeepers, keywords_responses contains the puzzle clues
    if (lk.keywordsResponses) {
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
  // Handle both formats:
  // 1. { type: 'ask', message: "Calder test" } - from client.js
  // 2. { type: 'ask', target: "Calder", question: "test" } - from main.js
  let fullMessage = '';
  
  if (data.target && data.question) {
    // Format 2: Combine target and question
    fullMessage = `${data.target} ${data.question}`.trim();
  } else {
    // Format 1: Use message directly
    fullMessage = (data.message || '').trim();
  }
  
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
  // Strip @ symbols from target player name for comparison (user may type with or without @)
  const targetPlayerNameClean = stripPlayerNameMarkup(targetPlayerName).toLowerCase();
  
  let targetConnectionId = null;
  for (const [connId, playerData] of connectedPlayers) {
    // Strip @ symbols from stored player name for comparison
    const playerNameClean = stripPlayerNameMarkup(playerData.playerName).toLowerCase();
    if (playerNameClean === targetPlayerNameClean && 
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
  
  // Check if puzzle has clues configured (array format: [{"keyword": "key", "answer": "value"}])
  if (!lk.puzzleClues || !Array.isArray(lk.puzzleClues) || lk.puzzleClues.length === 0) {
    ws.send(JSON.stringify({ type: 'message', message: `${lk.name} offers no clues.` }));
    return;
  }
  
  // Get clue index from player data or room_npcs state (for now just cycle through)
  // Simple implementation: cycle through clues based on a hash of player+npc+time
  const clueIndex = Math.floor(Date.now() / 30000) % lk.puzzleClues.length;
  const clueObj = lk.puzzleClues[clueIndex];
  
  // Extract clue text from array format
  let clueText = '';
  if (clueObj && typeof clueObj === 'object') {
    // New format: {"keyword": "key", "answer": "value"}
    if (clueObj.keyword && clueObj.answer) {
      clueText = `${clueObj.keyword}: ${clueObj.answer}`;
    } else {
      // Fallback: if it's just a string in the array (legacy format)
      clueText = typeof clueObj === 'string' ? clueObj : JSON.stringify(clueObj);
    }
  } else {
    // Legacy format: array of strings
    clueText = clueObj;
  }
  
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
  const matches = findMatchingItems(playerItems, query);
  
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
    
    // If requesting more than available, store all available (don't error)
    if (quantityToStore > availableQuantity) {
      quantityToStore = availableQuantity;
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `You only have ${availableQuantity} ${item.item_name}. Storing all ${availableQuantity}.` 
      }));
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
  const matches = findMatchingItems(warehouseItems, query);
  
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
    
    // If requesting more than available, withdraw all available (don't error)
    if (quantityToWithdraw > availableQuantity) {
      quantityToWithdraw = availableQuantity;
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: `You only have ${availableQuantity} ${item.item_name} stored. Withdrawing all ${availableQuantity}.` 
      }));
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
    
    // If requesting more than available, deposit all available (don't error)
    if (playerCurrencyQuantity < amountToDeposit) {
      amountToDeposit = playerCurrencyQuantity;
      ws.send(JSON.stringify({ type: 'message', message: `You only have ${playerCurrencyQuantity} ${matchedCurrency.name}. Depositing all ${playerCurrencyQuantity}.` }));
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
    
    // Find item by improved matching
    const allItems = await db.getAllItems();
    // Convert to format expected by findMatchingItems (needs item_name property)
    const itemsForMatching = allItems.map(item => ({ item_name: item.name, ...item }));
    const matchedItems = findMatchingItems(itemsForMatching, itemName.toLowerCase());
    
    if (matchedItems.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: `Item "${itemName}" not found.` }));
      return;
    }
    
    if (matchedItems.length > 1) {
      ws.send(JSON.stringify({ type: 'error', message: `Which did you mean: ${matchedItems.map(i => i.item_name || i.name).join(', ')}?` }));
      return;
    }
    
    const targetItem = matchedItems[0];
    // Get the actual item name (could be from item_name or name property)
    const actualItemName = targetItem.item_name || targetItem.name;
    const merchantItem = merchantItems.find(mi => mi.item_id === targetItem.id);
    
    if (!merchantItem) {
      ws.send(JSON.stringify({ type: 'error', message: `"${actualItemName}" is not for sale here.` }));
      return;
    }
    
    // Check if item is buyable
    if (!merchantItem.buyable) {
      ws.send(JSON.stringify({ type: 'error', message: `"${actualItemName}" cannot be purchased.` }));
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
    
    // Add item to player inventory (use actualItemName which could be item_name or name)
    await db.addPlayerItem(player.id, actualItemName, quantity);
    
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
      message: `Purchased ${quantity} ${actualItemName}${quantity !== 1 ? '(s)' : ''} for ${priceMsg}.` 
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
    
    // Find item by improved matching
    const matchedItems = findMatchingItems(playerItems, itemName.toLowerCase());
    
    if (matchedItems.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: `You don't have "${itemName}".` }));
      return;
    }
    
    if (matchedItems.length > 1) {
      ws.send(JSON.stringify({ type: 'error', message: `Which did you mean: ${matchedItems.map(i => i.item_name).join(', ')}?` }));
      return;
    }
    
    const targetItem = matchedItems[0];
    
    // If requesting more than available, sell all available (don't error)
    let quantityToSell = quantity;
    if (targetItem.quantity < quantity) {
      quantityToSell = targetItem.quantity;
      ws.send(JSON.stringify({ type: 'message', message: `You only have ${targetItem.quantity} ${targetItem.item_name}. Selling all ${targetItem.quantity}.` }));
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
    const totalPayment = merchantItem.price * quantityToSell;
    if (totalPayment <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'This merchant does not pay for this item.' }));
      return;
    }
    
    // Remove item from player inventory
    await db.removePlayerItem(player.id, targetItem.item_name, quantityToSell);
    
    // Add currency to player (with auto-conversion)
    await db.addPlayerCurrency(player.id, totalPayment);
    
    // Update merchant inventory (if not unlimited)
    if (!merchantItem.unlimited) {
      await db.query(
        'UPDATE merchant_items SET current_qty = current_qty + $1 WHERE id = $2',
        [quantityToSell, merchantItem.id]
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
      message: `Sold ${quantityToSell} ${targetItem.item_name}${quantityToSell !== 1 ? '(s)' : ''} for ${paymentMsg}.` 
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
}

/**
 * Get list of connected players (for telepath dropdown)
 */
async function getConnectedPlayersList(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  try {
    const playersList = [];
    
    for (const [connectionId, playerData] of connectedPlayers.entries()) {
      // Skip if WebSocket is not open
      if (!playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      
      // Get player info
      const player = await db.getPlayerByName(playerData.playerName);
      if (!player) continue;
      
      // Strip @ symbols from player name for display
      const displayName = stripPlayerNameMarkup(player.name);
      
      playersList.push({
        name: player.name, // Original name with @ symbols (for backend matching)
        displayName: displayName // Display name without @ symbols (for UI)
      });
    }
    
    // Sort by display name
    playersList.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // Send list to client
    ws.send(JSON.stringify({
      type: 'connectedPlayersList',
      players: playersList
    }));
  } catch (err) {
    console.error('Get connected players list error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get player list' }));
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
      
      // Strip @ symbols from player name for display
      const displayName = stripPlayerNameMarkup(player.name);
      
      playersList.push({
        name: player.name, // Keep original for sorting
        displayName: displayName, // Display name without @ symbols
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
      html += '<tr><td colspan="3" style="text-align: center; color: #888;">No players are currently in the world.</td></tr>';
    } else {
      playersList.forEach(player => {
        html += '<tr>';
        html += `<td><strong>${escapeHtml(player.displayName)}</strong></td>`;
        html += `<td>${escapeHtml(player.mapName)}</td>`;
        html += `<td>${escapeHtml(player.roomName)} (${player.x}, ${player.y})</td>`;
        html += '</tr>';
      });
    }
    
    html += '</tbody></table>';
    html += '</div>';
    
    // Send message with HTML content in the html field
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: 'Players in the world:',
      html: html,
      messageType: 'info'
    }));
  } catch (err) {
    console.error('Who command error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get player list' }));
  }
}

/**
 * Handle pulse echo command - display player's pulse echo stats
 */
async function pulseEcho(ctx, data) {
  const { ws, db, playerName } = ctx;
  
  try {
    const player = await db.getPlayerByName(playerName);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
      return;
    }
    
    // Get pulse echo stats (with defaults if not yet set)
    const pulseEchoes = player.pulse_echoes || 0;
    const pulseEchoTier = player.pulse_echo_tier || 1;
    
    // Build HTML table similar to who command
    let html = '<div class="who-list">';
    html += '<table class="who-table">';
    html += '<thead><tr>';
    html += '<th>Pulse Echo Stat</th>';
    html += '<th>Value</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    html += '<tr>';
    html += '<td>Total Pulse Echoes</td>';
    html += `<td style="color: #00ffff;"><strong>${pulseEchoes.toLocaleString()}</strong></td>`;
    html += '</tr>';
    
    html += '<tr>';
    html += '<td>Pulse Echo Tier</td>';
    html += `<td style="color: #ff00ff;"><strong>${pulseEchoTier}</strong></td>`;
    html += '</tr>';
    
    html += '</tbody></table>';
    html += '</div>';
    
    // Send message with HTML content
    ws.send(JSON.stringify({ 
      type: 'message', 
      message: 'Your Pulse Echo Status:',
      html: html,
      messageType: 'info'
    }));
  } catch (err) {
    console.error('Pulse Echo command error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get pulse echo status' }));
  }
}

/**
 * Handle /zork command - toggle ZORK AI on/off
 * If ZORK is in the game: disconnect him and disable auto-reconnect
 * If ZORK is not in the game: enable auto-reconnect (ZORK will connect)
 */
async function zork(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const ZORK_NAME = '@ZORK THE AI LORD@';
  
  try {
    // Check if ZORK is currently connected
    let zorkConnectionId = null;
    for (const [connId, playerData] of connectedPlayers.entries()) {
      if (playerData.playerName === ZORK_NAME && playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        zorkConnectionId = connId;
        break;
      }
    }
    
    if (zorkConnectionId) {
      // ZORK is connected - disconnect him and disable flag
      const zorkWs = connectedPlayers.get(zorkConnectionId).ws;
      
      // Disable the flag first (prevents reconnection)
      disableZork();
      
      // Close the WebSocket connection
      if (zorkWs && zorkWs.readyState === WebSocket.OPEN) {
        zorkWs.close(1000, 'ZORK disabled by /zork command');
      }
      
      // Remove from connected players
      connectedPlayers.delete(zorkConnectionId);
      
      // Broadcast that ZORK left
      const { broadcastToAll } = require('../utils/broadcast');
      const displayPlayerName = 'ZORK THE AI LORD';
      const leftMessage = messageCache.getFormattedMessage('player_left_game', { playerName: displayPlayerName });
      broadcastToAll(connectedPlayers, {
        type: 'systemMessage',
        message: leftMessage
      });
      
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: 'ZORK has been disconnected and will not reconnect until /zork is used again.',
        messageType: 'info'
      }));
      
      console.log(`[ZORK] Disconnected by /zork command from ${ctx.playerName}`);
    } else {
      // ZORK is not connected - enable flag (will allow connection)
      enableZork();
      
      ws.send(JSON.stringify({ 
        type: 'message', 
        message: 'ZORK has been enabled. ZORK will connect to the game shortly.',
        messageType: 'info'
      }));
      
      console.log(`[ZORK] Enabled by /zork command from ${ctx.playerName}`);
    }
  } catch (err) {
    console.error('ZORK command error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to toggle ZORK: ' + err.message }));
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
 * Check if auto-store should trigger and execute it
 * Called after harvest item is awarded
 */
async function checkAndExecuteAutoStore(ctx, connectionId, playerId, itemName) {
  const { db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    return false;
  }
  
  // Check if auto-store toggle is enabled
  const widgetConfig = await db.getPlayerWidgetConfig(playerId);
  if (!widgetConfig?.automation?.toggles?.autoStore) {
    return false; // Auto-store not enabled
  }
  
  // Get auto-store settings
  const autoStoreSettings = widgetConfig?.automation?.autoStore;
  if (!autoStoreSettings || !autoStoreSettings.itemName || !autoStoreSettings.warehouseLocationKey) {
    return false; // Auto-store not configured
  }
  
  // Check if the awarded item matches the configured item
  if (autoStoreSettings.itemName !== itemName) {
    return false; // Different item
  }
  
  // Get current inventory quantity of the item
  const playerItems = await db.getPlayerItems(playerId);
  const itemEntry = playerItems.find(i => i.item_name === itemName);
  const currentQuantity = itemEntry ? parseInt(itemEntry.quantity, 10) : 0;
  
  const maxThreshold = autoStoreSettings.maxInventory || 10;
  const minThreshold = autoStoreSettings.minInventory || 0;
  
  // Check if we exceed the max threshold
  if (currentQuantity <= maxThreshold) {
    return false; // Not over threshold
  }
  
  // Calculate how much to store (down to min threshold)
  const quantityToStore = currentQuantity - minThreshold;
  
  // Get player's current room
  const player = await db.getPlayerById(playerId);
  if (!player) {
    console.error(`[AutoStore] Player ${playerId} not found`);
    return false;
  }
  
  const originRoomId = player.current_room_id;
  const warehouseRoomId = parseInt(autoStoreSettings.warehouseLocationKey, 10);
  
  // Check if already in warehouse
  if (originRoomId === warehouseRoomId) {
    // Already in warehouse - just store directly
    await executeAutoStoreDeposit(ctx, connectionId, playerId, itemName, quantityToStore, warehouseRoomId);
    return true;
  }
  
  // Need to navigate to warehouse
  // Save current state for return
  const savedState = {
    originRoomId: originRoomId,
    pathExecution: playerData.pathExecution ? { ...playerData.pathExecution } : null,
    autoHarvestState: playerData.pathExecution?.autoHarvestState ? { ...playerData.pathExecution.autoHarvestState } : null,
    standaloneHarvestState: playerData.standaloneHarvestState ? { ...playerData.standaloneHarvestState } : null
  };
  
  // Store auto-store state in playerData
  playerData.autoStoreState = {
    isActive: true,
    phase: 'navigating_to_warehouse', // navigating_to_warehouse, storing, navigating_back
    itemName: itemName,
    quantityToStore: quantityToStore,
    warehouseRoomId: warehouseRoomId,
    savedState: savedState
  };
  
  // Pause any active path execution
  if (playerData.pathExecution && playerData.pathExecution.isActive) {
    playerData.pathExecution.isPaused = true;
  }
  
  // Calculate path to warehouse
  const { findPath } = require('../utils/pathfinding');
  const pathToWarehouse = await findPath(originRoomId, warehouseRoomId, db);
  
  if (!pathToWarehouse || pathToWarehouse.length === 0) {
    console.error(`[AutoStore] No path found to warehouse ${warehouseRoomId}`);
    // Clear auto-store state and resume
    delete playerData.autoStoreState;
    if (playerData.pathExecution) {
      playerData.pathExecution.isPaused = false;
    }
    return false;
  }
  
  // Send message to player
  if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
    playerData.ws.send(JSON.stringify({
      type: 'terminal:message',
      message: `Auto-store: Navigating to warehouse to deposit ${quantityToStore} ${itemName}...`,
      messageType: 'info'
    }));
  }
  
  // Start auto-navigation to warehouse
  playerData.autoNavigation = {
    path: pathToWarehouse,
    currentStep: 0,
    isActive: true,
    timeoutId: null,
    isAutoStore: true // Flag to indicate this is auto-store navigation
  };
  
  // Execute first step
  executeNextAutoNavigationStep(ctx, connectionId);
  
  return true;
}

/**
 * Execute the deposit part of auto-store (when already in warehouse)
 */
async function executeAutoStoreDeposit(ctx, connectionId, playerId, itemName, quantity, warehouseRoomId) {
  const { db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) return;
  
  const warehouseLocationKey = warehouseRoomId.toString();
  
  try {
    // Check warehouse access
    const accessCheck = await db.checkWarehouseAccess(playerId, warehouseLocationKey);
    if (!accessCheck.hasAccess) {
      console.error(`[AutoStore] No warehouse access for player ${playerId}`);
      return;
    }
    
    // Initialize warehouse if needed
    let capacity = await db.getPlayerWarehouseCapacity(playerId, warehouseLocationKey);
    if (!capacity) {
      capacity = await db.initializePlayerWarehouse(playerId, warehouseLocationKey, accessCheck.deedItem.id);
    }
    
    // Check capacity
    const itemTypeCount = await db.getWarehouseItemTypeCount(playerId, warehouseLocationKey);
    const existingItem = await db.getWarehouseItemQuantity(playerId, warehouseLocationKey, itemName);
    
    if (!existingItem && itemTypeCount >= capacity.max_item_types) {
      if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        playerData.ws.send(JSON.stringify({
          type: 'terminal:message',
          message: `Auto-store: Warehouse is full (max item types reached). Cannot store ${itemName}.`,
          messageType: 'warning'
        }));
      }
      return;
    }
    
    // Check quantity limit
    const currentWarehouseQty = existingItem || 0;
    const maxPerType = capacity.max_quantity_per_type || 100;
    const availableSpace = maxPerType - currentWarehouseQty;
    const actualQuantity = Math.min(quantity, availableSpace);
    
    if (actualQuantity <= 0) {
      if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        playerData.ws.send(JSON.stringify({
          type: 'terminal:message',
          message: `Auto-store: Warehouse storage is full for ${itemName}.`,
          messageType: 'warning'
        }));
      }
      return;
    }
    
    // Remove from inventory
    await db.removePlayerItem(playerId, itemName, actualQuantity);
    
    // Add to warehouse
    await db.addWarehouseItem(playerId, warehouseLocationKey, itemName, actualQuantity);
    
    // Send confirmation message
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify({
        type: 'terminal:message',
        message: `Auto-store: Deposited ${actualQuantity} ${itemName} to warehouse.`,
        messageType: 'success'
      }));
      
      // Update inventory display
      const { sendPlayerStats } = require('../utils/broadcast');
      await sendPlayerStats(connectedPlayers, db, connectionId);
    }
  } catch (error) {
    console.error(`[AutoStore] Error depositing items:`, error);
  }
}

/**
 * Handle auto-store completion after navigation
 * Called when auto-navigation completes and isAutoStore flag is set
 */
async function handleAutoStoreNavigationComplete(ctx, connectionId) {
  const { db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData || !playerData.autoStoreState) {
    return;
  }
  
  const autoStore = playerData.autoStoreState;
  
  if (autoStore.phase === 'navigating_to_warehouse') {
    // We've arrived at the warehouse - deposit items
    await executeAutoStoreDeposit(ctx, connectionId, playerData.playerId, 
      autoStore.itemName, autoStore.quantityToStore, autoStore.warehouseRoomId);
    
    // Now navigate back to origin
    autoStore.phase = 'navigating_back';
    
    const { findPath } = require('../utils/pathfinding');
    const pathBack = await findPath(autoStore.warehouseRoomId, autoStore.savedState.originRoomId, db);
    
    if (!pathBack || pathBack.length === 0) {
      console.error(`[AutoStore] No path back to origin room ${autoStore.savedState.originRoomId}`);
      // Clear auto-store state and try to resume
      finishAutoStore(ctx, connectionId);
      return;
    }
    
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify({
        type: 'terminal:message',
        message: `Auto-store: Returning to previous location...`,
        messageType: 'info'
      }));
    }
    
    // Start navigation back
    playerData.autoNavigation = {
      path: pathBack,
      currentStep: 0,
      isActive: true,
      timeoutId: null,
      isAutoStore: true
    };
    
    executeNextAutoNavigationStep(ctx, connectionId);
    
  } else if (autoStore.phase === 'navigating_back') {
    // We've returned to origin - finish and resume
    finishAutoStore(ctx, connectionId);
  }
}

/**
 * Finish auto-store and resume previous activity
 */
async function finishAutoStore(ctx, connectionId) {
  const { db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData || !playerData.autoStoreState) {
    return;
  }
  
  const savedState = playerData.autoStoreState.savedState;
  
  // Clear auto-store state
  delete playerData.autoStoreState;
  
  if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
    playerData.ws.send(JSON.stringify({
      type: 'terminal:message',
      message: `Auto-store: Complete. Resuming previous activity.`,
      messageType: 'success'
    }));
  }
  
  // Resume path execution if it was active
  if (savedState.pathExecution && savedState.pathExecution.isActive) {
    playerData.pathExecution = {
      ...savedState.pathExecution,
      isPaused: false
    };
    
    // Resume path execution
    executeNextPathStep(ctx, connectionId);
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
    // Check if this was auto-store navigation before clearing
    const wasAutoStore = playerData.autoNavigation?.isAutoStore;
    
    // Navigation complete
    playerData.autoNavigation = null;
    
    // Check if this was auto-store navigation
    if (wasAutoStore && playerData.autoStoreState) {
      // Handle auto-store navigation completion
      await handleAutoStoreNavigationComplete(ctx, connectionId);
      return;
    }
    
    // Check if there's a pending path execution
    if (playerData.pendingPathExecution) {
      // Start path execution immediately
      const pendingPath = playerData.pendingPathExecution;
      playerData.pendingPathExecution = null;
      
      // Start path execution
      const isLooping = pendingPath.pathType === 'loop';
      playerData.pathExecution = {
        pathId: pendingPath.pathId,
        pathType: pendingPath.pathType,
        steps: pendingPath.steps,
        currentStep: 0,
        isActive: true,
        timeoutId: null,
        isLooping: isLooping,
        isPaused: false,
        autoHarvestEnabled: pendingPath.autoHarvestEnabled || false,
        autoHarvestState: {
          isHarvesting: false,
          currentNpcId: null,
          pendingNpcs: []
        }
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
          sessionId: sessionId || playerData.sessionId, // Get from ctx or playerData
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
  const connectionId = ctx.connectionId;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { config } = data;
  if (!config || typeof config !== 'object') {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid config' }));
    return;
  }
  
  // Merge with existing config to preserve other widget settings
  const existingConfig = await db.getPlayerWidgetConfig(playerData.playerId);
  const mergedConfig = {
    ...existingConfig,
    ...config,
    // Deep merge automation config if it exists
    automation: config.automation ? {
      ...(existingConfig.automation || {}),
      ...config.automation
    } : existingConfig.automation
  };
  
  console.log(`Saving widget config for player ${playerData.playerId}:`, mergedConfig);
  await db.updatePlayerWidgetConfig(playerData.playerId, mergedConfig);
  console.log(`Widget config saved successfully for player ${playerData.playerId}`);
  
  // Store auto-harvest toggle state in playerData for quick access
  if (mergedConfig.automation && mergedConfig.automation.toggles) {
    const autoHarvestEnabled = mergedConfig.automation.toggles.autoHarvest === true;
    
    if (autoHarvestEnabled) {
      // Auto-harvest enabled - initialize state if needed
      if (!playerData.standaloneHarvestState) {
        playerData.standaloneHarvestState = { isHarvesting: false, currentNpcId: null, pendingNpcs: [] };
      }
      
      // IMPORTANT: If player has active path execution (loop), also enable auto-harvest for the loop
      // This allows toggling auto-harvest mid-loop
      if (playerData.pathExecution && playerData.pathExecution.isActive) {
        console.log(`[updateWidgetConfig] Auto-harvest enabled during active path execution - updating flag`);
        playerData.pathExecution.autoHarvestEnabled = true;
        // Initialize harvest state if not exists
        if (!playerData.pathExecution.autoHarvestState) {
          playerData.pathExecution.autoHarvestState = { isHarvesting: false, currentNpcId: null, pendingNpcs: [] };
        }
      }
      
      // Trigger auto-harvest check if enabled and player is in a room
      if (playerData.roomId) {
        console.log(`[updateWidgetConfig] Auto-harvest enabled, checking room ${playerData.roomId} for harvestable NPCs`);
        // Check for harvestable NPCs in current room
        setTimeout(() => {
          checkAndAutoHarvest(ctx, ctx.connectionId, playerData.roomId, playerData.playerId).catch(err => {
            console.error('[updateWidgetConfig] Error checking auto-harvest:', err);
          });
        }, 200); // Small delay to ensure room state is updated
      } else {
        console.log(`[updateWidgetConfig] Auto-harvest enabled but player not in a room (roomId: ${playerData.roomId})`);
      }
    } else {
      // Auto-harvest disabled - break any active harvests
      // Ensure ctx has connectionId
      const breakCtx = {
        ...ctx,
        connectionId: connectionId
      };
      await breakActiveHarvest(breakCtx, connectionId, playerData.playerId, 'auto_harvest_disabled');
      
      // Also disable auto-harvest for active path execution
      if (playerData.pathExecution && playerData.pathExecution.isActive) {
        console.log(`[updateWidgetConfig] Auto-harvest disabled during active path execution - updating flag`);
        playerData.pathExecution.autoHarvestEnabled = false;
      }
    }
  }
  
  ws.send(JSON.stringify({ type: 'widgetConfigUpdated', config: mergedConfig }));
}

/**
 * Get auto-store configuration data (warehouses and storable items)
 */
async function getAutoStoreConfig(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  const playerData = connectedPlayers.get(ctx.connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  console.log(`[getAutoStoreConfig] Fetching config for player ${playerData.playerId}`);
  
  try {
    // Check if player has any warehouse deeds
    const hasWarehouseDeed = await db.hasPlayerWarehouseDeed(playerData.playerId);
    console.log(`[getAutoStoreConfig] hasWarehouseDeed: ${hasWarehouseDeed}`);
    if (!hasWarehouseDeed) {
      ws.send(JSON.stringify({ 
        type: 'autoStoreConfig', 
        available: false,
        message: 'No warehouse deed found',
        warehouses: [],
        storableItems: []
      }));
      return;
    }
    
    // Get all warehouses the player has deeds for
    const warehouses = await db.getAllPlayerWarehouseDeeds(playerData.playerId);
    
    // Get player inventory items that can be stored (exclude currency and deeds)
    const playerItems = await db.getPlayerItems(playerData.playerId);
    const storableItems = [];
    
    for (const item of playerItems) {
      const itemDef = await db.getItemByName(item.item_name);
      // Exclude currency and deeds from storable items
      if (itemDef && itemDef.item_type !== 'currency' && itemDef.item_type !== 'deed') {
        storableItems.push({
          item_name: item.item_name,
          item_id: itemDef.id,
          quantity: parseInt(item.quantity, 10) || 0,
          item_type: itemDef.item_type
        });
      }
    }
    
    // Get current auto-store settings from widget config
    const widgetConfig = await db.getPlayerWidgetConfig(playerData.playerId);
    const autoStoreSettings = widgetConfig?.automation?.autoStore || null;
    
    console.log(`[getAutoStoreConfig] Sending config: ${warehouses.length} warehouses, ${storableItems.length} storable items`);
    
    ws.send(JSON.stringify({ 
      type: 'autoStoreConfig', 
      available: true,
      warehouses,
      storableItems,
      currentSettings: autoStoreSettings
    }));
  } catch (error) {
    console.error('[getAutoStoreConfig] Error:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get auto-store configuration' }));
  }
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
    
    // Send success message
    ws.send(JSON.stringify({
      type: 'pathSaved',
      pathId: pathId,
      name: name,
      pathType: pathType
    }));
    
    // Immediately refresh paths list so new path appears in dropdown
    const paths = await db.getAllPathsByPlayer(playerData.playerId);
    ws.send(JSON.stringify({
      type: 'allPlayerPaths',
      paths: paths
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

async function deletePath(ctx, data) {
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
    // Verify path belongs to player before deleting
    const path = await db.getPathById(pathId);
    if (!path) {
      ws.send(JSON.stringify({ type: 'error', message: 'Path not found' }));
      return;
    }
    
    if (path.player_id !== playerData.playerId) {
      ws.send(JSON.stringify({ type: 'error', message: 'You can only delete your own paths' }));
      return;
    }
    
    // Delete the path
    await db.deletePath(pathId);
    
    // Send success message
    ws.send(JSON.stringify({
      type: 'pathDeleted',
      pathId: pathId
    }));
    
    // Immediately refresh paths list
    const paths = await db.getAllPathsByPlayer(playerData.playerId);
    ws.send(JSON.stringify({
      type: 'allPlayerPaths',
      paths: paths
    }));
  } catch (error) {
    console.error('Error deleting path:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to delete path: ' + error.message }));
  }
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
      description: r.description || '',
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

    // Get current room for the player (only if they're in this map)
    let currentRoom = null;
    let connectedMapData = null;
    if (playerData.roomId) {
      const playerRoom = await db.getRoomById(playerData.roomId);
      if (playerRoom && playerRoom.map_id === mapId) {
        currentRoom = {
          x: playerRoom.x,
          y: playerRoom.y,
          id: playerRoom.id
        };
        // Check if player is on a junction room
        connectedMapData = await getConnectedMapData(db, playerRoom, colorMap);
      }
    }

    ws.send(JSON.stringify({
      type: 'mapData',
      rooms: allRooms,
      roomTypeColors: colorMap,
      currentRoom: currentRoom,
      mapId: mapId,
      connectedMapData: connectedMapData
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

  const { pathId, autoHarvestEnabled = false } = data;
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
      const isLooping = path.path_type === 'loop';
      playerData.pendingPathExecution = {
        pathId: path.id,
        pathType: path.path_type,
        steps: validSteps.map(s => ({ direction: s.direction, roomId: s.room_id })),
        originRoomId: path.origin_room_id,
        autoHarvestEnabled: autoHarvestEnabled === true // Works for loops and paths
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
        needsNavigation: true,
        stepCount: validSteps.length,
        originRoomId: path.origin_room_id
      }));
    } else {
      // Already at origin, start path execution immediately (use filtered valid steps)
      const isLooping = path.path_type === 'loop';
      playerData.pathExecution = {
        pathId: path.id,
        pathType: path.path_type,
        steps: validSteps.map(s => ({ direction: s.direction, roomId: s.room_id })),
        currentStep: 0,
        isActive: true,
        timeoutId: null,
        isLooping: isLooping,
        isPaused: false,
        autoHarvestEnabled: isLooping ? (autoHarvestEnabled === true) : false, // Only for loops
        autoHarvestState: {
          isHarvesting: false,
          currentNpcId: null,
          pendingNpcs: []
        }
      };

      // Begin first path step
      executeNextPathStep(ctx, connectionId);

      ws.send(JSON.stringify({ 
        type: 'pathExecutionStarted',
        message: 'Path execution started.',
        needsNavigation: false,
        stepCount: validSteps.length,
        originRoomId: path.origin_room_id
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
  
  // Get player to check loop_delay_ms
  const player = await db.getPlayerByName(playerData.playerName);
  const delayMs = (player && player.loop_delay_ms) ? player.loop_delay_ms : 1000;
  
  // Wait for delay, then execute move
  console.log(`[executeNextPathStep] Scheduling move in ${delayMs}ms for step ${stepIndex}, direction: ${step.direction}`);
  const timeoutId = setTimeout(async () => {
    // Check if path execution is still active
    if (!playerData.pathExecution || !playerData.pathExecution.isActive) {
      console.log(`[executeNextPathStep] setTimeout: Path execution no longer active, aborting`);
      return;
    }
    
    console.log(`[executeNextPathStep] setTimeout fired: Executing move for step ${stepIndex}, direction: ${step.direction}`);
    
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
          sessionId: sessionId || playerData.sessionId, // Get from ctx or playerData
          playerName: playerData.playerName
        };
        
        // Call move handler - it will check path execution state and allow the move
        console.log(`[executeNextPathStep] Calling move() with direction: ${step.direction}, currentStep before move: ${playerData.pathExecution.currentStep}, sessionId: ${moveCtx.sessionId ? 'present' : 'MISSING'}`);
        await move(moveCtx, { direction: step.direction });
        console.log(`[executeNextPathStep] move() returned, currentStep after move: ${playerData.pathExecution?.currentStep}`);
        
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

  // Check if this is a pause (isPause flag in data) or a full stop
  const isPause = data && data.isPause === true;
  
  if (isPause && playerData.pathExecution && playerData.pathExecution.isActive) {
    // Pause: keep execution state but mark as paused
    playerData.pathExecution.isPaused = true;
    // Clear timeout but keep execution state
    if (playerData.pathExecution.timeoutId) {
      clearTimeout(playerData.pathExecution.timeoutId);
      playerData.pathExecution.timeoutId = null;
    }
    ws.send(JSON.stringify({ 
      type: 'pathExecutionStopped',
      message: 'Path/Loop execution paused.'
    }));
  } else {
    // Full stop: completely clear path execution state
    clearPathExecution(connectedPlayers, connectionId);
    ws.send(JSON.stringify({ 
      type: 'pathExecutionStopped',
      message: 'Path/Loop execution stopped.'
    }));
  }
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

// ============================================================================
// Debug Observer System
// ============================================================================

/**
 * Handle create ZORK ticket from user interface
 */
async function createZorkTicket(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { title, description, priority = 2, ticketType = 'bug' } = data;
  
  if (!title || !title.trim()) {
    ws.send(JSON.stringify({ type: 'error', message: 'Ticket title is required' }));
    return;
  }
  
  // Validate priority
  if (priority < 1 || priority > 4) {
    ws.send(JSON.stringify({ type: 'error', message: 'Priority must be between 1 (low) and 4 (critical)' }));
    return;
  }
  
  // Validate ticket type
  const validTypes = ['bug', 'feature', 'debug'];
  if (!validTypes.includes(ticketType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Ticket type must be one of: ${validTypes.join(', ')}` }));
    return;
  }
  
  try {
    // Only use 'zork' as created_by if this is actually from ZORK AI
    // For user-created tickets, use the actual player name
    const createdBy = data.fromZork === true ? 'zork' : playerData.playerName;
    
    const ticket = await db.createDebugTodo({
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: priority,
      ticket_type: ticketType,
      status: 'open',
      created_by: createdBy,
      player_id: playerData.playerId,
      player_name: playerData.playerName
    });
    
    ws.send(JSON.stringify({
      type: 'zorkTicketCreated',
      ticketId: ticket.id,
      message: `Ticket #${ticket.id} created successfully. ZORK will review it shortly.`
    }));
    
    console.log(`[ZORK Ticket] Created ticket #${ticket.id} by ${playerData.playerName}: ${title}`);
    
    // Create trigger file for auto-ticket processor
    try {
      const fs = require('fs');
      const path = require('path');
      const ticketsDir = path.join(__dirname, '..', '.tickets');
      
      // Ensure directory exists
      if (!fs.existsSync(ticketsDir)) {
        fs.mkdirSync(ticketsDir, { recursive: true });
      }
      
      // Create trigger file
      const triggerFile = path.join(ticketsDir, `ticket-${ticket.id}.trigger`);
      fs.writeFileSync(triggerFile, JSON.stringify({
        ticketId: ticket.id,
        title: ticket.title,
        priority: ticket.priority,
        ticketType: ticketType,
        createdBy: playerData.playerName,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      console.log(`[ZORK Ticket] Created trigger file for auto-processing: ${triggerFile}`);
    } catch (triggerError) {
      // Don't fail ticket creation if trigger file creation fails
      console.warn('[ZORK Ticket] Failed to create trigger file (non-fatal):', triggerError.message);
    }
  } catch (error) {
    console.error('[ZORK Ticket] Error creating ticket:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create ticket: ' + error.message }));
  }
}

/**
 * Create a new ticket (for god mode/editor use)
 */
async function createTicket(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  // Require god mode for creating tickets via editor
  if (!playerData.isGodMode) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required to create tickets via editor' }));
    return;
  }
  
  const { 
    title, 
    description = '', 
    priority = 2, 
    ticket_type = 'bug',
    status = 'open',
    repro_steps = null,
    resolution_notes = null,
    tags = [],
    created_by = 'god_mode'
  } = data;
  
  if (!title || !title.trim()) {
    ws.send(JSON.stringify({ type: 'error', message: 'Ticket title is required' }));
    return;
  }
  
  // Validate priority
  if (priority < 1 || priority > 4) {
    ws.send(JSON.stringify({ type: 'error', message: 'Priority must be between 1 (low) and 4 (critical)' }));
    return;
  }
  
  // Validate ticket type (must match database constraint from migration 068)
  const validTypes = ['bug', 'feature', 'debug'];
  if (!validTypes.includes(ticket_type)) {
    ws.send(JSON.stringify({ type: 'error', message: `Ticket type must be one of: ${validTypes.join(', ')}` }));
    return;
  }
  
  // Validate status
  const validStatuses = ['open', 'backlog', 'in_progress', 'resolved'];
  if (!validStatuses.includes(status)) {
    ws.send(JSON.stringify({ type: 'error', message: `Status must be one of: ${validStatuses.join(', ')}` }));
    return;
  }
  
  try {
    const ticket = await db.createDebugTodo({
      title: title.trim(),
      description: description ? description.trim() : '',
      reproSteps: repro_steps,
      priority: priority,
      ticketType: ticket_type,
      createdBy: created_by,
      playerId: playerData.playerId,
      playerName: playerData.playerName
    });
    
    // Update with additional fields if provided
    if (tags.length > 0 || resolution_notes || status !== 'open') {
      const updates = {};
      if (tags.length > 0) updates.tags = tags;
      if (resolution_notes) updates.resolutionNotes = resolution_notes;
      if (status !== 'open') updates.status = status;
      
      await db.updateDebugTodo(ticket.id, updates);
      ticket.tags = tags;
      ticket.resolution_notes = resolution_notes;
      ticket.status = status;
    }
    
    ws.send(JSON.stringify({
      type: 'ticketCreated',
      ticket: ticket
    }));
    
    console.log(`[Ticket Editor] Ticket #${ticket.id} created by ${playerData.playerName}`);
  } catch (error) {
    console.error('[Ticket Editor] Error creating ticket:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create ticket: ' + error.message }));
  }
}

/**
 * Get tickets for user (with filters)
 */
async function getTickets(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { status = null, limit = 100, includeResolved = false, includeDeleted = false } = data;
  
  try {
    let tickets;
    if (status) {
      tickets = await db.listDebugTodos({ status, limit, includeDeleted });
    } else {
      tickets = await db.listDebugTodos({ limit: limit * 2, includeDeleted }); // Get more to filter
    }
    
    // Filter out resolved if not requested
    if (!includeResolved) {
      tickets = tickets.filter(t => t.status !== 'resolved');
    }
    
    // Filter out tickets with invalid ticket_type (from before migration 068)
    const validTypes = ['bug', 'feature', 'debug'];
    const beforeTypeFilter = tickets.length;
    tickets = tickets.filter(t => !t.ticket_type || validTypes.includes(t.ticket_type));
    if (tickets.length < beforeTypeFilter) {
      console.warn(`[getTickets] Filtered out ${beforeTypeFilter - tickets.length} tickets with invalid ticket_type`);
    }
    
    // Limit results
    tickets = tickets.slice(0, limit);
    
    ws.send(JSON.stringify({
      type: 'ticketsList',
      tickets: tickets,
      count: tickets.length
    }));
  } catch (error) {
    console.error('[Tickets] Error getting tickets:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get tickets: ' + error.message }));
  }
}

/**
 * Update ticket (status, feedback, etc.)
 */
async function updateTicket(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  // Accept both snake_case and camelCase field names for compatibility
  const ticketType = data.ticketType || data.ticket_type;
  const resolutionNotes = data.resolutionNotes || data.resolution_notes;
  const reproSteps = data.reproSteps || data.repro_steps;
  
  const { ticketId, status, feedback, priority, deleted, title, description } = data;
  
  if (!ticketId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Ticket ID is required' }));
    return;
  }
  
  // Validate status if provided
  if (status) {
    const validStatuses = ['open', 'backlog', 'in_progress', 'resolved', 'deleted'];
    if (!validStatuses.includes(status)) {
      ws.send(JSON.stringify({ type: 'error', message: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}` }));
      return;
    }
  }
  
  // Validate priority if provided
  if (priority !== undefined) {
    if (priority < 1 || priority > 4) {
      ws.send(JSON.stringify({ type: 'error', message: 'Priority must be between 1 (low) and 4 (critical)' }));
      return;
    }
  }
  
  // Validate ticket type if provided (must match database constraint from migration 068)
  if (ticketType) {
    const validTypes = ['bug', 'feature', 'debug'];
    if (!validTypes.includes(ticketType)) {
      ws.send(JSON.stringify({ type: 'error', message: `Invalid ticket type: ${ticketType}. Must be one of: ${validTypes.join(', ')}` }));
      return;
    }
  }
  
  try {
    const updates = {};
    if (status) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (ticketType) updates.ticketType = ticketType; // database.js expects ticketType, maps to ticket_type column
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (reproSteps !== undefined) updates.reproSteps = reproSteps;
    if (feedback) {
      // Append feedback to resolution notes
      const ticket = await db.getDebugTodo(ticketId);
      const existingNotes = ticket?.resolution_notes || '';
      const feedbackText = `\n\n[Feedback from ${playerData.playerName}]: ${feedback}`;
      updates.resolutionNotes = existingNotes + feedbackText;
    }
    if (resolutionNotes !== undefined) updates.resolutionNotes = resolutionNotes;
    
    const updated = await db.updateDebugTodo(ticketId, updates);
    
    if (!updated) {
      ws.send(JSON.stringify({ type: 'error', message: 'Ticket not found' }));
      return;
    }
    
    ws.send(JSON.stringify({
      type: 'ticketUpdated',
      ticketId: updated.id,
      ticket: updated
    }));
    
    console.log(`[Tickets] Updated ticket #${ticketId} by ${playerData.playerName}`);
  } catch (error) {
    console.error('[Tickets] Error updating ticket:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update ticket: ' + error.message }));
  }
}

/**
 * Add feedback to a ticket (for work tickets workflow)
 */
async function addTicketFeedback(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { ticketId, feedback } = data;
  
  if (!ticketId || !feedback) {
    ws.send(JSON.stringify({ type: 'error', message: 'Ticket ID and feedback are required' }));
    return;
  }
  
  try {
    const ticket = await db.getDebugTodo(ticketId);
    if (!ticket) {
      ws.send(JSON.stringify({ type: 'error', message: 'Ticket not found' }));
      return;
    }
    
    // Append feedback to BOTH description and resolution_notes
    // Description is what Cursor reads when processing tickets
    // Resolution notes tracks the history
    const existingDescription = ticket.description || '';
    const existingNotes = ticket.resolution_notes || '';
    const feedbackText = `\n\n[Feedback from ${playerData.playerName} at ${new Date().toISOString()}]:\n${feedback}`;
    const updated = await db.updateDebugTodo(ticketId, {
      description: existingDescription + feedbackText,
      resolutionNotes: existingNotes + feedbackText
    });
    
    ws.send(JSON.stringify({
      type: 'ticketFeedbackAdded',
      ticketId: updated.id,
      message: 'Feedback added successfully'
    }));
    
    console.log(`[Tickets] Added feedback to ticket #${ticketId} by ${playerData.playerName}`);
  } catch (error) {
    console.error('[Tickets] Error adding feedback:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to add feedback: ' + error.message }));
  }
}

/**
 * Start or stop a debug observation session
 * Client will stream telemetry when session is active
 */
async function observeBug(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }
  
  const { action, bugLabel } = data;
  const playerId = playerData.playerId;
  const playerName = playerData.playerName;
  
  // Get current room info for context
  const player = await db.getPlayerById(playerId);
  const room = player ? await db.getRoomById(player.current_room_id) : null;
  const map = room ? await db.getMapById(room.map_id) : null;
  
  if (action === 'stop') {
    // End active session
    const session = await db.getActiveDebugSession(playerId);
    if (session) {
      await db.endDebugSession(session.id);
      
      ws.send(JSON.stringify({ 
        type: 'debugSessionEnded',
        sessionId: session.id
      }));
      
      // Notify ZORK via broadcast to connected players
      broadcastToAll(connectedPlayers, {
        type: 'debugSessionEnded',
        playerName: playerName,
        playerId: playerId,
        sessionId: session.id
      });
      
      ws.send(JSON.stringify({ 
        type: 'systemMessage', 
        message: `Debug observation session ended.` 
      }));
    } else {
      ws.send(JSON.stringify({ 
        type: 'systemMessage', 
        message: 'No active debug session to end.' 
      }));
    }
    return;
  }
  
  // Start new session
  if (!bugLabel) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Bug description required. Usage: observe bug [description]' 
    }));
    return;
  }
  
  const sessionId = await db.startDebugSession(playerId, bugLabel);
  
  ws.send(JSON.stringify({ 
    type: 'debugSessionStarted',
    sessionId: sessionId,
    bugLabel: bugLabel
  }));
  
  // Notify ZORK via broadcast
  broadcastToAll(connectedPlayers, {
    type: 'debugSessionStarted',
    playerName: playerName,
    playerId: playerId,
    sessionId: sessionId,
    bugLabel: bugLabel,
    currentRoom: room ? { id: room.id, name: room.name, x: room.x, y: room.y } : null,
    currentMap: map ? map.name : null
  });
  
  ws.send(JSON.stringify({ 
    type: 'systemMessage', 
    message: `Debug observation started: "${bugLabel}"\nYour browser will now stream telemetry to ZORK.\nUse "observe stop" when done.` 
  }));
}

/**
 * Handle client debug event (console errors, state snapshots, etc.)
 * Forwarded from client to ZORK for analysis
 */
async function clientDebugEvent(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  
  if (!playerData || !playerData.playerId) {
    // Silently ignore - not authenticated
    return;
  }
  
  const playerId = playerData.playerId;
  const playerName = playerData.playerName;
  
  // Check for active debug session
  const session = await db.getActiveDebugSession(playerId);
  if (!session) {
    // No active session - ignore debug events
    return;
  }
  
  // Forward to ZORK (and any other listeners)
  broadcastToAll(connectedPlayers, {
    type: 'debugEvent',
    sessionId: session.id,
    playerName: playerName,
    playerId: playerId,
    eventType: data.eventType,
    payload: data.payload,
    timestamp: Date.now()
  });
}

// ============================================================
// Automation Program Handlers (Phase 1 & 2)
// ============================================================

async function getAutomationPrograms(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

async function createAutomationProgram(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { name, description } = data;
  if (!name) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program name required' }));
    return;
  }
  
  const program = await db.createAutomationProgram(playerData.playerId, name, description);
  
  // Send updated list
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

async function updateAutomationProgram(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId, name, description, isActive } = data;
  if (!programId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  await db.updateAutomationProgram(programId, name, description, isActive, null);
  
  // Send updated list
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

async function deleteAutomationProgram(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId } = data;
  if (!programId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  await db.deleteAutomationProgram(programId);
  
  // Send updated list
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

async function getAutomationSteps(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId } = data;
  if (!programId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  const steps = await db.getAutomationStepsByProgramId(programId);
  ws.send(JSON.stringify({
    type: 'automation:steps',
    programId: programId,
    steps: steps
  }));
}

async function createAutomationStep(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId, stepOrder, instructionType, instructionConfig, conditions, loopTargetStep, loopMaxIterations } = data;
  if (!programId || !stepOrder || !instructionType) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID, step order, and instruction type required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  // Validate step order
  if (stepOrder < 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step order must be positive' }));
    return;
  }
  
  // Validate instruction type
  const validInstructionTypes = [
    'harvest', 'auto_harvest', 'attune', 'wait', 'move',
    'collect', 'store', 'deliver',
    'factory_insert_item', 'factory_insert_rune', 'factory_start', 'factory_repeat', 'factory_store_output',
    'loop', 'loop_custom'
  ];
  if (!validInstructionTypes.includes(instructionType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid instruction type: ${instructionType}` }));
    return;
  }
  
  // Validate attune vitalis bounds
  if (instructionType === 'attune' && instructionConfig) {
    const vitalisMin = instructionConfig.vitalis_min;
    const vitalisMax = instructionConfig.vitalis_max;
    if (vitalisMin !== undefined && vitalisMax !== undefined) {
      if (vitalisMin < 0 || vitalisMin > 100) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vitalis min must be 0-100' }));
        return;
      }
      if (vitalisMax < 0 || vitalisMax > 100) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vitalis max must be 0-100' }));
        return;
      }
      if (vitalisMin > vitalisMax) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vitalis min must be <= max' }));
        return;
      }
    }
  }
  
  // Validate loop target step
  if (instructionType === 'loop_custom') {
    const targetStep = loopTargetStep || instructionConfig?.targetStep;
    if (!targetStep || targetStep < 1) {
      ws.send(JSON.stringify({ type: 'error', message: 'Custom loop requires valid target step' }));
      return;
    }
    // Check if target step exists (will be validated when program runs)
    if (loopMaxIterations !== undefined && loopMaxIterations !== null && loopMaxIterations < 1) {
      ws.send(JSON.stringify({ type: 'error', message: 'Loop max iterations must be positive' }));
      return;
    }
  }
  
  const step = await db.createAutomationStep(
    programId,
    stepOrder,
    instructionType,
    instructionConfig || {},
    conditions || [],
    loopTargetStep,
    loopMaxIterations
  );
  
  // Send updated steps
  const steps = await db.getAutomationStepsByProgramId(programId);
  ws.send(JSON.stringify({
    type: 'automation:steps',
    programId: programId,
    steps: steps
  }));
  
  ws.send(JSON.stringify({
    type: 'automation:stepCreated',
    stepId: step.id
  }));
}

async function updateAutomationStep(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { stepId, stepOrder, instructionType, instructionConfig, conditions, loopTargetStep, loopMaxIterations } = data;
  if (!stepId || !stepOrder || !instructionType) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step ID, step order, and instruction type required' }));
    return;
  }
  
  // Verify step belongs to player's program
  const step = await db.getAutomationStepById(stepId);
  if (!step) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step not found' }));
    return;
  }
  
  const program = await db.getAutomationProgramById(step.program_id);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step not found' }));
    return;
  }
  
  // Validate step order
  if (stepOrder < 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step order must be positive' }));
    return;
  }
  
  // Validate instruction type
  const validInstructionTypes = [
    'harvest', 'auto_harvest', 'attune', 'wait', 'move',
    'collect', 'store', 'deliver',
    'factory_insert_item', 'factory_insert_rune', 'factory_start', 'factory_repeat', 'factory_store_output',
    'loop', 'loop_custom'
  ];
  if (!validInstructionTypes.includes(instructionType)) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid instruction type: ${instructionType}` }));
    return;
  }
  
  // Validate attune vitalis bounds
  if (instructionType === 'attune' && instructionConfig) {
    const vitalisMin = instructionConfig.vitalis_min;
    const vitalisMax = instructionConfig.vitalis_max;
    if (vitalisMin !== undefined && vitalisMax !== undefined) {
      if (vitalisMin < 0 || vitalisMin > 100) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vitalis min must be 0-100' }));
        return;
      }
      if (vitalisMax < 0 || vitalisMax > 100) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vitalis max must be 0-100' }));
        return;
      }
      if (vitalisMin > vitalisMax) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vitalis min must be <= max' }));
        return;
      }
    }
  }
  
  // Validate loop target step
  if (instructionType === 'loop_custom') {
    const targetStep = loopTargetStep || instructionConfig?.targetStep;
    if (!targetStep || targetStep < 1) {
      ws.send(JSON.stringify({ type: 'error', message: 'Custom loop requires valid target step' }));
      return;
    }
    if (loopMaxIterations !== undefined && loopMaxIterations !== null && loopMaxIterations < 1) {
      ws.send(JSON.stringify({ type: 'error', message: 'Loop max iterations must be positive' }));
      return;
    }
  }
  
  await db.updateAutomationStep(
    stepId,
    stepOrder,
    instructionType,
    instructionConfig || {},
    conditions || [],
    loopTargetStep,
    loopMaxIterations
  );
  
  // Send updated steps
  const steps = await db.getAutomationStepsByProgramId(step.program_id);
  ws.send(JSON.stringify({
    type: 'automation:steps',
    programId: step.program_id,
    steps: steps
  }));
  
  ws.send(JSON.stringify({
    type: 'automation:stepUpdated',
    stepId: stepId
  }));
}

async function deleteAutomationStep(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { stepId } = data;
  if (!stepId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step ID required' }));
    return;
  }
  
  // Verify step belongs to player's program
  const step = await db.getAutomationStepById(stepId);
  if (!step) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step not found' }));
    return;
  }
  
  const program = await db.getAutomationProgramById(step.program_id);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Step not found' }));
    return;
  }
  
  await db.deleteAutomationStep(stepId);
  
  // Send updated steps
  const steps = await db.getAutomationStepsByProgramId(step.program_id);
  ws.send(JSON.stringify({
    type: 'automation:steps',
    programId: step.program_id,
    steps: steps
  }));
  
  ws.send(JSON.stringify({
    type: 'automation:stepDeleted',
    stepId: stepId
  }));
}

async function startAutomationProgram(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId } = data;
  if (!programId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  // Check if program has steps
  const steps = await db.getAutomationStepsByProgramId(programId);
  if (!steps || steps.length === 0) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program has no steps' }));
    return;
  }
  
  // Initialize execution state
  const executionState = {
    currentStepIndex: 0,
    executionState: 'running',
    lastExecutionTime: Date.now(),
    loopCount: 0,
    currentLoopId: null,
    loopIterationCount: {},
    variableValues: {},
    conditionCache: {},
    harvestState: {
      isHarvesting: false,
      targetNPCs: [],
      collectedItems: {}
    }
  };
  
  await db.updateAutomationProgram(programId, null, null, true, executionState);
  
  ws.send(JSON.stringify({
    type: 'automation:programStarted',
    programId: programId
  }));
  
  // Send updated list
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

async function stopAutomationProgram(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId } = data;
  if (!programId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  const executionState = program.execution_state || {};
  executionState.executionState = 'stopped';
  executionState.pauseReason = 'manual_stop';
  
  await db.updateAutomationProgram(programId, null, null, false, executionState);
  
  ws.send(JSON.stringify({
    type: 'automation:programStopped',
    programId: programId
  }));
  
  // Send updated list
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

async function pauseAutomationProgram(ctx, data) {
  const { ws, db, connectedPlayers, connectionId } = ctx;
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const { programId } = data;
  if (!programId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program ID required' }));
    return;
  }
  
  // Verify program belongs to player
  const program = await db.getAutomationProgramById(programId);
  if (!program || program.player_id !== playerData.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Program not found' }));
    return;
  }
  
  const executionState = program.execution_state || {};
  executionState.executionState = 'paused';
  executionState.pauseReason = 'manual_pause';
  
  await db.updateAutomationProgram(programId, null, null, false, executionState);
  
  ws.send(JSON.stringify({
    type: 'automation:programPaused',
    programId: programId
  }));
  
  // Send updated list
  const programs = await db.getAutomationProgramsByPlayerId(playerData.playerId);
  ws.send(JSON.stringify({
    type: 'automation:programs',
    programs: programs
  }));
}

module.exports = {
  authenticateSession,
  getWidgetConfig,
  updateWidgetConfig,
  getAutoStoreConfig,
  getGameMessages,
  startPathingMode,
  addPathStep,
  savePath,
  deletePath,
  cancelPathing,
  getPathingRoom,
  getMapData,
  getAllPlayerPaths,
  getPathDetails,
  startPathExecution,
  stopPathExecution,
  continuePathExecution,
  resumeLoopAfterHarvest,
  breakActiveHarvest,
  checkAndAutoHarvest,
  checkAndExecuteAutoStore,
  handleAutoStoreNavigationComplete,
  move,
  look,
  inventory,
  take,
  drop,
  factoryWidgetAddItem,
  factoryWidgetRemoveItem,
  factoryCraft,
  harvest,
  attune,
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
  getConnectedPlayersList,
  pulseEcho,
  saveTerminalMessage,
  getCommsHistory,
  assignAttributePoint,
  getAutoPathMaps,
  getAutoPathRooms,
  calculateAutoPath,
  startAutoNavigation,
  observeBug,
  clientDebugEvent,
  createZorkTicket,
  createTicket,
  getTickets,
  updateTicket,
  addTicketFeedback,
  zork,
  getAutomationPrograms,
  createAutomationProgram,
  updateAutomationProgram,
  deleteAutomationProgram,
  getAutomationSteps,
  createAutomationStep,
  updateAutomationStep,
  deleteAutomationStep,
  startAutomationProgram,
  stopAutomationProgram,
  pauseAutomationProgram
};

