# Autonomous Knowledge System - Canonical Specification

**Source of Truth:** This document reflects the actual implementation in the codebase as of the last update. All findings are code-verified.

---

## 1. Schema / Source of Truth

### Database Table: `zork_knowledge`

**Migration:** `migrations/060_zork_knowledge_system.sql:23-52`

```sql
CREATE TABLE zork_knowledge (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),  -- Optional, requires pgvector extension
  priority INTEGER DEFAULT 0,
  source TEXT DEFAULT 'system',
  added_by TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
```

**Field Details:**
- `id`: SERIAL PRIMARY KEY - Auto-incrementing unique identifier
- `category`: TEXT NOT NULL - Required category (see categories below)
- `subcategory`: TEXT - Optional subcategory for organization
- `title`: TEXT NOT NULL - Required short descriptive title
- `content`: TEXT NOT NULL - Required knowledge content
- `embedding`: vector(1536) - Optional OpenAI embedding vector (1536 dimensions)
  - Requires `pgvector` extension
  - Added conditionally in migration `060_zork_knowledge_system.sql:54-90`
  - If pgvector unavailable, column is not created
- `priority`: INTEGER DEFAULT 0 - Priority level (0, 1, or 2)
- `source`: TEXT DEFAULT 'system' - Origin: 'system', 'zork', or 'cursor'
- `added_by`: TEXT - Optional user/player identifier
- `active`: BOOLEAN DEFAULT TRUE - Soft delete flag
- `created_at`: BIGINT - Unix timestamp in milliseconds
- `updated_at`: BIGINT - Unix timestamp in milliseconds

**Indexes:**
- `idx_zork_knowledge_category_priority` on `(category, priority, active)` - `migrations/060_zork_knowledge_system.sql:93-94`
- `idx_zork_knowledge_source` on `(source)` - `migrations/060_zork_knowledge_system.sql:97-98`
- `idx_zork_knowledge_embedding` on `embedding` (ivfflat index) - `migrations/060_zork_knowledge_system.sql:78-82` (conditional, requires pgvector)

**Vector Support:**
- pgvector extension checked and enabled if available - `migrations/060_zork_knowledge_system.sql:7-20`
- Embedding column added conditionally - `migrations/060_zork_knowledge_system.sql:63-71`
- Vector index created if column exists - `migrations/060_zork_knowledge_system.sql:73-82`
- System gracefully degrades to keyword search if pgvector unavailable

---

## 2. All Fields, Defaults, Nullability, Constraints

### Required Fields
- `category`: TEXT NOT NULL - No default, must be provided
- `title`: TEXT NOT NULL - No default, must be provided
- `content`: TEXT NOT NULL - No default, must be provided

### Optional Fields with Defaults
- `subcategory`: TEXT - NULL allowed, no default
- `embedding`: vector(1536) - NULL allowed, only if pgvector available
- `priority`: INTEGER DEFAULT 0 - Defaults to 0 if not specified
- `source`: TEXT DEFAULT 'system' - Defaults to 'system'
- `added_by`: TEXT - NULL allowed, no default
- `active`: BOOLEAN DEFAULT TRUE - Defaults to TRUE
- `created_at`: BIGINT - Auto-generated from `EXTRACT(EPOCH FROM NOW()) * 1000`
- `updated_at`: BIGINT - Auto-generated from `EXTRACT(EPOCH FROM NOW()) * 1000`

### Constraints
- No explicit CHECK constraints on category values (enforced in application code)
- No explicit CHECK constraints on priority values (enforced in application code: 0, 1, or 2)
- No explicit CHECK constraints on source values (enforced in application code: 'system', 'zork', 'cursor')
- `active` defaults to TRUE (soft delete pattern)

### Validation Rules (Application-Level)
- Category must be one of: `core_identity`, `command_knowledge`, `world_lore`, `interaction_patterns`, `learned_context`, `system_docs`, `game_design`, `technical`
  - Validated in: `scripts/add-feature-knowledge.js:28-31`
  - Validated in: `mcp-test-server/tools/knowledge.js:122-124` (via description)
- Priority must be 0, 1, or 2
  - Validated in: `scripts/add-feature-knowledge.js:34-36`
  - Validated in: `mcp-test-server/tools/knowledge.js:132` (via description)

---

## 3. All Subsystem Operations (Read/Write/Mutate)

### Write Operations

#### `addZorkKnowledge(category, subcategory, title, content, embedding, priority, source, addedBy)`
**Location:** `database.js:2908-2958`

**Parameters:**
- `category`: TEXT (required)
- `subcategory`: TEXT (optional, can be null)
- `title`: TEXT (required)
- `content`: TEXT (required)
- `embedding`: Array[number] or string (optional)
- `priority`: INTEGER (default: 0)
- `source`: TEXT (default: 'system')
- `added_by`: TEXT (optional, can be null)

**Behavior:**
1. Checks if embedding column exists - `database.js:2910-2916`
2. Formats embedding for PostgreSQL vector type if available - `database.js:2918-2932`
3. Builds INSERT query conditionally based on embedding column existence - `database.js:2934-2954`
4. If embedding column exists and embedding provided:
   - Uses `$5::vector` cast for vector type - `database.js:2940-2943`
   - Or stores as JSON if not vector type - `database.js:2944-2948`
5. If no embedding column or no embedding:
   - Omits embedding from INSERT - `database.js:2950-2954`
6. Auto-generates `created_at` and `updated_at` timestamps - `database.js:2941,2946,2952`
7. Sets `active = TRUE` by default - `database.js:2941,2946,2952`
8. Returns inserted row - `database.js:2956-2957`

**Atomicity:** Single INSERT statement (atomic)

#### `updateZorkKnowledge(id, updates)`
**Location:** `database.js:2963-3011`

**Parameters:**
- `id`: INTEGER (required)
- `updates`: Object with optional fields: `category`, `subcategory`, `title`, `content`, `embedding`, `priority`, `source`, `active`

**Behavior:**
1. Builds dynamic UPDATE query based on provided fields - `database.js:2964-2999`
2. Always updates `updated_at` timestamp - `database.js:3002`
3. Returns updated row or null if not found - `database.js:3006-3010`

**Atomicity:** Single UPDATE statement (atomic)

#### `deleteZorkKnowledge(id)` (Soft Delete)
**Location:** `database.js:3109-3115`

**Behavior:**
1. Sets `active = FALSE` - `database.js:3111`
2. Updates `updated_at` timestamp - `database.js:3111`
3. Returns deleted row or null - `database.js:3114`

**Atomicity:** Single UPDATE statement (atomic)

### Read Operations

#### `searchZorkKnowledge(queryEmbedding, limit, threshold, category, priority)`
**Location:** `database.js:3016-3071`

**Parameters:**
- `queryEmbedding`: Array[number] (optional, for semantic search)
- `limit`: INTEGER (default: 10)
- `threshold`: FLOAT (default: 0.7, cosine similarity threshold)
- `category`: TEXT (optional filter)
- `priority`: INTEGER (optional filter, >= priority)

**Behavior:**
1. Checks if embedding column exists - `database.js:3018-3023`
2. If vector column exists and queryEmbedding provided:
   - Uses vector similarity search with `<=>` operator (cosine distance) - `database.js:3025-3050`
   - Filters by threshold: `distance <= (1 - threshold)` - `database.js:3050`
   - Orders by distance (ascending) - `database.js:3045`
3. If no vector column or no queryEmbedding:
   - Falls back to keyword search on title and content using `ILIKE` - `database.js:3052-3069`
   - Uses `%query%` pattern matching - `database.js:3057`
4. Applies category and priority filters if provided - `database.js:3035-3043,3059-3062`
5. Limits results - `database.js:3045,3067`
6. Only returns active knowledge (`active = TRUE`) - `database.js:3030,3056`

**Atomicity:** Single SELECT statement (atomic)

#### `getZorkKnowledgeByCategory(category, priority)`
**Location:** `database.js:3076-3088`

**Parameters:**
- `category`: TEXT (required)
- `priority`: INTEGER (optional, exact match)

**Behavior:**
1. Filters by category and optional priority - `database.js:3077-3083`
2. Orders by priority DESC, then created_at DESC - `database.js:3085`
3. Only returns active knowledge - `database.js:3077`

**Atomicity:** Single SELECT statement (atomic)

#### `getAlwaysIncludeKnowledge()`
**Location:** `database.js:3100-3104`

**Behavior:**
1. Returns all knowledge with `priority = 2` - `database.js:3102`
2. Orders by category, then created_at DESC - `database.js:3102`
3. Only returns active knowledge - `database.js:3102`

**Atomicity:** Single SELECT statement (atomic)

#### `getZorkKnowledgeById(id)`
**Location:** `database.js:3093-3095`

**Behavior:**
1. Returns single knowledge chunk by ID - `database.js:3094`
2. Does NOT filter by active (can retrieve soft-deleted chunks)

**Atomicity:** Single SELECT statement (atomic)

---

## 4. Validations + Missing Validations

### Validations Enforced

**Category Validation:**
- Enforced in: `scripts/add-feature-knowledge.js:28-31`
- Valid categories: `['game_design', 'technical', 'world_lore', 'system_docs', 'command_knowledge', 'learned_context', 'core_identity', 'interaction_patterns']`
- **NOT enforced in database** (no CHECK constraint)
- **NOT enforced in MCP tools** (relies on description/documentation)

**Priority Validation:**
- Enforced in: `scripts/add-feature-knowledge.js:34-36`
- Valid values: 0, 1, or 2
- **NOT enforced in database** (no CHECK constraint)
- **NOT enforced in MCP tools** (relies on description/documentation)

**Required Fields:**
- `category`, `title`, `content` are NOT NULL in database schema - `migrations/060_zork_knowledge_system.sql:27,31,32`
- Enforced at database level (PostgreSQL NOT NULL constraint)

**Embedding Format:**
- Validated in: `database.js:2921-2932`
- Must be array of numbers if provided
- Formatted as `[0.1,0.2,...]` string for PostgreSQL vector type

### Missing Validations

1. **Category values not enforced in database:**
   - No CHECK constraint on `category` column
   - Invalid categories can be inserted via direct SQL
   - **Risk:** Data integrity issues if invalid categories inserted

2. **Priority values not enforced in database:**
   - No CHECK constraint on `priority` column
   - Values outside 0-2 can be inserted
   - **Risk:** Unexpected behavior in retrieval logic

3. **Source values not enforced in database:**
   - No CHECK constraint on `source` column
   - Any string can be inserted
   - **Risk:** Inconsistent source tracking

4. **Title/Content length limits:**
   - No maximum length constraints
   - **Risk:** Very large knowledge chunks could impact performance

5. **Embedding dimension validation:**
   - No validation that embedding array has exactly 1536 elements
   - **Risk:** Invalid embeddings could cause vector search errors

6. **Subcategory validation:**
   - No validation that subcategory is appropriate for category
   - **Risk:** Inconsistent categorization

---

## 5. Behavioral Rules / Invariants

### Priority System

**Priority 0 (Contextual):**
- Retrieved via semantic search only (if embeddings available)
- Not loaded by category-based retrieval
- Used for contextual relevance matching
- **Enforced in:** `scripts/zork-ai-agent.cjs:1114-1135` (semantic search for priority 0)

**Priority 1 (Important):**
- Loaded when category keywords match message content
- Keyword-triggered retrieval
- **Enforced in:** `scripts/zork-ai-agent.cjs:1140-1191` (category-based retrieval for priority 1)

**Priority 2 (Always-Include):**
- Always loaded first, regardless of query
- Bypasses similarity search
- **Enforced in:** `scripts/zork-ai-agent.cjs:1094-1103` (always loaded first)

### Source Tracking

**Sources:**
- `'system'`: Initial migration/seeding - `migrations/060_zork_knowledge_system.sql:41`
- `'zork'`: Learned in-game via `learnKnowledge` action - `scripts/zork-ai-agent.cjs:2594`
- `'cursor'`: Added via MCP tools - `mcp-test-server/tools/knowledge.js:363,371`

**Invariant:** Source should accurately reflect origin, but not enforced in database.

### Active Flag (Soft Delete)

**Invariant:** All read operations (except `getZorkKnowledgeById`) filter by `active = TRUE`
- Enforced in: `database.js:3030,3056,3077,3102` (all search/list functions)
- **Exception:** `getZorkKnowledgeById` does NOT filter by active - `database.js:3094`

**Soft Delete Pattern:**
- Deletes set `active = FALSE` - `database.js:3111`
- Never physically deleted from database
- Can be restored by setting `active = TRUE`

### Embedding Generation

**Invariant:** Embeddings are generated automatically when:
1. Knowledge added via MCP `knowledge_add` tool (if OpenAI available) - `mcp-test-server/tools/knowledge.js:339-346`
2. Knowledge added via `storeKnowledgeWithEmbedding` utility - `utils/zorkKnowledge.js:112-139`
3. Knowledge updated via MCP `knowledge_update` tool (if content changed) - `mcp-test-server/tools/knowledge.js:430-450`

**Fallback:** If embedding generation fails or OpenAI unavailable:
- Knowledge stored without embedding - `mcp-test-server/tools/knowledge.js:344-345`
- System falls back to keyword search - `database.js:3052-3069`

**Embedding Model:** `text-embedding-3-small` (1536 dimensions)
- Defined in: `utils/zorkKnowledge.js:21`
- Defined in: `mcp-test-server/tools/knowledge.js:26`

---

## 6. State Transitions (with file references)

### Knowledge Lifecycle

**Creation:**
1. Knowledge added via:
   - MCP tool `knowledge_add` - `mcp-test-server/tools/knowledge.js:329-387`
   - ZORK action `learnKnowledge` - `scripts/zork-ai-agent.cjs:2592-2623`
   - Helper script `add-feature-knowledge.js` - `scripts/add-feature-knowledge.js:44-53`
   - Direct database call `addZorkKnowledge` - `database.js:2908-2958`
2. Embedding generated (if OpenAI available) - `mcp-test-server/tools/knowledge.js:339-346`
3. Row inserted with `active = TRUE` - `database.js:2941,2946,2952`
4. Timestamps auto-generated - `database.js:2941,2946,2952`

**Update:**
1. Knowledge updated via:
   - MCP tool `knowledge_update` - `mcp-test-server/tools/knowledge.js:389-475`
   - Direct database call `updateZorkKnowledge` - `database.js:2963-3011`
2. If content changed, embedding regenerated - `mcp-test-server/tools/knowledge.js:430-450`
3. `updated_at` timestamp updated - `database.js:3002, mcp-test-server/tools/knowledge.js:452`
4. Row remains `active = TRUE` (unless explicitly set to FALSE)

**Soft Delete:**
1. Knowledge deleted via:
   - MCP tool `knowledge_delete` - `mcp-test-server/tools/knowledge.js:477-497`
   - Direct database call `deleteZorkKnowledge` - `database.js:3109-3115`
2. `active` set to `FALSE` - `database.js:3111, mcp-test-server/tools/knowledge.js:481`
3. `updated_at` timestamp updated - `database.js:3111, mcp-test-server/tools/knowledge.js:481`
4. Row never physically deleted

**Retrieval:**
1. Always-include (priority 2) loaded first - `scripts/zork-ai-agent.cjs:1094-1103`
2. Semantic search for contextual (priority 0) - `scripts/zork-ai-agent.cjs:1114-1135`
3. Category-based retrieval for important (priority 1) - `scripts/zork-ai-agent.cjs:1137-1191`
4. Learned context search (all priorities) - `scripts/zork-ai-agent.cjs:1193-1214`
5. Results filtered by `active = TRUE` - `database.js:3030,3056,3077,3102`

---

## 7. Interactions with Other Systems

### MCP Server Integration

**MCP Tools:** `mcp-test-server/tools/knowledge.js:46-186`
- `knowledge_search`: Semantic/keyword search - `mcp-test-server/tools/knowledge.js:48-72`
- `knowledge_list`: List by category/priority - `mcp-test-server/tools/knowledge.js:74-93`
- `knowledge_get`: Get by ID - `mcp-test-server/tools/knowledge.js:95-107`
- `knowledge_add`: Add new knowledge - `mcp-test-server/tools/knowledge.js:109-137`
- `knowledge_update`: Update existing - `mcp-test-server/tools/knowledge.js:139-171`
- `knowledge_delete`: Soft delete - `mcp-test-server/tools/knowledge.js:173-185`

**Tool Handler:** `mcp-test-server/tools/knowledge.js:188-511`
- Routes tool calls to appropriate handler - `mcp-test-server/tools/knowledge.js:190-504`
- Uses `StateVerifier` for database access - `mcp-test-server/tools/knowledge.js:12`
- Generates embeddings via OpenAI if available - `mcp-test-server/tools/knowledge.js:32-44`

**MCP Server Registration:** `mcp-test-server/index.js:23,48,87-88`
- Tools exported and registered - `mcp-test-server/index.js:23,48`
- Handler called for `knowledge_*` tools - `mcp-test-server/index.js:87-88`

### ZORK AI Agent Integration

**Knowledge Retrieval:** `scripts/zork-ai-agent.cjs:1090-1267`
- `getRelevantKnowledge(message, speakerIsGod)` - `scripts/zork-ai-agent.cjs:1090`
- Called during context building - `scripts/zork-ai-agent.cjs:1274`
- Uses `database.js` functions for retrieval - `scripts/zork-ai-agent.cjs:1095,1116,1143,1161,1179,1180,1196,1218`

**Knowledge Learning:** `scripts/zork-ai-agent.cjs:2592-2623`
- ZORK can learn via `learnKnowledge` or `addZorkKnowledge` actions
- Uses `storeKnowledgeWithEmbedding` utility - `scripts/zork-ai-agent.cjs:2601,2605-2614`
- Defaults: `category='learned_context'`, `priority=1`, `source='zork'` - `scripts/zork-ai-agent.cjs:2594`

**Embedding Generation:** `scripts/zork-ai-agent.cjs:1106-1112`
- Uses `generateEmbedding` from `utils/zorkKnowledge.js` - `scripts/zork-ai-agent.cjs:20,1108`
- Falls back gracefully if embedding generation fails - `scripts/zork-ai-agent.cjs:1109-1112`

### Cursor Integration

**Cursor Rules:** `.cursorrules:1-100`
- Instructs Cursor to automatically store knowledge after feature implementation - `.cursorrules:5`
- Defines when to store/update knowledge - `.cursorrules:9-22`
- Provides workflow for knowledge storage - `.cursorrules:24-100`

**Autonomous Workflow:**
1. Cursor implements feature
2. Cursor automatically calls `knowledge_add` MCP tool - `.cursorrules:45`
3. Knowledge immediately available to ZORK and Cursor - `.cursorrules:48-51`

### Database Integration

**Database Functions:** `database.js:2908-3115`
- All knowledge operations go through `database.js` functions
- Uses PostgreSQL connection pool - `database.js` (via `query`, `getOne`, `getAll` helpers)
- Handles vector type conversion for embeddings - `database.js:2918-2932`

**Embedding Utilities:** `utils/zorkKnowledge.js:1-149`
- `generateEmbedding(text)` - `utils/zorkKnowledge.js:29-50`
- `generateEmbeddingBatch(texts)` - `utils/zorkKnowledge.js:57-85`
- `prepareKnowledgeForEmbedding(title, content)` - `utils/zorkKnowledge.js:94-98`
- `storeKnowledgeWithEmbedding(...)` - `utils/zorkKnowledge.js:112-139`

### Helper Scripts

**add-feature-knowledge.js:** `scripts/add-feature-knowledge.js:1-106`
- CLI tool for manual knowledge storage
- Validates category and priority - `scripts/add-feature-knowledge.js:28-36`
- Uses `storeKnowledgeWithEmbedding` utility - `scripts/add-feature-knowledge.js:44-53`

**seed-docs-to-knowledge.js:** (Referenced in docs, not examined in detail)
- Bulk seeding from documentation files

**test-rag-knowledge.js:** (Referenced in docs, not examined in detail)
- Testing RAG system functionality

---

## 8. Failure States and Messages

### Embedding Generation Failures

**OpenAI API Unavailable:**
- Error: `'OpenAI client not initialized. Set OPENAI_API_KEY environment variable.'`
- Location: `utils/zorkKnowledge.js:31, mcp-test-server/tools/knowledge.js:34`
- **Recovery:** System continues without embedding, uses keyword search fallback
- **Impact:** Semantic search unavailable, keyword search still works

**Embedding Generation Error:**
- Error: Logged to console - `utils/zorkKnowledge.js:47, mcp-test-server/tools/knowledge.js:344`
- **Recovery:** Knowledge stored without embedding - `mcp-test-server/tools/knowledge.js:344-345`
- **Impact:** Semantic search unavailable for this chunk, keyword search still works

**Invalid Text for Embedding:**
- Error: `'Text must be a non-empty string'` - `utils/zorkKnowledge.js:35`
- **Recovery:** Throws error, knowledge not stored
- **Impact:** Operation fails, user must provide valid text

### Database Failures

**pgvector Extension Unavailable:**
- Warning logged in migration - `migrations/060_zork_knowledge_system.sql:13-15`
- **Recovery:** Table created without embedding column
- **Impact:** Vector search unavailable, keyword search used

**Vector Column Missing:**
- Checked at runtime - `database.js:2910-2916, mcp-test-server/tools/knowledge.js:195-199`
- **Recovery:** Falls back to keyword search - `database.js:3052-3069`
- **Impact:** Semantic search unavailable, keyword search still works

**Invalid Embedding Format:**
- No explicit validation of embedding dimensions
- **Risk:** PostgreSQL error if embedding array length != 1536
- **Recovery:** Database error thrown, operation fails
- **Impact:** Knowledge not stored/updated

### Validation Failures

**Invalid Category:**
- Error: `'Invalid category. Must be one of: ...'` - `scripts/add-feature-knowledge.js:30`
- **Recovery:** Throws error, knowledge not stored
- **Impact:** Operation fails, user must provide valid category

**Invalid Priority:**
- Error: `'Priority must be 0 (contextual), 1 (important), or 2 (always-include)'` - `scripts/add-feature-knowledge.js:35`
- **Recovery:** Throws error, knowledge not stored
- **Impact:** Operation fails, user must provide valid priority

**Missing Required Fields:**
- Database constraint: NOT NULL on `category`, `title`, `content`
- **Recovery:** PostgreSQL error thrown
- **Impact:** Operation fails, user must provide required fields

### MCP Tool Failures

**Unknown Tool:**
- Error: `'Unknown knowledge tool: {name}'` - `mcp-test-server/tools/knowledge.js:500-503`
- **Recovery:** Returns error response
- **Impact:** Tool call fails, user must use valid tool name

**Tool Error:**
- Error: `'Knowledge tool error: {error.message}'` - `mcp-test-server/tools/knowledge.js:505-509`
- **Recovery:** Returns error response with message
- **Impact:** Tool call fails, error message returned to user

### ZORK Retrieval Failures

**Knowledge Retrieval Error:**
- Error: Logged to console - `scripts/zork-ai-agent.cjs:1264`
- **Recovery:** Returns empty string, context building continues - `scripts/zork-ai-agent.cjs:1265`
- **Impact:** ZORK continues without knowledge, may have reduced context

**Embedding Generation Failure (ZORK):**
- Warning logged - `scripts/zork-ai-agent.cjs:1110`
- **Recovery:** Continues without semantic search, uses category-based retrieval - `scripts/zork-ai-agent.cjs:1111-1112`
- **Impact:** Semantic search unavailable, keyword/category search still works

---

## 9. Serialization Paths

### MCP Tool Responses

**knowledge_search:**
- Returns formatted text with results - `mcp-test-server/tools/knowledge.js:254-263`
- Format: `"[id] category/subcategory (priority)\n**title**\ncontent\nSimilarity: X%"` - `mcp-test-server/tools/knowledge.js:257-260`

**knowledge_list:**
- Returns formatted list - `mcp-test-server/tools/knowledge.js:290-297`
- Format: `"[id] category/subcategory (P{priority}) - title"` - `mcp-test-server/tools/knowledge.js:293-294`

**knowledge_get:**
- Returns full knowledge chunk details - `mcp-test-server/tools/knowledge.js:314-326`
- Format: Includes all fields (id, category, subcategory, priority, source, added_by, active, created_at, title, content) - `mcp-test-server/tools/knowledge.js:317-324`

**knowledge_add:**
- Returns success message with ID, title, category, embedding status - `mcp-test-server/tools/knowledge.js:377-385`

**knowledge_update:**
- Returns success message with ID and title - `mcp-test-server/tools/knowledge.js:469-473`

**knowledge_delete:**
- Returns success message with ID and title - `mcp-test-server/tools/knowledge.js:491-495`

### ZORK Context Formatting

**Knowledge Base Format:**
- Wrapped in `[KNOWLEDGE BASE]...[/KNOWLEDGE BASE]` tags - `scripts/zork-ai-agent.cjs:1258`
- Each chunk formatted as: `"[CATEGORY] title\ncontent"` - `scripts/zork-ai-agent.cjs:1254`
- Chunks joined with double newline - `scripts/zork-ai-agent.cjs:1258`
- Includes note about markup syntax - `scripts/zork-ai-agent.cjs:1261`

**Markup Handling:**
- Content included as-is (plain text) - `scripts/zork-ai-agent.cjs:1237-1238`
- Markup placeholders cleaned up if present - `scripts/zork-ai-agent.cjs:1247-1251`
- Note added to prevent AI from including placeholders - `scripts/zork-ai-agent.cjs:1261`

### Database Serialization

**Embedding Format:**
- Stored as PostgreSQL vector type: `[0.1,0.2,...]` - `database.js:2924`
- Or as JSON string if not vector type - `database.js:2927`
- Retrieved as array or string depending on column type - `database.js:3028`

**Timestamp Format:**
- Stored as BIGINT (Unix timestamp in milliseconds) - `migrations/060_zork_knowledge_system.sql:48-49`
- Generated via `EXTRACT(EPOCH FROM NOW()) * 1000` - `database.js:2941,2946,2952`

**JSON Fields:**
- None in base schema
- Tags stored as JSON in tickets (separate system)

---

## 10. Known Gaps, Missing Features, or TODOs

### Missing Validations

1. **Database-level category validation:**
   - No CHECK constraint on `category` column
   - **Impact:** Invalid categories can be inserted via direct SQL
   - **Recommendation:** Add CHECK constraint or enforce in application layer consistently

2. **Database-level priority validation:**
   - No CHECK constraint on `priority` column
   - **Impact:** Invalid priorities can be inserted
   - **Recommendation:** Add CHECK constraint: `priority IN (0, 1, 2)`

3. **Database-level source validation:**
   - No CHECK constraint on `source` column
   - **Impact:** Inconsistent source tracking
   - **Recommendation:** Add CHECK constraint: `source IN ('system', 'zork', 'cursor')`

4. **Embedding dimension validation:**
   - No validation that embedding array has exactly 1536 elements
   - **Impact:** Invalid embeddings could cause vector search errors
   - **Recommendation:** Validate array length before storing

5. **Title/Content length limits:**
   - No maximum length constraints
   - **Impact:** Very large chunks could impact performance
   - **Recommendation:** Add reasonable limits (e.g., 10KB for content)

### Missing Features

1. **Full-text search index:**
   - Keyword search uses `ILIKE` pattern matching
   - **Impact:** Slow for large knowledge bases
   - **Recommendation:** Add PostgreSQL full-text search index on title and content

2. **Knowledge versioning:**
   - No history of changes
   - **Impact:** Cannot track how knowledge evolved
   - **Recommendation:** Add versioning table or audit log

3. **Knowledge relationships:**
   - No way to link related knowledge chunks
   - **Impact:** Cannot represent hierarchical or related knowledge
   - **Recommendation:** Add `related_knowledge_ids` JSON column or separate relationship table

4. **Bulk operations:**
   - No bulk update/delete operations
   - **Impact:** Difficult to manage large knowledge bases
   - **Recommendation:** Add bulk update/delete MCP tools

5. **Knowledge expiration:**
   - No way to mark knowledge as outdated
   - **Impact:** Stale knowledge may be retrieved
   - **Recommendation:** Add `expires_at` timestamp or `outdated` flag

6. **Knowledge usage tracking:**
   - No tracking of which knowledge chunks are most useful
   - **Impact:** Cannot optimize knowledge base
   - **Recommendation:** Add usage statistics table

7. **Knowledge import/export:**
   - No standardized format for bulk import/export
   - **Impact:** Difficult to backup or migrate knowledge
   - **Recommendation:** Add JSON/CSV export/import tools

### Incomplete Implementations

1. **MCP tool validation:**
   - Category and priority validation relies on descriptions, not code
   - **Impact:** Invalid values can be passed
   - **Recommendation:** Add explicit validation in tool handlers

2. **Error recovery:**
   - Some errors are logged but not reported to user
   - **Impact:** User may not know operation failed
   - **Recommendation:** Ensure all errors are returned to user via MCP response

3. **Embedding regeneration:**
   - Only regenerated on content update, not on title update
   - **Impact:** Title changes don't update embedding
   - **Recommendation:** Regenerate embedding if title or content changes

---

## 11. Summary of Strengths, Weaknesses, Risks

### Strengths

1. **Autonomous Operation:**
   - Cursor automatically stores knowledge after feature implementation
   - No manual intervention required
   - **Reference:** `.cursorrules:5,45`

2. **Dual Retrieval Methods:**
   - Semantic search (if embeddings available)
   - Keyword search (fallback)
   - **Reference:** `database.js:3016-3071`

3. **Priority System:**
   - Clear hierarchy: always-include (2), important (1), contextual (0)
   - Efficient retrieval based on priority
   - **Reference:** `scripts/zork-ai-agent.cjs:1094-1230`

4. **Soft Delete:**
   - Knowledge never physically deleted
   - Can be restored if needed
   - **Reference:** `database.js:3109-3115`

5. **Source Tracking:**
   - Tracks origin (system, zork, cursor)
   - Useful for debugging and auditing
   - **Reference:** `migrations/060_zork_knowledge_system.sql:41`

6. **Graceful Degradation:**
   - Works without pgvector extension
   - Falls back to keyword search if embeddings unavailable
   - **Reference:** `database.js:3052-3069`

7. **Bidirectional Learning:**
   - ZORK can learn from players
   - Cursor can store knowledge
   - Both share same knowledge base
   - **Reference:** `scripts/zork-ai-agent.cjs:2592-2623, mcp-test-server/tools/knowledge.js:329-387`

### Weaknesses

1. **Limited Validation:**
   - Category, priority, source not validated in database
   - Relies on application-level validation
   - **Risk:** Data integrity issues

2. **No Full-Text Search:**
   - Keyword search uses `ILIKE` pattern matching
   - Slow for large knowledge bases
   - **Risk:** Performance issues as knowledge base grows

3. **No Versioning:**
   - Cannot track knowledge changes over time
   - **Risk:** Difficult to debug or audit changes

4. **No Usage Tracking:**
   - Cannot identify most useful knowledge chunks
   - **Risk:** Cannot optimize knowledge base

5. **Embedding Dimension Not Validated:**
   - No check that embedding has exactly 1536 elements
   - **Risk:** Database errors if invalid embedding provided

### Risks

1. **Data Integrity:**
   - Invalid categories/priorities can be inserted via direct SQL
   - **Mitigation:** Enforce validation in application layer consistently
   - **Severity:** Medium

2. **Performance:**
   - Keyword search may be slow for large knowledge bases
   - **Mitigation:** Add full-text search index
   - **Severity:** Medium (future concern)

3. **Embedding Failures:**
   - If OpenAI API unavailable, semantic search disabled
   - **Mitigation:** Graceful fallback to keyword search (already implemented)
   - **Severity:** Low (handled gracefully)

4. **Knowledge Staleness:**
   - No way to mark knowledge as outdated
   - **Mitigation:** Manual review and update process
   - **Severity:** Low (manageable)

5. **Large Knowledge Chunks:**
   - No size limits on content
   - **Mitigation:** Add reasonable limits
   - **Severity:** Low (future concern)

### Recommendations

1. **Immediate:**
   - Add database CHECK constraints for category, priority, source
   - Add embedding dimension validation
   - Add explicit validation in MCP tool handlers

2. **Short-term:**
   - Add full-text search index for keyword search
   - Add content length limits
   - Improve error reporting to users

3. **Long-term:**
   - Add knowledge versioning
   - Add usage tracking
   - Add bulk operations
   - Add knowledge relationships
   - Add import/export functionality

---

## File References Summary

**Core Implementation:**
- `migrations/060_zork_knowledge_system.sql` - Database schema
- `database.js:2908-3115` - Database functions
- `utils/zorkKnowledge.js:1-149` - Embedding utilities
- `mcp-test-server/tools/knowledge.js:1-511` - MCP tools
- `scripts/zork-ai-agent.cjs:1090-1267` - ZORK retrieval
- `scripts/zork-ai-agent.cjs:2592-2623` - ZORK learning
- `.cursorrules:1-100` - Cursor autonomous workflow

**Helper Scripts:**
- `scripts/add-feature-knowledge.js:1-106` - CLI knowledge storage

**Documentation:**
- `docs/AUTONOMOUS-KNOWLEDGE-SYSTEM.md` - System overview
- `docs/knowledge-storage-system.md` - Architecture guide
- `docs/cursor-workflow.md` - Cursor workflow

---

**Document Status:** Complete canonical specification based on code analysis.
**Last Updated:** Based on codebase as of document creation.
**Verification:** All findings verified against actual code implementation.

