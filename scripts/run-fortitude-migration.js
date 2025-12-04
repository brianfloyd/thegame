/**
 * Run fortitude cooldown and separate stat bonuses migration
 */
require('dotenv').config();
const db = require('../database');

async function runMigration() {
  try {
    console.log('Adding enable_resonance_bonuses and enable_fortitude_bonuses columns...');
    await db.query(`
      ALTER TABLE scriptable_npcs
      ADD COLUMN IF NOT EXISTS enable_resonance_bonuses BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS enable_fortitude_bonuses BOOLEAN DEFAULT TRUE
    `);

    console.log('Migrating existing enable_stat_bonuses values...');
    await db.query(`
      UPDATE scriptable_npcs
      SET 
          enable_resonance_bonuses = COALESCE(enable_stat_bonuses, TRUE),
          enable_fortitude_bonuses = COALESCE(enable_stat_bonuses, TRUE)
      WHERE enable_resonance_bonuses IS NULL OR enable_fortitude_bonuses IS NULL
    `);

    console.log('Setting defaults for NULL values...');
    await db.query(`
      UPDATE scriptable_npcs
      SET enable_resonance_bonuses = TRUE
      WHERE enable_resonance_bonuses IS NULL
    `);

    await db.query(`
      UPDATE scriptable_npcs
      SET enable_fortitude_bonuses = TRUE
      WHERE enable_fortitude_bonuses IS NULL
    `);

    console.log('Adding cooldown_time_reduction config...');
    await db.query(`
      INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
      VALUES (
        'cooldown_time_reduction',
        'Reduces cooldown time after harvest based on Fortitude. Value represents percentage reduction (0.05 = 5%, 0.75 = 75%). Uses min_resonance/max_resonance fields but applies to Fortitude stat.',
        5,
        0.0500,
        100,
        0.7500,
        2.00
      ) ON CONFLICT (config_key) DO NOTHING
    `);

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

runMigration();









