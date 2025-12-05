-- Add auto-harvest skip message for missing items
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
    ('auto_harvest_skip_missing_item', 'Skipping {npcName} - you lack the required item: {itemName}', 'automation', 'Message displayed when auto-harvest skips an NPC due to missing required items', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO NOTHING;






