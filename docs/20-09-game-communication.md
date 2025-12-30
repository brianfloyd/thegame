# 18 — Game Communication System (Canonical Specification)

This document defines the full communication layer used throughout the game world: room chat, world broadcast, private telepathy, NPC dialogue, system messaging, and Comms Widget integration.

It is the authoritative reference for:
- message types
- routing logic
- broadcast scopes
- formatting rules
- comms history behavior
- NPC dialogue integration
- terminal + widget message handling

---

# A. Message Types & Routing (Core System Behavior)

## A.1 Supported Message Types (Server → Client)

| Type | Description | Scope |
|------|-------------|--------|
| **talked** | Player room chat | Players in same room |
| **resonated** | World-wide broadcast | All connected players |
| **telepath** | Private message received | Sender → target only |
| **telepathSent** | Confirmation to sender | Private |
| **broadcast** | Broadcast group message | All members of named group |
| **broadcastSent** | Confirmation to sender | Private |
| **systemMessage** | System notices, errors | Targeted or broadcast |
| **loreKeeperMessage** | NPC dialogue + puzzle responses | Players in room |
| **message** | Action feedback (move fail, harvest, etc.) | Local (sender only) |
| **npcEvent** *(future)* | General NPC chatter/events | Room or world |

These message types populate both Terminal and Comms Widget streams.

---

## A.2 Talk Message Handling (Room Chat)

**Handler:** `handlers/game.js → async function talk(ctx, data)`

Triggered by:
- `. text`
- `talk text`
- `say text`

### Logic Flow:
1. Validate message text
2. Load player room
3. Get room occupants via `getConnectedPlayersInRoom()`
4. Broadcast:
   ```
   broadcastToRoom(roomId, {
       type: 'talked',
       playerName,
       message
   })
   ```

### Includes the sender by design.

---

## A.3 Determining "Players in the Same Room"

A player counts as "in room" if:
- `player.roomId === roomId`, AND
- `player.ws.readyState === WebSocket.OPEN`

Dead sockets auto-exclude themselves.

---

## A.4 Resonate (Global Broadcast)

**Handler:** `resonate(ctx, data)`

- Broadcasts to **all players**:
  ```
  broadcastToAll({ type: 'resonated', playerName, message })
  ```
- No filters
- Includes sender

Use cases:
- world announcements
- major lore events
- shout-style communication

---

## A.5 Telepath (Private Messaging)

**Handler:** `telepath(ctx, data)`

Recipient resolution:
- Case-insensitive match
- **Exact match only** (no partials)

### Behavior:
Send to target:
```
{ type: 'telepath', from: senderName, message }
```
Send confirmation to sender:
```
{ type: 'telepathSent', to: targetName, message }
```

### Missing safeguards:
- No prevention of telepathing yourself
- No /ignore or mute system
- No cooldown or throttling

These can be added later.

---

## A.6 Broadcast (Group Messaging)

**Handler:** `broadcast(ctx, data)`

**Database Tables:**
- `broadcast_groups` - Named groups of players
- `broadcast_group_members` - Player membership in groups
- `broadcast_messages` - Message history for groups

### Triggered by:
- Terminal: `-N "message"` (where N is group ID number)
- Comms Widget: Select group and type message

### Behavior:
1. Validates player is member of group
2. Saves message to `broadcast_messages` table
3. Sends to all group members:
   - **Online players:** Receive via WebSocket `broadcast` message
   - **Offline players:** Message written to `terminal_history` for viewing on next login
4. Sends confirmation to sender:
   ```
   { type: 'broadcastSent', groupId, groupName, message }
   ```

### Key Features:
- **Persistent history:** All messages stored in database, visible regardless of player presence
- **Group-based:** Messages sent to named groups, not individual players
- **Numbered groups:** Each group has an ID number displayed as a badge
- **Comms Widget integration:** Broadcast tab expands widget to 2 slots wide
  - Left slot: Scrollable list of groups with numbered badges, "Create Group" button
  - Right slot: Conversation history and input box
- **Terminal command:** `-N "message"` format (e.g., `-1 "hi guys"`)

### Comms Widget Behavior:
- When broadcast tab is selected, widget expands to full width (2 slots)
- Groups list shows on left with numbered badges
- "Create Group" button at top of groups list opens custom modal to create new group
- Double-click any group to open management modal
- Selected group's conversation history shows on right
- Input box at bottom sends to selected group
- Entire conversation history visible regardless of player presence when message was sent

### Group Management UI:
- **Create Group Modal:** Custom modal with group name input, player dropdown, add members, create button
- **Management Modal:** Opens on double-click, shows current members, add/remove members, delete group
- **Delete Confirmation:** Custom modal (no system dialogs)
- All modals match game aesthetic (green borders, dark background, Courier New font)

### Group Management Commands:

**Create Broadcast Group:**
- Command: `createbroadcastgroup <name>` or `cbg <name>`
- Creates a new broadcast group with the specified name
- Creator is automatically added as a member
- Returns group ID number

**Add Player to Group:**
- Command: `addtobroadcast <groupName> <playerName>` or `atb <groupName> <playerName>`
- Adds a player to an existing broadcast group
- Only group members can add other players
- Target player is notified if online

**Remove Player from Group:**
- Command: `removefrombroadcast <groupName> <playerName>` or `rfb <groupName> <playerName>`
- Removes a player from a broadcast group
- Only group members can remove other players (or remove themselves)
- Target player is notified if online

**List Broadcast Groups:**
- Command: `listbroadcastgroups` or `lbg`
- Lists all broadcast groups the player is a member of
- Shows group ID, name, member count, and member list

---

## A.7 NPC Dialogue Messages vs. Player Talk

NPC messages use their own message type and include extra metadata:
```
broadcastToRoom(roomId, {
    type: 'loreKeeperMessage',
    npcName,
    npcColor,
    messageColor,
    keywordColor,
    message
})
```

Key differences from talk:
- NPC messages **never** use the `talked` type
- Color and visual style is server-provided
- Used for puzzles, keyword triggers, lore sequences
- Still appears inside the Comms Widget’s talk channel

---

## A.8 Message Formatting & Markup

Server:  
Sends raw strings except when rendering system templates.

Client:  
All message types that appear in the Comms Widget or Terminal run through:
```
parseMarkup()
```
This handles:
- typewriter blocks
- glow
- NPC colors
- custom markup conventions

Server does **not** apply formatting for:
- talk
- telepath
- resonate

Server may apply formatting for:
- system messages (if using `formatMessageForTerminal()`)

---

---

## A.8 Comms History Behavior

**Storage:**
- **Talk/Resonate/Telepath:** Stored in `localStorage` as `comms_history_${playerName}`
- **Broadcast:** Stored in database (`broadcast_messages` table)
- **Terminal History:** All communication messages also written to `terminal_history` for persistence

**Retrieval:**
- `getCommsHistory` handler returns talk/resonate/telepath from `terminal_history` (parsed)
- `getBroadcastHistory` handler returns broadcast messages from `broadcast_messages` table
- CommsWidget loads from localStorage on init (talk/resonate/telepath)
- CommsWidget requests broadcast history from server on broadcast tab selection

**Persistence:**
- Broadcast messages persist in database regardless of player presence
- Offline players receive broadcast messages in `terminal_history` on next login
- Talk/resonate/telepath history limited to last 100 messages (localStorage)
- Broadcast history limited to last 500 messages per group (database)

---

# END OF SECTION A — Communication Routing

