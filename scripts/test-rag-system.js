#!/usr/bin/env node
/**
 * RAG System Test Suite
 * 
 * Tests the knowledge retrieval system to ensure:
 * 1. Knowledge is properly stored
 * 2. Semantic search works (when embeddings available)
 * 3. Keyword search fallback works
 * 4. Category-based retrieval works
 * 5. Priority-based retrieval works
 * 6. ZORK can access all knowledge categories
 */

require('dotenv').config();
const db = require('../database');
const { generateEmbedding } = require('../utils/zorkKnowledge');

// Test queries that should find specific knowledge
const TEST_QUERIES = [
  {
    name: 'Email System Query',
    query: 'how does the game email system work',
    expectedCategories: ['system_docs', 'game_design'],
    expectedKeywords: ['email', 'SMTP', 'verification', 'password reset'],
  },
  {
    name: 'Railway Deployment Query',
    query: 'how do I deploy to railway',
    expectedCategories: ['system_docs'],
    expectedKeywords: ['railway', 'deployment', 'postgresql'],
  },
  {
    name: 'ZORK Persona Query',
    query: 'who is zork and what is his personality',
    expectedCategories: ['core_identity'],
    expectedKeywords: ['zork', 'chuck', 'persona', 'claude'],
  },
  {
    name: 'Game Mechanics Query',
    query: 'how does harvesting work with NPCs',
    expectedCategories: ['game_design', 'world_lore'],
    expectedKeywords: ['harvest', 'npc', 'cycle', 'pulse'],
  },
  {
    name: 'Database Sync Query',
    query: 'how do I sync dev database to production',
    expectedCategories: ['system_docs'],
    expectedKeywords: ['sync', 'database', 'dev', 'prod'],
  },
];

/**
 * Test 1: Verify knowledge exists in database
 */
async function testKnowledgeExists() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Knowledge Exists in Database');
  console.log('='.repeat(60));
  
  const categories = await db.query(
    'SELECT category, COUNT(*) as count FROM zork_knowledge WHERE active = TRUE GROUP BY category ORDER BY count DESC'
  );
  
  console.log('\nKnowledge by category:');
  for (const row of categories.rows) {
    console.log(`  ${row.category}: ${row.count} chunks`);
  }
  
  // Check for specific knowledge
  const emailKnowledge = await db.query(
    "SELECT id, title, category FROM zork_knowledge WHERE (title ILIKE '%email%' OR content ILIKE '%email%') AND active = TRUE LIMIT 5"
  );
  
  console.log(`\n✓ Found ${emailKnowledge.rows.length} email-related knowledge chunks:`);
  for (const row of emailKnowledge.rows) {
    console.log(`  [${row.id}] ${row.category}: ${row.title}`);
  }
  
  return emailKnowledge.rows.length > 0;
}

/**
 * Test 2: Test keyword search (fallback when embeddings not available)
 */
async function testKeywordSearch() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Keyword Search (Fallback)');
  console.log('='.repeat(60));
  
  const results = [];
  
  for (const test of TEST_QUERIES) {
    console.log(`\nQuery: "${test.query}"`);
    
    // Build keyword search
    const keywords = test.query.toLowerCase().split(/\s+/);
    const keywordPattern = keywords.map(k => `%${k}%`).join(' OR ');
    
    const sql = `
      SELECT id, category, title, 
             CASE 
               WHEN title ILIKE ANY(ARRAY[${keywords.map(() => '?').join(',')}]) THEN 1
               WHEN content ILIKE ANY(ARRAY[${keywords.map(() => '?').join(',')}]) THEN 2
               ELSE 3
             END as match_quality
      FROM zork_knowledge
      WHERE active = TRUE 
        AND (title ILIKE ANY(ARRAY[${keywords.map(() => '?').join(',')}]) 
             OR content ILIKE ANY(ARRAY[${keywords.map(() => '?').join(',')}]))
      ORDER BY match_quality, title
      LIMIT 5
    `;
    
    const params = [...keywords.map(k => `%${k}%`), ...keywords.map(k => `%${k}%`)];
    
    try {
      const matches = await db.query(sql, params);
      
      console.log(`  Found ${matches.rows.length} matches:`);
      for (const match of matches.rows) {
        const categoryMatch = test.expectedCategories.includes(match.category) ? '✓' : '✗';
        console.log(`    ${categoryMatch} [${match.id}] ${match.category}: ${match.title}`);
      }
      
      const categoryMatches = matches.rows.filter(r => 
        test.expectedCategories.includes(r.category)
      );
      
      results.push({
        query: test.name,
        found: matches.rows.length,
        categoryMatches: categoryMatches.length,
        success: categoryMatches.length > 0,
      });
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      results.push({ query: test.name, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✓ Keyword search: ${successCount}/${results.length} queries found expected categories`);
  
  return results;
}

/**
 * Test 3: Test semantic search (when embeddings available)
 */
async function testSemanticSearch() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Semantic Search (Embeddings)');
  console.log('='.repeat(60));
  
  // Check if embeddings are available
  const embeddingCheck = await db.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'`
  );
  
  if (embeddingCheck.rows.length === 0) {
    console.log('⚠ Embedding column not found - semantic search not available');
    console.log('  (This is OK if pgvector extension is not installed)');
    return { available: false };
  }
  
  // Check if any embeddings exist
  const embeddingCount = await db.query(
    'SELECT COUNT(*) as count FROM zork_knowledge WHERE embedding IS NOT NULL AND active = TRUE'
  );
  
  if (parseInt(embeddingCount.rows[0].count) === 0) {
    console.log('⚠ No embeddings found in database');
    console.log('  Run seed script with OPENAI_API_KEY set to generate embeddings');
    return { available: false, hasEmbeddings: false };
  }
  
  console.log(`✓ Found ${embeddingCount.rows[0].count} knowledge chunks with embeddings`);
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠ OPENAI_API_KEY not set - cannot test semantic search');
    return { available: false, hasEmbeddings: true, noApiKey: true };
  }
  
  const results = [];
  
  for (const test of TEST_QUERIES) {
    console.log(`\nQuery: "${test.query}"`);
    
    try {
      // Generate embedding for query
      const queryEmbedding = await generateEmbedding(test.query);
      
      // Perform semantic search
      const matches = await db.searchZorkKnowledge(
        queryEmbedding,
        5, // limit
        0.6, // threshold
        null, // category
        null // priority
      );
      
      console.log(`  Found ${matches.length} semantic matches:`);
      for (const match of matches) {
        const categoryMatch = test.expectedCategories.includes(match.category) ? '✓' : '✗';
        console.log(`    ${categoryMatch} [${match.id}] ${match.category}: ${match.title}`);
      }
      
      const categoryMatches = matches.filter(r => 
        test.expectedCategories.includes(r.category)
      );
      
      results.push({
        query: test.name,
        found: matches.length,
        categoryMatches: categoryMatches.length,
        success: categoryMatches.length > 0,
      });
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      results.push({ query: test.name, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✓ Semantic search: ${successCount}/${results.length} queries found expected categories`);
  
  return { available: true, results };
}

/**
 * Test 4: Test category-based retrieval
 */
async function testCategoryRetrieval() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Category-Based Retrieval');
  console.log('='.repeat(60));
  
  const categories = ['system_docs', 'game_design', 'core_identity', 'technical'];
  const results = {};
  
  for (const category of categories) {
    const chunks = await db.getZorkKnowledgeByCategory(category, null);
    results[category] = chunks.length;
    console.log(`  ${category}: ${chunks.length} chunks`);
  }
  
  // Specifically check system_docs (where email.md should be)
  const systemDocs = await db.getZorkKnowledgeByCategory('system_docs', null);
  console.log(`\n✓ system_docs category has ${systemDocs.length} chunks:`);
  for (const doc of systemDocs) {
    console.log(`    - ${doc.title}`);
  }
  
  return results;
}

/**
 * Test 5: Test priority-based retrieval
 */
async function testPriorityRetrieval() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Priority-Based Retrieval');
  console.log('='.repeat(60));
  
  const alwaysInclude = await db.getAlwaysIncludeKnowledge();
  console.log(`\nPriority 2 (always-include): ${alwaysInclude.length} chunks`);
  for (const chunk of alwaysInclude.slice(0, 5)) {
    console.log(`  - ${chunk.category}: ${chunk.title}`);
  }
  
  const priority1 = await db.query(
    'SELECT category, COUNT(*) as count FROM zork_knowledge WHERE priority = 1 AND active = TRUE GROUP BY category'
  );
  console.log(`\nPriority 1 (important):`);
  for (const row of priority1.rows) {
    console.log(`  - ${row.category}: ${row.count} chunks`);
  }
  
  const priority0 = await db.query(
    'SELECT category, COUNT(*) as count FROM zork_knowledge WHERE priority = 0 AND active = TRUE GROUP BY category'
  );
  console.log(`\nPriority 0 (contextual):`);
  for (const row of priority0.rows) {
    console.log(`  - ${row.category}: ${row.count} chunks`);
  }
  
  return {
    priority2: alwaysInclude.length,
    priority1: priority1.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
    priority0: priority0.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
  };
}

/**
 * Test 6: Simulate ZORK's getRelevantKnowledge function
 */
async function testZorkKnowledgeRetrieval() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 6: Simulate ZORK Knowledge Retrieval');
  console.log('='.repeat(60));
  
  const testMessage = 'how does the game email system work';
  console.log(`\nTest message: "${testMessage}"`);
  console.log('\nSimulating ZORK\'s getRelevantKnowledge()...\n');
  
  const knowledgeChunks = [];
  
  // 1. Always load priority 2
  const alwaysInclude = await db.getAlwaysIncludeKnowledge();
  console.log(`1. Priority 2 (always-include): ${alwaysInclude.length} chunks`);
  for (const chunk of alwaysInclude) {
    knowledgeChunks.push({
      title: chunk.title,
      category: chunk.category,
      priority: chunk.priority,
    });
  }
  
  // 2. Semantic search for priority 0 (if embeddings available)
  let queryEmbedding = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      queryEmbedding = await generateEmbedding(testMessage);
      const contextual = await db.searchZorkKnowledge(queryEmbedding, 5, 0.7, null, 0);
      console.log(`2. Semantic search (priority 0): ${contextual.length} chunks`);
      for (const chunk of contextual) {
        if (!knowledgeChunks.find(k => k.title === chunk.title)) {
          knowledgeChunks.push({
            title: chunk.title,
            category: chunk.category,
            priority: chunk.priority,
          });
        }
      }
    } catch (error) {
      console.log(`2. Semantic search: Failed (${error.message})`);
    }
  } else {
    console.log('2. Semantic search: Skipped (no OPENAI_API_KEY)');
  }
  
  // 3. Category-based (command_knowledge) - not relevant for email query
  const lowerMessage = testMessage.toLowerCase();
  if (lowerMessage.includes('action') || lowerMessage.includes('command')) {
    const commandKnowledge = await db.getZorkKnowledgeByCategory('command_knowledge', 1);
    console.log(`3. Command knowledge: ${commandKnowledge.length} chunks`);
    // ... add to knowledgeChunks
  } else {
    console.log('3. Command knowledge: Not triggered (no command keywords)');
  }
  
  // 4. Check if system_docs should be loaded
  // PROBLEM: ZORK doesn't explicitly load system_docs!
  console.log('\n⚠ ISSUE FOUND: system_docs category is not explicitly loaded by ZORK!');
  console.log('  ZORK only loads:');
  console.log('    - Priority 2 (core_identity)');
  console.log('    - Priority 0 via semantic search');
  console.log('    - command_knowledge (priority 1) if keywords match');
  console.log('    - learned_context semantically');
  console.log('\n  system_docs (priority 0) would only be found via semantic search');
  console.log('  If embeddings are missing, system_docs won\'t be found!');
  
  // Show what ZORK would actually get
  console.log(`\n✓ ZORK would receive ${knowledgeChunks.length} knowledge chunks:`);
  const byCategory = {};
  for (const chunk of knowledgeChunks) {
    byCategory[chunk.category] = (byCategory[chunk.category] || 0) + 1;
  }
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`  ${category}: ${count} chunks`);
  }
  
  // Check if email knowledge is included
  const hasEmail = knowledgeChunks.some(k => 
    k.title.toLowerCase().includes('email') || 
    k.category === 'system_docs'
  );
  
  if (!hasEmail) {
    console.log('\n✗ PROBLEM: Email knowledge NOT found in ZORK\'s context!');
    console.log('  This explains why ZORK doesn\'t know about the email system.');
  } else {
    console.log('\n✓ Email knowledge found in ZORK\'s context');
  }
  
  return { chunks: knowledgeChunks, hasEmail };
}

/**
 * Main test runner
 */
async function main() {
  console.log('='.repeat(60));
  console.log('RAG System Test Suite');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Knowledge exists
    const test1 = await testKnowledgeExists();
    
    // Test 2: Keyword search
    const test2 = await testKeywordSearch();
    
    // Test 3: Semantic search
    const test3 = await testSemanticSearch();
    
    // Test 4: Category retrieval
    const test4 = await testCategoryRetrieval();
    
    // Test 5: Priority retrieval
    const test5 = await testPriorityRetrieval();
    
    // Test 6: ZORK simulation
    const test6 = await testZorkKnowledgeRetrieval();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Knowledge exists: ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Keyword search: ${test2.filter(r => r.success).length}/${test2.length} queries passed`);
    console.log(`✓ Semantic search: ${test3.available ? (test3.results ? `${test3.results.filter(r => r.success).length}/${test3.results.length} queries passed` : 'Available but not tested') : 'Not available'}`);
    console.log(`✓ Category retrieval: ${Object.keys(test4).length} categories tested`);
    console.log(`✓ Priority retrieval: P2=${test5.priority2}, P1=${test5.priority1}, P0=${test5.priority0}`);
    console.log(`✓ ZORK simulation: ${test6.hasEmail ? 'Email knowledge found' : 'Email knowledge MISSING'}`);
    
    if (!test6.hasEmail) {
      console.log('\n⚠ RECOMMENDATION: Update ZORK\'s getRelevantKnowledge() to explicitly');
      console.log('  load system_docs category for system-related queries.');
    }
    
  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

main();

