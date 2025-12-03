# Email Configuration Quick Fix

## The Problem

Your email service is failing with:
```
Invalid login: 535 Authentication Failed for brian
Port: 465, Secure: true
```

## The Fix

Update your `.env` file with these settings:

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=Hh37683768!
```

## What Changed

1. **Port**: Changed from `465` to `587`
2. **Secure**: Changed from `true` to `false`
3. **SMTP_USER**: Should be full email `brian@brianfloyd.me` (not just `brian`)
4. **SMTP_USERNAME**: Should be just `brian` (for authentication)

## Why Port 587?

GoDaddy SMTP works better with:
- Port 587 + `SMTP_SECURE=false` (uses STARTTLS) ✅ Recommended
- Port 465 + `SMTP_SECURE=true` (uses SSL) ⚠️ Can be problematic

## After Updating

1. **Save your `.env` file**
2. **Restart your server**: `npm run dev:both`
3. **Look for**: `Email service ready to send messages` ✅

## Code Update

The email service now automatically:
- Detects if `SMTP_USER` is just a username (no @)
- Constructs full email if needed
- Extracts username for authentication

But you should still set `SMTP_USER=brian@brianfloyd.me` in your `.env` file.










