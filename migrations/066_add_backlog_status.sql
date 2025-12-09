-- Migration 066: Add backlog status for tickets
-- Allows tickets to be moved to backlog (filed but not actively worked on)

-- Update status comment to include backlog
COMMENT ON COLUMN debug_todos.status IS 'open = new ticket, backlog = filed but not actively worked, in_progress = being worked on, resolved = fixed, deleted = soft-deleted (cursor ignores)';

-- Add index for backlog filtering
CREATE INDEX IF NOT EXISTS idx_debug_todos_status_backlog ON debug_todos(status) WHERE status = 'backlog';

-- Note: The status column is TEXT, so 'backlog' is already a valid value
-- No ALTER TABLE needed, just documentation and indexing



