# ✅ **CURSOR: Canonical Scrub Workflow**

**Purpose:** This document defines the mandatory workflow patterns Cursor must follow when analyzing codebases and creating canonical subsystem specifications.

**Status:** Reference specification (999-series)  
**Related:** `10-00-scrub-prompt-template.md` (template for specific scrub tasks)

---

# 🎯 **CORE PRINCIPLES**

## **Principle 1: Code-Only Analysis**
- **STRICTLY analyze based on what is explicitly implemented in code**
- **DO NOT infer, assume, hallucinate, or extrapolate** features not directly validated by code
- If an answer cannot be directly confirmed from reading the code, respond with: **"Not found in codebase."**

## **Principle 2: Exhaustive Documentation**
All analysis must be:
- **Exhaustive** - Cover all aspects of the subsystem
- **Code-linked** - Every finding must cite file paths and line numbers
- **Precise** - Use exact terminology from the codebase
- **Neutral** - No assumptions or interpretations beyond what code shows
- **Fully grounded** - Every statement must be provable from code

## **Principle 3: Citation Requirements**
When providing file references, **ALWAYS include:**
- File name (full path relative to workspace root)
- Line numbers (start and end)
- Function names or code blocks
- SQL migrations when relevant

---

# 🔍 **MANDATORY SCRUB STEPS**

Cursor **MUST** follow these steps in order when analyzing any subsystem:

## **Step 1 — Identify the Single Source of Truth**

**Objective:** Find the authoritative data definitions for the subsystem.

**Actions:**
1. Identify which database tables define this subsystem
2. Document which fields are:
   - Required (NOT NULL)
   - Optional (nullable)
   - Constrained (UNIQUE, FOREIGN KEY, CHECK)
   - Defaulted (DEFAULT values)
3. List all migrations that alter this subsystem
4. Identify any configuration files or constants that define behavior

**Output Format:**
- Table name(s) with schema location
- Field list with types, constraints, defaults
- Migration file references with line numbers
- Configuration file references

**Example:**
```
Primary Table: `players` table in PostgreSQL
Defined in:
- `migrations/001_schema.sql:45-89` (base schema)
- `migrations/046_add_pulse_echoes.sql:12-15` (pulse echo fields)
Core Fields:
- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL UNIQUE`
- `stat_resonance INTEGER DEFAULT 5`
```

---

## **Step 2 — Enumerate All Read/Write Operations**

**Objective:** Document every function that interacts with the subsystem.

**Actions:**
For every function that touches the subsystem, identify:

1. **Read patterns:**
   - Which functions read from this subsystem?
   - What queries are used?
   - What filters/conditions are applied?
   - What data transformations occur?

2. **Write patterns:**
   - Which functions create/update/delete?
   - What validation occurs before writes?
   - What triggers or side effects occur?

3. **Validation logic:**
   - Input validation rules
   - Business rule enforcement
   - Constraint checking

4. **Update atomicity:**
   - Are operations transactional?
   - Are there race conditions?
   - What happens on partial failures?

5. **Missing validations:**
   - What should be validated but isn't?
   - What edge cases aren't handled?

6. **Branching or special cases:**
   - Conditional logic paths
   - Special handling for specific states
   - Error recovery paths

**Output Format:**
- Function name with file:line reference
- Operation type (read/write/delete)
- Parameters and return values
- Validation rules (or "No validation found")
- Transaction handling (or "No transaction found")

**Example:**
```
getAllPlayers()
- Location: `handlers/playerEditor.js:17-28`
- Calls: `database.js:getAllPlayers()`
- Returns: Array of all player objects
- Validation: None (admin-only function)
- Transaction: No
```

---

## **Step 3 — Identify All Subsystems That Touch This One**

**Objective:** Map all cross-dependencies and integration points.

**Actions:**
List all systems that interact with this subsystem:

1. **Game handlers:**
   - Which handlers call this subsystem?
   - What commands trigger interactions?

2. **Editors:**
   - Which editor tools modify this subsystem?
   - What admin functions exist?

3. **NPC engine:**
   - How do NPCs interact with this subsystem?
   - What NPC behaviors depend on it?

4. **Factory engine:**
   - Factory crafting interactions
   - Recipe dependencies
   - Output routing

5. **Automation engine:**
   - Auto-harvest dependencies
   - Auto-path interactions
   - State management

6. **Broadcast/serialization layer:**
   - What data is sent to clients?
   - What events are emitted?
   - What WebSocket messages are sent?

7. **Server session state:**
   - How is this subsystem cached?
   - What session data depends on it?
   - What state is maintained in memory?

**Output Format:**
- System name
- Interaction type (reads/writes/triggers)
- File references for integration points
- Message/event types exchanged

**Example:**
```
NPC Harvest Engine
- Reads: Player stats (resonance, fortitude) for harvest calculations
- Location: `npcLogic.js:145-167`
- Triggers: Player stat updates affect harvest success rates
- Events: `harvestComplete` message sent to player
```

---

## **Step 4 — Extract Invariants & Behavioral Rules**

**Objective:** Document all rules that **must always be true**, based solely on code.

**Actions:**
1. Identify all invariants (conditions that must always hold)
2. Document behavioral rules enforced in code
3. For each rule, cite where it's enforced
4. If a rule is **not enforced anywhere**, explicitly state: **"Invariant NOT enforced in code."**

**Types of invariants to look for:**
- Data integrity rules (e.g., "player must have current_room_id")
- State consistency rules (e.g., "vitalis cannot exceed max_vitalis")
- Business logic rules (e.g., "harvest requires player in same room as NPC")
- Resource constraints (e.g., "encumbrance cannot exceed max_encumbrance")

**Output Format:**
- Invariant description
- Enforcement location (file:line) or "NOT enforced in code"
- What happens if violated (if enforced)

**Example:**
```
Invariant: Player vitalis cannot exceed max_vitalis
Enforcement: `utils/vitalisHelpers.js:45-52` - `setVitalis()` function clamps value
Violation handling: Value is automatically clamped to max_vitalis

Invariant: Player must have valid current_room_id
Enforcement: `database.js:360-397` - `createPlayer()` requires NOT NULL
Violation handling: Database constraint prevents NULL insertion

Invariant: Harvest requires player resonance >= 1
Enforcement: NOT enforced in code (found in `npcLogic.js:145` but no validation)
```

---

## **Step 5 — Identify Failure States & Recovery Paths**

**Objective:** Document all ways the subsystem can fail and how failures are handled.

**Actions:**
1. **All reasons operations can fail:**
   - Database errors
   - Validation failures
   - Resource exhaustion
   - Invalid state transitions
   - Missing dependencies

2. **All error messages emitted:**
   - User-facing error messages
   - Log messages
   - Exception messages
   - WebSocket error responses

3. **States that cause desync:**
   - Race conditions
   - Partial updates
   - Cache inconsistencies
   - Network failures

4. **Missing or partial failure handling:**
   - What errors aren't caught?
   - What failures aren't logged?
   - What recovery paths don't exist?

**Output Format:**
- Failure scenario
- Error message (if any) with file:line
- Recovery path (or "No recovery found")
- User impact

**Example:**
```
Failure: Database connection lost during player update
Error: "Database error: connection lost" (`database.js:234`)
Recovery: None - operation fails silently, player state may be inconsistent
User impact: Player may see stale data or experience desync

Failure: Invalid room_id in movement command
Error: "Room not found" (`handlers/game.js:1234`)
Recovery: Player remains in current room, error message sent
User impact: Movement command fails, player notified
```

---

## **Step 6 — Identify Serialization Paths**

**Objective:** Document how subsystem data flows to the client.

**Actions:**
1. **What data is sent to the client:**
   - Which fields are included?
   - What transformations occur?
   - What formatting is applied?

2. **What data is omitted:**
   - Security-sensitive fields
   - Internal-only fields
   - Computed fields not sent

3. **Where formatting differences exist:**
   - Server-side formatting vs client-side
   - Different formats for different message types
   - Widget-specific formatting

4. **Any mismatches between server model and UI expectations:**
   - Fields expected by UI but not sent
   - Fields sent but not used
   - Type mismatches
   - Naming inconsistencies

**Output Format:**
- Message/event type
- Fields included (with file:line)
- Fields omitted (with reason)
- Formatting rules (with file:line)
- UI expectations vs reality

**Example:**
```
Message Type: `roomUpdate`
Location: `handlers/game.js:456-478`
Fields Sent:
- `room_id`, `name`, `description` (full room object)
- `npcs` (array with name, id, pulse_echo_yield)
- `items` (array with name, id, quantity)
Fields Omitted:
- `room.map_id` (not needed by client)
- `room.room_type` (not sent, but used server-side)
Formatting: NPCs formatted via `formatNPCForClient()` (`utils/broadcast.js:123`)
UI Expectation: Client expects `room.room_type` but it's not sent
Mismatch: Client infers room type from other fields (potential desync risk)
```

---

## **Step 7 — Identify Missing or Partial Implementations**

**Objective:** Document features that are referenced but not implemented, or partially implemented.

**Actions:**
1. Search for TODO comments related to this subsystem
2. Find references to features that don't exist
3. Identify partially implemented features
4. Document planned features mentioned in code but not built

**Common examples:**
- Cooldowns mentioned but not enforced
- Buffs/debuffs referenced but not implemented
- Inventory capacity checks missing
- Use-item system referenced but incomplete
- Feature flags for unimplemented features

**Output Format:**
- Feature name or description
- Where it's referenced (file:line)
- Implementation status (not started / partial / broken)
- Impact of missing feature

**Example:**
```
Feature: Item cooldowns
Reference: `handlers/game.js:234` - Comment mentions "cooldown check needed"
Status: NOT IMPLEMENTED
Impact: Players can use items without cooldown restrictions

Feature: Inventory capacity enforcement
Reference: `handlers/game.js:567` - `takeItem()` function
Status: PARTIAL - Capacity calculated but not enforced
Impact: Players can exceed encumbrance limits
Location: `database.js:890` - `checkEncumbrance()` exists but not called
```

---

# 🧩 **MANDATORY OUTPUT STRUCTURE**

When creating a canonical specification document, **MUST** use this exact structure:

```
1. <Subsystem> Schema / Source of Truth
2. All fields, defaults, nullability, constraints
3. All subsystem operations (read/write/mutate)
4. Validations + Missing Validations
5. Behavioral rules / invariants
6. State transitions (with file references)
7. Interactions with other systems
8. Failure states and messages
9. Serialization paths
10. Known gaps, missing features, or TODOs
11. Summary of strengths, weaknesses, risks
```

## **Section Requirements**

Each section **MUST**:
- Cite specific files & line numbers
- Reflect exactly what the code does
- Not speculate or infer
- Use code terminology exactly as it appears

## **Section 1: Schema / Source of Truth**
- Database tables
- Migration history
- Configuration files
- Constants and enums

## **Section 2: Fields, Defaults, Nullability, Constraints**
- Complete field inventory
- Default values (with source)
- NULL vs NOT NULL
- Constraints (UNIQUE, FOREIGN KEY, CHECK)
- Indexes

## **Section 3: Operations (Read/Write/Mutate)**
- Complete function inventory
- Parameters and return types
- Query patterns
- Transaction boundaries

## **Section 4: Validations + Missing Validations**
- All validation rules (with locations)
- Missing validations (explicitly called out)
- Edge cases not handled

## **Section 5: Behavioral Rules / Invariants**
- All enforced rules
- All unenforced rules (marked as such)
- State consistency requirements

## **Section 6: State Transitions**
- Valid state changes
- Transition triggers
- Guard conditions
- File references for each transition

## **Section 7: Interactions with Other Systems**
- Complete dependency map
- Integration points
- Message/event exchanges
- Shared state

## **Section 8: Failure States and Messages**
- All error conditions
- Error messages (with locations)
- Recovery mechanisms
- Desync risks

## **Section 9: Serialization Paths**
- Client message formats
- Field inclusion/exclusion
- Formatting rules
- UI expectations vs reality

## **Section 10: Known Gaps, Missing Features, or TODOs**
- Unimplemented features
- Partial implementations
- Technical debt
- Future work

## **Section 11: Summary of Strengths, Weaknesses, Risks**
- What works well
- What's fragile
- What needs attention
- Risk assessment

---

# 📌 **RESPONSE REQUIREMENTS**

Cursor **MUST**:

1. **Provide only facts proven in code**
   - Every statement must be verifiable
   - No assumptions or interpretations
   - No "probably" or "likely" statements

2. **Cite every finding with file paths + lines**
   - Format: `filepath:startLine-endLine` or `filepath:line`
   - Include function names when relevant
   - Include migration file names

3. **Avoid incorrect assumptions**
   - Don't assume behavior from naming
   - Don't assume relationships without foreign keys
   - Don't assume validation without seeing it

4. **Explicitly call out missing or incomplete implementations**
   - Use "NOT IMPLEMENTED" or "NOT FOUND IN CODEBASE"
   - Don't imply features exist if they don't
   - Document gaps clearly

---

# 🧪 **COMPLIANCE VERIFICATION**

Before finalizing any scrub analysis, Cursor **MUST** internally verify:

## **Self-Check Questions:**

1. **"Did I infer anything?"**
   - If yes → Remove it or mark as "NOT FOUND IN CODEBASE"
   - Every statement must be directly provable from code

2. **"Can I point to the exact file + line?"**
   - If no → Answer "Not found in codebase."
   - Every finding needs a citation

3. **"Did I assume behavior from naming?"**
   - If yes → Verify actual implementation
   - Function names can be misleading

4. **"Did I document what's missing?"**
   - If no → Add Section 10 (Known gaps)
   - Missing features are as important as existing ones

5. **"Did I check all integration points?"**
   - If no → Complete Step 3 thoroughly
   - Subsystems don't exist in isolation

6. **"Did I verify invariants are enforced?"**
   - If no → Complete Step 4
   - Unenforced invariants are risks

7. **"Did I document failure handling?"**
   - If no → Complete Step 5
   - Failure modes are critical

---

# 📝 **FILE OUTPUT REQUIREMENTS**

When completing a scrub analysis:

1. **Write entire response to a file.md in `/docs/Chuck docs/`**
2. **Title appropriately but start title with `999-`** (these are reference specs, not canonical library references)
3. **Format:** `999-<subsystem-name>-canonical-spec.md`
4. **Example:** `999-player-architecture-canonical-spec.md`

**File Structure:**
- Use the mandatory 11-section output structure
- Include analysis date and scope at top
- Include method statement (code-verified)
- Use consistent formatting throughout

---

# 🔄 **WORKFLOW INTEGRATION**

## **When to Use This Workflow**

Use this scrub workflow when:
- Creating canonical specifications for subsystems
- Documenting new systems
- Verifying existing documentation
- Analyzing bugs or inconsistencies
- Preparing for major refactoring

## **Integration with Other Workflows**

- **Knowledge Storage:** After completing scrub, store findings in RAG system
- **Ticket Processing:** Use scrub findings to understand root causes
- **Feature Development:** Reference canonical specs before implementing changes

## **Quality Gates**

Before considering a scrub complete:
- ✅ All 7 steps completed
- ✅ All 11 sections populated
- ✅ Every finding has file:line citation
- ✅ Missing features explicitly documented
- ✅ Compliance verification passed
- ✅ File written to `/docs/Chuck docs/999-*.md`

---

# 📚 **EXAMPLES AND REFERENCES**

## **Example Canonical Specs**

Reference these completed specs for format and depth:
- `10-01-player-architecture.md` - Player subsystem
- `10-02-room-architecture.md` - Room subsystem
- `10-03-item-architecture.md` - Item subsystem
- `999-editor-systems-canonical-spec.md` - Editor systems

## **Template**

Use `10-00-scrub-prompt-template.md` as the starting prompt for specific scrub tasks.

---

# ✔️ **END OF WORKFLOW**

This workflow ensures all canonical specifications are:
- **Accurate** - Based on actual code
- **Complete** - Covering all aspects
- **Verifiable** - Every claim is cited
- **Actionable** - Useful for development

**Remember:** When in doubt, say "Not found in codebase." It's better to be incomplete than incorrect.

