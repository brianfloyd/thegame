/**
 * TestSession - Manages test player lifecycle and state tracking
 * 
 * Provides:
 * - Test account/character management
 * - Session state tracking
 * - Convenience methods for game commands
 * - Singleton pattern for MCP tool access
 */

import { GameClient } from './GameClient.js';
import * as verifier from './StateVerifier.js';

export class TestSession {
  constructor(config = {}) {
    this.client = new GameClient(config);
    this.testEmail = config.testEmail || 'test@test.com';
    this.testPassword = config.testPassword || 'testpass123';
    this.testPlayerId = config.testPlayerId || null;
    this.testPlayerName = config.testPlayerName || null;
    this.state = {
      stats: {},
      inventory: [],
      room: null,
    };
  }

  /**
   * Connect to the game and authenticate
   */
  async connect() {
    // Determine player name
    let playerName = null;
    if (this.testPlayerName) {
      playerName = this.testPlayerName;
    } else if (this.testPlayerId) {
      // Look up player name from playerId
      const player = await verifier.queryOne('SELECT name FROM players WHERE id = $1', [this.testPlayerId]);
      if (player) {
        playerName = player.name; // Already has @ symbols from database
      } else {
        throw new Error(`Player with ID ${this.testPlayerId} not found`);
      }
    }

    if (!playerName) {
      throw new Error('No player specified. Provide testPlayerName or testPlayerId.');
    }

    // For test accounts (test@test.com), use test bypass - skip HTTP session
    // For other accounts, use normal login flow
    if (this.testEmail === 'test@test.com') {
      // Test bypass: directly connect with player name (wrap with @ symbols)
      const wrappedName = playerName.startsWith('@') ? playerName : `@${playerName}@`;
      this.client.selectedPlayerName = wrappedName;
      console.error(`[TestSession] Setting selectedPlayerName to: ${wrappedName} (from input: ${playerName})`);
    } else {
      // Normal flow: login and select character
      try {
        await this.client.login(this.testEmail, this.testPassword);
      } catch (e) {
        if (e.message.includes('not found') || e.message.includes('Invalid')) {
          await this.client.register(this.testEmail, this.testPassword);
        } else {
          throw e;
        }
      }
      await this.client.selectCharacter(playerName);
    }

    // Connect WebSocket and authenticate
    console.error(`[TestSession] About to connect. client.selectedPlayerName=${this.client.selectedPlayerName}`);
    await this.client.connect();
    console.error(`[TestSession] WebSocket connected. client.selectedPlayerName=${this.client.selectedPlayerName}`);
    await this.client.authenticate();
    
    this.updateState();
    return this.getState();
  }

  /**
   * Update internal state from client
   */
  updateState() {
    if (this.client.currentPlayer) {
      this.state.stats = { ...this.client.currentPlayer };
    }
    if (this.client.currentRoom) {
      this.state.room = { ...this.client.currentRoom };
    }
  }

  /**
   * Send a game command
   */
  async sendCommand(type, data = {}) {
    const result = await this.client.sendCommand(type, data);
    this.updateState();
    return result;
  }

  /**
   * Wait for a message matching the filter
   */
  async waitForMessage(filter, timeout = 5000) {
    const msg = await this.client.waitForMessage(filter, timeout);
    this.updateState();
    return msg;
  }

  /**
   * Harvest an NPC
   */
  async harvest(target) {
    return this.sendCommand('harvest', { target });
  }

  /**
   * Move in a direction
   */
  async move(direction) {
    return this.sendCommand('move', { direction });
  }

  /**
   * Look at something or the room
   */
  async look(target = null) {
    return this.sendCommand('look', target ? { target } : {});
  }

  /**
   * Use attune command
   */
  async attune() {
    return this.sendCommand('attune', {});
  }

  /**
   * Get current state
   */
  getState() {
    return {
      connected: this.client.connected,
      authenticated: this.client.authenticated,
      player: this.client.currentPlayer,
      room: this.client.currentRoom,
      stats: this.state.stats,
    };
  }

  /**
   * Get message history
   */
  getMessageHistory(filter = null, limit = 100) {
    return this.client.getMessageHistory(filter, limit);
  }

  /**
   * Disconnect from the game
   */
  disconnect() {
    this.client.disconnect();
  }
}

// Singleton session for MCP tools
let activeSession = null;

export function getActiveSession() {
  return activeSession;
}

export function setActiveSession(session) {
  activeSession = session;
}

export function clearActiveSession() {
  if (activeSession) {
    activeSession.disconnect();
  }
  activeSession = null;
}




