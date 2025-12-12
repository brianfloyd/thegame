# 📚 The Game Documentation Library
### Master Index (AI-Optimized, Dewey-Decimal Style)

Welcome to the official documentation library for **The Game**, organized into a numbered, flat structure that both humans and AI systems (Cursor, ZORK) can reliably navigate.

This index is the **source of truth** for all documentation.  
Each file is intentionally **concise**, **canonical**, and **non-overlapping**.

---

# 🧭 00 — Start Here

## **00-README.md**  
You are here.  
This file describes the entire knowledge library and links to every document.

## **999.0 - filesystem readme.md**  
**CRITICAL**: Filesystem organization patterns and rules. **MUST BE READ** before implementing any file operations, moves, renames, or reorganization tasks. Defines numbering conventions, series boundaries, classification patterns, and reorganization workflows.

---

# 🎮 10-Series — GAME OPERATIONS (Player-Facing Logic & Core Systems)

The 10-series contains **canonical specifications** for all core game systems, player-facing logic, and gameplay mechanics. These documents are code-verified, implementation-aligned, and serve as the authoritative reference for Cursor AI development.

## **10-00-scrub-prompt-template.md**  
Template and methodology for creating canonical subsystem specifications. Use this when documenting new systems to ensure consistency and code-verification.

## **10-01-player-architecture.md**  
Complete canonical specification of the Player subsystem: schema, fields, operations, validations, state transitions, and interactions. Generated via scrub methodology with full code references.

## **10-01a-player-state-model.md**  
Conceptual model of player state: data flow, invariants, mutation patterns, sync model, and behavioral rules. Complements the detailed architecture spec.

## **10-02-room-architecture.md**  
Complete canonical specification of the Room subsystem: schema, coordinates, map connections, room types, factory quirks, NPC/item placement, and all operations.

## **10-03-item-architecture.md**  
Complete item system specification: item types (ingredient, rune, deed), encumbrance handling, lifecycle flows, warehouse/factory integrations, and serialization rules.

## **10-04-commands.md**  
Canonical command grammar: movement, interaction, parsing, normalization patterns, quantity handling, partial name matching, and all player command categories.

## **10-05-player-lifecycle.md**  
Flow from login → character selection → world entry → session teardown. Includes widget state persistence, reconnection handling, and session management.

## **10-06-npc-harvest-engine.md**  
Rules of the harvesting engine: cycles, tick logic, resonance scaling, timing model, Vitalis integration, success/fail resolution, automation rules, and extension patterns.

## **10-07-factory-crafting-engine.md**  
Factory crafting system: slot system, rune mechanics, recipe matching, crafting formulas (success, crit, speed, efficiency), quirk interactions, and output routing.

## **10-08-automation-engine.md**  
Automation system: auto-path, auto-harvest, auto-loop, pathfinding, state management, and integration with game systems.

## **10-14-formula-canonical-spec.md**  
Global formula system specification: all stat-driven mathematical formulas for harvesting, attunement, pulse echoes, factory crafting, runes, quirks, NPC cycles, and movement. Defines how Resonance, Fortitude, Ingenuity, and Acumen mechanically shape game systems.

## **10-15-god-mode-editors.md**  
God mode editor system specification: editor tools, permissions, field editors, and admin functionality available only to god-mode players. All editors located in `public/gameeditors/` and are separate from gameplay widgets.

---

# 🏛️ 20–29 — ARCHITECTURE (Backend, Frontend, Services, Editors, Widgets)

The 20-series contains **system architecture**, **backend services**, and **frontend architecture** specifications. Organized with backend/system architecture first (20-01 to 20-05), followed by frontend architecture (20-06 to 20-11).

## Backend & System Architecture

## **20-01-system-architecture-canonical.md**  
Canonical system architecture specification: high-level overview of the entire system architecture, Node.js backend structure, WebSocket communication, database schema, and all system-level architectural decisions.

## **20-02-backend-services-canonical.md**  
Canonical backend services specification: service inventory, purpose, contracts, dependencies, and how services under `services/` behave and evolve.

## **20-03-database-schema-canonical.md**  
Canonical database schema specification: PostgreSQL schema definitions, table structures, relationships, constraints, and all database layer rules and patterns.

## **20-04-mcp-server-canonical.md**  
Canonical MCP server specification: MCP server layer, tools, contracts, guarantees, and behavior for AI tooling integration.

## **20-05-email-system-canonical.md**  
Canonical email system specification: email subsystem for account verification and password reset functionality.

## Frontend Architecture

## **20-06-frontend-architecture-canonical.md**  
Complete frontend architecture specification: client-side structure, widget hierarchy, WebSocket integration, UI state management, and all frontend modules. Defines separation between gameplay UI (`public/js/widgets/`) and editor UI (`public/gameeditors/`).

## **20-07-markup-semantics.md**  
Markup system semantics: built-in conventions (angle brackets, square brackets, curly braces), custom conventions, formatting rules, and effects. Semantic definitions only.

## **20-08-markup-rendering.md**  
Markup rendering architecture: Alpine.js integration, client/server parsing pipelines, widget integration, and rendering flow.

## **20-09-game-communication.md**  
Game communication systems: WebSocket protocols, message routing, room chat, global resonation, private messaging, and comms widget architecture.

## **20-10-terminal-rendering.md**  
Terminal rendering system: output formatting, scrollback, message display, terminal widget architecture, and interaction patterns.

## **20-11-widget-system.md**  
Complete widget system specification: standard widgets (stats, compass, map, comms, automation), conditional widgets (NPC harvest, factory, warehouse), god mode widgets, visibility rules, state management, and integration patterns. All widgets located in `public/js/widgets/`.

---

# 🤖 30–39 — AI & AUTOMATION (Knowledge, Workflow, Tickets, RAG)

The 30-series contains specifications for AI systems, knowledge management, and automation workflows.

## **30-00-autonomous-knowledge-system-canonical.md**  
Complete canonical specification of the autonomous knowledge system: automated knowledge storage via MCP + Cursor + ZORK, knowledge base operations, and AI integration patterns.

## **30-10-rag-patterns.md**  
Complete RAG knowledge system specification: schema, operations, validations, behavioral rules, failure states, serialization paths, and best practices for using the RAG system. Code-verified with full file references.

Planned documents:
- **31-cursor-workflow.md** - Canonical patterns Cursor must follow
- **32-ticket-automation.md** - Automatic ticket detection and processing

---

# 🛠️ 40–49 — DEVELOPER TOOLS (Local Dev, DB, Testing)

*This series will be built as the knowledge base expands.*

Planned documents:
- **40-dbeaver-guide.md** - Database connection guide
- **41-database-sync.md** - Dev → production sync rules
- **42-local-dev-environment.md** - Local setup guide
- **43-testing-guide.md** - Testing methodologies

---

# 🏗️ 50–59 — INFRASTRUCTURE & OPS

*This series will be built as the knowledge base expands.*

Planned documents:
- **50-railway-deployment.md** - Deployment steps
- **51-custom-domain-setup.md** - Domain configuration
- **52-environment-variables.md** - Environment variable reference
- **53-release-process.md** - Release workflow

---

# 📋 999-Series — REFERENCE SPECIFICATIONS

Files in the 999-series are reference specifications created using the scrub methodology. These are comprehensive, code-verified specifications that serve as detailed references but are not part of the canonical library structure.

## **999-project-file-structure-canonical.md**  
Complete canonical specification of the project file structure: directory organization, file purposes, naming patterns, relationships, and current state. Code-verified with full file references. Documents the as-is structure of the entire project.

## **999-project-file-structure-cleanup-recommendations.md**  
Actionable recommendations for cleaning up the project file structure: duplications, legacy files, outdated artifacts, organizational improvements, and implementation checklist. Prioritized by risk and impact. Use this to plan and execute file structure cleanup.

## **999-game-cursor-ticketing-system-canonical-spec.md**  
Complete canonical specification of the game-to-cursor ticketing system: schema, operations, validations, behavioral rules, state transitions, interactions, failure states, serialization paths, and best practices. Code-verified with full file references for feature development and debugging workflow.

## **999-auto-ticket-processing-canonical-spec.md**  
Complete canonical specification of the auto-ticket-processing system: file system structure, trigger files, processing files, auto-processor logic, MCP tool integration, workflow patterns, failure states, and best practices. Code-verified with full file references for automatic ticket detection and processing.

## **999-cursor-scrub-workflow.md**  
Canonical workflow document defining mandatory patterns Cursor must follow when analyzing codebases and creating canonical subsystem specifications. Includes all 7 scrub steps, output structure, compliance verification, and best practices.

## **999-editor-systems-canonical-spec.md**  
Complete canonical specification of all God Mode editor systems (Player, Map, Item, NPC, Crafting, Ticketing). Code-verified with full file references.

## **1000-migrateditors.md**  
Migration requirements document: step-by-step guide for migrating editors from `protected/editors/` to `public/gameeditors/`, including file moves, route updates, and canonical documentation updates.

## **COMPONENTS-TO-WIDGETS-MIGRATION-UPDATES.md**  
Migration documentation: comprehensive list of all canonical documentation files requiring updates after consolidating `public/js/components/` into `public/js/widgets/`.

---

# 🚫 100-Series — IGNORE (Archived/Deprecated/Legacy)

Files in the 100-series are archived, deprecated, or should be ignored by AI systems. They are kept for historical reference but are not part of the active documentation.

## **100-ignore-factory buff mechanics from chuck**  
Factory stat & buff integration notes (archived reference material).

## **100-god-mode-editors-canonical-answers.md**  
God mode editor system Q&A documentation (archived, superseded by 10-15-god-mode-editors.md).

## **100-god-mode-editors-canonical-scrub-answers.md**  
God mode editor system scrub Q&A documentation (archived, superseded by 10-15-god-mode-editors.md).

---

# 📌 Document Philosophy

- Each file contains **one domain only**  
- No duplication  
- All specs are **code-verified** (where applicable)  
- All docs are **Cursor-optimized for RAG**  
- Filenames dictate hierarchy  
- New docs must follow numbering conventions

## Numbering Conventions

- **10-series**: Core game operations and player-facing systems (currently populated)
- **20-29**: Architecture and technical implementation details (frontend architecture populated)
- **30-39**: AI, automation, and knowledge systems (partially populated)
- **40-49**: Developer tools and workflows (future)
- **50-59**: Infrastructure and operations (future)
- **60-69**: Future gameplay systems (combat, magic, factions)
- **70-79**: Advanced AI systems (procedural content, NPC reasoning)
- **80-89**: Infrastructure scaling (Redis, sharding, multi-instance)
- **90-99**: Legacy/reference documentation
- **999-series**: Reference specifications and detailed documentation
- **1000-series**: Migration guides and transition documentation

---

# 🤝 How AI Should Use This Library

### Cursor (AI Developer)
- **MUST read `999.0 - filesystem readme.md`** before implementing any file operations, moves, renames, or reorganization tasks
- **MUST consult 10-series** before implementing or modifying game systems
- **MUST use 10-00-scrub-prompt-template.md** when creating new canonical specs
- **MUST verify** all specifications against actual codebase
- Should reference architecture docs (20-series) when they exist
- Should follow workflows defined in 30-series when they exist

### ZORK (AI NPC Brain)
- Loads 10-series docs as needed for game logic
- Uses 30-series for knowledge consistency (when available)
- References command specs (10-04) for player interaction

### Humans
- Should begin here, then jump to relevant section
- Use 10-series for understanding game systems
- Reference other series for implementation details (as they're added)

---

# 🔮 Current Status

**10-Series**: ✅ Complete and organized  
- All core game systems documented
- Canonical specifications with code references
- Ready for Cursor AI consumption

**20-Series**: ✅ Frontend architecture complete  
- Frontend architecture, markup, rendering, communication, and widget systems documented
- All widgets located in `public/js/widgets/`
- Editors located in `public/gameeditors/` (separate from gameplay)
- Ready for Cursor AI consumption

**30-Series**: 🟡 Partially populated  
- Autonomous knowledge system and RAG patterns documented
- Additional AI workflow documents planned

**100-Series**: 🗄️ Archive/Ignore  
- Historical and deprecated documentation
- Should be ignored by AI systems unless specifically referenced

---

# 🏁 End of Index

This concludes the master catalog.

The Game Documentation Library is now structured, canonical, scalable — and optimized for AI consumption via Cursor.
