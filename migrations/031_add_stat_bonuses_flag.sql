-- Migration 031: Add enable_stat_bonuses flag to scriptable_npcs
-- Allows per-NPC configuration of whether player stats affect harvesting

ALTER TABLE scriptable_npcs
ADD COLUMN IF NOT EXISTS enable_stat_bonuses BOOLEAN DEFAULT TRUE;

-- Set default value for existing NPCs (enable stat bonuses by default)
UPDATE scriptable_npcs
SET enable_stat_bonuses = TRUE
WHERE enable_stat_bonuses IS NULL;










