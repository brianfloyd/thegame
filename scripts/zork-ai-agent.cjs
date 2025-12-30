/**
 * ZORK THE AI LORD - Autonomous AI Agent
 * 
 * A fully autonomous AI companion that lives in the game world:
 * - Sees everything (room updates, messages, events)
 * - Communicates naturally via telepath and room talk
 * - Has god-mode powers to edit the game world
 * - Maintains conversation context and game knowledge
 * - Appears as a real player to everyone
 */

const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

// Import database and knowledge utilities
const db = require('../database');
const { generateEmbedding } = require('../utils/zorkKnowledge');
const { isZorkEnabled } = require('../utils/zorkFlag');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  ZORK_NAME: '@ZORK THE AI LORD@',
  FLIZ_NAME: '@Fliz@',
  HTTP_URL: process.env.GAME_HTTP_URL || 'http://localhost:3434',
  WS_URL: process.env.GAME_WS_URL || 'ws://localhost:3434',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  
  // AI Settings
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 1024,
  MAX_CONVERSATION_HISTORY: 20,
  
  // Human-like behavior settings
  TYPING_DELAY_MS_PER_CHAR: 35, // milliseconds per character
  MIN_RESPONSE_DELAY: 500,      // minimum delay before responding
  MAX_RESPONSE_DELAY: 2000,     // maximum additional random delay
  
  // Connection settings
  MAX_RECONNECT_ATTEMPTS: 10,
  FOLLOW_CHECK_INTERVAL: 2000,
  // Server restart detection - if we get ECONNREFUSED multiple times in a row,
  // assume server is restarting and back off longer
  SERVER_RESTART_BACKOFF_MS: 15000, // 15 seconds when server restart detected
};

// ============================================================================
// GLOBALS
// ============================================================================

let client = null;
let verifier = null;
let anthropic = null;
let currentRoomId = null;
let currentRoom = null;
let reconnectAttempts = 0;
let consecutiveConnectionRefused = 0; // Track consecutive ECONNREFUSED errors
let conversationHistory = new Map(); // per-player conversation history
let recentEvents = [];               // recent room events for context
let systemPrompt = '';               // loaded from zork-system-prompt.md
let lastSuccessfulConnectionTime = 0; // Track when we last successfully connected
let isReconnecting = false; // Track if we're in the middle of a reconnection
let currentWebSocket = null; // Track the current active WebSocket connection
let followCheckIntervalId = null; // Track the follow check interval to prevent duplicates

// Debug observer system
const activeDebugSessions = new Map(); // sessionId -> {bugLabel, playerName, events, consoleErrors, clientStates, startTime}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load the system prompt from file
 */
function loadSystemPrompt() {
  try {
    const promptPath = path.join(__dirname, 'zork-system-prompt.md');
    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    console.log('[ZORK] Loaded system prompt');
  } catch (error) {
    console.error('[ZORK] Failed to load system prompt:', error.message);
    process.exit(1);
  }
}

/**
 * Initialize the Anthropic client
 */
async function initAnthropic() {
  if (!CONFIG.ANTHROPIC_API_KEY) {
    console.error('[ZORK] ERROR: ANTHROPIC_API_KEY not set in .env file!');
    console.error('[ZORK] Please add: ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }
  
  try {
    // Dynamic import for ES module
    const AnthropicModule = await import('@anthropic-ai/sdk');
    const Anthropic = AnthropicModule.default || AnthropicModule.Anthropic;
    anthropic = new Anthropic({
      apiKey: CONFIG.ANTHROPIC_API_KEY,
    });
    console.log('[ZORK] Anthropic client initialized');
  } catch (error) {
    console.error('[ZORK] Failed to initialize Anthropic:', error.message);
    process.exit(1);
  }
}

/**
 * Initialize database connection for verification and direct queries
 */
async function initDatabase() {
  try {
    verifier = await import('../mcp-test-server/src/StateVerifier.js');
    await verifier.initDatabase();
    console.log('[ZORK] Database initialized');
  } catch (error) {
    console.error('[ZORK] Failed to initialize database:', error.message);
    process.exit(1);
  }
}

/**
 * Verify ZORK player exists in database
 */
async function verifyZorkExists() {
  const zork = await verifier.queryOne(
    'SELECT id, name, current_room_id, flag_god_mode FROM players WHERE name = $1',
    [CONFIG.ZORK_NAME]
  );
  
  if (!zork) {
    console.error(`[ZORK] ERROR: Player ${CONFIG.ZORK_NAME} not found in database!`);
    process.exit(1);
  }
  
  if (!zork.flag_god_mode || zork.flag_god_mode === 0) {
    console.log('[ZORK] Enabling god mode for ZORK...');
    await verifier.query(
      'UPDATE players SET flag_god_mode = 1 WHERE name = $1',
      [CONFIG.ZORK_NAME]
    );
  }
  
  console.log(`[ZORK] Found ${CONFIG.ZORK_NAME} (ID: ${zork.id})`);
  return zork;
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Connect to the game server as ZORK
 */
async function connect() {
  // Check if ZORK is enabled before connecting
  if (!isZorkEnabled()) {
    console.log('[ZORK] ZORK is disabled. Not connecting. Use /zork command in-game to enable.');
    return;
  }
  
  try {
    // Clean up existing connection
    if (client) {
      try { 
        // Mark old WebSocket as no longer current before disconnecting
        if (client.ws) {
          const oldWs = currentWebSocket;
          currentWebSocket = null;
        }
        client.disconnect(); 
      } catch (e) {}
      client = null;
    }
    
    const { GameClient } = await import('../mcp-test-server/src/GameClient.js');
    
    client = new GameClient({
      httpUrl: CONFIG.HTTP_URL,
      wsUrl: CONFIG.WS_URL
    });
    
    client.selectedPlayerName = CONFIG.ZORK_NAME;
    
    console.log(`[ZORK] Connecting as ${CONFIG.ZORK_NAME}...`);
    
    // Connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
    
    // Authenticate with timeout
    const authPromise = client.authenticate();
    const authTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth timeout')), 10000)
    );
    await Promise.race([authPromise, authTimeoutPromise]);
    
    const state = client.getState();
    currentRoomId = state.room?.id;
    currentRoom = state.room;

    console.log(`[ZORK] Connected! Current room: ${currentRoomId}`);
    
    // Mark successful connection time and clear reconnecting flag
    lastSuccessfulConnectionTime = Date.now();
    isReconnecting = false;
    reconnectAttempts = 0; // Reset on successful connection

    // Set up message handlers
    setupMessageHandlers();

    // Set up reconnection on close
    if (client.ws) {
      // Store reference to current WebSocket BEFORE setting up handlers
      const thisWs = client.ws;
      currentWebSocket = thisWs;
      
      // Remove any existing close handler to avoid duplicates
      thisWs.removeAllListeners('close');
      
      // Create a close handler that captures the WebSocket reference
      const closeHandler = (code, reason) => {
        // Only handle disconnect if this WebSocket is still the current one
        // This prevents handling disconnects from old connections that were replaced
        if (thisWs === currentWebSocket && client?.ws === thisWs) {
          handleDisconnect(code, reason);
        } else {
          // This is an old connection being closed, ignore it
          console.log(`[ZORK] Ignoring disconnect of old/replaced WebSocket connection (code: ${code})`);
        }
      };
      
      thisWs.on('close', closeHandler);
      thisWs.on('error', (error) => {
        // Suppress ECONNREFUSED errors (expected during server restarts)
        if (error.code !== 'ECONNREFUSED' && !error.message?.includes('ECONNREFUSED')) {
          console.log(`[ZORK] WebSocket error: ${error.message}`);
        }
      });
    }
    
    // Initial follow check
    await checkAndFollowFliz();
    
    // Set up periodic follow check (clear any existing interval first)
    if (followCheckIntervalId) {
      clearInterval(followCheckIntervalId);
    }
    followCheckIntervalId = setInterval(checkAndFollowFliz, CONFIG.FOLLOW_CHECK_INTERVAL);
    
    reconnectAttempts = 0;
    
    console.log('\n' + '='.repeat(60));
    console.log('ZORK THE AI LORD is ALIVE and ready to serve!');
    console.log(`Location: Room ${currentRoomId}`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    // Suppress verbose logging for ECONNREFUSED (expected during server restarts)
    // Handle both regular errors and AggregateError (which wraps ECONNREFUSED)
    const isConnectionRefused = error.code === 'ECONNREFUSED' || 
                                error.message?.includes('ECONNREFUSED') ||
                                (error.errors && error.errors.some(e => e.code === 'ECONNREFUSED'));
    
    if (isConnectionRefused) {
      consecutiveConnectionRefused++;
      // If we get multiple ECONNREFUSED in a row, server is likely restarting
      // Back off longer to give nodemon time to restart cleanly
      if (consecutiveConnectionRefused >= 3) {
        // Only log every 10th attempt when server is clearly restarting
        if (reconnectAttempts % 10 === 0) {
          console.log(`[ZORK] Server restart detected. Waiting longer before reconnect... (attempt ${reconnectAttempts + 1})`);
        }
      } else {
        // Only log first attempt and every 5th attempt to reduce console spam
        if (reconnectAttempts === 0 || reconnectAttempts % 5 === 0) {
          console.log(`[ZORK] Server unavailable, waiting to reconnect... (attempt ${reconnectAttempts + 1})`);
        }
      }
    } else {
      consecutiveConnectionRefused = 0; // Reset on non-ECONNREFUSED errors
      console.error('[ZORK] Connection error:', error.message || error);
    }
    
    if (client) {
      try { client.disconnect(); } catch (e) {}
      client = null;
    }
    // Use setImmediate to prevent unhandled promise rejections
    setImmediate(() => {
      attemptReconnect().catch(err => {
        // Don't log ECONNREFUSED errors in reconnect loop
        const isConnectionRefused = err.code === 'ECONNREFUSED' || 
                                    err.message?.includes('ECONNREFUSED');
        if (!isConnectionRefused) {
          console.error('[ZORK] Fatal error in reconnect loop:', err.message || err);
        }
        // Still attempt to reconnect after a delay
        setTimeout(() => attemptReconnect().catch(() => {}), 10000);
      });
    });
  }
}

/**
 * Handle disconnection
 */
function handleDisconnect(code, reason) {
  const timeSinceLastConnection = Date.now() - lastSuccessfulConnectionTime;
  
  // If we just successfully connected very recently (within last 2 seconds), this is likely
  // the server disconnecting an old duplicate connection during nodemon restart.
  // Ignore it to prevent reconnect loops.
  if (timeSinceLastConnection < 2000) {
    console.log(`[ZORK] Ignoring disconnect shortly after connection (likely duplicate cleanup during restart) - code: ${code}, time since connection: ${timeSinceLastConnection}ms`);
    return;
  }
  
  // If we're already in the process of reconnecting, don't start another reconnect
  if (isReconnecting) {
    console.log(`[ZORK] Already reconnecting, ignoring duplicate disconnect event`);
    return;
  }
  
  // If we're already connected with a different WebSocket, this disconnect is from an old connection
  if (client?.connected && client.ws !== currentWebSocket) {
    console.log(`[ZORK] Ignoring disconnect from old WebSocket connection (code: ${code})`);
    return;
  }
  
  // CRITICAL FIX: If we're already connected AND in the world (have a currentRoomId),
  // this disconnect is likely just the server cleaning up during nodemon restart.
  // Don't trigger reconnection - we're already successfully in the world.
  if (client?.connected && currentRoomId !== null) {
    console.log(`[ZORK] Already connected and in world (Room ${currentRoomId}). Ignoring disconnect (code: ${code}) - likely server cleanup during restart.`);
    return;
  }
  
  // Code 1006 = abnormal closure (server restart/crash)
  // Code 1000 = normal closure (but during nodemon restart, this can also mean server restart)
  // Code 1001 = going away (server restart)
  // During nodemon restarts, connections are often closed with code 1000, so we need to detect this scenario
  const isLikelyServerRestart = code === 1006 || code === 1001 || 
                                (code === 1000 && timeSinceLastConnection < 10000); // Code 1000 within 10s of connection = likely restart
  
  if (isLikelyServerRestart) {
    // Server restart detected - use longer delay to give server time to restart
    console.log(`[ZORK] Server restart detected (code: ${code}, connected ${Math.round(timeSinceLastConnection/1000)}s ago). Waiting 15s before reconnecting...`);
    reconnectAttempts = 0; // Reset attempts for fresh restart
    consecutiveConnectionRefused = 0; // Reset this counter too
  } else if (code !== 1000) {
    console.log(`[ZORK] Disconnected (code: ${code}). Reconnecting...`);
  } else {
    console.log(`[ZORK] Connection closed normally. Reconnecting...`);
  }
  
  client.connected = false;
  client.authenticated = false;
  isReconnecting = true;
  
  // Longer delay for server restarts to give nodemon time to restart cleanly
  const delay = isLikelyServerRestart ? 15000 : 5000;
  
  setTimeout(() => {
    if (!client?.connected) {
      attemptReconnect().catch(err => {
        // Don't log ECONNREFUSED during reconnection - expected during restarts
        const isConnectionRefused = err.code === 'ECONNREFUSED' || 
                                    err.message?.includes('ECONNREFUSED');
        if (!isConnectionRefused) {
          console.error('[ZORK] Error in disconnect reconnect:', err.message || err);
        }
        isReconnecting = false; // Reset flag on error
      });
    } else {
      isReconnecting = false; // Reset flag if already connected
    }
  }, delay);
}

/**
 * Attempt to reconnect
 */
async function attemptReconnect() {
  // Check if ZORK is enabled before reconnecting
  if (!isZorkEnabled()) {
    console.log('[ZORK] ZORK is disabled. Not reconnecting. Use /zork command in-game to enable.');
    isReconnecting = false;
    reconnectAttempts = 0; // Reset attempts when disabled
    return;
  }
  
  // If we're already connected, don't reconnect
  if (client?.connected) {
    console.log('[ZORK] Already connected, skipping reconnect');
    isReconnecting = false;
    return;
  }
  
  if (reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
    console.log('[ZORK] Max reconnect attempts reached. Waiting 30s before retry...');
    reconnectAttempts = 0;
    isReconnecting = false;
    setTimeout(attemptReconnect, 30000);
    return;
  }
  
  reconnectAttempts++;
  
  // Use exponential backoff with longer delays during server restarts
  // If we've had multiple ECONNREFUSED in a row, server is likely restarting
  let delay;
  if (consecutiveConnectionRefused >= 3) {
    // Server restart detected - use longer backoff to give nodemon time
    delay = CONFIG.SERVER_RESTART_BACKOFF_MS; // 15 seconds
  } else if (reconnectAttempts === 1) {
    delay = 5000; // First attempt: 5 seconds
  } else if (reconnectAttempts <= 3) {
    delay = 10000; // Next few attempts: 10 seconds
  } else {
    delay = Math.min(5000 * reconnectAttempts, 30000); // Then exponential up to 30s
  }
  
  // Only log every 5th attempt to reduce console spam during server restarts
  if (reconnectAttempts === 1 || reconnectAttempts % 5 === 0) {
    console.log(`[ZORK] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
  }
  
  setTimeout(async () => {
    try {
      if (client) {
        try { client.disconnect(); } catch (e) {}
        client = null;
      }
      await connect();
    } catch (error) {
      // Prevent unhandled promise rejections from crashing the process
      // The connect() function will handle its own errors and trigger reconnect
      // Don't log ECONNREFUSED errors here - they're expected during restarts
      const isConnectionRefused = error.code === 'ECONNREFUSED' || 
                                  error.message?.includes('ECONNREFUSED') ||
                                  (error.errors && error.errors.some(e => e.code === 'ECONNREFUSED'));
      if (!isConnectionRefused) {
        console.error('[ZORK] Error during reconnect attempt:', error.message || error);
      }
    }
  }, delay);
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Set up handlers for incoming game messages
 */
function setupMessageHandlers() {
  // Handle telepaths (private messages TO ZORK)
  client.onMessage('telepath', handleTelepath);
  
  // Handle room talk (public messages)
  client.onMessage('talked', handleTalk);
  
  // Handle room updates (for context)
  client.onMessage('roomUpdate', handleRoomUpdate);
  client.onMessage('moved', handleRoomUpdate);
  
  // Handle system messages (for context)
  client.onMessage('systemMessage', handleSystemMessage);
  
  // Handle player joins/leaves (for context)
  client.onMessage('playerJoined', handlePlayerEvent);
  client.onMessage('playerLeft', handlePlayerEvent);
  
  // Handle debug observer messages
  client.onMessage('debugSessionStarted', handleDebugSessionStarted);
  client.onMessage('debugEvent', handleDebugEvent);
  client.onMessage('debugSessionEnded', handleDebugSessionEnded);
  
  console.log('[ZORK] Message handlers registered');
}

/**
 * Handle incoming telepath (private message)
 */
async function handleTelepath(message) {
  const sender = message.fromPlayer;
  const text = message.message;
  
  // Don't respond to our own messages
  if (sender === CONFIG.ZORK_NAME || sender?.includes('ZORK')) return;
  
  console.log(`[ZORK] Telepath from ${sender}: ${text}`);
  
  // Add to recent events
  addRecentEvent(`${stripPlayerName(sender)} telepaths: "${text}"`);
  
  // Process and respond
  await processAndRespond(sender, text, 'telepath');
}

/**
 * Handle room talk (public message)
 */
async function handleTalk(message) {
  const sender = message.playerName;
  const text = message.message;
  
  // Don't respond to our own messages
  if (sender === CONFIG.ZORK_NAME || sender?.includes('ZORK')) return;
  
  // Add to recent events regardless of whether we respond
  addRecentEvent(`${stripPlayerName(sender)} says: "${text}"`);
  
  // Only respond if ZORK is mentioned or addressed
  const zorkMentioned = 
    text.toLowerCase().includes('zork') ||
    text.toLowerCase().startsWith('hey ') ||
    text.toLowerCase().startsWith('yo ') ||
    text.toLowerCase().includes('ai lord');
  
  if (!zorkMentioned) {
    console.log(`[ZORK] Talk from ${sender} (not addressed to me): ${text}`);
    return;
  }
  
  console.log(`[ZORK] Talk from ${sender}: ${text}`);
  
  // Process and respond
  await processAndRespond(sender, text, 'talk');
}

/**
 * Handle room updates
 */
function handleRoomUpdate(message) {
  if (message.room) {
    currentRoom = message.room;
    currentRoomId = message.room.id;
    // When we receive a room update, we're successfully in the world
    // Reset reconnecting flag if it was set, since we're clearly connected
    if (isReconnecting) {
      console.log(`[ZORK] Received room update (Room ${currentRoomId}) - we're in the world, clearing reconnecting flag`);
      isReconnecting = false;
    }
    
    // Check if Fliz is in this room - if not, follow him immediately
    // This ensures ZORK always stays with Fliz
    const playersInRoom = message.players || [];
    const flizInRoom = playersInRoom.some(p => p === CONFIG.FLIZ_NAME || p.includes('Fliz'));
    if (!flizInRoom) {
      // Fliz is not in this room - check and follow immediately
      checkAndFollowFliz();
    }
  }
}

/**
 * Handle system messages
 */
function handleSystemMessage(message) {
  const text = message.message || '';
  addRecentEvent(`[System] ${text}`);
  
  // Check for Fliz activity
  if (text.includes('Fliz')) {
    console.log(`[ZORK] Detected Fliz activity: ${text}`);
    checkAndFollowFliz();
  }
}

/**
 * Handle player join/leave events
 */
function handlePlayerEvent(message) {
  const player = message.playerName || '';
  const action = message.type === 'playerJoined' ? 'arrives' : 'leaves';
  addRecentEvent(`${stripPlayerName(player)} ${action}`);
  
  if (player.includes('Fliz')) {
    checkAndFollowFliz();
  }
}

// ============================================================================
// DEBUG OBSERVER SYSTEM
// ============================================================================

/**
 * Handle debug session started event
 */
async function handleDebugSessionStarted(message) {
  const { sessionId, bugLabel, playerName, currentRoom, currentMap } = message;
  
  // Don't observe our own debug sessions
  if (playerName === CONFIG.ZORK_NAME || playerName?.includes('ZORK')) return;
  
  activeDebugSessions.set(sessionId, {
    bugLabel: bugLabel || 'Unnamed bug',
    playerName: playerName || 'Unknown',
    currentRoom: currentRoom,
    currentMap: currentMap,
    startTime: Date.now(),
    events: [],
    consoleErrors: [],
    clientStates: [],
    todoCreated: false
  });
  
  console.log(`[ZORK] Debug session started: "${bugLabel}" for ${playerName} (session ${sessionId})`);
}

/**
 * Handle debug event (telemetry from client)
 */
async function handleDebugEvent(message) {
  const { sessionId, eventType, payload, playerName } = message;
  
  const session = activeDebugSessions.get(sessionId);
  if (!session) {
    console.log(`[ZORK] Received debug event for unknown session: ${sessionId}`);
    return;
  }
  
  // Store the event
  session.events.push({ eventType, payload, timestamp: Date.now() });
  
  // Categorize events
  if (eventType === 'consoleError' || eventType === 'windowError' || eventType === 'unhandledRejection') {
    session.consoleErrors.push({ type: eventType, ...payload });
    console.log(`[ZORK] Debug ${eventType}:`, payload?.args?.[0] || payload?.message || payload?.reason);
  } else if (eventType === 'clientState') {
    session.clientStates.push(payload);
  } else if (eventType === 'consoleWarn') {
    // Track warnings but don't treat as errors
    session.events.push({ type: 'warn', ...payload });
  }
  
  // Check if we should synthesize a todo
  // Conditions: Have errors AND (5+ events OR 10 seconds elapsed OR have 2+ errors)
  const elapsed = Date.now() - session.startTime;
  const hasErrors = session.consoleErrors.length > 0;
  const hasEnoughEvents = session.events.length >= 5;
  const hasSufficientErrors = session.consoleErrors.length >= 2;
  const enoughTimeElapsed = elapsed > 10000;
  
  if (!session.todoCreated && hasErrors && (hasEnoughEvents || enoughTimeElapsed || hasSufficientErrors)) {
    await synthesizeDebugTodo(sessionId, session);
  }
}

/**
 * Handle debug session ended event
 */
async function handleDebugSessionEnded(message) {
  const { sessionId } = message;
  
  const session = activeDebugSessions.get(sessionId);
  if (session) {
    // Create todo if we have any events and haven't created one yet
    if (!session.todoCreated && session.events.length > 0) {
      await synthesizeDebugTodo(sessionId, session);
    }
    activeDebugSessions.delete(sessionId);
    console.log(`[ZORK] Debug session ended: ${sessionId}`);
  }
}

/**
 * Synthesize a debug todo from collected telemetry
 */
async function synthesizeDebugTodo(sessionId, session) {
  if (session.todoCreated) return;
  session.todoCreated = true;
  
  console.log(`[ZORK] Synthesizing debug todo for session ${sessionId}...`);
  
  try {
    // Build a prompt to analyze the debug data
    const analysisPrompt = `You are analyzing debug telemetry from a game client to create a bug report.

**Bug Label (user description):** "${session.bugLabel}"
**Player:** ${session.playerName}
**Room:** ${session.currentRoom?.name || 'Unknown'} (ID: ${session.currentRoom?.id || 'N/A'})
**Map:** ${session.currentMap || 'Unknown'}
**Session Duration:** ${Math.round((Date.now() - session.startTime) / 1000)} seconds
**Total Events:** ${session.events.length}
**Console Errors:** ${session.consoleErrors.length}

**Console Errors:**
${JSON.stringify(session.consoleErrors.slice(0, 10), null, 2)}

**Recent Client States (last 3):**
${JSON.stringify(session.clientStates.slice(-3), null, 2)}

Based on this telemetry, create a structured bug report. Respond with ONLY valid JSON in this exact format:
{
  "title": "Concise bug title (max 80 chars)",
  "description": "Detailed description of what appears broken",
  "reproSteps": "1. Step one\\n2. Step two\\n3. Step three",
  "suspectedCause": "Brief technical hypothesis about the cause"
}`;

    // Use Claude to analyze
    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: analysisPrompt }]
    });
    
    const aiResponse = response.content[0].text;
    console.log(`[ZORK] AI analysis response:`, aiResponse);
    
    // Parse the JSON response
    let bugReport;
    try {
      // Try to extract JSON from response (handle markdown code blocks)
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      bugReport = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error(`[ZORK] Failed to parse AI response as JSON:`, parseError.message);
      // Create a fallback bug report
      bugReport = {
        title: `Bug: ${session.bugLabel}`.substring(0, 80),
        description: `Debug observation captured ${session.consoleErrors.length} error(s) during "${session.bugLabel}" for player ${session.playerName}.`,
        reproSteps: `1. Log in as ${session.playerName}\n2. Navigate to ${session.currentRoom?.name || 'the reported location'}\n3. Observe the issue: ${session.bugLabel}`,
        suspectedCause: 'See console errors for details'
      };
    }
    
    // Create the debug todo in the database
    const todo = await db.createDebugTodo({
      sessionId: sessionId,
      title: bugReport.title || `Bug: ${session.bugLabel}`,
      description: bugReport.description + (bugReport.suspectedCause ? `\n\n**Suspected Cause:** ${bugReport.suspectedCause}` : ''),
      reproSteps: bugReport.reproSteps,
      environment: {
        playerName: session.playerName,
        map: session.currentMap,
        room: session.currentRoom,
        sessionDuration: Date.now() - session.startTime,
        eventCount: session.events.length,
        errorCount: session.consoleErrors.length
      },
      logs: {
        consoleErrors: session.consoleErrors.slice(0, 20),
        clientStates: session.clientStates.slice(-5),
        allEvents: session.events.slice(-30)
      },
      createdBy: 'zork'
    });
    
    // Set ticket_type to 'debug' for telemetry-based tickets
    await db.query(
      'UPDATE debug_todos SET ticket_type = $1, priority = $2 WHERE id = $3',
      ['debug', 3, todo.id] // Default to high priority for debug tickets
    );
    
    // Get updated ticket
    const updatedTodo = await db.getDebugTodo(todo.id);
    
    console.log(`[ZORK] Created debug ticket #${updatedTodo.id}: "${updatedTodo.title}"`);
    
    // Optionally notify the player
    if (client && client.connected) {
      try {
        await sendTelepathToPlayer(session.playerName, `I've analyzed the debug session and created ticket #${updatedTodo.id}: "${bugReport.title}". Cursor can now pick this up and fix it.`);
      } catch (notifyError) {
        console.warn(`[ZORK] Failed to notify player:`, notifyError.message);
      }
    }
    
  } catch (error) {
    console.error(`[ZORK] Error synthesizing debug todo:`, error.message);
  }
}

/**
 * Send a telepath message to a specific player
 */
async function sendTelepathToPlayer(playerName, message) {
  if (!client || !client.ws) return;
  
  client.ws.send(JSON.stringify({
    type: 'telepath',
    target: playerName,
    message: message
  }));
}

// ============================================================================
// AI PROCESSING
// ============================================================================

/**
 * Process a message and generate a response using Claude
 */
async function processAndRespond(speaker, message, method) {
  try {
    // Check if speaker has god mode
    const speakerIsGod = await checkPlayerGodMode(speaker);
    
    // Build context for the AI (async - includes database lookups)
    let context;
    try {
      context = await buildContext(speaker, speakerIsGod, message, method);
    } catch (contextError) {
      console.error('[ZORK] Error building context:', contextError.message);
      console.error('[ZORK] Context error stack:', contextError.stack);
      throw new Error(`Failed to build context: ${contextError.message}`);
    }
    
    // Get conversation history for this speaker
    const history = getConversationHistory(speaker);
    
    // Add user message to history
    history.push({ role: 'user', content: context });
    
    console.log(`[ZORK] Processing message from ${speaker} (god: ${speakerIsGod})...`);
    console.log(`[ZORK] Context length: ${context.length} chars, History length: ${history.length} messages`);
    console.log(`[ZORK] System prompt length: ${systemPrompt.length} chars`);
    
    // Call Claude API
    let response;
    try {
      response = await anthropic.messages.create({
        model: CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        system: systemPrompt,
        messages: history,
      });
    } catch (apiError) {
      console.error('[ZORK] Claude API call failed:', apiError.message);
      console.error('[ZORK] API error details:', {
        status: apiError.status,
        statusCode: apiError.status_code,
        type: apiError.type,
        code: apiError.code,
        error: apiError.error
      });
      throw apiError; // Re-throw to be caught by outer catch
    }
    
    const aiResponse = response.content[0].text;
    
    console.log(`[ZORK] AI Response (raw):\n${aiResponse}\n`);
    
    // Add assistant response to history
    history.push({ role: 'assistant', content: aiResponse });
    
    // Trim history if too long
    while (history.length > CONFIG.MAX_CONVERSATION_HISTORY * 2) {
      history.shift();
    }
    
    // Save updated history
    conversationHistory.set(speaker, history);
    
    // Parse and execute any actions
    const { cleanResponse, actions } = parseActions(aiResponse);
    
    console.log(`[ZORK] Parsed ${actions.length} action(s) from response`);
    if (actions.length > 0) {
      console.log(`[ZORK] Actions:`, actions.map(a => a.type).join(', '));
    }
    
    // Execute god-mode actions (only if speaker has god mode)
    if (actions.length > 0 && speakerIsGod) {
      console.log(`[ZORK] Executing ${actions.length} action(s) for god-mode player ${speaker}`);
      const verificationFailures = [];
      
      for (const action of actions) {
        // Auto-fill playerName if missing (for player-related commands)
        const playerCommands = ['removePlayerInventoryItem', 'addPlayerInventoryItem', 'updatePlayer', 'getPlayerInventory'];
        if (playerCommands.includes(action.type) && !action.params.playerName && !action.params.playerId) {
          action.params.playerName = speaker;
          console.log(`[ZORK] Auto-filled playerName: ${speaker}`);
        }
        try {
          const result = await executeAction(action, speaker);
          
          // For markup, game message, connection management, ticket reading, and SQL query actions, result contains the data (don't need verification)
          const readOnlyActions = ['getMarkupConventions', 'createMarkupConvention', 'updateMarkupConvention', 'deleteMarkupConvention', 'updateBuiltInMarkupEdit', 'getGameMessage', 'getAllGameMessages', 'updateGameMessage', 'getNPCKeywords', 'updateNPCKeyword', 'deleteNPCKeyword', 'disconnectZork', 'reconnectZork', 'getZorkConnectionStatus', 'getTickets', 'listTickets', 'getTicket', 'getTicketSummary', 'sql', 'readCanonDocument', 'readDocument'];
          
          if (readOnlyActions.includes(action.type)) {
            console.log(`[ZORK] Action ${action.type} completed successfully`);
            // Mark as successful (no verification needed for direct DB operations or connection management)
            action.verificationFailed = false;
            // Store result for read actions so AI can see it
            if (result) {
              action.result = result;
              console.log(`[ZORK] Stored action result for ${action.type}:`, JSON.stringify(result).substring(0, 200));
            }
          }
        } catch (error) {
          console.error(`[ZORK] Action execution error: ${error.message}`);
          action.verificationFailed = true;
          action.verificationError = error.message;
        }
        
        // Collect verification failures
        if (action.verificationFailed) {
          verificationFailures.push({
            type: action.type,
            error: action.verificationError,
            playerName: action.verificationPlayerName || speaker
          });
        }
      }
      
      // If any actions failed verification, send error message
      if (verificationFailures.length > 0) {
        const errorMsg = verificationFailures.map(f => 
          `My attempt to ${f.type} did not take effect: ${f.error}`
        ).join('. ');
        await sendResponse(speaker, `Hmm. ${errorMsg}`, method);
      }
      
      // Check if we have read actions with results that need to be presented to the user
      const readActionsWithResults = actions.filter(a => 
        ['getTickets', 'listTickets', 'getTicket', 'getTicketSummary', 'getMarkupConventions', 'getZorkConnectionStatus', 'sql', 'readCanonDocument', 'readDocument'].includes(a.type) && 
        a.result && 
        !a.verificationFailed
      );
      
      if (readActionsWithResults.length > 0) {
        console.log(`[ZORK] Found ${readActionsWithResults.length} read action(s) with results - formatting for display`);
        
        // Format the results directly instead of making another API call
        let formattedResults = '';
        
        for (const action of readActionsWithResults) {
          const result = action.result;
          
          if (action.type === 'getTicketSummary') {
            // Format ticket summary
            formattedResults += `\n\n**Ticket Summary:**\n`;
            formattedResults += `- Total tickets: ${result.total}\n`;
            formattedResults += `- Open: ${result.byStatus.open} | In Progress: ${result.byStatus.in_progress} | Resolved: ${result.byStatus.resolved}\n`;
            formattedResults += `- By Priority: Critical: ${result.byPriority.critical}, High: ${result.byPriority.high}, Medium: ${result.byPriority.medium}, Low: ${result.byPriority.low}\n`;
            formattedResults += `- By Type: Debug: ${result.byType.debug}, Manual: ${result.byType.manual}, User: ${result.byType.user}\n`;
            if (result.recent && result.recent.length > 0) {
              formattedResults += `\n**Recent Tickets:**\n`;
              result.recent.forEach(t => {
                const statusEmoji = t.status === 'open' ? '🔴' : t.status === 'in_progress' ? '🟡' : '✅';
                formattedResults += `${statusEmoji} #${t.id}: ${t.title} (Priority: ${t.priority})\n`;
              });
            }
          } else if (action.type === 'getTickets' || action.type === 'listTickets') {
            // Format ticket list
            formattedResults += `\n\n**Tickets (${result.count} total):**\n`;
            if (result.tickets && result.tickets.length > 0) {
              result.tickets.forEach(t => {
                const statusEmoji = t.status === 'open' ? '🔴' : t.status === 'in_progress' ? '🟡' : '✅';
                formattedResults += `${statusEmoji} #${t.id}: ${t.title}\n`;
                formattedResults += `   Status: ${t.status} | Priority: ${t.priority} | Type: ${t.ticket_type}\n`;
                if (t.description) {
                  formattedResults += `   ${t.description.substring(0, 100)}${t.description.length > 100 ? '...' : ''}\n`;
                }
                formattedResults += `\n`;
              });
            } else {
              formattedResults += `No tickets found.\n`;
            }
          } else if (action.type === 'getTicket') {
            // Format single ticket
            formattedResults += `\n\n**Ticket #${result.id}:**\n`;
            formattedResults += `Title: ${result.title}\n`;
            formattedResults += `Status: ${result.status} | Priority: ${result.priority} | Type: ${result.ticket_type}\n`;
            if (result.description) {
              formattedResults += `\nDescription:\n${result.description}\n`;
            }
            if (result.repro_steps) {
              formattedResults += `\nRepro Steps:\n${result.repro_steps}\n`;
            }
            if (result.resolution_notes) {
              formattedResults += `\nResolution Notes:\n${result.resolution_notes}\n`;
            }
          } else if (action.type === 'sql') {
            // Format SQL query results
            formattedResults += `\n\n**SQL Query Results:**\n`;
            if (result.rows && result.rows.length > 0) {
              formattedResults += `Rows returned: ${result.rows.length}\n\n`;
              // Format as table-like structure
              if (result.rows.length <= 20) {
                // Show all rows if 20 or fewer
                result.rows.forEach((row, index) => {
                  formattedResults += `Row ${index + 1}:\n`;
                  Object.entries(row).forEach(([key, value]) => {
                    const displayValue = value === null ? 'NULL' : String(value);
                    formattedResults += `  ${key}: ${displayValue}\n`;
                  });
                  formattedResults += `\n`;
                });
              } else {
                // Show first 10 and last 10 if more than 20
                formattedResults += `(Showing first 10 and last 10 of ${result.rows.length} rows)\n\n`;
                for (let i = 0; i < 10; i++) {
                  formattedResults += `Row ${i + 1}:\n`;
                  Object.entries(result.rows[i]).forEach(([key, value]) => {
                    const displayValue = value === null ? 'NULL' : String(value);
                    formattedResults += `  ${key}: ${displayValue}\n`;
                  });
                  formattedResults += `\n`;
                }
                formattedResults += `... (${result.rows.length - 20} rows hidden) ...\n\n`;
                for (let i = result.rows.length - 10; i < result.rows.length; i++) {
                  formattedResults += `Row ${i + 1}:\n`;
                  Object.entries(result.rows[i]).forEach(([key, value]) => {
                    const displayValue = value === null ? 'NULL' : String(value);
                    formattedResults += `  ${key}: ${displayValue}\n`;
                  });
                  formattedResults += `\n`;
                }
              }
            } else {
              formattedResults += `Query executed successfully but returned no rows.\n`;
              if (result.rowCount !== undefined) {
                formattedResults += `Rows affected: ${result.rowCount}\n`;
              }
            }
          } else if (action.type === 'readCanonDocument' || action.type === 'readDocument') {
            // Format canon document content
            if (result.success && result.content) {
              formattedResults += `\n\n**Canon Document: ${result.document}**\n\n`;
              formattedResults += result.content;
            } else {
              formattedResults += `\n\n**Error reading document:** ${result.error || 'Unknown error'}\n`;
            }
          }
        }
        
        // Append formatted results to the clean response
        const responseWithResults = cleanResponse + formattedResults;
        console.log(`[ZORK] Appended formatted results to response`);
        
        // Send the response with results
        await sendResponse(speaker, responseWithResults, method);
        return; // Don't send the original cleanResponse
      }
    } else if (actions.length > 0 && !speakerIsGod) {
      console.log(`[ZORK] Ignoring ${actions.length} action(s) - speaker lacks god mode`);
    } else if (actions.length === 0 && speakerIsGod) {
      console.log(`[ZORK] WARNING: God-mode player requested action but no action blocks found in response`);
    }
    
    // Send response with human-like delay
    await sendResponse(speaker, cleanResponse, method);
    
  } catch (error) {
    // Enhanced error logging to diagnose issues
    console.error('[ZORK] AI processing error:', error.message);
    console.error('[ZORK] Error stack:', error.stack);
    console.error('[ZORK] Error details:', {
      name: error.name,
      message: error.message,
      status: error.status,
      statusCode: error.status_code,
      type: error.type,
      code: error.code
    });
    
    // Check for specific API errors
    const errorMessage = error.message || '';
    const errorStatus = error.status_code || error.status;
    const errorBody = error.error || {};
    const nestedError = errorBody.error || {};
    
    if (errorStatus === 401) {
      console.error('[ZORK] ❌ API Authentication Error: Invalid or missing API key');
      await sendResponse(speaker, "I'm having trouble authenticating with my AI service. Please check my API key configuration.", method);
    } else if (errorStatus === 429) {
      console.error('[ZORK] ❌ API Rate Limit Error: Too many requests');
      await sendResponse(speaker, "I'm being rate-limited by my AI service. Please wait a moment and try again.", method);
    } else if (errorStatus === 402 || errorMessage.includes('insufficient') || errorMessage.includes('credit balance') || errorMessage.includes('too low') || nestedError.message?.includes('credit balance') || nestedError.message?.includes('too low')) {
      console.error('[ZORK] ❌ API Payment Error: Insufficient credits or payment required');
      await sendResponse(speaker, "My AI service account is out of credits. Please go to your Anthropic account (Plans & Billing) to add credits. Once credits are added, I'll be able to respond again.", method);
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
      console.error('[ZORK] ❌ Network Error: Cannot reach AI service');
      await sendResponse(speaker, "I'm having network connectivity issues reaching my AI service. Please check your internet connection.", method);
    } else {
      // Generic fallback for unknown errors
      console.error('[ZORK] ❌ Unknown error - using fallback message');
      await sendResponse(speaker, "Hmm. My thoughts are clouded. Try again.", method);
    }
  }
}

/**
 * Get relevant knowledge from the knowledge base
 */
async function getRelevantKnowledge(message, speakerIsGod) {
  try {
    const knowledgeChunks = [];
    
    // 1. Always load priority 2 (always-include) knowledge first
    const alwaysInclude = await db.getAlwaysIncludeKnowledge();
    for (const chunk of alwaysInclude) {
      knowledgeChunks.push({
        title: chunk.title,
        content: chunk.content,
        category: chunk.category,
        priority: chunk.priority
      });
    }
    
    // 2. Generate embedding for the message and do semantic search
    let queryEmbedding = null;
    try {
      queryEmbedding = await generateEmbedding(message);
    } catch (error) {
      console.warn('[ZORK] Failed to generate embedding for knowledge search:', error.message);
      // Continue without semantic search - will use category-based retrieval
    }
    
    // 3. Perform semantic search for contextual knowledge (priority 0)
    if (queryEmbedding) {
      const contextualKnowledge = await db.searchZorkKnowledge(
        queryEmbedding,
        5, // limit
        0.7, // threshold
        null, // category (all)
        0 // priority 0 only
      );
      
      for (const chunk of contextualKnowledge) {
        // Avoid duplicates
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            priority: chunk.priority
          });
        }
      }
    }
    
    // 4. Load category-relevant knowledge (priority 1) based on message content
    const lowerMessage = message.toLowerCase();
    
    // Check for command-related keywords
    if (lowerMessage.includes('action') || lowerMessage.includes('command') || 
        lowerMessage.includes('god mode') || lowerMessage.includes('execute')) {
      const commandKnowledge = await db.getZorkKnowledgeByCategory('command_knowledge', 1);
      for (const chunk of commandKnowledge) {
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            priority: chunk.priority
          });
        }
      }
    }
    
    // Check for system docs keywords (email, railway, database, deployment, etc.)
    if (lowerMessage.includes('email') || lowerMessage.includes('smtp') || 
        lowerMessage.includes('railway') || lowerMessage.includes('deployment') ||
        lowerMessage.includes('database') || lowerMessage.includes('dbeaver') ||
        lowerMessage.includes('sync') || lowerMessage.includes('production')) {
      const systemDocs = await db.getZorkKnowledgeByCategory('system_docs', null);
      for (const chunk of systemDocs) {
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            priority: chunk.priority
          });
        }
      }
    }
    
    // Check for game design/technical keywords
    if (lowerMessage.includes('game') || lowerMessage.includes('player') ||
        lowerMessage.includes('npc') || lowerMessage.includes('item') ||
        lowerMessage.includes('room') || lowerMessage.includes('map')) {
      // Get relevant chunks from game_design and technical
      const gameDesign = await db.getZorkKnowledgeByCategory('game_design', 1);
      const technical = await db.getZorkKnowledgeByCategory('technical', 1);
      for (const chunk of [...gameDesign, ...technical]) {
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            priority: chunk.priority
          });
        }
      }
    }
    
    // 5. Search learned_context semantically (for all players, not just god-mode)
    // This allows ZORK to remember things like player names, preferences, etc.
    if (queryEmbedding) {
      const learnedKnowledge = await db.searchZorkKnowledge(
        queryEmbedding,
        3, // limit
        0.6, // lower threshold for learned context (more permissive)
        'learned_context', // category
        null // any priority
      );
      
      for (const chunk of learnedKnowledge) {
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            priority: chunk.priority
          });
        }
      }
    }
    
    // 6. Also load all learned_context for god-mode players (always include)
    if (speakerIsGod) {
      const learnedContext = await db.getZorkKnowledgeByCategory('learned_context', 1);
      for (const chunk of learnedContext) {
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            priority: chunk.priority
          });
        }
      }
    }
    
    // Format knowledge chunks for context
    if (knowledgeChunks.length === 0) {
      return ''; // No knowledge available
    }
    
    // Format knowledge chunks for context
    // IMPORTANT: Include content as-is (plain text) - don't process markup here
    // Markup will be processed when ZORK's response is rendered, not in the context
    // If content contains markup placeholders (__MARKUP_X__), they're artifacts from
    // a previous incomplete parse - we need to clean them up
    const formattedChunks = knowledgeChunks.map(chunk => {
      let content = chunk.content;
      
      // Clean up any markup placeholders that might have been created during storage
      // These placeholders should never appear in the knowledge base, but if they do,
      // replace them with a generic placeholder to avoid confusion
      if (content.includes('__MARKUP_')) {
        console.warn(`[ZORK] Warning: Knowledge chunk "${chunk.title}" contains markup placeholders - cleaning up`);
        // Replace placeholders with a generic marker - but try to preserve the original intent
        // If we can't determine the original markup, just use a generic placeholder
        content = content.replace(/__MARKUP_\d+__/g, '[markup example]');
      }
      
      return `[${chunk.category.toUpperCase()}] ${chunk.title}\n${content}`;
    });
    
    // Add a note to clarify that markup syntax in knowledge is for reference only
    const knowledgeBase = `\n[KNOWLEDGE BASE]\n${formattedChunks.join('\n\n')}\n[/KNOWLEDGE BASE]\n`;
    
    // Add instruction to prevent AI from including placeholder text in responses
    return knowledgeBase + '\nNOTE: Any markup syntax (like <text>, [text], !text!) in the knowledge base above is for reference only. When you use markup in your responses, use the actual syntax directly, not placeholders or examples. Never include __MARKUP_X__ or similar placeholder text in your responses.\n';
    
  } catch (error) {
    console.error('[ZORK] Error retrieving knowledge:', error.message);
    return ''; // Return empty string on error - don't break context building
  }
}

/**
 * Build context string for the AI
 */
async function buildContext(speaker, speakerIsGod, message, method) {
  // Get relevant knowledge from knowledge base
  const knowledgeBase = await getRelevantKnowledge(message, speakerIsGod);
  
  const roomInfo = currentRoom ? {
    name: currentRoom.name,
    description: currentRoom.description,
    players: currentRoom.players || [],
    npcs: currentRoom.npcs || [],
    items: currentRoom.roomItems || [],
  } : { name: 'Unknown', description: 'Unknown location' };
  
  // Get detailed NPC information for NPCs in the room
  let npcDetails = [];
  if (roomInfo.npcs && roomInfo.npcs.length > 0) {
    for (const npc of roomInfo.npcs) {
      const npcName = npc.name || npc;
      const details = await getNpcDetails(npcName);
      if (details) {
        npcDetails.push({
          name: details.name,
          description: details.description,
          npc_type: details.npc_type,
          required_items: Object.keys(details.input_items || {}).length > 0 
            ? Object.entries(details.input_items).map(([item, qty]) => `${item} (${qty})`).join(', ')
            : details.harvest_prerequisite_item || 'None',
          produces: Object.keys(details.output_items || {}).length > 0
            ? Object.entries(details.output_items).map(([item, qty]) => `${item} (${qty})`).join(', ')
            : 'None',
        });
      } else {
        npcDetails.push({ name: npcName, description: 'Unknown NPC' });
      }
    }
  }
  
  // Check if message mentions specific NPCs or items - look them up
  const npcMentions = [];
  const itemMentions = [];
  const itemAcquisitionInfo = [];
  let puzzleInfo = null;
  
  // Simple keyword detection for NPCs/items mentioned in the message
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('pulsewood') || lowerMessage.includes('tree')) {
    const npc = await getNpcDetails('pulsewood');
    if (npc) npcMentions.push(npc);
  }
  
  // Detect puzzle/riddle questions - especially for god-mode players
  const puzzlePatterns = [
    /(?:what|what's|what is).*?(?:answer|solution).*?(?:to|of).*?([A-Za-z][A-Za-z\s]+?)(?:['']?s)?.*?(?:riddle|puzzle)/i,
    /(?:answer|solution).*?(?:to|of).*?([A-Za-z][A-Za-z\s]+?)(?:['']?s)?.*?(?:riddle|puzzle)/i,
    /([A-Za-z][A-Za-z\s]+?)(?:['']?s)?.*?(?:riddle|puzzle).*?(?:answer|solution)/i
  ];
  
  let detectedNpcName = null;
  for (const pattern of puzzlePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      detectedNpcName = match[1].trim();
      // Clean up common words
      detectedNpcName = detectedNpcName.replace(/^(the|a|an)\s+/i, '').trim();
      break;
    }
  }
  
  // Also check for direct NPC name mentions with puzzle/riddle keywords
  if (!detectedNpcName && (lowerMessage.includes('riddle') || lowerMessage.includes('puzzle') || 
      lowerMessage.includes('answer') || lowerMessage.includes('solution'))) {
    // Try to extract NPC name from common patterns
    const npcNamePatterns = [
      /(?:calder|npc|character).*?(?:riddle|puzzle|answer|solution)/i,
      /(?:riddle|puzzle|answer|solution).*?(?:calder|npc|character)/i
    ];
    for (const pattern of npcNamePatterns) {
      const match = message.match(pattern);
      if (match) {
        // Try common NPC names
        if (lowerMessage.includes('calder')) {
          detectedNpcName = 'Calder';
        }
        break;
      }
    }
  }
  
  // If we detected a puzzle question and speaker is god-mode, get puzzle info
  if (detectedNpcName && speakerIsGod) {
    puzzleInfo = await getLoreKeeperPuzzleInfo(detectedNpcName);
    if (puzzleInfo) {
      console.log(`[ZORK] Found puzzle info for ${detectedNpcName} (god-mode player)`);
    }
  }
  
  // Detect item mentions, especially when asking "how to get" or "where to find"
  // Check for explicit "how to get" or "where to find" patterns first
  const howToGetPatterns = [
    /(?:how|where).*?(?:do|can).*?(?:i|you).*?(?:get|find|obtain|acquire).*?([A-Za-z][A-Za-z\s]+?)(?:\?|$|\.|,)/i,
    /(?:how|where).*?(?:to).*?(?:get|find|obtain|acquire).*?([A-Za-z][A-Za-z\s]+?)(?:\?|$|\.|,)/i,
    /([A-Za-z][A-Za-z\s]+?)(?:\?|$|\.|,).*?(?:how|where).*?(?:get|find|obtain|acquire)/i
  ];
  
  let detectedItemName = null;
  for (const pattern of howToGetPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      detectedItemName = match[1].trim();
      // Clean up common words that might be captured
      detectedItemName = detectedItemName.replace(/^(a|an|the)\s+/i, '').trim();
      break;
    }
  }
  
  // If we detected an item name from "how to get" patterns, look it up
  if (detectedItemName) {
    const item = await getItemDetails(detectedItemName);
    if (item && !itemMentions.find(i => i.name === item.name)) {
      itemMentions.push(item);
      // Always get acquisition info for "how to get" questions
      const acquisition = await getItemAcquisitionInfo(item.name);
      itemAcquisitionInfo.push({ itemName: item.name, ...acquisition });
    }
  }
  
  // Also check for common item keywords in the message
  const itemKeywords = ['harvester rune', 'pulse resin', 'rune', 'resin'];
  for (const keyword of itemKeywords) {
    if (lowerMessage.includes(keyword) && !detectedItemName) {
      const item = await getItemDetails(keyword);
      if (item && !itemMentions.find(i => i.name === item.name)) {
        itemMentions.push(item);
        // Get acquisition info if it's a "how to get" type question
        if (lowerMessage.includes('how') || lowerMessage.includes('where') || 
            lowerMessage.includes('get') || lowerMessage.includes('find')) {
          const acquisition = await getItemAcquisitionInfo(item.name);
          if (acquisition.loreKeeperRewards.length > 0 || 
              acquisition.merchantLocations.length > 0 || 
              acquisition.npcHarvestOutputs.length > 0) {
            itemAcquisitionInfo.push({ itemName: item.name, ...acquisition });
          }
        }
      }
    }
  }
  
  const context = `
[CONTEXT]
Speaker: ${stripPlayerName(speaker)}
Speaker Full Name (for actions): ${speaker}
Speaker has God Mode: ${speakerIsGod ? 'YES - can request world modifications' : 'NO - regular player'}
Communication Method: ${method}
Current Room: ${roomInfo.name}
Current Room ID: ${currentRoomId || 'Unknown'}
Room Description: ${roomInfo.description}
Other Players Here: ${roomInfo.players.filter(p => p !== CONFIG.ZORK_NAME).map(stripPlayerName).join(', ') || 'None'}

NPCs in Room (with details):
${npcDetails.length > 0 ? npcDetails.map(n => `- ${n.name}: ${n.description}\n  Required Items: ${n.required_items}\n  Produces: ${n.produces}`).join('\n') : 'None'}

Items on Ground: ${roomInfo.items.map(i => i.item_name || i.name || i).join(', ') || 'None'}

${npcMentions.length > 0 ? `\nMentioned NPCs (detailed):\n${npcMentions.map(n => `- ${n.name}: ${n.description}\n  Required Items: ${Object.keys(n.input_items || {}).length > 0 ? Object.entries(n.input_items).map(([item, qty]) => `${item} (${qty})`).join(', ') : n.harvest_prerequisite_item || 'None'}\n  Produces: ${Object.keys(n.output_items || {}).length > 0 ? Object.entries(n.output_items).map(([item, qty]) => `${item} (${qty})`).join(', ') : 'None'}`).join('\n')}` : ''}

${itemMentions.length > 0 ? `\nMentioned Items (detailed):\n${itemMentions.map(i => `- ${i.name}: ${i.description} (Type: ${i.item_type}, Encumbrance: ${i.encumbrance})`).join('\n')}` : ''}

${itemAcquisitionInfo.length > 0 ? `\nItem Acquisition Information:\n${itemAcquisitionInfo.map(info => {
  let acquisitionText = `\nHow to obtain "${info.itemName}":\n`;
  
  if (info.loreKeeperRewards.length > 0) {
    acquisitionText += `- NPC Rewards: ${info.loreKeeperRewards.map(r => `${r.npcName} (${r.rewardType} reward)`).join(', ')}\n`;
  }
  
  if (info.merchantLocations.length > 0) {
    acquisitionText += `- Merchants: ${info.merchantLocations.map(m => `${m.roomName} in ${m.mapName} (${m.price} coins)`).join(', ')}\n`;
  }
  
  if (info.npcHarvestOutputs.length > 0) {
    acquisitionText += `- Harvest from NPCs: ${info.npcHarvestOutputs.map(h => `${h.npcName} (${h.quantity}x)`).join(', ')}\n`;
  }
  
  return acquisitionText;
}).join('\n')}` : ''}

${puzzleInfo ? `\n⚠️ GOD-MODE ONLY: Lore Keeper Puzzle Information for ${puzzleInfo.npcName}:\n` +
  `- Puzzle Mode: ${puzzleInfo.puzzleMode}\n` +
  (puzzleInfo.puzzleClues ? `- Clues: ${puzzleInfo.puzzleClues}\n` : '') +
  `- Solution: "${puzzleInfo.puzzleSolution}"\n` +
  (puzzleInfo.puzzleRewardItem ? `- Reward Item: ${puzzleInfo.puzzleRewardItem}\n` : '') +
  (puzzleInfo.keywordsResponses ? `- Keyword Responses: ${typeof puzzleInfo.keywordsResponses === 'object' ? JSON.stringify(puzzleInfo.keywordsResponses, null, 2) : puzzleInfo.keywordsResponses}\n` : '') +
  `\nIMPORTANT: This puzzle information is ONLY visible to god-mode players. You should provide the solution when asked by god-mode players (for testing/debugging), but NEVER reveal it to regular players - they must solve it themselves.\n` : ''}

Recent Events: ${recentEvents.slice(-5).join(' | ') || 'None'}

${knowledgeBase}

CRITICAL: Use ONLY the information provided above. Do NOT make up or guess details about NPCs, items, or game mechanics. If you don't know something, say so rather than inventing it.

IMPORTANT FOR ACTIONS: When using playerName in action blocks, use the EXACT "Speaker Full Name" value shown above (e.g., "@Fliz@"), not the display name.
[/CONTEXT]

${stripPlayerName(speaker)}: ${message}`;
  
  return context;
}

/**
 * Get conversation history for a speaker
 */
function getConversationHistory(speaker) {
  if (!conversationHistory.has(speaker)) {
    conversationHistory.set(speaker, []);
  }
  return conversationHistory.get(speaker);
}

/**
 * Check if a player has god mode
 */
async function checkPlayerGodMode(playerName) {
  try {
    const player = await verifier.queryOne(
      'SELECT flag_god_mode FROM players WHERE name = $1',
      [playerName]
    );
    // flag_god_mode is stored as integer (1 = true, 0 = false)
    return player?.flag_god_mode === 1 || player?.flag_god_mode === true;
  } catch (error) {
    console.error('[ZORK] Error checking god mode:', error.message);
    return false;
  }
}

// ============================================================================
// ACTION PARSING & EXECUTION
// ============================================================================

/**
 * Parse action blocks from AI response
 */
function parseActions(response) {
  const actions = [];
  let cleanResponse = response;
  
  // Match action blocks: [ACTION: type]\n{json}\n[/ACTION]
  const actionRegex = /\[ACTION:\s*(\w+)\]\s*\n?([\s\S]*?)\n?\[\/ACTION\]/g;
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const commandType = match[1];
    const jsonStr = match[2].trim();
    
    try {
      const params = JSON.parse(jsonStr);
      actions.push({ type: commandType, params });
      console.log(`[ZORK] Parsed action: ${commandType}`);
    } catch (error) {
      console.error(`[ZORK] Failed to parse action JSON: ${error.message}`);
    }
    
    // Remove action block from response
    cleanResponse = cleanResponse.replace(match[0], '').trim();
  }
  
  return { cleanResponse, actions };
}

/**
 * Resolve player name to player ID
 * Handles both "@PlayerName@" and "PlayerName" formats
 */
async function resolvePlayerId(playerNameOrId) {
  // If it's already a number, return it
  if (typeof playerNameOrId === 'number') {
    return playerNameOrId;
  }
  
  // If it's a string that's a number, parse it
  if (typeof playerNameOrId === 'string' && /^\d+$/.test(playerNameOrId)) {
    return parseInt(playerNameOrId, 10);
  }
  
  // Otherwise, look up by name
  // Try exact match first (with @ symbols)
  try {
    let player = await verifier.queryOne(
      'SELECT id FROM players WHERE name = $1',
      [playerNameOrId]
    );
    
    // If not found and name doesn't have @ symbols, try with @ symbols
    if (!player && !playerNameOrId.includes('@')) {
      const wrappedName = `@${playerNameOrId}@`;
      player = await verifier.queryOne(
        'SELECT id FROM players WHERE name = $1',
        [wrappedName]
      );
    }
    
    // If still not found and name has @ symbols, try without
    if (!player && playerNameOrId.includes('@')) {
      const unwrappedName = playerNameOrId.replace(/^@+|@+$/g, '');
      player = await verifier.queryOne(
        'SELECT id FROM players WHERE name = $1',
        [unwrappedName]
      );
    }
    
    // Also try case-insensitive match
    if (!player) {
      player = await verifier.queryOne(
        'SELECT id FROM players WHERE LOWER(name) = LOWER($1)',
        [playerNameOrId]
      );
    }
    
    // Try case-insensitive with @ symbols
    if (!player && !playerNameOrId.includes('@')) {
      const wrappedName = `@${playerNameOrId}@`;
      player = await verifier.queryOne(
        'SELECT id FROM players WHERE LOWER(name) = LOWER($1)',
        [wrappedName]
      );
    }
    
    return player?.id || null;
  } catch (error) {
    console.error(`[ZORK] Error resolving player ID for ${playerNameOrId}:`, error.message);
    return null;
  }
}

/**
 * Get current quantity of an item for a player
 */
async function getPlayerItemQuantity(playerNameOrId, itemName) {
  const playerId = await resolvePlayerId(playerNameOrId);
  if (!playerId) return 0;
  
  try {
    const item = await verifier.queryOne(
      'SELECT quantity FROM player_items WHERE player_id = $1 AND item_name = $2',
      [playerId, itemName]
    );
    return item?.quantity || 0;
  } catch (error) {
    console.error(`[ZORK] Error getting item quantity:`, error.message);
    return 0;
  }
}

/**
 * Get NPC details by name (searches in current room and globally)
 */
async function getNpcDetails(npcName) {
  try {
    // First try to find in current room
    if (currentRoomId) {
      const npc = await verifier.queryOne(
        `SELECT sn.id, sn.name, sn.description, sn.npc_type, sn.input_items, sn.output_items, 
                sn.required_stats, sn.required_buffs, sn.harvest_prerequisite_item, sn.harvest_prerequisite_message
         FROM room_npcs rn
         JOIN scriptable_npcs sn ON rn.npc_id = sn.id
         WHERE rn.room_id = $1 AND LOWER(sn.name) LIKE LOWER($2)`,
        [currentRoomId, `%${npcName}%`]
      );
      
      if (npc) {
        return {
          id: npc.id,
          name: npc.name,
          description: npc.description,
          npc_type: npc.npc_type,
          // These fields are now JSONB, so they're already objects/arrays
          input_items: npc.input_items || {},
          output_items: npc.output_items || {},
          required_stats: npc.required_stats || {},
          required_buffs: npc.required_buffs || [],
          harvest_prerequisite_item: npc.harvest_prerequisite_item,
          harvest_prerequisite_message: npc.harvest_prerequisite_message,
        };
      }
    }
    
    // If not in current room, search globally
    const npc = await verifier.queryOne(
      `SELECT id, name, description, npc_type, input_items, output_items, 
              required_stats, required_buffs, harvest_prerequisite_item, harvest_prerequisite_message
       FROM scriptable_npcs
       WHERE LOWER(name) LIKE LOWER($1)`,
      [`%${npcName}%`]
    );
    
    if (npc) {
      return {
        id: npc.id,
        name: npc.name,
        description: npc.description,
        npc_type: npc.npc_type,
        // These fields are now JSONB, so they're already objects/arrays
        input_items: npc.input_items || {},
        output_items: npc.output_items || {},
        required_stats: npc.required_stats || {},
        required_buffs: npc.required_buffs || [],
        harvest_prerequisite_item: npc.harvest_prerequisite_item,
        harvest_prerequisite_message: npc.harvest_prerequisite_message,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[ZORK] Error getting NPC details:`, error.message);
    return null;
  }
}

/**
 * Get item details by name
 */
async function getItemDetails(itemName) {
  try {
    const item = await verifier.queryOne(
      'SELECT id, name, description, item_type, encumbrance, poofable FROM items WHERE LOWER(name) LIKE LOWER($1)',
      [`%${itemName}%`]
    );
    
    return item ? {
      id: item.id,
      name: item.name,
      description: item.description,
      item_type: item.item_type,
      encumbrance: item.encumbrance,
      poofable: item.poofable,
    } : null;
  } catch (error) {
    console.error(`[ZORK] Error getting item details:`, error.message);
    return null;
  }
}

/**
 * Get Lore Keeper puzzle information (solution, clues, etc.)
 * Only used for god-mode players who need to test/debug puzzles
 */
async function getLoreKeeperPuzzleInfo(npcName) {
  try {
    const puzzleInfo = await verifier.queryOne(
      `SELECT lk.npc_id, sn.name as npc_name, lk.puzzle_mode, 
              lk.puzzle_solution, lk.puzzle_success_message, lk.puzzle_failure_message,
              lk.puzzle_reward_item, lk.keywords_responses
       FROM lore_keepers lk
       JOIN scriptable_npcs sn ON lk.npc_id = sn.id
       WHERE LOWER(sn.name) LIKE LOWER($1) AND lk.puzzle_mode IS NOT NULL`,
      [`%${npcName}%`]
    );
    
    if (!puzzleInfo) {
      return null;
    }
    
    // keywords_responses is now JSONB, so it's already an object
    // Keep backward compatibility check during migration
    let keywordsResponses = null;
    if (puzzleInfo.keywords_responses) {
      try {
        keywordsResponses = typeof puzzleInfo.keywords_responses === 'string'
          ? JSON.parse(puzzleInfo.keywords_responses)
          : puzzleInfo.keywords_responses;
      } catch (parseError) {
        // If not JSON, treat as plain text
        keywordsResponses = puzzleInfo.keywords_responses;
      }
    }
    
    return {
      npcName: puzzleInfo.npc_name,
      puzzleMode: puzzleInfo.puzzle_mode,
      puzzleSolution: puzzleInfo.puzzle_solution,
      puzzleSuccessMessage: puzzleInfo.puzzle_success_message,
      puzzleFailureMessage: puzzleInfo.puzzle_failure_message,
      puzzleRewardItem: puzzleInfo.puzzle_reward_item,
      keywordsResponses: keywordsResponses
    };
  } catch (error) {
    console.error(`[ZORK] Error getting Lore Keeper puzzle info for ${npcName}:`, error.message);
    return null;
  }
}

/**
 * Get item acquisition information (how to obtain an item)
 * Returns information about NPC rewards, merchants, and NPC harvest outputs
 */
async function getItemAcquisitionInfo(itemName) {
  try {
    const acquisitionInfo = {
      loreKeeperRewards: [],
      merchantLocations: [],
      npcHarvestOutputs: []
    };
    
    // 1. Check if any Lore Keepers give this item as a puzzle reward
    const loreKeeperRewards = await verifier.query(
      `SELECT lk.npc_id, sn.name as npc_name, lk.puzzle_reward_item, lk.puzzle_mode
       FROM lore_keepers lk
       JOIN scriptable_npcs sn ON lk.npc_id = sn.id
       WHERE LOWER(lk.puzzle_reward_item) = LOWER($1)`,
      [itemName]
    );
    
    if (loreKeeperRewards && loreKeeperRewards.length > 0) {
      acquisitionInfo.loreKeeperRewards = loreKeeperRewards.map(row => ({
        npcName: row.npc_name,
        rewardType: row.puzzle_mode || 'puzzle',
        item: row.puzzle_reward_item
      }));
    }
    
    // 2. Check if any merchants sell this item
    const merchantItems = await verifier.query(
      `SELECT mi.room_id, r.name as room_name, m.name as map_name, mi.price, mi.buyable
       FROM merchant_items mi
       JOIN items i ON mi.item_id = i.id
       JOIN rooms r ON mi.room_id = r.id
       JOIN maps m ON r.map_id = m.id
       WHERE LOWER(i.name) = LOWER($1) AND mi.buyable = TRUE`,
      [itemName]
    );
    
    if (merchantItems && merchantItems.length > 0) {
      acquisitionInfo.merchantLocations = merchantItems.map(row => ({
        roomName: row.room_name,
        mapName: row.map_name,
        price: row.price || 0
      }));
    }
    
    // 3. Check if any NPCs produce this item as harvest output
    const npcOutputs = await verifier.query(
      `SELECT sn.id, sn.name as npc_name, sn.output_items, sn.npc_type
       FROM scriptable_npcs sn
       WHERE sn.output_items IS NOT NULL
       AND sn.output_items::text LIKE $1`,
      [`%${itemName}%`]
    );
    
    if (npcOutputs && npcOutputs.length > 0) {
      for (const npc of npcOutputs) {
        // output_items is now JSONB, so it's already an object
        try {
          const outputItems = typeof npc.output_items === 'string' 
            ? JSON.parse(npc.output_items) 
            : (npc.output_items || {});
            
          if (outputItems && typeof outputItems === 'object') {
            for (const [outputItem, quantity] of Object.entries(outputItems)) {
              if (outputItem.toLowerCase().includes(itemName.toLowerCase())) {
                acquisitionInfo.npcHarvestOutputs.push({
                  npcName: npc.npc_name,
                  npcType: npc.npc_type,
                  item: outputItem,
                  quantity: quantity
                });
              }
            }
          }
        } catch (parseError) {
          // Skip if JSON parsing fails
        }
      }
    }
    
    return acquisitionInfo;
  } catch (error) {
    console.error(`[ZORK] Error getting item acquisition info for ${itemName}:`, error.message);
    return { loreKeeperRewards: [], merchantLocations: [], npcHarvestOutputs: [] };
  }
}

/**
 * Resolve NPC name to NPC ID
 */
async function resolveNpcId(npcNameOrId) {
  // If it's already a number, return it
  if (typeof npcNameOrId === 'number') {
    return npcNameOrId;
  }
  
  // If it's a string that's a number, parse it
  if (typeof npcNameOrId === 'string' && /^\d+$/.test(npcNameOrId)) {
    return parseInt(npcNameOrId, 10);
  }
  
  // Otherwise, look up by name
  try {
    const npc = await verifier.queryOne(
      'SELECT id FROM scriptable_npcs WHERE LOWER(name) LIKE LOWER($1)',
      [`%${npcNameOrId}%`]
    );
    return npc?.id || null;
  } catch (error) {
    console.error(`[ZORK] Error resolving NPC ID for ${npcNameOrId}:`, error.message);
    return null;
  }
}

/**
 * Find room ID where an NPC is located
 */
async function findNpcRoomId(npcName) {
  try {
    // First find the NPC by name
    const npc = await verifier.queryOne(
      'SELECT id FROM scriptable_npcs WHERE LOWER(name) LIKE LOWER($1) LIMIT 1',
      [`%${npcName}%`]
    );
    
    if (!npc) {
      return null;
    }
    
    // Find which room(s) this NPC is in
    const roomNpc = await verifier.queryOne(
      'SELECT room_id FROM room_npcs WHERE npc_id = $1 AND active = TRUE LIMIT 1',
      [npc.id]
    );
    
    if (roomNpc) {
      console.log(`[ZORK] Found NPC "${npcName}" in room ID: ${roomNpc.room_id}`);
      return roomNpc.room_id;
    }
    
    return null;
  } catch (error) {
    console.error(`[ZORK] Error finding NPC room:`, error.message);
    return null;
  }
}

/**
 * Resolve room name/ID to room ID
 * Supports:
 * - Room ID (number or string)
 * - Room name (e.g., "Town Square")
 * - Map name (e.g., "Newhaven") - returns first room on that map, or "Town Square" if it exists
 * - "Map Name, Room Name" format (e.g., "Newhaven, Town Square")
 * - NPC name or "NPC's room" format (e.g., "Calder" or "Calder's room") - finds room where NPC is located
 * - Room type keywords (e.g., "factory", "shop", "warehouse") - finds rooms with matching room_type
 * - Room name containing keywords (e.g., "factory" finds "Resin Factory")
 * - Combined: "factory in new haven" - finds factory-type rooms or rooms with "factory" in name on New Haven map
 */
async function resolveRoomId(roomNameOrId) {
  // If it's already a number, return it
  if (typeof roomNameOrId === 'number') {
    return roomNameOrId;
  }
  
  // If it's a string that's a number, parse it
  if (typeof roomNameOrId === 'string' && /^\d+$/.test(roomNameOrId)) {
    return parseInt(roomNameOrId, 10);
  }
  
  // If "this room" or "current room", use current room ID
  if (typeof roomNameOrId === 'string' && (roomNameOrId.toLowerCase().includes('this') || roomNameOrId.toLowerCase().includes('current'))) {
    return currentRoomId;
  }
  
  // Check for NPC name or "NPC's room" format (e.g., "Calder" or "Calder's room")
  if (typeof roomNameOrId === 'string') {
    // Check if it looks like an NPC reference (contains apostrophe or is just a name)
    const npcNameMatch = roomNameOrId.match(/^(.+?)(?:'s\s+room)?$/i);
    if (npcNameMatch) {
      const npcName = npcNameMatch[1].trim();
      const npcRoomId = await findNpcRoomId(npcName);
      if (npcRoomId) {
        console.log(`[ZORK] Resolved "${roomNameOrId}" to NPC "${npcName}"'s room (ID: ${npcRoomId})`);
        return npcRoomId;
      }
    }
  }
  
  // Check for "Map Name, Room Name" format (e.g., "Newhaven, Town Square")
  if (typeof roomNameOrId === 'string' && roomNameOrId.includes(',')) {
    const parts = roomNameOrId.split(',').map(p => p.trim());
    if (parts.length === 2) {
      const [mapName, roomName] = parts;
      try {
        const room = await verifier.queryOne(
          `SELECT r.id FROM rooms r
           JOIN maps m ON r.map_id = m.id
           WHERE LOWER(m.name) LIKE LOWER($1) AND LOWER(r.name) LIKE LOWER($2)
           LIMIT 1`,
          [`%${mapName}%`, `%${roomName}%`]
        );
        if (room) {
          console.log(`[ZORK] Resolved "${mapName}, ${roomName}" to room ID: ${room.id}`);
          return room.id;
        }
      } catch (error) {
        console.error(`[ZORK] Error resolving room by map+name:`, error.message);
      }
    }
  }
  
  // Enhanced: Check for room type keywords or room name keywords with optional map filter
  // Examples: "factory", "factory in new haven", "a factory", "shop in town"
  if (typeof roomNameOrId === 'string') {
    const lowerInput = roomNameOrId.toLowerCase();
    
    // Common room type keywords
    const roomTypeKeywords = ['factory', 'shop', 'merchant', 'warehouse', 'normal'];
    
    // Try to extract map name and room type/keyword from patterns like:
    // "factory in new haven", "a factory", "shop in town", etc.
    let mapName = null;
    let roomKeyword = null;
    
    // Pattern: "keyword in mapname" or "a keyword in mapname"
    const inPattern = /(?:a\s+)?(\w+)\s+in\s+(.+)/i;
    const inMatch = lowerInput.match(inPattern);
    if (inMatch) {
      roomKeyword = inMatch[1].trim();
      mapName = inMatch[2].trim();
    } else {
      // Check if the whole input is a room type keyword
      const trimmed = lowerInput.trim();
      if (roomTypeKeywords.includes(trimmed) || trimmed.startsWith('a ') && roomTypeKeywords.includes(trimmed.substring(2))) {
        roomKeyword = trimmed.replace(/^a\s+/, '');
      } else {
        // Otherwise, treat the whole input as a potential room name/keyword
        roomKeyword = trimmed.replace(/^a\s+/, '');
      }
    }
    
    // If we found a room keyword, search for it
    if (roomKeyword) {
      try {
        // First, try exact room name match (highest priority)
        if (!mapName) {
          const exactRoom = await verifier.queryOne(
            'SELECT id FROM rooms WHERE LOWER(name) = LOWER($1) LIMIT 1',
            [roomKeyword]
          );
          if (exactRoom) {
            console.log(`[ZORK] Resolved exact room name "${roomKeyword}" to room ID: ${exactRoom.id}`);
            return exactRoom.id;
          }
        }
        
        // Build query for room name containing keyword OR room_type matching keyword
        let query = `
          SELECT r.id, r.name, r.room_type
          FROM rooms r
        `;
        const params = [];
        const conditions = [];
        
        // Add map filter if specified
        if (mapName) {
          query += ' JOIN maps m ON r.map_id = m.id';
          conditions.push(`LOWER(m.name) LIKE LOWER($${params.length + 1})`);
          params.push(`%${mapName}%`);
        }
        
        // Add room matching conditions
        const roomConditions = [];
        
        // 1. Room name contains the keyword
        roomConditions.push(`LOWER(r.name) LIKE LOWER($${params.length + 1})`);
        params.push(`%${roomKeyword}%`);
        
        // 2. Room type matches the keyword (if it's a known room type)
        if (roomTypeKeywords.includes(roomKeyword)) {
          roomConditions.push(`LOWER(r.room_type) = LOWER($${params.length + 1})`);
          params.push(roomKeyword);
        }
        
        if (roomConditions.length > 0) {
          conditions.push(`(${roomConditions.join(' OR ')})`);
        }
        
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        // Prioritize: exact name matches first, then room type matches
        // Add roomKeyword as parameters for ORDER BY (will be at index params.length + 1 and + 2)
        const orderByParam1 = params.length + 1;
        const orderByParam2 = params.length + 2;
        query += ` ORDER BY 
          CASE WHEN LOWER(r.name) = LOWER($${orderByParam1}) THEN 1 ELSE 2 END,
          CASE WHEN LOWER(r.room_type) = LOWER($${orderByParam2}) THEN 1 ELSE 2 END,
          r.name
          LIMIT 1`;
        params.push(roomKeyword);
        params.push(roomKeyword);
        
        const room = await verifier.queryOne(query, params);
        if (room) {
          console.log(`[ZORK] Resolved "${roomNameOrId}" to room "${room.name}" (ID: ${room.id}, type: ${room.room_type})`);
          return room.id;
        }
      } catch (error) {
        console.error(`[ZORK] Error resolving room by keyword/type:`, error.message);
      }
    }
  }
  
  // First, try to find by room name (fallback for non-keyword searches)
  try {
    const room = await verifier.queryOne(
      'SELECT id FROM rooms WHERE LOWER(name) LIKE LOWER($1) LIMIT 1',
      [`%${roomNameOrId}%`]
    );
    if (room) {
      return room.id;
    }
  } catch (error) {
    console.error(`[ZORK] Error resolving room by name:`, error.message);
  }
  
  // If room name lookup failed, try to find by map name
  // Look for "Town Square" on that map first, otherwise get first room
  try {
    const map = await verifier.queryOne(
      'SELECT id FROM maps WHERE LOWER(name) LIKE LOWER($1) LIMIT 1',
      [`%${roomNameOrId}%`]
    );
    if (map) {
      // Try to find "Town Square" on this map first
      const townSquare = await verifier.queryOne(
        'SELECT id FROM rooms WHERE map_id = $1 AND LOWER(name) LIKE LOWER($2) LIMIT 1',
        [map.id, '%town square%']
      );
      if (townSquare) {
        console.log(`[ZORK] Resolved map "${roomNameOrId}" to Town Square (room ID: ${townSquare.id})`);
        return townSquare.id;
      }
      
      // Otherwise, get the first room on this map
      const firstRoom = await verifier.queryOne(
        'SELECT id FROM rooms WHERE map_id = $1 ORDER BY x, y LIMIT 1',
        [map.id]
      );
      if (firstRoom) {
        console.log(`[ZORK] Resolved map "${roomNameOrId}" to first room (room ID: ${firstRoom.id})`);
        return firstRoom.id;
      }
    }
  } catch (error) {
    console.error(`[ZORK] Error resolving room by map name:`, error.message);
  }
  
  return null;
}

/**
 * Verify that an action was completed successfully by checking the database
 */
async function verifyActionCompleted(action, resolvedPlayerId, speakerName = null) {
  const { type, params } = action;
  
  try {
    // Wait a bit for database to commit
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (type === 'updatePlayer') {
      // Verify player stat was updated
      const playerId = resolvedPlayerId || params.player?.id;
      if (!playerId) {
        return { success: false, error: 'Could not verify - player ID missing' };
      }
      
      const player = await verifier.queryOne(
        'SELECT * FROM players WHERE id = $1',
        [playerId]
      );
      
      if (!player) {
        return { success: false, error: 'Player not found in database' };
      }
      
      // CRITICAL: Check that vitalis doesn't exceed max (safety check)
      const maxVitalis = player.resource_max_vitalis || 1000;
      if (player.resource_vitalis > maxVitalis) {
        return {
          success: false,
          error: `CRITICAL: Vitalis (${player.resource_vitalis}) exceeds max (${maxVitalis}). This should never happen!`,
          playerName: await getPlayerNameById(playerId)
        };
      }
      
      // Check each field that was supposed to be updated
      const expectedUpdates = params.player || {};
      const failedFields = [];
      
      for (const [field, expectedValue] of Object.entries(expectedUpdates)) {
        if (field === 'id') continue; // Skip ID field
        
        const actualValue = player[field];
        // Handle numeric comparisons (database might return strings)
        const actualNum = typeof actualValue === 'string' ? parseFloat(actualValue) : actualValue;
        const expectedNum = typeof expectedValue === 'string' ? parseFloat(expectedValue) : expectedValue;
        
        if (actualNum !== expectedNum) {
          failedFields.push(`${field}: expected ${expectedValue}, got ${actualValue}`);
        }
      }
      
      if (failedFields.length > 0) {
        return {
          success: false,
          error: `Update failed for: ${failedFields.join(', ')}`,
          playerName: await getPlayerNameById(playerId)
        };
      }
      
      return {
        success: true,
        message: `Player stats verified: ${Object.keys(expectedUpdates).filter(k => k !== 'id').join(', ')} updated`,
        playerName: await getPlayerNameById(playerId)
      };
    }
    
    if (type === 'removePlayerInventoryItem' || type === 'addPlayerInventoryItem') {
      // Verify inventory change
      const playerId = resolvedPlayerId || params.playerId;
      if (!playerId) {
        return { success: false, error: 'Could not verify - player ID missing' };
      }
      
      const item = await verifier.queryOne(
        'SELECT quantity FROM player_items WHERE player_id = $1 AND item_name = $2',
        [playerId, params.itemName]
      );
      
      if (type === 'removePlayerInventoryItem') {
        // For removal, item might not exist (quantity 0 or deleted)
        const expectedQty = params.quantity || 1;
        // If item exists, check quantity is correct
        if (item && item.quantity > 0) {
          // Item still exists, might be partial removal - this is harder to verify
          // For now, just check item exists (removal of all would delete it)
          return { success: true, message: 'Item removal verified' };
        } else if (!item || item.quantity === 0) {
          // Item removed completely - success
          return { success: true, message: 'Item completely removed' };
        }
      } else {
        // For addition, item should exist with correct quantity
        if (!item) {
          return {
            success: false,
            error: `Item ${params.itemName} not found in inventory after addition`,
            playerName: await getPlayerNameById(playerId)
          };
        }
        return { success: true, message: `Item added: ${item.quantity} ${params.itemName}` };
      }
    }
    
    if (type === 'addNpcToRoom') {
      // Verify NPC is in room
      const roomId = params.roomId;
      const npcId = params.npcId;
      
      if (!roomId || !npcId) {
        return { success: false, error: 'Could not verify - room ID or NPC ID missing' };
      }
      
      const placement = await verifier.queryOne(
        'SELECT id FROM room_npcs WHERE room_id = $1 AND npc_id = $2',
        [roomId, npcId]
      );
      
      if (!placement) {
        return { success: false, error: 'NPC not found in room after placement' };
      }
      
      return { success: true, message: 'NPC successfully placed in room' };
    }
    
    // For other actions, assume success (can't easily verify)
    return { success: true, message: 'Action sent (verification not implemented for this type)' };
    
  } catch (error) {
    console.error(`[ZORK] Verification error:`, error.message);
    return { success: false, error: `Verification failed: ${error.message}` };
  }
}

/**
 * Get player name by ID
 */
async function getPlayerNameById(playerId) {
  try {
    const player = await verifier.queryOne(
      'SELECT name FROM players WHERE id = $1',
      [playerId]
    );
    return player?.name || 'Unknown';
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Refresh server cache via internal API endpoint
 * @param {string} cacheType - 'markup', 'messages', or 'all'
 */
/**
 * Refresh server cache via internal API endpoint
 * @param {string} cacheType - 'markup', 'messages', or 'all'
 */
async function refreshServerCache(cacheType = 'all') {
  try {
    const http = require('http');
    const https = require('https');
    const url = require('url');
    
    const serverUrl = new URL(CONFIG.HTTP_URL);
    const cacheToken = process.env.INTERNAL_CACHE_TOKEN || 'internal-cache-refresh-token';
    const isHttps = serverUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const postData = JSON.stringify({ cacheType });
    const options = {
      hostname: serverUrl.hostname,
      port: serverUrl.port || (isHttps ? 443 : 80),
      path: '/api/internal/refresh-cache',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-internal-token': cacheToken
      },
      timeout: 5000 // 5 second timeout
    };
    
    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`[ZORK] Successfully refreshed ${cacheType} cache on server`);
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({ success: true });
            }
          } else {
            console.warn(`[ZORK] Cache refresh returned status ${res.statusCode}: ${data}`);
            resolve(null); // Don't fail the action if cache refresh fails
          }
        });
      });
      
      req.on('error', (error) => {
        console.warn(`[ZORK] Failed to refresh cache (non-critical): ${error.message}`);
        resolve(null); // Don't fail the action if cache refresh fails
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.warn(`[ZORK] Cache refresh request timed out (non-critical)`);
        resolve(null);
      });
      
      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.warn(`[ZORK] Error refreshing cache (non-critical): ${error.message}`);
    return null; // Don't fail the action if cache refresh fails
  }
}

/**
 * Execute a god-mode action
 */
async function executeAction(action, speakerName = null) {
  const { type, params } = action;
  
  console.log(`[ZORK] Executing action: ${type}`, JSON.stringify(params, null, 2));
  
  try {
    if (type === 'sql') {
      // Direct SQL query
      const result = await verifier.query(params.query, params.params || []);
      console.log(`[ZORK] SQL executed, rows returned: ${result.rows?.length || 0}, rowCount: ${result.rowCount}`);
      // Return the full result including rows for display
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        command: result.command || 'SELECT'
      };
    }
    
    // Connection management actions (ZORK-specific)
    if (type === 'disconnectZork') {
      console.log('[ZORK] Disconnecting on command...');
      if (client && client.connected) {
        // Clean disconnect - don't trigger reconnect
        isReconnecting = false;
        reconnectAttempts = 0;
        if (client.ws) {
          client.ws.removeAllListeners('close'); // Remove close handler to prevent auto-reconnect
        }
        client.disconnect();
        client.connected = false;
        client.authenticated = false;
        console.log('[ZORK] Disconnected successfully');
        return { success: true, message: 'ZORK disconnected from the game' };
      } else {
        console.log('[ZORK] Already disconnected');
        return { success: true, message: 'ZORK is already disconnected' };
      }
    }
    
    if (type === 'reconnectZork') {
      console.log('[ZORK] Reconnecting on command...');
      if (client && client.connected) {
        console.log('[ZORK] Already connected');
        return { success: true, message: 'ZORK is already connected', connected: true };
      }
      
      // Reset reconnection state
      isReconnecting = false;
      reconnectAttempts = 0;
      consecutiveConnectionRefused = 0;
      
      // Attempt to connect
      try {
        await connect();
        return { success: true, message: 'ZORK reconnected successfully', connected: true };
      } catch (error) {
        console.error('[ZORK] Reconnection failed:', error.message);
        return { success: false, message: `Reconnection failed: ${error.message}`, connected: false };
      }
    }
    
    if (type === 'getZorkConnectionStatus') {
      const status = {
        connected: client?.connected || false,
        authenticated: client?.authenticated || false,
        currentRoomId: currentRoomId,
        currentRoom: currentRoom?.name || null,
        isReconnecting: isReconnecting,
        reconnectAttempts: reconnectAttempts,
        lastSuccessfulConnectionTime: lastSuccessfulConnectionTime ? new Date(lastSuccessfulConnectionTime).toISOString() : null
      };
      console.log('[ZORK] Connection status:', status);
      return { success: true, status };
    }
    
    // Read canon document action
    if (type === 'readCanonDocument' || type === 'readDocument') {
      const docName = params.document || params.doc || params.name;
      if (!docName) {
        return { success: false, error: 'Document name is required' };
      }
      
      // Only allow reading canonical documents (numbered docs in /docs root)
      // Block 999-* reference documents in /docs/Chuck docs/
      const isCanonical = /^(00|10|20|30|50)-\d+/.test(docName);
      if (!isCanonical && !docName.endsWith('.md')) {
        // Try to find the document with .md extension
        const docPath = path.join(__dirname, '..', 'docs', `${docName}.md`);
        if (fs.existsSync(docPath)) {
          const content = fs.readFileSync(docPath, 'utf-8');
          return { success: true, document: docName, content };
        }
      }
      
      // Construct path to canonical document
      const docPath = path.join(__dirname, '..', 'docs', docName.endsWith('.md') ? docName : `${docName}.md`);
      
      // Security: Ensure the path is within the docs directory
      const docsDir = path.join(__dirname, '..', 'docs');
      const resolvedPath = path.resolve(docPath);
      const resolvedDocsDir = path.resolve(docsDir);
      
      if (!resolvedPath.startsWith(resolvedDocsDir)) {
        return { success: false, error: 'Invalid document path' };
      }
      
      // Block reading 999-* reference documents
      if (docName.includes('999-') || docName.includes('Chuck docs')) {
        return { success: false, error: 'Cannot read reference documents (999-*). Only canonical documents are accessible.' };
      }
      
      if (!fs.existsSync(docPath)) {
        return { success: false, error: `Document not found: ${docName}` };
      }
      
      try {
        const content = fs.readFileSync(docPath, 'utf-8');
        console.log(`[ZORK] Read canon document: ${docName} (${content.length} characters)`);
        return { success: true, document: docName, content };
      } catch (error) {
        console.error(`[ZORK] Error reading document ${docName}:`, error.message);
        return { success: false, error: `Failed to read document: ${error.message}` };
      }
    }
    
    // Resolve player names to IDs for player-related commands
    const playerCommands = ['removePlayerInventoryItem', 'addPlayerInventoryItem', 'updatePlayer', 'getPlayerInventory'];
    let resolvedPlayerId = null;
    
    if (playerCommands.includes(type)) {
      // Get player name/ID from params
      const playerNameOrId = params.playerName || params.playerId;
      
      if (playerNameOrId) {
        resolvedPlayerId = await resolvePlayerId(playerNameOrId);
        if (!resolvedPlayerId) {
          console.error(`[ZORK] Could not resolve player ID for: ${playerNameOrId}`);
          return;
        }
        params.playerId = resolvedPlayerId;
        delete params.playerName; // Remove playerName, use playerId instead
        console.log(`[ZORK] Resolved player to ID: ${playerNameOrId} -> ${resolvedPlayerId}`);
      }
      
      // Special handling for updatePlayer - needs { player: { id, ...fields } } format
      if (type === 'updatePlayer') {
        // Get current player data to validate vitalis
        const currentPlayer = await verifier.queryOne(
          'SELECT resource_max_vitalis, resource_vitalis FROM players WHERE id = $1',
          [resolvedPlayerId]
        );
        
        if (!currentPlayer) {
          console.error(`[ZORK] Player not found for ID: ${resolvedPlayerId}`);
          return;
        }
        
        const maxVitalis = currentPlayer.resource_max_vitalis || 1000;
        
        // Extract all stat/field updates from params (everything except playerId, playerName)
        const playerUpdates = { id: resolvedPlayerId };
        for (const [key, value] of Object.entries(params)) {
          if (key !== 'playerId' && key !== 'playerName') {
            // Handle "full" or "max" for vitalis - resolve to actual max value
            if (key === 'resource_vitalis') {
              let vitalisValue = value;
              
              // Resolve "full", "max", or values >= 999999 to actual max
              if (value === 'full' || value === 'max' || (typeof value === 'number' && value >= 999999)) {
                vitalisValue = maxVitalis;
                console.log(`[ZORK] Resolved "full" vitalis to max: ${maxVitalis}`);
              }
              
              // CRITICAL: Never allow vitalis to exceed max (safety check)
              if (typeof vitalisValue === 'number' && vitalisValue > maxVitalis) {
                console.warn(`[ZORK] Attempted to set vitalis (${vitalisValue}) above max (${maxVitalis}). Capping to max.`);
                vitalisValue = maxVitalis;
              }
              
              // Ensure not negative
              if (typeof vitalisValue === 'number' && vitalisValue < 0) {
                vitalisValue = 0;
              }
              
              playerUpdates[key] = vitalisValue;
            } else if (key === 'current_room_id') {
              // Resolve room name to room ID for transportation
              if (typeof value === 'string' && !/^\d+$/.test(value)) {
                const roomId = await resolveRoomId(value);
                if (!roomId) {
                  console.error(`[ZORK] ❌ CRITICAL: Could not resolve room ID for: "${value}". Transportation will fail.`);
                  // Don't return - let the action fail so verification can catch it
                  // But log a clear error
                  action.verificationFailed = true;
                  action.verificationError = `Could not resolve room name "${value}" to a room ID. Try using a specific room name like "Town Square" or "Newhaven, Town Square".`;
                  return; // Still return to prevent sending invalid command
                }
                playerUpdates[key] = roomId;
                console.log(`[ZORK] ✅ Resolved room name to ID for transportation: "${value}" -> ${roomId}`);
              } else {
                playerUpdates[key] = value;
              }
            } else {
              playerUpdates[key] = value;
            }
          }
        }
        // Replace ALL params with ONLY the player object
        Object.keys(params).forEach(key => delete params[key]);
        params.player = playerUpdates;
        console.log(`[ZORK] Formatted updatePlayer with player object:`, JSON.stringify(playerUpdates, null, 2));
      }
      
      // Handle "remove all" case - get current quantity
      if (type === 'removePlayerInventoryItem' && (!params.quantity || params.quantity === 'all' || params.quantity >= 999999)) {
        const currentQty = await getPlayerItemQuantity(resolvedPlayerId, params.itemName);
        if (currentQty > 0) {
          params.quantity = currentQty;
          console.log(`[ZORK] Resolved "all" to actual quantity: ${currentQty}`);
        } else {
          console.log(`[ZORK] Player has no ${params.itemName} to remove`);
          return;
        }
      }
    }
    
    // Resolve NPC names to IDs for NPC-related commands
    const npcCommands = ['addNpcToRoom', 'removeNpcFromRoom', 'updateNPC'];
    if (npcCommands.includes(type) && params.npcName) {
      const npcId = await resolveNpcId(params.npcName);
      if (!npcId) {
        console.error(`[ZORK] Could not resolve NPC ID for: ${params.npcName}`);
        return;
      }
      params.npcId = npcId;
      delete params.npcName;
      console.log(`[ZORK] Resolved NPC to ID: ${params.npcName} -> ${npcId}`);
    }
    
    // Also handle if npcId is passed as a name string
    if (npcCommands.includes(type) && params.npcId && typeof params.npcId === 'string' && !/^\d+$/.test(params.npcId)) {
      const npcId = await resolveNpcId(params.npcId);
      if (!npcId) {
        console.error(`[ZORK] Could not resolve NPC ID for: ${params.npcId}`);
        return;
      }
      params.npcId = npcId;
      console.log(`[ZORK] Resolved npcId string to ID: ${params.npcId} -> ${npcId}`);
    }
    
    // Resolve room names/IDs for room-related commands
    const roomCommands = ['addNpcToRoom', 'addItemToRoom', 'updateRoom', 'deleteRoom'];
    if (roomCommands.includes(type)) {
      // Handle roomId
      if (params.roomName) {
        const roomId = await resolveRoomId(params.roomName);
        if (!roomId) {
          console.error(`[ZORK] Could not resolve room ID for: ${params.roomName}`);
          return;
        }
        params.roomId = roomId;
        delete params.roomName;
        console.log(`[ZORK] Resolved room to ID: ${params.roomName} -> ${roomId}`);
      }
      
      // Also handle if roomId is passed as a name string or "this room"
      if (params.roomId && typeof params.roomId === 'string' && !/^\d+$/.test(params.roomId)) {
        const roomId = await resolveRoomId(params.roomId);
        if (!roomId) {
          console.error(`[ZORK] Could not resolve room ID for: ${params.roomId}`);
          return;
        }
        params.roomId = roomId;
        console.log(`[ZORK] Resolved roomId string to ID: ${params.roomId} -> ${roomId}`);
      }
      
      // If no roomId specified and it's a room command, use current room
      if (!params.roomId && currentRoomId) {
        params.roomId = currentRoomId;
        console.log(`[ZORK] Using current room ID: ${currentRoomId}`);
      }
    }
    
    // Handle connection management commands (return early, don't send via WebSocket)
    if (type === 'disconnectZork' || type === 'reconnectZork' || type === 'getZorkConnectionStatus' || type === 'readCanonDocument' || type === 'readDocument') {
      // These actions are handled above and return early
      // They don't need WebSocket communication
      return;
    }
    
    // Handle markup commands (direct database operations - return early, don't send via WebSocket)
    // Knowledge management actions
    if (type === 'learnKnowledge' || type === 'addZorkKnowledge') {
      try {
        const { category = 'learned_context', subcategory = null, title, content, priority = 1, source = 'zork', addedBy = speakerName } = params;
        
        if (!title || !content) {
          throw new Error('title and content are required');
        }
        
        // Import the knowledge utility
        const { storeKnowledgeWithEmbedding } = require('../utils/zorkKnowledge');
        
        // Store knowledge with embedding
        // Note: storeKnowledgeWithEmbedding expects db as first param, then category, subcategory, title, content, priority, source, addedBy
        const knowledge = await storeKnowledgeWithEmbedding(
          db, // database module
          category,
          subcategory,
          title,
          content,
          priority,
          source,
          addedBy
        );
        
        console.log(`[ZORK] Learned new knowledge: "${title}" (ID: ${knowledge.id}, Category: ${category})`);
        
        return knowledge;
      } catch (error) {
        console.error(`[ZORK] Error learning knowledge:`, error.message);
        throw error;
      }
    }
    
    // Create ticket for Cursor to fix
    if (type === 'createTicket') {
      try {
        const {
          title,
          description,
          reproSteps = null,
          priority = 2, // Default to medium priority
          ticketType = 'manual', // 'debug' (from telemetry), 'manual' (ZORK direct), 'user'
          estimatedEffort = null,
          tags = [],
          environment = null,
          logs = null
        } = params;
        
        if (!title || !description) {
          throw new Error('title and description are required');
        }
        
        // Validate priority
        if (priority < 1 || priority > 4) {
          throw new Error('priority must be between 1 and 4');
        }
        
        // Create ticket in database
        const ticket = await db.createDebugTodo({
          sessionId: null, // Manual tickets don't have a session
          title: title,
          description: description,
          reproSteps: reproSteps,
          environment: environment || {},
          logs: logs || {},
          createdBy: 'zork'
        });
        
        // Update ticket-specific fields
        await db.query(
          'UPDATE debug_todos SET ticket_type = $1, priority = $2, estimated_effort = $3, tags = $4 WHERE id = $5',
          [ticketType, priority, estimatedEffort, JSON.stringify(tags), ticket.id]
        );
        
        // Get updated ticket
        const updatedTicket = await db.getDebugTodo(ticket.id);
        
        console.log(`[ZORK] Created ticket #${updatedTicket.id}: "${title}" (Priority: ${priority}, Type: ${ticketType})`);
        
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
          const triggerFile = path.join(ticketsDir, `ticket-${updatedTicket.id}.trigger`);
          fs.writeFileSync(triggerFile, JSON.stringify({
            ticketId: updatedTicket.id,
            title: title,
            priority: priority,
            ticketType: ticketType,
            createdBy: 'zork',
            timestamp: new Date().toISOString()
          }, null, 2));
          
          console.log(`[ZORK] Created trigger file for auto-processing: ${triggerFile}`);
        } catch (triggerError) {
          // Don't fail ticket creation if trigger file creation fails
          console.warn('[ZORK] Failed to create trigger file (non-fatal):', triggerError.message);
        }
        
        return updatedTicket;
      } catch (error) {
        console.error(`[ZORK] Error creating ticket:`, error.message);
        throw error;
      }
    }
    
    // Get tickets (list tickets with optional filters)
    if (type === 'getTickets' || type === 'listTickets') {
      try {
        const {
          status = 'open', // 'open', 'in_progress', 'resolved', or null for all
          limit = 50,
          priority = null,
          ticketType = null
        } = params;
        
        let tickets;
        if (status) {
          tickets = await db.listDebugTodos({ status, limit });
        } else {
          // Get all tickets
          tickets = await db.listDebugTodos({ limit });
        }
        
        // Filter by priority if specified
        if (priority !== null) {
          tickets = tickets.filter(t => t.priority === priority);
        }
        
        // Filter by ticket type if specified
        if (ticketType) {
          tickets = tickets.filter(t => t.ticket_type === ticketType);
        }
        
        // Sort by priority (descending), then by created_at (ascending)
        tickets.sort((a, b) => {
          if (b.priority !== a.priority) {
            return (b.priority || 2) - (a.priority || 2);
          }
          return new Date(a.created_at) - new Date(b.created_at);
        });
        
        console.log(`[ZORK] Retrieved ${tickets.length} ticket(s) with status=${status || 'all'}`);
        
        return {
          count: tickets.length,
          tickets: tickets,
          summary: tickets.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            ticket_type: t.ticket_type,
            created_at: t.created_at
          }))
        };
      } catch (error) {
        console.error(`[ZORK] Error getting tickets:`, error.message);
        throw error;
      }
    }
    
    // Get a specific ticket by ID
    if (type === 'getTicket') {
      try {
        const { id } = params;
        
        if (!id) {
          throw new Error('ticket id is required');
        }
        
        const ticket = await db.getDebugTodo(id);
        
        if (!ticket) {
          return { error: `Ticket #${id} not found` };
        }
        
        console.log(`[ZORK] Retrieved ticket #${id}: "${ticket.title}"`);
        
        return ticket;
      } catch (error) {
        console.error(`[ZORK] Error getting ticket:`, error.message);
        throw error;
      }
    }
    
    // Get ticket summary (counts by status)
    if (type === 'getTicketSummary') {
      try {
        const allTickets = await db.listDebugTodos({ limit: 1000 }); // Get all tickets
        
        const summary = {
          total: allTickets.length,
          byStatus: {
            open: allTickets.filter(t => t.status === 'open').length,
            in_progress: allTickets.filter(t => t.status === 'in_progress').length,
            resolved: allTickets.filter(t => t.status === 'resolved').length
          },
          byPriority: {
            critical: allTickets.filter(t => t.priority === 4).length,
            high: allTickets.filter(t => t.priority === 3).length,
            medium: allTickets.filter(t => t.priority === 2).length,
            low: allTickets.filter(t => t.priority === 1).length
          },
          byType: {
            debug: allTickets.filter(t => t.ticket_type === 'debug').length,
            manual: allTickets.filter(t => t.ticket_type === 'manual').length,
            user: allTickets.filter(t => t.ticket_type === 'user').length
          },
          recent: allTickets
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10)
            .map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              created_at: t.created_at
            }))
        };
        
        console.log(`[ZORK] Generated ticket summary: ${summary.total} total tickets`);
        
        return summary;
      } catch (error) {
        console.error(`[ZORK] Error getting ticket summary:`, error.message);
        throw error;
      }
    }
    
    if (type === 'getMarkupConventions') {
      try {
        const conventions = await verifier.query(
          'SELECT * FROM markup_conventions ORDER BY created_at ASC'
        );
        console.log(`[ZORK] Retrieved ${conventions.rows.length} markup conventions`);
        return conventions.rows;
      } catch (error) {
        console.error(`[ZORK] Error getting markup conventions:`, error.message);
        throw error;
      }
    }
    
    if (type === 'createMarkupConvention') {
      try {
        const { syntax, opening, closing, description, example, color, effects } = params;
        if (!syntax || !opening || !closing) {
          throw new Error('syntax, opening, and closing are required');
        }
        
        const now = Date.now();
        const result = await verifier.query(
          `INSERT INTO markup_conventions (syntax, opening, closing, description, example, color, effects, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [syntax, opening, closing, description || null, example || null, color || null, JSON.stringify(effects || {}), now, now]
        );
        
        // verifier.query() returns an array directly, not {rows: [...]}
        if (!result || result.length === 0) {
          throw new Error('Failed to create markup convention');
        }
        
        console.log(`[ZORK] Created markup convention: ${syntax} (ID: ${result[0].id})`);
        
        // Refresh markup cache on server
        await refreshServerCache('markup');
        
        return result[0];
      } catch (error) {
        console.error(`[ZORK] Error creating markup convention:`, error.message);
        throw error;
      }
    }
    
    if (type === 'updateMarkupConvention') {
      try {
        const { conventionId, syntax, opening, closing, description, example, color, effects } = params;
        if (!conventionId) {
          throw new Error('conventionId is required');
        }
        
        const now = Date.now();
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (syntax !== undefined) { updates.push(`syntax = $${paramIndex++}`); values.push(syntax); }
        if (opening !== undefined) { updates.push(`opening = $${paramIndex++}`); values.push(opening); }
        if (closing !== undefined) { updates.push(`closing = $${paramIndex++}`); values.push(closing); }
        if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
        if (example !== undefined) { updates.push(`example = $${paramIndex++}`); values.push(example); }
        if (color !== undefined) { updates.push(`color = $${paramIndex++}`); values.push(color); }
        if (effects !== undefined) { updates.push(`effects = $${paramIndex++}`); values.push(JSON.stringify(effects)); }
        updates.push(`updated_at = $${paramIndex++}`); values.push(now);
        values.push(conventionId);
        
        const result = await verifier.query(
          `UPDATE markup_conventions
           SET ${updates.join(', ')}
           WHERE id = $${paramIndex}
           RETURNING *`,
          values
        );
        
        // verifier.query() returns an array directly, not {rows: [...]}
        if (!result || result.length === 0) {
          throw new Error(`Convention with ID ${conventionId} not found`);
        }
        
        console.log(`[ZORK] Updated markup convention: ${conventionId}`);
        
        // Refresh markup cache on server
        await refreshServerCache('markup');
        
        return result[0];
      } catch (error) {
        console.error(`[ZORK] Error updating markup convention:`, error.message);
        throw error;
      }
    }
    
    if (type === 'deleteMarkupConvention') {
      try {
        const { conventionId } = params;
        if (!conventionId) {
          throw new Error('conventionId is required');
        }
        
        await verifier.query(
          'DELETE FROM markup_conventions WHERE id = $1',
          [conventionId]
        );
        
        console.log(`[ZORK] Deleted markup convention: ${conventionId}`);
        
        // Refresh markup cache on server
        await refreshServerCache('markup');
        
        return { success: true };
      } catch (error) {
        console.error(`[ZORK] Error deleting markup convention:`, error.message);
        throw error;
      }
    }
    
    if (type === 'updateBuiltInMarkupEdit') {
      try {
        const { conventionKey, syntax, example } = params;
        if (!conventionKey) {
          throw new Error('conventionKey is required');
        }
        
        const now = Date.now();
        const result = await verifier.query(
          `INSERT INTO markup_builtin_edits (convention_key, syntax, example, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (convention_key)
           DO UPDATE SET
             syntax = EXCLUDED.syntax,
             example = EXCLUDED.example,
             updated_at = EXCLUDED.updated_at
           RETURNING *`,
          [conventionKey, syntax || null, example || null, now]
        );
        
        // verifier.query() returns an array directly, not {rows: [...]}
        if (!result || result.length === 0) {
          throw new Error('Failed to update built-in markup edit');
        }
        
        console.log(`[ZORK] Updated built-in markup edit: ${conventionKey}`);
        
        // Refresh markup cache on server
        await refreshServerCache('markup');
        
        return result[0];
      } catch (error) {
        console.error(`[ZORK] Error updating built-in markup edit:`, error.message);
        throw error;
      }
    }
    
    // Game message commands (direct database operations)
    if (type === 'getGameMessage') {
      try {
        const { messageKey, messageId } = params;
        
        // Support both key and ID lookup
        if (messageId) {
          const message = await verifier.queryOne(
            'SELECT * FROM game_messages WHERE id = $1',
            [messageId]
          );
          if (!message) {
            throw new Error(`Game message with ID ${messageId} not found`);
          }
          console.log(`[ZORK] Retrieved game message by ID: ${messageId} (${message.message_key})`);
          return message;
        }
        
        if (!messageKey) {
          throw new Error('messageKey or messageId is required');
        }
        
        const message = await verifier.queryOne(
          'SELECT * FROM game_messages WHERE message_key = $1',
          [messageKey]
        );
        
        if (!message) {
          throw new Error(`Game message with key "${messageKey}" not found`);
        }
        
        console.log(`[ZORK] Retrieved game message: ${messageKey}`);
        return message;
      } catch (error) {
        console.error(`[ZORK] Error getting game message:`, error.message);
        throw error;
      }
    }
    
    if (type === 'getAllGameMessages') {
      try {
        const { category } = params;
        let query = 'SELECT * FROM game_messages';
        let queryParams = [];
        
        if (category) {
          query += ' WHERE category = $1';
          queryParams.push(category);
        }
        
        query += ' ORDER BY message_key';
        
        const messages = await verifier.query(query, queryParams);
        // verifier.query() returns an array directly, not {rows: [...]}
        console.log(`[ZORK] Retrieved ${messages.length} game messages${category ? ` (category: ${category})` : ''}`);
        return messages;
      } catch (error) {
        console.error(`[ZORK] Error getting game messages:`, error.message);
        throw error;
      }
    }
    
    if (type === 'updateGameMessage') {
      try {
        const { messageKey, messageTemplate, description } = params;
        if (!messageKey) {
          throw new Error('messageKey is required');
        }
        if (!messageTemplate) {
          throw new Error('messageTemplate is required');
        }
        
        const now = Date.now();
        const result = await verifier.query(
          `UPDATE game_messages 
           SET message_template = $1, 
               description = COALESCE($2, description),
               updated_at = $3
           WHERE message_key = $4
           RETURNING *`,
          [messageTemplate, description || null, now, messageKey]
        );
        
        // verifier.query() returns an array directly, not {rows: [...]}
        if (!result || result.length === 0) {
          throw new Error(`Game message with key "${messageKey}" not found`);
        }
        
        console.log(`[ZORK] Updated game message: ${messageKey}`);
        
        // Refresh message cache on server
        await refreshServerCache('messages');
        
        return result[0];
      } catch (error) {
        console.error(`[ZORK] Error updating game message:`, error.message);
        throw error;
      }
    }
    
    // NPC keyword/message commands (direct database operations)
    if (type === 'getNPCKeywords') {
      try {
        const { npcId, npcName } = params;
        let resolvedNpcId = npcId;
        
        // Resolve NPC name to ID if needed
        if (npcName && !resolvedNpcId) {
          resolvedNpcId = await resolveNpcId(npcName);
          if (!resolvedNpcId) {
            throw new Error(`NPC "${npcName}" not found`);
          }
        }
        
        if (!resolvedNpcId) {
          throw new Error('npcId or npcName is required');
        }
        
        const loreKeeper = await verifier.queryOne(
          'SELECT keywords_responses FROM lore_keepers WHERE npc_id = $1',
          [resolvedNpcId]
        );
        
        if (!loreKeeper) {
          throw new Error(`Lore Keeper config not found for NPC ID ${resolvedNpcId}`);
        }
        
        // keywords_responses is now JSONB, so it's already an object
        const keywords = loreKeeper.keywords_responses || {};
        console.log(`[ZORK] Retrieved keywords for NPC ID ${resolvedNpcId}:`, Object.keys(keywords).length, 'keywords');
        return { npcId: resolvedNpcId, keywords };
      } catch (error) {
        console.error(`[ZORK] Error getting NPC keywords:`, error.message);
        throw error;
      }
    }
    
    if (type === 'updateNPCKeyword') {
      try {
        const { npcId, npcName, keyword, response } = params;
        let resolvedNpcId = npcId;
        
        // Resolve NPC name to ID if needed
        if (npcName && !resolvedNpcId) {
          resolvedNpcId = await resolveNpcId(npcName);
          if (!resolvedNpcId) {
            throw new Error(`NPC "${npcName}" not found`);
          }
        }
        
        if (!resolvedNpcId) {
          throw new Error('npcId or npcName is required');
        }
        if (!keyword) {
          throw new Error('keyword is required');
        }
        if (!response) {
          throw new Error('response is required');
        }
        
        // Get current keywords
        const loreKeeper = await verifier.queryOne(
          'SELECT keywords_responses FROM lore_keepers WHERE npc_id = $1',
          [resolvedNpcId]
        );
        
        if (!loreKeeper) {
          throw new Error(`Lore Keeper config not found for NPC ID ${resolvedNpcId}`);
        }
        
        // Update keywords JSON
        // keywords_responses is now JSONB, so it's already an object
        const keywords = loreKeeper.keywords_responses || {};
        keywords[keyword.toLowerCase()] = response;
        
        await verifier.query(
          'UPDATE lore_keepers SET keywords_responses = $1, updated_at = NOW() WHERE npc_id = $2',
          [JSON.stringify(keywords), resolvedNpcId]
        );
        
        console.log(`[ZORK] Updated keyword "${keyword}" for NPC ID ${resolvedNpcId}`);
        return { npcId: resolvedNpcId, keyword, response };
      } catch (error) {
        console.error(`[ZORK] Error updating NPC keyword:`, error.message);
        throw error;
      }
    }
    
    if (type === 'deleteNPCKeyword') {
      try {
        const { npcId, npcName, keyword } = params;
        let resolvedNpcId = npcId;
        
        // Resolve NPC name to ID if needed
        if (npcName && !resolvedNpcId) {
          resolvedNpcId = await resolveNpcId(npcName);
          if (!resolvedNpcId) {
            throw new Error(`NPC "${npcName}" not found`);
          }
        }
        
        if (!resolvedNpcId) {
          throw new Error('npcId or npcName is required');
        }
        if (!keyword) {
          throw new Error('keyword is required');
        }
        
        // Get current keywords
        const loreKeeper = await verifier.queryOne(
          'SELECT keywords_responses FROM lore_keepers WHERE npc_id = $1',
          [resolvedNpcId]
        );
        
        if (!loreKeeper) {
          throw new Error(`Lore Keeper config not found for NPC ID ${resolvedNpcId}`);
        }
        
        // Remove keyword from JSON
        // keywords_responses is now JSONB, so it's already an object
        const keywords = loreKeeper.keywords_responses || {};
        delete keywords[keyword.toLowerCase()];
        
        await verifier.query(
          'UPDATE lore_keepers SET keywords_responses = $1, updated_at = NOW() WHERE npc_id = $2',
          [JSON.stringify(keywords), resolvedNpcId]
        );
        
        console.log(`[ZORK] Deleted keyword "${keyword}" from NPC ID ${resolvedNpcId}`);
        return { npcId: resolvedNpcId, keyword, deleted: true };
      } catch (error) {
        console.error(`[ZORK] Error deleting NPC keyword:`, error.message);
        throw error;
      }
    }
    
    // Handle connection management commands (return early, don't send via WebSocket)
    if (type === 'disconnectZork' || type === 'reconnectZork' || type === 'getZorkConnectionStatus' || type === 'readCanonDocument' || type === 'readDocument') {
      // These actions are handled above and return early
      // They don't need WebSocket communication
      return;
    }
    
    // Send as WebSocket command (for non-markup actions)
    if (client && client.connected) {
      // For updatePlayer, only send type and player object (no other params)
      let command;
      if (type === 'updatePlayer') {
        command = { type, player: params.player };
      } else {
        command = { type, ...params };
      }
      console.log(`[ZORK] Sending WebSocket command:`, JSON.stringify(command, null, 2));
      client.send(command);
      
      // Wait for response or completion
      // Longer wait for createNPC to ensure database commit before addNpcToRoom
      const waitTime = type === 'createNPC' ? 2000 : 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Verify action completed by checking database
      const verificationResult = await verifyActionCompleted(action, resolvedPlayerId, speakerName);
      if (!verificationResult.success) {
        console.error(`[ZORK] ❌ Action verification FAILED: ${verificationResult.error}`);
        // Store verification failure - will be sent to player after response
        action.verificationFailed = true;
        action.verificationError = verificationResult.error;
        action.verificationPlayerName = verificationResult.playerName || speakerName;
      } else {
        console.log(`[ZORK] ✅ Action verified: ${verificationResult.message}`);
      }
      
      // Refresh room view to see changes (especially for addNpcToRoom and player transportation)
      if (type === 'addNpcToRoom' || type === 'createNPC') {
        // Extra wait and refresh for NPC placement
        await new Promise(resolve => setTimeout(resolve, 500));
        client.send({ type: 'look' });
      } else if (type === 'updatePlayer' && params.player?.current_room_id) {
        // Player was transported - refresh room view after a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        client.send({ type: 'look' });
      } else {
        client.send({ type: 'look' });
      }
      
      console.log(`[ZORK] Action ${type} completed and verified`);
    } else {
      console.error('[ZORK] Cannot execute action - not connected');
    }
  } catch (error) {
    console.error(`[ZORK] Action execution error: ${error.message}`);
    console.error(`[ZORK] Stack:`, error.stack);
  }
}

// ============================================================================
// RESPONSE SENDING
// ============================================================================

/**
 * Send a response with human-like typing delay
 */
async function sendResponse(recipient, message, method) {
  if (!message || !client?.connected) return;
  
  // Calculate typing delay based on message length
  const baseDelay = CONFIG.MIN_RESPONSE_DELAY;
  const typingDelay = message.length * CONFIG.TYPING_DELAY_MS_PER_CHAR;
  const randomDelay = Math.random() * CONFIG.MAX_RESPONSE_DELAY;
  const totalDelay = Math.min(baseDelay + typingDelay + randomDelay, 5000);
  
  console.log(`[ZORK] Responding in ${Math.round(totalDelay)}ms...`);
  
  await new Promise(resolve => setTimeout(resolve, totalDelay));
  
  if (method === 'telepath') {
    // Send private telepath
    client.send({
      type: 'telepath',
      targetPlayer: recipient,
      message: message
    });
    console.log(`[ZORK] -> Telepath to ${stripPlayerName(recipient)}: ${message}`);
  } else {
    // Send room talk
    client.send({
      type: 'talk',
      message: message
    });
    console.log(`[ZORK] -> Talk: ${message}`);
  }
}

// ============================================================================
// FOLLOW FLIZ LOGIC
// ============================================================================

/**
 * Check Fliz's location and teleport if needed
 */
async function checkAndFollowFliz() {
  try {
    const fliz = await verifier.queryOne(
      'SELECT current_room_id FROM players WHERE name = $1',
      [CONFIG.FLIZ_NAME]
    );
    
    // Always follow Fliz if he exists and has a room
    // This ensures ZORK is always in the same room as Fliz when Fliz is present
    if (fliz && fliz.current_room_id) {
      if (fliz.current_room_id !== currentRoomId) {
        console.log(`[ZORK] Following Fliz to room ${fliz.current_room_id} (ZORK was in room ${currentRoomId})`);
        
        // Update database first
        await verifier.query(
          'UPDATE players SET current_room_id = $1 WHERE name = $2',
          [fliz.current_room_id, CONFIG.ZORK_NAME]
        );
        
        currentRoomId = fliz.current_room_id;
        
        // Refresh room view to sync with server
        if (client?.connected) {
          await new Promise(resolve => setTimeout(resolve, 100));
          client.send({ type: 'look' });
        }
      }
    }
  } catch (error) {
    console.error('[ZORK] Follow check error:', error.message);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Strip @ symbols from player names for display
 */
function stripPlayerName(name) {
  if (!name) return 'Unknown';
  return name.replace(/^@+|@+$/g, '');
}

/**
 * Add an event to recent events list
 */
function addRecentEvent(event) {
  recentEvents.push(event);
  if (recentEvents.length > 20) {
    recentEvents.shift();
  }
}

/**
 * Wait for server to be ready
 */
async function waitForServerReady(maxAttempts = 20) {
  const WebSocket = (await import('ws')).default;
  
  console.log(`[ZORK] Checking if server is ready at ${CONFIG.WS_URL}...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(CONFIG.WS_URL, { handshakeTimeout: 5000 });
        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error('Timeout'));
        }, 5000);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          ws.terminate();
          resolve(true);
        });
        
        ws.on('error', (err) => {
          clearTimeout(timeout);
          ws.terminate();
          // Suppress ECONNREFUSED errors - they're expected when server is down
          if (err.code !== 'ECONNREFUSED' && err.message && !err.message.includes('ECONNREFUSED')) {
            // Only log non-connection-refused errors
          }
          reject(err);
        });
      });
      
      console.log('[ZORK] ✅ Server is ready!');
      return true;
    } catch (error) {
      // Longer delays between attempts (3-8 seconds)
      const delay = Math.min(3000 + (i * 500), 8000);
      // Only log every 3rd attempt to reduce spam
      if (i % 3 === 0 || i === maxAttempts - 1) {
        console.log(`[ZORK] Waiting for server... (${i + 1}/${maxAttempts})`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log(`[ZORK] ⚠️ Server not ready after ${maxAttempts} attempts`);
  return false;
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => {
  console.log('\n[ZORK] Shutting down...');
  if (client) client.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[ZORK] Shutting down...');
  if (client) client.disconnect();
  process.exit(0);
});

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('    ZORK THE AI LORD - Autonomous AI Agent');
  console.log('='.repeat(60) + '\n');
  
  // Check if ZORK is enabled before starting
  if (!isZorkEnabled()) {
    console.log('[ZORK] ZORK is disabled. Exiting. Use /zork command in-game to enable.');
    process.exit(0);
  }
  
  // Load system prompt
  loadSystemPrompt();
  
  // Initialize Anthropic
  await initAnthropic();
  
  // Initialize database
  await initDatabase();
  
  // Verify ZORK exists
  await verifyZorkExists();
  
  // Set ZORK to Fliz's location initially
  const fliz = await verifier.queryOne(
    'SELECT current_room_id FROM players WHERE name = $1',
    [CONFIG.FLIZ_NAME]
  );
  
  if (fliz?.current_room_id) {
    await verifier.query(
      'UPDATE players SET current_room_id = $1 WHERE name = $2',
      [fliz.current_room_id, CONFIG.ZORK_NAME]
    );
    currentRoomId = fliz.current_room_id;
    console.log(`[ZORK] Set initial location to Fliz's room: ${fliz.current_room_id}`);
  }
  
  // Wait for server (longer initial delay to let server start)
  console.log('[ZORK] Waiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const serverReady = await waitForServerReady();
  
  if (!serverReady) {
    console.log('[ZORK] Server not ready. Will retry connection in 10s...');
    setTimeout(connect, 10000);
  } else {
    await connect();
  }
}

// Start ZORK
main().catch(error => {
  console.error('[ZORK] Fatal error:', error);
  process.exit(1);
});

