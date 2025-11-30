# SSL Certificate Troubleshooting for Railway Custom Domain

## Issue: "Not Secure" Warning on Custom Domain

If you see a "Not secure" warning on `thegame.brianfloyd.me`, this is typically because Railway's SSL certificate hasn't been provisioned yet.

## How Railway SSL Works

Railway automatically provisions SSL certificates using Let's Encrypt when:
1. ✅ DNS CNAME record is correctly configured
2. ✅ DNS has propagated (visible globally)
3. ✅ Railway detects the domain is pointing to their service
4. ⏳ Let's Encrypt validates the domain (can take 5 minutes to 24 hours)

## Steps to Resolve

### 1. Verify DNS Propagation

Check if your DNS record is visible globally:

**Using Command Line:**
```bash
# Windows PowerShell
nslookup thegame.brianfloyd.me

# Should show: t18yqfrw.up.railway.app
```

**Using Online Tools:**
- Visit: https://www.whatsmydns.net/#CNAME/thegame.brianfloyd.me
- Check: https://dnschecker.org/#CNAME/thegame.brianfloyd.me

**What to Look For:**
- The CNAME should resolve to `t18yqfrw.up.railway.app` globally
- If it shows different results in different locations, DNS is still propagating

### 2. Verify DNS Record is Correct

In your DNS provider (GoDaddy, etc.), verify:
- **Type**: CNAME (not A record)
- **Name**: `thegame` (or `thegame.brianfloyd.me` depending on provider)
- **Value**: `t18yqfrw.up.railway.app` (exact match, no trailing dot)

### 3. Check Railway Dashboard

1. Go to Railway Dashboard: https://railway.com
2. Navigate to your project → "final production" service
3. Go to **Settings** → **Domains**
4. Check the status of `thegame.brianfloyd.me`:
   - **Active** = Certificate is provisioned ✅
   - **Provisioning** = Certificate is being issued (wait) ⏳
   - **Error** = Something is wrong (check DNS) ❌

### 4. Wait for Certificate Provisioning

- **Typical time**: 15 minutes to 2 hours after DNS propagation
- **Maximum time**: Up to 24 hours in rare cases
- Railway will automatically retry if initial validation fails

### 5. Force Certificate Refresh (if needed)

If DNS is correct but certificate hasn't appeared after 24 hours:

1. **Remove and re-add domain in Railway:**
   ```bash
   railway domain --remove thegame.brianfloyd.me --service "final production"
   railway domain thegame.brianfloyd.me --service "final production"
   ```

2. **Or use Railway Dashboard:**
   - Settings → Domains → Remove domain
   - Add it again

## Common Issues

### Issue: DNS Not Propagated

**Symptoms:**
- `nslookup` shows no results or wrong results
- Different DNS checkers show different results

**Solution:**
- Wait for DNS propagation (can take up to 72 hours, usually 1-2 hours)
- Verify DNS record is correct in your DNS provider
- Check TTL (Time To Live) - lower TTL = faster propagation

### Issue: Wrong DNS Record Type

**Symptoms:**
- Domain doesn't resolve
- Certificate never provisions

**Solution:**
- Must use **CNAME** record, not A record
- Value must be exactly: `t18yqfrw.up.railway.app`

### Issue: Certificate Provisioning Failed

**Symptoms:**
- DNS is correct and propagated
- Certificate status shows "Error" in Railway dashboard

**Solution:**
1. Check Railway dashboard for specific error message
2. Verify domain is accessible (even without HTTPS)
3. Remove and re-add domain
4. Contact Railway support if issue persists

## Verification Steps

Once certificate is provisioned:

1. **Visit**: `https://thegame.brianfloyd.me`
2. **Check browser**: Should show green padlock (🔒) instead of "Not secure"
3. **Click padlock**: Should show "Connection is secure"
4. **Certificate details**: Should show Railway/Let's Encrypt certificate

## Testing Certificate

```bash
# Check certificate details
openssl s_client -connect thegame.brianfloyd.me:443 -servername thegame.brianfloyd.me

# Should show:
# - Valid certificate
# - Issued by: Let's Encrypt or Railway
# - Valid dates (not expired)
```

## Temporary Workaround

While waiting for SSL certificate:

- The site will still work, but browsers will show "Not secure"
- Users can click "Advanced" → "Proceed to site" if needed
- This is safe for testing, but wait for certificate before production use

## After Certificate is Active

Once the certificate is provisioned:
- ✅ Green padlock in browser
- ✅ No security warnings
- ✅ All traffic encrypted
- ✅ Professional appearance

The certificate will auto-renew (Let's Encrypt certificates are valid for 90 days and auto-renew).

