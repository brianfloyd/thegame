/**
 * WidgetManager - Manages widget lifecycle and message routing
 * 
 * Only WidgetManager listens to game messages - widgets receive via onMessage() callback.
 * Widgets are dynamically created and attached to #widget-host container.
 */

// Static imports for all widgets (NO dynamic imports)
import StatsWidget from '../widgets/StatsWidget.js';
import MapWidget from '../widgets/MapWidget.js';
import CompassWidget from '../widgets/CompassWidget.js';
import CommsWidget from '../widgets/CommsWidget.js';
import NPCWidget from '../widgets/NPCWidget.js';
import FactoryWidget from '../widgets/FactoryWidget.js';
import TicketsWidget from '../widgets/TicketsWidget.js';
import AutomationWidget from '../widgets/AutomationWidget.js';
import GodModeWidget from '../widgets/GodModeWidget.js';
import WarehouseWidget from '../widgets/WarehouseWidget.js';
import RuneKeeperWidget from '../widgets/RuneKeeperWidget.js';

// Widget class mapping
const WIDGET_CLASSES = {
    stats: StatsWidget,
    map: MapWidget,
    compass: CompassWidget,
    comms: CommsWidget,
    npc: NPCWidget,
    factory: FactoryWidget,
    tickets: TicketsWidget,
    automation: AutomationWidget,
    godmode: GodModeWidget,
    warehouse: WarehouseWidget,
    runekeeper: RuneKeeperWidget
};

export default class WidgetManager {
    constructor(game, widgetsRegistry) {
        this.game = game;
        this.registry = widgetsRegistry;
        this.widgets = new Map(); // Map<id, WidgetInstance>
        this.widgetHost = null;
        this.toggleBar = null;
        this.activeWidgets = new Set(); // Set of widget IDs that are toggled on
        this.playerState = {
            isGod: false,
            hasWarehouseDeed: false,
            inFactoryRoom: false
        };
        
        // Subscribe to MessageBus events (ONLY WidgetManager listens)
        this.subscribeToGameEvents();
    }
    
    /**
     * Subscribe to MessageBus events for widget message routing
     */
    subscribeToGameEvents() {
        // Subscribe to player stats for god mode detection
        this.game.messageBus.on('player:stats', (data) => {
            if (data.stats) {
                const godModeStat = data.stats.godMode || data.stats.flag_god_mode;
                this.playerState.isGod = godModeStat?.value === true || godModeStat === true;
            }
            // Update toggle bar when god mode changes
            this.updateToggleBar();
            // Route to widgets
            this.handleMessage({ type: 'playerStats', stats: data.stats });
        });
        
        // Subscribe to room updates for factory room detection
        this.game.messageBus.on('room:update', (data) => {
            this.playerState.inFactoryRoom = data.room?.roomType === 'factory';
            if (data.hasWarehouseDeed !== undefined) {
                this.playerState.hasWarehouseDeed = data.hasWarehouseDeed;
            }
            this.updateToggleBar();
            // Route to widgets FIRST so they can update their state
            console.log('[WidgetManager] room:update received, routing to widgets');
            this.handleMessage({ type: 'roomUpdate', ...data });
            // THEN update visibility after widgets have processed the message
            console.log('[WidgetManager] Updating visibility after room update');
            this.updateVisibility();
        });
        
        this.game.messageBus.on('room:moved', (data) => {
            this.playerState.inFactoryRoom = data.room?.roomType === 'factory';
            this.updateToggleBar();
            // Route to widgets FIRST so they can update their state
            console.log('[WidgetManager] room:moved received, routing to widgets');
            this.handleMessage({ type: 'moved', ...data });
            // THEN update visibility after widgets have processed the message
            console.log('[WidgetManager] Updating visibility after room moved');
            this.updateVisibility();
        });
        
        // Route comms messages to widgets
        this.game.messageBus.on('talked', (data) => {
            this.handleMessage({ type: 'talked', ...data });
        });
        
        this.game.messageBus.on('resonated', (data) => {
            this.handleMessage({ type: 'resonated', ...data });
        });
        
        this.game.messageBus.on('telepath', (data) => {
            this.handleMessage({ type: 'telepath', ...data });
        });
        
        this.game.messageBus.on('telepathSent', (data) => {
            this.handleMessage({ type: 'telepathSent', ...data });
        });
        
        // Route inventory updates to widgets (for NPC widget resource tracking)
        this.game.messageBus.on('inventory:update', (data) => {
            this.handleMessage({ type: 'inventory:update', ...data });
        });
        
        this.game.messageBus.on('inventoryList', (data) => {
            this.handleMessage({ type: 'inventoryList', items: data.items || data });
        });
        
        // Route direct NPC widget resource gain messages from NPC cycle engine
        this.game.messageBus.on('npcWidget:resourceGain', (data) => {
            this.handleMessage({ type: 'npcWidget:resourceGain', ...data });
        });
        
        // Route other game messages to widgets
        const messageTypes = [
            'factoryWidgetState',
            'factoryCraftStarted',
            'factoryCraftComplete',
            'factoryCraftFizzle',
            'map:data',
            'map:update',
            'pathing:modeStarted',
            'pathing:room',
            'pathing:saved',
            'ticketsList',
            'ticketUpdated',
            'ticketFeedbackAdded',
            'paths:all',
            'paths:details',
            'paths:executionStarted',
            'paths:executionResumed',
            'paths:executionComplete',
            'paths:executionStopped',
            'paths:executionFailed',
            'autonav:started',
            'autonav:complete',
            'autonav:failed',
            'pathSaved',
            'pathDeleted'
        ];
        
        messageTypes.forEach(msgType => {
            this.game.messageBus.on(msgType, (data) => {
                this.handleMessage({ type: msgType, ...data });
            });
        });
        
        // Subscribe to widget config updates
        this.game.messageBus.on('widget:config', (data) => {
            if (data.config && data.config.activeWidgets) {
                this.activeWidgets = new Set(data.config.activeWidgets);
                this.updateToggleBar();
                this.updateVisibility();
            }
        });
    }
    
    /**
     * Mount all widgets from registry
     */
    mountAll() {
        // Create widget-host container
        const rightPanel = document.querySelector('.right-panel');
        if (!rightPanel) {
            console.error('[WidgetManager] right-panel not found');
            return;
        }
        
        // Create toggle bar
        this.createToggleBar(rightPanel);
        
        // Use existing widget-host or create it
        this.widgetHost = document.getElementById('widget-host');
        if (!this.widgetHost) {
            this.widgetHost = document.createElement('div');
            this.widgetHost.id = 'widget-host';
            rightPanel.appendChild(this.widgetHost);
        } else {
            // Clear any existing content (in case of leftover elements)
            this.widgetHost.innerHTML = '';
        }
        
        // Sort widgets by order
        const sortedWidgets = [...this.registry].sort((a, b) => a.order - b.order);
        
        // Instantiate all widgets
        sortedWidgets.forEach(widgetDef => {
            const WidgetClass = WIDGET_CLASSES[widgetDef.id];
            if (!WidgetClass) {
                console.warn(`[WidgetManager] Widget class not found for: ${widgetDef.id}`);
                return;
            }
            
            try {
                // Some widgets accept (game, id), others only accept (game)
                // Try with id first, fall back to just game
                let widget;
                try {
                    widget = new WidgetClass(this.game, widgetDef.id);
                } catch (e) {
                    // Widget doesn't accept id parameter, try with just game
                    widget = new WidgetClass(this.game);
                }
                widget.init();
                this.widgets.set(widgetDef.id, widget);
                
                if (widgetDef.id === 'npc') {
                    console.log('[WidgetManager] NPC widget created and initialized');
                }
                
                // Initialize active widgets from defaultActive
                if (widgetDef.defaultActive && !widgetDef.autoManaged) {
                    this.activeWidgets.add(widgetDef.id);
                }
            } catch (error) {
                console.error(`[WidgetManager] Failed to create widget ${widgetDef.id}:`, error);
            }
        });
        
        // Update toggle bar display
        this.updateToggleBar();
        
        // Update visibility and attach visible widgets
        this.updateVisibility();
    }
    
    /**
     * Create toggle bar for widget control
     */
    createToggleBar(container) {
        // Create top bar container that holds both toggle bar and exit button
        const topBar = document.createElement('div');
        topBar.className = 'widget-top-bar';
        
        this.toggleBar = document.createElement('div');
        this.toggleBar.className = 'widget-toggle-bar';
        
        // Sort widgets by order
        const sortedWidgets = [...this.registry]
            .filter(w => !w.autoManaged) // Only show toggleable widgets
            .sort((a, b) => a.order - b.order);
        
        sortedWidgets.forEach(widgetDef => {
            const iconBtn = document.createElement('button');
            iconBtn.className = 'widget-icon';
            iconBtn.setAttribute('data-widget', widgetDef.id);
            iconBtn.title = widgetDef.name;
            
            // Create SVG icon
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '20');
            svg.setAttribute('height', '20');
            
            if (widgetDef.icon) {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill', 'currentColor');
                path.setAttribute('d', widgetDef.icon);
                svg.appendChild(path);
            } else {
                // Fallback: use first letter of name
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', '12');
                text.setAttribute('y', '18');
                text.setAttribute('font-size', '16');
                text.setAttribute('font-weight', 'bold');
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', 'currentColor');
                text.textContent = widgetDef.name.charAt(0).toUpperCase();
                svg.appendChild(text);
            }
            
            iconBtn.appendChild(svg);
            iconBtn.addEventListener('click', () => this.toggleWidget(widgetDef.id));
            this.toggleBar.appendChild(iconBtn);
        });
        
        topBar.appendChild(this.toggleBar);
        
        // Move exit button into top bar
        const exitBtn = document.getElementById('exitToCharacterSelection');
        if (exitBtn) {
            exitBtn.style.position = 'relative';
            exitBtn.style.top = 'auto';
            exitBtn.style.right = 'auto';
            topBar.appendChild(exitBtn);
        }
        
        // Insert top bar before widget-host (or at the beginning if widget-host doesn't exist yet)
        const existingWidgetHost = document.getElementById('widget-host');
        if (existingWidgetHost) {
            container.insertBefore(topBar, existingWidgetHost);
        } else {
            container.insertBefore(topBar, container.firstChild);
        }
    }
    
    /**
     * Update toggle bar to reflect current state
     */
    updateToggleBar() {
        if (!this.toggleBar) return;
        
        this.toggleBar.querySelectorAll('.widget-icon').forEach(iconBtn => {
            const widgetId = iconBtn.getAttribute('data-widget');
            const widgetDef = this.registry.find(w => w.id === widgetId);
            if (!widgetDef) return;
            
            // Check if widget should be visible in toggle bar
            let shouldShow = true;
            if (widgetDef.requiresGod && !this.playerState.isGod) {
                shouldShow = false;
            } else if (widgetDef.requiresWarehouse && !this.playerState.hasWarehouseDeed) {
                shouldShow = false;
            } else if (widgetDef.requiresFactory && !this.playerState.inFactoryRoom) {
                shouldShow = false;
            }
            
            if (shouldShow) {
                iconBtn.classList.remove('hidden');
            } else {
                iconBtn.classList.add('hidden');
                return;
            }
            
            // Update active state
            if (this.activeWidgets.has(widgetId)) {
                iconBtn.classList.add('active');
            } else {
                iconBtn.classList.remove('active');
            }
        });
    }
    
    /**
     * Toggle widget on/off
     */
    toggleWidget(widgetId) {
        const widgetDef = this.registry.find(w => w.id === widgetId);
        if (!widgetDef || widgetDef.autoManaged) return;
        
        // Check if widget is available
        if (widgetDef.requiresGod && !this.playerState.isGod) return;
        if (widgetDef.requiresWarehouse && !this.playerState.hasWarehouseDeed) return;
        if (widgetDef.requiresFactory && !this.playerState.inFactoryRoom) return;
        
        if (this.activeWidgets.has(widgetId)) {
            // Turn off
            this.activeWidgets.delete(widgetId);
            this.detachWidget(widgetId);
        } else {
            // Turn on
            this.activeWidgets.add(widgetId);
            this.attachWidget(widgetId);
        }
        
        this.updateToggleBar();
        this.saveWidgetConfig();
    }
    
    /**
     * Save widget configuration to server
     */
    saveWidgetConfig() {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        const config = {
            activeWidgets: Array.from(this.activeWidgets)
        };
        
        this.game.send({
            type: 'updateWidgetConfig',
            config: config
        });
    }
    
    /**
     * Attach widget to DOM
     */
    attachWidget(id) {
        const widget = this.widgets.get(id);
        if (!widget || widget.attached) return;
        
        // Check if widget has render() method (Widget-based widgets)
        // Component-based widgets find their own DOM elements and don't need render()
        if (typeof widget.render !== 'function') {
            // Component-based widget - mark as attached but don't create DOM
            widget.attached = true;
            return;
        }
        
        const rootElement = widget.render();
        if (!rootElement) {
            console.error(`[WidgetManager] Widget ${id} render() returned null`);
            return;
        }
        
        widget.rootElement = rootElement;
        rootElement.setAttribute('data-widget', id);
        
        // Insert in sorted order
        const sortedWidgets = [...this.registry].sort((a, b) => a.order - b.order);
        const currentOrder = sortedWidgets.map(w => w.id);
        const currentIndex = currentOrder.indexOf(id);
        
        // Find insertion point
        let insertBefore = null;
        for (let i = currentIndex + 1; i < currentOrder.length; i++) {
            const nextWidget = this.widgets.get(currentOrder[i]);
            if (nextWidget && nextWidget.attached && nextWidget.rootElement) {
                insertBefore = nextWidget.rootElement;
                break;
            }
        }
        
        if (insertBefore) {
            this.widgetHost.insertBefore(rootElement, insertBefore);
        } else {
            this.widgetHost.appendChild(rootElement);
        }
        
        widget.attached = true;
        
        // Call onAttach if available
        if (typeof widget.onAttach === 'function') {
            widget.onAttach();
        }
    }
    
    /**
     * Detach widget from DOM
     */
    detachWidget(id) {
        const widget = this.widgets.get(id);
        if (!widget || !widget.attached) return;
        
        widget.onDetach();
        
        if (widget.rootElement && widget.rootElement.parentElement) {
            widget.rootElement.parentElement.removeChild(widget.rootElement);
        }
        
        widget.attached = false;
        widget.rootElement = null;
    }
    
    /**
     * Handle message and route to widgets
     * ONLY entry point for widget messages
     */
    handleMessage(msg) {
        // Route to all widgets (not just attached ones)
        // Auto-managed widgets need to receive messages to update their state
        this.widgets.forEach((widget, id) => {
            // Always route to auto-managed widgets (they need messages to determine visibility)
            // Also route to attached regular widgets
            const widgetDef = this.registry.find(w => w.id === id);
            const isAutoManaged = widgetDef?.autoManaged === true;
            
            if (isAutoManaged || widget.attached) {
                try {
                    // Check if widget has onMessage method (Widget-based widgets)
                    // Component-based widgets use MessageBus subscriptions instead
                    if (typeof widget.onMessage === 'function') {
                        if (id === 'npc' && (msg.type === 'roomUpdate' || msg.type === 'moved')) {
                            console.log(`[WidgetManager] Routing ${msg.type} to NPC widget`);
                        }
                        widget.onMessage(msg);
                    } else if (isAutoManaged) {
                        console.warn(`[WidgetManager] Auto-managed widget ${id} does not have onMessage method`);
                    }
                } catch (error) {
                    console.error(`[WidgetManager] Error in widget ${id} onMessage:`, error);
                }
            }
        });
    }
    
    /**
     * Update widget visibility based on player state
     */
    updateVisibility() {
        this.registry.forEach(widgetDef => {
            const widget = this.widgets.get(widgetDef.id);
            if (!widget) return;
            
            // Check if widget should be visible
            let shouldShow = false;
            
            if (widgetDef.autoManaged) {
                // Auto-managed widgets - check widget's own visibility state
                if (widgetDef.id === 'npc') {
                    // NPC widget manages its own visibility based on harvest state
                    // Widget sets this.activeNPC when NPC is active
                    shouldShow = !!widget.activeNPC;
                    if (shouldShow) {
                        console.log('[WidgetManager] NPC widget should show, activeNPC:', widget.activeNPC?.name, 'activeNPC type:', typeof widget.activeNPC);
                    } else {
                        console.log('[WidgetManager] NPC widget should hide, activeNPC:', widget.activeNPC, 'activeNPC type:', typeof widget.activeNPC);
                    }
                } else if (widgetDef.id === 'factory') {
                    // Factory widget manages its own visibility based on room type
                    // Widget sets this.inFactoryRoom when in factory room
                    // Also check playerState as fallback for initial state
                    shouldShow = widget.inFactoryRoom !== undefined ? widget.inFactoryRoom : this.playerState.inFactoryRoom;
                }
            } else {
                // Regular widgets - check requirements and toggle state
                if (widgetDef.requiresGod && !this.playerState.isGod) {
                    shouldShow = false;
                } else if (widgetDef.requiresWarehouse && !this.playerState.hasWarehouseDeed) {
                    shouldShow = false;
                } else if (widgetDef.requiresFactory && !this.playerState.inFactoryRoom) {
                    shouldShow = false;
                } else {
                    // Widget is available - show if toggled on
                    shouldShow = this.activeWidgets.has(widgetDef.id);
                }
            }
            
            // Attach or detach
            if (shouldShow && !widget.attached) {
                this.attachWidget(widgetDef.id);
            } else if (!shouldShow && widget.attached) {
                this.detachWidget(widgetDef.id);
            }
        });
    }
}

