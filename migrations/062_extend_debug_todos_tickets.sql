-- Migration 062: Extend Debug Todos with Ticket System Fields
-- Adds ticket-specific fields to support ZORK-Cursor ticket workflow

-- Add ticket-specific columns to debug_todos
ALTER TABLE debug_todos 
ADD COLUMN IF NOT EXISTS ticket_type TEXT DEFAULT 'debug',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS estimated_effort TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS player_id INT REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS player_name TEXT;

-- Update existing rows to have default values
UPDATE debug_todos 
SET ticket_type = 'debug' WHERE ticket_type IS NULL;
UPDATE debug_todos 
SET priority = 2 WHERE priority IS NULL;
UPDATE debug_todos 
SET tags = '{}' WHERE tags IS NULL;

-- Add indexes for efficient ticket queries
CREATE INDEX IF NOT EXISTS idx_debug_todos_priority ON debug_todos(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_debug_todos_type ON debug_todos(ticket_type);
CREATE INDEX IF NOT EXISTS idx_debug_todos_status_priority ON debug_todos(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_debug_todos_player_id ON debug_todos(player_id);

-- Add comments for documentation
COMMENT ON COLUMN debug_todos.ticket_type IS 'Type: debug (from telemetry), manual (ZORK direct), user (user-created)';
COMMENT ON COLUMN debug_todos.priority IS 'Priority: 1 (low), 2 (medium), 3 (high), 4 (critical)';
COMMENT ON COLUMN debug_todos.estimated_effort IS 'Estimated effort: quick, medium, complex';
COMMENT ON COLUMN debug_todos.tags IS 'Array of tags for categorization';
COMMENT ON COLUMN debug_todos.player_id IS 'ID of the player who reported or requested the ticket';
COMMENT ON COLUMN debug_todos.player_name IS 'Name of the player who reported or requested the ticket';

