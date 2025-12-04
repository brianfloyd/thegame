/**
 * Terminal Component
 * 
 * Isolated terminal rendering with consistent message handling.
 * All messages flow through this component to ensure consistent markup parsing and display.
 */

(function() {
  'use strict';
  
  // Terminal state
  let terminalContent = null;
  let currentPlayerName = null;
  let ws = null;
  let lastInteractionTime = Date.now();
  const IDLE_LOOK_DELAY = 30000; // 30 seconds
  let idleLookInterval = null;
  
  // Get ws and currentPlayerName from global scope (set by client.js)
  function getWS() {
    return ws || (typeof window !== 'undefined' && window.ws) || null;
  }
  
  function getCurrentPlayerName() {
    return currentPlayerName || (typeof window !== 'undefined' && window.currentPlayerName) || null;
  }
  
  /**
   * Initialize terminal component
   */
  function initTerminal() {
    terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) {
      console.error('[Terminal] terminalContent element not found');
      return;
    }
    
    // Subscribe to GameBus events
    GameBus.on('terminal:message', handleTerminalMessage);
    GameBus.on('terminal:error', handleTerminalError);
    GameBus.on('room:update', handleRoomUpdate);
    GameBus.on('room:moved', handleRoomMoved);
    GameBus.on('player:joined', handlePlayerJoined);
    GameBus.on('player:left', handlePlayerLeft);
    GameBus.on('resonated', handleResonated);
    GameBus.on('system:message', handleSystemMessage);
    
    // Listen for player name and WebSocket updates
    GameBus.on('game:connected', (data) => {
      ws = data.ws;
      if (data.playerName) {
        currentPlayerName = data.playerName;
      }
      // Also update global reference for backward compatibility
      if (typeof window !== 'undefined') {
        window.ws = ws;
        if (data.playerName) {
          window.currentPlayerName = currentPlayerName;
        }
      }
    });
    
    // Also listen for player name updates separately
    GameBus.on('player:authenticated', (data) => {
      if (data.playerName) {
        currentPlayerName = data.playerName;
        if (typeof window !== 'undefined') {
          window.currentPlayerName = currentPlayerName;
        }
      }
    });
    
    // Also check global scope on init
    if (typeof window !== 'undefined') {
      if (window.ws) ws = window.ws;
      if (window.currentPlayerName) currentPlayerName = window.currentPlayerName;
    }
    
    // Start idle look timer
    startIdleLookTimer();
  }
  
  /**
   * Add message to terminal with consistent handling
   * @param {string} message - Message text
   * @param {string} type - Message type ('info', 'error', 'success')
   * @param {boolean} saveToHistory - Whether to save to history
   * @param {string|null} html - Optional pre-rendered HTML
   */
  function addMessage(message, type = 'info', saveToHistory = true, html = null) {
    if (!terminalContent) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = type === 'error' ? 'error-message' : 'info-message';
    
    // Apply markup parsing if available
    if (html) {
      // Pre-rendered HTML (for tables, etc.)
      msgDiv.innerHTML = html;
    } else if (typeof parseMarkup !== 'undefined') {
      // Parse markup for regular messages
      msgDiv.innerHTML = parseMarkup(message, '#00ffff');
    } else {
      // Fallback to plain text
      msgDiv.textContent = message;
    }
    
    terminalContent.appendChild(msgDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
    
    // Save to terminal history
    const wsConnection = getWS();
    const playerName = getCurrentPlayerName();
    if (saveToHistory && playerName && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'saveTerminalMessage',
        message: message,
        messageType: type,
        messageHtml: msgDiv.innerHTML
      }));
    }
    
    // Update GameStore
    GameStore.addTerminalMessage(message, type, msgDiv.innerHTML);
  }
  
  /**
   * Handle terminal message event
   */
  function handleTerminalMessage(data) {
    const { message, type = 'info', html = null } = data;
    if (!message) return;
    
    // Check if message contains HTML table (like who command) - don't parse markup for those
    const isHtmlTable = message.includes('<table') || message.includes('<div class="who-list">');
    
    if (html || isHtmlTable) {
      // Direct HTML insertion for tables
      addMessage(message, type, true, html || message);
    } else {
      // Regular message with markup parsing
      addMessage(message, type, true, null);
    }
  }
  
  /**
   * Handle terminal error event
   */
  function handleTerminalError(data) {
    if (data.message) {
      addMessage(data.message, 'error', true);
    }
  }
  
  /**
   * Handle room update event
   */
  function handleRoomUpdate(data) {
    // This will be handled by the room view update function
    // Terminal component just ensures messages are displayed
    if (data.messages) {
      // Room update messages are handled separately in updateRoomView
      // This is just a placeholder for future terminal-specific room messages
    }
  }
  
  /**
   * Handle room moved event
   */
  function handleRoomMoved(data) {
    // Similar to room update
  }
  
  /**
   * Handle player joined event
   */
  function handlePlayerJoined(data) {
    const { playerName, direction, message } = data;
    if (message) {
      addMessage(message, 'info', true);
    } else if (playerName) {
      const dirText = direction ? ` from the ${direction}` : '';
      addMessage(`${playerName} enters${dirText}.`, 'info', true);
    }
  }
  
  /**
   * Handle player left event
   */
  function handlePlayerLeft(data) {
    const { playerName, direction, message } = data;
    if (message) {
      addMessage(message, 'info', true);
    } else if (playerName) {
      const dirText = direction ? ` to the ${direction}` : '';
      addMessage(`${playerName} left${dirText}.`, 'info', true);
    }
  }
  
  /**
   * Handle resonated message
   */
  function handleResonated(data) {
    const { playerName, message } = data;
    if (playerName && message) {
      const terminalContent = document.getElementById('terminalContent');
      if (!terminalContent) return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'resonated-message';
      messageDiv.innerHTML = `<span class="resonated-player">${escapeHtml(playerName)}</span> resonated <span class="resonated-text">${escapeHtml(message)}</span>!`;
      terminalContent.appendChild(messageDiv);
      terminalContent.scrollTop = terminalContent.scrollHeight;
      
      // Save to history
      const wsConnection = getWS();
      const playerName = getCurrentPlayerName();
      if (playerName && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'saveTerminalMessage',
          message: `${playerName} resonated ${message}!`,
          messageType: 'info',
          messageHtml: messageDiv.innerHTML
        }));
      }
    }
  }
  
  /**
   * Handle system message
   */
  function handleSystemMessage(data) {
    if (data.message) {
      const terminalContent = document.getElementById('terminalContent');
      if (!terminalContent) return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'system-message';
      if (typeof parseMarkup !== 'undefined') {
        messageDiv.innerHTML = parseMarkup(data.message, '#00ffff');
      } else {
        messageDiv.textContent = data.message;
      }
      terminalContent.appendChild(messageDiv);
      terminalContent.scrollTop = terminalContent.scrollHeight;
      
      // Save to history
      const wsConnection = getWS();
      const playerName = getCurrentPlayerName();
      if (playerName && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'saveTerminalMessage',
          message: data.message,
          messageType: 'info',
          messageHtml: messageDiv.innerHTML
        }));
      }
    }
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Start idle look timer
   */
  function startIdleLookTimer() {
    if (idleLookInterval) {
      clearInterval(idleLookInterval);
    }
    
    idleLookInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastInteractionTime;
      
      if (idleTime >= IDLE_LOOK_DELAY) {
        // Send look command
        const wsConnection = getWS();
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({ type: 'look' }));
        }
      }
    }, 5000); // Check every 5 seconds
  }
  
  /**
   * Reset idle timer (called on player interaction)
   */
  function resetIdleTimer() {
    lastInteractionTime = Date.now();
  }
  
  // Expose addMessage function globally for backward compatibility
  window.addToTerminal = addMessage;
  window.resetIdleTimer = resetIdleTimer;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTerminal);
  } else {
    initTerminal();
  }
  
})();

