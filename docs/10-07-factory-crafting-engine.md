# 14 — Factory Crafting Engine (Canonical Specification)

The Factory Crafting Engine is the second major player-interactive system in The Game.  
Where the NPC Harvest Engine handles rhythmic extraction, the Factory Engine handles **deterministic, recipe-based item transformation** driven by player stats, room quirks, runes, and machine constraints.

This document defines:

- Slot system (semantic fixed slots)
- Rune system (production, speed, efficiency)
- Recipe matching rules
- Crafting formulas (success, crit, speed, efficiency)
- Stat contributions (Ingenuity, Resonance, Acumen)
- Overcharge rules
- Quirk interactions
- Output routing
- WebSocket message protocols
- State management rules
- Extension and conflict-prevention patterns

The Factory Engine is isolated from the NPC Harvest Engine.  
It may **never** reuse harvest logic, Vitalis systems, timing models, or message templates.

---

# 🧱 1. Core Purpose

The Factory engine performs deterministic crafting operations using:

- **Ingredients** (consumable)
- **Runes** (persistent modifiers)
- **Player stats** (skill-based progression)
- **Room quirks** (environment modifiers)
- **Recipe definitions** (canonical crafting rules)

Crafting is a multi-step calculation that determines:

1. Whether the recipe matches  
2. Success rate  
3. Critical chance  
4. Craft time  
5. Output quantity  
6. Byproducts  
7. Ingredient consumption  

Factories represent an **endgame transformation system** parallel to harvesting.

---

# 🧩 2. Slot System (Canonical, Immutable)

Factories have **five fixed semantic slots**:

| Slot | Purpose | Allowed Items | Consumed? | Notes |
|------|----------|----------------|-----------|-------|
| 0 | Ingredient A | ingredient | Yes | Stackable |
| 1 | Ingredient B | ingredient | Yes | Stackable |
| 2 | Production Rune | rune (PRODUCTION) | No | Machine requirement |
| 3 | Speed Rune | rune (SPEED) | No | Optional |
| 4 | Efficiency Rune | rune (EFFICIENCY) | No | Optional |

### Slot rules:

- No cross-slot flexibility  
- Server validates every placement  
- Slots 0–1 accept only consumable ingredients  
- Slot 2 must contain a PRODUCTION rune or crafting is impossible  
- Slots 3–4 modify time/efficiency but do not unlock recipes  

Runes persist indefinitely unless destroyed by special future mechanics.

---

# 🧪 3. Recipe Matching System (Canonical)

Recipes contain:

```
required_ingredients: [{ item_name, quantity }]
required_runes: ["SPEED", "EFFICIENCY"]  // never includes "PRODUCTION"
required_stats: { ingenuity: x, resonance: y, acumen: z }
factory_tier_required: n
```

### Matching workflow:

1. Verify room tier ≥ recipe tier  
2. Verify ingredients match (after efficiency modifier)  
3. Verify SPEED/EFFICIENCY runes if required  
4. Verify stat requirements (Ingenuity, Resonance, Acumen)  
5. Ignore PRODUCTION rune — it is validated separately  
6. Return first matching recipe  

### Important:

- Recipes **never** specify Production runes  
- Ingredient quantity is adjusted using efficiency formula before matching  
- Rune presence can fail matching (missing required SPEED/EFFICIENCY rune)

---

# ⚙️ 4. Craft Execution Pipeline (Canonical)

When `factoryCraft` is triggered:

1. **Validate player is in factory room**  
2. **Validate slot 2 contains PRODUCTION rune**  
3. **Match recipe**  
4. **Compute crafting formulas:**  
   - success rate  
   - crit chance  
   - craft time  
   - efficiency modifier  
5. **Roll random outcomes**  
6. **Generate outputs & byproducts**  
7. **Consume ingredients**  
8. **Emit results & send state update**

---

# 🔢 5. Crafting Formulas (Canonical Pattern)

These formulas represent remembered patterns from our early game design sessions.  
Values are placeholders and **fully configurable via the global formula system**.

---

## 5.1 Success Rate Formula

```
finalSuccessRate =
      recipe.baseSuccessRate
    + ingenuityContribution
    + resonanceContribution
    + acumenContribution
    + overchargeBonus
    + quirkModifier
```

### Default contributions (configurable):

```
ingenuityContribution = ingenuity * 0.20     // crafting mastery
resonanceContribution = resonance * 0.20      // stability control
acumenContribution    = acumen * 0.06         // precision-based micro-optimizations
```

### Clamped:

```
finalSuccessRate = clamp(finalSuccessRate, 5%, 95%)
```

---

## 5.2 Critical Chance Formula

```
critChance =
      5%
    + resonance * 0.02%
    + acumen * 0.015%
```

Clamped:

```
critChance ≤ 25%
```

Critical crafts multiply output by default factor:

```
critMultiplier = 1.5x    // config
```

---

## 5.3 Craft Time Formula

```
finalTime =
      recipe.baseTime
    × speedRuneModifier
    × resonanceTimeModifier
    × quirkSpeedModifier
```

### Default resonance time modifier:

```
resonanceTimeModifier = 1 - (resonance * 0.01)
min = 0.30              // 70% max reduction
```

### Speed rune bonus (configurable standalone):

```
speedRuneModifier = 1 - (speedRuneBonus * 0.20)
```

All time values must be:

```
finalTime ≥ 1000 ms
```

---

## 5.4 Efficiency Formula (Ingredient Reduction)

```
efficiencyModifier =
      1.0
    - (efficiencyRuneBonus * 0.15)
    - (ingenuity * 0.01)
```

Clamped:

```
efficiencyModifier ≥ 0.50
```

Ingredients required for matching:

```
adjustedIngredientQuantity = ceil(baseQuantity × efficiencyModifier)
```

---

## 5.5 Overcharge Bonus (Stat Exceed Thresholds)

When player stats exceed recipe requirements:

```
Every +5 points over requirement → +2% success bonus
```

Example:

```
requirement: ingenuity 10
player: ingenuity 20
overchargeBonus = +4%
```

---

# ⚡ 6. Factory Quirk System (Canonical)

Factories read quirk data from:

```
rooms.factory_quirks JSONB
```

Quirk types:

### **stable**
- +10% success rate  
- -15% speed (slower)  
- green UI indicator  

### **chaotic**
- -10% success rate  
- +20% speed (faster)  
- red UI indicator  

### **attuned**
- 2× rune effectiveness  
- purple indicator  

### **worn**
- 10% chance to halve output on craft  
- brown indicator  

Quirks affect:

- success rate  
- craft time  
- output quantity  

---

# 🔁 7. Output Routing (Canonical)

Routing occurs **after success or failure**.

### Order:

1. If player disconnected or moved → all items go to floor  
2. Else → check inventory encumbrance  
3. Attempt to place items into inventory  
4. Overflow goes to floor  
5. Event emitted for UI/automation updates  

Events:

- `factory_craft_started`
- `factory_craft_success`
- `factory_craft_failed`
- `factory_craft_fizzle`
- `factory_output_created`

---

# 🧩 8. State Management (Server Canon)

Factory widget state is per-connection, not persistent:

```
factoryWidgetState: Map<connectionId, {
    roomId,
    slots: [slot0, slot1, slot2, slot3, slot4]
}>
```

State resets when:

- player leaves factory room  
- disconnects  
- server restarts  

---

# 🔌 9. WebSocket Messaging Contract

### Client → Server

- `factoryWidgetAddItem`
- `factoryWidgetRemoveItem`
- `factoryCraft`

### Server → Client

- `factoryWidgetState`
- `factoryCraftStarted`
- `factoryCraftComplete`
- `factoryCraftFizzle`

Cursor must never rename or overload these messages.

---

# 🧱 10. Extension Rules (Critical)

Future systems MUST NOT:

- reuse harvest engine timing models  
- use Vitalis in crafting (unless explicitly added later)  
- repurpose rune slots  
- merge factory and NPC engines  
- use harvest message templates  

Future systems MUST:

- follow this architectural pattern  
- define new slots/runes in separate namespaces  
- define their own formulas & messages  
- document new stat interactions  

---

# 🏁 End of 14-factory-crafting-engine.md
