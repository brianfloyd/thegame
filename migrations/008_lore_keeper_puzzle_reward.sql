-- Add puzzle_reward_item field to lore_keepers table
ALTER TABLE lore_keepers 
ADD COLUMN IF NOT EXISTS puzzle_reward_item TEXT;

