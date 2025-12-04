# Node Game Server Implementation Plan

## Authentication System (Email/Password)

### Overview
The game uses an email/password authentication system with account-based character management. Users register/login with an email address and password, then select from characters associated with their account.

### Database Schema

#### `accounts` Table
- `id` (SERIAL PRIMARY KEY)
- `email` (TEXT UNIQUE) - User's email address (lowercase, validated format)
- `password_hash` (TEXT) - Bcrypt hashed password (10 rounds)
- `email_verified` (BOOLEAN) - Ready for future email verification (defaults to FALSE)
- `created_at` (BIGINT) - Timestamp in milliseconds
- `last_login_at` (BIGINT) - Timestamp of last successful login

#### `user_characters` Table
- `id` (SERIAL PRIMARY KEY)
- `account_id` (INTEGER REFERENCES accounts(id)) - Links to account
- `player_id` (INTEGER REFERENCES players(id)) - Links to player character
- `created_at` (BIGINT) - Timestamp in milliseconds
- UNIQUE constraint on (account_id, player_id)

### Authentication Flow

1. **Registration** (`POST /api/register`)
   - Validates email format (basic regex, no actual email verification yet)
   - Validates password (min 4 characters, max 100)
   - Checks for duplicate email
   - Hashes password with bcrypt (10 rounds)
   - Creates account with `email_verified = FALSE`
   - Creates session with `accountId`
   - Returns account info and empty character list

2. **Login** (`POST /api/login`)
   - Validates email format
   - Looks up account by email
   - Verifies password with bcrypt
   - Updates `last_login_at`
   - Creates session with `accountId`
   - Returns account info and character list
   - Login screen includes "Forgot Password?" link

3. **Forgot Password** (`POST /api/request-password-reset`)
   - Accessible from login screen via "Forgot Password?" link
   - Opens modal dialog for email input
   - Validates email format
   - If account exists, generates password reset token (1-hour expiration)
   - Sends password reset email with reset link
   - Always returns success message (prevents email enumeration)
   - User receives email with link to `/reset-password?token=...`

4. **Password Reset** (`POST /api/reset-password`)
   - User clicks link in email, navigates to `/reset-password?token=...`
   - Validates reset token (must be valid, not expired, not used)
   - Validates new password (min 4 characters, max 100)
   - Hashes new password with bcrypt
   - Updates account password
   - Marks reset token as used
   - User can then login with new password

5. **Character Selection** (`POST /api/select-character`)
   - Requires valid account session
   - Validates character exists
   - Verifies character belongs to account (security check)
   - Creates player session (sets `playerName` and `playerId` in session)
   - Redirects to `/game`

6. **Logout** (`POST /api/logout`)
   - Destroys session
   - Returns to login screen

### Security Features

- **Password Hashing**: Bcrypt with 10 rounds
- **Rate Limiting**: 
  - Login: 10 attempts per 5 minutes per IP
  - Registration: 5 attempts per 10 minutes per IP
- **Session Management**: Express-session with secure cookies
- **Character Ownership Validation**: Characters can only be selected if they belong to the account
- **Email Format Validation**: Basic regex validation (ready for future email verification)

### UI Flow

1. **Landing Page** (`/`)
   - Shows login/register tabs
   - Login form includes "Forgot Password?" link below login button
   - Clicking "Forgot Password?" opens modal dialog
   - Modal allows user to enter email and request password reset
   - If already logged in (has account session), shows character selection
   - If character already selected, redirects to `/game`

2. **Character Selection**
   - Displays account email
   - Shows list of characters owned by account
   - Character badges: "GOD" for god mode, "NOOB" for always-first-time flag
   - Logout button

3. **Game** (`/game`)
   - Requires valid player session
   - If no player session, redirects to `/`

### Initial Account

- **Email**: brian@brianfloyd.me
- **Password**: test
- **Characters**: Fliz, Hebron, noob (linked via migration)

### Account Removal Script (Testing Only)

A testing-only script for removing accounts and all associated data from the database.

#### Usage
```bash
npm run remove-account <email>
```

#### What Gets Deleted
- Account record
- All characters/players associated with the account
- Player inventory (player_items)
- Player bank storage (player_bank)
- Warehouse items and warehouse ownership (warehouse_items, player_warehouses)
- Terminal history (player's own history only)
- Lore keeper data (greetings, item awards)
- User character links (user_characters)
- Email verification tokens
- Password reset tokens

#### What is NOT Deleted
- Player names appearing in another player's backscroll (terminal_history from other players)
- Broadcasting system conversations (terminal_history from other players)

**Note**: This script is for testing only and will be reworked for production with proper constraints and safety checks.

### Email Verification System

The game uses an email verification system with a 7-day grace period for new accounts.

#### Grace Period
- New accounts can play for **7 days** without verifying their email
- After 7 days, email verification is **required** to continue playing
- Verified accounts have unlimited access (no grace period expiration)

#### Verification Flow
1. **Registration**: Account is created with `email_verified = FALSE`
   - Verification email is automatically sent with a 24-hour expiration token
   - User can play immediately during the 7-day grace period

2. **During Grace Period**: 
   - Character selection screen displays days remaining (e.g., "You have 5 days remaining to verify your email")
   - "Resend Verification Email" button is available if email was lost or missed
   - User can continue playing normally

3. **After Grace Period**:
   - Character selection is blocked until email is verified
   - Game access is blocked until email is verified
   - User must click verification link in email or use "Resend Verification Email" button

#### Character Selection Screen Features
- **Days Remaining Display**: Shows countdown of days left in grace period (if unverified)
- **Resend Verification Email Button**: Allows users to request a new verification email
  - Button appears only for unverified accounts
  - Generates new 24-hour verification token
  - Sends email with verification link

#### API Endpoints

- `GET /api/verify-email?token=<token>` - Verify email using token from email link
- `POST /api/resend-verification-email` - Resend verification email (requires account session)
- `GET /api/account` - Returns account info including `daysRemainingForVerification`

#### Database Functions

- `isAccountWithinGracePeriod(accountId)` - Returns true if account is verified OR created within last 7 days
- `getDaysRemainingForVerification(accountId)` - Returns days remaining in grace period (null if verified, can be negative if expired)

### Password Reset Flow

1. **Request Password Reset**:
   - User clicks "Forgot Password?" link on login screen
   - Modal dialog appears with email input field
   - User enters email and clicks "Send Reset Link"
   - System sends password reset email (if account exists)
   - Success message displayed (always shows success to prevent email enumeration)

2. **Reset Password**:
   - User receives email with reset link: `/reset-password?token=...`
   - Clicking link opens password reset page
   - User enters new password and confirms
   - System validates token and updates password
   - User redirected to login screen to login with new password

### Future Enhancements

- Account management (change email, change password)
- Character creation UI (currently requires admin/god mode)
- Multi-account support per email (if needed)

### API Endpoints

- `POST /api/register` - Create new account
- `POST /api/login` - Login with email/password
- `POST /api/logout` - Logout and destroy session
- `GET /api/account` - Get current account info and characters (requires session)
- `POST /api/select-character` - Select character to play (requires account session)
- `POST /api/request-password-reset` - Request password reset email (public)
- `POST /api/reset-password` - Reset password with token (public)
- `GET /reset-password` - Password reset page (public, requires token query param)

### Database Functions (`database.js`)

- `createAccount(email, passwordHash)` - Create new account
- `getAccountByEmail(email)` - Get account by email
- `getAccountById(accountId)` - Get account by ID
- `updateLastLogin(accountId)` - Update last login timestamp
- `getUserCharacters(accountId)` - Get all characters for an account
- `addCharacterToAccount(accountId, playerId)` - Link character to account
- `removeCharacterFromAccount(accountId, playerId)` - Unlink character from account

### Session Structure

Session now includes:
- `accountId` - Account ID (set on login/register)
- `accountEmail` - Account email
- `emailVerified` - Email verification status
- `playerName` - Selected character name (set on character selection)
- `playerId` - Selected character ID (set on character selection)

---

# Node Game Server Implementation Plan

## Project Structure
```
thegame/
├── package.json
├── server.js                   # ~200 lines: Express/WS setup, wiring
├── database.js                 # PostgreSQL async database module
├── npcLogic.js                 # NPC AI behavior logic
├── handlers/                   # WebSocket message handlers
│   ├── index.js               # Message dispatcher/router
│   ├── game.js                # Core gameplay (move, look, take, drop, harvest)
│   ├── mapEditor.js           # Map editing (God Mode)
│   ├── npcEditor.js           # NPC editing (God Mode)
│   ├── itemEditor.js          # Item editing (God Mode)
│   └── playerEditor.js        # Player editing (God Mode)
├── middleware/
│   └── session.js             # Session config, validation middleware
├── routes/
│   └── api.js                 # HTTP routes for pages and API
├── services/
│   └── npcCycleEngine.js      # NPC tick loop, harvest sessions
├── utils/
│   └── broadcast.js           # Shared broadcast/room helpers
├── public/
│   ├── index.html
│   ├── game.html
│   ├── map-editor.html
│   ├── npc-editor.html
│   ├── item-editor.html
│   ├── player-editor.html
│   ├── style.css
│   ├── client.js
│   ├── map-editor.js
│   ├── npc-editor.js
│   ├── item-editor.js
│   └── player-editor.js
├── scripts/
│   ├── migrate.js
│   └── migrate-data.js
├── migrations/
│   ├── 001_schema.sql
│   ├── 002_seed_data.sql
│   └── 003_indexes.sql
├── docs/
│   ├── requirements.md
│   └── claude.md
└── nixpacks.toml
```

## Server Architecture

The server is modularized into distinct handler files for maintainability:

### Handler Modules
Each handler module exports functions that receive a context object with:
- `ws` - WebSocket connection
- `db` - Database module
- `connectedPlayers` - Map of connected players
- `factoryWidgetState` - Map of factory widget states
- `connectionId` - Current connection ID
- `playerName` - Current player name

### Message Types by Handler
- **game.js**: `authenticateSession`, `move`, `look`, `inventory`, `take`, `drop`, `harvest`, `factoryWidgetAddItem`
- **mapEditor.js**: `getMapEditorData`, `createMap`, `createRoom`, `deleteRoom`, `updateRoom`, `getAllMaps`, `connectMaps`, `disconnectMap`, `getAllRoomTypeColors`, `setRoomTypeColor`, `getJumpMaps`, `getJumpRooms`, `jumpToRoom`, `getRoomItemsForEditor`, `addItemToRoom`, `removeItemFromRoom`, `clearAllItemsFromRoom`
- **npcEditor.js**: `getAllNPCs`, `createNPC`, `updateNPC`, `getNpcPlacements`, `getNpcPlacementRooms`, `addNpcToRoom`, `removeNpcFromRoom`
- **itemEditor.js**: `getAllItems`, `createItem`, `updateItem`
- **playerEditor.js**: `getAllPlayers`, `updatePlayer`, `getPlayerInventory`, `addPlayerInventoryItem`, `removePlayerInventoryItem`

## Implementation Steps

### 1. Initialize Project and Dependencies
- Create `package.json` with dependencies:
  - `express` - web server
  - `ws` - WebSocket library
  - `pg` - PostgreSQL database client (async)
  - `dotenv` - Environment variable management
  - `nodemon` - Development tool for auto-restart (dev dependency)
- Set up npm scripts for running the server (`start`, `dev`, `migrate`)

### 2. Database Setup (`database.js`)
- Initialize PostgreSQL connection pool using `pg`
- All database functions are async (return Promises)
- Schema defined in SQL migration files
- Create `rooms` table with columns: `id`, `name`, `description`, `x`, `y` (coordinate-based map)
- Create `players` table with columns:
  - Basic: `id`, `name` (unique constraint), `current_room_id` (foreign key to rooms)
  - **Stats** (all default 10): `brute_strength`, `life_force`, `cunning`, `intelligence`, `wisdom`
  - **Abilities** (all default 0): `crafting`, `lockpicking`, `stealth`, `dodge`, `critical_hit`
  - **Resources**: `hit_points` (default 50), `max_hit_points` (default 50), `mana` (default 0), `max_mana` (default 0)
- Database migration: Automatically adds new columns to existing databases
- Insert initial data:
  - **Map Structure**: 20x20 grid (coordinates -10 to +9)
    - **Perimeter Rooms**: Outer square boundary
      - Westwall Street (x = -10): 20 rooms along western edge
      - Eastwall Street (x = 9): 20 rooms along eastern edge
      - North Street (y = 9): 20 rooms along northern edge
      - South Street (y = -10): 20 rooms along southern edge
    - **Center Street**: Vertical road (x = 0) connecting north to south
      - 20 rooms total, including the 3 original special rooms
      - Town Square at (0, 0) - center intersection
      - Northern Room at (0, 1) - on Center Street
      - Southern Room at (0, -1) - on Center Street
  - **Total Rooms**: ~80 rooms (perimeter + center street, with corner overlap)
  - Players: "Fliz" and "Hebron" (both start in town square, current_room_id=1)
  - **Database Cleanup**: Automatic migration removes invalid rooms (district/interior rooms) while preserving player data
  - **Player Stats**:
    - Fliz: All stats 10, all abilities 0, 50/50 HP, 0 Mana (not a caster)
    - Hebron: All stats 10, all abilities 0, 50/50 HP, 10/10 Mana
- Enhanced room descriptions with detailed narrative text

### 3. Server Setup (`server.js`)
- Create Express server listening on port 3434
- Serve static files from `public/` directory
- Set up WebSocket server using `ws` library
- WebSocket connection handling:
  - Track connected players (player name -> WebSocket connection)
  - Track which room each player is in (from database)
  - Handle player movement: validate direction (N/S/E/W/NE/NW/SE/SW/U/D), check if adjacent room exists at target coordinates, update database
  - Broadcast player join/leave events to all clients in the same room (real-time)
  - Broadcast player movement events when players change rooms
  - Handle player selection and room entry messages
  - Only show connected players in room (not all players from database)
  - Send player stats to client on connection via WebSocket
- Movement logic: 
  - Calculate target coordinates (N: y+1, S: y-1, E: x+1, W: x-1, NE: x+1,y+1, etc.)
  - Query database for room at those coordinates
  - Support diagonal directions (NE, NW, SE, SW)
  - Support vertical directions (U, D) - prepared for future z-coordinate implementation
- Error messages: "Ouch! You walked into the wall to the [direction]." when movement fails
- Room persistence: Players rejoin in the room they left

### 4. Frontend - MajorMUD-Style Interface (`public/index.html`)
- Player selection screen with two options: "Fliz" and "Hebron"
- Game view with split layout:
  - **Left 2/3**: Text terminal (MUD-style interface)
  - **Right 1/3**: Divided into 4 quadrants
    - Top-left quadrant: Player Stats widget
    - Top-right quadrant: Compass widget
    - Bottom-left quadrant: Map widget (25x25 grid view)
    - Bottom-right quadrant: Reserved for future features
- Text terminal displays:
  - Room name (yellow, uppercase)
  - Room description (green, formatted text)
  - "Also here:" section with player names (cyan, inline)
  - Command prompt at bottom with `>` symbol
- Compass widget with all 8 cardinal/intercardinal directions plus Up/Down buttons

### 5. Frontend Styling (`public/style.css`)
- MajorMUD-style retro terminal aesthetic:
  - Black background with green text (#00ff00)
  - Yellow for room names (#ffff00)
  - Cyan for player names (#00ffff)
  - Red for error messages (#ff0000)
  - Monospace font (Courier New)
- Terminal container (2/3 width):
  - Scrollable content area
  - Custom scrollbar styling
  - Command line with prompt
- Right panel (1/3 width):
  - 4-quadrant grid layout
  - Player Stats widget in top-left quadrant
  - Compass widget in top-right quadrant
  - Smaller widgets (max-width 200px) for compact display
- Compass button states:
  - Available: Bright green border and text
  - Unavailable: Lowlighted (40% opacity, dark colors) but still visible
  - All buttons always visible for centered appearance
- Player Stats widget styling:
  - Retro terminal aesthetic matching game theme
  - Green borders and text (#00ff00)
  - Yellow section titles (#ffff00)
  - Cyan stat labels (#00ffff)
  - Visual HP bar (red) and Mana bar (blue)
  - Compact layout with organized sections
- Responsive design for smaller screens

### 6. Frontend WebSocket Client (`public/client.js`)
- Connect to WebSocket server
- Handle player selection: send player name to server
- Text command system:
  - Command line input at bottom of terminal
  - Supports full words: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`, `up`, `down`
  - Supports abbreviations: `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`, `u`, `d`
  - Command normalization and validation
- Compass widget interaction:
  - Clickable direction buttons
  - Only available directions are enabled
  - All directions visible but unavailable ones are lowlighted
- Real-time updates:
  - Listen for room state updates (who's in the room, room details, available exits)
  - Update UI instantly when other players join/leave the current room
  - Update UI instantly when other players move to/from adjacent rooms
  - Display real-time player list
- Player list management:
  - "Also here:" and player names on same line
  - Multiple players comma-separated
  - "No one else is here." when room is empty
  - Automatically removes "No one else is here." when player joins
  - Automatically restores "No one else is here." when last player leaves
- Player movement notifications:
  - When a player enters: "[PlayerName] enters from the [opposite direction]." (e.g., "Fliz enters from the south.")
  - When a player leaves: "[PlayerName] left to the [direction]." (e.g., "Fliz left to the west.")
  - For teleports/connections: "[PlayerName] has arrived." / "[PlayerName] has left."
  - Player names highlighted in cyan, message text in gray italic
- Terminal display:
  - Room name, description, and players displayed in terminal
  - Auto-scroll to bottom on updates
  - Error messages displayed in terminal
- Map display:
  - 25x25 grid view centered on player's current room
  - Rooms displayed as squares (current room highlighted in green with yellow border)
  - Connection lines between adjacent rooms in all 8 directions
  - Automatically re-centers when player moves
  - Canvas-based rendering with retro terminal aesthetic
  - Shows all rooms within 25x25 viewport
- Player stats display:
  - Receives player stats from server on connection
  - Displays all 5 attributes (Brute Strength, Life Force, Cunning, Intelligence, Wisdom)
  - Displays all 5 abilities (Crafting, Lockpicking, Stealth, Dodge, Critical Hit)
  - Shows Hit Points with current/max and visual bar
  - Shows Mana with current/max and visual bar (only if maxMana > 0)
  - Updates automatically when stats change

### 7. WebSocket Message Protocol
- Client → Server:
  - `{ type: 'selectPlayer', playerName: 'Fliz' }` - when player selects character
  - `{ type: 'move', direction: 'N' }` - when player wants to move (N/S/E/W/NE/NW/SE/SW/U/D)
- Server → Client:
  - `{ type: 'roomUpdate', room: { id, name, description, x, y }, players: ['Fliz'], exits: { north: true, south: true, east: false, west: false, northeast: false, ... } }` - room state updates
  - `{ type: 'playerJoined', playerName: 'Hebron' }` - when someone joins current room
  - `{ type: 'playerLeft', playerName: 'Fliz' }` - when someone leaves current room
  - `{ type: 'moved', room: { id, name, description, x, y }, players: [...], exits: {...} }` - when player successfully moves to new room
  - `{ type: 'playerStats', stats: { bruteStrength, lifeForce, cunning, intelligence, wisdom, crafting, lockpicking, stealth, dodge, criticalHit, hitPoints, maxHitPoints, mana, maxMana } }` - player stats sent on connection
  - `{ type: 'mapData', rooms: [{ id, name, x, y }, ...], currentRoom: { x, y } }` - all rooms data sent on connection
  - `{ type: 'mapUpdate', currentRoom: { x, y } }` - map position update when player moves
  - `{ type: 'error', message: 'Ouch! You walked into the wall to the east.' }` - error messages

## Key Files

1. **package.json** - Project dependencies and scripts
2. **database.js** - SQLite initialization and queries (including coordinate-based room queries)
3. **server.js** - Express server + WebSocket server + movement handling
4. **public/index.html** - Frontend HTML with MajorMUD-style layout
5. **public/style.css** - Retro terminal styling
6. **public/client.js** - WebSocket client and UI logic with text commands
7. **docs/requirements.md** - This documentation file

## Technical Decisions

- Using `pg` (PostgreSQL) for async database operations
- All database functions return Promises and use `async/await`
- Schema managed via SQL migration files in `migrations/` directory
- WebSocket server integrated with Express HTTP server
- Real-time updates via WebSocket broadcasts (no polling)
- Simple JSON message protocol for WebSocket communication
- Coordinate-based map system: rooms have x,y coordinates (e.g., town square at 0,0, north at 0,1, south at 0,-1)
- Movement validation: server checks if adjacent room exists at target coordinates before allowing movement
- Players track their current room in database for persistence (players rejoin where they left)
- Direction mapping: 
  - N=(0,+1), S=(0,-1), E=(+1,0), W=(-1,0)
  - NE=(+1,+1), NW=(-1,+1), SE=(+1,-1), SW=(-1,-1)
  - U/D prepared for future z-coordinate implementation
- Only connected players shown in room (not all players from database)
- MajorMUD-style terminal interface for authentic retro gaming experience
- Text command system with multiple command variations for user convenience
- Compass widget always shows all directions (unavailable ones lowlighted) for visual consistency
- Deployment: Railway with PostgreSQL addon (DATABASE_URL automatically provided)
  - **Custom Domain**: `thegame.brianfloyd.me` (CNAME: `t18yqfrw.up.railway.app`)
  - **BASE_URL**: `https://thegame.brianfloyd.me` (used for email links, password resets, etc.)
  - **Session Cookie Configuration**: 
    - Production uses `sameSite: 'lax'` (instead of 'strict') to work with Railway's proxy and redirects
    - Development uses `sameSite: 'strict'` for better security in local environment
  - **Trust Proxy**: Express `trust proxy` is set to `1` to properly handle Railway's reverse proxy
  - **Cookie Security**: 
    - `secure: true` in production (HTTPS only)
    - `httpOnly: true` (prevents JavaScript access)
    - `maxAge: 24 hours`
  - **Database Sync**: Safe dev-to-prod sync system
    - Syncs game content (maps, rooms, NPCs, items) from dev to production
    - **Protects user data**: Never syncs accounts, players, inventory, bank balances
    - Dry-run mode for previewing changes
    - Transaction-based with rollback on error
    - See `docs/database-sync-guide.md` for detailed instructions
    - Test scenario: `npm run test-sync-safety`
  - **Database Management**: DBeaver setup for manual database access
    - Automated connections to both dev and prod databases
    - Clear visual indicators (🔵 DEV / 🔴 PROD)
    - Auto-connect on startup
    - Safety features and best practices
    - See `docs/dbeaver-railway-connection-guide.md` for complete setup
    - Helper scripts: `scripts/railway-db-proxy.ps1`, `scripts/start-dbeaver-with-proxy.ps1`

## UI/UX Features

- **Layout**: 2/3 terminal, 1/3 right panel (4 quadrants)
- **Terminal**: Retro green-on-black text interface
- **Player Stats**: Comprehensive stat display in top-left quadrant
  - Attributes section (5 stats)
  - Abilities section (5 abilities)
  - Hit Points bar with current/max display
  - Mana bar with current/max display (caster only)
- **Map**: 25x25 grid view in bottom-left quadrant
  - Shows rooms as squares with connection lines
  - Current room highlighted (green with yellow border)
  - Automatically centers on player
  - Displays all rooms within viewport
- **Compass**: Visual navigation widget with all directions visible
- **Commands**: Text-based with multiple input formats
- **Player List**: Inline display with automatic "No one else is here." management
- **Error Messages**: Descriptive wall collision messages
- **Real-time Updates**: Instant visibility of players entering/leaving rooms

## Player Character System

### Dynamic Stats System (Prefix-Based Auto-Detection)
The stats system is **fully dynamic** and uses **prefix-based auto-detection**. Stats are automatically detected from database column names using naming conventions:
- **`stat_*`** - Attributes (base stats like `stat_ingenuity`, `stat_resonance`)
- **`ability_*`** - Abilities (skills like `ability_crafting`, `ability_attunement`)
- **`resource_*`** - Resources (like `resource_max_encumbrance`)
- **`flag_*`** - Special boolean flags (like `flag_god_mode`)

**How It Works:**
- The system queries the database schema on startup
- Automatically detects all columns matching the prefix patterns
- Generates display names from column names (e.g., `stat_ingenuity` → "Ingenuity")
- Converts to camelCase for JavaScript (e.g., `stat_ingenuity` → `ingenuity`)
- Descriptions are retrieved from `stat_metadata` and `ability_metadata` tables

**How to Add a New Stat:**
1. Add the column to the database with the appropriate prefix:
   ```sql
   ALTER TABLE players ADD COLUMN stat_new_stat_name INTEGER DEFAULT 5;
   ```
2. Add metadata entry:
   ```sql
   INSERT INTO stat_metadata (stat_name, description) VALUES ('new_stat_name', 'Description here');
   ```
3. **That's it!** The system will automatically detect and display it - no code changes needed!

**Examples:**
- Add a new attribute: `stat_charisma` → automatically appears in "Attributes" section
- Add a new ability: `ability_archery` → automatically appears in "Abilities" section

### Current Stats (Base 5 for all players)
- **Ingenuity**: Your creative and inventive power used in crafting, factories, and recipe mastery. Enables efficient crafting and unlocking advanced item combinations.
- **Resonance**: Your harmonic connection to the world's pulse and the energy that keeps you in sync. Improves harvesting, lore interactions, and resistance to desync effects.
- **Fortitude**: Your ability to endure strain, pulse feedback, and long harvesting sessions. Reduces fatigue during intense activities and increases stability in hazardous zones.
- **Acumen**: Your sharpness in trade, valuation, and the economic flow of the world. Improves merchant interactions, sale prices, and warehouse/market advantages.

### Current Abilities (Base 0 for all players)
- **Crafting**: Practical use of Ingenuity to turn materials into valuable items and components.
- **Attunement**: The active use of Resonance to sense and manipulate pulse energy and lore systems.
- **Endurance**: The applied form of Fortitude, enabling long periods of harvesting and resistance to pulse strain.
- **Commerce**: The practical application of Acumen used in trading, negotiation, and economic optimization.

### Resources
- **Encumbrance**: Carrying capacity (max 100 by default)

### Stat and Ability Metadata
Descriptions for stats and abilities are stored in separate metadata tables:
- **`stat_metadata`**: Stores descriptions for all stats (key: stat name without `stat_` prefix)
- **`ability_metadata`**: Stores descriptions for all abilities (key: ability name without `ability_` prefix)

These descriptions are displayed in the UI via tooltips and inline text, and can be retrieved dynamically via the `/api/stat-ability-metadata` endpoint.

## Map System

### Structure
- **20x20 Grid**: Coordinates range from -10 to +9 in both X and Y directions
- **Perimeter**: Outer square boundary roads
  - Westwall Street (x = -10): Western boundary
  - Eastwall Street (x = 9): Eastern boundary
  - North Street (y = 9): Northern boundary
  - South Street (y = -10): Southern boundary
- **Center Street**: Vertical road (x = 0) connecting north to south
  - Passes through Town Square at center (0, 0)
  - Includes original special rooms (Northern Room, Southern Room)

### Map Widget Features
- **25x25 Viewport**: Shows 25x25 grid area centered on player
- **Dynamic Centering**: Automatically re-centers when player moves
- **Room Visualization**: 
  - Rooms as squares (8x8 pixels)
  - Current room: Green fill with yellow border
  - Other rooms: Gray fill with dark border
- **Connection Lines**: Gray lines connecting adjacent rooms in all 8 directions
- **Coordinate System**: Y-axis properly inverted (north = up on screen)

### Database Management
- **Automatic Cleanup**: Removes invalid rooms (not on perimeter or center street)
- **Player Safety**: Moves players to Town Square before deleting their current room
- **Migration**: Handles existing databases gracefully

## Scriptable NPCs System (Glowroot Region)

### Database Structure
- **Table**: `scriptable_npcs`
- **Purpose**: Stores NPCs that can be interacted with through scriptable mechanics
- **Columns**:
  - `id`: Primary key
  - `name`: NPC name
  - `description`: NPC description
  - `npc_type`: Type of interaction (rhythm, stability, worker, tending, machine, rotation, economic, farm, patrol, threshold)
  - `base_cycle_time`: Base time in milliseconds for interaction cycles
  - `difficulty`: Difficulty level (1-2)
  - `required_stats`: JSON object of required stat values (e.g., `{"wisdom":4}`)
  - `required_buffs`: JSON array of required buffs (e.g., `["spore_resist"]`)
  - `input_items`: JSON object of required input items (e.g., `{"root_nutrient":2}`)
  - `output_items`: JSON object of output items (e.g., `{"lumin_spore":1}`)
  - `failure_states`: JSON array of possible failure states (e.g., `["pulse_missed"]`)
  - `scriptable`: Boolean flag (default 1)
  - `active`: Boolean flag (default 1)

### Glowroot Region NPCs
The following 10 NPCs have been added to the database:

1. **Glowroot Pulsecap** (rhythm, difficulty 1)
   - Requires: Wisdom 4, spore_resist buff
   - Output: lumin_spore
   - Cycle time: 3500ms

2. **Embergut Shroomling** (stability, difficulty 2)
   - Requires: Intelligence 6, heat_resist buff
   - Output: ember_gel
   - Cycle time: 6000ms

3. **Mycelium Forager** (worker, difficulty 1)
   - Requires: Crafting 5, steady_hands buff, 2x root_nutrient
   - Output: glowroot_dust
   - Cycle time: 7000ms

4. **Lantern Moth Swarm** (tending, difficulty 1)
   - Requires: Wisdom 5, calm buff, nectar_drop
   - Output: liquid_lumen
   - Cycle time: 5000ms

5. **Biotide Condenser** (machine, difficulty 1)
   - Requires: Intelligence 4, cooling_aura buff, humid_air
   - Output: biotide
   - Cycle time: 8000ms

6. **Crystalbloom Weaver** (rotation, difficulty 2)
   - Requires: Crafting 7, Intelligence 5, precision buff, 2x raw_fiber
   - Output: woven_glowfiber
   - Cycle time: 9000ms

7. **Glowroot Barter Wisp** (economic, difficulty 1)
   - Requires: Cunning 4, clarity buff, 4x copper_bit
   - Output: trade_spore
   - Cycle time: 4000ms

8. **Silkroot Crawler Nest** (farm, difficulty 1)
   - Requires: Wisdom 3, Crafting 3, gentle_touch buff, crawler_feed
   - Output: 2x glow_silk
   - Cycle time: 6500ms

9. **Ooze-Walker Collector** (patrol, difficulty 2)
   - Requires: Dexterity 5, slick_grip buff
   - Output: ooze_core
   - Cycle time: 7000ms

10. **Aetherbud Sprite** (threshold, difficulty 2)
    - Requires: Wisdom 7, Intelligence 5, aether_sense buff
    - Output: aether_bud
    - Cycle time: 5200ms

### Implementation Status
- **Database Schema**: ✅ Created
- **NPC Data**: ✅ Inserted (10 NPCs)
- **Game Logic**: ✅ Cycle engine with type-driven scaffolding
- **Room Placement**: ✅ `room_npcs` table with Moonless Meadow-only enforcement
- **NPC Editing (God Mode)**: ✅ NPC editor overlay with CRUD support

### NPC Editing (God Mode)

- **Access**: Second God Mode button (`NPC`) in the button bar (visible only to god mode players)
- **Overlay**: Full-screen editor overlay similar to Map Editor
  - Left side: Scrollable NPC list (`#npcList`) and dropdown selector (`#npcSelector`)
  - Right side: Compact side panel with NPC detail form
- **NPC List**:
  - Shows all `scriptable_npcs` entries (id, name, npc_type)
  - Click to select NPC for editing (highlighted row)
  - Dropdown selector mirrors the list and can also select NPCs
- **NPC Detail Form**:
  - Fields:
    - `name`
    - `description`
    - `npc_type` (rhythm, stability, worker, tending, rotation, economic, farm, patrol, threshold)
    - `base_cycle_time` (ms)
    - `difficulty`
    - `required_stats` (JSON)
    - `required_buffs` (JSON array)
    - `input_items` (JSON)
    - `output_items` (JSON)
    - `failure_states` (JSON array)
    - `active` (Yes/No)
  - Supports:
    - Editing existing NPCs
    - Creating new NPCs (`Create New NPC` button)
    - Saving changes via `Save NPC` button
- **WebSocket Messages (NPC Editor)**:
  - Client → Server:
    - `{ type: 'getAllNPCs' }` — load all scriptable NPCs (god mode only)
    - `{ type: 'createNPC', npc: { ...fields } }` — create new NPC definition
    - `{ type: 'updateNPC', npc: { id, ...fields } }` — update existing NPC
  - Server → Client:
    - `{ type: 'npcList', npcs: [...] }` — complete NPC list
    - `{ type: 'npcCreated', npc: { ... } }` — newly created NPC
    - `{ type: 'npcUpdated', npc: { ... } }` — updated NPC
- **Placement Rule**:
  - NPC definitions editable globally
  - Actual room placement (`room_npcs`) remains restricted to rooms in the **Moonless Meadow** map

## Harvest Bonus System (Stat-Based)

### Overview
The Harvest Bonus System allows player stats to affect harvesting mechanics. Resonance and Fortitude provide different bonuses:

**Resonance Bonuses:**
1. **Cycle Time Reduction**: Faster item production cycles during harvest
2. **Hit Rate**: Higher chance to successfully produce items each cycle

**Fortitude Bonuses:**
1. **Cooldown Time Reduction**: Faster cooldown recovery after harvest ends
2. **Harvestable Time Increase**: Longer total harvest duration

### Database Schema

#### `harvest_formula_config` Table
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| config_key | TEXT UNIQUE | 'cycle_time_reduction', 'hit_rate', 'cooldown_time_reduction', or 'harvestable_time_increase' |
| description | TEXT | Human-readable description |
| min_resonance | INTEGER | Stat value for minimum effect (default: 5) - applies to Resonance for cycle/hit, Fortitude for cooldown/harvestable |
| min_value | NUMERIC(5,4) | Minimum effect value (e.g., 0.05 = 5%) |
| max_resonance | INTEGER | Stat value for maximum effect (default: 100) |
| max_value | NUMERIC(5,4) | Maximum effect value (e.g., 0.75 = 75%) |
| curve_exponent | NUMERIC(5,2) | Exponent for exponential curve (default: 2.0) |
| updated_at | BIGINT | Timestamp of last update |

#### `scriptable_npcs` Table Addition
| Column | Type | Description |
|--------|------|-------------|
| enable_resonance_bonuses | BOOLEAN | Whether this NPC uses resonance bonuses (cycle time & hit rate) (default: TRUE) |
| enable_fortitude_bonuses | BOOLEAN | Whether this NPC uses fortitude bonuses (cooldown & harvestable time) (default: TRUE) |

### Formula System

#### Exponential Curve Formula
```
normalized = (resonance - minResonance) / (maxResonance - minResonance)
value = minValue + (maxValue - minValue) * (normalized ^ exponent)
```

#### Default Configuration

**Cycle Time Reduction:**
- Min Resonance: 5, Min Value: 5% reduction
- Max Resonance: 100, Max Value: 75% reduction
- Curve Exponent: 2.0 (slow start, accelerating gains)
- At resonance 5: cycles at 95% of base time
- At resonance 100: cycles at 25% of base time

**Hit Rate:**
- Min Resonance: 5, Min Value: 50% hit rate
- Max Resonance: 100, Max Value: 100% hit rate
- Curve Exponent: 2.0
- At resonance 5: 50% chance to produce items each cycle
- At resonance 100: 100% chance (never misses)

**Cooldown Time Reduction:**
- Min Fortitude: 5, Min Value: 5% reduction
- Max Fortitude: 100, Max Value: 75% reduction
- Curve Exponent: 2.0
- At fortitude 5: cooldown at 95% of base time
- At fortitude 100: cooldown at 25% of base time

**Harvestable Time Increase:**
- Min Fortitude: 5, Min Value: 5% increase
- Max Fortitude: 100, Max Value: 50% increase
- Curve Exponent: 2.0
- At fortitude 5: harvestable time at 105% of base time
- At fortitude 100: harvestable time at 150% of base time

### Implementation Details

#### Harvest Session
- Player's resonance and fortitude are cached when harvest starts (`harvesting_player_resonance` and `harvesting_player_fortitude` in NPC state)
- Cached values used throughout entire harvest session (consistent bonuses)
- Prevents mid-harvest stat changes from affecting current session
- Effective harvestable time calculated at harvest start and stored in `effective_harvestable_time`

#### Cycle Time Calculation
```javascript
effectiveCycleTime = baseCycleTime * (1 - cycleTimeReduction)
```

#### Cooldown Time Calculation
```javascript
effectiveCooldownTime = baseCooldownTime * (1 - cooldownTimeReduction)
```

#### Harvestable Time Calculation
```javascript
effectiveHarvestableTime = baseHarvestableTime * (1 + harvestableTimeIncrease)
```

#### Hit Rate Check
- Each cycle, random roll determines if items are produced
- Miss: "Your harvest from <NPC> misses this cycle." message sent to player
- Hit: Items produced and dropped normally

### NPC Editor Integration

#### Advanced Settings Section
- **Resonance (Pulse & Hit Rate)**: Checkbox to enable/disable resonance bonuses for this NPC
- **Fortitude (Cooldown & Harvest Time)**: Checkbox to enable/disable fortitude bonuses for this NPC
- **Edit Global Formulas**: Button opens formula configuration modal

#### Formula Config Modal
- Edit all four formulas: cycle time reduction, hit rate, cooldown time reduction, and harvestable time increase
- Preview shows calculated values at sample stat levels (5, 25, 50, 75, 100)
- Changes take effect immediately (cache cleared on save)

### WebSocket Messages

#### Client → Server
- `{ type: 'getHarvestFormulaConfigs' }` - Get all formula configs
- `{ type: 'updateHarvestFormulaConfig', config: { config_key, min_resonance, min_value, max_resonance, max_value, curve_exponent } }` - Update a formula config

#### Server → Client
- `{ type: 'harvestFormulaConfigs', configs: [...] }` - All formula configs
- `{ type: 'harvestFormulaConfigUpdated', config_key }` - Confirmation of update

### Database Functions (`database.js`)
- `getHarvestFormulaConfig(configKey)` - Get config by key
- `getAllHarvestFormulaConfigs()` - Get all configs
- `updateHarvestFormulaConfig(configKey, updates)` - Update config values

### Utility Functions (`utils/harvestFormulas.js`)
- `calculateExponentialCurve(statValue, config)` - Core formula calculation
- `calculateCycleTimeMultiplier(resonance, config)` - Returns cycle time multiplier (for resonance)
- `calculateHitRate(resonance, config)` - Returns hit rate probability (for resonance)
- `calculateHarvestableTimeMultiplier(fortitude, config)` - Returns harvestable time multiplier (for fortitude)
- `calculateEffectiveHarvestableTime(baseHarvestableTime, fortitude, db)` - Calculates effective harvestable time
- `checkHarvestHit(resonance, db)` - Roll for hit/miss
- `getHarvestFormulaConfig(db, configKey)` - Get config with caching
- `clearConfigCache()` - Clear cache after config updates

## Lore Keeper System

### Overview
Lore Keepers are narrative-driven NPCs that deliver timed engagement messages, keyword-triggered dialogue, and puzzle interactions. They participate in room conversations through the existing `talk` command.

### Database Schema

#### `lore_keepers` Table
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| npc_id | INTEGER | Foreign key to scriptable_npcs (UNIQUE, CASCADE delete) |
| lore_type | TEXT | Either 'dialogue' or 'puzzle' |
| engagement_enabled | BOOLEAN | Whether to send initial message on room entry |
| engagement_delay | INTEGER | Delay in ms before sending initial message (default 3000) |
| initial_message | TEXT | Message sent when player enters room |
| initial_message_color | TEXT | Color for initial message (default #00ffff) |
| keywords_responses | TEXT | JSON object: { "keyword": "response", ... } |
| keyword_color | TEXT | Color for keywords (default #ff00ff) |
| incorrect_response | TEXT | Response when no keyword matched |
| puzzle_mode | TEXT | 'word', 'combination', or 'cipher' |
| puzzle_clues | TEXT | JSON array of clue strings |
| puzzle_solution | TEXT | The answer to the puzzle |
| puzzle_success_message | TEXT | Message on correct solution |
| puzzle_failure_message | TEXT | Message on incorrect solution |

### Lore Keeper Types

#### Dialogue Type
- **Engagement**: When player enters room, after configurable delay, sends initial message
- **Keyword Interaction**: When player uses `talk` command containing a keyword, responds with configured response
- **Incorrect Response**: If player mentions the NPC by name but no keyword matches, sends incorrect response
- **Case-Insensitive**: Keyword matching is case-insensitive

#### Puzzle Type
- **Engagement**: Same as dialogue type - sends initial message on room entry
- **Clue Command**: `clue <npc>` - Get a hint from the puzzle Lore Keeper
- **Solve Command**: `solve <npc> <answer>` - Attempt to solve the puzzle
- **Puzzle Modes**: word (text answer), combination (sequence), cipher (decode)
- **Success/Failure**: Different messages for correct and incorrect answers

### Commands

| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `solve <npc> <answer>` | `sol` | Attempt to solve a puzzle Lore Keeper |
| `clue <npc>` | `cl` | Get a clue from a puzzle Lore Keeper |
| `talk <message>` | `say`, `t` | Talk in room (triggers Lore Keeper keyword responses) |

### WebSocket Messages

#### Client → Server
- `{ type: 'solve', target: 'npc_name', answer: 'solution' }` - Attempt puzzle solution
- `{ type: 'clue', target: 'npc_name' }` - Request clue from puzzle NPC

#### Server → Client
- `{ type: 'loreKeeperMessage', npcName, npcColor, message, messageColor, isSuccess?, isFailure? }` - Lore Keeper speech

### NPC Editor Integration
- **Type Selection**: `lorekeeper` option in NPC type dropdown
- **Dynamic Form**: When `lorekeeper` type selected, shows Lore Keeper-specific fields
- **Lore Keeper Fields**:
  - Lore Type selector (dialogue/puzzle)
  - Engagement toggle and delay
  - Initial message and colors
  - Dialogue-specific: Keywords/Responses JSON, Incorrect Response
  - Puzzle-specific: Mode, Clues, Solution, Success/Failure messages
- **Type Transitions**: Changing NPC type from/to lorekeeper automatically creates/deletes lore_keepers record

### Display Styling
- Lore Keeper messages appear in terminal with distinctive styling
- NPC name displayed in configured color
- Message text in configured message color
- Success messages have green highlight/border
- Failure messages have red highlight/border
- Left border accent for visual distinction

## Glow Codex Puzzle Dialogue System

### Overview
The Glow Codex puzzle system has been extended to support interactive dialogue flow similar to normal NPC dialogue. Players can ask questions, request hints, or attempt answers naturally through the `talk` and `ask` commands.

### Database Schema Extensions
The `scriptable_npcs` table includes the following puzzle dialogue fields (added in migration 007):
- `puzzle_hint_responses` (TEXT): JSON array of hint responses for question-like inputs
- `puzzle_followup_responses` (TEXT): JSON array of followup responses for general questions
- `puzzle_incorrect_attempt_responses` (TEXT): JSON array of failure responses for incorrect answer attempts

### NPC Editor Fields
When `puzzle_type == "glow_codex"`, the NPC editor displays three additional fields:
- **Puzzle Hint Responses**: JSON array of strings for responses to question-like inputs (help, explain, hint, what, how)
- **Puzzle Followup Responses**: JSON array of strings for responses to general questions
- **Puzzle Incorrect Attempt Responses**: JSON array of strings for responses to incorrect answer attempts

### Puzzle State Management
- The system maintains `activeGlowCodexPuzzles` Map per connectionId
- Each entry tracks: `{ npcId, npcName, puzzleType, clueIndex }`
- Puzzle state is set when player mentions NPC by name in `talk` or `ask` command
- Puzzle state is cleared when puzzle is solved or player leaves room

### Dialogue Flow
1. **Starting a Puzzle**: When player uses `talk <npc>` or `ask <npc> <something>`:
   - If message contains question words (help, explain, hint, what, how), returns random entry from `puzzle_hint_responses` or `puzzle_followup_responses`
   - Otherwise, sends all glow clues in sequence
   - Sets active puzzle state for the player

2. **During Active Puzzle**: All player messages are routed through puzzle solver:
   - **Exact Solution Match**: Sends `puzzle_success_response`, awards `puzzle_reward_item`, clears puzzle state
   - **Question-like Input**: Returns random entry from `puzzle_hint_responses` or `puzzle_followup_responses`
   - **Answer Attempt (contains letters)**: Returns random entry from `puzzle_incorrect_attempt_responses`
   - **Other Input**: Defaults to `puzzle_followup_responses`

3. **Graceful Fallback**: If puzzle dialogue fields are not configured, system falls back to:
   - Generic dialogue responses
   - Default failure message: "That is not the answer I seek."

### Commands
- `talk <message>` - Can mention NPC by name to start puzzle dialogue
- `ask <npc> <question>` - Specifically for asking NPCs questions

### Compatibility
- Puzzle dialogue behaves exactly like normal NPC dialogue for message sequencing
- Normal dialogue and puzzle dialogue do not conflict
- Glowwords (`<word>`) formatting is preserved in all puzzle responses
- Multi-line puzzle text ordering is preserved

## Inventory System

### Database Tables

#### `room_items` - Items on the ground in rooms
- `id`: Primary key
- `room_id`: Foreign key to rooms
- `item_name`: Text name of item
- `quantity`: Number of items (stacks)
- `created_at`: Timestamp when item was placed

#### `player_items` - Player inventory
- `id`: Primary key
- `player_id`: Foreign key to players
- `item_name`: Text name of item
- `quantity`: Number of items (stacks)
- `created_at`: Timestamp when item was acquired

### Commands

| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `help` | `?` | Display all available commands |
| `inventory` | `inv`, `i` | Display player inventory |
| `take <item>` | `t <item>` | Pick up item from ground (partial name matching) |
| `drop <item>` | (none, `d` = down) | Drop item to ground (partial name matching) |
| `harvest <npc>` | `h <npc>` | Harvest items from NPC (partial name matching) |
| `collect <npc>` | `c <npc>` | Alias for harvest |
| `gather <npc>` | `g <npc>` | Alias for harvest |

### Communication Commands

| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `talk <message>` | `say`, `t` | Talk to players in the same room |
| `resonate <message>` | `res`, `r` | Broadcast message to all players in the world |
| `telepath <player> <message>` | `tele`, `tell`, `whisper` | Send private message to specific player |

### Communication Widget

- **Toggleable Widget**: Communication widget can be toggled on/off via widget bar
- **Three Communication Modes**:
  - **Talk**: Room chat - messages visible to all players in the same room
  - **Resonate**: World broadcast - messages visible to all players everywhere
  - **Telepath**: Private messages - messages visible only to sender and recipient
- **Widget Features**:
  - Mode selector buttons (Talk/Resonate/Telepath)
  - Scrollable chat history for each mode (last 100 messages per channel)
  - Input field with send button
  - Messages displayed in both widget and terminal
- **Command Line Interface**: All three modes work from command line
  - `talk hello world` - room hears message
  - `resonate hello world` - everyone hears message
  - `telepath hebron hello world` - only Hebron hears message

### Dynamic Command Registry
Commands are registered in `COMMAND_REGISTRY` array in `client.js`. To add a new command:
1. Add an entry to `COMMAND_REGISTRY` with `name`, `abbrev`, `description`, and `category`
2. The command will automatically appear in `help` output
3. Add the command handler in `executeCommand()` function

## Items System

### Database Schema

#### `items` Table (Master Item Definitions)
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Unique item name (e.g., "Pulse Resin") |
| description | TEXT | Item description |
| item_type | TEXT | Type category (sundries, weapon, armor, consumable, material, quest) |
| active | BOOLEAN | Whether item is active in game |
| created_at | INTEGER | Creation timestamp |

### Seeded Items
1. **Pulse Resin** - A thick, amber-colored resin harvested from Pulsewood trees. Commonly used in alchemical preparations.
2. **Harvester Rune** - A small stone etched with glowing symbols that enhances yield from harvestable creatures.

### Item Editor (God Mode)
- **Route**: `/items` (protected by session and god mode)
- **Features**:
  - View all items in list format
  - Select item from dropdown or click in list
  - Edit item name, type, description, active status
  - Create new items
  - Same retro terminal aesthetic as other editors

### Partial Name Matching
- Commands support partial item/NPC name matching (case-insensitive)
- If multiple items match (e.g., "s" matches "shroud" and "sword"), prompts for clarification: "Which did you mean: shroud, sword?"
- Single match proceeds automatically

### NPC Item Production (Rhythm NPCs)
- Rhythm-type NPCs produce items every cycle based on their `output_items` definition
- Produced items are added to the room's ground inventory (`room_items`)
- Items accumulate over time as NPC cycles continue

### UI Display
- Room view shows "On the ground: item_name (xQuantity)" section
- Items displayed in gold/yellow color (#ffcc00)
- Inventory command shows "You are carrying: ..." or "Your inventory is empty."

## Merchant Items System

### Overview
The merchant items system allows items to be sold in merchant rooms with configurable inventory management. Items can be assigned to multiple merchant rooms, and each room can have different inventory settings for the same item. Configuration is done via JSON in the Map Editor for maximum flexibility.

### Database Schema

#### `merchant_items` Table
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| item_id | INTEGER | Foreign key to items(id) |
| room_id | INTEGER | Foreign key to rooms(id) - must be merchant type |
| unlimited | BOOLEAN | Whether item is unlimited (default TRUE) |
| max_qty | INTEGER | Maximum quantity room can carry (nullable) |
| current_qty | INTEGER | Current inventory quantity (default 0) |
| regen_hours | NUMERIC | Hours to regenerate item once depleted (nullable) |
| last_regen_time | BIGINT | Timestamp of last regeneration (nullable) |
| price | INTEGER | Cost in gold (default 0) |
| buyable | BOOLEAN | Whether players can buy this item (default TRUE) |
| sellable | BOOLEAN | Whether merchant buys this item from players (default FALSE) |
| config_json | TEXT | JSON configuration for flexible settings |
| created_at | BIGINT | Creation timestamp |
| UNIQUE(item_id, room_id) | | One item per room constraint |

### Commands

#### Merchant Commands
| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `list` | `li`, `ls` | List items for sale (merchant rooms only) |
| `buy` | `b` | Buy item from merchant (buy <item> [quantity]) |
| `sell` | `s` | Sell item to merchant (sell <item> [quantity]) |

**List Command Output Format:**
```
Merchant Inventory:
  Item Name          Qty         Price
  Pulse Resin        ∞          50 gold
  Harvester Rune     5/10       100 gold
  Glowroot Dust      0          25 gold (out of stock)
```

### Merchant Item Configuration

#### JSON Configuration Structure
```json
{
  "unlimited": true,
  "max_qty": null,
  "current_qty": 0,
  "regen_hours": null,
  "buyable": true,
  "sellable": false,
  "price": 0
}
```

#### Configuration Fields
- **unlimited**: true/false - Shop never runs out of this item
- **max_qty**: number|null - Maximum inventory quantity
- **current_qty**: number - Current inventory level
- **regen_hours**: number|null - Hours to regenerate (e.g., 1.5 = 90 minutes)
- **buyable**: true/false - Can players purchase this item
- **sellable**: true/false - Does merchant buy this item from players
- **price**: number - Cost in gold coins

#### Item Editor Integration (Simplified)
- **Add to Merchant**: Dropdown to select merchant room and add item
- **Merchant Items List**: Shows all merchant rooms that sell the item with room name and price
- **Remove Button**: Remove item from merchant
- **Configuration**: Done via Map Editor (JSON configuration)

#### Map Editor Integration (Full Configuration)
- **Layout**: Side panel takes 35% width (flex: 0.35, min 360px), map grid takes 65% (flex: 0.65) for better editing space
- **Merchant Stock Section**: Appears when merchant room is selected, with blue theme styling
  - Section header: "🏪 Merchant Stock" with description "Items the merchant sells - use 'list' command in-game to view"
  - **Table View**: Shows item name, quantity, price, and action buttons
  - **Add Item**: Dropdown to add new items to merchant stock (populated from all items)
  - **"Stock" Button**: Adds item to merchant inventory with default JSON configuration
  - **Edit Button**: Opens JSON configuration editor for each item
  - **Remove Button**: Remove item from merchant stock
- **Items on Floor Section**: Yellow theme styling, appears for all room types
  - Section header: "🗺️ Items on Floor" with description "Physical items lying on the ground that players can pick up"
  - **"Drop" Button**: Adds item to room floor (physical item players can take)
- **JSON Configuration Editor**: Always displays all 7 fields in consistent order:
  - `unlimited`: true/false - Shop never runs out
  - `max_qty`: number|null - Maximum inventory
  - `current_qty`: number - Current inventory level
  - `regen_hours`: number|null - Hours to regenerate
  - `buyable`: true/false - Can players purchase
  - `sellable`: true/false - Does merchant buy from players
  - `price`: number - Cost in gold

### WebSocket Messages

#### Client → Server (Game)
- `{ type: 'list' }` - Request merchant inventory list (in merchant room)
- `{ type: 'buy', itemName: 'item_name', quantity: 1 }` - Buy item from merchant
- `{ type: 'sell', itemName: 'item_name', quantity: 1 }` - Sell item to merchant

#### Client → Server (Item Editor)
- `{ type: 'getMerchantRooms' }` - Get all merchant rooms
- `{ type: 'getMerchantItems', itemId: 123 }` - Get merchant items for specific item
- `{ type: 'addItemToMerchant', itemId: 123, roomId: 456 }` - Add item to merchant room
- `{ type: 'removeItemFromMerchant', merchantItemId: 789 }` - Remove item from merchant room

#### Client → Server (Map Editor)
- `{ type: 'getMerchantInventory', roomId: 456 }` - Get merchant inventory for room
- `{ type: 'addItemToMerchantRoom', roomId: 456, itemId: 123 }` - Add item to merchant
- `{ type: 'updateMerchantItemConfig', merchantItemId: 789, config: {...}, roomId: 456 }` - Update item config via JSON
- `{ type: 'removeMerchantItem', merchantItemId: 789, roomId: 456 }` - Remove item from merchant

#### Server → Client
- `{ type: 'merchantList', items: [...] }` - Formatted merchant list for players
- `{ type: 'merchantRooms', rooms: [...] }` - List of merchant rooms
- `{ type: 'merchantItems', merchantItems: [...] }` - List of merchant items for item
- `{ type: 'merchantInventory', roomId, merchantItems: [...] }` - Merchant inventory for room
- `{ type: 'merchantItemAdded', merchantItem: {...} }` - Item added to merchant
- `{ type: 'merchantItemConfigUpdated', merchantItemId }` - Config updated

### Database Functions
- `getMerchantRooms()` - Get all rooms with room_type = 'merchant'
- `getMerchantItems(itemId)` - Get all merchant room configurations for an item
- `addItemToMerchant(itemId, roomId, unlimited, maxQty, regenHours, price, buyable, sellable, configJson)` - Add item
- `updateMerchantItem(merchantItemId, unlimited, maxQty, regenHours, price, buyable, sellable, configJson)` - Update item
- `updateMerchantItemFromConfig(merchantItemId, config)` - Update from parsed JSON config
- `removeItemFromMerchant(merchantItemId)` - Remove item from merchant room
- `getMerchantItemsForRoom(roomId)` - Get all items sold in a merchant room
- `getMerchantItemsForList(roomId)` - Get buyable items for list command

### Buy/Sell Commands

#### Buy Command
- **Validation**: Must be in merchant room, item must be buyable, must have stock (if not unlimited), must have enough currency
- **Currency Auto-Conversion**: When player pays, currency is automatically converted to optimal format (crowns + shards remainder)
- **Inventory Updates**: 
  - Removes currency from player inventory (with auto-conversion)
  - Adds item to player inventory
  - Decrements merchant current_qty (if not unlimited)

#### Sell Command
- **Validation**: Must be in merchant room, item must be sellable, player must have item, merchant must pay for item
- **Currency Auto-Conversion**: When merchant pays player, currency is automatically converted to optimal format (crowns + shards remainder)
- **Inventory Updates**:
  - Removes item from player inventory
  - Adds currency to player inventory (with auto-conversion)
  - Increments merchant current_qty (if not unlimited)

### Validation Rules
- Only merchant rooms (`room_type = 'merchant'`) can sell items
- Each item can only be added once per merchant room (UNIQUE constraint)
- List command only shows buyable items
- Unlimited items show "∞" for quantity
- Buy command checks: buyable flag, stock availability, player currency
- Sell command checks: sellable flag, player inventory, merchant price

### WebSocket Messages

#### Client → Server
- `{ type: 'inventory' }` - Request inventory list
- `{ type: 'take', itemName: 'partial_name' }` - Take item from ground
- `{ type: 'drop', itemName: 'partial_name' }` - Drop item to ground
- `{ type: 'harvest', target: 'partial_npc_name' }` - Harvest from NPC
- `{ type: 'talk', message: 'Hello World!' }` - Room chat message
- `{ type: 'resonate', message: 'Hello World!' }` - Broadcast message to all players
- `{ type: 'telepath', targetPlayer: 'Hebron', message: 'Hello World!' }` - Private message to player

#### Server → Client
- `{ type: 'inventoryList', items: [{ item_name, quantity }] }` - Player inventory
- `{ type: 'talked', playerName: 'Fliz', message: 'Hello World!' }` - Room chat message
- `{ type: 'resonated', playerName: 'Fliz', message: 'Hello World!' }` - World broadcast message
- `{ type: 'telepath', fromPlayer: 'Fliz', message: 'Hello World!' }` - Private message received
- `{ type: 'telepathSent', toPlayer: 'Hebron', message: 'Hello World!' }` - Private message sent confirmation
- `{ type: 'systemMessage', message: 'Fliz has entered the game.' }` - System-wide announcement
- `{ type: 'message', message: 'You pick up item_name.' }` - Action feedback
- Room updates (`roomUpdate`, `moved`) now include `roomItems` array

## Room Type System

### Database Structure
- **Table**: `room_type_colors`
  - `room_type`: TEXT PRIMARY KEY - Room type identifier (normal, shop, factory, etc.)
  - `color`: TEXT - Hex color code for the room type (e.g., '#00ff00')
- **Rooms Table**: `room_type` column (TEXT, default 'normal') - Stores the type classification for each room

### Supported Room Types
- **normal**: Default room type (default color: #00ff00 - green)
- **shop**: Shop/merchant rooms (default color: #0088ff - blue)
- **factory**: Factory/industrial rooms (default color: #ff8800 - orange)

### Color Coding
- Each room type has an assigned color that appears on the map
- Colors are customizable via the Map Editor's "Room Type Colors" dialog
- Colors are displayed in both the Map Editor and the Game UI map widget
- Room squares on the map use their assigned room type color as the fill color
- Borders are automatically darkened versions of the fill color for contrast

### Room Type Color Management (God Mode)
- **Access**: "Room Type Colors" button in Map Editor toolbar
- **Dialog**: Shows all room types with color picker dropdowns
- **Color Options**: Same color palette as NPC editor (Lime, Cyan, Magenta, Yellow, Orange, Red, Periwinkle, White, Gray, Teal)
- **Real-time Updates**: Color changes are saved immediately and broadcast to all connected map editors
- **WebSocket Messages**:
  - Client → Server: `{ type: 'getAllRoomTypeColors' }` - Request all room type colors
  - Client → Server: `{ type: 'setRoomTypeColor', roomType: 'factory', color: '#ff8800' }` - Set color for room type
  - Server → Client: `{ type: 'roomTypeColors', colors: { normal: '#00ff00', shop: '#0088ff', factory: '#ff8800' } }` - Color updates

### Map Visualization
- **Map Editor**: Rooms rendered with their type-specific colors
- **Game UI Map Widget**: Rooms displayed with type-specific colors (current room always highlighted in green with yellow border)
- **Map Data**: Room type colors are sent with map data messages for client-side rendering

## Factory Widget System

### Overview
Factory widgets appear automatically when players enter rooms with type "factory", allowing players to drag items from their inventory into machine slots. Items persist per-player and drop to the ground when players leave without operating the machine.

### Factory Widget Features
- **Automatic Display**: Widget appears in slot 4 when entering factory-type rooms
- **Three Slots**: 
  - Slot 1: Drag-and-drop item slot
  - Slot 2: Drag-and-drop item slot
  - Input: Text input box (placeholder for future functionality)
- **Drag and Drop**: Players can drag items from inventory table to factory slots
- **Item Removal**: Only 1 item is removed from inventory per drag operation (even if player has multiple)
- **Per-Player State**: Each player has their own factory widget state (not shared between players)
- **Item Persistence**: Items in factory slots drop to room ground when player leaves factory room
- **Poofing Logic**: Poofable items disappear when room becomes empty (no players remaining)

### WebSocket Messages

#### Client → Server
- `{ type: 'factoryWidgetAddItem', slotIndex: 0|1, itemName: 'item_name' }` - Add item from inventory to factory slot

#### Server → Client
- `{ type: 'factoryWidgetState', state: { slots: [null|{itemName, quantity}, null|{itemName, quantity}], textInput: '' } }` - Factory widget state update
- Factory widget state included in `roomUpdate` and `moved` messages when in factory rooms

### UI/UX
- **Widget Styling**: Retro terminal aesthetic matching game theme (green borders, yellow header)
- **Slot Styling**: Dashed borders for empty slots, solid borders when filled
- **Drag Feedback**: Visual feedback when dragging items over slots (yellow highlight)
- **Inventory Dragging**: Inventory table rows are draggable with grab cursor
- **Item Display**: Item names displayed in filled slots with green text

## Warehouse System

### Overview
The warehouse system allows players to store items in private storage lockers within shared warehouse buildings. Multiple players can be in the same warehouse room simultaneously, see each other, and interact normally, but each player has completely private storage that only they can access.

### Database Schema

#### `warehouse_items` Table
- `id`: SERIAL PRIMARY KEY
- `player_id`: INTEGER REFERENCES players(id)
- `warehouse_location_key`: TEXT (stores room_id as string)
- `item_name`: TEXT
- `quantity`: INTEGER DEFAULT 1
- `created_at`: BIGINT
- INDEX on (player_id, warehouse_location_key)

#### `player_warehouses` Table
- `id`: SERIAL PRIMARY KEY
- `player_id`: INTEGER REFERENCES players(id)
- `warehouse_location_key`: TEXT
- `deed_item_id`: INTEGER REFERENCES items(id)
- `upgrade_tier`: INTEGER DEFAULT 1
- `max_item_types`: INTEGER DEFAULT 1 (how many different item types can be stored)
- `max_quantity_per_type`: INTEGER DEFAULT 100 (max quantity per item type)
- `created_at`: BIGINT
- UNIQUE(player_id, warehouse_location_key)

#### Items Table Extensions
Items with `item_type = 'deed'` have additional configuration fields:
- `deed_warehouse_location_key`: TEXT (room_id as string - the warehouse room this deed is attached to)
- `deed_base_max_item_types`: INTEGER DEFAULT 1 (base item type limit)
- `deed_base_max_quantity_per_type`: INTEGER DEFAULT 100 (base quantity limit per type)
- `deed_upgrade_tier`: INTEGER DEFAULT 1 (tier level of this deed configuration)

### Warehouse Deed System

#### Deed Items
- Deeds are items with `item_type = 'deed'`
- Deeds are sold at shops (like other items)
- Each deed item is configured with:
  - The warehouse room it grants access to (`deed_warehouse_location_key`)
  - Base capacity limits (`deed_base_max_item_types`, `deed_base_max_quantity_per_type`)
  - Upgrade tier (`deed_upgrade_tier`)
- The attached room must have `room_type = 'warehouse'`

#### Capacity Limits
- **Tier 1 (Base)**: 1 item type, 100 quantity per type (configurable per deed)
- **Upgrades**: Can increase both `max_item_types` and `max_quantity_per_type` indefinitely
- Upgrade mechanics not yet implemented (prepared for future expansion)
- Current capacity is stored in `player_warehouses` table, initialized from deed configuration

#### Access Control
- Players must have a deed item in their inventory to access a warehouse location
- When player first uses a warehouse with a deed, their capacity record is initialized from the deed configuration
- Multiple players can own the same deed type for the same location (each has separate private locker)

### Commands

| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `warehouse` | `wh` | Open warehouse widget (if in warehouse room) |
| `store <item> [quantity]` | `st <item> [quantity]` | Store item to warehouse |
| `withdraw <item> [quantity]` | `wd <item> [quantity]` | Withdraw item from warehouse |

### Warehouse Widget

#### Automatic Display
- Widget appears automatically when entering warehouse-type rooms
- Widget shows only the player's own private storage
- Widget is hidden when leaving warehouse rooms

#### Widget Features
- **Header**: "Warehouse: Shared Building / Private Storage Locker Active"
- **Info Note**: "You are in a shared warehouse building. Storage shown here is yours alone."
- **Capacity Display**: Shows current item types vs max, and quantity limits
- **Deeds List**: Shows owned deeds for this warehouse location
- **Items List**: Shows player's private locker contents
- **Store/Withdraw Actions**: Input fields and buttons for storing/withdrawing items

#### Privacy Guarantees
- All warehouse operations are private to the requesting player
- Warehouse inventory updates sent only to the requesting player's WebSocket (not broadcast)
- No other players receive warehouse inventory changes
- Each player's locker is completely isolated (player_id + warehouse_location_key)

### Server-Side Validation

All warehouse operations:
1. Validate player is in a room with `room_type = "warehouse"`
2. Validate player has a deed item in inventory for this warehouse location
3. Use `warehouse_location_key = room.id.toString()` (room_id as string)
4. Query/update only the requesting player's data (player_id filtering)
5. Send messages only to the requesting player (not broadcast to room)
6. Enforce capacity limits (max_item_types, max_quantity_per_type)

### Storage Validation

When storing items:
- Check if adding new item type would exceed `max_item_types`
- Check if quantity + existing quantity would exceed `max_quantity_per_type`
- Return appropriate error messages if limits are exceeded

### WebSocket Messages

#### Client → Server
- `{ type: 'warehouse' }` - Open warehouse widget
- `{ type: 'store', itemName: 'item_name', quantity: 1|'all'|number }` - Store item to warehouse
- `{ type: 'withdraw', itemName: 'item_name', quantity: 1|'all'|number }` - Withdraw item from warehouse

#### Server → Client
- `{ type: 'warehouseWidgetState', state: { warehouseLocationKey, items, capacity, deeds } }` - Warehouse widget state update
- Warehouse widget state included in `roomUpdate` and `moved` messages when in warehouse rooms

### Testing Requirements

Ensure the following test cases work:
1. Two players enter same warehouse room - both see each other, both see only their own storage
2. Player A stores items - only Player A's widget updates
3. Player A upgrades capacity - only Player A's UI updates
4. Player B withdraws items - only Player B's widget updates
5. Both players can use commands simultaneously with no interference

## Documentation

### Player Tutorial (`docs/player-tutorial.md`)
Comprehensive new player guide covering:
- Game interface layout (terminal, widgets, command line)
- Three navigation methods (command line, compass clicks, numpad)
- Complete command reference (movement, information, items, NPC interaction)
- Inventory system (taking, dropping, partial name matching)
- NPC harvesting mechanics and the NPC Activity Widget
- Map system (coordinates, multiple maps, preview rooms)
- Multiplayer features
- Quick reference card and glossary

**Note**: This tutorial excludes god mode and sysop features - it's designed for regular players only.

## Currency and Bank System

### Overview
A 2-tier currency system with Glimmer Shards (small) and Glimmer Crowns (large), player bank storage, and bank room type. Currency auto-conversion applies to both banks and merchants.

### Currency Items

#### Glimmer Shard
- **Type**: currency
- **Description**: "A faintly glowing fragment of crystallized essence."
- **Encumbrance**: 0.5
- **Poofable**: false

#### Glimmer Crown
- **Type**: currency
- **Description**: "A radiant coin forged from pure Glimmer essence."
- **Encumbrance**: 3
- **Poofable**: false

#### Conversion Rate
- **100 Glimmer Shards = 1 Glimmer Crown**
- Auto-conversion always optimizes to crowns + shards remainder
- Applies to: bank deposits/withdrawals, merchant purchases, merchant sales

### Player Bank Storage

#### Database Table: `player_bank`
- `id`: SERIAL PRIMARY KEY
- `player_id`: INTEGER REFERENCES players(id) ON DELETE CASCADE
- `currency_name`: TEXT NOT NULL (stores "Glimmer Shard" or "Glimmer Crown")
- `quantity`: INTEGER NOT NULL DEFAULT 0
- UNIQUE(player_id, currency_name)
- Bank storage does NOT affect encumbrance

### Bank Commands

| Command | Abbreviation | Description |
|---------|-------------|-------------|
| `deposit` | `dep` | Deposit currency to bank (deposit <quantity\|all> <currency>) |
| `withdraw` | `wd` | Withdraw currency from bank (withdraw <quantity\|all> <currency>) |
| `balance` | `bal` | Check bank balance (bank rooms only) |

#### Deposit Command
- **Validation**: Must be in bank room
- **Auto-Conversion**: Deposited currency is automatically converted to optimal format
- **"all" keyword**: Deposits all of specified currency type
- **Partial Name Matching**: Supports "shard", "crown", "glimmer shard", etc.

#### Withdraw Command
- **Validation**: Must be in bank room
- **Auto-Conversion**: Withdrawn currency is automatically converted to optimal format
- **"all" keyword**: Withdraws all of specified currency type
- **Routing**: Server routes to bank withdraw if in bank room, warehouse withdraw if in warehouse room

#### Balance Command
- **Validation**: Must be in bank room
- **Display**: Shows both currencies separately (e.g., "2 Glimmer Crowns, 45 Glimmer Shards")

### Room Types

#### Fixed Room Type Enum
The following 4 room types are FIXED, PERMANENT, and must always exist:
- **normal**: Default room type (green #00ff00)
- **merchant**: Merchant/shop rooms (blue #0088ff)
- **bank**: Bank rooms (yellow #ffff00)
- **warehouse**: Warehouse rooms (cyan #00ffff)

#### Room Type Rules
- All 4 types must exist in `room_type_colors` table
- Map editor dropdown shows all 4 types
- No validation should restrict room types to only previously existing values
- If a room type is missing, it is added automatically
- If a room type appears extra, it is kept (not removed)

#### Bank Room Type
- Players must be in bank room (`room_type === 'bank'`) to use deposit, withdraw, balance commands
- No special visual handling - behaves like normal rooms visually
- Commands handle all bank functionality

#### Warehouse Room Type
- **Structural Only**: Warehouse type exists but has no functionality yet
- No commands, no storage logic, no special handling
- Just ensures warehouse is a valid selectable room type
- Future warehouse functionality will be added later

### Database Functions

#### Currency Functions (`database.js`)
- `convertCurrencyToOptimal(shards)` - Convert shards to crowns + remainder
- `getPlayerCurrency(playerId)` - Get player's currency from inventory
- `removePlayerCurrency(playerId, totalShardsNeeded)` - Remove currency with auto-conversion
- `addPlayerCurrency(playerId, totalShardsToAdd)` - Add currency with auto-conversion

#### Bank Functions (`database.js`)
- `getPlayerBank(playerId)` - Get all currency in bank
- `getPlayerBankBalance(playerId)` - Get bank balance in optimal format
- `depositCurrency(playerId, currencyName, quantity)` - Deposit with auto-conversion
- `withdrawCurrency(playerId, currencyName, quantity)` - Withdraw with auto-conversion

### WebSocket Messages

#### Client → Server (Bank)
- `{ type: 'deposit', currencyName: 'Glimmer Shard', quantity: 100 }` - Deposit currency
- `{ type: 'deposit', currencyName: 'Glimmer Shard', quantity: 'all' }` - Deposit all
- `{ type: 'withdraw', currencyName: 'Glimmer Crown', quantity: 1 }` - Withdraw currency
- `{ type: 'withdraw', currencyName: 'Glimmer Shard', quantity: 'all' }` - Withdraw all
- `{ type: 'balance' }` - Check balance

#### Server → Client (Bank)
- `{ type: 'message', message: 'Deposited 1 Glimmer Crown, 50 Glimmer Shards. Bank balance: 2 Glimmer Crowns, 45 Glimmer Shards.' }`
- `{ type: 'message', message: 'Bank Balance: 2 Glimmer Crowns, 45 Glimmer Shards' }`

#### Client → Server (Merchant Buy/Sell)
- `{ type: 'buy', itemName: 'Pulse Resin', quantity: 1 }` - Buy item
- `{ type: 'sell', itemName: 'Pulse Resin', quantity: 1 }` - Sell item

#### Server → Client (Merchant Buy/Sell)
- `{ type: 'message', message: 'Purchased 1 Pulse Resin for 1 Glimmer Crown, 50 Glimmer Shards.' }`
- `{ type: 'message', message: 'Sold 1 Pulse Resin for 25 Glimmer Shards.' }`

### Currency Auto-Conversion Rules

#### When Player Pays (Buy from Merchant)
1. Calculate total price in shards
2. Check player has enough total shards (crowns * 100 + shards)
3. Remove currency from player inventory
4. Convert remaining currency to optimal format (crowns + shards remainder)
5. Add back remaining currency in optimal format

#### When Player Receives (Sell to Merchant, Bank Withdraw)
1. Calculate payment in shards
2. Add to player currency total
3. Convert to optimal format (crowns + shards remainder)
4. Store in player inventory in optimal format

#### Bank Deposits/Withdrawals
- Always convert to/from optimal format
- Depositing 150 shards becomes 1 crown + 50 shards in bank
- Withdrawing 1 crown from bank gives 1 crown (or 100 shards if requested)

## Multi-Window Character System

### Overview
The character selection system supports multiple simultaneous character sessions via popup windows. Each character can be opened in its own popup window, allowing players to play multiple characters at once from the same account.

### Key Features

1. **Popup Window Opening**: Clicking a character opens a new popup window (1200x800) instead of redirecting the main window
2. **Window Tracking**: Server tracks active character windows per account
3. **Status Display**: Landing page shows "Active" badge and "Close Window" button for characters with open windows
4. **Window Communication**: Parent-child window communication via postMessage API
5. **Heartbeat System**: Popup windows send periodic heartbeat messages to parent
6. **Remote Close**: Landing page can close popup windows remotely
7. **Exit Button Behavior**: Exit button closes popup if in popup mode, redirects if in main window

### Architecture

#### Client-Side (Landing Page)
- **Window Tracking**: `characterWindows` Map stores window references (characterName -> window)
- **Polling**: Polls `/api/active-windows` every 3 seconds to sync with server state
- **postMessage**: Listens for messages from popup windows (WINDOW_OPENED, WINDOW_HEARTBEAT, WINDOW_CLOSED)
- **UI Updates**: Dynamically shows/hides "Active" badge and "Close Window" button

#### Client-Side (Popup Window)
- **Popup Detection**: Detects if opened as popup via URL parameter `?popup=true&windowId=...&playerName=...`
- **Parent Communication**: Sends WINDOW_OPENED, WINDOW_HEARTBEAT, WINDOW_CLOSED messages to parent
- **Heartbeat**: Sends heartbeat every 2 seconds to indicate window is alive
- **Close Handling**: Listens for WINDOW_CLOSE_REQUEST from parent and closes window
- **Exit Button**: Closes popup window instead of redirecting

#### Server-Side
- **Window Tracking**: `activeCharacterWindows` Map (playerId -> { windowId, playerName, accountId, openedAt, connectionId })
- **Connection Tracking**: `connectedPlayers` includes `windowId` and `accountId` fields
- **API Endpoints**:
  - `GET /api/active-windows` - Returns list of active character windows for current account
  - `POST /api/close-character-window?playerName=...` - Closes WebSocket connection and removes window tracking
- **WebSocket**: Window ID passed in `authenticateSession` message, stored with connection

### Session Management

- **Account Sessions**: Only one account session per account (unchanged)
- **Player Sessions**: Multiple player sessions per account allowed (one per character window)
- **Session Persistence**: Character sessions persist independently; account session remains active on landing page
- **Server Restarts**: In-memory window tracking is lost on restart, but windows reconnect and re-register automatically

### Window States

A player can be in one of these states:
1. **Not Connected**: No active window, character button is clickable
2. **Active Window**: Window is open and connected, shows "Active" badge and "Close Window" button
3. **Disconnected**: Window was closed or connection lost, cleaned up automatically

### Files Modified

- `public/index.html` - Character selection, window management, polling, postMessage handling
- `public/client.js` - Popup detection, exit button logic, postMessage communication, heartbeat
- `server.js` - Window tracking Maps, WebSocket connection handling
- `handlers/game.js` - Window registration in authenticateSession
- `routes/api.js` - Active windows and close window endpoints
- `public/style.css` - Active window indicators (if needed)

### Testing Considerations

- Multiple popups open simultaneously
- Closing popup from landing page
- Closing popup directly (X button)
- Popup losing connection
- Returning to landing page while popup is open
- Browser refresh scenarios
- Popup blocker handling
- Server restart scenarios (windows reconnect and re-register)

## Rune Keeper Widget

### Overview
The Rune Keeper widget is a toggleable widget that displays ASCII art from the runekeeper.txt file. It provides a visual display of the Rune Keeper character art in the game interface.

### Features
- **Toggleable Widget**: Can be toggled on/off via the widget toggle bar
- **ASCII Art Display**: Loads and displays ASCII art from `/ascii-images/runekeeper.txt`
- **Retro Styling**: Uses monospace font with green-on-black terminal aesthetic matching the game theme
- **Auto-Loading**: ASCII art is automatically loaded when the widget is first shown

### Widget Configuration
- **Widget Name**: `runekeeper`
- **Icon**: Empty icon placeholder (to be customized)
- **File Location**: `public/ascii-images/runekeeper.txt`
- **Display Style**: Monospace font (Courier New), 8px font size, green text (#00ff00) on black background

### Implementation Details
- Widget is added to `TOGGLEABLE_WIDGETS` array
- ASCII art is loaded via `fetch()` when widget is first displayed
- Art is cached after first load to avoid repeated requests
- Widget follows standard widget slot management system

## Future Enhancements (Prepared)

- Vertical movement (Up/Down) - requires z-coordinate in database
- Additional UI panels in remaining quadrants
- Expanded world map with more areas
- Additional player commands and interactions
- Ability calculation algorithms based on stats and game elements
- Stat progression and leveling system
- Combat system utilizing stats and abilities
- Map zoom and pan controls
- Room labels on map

## Idle Auto-Look Feature

### Overview
The Idle Auto-Look feature automatically re-renders the room description (as if the player used the `look` command) when a player sits idle without interacting with the game UI. This provides a classic MUD-style gameplay feel where the room description refreshes periodically during inactivity.

### Behavior
- **Idle Detection**: Tracks player interaction with keypad and command line only
- **Widget Interactions**: Widget interactions (stats, compass, map, comms, etc.) do NOT reset the idle timer
- **Auto-Look Trigger**: After 30 seconds of inactivity, automatically sends a `look` command to refresh the room view
- **Timer Reset**: Idle timer resets on:
  - Any keypad movement (numpad 1-9)
  - Any command line input (typing or Enter)
  - Any movement command (via command line or compass clicks)
- **Timer Management**: 
  - Starts automatically when player enters the game (first room update)
  - Stops automatically when WebSocket disconnects
  - Checks for idle state every 5 seconds

### Technical Implementation
- **Idle Delay**: 30 seconds (`IDLE_LOOK_DELAY = 30000ms`)
- **Check Interval**: 5 seconds (checks every 5 seconds if idle threshold is met)
- **Interaction Tracking**: `lastInteractionTime` timestamp updated on all keypad/command interactions
- **Auto-Look Execution**: Sends `{ type: 'look' }` WebSocket message when idle threshold is reached

## Auto-Pathing Feature

### Overview
The Auto-Pathing feature allows players to select a destination room and automatically navigate there step-by-step. It is accessed through the Scripting widget and provides a visual map interface for selecting destinations.

### Database Schema

#### `players` Table Addition
- `auto_navigation_time_ms` (INTEGER) - Delay between movements during auto-navigation in milliseconds (default: 1000)

### Features

1. **Map and Room Selection**
   - Players can select a map from a dropdown
   - A visual map canvas displays all rooms in the selected map
   - Players click on a room to set it as the destination
   - Current player location is highlighted in green
   - Selected destination is highlighted in orange

2. **Path Calculation**
   - Uses Breadth-First Search (BFS) algorithm to find shortest path
   - Works across multiple maps using connecting rooms
   - Path includes map transitions when crossing between maps
   - Returns ordered list of rooms, directions, and map information
   - Path summary displays map transitions and is scrollable

3. **Auto-Navigation**
   - When "GO" button is pressed, auto-navigation begins
   - Movement commands are blocked during auto-navigation
   - Compass widget buttons are disabled during auto-navigation
   - Numpad movement is blocked during auto-navigation
   - Auto-navigation continues until destination is reached or an error occurs
   - Each movement step waits for `auto_navigation_time_ms` milliseconds before proceeding

4. **Player Configuration**
   - `auto_navigation_time_ms` can be edited in the Player Editor
   - Default value is 1000ms (1 second)
   - Valid range: 100ms to 10000ms

5. **Termination Rules**
   - Auto-navigation ends when:
     - Player reaches the destination
     - A movement fails (wall hit, missing link, etc.)
     - Player disconnects
   - On termination, movement commands are unblocked

### Technical Implementation

- **Pathfinding**: `utils/pathfinding.js` - BFS algorithm for finding paths between rooms, supports cross-map navigation via connecting rooms
- **Server Handlers**: `handlers/game.js` - Handles map/room requests, path calculation, and auto-navigation execution
- **Client UI**: `public/client.js` - Manages auto-path panel, map rendering, and movement blocking
- **Database**: Migration `034_add_auto_navigation_time.sql` adds the `auto_navigation_time_ms` column
