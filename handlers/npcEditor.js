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
    const created = await db.getScriptableNPCById(id);
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
    await db.updateScriptableNPC(npc);
    const updated = await db.getScriptableNPCById(npc.id);
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
 * Get rooms available for NPC placement (Moonless Meadow only)
 */
async function getNpcPlacementRooms(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const moonless = await db.getMapByName('Moonless Meadow');
  if (!moonless) {
    ws.send(JSON.stringify({ type: 'npcPlacementRooms', error: 'Moonless Meadow map not found' }));
    return;
  }

  const rooms = await db.getRoomsForNpcPlacement(moonless.id);
  ws.send(JSON.stringify({
    type: 'npcPlacementRooms',
    map: { id: moonless.id, name: moonless.name },
    rooms
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
    // placeNPCInRoom enforces Moonless Meadow restriction
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
  addNpcToRoom,
  removeNpcFromRoom
};

