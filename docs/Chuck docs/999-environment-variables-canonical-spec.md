# Environment Variables Canonical Specification

**Analysis Date:** Based on codebase analysis  
**Scope:** All environment variables used across the game server, MCP server, and related systems  
**Method:** Direct code examination with file/line citations per scrub methodology

---

## 1. Environment Variables Schema / Source of Truth

Environment variables are the **configuration layer** for the game server, MCP server, and related services. They are read via `process.env.VARIABLE_NAME` and are **never exposed to client-side code**.

**No database tables store environment variables.** They exist only in:
- Process environment (set by deployment platform or shell)
- `.env` files (for local development, loaded via `dotenv`)
- MCP server configuration (`~/.cursor/mcp.json` env object)

**Evidence:**
- `database.js:12` - `process.env.DATABASE_URL` accessed server-side only
- `utils/email.js:17-21` - SMTP configuration from `process.env.SMTP_*`
- `server.js:351` - `process.env.PORT` used for server port
- `mcp-test-server/src/StateVerifier.js:20-23` - `process.env.DATABASE_URL` fallback
- `mcp-test-server/tools/knowledge.js:16-24` - `dotenv.config()` loads `.env` file

**Not found in codebase:** No environment variable storage table. No admin interface for setting environment variables. No runtime modification of environment variables.

---

## 2. All Environment Variables, Defaults, Nullability, Constraints

### 2.1 Database Configuration

#### `DATABASE_URL`
- **Type:** String (PostgreSQL connection string)
- **Required:** YES (server will fail to start without it)
- **Default:** None
- **Format:** `postgresql://user:password@host:port/database`
- **Used in:**
  - `database.js:12` - PostgreSQL connection pool initialization
  - `mcp-test-server/src/StateVerifier.js:20-23` - MCP server database connection
- **Security:** Contains database password - **MUST NEVER be exposed to client**
- **Evidence:**
  - `database.js:12` - Direct connection string usage: `connectionString: process.env.DATABASE_URL`
  - `database.js:13` - SSL configuration based on NODE_ENV (server-side only)
  - No `process.env` references found in `public/js/**/*.js` files (verified via grep)

---

### 2.2 Session Security

#### `SESSION_SECRET`
- **Type:** String (cryptographic secret)
- **Required:** YES (session middleware requires it)
- **Default:** `'dev-secret-change-in-production'` (fallback if not set)
- **Format:** Any string (recommended: long random string)
- **Used in:**
  - `middleware/session.js:41` - Express session cookie signing: `secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production'`
- **Security:** Used for session cookie encryption - **MUST NEVER be exposed to client**
- **Evidence:**
  - `middleware/session.js:41` - Server-side only usage in session middleware configuration
  - No `process.env.SESSION_SECRET` references found in `public/js/**/*.js` files

---

### 2.3 Email Configuration (SMTP)

#### `SMTP_HOST`
- **Type:** String (SMTP server hostname)
- **Required:** NO (has default)
- **Default:** `'smtpout.secureserver.net'` (if not set)
- **Format:** Hostname or IP address (e.g., `smtp.gmail.com`, `mail.example.com`)
- **Used in:**
  - `utils/email.js:17` - Nodemailer transport configuration: `const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net'`
- **Evidence:**
  - `utils/email.js:17` - Direct usage in email service initialization

#### `SMTP_PORT`
- **Type:** Number (as string, converted to integer)
- **Required:** NO (has default)
- **Default:** `587` (if not set)
- **Format:** Port number (e.g., `587`, `465`, `25`)
- **Used in:**
  - `utils/email.js:18` - Nodemailer transport configuration: `const smtpPort = parseInt(process.env.SMTP_PORT || '587')`
- **Evidence:**
  - `utils/email.js:18` - Direct usage with parseInt conversion

#### `SMTP_SECURE`
- **Type:** Boolean (as string, converted: `'true'` → true, anything else → false)
- **Required:** NO
- **Default:** `false` (if not set, or if SMTP_PORT is not `'465'`)
- **Format:** `'true'` or `'false'` (string)
- **Used in:**
  - `utils/email.js:19` - Nodemailer transport configuration: `const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465'`
- **Evidence:**
  - `utils/email.js:19` - Determines TLS/SSL usage for email transport

#### `SMTP_USER`
- **Type:** String (SMTP authentication username/email)
- **Required:** YES (if email service is enabled)
- **Default:** None
- **Format:** Email address (e.g., `brian@brianfloyd.me`)
- **Used in:**
  - `utils/email.js:20` - Nodemailer authentication: `let smtpUser = process.env.SMTP_USER`
  - `utils/email.js:125` - Email `from` field: `from: "The Game" <${process.env.SMTP_USER}>`
  - `utils/email.js:263` - Email `from` field: `from: "The Game" <${process.env.SMTP_USER}>`
  - `routes/api.js:44` - Email status endpoint: `smtpUser: process.env.SMTP_USER ? '***configured***' : 'not set'`
- **Security:** Email address only - less sensitive than password
- **Evidence:**
  - `utils/email.js:20,125,263` - Used for authentication and email sender
  - `routes/api.js:44` - Sanitized output in status endpoint (never exposes actual value)

#### `SMTP_USERNAME`
- **Type:** String (alternative to SMTP_USER)
- **Required:** NO (if SMTP_USER is set)
- **Default:** None (extracted from SMTP_USER if not provided)
- **Format:** Username or email address
- **Used in:**
  - `utils/email.js:35` - Nodemailer authentication: `let authUser = process.env.SMTP_USERNAME`
  - `utils/email.js:36-38` - Falls back to extracting username from SMTP_USER if not provided
- **Note:** Some SMTP providers use separate username field
- **Evidence:**
  - `utils/email.js:35-38` - Used for SMTP authentication, with fallback logic

#### `SMTP_PASSWORD`
- **Type:** String (SMTP authentication password)
- **Required:** YES (if email service is enabled)
- **Default:** None
- **Format:** Plain text password (SMTP provider password or app-specific password)
- **Used in:**
  - `utils/email.js:21` - Nodemailer authentication: `const smtpPassword = process.env.SMTP_PASSWORD`
  - `routes/api.js:45` - Email status endpoint: `smtpPassword: process.env.SMTP_PASSWORD ? '***configured***' : 'not set'`
- **Security:** Contains password - **MUST NEVER be exposed to client**
- **Evidence:**
  - `utils/email.js:21` - Used for SMTP authentication
  - `routes/api.js:45` - Sanitized output in status endpoint (never exposes actual value)

---

### 2.4 Server Configuration

#### `PORT`
- **Type:** Number (as string, converted to integer)
- **Required:** NO (has default)
- **Default:** `3434` (if not set)
- **Format:** Port number (e.g., `3000`, `8080`, `3434`)
- **Used in:**
  - `server.js:351` - Express server listen port: `const PORT = process.env.PORT || 3434`
- **Deployment:** Railway auto-sets this variable
- **Evidence:**
  - `server.js:351` - Direct usage with fallback to 3434
  - No `process.env.PORT` references found in `public/js/**/*.js` files

#### `NODE_ENV`
- **Type:** String (environment identifier)
- **Required:** NO
- **Default:** `undefined` (treated as development)
- **Format:** `'production'` or `'development'` (typically)
- **Used in:**
  - `server.js:79` - Cache control: `if (process.env.NODE_ENV !== 'production')`
  - `server.js:89-90` - Static file caching behavior (enabled in production)
  - `middleware/session.js:47` - Session cookie `secure` flag: `secure: process.env.NODE_ENV === 'production'`
  - `middleware/session.js:51` - Session cookie `sameSite` flag: `sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict'`
  - `database.js:13` - Database SSL configuration: `ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false`
- **Behavior:**
  - `NODE_ENV=production`: Enables caching, secure cookies, database SSL
  - `NODE_ENV !== 'production'`: Disables caching, allows HTTP cookies, no SSL requirement
- **Evidence:**
  - `server.js:79,89-90` - Controls static file caching
  - `middleware/session.js:47,51` - Controls cookie security settings
  - `database.js:13` - Controls database SSL connection

---

### 2.5 Email Link Generation

#### `BASE_URL`
- **Type:** String (full URL with protocol)
- **Required:** NO (has default)
- **Default:** `'http://localhost:3434'` (if not set)
- **Format:** Full URL (e.g., `https://thegame.railway.app`, `http://localhost:3000`)
- **Used in:**
  - `utils/email.js:121` - Email template link generation: `const baseUrl = process.env.BASE_URL || 'http://localhost:3434'`
  - `utils/email.js:122` - Verification URL: `${baseUrl}/api/verify-email?token=${verificationToken}`
  - `utils/email.js:259` - Password reset URL: `const baseUrl = process.env.BASE_URL || 'http://localhost:3434'`
  - `utils/email.js:260` - Reset URL: `${baseUrl}/reset-password?token=${resetToken}`
- **Security:** Used server-side only - **NEVER sent to client**
- **Client Alternative:** Client uses `window.location.origin` instead
- **Evidence:**
  - `utils/email.js:121,122,259,260` - Used in email templates for link generation
  - `public/js/core/Game.js:28-29` - Client constructs WebSocket URL using `location.protocol` and `location.host`: `this.wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://'; this.wsUrl = this.wsProtocol + location.host`
  - No `process.env.BASE_URL` references found in `public/js/**/*.js` files

---

### 2.6 MCP Server Configuration

#### `GAME_WS_URL`
- **Type:** String (WebSocket URL)
- **Required:** NO
- **Default:** `'ws://localhost:3000'` (if not set)
- **Format:** WebSocket URL (e.g., `ws://localhost:3000`, `wss://thegame.railway.app`)
- **Used in:**
  - `mcp-test-server/src/GameClient.js:16` - MCP server WebSocket connection: `this.wsUrl = config.wsUrl || process.env.GAME_WS_URL || 'ws://localhost:3000'`
- **Scope:** MCP server only (not main game server)
- **Evidence:**
  - `mcp-test-server/src/GameClient.js:16` - Direct usage with fallback chain

#### `GAME_HTTP_URL`
- **Type:** String (HTTP URL)
- **Required:** NO
- **Default:** `'http://localhost:3000'` (if not set)
- **Format:** HTTP URL (e.g., `http://localhost:3000`, `https://thegame.railway.app`)
- **Used in:**
  - `mcp-test-server/src/GameClient.js:17` - MCP server HTTP API calls: `this.httpUrl = config.httpUrl || process.env.GAME_HTTP_URL || 'http://localhost:3000'`
- **Scope:** MCP server only (not main game server)
- **Evidence:**
  - `mcp-test-server/src/GameClient.js:17` - Direct usage with fallback chain

#### `OPENAI_API_KEY`
- **Type:** String (OpenAI API key)
- **Required:** NO (optional, required only for knowledge embeddings)
- **Default:** None
- **Format:** OpenAI API key string
- **Used in:**
  - `mcp-test-server/tools/knowledge.js:20-24` - OpenAI client initialization for embeddings
- **Loading:** Loaded via `dotenv.config()` in knowledge.js
- **Scope:** MCP server only (not main game server)
- **Evidence:**
  - `mcp-test-server/tools/knowledge.js:16` - `dotenv.config()` loads `.env` file
  - `mcp-test-server/tools/knowledge.js:20-24` - OpenAI client initialization: `if (process.env.OPENAI_API_KEY) { openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) }`

---

## 3. Environment Variable Operations (Read, Write, Mutate)

### 3.1 Read Operations

**Server-Side Reads:**
- `process.env.VARIABLE_NAME` - Direct access throughout server code
- `dotenv.config()` - Loads `.env` file into `process.env` (MCP server knowledge tools only)

**Client-Side Reads:**
- **NONE** - No `process.env` access in client-side code
- Client uses browser APIs: `location.protocol`, `location.host`, `window.location.origin`

**Evidence:**
- No `process.env` references found in `public/js/**/*.js` files (verified via grep)
- `public/js/core/Game.js:28-29` - Client constructs WebSocket URL using `location.protocol` and `location.host`
- `public/js/editorShared/EditorBase.js:67-68` - Editor constructs WebSocket URL using `location.protocol` and `location.host`

### 3.2 Write Operations

**Runtime Writes:**
- **NOT SUPPORTED** - Environment variables are read-only at runtime
- Variables must be set before process starts (deployment platform, shell, `.env` file)

**Configuration Sources:**
1. **Process Environment:** Set by shell or deployment platform (Railway, etc.)
2. **`.env` File:** Loaded via `dotenv` (MCP server knowledge tools only)
3. **MCP Configuration:** Set in `~/.cursor/mcp.json` `env` object (MCP server only)

**Evidence:**
- `mcp-test-server/tools/knowledge.js:16` - `dotenv.config()` loads `.env` file
- No runtime modification code found in codebase (all environment variable access is read-only)

### 3.3 Mutate Operations

**NOT SUPPORTED** - Environment variables are immutable at runtime. Changes require:
- Restarting the server process
- Updating deployment platform environment variables
- Modifying `.env` file and reloading (MCP server only)

---

## 4. Validations + Missing Validations

### 4.1 Existing Validations

**DATABASE_URL:**
- **Validation:** MCP server throws error if missing: `mcp-test-server/src/StateVerifier.js:22-23` - `if (!connectionString) { throw new Error('DATABASE_URL not set') }`
- **Missing:** Main game server does not validate DATABASE_URL on startup (will fail on first DB operation)

**SMTP Configuration:**
- **Validation:** Email service checks if SMTP is configured: `routes/api.js:39-49` - `/api/email-status` endpoint
- **Validation:** Email service logs error if SMTP_USER or SMTP_PASSWORD missing: `utils/email.js:44-48` - `if (!smtpUser || !smtpPassword) { console.error('...'); transporter = null; return; }`
- **Missing:** No validation that all required SMTP variables are present before email service initialization

**PORT:**
- **Validation:** Has default value (`3434`) - will not fail if missing
- **Missing:** No validation that PORT is a valid number

**NODE_ENV:**
- **Validation:** None - any value is accepted
- **Missing:** No validation that NODE_ENV is a recognized value

**BASE_URL:**
- **Validation:** None
- **Missing:** No validation that BASE_URL is a valid URL format
- **Missing:** No validation that BASE_URL matches deployment URL

### 4.2 Missing Validations

**Critical Missing Validations:**
1. **DATABASE_URL format validation** - No check that connection string is valid PostgreSQL format
2. **SMTP configuration completeness** - No check that all required SMTP variables are present
3. **BASE_URL format validation** - No check that BASE_URL is a valid URL
4. **SESSION_SECRET presence** - No check that SESSION_SECRET is set (will fail at runtime, but has fallback)
5. **Environment variable type validation** - No checks that numeric variables (PORT, SMTP_PORT) are valid numbers

**Evidence:**
- No startup validation found in `server.js` for environment variables
- No validation in `database.js` for DATABASE_URL format
- No validation in `utils/email.js` for SMTP configuration completeness (only checks SMTP_USER and SMTP_PASSWORD presence)

---

## 5. Behavioral Rules / Invariants

### 5.1 Server-Side Only Rule

**Invariant:** Environment variables are **NEVER exposed to client-side code**.

**Enforcement:**
- No `process.env` usage in `public/**/*.js` files
- No environment variable injection into HTML
- Client uses browser APIs (`location.protocol`, `location.host`) instead

**Evidence:**
- No `process.env` references found in `public/js/**/*.js` files (verified via grep)
- `public/js/core/Game.js:28-29` - Client uses `location.protocol` and `location.host` for WebSocket URL
- `public/js/editorShared/EditorBase.js:67-68` - Editor uses `location.protocol` and `location.host` for WebSocket URL

### 5.2 Security Rule

**Invariant:** Secrets (DATABASE_URL, SESSION_SECRET, SMTP_PASSWORD) **MUST NEVER be exposed to client**.

**Enforcement:**
- All secret variables used server-side only
- `/api/email-status` endpoint shows `'***configured***'` but never actual values
- No API endpoints expose environment variable values

**Evidence:**
- `routes/api.js:44-45` - Email status endpoint sanitizes output: `smtpUser: process.env.SMTP_USER ? '***configured***' : 'not set'`
- No `process.env` references found in `public/js/**/*.js` files
- All environment variable access is server-side only

### 5.3 NODE_ENV Behavior Rule

**Invariant:** `NODE_ENV=production` enables production behaviors (caching, secure cookies, SSL).

**Enforcement:**
- `server.js:79` - Cache control based on `NODE_ENV !== 'production'`
- `server.js:89-90` - Static file caching enabled in production
- `middleware/session.js:47` - Secure cookies in production only
- `middleware/session.js:51` - SameSite cookie setting based on NODE_ENV
- `database.js:13` - SSL enabled in production only

**Evidence:**
- `server.js:79` - `if (process.env.NODE_ENV !== 'production')` disables caching
- `server.js:89-90` - Production enables static file caching
- `middleware/session.js:47` - `secure: process.env.NODE_ENV === 'production'`
- `middleware/session.js:51` - `sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict'`
- `database.js:13` - `ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false`

### 5.4 BASE_URL Usage Rule

**Invariant:** `BASE_URL` is used server-side for email links only. Client never receives or uses BASE_URL.

**Enforcement:**
- Email templates use `BASE_URL` server-side
- Client constructs URLs using `window.location.origin` or `location.host`
- No `BASE_URL` variable in any frontend code

**Evidence:**
- `utils/email.js:121,122,259,260` - BASE_URL used in email templates
- `public/js/core/Game.js:28-29` - Client uses `location.protocol` and `location.host` for WebSocket URL
- No `process.env.BASE_URL` references found in `public/js/**/*.js` files

---

## 6. State Transitions (with file references)

**Environment variables do not have state transitions.** They are:
- Set before process starts
- Read-only at runtime
- Immutable during process lifetime

**Configuration Changes Require:**
1. Update environment variable (deployment platform, `.env` file, or MCP config)
2. Restart process (server restart, MCP server restart)

**Evidence:**
- No runtime modification code found in codebase
- All environment variable access is read-only (`process.env.VARIABLE_NAME`)

---

## 7. Interactions with Other Systems

### 7.1 Database System
- **DATABASE_URL** → `database.js:12` → PostgreSQL connection pool
- **NODE_ENV** → `database.js:13` → SSL configuration (production only)

### 7.2 Email System
- **SMTP_*** → `utils/email.js:17-21` → Nodemailer transport configuration
- **BASE_URL** → `utils/email.js:121,259` → Email template link generation
- **SMTP_USER** → `utils/email.js:125,263` → Email `from` field

### 7.3 Session System
- **SESSION_SECRET** → `middleware/session.js:41` → Express session cookie signing
- **NODE_ENV** → `middleware/session.js:47,51` → Cookie `secure` and `sameSite` flags (production only)

### 7.4 Server System
- **PORT** → `server.js:351` → Express server listen port
- **NODE_ENV** → `server.js:79,89-90` → Cache control and static file serving

### 7.5 MCP Server System
- **DATABASE_URL** → `mcp-test-server/src/StateVerifier.js:20-23` → Database connection
- **GAME_WS_URL** → `mcp-test-server/src/GameClient.js:16` → WebSocket connection
- **GAME_HTTP_URL** → `mcp-test-server/src/GameClient.js:17` → HTTP API calls
- **OPENAI_API_KEY** → `mcp-test-server/tools/knowledge.js:20-24` → OpenAI embeddings

**Evidence:**
- All interactions documented with direct code references above

---

## 8. Failure States and Messages

### 8.1 Missing Required Variables

**DATABASE_URL Missing:**
- **MCP Server:** `mcp-test-server/src/StateVerifier.js:22-23` - `throw new Error('DATABASE_URL not set')`
- **Main Server:** No explicit error - will fail on first database operation with connection error

**SESSION_SECRET Missing:**
- **Error:** Express session middleware will use fallback: `middleware/session.js:41` - `secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production'`
- **Impact:** Uses insecure default in development, may fail in production

**SMTP Variables Missing:**
- **Error:** Email service will not initialize: `utils/email.js:44-48` - `if (!smtpUser || !smtpPassword) { console.error('...'); transporter = null; return; }`
- **Message:** `'❌ Email service: SMTP_USER and SMTP_PASSWORD must be set in .env file'`
- **Impact:** Email service unavailable, but server continues running

**BASE_URL Missing:**
- **Error:** Email links will use default: `utils/email.js:121` - `const baseUrl = process.env.BASE_URL || 'http://localhost:3434'`
- **Impact:** Email links may point to wrong URL in production

### 8.2 Invalid Format Variables

**PORT Invalid:**
- **Error:** Server will fail to start if PORT is not a valid number
- **Message:** Node.js `listen` error: "Invalid port"

**DATABASE_URL Invalid:**
- **Error:** Database connection will fail on first operation
- **Message:** PostgreSQL connection error (from pg library)

**SMTP Configuration Invalid:**
- **Error:** Email sending will fail
- **Message:** Nodemailer SMTP connection error (logged in `utils/email.js:76-107`)

### 8.3 Missing Error Handling

**Not Found:**
- No startup validation for required environment variables
- No graceful degradation for missing optional variables
- No user-friendly error messages for missing configuration
- No environment variable validation utility

**Evidence:**
- No validation code found in `server.js` startup sequence
- No validation in `database.js` for DATABASE_URL format
- No validation in `utils/email.js` for SMTP configuration completeness (only checks presence)

---

## 9. Serialization Paths

**Environment variables are NOT serialized.** They are:
- Not sent to client in any API response
- Not included in WebSocket messages
- Not exposed in HTML or JavaScript
- Not logged in production (should not be logged)

**Client Receives:**
- Derived values only (e.g., WebSocket protocol from `location.protocol`)
- No direct environment variable values

**Evidence:**
- `routes/api.js:44-45` - Email status endpoint sanitizes output (never exposes actual values)
- `public/js/core/Game.js:28-29` - Client constructs WebSocket URL from `location.protocol` and `location.host`
- No `process.env` references found in `public/js/**/*.js` files

---

## 10. Known Gaps, Missing Features, or TODOs

### 10.1 Missing Features

1. **Environment Variable Validation:**
   - No startup validation for required variables
   - No format validation for variables (URLs, ports, etc.)
   - No type validation (numbers, booleans)

2. **Environment Variable Documentation:**
   - No `.env.example` file in repository
   - No environment variable reference documentation
   - No deployment guide for setting variables

3. **Error Handling:**
   - No graceful error messages for missing variables
   - No validation utility for environment variables
   - No environment variable health check endpoint

4. **Development Tools:**
   - No environment variable validation script
   - No environment variable template generator
   - No environment variable diff tool (dev vs prod)

### 10.2 Known Gaps

1. **DATABASE_URL Validation:**
   - Main server does not validate DATABASE_URL on startup
   - Will fail on first database operation instead of at startup

2. **SMTP Configuration:**
   - No validation that all required SMTP variables are present
   - Email service may fail silently if partially configured

3. **BASE_URL Validation:**
   - No validation that BASE_URL matches actual deployment URL
   - No validation that BASE_URL is a valid URL format

4. **NODE_ENV Values:**
   - No validation that NODE_ENV is a recognized value
   - Any string value is accepted (could cause unexpected behavior)

### 10.3 TODOs

1. Add startup validation for all required environment variables
2. Create `.env.example` file with all variables documented
3. Add environment variable validation utility
4. Add environment variable health check endpoint
5. Document environment variable requirements in deployment guide

---

## 11. Summary of Strengths, Weaknesses, Risks

### 11.1 Strengths

1. **Clear Separation:** Environment variables are server-side only, never exposed to client
2. **Security:** Secrets are properly isolated from client-side code
3. **Flexibility:** Easy to configure for different environments (dev, prod, Railway)
4. **MCP Integration:** MCP server has clear environment variable configuration

### 11.2 Weaknesses

1. **No Validation:** Missing startup validation for required variables
2. **No Documentation:** No `.env.example` file or comprehensive documentation
3. **Silent Failures:** Some missing variables cause failures at runtime, not startup
4. **No Type Checking:** No validation that numeric variables are valid numbers

### 11.3 Risks

1. **Security Risk:** Missing validation could lead to misconfigured deployments
2. **Runtime Failures:** Missing variables cause failures during operation, not at startup
3. **Configuration Drift:** No validation that environment matches expected configuration
4. **Developer Experience:** Missing variables cause cryptic errors, not helpful messages

---

## 12. Code Reference Format

When citing code, Cursor should always use this format:
- `<relative-path>/<file-name>:<line>` for single line references
- `<relative-path>/<file-name>:<line-start>-<line-end>` for multi-line references

**Examples:**
- `database.js:12` - DATABASE_URL usage
- `utils/email.js:17-21` - SMTP configuration
- `server.js:351` - PORT usage
- `mcp-test-server/src/StateVerifier.js:20-23` - DATABASE_URL validation

---

**END OF SPECIFICATION**
