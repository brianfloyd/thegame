# Quick Email Setup & Testing Guide

## Step 1: Check Your .env File

Make sure your `.env` file has these settings:

```env
# GoDaddy Email Configuration
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=your_actual_password_here

# Base URL for email links
BASE_URL=http://localhost:3434
# For production: BASE_URL=https://yourdomain.com
```

## Step 2: Install Dependencies

Make sure nodemailer is installed:

```powershell
npm install
```

## Step 3: Run Diagnostic Test

The diagnostic script will:
- ✅ Check your configuration
- ✅ Test multiple connection methods
- ✅ Find the working configuration
- ✅ Send a test email

Run it:

```powershell
node scripts/test-email-diagnostic.js
```

Or test to a specific email:

```powershell
node scripts/test-email-diagnostic.js brian@brianfloyd.me
```

## Step 4: What to Look For

### Success Output:
```
✅ Connection Successful!
✅ Email sent successfully!
   Accepted recipients: brian@brianfloyd.me

📝 Recommended .env settings:
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
...
```

### Failure Output:
```
❌ Connection Failed
   Error: 535 Authentication Failed
```

## Step 5: Common Issues & Fixes

### Issue: "535 Authentication Failed"

**Fix 1:** Add `SMTP_USERNAME` to your `.env`:
```env
SMTP_USERNAME=brian
```

**Fix 2:** Make sure password is correct (no extra spaces)

**Fix 3:** Try port 465 with SSL:
```env
SMTP_PORT=465
SMTP_SECURE=true
```

### Issue: "Connection Timeout"

**Fix 1:** Check firewall settings (ports 587 or 465)

**Fix 2:** Try alternative server:
```env
SMTP_HOST=smtp.secureserver.net
```

### Issue: "Email sent but not received"

**Check:**
1. Spam/junk folder
2. Wait 5-15 minutes (GoDaddy may queue emails)
3. Check GoDaddy webmail Sent Items folder

## Step 6: Verify Email Service on Server

After fixing configuration, restart your server and look for:

```
Email service: Configuring SMTP for brian@brianfloyd.me on smtpout.secureserver.net:587
Email service: Using auth user: brian
Email service ready to send messages
```

If you see errors, the diagnostic script will help identify the issue.

## Quick Test Commands

```powershell
# Full diagnostic test
node scripts/test-email-diagnostic.js

# Simple test
node scripts/test-email-simple.js brian@brianfloyd.me

# Standard test
node scripts/test-email.js brian@brianfloyd.me
```

## Recommended Settings (Working Configuration)

Based on previous successful setup:

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=your_password
BASE_URL=http://localhost:3434
```

## Still Not Working?

1. **Check GoDaddy Settings:**
   - Log into GoDaddy Email & Office Dashboard
   - Go to Settings → Email Client Settings
   - Verify SMTP is enabled
   - Note the exact SMTP settings shown

2. **Test Password:**
   - Log into GoDaddy webmail
   - If webmail works but SMTP doesn't, it's a configuration issue

3. **Contact GoDaddy Support:**
   - Ask them to verify SMTP settings for brian@brianfloyd.me
   - Request SMTP server details if different from standard

4. **Use Diagnostic Script:**
   - Run: `node scripts/test-email-diagnostic.js`
   - It will try multiple configurations automatically
   - Follow its recommendations

