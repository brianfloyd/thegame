# GoDaddy SMTP Troubleshooting Guide

## Error: "535 Authentication Failed"

This error means GoDaddy rejected your login credentials. Here are the solutions:

### Solution 1: Use Username Only (Most Common Fix)

GoDaddy sometimes requires just the username part (before @) instead of the full email.

**Update your `.env` file:**

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian  # Add this line - just the username part
SMTP_PASSWORD=your_password
```

The code will try `SMTP_USERNAME` first, then fall back to `SMTP_USER`.

### Solution 2: Try Port 587 with STARTTLS

Port 465 (SSL) sometimes has issues. Try port 587 (TLS/STARTTLS):

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_PASSWORD=your_password
```

### Solution 3: Enable SMTP in GoDaddy Account

1. Log into your GoDaddy account
2. Go to **Email & Office Dashboard**
3. Click on your email account (brian@brianfloyd.me)
4. Go to **Settings** → **Email Client Settings**
5. Make sure **SMTP** is enabled
6. Note the SMTP server settings shown there

### Solution 4: Check Password Special Characters

If your password has special characters, try:
- URL encoding them in the `.env` file
- Or change your GoDaddy email password to one without special characters for testing

### Solution 5: Alternative GoDaddy SMTP Servers

Try these alternative servers:

**Option A: smtp.secureserver.net**
```env
SMTP_HOST=smtp.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
```

**Option B: relay-hosting.secureserver.net**
```env
SMTP_HOST=relay-hosting.secureserver.net
SMTP_PORT=25
SMTP_SECURE=false
```

### Solution 6: Check GoDaddy Email Account Status

1. Log into GoDaddy Email (webmail)
2. Make sure the account is active and not suspended
3. Try logging into webmail to verify password works

### Solution 7: Use App Password (if available)

Some GoDaddy accounts support app-specific passwords:
1. Go to GoDaddy account security settings
2. Generate an app password for "Mail"
3. Use that password instead of your regular password

## Testing Your Configuration

After updating `.env`, restart your server and check the console:

**Success:**
```
Email service: Configuring SMTP for brian@brianfloyd.me on smtpout.secureserver.net:587
Email service: Using auth user: brian
Email service ready to send messages
```

**Failure:**
```
Email service configuration error: [error message]
```

## Common GoDaddy SMTP Settings

| Setting | Value |
|---------|-------|
| **Host** | `smtpout.secureserver.net` or `smtp.secureserver.net` |
| **Port** | `587` (TLS) or `465` (SSL) |
| **Security** | `false` for 587, `true` for 465 |
| **Username** | `brian` (just username) or `brian@brianfloyd.me` (full email) |
| **Password** | Your GoDaddy email password |

## Quick Test Configuration

Try this minimal configuration first:

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=brian
SMTP_PASSWORD=your_password
BASE_URL=http://localhost:3434
```

If this works, you can add back `SMTP_USER` for the "from" address.

## Still Not Working?

1. **Contact GoDaddy Support** - They can verify your SMTP settings
2. **Check Email Account Type** - Some GoDaddy email plans have different SMTP settings
3. **Try Webmail** - If webmail works but SMTP doesn't, it's a configuration issue
4. **Check Firewall** - Make sure ports 587/465 aren't blocked

## Alternative: Use SendGrid or Mailgun

If GoDaddy SMTP continues to be problematic, consider using a dedicated email service:
- **SendGrid** - Free tier: 100 emails/day
- **Mailgun** - Free tier: 5,000 emails/month
- Both have better deliverability and easier setup









