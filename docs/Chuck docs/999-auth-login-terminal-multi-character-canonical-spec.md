# ✅ Auth, Login, Terminal Pop-Out & Multi-Character Play Canonical Spec

**Analyzed from codebase on:** 2024-12-XX  
**Enforcement Level:** Canonical Law (strictly enforced in code)

---

## 1. Canonical Purpose of Authentication System

**Purpose:** Email/password authentication system with account-based character management. Users register/login with an email address and password, then select from characters associated with their account.

**Source:**
- `docs/requirements.md:3-6` - "The game uses an email/password authentication system with account-based character management"
- `middleware/auth.js:1-5` - "Handles login, registration, and account management"

---

## 2. Supported Authentication Methods

**Methods:** Email/password only. No token-based, OAuth, or other authentication methods.

**Implementation:**
- Email/password login: `middleware/auth.js:20-131` (`createLoginHandler`)
- Password hashing: bcrypt with 10 rounds (`middleware/auth.js:7, 193`)
- Session-based after authentication: `middleware/session.js:38-54` (express-session)

**Source:**
- `middleware/auth.js:22` - `const { email, password } = req.body;`
- `middleware/auth.js:67` - `await bcrypt.compare(password, account.password_hash);`
- No other authentication methods found in codebase

---

## 3. Session Creation, Validation, and Expiration

### Session Creation
- Created on successful login: `middleware/auth.js:99-102` - stores `accountId`, `accountEmail`, `emailVerified`, `tabId` in `req.session`
- Character selection creates player session: `middleware/session.js:236-242` - stores `accountId`, `playerName`, `playerId` in `sessionStore`
- Session ID: Uses express-session's `sessionID` (`middleware/session.js:236`)

### Session Validation
- Account session validation: `middleware/auth.js:302-351` (`createGetAccountInfoHandler`) - checks `accountId`, `sessionId`, and `tabId` match
- Player session validation: `middleware/session.js:61-84` (`createValidateSession`) - requires `sessionId`, `playerName`, and non-expired session
- WebSocket session validation: `handlers/game.js:200-241` (`authenticateSession`) - validates HTTP session or test bypass

### Session Expiration
- Account session: 24 hours (`middleware/session.js:48` - `maxAge: 24 * 60 * 60 * 1000`)
- Player session: 24 hours (`middleware/session.js:233` - `expiresAt = Date.now() + (24 * 60 * 60 * 1000)`)
- Cleanup job: Every 5 minutes (`server.js:94-127`) - removes expired sessions from `sessionStore` and orphaned account sessions

**Sources:**
- `middleware/session.js:38-54` - Session middleware configuration
- `middleware/session.js:25-32` - `cleanupExpiredSessions()` function
- `server.js:94-127` - Session cleanup interval

---

## 4. Canonical Rules for Multi-Character Accounts

**Rules:**
1. One account can have multiple characters (one-to-many via `user_characters` table)
2. Character limit: 2 characters for normal accounts, unlimited for accounts with at least one god mode character
3. Characters are linked to account via `user_characters` table with `(account_id, player_id)` unique constraint
4. Character ownership verified on selection: `middleware/session.js:212-218` - checks character belongs to account

**Sources:**
- `migrations/022_accounts_system.sql:17-23` - `user_characters` table with UNIQUE constraint
- `routes/api.js:409-421` - Character limit logic: `const maxCharacters = hasGodModeCharacter ? Infinity : 2;`
- `middleware/session.js:213-218` - Ownership verification

---

## 5. Character Switching During Active Session

**Behavior:** Character switching requires selecting a new character, which creates a new player session. Old player session remains in `sessionStore` but is not used.

**Implementation:**
- Character selection endpoint: `middleware/session.js:146-258` (`createCharacterSelectionHandler`)
- Multiple sessions allowed: `middleware/session.js:220-230` - logs existing sessions but doesn't prevent new ones
- WebSocket connection handling: `handlers/game.js:262-349` - if player already connected, disconnects old connection before allowing new one

**Source:**
- `middleware/session.js:232-242` - Creates new session on character selection
- `handlers/game.js:275-349` - Handles existing connection when switching characters

---

## 6. Required Fields for Account and Character Records

### Accounts Table
- `id` (SERIAL PRIMARY KEY) - Required
- `email` (TEXT NOT NULL UNIQUE) - Required, validated format
- `password_hash` (TEXT NOT NULL) - Required
- `email_verified` (BOOLEAN NOT NULL DEFAULT FALSE) - Optional, defaults to FALSE
- `created_at` (BIGINT NOT NULL DEFAULT) - Required, auto-set
- `last_login_at` (BIGINT) - Optional

**Source:** `migrations/022_accounts_system.sql:4-12`

### User_Characters Table
- `id` (SERIAL PRIMARY KEY) - Required
- `account_id` (INTEGER NOT NULL REFERENCES accounts(id)) - Required
- `player_id` (INTEGER NOT NULL REFERENCES players(id)) - Required
- `created_at` (BIGINT NOT NULL DEFAULT) - Required, auto-set
- UNIQUE constraint on `(account_id, player_id)`

**Source:** `migrations/022_accounts_system.sql:17-23`

### Players Table (Character Records)
- Created via `database.js:360-397` (`createPlayer`)
- Required fields: `name`, `current_room_id`, stats (all default to 5), abilities (all default to 0), `assignable_points` (defaults to 5)
- Auto-linked to account via `user_characters` on creation

**Source:** `database.js:360-397`

---

## 7. Login Loads Global Account Data First or Specific Character

**Behavior:** Login loads global account data first, then user selects a character. Character selection happens after login.

**Flow:**
1. Login: `middleware/auth.js:94-95` - Gets user's characters list
2. Returns account info + characters: `middleware/auth.js:117-124` - `{ success: true, accountId, email, emailVerified, characters }`
3. Character selection: Separate endpoint `POST /api/select-character` (`middleware/session.js:146-258`)
4. Character session created: Only after character selection (`middleware/session.js:236-242`)

**Source:**
- `middleware/auth.js:94-95` - `const characters = await db.getUserCharacters(account.id);`
- `middleware/auth.js:117-124` - Returns account + characters (no player session yet)
- `middleware/session.js:146-258` - Character selection handler (creates player session)

---

## 8. Terminal Pop-Out Feature Authentication

**Behavior:** Terminal pop-out uses the same HTTP session as the main client. Authentication is shared via cookies.

**Implementation:**
- Popup window opened with URL parameters: `public/index.html:608` - `/game?popup=true&playerName=...&windowId=...`
- Session cookies shared: Same origin, same cookies (`middleware/session.js:45-48` - cookie configuration)
- WebSocket authentication: `handlers/game.js:200-241` - Uses same session validation as main window

**Source:**
- `public/index.html:608` - Popup window URL format
- `public/js/core/Game.js:85-144` - Popup detection and initialization
- `handlers/game.js:200-241` - WebSocket authentication (uses same session)

---

## 9. Terminal Session Attach/Detach from Main Client

**Behavior:** Terminal sessions are tracked via `windowId` and communicate via `postMessage` API. Sessions remain active until explicitly closed.

**Implementation:**
- Window ID tracking: `handlers/game.js:203-204` - `windowId` from message data or context
- Window registration: `handlers/game.js:402-412` - Registers in `activeCharacterWindows` Map
- Parent-child communication: `public/js/core/Game.js:97-127` - `postMessage` API for WINDOW_OPENED, WINDOW_HEARTBEAT, WINDOW_CLOSED
- Heartbeat: Every 2 seconds (`public/js/core/Game.js:104-117`)
- Detach: `routes/api.js:326-381` - `/api/close-character-window` endpoint explicitly removes from `activeCharacterWindows`

**Sources:**
- `handlers/game.js:203-204, 402-412` - Window ID tracking and registration
- `public/js/core/Game.js:97-127` - Parent-child communication
- `routes/api.js:326-381` - Window close endpoint

---

## 10. Security Boundaries Between Main UI and Terminal UI

**Boundaries:**
1. Same-origin policy: `public/js/core/Game.js:121` - `if (event.origin !== window.location.origin) return;`
2. Tab ID validation: `middleware/auth.js:308-315` - Tab ID mismatch destroys session
3. Session validation: `middleware/auth.js:318-327` - Checks session hasn't been replaced
4. Cookie-based session: `middleware/session.js:45-48` - HttpOnly, secure in production, sameSite

**Sources:**
- `public/js/core/Game.js:121` - Origin check
- `middleware/auth.js:308-315` - Tab ID validation
- `middleware/session.js:45-48` - Cookie security settings

---

## 11. Concurrent Sessions (Multiple Terminals, Multiple Characters)

**Rules:**
1. **One account session per tab:** `middleware/auth.js:77-86` - New login in different tab invalidates old session (if different `tabId`)
2. **Multiple character windows per account:** `server.js:146-147` - `activeCharacterWindows` Map tracks multiple characters
3. **One WebSocket connection per character:** `handlers/game.js:262-349` - If same character connects again, disconnects old connection
4. **Multiple characters can be active simultaneously:** `routes/api.js:293-314` - Returns all active windows for account

**Sources:**
- `middleware/auth.js:77-86` - Account session invalidation logic
- `server.js:146-147` - `activeCharacterWindows` Map definition
- `handlers/game.js:262-349` - WebSocket connection handling
- `routes/api.js:293-314` - Active windows endpoint

---

## 12. Rate Limits or Cooldowns for Login Attempts

**Rate Limits:**
- Login attempts: 10 attempts per 5 minutes per IP (`middleware/auth.js:25-39`)
- Registration attempts: 5 attempts per 10 minutes per IP (`middleware/auth.js:144-158`)
- Character selection: 30 attempts per 30 seconds per IP (`middleware/session.js:169-183`)

**Implementation:**
- In-memory Map: `middleware/auth.js:12` - `authAttempts = new Map()`
- Reset on success: `middleware/auth.js:92` - `authAttempts.delete(clientIp)` on successful login
- No persistent storage: Rate limits are lost on server restart

**Sources:**
- `middleware/auth.js:25-39` - Login rate limiting
- `middleware/auth.js:144-158` - Registration rate limiting
- `middleware/session.js:169-183` - Character selection rate limiting

---

## 13. Failed Logins and Lockouts

**Behavior:**
- Failed login logged: `middleware/auth.js:62, 69` - `console.log('Security: Failed login attempt...')`
- Generic error message: `middleware/auth.js:63, 70` - `'Invalid email or password'` (prevents enumeration)
- Rate limiting only: No account lockout, only IP-based rate limiting
- No lockout after N failures: No account-level lockout mechanism found

**Sources:**
- `middleware/auth.js:62-64, 69-71` - Failed login handling
- No lockout mechanism found in codebase

---

## 14. Account Permissions and Roles Integration with God Mode

**Implementation:**
- God mode checked via player flag: `middleware/session.js:134` - `req.player.flag_god_mode !== 1`
- No account-level roles: Only player-level `flag_god_mode` flag
- God mode access: `middleware/session.js:129-139` (`checkGodMode`) - Requires valid session + `flag_god_mode === 1`
- Character limit based on god mode: `routes/api.js:411-412` - `const hasGodModeCharacter = characters.some(char => char.flag_god_mode === 1 || char.flag_god_mode === true);`

**Sources:**
- `middleware/session.js:129-139` - God mode check
- `routes/api.js:411-412` - God mode character limit logic

---

## 15. Active Character State Loaded and Synced Post-Login

**Flow:**
1. Character selection: `middleware/session.js:206` - Gets player by name
2. WebSocket connection: `handlers/game.js:200-241` - Authenticates session
3. Initial state sent: `handlers/game.js:414-526` - Sends `roomUpdate`, `playerStats`, `inventory`, etc.
4. State synced via WebSocket: All game state changes broadcast via WebSocket messages

**Sources:**
- `middleware/session.js:206` - Player lookup on selection
- `handlers/game.js:200-241` - WebSocket authentication
- `handlers/game.js:414-526` - Initial state sending (after authentication)

---

## 16. Character Creation and Deletion Validation

### Character Creation
**Validation:**
- Name required: `routes/api.js:389-393` - Must be string, 2-50 characters
- Name format: `routes/api.js:404` - `/^[a-zA-Z0-9_]+$/` (letters, numbers, underscores only)
- Name uniqueness: `routes/api.js:424-427` - Checks if name already exists
- Character limit: `routes/api.js:409-421` - 2 for normal accounts, unlimited for god mode accounts
- Account session required: `routes/api.js:385-387` - Must have `req.session.accountId`

**Source:** `routes/api.js:383-451`

### Character Deletion
**Not found in codebase.** No character deletion endpoint or function found. Only account removal script exists (`scripts/remove-account.js`) which deletes entire account and all characters.

**Source:** No deletion endpoint found. Only `database.js:2528-2533` (`removeCharacterFromAccount`) exists but is not exposed via API.

---

## 17. Terminal Pop-Out Supports Command-Only, Full UI, or Hybrid Modes

**Mode:** Full UI mode only. Terminal pop-out opens `game.html` with full game interface.

**Implementation:**
- Popup URL: `public/index.html:608` - `/game?popup=true&playerName=...&windowId=...`
- Same game interface: Opens same `/game` route as main window
- No command-only mode: No terminal-only or command-line interface found

**Source:**
- `public/index.html:608` - Popup window URL
- `routes/api.js:492-514` - `/game` route serves `game.html` (full UI)

---

## 18. Event Propagation Rules Across Multiple Active Terminals

**Rules:**
1. **Parent-child communication:** `postMessage` API (`public/js/core/Game.js:97-127`)
2. **Message types:** WINDOW_OPENED, WINDOW_HEARTBEAT, WINDOW_CLOSED, WINDOW_CLOSE_REQUEST
3. **Origin check:** `public/js/core/Game.js:121` - Only accepts messages from same origin
4. **No cross-terminal events:** Terminals don't communicate with each other, only with parent
5. **Server broadcasts:** Game events broadcast to all players in room via WebSocket (`handlers/game.js` - various broadcast functions)

**Sources:**
- `public/js/core/Game.js:97-127` - Parent-child communication
- `public/index.html:645-674` - Message handling
- `handlers/game.js` - Server-side WebSocket broadcasts

---

## 19. Logging and Audit Requirements for Auth and Session Transitions

**Logging:**
1. **Failed login attempts:** `middleware/auth.js:62, 69` - `console.log('Security: Failed login attempt...')`
2. **Successful login:** `middleware/auth.js:116` - `console.log('User logged in: ${account.email}...')`
3. **Character selection:** `middleware/session.js:254` - `console.log('Character selected: ${player.name}...')`
4. **Session cleanup:** `server.js:122` - `console.log('Cleaning up orphaned account session...')`
5. **Window registration:** `handlers/game.js:412` - `console.log('Registered/updated window...')`

**Audit:**
- **No formal audit trail:** No database table for audit logs
- **Console logging only:** All security events logged to console
- **No retention policy:** Logs are ephemeral (console output)

**Sources:**
- `middleware/auth.js:62, 69, 116` - Login logging
- `middleware/session.js:254` - Character selection logging
- `server.js:122` - Session cleanup logging
- No audit table found in migrations

---

## 20. Enforcement Level: Guideline, Standard, or Canonical Law

**Enforcement Level:** **Canonical Law** (strictly enforced in code)

**Evidence:**
1. **Database constraints:** `migrations/022_accounts_system.sql:11` - Email format CHECK constraint
2. **Session validation:** `middleware/session.js:61-84` - Hard validation, returns 401 if invalid
3. **Tab ID enforcement:** `middleware/auth.js:308-315` - Tab ID mismatch destroys session
4. **Rate limiting enforced:** `middleware/auth.js:30-32` - Returns 429 if rate limit exceeded
5. **Character ownership enforced:** `middleware/session.js:212-218` - Returns 403 if character not owned
6. **God mode enforced:** `middleware/session.js:134-136` - Returns 403 if not god mode

**Sources:**
- `migrations/022_accounts_system.sql:11` - Database constraint
- `middleware/session.js:61-84` - Session validation
- `middleware/auth.js:308-315` - Tab ID enforcement
- All validation functions return HTTP error codes (not warnings)

---

## Summary

### Strengths
- Clear separation of account and character sessions
- Tab-based session isolation prevents cross-tab session sharing
- Multi-character support with proper ownership validation
- Rate limiting on authentication endpoints
- WebSocket session validation

### Weaknesses
- No character deletion API endpoint
- No formal audit trail (console logging only)
- Rate limits lost on server restart (in-memory only)
- No account lockout mechanism
- No persistent session storage (MemoryStore only)

### Risks
- Session data lost on server restart (MemoryStore)
- No audit trail for security incidents
- Rate limits can be bypassed by IP rotation
- Multiple character sessions can exist simultaneously (may cause confusion)

### Known Gaps
1. **Character deletion:** No API endpoint to delete characters
2. **Audit logging:** No database table for security event audit trail
3. **Session persistence:** MemoryStore loses sessions on restart
4. **Account lockout:** No mechanism to lock accounts after repeated failures
5. **Terminal command-only mode:** Not implemented (full UI only)

---

**File References:**
- `middleware/auth.js` - Authentication handlers
- `middleware/session.js` - Session management
- `handlers/game.js` - WebSocket authentication
- `routes/api.js` - API endpoints
- `database.js` - Database operations
- `migrations/022_accounts_system.sql` - Database schema
- `public/index.html` - Frontend login/character selection
- `public/js/core/Game.js` - Popup window handling
- `server.js` - Session cleanup





