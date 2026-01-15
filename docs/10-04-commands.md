# 10 — Command System (Canonical Specification)

This document defines the **canonical grammar, categories, normalization rules, and nuances** of all player commands within The Game.  
It is intentionally pattern-based rather than a raw command list, ensuring future commands follow the same structure.

---

# 🎮 1. What a Command Is

A **command** is a text instruction from the player:

```
<verb> [arguments]
```

Examples:
```
go north
take 5 pulse resin
sell all resin
harvest rat
solve riddlekeeper "moon"
talk hello everyone
```

Commands may include:
- synonyms  
- abbreviations  
- quantity specifications  
- partial-name matches  
- multi-word arguments  

---

# 🧩 2. Command Lifecycle

```
raw input
→ sanitize (lowercase, collapse whitespace)
→ normalize (synonym expansion & ambiguity resolution)
→ parse verb + arguments
→ route to handler
→ execute
→ return response
```

---

# 🔤 3. Normalization Rules

### 3.1 Lowercase everything  
```
"Take Resin" → "take resin"
```

### 3.2 Collapse whitespace  
```
"go    north" → "go north"
```

### 3.3 Synonym expansion  
Examples:
```
n → north
s → south (unless quantity/item follows → sell)
w → west (unless quantity/item follows → withdraw)
t, get, pickup → take
l → look
i, inv → inventory
b → buy
```

### 3.4 Multi-word verbs  
The parser detects these before defaulting to single words:
```
harvest start
factory build
factory queue
pulse echo
telepath <target> <msg>
```

### 3.5 Ambiguity resolution (“dual-use” letters)  

Some single-letter commands mean different things depending on context:

| Letter | Meaning when ALONE | Meaning when FOLLOWED by item/qty |
|--------|---------------------|------------------------------------|
| **s**  | `south`             | `sell`                             |
| **w**  | `west`              | `withdraw`                         |
| **a**  | `attune`            | still `attune` (args ignored)      |

This behavior is canonical.

---

# 🧭 4. Movement Commands

Movement accepts:
- canonical direction words  
- short forms  
- numpad direction keys (0–9)

### 4.1 Direction Words  

```
north, south, east, west
northeast, northwest, southeast, southwest
up, down
in, out
```

### 4.2 Shortcuts  
```
n, s, e, w, ne, nw, se, sw, u, d
```

### 4.3 Numpad Mapping  
Numpad keys map to movement:

- `7` = northwest
- `8` = north
- `9` = northeast
- `4` = west
- `6` = east
- `1` = southwest
- `2` = south
- `3` = southeast
- `0` = down
- `5` = **ignored** (no mapping, prevents text input interference)

**Behavior:**
- Numpad keys only trigger movement when command input is empty or not focused
- Unmapped numpad keys (like `5`) are ignored and do not interfere with text input
- Numpad keys break auto-navigation and path execution when pressed

**Evidence:**
- `public/js/main.js:593-598` - Numpad mapping definition
- `public/js/main.js:601-603` - Unmapped numpad keys are ignored with `preventDefault()`  

### 4.4 Auto-path interruption  
ANY movement command **immediately cancels auto-navigation loops**, including:

- auto-path  
- auto-loop  
- scripted movement  

---

# 📝 5. Quantity Grammar

Quantity handling is universal across commands that involve stackable items:

- `all` → all of item  
- `<number>` → specific quantity  

## 5.1 Quantity Position

Quantity can be specified **before OR after** the item name for all item commands:

```
store 10 pulse resin    (quantity before item - preferred)
store pulse resin 10    (quantity after item - also supported)
store pulse resin       (quantity omitted - defaults to 1)
store all pulse resin   (quantity "all" after item)
```

This flexible positioning applies to: `take`, `drop`, `store`, `withdraw`, `buy`, `sell`

**Evidence:**
- `public/js/main.js:426-436` - Store and withdraw parsing support both positions
- `public/js/main.js:410-420` - Buy and sell parsing support both positions

## 5.2 Quantity Auto-Adjustment

When a player requests more quantity than available, the system **automatically adjusts** to use all available instead of erroring:

- Requesting `store 10 pulse resin` with only 9 available → stores all 9 with message: "You only have 9 pulse resin. Storing all 9."
- Requesting `take 50 glimmer` with only 30 available → takes all 30
- Requesting `sell 100 pulse resin` with only 85 available → sells all 85

This behavior prevents errors and provides better user experience.

**Evidence:**
- `handlers/game.js:4617-4625` - Store command auto-adjusts quantity
- `handlers/game.js:1853-1860` - Drop command auto-adjusts quantity
- `handlers/game.js:4699-4706` - Withdraw command auto-adjusts quantity

## 5.3 Default Quantity

If quantity is omitted:
```
take resin  → defaults to 1
store resin → defaults to 1
```

---

# 🔍 6. Partial Name Matching

Partial-name matching applies to:

- **items**
- **NPCs**
- **warehouse operations**
- **merchant interactions**
- **harvest targets**
- **lore keeper NPCs**

## 6.1 Matching Algorithm (Fuzzy Logic)

The item matching system uses a **prioritized scoring algorithm** to find the best matches:

### Match Priority (highest to lowest score):

1. **Exact Match** (score: 1000)
   - Query exactly matches item name (case-insensitive)
   - Example: `"pulse resin"` matches `"Pulse Resin"` exactly

2. **Starts-With Match** (score: 800+)
   - Item name starts with query string
   - Longer matches get higher scores
   - Example: `"pulse"` matches `"Pulse Resin"` and `"Pulse Crystal"`

3. **Word-Boundary Match** (score: 600+)
   - All query words match the start of item words (word-boundary matching)
   - All query words must match word starts, not just substrings
   - Example: `"pulse resin"` matches `"Pulse Resin"` (both words match starts)
   - Example: `"pulse resin"` does NOT match `"Pulse Crystal"` (resin ≠ crystal)
   - Bonus score when item word count matches query word count

4. **Substring Match** (score: 400+)
   - Query appears anywhere in item name (lowest priority)
   - Longer matching substrings get higher scores
   - Only used if no word-boundary matches found

### Scoring Details:

- Shorter item names are preferred when scores are equal (more specific)
- Exact matches always win over partial matches
- Multi-word queries require all words to match for word-boundary scoring

**Evidence:**
- `handlers/game.js:1660-1726` - `findMatchingItems()` function implements the scoring algorithm

## 6.2 Examples

```
take res         → matches "Pulse Resin" (word-boundary: "res" matches "resin" start)
take pulse resin → matches "Pulse Resin" exactly (exact match wins)
take pulse       → matches "Pulse Resin" and "Pulse Crystal" (ambiguous - both start with "pulse")
harvest rat      → matches "Rhythm Rat" (word-boundary matching)
ask keeper clue  → matches "Riddle Keeper of Echoes" (word-boundary matching)
```

## 6.3 Ambiguity Resolution

If multiple items match with the same or similar scores:
- System shows: `"Which did you mean: Pulse Resin, Pulse Crystal?"`
- Player must be more specific to disambiguate
- More specific queries (longer, exact matches) resolve ambiguity automatically

**Rules:**
- Case-insensitive matching
- Word-boundary matching prevents false matches (e.g., "pulse resin" won't match "pulse crystal")
- Longest unique match wins when scores are equal
- Ambiguity triggers "be more specific" message  

---

# 🪄 7. Action Commands (Patterns)

Some major command families expressed canonically:

### 7.1 Items  
```
take [qty] <item>    (quantity optional, can be before or after)
take <item> [qty]
take all <item>
drop [qty] <item>
drop <item> [qty]
drop all <item>
```

### 7.2 Warehouse  
```
store [qty] <item>    (quantity optional, can be before or after)
store <item> [qty]
store all <item>
withdraw [qty] <item>
withdraw <item> [qty]
withdraw all <item>
warehouse  (opens warehouse widget)
```

**Quantity Behavior:**
- Quantity can be specified before or after item name
- If quantity > available, automatically uses all available (no error)
- Default quantity is 1 if omitted

**Evidence:**
- `public/js/main.js:426-436` - Store/withdraw support flexible quantity positioning
- `handlers/game.js:4617-4625` - Store auto-adjusts quantity if insufficient

Special letter handling applies:  
```
w alone = west  
w <qty/item> = withdraw  
```

### 7.3 Merchant  
```
list
buy [qty] <item>      (quantity optional, can be before or after)
buy <item> [qty]
sell [qty] <item>
sell <item> [qty]
```

**Quantity Behavior:**
- Quantity can be specified before or after item name
- If quantity > available (for sell), automatically sells all available (no error)
- Default quantity is 1 if omitted

**Evidence:**
- `public/js/main.js:410-420` - Buy/sell support flexible quantity positioning

Special letter handling applies:  
```
s alone = south
s <item> = sell
```

### 7.4 Bank  
```
deposit <qty|all> <currency>
balance
wealth
```

### 7.5 NPC Interaction  
All these support partial name matching:
```
harvest <npc>
collect <npc>        (alias)
gather <npc>         (alias)
```

### 7.6 Lore Keeper  
```
greet <npc>
ask <npc> <question>
clue <npc>
solve <npc> <answer>
```

Patterns:
- puzzle NPCs → keyword matching  
- dialogue NPCs → scripted lines  

---

# 🏭 8. Factory Commands

Factory commands are always two-word verbs:

```
factory build <recipe>
factory queue <recipe>
factory status
factory cancel <jobId>
factory output
```

Rules:
- `build` executes immediately  
- `queue` adds to job queue  
- `status` reports current machine state  
- `output` retrieves finished goods  

---

# 📣 9. Communication Commands

### 9.1 Room-wide chat  
```
talk <msg>
. <msg>                (shortcut)
```

### 9.2 Global broadcast  
```
resonate <msg>
```

### 9.3 Private message  
```
telepath <player> <msg>
whisper <player> <msg>        (alias)
tell <player> <msg>           (alias)
```

### 9.4 Message casing  
Unlike other commands, **message arguments preserve casing and punctuation**.

---

# 🌌 10. Special / Resource Commands

```
attune
pulseEcho
wealth
who
inventory
look
help
```

Rules:
- `attune` ignores any trailing arguments  
- `pulseEcho` may have synonyms (`pulse`, `pe`, `p`)  
- `look` supports multiple usage patterns (see Section 10.1)
- `help` and `?` are synonyms

### 10.1 Look Command

The `look` command (abbreviation: `l`) has three distinct behaviors:

#### 10.1.1 Look at Current Room
```
look
l
```
When used without arguments, displays the full room description, NPCs, players, items, and exits for the player's current room. This is equivalent to the view when entering a room.

#### 10.1.2 Look in a Direction
```
look <direction>
look north
look south
look east
look west
look northeast
look northwest
look southeast
look southwest
```

When used with a direction argument, the player peers into an adjacent room without moving:
- **Valid exit direction**: Displays the target room's full description, NPCs, players, items, and exits. The display is prefixed with "Looking {direction}..." to clearly indicate the player is viewing, not entering, the room. The player's current room ID is not updated.
- **Invalid direction (no exit)**: Displays one of five randomly selected whimsical messages from the game messages system (category: `command`, keys: `look_direction_wall_1` through `look_direction_wall_5`).

Direction matching:
- Supports full direction names (north, south, east, west, northeast, northwest, southeast, southwest)
- Supports abbreviations (n, s, e, w, ne, nw, se, sw)
- Case-insensitive
- Up/down directions are not yet implemented and return a message indicating this

#### 10.1.3 Look at NPC
```
look <npc name>
look rat
look rhythm
```
When used with an NPC name argument (partial matching supported), displays the NPC's description. If multiple NPCs match, all matching descriptions are shown.

Message templates:
- Prefix when looking in direction: `look_direction_prefix` (editable in game_messages)
- Wall messages: `look_direction_wall_1` through `look_direction_wall_5` (editable in game_messages)  

---

# 👑 11. God Mode Commands

These commands only operate when god mode is enabled:

```
jump          (opens jump widget)
zork          (toggles ZORK AI mode)
```

Aliases beginning with `/` are permitted:
```
/jump
/zork
```

---

# 🔁 12. Repeating Commands

```
!!
```

Repeats the **last normalized command**.  
If none exists:
```
error: nothing to repeat
```

---

# ❌ 13. Error Handling Patterns

### Unknown command  
```
"I don't know how to 'xyz'."
```

### Ambiguous partial match  
```
"Which item did you mean?"
```

### Missing required argument  
```
"Sell what?"
"Take what?"
```

### Invalid context  
```
"harvest rat" in non-harvestable room
```

---

# 🧱 14. WebSocket Message Categories (High-Level)

Commands ultimately map into one of several internal message categories:

- movement  
- item interaction  
- npc interaction  
- communication  
- factory  
- warehouse  
- banking  
- lorekeeper  
- system  
- special / resource commands  
- god mode  

This categorization ensures consistent routing and state updates.

---

# 🔮 15. Extending the Command System

When adding a new command:

1. Define canonical verb name  
2. Add synonyms & abbreviations  
3. Decide whether multi-word arguments are allowed  
4. Determine whether partial-name matching applies  
5. Document ambiguity resolution  
6. Assign a WebSocket category  
7. Add the command rules **here**, not in multiple places  

---
# 16. Command Output & Message Templates

All commands MUST produce their output via the message template system.

A command does not construct text directly.  
Instead it returns a message event:

```
{ 
  key: "harvest_miss",
  data: { npcName: "Rhythm Rat" }
}
```

This key maps to a `message_template` record in the database.

### 16.1 Placeholder substitution
Templates may contain placeholders such as:

{npcName}, {itemName}, {vitalis}, {direction}

The server is responsible for substituting all placeholders before sending text to the client.

### 16.2 Message categories
Each template belongs to a category such as:

harvest, automation, command, movement, room, system, player

Categories organize output, analytics, and AI learning.

### 16.3 Hardcoded messages are not permitted
All player-visible text must originate from the template system.  
Any new strings must be created as message templates.

----
# 🏁 End of 10-commands.md
This file defines the full canonical grammar and patterns for all player commands in The Game.  
All future command implementations MUST follow this document.
