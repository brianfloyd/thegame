--- Migration 025: Terminal History Persistence
--- Stores last 1000 lines of terminal output per player for persistence across sessions

CREATE TABLE IF NOT EXISTS terminal_history (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'info',
    message_html TEXT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE INDEX IF NOT EXISTS idx_terminal_history_player_id ON terminal_history(player_id);
CREATE INDEX IF NOT EXISTS idx_terminal_history_created_at ON terminal_history(player_id, created_at DESC);

COMMENT ON TABLE terminal_history IS 'Stores terminal output history for players. Last 1000 lines per player are kept. Noob character (flag_always_first_time) does not persist history.';


















