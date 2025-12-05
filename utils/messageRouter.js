/**
 * Message Router
 * 
 * Single entry point for sending messages to players.
 * Handles routing (single player, room, or all players).
 * Ensures ALL messages go through markup processing.
 */

const WebSocket = require('ws');
const { parseMarkupServer, formatMessageForTerminal } = require('./markupService');

// Module-level reference to connectedPlayers (always fresh)
let globalConnectedPlayersRef = null;

/**
 * Set the connected players reference (called from server.js)
 * @param {Map} playersMap - The connected players Map
 */
function setConnectedPlayersReference(playersMap) {
    globalConnectedPlayersRef = playersMap;
}

/**
 * Get the connected players reference (always returns the latest)
 * @returns {Map|null} The connected players Map
 */
function getConnectedPlayersReference() {
    if (!globalConnectedPlayersRef || !(globalConnectedPlayersRef instanceof Map)) {
        console.error('[MessageRouter] ERROR: No valid connectedPlayers reference available. Call setConnectedPlayersReference() first.');
        return null;
    }
    return globalConnectedPlayersRef;
}

/**
 * Get all players in a specific room
 * CRITICAL: Always uses module-level reference for consistency
 * @param {Map} connectedPlayers - Connected players map (ignored, uses module-level reference)
 * @param {number} roomId - Room ID to check
 * @returns {Array} Array of {connId, playerData} objects for players in the room
 */
function getPlayersInRoom(connectedPlayers, roomId) {
    // CRITICAL: Always use module-level reference, ignore passed parameter
    const playersMap = getConnectedPlayersReference();
    
    if (!playersMap) {
        return [];
    }
    const players = [];
    
    if (!roomId || (typeof roomId !== 'number' && typeof roomId !== 'string')) {
        console.error(`[MessageRouter] ERROR: Invalid roomId: ${roomId} (type: ${typeof roomId})`);
        return players;
    }
    
    // Normalize roomId to number for comparison
    const targetRoomId = typeof roomId === 'string' ? parseInt(roomId, 10) : roomId;
    
    try {
        playersMap.forEach((playerData, connId) => {
            if (!playerData) {
                return; // Skip null/undefined entries
            }
            
            // Normalize player's roomId for comparison
            const playerRoomId = typeof playerData.roomId === 'string' 
                ? parseInt(playerData.roomId, 10) 
                : playerData.roomId;
            
            if (playerRoomId === targetRoomId) {
                if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
                    players.push({ connId, playerData });
                }
            }
        });
    } catch (err) {
        console.error(`[MessageRouter] ERROR: Exception in forEach while getting players in room ${roomId}:`, err);
    }
    
    return players;
}

/**
 * Send a message to a specific player
 * @param {Map} connectedPlayers - Connected players map
 * @param {string} connectionId - Connection ID of target player
 * @param {string} message - Raw message text (with markup)
 * @param {string} type - Message type ('info', 'error', 'system')
 * @param {string} keywordColor - Color for <text> markup
 * @returns {boolean} True if message was sent
 */
function sendToPlayer(connectedPlayers, connectionId, message, type = 'info', keywordColor = '#00ffff') {
    if (!connectedPlayers || !(connectedPlayers instanceof Map)) {
        console.error('[MessageRouter] ERROR: connectedPlayers is invalid');
        return false;
    }
    
    const playerData = connectedPlayers.get(connectionId);
    if (!playerData || !playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
        return false;
    }
    
    try {
        // Process markup and format message
        const html = formatMessageForTerminal(message, type, keywordColor);
        
        // Send message
        playerData.ws.send(JSON.stringify({
            type: 'terminal:message',
            message: message, // Raw text for history/search
            html: html, // Pre-processed HTML
            messageType: type
        }));
        
        return true;
    } catch (err) {
        console.error(`[MessageRouter] Error sending message to player ${connectionId}:`, err);
        return false;
    }
}

/**
 * Send a message to all players in a room
 * @param {Map} connectedPlayers - Connected players map
 * @param {number} roomId - Room ID
 * @param {string} message - Raw message text (with markup)
 * @param {string} type - Message type ('info', 'error', 'system')
 * @param {string} keywordColor - Color for <text> markup
 * @param {string|null} excludeConnectionId - Optional connection to exclude
 * @returns {boolean} True if message was sent to at least one player
 */
function sendToRoom(connectedPlayers, roomId, message, type = 'info', keywordColor = '#00ffff', excludeConnectionId = null) {
    const players = getPlayersInRoom(connectedPlayers, roomId);
    
    if (players.length === 0) {
        console.warn(`[MessageRouter] No players found in room ${roomId} to send message: ${message.substring(0, 50)}...`);
        return false;
    }
    
    // Process markup once for all players (consistent formatting)
    const html = formatMessageForTerminal(message, type, keywordColor);
    
    let messageSent = false;
    players.forEach(({ connId, playerData }) => {
        if (connId === excludeConnectionId) {
            return;
        }
        
        try {
            const messagePayload = {
                type: 'terminal:message',
                message: message, // Raw text for history/search
                html: html, // Pre-processed HTML
                messageType: type
            };
            
            if (!playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
                console.warn(`[MessageRouter] Player ${playerData.playerName} (connId: ${connId}) WebSocket not open, skipping message`);
                return;
            }
            
            playerData.ws.send(JSON.stringify(messagePayload));
            messageSent = true;
            console.log(`[MessageRouter] Sent message to player ${playerData.playerName} (connId: ${connId}) in room ${roomId}: ${message.substring(0, 50)}...`);
        } catch (err) {
            console.error(`[MessageRouter] ERROR sending message to player ${playerData.playerName} (connId: ${connId}):`, err);
        }
    });
    
    return messageSent;
}

/**
 * Send a message to all connected players
 * @param {Map} connectedPlayers - Connected players map
 * @param {string} message - Raw message text (with markup)
 * @param {string} type - Message type ('info', 'error', 'system')
 * @param {string} keywordColor - Color for <text> markup
 * @param {string|null} excludeConnectionId - Optional connection to exclude
 * @returns {boolean} True if message was sent to at least one player
 */
function sendToAll(connectedPlayers, message, type = 'info', keywordColor = '#00ffff', excludeConnectionId = null) {
    if (!connectedPlayers || !(connectedPlayers instanceof Map)) {
        console.error('[MessageRouter] ERROR: connectedPlayers is invalid');
        return false;
    }
    
    // Process markup once for all players (consistent formatting)
    const html = formatMessageForTerminal(message, type, keywordColor);
    
    let messageSent = false;
    try {
        connectedPlayers.forEach((playerData, connId) => {
            if (connId === excludeConnectionId) return;
            if (!playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) return;
            
            try {
                playerData.ws.send(JSON.stringify({
                    type: 'terminal:message',
                    message: message, // Raw text for history/search
                    html: html, // Pre-processed HTML
                    messageType: type
                }));
                messageSent = true;
            } catch (err) {
                console.error(`[MessageRouter] Error sending message to player ${playerData.playerName} (connId: ${connId}):`, err);
            }
        });
    } catch (err) {
        console.error('[MessageRouter] ERROR: Exception in forEach while sending to all:', err);
    }
    
    return messageSent;
}

/**
 * Unified message sending function
 * @param {object} options - Message options
 * @param {Map} options.connectedPlayers - Connected players map
 * @param {string} options.to - Target type: 'player', 'room', or 'all'
 * @param {string|number} options.target - Connection ID (for 'player') or Room ID (for 'room'), ignored for 'all'
 * @param {string} options.message - Raw message text (with markup)
 * @param {string} options.type - Message type ('info', 'error', 'system')
 * @param {string} options.keywordColor - Color for <text> markup (default: '#00ffff')
 * @param {string|null} options.excludeConnectionId - Optional connection to exclude
 * @returns {boolean} True if message was sent
 */
function sendMessage(options) {
    // CRITICAL: Always use module-level reference, ignore passed connectedPlayers
    const connectedPlayers = getConnectedPlayersReference();
    
    if (!connectedPlayers) {
        console.error('[MessageRouter] ERROR: No valid connectedPlayers reference. Call setConnectedPlayersReference() first.');
        return false;
    }
    
    const {
        to,
        target,
        message,
        type = 'info',
        keywordColor = '#00ffff',
        excludeConnectionId = null
    } = options;
    
    if (!message || typeof message !== 'string') {
        console.error('[MessageRouter] ERROR: Invalid message:', typeof message, message);
        return false;
    }
    
    switch (to) {
        case 'player':
            if (!target) {
                console.error('[MessageRouter] ERROR: target (connectionId) required for "player"');
                return false;
            }
            return sendToPlayer(connectedPlayers, target, message, type, keywordColor);
            
        case 'room':
            if (target === undefined || target === null) {
                console.error('[MessageRouter] ERROR: target (roomId) required for "room"');
                return false;
            }
            return sendToRoom(connectedPlayers, target, message, type, keywordColor, excludeConnectionId);
            
        case 'all':
            return sendToAll(connectedPlayers, message, type, keywordColor, excludeConnectionId);
            
        default:
            console.error(`[MessageRouter] ERROR: Invalid "to" value: ${to}. Must be "player", "room", or "all"`);
            return false;
    }
}

module.exports = {
    setConnectedPlayersReference,
    getConnectedPlayersReference,
    sendMessage,
    sendToPlayer,
    sendToRoom,
    sendToAll,
    getPlayersInRoom
};

