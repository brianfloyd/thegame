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
  
  // Password reset page (public route)
  app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'reset-password.html'));
  });
}

module.exports = {
  setupRoutes
};



