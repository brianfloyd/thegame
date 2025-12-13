-- Migration: 077_convert_warehouse_items_to_item_id.sql
-- Convert warehouse_items.item_name from TEXT to direct item_id foreign key

-- Step 1: Add new column (nullable initially)
ALTER TABLE warehouse_items 
ADD COLUMN IF NOT EXISTS item_id INTEGER REFERENCES items(id);

-- Step 2: Populate from existing data
-- Map item_name to item_id by matching with items table
UPDATE warehouse_items 
SET item_id = (
  SELECT i.id 
  FROM items i
  WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(warehouse_items.item_name))
)
WHERE item_name IS NOT NULL;

-- Step 2.5: Consolidate duplicates - if same player has same item_id in same warehouse, combine them
-- This handles cases where the same item_name appeared multiple times for the same player/location
DO $$
DECLARE
  duplicate_record RECORD;
BEGIN
  -- Find duplicates and consolidate quantities
  FOR duplicate_record IN
    SELECT player_id, warehouse_location_key, item_id, SUM(quantity) as total_quantity
    FROM warehouse_items
    WHERE item_id IS NOT NULL
    GROUP BY player_id, warehouse_location_key, item_id
    HAVING COUNT(*) > 1
  LOOP
    -- Update first row with total quantity
    UPDATE warehouse_items
    SET quantity = duplicate_record.total_quantity
    WHERE id = (
      SELECT id FROM warehouse_items
      WHERE player_id = duplicate_record.player_id
        AND warehouse_location_key = duplicate_record.warehouse_location_key
        AND item_id = duplicate_record.item_id
      ORDER BY id
      LIMIT 1
    );
    
    -- Delete other duplicate rows
    DELETE FROM warehouse_items
    WHERE player_id = duplicate_record.player_id
      AND warehouse_location_key = duplicate_record.warehouse_location_key
      AND item_id = duplicate_record.item_id
      AND id NOT IN (
        SELECT id FROM warehouse_items
        WHERE player_id = duplicate_record.player_id
          AND warehouse_location_key = duplicate_record.warehouse_location_key
          AND item_id = duplicate_record.item_id
        ORDER BY id
        LIMIT 1
      );
  END LOOP;
END $$;

-- Step 3: Validate - check for NULLs that shouldn't exist
-- This query should return 0 rows (or rows that need manual fixing):
-- SELECT id, player_id, warehouse_location_key, item_name, item_id 
-- FROM warehouse_items 
-- WHERE item_name IS NOT NULL 
--   AND item_id IS NULL;

-- Step 4: Make item_id NOT NULL and add foreign key constraint
-- First, handle any NULLs by removing invalid rows
-- (In production, you'd want to investigate and fix these first)
DELETE FROM warehouse_items 
WHERE item_name IS NOT NULL 
  AND item_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE warehouse_items
ALTER COLUMN item_id SET NOT NULL;

-- Step 5: Add unique constraint on (player_id, warehouse_location_key, item_id) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_items_player_location_item_unique 
ON warehouse_items(player_id, warehouse_location_key, item_id);

-- Step 6: Add index for performance
CREATE INDEX IF NOT EXISTS idx_warehouse_items_item_id 
ON warehouse_items(item_id);

-- Step 7: Drop old item_name column
ALTER TABLE warehouse_items
DROP COLUMN IF EXISTS item_name;

-- Step 8: Add comment for documentation
COMMENT ON COLUMN warehouse_items.item_id IS 
'Foreign key to items(id). Direct reference to item in warehouse storage. Replaces item_name TEXT field.';

-- Note: The old item_name column has been dropped.
-- All code should now use item_id instead of item_name.


