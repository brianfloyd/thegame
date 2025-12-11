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

## A.6 NPC Dialogue Messages vs. Player Talk

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

## A.7 Message Formatting & Markup

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

# END OF SECTION A — Communication Routing

