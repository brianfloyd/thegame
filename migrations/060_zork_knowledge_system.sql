-- Migration 060: ZORK RAG Knowledge System
-- Creates vectorized knowledge base with pgvector for semantic search
-- Note: If pgvector is not available, table will be created without vector column
--       Vector support can be added later when pgvector is installed via migration 061

-- Try to enable pgvector extension (will fail gracefully if not available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
        RAISE NOTICE 'pgvector extension enabled successfully';
    ELSE
        RAISE WARNING 'pgvector extension is not available. Vector features will be disabled.';
        RAISE WARNING 'To enable: For Railway PostgreSQL, pgvector is available by default.';
        RAISE WARNING 'For local dev: Install pgvector extension (may require compilation).';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Could not enable pgvector extension: %. Continuing without vector support.', SQLERRM;
END $$;

-- Create knowledge table (without embedding column initially)
CREATE TABLE IF NOT EXISTS zork_knowledge (
  id SERIAL PRIMARY KEY,
  
  -- Categorization (Chuck's refined structure)
  category TEXT NOT NULL,           -- 'core_identity', 'command_knowledge', 'world_lore', 'interaction_patterns', 'learned_context'
  subcategory TEXT,                 -- e.g., 'markup', 'transportation', 'npc', 'persona_chuck', 'persona_zork'
  
  -- Content
  title TEXT NOT NULL,              -- Short descriptive title
  content TEXT NOT NULL,            -- The actual knowledge chunk
  
  -- Priority system:
  -- 0 = contextual (semantic search only)
  -- 1 = important (loads when category is relevant)  
  -- 2 = always-include (bypasses similarity search, always in context)
  priority INTEGER DEFAULT 0,
  
  -- Source tracking for bidirectional learning
  source TEXT DEFAULT 'system',     -- 'system' (initial migration), 'zork' (learned in-game), 'cursor' (added via MCP)
  added_by TEXT,                    -- Player/user who added this knowledge
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
  
  -- Note: embedding vector(1536) column will be added in migration 061 if pgvector is available
);

-- Add vector column and index if pgvector is available (separate DO block for clarity)
DO $$
DECLARE
    has_vector_extension BOOLEAN;
BEGIN
    -- Check if vector extension exists
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') INTO has_vector_extension;
    
    IF has_vector_extension THEN
        -- Check if embedding column already exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'
        ) THEN
            -- Add vector column
            ALTER TABLE zork_knowledge ADD COLUMN embedding vector(1536);
            RAISE NOTICE 'Added vector(1536) column to zork_knowledge table';
        END IF;
        
        -- Create vector index (only if column exists)
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'
        ) THEN
            DROP INDEX IF EXISTS idx_zork_knowledge_embedding;
            CREATE INDEX idx_zork_knowledge_embedding 
              ON zork_knowledge USING ivfflat (embedding vector_cosine_ops) 
              WITH (lists = 100);
            RAISE NOTICE 'Vector index created successfully';
        END IF;
    ELSE
        RAISE NOTICE 'pgvector not available - skipping vector column. Add via: ALTER TABLE zork_knowledge ADD COLUMN embedding vector(1536);';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error adding vector support: %. Table created without vector column.', SQLERRM;
END $$;

-- Index for category and priority filtering (fast lookups for always-include chunks)
CREATE INDEX IF NOT EXISTS idx_zork_knowledge_category_priority 
  ON zork_knowledge (category, priority, active);

-- Index for source tracking
CREATE INDEX IF NOT EXISTS idx_zork_knowledge_source 
  ON zork_knowledge (source);

-- Comment on table
COMMENT ON TABLE zork_knowledge IS 'ZORK RAG Knowledge System - vectorized knowledge base shared between ZORK (in-game) and Cursor (MCP). Vector support requires pgvector extension.';

-- Comments on columns
COMMENT ON COLUMN zork_knowledge.category IS 'Knowledge category: core_identity, command_knowledge, world_lore, interaction_patterns, learned_context';
COMMENT ON COLUMN zork_knowledge.priority IS '0=contextual (semantic search), 1=important (category-relevant), 2=always-include (bypasses search)';
COMMENT ON COLUMN zork_knowledge.source IS 'Origin: system (initial migration), zork (learned in-game), cursor (added via MCP)';

-- Comment on embedding column (only if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'
    ) THEN
        COMMENT ON COLUMN zork_knowledge.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions). Requires pgvector extension.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if column doesn't exist
END $$;
