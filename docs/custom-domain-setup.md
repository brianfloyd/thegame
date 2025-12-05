# Custom Domain Setup for Railway

## Domain Configuration

**Custom Domain**: `thegame.brianfloyd.me`

## DNS Configuration Required

To complete the custom domain setup, add the following DNS record to your `brianfloyd.me` domain:

### DNS Record

| Type | Name | Value |
|------|------|-------|
| CNAME | `thegame` | `t18yqfrw.up.railway.app` |

### How to Add DNS Record

1. **Log in to your domain registrar** (where you manage `brianfloyd.me`)
   - This is likely GoDaddy, Namecheap, or another DNS provider

2. **Navigate to DNS Management**
   - Look for "DNS Settings", "DNS Management", or "DNS Records"

3. **Add CNAME Record**
   - **Type**: CNAME
   - **Name/Host**: `thegame` (or `thegame.brianfloyd.me` depending on your provider)
   - **Value/Target**: `t18yqfrw.up.railway.app`
   - **TTL**: 3600 (or default)

4. **Save the record**

### DNS Propagation

- DNS changes can take **up to 72 hours** to propagate worldwide
- Typically takes **15 minutes to 1 hour** for most users
- You can check propagation status at: https://www.whatsmydns.net/#CNAME/thegame.brianfloyd.me

### Verification

Once DNS has propagated, Railway will automatically:
- Provision an SSL certificate (HTTPS)
- Route traffic from `thegame.brianfloyd.me` to your Railway service

### Testing

After DNS propagation:
1. Visit `https://thegame.brianfloyd.me` in your browser
2. You should see the game login page
3. The SSL certificate should be valid (green lock icon)

## Environment Variables

The `BASE_URL` environment variable has been updated to:
```
BASE_URL=https://thegame.brianfloyd.me
```

This is used for:
- Email verification links
- Password reset links
- Any absolute URLs in the application

## Railway Domain Management

To view or manage your custom domain:
```bash
railway domain --service "final production"
```

To remove the custom domain:
```bash
railway domain --remove thegame.brianfloyd.me --service "final production"
```

## Troubleshooting

### Domain Not Working After 24 Hours

1. **Verify DNS Record**:
   - Check that the CNAME record is correctly set
   - Use `dig thegame.brianfloyd.me` or `nslookup thegame.brianfloyd.me` to verify

2. **Check Railway Status**:
   - Visit Railway dashboard → Your service → Settings → Domains
   - Verify the domain shows as "Active" or "Provisioning"

3. **SSL Certificate Issues**:
   - Railway automatically provisions SSL certificates
   - If certificate fails, check Railway dashboard for errors
   - May need to wait up to 24 hours for certificate provisioning

### Common DNS Issues

- **Wrong Record Type**: Must be CNAME, not A record
- **Wrong Value**: Must match exactly: `t18yqfrw.up.railway.app`
- **Subdomain Name**: Should be `thegame` (not `thegame.brianfloyd.me` in the name field)

















