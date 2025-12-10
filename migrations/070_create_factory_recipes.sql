-- Factory Recipes Table
-- Stores crafting recipes for factory machines
-- IMPORTANT: required_runes should NEVER include PRODUCTION runes
-- PRODUCTION runes are required by the machine itself, not by recipes
-- Only SPEED and EFFICIENCY runes can be specified in recipes

CREATE TABLE IF NOT EXISTS factory_recipes (
    recipe_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    
    -- Ingredient requirements: array of {item_id: int, quantity: int}
    -- These go in slots 0-1 (ingredient slots only)
    required_ingredients JSONB NOT NULL DEFAULT '[]',
    
    -- Optional rune requirements: array of rune types like ['SPEED', 'EFFICIENCY']
    -- NEVER include 'PRODUCTION' - that's a machine requirement, not recipe
    -- These map to slots 3-4 (speed/efficiency slots only)
    required_runes JSONB NOT NULL DEFAULT '[]',
    
    -- Output items: array of {item_id: int, quantity: int}
    output_items JSONB NOT NULL DEFAULT '[]',
    
    -- Base success rate (0-100 percentage)
    success_rate DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    
    -- Optional stat requirements: {stat_ingenuity: 10, stat_resonance: 5}
    -- Recipe fails if player doesn't meet these thresholds
    required_stats JSONB,
    
    -- Base crafting time in milliseconds
    crafting_time_ms INTEGER NOT NULL DEFAULT 5000,
    
    -- Fraction of ingredients returned on failure (0-1)
    return_rate_on_fail DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    
    -- Factory tier required (rooms have factory_tier)
    factory_tier_required INTEGER NOT NULL DEFAULT 1,
    
    -- Optional byproducts: [{item_id: int, quantity: int, chance: decimal}]
    -- These are extra items that may be produced alongside main output
    byproducts JSONB,
    
    -- Recipe matching flexibility flags
    -- allow_rune_substitution: runes can replace missing ingredients (future use)
    allow_rune_substitution BOOLEAN NOT NULL DEFAULT false,
    -- allow_wildcard_runes: accept any rune of required type in correct slot
    allow_wildcard_runes BOOLEAN NOT NULL DEFAULT false,
    
    -- Recipe status
    active BOOLEAN NOT NULL DEFAULT true,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Indexes for efficient recipe lookups
CREATE INDEX IF NOT EXISTS idx_factory_recipes_active ON factory_recipes(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_factory_recipes_tier ON factory_recipes(factory_tier_required);
CREATE INDEX IF NOT EXISTS idx_factory_recipes_name ON factory_recipes(name);

-- Add constraint to prevent PRODUCTION runes in required_runes
-- This is enforced at application level but we add a comment for documentation
COMMENT ON COLUMN factory_recipes.required_runes IS 'Array of rune types (SPEED, EFFICIENCY only). NEVER include PRODUCTION - that is a machine requirement.';

-- Seed a test recipe
INSERT INTO factory_recipes (name, description, required_ingredients, required_runes, output_items, success_rate, crafting_time_ms, return_rate_on_fail, factory_tier_required)
VALUES (
    'Basic Pulse Crystal',
    'Compress pulse resin into a crystallized form. Requires only ingredients, no special runes.',
    '[{"item_name": "Pulse Resin", "quantity": 5}]',
    '[]',
    '[{"item_name": "Pulse Crystal", "quantity": 1}]',
    75.00,
    8000,
    0.50,
    1
) ON CONFLICT (name) DO NOTHING;

-- Create the Pulse Crystal item if it doesn't exist
INSERT INTO items (name, description, item_type, active, poofable, encumbrance, created_at)
VALUES ('Pulse Crystal', 'A crystallized form of pulse energy. Useful in advanced crafting recipes.', 'ingredient', true, false, 2, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (name) DO NOTHING;

