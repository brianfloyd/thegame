# 10.18 — Emoji Reference Guide (Canonical Specification)

**Document Type:** Gameplay Canon (10-XX)  
**Purpose:** Canonical specification for emoji usage in editors and game UI  
**Last Updated:** 2024

---

## 🎯 Current Emoji Usage

### NPC Types (`public/js/models/npc.js`)

| Emoji | Type | Usage |
|-------|------|-------|
| 🌿 | Harvestable | Harvestable NPCs that can be harvested for items |
| 🏪 | Merchant | Merchant NPCs that sell items |
| 📜 | Quest | Quest NPCs (also used for Deed items) |
| ⚔️ | Enemy | Hostile NPCs |
| 😊 | Friendly | Friendly NPCs |
| 😐 | Neutral | Neutral NPCs |

**Note:** The `lorekeeper` NPC type exists but does not currently have an emoji label defined in `NPC_TYPE_LABELS`.

---

### Item Types (`public/js/models/item.js`)

| Emoji | Type | Usage |
|-------|------|-------|
| 📦 | Sundries | Default item type, general items |
| 🧪 | Ingredient | Raw materials used in crafting |
| 💎 | Rune | Magical runes for factory crafting |
| 📜 | Deed | Property deeds (warehouse deeds) |

---

### Rune Types (`public/js/models/item.js`)

| Emoji | Type | Usage |
|-------|------|-------|
| ⚙️ | Production | Production rune (required for factory crafting) |
| ⚡ | Speed | Speed rune (reduces craft time) |
| ✨ | Efficiency | Efficiency rune (reduces ingredient consumption) |

---

## 🎨 Recommended Additional Emoji

Based on the game's theme of **Pulse, Resonance, Vitalis, Attunement, and Mystical Energy**, here are recommended emoji for concepts not yet represented:

### Core Game Mechanics

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 💓 | Vitalis | Life force/energy system |
| 🌊 | Pulse/Pulse Echoes | The world's pulse energy |
| 🔮 | Resonance | Resonance stat or resonance-based mechanics |
| 🧘 | Attunement | Attunement command/state |
| ⚛️ | Energy/Spiritual Energy | General mystical energy concepts |
| 🌟 | Pulse Echo Tier | Tier progression |
| 💫 | Echoes | Pulse Echoes currency |

### NPC Types (Missing)

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 📚 | Lorekeeper | Knowledge-keeping NPCs (currently missing emoji) |
| 🎭 | Puzzle NPC | NPCs that present puzzles |
| 🔮 | Mystic/Mage | Mystical NPC types |
| 🛡️ | Guardian | Protective NPCs |
| 🏛️ | Ancient/Ancient Keeper | Ancient or historical NPCs |

### Item Categories (Potential)

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 🔬 | Material | Refined materials (distinct from raw ingredients) |
| ⚗️ | Potion/Consumable | Consumable items |
| 🗝️ | Key | Key items or quest items |
| 📿 | Artifact | Rare or special items |
| 🎯 | Tool | Utility items |
| 🛠️ | Equipment | Player equipment |
| 🧿 | Charm/Talisman | Protective or enhancement items |

### Factory & Crafting

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 🏭 | Factory | Factory locations or factory-related items |
| 🔨 | Crafting | General crafting operations |
| ⚒️ | Smithing | Metalworking/smithing |
| 🧬 | Recipe | Crafting recipes |
| 🎲 | Success/Failure | Craft success/failure states |
| 💥 | Critical Success | Critical craft results |
| ❌ | Failure | Craft failures |

### Status & States

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| ✅ | Active/Ready | Active state, ready to harvest |
| ⏸️ | Idle | Idle state |
| ⏳ | Cooldown | Cooldown period |
| 🔄 | Harvesting | Currently harvesting |
| ⚠️ | Warning/Prerequisite Missing | Missing prerequisites |
| 🚫 | Blocked/Inactive | Blocked or inactive state |
| 🔒 | Locked | Locked content or features |

### Player Stats & Attributes

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 🧠 | Ingenuity | Ingenuity stat |
| 💪 | Fortitude | Fortitude stat |
| 👁️ | Acumen | Acumen stat |
| 🎯 | Precision | Precision-related stats |
| ⚡ | Haste | Speed-related stats |
| 🛡️ | Defense | Defense-related stats |

### Room Types & Locations

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 🏛️ | Temple/Sacred | Sacred or temple locations |
| 🏭 | Factory Room | Factory rooms |
| 🏪 | Shop/Market | Merchant locations |
| 🏠 | Warehouse | Warehouse locations |
| 🌲 | Forest/Nature | Natural environments |
| 🏔️ | Mountain/Cave | Mountain or cave locations |
| 🌊 | Water/Coast | Water-based locations |

### Puzzle & Lore

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 🧩 | Puzzle | General puzzles |
| 🔤 | Word Puzzle | Word-based puzzles |
| 🔢 | Combination Puzzle | Number/combination puzzles |
| 🔐 | Cipher | Cipher puzzles |
| 📖 | Lore/Knowledge | Lore entries or knowledge |
| 💬 | Dialogue | Dialogue interactions |
| 🎭 | Story/Narrative | Narrative elements |

### Automation & Systems

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 🤖 | Automation | Automation programs |
| 🔁 | Loop | Automation loops |
| ⏸️ | Paused | Paused automation |
| ▶️ | Running | Active automation |
| ⏹️ | Stopped | Stopped automation |

### Messages & Communication

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| 📢 | Broadcast | Broadcast messages |
| 💭 | Telepath | Telepathic communication |
| 🗣️ | Talk | Talk command |
| 📨 | Message | General messages |

### Special Effects & Events

| Emoji | Recommended Use | Context |
|-------|---------------|---------|
| ✨ | Success/Bonus | Success states, bonuses |
| 💫 | Special Effect | Special effects or events |
| 🌈 | Rare/Epic | Rare or epic items/events |
| ⭐ | Achievement | Achievements or milestones |
| 🎉 | Celebration | Celebration events |

---

## 🎯 Implementation Requirements

### High Priority (Missing from Current System)

1. **📚 Lorekeeper** - MUST be added to `NPC_TYPE_LABELS` for `lorekeeper` type in `public/js/models/npc.js`
2. **💓 Vitalis** - SHOULD be used in Vitalis-related UI elements
3. **🌊 Pulse Echoes** - SHOULD be used in Pulse Echo display/UI
4. **🧘 Attunement** - SHOULD be used in attunement command/status displays
5. **🔮 Resonance** - SHOULD be used in Resonance stat displays

### Medium Priority (Enhance Existing)

1. **Status States** - SHOULD add emoji to harvest status messages:
   - ✅ Ready
   - ⏳ Cooldown
   - 🔄 Harvesting
   - ⏸️ Idle

2. **Factory States** - SHOULD add emoji to factory crafting states:
   - 🏭 Factory
   - ⚙️ Production
   - 💥 Critical
   - ❌ Failure

### Low Priority (Future Expansion)

1. **Room Type Icons** - MAY consider emoji for room type visualization
2. **Item Category Refinement** - MAY expand item type emoji as new categories are added
3. **Player Stat Icons** - MAY add emoji to stat displays for visual clarity

---

## 📝 Canonical Rules

- **Consistency:** All emoji MUST be used consistently across editors and game UI
- **Accessibility:** Emoji MUST be readable and distinguishable
- **Theme Alignment:** All emoji MUST align with the mystical/pulse/resonance theme
- **Avoid Duplication:** The 📜 emoji is currently used for both Quest NPCs and Deed items - consider differentiating if needed
- **Source of Truth:** Emoji definitions are defined in:
  - **NPC Type Labels:** `public/js/models/npc.js` → `NPC_TYPE_LABELS`
  - **Item Type Labels:** `public/js/models/item.js` → `ITEM_TYPE_LABELS`
  - **Rune Type Labels:** `public/js/models/item.js` → `RUNE_TYPE_LABELS`

---

## 🎨 Theme Summary

The game's core theme revolves around:
- **Pulse/Resonance** - The world's energy flow
- **Vitalis** - Life force/spiritual energy
- **Attunement** - Connection to the pulse
- **Harvesting** - Extracting resources from rhythm creatures
- **Crafting** - Factory-based item creation with runes
- **Lore** - Knowledge and puzzle-solving

All emoji MUST enhance these themes while maintaining visual clarity and consistency.

---

**END OF CANONICAL SPECIFICATION**




