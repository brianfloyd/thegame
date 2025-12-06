-- Migration 053: Pulse Echo Formula Configs
-- Adds 5 pulse echo formula configurations to harvest_formula_config table
-- First, alter column types to support larger integer values for pulse echo configs

-- Alter min_value and max_value columns to support larger numbers (for pulse_echo_base_cost, etc.)
ALTER TABLE harvest_formula_config 
  ALTER COLUMN min_value TYPE NUMERIC(10,2),
  ALTER COLUMN max_value TYPE NUMERIC(10,2);

INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent) VALUES
('pulse_echo_yield_multiplier', 'Multiplier for base pulse echo yield from NPCs. Applied to npc.pulse_echo_yield.', 5, 1.0, 100, 2.0, 2.0),
('pulse_echo_resonance_bonus_rate', 'Resonance-based bonus rate for pulse echo yield. Higher resonance increases echo gain.', 5, 0.0, 100, 0.5, 2.0),
('pulse_echo_tier_curve_multiplier', 'Multiplier for tier requirement curve calculation. Higher values make tier progression slower.', 5, 1.0, 100, 3.0, 2.0),
('pulse_echo_base_cost', 'Base cost in echoes required for tier 1 (starting tier).', 5, 10, 100, 100, 1.0),
('pulse_echo_minimum_required', 'Minimum echoes required before any tier progression can occur.', 5, 0, 100, 10, 1.0)
ON CONFLICT (config_key) DO UPDATE SET
    description = EXCLUDED.description,
    min_resonance = EXCLUDED.min_resonance,
    min_value = EXCLUDED.min_value,
    max_resonance = EXCLUDED.max_resonance,
    max_value = EXCLUDED.max_value,
    curve_exponent = EXCLUDED.curve_exponent,
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;