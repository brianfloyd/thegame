-- Add rune_type field to items table
-- Runes can have types: PRODUCTION, SPEED, EFFICIENCY
-- PRODUCTION runes are required by the factory machine itself (slot 2)
-- SPEED runes reduce crafting time (slot 3)
-- EFFICIENCY runes reduce ingredient consumption (slot 4)

ALTER TABLE items ADD COLUMN IF NOT EXISTS rune_type TEXT;

-- Add check constraint to ensure rune_type is only set for rune items
-- and only valid values are used
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_rune_type_check;
ALTER TABLE items ADD CONSTRAINT items_rune_type_check 
    CHECK (rune_type IS NULL OR rune_type IN ('PRODUCTION', 'SPEED', 'EFFICIENCY'));

-- Create index for efficient rune lookups
CREATE INDEX IF NOT EXISTS idx_items_rune_type ON items(item_type, rune_type) WHERE item_type = 'rune';

-- Update existing runes with their types
-- Factory Rune (formerly Production Rune) is the universal machine requirement
UPDATE items SET rune_type = 'PRODUCTION' WHERE name = 'Factory Rune' AND item_type = 'rune';
UPDATE items SET rune_type = 'PRODUCTION' WHERE name = 'Production Rune' AND item_type = 'rune';
UPDATE items SET rune_type = 'PRODUCTION' WHERE name = 'Harvester Rune' AND item_type = 'rune';

-- Create Speed Rune if it doesn't exist
INSERT INTO items (name, description, item_type, active, poofable, encumbrance, created_at, rune_color, rune_type)
VALUES ('Speed Rune', 'A shimmering rune that accelerates factory production cycles. Place in the speed slot to reduce crafting time.', 'rune', true, false, 1, EXTRACT(EPOCH FROM NOW()) * 1000, '#00FF00', 'SPEED')
ON CONFLICT (name) DO UPDATE SET rune_type = 'SPEED', rune_color = '#00FF00';

-- Create Efficiency Rune if it doesn't exist
INSERT INTO items (name, description, item_type, active, poofable, encumbrance, created_at, rune_color, rune_type)
VALUES ('Efficiency Rune', 'A crystalline rune that optimizes ingredient usage. Place in the efficiency slot to reduce ingredient consumption.', 'rune', true, false, 1, EXTRACT(EPOCH FROM NOW()) * 1000, '#FFD700', 'EFFICIENCY')
ON CONFLICT (name) DO UPDATE SET rune_type = 'EFFICIENCY', rune_color = '#FFD700';

