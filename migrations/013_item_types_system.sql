-- Item Types System Migration
-- Implements dynamic item types loaded from database (similar to room_type_colors)

-- Create item_types table (similar to room_type_colors)
CREATE TABLE IF NOT EXISTS item_types (
    id SERIAL PRIMARY KEY,
    item_type TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Insert the 3 valid item types: ingredients, runes, deeds
INSERT INTO item_types (item_type, description) VALUES
    ('ingredient', 'Raw materials and ingredients used in crafting and alchemy'),
    ('rune', 'Magical runes and enchanted items'),
    ('deed', 'Property deeds and ownership documents')
ON CONFLICT (item_type) DO NOTHING;

-- Update existing items to use new item types
-- Harvester Rune -> 'rune'
UPDATE items SET item_type = 'rune' WHERE name = 'Harvester Rune';

-- Pulse Resin -> 'ingredient'
UPDATE items SET item_type = 'ingredient' WHERE name = 'Pulse Resin';

-- Remove any items with invalid item types (set to 'ingredient' as default)
-- This handles any items that might have old types like 'sundries', 'weapon', etc.
UPDATE items 
SET item_type = 'ingredient' 
WHERE item_type NOT IN (SELECT item_type FROM item_types);













