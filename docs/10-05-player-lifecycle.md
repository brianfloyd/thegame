# 11 — Player Lifecycle (Canonical Specification)

This document defines the **complete lifecycle of a player session**, from connection to disconnection, including character selection, world entry, data synchronization, and in-session state behavior.

It is the source of truth for all client/server flow related to player presence.

---

# 🧩 1. Session Phases Overview

A player session consists of the following phases:

1. **Connection Established**  
2. **Authentication (Login)**  
3. **Character Selection**  
4. **World Entry**  
5. **Initial State Sync**  
6. **Active Gameplay Loop**  
7. **Session Persistence Updates**  
8. **Graceful Disconnect**  
9. **Reconnection Handling**

Each phase has required responsibilities and data structures.

---

# 🔌 2. Connection Established

When a client opens the game UI:

- WebSocket connects to the server  
- Server assigns a **temporary session**  
- No character is yet bound to this session  
- Server may send initial handshake metadata  
  - version  
  - message types  
  - any required client configuration  

The client remains in a “pre-auth” state until login occurs.

---

# 🔐 3. Authentication (Login)

### Input  
Player submits:
```
username
password
```

### Behavior  
- Server verifies credentials  
- On success:  
  - Session transitions to **authenticated**  
  - Server retrieves all characters on the account  
  - Server sends character list  

### Failure  
Server returns an authentication error, session remains unauthenticated.

---

# 🧍 4. Character Selection

After a successful login, the player must either select an existing character or create a new one.

Upon selection, the server loads **all persistent character data**, which includes far more than just stats and inventory. The goal is to restore the precise state of the player’s experience, including widget configurations and widget-specific data.

---

## 4.1 Core Character Data Loaded

When a character is selected, the server loads:

- Character profile (name, level, metadata)
- Stats & derived attributes  
- Inventory + stack quantities  
- Equipped items  
- Currency balances (wallet + bank)  
- Location (last known room)  
- Cooldowns, attunement, pulse tier  
- Active effects, temporary states  
- Harvest/factory automation state (if applicable)

This is the *minimum viable state* for world entry.

---

## 4.2 Last Widget Configuration (Canonical Behavior)

The game supports multiple UI widgets, each with its own configuration.  
These configurations must persist between sessions.

Examples of persisted widget configuration:

- **Which widgets were open**  
- **Widget layout or position** (if applicable)  
- **Widget mode/state** (e.g., factory widget on “queue” tab)  
- **Toggle settings** for automation widgets  
- **Compass/map settings**  
- **Terminal scrollback limits**  

When loading a character:

> **The server rehydrates the full UI configuration for the client, so the player’s UI appears exactly as it was in their last session.**

This preserves continuity and prevents a jarring re-entry experience.

---

## 4.3 Widget-Specific Player Data

Many widgets have **session-persistent data** that is tied to the character, not just the UI.

Examples include:

### **Comms/Chat Widget**
- Previous chat log  
- History of room chat, global resonations, whispers  
- Last unread-message pointer  
- Any pinned or filtered conversations  

### **Tickets Widget**
- Player-visible ticket history  
- Ticket states and last server sync  
- Drafts or in-progress submissions  

### **Factory Widget**
- Active queue state  
- Output history  
- Recipe tabs the user last viewed  

### **Warehouse & Bank Widgets**
- Last-used filters  
- Preferred item sort order  
- Recently interacted-with items  

### **NPC / Harvesting Widgets**
- Last selected NPC  
- Harvest filters (if supporting focus filtering)  
- Any automation state relevant to display  

---

## 4.4 Canonical Rules for Widget State Loading

1. **All widgets must load with the exact state they had at logout**, including closed/open status.  
2. **Widget-specific data must be restored before world entry is finalized**, so that widget UIs can immediately render correct data.  
3. **UI should not open new widgets by default**; only widgets required by the current room state should auto-open.  
4. **If widget data is missing, fallback defaults should be used**, but errors must not prevent login.  
5. **Widget state must NOT override world state** — room widgets (e.g., Factory, Warehouse) only appear if the player is in the correct room.

---

## 4.5 Finalizing Character Load

After all character + widget data is loaded:

- The server binds live session → character  
- The character is registered in world state  
- The system transitions into **World Entry** (Section 5)

No room data, NPC data, or environmental effects are sent until **all widget/character state** has been loaded.

---

---

# 🚪 5. World Entry

Once a character is bound:

1. Server confirms the room ID where the character should appear  
2. Character is added to the room’s active player list  
3. Server broadcasts presence to other players  
4. Client receives:
   - full room description  
   - NPCs in room  
   - items on ground  
   - exits  
   - widgets enabled for this room  
   - any ambient effects  

### Canonical rule  
**The player does not see any world information until world entry is complete.**

---

# 🔄 6. Initial State Sync

Immediately after world entry, the client receives a batch of "initial state" messages:

### Player State  
- stats (resonance, ingenuity, vitality, etc.)  
- current vitalis  
- inventory + quantities  
- equipped items  
- currency  
- cooldown timers  

### World/Room State  
- NPC list + their current state  
- items present  
- interactable objects  
- exits & directions  

### System/UI State  
- widgets to display  
- which widgets start active  
- which widgets are auto-managed  
- any editor/admin panels (if privileged)  

This is the **baseline snapshot** from which incremental updates are applied.

---

# 🕹️ 7. Active Gameplay Loop

Once fully synced, the player enters the active loop:

```
player sends command
→ server parses & processes
→ server updates world + player state
→ server sends delta updates to client
→ client updates UI (terminal, widgets, map, stats)
```

### Core principles

#### 7.1 Player actions are event-driven  
The server does nothing for a player unless:
- they send a command  
- a timed event triggers (NPC cycles, harvest ticks, factory processes)  
- the server has a timed action for the player such as retrieve tickets from ticketing system.
- another player or NPC generates an effect targeting them  

#### 7.2 Delta-based UI updates  
The client should only re-render what changes:
- stats changed? update StatsWidget  
- inventory changed? update InventoryWidget  
- new chat? update Terminal  
- player moved? update MapWidget + new room description  

#### 7.3 Room membership governs visibility  
Players see:
- NPCs in their room  
- players in their room  
- items in their room  
- ambient effects applied to their room  

All other information is unavailable unless provided by a widget (factory, warehouse, bank, etc.)

#### 7.4 Movement interrupts automation  
Any movement command immediately cancels:
- auto-path  
- auto-loop  
- syncing loops  
- harvesting loops (unless explicitly defined otherwise)  

---

# 🥁 8. Server → Client Update Types

During gameplay, the server sends:

### **Room updates**
- player joined/left  
- npc spawned/despawned  
- npc state changed  
- items added/removed  

### **Player updates**
- stats changed  
- inventory changes  
- currency changes  
- equipment changes  

### **Widget updates**
- open widget  
- close widget  
- widget state changes  

### **System messages**
- errors  
- confirmations  
- status reports  
- puzzle/lore dialogue  

### **Terminal output**
- narration  
- NPC speech  
- global chat  
- private chat  
- lorekeeper messages  

---

# ⚠️ 9. Session Persistence & Save Behavior

The game must persist the following whenever changed:

- current room  
- stats  
- vitalis  
- inventory  
- warehouse & bank balance updates  
- harvesting/factory state  
- puzzle/lorekeeper state  
- attunement status  
- any active cooldowns  

Persistence should be:
- **incremental**
- **event-driven**
- **never fully rewritten unnecessarily**

---

# 🔌 10. Graceful Disconnect

A disconnect occurs when:

- player closes browser  
- network drops  
- session times out  
- server restarts  

Server must:

1. Save character state  
2. Remove player from current room  
3. Broadcast departure  
4. Clear transient automation states  

The character is now offline.

---

# 🔄 11. Reconnection Handling

On reconnect:

- If the player logs in as the same character  
- AND their previous session ended less than a defined grace window  
- AND no conflicting session exists  

Then:

### Fast Reconnect Path  
- skip rebuilding world state from scratch  
- load the last valid snapshot  
- rejoin the world at the saved location  
- resume applicable timers  

If a conflicting session exists:
- new login overrides  
- old session is invalidated  

If too much time has passed:
- perform full fresh load (as in steps 4–6)

---

# 🧱 12. Error Conditions

### Invalid login  
Session remains unauthenticated.

### Character load failure  
Return error and remain at character selection.

### Room load failure  
Fallback to a safe default room.

### Corrupted state  
Trigger a reconstruction of missing pieces (inventory, stats, location).

---

# 🏁 End of 11-player-lifecycle.md
This document defines the **canonical lifecycle** of a player session.  
All server and client systems must align with these phases and behaviors.
