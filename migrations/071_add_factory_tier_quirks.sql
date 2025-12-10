-- Add factory_tier and factory_quirks to rooms table
-- Factory rooms can have different tiers that unlock different recipes
-- Factory quirks provide bonuses/penalties to crafting in that room

-- Add factory_tier column (default 1 for all existing factory rooms)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS factory_tier INTEGER DEFAULT 1;

-- Add factory_quirks column (JSONB for flexible quirk configuration)
-- Format: {type: 'stable', modifiers: {successBonus: 0.10, speedPenalty: 0.15}}
-- Valid quirk types:
--   stable: +10% success, -15% speed (slower but more reliable)
--   chaotic: -10% success, +20% speed (faster but riskier)
--   attuned: 2x rune bonus multiplier (runes more effective)
--   worn: 10% chance to reduce output by 50% (degraded machine)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS factory_quirks JSONB;

-- Create index for efficient factory room lookups by tier
CREATE INDEX IF NOT EXISTS idx_rooms_factory_tier ON rooms(room_type, factory_tier) WHERE room_type = 'factory';

-- Add check constraint for valid factory tiers (1-5)
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_factory_tier_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_factory_tier_check 
    CHECK (factory_tier IS NULL OR (factory_tier >= 1 AND factory_tier <= 5));

-- Update existing factory rooms to have tier 1 if not set
UPDATE rooms SET factory_tier = 1 WHERE room_type = 'factory' AND factory_tier IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN rooms.factory_tier IS 'Factory tier level (1-5). Higher tiers unlock more advanced recipes.';
COMMENT ON COLUMN rooms.factory_quirks IS 'JSON object with quirk type and modifiers. Types: stable, chaotic, attuned, worn.';

