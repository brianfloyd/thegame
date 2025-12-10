-- Factory Events Table
-- Logs factory crafting events for analytics and future automation hooks
-- Events can be used to trigger automation, track player activity, etc.

CREATE TABLE IF NOT EXISTS factory_events (
    id SERIAL PRIMARY KEY,
    
    -- Event type identifier
    -- FACTORY_CRAFT_STARTED: Player initiated crafting
    -- FACTORY_CRAFT_SUCCESS: Craft completed successfully
    -- FACTORY_CRAFT_FAILED: Craft failed
    -- FACTORY_CRAFT_CRITICAL: Critical success (bonus output)
    -- FACTORY_CRAFT_FIZZLE: Invalid recipe, no craft attempted
    -- FACTORY_OUTPUT_CREATED: Item was created (for automation hooks)
    event_type TEXT NOT NULL,
    
    -- Factory room where event occurred
    factory_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    
    -- Player who triggered the event
    player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    
    -- Recipe used (if applicable)
    recipe_id INTEGER REFERENCES factory_recipes(recipe_id) ON DELETE SET NULL,
    
    -- Item involved (for OUTPUT_CREATED events)
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    
    -- Quantity of items (for OUTPUT_CREATED events)
    quantity INTEGER,
    
    -- Additional event metadata (flexible JSON)
    -- Can include: success_rate, crit_chance, quirk_applied, ingredients_used, etc.
    metadata JSONB,
    
    -- Event timestamp
    timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Indexes for efficient event queries
CREATE INDEX IF NOT EXISTS idx_factory_events_type ON factory_events(event_type);
CREATE INDEX IF NOT EXISTS idx_factory_events_player ON factory_events(player_id);
CREATE INDEX IF NOT EXISTS idx_factory_events_room ON factory_events(factory_room_id);
CREATE INDEX IF NOT EXISTS idx_factory_events_timestamp ON factory_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_factory_events_recipe ON factory_events(recipe_id);

-- Composite index for common queries (player events by time)
CREATE INDEX IF NOT EXISTS idx_factory_events_player_time ON factory_events(player_id, timestamp DESC);

-- Add check constraint for valid event types
ALTER TABLE factory_events DROP CONSTRAINT IF EXISTS factory_events_type_check;
ALTER TABLE factory_events ADD CONSTRAINT factory_events_type_check 
    CHECK (event_type IN (
        'FACTORY_CRAFT_STARTED',
        'FACTORY_CRAFT_SUCCESS',
        'FACTORY_CRAFT_FAILED',
        'FACTORY_CRAFT_CRITICAL',
        'FACTORY_CRAFT_FIZZLE',
        'FACTORY_OUTPUT_CREATED'
    ));

-- Add comment for documentation
COMMENT ON TABLE factory_events IS 'Logs factory crafting events for analytics and automation hooks.';

