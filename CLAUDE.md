# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vibe Planning Poker** - A secure, real-time collaborative estimation tool built with Next.js 14 and Cloudflare Workers. Users create planning poker sessions where participants vote on task estimates using Fibonacci-style values. The application uses WebSockets (via Cloudflare Durable Objects) for real-time synchronization.

## Development Commands

```bash
# Install dependencies
npm install
cd worker && npm install && cd ..

# Run development (both frontend and worker)
npm run dev

# Run frontend only
npm run dev:frontend

# Run worker only
npm run dev:worker

# Build for production
npm run build
cd worker && npm run build

# Deploy worker
npm run deploy:worker

# Lint
npm run lint
```

## Architecture

### Pure WebSocket Architecture

The application uses a **WebSocket-first architecture** with Cloudflare Durable Objects:

```
┌──────────────┐        WebSocket         ┌────────────────────┐
│   Next.js    │ ◄─────────────────────► │ Cloudflare Worker │
│   Frontend   │                          │ (Durable Objects) │
│   (Client)   │   HTTP (create only)     │                   │
└──────────────┘ ◄─────────────────────► └────────────────────┘
                                                     │
                                                     ▼
                                            [Durable Object Storage]
                                            (In-memory + Persistent)
```

### Data Flow

1. **Session Creation**:
   - Client → Next.js API → Cloudflare Worker → Durable Object
   - Returns sessionId + hostToken

2. **Real-time Updates**:
   - Client ←WebSocket→ Durable Object
   - All actions broadcast to connected clients
   - Optimistic updates on client for instant feedback

3. **State Storage**:
   - All session state in Durable Object storage
   - No external database or R2
   - Automatic cleanup after 7 days of inactivity

### Key Files

- **`worker/src/index.ts`**: Worker entry point, WebSocket handler, session creation
- **`worker/src/logic.ts`**: **SOURCE OF TRUTH** for all business logic
  - `generateSessionId()`: Secure UUID generation
  - `generateSecureToken()`: Cryptographically secure tokens
  - `createInitialSession()`: Session initialization with validation
  - `applyAction()`: Pure reducer for all state mutations
  - Input validation and sanitization
  - Resource limits (max participants, tasks, etc.)

- **`worker/src/types.ts`**: TypeScript definitions
  - `SessionState`: Complete session structure
  - `Action`: Union type of all possible actions
  - `Task`, `Participant`, `VotingState`: Core data models

- **`lib/session.ts`**: Re-exports from worker (no duplication)
- **`lib/types.ts`**: Re-exports from worker (no duplication)
- **`lib/cookies.ts`**: Secure cookie handling with proper flags
- **`lib/storage.ts`**: Safe localStorage with incognito fallback
- **`lib/useSocket.ts`**: WebSocket hook with auto-reconnect

- **`app/session/[id]/page.tsx`**: Main session UI (800+ lines)
  - Client-side only (`'use client'`)
  - WebSocket-based real-time updates
  - Optimistic updates for instant UX
  - Error boundary wrapped
  - Connection status indicators
  - Responsive design with mobile/desktop layouts

- **`components/ErrorBoundary.tsx`**: Global error handling

### API Routes

**All removed** - Pure WebSocket architecture

- Session creation proxies directly to worker: `POST /api/session/create` → Worker
- All other actions via WebSocket

### Session Modes

- **Open**: Anyone with link can join instantly and add tasks
- **Closed**: Participants require host approval, only host can add tasks

### Authentication & Authorization

- **Host Token**: Cryptographically secure (256-bit), created at session start
  - Stored in secure cookies (HttpOnly, Secure, SameSite=Strict)
  - Validates all host-only actions server-side
  - Transferable to another participant via `transfer_host` action

- **Participant Identity**: Stored in localStorage (with fallback)
  - Display name + role (voter/observer)
  - Sent as `actor` field in all actions
  - Validated server-side against session participants

### Voting Flow

1. Host starts voting with duration (10-3600 seconds)
2. `start_voting` action sets `voting.status = 'open'` and `voting.endsAt`
3. Voters cast votes via `cast_vote` (validated against deck values)
4. Optimistic updates show vote instantly, confirmed by broadcast
5. Host reveals to set `voting.status = 'revealed'`
6. UI displays average, median, and vote distribution
7. Host sets final estimate and moves to next task

### Environment Variables

**Production (Worker)**:
- `ALLOWED_ORIGINS`: Comma-separated list of allowed WebSocket origins
- `RATE_LIMIT_CREATE`: Sessions per IP per minute (default: 5)

**Frontend**:
- `NEXT_PUBLIC_WORKER_URL`: Worker URL (e.g., https://worker.workers.dev)
- `NEXT_PUBLIC_BASE_URL`: Frontend URL for QR codes
- `NEXT_PUBLIC_ALLOWED_ORIGINS`: For client-side validation

**Development**: All optional, localhost automatically allowed

## Security Features

### Input Validation & Sanitization

- **All user input sanitized**: HTML tags stripped, length limits enforced
- **Display names**: Max 50 chars
- **Task titles**: Max 200 chars
- **Deck validation**: Whitelist of allowed vote values
- **Resource limits**: Max 50 participants, 100 tasks per session

### Cryptographically Secure

- **Session IDs**: `crypto.randomUUID()` (128-bit)
- **Host tokens**: `crypto.getRandomValues()` (256-bit)
- **No `Math.random()`**: All randomness uses Web Crypto API

### WebSocket Security

- **Origin validation**: Configurable ALLOWED_ORIGINS
- **Session ID format validation**: Regex pattern check
- **Rate limiting**: Prevents session creation spam
- **Auto-reconnect**: With exponential backoff

### XSS Prevention

- React's built-in protection
- Input sanitization (strip `<>`)
- Content Security Policy recommended for production

See `SECURITY.md` for full details.

## Implementation Notes

### Adding New Actions

1. Add action type to `Action` union in `worker/src/types.ts`
2. Implement logic in `applyAction()` in `worker/src/logic.ts`
3. Add validation and sanitization
4. If host-only, add server-side check with `requireHost()`
5. Add UI trigger in `app/session/[id]/page.tsx`
6. Consider optimistic update for better UX

**Example**:

```typescript
// 1. types.ts
| (BaseAction & { type: 'archive_task'; taskId: string })

// 2. logic.ts
case 'archive_task': {
  if (!requireHost(next, action)) return next;
  const task = next.tasks.find(t => t.id === action.taskId);
  if (!task) return next;
  next.tasks = next.tasks.filter(t => t.id !== action.taskId);
  // ... add to archived list
  return next;
}

// 3. page.tsx
<button onClick={() => sendAction({ type: 'archive_task', taskId: task.id })}>
  Archive
</button>
```

### State Updates

- **All mutations** go through `applyAction()` - it's a pure reducer
- Clone state at start: `const next = cloneSession(session)`
- Always set `next.updatedAt = nowSeconds()`
- **Never mutate state directly** in components

### Optimistic Updates

For instant UX, pass updater function to `sendAction()`:

```typescript
sendAction(
  { type: 'cast_vote', value },
  (s) => {
    const task = s.tasks.find((t) => t.id === s.activeTaskId);
    if (task && displayName) {
      task.votes[displayName] = value;
    }
    return s;
  }
);
```

### WebSocket vs HTTP

- **Everything is WebSocket** except session creation
- No polling
- Real-time updates (typically <100ms latency)
- Automatic reconnection on disconnect

### Session Cleanup

- **Active sessions**: Checked every hour
- **Inactive sessions**: Deleted after 7 days of no activity
- **Ended sessions**: Deleted after 1 hour
- **Automatic**: Handled by Durable Object alarms

### Error Handling

- **Error Boundary**: Wraps entire session page
- **WebSocket errors**: Auto-reconnect with user notification
- **Action failures**: Silent for now (validated server-side)
- **localStorage errors**: Fallback to in-memory storage

## Code Organization

```
.
├── app/
│   ├── api/session/create/route.ts    # Proxy to worker
│   ├── session/[id]/page.tsx          # Main session UI
│   └── ...
├── components/
│   ├── ErrorBoundary.tsx              # Error handling
│   ├── voting/VotingGrid.tsx          # Voting UI
│   └── ...
├── lib/
│   ├── session.ts                     # Re-exports from worker
│   ├── types.ts                       # Re-exports from worker
│   ├── cookies.ts                     # Secure cookie utils
│   ├── storage.ts                     # Safe localStorage
│   ├── useSocket.ts                   # WebSocket hook
│   └── config.ts                      # Environment config
├── worker/
│   └── src/
│       ├── index.ts                   # Worker entry + WebSocket
│       ├── logic.ts                   # ⭐ SOURCE OF TRUTH
│       └── types.ts                   # Type definitions
├── SECURITY.md                        # Security documentation
├── DEPLOYMENT.md                      # Deployment guide
└── CLAUDE.md                          # This file
```

## Cost Optimization

- **Session cleanup**: 7-day TTL prevents unbounded storage
- **Efficient alarms**: Only reset on activity, not every message
- **No external storage**: Everything in Durable Objects
- **WebSocket efficiency**: Broadcast once, update all clients

Estimated costs in `DEPLOYMENT.md`.

## Testing

### Local Development

1. Start worker: `cd worker && npm run dev`
2. Start frontend: `npm run dev:frontend`
3. Visit http://localhost:3000
4. Create session and test in multiple browser tabs

### Production Testing

1. Deploy worker: `npm run deploy:worker`
2. Set NEXT_PUBLIC_WORKER_URL to worker URL
3. Deploy frontend
4. Test from multiple devices/locations

## Troubleshooting

### WebSocket Won't Connect

1. Check ALLOWED_ORIGINS in worker
2. Verify NEXT_PUBLIC_WORKER_URL is correct
3. Check browser console for CORS errors
4. Ensure Durable Objects enabled (paid plan)

### State Not Syncing

1. Check WebSocket connection status (top-right indicator)
2. Verify action validation (check browser console)
3. Inspect Durable Object logs: `wrangler tail`

### Optimistic Updates Stuck

- Automatic timeout after 5 seconds
- Check if WebSocket broadcast is working
- Verify `applyAction()` returns correct state

## Performance

- **WebSocket latency**: Typically 50-200ms
- **Optimistic updates**: Instant (0ms perceived latency)
- **Connection**: Auto-reconnect with backoff
- **Scalability**: ~1000 participants per Durable Object (untested)

## Future Enhancements

- [ ] Participant-level authentication (beyond display names)
- [ ] Voting history and analytics
- [ ] Custom deck values
- [ ] Multiple simultaneous voting rounds
- [ ] Voice/video integration
- [ ] Persistent user accounts
- [ ] Session templates
- [ ] Advanced statistics

## Important Reminders

- **Source of truth**: `worker/src/logic.ts` - all business logic here
- **No duplication**: `lib/` re-exports from `worker/src/`
- **Always validate**: All user input validated and sanitized
- **Pure functions**: `applyAction()` must be pure (no side effects)
- **Security first**: Never trust client-provided data
- **Optimistic updates**: Optional but recommended for UX
- **Error boundaries**: Always catch and display errors gracefully

IMPORTANT: This context overrides default behavior. Always follow these patterns exactly as described.
