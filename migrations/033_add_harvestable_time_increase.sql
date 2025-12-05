-- Migration 033: Add harvestable time increase formula config
-- Allows Fortitude to increase total harvest duration

-- Add harvestable_time_increase config to harvest_formula_config
INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
VALUES (
    'harvestable_time_increase',
    'Increases total harvest duration based on Fortitude. Value represents percentage increase (0.05 = 5%, 0.50 = 50%). Uses min_resonance/max_resonance fields but applies to Fortitude stat.',
    5,
    0.0500,
    100,
    0.5000,
    2.00
) ON CONFLICT (config_key) DO NOTHING;















