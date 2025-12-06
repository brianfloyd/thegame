-- Migration 055: Add Attunement Base Values
-- Adds base_attunement_points, base_attunement_cooldown_ms, and base_attunement_delay_ms to players table
-- Sets default values for all existing players

ALTER TABLE players ADD COLUMN IF NOT EXISTS base_attunement_points INTEGER NOT NULL DEFAULT 10;
ALTER TABLE players ADD COLUMN IF NOT EXISTS base_attunement_cooldown_ms INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS base_attunement_delay_ms INTEGER NOT NULL DEFAULT 2000;

-- Update all existing players to have default values
UPDATE players SET 
    base_attunement_points = 10,
    base_attunement_cooldown_ms = 10000,
    base_attunement_delay_ms = 2000
WHERE base_attunement_points IS NULL OR base_attunement_cooldown_ms IS NULL OR base_attunement_delay_ms IS NULL;
