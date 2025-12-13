# 🗂️ **File Structure Cleanup & Canonical Organization Proposal**

**Status:** 🟡 CANON PROPOSE  
**Type:** Reference Document (999-)  
**Purpose:** Step-by-step instructions for cleaning up project file structure, consolidating archives, and establishing canonical file organization

---

## 📋 **EXECUTIVE SUMMARY**

This document provides:
1. **Current state analysis** - Identifies orphans, ghosts, and structural issues
2. **Proposed canonical file structure** - Target organization for all project files
3. **Step-by-step cleanup instructions** - Detailed cursor commands for safe reorganization
4. **Archive consolidation plan** - Central archive location strategy
5. **Validation checklist** - Post-cleanup verification steps

---

## 🔍 **STEP 1: CURRENT STATE ANALYSIS**

### **1.1 Archive Locations (Scattered)**
Currently identified archive locations:
- `archive/legacy_editors_20241210/` - Legacy editor files (10 files)
- `reports/` - Analysis/report documents (3 files)
- `ascii images/` - Mixed content (markdown, images, executables)
- Potential orphaned files in root and subdirectories

### **1.2 Potential Orphan/Ghost Files**

#### **Root Level Files to Verify:**
- `npcLogic.js` - Verify if still referenced or moved to services/
- `database.js` - Core file, should remain
- `server.js` - Core file, should remain
- `nixpacks.toml` - Deployment config, should remain
- `game.db` / `game.db-journal` - Database files, should remain

#### **Directories Requiring Review:**
- `ascii images/` - Mixed content, needs organization
- `public/ascii-images/` - Duplicate or related content?
- `reports/` - Should these be in archive or docs?
- `archive/` - Needs consolidation strategy

#### **Files Requiring Verification:**
- `public/create-favicon.html` - Utility or orphan?
- `public/formula-editor.js` - Active or legacy?
- `public/markup-editor.js` - Active or legacy?
- `public/markup-helper.js` - Active or legacy?

### **1.3 Missing Canonical Structure**
- No explicit file structure canon document
- No clear archive organization policy
- No separation between active and reference documentation

---

## 🎯 **STEP 2: PROPOSED CANONICAL FILE STRUCTURE**

### **2.1 Target Directory Structure**

```
thegame/
├── archive/                          # CENTRAL ARCHIVE (all historical/legacy)
│   ├── legacy-code/                  # Deprecated code files
│   │   └── legacy_editors_20241210/  # Move from archive/
│   ├── legacy-assets/                # Deprecated assets
│   ├── reports/                      # Historical analysis reports
│   │   ├── editor_canonical_pattern.md
│   │   ├── editor_upgrade_validation.md
│   │   └── legacy_editors.md
│   └── reference-docs/               # Non-canonical reference materials
│       └── ascii-images/             # Move from root "ascii images/"
│
├── assets/                           # Active game assets
│   └── [31 *.png files]              # Keep as-is
│
├── config/                           # Configuration files
│   └── factoryConfig.js              # Keep as-is
│
├── database.js                       # Core database module (keep)
│
├── devtools/                         # Development tools
│   └── start-dev-tools.bat           # Keep as-is
│
├── docs/                             # CANONICAL DOCUMENTATION
│   ├── 00-README.md                  # Documentation index
│   ├── 01-00-scrub-prompt-template.md
│   ├── 01-01-scrub-add-cannon-template.md
│   ├── 10-*.md                       # Gameplay canon (10-XX)
│   ├── 20-*.md                       # Architecture canon (20-XX)
│   ├── 30-*.md                       # System canon (30-XX)
│   ├── 50-*.md                       # Environment/Config canon (50-XX)
│   └── Chuck docs/                   # REFERENCE DOCS (non-canonical)
│       └── 999-*.md                  # All reference docs start with 999-
│
├── handlers/                         # Request handlers
│   └── [9 handler files]             # Keep as-is
│
├── middleware/                       # Express middleware
│   ├── auth.js
│   └── session.js                    # Keep as-is
│
├── migrations/                       # Database migrations
│   └── [86 *.sql files]              # Keep as-is
│
├── models/                          # Data models
│   └── ticket.js                     # Keep as-is
│
├── mcp-test-server/                 # MCP testing infrastructure
│   └── [keep entire structure]       # Keep as-is
│
├── node_modules/                    # Dependencies (gitignored)
│
├── public/                           # Static web assets
│   ├── ascii-images/                 # Active ASCII art
│   │   └── runekeeper.txt            # Keep as-is
│   ├── components/                   # Reusable components
│   ├── css/                          # Stylesheets
│   ├── gameeditors/                  # Editor HTML/JS/CSS
│   ├── js/                           # Client-side JavaScript
│   ├── favicon.svg
│   ├── game.html                     # Main game interface
│   ├── index.html                    # Landing page
│   ├── reset-password.html
│   └── style.css
│
├── routes/                          # API routes
│   └── api.js                        # Keep as-is
│
├── scripts/                         # Utility scripts
│   └── [47 files]                    # Keep as-is
│
├── services/                        # Business logic services
│   └── [9 service files]             # Keep as-is
│
├── utils/                           # Utility modules
│   └── [11 utility files]            # Keep as-is
│
├── .cursorrules                     # Cursor governance rules
├── .gitignore                       # Git ignore rules
├── game.db                          # SQLite database (if used)
├── game.db-journal                  # SQLite journal
├── nixpacks.toml                    # Deployment config
├── package.json                      # Node.js dependencies
├── package-lock.json                 # Lock file
└── server.js                         # Main server entry point
```

### **2.2 Key Principles**

1. **Single Archive Location** - All historical/legacy content in `archive/`
2. **Clear Separation** - Active code vs. archived code
3. **Canonical Docs** - Only authoritative specs in `docs/` (numbered)
4. **Reference Docs** - Non-canonical analysis in `docs/Chuck docs/999-*.md`
5. **No Root Clutter** - Only essential config and entry points in root

---

## 🧹 **STEP 3: STEP-BY-STEP CLEANUP INSTRUCTIONS**

### **Phase 1: Create Archive Structure** ✅ **COMPLETE**

**Status:** Completed 2024-12-12  
**Action Taken:** Created centralized archive subdirectories using PowerShell `New-Item`

```bash
# Create centralized archive directories
mkdir -p archive/legacy-code
mkdir -p archive/legacy-assets
mkdir -p archive/reports
mkdir -p archive/reference-docs
```

**Result:**
- ✅ `archive/legacy-code/` - Created
- ✅ `archive/legacy-assets/` - Created
- ✅ `archive/reports/` - Created
- ✅ `archive/reference-docs/` - Created

### **Phase 2: Move Legacy Code** ✅ **COMPLETE**

**Status:** Completed 2024-12-12  
**Action Taken:** Moved legacy editors directory using `git mv` to preserve history

```bash
# Move legacy editors to centralized archive
mv archive/legacy_editors_20241210 archive/legacy-code/legacy_editors_20241210
```

**Result:**
- ✅ `archive/legacy_editors_20241210/` → `archive/legacy-code/legacy_editors_20241210/`
- ✅ All 10 legacy editor files moved (5 HTML, 5 JS)
- ✅ Git history preserved via `git mv`

### **Phase 3: Move Reports** ✅ **COMPLETE**

**Status:** Completed 2024-12-12  
**Action Taken:** Moved all historical report files to archive using `git mv`, then removed empty reports directory

```bash
# Move historical reports to archive
mv reports/editor_canonical_pattern.md archive/reports/
mv reports/editor_upgrade_validation.md archive/reports/
mv reports/legacy_editors.md archive/reports/

# Remove empty reports directory (if empty after moves)
rmdir reports
```

**Result:**
- ✅ `reports/editor_canonical_pattern.md` → `archive/reports/editor_canonical_pattern.md`
- ✅ `reports/editor_upgrade_validation.md` → `archive/reports/editor_upgrade_validation.md`
- ✅ `reports/legacy_editors.md` → `archive/reports/legacy_editors.md`
- ✅ Empty `reports/` directory removed
- ✅ Git history preserved via `git mv`

### **Phase 4: Consolidate ASCII Images** ✅ **COMPLETE**

**Status:** Completed 2024-12-12  
**Action Taken:** Moved root "ascii images" directory to archive using `git mv`, verified active content remains in public/

```bash
# Move root "ascii images" to archive (mixed content, not canonical)
mv "ascii images" archive/reference-docs/ascii-images

# Verify public/ascii-images/ remains (active content)
# Keep public/ascii-images/runekeeper.txt as active asset
```

**Result:**
- ✅ `ascii images/` → `archive/reference-docs/ascii-images/`
- ✅ All 7 files moved (1 .md, 1 .exe, 1 .txt, 1 .html, 3 image files)
- ✅ `public/ascii-images/runekeeper.txt` verified as active content (kept in place)
- ✅ Git history preserved via `git mv`

### **Phase 5: Verify and Clean Root Directory** ✅ **COMPLETE**

**Status:** Completed 2024-12-12  
**Action Taken:** Verified all root directory files, moved orphaned files to archive

**Files Verified:**

1. **`npcLogic.js`** - ✅ **ACTIVE, KEPT IN ROOT**
   - Required in `server.js` (line 25)
   - Used by `services/npcCycleEngine.js`
   - Referenced in canonical documentation
   - **Decision:** Keep in root (core module)

2. **`public/create-favicon.html`** - ✅ **MOVED TO ARCHIVE**
   - One-time utility for generating favicon
   - No active references found
   - **Decision:** Moved to `archive/reference-docs/create-favicon.html`

3. **Editor files in public/**:
   - **`formula-editor.js`** - ✅ **ACTIVE, KEPT**
     - Imported in `public/gameeditors/formula-editor.html`
     - Alpine.js component for formula management
   - **`markup-editor.js`** - ✅ **ACTIVE, KEPT**
     - Imported in `public/gameeditors/markup-editor.html`
     - Alpine.js component for markup conventions
   - **`markup-helper.js`** - ✅ **MOVED TO ARCHIVE**
     - Functionality extracted to `public/js/utils/Markup.js`
     - Only referenced in archived legacy files
     - **Decision:** Moved to `archive/legacy-code/markup-helper.js`

**Result:**
- ✅ `npcLogic.js` verified as active, kept in root
- ✅ `public/create-favicon.html` moved to `archive/reference-docs/`
- ✅ `public/markup-helper.js` moved to `archive/legacy-code/`
- ✅ `formula-editor.js` and `markup-editor.js` verified as active, kept in `public/`
- ✅ Git history preserved via `git mv`

### **Phase 6: Create Chuck docs Directory**

```bash
# Create reference docs directory if it doesn't exist
mkdir -p "docs/Chuck docs"
```

### **Phase 7: Verify No Broken References** ✅ **COMPLETE**

**Status:** Completed 2024-12-12  
**Action Taken:** Verified no broken references in active code after all moves

After all moves, verified:
```bash
# Check for broken imports/requires
grep -r "archive/legacy_editors" --include="*.js" --include="*.html" .
grep -r "reports/" --include="*.js" --include="*.md" .
grep -r "ascii images" --include="*.js" --include="*.html" .
```

**Result:**
- ✅ No broken references to `archive/legacy_editors` in active code
- ✅ No broken references to `reports/` in active code
- ✅ No broken references to `ascii images` in active code
- ✅ Only references found in:
  - Proposal document (expected)
  - Archived legacy files (expected, historical references)
  - Comments in `Markup.js` (harmless documentation)
- ✅ All active code paths verified clean

---

## 📝 **STEP 4: CURSOR EXECUTION INSTRUCTIONS**

### **4.1 Pre-Cleanup Verification**

Cursor must:
1. **Search for all references** to files/directories before moving them
2. **Document findings** in a temporary analysis file
3. **Present findings** to user for approval before any moves

### **4.2 Execution Pattern**

For each file/directory move:

```markdown
1. **Identify target**: [file/directory path]
2. **Search references**: 
   - grep for imports/requires
   - grep for path references
   - Check package.json scripts
   - Check server.js routes
3. **Document findings**: List all references found
4. **Propose action**: Move/Keep/Delete with justification
5. **Wait for approval**: User must approve before execution
6. **Execute move**: Use git mv to preserve history
7. **Verify**: Check for broken references post-move
```

### **4.3 Specific File Checks**

#### **Check `npcLogic.js`:**
```javascript
// Search patterns:
- require('./npcLogic')
- require('npcLogic')
- import.*npcLogic
- npcLogic\.
```

#### **Check Editor Files:**
```javascript
// In public/ directory, verify:
- formula-editor.js - Check if referenced in HTML
- markup-editor.js - Check if referenced in HTML  
- markup-helper.js - Check if imported by other files
```

#### **Check Archive References:**
```javascript
// Verify no code references old archive paths:
- archive/legacy_editors_20241210
- reports/editor_*
- "ascii images"
```

---

## ✅ **STEP 5: VALIDATION CHECKLIST**

After cleanup, verify:

### **5.1 Structure Validation**
- [ ] All legacy code in `archive/legacy-code/`
- [ ] All reports in `archive/reports/`
- [ ] All reference docs in `docs/Chuck docs/999-*.md`
- [ ] Root directory contains only essential files
- [ ] No duplicate directories (e.g., ascii-images in two places)

### **5.2 Reference Validation**
- [ ] No broken `require()` statements
- [ ] No broken `import` statements
- [ ] No broken HTML `<script src="">` references
- [ ] No broken file paths in documentation
- [ ] All package.json scripts still work

### **5.3 Git History Validation**
- [ ] All moves used `git mv` to preserve history
- [ ] No files accidentally deleted
- [ ] Commit message documents the reorganization

### **5.4 Functionality Validation**
- [ ] Server starts without errors
- [ ] All editors load correctly
- [ ] All routes respond correctly
- [ ] No console errors in browser

---

## 📚 **STEP 6: PROPOSED CANONICAL FILE STRUCTURE DOCUMENT**

After cleanup, create canonical document:

**File:** `docs/20-13-file-structure-canonical.md`

**Content should include:**
1. Directory purpose and contents
2. File naming conventions
3. Archive policy
4. Documentation organization rules
5. What belongs where (decision tree)

---

## 🚨 **STEP 7: RISKS & MITIGATION**

### **Risks:**
1. **Broken imports** - Files moved but references not updated
2. **Lost git history** - Using `mv` instead of `git mv`
3. **Active files archived** - Mistaking active code for legacy
4. **Missing dependencies** - Files moved that other systems need

### **Mitigation:**
1. **Pre-move verification** - Always search references first
2. **Use git mv** - Preserve history for all moves
3. **Incremental moves** - Move one directory at a time, test, then continue
4. **Documentation** - Update all docs that reference moved files
5. **Backup branch** - Create backup branch before starting

---

## 🎯 **STEP 8: EXECUTION ORDER**

Recommended sequence:

1. ✅ Create `docs/Chuck docs/` directory (Completed - directory exists)
2. ✅ Create archive subdirectories (Completed 2024-12-12)
3. ✅ Move `archive/legacy_editors_20241210/` → `archive/legacy-code/` (Completed 2024-12-12)
4. ✅ Move `reports/` → `archive/reports/` (Completed 2024-12-12)
5. ✅ Move `ascii images/` → `archive/reference-docs/ascii-images` (Completed 2024-12-12)
6. ✅ Verify `npcLogic.js` status and handle accordingly (Completed 2024-12-12)
7. ✅ Verify editor files in `public/` and handle accordingly (Completed 2024-12-12)
8. ✅ Verify `public/create-favicon.html` and handle accordingly (Completed 2024-12-12)
9. ✅ Verify no broken references (Completed 2024-12-12)
10. ✅ Create canonical file structure document (Completed 2024-12-12 - docs/20-00-file-structure-canonical.md)

---

## 📋 **STEP 9: POST-CLEANUP DOCUMENTATION**

After cleanup complete:

1. **Update `.gitignore`** if needed (archive patterns)
2. **Update `docs/00-README.md`** with new structure
3. **Create `docs/20-13-file-structure-canonical.md`** (canonical spec)
4. **Update this document** (999-file-structure-cleanup-proposal.md) with completion status

---

## 🔍 **STEP 10: ORPHAN DETECTION COMMANDS**

Use these commands to identify potential orphans:

```bash
# Find files not referenced in code
find . -name "*.js" -not -path "./node_modules/*" -not -path "./archive/*" | while read file; do
  filename=$(basename "$file")
  if ! grep -r "$filename" --include="*.js" --include="*.html" . | grep -v "$file" | grep -q .; then
    echo "Potential orphan: $file"
  fi
done

# Find HTML files not referenced
find ./public -name "*.html" | while read file; do
  filename=$(basename "$file")
  if ! grep -r "$filename" --include="*.js" --include="*.html" . | grep -v "$file" | grep -q .; then
    echo "Potential orphan: $file"
  fi
done
```

---

## ✔️ **APPROVAL CHECKPOINT**

**Before Cursor executes any moves:**

1. User reviews this proposal
2. User approves specific phases
3. Cursor executes approved phases incrementally
4. Cursor reports findings after each phase
5. User validates before proceeding to next phase

---

## 📌 **NOTES**

- All file moves should use `git mv` to preserve history
- Test server startup after each major move
- Keep a log of all moves in a temporary file
- Update this document with actual findings during execution

---

**END OF PROPOSAL**

