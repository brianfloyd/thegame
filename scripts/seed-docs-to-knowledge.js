#!/usr/bin/env node
/**
 * Seed Documentation to Knowledge Base
 * 
 * Reads consolidated documentation files and seeds them into the zork_knowledge table
 * for both ZORK and Cursor to access via RAG.
 * 
 * Usage:
 *   node scripts/seed-docs-to-knowledge.js [--dry-run]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../database');

// Try to load OpenAI for embeddings
let openai = null;
let generateEmbedding = null;

try {
  const OpenAI = require('openai');
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    generateEmbedding = async (text) => {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.trim(),
        dimensions: 1536,
      });
      return response.data[0].embedding;
    };
    console.log('✓ OpenAI client initialized for embeddings');
  } else {
    console.log('⚠ OPENAI_API_KEY not set - will seed without embeddings');
  }
} catch (e) {
  console.log('⚠ OpenAI not available - will seed without embeddings');
}

// Document configurations
const DOCS_CONFIG = [
  {
    file: 'docs/requirements.md',
    category: 'game_design',
    priority: 1,
    description: 'Game design and feature specifications',
  },
  {
    file: 'docs/claude.md',
    category: 'technical',
    priority: 0,
    description: 'Technical implementation details',
  },
  {
    file: 'docs/railway.md',
    category: 'system_docs',
    priority: 0,
    description: 'Railway deployment guide',
  },
  {
    file: 'docs/email.md',
    category: 'system_docs',
    priority: 0,
    description: 'Email system configuration',
  },
  {
    file: 'docs/database-sync.md',
    category: 'system_docs',
    priority: 0,
    description: 'Database sync (dev to prod)',
  },
  {
    file: 'docs/dbeaver.md',
    category: 'system_docs',
    priority: 0,
    description: 'DBeaver database client setup',
  },
  {
    file: 'docs/player-tutorial.md',
    category: 'world_lore',
    priority: 0,
    description: 'Player tutorial and game guide',
  },
  {
    file: 'scripts/zork-system-prompt.md',
    category: 'core_identity',
    priority: 2,
    description: 'ZORK persona and capabilities',
  },
];

/**
 * Parse markdown into chunks by heading
 */
function parseMarkdownIntoChunks(content, filename) {
  const chunks = [];
  const lines = content.split('\n');
  
  let currentChunk = {
    title: filename,
    content: [],
    level: 0,
  };
  
  for (const line of lines) {
    // Check for headings
    const h1Match = line.match(/^# (.+)$/);
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^### (.+)$/);
    
    if (h1Match || h2Match || h3Match) {
      // Save previous chunk if it has content
      if (currentChunk.content.length > 0) {
        chunks.push({
          title: currentChunk.title,
          content: currentChunk.content.join('\n').trim(),
        });
      }
      
      // Start new chunk
      const match = h1Match || h2Match || h3Match;
      currentChunk = {
        title: match[1],
        content: [],
        level: h1Match ? 1 : h2Match ? 2 : 3,
      };
    } else {
      currentChunk.content.push(line);
    }
  }
  
  // Save last chunk
  if (currentChunk.content.length > 0) {
    chunks.push({
      title: currentChunk.title,
      content: currentChunk.content.join('\n').trim(),
    });
  }
  
  // Filter out empty chunks and very small chunks
  return chunks.filter(chunk => chunk.content.length > 50);
}

/**
 * Check if a chunk already exists in the database
 */
async function chunkExists(title, category) {
  const result = await db.query(
    'SELECT id FROM zork_knowledge WHERE title = $1 AND category = $2 AND active = TRUE',
    [title, category]
  );
  return result.rows.length > 0;
}

/**
 * Add a knowledge chunk to the database
 */
async function addKnowledgeChunk(chunk, config, dryRun = false) {
  const { title, content } = chunk;
  const { category, priority, file } = config;
  const subcategory = path.basename(file, '.md');
  
  // Skip if already exists
  const exists = await chunkExists(title, category);
  if (exists) {
    console.log(`  ⏭ Skipping existing: "${title}"`);
    return { skipped: true };
  }
  
  if (dryRun) {
    console.log(`  📝 Would add: "${title}" (${content.length} chars)`);
    return { added: false, dryRun: true };
  }
  
  // Generate embedding if available
  let embedding = null;
  if (generateEmbedding) {
    try {
      const textToEmbed = `${title}\n\n${content}`;
      embedding = await generateEmbedding(textToEmbed);
    } catch (error) {
      console.warn(`  ⚠ Failed to generate embedding for "${title}":`, error.message);
    }
  }
  
  // Insert into database
  try {
    await db.addZorkKnowledge(
      category,
      subcategory,
      title,
      content,
      embedding,
      priority,
      'system',
      'seed-docs-script'
    );
    console.log(`  ✓ Added: "${title}" (${content.length} chars, embedding: ${embedding ? 'yes' : 'no'})`);
    return { added: true };
  } catch (error) {
    console.error(`  ✗ Failed to add "${title}":`, error.message);
    return { error: error.message };
  }
}

/**
 * Seed a single document
 */
async function seedDocument(config, dryRun = false) {
  const { file, category, description } = config;
  
  console.log(`\n📄 Processing: ${file}`);
  console.log(`   Category: ${category}, Description: ${description}`);
  
  // Check if file exists
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠ File not found: ${filePath}`);
    return { skipped: true, reason: 'file not found' };
  }
  
  // Read and parse file
  const content = fs.readFileSync(filePath, 'utf8');
  const chunks = parseMarkdownIntoChunks(content, path.basename(file));
  
  console.log(`   Found ${chunks.length} chunks`);
  
  // Add each chunk
  const results = {
    added: 0,
    skipped: 0,
    errors: 0,
  };
  
  for (const chunk of chunks) {
    const result = await addKnowledgeChunk(chunk, config, dryRun);
    if (result.added) results.added++;
    else if (result.skipped) results.skipped++;
    else if (result.error) results.errors++;
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('='.repeat(60));
  console.log('Seeding Documentation to Knowledge Base');
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  // Check database connection
  try {
    await db.query('SELECT 1');
    console.log('✓ Database connection successful');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
  
  // Check if zork_knowledge table exists
  try {
    const tableCheck = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'zork_knowledge'"
    );
    if (tableCheck.rows.length === 0) {
      console.error('✗ zork_knowledge table does not exist. Run migrations first.');
      process.exit(1);
    }
    console.log('✓ zork_knowledge table exists');
  } catch (error) {
    console.error('✗ Failed to check table:', error.message);
    process.exit(1);
  }
  
  // Process each document
  const totalResults = {
    added: 0,
    skipped: 0,
    errors: 0,
  };
  
  for (const config of DOCS_CONFIG) {
    const results = await seedDocument(config, dryRun);
    if (results.added) totalResults.added += results.added;
    if (results.skipped) totalResults.skipped += results.skipped;
    if (results.errors) totalResults.errors += results.errors;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Added:   ${totalResults.added}`);
  console.log(`Skipped: ${totalResults.skipped}`);
  console.log(`Errors:  ${totalResults.errors}`);
  
  if (dryRun) {
    console.log('\n🔍 This was a DRY RUN - run without --dry-run to apply changes');
  }
  
  // Close database connection
  await db.closePool();
  console.log('\n✓ Done');
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


