-- Migration: 078_convert_harvest_prerequisite_to_item_id.sql
-- Convert harvest_prerequisite_item from TEXT (JSON) to direct item_id foreign key

-- Step 1: Add new column (nullable initially)
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS harvest_prerequisite_item_id INTEGER REFERENCES items(id);

-- Step 2: Populate from existing JSON data
-- Parse JSON array, extract item_name, lookup item_id
UPDATE scriptable_npcs 
SET harvest_prerequisite_item_id = (
  SELECT i.id 
  FROM items i
  WHERE LOWER(i.name) = LOWER(
    -- Extract item_name from JSON array: [{"item_name":"Harvester Rune"}]
    (harvest_prerequisite_item::jsonb->0->>'item_name')
  )
)
WHERE harvest_prerequisite_item IS NOT NULL 
  AND harvest_prerequisite_item::jsonb->0->>'item_name' IS NOT NULL;

-- Step 3: Validate - check for NULLs that shouldn't exist
-- This query should return 0 rows (or rows that need manual fixing):
-- SELECT id, name, harvest_prerequisite_item, harvest_prerequisite_item_id 
-- FROM scriptable_npcs 
-- WHERE harvest_prerequisite_item IS NOT NULL 
--   AND harvest_prerequisite_item_id IS NULL;

-- Step 4: Add index for performance
CREATE INDEX IF NOT EXISTS idx_scriptable_npcs_harvest_prerequisite_item_id 
ON scriptable_npcs(harvest_prerequisite_item_id) 
WHERE harvest_prerequisite_item_id IS NOT NULL;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN scriptable_npcs.harvest_prerequisite_item_id IS 
'Foreign key to items(id). Direct reference to item required for harvesting. Replaces harvest_prerequisite_item TEXT field.';

-- Note: We keep harvest_prerequisite_item column temporarily for rollback safety
-- It will be dropped in a future migration after code updates are verified













