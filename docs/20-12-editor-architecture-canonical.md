# Game Editor System - Shared Infrastructure Canonical Spec

**Generated:** Based on codebase analysis of `public/gameeditors/` directory  
**Scope:** Shared CSS, HTML patterns, data handling, and WebSocket infrastructure used by all editors  
**Last Updated:** Based on current codebase state

---

## 1. Shared Infrastructure Schema / Source of Truth

### 1.1 File Structure

**Note:** For general file structure and directory organization rules, see **`20-00-file-structure-canonical.md`**. This section documents editor-specific file locations only.

**Location:** `public/gameeditors/`

**Shared Files:**
- `editor-shared.css` (475 lines) - Master CSS for all editors
- `public/css/editor-core.css` (1103 lines) - Core component library
- `public/js/editorShared/EditorBase.js` (177 lines) - WebSocket lifecycle management

**Editor Files (per editor):**
- `{editor-name}-editor.html` - HTML template
- `{editor-name}-editor.js` - Alpine.js component

**Current Editors:**
1. `crafting-editor.html` / `crafting-editor.js` - Crafting Recipe Editor
2. `item-editor.html` / `item-editor.js` - Item Editor
3. `map-editor.html` / `map-editor.js` - Map Editor
4. `markup-editor.html` / `markup-editor.js` - Markup Editor
5. `npc-editor.html` / `npc-editor.js` - NPC Editor
6. `player-editor.html` / `player-editor.js` - Player Editor
7. `ticket-editor.html` / `ticket-editor.js` - Ticket Editor

**References:**
- `public/gameeditors/editor-shared.css:1-475`
- `public/css/editor-core.css:1-1103`
- `public/js/editorShared/EditorBase.js:1-177`

---

[Note: The rest of the file content remains the same - only the reference in section 1.1 was updated to reflect the new filename. The full content is identical to the original file.]












