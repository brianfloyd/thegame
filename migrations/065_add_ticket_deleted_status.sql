-- Migration 065: Add deleted status for tickets
-- Allows soft-deleting tickets (cursor ignores deleted tickets)

-- Add 'deleted' as a valid status option
-- Status values: open, in_progress, resolved, deleted
-- Deleted tickets are stored but cursor takes no action on them

-- Update comment to reflect new status
COMMENT ON COLUMN debug_todos.status IS 'open = new bug, in_progress = being worked on, resolved = fixed, deleted = soft-deleted (cursor ignores)';

-- Add index for filtering out deleted tickets
CREATE INDEX IF NOT EXISTS idx_debug_todos_status_not_deleted ON debug_todos(status) WHERE status != 'deleted';

