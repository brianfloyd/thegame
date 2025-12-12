-- Migration: 082_convert_lore_keeper_reward_to_item_id.sql
-- Convert lore_keepers.puzzle_reward_item from TEXT to direct item_id foreign key

-- Step 1: Add new column (nullable initially)
ALTER TABLE lore_keepers 
ADD COLUMN IF NOT EXISTS puzzle_reward_item_id INTEGER REFERENCES items(id);

-- Step 2: Populate from existing TEXT data
UPDATE lore_keepers 
SET puzzle_reward_item_id = (
  SELECT i.id 
  FROM items i
  WHERE LOWER(i.name) = LOWER(lore_keepers.puzzle_reward_item)
)
WHERE puzzle_reward_item IS NOT NULL 
  AND puzzle_reward_item != '';

-- Step 3: Validate (commented out - run manually to check)
-- SELECT lk.id, lk.puzzle_reward_item, lk.puzzle_reward_item_id, i.name as item_name
-- FROM lore_keepers lk
-- LEFT JOIN items i ON lk.puzzle_reward_item_id = i.id
-- WHERE lk.puzzle_reward_item IS NOT NULL;

-- Step 4: Add index for performance
CREATE INDEX IF NOT EXISTS idx_lore_keepers_puzzle_reward_item_id 
ON lore_keepers(puzzle_reward_item_id) 
WHERE puzzle_reward_item_id IS NOT NULL;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN lore_keepers.puzzle_reward_item_id IS 
'Foreign key to items(id). Direct reference to item awarded for puzzle completion. Replaces puzzle_reward_item TEXT field.';

-- Note: We keep puzzle_reward_item column temporarily for rollback safety
-- It will be dropped in a future migration after code updates are verified
