# Cloudflare Durable Object & WebSocket Migration

The goal is to migrate the Planning Poker application from a polling-based R2 storage architecture to a real-time, event-driven architecture using Cloudflare Durable Objects, WebSockets, and SQLite-backed storage with hibernation.

## User Review Required

> [!IMPORTANT]
> This is a major architectural change.
> - **Data Migration**: Existing sessions in R2/local files will NOT be migrated automatically. We are assuming a fresh start for sessions or that users create new sessions.
> - **Infrastructure**: Requires `wrangler` and Cloudflare account with Durable Objects enabled.
> - **Cost**: This utilizes the 2026 pricing model (no idle charges).

## Proposed Changes

### Backend (Cloudflare Worker)
#### [NEW] worker/wrangler.toml
- Configure Durable Object binding `GAME_ROOM`.
- Enable SQLite backend (`new_sqlite_classes`).
- Set compatibility date to `2026-01-05`.

#### [NEW] worker/src/index.ts
- Main Worker entry point.
- `GameRoom` Durable Object class.
- WebSocket handling with Hibernation API (`acceptWebSocket`).
- Alarm for cleanup (1 hour inactivity).

#### [NEW] worker/src/logic.ts & worker/src/types.ts
- Copied from `lib/session.ts` and `lib/types.ts` to ensure the worker has access to shared logic without complex build steps.

### Frontend (Next.js)
#### [MODIFY] app/session/[id]/page.tsx
- Replace polling logic (SWR or `useEffect` fetch) with a custom WebSocket hook.
- Implement real-time state updates from WS messages.

#### [NEW] lib/useSocket.ts
- Custom hook to handle WebSocket connection, reconnection, and message parsing.

#### [MODIFY] app/api/session/create/route.ts
- Modify creating a session to potentially just redirect to the room ID or initialize the DO if needed.

### Shared Logic
#### [MODIFY] lib/session.ts
- Ensure `applyAction` is pure and robust (it already looks good).

## Verification Plan

### Automated Tests
- We will rely on manual verification for this "revamp".

### Manual Verification
1.  **Start Worker**: Run `wrangler dev` in `worker/` directory.
2.  **Start App**: Run `npm run dev` in root.
3.  **Create Session**: Go to home, create session.
4.  **Connect**: Verify WebSocket connection is established in Network tab.
5.  **Vote**: Open two tabs (Host, Voter). Cast vote in one, verify instant update in other without reload.
6.  **Idle**: Wait 10s, verify backend logs show hibernation.
