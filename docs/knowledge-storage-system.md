# Automatic Knowledge Storage System

## Overview

The RAG knowledge system enables seamless knowledge sharing between ZORK and Cursor. When features are implemented, knowledge is automatically stored so both AI systems have immediate access.

## Architecture

### Components

1. **MCP Knowledge Tools** (`mcp-test-server/tools/knowledge.js`)
   - `knowledge_add` - Store new knowledge
   - `knowledge_search` - Semantic/keyword search
   - `knowledge_list` - List by category/priority
   - `knowledge_get` - Get by ID
   - `knowledge_update` - Update existing
   - `knowledge_delete` - Soft delete

2. **Helper Scripts**
   - `scripts/add-feature-knowledge.js` - Quick CLI knowledge storage
   - `scripts/auto-store-knowledge.js` - Auto-extract from feature files
   - `scripts/seed-docs-to-knowledge.js` - Bulk seed from documentation

3. **ZORK Integration** (`scripts/zork-ai-agent.cjs`)
   - `getRelevantKnowledge()` - Retrieves knowledge for AI context
   - `learnKnowledge` action - ZORK can learn from players
   - Keyword-based and semantic search

4. **Database** (`zork_knowledge` table)
   - Stores knowledge with optional embeddings
   - Categories: game_design, technical, command_knowledge, etc.
   - Priorities: 0 (contextual), 1 (important), 2 (always-include)

## Workflow

### For Cursor (Automatic)

1. **Implement Feature**
   - Write code, create migrations, test
   - Feature is complete

2. **Automatically Store Knowledge**
   - Cursor detects feature completion
   - Extracts feature details from code/comments
   - Calls `knowledge_add` MCP tool automatically
   - No manual prompting needed

3. **Immediate Access**
   - ZORK can retrieve knowledge via `getRelevantKnowledge()`
   - Cursor can search via `knowledge_search` MCP tool
   - Both systems share the same knowledge base

### For Manual Storage

**Option 1: MCP Tool (Recommended)**
```
Use knowledge_add tool with:
- title: Feature name
- category: game_design/technical/etc.
- content: Comprehensive description
- priority: 0 or 1
```

**Option 2: Helper Script**
```bash
node scripts/add-feature-knowledge.js "Title" "category" "Content..." [priority]
```

**Option 3: ZORK Action**
```
Tell ZORK: "Remember that [information]"
ZORK uses learnKnowledge action to store it
```

## Knowledge Categories

| Category | Use For | Priority | Examples |
|----------|---------|----------|----------|
| **game_design** | Player features, gameplay | 1 (major), 0 (minor) | Crafting, combat, new commands |
| **technical** | Implementation, code | Usually 0 | Database schema, API patterns |
| **command_knowledge** | God-mode commands | Usually 1 | createNPC, updatePlayer |
| **world_lore** | Story, lore | Usually 0 | NPC backstories, world history |
| **system_docs** | Deployment, ops | Usually 0 | Railway, email, database sync |
| **learned_context** | Player preferences | Usually 1 | Player names, custom rules |
| **core_identity** | ZORK persona | 2 (always) | ZORK system prompt |

## Storage Patterns

### Pattern 1: New Player Command
```javascript
// After implementing 'craft' command
knowledge_add({
  title: "Craft Command",
  category: "game_design",
  content: "Players can craft items using materials. Usage: craft [item]. Requires crafting ability and materials.",
  priority: 1
})
```

### Pattern 2: New Database Table
```javascript
// After creating crafting_recipes table
knowledge_add({
  title: "Crafting Recipes Table",
  category: "technical",
  content: "crafting_recipes table stores recipe definitions. Columns: item_name, required_materials (JSON), crafting_level.",
  priority: 0
})
```

### Pattern 3: Major Feature
```javascript
// After implementing entire crafting system
knowledge_add({
  title: "Crafting System",
  category: "game_design",
  content: "Complete crafting system. Commands: craft [item], craft list. Database: crafting_recipes table. Implementation: handlers/game.js, utils/crafting.js.",
  priority: 1
})
```

## Retrieval

### ZORK Retrieval
- **Priority 2**: Always loaded (core_identity)
- **Semantic search**: For priority 0 (if embeddings available)
- **Keyword-based**: For system_docs, game_design, technical
- **Category-based**: For priority 1 (important features)

### Cursor Retrieval
- **MCP Tool**: `knowledge_search` for semantic/keyword search
- **MCP Tool**: `knowledge_list` for category browsing
- **MCP Tool**: `knowledge_get` for specific knowledge

## Best Practices

1. **Store immediately** after implementing features
2. **Be comprehensive** - include how it works, not just what
3. **Use appropriate category** - helps with retrieval
4. **Set priority correctly** - 1 for major, 0 for most
5. **Include keywords** - helps keyword search
6. **Update existing** - if modifying existing system, update that knowledge

## Verification

```bash
# Test RAG system
node scripts/test-rag-knowledge.js

# Search knowledge
# Use knowledge_search MCP tool

# List knowledge
# Use knowledge_list MCP tool
```

## Files Reference

- **Workflow Guide**: `docs/cursor-workflow.md`
- **Feature Template**: `docs/feature-template.md`
- **Helper Script**: `scripts/add-feature-knowledge.js`
- **Auto Storage**: `scripts/auto-store-knowledge.js`
- **Cursor Rules**: `.cursorrules`
- **MCP Tools**: `mcp-test-server/tools/knowledge.js`
- **ZORK Integration**: `scripts/zork-ai-agent.cjs`

## Making It Autonomous

The system is designed to be fully autonomous:

1. **Cursor automatically detects** feature completion
2. **Cursor automatically extracts** feature details
3. **Cursor automatically stores** knowledge via MCP tool
4. **ZORK automatically retrieves** relevant knowledge
5. **No manual steps required**

The `.cursorrules` file instructs Cursor to automatically store knowledge after implementing features, making the entire process seamless.

