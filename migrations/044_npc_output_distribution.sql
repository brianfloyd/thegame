-- Add output_distribution field to scriptable_npcs table
-- Values: 'ground' (default), 'player', 'all_players'
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS output_distribution TEXT NOT NULL DEFAULT 'ground';

-- Add check constraint to ensure valid values
ALTER TABLE scriptable_npcs
DROP CONSTRAINT IF EXISTS chk_output_distribution;

ALTER TABLE scriptable_npcs
ADD CONSTRAINT chk_output_distribution 
CHECK (output_distribution IN ('ground', 'player', 'all_players'));






