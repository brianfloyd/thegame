-- Migration: 080_convert_npc_output_items_to_ids.sql
-- Convert scriptable_npcs.output_items JSONB from item names to item IDs
-- JSONB keys must be strings, so item IDs will be stored as string keys: {"42": 5}

-- Step 1: Create a function to convert output_items from names to IDs
CREATE OR REPLACE FUNCTION convert_output_items_to_ids(output_items_jsonb JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  item_name_key TEXT;
  item_id_val INTEGER;
  quantity_val NUMERIC;
BEGIN
  -- Iterate through each key-value pair in the input JSONB
  FOR item_name_key, quantity_val IN SELECT * FROM jsonb_each(output_items_jsonb)
  LOOP
    -- Lookup item_id from items table by name (case-insensitive)
    SELECT id INTO item_id_val
    FROM items
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(item_name_key))
    LIMIT 1;
    
    -- If item found, add to result with item_id as string key
    IF item_id_val IS NOT NULL THEN
      result := result || jsonb_build_object(item_id_val::TEXT, quantity_val);
    ELSE
      -- Item not found - log warning but continue
      RAISE WARNING 'Item not found: %', item_name_key;
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update all NPCs with non-empty output_items
UPDATE scriptable_npcs
SET output_items = convert_output_items_to_ids(output_items)
WHERE output_items IS NOT NULL 
  AND output_items::text != '{}'
  AND output_items::text != 'null';

-- Step 3: Validate - check for any items that couldn't be converted
-- This query should return 0 rows (or rows that need manual fixing):
-- SELECT id, name, output_items 
-- FROM scriptable_npcs 
-- WHERE output_items IS NOT NULL 
--   AND output_items::text != '{}'
--   AND EXISTS (
--     SELECT 1 FROM jsonb_each(output_items) 
--     WHERE NOT EXISTS (
--       SELECT 1 FROM items 
--       WHERE LOWER(TRIM(items.name)) = LOWER(TRIM(key::text))
--     )
--   );

-- Step 4: Drop the temporary function
DROP FUNCTION IF EXISTS convert_output_items_to_ids(JSONB);

-- Step 5: Add comment for documentation
COMMENT ON COLUMN scriptable_npcs.output_items IS 
'JSONB object with item_id (as string keys) mapping to quantities. Format: {"42": 5, "43": 2} where keys are item IDs and values are produced quantities.';

-- Note: The migration converts item names to item IDs.
-- Code should be updated to handle item_id keys and convert back to item names for display/lookup.













