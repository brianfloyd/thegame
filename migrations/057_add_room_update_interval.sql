-- Migration 057: Add room_update_interval_ms to players table
-- Allows per-player configuration of room refresh interval

ALTER TABLE players ADD COLUMN IF NOT EXISTS room_update_interval_ms INTEGER DEFAULT 30000;

-- Update existing players to have default value (30 seconds)
UPDATE players SET room_update_interval_ms = 30000 WHERE room_update_interval_ms IS NULL;
