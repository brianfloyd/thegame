-- Migration 021: Ensure "noob" player exists (rename from "newb" if needed)

-- Delete "newb" if it exists (old name)
DELETE FROM players WHERE name = 'newb';

-- Ensure "noob" player exists (factory default character - always experiences things for the first time)
INSERT INTO players (name, current_room_id, stat_ingenuity, stat_resonance, stat_fortitude, stat_acumen, ability_crafting, ability_attunement, ability_endurance, ability_commerce, assignable_points, flag_god_mode, flag_always_first_time)
SELECT 'noob', r.id, 5, 5, 5, 5, 0, 0, 0, 0, 5, 0, 1
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
ON CONFLICT (name) DO UPDATE SET 
    flag_always_first_time = 1,
    current_room_id = (SELECT id FROM rooms WHERE name = 'town square' AND map_id = 1 LIMIT 1);



