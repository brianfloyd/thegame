-- Migration: 085_convert_factory_outputs_to_item_ids.sql
-- Convert factory_recipes.output_items from item_name to item_id

-- Step 1: Create function to convert output item arrays
CREATE OR REPLACE FUNCTION convert_outputs_to_ids(outputs_jsonb JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '[]'::JSONB;
  output_item JSONB;
  item_id_val INTEGER;
  item_name_val TEXT;
BEGIN
  -- If null or empty, return empty array
  IF outputs_jsonb IS NULL OR jsonb_array_length(outputs_jsonb) = 0 THEN
    RETURN '[]'::JSONB;
  END IF;
  
  -- Iterate through each output item object
  FOR output_item IN SELECT * FROM jsonb_array_elements(outputs_jsonb)
  LOOP
    -- Get item_name from output_item
    item_name_val := output_item->>'item_name';
    
    IF item_name_val IS NOT NULL THEN
      -- Lookup item_id by name
      SELECT id INTO item_id_val
      FROM items
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(item_name_val));
      
      IF item_id_val IS NOT NULL THEN
        -- Create new object with item_id instead of item_name
        result := result || jsonb_build_object(
          'item_id', item_id_val,
          'quantity', COALESCE((output_item->>'quantity')::INTEGER, 1)
        );
      ELSE
        -- Item not found - keep original (with warning in logs)
        RAISE WARNING 'Item "%" not found in items table, keeping original output', item_name_val;
        result := result || output_item;
      END IF;
    ELSIF output_item->>'item_id' IS NOT NULL THEN
      -- Already has item_id, keep as-is
      result := result || output_item;
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update all recipes
UPDATE factory_recipes
SET output_items = convert_outputs_to_ids(output_items)
WHERE output_items IS NOT NULL
  AND jsonb_array_length(output_items) > 0;

-- Step 3: Validate (commented out - run manually to check)
-- SELECT recipe_id, name, output_items
-- FROM factory_recipes
-- WHERE output_items IS NOT NULL
--   AND jsonb_array_length(output_items) > 0
--   AND EXISTS (
--     SELECT 1 FROM jsonb_array_elements(output_items) AS out_item
--     WHERE out_item->>'item_name' IS NOT NULL
--   );

-- Step 4: Drop the temporary function
DROP FUNCTION convert_outputs_to_ids(JSONB);

-- Note: Old format (item_name) is completely replaced with item_id format
-- No backward compatibility needed as this is internal system data
