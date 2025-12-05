/**
 * Fix Vitalis Drain Migrations
 * 
 * This script manually applies the changes from migrations 048, 049, and 050
 * that were marked as applied but didn't actually run because the files were empty.
 * 
 * Run with: node scripts/fix-vitalis-drain-migrations.js (from project root)
 * 
 * If this script fails with database connection errors, you can:
 * 1. Set up your DATABASE_URL in .env file, OR
 * 2. Use Railway CLI: railway run node scripts/fix-vitalis-drain-migrations.js, OR
 * 3. Run the SQL directly: scripts/fix-vitalis-drain-migrations.sql
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixMigrations() {
  console.log('='.repeat(70));
  console.log('Fix Vitalis Drain Migrations (048, 049, 050)');
  console.log('='.repeat(70));
  console.log('');
  
  const client = await pool.connect();
  
  try {
    console.log('Starting migration fixes...\n');
    
    await client.query('BEGIN');
    
    try {
      // Migration 048: Add hit_vitalis and miss_vitalis columns
      console.log('Applying migration 048: Add NPC Vitalis Drain Fields...');
      
      // Check if columns exist
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'scriptable_npcs' 
        AND column_name IN ('hit_vitalis', 'miss_vitalis')
      `);
      
      const existingColumns = columnCheck.rows.map(row => row.column_name);
      
      if (!existingColumns.includes('hit_vitalis')) {
        await client.query('ALTER TABLE scriptable_npcs ADD COLUMN hit_vitalis INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Added hit_vitalis column');
      } else {
        console.log('  - hit_vitalis column already exists');
      }
      
      if (!existingColumns.includes('miss_vitalis')) {
        await client.query('ALTER TABLE scriptable_npcs ADD COLUMN miss_vitalis INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Added miss_vitalis column');
      } else {
        console.log('  - miss_vitalis column already exists');
      }
      
      // Set defaults for existing NPCs
      await client.query(`
        UPDATE scriptable_npcs 
        SET hit_vitalis = 0, miss_vitalis = 0 
        WHERE hit_vitalis IS NULL OR miss_vitalis IS NULL
      `);
      console.log('  ✓ Updated existing NPCs with defaults\n');
      
      // Migration 049: Add vitalis_drain_reduction formula config
      console.log('Applying migration 049: Vitalis Drain Reduction Formula...');
      
      const formulaCheck = await client.query(`
        SELECT config_key FROM harvest_formula_config WHERE config_key = 'vitalis_drain_reduction'
      `);
      
      if (formulaCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
          VALUES (
            'vitalis_drain_reduction',
            'Reduces Vitalis drain amount based on average of fortitude and resonance stats. Value represents percentage reduction (0.05 = 5%, 0.75 = 75%).',
            5,
            0.0500,
            100,
            0.7500,
            2.00
          )
        `);
        console.log('  ✓ Added vitalis_drain_reduction formula config\n');
      } else {
        console.log('  - vitalis_drain_reduction formula config already exists\n');
      }
      
      // Migration 050: Add vitalis drain messages
      console.log('Applying migration 050: Vitalis Drain Messages...');
      
      const messageCheck = await client.query(`
        SELECT message_key FROM game_messages WHERE message_key IN ('vitalis_drain_hit', 'vitalis_drain_miss')
      `);
      
      const existingMessages = messageCheck.rows.map(row => row.message_key);
      
      if (!existingMessages.includes('vitalis_drain_hit')) {
        await client.query(`
          INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) 
          VALUES (
            'vitalis_drain_hit', 
            '[Hit] {drainAmount} Vitalis has been drained. ({vitalis} / {maxVitalis})', 
            'harvest', 
            'Message when Vitalis is drained on successful harvest hit', 
            EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, 
            EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
          )
        `);
        console.log('  ✓ Added vitalis_drain_hit message');
      } else {
        console.log('  - vitalis_drain_hit message already exists');
      }
      
      if (!existingMessages.includes('vitalis_drain_miss')) {
        await client.query(`
          INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) 
          VALUES (
            'vitalis_drain_miss', 
            '[Miss] {drainAmount} Vitalis has been drained. ({vitalis} / {maxVitalis})', 
            'harvest', 
            'Message when Vitalis is drained on failed harvest miss', 
            EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, 
            EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
          )
        `);
        console.log('  ✓ Added vitalis_drain_miss message');
      } else {
        console.log('  - vitalis_drain_miss message already exists');
      }
      
      await client.query('COMMIT');
      console.log('\n' + '='.repeat(70));
      console.log('✓ All migrations fixed successfully!');
      console.log('='.repeat(70));
      console.log('\nThe following columns/configurations have been added:');
      console.log('  • scriptable_npcs.hit_vitalis');
      console.log('  • scriptable_npcs.miss_vitalis');
      console.log('  • harvest_formula_config.vitalis_drain_reduction');
      console.log('  • game_messages.vitalis_drain_hit');
      console.log('  • game_messages.vitalis_drain_miss');
      console.log('');
      
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n✗ Migration execution failed:', err.message);
      throw err;
    }
    
  } catch (err) {
    console.error('\n✗ Migration fix failed:', err.message);
    console.error('\nIf the problem persists, run the SQL file directly:');
    console.error('  scripts/fix-vitalis-drain-migrations.sql');
    throw err;
  } finally {
    client.release();
  }
}

// Run the fix
if (require.main === module) {
  fixMigrations()
    .then(async () => {
      console.log('\nMigration fix complete');
      await pool.end();
      process.exit(0);
    })
    .catch(async err => {
      console.error('Migration fix failed:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = fixMigrations;
