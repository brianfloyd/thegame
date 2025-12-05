-- Add Vitalis stat columns to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS resource_vitalis INTEGER NOT NULL DEFAULT 50;
ALTER TABLE players ADD COLUMN IF NOT EXISTS resource_max_vitalis INTEGER NOT NULL DEFAULT 100;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_attune_time BIGINT;

-- Set defaults for existing players
UPDATE players SET resource_vitalis = 50 WHERE resource_vitalis IS NULL;
UPDATE players SET resource_max_vitalis = 100 WHERE resource_max_vitalis IS NULL;





