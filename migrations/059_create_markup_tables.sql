-- Migration 059: Create markup tables for custom conventions and built-in edits
-- This moves markup functionality from localStorage to database for scalability and ZORK access

-- Create markup_conventions table for custom markup conventions
CREATE TABLE IF NOT EXISTS markup_conventions (
    id SERIAL PRIMARY KEY,
    syntax TEXT NOT NULL,
    opening TEXT NOT NULL,
    closing TEXT NOT NULL,
    description TEXT,
    example TEXT,
    color TEXT,
    effects JSONB DEFAULT '{}',
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create markup_builtin_edits table for built-in convention edits
CREATE TABLE IF NOT EXISTS markup_builtin_edits (
    id SERIAL PRIMARY KEY,
    convention_key TEXT NOT NULL UNIQUE,
    syntax TEXT,
    example TEXT,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_markup_builtin_edits_key ON markup_builtin_edits(convention_key);
