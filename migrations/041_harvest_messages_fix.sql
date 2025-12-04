-- Fix: Ensure harvest messages exist in database
-- This migration ensures all harvest messages are present, even if they were missed in the original migration

-- Insert harvest messages if they don't exist (by message_key)
INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
    ('harvest_begin', 'You begin harvesting the <{npcName}>.', 'harvest', 'Message displayed when player starts harvesting from an NPC', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('harvest_miss', 'Your harvest from <{npcName}> misses this cycle.', 'harvest', 'Message displayed when a harvest attempt misses', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('harvest_item_produced', '<{npcName}> pulses {quantity} {itemName} for harvest.', 'harvest', 'Message displayed when an NPC produces an item for harvest', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
    ('harvest_cooldown', '<{npcName}> has been harvested and must cooldown before continue harvest.', 'harvest', 'Message displayed when an NPC enters cooldown after being harvested', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO UPDATE SET
    message_template = EXCLUDED.message_template,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at;

