# Security Features

This document outlines the security measures implemented in Vibe Planning Poker.

## Authentication & Authorization

### Cryptographically Secure Tokens

- **Session IDs**: Generated using `crypto.randomUUID()` (128-bit)
- **Host Tokens**: Generated using `crypto.getRandomValues()` (256-bit)
- **Cookie Security**: Secure, SameSite=Strict, HTTPS-only flags
- **No Weak Randomness**: Eliminated all `Math.random()` usage

### Access Control

- Host-only actions validated server-side
- Participant verification for all actions
- Cannot kick yourself or transfer host to non-participants
- Session mode (open/closed) controls join permissions

## Input Validation & Sanitization

### User Input

- **Display Names**: Max 50 characters, HTML tags stripped
- **Task Titles**: Max 200 characters, HTML tags stripped
- **Vote Values**: Whitelist validation against deck values
- **Estimates**: Max 20 characters, sanitized

### Resource Limits

- **Max Participants**: 50 per session
- **Max Tasks**: 100 per session
- **Voting Duration**: 10-3600 seconds
- **Time Extension**: 10-300 seconds

## WebSocket Security

### Connection Security

- **Origin Validation**: Configurable allowed origins
- **Session ID Format Validation**: Regex pattern check
- **Automatic Reconnection**: With exponential backoff
- **PING/PONG**: Keep-alive mechanism

### Message Handling

- **JSON Validation**: All messages validated
- **Action Type Validation**: Whitelist of allowed actions
- **Error Isolation**: Errors don't crash connections

## Rate Limiting

### Session Creation

- **Default**: 5 sessions per IP per minute
- **Configurable**: Via `RATE_LIMIT_CREATE` environment variable
- **IP Detection**: Uses CF-Connecting-IP or X-Forwarded-For

### Future Enhancements

- Per-user action rate limiting
- Distributed rate limiting with Durable Objects

## Session Management

### Cleanup & Expiration

- **Active Sessions**: Check every hour
- **Inactive Sessions**: Deleted after 7 days of no activity
- **Ended Sessions**: Deleted after 1 hour
- **No Orphans**: Automatic cleanup on connection close

### Data Protection

- **Secure Cookies**: HttpOnly, Secure, SameSite flags
- **localStorage Fallback**: Safe handling for incognito mode
- **No Sensitive Data Logging**: Tokens never logged

## XSS Prevention

### Input Sanitization

- Strip HTML tags (`<`, `>`) from all user input
- Length limits on all text fields
- React's built-in XSS protection

### Content Security Policy

Configure CSP headers in production:

```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; connect-src 'self' https://your-worker.workers.dev wss://your-worker.workers.dev;"
  }
];
```

## Environment Variables

### Required for Production

```bash
# Cloudflare Worker
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
RATE_LIMIT_CREATE=5

# Next.js Frontend
NEXT_PUBLIC_WORKER_URL=https://your-worker.workers.dev
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## Security Checklist

- [ ] Set `ALLOWED_ORIGINS` in production
- [ ] Enable HTTPS on all domains
- [ ] Configure CSP headers
- [ ] Set up monitoring/alerting
- [ ] Regular dependency updates
- [ ] Review Cloudflare security settings
- [ ] Enable Cloudflare WAF rules

## Reporting Vulnerabilities

If you discover a security vulnerability, please email security@your-domain.com instead of opening a public issue.

## Audit Log

- **2026-01-05**: Complete security refactoring
  - Cryptographically secure token generation
  - Input validation and sanitization
  - Rate limiting
  - WebSocket origin validation
  - Session cleanup mechanism
  - XSS prevention measures
