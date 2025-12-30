# Lorekeeper System Overview - Calder Analysis

**Document Type:** Reference Analysis  
**Created:** 2025-01-27  
**Source:** Database queries via MCP tools  
**Status:** Complete analysis of Calder NPC and Lorekeeper system

---

## Executive Summary

Calder is a **Lorekeeper** NPC located in the Town Square (Room ID: 81, Map ID: 1) who presents players with a word puzzle. Solving the puzzle rewards the player with a **Harvester Rune**, which is essential for harvesting Pulsewood resin from living roots. Calder serves as a tutorial/introduction NPC who teaches players about the game's core mechanics and lore.

---

## 1. NPC Data - Calder

### Basic Information
- **NPC ID:** 13
- **Name:** Calder
- **NPC Type:** `lorekeeper`
- **Location:** Town Square (Room ID: 81, Coordinates: 0, 0, Map: Newhaven)
- **Display Color:** `#8888ff` (light blue/purple)
- **Active:** Yes
- **Slot:** 0

### NPC Description
```
Calder bows his head as you draw near.

"Wanderer… listen well. The first thing to know is this:
Pulsewood <resin> is the beginning of all Binder craft."

"The second truth is quieter:
beneath Newhaven, a natural <hum> still trembles through the stone."

"The third lesson comes from the old trees:
their trunks remain wrapped in living <vines> that remember every cycle."

"And the fourth is our oldest practice:
every Lore Keeper shapes a single <rune> to help the world stay woven."

"Take the first, the second, the third, and the fourth letters from each glow,
and speak the word they form."
```

### NPC Stats & Mechanics
- **Base Cycle Time:** 3000ms
- **Difficulty:** 1
- **Harvestable Time:** 60000ms (60 seconds)
- **Cooldown Time:** 120000ms (120 seconds)
- **Pulse Echo Yield:** 1
- **Hit Vitalis:** 0
- **Miss Vitalis:** 0
- **Scriptable:** false
- **Enable Stat Bonuses:** true
- **Enable Resonance Bonuses:** true
- **Enable Fortitude Bonuses:** true

### Status Messages
- **Idle:** "(idle)"
- **Ready:** "(ready)"
- **Harvesting:** "(harvesting)"
- **Cooldown:** "(cooldown)"

### Harvest Configuration
- **Output Distribution:** ground
- **Input Items:** None
- **Output Items:** None
- **Required Stats:** None
- **Required Buffs:** None
- **Failure States:** None
- **Harvest Prerequisite Item:** None

---

## 2. Lorekeeper System Data

### Lorekeeper Record (ID: 1)
- **NPC ID:** 13 (Calder)
- **Lore Type:** `puzzle`
- **Engagement Enabled:** true
- **Engagement Delay:** 3000ms (3 seconds after player enters room)

### Initial Message
**Color:** `#00ffff` (cyan)

```
Calder bows his head slightly as you approach.

"Wanderer… listen closely.

The *first* truth is simple:
Pulsewood <resin> is the beginning of all Binder craft."

"The *second* truth lies beneath your feet:
listen for the natural <hum> that still trembles under Newhaven."

"The *third* truth lives in the old trees:
their trunks remain wrapped in living <vines> that remember every cycle."

"And the *fourth* truth hides in the world's resonance:
a subtle <tone> that keeps the Pulse from unraveling."
```

### Puzzle Configuration
- **Puzzle Mode:** `word` (single word answer)
- **Puzzle Solution:** `"rune"`
- **Puzzle Clues:** 
  ```json
  [
    {
      "answer": "<heres> your answer bish!",
      "keyword": "test"
    }
  ]
  ```
  *(Note: This appears to be a test/placeholder clue)*

### Keyword Responses
**Color:** `#ff00ff` (magenta)

Players can interact with Calder by saying keywords from the puzzle. Each keyword provides a hint:

- **"resin"** → "The first truth is in this glowword — first things first, as <r>esin begins all Binder craft."
  - *Hint: First letter is "r"*

- **"hum"** → "The second truth h<u>ms beneath your feet — listen carefully to what comes second."
  - *Hint: Second letter is "u"*

- **"vines"** → "The third truth coils through the old Pulsewood vi<n>es — what you seek lies further in."
  - *Hint: Third letter is "n"*

- **"tone"** → "The fourth truth hides in the world's resonant ton<e> — find the one shaped last."
  - *Hint: Fourth letter is "e"*

- **"help"** → "Ah, my [help] is with riddles but you may want to ask the terminal directly."

#### Keyword Response Storage & Processing

**Location:** Database-driven, stored in `lore_keepers.keywords_responses` column (JSONB type)

**Data Format:**
```json
{
  "hum": "The second truth h<u>ms beneath your feet — listen carefully to what comes second.",
  "help": "Ah, my [help] is with riddles but you may want to ask the terminal directly.",
  "tone": "The fourth truth hides in the world's resonant ton<e> — find the one shaped last.",
  "resin": "The first truth is in this glowword — first things first, as <r>esin begins all Binder craft.",
  "vines": "The third truth coils through the old Pulsewood vi<n>es — what you seek lies further in."
}
```

**Not Hardcoded:** These responses are **fully database-driven** and can be updated without code changes.

**Processing Flow:**
1. **Storage:** `lore_keepers.keywords_responses` column (JSONB) stores keyword→response mappings
2. **Retrieval:** `database.js::getLoreKeepersInRoom()` retrieves lorekeepers and maps `keywords_responses` to `keywordsResponses` (camelCase)
3. **Matching:** `handlers/game.js::talk()` handler checks if player's message contains any keyword (case-insensitive substring match)
4. **Response:** When a match is found, broadcasts the response to the room with NPC name, color, and message formatting

**Code References:**
- **Database Schema:** `migrations/004_lore_keepers.sql` (line 19) - defines `keywords_responses TEXT`
- **JSONB Migration:** `migrations/073_convert_text_json_to_jsonb.sql` (lines 225-238) - converts to JSONB
- **Database Function:** `database.js::getLoreKeepersInRoom()` (line 1239) - maps to `keywordsResponses`
- **Handler Logic:** `handlers/game.js::talk()` (lines 3291-3308) - keyword matching and response broadcasting
- **ZORK Integration:** `scripts/zork-ai-agent.cjs` (lines 3103-3120, 3145-3157) - allows updating keywords via `updateNPCKeyword` action

**Update Mechanism:**
- Keywords can be updated via ZORK's `updateNPCKeyword` action (CHUCK MODE)
- Direct database updates to `lore_keepers.keywords_responses` JSONB column
- NPC Editor (if implemented) can modify these responses

### Puzzle Messages

**Success Message:**
```
Calder's eyes warm as you speak the final word.

"Yes… you have seen the hidden thread. The Pulse recognizes you."

He places a small stone in your hand, etched with shifting lines that respond to your touch.

You receive: **Harvester Rune**

"With this, Wanderer, you can finally draw Pulsewood resin from the living roots.
Your path begins now."

Calder gestures toward the map around you.

"When you see a room outlined in white upon your map, know that such passages connect
to lands beyond Newhaven. Travel through them when you feel ready."

He lowers his voice conspiratorially.

"And should the world feel confusing… simply ask it. The command [help] will show you
every way you may move, speak, gather, or act. Do not hesitate to use it."
Calder steps back, giving you space.

"Go now. The Pulse stirs again — because of you."
```

**Failure Message:**
```
That is not the answer I seek.
```

**Incorrect Response (for unrecognized keywords):**
```
I do not understand what you mean.
```

### Puzzle Reward
- **Reward Item:** "Harvester Rune"
- **Reward Item ID:** 2
- **Award Once Only:** false (can be awarded multiple times)
- **Award After Delay:** false
- **Award Delay Seconds:** null
- **Award Delay Response:** null

---

## 3. Puzzle Solution Analysis

### The Puzzle
Calder presents four "truths" with highlighted words:
1. **First:** Pulsewood `<resin>` → First letter: **R**
2. **Second:** natural `<hum>` → Second letter: **U**
3. **Third:** living `<vines>` → Third letter: **N**
4. **Fourth:** subtle `<tone>` → Fourth letter: **E**

**Solution:** **RUNE**

### How to Solve
1. Player approaches Calder in Town Square
2. After 3 seconds, Calder automatically delivers the initial message
3. Player can say keywords ("resin", "hum", "vines", "tone") to get hints
4. Each keyword response highlights the relevant letter in the solution
5. Player says "rune" to solve the puzzle
6. Calder awards the Harvester Rune and provides tutorial information

---

## 4. Associated Items

### Harvester Rune (Item ID: 2)
- **Name:** Harvester Rune
- **Item Type:** `rune`
- **Rune Type:** `PRODUCTION`
- **Rune Color:** `#0000ff` (blue)
- **Description:** "A small stone etched with glowing symbols. When held near harvestable creatures, it enhances the yield and quality of gathered materials."
- **Encumbrance:** 5
- **Poofable:** false (cannot be destroyed)
- **Active:** true
- **Created:** 1764340317777

### Related Items Mentioned in Puzzle
- **Pulse Resin** (Item ID: 1)
  - Mentioned in puzzle as "the beginning of all Binder craft"
  - Description: "A thick, amber-colored resin harvested from Pulsewood trees. It pulses faintly with bioluminescent energy and is commonly used in alchemical preparations."
  - Item Type: `ingredient`
  - Encumbrance: 1
  - Poofable: true

---

## 5. Location Data

### Town Square (Room ID: 81)
- **Name:** "town square"
- **Description:** "The heart of it all, everyone starts in town square and all roads lead here!"
- **Coordinates:** (0, 0)
- **Map ID:** 1 (Newhaven)
- **Room Type:** `normal`
- **Factory Tier:** 1
- **Connected Map:** None
- **Connection Direction:** None

### Room NPC Assignment
- **Room NPC ID:** 3
- **NPC ID:** 13 (Calder)
- **Room ID:** 81
- **Slot:** 0
- **Active:** true
- **State:** `{"cycles": 569}`
- **Last Cycle Run:** 1765830764495
- **Spawn Rules:** null

---

## 6. Player Interaction Data

### Greeting History
4 players have greeted Calder:
- Player ID 1: First greeted 2025-11-29, last greeted 2025-11-29
- Player ID 8: First/last greeted 2025-12-01
- Player ID 9: First/last greeted 2025-12-03
- Player ID 10: First/last greeted 2025-12-07

### Item Award History
1 player has received the Harvester Rune from Calder:
- Player ID 1: Awarded "Harvester Rune" (Item ID: 2) on 2025-11-29

---

## 7. Lorekeeper System Architecture

### Database Schema

**lore_keepers Table:**
- `id` (SERIAL PRIMARY KEY)
- `npc_id` (INTEGER, UNIQUE, REFERENCES scriptable_npcs)
- `lore_type` (TEXT, CHECK: 'dialogue' or 'puzzle')
- `engagement_enabled` (BOOLEAN, default: true)
- `engagement_delay` (INTEGER, default: 3000ms)
- `initial_message` (TEXT)
- `initial_message_color` (TEXT, default: '#00ffff')
- `keywords_responses` (TEXT/JSON)
- `keyword_color` (TEXT, default: '#ff00ff')
- `incorrect_response` (TEXT, default: 'I do not understand what you mean.')
- `puzzle_mode` (TEXT, CHECK: 'word', 'combination', 'cipher')
- `puzzle_clues` (TEXT/JSON array)
- `puzzle_solution` (TEXT)
- `puzzle_success_message` (TEXT)
- `puzzle_failure_message` (TEXT, default: 'That is not the answer I seek.')
- `puzzle_reward_item` (TEXT)
- `puzzle_reward_item_id` (INTEGER)
- `puzzle_award_once_only` (BOOLEAN, default: false)
- `puzzle_award_after_delay` (BOOLEAN, default: false)
- `puzzle_award_delay_seconds` (INTEGER)
- `puzzle_award_delay_response` (TEXT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**lore_keeper_greetings Table:**
- Tracks when players first/last greeted each lorekeeper
- Fields: `id`, `player_id`, `npc_id`, `first_greeted_at`, `last_greeted_at`

**lore_keeper_item_awards Table:**
- Tracks puzzle rewards awarded to players
- Fields: `id`, `player_id`, `npc_id`, `item_name`, `item_id`, `awarded_at`

### Lorekeeper Types
1. **Dialogue Type:** Interactive NPCs that respond to keywords
2. **Puzzle Type:** NPCs that present puzzles/riddles with solutions

### Puzzle Modes
1. **Word:** Single word answer (Calder uses this)
2. **Combination:** Multi-step combination puzzle
3. **Cipher:** Encoded/encrypted puzzle

---

## 8. Integration Points

### ZORK AI Agent
- ZORK has knowledge of Calder's puzzle and solution
- God-mode players can ask ZORK for puzzle solutions
- Regular players receive hints but not direct answers
- ZORK can update Calder's keyword responses via CHUCK MODE

### Game Handlers
- Lorekeeper engagement is handled in `handlers/game.js`
- Automatic message delivery after `engagement_delay`
- Keyword matching and response system
- Puzzle solution validation
- Item award system

### Terminal/Help System
- Calder mentions the `[help]` command in his success message
- Players are directed to use help for game mechanics

---

## 9. Design Notes & Observations

### Calder's Role
1. **Tutorial NPC:** Introduces players to core game concepts
2. **Gatekeeper:** Harvester Rune is required for harvesting Pulsewood resin
3. **Lore Delivery:** Teaches about Pulsewood, Newhaven, and the Pulse
4. **Navigation Guide:** Explains map connections (white-outlined rooms)

### Puzzle Design
- **Accessibility:** Simple word puzzle suitable for new players
- **Progressive Hints:** Keywords provide increasingly specific hints
- **Teaching Tool:** Introduces players to keyword interaction system
- **Reward Significance:** Harvester Rune is essential for progression

### System Flexibility
- **Reusable:** Lorekeeper system supports multiple NPCs
- **Configurable:** Puzzle types, delays, and rewards are database-driven
- **Extensible:** Supports dialogue and multiple puzzle modes
- **Trackable:** Greeting and award history tracked per player

---

## 10. Recommendations & Future Considerations

### Current State
- Calder is fully functional and serves his tutorial role
- Puzzle solution is well-integrated with game mechanics
- Reward system is working (1 player has received Harvester Rune)

### Potential Enhancements
1. **Additional Lorekeepers:** System supports multiple lorekeepers with different puzzles
2. **Puzzle Variations:** Can implement combination or cipher puzzles
3. **Progressive Rewards:** Could add follow-up puzzles or quests
4. **Lore Expansion:** Calder could provide additional lore after puzzle completion

### Technical Notes
- Lorekeeper system is well-architected and database-driven
- Integration with ZORK AI provides intelligent responses
- Player tracking enables analytics and progression monitoring

---

## 11. Related Files & References

### Database Migrations
- `migrations/004_lore_keepers.sql` - Lorekeeper table schema

### Code References
- `scripts/zork-ai-agent.cjs` - ZORK integration for lorekeeper puzzles
- `scripts/zork-system-prompt.md` - ZORK knowledge of Calder's puzzle
- `handlers/game.js` - Lorekeeper engagement and puzzle handling

### Canon Documents
- (To be referenced if lorekeeper canon exists)

---

## 12. Data Summary

### Calder Statistics
- **NPC ID:** 13
- **Lorekeeper ID:** 1
- **Location:** Town Square (Room 81)
- **Puzzle Type:** Word puzzle
- **Solution:** "rune"
- **Reward:** Harvester Rune (Item ID: 2)
- **Players Greeted:** 4
- **Rewards Awarded:** 1

### System Statistics
- **Total Lorekeepers:** 1 (Calder)
- **Puzzle Mode:** Word
- **Lore Type:** Puzzle
- **Engagement System:** Active

---

**End of Report**


