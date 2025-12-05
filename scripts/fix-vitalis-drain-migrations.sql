-- Fix Vitalis Drain Migrations (048, 049, 050)
-- Run this SQL directly on your PostgreSQL database if the Node.js script fails
-- 
-- To run with Railway CLI:
--   railway connect postgres
--   Then paste this SQL into the psql prompt
-- 
-- Or run with psql:
--   psql <your-connection-string> -f scripts/fix-vitalis-drain-migrations.sql

BEGIN;

-- ============================================================================
-- Migration 048: Add NPC Vitalis Drain Fields
-- ============================================================================

-- Check and add hit_vitalis column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'scriptable_npcs' AND column_name = 'hit_vitalis'
    ) THEN
        ALTER TABLE scriptable_npcs ADD COLUMN hit_vitalis INTEGER NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added hit_vitalis column';
    ELSE
        RAISE NOTICE 'hit_vitalis column already exists';
    END IF;
END $$;

-- Check and add miss_vitalis column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'scriptable_npcs' AND column_name = 'miss_vitalis'
    ) THEN
        ALTER TABLE scriptable_npcs ADD COLUMN miss_vitalis INTEGER NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added miss_vitalis column';
    ELSE
        RAISE NOTICE 'miss_vitalis column already exists';
    END IF;
END $$;

-- Set defaults for existing NPCs (in case any have NULL values)
UPDATE scriptable_npcs 
SET hit_vitalis = 0, miss_vitalis = 0 
WHERE hit_vitalis IS NULL OR miss_vitalis IS NULL;

RAISE NOTICE 'Migration 048 complete';

-- ============================================================================
-- Migration 049: Vitalis Drain Reduction Formula
-- ============================================================================

-- Add vitalis_drain_reduction formula config
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

RAISE NOTICE 'Migration 049 complete';

-- ============================================================================
-- Migration 050: Vitalis Drain Messages
-- ============================================================================

-- Add vitalis_drain_hit message
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
('vitalis_drain_hit', '[Hit] {drainAmount} Vitalis has been drained. ({vitalis} / {maxVitalis})', 'harvest', 'Message when Vitalis is drained on successful harvest hit', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO UPDATE SET 
    message_template = EXCLUDED.message_template, 
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;

-- Add vitalis_drain_miss message
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
('vitalis_drain_miss', '[Miss] {drainAmount} Vitalis has been drained. ({vitalis} / {maxVitalis})', 'harvest', 'Message when Vitalis is drained on failed harvest miss', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO UPDATE SET 
    message_template = EXCLUDED.message_template, 
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;

RAISE NOTICE 'Migration 050 complete';

COMMIT;

-- Verify the changes
SELECT 'Verification Results:' as status;
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'scriptable_npcs' AND column_name IN ('hit_vitalis', 'miss_vitalis');

SELECT config_key, description 
FROM harvest_formula_config 
WHERE config_key = 'vitalis_drain_reduction';

SELECT message_key, message_template 
FROM game_messages 
WHERE message_key IN ('vitalis_drain_hit', 'vitalis_drain_miss');

SELECT 'All migrations applied successfully!' as status;


