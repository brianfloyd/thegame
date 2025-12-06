-- Migration 054: Pulse Echo Messages
-- Adds pulse_echo_gained and pulse_echo_tier_up messages to game_messages table

INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
('pulse_echo_gained', 'You feel the pulse resonate. +{echoes} Pulse Echoes gained. (Total: {totalEchoes})', 'harvest', 'Message when player gains pulse echoes from successful harvest', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('pulse_echo_tier_up', 'Your spiritual attunement deepens! Pulse Echo Tier increased to {newTier}.', 'harvest', 'Message when player increases pulse echo tier', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO UPDATE SET message_template = EXCLUDED.message_template, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;