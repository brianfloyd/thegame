# 250 — Canonical Email System Specification
_Authoritative spec for Cursor and all future AI work involving email functionality._

This document is the **final, enforceable, canonical law** governing the email subsystem. It replaces all previous notes, analyses, and drafts. Cursor must follow this spec exactly when touching any email-related logic, database helpers, endpoints, or templates.

Reference analysis: fileciteturn9file0

---

# 1. Purpose of the Email System (Canonical)

The email subsystem exists **ONLY** to support:
1. **Account verification**
2. **Password reset**

It is **not** an in-game messaging system.
It is **not** a notification system.
It is **not** extensible without modifying this spec.

---

# 2. Email System Architecture

The system consists of four major components:

### 2.1 SMTP Transport Layer
- Implemented via `nodemailer`.
- Uses environment variables:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`
- Initialized at server startup.
- Exposed status via `/api/email-status`.

### 2.2 Token-Based Authentication Layer
- Email verification tokens
- Password reset tokens
- Stored in dedicated tables
- UUID v4 values
- Expire automatically
- Never reused

### 2.3 API Layer
Endpoints:
- `/api/verify-email` (GET)
- `/api/resend-verification-email` (POST)
- `/api/request-password-reset` (POST)
- `/api/reset-password` (POST)

### 2.4 Template Layer
- Hardcoded HTML + plaintext templates
- No templating engine
- No Markdown
- Styled retro game aesthetic

---

# 3. Canonical Supported Email Types (Exhaustive)

The system may send **exactly two** kinds of emails:
1. **Verification Email**
2. **Password Reset Email**

Cursor may **NOT** add new email types unless this spec is updated.

---

# 4. Email Storage Rules

Emails **are NOT stored**.
The system stores:
- User email addresses (`accounts.email`)
- Verification tokens
- Password reset tokens

### 4.1 Accounts Table (Authoritative Fields)
```
accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT
)
```

### 4.2 Verification Token Table
```
email_verification_tokens (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  token TEXT UNIQUE NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
)
```

### 4.3 Password Reset Token Table
```
password_reset_tokens (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  token TEXT UNIQUE NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
)
```

**Tokens are the ONLY persistent email-related data.**

---

# 5. Email Sending Rules

### 5.1 Delivery Model
- **Real-time, synchronous SMTP**
- No queueing
- No batching
- No retry system
- No delivery confirmation

### 5.2 Failures
- SMTP errors are logged
- Verification email errors bubble to client
- Password reset errors are hidden (enumeration prevention)

### 5.3 Authentication
- From address always:
```
"The Game" <SMTP_USER>
```

Cursor must not modify this without spec updates.

---

# 6. Email Content Rules

### 6.1 Templates Must:
- Be HTML with inline CSS
- Include plaintext fallback
- Never use Markdown
- Use retro-game color palette (`#00ff00`, black backgrounds)
- Contain clickable links containing token parameters

### 6.2 Template Inputs (Strict)
Verification emails must interpolate:
- username
- verification token

Password reset emails must interpolate:
- email address
- reset token

Cursor must not add additional dynamic content.

---

# 7. Security Rules

### 7.1 Validation
- Email addresses validated server-side AND DB-side
- Tokens must:
  - Exist
  - Be unused
  - Be unexpired
  - Match account

### 7.2 Anti-Enumeration
Password reset endpoint must:
- Always return success
- Log nonexistent emails
- Never reveal whether an email exists

### 7.3 Token Expiration
- Verification tokens expire in **24 hours**
- Reset tokens expire in **1 hour**

### 7.4 Token Consumption
Upon use:
- Mark token `used = TRUE`
- Never reuse token

### 7.5 Forbidden Behavior
The email system must NOT:
- Send game alerts
- Notify players of in-game events
- Allow admins or players to send arbitrary emails
- Allow attachments
- Allow AI-generated email content unless explicitly added to this spec

---

# 8. Player Interaction Rules

Players interact with email **outside the game**, through:
- Browser-based verification link
- Browser-based password reset form

There are **NO** in-game commands or UIs for email.

---

# 9. Indexing Rules

Indexes REQUIRED:
- `accounts(email)`
- `email_verification_tokens(token)`
- `email_verification_tokens(account_id)`
- `password_reset_tokens(token)`
- `password_reset_tokens(account_id)`

Cursor may not add new email indexes without updating this spec.

---

# 10. Error Handling (Canonical)
All email functions must:
- Wrap SMTP calls in try/catch
- Return:
```
{ success: true }
```
OR
```
{ success: false, error: <string> }
```

Error object must never include SMTP passwords, usernames, or sensitive config.

Password reset errors must ALWAYS return `{ success: true }` to caller.

---

# 11. Extensibility Rules

You MAY extend the email system ONLY if:
1. The new feature is added to this spec
2. Migration files are created when needed
3. Templates are defined here first
4. Security constraints remain intact

Otherwise, no new email features are allowed.

---

# 12. TL;DR (Enforceable by Cursor)

- The email system handles **ONLY verification + password resets**.
- Templates are **hardcoded**, **HTML + plaintext**, **retro-styled**.
- Tokens are stored; emails are not.
- Delivery is synchronous SMTP.
- Errors are logged and safely returned.
- No in-game email exists.
- No new email types may be added unless this spec updates.

**If any code conflicts with this document, THIS DOCUMENT WINS.**