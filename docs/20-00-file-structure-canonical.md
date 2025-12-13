# 200 — **Canonical File Structure Specification**
_The authoritative file organization rules for all project files._

This document defines the canonical file structure for The Game project. All files must be organized according to these rules. Cursor must enforce this structure when creating, moving, or organizing files.

---

## 1. **Root Directory Principles**

The root directory (`thegame/`) must contain **only essential files**:

### **Required Root Files:**
- `server.js` - Main server entry point
- `database.js` - Core database module
- `npcLogic.js` - Core NPC logic module (required by server.js)
- `package.json` - Node.js dependencies
- `package-lock.json` - Dependency lock file
- `nixpacks.toml` - Deployment configuration
- `.cursorrules` - Cursor governance rules
- `.gitignore` - Git ignore rules
- `game.db` / `game.db-journal` - SQLite database files (if used)

### **Root Directory Rules:**
- No source code files (except core entry points)
- No documentation files
- No archive or legacy files
- No utility scripts
- No configuration files (except deployment configs)

---

## 2. **Directory Structure & Purpose**

### **2.1 Active Code Directories**

#### **`handlers/`** - Request Handlers
- **Purpose:** Express route handlers for HTTP endpoints
- **Contents:** Handler modules for game, editors, API endpoints
- **Naming:** `[name]Editor.js`, `game.js`, `index.js`
- **Rules:** One handler per file, named after its primary responsibility

#### **`middleware/`** - Express Middleware
- **Purpose:** Authentication, session management, request processing
- **Contents:** `auth.js`, `session.js`
- **Rules:** Reusable middleware functions only

#### **`services/`** - Business Logic Services
- **Purpose:** Core game systems and business logic
- **Contents:** NPC cycle engine, factory systems, automation, crafting
- **Naming:** Descriptive service names (e.g., `npcCycleEngine.js`)
- **Rules:** Stateless services, database-driven logic

#### **`utils/`** - Utility Modules
- **Purpose:** Shared utility functions, helpers, services
- **Contents:** Broadcast, email, markup, pathfinding, message routing
- **Rules:** Pure functions or stateless utilities

#### **`models/`** - Data Models
- **Purpose:** Data model definitions and validators
- **Contents:** Model classes for database entities
- **Rules:** One model per file, named after entity

#### **`routes/`** - API Routes
- **Purpose:** Express route definitions
- **Contents:** `api.js` and route modules
- **Rules:** Route definitions only, delegate to handlers

#### **`migrations/`** - Database Migrations
- **Purpose:** SQL migration files for database schema changes
- **Contents:** Numbered `.sql` files (e.g., `001_initial.sql`)
- **Rules:** Sequential numbering, one change per migration

#### **`config/`** - Configuration Files
- **Purpose:** Application configuration (non-deployment)
- **Contents:** `factoryConfig.js` and other config modules
- **Rules:** Environment-specific or feature-specific configs only

#### **`scripts/`** - Utility Scripts
- **Purpose:** Development, deployment, and maintenance scripts
- **Contents:** Node.js scripts, PowerShell scripts, shell scripts
- **Rules:** Executable utilities, not imported modules

#### **`devtools/`** - Development Tools
- **Purpose:** Development environment setup and tools
- **Contents:** Batch files, dev server scripts, tooling
- **Rules:** Development-only, not production code

---

### **2.2 Public Assets Directory**

#### **`public/`** - Static Web Assets
- **Purpose:** All files served to the browser
- **Structure:**
  ```
  public/
  ├── ascii-images/          # Active ASCII art assets
  ├── components/            # Reusable UI components
  ├── css/                   # Stylesheets
  ├── gameeditors/           # Editor HTML/JS/CSS files
  ├── js/                    # Client-side JavaScript
  │   ├── core/              # Core game systems
  │   ├── editorComponents/  # Editor UI components
  │   ├── editorShared/      # Shared editor utilities
  │   ├── models/            # Client-side data models
  │   ├── services/          # Client-side services
  │   ├── utils/             # Client-side utilities
  │   └── widgets/           # Game widget components
  ├── formula-editor.js      # Active formula editor
  ├── markup-editor.js       # Active markup editor
  ├── game.html              # Main game interface
  ├── index.html             # Landing page
  ├── reset-password.html    # Password reset page
  ├── favicon.svg            # Site favicon
  └── style.css              # Main stylesheet
  ```

**Rules:**
- All client-accessible files must be in `public/`
- Editor files in `public/gameeditors/` must follow canonical editor pattern
- Active editor files (formula-editor.js, markup-editor.js) stay in `public/` root
- Legacy/archived editor files must be moved to `archive/`

---

### **2.3 Documentation Directory**

#### **`docs/`** - Canonical Documentation
- **Purpose:** Authoritative specifications and canonical documentation
- **Structure:**
  ```
  docs/
  ├── 00-README.md                    # Documentation index
  ├── 01-00-scrub-prompt-template.md  # Scrub templates
  ├── 01-01-scrub-add-cannon-template.md
  ├── 10-*.md                         # Gameplay canon (10-XX)
  ├── 20-*.md                         # Architecture canon (20-XX)
  ├── 30-*.md                         # System canon (30-XX)
  ├── 50-*.md                         # Environment/Config canon (50-XX)
  └── Chuck docs/                     # Reference docs (non-canonical)
      └── 999-*.md                    # All reference docs start with 999-
  ```

**Documentation Numbering:**
- **00-XX:** Index and templates
- **01-XX:** Scrub and analysis templates
- **10-XX:** Gameplay mechanics and rules
- **20-XX:** System architecture and technical specs
- **30-XX:** System integrations and external systems
- **50-XX:** Environment, configuration, and deployment
- **999-XX:** Reference documents (non-canonical, in `Chuck docs/`)

**Rules:**
- Only canonical specifications in `docs/` root
- Reference documents (analysis, proposals, findings) in `docs/Chuck docs/`
- All reference docs must start with `999-`
- Never mix canonical and reference documentation

---

### **2.4 Archive Directory**

#### **`archive/`** - Central Archive (All Historical/Legacy Content)
- **Purpose:** Single location for all archived, legacy, and historical content
- **Structure:**
  ```
  archive/
  ├── legacy-code/              # Deprecated code files
  │   ├── legacy_editors_20241210/  # Legacy editor files
  │   └── markup-helper.js          # Orphaned code files
  ├── legacy-assets/            # Deprecated assets
  ├── reports/                  # Historical analysis reports
  │   ├── editor_canonical_pattern.md
  │   ├── editor_upgrade_validation.md
  │   └── legacy_editors.md
  └── reference-docs/           # Non-canonical reference materials
      ├── ascii-images/         # Archived ASCII art
      └── create-favicon.html   # One-time utilities
  ```

**Archive Rules:**
- **Single archive location** - All historical content goes here
- **Never reference archived files** in active code
- **Use `git mv`** to preserve history when moving to archive
- **Organize by type:** code, assets, reports, reference-docs
- **Date-stamp legacy code** directories when archiving

**What Belongs in Archive:**
- Deprecated code files
- Legacy editor implementations
- Historical analysis reports
- One-time utility scripts
- Reference materials (non-canonical)
- Archived assets no longer in use

**What Does NOT Belong in Archive:**
- Active code (even if old)
- Currently referenced files
- Configuration files in use
- Active documentation

---

### **2.5 Assets Directory**

#### **`assets/`** - Active Game Assets
- **Purpose:** Active game assets (images, sprites, etc.)
- **Contents:** PNG files and other game assets
- **Rules:** Only active, in-use assets

---

### **2.6 MCP Test Server Directory**

#### **`mcp-test-server/`** - MCP Testing Infrastructure
- **Purpose:** MCP server for testing and automation
- **Structure:** Keep entire structure as-is
- **Rules:** Self-contained testing infrastructure

---

## 3. **File Naming Conventions**

### **3.1 Code Files**
- **JavaScript:** `camelCase.js` (e.g., `npcCycleEngine.js`)
- **Handlers:** `[name]Editor.js` or `[name].js` (e.g., `game.js`, `itemEditor.js`)
- **Services:** Descriptive names (e.g., `factoryCraftingEngine.js`)
- **Models:** Entity name (e.g., `ticket.js`)

### **3.2 Documentation**
- **Canonical Docs:** `XX-XX-[name]-canonical.md` or `XX-XX-[name].md`
- **Reference Docs:** `999-[name].md` (in `docs/Chuck docs/`)
- **Templates:** `XX-XX-[name]-template.md`

### **3.3 Archive Files**
- **Legacy Code:** `[name].legacy.[ext]` or date-stamped directories
- **Reports:** Descriptive names (e.g., `legacy_editors.md`)

---

## 4. **File Organization Decision Tree**

### **Where does a new file belong?**

1. **Is it served to the browser?**
   - Yes → `public/` (or subdirectory)
   - No → Continue

2. **Is it a database migration?**
   - Yes → `migrations/`
   - No → Continue

3. **Is it a route handler?**
   - Yes → `handlers/`
   - No → Continue

4. **Is it middleware?**
   - Yes → `middleware/`
   - No → Continue

5. **Is it business logic?**
   - Yes → `services/`
   - No → Continue

6. **Is it a utility function?**
   - Yes → `utils/`
   - No → Continue

7. **Is it a data model?**
   - Yes → `models/`
   - No → Continue

8. **Is it a configuration file?**
   - Yes → `config/`
   - No → Continue

9. **Is it a script (not imported)?**
   - Yes → `scripts/`
   - No → Continue

10. **Is it documentation?**
    - Canonical spec → `docs/` (numbered)
    - Reference/analysis → `docs/Chuck docs/999-*.md`
    - No → Continue

11. **Is it legacy/deprecated?**
    - Yes → `archive/` (appropriate subdirectory)
    - No → Root (only if core entry point)

---

## 5. **Archive Policy**

### **5.1 When to Archive**

Archive a file or directory when:
- It is no longer referenced in active code
- It has been replaced by a newer implementation
- It is a one-time utility that was used once
- It is historical analysis or reporting
- It is a legacy implementation

### **5.2 Archive Process**

1. **Verify file is not referenced:**
   ```bash
   grep -r "filename" --include="*.js" --include="*.html" .
   ```

2. **Move using git mv:**
   ```bash
   git mv path/to/file archive/appropriate-subdirectory/
   ```

3. **Verify no broken references:**
   ```bash
   grep -r "old-path" --include="*.js" --include="*.html" .
   ```

4. **Update documentation** if file was referenced in docs

### **5.3 Archive Organization**

- **`archive/legacy-code/`** - Deprecated code files
- **`archive/legacy-assets/`** - Deprecated assets
- **`archive/reports/`** - Historical analysis reports
- **`archive/reference-docs/`** - Non-canonical reference materials

---

## 6. **Documentation Organization Rules**

### **6.1 Canonical Documentation (`docs/`)**

**Purpose:** Authoritative specifications that define how the system works.

**Rules:**
- Must be numbered according to category (10-XX, 20-XX, etc.)
- Must be factual, based on actual implementation
- Must be maintained as system evolves
- Never contains analysis, proposals, or findings

**Categories:**
- **10-XX:** Gameplay mechanics, player systems, NPCs, items, commands
- **20-XX:** Architecture, frontend, backend, database, widgets, editors
- **30-XX:** External systems, integrations, knowledge systems
- **50-XX:** Environment variables, configuration, deployment, auth

### **6.2 Reference Documentation (`docs/Chuck docs/999-*.md`)**

**Purpose:** Analysis, proposals, findings, and non-authoritative reference materials.

**Rules:**
- Must start with `999-`
- Must be in `docs/Chuck docs/` directory
- Never cited as source of truth
- Can contain proposals, analysis, findings

---

## 7. **Root Directory Cleanup Rules**

### **7.1 Files That Must Stay in Root**

- `server.js` - Main entry point
- `database.js` - Core database module
- `npcLogic.js` - Core NPC logic (required by server.js)
- `package.json` - Node.js dependencies
- `package-lock.json` - Dependency lock
- `nixpacks.toml` - Deployment config
- `.cursorrules` - Cursor rules
- `.gitignore` - Git ignore
- Database files (`game.db`, `game.db-journal`)

### **7.2 Files That Must NOT Be in Root**

- Source code files (except core entry points)
- Documentation files
- Archive or legacy files
- Utility scripts
- Configuration files (except deployment)
- Editor files
- Service files
- Handler files

---

## 8. **Enforcement Rules for Cursor**

When Cursor creates, moves, or organizes files, it must:

1. **Check this document** before placing files
2. **Follow the decision tree** (Section 4)
3. **Use `git mv`** when moving files to preserve history
4. **Verify references** before archiving files
5. **Update documentation** if moving documented files
6. **Never create files in root** unless they are core entry points
7. **Never mix canonical and reference docs**
8. **Always use canonical naming conventions**

---

## 9. **Migration from Old Structure**

If files are found in incorrect locations:

1. **Identify correct location** using decision tree
2. **Verify no broken references** will result
3. **Move using `git mv`** to preserve history
4. **Update any documentation** referencing the file
5. **Verify functionality** still works

---

## 10. **Summary of Key Principles**

1. **Single Archive Location** - All historical content in `archive/`
2. **Clear Separation** - Active code vs. archived code
3. **Canonical Docs** - Only authoritative specs in `docs/` (numbered)
4. **Reference Docs** - Non-canonical analysis in `docs/Chuck docs/999-*.md`
5. **No Root Clutter** - Only essential config and entry points in root
6. **Preserve History** - Always use `git mv` for moves
7. **Verify References** - Check before archiving
8. **Follow Naming** - Use established conventions

---

**END OF CANONICAL SPECIFICATION**

