-- Migration 030: Add harvest formula configuration table
-- Stores configurable parameters for resonance-based harvest bonuses

-- Create harvest_formula_config table
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
);

-- Insert default configuration for cycle time reduction
-- At resonance 5: 5% reduction (cycles at 95% of base time)
-- At resonance 100: 75% reduction (cycles at 25% of base time)
INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
VALUES (
    'cycle_time_reduction',
    'Reduces time between item production cycles during harvest. Value represents percentage reduction (0.05 = 5%, 0.75 = 75%).',
    5,
    0.0500,
    100,
    0.7500,
    2.00
) ON CONFLICT (config_key) DO NOTHING;

-- Insert default configuration for hit rate
-- At resonance 5: 50% hit rate (50% chance to produce items each cycle)
-- At resonance 100: 100% hit rate (always produces items)
INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
VALUES (
    'hit_rate',
    'Chance to successfully produce items each harvest cycle. Value represents hit percentage (0.50 = 50%, 1.00 = 100%).',
    5,
    0.5000,
    100,
    1.0000,
    2.00
) ON CONFLICT (config_key) DO NOTHING;

-- Create index for fast lookup by config_key
CREATE INDEX IF NOT EXISTS idx_harvest_formula_config_key ON harvest_formula_config(config_key);




