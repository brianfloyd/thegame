-- Add award behavior fields to scriptable_npcs table
-- These fields control how items are awarded to players

ALTER TABLE scriptable_npcs
ADD COLUMN IF NOT EXISTS puzzle_award_once_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS puzzle_award_after_delay BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS puzzle_award_delay_seconds INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS puzzle_award_delay_response TEXT DEFAULT NULL;

-- Add award behavior fields to lore_keepers table
ALTER TABLE lore_keepers
ADD COLUMN IF NOT EXISTS puzzle_award_once_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS puzzle_award_after_delay BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS puzzle_award_delay_seconds INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS puzzle_award_delay_response TEXT DEFAULT NULL;








