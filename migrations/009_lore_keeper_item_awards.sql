-- Track items awarded by Lore Keepers to players
-- This distinguishes items awarded by NPCs from items found/dropped by other players

CREATE TABLE IF NOT EXISTS lore_keeper_item_awards (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    npc_id INTEGER NOT NULL REFERENCES scriptable_npcs(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    awarded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Ensure a player can only receive a specific item from a specific Lore Keeper once
    UNIQUE(player_id, npc_id, item_name)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_lore_keeper_awards_player_npc ON lore_keeper_item_awards(player_id, npc_id);
CREATE INDEX IF NOT EXISTS idx_lore_keeper_awards_player_item ON lore_keeper_item_awards(player_id, item_name);

