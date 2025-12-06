-- Migration 056: Attunement Formula Configs
-- Adds 3 attunement formula configurations to harvest_formula_config table

INSERT INTO harvest_formula_config (config_key, description, min_resonance, min_value, max_resonance, max_value, curve_exponent) VALUES
('attunement_cooldown_reduction', 'Resonance-based cooldown reduction for attunement. Higher resonance reduces cooldown time.', 5, 0.05, 100, 0.75, 2.0),
('attunement_restore_bonus', 'Fortitude-based restore amount bonus for attunement. Higher fortitude increases vitalis restored.', 5, 0.0, 100, 1.0, 2.0),
('attunement_delay_reduction', 'Average (Resonance + Fortitude) / 2 based delay reduction before attunement points are granted.', 5, 0.0, 100, 0.75, 2.0)
ON CONFLICT (config_key) DO UPDATE SET 
    description = EXCLUDED.description,
    min_resonance = EXCLUDED.min_resonance,
    min_value = EXCLUDED.min_value,
    max_resonance = EXCLUDED.max_resonance,
    max_value = EXCLUDED.max_value,
    curve_exponent = EXCLUDED.curve_exponent,
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
