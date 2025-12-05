-- Add auto_navigation_time_ms column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS auto_navigation_time_ms INTEGER DEFAULT 1000;

-- Update existing players to have default value
UPDATE players SET auto_navigation_time_ms = 1000 WHERE auto_navigation_time_ms IS NULL;













