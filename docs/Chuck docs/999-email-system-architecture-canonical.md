# Email System Architecture - Canonical Spec

**Analysis Date:** Based on codebase as of current state  
**Enforcement Level:** Standard (implementation exists, but not all features are canonical law)

---

## 1. Canonical Purpose of the Email System

**Answer:** The email system serves **exclusively for account authentication and account management**. It is NOT an in-game messaging system.

**Evidence:**
- `utils/email.js:1-6` - Module header states: "Handles sending emails for account verification, password resets, etc."
- `routes/api.js:108-133` - Email verification endpoint (`/api/verify-email`)
- `routes/api.js:181-232` - Password reset endpoints (`/api/request-password-reset`, `/api/reset-password`)
- `docs/email.md:1-11` - Documentation confirms: "Verification and password reset emails"

**NOT Found in Codebase:**
- No in-game player-to-player mail system
- No system alerts sent via email (only in-game messages)
- No AI notices sent via email
- No email-based notifications for game events

---

## 2. Types of Messages Supported

**Answer:** The email system supports **exactly two types of messages**:

1. **Account Verification Emails** - Sent during registration
2. **Password Reset Emails** - Sent when user requests password reset

**Evidence:**
- `utils/email.js:110-247` - `sendVerificationEmail()` function
- `utils/email.js:249-370` - `sendPasswordResetEmail()` function
- `routes/api.js:136-179` - Resend verification email endpoint
- `routes/api.js:182-232` - Password reset request endpoint

**Message Types NOT Found:**
- System alerts via email
- Player mail/messaging via email
- AI notices via email
- Game event notifications via email
- Newsletter or marketing emails

---

## 3. Email Storage: Server-Side, Client-Side, or Both

**Answer:** **Server-side only**. No client-side email storage or caching exists.

**Evidence:**
- `migrations/024_email_verification_tokens.sql:4-14` - `email_verification_tokens` table (server-side)
- `migrations/024_email_verification_tokens.sql:17-27` - `password_reset_tokens` table (server-side)
- `migrations/022_accounts_system.sql:4-12` - `accounts` table stores email addresses (server-side)
- No client-side email storage found in `public/js/` or `public/` directories
- No email-related WebSocket messages for client-side caching

**Email Data Stored:**
- Account email addresses in `accounts.email` (TEXT, UNIQUE, NOT NULL)
- Verification tokens in `email_verification_tokens` table
- Password reset tokens in `password_reset_tokens` table

---

## 4. Required Fields for Email Records

**Answer:** The email system does NOT store email messages. It stores **tokens** and **account email addresses**.

### Account Email Fields (`accounts` table):
- `id` (SERIAL PRIMARY KEY) - Required
- `email` (TEXT NOT NULL UNIQUE) - Required, validated with regex constraint
- `email_verified` (BOOLEAN NOT NULL DEFAULT FALSE) - Required, defaults to FALSE
- `created_at` (BIGINT NOT NULL) - Required, auto-generated
- `last_login_at` (BIGINT) - Optional

**Evidence:**
- `migrations/022_accounts_system.sql:4-12` - Schema definition
- `migrations/022_accounts_system.sql:11` - Email format constraint: `CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')`

### Email Verification Token Fields (`email_verification_tokens` table):
- `id` (SERIAL PRIMARY KEY) - Required
- `account_id` (INTEGER NOT NULL REFERENCES accounts(id)) - Required
- `token` (TEXT NOT NULL UNIQUE) - Required, UUID v4
- `expires_at` (BIGINT NOT NULL) - Required, 24 hours from creation
- `used` (BOOLEAN NOT NULL DEFAULT FALSE) - Required, defaults to FALSE
- `created_at` (BIGINT NOT NULL) - Required, auto-generated

**Evidence:**
- `migrations/024_email_verification_tokens.sql:4-11` - Schema definition
- `routes/api.js:153-155` - Token generation: `const verificationToken = uuidv4(); const expiresAt = Date.now() + (24 * 60 * 60 * 1000);`

### Password Reset Token Fields (`password_reset_tokens` table):
- `id` (SERIAL PRIMARY KEY) - Required
- `account_id` (INTEGER NOT NULL REFERENCES accounts(id)) - Required
- `token` (TEXT NOT NULL UNIQUE) - Required, UUID v4
- `expires_at` (BIGINT NOT NULL) - Required, 1 hour from creation
- `used` (BOOLEAN NOT NULL DEFAULT FALSE) - Required, defaults to FALSE
- `created_at` (BIGINT NOT NULL) - Required, auto-generated

**Evidence:**
- `migrations/024_email_verification_tokens.sql:17-24` - Schema definition
- `routes/api.js:200-201` - Token generation: `const resetToken = uuidv4(); const expiresAt = Date.now() + (60 * 60 * 1000);`

**Email Message Fields (NOT stored):**
- No `sender` field (emails are always from system)
- No `recipient` field (stored in `accounts.email` instead)
- No `subject` field (hardcoded in email templates)
- No `body` field (hardcoded HTML templates)
- No `read/unread` flags (emails are sent, not stored)
- No `timestamps` for email delivery (only token creation timestamps)

---

## 5. Email Delivery: Queued, Real-Time, or Batch

**Answer:** **Real-time, synchronous delivery** via SMTP. No queuing system exists.

**Evidence:**
- `utils/email.js:183-221` - `sendVerificationEmail()` uses `await transporter.sendMail(mailOptions)` (synchronous)
- `utils/email.js:316-344` - `sendPasswordResetEmail()` uses `await transporter.sendMail(mailOptions)` (synchronous)
- `routes/api.js:161-162` - Verification email sent immediately: `const emailResult = await emailService.sendVerificationEmail(account.email, verificationToken);`
- `routes/api.js:205-206` - Password reset email sent immediately: `const emailResult = await emailService.sendPasswordResetEmail(sanitizedEmail, resetToken);`

**NOT Found:**
- No email queue table
- No background job processor for emails
- No batch email sending
- No retry mechanism for failed deliveries
- No delayed sending

**Delivery Flow:**
1. API endpoint called
2. Token generated
3. Email sent immediately via SMTP
4. Response returned to client
5. If SMTP fails, error logged but operation may still succeed (for password reset, always returns success to prevent enumeration)

---

## 6. Email Read/Unread State Rules

**Answer:** **NOT APPLICABLE**. The email system does not store email messages, only tokens. There is no read/unread state.

**Evidence:**
- No email messages table exists
- No `read` or `unread` flags in any table
- Tokens have `used` flag, but this indicates token consumption, not email read state
- `migrations/024_email_verification_tokens.sql:9` - `used` field indicates token was used, not email was read

**Token State (NOT email state):**
- `used = FALSE` - Token is valid and unused
- `used = TRUE` - Token has been consumed (verification completed or password reset completed)
- `expires_at` - Token expiration timestamp (24 hours for verification, 1 hour for reset)

---

## 7. Player Interaction with Email System In-Game

**Answer:** **Players do NOT interact with the email system in-game**. Email interaction happens **outside the game** via web browser.

**Evidence:**
- `routes/api.js:109-133` - Email verification is HTTP GET endpoint (`/api/verify-email?token=...`)
- `routes/api.js:550-553` - Password reset page is HTTP route (`/reset-password`)
- `public/reset-password.html` - Standalone HTML page for password reset
- No WebSocket handlers for email operations
- No in-game commands for email (`handlers/game.js` has no email handlers)
- No email UI components in `public/js/components/`

**Interaction Points:**
1. **Registration** - User receives verification email, clicks link in external email client
2. **Password Reset** - User requests reset via web UI, receives email, clicks link
3. **Resend Verification** - User clicks button in character selection screen (web UI)

**NOT Found:**
- No `mail` command in-game
- No `inbox` command in-game
- No email widget in game UI
- No email notifications in-game

---

## 8. System-Generated Email Triggers

**Answer:** Emails are triggered by **exactly two events**:

1. **Account Registration** - Verification email sent automatically
2. **Password Reset Request** - Reset email sent when user requests it

**Evidence:**
- `routes/api.js:136-179` - Resend verification email endpoint (manual trigger)
- `routes/api.js:182-232` - Password reset request endpoint (manual trigger)
- Registration handler not shown in `routes/api.js`, but verification email is sent during registration (referenced in `docs/requirements.md:27-34`)

**Trigger Locations:**
- `routes/api.js:161-162` - Verification email sent in resend endpoint
- `routes/api.js:205-206` - Password reset email sent in request endpoint

**NOT Found:**
- No automatic emails on game events
- No scheduled emails
- No batch email triggers
- No email triggers from NPCs or systems
- No email triggers from AI (ZORK)

---

## 9. Limits: Mailbox Size, Rate Limits, Spam Rules

**Answer:** **NOT APPLICABLE** - No mailbox exists. However, there are **token limits and rate limits**.

### Token Limits:
- **Verification Tokens**: One active token per account (new token invalidates old ones implicitly, but multiple can exist if not expired)
- **Password Reset Tokens**: One active token per account (same as above)
- **Token Expiration**: 
  - Verification: 24 hours (`routes/api.js:155`)
  - Password Reset: 1 hour (`routes/api.js:201`)

**Evidence:**
- `migrations/024_email_verification_tokens.sql:8` - `expires_at BIGINT NOT NULL`
- `routes/api.js:155` - `const expiresAt = Date.now() + (24 * 60 * 60 * 1000);`
- `routes/api.js:201` - `const expiresAt = Date.now() + (60 * 60 * 1000);`

### Rate Limits (for API endpoints):
- **Login**: 10 attempts per 5 minutes per IP (`docs/requirements.md:78`)
- **Registration**: 5 attempts per 10 minutes per IP (`docs/requirements.md:79`)
- **Password Reset**: No explicit rate limit found in code (relies on email enumeration prevention)

**Evidence:**
- `docs/requirements.md:77-79` - Rate limiting documentation
- Rate limiting implementation not found in `routes/api.js` (may be in middleware)

### Spam Rules:
**NOT Found in Codebase:**
- No spam detection
- No email content filtering
- No sender reputation system
- No bounce handling
- No unsubscribe mechanism

**Email Enumeration Prevention:**
- `routes/api.js:197-222` - Password reset always returns success (doesn't reveal if email exists)
- `routes/api.js:214-216` - Logs non-existent emails but returns success

---

## 10. Integration with RAG/AI Layer

**Answer:** **No direct integration**. Email system is separate from RAG/AI system. However, email system documentation exists in RAG knowledge base.

**Evidence:**
- `docs/rag-test-results.md:10` - Email system documentation (`email.md`) found in RAG knowledge (ID: 203)
- `docs/rag-test-results.md:29-30` - Query "How does the game email system work?" successfully retrieves email knowledge
- `utils/email.js` - No RAG integration code
- `routes/api.js` - No RAG calls in email endpoints
- `scripts/zork-ai-agent.cjs` - ZORK does not send emails

**RAG Knowledge About Email:**
- Email system documented in `docs/email.md`
- Knowledge stored in `zork_knowledge` table with category `system_docs`
- ZORK can retrieve email knowledge via semantic search, but cannot send emails

**NOT Found:**
- No email sending from ZORK
- No email triggers from RAG system
- No email content generation via AI
- No email analysis via RAG

---

## 11. Who Can Send Emails

**Answer:** **Only the system/server can send emails**. No players, NPCs, systems, admins, or editors can send emails.

**Evidence:**
- `utils/email.js:113-247` - `sendVerificationEmail()` - Internal function only
- `utils/email.js:252-370` - `sendPasswordResetEmail()` - Internal function only
- `routes/api.js:161-162` - Only called from server-side API endpoints
- `routes/api.js:205-206` - Only called from server-side API endpoints
- No public API endpoint for sending arbitrary emails
- No god-mode command for sending emails
- No editor interface for sending emails

**Email Sender:**
- `utils/email.js:125` - `from: "The Game" <${process.env.SMTP_USER}>`
- `utils/email.js:263` - `from: "The Game" <${process.env.SMTP_USER}>`
- Always sent from `process.env.SMTP_USER` (configured as `brian@brianfloyd.me`)

**NOT Found:**
- No player-to-player email
- No admin email sending interface
- No NPC email sending
- No editor email sending
- No system alert emails

---

## 12. Email Indexing for Performance

**Answer:** **Email addresses and tokens are indexed**, but there are no email messages to index.

### Indexes Found:

**`accounts` table:**
- `idx_accounts_email` on `email` column (`migrations/022_accounts_system.sql:14`)

**`email_verification_tokens` table:**
- `idx_email_verification_tokens_token` on `token` column (`migrations/024_email_verification_tokens.sql:13`)
- `idx_email_verification_tokens_account_id` on `account_id` column (`migrations/024_email_verification_tokens.sql:14`)

**`password_reset_tokens` table:**
- `idx_password_reset_tokens_token` on `token` column (`migrations/024_email_verification_tokens.sql:26`)
- `idx_password_reset_tokens_account_id` on `account_id` column (`migrations/024_email_verification_tokens.sql:27`)

**Evidence:**
- All indexes defined in migration files
- `database.js:2418-2423` - `getAccountByEmail()` uses indexed `email` column
- `database.js:2552-2557` - `getEmailVerificationToken()` uses indexed `token` column
- `database.js:2596-2601` - `getPasswordResetToken()` uses indexed `token` column

**NOT Found:**
- No full-text search indexes (no email content to search)
- No composite indexes for email queries
- No email message indexing (no messages stored)

---

## 13. Error Handling for Failed Deliveries

**Answer:** **Basic error handling exists**, but **no retry mechanism or delivery tracking**.

### Error Handling Found:

**SMTP Connection Errors:**
- `utils/email.js:76-107` - `transporter.verify()` logs connection errors
- `utils/email.js:222-246` - `sendVerificationEmail()` catches and logs SMTP errors
- `utils/email.js:345-369` - `sendPasswordResetEmail()` catches and logs SMTP errors

**Error Response Handling:**
- `utils/email.js:118` - Returns `{ success: false, error: 'Email service not initialized...' }` if transporter not ready
- `utils/email.js:208` - Returns `{ success: false, error: 'Email was rejected by server' }` if recipient rejected
- `utils/email.js:245` - Returns `{ success: false, error: error.message }` on catch

**Email Enumeration Prevention:**
- `routes/api.js:197-222` - Password reset always returns success (even on error) to prevent email enumeration
- `routes/api.js:208-210` - Errors logged but success still returned

**Evidence:**
- `utils/email.js:199-209` - Checks `info.rejected` array for rejected recipients
- `utils/email.js:223-229` - Logs error details including `error.code`, `error.command`, `error.response`, `error.responseCode`
- `utils/email.js:232-243` - Specific guidance for `EAUTH` (authentication) errors

**NOT Found:**
- No retry mechanism for failed sends
- No delivery status tracking
- No bounce handling
- No dead letter queue
- No email delivery webhooks
- No delivery confirmation system

---

## 14. Permissions and Security Boundaries

**Answer:** **Email system has security boundaries**, but **no permission system** (only system can send emails).

### Security Boundaries Found:

**Email Format Validation:**
- `migrations/022_accounts_system.sql:11` - Database constraint: `CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')`
- `routes/api.js:189-193` - API-level validation: `emailRegex.test(sanitizedEmail)`

**Token Security:**
- `database.js:2552-2557` - Token validation: checks `used = FALSE` and `expires_at > $2` (current time)
- `database.js:2596-2601` - Same validation for password reset tokens
- Tokens are UUID v4 (cryptographically random)

**Email Enumeration Prevention:**
- `routes/api.js:197-222` - Password reset always returns success (doesn't reveal if email exists)
- `routes/api.js:214-216` - Logs non-existent emails but returns success

**Session-Based Access:**
- `routes/api.js:136-179` - Resend verification requires `req.session.accountId` (authenticated session)
- `routes/api.js:109-133` - Email verification endpoint is public (token-based, no session required)
- `routes/api.js:182-232` - Password reset request is public (no session required)

**Evidence:**
- `routes/api.js:137-139` - Resend verification checks: `if (!req.session.accountId) return 401`
- `routes/api.js:109-133` - Verification endpoint uses token query parameter (no session)
- `routes/api.js:251-254` - Password reset endpoint validates token (no session)

**NOT Found:**
- No permission system (only system sends emails)
- No role-based access control for email
- No email access logging
- No email audit trail
- No email encryption

---

## 15. Email Formatting Rules

**Answer:** **HTML emails with plain text fallback**. No markdown, color codes, or templates system.

### Formatting Found:

**HTML Templates:**
- `utils/email.js:135-170` - Verification email HTML template with inline CSS
- `utils/email.js:266-303` - Password reset email HTML template with inline CSS
- Both use retro game styling (green header `#00ff00`, black text)

**Plain Text Fallback:**
- `utils/email.js:171-180` - Verification email plain text version
- `utils/email.js:304-313` - Password reset email plain text version

**Email Headers:**
- `utils/email.js:130-134` - Custom headers: `X-Mailer`, `X-Priority`, `Importance`
- `utils/email.js:127` - `replyTo` header set to `SMTP_USER`

**Evidence:**
- `utils/email.js:124-181` - `mailOptions` object with `html` and `text` properties
- `utils/email.js:262-314` - Same structure for password reset

**NOT Found:**
- No markdown support
- No game markup system (`<text>`, `[text]`, `!text!`) in emails
- No template system (templates hardcoded in functions)
- No dynamic content generation
- No color code support beyond HTML/CSS
- No email template editor

---

## 16. Attachments Handling

**Answer:** **NOT SUPPORTED**. No attachment handling exists.

**Evidence:**
- `utils/email.js:124-181` - `mailOptions` object has no `attachments` property
- `utils/email.js:262-314` - Password reset `mailOptions` has no `attachments` property
- No file upload handling in email endpoints
- No attachment storage system

**NOT Found:**
- No attachment support in `sendVerificationEmail()`
- No attachment support in `sendPasswordResetEmail()`
- No file upload endpoints for email attachments
- No attachment storage in database

---

## 17. Email Threads or Conversations

**Answer:** **NOT SUPPORTED**. No threading or conversation system exists.

**Evidence:**
- No email messages table (only tokens)
- No `thread_id` or `conversation_id` fields
- No reply-to-thread functionality
- No email threading logic

**NOT Found:**
- No email threads
- No conversations
- No reply chains
- No email grouping

---

## 18. Archival/Cleanup Rules for Old Messages

**Answer:** **NOT APPLICABLE** - No email messages are stored. However, **token cleanup is implicit** via expiration.

### Token Cleanup:

**Expiration-Based Cleanup:**
- Verification tokens expire after 24 hours (`routes/api.js:155`)
- Password reset tokens expire after 1 hour (`routes/api.js:201`)
- Expired tokens are not returned by queries (`database.js:2554` - `expires_at > $2`)

**Token Usage Cleanup:**
- Tokens marked as `used = TRUE` when consumed (`database.js:2562-2567`, `database.js:2606-2611`)
- Used tokens are not returned by queries (`database.js:2554` - `used = FALSE`)

**Evidence:**
- `database.js:2552-2557` - `getEmailVerificationToken()` filters: `WHERE token = $1 AND used = FALSE AND expires_at > $2`
- `database.js:2596-2601` - `getPasswordResetToken()` filters: `WHERE token = $1 AND used = FALSE AND expires_at > $2`

**NOT Found:**
- No explicit cleanup job for expired tokens
- No archival system
- No email message retention policy
- No automatic deletion of old tokens

---

## 19. Extension Points for Future Email System Features

**Answer:** **Limited extension points exist**, but architecture is **not designed for extensibility**.

### Current Extension Points:

**Email Service Module:**
- `utils/email.js:379-384` - Exports: `initializeEmailService`, `sendVerificationEmail`, `sendPasswordResetEmail`, `isEmailServiceReady`
- New email functions could be added to this module

**SMTP Configuration:**
- `utils/email.js:17-21` - Environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`
- Could support multiple SMTP providers

**API Endpoints:**
- `routes/api.js` - New email endpoints could be added
- `routes/api.js:38-49` - Email status endpoint exists (`/api/email-status`)

**Database Schema:**
- `migrations/024_email_verification_tokens.sql` - Token tables could be extended
- No email messages table (would need new migration)

**Evidence:**
- `utils/email.js:56-73` - `nodemailer.createTransport()` configuration is flexible
- `routes/api.js:161` - Email service imported: `const emailService = require('../utils/email');`

**NOT Found:**
- No plugin system for email types
- No email template system
- No email queue system (would need new architecture)
- No email event hooks
- No email middleware system

**Architectural Limitations:**
- Email templates are hardcoded in functions
- No abstraction layer for email types
- No email routing system
- No email priority system

---

## 20. Enforcement Level: Guideline, Standard, or Canonical Law

**Answer:** **STANDARD** - The email system is implemented and functional, but it is **not canonical law** because:

1. **Limited Scope**: Only handles authentication emails, not a full email system
2. **No In-Game Integration**: Players cannot interact with email in-game
3. **Hardcoded Templates**: Email content is hardcoded, not configurable
4. **No Extensibility**: Architecture does not support adding new email types easily
5. **Missing Features**: No queuing, retry, delivery tracking, or attachment support

**Evidence:**
- `utils/email.js` - Implementation exists and works
- `routes/api.js` - API endpoints functional
- `migrations/024_email_verification_tokens.sql` - Database schema implemented
- `docs/email.md` - Documentation exists

**What Would Make It Canonical Law:**
- In-game email/mail system
- Extensible email type system
- Template system for email content
- Email queue and retry mechanism
- Delivery tracking
- Player-to-player email
- System alert emails

**Current Status:**
- **Standard** - Works for its intended purpose (authentication), but not a comprehensive email system

---

## Summary

### Strengths
1. ✅ Functional authentication email system
2. ✅ Secure token-based verification
3. ✅ Email enumeration prevention
4. ✅ HTML and plain text email support
5. ✅ Proper database indexes for performance

### Weaknesses
1. ❌ No in-game email/mail system
2. ❌ Hardcoded email templates (not configurable)
3. ❌ No retry mechanism for failed deliveries
4. ❌ No delivery tracking
5. ❌ No attachment support
6. ❌ No extensibility for new email types
7. ❌ No email queue system

### Risks
1. ⚠️ SMTP failures cause silent errors (password reset always returns success)
2. ⚠️ No retry mechanism means failed emails are lost
3. ⚠️ Hardcoded templates make localization difficult
4. ⚠️ No email delivery confirmation
5. ⚠️ Token cleanup relies on expiration queries (no explicit cleanup job)

### Known Gaps
1. ❌ No in-game player mail system
2. ❌ No system alert emails
3. ❌ No email notifications for game events
4. ❌ No email queue/retry system
5. ❌ No email template system
6. ❌ No attachment support
7. ❌ No email archival/cleanup job

---

## File References

### Core Implementation
- `utils/email.js` - Email service module (lines 1-386)
- `routes/api.js` - Email API endpoints (lines 38-272)
- `server.js` - Email service initialization (lines 17-19)

### Database Schema
- `migrations/022_accounts_system.sql` - Accounts table with email field (lines 1-61)
- `migrations/024_email_verification_tokens.sql` - Token tables (lines 1-62)

### Database Functions
- `database.js:2418-2423` - `getAccountByEmail()`
- `database.js:2542-2547` - `createEmailVerificationToken()`
- `database.js:2552-2557` - `getEmailVerificationToken()`
- `database.js:2562-2567` - `markEmailVerificationTokenUsed()`
- `database.js:2572-2577` - `verifyAccountEmail()`
- `database.js:2586-2591` - `createPasswordResetToken()`
- `database.js:2596-2601` - `getPasswordResetToken()`
- `database.js:2606-2611` - `markPasswordResetTokenUsed()`

### Documentation
- `docs/email.md` - Email system guide
- `docs/requirements.md:1-100` - Authentication system overview
- `docs/rag-test-results.md:10` - Email knowledge in RAG system

---

**End of Canonical Spec**


