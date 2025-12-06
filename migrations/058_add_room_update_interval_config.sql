-- Migration 058: Add room_update_interval_ms to harvest_formula_config as a game setting
-- This provides a global default that can be configured via the formula config editor

INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent)
VALUES (
    'room_update_interval_ms',
    'Global default interval (in milliseconds) for automatic room updates. Players can override this with their own room_update_interval_ms setting. Default: 30000 (30 seconds).',
    30000,  -- min_resonance stores the interval value (reusing field structure)
    0,      -- min_value not used for this config
    300000, -- max_resonance stores max allowed value
    0,      -- max_value not used for this config
    0       -- curve_exponent not used for this config
) ON CONFLICT (config_key) DO UPDATE SET 
    description = EXCLUDED.description,
    min_resonance = EXCLUDED.min_resonance,
    max_resonance = EXCLUDED.max_resonance,
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
