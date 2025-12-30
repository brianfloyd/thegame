# 999 — Shop Item Summary

**Document Type:** Current State Reference  
**Date:** Generated via MCP database query  
**Purpose:** Complete listing of all items currently associated with merchants/shops

---

## 1. EXECUTIVE SUMMARY

**Total Merchant Items:** 1  
**Unique Items in Merchants:** 1  
**Total Merchant Rooms:** 3  
**Merchant Rooms with Items:** 1  
**Merchant Rooms Empty:** 2  
**Buyable Items:** 1  
**Sellable Items:** 0  
**Average Price:** 20 Glimmer Shards  
**Price Range:** 20 - 20 Glimmer Shards

---

## 2. ITEMS IN MERCHANTS

### 2.1 Warhouse Deed

**Item Details:**
- **Name:** Warhouse Deed (note: typo in database - "Warhouse" instead of "Warehouse")
- **Type:** deed
- **Description:** "A deed to the warhouse"
- **Encumbrance:** 1
- **Item ID:** 3

**Merchant Details:**
- **Merchant Item ID:** 1
- **Location:** Werner's Warerhouses (note: typo - "Warerhouses" instead of "Warehouses")
- **Map:** Newhaven
- **Room ID:** 21462

**Pricing & Availability:**
- **Price:** 20 Glimmer Shards
- **Buyable:** ✅ Yes
- **Sellable:** ❌ No
- **Stock Type:** Limited
- **Max Quantity:** 1
- **Current Quantity:** 1
- **Unlimited:** ❌ No
- **Regen Hours:** None (not configured)

---

## 3. MERCHANT ROOMS

### 3.1 Werner's Warerhouses (Active)

**Location:**
- **Room Name:** Werner's Warerhouses
- **Map:** Newhaven
- **Room ID:** 21462
- **Room Type:** merchant

**Inventory:**
- **Total Items:** 1
- **Buyable Items:** 1
- **Sellable Items:** 0
- **Average Price:** 20 Glimmer Shards

**Items Sold:**
1. Warhouse Deed - 20 Glimmer Shards (buyable only, limited stock: 1)

---

### 3.2 Job's junk (Empty)

**Location:**
- **Room Name:** Job's junk
- **Map:** Newhaven
- **Room ID:** 21484
- **Room Type:** merchant

**Inventory:**
- **Total Items:** 0
- **Status:** Empty (no items configured)

---

### 3.3 Ron's runes (Empty)

**Location:**
- **Room Name:** Ron's runes
- **Map:** Newhaven
- **Room ID:** 21626
- **Room Type:** merchant

**Inventory:**
- **Total Items:** 0
- **Status:** Empty (no items configured)

---

## 4. STATISTICS BY ITEM TYPE

### 4.1 Items by Type in Merchants

| Item Type | Count | Buyable | Sellable | Avg Price |
|-----------|-------|---------|----------|-----------|
| deed      | 1     | 1       | 0        | 20        |

### 4.2 Item Creation Functionality Status

**✅ Item Editor EXISTS and is FUNCTIONAL**

**Location:**
- Frontend: `public/gameeditors/item-editor.html` and `item-editor.js`
- Backend: `handlers/itemEditor.js`
- Route: `/items` (accessible via editor navigation)

**Functionality:**
- ✅ **Create Items:** Fully functional via `createItem()` handler
- ✅ **Update Items:** Fully functional via `updateItem()` handler
- ❌ **Delete Items:** Frontend calls `deleteItem` but handler is MISSING
- ✅ **List Items:** Fully functional via `getAllItems()` handler

**Item Type Support:**
- **Frontend Model:** Supports 4 types: `['sundries', 'ingredient', 'rune', 'deed']`
- **Backend Validation:** ✅ **FIXED** - Now supports 4 types: `['sundries', 'ingredient', 'rune', 'deed']`
- **Database:** Accepts any item_type (no restriction in `createItem`)
- **Status:** ✅ Type mismatch resolved - backend now matches frontend

**Access:**
- God mode required (verified in all handlers)
- Registered in `handlers/index.js` as: `createItem`, `updateItem`, `getAllItems`
- UI has "+ New Item" button that works

**Note:** The item editor was NOT lost in editor-core redesign. It's fully functional except for delete operation.

**❌ MISSING UI PATH: Adding Items to Merchants**

**Backend Handlers Exist:**
- ✅ `addItemToMerchant` in `handlers/itemEditor.js` (line 179)
- ✅ `addItemToMerchantRoom` in `handlers/mapEditor.js` (line 1032)
- ✅ `updateMerchantItemConfig` in `handlers/mapEditor.js` (line 1078)
- ✅ `getMerchantInventory` in `handlers/mapEditor.js` (line 1100)

**Frontend UI Missing:**
- ❌ No UI in Item Editor to add items to merchant rooms
- ❌ No UI in Map Editor to manage merchant inventory
- ❌ No way to configure merchant item pricing (price, buyable, sellable) from any editor
- ❌ No way to set stock limits or regeneration from UI

**Workaround:**
- Items can be created in Item Editor
- Merchant items must be added via direct database manipulation or backend API calls
- No user-friendly path exists to connect items to merchants

---

## 5. STATISTICS BY MERCHANT LOCATION

### 5.1 Merchants by Map

| Map Name | Total Merchant Rooms | Rooms with Items | Empty Rooms | Total Items | Buyable | Sellable |
|----------|---------------------|------------------|-------------|-------------|---------|----------|
| Newhaven | 3                   | 1                | 2           | 1           | 1       | 0        |

---

## 6. PRICING ANALYSIS

### 6.1 Price Distribution

- **Minimum Price:** 20 Glimmer Shards
- **Maximum Price:** 20 Glimmer Shards
- **Average Price:** 20 Glimmer Shards
- **Price Range:** 0 (all items same price)

### 6.2 Stock Management

- **Unlimited Stock Items:** 0
- **Limited Stock Items:** 1
- **Items with Regen:** 0

---

## 7. CURRENCY ITEMS (Not in Merchants)

**Note:** Currency items exist in the database but are not sold by merchants (as expected - currency is used to buy items, not sold).

**Currency Items in Database:**
- Glimmer Shard (item_type: currency, encumbrance: 0.5)
- Glimmer Crown (item_type: currency, encumbrance: 3)

**Status:** These are the payment methods, not merchant inventory items.

---

## 8. OBSERVATIONS

### 8.1 Current State

1. **Very Limited Inventory:**
   - Only 1 item currently in merchant system
   - Only 1 of 3 merchant rooms has items configured
   - 2 merchant rooms are completely empty
   - No sellable items configured

2. **Stock Management:**
   - Only limited stock items (no unlimited)
   - No stock regeneration configured
   - Current stock = max stock (1 item)

3. **Pricing:**
   - Single price point (20 shards)
   - No price variation
   - No bulk pricing

4. **Item Types:**
   - Only deed type items
   - No consumables, equipment, or other types

### 8.2 Data Quality Issues

1. **Typos in Database:**
   - "Warhouse" should be "Warehouse"
   - "Warerhouses" should be "Warehouses"
   - Consider fixing these for consistency

2. **Missing Configuration:**
   - No stock regeneration configured
   - No sellable items
   - Limited merchant inventory

---

## 9. RECOMMENDATIONS

### 9.1 Immediate Actions

1. **Populate Empty Merchant Rooms:**
   - Add items to "Job's junk" (currently empty)
   - Add items to "Ron's runes" (currently empty)
   - Consider thematic items for each merchant

2. **Expand Merchant Inventory:**
   - Add more items to existing merchant (Werner's Warerhouses)
   - Include various item types (consumables, equipment, etc.)
   - Configure both buyable and sellable items

2. **Fix Typos:**
   - Correct "Warhouse" → "Warehouse"
   - Correct "Warerhouses" → "Warehouses"

3. **Configure Stock Regeneration:**
   - Set up `regen_hours` for limited stock items
   - Implement regeneration engine

4. **Add Sellable Items:**
   - Configure items that merchants will buy from players
   - Set appropriate buy-back prices

### 9.2 Short-Term Enhancements

1. **Price Variation:**
   - Add items with different price points
   - Create price tiers (cheap, medium, expensive)

2. **Multiple Merchants:**
   - Add more merchant rooms
   - Specialize merchants (weapons, consumables, etc.)

3. **Stock Diversity:**
   - Mix of unlimited and limited stock
   - Some items with regeneration
   - Various quantities

---

## 10. QUERY RESULTS (Raw Data)

### 10.1 All Merchant Items

```json
[
  {
    "merchant_item_id": 1,
    "room_id": 21462,
    "item_id": 3,
    "unlimited": false,
    "max_qty": 1,
    "current_qty": 1,
    "regen_hours": null,
    "price": 20,
    "buyable": true,
    "sellable": false,
    "item_name": "Warhouse Deed",
    "item_description": "A deed to the warhouse",
    "item_type": "deed",
    "encumbrance": 1,
    "room_name": "Werner's Warerhouses",
    "map_id": 1,
    "map_name": "Newhaven"
  }
]
```

### 10.2 Summary Statistics

```json
{
  "unique_items_count": "1",
  "total_merchant_entries": "1",
  "unique_merchant_rooms": "1",
  "buyable_count": "1",
  "sellable_count": "0",
  "unlimited_count": "0",
  "avg_price": "20.0000000000000000",
  "min_price": 20,
  "max_price": 20
}
```

---

## 11. DATABASE QUERIES USED

**Query 1: All Merchant Items with Details**
```sql
SELECT 
    mi.id as merchant_item_id,
    mi.room_id,
    mi.item_id,
    mi.unlimited,
    mi.max_qty,
    mi.current_qty,
    mi.regen_hours,
    mi.price,
    mi.buyable,
    mi.sellable,
    i.name as item_name,
    i.description as item_description,
    i.item_type,
    i.encumbrance,
    r.name as room_name,
    r.map_id,
    m.name as map_name
FROM merchant_items mi
JOIN items i ON mi.item_id = i.id
JOIN rooms r ON mi.room_id = r.id
LEFT JOIN maps m ON r.map_id = m.id
ORDER BY m.name, r.name, i.name
```

**Query 2: Summary Statistics**
```sql
SELECT COUNT(DISTINCT mi.item_id) as unique_items_count,
       COUNT(mi.id) as total_merchant_entries,
       COUNT(DISTINCT mi.room_id) as unique_merchant_rooms,
       SUM(CASE WHEN mi.buyable = true THEN 1 ELSE 0 END) as buyable_count,
       SUM(CASE WHEN mi.sellable = true THEN 1 ELSE 0 END) as sellable_count,
       SUM(CASE WHEN mi.unlimited = true THEN 1 ELSE 0 END) as unlimited_count,
       AVG(mi.price) as avg_price,
       MIN(mi.price) as min_price,
       MAX(mi.price) as max_price
FROM merchant_items mi
```

**Query 3: Items Grouped by Item**
```sql
SELECT 
    i.name as item_name,
    i.item_type,
    COUNT(mi.id) as merchant_count,
    SUM(CASE WHEN mi.buyable = true THEN 1 ELSE 0 END) as buyable_locations,
    SUM(CASE WHEN mi.sellable = true THEN 1 ELSE 0 END) as sellable_locations,
    AVG(mi.price) as avg_price,
    MIN(mi.price) as min_price,
    MAX(mi.price) as max_price,
    SUM(CASE WHEN mi.unlimited = true THEN 1 ELSE 0 END) as unlimited_locations,
    SUM(CASE WHEN mi.unlimited = false THEN 1 ELSE 0 END) as limited_locations
FROM merchant_items mi
JOIN items i ON mi.item_id = i.id
GROUP BY i.id, i.name, i.item_type
ORDER BY merchant_count DESC, i.name
```

**Query 4: Merchants Grouped by Room**
```sql
SELECT 
    r.name as room_name,
    m.name as map_name,
    COUNT(mi.id) as item_count,
    SUM(CASE WHEN mi.buyable = true THEN 1 ELSE 0 END) as buyable_items,
    SUM(CASE WHEN mi.sellable = true THEN 1 ELSE 0 END) as sellable_items,
    AVG(mi.price) as avg_price
FROM merchant_items mi
JOIN rooms r ON mi.room_id = r.id
LEFT JOIN maps m ON r.map_id = m.id
GROUP BY r.id, r.name, m.name
ORDER BY m.name, r.name
```

---

**END OF SUMMARY**

