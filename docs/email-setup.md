# Email Setup Guide - GoDaddy Email Configuration

This guide explains how to configure email sending for The Game using your GoDaddy email account (brian@brianfloyd.me).

## GoDaddy SMTP Settings

GoDaddy uses standard SMTP settings for outgoing mail. Here are the configuration details:

### SMTP Configuration

- **SMTP Host**: `smtpout.secureserver.net` (or `smtp.secureserver.net`)
- **Port**: `465` (SSL) or `587` (TLS)
- **Security**: SSL/TLS required
- **Authentication**: Required (your full email and password)

### Environment Variables

Add these to your `.env` file:

```env
# GoDaddy Email Configuration
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=brian@brianfloyd.me
SMTP_PASSWORD=your_godaddy_email_password

# Base URL for email links (change for production)
BASE_URL=http://localhost:3434
# For production: BASE_URL=https://yourdomain.com
```

### Alternative Ports

If port 465 doesn't work, try:
- Port `587` with `SMTP_SECURE=false` (uses STARTTLS)
- Port `80` (unsecured, not recommended)

### Testing Email Configuration

1. Start your server: `npm run dev`
2. Check console for: "Email service ready to send messages"
3. If you see an error, verify:
   - Email and password are correct
   - Port matches security setting (465 = secure: true, 587 = secure: false)
   - Firewall isn't blocking SMTP ports

### Troubleshooting

**Error: "Invalid login"**
- Verify your email and password are correct
- Make sure you're using the full email address (brian@brianfloyd.me)
- Check if GoDaddy requires app-specific passwords

**Error: "Connection timeout"**
- Try port 587 instead of 465
- Check if your network/firewall blocks SMTP ports
- Verify GoDaddy SMTP server is accessible

**Error: "Certificate verification failed"**
- The code includes `rejectUnauthorized: false` for GoDaddy compatibility
- If issues persist, contact GoDaddy support

### Email Features Implemented

1. **Account Verification**
   - Sent automatically on registration
   - 24-hour expiration
   - Link: `/api/verify-email?token=...`

2. **Password Reset**
   - Request via: `POST /api/request-password-reset`
   - Reset page: `/reset-password?token=...`
   - 1-hour expiration

### Security Notes

- Tokens are single-use and expire automatically
- Password reset requests don't reveal if email exists (prevents enumeration)
- All tokens are stored securely in the database
- Used tokens cannot be reused

