# Railway Frontend Architecture Canonical One-Liner Questions - Code Analysis

**Analysis Date:** 2024-12-28  
**Scope:** Railway deployment frontend architecture  
**Method:** Direct code examination with file/line citations  
**Template:** Based on `docs/Chuck docs/10-00-scrub-prompt-template.md`

---

## 1. Define the canonical purpose of the Railway frontend within the overall architecture.

**Canonical Purpose:** The Railway frontend serves as the client-side user interface layer for "The Game", identical in purpose to local development but deployed to Railway's hosting infrastructure. It provides real-time WebSocket communication with the Railway-hosted backend, renders game state through modular components, and handles all user interactions. The frontend is **deployment-agnostic** - the same `public/` directory files serve both local and Railway deployments with protocol detection based on `location.protocol`.

**Evidence:**
- `public/game.html:1-510` - Main game interface HTML structure
- `public/js/main.js:1-2855` - Frontend entry point that initializes all components
- `public/js/core/Game.js:28-29` - Protocol detection: `location.protocol === 'https:' ? 'wss://' : 'ws://'`
- `server.js:78-91` - Static file serving: `express.static(path.join(__dirname, 'public'))` - same for both dev and prod

**Not found in codebase:** No separate Railway-specific frontend build or configuration. The frontend is identical across deployment environments.

---

## 2. Specify which UI components must exist in the Railway-hosted frontend.

**Required UI Components (Same as Local Development):**

### Core Components:
- **Terminal** (`public/js/widgets/Terminal.js`) - Text terminal displaying game output
- **StatsWidget** (`public/js/widgets/StatsWidget.js`) - Player statistics display
- **MapWidget** (`public/js/widgets/MapWidget.js`) - Interactive map visualization
- **CompassWidget** (`public/js/widgets/CompassWidget.js`) - Directional navigation buttons
- **CommsWidget** (`public/js/widgets/CommsWidget.js`) - Chat/communication interface
- **Inventory** (`public/js/widgets/Inventory.js`) - Player inventory display
- **NPCWidget** (`public/js/widgets/NPCWidget.js`) - NPC activity display during harvest
- **FactoryWidget** (`public/js/widgets/FactoryWidget.js`) - Factory crafting interface
- **TicketsWidget** (`public/js/widgets/TicketsWidget.js`) - Ticket management (god mode only)

### Authentication/Selection Screens:
- **Login/Register Screen** (`public/index.html:11-34`) - Account authentication
- **Character Selection Screen** (`public/index.html:52-63`) - Character selection after login
- **Forgot Password Modal** (`public/index.html:36-50`) - Password reset flow

### Supporting Components:
- **Auto-Path Panel** (`public/game.html:380-404`) - Pathfinding UI
- **Jump Widget** (`public/game.html:406-425`) - God mode teleportation
- **ZORK Ticket Dialog** (`public/game.html:445-483`) - Ticket creation UI

**Evidence:**
- `public/js/main.js:7-16` - Component imports
- `public/js/main.js:23-50` - Component initialization
- `public/game.html:86-372` - Widget grid structure in HTML

---

## 3. Declare how the frontend connects to the backend on Railway (WebSocket, HTTP, both).

**Connection Method:** **Both WebSocket and HTTP**

### WebSocket Connection:
- **Protocol Detection:** Automatically selects `ws://` or `wss://` based on page protocol
- **URL Construction:** `location.protocol === 'https:' ? 'wss://' : 'ws://'` + `location.host`
- **Connection Point:** Same host as the HTML page (Railway provides HTTPS automatically)

### HTTP Connection:
- **Authentication:** `/api/login`, `/api/register`, `/api/logout`
- **Character Management:** `/api/characters`, `/api/select-character`
- **Password Reset:** `/api/request-password-reset`, `/api/reset-password`
- **Email Verification:** `/api/resend-verification-email`
- **Session Validation:** `/api/session-valid`
- **Account Info:** `/api/account`
- **Health Check:** `/health` (for Railway/cloud deployments)

**Evidence:**
- `public/js/core/Game.js:28-29` - WebSocket protocol and URL construction
- `public/js/core/Game.js:182` - WebSocket connection: `new WebSocket(this.wsUrl)`
- `public/client.js:173-174` - Alternative WebSocket connection pattern
- `public/index.html:234-250` - HTTP login: `fetch('/api/login', ...)`
- `routes/api.js:33-36` - Health check endpoint: `app.get('/health', ...)`

---

## 4. Define how environment variables must be consumed client-side.

**Client-Side Environment Variable Consumption:** **NONE - Environment variables are server-side only**

The frontend **does not directly consume environment variables**. All client-side code uses browser APIs:
- `location.protocol` - Detects HTTPS vs HTTP
- `location.host` - Gets current hostname (provided by Railway)
- `window.location.origin` - Full origin URL

**Evidence:**
- `public/js/core/Game.js:28-29` - Uses `location.protocol` and `location.host` (browser APIs, not env vars)
- `public/client.js:173-174` - Same pattern
- No `.env` file references in `public/` directory
- No `process.env` usage in any `public/js/**/*.js` files (grep confirms)

**Not found in codebase:** No mechanism to inject environment variables into client-side JavaScript. All configuration is inferred from browser context.

**Server-Side Environment Variables (Not Exposed to Client):**
- `DATABASE_URL` - PostgreSQL connection (server-only)
- `SESSION_SECRET` - Session encryption (server-only)
- `BASE_URL` - Used server-side for email links (never sent to client)
- `SMTP_*` - Email configuration (server-only)
- `PORT` - Server port (Railway auto-sets, server-only)
- `NODE_ENV` - Deployment environment (server-only)

---

## 5. Specify which configuration values must never be exposed client-side.

**Never Exposed Client-Side:**

1. **Database Credentials:**
   - `DATABASE_URL` - PostgreSQL connection string (contains password)
   - **Evidence:** `database.js:12` - Only accessed server-side

2. **Session Security:**
   - `SESSION_SECRET` - Session encryption key
   - **Evidence:** `middleware/session.js` - Only used server-side for cookie signing

3. **Email Configuration:**
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_USERNAME`, `SMTP_PASSWORD`
   - **Evidence:** `utils/email.js` - Email service is server-side only
   - `routes/api.js:39-49` - `/api/email-status` endpoint shows `'***configured***'` but never exposes actual values

4. **Server Configuration:**
   - `PORT` - Server port (Railway auto-sets)
   - `NODE_ENV` - Deployment environment indicator
   - **Evidence:** `server.js:351` - `process.env.PORT` used server-side only

5. **BASE_URL Usage:**
   - `BASE_URL` is used server-side to generate email links but is **never sent to the client**
   - Client constructs URLs using `window.location.origin` instead
   - **Evidence:** `utils/email.js` - BASE_URL used in email templates (server-side)
   - **Evidence:** `public/js/core/Game.js:29` - Client uses `location.host` (browser API)

**Partially Exposed (Derived, Not Direct):**
- WebSocket protocol (`ws://` vs `wss://`) - Determined client-side from `location.protocol`
- Hostname - Available client-side via `location.host` (Railway provides this)

**Evidence:**
- No `process.env` references in `public/js/**/*.js` (verified via grep)
- No database connection strings in frontend code
- No API keys or secrets in frontend code
- `public/index.html:168-170` - Client uses `fetch('/api/account', { credentials: 'include' })` - relies on cookies, not exposed credentials

---

## 6. Define the canonical boot sequence for the Railway-deployed frontend.

**Boot Sequence:**

### 1. HTML Load (`public/game.html` or `public/index.html`)
- Browser loads HTML file from Railway-hosted server
- Static assets referenced: `style.css`, JavaScript modules

### 2. Static Asset Loading
- CSS: `public/style.css` loaded via `<link rel="stylesheet" href="style.css">`
- Alpine.js: Loaded from CDN (`https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js`)
- Main Entry: `<script type="module" src="js/main.js"></script>` (ES6 module)

### 3. JavaScript Module Initialization (`public/js/main.js`)
- Imports Game controller: `import Game from './core/Game.js'`
- Imports all components: Terminal, StatsWidget, MapWidget, CompassWidget, CommsWidget, Inventory, NPCWidget, FactoryWidget, TicketsWidget
- Imports utilities: MapRenderer

### 4. Component Instantiation (`public/js/main.js:19-31`)
- Creates Game instance: `const game = new Game()`
- Creates component instances (each extends Component base class)
- Sets global references: `window.terminal`, `game.terminal`

### 5. Component Initialization (`public/js/main.js:42-50`)
- Calls `component.init()` for each component in order:
  - terminal.init()
  - statsWidget.init()
  - mapWidget.init()
  - compassWidget.init()
  - commsWidget.init()
  - inventory.init()
  - npcWidget.init()
  - factoryWidget.init()
  - ticketsWidget.init()

### 6. Game Controller Connection (`public/js/core/Game.js`)
- Game constructor initializes:
  - MessageBus instance
  - WebSocket protocol detection: `location.protocol === 'https:' ? 'wss://' : 'ws://'`
  - WebSocket URL: `this.wsProtocol + location.host`
  - Tab ID generation/retrieval from sessionStorage

### 7. WebSocket Connection (`public/js/core/Game.js:149-244`)
- `Game.connect()` called (or auto-connects on construction)
- Creates WebSocket: `new WebSocket(this.wsUrl)`
- On open: Sends `{ type: 'authenticateSession', windowId }` message
- Message handler: `Game.handleMessage()` routes messages to MessageBus

### 8. Component Subscription
- Components subscribe to MessageBus events during `init()`
- Example: `StatsWidget.init()` subscribes to `'player:stats'` event

### 9. UI Event Handlers
- Command input handler attached: `commandInput.addEventListener('keypress', ...)`
- Widget toggle handlers (Alpine.js reactivity)
- All interactive elements wired up

**Evidence:**
- `public/game.html:508` - Module entry point: `<script type="module" src="js/main.js"></script>`
- `public/js/main.js:19-50` - Component creation and initialization sequence
- `public/js/core/Game.js:11-48` - Game constructor initialization
- `public/js/core/Game.js:149-244` - WebSocket connection flow

**Not found in codebase:** No Railway-specific boot sequence differences. Same sequence for local and Railway deployments.

---

## 7. Declare how BASE_URL is used in routing and API calls.

**BASE_URL Usage:**

### Server-Side Only:
- `BASE_URL` is **not used in frontend routing or API calls**
- Frontend constructs URLs using browser APIs: `window.location.origin`, `location.host`

### Server-Side Usage:
- Email link generation (password reset, verification)
- Server constructs full URLs using `BASE_URL` when sending emails
- Example: Password reset link: `${process.env.BASE_URL}/reset-password?token=...`

### Frontend Routing:
- All API calls use relative paths: `/api/login`, `/api/register`, `/api/characters`
- WebSocket uses `location.host` directly: `wsProtocol + location.host`
- No absolute URL construction in frontend code

**Evidence:**
- `public/index.html:238` - Login: `fetch('/api/login', ...)` - relative path
- `public/js/core/Game.js:29` - WebSocket: `this.wsProtocol + location.host` - no BASE_URL
- `public/client.js:174` - WebSocket: `wsProtocol + location.host` - no BASE_URL
- `routes/api.js:33-36` - Health check uses relative path: `app.get('/health', ...)`
- `docs/railway.md:65` - BASE_URL configured server-side: `BASE_URL=https://<your-railway-url>.railway.app`

**Not found in codebase:** No `BASE_URL` variable usage in any `public/**/*.js` or `public/**/*.html` files.

---

## 8. Specify how the frontend detects and responds to deployment environment (dev vs prod).

**Environment Detection:**

### Client-Side Detection:
- **Protocol Detection:** `location.protocol === 'https:'` (Railway uses HTTPS automatically)
- **No explicit dev/prod flag:** Frontend does not distinguish dev vs prod through environment variables

### Implicit Detection:
- **WebSocket Protocol:** HTTPS → `wss://`, HTTP → `ws://`
- **Cookie Security:** Server sets `secure: true` in production (handled server-side)
- **Cache Headers:** Server sets different cache headers based on `NODE_ENV` (server-side)

### Server-Side Environment:
- `NODE_ENV=production` sets server behavior:
  - Static file caching enabled (`server.js:89-90`)
  - Database SSL enabled (`database.js`)
  - Session cookie `secure: true` (`middleware/session.js`)

**Evidence:**
- `public/js/core/Game.js:28` - Protocol detection: `location.protocol === 'https:' ? 'wss://' : 'ws://'`
- `server.js:79` - Cache control based on `process.env.NODE_ENV !== 'production'`
- `server.js:89-90` - Production: `express.static()` with default caching; Dev: `no-cache` headers

**Not found in codebase:** No `NODE_ENV` or environment variable checks in frontend code. No explicit dev/prod mode switching in client-side JavaScript.

---

## 9. Define handling for WebSocket protocol selection (ws:// vs wss://).

**WebSocket Protocol Selection:**

### Automatic Detection:
- **Protocol Selection:** `location.protocol === 'https:' ? 'wss://' : 'ws://'`
- **URL Construction:** `wsProtocol + location.host`
- **No Manual Configuration:** Protocol is always determined from page protocol

### Railway Deployment:
- Railway provides HTTPS automatically
- Frontend loads over `https://`
- Protocol detection returns `'https:'`
- WebSocket automatically uses `wss://`

### Local Development:
- Typically runs on `http://localhost:3434`
- Protocol detection returns `'http:'`
- WebSocket uses `ws://`

**Evidence:**
- `public/js/core/Game.js:28-29` - Protocol and URL construction
- `public/client.js:173-174` - Same pattern (legacy code)
- `public/js/editorShared/EditorBase.js:67-68` - Same pattern in editors
- `docs/railway.md:15` - "WebSocket: Auto-detects HTTPS and uses `wss://`"
- `docs/railway.md:161` - "Code auto-detects HTTPS and uses `wss://`"

**Not found in codebase:** No hardcoded WebSocket URLs. No configuration file for WebSocket endpoints. No environment variable override for WebSocket protocol.

---

## 10. State rules for error handling and fallback UI on Railway.

**Error Handling Rules:**

### WebSocket Connection Errors:
- **Connection Failure:** Attempts reconnection with exponential backoff
- **Max Reconnect Attempts:** `MAX_RECONNECT_ATTEMPTS` constant (typically 5)
- **Reconnect Delay:** 3 seconds after disconnect
- **User Feedback:** Console log: `'WebSocket disconnected'` and `'Not connected to server. Please wait...'` message in terminal

### HTTP Request Errors:
- **Network Errors:** Caught in try/catch, error message displayed in UI
- **API Errors:** Server returns JSON with `error` field, displayed in error divs
- **Example:** Login error displayed in `#loginError` div

### Fallback UI:
- **No Connection:** Terminal shows "Not connected to server. Please wait..." message
- **Session Invalid:** Redirects to `/` (login screen)
- **Server Restart:** WebSocket auto-reconnects, no page reload required
- **Health Check:** `/health` endpoint available for Railway health monitoring (returns `{ status: 'ok', timestamp }`)

### Error Display Patterns:
- **Modal Errors:** Displayed in modal error divs (e.g., `#loginError`, `#registerError`)
- **Terminal Errors:** Messages prefixed with error styling in terminal
- **Console Logging:** All errors logged to browser console for debugging

**Evidence:**
- `public/js/core/Game.js:218-244` - WebSocket disconnect and reconnect logic
- `public/js/main.js:85-92` - Connection check before command execution
- `public/index.html:238-270` - HTTP error handling with try/catch and error display
- `routes/api.js:34-36` - Health check endpoint: `app.get('/health', ...)`
- `public/js/core/Game.js:216` - WebSocket error: `console.error('WebSocket error:', error)`

**Not found in codebase:** No dedicated offline mode UI. No service worker for offline functionality. No error boundary components. Error handling is per-component, not centralized.

---

## 11. Define logging expectations for browser-side Railway deployment.

**Browser-Side Logging:**

### Console Logging:
- **Development Logging:** Extensive `console.log()`, `console.warn()`, `console.error()` throughout codebase
- **No Logging Level Control:** All logs always output to browser console
- **No Remote Logging:** Logs stay in browser console, not sent to server or Railway

### Log Categories:
- **WebSocket Events:** Connection, disconnection, message receipt
- **Component Lifecycle:** Component initialization, widget show/hide
- **User Actions:** Command execution, widget interactions
- **Errors:** All errors logged with `console.error()`
- **Warnings:** Validation failures, missing data logged with `console.warn()`

### Debug Session Logging:
- **Debug Observer:** If debug session active, console logs are captured and sent to server
- **Hooked Console:** `console.error` and `console.warn` are hooked to capture telemetry
- **Evidence:** `public/js/core/Game.js:748-811` - Debug hooks for console logging

### Production Considerations:
- **No Log Reduction:** Same logging in production as development
- **Browser Console Only:** Logs visible only to users with browser dev tools open
- **No Log Aggregation:** No mechanism to collect logs from multiple users

**Evidence:**
- `public/js/core/Game.js:185` - `console.log('WebSocket connected')`
- `public/js/core/Game.js:216` - `console.error('WebSocket error:', error)`
- `public/js/main.js:1851` - `console.log('[startAutoNavigation] Function called')`
- `public/js/widgets/FactoryWidget.js:45` - `console.log('[FactoryWidget] Initialized')`
- `public/js/core/Game.js:748-811` - Debug observer console hooking

**Not found in codebase:** No logging service or remote log aggregation. No log level configuration. No production log filtering. No user-facing error reporting UI (errors only in console).

---

## 12. Declare cache-busting and asset versioning requirements.

**Cache-Busting and Asset Versioning:**

### Development Mode:
- **No Cache:** Static files served with `Cache-Control: no-cache, no-store, must-revalidate`
- **Pragma:** `no-cache` header
- **Expires:** `0` header
- **Applies to:** `.js`, `.css`, `.html` files

### Production Mode (Railway):
- **Default Caching:** Express static middleware uses default caching behavior
- **No Versioning:** No query string versioning (e.g., `app.js?v=1.2.3`)
- **No Build Hashes:** No file content hashing in filenames (e.g., `app.abc123.js`)

### Browser Caching:
- **No Cache Headers Set:** Production mode relies on browser default caching
- **No Service Worker:** No service worker for cache control
- **No Cache Manifest:** No application cache manifest

**Evidence:**
- `server.js:79-87` - Development cache control: `setHeaders` with `no-cache` for `.js`, `.css`, `.html`
- `server.js:89-90` - Production: `express.static()` without custom headers (default caching)
- No version numbers in static file references (grep for `?v=` returns no matches)
- No build process that adds hashes to filenames

**Not found in codebase:** No asset versioning strategy. No build-time hash generation. No cache-busting query strings. No service worker implementation. Cache invalidation requires browser hard refresh or cache clear.

---

## 13. Specify how migrations and schema changes impact the frontend.

**Migration and Schema Impact:**

### Direct Impact: **NONE**
- Frontend does not directly depend on database schema
- All data arrives via WebSocket messages or HTTP API responses
- Frontend displays whatever structure the server sends

### Indirect Impact:
- **New Message Types:** If migration adds new game features, server may send new WebSocket message types
- **Frontend Updates Required:** New message types require frontend handler in `Game.handleMessage()`
- **New API Endpoints:** New features may require new HTTP endpoints (e.g., `/api/new-feature`)
- **UI Components:** New features may require new UI components (e.g., new widget)

### Migration Process:
- **Server-Side Only:** Migrations run automatically on server startup (`server.js`)
- **No Client Migration:** Frontend has no migration mechanism
- **Backward Compatibility:** Old frontend should continue working if server maintains backward-compatible message formats

### Schema Changes:
- **Server Serialization:** Server serializes database rows to JSON for client
- **Client Deserialization:** Client receives JSON, no direct database access
- **Field Additions:** New fields in database may appear in JSON automatically (if server includes them)
- **Field Removals:** Removed fields simply won't appear in JSON (client must handle missing fields gracefully)

**Evidence:**
- `server.js` - Migrations run on startup (no frontend involvement)
- `public/js/core/Game.js:249-692` - Message handling switches on message `type` field
- No database schema references in `public/**/*.js` files
- All data access via WebSocket messages or HTTP API

**Not found in codebase:** No frontend migration system. No client-side schema validation. No version negotiation between client and server. Frontend assumes server sends compatible message formats.

---

## 14. Declare how email-related flows (verification, reset links) must be surfaced in UI.

**Email Flow UI Surface:**

### Email Verification:
- **Registration:** After registration, user sees verification message if email not verified
- **Character Selection:** Verification status shown in account info section
- **Verification Required:** Alert shown if `?verification_required=true` in URL
- **Resend Button:** "Resend Verification Email" button shown if email not verified
- **Status Display:** Warning message shows days remaining for verification

### Password Reset:
- **Forgot Password Link:** Link on login screen: "Forgot Password?"
- **Modal Dialog:** Modal opens with email input field
- **Reset Request:** User enters email, clicks "Send Reset Link"
- **Success Message:** "If an account with that email exists, a password reset link has been sent..."
- **Reset Page:** Separate HTML page: `public/reset-password.html` for reset token processing

### Email Link Handling:
- **Verification Link:** Clicked link contains token, handled by server endpoint
- **Reset Link:** Clicked link contains token, handled by `/reset-password.html` page
- **BASE_URL:** Server constructs full URL using `BASE_URL` environment variable (server-side only)
- **Client Never Sees BASE_URL:** Client receives email with full URL already constructed

**Evidence:**
- `public/index.html:22` - "Forgot Password?" link
- `public/index.html:36-50` - Forgot password modal
- `public/index.html:184-187` - Verification required URL parameter check
- `public/index.html:324-337` - Email verification status display and resend button
- `public/index.html:908-965` - Password reset email request handler
- `public/reset-password.html` - Password reset page (separate HTML file)
- `routes/api.js` - Email-related endpoints: `/api/resend-verification-email`, `/api/request-password-reset`

**Not found in codebase:** No email preview UI. No email template editor. Email sending is server-side only. Client only displays status messages and handles form submissions.

---

## 15. Define any Railway-specific constraints on OAuth/login flows.

**OAuth/Login Flow Constraints:**

### Current Implementation: **Email/Password Authentication (Not OAuth)**
- No OAuth providers implemented (Google, GitHub, etc.)
- Email/password authentication only
- Session-based authentication with cookies

### Railway-Specific Constraints:

#### 1. **Session Cookies:**
- **SameSite:** Production uses `sameSite: 'lax'` (instead of 'strict') for Railway proxy compatibility
- **Secure:** `secure: true` in production (HTTPS only)
- **HttpOnly:** `httpOnly: true` (prevents JavaScript access)
- **Evidence:** `docs/requirements.md:521-527` - Cookie configuration details

#### 2. **Trust Proxy:**
- Express `trust proxy` set to `1` for Railway reverse proxy
- Required for correct IP address and protocol detection
- **Evidence:** `server.js:65-66` - `app.set('trust proxy', 1)`

#### 3. **HTTPS Requirement:**
- Railway provides HTTPS automatically
- All authentication must use HTTPS (secure cookies require HTTPS)
- **Evidence:** `docs/railway.md:208` - "Railway provides HTTPS automatically"

### Login Flow:
1. User enters email/password on `/` (login screen)
2. POST to `/api/login` with credentials
3. Server validates, creates session, sets cookie
4. Client redirects to character selection
5. User selects character, starts game

### No OAuth Constraints:
- **Not found in codebase:** No OAuth implementation
- **Not found in codebase:** No third-party authentication providers
- **Not found in codebase:** No OAuth callback handlers

**Evidence:**
- `public/index.html:234-270` - Login form with email/password
- `routes/api.js` - Login endpoint (no OAuth endpoints found)
- `middleware/session.js` - Session middleware for cookie-based auth

---

## 16. Specify canonical structure for frontend directories and components.

**Frontend Directory Structure:**

```
public/
├── game.html              # Main game interface HTML
├── index.html             # Login/character selection HTML
├── reset-password.html    # Password reset page
├── style.css              # Main stylesheet
├── client.js              # Legacy client code (deprecated, uses new modular system)
├── js/
│   ├── main.js            # Entry point (ES6 module)
│   ├── core/
│   │   ├── Game.js        # Main game controller
│   │   ├── MessageBus.js  # Pub/sub event system
│   │   └── Component.js   # Base component class
│   ├── components/
│   │   ├── Terminal.js
│   │   ├── StatsWidget.js
│   │   ├── MapWidget.js
│   │   ├── CompassWidget.js
│   │   ├── CommsWidget.js
│   │   ├── Inventory.js
│   │   ├── NPCWidget.js
│   │   ├── FactoryWidget.js
│   │   └── TicketsWidget.js
│   ├── widgets/
│   │   ├── widget_manager.js      # Alpine.js widget manager
│   │   └── widget_registry.js     # Widget definitions
│   ├── utils/
│   │   ├── MapRenderer.js         # Map canvas rendering
│   │   └── Markup.js              # Text markup parsing
│   ├── models/
│   │   └── npc.js                 # NPC data model
│   └── editorShared/
│       └── EditorBase.js          # Base class for editor pages
├── css/
│   └── (stylesheets)
└── components/
    └── (if any shared components)
```

**Component Structure:**
- All components extend `Component` base class
- Components subscribe to MessageBus events
- Components have `init()` method called during boot
- Components update DOM in response to events

**Evidence:**
- `public/js/main.js:7-17` - Import statements show component locations
- `public/js/core/Component.js` - Base component class
- `public/js/widgets/StatsWidget.js:25` - Component subscription pattern
- Directory structure verified via project layout

---

## 17. Declare how health checks and service availability are shown to the user.

**Health Checks and Service Availability:**

### Server Health Check:
- **Endpoint:** `/health` (HTTP GET)
- **Response:** `{ status: 'ok', timestamp: ISO string }`
- **Purpose:** Railway/cloud deployment health monitoring
- **User Visibility:** Not displayed to users (Railway internal use)

### User-Visible Availability Indicators:

#### 1. **WebSocket Connection Status:**
- **Connected:** No explicit indicator (connection is implicit)
- **Disconnected:** Terminal shows "Not connected to server. Please wait..." message
- **Reconnecting:** Automatic reconnection with 3-second delay

#### 2. **Command Execution:**
- **Connection Check:** Before executing command, checks WebSocket state
- **Warning Message:** Shows "Not connected to server. Please wait..." if not connected
- **Cooldown:** Warning shown max once every 5 seconds

#### 3. **No Health Status Widget:**
- No dedicated "Server Status" widget
- No connection indicator icon
- Status inferred from ability to execute commands

### Railway Health Monitoring:
- Railway uses `/health` endpoint for container health checks
- Returns 200 OK if server is running
- No database connectivity check in health endpoint
- No WebSocket availability check in health endpoint

**Evidence:**
- `routes/api.js:33-36` - Health check endpoint
- `public/js/main.js:85-92` - Connection check before command execution
- `public/js/core/Game.js:218-244` - WebSocket disconnect handling
- No health status UI component found in codebase

**Not found in codebase:** No user-facing health status indicator. No server status widget. No connection quality indicator. Health endpoint is for infrastructure monitoring only.

---

## 18. Define rules for dynamic UI behavior based on server state.

**Dynamic UI Rules Based on Server State:**

### Server State → UI Updates Flow:

#### 1. **WebSocket Message → MessageBus Event → Component Update**
- Server sends WebSocket message with `type` field
- `Game.handleMessage()` routes message to MessageBus
- Component subscribed to event updates DOM

#### 2. **State Update Patterns:**

**Room State:**
- Message: `roomUpdate` → Event: `'room:update'`
- Updates: Terminal display, compass (available directions), map (current position)
- **Evidence:** `public/js/core/Game.js:256-280` - Room update handling

**Player Stats:**
- Message: `playerStats` → Event: `'player:stats'`
- Updates: StatsWidget displays current stats
- **Evidence:** `public/js/widgets/StatsWidget.js:25` - Subscribes to `'player:stats'`

**Inventory:**
- Message: `inventoryUpdate` → Event: `'inventory:update'`
- Updates: Inventory widget displays items
- **Evidence:** Component subscription pattern

**Factory State:**
- Message: `factoryWidgetState` → Event: `'factory:state'`
- Updates: FactoryWidget shows/hides based on room type, updates slot contents
- **Evidence:** `public/js/widgets/FactoryWidget.js:210-229` - Room type detection

#### 3. **Conditional UI Display:**
- **God Mode Widget:** Only shown if player has god mode
- **Warehouse Widget:** Only shown in warehouse room type
- **Factory Widget:** Only shown in factory room type
- **NPC Widget:** Only shown during harvest/attunement

#### 4. **Server-Driven Visibility:**
- Widget visibility determined by server-sent room data
- Room type determines which widgets are available
- Player permissions (god mode) determine widget access

**Evidence:**
- `public/js/core/Game.js:249-692` - Message routing to MessageBus
- `public/js/widgets/FactoryWidget.js:210` - Room type-based widget display
- `public/game.html:63-65` - Warehouse widget icon (hidden by default)
- `public/game.html:66-68` - God mode widget icon (hidden by default)

**Not found in codebase:** No client-side state prediction. No optimistic UI updates. All UI updates are reactive to server messages.

---

## 19. Specify how the frontend should behave if Railway fails over or restarts the container.

**Railway Failover/Restart Behavior:**

### WebSocket Disconnection:
- **Detection:** `WebSocket.onclose` event fires
- **Automatic Reconnection:** Attempts reconnect after 3 seconds
- **Max Attempts:** `MAX_RECONNECT_ATTEMPTS` (typically 5 attempts)
- **User Feedback:** Terminal shows "Not connected to server. Please wait..." message

### Reconnection Logic:
- **Auto-Reconnect:** `setTimeout(connectWebSocket, 3000)` on disconnect
- **Skip Conditions:** Does not reconnect if:
  - Character reselection in progress (`isReconnecting` flag)
  - Max reconnect attempts reached
  - Restart requested (`restartRequested` flag)

### After Successful Reconnection:
- **Session Authentication:** Sends `{ type: 'authenticateSession', windowId }` message
- **State Sync:** Server sends current room, player stats, inventory via WebSocket messages
- **UI Updates:** Components receive events and update to current state
- **No Page Reload:** Frontend recovers without page refresh

### Container Restart Scenario:
1. Railway restarts container
2. WebSocket connection closes
3. Frontend detects disconnect
4. Waits 3 seconds
5. Attempts reconnect to new container instance
6. Server re-authenticates session
7. Server sends current game state
8. UI updates to reflect current state

### Failure Scenarios:
- **Max Reconnects Exceeded:** Stops attempting, shows disconnect message
- **Server Unavailable:** Continues attempting reconnection (no exponential backoff implemented)
- **Session Expired:** Server rejects authentication, redirects to login (`window.location.href = '/'`)

**Evidence:**
- `public/js/core/Game.js:218-244` - WebSocket disconnect and reconnect logic
- `public/js/core/Game.js:198-203` - Reconnection authentication
- `public/js/main.js:85-92` - Command execution blocked when disconnected
- `public/client.js:298-324` - Alternative reconnect pattern (legacy)

**Not found in codebase:** No exponential backoff for reconnection. No retry limit configuration. No user-facing "reconnecting..." indicator. Reconnection is silent except for terminal message.

---

## 20. State enforcement level: guideline, standard, or canonical law.

**Enforcement Level:** **CANONICAL LAW**

### Rationale:
- **Railway deployment is production environment** - deviations can cause service outages
- **Protocol detection is critical** - wrong WebSocket protocol breaks connection
- **Environment variable exposure is security-critical** - exposing secrets violates security
- **Health check endpoint is infrastructure requirement** - Railway relies on it for container health
- **Session cookie configuration is Railway-specific** - `sameSite: 'lax'` required for Railway proxy
- **Trust proxy setting is mandatory** - Without it, IP addresses and protocols are incorrect

### Canonical Requirements (Must Not Be Violated):
1. WebSocket protocol MUST be determined from `location.protocol` (no hardcoding)
2. Environment variables MUST NOT be exposed to client-side code
3. BASE_URL MUST NOT be used in client-side URL construction
4. Health check endpoint MUST exist at `/health`
5. Session cookies MUST use `sameSite: 'lax'` in production
6. Trust proxy MUST be set to `1` for Railway deployments
7. Static files MUST use relative paths (no absolute URLs)
8. Frontend MUST handle WebSocket disconnection gracefully

### Standards (Should Be Followed):
1. Component structure should follow existing patterns
2. Error handling should provide user feedback
3. Logging should use consistent patterns

### Guidelines (Recommended):
1. Cache-busting strategy (currently none implemented)
2. Log aggregation strategy (currently none implemented)
3. User-facing health indicators (currently none implemented)

**Evidence:**
- `server.js:65-66` - Trust proxy (canonical requirement for Railway)
- `public/js/core/Game.js:28` - Protocol detection (canonical requirement)
- `routes/api.js:33-36` - Health check endpoint (canonical requirement)
- `docs/requirements.md:521-527` - Cookie configuration (canonical requirement for Railway)

---

## Summary

### Strengths:
1. **Deployment-Agnostic Frontend:** Same code works locally and on Railway
2. **Automatic Protocol Detection:** WebSocket protocol selected based on page protocol
3. **Robust Reconnection:** Automatic WebSocket reconnection on disconnect
4. **Server-Driven State:** UI updates reactively based on server messages
5. **Security:** No environment variables exposed to client

### Weaknesses:
1. **No Asset Versioning:** Cache invalidation requires manual browser refresh
2. **No User-Facing Health Indicators:** Users don't see connection status
3. **Extensive Console Logging:** Production logs same as development (no log reduction)
4. **No Offline Mode:** No service worker for offline functionality
5. **No Exponential Backoff:** Reconnection uses fixed 3-second delay

### Risks:
1. **Cache Staleness:** Production caching without versioning can serve old assets
2. **Session Cookie Configuration:** Railway-specific cookie settings must be maintained
3. **Trust Proxy Dependency:** Removal of trust proxy breaks Railway deployment
4. **Reconnection Limits:** Fixed max attempts may fail on extended outages
5. **No Client-Server Version Negotiation:** Schema changes may break old clients

---

## File References Summary

**Core Frontend Files:**
- `public/game.html` - Main game interface
- `public/index.html` - Login/character selection
- `public/js/main.js` - Entry point
- `public/js/core/Game.js` - Game controller
- `public/js/core/MessageBus.js` - Event system
- `public/js/core/Component.js` - Base component

**Server Configuration:**
- `server.js` - Express server, static file serving, trust proxy
- `routes/api.js` - API routes, health check
- `middleware/session.js` - Session management
- `database.js` - Database connection

**Documentation:**
- `docs/railway.md` - Railway deployment guide
- `docs/requirements.md` - Deployment requirements
- `nixpacks.toml` - Railway build configuration

---

**END OF ANALYSIS**





