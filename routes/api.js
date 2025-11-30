/**
 * API Routes
 * 
 * Express routes for HTTP endpoints including page routes
 * and API endpoints.
 */

const path = require('path');

/**
 * Setup all routes on the Express app
 * @param {object} app - Express application
 * @param {object} options - Options object
 * @param {object} options.db - Database module
 * @param {Function} options.validateSession - Session validation middleware
 * @param {Function} options.optionalSession - Optional session middleware
 * @param {Function} options.checkGodMode - God mode check middleware
 * @param {Function} options.characterSelectionHandler - Character selection handler
 */
function setupRoutes(app, options) {
  const { 
    validateSession, 
    optionalSession, 
    checkGodMode,
    characterSelectionHandler,
    loginHandler,
    registerHandler,
    logoutHandler,
    getAccountInfoHandler
  } = options;
  
  // Health check endpoint for Railway/cloud deployments
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Authentication endpoints
  app.post('/api/login', loginHandler);
  app.post('/api/register', registerHandler);
  app.post('/api/logout', logoutHandler);
  app.get('/api/account', optionalSession, getAccountInfoHandler);
  
  // Character selection endpoint (requires account session)
  app.post('/api/select-character', characterSelectionHandler);
  
  // Root route - landing page (login/character selection)
  app.get('/', optionalSession, (req, res) => {
    // If already has valid player session, redirect to game
    if (req.player) {
      return res.redirect('/game');
    }
    // Otherwise show landing page (login or character selection)
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
  
  // Game route - requires valid player session
  app.get('/game', optionalSession, (req, res) => {
    // If no valid player session, redirect to login
    if (!req.player) {
      return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'game.html'));
  });
  
  // Protected routes for god mode editors
  app.get('/map', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'map-editor.html'));
  });
  
  app.get('/npc', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'npc-editor.html'));
  });
  
  app.get('/items', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'item-editor.html'));
  });
  
  // Player Editor route (God Mode only)
  app.get('/player', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'player-editor.html'));
  });
}

module.exports = {
  setupRoutes
};



