-- Migration 017: Ensure all 4 required room types exist (normal, merchant, bank, warehouse)
-- These room types are FIXED, PERMANENT, and should not be removed or renamed

-- Ensure all 4 required room types exist in room_type_colors table
INSERT INTO room_type_colors (room_type, color) VALUES
    ('normal', '#00ff00'),
    ('merchant', '#0088ff'),
    ('bank', '#ffff00'),
    ('warehouse', '#00ffff')
ON CONFLICT (room_type) DO NOTHING;

-- Note: This migration ensures these room types exist but does NOT remove any existing types
-- All room types in the database are preserved













