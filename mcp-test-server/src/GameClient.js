/**
 * GameClient - WebSocket client for connecting to the game server
 * 
 * Handles:
 * - WebSocket connection management
 * - HTTP authentication flow (login, character selection)
 * - Message queue for capturing responses
 * - Event emission for message types
 */

import WebSocket from 'ws';
import { MessageQueue } from './MessageQueue.js';

export class GameClient {
  constructor(config = {}) {
    this.wsUrl = config.wsUrl || process.env.GAME_WS_URL || 'ws://localhost:3000';
    this.httpUrl = config.httpUrl || process.env.GAME_HTTP_URL || 'http://localhost:3000';
    
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.cookies = new Map(); // Store cookies by name
    this.selectedPlayerName = null; // Store selected player name for test bypass
    this.currentPlayer = null;
    this.currentRoom = null;
    
    this.messageQueue = new MessageQueue();
    this.messageHandlers = new Map();
  }

  /**
   * Extract and store cookies from response headers
   */
  _extractCookies(response) {
    // Node.js fetch: Headers object has different methods
    // Try getAll() first (Node.js 18+), then fallback to raw headers
    let setCookieHeaders = [];
    
    try {
      // Try getAll() method (available in Node.js 18+)
      if (typeof response.headers.getAll === 'function') {
        setCookieHeaders = response.headers.getAll('set-cookie');
      } else if (response.headers.raw && typeof response.headers.raw === 'function') {
        // Fallback: use raw() to get all values
        const raw = response.headers.raw();
        setCookieHeaders = raw['set-cookie'] || [];
        if (!Array.isArray(setCookieHeaders)) {
          setCookieHeaders = [setCookieHeaders];
        }
      } else {
        // Last resort: get() returns first value
        const cookie = response.headers.get('set-cookie');
        if (cookie) {
          setCookieHeaders = [cookie];
        }
      }
    } catch (error) {
      // If anything fails, try get()
      const cookie = response.headers.get('set-cookie');
      if (cookie) {
        setCookieHeaders = [cookie];
      }
    }
    
    for (const cookieHeader of setCookieHeaders) {
      if (!cookieHeader) continue;
      
      // Parse cookie: "name=value; Path=/; HttpOnly"
      const cookieParts = cookieHeader.split(';');
      const nameValue = cookieParts[0].trim();
      const equalIndex = nameValue.indexOf('=');
      
      if (equalIndex > 0) {
        const name = nameValue.substring(0, equalIndex).trim();
        const value = nameValue.substring(equalIndex + 1).trim();
        
        if (name && value) {
          this.cookies.set(name, value);
        }
      }
    }
  }

  /**
   * Build Cookie header string from stored cookies
   */
  _getCookieHeader() {
    const cookiePairs = Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`);
    return cookiePairs.join('; ');
  }

  /**
   * Register a new account with the game server
   */
  async register(email, password) {
    const response = await fetch(`${this.httpUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    // Extract and store cookies
    this._extractCookies(response);
    
    return data;
  }

  /**
   * Login to the game server
   */
  async login(email, password) {
    const cookieHeader = this._getCookieHeader();
    const headers = { 'Content-Type': 'application/json' };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await fetch(`${this.httpUrl}/api/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    // Extract and store cookies
    this._extractCookies(response);
    
    return data;
  }

  /**
   * Select a character to play
   * @param {number|string} playerIdOrName - Player ID or player name
   */
  async selectCharacter(playerIdOrName) {
    const cookieHeader = this._getCookieHeader();
    if (!cookieHeader) {
      throw new Error('Not logged in - no session cookies');
    }
    
    // If it's a number, we need to look up the player name
    // For now, assume it's a playerName string (the server expects playerName)
    const playerName = typeof playerIdOrName === 'number' 
      ? null // Will need to be looked up by caller
      : playerIdOrName;
    
    if (!playerName) {
      throw new Error('Player name is required (playerId lookup not yet implemented)');
    }
    
    const response = await fetch(`${this.httpUrl}/api/select-character`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({ playerName }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Character selection failed');
    }
    
    // Extract and store any updated cookies
    this._extractCookies(response);
    
    // Store player name for test bypass authentication
    this.selectedPlayerName = playerName;
    
    return data;
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const wsOptions = {};
      const cookieHeader = this._getCookieHeader();
      if (cookieHeader) {
        wsOptions.headers = { 'Cookie': cookieHeader };
      }
      
      this.ws = new WebSocket(this.wsUrl, wsOptions);
      
      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });
      
      this.ws.on('close', (code, reason) => {
        this.connected = false;
        this.authenticated = false;
        // Clear any pending message handlers to prevent memory leaks
        this.messageHandlers.clear();
      });
      
      this.ws.on('error', (error) => {
        // Suppress verbose logging for ECONNREFUSED (expected during server restarts)
        // Handle both regular errors and AggregateError (which wraps ECONNREFUSED)
        const isConnectionRefused = error.code === 'ECONNREFUSED' || 
                                    (error.errors && error.errors.some(e => e.code === 'ECONNREFUSED'));
        
        if (isConnectionRefused) {
          // Silently handle - this is expected when server is restarting
          // The reconnection logic will handle retries
          reject(error);
          return;
        }
        
        // For other errors, log normally but concisely
        console.error(`[GameClient] WebSocket connection error:`, error.message || error);
        reject(error);
      });
    });
  }

  /**
   * Authenticate the WebSocket session
   */
  async authenticate() {
    if (!this.connected) {
      throw new Error('Not connected to WebSocket');
    }
    
    // If we have a selected player name, always include it for test bypass
    // The server will check if it's a test account/player
    const authMessage = { type: 'authenticateSession' };
    
    // CRITICAL: Always include playerName if selectedPlayerName is set
    // This is required for the dev-mode test bypass to work
    if (this.selectedPlayerName) {
      authMessage.playerName = String(this.selectedPlayerName); // Ensure it's a string
      console.error(`[GameClient] ✅ Including playerName in auth message: ${authMessage.playerName}`);
    } else {
      console.error(`[GameClient] ❌ No selectedPlayerName set! Cannot use test bypass.`);
    }
    
    console.error(`[GameClient] Sending auth message:`, JSON.stringify(authMessage, null, 2));
    this.send(authMessage);
    
    // Wait for authentication response
    const response = await this.messageQueue.waitForMessage(
      (msg) => msg.type === 'playerStats' || msg.type === 'error',
      10000
    );
    
    if (response.type === 'error') {
      throw new Error(response.message || 'Authentication failed');
    }
    
    this.authenticated = true;
    this.currentPlayer = response;
    return response;
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(message) {
    // Add to queue for waiters
    this.messageQueue.push(message);
    
    // Update internal state based on message type
    switch (message.type) {
      case 'roomUpdate':
      case 'moved':
        this.currentRoom = message.room;
        break;
      case 'playerStats':
        this.currentPlayer = { ...this.currentPlayer, ...message };
        break;
    }
    
    // Call registered handlers
    const handlers = this.messageHandlers.get(message.type) || [];
    handlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error(`Handler error for ${message.type}:`, error);
      }
    });
  }

  /**
   * Register a handler for a specific message type
   */
  onMessage(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  /**
   * Remove a message handler
   */
  offMessage(type, handler) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Send a message to the server
   */
  send(message) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }
    const messageStr = JSON.stringify(message);
    console.error(`[GameClient] send() called. Message: ${messageStr}`);
    this.ws.send(messageStr);
  }

  /**
   * Send a game command and optionally wait for response
   */
  async sendCommand(type, data = {}, responseFilter = null, timeout = 5000) {
    this.send({ type, ...data });
    
    if (responseFilter) {
      return await this.messageQueue.waitForMessage(responseFilter, timeout);
    }
    
    return null;
  }

  /**
   * Wait for a specific message
   */
  async waitForMessage(filter, timeout = 5000) {
    return await this.messageQueue.waitForMessage(filter, timeout);
  }

  /**
   * Get message history
   */
  getMessageHistory(filter = null, limit = 100) {
    return this.messageQueue.getHistory(filter, limit);
  }

  /**
   * Clear message history
   */
  clearMessageHistory() {
    this.messageQueue.clear();
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.ws) {
      // Use terminate() for immediate close to prevent hanging during server restarts
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.terminate(); // Force close immediately
        } else {
          this.ws.close();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.cookies.clear();
  }

  /**
   * Get current session state
   */
  getState() {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      player: this.currentPlayer,
      room: this.currentRoom,
      messageCount: this.messageQueue.length,
    };
  }
}




