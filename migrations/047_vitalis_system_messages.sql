-- Add Vitalis system messages to game_messages table

INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
('vitalis_depleted', 'Your Vitalis has been drained. You have lost sync with the world''s pulse and must attune before harvesting again.', 'harvest', 'Message when player Vitalis reaches 0 during harvest', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('vitalis_drain_message', 'The rhythm creature tugs at your essence. Vitalis: {vitalis} / {maxVitalis}.', 'harvest', 'Optional message showing Vitalis drain during harvest', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('attune_success', 'You kneel and attune to the pulse beneath your feet. Your Vitalis surges. ({vitalis} / {maxVitalis})', 'command', 'Message when attune command succeeds', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('attune_cooldown', 'Your connection is still stabilizing. You need a moment before you can attune again.', 'command', 'Message when attune command is on cooldown', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('loop_paused_vitalis', 'Your loop cannot resume until you recover Vitalis. Use ''attune'' to restore your connection.', 'automation', 'Message when auto-harvest loop pauses due to Vitalis depletion', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('vitalis_unsynced_room', '<{playerName}> staggers as their connection to the world''s pulse is severed.', 'harvest', 'Room message when player Vitalis is depleted', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO UPDATE SET message_template = EXCLUDED.message_template, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;

