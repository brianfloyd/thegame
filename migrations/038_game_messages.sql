-- Create game_messages table for customizable UI messages
CREATE TABLE IF NOT EXISTS game_messages (
    id SERIAL PRIMARY KEY,
    message_key TEXT UNIQUE NOT NULL,
    message_template TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Create index for category lookups
CREATE INDEX IF NOT EXISTS idx_game_messages_category ON game_messages(category);

-- Insert default UI messages (excluding NPC/room/item descriptions which are already customizable)
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
    ('room_also_here', 'Also here: {[char|NPC array]}', 'room', 'Message displayed when other players or NPCs are in the room', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('room_no_one_here', 'No one else is here.', 'room', 'Message displayed when no other players or NPCs are in the room', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('room_obvious_exits', 'Obvious exits: {[directions array]}', 'room', 'Message displaying available directions from the room', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('room_on_ground', 'On the ground: {[items array]}', 'room', 'Message displaying items on the ground in the room', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO NOTHING;












