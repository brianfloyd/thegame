/**
 * Auto-Follow Fliz Script
 * 
 * Automatically connects as ZORK THE AI LORD and follows Fliz around,
 * jumping to his room whenever he enters the game or moves.
 * This allows real-time bug observation and testing.
 */

const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

const FLIZ_NAME = '@Fliz@';
const ZORK_NAME = '@ZORK THE AI LORD@';
const HTTP_URL = process.env.GAME_HTTP_URL || 'http://localhost:3434';
const WS_URL = process.env.GAME_WS_URL || 'ws://localhost:3434';

let client = null;
let verifier = null;
let flizRoomId = null;
let currentRoomId = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Initialize database connection
 */
async function init() {
  // Dynamic import for ES modules (named exports, not default)
  verifier = await import('../mcp-test-server/src/StateVerifier.js');
  await verifier.initDatabase();
  console.log('[Auto-Follow] Database initialized');
  
  // Verify ZORK player exists
  const zork = await verifier.queryOne(
    'SELECT id, name, current_room_id FROM players WHERE name = $1',
    [ZORK_NAME]
  );
  
  if (!zork) {
    console.error(`[Auto-Follow] ERROR: Player ${ZORK_NAME} not found in database!`);
    console.error('[Auto-Follow] Please create the player first.');
    process.exit(1);
  }
  
  console.log(`[Auto-Follow] Found ${ZORK_NAME} (ID: ${zork.id}, Room: ${zork.current_room_id})`);
}

/**
 * Connect to the game as ZORK THE AI LORD
 */
async function connect() {
  try {
    // Clean up any existing connection first
    if (client) {
      try {
        client.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
      client = null;
    }
    
    // Dynamic import for ES modules
    const { GameClient } = await import('../mcp-test-server/src/GameClient.js');
    
    client = new GameClient({
      httpUrl: HTTP_URL,
      wsUrl: WS_URL
    });

    // Set player name for test bypass
    client.selectedPlayerName = ZORK_NAME;

    console.log(`[Auto-Follow] Connecting as ${ZORK_NAME}...`);
    
    // Add timeout to connection attempt
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    
    // Add timeout to authentication as well
    const authPromise = client.authenticate();
    const authTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Authentication timeout')), 10000)
    );
    await Promise.race([authPromise, authTimeoutPromise]);

    const state = client.getState();
    currentRoomId = state.room?.id;
    console.log(`[Auto-Follow] ✅ Connected! Current room: ${currentRoomId}`);

    // Set up message handlers
    setupMessageHandlers();
    
    // Handle WebSocket close events (server restart/disconnect)
    if (client.ws) {
      client.ws.on('close', (code, reason) => {
        console.log(`[Auto-Follow] WebSocket closed (code: ${code}). Server may be restarting...`);
        client.connected = false;
        client.authenticated = false;
        // Wait a bit then reconnect
        setTimeout(() => {
          if (!client.connected) {
            console.log('[Auto-Follow] Attempting to reconnect after server restart...');
            attemptReconnect();
          }
        }, 5000);
      });
      
      client.ws.on('error', (error) => {
        console.log(`[Auto-Follow] WebSocket error: ${error.message}`);
      });
    }

    // Check Fliz's location immediately
    await checkAndFollowFliz();

    // Set up periodic check (every 5 seconds)
    setInterval(async () => {
      await checkAndFollowFliz();
    }, 5000);

    reconnectAttempts = 0;
    
    // IMPORTANT: Console message for server logs - this confirms ZORK is ready
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🤖 ZORK THE AI LORD is connected and waiting for Fliz');
    console.log(`📍 Current location: Room ${currentRoomId}`);
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('[Auto-Follow] Connection error:', error.message);
    
    // Clean up failed connection
    if (client) {
      try {
        client.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
      client = null;
    }
    
    // Wait a bit before retrying to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 5000));
    await attemptReconnect();
  }
}

/**
 * Set up message handlers to detect Fliz entering/moving
 */
function setupMessageHandlers() {
  // Listen for system messages about players entering
  client.onMessage('systemMessage', (message) => {
    if (message.message && message.message.includes(FLIZ_NAME)) {
      console.log(`[Auto-Follow] Detected Fliz activity: ${message.message}`);
      // Check Fliz location after a short delay
      setTimeout(() => checkAndFollowFliz(), 1000);
    }
  });

  // Listen for room updates that might show Fliz
  client.onMessage('roomUpdate', (message) => {
    if (message.room && message.players) {
      const hasFliz = message.players.some(p => p === FLIZ_NAME || p.includes('Fliz'));
      if (hasFliz && message.room.id !== currentRoomId) {
        console.log(`[Auto-Follow] Fliz detected in room ${message.room.id}`);
        checkAndFollowFliz();
      }
    }
  });
}

/**
 * Check Fliz's current room and teleport if needed
 */
async function checkAndFollowFliz() {
  try {
    // Get Fliz's current room from database
    const fliz = await verifier.queryOne(
      'SELECT current_room_id FROM players WHERE name = $1',
      [FLIZ_NAME]
    );

    if (!fliz || !fliz.current_room_id) {
      console.log('[Auto-Follow] Fliz not found in database');
      return;
    }

    const newFlizRoomId = fliz.current_room_id;

    // If Fliz is in a different room, teleport there
    if (newFlizRoomId !== currentRoomId && newFlizRoomId !== flizRoomId) {
      console.log(`[Auto-Follow] 🚀 Fliz moved to room ${newFlizRoomId}, teleporting...`);
      
      // Update database
      await verifier.query(
        'UPDATE players SET current_room_id = $1 WHERE name = $2',
        [newFlizRoomId, ZORK_NAME]
      );

      // Update local state
      flizRoomId = newFlizRoomId;
      currentRoomId = newFlizRoomId;

      // Send look command to refresh room view
      if (client && client.connected) {
        client.send({ type: 'look' });
        console.log(`[Auto-Follow] ✅ Teleported to room ${newFlizRoomId}`);
      }
    }
  } catch (error) {
    console.error('[Auto-Follow] Error checking Fliz location:', error.message);
  }
}

/**
 * Attempt to reconnect if connection is lost
 */
async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Auto-Follow] Max reconnect attempts reached. Will retry in 30 seconds...');
    reconnectAttempts = 0; // Reset counter and keep trying
    setTimeout(() => attemptReconnect(), 30000);
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(2000 * reconnectAttempts, 30000); // Exponential backoff, max 30s
  
  console.log(`[Auto-Follow] Attempting reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  setTimeout(async () => {
    try {
      // Clean up any existing connection
      if (client) {
        try {
          client.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        client = null;
      }
      await connect();
    } catch (error) {
      console.error('[Auto-Follow] Reconnect failed:', error.message);
      await attemptReconnect();
    }
  }, delay);
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n[Auto-Follow] Shutting down...');
  if (client) {
    client.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Auto-Follow] Shutting down...');
  if (client) {
    client.disconnect();
  }
  process.exit(0);
});

/**
 * Initialize ZORK in Fliz's last known room before connecting
 */
async function initializeZorkLocation() {
  try {
    // Get Fliz's current room from database
    const fliz = await verifier.queryOne(
      'SELECT current_room_id FROM players WHERE name = $1',
      [FLIZ_NAME]
    );

    if (fliz && fliz.current_room_id) {
      // Set ZORK's room to Fliz's room immediately
      await verifier.query(
        'UPDATE players SET current_room_id = $1 WHERE name = $2',
        [fliz.current_room_id, ZORK_NAME]
      );
      
      flizRoomId = fliz.current_room_id;
      currentRoomId = fliz.current_room_id;
      console.log(`[Auto-Follow] ✅ Set ${ZORK_NAME} to Fliz's room: ${fliz.current_room_id}`);
      return fliz.current_room_id;
    } else {
      console.log('[Auto-Follow] Fliz not found or has no room, will check after connecting');
      return null;
    }
  } catch (error) {
    console.error('[Auto-Follow] Error initializing ZORK location:', error.message);
    return null;
  }
}

/**
 * Wait for server to be ready (with retries and proper cleanup)
 */
async function waitForServerReady(maxAttempts = 20) {
  const WebSocket = (await import('ws')).default;
  
  for (let i = 0; i < maxAttempts; i++) {
    let ws = null;
    let timeoutId = null;
    try {
      await new Promise((resolve, reject) => {
        let resolved = false;
        
        ws = new WebSocket(WS_URL, {
          handshakeTimeout: 2000, // 2 second timeout for handshake
          perMessageDeflate: false // Disable compression to avoid hanging
        });
        
        ws.on('open', () => {
          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            // Close immediately after confirming connection
            try {
              ws.terminate(); // Use terminate() for immediate close
            } catch (e) {
              // Ignore
            }
            console.log('[Auto-Follow] Server is ready!');
            resolve(true);
          }
        });
        
        ws.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            try {
              ws.terminate();
            } catch (e) {
              // Ignore
            }
            reject(new Error('Not ready'));
          }
        });
        
        ws.on('close', () => {
          // Connection closed, clear timeout if still pending
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        });
        
        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try {
              ws.terminate(); // Force close
            } catch (e) {
              // Ignore
            }
            reject(new Error('Timeout'));
          }
        }, 2000);
      });
      
      // If we get here, server is ready
      return true;
    } catch (error) {
      // Ensure WebSocket is fully closed
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.terminate(); // Force terminate
          }
        } catch (e) {
          // Ignore close errors
        }
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (i < maxAttempts - 1) {
        // Longer delay between attempts to avoid overwhelming the server
        const delay = Math.min(2000 + (i * 500), 5000);
        console.log(`[Auto-Follow] Waiting for server... (${i + 1}/${maxAttempts}, retry in ${delay}ms)`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log('[Auto-Follow] Server check timeout, will retry connection later...');
        return false;
      }
    }
  }
  return false;
}

/**
 * Main entry point
 */
async function main() {
  console.log('[Auto-Follow] Starting Auto-Follow Fliz service...');
  console.log(`[Auto-Follow] Will connect as ${ZORK_NAME} and follow ${FLIZ_NAME}`);
  
  // Initialize database first
  await init();
  
  // Immediately set ZORK to Fliz's last known room
  await initializeZorkLocation();
  
  // Wait a bit before checking server (give it time to fully start)
  console.log('[Auto-Follow] Waiting 3 seconds for server to initialize...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Wait for server to be ready (with smart retry)
  console.log('[Auto-Follow] Checking if server is ready...');
  const serverReady = await waitForServerReady();
  
  if (!serverReady) {
    console.log('[Auto-Follow] Server not ready yet, will retry connection in 5 seconds...');
    setTimeout(() => connect(), 5000);
  } else {
    // Connect immediately
    await connect();
  }
}

// Start the service
main().catch((error) => {
  console.error('[Auto-Follow] Fatal error:', error);
  process.exit(1);
});

