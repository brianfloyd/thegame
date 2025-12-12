/**
 * CommsWidget
 * 
 * Handles communication widget (talk/resonate/telepath).
 */

import Widget from './Widget.js';
import { parseMarkup } from '../utils/Markup.js';

export default class CommsWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.commMode = 'talk';
        this.commHistory = {
            talk: [],
            resonate: [],
            telepath: []
        };
        this.commTargetPlayer = null;
        this.commChatContent = null;
        this.commInput = null;
        this.commSendBtn = null;
        this.modeButtons = {};
    }
    
    init() {
        super.init();
        // No DOM lookups in init - done in onAttach
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-comms';
        root.setAttribute('data-widget', 'comms');
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Communication';
        root.appendChild(header);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'widget-content';
        
        // Create mode buttons
        const modeContainer = document.createElement('div');
        modeContainer.className = 'comm-mode-buttons';
        
        const talkBtn = document.createElement('button');
        talkBtn.className = 'comm-mode-btn active';
        talkBtn.setAttribute('data-mode', 'talk');
        talkBtn.textContent = 'Talk';
        modeContainer.appendChild(talkBtn);
        
        const resonateBtn = document.createElement('button');
        resonateBtn.className = 'comm-mode-btn';
        resonateBtn.setAttribute('data-mode', 'resonate');
        resonateBtn.textContent = 'Resonate';
        modeContainer.appendChild(resonateBtn);
        
        const telepathBtn = document.createElement('button');
        telepathBtn.className = 'comm-mode-btn';
        telepathBtn.setAttribute('data-mode', 'telepath');
        telepathBtn.textContent = 'Telepath';
        modeContainer.appendChild(telepathBtn);
        
        content.appendChild(modeContainer);
        
        // Create chat content area
        const chatContainer = document.createElement('div');
        chatContainer.className = 'comm-chat-container';
        
        const chatContent = document.createElement('div');
        chatContent.className = 'comm-chat-content';
        chatContent.id = 'commChatContent';
        chatContainer.appendChild(chatContent);
        
        content.appendChild(chatContainer);
        
        // Create input area
        const inputContainer = document.createElement('div');
        inputContainer.className = 'comm-input-container';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'comm-input';
        input.id = 'commInput';
        input.placeholder = 'Type message...';
        inputContainer.appendChild(input);
        
        const sendBtn = document.createElement('button');
        sendBtn.className = 'comm-send-btn';
        sendBtn.id = 'commSendBtn';
        sendBtn.textContent = 'Send';
        inputContainer.appendChild(sendBtn);
        
        content.appendChild(inputContainer);
        
        root.appendChild(content);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Get DOM elements
        this.commChatContent = this.rootElement.querySelector('#commChatContent');
        this.commInput = this.rootElement.querySelector('#commInput');
        this.commSendBtn = this.rootElement.querySelector('#commSendBtn');
        
        // Get mode buttons
        this.modeButtons = {
            talk: this.rootElement.querySelector('[data-mode="talk"]'),
            resonate: this.rootElement.querySelector('[data-mode="resonate"]'),
            telepath: this.rootElement.querySelector('[data-mode="telepath"]')
        };
        
        // Set up mode button handlers
        Object.entries(this.modeButtons).forEach(([mode, btn]) => {
            if (btn) {
                btn.addEventListener('click', () => this.setCommMode(mode));
            }
        });
        
        // Set up send button handler
        if (this.commSendBtn) {
            this.commSendBtn.addEventListener('click', () => this.sendCommMessage());
        }
        
        // Set up input enter key handler
        if (this.commInput) {
            this.commInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendCommMessage();
                }
            });
        }
        
        // Load comms history
        this.loadCommsHistory();
        
        // Render initial history
        this.renderCommHistory();
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'talked') {
            this.handleTalked(msg);
        } else if (msg.type === 'resonated') {
            this.handleResonated(msg);
        } else if (msg.type === 'telepath') {
            this.handleTelepath(msg);
        } else if (msg.type === 'telepathSent') {
            this.handleTelepathSent(msg);
        } else if (msg.type === 'playerAuthenticated' && msg.playerName) {
            this.loadCommsHistory();
        }
    }
    
    /**
     * Set communication mode
     */
    setCommMode(mode) {
        this.commMode = mode;
        
        // Update button states
        Object.entries(this.modeButtons).forEach(([m, btn]) => {
            if (btn) {
                if (m === mode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
        
        // Update input placeholder
        if (this.commInput) {
            if (mode === 'telepath') {
                this.commInput.placeholder = 'Player name, then message...';
            } else {
                this.commInput.placeholder = 'Type message...';
            }
        }
        
        // Render history for current mode
        this.renderCommHistory();
    }
    
    /**
     * Send communication message
     */
    sendCommMessage() {
        if (!this.commInput || !this.commInput.value.trim()) return;
        
        const message = this.commInput.value.trim();
        const ws = this.game.getWebSocket();
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server.', 'error');
            }
            return;
        }
        
        if (this.commMode === 'telepath') {
            // Parse "player message" format
            const parts = message.split(' ');
            if (parts.length < 2) {
                if (window.terminal) {
                    window.terminal.addMessage('Usage: telepath <player> <message>', 'error');
                }
                return;
            }
            const targetPlayer = parts[0];
            const telepathMessage = parts.slice(1).join(' ');
            this.game.send({
                type: 'telepath',
                targetPlayer: targetPlayer,
                message: telepathMessage
            });
            this.commTargetPlayer = targetPlayer;
        } else {
            this.game.send({
                type: this.commMode,
                message: message
            });
        }
        
        this.commInput.value = '';
    }
    
    /**
     * Handle talked message
     */
    handleTalked(data) {
        const { playerName, message } = data;
        if (playerName && message) {
            this.addToCommHistory('talk', playerName, message, playerName !== this.game.getPlayerName());
            this.renderCommHistory();
        }
    }
    
    /**
     * Handle resonated message
     */
    handleResonated(data) {
        const { playerName, message } = data;
        if (playerName && message) {
            this.addToCommHistory('resonate', playerName, message, playerName !== this.game.getPlayerName());
            this.renderCommHistory();
        }
    }
    
    /**
     * Handle telepath message
     */
    handleTelepath(data) {
        const { fromPlayer, message } = data;
        if (fromPlayer && message) {
            this.addToCommHistory('telepath', fromPlayer, message, true);
            this.renderCommHistory();
        }
    }
    
    /**
     * Handle telepath sent message
     */
    handleTelepathSent(data) {
        const { toPlayer, message } = data;
        if (toPlayer && message) {
            this.addToCommHistory('telepath', this.game.getPlayerName(), message, false, toPlayer);
            this.renderCommHistory();
        }
    }
    
    /**
     * Add message to comm history
     */
    addToCommHistory(mode, playerName, message, isReceived, targetPlayer = null) {
        if (!this.commHistory[mode]) {
            this.commHistory[mode] = [];
        }
        
        this.commHistory[mode].push({
            playerName,
            message,
            isReceived,
            targetPlayer,
            timestamp: Date.now()
        });
        
        // Keep only last 100 messages
        if (this.commHistory[mode].length > 100) {
            this.commHistory[mode] = this.commHistory[mode].slice(-100);
        }
        
        this.saveCommsHistory();
    }
    
    /**
     * Render comm history
     */
    renderCommHistory() {
        if (!this.commChatContent) return;
        
        const history = this.commHistory[this.commMode] || [];
        this.commChatContent.innerHTML = '';
        
        history.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'comm-message';
            
            let displayText = '';
            if (this.commMode === 'telepath') {
                if (msg.isReceived) {
                    displayText = `[From ${this.cleanPlayerName(msg.playerName)}]: ${msg.message}`;
                } else {
                    displayText = `[To ${this.cleanPlayerName(msg.targetPlayer)}]: ${msg.message}`;
                }
            } else {
                displayText = `${this.cleanPlayerName(msg.playerName)}: ${msg.message}`;
            }

            // CRITICAL: Parse markup in messages (especially for ZORK's responses)
            // Split player name and message, parse only the message part
            const parts = displayText.split(': ');
            if (parts.length > 1) {
                const playerPart = parts[0] + ': ';
                const messagePart = parts.slice(1).join(': ');
                // Parse markup only (no markdown - use markup conventions instead)
                msgDiv.innerHTML = this.escapeHtml(playerPart) + parseMarkup(messagePart, '#00ffff');
            } else {
                // Fallback: parse entire text
                msgDiv.innerHTML = parseMarkup(displayText, '#00ffff');
            }
            this.commChatContent.appendChild(msgDiv);
        });
        
        // Scroll to bottom
        const scrollContainer = this.commChatContent.parentElement;
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
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
        return name.replace(/^@|@$/g, '');
    }
    
    /**
     * Load comms history from localStorage
     */
    loadCommsHistory() {
        const playerName = this.game.getPlayerName();
        if (!playerName) return;
        
        try {
            const stored = localStorage.getItem(`comms_history_${playerName}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.commHistory.talk = parsed.talk || [];
                this.commHistory.resonate = parsed.resonate || [];
                this.commHistory.telepath = parsed.telepath || [];
                
                // Keep only last 100 per channel
                if (this.commHistory.talk.length > 100) this.commHistory.talk = this.commHistory.talk.slice(-100);
                if (this.commHistory.resonate.length > 100) this.commHistory.resonate = this.commHistory.resonate.slice(-100);
                if (this.commHistory.telepath.length > 100) this.commHistory.telepath = this.commHistory.telepath.slice(-100);
                
                this.renderCommHistory();
            }
        } catch (e) {
            console.error('Failed to load comms history:', e);
        }
    }
    
    /**
     * Save comms history to localStorage
     */
    saveCommsHistory() {
        const playerName = this.game.getPlayerName();
        if (!playerName) return;
        
        try {
            localStorage.setItem(`comms_history_${playerName}`, JSON.stringify(this.commHistory));
        } catch (e) {
            console.error('Failed to save comms history:', e);
        }
    }
}
