# Cursor Development Workflow

## Automatic Knowledge Storage Pattern

When implementing features, Cursor should **automatically store knowledge** in the RAG system so both ZORK and Cursor have access to it.

## Feature Implementation Workflow

### 1. Implement the Feature
- Write code, create migrations, update documentation
- Test the feature
- Commit changes

### 2. Automatically Store Knowledge

**Cursor should automatically call `knowledge_add` MCP tool** after implementing significant features:

```javascript
// Example: After implementing "Crafting System"
knowledge_add({
  title: "Crafting System",
  category: "game_design",
  content: `
Players can craft items using materials in their inventory.

Commands:
- craft [item] - Craft an item if you have required materials
- craft list - List all craftable items

Requirements:
- Crafting ability level determines what can be crafted
- Materials must be in inventory
- Some items require special crafting stations

Implementation:
- Files: handlers/game.js (craft command), database.js (crafting recipes)
- Database: crafting_recipes table
  `,
  priority: 1  // Important feature
})
```

## Knowledge Categories

| Category | Use For | Priority Guidelines |
|----------|---------|---------------------|
| **game_design** | Player-facing features, gameplay mechanics, new commands | 1 for major features, 0 for minor |
| **technical** | Code patterns, architecture, database schema, implementation details | Usually 0 (contextual) |
| **world_lore** | Story elements, in-game lore, world building | Usually 0 |
| **system_docs** | Deployment, configuration, operations, infrastructure | Usually 0 |
| **command_knowledge** | God-mode commands, admin tools, editor features | 1 for important commands |
| **learned_context** | Player preferences, custom rules, session-specific context | Usually 1 |
| **core_identity** | ZORK persona, AI identity (rarely used for features) | 2 (always-include) |

## Priority Guidelines

- **Priority 2**: Core identity, always-include (rarely used for features)
- **Priority 1**: Important features that should be keyword-triggered (major gameplay changes)
- **Priority 0**: Standard features, contextual (most common - semantic/keyword search)

## When to Store Knowledge

### Always Store:
- ✅ New player commands or features
- ✅ Major gameplay mechanics
- ✅ New database tables/schema
- ✅ God-mode commands or tools
- ✅ Significant architectural changes
- ✅ New systems (harvest, crafting, combat, etc.)

### Optional (Store if Complex):
- ⚠️ Bug fixes (only if they change behavior significantly)
- ⚠️ Minor UI improvements (only if they affect gameplay)
- ⚠️ Performance optimizations (only if they change how things work)

### Don't Store:
- ❌ Simple bug fixes
- ❌ Code refactoring (unless it changes behavior)
- ❌ Documentation updates (unless they document new features)

## Automatic Detection Patterns

Cursor should automatically detect these patterns and store knowledge:

### Pattern 1: New Command Handler
```javascript
// In handlers/game.js
if (type === 'newCommand') {
  // ... implementation
}
// → Store: "New Command: newCommand" in game_design category
```

### Pattern 2: New Database Table
```sql
-- migrations/XXX_new_table.sql
CREATE TABLE new_feature (...);
-- → Store: "New Feature: [name]" in technical category
```

### Pattern 3: New WebSocket Message
```javascript
// New message type in handlers
if (type === 'newFeature') {
  // → Store: "New Feature: [name]" in game_design category
}
```

### Pattern 4: Major Feature Implementation
- Multiple files changed
- New database schema
- New player-facing functionality
- → Store comprehensive knowledge about the feature

## Knowledge Content Format

When storing knowledge, include:

1. **What it does** - Brief description
2. **How to use it** - Commands, UI, interactions
3. **Technical details** - Implementation notes (for technical category)
4. **Player impact** - What players see/experience (for game_design)
5. **Related systems** - Connections to other features

## Examples

### Example 1: New Gameplay Feature
```javascript
knowledge_add({
  title: "Auto-Pathing Feature",
  category: "game_design",
  content: `
Players can select a destination room and automatically navigate there.

Usage:
- Open Scripting widget
- Select map and destination room
- Click "GO" to start auto-navigation

Features:
- BFS pathfinding algorithm
- Cross-map navigation
- Configurable movement delay (auto_navigation_time_ms)

Implementation:
- utils/pathfinding.js - BFS algorithm
- handlers/game.js - Path calculation and execution
- Database: players.auto_navigation_time_ms column
  `,
  priority: 1
})
```

### Example 2: Technical Implementation
```javascript
knowledge_add({
  title: "Database Connection Pooling",
  category: "technical",
  content: `
Database connections are managed via pg connection pool.

Configuration:
- Max connections: 20
- Idle timeout: 30s
- Connection timeout: 2s
- SSL in production (NODE_ENV=production)

Implementation:
- database.js - Pool initialization
- Automatic connection management
- Error handling and reconnection
  `,
  priority: 0
})
```

### Example 3: God-Mode Command
```javascript
knowledge_add({
  title: "God Mode: createNPC Command",
  category: "command_knowledge",
  content: `
God-mode players can create NPCs using the createNPC action.

Format:
[ACTION: createNPC]
{
  "name": "NPC Name",
  "description": "NPC description",
  "room_id": 123,
  "npc_type": "harvester",
  ...
}
[/ACTION]

Available NPC types: harvester, merchant, lore_keeper, rhythm

See database schema for full field list.
  `,
  priority: 1
})
```

## Helper Script

For manual knowledge addition, use:

```bash
node scripts/add-feature-knowledge.js "Title" "category" "Content..." [priority]
```

## Integration with Git Workflow

After implementing a feature:

1. **Code complete** → Test → Commit
2. **Automatically store knowledge** (Cursor does this)
3. **ZORK and Cursor both have access** immediately

## Verification

After storing knowledge, verify it's accessible:

```bash
# Test that knowledge was stored
node scripts/test-rag-knowledge.js

# Or query directly
# Use knowledge_search MCP tool with relevant query
```

## Best Practices

1. **Store knowledge immediately** after implementing features
2. **Be comprehensive** - include how it works, not just what it does
3. **Use appropriate category** - helps with retrieval
4. **Set priority correctly** - 1 for major features, 0 for most
5. **Include keywords** - helps keyword-based search when embeddings unavailable
6. **Update existing knowledge** - if feature modifies existing system, update that knowledge too

## Making It Automatic

Cursor should:
1. **Detect feature completion** - when implementation is done
2. **Extract feature details** - from code, comments, git diff
3. **Generate knowledge content** - comprehensive description
4. **Store automatically** - using knowledge_add MCP tool
5. **Confirm storage** - show what was stored

No manual prompting needed - Cursor handles it automatically!

