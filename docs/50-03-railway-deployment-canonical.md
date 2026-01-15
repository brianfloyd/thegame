# Railway Deployment Canonical Specification

**Analysis Date:** Based on codebase analysis and successful deployment instance  
**Scope:** Railway platform deployment, service management, and deployment operations  
**Method:** Direct code examination with file/line citations per scrub methodology

---

## 1. Railway Deployment Schema / Source of Truth

Railway deployment is the **production deployment platform** for the game server. Railway provides:
- Application hosting (Node.js runtime)
- PostgreSQL database service
- Environment variable management
- Automatic builds and deployments
- Service management and scaling

**Deployment Configuration:**
- Build system: Nixpacks (configured via `nixpacks.toml`)
- Service name: `"final production"` (production application service)
- Database service: `postgres` (PostgreSQL template)
- Project initialization: `.railway/project.json` (created by `railway init`)

**Evidence:**
- `nixpacks.toml:1-11` - Nixpacks configuration for Railway builds
- `scripts/deploy-railway.ps1:2` - Service name: `"final production"`
- `scripts/deploy-railway.sh:3` - Service name: `"final production"`
- `scripts/deploy-railway.ps1:38-43` - Project initialization: `.railway/project.json`
- `scripts/deploy-railway.sh:32-37` - Project initialization check

---

## 2. Railway Services and Configuration

### 2.1 Production Application Service

#### Service Name: `"final production"`
- **Type:** Application service (Node.js)
- **Purpose:** Hosts the main game server (`server.js`)
- **Start Command:** `npm start` (defined in `nixpacks.toml:11`)
- **Build Command:** `npm ci || npm install` (defined in `nixpacks.toml:8`)
- **Node Version:** Node.js 20 (defined in `nixpacks.toml:5`)

**Evidence:**
- `scripts/deploy-railway.ps1:60-67` - Service creation logic
- `scripts/deploy-railway.sh:54-61` - Service creation logic
- `nixpacks.toml:5,8,11` - Build and start configuration

#### Service Linking
- **Link Command:** `railway link --service "final production"`
- **Purpose:** Associates current directory with the Railway service
- **State:** Stored in `.railway/project.json`

**Evidence:**
- `scripts/deploy-railway.ps1:72` - Service linking command
- `scripts/deploy-railway.sh:66` - Service linking command

---

### 2.2 Database Service

#### Service Name: `postgres`
- **Type:** PostgreSQL database service
- **Template:** `postgresql` (Railway template)
- **Purpose:** Hosts production database
- **Connection:** Referenced via `${{postgres.DATABASE_URL}}` in environment variables

**Evidence:**
- `scripts/deploy-railway.ps1:46-56` - Database service creation
- `scripts/deploy-railway.sh:41-50` - Database service creation
- `scripts/deploy-railway.ps1:80` - DATABASE_URL reference: `'${{postgres.DATABASE_URL}}'`
- `scripts/deploy-railway.sh:74` - DATABASE_URL reference: `'${{postgres.DATABASE_URL}}'`

---

## 3. Nixpacks Build Configuration

### 3.1 Build File: `nixpacks.toml`

**Location:** Root directory (`nixpacks.toml`)

**Configuration Sections:**

#### Setup Phase
- **Node.js Version:** `nodejs_20`
- **Purpose:** Sets up build environment

**Evidence:**
- `nixpacks.toml:4-5` - Setup phase configuration

#### Install Phase
- **Command:** `npm ci || npm install`
- **Purpose:** Installs dependencies (prefers `npm ci` for reproducible builds, falls back to `npm install`)

**Evidence:**
- `nixpacks.toml:7-8` - Install phase configuration

#### Start Command
- **Command:** `npm start`
- **Purpose:** Starts the application (executes `node server.js` per `package.json:10`)

**Evidence:**
- `nixpacks.toml:10-11` - Start command configuration
- `package.json:10` - `"start": "node server.js"`

**Notes:**
- `nixpacks.toml:2` - Comment indicates PostgreSQL client (`pg`) doesn't require native compilation
- Railway automatically detects and uses `nixpacks.toml` for builds

---

## 4. Railway CLI Commands and Operations

### 4.1 Authentication

#### `railway login`
- **Purpose:** Authenticates with Railway account
- **Usage:** Required before deployment operations
- **Check:** `railway whoami` verifies authentication status

**Evidence:**
- `scripts/deploy-railway.ps1:22-33` - Authentication check and login
- `scripts/deploy-railway.sh:21-27` - Authentication check and login

#### `railway whoami`
- **Purpose:** Returns currently logged-in Railway user
- **Usage:** Verifies authentication status

**Evidence:**
- `scripts/deploy-railway.ps1:23` - Authentication verification
- `scripts/deploy-railway.sh:22,26` - Authentication verification

---

### 4.2 Project Management

#### `railway init`
- **Purpose:** Initializes Railway project in current directory
- **Creates:** `.railway/project.json` file
- **Usage:** First-time setup only (checked before execution)

**Evidence:**
- `scripts/deploy-railway.ps1:37-43` - Project initialization check and execution
- `scripts/deploy-railway.sh:31-37` - Project initialization check and execution

#### `railway link --service "final production"`
- **Purpose:** Links current directory to existing Railway service
- **Service Parameter:** Must match service name exactly (`"final production"`)
- **Usage:** Associates local directory with Railway service for deployments

**Evidence:**
- `scripts/deploy-railway.ps1:72` - Service linking command
- `scripts/deploy-railway.sh:66` - Service linking command

---

### 4.3 Service Management

#### `railway service list`
- **Purpose:** Lists all services in Railway project
- **Usage:** Checks if services exist before creation

**Evidence:**
- `scripts/deploy-railway.ps1:48` - Service listing for database check
- `scripts/deploy-railway.ps1:61` - Service listing for app service check
- `scripts/deploy-railway.sh:42` - Service listing for database check
- `scripts/deploy-railway.sh:55` - Service listing for app service check

#### `railway service create "final production"`
- **Purpose:** Creates new application service with specified name
- **Service Name:** Must be quoted: `"final production"`
- **Usage:** Creates production application service (first-time setup)

**Evidence:**
- `scripts/deploy-railway.ps1:64` - Service creation command
- `scripts/deploy-railway.sh:58` - Service creation command

#### `railway add --service postgres --template postgresql`
- **Purpose:** Adds PostgreSQL database service to Railway project
- **Service Name:** `postgres`
- **Template:** `postgresql` (Railway-provided template)
- **Usage:** Creates database service (first-time setup)

**Evidence:**
- `scripts/deploy-railway.ps1:51` - Database service creation
- `scripts/deploy-railway.sh:45` - Database service creation

---

### 4.4 Environment Variables

#### `railway variables set VARIABLE_NAME=value --service "final production"`
- **Purpose:** Sets environment variable for Railway service
- **Service Parameter:** `--service "final production"` (required)
- **Usage:** Configures service environment variables

**Environment Variables Set:**
- `DATABASE_URL='${{postgres.DATABASE_URL}}'` - References postgres service
- `NODE_ENV=production` - Production environment flag
- `SESSION_SECRET="..."` - Generated or provided secret
- `SMTP_HOST=smtpout.secureserver.net` - Email server
- `SMTP_PORT=587` - Email port
- `SMTP_SECURE=false` - Email security
- `SMTP_USER=brian@brianfloyd.me` - Email user
- `SMTP_USERNAME=brian` - Email username
- `SMTP_PASSWORD="..."` - Email password (if provided)
- `BASE_URL="https://..."` - Application URL (set after first deployment)

**Evidence:**
- `scripts/deploy-railway.ps1:79-108` - Environment variable configuration
- `scripts/deploy-railway.sh:73-101` - Environment variable configuration
- `scripts/deploy-railway.ps1:127` - BASE_URL set after deployment
- `scripts/deploy-railway.sh:119` - BASE_URL set after deployment

**Special Cases:**
- `DATABASE_URL`: Uses Railway service reference syntax `${{postgres.DATABASE_URL}}`
- `SESSION_SECRET`: Generated if not provided: `crypto.randomBytes(32).toString('hex')`
- `SMTP_PASSWORD`: Must be provided manually or via environment variable
- `BASE_URL`: Set after first deployment using `railway domain` command

**Evidence:**
- `scripts/deploy-railway.ps1:87-92` - SESSION_SECRET generation
- `scripts/deploy-railway.sh:81-85` - SESSION_SECRET generation
- `scripts/deploy-railway.ps1:96-97` - SMTP_PASSWORD warning
- `scripts/deploy-railway.sh:89-90` - SMTP_PASSWORD warning

---

### 4.5 Deployment Operations

#### `railway up --service "final production"`
- **Purpose:** Uploads and deploys project to Railway service
- **Service Parameter:** `--service "final production"` (required)
- **Behavior:** 
  - Uploads current directory to Railway
  - Triggers build using `nixpacks.toml` configuration
  - Deploys and starts the application
- **Usage:** Standard deployment command

**Evidence:**
- `scripts/deploy-railway.ps1:116` - Deployment command
- `scripts/deploy-railway.sh:109` - Deployment command

#### `railway redeploy --service "final production" -y`
- **Purpose:** Redeploys the latest deployment without code changes
- **Service Parameter:** `--service "final production"` (required)
- **Flag:** `-y` (skip confirmation dialog)
- **Behavior:** Restarts the service using the last successful deployment
- **Usage:** Service restart for bug fixes or configuration changes

**Evidence:**
- Successfully executed instance (restart command)
- Railway CLI help output confirms `redeploy` subcommand exists

#### `railway domain`
- **Purpose:** Gets or sets custom domain for Railway service
- **Usage:** Retrieves deployment URL for BASE_URL configuration
- **Output:** Domain name (e.g., `thegame.railway.app`)

**Evidence:**
- `scripts/deploy-railway.ps1:122` - Domain retrieval
- `scripts/deploy-railway.sh:114` - Domain retrieval

---

### 4.6 Monitoring and Logs

#### `railway logs --service "final production"`
- **Purpose:** Views build and deployment logs from Railway
- **Service Parameter:** `--service "final production"` (required)
- **Usage:** Debugging deployments, checking build status

**Evidence:**
- `scripts/deploy-railway.ps1:139` - Logs command in next steps
- `scripts/deploy-railway.sh:128` - Logs command in next steps

#### `railway open`
- **Purpose:** Opens Railway project dashboard in default browser
- **Usage:** Accessing Railway web interface

**Evidence:**
- `scripts/deploy-railway.ps1:140` - Open dashboard command
- `scripts/deploy-railway.sh:129` - Open dashboard command

---

## 5. Deployment Process Flow

### 5.1 Initial Setup (First-Time Deployment)

**Steps:**
1. Install Railway CLI: `npm install -g @railway/cli`
2. Authenticate: `railway login`
3. Initialize project: `railway init` (creates `.railway/project.json`)
4. Create database service: `railway add --service postgres --template postgresql`
5. Create application service: `railway service create "final production"`
6. Link to service: `railway link --service "final production"`
7. Set environment variables: `railway variables set ... --service "final production"`
8. Deploy: `railway up --service "final production"`
9. Get deployment URL: `railway domain`
10. Set BASE_URL: `railway variables set BASE_URL="https://<url>" --service "final production"`

**Evidence:**
- `scripts/deploy-railway.ps1:11-134` - Complete initial setup flow
- `scripts/deploy-railway.sh:12-131` - Complete initial setup flow

---

### 5.2 Subsequent Deployments

**Steps:**
1. Ensure authenticated: `railway whoami` (if needed: `railway login`)
2. Ensure linked: `railway link --service "final production"` (if needed)
3. Update environment variables (if needed): `railway variables set ... --service "final production"`
4. Deploy: `railway up --service "final production"`

**Simplified Flow:** Since project is already initialized and services exist, subsequent deployments only require steps 1-4.

---

### 5.3 Service Restart (Without Code Changes)

**Steps:**
1. Ensure authenticated: `railway whoami` (if needed: `railway login`)
2. Redeploy: `railway redeploy --service "final production" -y`

**Purpose:** Restart service to apply environment variable changes or address runtime issues.

**Evidence:**
- Successfully executed instance (restart command)

---

## 6. Environment Variable Management

### 6.1 Railway Environment Variables vs Local Environment

**Railway Environment Variables:**
- Set via `railway variables set` command
- Stored in Railway platform
- Available to deployed service at runtime
- Persist across deployments

**Local Environment Variables:**
- Set in `.env` file or shell environment
- Used by deployment scripts (e.g., `SMTP_PASSWORD`, `SESSION_SECRET`)
- Not automatically synced to Railway (must be set via CLI)

**Evidence:**
- `scripts/deploy-railway.ps1:87-92` - SESSION_SECRET from local environment or generated
- `scripts/deploy-railway.ps1:96-108` - SMTP_PASSWORD from local environment or manual
- `scripts/deploy-railway.sh:81-101` - Same pattern in bash script

---

### 6.2 Environment Variable Reference Syntax

**Railway Service Reference:**
- Syntax: `${{service_name.VARIABLE_NAME}}`
- Example: `${{postgres.DATABASE_URL}}`
- Purpose: References environment variable from another Railway service
- Used for: Database connection strings from postgres service

**Evidence:**
- `scripts/deploy-railway.ps1:80` - DATABASE_URL reference: `'${{postgres.DATABASE_URL}}'`
- `scripts/deploy-railway.sh:74` - DATABASE_URL reference: `'${{postgres.DATABASE_URL}}'`

**Note:** See `50-00-environment-variables-canonical-spec.md` for complete environment variable specifications.

---

## 7. Build and Runtime Configuration

### 7.1 Build Process

**Build System:** Nixpacks
**Configuration File:** `nixpacks.toml`
**Build Steps:**
1. Setup: Install Node.js 20
2. Install: Run `npm ci || npm install`
3. Start: Execute `npm start` (runs `node server.js`)

**Evidence:**
- `nixpacks.toml:4-11` - Complete build configuration
- `package.json:10` - Start script definition

---

### 7.2 Runtime Environment

**Runtime:** Node.js 20 (as specified in `nixpacks.toml`)
**Start Command:** `npm start` → `node server.js`
**Port:** Set by Railway via `process.env.PORT` (see `50-00-environment-variables-canonical-spec.md`)
**Environment:** Production (`NODE_ENV=production`)

**Evidence:**
- `nixpacks.toml:5` - Node.js 20 specification
- `server.js:351` - PORT usage: `const PORT = process.env.PORT || 3434`
- `scripts/deploy-railway.ps1:84` - NODE_ENV=production setting

---

## 8. Deployment Scripts

### 8.1 PowerShell Script: `scripts/deploy-railway.ps1`

**Purpose:** Railway deployment script for Windows/PowerShell environments
**Service Name:** `"final production"`
**Operations:** Complete initial setup and deployment flow

**Key Features:**
- Railway CLI installation check
- Authentication verification
- Project initialization
- Service creation (database and application)
- Environment variable configuration
- Deployment execution
- BASE_URL configuration

**Evidence:**
- `scripts/deploy-railway.ps1:1-174` - Complete script implementation

---

### 8.2 Bash Script: `scripts/deploy-railway.sh`

**Purpose:** Railway deployment script for Unix/Linux/macOS environments
**Service Name:** `"final production"`
**Operations:** Same as PowerShell script, adapted for bash

**Key Features:**
- Same functionality as PowerShell version
- Bash syntax and error handling

**Evidence:**
- `scripts/deploy-railway.sh:1-164` - Complete script implementation

---

## 9. State Transitions (with file references)

### 9.1 Project State

**Initial State:** No Railway project
- No `.railway/project.json` file
- No services created

**After `railway init`:**
- `.railway/project.json` created
- Project linked to Railway account

**Evidence:**
- `scripts/deploy-railway.ps1:38-43` - Project initialization check and creation
- `scripts/deploy-railway.sh:32-37` - Project initialization check and creation

---

### 9.2 Service State

**Initial State:** No services
- No database service
- No application service

**After Service Creation:**
- `postgres` service exists (database)
- `"final production"` service exists (application)

**Service Linking:**
- Local directory linked to `"final production"` service
- Subsequent `railway` commands operate on linked service

**Evidence:**
- `scripts/deploy-railway.ps1:46-72` - Service creation and linking
- `scripts/deploy-railway.sh:41-66` - Service creation and linking

---

### 9.3 Deployment State

**Before Deployment:**
- Code exists in local directory
- Services configured in Railway
- Environment variables set

**During Deployment (`railway up`):**
- Code uploaded to Railway
- Build process executes (Nixpacks)
- Application starts

**After Deployment:**
- Application running on Railway
- Accessible via Railway domain
- BASE_URL can be retrieved and set

**Evidence:**
- `scripts/deploy-railway.ps1:115-134` - Deployment and URL configuration
- `scripts/deploy-railway.sh:108-131` - Deployment and URL configuration

---

## 10. Interactions with Other Systems

### 10.1 Environment Variables System
- **Interaction:** Railway sets `PORT` automatically
- **Interaction:** Railway provides `DATABASE_URL` from postgres service
- **Interaction:** All other environment variables set via `railway variables set`
- **Reference:** See `50-00-environment-variables-canonical-spec.md` for complete variable specifications

**Evidence:**
- `50-00-environment-variables-canonical-spec.md:148` - PORT auto-set by Railway
- `scripts/deploy-railway.ps1:79-108` - Environment variable configuration

---

### 10.2 Database System
- **Interaction:** Railway postgres service provides `DATABASE_URL`
- **Interaction:** Database service must exist before application service
- **Interaction:** Application connects to database using `DATABASE_URL`

**Evidence:**
- `scripts/deploy-railway.ps1:46-56` - Database service creation (before app service)
- `scripts/deploy-railway.ps1:80` - DATABASE_URL reference to postgres service
- `database.js:12` - Database connection using `DATABASE_URL`

---

### 10.3 Build System
- **Interaction:** Nixpacks reads `nixpacks.toml` for build configuration
- **Interaction:** Build process executes `npm ci || npm install`
- **Interaction:** Build process executes `npm start` to start application

**Evidence:**
- `nixpacks.toml:4-11` - Complete build configuration
- `package.json:9-10` - npm scripts used by build process

---

## 11. Failure States and Messages

### 11.1 Railway CLI Not Installed

**Error:** `railway: command not found` (or similar)
**Solution:** Install Railway CLI: `npm install -g @railway/cli`
**Detection:** Scripts check for Railway CLI before proceeding

**Evidence:**
- `scripts/deploy-railway.ps1:11-14` - CLI installation check
- `scripts/deploy-railway.sh:12-15` - CLI installation check

---

### 11.2 Authentication Failure

**Error:** `railway whoami` fails or returns error
**Solution:** Run `railway login` to authenticate
**Detection:** Scripts check authentication before proceeding

**Evidence:**
- `scripts/deploy-railway.ps1:22-33` - Authentication check and login
- `scripts/deploy-railway.sh:21-27` - Authentication check and login

---

### 11.3 Service Already Exists

**Error:** Service creation fails because service already exists
**Solution:** Scripts check for existing services before creation (no error, skips creation)
**Behavior:** Scripts continue if service already exists

**Evidence:**
- `scripts/deploy-railway.ps1:48-56` - Database service existence check
- `scripts/deploy-railway.ps1:61-67` - App service existence check
- `scripts/deploy-railway.sh:42-50` - Database service existence check
- `scripts/deploy-railway.sh:55-61` - App service existence check

---

### 11.4 Deployment Failures

**Build Failure:**
- **Cause:** Build errors (e.g., npm install fails, syntax errors)
- **Detection:** `railway logs --service "final production"` shows build errors
- **Solution:** Fix code/build issues and redeploy

**Runtime Failure:**
- **Cause:** Application crashes on startup (e.g., missing environment variables, database connection failure)
- **Detection:** `railway logs --service "final production"` shows runtime errors
- **Solution:** Check logs, fix configuration, redeploy

**Evidence:**
- `scripts/deploy-railway.ps1:139` - Logs command for debugging
- `scripts/deploy-railway.sh:128` - Logs command for debugging

---

### 11.5 Environment Variable Issues

**Missing Required Variables:**
- **Error:** Application may fail to start or operate correctly
- **Detection:** Check logs for missing variable errors
- **Solution:** Set missing variables via `railway variables set`

**Invalid Variable Format:**
- **Error:** Application may reject invalid values
- **Detection:** Runtime errors in logs
- **Solution:** Verify variable format per `50-00-environment-variables-canonical-spec.md`

**Evidence:**
- `scripts/deploy-railway.ps1:75-108` - Environment variable configuration
- `50-00-environment-variables-canonical-spec.md` - Variable specifications

---

## 12. Serialization Paths

**Railway deployment does not involve serialization.** Deployment process:
- Uploads source code (not serialized data)
- Builds application from source
- Starts application process
- Environment variables provided as process environment (not serialized)

**Database migrations** (if needed) are handled separately via:
- `railway run npm run migrate` (executes migrations on Railway database)
- Or `railway connect postgres` (connects directly to database)

**Evidence:**
- `docs/Chuck docs/999-fix-migrations-guide.md:22` - Migration execution via Railway CLI
- `docs/Chuck docs/999-fix-migrations-guide.md:30` - Database connection via Railway CLI

---

## 13. Known Gaps, Missing Features, or TODOs

### 13.1 Missing Features

1. **Automated Database Migrations:**
   - No automatic migration execution during deployment
   - Migrations must be run manually via `railway run npm run migrate`
   - **Gap:** Deployment script doesn't execute migrations

2. **Deployment Validation:**
   - No health check after deployment
   - No automated verification that service started successfully
   - **Gap:** Deployment script doesn't verify deployment success

3. **Rollback Mechanism:**
   - No documented rollback process
   - Railway supports rollback via dashboard, but not via CLI in scripts
   - **Gap:** No rollback script or documented rollback process

4. **Environment Variable Validation:**
   - No validation that all required environment variables are set
   - Deployment may succeed but application may fail at runtime
   - **Gap:** No pre-deployment validation of environment variables

---

### 13.2 Known Gaps

1. **BASE_URL Manual Configuration:**
   - BASE_URL must be set after first deployment
   - Deployment script attempts to set it, but may fail if domain not yet available
   - **Gap:** BASE_URL configuration not always automated

**Evidence:**
- `scripts/deploy-railway.ps1:111` - BASE_URL warning note
- `scripts/deploy-railway.ps1:122-127` - BASE_URL configuration attempt
- `scripts/deploy-railway.sh:104` - BASE_URL warning note
- `scripts/deploy-railway.sh:114-119` - BASE_URL configuration attempt

2. **SMTP_PASSWORD Manual Configuration:**
   - SMTP_PASSWORD must be provided manually or via local environment variable
   - Deployment script warns but doesn't fail if missing
   - **Gap:** No automated secure input for SMTP_PASSWORD

**Evidence:**
- `scripts/deploy-railway.ps1:96-97` - SMTP_PASSWORD warning
- `scripts/deploy-railway.sh:89-90` - SMTP_PASSWORD warning

3. **Service Restart Documentation:**
   - Service restart command (`railway redeploy`) not documented in deployment scripts
   - Restart process only discovered through successful execution
   - **Gap:** Restart process not included in deployment scripts or documentation

---

### 13.3 TODOs

1. Add migration execution to deployment scripts (with confirmation)
2. Add health check after deployment to verify service started
3. Document rollback process (via Railway dashboard or CLI)
4. Add environment variable validation before deployment
5. Improve BASE_URL configuration automation
6. Add service restart command to deployment scripts as optional step
7. Document Railway CLI commands in canonical format (this document addresses this)

---

## 14. Summary of Strengths, Weaknesses, Risks

### 14.1 Strengths

1. **Automated Deployment:** Scripts provide complete automated deployment flow
2. **Service Management:** Clear service creation and configuration process
3. **Environment Variables:** Comprehensive environment variable setup
4. **Cross-Platform:** Both PowerShell and bash scripts available
5. **Build Configuration:** Nixpacks configuration is simple and maintainable

---

### 14.2 Weaknesses

1. **No Migration Automation:** Migrations must be run manually
2. **No Deployment Validation:** No verification that deployment succeeded
3. **Manual Configuration Steps:** BASE_URL and SMTP_PASSWORD require manual steps
4. **No Rollback Process:** No documented or automated rollback mechanism
5. **Restart Not Documented:** Service restart process not in scripts

---

### 14.3 Risks

1. **Deployment Without Migrations:** Deployments may succeed but fail at runtime if migrations not run
2. **Missing Environment Variables:** Deployment may succeed but application may fail if variables not set correctly
3. **No Health Checks:** Failed deployments may go unnoticed until manual testing
4. **Configuration Drift:** Environment variables may become out of sync between deployments
5. **No Rollback Plan:** Failed deployments require manual intervention to restore previous version

---

## 15. Code Reference Format

When citing code, Cursor should always use this format:
- `<relative-path>/<file-name>:<line>` for single line references
- `<relative-path>/<file-name>:<line-start>-<line-end>` for multi-line references

**Examples:**
- `nixpacks.toml:5` - Node.js version specification
- `scripts/deploy-railway.ps1:60-67` - Service creation logic
- `scripts/deploy-railway.sh:73-101` - Environment variable configuration
- `scripts/deploy-railway.ps1:116` - Deployment command

---

## 16. Related Canonical Documents

- **`50-00-environment-variables-canonical-spec.md`** - Complete environment variable specifications (referenced throughout this document)
- **`20-00-file-structure-canonical.md`** - File structure (deployment scripts location: `scripts/`)
- **`20-03-backend-services-canonical.md`** - Backend services architecture (deployed service)

---

**END OF SPECIFICATION**
