# 10.14 — **Global Formula Canonical Specification**

> **Purpose:** This document defines *every stat-driven mathematical formula* currently implemented across harvesting, attunement, pulse echoes, factory crafting, factory runes, factory quirks, NPC cycle engine interactions, and movement systems.
>
> These formulas are **global truth** and must be treated as *universal dependencies* for Cursor whenever code is refactored or extended. Any future change to a stat, its scaling, or its usage **requires reviewing this document and updating all dependent formulas.**

---

# 1. Philosophy of the Formula System

### 1.1 What These Are
These formulas are **core systemic math**: they define how Resonance, Fortitude, Ingenuity, and Acumen *mechanically shape the game world*. They determine:
- Harvest speed, hit rate, duration, and Vitalis drain
- Attunement cooldowns, delays, and restore amounts
- Pulse echo yields and progression costs
- Factory crafting success/crit outcomes
- Factory rune speed/efficiency scaling
- Overcharge bonuses
- Movement delays (encumbrance-based)

### 1.2 What These Are Not
These are **NOT buffs**, even though they modify outcomes.
- They are *permanent, stat-driven, always-on* multipliers.
- Buffs are *temporary state modifiers* layered **on top** of these formulas.

**Core rule:**
> **Stats define baseline capability. Buffs modify this baseline temporarily.**

### 1.3 Global Formula Integrity
All systems that reference stats must use these canonical formulas.
Cursor must enforce:
- No duplicate math implementations
- No untracked local variations
- All adjustments made in one place must be reflected game-wide

---

# 2. Core Formula: Exponential Curve Engine

All major stat-driven formulas trace back to:

```
calculateExponentialCurve(stat, config)
```

### 2.1 Behavior
- Clamps stat to configured min/max range
- Normalizes 0 → 1
- Applies exponent curve
- Interpolates between `min_value` and `max_value`

### 2.2 Purpose
This is the universal "stat → effect" transformer used for:
- Harvest speed
- Hit rate
- Harvestable duration
- Vitalis drain reduction
- Attunement cooldown, delay, and restoration
- Pulse echo yield multipliers
- Pulse echo progression curve adjustment

Any new stat-based formula **must use this engine** unless explicitly approved.

---

# 3. Harvest System Formulas

## 3.1 Cycle Time Multiplier — Resonance
```
multiplier = max(0.1, 1 - reduction)
```
Where `reduction = exponential(resonance)`.

Outcome:
- High resonance → faster harvest cycles
- Minimum cycle time = 10% of base

---

## 3.2 Hit Rate — Resonance
```
hitRate = clamp(exponential(resonance), 0, 1)
```
Determines probability of a successful harvest tick.

---

## 3.3 Harvestable Time Multiplier — Fortitude
```
multiplier = 1 + exponential(fortitude)
```
Higher fortitude extends total harvest duration.

---

## 3.4 Vitalis Drain Reduction — Avg(Resonance, Fortitude)
```
avg = (res + fort) / 2
reduction = exponential(avg)
multiplier = clamp(reduction, 0, 1)
```
Applied as: **effectiveDrain = baseDrain * (1 - reduction)**.

---

# 4. Attunement Formulas

Attunement is a **three-formula system**.

## 4.1 Cooldown Reduction — Resonance
```
cooldownMultiplier = max(0.1, 1 - exponential(resonance))
```
Minimum cooldown = 10% of base.

---

## 4.2 Restore Bonus — Fortitude
```
restoreMultiplier = 1 + exponential(fortitude)
```
Determines total Vitalis restored.

---

## 4.3 Delay Reduction — Avg(Resonance, Fortitude)
```
avg = (res + fort) / 2
multiplier = max(0.1, 1 - exponential(avg))
```
Minimum delay = 10% of base.

---

# 5. Pulse Echo Formulas

## 5.1 Yield Formula — Resonance
A combination of **multiplier** and **bonus rate**:
```
yield = baseYield * multiplier * (1 + bonusRate)
```
Both values derive from exponential(resonance).

---

## 5.2 Tier Requirement Curve — Resonance
Controls difficulty curve of pulse echo leveling.
```
curveMultiplier = maxCurve - (bonus * (maxCurve - minCurve))
required = baseCost * tier ^ curveMultiplier
```
Higher resonance → easier progression.

---

# 6. Factory Crafting Formulas

## 6.1 Stat Factor — Ingenuity, Resonance, Acumen
```
statFactor =
 ingenuity * INGEN_SCALE * INGEN_WEIGHT +
 resonance * RES_SCALE * RES_WEIGHT +
 acumen * ACUM_SCALE * ACUM_WEIGHT
```
Weighted: 40/40/20.

---

## 6.2 Success Rate Formula
```
final = baseRate + statFactor + overchargeBonus + quirkModifier
clamped = clamp(final, MIN, MAX)
```
Used for factory crafting item success.

---

## 6.3 Critical Hit Chance — Resonance + Acumen
```
critChance = clamp(
 baseCrit + (res * RES_CRIT_SCALE) + (acu * ACU_CRIT_SCALE),
 0,
 MAX_CRIT
)
```
---

# 7. Rune Modifier Formulas

## 7.1 Speed Rune — Resonance + Rune Tier
```
totalReduction = runeBonus + (res * STAT_SPEED_SCALAR)
apply quirks
clamp to MAX_SPEED_REDUCTION
speedMultiplier = 1 - totalReduction
```

## 7.2 Efficiency Rune — Ingenuity + Rune Tier
```
totalReduction = runeBonus + (ing * STAT_EFF_SCALAR)
clamp to MAX_EFF_REDUCTION
efficiencyMultiplier = 1 - totalReduction
```

---

# 8. Overcharge Threshold Formula
```
excess = playerStat - requiredStat
bonusCount = floor(excess / THRESHOLD_AMOUNT)
overchargeBonus = bonusCount * BONUS_PER_THRESHOLD
```
Applies to success rate calculations.

---

# 9. NPC Engine Harvest Formulas

## 9.1 Cooldown Reduction (Fortitude)
```
effectiveCooldown = baseCooldown * cycleTimeMultiplier(fortitude)
```

## 9.2 Cycle Time (Resonance)
```
effectiveCycleTime = baseCycleTime * cycleTimeMultiplier(resonance)
```

---

# 10. Movement Delay Formula — Encumbrance
```
if >= 66.6%: 1200ms
else if >= 33.3%: 700ms
else: 0ms
```
Not stat-driven but included for completeness.

---

# 11. Stat → System Influence Summary

| Stat        | Affects | Systems |
|-------------|---------|---------|
| **Resonance** | Speed, hit rate, cooldowns, delay, pulse yields, crafting success, crit, rune speed | Harvest, attunement, pulse echoes, crafting, runes |
| **Fortitude** | Harvest duration, drain reduction, restore, delay | Harvest, attunement |
| **Ingenuity** | Crafting success, rune efficiency | Factory |
| **Acumen** | Crafting success, crit chance | Factory |

---

# 12. Canonical Enforcement Rules

1. **All stat-based interactions MUST call these formulas.**
2. No duplicate local math. If a feature needs a variation, extend the formula engine.
3. Buff systems (future): must apply modifiers **after** these formulas unless explicitly temporary.
4. Cursor must treat this file as the **global source of truth**.

---

# 13. TL;DR
This spec defines the **entire numeric backbone** of the game. All mechanics—harvesting, attunement, pulse echoes, crafting, runes—follow these exact formulas. Permanent stats provide the *baseline*. Future buff systems will modify these numbers on top.

This file MUST be updated whenever stat scaling or formulaic balance changes are introduced.