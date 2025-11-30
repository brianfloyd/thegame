-- Migration 021: Ensure "noob" player exists (rename from "newb" if needed)

-- Delete "newb" if it exists (old name)
DELETE FROM players WHERE name = 'newb';

-- Ensure "noob" player exists (factory default character - always experiences things for the first time)
INSERT INTO players (name, current_room_id, stat_brute_strength, stat_life_force, stat_cunning, stat_intelligence, stat_wisdom, ability_crafting, ability_lockpicking, ability_stealth, ability_dodge, ability_critical_hit, resource_hit_points, resource_max_hit_points, resource_mana, resource_max_mana, flag_god_mode, flag_always_first_time)
SELECT 'noob', r.id, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 1
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
ON CONFLICT (name) DO UPDATE SET 
    flag_always_first_time = 1,
    current_room_id = (SELECT id FROM rooms WHERE name = 'town square' AND map_id = 1 LIMIT 1);

