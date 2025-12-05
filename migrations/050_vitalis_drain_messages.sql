-- Migration 050: Vitalis Drain Messages
-- Adds vitalis_drain_hit and vitalis_drain_miss messages to game_messages table

INSERT INTO game_messages (message_key, message_template, category, description, created_at, updated_at) VALUES
('vitalis_drain_hit', '[Hit] {drainAmount} Vitalis has been drained. ({vitalis} / {maxVitalis})', 'harvest', 'Message when Vitalis is drained on successful harvest hit', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
('vitalis_drain_miss', '[Miss] {drainAmount} Vitalis has been drained. ({vitalis} / {maxVitalis})', 'harvest', 'Message when Vitalis is drained on failed harvest miss', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
ON CONFLICT (message_key) DO UPDATE SET message_template = EXCLUDED.message_template, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
