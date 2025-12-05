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
import NPCWidget from './components/NPCWidget.js';
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
const npcWidget = new NPCWidget(game);

// Initialize all components
terminal.init();
statsWidget.init();
mapWidget.init();
compassWidget.init();
commsWidget.init();
inventory.init();
npcWidget.init();

// Track last command for /r repeat command
let lastCommand = null;

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
    
    // Handle /r repeat command
    if (input.toLowerCase() === '/r' || input === '/r') {
        if (!lastCommand) {
            terminal.addMessage('No previous command to repeat.', 'error');
            return;
        }
        // Repeat the last command
        input = lastCommand;
    }
    
    // Store the command (but not if it was /r itself)
    if (input.toLowerCase() !== '/r' && input !== '/r') {
        lastCommand = input;
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
    
    // Special handling for 's' command - check if it's followed by arguments
    // If 's' alone, treat as south
    // If 's' followed by item name, treat as sell
    if (cmd === 's') {
        if (args.length === 0) {
            // 's' alone = south
            // Check if auto-navigation/path execution is active, break it first
            if (isAutoNavigating || isPathExecuting) {
                console.log('[parseCommand] Breaking auto-navigation/path execution with directional input');
                if (isAutoNavigating) {
                    isAutoNavigating = false; // Set flag immediately
                    game.send({ type: 'stopAutoNavigation' });
                    terminal.addMessage('Auto-navigation interrupted by manual movement.', 'warning');
                }
                if (isPathExecuting) {
                    isPathExecuting = false; // Set flag immediately
                    executionTracking.isActive = false;
                    hideAutomationStatus();
                    game.send({ type: 'stopPathExecution' });
                    terminal.addMessage('Path/Loop execution interrupted by manual movement.', 'warning');
                }
                // Small delay to ensure server processes stop before move
                setTimeout(() => {
                    terminal.resetIdleTimer();
                    game.send({ type: 'move', direction: 'S' });
                }, 50);
                return null; // Don't return move command immediately
            }
            terminal.resetIdleTimer();
            return { type: 'move', direction: 'S' };
        } else {
            // 's' with args = sell (unless args are direction keywords)
            const directionKeywords = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'n', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd'];
            const firstArg = args[0].toLowerCase();
            if (directionKeywords.includes(firstArg)) {
                // It's a direction, treat as south
                if (isAutoNavigating || isPathExecuting) {
                    console.log('[parseCommand] Breaking auto-navigation/path execution with directional input');
                    if (isAutoNavigating) {
                        isAutoNavigating = false; // Set flag immediately
                        game.send({ type: 'stopAutoNavigation' });
                        terminal.addMessage('Auto-navigation interrupted by manual movement.', 'warning');
                    }
                    if (isPathExecuting) {
                        isPathExecuting = false; // Set flag immediately
                        executionTracking.isActive = false;
                        hideAutomationStatus();
                        game.send({ type: 'stopPathExecution' });
                        terminal.addMessage('Path/Loop execution interrupted by manual movement.', 'warning');
                    }
                    // Small delay to ensure server processes stop before move
                    setTimeout(() => {
                        terminal.resetIdleTimer();
                        game.send({ type: 'move', direction: 'S' });
                    }, 50);
                    return null; // Don't return move command immediately
                }
                terminal.resetIdleTimer();
                return { type: 'move', direction: 'S' };
            } else {
                // It's an item name, treat as sell
                const quantity = args.length > 1 ? parseInt(args[args.length - 1]) : 1;
                const itemName = quantity > 1 ? args.slice(0, -1).join(' ') : args.join(' ');
                return { type: 'sell', itemName: itemName, quantity: isNaN(quantity) ? 1 : quantity };
            }
        }
    }
    
    // Special handling for 'a' command - check if it's followed by arguments
    // If 'a' alone, treat as attune
    // If 'a' followed by direction keywords, treat as movement
    if (cmd === 'a') {
        if (args.length === 0) {
            // 'a' alone = attune
            return { type: 'attune' };
        } else {
            // Check if first arg is a direction keyword
            const directionKeywords = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd'];
            const firstArg = args[0].toLowerCase();
            if (directionKeywords.includes(firstArg)) {
                // It's a direction, but 'a' isn't a direction, so treat as attune with invalid args
                // Just return attune (ignore invalid args)
                return { type: 'attune' };
            } else {
                // It's not a direction, treat as attune (ignore args)
                return { type: 'attune' };
            }
        }
    }
    
    // Command abbreviations
    const commandMap = {
        'n': 'move', 'north': 'move',
        'e': 'move', 'east': 'move',
        'w': 'move', 'west': 'move',
        'ne': 'move', 'northeast': 'move',
        'nw': 'move', 'northwest': 'move',
        'se': 'move', 'southeast': 'move',
        'sw': 'move', 'southwest': 'move',
        'u': 'move', 'up': 'move',
        'd': 'move', 'down': 'move',
        'south': 'move',
        'look': 'look', 'l': 'look',
        'inventory': 'inventory', 'inv': 'inventory', 'i': 'inventory',
        'take': 'take', 't': 'take',
        'drop': 'drop',
        'harvest': 'harvest', 'h': 'harvest',
        'collect': 'harvest', 'c': 'harvest',
        'gather': 'harvest', 'g': 'harvest',
        'attune': 'attune',
        'talk': 'talk', 'say': 'talk',
        'resonate': 'resonate', 'res': 'resonate', 'r': 'resonate',
        'telepath': 'telepath', 'tele': 'telepath', 'tell': 'telepath', 'whisper': 'telepath',
        'help': 'help', '?': 'help',
        'list': 'list', 'li': 'list', 'ls': 'list',
        'buy': 'buy', 'b': 'buy',
        'sell': 'sell',
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
    
    // Handle movement commands - also check if we should break auto-navigation/path execution
    if (commandType === 'move') {
        const directionMap = {
            'n': 'N', 'north': 'N',
            'south': 'S',
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
            // If auto-navigation or path execution is active, break it first
            if (isAutoNavigating || isPathExecuting) {
                console.log('[parseCommand] Breaking auto-navigation/path execution with directional input');
                if (isAutoNavigating) {
                    isAutoNavigating = false; // Set flag immediately
                    game.send({ type: 'stopAutoNavigation' });
                    terminal.addMessage('Auto-navigation interrupted by manual movement.', 'warning');
                }
                if (isPathExecuting) {
                    isPathExecuting = false; // Set flag immediately
                    executionTracking.isActive = false;
                    hideAutomationStatus();
                    game.send({ type: 'stopPathExecution' });
                    terminal.addMessage('Path/Loop execution interrupted by manual movement.', 'warning');
                }
                // Small delay to ensure server processes stop before move
                setTimeout(() => {
                    terminal.resetIdleTimer();
                    game.send({ type: 'move', direction: direction });
                }, 50);
                return null; // Don't return move command immediately
            }
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
            
            // If auto-navigation or path execution is active, break it first
            if (isAutoNavigating || isPathExecuting) {
                console.log('[numpad] Breaking auto-navigation/path execution with numpad input');
                if (isAutoNavigating) {
                    isAutoNavigating = false; // Set flag immediately
                    game.send({ type: 'stopAutoNavigation' });
                    terminal.addMessage('Auto-navigation interrupted by manual movement.', 'warning');
                }
                if (isPathExecuting) {
                    isPathExecuting = false; // Set flag immediately
                    executionTracking.isActive = false;
                    hideAutomationStatus();
                    game.send({ type: 'stopPathExecution' });
                    terminal.addMessage('Path/Loop execution interrupted by manual movement.', 'warning');
                }
                // Small delay to ensure server processes stop before move
                setTimeout(() => {
                    terminal.resetIdleTimer();
                    game.send({ type: 'move', direction: direction });
                }, 50);
                return; // Don't send move immediately
            }
            
            terminal.resetIdleTimer();
            game.send({ type: 'move', direction: direction });
        }
    }
    
    // Handle U (up) key
    const commandInput = document.getElementById('commandInput');
    if (e.key === 'u' || e.key === 'U') {
        if (commandInput && e.target === commandInput) return; // Don't trigger if typing in command input
        
        // If auto-navigation or path execution is active, break it first
        if (isAutoNavigating || isPathExecuting) {
            console.log('[keyboard] Breaking auto-navigation/path execution with U key');
            if (isAutoNavigating) {
                isAutoNavigating = false; // Set flag immediately
                game.send({ type: 'stopAutoNavigation' });
                terminal.addMessage('Auto-navigation interrupted by manual movement.', 'warning');
            }
            if (isPathExecuting) {
                isPathExecuting = false; // Set flag immediately
                executionTracking.isActive = false;
                hideAutomationStatus();
                game.send({ type: 'stopPathExecution' });
                terminal.addMessage('Path/Loop execution interrupted by manual movement.', 'warning');
            }
            // Small delay to ensure server processes stop before move
            setTimeout(() => {
                terminal.resetIdleTimer();
                game.send({ type: 'move', direction: 'U' });
            }, 50);
            return; // Don't send move immediately
        }
        
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
let npcWidgetVisible = false; // NPC widget is special - auto-managed

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

// Expose updateWidgetDisplay globally for NPCWidget and other components
window.updateWidgetDisplay = updateWidgetDisplay;

// Update widget display
function updateWidgetDisplay() {
    // If scripting widget is being shown and execution is active, show status panel
    if (activeWidgets.includes('scripting') && executionTracking.isActive) {
        // Use setTimeout to ensure DOM is updated first
        setTimeout(() => {
            showAutomationStatus();
        }, 50);
    }
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
    
    // Update NPC widget visibility from component
    if (typeof npcWidget !== 'undefined' && npcWidget) {
        npcWidgetVisible = npcWidget.getVisibility();
    }
    
    // Build list of widgets to actually display in slots
    // Auto-managed widgets (factory, npc, warehouse) take priority, then activeWidgets
    let widgetsToShow = [];
    
    // NPC widget takes slot if visible (auto-managed)
    if (npcWidgetVisible) {
        widgetsToShow.push('npc');
    }
    
    // Add toggleable widgets from activeWidgets (filtered by availability)
    const filteredActiveWidgets = activeWidgets.filter(w => {
        if (w === 'godmode' && !godMode) return false;
        if (w === 'warehouse' && !hasWarehouseDeed) return false;
        return true;
    });
    widgetsToShow.push(...filteredActiveWidgets);
    
    // Limit to 4 slots
    widgetsToShow = widgetsToShow.slice(0, 4);
    
    // Hide auto-managed widgets if not in widgetsToShow
    const npcWidgetEl = document.getElementById('widget-npc');
    if (npcWidgetEl && !widgetsToShow.includes('npc')) {
        npcWidgetEl.classList.add('hidden');
    }
    
    // Show widgets in their slots
    slots.forEach((slot, index) => {
        // Always hide empty widget placeholder in this slot
        const slotEmptyWidget = slot.querySelector('.widget-empty');
        if (slotEmptyWidget) {
            slotEmptyWidget.classList.add('hidden');
        }
        
        if (index < widgetsToShow.length) {
            const widgetName = widgetsToShow[index];
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
                
                // Show automation status if scripting widget is shown and execution is active
                if (widgetName === 'scripting' && executionTracking.isActive) {
                    setTimeout(() => {
                        showAutomationStatus();
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
        
        // Update execution tracking if active (only during auto-navigation or path execution)
        // Don't track manual player movement - only track when actively executing
        if (executionTracking.isActive && (isAutoNavigating || isPathExecuting)) {
            executionTracking.totalRoomsVisited++;
            updatePathStepPosition();
        } else if (executionTracking.isActive && !isAutoNavigating && !isPathExecuting) {
            // Execution was marked active but we're not actually executing - stop tracking
            console.log('[room:moved] Execution tracking active but not executing, stopping');
            executionTracking.isActive = false;
        }
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
        // Update both auto-path and global position
        currentRoomPosForAutoPath = { x: data.room.x, y: data.room.y };
        currentMapIdForAutoPath = data.room.mapId;
        currentRoomPos = { x: data.room.x, y: data.room.y };
        currentMapId = data.room.mapId;
    }
});

game.messageBus.on('room:moved', (data) => {
    if (data.room) {
        // Update both auto-path and global position
        currentRoomPosForAutoPath = { x: data.room.x, y: data.room.y };
        currentMapIdForAutoPath = data.room.mapId;
        currentRoomPos = { x: data.room.x, y: data.room.y };
        currentMapId = data.room.mapId;
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
    
    // Add resize observer to handle container size changes (canvas will be sized in renderAutoPathMap)
    const container = autoPathCanvas.parentElement;
    if (container && !autoPathResizeObserver) {
        autoPathResizeObserver = new ResizeObserver(() => {
            // Re-render if we have rooms (renderAutoPathMap will handle canvas sizing)
            if (autoPathRooms.length > 0) {
                renderAutoPathMap();
            }
        });
        autoPathResizeObserver.observe(container);
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
        console.log('[openAutoPathPanel] GO button found, attaching handler');
        goBtn.onclick = () => {
            console.log('[GO Button] Clicked! Calling startAutoNavigation');
            startAutoNavigation();
        };
    } else {
        console.error('[openAutoPathPanel] GO button not found!');
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
    
    // Get container dimensions (matching old client.js approach)
    const container = autoPathCanvas.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth - 30; // Account for padding
    const containerHeight = container.clientHeight - 30;
    
    // Calculate bounds manually (matching old client.js)
    const minX = Math.min(...autoPathRooms.map(r => r.x));
    const maxX = Math.max(...autoPathRooms.map(r => r.x));
    const minY = Math.min(...autoPathRooms.map(r => r.y));
    const maxY = Math.max(...autoPathRooms.map(r => r.y));
    
    const gridWidth = maxX - minX + 1;
    const gridHeight = maxY - minY + 1;
    
    // Calculate cell size to fit container, but maintain minimum size
    const cellSizeX = Math.floor((containerWidth - 40) / gridWidth);
    const cellSizeY = Math.floor((containerHeight - 40) / gridHeight);
    const cellSize = Math.max(Math.min(cellSizeX, cellSizeY, AUTO_PATH_CELL_SIZE), 8);
    
    // Size canvas to fit container
    const canvasWidth = Math.min(gridWidth * cellSize + 40, containerWidth);
    const canvasHeight = Math.min(gridHeight * cellSize + 40, containerHeight);
    
    autoPathCanvas.width = canvasWidth;
    autoPathCanvas.height = canvasHeight;
    
    // Update renderer cell size and references (matching old client.js)
    autoPathRenderer.canvas = autoPathCanvas;
    autoPathRenderer.ctx = autoPathCtx;
    autoPathRenderer.cellSize = cellSize;
    autoPathRenderer.maxCellSize = cellSize;
    
    // Render using MapRenderer
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
        
        // Calculate path (matching old client.js implementation)
        game.send({ 
            type: 'calculateAutoPath', 
            targetRoomId: room.id 
        });
    }
}

// Handle auto-path calculated from server (matching old client.js implementation)
game.messageBus.on('autopath:calculated', (data) => {
    console.log('Auto-path calculated event received:', data);
    if (data.success && data.path) {
        autoNavigationPath = data.path;
        console.log('Calling displayAutoPathSummary with path:', data.path);
        displayAutoPathSummary(data.path);
    } else {
        console.log('Auto-path calculation failed:', data.message);
        autoNavigationPath = null;
        const summary = document.getElementById('autoPathSummary');
        if (summary) {
            summary.style.display = 'none';
        }
        if (data.message) {
            terminal.addMessage(data.message, 'error');
        }
    }
});

function displayAutoPathSummary(path) {
    console.log('displayAutoPathSummary called with path:', path);
    const summary = document.getElementById('autoPathSummary');
    const stepsDiv = document.getElementById('autoPathSteps');
    
    console.log('Summary element:', summary);
    console.log('Steps div element:', stepsDiv);
    
    if (!summary || !stepsDiv) {
        console.error('Summary or steps div not found!');
        return;
    }
    
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
    
    console.log('Setting summary display to block');
    summary.style.display = 'block';
    console.log('Summary display after setting:', summary.style.display);
}

function startAutoNavigation() {
    console.log('[startAutoNavigation] Function called');
    console.log('[startAutoNavigation] autoNavigationPath:', autoNavigationPath);
    
    if (!autoNavigationPath || autoNavigationPath.length === 0) {
        console.error('[startAutoNavigation] No path to navigate!');
        terminal.addMessage('No path to navigate', 'error');
        return;
    }
    
    console.log('[startAutoNavigation] Starting with path length:', autoNavigationPath.length);
    
    // Ensure automation widget is open to show status
    if (!activeWidgets.includes('scripting')) {
        console.log('[startAutoNavigation] Opening automation widget to show status');
        toggleWidget('scripting');
        // Give widget time to render
        setTimeout(() => {
            console.log('[startAutoNavigation] Widget should be open now, initializing tracking');
            initializeAutoNavTracking();
        }, 200);
    } else {
        console.log('[startAutoNavigation] Automation widget already open');
        initializeAutoNavTracking();
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

function initializeAutoNavTracking() {
    console.log('[initializeAutoNavTracking] Called');
    if (autoNavigationPath && autoNavigationPath.length > 0) {
        // Reset tracking for new path
        executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: autoNavigationPath.length,
            isLooping: false,
            loopCount: 0,
            isActive: true
        };
        console.log('[initializeAutoNavTracking] Tracking initialized:', executionTracking);
        showAutomationStatus();
    } else {
        console.warn('[initializeAutoNavTracking] No autoNavigationPath available');
    }
}

// Handle auto-navigation messages
game.messageBus.on('autonav:started', (data) => {
    console.log('[autonav:started] Event received, data:', data);
    console.log('[autonav:started] autoNavigationPath:', autoNavigationPath);
    
    isAutoNavigating = true;
    updateCompassButtonsState();
    
    // Initialize execution tracking for auto-navigation
    if (autoNavigationPath && autoNavigationPath.length > 0) {
        executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: autoNavigationPath.length,
            isLooping: false,
            loopCount: 0,
            isActive: true
        };
        console.log('[autonav:started] Execution tracking initialized:', executionTracking);
        showAutomationStatus();
    } else {
        console.warn('[autonav:started] No autoNavigationPath available!');
    }
    
    if (data.message) {
        terminal.addMessage(data.message, 'info');
    }
});

game.messageBus.on('autonav:complete', (data) => {
    console.log('[autonav:complete] Auto-navigation completed');
    isAutoNavigating = false;
    autoNavigationPath = null;
    executionTracking.isActive = false;
    // Don't hide status immediately - let user see final stats briefly
    // But stop tracking further updates
    setTimeout(() => {
        hideAutomationStatus();
    }, 2000); // Hide after 2 seconds
    updateCompassButtonsState();
    if (data.message) {
        terminal.addMessage(data.message, 'info');
    }
});

game.messageBus.on('autonav:failed', (data) => {
    console.log('[autonav:failed] Auto-navigation failed');
    isAutoNavigating = false;
    autoNavigationPath = null;
    executionTracking.isActive = false;
    hideAutomationStatus();
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
let autoHarvestEnabled = false; // Auto-harvest toggle state

// Execution tracking state
let executionTracking = {
    totalRoomsVisited: 0,
    currentPathStep: 0,
    totalPathSteps: 0,
    isLooping: false,
    loopCount: 0,
    isActive: false
};

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

// Handle path saved event - paths are already refreshed via allPlayerPaths
game.messageBus.on('pathSaved', (data) => {
    // Paths list is automatically refreshed by server sending allPlayerPaths
    // Just show success message
    if (window.terminal) {
        window.terminal.addMessage(`Path "${data.name}" saved successfully!`, 'info');
    }
});

// Handle path deleted event
game.messageBus.on('pathDeleted', (data) => {
    // Paths list is automatically refreshed by server sending allPlayerPaths
    // Clear selection if deleted path was selected
    if (selectedPathId === data.pathId) {
        selectedPathId = null;
        const dropdown = document.getElementById('pathLoopSelect');
        if (dropdown) {
            dropdown.value = '';
        }
        updateDeletePathButton();
    }
    if (window.terminal) {
        window.terminal.addMessage('Path deleted successfully.', 'info');
    }
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
    
    // Update delete button visibility
    updateDeletePathButton();
}

function onPathSelectChange() {
    const dropdown = document.getElementById('pathLoopSelect');
    const startBtn = document.getElementById('startPathBtn');
    
    if (!dropdown || !startBtn) return;
    
    selectedPathId = dropdown.value ? parseInt(dropdown.value) : null;
    
    // Enable/disable start button
    startBtn.disabled = !selectedPathId || isPathExecuting;
    
    // Update delete button visibility
    updateDeletePathButton();
    
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

// Update delete path button visibility
function updateDeletePathButton() {
    const deleteBtn = document.getElementById('deletePathBtn');
    if (!deleteBtn) return;
    
    deleteBtn.disabled = !selectedPathId || isPathExecuting;
}

// Delete selected path
function deleteSelectedPath() {
    if (!selectedPathId) {
        console.warn('[deleteSelectedPath] No path selected');
        return;
    }
    
    const selectedPath = allPlayerPaths.find(p => p.id === selectedPathId);
    if (!selectedPath) {
        console.warn('[deleteSelectedPath] Selected path not found in allPlayerPaths');
        return;
    }
    
    const pathName = selectedPath.name;
    const pathType = selectedPath.path_type === 'loop' ? 'Loop' : 'Path';
    
    // Show in-game confirmation message
    if (window.terminal) {
        window.terminal.addMessage(`${pathType} "${pathName}" deleted.`, 'info');
    }
    
    console.log('[deleteSelectedPath] Sending deletePath request for pathId:', selectedPathId);
    game.send({
        type: 'deletePath',
        pathId: selectedPathId
    });
}

// Handle path details from server
game.messageBus.on('paths:details', (data) => {
    if (data.path && data.steps) {
        calculatePathPreview(data.path, data.steps);
        
        // If execution is active and we don't have step count yet, update it
        if (executionTracking.isActive && executionTracking.totalPathSteps === 0) {
            executionTracking.totalPathSteps = data.steps.length;
            updateAutomationStatus();
        }
    }
});

function calculatePathPreview(path, steps) {
    // Get current room from room position - try multiple sources
    let roomPos = currentRoomPosForAutoPath;
    let mapId = currentMapIdForAutoPath;
    
    // Fallback to global current room position if auto-path position not set
    if ((!roomPos || !mapId) && currentRoomPos && currentMapId) {
        // Use global variables (these are set from room:update and room:moved)
        roomPos = currentRoomPos;
        mapId = currentMapId;
    }
    
    // Fallback to mapWidget current room if available
    if ((!roomPos || !mapId) && mapWidget && mapWidget.currentRoom) {
        roomPos = { x: mapWidget.currentRoom.x, y: mapWidget.currentRoom.y };
        mapId = mapWidget.currentRoom.mapId;
    }
    
    if (!roomPos || !mapId) {
        console.warn('Current room not found for path preview - will show path without algorithm route');
        // Don't return - continue without preview, execution will still work
        // Just show the path without algorithm route
        const playerRooms = steps.map(step => ({
            roomId: step.roomId,
            roomName: step.roomName,
            x: step.x,
            y: step.y,
            direction: step.direction,
            mapId: step.mapId,
            isAlgorithm: false
        }));
        
        showPathPreview({
            algorithmRooms: [],
            playerRooms: playerRooms,
            path: path
        });
        return;
    }
    
    // Update auto-path position variables for consistency
    currentRoomPosForAutoPath = roomPos;
    currentMapIdForAutoPath = mapId;
    
    // Find current room in mapRooms (we need to get this from mapWidget)
    // For now, we'll use the originRoomId check directly
    const currentRoomId = mapWidget.mapRooms.find(r => 
        r.mapId === mapId && 
        r.x === roomPos.x && 
        r.y === roomPos.y
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
    
    // If execution is active and we have playerRooms, update step count
    if (executionTracking.isActive && routeData.playerRooms && routeData.playerRooms.length > 0) {
        if (executionTracking.totalPathSteps === 0 || executionTracking.totalPathSteps !== routeData.playerRooms.length) {
            executionTracking.totalPathSteps = routeData.playerRooms.length;
            updateAutomationStatus();
        }
    }
    
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
    
    // Hide path preview dialog when starting execution
    const previewDialog = document.getElementById('pathPreviewDialog');
    if (previewDialog) {
        previewDialog.style.display = 'none';
    }
    
    // Ensure automation widget is open to show status
    if (!activeWidgets.includes('scripting')) {
        console.log('[startPathExecution] Opening automation widget to show status');
        toggleWidget('scripting');
    }
    
    // Get selected path to check if it's a loop
    const selectedPath = allPlayerPaths.find(p => p.id === selectedPathId);
    const isLoop = selectedPath && selectedPath.path_type === 'loop';
    
    // Request path details if we don't have preview data yet
    if (selectedPath && (!pathPreviewData || !pathPreviewData.playerRooms)) {
        console.log('[startPathExecution] Requesting path details for step count');
        game.send({ type: 'getPathDetails', pathId: selectedPathId });
    }
    
    game.send({ 
        type: 'startPathExecution', 
        pathId: selectedPathId,
        autoHarvestEnabled: isLoop ? autoHarvestEnabled : false // Only enable for loops
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
    const autoHarvestToggle = document.getElementById('autoHarvestToggle');
    
    if (!dropdown || !startBtn || !stopBtn || !continueBtn) return;
    
    // Check if selected path is a loop
    const selectedPath = allPlayerPaths.find(p => p.id === selectedPathId);
    const isLoop = selectedPath && selectedPath.path_type === 'loop';
    
    // Update toggle visibility and state
    if (autoHarvestToggle) {
        const toggleContainer = autoHarvestToggle.closest('.auto-harvest-toggle-container');
        if (toggleContainer) {
            toggleContainer.style.display = isLoop ? 'flex' : 'none';
        }
        autoHarvestToggle.disabled = isPathExecuting || isPathPaused || !isLoop;
    }
    
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
    console.log('[paths:executionStarted] Event received, data:', data);
    
    isPathExecuting = true;
    isPathPaused = false;
    pausedPathRoomId = null;
    
    // Ensure automation widget is open to show status
    if (!activeWidgets.includes('scripting')) {
        console.log('[paths:executionStarted] Opening automation widget to show status');
        toggleWidget('scripting');
        // Give widget time to render
        setTimeout(() => {
            initializePathExecutionTracking(data);
        }, 200);
    } else {
        initializePathExecutionTracking(data);
    }
    
    terminal.addMessage(data.message || 'Path/Loop execution started.', 'success');
    updatePathExecutionUI();
    // Close preview dialog if open
    const previewDialog = document.getElementById('pathPreviewDialog');
    if (previewDialog) {
        previewDialog.style.display = 'none';
    }
});

function initializePathExecutionTracking(data) {
    // Initialize execution tracking for path/loop execution
    const selectedPath = allPlayerPaths.find(p => p.id === selectedPathId);
    
    // Get total steps from pathPreviewData (playerRooms contains the actual steps)
    // Or from data.stepCount if server provides it
    let totalSteps = 0;
    if (data.stepCount) {
        // Server provided step count in the event
        totalSteps = data.stepCount;
        console.log('[initializePathExecutionTracking] Using step count from server:', totalSteps);
    } else if (pathPreviewData && pathPreviewData.playerRooms) {
        totalSteps = pathPreviewData.playerRooms.length;
        console.log('[initializePathExecutionTracking] Using step count from pathPreviewData:', totalSteps);
    } else if (selectedPath && selectedPath.steps) {
        // Try to get from selectedPath if it has steps
        totalSteps = selectedPath.steps.length;
        console.log('[initializePathExecutionTracking] Using step count from selectedPath:', totalSteps);
    } else if (selectedPath) {
        // If we don't have step count, request path details
        console.log('[initializePathExecutionTracking] Requesting path details for step count');
        game.send({ type: 'getPathDetails', pathId: selectedPathId });
        totalSteps = 0; // Will be updated when details arrive
    }
    
    console.log('[initializePathExecutionTracking] Initializing tracking', {
        selectedPathId,
        selectedPath: selectedPath ? { id: selectedPath.id, pathType: selectedPath.pathType } : null,
        pathPreviewData: pathPreviewData ? { 
            hasPlayerRooms: !!pathPreviewData.playerRooms,
            playerRoomsLength: pathPreviewData.playerRooms?.length
        } : null,
        totalSteps,
        serverStepCount: data.stepCount
    });
    
    if (selectedPath) {
        const isLooping = selectedPath.pathType === 'loop';
        // RESET tracking for new path/loop (don't continue from previous)
        executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: totalSteps, // Will be 0 initially if no data, updated when details arrive
            isLooping: isLooping,
            loopCount: 1, // Start at 1 for first iteration (lap counter)
            isActive: true
        };
        console.log('[initializePathExecutionTracking] Tracking initialized (RESET):', executionTracking);
        
        // ALWAYS show status, even if step count is 0 (will update when details arrive)
        showAutomationStatus();
        
        // If we don't have step count yet, update it when path details arrive
        if (totalSteps === 0) {
            // Set up a one-time listener to update step count when details arrive
            const updateStepCount = (detailsData) => {
                if (detailsData.path && detailsData.steps && detailsData.path.id === selectedPathId) {
                    console.log('[initializePathExecutionTracking] Updating step count from path details:', detailsData.steps.length);
                    executionTracking.totalPathSteps = detailsData.steps.length;
                    updateAutomationStatus();
                    // Remove this listener after first update
                    game.messageBus.off('paths:details', updateStepCount);
                }
            };
            game.messageBus.on('paths:details', updateStepCount);
        }
    } else {
        console.warn('[initializePathExecutionTracking] Cannot initialize tracking - no selected path');
    }
}

game.messageBus.on('paths:executionResumed', (data) => {
    isPathExecuting = true;
    isPathPaused = false;
    pausedPathRoomId = null;
    executionTracking.isActive = true;
    showAutomationStatus();
    terminal.addMessage(data.message || 'Path/Loop execution resumed.', 'success');
    updatePathExecutionUI();
});

game.messageBus.on('paths:executionComplete', (data) => {
    console.log('[paths:executionComplete] Path execution completed', {
        isLooping: executionTracking.isLooping,
        totalRooms: executionTracking.totalRoomsVisited,
        loopCount: executionTracking.loopCount
    });
    
    isPathExecuting = false;
    
    // For loops, execution never truly "completes" - it just wraps
    // So we keep tracking active for loops and increment loop counter
    if (executionTracking.isLooping) {
        // Loop completed one iteration - increment counter and reset position
        // Note: loopCount represents the current lap/iteration (starts at 1)
        executionTracking.loopCount++;
        executionTracking.totalRoomsVisited = 0; // Reset room count for new loop iteration
        executionTracking.currentPathStep = 0;
        // Keep tracking active for next loop iteration
        console.log('[paths:executionComplete] Loop iteration complete, loop count:', executionTracking.loopCount);
        // Update status to show 0/total (ready for next iteration) and new loop count
        updateAutomationStatus();
    } else {
        // Path (not loop) - show final position (totalPathSteps/totalPathSteps) and stop tracking
        // Set to final position so it shows correctly
        executionTracking.totalRoomsVisited = executionTracking.totalPathSteps;
        updateAutomationStatus();
        // Stop tracking but keep showing for a bit
        executionTracking.isActive = false;
        // Don't hide immediately - show final stats briefly
        setTimeout(() => {
            hideAutomationStatus();
        }, 2000); // Hide after 2 seconds
    }
    
    terminal.addMessage(data.message || 'Path execution complete!', 'success');
    updatePathExecutionUI();
});

game.messageBus.on('paths:executionStopped', (data) => {
    isPathExecuting = false;
    executionTracking.isActive = false;
    hideAutomationStatus();
    terminal.addMessage(data.message || 'Path/Loop execution stopped.', 'info');
    updatePathExecutionUI();
});

game.messageBus.on('paths:executionFailed', (data) => {
    isPathExecuting = false;
    executionTracking.isActive = false;
    hideAutomationStatus();
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
    
    // Setup delete path button
    const deletePathBtn = document.getElementById('deletePathBtn');
    if (deletePathBtn) {
        deletePathBtn.addEventListener('click', deleteSelectedPath);
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
    
    // Auto-harvest toggle
    const autoHarvestToggle = document.getElementById('autoHarvestToggle');
    if (autoHarvestToggle) {
        autoHarvestToggle.addEventListener('change', (e) => {
            autoHarvestEnabled = e.target.checked;
            console.log('[Auto-Harvest] Toggle changed:', autoHarvestEnabled);
        });
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

// Functions to manage automation status display
function showAutomationStatus() {
    console.log('[showAutomationStatus] Called, executionTracking:', executionTracking);
    
    const statusEl = document.getElementById('automationStatus');
    if (!statusEl) {
        console.error('[Automation Status] Status element not found! Make sure the automation widget is open.');
        // Try to find it with a delay in case DOM isn't ready
        setTimeout(() => {
            const retryEl = document.getElementById('automationStatus');
            if (retryEl) {
                console.log('[Automation Status] Found on retry');
                showAutomationStatus(); // Recursive call now that element exists
            }
        }, 100);
        return;
    }
    
    // Check if parent widget is visible
    const widget = statusEl.closest('.scripting-widget');
    const widgetSlot = statusEl.closest('.scripting-widget-slot');
    
    if (widgetSlot && window.getComputedStyle(widgetSlot).display === 'none') {
        console.warn('[Automation Status] Widget slot is hidden. Status will be shown when widget is opened.');
        // Don't return - still set up the status so it shows when widget opens
    }
    
    // CRITICAL: Remove the inline style attribute completely and rebuild it without display:none
    const currentStyle = statusEl.getAttribute('style') || '';
    // Remove display from the style string
    const newStyle = currentStyle
        .split(';')
        .filter(prop => !prop.trim().startsWith('display'))
        .join(';')
        .trim();
    
    // Set new style without display:none, then explicitly set display:block
    if (newStyle && !newStyle.endsWith(';')) {
        statusEl.setAttribute('style', newStyle + '; display: block;');
    } else {
        statusEl.setAttribute('style', (newStyle || '') + ' display: block;');
    }
    
    // Also set via style property to ensure it takes
    statusEl.style.display = 'block';
    statusEl.style.visibility = 'visible';
    statusEl.style.opacity = '1';
    
    // Also ensure the status panel class doesn't have hidden
    statusEl.classList.remove('hidden');
    
    updateAutomationStatus();
}

function hideAutomationStatus() {
    const statusEl = document.getElementById('automationStatus');
    if (statusEl) {
        statusEl.style.display = 'none';
    }
    // Reset tracking
    executionTracking = {
        totalRoomsVisited: 0,
        currentPathStep: 0,
        totalPathSteps: 0,
        isLooping: false,
        loopCount: 0,
        isActive: false
    };
}

function updateAutomationStatus() {
    if (!executionTracking.isActive) {
        console.log('[updateAutomationStatus] Not active, skipping');
        return;
    }
    
    console.log('[updateAutomationStatus] Updating with data:', executionTracking);
    
    const totalRoomsEl = document.getElementById('totalRoomsVisited');
    const pathPositionEl = document.getElementById('pathPosition');
    const loopCounterEl = document.getElementById('loopCounter');
    const loopCounterContainer = document.getElementById('loopCounterContainer');
    
    console.log('[updateAutomationStatus] Elements found:', {
        totalRooms: !!totalRoomsEl,
        pathPosition: !!pathPositionEl,
        loopCounter: !!loopCounterEl,
        loopContainer: !!loopCounterContainer
    });
    
    if (totalRoomsEl) {
        totalRoomsEl.textContent = executionTracking.totalRoomsVisited;
        console.log('[updateAutomationStatus] Set totalRooms to:', executionTracking.totalRoomsVisited);
    } else {
        console.error('[updateAutomationStatus] totalRoomsVisited element not found!');
    }
    
    if (pathPositionEl) {
        // Update current step based on total rooms visited
        if (executionTracking.totalPathSteps > 0) {
            if (executionTracking.isLooping) {
                // For loops, show position within current iteration (1 to totalPathSteps)
                // When totalRoomsVisited = 0, show 0/total (before first step)
                // When totalRoomsVisited = 1, show 1/total (first step)
                // When totalRoomsVisited = totalPathSteps, show totalPathSteps/total (last step of iteration)
                // When totalRoomsVisited = totalPathSteps + 1, show 1/total (first step of next iteration)
                let currentStepInLoop;
                if (executionTracking.totalRoomsVisited === 0) {
                    currentStepInLoop = 0; // Before starting
                } else {
                    // Calculate position within current loop iteration (1-based)
                    currentStepInLoop = ((executionTracking.totalRoomsVisited - 1) % executionTracking.totalPathSteps) + 1;
                }
                pathPositionEl.textContent = `${currentStepInLoop}/${executionTracking.totalPathSteps}`;
            } else {
                // For paths, show absolute position (1 to totalPathSteps)
                // When totalRoomsVisited = 0, show 0/total (before starting)
                // When totalRoomsVisited = 1, show 1/total (first step)
                // When totalRoomsVisited = totalPathSteps, show totalPathSteps/total (final step)
                // Don't go beyond totalPathSteps
                const currentStep = Math.min(executionTracking.totalRoomsVisited, executionTracking.totalPathSteps);
                pathPositionEl.textContent = `${currentStep}/${executionTracking.totalPathSteps}`;
            }
        } else {
            pathPositionEl.textContent = '0/0'; // Show 0/0 instead of -/- when steps not loaded yet
        }
        console.log('[updateAutomationStatus] Set pathPosition to:', pathPositionEl.textContent);
    } else {
        console.error('[updateAutomationStatus] pathPosition element not found!');
    }
    
    if (loopCounterEl && loopCounterContainer) {
        if (executionTracking.isLooping) {
            // Always show loop counter for loops
            loopCounterContainer.style.setProperty('display', 'block', 'important');
            loopCounterEl.textContent = executionTracking.loopCount;
            console.log('[updateAutomationStatus] Loop counter set to:', executionTracking.loopCount);
        } else {
            loopCounterContainer.style.display = 'none';
        }
    } else if (executionTracking.isLooping) {
        console.error('[updateAutomationStatus] Loop counter elements not found!', {
            loopCounterEl: !!loopCounterEl,
            loopCounterContainer: !!loopCounterContainer
        });
    }
}

// Update current step position when path execution progresses
// We'll track this by listening to room movements and estimating step progress
// For more accurate tracking, we'd need server to send step updates
function updatePathStepPosition() {
    if (!executionTracking.isActive) return;
    
    // Increment current step (approximate - each room movement = 1 step)
    executionTracking.currentPathStep = Math.min(
        executionTracking.totalRoomsVisited,
        executionTracking.totalPathSteps
    );
    
    // For loops, the loop count is handled by paths:executionComplete event
    // when a full loop iteration completes, not here during movement
    
    updateAutomationStatus();
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

