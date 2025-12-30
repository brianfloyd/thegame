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
            telepath: [],
            broadcast: {} // Map of groupId -> messages
        };
        this.commTargetPlayer = null;
        this.commChatContent = null;
        this.commInput = null;
        this.commSendBtn = null;
        this.modeButtons = {};
        this.telepathPlayerSelect = null;
        this.connectedPlayers = []; // List of connected players for telepath dropdown
        this.broadcastGroups = []; // List of broadcast groups player is in
        this.selectedBroadcastGroup = null; // Currently selected group ID
        this.broadcastGroupsList = null; // DOM element for groups list
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
        talkBtn.className = 'widget-mode-btn active';
        talkBtn.setAttribute('data-mode', 'talk');
        talkBtn.textContent = 'Talk';
        modeContainer.appendChild(talkBtn);
        
        const resonateBtn = document.createElement('button');
        resonateBtn.className = 'widget-mode-btn';
        resonateBtn.setAttribute('data-mode', 'resonate');
        resonateBtn.textContent = 'Resonate';
        modeContainer.appendChild(resonateBtn);
        
        const telepathBtn = document.createElement('button');
        telepathBtn.className = 'widget-mode-btn';
        telepathBtn.setAttribute('data-mode', 'telepath');
        telepathBtn.textContent = 'Telepath';
        modeContainer.appendChild(telepathBtn);
        
        const broadcastBtn = document.createElement('button');
        broadcastBtn.className = 'widget-mode-btn';
        broadcastBtn.setAttribute('data-mode', 'broadcast');
        broadcastBtn.textContent = 'Broadcast';
        modeContainer.appendChild(broadcastBtn);
        
        content.appendChild(modeContainer);
        
        // Create input area (moved above chat history)
        const inputContainer = document.createElement('div');
        inputContainer.className = 'comm-input-container';
        
        // Player select dropdown for telepath mode (initially hidden)
        const playerSelect = document.createElement('select');
        playerSelect.className = 'comm-player-select';
        playerSelect.id = 'commPlayerSelect';
        playerSelect.style.display = 'none';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select player...';
        playerSelect.appendChild(defaultOption);
        inputContainer.appendChild(playerSelect);
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'widget-input';
        input.id = 'commInput';
        input.placeholder = 'Type message...';
        inputContainer.appendChild(input);
        
        const sendBtn = document.createElement('button');
        sendBtn.className = 'widget-btn widget-btn-primary';
        sendBtn.id = 'commSendBtn';
        sendBtn.textContent = 'Send';
        inputContainer.appendChild(sendBtn);
        
        content.appendChild(inputContainer);
        
        // Create broadcast layout container (initially hidden)
        const broadcastLayout = document.createElement('div');
        broadcastLayout.className = 'comm-broadcast-layout';
        broadcastLayout.id = 'commBroadcastLayout';
        broadcastLayout.style.display = 'none';
        
        // Left side: Groups list
        const groupsListContainer = document.createElement('div');
        groupsListContainer.className = 'comm-broadcast-groups-container';
        
        // Create group button
        const createGroupBtn = document.createElement('button');
        createGroupBtn.className = 'widget-btn widget-btn-primary widget-btn-small';
        createGroupBtn.id = 'commCreateGroupBtn';
        createGroupBtn.textContent = '+ Create Group';
        createGroupBtn.style.marginBottom = '8px';
        createGroupBtn.style.width = '100%';
        groupsListContainer.appendChild(createGroupBtn);
        
        const groupsList = document.createElement('div');
        groupsList.className = 'comm-broadcast-groups';
        groupsList.id = 'commBroadcastGroups';
        groupsListContainer.appendChild(groupsList);
        
        broadcastLayout.appendChild(groupsListContainer);
        
        // Right side: Chat area
        const broadcastChatArea = document.createElement('div');
        broadcastChatArea.className = 'comm-broadcast-chat';
        
        const broadcastChatContainer = document.createElement('div');
        broadcastChatContainer.className = 'comm-chat-container';
        
        const broadcastChatContent = document.createElement('div');
        broadcastChatContent.className = 'comm-chat-content';
        broadcastChatContent.id = 'commBroadcastChatContent';
        broadcastChatContainer.appendChild(broadcastChatContent);
        
        broadcastChatArea.appendChild(broadcastChatContainer);
        
        // Input area for broadcast (clone of main input but for broadcast)
        const broadcastInputContainer = document.createElement('div');
        broadcastInputContainer.className = 'comm-input-container';
        broadcastInputContainer.id = 'commBroadcastInputContainer';
        
        const broadcastInput = document.createElement('input');
        broadcastInput.type = 'text';
        broadcastInput.className = 'widget-input';
        broadcastInput.id = 'commBroadcastInput';
        broadcastInput.placeholder = 'Type message...';
        broadcastInputContainer.appendChild(broadcastInput);
        
        const broadcastSendBtn = document.createElement('button');
        broadcastSendBtn.className = 'widget-btn widget-btn-primary';
        broadcastSendBtn.id = 'commBroadcastSendBtn';
        broadcastSendBtn.textContent = 'Send';
        broadcastInputContainer.appendChild(broadcastSendBtn);
        
        broadcastChatArea.appendChild(broadcastInputContainer);
        broadcastLayout.appendChild(broadcastChatArea);
        
        content.appendChild(broadcastLayout);
        
        // Create chat content area (moved below input) - for non-broadcast modes
        const chatContainer = document.createElement('div');
        chatContainer.className = 'comm-chat-container';
        chatContainer.id = 'commChatContainer';
        
        const chatContent = document.createElement('div');
        chatContent.className = 'comm-chat-content';
        chatContent.id = 'commChatContent';
        chatContainer.appendChild(chatContent);
        
        content.appendChild(chatContainer);
        
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
        this.telepathPlayerSelect = this.rootElement.querySelector('#commPlayerSelect');
        
        // Set up player select change handler
        if (this.telepathPlayerSelect) {
            this.telepathPlayerSelect.addEventListener('change', () => {
                const selectedPlayer = this.telepathPlayerSelect.value;
                if (selectedPlayer && this.commInput) {
                    // Focus input after selection
                    this.commInput.focus();
                }
            });
        }
        
        // Get mode buttons
        this.modeButtons = {
            talk: this.rootElement.querySelector('[data-mode="talk"]'),
            resonate: this.rootElement.querySelector('[data-mode="resonate"]'),
            telepath: this.rootElement.querySelector('[data-mode="telepath"]'),
            broadcast: this.rootElement.querySelector('[data-mode="broadcast"]')
        };
        
        // Get broadcast-specific elements
        this.broadcastGroupsList = this.rootElement.querySelector('#commBroadcastGroups');
        this.broadcastLayout = this.rootElement.querySelector('#commBroadcastLayout');
        this.broadcastChatContent = this.rootElement.querySelector('#commBroadcastChatContent');
        this.broadcastInput = this.rootElement.querySelector('#commBroadcastInput');
        this.broadcastSendBtn = this.rootElement.querySelector('#commBroadcastSendBtn');
        this.createGroupBtn = this.rootElement.querySelector('#commCreateGroupBtn');
        this.commChatContainer = this.rootElement.querySelector('#commChatContainer');
        
        // Set up create group button
        if (this.createGroupBtn) {
            this.createGroupBtn.addEventListener('click', () => this.showCreateGroupDialog());
        }
        
        // Set up broadcast input handlers
        if (this.broadcastSendBtn) {
            this.broadcastSendBtn.addEventListener('click', () => this.sendBroadcastMessage());
        }
        if (this.broadcastInput) {
            this.broadcastInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendBroadcastMessage();
                }
            });
        }
        
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
        
        // Load comms history (with retry if player name not available)
        // History will be rendered after loading completes
        this.loadCommsHistory();
        
        // Load broadcast groups
        this.loadBroadcastGroups();
        
        // Also render immediately in case history is already loaded
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
        } else if (msg.type === 'connectedPlayersList') {
            this.handleConnectedPlayersList(msg);
        } else if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            // Refresh player list when room updates (players may have entered/left)
            if (this.commMode === 'telepath') {
                this.requestPlayerList();
            }
        } else if (msg.type === 'systemMessage') {
            // Refresh player list when system messages indicate players entering/leaving
            // Check if message mentions player entering or leaving
            if (this.commMode === 'telepath' && msg.message && 
                (msg.message.includes('entered the game') || msg.message.includes('left the game'))) {
                // Request updated player list
                this.requestPlayerList();
            }
        } else if (msg.type === 'broadcast') {
            this.handleBroadcast(msg);
        } else if (msg.type === 'broadcastGroups') {
            this.broadcastGroups = msg.groups || [];
            if (this.commMode === 'broadcast') {
                this.renderBroadcastGroups();
                // Auto-select first group if none selected
                if (!this.selectedBroadcastGroup && this.broadcastGroups.length > 0) {
                    this.selectedBroadcastGroup = this.broadcastGroups[0].id;
                    this.renderBroadcastGroups();
                    this.renderBroadcastHistory();
                }
            }
            // Refresh management modal if open
            if (this.manageModalGroupId) {
                this.loadGroupMembers(this.manageModalGroupId, this.manageModalMembersList, this.manageModalPlayerSelect);
            }
        } else if (msg.type === 'broadcastHistory') {
            // Load broadcast history from server
            if (msg.history) {
                Object.keys(msg.history).forEach(groupId => {
                    const groupHistory = msg.history[groupId];
                    this.commHistory.broadcast[groupId] = groupHistory.messages || [];
                });
                if (this.commMode === 'broadcast') {
                    this.renderBroadcastHistory();
                }
            }
        } else if (msg.type === 'allPlayers') {
            // Handle all players list for modal
            console.log('[CommsWidget] Received allPlayers message:', msg);
            if (msg.players) {
                this.allPlayers = msg.players;
                console.log('[CommsWidget] Storing players, count:', msg.players.length);
                // Check if create modal is open (select element exists)
                const select = document.getElementById('broadcastGroupPlayerSelect');
                if (select) {
                    console.log('[CommsWidget] Create modal is open, rendering players list');
                    this.modalPlayerSelect = select;
                    this.renderPlayersList(msg.players);
                }
                // Check if manage modal is open
                if (this.manageModalPlayerSelect && this.manageModalMembersList) {
                    // We need current members to render properly, so wait for that
                    console.log('[CommsWidget] Manage modal is open, players stored for member list');
                }
            }
        } else if (msg.type === 'broadcastGroupMembers') {
            // Handle group members list for management modal
            if (msg.members !== undefined && this.manageModalMembersList) {
                this.renderGroupMembers(msg.members);
            }
        } else if (msg.type === 'broadcastGroupDeleted') {
            // Refresh groups list after deletion
            this.loadBroadcastGroups();
            if (this.commMode === 'broadcast') {
                this.selectedBroadcastGroup = null;
                this.renderBroadcastGroups();
                this.renderBroadcastHistory();
            }
            // Close management modal if it's open for deleted group
            const modal = document.getElementById('broadcastGroupManageModal');
            if (modal) {
                modal.remove();
            }
        } else if (msg.type === 'message' && msg.message && 
                   (msg.message.includes('has been added to broadcast group') || 
                    msg.message.includes('has been removed from broadcast group'))) {
            // Refresh management modal when members are added/removed
            if (this.manageModalGroupId) {
                this.loadGroupMembers(this.manageModalGroupId, this.manageModalMembersList, this.manageModalPlayerSelect);
            }
        }
    }
    
    /**
     * Render players list in modal dropdown
     */
    renderPlayersList(players) {
        console.log('[CommsWidget] renderPlayersList called with players:', players);
        
        const select = document.getElementById('broadcastGroupPlayerSelect');
        if (!select) {
            console.warn('[CommsWidget] Select element not found, trying stored reference');
            // Fallback to stored reference
            if (!this.modalPlayerSelect) {
                console.error('[CommsWidget] No select element reference available');
                return;
            }
        } else {
            this.modalPlayerSelect = select;
        }
        
        console.log('[CommsWidget] Using select element:', this.modalPlayerSelect);
        
        // Clear existing options (except default)
        while (this.modalPlayerSelect.children.length > 1) {
            this.modalPlayerSelect.removeChild(this.modalPlayerSelect.lastChild);
        }
        
        if (!players || players.length === 0) {
            console.warn('[CommsWidget] No players provided to render');
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No players available';
            option.disabled = true;
            this.modalPlayerSelect.appendChild(option);
            return;
        }
        
        console.log('[CommsWidget] Processing', players.length, 'players');
        
        // Get current player name to exclude from list
        const currentPlayerName = this.game.getPlayerName();
        console.log('[CommsWidget] Current player:', currentPlayerName);
        
        // Filter out current player and already selected players, then sort by name
        const filtered = players.filter(p => {
            const playerName = (p.name || '').replace(/^@|@$/g, '');
            const currentName = (currentPlayerName || '').replace(/^@|@$/g, '');
            // Exclude current player and already selected players
            const isNotCurrent = playerName.toLowerCase() !== currentName.toLowerCase();
            const isNotSelected = !this.selectedPlayerIds || !this.selectedPlayerIds.has(p.id);
            return isNotCurrent && isNotSelected;
        });
        
        console.log('[CommsWidget] Filtered to', filtered.length, 'players');
        
        const sorted = filtered.sort((a, b) => {
            const nameA = (a.name || '').replace(/^@|@$/g, '').toLowerCase();
            const nameB = (b.name || '').replace(/^@|@$/g, '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        if (sorted.length === 0) {
            console.log('[CommsWidget] No players to add after filtering');
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'All players already added';
            option.disabled = true;
            this.modalPlayerSelect.appendChild(option);
            return;
        }
        
        console.log('[CommsWidget] Adding', sorted.length, 'options to dropdown');
        sorted.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.name.replace(/^@|@$/g, '');
            this.modalPlayerSelect.appendChild(option);
        });
        
        console.log('[CommsWidget] Dropdown now has', this.modalPlayerSelect.children.length, 'options');
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
        
        // Handle broadcast mode - expand widget to 2 slots
        if (mode === 'broadcast') {
            // Add class to root element to make it fullwidth
            if (this.rootElement) {
                this.rootElement.classList.add('widget-fullwidth');
            }
            // Show broadcast layout, hide regular chat
            if (this.broadcastLayout) {
                this.broadcastLayout.style.display = 'flex';
            }
            if (this.commChatContainer) {
                this.commChatContainer.style.display = 'none';
            }
            // Hide main input container, show broadcast input
            if (this.commInput && this.commInput.closest('.comm-input-container')) {
                this.commInput.closest('.comm-input-container').style.display = 'none';
            }
            // Show broadcast input
            if (this.broadcastInput && this.broadcastInput.closest('.comm-input-container')) {
                this.broadcastInput.closest('.comm-input-container').style.display = 'flex';
            }
            // Hide player select
            if (this.telepathPlayerSelect) {
                this.telepathPlayerSelect.style.display = 'none';
            }
            // Load and render broadcast groups and history
            this.loadBroadcastGroups();
            this.renderBroadcastGroups();
            this.renderBroadcastHistory();
        } else {
            // Remove fullwidth class
            if (this.rootElement) {
                this.rootElement.classList.remove('widget-fullwidth');
            }
            // Hide broadcast layout, show regular chat
            if (this.broadcastLayout) {
                this.broadcastLayout.style.display = 'none';
            }
            if (this.commChatContainer) {
                this.commChatContainer.style.display = 'block';
            }
            // Show main input, hide broadcast input
            if (this.commInput && this.commInput.closest('.comm-input-container')) {
                this.commInput.closest('.comm-input-container').style.display = 'flex';
            }
            if (this.broadcastInput && this.broadcastInput.closest('.comm-input-container')) {
                this.broadcastInput.closest('.comm-input-container').style.display = 'none';
            }
            
            // Update input placeholder and show/hide player select
            if (this.commInput) {
                if (mode === 'telepath') {
                    this.commInput.placeholder = 'Select player above, or type: PlayerName message...';
                    // Show player select dropdown
                    if (this.telepathPlayerSelect) {
                        this.telepathPlayerSelect.style.display = 'block';
                    }
                    // Request player list if we don't have it yet
                    if (this.connectedPlayers.length === 0) {
                        this.requestPlayerList();
                    } else {
                        // Update dropdown even if we have players (in case list changed)
                        this.updatePlayerSelect();
                    }
                } else {
                    this.commInput.placeholder = 'Type message...';
                    // Hide player select dropdown
                    if (this.telepathPlayerSelect) {
                        this.telepathPlayerSelect.style.display = 'none';
                        this.telepathPlayerSelect.value = '';
                    }
                }
            }
            
            // Render history for current mode
            this.renderCommHistory();
        }
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
        
        if (this.commMode === 'broadcast') {
            this.sendBroadcastMessage();
        } else if (this.commMode === 'telepath') {
            // Get target player from dropdown or parse from input
            let targetPlayer = null;
            let telepathMessage = message;
            
            // Check if player is selected from dropdown
            if (this.telepathPlayerSelect && this.telepathPlayerSelect.value) {
                targetPlayer = this.telepathPlayerSelect.value;
                // Message is just the input (no player name needed)
            } else {
                // Fallback: Parse "player message" format for backward compatibility
                const parts = message.split(' ');
                if (parts.length < 2) {
                    if (window.terminal) {
                        window.terminal.addMessage('Please select a player from the dropdown or use: telepath <player> <message>', 'error');
                    }
                    return;
                }
                targetPlayer = parts[0];
                telepathMessage = parts.slice(1).join(' ');
            }
            
            if (!targetPlayer || !telepathMessage.trim()) {
                if (window.terminal) {
                    window.terminal.addMessage('Please select a player and enter a message.', 'error');
                }
                return;
            }
            
            this.game.send({
                type: 'telepath',
                targetPlayer: targetPlayer,
                message: telepathMessage.trim()
            });
            this.commTargetPlayer = targetPlayer;
            
            // Clear dropdown selection after sending (so user can select different player next time)
            if (this.telepathPlayerSelect) {
                this.telepathPlayerSelect.value = '';
            }
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
            // Determine if this is a received message (from another player)
            const currentPlayerName = this.game.getPlayerName();
            const isReceived = currentPlayerName && playerName !== currentPlayerName;
            
            // Add to talk history
            this.addToCommHistory('talk', playerName, message, isReceived);
            
            // Render history - will show talk history if currently on talk tab
            // If on a different tab, message is still saved and will show when switching to talk tab
            this.renderCommHistory();
        }
    }
    
    /**
     * Handle resonated message
     * Works identically to handleTalked - adds to resonate history and renders
     */
    handleResonated(data) {
        const { playerName, message } = data;
        if (playerName && message) {
            // Determine if this is a received message (from another player)
            const currentPlayerName = this.game.getPlayerName();
            const isReceived = currentPlayerName && playerName !== currentPlayerName;
            
            // Add to resonate history (same logic as talk)
            this.addToCommHistory('resonate', playerName, message, isReceived);
            
            // Render history - will show resonate history if currently on resonate tab
            // If on a different tab, message is still saved and will show when switching to resonate tab
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
        if (!this.commChatContent) {
            console.warn('[CommsWidget] commChatContent not available for rendering history');
            return;
        }
        
        const history = this.commHistory[this.commMode] || [];
        
        // Show empty message if no history
        if (history.length === 0) {
            this.commChatContent.innerHTML = '<div class="comm-empty">No messages yet</div>';
        } else {
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
        }
        
        // Scroll to bottom
        const scrollContainer = this.commChatContent.closest('.comm-chat-container');
        if (scrollContainer) {
            // Use setTimeout to ensure DOM is updated before scrolling
            setTimeout(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }, 0);
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
        if (!playerName) {
            // Try again after a short delay if player name not available yet
            setTimeout(() => this.loadCommsHistory(), 500);
            return;
        }
        
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
                
                // Render history after loading
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
    
    /**
     * Request list of connected players from server
     */
    requestPlayerList() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        this.game.send({
            type: 'getConnectedPlayersList'
        });
    }
    
    /**
     * Handle connected players list update
     */
    handleConnectedPlayersList(data) {
        if (!data.players || !Array.isArray(data.players)) {
            return;
        }
        
        this.connectedPlayers = data.players;
        this.updatePlayerSelect();
    }
    
    /**
     * Update player select dropdown with current connected players
     */
    updatePlayerSelect() {
        if (!this.telepathPlayerSelect) {
            return;
        }
        
        const currentPlayerName = this.game.getPlayerName();
        const currentValue = this.telepathPlayerSelect.value;
        
        // Clear existing options (except default)
        while (this.telepathPlayerSelect.children.length > 1) {
            this.telepathPlayerSelect.removeChild(this.telepathPlayerSelect.lastChild);
        }
        
        // Add players (excluding current player)
        this.connectedPlayers.forEach(player => {
            // Skip current player
            if (currentPlayerName && player.name === currentPlayerName) {
                return;
            }
            
            const option = document.createElement('option');
            option.value = player.name; // Use original name with @ symbols for backend matching
            option.textContent = player.displayName; // Show clean name in dropdown
            this.telepathPlayerSelect.appendChild(option);
        });
        
        // Restore previous selection if it still exists
        if (currentValue) {
            const optionExists = Array.from(this.telepathPlayerSelect.options).some(
                opt => opt.value === currentValue
            );
            if (optionExists) {
                this.telepathPlayerSelect.value = currentValue;
            }
        }
    }
    
    /**
     * Load broadcast groups from server
     */
    loadBroadcastGroups() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        // Request broadcast groups
        this.game.send({
            type: 'getBroadcastGroups'
        });
        
        // Request broadcast history
        this.game.send({
            type: 'getBroadcastHistory'
        });
    }
    
    /**
     * Render broadcast groups list
     */
    renderBroadcastGroups() {
        if (!this.broadcastGroupsList) return;
        
        this.broadcastGroupsList.innerHTML = '';
        
        if (this.broadcastGroups.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'comm-empty';
            emptyMsg.textContent = 'No broadcast groups';
            this.broadcastGroupsList.appendChild(emptyMsg);
            return;
        }
        
        // Sort groups by ID (which is their number)
        const sortedGroups = [...this.broadcastGroups].sort((a, b) => a.id - b.id);
        
        sortedGroups.forEach((group, index) => {
            const groupItem = document.createElement('div');
            groupItem.className = 'comm-broadcast-group-item';
            if (this.selectedBroadcastGroup === group.id) {
                groupItem.classList.add('active');
            }
            groupItem.setAttribute('data-group-id', group.id);
            
            // Badge with group number
            const badge = document.createElement('span');
            badge.className = 'comm-broadcast-group-badge';
            badge.textContent = group.id;
            groupItem.appendChild(badge);
            
            // Group name
            const name = document.createElement('span');
            name.className = 'comm-broadcast-group-name';
            name.textContent = group.name;
            groupItem.appendChild(name);
            
            // Click handler (single click - select group)
            groupItem.addEventListener('click', () => {
                this.selectedBroadcastGroup = group.id;
                this.renderBroadcastGroups();
                this.renderBroadcastHistory();
            });
            
            // Double-click handler (open management modal)
            groupItem.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.showGroupManagementModal(group.id, group.name);
            });
            
            this.broadcastGroupsList.appendChild(groupItem);
        });
    }
    
    /**
     * Render broadcast message history for selected group
     */
    renderBroadcastHistory() {
        if (!this.broadcastChatContent) return;
        
        if (!this.selectedBroadcastGroup) {
            this.broadcastChatContent.innerHTML = '<div class="comm-empty">Select a group to view messages</div>';
            return;
        }
        
        const messages = this.commHistory.broadcast[this.selectedBroadcastGroup] || [];
        
        if (messages.length === 0) {
            this.broadcastChatContent.innerHTML = '<div class="comm-empty">No messages yet</div>';
        } else {
            this.broadcastChatContent.innerHTML = '';
            
            messages.forEach(msg => {
                const msgDiv = document.createElement('div');
                msgDiv.className = 'comm-message';
                
                const displayText = `${this.cleanPlayerName(msg.playerName)}: ${msg.message}`;
                
                // Parse markup in messages
                const parts = displayText.split(': ');
                if (parts.length > 1) {
                    const playerPart = parts[0] + ': ';
                    const messagePart = parts.slice(1).join(': ');
                    msgDiv.innerHTML = this.escapeHtml(playerPart) + parseMarkup(messagePart, '#00ffff');
                } else {
                    msgDiv.innerHTML = parseMarkup(displayText, '#00ffff');
                }
                this.broadcastChatContent.appendChild(msgDiv);
            });
        }
        
        // Scroll to bottom
        const scrollContainer = this.broadcastChatContent.closest('.comm-chat-container');
        if (scrollContainer) {
            setTimeout(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }, 0);
        }
    }
    
    /**
     * Handle broadcast message
     */
    handleBroadcast(data) {
        const { groupId, groupName, playerName, message } = data;
        if (groupId && playerName && message) {
            if (!this.commHistory.broadcast[groupId]) {
                this.commHistory.broadcast[groupId] = [];
            }
            
            this.commHistory.broadcast[groupId].push({
                playerName,
                message,
                timestamp: Date.now()
            });
            
            // Keep only last 500 messages per group
            if (this.commHistory.broadcast[groupId].length > 500) {
                this.commHistory.broadcast[groupId] = this.commHistory.broadcast[groupId].slice(-500);
            }
            
            // Render if this is the selected group
            if (this.commMode === 'broadcast' && this.selectedBroadcastGroup === groupId) {
                this.renderBroadcastHistory();
            }
            
            this.saveCommsHistory();
        }
    }
    
    /**
     * Send broadcast message
     */
    sendBroadcastMessage() {
        const input = this.broadcastInput || this.commInput;
        if (!input || !input.value.trim()) return;
        if (!this.selectedBroadcastGroup) {
            if (window.terminal) {
                window.terminal.addMessage('Please select a broadcast group first.', 'error');
            }
            return;
        }
        
        const message = input.value.trim();
        const ws = this.game.getWebSocket();
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server.', 'error');
            }
            return;
        }
        
        this.game.send({
            type: 'broadcast',
            groupId: this.selectedBroadcastGroup,
            message: message
        });
        
        input.value = '';
    }
    
    /**
     * Show dialog to create a new broadcast group
     */
    showCreateGroupDialog() {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'broadcast-group-modal-overlay';
        overlay.id = 'broadcastGroupModal';
        
        const modal = document.createElement('div');
        modal.className = 'broadcast-group-modal';
        
        // Header
        const header = document.createElement('div');
        header.className = 'broadcast-group-modal-header';
        header.textContent = 'Create Broadcast Group';
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'broadcast-group-modal-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);
        modal.appendChild(header);
        
        // Content
        const content = document.createElement('div');
        content.className = 'broadcast-group-modal-content';
        
        // Group name input
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Group Name:';
        nameLabel.className = 'broadcast-group-modal-label';
        content.appendChild(nameLabel);
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'widget-input';
        nameInput.id = 'broadcastGroupNameInput';
        nameInput.placeholder = 'Enter group name...';
        content.appendChild(nameInput);
        
        // Players section
        const playersLabel = document.createElement('label');
        playersLabel.textContent = 'Add Members (required):';
        playersLabel.className = 'broadcast-group-modal-label';
        playersLabel.style.marginTop = '16px';
        content.appendChild(playersLabel);
        
        // Dropdown and Add button container
        const addMemberContainer = document.createElement('div');
        addMemberContainer.className = 'broadcast-group-add-member';
        addMemberContainer.style.display = 'flex';
        addMemberContainer.style.gap = '8px';
        addMemberContainer.style.marginBottom = '12px';
        
        // Player dropdown
        const playerSelect = document.createElement('select');
        playerSelect.className = 'widget-select';
        playerSelect.id = 'broadcastGroupPlayerSelect';
        playerSelect.style.flex = '1';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a player...';
        playerSelect.appendChild(defaultOption);
        addMemberContainer.appendChild(playerSelect);
        
        // Add button
        const addBtn = document.createElement('button');
        addBtn.className = 'widget-btn widget-btn-primary';
        addBtn.textContent = 'Add';
        addBtn.id = 'broadcastGroupAddBtn';
        addBtn.onclick = () => this.addMemberFromDropdown();
        addMemberContainer.appendChild(addBtn);
        
        content.appendChild(addMemberContainer);
        
        // Selected players display
        const selectedContainer = document.createElement('div');
        selectedContainer.className = 'broadcast-group-selected';
        selectedContainer.id = 'broadcastGroupSelected';
        content.appendChild(selectedContainer);
        
        modal.appendChild(content);
        
        // Footer with buttons
        const footer = document.createElement('div');
        footer.className = 'broadcast-group-modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'widget-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => overlay.remove();
        footer.appendChild(cancelBtn);
        
        const createBtn = document.createElement('button');
        createBtn.className = 'widget-btn widget-btn-primary';
        createBtn.textContent = 'Create Group';
        createBtn.id = 'broadcastGroupCreateBtn';
        createBtn.disabled = true; // Disabled until at least one member is added
        createBtn.onclick = () => this.submitCreateGroup(nameInput.value.trim(), overlay);
        footer.appendChild(createBtn);
        
        modal.appendChild(footer);
        overlay.appendChild(modal);
        
        // Close on overlay click (but not on modal click)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        // Handle Enter key on name input (only if dropdown is not focused)
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // If members are selected, create group; otherwise just focus dropdown
                if (this.selectedPlayerIds && this.selectedPlayerIds.size > 0) {
                    createBtn.click();
                } else {
                    playerSelect.focus();
                }
            }
        });
        
        // Handle Enter key on player select to add member
        playerSelect.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && playerSelect.value) {
                e.preventDefault();
                addBtn.click();
            }
        });
        
        // Add to body
        document.body.appendChild(overlay);
        
        // Focus name input
        setTimeout(() => nameInput.focus(), 100);
        
        // Initialize selected players set
        this.selectedPlayerIds = new Set();
        this.selectedPlayersList = []; // Array to maintain order
        
        // Store select reference
        this.modalPlayerSelect = playerSelect;
        
        // If we already have players loaded, render them immediately
        if (this.allPlayers && this.allPlayers.length > 0) {
            console.log('[CommsWidget] Players already loaded, rendering immediately');
            this.renderPlayersList(this.allPlayers);
        } else {
            // Load all players
            this.loadAllPlayersForModal();
        }
    }
    
    /**
     * Load all players for the modal
     */
    loadAllPlayersForModal() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server.', 'error');
            }
            return;
        }
        
        console.log('[CommsWidget] Requesting all players for broadcast modal');
        
        // Request all players
        this.game.send({
            type: 'getAllPlayersForBroadcast'
        });
    }
    
    /**
     * Add member from dropdown
     */
    addMemberFromDropdown() {
        const select = document.getElementById('broadcastGroupPlayerSelect');
        if (!select || !select.value) {
            return;
        }
        
        const playerId = parseInt(select.value, 10);
        if (!playerId || isNaN(playerId)) {
            return;
        }
        
        // Find player in allPlayers
        if (!this.allPlayers) return;
        const player = this.allPlayers.find(p => p.id === playerId);
        if (!player) return;
        
        // Check if already added
        if (this.selectedPlayerIds.has(playerId)) {
            if (window.terminal) {
                window.terminal.addMessage(`${player.name.replace(/^@|@$/g, '')} is already in the list.`, 'error');
            }
            return;
        }
        
        // Add to selected
        this.selectedPlayerIds.add(playerId);
        this.selectedPlayersList.push(player);
        
        // Update display
        this.updateSelectedPlayersDisplay();
        
        // Enable create button if we have at least one member
        const createBtn = document.getElementById('broadcastGroupCreateBtn');
        if (createBtn) {
            createBtn.disabled = false;
        }
        
        // Refresh dropdown (remove added player from options)
        this.renderPlayersList(this.allPlayers);
        
        // Reset dropdown selection
        select.value = '';
        select.focus();
    }
    
    
    /**
     * Update selected players display
     */
    updateSelectedPlayersDisplay() {
        const container = document.getElementById('broadcastGroupSelected');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.selectedPlayersList || this.selectedPlayersList.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        const label = document.createElement('div');
        label.className = 'broadcast-group-modal-label';
        label.textContent = `Members (${this.selectedPlayersList.length}):`;
        container.appendChild(label);
        
        const selectedList = document.createElement('div');
        selectedList.className = 'broadcast-group-selected-list';
        
        this.selectedPlayersList.forEach((player, index) => {
            const chip = document.createElement('div');
            chip.className = 'broadcast-group-selected-chip';
            chip.textContent = player.name.replace(/^@|@$/g, '');
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'broadcast-group-chip-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = () => {
                this.selectedPlayerIds.delete(player.id);
                this.selectedPlayersList.splice(index, 1);
                this.updateSelectedPlayersDisplay();
                
                // Disable create button if no members left
                const createBtn = document.getElementById('broadcastGroupCreateBtn');
                if (createBtn) {
                    createBtn.disabled = this.selectedPlayersList.length === 0;
                }
                
                // Refresh dropdown to add removed player back
                if (this.allPlayers) {
                    this.renderPlayersList(this.allPlayers);
                }
            };
            chip.appendChild(removeBtn);
            selectedList.appendChild(chip);
        });
        
        container.appendChild(selectedList);
    }
    
    /**
     * Submit create group form
     */
    submitCreateGroup(groupName, overlay) {
        if (!groupName || !groupName.trim()) {
            if (window.terminal) {
                window.terminal.addMessage('Group name is required.', 'error');
            }
            return;
        }
        
        // Validate at least one member is selected
        if (!this.selectedPlayerIds || this.selectedPlayerIds.size === 0) {
            if (window.terminal) {
                window.terminal.addMessage('At least one member is required to create a group.', 'error');
            }
            return;
        }
        
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server.', 'error');
            }
            return;
        }
        
        const memberIds = Array.from(this.selectedPlayerIds);
        
        this.game.send({
            type: 'createBroadcastGroup',
            name: groupName.trim(),
            memberIds: memberIds
        });
        
        // Clean up
        this.selectedPlayerIds = null;
        this.selectedPlayersList = null;
        this.allPlayers = null;
        this.modalPlayerSelect = null;
        overlay.remove();
    }
    
    /**
     * Show group management modal
     */
    showGroupManagementModal(groupId, groupName) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'broadcast-group-modal-overlay';
        overlay.id = 'broadcastGroupManageModal';
        
        const modal = document.createElement('div');
        modal.className = 'broadcast-group-modal';
        
        // Header
        const header = document.createElement('div');
        header.className = 'broadcast-group-modal-header';
        header.textContent = `Manage Group: ${groupName}`;
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'broadcast-group-modal-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);
        modal.appendChild(header);
        
        // Content
        const content = document.createElement('div');
        content.className = 'broadcast-group-modal-content';
        
        // Current members section
        const membersLabel = document.createElement('label');
        membersLabel.textContent = 'Current Members:';
        membersLabel.className = 'broadcast-group-modal-label';
        content.appendChild(membersLabel);
        
        const membersList = document.createElement('div');
        membersList.className = 'broadcast-group-members-list';
        membersList.id = 'broadcastGroupMembersList';
        content.appendChild(membersList);
        
        // Add member section
        const addLabel = document.createElement('label');
        addLabel.textContent = 'Add Member:';
        addLabel.className = 'broadcast-group-modal-label';
        addLabel.style.marginTop = '16px';
        content.appendChild(addLabel);
        
        const addMemberContainer = document.createElement('div');
        addMemberContainer.className = 'broadcast-group-add-member';
        addMemberContainer.style.display = 'flex';
        addMemberContainer.style.gap = '8px';
        addMemberContainer.style.marginBottom = '12px';
        
        const playerSelect = document.createElement('select');
        playerSelect.className = 'widget-select';
        playerSelect.id = 'broadcastGroupManagePlayerSelect';
        playerSelect.style.flex = '1';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a player...';
        playerSelect.appendChild(defaultOption);
        addMemberContainer.appendChild(playerSelect);
        
        const addBtn = document.createElement('button');
        addBtn.className = 'widget-btn widget-btn-primary';
        addBtn.textContent = 'Add';
        addBtn.id = 'broadcastGroupManageAddBtn';
        addBtn.onclick = () => this.addMemberToGroup(groupId, playerSelect.value);
        addMemberContainer.appendChild(addBtn);
        
        content.appendChild(addMemberContainer);
        
        modal.appendChild(content);
        
        // Footer with buttons
        const footer = document.createElement('div');
        footer.className = 'broadcast-group-modal-footer';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'widget-btn widget-btn-danger';
        deleteBtn.textContent = 'Delete Group';
        deleteBtn.onclick = () => this.deleteGroup(groupId, groupName, overlay);
        footer.appendChild(deleteBtn);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'widget-btn';
        cancelBtn.textContent = 'Close';
        cancelBtn.onclick = () => overlay.remove();
        footer.appendChild(cancelBtn);
        
        modal.appendChild(footer);
        overlay.appendChild(modal);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        // Add to body
        document.body.appendChild(overlay);
        
        // Load group members
        this.loadGroupMembers(groupId, membersList, playerSelect);
    }
    
    /**
     * Load group members for management modal
     */
    loadGroupMembers(groupId, membersList, playerSelect) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        // Request group members
        this.game.send({
            type: 'getBroadcastGroupMembers',
            groupId: groupId
        });
        
        // Store references for when data arrives
        this.manageModalMembersList = membersList;
        this.manageModalPlayerSelect = playerSelect;
        this.manageModalGroupId = groupId;
        
        // Also request all players if not loaded (for add member dropdown)
        if (!this.allPlayers) {
            this.loadAllPlayersForModal();
        } else {
            // If we have members already, render the dropdown
            // (will be updated when members arrive)
        }
    }
    
    /**
     * Add member to group from management modal
     */
    addMemberToGroup(groupId, playerIdStr) {
        if (!playerIdStr || playerIdStr === '') {
            if (window.terminal) {
                window.terminal.addMessage('Please select a player.', 'error');
            }
            return;
        }
        
        const playerId = parseInt(playerIdStr, 10);
        if (!playerId || isNaN(playerId)) {
            return;
        }
        
        // Find player name
        if (!this.allPlayers) {
            // Request players if not loaded
            this.loadAllPlayersForModal();
            if (window.terminal) {
                window.terminal.addMessage('Loading players, please try again.', 'info');
            }
            return;
        }
        
        const player = this.allPlayers.find(p => p.id === playerId);
        if (!player) {
            if (window.terminal) {
                window.terminal.addMessage('Player not found.', 'error');
            }
            return;
        }
        
        const playerName = player.name.replace(/^@|@$/g, '');
        const groupName = document.querySelector('#broadcastGroupManageModal .broadcast-group-modal-header').textContent.replace('Manage Group: ', '');
        
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server.', 'error');
            }
            return;
        }
        
        this.game.send({
            type: 'addToBroadcastGroup',
            groupName: groupName,
            playerName: playerName
        });
        
        // Reset dropdown
        const select = document.getElementById('broadcastGroupManagePlayerSelect');
        if (select) {
            select.value = '';
        }
    }
    
    /**
     * Remove member from group
     */
    removeMemberFromGroup(groupId, playerId, playerName) {
        const groupName = document.querySelector('#broadcastGroupManageModal .broadcast-group-modal-header').textContent.replace('Manage Group: ', '');
        
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server.', 'error');
            }
            return;
        }
        
        this.game.send({
            type: 'removeFromBroadcastGroup',
            groupName: groupName,
            playerName: playerName
        });
    }
    
    /**
     * Delete broadcast group
     */
    deleteGroup(groupId, groupName, overlay) {
        // Create confirmation modal
        const confirmOverlay = document.createElement('div');
        confirmOverlay.className = 'broadcast-group-modal-overlay';
        
        const confirmModal = document.createElement('div');
        confirmModal.className = 'broadcast-group-modal';
        confirmModal.style.minWidth = '400px';
        
        // Header
        const header = document.createElement('div');
        header.className = 'broadcast-group-modal-header';
        header.textContent = 'Delete Group';
        confirmModal.appendChild(header);
        
        // Content
        const content = document.createElement('div');
        content.className = 'broadcast-group-modal-content';
        content.style.textAlign = 'center';
        
        const message = document.createElement('div');
        message.style.color = '#ff0000';
        message.style.marginBottom = '16px';
        message.innerHTML = `Are you sure you want to delete<br/><strong>${groupName}</strong>?<br/><br/>This cannot be undone.`;
        content.appendChild(message);
        
        confirmModal.appendChild(content);
        
        // Footer
        const footer = document.createElement('div');
        footer.className = 'broadcast-group-modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'widget-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => confirmOverlay.remove();
        footer.appendChild(cancelBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'widget-btn widget-btn-danger';
        deleteBtn.textContent = 'Delete Group';
        deleteBtn.onclick = () => {
            const ws = this.game.getWebSocket();
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                if (window.terminal) {
                    window.terminal.addMessage('Not connected to server.', 'error');
                }
                confirmOverlay.remove();
                return;
            }
            
            this.game.send({
                type: 'deleteBroadcastGroup',
                groupId: groupId
            });
            
            confirmOverlay.remove();
            overlay.remove();
        };
        footer.appendChild(deleteBtn);
        
        confirmModal.appendChild(footer);
        confirmOverlay.appendChild(confirmModal);
        
        // Close on overlay click
        confirmOverlay.addEventListener('click', (e) => {
            if (e.target === confirmOverlay) {
                confirmOverlay.remove();
            }
        });
        
        document.body.appendChild(confirmOverlay);
    }
    
    /**
     * Render group members in management modal
     */
    renderGroupMembers(members) {
        if (!this.manageModalMembersList) return;
        
        this.manageModalMembersList.innerHTML = '';
        
        if (!members || members.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'comm-empty';
            empty.textContent = 'No members';
            this.manageModalMembersList.appendChild(empty);
        } else {
            members.forEach(member => {
                const memberItem = document.createElement('div');
                memberItem.className = 'broadcast-group-member-item';
                
                const name = document.createElement('span');
                name.textContent = member.name.replace(/^@|@$/g, '');
                name.className = 'broadcast-group-member-name';
                memberItem.appendChild(name);
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'widget-btn widget-btn-danger widget-btn-small';
                removeBtn.textContent = 'Remove';
                removeBtn.onclick = () => {
                    this.removeMemberFromGroup(this.manageModalGroupId, member.id, member.name);
                };
                memberItem.appendChild(removeBtn);
                
                this.manageModalMembersList.appendChild(memberItem);
            });
        }
        
        // Refresh player dropdown to exclude current members
        if (this.allPlayers && this.manageModalPlayerSelect) {
            this.renderManageModalPlayerSelect(this.allPlayers, members || []);
        } else if (this.manageModalPlayerSelect) {
            // Request players if not loaded
            this.loadAllPlayersForModal();
        }
    }
    
    /**
     * Render player select for management modal
     */
    renderManageModalPlayerSelect(allPlayers, currentMembers) {
        if (!this.manageModalPlayerSelect) return;
        
        // Clear existing options (except default)
        while (this.manageModalPlayerSelect.children.length > 1) {
            this.manageModalPlayerSelect.removeChild(this.manageModalPlayerSelect.lastChild);
        }
        
        if (!allPlayers || allPlayers.length === 0) {
            return;
        }
        
        // Get current player name to exclude
        const currentPlayerName = this.game.getPlayerName();
        const currentMemberIds = new Set(currentMembers.map(m => m.id));
        
        // Filter out current player and existing members
        const filtered = allPlayers.filter(p => {
            const playerName = (p.name || '').replace(/^@|@$/g, '');
            const currentName = (currentPlayerName || '').replace(/^@|@$/g, '');
            return playerName.toLowerCase() !== currentName.toLowerCase() && 
                   !currentMemberIds.has(p.id);
        });
        
        const sorted = filtered.sort((a, b) => {
            const nameA = (a.name || '').replace(/^@|@$/g, '').toLowerCase();
            const nameB = (b.name || '').replace(/^@|@$/g, '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        if (sorted.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'All players already in group';
            option.disabled = true;
            this.manageModalPlayerSelect.appendChild(option);
            return;
        }
        
        sorted.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.name.replace(/^@|@$/g, '');
            this.manageModalPlayerSelect.appendChild(option);
        });
    }
}
