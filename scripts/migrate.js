/**
 * PostgreSQL Migration Runner
 * 
 * Runs SQL migration files from the migrations/ directory in order.
 * Tracks applied migrations in schema_migrations table.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('Running PostgreSQL migrations...');
    
    // Create schema_migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    // Get list of already applied migrations
    const appliedResult = await client.query('SELECT name FROM schema_migrations ORDER BY name');
    const appliedMigrations = new Set(appliedResult.rows.map(row => row.name));
    
    // Get list of migration files
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found');
      return;
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort alphabetically to ensure order
    
    if (migrationFiles.length === 0) {
      console.log('No migration files found');
      return;
    }
    
    // Run each migration that hasn't been applied yet
    let migrationsRan = 0;
    
    for (const file of migrationFiles) {
      if (appliedMigrations.has(file)) {
        console.log(`  Skipping ${file} (already applied)`);
        continue;
      }
      
      console.log(`  Applying ${file}...`);
      
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      // Run migration in a transaction
      await client.query('BEGIN');
      
      try {
        // Execute the migration SQL
        await client.query(sql);
        
        // Record the migration
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        );
        
        await client.query('COMMIT');
        console.log(`  Applied ${file}`);
        migrationsRan++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  Failed to apply ${file}: ${err.message}`);
        throw err;
      }
    }
    
    if (migrationsRan === 0) {
      console.log('All migrations already applied');
    } else {
      console.log(`Successfully applied ${migrationsRan} migration(s)`);
    }
    
  } finally {
    client.release();
  }
}

// Export for use as module
module.exports = runMigrations;

// Run directly if called from command line
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
