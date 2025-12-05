-- Add player movement-related system messages to game_messages table
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
    ('player_entered_game', '<{playerName}> has entered the game.', 'player', 'System message when a player first connects to the game', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('player_left_game', '<{playerName}> has left the game.', 'player', 'System message when a player disconnects from the game', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('player_arrived', '<{playerName}> has arrived.', 'player', 'Message when a player arrives in a room (teleport/connection)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('player_left', '<{playerName}> has left.', 'player', 'Message when a player leaves a room (teleport/connection)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('player_enters_from', '<{playerName}> enters from the {direction}.', 'player', 'Message when a player enters a room from a direction', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('player_left_to', '<{playerName}> left to the {direction}.', 'player', 'Message when a player leaves a room to a direction', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO NOTHING;











