/**
 * Markup Editor Handlers
 * 
 * WebSocket handlers for markup convention management (God Mode only)
 * Handles: getAllMarkupConventions, createMarkupConvention, updateMarkupConvention, deleteMarkupConvention
 */

const { verifyGodMode } = require('../utils/broadcast');
const { reloadMarkupConventions } = require('../utils/markupService');

/**
 * Get all markup conventions
 */
async function getAllMarkupConventions(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  try {
    const conventions = await db.getAllMarkupConventions();
    ws.send(JSON.stringify({ type: 'markupConventionList', conventions }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to fetch conventions: ' + err.message }));
  }
}

/**
 * Create a new markup convention
 */
async function createMarkupConvention(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { convention } = data;
  if (!convention || !convention.syntax || !convention.opening || !convention.closing) {
    ws.send(JSON.stringify({ type: 'error', message: 'syntax, opening, and closing are required' }));
    return;
  }

  try {
    // Check for conflicts
    const existingConventions = await db.getAllMarkupConventions();
    const conflict = existingConventions.find(c => 
      c.opening === convention.opening || 
      c.closing === convention.closing ||
      c.opening === convention.closing ||
      c.closing === convention.opening
    );

    if (conflict) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Conflict detected',
        conflict: {
          id: conflict.id,
          syntax: conflict.syntax,
          example: conflict.example,
          opening: conflict.opening,
          closing: conflict.closing
        }
      }));
      return;
    }

    const newConvention = await db.createMarkupConvention(convention);
    
    // Reload markup service cache
    await reloadMarkupConventions(db);
    
    ws.send(JSON.stringify({ type: 'markupConventionCreated', convention: newConvention }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create convention: ' + err.message }));
  }
}

/**
 * Update an existing markup convention
 */
async function updateMarkupConvention(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { id, convention } = data;
  if (!id) {
    ws.send(JSON.stringify({ type: 'error', message: 'Convention ID required' }));
    return;
  }

  if (!convention || !convention.syntax || !convention.opening || !convention.closing) {
    ws.send(JSON.stringify({ type: 'error', message: 'syntax, opening, and closing are required' }));
    return;
  }

  try {
    // Check for conflicts (excluding current convention)
    const existingConventions = await db.getAllMarkupConventions();
    const conflict = existingConventions.find(c => 
      c.id !== id && (
        c.opening === convention.opening || 
        c.closing === convention.closing ||
        c.opening === convention.closing ||
        c.closing === convention.opening
      )
    );

    if (conflict) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Conflict detected',
        conflict: {
          id: conflict.id,
          syntax: conflict.syntax,
          example: conflict.example,
          opening: conflict.opening,
          closing: conflict.closing
        }
      }));
      return;
    }

    const updatedConvention = await db.updateMarkupConvention(id, convention);
    
    if (!updatedConvention) {
      ws.send(JSON.stringify({ type: 'error', message: 'Convention not found' }));
      return;
    }

    // Reload markup service cache
    await reloadMarkupConventions(db);
    
    ws.send(JSON.stringify({ type: 'markupConventionUpdated', convention: updatedConvention }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update convention: ' + err.message }));
  }
}

/**
 * Delete a markup convention
 */
async function deleteMarkupConvention(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { id } = data;
  if (!id) {
    ws.send(JSON.stringify({ type: 'error', message: 'Convention ID required' }));
    return;
  }

  try {
    await db.deleteMarkupConvention(id);
    
    // Reload markup service cache
    await reloadMarkupConventions(db);
    
    ws.send(JSON.stringify({ type: 'markupConventionDeleted', id }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to delete convention: ' + err.message }));
  }
}

module.exports = {
  getAllMarkupConventions,
  createMarkupConvention,
  updateMarkupConvention,
  deleteMarkupConvention
};



