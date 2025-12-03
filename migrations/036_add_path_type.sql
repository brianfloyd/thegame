-- Create loops table if it doesn't exist
CREATE TABLE IF NOT EXISTS loops (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    origin_room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    path_type TEXT NOT NULL DEFAULT 'loop',
    created_at BIGINT NOT NULL,
    UNIQUE(player_id, map_id, name)
);

-- Create loop_steps table if it doesn't exist
CREATE TABLE IF NOT EXISTS loop_steps (
    id SERIAL PRIMARY KEY,
    loop_id INTEGER NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE(loop_id, step_index)
);

-- Add path_type column to loops table if it doesn't exist
ALTER TABLE loops ADD COLUMN IF NOT EXISTS path_type TEXT DEFAULT 'loop';

-- Update existing loops to have path_type = 'loop' if null
UPDATE loops SET path_type = 'loop' WHERE path_type IS NULL;

-- Ensure created_at column exists in loop_steps (in case table was created without it)
ALTER TABLE loop_steps ADD COLUMN IF NOT EXISTS created_at BIGINT;
-- Set default value for any null created_at values
UPDATE loop_steps SET created_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 WHERE created_at IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_loops_player_map ON loops(player_id, map_id);
CREATE INDEX IF NOT EXISTS idx_loop_steps_loop_id ON loop_steps(loop_id);

