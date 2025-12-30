-- Migration 091: Fix harvest message templates to remove angle brackets
-- NPC names should use their own markup (e.g., ..Pulsewood Tree..) instead of being wrapped in <{npcName}>
-- This prevents double-wrapping and incorrect markup parsing

UPDATE game_messages 
SET message_template = 'You begin harvesting the {npcName}.',
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
WHERE message_key = 'harvest_begin' AND message_template LIKE '%<{npcName}>%';

UPDATE game_messages 
SET message_template = 'Your harvest from {npcName} misses this cycle.',
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
WHERE message_key = 'harvest_miss' AND message_template LIKE '%<{npcName}>%';

UPDATE game_messages 
SET message_template = '{npcName} pulses {quantity} {itemName} for harvest.',
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
WHERE message_key = 'harvest_item_produced' AND message_template LIKE '%<{npcName}>%';

UPDATE game_messages 
SET message_template = '{npcName} has been harvested and must cooldown before continue harvest.',
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
WHERE message_key = 'harvest_cooldown' AND message_template LIKE '%<{npcName}>%';




