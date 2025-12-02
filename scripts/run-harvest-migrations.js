/**
 * Run harvest formula migrations
 */
require('dotenv').config();
const db = require('../database');

async function runMigrations() {
  try {
    console.log('Creating harvest_formula_config table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS harvest_formula_config (
        id SERIAL PRIMARY KEY,
        config_key TEXT UNIQUE NOT NULL,
        description TEXT,
        min_resonance INTEGER NOT NULL DEFAULT 5,
        min_value NUMERIC(5,4) NOT NULL DEFAULT 0.0500,
        max_resonance INTEGER NOT NULL DEFAULT 100,
        max_value NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
        curve_exponent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
        updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);
    console.log('Table created.');

    console.log('Inserting default cycle_time_reduction config...');
    await db.query(`
      INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
      VALUES (
        'cycle_time_reduction',
        'Reduces time between item production cycles during harvest. Value represents percentage reduction (0.05 = 5%, 0.75 = 75%).',
        5,
        0.0500,
        100,
        0.7500,
        2.00
      ) ON CONFLICT (config_key) DO NOTHING
    `);

    console.log('Inserting default hit_rate config...');
    await db.query(`
      INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
      VALUES (
        'hit_rate',
        'Chance to successfully produce items each harvest cycle. Value represents hit percentage (0.50 = 50%, 1.00 = 100%).',
        5,
        0.5000,
        100,
        1.0000,
        2.00
      ) ON CONFLICT (config_key) DO NOTHING
    `);
    console.log('Configs inserted.');

    console.log('Adding enable_stat_bonuses column to scriptable_npcs...');
    await db.query(`
      ALTER TABLE scriptable_npcs
      ADD COLUMN IF NOT EXISTS enable_stat_bonuses BOOLEAN DEFAULT TRUE
    `);

    await db.query(`
      UPDATE scriptable_npcs
      SET enable_stat_bonuses = TRUE
      WHERE enable_stat_bonuses IS NULL
    `);
    console.log('Column added and defaults set.');

    console.log('Creating index...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_harvest_formula_config_key ON harvest_formula_config(config_key)
    `);
    console.log('Index created.');

    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

runMigrations();

