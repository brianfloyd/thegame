// NPC Cycle Logic Module
// Provides type-driven cycle processing for scriptable NPCs

/**
 * Runs a cycle for an NPC based on its type
 * @param {Object} npc - NPC data from scriptable_npcs table
 * @param {Object} roomNpc - Room NPC data from room_npcs table (includes current state)
 * @returns {Object} - New state object to save
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
    default:
      console.log(`Unknown NPC type: ${npc.npcType}`);
      // Default: just increment cycles
      currentState.cycles = (currentState.cycles || 0) + 1;
      return currentState;
  }
}

/**
 * Rhythm NPC handler
 * Example: Glowroot Pulsecap - releases spores in rhythmic pulses
 */
function handleRhythm(npc, state) {
  console.log(`Processing rhythm NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement rhythm logic (pulse timing, spore release)
  return state;
}

/**
 * Stability NPC handler
 * Example: Embergut Shroomling - heat-cycling fungus requiring stabilization
 */
function handleStability(npc, state) {
  console.log(`Processing stability NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement stability logic (heat management, stabilization checks)
  return state;
}

/**
 * Worker NPC handler
 * Example: Mycelium Forager - gathers and refines nutrients
 */
function handleWorker(npc, state) {
  console.log(`Processing worker NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement worker logic (gathering, refining, output production)
  return state;
}

/**
 * Tending NPC handler
 * Example: Lantern Moth Swarm - requires careful tending to condense light
 */
function handleTending(npc, state) {
  console.log(`Processing tending NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement tending logic (tending actions, light condensation)
  return state;
}

/**
 * Rotation NPC handler
 * Example: Crystalbloom Weaver - folds fibers in predictable rotations
 */
function handleRotation(npc, state) {
  console.log(`Processing rotation NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement rotation logic (rotation patterns, fiber folding)
  return state;
}

/**
 * Economic NPC handler
 * Example: Glowroot Barter Wisp - trades based on price cycles
 */
function handleEconomic(npc, state) {
  console.log(`Processing economic NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement economic logic (price cycles, trading mechanics)
  return state;
}

/**
 * Farm NPC handler
 * Example: Silkroot Crawler Nest - produces silk when fed
 */
function handleFarm(npc, state) {
  console.log(`Processing farm NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement farm logic (feeding, production, colony management)
  return state;
}

/**
 * Patrol NPC handler
 * Example: Ooze-Walker Collector - slow-moving collector
 */
function handlePatrol(npc, state) {
  console.log(`Processing patrol NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement patrol logic (movement patterns, collection)
  return state;
}

/**
 * Threshold NPC handler
 * Example: Aetherbud Sprite - captures aether during energy surges
 */
function handleThreshold(npc, state) {
  console.log(`Processing threshold NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement threshold logic (energy surge detection, aether capture)
  return state;
}

/**
 * Machine NPC handler
 * Example: Biotide Condenser - filters moisture into biotide
 */
function handleMachine(npc, state) {
  console.log(`Processing machine NPC cycle`);
  state.cycles = (state.cycles || 0) + 1;
  // TODO: Implement machine logic (filtering, processing, output)
  return state;
}

module.exports = {
  runNPCCycle
};


