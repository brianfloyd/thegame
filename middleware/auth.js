/**
 * Authentication Handlers
 * 
 * Handles login, registration, and account management
 */

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../utils/email');

// Rate limiting for authentication attempts
const authAttempts = new Map(); // Map<ip, { count, resetTime }>

/**
 * Create login handler
 * @param {object} db - Database module
 * @param {Map} activeAccountSessions - Map of active account sessions (accountId -> sessionId)
 * @returns {Function} Express route handler
 */
function createLoginHandler(db, activeAccountSessions) {
  return async function handleLogin(req, res) {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Basic rate limiting (10 attempts per 5 minutes per IP)
    const now = Date.now();
    const attempts = authAttempts.get(clientIp);
    if (attempts) {
      if (now < attempts.resetTime) {
        if (attempts.count >= 10) {
          return res.status(429).json({ success: false, error: 'Too many login attempts. Please try again later.' });
        }
        attempts.count++;
      } else {
        authAttempts.set(clientIp, { count: 1, resetTime: now + 300000 }); // 5 minutes
      }
    } else {
      authAttempts.set(clientIp, { count: 1, resetTime: now + 300000 });
    }
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    
    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();
    if (!sanitizedEmail || sanitizedEmail.length > 255) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    // Basic email format check (simple validation, no actual email verification yet)
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    try {
      // Get account by email
      const account = await db.getAccountByEmail(sanitizedEmail);
      if (!account) {
        console.log(`Security: Failed login attempt for: ${sanitizedEmail} from ${clientIp}`);
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      
      // Verify password
      const passwordMatch = await bcrypt.compare(password, account.password_hash);
      if (!passwordMatch) {
        console.log(`Security: Failed login attempt for: ${sanitizedEmail} from ${clientIp}`);
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      
      // Get tab ID from request header (if present)
      const tabId = req.headers['x-tab-id'];
      
      // Check if this account already has an active session
      if (activeAccountSessions && activeAccountSessions.has(account.id)) {
        const oldSessionData = activeAccountSessions.get(account.id);
        // Only invalidate if it's a different tab (different tab ID)
        if (oldSessionData.tabId !== tabId) {
          console.log(`Account ${account.id} (${account.email}) already has active session in another tab, invalidating...`);
          // Invalidate old session by removing it from the store
          // The old client will detect this via polling and close itself
          activeAccountSessions.delete(account.id);
        }
      }
      
      // Update last login
      await db.updateLastLogin(account.id);
      
      // Reset rate limiting on successful login
      authAttempts.delete(clientIp);
      
      // Get user's characters
      const characters = await db.getUserCharacters(account.id);
      const daysRemaining = await db.getDaysRemainingForVerification(account.id);
      
      // Store account info in session (but don't select character yet)
      req.session.accountId = account.id;
      req.session.accountEmail = account.email;
      req.session.emailVerified = account.email_verified;
      req.session.tabId = tabId; // Store tab ID in session
      
      // Track this as the active session for this account (with tab ID)
      if (activeAccountSessions) {
        activeAccountSessions.set(account.id, { sessionId: req.sessionID, tabId: tabId });
      }
      
      // Save session
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ success: false, error: 'Failed to create session' });
        }
        
        console.log(`User logged in: ${account.email} (account: ${account.id})`);
        res.json({ 
          success: true, 
          accountId: account.id,
          email: account.email,
          emailVerified: account.email_verified,
          daysRemainingForVerification: daysRemaining,
          characters: characters
        });
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
    }
  };
}

/**
 * Create registration handler
 * @param {object} db - Database module
 * @param {Map} activeAccountSessions - Map of active account sessions (accountId -> sessionId)
 * @returns {Function} Express route handler
 */
function createRegisterHandler(db, activeAccountSessions) {
  return async function handleRegister(req, res) {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Basic rate limiting (5 registrations per 10 minutes per IP)
    const now = Date.now();
    const attempts = authAttempts.get(clientIp);
    if (attempts) {
      if (now < attempts.resetTime) {
        if (attempts.count >= 5) {
          return res.status(429).json({ success: false, error: 'Too many registration attempts. Please try again later.' });
        }
        attempts.count++;
      } else {
        authAttempts.set(clientIp, { count: 1, resetTime: now + 600000 }); // 10 minutes
      }
    } else {
      authAttempts.set(clientIp, { count: 1, resetTime: now + 600000 });
    }
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    
    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();
    if (!sanitizedEmail || sanitizedEmail.length > 255) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    // Basic email format check
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    // Validate password strength
    if (password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }
    if (password.length > 100) {
      return res.status(400).json({ success: false, error: 'Password is too long' });
    }
    
    try {
      // Check if account already exists
      const existingAccount = await db.getAccountByEmail(sanitizedEmail);
      if (existingAccount) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists' });
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      
      // Create account (email_verified defaults to FALSE)
      const account = await db.createAccount(sanitizedEmail, passwordHash);
      
      // Generate verification token (expires in 24 hours)
      const verificationToken = uuidv4();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      
      // Save verification token to database
      await db.createEmailVerificationToken(account.id, verificationToken, expiresAt);
      
      // Send verification email
      const emailResult = await emailService.sendVerificationEmail(sanitizedEmail, verificationToken);
      if (!emailResult.success) {
        console.error(`❌ Failed to send verification email to ${sanitizedEmail} during registration:`, emailResult.error);
        console.error('   Registration will continue, but user will need to use "Resend Verification Email" button');
        // Don't fail registration if email fails, but log it
      } else {
        console.log(`✅ Verification email sent successfully to ${sanitizedEmail} during registration`);
      }
      
      // Reset rate limiting on successful registration
      authAttempts.delete(clientIp);
      
      // Get tab ID from request header (if present)
      const tabId = req.headers['x-tab-id'];
      
      // Check if this account already has an active session (shouldn't happen on register, but check anyway)
      if (activeAccountSessions && activeAccountSessions.has(account.id)) {
        const oldSessionData = activeAccountSessions.get(account.id);
        // Only invalidate if it's a different tab (different tab ID)
        if (oldSessionData.tabId !== tabId) {
          console.log(`Account ${account.id} (${account.email}) already has active session in another tab, invalidating...`);
          activeAccountSessions.delete(account.id);
        }
      }
      
      // Get days remaining for verification
      const daysRemaining = await db.getDaysRemainingForVerification(account.id);
      
      // Store account info in session
      req.session.accountId = account.id;
      req.session.accountEmail = account.email;
      req.session.emailVerified = account.email_verified;
      req.session.tabId = tabId; // Store tab ID in session
      
      // Track this as the active session for this account (with tab ID)
      if (activeAccountSessions) {
        activeAccountSessions.set(account.id, { sessionId: req.sessionID, tabId: tabId });
      }
      
      // Save session
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ success: false, error: 'Failed to create session' });
        }
        
        console.log(`New account registered: ${account.email} (account: ${account.id})`);
        res.json({ 
          success: true, 
          accountId: account.id,
          email: account.email,
          emailVerified: account.email_verified,
          daysRemainingForVerification: daysRemaining,
          characters: [], // New account has no characters yet
          verificationEmailSent: emailResult.success
        });
      });
    } catch (err) {
      console.error('Registration error:', err);
      if (err.code === '23505') { // Unique constraint violation
        return res.status(409).json({ success: false, error: 'An account with this email already exists' });
      }
      res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
    }
  };
}

/**
 * Create logout handler
 * @param {Map} activeAccountSessions - Map of active account sessions (accountId -> sessionId)
 */
function createLogoutHandler(activeAccountSessions) {
  return function handleLogout(req, res) {
    // Remove from active account sessions
    if (activeAccountSessions && req.session.accountId) {
      const currentSessionData = activeAccountSessions.get(req.session.accountId);
      if (currentSessionData && currentSessionData.sessionId === req.sessionID) {
        activeAccountSessions.delete(req.session.accountId);
      }
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ success: false, error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  };
}

/**
 * Get account info (requires valid session)
 * @param {object} db - Database module
 * @returns {Function} Express route handler
 */
function createGetAccountInfoHandler(db, activeAccountSessions) {
  return async function handleGetAccountInfo(req, res) {
    if (!req.session.accountId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    // Check tab ID matches
    const tabId = req.headers['x-tab-id'];
    if (tabId && req.session.tabId && req.session.tabId !== tabId) {
      // Tab ID mismatch - destroy session
      console.log(`Account info request: Tab ID mismatch. Destroying session.`);
      req.session.destroy();
      return res.status(401).json({ success: false, error: 'Session invalid for this tab' });
    }
    
    // Check if this is still the active session for this account
    if (activeAccountSessions) {
      const activeSessionData = activeAccountSessions.get(req.session.accountId);
      if (!activeSessionData || 
          activeSessionData.sessionId !== req.sessionID ||
          (tabId && activeSessionData.tabId !== tabId)) {
        // Session has been replaced
        req.session.destroy();
        return res.status(401).json({ success: false, error: 'Session has been replaced' });
      }
    }
    
    try {
      const account = await db.getAccountById(req.session.accountId);
      if (!account) {
        req.session.destroy();
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
      
      const characters = await db.getUserCharacters(account.id);
      const daysRemaining = await db.getDaysRemainingForVerification(account.id);
      
      res.json({
        success: true,
        accountId: account.id,
        email: account.email,
        emailVerified: account.email_verified,
        daysRemainingForVerification: daysRemaining,
        characters: characters
      });
    } catch (err) {
      console.error('Get account info error:', err);
      res.status(500).json({ success: false, error: 'Failed to get account info' });
    }
  };
}

module.exports = {
  createLoginHandler,
  createRegisterHandler,
  createLogoutHandler,
  createGetAccountInfoHandler
};

