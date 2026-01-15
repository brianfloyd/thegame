# 📚 Canonical Documentation Index

**Entry Point for All Canonical Specifications**

This index catalogs all canonical documents in The Game's documentation library. All documents listed here are the **single source of truth** for their respective domains.

**🚨 CRITICAL: Only documents in this index are canonical. Documents in `/docs/Chuck docs/` (999-*) are reference materials and MUST NOT be treated as canonical sources.**

---

## 📋 Quick Reference

| Series | Domain | Document Count |
|--------|--------|----------------|
| **00-XX** | Index & Governance | 2 |
| **01-XX** | Templates & Processes | 2 |
| **10-XX** | Gameplay Mechanics | 10 |
| **20-XX** | System Architecture | 13 |
| **30-XX** | System Integrations | 3 |
| **50-XX** | Infrastructure & Auth | 4 |
| **Total** | | **34 canonical documents** |

---

## 00-XX: Index & Governance

### `00-README.md`
**Purpose:** Cursor governance rules and canon management processes  
**Use When:** Starting any task, understanding how to work with canon, determining whether canon exists  
**Key Content:**
- Canon creation and update flow (MANDATORY)
- Visual drift cues (CANON APPLY, CANON PROPOSE, CANON BLOCK)
- MCP tool usage guidelines
- File & write rules
- Prime directive and self-check requirements

### `00-01-INDEX.MD` (This Document)
**Purpose:** Comprehensive catalog of all canonical documents  
**Use When:** Finding relevant canonical documents for a specific task or domain  
**Key Content:** Complete index organized by series and topic

---

## 01-XX: Templates & Processes

### `01-00-scrub-prompt-template.md`
**Purpose:** Template for creating reference documents (999-*) when canon is missing or unclear  
**Use When:** Canon doesn't exist and you need to create analysis/reference material  
**Key Content:** Template structure for scrub documents that go to `/docs/Chuck docs/`

### `01-01-scrub-add-cannon-template.md`
**Purpose:** Template for creating or updating canonical documents  
**Use When:** Adding new canon or updating existing canon (requires explicit user approval)  
**Key Content:** Required structure and format for canonical specifications

---

## 10-XX: Gameplay Mechanics

### Core Game Entities

#### `10-01-player-architecture.md`
**Purpose:** Player data model, stat system, and player-related game mechanics  
**Use When:** Working with player stats, attributes, resources, or player state  
**Key Content:** Player schema, stat definitions, player data structure

#### `10-01a-player-state-model.md`
**Purpose:** Detailed player state model and lifecycle  
**Use When:** Understanding player state transitions, persistence, or state management  
**Key Content:** Player state structure, lifecycle events, state validation

#### `10-02-room-architecture.md`
**Purpose:** Room data model, exits, room properties, and spatial relationships  
**Use When:** Working with rooms, maps, exits, or room-based game logic  
**Key Content:** Room schema, exit system, room properties, coordinate systems

#### `10-03-item-architecture.md`
**Purpose:** Item system, item properties, inventory, and item mechanics  
**Use When:** Working with items, inventory, item interactions, or item-related features  
**Key Content:** Item schema, inventory system, item types, item properties

### Commands & Interactions

#### `10-04-commands.md`
**Purpose:** Command system, command parsing, and all player-facing commands  
**Use When:** Adding commands, modifying command behavior, or understanding command execution  
**Key Content:** Command structure, command list, command parsing rules, command handlers

### Game Systems

#### `10-05-player-lifecycle.md`
**Purpose:** Player lifecycle events, registration, login, session management  
**Use When:** Working with player registration, login flow, or session lifecycle  
**Key Content:** Registration process, login flow, session management, lifecycle events

#### `10-06-npc-harvest-engine.md`
**Purpose:** NPC harvest system, NPC cycles, pulse echo harvesting mechanics  
**Use When:** Working with NPCs, harvest mechanics, NPC cycles, or pulse echo systems  
**Key Content:** NPC harvest logic, cycle timing, yield calculations, NPC behavior

#### `10-07-factory-crafting-engine.md`
**Purpose:** Factory crafting system, recipes, crafting mechanics  
**Use When:** Working with factories, crafting, recipes, or factory-related features  
**Key Content:** Factory system, recipe definitions, crafting process, factory mechanics

#### `10-14-formula-canonical-spec.md`
**Purpose:** **CRITICAL** - All stat-driven formulas (harvesting, attunement, crafting, movement)  
**Use When:** **ALWAYS** when implementing or modifying game mechanics that involve calculations  
**Key Content:** All formula definitions, stat dependencies, calculation rules, formula validation

### UI & Widgets

#### `10-15-widget-operation-canonical.md`
**Purpose:** Widget system operation, widget types, widget lifecycle  
**Use When:** Working with widgets, widget configuration, or widget behavior  
**Key Content:** Widget registry, widget types, widget lifecycle, widget configuration

#### `10-16-automation-engine.md`
**Purpose:** Automation system, automated actions, automation rules  
**Use When:** Working with automation features, automated gameplay, or automation configuration  
**Key Content:** Automation system architecture, automation rules, automated actions

#### `10-17-individual-editor-specifications.md`
**Purpose:** Specifications for each individual game editor  
**Use When:** Working with editors, editor functionality, or editor features  
**Key Content:** Editor specifications, editor structure, editor requirements  
**Note:** Editors located in `public/gameeditors/` (see 20-00 for file structure)

### Standards & References

#### `10-18-emoji-reference.md`
**Purpose:** Emoji usage standards and reference guide  
**Use When:** Determining which emoji to use in UI, messages, or game content  
**Key Content:** Emoji standards, emoji definitions, emoji usage guidelines

#### `10-19-map-coordinate-import-canonical.md`
**Purpose:** Map coordinate system, room adjacency, and external import format  
**Use When:** Understanding map/room coordinates, creating importable maps, building AI map generators  
**Key Content:** Coordinate system, direction deltas, exit generation, map connections, import JSON schema

---

## 20-XX: System Architecture

### File Structure & Organization

#### `20-00-file-structure-canonical.md`
**Purpose:** **CRITICAL** - Canonical file structure, directory organization, archive policies  
**Use When:** **ALWAYS** when creating, moving, or organizing files  
**Key Content:** Directory structure, file naming conventions, archive policies, documentation organization

### System Architecture

#### `20-01-system-architecture-canonical.md`
**Purpose:** Overall system architecture, component relationships, system design  
**Use When:** Understanding system-wide architecture, component interactions, or system design  
**Key Content:** System architecture overview, component relationships, architectural patterns

#### `20-02-frontend-architecture-canonical.md`
**Purpose:** Frontend architecture, client-side structure, UI components  
**Use When:** Working on frontend code, UI components, or client-side logic  
**Key Content:** Frontend structure, component architecture, MessageBus, widget system

#### `20-03-backend-services-canonical.md`
**Purpose:** Backend services architecture, service structure, backend logic  
**Use When:** Working on backend code, services, or server-side logic  
**Key Content:** Service architecture, service structure, backend patterns

#### `20-04-database-schema-canonical-spec.md`
**Purpose:** Database schema, table definitions, database structure  
**Use When:** Working with database, queries, migrations, or database-related code  
**Key Content:** Database schema, table definitions, relationships, constraints

### Communication & Rendering

#### `20-05-email-system-canonical.md`
**Purpose:** Email system architecture and email delivery  
**Use When:** Working with email functionality, email templates, or email delivery  
**Key Content:** Email system structure, email templates, email delivery

#### `20-07-markup-semantics.md`
**Purpose:** Markup language semantics and syntax  
**Use When:** Working with markup, text formatting, or message formatting  
**Key Content:** Markup syntax, markup semantics, markup rules

#### `20-08-markup-rendering.md`
**Purpose:** Markup rendering engine and rendering rules  
**Use When:** Implementing markup rendering or modifying markup display  
**Key Content:** Rendering engine, rendering rules, markup display logic

#### `20-09-game-communication.md`
**Purpose:** Game communication protocol, message format, WebSocket communication  
**Use When:** Working with game messages, WebSocket communication, or message protocols  
**Key Content:** Communication protocol, message formats, WebSocket handling

#### `20-10-terminal-rendering.md`
**Purpose:** Terminal rendering system and terminal display  
**Use When:** Working with terminal UI, terminal rendering, or terminal display  
**Key Content:** Terminal rendering, terminal display logic, terminal features

### UI Architecture

#### `20-11-widget-architecture-canonical.md`
**Purpose:** Widget architecture, widget system design, widget implementation  
**Use When:** Implementing widgets, widget architecture, or widget system design  
**Key Content:** Widget architecture, widget system structure, widget implementation patterns  
**Note:** References 20-00 for file structure

#### `20-12-editor-architecture-canonical.md`
**Purpose:** Editor architecture, editor system design, editor implementation  
**Use When:** Implementing editors, editor architecture, or editor system design  
**Key Content:** Editor architecture, editor system structure, editor implementation patterns  
**Note:** References 20-00 for file structure, editors in `public/gameeditors/`

---

## 30-XX: System Integrations

### `30-00-autonomous-knowledge-system-canonical.md`
**Purpose:** Autonomous knowledge system architecture and behavior  
**Use When:** Working with knowledge system, AI knowledge, or knowledge persistence  
**Key Content:** Knowledge system architecture, knowledge storage, knowledge retrieval

### `30-10-rag-patterns.md`
**Purpose:** RAG (Retrieval-Augmented Generation) patterns and implementation  
**Use When:** Implementing RAG patterns, knowledge retrieval, or AI knowledge integration  
**Key Content:** RAG patterns, retrieval strategies, knowledge integration

### `30-20-mcp-server-canonical.md`
**Purpose:** MCP (Model Context Protocol) server specification, tools, and contracts  
**Use When:** Working with MCP tools, MCP server, or AI tool integration  
**Key Content:** MCP server specification, tool definitions, MCP contracts, tool behavior

---

## 50-XX: Infrastructure & Auth

### `50-00-environment-variables-canonical-spec.md`
**Purpose:** Environment variables specification and configuration  
**Use When:** Working with environment configuration, deployment, or environment variables  
**Key Content:** Environment variable definitions, configuration requirements, environment setup

### `50-01-auth-and-sessions-canonical.md`
**Purpose:** Authentication and session management specification  
**Use When:** Working with authentication, sessions, or user security  
**Key Content:** Authentication flow, session management, security requirements

### `50-02-auth-login-terminal-multi-character-canonical-spec.md`
**Purpose:** Authentication, login flow, terminal interface, and multi-character support  
**Use When:** Working with login flow, terminal login, or multi-character functionality  
**Key Content:** Login flow, terminal interface, multi-character system, authentication UI

### `50-03-railway-deployment-canonical.md`
**Purpose:** Railway platform deployment specification and deployment operations  
**Use When:** Deploying to Railway, managing Railway services, or configuring Railway deployment  
**Key Content:** Railway CLI commands, deployment process, service configuration, build configuration, environment variable management

---

## 🎯 Navigation by Task

### Implementing Game Mechanics
1. **`10-14-formula-canonical-spec.md`** - Start here for all formulas
2. **`10-04-commands.md`** - Command system
3. **`10-01-player-architecture.md`** - Player mechanics
4. **`10-02-room-architecture.md`** - Room/map mechanics
5. **`10-03-item-architecture.md`** - Item/inventory mechanics

### Working with NPCs or Harvesting
1. **`10-06-npc-harvest-engine.md`** - NPC harvest system
2. **`10-14-formula-canonical-spec.md`** - Harvest formulas
3. **`10-02-room-architecture.md`** - Room context

### Working with Factories or Crafting
1. **`10-07-factory-crafting-engine.md`** - Factory system
2. **`10-14-formula-canonical-spec.md`** - Crafting formulas
3. **`10-03-item-architecture.md`** - Item system

### Working with Frontend/UI
1. **`20-02-frontend-architecture-canonical.md`** - Frontend architecture
2. **`10-15-widget-operation-canonical.md`** - Widget system
3. **`20-11-widget-architecture-canonical.md`** - Widget architecture
4. **`20-10-terminal-rendering.md`** - Terminal rendering

### Working with Backend/Services
1. **`20-03-backend-services-canonical.md`** - Backend architecture
2. **`20-04-database-schema-canonical-spec.md`** - Database schema
3. **`20-01-system-architecture-canonical.md`** - System architecture

### Working with Files/Directories
1. **`20-00-file-structure-canonical.md`** - **ALWAYS** reference this first
2. Series-specific architecture docs for component locations

### Working with Editors
1. **`20-12-editor-architecture-canonical.md`** - Editor architecture
2. **`10-17-individual-editor-specifications.md`** - Individual editor specs
3. **`20-00-file-structure-canonical.md`** - File locations (`public/gameeditors/`)

### Working with Communication/Messages
1. **`20-09-game-communication.md`** - Communication protocol
2. **`20-07-markup-semantics.md`** - Markup syntax
3. **`20-08-markup-rendering.md`** - Markup rendering

### Working with Authentication/Login
1. **`50-02-auth-login-terminal-multi-character-canonical-spec.md`** - Login flow
2. **`50-01-auth-and-sessions-canonical.md`** - Auth & sessions
3. **`10-05-player-lifecycle.md`** - Player lifecycle

### Working with MCP/AI Tools
1. **`30-20-mcp-server-canonical.md`** - MCP specification
2. **`00-README.md`** - MCP usage guidelines (forbidden tools)

### Working with Deployment/Infrastructure
1. **`50-03-railway-deployment-canonical.md`** - Railway deployment process
2. **`50-00-environment-variables-canonical-spec.md`** - Environment variable configuration
3. **`20-03-backend-services-canonical.md`** - Backend services architecture

---

## 🔍 Finding Documents Quickly

### By Series Number
- **00-XX**: Start here (governance, index)
- **01-XX**: Templates and processes
- **10-XX**: Gameplay and game mechanics
- **20-XX**: Technical architecture and systems
- **30-XX**: System integrations (MCP, knowledge)
- **50-XX**: Infrastructure (env, auth, config)

### By Topic
- **Formulas**: `10-14-formula-canonical-spec.md`
- **File Structure**: `20-00-file-structure-canonical.md`
- **Database**: `20-04-database-schema-canonical-spec.md`
- **Widgets**: `10-15-widget-operation-canonical.md`, `20-11-widget-architecture-canonical.md`
- **Editors**: `10-17-individual-editor-specifications.md`, `20-12-editor-architecture-canonical.md`
- **Commands**: `10-04-commands.md`
- **Architecture**: `20-01-system-architecture-canonical.md`, `20-02-frontend-architecture-canonical.md`, `20-03-backend-services-canonical.md`
- **Deployment**: `50-03-railway-deployment-canonical.md`
- **Environment Variables**: `50-00-environment-variables-canonical-spec.md`

---

## 📝 Document Status

All documents listed in this index are:
- ✅ Canonical (single source of truth)
- ✅ Located in `docs/` root directory
- ✅ Numbered according to series conventions
- ✅ Verified against codebase where applicable

**Documents NOT in this index (e.g., in `/docs/Chuck docs/`) are reference materials and MUST NOT be treated as canonical sources.**

---

## 🔄 Maintenance

This index should be updated whenever:
- New canonical documents are added
- Canonical documents are removed or deprecated
- Document purposes or key content areas change significantly

Update process:
1. Modify this index document
2. Ensure document numbering follows series conventions (see `20-00-file-structure-canonical.md`)
3. Verify all listed documents exist and are canonical

---

**Last Updated:** Based on current canonical document library  
**Entry Point:** Start with `00-README.md` for governance, or use this index to find specific domains

