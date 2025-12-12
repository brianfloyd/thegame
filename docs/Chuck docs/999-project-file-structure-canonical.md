# Project File Structure: Canonical Specification

**Analysis Date:** Based on codebase analysis  
**Scope:** Complete project file structure, directory organization, and file purposes  
**Method:** Direct code examination with file/line citations

This document defines the **complete, code-verified canonical file structure** of The Game project. All facts are grounded in real code and directory structure, with file references where possible.

---

# 1. Project Root Structure / Source of Truth

## 1.1 Root Directory

**Location:** Project root (`c:\thegame\` or workspace root)

**Root-Level Files:**
- `server.js` - Main Express/WebSocket server entry point
- `database.js` - PostgreSQL connection pool and database functions
- `npcLogic.js` - NPC cycle engine logic
- `package.json` - Node.js dependencies and scripts
- `package-lock.json` - Dependency lock file
- `nixpacks.toml` - Railway deployment configuration
- `game.db` - SQLite database file (development, legacy)
- `game.db-journal` - SQLite journal file (development, legacy)
- `tall` - Text file (appears to be "less" command help text, likely accidental)

**Evidence:**
- `package.json:1-52` - Project configuration
- `server.js` - Main server file
- `database.js` - Database module
- Directory listing shows these files at root

## 1.2 Directory Structure

**Top-Level Directories:**
1. `archive/` - Legacy/archived files
2. `ascii images/` - ASCII art and image assets (note: space in name)
3. `assets/` - Game asset files (PNG images)
4. `config/` - Configuration files
5. `devtools/` - Development tools
6. `docs/` - Documentation
7. `handlers/` - WebSocket message handlers
8. `mcp-test-server/` - MCP (Model Context Protocol) test server
9. `middleware/` - Express middleware
10. `migrations/` - Database migration SQL files
11. `models/` - Data models
12. `protected/` - Protected routes and editor files
13. `public/` - Public static files (frontend)
14. `reports/` - Analysis and validation reports
15. `routes/` - HTTP API routes
16. `scripts/` - Utility and helper scripts
17. `services/` - Background services
18. `utils/` - Utility modules

**Evidence:**
- Directory listing shows all top-level directories
- `docs/GAME-ARCHITECTURE-SUMMARY.md:40-95` - Project structure documentation

---

# 2. Directory Specifications

## 2.1 `archive/` Directory

**Purpose:** Stores legacy and archived files

**Structure:**
```
archive/
└── legacy_editors_20241210/
    ├── crafting-editor.legacy.html
    ├── crafting-editor.legacy.js
    ├── item-editor.legacy.html
    ├── item-editor.legacy.js
    ├── map-editor.legacy.html
    ├── map-editor.legacy.js
    ├── npc-editor.legacy.html
    ├── npc-editor.legacy.js
    ├── player-editor.legacy.html
    └── player-editor.legacy.js
```

**Contents:**
- 10 files total (5 HTML, 5 JS)
- Legacy editor files archived on 2024-12-10
- These are old versions of editors before migration to new architecture

**Evidence:**
- `archive/legacy_editors_20241210/` directory exists
- `reports/legacy_editors.md:1-196` - Documents legacy editor migration

## 2.2 `ascii images/` Directory

**Purpose:** ASCII art and image assets (note: space in directory name)

**Structure:**
```
ascii images/
├── 10_2_room_architecture.md
├── Antigravity.exe
├── runekeeper.txt
├── wiz.html
├── wiz.jpg
├── wiz2.webp
└── wiz3.webp
```

**Contents:**
- 7 files total
- Mix of markdown, executable, text, HTML, and image files
- Appears to contain reference materials and assets

**Evidence:**
- Directory listing shows `ascii images/` with space in name
- Files present in directory

## 2.3 `assets/` Directory

**Purpose:** Game asset files (PNG images)

**Structure:**
```
assets/
└── [31 PNG files]
```

**Contents:**
- 31 PNG image files
- Game visual assets

**Evidence:**
- Directory listing shows 31 PNG files

## 2.4 `config/` Directory

**Purpose:** Configuration files

**Structure:**
```
config/
└── factoryConfig.js
```

**Contents:**
- `factoryConfig.js` - Factory system configuration

**Evidence:**
- Directory listing shows `config/factoryConfig.js`

## 2.5 `devtools/` Directory

**Purpose:** Development tools

**Structure:**
```
devtools/
└── start-dev-tools.bat
```

**Contents:**
- `start-dev-tools.bat` - Windows batch script for starting dev tools

**Evidence:**
- Directory listing shows `devtools/start-dev-tools.bat`

## 2.6 `docs/` Directory

**Purpose:** Project documentation

**Structure:**
```
docs/
├── archive/
│   └── [20 markdown files]
├── Chuck docs/
│   └── [43 files: 41 *.md, 2 *no-ext]
├── AUTO-TICKET-PROCESSING.md
├── AUTONOMOUS-KNOWLEDGE-SYSTEM.md
├── claude.md
├── cursor-workflow.md
├── custom-domain-setup.md
├── database-sync.md
├── dbeaver.md
├── email.md
├── feature-template.md
├── GAME-ARCHITECTURE-SUMMARY.md
├── knowledge-storage-system.md
├── network-access-guide.md
├── player-tutorial.md
├── rag-test-results.md
├── railway.md
├── recommended-env-settings.md
├── requirements.md
├── ssl-certificate-troubleshooting.md
├── TEST-LOG.md
└── tests.md
```

**Subdirectories:**
- `archive/` - Archived documentation (20 markdown files)
- `Chuck docs/` - Canonical documentation library (43 files)

**Root Documentation Files:**
- 20 markdown files at root level
- Mix of guides, summaries, and reference documentation

**Evidence:**
- Directory listing shows `docs/` structure
- `docs/Chuck docs/00-README.md:1-246` - Documentation library index

## 2.7 `handlers/` Directory

**Purpose:** WebSocket message handlers

**Structure:**
```
handlers/
├── craftingEditor.js
├── game.js
├── index.js
├── itemEditor.js
├── mapEditor.js
├── npcEditor.js
└── playerEditor.js
```

**Contents:**
- `index.js` - Message dispatcher/router
- `game.js` - Core gameplay commands
- `craftingEditor.js` - Crafting editor handler
- `itemEditor.js` - Item editor handler
- `mapEditor.js` - Map editor handler
- `npcEditor.js` - NPC editor handler
- `playerEditor.js` - Player editor handler

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:71-74` - Handlers documentation
- Directory listing shows 7 handler files

## 2.8 `mcp-test-server/` Directory

**Purpose:** MCP (Model Context Protocol) test server for AI tooling

**Structure:**
```
mcp-test-server/
├── index.js
├── package.json
├── package-lock.json
├── README.md
├── node_modules/
├── src/
│   ├── GameClient.js
│   ├── MessageQueue.js
│   ├── StateVerifier.js
│   └── TestSession.js
├── tests/
│   └── [4 test files]
└── tools/
    └── [9 tool files]
```

**Contents:**
- `index.js` - MCP server entry point
- `package.json` - MCP server dependencies
- `src/` - Core MCP server source files
- `tests/` - Test files (4 files)
- `tools/` - MCP tool implementations (9 files)

**Evidence:**
- Directory listing shows MCP server structure
- `mcp-test-server/README.md` - MCP server documentation

## 2.9 `middleware/` Directory

**Purpose:** Express middleware

**Structure:**
```
middleware/
├── auth.js
└── session.js
```

**Contents:**
- `auth.js` - Authentication middleware
- `session.js` - Session management middleware

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:76-78` - Middleware documentation
- Directory listing shows 2 middleware files

## 2.10 `migrations/` Directory

**Purpose:** Database migration SQL files

**Structure:**
```
migrations/
└── [73 SQL files]
```

**Contents:**
- 73 SQL migration files
- Sequential numbering (e.g., `001_schema.sql`, `002_*.sql`, etc.)
- Database schema evolution

**Evidence:**
- Directory listing shows 73 SQL files
- Migration files follow sequential naming pattern

## 2.11 `models/` Directory

**Purpose:** Data models

**Structure:**
```
models/
└── ticket.js
```

**Contents:**
- `ticket.js` - Ticket model (normalization, validation, mapping)

**Evidence:**
- Directory listing shows `models/ticket.js`
- `models/ticket.js:1-267` - Complete ticket model implementation

## 2.12 `protected/` Directory

**Purpose:** Protected routes and editor files (god-mode only)

**Structure:**
```
protected/
└── editors/
    ├── crafting-editor.css
    ├── crafting-editor.html
    ├── crafting-editor.js
    ├── item-editor.css
    ├── item-editor.html
    ├── item-editor.js
    ├── map-editor.css
    ├── map-editor.html
    ├── map-editor.js
    ├── npc-editor.css
    ├── npc-editor.html
    ├── npc-editor.js
    ├── player-editor.css
    ├── player-editor.html
    ├── player-editor.js
    ├── ticket-editor.css
    ├── ticket-editor.html
    └── ticket-editor.js
```

**Contents:**
- 18 files total (6 CSS, 6 HTML, 6 JS)
- Editor files for god-mode players
- Each editor has CSS, HTML, and JS files

**Evidence:**
- Directory listing shows `protected/editors/` with 18 files
- Editors require god-mode authentication

## 2.13 `public/` Directory

**Purpose:** Public static files (frontend)

**Structure:**
```
public/
├── ascii-images/
│   └── runekeeper.txt
├── components/
│   └── [empty]
├── css/
│   └── [1 CSS file]
├── client.js
├── game.html
├── index.html
├── js/
│   ├── components/
│   │   └── [9 component files]
│   ├── core/
│   │   └── [3 core files]
│   ├── editorComponents/
│   │   └── [7 editor component files]
│   ├── editorShared/
│   │   └── [1 shared editor file]
│   ├── main.js
│   ├── models/
│   │   └── [4 model files]
│   ├── services/
│   │   └── [1 service file]
│   ├── utils/
│   │   └── [3 utility files]
│   └── widgets/
│       └── [4 widget files]
├── markup-helper.js
├── reset-password.html
└── style.css
```

**Key Files:**
- `index.html` - Landing/character selection page
- `game.html` - Main game UI
- `style.css` - Global styles
- `client.js` - Legacy monolithic client (not loaded, kept for reference)
- `markup-helper.js` - Markup helper for editors (kept for editor compatibility)
- `reset-password.html` - Password reset page

**Subdirectories:**
- `js/` - ES6 module-based frontend (35 files total)
  - `widgets/` - UI widgets and components (9 files)
  - `core/` - Core infrastructure (3 files)
  - `editorComponents/` - Editor components (7 files)
  - `editorShared/` - Shared editor code (1 file)
  - `models/` - Data models (4 files)
  - `services/` - Services (1 file)
  - `utils/` - Utilities (3 files)
  - `widgets/` - Widget system (4 files)
  - `main.js` - Entry point

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:50-69` - Frontend structure
- `docs/requirements.md:464-466` - Legacy files documentation
- Directory listing shows public structure

## 2.14 `reports/` Directory

**Purpose:** Analysis and validation reports

**Structure:**
```
reports/
├── editor_canonical_pattern.md
├── editor_upgrade_validation.md
└── legacy_editors.md
```

**Contents:**
- `editor_canonical_pattern.md` - Editor pattern documentation
- `editor_upgrade_validation.md` - Editor upgrade validation
- `legacy_editors.md` - Legacy editor analysis

**Evidence:**
- Directory listing shows 3 report files
- `reports/legacy_editors.md:1-196` - Legacy editor report

## 2.15 `routes/` Directory

**Purpose:** HTTP API routes

**Structure:**
```
routes/
└── api.js
```

**Contents:**
- `api.js` - REST API endpoints

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:79-81` - Routes documentation
- Directory listing shows `routes/api.js`

## 2.16 `scripts/` Directory

**Purpose:** Utility and helper scripts

**Structure:**
```
scripts/
├── add-feature-knowledge.js
├── add-numpad-nav.js
├── auto-follow-fliz.cjs
├── auto-store-knowledge.js
├── auto-ticket-processor.js
├── check-migrations.js
├── check-password.js
├── create-dev-database.js
├── create-formatting-markup.js
├── deploy-railway.ps1
├── deploy-railway.sh
├── dev-with-mcp.js
├── ensure_warehouse_room_type.sql
├── FIX-MIGRATIONS-GUIDE.md
├── fix-pulse-harvester.js
├── fix-vitalis-drain-migrations.js
├── fix-vitalis-drain-migrations.sql
├── kill-ports.ps1
├── migrate-data.js
├── migrate.js
├── open-game.ps1
├── railway-db-proxy.ps1
├── remove-account.js
├── remove-failed-migrations.js
├── restart-stable.js
├── run-fortitude-migration.js
├── run-harvest-migrations.js
├── run-harvestable-increase-migration.js
├── seed-docs-to-knowledge.js
├── seed-zork-knowledge.js
├── setup-network-access.ps1
├── start-dbeaver-with-proxy.ps1
├── sync-dev-to-prod.js
├── test-email-auth.js
├── test-email-diagnostic.js
├── test-email-simple.js
├── test-email-username.js
├── test-email.js
├── test-markdown-in-game.js
├── test-markdown-parsing.js
├── test-rag-knowledge.js
├── test-rag-system.js
├── test-sync-safety.js
├── test-zork-api.js
├── test.txt
├── zork-ai-agent.cjs
└── zork-system-prompt.md
```

**Contents:**
- 50+ script files
- Mix of JavaScript (.js), CommonJS (.cjs), PowerShell (.ps1), Shell (.sh), SQL (.sql), and Markdown (.md) files
- Categories:
  - Knowledge/RAG scripts
  - Database migration scripts
  - Testing scripts
  - Deployment scripts
  - Development tools
  - ZORK AI agent

**Evidence:**
- Directory listing shows all script files
- `package.json:9-28` - Scripts section references some of these

## 2.17 `services/` Directory

**Purpose:** Background services

**Structure:**
```
services/
├── factoryAutomation.js
├── factoryCraftingEngine.js
├── factoryOutputRouter.js
├── factoryQuirks.js
├── factoryRecipeMatcher.js
├── factoryRuneSystem.js
├── npcCycleEngine.js
└── ticketService.js
```

**Contents:**
- 8 service files
- Factory-related services (6 files)
- NPC cycle engine
- Ticket service

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:83-84` - Services documentation
- Directory listing shows 8 service files

## 2.18 `utils/` Directory

**Purpose:** Utility modules

**Structure:**
```
utils/
├── broadcast.js
├── email.js
├── harvestFormulas.js
├── markupService.js
├── messageCache.js
├── messageRouter.js
├── pathfinding.js
├── vitalisHelpers.js
├── zorkFlag.js
└── zorkKnowledge.js
```

**Contents:**
- 10 utility files
- Game utilities (broadcast, pathfinding, harvest formulas)
- Communication utilities (email, message routing, message cache)
- Markup utilities
- ZORK utilities (flag, knowledge)

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:86-92` - Utils documentation
- Directory listing shows 10 utility files

---

# 3. File Naming Patterns

## 3.1 JavaScript Files

**Patterns:**
- `*.js` - ES6 modules (frontend) or CommonJS (backend)
- `*.cjs` - CommonJS modules (explicit)
- PascalCase for classes: `Game.js`, `Component.js`
- camelCase for utilities: `markupService.js`, `vitalisHelpers.js`
- kebab-case for editors: `map-editor.js`, `npc-editor.js`

**Evidence:**
- `public/js/core/Game.js` - PascalCase class
- `utils/markupService.js` - camelCase utility
- `protected/editors/map-editor.js` - kebab-case editor

## 3.2 HTML Files

**Patterns:**
- `index.html` - Landing page
- `game.html` - Main game page
- `*-editor.html` - Editor pages (kebab-case)
- `reset-password.html` - Feature-specific pages

**Evidence:**
- `public/index.html` - Landing page
- `public/game.html` - Game page
- `protected/editors/*-editor.html` - Editor pages

## 3.3 CSS Files

**Patterns:**
- `style.css` - Global styles
- `*-editor.css` - Editor-specific styles (kebab-case)

**Evidence:**
- `public/style.css` - Global styles
- `protected/editors/*-editor.css` - Editor styles

## 3.4 SQL Files

**Patterns:**
- `###_*.sql` - Sequential migration files (001, 002, etc.)
- Descriptive names: `001_schema.sql`, `062_extend_debug_todos_tickets.sql`

**Evidence:**
- `migrations/001_schema.sql` - Base schema
- `migrations/062_extend_debug_todos_tickets.sql` - Feature migration

## 3.5 Documentation Files

**Patterns:**
- `*.md` - Markdown documentation
- Numbered prefixes for canonical docs: `10-01-*.md`, `20-01-*.md`
- `999-*.md` - Reference specifications
- `100-*.md` - Archived/deprecated docs

**Evidence:**
- `docs/Chuck docs/10-01-player-architecture.md` - Canonical spec
- `docs/Chuck docs/999-*.md` - Reference specs
- `docs/Chuck docs/100-*.md` - Archived docs

---

# 4. File Duplications and Legacy Patterns

## 4.1 Legacy Files

### `public/client.js`
**Status:** Legacy, not loaded
**Purpose:** Old monolithic client (kept for reference)
**Evidence:**
- `docs/requirements.md:465` - "Legacy monolithic client (kept temporarily for reference, not loaded)"
- `public/game.html` - Does not reference `client.js` (uses `js/main.js` instead)
- `public/js/main.js:1708-1791` - Contains comments referencing "old client.js approach" for compatibility

### `public/markup-helper.js`
**Status:** Legacy, kept for editor compatibility
**Purpose:** Markup helper for editors
**Evidence:**
- `docs/requirements.md:466` - "Markup helper for editors (kept for editor compatibility)"
- `public/js/utils/Markup.js:655-658` - Makes functions available globally for `markup-helper.js`
- `public/markup-helper.js:1664-1668` - Exports functions globally

### Legacy Editor Files
**Status:** Archived
**Location:** `archive/legacy_editors_20241210/`
**Purpose:** Old editor versions before migration
**Evidence:**
- `archive/legacy_editors_20241210/` - 10 legacy editor files
- `reports/legacy_editors.md:1-196` - Documents legacy editor migration

## 4.2 Duplicate Patterns

### Editor Files
**Pattern:** Editors exist in both `public/` (old) and `protected/editors/` (new)
**Status:** `public/` editors are legacy, `protected/editors/` are canonical
**Evidence:**
- `reports/legacy_editors.md:9-16` - Lists legacy editors in `public/`
- `protected/editors/` - Contains new editor architecture
- `archive/legacy_editors_20241210/` - Contains archived legacy versions

### Documentation Duplication
**Pattern:** Some documentation exists in both `docs/` root and `docs/archive/`
**Status:** `docs/archive/` contains superseded versions
**Evidence:**
- `docs/archive/` - 20 archived markdown files
- `docs/` root - Active documentation files

## 4.3 Outdated Artifacts

### `game.db` and `game.db-journal`
**Status:** Legacy SQLite database files
**Purpose:** Old database format (project now uses PostgreSQL)
**Evidence:**
- Root directory contains `game.db` and `game.db-journal`
- Project uses PostgreSQL (see `database.js`, `migrations/`)

### `tall` File
**Status:** Accidental file
**Purpose:** Appears to be "less" command help text
**Evidence:**
- File contains "SUMMARY OF LESS COMMANDS" text
- No references in codebase
- Likely accidental creation

### `ascii images/` Directory
**Status:** Mixed content, unclear purpose
**Issues:**
- Space in directory name (non-standard)
- Mix of file types (markdown, executable, images, HTML)
- Contains `.exe` file (`Antigravity.exe`)
- Contains documentation file (`10_2_room_architecture.md`) that should be in `docs/`

**Evidence:**
- Directory listing shows mixed content
- `ascii images/10_2_room_architecture.md` - Should be in `docs/Chuck docs/`

---

# 5. Directory Organization Patterns

## 5.1 Frontend Organization

**Pattern:** ES6 module-based component architecture
**Location:** `public/js/`
**Structure:**
- `core/` - Core infrastructure (Game, Component, MessageBus)
- `widgets/` - UI widgets and components (Terminal, StatsWidget, etc.)
- `models/` - Data models
- `utils/` - Utilities
- `services/` - Services
- `widgets/` - Widget system
- `editorComponents/` - Editor-specific components
- `editorShared/` - Shared editor code

**Evidence:**
- `docs/requirements.md:427-462` - Frontend architecture documentation
- `public/js/main.js:1-43` - Entry point imports

## 5.2 Backend Organization

**Pattern:** Separation of concerns
**Structure:**
- `handlers/` - WebSocket message handlers
- `services/` - Background services
- `utils/` - Utility modules
- `middleware/` - Express middleware
- `routes/` - HTTP routes
- `models/` - Data models

**Evidence:**
- `docs/GAME-ARCHITECTURE-SUMMARY.md:40-95` - Backend structure

## 5.3 Documentation Organization

**Pattern:** Numbered, flat structure (Dewey-Decimal style)
**Location:** `docs/Chuck docs/`
**Structure:**
- `00-README.md` - Master index
- `10-*.md` - Game operations
- `20-*.md` - Architecture
- `30-*.md` - AI & automation (planned)
- `999-*.md` - Reference specifications
- `100-*.md` - Archived/deprecated

**Evidence:**
- `docs/Chuck docs/00-README.md:1-246` - Documentation index
- `docs/Chuck docs/999.0 - filesystem readme.md:1-242` - Filesystem organization rules

---

# 6. File Purpose Mappings

## 6.1 Core Application Files

| File | Purpose | Evidence |
|------|---------|----------|
| `server.js` | Main Express/WebSocket server | Root entry point |
| `database.js` | PostgreSQL connection and functions | Database module |
| `npcLogic.js` | NPC cycle engine logic | NPC behavior |
| `package.json` | Dependencies and scripts | `package.json:1-52` |

## 6.2 Frontend Entry Points

| File | Purpose | Evidence |
|------|---------|----------|
| `public/index.html` | Landing/character selection | `docs/GAME-ARCHITECTURE-SUMMARY.md:51` |
| `public/game.html` | Main game UI | `docs/GAME-ARCHITECTURE-SUMMARY.md:52` |
| `public/js/main.js` | Frontend entry point | `public/js/main.js:1-43` |
| `public/client.js` | Legacy client (not used) | `docs/requirements.md:465` |

## 6.3 Handler Files

| File | Purpose | Evidence |
|------|---------|----------|
| `handlers/index.js` | Message dispatcher | `docs/GAME-ARCHITECTURE-SUMMARY.md:72` |
| `handlers/game.js` | Core gameplay commands | `docs/GAME-ARCHITECTURE-SUMMARY.md:73` |
| `handlers/*Editor.js` | Editor handlers | Editor functionality |

## 6.4 Service Files

| File | Purpose | Evidence |
|------|---------|----------|
| `services/npcCycleEngine.js` | NPC tick loop | `docs/GAME-ARCHITECTURE-SUMMARY.md:84` |
| `services/ticketService.js` | Ticket operations | `services/ticketService.js:1-362` |
| `services/factory*.js` | Factory system services | Factory functionality |

---

# 7. File Relationships

## 7.1 Frontend Dependencies

**Entry Point:** `public/js/main.js`
**Imports:**
- `core/Game.js` - Game controller
- `widgets/*.js` - UI widgets and components
- `utils/*.js` - Utilities

**Evidence:**
- `public/js/main.js:7-17` - Import statements

## 7.2 Backend Dependencies

**Entry Point:** `server.js`
**Imports:**
- `database.js` - Database functions
- `handlers/index.js` - Message handlers
- `middleware/*.js` - Middleware
- `routes/api.js` - HTTP routes
- `services/*.js` - Services
- `utils/*.js` - Utilities

**Evidence:**
- `server.js` - Main server file imports these modules

## 7.3 Editor Architecture

**Pattern:** Editors use shared components
**Structure:**
- `protected/editors/*-editor.html` - Editor HTML
- `protected/editors/*-editor.js` - Editor JavaScript
- `protected/editors/*-editor.css` - Editor styles
- `public/js/editorComponents/` - Shared editor components
- `public/js/editorShared/` - Shared editor code

**Evidence:**
- `protected/editors/` - Editor files
- `public/js/editorComponents/` - Shared components
- `reports/legacy_editors.md:154-175` - Canonical editor pattern

---

# 8. File Access Patterns

## 8.1 Public Access

**Location:** `public/` directory
**Access:** Served as static files by Express
**Files:** HTML, CSS, JS, images
**Evidence:**
- `server.js` - Express static file serving configuration

## 8.2 Protected Access

**Location:** `protected/` directory
**Access:** Requires authentication/god-mode
**Files:** Editor HTML, CSS, JS
**Evidence:**
- `protected/editors/` - Editor files require god-mode
- `handlers/game.js` - Editor handlers check god-mode

## 8.3 Server-Side Only

**Locations:** `handlers/`, `services/`, `utils/`, `middleware/`, `routes/`, `models/`
**Access:** Server-side only, not served to clients
**Evidence:**
- These directories contain Node.js modules only

---

# 9. File Size and Complexity

## 9.1 Large Files

**Large Handler Files:**
- `handlers/game.js` - Core gameplay handler (likely 6000+ lines)
- `handlers/mapEditor.js` - Map editor handler (likely 1000+ lines)

**Large Frontend Files:**
- `public/client.js` - Legacy client (7000+ lines, not used)
- `public/markup-helper.js` - Markup helper (1600+ lines, legacy)

**Evidence:**
- `public/client.js:7254-7569` - Shows large file
- `reports/legacy_editors.md:22-25` - Map editor ~2250 lines

## 9.2 Modular Files

**Pattern:** ES6 modules in `public/js/`
**Size:** Typically 100-500 lines per module
**Evidence:**
- `public/js/widgets/` - Widget files are modular
- `public/js/core/` - Core files are modular

---

# 10. File Naming Inconsistencies

## 10.1 Directory Name Issues

**Issue:** Space in directory name
**Location:** `ascii images/`
**Problem:** Non-standard, can cause issues in some tools
**Evidence:**
- Directory listing shows `ascii images/` with space

## 10.2 File Extension Inconsistencies

**Pattern:** Mix of `.js` and `.cjs` for CommonJS
**Examples:**
- `scripts/zork-ai-agent.cjs` - Uses `.cjs`
- Most other scripts use `.js`

**Evidence:**
- `scripts/zork-ai-agent.cjs` - Explicit CommonJS extension
- Other scripts use `.js` for CommonJS

---

# 11. Missing or Incomplete Patterns

## 11.1 Empty Directories

**Location:** `public/components/` (if exists, separate from `public/js/widgets/`)
**Status:** Empty directory (if exists)
**Purpose:** Unclear (possibly planned but unused)
**Evidence:**
- Directory listing shows `public/components/` is empty (if it exists)
- Actual components/widgets are in `public/js/widgets/`

## 11.2 Incomplete Migrations

**Pattern:** Some migration scripts in `scripts/` directory
**Examples:**
- `scripts/ensure_warehouse_room_type.sql` - SQL file in scripts directory
- `scripts/fix-vitalis-drain-migrations.sql` - SQL file in scripts directory

**Issue:** SQL files should be in `migrations/` directory
**Evidence:**
- `scripts/` contains SQL files
- `migrations/` is the canonical location for SQL files

---

# 12. Summary

## 12.1 Structure Strengths

1. **Clear Separation:** Frontend (`public/`), backend (`handlers/`, `services/`), documentation (`docs/`)
2. **Modular Architecture:** ES6 modules in `public/js/`, separate concerns in backend
3. **Organized Documentation:** Numbered, flat structure in `docs/Chuck docs/`
4. **Migration System:** Sequential migrations in `migrations/`

## 12.2 Structure Weaknesses

1. **Legacy Files:** `client.js`, `markup-helper.js` kept but not used
2. **Directory Naming:** Space in `ascii images/` directory name
3. **Mixed Content:** `ascii images/` contains various file types
4. **Empty Directories:** `public/components/` is empty (if exists, separate from `public/js/widgets/` where actual widgets are located)
5. **SQL Files in Scripts:** Some SQL files in `scripts/` instead of `migrations/`
6. **Accidental Files:** `tall` file appears to be accidental

## 12.3 File Count Summary

**Approximate File Counts:**
- Root files: ~10
- `archive/`: 10 files
- `docs/`: 60+ files
- `handlers/`: 7 files
- `migrations/`: 73 files
- `public/js/`: 35 files
- `protected/editors/`: 18 files
- `scripts/`: 50+ files
- `services/`: 8 files
- `utils/`: 10 files

**Total:** ~300+ files (excluding node_modules)

---

**End of Project File Structure Canonical Specification**




