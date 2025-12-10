/**
 * Factory Output Router Service
 * 
 * Handles routing of crafted items to player inventory or room floor.
 * Also handles event emission for factory crafting events.
 */

const config = require('../config/factoryConfig');

/**
 * Route a single item to player inventory or floor
 * @param {Object} db - Database instance
 * @param {Object} item - Item to route { item_name, quantity }
 * @param {Object} player - Player object
 * @param {Object} room - Current room object
 * @param {boolean} playerInRoom - Whether player is currently in the factory room
 * @returns {Object} { routed: 'inventory'|'floor', quantity: number, overflow: number }
 */
async function routeSingleItem(db, item, player, room, playerInRoom) {
  const itemName = item.item_name || item.itemName;
  const quantity = item.quantity || 1;
  
  // If player not in room, all goes to floor
  if (!playerInRoom) {
    await db.addRoomItem(room.id, itemName, quantity);
    return {
      itemName,
      routed: 'floor',
      quantity: quantity,
      overflow: 0,
      reason: 'player_not_in_room'
    };
  }
  
  // Check encumbrance
  const itemEncumbrance = await db.getItemEncumbrance(itemName) || 1;
  const currentEncumbrance = await db.getPlayerCurrentEncumbrance(player.id);
  const maxEncumbrance = player.resource_max_encumbrance || 100;
  const availableCapacity = maxEncumbrance - currentEncumbrance;
  
  // Calculate how many items can fit
  const itemsThatFit = Math.floor(availableCapacity / itemEncumbrance);
  
  if (itemsThatFit <= 0) {
    // Inventory full, all to floor
    await db.addRoomItem(room.id, itemName, quantity);
    return {
      itemName,
      routed: 'floor',
      quantity: quantity,
      overflow: 0,
      reason: 'inventory_full'
    };
  }
  
  if (itemsThatFit >= quantity) {
    // All items fit in inventory
    await db.addPlayerItem(player.id, itemName, quantity);
    return {
      itemName,
      routed: 'inventory',
      quantity: quantity,
      overflow: 0,
      reason: null
    };
  }
  
  // Partial fit - some to inventory, rest to floor
  const toInventory = itemsThatFit;
  const toFloor = quantity - itemsThatFit;
  
  await db.addPlayerItem(player.id, itemName, toInventory);
  await db.addRoomItem(room.id, itemName, toFloor);
  
  return {
    itemName,
    routed: 'partial',
    quantity: toInventory,
    overflow: toFloor,
    reason: 'partial_fit'
  };
}

/**
 * Route all output items from a craft
 * @param {Object} db - Database instance
 * @param {Array} items - Array of items to route
 * @param {Object} player - Player object
 * @param {Object} room - Current room object
 * @param {boolean} playerInRoom - Whether player is in the factory room
 * @returns {Object} { results: Array, summary: Object }
 */
async function routeOutputs(db, items, player, room, playerInRoom) {
  if (!items || items.length === 0) {
    return {
      results: [],
      summary: {
        toInventory: 0,
        toFloor: 0,
        overflow: 0
      }
    };
  }
  
  const results = [];
  let totalToInventory = 0;
  let totalToFloor = 0;
  let totalOverflow = 0;
  
  for (const item of items) {
    const result = await routeSingleItem(db, item, player, room, playerInRoom);
    results.push(result);
    
    if (result.routed === 'inventory') {
      totalToInventory += result.quantity;
    } else if (result.routed === 'floor') {
      totalToFloor += result.quantity;
    } else if (result.routed === 'partial') {
      totalToInventory += result.quantity;
      totalOverflow += result.overflow;
      totalToFloor += result.overflow;
    }
  }
  
  return {
    results,
    summary: {
      toInventory: totalToInventory,
      toFloor: totalToFloor,
      overflow: totalOverflow
    }
  };
}

/**
 * Return ingredients to player (on failure)
 * @param {Object} db - Database instance
 * @param {Array} ingredients - Ingredients to return
 * @param {Object} player - Player object
 * @returns {Object} { results: Array }
 */
async function returnIngredients(db, ingredients, player) {
  if (!ingredients || ingredients.length === 0) {
    return { results: [] };
  }
  
  const results = [];
  
  for (const ing of ingredients) {
    const itemName = ing.itemName || ing.item_name;
    const quantity = ing.quantity || 1;
    
    if (quantity > 0) {
      await db.addPlayerItem(player.id, itemName, quantity);
      results.push({
        itemName,
        quantity,
        returned: true
      });
    }
  }
  
  return { results };
}

/**
 * Emit a factory event to the database
 * @param {Object} db - Database instance
 * @param {string} eventType - Event type (FACTORY_CRAFT_STARTED, etc.)
 * @param {Object} data - Event data
 * @returns {Object} Created event
 */
async function emitFactoryEvent(db, eventType, data) {
  const eventData = {
    event_type: eventType,
    factory_room_id: data.roomId || null,
    player_id: data.playerId || null,
    recipe_id: data.recipeId || null,
    item_id: data.itemId || null,
    quantity: data.quantity || null,
    metadata: {
      ...data.metadata,
      timestamp: Date.now()
    }
  };
  
  try {
    return await db.logFactoryEvent(eventData);
  } catch (error) {
    console.error('[factoryOutputRouter] Failed to log factory event:', error);
    return null;
  }
}

/**
 * Emit craft started event
 */
async function emitCraftStarted(db, playerId, roomId, recipeId, recipeName) {
  return emitFactoryEvent(db, 'FACTORY_CRAFT_STARTED', {
    playerId,
    roomId,
    recipeId,
    metadata: { recipeName }
  });
}

/**
 * Emit craft success event
 */
async function emitCraftSuccess(db, playerId, roomId, recipeId, outputs, critical) {
  return emitFactoryEvent(db, critical ? 'FACTORY_CRAFT_CRITICAL' : 'FACTORY_CRAFT_SUCCESS', {
    playerId,
    roomId,
    recipeId,
    metadata: { 
      outputs,
      critical
    }
  });
}

/**
 * Emit craft failed event
 */
async function emitCraftFailed(db, playerId, roomId, recipeId, returnedIngredients) {
  return emitFactoryEvent(db, 'FACTORY_CRAFT_FAILED', {
    playerId,
    roomId,
    recipeId,
    metadata: { returnedIngredients }
  });
}

/**
 * Emit craft fizzle event (invalid recipe)
 */
async function emitCraftFizzle(db, playerId, roomId, reason) {
  return emitFactoryEvent(db, 'FACTORY_CRAFT_FIZZLE', {
    playerId,
    roomId,
    metadata: { reason }
  });
}

/**
 * Emit output created events (for automation hooks)
 * Creates one event per output item
 */
async function emitOutputCreated(db, playerId, roomId, recipeId, outputs) {
  const events = [];
  
  for (const output of outputs) {
    const itemName = output.item_name || output.itemName;
    
    // Try to get item ID
    let itemId = output.item_id || null;
    if (!itemId && itemName) {
      try {
        const item = await db.getItemByName(itemName);
        itemId = item?.id || null;
      } catch (e) {
        // Ignore lookup errors
      }
    }
    
    const event = await emitFactoryEvent(db, 'FACTORY_OUTPUT_CREATED', {
      playerId,
      roomId,
      recipeId,
      itemId,
      quantity: output.quantity,
      metadata: {
        itemName,
        routed: output.routed || 'unknown'
      }
    });
    
    if (event) events.push(event);
  }
  
  return events;
}

/**
 * Build message for craft result
 * @param {Object} craftResult - Result from crafting engine
 * @param {Object} routingResult - Result from output routing
 * @returns {string} Formatted message
 */
function buildCraftResultMessage(craftResult, routingResult) {
  let message = craftResult.message;
  
  if (craftResult.success) {
    // Add output details
    const itemDetails = craftResult.outputs.items.map(item => {
      const name = item.item_name || item.itemName;
      return `${name} x${item.quantity}`;
    }).join(', ');
    
    if (itemDetails) {
      message += ` Received: ${itemDetails}.`;
    }
    
    // Add routing info if any went to floor
    if (routingResult && routingResult.summary.toFloor > 0) {
      message += ` (Some items dropped to floor due to inventory capacity)`;
    }
    
    // Add byproduct info
    if (craftResult.outputs.byproducts && craftResult.outputs.byproducts.length > 0) {
      const byproductDetails = craftResult.outputs.byproducts.map(bp => {
        const name = bp.item_name || bp.itemName;
        return `${name} x${bp.quantity}`;
      }).join(', ');
      message += ` Bonus: ${byproductDetails}!`;
    }
    
    // Add worn quirk notice
    if (craftResult.outputs.wornTriggered) {
      message += ` (Output reduced by worn factory)`;
    }
  }
  
  return message;
}

/**
 * Clear ingredient slots after crafting
 * @param {Array} slots - Factory slots array
 * @returns {Array} Modified slots with cleared ingredient slots
 */
function clearIngredientSlots(slots) {
  if (!slots || !Array.isArray(slots)) return slots;
  
  const newSlots = [...slots];
  for (const slotIndex of config.SLOTS.INGREDIENT_SLOTS) {
    newSlots[slotIndex] = null;
  }
  
  return newSlots;
}

/**
 * Clear all slots (including runes) - used on fizzle
 * @param {Array} slots - Factory slots array
 * @returns {Array} Empty slots array
 */
function clearAllSlots(slots) {
  return [null, null, null, null, null];
}

/**
 * Get production rune from slots for returning on fizzle
 * @param {Array} slots - Factory slots array
 * @returns {Object|null} Production rune slot data or null
 */
function getProductionRuneForReturn(slots) {
  if (!slots || !Array.isArray(slots)) return null;
  
  const productionSlot = slots[config.SLOTS.PRODUCTION_RUNE_SLOT];
  if (!productionSlot || !productionSlot.itemName) return null;
  
  return {
    itemName: productionSlot.itemName,
    quantity: productionSlot.quantity || 1
  };
}

module.exports = {
  // Core routing functions
  routeSingleItem,
  routeOutputs,
  returnIngredients,
  
  // Event emission
  emitFactoryEvent,
  emitCraftStarted,
  emitCraftSuccess,
  emitCraftFailed,
  emitCraftFizzle,
  emitOutputCreated,
  
  // Utility functions
  buildCraftResultMessage,
  clearIngredientSlots,
  clearAllSlots,
  getProductionRuneForReturn
};



