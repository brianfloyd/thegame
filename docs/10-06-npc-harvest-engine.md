# 12 — NPC Harvest Engine (Canonical Specification)

The NPC Harvest Engine is the **first and foundational NPC interaction loop** in The Game.  
It establishes the full pattern that ALL future NPC engines must follow, including combat, rituals, taming, escort logic, or anything else built later.

This document defines:

- engine structure  
- tick timing  
- formulas  
- success/fail logic  
- Vitalis integration  
- NPC state transitions  
- item production  
- automation behavior  
- message patterns  
- how to extend without conflict  

This engine is **sacrosanct**: future systems must not modify or consume its logic.  
Instead they must **parallel its architecture** and operate within their own namespace.

---

# 🧠 1. Core Purpose

The Harvest Engine enables players to interact with *rhythm NPCs* in timed cycles to extract items (“harvests”), at the cost of Vitalis.  

Key responsibilities:

- Manage timed harvest cycles  
- Calculate success/fail outcomes  
- Apply Vitalis drain  
- Produce items  
- Enforce cooldowns  
- Update NPC state  
- Communicate results to the player and room  
- Hook into automation (auto-harvest loops)  
- Emit structured events to widgets  

This engine is **NOT combat** — it is “rhythm extraction.”  
Future engines (combat, diplomacy, ritual, etc.) must **NOT** reuse harvest-specific formulas or keys.

---

# 🔁 2. High-Level Engine Loop

The engine runs inside the global NPC cycle loop:

```
Every NPC_TICK_INTERVAL (1000ms):
    for each activeNPC:
        - determine if NPC has active harvest state
        - if yes → run harvest cycle
        - if no → evaluate normal NPC cycle rules
```

Cycle checks:

1. Is NPC a harvestable type?  
2. Is player target valid & present?  
3. Has the required time elapsed since last cycle?  
4. Is player Vitalis > 0?  
5. Is NPC in cooldown?  
6. Is automation active (optional)?  

If all criteria pass → perform harvest cycle.

---
## 3 — Timing Model (Canonical)

The timing model governs when a harvest cycle may occur.  
This section defines the **canonical pattern**, while allowing **configurable parameters** through the global formula system (god-mode menus).

Timing consists of three layers:

1. **Base NPC timing**
2. **Stat-based timing modifiers (e.g., Resonance)**
3. **Global and contextual modifiers (buffs, debuffs, room effects, future stats)**

Only the **pattern** is locked. All **numeric values** are configurable.

---

### 3.1 Base Cycle Time (Immutable per NPC)

Each NPC type defines two constants:

```
baseCycleTime     // ms between attempts
cooldownTime      // ms after successful harvest
```

These values are part of NPC design data and should not be modified dynamically unless through an explicit buff/debuff effect.

---

### 3.2 Stat-Based Timing Modifiers (Pattern Locked, Values Configurable)

Resonance (and future stats like Fortitude, Haste, Clarity, etc.) may influence cycle timing.

The **pattern is canonical and must never change**:

```
effectiveCycleTime = baseCycleTime × (1 - timingReductionFactor)
```

Where `timingReductionFactor`:

- MUST always be between **0.0 and 1.0**
- MUST always increase as the player’s relevant stats increase  
- MUST be calculated **after** all additive modifiers are resolved
- MUST never reduce effectiveCycleTime to zero or negative values

The **default implementation** uses Resonance:

```
// Default example (configurable)
timingReductionFactor = map(player.resonance, 0 → 100, 0.0 → 0.75)
```

This is a **placeholder formula**, controlled entirely by the global formula editor.

**Important:**  
Only the *existence* of stat-based scaling is canonical.  
The *specific formula* is configurable, editable, and replaceable through god-mode tools.

---

### 3.3 Multiple Modifier Sources (Future-Proof Pattern)

The timing system must support stacking effects from:

- resonance  
- buffs (e.g., “Pulse Flow”, “Temporal Rhythm”)  
- debuffs  
- room effects  
- consumables  
- NPC-specific auras  
- future stats (e.g., Fortitude reducing Vitalis drain, Haste reducing cycle time)

The canonical pattern for stacking is:

```
timingReductionFactor = clamp(
    resonanceContribution
  + buffContribution
  + debuffContribution
  + roomContribution
  + futureStatContributions,
  0.0,
  maxReductionLimit
)
```

Where:

- `maxReductionLimit` is configurable (default 0.75)  
- the function MUST be clamped (never allow > 1.0)  
- order of operations MUST remain:  
  **baseCycleTime → calculate reduction → apply clamp → compute effectiveCycleTime**

Cursor must not change this flow.

---

### 3.4 Cooldown Timing (Canonical)

Cooldown is always time-based and never modified by resonance or timing buffs **unless explicitly defined by a buff/debuff**.

Rules:

- Cooldown starts immediately after a successful harvest
- Cooldown duration = `npc.cooldownTime`
- Cooldown is independent of cycle time
- Cooldown MUST block harvest attempts, both automated and manual
- Only explicit effects can shorten or extend cooldowns

Automation must respect cooldown silently unless a skip reason is provided.

---

### 3.5 Timing Determinism (Server-Authoritative)

The server controls timing.  
Client or UI elements may display estimated countdowns, but the server decides:

- when cycles resolve  
- when cooldown ends  
- when automation pauses or resumes

This prevents desync and ensures consistent multiplayer behavior.

---

### 3.6 Extending the Timing Model (Future Stats and Systems)

Any new stat-based effect (e.g., Fortitude, Agility, Clarity, etc.) must:

1. Update this section of the doc FIRST  
2. Declare whether it affects:  
   - cycle time  
   - cooldown  
   - Vitalis drain  
   - chance-to-hit  
   - or NEW timing parameters  
3. Be added into the unified timingReductionFactor pattern  
4. Never override the canonical structure

Cursor must never assume new stats modify timing unless this document explicitly states so.

---

### Summary of Canonical Rules

- **Pattern locked:** multiplicative reduction of baseCycleTime  
- **Values configurable:** via formula editor  
- **Multiple modifiers stack but are clamped**  
- **Cooldown unaffected unless defined**  
- **Server authoritative**  
- **Docs updated FIRST before code changes**

This ensures the timing model remains stable, predictable, extensible, and safe across future NPC engines.

---

# 🧮 4. Success / Fail Resolution

Each harvest cycle resolves by formula:

```
chanceToHit = npc.baseHitChance + player.skillModifiers + buffs - debuffs
```

If random roll ≤ chanceToHit → **success**  
Else → **miss**

Misses STILL drain Vitalis (see Section 5).

Success triggers:
- item production  
- Vitalis drain  
- NPC cooldown  

Miss triggers:
- Vitalis drain  
- no item  
- NPC does NOT enter cooldown  

---

# ❤️ 5. Vitalis Integration (Critical System)

Vitalis is the cost mechanism that limits harvesting.

### 5.1 Drain occurs every cycle:
```
vitalis = vitalis - drainAmount
```

### 5.2 Success Example:
```
vitalis_drain_hit
```

### 5.3 Fail Example:
```
vitalis_drain_miss
```

### 5.4 Depletion Zero (hard fail state)

When Vitalis reaches 0:

- Player receives template:
  `vitalis_depleted`
- Room receives:
  `vitalis_unsynced_room`
- Harvest loop immediately halts
- Auto-harvest automation is disabled
- Player must `attune` to resume

This is a **core identity mechanic** and must not be reused for any other NPC system.

---

# 🎁 6. Item Production Rules

On successful harvest:

```
quantity = npc.baseYield × yieldModifiers
```

Yield may be modified by:
- resonance  
- buffs  
- room effects  
- NPC state  

Message emitted:
```
harvest_item_produced
```

---

# 🧊 7. NPC Cooldown Phase

After a successful harvest:

- NPC enters cooldown
- Cooldown timer uses `npc.cooldownTime`
- Template:
  ```
  harvest_cooldown
  ```

During cooldown:
- Harvest attempts auto-fail
- Automation skips with message:
  ```
  auto_harvest_skip_missing_item   (if required item missing)
  ```
or future “cooldown skip” keys.

Cooldown ends automatically after timer expires.

---

# ♻️ 8. Automation Rules (Auto-Harvest Loop)

If player has auto-harvest toggled:

1. Player attempts harvest on eligible NPCs  
2. If NPC fails requirements → skip message  
3. If Vitalis drained to 0 → automation pauses with:
   ```
   loop_paused_vitalis
   ```
4. If NPC enters cooldown → automation re-targets next NPC  
5. Automation never runs faster than the harvest cycle allows  

Automation **must obey the same rules** as manual harvest.

Automation must **NOT** modify the harvest engine logic.

---

# 📣 9. Message Templates Used (By Key)

Harvest engine requires the following message keys:

- `harvest_begin`
- `harvest_miss`
- `harvest_item_produced`
- `harvest_cooldown`
- `vitalis_drain_hit`
- `vitalis_drain_miss`
- `vitalis_depleted`
- `vitalis_unsynced_room`
- `auto_harvest_skip_missing_item`
- `loop_paused_vitalis`
- `pulse_echo_gained`
- `pulse_echo_tier_up`

These keys **must remain part of the engine contract**.

Future NPC systems must define **their own keys**, never reuse harvest keys.

---

# 🧷 10. NPC State Model (Canonical)

NPCs have a canonical state machine for harvesting:

```
IDLE → HARVESTABLE → COOLDOWN → HARVESTABLE
```

Rules:

- Only rhythm NPCs may enter HARVESTABLE  
- NPCs cannot be in multiple NPC engines simultaneously  
- State resets on server restart via database state  
- Engines operate purely on state + timers  

---

# 🧱 11. Extending the Engine (Very Important)

When adding future NPC systems:

### They MUST NOT:
- reuse harvest formulas  
- reuse harvest message keys  
- reuse harvest cycle variables  
- share timing logic  
- mutate harvest NPC states  
- hook into Vitalis unless explicitly defined  

### They MUST:
- create new engine modules  
- define new state machines  
- use the same structural pattern (tick-based loop)  
- isolate message templates  
- isolate item/reward logic  
- isolate cooldown, success, and fail logic  
- define clear namespace, ex:
  - CombatEngine
  - RitualEngine
  - TamingEngine
  - EscortEngine
  - PuzzleEngine

### The Harvest Engine is the pattern —  
**but not the toolbox for all NPC systems.**

Engines run **in parallel**, not interwoven.

---

# 🚫 12. Conflict Prevention (Cursor Rules)

Cursor must obey:

1. **Never modify Harvest Engine unless user explicitly requests.**  
2. **Never merge new NPC systems into this engine.**  
3. **Never reuse harvest data models for other NPC types.**  
4. **Always create new message templates for new systems.**  
5. **Always create new namespaced engine files.**  
6. **Always update the NPC cycle controller to run engines in parallel, not mixed.**  
7. **Never let new engines depend on Vitalis unless defined.**

This ensures stability across all future NPC interactions.

---

# 🏁 End of 12-npc-harvest-engine.md
This engine defines the canonical pattern for NPC interaction loops, timing, rewards, and resource costs.  

Future NPC systems must follow its structure but remain fully isolated in logic, state, messaging, and formulas.
