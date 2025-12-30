-- Migration 089: Merchant Editor System
-- Creates tables for merchant NPCs (dialogue only), merchant greetings, pricing formulas, and room formula overrides

-- Merchants table (for NPC dialogue only - inventory is room-based)
CREATE TABLE IF NOT EXISTS merchants (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER NOT NULL UNIQUE REFERENCES scriptable_npcs(id) ON DELETE CASCADE,
    engagement_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    engagement_delay INTEGER NOT NULL DEFAULT 3000,
    initial_message TEXT,
    initial_message_color TEXT DEFAULT '#00ffff',
    keywords_responses JSONB DEFAULT '{}',
    keyword_color TEXT DEFAULT '#ff00ff',
    incorrect_response TEXT DEFAULT 'I do not understand what you mean.',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_npc_id ON merchants(npc_id);

-- Merchant greetings table (tracks player greetings)
CREATE TABLE IF NOT EXISTS merchant_greetings (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    npc_id INTEGER NOT NULL REFERENCES scriptable_npcs(id) ON DELETE CASCADE,
    first_greeted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_greeted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(player_id, npc_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_greetings_player_id ON merchant_greetings(player_id);
CREATE INDEX IF NOT EXISTS idx_merchant_greetings_npc_id ON merchant_greetings(npc_id);

-- Merchant pricing formula config (global formula)
CREATE TABLE IF NOT EXISTS merchant_pricing_formula_config (
    config_key TEXT PRIMARY KEY,
    config_value JSONB NOT NULL,
    description TEXT
);

-- Merchant room formula overrides (per-room formula overrides)
CREATE TABLE IF NOT EXISTS merchant_room_formula_overrides (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
    formula_config JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_room_formula_overrides_room_id ON merchant_room_formula_overrides(room_id);

-- Add min_qty field to merchant_items if it doesn't exist
ALTER TABLE merchant_items ADD COLUMN IF NOT EXISTS min_qty INTEGER;




