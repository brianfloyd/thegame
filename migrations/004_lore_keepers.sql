-- Lore Keepers table for narrative-driven NPCs
-- Linked to scriptable_npcs table via foreign key

CREATE TABLE IF NOT EXISTS lore_keepers (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER NOT NULL UNIQUE REFERENCES scriptable_npcs(id) ON DELETE CASCADE,
    
    -- Core Lore Keeper settings
    lore_type TEXT NOT NULL CHECK (lore_type IN ('dialogue', 'puzzle')),
    engagement_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    engagement_delay INTEGER NOT NULL DEFAULT 3000,
    
    -- Initial engagement message (sent after delay when player enters room)
    initial_message TEXT,
    initial_message_color TEXT DEFAULT '#00ffff',
    
    -- Dialogue type fields
    -- keywords_responses is JSON: { "keyword1": "response1", "keyword2": "response2", ... }
    keywords_responses TEXT,
    keyword_color TEXT DEFAULT '#ff00ff',
    incorrect_response TEXT DEFAULT 'I do not understand what you mean.',
    
    -- Puzzle type fields
    puzzle_mode TEXT CHECK (puzzle_mode IN ('word', 'combination', 'cipher')),
    puzzle_clues TEXT,  -- JSON array: ["clue1", "clue2", ...]
    puzzle_solution TEXT,
    puzzle_success_message TEXT,
    puzzle_failure_message TEXT DEFAULT 'That is not the answer I seek.',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for quick lookup by NPC ID
CREATE INDEX IF NOT EXISTS idx_lore_keepers_npc_id ON lore_keepers(npc_id);









