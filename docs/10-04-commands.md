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
Numpad keys map to movement (exact mapping left to implementation):

- `0` = down  
- `1–9` = directional equivalents  

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

Examples:
```
take all resin
drop 10 glimmer
withdraw 5 pulse resin
sell all resin
```

If quantity is omitted:
```
take resin  → defaults to 1
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

Examples:
```
take res         → matches “pulse resin”
harvest rat      → matches “rhythm rat”
ask keeper clue  → matches “Riddle Keeper of Echoes”
```

Rules:
- case-insensitive  
- must match *start* of a token  
- longest unique match wins  
- ambiguity triggers “be more specific”  

---

# 🪄 7. Action Commands (Patterns)

Some major command families expressed canonically:

### 7.1 Items  
```
take <item> [qty]
drop <item> [qty]
take all <item>
drop all <item>
```

### 7.2 Warehouse  
```
store <item> [qty]
withdraw <item> [qty]
withdraw all <item>
warehouse  (opens warehouse widget)
```

Special letter handling applies:  
```
w alone = west  
w <qty/item> = withdraw  
```

### 7.3 Merchant  
```
list
buy <item> [qty]
sell <item> [qty]
```

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
