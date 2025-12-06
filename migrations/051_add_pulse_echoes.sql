-- Migration 051: Add Pulse Echoes to Players
-- Adds pulse_echoes and pulse_echo_tier columns to players table
-- Sets default values for all existing players

ALTER TABLE players ADD COLUMN IF NOT EXISTS pulse_echoes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS pulse_echo_tier INTEGER NOT NULL DEFAULT 1;

-- Update all existing players to have default values
UPDATE players SET 
    pulse_echoes = 0,
    pulse_echo_tier = 1
WHERE pulse_echoes IS NULL OR pulse_echo_tier IS NULL;