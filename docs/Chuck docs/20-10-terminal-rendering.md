# 19 — Terminal Rendering System (Canonical Specification)

This document defines how the Terminal component renders **all player-visible text** including:
- room descriptions
- talk/resonate/telepath messages
- NPC dialogue
- system messages
- command input and feedback
- server-preprocessed HTML

The Terminal is one of the **primary text surfaces** in the game and must follow strict, canonical rules for markup parsing, rendering order, and typewriter initialization.

---

# 1. Terminal Component Structure

The Terminal is implemented in:
```
public/js/components/Terminal.js
```

It extends the core `Component` class and manages:
- command input
- terminal display buffer
- scroll behavior
- voice recognition state
- idle look timing
- NPC status tracking
- ticket manager filtering

### Critical Internal State
- `terminalContent` — The DOM node holding the terminal’s lines
- `commandInput` — Text input for commands
- `scrollLocked` — Whether scroll auto-lock is disabled
- `currentRoomNPCs` — Map of NPC DOM references for in-place status updates
- `disconnectMessageShown` — Prevent duplicate disconnect notices
- `ticketManager` + filters — For ticket editor integration

---

# 2. Command Line Input Handling

Command input is bound in `main.js` and monitored within Terminal.

### 2.1 Input Field Definition
```
<input type="text" id="commandInput" class="command-input" ... >
```

### 2.2 Command Submission Flow
When the user presses **Enter**:
```
if commandInput.value.trim() is non-empty → executeCommand(command)
else → executeCommand('look')
```

### 2.3 Manual Typing Tracking
Terminal tracks whether the user is actively typing to prevent voice recognition from interfering:
- `userIsTyping`
- `lastManualInputTime`
- clears typing flag 500ms after last keystroke

This prevents race conditions with speech-to-text.

---

# 3. Message Rendering with Markup

**All terminal-visible text must pass through `parseMarkup()` unless explicitly preprocessed by the server.**

Rendering pipeline:
1. Create message div
2. Choose class: `info-message` or `error-message`
3. If server-provided HTML → insert directly
4. Else → run through `parseMarkup(message, '#00ffff')`
5. Append to terminal
6. Initialize typewriter effects
7. Scroll terminal
8. Save message to terminal history

### 3.1 addMessage() — Core Rendering Function
```
addMessage(message, type = 'info', saveToHistory = true, html = null)
```

Rules:
- If **html** is provided → server has already parsed markup → **innerHTML = html**
- If html is **not** provided → terminal parses client-side via `parseMarkup()`

Special-case handling:
- tables or `<div class="who-list">` blocks are inserted raw

---

# 4. Room View Rendering

When the player enters or looks at a room, the Terminal renders:
- room name
- room description
- exits
- items
- players
- NPC statuses

### 4.1 Description Rendering
```
roomDescDiv.innerHTML = parseMarkup(room.description, '#00ffff')
```

Room descriptions **always** support markup.

### 4.2 Rendering Player Names in Room
Player names support markup (colored, glowing, etc.):
```
playerSpan.innerHTML = parseMarkup(playerName, '#00ffff')
```

### 4.3 Rendering NPC Status
NPCs often display a dynamic status line:
```
npcStatus.innerHTML = parseMarkup(statusMessage, '#00ffff')
```

### 4.4 Saving Room Content to Terminal History
Every description, exit list, and item list stores the **raw** text in terminal history.

---

# 5. System Messages

System messages (join/leave/game notifications) are rendered using markup:
```
messageDiv.innerHTML = parseMarkup(data.message, '#00ffff')
```

Rules:
- System messages always use markup parsing
- Saved to history
- Auto-scrolls terminal

Special case: authentication errors are ignored during reconnect.

---

# 6. Talk/Resonate/Telepath Rendering

Talk messages, world broadcasts, and telepath messages always appear in the Terminal.

### 6.1 Talk Message Rendering
```
formattedHtml = parseMarkup(message, '#00ffff');
msgDiv.innerHTML = `
  <span class="talked-player">${cleanName(playerName)}</span> says:
  <span class="talked-text">${formattedHtml}</span>
`;
```

Terminal logs the raw message plus the fully rendered HTML.

### 6.2 Resonate Rendering
Follows the same pattern as talk messages, but with world-wide styling.

### 6.3 Telepath Rendering
`telepath` and `telepathSent` handlers apply markup and wrap with metadata:
```
<span class="telepath-from">${from}</span>: ${parseMarkup(message)}
```

---

# 7. Server Pre-Processed Messages

The Terminal gracefully handles messages that the server has already rendered using the **server markup service**.

### 7.1 handleTerminalMessage()
If the server sends `{ html: "..." }`:
```
this.addMessage(message, finalType, true, html);
```

Else, fallback to client-side parsing.

### 7.2 Why Pre-Processed HTML Exists
Server-rendered HTML is used for:
- tables (who-list)
- multi-column layouts
- nested div structures
- formatted system/UI messages

Client markup parser is not intended for structured HTML.

---

# 8. Markup Display Summary

The Terminal uses `parseMarkup()` for:
- room descriptions
- player names
- NPC status
- system messages
- talk messages
- resonate messages
- telepath messages

Server may send pre-rendered HTML for:
- structured system messages
- formatted tables
- who lists
- custom UI blocks

Typewriter effects must be initialized **after** setting innerHTML:
```
initializeTypewriterEffects(msgDiv)
```

---

# 9. Rendering Flow (Canonical)

```
User types command
    ↓
commandInput fires event
    ↓
executeCommand(command)
    ↓
command sent to server over WebSocket
    ↓
server processes + responds
    ↓
handleTerminalMessage() or specific handler
    ↓
if server HTML → insert directly
else → parseMarkup()
    ↓
append to DOM
    ↓
initializeTypewriterEffects()
    ↓
scrollToBottom()
    ↓
save to terminal history
```

---

# 10. Markup Integration Points

Terminal uses markup in every major text-rendering surface.

| Component | Uses Markup? | Notes |
|-----------|--------------|--------|
| Room descriptions | ✔ | Fully parsed
| Player listing | ✔ | Names support markup
| NPC status | ✔ | Dynamic descriptions
| Exits | ✔ | Markup-supported
| Items list | ✔ | Visual enhancement allowed
| System messages | ✔ | Always parsed
| Talk/resonate/telepath | ✔ | Fully parsed
| Server HTML blocks | ✖ | Already final; inserted raw

Markup is a **first-class text rendering feature** across the entire Terminal.

---

# End of 19 — Terminal Rendering System (Canonical)

