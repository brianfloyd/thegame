-- Migration 019: Create player_bank table for storing player currency

CREATE TABLE IF NOT EXISTS player_bank (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    currency_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(player_id, currency_name)
);

CREATE INDEX IF NOT EXISTS idx_player_bank_player_id ON player_bank(player_id);

COMMENT ON TABLE player_bank IS 'Stores player currency in bank. Bank storage does not affect encumbrance.';

















