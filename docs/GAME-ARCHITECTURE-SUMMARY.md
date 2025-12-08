# The Game - Complete Architecture Summary

**Version:** 2.0.0  
**Last Updated:** December 2024  
**Purpose:** Comprehensive architecture overview for AI assistants and developers

---

## Executive Summary

"The Game" is a multiplayer text-based MUD (Multi-User Dungeon) built with Node.js, Express, WebSockets, and PostgreSQL. It features a retro terminal-style interface, real-time multiplayer interactions, scriptable NPCs, a dynamic world with multiple maps, and an autonomous AI agent (ZORK) that lives in the game world. The system includes a sophisticated RAG (Retrieval-Augmented Generation) knowledge base shared between ZORK and development tools.

---

## Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Web Framework:** Express 4.18
- **WebSocket:** ws 8.14
- **Database:** PostgreSQL 12+ (via pg 8.11)
- **Authentication:** bcrypt 5.1, express-session 1.18
- **Email:** nodemailer 7.0 (GoDaddy SMTP)
- **AI:** @anthropic-ai/sdk 0.24 (Claude), openai 6.10 (embeddings)

### Frontend
- **Architecture:** ES6 Modules
- **UI Framework:** Vanilla JavaScript (no frameworks)
- **Styling:** CSS3 with retro terminal aesthetic
- **Communication:** WebSocket (native)

### Infrastructure
- **Deployment:** Railway.app
- **Database:** Railway PostgreSQL addon
- **Email:** GoDaddy SMTP (smtpout.secureserver.net)
- **Domain:** Custom domain support via Railway

---

## Project Structure

```
thegame/
├── server.js                 # Main Express/WebSocket server
├── database.js              # PostgreSQL connection pool & functions
├── npcLogic.js              # NPC cycle engine logic
├── package.json             # Dependencies & scripts
├── nixpacks.toml            # Railway deployment config
│
├── public/                  # Static frontend files
│   ├── index.html          # Landing/character selection page
│   ├── game.html           # Main game UI
│   ├── style.css           # Global styles
│   └── js/                 # ES6 module-based frontend
│       ├── main.js         # Entry point
│       ├── core/
│       │   ├── Game.js     # WebSocket client & message routing
│       │   ├── Component.js # Base UI component class
│       │   └── MessageBus.js # Event system
│       ├── components/     # UI components
│       │   ├── Terminal.js # Command input & message display
│       │   ├── StatsWidget.js
│       │   ├── MapWidget.js
│       │   ├── CompassWidget.js
│       │   ├── CommsWidget.js
│       │   ├── Inventory.js
│       │   └── NPCWidget.js
│       └── utils/
│           └── Markup.js    # Custom markup parser
│
├── handlers/                # WebSocket message handlers
│   ├── index.js            # Message dispatcher
│   ├── game.js             # Core gameplay commands
│   └── mapEditor.js        # Map editor (god mode)
│
├── middleware/              # Express middleware
│   ├── session.js          # Session management
│   └── auth.js             # Authentication routes
│
├── routes/                  # HTTP API routes
│   └── api.js              # REST endpoints
│
├── services/                # Background services
│   └── npcCycleEngine.js   # NPC harvest cycles
│
├── utils/                   # Utility modules
│   ├── email.js            # Email service
│   ├── broadcast.js        # Room broadcasting
│   ├── messageCache.js     # Message caching
│   ├── markupService.js    # Server-side markup
│   ├── zorkKnowledge.js    # RAG embedding generation
│   └── pathfinding.js      # BFS pathfinding
│
├── migrations/              # Database migrations
│   ├── 001_schema.sql      # Core schema
│   ├── 002_seed_data.sql   # Initial data
│   └── 060_zork_knowledge_system.sql # RAG system
│
├── scripts/                 # Utility scripts
│   ├── migrate.js          # Migration runner
│   ├── zork-ai-agent.cjs   # ZORK autonomous AI agent
│   ├── seed-docs-to-knowledge.js # Bulk knowledge seeding
│   ├── add-feature-knowledge.js # Quick knowledge storage
│   └── sync-dev-to-prod.js # Database sync tool
│
├── mcp-test-server/         # MCP (Model Context Protocol) server
│   ├── index.js            # MCP server entry
│   └── tools/              # MCP tools
│       ├── knowledge.js    # RAG knowledge tools
│       ├── sql.js          # Database tools
│       ├── connection.js   # Game connection tools
│       └── commands.js    # Game command tools
│
└── docs/                    # Documentation
    ├── requirements.md     # Game design spec
    ├── claude.md           # Technical implementation
    ├── railway.md          # Deployment guide
    └── cursor-workflow.md  # Development workflow
```

---

## Database Architecture

### Core Tables

#### `accounts`
- Email/password authentication
- Email verification with 7-day grace period
- Tracks `created_at`, `last_login_at`

#### `user_characters`
- Links accounts to player characters
- One account → many characters

#### `players`
- **Dynamic Stats System:** Prefix-based auto-detection
  - `stat_*` columns (ingenuity, resonance, fortitude, acumen)
  - `ability_*` columns (crafting, attunement, endurance, commerce)
  - `resource_*` columns (max_encumbrance)
  - `flag_*` columns (god_mode)
- `current_room_id` - Player location
- `assignable_points` - Stat point allocation

#### `maps`
- Multiple maps support
- `width`, `height`, `description`
- Examples: Newhaven (20x20), Northern Territory (10x10)

#### `rooms`
- Coordinate-based (`x`, `y`) within maps
- `map_id` - Which map the room belongs to
- **Map Connections:** `connected_map_id`, `connected_room_x`, `connected_room_y`, `connection_direction`
- `room_type` - normal, merchant, factory, warehouse
- UNIQUE constraint on `(map_id, x, y)`

#### `scriptable_npcs`
- NPC type definitions
- `npc_type` - harvester, merchant, lore_keeper, rhythm
- `input_items` / `output_items` - JSON format
- `harvest_formula` - Formula configuration
- `cycle_time_ms` - Harvest cycle timing

#### `room_npcs`
- NPC placements in rooms
- `state` - JSON for NPC state machine
- Tracks harvest cycles, player interactions

#### `items`
- Item definitions
- `item_type` - currency, consumable, equipment, deed, etc.
- `encumbrance` - Weight system
- `poofable` - Can item disappear?
- Merchant pricing, warehouse deed configs

#### `player_items`
- Player inventory
- `player_id`, `item_name`, `quantity`

#### `player_bank`
- Bank storage system
- Currency auto-conversion
- Multiple currency types

#### `warehouse_items` / `player_warehouses`
- Shared warehouse rooms with private storage
- Deed-based system with upgrades

#### `zork_knowledge`
- RAG knowledge base
- `category` - game_design, technical, command_knowledge, etc.
- `priority` - 0 (contextual), 1 (important), 2 (always-include)
- `embedding` - Vector (1536 dims) for semantic search (optional)
- `source` - system, zork, cursor

### Key Relationships

- `accounts` → `user_characters` → `players`
- `players` → `rooms` (via `current_room_id`)
- `rooms` → `maps` (via `map_id`)
- `rooms` ↔ `rooms` (via map connections)
- `room_npcs` → `scriptable_npcs` + `rooms`
- `player_items` → `players` + `items`
- `merchant_items` → `rooms` + `items`

---

## Server Architecture

### Entry Point: `server.js`

**Responsibilities:**
- Express HTTP server (port 3434 or `process.env.PORT`)
- WebSocket server (ws library)
- Session management (express-session)
- Static file serving (`public/`)
- Route setup (`routes/api.js`)
- WebSocket message routing (`handlers/index.js`)
- NPC cycle engine (background service)
- Room update timer (background service)

**Key State:**
- `connectedPlayers` Map - Active WebSocket connections
- `activeAccountSessions` Set - Active account sessions
- `activeCharacterWindows` Map - Multi-window character tracking
- `factoryWidgetState` / `warehouseWidgetState` - Widget state

**Background Services:**
- NPC Cycle Engine - Processes harvest cycles every 1s
- Room Update Timer - Broadcasts room updates every 1s
- Session Cleanup - Every 5 minutes
- Lore Keeper Engagement Cleanup - Every 1 minute

### Database Layer: `database.js`

**Architecture:**
- PostgreSQL connection pool (pg library)
- Async/await pattern throughout
- SSL in production (`NODE_ENV=production`)
- Connection pooling (max 20, idle timeout 30s)

**Function Categories:**
- Accounts & Authentication
- Players & Characters
- Maps & Rooms
- NPCs (scriptable_npcs, room_npcs)
- Items (items, player_items, room_items)
- Merchants (merchant_items)
- Warehouse System
- Bank System
- Lore Keepers
- ZORK Knowledge (RAG system)
- Markup Conventions

### Message Handlers: `handlers/`

**Dispatcher:** `handlers/index.js`
- Routes WebSocket messages to appropriate handlers
- Authenticates sessions
- Interrupts harvest sessions for non-safe commands

**Core Game:** `handlers/game.js`
- Movement (numpad, compass, commands)
- Look, inventory, take, drop
- Harvest, attune, resonate
- Talk, telepath, solve, clue, greet
- Warehouse, bank, merchant (buy/sell)
- Auto-pathing system
- Widget configuration
- God-mode commands

**Map Editor:** `handlers/mapEditor.js`
- Create/update maps and rooms
- Map connections
- Room type management
- God-mode only

---

## Client Architecture

### Architecture Pattern: ES6 Modules + Component System

**Entry Point:** `public/js/main.js`
- Initializes Game controller
- Sets up all UI components
- Handles command line input
- Manages connection state

**Core:** `public/js/core/Game.js`
- WebSocket connection management
- Message routing to MessageBus
- Reconnection logic
- Multi-window support (popup detection, heartbeat, postMessage API)

**Component System:**
- Base class: `Component.js`
- Event system: `MessageBus.js`
- Components subscribe to events, update UI reactively

**Components:**
- **Terminal.js** - Command input, message display, markup parsing
- **StatsWidget.js** - Dynamic stats display (prefix-based detection)
- **MapWidget.js** - Visual map with room highlighting
- **CompassWidget.js** - Direction buttons (N/S/E/W/NE/NW/SE/SW)
- **CommsWidget.js** - Talk/telepath history
- **Inventory.js** - Player inventory with encumbrance
- **NPCWidget.js** - NPC interactions

**Utilities:**
- **Markup.js** - Custom markup parser (`<text>`, `[text]`, `!text!`, custom conventions)
- Converts markup to HTML spans with styling
- Supports line-start patterns (bullets, numbered lists)
- Database-stored conventions

---

## Key Systems

### 1. Authentication System

**Flow:**
1. Registration → Account created → Email verification sent
2. Login → Session created → Character selection
3. Character selection → Player session → Game access
4. 7-day grace period for email verification

**Security:**
- Bcrypt password hashing (10 rounds)
- Rate limiting (login: 10/5min, registration: 5/10min)
- Session-based authentication
- Character ownership validation

### 2. Multi-Map System

**Architecture:**
- Coordinate-based rooms within maps
- Map connections via `connected_map_id`, `connected_room_x/y`
- Bidirectional connections
- Map transitions send full map data to client

**Movement:**
- Check map connection first
- Then check adjacent room in same map
- Support: N/S/E/W/NE/NW/SE/SW/U/D

### 3. Dynamic Stats System

**Prefix-Based Auto-Detection:**
- `stat_*` → Stats (ingenuity, resonance, fortitude, acumen)
- `ability_*` → Abilities (crafting, attunement, endurance, commerce)
- `resource_*` → Resources (max_encumbrance)
- `flag_*` → Flags (god_mode)

**Benefits:**
- Add new stats/abilities without code changes
- Database-driven stat system
- UI automatically detects and displays

### 4. NPC System

**Types:**
- **Harvester** - Produces items on cycles
- **Merchant** - Buys/sells items
- **Lore Keeper** - Dialogue, puzzles, rewards
- **Rhythm** - Produces items based on player rhythm

**Cycle Engine:**
- Background service processes NPCs every 1s
- Checks cycle timing, required items, produces output
- State machine in `room_npcs.state` JSON

**Harvest System:**
- Players use `harvest` command
- Requires items, consumes on cycle
- Produces items, adds to inventory
- Interruptible by movement/commands

### 5. Item System

**Inventory:**
- `player_items` table
- Encumbrance system (weight limits)
- `take` / `drop` commands
- Partial name matching

**Room Items:**
- Items spawn in rooms (`room_items`)
- Players can take them
- Respawn logic

**Merchants:**
- `merchant_items` table
- Buy/sell with currency
- Price validation
- Auto-conversion between currencies

**Warehouse:**
- Shared warehouse rooms
- Private storage per player
- Deed-based system with upgrades
- `store` / `withdraw` commands

**Bank:**
- Currency storage
- Multiple currency types
- Auto-conversion rules
- `deposit` / `withdraw` / `balance` commands

### 6. Markup System

**Built-in Conventions:**
- `<text>` - Keywords (cyan, glow)
- `[text]` - Subtle (inherited color, italic)
- `!text!` - Alerts (red, pulse)
- `{{typewriter:ms}}text{{/typewriter}}` - Animated typing

**Custom Conventions:**
- Database-stored (`markup_conventions` table)
- Examples: `**text**` (bold), `*text*` (italic), `##text##` (headers)
- Line-start patterns: `^- ` (bullets), `^\d+\. ` (numbered lists)

**Processing:**
- Client: `Markup.js` parser
- Server: `markupService.js`
- Both parse markup → HTML spans

### 7. Auto-Pathing System

**Features:**
- BFS pathfinding algorithm (`utils/pathfinding.js`)
- Cross-map navigation
- Visual map selection
- Configurable movement delay (`auto_navigation_time_ms`)
- Movement blocking during auto-navigation

**Commands:**
- `startPathingMode` - Enter pathing mode
- `calculateAutoPath` - Calculate path to destination
- `startPathExecution` - Begin auto-navigation
- `stopPathExecution` - Stop auto-navigation

### 8. Widget System

**Toggleable Widgets:**
- Stats, Map, Compass, Comms, Inventory, NPC, Scripting, Factory, Warehouse, Rune Keeper
- Player-configurable visibility
- Stored in `player_widget_config` table

**Widget Slots:**
- Fixed positions (top-left, top-right, etc.)
- Drag-and-drop reordering
- Persistent configuration

---

## AI Systems

### ZORK THE AI LORD

**Architecture:**
- Autonomous AI agent (`scripts/zork-ai-agent.cjs`)
- Connects to game as real player via WebSocket
- Powered by Claude (Anthropic) - `claude-sonnet-4-20250514`
- Dual persona: "Chuck" (for @Fliz@), "ZORK" (for others)

**Capabilities:**
- Sees room updates, messages, events
- Responds via telepath and room talk
- God-mode powers (create rooms, NPCs, items, execute SQL)
- Learns and remembers via RAG system
- Uses game's markup system for responses

**Knowledge Retrieval:**
- Priority 2 (always-include) - Core identity
- Semantic search (if embeddings available)
- Keyword-based search (fallback)
- Category-based retrieval (system_docs, game_design, etc.)

**Actions:**
- `[ACTION: createRoom]` - Create rooms
- `[ACTION: updatePlayer]` - Modify players
- `[ACTION: learnKnowledge]` - Store new knowledge
- Direct SQL execution (god mode)

### RAG Knowledge System

**Database:** `zork_knowledge` table
- Categories: core_identity, game_design, technical, command_knowledge, world_lore, system_docs, learned_context
- Priorities: 0 (contextual), 1 (important), 2 (always-include)
- Embeddings: Optional vector (1536 dims) for semantic search
- Sources: system, zork, cursor

**Retrieval:**
- Semantic search (OpenAI embeddings)
- Keyword search (fallback)
- Category-based retrieval
- Priority-based filtering

**Storage:**
- MCP tools (`knowledge_add`, `knowledge_update`, etc.)
- ZORK actions (`learnKnowledge`)
- Helper scripts (`add-feature-knowledge.js`)
- Bulk seeding (`seed-docs-to-knowledge.js`)

**Autonomous Workflow:**
- Cursor automatically stores knowledge when implementing features
- `.cursorrules` instructs Cursor to use `knowledge_add` MCP tool
- No manual prompting needed

---

## Development Workflow

### Automatic Knowledge Storage

**Pattern:**
1. Implement feature
2. Cursor automatically detects completion
3. Cursor automatically calls `knowledge_add` MCP tool
4. Knowledge immediately available to ZORK and Cursor

**Categories:**
- `game_design` - Player features (priority 1 for major, 0 for minor)
- `technical` - Implementation (usually 0)
- `command_knowledge` - God-mode commands (usually 1)
- `world_lore` - Story elements (usually 0)
- `system_docs` - Deployment/ops (usually 0)

### Database Sync (Dev to Prod)

**Tool:** `scripts/sync-dev-to-prod.js`

**What Gets Synced:**
- Maps, rooms, NPCs, items
- Merchant configurations
- Room type colors
- Item types

**What's Protected:**
- Accounts, player_items, player_bank
- Terminal history, warehouse contents
- Email/password tokens

**Process:**
1. Make changes in dev
2. Test thoroughly
3. Dry-run: `npm run sync-dev-to-prod:dry-run`
4. Sync: `npm run sync-dev-to-prod` (requires "SYNC PROD" confirmation)

### MCP Test Server

**Purpose:** Provides tools for AI assistants to interact with the game

**Tools:**
- Connection tools (connect, disconnect)
- Command tools (send commands, wait for messages)
- Verification tools (verify player stats, room state)
- SQL tools (query, execute)
- Knowledge tools (search, add, update knowledge)

**Usage:** Configured in `~/.cursor/mcp.json`

---

## Deployment

### Railway.app

**Configuration:**
- PostgreSQL addon (automatic `DATABASE_URL`)
- Environment variables (SMTP, SESSION_SECRET, etc.)
- Custom domain support
- Auto-deploy from GitHub

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection (auto-provided)
- `NODE_ENV=production`
- `SESSION_SECRET` - Random hex string
- `SMTP_*` - GoDaddy email config
- `BASE_URL` - Production URL
- `ANTHROPIC_API_KEY` - For ZORK
- `OPENAI_API_KEY` - For embeddings (optional)

**Migrations:**
- Run automatically on server startup
- `scripts/migrate.js` applies all migrations in order
- Tracked in `schema_migrations` table

### Email System

**Provider:** GoDaddy SMTP
- Host: `smtpout.secureserver.net`
- Port: 587 (STARTTLS)
- User: `brian@brianfloyd.me`

**Features:**
- Account verification (24-hour tokens, 7-day grace period)
- Password reset (1-hour tokens)
- HTML email templates

---

## Key Features

### Player Features
- Real-time multiplayer
- Multiple maps with connections
- NPC interactions (harvest, dialogue, puzzles)
- Inventory system with encumbrance
- Merchant system (buy/sell)
- Warehouse storage
- Bank system
- Auto-pathing
- Widget system
- Markup text styling

### God-Mode Features
- Map editor (create/update maps and rooms)
- NPC editor (create/update NPCs)
- Item editor (create/update items)
- Player editor (modify stats, abilities)
- Jump command (teleport)
- Direct SQL execution
- ZORK actions

### AI Features
- ZORK autonomous agent
- RAG knowledge system
- Automatic knowledge storage
- Semantic search
- Bidirectional learning (ZORK ↔ Cursor)

---

## Communication Protocols

### WebSocket Messages

**Client → Server:**
- `{ type: 'authenticateSession' }` - Authenticate
- `{ type: 'move', direction: 'N' }` - Movement
- `{ type: 'look' }` - Room description
- `{ type: 'harvest', npcName: '...' }` - Harvest
- `{ type: 'talk', npcName: '...', message: '...' }` - Talk to NPC
- `{ type: 'telepath', target: '...', message: '...' }` - Private message

**Server → Client:**
- `{ type: 'roomUpdate', ... }` - Room state
- `{ type: 'playerMessage', ... }` - Player message
- `{ type: 'systemMessage', ... }` - System message
- `{ type: 'stats', ... }` - Player stats
- `{ type: 'inventory', ... }` - Inventory update

### HTTP API

**Endpoints:**
- `POST /api/register` - Account registration
- `POST /api/login` - Login
- `POST /api/logout` - Logout
- `POST /api/select-character` - Character selection
- `GET /api/verify-email?token=...` - Email verification
- `POST /api/request-password-reset` - Password reset request
- `POST /api/reset-password` - Password reset
- `GET /api/account` - Account info

---

## Testing & Verification

### Test Scripts
- `scripts/test-rag-knowledge.js` - RAG system verification
- `scripts/test-sync-safety.js` - Database sync safety test
- `scripts/test-email-*.js` - Email system tests

### MCP Tools for Testing
- Connection tools - Connect as test player
- Command tools - Send commands, verify responses
- Verification tools - Check game state
- SQL tools - Direct database access

---

## Documentation

### Primary Docs
- `docs/requirements.md` - Game design specification
- `docs/claude.md` - Technical implementation details
- `docs/railway.md` - Deployment guide
- `docs/email.md` - Email system configuration
- `docs/database-sync.md` - Dev-to-prod sync guide
- `docs/dbeaver.md` - Database client setup

### Workflow Docs
- `docs/cursor-workflow.md` - Development workflow
- `docs/knowledge-storage-system.md` - RAG system architecture
- `docs/AUTONOMOUS-KNOWLEDGE-SYSTEM.md` - Autonomous knowledge system

### System Prompts
- `scripts/zork-system-prompt.md` - ZORK persona and capabilities

---

## Current State

### Implemented Systems
✅ Authentication (email/password, sessions)  
✅ Multi-map system with connections  
✅ Dynamic stats system  
✅ NPC system (harvest, dialogue, puzzles)  
✅ Item system (inventory, merchants, warehouse, bank)  
✅ Markup system  
✅ Auto-pathing  
✅ Widget system  
✅ ZORK AI agent  
✅ RAG knowledge system  
✅ Automatic knowledge storage  
✅ Database sync (dev to prod)  
✅ Email system (verification, password reset)  
✅ Multi-window character system  

### Future Enhancements
- Vertical movement (z-coordinate)
- Combat system
- Stat progression/leveling
- Additional room types
- More gameplay mechanics

---

## Quick Reference

### Start Development
```bash
npm run dev          # Start server with MCP
npm run dev:stable   # Start stable server
npm run dev:both     # Start both
```

### Database
```bash
npm run migrate              # Run migrations
npm run create-dev-db        # Create dev database
npm run sync-dev-to-prod     # Sync dev to prod
```

### Knowledge System
```bash
node scripts/add-feature-knowledge.js "Title" "category" "Content..."
node scripts/seed-docs-to-knowledge.js
node scripts/test-rag-knowledge.js
```

### Testing
```bash
node scripts/test-rag-knowledge.js
node scripts/test-sync-safety.js
```

---

## Key Concepts

1. **Coordinate-Based Maps** - Rooms have (x, y) coordinates within maps
2. **Map Connections** - Rooms can connect to other maps bidirectionally
3. **Dynamic Stats** - Prefix-based auto-detection (`stat_*`, `ability_*`)
4. **NPC Cycle Engine** - Background service processes NPC harvest cycles
5. **RAG Knowledge** - Shared knowledge base between ZORK and Cursor
6. **Autonomous Storage** - Cursor automatically stores knowledge
7. **Multi-Window** - Players can open multiple character windows
8. **Markup System** - Custom text styling with database-stored conventions

---

**This architecture supports a fully functional multiplayer MUD with AI integration, real-time interactions, and a sophisticated knowledge management system.**

