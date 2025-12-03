# Recommended .env Settings

Based on your email setup and configuration, here are the recommended settings for your `.env` file.

## Recommended SMTP Settings for GoDaddy (Lines 5-9 area)

For **GoDaddy email** (brian@brianfloyd.me), the recommended configuration is:

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=your_actual_password
```

### Why These Settings?

1. **SMTP_PORT=587** - This is the standard TLS port that works reliably with GoDaddy
2. **SMTP_SECURE=false** - Port 587 uses STARTTLS (upgrades to secure), so secure should be false
3. **SMTP_USERNAME=brian** - GoDaddy authentication uses just the username part (before @)
4. **SMTP_USER=brian@brianfloyd.me** - This is used for the "from" address in emails

### Alternative Configuration (if 587 doesn't work)

If port 587 causes issues, try port 465 with SSL:

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=your_actual_password
```

## Complete Recommended .env Template

```env
# Database
DATABASE_URL=sqlite:./game.db
# For production: DATABASE_URL=postgresql://user:pass@host:port/db

# Server
PORT=3434
BASE_URL=http://localhost:3434

# Session Security (generate random hex string)
SESSION_SECRET=your_random_hex_string_here

# Email Configuration (GoDaddy)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=brian@brianfloyd.me
SMTP_USERNAME=brian
SMTP_PASSWORD=your_godaddy_password

# Environment
NODE_ENV=development
```

## Important Notes

1. **SMTP_SECURE setting**:
   - Port 587 → `SMTP_SECURE=false` (uses STARTTLS)
   - Port 465 → `SMTP_SECURE=true` (uses SSL)

2. **Authentication**:
   - `SMTP_USERNAME` should be just "brian" (username part)
   - `SMTP_USER` should be full email "brian@brianfloyd.me" (for "from" address)
   - The code will use `SMTP_USERNAME` for auth if provided, otherwise extracts from `SMTP_USER`

3. **Generate SESSION_SECRET**:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Testing Your Configuration

After updating your `.env` file, test the email service:

1. Restart your server
2. Look for: `"Email service ready to send messages"` in console
3. If you see errors, check:
   - Password is correct
   - Port matches security setting
   - GoDaddy account allows SMTP access











