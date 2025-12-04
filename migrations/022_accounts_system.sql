-- Migration 022: Add accounts system with email/password authentication

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    last_login_at BIGINT,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);

-- Create user_characters table (links accounts to players/characters)
CREATE TABLE IF NOT EXISTS user_characters (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    UNIQUE(account_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_characters_account_id ON user_characters(account_id);
CREATE INDEX IF NOT EXISTS idx_user_characters_player_id ON user_characters(player_id);

COMMENT ON TABLE accounts IS 'User accounts with email/password authentication. Ready for email verification in future.';
COMMENT ON TABLE user_characters IS 'Links accounts to player characters. One account can have multiple characters.';

















