-- Migration 068: Update Ticket Types
-- Changes ticket types to: bug, feature, debug

-- Update ticket_type comment
COMMENT ON COLUMN debug_todos.ticket_type IS 'Type: bug (fixing broken functionality), feature (new game enhancement), debug (from telemetry/ZORK observation)';

-- Migrate existing 'user' type tickets to 'bug' (most user-created tickets are bug reports)
UPDATE debug_todos 
SET ticket_type = 'bug' 
WHERE ticket_type = 'user' OR ticket_type IS NULL;

-- Set default to 'bug' for new tickets (can be changed by user)
ALTER TABLE debug_todos 
ALTER COLUMN ticket_type SET DEFAULT 'bug';

-- Add check constraint to ensure valid ticket types
ALTER TABLE debug_todos 
DROP CONSTRAINT IF EXISTS debug_todos_ticket_type_check;

ALTER TABLE debug_todos 
ADD CONSTRAINT debug_todos_ticket_type_check 
CHECK (ticket_type IN ('bug', 'feature', 'debug'));



