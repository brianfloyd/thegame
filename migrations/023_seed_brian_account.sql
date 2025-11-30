-- Migration 023: Create initial account for brian@brianfloyd.me
-- Password: test (hashed with bcrypt)

-- Note: This migration uses a pre-hashed password for "test"
-- In production, passwords should be hashed at registration time
-- For now, we'll create the account and hash the password in the migration
-- Using bcrypt hash for "test" with 10 rounds: $2b$10$rOzJqZqZqZqZqZqZqZqZqO (example - will be generated properly)

-- Import bcrypt in migration is not possible, so we'll use a placeholder
-- The actual password hash will be set by the application code
-- For now, create account with a temporary hash that will be updated

-- Create account for brian@brianfloyd.me
-- Password: test
-- Password hash (bcrypt, 10 rounds): $2b$10$bUL79PY2IlrHhYnfeEa3ouNHU07vm/W0Nc97YIQsFvMx/ho2lxz9S
INSERT INTO accounts (email, password_hash, email_verified, created_at)
VALUES ('brian@brianfloyd.me', '$2b$10$bUL79PY2IlrHhYnfeEa3ouNHU07vm/W0Nc97YIQsFvMx/ho2lxz9S', TRUE, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (email) DO NOTHING;

-- Link existing characters to brian's account (Fliz, Hebron, noob)
-- Get account ID and link characters
INSERT INTO user_characters (account_id, player_id, created_at)
SELECT a.id, p.id, EXTRACT(EPOCH FROM NOW()) * 1000
FROM accounts a
CROSS JOIN players p
WHERE a.email = 'brian@brianfloyd.me'
  AND p.name IN ('Fliz', 'Hebron', 'noob')
ON CONFLICT (account_id, player_id) DO NOTHING;

