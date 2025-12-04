/**
 * Main Entry Point
 * 
 * Initializes Game controller and all components.
 */

import Game from './core/Game.js';
import Terminal from './components/Terminal.js';
import StatsWidget from './components/StatsWidget.js';
import MapWidget from './components/MapWidget.js';
import CompassWidget from './components/CompassWidget.js';
import CommsWidget from './components/CommsWidget.js';
import Inventory from './components/Inventory.js';
import MapRenderer from './utils/MapRenderer.js';

// Initialize game
const game = new Game();

// Initialize components
const terminal = new Terminal(game);
const statsWidget = new StatsWidget(game);
const mapWidget = new MapWidget(game);
const compassWidget = new CompassWidget(game);
const commsWidget = new CommsWidget(game);
const inventory = new Inventory(game);

// Initialize all components
terminal.init();
statsWidget.init();
mapWidget.init();
compassWidget.init();
commsWidget.init();
inventory.init();

// Set up command line handler
const commandInput = document.getElementById('commandInput');
if (commandInput) {
    commandInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const command = commandInput.value.trim();
            if (command) {
                executeCommand(command);
                commandInput.value = '';
            }
        }
    });
    
    // Reset idle timer on input
    commandInput.addEventListener('input', () => {
        terminal.resetIdleTimer();
    });
}

// Command execution
function executeCommand(input) {
    if (!input) return;
    
    const ws = game.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        terminal.addMessage('Not connected to server. Please wait...', 'error');
        return;
    }
    
    // Normalize command
    const normalized = normalizeCommand(input);
    
    // Don't send if command was invalid or had validation errors
    if (!normalized) {
        return;
    }
    
    // Send command to server
    game.send(normalized);
}

// Normalize command input
function normalizeCommand(input) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Command abbreviations
    const commandMap = {
        'n': 'move', 'north': 'move',
        's': 'move', 'south': 'move',
        'e': 'move', 'east': 'move',
        'w': 'move', 'west': 'move',
        'ne': 'move', 'northeast': 'move',
        'nw': 'move', 'northwest': 'move',
        'se': 'move', 'southeast': 'move',
        'sw': 'move', 'southwest': 'move',
        'u': 'move', 'up': 'move',
        'd': 'move', 'down': 'move',
        'look': 'look', 'l': 'look',
        'inventory': 'inventory', 'inv': 'inventory', 'i': 'inventory',
        'take': 'take', 't': 'take',
        'drop': 'drop',
        'harvest': 'harvest', 'h': 'harvest',
        'collect': 'harvest', 'c': 'harvest',
        'gather': 'harvest', 'g': 'harvest',
        'talk': 'talk', 'say': 'talk', 't': 'talk',
        'resonate': 'resonate', 'res': 'resonate', 'r': 'resonate',
        'telepath': 'telepath', 'tele': 'telepath', 'tell': 'telepath', 'whisper': 'telepath',
        'help': 'help', '?': 'help',
        'list': 'list', 'li': 'list', 'ls': 'list',
        'buy': 'buy', 'b': 'buy',
        'sell': 'sell', 's': 'sell',
        'warehouse': 'warehouse', 'wh': 'warehouse',
        'store': 'store', 'st': 'store',
        'withdraw': 'withdraw', 'wd': 'withdraw',
        'deposit': 'deposit', 'dep': 'deposit',
        'balance': 'balance', 'bal': 'balance',
        'who': 'who',
        'solve': 'solve', 'sol': 'solve',
        'clue': 'clue', 'cl': 'clue',
        'ask': 'ask',
        'jump': 'jump', '/jump': 'jump'
    };
    
    const commandType = commandMap[cmd];
    if (!commandType) {
        terminal.addMessage(`Unknown command: ${cmd}. Type 'help' for available commands.`, 'error');
        return null; // Don't send to server
    }
    
    // Handle movement commands
    if (commandType === 'move') {
        const directionMap = {
            'n': 'N', 'north': 'N',
            's': 'S', 'south': 'S',
            'e': 'E', 'east': 'E',
            'w': 'W', 'west': 'W',
            'ne': 'NE', 'northeast': 'NE',
            'nw': 'NW', 'northwest': 'NW',
            'se': 'SE', 'southeast': 'SE',
            'sw': 'SW', 'southwest': 'SW',
            'u': 'U', 'up': 'U',
            'd': 'D', 'down': 'D'
        };
        const direction = directionMap[cmd];
        if (direction) {
            terminal.resetIdleTimer();
            return { type: 'move', direction: direction };
        }
    }
    
    // Handle other commands
    if (commandType === 'look') {
        terminal.resetIdleTimer();
        return { type: 'look' };
    }
    
    if (commandType === 'inventory') {
        return { type: 'inventory' };
    }
    
    if (commandType === 'take') {
        const itemName = args.join(' ');
        if (!itemName) {
            terminal.addMessage('Take what?', 'error');
            return null;
        }
        return { type: 'take', itemName: itemName };
    }
    
    if (commandType === 'drop') {
        const itemName = args.join(' ');
        if (!itemName) {
            terminal.addMessage('Drop what?', 'error');
            return null;
        }
        return { type: 'drop', itemName: itemName };
    }
    
    if (commandType === 'harvest') {
        const target = args.join(' ');
        if (!target) {
            terminal.addMessage('Harvest from what?', 'error');
            return null; // Don't send to server
        }
        return { type: 'harvest', target: target };
    }
    
    if (commandType === 'talk') {
        const message = args.join(' ');
        if (!message) {
            terminal.addMessage('Talk what? (talk <message>)', 'error');
            return null;
        }
        return { type: 'talk', message: message };
    }
    
    if (commandType === 'resonate') {
        const message = args.join(' ');
        if (!message) {
            terminal.addMessage('Resonate what? (resonate <message>)', 'error');
            return null;
        }
        return { type: 'resonate', message: message };
    }
    
    if (commandType === 'telepath') {
        if (args.length < 2) {
            terminal.addMessage('Usage: telepath <player> <message>', 'error');
            return null; // Don't send to server
        }
        return { type: 'telepath', targetPlayer: args[0], message: args.slice(1).join(' ') };
    }
    
    if (commandType === 'help') {
        displayHelp();
        return { type: 'help' };
    }
    
    if (commandType === 'list') {
        return { type: 'list' };
    }
    
    if (commandType === 'buy') {
        const quantity = args.length > 1 ? parseInt(args[args.length - 1]) : 1;
        const itemName = quantity > 1 ? args.slice(0, -1).join(' ') : args.join(' ');
        return { type: 'buy', itemName: itemName, quantity: isNaN(quantity) ? 1 : quantity };
    }
    
    if (commandType === 'sell') {
        const quantity = args.length > 1 ? parseInt(args[args.length - 1]) : 1;
        const itemName = quantity > 1 ? args.slice(0, -1).join(' ') : args.join(' ');
        return { type: 'sell', itemName: itemName, quantity: isNaN(quantity) ? 1 : quantity };
    }
    
    if (commandType === 'warehouse') {
        return { type: 'warehouse' };
    }
    
    if (commandType === 'store') {
        const quantity = args.length > 1 ? (args[args.length - 1] === 'all' ? 'all' : parseInt(args[args.length - 1])) : 1;
        const itemName = args.length > 1 && args[args.length - 1] !== 'all' ? args.slice(0, -1).join(' ') : args.join(' ');
        return { type: 'store', itemName: itemName, quantity: quantity };
    }
    
    if (commandType === 'withdraw') {
        const quantity = args.length > 1 ? (args[args.length - 1] === 'all' ? 'all' : parseInt(args[args.length - 1])) : 1;
        const itemName = args.length > 1 && args[args.length - 1] !== 'all' ? args.slice(0, -1).join(' ') : args.join(' ');
        return { type: 'withdraw', itemName: itemName, quantity: quantity };
    }
    
    if (commandType === 'deposit') {
        const quantity = args.length > 1 ? (args[args.length - 1] === 'all' ? 'all' : parseInt(args[args.length - 1])) : 1;
        const currencyName = args.length > 1 && args[args.length - 1] !== 'all' ? args.slice(0, -1).join(' ') : args.join(' ');
        return { type: 'deposit', currencyName: currencyName, quantity: quantity };
    }
    
    if (commandType === 'balance') {
        return { type: 'balance' };
    }
    
    if (commandType === 'who') {
        return { type: 'who' };
    }
    
    if (commandType === 'solve') {
        if (args.length < 2) {
            terminal.addMessage('Usage: solve <npc> <answer>', 'error');
            return null; // Don't send to server
        }
        return { type: 'solve', target: args[0], answer: args.slice(1).join(' ') };
    }
    
    if (commandType === 'clue') {
        if (args.length < 1) {
            terminal.addMessage('Usage: clue <npc>', 'error');
            return null; // Don't send to server
        }
        return { type: 'clue', target: args[0] };
    }
    
    if (commandType === 'ask') {
        if (args.length < 2) {
            terminal.addMessage('Usage: ask <npc> <question>', 'error');
            return null; // Don't send to server
        }
        return { type: 'ask', target: args[0], question: args.slice(1).join(' ') };
    }
    
    if (commandType === 'jump') {
        // Jump command is handled client-side (opens jump widget)
        // Check god mode first
        if (!godMode) {
            terminal.addMessage('This command requires god mode.', 'error');
            return null;
        }
        openJumpWidget();
        return null; // Don't send to server
    }
    
    return { type: commandType };
}

// Set up numpad movement
document.addEventListener('keydown', (e) => {
    const numpadMap = {
        '7': 'NW', '8': 'N', '9': 'NE',
        '4': 'W', '6': 'E',
        '1': 'SW', '2': 'S', '3': 'SE',
        '0': 'D'
    };
    
    // Check if numpad key
    if (e.key >= '0' && e.key <= '9' && e.location === 3) {
        const direction = numpadMap[e.key];
        if (direction) {
            e.preventDefault();
            terminal.resetIdleTimer();
            game.send({ type: 'move', direction: direction });
        }
    }
    
    // Handle U (up) key
    if (e.key === 'u' || e.key === 'U') {
        if (e.target === commandInput) return; // Don't trigger if typing in command input
        terminal.resetIdleTimer();
        game.send({ type: 'move', direction: 'U' });
    }
});

// Widget toggle system is initialized in initWidgetToggleBar() below

// Exit button handler
const exitBtn = document.getElementById('exitToCharacterSelection');
if (exitBtn) {
    exitBtn.addEventListener('click', () => {
        // Check if popup window
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('popup') === 'true') {
            window.close();
        } else {
            window.location.href = '/';
        }
    });
}

// Connect WebSocket when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        game.connect();
    });
} else {
    game.connect();
}

// Help command display
function displayHelp() {
    const COMMAND_REGISTRY = [
        { name: 'north', abbrev: 'n', description: 'Move north', category: 'Movement' },
        { name: 'south', abbrev: 's', description: 'Move south', category: 'Movement' },
        { name: 'east', abbrev: 'e', description: 'Move east', category: 'Movement' },
        { name: 'west', abbrev: 'w', description: 'Move west', category: 'Movement' },
        { name: 'northeast', abbrev: 'ne', description: 'Move northeast', category: 'Movement' },
        { name: 'northwest', abbrev: 'nw', description: 'Move northwest', category: 'Movement' },
        { name: 'southeast', abbrev: 'se', description: 'Move southeast', category: 'Movement' },
        { name: 'southwest', abbrev: 'sw', description: 'Move southwest', category: 'Movement' },
        { name: 'up', abbrev: 'u', description: 'Move up', category: 'Movement' },
        { name: 'down', abbrev: 'd', description: 'Move down', category: 'Movement' },
        { name: 'look', abbrev: 'l', description: 'Look at current room or target', category: 'Information' },
        { name: 'inventory', abbrev: 'inv, i', description: 'Display inventory', category: 'Items' },
        { name: 'take', abbrev: 't', description: 'Take item from ground', category: 'Items' },
        { name: 'drop', description: 'Drop item to ground', category: 'Items' },
        { name: 'harvest', abbrev: 'h, c, g', description: 'Harvest from NPC', category: 'NPC Interaction' },
        { name: 'talk', abbrev: 'say, t', description: 'Talk in room', category: 'Communication' },
        { name: 'resonate', abbrev: 'res, r', description: 'Broadcast to all players', category: 'Communication' },
        { name: 'telepath', abbrev: 'tele, tell', description: 'Send private message', category: 'Communication' },
        { name: 'help', abbrev: '?', description: 'Display this help', category: 'Information' },
        { name: 'list', abbrev: 'li, ls', description: 'List merchant inventory', category: 'Merchant' },
        { name: 'buy', abbrev: 'b', description: 'Buy item from merchant', category: 'Merchant' },
        { name: 'sell', abbrev: 's', description: 'Sell item to merchant', category: 'Merchant' },
        { name: 'warehouse', abbrev: 'wh', description: 'Open warehouse widget', category: 'Storage' },
        { name: 'store', abbrev: 'st', description: 'Store item to warehouse', category: 'Storage' },
        { name: 'withdraw', abbrev: 'wd', description: 'Withdraw item from warehouse', category: 'Storage' },
        { name: 'deposit', abbrev: 'dep', description: 'Deposit currency to bank', category: 'Bank' },
        { name: 'balance', abbrev: 'bal', description: 'Check bank balance', category: 'Bank' },
        { name: 'who', description: 'Show all players online', category: 'Information' },
        { name: 'solve', abbrev: 'sol', description: 'Solve puzzle', category: 'Puzzles' },
        { name: 'clue', abbrev: 'cl', description: 'Get puzzle clue', category: 'Puzzles' },
        { name: 'ask', description: 'Ask NPC a question', category: 'NPC Interaction' }
    ];
    
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;
    
    const helpDiv = document.createElement('div');
    helpDiv.className = 'help-section';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'help-title';
    titleDiv.textContent = '=== Available Commands ===';
    helpDiv.appendChild(titleDiv);
    
    const table = document.createElement('table');
    table.className = 'help-table';
    
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headerCommand = document.createElement('th');
    headerCommand.textContent = 'Command';
    headerCommand.className = 'help-table-header';
    const headerDescription = document.createElement('th');
    headerDescription.textContent = 'Description';
    headerDescription.className = 'help-table-header';
    headerRow.appendChild(headerCommand);
    headerRow.appendChild(headerDescription);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    
    const categories = {};
    COMMAND_REGISTRY.forEach(cmd => {
        if (!categories[cmd.category]) {
            categories[cmd.category] = [];
        }
        categories[cmd.category].push(cmd);
    });
    
    for (const [category, commands] of Object.entries(categories)) {
        const categoryRow = document.createElement('tr');
        const categoryCell = document.createElement('td');
        categoryCell.colSpan = 2;
        categoryCell.className = 'help-category';
        categoryCell.textContent = `[${category}]`;
        categoryRow.appendChild(categoryCell);
        tbody.appendChild(categoryRow);
        
        commands.forEach(cmd => {
            const cmdRow = document.createElement('tr');
            cmdRow.className = 'help-command-row';
            
            const cmdNameCell = document.createElement('td');
            cmdNameCell.className = 'help-cmd-name-cell';
            const abbrevStr = cmd.abbrev ? ` (${cmd.abbrev})` : '';
            cmdNameCell.innerHTML = `<span class="help-cmd-name">${cmd.name}${abbrevStr}</span>`;
            
            const descCell = document.createElement('td');
            descCell.className = 'help-cmd-desc-cell';
            descCell.textContent = cmd.description;
            
            cmdRow.appendChild(cmdNameCell);
            cmdRow.appendChild(descCell);
            tbody.appendChild(cmdRow);
        });
    }
    
    table.appendChild(tbody);
    helpDiv.appendChild(table);
    
    terminalContent.appendChild(helpDiv);
    terminalContent.scrollTop = terminalContent.scrollHeight;
}

// Widget toggle functionality
const TOGGLEABLE_WIDGETS = ['stats', 'compass', 'map', 'comms', 'warehouse', 'godmode', 'scripting', 'runekeeper'];
let activeWidgets = ['stats', 'compass', 'map', 'comms']; // Default active widgets
let godMode = false;
let hasWarehouseDeed = false;

// Update godMode and hasWarehouseDeed from server messages
game.messageBus.on('player:stats', (data) => {
    if (data.stats) {
        // Check for godMode in stats (godMode is returned as an object with .value property)
        if (data.stats.godMode !== undefined) {
            const wasGodMode = godMode;
            godMode = data.stats.godMode.value === true || data.stats.godMode === true;
            // Only update widget display if godMode status changed
            if (wasGodMode !== godMode) {
                updateWidgetDisplay();
            }
        }
    }
});

game.messageBus.on('room:update', (data) => {
    if (data.hasWarehouseDeed !== undefined) {
        const wasWarehouseDeed = hasWarehouseDeed;
        hasWarehouseDeed = data.hasWarehouseDeed;
        // Only update widget display if warehouse deed status changed
        if (wasWarehouseDeed !== hasWarehouseDeed) {
            updateWidgetDisplay();
        }
    }
});

game.messageBus.on('warehouse:widgetState', (data) => {
    if (data.state && data.state.hasWarehouseDeed !== undefined) {
        const wasWarehouseDeed = hasWarehouseDeed;
        hasWarehouseDeed = data.state.hasWarehouseDeed;
        // Only update widget display if warehouse deed status changed
        if (wasWarehouseDeed !== hasWarehouseDeed) {
            updateWidgetDisplay();
        }
    }
});

game.messageBus.on('widget:config', (data) => {
    if (data.config && data.config.activeWidgets) {
        // Only update if the config actually changed
        const configChanged = JSON.stringify(activeWidgets) !== JSON.stringify(data.config.activeWidgets);
        if (configChanged) {
            activeWidgets = data.config.activeWidgets;
            updateWidgetDisplay();
        }
    }
});

// Initialize widget toggle bar
function initWidgetToggleBar() {
    const toggleBar = document.querySelector('.widget-toggle-bar');
    if (!toggleBar) return;
    
    // Always hide godmode and warehouse icons initially (they'll be shown later if conditions are met)
    const godmodeIcon = document.getElementById('godmode-widget-icon') || toggleBar.querySelector('[data-widget="godmode"]');
    if (godmodeIcon) {
        godmodeIcon.classList.add('hidden');
    }
    const warehouseIcon = document.getElementById('warehouse-widget-icon') || toggleBar.querySelector('[data-widget="warehouse"]');
    if (warehouseIcon) {
        warehouseIcon.classList.add('hidden');
    }
    
    // Handle widget toggle icons
    toggleBar.querySelectorAll('.widget-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const widgetName = icon.getAttribute('data-widget');
            if (widgetName) {
                toggleWidget(widgetName);
            }
        });
    });
    
    // Handle exit to character selection button
    const exitBtn = document.getElementById('exitToCharacterSelection');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            if (window.opener) {
                window.close();
            } else {
                window.location.href = '/';
            }
        });
    }
    
    // Initial widget display
    updateWidgetDisplay();
}

// Toggle widget visibility
function toggleWidget(widgetName) {
    if (!TOGGLEABLE_WIDGETS.includes(widgetName)) return;
    
    // Check if widget is available (godmode requires godMode, warehouse requires hasWarehouseDeed)
    if (widgetName === 'godmode' && !godMode) return;
    if (widgetName === 'warehouse' && !hasWarehouseDeed) return;
    
    const isActive = activeWidgets.includes(widgetName);
    
    if (isActive) {
        // Hide the widget - allow hiding all widgets
        activeWidgets = activeWidgets.filter(w => w !== widgetName);
    } else {
        // Show the widget
        // Limit to 4 widgets
        if (activeWidgets.length >= 4) {
            // Remove last widget to make room
            activeWidgets.pop();
        }
        activeWidgets.push(widgetName);
    }
    
    updateWidgetDisplay();
    saveWidgetConfig();
}

// Update widget display
function updateWidgetDisplay() {
    const toggleBar = document.querySelector('.widget-toggle-bar');
    const slots = document.querySelectorAll('.widget-slot[data-slot]:not([data-slot^="scripting"])');
    
    // Update toggle bar icons
    TOGGLEABLE_WIDGETS.forEach(widgetName => {
        // Use ID selector for godmode and warehouse (more reliable)
        let icon;
        if (widgetName === 'godmode') {
            icon = document.getElementById('godmode-widget-icon');
        } else if (widgetName === 'warehouse') {
            icon = document.getElementById('warehouse-widget-icon');
        } else {
            icon = toggleBar?.querySelector(`[data-widget="${widgetName}"]`);
        }
        
        if (!icon) return;
        
        // Handle icon visibility - godmode and warehouse are conditional
        if (widgetName === 'godmode') {
            // Always hide godmode icon unless player has godMode
            if (godMode) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
                // Also remove from activeWidgets if it was there
                if (activeWidgets.includes('godmode')) {
                    activeWidgets = activeWidgets.filter(w => w !== 'godmode');
                }
                return; // Don't update active state for hidden icons
            }
        } else if (widgetName === 'warehouse') {
            // Always hide warehouse icon unless player has warehouse deed
            if (hasWarehouseDeed) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
                // Also remove from activeWidgets if it was there
                if (activeWidgets.includes('warehouse')) {
                    activeWidgets = activeWidgets.filter(w => w !== 'warehouse');
                }
                return; // Don't update active state for hidden icons
            }
        }
        
        // Update active state (only for visible icons)
        if (activeWidgets.includes(widgetName)) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    });
    
    // Hide all widgets first (including empty placeholder)
    TOGGLEABLE_WIDGETS.forEach(widgetName => {
        const widget = document.getElementById(`widget-${widgetName}`);
        if (widget) {
            widget.classList.add('hidden');
        }
    });
    
    // Always hide the empty widget placeholder
    const emptyWidget = document.getElementById('widget-empty');
    if (emptyWidget) {
        emptyWidget.classList.add('hidden');
    }
    
    // Show active widgets in slots
    slots.forEach((slot, index) => {
        // Always hide empty widget placeholder in this slot
        const slotEmptyWidget = slot.querySelector('.widget-empty');
        if (slotEmptyWidget) {
            slotEmptyWidget.classList.add('hidden');
        }
        
        if (index < activeWidgets.length) {
            const widgetName = activeWidgets[index];
            const widget = document.getElementById(`widget-${widgetName}`);
            if (widget) {
                slot.style.display = 'block';
                if (widget.parentElement !== slot) {
                    slot.appendChild(widget);
                }
                widget.classList.remove('hidden');
                
                // Trigger map render if map widget is shown
                if (widgetName === 'map' && mapWidget) {
                    // Force map to reload when shown (but don't send look command to avoid infinite loop)
                    setTimeout(() => {
                        mapWidget.render();
                    }, 100);
                }
            } else {
                // Widget not found - hide slot
                slot.style.display = 'none';
            }
        } else {
            // Slot is empty - hide the slot itself, don't show empty placeholder
            slot.style.display = 'none';
        }
    });
}

// Save widget configuration
function saveWidgetConfig() {
    const ws = game.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const config = {
        activeWidgets: activeWidgets
    };
    
    game.send({
        type: 'updateWidgetConfig',
        config: config
    });
}

// Initialize widget toggle bar on page load
initWidgetToggleBar();

// Initialize god mode editor buttons
function initGodModeEditors() {
    const godModeEditorButtons = document.querySelectorAll('.godmode-editor-btn');
    godModeEditorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'map') {
                window.location.href = '/map';
            } else if (action === 'npc') {
                window.location.href = '/npc';
            } else if (action === 'items') {
                window.location.href = '/items';
            } else if (action === 'player') {
                window.location.href = '/player';
            }
        });
    });
    
    // Remove restart server button (legacy, not fully implemented)
    const restartServerBtn = document.getElementById('restartServerBtn');
    if (restartServerBtn) {
        restartServerBtn.remove();
    }
    
    // Also remove the server control section if it's empty
    const serverSection = document.querySelector('.godmode-server-section');
    if (serverSection) {
        const hasContent = serverSection.querySelectorAll('button, input, select').length > 0;
        if (!hasContent) {
            serverSection.remove();
        }
    }
}

// Initialize god mode editors when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initGodModeEditors();
    });
} else {
    initGodModeEditors();
}

// ============================================================
// JUMP WIDGET (God Mode Teleport)
// ============================================================
let jumpWidgetMaps = [];
let jumpWidgetRooms = [];
let jumpWidgetCanvas = null;
let jumpWidgetCtx = null;
let jumpWidgetRenderer = null; // MapRenderer instance for jump widget
let jumpWidgetResizeObserver = null; // ResizeObserver for container
let jumpWidgetSelectedMap = null;
let currentRoomPos = null;
let currentMapId = null;
const JUMP_CELL_SIZE = 15;

// Track current room position from room updates
game.messageBus.on('room:update', (data) => {
    if (data.room) {
        currentRoomPos = { x: data.room.x, y: data.room.y };
        currentMapId = data.room.mapId;
    }
});

game.messageBus.on('room:moved', (data) => {
    if (data.room) {
        currentRoomPos = { x: data.room.x, y: data.room.y };
        currentMapId = data.room.mapId;
    }
});

function openJumpWidget() {
    const widget = document.getElementById('jumpWidget');
    if (!widget) return;
    
    widget.classList.remove('hidden');
    
    // Initialize canvas
    jumpWidgetCanvas = document.getElementById('jumpMapCanvas');
    if (!jumpWidgetCanvas) return;
    
    jumpWidgetCtx = jumpWidgetCanvas.getContext('2d');
    
    // Set canvas to container size (not dynamic)
    const container = jumpWidgetCanvas.parentElement;
    if (container) {
        // Set initial size
        jumpWidgetCanvas.width = container.clientWidth;
        jumpWidgetCanvas.height = container.clientHeight;
        
        // Add resize observer to handle container size changes
        if (!jumpWidgetResizeObserver) {
            jumpWidgetResizeObserver = new ResizeObserver(() => {
                if (jumpWidgetCanvas && container) {
                    jumpWidgetCanvas.width = container.clientWidth;
                    jumpWidgetCanvas.height = container.clientHeight;
                    if (jumpWidgetRenderer) {
                        jumpWidgetRenderer.canvas = jumpWidgetCanvas;
                        jumpWidgetRenderer.ctx = jumpWidgetCtx;
                    }
                    renderJumpMap();
                }
            });
            jumpWidgetResizeObserver.observe(container);
        }
    }
    
    // Initialize or reset renderer
    if (!jumpWidgetRenderer) {
        jumpWidgetRenderer = new MapRenderer({
            canvas: jumpWidgetCanvas,
            ctx: jumpWidgetCtx,
            cellSize: JUMP_CELL_SIZE,
            gridSize: null, // Dynamic bounds mode
            zoom: 1.0,
            panX: 0,
            panY: 0,
            minCellSize: 8,
            maxCellSize: null,
            shouldDrawConnections: false,
            getRoomColor: (room) => {
                const isCurrentRoom = currentRoomPos && 
                                     room.x === currentRoomPos.x && 
                                     room.y === currentRoomPos.y &&
                                     jumpWidgetSelectedMap === currentMapId;
                if (isCurrentRoom) {
                    return '#00ff00';
                } else if (room.connected_map_id) {
                    return '#ffffff';
                }
                return '#666';
            },
            getRoomBorder: (room) => {
                const isCurrentRoom = currentRoomPos && 
                                     room.x === currentRoomPos.x && 
                                     room.y === currentRoomPos.y &&
                                     jumpWidgetSelectedMap === currentMapId;
                return {
                    color: isCurrentRoom ? '#ffff00' : '#333',
                    width: isCurrentRoom ? 2 : 1
                };
            }
        });
    } else {
        // Reset zoom and pan when opening
        jumpWidgetRenderer.setZoom(1.0);
        jumpWidgetRenderer.setPan(0, 0);
        jumpWidgetRenderer.canvas = jumpWidgetCanvas;
        jumpWidgetRenderer.ctx = jumpWidgetCtx;
    }
    
    // Add mouse wheel handler for zoom
    jumpWidgetCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const currentZoom = jumpWidgetRenderer.zoom;
        if (e.deltaY < 0) {
            // Zoom in
            jumpWidgetRenderer.setZoom(currentZoom + zoomSpeed);
        } else {
            // Zoom out
            jumpWidgetRenderer.setZoom(currentZoom - zoomSpeed);
        }
        renderJumpMap();
    });
    
    // Setup keyboard handler for arrow keys (pan)
    setupJumpWidgetKeyboard();
    
    // Request map list from server
    game.send({ type: 'getJumpMaps' });
    
    // Setup event listeners
    const closeBtn = document.getElementById('closeJumpWidget');
    if (closeBtn) {
        closeBtn.onclick = closeJumpWidget;
    }
    
    const mapSelector = document.getElementById('jumpMapSelector');
    if (mapSelector) {
        mapSelector.onchange = onJumpMapSelected;
    }
    
    // Canvas click handler
    if (jumpWidgetCanvas) {
        jumpWidgetCanvas.onclick = onJumpCanvasClick;
        jumpWidgetCanvas.onmousemove = onJumpCanvasHover;
    }
}

// Setup keyboard handler for jump widget (arrow keys for pan)
let jumpWidgetKeyboardHandler = null;

function setupJumpWidgetKeyboard() {
    // Remove old handler if exists
    if (jumpWidgetKeyboardHandler) {
        document.removeEventListener('keydown', jumpWidgetKeyboardHandler);
    }
    
    jumpWidgetKeyboardHandler = (e) => {
        // Check if jump widget is visible
        const jumpWidget = document.getElementById('jumpWidget');
        if (!jumpWidget || jumpWidget.classList.contains('hidden')) {
            return;
        }
        
        // Check if command input has focus (don't intercept if typing)
        const commandInput = document.getElementById('commandInput');
        if (commandInput && document.activeElement === commandInput) {
            return;
        }
        
        // Arrow keys for panning
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
            e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            handleJumpWidgetPan(e.key);
            return;
        }
    };
    
    document.addEventListener('keydown', jumpWidgetKeyboardHandler);
}

function handleJumpWidgetPan(direction) {
    if (!jumpWidgetRenderer) return;
    
    const panAmount = 5; // Pan by 5 squares
    const currentPanX = jumpWidgetRenderer.panX;
    const currentPanY = jumpWidgetRenderer.panY;
    
    switch (direction) {
        case 'ArrowUp':
            jumpWidgetRenderer.setPan(currentPanX, currentPanY + panAmount);
            break;
        case 'ArrowDown':
            jumpWidgetRenderer.setPan(currentPanX, currentPanY - panAmount);
            break;
        case 'ArrowLeft':
            jumpWidgetRenderer.setPan(currentPanX - panAmount, currentPanY);
            break;
        case 'ArrowRight':
            jumpWidgetRenderer.setPan(currentPanX + panAmount, currentPanY);
            break;
    }
    
    renderJumpMap();
}

function closeJumpWidget() {
    const widget = document.getElementById('jumpWidget');
    if (widget) {
        widget.classList.add('hidden');
    }
    jumpWidgetMaps = [];
    jumpWidgetRooms = [];
    jumpWidgetSelectedMap = null;
    
    // Remove keyboard handler when closing
    if (jumpWidgetKeyboardHandler) {
        document.removeEventListener('keydown', jumpWidgetKeyboardHandler);
        jumpWidgetKeyboardHandler = null;
    }
    
    // Disconnect resize observer when closing
    if (jumpWidgetResizeObserver) {
        jumpWidgetResizeObserver.disconnect();
        jumpWidgetResizeObserver = null;
    }
}

// Handle jump maps from server
game.messageBus.on('jump:maps', (data) => {
    populateJumpMaps(data.maps);
});

function populateJumpMaps(maps) {
    jumpWidgetMaps = maps;
    const selector = document.getElementById('jumpMapSelector');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Select a map...</option>';
    maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map.id;
        option.textContent = map.name;
        selector.appendChild(option);
    });
}

function onJumpMapSelected(e) {
    const mapId = parseInt(e.target.value);
    if (!mapId) {
        jumpWidgetRooms = [];
        jumpWidgetSelectedMap = null;
        clearJumpCanvas();
        return;
    }
    
    jumpWidgetSelectedMap = mapId;
    
    // Reset zoom and pan when selecting new map
    if (jumpWidgetRenderer) {
        jumpWidgetRenderer.setZoom(1.0);
        jumpWidgetRenderer.setPan(0, 0);
    }
    
    // Request rooms for this map
    game.send({ type: 'getJumpRooms', mapId });
}

// Handle jump rooms from server
game.messageBus.on('jump:rooms', (data) => {
    populateJumpRooms(data.rooms);
});

function populateJumpRooms(rooms) {
    jumpWidgetRooms = rooms;
    renderJumpMap();
}

function clearJumpCanvas() {
    if (!jumpWidgetCtx || !jumpWidgetCanvas) return;
    jumpWidgetCtx.fillStyle = '#050505';
    jumpWidgetCtx.fillRect(0, 0, jumpWidgetCanvas.width, jumpWidgetCanvas.height);
}

function renderJumpMap() {
    if (!jumpWidgetRenderer || !jumpWidgetCanvas || !jumpWidgetCtx || jumpWidgetRooms.length === 0) {
        clearJumpCanvas();
        return;
    }
    
    // Ensure canvas is sized to container (not dynamic)
    const container = jumpWidgetCanvas.parentElement;
    if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Only resize if dimensions changed
        if (jumpWidgetCanvas.width !== containerWidth || jumpWidgetCanvas.height !== containerHeight) {
            jumpWidgetCanvas.width = containerWidth;
            jumpWidgetCanvas.height = containerHeight;
            jumpWidgetRenderer.canvas = jumpWidgetCanvas;
            jumpWidgetRenderer.ctx = jumpWidgetCtx;
        }
    }
    
    // Render using MapRenderer (it handles zoom/pan internally)
    jumpWidgetRenderer.render(jumpWidgetRooms, null, '#050505');
}

function getJumpRoomAtPosition(canvasX, canvasY) {
    if (!jumpWidgetRenderer || jumpWidgetRooms.length === 0) return null;
    
    // Use MapRenderer to get room at position
    return jumpWidgetRenderer.getRoomAtPosition(canvasX, canvasY, jumpWidgetRooms);
}

function onJumpCanvasHover(e) {
    if (!jumpWidgetCanvas) return;
    
    const rect = jumpWidgetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getJumpRoomAtPosition(x, y);
    const infoEl = document.getElementById('jumpHoverInfo');
    
    if (!infoEl) return;
    
    if (room) {
        infoEl.innerHTML = `<span class="room-name">${room.name}</span> <span class="room-coords">(${room.x}, ${room.y})</span> - Click to teleport`;
        jumpWidgetCanvas.style.cursor = 'pointer';
    } else {
        infoEl.textContent = 'Click a room to teleport';
        jumpWidgetCanvas.style.cursor = 'crosshair';
    }
}

function onJumpCanvasClick(e) {
    if (!jumpWidgetCanvas) return;
    
    const rect = jumpWidgetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getJumpRoomAtPosition(x, y);
    
    if (room) {
        // Teleport to this room
        game.send({ 
            type: 'jumpToRoom', 
            roomId: room.id 
        });
        terminal.addMessage(`Jumping to ${room.name} (${room.x}, ${room.y})...`, 'info');
        closeJumpWidget();
    }
}

// ============================================================
// AUTOMATION WIDGET - Auto-Path Panel (Feature 1)
// ============================================================
let autoPathMaps = [];
let autoPathRooms = [];
let autoPathCanvas = null;
let autoPathCtx = null;
let autoPathRenderer = null;
let autoPathSelectedMap = null;
let autoPathSelectedRoom = null;
let autoNavigationPath = null;
let isAutoNavigating = false;
let autoPathResizeObserver = null; // ResizeObserver for container
const AUTO_PATH_CELL_SIZE = 15;

// Track current room position from room updates
let currentRoomPosForAutoPath = null;
let currentMapIdForAutoPath = null;

game.messageBus.on('room:update', (data) => {
    if (data.room) {
        currentRoomPosForAutoPath = { x: data.room.x, y: data.room.y };
        currentMapIdForAutoPath = data.room.mapId;
    }
});

game.messageBus.on('room:moved', (data) => {
    if (data.room) {
        currentRoomPosForAutoPath = { x: data.room.x, y: data.room.y };
        currentMapIdForAutoPath = data.room.mapId;
    }
});

function openAutoPathPanel() {
    const panel = document.getElementById('autoPathPanel');
    if (!panel) return;
    
    panel.classList.remove('hidden');
    
    // Initialize canvas
    autoPathCanvas = document.getElementById('autoPathMapCanvas');
    if (!autoPathCanvas) return;
    
    autoPathCtx = autoPathCanvas.getContext('2d');
    
    // Get container and size canvas
    const container = autoPathCanvas.parentElement;
    if (container) {
        autoPathCanvas.width = container.clientWidth;
        autoPathCanvas.height = container.clientHeight;
        
        // Add resize observer to handle container size changes
        if (!autoPathResizeObserver) {
            autoPathResizeObserver = new ResizeObserver(() => {
                if (autoPathCanvas && container) {
                    autoPathCanvas.width = container.clientWidth;
                    autoPathCanvas.height = container.clientHeight;
                    // Re-render if we have rooms
                    if (autoPathRooms.length > 0) {
                        renderAutoPathMap();
                    }
                }
            });
            autoPathResizeObserver.observe(container);
        }
    }
    
    // Initialize MapRenderer for auto-path widget
    if (!autoPathRenderer) {
        autoPathRenderer = new MapRenderer({
            canvas: autoPathCanvas,
            ctx: autoPathCtx,
            cellSize: AUTO_PATH_CELL_SIZE,
            gridSize: null, // Dynamic bounds
            zoom: 1.0,
            panX: 0,
            panY: 0,
            minCellSize: 8,
            maxCellSize: AUTO_PATH_CELL_SIZE,
            shouldDrawConnections: false,
            getRoomColor: (room) => {
                const isCurrentRoom = currentRoomPosForAutoPath && currentMapIdForAutoPath &&
                                      room.x === currentRoomPosForAutoPath.x && 
                                      room.y === currentRoomPosForAutoPath.y &&
                                      autoPathSelectedMap === currentMapIdForAutoPath;
                const isSelectedRoom = autoPathSelectedRoom && autoPathSelectedRoom.id === room.id;
                
                if (isCurrentRoom) {
                    return '#00ff00';
                } else if (isSelectedRoom) {
                    return '#ff8800';
                } else if (room.connected_map_id) {
                    return '#ffffff';
                } else {
                    return '#666';
                }
            },
            getRoomBorder: (room) => {
                const isCurrentRoom = currentRoomPosForAutoPath && currentMapIdForAutoPath &&
                                      room.x === currentRoomPosForAutoPath.x && 
                                      room.y === currentRoomPosForAutoPath.y &&
                                      autoPathSelectedMap === currentMapIdForAutoPath;
                const isSelectedRoom = autoPathSelectedRoom && autoPathSelectedRoom.id === room.id;
                
                if (isCurrentRoom) {
                    return { color: '#ffff00', width: 2 };
                } else if (isSelectedRoom) {
                    return { color: '#ff8800', width: 2 };
                } else {
                    return { color: '#333', width: 1 };
                }
            }
        });
    } else {
        autoPathRenderer.canvas = autoPathCanvas;
        autoPathRenderer.ctx = autoPathCtx;
    }
    
    // Request map list from server
    game.send({ type: 'getAutoPathMaps' });
    
    // Setup event listeners
    const closeBtn = document.getElementById('closeAutoPathPanel');
    if (closeBtn) {
        closeBtn.onclick = closeAutoPathPanel;
    }
    
    const mapSelector = document.getElementById('autoPathMapSelect');
    if (mapSelector) {
        mapSelector.onchange = onAutoPathMapSelected;
    }
    
    // Canvas click and hover handlers
    if (autoPathCanvas) {
        autoPathCanvas.onclick = onAutoPathCanvasClick;
        autoPathCanvas.onmousemove = onAutoPathCanvasHover;
    }
    
    // GO button handler
    const goBtn = document.getElementById('autoPathGoBtn');
    if (goBtn) {
        goBtn.onclick = startAutoNavigation;
    }
}

function closeAutoPathPanel() {
    const panel = document.getElementById('autoPathPanel');
    if (panel) {
        panel.classList.add('hidden');
    }
    
    // Disconnect resize observer when closing
    if (autoPathResizeObserver) {
        autoPathResizeObserver.disconnect();
        autoPathResizeObserver = null;
    }
    
    autoPathMaps = [];
    autoPathRooms = [];
    autoPathSelectedMap = null;
    autoPathSelectedRoom = null;
    autoNavigationPath = null;
    const summary = document.getElementById('autoPathSummary');
    if (summary) {
        summary.style.display = 'none';
    }
}

// Handle auto-path maps from server
game.messageBus.on('autopath:maps', (data) => {
    populateAutoPathMaps(data.maps);
});

function populateAutoPathMaps(maps) {
    autoPathMaps = maps;
    const selector = document.getElementById('autoPathMapSelect');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Select a map...</option>';
    maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map.id;
        option.textContent = map.name;
        selector.appendChild(option);
    });
}

function onAutoPathMapSelected(e) {
    const mapId = parseInt(e.target.value);
    if (!mapId) {
        autoPathRooms = [];
        autoPathSelectedMap = null;
        clearAutoPathCanvas();
        return;
    }
    
    autoPathSelectedMap = mapId;
    
    // Request rooms for this map
    game.send({ type: 'getAutoPathRooms', mapId });
}

// Handle auto-path rooms from server
game.messageBus.on('autopath:rooms', (data) => {
    populateAutoPathRooms(data.rooms);
});

function populateAutoPathRooms(rooms) {
    autoPathRooms = rooms;
    renderAutoPathMap();
}

function clearAutoPathCanvas() {
    if (!autoPathCtx || !autoPathCanvas) return;
    autoPathCtx.fillStyle = '#050505';
    autoPathCtx.fillRect(0, 0, autoPathCanvas.width, autoPathCanvas.height);
}

function renderAutoPathMap() {
    if (!autoPathRenderer || !autoPathCanvas || autoPathRooms.length === 0) {
        clearAutoPathCanvas();
        return;
    }
    
    // Ensure canvas is sized (should be handled by ResizeObserver, but check here too)
    const container = autoPathCanvas.parentElement;
    if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Only resize if dimensions changed
        if (autoPathCanvas.width !== containerWidth || autoPathCanvas.height !== containerHeight) {
            autoPathCanvas.width = containerWidth;
            autoPathCanvas.height = containerHeight;
        }
    }
    
    // Update renderer references in case they changed
    autoPathRenderer.canvas = autoPathCanvas;
    autoPathRenderer.ctx = autoPathCtx;
    
    // Render using MapRenderer (it will calculate bounds dynamically)
    autoPathRenderer.render(autoPathRooms, null, '#050505');
}

function getAutoPathRoomAtPosition(canvasX, canvasY) {
    if (!autoPathRenderer || autoPathRooms.length === 0) return null;
    return autoPathRenderer.getRoomAtPosition(canvasX, canvasY, autoPathRooms);
}

function onAutoPathCanvasHover(e) {
    if (!autoPathCanvas) return;
    const rect = autoPathCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getAutoPathRoomAtPosition(x, y);
    const infoEl = document.getElementById('autoPathHoverInfo');
    
    if (!infoEl) return;
    
    if (room) {
        infoEl.innerHTML = `<span class="room-name">${room.name}</span> <span class="room-coords">(${room.x}, ${room.y})</span> - Click to set destination`;
        autoPathCanvas.style.cursor = 'pointer';
    } else {
        infoEl.textContent = 'Select a map, then click a room to set destination';
        autoPathCanvas.style.cursor = 'crosshair';
    }
}

function onAutoPathCanvasClick(e) {
    if (!autoPathCanvas) return;
    const rect = autoPathCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const room = getAutoPathRoomAtPosition(x, y);
    
    if (room) {
        autoPathSelectedRoom = room;
        renderAutoPathMap();
        
        // Calculate path
        game.send({ 
            type: 'calculateAutoPath', 
            targetRoomId: room.id 
        });
    }
}

// Handle auto-path calculated from server
game.messageBus.on('autopath:calculated', (data) => {
    if (data.success && data.path) {
        autoNavigationPath = data.path;
        displayAutoPathSummary(data.path);
    } else {
        terminal.addMessage(data.message || 'Failed to calculate path', 'error');
    }
});

function displayAutoPathSummary(path) {
    const summary = document.getElementById('autoPathSummary');
    const stepsDiv = document.getElementById('autoPathSteps');
    
    if (!summary || !stepsDiv) return;
    
    if (!path || path.length === 0) {
        stepsDiv.innerHTML = '<div class="path-step">Already at destination!</div>';
    } else {
        stepsDiv.innerHTML = '';
        let lastMapId = null;
        path.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'path-step';
            
            // Show map transition if map changed
            let mapTransition = '';
            if (step.mapId && step.mapId !== lastMapId && lastMapId !== null) {
                mapTransition = `<span class="path-map-transition">→ Entering ${step.mapName || 'Unknown Map'}</span><br>`;
            }
            lastMapId = step.mapId;
            
            stepDiv.innerHTML = mapTransition + `<span class="path-direction">${step.direction}</span> → <span class="path-room">${step.roomName}</span>`;
            stepsDiv.appendChild(stepDiv);
        });
    }
    
    summary.style.display = 'block';
}

function startAutoNavigation() {
    if (!autoNavigationPath || autoNavigationPath.length === 0) {
        terminal.addMessage('No path to navigate', 'error');
        return;
    }
    
    game.send({ 
        type: 'startAutoNavigation', 
        path: autoNavigationPath 
    });
    
    isAutoNavigating = true;
    updateCompassButtonsState();
    closeAutoPathPanel();
    terminal.addMessage('Auto-navigation started. Movement commands are now blocked.', 'info');
}

// Handle auto-navigation messages
game.messageBus.on('autonav:started', (data) => {
    isAutoNavigating = true;
    updateCompassButtonsState();
    if (data.message) {
        terminal.addMessage(data.message, 'info');
    }
});

game.messageBus.on('autonav:complete', (data) => {
    isAutoNavigating = false;
    autoNavigationPath = null;
    updateCompassButtonsState();
    if (data.message) {
        terminal.addMessage(data.message, 'info');
    }
});

game.messageBus.on('autonav:failed', (data) => {
    isAutoNavigating = false;
    autoNavigationPath = null;
    updateCompassButtonsState();
    if (data.message) {
        terminal.addMessage(data.message, 'error');
    }
});

function updateCompassButtonsState() {
    document.querySelectorAll('.compass-btn').forEach(btn => {
        if (isAutoNavigating) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
}

// ============================================================
// AUTOMATION WIDGET - Path/Loop Execution (Feature 2)
// ============================================================
let allPlayerPaths = [];
let selectedPathId = null;
let isPathExecuting = false;
let isPathPaused = false;
let pausedPathRoomId = null;
let pathPreviewData = null;

// Load all player paths on initialization (after authentication)
function loadAllPlayerPaths() {
    const ws = game.getWebSocket();
    if (ws && ws.readyState === WebSocket.OPEN) {
        game.send({ type: 'getAllPlayerPaths' });
    }
}

// Load paths when player is authenticated
game.messageBus.on('player:authenticated', () => {
    // Wait a bit for the connection to be fully ready
    setTimeout(() => {
        loadAllPlayerPaths();
    }, 500);
});

// Handle all player paths from server
game.messageBus.on('paths:all', (data) => {
    allPlayerPaths = data.paths || [];
    populatePathDropdown();
});

function populatePathDropdown() {
    const dropdown = document.getElementById('pathLoopSelect');
    if (!dropdown) return;
    
    // Clear existing options except the first placeholder
    dropdown.innerHTML = '<option value="">Select Path/Loop...</option>';
    
    // Add all paths/loops
    allPlayerPaths.forEach(path => {
        const option = document.createElement('option');
        option.value = path.id;
        const typeLabel = path.path_type === 'loop' ? '[Loop]' : '[Path]';
        option.textContent = `${typeLabel} ${path.name} (Map: ${path.map_id})`;
        dropdown.appendChild(option);
    });
}

function onPathSelectChange() {
    const dropdown = document.getElementById('pathLoopSelect');
    const startBtn = document.getElementById('startPathBtn');
    
    if (!dropdown || !startBtn) return;
    
    selectedPathId = dropdown.value ? parseInt(dropdown.value) : null;
    
    // Enable/disable start button
    startBtn.disabled = !selectedPathId || isPathExecuting;
    
    // If path selected, request details for preview
    if (selectedPathId && !isPathExecuting) {
        game.send({ type: 'getPathDetails', pathId: selectedPathId });
    } else {
        // Hide preview if no path selected
        const previewDialog = document.getElementById('pathPreviewDialog');
        if (previewDialog) {
            previewDialog.style.display = 'none';
        }
    }
}

// Handle path details from server
game.messageBus.on('paths:details', (data) => {
    if (data.path && data.steps) {
        calculatePathPreview(data.path, data.steps);
    }
});

function calculatePathPreview(path, steps) {
    // Get current room from room position
    if (!currentRoomPosForAutoPath || !currentMapIdForAutoPath) {
        console.error('Current room not found for path preview');
        return;
    }
    
    // Find current room in mapRooms (we need to get this from mapWidget)
    // For now, we'll use the originRoomId check directly
    const currentRoomId = mapWidget.mapRooms.find(r => 
        r.mapId === currentMapIdForAutoPath && 
        r.x === currentRoomPosForAutoPath.x && 
        r.y === currentRoomPosForAutoPath.y
    )?.id;
    
    if (!currentRoomId) {
        console.error('Current room not found in mapRooms for path preview');
        return;
    }
    
    const playerRooms = steps.map(step => ({
        roomId: step.roomId,
        roomName: step.roomName,
        x: step.x,
        y: step.y,
        direction: step.direction,
        mapId: step.mapId,
        isAlgorithm: false
    }));
    
    // Check if player is at origin
    const isAtOrigin = currentRoomId === path.originRoomId;
    
    if (!isAtOrigin) {
        // Need to calculate path to origin
        game.send({ 
            type: 'calculateAutoPath', 
            targetRoomId: path.originRoomId 
        });
        
        // Store pending preview calculation
        window.pendingPathPreview = {
            path: path,
            playerRooms: playerRooms
        };
        return;
    }
    
    // Show preview with just player rooms (already at origin)
    showPathPreview({
        algorithmRooms: [],
        playerRooms: playerRooms,
        path: path
    });
}

// Handle auto-path calculated for path preview
game.messageBus.on('autopath:calculated', (data) => {
    if (data.success && data.path && window.pendingPathPreview) {
        const pending = window.pendingPathPreview;
        window.pendingPathPreview = null;
        
        // Convert auto-path to algorithm rooms format
        const algorithmRooms = data.path.map(step => ({
            roomId: step.roomId,
            roomName: step.roomName || 'Unknown',
            x: step.x || null,
            y: step.y || null,
            direction: step.direction,
            mapId: step.mapId,
            mapName: step.mapName || `Map ${step.mapId}`
        }));
        
        showPathPreview({
            algorithmRooms: algorithmRooms,
            playerRooms: pending.playerRooms,
            path: pending.path
        });
    }
});

function showPathPreview(routeData) {
    const previewDialog = document.getElementById('pathPreviewDialog');
    const previewContent = document.getElementById('pathPreviewContent');
    
    if (!previewDialog || !previewContent) return;
    
    pathPreviewData = routeData;
    
    let html = '';
    
    // Algorithm route section (if any)
    if (routeData.algorithmRooms && routeData.algorithmRooms.length > 0) {
        html += `<div style="margin-bottom: 10px;"><strong style="color: #888;">Algorithm Route (${routeData.algorithmRooms.length} rooms):</strong></div>`;
        routeData.algorithmRooms.forEach((step, index) => {
            const prevMapId = routeData.algorithmRooms[index - 1]?.mapId || currentMapIdForAutoPath;
            const mapTransition = step.mapId !== prevMapId 
                ? `<span style="color: #888; font-style: italic;">→ Map: ${step.mapName || step.mapId}</span> ` 
                : '';
            html += `<div style="color: #888; font-style: italic; margin-left: 10px;">${mapTransition}${step.direction} → ${step.roomName}</div>`;
        });
        html += '<div style="margin-top: 10px; margin-bottom: 10px; border-top: 1px solid #333;"></div>';
    }
    
    // Player path/loop section
    const pathTypeLabel = routeData.path.path_type === 'loop' ? 'Loop' : 'Path';
    html += `<div style="margin-bottom: 10px;"><strong style="color: #00ff00;">Your ${pathTypeLabel} (${routeData.playerRooms.length} rooms):</strong></div>`;
    routeData.playerRooms.forEach((step, index) => {
        const prevMapId = routeData.playerRooms[index - 1]?.mapId || currentMapIdForAutoPath;
        const mapTransition = step.mapId !== prevMapId 
            ? `<span style="color: #00ff00;">→ Map: ${step.mapId}</span> ` 
            : '';
        html += `<div style="color: #00ff00; margin-left: 10px;">${mapTransition}${step.direction} → ${step.roomName}</div>`;
    });
    
    previewContent.innerHTML = html;
    previewDialog.style.display = 'block';
}

function startPathExecution() {
    if (!selectedPathId) {
        terminal.addMessage('Please select a path or loop first.', 'error');
        return;
    }
    
    if (isPathExecuting && !isPathPaused) {
        terminal.addMessage('Path/Loop execution is already active.', 'error');
        return;
    }
    
    // Clear any pause state when starting fresh
    isPathPaused = false;
    pausedPathRoomId = null;
    
    game.send({ 
        type: 'startPathExecution', 
        pathId: selectedPathId 
    });
}

function stopPathExecution() {
    if (!isPathExecuting) return;
    
    // Get current room ID for pause tracking
    if (currentRoomPosForAutoPath && currentMapIdForAutoPath) {
        const currentRoom = mapWidget.mapRooms.find(r => 
            r.mapId === currentMapIdForAutoPath && 
            r.x === currentRoomPosForAutoPath.x && 
            r.y === currentRoomPosForAutoPath.y
        );
        
        if (currentRoom) {
            pausedPathRoomId = currentRoom.id;
            isPathPaused = true;
        }
    }
    
    game.send({ type: 'stopPathExecution' });
}

function continuePathExecution() {
    if (!isPathPaused || !selectedPathId) {
        terminal.addMessage('No paused path to continue.', 'error');
        return;
    }
    
    // Check if still in the same room
    if (!currentRoomPosForAutoPath || !currentMapIdForAutoPath) {
        terminal.addMessage('Cannot continue: Current room not found.', 'error');
        isPathPaused = false;
        pausedPathRoomId = null;
        updatePathExecutionUI();
        return;
    }
    
    const currentRoom = mapWidget.mapRooms.find(r => 
        r.mapId === currentMapIdForAutoPath && 
        r.x === currentRoomPosForAutoPath.x && 
        r.y === currentRoomPosForAutoPath.y
    );
    
    if (!currentRoom || currentRoom.id !== pausedPathRoomId) {
        // Player has moved - can't continue
        terminal.addMessage('Cannot continue: You have moved from where you stopped. Please restart the path.', 'error');
        isPathPaused = false;
        pausedPathRoomId = null;
        updatePathExecutionUI();
        return;
    }
    
    // Resume execution
    isPathPaused = false;
    pausedPathRoomId = null;
    
    game.send({ 
        type: 'continuePathExecution',
        pathId: selectedPathId
    });
}

function updatePathExecutionUI() {
    const dropdown = document.getElementById('pathLoopSelect');
    const startBtn = document.getElementById('startPathBtn');
    const stopBtn = document.getElementById('stopPathBtn');
    const continueBtn = document.getElementById('continuePathBtn');
    
    if (!dropdown || !startBtn || !stopBtn || !continueBtn) return;
    
    if (isPathExecuting) {
        // Execution active
        dropdown.disabled = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        continueBtn.style.display = 'none';
    } else if (isPathPaused) {
        // Execution paused
        dropdown.disabled = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        continueBtn.style.display = 'block';
    } else {
        // Execution inactive
        dropdown.disabled = false;
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        continueBtn.style.display = 'none';
        startBtn.disabled = !selectedPathId;
    }
}

// Handle path execution messages
game.messageBus.on('paths:executionStarted', (data) => {
    isPathExecuting = true;
    isPathPaused = false;
    pausedPathRoomId = null;
    terminal.addMessage(data.message || 'Path/Loop execution started.', 'success');
    updatePathExecutionUI();
    // Close preview dialog if open
    const previewDialog = document.getElementById('pathPreviewDialog');
    if (previewDialog) {
        previewDialog.style.display = 'none';
    }
});

game.messageBus.on('paths:executionResumed', (data) => {
    isPathExecuting = true;
    isPathPaused = false;
    pausedPathRoomId = null;
    terminal.addMessage(data.message || 'Path/Loop execution resumed.', 'success');
    updatePathExecutionUI();
});

game.messageBus.on('paths:executionComplete', (data) => {
    isPathExecuting = false;
    terminal.addMessage(data.message || 'Path execution complete!', 'success');
    updatePathExecutionUI();
});

game.messageBus.on('paths:executionStopped', (data) => {
    isPathExecuting = false;
    terminal.addMessage(data.message || 'Path/Loop execution stopped.', 'info');
    updatePathExecutionUI();
});

game.messageBus.on('paths:executionFailed', (data) => {
    isPathExecuting = false;
    terminal.addMessage(data.message || 'Path/Loop execution failed.', 'error');
    updatePathExecutionUI();
});

// Initialize automation widget handlers
function initAutomationWidget() {
    // Auto-path button
    const scriptingWalkBtn = document.getElementById('scripting-walk-btn');
    if (scriptingWalkBtn) {
        scriptingWalkBtn.addEventListener('click', () => {
            openAutoPathPanel();
        });
    }
    
    // Path/Loop execution controls
    const pathLoopSelect = document.getElementById('pathLoopSelect');
    if (pathLoopSelect) {
        pathLoopSelect.addEventListener('change', onPathSelectChange);
    }
    
    const startPathBtn = document.getElementById('startPathBtn');
    if (startPathBtn) {
        startPathBtn.addEventListener('click', startPathExecution);
    }
    
    const stopPathBtn = document.getElementById('stopPathBtn');
    if (stopPathBtn) {
        stopPathBtn.addEventListener('click', stopPathExecution);
    }
    
    const continuePathBtn = document.getElementById('continuePathBtn');
    if (continuePathBtn) {
        continuePathBtn.addEventListener('click', continuePathExecution);
    }
    
    const closePathPreviewBtn = document.getElementById('closePathPreviewBtn');
    if (closePathPreviewBtn) {
        closePathPreviewBtn.addEventListener('click', () => {
            const previewDialog = document.getElementById('pathPreviewDialog');
            if (previewDialog) {
                previewDialog.style.display = 'none';
            }
        });
    }
    
    // Paths will be loaded after authentication (see player:authenticated handler above)
}

// Initialize automation widget on page load
initAutomationWidget();

// Expose game instance globally for backward compatibility
window.game = game;
window.terminal = terminal;
window.addToTerminal = (message, type, saveToHistory) => {
    terminal.addMessage(message, type, saveToHistory);
};
window.resetIdleTimer = () => {
    terminal.resetIdleTimer();
};

