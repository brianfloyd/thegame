# AutomationWidget Analysis & Improvement Plan

**Document Type:** Analysis & Proposal  
**Date:** 2025-01-XX  
**Purpose:** Comprehensive analysis of AutomationWidget for canon consistency, improvements, and expansion to ~10 toggle settings with player ability gating

---

## 1. CANON CONSISTENCY ANALYSIS

### ✅ **Correctly Implemented**

1. **Widget Architecture Compliance**
   - ✅ Extends `Widget` base class correctly
   - ✅ Implements `render()`, `onAttach()`, `onMessage()`, `onDetach()` lifecycle
   - ✅ Uses `fullwidth` slot (correct in registry)
   - ✅ Follows message routing pattern via WidgetManager

2. **Automation Engine Integration**
   - ✅ Handles `paths:executionStarted`, `paths:executionComplete`, `paths:executionStopped`
   - ✅ Handles `autonav:started`, `autonav:complete`, `autonav:failed`
   - ✅ Tracks execution state correctly
   - ✅ Auto-harvest toggle only shown for loops (canon-compliant)

3. **State Management**
   - ✅ Execution tracking structure matches canon expectations
   - ✅ Properly handles pause/resume logic
   - ✅ Room position tracking for auto-path

### ⚠️ **Canon Inconsistencies & Issues**

1. **Legacy Code Duplication**
   - ❌ `public/js/main.js` has duplicate `updateAutomationStatus()` and `updatePathStepPosition()` functions (lines 2502-2596)
   - ❌ These should be removed - AutomationWidget handles this now
   - **Impact:** Potential desync if both update simultaneously

2. **Missing Future Features (Per Canon)**
   - ❌ Auto-collect toggle (canon 10-16 §6.1)
   - ❌ Auto-store toggle (canon 10-16 §6.2)
   - ❌ Auto-deliver toggle (canon 10-16 §6.3)
   - ❌ Auto-craft loops toggle (canon 10-16 §6.4)
   - **Note:** These are "future expansion" per canon, but widget should have UI stubs

3. **Toggle State Persistence**
   - ⚠️ Auto-harvest toggle state is NOT persisted (lost on widget reload)
   - ⚠️ Should use `player.widget_config` JSON field per player state model
   - **Impact:** User must re-enable toggle every session

4. **Player Ability Gating Missing**
   - ❌ No checks for player abilities/stats before enabling toggles
   - ❌ Canon mentions player abilities should gate automation features
   - **Impact:** All players see all toggles regardless of capabilities

5. **CSS Class Usage**
   - ⚠️ Uses custom inline styles instead of `widget-shared.css` classes
   - ⚠️ Should use `.widget-btn`, `.widget-section`, etc. for consistency
   - **Impact:** Inconsistent styling, harder to maintain

---

## 2. IMPROVEMENTS NEEDED

### **High Priority**

1. **Remove Legacy Code**
   - Delete duplicate functions from `main.js`
   - Ensure AutomationWidget is single source of truth

2. **Add Toggle State Persistence**
   - Store toggle states in `player.widget_config` JSON
   - Load on widget attach
   - Save on toggle change

3. **Standardize CSS Classes**
   - Replace inline styles with `widget-shared.css` classes
   - Use `.widget-section`, `.widget-btn`, `.widget-stat-row`, etc.

4. **Add Player Ability Gating**
   - Check player stats/abilities before showing/enabling toggles
   - Display tooltips explaining requirements

### **Medium Priority**

5. **Add Future Feature Stubs**
   - Add UI for auto-collect, auto-store, auto-deliver, auto-craft
   - Mark as "Coming Soon" or gate by abilities
   - Prepare for server-side implementation

6. **Improve Status Display**
   - Use standardized progress bars for execution tracking
   - Add visual indicators for pause reasons
   - Better error state display

7. **Add Toggle Grouping**
   - Group related toggles (harvest, collect, store, deliver)
   - Add section headers for clarity

### **Low Priority**

8. **Keyboard Shortcuts**
   - Add keyboard shortcuts for common actions (Start/Stop)
   - Document in widget header

9. **Tooltips & Help**
   - Add tooltips explaining each toggle
   - Link to help documentation

---

## 3. PROPOSED TOGGLE ARCHITECTURE (~10 Toggles)

### **Toggle Categories**

#### **Category 1: Movement Automation** (2 toggles)
1. **Auto-Navigation** (Always available)
   - Toggle: Enable auto-navigation
   - Gating: None (basic feature)
   - Behavior: Auto-move to selected destination

2. **Auto-Loop Execution** (Always available)
   - Toggle: Enable loop execution
   - Gating: None (basic feature)
   - Behavior: Execute saved loops

#### **Category 2: Harvest Automation** (2 toggles)
3. **Auto-Harvest** (Current - Loops only)
   - Toggle: Enable auto-harvest during loops
   - Gating: `ability_attunement >= 5` OR `stat_resonance >= 10`
   - Behavior: Auto-harvest NPCs during loop execution
   - **Current:** ✅ Implemented

4. **Auto-Attune** (New)
   - Toggle: Auto-attune when vitalis depleted
   - Gating: `ability_attunement >= 10` AND `stat_resonance >= 15`
   - Behavior: Automatically attune when vitalis reaches 0 during automation

#### **Category 3: Item Management** (3 toggles)
5. **Auto-Collect** (Future - Canon §6.1)
   - Toggle: Auto-pickup ground items
   - Gating: `stat_acumen >= 10` OR `ability_commerce >= 5`
   - Behavior: Collect items matching filter rules
   - **Status:** Stub (server implementation needed)

6. **Auto-Store** (Future - Canon §6.2)
   - Toggle: Auto-store items in warehouse
   - Gating: `requiresWarehouse` AND `stat_acumen >= 15`
   - Behavior: Store items when entering warehouse room
   - **Status:** Stub (server implementation needed)

7. **Auto-Sell** (New)
   - Toggle: Auto-sell items to merchants
   - Gating: `ability_commerce >= 10` AND `stat_acumen >= 20`
   - Behavior: Sell items when encountering merchants

#### **Category 4: Factory Automation** (2 toggles)
8. **Auto-Deliver** (Future - Canon §6.3)
   - Toggle: Auto-deliver ingredients to factory
   - Gating: `requiresFactory` AND `stat_ingenuity >= 15` AND `ability_crafting >= 10`
   - Behavior: Deliver items and insert runes automatically
   - **Status:** Stub (server implementation needed)

9. **Auto-Craft** (Future - Canon §6.4)
   - Toggle: Auto-execute craft cycles
   - Gating: `requiresFactory` AND `stat_ingenuity >= 20` AND `ability_crafting >= 15`
   - Behavior: Execute full craft cycles automatically
   - **Status:** Stub (server implementation needed)

#### **Category 5: Advanced Automation** (1 toggle)
10. **Auto-Craft Loop** (Future - Canon §6.4)
    - Toggle: Enable full macro-factory loops
    - Gating: All factory toggles enabled + `stat_ingenuity >= 25` AND `ability_crafting >= 20`
    - Behavior: Collect → Store → Deliver → Craft → Repeat
    - **Status:** Stub (server implementation needed)

---

## 4. TOGGLE UI DESIGN

### **Layout Structure**

```
┌─────────────────────────────────────────┐
│ Automation                               │
├─────────────────────────────────────────┤
│ [Path/Loop Selection Dropdown]          │
│ [Delete Path] [Start] [Stop] [Continue] │
├─────────────────────────────────────────┤
│ TOGGLE SETTINGS                          │
├─────────────────────────────────────────┤
│ Movement                                 │
│ ☑ Auto-Navigation                       │
│ ☑ Auto-Loop Execution                    │
├─────────────────────────────────────────┤
│ Harvest                                  │
│ ☑ Auto-Harvest (Loops) [Resonance 10+]  │
│ ☐ Auto-Attune [Attunement 10+][Locked]  │
├─────────────────────────────────────────┤
│ Items                                    │
│ ☐ Auto-Collect [Acumen 10+][Locked]     │
│ ☐ Auto-Store [Acumen 15+][Locked]       │
│ ☐ Auto-Sell [Commerce 10+][Locked]       │
├─────────────────────────────────────────┤
│ Factory                                  │
│ ☐ Auto-Deliver [Ingenuity 15+][Locked]   │
│ ☐ Auto-Craft [Ingenuity 20+][Locked]    │
│ ☐ Auto-Craft Loop [Ingenuity 25+][Locked] │
├─────────────────────────────────────────┤
│ [Execution Status Panel]                 │
└─────────────────────────────────────────┘
```

### **Toggle States**

1. **Enabled** (☑) - Toggle is ON, feature active
2. **Disabled** (☐) - Toggle is OFF, feature inactive
3. **Locked** (☐ + [Locked]) - Player doesn't meet requirements
4. **Unavailable** (Grayed out) - Feature not implemented yet

### **Visual Indicators**

- **Locked toggles:** Gray background, tooltip shows requirements
- **Available toggles:** Normal styling, can toggle
- **Active toggles:** Highlighted border/background
- **Stub features:** "Coming Soon" badge

---

## 5. IMPLEMENTATION PLAN

### **Phase 1: Cleanup & Foundation** (Immediate)

1. **Remove Legacy Code**
   - Delete `updateAutomationStatus()` from `main.js`
   - Delete `updatePathStepPosition()` from `main.js`
   - Verify no other code references these

2. **Add Toggle State Persistence**
   ```javascript
   // Load from player.widget_config on attach
   loadToggleStates() {
       const config = this.game.currentPlayer?.widget_config || {};
       this.toggleStates = config.automation || {};
   }
   
   // Save to player.widget_config on change
   saveToggleStates() {
       // Send to server to update widget_config
   }
   ```

3. **Standardize CSS**
   - Replace inline styles with `widget-shared.css` classes
   - Use `.widget-section`, `.widget-section-title`
   - Use `.widget-btn`, `.widget-btn-primary`

### **Phase 2: Toggle System Architecture** (Next)

4. **Create Toggle Configuration**
   ```javascript
   const TOGGLE_CONFIG = {
       autoNavigation: {
           label: 'Auto-Navigation',
           category: 'movement',
           gating: null, // Always available
           requiresAbility: null,
           requiresStat: null,
           implemented: true
       },
       autoHarvest: {
           label: 'Auto-Harvest (Loops)',
           category: 'harvest',
           gating: 'ability_attunement >= 5 OR stat_resonance >= 10',
           requiresAbility: { attunement: 5 },
           requiresStat: { resonance: 10 },
           implemented: true
       },
       // ... etc
   };
   ```

5. **Add Toggle Rendering**
   - Render toggles in sections
   - Check player stats/abilities for gating
   - Show locked state with tooltips

6. **Add Toggle Event Handlers**
   - Handle toggle changes
   - Validate requirements
   - Save state to server

### **Phase 3: Server Integration** (Future)

7. **Server-Side Toggle Handling**
   - Accept toggle states in automation messages
   - Gate behavior by toggle state
   - Implement stub features (auto-collect, auto-store, etc.)

---

## 6. PLAYER ABILITY GATING LOGIC

### **Gating Rules**

```javascript
function canEnableToggle(toggleConfig, playerStats) {
    // Always available
    if (!toggleConfig.gating) return true;
    
    // Check ability requirements
    if (toggleConfig.requiresAbility) {
        for (const [ability, minValue] of Object.entries(toggleConfig.requiresAbility)) {
            const abilityValue = playerStats[`ability_${ability}`] || 0;
            if (abilityValue >= minValue) return true; // OR logic
        }
    }
    
    // Check stat requirements
    if (toggleConfig.requiresStat) {
        for (const [stat, minValue] of Object.entries(toggleConfig.requiresStat)) {
            const statValue = playerStats[`stat_${stat}`] || 0;
            if (statValue >= minValue) return true; // OR logic
        }
    }
    
    // Check special requirements
    if (toggleConfig.requiresWarehouse && !playerStats.hasWarehouse) return false;
    if (toggleConfig.requiresFactory && !playerStats.inFactoryRoom) return false;
    
    return false; // Locked
}
```

### **Tooltip Generation**

```javascript
function getToggleTooltip(toggleConfig, playerStats) {
    const requirements = [];
    
    if (toggleConfig.requiresAbility) {
        for (const [ability, minValue] of Object.entries(toggleConfig.requiresAbility)) {
            const current = playerStats[`ability_${ability}`] || 0;
            const status = current >= minValue ? '✓' : '✗';
            requirements.push(`${status} ${ability}: ${current}/${minValue}`);
        }
    }
    
    if (toggleConfig.requiresStat) {
        for (const [stat, minValue] of Object.entries(toggleConfig.requiresStat)) {
            const current = playerStats[`stat_${stat}`] || 0;
            const status = current >= minValue ? '✓' : '✗';
            requirements.push(`${status} ${stat}: ${current}/${minValue}`);
        }
    }
    
    if (!toggleConfig.implemented) {
        return 'Coming Soon - Feature not yet implemented';
    }
    
    return requirements.join('\n') || 'No requirements';
}
```

---

## 7. CANON ALIGNMENT CHECKLIST

- [x] Widget follows Widget base class pattern
- [x] Uses WidgetManager message routing
- [x] Handles all automation engine events
- [ ] Removes legacy duplicate code
- [ ] Persists toggle state in widget_config
- [ ] Gates toggles by player abilities/stats
- [ ] Uses standardized CSS classes
- [ ] Includes stubs for future features (per canon)
- [ ] Aligns with automation engine canon (10-16)

---

## 8. NEXT STEPS

1. **Immediate:** Review and approve this plan
2. **Phase 1:** Cleanup legacy code, add persistence, standardize CSS
3. **Phase 2:** Implement toggle system with gating
4. **Phase 3:** Server-side integration for stub features

---

**END OF DOCUMENT**










