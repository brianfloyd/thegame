-- Migration 018: Create currency items (Glimmer Shard and Glimmer Crown)

-- Insert Glimmer Shard (small denomination)
INSERT INTO items (name, description, item_type, encumbrance, active, poofable, created_at) VALUES
    ('Glimmer Shard', 'A faintly glowing fragment of crystallized essence.', 'currency', 0.5, true, false, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (name) DO NOTHING;

-- Insert Glimmer Crown (large denomination)
INSERT INTO items (name, description, item_type, encumbrance, active, poofable, created_at) VALUES
    ('Glimmer Crown', 'A radiant coin forged from pure Glimmer essence.', 'currency', 3, true, false, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (name) DO NOTHING;

-- Currency conversion rate: 100 Glimmer Shards = 1 Glimmer Crown

