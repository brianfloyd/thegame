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
    db,
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
  
  // Email service status endpoint (for debugging)
  app.get('/api/email-status', (req, res) => {
    const emailService = require('../utils/email');
    const isReady = emailService.isEmailServiceReady();
    res.json({ 
      emailServiceReady: isReady,
      smtpUser: process.env.SMTP_USER ? '***configured***' : 'not set',
      smtpPassword: process.env.SMTP_PASSWORD ? '***configured***' : 'not set',
      smtpHost: process.env.SMTP_HOST || 'smtpout.secureserver.net',
      smtpPort: process.env.SMTP_PORT || '587'
    });
  });
  
  // Stat and ability metadata endpoint
  app.get('/api/stat-ability-metadata', async (req, res) => {
    try {
      const statMetadata = await db.getAllStatMetadata();
      const abilityMetadata = await db.getAllAbilityMetadata();
      
      // Convert Maps to objects for JSON serialization
      const statsObj = {};
      for (const [key, value] of statMetadata.entries()) {
        statsObj[key] = value;
      }
      
      const abilitiesObj = {};
      for (const [key, value] of abilityMetadata.entries()) {
        abilitiesObj[key] = value;
      }
      
      res.json({
        stats: statsObj,
        abilities: abilitiesObj
      });
    } catch (error) {
      console.error('Error fetching stat/ability metadata:', error);
      res.status(500).json({ error: 'Failed to fetch metadata' });
    }
  });
  
  // Session validation endpoint - checks if current session is still valid
  app.get('/api/session-valid', optionalSession, (req, res) => {
    if (!req.session.accountId) {
      return res.json({ valid: false, reason: 'no_session' });
    }
    
    // Check if this session is still the active session for this account
    const activeAccountSessions = options.activeAccountSessions;
    if (activeAccountSessions) {
      const activeSessionData = activeAccountSessions.get(req.session.accountId);
      const tabId = req.headers['x-tab-id'];
      
      // Check if session ID matches AND tab ID matches (if tab ID is provided)
      if (!activeSessionData || 
          activeSessionData.sessionId !== req.sessionID ||
          (tabId && activeSessionData.tabId !== tabId)) {
        // This session has been replaced by a new login
        return res.json({ valid: false, reason: 'session_replaced', shouldClose: true });
      }
    }
    
    res.json({ valid: true });
  });
  
  // Authentication endpoints
  app.post('/api/login', loginHandler);
  app.post('/api/register', registerHandler);
  app.post('/api/logout', logoutHandler);
  app.get('/api/account', optionalSession, getAccountInfoHandler);
  
  // Email verification endpoint
  app.get('/api/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) {
      return res.redirect('/?error=invalid_token');
    }
    
    try {
      const tokenData = await options.db.getEmailVerificationToken(token);
      if (!tokenData) {
        return res.redirect('/?error=invalid_or_expired_token');
      }
      
      // Mark account as verified
      await options.db.verifyAccountEmail(tokenData.account_id);
      
      // Mark token as used
      await options.db.markEmailVerificationTokenUsed(token);
      
      console.log(`Email verified for account: ${tokenData.account_id}`);
      res.redirect('/?verified=true');
    } catch (err) {
      console.error('Email verification error:', err);
      res.redirect('/?error=verification_failed');
    }
  });
  
  // Resend verification email endpoint
  app.post('/api/resend-verification-email', async (req, res) => {
    if (!req.session.accountId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    try {
      const account = await options.db.getAccountById(req.session.accountId);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
      
      // If already verified, no need to resend
      if (account.email_verified) {
        return res.json({ success: true, message: 'Email is already verified' });
      }
      
      // Generate new verification token (expires in 24 hours)
      const { v4: uuidv4 } = require('uuid');
      const verificationToken = uuidv4();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      
      // Save verification token to database
      await options.db.createEmailVerificationToken(account.id, verificationToken, expiresAt);
      
      // Send verification email
      const emailService = require('../utils/email');
      const emailResult = await emailService.sendVerificationEmail(account.email, verificationToken);
      
      if (!emailResult.success) {
        console.error(`❌ Failed to send verification email to ${account.email}:`, emailResult.error);
        console.error('Email service error details:', emailResult);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to send verification email. Please check server logs for details.' 
        });
      }
      
      console.log(`✅ Verification email sent successfully to ${account.email} for account: ${account.id}`);
      res.json({ success: true, message: 'Verification email sent successfully' });
    } catch (err) {
      console.error('Resend verification email error:', err);
      res.status(500).json({ success: false, error: 'Failed to resend verification email' });
    }
  });
  
  // Request password reset endpoint
  app.post('/api/request-password-reset', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    const sanitizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    try {
      const account = await options.db.getAccountByEmail(sanitizedEmail);
      // Always return success (don't reveal if email exists)
      if (account) {
        const { v4: uuidv4 } = require('uuid');
        const resetToken = uuidv4();
        const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
        
        await options.db.createPasswordResetToken(account.id, resetToken, expiresAt);
        
        const emailService = require('../utils/email');
        const emailResult = await emailService.sendPasswordResetEmail(sanitizedEmail, resetToken);
        
        if (!emailResult.success) {
          console.error(`❌ Failed to send password reset email to ${sanitizedEmail}:`, emailResult.error);
          // Log the error but still return success to prevent email enumeration
        } else {
          console.log(`✅ Password reset email sent successfully to ${sanitizedEmail}`);
        }
      } else {
        console.log(`Password reset requested for non-existent email: ${sanitizedEmail} (returning success to prevent enumeration)`);
      }
      
      // Always return success to prevent email enumeration
      res.json({ 
        success: true, 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    } catch (err) {
      console.error('❌ Password reset request error:', err);
      console.error('Error stack:', err.stack);
      // Still return success to prevent email enumeration
      res.json({ 
        success: true, 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }
  });
  
  // Reset password endpoint
  app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }
    
    // Validate password strength
    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }
    if (newPassword.length > 100) {
      return res.status(400).json({ success: false, error: 'Password is too long' });
    }
    
    try {
      const tokenData = await options.db.getPasswordResetToken(token);
      if (!tokenData) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      }
      
      // Hash new password
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await options.db.updateAccountPassword(tokenData.account_id, passwordHash);
      
      // Mark token as used
      await options.db.markPasswordResetTokenUsed(token);
      
      console.log(`Password reset for account: ${tokenData.account_id}`);
      res.json({ success: true, message: 'Password has been reset successfully' });
    } catch (err) {
      console.error('Password reset error:', err);
      res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
  });
  
  // Character selection endpoint (requires account session)
  app.post('/api/select-character', characterSelectionHandler);
  
  // Get active character windows for current account
  app.get('/api/active-windows', optionalSession, (req, res) => {
    if (!req.session.accountId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    try {
      // Get activeCharacterWindows from server.js (passed via options)
      const activeCharacterWindows = options.activeCharacterWindows || new Map();
      const accountId = req.session.accountId;
      const connectedPlayers = options.connectedPlayers || new Map();
      
      // Filter windows for this account
      // Players stay active indefinitely until explicitly closed via "Close Window" button
      const accountWindows = [];
      
      for (const [playerId, windowData] of activeCharacterWindows.entries()) {
        if (windowData.accountId === accountId) {
          // Check if connection is still active
          let isConnected = false;
          for (const [connId, playerData] of connectedPlayers.entries()) {
            if (playerData.playerId === playerId && playerData.ws && playerData.ws.readyState === 1) { // WebSocket.OPEN
              isConnected = true;
              break;
            }
          }
          
          // Include player whether connection is active or not
          // They stay "active" until explicitly closed
          accountWindows.push({
            playerId: playerId,
            playerName: windowData.playerName,
            windowId: windowData.windowId,
            openedAt: windowData.openedAt,
            hasActiveConnection: isConnected
          });
        }
      }
      
      res.json({ success: true, activeWindows: accountWindows });
    } catch (error) {
      console.error('Error fetching active windows:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch active windows' });
    }
  });
  
  // Close character window endpoint
  // This is the ONLY way to remove a player from activeCharacterWindows
  // Players stay active indefinitely until this endpoint is called
  app.post('/api/close-character-window', optionalSession, async (req, res) => {
    if (!req.session.accountId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { playerName } = req.query;
    if (!playerName) {
      return res.status(400).json({ success: false, error: 'playerName required' });
    }
    
    try {
      const accountId = req.session.accountId;
      const connectedPlayers = options.connectedPlayers || new Map();
      const activeCharacterWindows = options.activeCharacterWindows || new Map();
      
      // Find player by name and verify ownership
      const player = await options.db.getPlayerByName(playerName);
      if (!player) {
        return res.status(404).json({ success: false, error: 'Player not found' });
      }
      
      // Verify player belongs to account
      const userCharacters = await options.db.getUserCharacters(accountId);
      const playerBelongsToAccount = userCharacters.some(char => char.id === player.id);
      if (!playerBelongsToAccount) {
        return res.status(403).json({ success: false, error: 'Player does not belong to account' });
      }
      
      // Find and close WebSocket connection
      let connectionClosed = false;
      for (const [connId, playerData] of connectedPlayers.entries()) {
        if (playerData.playerId === player.id && playerData.accountId === accountId) {
          // Close WebSocket connection
          if (playerData.ws && playerData.ws.readyState === 1) { // WebSocket.OPEN
            playerData.ws.close();
            connectionClosed = true;
          }
          
          // Remove from connected players
          connectedPlayers.delete(connId);
          break;
        }
      }
      
      // Remove from activeCharacterWindows (this is the explicit close action)
      // Players stay active indefinitely until this endpoint is called
      activeCharacterWindows.delete(player.id);
      
      console.log(`Player ${playerName} (ID: ${player.id}) explicitly closed - removed from activeCharacterWindows`);
      
      res.json({ success: true, connectionClosed });
    } catch (error) {
      console.error('Error closing character window:', error);
      res.status(500).json({ success: false, error: 'Failed to close character window' });
    }
  });
  
  // Create character endpoint (requires account session)
  app.post('/api/create-character', async (req, res) => {
    if (!req.session.accountId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { characterName } = req.body;
    
    if (!characterName || typeof characterName !== 'string') {
      return res.status(400).json({ success: false, error: 'Character name is required' });
    }
    
    const sanitizedName = characterName.trim();
    
    // Validate name
    if (sanitizedName.length < 2) {
      return res.status(400).json({ success: false, error: 'Character name must be at least 2 characters' });
    }
    if (sanitizedName.length > 50) {
      return res.status(400).json({ success: false, error: 'Character name is too long' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(sanitizedName)) {
      return res.status(400).json({ success: false, error: 'Character name can only contain letters, numbers, and underscores' });
    }
    
    try {
      // Check character limit based on god mode status
      const characters = await options.db.getUserCharacters(req.session.accountId);
      const hasGodModeCharacter = characters.some(char => char.flag_god_mode === 1 || char.flag_god_mode === true);
      const maxCharacters = hasGodModeCharacter ? Infinity : 2;
      
      if (characters.length >= maxCharacters) {
        return res.status(403).json({ 
          success: false, 
          error: hasGodModeCharacter 
            ? 'Character limit reached' 
            : 'Character limit reached. You can have up to 2 characters. Create a god mode character to unlock unlimited characters.' 
        });
      }
      
      // Check if name already exists
      const existingPlayer = await options.db.getPlayerByName(sanitizedName);
      if (existingPlayer) {
        return res.status(409).json({ success: false, error: 'Character name already taken' });
      }
      
      // Create player with 5 assignable points and all stats set to 5
      const player = await options.db.createPlayer(sanitizedName, req.session.accountId);
      
      // Get updated character list
      const updatedCharacters = await options.db.getUserCharacters(req.session.accountId);
      
      console.log(`Character created: ${sanitizedName} for account ${req.session.accountId}`);
      res.json({ 
        success: true, 
        player: {
          id: player.id,
          name: player.name
        },
        characters: updatedCharacters
      });
    } catch (err) {
      console.error('Create character error:', err);
      if (err.code === '23505') { // Unique constraint violation
        return res.status(409).json({ success: false, error: 'Character name already taken' });
      }
      res.status(500).json({ success: false, error: 'Failed to create character' });
    }
  });
  
  // Root route - landing page (login/character selection)
  app.get('/', optionalSession, (req, res) => {
    // Get tab ID from header
    const tabId = req.headers['x-tab-id'];
    
    // Only auto-login if the session's tab ID matches the current tab ID
    // This prevents sharing sessions across tabs
    if (req.session && req.session.accountId) {
      // If tab ID is provided and doesn't match session's tab ID, destroy session
      if (tabId) {
        if (!req.session.tabId || req.session.tabId !== tabId) {
          // Different tab or no tab ID in session - destroy session and show login
          console.log(`Session tab ID mismatch: session has ${req.session.tabId}, request has ${tabId}. Destroying session.`);
          req.session.destroy(() => {
            res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
          });
          return;
        }
      } else {
        // No tab ID in request - this is an old client or direct navigation
        // If session has a tab ID, we need one too, so destroy session
        if (req.session.tabId) {
          console.log('Request missing tab ID but session has one. Destroying session.');
          req.session.destroy(() => {
            res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
          });
          return;
        }
      }
    }
    
    // If already has valid player session, redirect to game
    if (req.player) {
      return res.redirect('/game');
    }
    // Otherwise show landing page (login or character selection)
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
  
  // Game route - requires valid player session and email verification (after grace period)
  app.get('/game', optionalSession, async (req, res) => {
    // If no valid player session, redirect to login
    if (!req.player) {
      return res.redirect('/');
    }
    
    // Check if account is within grace period (7 days for unverified accounts)
    if (req.session.accountId) {
      const withinGracePeriod = await options.db.isAccountWithinGracePeriod(req.session.accountId);
      if (!withinGracePeriod) {
        const account = await options.db.getAccountById(req.session.accountId);
        if (account && !account.email_verified) {
          // Email verification required - redirect to character selection
          return res.redirect('/?verification_required=true');
        }
      }
    }
    
    res.sendFile(path.join(__dirname, '..', 'public', 'game.html'));
  });
  
  // ===========================================
  // GOD MODE EDITORS (protected from static serving)
  // All editors are in /public/gameeditors/ folder
  // Routes: /map, /npc, /items, /player, /tickets, /crafting
  // ===========================================
  
  app.get('/map', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'map-editor.html'));
  });
  
  app.get('/npc', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'npc-editor.html'));
  });
  
  app.get('/items', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'item-editor.html'));
  });
  
  app.get('/crafting', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'crafting-editor.html'));
  });
  
  app.get('/player', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'player-editor.html'));
  });
  
  app.get('/tickets', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'ticket-editor.html'));
  });
  
  app.get('/formulas', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'formula-editor.html'));
  });
  
  // Serve editor CSS and JS files (these need to be accessible after auth)
  app.get('/:file(map|npc|item|player|ticket|crafting|formula)-editor.:ext(js|css)', validateSession, checkGodMode, (req, res) => {
    const file = `${req.params.file}-editor.${req.params.ext}`;
    const filePath = path.join(__dirname, '..', 'public', 'gameeditors', file);
    
    // Set correct MIME type
    if (req.params.ext === 'css') {
      res.setHeader('Content-Type', 'text/css');
    } else if (req.params.ext === 'js') {
      res.setHeader('Content-Type', 'application/javascript');
    }
    
    res.sendFile(filePath);
  });
  
  // Serve shared editor files (like editor-shared.css)
  app.get('/gameeditors/:file', validateSession, checkGodMode, (req, res) => {
    const file = req.params.file;
    const filePath = path.join(__dirname, '..', 'public', 'gameeditors', file);
    
    // Set correct MIME type based on file extension
    if (file.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (file.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    
    res.sendFile(filePath);
  });
  
  // Password reset page (public route)
  app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'reset-password.html'));
  });
  
  // DEV BACKDOOR: Quick login for development (only works in dev mode)
  // Usage: 
  //   /dev-login - logs in and selects first character
  //   /dev-login/bobby - logs in and selects Bobby character
  //   /dev-login/fliz - logs in and selects Fliz character
  //   /dev-login/noob - logs in and selects Noob character
  app.get('/dev-login/:character?', optionalSession, async (req, res) => {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).send('Dev backdoor disabled in production');
    }
    
    try {
      const db = options.db;
      const activeAccountSessions = options.activeAccountSessions;
      const { sessionStore } = require('../middleware/session');
      
      // Get brian's account
      const account = await db.getAccountByEmail('brian@brianfloyd.me');
      if (!account) {
        return res.status(404).send('Dev account (brian@brianfloyd.me) not found. Run migration 023_seed_brian_account.sql');
      }
      
      // Get tab ID from header
      const tabId = req.headers['x-tab-id'] || `dev-${Date.now()}`;
      
      // Invalidate old session if exists (allows switching between characters)
      if (activeAccountSessions && activeAccountSessions.has(account.id)) {
        activeAccountSessions.delete(account.id);
      }
      
      // Get user's characters
      const characters = await db.getUserCharacters(account.id);
      if (!characters || characters.length === 0) {
        return res.status(404).send('No characters found for dev account. Run migration 023_seed_brian_account.sql');
      }
      
      // Determine which character to use
      let targetCharacter = null;
      const characterName = req.params.character ? req.params.character.toLowerCase() : null;
      
      if (characterName) {
        // Find specific character by name (case-insensitive, strip @ markup)
        // Character names may have @ markup (e.g., @Fliz@), so we strip @ for comparison
        targetCharacter = characters.find(char => {
          const cleanName = char.name.replace(/@/g, '').toLowerCase();
          return cleanName === characterName;
        });
        if (!targetCharacter) {
          return res.status(404).send(`Character "${req.params.character}" not found. Available characters: ${characters.map(c => c.name).join(', ')}`);
        }
      } else {
        // Use first character if no specific character requested
        targetCharacter = characters[0];
      }
      
      const player = await db.getPlayerByName(targetCharacter.name);
      if (!player) {
        return res.status(404).send(`Character ${targetCharacter.name} not found`);
      }
      
      // Create account session
      req.session.accountId = account.id;
      req.session.accountEmail = account.email;
      req.session.emailVerified = account.email_verified;
      req.session.tabId = tabId;
      
      // Track active session
      if (activeAccountSessions) {
        activeAccountSessions.set(account.id, { sessionId: req.sessionID, tabId: tabId });
      }
      
      // Create player session
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      sessionStore.set(req.sessionID, {
        accountId: account.id,
        playerName: player.name,
        playerId: player.id,
        createdAt: Date.now(),
        expiresAt: expiresAt
      });
      
      req.session.playerName = player.name;
      req.session.playerId = player.id;
      
      // Save session and redirect
      req.session.save((err) => {
        if (err) {
          console.error('Dev login session save error:', err);
          return res.status(500).send('Failed to create session');
        }
        
        console.log(`[DEV BACKDOOR] Auto-logged in as ${account.email} with character ${player.name}`);
        res.redirect('/game');
      });
    } catch (err) {
      console.error('Dev login error:', err);
      res.status(500).send(`Dev login failed: ${err.message}`);
    }
  });
  
  // DEV BACKDOOR: Direct editor access for development (only works in dev mode)
  // Usage:
  //   /dev-map-editor - opens map editor with first god mode character
  //   /dev-player-editor - opens player editor with first god mode character
  //   /dev-item-editor - opens item editor with first god mode character
  //   /dev-npc-editor - opens NPC editor with first god mode character
  // These routes create a session with a god mode character and redirect to the editor
  async function createDevEditorSession(req, res, editorPath) {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).send('Dev backdoor disabled in production');
    }
    
    try {
      const db = options.db;
      const activeAccountSessions = options.activeAccountSessions;
      const { sessionStore } = require('../middleware/session');
      
      // Get brian's account
      const account = await db.getAccountByEmail('brian@brianfloyd.me');
      if (!account) {
        return res.status(404).send('Dev account (brian@brianfloyd.me) not found. Run migration 023_seed_brian_account.sql');
      }
      
      // Get tab ID from header
      const tabId = req.headers['x-tab-id'] || `dev-${Date.now()}`;
      
      // Invalidate old session if exists (allows switching between editors)
      if (activeAccountSessions && activeAccountSessions.has(account.id)) {
        activeAccountSessions.delete(account.id);
      }
      
      // Get user's characters and find a god mode character
      const characters = await db.getUserCharacters(account.id);
      if (!characters || characters.length === 0) {
        return res.status(404).send('No characters found for dev account. Run migration 023_seed_brian_account.sql');
      }
      
      // Find first god mode character, or fall back to first character
      let targetCharacter = characters.find(char => char.flag_god_mode === 1 || char.flag_god_mode === true);
      if (!targetCharacter) {
        targetCharacter = characters[0];
        console.warn(`[DEV BACKDOOR] No god mode character found, using ${targetCharacter.name} (may not have editor access)`);
      }
      
      const player = await db.getPlayerByName(targetCharacter.name);
      if (!player) {
        return res.status(404).send(`Character ${targetCharacter.name} not found`);
      }
      
      // Create account session
      req.session.accountId = account.id;
      req.session.accountEmail = account.email;
      req.session.emailVerified = account.email_verified;
      req.session.tabId = tabId;
      
      // Track active session
      if (activeAccountSessions) {
        activeAccountSessions.set(account.id, { sessionId: req.sessionID, tabId: tabId });
      }
      
      // Create player session
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      sessionStore.set(req.sessionID, {
        accountId: account.id,
        playerName: player.name,
        playerId: player.id,
        createdAt: Date.now(),
        expiresAt: expiresAt
      });
      
      req.session.playerName = player.name;
      req.session.playerId = player.id;
      
      // Save session and redirect
      req.session.save((err) => {
        if (err) {
          console.error('Dev editor session save error:', err);
          return res.status(500).send('Failed to create session');
        }
        
        console.log(`[DEV BACKDOOR] Auto-logged in as ${account.email} with character ${player.name} for ${editorPath}`);
        res.redirect(editorPath);
      });
    } catch (err) {
      console.error('Dev editor login error:', err);
      res.status(500).send('Dev editor login failed: ' + err.message);
    }
  }
  
  // Dev backdoor routes for all editors
  app.get('/dev-map-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/map');
  });
  
  app.get('/dev-player-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/player');
  });
  
  app.get('/dev-item-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/items');
  });
  
  app.get('/dev-npc-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/npc');
  });
  
  app.get('/dev-ticket-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/tickets');
  });
  
  app.get('/dev-crafting-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/crafting');
  });

  app.get('/markup', validateSession, checkGodMode, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'markup-editor.html'));
  });

  app.get('/dev-markup-editor', optionalSession, (req, res) => {
    createDevEditorSession(req, res, '/markup');
  });

  // ============================================================
  // Markup API Endpoints
  // GET endpoints: All authenticated players can read markup conventions
  // POST/PUT/DELETE endpoints: God mode required for creating/editing/deleting
  // ============================================================

  // Get all custom markup conventions (readable by all authenticated players)
  app.get('/api/markup/conventions', validateSession, async (req, res) => {
    try {
      const conventions = await db.getAllMarkupConventions();
      console.log(`[API] GET /api/markup/conventions: Returning ${conventions.length} conventions from database`);
      res.json(conventions);
    } catch (error) {
      console.error('Error fetching markup conventions:', error);
      res.status(500).json({ error: 'Failed to fetch markup conventions' });
    }
  });
  
  // Debug endpoint to check server-side cache (god mode only)
  app.get('/api/markup/debug-cache', validateSession, checkGodMode, async (req, res) => {
    try {
      const { loadConventions } = require('../utils/markupService');
      const db = require('../database');
      
      // Reload from database
      await loadConventions(db);
      
      // Get what's in the cache (we need to export it or access it differently)
      // For now, just return what's in the database
      const dbConventions = await db.getAllMarkupConventions();
      
      res.json({
        database: {
          count: dbConventions.length,
          conventions: dbConventions
        },
        note: 'Server-side cache is private. This shows what would be loaded into cache.'
      });
    } catch (error) {
      console.error('Error in debug endpoint:', error);
      res.status(500).json({ error: 'Failed to get debug info' });
    }
  });

  // Get single markup convention by ID (readable by all authenticated players)
  app.get('/api/markup/conventions/:id', validateSession, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid convention ID' });
      }
      const convention = await db.getMarkupConventionById(id);
      if (!convention) {
        return res.status(404).json({ error: 'Convention not found' });
      }
      res.json(convention);
    } catch (error) {
      console.error('Error fetching markup convention:', error);
      res.status(500).json({ error: 'Failed to fetch markup convention' });
    }
  });

  // Create new markup convention
  app.post('/api/markup/conventions', validateSession, checkGodMode, async (req, res) => {
    try {
      const { syntax, opening, closing, description, example, color, effects } = req.body;
      
      if (!syntax || !opening || !closing) {
        return res.status(400).json({ error: 'syntax, opening, and closing are required' });
      }

      const convention = await db.createMarkupConvention({
        syntax,
        opening,
        closing,
        description,
        example,
        color,
        effects
      });

      // Reload markup service cache
      const { reloadMarkupConventions } = require('../utils/markupService');
      await reloadMarkupConventions(db);

      res.status(201).json(convention);
    } catch (error) {
      console.error('Error creating markup convention:', error);
      res.status(500).json({ error: 'Failed to create markup convention' });
    }
  });

  // Update markup convention
  app.put('/api/markup/conventions/:id', validateSession, checkGodMode, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid convention ID' });
      }

      const { syntax, opening, closing, description, example, color, effects } = req.body;
      
      if (!syntax || !opening || !closing) {
        return res.status(400).json({ error: 'syntax, opening, and closing are required' });
      }

      const convention = await db.updateMarkupConvention(id, {
        syntax,
        opening,
        closing,
        description,
        example,
        color,
        effects
      });

      if (!convention) {
        return res.status(404).json({ error: 'Convention not found' });
      }

      // Reload markup service cache
      const { reloadMarkupConventions } = require('../utils/markupService');
      await reloadMarkupConventions(db);

      res.json(convention);
    } catch (error) {
      console.error('Error updating markup convention:', error);
      res.status(500).json({ error: 'Failed to update markup convention' });
    }
  });

  // Delete markup convention
  app.delete('/api/markup/conventions/:id', validateSession, checkGodMode, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid convention ID' });
      }

      await db.deleteMarkupConvention(id);

      // Reload markup service cache
      const { reloadMarkupConventions } = require('../utils/markupService');
      await reloadMarkupConventions(db);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting markup convention:', error);
      res.status(500).json({ error: 'Failed to delete markup convention' });
    }
  });

  // Internal cache refresh endpoint (for ZORK and other internal processes)
  // Uses a simple token-based auth to prevent external access
  app.post('/api/internal/refresh-cache', async (req, res) => {
    try {
      // Simple token check (can be improved with proper auth if needed)
      const token = req.headers['x-internal-token'] || req.body.token;
      const expectedToken = process.env.INTERNAL_CACHE_TOKEN || 'internal-cache-refresh-token';
      
      if (token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { cacheType } = req.body; // 'markup', 'messages', or 'all'
      
      if (cacheType === 'markup' || cacheType === 'all') {
        const { reloadMarkupConventions } = require('../utils/markupService');
        await reloadMarkupConventions(db);
        console.log('[CacheRefresh] Reloaded markup conventions cache');
      }
      
      if (cacheType === 'messages' || cacheType === 'all') {
        const messageCache = require('../utils/messageCache');
        await messageCache.reloadMessageCache();
        console.log('[CacheRefresh] Reloaded game messages cache');
      }
      
      res.json({ success: true, refreshed: cacheType || 'all' });
    } catch (error) {
      console.error('[CacheRefresh] Error refreshing cache:', error);
      res.status(500).json({ error: 'Failed to refresh cache' });
    }
  });
}

module.exports = {
  setupRoutes
};



