/**
 * Database Migration Script
 * 
 * Applies SQL migrations from the migrations/ folder in order.
 * Tracks applied migrations in the schema_migrations table.
 * 
 * Usage: npm run migrate
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path - same logic as database.js
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'game.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

console.log(`Database path: ${DB_PATH}`);
console.log(`Migrations directory: ${MIGRATIONS_DIR}`);

// Open database connection
const db = new Database(DB_PATH);

// Ensure schema_migrations table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// Get list of already applied migrations
const getAppliedMigrations = db.prepare('SELECT name FROM schema_migrations');
const appliedMigrations = new Set(getAppliedMigrations.all().map(row => row.name));

// Read all .sql files from migrations directory
let migrationFiles = [];
try {
  migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort alphabetically (001_init.sql, 002_feature.sql, etc.)
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log('No migrations directory found. Creating it...');
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  } else {
    throw err;
  }
}

console.log(`Found ${migrationFiles.length} migration file(s)`);

// Prepare insert statement for tracking applied migrations
const insertMigration = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

// Apply each migration that hasn't been applied yet
let appliedCount = 0;
for (const filename of migrationFiles) {
  if (appliedMigrations.has(filename)) {
    console.log(`Skipping ${filename} (already applied)`);
    continue;
  }

  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`Applying migration ${filename}...`);
  
  try {
    // Run the migration SQL
    db.exec(sql);
    
    // Record that this migration was applied
    insertMigration.run(filename);
    
    console.log(`Applied migration ${filename}`);
    appliedCount++;
  } catch (err) {
    console.error(`Error applying migration ${filename}:`, err.message);
    process.exit(1);
  }
}

// Close database connection
db.close();

console.log(`\nAll migrations applied. (${appliedCount} new, ${migrationFiles.length - appliedCount} skipped)`);

