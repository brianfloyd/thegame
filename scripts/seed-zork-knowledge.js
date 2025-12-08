/**
 * Seed ZORK Knowledge Base
 * 
 * Parses zork-system-prompt.md and chunks it into the knowledge base
 * with appropriate categories and priorities
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const db = require('../database');
const { generateEmbedding, prepareKnowledgeForEmbedding } = require('../utils/zorkKnowledge');

// Knowledge chunks to create
const knowledgeChunks = [];

/**
 * Parse the system prompt and create knowledge chunks
 */
function parseSystemPrompt(content) {
  const lines = content.split('\n');
  let currentSection = '';
  let currentContent = [];
  let inCodeBlock = false;
  
  // Core Identity chunks (Priority 2 - always include)
  const coreIdentitySections = [
    {
      title: 'Fundamental Identity: Claude',
      startMarker: '## FUNDAMENTAL IDENTITY: CLAUDE',
      endMarker: '## DUAL PERSONA SYSTEM',
      category: 'core_identity',
      subcategory: 'claude_identity',
      priority: 2
    },
    {
      title: 'Dual Persona System',
      startMarker: '## DUAL PERSONA SYSTEM',
      endMarker: '## YOUR IDENTITY',
      category: 'core_identity',
      subcategory: 'persona_switching',
      priority: 2
    },
    {
      title: 'Chuck Persona - Core Principles',
      startMarker: '## CHUCK PERSONA',
      endMarker: '### Response Style',
      category: 'core_identity',
      subcategory: 'persona_chuck',
      priority: 2
    },
    {
      title: 'Chuck Persona - Response Style',
      startMarker: '### Response Style (Chuck Mode)',
      endMarker: '### Primary Modes',
      category: 'core_identity',
      subcategory: 'persona_chuck',
      priority: 2
    },
    {
      title: 'ZORK Persona',
      startMarker: '## ZORK PERSONA',
      endMarker: '## TEXT MARKUP',
      category: 'core_identity',
      subcategory: 'persona_zork',
      priority: 2
    }
  ];
  
  // Command Knowledge chunks (Priority 1 - important)
  const commandKnowledgeSections = [
    {
      title: 'God Mode Actions Overview',
      startMarker: '## GOD MODE ACTIONS',
      endMarker: '### Action Format',
      category: 'command_knowledge',
      subcategory: 'god_mode_overview',
      priority: 1
    },
    {
      title: 'Action Format and Rules',
      startMarker: '### Action Format',
      endMarker: '### Available Commands',
      category: 'command_knowledge',
      subcategory: 'action_format',
      priority: 1
    },
    {
      title: 'Map and Room Commands',
      startMarker: '**Map/Room Commands:**',
      endMarker: '**NPC Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_map_room',
      priority: 1
    },
    {
      title: 'NPC Commands',
      startMarker: '**NPC Commands:**',
      endMarker: '**Item Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_npc',
      priority: 1
    },
    {
      title: 'Item Commands',
      startMarker: '**Item Commands:**',
      endMarker: '**Player Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_item',
      priority: 1
    },
    {
      title: 'Player Commands',
      startMarker: '**Player Commands:**',
      endMarker: '**Markup Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_player',
      priority: 1
    },
    {
      title: 'Markup Commands',
      startMarker: '**Markup Commands:**',
      endMarker: '**Game Message Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_markup',
      priority: 1
    },
    {
      title: 'Game Message Commands',
      startMarker: '**Game Message Commands:**',
      endMarker: '**NPC Message/Keyword Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_game_message',
      priority: 1
    },
    {
      title: 'NPC Keyword Commands',
      startMarker: '**NPC Message/Keyword Commands:**',
      endMarker: '**ZORK Connection Management Commands:**',
      category: 'command_knowledge',
      subcategory: 'commands_npc_keyword',
      priority: 1
    },
    {
      title: 'Text Markup System',
      startMarker: '## TEXT MARKUP',
      endMarker: '## WHAT YOU CAN SEE',
      category: 'command_knowledge',
      subcategory: 'markup',
      priority: 1
    }
  ];
  
  // World Lore chunks (Priority 0 - contextual)
  const worldLoreSections = [
    {
      title: 'What ZORK Can See',
      startMarker: '## WHAT YOU CAN SEE',
      endMarker: '## GOD MODE ACTIONS',
      category: 'world_lore',
      subcategory: 'awareness',
      priority: 0
    }
  ];
  
  // Interaction Patterns chunks (Priority 0 - contextual)
  const interactionPatternsSections = [
    {
      title: 'Interacting with @Fliz@ (Chuck Mode)',
      startMarker: '### @Fliz@ / Brian Floyd (CHUCK MODE)',
      endMarker: '### Other God-Mode Players',
      category: 'interaction_patterns',
      subcategory: 'chuck_mode',
      priority: 0
    },
    {
      title: 'Interacting with Other God-Mode Players',
      startMarker: '### Other God-Mode Players (ZORK MODE)',
      endMarker: '### Regular Players',
      category: 'interaction_patterns',
      subcategory: 'god_mode_players',
      priority: 0
    },
    {
      title: 'Interacting with Regular Players',
      startMarker: '### Regular Players (ZORK MODE)',
      endMarker: '## COMMUNICATION METHODS',
      category: 'interaction_patterns',
      subcategory: 'regular_players',
      priority: 0
    },
    {
      title: 'Communication Methods',
      startMarker: '## COMMUNICATION METHODS',
      endMarker: '## CONTEXT YOU RECEIVE',
      category: 'interaction_patterns',
      subcategory: 'communication',
      priority: 0
    },
    {
      title: 'Examples - Casual Interactions',
      startMarker: '**Casual greeting',
      endMarker: '**Private conversation',
      category: 'interaction_patterns',
      subcategory: 'examples',
      priority: 0
    },
    {
      title: 'Examples - God Mode Interactions',
      startMarker: '**@Fliz@ asking to create something',
      endMarker: '**Regular player asking for god powers',
      category: 'interaction_patterns',
      subcategory: 'examples',
      priority: 0
    }
  ];
  
  // Combine all sections
  const allSections = [
    ...coreIdentitySections,
    ...commandKnowledgeSections,
    ...worldLoreSections,
    ...interactionPatternsSections
  ];
  
  // Extract sections
  for (const section of allSections) {
    const startIndex = lines.findIndex(line => line.includes(section.startMarker));
    const endIndex = lines.findIndex((line, idx) => idx > startIndex && line.includes(section.endMarker));
    
    if (startIndex !== -1) {
      const sectionLines = endIndex !== -1 
        ? lines.slice(startIndex, endIndex)
        : lines.slice(startIndex);
      
      // Remove markdown headers and code blocks
      const content = sectionLines
        .filter(line => {
          // Skip code blocks
          if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            return false;
          }
          if (inCodeBlock) return true; // Keep code block content
          
          // Skip markdown headers
          if (line.trim().startsWith('#')) return false;
          
          return true;
        })
        .join('\n')
        .trim();
      
      if (content.length > 50) { // Only add if substantial content
        knowledgeChunks.push({
          category: section.category,
          subcategory: section.subcategory,
          title: section.title,
          content: content,
          priority: section.priority
        });
      }
    }
  }
  
  // Add a few more specific chunks for important rules
  const importantRules = [
    {
      title: 'Critical Persona Switching Rule',
      content: 'When @Fliz@ talks to you, IMMEDIATELY switch to CHUCK MODE. For everyone else, use ZORK MODE.',
      category: 'core_identity',
      subcategory: 'persona_switching',
      priority: 2
    },
    {
      title: 'Action Block Requirement',
      content: 'CRITICAL: When a god-mode player asks you to perform ANY action (create, modify, remove, etc.), you MUST include an action block in your response. Without the action block, nothing will happen!',
      category: 'command_knowledge',
      subcategory: 'action_format',
      priority: 1
    },
    {
      title: 'Use Exact Player Names in Actions',
      content: 'CRITICAL: Always use the EXACT "Speaker Full Name" value from the context (e.g., "@Fliz@") in action blocks, NOT the display name (e.g., "Fliz").',
      category: 'command_knowledge',
      subcategory: 'action_format',
      priority: 1
    },
    {
      title: 'Puzzle Solution Rules',
      content: 'Puzzle Solutions: NEVER reveal puzzle/riddle solutions to regular players. They must solve it themselves. For god-mode players, you SHOULD provide solutions to help them test/debug the game.',
      category: 'interaction_patterns',
      subcategory: 'puzzle_rules',
      priority: 1
    }
  ];
  
  knowledgeChunks.push(...importantRules);
}

/**
 * Main seeding function
 */
async function seedKnowledge() {
  console.log('='.repeat(60));
  console.log('Seeding ZORK Knowledge Base');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    // Read system prompt
    const promptPath = path.join(__dirname, 'zork-system-prompt.md');
    if (!fs.existsSync(promptPath)) {
      throw new Error(`System prompt file not found: ${promptPath}`);
    }
    
    const promptContent = fs.readFileSync(promptPath, 'utf-8');
    console.log('✓ Loaded system prompt file');
    
    // Parse and chunk
    parseSystemPrompt(promptContent);
    console.log(`✓ Parsed ${knowledgeChunks.length} knowledge chunks`);
    
    // Check if knowledge base already has entries
    const existing = await db.query('SELECT COUNT(*) as count FROM zork_knowledge WHERE source = $1', ['system']);
    const existingCount = existing.rows[0]?.count || 0;
    
    if (existingCount > 0) {
      console.log(`⚠ Warning: Found ${existingCount} existing system knowledge chunks.`);
      console.log('  This script will add new chunks. To replace, delete existing chunks first.');
      console.log('');
    }
    
    // Generate embeddings and store
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < knowledgeChunks.length; i++) {
      const chunk = knowledgeChunks[i];
      try {
        console.log(`Processing chunk ${i + 1}/${knowledgeChunks.length}: ${chunk.title}...`);
        
        // Generate embedding
        const textToEmbed = prepareKnowledgeForEmbedding(chunk.title, chunk.content);
        let embedding = null;
        
        try {
          embedding = await generateEmbedding(textToEmbed);
        } catch (error) {
          console.warn(`  ⚠ Failed to generate embedding: ${error.message}`);
          console.warn(`  Continuing without embedding (will use keyword search fallback)`);
        }
        
        // Store in database
        await db.addZorkKnowledge(
          chunk.category,
          chunk.subcategory,
          chunk.title,
          chunk.content,
          embedding,
          chunk.priority,
          'system',
          null
        );
        
        successCount++;
        console.log(`  ✓ Stored: ${chunk.category}/${chunk.subcategory} (priority ${chunk.priority})`);
        
        // Small delay to avoid rate limiting
        if (i < knowledgeChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        errorCount++;
        console.error(`  ✗ Error storing chunk "${chunk.title}": ${error.message}`);
      }
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Seeding Complete');
    console.log('='.repeat(60));
    console.log(`✓ Successfully stored: ${successCount} chunks`);
    if (errorCount > 0) {
      console.log(`✗ Errors: ${errorCount} chunks`);
    }
    console.log('');
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedKnowledge()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { seedKnowledge };


