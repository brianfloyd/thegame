# Email System Guide

Complete guide to the email system for The Game, using GoDaddy SMTP (brian@brianfloyd.me).

## What's Implemented

### Email Service (`utils/email.js`)
- GoDaddy SMTP configuration
- HTML email templates with retro game styling
- Verification and password reset emails

### Database Tables
| Table | Purpose |
|-------|---------|
| `email_verification_tokens` | 24-hour expiration tokens for account verification |
| `password_reset_tokens` | 1-hour expiration tokens for password reset |

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/verify-email?token=...` | GET | Verify email address |
| `/api/request-password-reset` | POST | Request password reset email |
| `/api/reset-password` | POST | Reset password with token |
| `/reset-password?token=...` | GET | Password reset page |

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# GoDaddy SMTP Configuration (Recommended)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=your_password_here

# Base URL for email links
BASE_URL=http://localhost:3434
# For production: BASE_URL=https://yourdomain.com
```

### Key Configuration Notes

| Variable | Purpose |
|----------|---------|
| `SMTP_USER` | Full email address - used for "from" address |
| `SMTP_USERNAME` | Just username (brian) - used for authentication |
| `SMTP_PORT` | Use `587` (recommended) or `465` |
| `SMTP_SECURE` | Use `false` for port 587, `true` for port 465 |

### Why Port 587?

GoDaddy SMTP works more reliably with:
- **Port 587** + `SMTP_SECURE=false` (uses STARTTLS) - **Recommended**
- Port 465 + `SMTP_SECURE=true` (uses SSL) - Can be problematic

## Email Flows

### Registration Flow
1. User registers account
2. System generates verification token (24-hour expiration)
3. Verification email sent immediately
4. User clicks link to verify
5. `email_verified` flag set to `true`

### Password Reset Flow
1. User requests reset via "Forgot Password"
2. System generates reset token (1-hour expiration)
3. Reset email sent (doesn't reveal if email exists)
4. User clicks link, enters new password
5. Password updated, token invalidated

## Testing

### Test Email Script
```bash
# Full diagnostic test
node scripts/test-email-diagnostic.js

# Simple test to specific email
node scripts/test-email-simple.js brian@brianfloyd.me

# Standard test
node scripts/test-email.js brian@brianfloyd.me
```

### Verify Service Started
After starting server, look for:
```
Email service: Configuring SMTP for brian@brianfloyd.me on smtpout.secureserver.net:587
Email service: Using auth user: brian
Email service ready to send messages
```

## Troubleshooting

### Error: "535 Authentication Failed"

**Common Causes & Fixes:**

1. **Wrong port/secure combination**
   ```env
   SMTP_PORT=587
   SMTP_SECURE=false
   ```

2. **Missing SMTP_USERNAME**
   ```env
   SMTP_USERNAME=brian
   ```

3. **Wrong SMTP_USER format**
   ```env
   SMTP_USER=brian@brianfloyd.me  # Full email, not just "brian"
   ```

### Error: "Connection Timeout"

**Fixes:**
- Try port 587 instead of 465
- Check firewall settings (ports 587/465)
- Try alternative server: `smtp.secureserver.net`

### Emails Accepted But Not Delivered

This happens when GoDaddy accepts the email but it never arrives.

**Diagnostic Steps:**
1. **Check GoDaddy Sent Items**
   - Log into GoDaddy webmail: https://email.secureserver.net
   - Check Sent Items folder
   - If emails ARE there, issue is with recipient
   - If emails NOT there, GoDaddy is dropping them

2. **Check Spam Folder**
   - Gmail especially aggressive with spam filtering
   - New domains often flagged initially

3. **Test Different Recipient**
   - Try Outlook, Yahoo, or your GoDaddy email
   - If other providers work but Gmail doesn't, it's Gmail filtering

4. **Wait and Retry**
   - GoDaddy may queue emails for 5-15 minutes
   - Rate limiting may cause delays

5. **Contact GoDaddy Support**
   - Ask about sending limits/restrictions
   - Verify account is configured for external sending

### GoDaddy Rate Limiting

**Symptoms:**
- Server accepts email
- But delivery is delayed or doesn't happen
- No bounce messages

**Solution:**
- Wait 1-2 hours between bulk test emails
- Check GoDaddy account for rate limit warnings

## Alternative SMTP Servers

If `smtpout.secureserver.net` doesn't work:

```env
# Option A
SMTP_HOST=smtp.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false

# Option B
SMTP_HOST=relay-hosting.secureserver.net
SMTP_PORT=25
SMTP_SECURE=false
```

## Alternative Email Services

If GoDaddy continues to be unreliable:

| Service | Free Tier | Notes |
|---------|-----------|-------|
| **SendGrid** | 100 emails/day | Best deliverability, easy setup |
| **Mailgun** | 5,000 emails/month | Good for transactional emails |
| **AWS SES** | $0.10/1,000 emails | Cheapest for high volume |

## Security Features

- **Single-use tokens**: Tokens are invalidated after use
- **Expiration**: Verification (24h), Reset (1h)
- **Email enumeration prevention**: Password reset doesn't reveal if email exists
- **HttpOnly cookies**: Session cookies not accessible via JavaScript
- **TLS encryption**: STARTTLS on port 587

## Files Reference

| File | Purpose |
|------|---------|
| `utils/email.js` | Email service module |
| `migrations/024_email_verification_tokens.sql` | Database migration |
| `database.js` | Token management functions |
| `middleware/auth.js` | Registration email trigger |
| `routes/api.js` | Verification and reset routes |
| `public/reset-password.html` | Password reset page |

## Railway Production

Ensure these variables are set in Railway:
```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=<your_password>
BASE_URL=https://<your-app>.railway.app
```


