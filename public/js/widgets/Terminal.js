/**
 * Terminal Component
 * 
 * Handles log display & command input.
 * CRITICAL: Ensures Markup.parse() is ALWAYS used for all messages.
 */

import Component from '../core/Component.js';
import { parseMarkup, initializeTypewriterEffects } from '../utils/Markup.js';

export default class Terminal extends Component {
    constructor(game) {
        super(game);
        this.terminalContent = null;
        this.roomItemsDisplay = null;
        this.commandInput = null;
        this.scrollLockBtn = null;
        this.micBtn = null;
        this.zorkBtn = null;
        this.scrollLocked = false;
        this.recognition = null;
        this.isRecording = false;
        this.userIsTyping = false; // Track if user is manually typing
        this.lastManualInputTime = 0; // Track when user last typed manually
        this.sessionStartText = null; // Track starting text when recording session begins (for additive behavior)
        this.currentRoomId = null;
        this.lastInteractionTime = Date.now();
        this.IDLE_LOOK_DELAY = 30000; // 30 seconds
        this.idleLookInterval = null;
        this.lastIdleLookTime = 0; // Track when we last sent an idle look
        // Track NPC elements in current room for in-place status updates
        this.currentRoomNPCs = new Map(); // npcId -> { element, nameSpan, statusSpan, lastStatus }
        // Track if disconnect message has been shown (to prevent duplicate messages)
        this.disconnectMessageShown = false;
        // Track timeout message element and interval for animated dots
        this.timeoutMessageElement = null;
        this.timeoutInterval = null;
        this.timeoutDotCount = 0;
        // Track if we're waiting for room update after reconnection
        this.waitingForReconnectRoomUpdate = false;
        this.ticketManagerFilter = 'all'; // Track current filter in ticket manager
        this.allTickets = [];
        this.ticketManager = null;
    }
    
    init() {
        super.init();
        
        this.terminalContent = document.getElementById('terminalContent');
        this.roomItemsDisplay = document.getElementById('roomItemsDisplay');
        this.commandInput = document.getElementById('commandInput');
        this.scrollLockBtn = document.getElementById('scrollLockBtn');
        this.micBtn = document.getElementById('micBtn');
        this.zorkBtn = document.getElementById('zorkBtn');
        
        // Track manual typing to prevent voice recognition from interfering
        if (this.commandInput) {
            this.commandInput.addEventListener('input', () => {
                this.userIsTyping = true;
                this.lastManualInputTime = Date.now();
                // Clear flag after a short delay (user stopped typing)
                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    // Only clear if user hasn't typed in last 500ms
                    if (Date.now() - this.lastManualInputTime > 500) {
                        this.userIsTyping = false;
                    }
                }, 500);
            });
            
            this.commandInput.addEventListener('keydown', () => {
                this.userIsTyping = true;
                this.lastManualInputTime = Date.now();
            });
        }
        
        if (!this.terminalContent) {
            console.error('[Terminal] terminalContent element not found');
            return;
        }
        
        // Setup scroll lock button
        if (this.scrollLockBtn) {
            this.scrollLockBtn.addEventListener('click', () => {
                this.toggleScrollLock();
            });
        }
        
        // Setup ZORK interface button
        this.initZorkButton();
        
        // Setup microphone button for voice input
        this.initVoiceInput();
        
        // Subscribe to MessageBus events
        this.subscribe('terminal:message', (data) => this.handleTerminalMessage(data));
        this.subscribe('terminal:error', (data) => this.handleTerminalError(data));
        this.subscribe('game:disconnected', (data) => this.handleDisconnected(data));
        this.subscribe('game:connected', (data) => this.handleConnected(data));
        this.subscribe('room:update', (data) => this.handleRoomUpdate(data));
        this.subscribe('room:moved', (data) => this.handleRoomMoved(data));
        this.subscribe('player:joined', (data) => this.handlePlayerJoined(data));
        this.subscribe('player:left', (data) => this.handlePlayerLeft(data));
        this.subscribe('resonated', (data) => this.handleResonated(data));
        this.subscribe('system:message', (data) => this.handleSystemMessage(data));
        this.subscribe('loreKeeper:message', (data) => this.handleLoreKeeperMessage(data));
        this.subscribe('talked', (data) => this.handleTalked(data));
        this.subscribe('telepath', (data) => this.handleTelepath(data));
        this.subscribe('telepathSent', (data) => this.handleTelepathSent(data));
        this.subscribe('zorkTicketCreated', (data) => this.handleZorkTicketCreated(data));
        this.subscribe('ticket:error', (data) => this.handleTicketError(data));
        this.subscribe('ticketsList', (data) => this.handleTicketsList(data));
        this.subscribe('ticketUpdated', (data) => {
            // If ticket was deleted, immediately remove it from local array to prevent stale display
            if (data.ticket && data.ticket.status === 'deleted') {
                this.allTickets = (this.allTickets || []).filter(t => t && t.id !== data.ticketId);
                // If ticket manager is visible, re-render immediately
                if (this.ticketManager && !this.ticketManager.classList.contains('hidden')) {
                    this.renderTicketManagerList(this.ticketManagerFilter);
                    // If deleted ticket was selected, clear selection
                    const selectedItem = this.ticketManager.querySelector(`.ticket-manager-item[data-ticket-id="${data.ticketId}"]`);
                    if (selectedItem) {
                        const detailsContainer = this.ticketManager.querySelector('#ticketManagerDetails');
                        if (detailsContainer) {
                            detailsContainer.innerHTML = '<p>Select a ticket to view details</p>';
                        }
                    }
                }
            }
            
            if (this.ticketManager && !this.ticketManager.classList.contains('hidden')) {
                this.loadTicketsForManager();
            }
        });
        
        this.subscribe('ticketFeedbackAdded', (data) => {
            if (this.ticketManager && !this.ticketManager.classList.contains('hidden')) {
                this.loadTicketsForManager();
            }
        });
        this.subscribe('terminal:history', (data) => this.handleTerminalHistory(data));
        this.subscribe('merchant:list', (data) => this.handleMerchantList(data));
        
        // Start idle look timer
        this.startIdleLookTimer();
    }
    
    /**
     * Add message to terminal
     * CRITICAL: Messages from server come pre-processed with HTML.
     * Only parse markup for client-generated messages (user input, etc.)
     */
    addMessage(message, type = 'info', saveToHistory = true, html = null) {
        if (!this.terminalContent || !message) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = type === 'error' ? 'error-message' : 'info-message';
        
        if (html) {
            // Pre-processed HTML from server (already has markup parsed)
            // Check if it's a table or special HTML structure
            const isHtmlTable = html.includes('<table') || html.includes('<div class="who-list">');
            if (isHtmlTable) {
                // Direct HTML insertion for tables
                msgDiv.innerHTML = html;
            } else {
                // Pre-processed HTML from server - use directly
                msgDiv.innerHTML = html;
            }
        } else {
            // Client-generated message (e.g., user input, local notifications)
            // Parse markup only (no markdown - use markup conventions instead)
            msgDiv.innerHTML = parseMarkup(message, '#00ffff');
        }
        
        this.terminalContent.appendChild(msgDiv);
        
        // Initialize typewriter effects if any typewriter spans are present
        initializeTypewriterEffects(msgDiv);
        
        this.scrollToBottom();
        
        // Save to terminal history (use raw message text, not HTML)
        if (saveToHistory) {
            this.saveTerminalMessage(message, type, msgDiv.innerHTML);
        }
    }
    
    /**
     * Save terminal message to history (via WebSocket)
     */
    saveTerminalMessage(message, type, html) {
        const ws = this.game.getWebSocket();
        const playerName = this.game.getPlayerName();
        if (playerName && ws && ws.readyState === WebSocket.OPEN) {
            this.game.send({
                type: 'saveTerminalMessage',
                message: message,
                messageType: type,
                messageHtml: html
            });
        }
    }
    
    /**
     * Handle terminal message event
     * CRITICAL: Server sends pre-processed HTML. Use it directly.
     */
    handleTerminalMessage(data) {
        const { message, type = 'info', html = null, messageType = 'info' } = data;
        if (!message) return;
        
        // Filter out authentication error messages during disconnection/reconnection
        const messageLower = message.toLowerCase();
        if (messageLower.includes('not authenticated') || messageLower.includes('please authenticate')) {
            // Silently ignore these messages during reconnection attempts
            return;
        }
        
        // Server sends pre-processed HTML - use it directly
        // If html is provided, it's already been processed by the server's markup service
        // If not provided, fall back to client-side parsing (for backwards compatibility)
        const finalType = messageType || type;
        if (html) {
            this.addMessage(message, finalType, true, html);
        } else {
            // Fallback: parse client-side (shouldn't happen with new system, but for safety)
            this.addMessage(message, finalType, true, null);
        }
    }
    
    /**
     * Handle terminal error event
     */
    handleTerminalError(data) {
        if (data.message) {
            // Filter out authentication error messages during disconnection/reconnection
            const message = data.message.toLowerCase();
            if (message.includes('not authenticated') || message.includes('please authenticate')) {
                // Silently ignore these messages during reconnection attempts
                return;
            }
            this.addMessage(data.message, 'error', true);
        }
    }
    
    /**
     * Handle disconnect event - show animated timeout message with dots
     */
    handleDisconnected(data) {
        // Always clean up and replace any existing disconnect messages
        if (this.terminalContent) {
            // First, remove any existing disconnect/reconnect messages (old static messages)
            const errorMessages = this.terminalContent.querySelectorAll('.error-message');
            errorMessages.forEach(msg => {
                const text = msg.textContent || msg.innerText || '';
                if (text.toLowerCase().includes('connection has failed') || 
                    text.toLowerCase().includes('attempting to reconnect') ||
                    text.toLowerCase().includes('server connection') ||
                    text.toLowerCase().includes('server timeout')) {
                    msg.remove();
                }
            });
            
            // Also remove any existing timeout message element if it exists
            const existingTimeoutMsg = document.getElementById('timeout-message');
            if (existingTimeoutMsg) {
                existingTimeoutMsg.remove();
            }
            
            // Clear any existing timeout interval
            if (this.timeoutInterval) {
                clearInterval(this.timeoutInterval);
                this.timeoutInterval = null;
            }
        }
        
        // Only show disconnect message once per disconnect session
        if (!this.disconnectMessageShown) {
            this.disconnectMessageShown = true;
            this.timeoutDotCount = 1; // Start with 1 dot immediately
            
            if (this.terminalContent) {
                // Create the new timeout message element
                const msgDiv = document.createElement('div');
                msgDiv.className = 'error-message';
                msgDiv.id = 'timeout-message';
                msgDiv.textContent = 'server timeout.'; // Start with 1 dot
                this.terminalContent.appendChild(msgDiv);
                this.timeoutMessageElement = msgDiv;
                
                // Start interval to increment dots every 5 seconds
                this.timeoutInterval = setInterval(() => {
                    if (this.timeoutMessageElement && this.terminalContent) {
                        // Verify the element still exists in the DOM
                        if (!document.getElementById('timeout-message')) {
                            // Element was removed, clean up
                            if (this.timeoutInterval) {
                                clearInterval(this.timeoutInterval);
                                this.timeoutInterval = null;
                            }
                            return;
                        }
                        
                        this.timeoutDotCount++;
                        
                        // Reset after 100 dots
                        if (this.timeoutDotCount > 100) {
                            this.timeoutDotCount = 1;
                        }
                        
                        // Update the message with dots
                        const dots = '.'.repeat(this.timeoutDotCount);
                        this.timeoutMessageElement.textContent = `server timeout${dots}`;
                    } else {
                        // Clean up if element was removed
                        if (this.timeoutInterval) {
                            clearInterval(this.timeoutInterval);
                            this.timeoutInterval = null;
                        }
                    }
                }, 5000); // Update every 5 seconds
            }
        }
    }
    
    /**
     * Handle reconnect event - clear disconnect messages
     * Note: Server automatically sends roomUpdate and triggers look after authentication
     */
    handleConnected(data) {
        // Reset disconnect message flag on successful reconnection
        const wasDisconnected = this.disconnectMessageShown;
        this.disconnectMessageShown = false;
        
        // Clear timeout interval if it exists
        if (this.timeoutInterval) {
            clearInterval(this.timeoutInterval);
            this.timeoutInterval = null;
        }
        
        // Remove timeout message element if it exists
        if (this.timeoutMessageElement) {
            this.timeoutMessageElement.remove();
            this.timeoutMessageElement = null;
        }
        this.timeoutDotCount = 0;
        
        if (wasDisconnected && this.terminalContent) {
            // Remove recent disconnect/reconnection error messages from terminal
            const errorMessages = this.terminalContent.querySelectorAll('.error-message');
            // Remove the last few error messages that are likely connection-related
            // Check last 10 messages for connection-related errors (in case multiple reconnect attempts)
            const messagesToCheck = Array.from(errorMessages).slice(-10);
            messagesToCheck.forEach(msg => {
                const text = msg.textContent || msg.innerText || '';
                if (text.toLowerCase().includes('connection has failed') || 
                    text.toLowerCase().includes('attempting to reconnect') ||
                    text.toLowerCase().includes('server connection') ||
                    text.toLowerCase().includes('server timeout') ||
                    text.toLowerCase().includes('not valid session') ||
                    text.toLowerCase().includes('select a character') ||
                    text.toLowerCase().includes('please authenticate')) {
                    msg.remove();
                }
            });
            
            // Show reconnection success message
            // Server will automatically send roomUpdate and trigger look after authentication completes
            this.addMessage('✓ Reconnected to server successfully.', 'info', true);
            
            // Mark that we're waiting for room update after reconnection
            // This will be handled when roomUpdate arrives (server sends it automatically after auth)
            this.waitingForReconnectRoomUpdate = true;
        }
    }
    
    /**
     * Handle room update event
     */
    handleRoomUpdate(data) {
        const { room, players, exits, npcs, roomItems, showFullInfo, messages } = data;
        if (!room) return;
        
        const isNewRoom = room.id !== this.currentRoomId;
        
        // Clear NPC tracking map when room changes
        if (isNewRoom) {
            this.currentRoomNPCs.clear();
        }
        
        // If we're waiting for room update after reconnection, force full display
        const forceFullDisplay = this.waitingForReconnectRoomUpdate;
        if (forceFullDisplay) {
            this.waitingForReconnectRoomUpdate = false; // Reset flag
        }
        
        this.currentRoomId = room.id;
        
        // Display full room info when entering a new room, forced (look command), or after reconnection
        if (isNewRoom || showFullInfo || forceFullDisplay) {
            this.updateRoomView(room, players, exits, npcs, roomItems, showFullInfo || forceFullDisplay, messages);
        } else {
            // Same room - check for NPC status updates
            this.updateNPCStatusesInPlace(npcs);
        }
        
        // Always update room items display (dynamic, doesn't scroll)
        this.updateRoomItemsDisplay(roomItems, messages);
    }
    
    /**
     * Handle room moved event
     */
    handleRoomMoved(data) {
        // Same as room update
        this.handleRoomUpdate(data);
    }
    
    /**
     * Get NPC status message based on state
     */
    getNPCStatusMessage(npc) {
        if (!npc.state || typeof npc.state !== 'object') {
            return '';
        }
        
        const cycles = npc.state.cycles || 0;
        if (cycles === 0) {
            return npc.statusMessageIdle ?? '(idle)';
        } else if (npc.state.harvest_active || npc.harvestStatus === 'active') {
            return npc.statusMessageHarvesting ?? '(harvesting)';
        } else if ((npc.state.cooldown_until && Date.now() < npc.state.cooldown_until) || npc.harvestStatus === 'cooldown') {
            return npc.statusMessageCooldown ?? '(cooldown)';
        } else {
            return npc.statusMessageReady ?? '(ready)';
        }
    }
    
    /**
     * Update room view with full room information
     * CRITICAL: All text rendering uses parseMarkup()
     */
    updateRoomView(room, players, exits, npcs, roomItems, forceFullDisplay = false, messages = null) {
        if (!this.terminalContent) return;
        
        // Add separator for readability
        if (this.terminalContent.children.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'terminal-separator';
            separator.textContent = '─'.repeat(40);
            this.terminalContent.appendChild(separator);
            this.saveTerminalMessage('─'.repeat(40), 'info');
        }
        
        // Display room name with map name prefix
        const roomNameDiv = document.createElement('div');
        roomNameDiv.className = 'room-name';
        const displayName = room.mapName ? `${room.mapName}, ${room.name}` : room.name;
        roomNameDiv.textContent = displayName;
        this.terminalContent.appendChild(roomNameDiv);
        this.saveTerminalMessage(displayName, 'info');
        
        // Display room description (CRITICAL: uses parseMarkup)
        const roomDescDiv = document.createElement('div');
        roomDescDiv.className = 'room-description';
        if (room.description) {
            roomDescDiv.innerHTML = parseMarkup(room.description, '#00ffff');
        }
        this.terminalContent.appendChild(roomDescDiv);
        if (room.description) {
            this.saveTerminalMessage(room.description, 'info');
        }
        
        // Display players and NPCs
        // Always create trackable NPC elements for in-place status updates
        {
            const currentPlayerName = this.game.getPlayerName();
            const otherPlayers = players ? players.filter(p => p !== currentPlayerName) : [];
            
            const playersDiv = document.createElement('div');
            playersDiv.className = 'players-section';
            const playersLine = document.createElement('span');
            playersLine.className = 'players-line';
            
            // Create title
            const titleSpan = document.createElement('span');
            titleSpan.className = 'players-section-title';
            titleSpan.textContent = 'Also here:';
            playersLine.appendChild(titleSpan);
            
            // Add players
            if (otherPlayers.length > 0) {
                playersLine.appendChild(document.createTextNode(' '));
                otherPlayers.forEach((playerName, index) => {
                    if (index > 0) {
                        playersLine.appendChild(document.createTextNode(', '));
                    }
                    const playerSpan = document.createElement('span');
                    playerSpan.className = 'player-item';
                    playerSpan.setAttribute('data-player', playerName);
                    // CRITICAL: Use parseMarkup to support markup in player names
                    playerSpan.innerHTML = parseMarkup(playerName, '#00ffff');
                    playersLine.appendChild(playerSpan);
                });
            }
            
            // Add NPCs with trackable elements
            if (npcs && npcs.length > 0) {
                if (otherPlayers.length > 0) {
                    playersLine.appendChild(document.createTextNode(', '));
                } else {
                    playersLine.appendChild(document.createTextNode(' '));
                }
                
                npcs.forEach((npc, index) => {
                    if (index > 0) {
                        playersLine.appendChild(document.createTextNode(', '));
                    }
                    
                    const npcItem = document.createElement('span');
                    npcItem.className = 'npc-item';
                    npcItem.setAttribute('data-npc-id', npc.id);
                    
                    const npcName = document.createElement('span');
                    npcName.className = 'npc-name';
                    // CRITICAL: Use parseMarkup to support markup conventions like .. for pulsing
                    npcName.innerHTML = parseMarkup(npc.name, npc.color || npc.display_color || '#00ffff');
                    npcItem.appendChild(npcName);
                    
                    const statusMessage = this.getNPCStatusMessage(npc);
                    let npcStatus = null; // Declare outside the if block
                    if (statusMessage) {
                        npcItem.appendChild(document.createTextNode(' '));
                        npcStatus = document.createElement('span');
                        npcStatus.className = 'npc-status';
                        npcStatus.setAttribute('data-npc-status', npc.id);
                        // CRITICAL: Use parseMarkup to support markup in status messages
                        npcStatus.innerHTML = parseMarkup(statusMessage, '#00ffff');
                        npcItem.appendChild(npcStatus);
                    }
                    
                    playersLine.appendChild(npcItem);
                    
                    // Track this NPC element
                    this.currentRoomNPCs.set(npc.id, {
                        element: npcItem,
                        nameSpan: npcName,
                        statusSpan: npcStatus, // Now always defined (null if no status)
                        lastStatus: statusMessage
                    });
                });
            }
            
            if (otherPlayers.length === 0 && (!npcs || npcs.length === 0)) {
                playersLine.appendChild(document.createTextNode(' '));
                const emptySpan = document.createElement('span');
                emptySpan.className = 'player-item';
                emptySpan.textContent = 'No one else is here.';
                playersLine.appendChild(emptySpan);
            }
            
            playersDiv.appendChild(playersLine);
            this.terminalContent.appendChild(playersDiv);
            
            // Build history text from the entities we just displayed inline
            // This is only for saving to history, not for display (we already displayed it inline above)
            const combinedEntities = [...otherPlayers];
            if (npcs && npcs.length > 0) {
                npcs.forEach(npc => {
                    const statusMessage = this.getNPCStatusMessage(npc);
                    // Use raw NPC name for history (markup will be processed when history is displayed)
                    combinedEntities.push(npc.name + (statusMessage ? ' ' + statusMessage : ''));
                });
            }
            const historyText = combinedEntities.length > 0 
                ? 'Also here: ' + combinedEntities.join(', ')
                : 'Also here: No one else is here.';
            // Save to history only - saveTerminalMessage doesn't display, it only saves to server
            this.saveTerminalMessage(historyText, 'info');
        }
        
        // Display exits (CRITICAL: uses parseMarkup or pre-processed HTML)
        if (messages && (messages.obviousExitsHtml || messages.obviousExits) && (messages.obviousExits || '').trim() !== '') {
            const exitsDiv = document.createElement('div');
            exitsDiv.className = 'exits-section';
            // Use pre-processed HTML if available (server-side markup processing), otherwise process on client
            exitsDiv.innerHTML = messages.obviousExitsHtml || parseMarkup(messages.obviousExits, '#00ffff');
            this.terminalContent.appendChild(exitsDiv);
            // Save raw message to history (for backward compatibility)
            if (messages.obviousExits) {
                this.saveTerminalMessage(messages.obviousExits, 'info');
            }
        } else if (exits && exits.length > 0) {
            const exitsDiv = document.createElement('div');
            exitsDiv.className = 'exits-section';
            const exitsText = `Obvious exits: ${exits.join(', ')}`;
            exitsDiv.innerHTML = `<span class="exits-section-title">Obvious exits:</span> ${exits.join(', ')}`;
            this.terminalContent.appendChild(exitsDiv);
            this.saveTerminalMessage(exitsText, 'info');
        }
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Emit event for other components (compass, map, etc.)
        this.emit('terminal:roomUpdated', { room, players, exits, npcs });
    }
    
    /**
     * Update NPC status in place (without re-rendering)
     */
    updateNPCStatus(npcId, statusMessage) {
        const npcData = this.currentRoomNPCs.get(npcId);
        if (!npcData) {
            // NPC element not found (might have left room or not yet tracked)
            return false;
        }
        
        const { statusSpan, element } = npcData;
        
        if (!statusSpan) {
            // No status span exists - need to create it
            if (statusMessage) {
                element.appendChild(document.createTextNode(' '));
                const newStatusSpan = document.createElement('span');
                newStatusSpan.className = 'npc-status';
                newStatusSpan.setAttribute('data-npc-status', npcId);
                // CRITICAL: Use parseMarkup to support markup in status messages
                newStatusSpan.innerHTML = parseMarkup(statusMessage, '#00ffff');
                element.appendChild(newStatusSpan);
                
                // Update tracking
                npcData.statusSpan = newStatusSpan;
                npcData.lastStatus = statusMessage;
            }
        } else {
            // Update existing status span
            // CRITICAL: Use parseMarkup to support markup in status messages
            statusSpan.innerHTML = statusMessage ? parseMarkup(statusMessage, '#00ffff') : '';
            npcData.lastStatus = statusMessage;
        }
        
        return true;
    }
    
    /**
     * Update NPC statuses in place when room updates (same room)
     */
    updateNPCStatusesInPlace(npcs) {
        if (!npcs || npcs.length === 0) {
            // No NPCs in room - remove any tracked NPCs that are no longer present
            this.currentRoomNPCs.forEach((npcData, npcId) => {
                // Check if element still exists in DOM
                if (!npcData.element || !npcData.element.parentNode) {
                    this.currentRoomNPCs.delete(npcId);
                }
            });
            return;
        }
        
        // Track which NPCs are currently in the room
        const currentNPCIds = new Set(npcs.map(npc => npc.id));
        
        // Remove NPCs that are no longer in the room
        this.currentRoomNPCs.forEach((npcData, npcId) => {
            if (!currentNPCIds.has(npcId)) {
                // NPC left room - remove from tracking
                this.currentRoomNPCs.delete(npcId);
            }
        });
        
        // Update status for each NPC
        npcs.forEach(npc => {
            const statusMessage = this.getNPCStatusMessage(npc);
            const npcData = this.currentRoomNPCs.get(npc.id);
            
            if (npcData) {
                // NPC is tracked - check if status changed
                if (npcData.lastStatus !== statusMessage) {
                    this.updateNPCStatus(npc.id, statusMessage);
                }
            } else {
                // NPC is new (entered room) - will be tracked on next full room render
                // For now, we can't update it in place since it's not in the current room view
            }
        });
    }
    
    /**
     * Add click handlers for player names
     */
    addPlayerClickHandlers(element, playerNames) {
        playerNames.forEach(playerName => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const nodesToProcess = [];
            let node;
            while (node = walker.nextNode()) {
                const parent = node.parentNode;
                if (parent && !parent.classList.contains('player-item') && 
                    !parent.querySelector(`[data-player="${playerName}"]`) &&
                    new RegExp(`\\b${playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(node.textContent)) {
                    nodesToProcess.push(node);
                }
            }
            
            nodesToProcess.forEach(textNode => {
                const text = textNode.textContent;
                const regex = new RegExp(`\\b(${playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'g');
                if (!regex.test(text)) return;
                
                const parent = textNode.parentNode;
                if (!parent) return;
                
                const parts = text.split(regex);
                const fragment = document.createDocumentFragment();
                
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i] === playerName) {
                        const playerSpan = document.createElement('span');
                        playerSpan.className = 'player-item';
                        playerSpan.setAttribute('data-player', playerName);
                        playerSpan.textContent = playerName;
                        fragment.appendChild(playerSpan);
                    } else if (parts[i]) {
                        fragment.appendChild(document.createTextNode(parts[i]));
                    }
                }
                
                parent.replaceChild(fragment, textNode);
            });
        });
    }
    
    /**
     * Update room items display (dynamic status bar)
     */
    updateRoomItemsDisplay(roomItems, messages) {
        if (!this.roomItemsDisplay) return;
        
        // Use formatted message from server if available
        if (messages && messages.onGround) {
            // Extract just the items part (after "On the ground: ")
            const itemsPart = messages.onGround.replace(/^On the ground:\s*/i, '');
            
            // CRITICAL: Parse markup
            this.roomItemsDisplay.innerHTML = parseMarkup(itemsPart, '#00ffff');
            this.roomItemsDisplay.className = itemsPart === 'Nothing' ? 'room-items-display empty' : 'room-items-display';
            return;
        }
        
        // Fallback to old logic
        if (!roomItems || roomItems.length === 0) {
            this.roomItemsDisplay.textContent = 'Nothing';
            this.roomItemsDisplay.className = 'room-items-display empty';
            return;
        }
        
        // Build item list with quantities
        const itemStrings = roomItems.map(item => {
            if (item.quantity > 1) {
                return `${item.item_name} <span class="item-count">(x${item.quantity})</span>`;
            }
            return item.item_name;
        });
        
        this.roomItemsDisplay.innerHTML = itemStrings.join(', ');
        this.roomItemsDisplay.className = 'room-items-display';
    }
    
    /**
     * Handle player joined event
     */
    handlePlayerJoined(data) {
        const { playerName, direction, message } = data;
        if (message) {
            this.addMessage(message, 'info', true);
        } else if (playerName) {
            const dirText = direction ? ` from the ${direction}` : '';
            this.addMessage(`${this.cleanPlayerName(playerName)} enters${dirText}.`, 'info', true);
        }
    }
    
    /**
     * Handle player left event
     */
    handlePlayerLeft(data) {
        const { playerName, direction, message } = data;
        if (message) {
            this.addMessage(message, 'info', true);
        } else if (playerName) {
            const dirText = direction ? ` to the ${direction}` : '';
            this.addMessage(`${this.cleanPlayerName(playerName)} left${dirText}.`, 'info', true);
        }
    }
    
    /**
     * Handle resonated message
     */
    handleResonated(data) {
        const { playerName, message } = data;
        if (playerName && message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'resonated-message';
            messageDiv.innerHTML = `<span class="resonated-player">${this.escapeHtml(this.cleanPlayerName(playerName))}</span> resonated <span class="resonated-text">${this.escapeHtml(message)}</span>!`;
            this.terminalContent.appendChild(messageDiv);
            this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
            this.saveTerminalMessage(`${this.cleanPlayerName(playerName)} resonated ${message}!`, 'info');
        }
    }
    
    /**
     * Handle system message
     * CRITICAL: Uses parseMarkup()
     */
    handleSystemMessage(data) {
        if (data.message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'system-message';
            // CRITICAL: Always use parseMarkup
            messageDiv.innerHTML = parseMarkup(data.message, '#00ffff');
            this.terminalContent.appendChild(messageDiv);
            this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
            this.saveTerminalMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle Lore Keeper message
     */
    handleLoreKeeperMessage(data) {
        const { npcName, npcColor, message, messageColor, isSuccess, isFailure, keywordColor } = data;
        if (!npcName || !message) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'lorekeeper-message';
        
        if (isSuccess) {
            messageDiv.classList.add('lorekeeper-success');
        } else if (isFailure) {
            messageDiv.classList.add('lorekeeper-failure');
        }
        
        // Parse message with glow effects (uses parseMarkup internally via parseLoreKeeperGlow)
        const npcColorStyle = npcColor || '#00ffff';
        const msgColorStyle = messageColor || '#cccccc';
        const parsedMessage = this.parseLoreKeeperGlow(message, keywordColor || npcColor);
        
        messageDiv.innerHTML = `<span class="lorekeeper-name" style="color: ${npcColorStyle}">${this.escapeHtml(npcName)}</span> says "<span class="lorekeeper-text" style="color: ${msgColorStyle}">${parsedMessage}</span>"`;
        
        this.terminalContent.appendChild(messageDiv);
        this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
    }
    
    /**
     * Parse Lore Keeper message with glow effects
     */
    parseLoreKeeperGlow(text, keywordColor) {
        // First escape HTML to prevent XSS
        const escaped = this.escapeHtml(text);
        const glowColor = keywordColor || '#ff00ff';
        
        // Replace [text] with glowing span that preserves original color (inherit)
        let result = escaped.replace(/\[([^\]]+)\]/g, `<span class="lorekeeper-glow-preserve">$1</span>`);
        
        // Replace <text> with glowing span that uses keyword color
        result = result.replace(/&lt;([^&]+)&gt;/g, `<span class="lorekeeper-glow" style="color: ${glowColor}">$1</span>`);
        
        // Replace !text! with glowing span that uses red color
        result = result.replace(/!([^!]+)!/g, `<span class="lorekeeper-glow" style="color: #ff0000">$1</span>`);
        
        return result;
    }
    
    /**
     * Handle talked message
     */
    handleTalked(data) {
        const { playerName, message } = data;
        if (playerName && message) {
            // Parse markup only (no markdown - use markup conventions instead)
            const formattedHtml = parseMarkup(message, '#00ffff');
            
            const msgDiv = document.createElement('div');
            msgDiv.className = 'talked-message';
            msgDiv.innerHTML = `<span class="talked-player">${this.escapeHtml(this.cleanPlayerName(playerName))}</span> says: <span class="talked-text">${formattedHtml}</span>`;
            this.terminalContent.appendChild(msgDiv);
            this.scrollToBottom();
            this.saveTerminalMessage(`${this.cleanPlayerName(playerName)} says "${message}"`, 'info', msgDiv.innerHTML);
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Clean player name for display by stripping @ symbols
     * Internal format: @PlayerName@ -> Display format: PlayerName
     */
    cleanPlayerName(name) {
        if (!name) return name;
        // Strip @ symbols from beginning and end
        return name.replace(/^@|@$/g, '');
    }
    
    // ========================================================================
    // ZORK Interface Button
    // ========================================================================
    
    /**
     * Initialize ZORK interface button for direct ticket creation
     */
    initZorkButton() {
        if (!this.zorkBtn) {
            console.warn('[Terminal] ZORK button not found');
            return;
        }
        
        this.zorkBtn.addEventListener('click', () => {
            this.openZorkTicketManager();
        });
        
    }
    
    /**
     * Open comprehensive ZORK ticket management UI
     */
    openZorkTicketManager() {
        // Create or get the ticket manager dialog
        let manager = document.getElementById('zorkTicketManager');
        if (!manager) {
            manager = this.createTicketManager();
        }
        
        // Restore filter from localStorage
        if (typeof localStorage !== 'undefined') {
            const storedFilter = localStorage.getItem('ticketManager_filter');
            if (storedFilter && ['all', 'open', 'backlog', 'in_progress', 'resolved'].includes(storedFilter)) {
                this.ticketManagerFilter = storedFilter;
                // Update active button
                setTimeout(() => {
                    const filterBtn = manager.querySelector(`[data-filter="${storedFilter}"]`);
                    if (filterBtn) {
                        manager.querySelectorAll('.ticket-filter-btn').forEach(btn => btn.classList.remove('active'));
                        filterBtn.classList.add('active');
                    }
                }, 100);
            }
        }
        
        // Load tickets and show manager
        this.loadTicketsForManager();
        manager.classList.remove('hidden');
    }
    
    /**
     * Create the comprehensive ticket management UI
     */
    createTicketManager() {
        const manager = document.createElement('div');
        manager.id = 'zorkTicketManager';
        manager.className = 'zork-ticket-manager-overlay hidden';
        manager.innerHTML = `
            <div class="zork-ticket-manager">
                <div class="zork-ticket-manager-header">
                    <h2>ZORK Ticket Management</h2>
                    <button class="zork-ticket-manager-close" onclick="document.getElementById('zorkTicketManager').classList.add('hidden')">×</button>
                </div>
                <div class="zork-ticket-manager-toolbar">
                    <div class="zork-ticket-manager-filters">
                        <button class="ticket-filter-btn active" data-filter="all">All</button>
                        <button class="ticket-filter-btn" data-filter="open">Open</button>
                        <button class="ticket-filter-btn" data-filter="backlog">Backlog</button>
                        <button class="ticket-filter-btn" data-filter="in_progress">In Progress</button>
                        <button class="ticket-filter-btn" data-filter="resolved">Resolved</button>
                    </div>
                    <div class="zork-ticket-manager-actions">
                        <input type="text" id="ticketSearchInput" class="ticket-search-input" placeholder="Search tickets...">
                        <button class="ticket-action-btn-primary" id="createNewTicketBtn">+ New Ticket</button>
                        <button class="ticket-action-btn" id="refreshTicketsBtn">Refresh</button>
                    </div>
                </div>
                <div class="zork-ticket-manager-content">
                    <div class="zork-ticket-manager-sidebar">
                        <div id="ticketManagerList" class="ticket-manager-list">
                            <div class="ticket-manager-loading">Loading tickets...</div>
                        </div>
                    </div>
                    <div class="zork-ticket-manager-main">
                        <div id="ticketManagerDetails" class="ticket-manager-details">
                            <div class="ticket-manager-empty">
                                <p>Select a ticket to view details</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(manager);
        
        // Setup event handlers
        this.setupTicketManagerHandlers(manager);
        
        return manager;
    }
    
    /**
     * Setup handlers for ticket manager
     */
    setupTicketManagerHandlers(manager) {
        // Filter buttons
        manager.querySelectorAll('.ticket-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                manager.querySelectorAll('.ticket-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                this.filterTicketsInManager(filter);
            });
        });
        
        // Search input
        const searchInput = manager.querySelector('#ticketSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTicketsInManager(e.target.value);
            });
        }
        
        // Create new ticket button
        const createBtn = manager.querySelector('#createNewTicketBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.showCreateTicketForm(manager);
            });
        }
        
        // Refresh button
        const refreshBtn = manager.querySelector('#refreshTicketsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadTicketsForManager();
            });
        }
        
        // Store manager reference
        this.ticketManager = manager;
        
        // Store terminal reference globally for onclick handlers
        if (typeof window !== 'undefined') {
            window.terminal = this;
        }
    }
    
    /**
     * Load tickets for the manager
     */
    loadTicketsForManager() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[Terminal] Not connected');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'getTickets',
            status: null, // Get all
            limit: 200,
            includeResolved: true
        }));
    }
    
    /**
     * Handle tickets list response
     */
    handleTicketsList(data) {
        if (!this.ticketManager) {
            console.warn('[Terminal] Ticket manager not found, cannot update list');
            return;
        }
        
        // CRITICAL: Restore filter from active button or use stored filter
        const activeFilterBtn = this.ticketManager.querySelector('.ticket-filter-btn.active');
        if (activeFilterBtn) {
            const filterFromButton = activeFilterBtn.dataset.filter || 'all';
            this.ticketManagerFilter = filterFromButton;
        }
        
        this.allTickets = data.tickets || [];
        this.renderTicketManagerList(this.ticketManagerFilter);
        
        // If a ticket was selected, re-select it to refresh details
        const selectedItem = this.ticketManager.querySelector('.ticket-manager-item.selected');
        if (selectedItem) {
            const ticketId = parseInt(selectedItem.dataset.ticketId);
            this.selectTicketInManager(ticketId);
        }
    }
    
    /**
     * Render ticket list in manager
     */
    renderTicketManagerList(filter = null, searchTerm = '') {
        if (!this.ticketManager) return;
        
        // Use provided filter, stored filter, or default to 'all'
        if (filter === null) {
            filter = this.ticketManagerFilter || 'all';
        }
        
        // Store the filter
        this.ticketManagerFilter = filter;
        
        const listContainer = this.ticketManager.querySelector('#ticketManagerList');
        if (!listContainer) return;
        
        let filtered = [...(this.allTickets || [])];
        
        // CRITICAL: Always filter out deleted tickets first, regardless of filter
        const beforeDeletedFilter = filtered.length;
        filtered = filtered.filter(t => t && t.status !== 'deleted');
        // Apply status filter
        if (filter !== 'all') {
            filtered = filtered.filter(t => t.status === filter);
        }
        
        // Apply search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(t => 
                t.title.toLowerCase().includes(term) ||
                (t.description && t.description.toLowerCase().includes(term)) ||
                (t.created_by && t.created_by.toLowerCase().includes(term))
            );
        }
        
        // Sort by priority (desc) then created_at (asc)
        filtered.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return new Date(a.created_at) - new Date(b.created_at);
        });
        
        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="ticket-manager-empty">No tickets found</div>';
            return;
        }
        
        let html = '';
        filtered.forEach(ticket => {
            const statusEmoji = ticket.status === 'open' ? '🔴' : ticket.status === 'in_progress' ? '🟡' : '✅';
            const priorityText = ['', 'Low', 'Medium', 'High', 'Critical'][ticket.priority || 2];
            const priorityClass = ticket.priority >= 4 ? 'critical' : ticket.priority >= 3 ? 'high' : '';
            
            // Check if Cursor is working on this (in_progress status means Cursor is working)
            const cursorWorking = ticket.status === 'in_progress';
            const cursorIndicator = cursorWorking ? '<span class="cursor-working-indicator" title="Cursor is working on this ticket">🤖 Cursor Working...</span>' : '';
            
            html += `
                <div class="ticket-manager-item ${priorityClass} ${cursorWorking ? 'cursor-working' : ''}" data-ticket-id="${ticket.id}">
                    <div class="ticket-manager-item-header">
                        <span class="ticket-manager-status">${statusEmoji}</span>
                        <span class="ticket-manager-id">#${ticket.id}</span>
                        <span class="ticket-manager-priority ${priorityClass}">${priorityText}</span>
                        ${cursorIndicator}
                    </div>
                    <div class="ticket-manager-item-title">${this.escapeHtml(ticket.title)}</div>
                    <div class="ticket-manager-item-meta">
                        <span>${ticket.ticket_type || 'debug'}</span>
                        <span>${new Date(ticket.created_at).toLocaleDateString()}</span>
                        ${ticket.created_by ? `<span>by ${this.escapeHtml(ticket.created_by)}</span>` : ''}
                        ${ticket.updated_at && ticket.updated_at !== ticket.created_at ? `<span class="ticket-updated">Updated: ${new Date(ticket.updated_at).toLocaleString()}</span>` : ''}
                    </div>
                    ${cursorWorking && ticket.resolution_notes ? `<div class="ticket-resolution-preview">${this.escapeHtml(ticket.resolution_notes.substring(0, 150))}${ticket.resolution_notes.length > 150 ? '...' : ''}</div>` : ''}
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
        
        // Setup click handlers for ticket items
        listContainer.querySelectorAll('.ticket-manager-item').forEach(item => {
            item.addEventListener('click', () => {
                const ticketId = parseInt(item.dataset.ticketId);
                this.selectTicketInManager(ticketId);
            });
        });
    }
    
    /**
     * Filter tickets in manager
     */
    filterTicketsInManager(filter) {
        // Store the filter
        this.ticketManagerFilter = filter;
        // Save to localStorage
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ticketManager_filter', filter);
        }
        
        // Update active button state
        this.ticketManager.querySelectorAll('.ticket-filter-btn').forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        const searchTerm = this.ticketManager.querySelector('#ticketSearchInput')?.value || '';
        this.renderTicketManagerList(filter, searchTerm);
    }
    
    /**
     * Search tickets in manager
     */
    searchTicketsInManager(searchTerm) {
        const activeFilter = this.ticketManager.querySelector('.ticket-filter-btn.active')?.dataset.filter || 'all';
        this.renderTicketManagerList(activeFilter, searchTerm);
    }
    
    /**
     * Select ticket to view details (called from onclick in HTML)
     */
    selectTicketInManager(ticketId) {
        const ticket = this.allTickets.find(t => t.id === ticketId);
        if (!ticket) return;
        
        this.renderTicketDetails(ticket);
        
        // Highlight selected item
        this.ticketManager.querySelectorAll('.ticket-manager-item').forEach(item => {
            item.classList.remove('selected');
        });
        const item = this.ticketManager.querySelector(`[data-ticket-id="${ticketId}"]`);
        if (item) item.classList.add('selected');
    }
    
    /**
     * Render ticket details
     */
    renderTicketDetails(ticket) {
        const detailsContainer = this.ticketManager.querySelector('#ticketManagerDetails');
        if (!detailsContainer) return;
        
        const statusEmoji = ticket.status === 'open' ? '🔴' : ticket.status === 'in_progress' ? '🟡' : '✅';
        const priorityText = ['', 'Low', 'Medium', 'High', 'Critical'][ticket.priority || 2];
        
        // Build complete HTML string first (avoid innerHTML += which destroys event listeners)
        const html = `
            <div class="ticket-details-header">
                <div class="ticket-details-title-row">
                    <span class="ticket-details-status">${statusEmoji}</span>
                    <h3>#${ticket.id}: ${this.escapeHtml(ticket.title)}</h3>
                </div>
                <div class="ticket-details-actions">
                    <select class="ticket-status-select" data-ticket-id="${ticket.id}" data-action="change-status" onchange="window.terminal && window.terminal.handleStatusChangeInManager(this)">
                        <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                        <option value="backlog" ${ticket.status === 'backlog' ? 'selected' : ''}>Backlog</option>
                        <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                    ${ticket.status === 'open' || ticket.status === 'backlog' ? `<button class="ticket-action-btn" data-action="edit" data-ticket-id="${ticket.id}">Edit</button>` : ''}
                    ${ticket.status === 'in_progress' || ticket.status === 'resolved' ? `<button class="ticket-action-btn" data-action="add-context" data-ticket-id="${ticket.id}">Add Context</button>` : ''}
                    ${ticket.status !== 'deleted' ? `<button class="ticket-action-btn ticket-action-delete" data-action="delete" data-ticket-id="${ticket.id}">Delete</button>` : ''}
                </div>
            </div>
            <div class="ticket-details-body">
                <div class="ticket-details-section">
                    <div class="ticket-detail-row">
                        <strong>Status:</strong> <span class="ticket-status-badge ticket-status-${ticket.status}">${ticket.status}</span>
                    </div>
                    <div class="ticket-detail-row">
                        <strong>Priority:</strong> <span class="ticket-priority-badge ticket-priority-${ticket.priority || 2}">${priorityText}</span>
                    </div>
                    <div class="ticket-detail-row">
                        <strong>Type:</strong> ${ticket.ticket_type || 'debug'}
                    </div>
                    <div class="ticket-detail-row">
                        <strong>Created:</strong> ${new Date(ticket.created_at).toLocaleString()}
                    </div>
                    ${ticket.created_by ? `<div class="ticket-detail-row"><strong>Created by:</strong> ${this.escapeHtml(ticket.created_by)}</div>` : ''}
                    ${ticket.player_name ? `<div class="ticket-detail-row"><strong>Player:</strong> ${this.escapeHtml(ticket.player_name)}</div>` : ''}
                </div>
                ${ticket.description ? `
                    <div class="ticket-details-section">
                        <strong>Description:</strong>
                        <div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.description)}</div>
                    </div>
                ` : ''}
                ${ticket.repro_steps ? `
                    <div class="ticket-details-section">
                        <strong>Reproduction Steps:</strong>
                        <div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.repro_steps)}</div>
                    </div>
                ` : ''}
                ${ticket.resolution_notes ? `
                    <div class="ticket-details-section">
                        <strong>Resolution Notes & Context:</strong>
                        <div class="ticket-detail-text">${this.renderTicketTextWithImages(ticket.resolution_notes)}</div>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Set innerHTML once
        detailsContainer.innerHTML = html;
        
        // Status change is now handled by inline onchange handler in the HTML
        // No need to attach event listeners here - the inline handler calls handleStatusChangeInManager
        
        // Setup action button handlers AFTER setting innerHTML
        // Clone buttons to remove old listeners (same pattern as TicketsWidget)
        detailsContainer.querySelectorAll('[data-action]').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const ticketId = parseInt(e.target.dataset.ticketId);
                if (action === 'start-work') {
                    this.updateTicketStatusInManager(ticketId, 'in_progress');
                } else if (action === 'resolve') {
                    this.updateTicketStatusInManager(ticketId, 'resolved');
                } else if (action === 'reopen') {
                    this.updateTicketStatusInManager(ticketId, 'open');
                } else if (action === 'edit') {
                    this.editTicketInManager(ticketId);
                } else if (action === 'add-context') {
                    this.showAddContextForm(ticketId);
                } else if (action === 'delete') {
                    this.showDeleteTicketDialogInManager(ticketId);
                }
            });
        });
    }
    
    /**
     * Show create ticket form
     */
    showCreateTicketForm(manager) {
        // Use the same dialog opening method
        this.openZorkTicketDialog();
    }
    
    /**
     * Handle status change from dropdown (inline handler)
     */
    handleStatusChangeInManager(selectElement) {
        const ticketId = parseInt(selectElement.dataset.ticketId);
        const newStatus = selectElement.value;
        
        // Update local ticket data immediately (optimistic update)
        const ticket = this.allTickets.find(t => t.id === ticketId);
        if (ticket) {
            ticket.status = newStatus;
            ticket.updated_at = new Date().toISOString();
        } else {
            console.error(`[Terminal] Ticket #${ticketId} not found in local tickets array`);
        }
        
        // Update displayed status badge immediately
        const detailsContainer = this.ticketManager.querySelector('#ticketManagerDetails');
        if (detailsContainer) {
            const statusBadge = detailsContainer.querySelector('.ticket-status-badge');
            if (statusBadge) {
                statusBadge.textContent = newStatus;
                statusBadge.className = `ticket-status-badge ticket-status-${newStatus}`;
            }
            
            // Update status emoji in header
            const statusEmoji = newStatus === 'open' ? '🔴' : newStatus === 'in_progress' ? '🟡' : newStatus === 'resolved' ? '✅' : '⚪';
            const statusEmojiEl = detailsContainer.querySelector('.ticket-details-status');
            if (statusEmojiEl) {
                statusEmojiEl.textContent = statusEmoji;
            }
        }
        
        // Save to server immediately
        this.updateTicketStatusInManager(ticketId, newStatus);
    }
    
    /**
     * Update ticket status
     */
    updateTicketStatusInManager(ticketId, status) {
        const ticket = this.allTickets.find(t => t.id === ticketId);
        if (!ticket) {
            console.error('[Terminal] Ticket not found:', ticketId);
            return;
        }
        
        if (status === 'resolved') {
            // Use bespoke dialog for resolution notes
            const dialog = this.createBespokeDialog('Resolve Ticket', 'Add resolution notes (optional):', (notes) => {
                this.updateTicketStatusInManagerWithNotes(ticketId, status, notes);
            });
            if (dialog) {
                dialog.classList.remove('hidden');
            }
            return;
        } else if (status === 'open' && ticket.status === 'resolved') {
            // Reopening a resolved ticket - allow notes for regression tracking
            const dialog = this.createBespokeDialog('Reopen Ticket', 'Reopen as regression bug? Add notes (optional):', (notes) => {
                const reopenNotes = 'Reopened as regression bug' + (notes ? '\n\n' + notes : '');
                this.updateTicketStatusInManagerWithNotes(ticketId, status, reopenNotes);
            });
            if (dialog) {
                dialog.classList.remove('hidden');
            }
            return;
        }
        
        // For other status changes (e.g., start-work), update directly
        this.updateTicketStatusInManagerWithNotes(ticketId, status, null);
    }
    
    /**
     * Update ticket status with notes
     */
    updateTicketStatusInManagerWithNotes(ticketId, status, resolutionNotes) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[Terminal] Not connected to server');
            this.game.messageBus.emit('terminal:error', { message: 'Not connected to server. Cannot update ticket.' });
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'updateTicket',
            ticketId: ticketId,
            status: status,
            resolutionNotes: resolutionNotes
        }));
        
        // Reload tickets after update
        setTimeout(() => this.loadTicketsForManager(), 500);
    }
    
    /**
     * Edit ticket (only for open/backlog tickets)
     */
    editTicketInManager(ticketId) {
        const ticket = this.allTickets.find(t => t.id === ticketId);
        if (!ticket) {
            console.error('[Terminal] Ticket not found:', ticketId);
            return;
        }
        
        // Only allow editing open/backlog tickets
        if (ticket.status !== 'open' && ticket.status !== 'backlog') {
            console.warn('[Terminal] Cannot edit ticket that is not open or backlog');
            return;
        }
        
        this.showEditTicketDialogInManager(ticket);
    }
    
    /**
     * Show edit ticket dialog
     */
    showEditTicketDialogInManager(ticket) {
        // Create or get edit dialog
        let dialog = document.getElementById('editTicketDialogManager');
        if (!dialog) {
            dialog = this.createEditTicketDialogManager();
        }
        
        // Populate form with current ticket data
        const titleInput = dialog.querySelector('#editTicketTitleManager');
        const descriptionInput = dialog.querySelector('#editTicketDescriptionManager');
        const prioritySelect = dialog.querySelector('#editTicketPriorityManager');
        const typeSelect = dialog.querySelector('#editTicketTypeManager');
        const errorDiv = dialog.querySelector('#editTicketErrorManager');
        
        if (titleInput) titleInput.value = ticket.title || '';
        if (descriptionInput) descriptionInput.value = ticket.description || '';
        if (prioritySelect) prioritySelect.value = ticket.priority || 2;
        if (typeSelect) typeSelect.value = ticket.ticket_type || 'bug';
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.add('hidden');
        }
        
        // Store ticket ID on dialog
        dialog._ticketId = ticket.id;
        
        // Setup handlers
        this.setupEditTicketDialogHandlersManager();
        
        // Show dialog
        dialog.classList.remove('hidden');
        
        // Focus title input
        setTimeout(() => {
            if (titleInput) titleInput.focus();
        }, 100);
    }
    
    createEditTicketDialogManager() {
        const overlay = document.createElement('div');
        overlay.id = 'editTicketDialogManager';
        overlay.className = 'zork-ticket-dialog-overlay hidden';
        overlay.innerHTML = `
            <div class="zork-ticket-dialog">
                <div class="zork-ticket-dialog-header">
                    <h3>Edit Ticket</h3>
                    <button id="closeEditTicketDialogManager" class="zork-ticket-dialog-close">×</button>
                </div>
                <div class="zork-ticket-dialog-content">
                    <label for="editTicketTitleManager">Title:</label>
                    <input type="text" id="editTicketTitleManager" class="zork-ticket-input" placeholder="Ticket title" maxlength="200">
                    
                    <label for="editTicketDescriptionManager">Description:</label>
                    <textarea id="editTicketDescriptionManager" class="zork-ticket-textarea" placeholder="Ticket description" rows="8"></textarea>
                    
                    <div style="display: flex; gap: 16px; margin-top: 12px;">
                        <div style="flex: 1;">
                            <label for="editTicketPriorityManager">Priority:</label>
                            <select id="editTicketPriorityManager" class="zork-ticket-input">
                                <option value="1">Low</option>
                                <option value="2" selected>Medium</option>
                                <option value="3">High</option>
                                <option value="4">Critical</option>
                            </select>
                        </div>
                        <div style="flex: 1;">
                            <label for="editTicketTypeManager">Type:</label>
                            <select id="editTicketTypeManager" class="zork-ticket-input">
                                <option value="bug" selected>Bug</option>
                                <option value="feature">Feature</option>
                                <option value="debug">Debug</option>
                            </select>
                        </div>
                    </div>
                    <div id="editTicketErrorManager" class="zork-ticket-error hidden"></div>
                </div>
                <div class="zork-ticket-dialog-buttons">
                    <button id="editTicketSubmitManager" class="zork-ticket-btn zork-ticket-btn-primary">Save Changes</button>
                    <button id="editTicketCancelManager" class="zork-ticket-btn zork-ticket-btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }
    
    setupEditTicketDialogHandlersManager() {
        const dialog = document.getElementById('editTicketDialogManager');
        const submitBtn = document.getElementById('editTicketSubmitManager');
        const cancelBtn = document.getElementById('editTicketCancelManager');
        const closeBtn = document.getElementById('closeEditTicketDialogManager');
        const errorDiv = document.getElementById('editTicketErrorManager');
        const titleInput = document.getElementById('editTicketTitleManager');
        const descriptionInput = document.getElementById('editTicketDescriptionManager');
        
        if (!dialog || !submitBtn || !cancelBtn || !closeBtn) {
            console.error('[Terminal] Edit ticket dialog elements not found');
            return;
        }
        
        // Remove old handlers if they exist
        if (dialog._handlersSetup) {
            return; // Already setup
        }
        
        const closeDialog = () => {
            dialog.classList.add('hidden');
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.classList.add('hidden');
            }
        };
        
        const handleSubmit = () => {
            const ticketId = dialog._ticketId;
            if (!ticketId) {
                console.error('[Terminal] No ticket ID on edit dialog');
                return;
            }
            
            const title = titleInput ? titleInput.value.trim() : '';
            const description = descriptionInput ? descriptionInput.value.trim() : '';
            const priority = parseInt(document.getElementById('editTicketPriorityManager')?.value || '2', 10);
            const ticketType = document.getElementById('editTicketTypeManager')?.value || 'bug';
            
            if (!title) {
                if (errorDiv) {
                    errorDiv.textContent = 'Title is required.';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }
            
            this.updateTicketInManager(ticketId, { title, description, priority, ticketType });
            closeDialog();
        };
        
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', closeDialog);
        closeBtn.addEventListener('click', closeDialog);
        
        // Close on overlay click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
        
        // Submit on Enter in title (but not in description)
        if (titleInput) {
            titleInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    descriptionInput?.focus();
                }
            });
        }
        
        dialog._handlersSetup = true;
    }
    
    /**
     * Update ticket fields (title, description, priority, ticketType)
     */
    updateTicketInManager(ticketId, data) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[Terminal] Not connected to server');
            this.game.messageBus.emit('terminal:error', { message: 'Not connected to server. Cannot update ticket.' });
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'updateTicket',
            ticketId: ticketId,
            title: data.title,
            description: data.description,
            priority: data.priority,
            ticketType: data.ticketType
        }));
        
        // Reload tickets after update
        setTimeout(() => {
            this.loadTicketsForManager();
            // Re-select the ticket if it was selected
            const selectedTicket = this.ticketManager.querySelector('.ticket-item.selected');
            if (selectedTicket) {
                const selectedId = parseInt(selectedTicket.dataset.ticketId);
                if (selectedId === ticketId) {
                    this.selectTicketInManager(ticketId);
                }
            }
        }, 500);
    }
    
    /**
     * Show add context form
     */
    showAddContextForm(ticketId) {
        const dialog = this.createBespokeDialog('Add Context', 'Add context, notes, or feedback:', (context) => {
            if (context && context.trim()) {
                this.addContextToTicket(ticketId, context.trim());
            }
        });
        if (dialog) {
            dialog.classList.remove('hidden');
        } else {
            console.error('[Terminal] Failed to create dialog');
        }
    }
    
    /**
     * Add context to ticket
     */
    addContextToTicket(ticketId, context) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[Terminal] Not connected to server');
            this.game.messageBus.emit('terminal:error', { message: 'Not connected to server. Cannot add context.' });
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'addTicketFeedback',
            ticketId: ticketId,
            feedback: context
        }));
        
        // Show feedback
        this.game.messageBus.emit('terminal:message', { 
            message: `Context added to ticket #${ticketId}.`, 
            type: 'info' 
        });
        
        // Reload tickets after update
        setTimeout(() => this.loadTicketsForManager(), 500);
    }
    
    /**
     * Show delete ticket confirmation dialog in manager
     */
    showDeleteTicketDialogInManager(ticketId) {
        const dialog = this.createBespokeDialog('Delete Ticket', 'Are you sure you want to delete this ticket? It will be marked as deleted and Cursor will ignore it. Type "DELETE" to confirm:', (confirmation) => {
            if (confirmation && confirmation.trim().toUpperCase() === 'DELETE') {
                this.updateTicketStatusInManager(ticketId, 'deleted');
                // Reload tickets after delete
                setTimeout(() => {
                    this.loadTicketsForManager();
                }, 500);
            } else {
                // Show error if confirmation doesn't match
                const errorDiv = dialog.querySelector('#ticketActionError');
                if (errorDiv) {
                    errorDiv.textContent = 'Confirmation text does not match. Ticket not deleted.';
                    errorDiv.classList.remove('hidden');
                }
            }
        });
        if (dialog) {
            dialog.classList.remove('hidden');
        } else {
            console.error('[Terminal] Failed to create delete dialog');
        }
    }
    
    /**
     * Open bespoke ticket creation dialog (no system popups)
     * @deprecated - Use ticket manager instead
     */
    openZorkTicketDialog() {
        const dialog = document.getElementById('zorkTicketDialog');
        const titleInput = document.getElementById('zorkTicketTitle');
        const descriptionInput = document.getElementById('zorkTicketDescription');
        const errorDiv = document.getElementById('zorkTicketError');
        
        if (!dialog || !titleInput || !descriptionInput) {
            console.error('[Terminal] ZORK ticket dialog elements not found');
            return;
        }
        
        // Get current command input value as default
        const currentInput = this.commandInput ? this.commandInput.value.trim() : '';
        
        // Pre-fill inputs
        titleInput.value = currentInput || '';
        descriptionInput.value = currentInput || '';
        errorDiv.textContent = '';
        errorDiv.classList.add('hidden');
        
        // Reset priority and type to defaults
        const ticketTypeSelect = document.getElementById('zorkTicketType');
        const prioritySelect = document.getElementById('zorkTicketPriority');
        if (ticketTypeSelect) ticketTypeSelect.value = 'bug';
        if (prioritySelect) prioritySelect.value = '2';
        
        // Show dialog
        dialog.classList.remove('hidden');
        
        // Ensure z-index is correct (should be 5000 from CSS, but verify)
        const computedZIndex = window.getComputedStyle(dialog).zIndex;
        if (parseInt(computedZIndex) < 4000) {
            dialog.style.zIndex = '5000';
        }
        
        // Setup drag and resize functionality
        this.setupZorkTicketDialogDragResize();
        
        // Focus title input
        setTimeout(() => {
            titleInput.focus();
            titleInput.select();
        }, 100);
        
        // Setup submit handler (always, to ensure it's ready)
        this.setupZorkTicketDialogHandlers();
    }
    
    /**
     * Setup drag and resize for ZORK ticket dialog
     */
    setupZorkTicketDialogDragResize() {
        const dialog = document.getElementById('zorkTicketDialog');
        if (!dialog) return;
        
        const dialogContent = dialog.querySelector('.zork-ticket-dialog');
        if (!dialogContent) return;
        
        // If already set up, skip
        if (dialogContent._dragResizeSetup) {
            return;
        }
        
        // Make dialog draggable
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        const startDrag = (e) => {
            // Only drag from header area, not from buttons/inputs
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('textarea')) {
                return;
            }
            const headerEl = dialogContent.querySelector('.zork-ticket-dialog-header');
            if (!headerEl || !headerEl.contains(e.target)) {
                return;
            }
            isDragging = true;
            const rect = dialogContent.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            dialogContent.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation();
        };
        
        const drag = (e) => {
            if (!isDragging) return;
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;
            
            // Keep dialog within viewport
            const maxX = window.innerWidth - dialogContent.offsetWidth;
            const maxY = window.innerHeight - dialogContent.offsetHeight;
            
            dialogContent.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            dialogContent.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
            dialogContent.style.transform = 'none';
        };
        
        const stopDrag = () => {
            if (isDragging) {
                isDragging = false;
                dialogContent.style.cursor = '';
            }
        };
        
        // Make resizable
        let isResizing = false;
        let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
        
        // Create resize handle
        let resizeHandle = dialogContent.querySelector('.zork-ticket-resize-handle');
        if (!resizeHandle) {
            resizeHandle = document.createElement('div');
            resizeHandle.className = 'zork-ticket-resize-handle';
            resizeHandle.style.cssText = 'position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 1000; background: linear-gradient(135deg, transparent 0%, transparent 40%, #00ff00 40%, #00ff00 60%, transparent 60%, transparent 100%); pointer-events: auto;';
            dialogContent.appendChild(resizeHandle);
        }
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            const rect = dialogContent.getBoundingClientRect();
            resizeStart.x = e.clientX;
            resizeStart.y = e.clientY;
            resizeStart.width = rect.width;
            resizeStart.height = rect.height;
            e.preventDefault();
            e.stopPropagation();
        });
        
        const doResize = (e) => {
            if (!isResizing) return;
            const deltaX = e.clientX - resizeStart.x;
            const deltaY = e.clientY - resizeStart.y;
            
            const newWidth = Math.max(400, Math.min(resizeStart.width + deltaX, window.innerWidth - 20));
            const newHeight = Math.max(300, Math.min(resizeStart.height + deltaY, window.innerHeight - 20));
            
            dialogContent.style.width = newWidth + 'px';
            dialogContent.style.height = newHeight + 'px';
        };
        
        const stopResize = () => {
            isResizing = false;
        };
        
        // Setup drag on header
        const headerEl = dialogContent.querySelector('.zork-ticket-dialog-header');
        if (headerEl) {
            if (headerEl._dragHandler) {
                headerEl.removeEventListener('mousedown', headerEl._dragHandler);
            }
            headerEl._dragHandler = startDrag;
            headerEl.addEventListener('mousedown', startDrag);
        }
        
        // Setup document-level listeners
        const mouseMoveHandler = (e) => {
            drag(e);
            doResize(e);
        };
        
        const mouseUpHandler = () => {
            stopDrag();
            stopResize();
        };
        
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        
        // Mark as set up
        dialogContent._dragResizeSetup = true;
        
        // Store cleanup
        dialogContent._cleanupDragResize = () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            if (headerEl && headerEl._dragHandler) {
                headerEl.removeEventListener('mousedown', headerEl._dragHandler);
            }
        };
    }
    
    /**
     * Setup handlers for ZORK ticket dialog
     */
    setupZorkTicketDialogHandlers() {
        const dialog = document.getElementById('zorkTicketDialog');
        if (!dialog) {
            console.error('[Terminal] zorkTicketDialog not found');
            return;
        }
        
        // If handlers are already set up, don't set them up again
        if (this.zorkTicketSubmitHandler && dialog._handlersSetup) {
            return;
        }
        
        const titleInput = document.getElementById('zorkTicketTitle');
        const descriptionInput = document.getElementById('zorkTicketDescription');
        const errorDiv = document.getElementById('zorkTicketError');
        
        if (!titleInput || !descriptionInput || !errorDiv) {
            console.error('[Terminal] ZORK ticket dialog elements not found:', {
                titleInput: !!titleInput,
                descriptionInput: !!descriptionInput,
                errorDiv: !!errorDiv
            });
            return;
        }
        
        const closeDialog = () => {
            dialog.classList.add('hidden');
            errorDiv.classList.add('hidden');
        };
        
        // Track if submission is in progress to prevent duplicates
        let isSubmitting = false;
        
        const submitTicket = () => {
            // Prevent duplicate submissions
            if (isSubmitting) {
                console.log('[Terminal] Ticket submission already in progress, ignoring duplicate call');
                return;
            }
            
            const title = titleInput.value.trim();
            const description = descriptionInput.value.trim();
            const ticketTypeSelect = document.getElementById('zorkTicketType');
            const prioritySelect = document.getElementById('zorkTicketPriority');
            const ticketType = ticketTypeSelect ? ticketTypeSelect.value : 'bug';
            const priority = prioritySelect ? parseInt(prioritySelect.value) : 2;
            
            console.log('[Terminal] Submit ticket clicked, title:', title.substring(0, 30), 'type:', ticketType, 'priority:', priority);
            
            // Validate
            if (!title) {
                errorDiv.textContent = 'Ticket title is required';
                errorDiv.classList.remove('hidden');
                titleInput.focus();
                return;
            }
            
            // Mark as submitting
            isSubmitting = true;
            
            // Hide error
            errorDiv.classList.add('hidden');
            
            // Create ticket via WebSocket
            const ws = this.game.getWebSocket();
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Show immediate feedback
                this.showTicketCreationFeedback('Creating ticket...', 'info');
                
                // Close dialog
                closeDialog();
                
                console.log('[Terminal] Sending createZorkTicket:', { title, description });
                
                ws.send(JSON.stringify({
                    type: 'createZorkTicket',
                    title: title,
                    description: description,
                    priority: priority,
                    ticketType: ticketType,
                    fromZork: false // User-created, not from ZORK AI
                }));
                
                console.log('[Terminal] ZORK ticket creation request sent');
                
                // Clear command input if it was used
                if (this.commandInput && this.commandInput.value.trim()) {
                    this.commandInput.value = '';
                }
                
                // Reset submitting flag after a delay (in case of error, allow retry)
                setTimeout(() => {
                    isSubmitting = false;
                }, 2000);
            } else {
                console.error('[Terminal] WebSocket not connected');
                errorDiv.textContent = 'Not connected to server. Cannot create ticket.';
                errorDiv.classList.remove('hidden');
                isSubmitting = false; // Reset on error
            }
        };
        
        // Remove old event listeners if they exist
        if (dialog._clickHandler) {
            dialog.removeEventListener('click', dialog._clickHandler, true);
            console.log('[Terminal] Removed old ZORK dialog click handler');
        }
        
        if (dialog._escapeHandler) {
            document.removeEventListener('keydown', dialog._escapeHandler);
            console.log('[Terminal] Removed old escape handler');
        }
        
        // Remove old direct button handlers by cloning and replacing
        const submitBtn = dialog.querySelector('#zorkTicketSubmit');
        const cancelBtn = dialog.querySelector('#zorkTicketCancel');
        const closeBtn = dialog.querySelector('#closeZorkTicketDialog');
        
        if (submitBtn) {
            const newSubmitBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        }
        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        }
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        }
        
        // Get fresh references after cloning
        const newSubmitBtn = dialog.querySelector('#zorkTicketSubmit');
        const newCancelBtn = dialog.querySelector('#zorkTicketCancel');
        const newCloseBtn = dialog.querySelector('#closeZorkTicketDialog');
        
        // Create new click handler with better logging
        dialog._clickHandler = (e) => {
            console.log('[Terminal] ZORK dialog click detected:', {
                target: e.target.tagName,
                targetId: e.target.id,
                targetClass: e.target.className,
                currentTarget: e.currentTarget.id
            });
            
            // Find the actual button element (might be clicked on child element)
            let button = e.target;
            let clickedButton = null;
            let iterations = 0;
            const maxIterations = 10; // Safety limit
            
            while (button && button !== dialog && iterations < maxIterations) {
                iterations++;
                const buttonId = button.id;
                const buttonClass = button.className || '';
                
                console.log('[Terminal] Checking element:', { buttonId, buttonClass, tagName: button.tagName, iteration: iterations });
                
                // Check if this is the submit button
                if (buttonId === 'zorkTicketSubmit' || (button.classList.contains('zork-ticket-btn-primary') && button.tagName === 'BUTTON')) {
                    clickedButton = 'submit';
                    console.log('[Terminal] Found submit button');
                    break;
                }
                
                // Check if this is the cancel button
                if (buttonId === 'zorkTicketCancel' || (button.classList.contains('zork-ticket-btn') && !button.classList.contains('zork-ticket-btn-primary') && button.tagName === 'BUTTON' && buttonId !== 'zorkTicketSubmit')) {
                    clickedButton = 'cancel';
                    console.log('[Terminal] Found cancel button');
                    break;
                }
                
                // Check if this is the close button
                if (buttonId === 'closeZorkTicketDialog' || (button.classList.contains('zork-ticket-dialog-close') && button.tagName === 'BUTTON')) {
                    clickedButton = 'close';
                    console.log('[Terminal] Found close button');
                    break;
                }
                
                // Move up the DOM tree
                button = button.parentElement;
            }
            
            if (clickedButton) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Terminal] ZORK dialog button clicked:', clickedButton);
                
                if (clickedButton === 'submit') {
                    submitTicket();
                } else {
                    closeDialog();
                }
                return false;
            }
            
            // Close on overlay click
            if (e.target === dialog) {
                console.log('[Terminal] Overlay clicked, closing dialog');
                closeDialog();
                return false;
            }
        };
        
        // Use capture phase to catch events early
        dialog.addEventListener('click', dialog._clickHandler, true);
        console.log('[Terminal] ZORK ticket dialog click handler attached (capture phase)');
        
        // Also try direct button handlers as backup (using new cloned buttons)
        if (newSubmitBtn) {
            newSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Terminal] Submit button direct click handler');
                submitTicket();
            }, true);
        }
        
        if (newCancelBtn) {
            newCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Terminal] Cancel button direct click handler');
                closeDialog();
            }, true);
        }
        
        if (newCloseBtn) {
            newCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Terminal] Close button direct click handler');
                closeDialog();
            }, true);
        }
        
        // Remove old keyboard handlers if they exist
        if (titleInput._keydownHandler) {
            titleInput.removeEventListener('keydown', titleInput._keydownHandler);
        }
        if (descriptionInput._keydownHandler) {
            descriptionInput.removeEventListener('keydown', descriptionInput._keydownHandler);
        }
        if (descriptionInput._pasteHandler) {
            descriptionInput.removeEventListener('paste', descriptionInput._pasteHandler);
        }
        
        // Submit on Enter in title, Ctrl+Enter in description
        if (titleInput) {
            titleInput._keydownHandler = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('[Terminal] Enter pressed in title, submitting');
                    submitTicket();
                }
            };
            titleInput.addEventListener('keydown', titleInput._keydownHandler);
        }
        
        if (descriptionInput) {
            descriptionInput._keydownHandler = (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    console.log('[Terminal] Ctrl+Enter pressed in description, submitting');
                    submitTicket();
                }
            };
            descriptionInput.addEventListener('keydown', descriptionInput._keydownHandler);
            
            // Handle image paste (screenshots)
            descriptionInput._pasteHandler = async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                
                // Look for image in clipboard
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type.indexOf('image') !== -1) {
                        e.preventDefault();
                        console.log('[Terminal] Image detected in clipboard, processing...');
                        
                        const file = item.getAsFile();
                        if (!file) continue;
                        
                        // Convert to base64
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const base64Image = event.target.result;
                            const imageSizeKB = Math.round(base64Image.length / 1024);
                            
                            console.log('[Terminal] Image converted to base64, size:', imageSizeKB, 'KB');
                            
                            // Check size limit (5MB base64 = ~3.75MB actual)
                            if (imageSizeKB > 5120) {
                                errorDiv.textContent = `Image too large (${imageSizeKB}KB). Maximum size is 5MB.`;
                                errorDiv.classList.remove('hidden');
                                return;
                            }
                            
                            // Insert image markdown at cursor position
                            const cursorPos = descriptionInput.selectionStart;
                            const textBefore = descriptionInput.value.substring(0, cursorPos);
                            const textAfter = descriptionInput.value.substring(cursorPos);
                            
                            // Insert image as markdown-style embed
                            const imageMarkdown = `\n\n![Screenshot](${base64Image})\n\n`;
                            descriptionInput.value = textBefore + imageMarkdown + textAfter;
                            
                            // Move cursor after inserted image
                            const newCursorPos = cursorPos + imageMarkdown.length;
                            descriptionInput.setSelectionRange(newCursorPos, newCursorPos);
                            
                            // Show success message
                            const successMsg = document.createElement('div');
                            successMsg.className = 'ticket-image-success';
                            successMsg.textContent = `✓ Screenshot pasted (${imageSizeKB}KB)`;
                            successMsg.style.cssText = 'color: #00ff00; font-size: 11px; margin-top: 5px;';
                            
                            // Remove any existing success message
                            const existing = descriptionInput.parentElement.querySelector('.ticket-image-success');
                            if (existing) existing.remove();
                            
                            descriptionInput.parentElement.appendChild(successMsg);
                            
                            // Remove success message after 3 seconds
                            setTimeout(() => {
                                if (successMsg.parentElement) {
                                    successMsg.remove();
                                }
                            }, 3000);
                            
                            descriptionInput.focus();
                        };
                        
                        reader.onerror = () => {
                            console.error('[Terminal] Error reading image file');
                            errorDiv.textContent = 'Error processing image. Please try again.';
                            errorDiv.classList.remove('hidden');
                        };
                        
                        reader.readAsDataURL(file);
                        break;
                    }
                }
            };
            descriptionInput.addEventListener('paste', descriptionInput._pasteHandler);
        }
        
        // Escape to close
        dialog._escapeHandler = (e) => {
            if (e.key === 'Escape' && !dialog.classList.contains('hidden')) {
                console.log('[Terminal] Escape pressed, closing ZORK ticket dialog');
                closeDialog();
            }
        };
        document.addEventListener('keydown', dialog._escapeHandler);
        
        // Mark as set up
        this.zorkTicketSubmitHandler = true;
        dialog._handlersSetup = true;
        console.log('[Terminal] ZORK ticket dialog handlers setup complete');
    }
    
    /**
     * Show ticket creation feedback directly in terminal (bespoke, not system message)
     */
    showTicketCreationFeedback(message, type = 'info') {
        if (!this.terminalContent) return;
        
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = type === 'error' ? 'ticket-feedback-error' : 'ticket-feedback-info';
        feedbackDiv.innerHTML = `<span class="ticket-feedback-icon">${type === 'error' ? '❌' : '📝'}</span> <span class="ticket-feedback-text">${this.escapeHtml(message)}</span>`;
        
        this.terminalContent.appendChild(feedbackDiv);
        this.scrollToBottom();
        
        // Auto-remove after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                if (feedbackDiv.parentNode) {
                    feedbackDiv.style.opacity = '0';
                    feedbackDiv.style.transition = 'opacity 0.5s';
                    setTimeout(() => {
                        if (feedbackDiv.parentNode) {
                            feedbackDiv.parentNode.removeChild(feedbackDiv);
                        }
                    }, 500);
                }
            }, 5000);
        }
    }
    
    /**
     * Handle ZORK ticket created response
     */
    handleZorkTicketCreated(data) {
        const { ticketId, message } = data;
        // Use bespoke feedback system instead of system messages
        const feedbackMessage = message || `Ticket #${ticketId} created successfully. ZORK will review it shortly.`;
        this.showTicketCreationFeedback(feedbackMessage, 'info');
    }
    
    /**
     * Handle error responses from ticket creation
     */
    handleTicketError(data) {
        if (data.type === 'error' && data.message) {
            // Check if this is a ticket-related error
            if (data.message.includes('ticket') || data.message.includes('Ticket')) {
                const dialog = document.getElementById('zorkTicketDialog');
                const errorDiv = document.getElementById('zorkTicketError');
                if (dialog && errorDiv && !dialog.classList.contains('hidden')) {
                    // Show error in dialog if it's open
                    errorDiv.textContent = data.message;
                    errorDiv.classList.remove('hidden');
                } else {
                    // Show error in terminal
                    this.showTicketCreationFeedback(data.message, 'error');
                }
            }
        }
    }
    
    // ========================================================================
    // Voice Input System
    // ========================================================================
    
    /**
     * Initialize voice input using Web Speech API
     */
    initVoiceInput() {
        if (!this.micBtn) {
            console.warn('[Terminal] Microphone button not found');
            return;
        }
        
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[Terminal] Web Speech API not supported in this browser');
            this.micBtn.disabled = true;
            this.micBtn.title = 'Voice input not supported in this browser';
            return;
        }
        
        // Initialize recognition
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true; // Keep recording until manually stopped
        this.recognition.interimResults = true; // Show interim results while speaking
        this.recognition.lang = 'en-US'; // Default to English
        
        // Track accumulated transcript and processed result indices
        this.accumulatedTranscript = '';
        this.lastProcessedResultIndex = -1; // Track last processed result index to prevent reprocessing
        
        // Handle recognition results
        this.recognition.onresult = (event) => {
            // Always accumulate results, but only update UI if user isn't actively typing
            const shouldUpdateUI = !this.userIsTyping && (Date.now() - this.lastManualInputTime >= 300);
            
            // Get all results (interim and final)
            let interimTranscript = '';
            let finalTranscript = '';
            
            // Only process NEW results (those after lastProcessedResultIndex)
            // This prevents reprocessing the same results multiple times
            const startIndex = Math.max(event.resultIndex, this.lastProcessedResultIndex + 1);
            
            for (let i = startIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                
                if (result.isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Update last processed index
            if (event.results.length > 0) {
                this.lastProcessedResultIndex = event.results.length - 1;
            }
            
            // ALWAYS update accumulated transcript with final results (even if user was typing)
            // This ensures we capture all speech for display when recording stops
            // Simplified logic to be less restrictive and capture more speech
            if (finalTranscript) {
                const newContent = finalTranscript.trim();
                if (newContent) {
                    // Always add new final content unless it's exactly the same as what we already have at the end
                    // This is less restrictive to ensure we capture all speech, especially on successive uses
                    const accumulatedTrimmed = this.accumulatedTranscript.trim();
                    if (!accumulatedTrimmed) {
                        // Empty - just add it
                        this.accumulatedTranscript = newContent;
                        console.log('[Terminal] Voice recognition first result:', newContent);
                    } else if (!accumulatedTrimmed.endsWith(newContent)) {
                        // Not at the end - add it (might be continuation or new phrase)
                        this.accumulatedTranscript += ' ' + newContent;
                        console.log('[Terminal] Voice recognition result added:', newContent);
                        console.log('[Terminal] Total accumulated:', this.accumulatedTranscript);
                    } else {
                        // Already ends with this content - might be duplicate, but log it
                        console.log('[Terminal] Voice recognition result already at end (possible duplicate):', newContent);
                    }
                }
            }
            
            // Log interim results for debugging successive use issues
            if (interimTranscript) {
                console.log('[Terminal] Voice recognition interim:', interimTranscript);
            }
            
            // Update input field only if user isn't actively typing (to avoid interference)
            if (shouldUpdateUI && this.commandInput && (finalTranscript || interimTranscript)) {
                const voiceText = this.accumulatedTranscript + (interimTranscript ? ' ' + interimTranscript : '');
                const currentValue = this.commandInput.value;
                
                // Build display text: existing text + space + voice input (additive behavior)
                // Use sessionStartText if available, otherwise use current value
                const baseText = this.sessionStartText || currentValue;
                const displayText = baseText.trim() + (baseText.trim() && voiceText.trim() ? ' ' : '') + voiceText.trim();
                
                // Only update if:
                // 1. Input is empty (fresh start)
                // 2. Input matches our base text + accumulated transcript (voice-only input)
                // 3. User hasn't manually changed the input since we started
                const expectedValue = (this.sessionStartText || '') + (this.accumulatedTranscript ? ' ' + this.accumulatedTranscript : '');
                if (!currentValue || currentValue.trim() === expectedValue.trim() || currentValue === baseText) {
                    // Safe to update - either empty, matches our voice transcript, or matches base text
                    this.commandInput.value = displayText;
                    
                    // Focus the input and move cursor to end
                    this.commandInput.focus();
                    this.commandInput.setSelectionRange(this.commandInput.value.length, this.commandInput.value.length);
                }
            }
        };
        
        // Handle errors
        this.recognition.onerror = (event) => {
            console.error('[Terminal] Speech recognition error:', event.error);
            
            let errorMsg = 'Voice recognition error';
            if (event.error === 'no-speech') {
                // Don't stop on no-speech - user might be thinking
                console.log('[Terminal] No speech detected, continuing to listen...');
                return; // Don't stop recording or show error
            } else if (event.error === 'audio-capture') {
                errorMsg = 'Microphone not found or not accessible.';
                this.messageBus.emit('terminal:error', { message: errorMsg });
                this.stopRecording();
            } else if (event.error === 'not-allowed') {
                errorMsg = 'Microphone permission denied. Please allow microphone access.';
                this.messageBus.emit('terminal:error', { message: errorMsg });
                this.stopRecording();
            } else if (event.error === 'network') {
                errorMsg = 'Network error. Check your connection.';
                this.messageBus.emit('terminal:error', { message: errorMsg });
                this.stopRecording();
            } else {
                // Other errors - log but don't stop (might be temporary)
                console.warn('[Terminal] Speech recognition error (non-fatal):', event.error);
            }
        };
        
        // Handle end of recognition (only stop if manually stopped, not on auto-end)
        this.recognition.onend = () => {
            console.log('[Terminal] Speech recognition ended, isRecording:', this.isRecording);
            // Only restart if we're still in recording state (user didn't manually stop)
            // This prevents auto-restart on temporary disconnections
            if (this.isRecording) {
                // Recognition ended but we want to keep recording - restart it
                // Add a small delay to prevent immediate restart issues
                setTimeout(() => {
                    if (this.isRecording && this.recognition) {
                        try {
                            this.recognition.start();
                            console.log('[Terminal] Restarted recognition after auto-end');
                        } catch (error) {
                            // If restart fails, actually stop
                            if (error.message.includes('already started')) {
                                // Already running, ignore
                                console.log('[Terminal] Recognition already started, ignoring restart');
                            } else {
                                console.error('[Terminal] Failed to restart recognition:', error);
                                this.stopRecording();
                            }
                        }
                    }
                }, 100); // Small delay to prevent restart issues
            } else {
                console.log('[Terminal] Recognition ended, not restarting (user stopped)');
            }
        };
        
        // Setup button click handler
        this.micBtn.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });
    }
    
    /**
     * Start voice recording
     */
    startRecording() {
        if (!this.recognition) {
            this.messageBus.emit('terminal:error', { message: 'Voice input not available in this browser' });
            return;
        }
        
        if (this.isRecording) {
            console.log('[Terminal] Already recording, ignoring start request');
            return; // Already recording
        }
        
        // Save existing text in command input to preserve it (for additive behavior)
        const existingText = this.commandInput ? this.commandInput.value.trim() : '';
        
        // CRITICAL: Fully reset state for new session to ensure clean start
        // This prevents issues with successive captures only picking up first word
        this.accumulatedTranscript = '';
        this.lastProcessedResultIndex = -1;
        this.sessionStartText = existingText; // Store starting text for this session
        this.userIsTyping = false; // Reset typing state
        this.lastManualInputTime = 0; // Reset manual input time
        
        // Ensure recognition is fully stopped before starting new session
        // Use setTimeout to ensure clean state
        try {
            if (this.recognition) {
                try {
                    this.recognition.stop();
                } catch (e) {
                    // Ignore - might already be stopped
                }
            }
        } catch (e) {
            // Ignore errors
        }
        
        // Wait a moment for recognition to fully stop, then start
        setTimeout(() => {
            console.log('[Terminal] Starting new recording session, preserving text:', existingText);
            console.log('[Terminal] Reset state - accumulatedTranscript:', this.accumulatedTranscript, 'lastProcessedResultIndex:', this.lastProcessedResultIndex);
            
            try {
                this.recognition.start();
                this.isRecording = true;
                
                if (this.micBtn) {
                    this.micBtn.classList.add('recording');
                    this.micBtn.title = 'Recording... (click to stop)';
                }
                
                console.log('[Terminal] Voice recording started (continuous mode), sessionStartText:', this.sessionStartText);
                // Use bespoke feedback instead of system message
                this.showTicketCreationFeedback('🎤 Recording... Speak now. Click microphone again to stop.', 'info');
            } catch (error) {
                console.error('[Terminal] Error starting recognition:', error);
                if (error.message.includes('already started')) {
                    // Recognition already running, just update UI
                    console.log('[Terminal] Recognition already started, updating UI only');
                    this.isRecording = true;
                    if (this.micBtn) {
                        this.micBtn.classList.add('recording');
                    }
                } else {
                    this.messageBus.emit('terminal:error', { message: 'Failed to start voice recording: ' + error.message });
                }
            }
        }, 150); // Wait 150ms to ensure clean state
    }
    
    /**
     * Stop voice recording
     */
    stopRecording() {
        if (!this.isRecording) {
            return;
        }
        
        // Mark as not recording first to prevent auto-restart
        this.isRecording = false;
        
        try {
            if (this.recognition) {
                this.recognition.stop();
            }
        } catch (error) {
            // Ignore errors when stopping
            console.log('[Terminal] Error stopping recognition (ignored):', error.message);
        }
        
        if (this.micBtn) {
            this.micBtn.classList.remove('recording');
            this.micBtn.title = 'Voice Input (click to record)';
        }
        
        // Wait a moment for any final results to come in, then get the transcript
        // The recognition.onend will fire after stop(), so we need to wait for final results
        setTimeout(() => {
            // Get the final transcript before clearing
            const finalTranscript = this.accumulatedTranscript.trim();
            
            // Display transcript in terminal if we captured anything
            if (finalTranscript) {
                console.log('[Terminal] Voice transcript:', finalTranscript);
                
                // Add transcript to terminal as a system message
                this.addMessage(`🎤 Voice input: "${finalTranscript}"`, 'info');
                
                // Update command input: existing text + space + voice input (additive)
                if (this.commandInput) {
                    const existingText = this.sessionStartText || this.commandInput.value.trim();
                    const newValue = existingText + (existingText && finalTranscript ? ' ' : '') + finalTranscript;
                    this.commandInput.value = newValue;
                    this.commandInput.focus();
                    this.commandInput.setSelectionRange(this.commandInput.value.length, this.commandInput.value.length);
                }
            } else {
                // No transcript captured - show feedback
                this.showVoiceInputFeedback('info', 'No speech detected. Try speaking closer to the microphone.');
            }
            
            // Clear accumulated transcript and reset typing flags and result tracking
            this.accumulatedTranscript = '';
            this.lastProcessedResultIndex = -1;
            this.userIsTyping = false;
            this.lastManualInputTime = 0;
            this.sessionStartText = null; // Clear session start text
        }, 500); // Wait 500ms for final results to arrive
        
        // Clear accumulated transcript and reset typing flags and result tracking
        this.accumulatedTranscript = '';
        this.lastProcessedResultIndex = -1;
        this.userIsTyping = false;
        this.lastManualInputTime = 0;
        
        console.log('[Terminal] Voice recording stopped');
    }
    
    /**
     * Handle telepath message
     */
    handleTelepath(data) {
        const { fromPlayer, message } = data;
        if (fromPlayer && message) {
            // Parse markup only (no markdown - use markup conventions instead)
            const formattedHtml = parseMarkup(message, '#00ffff');
            
            const msgDiv = document.createElement('div');
            msgDiv.className = 'telepath-message';
            msgDiv.innerHTML = `<span class="telepath-label">[Telepath from</span> <span class="telepath-player">${this.escapeHtml(this.cleanPlayerName(fromPlayer))}</span><span class="telepath-label">]:</span> <span class="telepath-text">${formattedHtml}</span>`;
            this.terminalContent.appendChild(msgDiv);
            this.scrollToBottom();
            this.saveTerminalMessage(`[Telepath from ${this.cleanPlayerName(fromPlayer)}]: ${message}`, 'info', msgDiv.innerHTML);
        }
    }
    
    /**
     * Handle telepath sent message
     */
    handleTelepathSent(data) {
        const { toPlayer, message } = data;
        if (toPlayer && message) {
            this.addMessage(`[Telepath to ${this.cleanPlayerName(toPlayer)}]: ${message}`, 'info', true);
        }
    }
    
    /**
     * Handle merchant list
     */
    handleMerchantList(data) {
        if (!data.items || data.items.length === 0) {
            this.addMessage('The merchant has nothing for sale.', 'info');
            return;
        }
        
        // Create merchant list HTML table
        let html = '<div class="merchant-list"><div class="merchant-title">Merchant Inventory:</div><table class="merchant-table"><thead><tr><th>Item Name</th><th>Qty</th><th>Price</th></tr></thead><tbody>';
        
        data.items.forEach(item => {
            const qtyDisplay = item.unlimited ? '∞' : `${item.current_qty}${item.max_qty ? `/${item.max_qty}` : ''}`;
            const outOfStock = !item.unlimited && item.current_qty === 0;
            const priceText = `${item.price} gold${outOfStock ? ' (out of stock)' : ''}`;
            html += `<tr><td>${this.escapeHtml(item.item_name)}</td><td>${qtyDisplay}</td><td>${priceText}</td></tr>`;
        });
        
        html += '</tbody></table></div>';
        
        // Send to terminal with HTML
        this.addMessage('', 'info', true, html);
    }
    
    /**
     * Handle terminal history
     */
    handleTerminalHistory(data) {
        if (!data.messages || !Array.isArray(data.messages)) return;
        if (!this.terminalContent) return;
        
        // Clear existing content first
        this.terminalContent.innerHTML = '';
        
        // Add separator to indicate history
        const separator = document.createElement('div');
        separator.className = 'terminal-separator';
        separator.textContent = '─'.repeat(40);
        separator.style.color = '#666';
        separator.style.fontStyle = 'italic';
        this.terminalContent.appendChild(separator);
        
        const historyLabel = document.createElement('div');
        historyLabel.className = 'info-message';
        historyLabel.style.color = '#666';
        historyLabel.style.fontStyle = 'italic';
        historyLabel.textContent = 'Previous session history:';
        this.terminalContent.appendChild(historyLabel);
        
        // Add all history messages
        data.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = msg.type === 'error' ? 'error-message' : 'info-message';
            if (msg.html) {
                msgDiv.innerHTML = msg.html;
            } else {
                // CRITICAL: Parse markup even for history messages
                msgDiv.innerHTML = parseMarkup(msg.text || '', '#00ffff');
            }
            this.terminalContent.appendChild(msgDiv);
        });
        
        // Add separator after history
        const separatorAfter = document.createElement('div');
        separatorAfter.className = 'terminal-separator';
        separatorAfter.textContent = '─'.repeat(40);
        separatorAfter.style.color = '#666';
        separatorAfter.style.fontStyle = 'italic';
        this.terminalContent.appendChild(separatorAfter);
        
        this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
    }
    
    /**
     * Start idle look timer
     */
    startIdleLookTimer() {
        if (this.idleLookInterval) {
            clearInterval(this.idleLookInterval);
        }
        
        this.idleLookInterval = setInterval(() => {
            const now = Date.now();
            const idleTime = now - this.lastInteractionTime;
            
            // Only send look if idle for 30s AND we haven't sent one in the last 30s
            if (idleTime >= this.IDLE_LOOK_DELAY && (now - this.lastIdleLookTime) >= this.IDLE_LOOK_DELAY) {
                // Send look command
                const ws = this.game.getWebSocket();
                if (ws && ws.readyState === WebSocket.OPEN) {
                    this.game.send({ type: 'look' });
                    this.lastIdleLookTime = now; // Track when we sent the look
                }
            }
        }, 5000); // Check every 5 seconds
    }
    
    /**
     * Reset idle timer (called on player interaction)
     */
    resetIdleTimer() {
        this.lastInteractionTime = Date.now();
        this.lastIdleLookTime = 0; // Reset idle look tracking on interaction
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    destroy() {
        if (this.idleLookInterval) {
            clearInterval(this.idleLookInterval);
            this.idleLookInterval = null;
        }
        
        // Stop voice recording if active
        this.stopRecording();
        if (this.recognition) {
            this.recognition = null;
        }
        
        super.destroy();
    }
    
    /**
     * Scroll to bottom of terminal (only if not locked)
     */
    scrollToBottom() {
        if (!this.terminalContent) return;
        
        if (!this.scrollLocked) {
            this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
        }
    }
    
    /**
     * Toggle scroll lock state
     */
    toggleScrollLock() {
        this.scrollLocked = !this.scrollLocked;
        
        if (this.scrollLockBtn) {
            if (this.scrollLocked) {
                this.scrollLockBtn.classList.add('locked');
                this.scrollLockBtn.title = 'Unlock Scroll (click to unlock and catch up)';
            } else {
                this.scrollLockBtn.classList.remove('locked');
                this.scrollLockBtn.title = 'Lock Scroll (click to lock and read backscroll)';
                // When unlocking, scroll to bottom to catch up
                if (this.terminalContent) {
                    this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
                }
            }
        }
    }
    
    /**
     * Create or reuse a bespoke dialog for ticket actions (no system popups)
     */
    createBespokeDialog(title, label, onSubmit) {
        // Create or reuse dialog
        let dialog = document.getElementById('ticketActionDialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'ticketActionDialog';
            dialog.className = 'zork-ticket-dialog-overlay hidden';
            dialog.innerHTML = `
                <div class="zork-ticket-dialog">
                    <div class="zork-ticket-dialog-header">
                        <h3 id="ticketActionDialogTitle">${this.escapeHtml(title)}</h3>
                        <button class="zork-ticket-dialog-close" id="ticketActionDialogClose">×</button>
                    </div>
                    <div class="zork-ticket-dialog-content">
                        <label id="ticketActionLabel">${this.escapeHtml(label)}</label>
                        <textarea id="ticketActionInput" class="zork-ticket-textarea" rows="4"></textarea>
                        <div id="ticketActionError" class="zork-ticket-error hidden"></div>
                    </div>
                    <div class="zork-ticket-dialog-buttons">
                        <button id="ticketActionSubmit" class="zork-ticket-btn zork-ticket-btn-primary">Submit</button>
                        <button id="ticketActionCancel" class="zork-ticket-btn zork-ticket-btn-secondary">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
        }
        
        // Get current elements
        const titleEl = dialog.querySelector('#ticketActionDialogTitle');
        const labelEl = dialog.querySelector('#ticketActionLabel');
        const input = dialog.querySelector('#ticketActionInput');
        const errorEl = dialog.querySelector('#ticketActionError');
        const submitBtn = dialog.querySelector('#ticketActionSubmit');
        const cancelBtn = dialog.querySelector('#ticketActionCancel');
        const closeBtn = dialog.querySelector('#ticketActionDialogClose') || dialog.querySelector('.zork-ticket-dialog-close');
        
        // Update content
        if (titleEl) titleEl.textContent = title;
        if (labelEl) labelEl.textContent = label;
        if (input) input.value = '';
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
        
        // Setup handlers - use event delegation on dialog to avoid cloning issues
        if (!submitBtn || !cancelBtn) {
            console.error('[Terminal] Dialog buttons not found:', { submitBtn: !!submitBtn, cancelBtn: !!cancelBtn });
            return dialog;
        }
        
        const closeDialog = () => {
            console.log('[Terminal] Closing dialog');
            dialog.classList.add('hidden');
            if (input) input.value = '';
        };
        
        // Store onSubmit in dialog dataset for event delegation
        dialog.dataset.onSubmit = 'true';
        dialog._onSubmitCallback = onSubmit;
        
        // Use event delegation on the dialog itself (more reliable than cloning)
        if (!dialog.dataset.delegationSetup) {
            dialog.addEventListener('click', (e) => {
                // Find the actual button element (might be clicked on child element)
                let button = e.target;
                while (button && button !== dialog) {
                    const buttonId = button.id;
                    const buttonClass = button.className || '';
                    
                    // Check if this is the submit button or contains it
                    if (buttonId === 'ticketActionSubmit' || button.classList.contains('zork-ticket-btn-primary')) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[Terminal] Submit button clicked via delegation');
                        
                        const currentInputEl = dialog.querySelector('#ticketActionInput');
                        const value = currentInputEl ? currentInputEl.value.trim() : '';
                        console.log('[Terminal] Submit - value length:', value.length, 'value:', value.substring(0, 50));
                        console.log('[Terminal] Submit - callback exists:', !!dialog._onSubmitCallback);
                        
                        closeDialog();
                        
                        if (dialog._onSubmitCallback) {
                            console.log('[Terminal] Calling onSubmit callback');
                            try {
                                dialog._onSubmitCallback(value);
                                console.log('[Terminal] onSubmit completed');
                            } catch (error) {
                                console.error('[Terminal] Error in onSubmit:', error);
                            }
                        } else {
                            console.warn('[Terminal] No onSubmit callback found');
                        }
                        return;
                    }
                    
                    // Check if this is the cancel button
                    if (buttonId === 'ticketActionCancel' || (button.classList.contains('zork-ticket-btn') && !button.classList.contains('zork-ticket-btn-primary'))) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[Terminal] Cancel button clicked via delegation');
                        closeDialog();
                        return;
                    }
                    
                    // Check if this is the close button
                    if (buttonId === 'ticketActionDialogClose' || button.classList.contains('zork-ticket-dialog-close')) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[Terminal] Close button clicked via delegation');
                        closeDialog();
                        return;
                    }
                    
                    // Move up the DOM tree
                    button = button.parentElement;
                }
                
                // Log if click wasn't on a button (for debugging)
                if (e.target !== dialog) {
                    console.log('[Terminal] Dialog click on non-button element:', {
                        tagName: e.target.tagName,
                        id: e.target.id,
                        className: e.target.className
                    });
                }
            });
            
            dialog.dataset.delegationSetup = 'true';
        }
        
        // Setup keyboard handlers on input
        if (input) {
            // Remove old listeners by cloning
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Terminal] Ctrl+Enter pressed, triggering submit');
                    const submitBtn = dialog.querySelector('#ticketActionSubmit');
                    if (submitBtn) {
                        submitBtn.click();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Terminal] Escape pressed, closing');
                    closeDialog();
                }
            });
            
            // Focus the new input
            setTimeout(() => {
                newInput.focus();
                console.log('[Terminal] Input focused');
            }, 100);
        }
        
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Terminal] Close button clicked');
                closeDialog();
            });
        }
        
        // Close on overlay click (only add once)
        if (!dialog.dataset.overlayHandlerAdded) {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    console.log('[Terminal] Overlay clicked, closing dialog');
                    closeDialog();
                }
            });
            dialog.dataset.overlayHandlerAdded = 'true';
        }
        
        return dialog;
    }
    
    /**
     * Render ticket text with image support
     * Converts markdown-style image syntax ![alt](data:image/...) to actual img tags
     */
    renderTicketTextWithImages(text) {
        if (!text) return '';
        
        // Escape HTML first
        let escaped = this.escapeHtml(text);
        
        // Convert markdown-style images to HTML img tags
        // Pattern: ![alt](data:image/type;base64,...)
        const imagePattern = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
        escaped = escaped.replace(imagePattern, (match, alt, dataUri) => {
            // Validate it's a data URI
            if (!dataUri.startsWith('data:image/')) {
                return match; // Return original if not valid
            }
            
            // Create img tag with base64 data
            return `<img src="${dataUri}" alt="${this.escapeHtml(alt || 'Screenshot')}" class="ticket-screenshot" style="max-width: 100%; height: auto; border: 2px solid #00ff00; border-radius: 4px; margin: 10px 0; display: block;" />`;
        });
        
        // Convert line breaks to <br>
        escaped = escaped.replace(/\n/g, '<br>');
        
        return escaped;
    }
}

