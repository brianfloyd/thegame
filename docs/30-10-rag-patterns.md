# RAG Knowledge System: Patterns and Best Practices

**Analysis Date:** Based on codebase analysis  
**Scope:** RAG (Retrieval-Augmented Generation) knowledge system for ZORK and Cursor  
**Method:** Direct code examination with file/line citations

This document defines the **complete, code-verified canonical behavior** of the RAG knowledge system, plus best practices for effective usage. All facts are grounded in real code, with file references where possible.

---

# 1. RAG System Schema / Source of Truth

## 1.1 Database Table

**Primary Table:** `zork_knowledge` table in PostgreSQL

**Defined in:**
- `migrations/060_zork_knowledge_system.sql:23-52` (base schema)
- `migrations/060_zork_knowledge_system.sql:54-90` (vector column and index)

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:23-52` - Table definition
- `migrations/060_zork_knowledge_system.sql:54-90` - Vector column addition logic

## 1.2 Core Fields

**Required Fields (NOT NULL):**
- `id SERIAL PRIMARY KEY`
- `category TEXT NOT NULL` - Knowledge category
- `title TEXT NOT NULL` - Short descriptive title
- `content TEXT NOT NULL` - The actual knowledge chunk
- `priority INTEGER DEFAULT 0` - Priority level (0-2)
- `source TEXT DEFAULT 'system'` - Origin ('system', 'zork', 'cursor')
- `active BOOLEAN DEFAULT TRUE` - Soft delete flag
- `created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)`
- `updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)`

**Optional Fields (NULLABLE):**
- `subcategory TEXT` - Optional subcategory for organization
- `embedding vector(1536)` - OpenAI embedding vector (requires pgvector extension)
- `added_by TEXT` - User/player who added this knowledge

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:23-52` - Field definitions
- `migrations/060_zork_knowledge_system.sql:69` - Vector column definition

## 1.3 Indexes

**Indexes Created:**
1. `idx_zork_knowledge_embedding` - Vector similarity index (IVFFlat, cosine distance)
   - Location: `migrations/060_zork_knowledge_system.sql:78-82`
   - Type: `ivfflat` with `vector_cosine_ops`
   - Lists: 100
   - Only created if pgvector extension is available

2. `idx_zork_knowledge_category_priority` - Category and priority filtering
   - Location: `migrations/060_zork_knowledge_system.sql:93-94`
   - Columns: `(category, priority, active)`

3. `idx_zork_knowledge_source` - Source tracking
   - Location: `migrations/060_zork_knowledge_system.sql:97-98`
   - Column: `source`

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:78-82` - Vector index
- `migrations/060_zork_knowledge_system.sql:93-98` - Category and source indexes

## 1.4 Dependencies

**External Dependencies:**
- **pgvector extension** (optional) - For vector similarity search
  - Location: `migrations/060_zork_knowledge_system.sql:7-20`
  - Model: `text-embedding-3-small` (1536 dimensions)
  - Evidence: `utils/zorkKnowledge.js:21-22`

**OpenAI API:**
- Required for embedding generation
- Location: `utils/zorkKnowledge.js:12-18`
- Model: `text-embedding-3-small`
- Dimensions: 1536
- Evidence: `utils/zorkKnowledge.js:21-22`, `mcp-test-server/tools/knowledge.js:26-27`

---

# 2. All Fields, Defaults, Nullability, Constraints

## 2.1 Field Specifications

| Field | Type | Nullable | Default | Constraints | Evidence |
|-------|------|----------|---------|-------------|----------|
| `id` | SERIAL | NO | Auto-increment | PRIMARY KEY | `migrations/060_zork_knowledge_system.sql:24` |
| `category` | TEXT | NO | None | NOT NULL | `migrations/060_zork_knowledge_system.sql:27` |
| `subcategory` | TEXT | YES | NULL | None | `migrations/060_zork_knowledge_system.sql:28` |
| `title` | TEXT | NO | None | NOT NULL | `migrations/060_zork_knowledge_system.sql:31` |
| `content` | TEXT | NO | None | NOT NULL | `migrations/060_zork_knowledge_system.sql:32` |
| `embedding` | vector(1536) | YES | NULL | Requires pgvector | `migrations/060_zork_knowledge_system.sql:69` |
| `priority` | INTEGER | NO | 0 | 0-2 range (enforced in code) | `migrations/060_zork_knowledge_system.sql:38` |
| `source` | TEXT | NO | 'system' | 'system', 'zork', 'cursor' | `migrations/060_zork_knowledge_system.sql:41` |
| `added_by` | TEXT | YES | NULL | None | `migrations/060_zork_knowledge_system.sql:42` |
| `active` | BOOLEAN | NO | TRUE | None | `migrations/060_zork_knowledge_system.sql:45` |
| `created_at` | BIGINT | NO | Current timestamp | None | `migrations/060_zork_knowledge_system.sql:48` |
| `updated_at` | BIGINT | NO | Current timestamp | None | `migrations/060_zork_knowledge_system.sql:49` |

## 2.2 Priority Levels

**Priority System:**
- **0 (contextual)**: Semantic search only - retrieved when query matches meaning
- **1 (important)**: Keyword-triggered - loaded when category keywords appear in message
- **2 (always-include)**: Always loaded - bypasses similarity search, always in context

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:34-37` - Priority comments
- `scripts/zork-ai-agent.cjs:1094-1103` - Priority 2 always loaded
- `scripts/zork-ai-agent.cjs:1114-1135` - Priority 0 semantic search
- `scripts/zork-ai-agent.cjs:1137-1191` - Priority 1 keyword-triggered

## 2.3 Categories

**Valid Categories:**
- `core_identity` - ZORK persona, AI identity (priority 2)
- `command_knowledge` - God-mode commands
- `world_lore` - Story/lore elements
- `interaction_patterns` - Player interaction patterns
- `learned_context` - Player preferences, learned information
- `system_docs` - Deployment/operations
- `game_design` - Player-facing features, gameplay
- `technical` - Implementation details, code patterns

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:27` - Category field
- `migrations/060_zork_knowledge_system.sql:104` - Category comment
- `mcp-test-server/tools/knowledge.js:63` - Category list in MCP tool

## 2.4 Sources

**Valid Sources:**
- `'system'` - Initial migration, seeded documentation
- `'zork'` - Learned in-game from player interactions
- `'cursor'` - Added via MCP tools by Cursor AI

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:41` - Source field
- `migrations/060_zork_knowledge_system.sql:106` - Source comment
- `mcp-test-server/tools/knowledge.js:363` - Source set to 'cursor' in MCP tool

---

# 3. All Subsystem Operations (Read/Write/Mutate)

## 3.1 Write Operations

### `addZorkKnowledge()`
**Location:** `database.js:2908-2958`

**Parameters:**
- `category` (required) - Knowledge category
- `subcategory` (optional) - Subcategory
- `title` (required) - Knowledge title
- `content` (required) - Knowledge content
- `embedding` (optional) - Embedding vector array
- `priority` (default: 0) - Priority level
- `source` (default: 'system') - Source identifier
- `addedBy` (optional) - User who added

**Behavior:**
- Checks if embedding column exists (`database.js:2910-2916`)
- Detects if column is vector type or text type (`database.js:2916`)
- Formats embedding for PostgreSQL vector type (`database.js:2918-2932`)
- Builds INSERT query conditionally based on embedding column existence (`database.js:2934-2954`)
- Sets `active = TRUE` by default
- Sets timestamps using `EXTRACT(EPOCH FROM NOW()) * 1000`
- Returns created knowledge chunk

**Evidence:**
- `database.js:2908-2958` - Full implementation

### `storeKnowledgeWithEmbedding()`
**Location:** `utils/zorkKnowledge.js:112-139`

**Parameters:**
- `db` - Database module
- `category`, `subcategory`, `title`, `content` - Knowledge fields
- `priority` (default: 0)
- `source` (default: 'system')
- `addedBy` (optional)

**Behavior:**
- Prepares text for embedding: `title + "\n\n" + content` (`utils/zorkKnowledge.js:114`)
- Generates embedding using OpenAI API (`utils/zorkKnowledge.js:117-119`)
- Falls back gracefully if embedding generation fails (`utils/zorkKnowledge.js:120-123`)
- Calls `db.addZorkKnowledge()` with embedding (`utils/zorkKnowledge.js:127-136`)
- Returns created knowledge chunk

**Evidence:**
- `utils/zorkKnowledge.js:112-139` - Full implementation
- `utils/zorkKnowledge.js:94-98` - `prepareKnowledgeForEmbedding()` function

### `knowledge_add` (MCP Tool)
**Location:** `mcp-test-server/tools/knowledge.js:329-387`

**Parameters:**
- `title` (required)
- `content` (required)
- `category` (required)
- `subcategory` (optional)
- `priority` (default: 0)

**Behavior:**
- Generates embedding if OpenAI is available (`mcp-test-server/tools/knowledge.js:339-346`)
- Checks if embedding column exists (`mcp-test-server/tools/knowledge.js:348-353`)
- Inserts knowledge with or without embedding (`mcp-test-server/tools/knowledge.js:355-375`)
- Sets `source = 'cursor'` and `added_by = 'Cursor AI'` (`mcp-test-server/tools/knowledge.js:363`)
- Returns success message with ID and status

**Evidence:**
- `mcp-test-server/tools/knowledge.js:329-387` - Full implementation

## 3.2 Update Operations

### `updateZorkKnowledge()`
**Location:** `database.js:2963-3011`

**Parameters:**
- `id` (required) - Knowledge chunk ID
- `updates` (object) - Fields to update

**Updatable Fields:**
- `category`, `subcategory`, `title`, `content`
- `embedding`, `priority`, `source`, `active`

**Behavior:**
- Builds dynamic UPDATE query based on provided fields (`database.js:2964-2999`)
- Always updates `updated_at` timestamp (`database.js:3002`)
- Returns updated knowledge chunk or null if not found

**Evidence:**
- `database.js:2963-3011` - Full implementation

### `knowledge_update` (MCP Tool)
**Location:** `mcp-test-server/tools/knowledge.js:389-475`

**Parameters:**
- `id` (required)
- `title`, `content`, `category`, `subcategory`, `priority` (all optional)

**Behavior:**
- Builds dynamic UPDATE query (`mcp-test-server/tools/knowledge.js:392-421`)
- Regenerates embedding if content changed (`mcp-test-server/tools/knowledge.js:429-450`)
- Updates `updated_at` timestamp (`mcp-test-server/tools/knowledge.js:452`)
- Returns success message or error if not found

**Evidence:**
- `mcp-test-server/tools/knowledge.js:389-475` - Full implementation

## 3.3 Read Operations

### `searchZorkKnowledge()`
**Location:** `database.js:3016-3071`

**Parameters:**
- `queryEmbedding` (optional) - Embedding vector for semantic search
- `limit` (default: 10) - Max results
- `threshold` (default: 0.7) - Similarity threshold (0-1, higher = stricter)
- `category` (optional) - Filter by category
- `priority` (optional) - Filter by priority

**Behavior:**
- Checks if embedding column exists (`database.js:3018-3023`)
- **If vector column exists and queryEmbedding provided:**
  - Performs vector similarity search using cosine distance (`database.js:3025-3050`)
  - Filters by threshold: `distance <= (1 - threshold)` (`database.js:3050`)
  - Orders by distance (ascending)
- **Otherwise (fallback):**
  - Performs keyword-based search (`database.js:3051-3070`)
  - Orders by priority DESC, created_at DESC
- Returns array of matching knowledge chunks

**Evidence:**
- `database.js:3016-3071` - Full implementation

### `getZorkKnowledgeByCategory()`
**Location:** `database.js:3076-3088`

**Parameters:**
- `category` (required)
- `priority` (optional) - Filter by priority

**Behavior:**
- Filters by `active = TRUE` and `category`
- Optionally filters by `priority` if provided
- Orders by priority DESC, created_at DESC
- Returns array of knowledge chunks

**Evidence:**
- `database.js:3076-3088` - Full implementation

### `getAlwaysIncludeKnowledge()`
**Location:** `database.js:3100-3104`

**Parameters:** None

**Behavior:**
- Returns all knowledge chunks where `priority = 2` and `active = TRUE`
- Orders by category, created_at DESC
- Used for always-include knowledge (core_identity)

**Evidence:**
- `database.js:3100-3104` - Full implementation

### `getZorkKnowledgeById()`
**Location:** `database.js:3093-3095`

**Parameters:**
- `id` (required)

**Behavior:**
- Returns single knowledge chunk by ID
- Returns null if not found

**Evidence:**
- `database.js:3093-3095` - Full implementation

### `knowledge_search` (MCP Tool)
**Location:** `mcp-test-server/tools/knowledge.js:191-264`

**Parameters:**
- `query` (required) - Search query text
- `limit` (default: 5) - Max results
- `category` (optional) - Filter by category
- `threshold` (default: 0.6) - Similarity threshold

**Behavior:**
- Checks if embedding column exists (`mcp-test-server/tools/knowledge.js:195-199`)
- **If vector column exists and OpenAI available:**
  - Generates embedding for query (`mcp-test-server/tools/knowledge.js:205`)
  - Performs semantic search (`mcp-test-server/tools/knowledge.js:209-231`)
  - Filters by threshold: `1 - (embedding <=> query) > threshold` (`mcp-test-server/tools/knowledge.js:224`)
- **Otherwise (fallback):**
  - Performs keyword search using `ILIKE` on title and content (`mcp-test-server/tools/knowledge.js:232-252`)
- Returns formatted results with similarity scores

**Evidence:**
- `mcp-test-server/tools/knowledge.js:191-264` - Full implementation

### `knowledge_list` (MCP Tool)
**Location:** `mcp-test-server/tools/knowledge.js:266-298`

**Parameters:**
- `category` (optional) - Filter by category
- `priority` (optional) - Filter by priority
- `limit` (default: 20) - Max results

**Behavior:**
- Filters by `active = TRUE`
- Optionally filters by category and/or priority
- Orders by category, priority DESC, created_at DESC
- Returns formatted list of knowledge chunks

**Evidence:**
- `mcp-test-server/tools/knowledge.js:266-298` - Full implementation

### `getRelevantKnowledge()` (ZORK)
**Location:** `scripts/zork-ai-agent.cjs:1090-1267`

**Parameters:**
- `message` (required) - Player message
- `speakerIsGod` (optional) - Whether speaker is god-mode

**Behavior:**
1. **Always loads priority 2 knowledge** (`scripts/zork-ai-agent.cjs:1094-1103`)
2. **Generates embedding for message** (`scripts/zork-ai-agent.cjs:1106-1112`)
3. **Semantic search for priority 0** (if embedding available) (`scripts/zork-ai-agent.cjs:1114-1135`)
4. **Keyword-triggered loading for priority 1:**
   - Command keywords → `command_knowledge` (`scripts/zork-ai-agent.cjs:1141-1154`)
   - System docs keywords → `system_docs` (`scripts/zork-ai-agent.cjs:1156-1172`)
   - Game keywords → `game_design` and `technical` (`scripts/zork-ai-agent.cjs:1174-1191`)
5. **Semantic search for learned_context** (`scripts/zork-ai-agent.cjs:1193-1214`)
6. **Loads all learned_context for god-mode players** (`scripts/zork-ai-agent.cjs:1216-1229`)
7. **Formats knowledge chunks for context** (`scripts/zork-ai-agent.cjs:1231-1261`)
8. **Cleans up markup placeholders** (`scripts/zork-ai-agent.cjs:1241-1252`)

**Evidence:**
- `scripts/zork-ai-agent.cjs:1090-1267` - Full implementation

## 3.4 Delete Operations

### `deleteZorkKnowledge()`
**Location:** `database.js:3109-3112`

**Parameters:**
- `id` (required)

**Behavior:**
- Soft delete: Sets `active = FALSE`
- Does not actually delete the row
- Returns true on success

**Evidence:**
- `database.js:3109-3112` - Full implementation

### `knowledge_delete` (MCP Tool)
**Location:** `mcp-test-server/tools/knowledge.js:477-497`

**Parameters:**
- `id` (required)

**Behavior:**
- Soft delete: Sets `active = FALSE` and updates `updated_at`
- Returns success message or error if not found

**Evidence:**
- `mcp-test-server/tools/knowledge.js:477-497` - Full implementation

---

# 4. Validations + Missing Validations

## 4.1 Validations Enforced

### Required Field Validation
- **Location:** `mcp-test-server/tools/knowledge.js:135` - MCP tool schema requires `title`, `content`, `category`
- **Location:** `scripts/zork-ai-agent.cjs:2596-2598` - ZORK action validates `title` and `content` are required

**Evidence:**
- `mcp-test-server/tools/knowledge.js:135` - Required fields in schema
- `scripts/zork-ai-agent.cjs:2596-2598` - Validation check

### Embedding Generation Validation
- **Location:** `utils/zorkKnowledge.js:34-36` - Validates text is non-empty string before embedding
- **Location:** `utils/zorkKnowledge.js:62-64` - Validates texts array is non-empty

**Evidence:**
- `utils/zorkKnowledge.js:34-36` - Text validation
- `utils/zorkKnowledge.js:62-64` - Array validation

### Database Column Existence Checks
- **Location:** `database.js:2910-2916` - Checks if embedding column exists before using it
- **Location:** `mcp-test-server/tools/knowledge.js:195-199` - Checks embedding column before semantic search
- **Location:** `database.js:3018-3023` - Checks embedding column before vector search

**Evidence:**
- `database.js:2910-2916` - Column check in addZorkKnowledge
- `mcp-test-server/tools/knowledge.js:195-199` - Column check in search
- `database.js:3018-3023` - Column check in searchZorkKnowledge

## 4.2 Missing Validations

### Priority Range Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Priority should be 0, 1, or 2
- **Current:** No validation prevents invalid priority values (e.g., -1, 5, 999)
- **Impact:** Low - application code typically sets valid values, but database allows any integer

### Category Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Category should be one of valid categories
- **Current:** No CHECK constraint or enum type enforces valid categories
- **Impact:** Medium - invalid categories may cause retrieval issues

### Source Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Source should be 'system', 'zork', or 'cursor'
- **Current:** No CHECK constraint enforces valid sources
- **Impact:** Low - application code typically sets valid values

### Content Length Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Content should have reasonable length limits
- **Current:** No maximum length constraint on TEXT fields
- **Impact:** Low - PostgreSQL TEXT can be very large, but extremely long content may impact embedding generation

### Embedding Dimension Validation
- **Status:** PARTIALLY ENFORCED
- **Expected:** Embedding should be exactly 1536 dimensions
- **Current:** Vector type enforces dimension at database level (`vector(1536)`)
- **Location:** `migrations/060_zork_knowledge_system.sql:69`
- **Impact:** Low - database constraint prevents invalid dimensions

---

# 5. Behavioral Rules / Invariants

## 5.1 Enforced Invariants

### Invariant: Priority 2 Knowledge Always Loaded
- **Enforcement:** `scripts/zork-ai-agent.cjs:1094-1103` - Always loads priority 2 knowledge first
- **Rule:** All knowledge chunks with `priority = 2` and `active = TRUE` are always included in ZORK's context
- **Evidence:** `scripts/zork-ai-agent.cjs:1095` - `getAlwaysIncludeKnowledge()` call

### Invariant: Active Knowledge Only
- **Enforcement:** All read operations filter by `active = TRUE`
- **Rule:** Soft-deleted knowledge (`active = FALSE`) is never returned in searches
- **Evidence:**
  - `database.js:3030` - `WHERE active = TRUE` in searchZorkKnowledge
  - `database.js:3077` - `WHERE active = TRUE` in getZorkKnowledgeByCategory
  - `database.js:3102` - `WHERE active = TRUE` in getAlwaysIncludeKnowledge
  - `mcp-test-server/tools/knowledge.js:213` - `WHERE active = TRUE` in semantic search
  - `mcp-test-server/tools/knowledge.js:237` - `WHERE active = TRUE` in keyword search

### Invariant: Embedding Fallback
- **Enforcement:** `utils/zorkKnowledge.js:120-123` - Continues without embedding if generation fails
- **Rule:** Knowledge can be stored without embeddings; keyword search is used as fallback
- **Evidence:** `utils/zorkKnowledge.js:121` - Error logged but operation continues

### Invariant: Vector Column Detection
- **Enforcement:** Multiple locations check for embedding column existence
- **Rule:** System gracefully handles missing pgvector extension by using keyword search
- **Evidence:**
  - `database.js:2910-2916` - Column check in addZorkKnowledge
  - `database.js:3018-3023` - Column check in searchZorkKnowledge
  - `mcp-test-server/tools/knowledge.js:195-199` - Column check in MCP search

## 5.2 Unenforced Rules

### Invariant: Priority Range (0-2)
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Priority should be 0, 1, or 2
- **Current:** Database accepts any integer value
- **Impact:** Low - application code sets valid values

### Invariant: Category Consistency
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Category should match predefined list
- **Current:** No database constraint enforces valid categories
- **Impact:** Medium - invalid categories may not be retrieved correctly

### Invariant: Source Consistency
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Source should be 'system', 'zork', or 'cursor'
- **Current:** No database constraint enforces valid sources
- **Impact:** Low - application code sets valid values

---

# 6. State Transitions (with File References)

## 6.1 Knowledge Lifecycle

### Creation Flow
1. **Knowledge added** → `active = TRUE`, `created_at` set, `updated_at` set
   - Location: `database.js:2940-2954` - INSERT with active=TRUE
   - Location: `mcp-test-server/tools/knowledge.js:362-375` - MCP tool insert

2. **Embedding generated** (if OpenAI available) → `embedding` field populated
   - Location: `utils/zorkKnowledge.js:117-119` - Embedding generation
   - Location: `mcp-test-server/tools/knowledge.js:339-346` - MCP embedding generation

3. **Knowledge available for retrieval** → Can be found via search/list operations
   - Location: `database.js:3016-3071` - searchZorkKnowledge
   - Location: `scripts/zork-ai-agent.cjs:1090-1267` - getRelevantKnowledge

### Update Flow
1. **Knowledge updated** → `updated_at` timestamp updated
   - Location: `database.js:3002` - Always updates updated_at
   - Location: `mcp-test-server/tools/knowledge.js:452` - MCP tool updates updated_at

2. **Embedding regenerated** (if content changed and OpenAI available)
   - Location: `mcp-test-server/tools/knowledge.js:429-450` - Regenerates embedding on content update

### Deletion Flow
1. **Knowledge soft-deleted** → `active = FALSE`, `updated_at` updated
   - Location: `database.js:3109-3112` - Sets active=FALSE
   - Location: `mcp-test-server/tools/knowledge.js:481-482` - MCP tool soft delete

2. **Knowledge excluded from searches** → No longer returned in read operations
   - Location: All read operations filter by `active = TRUE`

---

# 7. Interactions with Other Systems

## 7.1 ZORK AI Agent Integration

**Integration Points:**
- **Knowledge Retrieval:** `scripts/zork-ai-agent.cjs:1090-1267` - `getRelevantKnowledge()`
- **Knowledge Storage:** `scripts/zork-ai-agent.cjs:2592-2614` - `learnKnowledge` action
- **Embedding Generation:** Uses `utils/zorkKnowledge.js:generateEmbedding()`

**Behavior:**
- ZORK retrieves knowledge before processing player messages
- ZORK can learn new knowledge from player interactions
- Knowledge is formatted for AI context with category prefixes

**Evidence:**
- `scripts/zork-ai-agent.cjs:1090-1267` - Retrieval implementation
- `scripts/zork-ai-agent.cjs:2592-2614` - Storage implementation

## 7.2 Cursor MCP Integration

**Integration Points:**
- **MCP Tools:** `mcp-test-server/tools/knowledge.js` - All knowledge operations
- **Available Tools:**
  - `knowledge_search` - Semantic/keyword search
  - `knowledge_list` - List by category/priority
  - `knowledge_get` - Get by ID
  - `knowledge_add` - Add new knowledge
  - `knowledge_update` - Update existing
  - `knowledge_delete` - Soft delete

**Behavior:**
- Cursor can search, add, update, and delete knowledge via MCP
- Automatic embedding generation when adding/updating
- Source tracked as 'cursor' for MCP operations

**Evidence:**
- `mcp-test-server/tools/knowledge.js:46-186` - Tool definitions
- `mcp-test-server/tools/knowledge.js:188-511` - Tool handlers

## 7.3 Cursor Rules Integration

**Integration Points:**
- **Automatic Storage:** `.cursorrules` instructs Cursor to automatically store knowledge
- **Location:** `.cursorrules:1-67` - Knowledge storage rules

**Behavior:**
- Cursor automatically stores knowledge after implementing features
- Cursor checks for existing knowledge before adding
- Cursor updates existing knowledge when workflows change

**Evidence:**
- `.cursorrules:1-67` - Complete rules definition

## 7.4 Database Layer

**Integration Points:**
- **Database Functions:** `database.js:2908-3112` - All knowledge operations
- **Embedding Utilities:** `utils/zorkKnowledge.js` - Embedding generation

**Behavior:**
- Database functions handle all CRUD operations
- Embedding utilities generate vectors for semantic search
- Graceful fallback when pgvector not available

**Evidence:**
- `database.js:2908-3112` - Database functions
- `utils/zorkKnowledge.js:1-150` - Embedding utilities

---

# 8. Failure States and Messages

## 8.1 Embedding Generation Failures

### OpenAI API Not Available
- **Error:** `'OpenAI client not initialized. Set OPENAI_API_KEY environment variable.'`
- **Location:** `utils/zorkKnowledge.js:31-32`
- **Recovery:** Operation continues without embedding, uses keyword search fallback
- **Evidence:** `utils/zorkKnowledge.js:120-123` - Error caught, continues without embedding

### Embedding Generation Error
- **Error:** Logged as `'[ZORK Knowledge] Error generating embedding:'`
- **Location:** `utils/zorkKnowledge.js:47`
- **Recovery:** Knowledge stored without embedding, keyword search used
- **Evidence:** `utils/zorkKnowledge.js:120-123` - Error handling

### Empty Text for Embedding
- **Error:** `'Text must be a non-empty string'`
- **Location:** `utils/zorkKnowledge.js:34-36`
- **Recovery:** Throws error, operation fails
- **Evidence:** `utils/zorkKnowledge.js:34-36` - Validation

## 8.2 Database Operation Failures

### Missing Required Fields
- **Error:** Database constraint violation (NOT NULL constraint)
- **Location:** Database level
- **Recovery:** Operation fails, error returned
- **Evidence:** `migrations/060_zork_knowledge_system.sql:27,31,32` - NOT NULL constraints

### Invalid Vector Format
- **Error:** PostgreSQL vector type error
- **Location:** Database level when inserting vector
- **Recovery:** Operation fails, error returned
- **Evidence:** `database.js:2922-2932` - Vector formatting logic

## 8.3 Search Operation Failures

### No Embedding Column
- **Behavior:** Falls back to keyword search
- **Location:** `database.js:3018-3051` - Column check and fallback
- **Recovery:** Uses `ILIKE` keyword search instead of semantic search
- **Evidence:** `database.js:3051-3070` - Fallback implementation

### No Results Found
- **Behavior:** Returns empty array
- **Location:** All search functions
- **Recovery:** Normal behavior, no error thrown
- **Evidence:** `database.js:3048` - Returns filtered results (may be empty)

## 8.4 Missing Failure Handling

### No Validation for Invalid Priority
- **Status:** NOT HANDLED
- **Impact:** Invalid priority values accepted, may cause unexpected behavior
- **Location:** No validation in `addZorkKnowledge` or `updateZorkKnowledge`

### No Validation for Invalid Category
- **Status:** NOT HANDLED
- **Impact:** Invalid categories accepted, may not be retrieved correctly
- **Location:** No validation in database functions

### No Transaction Support
- **Status:** NOT IMPLEMENTED
- **Impact:** Partial failures may leave inconsistent state
- **Location:** All operations are non-transactional

---

# 9. Serialization Paths

## 9.1 ZORK Context Formatting

**Format:**
```
[KNOWLEDGE BASE]
[CATEGORY] Title
Content

[CATEGORY] Title
Content
[/KNOWLEDGE BASE]
```

**Location:** `scripts/zork-ai-agent.cjs:1231-1261`

**Fields Included:**
- `category` (uppercase)
- `title`
- `content` (with markup placeholder cleanup)

**Fields Omitted:**
- `id`, `subcategory`, `priority`, `source`, `added_by`, `created_at`, `updated_at`
- `embedding` (never sent to client)

**Markup Handling:**
- Markup placeholders (`__MARKUP_X__`) are cleaned up before inclusion
- Location: `scripts/zork-ai-agent.cjs:1241-1252`
- Replaced with `'[markup example]'` if found

**Evidence:**
- `scripts/zork-ai-agent.cjs:1231-1261` - Formatting implementation
- `scripts/zork-ai-agent.cjs:1241-1252` - Markup cleanup

## 9.2 MCP Tool Responses

**Format:**
- `knowledge_search`: Formatted text with results, similarity scores
- `knowledge_list`: Formatted list with IDs, categories, priorities
- `knowledge_get`: Full knowledge chunk details
- `knowledge_add`: Success message with ID and status
- `knowledge_update`: Success message with ID
- `knowledge_delete`: Success message with ID

**Location:** `mcp-test-server/tools/knowledge.js:254-496`

**Fields Included:**
- Varies by tool (see individual tool implementations)

**Evidence:**
- `mcp-test-server/tools/knowledge.js:254-496` - All tool response formats

---

# 10. Known Gaps, Missing Features, or TODOs

## 10.1 Missing Validations

1. **Priority Range Validation**
   - Status: NOT IMPLEMENTED
   - Impact: Invalid priority values accepted
   - Recommendation: Add CHECK constraint or application-level validation

2. **Category Validation**
   - Status: NOT IMPLEMENTED
   - Impact: Invalid categories may cause retrieval issues
   - Recommendation: Add CHECK constraint or enum type

3. **Content Length Limits**
   - Status: NOT IMPLEMENTED
   - Impact: Extremely long content may impact embedding generation
   - Recommendation: Add reasonable length limits (e.g., 10,000 characters)

## 10.2 Missing Features

1. **Transaction Support**
   - Status: NOT IMPLEMENTED
   - Impact: Partial failures may leave inconsistent state
   - Recommendation: Wrap operations in transactions where appropriate

2. **Full-Text Search**
   - Status: PARTIAL (keyword search uses ILIKE)
   - Impact: Keyword search is basic, not optimized
   - Recommendation: Use PostgreSQL full-text search (tsvector) for better keyword matching

3. **Bulk Operations**
   - Status: NOT IMPLEMENTED
   - Impact: Adding/updating multiple chunks requires multiple calls
   - Recommendation: Add bulk insert/update functions

4. **Knowledge Versioning**
   - Status: NOT IMPLEMENTED
   - Impact: No history of changes to knowledge chunks
   - Recommendation: Add versioning table or audit log

5. **Knowledge Relationships**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot link related knowledge chunks
   - Recommendation: Add relationship table for knowledge dependencies

6. **Knowledge Expiration**
   - Status: NOT IMPLEMENTED
   - Impact: Outdated knowledge remains active indefinitely
   - Recommendation: Add expiration date field and cleanup job

## 10.3 Partial Implementations

1. **Embedding Generation**
   - Status: PARTIAL (works if OpenAI available, falls back gracefully)
   - Impact: Semantic search unavailable without OpenAI API key
   - Recommendation: Consider alternative embedding providers or local models

2. **Vector Search**
   - Status: PARTIAL (requires pgvector extension)
   - Impact: Vector search unavailable without pgvector
   - Recommendation: Document pgvector installation requirements clearly

---

# 11. Summary of Strengths, Weaknesses, Risks

## 11.1 Strengths

1. **Graceful Degradation**
   - System works without pgvector (keyword search fallback)
   - System works without OpenAI API (no embeddings, keyword search)
   - Evidence: Multiple fallback mechanisms throughout codebase

2. **Flexible Priority System**
   - Priority 2 always loaded (core identity)
   - Priority 1 keyword-triggered (important features)
   - Priority 0 semantic search (contextual)
   - Evidence: `scripts/zork-ai-agent.cjs:1094-1191` - Multi-tier retrieval

3. **Multiple Access Points**
   - ZORK can retrieve and store knowledge
   - Cursor can search and manage via MCP
   - Database functions available for direct access
   - Evidence: Multiple integration points documented above

4. **Automatic Embedding Generation**
   - Embeddings generated automatically when adding/updating
   - Falls back gracefully if generation fails
   - Evidence: `utils/zorkKnowledge.js:112-139` - Automatic embedding

5. **Soft Delete Support**
   - Knowledge can be soft-deleted (active = FALSE)
   - Allows recovery if needed
   - Evidence: `database.js:3109-3112` - Soft delete implementation

## 11.2 Weaknesses

1. **Missing Validations**
   - No priority range validation
   - No category validation
   - No content length limits
   - Risk: Invalid data may cause unexpected behavior

2. **No Transaction Support**
   - Operations are not transactional
   - Risk: Partial failures may leave inconsistent state

3. **Basic Keyword Search**
   - Uses simple ILIKE pattern matching
   - Not optimized for performance
   - Risk: Slow searches on large knowledge bases

4. **No Versioning**
   - Cannot track history of changes
   - Risk: Difficult to audit or rollback changes

5. **Dependency on External Services**
   - Requires OpenAI API for embeddings
   - Requires pgvector for vector search
   - Risk: System degraded if dependencies unavailable

## 11.3 Risks

1. **Data Quality Risk**
   - No validation enforces data quality
   - Invalid categories/priorities may cause retrieval issues
   - Mitigation: Add validation constraints

2. **Performance Risk**
   - Keyword search may be slow on large knowledge bases
   - No pagination for list operations
   - Mitigation: Add full-text search, implement pagination

3. **Consistency Risk**
   - No transactions may cause partial updates
   - No versioning makes rollback difficult
   - Mitigation: Add transaction support, implement versioning

4. **Dependency Risk**
   - OpenAI API required for semantic search
   - pgvector required for vector operations
   - Mitigation: Document requirements, provide clear fallback behavior

---

# 12. Best Practices for Using RAG System

## 12.1 Knowledge Storage Best Practices

### When to Store Knowledge

**Always store knowledge for:**
- New player commands or features (category: `game_design`, priority: 1)
- Major gameplay mechanics (category: `game_design`, priority: 1)
- New database tables/schema (category: `technical`, priority: 0)
- God-mode commands or tools (category: `command_knowledge`, priority: 1)
- Significant architectural changes (category: `technical`, priority: 0)
- New systems (harvest, crafting, combat, etc.) (category: `game_design`, priority: 1)
- Workflow changes or process updates (category: `technical`, priority: 0)

**Evidence:**
- `.cursorrules:9-16` - When to store knowledge

### How to Structure Knowledge

**Title Guidelines:**
- Use descriptive, specific titles
- Include key terms that might be searched
- Examples: "Crafting System", "Player Movement Commands", "Factory Automation"

**Content Guidelines:**
- Be comprehensive but concise
- Include: What it does, how to use it, technical details, player impact
- Use clear, structured format (bullets, sections)
- Include relevant keywords for keyword search

**Category Selection:**
- `game_design` - Player-facing features, gameplay mechanics
- `technical` - Implementation details, code patterns, workflows
- `command_knowledge` - God-mode commands, admin tools
- `world_lore` - Story elements, NPC backstories, world history
- `system_docs` - Deployment, operations, infrastructure
- `learned_context` - Player preferences, learned information
- `core_identity` - ZORK persona, AI identity (priority 2 only)

**Priority Selection:**
- **Priority 2 (always-include):** Only for core identity (ZORK persona)
- **Priority 1 (important):** Major features, god-mode commands, critical workflows
- **Priority 0 (contextual):** Standard features, implementation details, most knowledge

**Evidence:**
- `.cursorrules:59-67` - Category and priority guidelines

### Storage Workflow

1. **Check if knowledge exists:**
   ```
   Use knowledge_search tool:
   - query: Brief description of feature/workflow
   - category: Filter by category if known
   - limit: 5
   ```

2. **If exists, update it:**
   ```
   Use knowledge_update tool:
   - id: Existing knowledge chunk ID
   - content: Updated comprehensive description
   - title: Updated title if needed
   ```

3. **If doesn't exist, add it:**
   ```
   Use knowledge_add tool:
   - title: Feature name
   - category: Appropriate category
   - content: Comprehensive description
   - priority: 0 or 1 (2 only for core_identity)
   ```

**Evidence:**
- `.cursorrules:28-57` - Storage workflow

## 12.2 Knowledge Retrieval Best Practices

### For ZORK (Automatic)

**ZORK automatically retrieves knowledge:**
- Priority 2 knowledge always loaded
- Priority 0 knowledge via semantic search (if embedding available)
- Priority 1 knowledge via keyword triggers
- Learned context via semantic search

**No manual steps needed** - ZORK handles retrieval automatically

**Evidence:**
- `scripts/zork-ai-agent.cjs:1090-1267` - Automatic retrieval

### For Cursor (MCP Tools)

**Search for knowledge:**
```
Use knowledge_search tool:
- query: What you want to find
- category: Filter by category (optional)
- limit: Max results (default: 5)
- threshold: Similarity threshold (default: 0.6, lower = more results)
```

**List knowledge:**
```
Use knowledge_list tool:
- category: Filter by category (optional)
- priority: Filter by priority (optional)
- limit: Max results (default: 20)
```

**Get specific knowledge:**
```
Use knowledge_get tool:
- id: Knowledge chunk ID
```

**Evidence:**
- `mcp-test-server/tools/knowledge.js:46-186` - Tool definitions

## 12.3 Knowledge Update Best Practices

### When to Update Knowledge

**Always update existing knowledge when:**
- Workflows change (e.g., ticket processing workflow)
- Implementation details change
- Best practices evolve
- You discover existing knowledge is inaccurate or incomplete

**Evidence:**
- `.cursorrules:18-22` - When to update

### How to Update Knowledge

1. **Search for existing knowledge:**
   ```
   Use knowledge_search to find related knowledge
   ```

2. **Update the knowledge:**
   ```
   Use knowledge_update tool:
   - id: Knowledge chunk ID
   - content: Updated description (will regenerate embedding)
   - title: Updated title if needed
   - category: Update category if needed
   - priority: Update priority if needed
   ```

**Note:** Updating content automatically regenerates embedding if OpenAI is available

**Evidence:**
- `.cursorrules:36-44` - Update workflow
- `mcp-test-server/tools/knowledge.js:429-450` - Embedding regeneration

## 12.4 Knowledge Organization Best Practices

### Use Subcategories

**Subcategories help organize knowledge:**
- Examples: `markup`, `transportation`, `npc`, `persona_chuck`, `persona_zork`
- Use subcategories for related knowledge chunks
- Helps with organization but doesn't affect retrieval

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:28` - Subcategory field
- `migrations/060_zork_knowledge_system.sql:104` - Subcategory comment

### Avoid Duplication

**Check for existing knowledge before adding:**
- Use `knowledge_search` to find similar knowledge
- Update existing knowledge instead of creating duplicates
- Consolidate related information into single chunks

**Evidence:**
- `.cursorrules:28-34` - Check before adding

### Keep Knowledge Current

**Regular maintenance:**
- Update knowledge when systems change
- Soft-delete outdated knowledge
- Consolidate related knowledge chunks

**Evidence:**
- `.cursorrules:18-22` - Update guidelines

## 12.5 Troubleshooting Best Practices

### Knowledge Not Found in Search

**Check:**
1. Is knowledge `active = TRUE`? (soft-deleted knowledge won't appear)
2. Does category match search filter?
3. For semantic search: Is embedding available? (requires OpenAI API)
4. For keyword search: Do keywords appear in title or content?
5. Is threshold too high? (lower threshold = more results)

**Evidence:**
- All read operations filter by `active = TRUE`
- `mcp-test-server/tools/knowledge.js:224` - Threshold filtering

### Embedding Generation Fails

**Check:**
1. Is `OPENAI_API_KEY` environment variable set?
2. Is OpenAI API accessible?
3. Is text non-empty and valid?

**Recovery:**
- Knowledge stored without embedding
- Keyword search used as fallback
- No error thrown, operation continues

**Evidence:**
- `utils/zorkKnowledge.js:120-123` - Graceful fallback

### Vector Search Not Working

**Check:**
1. Is pgvector extension installed?
2. Does embedding column exist?
3. Are embeddings generated for knowledge chunks?

**Recovery:**
- System falls back to keyword search
- No error thrown, operation continues

**Evidence:**
- `database.js:3018-3051` - Fallback to keyword search

---

# 13. Integration Patterns

## 13.1 Cursor Integration Pattern

**Automatic Storage After Feature Implementation:**
1. Implement feature (code, database, handlers)
2. Cursor automatically detects completion
3. Cursor searches for existing knowledge
4. Cursor adds or updates knowledge via MCP tool
5. Knowledge immediately available to ZORK and Cursor

**Evidence:**
- `.cursorrules:1-67` - Complete automatic workflow

## 13.2 ZORK Integration Pattern

**Knowledge Retrieval:**
1. Player sends message to ZORK
2. ZORK calls `getRelevantKnowledge(message, speakerIsGod)`
3. ZORK receives formatted knowledge chunks
4. ZORK uses knowledge in AI context
5. ZORK responds to player

**Knowledge Storage:**
1. Player tells ZORK information
2. ZORK uses `learnKnowledge` action
3. Knowledge stored with source='zork'
4. Knowledge immediately available for future retrieval

**Evidence:**
- `scripts/zork-ai-agent.cjs:1090-1267` - Retrieval
- `scripts/zork-ai-agent.cjs:2592-2614` - Storage

## 13.3 MCP Integration Pattern

**Cursor uses MCP tools:**
1. Cursor needs knowledge → calls `knowledge_search`
2. Cursor finds knowledge → uses in context
3. Cursor implements feature → calls `knowledge_add`
4. Knowledge stored → available to ZORK and Cursor

**Evidence:**
- `mcp-test-server/tools/knowledge.js:46-186` - All MCP tools

---

# 14. Performance Considerations

## 14.1 Search Performance

**Semantic Search (Vector):**
- Uses IVFFlat index for fast similarity search
- Index created with 100 lists (`migrations/060_zork_knowledge_system.sql:81`)
- Performance: O(log n) with index, O(n) without
- Best for: Semantic similarity queries

**Keyword Search (Fallback):**
- Uses ILIKE pattern matching
- No full-text search index
- Performance: O(n) table scan
- Best for: Exact keyword matches

**Recommendations:**
- Use semantic search when embeddings available
- Consider PostgreSQL full-text search for better keyword performance
- Add pagination for large result sets

**Evidence:**
- `migrations/060_zork_knowledge_system.sql:78-82` - Vector index
- `database.js:3051-3070` - Keyword search fallback

## 14.2 Embedding Generation Performance

**Single Embedding:**
- API call to OpenAI
- Latency: ~100-500ms depending on API
- Cost: Per API call

**Batch Embedding:**
- Available via `generateEmbeddingBatch()`
- More efficient for multiple chunks
- Location: `utils/zorkKnowledge.js:57-85`

**Recommendations:**
- Use batch embedding when adding multiple chunks
- Cache embeddings (already stored in database)
- Regenerate only when content changes

**Evidence:**
- `utils/zorkKnowledge.js:57-85` - Batch embedding
- `mcp-test-server/tools/knowledge.js:429-450` - Regeneration on update

---

# 15. Security Considerations

## 15.1 Access Control

**Current Implementation:**
- No access control on knowledge operations
- All MCP tools available to Cursor
- ZORK can store knowledge via actions
- Database functions available to all code

**Recommendations:**
- Consider access control for sensitive knowledge
- Validate user permissions before operations
- Audit log for knowledge changes

## 15.2 Data Validation

**Current Implementation:**
- Basic required field validation
- No content sanitization
- No XSS protection

**Recommendations:**
- Sanitize content before storage
- Validate category/priority values
- Add content length limits

---

# 16. Future Enhancements

## 16.1 Planned Features

1. **Full-Text Search**
   - Replace ILIKE with PostgreSQL tsvector
   - Better keyword matching performance
   - Support for phrase searches

2. **Knowledge Relationships**
   - Link related knowledge chunks
   - Dependency tracking
   - Knowledge graphs

3. **Versioning**
   - Track history of changes
   - Rollback capability
   - Audit trail

4. **Bulk Operations**
   - Bulk insert/update
   - Import/export functionality
   - Batch embedding generation

## 16.2 Recommended Improvements

1. **Add Validations**
   - Priority range (0-2)
   - Category enum
   - Content length limits

2. **Transaction Support**
   - Wrap operations in transactions
   - Ensure atomicity

3. **Performance Optimization**
   - Full-text search index
   - Pagination for list operations
   - Caching for frequently accessed knowledge

4. **Monitoring**
   - Track knowledge usage
   - Monitor embedding generation failures
   - Alert on search performance issues

---

# 17. Conclusion

The RAG knowledge system provides a robust foundation for knowledge sharing between ZORK and Cursor. Key strengths include graceful degradation, flexible priority system, and multiple access points. Areas for improvement include validation, transaction support, and performance optimization.

**Key Takeaways:**
- System works without pgvector (keyword fallback)
- System works without OpenAI (no embeddings, keyword search)
- Priority system enables tiered retrieval
- Automatic embedding generation simplifies usage
- Multiple integration points (ZORK, Cursor, MCP)

**Best Practices:**
- Always check for existing knowledge before adding
- Use appropriate categories and priorities
- Update knowledge when systems change
- Structure knowledge with clear titles and comprehensive content
- Use semantic search when embeddings available

---

**End of RAG Patterns and Best Practices Document**

