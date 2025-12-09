-- Migration 063: Add player_id and player_name to debug_todos
-- These columns were missing from migration 062

-- Add player tracking columns
ALTER TABLE debug_todos 
ADD COLUMN IF NOT EXISTS player_id INT REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS player_name TEXT;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_debug_todos_player_id ON debug_todos(player_id);

-- Add comments for documentation
COMMENT ON COLUMN debug_todos.player_id IS 'ID of the player who reported or requested the ticket';
COMMENT ON COLUMN debug_todos.player_name IS 'Name of the player who reported or requested the ticket';

