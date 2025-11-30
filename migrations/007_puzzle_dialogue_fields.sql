-- Add puzzle dialogue response fields to scriptable_npcs table
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS puzzle_hint_responses TEXT,
ADD COLUMN IF NOT EXISTS puzzle_followup_responses TEXT,
ADD COLUMN IF NOT EXISTS puzzle_incorrect_attempt_responses TEXT;



