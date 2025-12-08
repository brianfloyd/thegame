-- Migration 061: Debug Observer System
-- Enables ZORK to observe bugs and create rich debug todos for Cursor to fix

-- Debug sessions (tracks active observation sessions)
CREATE TABLE IF NOT EXISTS debug_sessions (
    id SERIAL PRIMARY KEY,
    player_id INT REFERENCES players(id) ON DELETE CASCADE,
    bug_label TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Debug todos (rich bug reports created by ZORK)
CREATE TABLE IF NOT EXISTS debug_todos (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES debug_sessions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open',  -- open, in_progress, resolved
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    repro_steps TEXT,
    environment JSONB,       -- {map, room, widget, browser, playerName}
    logs JSONB,              -- {consoleErrors: [], clientStates: [], wsMessages: []}
    resolution_notes TEXT,
    created_by TEXT DEFAULT 'zork',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_debug_todos_status ON debug_todos(status);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_active ON debug_sessions(active);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_player ON debug_sessions(player_id);

-- Comments for documentation
COMMENT ON TABLE debug_sessions IS 'Tracks active debug observation sessions where ZORK watches player telemetry';
COMMENT ON TABLE debug_todos IS 'Rich bug reports created by ZORK from debug observation sessions, for Cursor to fix';
COMMENT ON COLUMN debug_todos.status IS 'open = new bug, in_progress = being worked on, resolved = fixed';
COMMENT ON COLUMN debug_todos.environment IS 'JSON with map, room, widgets, browser, playerName context';
COMMENT ON COLUMN debug_todos.logs IS 'JSON with consoleErrors, clientStates, wsMessages arrays';

