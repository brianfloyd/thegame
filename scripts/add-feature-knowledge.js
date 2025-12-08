#!/usr/bin/env node
/**
 * Quick Knowledge Storage Helper
 * 
 * Easily add feature knowledge to the RAG system for both ZORK and Cursor.
 * 
 * Usage:
 *   node scripts/add-feature-knowledge.js "Feature Name" "category" "Description of feature..."
 * 
 * Categories: game_design, technical, world_lore, system_docs, command_knowledge, learned_context
 * Priority: 0 (contextual) or 1 (important) - defaults to 0
 * 
 * Examples:
 *   node scripts/add-feature-knowledge.js "Crafting System" "game_design" "Players can craft items using materials..."
 *   node scripts/add-feature-knowledge.js "New Database Index" "technical" "Added index on players table..." 0
 */

require('dotenv').config();
const db = require('../database');
const { storeKnowledgeWithEmbedding } = require('../utils/zorkKnowledge');

/**
 * Add feature knowledge to the knowledge base
 */
async function addFeatureKnowledge(title, category, content, priority = 0, subcategory = 'feature') {
  try {
    // Validate category
    const validCategories = ['game_design', 'technical', 'world_lore', 'system_docs', 'command_knowledge', 'learned_context', 'core_identity', 'interaction_patterns'];
    if (!validCategories.includes(category)) {
      throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }
    
    // Validate priority
    if (priority !== 0 && priority !== 1 && priority !== 2) {
      throw new Error('Priority must be 0 (contextual), 1 (important), or 2 (always-include)');
    }
    
    console.log(`\n📝 Storing knowledge...`);
    console.log(`   Title: ${title}`);
    console.log(`   Category: ${category}`);
    console.log(`   Priority: ${priority}`);
    console.log(`   Content length: ${content.length} chars`);
    
    const knowledge = await storeKnowledgeWithEmbedding(
      db,
      category,
      subcategory,
      title,
      content,
      priority,
      'cursor',
      'Feature Implementation'
    );
    
    console.log(`\n✓ Knowledge stored successfully!`);
    console.log(`   ID: ${knowledge.id}`);
    console.log(`   Embedding: ${knowledge.embedding ? 'Generated' : 'Not available (no OPENAI_API_KEY)'}`);
    console.log(`\n   ZORK and Cursor can now access this knowledge.`);
    
    return knowledge;
  } catch (error) {
    console.error(`\n✗ Failed to store knowledge: ${error.message}`);
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('\nUsage: node scripts/add-feature-knowledge.js "Title" "category" "Content..." [priority]');
    console.error('\nCategories: game_design, technical, world_lore, system_docs, command_knowledge, learned_context');
    console.error('Priority: 0 (contextual, default), 1 (important), 2 (always-include)');
    console.error('\nExamples:');
    console.error('  node scripts/add-feature-knowledge.js "Crafting System" "game_design" "Players can craft items..."');
    console.error('  node scripts/add-feature-knowledge.js "New Index" "technical" "Added index..." 0');
    process.exit(1);
  }
  
  const [title, category, ...contentParts] = args;
  const content = contentParts.slice(0, -1).join(' ') || contentParts.join(' ');
  const priorityArg = args[args.length - 1];
  const priority = /^[012]$/.test(priorityArg) ? parseInt(priorityArg) : 0;
  
  // If last arg is a number, it's priority; otherwise it's part of content
  const actualContent = /^[012]$/.test(priorityArg) 
    ? contentParts.slice(0, -1).join(' ') 
    : contentParts.join(' ');
  
  addFeatureKnowledge(title, category, actualContent || content, priority)
    .then(() => {
      return db.closePool();
    })
    .then(() => {
      console.log('\n✓ Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { addFeatureKnowledge };

