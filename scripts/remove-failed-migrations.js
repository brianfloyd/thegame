/**
 * Remove Failed Migrations from schema_migrations
 * 
 * This removes migrations 048, 049, 050 from the schema_migrations table
 * so they can be re-run with the correct SQL.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function removeFailedMigrations() {
  console.log('Removing failed migrations from schema_migrations table...\n');
  
  try {
    const result = await pool.query(`
      DELETE FROM schema_migrations 
      WHERE name IN (
        '048_add_npc_vitalis_drain.sql',
        '049_vitalis_drain_reduction_formula.sql',
        '050_vitalis_drain_messages.sql'
      )
      RETURNING name
    `);
    
    console.log('Removed migrations:');
    if (result.rows.length === 0) {
      console.log('  (none found - they may not have been marked as applied)');
    } else {
      result.rows.forEach(row => console.log('  -', row.name));
    }
    
    console.log('\n✓ Complete! Now run: node scripts/migrate.js');
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

removeFailedMigrations();


