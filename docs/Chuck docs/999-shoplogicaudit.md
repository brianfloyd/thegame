# 999 — Shop, Economics & Currency System Audit

**Document Type:** Analysis & Planning Reference  
**Date:** Based on codebase audit  
**Purpose:** Comprehensive audit of shop, merchant, currency, and economic systems for planning and enhancement consideration

---

## 1. CURRENT IMPLEMENTATION OVERVIEW

### 1.1 Merchant System

**Database Schema:**
- **Table:** `merchant_items` (Migration 015, 016)
- **Fields:**
  - `id` SERIAL PRIMARY KEY
  - `item_id` INTEGER REFERENCES items(id)
  - `room_id` INTEGER REFERENCES rooms(id)
  - `unlimited` BOOLEAN DEFAULT TRUE
  - `max_qty` INTEGER (nullable)
  - `current_qty` INTEGER DEFAULT 0
  - `regen_hours` NUMERIC (nullable)
  - `last_regen_time` BIGINT (nullable)
  - `price` INTEGER DEFAULT 0 (Migration 016)
  - `buyable` BOOLEAN DEFAULT TRUE (Migration 016)
  - `sellable` BOOLEAN DEFAULT FALSE (Migration 016)
  - `config_json` JSONB (Migration 016, converted from TEXT in Migration 073)
  - `created_at` BIGINT

**Constraints:**
- UNIQUE(`item_id`, `room_id`) - One item per room
- Only merchant-type rooms can have merchant items (application-level enforcement)

**Evidence:**
- `migrations/015_merchant_items_system.sql`
- `migrations/016_merchant_pricing_fields.sql`
- `migrations/073_convert_text_json_to_jsonb.sql` (converted config_json to JSONB)

---

### 1.2 Currency System

**Currency Items:**
- **Glimmer Shard** (base unit)
  - Encumbrance: 0.5
  - Item type: `currency`
  - Description: "A faintly glowing fragment of crystallized essence."
  
- **Glimmer Crown** (large denomination)
  - Encumbrance: 3
  - Item type: `currency`
  - Description: "A radiant coin forged from pure Glimmer essence."
  - Conversion: 100 Shards = 1 Crown

**Evidence:**
- `migrations/018_currency_items.sql`

**Storage:**
- Currency stored as **items in player inventory** (not separate currency table)
- Bank storage available via `player_bank` table (no encumbrance)
- Auto-conversion system converts between Shards and Crowns optimally

**Currency Functions:**
- `getPlayerCurrency(playerId)` - Get currency from inventory
- `addPlayerCurrency(playerId, totalShardsToAdd)` - Add currency with auto-conversion
- `removePlayerCurrency(playerId, totalShardsNeeded)` - Remove currency with auto-conversion
- `convertCurrencyToOptimal(shards)` - Convert shards to optimal Crown/Shard mix

**Evidence:**
- `database.js:2801-2852`

---

### 1.3 Bank System

**Database Schema:**
- **Table:** `player_bank` (Migration 019)
- **Fields:**
  - `id` SERIAL PRIMARY KEY
  - `player_id` INTEGER REFERENCES players(id) ON DELETE CASCADE
  - `currency_name` TEXT NOT NULL
  - `quantity` INTEGER DEFAULT 0
  - `created_at` BIGINT
  - `updated_at` BIGINT

**Constraints:**
- UNIQUE(`player_id`, `currency_name`)

**Features:**
- Currency storage without encumbrance
- Auto-conversion between Shards and Crowns
- Deposit/withdraw commands (bank room type)

**Evidence:**
- `migrations/019_player_bank.sql`
- `database.js:2652-2796`

---

### 1.4 Buy/Sell Commands

**Buy Command:**
- **Location:** `handlers/game.js:5363-5477`
- **Requirements:**
  - Must be in merchant room (`room_type === 'merchant'`)
  - Item must exist in merchant inventory
  - Item must have `buyable = TRUE`
  - Sufficient stock (if not unlimited)
  - Player must have enough currency
- **Process:**
  1. Validate room type
  2. Find item by partial name match
  3. Check merchant has item (`merchant_items` table)
  4. Check buyable flag
  5. Check stock availability
  6. Calculate total price (`price * quantity`)
  7. Check player currency
  8. Remove currency from player (auto-conversion)
  9. Add item to player inventory
  10. Update merchant stock (if not unlimited)

**Sell Command:**
- **Location:** `handlers/game.js:5482-5587`
- **Requirements:**
  - Must be in merchant room
  - Player must have item in inventory
  - Merchant must have item in `merchant_items` with `sellable = TRUE`
  - Merchant must have `price > 0`
- **Process:**
  1. Validate room type
  2. Find item in player inventory (partial name match)
  3. Check player has sufficient quantity
  4. Check merchant buys item (`sellable = TRUE`)
  5. Calculate payment (`price * quantity`)
  6. Remove item from player inventory
  7. Add currency to player (auto-conversion)
  8. Update merchant stock (if not unlimited, adds to stock)

**List Command:**
- **Location:** `handlers/game.js:4791-4825`
- **Function:** Lists all buyable items in merchant room
- **Returns:** `merchantList` message with items and prices

---

### 1.5 Merchant Item Editor

**Location:** `handlers/itemEditor.js:157-246`

**Functions:**
- `getMerchantItems(itemId)` - Get all merchant rooms selling an item
- `addItemToMerchant(itemId, roomId, ...)` - Add item to merchant room
- `updateMerchantItem(merchantItemId, ...)` - Update merchant item config
- `removeItemFromMerchant(merchantItemId)` - Remove item from merchant

**Default Configuration:**
```javascript
{
  unlimited: true,
  max_qty: null,
  current_qty: 0,
  regen_hours: null,
  buyable: true,
  sellable: false,
  price: 0
}
```

**Note:** Configuration managed via Map Editor (god mode only)

---

## 2. SYSTEM STRENGTHS

### 2.1 Architecture Strengths

1. **Clean Database Design:**
   - Proper foreign key relationships
   - UNIQUE constraints prevent duplicate entries
   - JSONB config field allows flexible extensions
   - Separate bank storage prevents encumbrance issues

2. **Auto-Conversion System:**
   - Automatic conversion between Shards and Crowns
   - Optimal format (minimizes encumbrance)
   - Transparent to players
   - Works for both inventory and bank

3. **Flexible Merchant Configuration:**
   - Per-item, per-room pricing
   - Buyable/sellable flags allow one-way transactions
   - Unlimited vs limited stock
   - Stock regeneration support (regen_hours field exists but not implemented)

4. **Room-Based System:**
   - Clear separation: merchant rooms vs normal rooms
   - Easy to identify where commerce happens
   - Supports multiple merchants with different inventories

5. **Currency as Items:**
   - Currency can be dropped, traded (if trading existed)
   - Physical representation in world
   - Encumbrance creates meaningful decisions

---

### 2.2 Implementation Strengths

1. **Partial Name Matching:**
   - Players can use partial item names
   - Handles ambiguity with error messages
   - User-friendly

2. **Stock Management:**
   - Unlimited vs limited stock
   - Current quantity tracking
   - Stock updates on buy/sell

3. **Error Handling:**
   - Clear error messages
   - Validates all conditions before transaction
   - Prevents invalid transactions

4. **Bank Integration:**
   - Separate storage for currency
   - No encumbrance in bank
   - Deposit/withdraw commands

---

## 3. SYSTEM WEAKNESSES & GAPS

### 3.1 Missing Core Features

1. **No Player-to-Player Trading:**
   - No trade system between players
   - No escrow system
   - No player shops/marketplaces
   - Currency can't be directly transferred between players

2. **No Dynamic Pricing:**
   - Prices are static (set by god mode)
   - No supply/demand mechanics
   - No price fluctuations
   - No regional pricing differences

3. **No Market/Auction System:**
   - No auction house
   - No bidding system
   - No market orders (buy/sell orders)
   - No price history tracking

4. **No Bulk Pricing:**
   - No quantity discounts
   - No "buy 10 get 1 free" mechanics
   - Linear pricing only

5. **No Item Condition/Quality:**
   - All items of same type have same price
   - No quality tiers affecting value
   - No durability affecting sell price

6. **No Merchant Reputation/Relationships:**
   - No relationship system with merchants
   - No reputation affecting prices
   - No loyalty discounts
   - No merchant-specific quests affecting prices

7. **No Stock Regeneration:**
   - `regen_hours` field exists but not implemented
   - No automatic restocking
   - No time-based availability

8. **No Price Appraisal:**
   - No way to check item value before selling
   - No "appraise" command
   - No price comparison between merchants

9. **No Economic Mechanics:**
   - No inflation/deflation
   - No currency sinks (except buying items)
   - No currency generation (except selling items)
   - No economic events

10. **No Currency Exchange:**
    - Only one currency system (Glimmer Shard/Crown)
    - No multiple currencies
    - No exchange rates

---

### 3.2 Implementation Gaps

1. **Incomplete Stock Regeneration:**
   - Field exists (`regen_hours`, `last_regen_time`) but no engine
   - No periodic restocking system
   - No time-based availability

2. **No Price History:**
   - No tracking of price changes
   - No historical data
   - No price trends

3. **No Transaction Logging:**
   - No audit trail of purchases/sales
   - No transaction history for players
   - No merchant transaction logs

4. **Limited Config JSON Usage:**
   - `config_json` field exists but minimally used
   - Could store: bulk pricing, time-based prices, player-specific prices

5. **No Merchant NPCs:**
   - Merchants are room-based, not NPC-based
   - No merchant personalities
   - No merchant dialogue affecting prices

6. **No Item Categories:**
   - No category-based pricing
   - No "weapons cost more" mechanics
   - No rarity affecting base price

7. **No Player Shops:**
   - Players can't set up their own shops
   - No player-owned merchant rooms
   - No consignment system

---

### 3.3 User Experience Gaps

1. **No UI for Shopping:**
   - All commands are terminal-based
   - No visual shop interface
   - No shopping cart
   - No "browse" mode

2. **No Price Display in Inventory:**
   - Players don't see item values
   - No "estimated value" in item descriptions
   - No quick sell interface

3. **No Comparison Shopping:**
   - Can't compare prices across merchants
   - No "find cheapest" command
   - No merchant directory

4. **No Wishlist/Shopping List:**
   - Can't save items to buy later
   - No price alerts
   - No "notify when in stock"

---

## 4. DATABASE SCHEMA ANALYSIS

### 4.1 Current Tables

**merchant_items:**
- Well-designed with proper relationships
- Supports unlimited and limited stock
- Has pricing and buyable/sellable flags
- JSONB config allows future extensions

**player_bank:**
- Simple currency storage
- Auto-conversion handled in application layer
- No encumbrance (as intended)

**items:**
- Currency items properly marked with `item_type = 'currency'`
- Encumbrance values set appropriately

---

### 4.2 Missing Tables (Potential)

1. **transaction_log:**
   - Track all buy/sell transactions
   - Fields: player_id, merchant_room_id, item_id, quantity, price, type (buy/sell), timestamp

2. **price_history:**
   - Track price changes over time
   - Fields: merchant_item_id, price, timestamp, changed_by (player_id or system)

3. **player_merchant_reputation:**
   - Track player relationships with merchants
   - Fields: player_id, merchant_room_id, reputation_score, transactions_count, last_transaction

4. **player_shops:**
   - Player-owned shops
   - Fields: player_id, room_id, shop_name, is_active, created_at

5. **market_orders:**
   - Buy/sell orders (auction house style)
   - Fields: player_id, item_id, quantity, price_per_unit, order_type (buy/sell), expires_at, status

6. **trade_offers:**
   - Player-to-player trades
   - Fields: offerer_id, target_id, offer_items, request_items, status, expires_at

---

## 5. CODE ANALYSIS

### 5.1 Buy/Sell Implementation

**Strengths:**
- Clean validation flow
- Proper error handling
- Currency auto-conversion works well
- Stock management is correct

**Weaknesses:**
- No transaction logging
- No price history
- No bulk pricing logic
- No player reputation checks
- No dynamic pricing calculations

---

### 5.2 Currency System

**Strengths:**
- Auto-conversion is elegant
- Optimal format minimizes encumbrance
- Works consistently across inventory and bank

**Weaknesses:**
- Only one currency type
- No currency sinks beyond buying
- No currency generation beyond selling
- No economic balancing

---

### 5.3 Merchant Editor

**Strengths:**
- God mode only (proper security)
- Flexible configuration
- JSONB allows extensions

**Weaknesses:**
- No bulk operations
- No price templates
- No import/export
- No validation of price ranges

---

## 6. FUTURE ENHANCEMENT IDEAS

### 6.1 High Priority Enhancements

1. **Stock Regeneration Engine:**
   - Implement `regen_hours` functionality
   - Periodic job to restock merchants
   - Time-based availability windows

2. **Transaction Logging:**
   - Log all buy/sell transactions
   - Player transaction history
   - Merchant sales reports

3. **Price Appraisal System:**
   - `appraise <item>` command
   - Shows value at current merchant
   - Compare prices across merchants

4. **Bulk Pricing:**
   - Quantity discounts
   - "Buy 10 get 1 free"
   - Configurable in `config_json`

5. **Player-to-Player Trading:**
   - Trade command
   - Escrow system
   - Trade confirmation

---

### 6.2 Medium Priority Enhancements

1. **Merchant Reputation System:**
   - Track player-merchant relationships
   - Reputation affects prices
   - Loyalty discounts

2. **Dynamic Pricing:**
   - Supply/demand mechanics
   - Price fluctuations
   - Regional pricing differences

3. **Merchant NPCs:**
   - NPC-based merchants (not just rooms)
   - Merchant personalities
   - Dialogue affecting prices

4. **Shopping UI Widget:**
   - Visual shop interface
   - Shopping cart
   - Browse mode

5. **Price History:**
   - Track price changes
   - Price trends
   - Historical data

---

### 6.3 Low Priority / Advanced Features

1. **Auction House:**
   - Player-to-player auctions
   - Bidding system
   - Time-limited auctions

2. **Player Shops:**
   - Player-owned merchant rooms
   - Consignment system
   - Shop management UI

3. **Market Orders:**
   - Buy/sell orders
   - Order matching
   - Price discovery

4. **Multiple Currencies:**
   - Regional currencies
   - Exchange rates
   - Currency conversion

5. **Economic Events:**
   - Inflation/deflation
   - Market crashes
   - Economic quests

6. **Item Quality System:**
   - Quality tiers affecting price
   - Durability affecting sell price
   - Enchantment value

7. **Merchant Quests:**
   - Quest completion affects prices
   - Special merchant inventory
   - Unlockable merchants

8. **Price Comparison Tools:**
   - "Find cheapest" command
   - Merchant directory
   - Price alerts

---

## 7. INTEGRATION POINTS

### 7.1 Existing Systems

**NPC Harvest System:**
- Items harvested can be sold
- No direct integration (items go to inventory first)

**Factory System:**
- Crafted items can be sold
- No direct merchant integration

**Warehouse System:**
- Currency can be stored in bank
- No warehouse-to-merchant integration

**Automation Widget:**
- Reference to "Auto-Sell" feature (locked, requires Commerce 10+)
- Not yet implemented

---

### 7.2 Potential Integrations

1. **Automation Widget:**
   - Auto-sell harvested items
   - Auto-buy consumables
   - Price threshold settings

2. **Factory System:**
   - Direct merchant integration
   - Bulk selling crafted items
   - Merchant orders for crafting

3. **Quest System:**
   - Merchant quests affect prices
   - Quest rewards include merchant discounts
   - Special merchant inventory unlocks

4. **Player Stats:**
   - Acumen stat affects prices (mentioned in canon)
   - Not yet implemented in buy/sell logic

---

## 8. CANON REFERENCES

### 8.1 Relevant Canon Documents

**Database Schema Canon:**
- `docs/20-04-database-schema-canonical-spec.md`
  - Section 2.6: Merchant System Tables
  - Section 2.3: Player Tables (player_bank)

**Commands Canon:**
- `docs/10-04-commands.md`
  - Section 7.3: Merchant commands (buy, sell, list)

**Player Architecture:**
- `docs/10-01-player-architecture.md`
  - Currency system mentioned
  - No detailed economics documentation

**Automation Widget:**
- `docs/Chuck docs/999-automation-widget-analysis-and-improvements.md`
  - Mentions "Auto-Sell" feature (locked, Commerce 10+)

---

### 8.2 Missing Canon

**No Economics Canon:**
- No document defining economic principles
- No inflation/deflation rules
- No currency generation/sink rules
- No pricing guidelines

**No Trading Canon:**
- No player-to-player trading rules
- No escrow system documentation
- No market mechanics

---

## 9. RECOMMENDATIONS

### 9.1 Immediate Actions

1. **Implement Stock Regeneration:**
   - Use existing `regen_hours` and `last_regen_time` fields
   - Create periodic job to check and restock
   - Low-hanging fruit, field already exists

2. **Add Transaction Logging:**
   - Create `transaction_log` table
   - Log all buy/sell transactions
   - Enables future analytics

3. **Implement Price Appraisal:**
   - `appraise <item>` command
   - Shows current merchant price
   - Simple addition to existing code

4. **Add Acumen Stat Integration:**
   - Canon mentions Acumen affects merchant interactions
   - Not yet implemented
   - Should affect buy/sell prices

---

### 9.2 Short-Term Enhancements

1. **Bulk Pricing System:**
   - Use `config_json` for bulk pricing rules
   - Quantity discounts
   - Easy to add to existing system

2. **Player Transaction History:**
   - Query `transaction_log` for player
   - Show recent purchases/sales
   - Useful for players

3. **Merchant Comparison:**
   - "compare <item>" command
   - Shows prices at all merchants
   - Requires querying multiple rooms

---

### 9.3 Long-Term Vision

1. **Player-to-Player Trading:**
   - Core feature for multiplayer economy
   - Requires escrow system
   - Significant development

2. **Dynamic Pricing:**
   - Supply/demand mechanics
   - Price fluctuations
   - Economic simulation

3. **Auction House:**
   - Player-to-player marketplace
   - Bidding system
   - Price discovery

---

## 10. RISKS & CONSIDERATIONS

### 10.1 Economic Balance

**Currency Generation:**
- Currently: Selling items generates currency
- Risk: Inflation if generation > sinks
- Need: Currency sinks (repairs, fees, taxes)

**Currency Sinks:**
- Currently: Buying items only
- Risk: Currency accumulation
- Need: Additional sinks (repairs, taxes, fees)

**Price Stability:**
- Currently: Static prices
- Risk: No market forces
- Need: Dynamic pricing or manual balancing

---

### 10.2 Technical Risks

**Performance:**
- Transaction logging could be high-volume
- Need: Efficient indexing
- Need: Archival strategy

**Data Integrity:**
- Currency auto-conversion must be atomic
- Stock updates must be atomic
- Need: Transaction support

**Scalability:**
- Multiple merchants querying
- Price comparison across many merchants
- Need: Efficient queries

---

### 10.3 Gameplay Risks

**Player Experience:**
- Terminal-only interface may be limiting
- Need: UI improvements
- Need: Better feedback

**Economic Exploitation:**
- No safeguards against price manipulation
- No anti-cheat for currency
- Need: Validation and logging

**Content Gating:**
- Expensive items may gate content
- Need: Multiple acquisition paths
- Need: Economic balance testing

---

## 11. SUMMARY

### 11.1 Current State

**Implemented:**
- ✅ Merchant room system
- ✅ Buy/sell commands
- ✅ Currency system (Glimmer Shard/Crown)
- ✅ Bank system
- ✅ Stock management (unlimited/limited)
- ✅ Auto-conversion system
- ✅ Merchant item editor (god mode)

**Partially Implemented:**
- ⚠️ Stock regeneration (fields exist, not implemented)
- ⚠️ Config JSON (exists, minimally used)
- ⚠️ Acumen stat integration (mentioned, not implemented)

**Not Implemented:**
- ❌ Player-to-player trading
- ❌ Dynamic pricing
- ❌ Auction house
- ❌ Transaction logging
- ❌ Price history
- ❌ Merchant reputation
- ❌ Bulk pricing
- ❌ Stock regeneration engine
- ❌ Price appraisal
- ❌ Shopping UI

---

### 11.2 Strengths

1. Clean database design
2. Flexible configuration system
3. Auto-conversion works well
4. Proper validation and error handling
5. Room-based system is clear

---

### 11.3 Weaknesses

1. No player-to-player trading
2. Static pricing
3. No economic mechanics
4. Incomplete features (stock regen)
5. Limited UI (terminal only)
6. No transaction history
7. No price comparison tools

---

### 11.4 Priority Recommendations

**High Priority:**
1. Implement stock regeneration (fields exist)
2. Add transaction logging
3. Implement price appraisal
4. Add Acumen stat integration

**Medium Priority:**
1. Bulk pricing system
2. Merchant reputation
3. Shopping UI widget
4. Price comparison tools

**Low Priority:**
1. Player-to-player trading
2. Auction house
3. Dynamic pricing
4. Multiple currencies

---

**END OF AUDIT**




