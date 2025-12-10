/**
 * EditorBase - Unified WebSocket lifecycle management for all editors
 * 
 * Provides a consistent authentication flow for map editor, item editor,
 * NPC editor, player editor, and crafting editor.
 * 
 * Usage:
 *   import { EditorBase } from './js/editorShared/EditorBase.js';
 *   
 *   EditorBase.init({
 *     onReady: (socket) => {
 *       // Socket is authenticated and ready - request data here
 *       socket.send(JSON.stringify({ type: 'getFactoryRecipes' }));
 *       socket.send(JSON.stringify({ type: 'getAllItems' }));
 *     },
 *     onMessage: (data) => {
 *       // Handle messages from server (optional)
 *       // If not provided, EditorBase will just pass messages through
 *     },
 *     onError: (error) => {
 *       // Handle errors (optional)
 *     }
 *   });
 * 
 * The socket will automatically:
 * - Connect to WebSocket server
 * - Send authenticateSession with isEditor: true
 * - Wait for sessionAuthenticated message
 * - Call onReady callback when authenticated
 * - Handle reconnection on disconnect (unless navigating away)
 */

export const EditorBase = {
    socket: null,
    isNavigatingAway: false,
    reconnectTimeout: null,
    onReadyCallback: null,
    onMessageCallback: null,
    onErrorCallback: null,

    /**
     * Initialize the editor WebSocket connection
     * @param {Object} options
     * @param {Function} options.onReady - Callback when socket is authenticated: (socket) => void
     * @param {Function} [options.onMessage] - Optional message handler: (data) => void
     * @param {Function} [options.onError] - Optional error handler: (error) => void
     */
    init(options = {}) {
        const { onReady, onMessage = null, onError = null } = options;

        if (!onReady || typeof onReady !== 'function') {
            throw new Error('EditorBase.init() requires onReady callback function');
        }

        this.onReadyCallback = onReady;
        this.onMessageCallback = onMessage;
        this.onErrorCallback = onError;
        this.isNavigatingAway = false;

        this.connect();
    },

    /**
     * Connect to WebSocket server
     */
    connect() {
        const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsUrl = wsProtocol + location.host;

        this.socket = new WebSocket(wsUrl);

        this.socket.addEventListener('open', () => {
            console.log('[EditorBase] WebSocket connected');
            // Authenticate with session, marking this as an editor connection
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ 
                    type: 'authenticateSession',
                    isEditor: true
                }));
            }
        });

        this.socket.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            
            // Handle sessionAuthenticated message
            if (data.type === 'sessionAuthenticated') {
                console.log('[EditorBase] Session authenticated, editor ready');
                if (this.onReadyCallback) {
                    this.onReadyCallback(this.socket);
                }
                return;
            }

            // Handle errors
            if (data.type === 'error') {
                console.error('[EditorBase] Server error:', data.message);
                if (this.onErrorCallback) {
                    this.onErrorCallback(new Error(data.message));
                }
                return;
            }

            // Pass through other messages to custom handler if provided
            if (this.onMessageCallback) {
                this.onMessageCallback(data);
            }
        });

        this.socket.addEventListener('error', (error) => {
            console.error('[EditorBase] WebSocket error:', error);
            if (this.onErrorCallback) {
                this.onErrorCallback(error);
            }
        });

        this.socket.addEventListener('close', () => {
            console.log('[EditorBase] WebSocket disconnected');
            this.socket = null;
            
            // Auto-reconnect unless we're intentionally navigating away
            if (!this.isNavigatingAway) {
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                }
                this.reconnectTimeout = setTimeout(() => {
                    this.connect();
                }, 3000);
            }
        });
    },

    /**
     * Get the current socket (may be null if not connected)
     * @returns {WebSocket|null}
     */
    getSocket() {
        return this.socket;
    },

    /**
     * Send a message through the socket
     * @param {Object} message - Message object to send
     */
    send(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.warn('[EditorBase] Cannot send message - socket not ready');
        }
    },

    /**
     * Mark that we're navigating away (prevents auto-reconnect)
     */
    setNavigatingAway(value = true) {
        this.isNavigatingAway = value;
        if (value && this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    },

    /**
     * Close the connection
     */
    close() {
        this.setNavigatingAway(true);
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
};

export default EditorBase;


