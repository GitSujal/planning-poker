## Step-by-step build plan (Next.js + Cloudflare Pages + R2 + polling)

### Phase 0 — Project setup

1. **Create repo + Next.js app**

* `npx create-next-app@latest vibe-planning-poker`
* Use App Router, TypeScript, ESLint.

2. **Add env + config skeleton**

* Define env vars (local + Pages):

  * `R2_BUCKET_NAME`
  * `R2_ACCOUNT_ID`
  * `R2_ACCESS_KEY_ID`
  * `R2_SECRET_ACCESS_KEY`
* Add a single config module `lib/config.ts` to read them.

3. **Define shared types**

* Create `lib/types.ts`:

  * `SessionState`, `Participant`, `Task`, `VotingState`, `SessionMode`, `SessionStatus`
  * `Action` union types (`vote`, `reveal`, `start_voting`, etc.)

---

### Phase 1 — R2 plumbing + API endpoints

4. **Implement R2 helper**

* `lib/r2.ts`

  * `getSession(sessionId): SessionState | null`
  * `putSession(sessionId, sessionState): void`
  * `createSessionObject(sessionState): void`
* Keep read/write to `sessions/${sessionId}.json`.

5. **Create session API**

* `POST /api/session/create`

  * Input: `hostName`, `sessionMode`
  * Generate `sessionId`, `hostToken`
  * Write initial session JSON to R2
  * Return `{ sessionId, hostToken, joinUrl }`

6. **Get session API**

* `GET /api/session/[id]`

  * Return session JSON
  * If missing/ended: 404 or `{status:"ended"}` (pick one and stay consistent)

7. **Action API**

* `POST /api/session/[id]/action`

  * Read session from R2
  * Apply action (pure function)
  * Update `updatedAt = now()`
  * Write back to R2
  * Return updated session JSON

> Build the action reducer early: `applyAction(session, action) => session`

---

### Phase 2 — Core UI scaffolding (no poker logic yet)

8. **Landing page**

* `/`

  * Button: “Create session”
  * Input: host name
  * Toggle: open/closed
  * On success: route to `/session/[id]` and store `hostToken` cookie + local identity

9. **Session page skeleton**

* `/session/[id]`

  * “Join” gate if no `displayName` in localStorage
  * Join modal:

    * display name (required)
    * role picker (voter/observer)
  * After join: show empty layout:

    * Header: app name + session id + theme toggle
    * Left: tasks list placeholder
    * Center: active task area placeholder
    * Right: participants placeholder

10. **Implement theme toggle**

* Store theme preference in localStorage
* Apply class on `<body>`.

---

### Phase 3 — Joining + participant sync

11. **Add “join” action**

* On join submit:

  * Client calls `POST /api/session/:id/action` with:

    * `{ type: "join", user, role }`
* Server-side join behavior:

  * If display name exists → return error
  * Add to `participants`
  * Update `updatedAt`

12. **Closed session approvals**

* Extend session state with:

  * `joinRequests: { [name]: {role} }` (in R2)
* Join logic:

  * If sessionMode = closed → add to `joinRequests` instead of `participants`
* Host UI:

  * See pending requests
  * Approve/reject actions:

    * `approve_join`, `reject_join`

*(If you want to keep it even simpler: skip joinRequests and just block joining when closed. But you explicitly want approvals, so implement this.)*

13. **Polling**

* On session page mount:

  * Start polling `GET /api/session/:id` every 1500–2000ms
  * Update React state when `updatedAt` changes
* Add “Connection lost” banner if fetch fails repeatedly (optional).

---

### Phase 4 — Tasks (CRUD-lite)

14. **Add task actions**

* `add_task { title }`
* `set_active_task { taskId }`
* `set_final_estimate { taskId, estimate }`
* Store tasks in R2 session JSON.

15. **Tasks UI**

* Left panel:

  * Task list
  * Add task input (only if allowed: open=anyone, closed=host-only)
  * Click task → set active (host-only)

16. **Active task UI**

* Show title
* Show final estimate if set
* Show “Start voting” controls for host

---

### Phase 5 — Voting round

17. **Deck UI**

* Center panel shows deck for voters when voting is open:

  * `0,1,2,3,5,8,13,21,34,55,89,?,☕`
* Clicking a card:

  * Calls `vote { user, value }`
  * Allowed only if:

    * participant role = voter
    * voting status = open

18. **Start voting**

* Host selects duration (seconds/minutes)
* Host clicks “Start”
* Action:

  * `start_voting { endsAt }`
* Server sets:

  * `voting.status = "open"`
  * `voting.endsAt = ...`
  * Optionally clear previous votes for the active task

19. **Timer display**

* All clients compute remaining time from `endsAt`
* When time <= 0:

  * UI treats voting as closed
  * Host can still “Reveal”
* To keep shared truth consistent, add an action:

  * Host (or any client) can trigger `close_voting` when timer hits 0
  * But simplest: host auto-closes on their UI and everyone else follows via polling.

20. **Reveal early**

* Host clicks “Reveal votes”
* Action:

  * `reveal`
* Server sets:

  * `voting.status = "revealed"` (or `closed` then `revealed`—pick one)
* All clients render results.

21. **Add time**

* Host action `add_time { seconds }`
* Server updates `endsAt += seconds` if status is open.

22. **Vote changes**

* Voting action overwrites existing user vote.

---

### Phase 6 — Results + aggregation (client-only)

23. **Results view**

* Show distribution:

  * Only show items with count > 0
* Show:

  * Average (exclude `?` and `☕`)
  * Median (exclude `?` and `☕`)

24. **Final estimate entry**

* Host inputs decided estimate (free text)
* Action: `set_final_estimate { taskId, estimate }`
* Host can move to next task (set active task).

---

### Phase 7 — Participant controls

25. **Role change**

* Host can switch participant voter/observer:

  * `set_role { user, role }`

26. **Kick**

* Host action:

  * `kick { user }`
* Server removes from `participants` (and from votes optionally).

27. **Transfer host**

* Host chooses participant → `transfer_host { newHostName }`
* Server updates `host.name` and rotates `hostToken` (optional)
* Client sets new host cookie if they become host (you can simply return the new token in response).

---

### Phase 8 — CSV export (no history view)

28. **Generate CSV**

* Host clicks “Export CSV”
* Use current in-memory session state:

  * Task title
  * Final estimate
  * Average
  * Median
  * Vote distribution
* Download file: `vibeplanningpoker_<sessionId>.csv`

---

### Phase 9 — Edge cases + polish

29. **Guardrails**

* If user refreshes:

  * Read localStorage identity
  * Re-join silently if missing in session participants (optional) or prompt user
* If name taken:

  * show join error immediately

30. **Session end**

* Host action: `end_session`
* Server sets `status="ended"`
* Clients show “Session ended” screen and stop polling.

31. **UI tightening**

* Minimal styling
* Clear host vs participant controls
* Light/dark theme consistent

