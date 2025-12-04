-- Fix missing created_at column in loop_steps table
-- This migration ensures the created_at column exists even if the table was created without it

-- Add created_at column if it doesn't exist
ALTER TABLE loop_steps ADD COLUMN IF NOT EXISTS created_at BIGINT;

-- Set default value for any null created_at values (use current timestamp)
UPDATE loop_steps SET created_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 WHERE created_at IS NULL;

-- Make it NOT NULL if it's not already
ALTER TABLE loop_steps ALTER COLUMN created_at SET NOT NULL;



