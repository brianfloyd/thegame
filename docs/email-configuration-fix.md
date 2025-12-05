# Email Configuration Fix

## Current Issue

Email authentication is failing with:
```
Invalid login: 535 Authentication Failed for brian
Error code: EAUTH
```

## Problem

The configuration shows:
- Port: 465 (should be 587)
- Secure: true (should be false)
- Auth User: brian (correct)
- SMTP_USER: appears to be just "brian" instead of "brian@brianfloyd.me"

## Solution

### Update Your .env File

Make sure your `.env` file has these settings:

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=Hh37683768!
```

**Key Points:**
- `SMTP_USER` = Full email address (`brian@brianfloyd.me`) - used for "from" address
- `SMTP_USERNAME` = Just username (`brian`) - used for authentication
- `SMTP_PORT` = `587` (not 465)
- `SMTP_SECURE` = `false` (not true)

### Why Port 587?

GoDaddy SMTP works better with:
- Port 587 with `SMTP_SECURE=false` (uses STARTTLS)
- Port 465 with `SMTP_SECURE=true` (uses SSL) - can be problematic

Port 587 is more reliable for GoDaddy.

### Code Update

The email service has been updated to:
1. Auto-detect if `SMTP_USER` is just a username (no @)
2. Automatically construct full email if needed
3. Extract username from email for authentication if `SMTP_USERNAME` not set

## Verification

After updating `.env`, restart your server:

```bash
npm run dev:both
```

You should see:
```
Email service: Configuring SMTP for brian@brianfloyd.me on smtpout.secureserver.net:587
Email service: Using auth user: brian
Email service ready to send messages
```

## If Still Failing

1. **Verify password**: Make sure `SMTP_PASSWORD` is correct
2. **Check GoDaddy settings**: 
   - Log into GoDaddy email account
   - Verify SMTP is enabled
   - Check if "Less Secure Apps" needs to be enabled
3. **Try test script**:
   ```bash
   npm run test-email-simple
   ```
4. **Check GoDaddy email account**: Make sure the account isn't locked

## Railway Production

For Railway production, make sure these variables are set:
- `SMTP_HOST=smtpout.secureserver.net`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=brian@brianfloyd.me`
- `SMTP_USERNAME=brian`
- `SMTP_PASSWORD=<your_password>`

















