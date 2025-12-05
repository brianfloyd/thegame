-- Add loop_delay_ms column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS loop_delay_ms INTEGER DEFAULT 1000;

-- Set default value for existing players
UPDATE players SET loop_delay_ms = 1000 WHERE loop_delay_ms IS NULL;





