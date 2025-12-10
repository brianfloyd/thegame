/**
 * Crafting Recipe Editor Handlers
 * 
 * WebSocket handlers for factory recipe management (God Mode only)
 * Handles: getFactoryRecipes, getFactoryRecipe, createFactoryRecipe,
 *          updateFactoryRecipe, deleteFactoryRecipe
 */

const { verifyGodMode } = require('../utils/broadcast');

/**
 * Get all factory recipes
 */
async function getFactoryRecipes(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  try {
    const recipes = await db.getFactoryRecipes({ active: null }); // Get all, not just active
    
    ws.send(JSON.stringify({
      type: 'factoryRecipes',
      recipes
    }));
  } catch (err) {
    console.error('Error getting factory recipes:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get recipes: ' + err.message }));
  }
}

/**
 * Get a single factory recipe by ID
 */
async function getFactoryRecipe(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { recipe_id } = data;
  if (!recipe_id) {
    ws.send(JSON.stringify({ type: 'error', message: 'recipe_id required' }));
    return;
  }

  try {
    const recipe = await db.getFactoryRecipeById(recipe_id);
    if (!recipe) {
      ws.send(JSON.stringify({ type: 'error', message: 'Recipe not found' }));
      return;
    }
    
    ws.send(JSON.stringify({
      type: 'factoryRecipe',
      recipe
    }));
  } catch (err) {
    console.error('Error getting factory recipe:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get recipe: ' + err.message }));
  }
}

/**
 * Create a new factory recipe
 */
async function createFactoryRecipe(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { recipe } = data;
  if (!recipe || !recipe.name) {
    ws.send(JSON.stringify({ type: 'error', message: 'Recipe name is required' }));
    return;
  }

  try {
    const recipeId = await db.createFactoryRecipe(recipe);
    const createdRecipe = await db.getFactoryRecipeById(recipeId);
    
    ws.send(JSON.stringify({
      type: 'factoryRecipeCreated',
      recipe: createdRecipe
    }));
  } catch (err) {
    console.error('Error creating factory recipe:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create recipe: ' + err.message }));
  }
}

/**
 * Update an existing factory recipe
 */
async function updateFactoryRecipe(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { recipe } = data;
  if (!recipe || !recipe.recipe_id) {
    ws.send(JSON.stringify({ type: 'error', message: 'Recipe ID is required' }));
    return;
  }

  try {
    await db.updateFactoryRecipe(recipe.recipe_id, recipe);
    const updatedRecipe = await db.getFactoryRecipeById(recipe.recipe_id);
    
    ws.send(JSON.stringify({
      type: 'factoryRecipeUpdated',
      recipe: updatedRecipe
    }));
  } catch (err) {
    console.error('Error updating factory recipe:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update recipe: ' + err.message }));
  }
}

/**
 * Delete a factory recipe
 */
async function deleteFactoryRecipe(ctx, data) {
  const { ws, db, connectedPlayers } = ctx;
  
  const player = await verifyGodMode(db, connectedPlayers, ws);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
    return;
  }

  const { recipe_id } = data;
  if (!recipe_id) {
    ws.send(JSON.stringify({ type: 'error', message: 'recipe_id required' }));
    return;
  }

  try {
    await db.deleteFactoryRecipe(recipe_id);
    
    ws.send(JSON.stringify({
      type: 'factoryRecipeDeleted',
      recipe_id
    }));
  } catch (err) {
    console.error('Error deleting factory recipe:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to delete recipe: ' + err.message }));
  }
}

module.exports = {
  getFactoryRecipes,
  getFactoryRecipe,
  createFactoryRecipe,
  updateFactoryRecipe,
  deleteFactoryRecipe
};


