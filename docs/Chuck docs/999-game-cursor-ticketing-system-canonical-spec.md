# Game-to-Cursor Ticketing System: Canonical Specification

**Analysis Date:** Based on codebase analysis  
**Scope:** Complete ticketing system for feature development and debugging (Game → Cursor workflow)  
**Method:** Direct code examination with file/line citations

This document defines the **complete, code-verified canonical behavior** of the game-to-cursor ticketing system. All facts are grounded in real code, with file references where possible.

---

# 1. Ticketing System Schema / Source of Truth

## 1.1 Database Tables

**Primary Table:** `debug_todos` table in PostgreSQL

**Defined in:**
- `migrations/061_debug_todos.sql:15-28` (base schema)
- `migrations/062_extend_debug_todos_tickets.sql:5-11` (ticket-specific fields)
- `migrations/063_add_player_fields_to_tickets.sql:5-7` (player tracking)
- `migrations/065_add_ticket_deleted_status.sql:9` (deleted status)
- `migrations/066_add_backlog_status.sql:5` (backlog status)
- `migrations/067_update_priority_system.sql:5,12-13` (priority constraint)
- `migrations/068_update_ticket_types.sql:5,14,21-22` (ticket type constraint)

**Related Table:** `debug_sessions` table (optional, for telemetry-based tickets)
- Location: `migrations/061_debug_todos.sql:5-12`
- Purpose: Tracks active debug observation sessions
- Relationship: `debug_todos.session_id` references `debug_sessions.id` ON DELETE SET NULL

**Evidence:**
- `migrations/061_debug_todos.sql:15-28` - Base table definition
- `migrations/062_extend_debug_todos_tickets.sql:5-11` - Ticket fields
- `migrations/068_update_ticket_types.sql:21-22` - Type constraint

## 1.2 Core Fields

**Required Fields (NOT NULL):**
- `id SERIAL PRIMARY KEY`
- `status TEXT NOT NULL DEFAULT 'open'` - Ticket status
- `title TEXT NOT NULL` - Ticket title
- `description TEXT NOT NULL` - Ticket description
- `created_by TEXT DEFAULT 'zork'` - Creator identifier
- `created_at TIMESTAMPTZ DEFAULT NOW()` - Creation timestamp
- `updated_at TIMESTAMPTZ DEFAULT NOW()` - Update timestamp

**Optional Fields (NULLABLE):**
- `session_id INT REFERENCES debug_sessions(id) ON DELETE SET NULL` - Debug session reference
- `repro_steps TEXT` - Steps to reproduce
- `environment JSONB` - Environment context (map, room, widgets, browser, playerName)
- `logs JSONB` - Logs data (consoleErrors, clientStates, wsMessages)
- `resolution_notes TEXT` - Resolution notes and acceptance criteria
- `ticket_type TEXT DEFAULT 'bug'` - Ticket type (bug, feature, debug)
- `priority INTEGER DEFAULT 2` - Priority level (1-4)
- `estimated_effort TEXT` - Estimated effort (quick, medium, complex)
- `tags TEXT[] DEFAULT '{}'` - Array of tags
- `player_id INT REFERENCES players(id) ON DELETE SET NULL` - Player who reported
- `player_name TEXT` - Player name who reported

**Evidence:**
- `migrations/061_debug_todos.sql:15-28` - Base fields
- `migrations/062_extend_debug_todos_tickets.sql:5-11` - Ticket-specific fields
- `migrations/063_add_player_fields_to_tickets.sql:5-7` - Player fields

## 1.3 Constraints

**Check Constraints:**
1. **Priority Constraint:** `priority >= 1 AND priority <= 4`
   - Location: `migrations/067_update_priority_system.sql:12-13`
   - Enforced at database level

2. **Ticket Type Constraint:** `ticket_type IN ('bug', 'feature', 'debug')`
   - Location: `migrations/068_update_ticket_types.sql:21-22`
   - Enforced at database level

**Foreign Key Constraints:**
- `session_id` → `debug_sessions(id) ON DELETE SET NULL`
  - Location: `migrations/061_debug_todos.sql:17`
- `player_id` → `players(id) ON DELETE SET NULL`
  - Location: `migrations/062_extend_debug_todos_tickets.sql:10`

**Evidence:**
- `migrations/067_update_priority_system.sql:12-13` - Priority constraint
- `migrations/068_update_ticket_types.sql:21-22` - Type constraint

## 1.4 Indexes

**Indexes Created:**
1. `idx_debug_todos_status` - Status filtering
   - Location: `migrations/061_debug_todos.sql:31`
   - Column: `status`

2. `idx_debug_todos_priority` - Priority ordering
   - Location: `migrations/062_extend_debug_todos_tickets.sql:22`
   - Columns: `(priority DESC, created_at ASC)`

3. `idx_debug_todos_type` - Type filtering
   - Location: `migrations/062_extend_debug_todos_tickets.sql:23`
   - Column: `ticket_type`

4. `idx_debug_todos_status_priority` - Status and priority filtering
   - Location: `migrations/062_extend_debug_todos_tickets.sql:24`
   - Columns: `(status, priority DESC)`

5. `idx_debug_todos_player_id` - Player filtering
   - Location: `migrations/062_extend_debug_todos_tickets.sql:25`
   - Column: `player_id`

6. `idx_debug_todos_status_not_deleted` - Filter deleted tickets
   - Location: `migrations/065_add_ticket_deleted_status.sql:12`
   - Column: `status` WHERE `status != 'deleted'`

7. `idx_debug_todos_status_backlog` - Backlog filtering
   - Location: `migrations/066_add_backlog_status.sql:8`
   - Column: `status` WHERE `status = 'backlog'`

**Evidence:**
- All migration files listed above

---

# 2. All Fields, Defaults, Nullability, Constraints

## 2.1 Field Specifications

| Field | Type | Nullable | Default | Constraints | Evidence |
|-------|------|----------|---------|-------------|----------|
| `id` | SERIAL | NO | Auto-increment | PRIMARY KEY | `migrations/061_debug_todos.sql:16` |
| `session_id` | INT | YES | NULL | FOREIGN KEY → debug_sessions(id) | `migrations/061_debug_todos.sql:17` |
| `status` | TEXT | NO | 'open' | NOT NULL | `migrations/061_debug_todos.sql:18` |
| `title` | TEXT | NO | None | NOT NULL | `migrations/061_debug_todos.sql:19` |
| `description` | TEXT | NO | None | NOT NULL | `migrations/061_debug_todos.sql:20` |
| `repro_steps` | TEXT | YES | NULL | None | `migrations/061_debug_todos.sql:21` |
| `environment` | JSONB | YES | NULL | None | `migrations/061_debug_todos.sql:22` |
| `logs` | JSONB | YES | NULL | None | `migrations/061_debug_todos.sql:23` |
| `resolution_notes` | TEXT | YES | NULL | None | `migrations/061_debug_todos.sql:24` |
| `created_by` | TEXT | NO | 'zork' | NOT NULL | `migrations/061_debug_todos.sql:25` |
| `created_at` | TIMESTAMPTZ | NO | NOW() | NOT NULL | `migrations/061_debug_todos.sql:26` |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | NOT NULL | `migrations/061_debug_todos.sql:27` |
| `ticket_type` | TEXT | NO | 'bug' | CHECK (IN ('bug', 'feature', 'debug')) | `migrations/068_update_ticket_types.sql:14,21-22` |
| `priority` | INTEGER | NO | 2 | CHECK (>= 1 AND <= 4) | `migrations/062_extend_debug_todos_tickets.sql:7`, `migrations/067_update_priority_system.sql:12-13` |
| `estimated_effort` | TEXT | YES | NULL | None | `migrations/062_extend_debug_todos_tickets.sql:8` |
| `tags` | TEXT[] | NO | '{}' | None | `migrations/062_extend_debug_todos_tickets.sql:9` |
| `player_id` | INT | YES | NULL | FOREIGN KEY → players(id) | `migrations/062_extend_debug_todos_tickets.sql:10` |
| `player_name` | TEXT | YES | NULL | None | `migrations/062_extend_debug_todos_tickets.sql:11` |

## 2.2 Status Values

**Valid Statuses:**
- `'open'` - New ticket, not yet worked on
- `'backlog'` - Filed but not actively worked on
- `'in_progress'` - Being worked on by Cursor
- `'resolved'` - Fixed and completed
- `'deleted'` - Soft-deleted (Cursor ignores)

**Evidence:**
- `models/ticket.js:16` - TICKET_STATUSES constant
- `migrations/066_add_backlog_status.sql:5` - Status comment
- `migrations/065_add_ticket_deleted_status.sql:9` - Deleted status comment

## 2.3 Ticket Types

**Valid Types:**
- `'bug'` - Fixing broken functionality (default)
- `'feature'` - New game enhancement
- `'debug'` - From telemetry/ZORK observation

**Evidence:**
- `migrations/068_update_ticket_types.sql:5,21-22` - Type constraint and comment
- `models/ticket.js:21` - TICKET_TYPES constant (includes 'manual', 'user' but these are deprecated)

## 2.4 Priority Levels

**Priority System:**
- **1 (Low)** - Low priority issues
- **2 (Medium)** - Standard priority (default)
- **3 (High)** - High priority issues
- **4 (Critical)** - Critical issues (processed first, exclusively)

**Evidence:**
- `migrations/067_update_priority_system.sql:5,12-13` - Priority constraint
- `models/ticket.js:26,31-36` - TICKET_PRIORITIES and PRIORITY_LABELS

## 2.5 Estimated Effort

**Valid Values:**
- `'quick'` - Quick fix
- `'medium'` - Medium complexity
- `'complex'` - Complex implementation

**Evidence:**
- `migrations/062_extend_debug_todos_tickets.sql:30` - Comment mentions these values

---

# 3. All Subsystem Operations (Read/Write/Mutate)

## 3.1 Write Operations

### `createDebugTodo()`
**Location:** `database.js:3178-3198`

**Parameters:**
- `sessionId` (optional) - Debug session ID
- `title` (required) - Ticket title
- `description` (required) - Ticket description
- `reproSteps` (optional) - Steps to reproduce
- `environment` (optional) - Environment JSON object
- `logs` (optional) - Logs JSON object
- `createdBy` (default: 'zork') - Creator identifier
- `ticketType` (default: 'bug') - Ticket type
- `priority` (default: 2) - Priority level
- `playerId` (optional) - Player ID
- `playerName` (optional) - Player name

**Validations:**
- Priority must be between 1 and 4 (`database.js:3180-3182`)
- Ticket type must be one of: 'bug', 'feature', 'debug' (`database.js:3185-3188`)

**Behavior:**
- Validates priority and ticket type
- JSON stringifies environment and logs
- Inserts into `debug_todos` table
- Returns created ticket row

**Evidence:**
- `database.js:3178-3198` - Full implementation

### `createTicket()` (Service Layer)
**Location:** `services/ticketService.js:92-122`

**Parameters:**
- `db` - Database module
- `payload` - Ticket data object

**Behavior:**
- Validates ticket using `TicketModel.validateTicket()`
- Creates ticket payload using `TicketModel.createTicketPayload()`
- Calls `db.createDebugTodo()`
- Returns normalized ticket object

**Evidence:**
- `services/ticketService.js:92-122` - Full implementation

### `createZorkTicket()` (Handler)
**Location:** `handlers/game.js:6114-6198`

**Parameters:**
- `ctx` - Handler context
- `data` - Ticket data from client

**Validations:**
- Title required (`handlers/game.js:6125-6128`)
- Priority must be 1-4 (`handlers/game.js:6131-6134`)
- Ticket type must be valid (`handlers/game.js:6137-6141`)

**Behavior:**
- Validates input
- Creates ticket via `db.createDebugTodo()`
- Creates trigger file in `.tickets/` directory (`handlers/game.js:6167-6193`)
- Sends `zorkTicketCreated` message to client
- Returns ticket ID

**Evidence:**
- `handlers/game.js:6114-6198` - Full implementation

### `createTicket()` (ZORK Action)
**Location:** `scripts/zork-ai-agent.cjs:2626-2704`

**Parameters:**
- `title` (required)
- `description` (required)
- `reproSteps` (optional)
- `priority` (default: 2)
- `ticketType` (default: 'manual')
- `estimatedEffort` (optional)
- `tags` (optional array)
- `environment` (optional)
- `logs` (optional)

**Validations:**
- Title and description required (`scripts/zork-ai-agent.cjs:2640-2642`)
- Priority must be 1-4 (`scripts/zork-ai-agent.cjs:2645-2647`)

**Behavior:**
- Creates ticket via `db.createDebugTodo()`
- Updates ticket-specific fields (type, priority, effort, tags)
- Creates trigger file in `.tickets/` directory (`scripts/zork-ai-agent.cjs:2672-2697`)
- Returns updated ticket

**Evidence:**
- `scripts/zork-ai-agent.cjs:2626-2704` - Full implementation

## 3.2 Update Operations

### `updateDebugTodo()`
**Location:** `database.js:3249-3315`

**Parameters:**
- `id` (required) - Ticket ID
- `updates` (object) - Fields to update:
  - `status` (optional) - New status
  - `resolutionNotes` (optional) - Resolution notes
  - `title` (optional) - New title
  - `description` (optional) - New description
  - `priority` (optional) - New priority
  - `tags` (optional) - New tags array
  - `ticketType` (optional) - New ticket type

**Validations:**
- Status must be valid: 'open', 'backlog', 'in_progress', 'resolved', 'deleted' (`database.js:3256-3259`)
- Priority must be 1-4 (`database.js:3280-3283`)
- Ticket type must be valid: 'bug', 'feature', 'debug' (`database.js:3295-3298`)

**Behavior:**
- Builds dynamic UPDATE query based on provided fields
- Always updates `updated_at` timestamp
- JSON stringifies tags array
- Returns updated ticket row or null if not found

**Evidence:**
- `database.js:3249-3315` - Full implementation

### `updateTicket()` (Service Layer)
**Location:** `services/ticketService.js:131-148`

**Parameters:**
- `db` - Database module
- `id` - Ticket ID
- `payload` - Update data

**Behavior:**
- Prepares update payload using `TicketModel.createUpdatePayload()`
- Calls `db.updateDebugTodo()`
- Returns normalized ticket object

**Evidence:**
- `services/ticketService.js:131-148` - Full implementation

### `work_tickets_update` (MCP Tool)
**Location:** `mcp-test-server/tools/workTickets.js:149-190`

**Parameters:**
- `id` (required) - Ticket ID
- `status` (optional) - New status ('open', 'in_progress', 'resolved')
- `resolutionNotes` (optional) - Resolution notes with Acceptance Criteria

**Behavior:**
- Updates ticket status and/or resolution notes
- Always updates `updated_at` timestamp
- Returns success message with ticket details

**Evidence:**
- `mcp-test-server/tools/workTickets.js:149-190` - Full implementation

## 3.3 Read Operations

### `getDebugTodo()`
**Location:** `database.js:3239-3241`

**Parameters:**
- `id` (required) - Ticket ID

**Behavior:**
- Returns single ticket row by ID
- Returns null if not found

**Evidence:**
- `database.js:3239-3241` - Full implementation

### `listDebugTodos()`
**Location:** `database.js:3205-3232`

**Parameters:**
- `status` (optional) - Filter by status
- `limit` (default: 50) - Max results
- `includeDeleted` (default: false) - Include deleted tickets

**Behavior:**
- Filters out deleted tickets by default (`database.js:3211-3213`)
- Filters by status if provided
- Orders by `created_at DESC`
- Limits results if specified
- Returns array of ticket rows

**Evidence:**
- `database.js:3205-3232` - Full implementation

### `getOpenTickets()`
**Location:** `database.js:3351-3380`

**Parameters:**
- `limit` (default: 50) - Max results
- `priority` (optional) - Filter by priority
- `ticketType` (optional) - Filter by ticket type

**Behavior:**
- Filters by `status = 'open'`
- Optionally filters by priority and/or ticket type
- Joins with `debug_sessions` and `players` tables
- Orders by `priority DESC, created_at ASC`
- Returns array of ticket rows with session/player info

**Evidence:**
- `database.js:3351-3380` - Full implementation

### `getDebugTodosWithSession()`
**Location:** `database.js:3322-3344`

**Parameters:**
- `status` (optional) - Filter by status
- `limit` (default: 50) - Max results

**Behavior:**
- Joins with `debug_sessions` and `players` tables
- Filters by status if provided
- Orders by `created_at DESC`
- Returns array of ticket rows with session info

**Evidence:**
- `database.js:3322-3344` - Full implementation

### `work_tickets_start` (MCP Tool)
**Location:** `mcp-test-server/tools/workTickets.js:63-147`

**Parameters:**
- `limit` (default: 10) - Max tickets to process
- `priority` (optional) - Filter by priority
- `ticketType` (optional) - Filter by ticket type

**Behavior:**
- Returns tickets with status 'open' OR ('in_progress' AND no "IMPLEMENTATION COMPLETE" in resolution_notes)
- Joins with `debug_sessions` and `players` tables
- Orders by `priority DESC, created_at ASC`
- Returns formatted list and structured metadata

**Evidence:**
- `mcp-test-server/tools/workTickets.js:63-147` - Full implementation

### `auto_tickets_check` (MCP Tool)
**Location:** `mcp-test-server/tools/autoTickets.js:32-102`

**Parameters:**
- `sinceId` (default: 0) - Only tickets with ID > sinceId
- `limit` (default: 10) - Max results

**Behavior:**
- Gets open tickets created after specified ID
- Joins with `debug_sessions` and `players` tables
- Orders by `priority DESC, created_at ASC`
- Returns formatted list and structured metadata

**Evidence:**
- `mcp-test-server/tools/autoTickets.js:32-102` - Full implementation

## 3.4 Delete Operations

### `deleteTicket()` (Service Layer)
**Location:** `services/ticketService.js:156-169`

**Parameters:**
- `db` - Database module
- `id` - Ticket ID

**Behavior:**
- Soft delete: Sets `status = 'deleted'`
- Returns updated ticket object

**Evidence:**
- `services/ticketService.js:156-169` - Full implementation

## 3.5 Helper Operations

### `updateTicketPriority()`
**Location:** `database.js:3388-3398`

**Parameters:**
- `id` (required) - Ticket ID
- `priority` (required) - New priority (1-4)

**Validations:**
- Priority must be 1-4 (`database.js:3389-3391`)

**Behavior:**
- Updates priority and `updated_at` timestamp
- Returns updated ticket row or null if not found

**Evidence:**
- `database.js:3388-3398` - Full implementation

### `addTicketTag()`
**Location:** `database.js:3406-3428`

**Parameters:**
- `id` (required) - Ticket ID
- `tag` (required) - Tag to add

**Behavior:**
- Gets current tags from ticket
- Parses tags if stored as string
- Adds tag if not already present
- Updates tags array and `updated_at` timestamp
- Returns updated ticket row

**Evidence:**
- `database.js:3406-3428` - Full implementation

---

# 4. Validations + Missing Validations

## 4.1 Validations Enforced

### Title Validation
- **Location:** `handlers/game.js:6125-6128`, `models/ticket.js:194-196`
- **Rule:** Title is required and must be non-empty
- **Enforcement:** Application-level validation
- **Error:** "Ticket title is required"

### Title Length Validation
- **Location:** `models/ticket.js:197-199`
- **Rule:** Title must be 200 characters or less
- **Enforcement:** Application-level validation
- **Error:** "Title must be 200 characters or less"

### Priority Validation
- **Location:** `database.js:3180-3182`, `database.js:3280-3283`, `migrations/067_update_priority_system.sql:12-13`
- **Rule:** Priority must be between 1 and 4
- **Enforcement:** Database CHECK constraint AND application-level validation
- **Error:** "Invalid priority: {priority}. Must be between 1 and 4."

### Ticket Type Validation
- **Location:** `database.js:3185-3188`, `database.js:3295-3298`, `migrations/068_update_ticket_types.sql:21-22`
- **Rule:** Ticket type must be 'bug', 'feature', or 'debug'
- **Enforcement:** Database CHECK constraint AND application-level validation
- **Error:** "Invalid ticket_type: {type}. Must be one of: bug, feature, debug"

### Status Validation
- **Location:** `database.js:3256-3259`, `models/ticket.js:200-202`
- **Rule:** Status must be valid: 'open', 'backlog', 'in_progress', 'resolved', 'deleted'
- **Enforcement:** Application-level validation
- **Error:** "Invalid status: {status}. Must be one of: open, backlog, in_progress, resolved, deleted"

### Description Validation (ZORK)
- **Location:** `scripts/zork-ai-agent.cjs:2640-2642`
- **Rule:** Description is required for ZORK-created tickets
- **Enforcement:** Application-level validation
- **Error:** "title and description are required"

## 4.2 Missing Validations

### Description Length Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Description should have reasonable length limits
- **Current:** No maximum length constraint on TEXT field
- **Impact:** Low - PostgreSQL TEXT can be very large, but extremely long descriptions may impact performance

### Repro Steps Length Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Repro steps should have reasonable length limits
- **Current:** No maximum length constraint on TEXT field
- **Impact:** Low - Similar to description

### Resolution Notes Length Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Resolution notes should have reasonable length limits
- **Current:** No maximum length constraint on TEXT field
- **Impact:** Low - Similar to description

### Tags Array Validation
- **Status:** PARTIALLY ENFORCED
- **Expected:** Tags should be array of strings, each tag should have reasonable length
- **Current:** Tags stored as TEXT[] array, but no validation on individual tag length or count
- **Impact:** Low - Database enforces array type, but no limits on tag content

### Environment/Logs JSON Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Environment and logs should be valid JSON
- **Current:** JSONB type enforces valid JSON at database level, but no schema validation
- **Impact:** Low - Database enforces valid JSON, but no structure validation

### Player ID Validation
- **Status:** PARTIALLY ENFORCED
- **Expected:** Player ID should reference valid player
- **Current:** Foreign key constraint enforces valid player ID, but no validation that player exists when creating ticket
- **Impact:** Low - Foreign key constraint prevents invalid references

---

# 5. Behavioral Rules / Invariants

## 5.1 Enforced Invariants

### Invariant: Priority Constraint
- **Enforcement:** Database CHECK constraint (`migrations/067_update_priority_system.sql:12-13`)
- **Rule:** Priority must be between 1 and 4
- **Violation Handling:** Database rejects invalid values

### Invariant: Ticket Type Constraint
- **Enforcement:** Database CHECK constraint (`migrations/068_update_ticket_types.sql:21-22`)
- **Rule:** Ticket type must be 'bug', 'feature', or 'debug'
- **Violation Handling:** Database rejects invalid values

### Invariant: Title Required
- **Enforcement:** Database NOT NULL constraint (`migrations/061_debug_todos.sql:19`)
- **Rule:** Title must be provided
- **Violation Handling:** Database rejects NULL values

### Invariant: Description Required
- **Enforcement:** Database NOT NULL constraint (`migrations/061_debug_todos.sql:20`)
- **Rule:** Description must be provided
- **Violation Handling:** Database rejects NULL values

### Invariant: Status Required
- **Enforcement:** Database NOT NULL constraint (`migrations/061_debug_todos.sql:18`)
- **Rule:** Status must be provided
- **Violation Handling:** Database rejects NULL values, defaults to 'open'

### Invariant: Deleted Tickets Excluded
- **Enforcement:** `database.js:3211-3213` - Filters out deleted tickets by default
- **Rule:** Deleted tickets are not returned in standard queries
- **Violation Handling:** Explicit `includeDeleted = true` required to see deleted tickets

### Invariant: Critical Tickets Processed First
- **Enforcement:** `scripts/auto-ticket-processor.js:140-161` - Checks for critical tickets first
- **Rule:** If any critical (priority=4) tickets exist, process ONLY those
- **Violation Handling:** Other tickets skipped until critical resolved

### Invariant: In-Progress with IMPLEMENTATION COMPLETE Skipped
- **Enforcement:** `mcp-test-server/tools/workTickets.js:77` - Filters out in_progress tickets with "IMPLEMENTATION COMPLETE"
- **Rule:** Tickets in_progress with "IMPLEMENTATION COMPLETE" are waiting for user testing
- **Violation Handling:** These tickets are excluded from work queue

## 5.2 Unenforced Rules

### Invariant: Status Transition Rules
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Status transitions should follow: open → in_progress → resolved
- **Current:** Any status can be set to any other status
- **Impact:** Medium - Invalid transitions possible (e.g., resolved → open)

### Invariant: One Ticket Per Bug
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Should prevent duplicate tickets for same issue
- **Current:** No duplicate detection
- **Impact:** Low - May create duplicate tickets

### Invariant: Resolution Notes Required for Resolved
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Resolved tickets should have resolution notes
- **Current:** Tickets can be resolved without notes
- **Impact:** Low - May resolve tickets without documentation

---

# 6. State Transitions (with File References)

## 6.1 Ticket Lifecycle

### Creation Flow
1. **Ticket created** → `status = 'open'`, `created_at` set, `updated_at` set
   - Location: `database.js:3191-3195` - INSERT with status='open'
   - Location: `handlers/game.js:6148-6157` - createZorkTicket handler
   - Location: `scripts/zork-ai-agent.cjs:2650-2658` - ZORK createTicket action

2. **Trigger file created** → `.tickets/ticket-{id}.trigger` file written
   - Location: `handlers/game.js:6178-6187` - Trigger file creation
   - Location: `scripts/zork-ai-agent.cjs:2683-2691` - ZORK trigger file creation
   - Contains: ticketId, title, priority, ticketType, createdBy, timestamp

3. **Auto-processor detects** → Creates `.tickets/ticket-{id}.processing` file
   - Location: `scripts/auto-ticket-processor.js:47-133` - processTicket function
   - Location: `scripts/auto-ticket-processor.js:107-119` - Processing file creation

4. **Status updated to in_progress** → Cursor is working on ticket
   - Location: `scripts/auto-ticket-processor.js:93-100` - Status update
   - Location: `mcp-test-server/tools/workTickets.js:154-157` - MCP tool update

### Update Flow
1. **Ticket updated** → `updated_at` timestamp updated
   - Location: `database.js:3303` - Always updates updated_at
   - Location: `mcp-test-server/tools/workTickets.js:171` - MCP tool updates updated_at

2. **Resolution notes added** → Contains "IMPLEMENTATION COMPLETE" when ready for testing
   - Location: `mcp-test-server/tools/workTickets.js:159-162` - Resolution notes update
   - Format: "IMPLEMENTATION COMPLETE - Ready for Testing\n\n[Description]\n\nACCEPTANCE CRITERIA:\n- [ ] [Test step]"

### Resolution Flow
1. **Ticket resolved** → `status = 'resolved'`
   - Location: `database.js:3254-3261` - Status update validation
   - Location: `mcp-test-server/tools/workTickets.js:154-157` - MCP tool status update

2. **Ticket excluded from work queue** → No longer appears in open tickets
   - Location: `database.js:3357` - Filters by status='open'
   - Location: `mcp-test-server/tools/workTickets.js:76` - Filters out resolved

### Deletion Flow
1. **Ticket soft-deleted** → `status = 'deleted'`
   - Location: `services/ticketService.js:158` - Sets status='deleted'
   - Location: `database.js:3254-3261` - Status validation allows 'deleted'

2. **Ticket excluded from queries** → Not returned unless `includeDeleted = true`
   - Location: `database.js:3211-3213` - Filters out deleted by default

---

# 7. Interactions with Other Systems

## 7.1 ZORK AI Agent Integration

**Integration Points:**
- **Ticket Creation:** `scripts/zork-ai-agent.cjs:2626-2704` - `createTicket` action
- **Ticket Reading:** `scripts/zork-ai-agent.cjs:2707-2750` - `getTickets`/`listTickets` actions
- **Ticket Observation:** `scripts/zork-ai-agent.cjs:674-782` - `synthesizeDebugTodo` function

**Behavior:**
- ZORK can create tickets from observations or direct requests
- ZORK can read and summarize tickets
- ZORK creates trigger files for auto-processing
- Tickets linked to debug sessions when created from telemetry

**Evidence:**
- `scripts/zork-ai-agent.cjs:2626-2704` - Ticket creation
- `scripts/zork-ai-agent.cjs:2707-2750` - Ticket reading

## 7.2 Cursor MCP Integration

**Integration Points:**
- **Work Tickets:** `mcp-test-server/tools/workTickets.js` - `work_tickets_start`, `work_tickets_update`
- **Auto Tickets:** `mcp-test-server/tools/autoTickets.js` - `auto_tickets_check`
- **Debug Todos:** `mcp-test-server/tools/debugTodos.js` - Debug todo operations

**Behavior:**
- Cursor can list tickets to work on
- Cursor can update ticket status and resolution notes
- Cursor can check for new tickets automatically
- Cursor processes tickets sequentially by priority

**Evidence:**
- `mcp-test-server/tools/workTickets.js:60-205` - Work ticket tools
- `mcp-test-server/tools/autoTickets.js:29-117` - Auto ticket tools

## 7.3 Auto-Ticket Processor Integration

**Integration Points:**
- **Trigger File Watching:** `scripts/auto-ticket-processor.js:194-220` - Watches `.tickets/` directory
- **Database Polling:** `scripts/auto-ticket-processor.js:138-189` - Polls for new tickets
- **Processing File Creation:** `scripts/auto-ticket-processor.js:107-119` - Creates `.processing` files

**Behavior:**
- Watches for trigger files created when tickets are created
- Polls database for new open tickets every 2 seconds
- Creates processing files for Cursor to detect
- Marks tickets as in_progress when processing
- Prioritizes critical tickets (priority=4)

**Evidence:**
- `scripts/auto-ticket-processor.js:47-270` - Full implementation

## 7.4 Game Handler Integration

**Integration Points:**
- **User Ticket Creation:** `handlers/game.js:6114-6198` - `createZorkTicket` handler
- **God Mode Ticket Creation:** `handlers/game.js:6203-6290` - `createTicket` handler
- **Ticket Retrieval:** `handlers/game.js:6295-6340` - `getTickets` handler

**Behavior:**
- Players can create tickets via UI
- God-mode players can create tickets via editor
- Tickets retrieved via WebSocket messages
- Trigger files created for auto-processing

**Evidence:**
- `handlers/game.js:6114-6198` - User ticket creation
- `handlers/game.js:6203-6290` - God mode ticket creation

## 7.5 Ticket Service Integration

**Integration Points:**
- **Service Layer:** `services/ticketService.js` - All ticket operations
- **Model Layer:** `models/ticket.js` - Ticket normalization and validation

**Behavior:**
- Provides async service layer for ticket operations
- Normalizes database rows to ticket objects
- Validates ticket data
- Handles auto-refresh polling

**Evidence:**
- `services/ticketService.js:1-362` - Full service implementation
- `models/ticket.js:1-267` - Full model implementation

## 7.6 Debug Session Integration

**Integration Points:**
- **Session Reference:** `debug_todos.session_id` → `debug_sessions.id`
- **Session Creation:** `mcp-test-server/tools/debugTodos.js` - Debug session tools

**Behavior:**
- Tickets can be linked to debug observation sessions
- Session provides telemetry context for tickets
- Session info included in ticket queries

**Evidence:**
- `migrations/061_debug_todos.sql:17` - Foreign key to debug_sessions
- `database.js:3324-3327` - Join with debug_sessions in queries

---

# 8. Failure States and Messages

## 8.1 Creation Failures

### Missing Title
- **Error:** "Ticket title is required"
- **Location:** `handlers/game.js:6126`, `models/ticket.js:194-196`
- **Recovery:** Operation fails, error sent to client

### Invalid Priority
- **Error:** "Priority must be between 1 (low) and 4 (critical)" or "Invalid priority: {priority}. Must be between 1 and 4."
- **Location:** `handlers/game.js:6132`, `database.js:3180-3182`
- **Recovery:** Operation fails, error sent to client

### Invalid Ticket Type
- **Error:** "Ticket type must be one of: bug, feature, debug" or "Invalid ticket_type: {type}. Must be one of: bug, feature, debug"
- **Location:** `handlers/game.js:6139`, `database.js:3186-3188`
- **Recovery:** Operation fails, error sent to client

### Database Constraint Violation
- **Error:** Database constraint error (priority or ticket_type)
- **Location:** Database level
- **Recovery:** Operation fails, error returned

### Trigger File Creation Failure
- **Error:** Logged as warning, non-fatal
- **Location:** `handlers/game.js:6190-6192`, `scripts/zork-ai-agent.cjs:2694-2696`
- **Recovery:** Ticket created successfully, but trigger file not created (auto-processor will poll database)

## 8.2 Update Failures

### Invalid Status
- **Error:** "Invalid status: {status}. Must be one of: open, backlog, in_progress, resolved, deleted"
- **Location:** `database.js:3257-3259`
- **Recovery:** Operation fails, error returned

### Invalid Priority
- **Error:** "Invalid priority: {priority}. Must be between 1 and 4."
- **Location:** `database.js:3281-3283`
- **Recovery:** Operation fails, error returned

### Ticket Not Found
- **Error:** "Ticket {id} not found" or null returned
- **Location:** `database.js:3314`, `services/ticketService.js:140`
- **Recovery:** Operation fails, error returned

## 8.3 Read Failures

### Ticket Not Found
- **Behavior:** Returns null
- **Location:** `database.js:3240`
- **Recovery:** Normal behavior, caller handles null

### Database Connection Error
- **Error:** Database connection error
- **Location:** Database level
- **Recovery:** Operation fails, error propagated

## 8.4 Missing Failure Handling

### No Transaction Support
- **Status:** NOT IMPLEMENTED
- **Impact:** Partial failures may leave inconsistent state
- **Location:** All operations are non-transactional

### No Retry Logic
- **Status:** NOT IMPLEMENTED
- **Impact:** Transient failures cause permanent failures
- **Location:** No retry mechanisms in any operations

### No Validation for Duplicate Titles
- **Status:** NOT IMPLEMENTED
- **Impact:** Duplicate tickets may be created
- **Location:** No duplicate detection

---

# 9. Serialization Paths

## 9.1 WebSocket Message Formats

### `zorkTicketCreated` Message
**Location:** `handlers/game.js:6159-6163`

**Format:**
```json
{
  "type": "zorkTicketCreated",
  "ticketId": 123,
  "message": "Ticket #123 created successfully. ZORK will review it shortly."
}
```

**Fields:**
- `type` - Message type
- `ticketId` - Created ticket ID
- `message` - Success message

### `ticketCreated` Message
**Location:** `handlers/game.js:6280-6283`

**Format:**
```json
{
  "type": "ticketCreated",
  "ticket": { /* full ticket object */ }
}
```

**Fields:**
- `type` - Message type
- `ticket` - Complete ticket object

### `tickets` Message
**Location:** `handlers/game.js:6315-6320`

**Format:**
```json
{
  "type": "tickets",
  "tickets": [ /* array of ticket objects */ ]
}
```

**Fields:**
- `type` - Message type
- `tickets` - Array of normalized ticket objects

## 9.2 MCP Tool Response Formats

### `work_tickets_start` Response
**Location:** `mcp-test-server/tools/workTickets.js:127-146`

**Format:**
```json
{
  "content": [{ "type": "text", "text": "Found X tickets..." }],
  "metadata": {
    "ticketCount": 5,
    "tickets": [ /* structured ticket data */ ],
    "workflow": "sequential"
  }
}
```

**Fields:**
- `content` - Formatted text for display
- `metadata` - Structured data for programmatic processing

### `work_tickets_update` Response
**Location:** `mcp-test-server/tools/workTickets.js:184-189`

**Format:**
```json
{
  "content": [{
    "type": "text",
    "text": "✅ Ticket #123 updated!\nStatus: in_progress\n..."
  }]
}
```

### `auto_tickets_check` Response
**Location:** `mcp-test-server/tools/autoTickets.js:81-101`

**Format:**
```json
{
  "content": [{ "type": "text", "text": "Found X new tickets..." }],
  "metadata": {
    "ticketCount": 3,
    "tickets": [ /* structured ticket data */ ],
    "lastCheckedId": 150,
    "shouldProcess": true
  }
}
```

## 9.3 File System Formats

### Trigger File Format
**Location:** `handlers/game.js:6180-6187`, `scripts/zork-ai-agent.cjs:2684-2691`

**Path:** `.tickets/ticket-{id}.trigger`

**Format:**
```json
{
  "ticketId": 123,
  "title": "Ticket title",
  "priority": 3,
  "ticketType": "bug",
  "createdBy": "player_name",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Processing File Format
**Location:** `scripts/auto-ticket-processor.js:108-119`

**Path:** `.tickets/ticket-{id}.processing`

**Format:**
```json
{
  "ticketId": 123,
  "title": "Ticket title",
  "description": "Ticket description",
  "priority": 3,
  "ticket_type": "bug",
  "created_at": "2024-01-01T00:00:00.000Z",
  "created_by": "player_name",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "status": "in_progress",
  "cursorProcessing": true
}
```

## 9.4 Ticket Model Normalization

**Location:** `models/ticket.js:65-88`

**Normalization:**
- Database snake_case → camelCase for client
- JSON fields parsed from strings
- Tags array normalized from various formats
- Default values applied for missing fields

**Evidence:**
- `models/ticket.js:65-88` - `mapRowToTicket()` function
- `models/ticket.js:105-113` - `parseJsonField()` function
- `models/ticket.js:120-134` - `parseTagsField()` function

---

# 10. Known Gaps, Missing Features, or TODOs

## 10.1 Missing Validations

1. **Description Length Limits**
   - Status: NOT IMPLEMENTED
   - Impact: Extremely long descriptions may impact performance
   - Recommendation: Add reasonable length limit (e.g., 10,000 characters)

2. **Repro Steps Length Limits**
   - Status: NOT IMPLEMENTED
   - Impact: Similar to description
   - Recommendation: Add reasonable length limit

3. **Resolution Notes Length Limits**
   - Status: NOT IMPLEMENTED
   - Impact: Similar to description
   - Recommendation: Add reasonable length limit

4. **Tags Validation**
   - Status: PARTIAL (array type enforced, but no content validation)
   - Impact: Invalid tag content possible
   - Recommendation: Validate tag length and format

5. **Environment/Logs Schema Validation**
   - Status: NOT IMPLEMENTED
   - Impact: Invalid JSON structure possible
   - Recommendation: Add JSON schema validation

## 10.2 Missing Features

1. **Status Transition Validation**
   - Status: NOT IMPLEMENTED
   - Impact: Invalid transitions possible (e.g., resolved → open)
   - Recommendation: Add state machine validation

2. **Duplicate Ticket Detection**
   - Status: NOT IMPLEMENTED
   - Impact: Duplicate tickets may be created
   - Recommendation: Add duplicate detection based on title/description similarity

3. **Ticket Assignment**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot assign tickets to specific developers
   - Recommendation: Add assignee field

4. **Ticket Comments/Threads**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot have discussions on tickets
   - Recommendation: Add comments table

5. **Ticket Attachments**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot attach files/screenshots
   - Recommendation: Add attachments table

6. **Ticket History/Audit Log**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot track changes to tickets
   - Recommendation: Add audit log table

7. **Ticket Templates**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot create tickets from templates
   - Recommendation: Add template system

8. **Bulk Operations**
   - Status: NOT IMPLEMENTED
   - Impact: Cannot update multiple tickets at once
   - Recommendation: Add bulk update operations

9. **Ticket Search**
   - Status: PARTIAL (basic filtering exists)
   - Impact: Limited search capabilities
   - Recommendation: Add full-text search

10. **Ticket Notifications**
    - Status: NOT IMPLEMENTED
    - Impact: No notifications when tickets are created/updated
    - Recommendation: Add notification system

## 10.3 Partial Implementations

1. **Auto-Processing**
   - Status: PARTIAL (works but requires background script)
   - Impact: Requires manual setup of auto-processor
   - Recommendation: Integrate into main server process

2. **Priority Processing**
   - Status: PARTIAL (critical tickets prioritized, but no queue management)
   - Impact: No queue depth limits or throttling
   - Recommendation: Add queue management

3. **Ticket Status Workflow**
   - Status: PARTIAL (statuses exist but no enforced transitions)
   - Impact: Invalid state transitions possible
   - Recommendation: Add state machine

---

# 11. Summary of Strengths, Weaknesses, Risks

## 11.1 Strengths

1. **Comprehensive Ticket Data**
   - Rich context: environment, logs, repro steps
   - Player tracking: player_id, player_name
   - Session linking: debug_sessions integration
   - Evidence: All fields documented above

2. **Multiple Creation Paths**
   - User-created tickets via UI
   - ZORK-created tickets from observations
   - God-mode tickets via editor
   - Evidence: Multiple handlers documented

3. **Automatic Processing**
   - Trigger file system for immediate processing
   - Auto-processor for background detection
   - MCP tools for Cursor integration
   - Evidence: Auto-processor and MCP tools documented

4. **Priority System**
   - Four-level priority system (1-4)
   - Critical tickets processed exclusively
   - Database constraint enforces valid priorities
   - Evidence: Priority system documented

5. **Soft Delete Support**
   - Tickets can be soft-deleted
   - Deleted tickets excluded from queries
   - Allows recovery if needed
   - Evidence: Deleted status documented

6. **Database Constraints**
   - Priority constraint (1-4)
   - Ticket type constraint (bug, feature, debug)
   - Foreign key constraints
   - Evidence: Constraints documented

## 11.2 Weaknesses

1. **Missing Validations**
   - No length limits on text fields
   - No duplicate detection
   - No status transition validation
   - Risk: Data quality issues

2. **No Transaction Support**
   - Operations are not transactional
   - Risk: Partial failures may leave inconsistent state

3. **Limited Search Capabilities**
   - Basic filtering only
   - No full-text search
   - Risk: Difficult to find specific tickets

4. **No Audit Trail**
   - Cannot track changes to tickets
   - Risk: Difficult to debug issues

5. **No Assignment System**
   - Cannot assign tickets to developers
   - Risk: Unclear ownership

6. **No Comments/Threads**
   - Cannot have discussions on tickets
   - Risk: Limited collaboration

## 11.3 Risks

1. **Data Quality Risk**
   - No validation enforces data quality
   - Invalid data may cause issues
   - Mitigation: Add validation constraints

2. **Performance Risk**
   - No limits on text field lengths
   - Large tickets may impact performance
   - Mitigation: Add length limits

3. **Consistency Risk**
   - No transactions may cause partial updates
   - No state machine may cause invalid transitions
   - Mitigation: Add transaction support and state machine

4. **Scalability Risk**
   - No pagination for large result sets
   - No indexing for all query patterns
   - Mitigation: Add pagination and optimize indexes

5. **Usability Risk**
   - Limited search capabilities
   - No duplicate detection
   - Mitigation: Add full-text search and duplicate detection

---

# 12. Workflow Patterns

## 12.1 Ticket Creation Workflow

### User-Created Ticket
1. User submits ticket via UI
2. `createZorkTicket` handler validates and creates ticket
3. Trigger file created in `.tickets/` directory
4. Auto-processor detects trigger file or polls database
5. Processing file created for Cursor
6. Ticket marked as `in_progress`

**Evidence:**
- `handlers/game.js:6114-6198` - User ticket creation
- `scripts/auto-ticket-processor.js:47-133` - Auto-processing

### ZORK-Created Ticket
1. ZORK observes issue or receives request
2. ZORK calls `createTicket` action
3. Ticket created in database
4. Trigger file created
5. Auto-processor detects and processes
6. Ticket marked as `in_progress`

**Evidence:**
- `scripts/zork-ai-agent.cjs:2626-2704` - ZORK ticket creation

## 12.2 Ticket Processing Workflow

### Automatic Processing
1. Auto-processor polls database or detects trigger file
2. Checks for critical tickets first (priority=4)
3. If critical exists, process ONLY critical tickets
4. Otherwise, process tickets in priority order
5. Mark ticket as `in_progress`
6. Create processing file for Cursor

**Evidence:**
- `scripts/auto-ticket-processor.js:138-189` - Auto-processing logic

### Cursor Processing
1. Cursor calls `work_tickets_start` MCP tool
2. Gets list of open and in-progress tickets
3. Processes tickets sequentially by priority
4. Implements fix
5. Updates ticket with "IMPLEMENTATION COMPLETE" and Acceptance Criteria
6. Ticket stays `in_progress` for user testing
7. User tests and resolves ticket

**Evidence:**
- `mcp-test-server/tools/workTickets.js:63-147` - Work tickets tool
- `.cursorrules:230-259` - Cursor workflow rules

## 12.3 Ticket Resolution Workflow

1. Cursor implements fix
2. Cursor updates ticket with status `in_progress` and resolution notes containing "IMPLEMENTATION COMPLETE"
3. Ticket excluded from work queue (has "IMPLEMENTATION COMPLETE")
4. User tests the fix
5. User resolves ticket (status = 'resolved')
6. Ticket excluded from open tickets

**Evidence:**
- `mcp-test-server/tools/workTickets.js:77` - Filters out tickets with "IMPLEMENTATION COMPLETE"
- `.cursorrules:258-259` - Resolution workflow

---

# 13. Best Practices

## 13.1 Ticket Creation Best Practices

### Title Guidelines
- Use descriptive, specific titles
- Include key information (e.g., widget name, error type)
- Keep under 200 characters
- Examples: "MapWidget fails to render after factory entry", "Markup not rendering in chat messages"

### Description Guidelines
- Be comprehensive but concise
- Include: What happened, when it happened, what was expected
- Include relevant context (player, room, map)
- Use clear, structured format

### Repro Steps Guidelines
- Numbered steps to reproduce
- Include specific actions and expected results
- Be detailed enough for someone else to reproduce

### Priority Selection
- **Priority 4 (Critical):** Game-breaking bugs, security issues
- **Priority 3 (High):** Major functionality broken, affects many players
- **Priority 2 (Medium):** Standard bugs, minor functionality issues (default)
- **Priority 1 (Low):** Cosmetic issues, minor improvements

### Ticket Type Selection
- **bug:** Fixing broken functionality
- **feature:** New game enhancement
- **debug:** From telemetry/ZORK observation

## 13.2 Ticket Processing Best Practices

### For Cursor
1. Process tickets sequentially by priority
2. Mark ticket as `in_progress` when starting work
3. Implement fix completely
4. Add "IMPLEMENTATION COMPLETE" message with Acceptance Criteria
5. Keep status as `in_progress` for user testing
6. Store knowledge about the fix in RAG system

### For Users
1. Test fixes thoroughly
2. Verify Acceptance Criteria are met
3. Resolve ticket when satisfied
4. Provide feedback if fix doesn't work

## 13.3 Ticket Maintenance Best Practices

1. **Update tickets regularly** - Keep status current
2. **Add context** - Update description if more information found
3. **Use tags** - Tag tickets for categorization
4. **Link related tickets** - Reference related tickets in description
5. **Close resolved tickets** - Don't leave resolved tickets open

---

# 14. Integration Examples

## 14.1 Creating a Ticket from UI

```javascript
// Client sends WebSocket message
ws.send(JSON.stringify({
  type: 'createZorkTicket',
  title: 'MapWidget not rendering',
  description: 'The map widget disappears after entering factory',
  priority: 3,
  ticketType: 'bug'
}));

// Handler processes
// Creates ticket in database
// Creates trigger file
// Returns ticket ID
```

**Evidence:**
- `handlers/game.js:6114-6198` - Implementation

## 14.2 ZORK Creating a Ticket

```javascript
// ZORK action
[ACTION: createTicket]
{
  "title": "Markup not rendering in chat",
  "description": "Player reports markup appears as literal text",
  "priority": 3,
  "ticketType": "bug",
  "reproSteps": "1. Send chat message with <item> markup\n2. Observe literal text",
  "tags": ["ui", "markup", "chat"]
}
[/ACTION]
```

**Evidence:**
- `scripts/zork-ai-agent.cjs:2626-2704` - Implementation

## 14.3 Cursor Processing Tickets

```javascript
// Cursor calls MCP tool
work_tickets_start({ limit: 10 })

// Gets list of tickets
// Processes sequentially
// Updates with AC
work_tickets_update({
  id: 123,
  status: 'in_progress',
  resolutionNotes: 'IMPLEMENTATION COMPLETE - Ready for Testing\n\nFixed markup rendering...\n\nACCEPTANCE CRITERIA:\n- [ ] Chat messages with markup render correctly\n- [ ] No console errors'
})
```

**Evidence:**
- `mcp-test-server/tools/workTickets.js:60-205` - Implementation

---

# 15. Conclusion

The game-to-cursor ticketing system provides a robust foundation for feature development and debugging. Key strengths include comprehensive ticket data, multiple creation paths, automatic processing, and priority system. Areas for improvement include validation, transaction support, and enhanced search capabilities.

**Key Takeaways:**
- System supports user, ZORK, and god-mode ticket creation
- Automatic processing via trigger files and auto-processor
- Priority system ensures critical tickets processed first
- Rich context (environment, logs, repro steps) aids debugging
- MCP tools enable seamless Cursor integration

**Best Practices:**
- Use descriptive titles and comprehensive descriptions
- Set appropriate priority levels
- Include repro steps when possible
- Update tickets with "IMPLEMENTATION COMPLETE" and AC
- Test thoroughly before resolving

---

**End of Game-to-Cursor Ticketing System Canonical Specification**

