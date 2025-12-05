-- Migration 048: Add NPC Vitalis Drain Fields
-- Adds hit_vitalis and miss_vitalis columns to scriptable_npcs table

ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS hit_vitalis INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS miss_vitalis INTEGER NOT NULL DEFAULT 0;

-- Set defaults for existing NPCs (in case any have NULL values)
UPDATE scriptable_npcs 
SET hit_vitalis = 0, miss_vitalis = 0 
WHERE hit_vitalis IS NULL OR miss_vitalis IS NULL;
