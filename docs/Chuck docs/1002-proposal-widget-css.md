# 1002 — Widget CSS Standardization Proposal

## Overview

This document proposes a standardized CSS architecture for widgets, similar to the `editor-shared.css` approach used in the `gameeditors` structure. The goal is to create consistent, maintainable styling while preserving design flexibility for unique widgets like Factory and NPC.

## Current State Analysis

### Existing Patterns

**Gameeditors Structure (`public/gameeditors/editor-shared.css`):**
- Standardized button classes (`.editor-btn`, `.editor-btn-danger`, `.editor-btn-primary`)
- Standardized input classes (`.editor-input`, `.editor-select`, `.editor-textarea`)
- Standardized form sections (`.form-section`, `.section-header`)
- Consistent color scheme (green terminal aesthetic)
- Reusable layout patterns

**Current Widget Styling (`public/style.css`):**
- Widget base styles (`.widget`, `.widget-header`, `.widget-content`)
- Scattered custom styles for individual widgets
- Inconsistent button styling across widgets
- Some widgets have inline styles or unique class names
- Factory and NPC widgets have special color schemes (orange/amber)

### Widget Types

1. **Standard Widgets** (always visible):
   - Stats Widget
   - Compass Widget
   - Map Widget
   - Comms Widget
   - Inventory Widget

2. **Conditional Widgets** (context-driven):
   - NPC Widget (orange/amber theme)
   - Factory Widget (orange theme)
   - Warehouse Widget

3. **God Mode Widgets**:
   - God Mode Widget (yellow/gold theme)

4. **Toggleable Widgets**:
   - Terminal Widget
   - Tickets Widget
   - Scripting Widget
   - Rune Keeper Widget

## Proposed Solution

### Architecture: `widget-shared.css`

Create a new shared CSS file: `public/css/widget-shared.css` that provides standardized components while allowing widget-specific customization.

---

## 1. Core Widget Structure

### Base Widget Classes

```css
/* ============================================================
   WIDGET SHARED CSS
   Canonical styling for all widgets.
   Maintains retro terminal aesthetic with flexibility.
   ============================================================ */

/* Base Widget Container */
.widget {
    position: relative;
    background: #1a1a1a;
    border: 2px solid #00ff00;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
    overflow: hidden;
    min-height: 0;
    height: 100%;
    font-family: 'Courier New', monospace;
}

/* Widget Header (Standard) */
.widget-header {
    color: #00ff00;
    text-align: center;
    padding: 8px;
    font-size: 0.85em;
    text-transform: uppercase;
    font-weight: bold;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
    pointer-events: none;
    user-select: none;
}

/* Widget Content Area */
.widget-content {
    flex: 1;
    padding: 8px;
    overflow-y: auto;
    overflow-x: hidden;
    color: #00ff00;
    font-size: 10px;
}
```

### Widget Theme Variants

```css
/* Standard Widget Theme (default - green) */
.widget-theme-standard {
    border-color: #00ff00;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
}

.widget-theme-standard .widget-header {
    color: #00ff00;
    border-bottom-color: #333;
}

/* Factory Widget Theme (orange) */
.widget-theme-factory {
    border-color: #ff8800;
    box-shadow: 0 0 15px rgba(255, 136, 0, 0.6);
    background: #0a0a0a;
}

.widget-theme-factory .widget-header {
    color: #ffff00;
    border-bottom-color: #ff8800;
    background: #1a1a1a;
}

/* NPC Widget Theme (orange/amber) */
.widget-theme-npc {
    border-color: #ff8800;
    box-shadow: 0 0 15px rgba(255, 136, 0, 0.6);
}

.widget-theme-npc .widget-header {
    color: #ff8800;
    border-bottom-color: #663300;
}

/* God Mode Widget Theme (yellow/gold) */
.widget-theme-godmode {
    border-color: #ffcc00;
    box-shadow: 0 0 15px rgba(255, 204, 0, 0.5);
}

.widget-theme-godmode .widget-header {
    color: #ffcc00;
    border-bottom-color: #ffcc00;
    background: linear-gradient(135deg, #1a1a0a 0%, #2a2a0a 100%);
}
```

---

## 2. Standardized Buttons

### Primary Button Styles

```css
/* =============================
   BUTTONS
   ============================= */

/* Standard Widget Button */
.widget-btn {
    padding: 6px 12px;
    background: #1a1a1a;
    border: 1px solid #cccccc;
    color: #cccccc;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    text-transform: uppercase;
}

.widget-btn:hover:not(:disabled) {
    background: #222;
    border-color: #00ff00;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
}

.widget-btn:active:not(:disabled) {
    background: #0a0a0a;
    transform: translateY(1px);
}

.widget-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: #333;
    color: #666;
}

/* Primary Action Button */
.widget-btn-primary {
    background: #002200;
    border-color: #00ff00;
    color: #00ff00;
}

.widget-btn-primary:hover:not(:disabled) {
    background: #003300;
    box-shadow: 0 0 12px rgba(0, 255, 0, 0.6);
}

/* Danger/Destructive Button */
.widget-btn-danger {
    background: #330000;
    border-color: #ff4444;
    color: #ff6666;
}

.widget-btn-danger:hover:not(:disabled) {
    background: #440000;
    border-color: #ff6666;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
}

/* Success/Confirm Button */
.widget-btn-success {
    background: #003300;
    border-color: #00ff00;
    color: #00ff00;
}

.widget-btn-success:hover:not(:disabled) {
    background: #004400;
    box-shadow: 0 0 12px rgba(0, 255, 0, 0.6);
}

/* Small Button (for compact spaces) */
.widget-btn-small {
    padding: 4px 8px;
    font-size: 10px;
}

/* Icon Button (square, icon-only) */
.widget-btn-icon {
    padding: 6px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### Button Groups

```css
/* Button Group Container */
.widget-btn-group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.widget-btn-group .widget-btn {
    flex: 1;
    min-width: 60px;
}

/* Mode/Tab Buttons (for Comms Widget, etc.) */
.widget-mode-btn {
    padding: 6px 12px;
    background: #111;
    border: 1px solid #333;
    color: #888;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    transition: 0.2s;
    text-transform: uppercase;
}

.widget-mode-btn:hover {
    background: #1a1a1a;
    color: #00ff00;
}

.widget-mode-btn.active {
    background: #002200;
    border-color: #00ff00;
    color: #00ff00;
    border-bottom-color: transparent;
}
```

---

## 3. Standardized Inputs

```css
/* =============================
   INPUTS
   ============================= */

.widget-input,
.widget-select,
.widget-textarea {
    background: #0a0a0a;
    border: 1px solid #333;
    color: #00ff00;
    padding: 6px 10px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    width: 100%;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.widget-input:focus,
.widget-select:focus,
.widget-textarea:focus {
    outline: none;
    border-color: #00ff00;
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
}

.widget-input::placeholder {
    color: #666;
}

.widget-textarea {
    resize: vertical;
    min-height: 60px;
}

/* Input with Button (side-by-side) */
.widget-input-group {
    display: flex;
    gap: 6px;
}

.widget-input-group .widget-input {
    flex: 1;
}

.widget-input-group .widget-btn {
    flex-shrink: 0;
}
```

---

## 4. Standardized Text & Formatting

```css
/* =============================
   TEXT & FORMATTING
   ============================= */

/* Section Headers */
.widget-section {
    margin-bottom: 12px;
    padding: 8px;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
}

.widget-section-title {
    color: #ffff00;
    font-weight: bold;
    margin-bottom: 8px;
    font-size: 0.9em;
    text-transform: uppercase;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
}

/* Labels */
.widget-label {
    color: #00ffff;
    font-size: 0.85em;
    margin-bottom: 4px;
    display: block;
}

/* Values */
.widget-value {
    color: #00ff00;
    font-weight: bold;
    font-size: 0.9em;
}

/* Secondary Text */
.widget-text-secondary {
    color: #888;
    font-size: 0.85em;
    font-style: italic;
}

/* Info/Help Text */
.widget-text-info {
    color: #00ffff;
    font-size: 0.8em;
    margin-top: 4px;
}

/* Error Text */
.widget-text-error {
    color: #ff6666;
    font-size: 0.85em;
}

/* Success Text */
.widget-text-success {
    color: #00ff00;
    font-size: 0.85em;
}

/* Stat/Data Rows */
.widget-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 2px 0;
    color: #00ff00;
    font-size: 0.825em;
}

.widget-stat-label {
    color: #00ffff;
}

.widget-stat-value {
    color: #00ff00;
    font-weight: bold;
    min-width: 30px;
    text-align: right;
}
```

---

## 5. Standardized Progress & Indicators

```css
/* =============================
   PROGRESS & INDICATORS
   ============================= */

/* Progress Bar Container */
.widget-progress {
    width: 100%;
    height: 12px;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
    margin: 4px 0;
}

/* Progress Bar Fill */
.widget-progress-fill {
    height: 100%;
    transition: width 0.3s ease, background 0.3s ease;
}

/* Progress Bar Variants */
.widget-progress-fill.standard {
    background: linear-gradient(90deg, #00ff00, #00cc00);
    box-shadow: 0 0 8px #00ff00 inset;
}

.widget-progress-fill.harvesting {
    background: linear-gradient(90deg, #00ff00, #00cc00);
    box-shadow: 0 0 8px #00ff00 inset;
}

.widget-progress-fill.cooldown {
    background: linear-gradient(90deg, #ff6600, #ff9900);
    box-shadow: 0 0 8px #ff6600 inset;
}

.widget-progress-fill.warning {
    background: linear-gradient(90deg, #ffaa00, #ffcc00);
    box-shadow: 0 0 8px #ffaa00 inset;
}

.widget-progress-fill.danger {
    background: linear-gradient(90deg, #ff4444, #ff6666);
    box-shadow: 0 0 8px #ff4444 inset;
}

/* Badge/Status Indicator */
.widget-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
}

.widget-badge.active {
    background: #003300;
    color: #00ff00;
}

.widget-badge.inactive {
    background: #330000;
    color: #ff6666;
}

.widget-badge.warning {
    background: #332200;
    color: #ffaa00;
}
```

---

## 6. Standardized Lists & Tables

```css
/* =============================
   LISTS & TABLES
   ============================= */

/* List Container */
.widget-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.widget-list-item {
    padding: 6px 8px;
    margin-bottom: 4px;
    background: #111;
    border: 1px solid #333;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
}

.widget-list-item:hover {
    border-color: #00ff00;
    background: #151515;
}

.widget-list-item.selected {
    border-color: #00ff00;
    background: #002200;
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.2);
}

/* Table */
.widget-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
}

.widget-table th {
    color: #ffff00;
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid #333;
    text-transform: uppercase;
    font-size: 0.8em;
}

.widget-table td {
    padding: 4px 8px;
    border-bottom: 1px solid #222;
    color: #00ff00;
}

.widget-table tr:hover {
    background: #111;
}
```

---

## 7. Widget-Specific Flexibility

### Factory Widget Customization

```css
/* Factory Widget - Special Slot Styling */
.widget-factory-slot {
    /* Factory slots can override base styles */
    border: 2px dashed #ff8800;
    background: #0a0a0a;
}

.widget-factory-slot.filled {
    border-style: solid;
    border-color: #ffaa00;
}

.widget-factory-slot.drag-over {
    border-color: #ffff00;
    background: #1a1a0a;
    box-shadow: 0 0 15px rgba(255, 255, 0, 0.6);
}

/* Factory-specific buttons inherit from .widget-btn but can override */
.widget-factory .widget-btn {
    /* Factory buttons can have orange accent */
    border-color: #ff8800;
}

.widget-factory .widget-btn:hover:not(:disabled) {
    border-color: #ffaa00;
    box-shadow: 0 0 8px rgba(255, 136, 0, 0.4);
}
```

### NPC Widget Customization

```css
/* NPC Widget - Special Timing Display */
.widget-npc-timing {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #333;
    font-size: 10px;
}

.widget-npc-timing-row {
    display: flex;
    justify-content: space-between;
    margin: 2px 0;
    color: #ff8800;
}

.widget-npc-timing-label {
    color: #888;
}

.widget-npc-timing-value {
    color: #ff8800;
    font-weight: bold;
}

/* NPC-specific name styling */
.widget-npc-name {
    color: #ffcc00;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    margin-bottom: 8px;
}
```

---

## 8. Implementation Strategy

### Phase 1: Create Shared CSS File

1. Create `public/css/widget-shared.css` with all standardized components
2. Add theme variants for Factory, NPC, and God Mode widgets
3. Document all classes in this proposal

### Phase 2: Migrate Existing Widgets

1. **Stats Widget**: Replace custom button styles with `.widget-btn`
2. **Comms Widget**: Replace custom mode buttons with `.widget-mode-btn`
3. **Compass Widget**: Keep compass-specific button styling but inherit from base
4. **Map Widget**: Minimal changes (mostly canvas-based)
5. **Inventory Widget**: Use `.widget-list` and `.widget-list-item`

### Phase 3: Update Unique Widgets

1. **Factory Widget**: 
   - Apply `.widget-theme-factory` class
   - Use `.widget-btn` for craft/empty buttons
   - Keep slot-specific styling but use standardized progress bars

2. **NPC Widget**:
   - Apply `.widget-theme-npc` class
   - Use standardized progress bars (`.widget-progress`)
   - Use `.widget-stat-row` for timing information

3. **God Mode Widget**:
   - Apply `.widget-theme-godmode` class
   - Use standardized buttons throughout

### Phase 4: Cleanup

1. Remove duplicate styles from `style.css`
2. Update widget JavaScript to use new class names
3. Test all widgets for visual consistency
4. Document widget-specific customizations

---

## 9. Usage Examples

### Example: Standard Widget Button

```html
<!-- Before -->
<button class="comm-send-btn">Send</button>

<!-- After -->
<button class="widget-btn widget-btn-primary">Send</button>
```

### Example: Factory Widget with Theme

```html
<!-- Factory Widget Container -->
<div class="widget widget-theme-factory" id="widget-factory">
    <div class="widget-header">Factory</div>
    <div class="widget-content">
        <button class="widget-btn widget-btn-primary">Craft</button>
        <button class="widget-btn widget-btn-danger">Empty Slot</button>
    </div>
</div>
```

### Example: NPC Widget Progress Bar

```html
<!-- Before -->
<div class="npc-widget-progress-container">
    <div class="npc-widget-progress-bar harvesting"></div>
</div>

<!-- After -->
<div class="widget-progress">
    <div class="widget-progress-fill harvesting"></div>
</div>
```

### Example: Stats Widget Stat Row

```html
<!-- Before -->
<div class="stat-item">
    <span class="stat-label">Ingenuity</span>
    <span class="stat-value">15</span>
</div>

<!-- After -->
<div class="widget-stat-row">
    <span class="widget-stat-label">Ingenuity</span>
    <span class="widget-stat-value">15</span>
</div>
```

---

## 10. Design Principles

### Consistency
- All widgets use the same base button styles
- All widgets use the same input styles
- All widgets use the same text formatting classes

### Flexibility
- Theme variants allow unique color schemes (Factory, NPC, God Mode)
- Widget-specific classes can extend base classes
- Custom styling allowed for truly unique elements (e.g., compass grid)

### Maintainability
- Single source of truth for common styles
- Easy to update all widgets by changing shared CSS
- Clear naming conventions (`.widget-*` prefix)

### Retro Aesthetic
- Maintains green terminal theme
- Monospace fonts throughout
- Neon glow effects on hover
- Dark backgrounds with bright accents

---

## 11. Migration Checklist

- [ ] Create `public/css/widget-shared.css`
- [ ] Add shared CSS to `game.html` (after `style.css`)
- [ ] Migrate Stats Widget to use `.widget-btn`
- [ ] Migrate Comms Widget to use `.widget-mode-btn`
- [ ] Migrate Factory Widget to use `.widget-theme-factory`
- [ ] Migrate NPC Widget to use `.widget-theme-npc` and `.widget-progress`
- [ ] Migrate God Mode Widget to use `.widget-theme-godmode`
- [ ] Update Inventory Widget to use `.widget-list`
- [ ] Remove duplicate styles from `style.css`
- [ ] Test all widgets for visual consistency
- [ ] Update widget JavaScript files to use new class names
- [ ] Document any widget-specific customizations

---

## 12. Future Enhancements

### Potential Additions

1. **Widget Animation Classes**:
   - `.widget-fade-in`, `.widget-slide-in` for transitions

2. **Widget State Classes**:
   - `.widget-loading`, `.widget-error`, `.widget-empty`

3. **Widget Size Variants**:
   - `.widget-compact`, `.widget-expanded` for responsive sizing

4. **Widget Icon System**:
   - Standardized icon classes for common actions

5. **Widget Tooltip System**:
   - Standardized tooltip styling for help text

---

## Summary

This proposal establishes a standardized CSS architecture for widgets that:

1. **Maintains Consistency**: All widgets use the same base components
2. **Preserves Flexibility**: Unique widgets (Factory, NPC) can customize via themes
3. **Improves Maintainability**: Single source of truth for common styles
4. **Respects Design**: Maintains retro terminal aesthetic throughout
5. **Enables Growth**: Easy to add new widgets following established patterns

The approach mirrors the successful `editor-shared.css` pattern, ensuring developers have a clear, consistent way to style widgets while allowing for necessary customization.
