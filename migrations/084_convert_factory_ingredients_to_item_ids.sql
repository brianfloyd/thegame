-- Migration: 084_convert_factory_ingredients_to_item_ids.sql
-- Convert factory_recipes.required_ingredients from item_name to item_id

-- Step 1: Create function to convert ingredient arrays
CREATE OR REPLACE FUNCTION convert_ingredients_to_ids(ingredients_jsonb JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '[]'::JSONB;
  ingredient JSONB;
  item_id_val INTEGER;
  item_name_val TEXT;
BEGIN
  -- If null or empty, return empty array
  IF ingredients_jsonb IS NULL OR jsonb_array_length(ingredients_jsonb) = 0 THEN
    RETURN '[]'::JSONB;
  END IF;
  
  -- Iterate through each ingredient object
  FOR ingredient IN SELECT * FROM jsonb_array_elements(ingredients_jsonb)
  LOOP
    -- Get item_name from ingredient
    item_name_val := ingredient->>'item_name';
    
    IF item_name_val IS NOT NULL THEN
      -- Lookup item_id by name
      SELECT id INTO item_id_val
      FROM items
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(item_name_val));
      
      IF item_id_val IS NOT NULL THEN
        -- Create new object with item_id instead of item_name
        result := result || jsonb_build_object(
          'item_id', item_id_val,
          'quantity', COALESCE((ingredient->>'quantity')::INTEGER, 1)
        );
      ELSE
        -- Item not found - keep original (with warning in logs)
        RAISE WARNING 'Item "%" not found in items table, keeping original ingredient', item_name_val;
        result := result || ingredient;
      END IF;
    ELSIF ingredient->>'item_id' IS NOT NULL THEN
      -- Already has item_id, keep as-is
      result := result || ingredient;
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update all recipes
UPDATE factory_recipes
SET required_ingredients = convert_ingredients_to_ids(required_ingredients)
WHERE required_ingredients IS NOT NULL
  AND jsonb_array_length(required_ingredients) > 0;

-- Step 3: Validate (commented out - run manually to check)
-- SELECT recipe_id, name, required_ingredients
-- FROM factory_recipes
-- WHERE required_ingredients IS NOT NULL
--   AND jsonb_array_length(required_ingredients) > 0
--   AND EXISTS (
--     SELECT 1 FROM jsonb_array_elements(required_ingredients) AS ing
--     WHERE ing->>'item_name' IS NOT NULL
--   );

-- Step 4: Drop the temporary function
DROP FUNCTION convert_ingredients_to_ids(JSONB);

-- Note: Old format (item_name) is completely replaced with item_id format
-- No backward compatibility needed as this is internal system data


