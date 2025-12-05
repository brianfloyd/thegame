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
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            
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
            
            // Emit disconnect event
            this.messageBus.emit('game:disconnected', {});
            
            // If restart was requested, redirect to character selection
            if (this.restartRequested) {
                this.restartRequested = false;
                window.location.href = '/';
                return;
            }
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.connect(), 3000);
        };
    }
    
    /**
     * Handle messages from server and route to MessageBus
     */
    handleMessage(data) {
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
                this.messageBus.emit('jump:rooms', {
                    rooms: data.rooms
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
                
            case 'pathDetails':
                this.messageBus.emit('paths:details', {
                    path: data.path,
                    steps: data.steps
                });
                break;
                
            case 'pathExecutionStarted':
                this.messageBus.emit('paths:executionStarted', {
                    message: data.message
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
}

