-- Migration 067: Update Priority System
-- Ensures priority can be set to 1 (low), 2 (medium), 3 (high), 4 (critical)

-- Update priority comment to reflect all levels
COMMENT ON COLUMN debug_todos.priority IS 'Priority: 1 (low), 2 (medium), 3 (high), 4 (critical). Default: 2 (medium)';

-- Add check constraint to ensure priority is between 1 and 4
ALTER TABLE debug_todos 
DROP CONSTRAINT IF EXISTS debug_todos_priority_check;

ALTER TABLE debug_todos 
ADD CONSTRAINT debug_todos_priority_check 
CHECK (priority >= 1 AND priority <= 4);

-- Update any invalid priorities to default (2)
UPDATE debug_todos 
SET priority = 2 
WHERE priority IS NULL OR priority < 1 OR priority > 4;



