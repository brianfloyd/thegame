const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkMigrations() {
  try {
    const result = await pool.query(`
      SELECT name FROM schema_migrations 
      WHERE name LIKE '%048%' OR name LIKE '%049%' OR name LIKE '%050%'
      OR name LIKE '%vitalis%'
      ORDER BY name
    `);
    
    console.log('Vitalis-related migrations in schema_migrations:');
    if (result.rows.length === 0) {
      console.log('  (none found)');
    } else {
      result.rows.forEach(row => console.log('  -', row.name));
    }
    
    console.log('\nChecking if columns exist:');
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'scriptable_npcs' 
      AND column_name IN ('hit_vitalis', 'miss_vitalis')
    `);
    
    console.log('  Columns in scriptable_npcs:');
    if (columnCheck.rows.length === 0) {
      console.log('    ✗ hit_vitalis and miss_vitalis columns NOT FOUND');
    } else {
      columnCheck.rows.forEach(row => console.log('    ✓', row.column_name));
    }
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

checkMigrations();


