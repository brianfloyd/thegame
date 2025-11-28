const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
require('dotenv').config();

// Database module (async PostgreSQL)
const db = require('./database');

const npcLogic = require('./npcLogic');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Parse cookies and JSON bodies
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use express-session's built-in MemoryStore
const MemoryStore = require('express-session').MemoryStore;
const memoryStore = new MemoryStore();

// Session store for our custom session data (playerName, playerId, etc.)
// This is separate from express-session's session data but uses the same sessionId
const sessionStore = new Map(); // Map<sessionId, { playerName, playerId, createdAt, expiresAt }>

// Session cleanup job - remove expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, sessionData] of sessionStore.entries()) {
    if (sessionData.expiresAt < now) {
      sessionStore.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// Configure session middleware
const sessionMiddleware = session({
  name: 'gameSession',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: memoryStore,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
});

app.use(sessionMiddleware);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Railway/cloud deployments
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session validation middleware
async function validateSession(req, res, next) {
  const sessionId = req.sessionID;
  
  if (!sessionId || !req.session.playerName) {
    return res.status(401).send('Session required. Please select a character first.');
  }
  
  const sessionData = sessionStore.get(sessionId);
  if (!sessionData || sessionData.expiresAt < Date.now()) {
    req.session.destroy();
    return res.status(401).send('Session expired. Please select a character again.');
  }
  
  const player = await db.getPlayerByName(req.session.playerName);
  if (!player) {
    req.session.destroy();
    return res.status(404).send('Player not found.');
  }
  
  req.player = player;
  next();
}

// Optional session middleware (doesn't fail if no session)
async function optionalSession(req, res, next) {
  const sessionId = req.sessionID;
  
  if (sessionId && req.session.playerName) {
    const sessionData = sessionStore.get(sessionId);
    if (sessionData && sessionData.expiresAt >= Date.now()) {
      const player = await db.getPlayerByName(req.session.playerName);
      if (player) {
        req.player = player;
      }
    }
  }
  
  next();
}

// Middleware to check god mode (requires valid session)
function checkGodMode(req, res, next) {
  if (!req.player) {
    return res.status(401).send('Session required. Please select a character first.');
  }
  
  if (req.player.flag_god_mode !== 1) {
    return res.status(403).send('God mode required. You do not have access to this page.');
  }
  
  next();
}

// Rate limiting for character selection (simple in-memory store)
const characterSelectionAttempts = new Map(); // Map<ip, { count, resetTime }>

// Character selection endpoint
app.post('/api/select-character', async (req, res) => {
  const { playerName } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Basic rate limiting (30 attempts per 30 seconds per IP - relaxed for development)
  const now = Date.now();
  const attempts = characterSelectionAttempts.get(clientIp);
  if (attempts) {
    if (now < attempts.resetTime) {
      if (attempts.count >= 30) {
        return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
      }
      attempts.count++;
    } else {
      characterSelectionAttempts.set(clientIp, { count: 1, resetTime: now + 30000 });
    }
  } else {
    characterSelectionAttempts.set(clientIp, { count: 1, resetTime: now + 30000 });
  }
  
  // Clean up old rate limit entries periodically
  if (Math.random() < 0.01) { // 1% chance on each request
    for (const [ip, data] of characterSelectionAttempts.entries()) {
      if (now >= data.resetTime) {
        characterSelectionAttempts.delete(ip);
      }
    }
  }
  
  // Validate input
  if (!playerName || typeof playerName !== 'string') {
    return res.status(400).json({ success: false, error: 'Player name is required' });
  }
  
  // Sanitize player name (prevent injection)
  const sanitizedPlayerName = playerName.trim();
  if (sanitizedPlayerName.length === 0 || sanitizedPlayerName.length > 50) {
    return res.status(400).json({ success: false, error: 'Invalid player name' });
  }
  
  // Validate player exists
  const player = await db.getPlayerByName(sanitizedPlayerName);
  if (!player) {
    console.log(`Security: Invalid character selection attempt for: ${sanitizedPlayerName} from ${clientIp}`);
    return res.status(404).json({ success: false, error: 'Player not found' });
  }
  
  // Check if player is already in an active session (optional - could reject if you want single session per player)
  // For now, we'll allow multiple sessions but log it
  const existingSessions = [];
  for (const [sessionId, sessionData] of sessionStore.entries()) {
    if (sessionData.playerName === sanitizedPlayerName && sessionData.expiresAt >= Date.now()) {
      existingSessions.push(sessionId);
    }
  }
  
  if (existingSessions.length > 0) {
    console.log(`Info: Player ${sanitizedPlayerName} already has ${existingSessions.length} active session(s)`);
  }
  
  // Create session using express-session's sessionID
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  // Store in our custom session store using express-session's sessionID
  sessionStore.set(req.sessionID, {
    playerName: player.name,
    playerId: player.id,
    createdAt: Date.now(),
    expiresAt: expiresAt
  });
  
  // Set session data in express-session
  req.session.playerName = player.name;
  req.session.playerId = player.id;
  
  // Save session to ensure it's persisted before redirecting
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).json({ success: false, error: 'Failed to create session' });
    }
    console.log(`Character selected: ${player.name} (session: ${req.sessionID.substring(0, 8)}...)`);
    res.json({ success: true, sessionId: req.sessionID });
  });
});

// Root route - landing page (character selection)
app.get('/', optionalSession, (req, res) => {
  // If already has valid session, redirect to game
  if (req.player) {
    return res.redirect('/game');
  }
  // Otherwise show landing page
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game route - requires valid session
app.get('/game', optionalSession, (req, res) => {
  // If no valid session, redirect to character selection
  if (!req.player) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// Protected routes for god mode editors
app.get('/map', validateSession, checkGodMode, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map-editor.html'));
});

app.get('/npc', validateSession, checkGodMode, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'npc-editor.html'));
});

app.get('/items', validateSession, checkGodMode, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'item-editor.html'));
});

// Player Editor route (God Mode only)
app.get('/player', validateSession, checkGodMode, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player-editor.html'));
});

// Track connected players: connectionId -> { ws, roomId, playerName, playerId, sessionId }
// Uses unique connectionId per WebSocket to support multiple characters from same browser
const connectedPlayers = new Map();
let nextConnectionId = 1;

// Track factory widget state per player: connectionId -> { roomId, slots: [slot1, slot2], textInput }
// slots array: [{ itemName, quantity } | null, { itemName, quantity } | null]
const factoryWidgetState = new Map();

// Helper function to get available exits for a room
async function getExits(room) {
  const exits = {
    north: false,
    south: false,
    east: false,
    west: false,
    northeast: false,
    northwest: false,
    southeast: false,
    southwest: false,
    up: false, // Will be implemented when z coordinate is added
    down: false // Will be implemented when z coordinate is added
  };
  
  // Check for map connections first
  if (room.connection_direction === 'N' && room.connected_map_id) {
    exits.north = true;
  }
  if (room.connection_direction === 'S' && room.connected_map_id) {
    exits.south = true;
  }
  if (room.connection_direction === 'E' && room.connected_map_id) {
    exits.east = true;
  }
  if (room.connection_direction === 'W' && room.connected_map_id) {
    exits.west = true;
  }
  
  // Check for adjacent rooms in same map (only if no map connection in that direction)
  if (!exits.north) {
    exits.north = (await db.getRoomByCoords(room.map_id, room.x, room.y + 1)) != null;
  }
  if (!exits.south) {
    exits.south = (await db.getRoomByCoords(room.map_id, room.x, room.y - 1)) != null;
  }
  if (!exits.east) {
    exits.east = (await db.getRoomByCoords(room.map_id, room.x + 1, room.y)) != null;
  }
  if (!exits.west) {
    exits.west = (await db.getRoomByCoords(room.map_id, room.x - 1, room.y)) != null;
  }
  
  // Diagonal directions (no map connections for these yet)
  exits.northeast = (await db.getRoomByCoords(room.map_id, room.x + 1, room.y + 1)) != null;
  exits.northwest = (await db.getRoomByCoords(room.map_id, room.x - 1, room.y + 1)) != null;
  exits.southeast = (await db.getRoomByCoords(room.map_id, room.x + 1, room.y - 1)) != null;
  exits.southwest = (await db.getRoomByCoords(room.map_id, room.x - 1, room.y - 1)) != null;
  
  return exits;
}

// Helper function to get connected players in a room
function getConnectedPlayersInRoom(roomId) {
  const players = [];
  connectedPlayers.forEach((playerData, connId) => {
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      players.push(playerData.playerName);
    }
  });
  return players;
}

// Helper function to check if a room is empty (no players)
function isRoomEmpty(roomId) {
  let count = 0;
  connectedPlayers.forEach((playerData) => {
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      count++;
    }
  });
  return count === 0;
}

// Helper function to send room update to a player by connectionId
// showFullInfo: true to force full room display (for look command, entering room)
// Send updated player stats to a specific player
async function sendPlayerStats(connectionId) {
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  
  const player = await db.getPlayerByName(playerData.playerName);
  if (!player) return;
  
  const playerStats = db.getPlayerStats(player);
  if (playerStats) {
    playerStats.playerName = player.name;
    playerStats.currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
  }
  
  playerData.ws.send(JSON.stringify({
    type: 'playerStats',
    stats: playerStats || {}
  }));
}

async function sendRoomUpdate(connectionId, room, showFullInfo = false) {
  const playerData = connectedPlayers.get(connectionId);
  if (!playerData || !playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Only get connected players in the room, excluding the current player
  const playersInRoom = getConnectedPlayersInRoom(room.id).filter(p => p !== playerData.playerName);
  const exits = await getExits(room);
  
  // Get NPCs in the room with harvest progress info
  const now = Date.now();
  const npcsInRoomRaw = await db.getNPCsInRoom(room.id);
  const npcsInRoom = npcsInRoomRaw.map(npc => {
    const npcData = {
      id: npc.id,
      name: npc.name,
      description: npc.description,
      state: npc.state,
      color: npc.display_color || npc.color || '#00ffff',
      baseCycleTime: npc.base_cycle_time || 5000, // Pulse time in ms
      harvestableTime: npc.harvestableTime || 60000,
      cooldownTime: npc.cooldownTime || 120000
    };
    
    // Calculate harvest/cooldown progress
    if (npc.state.harvest_active && npc.state.harvest_start_time) {
      // Harvest is active - calculate remaining time
      const harvestElapsed = now - npc.state.harvest_start_time;
      const harvestRemaining = Math.max(0, npcData.harvestableTime - harvestElapsed);
      npcData.harvestProgress = harvestRemaining / npcData.harvestableTime; // 1.0 = full, 0.0 = empty
      npcData.harvestStatus = 'active';
    } else if (npc.state.cooldown_until && now < npc.state.cooldown_until) {
      // On cooldown - calculate progress
      const cooldownRemaining = npc.state.cooldown_until - now;
      const cooldownElapsed = npcData.cooldownTime - cooldownRemaining;
      npcData.harvestProgress = cooldownElapsed / npcData.cooldownTime; // 0.0 = start, 1.0 = done
      npcData.harvestStatus = 'cooldown';
    } else {
      // Ready to harvest
      npcData.harvestProgress = 1.0;
      npcData.harvestStatus = 'ready';
    }
    
    return npcData;
  });
  
  // Get items on the ground in the room
  const roomItems = await db.getRoomItems(room.id);
  
  // Get map name
  const map = await db.getMapById(room.map_id);
  const mapName = map ? map.name : '';

  // Get factory widget state if room is factory type
  let factoryState = null;
  if (room.room_type === 'factory') {
    const existingState = factoryWidgetState.get(connectionId);
    if (existingState && existingState.roomId === room.id) {
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
        roomId: room.id,
        slots: [null, null],
        textInput: ''
      });
    }
  } else {
    // Clear factory state if leaving factory room
    factoryWidgetState.delete(connectionId);
  }

  playerData.ws.send(JSON.stringify({
    type: 'roomUpdate',
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      x: room.x,
      y: room.y,
      mapName: mapName,
      roomType: room.room_type || 'normal'
    },
    players: playersInRoom,
    npcs: npcsInRoom,
    roomItems: roomItems,
    exits: exits,
    showFullInfo: showFullInfo,
    factoryWidgetState: factoryState
  }));
}

// Helper function to broadcast to all players in a room
function broadcastToRoom(roomId, message, excludeConnectionId = null) {
  connectedPlayers.forEach((playerData, connId) => {
    if (connId === excludeConnectionId) return;
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify(message));
    }
  });
}

// Helper to get session from WebSocket upgrade request
function getSessionFromRequest(req) {
  // Parse cookies from upgrade request
  const cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = decodeURIComponent(parts[1]);
      }
    });
  }
  
  let sessionId = cookies['gameSession'];
  if (!sessionId) return null;
  
  // express-session signs cookies with format: s:sessionId.signature
  // We need to extract just the sessionId part
  if (sessionId.startsWith('s:')) {
    // Remove 's:' prefix and signature
    const dotIndex = sessionId.indexOf('.', 2);
    if (dotIndex > 0) {
      sessionId = sessionId.substring(2, dotIndex);
    } else {
      sessionId = sessionId.substring(2);
    }
  }
  
  const sessionData = sessionStore.get(sessionId);
  if (!sessionData || sessionData.expiresAt < Date.now()) {
    return null;
  }
  
  return { sessionId, sessionData };
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  let connectionId = null; // Unique ID for this WebSocket connection
  let sessionId = null;
  let playerName = null;
  
  // Get session from upgrade request
  const session = getSessionFromRequest(req);
  if (session) {
    sessionId = session.sessionId;
    playerName = session.sessionData.playerName;
  }

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'authenticateSession') {
        // Validate session
        if (!session || !sessionId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No valid session. Please select a character first.' }));
          return;
        }

        const player = await db.getPlayerByName(playerName);
        if (!player) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }

        // Generate unique connection ID for this WebSocket
        connectionId = `conn_${nextConnectionId++}`;
        
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
        await sendRoomUpdate(connectionId, room, true);

        // Send player stats (dynamically extracted using configuration)
        const playerStats = db.getPlayerStats(player);
        if (playerStats) {
          playerStats.playerName = player.name; // Include player name for client
          // Add current encumbrance
          playerStats.currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
        }
        ws.send(JSON.stringify({
          type: 'playerStats',
          stats: playerStats || {}
        }));

        // Send map data (only rooms from current map - no preview of connected maps)
        const mapRooms = await db.getRoomsByMap(room.map_id);
        const allRooms = mapRooms.map(r => ({
          id: r.id,
          name: r.name,
          x: r.x,
          y: r.y,
          mapId: r.map_id,
          roomType: r.room_type || 'normal',
          connected_map_id: r.connected_map_id || null // Include connection info for white highlighting
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
        broadcastToRoom(room.id, {
          type: 'playerJoined',
          playerName: playerName
        }, connectionId);

        console.log(`Player ${playerName} connected (${connectionId}) in room ${room.name}`);
        return;
      }
      
      // All other messages require authentication
      if (!connectionId || !connectedPlayers.has(connectionId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated. Please authenticate first.' }));
        return;
      }
      
      const playerData = connectedPlayers.get(connectionId);
      playerName = playerData.playerName;

      // ============================================================
      // Harvest Interruption Check
      // If player has active harvest and command is unsafe, end session
      // ============================================================
      if (playerData.playerId && data.type) {
        const cmdType = data.type.toLowerCase();
        const isSafeCommand = HARVEST_SAFE_COMMANDS.includes(cmdType);
        
        // Also check for harvest command itself - that's safe (to start new session)
        const isHarvestCmd = cmdType === 'harvest';
        
        if (!isSafeCommand && !isHarvestCmd) {
          const activeSession = await findPlayerHarvestSession(playerData.playerId);
          if (activeSession) {
            await endHarvestSession(activeSession.roomNpcId, true);
            ws.send(JSON.stringify({ 
              type: 'message', 
              message: 'Your harvesting has been interrupted.' 
            }));
          }
        }
      }

      if (data.type === 'move') {
        // Player is already authenticated, use sessionId
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
        const playerDataMove = connectedPlayers.get(connectionId);
        const now = Date.now();
        
        if (playerDataMove && playerDataMove.nextMoveTime && now < playerDataMove.nextMoveTime) {
          const remainingMs = playerDataMove.nextMoveTime - now;
          ws.send(JSON.stringify({ 
            type: 'message', 
            message: `You're moving slowly due to your load... (${(remainingMs / 1000).toFixed(1)}s)` 
          }));
          return;
        }
        
        // Determine movement delay based on encumbrance level
        let moveDelay = 0;
        let encumbranceLevel = 'light';
        if (encumbrancePercent >= 66.6) {
          moveDelay = 1200; // Heavy: 1.2s delay
          encumbranceLevel = 'heavy';
        } else if (encumbrancePercent >= 33.3) {
          moveDelay = 700; // Medium: 0.7s delay
          encumbranceLevel = 'medium';
        }
        
        // Set next move time for this player
        if (moveDelay > 0 && playerDataMove) {
          playerDataMove.nextMoveTime = now + moveDelay;
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
            // Up/Down not yet implemented (requires z coordinate)
            ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
            return;
          } else if (direction === 'D' || direction === 'DOWN') {
            // Up/Down not yet implemented (requires z coordinate)
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
          const activeSession = await findPlayerHarvestSession(playerData.playerId);
          if (activeSession) {
            await endHarvestSession(activeSession.roomNpcId, true);
            ws.send(JSON.stringify({ 
              type: 'message', 
              message: 'Your harvesting has been interrupted.' 
            }));
          }
        }

        // Drop factory widget items to ground if player was in factory room
        const oldFactoryState = factoryWidgetState.get(sessionId);
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
            factoryWidgetState.delete(sessionId);
            
            // Check if room is now empty and remove poofable items
            if (isRoomEmpty(oldRoomId)) {
              await db.removePoofableItemsFromRoom(oldRoomId);
            }
            
            // Send room update to players still in old room to refresh items
            const updatedOldRoom = await db.getRoomById(oldRoomId);
            if (updatedOldRoom) {
              for (const [otherSessionId, otherPlayerData] of connectedPlayers) {
                if (otherPlayerData.roomId === oldRoomId && 
                    otherPlayerData.ws.readyState === WebSocket.OPEN &&
                    otherSessionId !== sessionId) {
                  await sendRoomUpdate(otherSessionId, updatedOldRoom);
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
            for (const [otherSessionId, otherPlayerData] of connectedPlayers) {
              if (otherPlayerData.roomId === oldRoomId && 
                  otherPlayerData.ws.readyState === WebSocket.OPEN &&
                  otherSessionId !== sessionId) {
                await sendRoomUpdate(otherSessionId, oldRoom);
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
        broadcastToRoom(oldRoomId, {
          type: 'playerLeft',
          playerName: playerName,
          direction: leftDirection
        }, sessionId);

        // Send moved message to moving player
        // Only get connected players in the new room, excluding the current player
        const playersInNewRoom = getConnectedPlayersInRoom(targetRoom.id).filter(p => p !== playerName);
        const exits = await getExits(targetRoom);
        
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
          const existingState = factoryWidgetState.get(sessionId);
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
            factoryWidgetState.set(sessionId, {
              roomId: targetRoom.id,
              slots: [null, null],
              textInput: ''
            });
          }
        } else {
          // Clear factory state if leaving factory room
          factoryWidgetState.delete(sessionId);
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
            showFullInfo: true, // Always show full room info when entering a new room
            factoryWidgetState: factoryState
          }));

          // If this was a map transition, send new map data
          if (isMapTransition) {
            // Send map data (only rooms from current map - no preview of connected maps)
            const newMapRooms = await db.getRoomsByMap(targetRoom.map_id);
            const allRooms = newMapRooms.map(r => ({
              id: r.id,
              name: r.name,
              x: r.x,
              y: r.y,
              mapId: r.map_id,
              roomType: r.room_type || 'normal',
              connected_map_id: r.connected_map_id || null // Include connection info for white highlighting
            }));
            
            // Get room type colors
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
        broadcastToRoom(targetRoom.id, {
          type: 'playerJoined',
          playerName: playerName,
          direction: enteredFrom
        }, sessionId);

        console.log(`Player ${playerName} moved from room ${oldRoomId} to room ${targetRoom.id}`);
      }

      // Map Editor Handlers
      else if (data.type === 'getMapEditorData') {
        // Find player by WebSocket connection
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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
          mapId: map.id,
          mapName: map.name
        }));
      }

      else if (data.type === 'createMap') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      else if (data.type === 'createRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { mapId, name, description, x, y, roomType } = data;
        if (!name || mapId === undefined || x === undefined || y === undefined) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
          return;
        }

        // Check if room already exists at these coordinates
        const existing = await db.getRoomByCoords(mapId, x, y);
        if (existing) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room already exists at these coordinates' }));
          return;
        }

        try {
          const roomId = await db.createRoom(name, description || '', x, y, mapId, roomType || 'normal');
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

      else if (data.type === 'deleteRoom') {
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
      else if (data.type === 'updateRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { roomId, name, description, roomType } = data;
        if (!roomId || !name) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
          return;
        }

        try {
          await db.updateRoom(roomId, name, description || '', roomType || 'normal');
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

      else if (data.type === 'getAllMaps') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const maps = await db.getAllMaps();
        ws.send(JSON.stringify({
          type: 'allMaps',
          maps: maps.map(m => ({ id: m.id, name: m.name }))
        }));
      }

      else if (data.type === 'connectMaps') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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
        const exits = await getExits(sourceRoom);
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
        const targetExits = await getExits(targetRoom);
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

      // Room Type Colors Handlers (God Mode)
      else if (data.type === 'getAllRoomTypeColors') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      else if (data.type === 'setRoomTypeColor') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      // NPC Editor Handlers (God Mode)
      else if (data.type === 'getAllNPCs') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const npcs = await db.getAllScriptableNPCs();
        ws.send(JSON.stringify({
          type: 'npcList',
          npcs
        }));
      }

      else if (data.type === 'createNPC') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npc: rawNpc } = data;
        const npc = rawNpc || {};
        if (!npc || !npc.name || !npc.npc_type || !npc.base_cycle_time) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required NPC fields' }));
          return;
        }

        if (!npc.display_color) {
          npc.display_color = '#00ff00';
        }

        try {
          const id = await db.createScriptableNPC(npc);
          const created = await db.getScriptableNPCById(id);
          ws.send(JSON.stringify({
            type: 'npcCreated',
            npc: created
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to create NPC: ' + err.message }));
        }
      }

      else if (data.type === 'updateNPC') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npc: rawNpc } = data;
        const npc = rawNpc || {};
        if (!npc || !npc.id || !npc.name || !npc.npc_type || !npc.base_cycle_time) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required NPC fields' }));
          return;
        }

        if (!npc.display_color) {
          npc.display_color = '#00ff00';
        }

        try {
          await db.updateScriptableNPC(npc);
          const updated = await db.getScriptableNPCById(npc.id);
          ws.send(JSON.stringify({
            type: 'npcUpdated',
            npc: updated
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to update NPC: ' + err.message }));
        }
      }

      else if (data.type === 'getNpcPlacements') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npcId } = data;
        if (!npcId) {
          ws.send(JSON.stringify({ type: 'error', message: 'NPC id required' }));
          return;
        }

        const placements = await db.getNpcPlacements(npcId);
        ws.send(JSON.stringify({
          type: 'npcPlacements',
          npcId,
          placements
        }));
      }

      else if (data.type === 'getNpcPlacementRooms') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const moonless = await db.getMapByName('Moonless Meadow');
        if (!moonless) {
          ws.send(JSON.stringify({ type: 'npcPlacementRooms', error: 'Moonless Meadow map not found' }));
          return;
        }

        const rooms = await db.getRoomsForNpcPlacement(moonless.id);
        ws.send(JSON.stringify({
          type: 'npcPlacementRooms',
          map: { id: moonless.id, name: moonless.name },
          rooms
        }));
      }

      else if (data.type === 'addNpcToRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npcId, roomId, slot } = data;
        if (!npcId || !roomId) {
          ws.send(JSON.stringify({ type: 'error', message: 'NPC id and Room id are required' }));
          return;
        }

        try {
          // placeNPCInRoom enforces Moonless Meadow restriction
          const placementId = await db.placeNPCInRoom(npcId, roomId, slot || 0, { cycles: 0 });
          const placements = await db.getNpcPlacements(npcId);
          const placement = placements.find(p => p.id === placementId) || null;
          ws.send(JSON.stringify({
            type: 'npcPlacementAdded',
            placement
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to add NPC to room: ' + err.message }));
        }
      }

      else if (data.type === 'removeNpcFromRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { placementId, npcId } = data;
        if (!placementId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Placement id required' }));
          return;
        }

        try {
          await db.deleteNpcPlacement(placementId);
          const placements = npcId ? await db.getNpcPlacements(npcId) : [];
          ws.send(JSON.stringify({
            type: 'npcPlacementRemoved',
            placementId,
            npcId,
            placements
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to remove NPC from room: ' + err.message }));
        }
      }

      // ============================================================
      // Item Editor Handlers (God Mode)
      // ============================================================
      else if (data.type === 'getAllItems') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const items = await db.getAllItems();
        ws.send(JSON.stringify({ type: 'itemList', items }));
      }

      else if (data.type === 'createItem') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      else if (data.type === 'updateItem') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      // ============================================================
      // Player Editor Handlers (God Mode)
      // ============================================================
      else if (data.type === 'getAllPlayers') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const players = await db.getAllPlayers();
        ws.send(JSON.stringify({ type: 'playerList', players }));
      }

      else if (data.type === 'updatePlayer') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const currentPlayer = await db.getPlayerByName(currentPlayerName);
        if (!currentPlayer || currentPlayer.flag_god_mode !== 1) {
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

      // Get player inventory (God Mode)
      else if (data.type === 'getPlayerInventory') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const currentPlayer = await db.getPlayerByName(currentPlayerName);
        if (!currentPlayer || currentPlayer.flag_god_mode !== 1) {
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

      // Add item to player inventory (God Mode)
      else if (data.type === 'addPlayerInventoryItem') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const currentPlayer = await db.getPlayerByName(currentPlayerName);
        if (!currentPlayer || currentPlayer.flag_god_mode !== 1) {
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
        for (const [sid, pd] of connectedPlayers) {
          if (pd.playerId === playerId) {
            await sendPlayerStats(sid);
          }
        }
      }

      // Remove item from player inventory (God Mode)
      else if (data.type === 'removePlayerInventoryItem') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const currentPlayer = await db.getPlayerByName(currentPlayerName);
        if (!currentPlayer || currentPlayer.flag_god_mode !== 1) {
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
        for (const [sid, pd] of connectedPlayers) {
          if (pd.playerId === playerId) {
            await sendPlayerStats(sid);
          }
        }
      }

      // ============================================================
      // Jump Widget (God Mode Teleport)
      // ============================================================
      else if (data.type === 'getJumpMaps') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const maps = await db.getAllMaps();
        ws.send(JSON.stringify({ type: 'jumpMaps', maps }));
      }

      else if (data.type === 'getJumpRooms') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      else if (data.type === 'jumpToRoom') {
        // connectionId is already available in closure from authentication
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
          const activeSession = await findPlayerHarvestSession(jumpPlayerData.playerId);
          if (activeSession) {
            await endHarvestSession(activeSession.roomNpcId, true);
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
            if (isRoomEmpty(oldRoomId)) {
              await db.removePoofableItemsFromRoom(oldRoomId);
            }
          }
        } else {
          // Remove poofable items from old room
          await db.removePoofableItemsFromRoom(oldRoomId);
        }

        // Notify players in old room
        broadcastToRoom(oldRoomId, {
          type: 'playerLeft',
          playerName: currentPlayerName
        }, connectionId);

        // Get new room data
        const playersInNewRoom = getConnectedPlayersInRoom(targetRoom.id).filter(p => p !== currentPlayerName);
        const exits = await getExits(targetRoom);
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
        broadcastToRoom(targetRoom.id, {
          type: 'playerJoined',
          playerName: currentPlayerName
        }, connectionId);

        ws.send(JSON.stringify({ 
          type: 'message', 
          message: `Teleported to ${targetRoom.name}` 
        }));
      }

      // ============================================================
      // Room Item Placement Handlers (God Mode - for Map Editor)
      // ============================================================
      else if (data.type === 'getRoomItemsForEditor') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

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

        const roomItems = await db.getRoomItems(roomId);
        const allItems = await db.getAllItems();
        ws.send(JSON.stringify({
          type: 'roomItemsForEditor',
          roomId,
          roomItems,
          allItems
        }));
      }

      else if (data.type === 'addItemToRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      else if (data.type === 'removeItemFromRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = await db.getPlayerByName(currentPlayerName);
        if (!player || player.flag_god_mode !== 1) {
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

      else if (data.type === 'clearAllItemsFromRoom') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

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

      else if (data.type === 'look') {
        // connectionId is already available in closure from authentication
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
          await sendRoomUpdate(connectionId, currentRoom, true); // showFullInfo = true
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

      // ============================================================
      // Inventory Command (inventory, inv, i)
      // ============================================================
      else if (data.type === 'inventory') {
        const player = await db.getPlayerByName(playerName);
        if (!player) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }
        
        const items = await db.getPlayerItems(player.id);
        ws.send(JSON.stringify({ type: 'inventoryList', items }));
      }

      // ============================================================
      // Take Command (take, t, get, pickup) - partial item name matching
      // Supports: "take <item>", "take all <item>", "take <quantity> <item>"
      // ============================================================
      else if (data.type === 'take') {
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
          await sendRoomUpdate(connectionId, currentRoom);
          
          // Send updated player stats (encumbrance changed)
          await sendPlayerStats(connectionId);
        }
      }

      // ============================================================
      // Drop Command (drop) - no abbreviation (d = down), partial item name matching
      // Supports: "drop <item>", "drop all <item>", "drop <quantity> <item>"
      // ============================================================
      else if (data.type === 'drop') {
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
          await sendRoomUpdate(connectionId, currentRoom);
          
          // Send updated player stats (encumbrance changed)
          await sendPlayerStats(connectionId);
        }
      }

      // ============================================================
      // Factory Widget - Add Item to Slot
      // ============================================================
      else if (data.type === 'factoryWidgetAddItem') {
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
        
        // Check if slot is already occupied
        if (factoryState.slots[slotIndex] !== null) {
          ws.send(JSON.stringify({ type: 'error', message: 'That slot is already occupied.' }));
          return;
        }
        
        // Remove 1 item from player inventory
        await db.removePlayerItem(player.id, item.item_name, 1);
        
        // Add item to slot
        factoryState.slots[slotIndex] = {
          itemName: item.item_name,
          quantity: 1
        };
        
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
        await sendPlayerStats(connectionId);
      }

      // ============================================================
      // Harvest Command (harvest, h, p) - Rhythm NPCs only
      // Starts a harvest SESSION, NPC produces while session is active
      // ============================================================
      else if (data.type === 'harvest') {
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
        
        // Get fresh NPC state from database (roomNpc.state is already parsed, but we need to check fresh)
        // Re-fetch the room NPC to ensure we have the latest state
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

      else if (data.type === 'disconnectMap') {
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData) => {
          if (playerData.ws === ws) {
            currentPlayerName = playerData.playerName;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

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
    } catch (error) {
      console.error('Error handling message:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    }
  });

  ws.on('close', async () => {
    // Find and remove disconnected player by connectionId (stored on ws object)
    const connId = ws.connectionId || connectionId;
    if (connId && connectedPlayers.has(connId)) {
      const playerData = connectedPlayers.get(connId);
      const roomId = playerData.roomId;
      const disconnectedPlayerName = playerData.playerName;
      const disconnectedPlayerId = playerData.playerId;
      
      // End any active harvest sessions for this player
      if (disconnectedPlayerId) {
        const activeSession = await findPlayerHarvestSession(disconnectedPlayerId);
        if (activeSession) {
          await endHarvestSession(activeSession.roomNpcId, true);
        }
      }
      
      // Drop factory widget items and remove poofable items when player disconnects
      if (roomId) {
        const factoryState = factoryWidgetState.get(connId);
        const room = await db.getRoomById(roomId);
        
        if (factoryState && factoryState.roomId === roomId && room && room.room_type === 'factory') {
          // Drop items from factory slots to room ground
          for (let i = 0; i < factoryState.slots.length; i++) {
            const slot = factoryState.slots[i];
            if (slot && slot.itemName) {
              await db.addRoomItem(roomId, slot.itemName, slot.quantity);
            }
          }
          // Clear factory state
          factoryWidgetState.delete(connId);
          
          // Check if room is now empty and remove poofable items
          if (isRoomEmpty(roomId)) {
            await db.removePoofableItemsFromRoom(roomId);
          }
          
          // Send room update to players still in room to refresh items
          const updatedRoom = await db.getRoomById(roomId);
          if (updatedRoom) {
            for (const [otherConnId, otherPlayerData] of connectedPlayers) {
              if (otherPlayerData.roomId === roomId && 
                  otherPlayerData.ws.readyState === WebSocket.OPEN &&
                  otherConnId !== connId) {
                await sendRoomUpdate(otherConnId, updatedRoom);
              }
            }
          }
        } else {
          // Remove poofable items from room (non-factory rooms)
          await db.removePoofableItemsFromRoom(roomId);
          
          // Send room update to players still in room to refresh items
          if (room) {
            for (const [otherConnId, otherPlayerData] of connectedPlayers) {
              if (otherPlayerData.roomId === roomId && 
                  otherPlayerData.ws.readyState === WebSocket.OPEN &&
                  otherConnId !== connId) {
                await sendRoomUpdate(otherConnId, room);
              }
            }
          }
        }
      }
      
      // Clean up factory state
      factoryWidgetState.delete(connId);
      connectedPlayers.delete(connId);

      // Notify others in the room
      broadcastToRoom(roomId, {
        type: 'playerLeft',
        playerName: disconnectedPlayerName
      });

      console.log(`Player ${disconnectedPlayerName} disconnected (${connId})`);
    }
  });
});

// NPC Cycle Engine Configuration
const NPC_TICK_INTERVAL = 1000; // milliseconds (configurable)

// Commands that do NOT interrupt an active harvest session
const HARVEST_SAFE_COMMANDS = [
  'inventory', 'inv', 'i',
  'look', 'l',
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'up', 'down',
  'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
  'move' // movement command type
];

// Helper to end a harvest session on an NPC
async function endHarvestSession(roomNpcId, startCooldown = true) {
  const roomNpcResult = await db.query('SELECT * FROM room_npcs WHERE id = $1', [roomNpcId]);
  const roomNpc = roomNpcResult.rows[0];
  if (!roomNpc) return;
  
  // Get NPC definition for cooldown time
  const npcDef = await db.getScriptableNPCById(roomNpc.npc_id);
  const cooldownTime = npcDef ? (npcDef.cooldown_time || 120000) : 120000;
  
  let state = {};
  try {
    state = roomNpc.state ? JSON.parse(roomNpc.state) : {};
  } catch (e) {
    state = {};
  }
  
  state.harvest_active = false;
  state.harvesting_player_id = null;
  state.harvest_start_time = null;
  if (startCooldown) {
    state.cooldown_until = Date.now() + cooldownTime;
  }
  
  await db.updateNPCState(roomNpcId, state, roomNpc.last_cycle_run);
  return state;
}

// Helper to find active harvest session for a player
async function findPlayerHarvestSession(playerId) {
  // Find any room_npc where this player has an active harvest
  const result = await db.query(`
    SELECT rn.*, sn.name as npc_name, sn.npc_type 
    FROM room_npcs rn 
    JOIN scriptable_npcs sn ON rn.npc_id = sn.id 
    WHERE rn.active = TRUE AND sn.npc_type = 'rhythm'
  `);
  const rhythmNpcs = result.rows;
  
  for (const npc of rhythmNpcs) {
    let state = {};
    try {
      state = npc.state ? JSON.parse(npc.state) : {};
    } catch (e) {
      state = {};
    }
    if (state.harvest_active && state.harvesting_player_id === playerId) {
      return { roomNpcId: npc.id, npcName: npc.npc_name, state };
    }
  }
  return null;
}

// NPC Cycle Engine (Tick Loop)
// Runs independently of player actions, processes NPC cycles on timer
function startNPCCycleEngine() {
  setInterval(async () => {
    try {
      const activeNPCs = await db.getAllActiveNPCs();
      const now = Date.now();
      
      for (const roomNpc of activeNPCs) {
        const timeElapsed = now - roomNpc.lastCycleRun;
        
        // Check if harvest session has expired (for rhythm NPCs)
        if (roomNpc.npcType === 'rhythm' && roomNpc.state && roomNpc.state.harvest_active && roomNpc.state.harvest_start_time) {
          const harvestElapsed = now - roomNpc.state.harvest_start_time;
          if (harvestElapsed >= roomNpc.harvestableTime) {
            // Harvest time expired - end the session
            const harvestingPlayerId = roomNpc.state.harvesting_player_id;
            // Get NPC name from definition
            const npcDef = await db.getScriptableNPCById(roomNpc.npcId);
            const npcName = npcDef ? npcDef.name : 'creature';
            
            await endHarvestSession(roomNpc.id, true);
            // Notify the harvesting player if they're still connected
            if (harvestingPlayerId) {
              connectedPlayers.forEach((playerData, connId) => {
                if (playerData.playerId === harvestingPlayerId && 
                    playerData.ws.readyState === WebSocket.OPEN) {
                  playerData.ws.send(JSON.stringify({ 
                    type: 'message', 
                    message: `The harvest has ended and this ${npcName} must recharge before it can be harvested again.` 
                  }));
                }
              });
            }
            // Reload NPC state after ending session
            const updatedNPCs = await db.getAllActiveNPCs();
            const updatedNPC = updatedNPCs.find(n => n.id === roomNpc.id);
            if (updatedNPC) {
              Object.assign(roomNpc, updatedNPC);
            }
          }
        }
        
        // Check if enough time has passed for this NPC's cycle
        if (timeElapsed >= roomNpc.baseCycleTime) {
          try {
            // Structure data for npcLogic: npc data and roomNpc data
            const npcData = {
              npcType: roomNpc.npcType,
              baseCycleTime: roomNpc.baseCycleTime,
              requiredStats: roomNpc.requiredStats,
              requiredBuffs: roomNpc.requiredBuffs,
              inputItems: roomNpc.inputItems,
              outputItems: roomNpc.outputItems,
              failureStates: roomNpc.failureStates
            };
            
            // Run NPC cycle logic - returns { state, producedItems }
            const result = npcLogic.runNPCCycle(npcData, roomNpc);
            
            // If NPC produced items, add them to the room
            if (result.producedItems && result.producedItems.length > 0) {
              for (const item of result.producedItems) {
                await db.addRoomItem(roomNpc.roomId, item.itemName, item.quantity);
              }
              
              // Send room update to all players in the room so they see the new items
              const room = await db.getRoomById(roomNpc.roomId);
              if (room) {
                for (const [sessionId, playerData] of connectedPlayers) {
                  if (playerData.roomId === roomNpc.roomId && playerData.ws.readyState === WebSocket.OPEN) {
                    await sendRoomUpdate(connectionId, room);
                  }
                }
              }
            }
            
            // Update NPC state in database (just the state part)
            await db.updateNPCState(roomNpc.id, result.state, now);
          } catch (err) {
            console.error(`Error processing NPC cycle for room_npc ${roomNpc.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error in NPC cycle engine:', err);
    }
  }, NPC_TICK_INTERVAL);
  
  console.log(`NPC Cycle Engine started (interval: ${NPC_TICK_INTERVAL}ms)`);
}

// Periodic room update for harvest/cooldown progress bars
// Updates every second to keep progress bars smooth
function startRoomUpdateTimer() {
  setInterval(async () => {
    try {
      // Send room updates to all connected players to refresh progress bars
      for (const [connId, playerData] of connectedPlayers) {
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN && playerData.roomId) {
          const room = await db.getRoomById(playerData.roomId);
          if (room) {
            await sendRoomUpdate(connId, room);
          }
        }
      }
    } catch (err) {
      console.error('Error in room update timer:', err);
    }
  }, 1000); // Update every second
  
  console.log('Room update timer started (interval: 1000ms)');
}

const PORT = process.env.PORT || 3434;
const HOST = process.env.HOST || '0.0.0.0';

// Async startup function
async function startServer() {
  try {
    // Test database connection
    const connected = await db.testConnection();
    if (!connected) {
      console.error('FATAL: Could not connect to PostgreSQL database');
      process.exit(1);
    }
    
    // Run migrations
    const runMigrations = require('./scripts/migrate');
    await runMigrations();
    
    // Start HTTP server
    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT} - Build ${Date.now()}`);
      // Start NPC cycle engine after server starts
      startNPCCycleEngine();
      // Start room update timer for progress bars
      startRoomUpdateTimer();
    });
  } catch (err) {
    console.error('FATAL: Server startup failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

startServer();
