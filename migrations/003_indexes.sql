-- Performance Indexes Migration

-- Room NPCs indexes
CREATE INDEX IF NOT EXISTS idx_room_npcs_room_id ON room_npcs(room_id);
CREATE INDEX IF NOT EXISTS idx_room_npcs_npc_id ON room_npcs(npc_id);
CREATE INDEX IF NOT EXISTS idx_room_npcs_active ON room_npcs(active);

-- Room items index
CREATE INDEX IF NOT EXISTS idx_room_items_room_id ON room_items(room_id);

-- Player items index
CREATE INDEX IF NOT EXISTS idx_player_items_player_id ON player_items(player_id);

-- Rooms indexes
CREATE INDEX IF NOT EXISTS idx_rooms_map_id ON rooms(map_id);
CREATE INDEX IF NOT EXISTS idx_rooms_coords ON rooms(map_id, x, y);

-- Players index
CREATE INDEX IF NOT EXISTS idx_players_current_room ON players(current_room_id);






















