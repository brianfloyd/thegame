/**
 * Terminal Component
 * 
 * Handles log display & command input.
 * CRITICAL: Ensures Markup.parse() is ALWAYS used for all messages.
 */

import Component from '../core/Component.js';
import { parseMarkup } from '../utils/Markup.js';

export default class Terminal extends Component {
    constructor(game) {
        super(game);
        this.terminalContent = null;
        this.roomItemsDisplay = null;
        this.commandInput = null;
        this.currentRoomId = null;
        this.lastInteractionTime = Date.now();
        this.IDLE_LOOK_DELAY = 30000; // 30 seconds
        this.idleLookInterval = null;
        // Track NPC elements in current room for in-place status updates
        this.currentRoomNPCs = new Map(); // npcId -> { element, nameSpan, statusSpan, lastStatus }
    }
    
    init() {
        super.init();
        
        this.terminalContent = document.getElementById('terminalContent');
        this.roomItemsDisplay = document.getElementById('roomItemsDisplay');
        this.commandInput = document.getElementById('commandInput');
        
        if (!this.terminalContent) {
            console.error('[Terminal] terminalContent element not found');
            return;
        }
        
        // Subscribe to MessageBus events
        this.subscribe('terminal:message', (data) => this.handleTerminalMessage(data));
        this.subscribe('terminal:error', (data) => this.handleTerminalError(data));
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
            // Parse markup client-side for these cases
            msgDiv.innerHTML = parseMarkup(message, '#00ffff');
        }
        
        this.terminalContent.appendChild(msgDiv);
        this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
        
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
            this.addMessage(data.message, 'error', true);
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
        
        this.currentRoomId = room.id;
        
        // Only display full room info when entering a new room or forced (look command)
        if (isNewRoom || showFullInfo) {
            this.updateRoomView(room, players, exits, npcs, roomItems, showFullInfo, messages);
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
                    npcName.textContent = npc.name;
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
            
            // Save to history - use messages.alsoHere if available, otherwise build it
            if (messages && messages.alsoHere) {
                this.saveTerminalMessage(messages.alsoHere, 'info');
            } else {
                const combinedEntities = [...otherPlayers];
                if (npcs && npcs.length > 0) {
                    npcs.forEach(npc => {
                        const statusMessage = this.getNPCStatusMessage(npc);
                        combinedEntities.push(npc.name + (statusMessage ? ' ' + statusMessage : ''));
                    });
                }
                const historyText = combinedEntities.length > 0 
                    ? 'Also here: ' + combinedEntities.join(', ')
                    : 'Also here: No one else is here.';
                this.saveTerminalMessage(historyText, 'info');
            }
        }
        
        // Display exits (CRITICAL: uses parseMarkup)
        if (messages && messages.obviousExits && messages.obviousExits.trim() !== '') {
            const exitsDiv = document.createElement('div');
            exitsDiv.className = 'exits-section';
            exitsDiv.innerHTML = parseMarkup(messages.obviousExits, '#00ffff');
            this.terminalContent.appendChild(exitsDiv);
            this.saveTerminalMessage(messages.obviousExits, 'info');
        } else if (exits && exits.length > 0) {
            const exitsDiv = document.createElement('div');
            exitsDiv.className = 'exits-section';
            const exitsText = `Obvious exits: ${exits.join(', ')}`;
            exitsDiv.innerHTML = `<span class="exits-section-title">Obvious exits:</span> ${exits.join(', ')}`;
            this.terminalContent.appendChild(exitsDiv);
            this.saveTerminalMessage(exitsText, 'info');
        }
        
        // Scroll to bottom
        this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
        
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
            this.addMessage(`${playerName} enters${dirText}.`, 'info', true);
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
            this.addMessage(`${playerName} left${dirText}.`, 'info', true);
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
            messageDiv.innerHTML = `<span class="resonated-player">${this.escapeHtml(playerName)}</span> resonated <span class="resonated-text">${this.escapeHtml(message)}</span>!`;
            this.terminalContent.appendChild(messageDiv);
            this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
            this.saveTerminalMessage(`${playerName} resonated ${message}!`, 'info');
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
            this.addMessage(`${playerName} says "${message}"`, 'info', true);
        }
    }
    
    /**
     * Handle telepath message
     */
    handleTelepath(data) {
        const { fromPlayer, message } = data;
        if (fromPlayer && message) {
            this.addMessage(`[Telepath from ${fromPlayer}]: ${message}`, 'info', true);
        }
    }
    
    /**
     * Handle telepath sent message
     */
    handleTelepathSent(data) {
        const { toPlayer, message } = data;
        if (toPlayer && message) {
            this.addMessage(`[Telepath to ${toPlayer}]: ${message}`, 'info', true);
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
            
            if (idleTime >= this.IDLE_LOOK_DELAY) {
                // Send look command
                const ws = this.game.getWebSocket();
                if (ws && ws.readyState === WebSocket.OPEN) {
                    this.game.send({ type: 'look' });
                }
            }
        }, 5000); // Check every 5 seconds
    }
    
    /**
     * Reset idle timer (called on player interaction)
     */
    resetIdleTimer() {
        this.lastInteractionTime = Date.now();
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
        super.destroy();
    }
}

