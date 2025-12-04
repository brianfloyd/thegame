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
     * Add message to terminal with consistent markup parsing
     * CRITICAL: Always uses Markup.parse() for text rendering
     */
    addMessage(message, type = 'info', saveToHistory = true, html = null) {
        if (!this.terminalContent || !message) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = type === 'error' ? 'error-message' : 'info-message';
        
        // CRITICAL: Always use parseMarkup for text rendering
        if (html) {
            // Pre-rendered HTML (for tables, etc.) - but still check if it needs markup parsing
            const isHtmlTable = html.includes('<table') || html.includes('<div class="who-list">');
            if (isHtmlTable) {
                // Direct HTML insertion for tables
                msgDiv.innerHTML = html;
            } else {
                // Even HTML might contain markup, parse it
                msgDiv.innerHTML = parseMarkup(html, '#00ffff');
            }
        } else {
            // Regular message - ALWAYS parse markup
            msgDiv.innerHTML = parseMarkup(message, '#00ffff');
        }
        
        this.terminalContent.appendChild(msgDiv);
        this.terminalContent.scrollTop = this.terminalContent.scrollHeight;
        
        // Save to terminal history
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
     */
    handleTerminalMessage(data) {
        const { message, type = 'info', html = null } = data;
        if (!message) return;
        
        // Check if message contains HTML table (like who command) - don't parse markup for those
        const isHtmlTable = message.includes('<table') || message.includes('<div class="who-list">');
        
        if (html || isHtmlTable) {
            // Direct HTML insertion for tables
            this.addMessage(message, type, true, html || message);
        } else {
            // Regular message with markup parsing
            this.addMessage(message, type, true, null);
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
        this.currentRoomId = room.id;
        
        // Only display full room info when entering a new room or forced (look command)
        if (isNewRoom || showFullInfo) {
            this.updateRoomView(room, players, exits, npcs, roomItems, showFullInfo, messages);
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
        
        // Display players and NPCs (using formatted message from server)
        if (messages && messages.alsoHere) {
            const alsoHereDiv = document.createElement('div');
            alsoHereDiv.className = 'players-section';
            const alsoHereLine = document.createElement('span');
            alsoHereLine.className = 'players-line';
            
            // CRITICAL: Parse markup
            alsoHereLine.innerHTML = parseMarkup(messages.alsoHere, '#00ffff');
            
            // Add click handlers for player names
            const currentPlayerName = this.game.getPlayerName();
            const otherPlayers = players ? players.filter(p => p !== currentPlayerName) : [];
            this.addPlayerClickHandlers(alsoHereLine, otherPlayers);
            
            alsoHereDiv.appendChild(alsoHereLine);
            this.terminalContent.appendChild(alsoHereDiv);
            this.saveTerminalMessage(messages.alsoHere, 'info');
        } else {
            // Fallback formatting
            const currentPlayerName = this.game.getPlayerName();
            const otherPlayers = players ? players.filter(p => p !== currentPlayerName) : [];
            const combinedEntities = [...otherPlayers];
            
            if (npcs && npcs.length > 0) {
                npcs.forEach(npc => {
                    let npcDisplay = npc.name;
                    if (npc.state && typeof npc.state === 'object') {
                        const cycles = npc.state.cycles || 0;
                        let statusMessage = '';
                        if (cycles === 0) {
                            statusMessage = npc.statusMessageIdle || '(idle)';
                        } else if (npc.state.harvest_active || npc.harvestStatus === 'active') {
                            statusMessage = npc.statusMessageHarvesting || '(harvesting)';
                        } else if ((npc.state.cooldown_until && Date.now() < npc.state.cooldown_until) || npc.harvestStatus === 'cooldown') {
                            statusMessage = npc.statusMessageCooldown ?? '(cooldown)';
                        } else {
                            statusMessage = npc.statusMessageReady ?? '(ready)';
                        }
                        if (statusMessage) {
                            npcDisplay += ' ' + statusMessage;
                        }
                    }
                    combinedEntities.push(npcDisplay);
                });
            }
            
            const playersDiv = document.createElement('div');
            playersDiv.className = 'players-section';
            const playersLine = document.createElement('span');
            playersLine.className = 'players-line';
            
            if (combinedEntities.length > 0) {
                const formattedList = combinedEntities.join(', ');
                playersLine.innerHTML = `<span class="players-section-title">Also here:</span> ${parseMarkup(formattedList, '#00ffff')}`;
                this.saveTerminalMessage('Also here: ' + formattedList, 'info');
            } else {
                playersLine.innerHTML = `<span class="players-section-title">Also here:</span> <span class="player-item">No one else is here.</span>`;
                this.saveTerminalMessage('Also here: No one else is here.', 'info');
            }
            
            playersDiv.appendChild(playersLine);
            this.terminalContent.appendChild(playersDiv);
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

