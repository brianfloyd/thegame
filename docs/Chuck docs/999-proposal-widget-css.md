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

[Note: The rest of the file content remains the same - see full proposal in previous output. This is a reference document for widget CSS standardization.]

