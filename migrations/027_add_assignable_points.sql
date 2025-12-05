-- Add assignable attribute points to players table
-- Allows players to assign points to attributes

ALTER TABLE players ADD COLUMN IF NOT EXISTS assignable_points INTEGER NOT NULL DEFAULT 5;

-- Set all existing players to 5 assignable points
UPDATE players SET assignable_points = 5 WHERE assignable_points IS NULL OR assignable_points = 0;

















