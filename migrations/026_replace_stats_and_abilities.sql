-- Replace Player Stats and Abilities System
-- Removes old stats/abilities and hit_points/mana, adds new 4 stats and 4 skills
-- Creates metadata tables for stat and ability descriptions

-- Drop old stat columns
ALTER TABLE players DROP COLUMN IF EXISTS stat_brute_strength;
ALTER TABLE players DROP COLUMN IF EXISTS stat_life_force;
ALTER TABLE players DROP COLUMN IF EXISTS stat_cunning;
ALTER TABLE players DROP COLUMN IF EXISTS stat_intelligence;
ALTER TABLE players DROP COLUMN IF EXISTS stat_wisdom;

-- Drop old ability columns (except ability_crafting which we keep)
ALTER TABLE players DROP COLUMN IF EXISTS ability_lockpicking;
ALTER TABLE players DROP COLUMN IF EXISTS ability_stealth;
ALTER TABLE players DROP COLUMN IF EXISTS ability_dodge;
ALTER TABLE players DROP COLUMN IF EXISTS ability_critical_hit;

-- Drop resource columns (hit_points and mana)
ALTER TABLE players DROP COLUMN IF EXISTS resource_hit_points;
ALTER TABLE players DROP COLUMN IF EXISTS resource_max_hit_points;
ALTER TABLE players DROP COLUMN IF EXISTS resource_mana;
ALTER TABLE players DROP COLUMN IF EXISTS resource_max_mana;

-- Add new stat columns
ALTER TABLE players ADD COLUMN IF NOT EXISTS stat_ingenuity INTEGER NOT NULL DEFAULT 5;
ALTER TABLE players ADD COLUMN IF NOT EXISTS stat_resonance INTEGER NOT NULL DEFAULT 5;
ALTER TABLE players ADD COLUMN IF NOT EXISTS stat_fortitude INTEGER NOT NULL DEFAULT 5;
ALTER TABLE players ADD COLUMN IF NOT EXISTS stat_acumen INTEGER NOT NULL DEFAULT 5;

-- Add new ability columns (ability_crafting already exists)
ALTER TABLE players ADD COLUMN IF NOT EXISTS ability_attunement INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ability_endurance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ability_commerce INTEGER NOT NULL DEFAULT 0;

-- Update existing players to have default values (5 for stats, 0 for skills)
UPDATE players SET 
  stat_ingenuity = 5,
  stat_resonance = 5,
  stat_fortitude = 5,
  stat_acumen = 5,
  ability_crafting = COALESCE(ability_crafting, 0),
  ability_attunement = 0,
  ability_endurance = 0,
  ability_commerce = 0
WHERE stat_ingenuity IS NULL OR stat_resonance IS NULL OR stat_fortitude IS NULL OR stat_acumen IS NULL;

-- Create metadata tables for stat and ability descriptions
CREATE TABLE IF NOT EXISTS stat_metadata (
    stat_name TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ability_metadata (
    ability_name TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

-- Insert stat metadata (using stat name without stat_ prefix)
INSERT INTO stat_metadata (stat_name, description) VALUES
('ingenuity', 'Your creative and inventive power used in crafting, factories, and recipe mastery. Enables efficient crafting and unlocking advanced item combinations.')
ON CONFLICT (stat_name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO stat_metadata (stat_name, description) VALUES
('resonance', 'Your harmonic connection to the world''s pulse and the energy that keeps you in sync. Improves harvesting, lore interactions, and resistance to desync effects.')
ON CONFLICT (stat_name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO stat_metadata (stat_name, description) VALUES
('fortitude', 'Your ability to endure strain, pulse feedback, and long harvesting sessions. Reduces fatigue during intense activities and increases stability in hazardous zones.')
ON CONFLICT (stat_name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO stat_metadata (stat_name, description) VALUES
('acumen', 'Your sharpness in trade, valuation, and the economic flow of the world. Improves merchant interactions, sale prices, and warehouse/market advantages.')
ON CONFLICT (stat_name) DO UPDATE SET description = EXCLUDED.description;

-- Insert ability metadata (using ability name without ability_ prefix)
INSERT INTO ability_metadata (ability_name, description) VALUES
('crafting', 'Practical use of Ingenuity to turn materials into valuable items and components.')
ON CONFLICT (ability_name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO ability_metadata (ability_name, description) VALUES
('attunement', 'The active use of Resonance to sense and manipulate pulse energy and lore systems.')
ON CONFLICT (ability_name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO ability_metadata (ability_name, description) VALUES
('endurance', 'The applied form of Fortitude, enabling long periods of harvesting and resistance to pulse strain.')
ON CONFLICT (ability_name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO ability_metadata (ability_name, description) VALUES
('commerce', 'The practical application of Acumen used in trading, negotiation, and economic optimization.')
ON CONFLICT (ability_name) DO UPDATE SET description = EXCLUDED.description;











