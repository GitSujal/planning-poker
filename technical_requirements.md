# VibePlanningPoker

## Technical Design Document (Final)

---

## 1. Architecture Overview

### Design Philosophy

* **Minimal backend**
* **Client-driven UI**
* **Shared state via simple JSON**
* **Eventual consistency is acceptable**
* **Human coordination > strict correctness**

### Stack

| Layer        | Choice                     |
| ------------ | -------------------------- |
| Frontend     | Next.js (App Router)       |
| Hosting      | Cloudflare Pages           |
| Backend      | Cloudflare Pages Functions |
| Storage      | Cloudflare R2              |
| Sync Model   | Client polling             |
| Client State | localStorage               |
| Identity     | Display name + cookies     |

---

## 2. System Diagram (Conceptual)

```
Browser A ─┐
Browser B ─┼──> Cloudflare Pages Function ───> R2 (session.json)
Browser C ─┘          ↑
                       └── periodic GET (polling)
```

---

## 3. Data Ownership Model

### Source of Truth

| Data              | Owner   |
| ----------------- | ------- |
| Session existence | R2      |
| Participants      | R2      |
| Tasks             | R2      |
| Votes             | R2      |
| Host identity     | R2      |
| UI state          | Browser |
| Derived values    | Browser |

---

## 4. R2 Data Model

### Object Key

```
sessions/{sessionId}.json
```

### Session Schema (Authoritative)

```json
{
  "sessionId": "abc123",
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": 1730000123,

  "host": {
    "name": "Sujal",
    "hostToken": "host-secret"
  },

  "sessionMode": "open | closed",
  "status": "active | ended",

  "participants": {
    "Alex": { "role": "voter" },
    "Jamie": { "role": "observer" }
  },

  "tasks": [
    {
      "id": "task-1",
      "title": "Login API",
      "votes": {
        "Alex": "5",
        "Jamie": "8"
      },
      "finalEstimate": null
    }
  ],

  "activeTaskId": "task-1",

  "voting": {
    "status": "open | closed | revealed",
    "endsAt": 1730000200
  }
}
```

### Important Rules

* ❌ No averages
* ❌ No medians
* ❌ No derived fields
* ✅ Raw votes only
* ✅ Updated via mutation

---

## 5. Client-side Storage

### localStorage (per user)

```json
{
  "sessionId": "abc123",
  "displayName": "Alex",
  "isHost": false,
  "selectedCard": "5"
}
```

### Cookies (minimal)

* `hostToken` (host only)

---

## 6. API Surface (Minimal)

### 6.1 Create Session

```
POST /api/session/create
```

**Request**

```json
{
  "hostName": "Sujal",
  "sessionMode": "open"
}
```

**Response**

```json
{
  "sessionId": "abc123",
  "hostToken": "host-secret",
  "joinUrl": "/session/abc123"
}
```

**Behavior**

* Create new R2 object
* Save host token
* Return join info

---

### 6.2 Get Session State

```
GET /api/session/:sessionId
```

**Response**

```json
{ ...sessionJson }
```

**Behavior**

* Read-only
* Used for polling
* 404 if session does not exist or ended

---

### 6.3 Session Actions

```
POST /api/session/:sessionId/action
```

All state mutations go through this endpoint.

---

## 7. Action Protocol

### Vote

```json
{
  "type": "vote",
  "user": "Alex",
  "value": "5"
}
```

### Reveal Votes

```json
{
  "type": "reveal"
}
```

### Add Time

```json
{
  "type": "add_time",
  "seconds": 30
}
```

### Start Voting

```json
{
  "type": "start_voting",
  "endsAt": 1730000200
}
```

### Finalize Task

```json
{
  "type": "finalize",
  "estimate": "8"
}
```

### Add Task

```json
{
  "type": "add_task",
  "title": "Signup API"
}
```

### Change Role

```json
{
  "type": "set_role",
  "user": "Jamie",
  "role": "observer"
}
```

### Kick Participant

```json
{
  "type": "kick",
  "user": "Alex"
}
```

---

## 8. Polling Strategy

### Poll Interval

* **1.5–2 seconds**

### Update Logic

1. Fetch session JSON
2. Compare `updatedAt`
3. If changed:

   * Replace local React state
   * Re-render UI
4. If unchanged:

   * Do nothing

---

## 9. Voting Lifecycle (State Machine)

```
IDLE
 ↓
START_VOTING
 ↓
OPEN ──(timer ends)──▶ CLOSED
 ↓                     ↓
REVEAL ─────────────▶ REVEALED
 ↓
FINALIZE
 ↓
NEXT TASK
```

---

## 10. Aggregation (Client-only)

### Numeric Filtering

```ts
const numericVotes = Object.values(votes)
  .map(Number)
  .filter(v => !isNaN(v))
```

### Average

```ts
avg = sum / count
```

### Median

```ts
sorted[Math.floor(n / 2)]
```

### Distribution

* Count occurrences
* Only show values that exist

---

## 11. CSV Export (Client-only)

### Columns

```csv
Task Title,Final Estimate,Average,Median,Vote Distribution
```

### Example

```csv
Login API,8,6.5,8,"{5:1,8:1}"
```

Generated via:

* JS `Blob`
* `URL.createObjectURL`
* Download link

---

## 12. Next.js Structure

```txt
/app
  /page.tsx                  → Landing
  /session/[id]/page.tsx     → Main UI
  /api/session/create
  /api/session/[id]/route.ts

/components
  Deck.tsx
  Timer.tsx
  TaskList.tsx
  Results.tsx
  Participants.tsx

/lib
  r2.ts          → R2 helpers
  session.ts     → Action handlers
  polling.ts     → Poll logic
```

---

## 13. Error Handling (Lightweight)

| Case            | Behavior                 |
| --------------- | ------------------------ |
| Session missing | Show “Session not found” |
| Session ended   | Show “Session ended”     |
| Name collision  | Block join               |
| Stale updates   | Last-write-wins          |
| Network error   | Retry silently           |

---

## 14. Performance Expectations

* Sessions: < 20 users
* R2 reads: ~1 read / user / 2 sec
* Writes: human-paced
* Cost: negligible

---

## 15. Explicit Non-Goals

* Authentication
* Security
* Strong consistency
* Audit logs
* Persistence after session ends

---

## 16. Why this design works

✔ Static-first
✔ Cheap
✔ Simple mental model
✔ Cloudflare-native
✔ Easy to evolve later
✔ Perfect for planning poker

---

## 17. Future Upgrade Paths (Optional)

* Replace polling with Durable Objects
* Persist completed sessions
* Add WebSockets
* Add auth
* Multi-host roles
