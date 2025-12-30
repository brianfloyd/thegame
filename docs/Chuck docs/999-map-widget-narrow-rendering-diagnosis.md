# Map Widget Narrow Rendering — Diagnosis & Resolution

**Document Type:** Reference (999)  
**Date:** 2024  
**Status:** Diagnostic analysis, not canon  
**Purpose:** Identifies why map widget renders narrow after canvas sizing fix

---

## Problem Confirmed

Canvas sizing is correct (drawing buffer matches display size), but the map still renders in a narrow portion of the available width. The constraint is in **render/layout math**, not canvas sizing.

---

## Root Cause Analysis

### 1. Canvas Size Verification ✅

**Location:** `public/js/widgets/MapWidget.js` — `setupCanvas()` (lines 238-264)

- Canvas CSS: `100%` width/height (fills viewport content area)
- Canvas drawing buffer: `canvas.width = viewport.clientWidth`, `canvas.height = viewport.clientHeight`
- **Status:** Canvas sizing is synchronized correctly
- **DPR:** Not handled, but not the issue (canvas.width/height are set to actual pixel dimensions)

### 2. MapRenderer Layout Inputs

**Location:** `public/js/utils/MapRenderer.js` — `calculateBounds()` (lines 51-125)

**Fixed Grid Mode** (used by MapWidget):
- **Lines 52-90:** Fixed grid mode calculation
- **Grid Size:** 20x20 (from `MapWidget.VIEWPORT_SIZE`)
- **Cell Size Calculation:**
  ```javascript
  const cellSizeX = this.canvas.width / this.gridSize;   // e.g., 400 / 20 = 20px
  const cellSizeY = this.canvas.height / this.gridSize;  // e.g., 300 / 20 = 15px
  const baseCellSize = Math.min(cellSizeX, cellSizeY);   // Uses 15px (smaller dimension)
  ```
- **Problem:** `Math.min()` always uses the smaller dimension, wasting space in the larger dimension

**Example:**
- Canvas: 400px wide × 300px tall
- Grid: 20×20 rooms
- `cellSizeX = 400/20 = 20px`, `cellSizeY = 300/20 = 15px`
- `baseCellSize = 15px` (uses height)
- Grid renders as: 20 × 15px = **300px wide** (leaves 100px unused horizontally)

### 3. Layout Recalculation ✅

**Location:** `public/js/utils/MapRenderer.js` — `render()` (line 275)

- `this.renderedBounds = this.calculateBounds(rooms, centerRoom);` — **Called on every render**
- **Status:** Layout is recomputed, not cached
- Bounds are recalculated when canvas size changes

### 4. Behavior Type

**Current Behavior:** **"Fixed viewport with square cells"**
- Shows fixed 20×20 grid centered on current room
- Maintains square cells (uses smaller dimension)
- Wastes space in larger dimension

**Intended Behavior:** **"Fixed viewport maximizing space usage"**
- Show 20×20 grid
- Use maximum available space (prioritize width for maps)
- Maintain square cells OR allow rectangular cells

---

## Exact Functions/Lines

### Bounds Calculation
- **Function:** `MapRenderer.calculateBounds()` (lines 51-125)
- **Fixed Grid Path:** Lines 52-90
- **Cell Size:** Line 60 — `Math.min(cellSizeX, cellSizeY)` ← **PROBLEM LINE**
- **Offsets:** Lines 78-79 — Centering calculation

### Caching Status
- **Not Cached:** `calculateBounds()` called on every `render()` (line 275)
- **Stored:** `this.renderedBounds` (line 28) — recalculated each render

### Canvas Usage
- **Canvas dimensions:** `this.canvas.width` / `this.canvas.height` (lines 58-59)
- **Grid dimensions:** `this.gridSize` (20×20)
- **Cell size:** Derived from canvas dimensions (lines 58-60)

---

## Minimal Fix

**Change:** Use the **larger dimension** instead of smaller, OR prioritize width for map rendering.

**Option A: Use Larger Dimension (Maximize Space)**
```javascript
// Line 60 - Change from:
const baseCellSize = Math.min(cellSizeX, cellSizeY);

// To:
const baseCellSize = Math.max(cellSizeX, cellSizeY);
```
**Trade-off:** Grid may not fit in smaller dimension (will be clipped)

**Option B: Prioritize Width (Maps are typically wider)**
```javascript
// Line 60 - Change from:
const baseCellSize = Math.min(cellSizeX, cellSizeY);

// To:
const baseCellSize = cellSizeX; // Use width dimension
```
**Trade-off:** Grid may not fit in height (will be clipped)

**Option C: Use Smaller but Add Padding Calculation**
Keep `Math.min()` but adjust grid size or add padding to use more space.

**Recommended:** **Option B** (prioritize width) — Maps are typically wider than tall, and the 20×20 grid will still fit vertically in most cases.

---

## Implementation

**File:** `public/js/utils/MapRenderer.js`  
**Line:** 60  
**Change:** Replace `Math.min(cellSizeX, cellSizeY)` with `cellSizeX` to prioritize width

This ensures the map uses the full canvas width, maximizing horizontal space usage.

---

## Verification Steps

After fix:
1. Canvas should be full width (check `canvas.width` matches viewport)
2. Grid should render at full width (20 × cellSizeX = canvas.width)
3. If height is insufficient, grid will be clipped (acceptable trade-off)

---

**END OF DIAGNOSTIC DOCUMENT**









