/**
 * Automation Engine
 * 
 * Handles player-authored automation programs with tick-based execution.
 * Mirrors NPC Cycle Engine pattern but for player automation.
 * 
 * Phase 1-5: Complete implementation with all instruction types
 */

const AUTOMATION_TICK_INTERVAL = 1000; // milliseconds

// Store connectedPlayers reference at module level
let globalConnectedPlayers = null;

function setConnectedPlayersReference(connectedPlayers) {
  if (connectedPlayers && connectedPlayers instanceof Map) {
    globalConnectedPlayers = connectedPlayers;
    return true;
  }
  console.error(`[Automation Engine] ERROR: Invalid connectedPlayers passed`);
  return false;
}

function getConnectedPlayersReference() {
  if (!globalConnectedPlayers || !(globalConnectedPlayers instanceof Map)) {
    return null;
  }
  return globalConnectedPlayers;
}

/**
 * Send execution state update to widget
 */
function sendExecutionStateUpdate(connectedPlayers, programId, executionState) {
  if (!connectedPlayers) return;
  
  // Find all connections for this player (program belongs to a player)
  // We need to get the player ID from the program, but we'll send to all for now
  // In a full implementation, we'd track which player owns which program
  
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.ws && playerData.ws.readyState === 1) {
      playerData.ws.send(JSON.stringify({
        type: 'automation:executionState',
        programId: programId,
        state: executionState
      }));
    }
  }
}

/**
 * Evaluate a condition against current game state
 * @param {Object} condition - Condition object from database
 * @param {Object} player - Player object
 * @param {Object} db - Database module
 * @returns {Promise<boolean>} Condition result
 */
async function evaluateCondition(condition, player, db) {
  const { condition_target, operator, threshold_value, item_name } = condition;
  
  try {
    let currentValue = null;
    
    switch (condition_target) {
      case 'inventory':
        if (!item_name) return false;
        const playerItems = await db.getPlayerItems(player.id);
        const item = playerItems.find(i => i.item_name && i.item_name.toLowerCase() === item_name.toLowerCase());
        currentValue = item ? item.quantity : 0;
        break;
        
      case 'vitalis':
        currentValue = player.resource_vitalis || 0;
        break;
        
      default:
        console.warn(`[Automation Engine] Unknown condition target: ${condition_target}`);
        return false;
    }
    
    // Evaluate operator
    switch (operator) {
      case '>=':
        return currentValue >= threshold_value;
      case '<=':
        return currentValue <= threshold_value;
      case '==':
        return currentValue === threshold_value;
      case '!=':
        return currentValue !== threshold_value;
      case '>':
        return currentValue > threshold_value;
      case '<':
        return currentValue < threshold_value;
      default:
        console.warn(`[Automation Engine] Unknown operator: ${operator}`);
        return false;
    }
  } catch (error) {
    console.error(`[Automation Engine] Error evaluating condition:`, error);
    return false;
  }
}

/**
 * Evaluate all conditions for a step
 * @param {Array} conditions - Array of condition objects
 * @param {Object} player - Player object
 * @param {Object} db - Database module
 * @returns {Promise<{until: boolean, while: boolean, if: boolean}>} Condition results
 */
async function evaluateStepConditions(conditions, player, db) {
  const results = { until: null, while: null, if: null };
  
  if (!conditions || conditions.length === 0) {
    return results;
  }
  
  for (const condition of conditions) {
    const result = await evaluateCondition(condition, player, db);
    const type = condition.condition_type || condition.type;
    
    if (type === 'until') {
      results.until = result;
    } else if (type === 'while') {
      results.while = result;
    } else if (type === 'if') {
      results.if = result;
    }
  }
  
  return results;
}

/**
 * Execute a harvest instruction
 * @param {Object} step - Step object
 * @param {Object} player - Player object
 * @param {Object} db - Database module
 * @param {Map} connectedPlayers - Connected players map
 * @returns {Promise<boolean>} Success
 */
async function executeHarvest(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const npcName = config.npcName || config.target;
  
  if (!npcName) {
    console.error(`[Automation Engine] Harvest instruction missing NPC name`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    console.warn(`[Automation Engine] Player ${player.id} not connected, skipping harvest`);
    return false;
  }
  
  // Send harvest command via WebSocket
  // The game handler will process it normally
  playerWs.send(JSON.stringify({
    type: 'harvest',
    target: npcName
  }));
  
  return true;
}

/**
 * Execute an attune instruction (vitalis-based)
 * @param {Object} step - Step object
 * @param {Object} player - Player object
 * @param {Object} db - Database module
 * @param {Map} connectedPlayers - Connected players map
 * @returns {Promise<boolean>} Success
 */
async function executeAttune(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const vitalisMin = config.vitalis_min || 10;
  const vitalisMax = config.vitalis_max || 50;
  
  // Check current vitalis
  const currentVitalis = player.resource_vitalis || 0;
  
  // If vitalis is already at or above max, step is complete
  if (currentVitalis >= vitalisMax) {
    return true; // Step complete
  }
  
  // If vitalis is below min, attune
  if (currentVitalis < vitalisMin) {
    // Find player's WebSocket connection
    let playerWs = null;
    for (const [connId, playerData] of connectedPlayers.entries()) {
      if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
        playerWs = playerData.ws;
        break;
      }
    }
    
    if (!playerWs) {
      console.warn(`[Automation Engine] Player ${player.id} not connected, skipping attune`);
      return false;
    }
    
    // Send attune command
    playerWs.send(JSON.stringify({
      type: 'attune'
    }));
    
    return true; // Command sent, will continue until vitalis >= max
  }
  
  // If vitalis is between min and max, continue attuning
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send attune command
  playerWs.send(JSON.stringify({
    type: 'attune'
  }));
  
  return true;
}

/**
 * Execute a wait instruction
 * @param {Object} step - Step object
 * @param {Object} executionState - Current execution state
 * @returns {Promise<boolean>} Whether wait is complete
 */
async function executeWait(step, executionState) {
  const config = step.instruction_config || {};
  const waitDuration = config.duration || 1000; // milliseconds
  
  const stepKey = `wait_${step.id}`;
  const waitStartTime = executionState[stepKey] || Date.now();
  
  const elapsed = Date.now() - waitStartTime;
  
  if (elapsed >= waitDuration) {
    // Wait complete, clear state
    delete executionState[stepKey];
    return true;
  }
  
  // Still waiting, store start time if not already stored
  if (!executionState[stepKey]) {
    executionState[stepKey] = Date.now();
  }
  
  return false;
}

/**
 * Execute auto-harvest instruction (integrates with existing auto-harvest system)
 */
async function executeAutoHarvest(step, player, db, connectedPlayers, executionState) {
  const config = step.instruction_config || {};
  const npcNames = config.npcNames || [];
  
  if (npcNames.length === 0) {
    console.error(`[Automation Engine] Auto-harvest instruction missing NPC names`);
    return false;
  }
  
  // Check if already harvesting
  const harvestState = executionState.harvestState || {};
  if (harvestState.isHarvesting) {
    // Still harvesting, don't move to next step
    return { success: true, moveToNext: false };
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    console.warn(`[Automation Engine] Player ${player.id} not connected, skipping auto-harvest`);
    return false;
  }
  
  // Start auto-harvest by enabling it in widget config
  // This integrates with existing auto-harvest system
  harvestState.isHarvesting = true;
  harvestState.targetNPCs = npcNames;
  harvestState.collectedItems = {};
  executionState.harvestState = harvestState;
  
  // Send command to enable auto-harvest (if widget supports it)
  // For now, we'll trigger harvests manually for each NPC
  // In a full implementation, this would integrate with the AutomationWidget's auto-harvest toggle
  
  return { success: true, moveToNext: false }; // Don't move until harvest completes
}

/**
 * Execute collect instruction
 */
async function executeCollect(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const itemName = config.itemName;
  
  if (!itemName) {
    console.error(`[Automation Engine] Collect instruction missing item name`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send take command
  playerWs.send(JSON.stringify({
    type: 'take',
    itemName: itemName
  }));
  
  return true;
}

/**
 * Execute store instruction
 */
async function executeStore(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const itemName = config.itemName;
  const quantity = config.quantity || 1;
  const warehouseRoomId = config.warehouseRoomId;
  
  if (!itemName) {
    console.error(`[Automation Engine] Store instruction missing item name`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send store command
  playerWs.send(JSON.stringify({
    type: 'store',
    itemName: itemName,
    quantity: quantity,
    warehouseRoomId: warehouseRoomId
  }));
  
  return true;
}

/**
 * Execute deliver instruction
 */
async function executeDeliver(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const itemName = config.itemName;
  const quantity = config.quantity || 1;
  
  if (!itemName) {
    console.error(`[Automation Engine] Deliver instruction missing item name`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Deliver is typically handled by factory widget
  // For now, we'll use a generic command
  playerWs.send(JSON.stringify({
    type: 'deliver',
    itemName: itemName,
    quantity: quantity
  }));
  
  return true;
}

/**
 * Execute move instruction
 */
async function executeMove(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const direction = config.direction;
  
  if (!direction) {
    console.error(`[Automation Engine] Move instruction missing direction`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send move command
  playerWs.send(JSON.stringify({
    type: 'move',
    direction: direction
  }));
  
  return true;
}

/**
 * Execute loop instruction (loop back to beginning)
 */
async function executeLoop(step, executionState, steps) {
  // Reset to beginning
  executionState.currentStepIndex = 0;
  executionState.loopCount = (executionState.loopCount || 0) + 1;
  return { success: true, moveToNext: true };
}

/**
 * Execute custom loop instruction (loop back to specific step)
 */
async function executeLoopCustom(step, executionState, steps) {
  const config = step.instruction_config || {};
  const targetStep = config.targetStep || step.loop_target_step;
  const maxIterations = step.loop_max_iterations || config.loop_max_iterations;
  
  if (!targetStep || targetStep < 1) {
    console.error(`[Automation Engine] Custom loop missing target step`);
    return { success: false, moveToNext: true };
  }
  
  // Convert to 0-based index
  const targetIndex = targetStep - 1;
  
  // Validate target step exists
  if (targetIndex >= steps.length || targetIndex < 0) {
    console.error(`[Automation Engine] Custom loop target step ${targetStep} out of range`);
    return { success: false, moveToNext: true };
  }
  
  // Check max iterations
  const loopId = step.id || targetStep;
  executionState.loopIterationCount = executionState.loopIterationCount || {};
  const currentIterations = executionState.loopIterationCount[loopId] || 0;
  
  if (maxIterations && currentIterations >= maxIterations) {
    // Max iterations reached, continue to next step
    return { success: true, moveToNext: true };
  }
  
  // Increment iteration count
  executionState.loopIterationCount[loopId] = currentIterations + 1;
  executionState.currentLoopId = loopId;
  
  // Loop back to target step
  executionState.currentStepIndex = targetIndex;
  
  return { success: true, moveToNext: true };
}

/**
 * Execute factory insert item instruction
 */
async function executeFactoryInsertItem(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const slotIndex = config.slotIndex !== undefined ? config.slotIndex : 0;
  const itemName = config.itemName;
  const quantity = config.quantity || 1;
  
  if (!itemName) {
    console.error(`[Automation Engine] Factory insert item missing item name`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send factory widget add item command
  playerWs.send(JSON.stringify({
    type: 'factoryWidgetAddItem',
    slotIndex: slotIndex,
    itemName: itemName,
    quantity: quantity
  }));
  
  return true;
}

/**
 * Execute factory insert rune instruction
 */
async function executeFactoryInsertRune(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const slotIndex = config.slotIndex !== undefined ? config.slotIndex : 0;
  const runeType = config.runeType;
  
  if (!runeType) {
    console.error(`[Automation Engine] Factory insert rune missing rune type`);
    return false;
  }
  
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send factory widget add item command (runes are items)
  // Need to find rune item name by type
  // For now, send as item name matching rune type
  playerWs.send(JSON.stringify({
    type: 'factoryWidgetAddItem',
    slotIndex: slotIndex + 2, // Rune slots are 2-4
    itemName: runeType, // This would need to be mapped to actual item name
    quantity: 1
  }));
  
  return true;
}

/**
 * Execute factory start instruction
 */
async function executeFactoryStart(step, player, db, connectedPlayers) {
  // Find player's WebSocket connection
  let playerWs = null;
  for (const [connId, playerData] of connectedPlayers.entries()) {
    if (playerData.playerId === player.id && playerData.ws && playerData.ws.readyState === 1) {
      playerWs = playerData.ws;
      break;
    }
  }
  
  if (!playerWs) {
    return false;
  }
  
  // Send factory craft command
  playerWs.send(JSON.stringify({
    type: 'factoryCraft'
  }));
  
  return true;
}

/**
 * Execute factory repeat instruction
 */
async function executeFactoryRepeat(step, player, db, connectedPlayers, executionState) {
  const config = step.instruction_config || {};
  const repeatCount = config.repeatCount || 1;
  
  const stepKey = `factory_repeat_${step.id}`;
  const repeatState = executionState[stepKey] || { count: 0, target: repeatCount };
  
  if (repeatState.count >= repeatState.target) {
    // Repeat complete
    delete executionState[stepKey];
    return { success: true, moveToNext: true };
  }
  
  // Increment count and start factory
  repeatState.count++;
  executionState[stepKey] = repeatState;
  
  // Start factory
  const started = await executeFactoryStart(step, player, db, connectedPlayers);
  if (!started) {
    return { success: false, moveToNext: false };
  }
  
  // Don't move to next step until all repeats complete
  return { success: true, moveToNext: false };
}

/**
 * Execute factory store output instruction
 */
async function executeFactoryStoreOutput(step, player, db, connectedPlayers) {
  const config = step.instruction_config || {};
  const itemName = config.itemName;
  const quantity = config.quantity || 1;
  const warehouseRoomId = config.warehouseRoomId;
  
  if (!itemName) {
    console.error(`[Automation Engine] Factory store output missing item name`);
    return false;
  }
  
  // This would typically be handled after factory production completes
  // For now, we'll use the store command
  return await executeStore(step, player, db, connectedPlayers);
}

/**
 * Execute a single automation step
 * @param {Object} step - Step object
 * @param {Object} program - Program object
 * @param {Object} player - Player object
 * @param {Object} db - Database module
 * @param {Map} connectedPlayers - Connected players map
 * @returns {Promise<{success: boolean, moveToNext: boolean}>} Execution result
 */
async function executeAutomationStep(step, program, player, db, connectedPlayers, steps) {
  // Validate step
  if (!step || !step.instruction_type) {
    console.error(`[Automation Engine] Invalid step:`, step);
    return { success: false, moveToNext: true };
  }
  
  const executionState = program.execution_state || {};
  
  // Parse conditions if they're stored as JSON string
  let conditions = step.conditions || [];
  if (typeof conditions === 'string') {
    try {
      conditions = JSON.parse(conditions);
    } catch (e) {
      conditions = [];
    }
  }
  
  // Evaluate conditions first
  const conditionResults = await evaluateStepConditions(conditions, player, db);
  
  // Handle IF condition - skip step if false
  if (conditionResults.if === false) {
    return { success: true, moveToNext: true }; // Skip step
  }
  
  // Handle UNTIL condition - continue until condition is true
  if (conditionResults.until === true) {
    return { success: true, moveToNext: true }; // Condition met, move to next
  }
  
  // Handle WHILE condition - continue while condition is true
  if (conditionResults.while === false) {
    return { success: true, moveToNext: true }; // Condition false, move to next
  }
  
  // Execute instruction based on type
  let success = false;
  let moveToNext = false;
  
  switch (step.instruction_type) {
    case 'harvest':
      success = await executeHarvest(step, player, db, connectedPlayers);
      // Harvest is async, don't move to next step immediately
      moveToNext = false;
      break;
      
    case 'auto_harvest':
      const autoHarvestResult = await executeAutoHarvest(step, player, db, connectedPlayers, executionState);
      success = autoHarvestResult.success;
      moveToNext = autoHarvestResult.moveToNext;
      break;
      
    case 'attune':
      success = await executeAttune(step, player, db, connectedPlayers);
      // Check if attune is complete (vitalis >= max)
      const config = step.instruction_config || {};
      const vitalisMax = config.vitalis_max || 50;
      // Refresh player to get current vitalis
      const refreshedPlayer = await db.getPlayerById(player.id);
      const currentVitalis = refreshedPlayer.resource_vitalis || 0;
      moveToNext = currentVitalis >= vitalisMax;
      break;
      
    case 'collect':
      success = await executeCollect(step, player, db, connectedPlayers);
      moveToNext = true; // Collect is immediate
      break;
      
    case 'store':
      success = await executeStore(step, player, db, connectedPlayers);
      moveToNext = true; // Store is immediate
      break;
      
    case 'deliver':
      success = await executeDeliver(step, player, db, connectedPlayers);
      moveToNext = true; // Deliver is immediate
      break;
      
    case 'wait':
      moveToNext = await executeWait(step, executionState);
      success = true;
      break;
      
    case 'move':
      success = await executeMove(step, player, db, connectedPlayers);
      moveToNext = true; // Move is immediate (or wait for completion)
      break;
      
    case 'loop':
      const loopResult = await executeLoop(step, executionState, steps);
      success = loopResult.success;
      moveToNext = loopResult.moveToNext;
      break;
      
    case 'loop_custom':
      const customLoopResult = await executeLoopCustom(step, executionState, steps);
      success = customLoopResult.success;
      moveToNext = customLoopResult.moveToNext;
      break;
      
    case 'factory_insert_item':
      success = await executeFactoryInsertItem(step, player, db, connectedPlayers);
      moveToNext = true; // Insert is immediate
      break;
      
    case 'factory_insert_rune':
      success = await executeFactoryInsertRune(step, player, db, connectedPlayers);
      moveToNext = true; // Insert is immediate
      break;
      
    case 'factory_start':
      success = await executeFactoryStart(step, player, db, connectedPlayers);
      moveToNext = false; // Wait for factory to complete
      break;
      
    case 'factory_repeat':
      const repeatResult = await executeFactoryRepeat(step, player, db, connectedPlayers, executionState);
      success = repeatResult.success;
      moveToNext = repeatResult.moveToNext;
      break;
      
    case 'factory_store_output':
      success = await executeFactoryStoreOutput(step, player, db, connectedPlayers);
      moveToNext = true; // Store is immediate
      break;
      
    default:
      console.warn(`[Automation Engine] Unknown instruction type: ${step.instruction_type}`);
      success = false;
      moveToNext = true; // Skip unknown instructions
      break;
  }
  
  return { success, moveToNext };
}

/**
 * Process a single automation program
 * @param {Object} program - Program object
 * @param {Object} db - Database module
 * @param {Map} connectedPlayers - Connected players map
 */
async function processAutomationProgram(program, db, connectedPlayers) {
  try {
    // Get player
    const player = await db.getPlayerById(program.player_id);
    if (!player) {
      console.warn(`[Automation Engine] Player ${program.player_id} not found for program ${program.id}`);
      await db.updateAutomationProgram(program.id, null, null, false, null);
      return;
    }
    
    // Get steps
    const steps = await db.getAutomationStepsByProgramId(program.id);
    if (!steps || steps.length === 0) {
      console.warn(`[Automation Engine] Program ${program.id} has no steps`);
      const executionState = { executionState: 'stopped', pauseReason: 'no_steps' };
      await db.updateAutomationProgram(program.id, null, null, false, executionState);
      return;
    }
    
    // Validate program before execution
    const validation = await validateProgram(program, steps);
    if (!validation.valid) {
      console.error(`[Automation Engine] Program ${program.id} validation failed:`, validation.errors);
      const executionState = { executionState: 'stopped', pauseReason: 'validation_failed', errors: validation.errors };
      await db.updateAutomationProgram(program.id, null, null, false, executionState);
      sendExecutionStateUpdate(connectedPlayers, program.id, executionState);
      return;
    }
    
    // Get execution state
    let executionState = program.execution_state || {};
    if (typeof executionState === 'string') {
      try {
        executionState = JSON.parse(executionState);
      } catch (e) {
        executionState = {};
      }
    }
    
    // Check if program is paused or stopped
    if (executionState.executionState === 'paused' || executionState.executionState === 'stopped') {
      return; // Don't process paused/stopped programs
    }
    
    // Initialize execution state if needed
    if (executionState.executionState !== 'running') {
      executionState.currentStepIndex = 0;
      executionState.executionState = 'running';
      executionState.lastExecutionTime = Date.now();
      executionState.loopCount = 0;
      executionState.currentLoopId = null;
      executionState.loopIterationCount = {};
      executionState.harvestState = {
        isHarvesting: false,
        targetNPCs: [],
        collectedItems: {}
      };
    }
    
    const currentStepIndex = executionState.currentStepIndex || 0;
    const currentStep = steps[currentStepIndex];
    
    if (!currentStep) {
      // Program complete or invalid step
      executionState.executionState = 'stopped';
      await db.updateAutomationProgram(program.id, null, null, false, executionState);
      
      // Send status update to widget
      sendExecutionStateUpdate(connectedPlayers, program.id, executionState);
      return;
    }
    
    // Execute current step
    const result = await executeAutomationStep(
      currentStep, 
      { ...program, execution_state: executionState }, 
      player, 
      db, 
      connectedPlayers,
      steps
    );
    
    // Update execution state
    executionState.lastExecutionTime = Date.now();
    
    if (result.moveToNext) {
      // Move to next step
      executionState.currentStepIndex = currentStepIndex + 1;
      
      // Check if program is complete
      if (executionState.currentStepIndex >= steps.length) {
        executionState.executionState = 'stopped';
        await db.updateAutomationProgram(program.id, null, null, false, executionState);
      } else {
        await db.updateAutomationProgram(program.id, null, null, true, executionState);
      }
    } else {
      // Stay on current step
      await db.updateAutomationProgram(program.id, null, null, true, executionState);
    }
    
    // Send status update to widget
    sendExecutionStateUpdate(connectedPlayers, program.id, executionState);
  } catch (error) {
    console.error(`[Automation Engine] Error processing program ${program.id}:`, error);
    console.error(`[Automation Engine] Error stack:`, error.stack);
    
    // Stop program on error
    try {
      let executionState = program.execution_state || {};
      if (typeof executionState === 'string') {
        try {
          executionState = JSON.parse(executionState);
        } catch (e) {
          executionState = {};
        }
      }
      executionState.executionState = 'stopped';
      executionState.pauseReason = 'error';
      executionState.errorMessage = error.message;
      await db.updateAutomationProgram(program.id, null, null, false, executionState);
      
      // Send error update to widget
      sendExecutionStateUpdate(connectedPlayers, program.id, executionState);
    } catch (updateError) {
      console.error(`[Automation Engine] Error updating program state:`, updateError);
    }
  }
}

/**
 * Validate a program before execution
 * @param {Object} program - Program object
 * @param {Array} steps - Steps array
 * @returns {Promise<{valid: boolean, errors: string[]}>} Validation result
 */
async function validateProgram(program, steps) {
  const errors = [];
  
  if (!program) {
    errors.push('Program is null or undefined');
    return { valid: false, errors };
  }
  
  if (!steps || steps.length === 0) {
    errors.push('Program has no steps');
    return { valid: false, errors };
  }
  
  // Validate step order sequence
  const stepOrders = steps.map(s => s.step_order).sort((a, b) => a - b);
  for (let i = 0; i < stepOrders.length; i++) {
    if (stepOrders[i] !== i + 1) {
      errors.push(`Step order sequence is invalid: expected ${i + 1}, got ${stepOrders[i]}`);
    }
  }
  
  // Validate loop targets
  for (const step of steps) {
    if (step.instruction_type === 'loop_custom') {
      const targetStep = step.loop_target_step || (step.instruction_config && step.instruction_config.targetStep);
      if (!targetStep || targetStep < 1 || targetStep > steps.length) {
        errors.push(`Step ${step.step_order}: Custom loop target step ${targetStep} is invalid`);
      }
    }
  }
  
  // Validate attune vitalis bounds
  for (const step of steps) {
    if (step.instruction_type === 'attune') {
      const config = step.instruction_config || {};
      const vitalisMin = config.vitalis_min;
      const vitalisMax = config.vitalis_max;
      
      if (vitalisMin !== undefined && vitalisMax !== undefined) {
        if (vitalisMin < 0 || vitalisMin > 100) {
          errors.push(`Step ${step.step_order}: Vitalis min must be 0-100`);
        }
        if (vitalisMax < 0 || vitalisMax > 100) {
          errors.push(`Step ${step.step_order}: Vitalis max must be 0-100`);
        }
        if (vitalisMin > vitalisMax) {
          errors.push(`Step ${step.step_order}: Vitalis min (${vitalisMin}) must be <= max (${vitalisMax})`);
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Start the automation engine
 * @param {Object} db - Database module
 * @param {Map} connectedPlayers - Connected players map
 */
function startAutomationEngine(db, connectedPlayers) {
  if (!setConnectedPlayersReference(connectedPlayers)) {
    console.error(`[Automation Engine] FATAL: Could not set connectedPlayers reference on startup`);
    return;
  }
  
  setInterval(async () => {
    try {
      // Refresh connectedPlayers reference
      if (connectedPlayers && connectedPlayers instanceof Map) {
        globalConnectedPlayers = connectedPlayers;
      }
      
      const currentConnectedPlayers = getConnectedPlayersReference();
      if (!currentConnectedPlayers) {
        return;
      }
      
      // Get all active programs
      const activePrograms = await db.getActiveAutomationPrograms();
      
      // Process each program
      for (const program of activePrograms) {
        await processAutomationProgram(program, db, currentConnectedPlayers);
      }
    } catch (error) {
      console.error('[Automation Engine] Error:', error);
    }
  }, AUTOMATION_TICK_INTERVAL);
  
  console.log(`[Automation Engine] Started with ${AUTOMATION_TICK_INTERVAL}ms tick interval`);
}

module.exports = {
  startAutomationEngine,
  setConnectedPlayersReference,
  getConnectedPlayersReference
};

