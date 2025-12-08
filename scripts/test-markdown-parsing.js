/**
 * Test script for markdown parsing
 * Tests the markdown parser and combined markdown+markup parsing
 */

const { parseMarkdown } = require('../public/js/utils/Markdown.js');
const { parseMarkup } = require('../public/js/utils/Markup.js');

// Test cases
const testCases = [
  {
    name: 'Simple bulleted list',
    input: `Here are some options:\n\n- Option 1\n- Option 2\n- Option 3`,
    expected: 'Should have <ul> and <li> tags'
  },
  {
    name: 'List with bold text',
    input: `Here are the tools:\n\n- **Database queries** for stats\n- **Game analytics** for insights\n- **World state** analysis`,
    expected: 'Should have <ul>, <li>, and <strong> tags'
  },
  {
    name: 'List with markup',
    input: `Here are the areas:\n\n- <Database> queries\n- <Game> analytics\n- <World> state`,
    expected: 'Should have markdown lists AND markup highlighting'
  },
  {
    name: 'Numbered list',
    input: `Steps to follow:\n\n1. First step\n2. Second step\n3. Third step`,
    expected: 'Should have <ol> and <li> tags'
  },
  {
    name: 'Mixed content',
    input: `Here's what I can do:\n\n**Database queries** to pull stats:\n- Player activity\n- NPC interactions\n- Item flows\n\n**Game analytics** for insights.`,
    expected: 'Should have proper formatting with lists and bold'
  }
];

console.log('='.repeat(60));
console.log('Testing Markdown Parser');
console.log('='.repeat(60));

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(60));
  console.log('Input:');
  console.log(testCase.input);
  console.log('\nMarkdown Output:');
  
  try {
    const markdownResult = parseMarkdown(testCase.input);
    console.log(markdownResult);
    console.log('\nCombined (Markdown + Markup):');
    const combinedResult = parseMarkup(markdownResult, '#00ffff');
    console.log(combinedResult);
    
    // Check if HTML tags are preserved
    const hasHtmlTags = /<[^>]+>/.test(combinedResult);
    const hasEscapedTags = /&lt;|&gt;/.test(combinedResult);
    
    console.log(`\n✓ Has HTML tags: ${hasHtmlTags}`);
    console.log(`✗ Has escaped tags (BAD): ${hasEscapedTags}`);
    
    if (hasEscapedTags) {
      console.log('⚠️  WARNING: HTML tags are being escaped!');
    }
  } catch (error) {
    console.error('ERROR:', error.message);
  }
});

console.log('\n' + '='.repeat(60));
console.log('Testing specific problematic case from image');
console.log('='.repeat(60));

const problematicInput = `Are you talking about:\n\n- **Database queries** to pull stats\n- **Game analytics** for insights\n- **World state** analysis\n- **Player behavior** patterns\n\nGive me a direction.`;

console.log('\nInput:');
console.log(problematicInput);
console.log('\nMarkdown Output:');
const mdResult = parseMarkdown(problematicInput);
console.log(mdResult);
console.log('\nCombined Output:');
const combined = parseMarkup(mdResult, '#00ffff');
console.log(combined);

// Check for the specific issues we saw
if (combined.includes('brbr') || combined.includes('lilistrong')) {
  console.log('\n❌ FAILED: Found literal "brbr" or "lilistrong" in output');
  console.log('This means HTML tags are being mangled or escaped incorrectly');
} else {
  console.log('\n✓ No literal tag text found');
}


