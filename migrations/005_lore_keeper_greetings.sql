-- Track which Lore Keepers have greeted which players (persists across sessions)
CREATE TABLE IF NOT EXISTS lore_keeper_greetings (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    npc_id INTEGER NOT NULL REFERENCES scriptable_npcs(id) ON DELETE CASCADE,
    first_greeted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_greeted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(player_id, npc_id)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_lore_keeper_greetings_player_npc ON lore_keeper_greetings(player_id, npc_id);



















