-- Migration 020: Add "noob" player and flag_always_first_time column

-- Add flag_always_first_time column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS flag_always_first_time INTEGER NOT NULL DEFAULT 0;

-- Add "noob" player (factory default character - always experiences things for the first time)
INSERT INTO players (name, current_room_id, stat_brute_strength, stat_life_force, stat_cunning, stat_intelligence, stat_wisdom, ability_crafting, ability_lockpicking, ability_stealth, ability_dodge, ability_critical_hit, resource_hit_points, resource_max_hit_points, resource_mana, resource_max_mana, flag_god_mode, flag_always_first_time)
SELECT 'noob', r.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 1
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
ON CONFLICT (name) DO UPDATE SET 
    flag_always_first_time = 1,
    current_room_id = (SELECT id FROM rooms WHERE name = 'town square' AND map_id = 1 LIMIT 1);

COMMENT ON COLUMN players.flag_always_first_time IS 'If 1, player always experiences things for the first time (factory default character). First-time flags are never set for this player.';

