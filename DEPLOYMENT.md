# Deployment Guide

Complete guide for deploying Vibe Planning Poker to production.

## Architecture Overview

```
┌─────────────┐         WebSocket         ┌──────────────────┐
│   Next.js   │ ◄──────────────────────► │ Cloudflare Worker│
│   Frontend  │                           │ (Durable Objects)│
│  (Vercel)   │         HTTP/REST         │                  │
└─────────────┘ ◄──────────────────────► └──────────────────┘
                     Session Creation
```

## Prerequisites

1. **Cloudflare Account**
   - Paid Workers plan (for Durable Objects)
   - `wrangler` CLI installed: `npm install -g wrangler`

2. **Vercel Account** (or any Next.js host)
   - Connected to your Git repository

3. **Domain** (optional but recommended)
   - Configured in Cloudflare

## Step 1: Deploy Cloudflare Worker

### 1.1 Install Dependencies

```bash
cd worker
npm install
```

### 1.2 Authenticate Wrangler

```bash
wrangler login
```

### 1.3 Configure Environment

Edit `worker/wrangler.toml`:

```toml
name = "your-poker-worker"
# Update with your actual domain
```

### 1.4 Set Secrets

```bash
# Production origins (comma-separated)
wrangler secret put ALLOWED_ORIGINS
# Enter: https://your-domain.com,https://www.your-domain.com

# Rate limit (optional, default: 5)
wrangler secret put RATE_LIMIT_CREATE
# Enter: 5
```

### 1.5 Deploy

```bash
npm run deploy
```

Your worker will be deployed to: `https://your-poker-worker.workers.dev`

### 1.6 Custom Domain (Optional)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Add custom domain: `api.your-domain.com`

## Step 2: Deploy Next.js Frontend

### 2.1 Configure Environment Variables

In your hosting platform (Vercel/Netlify), set:

```bash
# Required
NEXT_PUBLIC_WORKER_URL=https://your-poker-worker.workers.dev
# or https://api.your-domain.com

# Optional
NEXT_PUBLIC_BASE_URL=https://your-domain.com
NEXT_PUBLIC_ALLOWED_ORIGINS=https://your-domain.com
```

### 2.2 Deploy to Vercel

#### Option A: Git Integration (Recommended)

1. Push to GitHub/GitLab
2. Import project in Vercel
3. Set environment variables
4. Deploy

#### Option B: CLI

```bash
npm install -g vercel
vercel --prod
```

### 2.3 Verify Deployment

1. Visit your frontend URL
2. Create a session
3. Check browser console for errors
4. Test WebSocket connection

## Step 3: Configure CORS & Security

### 3.1 Update Worker Origins

After deploying frontend, update worker origins:

```bash
wrangler secret put ALLOWED_ORIGINS
# Enter your production URL: https://your-domain.com
```

### 3.2 Configure CSP Headers

Create `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              connect-src 'self' https://your-worker.workers.dev wss://your-worker.workers.dev;
              img-src 'self' data: https:;
              script-src 'self' 'unsafe-eval' 'unsafe-inline';
              style-src 'self' 'unsafe-inline';
            `.replace(/\s{2,}/g, ' ').trim()
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
```

## Step 4: Monitoring & Observability

### 4.1 Cloudflare Analytics

1. Go to Workers & Pages → your worker
2. Enable analytics
3. Monitor request counts, errors, CPU time

### 4.2 Error Tracking (Optional)

Add Sentry or LogRocket:

```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

Update `components/ErrorBoundary.tsx`:

```typescript
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  if (window.Sentry) {
    window.Sentry.captureException(error, { extra: errorInfo });
  }
}
```

## Step 5: Performance Optimization

### 5.1 Enable Cloudflare Caching

Static assets are automatically cached. Configure cache rules:

1. Go to Cloudflare Dashboard → Caching
2. Set cache level: Standard
3. Enable Auto Minify (JS, CSS, HTML)

### 5.2 Enable Argo Smart Routing (Optional)

Reduces latency for global users:

```bash
# ~$5/month
wrangler tail your-worker-name
```

## Cost Estimation

### Cloudflare Workers (Paid Plan: $5/month)

- **Durable Objects**:
  - Requests: $0.15/million (first 1M free)
  - Duration: $12.50/million GB-seconds
  - ~100 active sessions/day: **$10-15/month**
  - ~1,000 active sessions/day: **$50-100/month**

### Vercel (Hobby: Free, Pro: $20/month)

- Hobby plan sufficient for most use cases
- Pro plan for team features and analytics

### Total Monthly Cost

- **Small Scale** (100 sessions/day): **~$5-20/month**
- **Medium Scale** (1,000 sessions/day): **~$55-120/month**
- **Large Scale** (10,000 sessions/day): **~$500-1,000/month**

## Troubleshooting

### WebSocket Connection Fails

1. Check ALLOWED_ORIGINS is set correctly
2. Verify NEXT_PUBLIC_WORKER_URL matches deployed URL
3. Check browser console for CORS errors
4. Ensure Cloudflare proxy is enabled

### Sessions Not Persisting

1. Check Durable Objects are enabled (Workers Paid plan)
2. Verify migrations ran: `wrangler tail`
3. Check for worker errors in dashboard

### High Costs

1. Review session cleanup settings (7-day expiry)
2. Check for runaway sessions in analytics
3. Consider implementing connection limits
4. Review alarm frequency (currently 1 hour)

## Rollback

### Worker Rollback

```bash
cd worker
wrangler rollback
```

### Frontend Rollback

In Vercel dashboard:
1. Deployments → Previous deployment
2. Click "Promote to Production"

## Health Checks

Create a monitoring endpoint:

```typescript
// worker/src/index.ts
if (url.pathname === "/health") {
  return new Response(JSON.stringify({ status: "ok", version: "0.2.0" }), {
    headers: { "Content-Type": "application/json" }
  });
}
```

Monitor: `https://your-worker.workers.dev/health`

## Backup & Recovery

Durable Objects data is automatically replicated by Cloudflare. No additional backup needed.

For session exports:
- Users can export CSV anytime
- Consider automated daily exports to R2 for compliance

## Security Checklist

- [ ] HTTPS enforced on all domains
- [ ] ALLOWED_ORIGINS configured
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] Error monitoring set up
- [ ] Secrets rotated (if compromised)
- [ ] Dependencies updated

## Support

- **Cloudflare Docs**: https://developers.cloudflare.com/workers/
- **Next.js Docs**: https://nextjs.org/docs
- **Issues**: Open a GitHub issue
