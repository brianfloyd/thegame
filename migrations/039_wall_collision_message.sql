-- Add wall collision message to game_messages table
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
    ('movement_wall_collision', '!Ouch! You walked into the wall to the {direction}.!', 'movement', 'Error message displayed when player attempts to move into a wall or blocked direction', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO NOTHING;












