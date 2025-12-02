-- Seed Data Migration
-- Initial game data for maps, rooms, players, and items

-- Insert maps
INSERT INTO maps (name, width, height, description) VALUES
    ('Newhaven', 20, 20, 'The main town of Newhaven, a bustling settlement with well-organized streets.'),
    ('Northern Territory', 10, 10, 'The wild Northern Territory, a rugged landscape north of Newhaven.')
ON CONFLICT (name) DO NOTHING;

-- Room type colors
-- Only 4 valid room types: normal, merchant, factory, warehouse
INSERT INTO room_type_colors (room_type, color) VALUES
    ('normal', '#00ff00'),
    ('merchant', '#0088ff'),
    ('factory', '#ff8800'),
    ('warehouse', '#00ffff')
ON CONFLICT (room_type) DO NOTHING;

-- Items
INSERT INTO items (name, description, item_type, poofable, encumbrance, created_at) VALUES
    ('Pulse Resin', 'A thick, amber-colored resin harvested from Pulsewood trees. It pulses faintly with bioluminescent energy and is commonly used in alchemical preparations.', 'sundries', TRUE, 2, EXTRACT(EPOCH FROM NOW()) * 1000),
    ('Harvester Rune', 'A small stone etched with glowing symbols. When held near harvestable creatures, it enhances the yield and quality of gathered materials.', 'sundries', FALSE, 5, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (name) DO NOTHING;

-- Newhaven Perimeter Rooms (coordinates -10 to +9)
-- Westwall Street (x = -10)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'westwall street ' || (coord + 11),
    'You stand on Westwall Street, the western boundary of the town. The street runs north to south along the outer wall. Buildings line the eastern side, while the western side opens to the wilderness beyond.',
    -10, coord, 1, 'normal'
FROM generate_series(-10, 9) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Eastwall Street (x = 9)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'eastwall street ' || (coord + 11),
    'You stand on Eastwall Street, the eastern boundary of the town. The street runs north to south along the outer wall. Buildings line the western side, while the eastern side opens to the wilderness beyond.',
    9, coord, 1, 'normal'
FROM generate_series(-10, 9) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- South Street (y = -10)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'south street ' || (coord + 11),
    'You stand on South Street, the southern boundary of the town. The street runs east to west along the outer wall. Buildings line the northern side, while the southern side opens to the wilderness beyond.',
    coord, -10, 1, 'normal'
FROM generate_series(-10, 9) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- North Street (y = 9) - includes connection point at x=0
INSERT INTO rooms (name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction, room_type) 
SELECT 
    'north street ' || (coord + 11),
    CASE WHEN coord = 0 
        THEN 'You stand on North Street, the northern boundary of the town. The street runs east to west along the outer wall. Buildings line the southern side, while the northern side opens to the wilderness beyond. A path leads north into the Northern Territory.'
        ELSE 'You stand on North Street, the northern boundary of the town. The street runs east to west along the outer wall. Buildings line the southern side, while the northern side opens to the wilderness beyond.'
    END,
    coord, 9, 1,
    CASE WHEN coord = 0 THEN 2 ELSE NULL END,
    CASE WHEN coord = 0 THEN 0 ELSE NULL END,
    CASE WHEN coord = 0 THEN -5 ELSE NULL END,
    CASE WHEN coord = 0 THEN 'N' ELSE NULL END,
    'normal'
FROM generate_series(-10, 9) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Center Street (x = 0) - special rooms
INSERT INTO rooms (name, description, x, y, map_id, room_type) VALUES
    ('town square', 'You stand in the center of a bustling town square. Cobblestone paths radiate outward from a weathered stone fountain in the center. Market stalls line the edges, though they appear empty at this hour. The air carries the faint scent of fresh bread and distant woodsmoke. Center Street continues north and south from here.', 0, 0, 1, 'normal'),
    ('northern room', 'You find yourself in a quiet northern chamber. The walls are made of smooth, dark stone that seems to absorb the light. A single torch flickers in a sconce, casting dancing shadows across the floor. The room feels ancient and peaceful, with a sense of history embedded in its very stones. Center Street continues north and south.', 0, 1, 1, 'normal'),
    ('southern room', 'You enter a warm southern chamber. The room is bathed in soft golden light from a large window facing south. Comfortable furnishings suggest this was once a gathering place. The air is still and calm, with dust motes drifting lazily in the light. Center Street continues north and south.', 0, -1, 1, 'normal')
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Center Street other rooms (x = 0, y != 0, 1, -1, -10, 9)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'center street ' || CASE WHEN coord > 0 THEN 'north' ELSE 'south' END || ' ' || ABS(coord),
    'You walk along Center Street, the main north-south thoroughfare. The wide cobblestone road is well-maintained, with shops and buildings lining both sides. The street continues to the north and south.',
    0, coord, 1, 'normal'
FROM generate_series(-10, 9) AS coord
WHERE coord NOT IN (0, 1, -1, -10, 9)
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Northern Territory Perimeter Rooms (coordinates -5 to +4)
-- Westwall Street (x = -5)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'westwall street ' || (coord + 6),
    'You stand on Westwall Street in the Northern Territory. The rugged terrain stretches to the west, while the street runs north to south along the settlement''s edge.',
    -5, coord, 2, 'normal'
FROM generate_series(-5, 4) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Eastwall Street (x = 4)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'eastwall street ' || (coord + 6),
    'You stand on Eastwall Street in the Northern Territory. The wild landscape extends to the east, while the street runs north to south along the settlement''s edge.',
    4, coord, 2, 'normal'
FROM generate_series(-5, 4) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- South Street (y = -5) - includes connection point at x=0
INSERT INTO rooms (name, description, x, y, map_id, connected_map_id, connected_room_x, connected_room_y, connection_direction, room_type) 
SELECT 
    'south street ' || (coord + 6),
    CASE WHEN coord = 0 
        THEN 'You stand on South Street in the Northern Territory. The street runs east to west along the southern boundary. A path leads south back to Newhaven.'
        ELSE 'You stand on South Street in the Northern Territory. The street runs east to west along the southern boundary.'
    END,
    coord, -5, 2,
    CASE WHEN coord = 0 THEN 1 ELSE NULL END,
    CASE WHEN coord = 0 THEN 0 ELSE NULL END,
    CASE WHEN coord = 0 THEN 9 ELSE NULL END,
    CASE WHEN coord = 0 THEN 'S' ELSE NULL END,
    'normal'
FROM generate_series(-5, 4) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- North Street (y = 4)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'north street ' || (coord + 6),
    CASE WHEN coord = 0 
        THEN 'You stand at the intersection of North Street and Center Street in the Northern Territory. North Street runs east to west along the northern boundary, while Center Street continues south, connecting to the rest of the settlement. The wild lands stretch endlessly to the north.'
        ELSE 'You stand on North Street in the Northern Territory. The street runs east to west along the northern boundary. The wild lands stretch endlessly to the north.'
    END,
    coord, 4, 2, 'normal'
FROM generate_series(-5, 4) AS coord
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Northern Territory Center Street (x = 0)
INSERT INTO rooms (name, description, x, y, map_id, room_type) 
SELECT 
    'center street ' || CASE WHEN coord > 0 THEN 'north' ELSE 'south' END || ' ' || ABS(coord),
    'You walk along Center Street in the Northern Territory. The road is rougher here than in Newhaven, with fewer buildings and more open space. The street continues to the north and south.',
    0, coord, 2, 'normal'
FROM generate_series(-5, 4) AS coord
WHERE coord NOT IN (-5, 4)
ON CONFLICT (map_id, x, y) DO NOTHING;

-- Players (Fliz with god mode, Hebron without)
-- Note: current_room_id=1 assumes town square is ID 1 - may need adjustment based on actual IDs
INSERT INTO players (name, current_room_id, stat_ingenuity, stat_resonance, stat_fortitude, stat_acumen, ability_crafting, ability_attunement, ability_endurance, ability_commerce, assignable_points, flag_god_mode)
SELECT 'Fliz', r.id, 5, 5, 5, 5, 0, 0, 0, 0, 5, 1
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
ON CONFLICT (name) DO UPDATE SET flag_god_mode = 1;

INSERT INTO players (name, current_room_id, stat_ingenuity, stat_resonance, stat_fortitude, stat_acumen, ability_crafting, ability_attunement, ability_endurance, ability_commerce, assignable_points, flag_god_mode)
SELECT 'Hebron', r.id, 5, 5, 5, 5, 0, 0, 0, 0, 5, 0
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
ON CONFLICT (name) DO NOTHING;

-- Seed Harvester Rune in Town Square
INSERT INTO room_items (room_id, item_name, quantity, created_at)
SELECT r.id, 'Harvester Rune', 1, EXTRACT(EPOCH FROM NOW()) * 1000
FROM rooms r WHERE r.name = 'town square' AND r.map_id = 1
AND NOT EXISTS (
    SELECT 1 FROM room_items ri WHERE ri.room_id = r.id AND ri.item_name = 'Harvester Rune'
);




