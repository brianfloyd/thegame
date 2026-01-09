-- Migration 090: Merchant Pricing Formula Defaults
-- Inserts default global pricing formula configuration

INSERT INTO merchant_pricing_formula_config (config_key, config_value, description)
VALUES (
    'global',
    '{"baseMultiplier": 1.0, "acumenMultiplier": 0.01, "maxDiscount": 0.5}'::jsonb,
    'Global merchant pricing formula. baseMultiplier: base price multiplier, acumenMultiplier: discount per acumen point (1% = 0.01), maxDiscount: maximum discount (50% = 0.5)'
)
ON CONFLICT (config_key) DO NOTHING;







