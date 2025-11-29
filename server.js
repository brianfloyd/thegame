/**
 * Game Server - Main Entry Point
 * 
 * Sets up Express server, WebSocket server, and wires together all modules.
 * This is the main server file that imports handlers, middleware, and services.
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Database module (async PostgreSQL)
const db = require('./database');

// NPC logic module
const npcLogic = require('./npcLogic');

// Middleware
const {
  sessionStore,
  cleanupExpiredSessions,
  createSessionMiddleware,
  createValidateSession,
  createOptionalSession,
  checkGodMode,
  createCharacterSelectionHandler,
  getSessionFromRequest
} = require('./middleware/session');

// Routes
const { setupRoutes } = require('./routes/api');

// Handlers
const { dispatch } = require('./handlers');
const { cleanupLoreKeeperEngagement } = require('./handlers/game');

// Services
const { 
  startNPCCycleEngine, 
  startRoomUpdateTimer,
  findPlayerHarvestSession,
  endHarvestSession
} = require('./services/npcCycleEngine');

// Broadcast utilities
const { sendRoomUpdate, isRoomEmpty, broadcastToAll } = require('./utils/broadcast');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Parse cookies and JSON bodies
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
const sessionMiddleware = createSessionMiddleware();
app.use(sessionMiddleware);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Session cleanup job - every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// Create middleware instances with db
const validateSession = createValidateSession(db);
const optionalSession = createOptionalSession(db);
const characterSelectionHandler = createCharacterSelectionHandler(db);

// Setup routes
setupRoutes(app, {
  db,
  validateSession,
  optionalSession,
  checkGodMode,
  characterSelectionHandler
});

// ============================================================
// Shared State
// ============================================================

// Track connected players: connectionId -> { ws, roomId, playerName, playerId, sessionId }
const connectedPlayers = new Map();
let nextConnectionId = 1;

// Track factory widget state per player: connectionId -> { roomId, slots, textInput }
const factoryWidgetState = new Map();

// Track warehouse widget state per player: connectionId -> { roomId, warehouseLocationKey, items, capacity, deeds }
const warehouseWidgetState = new Map();

// ============================================================
// WebSocket Connection Handling
// ============================================================

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  let connectionId = null;
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
      
      // Build context for handlers
      const ctx = {
        ws,
        db,
        connectedPlayers,
        factoryWidgetState,
        warehouseWidgetState,
        connectionId,
        sessionId,
        playerName,
        session,
        nextConnectionId
      };
      
      // Dispatch to appropriate handler
      const result = await dispatch(ctx, data);
      
      // Handle authenticateSession result (sets connectionId)
      if (data.type === 'authenticateSession' && result && result.authenticated) {
        connectionId = result.connectionId;
        nextConnectionId = ctx.nextConnectionId;
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
        const activeSession = await findPlayerHarvestSession(db, disconnectedPlayerId);
        if (activeSession) {
          await endHarvestSession(db, activeSession.roomNpcId, true);
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
          if (isRoomEmpty(connectedPlayers, roomId)) {
            await db.removePoofableItemsFromRoom(roomId);
          }
          
          // Send room update to players still in room to refresh items
          const updatedRoom = await db.getRoomById(roomId);
          if (updatedRoom) {
            for (const [otherConnId, otherPlayerData] of connectedPlayers) {
              if (otherPlayerData.roomId === roomId && 
                  otherPlayerData.ws.readyState === WebSocket.OPEN &&
                  otherConnId !== connId) {
                await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, updatedRoom);
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
                await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, otherConnId, room);
              }
            }
          }
        }
      }
      
      // Clean up factory state and Lore Keeper engagement timers
      factoryWidgetState.delete(connId);
      cleanupLoreKeeperEngagement(connId);
      connectedPlayers.delete(connId);

      // Notify others in the room
      const { broadcastToRoom } = require('./utils/broadcast');
      broadcastToRoom(connectedPlayers, roomId, {
        type: 'playerLeft',
        playerName: disconnectedPlayerName
      });

      // Broadcast system message: player left the game
      broadcastToAll(connectedPlayers, {
        type: 'systemMessage',
        message: `${disconnectedPlayerName} has left the game.`
      });

      console.log(`Player ${disconnectedPlayerName} disconnected (${connId})`);
    }
  });
});

// ============================================================
// Server Startup
// ============================================================

const PORT = process.env.PORT || 3434;
const HOST = process.env.HOST || '0.0.0.0';

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
    
    // Create wrapper function for sendRoomUpdate that includes all required parameters
    const sendRoomUpdateWrapper = async (connId, room) => {
      await sendRoomUpdate(connectedPlayers, factoryWidgetState, warehouseWidgetState, db, connId, room);
    };
    
    // Start HTTP server
    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT} - Build ${Date.now()}`);
      
      // Start NPC cycle engine after server starts
      startNPCCycleEngine(db, npcLogic, connectedPlayers, sendRoomUpdateWrapper);
      
      // Start room update timer for progress bars
      startRoomUpdateTimer(db, connectedPlayers, sendRoomUpdateWrapper);
    });
  } catch (err) {
    console.error('FATAL: Server startup failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

startServer();
