-- Migration 020: Add "noob" player and flag_always_first_time column

-- Add flag_always_first_time column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS flag_always_first_time INTEGER NOT NULL DEFAULT 0;

-- Add "noob" player (factory default character - always experiences things for the first time)
INSERT INTO players (name, current_room_id, stat_ingenuity, stat_resonance, stat_fortitude, stat_acumen, ability_crafting, ability_attunement, ability_endurance, ability_commerce, assignable_points, flag_god_mode, flag_always_first_time)
SELECT 'noob', r.id, 5, 5, 5, 5, 0, 0, 0, 0, 5, 0, 1
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
ON CONFLICT (name) DO UPDATE SET 
    flag_always_first_time = 1,
    current_room_id = (SELECT id FROM rooms WHERE name = 'town square' AND map_id = 1 LIMIT 1);

COMMENT ON COLUMN players.flag_always_first_time IS 'If 1, player always experiences things for the first time (factory default character). First-time flags are never set for this player.';

