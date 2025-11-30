-- Deed Configuration Fields Migration
-- Adds fields for warehouse deed configuration in items table

-- Add max_total_items field for deed configuration
ALTER TABLE items ADD COLUMN IF NOT EXISTS deed_max_total_items INTEGER DEFAULT 100;

-- Add automation flag for warehouse deeds
ALTER TABLE items ADD COLUMN IF NOT EXISTS deed_automation_enabled BOOLEAN DEFAULT FALSE;



