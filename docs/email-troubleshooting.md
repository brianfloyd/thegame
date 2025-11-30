# Email Troubleshooting Guide

## Understanding the Email Flow

When a user registers, the system:
1. **FROM**: `brian@brianfloyd.me` (your GoDaddy email - configured in `.env`)
2. **TO**: The email address the user registered with (e.g., `behrtrainer@gmail.com`)

**Important**: You (brian@brianfloyd.me) will NOT receive verification emails unless you register an account with that email address. The emails go TO the person who registered.

## Current Status

Based on your terminal output:
```
✅ Email accepted by server for: [ 'behrtrainer@gmail.com' ]
```

This means:
- ✅ GoDaddy SMTP server accepted the email
- ✅ Email was queued for delivery to `behrtrainer@gmail.com`
- ⚠️ But the recipient may not have received it

## Troubleshooting Steps

### Step 1: Test Email Sending Directly

Run the test email script:

```bash
npm run test-email behrtrainer@gmail.com
```

Or test to your own email:
```bash
npm run test-email brian@brianfloyd.me
```

This will:
- Test SMTP connection
- Send a test email
- Show detailed logging

### Step 2: Check Common Issues

#### A. Spam/Junk Folder
- Check spam/junk folder in Gmail (behrtrainer@gmail.com)
- Check spam folder in GoDaddy webmail (brian@brianfloyd.me)
- Emails from new domains often go to spam initially

#### B. GoDaddy Email Delivery Delays
- GoDaddy may queue emails for 5-15 minutes
- Check if email arrives after waiting
- GoDaddy has rate limits (too many emails = delays)

#### C. GoDaddy Email Account Settings
1. Log into GoDaddy Email (webmail)
2. Check **Settings** → **Email Client Settings**
3. Verify SMTP is enabled
4. Check if there are any delivery restrictions

#### D. Email Address Verification
- Verify `behrtrainer@gmail.com` is a valid, active email
- Try registering with `brian@brianfloyd.me` to test if you receive it

### Step 3: Check GoDaddy Email Logs

1. Log into your GoDaddy account
2. Go to **Email & Office Dashboard**
3. Click on **brian@brianfloyd.me**
4. Look for **Email Logs** or **Sent Items**
5. Check if emails show as "sent" or "failed"

### Step 4: Test with Different Recipient

Try registering a new account with a different email provider:
- Gmail (behrtrainer@gmail.com) - already tested
- Outlook/Hotmail
- Yahoo
- Your own GoDaddy email (brian@brianfloyd.me)

This helps determine if it's:
- A GoDaddy issue (all emails fail)
- A recipient-specific issue (one email provider blocks it)
- A spam filter issue (some providers filter more aggressively)

### Step 5: Check Enhanced Logging

With the updated code, you'll now see:
```
=== Sending Verification Email ===
From: "The Game" <brian@brianfloyd.me>
To: behrtrainer@gmail.com
Subject: Verify Your Account - The Game
Verification URL: http://localhost:3434/api/verify-email?token=...

=== Email Send Result ===
Message ID: <...>
Response: 250 PYZNvF0jIQ9qM mail accepted for delivery
Accepted recipients: [ 'behrtrainer@gmail.com' ]
Rejected recipients: []
```

This shows exactly what's being sent and the server's response.

### Step 6: Verify Email Content

The verification email contains:
- A clickable button/link
- The verification URL: `http://localhost:3434/api/verify-email?token=...`

**Important**: If you're testing locally, the URL points to `localhost:3434`. This won't work if:
- The user is on a different computer
- You're testing from a production server

For production, make sure `BASE_URL` in `.env` is set correctly:
```env
BASE_URL=http://localhost:3434  # For local testing
# OR
BASE_URL=https://yourdomain.com  # For production
```

## Common GoDaddy Email Issues

### Issue 1: Emails Accepted But Not Delivered
**Symptom**: Server says "accepted" but recipient never gets email
**Causes**:
- GoDaddy rate limiting
- Recipient's spam filter
- GoDaddy blacklist (if sending too many emails)

**Solution**:
- Wait 15-30 minutes
- Check spam folder
- Contact GoDaddy support if persistent

### Issue 2: Authentication Errors
**Symptom**: `535 Authentication Failed`
**Solution**: See `docs/godaddy-smtp-troubleshooting.md`

### Issue 3: Connection Timeouts
**Symptom**: Connection timeout errors
**Solution**:
- Try port 587 instead of 465
- Check firewall settings
- Verify SMTP server address

## Testing Checklist

- [ ] Run `npm run test-email <your-email>` - does it work?
- [ ] Check spam folder for test email
- [ ] Register account with `brian@brianfloyd.me` - do you receive verification?
- [ ] Check GoDaddy email logs/sent items
- [ ] Try different recipient email providers
- [ ] Verify `BASE_URL` in `.env` is correct
- [ ] Check terminal logs for detailed email info

## Next Steps

1. **Run the test script**: `npm run test-email brian@brianfloyd.me`
2. **Check your GoDaddy inbox** (and spam) for the test email
3. **If test email works**: The issue is with recipient email or spam filters
4. **If test email fails**: The issue is with GoDaddy SMTP configuration

## Alternative Solutions

If GoDaddy email continues to be unreliable:

1. **Use SendGrid** (recommended for production)
   - Free tier: 100 emails/day
   - Better deliverability
   - Detailed analytics

2. **Use Mailgun**
   - Free tier: 5,000 emails/month
   - Good for transactional emails

3. **Use AWS SES**
   - Very cheap ($0.10 per 1,000 emails)
   - Requires AWS account setup

See `docs/email-setup.md` for configuration details.

