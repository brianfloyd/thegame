-- Migration 049: Vitalis Drain Reduction Formula
-- Adds vitalis_drain_reduction formula config to harvest_formula_config table

-- Insert default configuration for vitalis drain reduction
-- Uses exponential curve formula combining fortitude and resonance stats
-- At stat average 5: 5% reduction (drains at 95% of base)
-- At stat average 100: 75% reduction (drains at 25% of base)
INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
VALUES (
    'vitalis_drain_reduction',
    'Reduces Vitalis drain amount based on average of fortitude and resonance stats. Value represents percentage reduction (0.05 = 5%, 0.75 = 75%).',
    5,
    0.0500,
    100,
    0.7500,
    2.00
) ON CONFLICT (config_key) DO UPDATE SET 
    description = EXCLUDED.description,
    min_resonance = EXCLUDED.min_resonance,
    min_value = EXCLUDED.min_value,
    max_resonance = EXCLUDED.max_resonance,
    max_value = EXCLUDED.max_value,
    curve_exponent = EXCLUDED.curve_exponent,
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
