-- Add harvest prerequisite item and message fields to scriptable_npcs
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS harvest_prerequisite_item TEXT,
ADD COLUMN IF NOT EXISTS harvest_prerequisite_message TEXT;

-- Set default message for existing NPCs
UPDATE scriptable_npcs 
SET harvest_prerequisite_message = 'You lack the required item to harvest from this creature.'
WHERE harvest_prerequisite_message IS NULL;







