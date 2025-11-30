-- PostgreSQL Schema Migration
-- Creates all core tables for the game

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Maps table
CREATE TABLE IF NOT EXISTS maps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    description TEXT
);

-- Rooms table with coordinate-based map system
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    map_id INTEGER NOT NULL REFERENCES maps(id),
    connected_map_id INTEGER REFERENCES maps(id),
    connected_room_x INTEGER,
    connected_room_y INTEGER,
    connection_direction TEXT,
    room_type TEXT NOT NULL DEFAULT 'normal',
    UNIQUE(map_id, x, y)
);

-- Players table with prefix-based column naming for dynamic stats
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    current_room_id INTEGER NOT NULL REFERENCES rooms(id),
    -- Stats (attributes)
    stat_brute_strength INTEGER NOT NULL DEFAULT 10,
    stat_life_force INTEGER NOT NULL DEFAULT 10,
    stat_cunning INTEGER NOT NULL DEFAULT 10,
    stat_intelligence INTEGER NOT NULL DEFAULT 10,
    stat_wisdom INTEGER NOT NULL DEFAULT 10,
    -- Abilities
    ability_crafting INTEGER NOT NULL DEFAULT 0,
    ability_lockpicking INTEGER NOT NULL DEFAULT 0,
    ability_stealth INTEGER NOT NULL DEFAULT 0,
    ability_dodge INTEGER NOT NULL DEFAULT 0,
    ability_critical_hit INTEGER NOT NULL DEFAULT 0,
    -- Resources
    resource_hit_points INTEGER NOT NULL DEFAULT 50,
    resource_max_hit_points INTEGER NOT NULL DEFAULT 50,
    resource_mana INTEGER NOT NULL DEFAULT 0,
    resource_max_mana INTEGER NOT NULL DEFAULT 0,
    resource_max_encumbrance INTEGER NOT NULL DEFAULT 100,
    -- Flags
    flag_god_mode INTEGER NOT NULL DEFAULT 0
);

-- Scriptable NPCs table (NPC definitions)
CREATE TABLE IF NOT EXISTS scriptable_npcs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    npc_type TEXT NOT NULL,
    base_cycle_time INTEGER NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 1,
    required_stats TEXT,
    required_buffs TEXT,
    input_items TEXT,
    output_items TEXT,
    failure_states TEXT,
    display_color TEXT DEFAULT '#00ff00',
    scriptable BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    harvestable_time INTEGER NOT NULL DEFAULT 60000,
    cooldown_time INTEGER NOT NULL DEFAULT 120000
);

-- Unique index on NPC names
CREATE UNIQUE INDEX IF NOT EXISTS idx_scriptable_npcs_name ON scriptable_npcs(name);

-- Room NPCs table (NPC placements in rooms)
CREATE TABLE IF NOT EXISTS room_npcs (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER NOT NULL REFERENCES scriptable_npcs(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    state TEXT NOT NULL DEFAULT '{}',
    last_cycle_run BIGINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    slot INTEGER NOT NULL DEFAULT 0,
    spawn_rules TEXT
);

-- Items table (master item definitions)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    item_type TEXT NOT NULL DEFAULT 'sundries',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    poofable BOOLEAN NOT NULL DEFAULT FALSE,
    encumbrance INTEGER NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
);

-- Room items table (items on the ground in rooms)
CREATE TABLE IF NOT EXISTS room_items (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
);

-- Player items table (player inventory)
CREATE TABLE IF NOT EXISTS player_items (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
);

-- Room type colors table
CREATE TABLE IF NOT EXISTS room_type_colors (
    room_type TEXT PRIMARY KEY,
    color TEXT NOT NULL DEFAULT '#00ff00'
);






