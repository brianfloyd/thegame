-- Add whimsical messages for looking in directions without exits
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
    ('look_direction_wall_1', 'You''re looking at a wall.', 'command', 'Message when player looks in a direction with no exit (variant 1)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('look_direction_wall_2', 'There is nothing but solid wall in that direction.', 'command', 'Message when player looks in a direction with no exit (variant 2)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('look_direction_wall_3', 'You peer into the distance, but all you see is an impenetrable barrier.', 'command', 'Message when player looks in a direction with no exit (variant 3)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('look_direction_wall_4', 'The way is blocked. Your gaze meets an unyielding surface.', 'command', 'Message when player looks in a direction with no exit (variant 4)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('look_direction_wall_5', 'You squint your eyes, but the path simply does not exist in that direction.', 'command', 'Message when player looks in a direction with no exit (variant 5)', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('look_direction_prefix', 'Looking {direction}...', 'command', 'Prefix message when player looks in a valid exit direction', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO NOTHING;
