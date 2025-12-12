-- Migration: 086_convert_factory_byproducts_to_item_ids.sql
-- Convert factory_recipes.byproducts from item_name to item_id

-- Step 1: Create function to convert byproduct arrays
CREATE OR REPLACE FUNCTION convert_byproducts_to_ids(byproducts_jsonb JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '[]'::JSONB;
  byproduct JSONB;
  item_id_val INTEGER;
  item_name_val TEXT;
BEGIN
  -- If null or empty, return empty array
  IF byproducts_jsonb IS NULL OR jsonb_array_length(byproducts_jsonb) = 0 THEN
    RETURN '[]'::JSONB;
  END IF;
  
  -- Iterate through each byproduct object
  FOR byproduct IN SELECT * FROM jsonb_array_elements(byproducts_jsonb)
  LOOP
    -- Get item_name from byproduct
    item_name_val := byproduct->>'item_name';
    
    IF item_name_val IS NOT NULL THEN
      -- Lookup item_id by name
      SELECT id INTO item_id_val
      FROM items
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(item_name_val));
      
      IF item_id_val IS NOT NULL THEN
        -- Create new object with item_id instead of item_name
        result := result || jsonb_build_object(
          'item_id', item_id_val,
          'quantity', COALESCE((byproduct->>'quantity')::INTEGER, 1),
          'chance', COALESCE((byproduct->>'chance')::NUMERIC, 1.0)
        );
      ELSE
        -- Item not found - keep original (with warning in logs)
        RAISE WARNING 'Item "%" not found in items table, keeping original byproduct', item_name_val;
        result := result || byproduct;
      END IF;
    ELSIF byproduct->>'item_id' IS NOT NULL THEN
      -- Already has item_id, keep as-is (preserve chance if present)
      result := result || byproduct;
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update all recipes
UPDATE factory_recipes
SET byproducts = convert_byproducts_to_ids(byproducts)
WHERE byproducts IS NOT NULL
  AND jsonb_array_length(byproducts) > 0;

-- Step 3: Validate (commented out - run manually to check)
-- SELECT recipe_id, name, byproducts
-- FROM factory_recipes
-- WHERE byproducts IS NOT NULL
--   AND jsonb_array_length(byproducts) > 0
--   AND EXISTS (
--     SELECT 1 FROM jsonb_array_elements(byproducts) AS bp
--     WHERE bp->>'item_name' IS NOT NULL
--   );

-- Step 4: Drop the temporary function
DROP FUNCTION convert_byproducts_to_ids(JSONB);

-- Note: Old format (item_name) is completely replaced with item_id format
-- No backward compatibility needed as this is internal system data

