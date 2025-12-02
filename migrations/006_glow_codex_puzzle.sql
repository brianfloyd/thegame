-- Add Glow Codex puzzle fields to scriptable_npcs table
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS puzzle_type TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS puzzle_glow_clues TEXT,
ADD COLUMN IF NOT EXISTS puzzle_extraction_pattern TEXT,
ADD COLUMN IF NOT EXISTS puzzle_solution_word TEXT,
ADD COLUMN IF NOT EXISTS puzzle_success_response TEXT,
ADD COLUMN IF NOT EXISTS puzzle_failure_response TEXT,
ADD COLUMN IF NOT EXISTS puzzle_reward_item TEXT;

-- Add check constraint for puzzle_type
ALTER TABLE scriptable_npcs 
DROP CONSTRAINT IF EXISTS check_puzzle_type;

ALTER TABLE scriptable_npcs 
ADD CONSTRAINT check_puzzle_type 
CHECK (puzzle_type IN ('none', 'glow_codex'));











