/**
 * Create markup conventions for formatting (headers, lists, bold, etc.)
 * These will allow ZORK and players to use markdown-like syntax that gets converted to markup
 */

require('dotenv').config();
const db = require('../database');

const formattingConventions = [
  // Headers
  {
    syntax: '##text##',
    opening: '##',
    closing: '##',
    description: 'H2 Header - Large, bold, prominent section title',
    example: '##Main Features##',
    color: '#ffff00', // Yellow for headers
    effects: { glow: true, bold: true, fontSize: '1.2em' }
  },
  {
    syntax: '###text###',
    opening: '###',
    closing: '###',
    description: 'H3 Header - Medium section subtitle',
    example: '###Subsection###',
    color: '#00ffff', // Cyan for subheaders
    effects: { glow: true, bold: true, fontSize: '1.1em' }
  },
  {
    syntax: '####text####',
    opening: '####',
    closing: '####',
    description: 'H4 Header - Small section title',
    example: '####Details####',
    color: '#88ff00', // Lime for small headers
    effects: { glow: true, bold: true }
  },
  
  // Bold text
  {
    syntax: '**text**',
    opening: '**',
    closing: '**',
    description: 'Bold text - Emphasized important text',
    example: 'This is **important** information.',
    color: 'inherit',
    effects: { bold: true }
  },
  
  // Italic text
  {
    syntax: '*text*',
    opening: '*',
    closing: '*',
    description: 'Italic text - Subtle emphasis',
    example: 'This is *subtle* emphasis.',
    color: 'inherit',
    effects: { italic: true }
  },
  
  // Note: List items and line breaks need special handling in the parser
  // We'll create them but they may need parser updates to work correctly
];

async function createFormattingMarkup() {
  console.log('='.repeat(60));
  console.log('Creating Formatting Markup Conventions');
  console.log('='.repeat(60));
  
  try {
    // Check existing conventions
    const existing = await db.getAllMarkupConventions();
    console.log(`\nFound ${existing.length} existing conventions`);
    
    let created = 0;
    let skipped = 0;
    
    for (const convention of formattingConventions) {
      // Check if convention already exists (by opening/closing)
      const exists = existing.find(c => 
        c.opening === convention.opening && c.closing === convention.closing
      );
      
      if (exists) {
        console.log(`⏭️  Skipping (exists): ${convention.syntax}`);
        skipped++;
        continue;
      }
      
      // Create the convention
      const result = await db.createMarkupConvention(convention);
      console.log(`✅ Created: ${convention.syntax} (ID: ${result.id})`);
      created++;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Summary: ${created} created, ${skipped} skipped`);
    console.log('='.repeat(60));
    
    // Reload markup service cache
    const { reloadMarkupConventions } = require('../utils/markupService');
    await reloadMarkupConventions(db);
    console.log('\n✅ Markup service cache reloaded');
    
    await db.closePool();
    console.log('Database connection closed.');
    
  } catch (error) {
    console.error('Error creating formatting markup:', error);
    await db.closePool();
    process.exit(1);
  }
}

if (require.main === module) {
  createFormattingMarkup()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { createFormattingMarkup };

