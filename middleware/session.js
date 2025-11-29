/**
 * Session Middleware
 * 
 * Express session configuration and validation middleware
 * for player authentication and god mode access control.
 */

const session = require('express-session');

// Use express-session's built-in MemoryStore
const MemoryStore = session.MemoryStore;
const memoryStore = new MemoryStore();

// Session store for our custom session data (playerName, playerId, etc.)
// This is separate from express-session's session data but uses the same sessionId
const sessionStore = new Map(); // Map<sessionId, { playerName, playerId, createdAt, expiresAt }>

// Rate limiting for character selection (simple in-memory store)
const characterSelectionAttempts = new Map(); // Map<ip, { count, resetTime }>

/**
 * Session cleanup job - remove expired sessions
 * Should be called with setInterval
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, sessionData] of sessionStore.entries()) {
    if (sessionData.expiresAt < now) {
      sessionStore.delete(sessionId);
    }
  }
}

/**
 * Create and configure session middleware
 * @returns {Function} Express session middleware
 */
function createSessionMiddleware() {
  return session({
    name: 'gameSession',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: memoryStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    }
  });
}

/**
 * Session validation middleware - requires valid session
 * @param {object} db - Database module
 * @returns {Function} Express middleware
 */
function createValidateSession(db) {
  return async function validateSession(req, res, next) {
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
  };
}

/**
 * Optional session middleware - doesn't fail if no session
 * @param {object} db - Database module
 * @returns {Function} Express middleware
 */
function createOptionalSession(db) {
  return async function optionalSession(req, res, next) {
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
  };
}

/**
 * Middleware to check god mode (requires valid session first)
 */
function checkGodMode(req, res, next) {
  if (!req.player) {
    return res.status(401).send('Session required. Please select a character first.');
  }
  
  if (req.player.flag_god_mode !== 1) {
    return res.status(403).send('God mode required. You do not have access to this page.');
  }
  
  next();
}

/**
 * Handle character selection with rate limiting
 * @param {object} db - Database module
 * @returns {Function} Express route handler
 */
function createCharacterSelectionHandler(db) {
  return async function handleCharacterSelection(req, res) {
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
    if (Math.random() < 0.01) {
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
    
    // Check if player is already in an active session
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
  };
}

/**
 * Helper to get session from WebSocket upgrade request
 * @param {object} req - HTTP upgrade request
 * @returns {object|null} Session info or null
 */
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

module.exports = {
  sessionStore,
  memoryStore,
  cleanupExpiredSessions,
  createSessionMiddleware,
  createValidateSession,
  createOptionalSession,
  checkGodMode,
  createCharacterSelectionHandler,
  getSessionFromRequest
};



