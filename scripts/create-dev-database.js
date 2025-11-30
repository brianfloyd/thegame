/**
 * Create Development Database
 * 
 * Creates a local PostgreSQL database for development.
 * 
 * Usage:
 *   node scripts/create-dev-database.js
 * 
 * Requirements:
 *   - PostgreSQL must be running locally
 *   - Must have permission to create databases
 *   - Default connection: postgresql://postgres:password@localhost:5432/postgres
 */

const { Pool } = require('pg');
require('dotenv').config();

const DB_NAME = 'thegame_dev';

// Connect to default 'postgres' database to create new database
const adminPool = new Pool({
  connectionString: process.env.DEV_DATABASE_URL?.replace(/\/[^\/]+$/, '/postgres') || 
                    process.env.DATABASE_URL?.replace(/\/[^\/]+$/, '/postgres') ||
                    'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: false
});

async function createDevDatabase() {
  console.log('='.repeat(60));
  console.log('Creating Development Database');
  console.log('='.repeat(60));
  console.log('');
  
  const client = await adminPool.connect();
  
  try {
    // Check if database already exists
    const checkResult = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );
    
    if (checkResult.rows.length > 0) {
      console.log(`✅ Database "${DB_NAME}" already exists`);
      console.log('   No action needed.');
      return;
    }
    
    // Create database
    console.log(`Creating database "${DB_NAME}"...`);
    
    // Note: CREATE DATABASE cannot be run in a transaction
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    
    console.log(`✅ Database "${DB_NAME}" created successfully!`);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Update your .env file with:`);
    console.log(`     DEV_DATABASE_URL=postgresql://postgres:password@localhost:5432/${DB_NAME}`);
    console.log(`  2. Run migrations:`);
    console.log(`     npm run migrate`);
    console.log('');
    
  } catch (err) {
    if (err.code === '42P04') {
      console.log(`✅ Database "${DB_NAME}" already exists`);
    } else {
      console.error('❌ Error creating database:', err.message);
      console.error('');
      console.error('Troubleshooting:');
      console.error('  1. Make sure PostgreSQL is running');
      console.error('  2. Check your connection string in .env');
      console.error('  3. Verify you have permission to create databases');
      console.error('  4. Try connecting manually: psql -U postgres');
      throw err;
    }
  } finally {
    client.release();
    await adminPool.end();
  }
}

if (require.main === module) {
  createDevDatabase()
    .then(() => {
      console.log('Setup complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = createDevDatabase;

