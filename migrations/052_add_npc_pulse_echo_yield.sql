-- Migration 052: Add Pulse Echo Yield to NPCs
-- Adds pulse_echo_yield column to scriptable_npcs table

ALTER TABLE scriptable_npcs ADD COLUMN IF NOT EXISTS pulse_echo_yield INTEGER NOT NULL DEFAULT 1;