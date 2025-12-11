# 240 — Canonical MCP Server Specification
_Authoritative specification for the game’s MCP server layer, its tools, contracts, guarantees, and behavior._

This document replaces all previous drafts, raw brainstorms, and partial notes. Cursor must treat this as **the single source of truth** for how the MCP server and its exported tools behave.

The MCP server exists to give Cursor (and other AIs/agents) a *safe*, *controlled*, *canonical*, and *architecturally consistent* way to introspect, manipulate, and extend the game.

---

# 1. Purpose of the MCP Server

The MCP server is the agent-facing layer that exposes **strict, guard‑railed capabilities** for AI tooling. It allows:
- Reading canonical game data
- Writing/modifying world content through validated endpoints
- Running analysis tools (linting, consistency checks, audits)
- Triggering safe game-side actions

The MCP server **never** bypasses business logic, game rules, or DB helper contracts. It is a controlled gateway for AIs—not a superuser pass.

---

# 2. Core Principles

1. **Every operation must be deterministic and validated.**
2. **No tool may modify the game state bypassing database.js.**
3. **No tool may mutate live player sessions unless explicitly defined.**
4. **All schema, formula, and architecture rules defined in documents 200–239 apply here.**
5. **All tools must return structured JSON responses**, never raw strings.
6. **All errors must be safe, descriptive, and non-destructive.**
7. **All tools must define: input schema, output schema, failure modes.**

---

# 3. MCP Tool Inventory (Authoritative List)

If a tool is not listed here, Cursor must treat it as **non‑canonical** and may not expand or modify it.

### 3.1 World Editing Tools
These power the God Mode editors.
- **`getRoom(id)`**
- **`updateRoom(data)`**
- **`createRoom(data)`**
- **`deleteRoom(id)`**
- **`listRooms(filters)`**
- **`getExits(roomId)`**
- **`updateExits(roomId, exitData)`**

### 3.2 NPC Tools
- **`getScriptableNPC(id)`**
- **`listScriptableNPCs()`**
- **`updateScriptableNPC(data)`**
- **`createScriptableNPC(data)`**
- **`deleteScriptableNPC(id)`**

- **`getNPCInstance(id)`**
- **`listNPCInstances(filters)`**
- **`moveNPCInstance(id, newRoomId)`**
- **`updateNPCState(id, newState)`**

### 3.3 Item Tools
- **`getItem(id)`**
- **`listItems(filters)`**
- **`createItem(data)`**
- **`updateItem(data)`**
- **`deleteItem(id)`**

### 3.4 Factory & Recipe Tools
- **`getRecipe(id)`**
- **`listRecipes(filters)`**
- **`createRecipe(data)`**
- **`updateRecipe(data)`**
- **`deleteRecipe(id)`**

### 3.5 Ticketing Tools (God Mode Internal)
- **`createTicket(data)`**
- **`updateTicket(data)`**
- **`deleteTicket(id)`**
- **`listTickets(filter)`**

### 3.6 Utility / Analysis Tools
- **`lintWorld()`** — world graph, broken exits, orphan rooms
- **`lintNPCs()`** — bad stats, missing templates, broken room references
- **`lintItems()`** — invalid weights, missing definitions, dangling references
- **`lintRecipes()`** — invalid ingredients, circular crafting chains
- **`searchContent(query)`** — full-text search across rooms/items/NPC text

### 3.7 Execution Tools (Always Guarded)
- **`simulateHarvest(npcId, playerStats)`** — deterministic harvest simulation
- **`simulateCraft(recipeId, playerStats, runes, quirk)`** — deterministic craft roll

Execution tools **never mutate state** — they produce modeling/simulation output.

---

# 4. Tool Contract Structure (Mandatory Template)

Every MCP tool must expose the following fields:

```
{
  "name": "toolName",
  "description": "What this tool does",
  "input_schema": {
    "type": "object",
    "properties": { ... },
    "required": [ ... ]
  },
  "output_schema": {
    "type": "object",
    "properties": { ... }
  },
  "errors": ["Specific failure modes"]
}
```

If a tool does not follow this structure, Cursor must correct it.

---

# 5. Authoritative Validation Rules
These apply to **every** MCP write endpoint.

### 5.1 Shared Validation Rules
- Input must match schema exactly.
- Fields must obey canonical DB constraints.
- Fields may not introduce unknown JSONB keys.
- References (room_id, item_id, npc_id) must exist.
- No cross-table integrity violations.

### 5.2 Room Rules
- Coordinates must remain unique.
- `factory_quirks` must follow JSONB spec in Database Canonical Doc.
- `description` must be plain text.

### 5.3 NPC Rules
- Template stats must be integers.
- NPC instances cannot be placed in nonexistent rooms.
- `state` JSONB must follow canonical NPC State Model.

### 5.4 Item Rules
- Weight must be integer ≥ 0.
- Rune items must declare valid `rune_type`.
- Item names must be unique.

### 5.5 Recipe Rules
- Inputs/outputs must reference real item IDs.
- Required stats must be valid stat names.
- Success rates must be 0–100.

---

# 6. Internal Security Model

1. Tools are permission‑scoped by **mode**:
   - **Player Mode** (no writes)
   - **Editor Mode** (writes allowed only to editable fields)
   - **God Mode** (full access following rules)

2. God Mode editing must still respect validation rules.

3. MCP server must **never**:
   - Directly mutate player inventory
   - Spawn or delete NPCs without spec-compliant tools
   - Execute destructive SQL

4. All write actions must be logged.

---

# 7. MCP Server Architecture

### 7.1 Layers
- **Transport Layer** — Handles MCP protocol packets
- **Tool Registry** — Registers all tools with schemas
- **Execution Layer** — Executes tool logic with validation
- **Database Adapter** — Thin wrapper around `database.js`

### 7.2 Communication
- AI ↔ MCP server via JSON RPC–like protocol
- MCP server ↔ game logic strictly via DB helpers + validated pure functions

### 7.3 Error Handling
- Every tool must return structured error objects:
```
{
  "error": true,
  "message": "Description",
  "details": { ... }
}
```

---

# 8. Simulation Tools (Deterministic Mode)

### 8.1 `simulateHarvest` Rules
- Uses **harvestFormulas.js** exactly
- No writes allowed
- Input must include:
  - resonance
  - fortitude
  - npc base stats

### 8.2 `simulateCraft` Rules
- Uses **factoryCraftingEngine.js** exactly
- Accepts:
  - playerStats
  - recipeId
  - rune config
  - quirk object
- Returns deterministic roll outputs

Simulation tools are pure functions; Cursor must not add side effects.

---

# 9. Extensibility Rules

Any new MCP tool must:
- Fit into an existing category OR get a new category added here
- Follow the contract template
- Be validated against DB + architecture specs
- Be schema-safe and migration-free (tools never change schema)
- Be logged in this document before code is written

If it’s not here, it’s not canonical.

---

# 10. TL;DR for Cursor

- MCP server is the **AI-facing gateway** with strict rules.
- All tools must follow schema, validation, and output structure.
- No direct DB writes allowed outside `database.js` helpers.
- All edits must stay within this spec's rules.
- All simulations must be pure and deterministic.

**If any conflict arises, THIS DOCUMENT IS AUTHORITATIVE.**

