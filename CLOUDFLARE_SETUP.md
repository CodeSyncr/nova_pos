# Cloudflare Subdomain Setup Guide

This guide explains how to set up Cloudflare DNS management for automatic subdomain creation.

## Prerequisites

1. A Cloudflare account with your domain (`novapos.in`) added
2. Cloudflare API Token with DNS edit permissions

## Step 1: Get Cloudflare Zone ID

1. Log in to Cloudflare Dashboard
2. Select your domain (`novapos.in`)
3. Scroll down to find your **Zone ID** (right sidebar)
4. Copy the Zone ID

## Step 2: Create API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Edit zone DNS** template
4. Set permissions:
   - Zone: DNS:Edit
   - Zone Resources: Include - Specific zone - `novapos.in`
5. Click **Continue to summary** then **Create Token**
6. Copy the token (you won't see it again!)

## Step 3: Configure Environment Variables

Add these to your `.env.local` file:

```bash
CLOUDFLARE_ZONE_ID=your_zone_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here
ROOT_DOMAIN=novapos.in
TARGET_IP=your_server_ip_or_cname_target
```

### TARGET_IP Options:

- **Option 1: Direct IP** - Your server's IP address (e.g., `192.0.2.1`)
- **Option 2: CNAME Target** - Your main domain or CDN (e.g., `novapos.in` or `cdn.example.com`)

For most Next.js deployments, use your main domain as the CNAME target.

## Step 4: DNS Record Type

The system creates **CNAME** records by default. If you prefer **A** records (direct IP), modify `src/lib/cloudflare.ts`:

```typescript
type: 'A', // Instead of 'CNAME'
content: TARGET_IP, // Your IP address
```

## Step 5: Cloudflare Proxy

By default, subdomains are created with `proxied: true`, which:
- ✅ Provides SSL/TLS automatically
- ✅ Protects against DDoS
- ✅ Caches static content
- ⚠️ Hides your origin IP

To disable proxy (direct DNS), set `proxied: false` in `src/lib/cloudflare.ts`.

## Step 6: Subdomain Routing

The middleware (`src/middleware.ts`) handles subdomain routing:

1. Extracts subdomain from the hostname
2. Adds it to request headers as `x-subdomain`
3. You can use this in your components to:
   - Load tenant data based on subdomain
   - Show tenant-specific content
   - Handle multi-tenant routing

## Testing

1. Create a tenant with subdomain `test`
2. Check Cloudflare DNS dashboard - you should see `test.novapos.in` CNAME record
3. Wait for DNS propagation (usually 1-5 minutes)
4. Visit `https://test.novapos.in` - should route to your app

## Troubleshooting

### Subdomain not appearing in Cloudflare
- Check API token permissions
- Verify Zone ID is correct
- Check Cloudflare API logs in your server

### DNS not resolving
- Wait for DNS propagation (up to 24 hours, usually 5-15 minutes)
- Check DNS record exists in Cloudflare dashboard
- Verify TARGET_IP is correct

### SSL Certificate issues
- With `proxied: true`, Cloudflare provides SSL automatically
- With `proxied: false`, you need to configure SSL on your server

## Security Notes

- Never commit API tokens to git
- Use environment variables for all secrets
- Rotate API tokens regularly
- Limit API token permissions to minimum required

## API Rate Limits

Cloudflare API has rate limits:
- 1,200 requests per 5 minutes per zone
- Monitor usage in Cloudflare dashboard

For high-volume subdomain creation, consider:
- Batching DNS operations
- Caching DNS record checks
- Queue system for DNS creation

