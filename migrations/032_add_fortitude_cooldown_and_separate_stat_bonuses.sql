-- Migration 032: Add fortitude cooldown reduction and separate stat bonus flags
-- Replaces enable_stat_bonuses with individual flags for resonance and fortitude

-- Add new columns for individual stat bonuses
ALTER TABLE scriptable_npcs
ADD COLUMN IF NOT EXISTS enable_resonance_bonuses BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_fortitude_bonuses BOOLEAN DEFAULT TRUE;

-- Migrate existing enable_stat_bonuses to both new columns
UPDATE scriptable_npcs
SET 
    enable_resonance_bonuses = COALESCE(enable_stat_bonuses, TRUE),
    enable_fortitude_bonuses = COALESCE(enable_stat_bonuses, TRUE)
WHERE enable_resonance_bonuses IS NULL OR enable_fortitude_bonuses IS NULL;

-- Set defaults for any NULL values
UPDATE scriptable_npcs
SET enable_resonance_bonuses = TRUE
WHERE enable_resonance_bonuses IS NULL;

UPDATE scriptable_npcs
SET enable_fortitude_bonuses = TRUE
WHERE enable_fortitude_bonuses IS NULL;

-- Add cooldown_time_reduction config to harvest_formula_config
INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
VALUES (
    'cooldown_time_reduction',
    'Reduces cooldown time after harvest based on Fortitude. Value represents percentage reduction (0.05 = 5%, 0.75 = 75%). Uses min_resonance/max_resonance fields but applies to Fortitude stat.',
    5,
    0.0500,
    100,
    0.7500,
    2.00
) ON CONFLICT (config_key) DO NOTHING;

