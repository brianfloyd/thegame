#!/usr/bin/env node
/**
 * RAG Knowledge System Test Suite
 * 
 * Tests that ZORK can retrieve knowledge from the database correctly.
 * 
 * Usage:
 *   node scripts/test-rag-knowledge.js
 */

require('dotenv').config();
const db = require('../database');
const { generateEmbedding } = require('../utils/zorkKnowledge');

// Test queries and expected knowledge
const TEST_QUERIES = [
  {
    query: 'How does the game email system work?',
    expectedCategories: ['system_docs', 'game_design'],
    expectedKeywords: ['email', 'SMTP', 'verification', 'password reset'],
    description: 'Email system knowledge retrieval',
  },
  {
    query: 'How do I deploy to Railway?',
    expectedCategories: ['system_docs'],
    expectedKeywords: ['railway', 'deployment', 'postgresql'],
    description: 'Railway deployment knowledge',
  },
  {
    query: 'What are ZORK\'s god mode actions?',
    expectedCategories: ['command_knowledge', 'core_identity'],
    expectedKeywords: ['action', 'god mode', 'createRoom', 'updatePlayer'],
    description: 'Command knowledge retrieval',
  },
  {
    query: 'How does the harvest system work?',
    expectedCategories: ['world_lore', 'game_design'],
    expectedKeywords: ['harvest', 'NPC', 'cycle', 'pulse'],
    description: 'Game mechanics knowledge',
  },
  {
    query: 'What is the markup system?',
    expectedCategories: ['command_knowledge', 'game_design'],
    expectedKeywords: ['markup', 'convention', 'styling'],
    description: 'Markup system knowledge',
  },
];

/**
 * Test semantic search (if embeddings available)
 */
async function testSemanticSearch(query, expectedKeywords) {
  console.log(`\n  Testing semantic search for: "${query}"`);
  
  try {
    const embedding = await generateEmbedding(query);
    const results = await db.searchZorkKnowledge(embedding, 5, 0.6, null, null);
    
    console.log(`    Found ${results.length} results`);
    
    // Check if any results contain expected keywords
    const foundKeywords = [];
    for (const result of results) {
      const content = (result.title + ' ' + result.content).toLowerCase();
      for (const keyword of expectedKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          foundKeywords.push(keyword);
        }
      }
    }
    
    if (foundKeywords.length > 0) {
      console.log(`    ✓ Found relevant keywords: ${foundKeywords.join(', ')}`);
      return { success: true, foundKeywords };
    } else {
      console.log(`    ⚠ No expected keywords found in results`);
      console.log(`    Results: ${results.map(r => r.title).join(', ')}`);
      return { success: false, foundKeywords: [] };
    }
  } catch (error) {
    if (error.message.includes('OPENAI_API_KEY')) {
      console.log(`    ⏭ Skipped (no OpenAI API key for embeddings)`);
      return { success: null, skipped: true };
    }
    console.log(`    ✗ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test keyword search (fallback when no embeddings)
 */
async function testKeywordSearch(query, expectedKeywords) {
  console.log(`\n  Testing keyword search for: "${query}"`);
  
  // Extract keywords from query
  const queryKeywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  // Search for knowledge containing these keywords
  const allKnowledge = await db.query(
    `SELECT id, category, title, content 
     FROM zork_knowledge 
     WHERE active = TRUE 
     AND (
       ${queryKeywords.map((_, i) => `(title ILIKE $${i + 1} OR content ILIKE $${i + 1})`).join(' OR ')}
     )
     LIMIT 10`,
    queryKeywords.map(k => `%${k}%`)
  );
  
  console.log(`    Found ${allKnowledge.rows.length} results`);
  
  // Check if any results contain expected keywords
  const foundKeywords = [];
  for (const result of allKnowledge.rows) {
    const content = (result.title + ' ' + result.content).toLowerCase();
    for (const keyword of expectedKeywords) {
      if (content.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
      }
    }
  }
  
  if (foundKeywords.length > 0) {
    console.log(`    ✓ Found relevant keywords: ${foundKeywords.join(', ')}`);
    return { success: true, foundKeywords };
  } else {
    console.log(`    ⚠ No expected keywords found`);
    return { success: false, foundKeywords: [] };
  }
}

/**
 * Test category-based retrieval
 */
async function testCategoryRetrieval(categories) {
  console.log(`\n  Testing category retrieval: ${categories.join(', ')}`);
  
  const allResults = [];
  for (const category of categories) {
    const results = await db.getZorkKnowledgeByCategory(category, null);
    allResults.push(...results);
    console.log(`    ${category}: ${results.length} chunks`);
  }
  
  if (allResults.length > 0) {
    console.log(`    ✓ Found ${allResults.length} total chunks`);
    return { success: true, count: allResults.length };
  } else {
    console.log(`    ✗ No chunks found in categories`);
    return { success: false, count: 0 };
  }
}

/**
 * Test priority-based retrieval
 */
async function testPriorityRetrieval() {
  console.log(`\n  Testing priority-based retrieval`);
  
  const priority2 = await db.getAlwaysIncludeKnowledge();
  console.log(`    Priority 2 (always-include): ${priority2.length} chunks`);
  
  const priority1 = await db.getZorkKnowledgeByCategory(null, 1);
  console.log(`    Priority 1 (important): ${priority1.length} chunks`);
  
  const priority0 = await db.query(
    'SELECT COUNT(*) as count FROM zork_knowledge WHERE active = TRUE AND priority = 0'
  );
  console.log(`    Priority 0 (contextual): ${priority0.rows[0].count} chunks`);
  
  return {
    success: true,
    priority2: priority2.length,
    priority1: priority1.length,
    priority0: parseInt(priority0.rows[0].count),
  };
}

/**
 * Test specific knowledge exists
 */
async function testSpecificKnowledge() {
  console.log(`\n  Testing specific knowledge chunks exist`);
  
  const checks = [
    { title: 'email.md', category: 'system_docs', description: 'Email system documentation' },
    { title: 'railway.md', category: 'system_docs', description: 'Railway deployment guide' },
    { title: 'ZORK THE AI LORD - System Prompt', category: 'core_identity', description: 'ZORK system prompt' },
  ];
  
  const results = [];
  for (const check of checks) {
    const found = await db.query(
      'SELECT id, title FROM zork_knowledge WHERE active = TRUE AND title = $1 AND category = $2',
      [check.title, check.category]
    );
    
    if (found.rows.length > 0) {
      console.log(`    ✓ ${check.description}: Found (ID: ${found.rows[0].id})`);
      results.push({ ...check, found: true, id: found.rows[0].id });
    } else {
      console.log(`    ✗ ${check.description}: NOT FOUND`);
      results.push({ ...check, found: false });
    }
  }
  
  return { success: results.every(r => r.found), results };
}

/**
 * Main test function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('RAG Knowledge System Test Suite');
  console.log('='.repeat(60));
  
  // Check database connection
  try {
    await db.query('SELECT 1');
    console.log('\n✓ Database connection successful');
  } catch (error) {
    console.error('\n✗ Database connection failed:', error.message);
    process.exit(1);
  }
  
  // Check if table exists
  const tableCheck = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name = 'zork_knowledge'"
  );
  if (tableCheck.rows.length === 0) {
    console.error('\n✗ zork_knowledge table does not exist');
    process.exit(1);
  }
  console.log('✓ zork_knowledge table exists');
  
  // Test 1: Specific knowledge exists
  console.log('\n' + '='.repeat(60));
  console.log('Test 1: Specific Knowledge Exists');
  console.log('='.repeat(60));
  const test1 = await testSpecificKnowledge();
  
  // Test 2: Priority-based retrieval
  console.log('\n' + '='.repeat(60));
  console.log('Test 2: Priority-Based Retrieval');
  console.log('='.repeat(60));
  const test2 = await testPriorityRetrieval();
  
  // Test 3: Category-based retrieval
  console.log('\n' + '='.repeat(60));
  console.log('Test 3: Category-Based Retrieval');
  console.log('='.repeat(60));
  const test3 = await testCategoryRetrieval(['system_docs', 'game_design', 'core_identity']);
  
  // Test 4: Query-based retrieval
  console.log('\n' + '='.repeat(60));
  console.log('Test 4: Query-Based Retrieval');
  console.log('='.repeat(60));
  
  const test4Results = [];
  for (const testQuery of TEST_QUERIES) {
    console.log(`\n  Query: "${testQuery.query}"`);
    console.log(`  Description: ${testQuery.description}`);
    
    // Try semantic search first
    const semanticResult = await testSemanticSearch(testQuery.query, testQuery.expectedKeywords);
    
    // If semantic search skipped (no embeddings), try keyword search
    if (semanticResult.skipped) {
      const keywordResult = await testKeywordSearch(testQuery.query, testQuery.expectedKeywords);
      test4Results.push({
        query: testQuery.query,
        semantic: semanticResult,
        keyword: keywordResult,
      });
    } else {
      test4Results.push({
        query: testQuery.query,
        semantic: semanticResult,
        keyword: null,
      });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  
  console.log(`\nTest 1 (Specific Knowledge): ${test1.success ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 2 (Priority Retrieval): ${test2.success ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 3 (Category Retrieval): ${test3.success ? '✓ PASS' : '✗ FAIL'}`);
  
  console.log(`\nTest 4 (Query Retrieval):`);
  for (const result of test4Results) {
    const semanticStatus = result.semantic.skipped 
      ? '⏭ SKIPPED (no embeddings)'
      : result.semantic.success 
        ? '✓ PASS' 
        : '✗ FAIL';
    const keywordStatus = result.keyword 
      ? (result.keyword.success ? '✓ PASS' : '✗ FAIL')
      : '';
    
    console.log(`  "${result.query.substring(0, 50)}..."`);
    console.log(`    Semantic: ${semanticStatus}`);
    if (result.keyword) {
      console.log(`    Keyword: ${keywordStatus}`);
    }
  }
  
  // Recommendations
  console.log('\n' + '='.repeat(60));
  console.log('Recommendations');
  console.log('='.repeat(60));
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n⚠ OPENAI_API_KEY not set - semantic search unavailable');
    console.log('  Set OPENAI_API_KEY to enable semantic search with embeddings');
    console.log('  Keyword search will work as fallback, but may be less accurate');
  }
  
  const allPassed = test1.success && test2.success && test3.success;
  if (allPassed) {
    console.log('\n✓ All basic tests passed!');
  } else {
    console.log('\n✗ Some tests failed - check output above');
  }
  
  // Close database
  await db.closePool();
  console.log('\n✓ Done');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


