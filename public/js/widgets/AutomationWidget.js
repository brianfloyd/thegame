/**
 * AutomationWidget
 * 
 * Controls for:
 * - Auto-navigate to a specific room
 * - Auto-loop playback
 * - Auto-harvest toggle (only active when near harvestable NPCs)
 * - Auto-path interruption when player moves manually
 */

import Widget from './Widget.js';

export default class AutomationWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        
        // State
        this.allPlayerPaths = [];
        this.selectedPathId = null;
        this.isPathExecuting = false;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        this.pathPreviewData = null;
        this.autoHarvestEnabled = false;
        
        // Execution tracking
        this.executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: 0,
            isLooping: false,
            loopCount: 0,
            isActive: false
        };
        
        // Room position tracking for auto-path
        this.currentRoomPosForAutoPath = null;
        this.currentMapIdForAutoPath = null;
    }
    
    init() {
        super.init();
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-fullwidth';
        root.setAttribute('data-widget', 'automation');
        root.id = 'automationWidget';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Automation';
        root.appendChild(header);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'widget-content';
        
        // Path/Loop selection
        const pathSelectContainer = document.createElement('div');
        pathSelectContainer.style.marginBottom = '12px';
        
        const pathSelectLabel = document.createElement('label');
        pathSelectLabel.textContent = 'Path/Loop:';
        pathSelectLabel.style.display = 'block';
        pathSelectLabel.style.marginBottom = '4px';
        pathSelectLabel.style.color = '#aaa';
        pathSelectContainer.appendChild(pathSelectLabel);
        
        const pathSelect = document.createElement('select');
        pathSelect.id = 'pathLoopSelect';
        pathSelect.className = 'ticket-status-select';
        pathSelect.style.width = '100%';
        pathSelect.style.marginBottom = '8px';
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'Select Path/Loop...';
        pathSelect.appendChild(placeholderOption);
        pathSelectContainer.appendChild(pathSelect);
        
        // Delete path button
        const deletePathBtn = document.createElement('button');
        deletePathBtn.id = 'deletePathBtn';
        deletePathBtn.className = 'ticket-action-btn';
        deletePathBtn.textContent = 'Delete Path';
        deletePathBtn.style.marginBottom = '12px';
        deletePathBtn.disabled = true;
        pathSelectContainer.appendChild(deletePathBtn);
        
        content.appendChild(pathSelectContainer);
        
        // Control buttons
        const controlsContainer = document.createElement('div');
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '8px';
        controlsContainer.style.marginBottom = '12px';
        
        const startBtn = document.createElement('button');
        startBtn.id = 'startPathBtn';
        startBtn.className = 'ticket-action-btn';
        startBtn.textContent = 'Start';
        startBtn.disabled = true;
        controlsContainer.appendChild(startBtn);
        
        const stopBtn = document.createElement('button');
        stopBtn.id = 'stopPathBtn';
        stopBtn.className = 'ticket-action-btn';
        stopBtn.textContent = 'Stop';
        stopBtn.style.display = 'none';
        controlsContainer.appendChild(stopBtn);
        
        const continueBtn = document.createElement('button');
        continueBtn.id = 'continuePathBtn';
        continueBtn.className = 'ticket-action-btn';
        continueBtn.textContent = 'Continue';
        continueBtn.style.display = 'none';
        controlsContainer.appendChild(continueBtn);
        
        content.appendChild(controlsContainer);
        
        // Auto-harvest toggle (only shown for loops)
        const autoHarvestContainer = document.createElement('div');
        autoHarvestContainer.className = 'auto-harvest-toggle-container';
        autoHarvestContainer.style.display = 'none';
        autoHarvestContainer.style.marginBottom = '12px';
        autoHarvestContainer.style.alignItems = 'center';
        autoHarvestContainer.style.gap = '8px';
        
        const autoHarvestLabel = document.createElement('label');
        autoHarvestLabel.textContent = 'Auto-Harvest:';
        autoHarvestLabel.style.color = '#aaa';
        autoHarvestContainer.appendChild(autoHarvestLabel);
        
        const autoHarvestToggle = document.createElement('input');
        autoHarvestToggle.id = 'autoHarvestToggle';
        autoHarvestToggle.type = 'checkbox';
        autoHarvestToggle.checked = false;
        autoHarvestContainer.appendChild(autoHarvestToggle);
        
        content.appendChild(autoHarvestContainer);
        
        // Automation status panel
        const statusPanel = document.createElement('div');
        statusPanel.id = 'automationStatus';
        statusPanel.style.display = 'none';
        statusPanel.style.padding = '12px';
        statusPanel.style.backgroundColor = '#1a1a2e';
        statusPanel.style.border = '1px solid #667eea';
        statusPanel.style.borderRadius = '4px';
        statusPanel.style.marginTop = '12px';
        
        const statusTitle = document.createElement('div');
        statusTitle.textContent = 'Execution Status';
        statusTitle.style.fontWeight = 'bold';
        statusTitle.style.marginBottom = '8px';
        statusTitle.style.color = '#00ffff';
        statusPanel.appendChild(statusTitle);
        
        const statusGrid = document.createElement('div');
        statusGrid.style.display = 'grid';
        statusGrid.style.gridTemplateColumns = '1fr 1fr';
        statusGrid.style.gap = '8px';
        
        // Total rooms visited
        const totalRoomsLabel = document.createElement('div');
        totalRoomsLabel.textContent = 'Rooms Visited:';
        totalRoomsLabel.style.color = '#aaa';
        statusGrid.appendChild(totalRoomsLabel);
        
        const totalRoomsValue = document.createElement('div');
        totalRoomsValue.id = 'totalRoomsVisited';
        totalRoomsValue.textContent = '0';
        totalRoomsValue.style.color = '#00ffff';
        statusGrid.appendChild(totalRoomsValue);
        
        // Path position
        const pathPosLabel = document.createElement('div');
        pathPosLabel.textContent = 'Position:';
        pathPosLabel.style.color = '#aaa';
        statusGrid.appendChild(pathPosLabel);
        
        const pathPosValue = document.createElement('div');
        pathPosValue.id = 'pathPosition';
        pathPosValue.textContent = '0/0';
        pathPosValue.style.color = '#00ffff';
        statusGrid.appendChild(pathPosValue);
        
        // Loop counter (only for loops)
        const loopCounterContainer = document.createElement('div');
        loopCounterContainer.id = 'loopCounterContainer';
        loopCounterContainer.style.display = 'none';
        loopCounterContainer.style.gridColumn = '1 / -1';
        loopCounterContainer.style.marginTop = '8px';
        loopCounterContainer.style.paddingTop = '8px';
        loopCounterContainer.style.borderTop = '1px solid #333';
        
        const loopCounterLabel = document.createElement('div');
        loopCounterLabel.textContent = 'Loop Count:';
        loopCounterLabel.style.color = '#aaa';
        loopCounterContainer.appendChild(loopCounterLabel);
        
        const loopCounterValue = document.createElement('div');
        loopCounterValue.id = 'loopCounter';
        loopCounterValue.textContent = '0';
        loopCounterValue.style.color = '#ff00ff';
        loopCounterValue.style.fontSize = '1.2em';
        loopCounterValue.style.fontWeight = 'bold';
        loopCounterContainer.appendChild(loopCounterValue);
        
        statusGrid.appendChild(loopCounterContainer);
        statusPanel.appendChild(statusGrid);
        
        content.appendChild(statusPanel);
        
        root.appendChild(content);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Load paths if player is authenticated
        // Listen for authentication event
        const authHandler = () => {
            setTimeout(() => {
                this.loadAllPlayerPaths();
            }, 500);
        };
        this.game.messageBus.on('player:authenticated', authHandler);
        
        // Store handler reference for cleanup
        this._authHandler = authHandler;
        
        // Also try to load immediately if already authenticated
        if (this.game.currentPlayerName) {
            setTimeout(() => {
                this.loadAllPlayerPaths();
            }, 500);
        }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const pathSelect = this.rootElement.querySelector('#pathLoopSelect');
        const startBtn = this.rootElement.querySelector('#startPathBtn');
        const stopBtn = this.rootElement.querySelector('#stopPathBtn');
        const continueBtn = this.rootElement.querySelector('#continuePathBtn');
        const deleteBtn = this.rootElement.querySelector('#deletePathBtn');
        const autoHarvestToggle = this.rootElement.querySelector('#autoHarvestToggle');
        
        if (pathSelect) {
            pathSelect.addEventListener('change', () => this.onPathSelectChange());
        }
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startPathExecution());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopPathExecution());
        }
        
        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.continuePathExecution());
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSelectedPath());
        }
        
        if (autoHarvestToggle) {
            autoHarvestToggle.addEventListener('change', (e) => {
                this.autoHarvestEnabled = e.target.checked;
                console.log('[AutomationWidget] Auto-harvest toggle changed:', this.autoHarvestEnabled);
            });
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'paths:all') {
            this.handleAllPlayerPaths(msg);
        } else if (msg.type === 'paths:details') {
            this.handlePathDetails(msg);
        } else if (msg.type === 'pathSaved') {
            // Paths list is automatically refreshed by server sending allPlayerPaths
            if (window.terminal) {
                window.terminal.addMessage(`Path "${msg.name}" saved successfully!`, 'info');
            }
        } else if (msg.type === 'pathDeleted') {
            this.handlePathDeleted(msg);
        } else if (msg.type === 'paths:executionStarted') {
            this.handlePathExecutionStarted(msg);
        } else if (msg.type === 'paths:executionResumed') {
            this.handlePathExecutionResumed(msg);
        } else if (msg.type === 'paths:executionComplete') {
            this.handlePathExecutionComplete(msg);
        } else if (msg.type === 'paths:executionStopped') {
            this.handlePathExecutionStopped(msg);
        } else if (msg.type === 'paths:executionFailed') {
            this.handlePathExecutionFailed(msg);
        } else if (msg.type === 'autonav:started') {
            this.handleAutoNavigationStarted(msg);
        } else if (msg.type === 'autonav:complete') {
            this.handleAutoNavigationComplete(msg);
        } else if (msg.type === 'autonav:failed') {
            this.handleAutoNavigationFailed(msg);
        } else if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomMovement(msg);
        }
    }
    
    /**
     * Load all player paths
     */
    loadAllPlayerPaths() {
        const ws = this.game.getWebSocket();
        if (ws && ws.readyState === WebSocket.OPEN) {
            this.game.send({ type: 'getAllPlayerPaths' });
        }
    }
    
    /**
     * Handle all player paths from server
     */
    handleAllPlayerPaths(data) {
        this.allPlayerPaths = data.paths || [];
        this.populatePathDropdown();
    }
    
    /**
     * Populate path dropdown
     */
    populatePathDropdown() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        if (!dropdown) return;
        
        // Clear existing options except the first placeholder
        dropdown.innerHTML = '<option value="">Select Path/Loop...</option>';
        
        // Add all paths/loops
        this.allPlayerPaths.forEach(path => {
            const option = document.createElement('option');
            option.value = path.id;
            const typeLabel = path.path_type === 'loop' ? '[Loop]' : '[Path]';
            option.textContent = `${typeLabel} ${path.name} (Map: ${path.map_id})`;
            dropdown.appendChild(option);
        });
        
        // Update delete button visibility
        this.updateDeletePathButton();
    }
    
    /**
     * Handle path selection change
     */
    onPathSelectChange() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        const startBtn = this.rootElement.querySelector('#startPathBtn');
        
        if (!dropdown || !startBtn) return;
        
        this.selectedPathId = dropdown.value ? parseInt(dropdown.value) : null;
        
        // Enable/disable start button
        startBtn.disabled = !this.selectedPathId || this.isPathExecuting;
        
        // Update delete button visibility
        this.updateDeletePathButton();
        
        // If path selected, request details for preview
        if (this.selectedPathId && !this.isPathExecuting) {
            this.game.send({ type: 'getPathDetails', pathId: this.selectedPathId });
        } else {
            // Hide preview if no path selected
            const previewDialog = document.getElementById('pathPreviewDialog');
            if (previewDialog) {
                previewDialog.style.display = 'none';
            }
        }
    }
    
    /**
     * Update delete path button visibility
     */
    updateDeletePathButton() {
        const deleteBtn = this.rootElement.querySelector('#deletePathBtn');
        if (!deleteBtn) return;
        
        deleteBtn.disabled = !this.selectedPathId || this.isPathExecuting;
    }
    
    /**
     * Delete selected path
     */
    deleteSelectedPath() {
        if (!this.selectedPathId) {
            console.warn('[AutomationWidget] No path selected');
            return;
        }
        
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        if (!selectedPath) {
            console.warn('[AutomationWidget] Selected path not found');
            return;
        }
        
        const pathName = selectedPath.name;
        const pathType = selectedPath.path_type === 'loop' ? 'Loop' : 'Path';
        
        if (window.terminal) {
            window.terminal.addMessage(`${pathType} "${pathName}" deleted.`, 'info');
        }
        
        this.game.send({
            type: 'deletePath',
            pathId: this.selectedPathId
        });
    }
    
    /**
     * Handle path details from server
     */
    handlePathDetails(data) {
        if (data.path && data.steps) {
            // Store preview data
            this.pathPreviewData = {
                path: data.path,
                steps: data.steps,
                playerRooms: data.steps.map(step => ({
                    roomId: step.roomId,
                    roomName: step.roomName,
                    x: step.x,
                    y: step.y,
                    direction: step.direction,
                    mapId: step.mapId
                }))
            };
            
            // If execution is active and we don't have step count yet, update it
            if (this.executionTracking.isActive && this.executionTracking.totalPathSteps === 0) {
                this.executionTracking.totalPathSteps = data.steps.length;
                this.updateAutomationStatus();
            }
        }
    }
    
    /**
     * Handle path deleted
     */
    handlePathDeleted(data) {
        // Clear selection if deleted path was selected
        if (this.selectedPathId === data.pathId) {
            this.selectedPathId = null;
            const dropdown = this.rootElement.querySelector('#pathLoopSelect');
            if (dropdown) {
                dropdown.value = '';
            }
            this.updateDeletePathButton();
        }
        
        if (window.terminal) {
            window.terminal.addMessage('Path deleted successfully.', 'info');
        }
    }
    
    /**
     * Start path execution
     */
    startPathExecution() {
        if (!this.selectedPathId) {
            if (window.terminal) {
                window.terminal.addMessage('Please select a path or loop first.', 'error');
            }
            return;
        }
        
        if (this.isPathExecuting && !this.isPathPaused) {
            if (window.terminal) {
                window.terminal.addMessage('Path/Loop execution is already active.', 'error');
            }
            return;
        }
        
        // Clear any pause state when starting fresh
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        // Hide path preview dialog when starting execution
        const previewDialog = document.getElementById('pathPreviewDialog');
        if (previewDialog) {
            previewDialog.style.display = 'none';
        }
        
        // Get selected path to check if it's a loop
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        const isLoop = selectedPath && selectedPath.path_type === 'loop';
        
        // Request path details if we don't have preview data yet
        if (selectedPath && (!this.pathPreviewData || !this.pathPreviewData.playerRooms)) {
            this.game.send({ type: 'getPathDetails', pathId: this.selectedPathId });
        }
        
        this.game.send({ 
            type: 'startPathExecution', 
            pathId: this.selectedPathId,
            autoHarvestEnabled: isLoop ? this.autoHarvestEnabled : false // Only enable for loops
        });
    }
    
    /**
     * Stop path execution
     */
    stopPathExecution() {
        if (!this.isPathExecuting) return;
        
        // Get current room ID for pause tracking
        // Try to get from mapWidget if available
        const mapWidget = this.game?.widgetManager?.widgets?.get('map');
        if (mapWidget && this.currentRoomPosForAutoPath && this.currentMapIdForAutoPath) {
            const currentRoom = mapWidget.mapRooms?.find(r => 
                r.mapId === this.currentMapIdForAutoPath && 
                r.x === this.currentRoomPosForAutoPath.x && 
                r.y === this.currentRoomPosForAutoPath.y
            );
            
            if (currentRoom) {
                this.pausedPathRoomId = currentRoom.id;
                this.isPathPaused = true;
            }
        } else {
            // Fallback: just mark as paused without room ID
            this.isPathPaused = true;
        }
        
        this.game.send({ type: 'stopPathExecution' });
    }
    
    /**
     * Continue path execution
     */
    continuePathExecution() {
        if (!this.isPathPaused || !this.selectedPathId) {
            if (window.terminal) {
                window.terminal.addMessage('No paused path to continue.', 'error');
            }
            return;
        }
        
        // Check if still in the same room (if we have pause room ID)
        if (this.pausedPathRoomId) {
            const mapWidget = this.game?.widgetManager?.widgets?.get('map');
            if (!mapWidget || !this.currentRoomPosForAutoPath || !this.currentMapIdForAutoPath) {
                if (window.terminal) {
                    window.terminal.addMessage('Cannot continue: Current room not found.', 'error');
                }
                this.isPathPaused = false;
                this.pausedPathRoomId = null;
                this.updatePathExecutionUI();
                return;
            }
            
            const currentRoom = mapWidget.mapRooms?.find(r => 
                r.mapId === this.currentMapIdForAutoPath && 
                r.x === this.currentRoomPosForAutoPath.x && 
                r.y === this.currentRoomPosForAutoPath.y
            );
            
            if (!currentRoom || currentRoom.id !== this.pausedPathRoomId) {
                // Player has moved - can't continue
                if (window.terminal) {
                    window.terminal.addMessage('Cannot continue: You have moved from where you stopped. Please restart the path.', 'error');
                }
                this.isPathPaused = false;
                this.pausedPathRoomId = null;
                this.updatePathExecutionUI();
                return;
            }
        }
        
        // Resume execution
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        this.game.send({ 
            type: 'continuePathExecution',
            pathId: this.selectedPathId
        });
    }
    
    /**
     * Handle path execution started
     */
    handlePathExecutionStarted(data) {
        this.isPathExecuting = true;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        
        // Initialize execution tracking
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        if (selectedPath) {
            const isLooping = selectedPath.path_type === 'loop';
            
            // Get total steps from various sources
            let totalSteps = 0;
            if (data.stepCount) {
                totalSteps = data.stepCount;
            } else if (this.pathPreviewData && this.pathPreviewData.steps) {
                totalSteps = this.pathPreviewData.steps.length;
            } else if (this.pathPreviewData && this.pathPreviewData.playerRooms) {
                totalSteps = this.pathPreviewData.playerRooms.length;
            }
            
            this.executionTracking = {
                totalRoomsVisited: 0,
                currentPathStep: 0,
                totalPathSteps: totalSteps,
                isLooping: isLooping,
                loopCount: 1,
                isActive: true
            };
            
            this.showAutomationStatus();
        }
        
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution resumed
     */
    handlePathExecutionResumed(data) {
        this.isPathExecuting = true;
        this.isPathPaused = false;
        this.pausedPathRoomId = null;
        this.executionTracking.isActive = true;
        this.showAutomationStatus();
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution complete
     */
    handlePathExecutionComplete(data) {
        // For loops, increment loop count and reset position for next iteration
        if (this.executionTracking.isLooping) {
            this.executionTracking.loopCount++;
            this.executionTracking.totalRoomsVisited = 0; // Reset for new loop iteration
            this.executionTracking.currentPathStep = 0;
            // Keep tracking active for next loop iteration
            this.updateAutomationStatus();
        } else {
            // For paths, execution is complete
            this.executionTracking.totalRoomsVisited = this.executionTracking.totalPathSteps;
            this.updateAutomationStatus();
            this.isPathExecuting = false;
            this.executionTracking.isActive = false;
            this.updatePathExecutionUI();
            
            // Hide status after a delay
            setTimeout(() => {
                this.hideAutomationStatus();
            }, 2000);
        }
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'success');
        }
    }
    
    /**
     * Handle path execution stopped
     */
    handlePathExecutionStopped(data) {
        this.isPathExecuting = false;
        this.executionTracking.isActive = false;
        this.hideAutomationStatus();
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle path execution failed
     */
    handlePathExecutionFailed(data) {
        this.isPathExecuting = false;
        this.executionTracking.isActive = false;
        this.hideAutomationStatus();
        this.updatePathExecutionUI();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'error');
        }
    }
    
    /**
     * Handle auto-navigation started
     */
    handleAutoNavigationStarted(data) {
        // Initialize execution tracking for auto-navigation
        // Note: autoNavigationPath would need to be passed or retrieved
        // For now, we'll track based on room movements
        this.executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: 0, // Will be updated as we navigate
            isLooping: false,
            loopCount: 0,
            isActive: true
        };
        
        this.showAutomationStatus();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle auto-navigation complete
     */
    handleAutoNavigationComplete(data) {
        this.executionTracking.isActive = false;
        
        // Hide status after a delay
        setTimeout(() => {
            this.hideAutomationStatus();
        }, 2000);
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'info');
        }
    }
    
    /**
     * Handle auto-navigation failed
     */
    handleAutoNavigationFailed(data) {
        this.executionTracking.isActive = false;
        this.hideAutomationStatus();
        
        if (data.message && window.terminal) {
            window.terminal.addMessage(data.message, 'error');
        }
    }
    
    /**
     * Handle room movement
     */
    handleRoomMovement(data) {
        if (data.room) {
            // Update room position tracking
            this.currentRoomPosForAutoPath = { x: data.room.x, y: data.room.y };
            this.currentMapIdForAutoPath = data.room.mapId;
            
            // Update execution tracking if active and path is executing
            if (this.executionTracking.isActive && this.isPathExecuting) {
                this.executionTracking.totalRoomsVisited++;
                this.updatePathStepPosition();
            } else if (this.executionTracking.isActive && !this.isPathExecuting) {
                // Execution was marked active but we're not actually executing - stop tracking
                this.executionTracking.isActive = false;
            }
            
            // Check for manual movement interruption
            if (this.isPathExecuting && !this.isPathPaused) {
                // If player manually moved (not via automation), stop execution
                // This is handled by the server, but we can also check here
            }
        }
    }
    
    /**
     * Update path step position
     */
    updatePathStepPosition() {
        if (!this.executionTracking.isActive) return;
        
        // Increment current step (approximate - each room movement = 1 step)
        this.executionTracking.currentPathStep = Math.min(
            this.executionTracking.totalRoomsVisited,
            this.executionTracking.totalPathSteps
        );
        
        this.updateAutomationStatus();
    }
    
    /**
     * Update path execution UI
     */
    updatePathExecutionUI() {
        const dropdown = this.rootElement.querySelector('#pathLoopSelect');
        const startBtn = this.rootElement.querySelector('#startPathBtn');
        const stopBtn = this.rootElement.querySelector('#stopPathBtn');
        const continueBtn = this.rootElement.querySelector('#continuePathBtn');
        const autoHarvestToggle = this.rootElement.querySelector('#autoHarvestToggle');
        const autoHarvestContainer = this.rootElement.querySelector('.auto-harvest-toggle-container');
        
        if (!dropdown || !startBtn || !stopBtn || !continueBtn) return;
        
        // Check if selected path is a loop
        const selectedPath = this.allPlayerPaths.find(p => p.id === this.selectedPathId);
        const isLoop = selectedPath && selectedPath.path_type === 'loop';
        
        // Update toggle visibility and state
        if (autoHarvestToggle && autoHarvestContainer) {
            autoHarvestContainer.style.display = isLoop ? 'flex' : 'none';
            autoHarvestToggle.disabled = this.isPathExecuting || this.isPathPaused || !isLoop;
        }
        
        if (this.isPathExecuting && !this.isPathPaused) {
            // Execution active
            dropdown.disabled = true;
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            continueBtn.style.display = 'none';
        } else if (this.isPathPaused) {
            // Execution paused
            dropdown.disabled = true;
            startBtn.style.display = 'none';
            stopBtn.style.display = 'none';
            continueBtn.style.display = 'inline-block';
        } else {
            // Execution inactive
            dropdown.disabled = false;
            startBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            continueBtn.style.display = 'none';
            startBtn.disabled = !this.selectedPathId;
        }
    }
    
    /**
     * Show automation status
     */
    showAutomationStatus() {
        const statusEl = this.rootElement.querySelector('#automationStatus');
        if (!statusEl) {
            console.error('[AutomationWidget] Status element not found');
            return;
        }
        
        statusEl.style.display = 'block';
        statusEl.style.visibility = 'visible';
        statusEl.style.opacity = '1';
        statusEl.classList.remove('hidden');
        
        this.updateAutomationStatus();
    }
    
    /**
     * Hide automation status
     */
    hideAutomationStatus() {
        const statusEl = this.rootElement.querySelector('#automationStatus');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
        
        // Reset tracking
        this.executionTracking = {
            totalRoomsVisited: 0,
            currentPathStep: 0,
            totalPathSteps: 0,
            isLooping: false,
            loopCount: 0,
            isActive: false
        };
    }
    
    /**
     * Update automation status display
     */
    updateAutomationStatus() {
        if (!this.executionTracking.isActive) {
            return;
        }
        
        const totalRoomsEl = this.rootElement.querySelector('#totalRoomsVisited');
        const pathPositionEl = this.rootElement.querySelector('#pathPosition');
        const loopCounterEl = this.rootElement.querySelector('#loopCounter');
        const loopCounterContainer = this.rootElement.querySelector('#loopCounterContainer');
        
        if (totalRoomsEl) {
            totalRoomsEl.textContent = this.executionTracking.totalRoomsVisited;
        }
        
        if (pathPositionEl) {
            if (this.executionTracking.totalPathSteps > 0) {
                if (this.executionTracking.isLooping) {
                    // For loops, show position within current iteration
                    let currentStepInLoop;
                    if (this.executionTracking.totalRoomsVisited === 0) {
                        currentStepInLoop = 0;
                    } else {
                        currentStepInLoop = ((this.executionTracking.totalRoomsVisited - 1) % this.executionTracking.totalPathSteps) + 1;
                    }
                    pathPositionEl.textContent = `${currentStepInLoop}/${this.executionTracking.totalPathSteps}`;
                } else {
                    // For paths, show absolute position
                    const currentStep = Math.min(this.executionTracking.totalRoomsVisited, this.executionTracking.totalPathSteps);
                    pathPositionEl.textContent = `${currentStep}/${this.executionTracking.totalPathSteps}`;
                }
            } else {
                pathPositionEl.textContent = '0/0';
            }
        }
        
        if (loopCounterEl && loopCounterContainer) {
            if (this.executionTracking.isLooping) {
                loopCounterContainer.style.display = 'block';
                loopCounterEl.textContent = this.executionTracking.loopCount;
            } else {
                loopCounterContainer.style.display = 'none';
            }
        }
    }
    
    /**
     * Called before widget is detached
     */
    onDetach() {
        // Cleanup message bus listeners
        if (this._authHandler) {
            this.game.messageBus.off('player:authenticated', this._authHandler);
        }
    }
}


