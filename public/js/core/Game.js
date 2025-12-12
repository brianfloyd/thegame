/**
 * Game - Main game controller
 * 
 * Manages WebSocket connection, message routing, and global game state.
 * Dispatches events to components via MessageBus.
 */

import MessageBus from './MessageBus.js';

export default class Game {
    constructor() {
        this.messageBus = MessageBus;
        this.ws = null;
        this.currentPlayerName = null;
        this.currentRoomId = null;
        this.restartRequested = false;
        
        // Popup window tracking
        this.isPopupWindow = false;
        this.windowId = null;
        this.parentWindow = null;
        this.heartbeatInterval = null;
        
        // Tab ID for session tracking
        this.tabId = this.getOrCreateTabId();
        
        // WebSocket URL
        this.wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        this.wsUrl = this.wsProtocol + location.host;
        
        // Track if disconnect message has been shown (to prevent endless messages)
        this.disconnectMessageShown = false;
        
        // Track reconnection state to prevent multiple simultaneous reconnection attempts
        this.reconnectTimer = null;
        this.isReconnecting = false;
        
        // Debug observer state
        this.activeDebugSession = null;
        this.debugHooksInitialized = false;
        this.debugStateInterval = null;
        
        // Initialize popup detection
        this.initPopupDetection();
        
        // Override fetch to include tab ID
        this.setupFetchOverride();
    }
    
    /**
     * Get or create unique tab ID
     */
    getOrCreateTabId() {
        let tabId = sessionStorage.getItem('gameTabId');
        if (!tabId) {
            tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('gameTabId', tabId);
        }
        return tabId;
    }
    
    /**
     * Override fetch to include tab ID in all requests
     */
    setupFetchOverride() {
        const originalFetch = window.fetch;
        const tabId = this.tabId;
        window.fetch = function(...args) {
            const [url, options = {}] = args;
            if (!options.headers) {
                options.headers = {};
            }
            if (options.headers instanceof Headers) {
                options.headers.set('X-Tab-ID', tabId);
            } else if (typeof options.headers === 'object') {
                options.headers['X-Tab-ID'] = tabId;
            }
            return originalFetch.apply(this, args);
        };
    }
    
    /**
     * Initialize popup window detection and communication
     */
    initPopupDetection() {
        const urlParams = new URLSearchParams(window.location.search);
        const isPopup = urlParams.get('popup') === 'true';
        const popupWindowId = urlParams.get('windowId');
        const popupPlayerName = urlParams.get('playerName');
        
        if (isPopup && window.opener) {
            this.isPopupWindow = true;
            this.windowId = popupWindowId;
            this.parentWindow = window.opener;
            
            // Notify parent that window is open
            this.parentWindow.postMessage({
                type: 'WINDOW_OPENED',
                playerName: popupPlayerName,
                windowId: this.windowId
            }, window.location.origin);
            
            // Set up heartbeat
            this.heartbeatInterval = setInterval(() => {
                if (this.parentWindow && !this.parentWindow.closed) {
                    this.parentWindow.postMessage({
                        type: 'WINDOW_HEARTBEAT',
                        playerName: popupPlayerName,
                        windowId: this.windowId
                    }, window.location.origin);
                } else {
                    if (this.heartbeatInterval) {
                        clearInterval(this.heartbeatInterval);
                        this.heartbeatInterval = null;
                    }
                }
            }, 2000);
            
            // Listen for close requests from parent
            window.addEventListener('message', (event) => {
                if (event.origin !== window.location.origin) return;
                
                const { type, playerName: msgPlayerName } = event.data;
                if (type === 'WINDOW_CLOSE_REQUEST' && msgPlayerName === popupPlayerName) {
                    window.close();
                }
            });
            
            // Notify parent when window is closing
            window.addEventListener('beforeunload', () => {
                if (this.parentWindow && !this.parentWindow.closed) {
                    this.parentWindow.postMessage({
                        type: 'WINDOW_CLOSED',
                        playerName: popupPlayerName,
                        windowId: this.windowId
                    }, window.location.origin);
                }
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
            });
        }
    }
    
    /**
     * Connect to WebSocket server
     */
    connect() {
        // Don't connect if already connecting/connected (unless it's actually closed)
        if (this.isReconnecting) {
            return;
        }
        
        // Don't connect if we already have an active connection
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }
        
        // Clean up any existing WebSocket connection
        if (this.ws) {
            // Remove all event handlers to prevent duplicate handlers
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            
            // Close if not already closed
            if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
                this.ws.close();
            }
            this.ws = null;
        }
        
        // Cancel any pending reconnection timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.isReconnecting = true;
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            
            // Reset flags on successful connection
            this.disconnectMessageShown = false;
            this.isReconnecting = false;
            
            // Emit connection event
            this.messageBus.emit('game:connected', {
                ws: this.ws,
                playerName: this.currentPlayerName
            });
            
            // Authenticate with session
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ 
                    type: 'authenticateSession',
                    windowId: this.windowId || null
                }));
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (err) {
                console.error('[Game] Error parsing WebSocket message:', err, event.data);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isReconnecting = false;
            
            // Only emit disconnect event once per disconnect session (prevents endless messages)
            if (!this.disconnectMessageShown) {
                this.disconnectMessageShown = true;
                this.messageBus.emit('game:disconnected', {});
            }
            
            // If restart was requested, redirect to character selection
            if (this.restartRequested) {
                this.restartRequested = false;
                window.location.href = '/';
                return;
            }
            
            // Only schedule reconnection if we don't already have one scheduled
            if (!this.reconnectTimer) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    this.connect();
                }, 3000);
            }
        };
    }
    
    /**
     * Handle messages from server and route to MessageBus
     */
    handleMessage(data) {
        // Log unhandled message types for debugging
        if (!data || !data.type) {
            console.warn('[Game] Received message without type:', data);
            return;
        }
        
        switch (data.type) {
            case 'roomUpdate':
                this.currentRoomId = data.room?.id || null;
                this.messageBus.emit('room:update', {
                    room: data.room,
                    players: data.players,
                    exits: data.exits,
                    npcs: data.npcs,
                    roomItems: data.roomItems,
                    showFullInfo: data.showFullInfo,
                    messages: data.messages,
                    factoryWidgetState: data.factoryWidgetState,
                    warehouseWidgetState: data.warehouseWidgetState,
                    hasWarehouseDeed: data.hasWarehouseDeed
                });
                break;
                
            case 'moved':
                this.currentRoomId = data.room?.id || null;
                this.messageBus.emit('room:moved', {
                    room: data.room,
                    players: data.players,
                    exits: data.exits,
                    npcs: data.npcs,
                    roomItems: data.roomItems,
                    showFullInfo: data.showFullInfo,
                    messages: data.messages,
                    factoryWidgetState: data.factoryWidgetState,
                    warehouseWidgetState: data.warehouseWidgetState
                });
                break;
                
            case 'factoryWidgetState':
                // Direct factory widget state update
                this.messageBus.emit('factoryWidgetState', {
                    state: data.state
                });
                break;
            
            case 'factoryCraftStarted':
                this.messageBus.emit('factoryCraftStarted', {
                    recipeName: data.recipeName,
                    craftTimeMs: data.craftTimeMs,
                    successRate: data.successRate,
                    critChance: data.critChance
                });
                break;
            
            case 'factoryCraftComplete':
                this.messageBus.emit('factoryCraftComplete', {
                    success: data.success,
                    critical: data.critical,
                    recipeName: data.recipeName,
                    outputs: data.outputs,
                    byproducts: data.byproducts,
                    message: data.message,
                    returnedIngredients: data.returnedIngredients,
                    wornTriggered: data.wornTriggered
                });
                break;
            
            case 'factoryCraftFizzle':
                this.messageBus.emit('factoryCraftFizzle', {
                    message: data.message
                });
                break;
                
            case 'playerJoined':
                this.messageBus.emit('player:joined', {
                    playerName: data.playerName,
                    direction: data.direction,
                    message: data.message
                });
                break;
                
            case 'playerLeft':
                this.messageBus.emit('player:left', {
                    playerName: data.playerName,
                    direction: data.direction,
                    message: data.message
                });
                break;
                
            case 'resonated':
                this.messageBus.emit('resonated', {
                    playerName: data.playerName,
                    message: data.message
                });
                break;
                
            case 'talked':
                this.messageBus.emit('talked', {
                    playerName: data.playerName,
                    message: data.message
                });
                break;
                
            case 'telepath':
                this.messageBus.emit('telepath', {
                    fromPlayer: data.fromPlayer,
                    message: data.message
                });
                break;
                
            case 'telepathSent':
                this.messageBus.emit('telepathSent', {
                    toPlayer: data.toPlayer,
                    message: data.message
                });
                break;
                
            case 'systemMessage':
                this.messageBus.emit('system:message', {
                    message: data.message
                });
                break;
                
            case 'zorkTicketCreated':
                this.messageBus.emit('zorkTicketCreated', data);
                break;
                
            case 'ticketsList':
                this.messageBus.emit('ticketsList', data);
                break;
                
            case 'ticketUpdated':
                this.messageBus.emit('ticketUpdated', data);
                break;
                
            case 'ticketFeedbackAdded':
                this.messageBus.emit('ticketFeedbackAdded', data);
                break;
                
            case 'error':
                // Route errors to appropriate handlers
                this.messageBus.emit('ticket:error', data);
                this.messageBus.emit('terminal:error', {
                    message: data.message
                });
                break;
                
            case 'loreKeeperMessage':
                this.messageBus.emit('loreKeeper:message', {
                    npcName: data.npcName,
                    npcColor: data.npcColor,
                    message: data.message,
                    messageColor: data.messageColor,
                    isSuccess: data.isSuccess,
                    isFailure: data.isFailure,
                    keywordColor: data.keywordColor
                });
                break;
                
            case 'playerStats':
                if (data.stats?.playerName) {
                    this.currentPlayerName = data.stats.playerName;
                    document.title = `The Game - ${data.stats.playerName}`;
                    this.messageBus.emit('player:authenticated', {
                        playerName: this.currentPlayerName
                    });
                }
                // Update vitalis counter in command line
                if (data.stats) {
                    const vitalisStat = data.stats.vitalis;
                    const maxVitalisStat = data.stats.maxVitalis;
                    if (vitalisStat !== undefined && maxVitalisStat !== undefined) {
                        const vitalisCounter = document.getElementById('vitalisCounter');
                        if (vitalisCounter) {
                            const vitalisValue = vitalisStat.value !== undefined ? vitalisStat.value : vitalisStat;
                            const maxVitalisValue = maxVitalisStat.value !== undefined ? maxVitalisStat.value : maxVitalisStat;
                            vitalisCounter.textContent = `[${vitalisValue || 0} / ${maxVitalisValue || 100}]`;
                        }
                    }
                }
                this.messageBus.emit('player:stats', {
                    stats: data.stats
                });
                break;
                
            case 'mapData':
                this.messageBus.emit('map:data', {
                    rooms: data.rooms,
                    currentRoom: data.currentRoom,
                    mapId: data.mapId,
                    roomTypeColors: data.roomTypeColors
                });
                break;
                
            case 'mapUpdate':
                this.messageBus.emit('map:update', {
                    currentRoom: data.currentRoom,
                    mapId: data.mapId
                });
                break;
                
            case 'inventoryList':
                this.messageBus.emit('inventory:update', {
                    items: data.items,
                    hasWarehouseDeed: data.hasWarehouseDeed
                });
                break;
                
            case 'message':
            case 'terminal:message':
                // Handle both 'message' (legacy) and 'terminal:message' (new universal router)
                this.messageBus.emit('terminal:message', {
                    message: data.message,
                    type: data.messageType || data.type || 'info',
                    html: data.html || null
                });
                break;
                
            case 'error':
                this.messageBus.emit('terminal:error', {
                    message: data.message
                });
                break;
                
            case 'merchantList':
                this.messageBus.emit('merchant:list', {
                    items: data.items
                });
                break;
                
            case 'terminalHistory':
                this.messageBus.emit('terminal:history', {
                    messages: data.messages
                });
                break;
                
            case 'forceClose':
                console.log('Force close requested:', data.message);
                if (data.message) {
                    this.messageBus.emit('terminal:error', {
                        message: data.message
                    });
                }
                setTimeout(() => {
                    if (this.isPopupWindow) {
                        window.close();
                    } else {
                        window.location.href = '/';
                    }
                }, 1000);
                break;
                
            // Widget config
            case 'widgetConfig':
                this.messageBus.emit('widget:config', {
                    config: data.config
                });
                break;
                
            // Path/Loop execution
            case 'pathExecutionStarted':
            case 'pathExecutionResumed':
            case 'pathExecutionComplete':
            case 'pathExecutionStopped':
            case 'pathExecutionFailed':
                this.messageBus.emit('path:execution', {
                    type: data.type,
                    message: data.message
                });
                break;
                
            // Auto-navigation
            case 'autoNavigationStarted':
            case 'autoNavigationComplete':
            case 'autoNavigationFailed':
                this.messageBus.emit('autoNavigation', {
                    type: data.type,
                    message: data.message
                });
                break;
                
            // Widget config
            case 'widgetConfig':
                this.messageBus.emit('widget:config', {
                    config: data.config
                });
                break;
                
            // Merchant list
            case 'merchantList':
                this.messageBus.emit('merchant:list', {
                    items: data.items
                });
                break;
                
            // Jump widget messages
            case 'jumpMaps':
                this.messageBus.emit('jump:maps', {
                    maps: data.maps
                });
                break;
                
            case 'jumpRooms':
                console.log('[Game] Received jumpRooms message, rooms count:', data.rooms ? data.rooms.length : 'undefined');
                this.messageBus.emit('jump:rooms', {
                    rooms: data.rooms || []
                });
                break;
                
            // Pathing mode messages
            case 'pathingModeStarted':
                this.messageBus.emit('pathing:modeStarted');
                break;
                
            case 'pathingRoom':
                this.messageBus.emit('pathing:room', {
                    room: data.room,
                    direction: data.direction
                });
                break;
                
            case 'pathSaved':
                this.messageBus.emit('pathing:saved', {
                    name: data.name,
                    pathType: data.pathType
                });
                break;
                
            // Auto-path messages
            case 'autoPathMaps':
                this.messageBus.emit('autopath:maps', {
                    maps: data.maps
                });
                break;
                
            case 'autoPathRooms':
                this.messageBus.emit('autopath:rooms', {
                    rooms: data.rooms
                });
                break;
                
            case 'autoPathCalculated':
                this.messageBus.emit('autopath:calculated', {
                    success: data.success,
                    path: data.path,
                    message: data.message
                });
                break;
                
            case 'autoNavigationStarted':
                this.messageBus.emit('autonav:started', {
                    message: data.message
                });
                break;
                
            case 'autoNavigationComplete':
                this.messageBus.emit('autonav:complete', {
                    message: data.message
                });
                break;
                
            case 'autoNavigationFailed':
                this.messageBus.emit('autonav:failed', {
                    message: data.message
                });
                break;
                
            // Path/Loop execution messages
            case 'allPlayerPaths':
                this.messageBus.emit('paths:all', {
                    paths: data.paths
                });
                break;
                
            case 'pathSaved':
                this.messageBus.emit('pathSaved', {
                    pathId: data.pathId,
                    name: data.name,
                    pathType: data.pathType
                });
                break;
                
            case 'pathDeleted':
                this.messageBus.emit('pathDeleted', {
                    pathId: data.pathId
                });
                break;
                
            case 'pathDetails':
                this.messageBus.emit('paths:details', {
                    path: data.path,
                    steps: data.steps
                });
                break;
                
            case 'pathExecutionStarted':
                this.messageBus.emit('paths:executionStarted', {
                    message: data.message,
                    stepCount: data.stepCount
                });
                break;
                
            case 'pathExecutionResumed':
                this.messageBus.emit('paths:executionResumed', {
                    message: data.message
                });
                break;
                
            case 'pathExecutionComplete':
                this.messageBus.emit('paths:executionComplete', {
                    message: data.message
                });
                break;
                
            case 'pathExecutionStopped':
                this.messageBus.emit('paths:executionStopped', {
                    message: data.message
                });
                break;
                
            case 'pathExecutionFailed':
                this.messageBus.emit('paths:executionFailed', {
                    message: data.message
                });
                break;
                
            // Debug observer messages
            case 'debugSessionStarted':
                this.activeDebugSession = {
                    id: data.sessionId,
                    bugLabel: data.bugLabel
                };
                this.initDebugHooks();
                this.messageBus.emit('system:message', {
                    message: `Debug observation started: "${data.bugLabel}"`
                });
                break;
                
            case 'debugSessionEnded':
                this.activeDebugSession = null;
                this.messageBus.emit('system:message', {
                    message: 'Debug observation ended.'
                });
                break;
                
            // Default: emit raw message for components that need it
            default:
                this.messageBus.emit('game:message', data);
                break;
        }
    }
    
    /**
     * Send message to server
     */
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, message not sent:', message);
        }
    }
    
    /**
     * Request server restart (god mode only)
     */
    requestRestart() {
        this.restartRequested = true;
        this.send({ type: 'restartServer' });
    }
    
    /**
     * Get current WebSocket connection
     */
    getWebSocket() {
        return this.ws;
    }
    
    /**
     * Get current player name
     */
    getPlayerName() {
        return this.currentPlayerName;
    }
    
    /**
     * Get current room ID
     */
    getRoomId() {
        return this.currentRoomId;
    }
    
    // ========================================================================
    // Debug Observer System
    // ========================================================================
    
    /**
     * Initialize debug hooks for telemetry streaming
     * Called when a debug session starts
     */
    initDebugHooks() {
        if (this.debugHooksInitialized) return;
        this.debugHooksInitialized = true;
        
        const self = this;
        
        // Hook console.error
        const originalError = console.error;
        console.error = function(...args) {
            originalError.apply(console, args);
            if (self.activeDebugSession) {
                self.sendDebugEvent('consoleError', {
                    args: args.map(a => {
                        try {
                            return String(a).substring(0, 500);
                        } catch (e) {
                            return '[unserializable]';
                        }
                    }).slice(0, 5),
                    stack: new Error().stack?.substring(0, 1000) || null
                });
            }
        };
        
        // Hook console.warn for additional context
        const originalWarn = console.warn;
        console.warn = function(...args) {
            originalWarn.apply(console, args);
            if (self.activeDebugSession) {
                self.sendDebugEvent('consoleWarn', {
                    args: args.map(a => {
                        try {
                            return String(a).substring(0, 500);
                        } catch (e) {
                            return '[unserializable]';
                        }
                    }).slice(0, 5)
                });
            }
        };
        
        // Hook window.onerror
        window.addEventListener('error', (event) => {
            if (self.activeDebugSession) {
                self.sendDebugEvent('windowError', {
                    message: event.message,
                    source: event.filename,
                    line: event.lineno,
                    col: event.colno
                });
            }
        });
        
        // Hook unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            if (self.activeDebugSession) {
                self.sendDebugEvent('unhandledRejection', {
                    reason: String(event.reason).substring(0, 500)
                });
            }
        });
        
        // Periodic state reporting (every 3 seconds)
        this.debugStateInterval = setInterval(() => {
            if (self.activeDebugSession) {
                self.sendDebugEvent('clientState', self.getClientState());
            }
        }, 3000);
        
        console.log('[Debug] Debug hooks initialized for session:', this.activeDebugSession?.id);
    }
    
    /**
     * Send a debug event to the server
     * @param {string} eventType - Type of event (consoleError, windowError, clientState)
     * @param {object} payload - Event data
     */
    sendDebugEvent(eventType, payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this.activeDebugSession) return;
        
        this.ws.send(JSON.stringify({
            type: 'clientDebugEvent',
            sessionId: this.activeDebugSession.id,
            eventType: eventType,
            payload: payload
        }));
    }
    
    /**
     * Get current client state for debug telemetry
     * @returns {object} Current state snapshot
     */
    getClientState() {
        return {
            currentRoomId: this.currentRoomId,
            currentPlayerName: this.currentPlayerName,
            visibleWidgets: this.getVisibleWidgets(),
            wsState: this.ws?.readyState,
            isPopupWindow: this.isPopupWindow,
            url: window.location.href,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get list of currently visible widgets
     * @returns {string[]} Array of widget class names
     */
    getVisibleWidgets() {
        const widgets = [];
        
        // Check for common widget containers
        const widgetSelectors = [
            '.stats-widget',
            '.map-widget', 
            '.compass-widget',
            '.comms-widget',
            '.inventory-panel',
            '.npc-widget',
            '.scripting-widget',
            '.factory-widget',
            '.warehouse-widget',
            '.rune-keeper-widget'
        ];
        
        widgetSelectors.forEach(selector => {
            const el = document.querySelector(selector);
            if (el && el.offsetParent !== null) {
                widgets.push(selector.replace('.', '').replace('-', '_'));
            }
        });
        
        // Also check for any element with 'widget' in class that's visible
        document.querySelectorAll('[class*="widget"]').forEach(w => {
            if (w.offsetParent !== null) {
                const className = w.className;
                if (!widgets.includes(className)) {
                    widgets.push(className);
                }
            }
        });
        
        return widgets;
    }
}

