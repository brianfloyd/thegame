-- Migration: 083_convert_lore_keeper_awards_to_item_id.sql
-- Convert lore_keeper_item_awards.item_name from TEXT to direct item_id foreign key

-- Step 1: Add new column (nullable initially)
ALTER TABLE lore_keeper_item_awards 
ADD COLUMN IF NOT EXISTS item_id INTEGER REFERENCES items(id);

-- Step 2: Populate from existing item_name data
UPDATE lore_keeper_item_awards 
SET item_id = (
  SELECT i.id 
  FROM items i
  WHERE LOWER(i.name) = LOWER(lore_keeper_item_awards.item_name)
)
WHERE item_name IS NOT NULL;

-- Step 3: Consolidate any duplicate (player_id, npc_id, item_id) entries
DO $$
DECLARE
  dup_record RECORD;
BEGIN
  FOR dup_record IN 
    SELECT player_id, npc_id, item_id, COUNT(*) as count
    FROM lore_keeper_item_awards
    WHERE item_id IS NOT NULL
    GROUP BY player_id, npc_id, item_id
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the earliest award, delete duplicates
    DELETE FROM lore_keeper_item_awards
    WHERE player_id = dup_record.player_id
      AND npc_id = dup_record.npc_id
      AND item_id = dup_record.item_id
      AND id NOT IN (
        SELECT id FROM lore_keeper_item_awards
        WHERE player_id = dup_record.player_id
          AND npc_id = dup_record.npc_id
          AND item_id = dup_record.item_id
        ORDER BY awarded_at ASC
        LIMIT 1
      );
  END LOOP;
END $$;

-- Step 4: Validate (commented out - run manually to check)
-- SELECT COUNT(*) as total_rows,
--        COUNT(item_id) as rows_with_item_id,
--        COUNT(DISTINCT item_id) as unique_items
-- FROM lore_keeper_item_awards;

-- Step 5: Add unique constraint on (player_id, npc_id, item_id) to prevent duplicates
-- Note: This will fail if duplicates still exist - check Step 3 results first
-- Use DO block to check if constraint exists first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_lore_keeper_item_award'
  ) THEN
    ALTER TABLE lore_keeper_item_awards
    ADD CONSTRAINT unique_lore_keeper_item_award 
    UNIQUE (player_id, npc_id, item_id);
  END IF;
END $$;

-- Step 6: Make item_id NOT NULL (after validation)
ALTER TABLE lore_keeper_item_awards
ALTER COLUMN item_id SET NOT NULL;

-- Step 7: Add index for performance
CREATE INDEX IF NOT EXISTS idx_lore_keeper_item_awards_item_id 
ON lore_keeper_item_awards(item_id);

-- Step 8: Add comment for documentation
COMMENT ON COLUMN lore_keeper_item_awards.item_id IS 
'Foreign key to items(id). Direct reference to item awarded. Replaces item_name TEXT field.';

-- Note: We keep item_name column temporarily for rollback safety
-- It will be dropped in a future migration after code updates are verified
