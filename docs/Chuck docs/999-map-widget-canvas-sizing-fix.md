# Map Widget Canvas Sizing Fix — Reference

**Document Type:** Reference (999)  
**Date:** 2024  
**Status:** Implementation notes, not canon  
**Purpose:** Documents the canvas sizing synchronization fix applied to MapWidget.js and style.css

---

## Problem Summary

The map widget canvas was not using the full available widget space. The viewport container was sized correctly, but the canvas drawing buffer (`canvas.width`/`canvas.height`) was not synchronized with the CSS display size, causing the map to render in a constrained area even when more space was available.

**Root Cause:**
HTML canvas has two distinct sizes:
1. **Display size** (CSS `width`/`height`) — how large the canvas appears
2. **Drawing buffer size** (`canvas.width`/`canvas.height`) — the internal pixel resolution

When these are misaligned, rendering is clipped or compressed, and available space goes unused.

---

## Solution Implemented

### MapWidget.js Changes

**Location:** `public/js/widgets/MapWidget.js` — `setupCanvas()` method (lines ~230-265)

**Key Changes:**
1. **Synchronized canvas drawing buffer with display size:**
   - Canvas CSS set to `100%` to fill viewport content area
   - Canvas drawing buffer (`canvas.width`/`canvas.height`) set to match `viewport.clientWidth`/`clientHeight`
   - Ensures drawing buffer matches actual pixel dimensions

2. **Added ResizeObserver for dynamic updates:**
   - Observes viewport size changes
   - Updates both CSS and drawing buffer dimensions synchronously
   - Triggers re-render when size changes

**Code Pattern:**
```javascript
const updateCanvasSize = () => {
    // CSS fills viewport content area (98% of widget space)
    this.mapCanvas.style.width = '100%';
    this.mapCanvas.style.height = '100%';
    
    // Drawing buffer matches actual pixel dimensions
    const width = Math.floor(viewport.clientWidth) || 400;
    const height = Math.floor(viewport.clientHeight) || 400;
    
    // Synchronize drawing buffer with display size
    if (this.mapCanvas.width !== width || this.mapCanvas.height !== height) {
        this.mapCanvas.width = width;
        this.mapCanvas.height = height;
    }
    
    // Update renderer and re-render
    if (this.mapRenderer) {
        this.mapRenderer.canvas = this.mapCanvas;
        this.mapRenderer.ctx = this.mapCtx;
    }
    this.renderMap();
};
```

### style.css Changes

**Location:** `public/style.css` — Map widget styles (lines ~2336-2365)

**Key Changes:**

1. **Widget root padding removed:**
   ```css
   #widget-map {
       padding: 0;
   }
   ```

2. **Map viewport sizing:**
   ```css
   .map-viewport {
       flex: 1;                    /* Takes remaining space after header */
       padding: 1%;                 /* Creates 98% content area */
       background: #0a0a0a;
       border: 1px solid #333;
       border-radius: 4px;
       overflow: hidden;
       position: relative;
       min-height: 0;
       display: flex;
       align-items: stretch;
       justify-content: stretch;
   }
   ```

3. **Canvas sizing:**
   ```css
   #mapCanvas {
       width: 100% !important;      /* Fill viewport content area */
       height: 100% !important;     /* Fill viewport content area */
       display: block;
       flex: 1;
       min-width: 0;
       min-height: 0;
       box-sizing: border-box;
   }
   ```

---

## How It Works

1. **Widget structure:**
   - Widget root: `flex: column`, `height: 100%`
   - Header: `flex-shrink: 0` (fixed size)
   - Map viewport: `flex: 1` (takes remaining space)
   - Viewport padding: `1%` (creates 98% content area)

2. **Canvas sizing flow:**
   - Viewport has `1%` padding → content area is `98%` of widget space
   - Canvas CSS fills `100%` of viewport content area
   - Canvas drawing buffer matches `viewport.clientWidth`/`clientHeight` (the 98% pixel dimensions)
   - MapRenderer uses `canvas.width`/`canvas.height` for all calculations

3. **Dynamic updates:**
   - ResizeObserver watches viewport size changes
   - Both CSS and drawing buffer update synchronously
   - MapRenderer recalculates cell sizes and offsets based on new canvas dimensions

---

## Key Principle

> **Canvas drawing buffer size must match display size. If the canvas size is wrong, the map will look wrong — even if the map logic is correct.**

The canvas drawing buffer (`canvas.width`/`canvas.height`) is the source of truth for all map coordinate calculations in MapRenderer. It must match the actual pixel dimensions the canvas is displayed at.

---

## Related Files

- `public/js/widgets/MapWidget.js` — Main widget implementation
- `public/js/utils/MapRenderer.js` — Map rendering engine (uses `canvas.width`/`canvas.height`)
- `public/style.css` — Widget styling
- `public/css/widget-shared.css` — Base widget styles

---

## Notes

- This fix ensures the map uses 98% of available widget space (1% padding on viewport)
- Canvas sizing is now dynamic and responds to widget resizing
- MapRenderer calculations (cellSize, offsets) automatically adjust based on canvas dimensions
- No changes were needed to MapRenderer — it already uses `canvas.width`/`canvas.height` correctly

---

**END OF REFERENCE DOCUMENT**












