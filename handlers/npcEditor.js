/**
 * NPC Editor Handlers
 * 
 * WebSocket handlers for NPC management (God Mode only)
 * Handles: getAllNPCs, createNPC, updateNPC, getNpcPlacements,
 *          getNpcPlacementRooms, addNpcToRoom, removeNpcFromRoom
 */

const { verifyGodMode } = require('../utils/broadcast');

/**
 * Get all scriptable NPCs
 */
async function getAllNPCs(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const npcs = await db.getAllScriptableNPCs();
  
  // Attach lorekeeper data for lorekeeper type NPCs
  for (const npc of npcs) {
    if (npc.npc_type === 'lorekeeper') {
      npc.lorekeeper = await db.getLoreKeeperByNpcId(npc.id);
    }
  }
  
  ws.send(JSON.stringify({
    type: 'npcList',
    npcs
  }));
}

/**
 * Create a new NPC
 */
async function createNPC(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { npc: rawNpc } = data;
  const npc = rawNpc || {};
  if (!npc || !npc.name || !npc.npc_type || !npc.base_cycle_time) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required NPC fields' }));
    return;
  }

  if (!npc.display_color) {
    npc.display_color = '#00ff00';
  }

  try {
    const id = await db.createScriptableNPC(npc);
    
    // If this is a lorekeeper type, create the lore_keepers record
    if (npc.npc_type === 'lorekeeper' && npc.lorekeeper) {
      const lkConfig = {
        npc_id: id,
        lore_type: npc.lorekeeper.lore_type || 'dialogue',
        engagement_enabled: npc.lorekeeper.engagement_enabled !== false,
        engagement_delay: npc.lorekeeper.engagement_delay || 3000,
        initial_message: npc.lorekeeper.initial_message || null,
        initial_message_color: npc.lorekeeper.initial_message_color || '#00ffff',
        keywords_responses: npc.lorekeeper.keywords_responses || null,
        keyword_color: npc.lorekeeper.keyword_color || '#ff00ff',
        incorrect_response: npc.lorekeeper.incorrect_response || 'I do not understand what you mean.',
        puzzle_mode: npc.lorekeeper.puzzle_mode || null,
        puzzle_clues: npc.lorekeeper.puzzle_clues || null,
        puzzle_solution: npc.lorekeeper.puzzle_solution || null,
        puzzle_success_message: npc.lorekeeper.puzzle_success_message || null,
        puzzle_failure_message: npc.lorekeeper.puzzle_failure_message || 'That is not the answer I seek.'
      };
      await db.createLoreKeeper(lkConfig);
    }
    
    const created = await db.getScriptableNPCById(id);
    
    // Attach lorekeeper data if this is a lorekeeper
    if (created.npc_type === 'lorekeeper') {
      created.lorekeeper = await db.getLoreKeeperByNpcId(id);
    }
    
    ws.send(JSON.stringify({
      type: 'npcCreated',
      npc: created
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create NPC: ' + err.message }));
  }
}

/**
 * Update an existing NPC
 */
async function updateNPC(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { npc: rawNpc } = data;
  const npc = rawNpc || {};
  if (!npc || !npc.id || !npc.name || !npc.npc_type || !npc.base_cycle_time) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required NPC fields' }));
    return;
  }

  if (!npc.display_color) {
    npc.display_color = '#00ff00';
  }

  try {
    // Get the old NPC to check if type changed
    const oldNpc = await db.getScriptableNPCById(npc.id);
    const wasLoreKeeper = oldNpc && oldNpc.npc_type === 'lorekeeper';
    const isLoreKeeper = npc.npc_type === 'lorekeeper';
    
    await db.updateScriptableNPC(npc);
    
    // Handle lore keeper data transitions
    if (isLoreKeeper && npc.lorekeeper) {
      const lkConfig = {
        npc_id: npc.id,
        lore_type: npc.lorekeeper.lore_type || 'dialogue',
        engagement_enabled: npc.lorekeeper.engagement_enabled !== false,
        engagement_delay: npc.lorekeeper.engagement_delay || 3000,
        initial_message: npc.lorekeeper.initial_message || null,
        initial_message_color: npc.lorekeeper.initial_message_color || '#00ffff',
        keywords_responses: npc.lorekeeper.keywords_responses || null,
        keyword_color: npc.lorekeeper.keyword_color || '#ff00ff',
        incorrect_response: npc.lorekeeper.incorrect_response || 'I do not understand what you mean.',
        puzzle_mode: npc.lorekeeper.puzzle_mode || null,
        puzzle_clues: npc.lorekeeper.puzzle_clues || null,
        puzzle_solution: npc.lorekeeper.puzzle_solution || null,
        puzzle_success_message: npc.lorekeeper.puzzle_success_message || null,
        puzzle_failure_message: npc.lorekeeper.puzzle_failure_message || 'That is not the answer I seek.'
      };
      
      if (wasLoreKeeper) {
        // Update existing lore keeper record
        await db.updateLoreKeeper(lkConfig);
      } else {
        // Create new lore keeper record
        await db.createLoreKeeper(lkConfig);
      }
    } else if (wasLoreKeeper && !isLoreKeeper) {
      // NPC type changed from lorekeeper to something else - delete lore keeper record
      await db.deleteLoreKeeperByNpcId(npc.id);
    }
    
    const updated = await db.getScriptableNPCById(npc.id);
    
    // Attach lorekeeper data if this is a lorekeeper
    if (updated.npc_type === 'lorekeeper') {
      updated.lorekeeper = await db.getLoreKeeperByNpcId(npc.id);
    }
    
    ws.send(JSON.stringify({
      type: 'npcUpdated',
      npc: updated
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update NPC: ' + err.message }));
  }
}

/**
 * Get NPC placements (where an NPC is placed in rooms)
 */
async function getNpcPlacements(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { npcId } = data;
  if (!npcId) {
    ws.send(JSON.stringify({ type: 'error', message: 'NPC id required' }));
    return;
  }

  const placements = await db.getNpcPlacements(npcId);
  ws.send(JSON.stringify({
    type: 'npcPlacements',
    npcId,
    placements
  }));
}

/**
 * Get rooms available for NPC placement (any map)
 */
async function getNpcPlacementRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { mapId } = data;
  
  // If no mapId provided, get the first map (for backwards compatibility)
  let targetMap;
  if (mapId) {
    targetMap = await db.getMapById(mapId);
  } else {
    const allMaps = await db.getAllMaps();
    targetMap = allMaps[0];
  }
  
  if (!targetMap) {
    ws.send(JSON.stringify({ type: 'npcPlacementRooms', error: 'Map not found' }));
    return;
  }

  const rooms = await db.getRoomsForNpcPlacement(targetMap.id);
  ws.send(JSON.stringify({
    type: 'npcPlacementRooms',
    map: { id: targetMap.id, name: targetMap.name },
    rooms
  }));
}

/**
 * Get all maps for NPC placement dropdown
 */
async function getNpcPlacementMaps(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const maps = await db.getAllMaps();
  ws.send(JSON.stringify({
    type: 'npcPlacementMaps',
    maps: maps.map(m => ({ id: m.id, name: m.name }))
  }));
}

/**
 * Add NPC to a room
 */
async function addNpcToRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { npcId, roomId, slot } = data;
  if (!npcId || !roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'NPC id and Room id are required' }));
    return;
  }

  try {
    // placeNPCInRoom - NPCs can be placed in any room
    const placementId = await db.placeNPCInRoom(npcId, roomId, slot || 0, { cycles: 0 });
    const placements = await db.getNpcPlacements(npcId);
    const placement = placements.find(p => p.id === placementId) || null;
    ws.send(JSON.stringify({
      type: 'npcPlacementAdded',
      placement
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to add NPC to room: ' + err.message }));
  }
}

/**
 * Remove NPC from a room
 */
async function removeNpcFromRoom(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { placementId, npcId } = data;
  if (!placementId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Placement id required' }));
    return;
  }

  try {
    await db.deleteNpcPlacement(placementId);
    const placements = npcId ? await db.getNpcPlacements(npcId) : [];
    ws.send(JSON.stringify({
      type: 'npcPlacementRemoved',
      placementId,
      npcId,
      placements
    }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to remove NPC from room: ' + err.message }));
  }
}

module.exports = {
  getAllNPCs,
  createNPC,
  updateNPC,
  getNpcPlacements,
  getNpcPlacementRooms,
  getNpcPlacementMaps,
  addNpcToRoom,
  removeNpcFromRoom
};

