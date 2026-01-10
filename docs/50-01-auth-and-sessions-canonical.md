# 260 — Canonical Authentication & Session System Specification
_Authoritative spec for how authentication, login, sessions, and player/character identity work across the entire game architecture._

This document is **A1 (final)** — the single point of truth. Cursor must treat this specification as binding.

---

# 1. Purpose
The authentication system ensures:
- Secure account login
- Character selection
- Stable session identity
- Enforcement of permissions (player, editor, god mode)
- Safe terminal access and multi-character support (future proofed)

The system **does NOT** manage gameplay state — only identity & access.

---

# 2. High‑Level Architecture
Auth and sessions consist of:

1. **Accounts System** — email + password
2. **Character Selection Layer** — maps accounts → characters (players table)
3. **Session Manager** — authoritative active connection identity
4. **Permission Layer** — determines capability scope
5. **Terminal Login Flow** — the in-terminal authentication UX

All five layers must remain modular.

---

# 3. Accounts System (Canonical Rules)

## 3.1 Table Structure
```
accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT
)
```

## 3.2 Behavior
- Email is the login key
- Unique emails enforced at DB level
- Password hashing uses bcrypt (cost = 12 minimum)
- Login timestamps must update on success
- Email verification required before gameplay

## 3.3 Forbidden
- No usernames at account level
- No OAuth providers
- No unverified emails entering the game

---

# 4. Character / Player Mapping
Each account may own **one or more** player characters.

Characters stored in the canonical `players` table.

## 4.1 Required Fields
```
players (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  current_room_id INTEGER,
  stat_resonance INT,
  stat_fortitude INT,
  stat_ingenuity INT,
  stat_acumen INT,
  is_god_mode BOOLEAN DEFAULT FALSE,
  has_warehouse_deed BOOLEAN DEFAULT FALSE,
  auto_navigation_time_ms INT DEFAULT 1000,
  ...timestamps...
)
```

## 4.2 Rules
- `account_id` required
- `username` must be globally unique
- God Mode is stored **on character**, not account
- Characters may not be deleted without an explicit admin action

---

# 5. Login Flow (Terminal)
The terminal login follows this canonical order:

```
1. Prompt for email
2. Prompt for password
3. Verify credentials
4. If email not verified → block
5. Fetch characters for account
6. If 0 characters: create flow
7. If 1+ characters: show menu
8. Player selects character
9. Session created
10. Player enters world
```

Every step must be implemented exactly.

---

# 6. Session System (Authoritative Behavior)
Sessions represent a **live authenticated connection**.

## 6.1 Representation
Sessions are stored in memory:
```
{
  sessionId: string,
  accountId: number,
  playerId: number,
  connection: ws,
  createdAt: number,
  lastActiveAt: number,
  permissions: { isGodMode: boolean }
}
```

## 6.2 Rules
- One active session *per connection*, not per account
- Reconnecting creates a new session
- Sessions expire when websocket closes or times out

## 6.3 Timeout Rules
- Inactivity timeout: **5 minutes** (canonical)
- Active gameplay refreshes `lastActiveAt`

---

# 7. Permission Layer
Permission must always be derived from **player record**, not account.

## 7.1 Modes
- **Player Mode** — normal gameplay
- **Editor Mode** — limited to editor tools, NOT god mode
- **God Mode** — full editing access, must be enforced everywhere

## 7.2 God Mode rules
God mode grants:
- Access to world editor tools
- Access to item/NPC/room creation & modification
- Access to lint tools
- Ability to teleport self

God mode does **NOT** grant:
- DB write bypassing validations
- Ability to spawn items directly into inventory
- Access to other players' inventories

---

# 8. Multi‑Character Rules (A1 Model)
The game fully supports multi-character architecture.

## 8.1 Canonical Rules
- Characters belong to accounts
- Login selects account → character
- Session binds to **one character at a time**
- Switching characters requires relog

## 8.2 Character Creation Flow
Mandatory fields:
- username
- display_name
- starting room
- default stats

Cursor must follow this process without improvisation.

---

# 9. Security Rules

## 9.1 Password Handling
- Always bcrypt
- Minimum 12 rounds
- No plaintext logging

## 9.2 Rate Limiting
- Login attempts limited to 5 per 10 minutes per IP
- Failure messages generic: "Invalid credentials"

## 9.3 Session Hijack Prevention
- Each sessionId must be cryptographically random
- SessionId regenerated on relog
- Session must track websocket connection

## 9.4 Account Enumeration Prevention
- Login failure does not reveal whether account exists
- Password reset request always returns success

---

# 10. Canonical APIs

### `/api/register`
- Creates account + verification token

### `/api/login`
- Returns session token (internal)
- Does NOT start websocket session

### `/api/verify-email`
- Consumes token

### WebSocket `authenticate` Command
Required payload:
```
{
  email,
  password,
  characterId
}
```

---

# 11. Disconnection Behavior
On disconnect:
- Session destroyed
- Player removed from room player-lists
- Editor / God mode state cleared
- Any harvesting loops terminated

---

# 11.1 Session Restoration After Server Restart

When the server restarts, in-memory sessions are cleared. However, the client retains its session cookie (`gameSession`). The system supports **graceful session restoration** to preserve player experience.

## 11.1.1 Client-Side Behavior

The client stores the current player name in `sessionStorage`:
```javascript
sessionStorage.setItem('gamePlayerName', playerName)
```

On WebSocket reconnection, the client sends `authenticateSession` with:
```javascript
{
  type: 'authenticateSession',
  windowId: <tabId>,
  playerName: <storedPlayerName>  // From sessionStorage
}
```

## 11.1.2 Server-Side Restoration Flow

When `authenticateSession` is received:

1. **Check existing session**: If `sessionStore` contains valid session data, proceed normally
2. **Detect restoration need**: If session cookie exists but `sessionStore` is empty (server restart scenario):
   - `getSessionFromRequest` returns `{ sessionId, sessionData: null, needsRestore: true }`
3. **Restore session**: If `playerName` is provided in the message:
   - Look up player by name in `players` table
   - Retrieve `account_id` from `user_characters` table
   - Rebuild session in `sessionStore`:
     ```javascript
     {
       accountId: <from user_characters>,
       playerName: <from request>,
       playerId: <from players table>,
       createdAt: Date.now(),
       expiresAt: Date.now() + SESSION_DURATION
     }
     ```
   - Update `session.sessionData` and `session.needsRestore = false`
4. **Complete authentication**: Send `playerStats`, `roomUpdate`, etc.

## 11.1.3 Terminal Feedback

During disconnection, the terminal displays:
```
server timeout.
```

Dots animate every 5 seconds (up to 100 dots, then reset).

On successful reconnection:
```
✓ Reconnected to server successfully.
```

Previous disconnect messages are automatically cleared.

---

# 12. Forbidden Behavior
The auth/session system must **never**:
- Auto-create characters
- Auto-login without password
- Allow switching characters mid-session
- Expose accountId or sessionId to other players
- Let God mode bypass DB rules

---

# 13. Extensibility
Future additions require updating this spec before coding.

Allowed future extensions (if added here first):
- Multi-factor authentication
- Device authorization

**Implemented extensions:**
- ✅ Session persistence across reconnects (see Section 11.1)

---

# 14. TL;DR
**Authentication = account login**
**Character selection = choose player identity**
**Session = live connection identity**
**Permissions = derived from character**

The hierarchy is:
```
Account → Character → Session → Permissions
```

This doc is **authoritative**. If any implementation conflicts, **THIS SPEC WINS.**

