-- Remove 'shop' room type from database (consolidate to 'merchant')
-- This migration ensures 'shop' is removed from room_type_colors table

-- First, convert any existing 'shop' rooms to 'merchant'
UPDATE rooms SET room_type = 'merchant' WHERE room_type = 'shop';

-- Remove 'shop' from room_type_colors table
DELETE FROM room_type_colors WHERE room_type = 'shop';


