-- Migration 088: Broadcast System
-- Creates tables for broadcast groups and messages

CREATE TABLE IF NOT EXISTS broadcast_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_by_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS broadcast_group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES broadcast_groups(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    joined_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    UNIQUE(group_id, player_id)
);

CREATE TABLE IF NOT EXISTS broadcast_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES broadcast_groups(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE INDEX IF NOT EXISTS idx_broadcast_group_members_group_id ON broadcast_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_group_members_player_id ON broadcast_group_members(player_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_group_id ON broadcast_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_player_id ON broadcast_messages(player_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_created_at ON broadcast_messages(group_id, created_at DESC);

COMMENT ON TABLE broadcast_groups IS 'Named groups of players for broadcast communication';
COMMENT ON TABLE broadcast_group_members IS 'Player membership in broadcast groups';
COMMENT ON TABLE broadcast_messages IS 'Message history for broadcast groups';




