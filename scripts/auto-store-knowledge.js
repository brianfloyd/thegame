#!/usr/bin/env node
/**
 * Automatic Knowledge Storage Helper
 * 
 * This script can be called by Cursor or other tools to automatically
 * extract feature information and store it in the knowledge base.
 * 
 * Usage:
 *   node scripts/auto-store-knowledge.js --title "Feature" --category "game_design" --content "Description..."
 *   node scripts/auto-store-knowledge.js --file "path/to/feature.md"
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { storeKnowledgeWithEmbedding } = require('../utils/zorkKnowledge');

/**
 * Extract feature info from markdown file
 */
function parseFeatureFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const info = {
    title: null,
    category: null,
    priority: 0,
    content: [],
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Extract title
    if (line.startsWith('# Feature: ')) {
      info.title = line.replace('# Feature: ', '').trim();
    }
    
    // Extract category from Knowledge Base Entry section
    if (line.includes('**Category:**')) {
      const categoryMatch = line.match(/\*\*Category:\*\* `(\w+)`/);
      if (categoryMatch) {
        info.category = categoryMatch[1];
      }
    }
    
    // Extract priority
    if (line.includes('**Priority:**')) {
      const priorityMatch = line.match(/\*\*Priority:\*\* `([012])`/);
      if (priorityMatch) {
        info.priority = parseInt(priorityMatch[1]);
      }
    }
    
    // Extract content to store
    if (line.includes('**Content to Store:**')) {
      // Get content until next section or end
      i++;
      while (i < lines.length && !lines[i].startsWith('##')) {
        if (lines[i].trim() && !lines[i].startsWith('```')) {
          info.content.push(lines[i]);
        }
        i++;
      }
      break;
    }
  }
  
  return {
    ...info,
    content: info.content.join('\n').trim(),
  };
}

/**
 * Store knowledge from command line args
 */
async function storeFromArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        params[key] = value;
        i++;
      } else {
        params[key] = true;
      }
    }
  }
  
  let title, category, content, priority = 0;
  
  // If --file specified, parse file
  if (params.file) {
    const fileInfo = parseFeatureFile(params.file);
    title = fileInfo.title;
    category = fileInfo.category;
    content = fileInfo.content;
    priority = fileInfo.priority;
  } else {
    // Use direct arguments
    title = params.title;
    category = params.category;
    content = params.content;
    priority = params.priority ? parseInt(params.priority) : 0;
  }
  
  if (!title || !category || !content) {
    console.error('\nUsage:');
    console.error('  node scripts/auto-store-knowledge.js --title "Title" --category "category" --content "Content..." [--priority 0|1]');
    console.error('  node scripts/auto-store-knowledge.js --file "path/to/feature.md"');
    process.exit(1);
  }
  
  try {
    const knowledge = await storeKnowledgeWithEmbedding(
      db,
      category,
      'feature',
      title,
      content,
      priority,
      'cursor',
      'Auto-storage'
    );
    
    console.log(`✓ Knowledge stored: "${title}" (ID: ${knowledge.id})`);
    return knowledge;
  } catch (error) {
    console.error(`✗ Failed: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  storeFromArgs()
    .then(() => db.closePool())
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { parseFeatureFile, storeFromArgs };

