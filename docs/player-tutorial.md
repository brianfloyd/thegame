# The Game - New Player Tutorial

## Overview

This is a MajorMUD-style multiplayer text adventure game with a retro terminal aesthetic. The game features a coordinate-based world map, NPCs you can interact with, an inventory system, and real-time multiplayer interaction.

---

## Game Interface Layout

The game screen is divided into two main sections:

### Left Side - Text Terminal (2/3 of screen)
- **Black background** with green text
- Shows room information when you enter new areas:
  - Room name in YELLOW UPPERCASE (e.g., "NEWHAVEN, TOWN SQUARE")
  - Room description in green text
  - NPCs present in the room (cyan text)
  - Other players in the room ("Also here: [player names]")
- **Room Status Bar**: Shows items on the ground
- **Command Line**: At the bottom with `>` prompt for typing commands

### Right Side - Widget Panel (1/3 of screen)
The right panel contains interactive widgets arranged in a 2x2 grid:

#### 1. Player Stats Widget (Top-Left)
Displays your character's attributes, abilities, and resources:
- **Attributes**: Brute Strength, Life Force, Cunning, Intelligence, Wisdom
- **Abilities**: Crafting, Lockpicking, Stealth, Dodge, Critical Hit
- **Resources**: 
  - Hit Points (HP) with visual bar (red)
  - Mana with visual bar (blue) - only shown for magic users

#### 2. Compass Widget (Top-Right)
- **8-direction compass** for navigation
- Shows available exits with bright green buttons
- Unavailable directions appear dimmed but visible
- **UP/DN buttons** for vertical movement (stairs, ladders)
- **Coordinates display** at bottom showing current map name and (x, y) position

#### 3. Map Widget (Bottom-Left)
- **25x25 grid** centered on your current position
- Your current room: Bright green with yellow border
- Other rooms: Gray squares
- Connection lines show paths between rooms
- Hover over rooms to see their names (tooltip)

#### 4. NPC Activity Widget (Bottom-Right)
- Appears automatically during harvesting activities
- Shows:
  - NPC name being harvested
  - Status (Harvesting/Recharging)
  - Progress bar
  - Timing information (Pulse, Harvest, Cooldown)

### Widget Toggle Bar
At the top of the right panel, icons let you toggle which widgets are visible:
- Person icon: Player Stats
- Compass icon: Compass
- Map icon: Map

---

## Movement & Navigation

You have **THREE ways** to move around the world:

### 1. Command Line (Text Commands)
Type movement commands at the `>` prompt and press Enter:

| Full Command | Abbreviation | Direction |
|--------------|--------------|-----------|
| `north` | `n` | Move north (up on map) |
| `south` | `s` | Move south (down on map) |
| `east` | `e` | Move east (right on map) |
| `west` | `w` | Move west (left on map) |
| `northeast` | `ne` | Move diagonally northeast |
| `northwest` | `nw` | Move diagonally northwest |
| `southeast` | `se` | Move diagonally southeast |
| `southwest` | `sw` | Move diagonally southwest |
| `up` | `u` | Move up (stairs, ladders) |
| `down` | `d` | Move down |

**Example**: Type `n` and press Enter to move north.

### 2. Compass Widget (Mouse Clicks)
Click the direction buttons on the compass widget:
- **NW, N, NE** (top row)
- **W, center dot, E** (middle row)
- **SW, S, SE** (bottom row)
- **UP, DN** buttons for vertical movement

Bright green buttons = available exits. Dimmed buttons = blocked directions.

### 3. Number Pad (Keyboard)
Use your keyboard's numeric keypad for fast movement:

```
7=NW    8=N    9=NE
4=W     5=--   6=E
1=SW    2=S    3=SE
```

**Important**: This only works when:
- You're NOT typing in the command input
- The numpad keys are being used (not the number row)

If you're typing in the command input, pressing numpad keys will move you instead of typing numbers. The focus automatically leaves the input.

### Movement Errors
If you try to move in a direction with no exit:
> "Ouch! You walked into the wall to the [direction]."

---

## Game Commands Reference

Type these commands at the `>` prompt:

### Information Commands
| Command | Abbreviation | Description |
|---------|--------------|-------------|
| `help` | `?` | Display all available commands |
| `look` | `l` | Re-display current room information |
| `look <target>` | `l <target>` | Look at a specific NPC (partial name match) |
| `inventory` | `i`, `inv` | Show your inventory |

### Item Commands
| Command | Abbreviation | Description |
|---------|--------------|-------------|
| `take <item>` | `t`, `get`, `pickup` | Pick up an item from the ground |
| `take all <item>` | - | Pick up all of a specific item |
| `take <qty> <item>` | - | Pick up a specific quantity |
| `drop <item>` | *(no abbrev, 'd' = down)* | Drop an item from inventory |
| `drop all <item>` | - | Drop all of a specific item |
| `drop <qty> <item>` | - | Drop a specific quantity |

**Partial Name Matching**: You don't need to type the full item name.
- `take pul` will pick up "Pulse Resin" if it's the only match
- If multiple items match, you'll be asked to clarify: *"Which did you mean: pulse resin, purple gem?"*

### NPC Interaction Commands
| Command | Abbreviation | Description |
|---------|--------------|-------------|
| `harvest <npc>` | `h`, `p` | Start harvesting from an NPC |
| `collect <npc>` | `c` | Alias for harvest |
| `gather <npc>` | `g` | Alias for harvest |

**Partial Name Matching**: Works the same as items.
- `harvest glow` would work for "Glowroot Pulsecap"

---

## The Inventory System

### Viewing Your Inventory
Type `inventory`, `inv`, or `i` to see what you're carrying:
> "You are carrying: Pulse Resin (x3), Harvester Rune (x1)"

Or if empty:
> "Your inventory is empty."

### Items on the Ground
The **Room Status Bar** (above the command line) shows items on the ground:
> "On the ground: Pulse Resin (x2), Ember Gel (x1)"

Items are displayed in gold/yellow color.

### Managing Items
- **Taking items**: `take resin` or `t resin` to pick up Pulse Resin
- **Taking quantities**: `take 2 resin` or `take all resin`
- **Dropping items**: `drop resin` to place in room
- **Dropping quantities**: `drop 3 resin` or `drop all resin`

---

## NPCs (Non-Player Characters)

### Finding NPCs
NPCs appear in room descriptions. When you enter a room with NPCs, you'll see:
> "A Glowroot Pulsecap grows here, its cap glowing softly."

### Looking at NPCs
Use `look <npc name>` to get more information:
```
> look glowroot
Glowroot Pulsecap: A thick, amber-colored resin harvested from Pulsewood trees...
```

### Harvesting from NPCs
Many NPCs can be harvested for items. They operate on a **rhythm cycle system**:

1. **Start Harvesting**: Type `harvest <npc>` (or `h <npc>`)
2. **Harvest Session**: While harvesting, the NPC produces items periodically
3. **Items Drop**: Produced items appear on the ground
4. **Cooldown**: After harvesting ends, NPC enters a cooldown period

**The NPC Activity Widget** (bottom-right) appears during harvesting showing:
- Current status (Harvesting/Recharging)
- Progress bar
- Timing: Pulse interval, Harvest window, Cooldown time

**Interrupting Harvest**: 
- Moving to another room
- Using most commands (except look, inventory)
- Your harvest session ends and cooldown begins

---

## The Map System

### Understanding the Map Widget
- **Green square with yellow border**: Your current location
- **Gray squares**: Other rooms you can see
- **Lines between rooms**: Passageways/connections
- **Dimmer green squares**: Preview rooms from connected maps

### Coordinate System
The compass widget shows your current coordinates:
```
Newhaven
(0, 0)
```
- **X coordinate**: West/East (-10 to +9 in main town)
- **Y coordinate**: North/South (-10 to +9 in main town)
- North = Y increases, South = Y decreases
- East = X increases, West = X decreases

### Multiple Maps
The world consists of connected maps:
- **Newhaven**: Main town (20x20 grid)
- **Northern Territory**: Wild area north of town (10x10 grid)

When you approach a map connection, preview rooms from the connected map appear dimmer on your map view.

---

## Multiplayer Features

### Real-Time Updates
- See other players enter/leave your room instantly
- "Also here:" section shows who's in the room with you
- Player names displayed in cyan

### Communication
- *Future: Chat and emote commands*

---

## Tips for New Players

1. **Use the Help Command**: Type `?` or `help` at any time to see available commands

2. **Explore Carefully**: Pay attention to room descriptions - they often contain hints

3. **Watch the Compass**: Green buttons show available exits before you try to move

4. **Use Partial Names**: Don't type full item/NPC names. "pul" works as well as "pulse resin"

5. **Number Pad is Fast**: Once you're comfortable, the numpad is the quickest way to navigate

6. **Harvest Wisely**: Stay in one place while harvesting - moving interrupts the session

7. **Check the Ground**: The Room Status Bar shows items available to pick up

8. **Toggle Widgets**: If you need more screen space, click widget icons to show/hide them

---

## Terminal Color Codes

The game uses specific colors for different information:
- **Yellow**: Room names, section titles
- **Green**: Room descriptions, general text
- **Cyan**: Player names, NPC names
- **Gold**: Items (on ground or in inventory)
- **Red**: Error messages
- **Blue**: Mana bar

---

## Quick Reference Card

### Movement
```
Command Line: n, s, e, w, ne, nw, se, sw, u, d
Compass: Click direction buttons
Numpad: 7=NW, 8=N, 9=NE, 4=W, 6=E, 1=SW, 2=S, 3=SE
```

### Essential Commands
```
?           - Help (show all commands)
l           - Look (redisplay room)
l <name>    - Look at NPC
i           - Inventory
t <item>    - Take item
drop <item> - Drop item
h <npc>     - Harvest from NPC
```

### Interface
```
Left 2/3:   Text terminal (room info, commands)
Right 1/3:  Widgets (stats, compass, map, NPC activity)
Status bar: Items on ground (above command line)
```

---

## Glossary

- **Room**: A single location in the game world
- **NPC**: Non-Player Character - creatures/objects you can interact with
- **Harvest**: Collecting resources from certain NPCs
- **Cooldown**: Waiting period before an NPC can be harvested again
- **Widget**: UI element showing game information (stats, map, etc.)
- **Partial Match**: Typing part of an item/NPC name to reference it
- **Terminal**: The text display area showing game messages

---

*Welcome to The Game! Start exploring by typing `n` to go north, or `?` for help.*
















