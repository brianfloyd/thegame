# **10.1 — Item Architecture (Canonical Specification)**

This document defines the **complete Item System architecture** as implemented today across:
- database schema
- item types and branching rules
- encumbrance handling
- lifecycle flows (spawn → pickup → use → deletion)
- event hooks
- NPC, factory, and warehouse integrations

It is built directly from the *validated answers produced by Cursor* and cross-checked against the codebase.

All markup syntax uses backslash escapes.

---

# **1. Item Schema (Database Canonical Source)**

The root definition lives in:
```
migrations/001_schema.sql:95-104
```

**Guaranteed fields** (NOT NULL):
- `id` (primary key)
- `name` (TEXT, UNIQUE)
- `item_type` (defaults to \'sundries\')
- `active` (boolean)
- `poofable` (boolean)
- `encumbrance` (integer)
- `created_at` (bigint)

**Nullable or optional fields (added by later migrations):**
- `description`
- `rune_color`
- `rune_type`
- `deed_warehouse_location_key`
- `deed_base_max_item_types`
- `deed_max_total_items`
- `deed_automation_enabled`
- `deed_upgrade_tier`

This schema is the **single source of truth** for item metadata.

---

# **2. Item Types & Enforcement**

Recognized types:
- `ingredient`
- `rune`
- `deed`

**Validation occurs only at application level**, not via DB constraints:
```
handlers/itemEditor.js:108-112
```

If no match, the editor rejects changes.

**Note:** There is \\*no CHECK constraint\\* enforcing allowed types at the DB layer.

---

# **3. Type-Based Behavior in Game Logic**

### **3.1 Ingredient Behavior**
Used in:
- factory crafting (ingredient slots 0–1 only)

### **3.2 Rune Behavior**
Used in crafting modifiers:
- slot 2: production rune
- slot 3: speed rune
- slot 4: efficiency rune

Associated fields:
- `rune_type`
- `rune_color`

### **3.3 Deed Behavior**
Used for warehouse system:
- determines warehouse instance
- capacity settings
- upgrade properties

Branching occurs in:
```
database.js:2068-2394
```

---

# **4. Encumbrance System**

Encumbrance is stored per item (`items.encumbrance`) and calculated per player by:
```
database.js → getPlayerCurrentEncumbrance()
```

### **Enforced In:**
- movement `handlers/game.js:654-665`
- take command
- player editor additions

### **NOT Enforced In:**
- factory crafting
- harvest output (items drop to room)
- auto-loop
- warehouse withdrawal

This is a known architectural inconsistency.

---

# **5. Item Lifecycle (Spawn → Pickup → Use → Deletion)**

## **5.1 Spawn Sources**
### NPC Harvest Engine
```
services/npcCycleEngine.js:634
```
Adds items to rooms via `addRoomItem()`.

### Player Drops
```
handlers/game.js:1370-1446
```
Moves items from inventory \\→ room.

### Factory Output
```
handlers/game.js:1883
factoryOutputRouter.routeOutputs()
```
Creates crafted items.

---

## **5.2 Pickup Flow**
```
handlers/game.js:1258-1365
```

- validates encumbrance
- removes from room_items
- adds to player_items
- sends updated inventory + room update

Room item merging uses **case-insensitive name matching**, which can produce duplicates if capitalization differs.

---

## **5.3 Use Flow**
\\*Not implemented anywhere in the codebase.\\*

There is:
- no `use` command
- no activation logic
- no item effect system

This is an intentional gap to be filled later.

---

## **5.4 Deletion Rules (Consistent Across All Subsystems)**

Pattern:
```
if quantity <= 0 → DELETE
else → UPDATE
```

Applies to:
- player_items
- room_items
- warehouse_items

Special case:
```
poofable items → removed when room becomes empty
```
Source:
```
database.js:1945-1950
```

---

# **6. Mutations Across Subsystems**

### **6.1 Player Inventory**
- strict item\_name match
- merges existing stacks
- deletes on zero

### **6.2 Room Items**
- case-insensitive matching with `REPLACE(_, ' ', ' ')`
- risky: allows duplicate logical items

### **6.3 Warehouse Items**
- uses deed-driven capacity limits
- exact matching

### **6.4 Factory Crafting**
- consumes ingredient slots
- \\*does NOT consume runes\\*
- does not check encumbrance before depositing outputs

---

# **7. Interactions With Gameplay Systems**

### **NPC Systems (Harvest Engine)**
- Consumes required `input_items`
- Produces output via `addRoomItem()`

### **Factory System**
- Reads `ingredient` and `rune` types
- Matches recipes by stat requirements
- Routes outputs to inventory or room

### **Warehouse System**
- Deed determines:
  - slot limits
  - quantity caps
  - automation eligibility

### **No integration yet with:**
- equipment system (not implemented)
- key items (not implemented)
- item \\use\\ actions (not implemented)

---

# **8. Event Hooks (Current Coverage)**

### **Pickup Event**
```
handlers/game.js:take()
```
- validates, moves item, updates client

### **Drop Event**
```
handlers/game.js:drop()
```
- moves item to room, updates client

### **Craft Event**
```
factoryCraft() → updates inventory, sends room update
```

### **Harvest Event**
```
npcCycleEngine → addRoomItem() + message events
```

### **Missing Hooks**
- pre-pickup
- post-pickup
- item activation (use)
- item transformation
- global item event bus

---

# **9. Serialization Rules (Client-Facing Format)**

### **Inventory Serialization**
```
{ item_name, quantity, encumbrance }
```
Encumbrance included.

### **Room Serialization**
```
{ item_name, quantity }
```
No encumbrance.

### **Warehouse Serialization**
```
{ item_name, quantity }
```
Encumbrance not included.

### **Omitted Everywhere:**
- item\_type
- description
- poofable
- rune metadata
- deed metadata

Client sees a **minimalist representation**, not a full item snapshot.

---

# **10. Architectural Gaps & Future TODOs**

This section defines the official TODO list for Cursor refactors.

### **A. Database Integrity**
- Add FOREIGN KEYS for item\_name → items.name
- Add UNIQUE constraints on:
  - player\_id + item\_name
  - room\_id + item\_name
  - warehouse composite keys

### **B. Encumbrance Enforcement**
- Add checks to:
  - factory crafting
  - auto-loop
  - warehouse withdrawal

### **C. Create Canonical `use` System**
- item activation
- item effects
- cooldowns
- consumption rules

### **D. Room Item Safety**
- replace case-insensitive matching with canonical item IDs

### **E. Item Event Bus**
Unified hooks:
- onSpawn
- onPickup
- onDrop
- onCraft
- onDelete
- onUse (future)

### **F. Complete Item Snapshot Serialization**
Client should optionally receive:
- item\_type
- encumbrance
- description
- rune\_metadata
- deed\_metadata

### **G. New Item Classes**
Implement:
- equipment
- keys
- quest items
- attunement catalysts

---

# **End of 10.1 — Item Architecture**