-- Add color field to items table for rune items
-- Runes can have a hex color value (default: #0000ff for blue)

ALTER TABLE items ADD COLUMN IF NOT EXISTS rune_color TEXT DEFAULT '#0000ff';

-- Update existing rune items to have default blue color
UPDATE items SET rune_color = '#0000ff' WHERE item_type = 'rune' AND (rune_color IS NULL OR rune_color = '');

-- Add index for rune items with colors
CREATE INDEX IF NOT EXISTS idx_items_rune_color ON items(rune_color) WHERE item_type = 'rune';

