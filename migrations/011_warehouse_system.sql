-- Warehouse System Migration
-- Implements shared warehouse rooms with private storage lockers

-- Warehouse items table (per-player storage)
CREATE TABLE IF NOT EXISTS warehouse_items (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    warehouse_location_key TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
);

-- Player warehouses table (tracks capacity and upgrades per player per location)
CREATE TABLE IF NOT EXISTS player_warehouses (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    warehouse_location_key TEXT NOT NULL,
    deed_item_id INTEGER REFERENCES items(id),
    upgrade_tier INTEGER NOT NULL DEFAULT 1,
    max_item_types INTEGER NOT NULL DEFAULT 1,
    max_quantity_per_type INTEGER NOT NULL DEFAULT 100,
    created_at BIGINT NOT NULL,
    UNIQUE(player_id, warehouse_location_key)
);

-- Add deed configuration fields to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS deed_warehouse_location_key TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS deed_base_max_item_types INTEGER DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS deed_base_max_quantity_per_type INTEGER DEFAULT 100;
ALTER TABLE items ADD COLUMN IF NOT EXISTS deed_upgrade_tier INTEGER DEFAULT 1;

-- Indexes for warehouse system
CREATE INDEX IF NOT EXISTS idx_warehouse_items_player_location ON warehouse_items(player_id, warehouse_location_key);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_item_name ON warehouse_items(item_name);
CREATE INDEX IF NOT EXISTS idx_player_warehouses_player_location ON player_warehouses(player_id, warehouse_location_key);
CREATE INDEX IF NOT EXISTS idx_items_deed_location ON items(deed_warehouse_location_key) WHERE item_type = 'deed';

-- Ensure only 4 valid room types exist: normal, merchant, factory, warehouse
-- Convert any existing 'shop' rooms to 'merchant' (consolidate shop -> merchant)
UPDATE rooms SET room_type = 'merchant' WHERE room_type = 'shop';

-- Remove 'shop' from room_type_colors if it exists (consolidate to 'merchant')
DELETE FROM room_type_colors WHERE room_type = 'shop';

-- Add warehouse room type color (cyan) if not already present
INSERT INTO room_type_colors (room_type, color) VALUES
    ('warehouse', '#00ffff')
ON CONFLICT (room_type) DO NOTHING;

-- Ensure all 4 required room types exist
INSERT INTO room_type_colors (room_type, color) VALUES
    ('normal', '#00ff00'),
    ('merchant', '#0088ff'),
    ('factory', '#ff8800')
ON CONFLICT (room_type) DO NOTHING;

-- Note: Room type validation is enforced at the application level
-- Only room types that exist in room_type_colors table should be used
-- This is validated in the map editor handlers (createRoom, updateRoom)

