-- Add status message fields to scriptable_npcs table
-- These fields allow customization of NPC status messages with markup support
ALTER TABLE scriptable_npcs 
ADD COLUMN IF NOT EXISTS status_message_idle TEXT DEFAULT '(idle)',
ADD COLUMN IF NOT EXISTS status_message_ready TEXT DEFAULT '(ready)',
ADD COLUMN IF NOT EXISTS status_message_harvesting TEXT DEFAULT '(harvesting)',
ADD COLUMN IF NOT EXISTS status_message_cooldown TEXT DEFAULT '(cooldown)';

-- Update existing NPCs to have default values if they're NULL
UPDATE scriptable_npcs 
SET 
    status_message_idle = COALESCE(status_message_idle, '(idle)'),
    status_message_ready = COALESCE(status_message_ready, '(ready)'),
    status_message_harvesting = COALESCE(status_message_harvesting, '(harvesting)'),
    status_message_cooldown = COALESCE(status_message_cooldown, '(cooldown)')
WHERE status_message_idle IS NULL 
   OR status_message_ready IS NULL 
   OR status_message_harvesting IS NULL 
   OR status_message_cooldown IS NULL;












