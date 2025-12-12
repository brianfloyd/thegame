# Editor Migration Requirements: protected/editors → public/gameeditors

## Overview
Migrate all editor files from `protected/editors/` to `public/gameeditors/` and update all references throughout the codebase and canonical documentation.

---

## Migration Tasks

### 1. File Migration

#### 1.1 Move Editor Files
Move all files from `protected/editors/` to `public/gameeditors/`:

**HTML Files:**
- `markup-editor.html` → `public/gameeditors/markup-editor.html`
- `map-editor.html` → `public/gameeditors/map-editor.html`
- `npc-editor.html` → `public/gameeditors/npc-editor.html`
- `item-editor.html` → `public/gameeditors/item-editor.html`
- `crafting-editor.html` → `public/gameeditors/crafting-editor.html`
- `player-editor.html` → `public/gameeditors/player-editor.html`
- `ticket-editor.html` → `public/gameeditors/ticket-editor.html`

**JavaScript Files:**
- `markup-editor.js` → `public/gameeditors/markup-editor.js` (currently in `public/`)
- `map-editor.js` → `public/gameeditors/map-editor.js`
- `npc-editor.js` → `public/gameeditors/npc-editor.js`
- `item-editor.js` → `public/gameeditors/item-editor.js`
- `crafting-editor.js` → `public/gameeditors/crafting-editor.js`
- `player-editor.js` → `public/gameeditors/player-editor.js`
- `ticket-editor.js` → `public/gameeditors/ticket-editor.js`

**CSS Files:**
- `editor-shared.css` → `public/gameeditors/editor-shared.css`

**Archive Folder:**
- Move `protected/editors/archive/` → `public/gameeditors/archive/` (if needed for reference, otherwise can be deleted)

#### 1.2 Create Directory Structure
Ensure `public/gameeditors/` directory exists before migration.

---

### 2. Update File References

#### 2.1 Update HTML Files
In all editor HTML files, update CSS link references:

**Find:**
```html
<link rel="stylesheet" href="/protected/editors/editor-shared.css">
```

**Replace with:**
```html
<link rel="stylesheet" href="/gameeditors/editor-shared.css">
```

**Files to update:**
- `public/gameeditors/markup-editor.html`
- `public/gameeditors/map-editor.html`
- `public/gameeditors/npc-editor.html`
- `public/gameeditors/item-editor.html`
- `public/gameeditors/crafting-editor.html`
- `public/gameeditors/player-editor.html`
- `public/gameeditors/ticket-editor.html`

#### 2.2 Update JavaScript Import References
In `markup-editor.html`, update the module import:

**Find:**
```javascript
await import('/markup-editor.js');
```

**Replace with:**
```javascript
await import('/gameeditors/markup-editor.js');
```

---

### 3. Update Route Handlers

#### 3.1 Update routes/api.js

**File:** `routes/api.js`

**Update all editor route handlers (lines ~520-542):**

**Find:**
```javascript
app.get('/map', validateSession, checkGodMode, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'protected', 'editors', 'map-editor.html'));
});
```

**Replace with:**
```javascript
app.get('/map', validateSession, checkGodMode, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'gameeditors', 'map-editor.html'));
});
```

**Apply same pattern for:**
- `/npc` → `npc-editor.html`
- `/items` → `item-editor.html`
- `/crafting` → `crafting-editor.html`
- `/player` → `player-editor.html`
- `/tickets` → `ticket-editor.html`
- `/markup` → `markup-editor.html` (line ~796)

**Update dynamic file serving route (lines ~545-557):**

**Find:**
```javascript
app.get('/:file(map|npc|item|player|ticket|crafting)-editor.:ext(js|css)', validateSession, checkGodMode, (req, res) => {
  const file = `${req.params.file}-editor.${req.params.ext}`;
  const filePath = path.join(__dirname, '..', 'protected', 'editors', file);
```

**Replace with:**
```javascript
app.get('/:file(map|npc|item|player|ticket|crafting)-editor.:ext(js|css)', validateSession, checkGodMode, (req, res) => {
  const file = `${req.params.file}-editor.${req.params.ext}`;
  const filePath = path.join(__dirname, '..', 'public', 'gameeditors', file);
```

**Remove or update the `/protected/editors/:file` route (lines ~560-575):**

**Find:**
```javascript
app.get('/protected/editors/:file', validateSession, checkGodMode, (req, res) => {
  const file = req.params.file;
  const filePath = path.join(__dirname, '..', 'protected', 'editors', file);
```

**Replace with:**
```javascript
app.get('/gameeditors/:file', validateSession, checkGodMode, (req, res) => {
  const file = req.params.file;
  const filePath = path.join(__dirname, '..', 'public', 'gameeditors', file);
```

**Note:** Alternatively, if static file serving handles `/gameeditors/` automatically, this route may be removed entirely. Verify static file serving configuration.

---

### 4. Update Static File Serving (if applicable)

#### 4.1 Check Static File Configuration
Verify that `public/` directory is configured for static file serving in the main server file. If so, files in `public/gameeditors/` should be automatically accessible at `/gameeditors/`.

**If static serving is configured:**
- Files will be accessible at `/gameeditors/*.html`, `/gameeditors/*.js`, `/gameeditors/*.css`
- May need to remove route handlers that duplicate static serving
- Ensure god-mode validation is still enforced (may need middleware on static routes)

**If static serving is NOT configured:**
- Keep route handlers but update paths as specified in section 3

---

### 5. Remove Protected Folder

#### 5.1 Delete Directory
After successful migration and verification:
- Delete `protected/editors/` directory (and entire `protected/` folder if empty)
- Remove any empty `protected/` directory structure

#### 5.2 Verify No Remaining References
Search codebase for any remaining references to `protected/editors`:
```bash
grep -r "protected/editors" .
grep -r "protected.*editor" .
```

---

### 6. Update Canonical Documentation

#### 6.1 Update 20-06-frontend-architecture-canonical.md

**File:** `c:\thegame\docs\Chuck docs\20-06-frontend-architecture-canonical.md`

**Section 8.2 Editor UI (God Mode) - Line ~208:**

**Find:**
```
### 8.2 Editor UI (God Mode)
- Files in `protected/editors/`
- Opened as popups from character selection when player is God Mode
- Implement their **own JS** — do **not** import `public/js/widgets/*.js`
- Editors are **separate apps**, not in-game widgets
```

**Replace with:**
```
### 8.2 Editor UI (God Mode)
- Files in `public/gameeditors/`
- Opened as popups from character selection when player is God Mode
- Implement their **own JS** — do **not** import `public/js/widgets/*.js`
- Editors are **separate apps**, not in-game widgets
```

**Section 14 Canonical Enforcement Levels - Line ~312:**

**Find:**
```
- Editor UIs live under `protected/editors/` and are **not** reused in-game
```

**Replace with:**
```
- Editor UIs live under `public/gameeditors/` and are **not** reused in-game
```

**Section 8.1 Gameplay UI - Line ~203:**

**Find:**
```
### 8.1 Gameplay UI
- Files in `public/`
- Main pages: `index.html` (login/character select), `game.html` (game)
- Uses core `Game`, `MessageBus`, `Component`, widgets
```

**Update to clarify separation (optional but recommended):**

```
### 8.1 Gameplay UI
- Files in `public/` (excluding `public/gameeditors/`)
- Main pages: `index.html` (login/character select), `game.html` (game)
- Uses core `Game`, `MessageBus`, `Component`, widgets
```

#### 6.2 Update 20-08-markup-rendering.md

**File:** `c:\thegame\docs\Chuck docs\20-08-markup-rendering.md`

**Section 4.1 Terminal Component - Line ~134:**

**Find:**
```
File: `public/js/widgets/Terminal.js`
```

**No change needed** - this is correct and refers to gameplay components, not editors.

**Verify:** Ensure no editor-specific paths are mentioned in this document. If found, update to `public/gameeditors/`.

#### 6.3 Update 20-10-terminal-rendering.md

**File:** `c:\thegame\docs\Chuck docs\20-10-terminal-rendering.md`

**Section 1 Terminal Component Structure - Line ~19:**

**Find:**
```
public/js/widgets/Terminal.js
```

**No change needed** - this is correct and refers to gameplay components, not editors.

**Verify:** Ensure no editor-specific paths are mentioned in this document. If found, update to `public/gameeditors/`.

---

### 7. Search and Replace All References

#### 7.1 Codebase-Wide Search
After migration, perform comprehensive search for any remaining references:

**Search patterns:**
- `protected/editors`
- `protected.*editor`
- `/protected/editors/`
- References in comments, documentation, error messages

**Files to check:**
- All `.js` files
- All `.html` files
- All `.md` documentation files
- Configuration files
- Route definitions

#### 7.2 Update Import Statements
If any JavaScript files import from editor modules, update paths:
- `import ... from '/protected/editors/...'` → `import ... from '/gameeditors/...'`
- `import ... from '../protected/editors/...'` → `import ... from '../gameeditors/...'`

---

### 8. Testing Checklist

#### 8.1 Functional Testing
- [ ] All editor routes accessible (`/map`, `/npc`, `/items`, `/crafting`, `/player`, `/tickets`, `/markup`)
- [ ] God mode validation still works
- [ ] All editor pages load correctly
- [ ] CSS styling loads correctly (`editor-shared.css`)
- [ ] JavaScript modules load correctly
- [ ] All editor functionality works (CRUD operations, forms, etc.)
- [ ] No 404 errors for editor assets

#### 8.2 Path Verification
- [ ] All HTML files reference correct CSS path
- [ ] All JavaScript imports use correct paths
- [ ] Route handlers point to correct file locations
- [ ] Static file serving works (if applicable)

#### 8.3 Documentation Verification
- [ ] All canonical docs updated
- [ ] No references to `protected/editors` in documentation
- [ ] Path examples are correct

---

### 9. Rollback Plan

If issues arise:
1. Keep `protected/editors/` folder until migration is verified
2. Revert route handlers to original paths
3. Revert HTML file references
4. Restore original documentation

---

### 10. Migration Order (Recommended)

1. **Create `public/gameeditors/` directory**
2. **Move all files** from `protected/editors/` to `public/gameeditors/`
3. **Move `public/markup-editor.js`** to `public/gameeditors/markup-editor.js`
4. **Update HTML file references** (CSS links, JS imports)
5. **Update route handlers** in `routes/api.js`
6. **Test all editor routes**
7. **Update canonical documentation**
8. **Search and replace remaining references**
9. **Final testing**
10. **Delete `protected/editors/` folder** (and `protected/` if empty)

---

## Summary

**Source:** `protected/editors/`  
**Destination:** `public/gameeditors/`  
**Additional:** `public/markup-editor.js` → `public/gameeditors/markup-editor.js`

**Key Changes:**
- All file paths updated from `protected/editors/` to `public/gameeditors/`
- Route handlers updated in `routes/api.js`
- HTML references updated (CSS, JS imports)
- Canonical documentation updated (3 files)
- `protected/` folder removed after verification

**Verification:**
- All editors functional
- No broken references
- Documentation accurate
- God mode validation intact
