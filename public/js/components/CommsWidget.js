/**
 * CommsWidget Component
 * 
 * Handles communication widget (talk/resonate/telepath).
 */

import Component from '../core/Component.js';

export default class CommsWidget extends Component {
    constructor(game) {
        super(game);
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
        
        // Get DOM elements
        this.commChatContent = document.getElementById('commChatContent');
        this.commInput = document.getElementById('commInput');
        this.commSendBtn = document.getElementById('commSendBtn');
        
        // Get mode buttons
        this.modeButtons = {
            talk: document.querySelector('[data-mode="talk"]'),
            resonate: document.querySelector('[data-mode="resonate"]'),
            telepath: document.querySelector('[data-mode="telepath"]')
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
        
        // Subscribe to communication events
        this.subscribe('talked', (data) => this.handleTalked(data));
        this.subscribe('resonated', (data) => this.handleResonated(data));
        this.subscribe('telepath', (data) => this.handleTelepath(data));
        this.subscribe('telepathSent', (data) => this.handleTelepathSent(data));
        this.subscribe('player:authenticated', (data) => {
            if (data.playerName) {
                this.loadCommsHistory();
            }
        });
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
            this.emit('terminal:error', { message: 'Not connected to server.' });
            return;
        }
        
        if (this.commMode === 'telepath') {
            // Parse "player message" format
            const parts = message.split(' ');
            if (parts.length < 2) {
                this.emit('terminal:error', { message: 'Usage: telepath <player> <message>' });
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
                    displayText = `[From ${msg.playerName}]: ${msg.message}`;
                } else {
                    displayText = `[To ${msg.targetPlayer}]: ${msg.message}`;
                }
            } else {
                displayText = `${msg.playerName}: ${msg.message}`;
            }
            
            msgDiv.textContent = displayText;
            this.commChatContent.appendChild(msgDiv);
        });
        
        // Scroll to bottom
        const scrollContainer = this.commChatContent.parentElement;
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
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


