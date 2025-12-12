-- Migration: 081_convert_puzzle_reward_to_item_id.sql
-- Convert scriptable_npcs.puzzle_reward_item from TEXT to direct item_id foreign key

-- Step 1: Add new column (nullable initially)
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS puzzle_reward_item_id INTEGER REFERENCES items(id);

-- Step 2: Populate from existing data
-- Lookup item_id from items table by name (case-insensitive)
UPDATE scriptable_npcs 
SET puzzle_reward_item_id = (
  SELECT i.id 
  FROM items i
  WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(scriptable_npcs.puzzle_reward_item))
)
WHERE puzzle_reward_item IS NOT NULL 
  AND TRIM(puzzle_reward_item) != '';

-- Step 3: Validate - check for NULLs that shouldn't exist
-- This query should return 0 rows (or rows that need manual fixing):
-- SELECT id, name, puzzle_reward_item, puzzle_reward_item_id 
-- FROM scriptable_npcs 
-- WHERE puzzle_reward_item IS NOT NULL 
--   AND TRIM(puzzle_reward_item) != ''
--   AND puzzle_reward_item_id IS NULL;

-- Step 4: Add index for performance
CREATE INDEX IF NOT EXISTS idx_scriptable_npcs_puzzle_reward_item_id 
ON scriptable_npcs(puzzle_reward_item_id) 
WHERE puzzle_reward_item_id IS NOT NULL;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN scriptable_npcs.puzzle_reward_item_id IS 
'Foreign key to items(id). Direct reference to item awarded for solving puzzle. Replaces puzzle_reward_item TEXT field.';

-- Note: We keep puzzle_reward_item column temporarily for rollback safety
-- It will be dropped in a future migration after code updates are verified

