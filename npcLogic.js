// NPC Cycle Logic Module
// Provides type-driven cycle processing for scriptable NPCs

/**
 * Runs a cycle for an NPC based on its type
 * @param {Object} npc - NPC data from scriptable_npcs table (includes outputItems)
 * @param {Object} roomNpc - Room NPC data from room_npcs table (includes current state)
 * @returns {Object} - { state: {...}, producedItems: [{itemName, quantity}] }
 */
function runNPCCycle(npc, roomNpc) {
  const currentState = roomNpc.state || {};
  
  // Initialize cycles counter if not present
  if (currentState.cycles === undefined) {
    currentState.cycles = 0;
  }
  
  // Route to appropriate handler based on NPC type
  switch (npc.npcType) {
    case 'rhythm':
      return handleRhythm(npc, currentState);
    case 'stability':
      return handleStability(npc, currentState);
    case 'worker':
      return handleWorker(npc, currentState);
    case 'tending':
      return handleTending(npc, currentState);
    case 'rotation':
      return handleRotation(npc, currentState);
    case 'economic':
      return handleEconomic(npc, currentState);
    case 'farm':
      return handleFarm(npc, currentState);
    case 'patrol':
      return handlePatrol(npc, currentState);
    case 'threshold':
      return handleThreshold(npc, currentState);
    case 'machine':
      return handleMachine(npc, currentState);
    case 'lorekeeper':
      // Lore Keepers are narrative NPCs - they don't produce items or cycle
      // They only respond to player interactions (talk, greet, solve, clue)
      return { state: currentState, producedItems: [] };
    default:
      console.log(`Unknown NPC type: ${npc.npcType}`);
      // Default: just increment cycles, produce nothing
      currentState.cycles = (currentState.cycles || 0) + 1;
      return { state: currentState, producedItems: [] };
  }
}

/**
 * Rhythm NPC handler - PRODUCES ITEMS ONLY DURING ACTIVE HARVEST SESSION
 * Example: Pulsewood Harvester - releases resin when player harvests
 * 
 * IMPORTANT: This function must preserve harvest state fields (harvest_active, 
 * harvest_start_time, harvesting_player_id, cooldown_until) as they are managed
 * by the NPC cycle engine, not by this cycle logic.
 */
function handleRhythm(npc, state) {
  // Preserve harvest-related state fields before modifying state
  const harvestActive = state.harvest_active;
  const harvestStartTime = state.harvest_start_time;
  const harvestingPlayerId = state.harvesting_player_id;
  const cooldownUntil = state.cooldown_until;
  
  state.cycles = (state.cycles || 0) + 1;
  
  // Restore harvest state fields (they should not be modified by cycle logic)
  state.harvest_active = harvestActive;
  state.harvest_start_time = harvestStartTime;
  state.harvesting_player_id = harvestingPlayerId;
  state.cooldown_until = cooldownUntil;
  
  // Only produce items if a harvest session is active
  if (!state.harvest_active) {
    return { state, producedItems: [] };
  }
  
  // Rhythm NPCs produce output items each cycle during active harvest
  const producedItems = [];
  if (npc.outputItems && typeof npc.outputItems === 'object') {
    for (const [itemName, qty] of Object.entries(npc.outputItems)) {
      if (qty > 0) {
        producedItems.push({ itemName, quantity: qty });
      }
    }
  }
  
  if (producedItems.length > 0) {
    console.log(`Rhythm NPC produced: ${producedItems.map(i => `${i.itemName} x${i.quantity}`).join(', ')}`);
  }
  
  return { state, producedItems };
}

/**
 * Stability NPC handler
 * Example: Embergut Shroomling - heat-cycling fungus requiring stabilization
 */
function handleStability(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement stability logic (heat management, stabilization checks)
  return { state, producedItems: [] };
}

/**
 * Worker NPC handler
 * Example: Mycelium Forager - gathers and refines nutrients
 */
function handleWorker(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement worker logic (gathering, refining, output production)
  return { state, producedItems: [] };
}

/**
 * Tending NPC handler
 * Example: Lantern Moth Swarm - requires careful tending to condense light
 */
function handleTending(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement tending logic (tending actions, light condensation)
  return { state, producedItems: [] };
}

/**
 * Rotation NPC handler
 * Example: Crystalbloom Weaver - folds fibers in predictable rotations
 */
function handleRotation(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement rotation logic (rotation patterns, fiber folding)
  return { state, producedItems: [] };
}

/**
 * Economic NPC handler
 * Example: Glowroot Barter Wisp - trades based on price cycles
 */
function handleEconomic(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement economic logic (price cycles, trading mechanics)
  return { state, producedItems: [] };
}

/**
 * Farm NPC handler
 * Example: Silkroot Crawler Nest - produces silk when fed
 */
function handleFarm(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement farm logic (feeding, production, colony management)
  return { state, producedItems: [] };
}

/**
 * Patrol NPC handler
 * Example: Ooze-Walker Collector - slow-moving collector
 */
function handlePatrol(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement patrol logic (movement patterns, collection)
  return { state, producedItems: [] };
}

/**
 * Threshold NPC handler
 * Example: Aetherbud Sprite - captures aether during energy surges
 */
function handleThreshold(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement threshold logic (energy surge detection, aether capture)
  return { state, producedItems: [] };
}

/**
 * Machine NPC handler
 * Example: Biotide Condenser - filters moisture into biotide
 */
function handleMachine(npc, state) {
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement machine logic (filtering, processing, output)
  return { state, producedItems: [] };
}

module.exports = {
  runNPCCycle
};
