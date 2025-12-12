# Auto-Ticket-Processing System: Canonical Specification

**Analysis Date:** Based on codebase analysis  
**Scope:** Complete automatic ticket processing system for Game → Cursor workflow  
**Method:** Direct code examination with file/line citations

This document defines the **complete, code-verified canonical behavior** of the auto-ticket-processing system. All facts are grounded in real code, with file references where possible.

---

# 1. Auto-Ticket-Processing System Schema / Source of Truth

## 1.1 File System Structure

**Primary Location:** `.tickets/` directory (project root)

**Directory Creation:**
- Created automatically if it doesn't exist
- Location: `scripts/auto-ticket-processor.js:28-31` - Creates directory on startup
- Location: `handlers/game.js:6174-6176` - Creates directory when creating trigger file
- Location: `scripts/zork-ai-agent.cjs:2678-2680` - Creates directory when creating trigger file

**Evidence:**
- `scripts/auto-ticket-processor.js:22` - `TICKETS_DIR` constant
- `scripts/auto-ticket-processor.js:28-31` - Directory creation logic
- `handlers/game.js:6174-6176` - Directory creation in handler
- `scripts/zork-ai-agent.cjs:2678-2680` - Directory creation in ZORK

## 1.2 File Types

**File Types in `.tickets/` Directory:**

1. **Trigger Files:** `ticket-{id}.trigger`
   - Created when ticket is created
   - Contains ticket metadata
   - Pattern: `/^ticket-(\d+)\.trigger$/`
   - Evidence: `scripts/auto-ticket-processor.js:23` - TRIGGER_FILE_PATTERN

2. **Processing Files:** `ticket-{id}.processing`
   - Created by auto-processor
   - Contains full ticket details
   - Evidence: `scripts/auto-ticket-processor.js:107-119` - Processing file creation

3. **Last Processed File:** `.last-processed`
   - Tracks last processed ticket ID
   - Plain text file containing integer
   - Evidence: `scripts/auto-ticket-processor.js:25` - PROCESSED_FILE constant

## 1.3 Database Dependencies

**Primary Table:** `debug_todos` table (ticket system)

**Fields Used:**
- `id` - Ticket ID
- `status` - Ticket status ('open', 'in_progress', 'resolved', 'deleted', 'backlog')
- `priority` - Priority level (1-4)
- `ticket_type` - Ticket type ('bug', 'feature', 'debug')
- `title` - Ticket title
- `description` - Ticket description
- `created_at` - Creation timestamp
- `created_by` - Creator identifier
- `resolution_notes` - Resolution notes (checked for "IMPLEMENTATION COMPLETE")

**Evidence:**
- `scripts/auto-ticket-processor.js:52` - `db.getDebugTodo(ticketId)`
- `scripts/auto-ticket-processor.js:142-153` - Database queries for tickets
- `mcp-test-server/tools/autoTickets.js:37-47` - Database query for tickets

## 1.4 No Database Tables for Auto-Processing

**Status:** Auto-processing system does NOT have its own database tables
**Storage:** File system only (`.tickets/` directory)
**Evidence:**
- No migrations create tables for auto-processing
- All state stored in files (trigger files, processing files, `.last-processed`)

---

# 2. All Fields, Defaults, Nullability, Constraints

## 2.1 Trigger File Format

**File Name Pattern:** `ticket-{id}.trigger`
**Pattern Regex:** `/^ticket-(\d+)\.trigger$/`
**Location:** `scripts/auto-ticket-processor.js:23`

**File Content (JSON):**
```json
{
  "ticketId": 123,
  "title": "Ticket title",
  "priority": 3,
  "ticketType": "bug",
  "createdBy": "player_name" or "zork",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Fields:**
- `ticketId` (number) - Ticket ID
- `title` (string) - Ticket title
- `priority` (number) - Priority level (1-4)
- `ticketType` (string) - Ticket type
- `createdBy` (string) - Creator name
- `timestamp` (string) - ISO timestamp

**Evidence:**
- `handlers/game.js:6180-6187` - Trigger file content structure
- `scripts/zork-ai-agent.cjs:2684-2691` - Trigger file content structure

## 2.2 Processing File Format

**File Name Pattern:** `ticket-{id}.processing`
**Location:** `scripts/auto-ticket-processor.js:107`

**File Content (JSON):**
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

**Fields:**
- `ticketId` (number) - Ticket ID
- `title` (string) - Ticket title
- `description` (string) - Ticket description
- `priority` (number) - Priority level
- `ticket_type` (string) - Ticket type
- `created_at` (string) - Creation timestamp
- `created_by` (string) - Creator identifier
- `timestamp` (string) - Processing timestamp
- `status` (string) - Always 'in_progress'
- `cursorProcessing` (boolean) - Always true

**Evidence:**
- `scripts/auto-ticket-processor.js:108-119` - Processing file content structure

## 2.3 Last Processed File Format

**File Name:** `.last-processed`
**Location:** `scripts/auto-ticket-processor.js:25`

**File Content:**
- Plain text file
- Contains single integer (ticket ID)
- Default: `0` if file doesn't exist

**Evidence:**
- `scripts/auto-ticket-processor.js:34-42` - Last processed ID loading
- `scripts/auto-ticket-processor.js:126` - Last processed ID saving

---

# 3. All Subsystem Operations (Read/Write/Mutate)

## 3.1 Write Operations

### Create Trigger File (Handler)
**Location:** `handlers/game.js:6167-6193`

**Function:** `createZorkTicket()` handler
**Trigger:** When user creates ticket via UI

**Behavior:**
1. Creates `.tickets/` directory if it doesn't exist (`handlers/game.js:6174-6176`)
2. Creates trigger file: `ticket-{id}.trigger` (`handlers/game.js:6179`)
3. Writes JSON with ticket metadata (`handlers/game.js:6180-6187`)
4. Logs success or warning (non-fatal if fails) (`handlers/game.js:6189-6192`)

**Fields Written:**
- `ticketId` - From `ticket.id`
- `title` - From `ticket.title`
- `priority` - From `ticket.priority`
- `ticketType` - From `ticketType` parameter
- `createdBy` - From `playerData.playerName`
- `timestamp` - Current ISO timestamp

**Error Handling:**
- Non-fatal: Ticket creation succeeds even if trigger file creation fails
- Location: `handlers/game.js:6190-6192` - Catches error, logs warning, continues

**Evidence:**
- `handlers/game.js:6167-6193` - Full trigger file creation logic

### Create Trigger File (ZORK)
**Location:** `scripts/zork-ai-agent.cjs:2671-2697`

**Function:** `createTicket` action handler
**Trigger:** When ZORK creates ticket via action

**Behavior:**
1. Creates `.tickets/` directory if it doesn't exist (`scripts/zork-ai-agent.cjs:2678-2680`)
2. Creates trigger file: `ticket-{id}.trigger` (`scripts/zork-ai-agent.cjs:2683`)
3. Writes JSON with ticket metadata (`scripts/zork-ai-agent.cjs:2684-2691`)
4. Logs success or warning (non-fatal if fails) (`scripts/zork-ai-agent.cjs:2693-2696`)

**Fields Written:**
- `ticketId` - From `updatedTicket.id`
- `title` - From `title` parameter
- `priority` - From `priority` parameter
- `ticketType` - From `ticketType` parameter
- `createdBy` - Always 'zork'
- `timestamp` - Current ISO timestamp

**Error Handling:**
- Non-fatal: Ticket creation succeeds even if trigger file creation fails
- Location: `scripts/zork-ai-agent.cjs:2694-2696` - Catches error, logs warning, continues

**Evidence:**
- `scripts/zork-ai-agent.cjs:2671-2697` - Full trigger file creation logic

### Create Processing File
**Location:** `scripts/auto-ticket-processor.js:107-119`

**Function:** `processTicket()` function
**Trigger:** When auto-processor detects new ticket

**Behavior:**
1. Creates processing file: `ticket-{id}.processing` (`scripts/auto-ticket-processor.js:107`)
2. Writes JSON with full ticket details (`scripts/auto-ticket-processor.js:108-119`)
3. Includes all ticket fields plus processing metadata

**Fields Written:**
- `ticketId` - From `ticket.id`
- `title` - From `ticket.title`
- `description` - From `ticket.description`
- `priority` - From `ticket.priority`
- `ticket_type` - From `ticket.ticket_type`
- `created_at` - From `ticket.created_at`
- `created_by` - From `ticket.created_by`
- `timestamp` - Current ISO timestamp
- `status` - Always 'in_progress'
- `cursorProcessing` - Always true

**Evidence:**
- `scripts/auto-ticket-processor.js:107-119` - Processing file creation

### Update Last Processed ID
**Location:** `scripts/auto-ticket-processor.js:125-126`

**Function:** `processTicket()` function
**Trigger:** After successfully processing a ticket

**Behavior:**
1. Updates `lastProcessedId` to max of current and ticket ID
2. Writes to `.last-processed` file as plain text integer

**Evidence:**
- `scripts/auto-ticket-processor.js:125-126` - Last processed ID update

### Update Ticket Status to in_progress
**Location:** `scripts/auto-ticket-processor.js:93-100`

**Function:** `processTicket()` function
**Trigger:** When processing a ticket

**Behavior:**
1. Updates ticket status to 'in_progress' in database
2. Updates `updated_at` timestamp
3. Non-fatal: Continues even if update fails

**Evidence:**
- `scripts/auto-ticket-processor.js:93-100` - Status update logic

## 3.2 Read Operations

### Read Last Processed ID
**Location:** `scripts/auto-ticket-processor.js:34-42`

**Function:** Startup initialization
**Behavior:**
1. Checks if `.last-processed` file exists
2. Reads file content
3. Parses as integer
4. Defaults to 0 if file doesn't exist or parse fails

**Evidence:**
- `scripts/auto-ticket-processor.js:34-42` - Last processed ID loading

### Read Trigger Files
**Location:** `scripts/auto-ticket-processor.js:194-220`

**Function:** `checkTriggerFiles()`
**Behavior:**
1. Reads all files in `.tickets/` directory
2. Matches files against trigger pattern: `/^ticket-(\d+)\.trigger$/`
3. Extracts ticket ID from filename
4. Processes tickets with ID > lastProcessedId

**Evidence:**
- `scripts/auto-ticket-processor.js:196-216` - Trigger file reading logic

### Query Database for New Tickets
**Location:** `scripts/auto-ticket-processor.js:138-189`

**Function:** `checkForNewTickets()`
**Behavior:**
1. **First:** Checks for critical tickets (priority=4) (`scripts/auto-ticket-processor.js:142-161`)
   - Query: `status = 'open' AND priority = 4 AND id > lastProcessedId`
   - Orders by `created_at ASC`
   - Limits to 1 ticket
   - If found, processes ONLY critical tickets (returns early)

2. **Otherwise:** Gets open tickets in priority order (`scripts/auto-ticket-processor.js:164-185`)
   - Query: `status = 'open' AND id > lastProcessedId`
   - Excludes deleted and backlog tickets
   - Orders by `priority DESC, created_at ASC`
   - Limits to 10 tickets

**Evidence:**
- `scripts/auto-ticket-processor.js:138-189` - Database query logic

### Query Database for Tickets (MCP Tool)
**Location:** `mcp-test-server/tools/autoTickets.js:37-47`

**Function:** `auto_tickets_check` MCP tool
**Behavior:**
1. Queries open tickets with `id > sinceId`
2. Joins with `debug_sessions` and `players` tables
3. Orders by `priority DESC, created_at ASC`
4. Limits to specified limit (default: 10)

**Evidence:**
- `mcp-test-server/tools/autoTickets.js:37-47` - MCP tool query

## 3.3 Delete Operations

### Delete Trigger File
**Location:** `scripts/auto-ticket-processor.js:204-213`

**Function:** `checkTriggerFiles()` after processing
**Behavior:**
1. Deletes trigger file after processing ticket
2. Logs success or error
3. Non-fatal: Continues even if deletion fails

**Evidence:**
- `scripts/auto-ticket-processor.js:204-213` - Trigger file deletion

### Processing File Cleanup
**Status:** NOT IMPLEMENTED IN CODE
**Expected:** Processing files should be deleted after Cursor picks them up
**Current:** No automatic cleanup of processing files
**Evidence:** No code found that deletes processing files

---

# 4. Validations + Missing Validations

## 4.1 Validations Enforced

### Ticket ID Validation
- **Location:** `scripts/auto-ticket-processor.js:201-202` - Extracts ID from filename, checks `ticketId > lastProcessedId`
- **Rule:** Only processes tickets with ID greater than last processed ID
- **Enforcement:** Application-level validation

### Ticket Status Validation
- **Location:** `scripts/auto-ticket-processor.js:58-86` - Multiple status checks
- **Rules:**
  - Skips deleted tickets (`scripts/auto-ticket-processor.js:59-62`)
  - Skips backlog tickets (`scripts/auto-ticket-processor.js:64-68`)
  - Skips resolved tickets (`scripts/auto-ticket-processor.js:71-74`)
  - Skips in_progress tickets with "IMPLEMENTATION COMPLETE" (`scripts/auto-ticket-processor.js:77-80`)
  - Only processes open or in_progress tickets (`scripts/auto-ticket-processor.js:83-86`)

### Ticket Existence Validation
- **Location:** `scripts/auto-ticket-processor.js:52-56` - Checks if ticket exists
- **Rule:** Skips if ticket not found in database
- **Enforcement:** Application-level validation

## 4.2 Missing Validations

### Trigger File Content Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Should validate JSON structure before processing
- **Current:** No validation of trigger file JSON structure
- **Impact:** Low - File is created by code, but corruption could cause errors

### Processing File Content Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Should validate JSON structure when reading
- **Current:** No validation when Cursor reads processing files
- **Impact:** Low - File is created by code, but corruption could cause errors

### Directory Permissions Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Should check if `.tickets/` directory is writable
- **Current:** Creates directory but doesn't verify write permissions
- **Impact:** Medium - Could fail silently if directory not writable

### File System Space Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Should check available disk space before writing files
- **Current:** No disk space checks
- **Impact:** Low - Files are small, but could fail if disk full

### Concurrent Processing Validation
- **Status:** NOT ENFORCED IN CODE
- **Expected:** Should prevent multiple processors from processing same ticket
- **Current:** No locking mechanism
- **Impact:** Medium - Could cause duplicate processing if multiple processors run

---

# 5. Behavioral Rules / Invariants

## 5.1 Enforced Invariants

### Invariant: Critical Tickets Processed Exclusively
- **Enforcement:** `scripts/auto-ticket-processor.js:140-161` - Checks for critical tickets first
- **Rule:** If any critical (priority=4) tickets exist, process ONLY those, skip all others
- **Violation Handling:** Returns early after processing critical tickets

### Invariant: Last Processed ID Tracking
- **Enforcement:** `scripts/auto-ticket-processor.js:34-42,125-126` - Tracks last processed ID
- **Rule:** Only tickets with `id > lastProcessedId` are processed
- **Violation Handling:** Prevents reprocessing of already-processed tickets

### Invariant: Deleted Tickets Skipped
- **Enforcement:** `scripts/auto-ticket-processor.js:59-62` - Checks status !== 'deleted'
- **Rule:** Deleted tickets are never processed
- **Violation Handling:** Skips ticket and continues

### Invariant: Backlog Tickets Skipped
- **Enforcement:** `scripts/auto-ticket-processor.js:64-68` - Checks status !== 'backlog'
- **Rule:** Backlog tickets are never processed
- **Violation Handling:** Skips ticket and continues

### Invariant: Resolved Tickets Skipped
- **Enforcement:** `scripts/auto-ticket-processor.js:71-74` - Checks status !== 'resolved'
- **Rule:** Resolved tickets are never processed
- **Violation Handling:** Skips ticket and continues

### Invariant: IMPLEMENTATION COMPLETE Tickets Skipped
- **Enforcement:** `scripts/auto-ticket-processor.js:77-80` - Checks for "IMPLEMENTATION COMPLETE" in resolution_notes
- **Rule:** In-progress tickets with "IMPLEMENTATION COMPLETE" are waiting for user testing
- **Violation Handling:** Skips ticket and continues

### Invariant: Priority Order Processing
- **Enforcement:** `scripts/auto-ticket-processor.js:171` - Orders by `priority DESC, created_at ASC`
- **Rule:** Tickets processed in priority order (4→3→2→1), then by age (oldest first)
- **Violation Handling:** Database query enforces ordering

### Invariant: Directory Auto-Creation
- **Enforcement:** Multiple locations create directory if missing
- **Rule:** `.tickets/` directory is created automatically if it doesn't exist
- **Violation Handling:** Creates directory with `recursive: true`

## 5.2 Unenforced Rules

### Invariant: Single Processor Instance
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Only one auto-processor should run at a time
- **Current:** No mechanism prevents multiple instances
- **Impact:** Medium - Could cause duplicate processing

### Invariant: Processing File Cleanup
- **Status:** NOT ENFORCED IN CODE
- **Rule:** Processing files should be deleted after Cursor processes them
- **Current:** No automatic cleanup
- **Impact:** Low - Files accumulate but are small

### Invariant: Trigger File Cleanup
- **Status:** PARTIALLY ENFORCED
- **Rule:** Trigger files should be deleted after processing
- **Current:** Deleted by auto-processor after processing (`scripts/auto-ticket-processor.js:208`)
- **Enforcement:** Only when auto-processor handles trigger file (not when polling database)

---

# 6. State Transitions (with File References)

## 6.1 Ticket Creation Flow

### User-Created Ticket
1. **User submits ticket via UI**
   - Location: `handlers/game.js:6114-6198` - `createZorkTicket` handler
   - Ticket created in database

2. **Trigger file created**
   - Location: `handlers/game.js:6179-6187` - Trigger file creation
   - File: `.tickets/ticket-{id}.trigger`
   - Contains ticket metadata

3. **Auto-processor detects** (if running)
   - Location: `scripts/auto-ticket-processor.js:194-220` - Trigger file detection
   - Or: Database polling detects new ticket
   - Location: `scripts/auto-ticket-processor.js:138-189` - Database polling

### ZORK-Created Ticket
1. **ZORK creates ticket via action**
   - Location: `scripts/zork-ai-agent.cjs:2650-2658` - Ticket creation
   - Ticket created in database

2. **Trigger file created**
   - Location: `scripts/zork-ai-agent.cjs:2683-2691` - Trigger file creation
   - File: `.tickets/ticket-{id}.trigger`
   - Contains ticket metadata

3. **Auto-processor detects** (if running)
   - Same as user-created ticket flow

## 6.2 Ticket Processing Flow

### Auto-Processor Processing
1. **Ticket detected** (trigger file or database poll)
   - Location: `scripts/auto-ticket-processor.js:47-133` - `processTicket()` function

2. **Status validation**
   - Location: `scripts/auto-ticket-processor.js:58-86` - Status checks
   - Skips if deleted, backlog, resolved, or has IMPLEMENTATION COMPLETE

3. **Status updated to in_progress**
   - Location: `scripts/auto-ticket-processor.js:93-100` - Status update
   - Database: `UPDATE debug_todos SET status = 'in_progress'`

4. **Processing file created**
   - Location: `scripts/auto-ticket-processor.js:107-119` - Processing file creation
   - File: `.tickets/ticket-{id}.processing`

5. **Last processed ID updated**
   - Location: `scripts/auto-ticket-processor.js:125-126` - Last processed ID update
   - File: `.tickets/.last-processed`

6. **Trigger file deleted** (if processed via trigger file)
   - Location: `scripts/auto-ticket-processor.js:208` - Trigger file deletion

### MCP Tool Processing
1. **Cursor calls `auto_tickets_check`**
   - Location: `mcp-test-server/tools/autoTickets.js:32-102` - MCP tool handler

2. **Database queried for new tickets**
   - Location: `mcp-test-server/tools/autoTickets.js:37-47` - Database query
   - Returns tickets with `id > sinceId`

3. **Structured data returned**
   - Location: `mcp-test-server/tools/autoTickets.js:86-101` - Response format
   - Includes ticket list and metadata

4. **Cursor processes tickets**
   - Uses `work_tickets_start` MCP tool
   - Location: `mcp-test-server/tools/workTickets.js:63-147` - Work tickets tool

---

# 7. Interactions with Other Systems

## 7.1 Ticket System Integration

**Integration Points:**
- **Ticket Creation:** `handlers/game.js:6114-6198` - Creates trigger file on ticket creation
- **Ticket Database:** `database.js` - Queries `debug_todos` table
- **Ticket Service:** `services/ticketService.js` - Used by MCP tools

**Behavior:**
- Trigger files created when tickets are created
- Auto-processor queries ticket database
- MCP tools query ticket database
- Ticket status updated to 'in_progress' when processing starts

**Evidence:**
- `handlers/game.js:6167-6193` - Trigger file creation
- `scripts/auto-ticket-processor.js:52` - Database query
- `mcp-test-server/tools/autoTickets.js:37-47` - MCP tool query

## 7.2 Cursor Integration

**Integration Points:**
- **MCP Tools:** `mcp-test-server/tools/autoTickets.js` - `auto_tickets_check` tool
- **MCP Tools:** `mcp-test-server/tools/workTickets.js` - `work_tickets_start` tool
- **Cursor Rules:** `.cursorrules:199-225` - Automatic ticket processing rules

**Behavior:**
- Cursor can check for new tickets via MCP tool
- Cursor can start working on tickets via MCP tool
- Cursor rules define automatic processing workflow
- Processing files created for Cursor to detect

**Evidence:**
- `mcp-test-server/tools/autoTickets.js:29-117` - Auto ticket tools
- `mcp-test-server/tools/workTickets.js:60-205` - Work ticket tools
- `.cursorrules:199-225` - Automatic processing rules

## 7.3 ZORK Integration

**Integration Points:**
- **Ticket Creation:** `scripts/zork-ai-agent.cjs:2626-2704` - `createTicket` action
- **Trigger File Creation:** `scripts/zork-ai-agent.cjs:2671-2697` - Creates trigger file

**Behavior:**
- ZORK can create tickets via action
- ZORK creates trigger files when creating tickets
- Tickets created by ZORK have `createdBy: 'zork'`

**Evidence:**
- `scripts/zork-ai-agent.cjs:2626-2704` - Ticket creation
- `scripts/zork-ai-agent.cjs:2689` - Sets `createdBy: 'zork'`

## 7.4 File System Integration

**Integration Points:**
- **Directory Management:** Creates `.tickets/` directory if missing
- **File Watching:** `scripts/auto-ticket-processor.js:243-250` - File system watching
- **File Operations:** Read/write/delete operations on trigger and processing files

**Behavior:**
- Auto-creates `.tickets/` directory
- Watches directory for file system events
- Reads trigger files
- Writes processing files
- Deletes trigger files after processing

**Evidence:**
- `scripts/auto-ticket-processor.js:28-31` - Directory creation
- `scripts/auto-ticket-processor.js:243-250` - File system watching
- `scripts/auto-ticket-processor.js:194-220` - File operations

---

# 8. Failure States and Messages

## 8.1 Trigger File Creation Failures

### Directory Creation Failure
- **Error:** File system error (logged)
- **Location:** `handlers/game.js:6174-6176`, `scripts/zork-ai-agent.cjs:2678-2680`
- **Recovery:** Non-fatal - Ticket creation succeeds, trigger file creation fails
- **Evidence:** `handlers/game.js:6190-6192` - Error caught, warning logged

### Trigger File Write Failure
- **Error:** File write error (logged as warning)
- **Location:** `handlers/game.js:6190-6192`, `scripts/zork-ai-agent.cjs:2694-2696`
- **Recovery:** Non-fatal - Ticket creation succeeds, auto-processor will poll database
- **Evidence:** Error caught, warning logged, operation continues

## 8.2 Auto-Processor Failures

### Ticket Not Found
- **Error:** Logged as "Ticket #X not found, skipping"
- **Location:** `scripts/auto-ticket-processor.js:53-56`
- **Recovery:** Skips ticket, continues processing
- **Evidence:** `scripts/auto-ticket-processor.js:53-56` - Error handling

### Database Query Failure
- **Error:** Logged as "[Auto-Ticket] Error checking for new tickets:"
- **Location:** `scripts/auto-ticket-processor.js:186-188`
- **Recovery:** Error logged, polling continues
- **Evidence:** `scripts/auto-ticket-processor.js:186-188` - Error handling

### Status Update Failure
- **Error:** Logged as "[Auto-Ticket] Error updating ticket status:"
- **Location:** `scripts/auto-ticket-processor.js:101-103`
- **Recovery:** Non-fatal - Continues to create processing file
- **Evidence:** `scripts/auto-ticket-processor.js:101-103` - Error handling

### Processing File Write Failure
- **Error:** Logged as "[Auto-Ticket] Error processing ticket #X:"
- **Location:** `scripts/auto-ticket-processor.js:129-131`
- **Recovery:** Returns false, continues with next ticket
- **Evidence:** `scripts/auto-ticket-processor.js:129-131` - Error handling

### Trigger File Deletion Failure
- **Error:** Logged as "[Auto-Ticket] Error deleting trigger file:"
- **Location:** `scripts/auto-ticket-processor.js:210-212`
- **Recovery:** Non-fatal - Error logged, continues
- **Evidence:** `scripts/auto-ticket-processor.js:210-212` - Error handling

### File System Watch Failure
- **Error:** File system watch may not be available on all systems
- **Location:** `scripts/auto-ticket-processor.js:243-250`
- **Recovery:** Falls back to polling only (polling still works)
- **Evidence:** `scripts/auto-ticket-processor.js:243` - Conditional file watching

## 8.3 MCP Tool Failures

### Database Query Failure
- **Error:** "Error: {error.message}"
- **Location:** `mcp-test-server/tools/autoTickets.js:110-115`
- **Recovery:** Returns error response to Cursor
- **Evidence:** `mcp-test-server/tools/autoTickets.js:110-115` - Error handling

## 8.4 Missing Failure Handling

### No Retry Logic
- **Status:** NOT IMPLEMENTED
- **Impact:** Transient failures cause permanent failures
- **Location:** No retry mechanisms in any operations

### No Locking Mechanism
- **Status:** NOT IMPLEMENTED
- **Impact:** Multiple processors could process same ticket
- **Location:** No file locking or database locking

### No Processing File Cleanup
- **Status:** NOT IMPLEMENTED
- **Impact:** Processing files accumulate over time
- **Location:** No code found that deletes processing files

---

# 9. Serialization Paths

## 9.1 Trigger File Serialization

**Format:** JSON file
**Location:** `.tickets/ticket-{id}.trigger`

**Fields Serialized:**
- `ticketId` - Ticket ID (number)
- `title` - Ticket title (string)
- `priority` - Priority level (number)
- `ticketType` - Ticket type (string)
- `createdBy` - Creator name (string)
- `timestamp` - ISO timestamp (string)

**Serialization Method:**
- `JSON.stringify()` with 2-space indentation
- Location: `handlers/game.js:6180`, `scripts/zork-ai-agent.cjs:2684`

**Evidence:**
- `handlers/game.js:6180-6187` - Trigger file serialization
- `scripts/zork-ai-agent.cjs:2684-2691` - Trigger file serialization

## 9.2 Processing File Serialization

**Format:** JSON file
**Location:** `.tickets/ticket-{id}.processing`

**Fields Serialized:**
- `ticketId` - Ticket ID (number)
- `title` - Ticket title (string)
- `description` - Ticket description (string)
- `priority` - Priority level (number)
- `ticket_type` - Ticket type (string)
- `created_at` - Creation timestamp (string)
- `created_by` - Creator identifier (string)
- `timestamp` - Processing timestamp (string)
- `status` - Always 'in_progress' (string)
- `cursorProcessing` - Always true (boolean)

**Serialization Method:**
- `JSON.stringify()` with 2-space indentation
- Location: `scripts/auto-ticket-processor.js:108-119`

**Evidence:**
- `scripts/auto-ticket-processor.js:108-119` - Processing file serialization

## 9.3 MCP Tool Response Serialization

**Format:** MCP tool response object
**Location:** `mcp-test-server/tools/autoTickets.js:81-101`

**Fields Serialized:**
- `content` - Formatted text for display
- `metadata` - Structured data:
  - `ticketCount` - Number of tickets (number)
  - `tickets` - Array of ticket objects with:
    - `id`, `title`, `priority`, `ticket_type`, `summary`, `created_at`, `created_by`, `player_name`
  - `lastCheckedId` - Last checked ticket ID (number)
  - `shouldProcess` - Whether to process (boolean)

**Evidence:**
- `mcp-test-server/tools/autoTickets.js:81-101` - MCP tool response format

---

# 10. Known Gaps, Missing Features, or TODOs

## 10.1 Missing Features

### Processing File Cleanup
- **Status:** NOT IMPLEMENTED
- **Expected:** Processing files should be deleted after Cursor processes them
- **Current:** No automatic cleanup mechanism
- **Impact:** Files accumulate in `.tickets/` directory
- **Recommendation:** Add cleanup mechanism or manual cleanup process

### Locking Mechanism
- **Status:** NOT IMPLEMENTED
- **Expected:** Prevent multiple processors from processing same ticket
- **Current:** No file locking or database locking
- **Impact:** Could cause duplicate processing if multiple processors run
- **Recommendation:** Add file locking or database row locking

### Retry Logic
- **Status:** NOT IMPLEMENTED
- **Expected:** Retry failed operations (file writes, database updates)
- **Current:** Operations fail permanently on error
- **Impact:** Transient failures cause permanent failures
- **Recommendation:** Add retry logic with exponential backoff

### Processing File Reading
- **Status:** NOT IMPLEMENTED IN CODE
- **Expected:** Cursor should read processing files to get ticket details
- **Current:** No code found that reads processing files
- **Impact:** Processing files created but not used by Cursor
- **Recommendation:** Implement Cursor integration to read processing files

### WebSocket Notifications
- **Status:** NOT IMPLEMENTED
- **Expected:** Real-time notifications when tickets are created
- **Current:** File-based system only
- **Impact:** Requires polling or file watching
- **Recommendation:** Add WebSocket notifications for real-time processing

### Batch Processing
- **Status:** NOT IMPLEMENTED
- **Expected:** Process multiple tickets in batch
- **Current:** Processes one ticket at a time
- **Impact:** Slower processing for multiple tickets
- **Recommendation:** Add batch processing capability

### Priority-Based Queuing
- **Status:** PARTIAL
- **Expected:** Queue system for ticket processing
- **Current:** Basic priority ordering in queries
- **Impact:** No queue depth limits or throttling
- **Recommendation:** Add proper queue management system

## 10.2 Partial Implementations

### File System Watching
- **Status:** PARTIAL
- **Implementation:** `scripts/auto-ticket-processor.js:243-250` - Conditional file watching
- **Issue:** May not be available on all systems
- **Fallback:** Polling still works
- **Recommendation:** Improve file watching or rely on polling

### Cursor Integration
- **Status:** PARTIAL
- **Implementation:** MCP tools exist, but no code reads processing files
- **Issue:** Processing files created but not consumed by Cursor
- **Recommendation:** Implement Cursor file watching or use MCP tools exclusively

---

# 11. Summary of Strengths, Weaknesses, Risks

## 11.1 Strengths

1. **Multiple Detection Methods**
   - Trigger file system for immediate detection
   - Database polling for reliable detection
   - MCP tools for programmatic access
   - Evidence: All three methods implemented

2. **Priority-Based Processing**
   - Critical tickets processed exclusively
   - Priority ordering ensures important tickets processed first
   - Evidence: `scripts/auto-ticket-processor.js:140-161` - Critical ticket handling

3. **Non-Fatal Error Handling**
   - Trigger file creation failures don't break ticket creation
   - Status update failures don't break processing
   - Evidence: Multiple non-fatal error handlers

4. **Automatic Directory Creation**
   - `.tickets/` directory created automatically
   - No manual setup required
   - Evidence: Multiple locations create directory

5. **Last Processed ID Tracking**
   - Prevents reprocessing of tickets
   - Persistent across restarts
   - Evidence: `scripts/auto-ticket-processor.js:34-42,125-126`

6. **Status Filtering**
   - Skips deleted, backlog, resolved tickets
   - Skips tickets with IMPLEMENTATION COMPLETE
   - Evidence: `scripts/auto-ticket-processor.js:58-86`

## 11.2 Weaknesses

1. **No Locking Mechanism**
   - Multiple processors could process same ticket
   - Risk: Duplicate processing
   - Mitigation: Run only one processor instance

2. **No Processing File Cleanup**
   - Processing files accumulate over time
   - Risk: Directory clutter
   - Mitigation: Manual cleanup or implement cleanup

3. **No Retry Logic**
   - Transient failures cause permanent failures
   - Risk: Tickets not processed if transient error occurs
   - Mitigation: Add retry logic

4. **File System Dependency**
   - Requires file system access
   - Risk: May not work in all deployment environments
   - Mitigation: Use database-based approach or ensure file system access

5. **No Cursor File Reading**
   - Processing files created but not read by Cursor
   - Risk: Files unused, Cursor uses MCP tools instead
   - Mitigation: Implement Cursor file reading or remove processing files

6. **No Batch Processing**
   - Processes one ticket at a time
   - Risk: Slower for multiple tickets
   - Mitigation: Add batch processing

## 11.3 Risks

1. **Concurrency Risk**
   - No locking mechanism
   - Risk: Multiple processors process same ticket
   - Mitigation: Run only one processor instance, add locking

2. **File System Risk**
   - Depends on file system availability
   - Risk: May fail in containerized environments
   - Mitigation: Ensure file system access, consider database-based approach

3. **Data Loss Risk**
   - Last processed ID stored in file
   - Risk: File corruption could cause reprocessing
   - Mitigation: Add validation, backup mechanism

4. **Performance Risk**
   - Polling every 2 seconds
   - Risk: Database load with many tickets
   - Mitigation: Optimize queries, increase polling interval if needed

5. **Scalability Risk**
   - No queue depth limits
   - Risk: Overwhelmed with many tickets
   - Mitigation: Add queue management, throttling

---

# 12. Configuration and Constants

## 12.1 Configuration Constants

### Polling Interval
**Location:** `scripts/auto-ticket-processor.js:24`
**Value:** `2000` (2 seconds)
**Purpose:** Interval between database polls
**Configurable:** Yes (modify constant)

**Evidence:**
- `scripts/auto-ticket-processor.js:24` - POLL_INTERVAL constant

### Tickets Directory
**Location:** `scripts/auto-ticket-processor.js:22`
**Value:** `path.join(__dirname, '..', '.tickets')`
**Purpose:** Directory for trigger and processing files
**Configurable:** No (hardcoded)

**Evidence:**
- `scripts/auto-ticket-processor.js:22` - TICKETS_DIR constant

### Trigger File Pattern
**Location:** `scripts/auto-ticket-processor.js:23`
**Value:** `/^ticket-(\d+)\.trigger$/`
**Purpose:** Regex pattern to match trigger files
**Configurable:** No (hardcoded)

**Evidence:**
- `scripts/auto-ticket-processor.js:23` - TRIGGER_FILE_PATTERN constant

### Last Processed File
**Location:** `scripts/auto-ticket-processor.js:25`
**Value:** `path.join(TICKETS_DIR, '.last-processed')`
**Purpose:** File to track last processed ticket ID
**Configurable:** No (hardcoded)

**Evidence:**
- `scripts/auto-ticket-processor.js:25` - PROCESSED_FILE constant

### Database Query Limits
**Location:** `scripts/auto-ticket-processor.js:151,172`
**Values:** 
- Critical tickets: `LIMIT 1`
- Regular tickets: `LIMIT 10`
**Purpose:** Limit number of tickets processed per cycle
**Configurable:** No (hardcoded)

**Evidence:**
- `scripts/auto-ticket-processor.js:151` - Critical ticket limit
- `scripts/auto-ticket-processor.js:172` - Regular ticket limit

### Processing Delay
**Location:** `scripts/auto-ticket-processor.js:183`
**Value:** `500` milliseconds
**Purpose:** Delay between processing multiple tickets
**Configurable:** No (hardcoded)

**Evidence:**
- `scripts/auto-ticket-processor.js:183` - Delay between tickets

---

# 13. Workflow Patterns

## 13.1 Automatic Processing Workflow

### Background Processor Workflow
1. **Startup:**
   - Load last processed ID from `.last-processed` file
   - Create `.tickets/` directory if missing
   - Start polling interval (2 seconds)
   - Start file system watching (if available)

2. **Polling Cycle:**
   - Check for critical tickets (priority=4)
   - If found, process ONLY critical tickets
   - Otherwise, check for regular tickets in priority order
   - Process tickets sequentially
   - Check for trigger files
   - Repeat every 2 seconds

3. **Ticket Processing:**
   - Validate ticket status
   - Update status to 'in_progress'
   - Create processing file
   - Update last processed ID
   - Delete trigger file (if processed via trigger)

**Evidence:**
- `scripts/auto-ticket-processor.js:225-251` - Main loop
- `scripts/auto-ticket-processor.js:138-189` - Polling logic
- `scripts/auto-ticket-processor.js:47-133` - Processing logic

## 13.2 MCP Tool Workflow

### Cursor Automatic Checking
1. **At conversation start:**
   - Call `auto_tickets_check` with `sinceId: 0`
   - Get list of new tickets
   - Start processing if tickets found

2. **During work:**
   - Periodically call `auto_tickets_check` with last processed ID
   - Process new tickets automatically
   - Prioritize critical tickets

3. **Manual trigger:**
   - User says "work tickets"
   - Call `work_tickets_start` MCP tool
   - Process tickets sequentially

**Evidence:**
- `.cursorrules:207-225` - Automatic checking rules
- `mcp-test-server/tools/autoTickets.js:29-117` - Auto ticket tool
- `mcp-test-server/tools/workTickets.js:60-205` - Work tickets tool

---

# 14. Integration Patterns

## 14.1 Trigger File Pattern

**When:** Ticket created
**Who:** Handler or ZORK
**What:** Creates trigger file with metadata
**Why:** Signal auto-processor to process ticket

**Evidence:**
- `handlers/game.js:6167-6193` - Handler trigger file creation
- `scripts/zork-ai-agent.cjs:2671-2697` - ZORK trigger file creation

## 14.2 Processing File Pattern

**When:** Ticket detected by auto-processor
**Who:** Auto-processor
**What:** Creates processing file with full ticket details
**Why:** Provide ticket details to Cursor

**Evidence:**
- `scripts/auto-ticket-processor.js:107-119` - Processing file creation

## 14.3 MCP Tool Pattern

**When:** Cursor needs to check for tickets
**Who:** Cursor (via MCP)
**What:** Queries database for new tickets
**Why:** Programmatic ticket detection

**Evidence:**
- `mcp-test-server/tools/autoTickets.js:29-117` - MCP tool implementation

---

# 15. Best Practices

## 15.1 Running Auto-Processor

**Recommended:** Run as background process
```bash
node scripts/auto-ticket-processor.js
```

**Best Practices:**
- Run only one instance at a time
- Monitor for errors in logs
- Restart if process dies
- Use process manager (PM2, systemd, etc.) for production

**Evidence:**
- `scripts/auto-ticket-processor.js:1-270` - Processor implementation

## 15.2 Cursor Integration

**Recommended:** Use MCP tools for programmatic access
- Call `auto_tickets_check` at conversation start
- Call periodically during work
- Use `work_tickets_start` for manual processing

**Best Practices:**
- Track last processed ID internally
- Process critical tickets immediately
- Process tickets sequentially by priority
- Update tickets with AC when complete

**Evidence:**
- `.cursorrules:199-225` - Cursor integration rules
- `mcp-test-server/tools/autoTickets.js` - Auto ticket tool
- `mcp-test-server/tools/workTickets.js` - Work tickets tool

## 15.3 File System Management

**Best Practices:**
- Monitor `.tickets/` directory size
- Clean up old processing files periodically
- Verify directory permissions
- Backup `.last-processed` file

**Evidence:**
- No cleanup code found (recommendation)

---

# 16. Troubleshooting Guide

## 16.1 Processor Not Running

**Symptoms:** Tickets not being processed automatically

**Checks:**
1. Verify processor is running: `ps aux | grep auto-ticket-processor`
2. Check logs for errors
3. Verify `.tickets/` directory exists and is writable
4. Check database connection

**Evidence:**
- `docs/AUTO-TICKET-PROCESSING.md:130-134` - Troubleshooting section

## 16.2 Tickets Not Being Processed

**Symptoms:** Tickets remain in 'open' status

**Checks:**
1. Check trigger files exist: `ls .tickets/ticket-*.trigger`
2. Check processing files: `ls .tickets/ticket-*.processing`
3. Verify last processed ID: `cat .tickets/.last-processed`
4. Check database for open tickets: `SELECT * FROM debug_todos WHERE status = 'open'`
5. Verify ticket status (not deleted, backlog, resolved)
6. Verify ticket doesn't have IMPLEMENTATION COMPLETE

**Evidence:**
- `docs/AUTO-TICKET-PROCESSING.md:136-141` - Troubleshooting section
- `scripts/auto-ticket-processor.js:58-86` - Status filtering logic

## 16.3 Duplicate Processing

**Symptoms:** Same ticket processed multiple times

**Checks:**
1. Verify only one processor instance running
2. Check last processed ID is being updated
3. Verify trigger files are being deleted
4. Check for race conditions

**Evidence:**
- `scripts/auto-ticket-processor.js:34-42` - Last processed ID tracking
- `scripts/auto-ticket-processor.js:125-126` - Last processed ID update

---

# 17. Conclusion

The auto-ticket-processing system provides a robust foundation for automatic ticket detection and processing. Key strengths include multiple detection methods, priority-based processing, and non-fatal error handling. Areas for improvement include locking mechanisms, processing file cleanup, and retry logic.

**Key Takeaways:**
- System uses file-based triggers and database polling
- Critical tickets processed exclusively
- Multiple integration points (auto-processor, MCP tools)
- Non-fatal error handling ensures reliability
- Last processed ID prevents reprocessing

**Best Practices:**
- Run only one auto-processor instance
- Use MCP tools for Cursor integration
- Monitor processor logs for errors
- Clean up processing files periodically
- Track last processed ID for Cursor

---

**End of Auto-Ticket-Processing System Canonical Specification**





