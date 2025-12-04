-- Ensure warehouse room type exists in database
-- Run this if warehouse is missing from room_type_colors

INSERT INTO room_type_colors (room_type, color) VALUES
    ('warehouse', '#00ffff')
ON CONFLICT (room_type) DO UPDATE SET color = '#00ffff';

-- Verify all 4 required room types exist
INSERT INTO room_type_colors (room_type, color) VALUES
    ('normal', '#00ff00'),
    ('merchant', '#0088ff'),
    ('factory', '#ff8800')
ON CONFLICT (room_type) DO NOTHING;

-- Show current room types
SELECT room_type, color FROM room_type_colors ORDER BY room_type;


















