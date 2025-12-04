/**
 * Game Store - Centralized State Management
 * 
 * Single source of truth for game state using Alpine.js reactive system.
 * All components read from and update this store.
 */

// Initialize store before Alpine.js loads
// Alpine will make it reactive when it initializes
const GameStore = {
  // Current room state
  currentRoom: null,
  currentRoomId: null,
  currentMapName: null,
  
  // Entities in current room
  players: [],
  npcs: [],
  roomItems: [],
  exits: [],
  
  // Terminal messages
  terminalMessages: [],
  
  // Widget states
  widgets: {
    stats: {
      visible: true,
      data: null
    },
    compass: {
      visible: true,
      data: null
    },
    map: {
      visible: true,
      data: null
    },
    comms: {
      visible: true,
      data: null
    },
    npc: {
      visible: false,
      data: null
    },
    factory: {
      visible: false,
      data: null
    },
    warehouse: {
      visible: false,
      data: null
    },
    godmode: {
      visible: false,
      data: null
    },
    runekeeper: {
      visible: false,
      data: null
    },
    scripting: {
      visible: false,
      data: null
    }
  },
  
  // Player state
  playerStats: null,
  playerInventory: [],
  
  // Communication state
  commMode: 'talk', // 'talk', 'resonate', 'telepath'
  commHistory: {
    talk: [],
    resonate: [],
    telepath: []
  },
  
  // Path/loop execution state
  pathExecution: {
    isExecuting: false,
    isPaused: false,
    currentPath: null
  },
  
  // Factory widget state
  factoryState: null,
  
  // Warehouse widget state
  warehouseState: null,
  
  // Map state
  mapData: null,
  
  /**
   * Update room state
   */
  updateRoom(room, players, npcs, roomItems, exits, mapName) {
    this.currentRoom = room;
    this.currentRoomId = room?.id || null;
    this.currentMapName = mapName || null;
    this.players = players || [];
    this.npcs = npcs || [];
    this.roomItems = roomItems || [];
    this.exits = exits || [];
  },
  
  /**
   * Add message to terminal
   */
  addTerminalMessage(message, type = 'info', html = null) {
    this.terminalMessages.push({
      message,
      type,
      html,
      timestamp: Date.now()
    });
    
    // Keep only last 1000 messages to prevent memory issues
    if (this.terminalMessages.length > 1000) {
      this.terminalMessages.shift();
    }
  },
  
  /**
   * Update widget visibility
   */
  setWidgetVisible(widgetName, visible) {
    if (this.widgets[widgetName]) {
      this.widgets[widgetName].visible = visible;
    }
  },
  
  /**
   * Update widget data
   */
  setWidgetData(widgetName, data) {
    if (this.widgets[widgetName]) {
      this.widgets[widgetName].data = data;
    }
  },
  
  /**
   * Update player stats
   */
  updatePlayerStats(stats) {
    this.playerStats = stats;
  },
  
  /**
   * Update player inventory
   */
  updatePlayerInventory(inventory) {
    this.playerInventory = inventory || [];
  },
  
  /**
   * Set communication mode
   */
  setCommMode(mode) {
    if (['talk', 'resonate', 'telepath'].includes(mode)) {
      this.commMode = mode;
    }
  },
  
  /**
   * Add communication message
   */
  addCommMessage(mode, playerName, message) {
    if (this.commHistory[mode]) {
      this.commHistory[mode].push({
        playerName,
        message,
        timestamp: Date.now()
      });
      
      // Keep only last 100 messages per channel
      if (this.commHistory[mode].length > 100) {
        this.commHistory[mode].shift();
      }
    }
  }
};

// Make GameStore globally available
// Alpine will make it reactive when it initializes
window.GameStore = GameStore;

