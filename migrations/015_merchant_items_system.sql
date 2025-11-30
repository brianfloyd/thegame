-- Merchant Items System
-- Allows items to be sold in merchant rooms with inventory management

-- Create merchant_items table
CREATE TABLE IF NOT EXISTS merchant_items (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    unlimited BOOLEAN NOT NULL DEFAULT TRUE,
    max_qty INTEGER,
    current_qty INTEGER NOT NULL DEFAULT 0,
    regen_hours NUMERIC,
    last_regen_time BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    UNIQUE(item_id, room_id)
);

-- Create index on room_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_merchant_items_room_id ON merchant_items(room_id);

-- Create index on item_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_merchant_items_item_id ON merchant_items(item_id);

-- Add constraint: only merchant rooms can have merchant items
-- This is enforced at the application level, but we add a comment for documentation
COMMENT ON TABLE merchant_items IS 'Items sold in merchant rooms. Only rooms with room_type = ''merchant'' should have entries here.';


