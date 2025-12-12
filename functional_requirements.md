# VibePlanningPoker

**Functional Requirements Specification (FRS)**
Version: 1.0

## 1. Purpose & Scope

VibePlanningPoker is a lightweight web application that facilitates **Planning Poker sessions** for Scrum teams.
It enables a host to create a session, manage tasks, control time-boxed voting rounds, reveal aggregated estimates, and export results.

### In Scope

* Real-time planning poker sessions
* Task-based estimation
* Time-limited voting
* Aggregated results with average and median
* CSV export of session data

### Out of Scope

* User accounts / authentication
* Persistent history across sessions
* External integrations (Jira, Azure DevOps, etc.)
* Analytics or reporting beyond CSV export

---

## 2. User Roles

### 2.1 Host

There is **exactly one host** per session.

* Creates and controls the session
* Manages participants and tasks
* Controls voting rounds
* Can transfer host ownership to another participant

### 2.2 Participant

Participants join a session via link or QR code.

* Each participant has a **unique display name per session**
* Joins as either:

  * **Voter**
  * **Observer**
* Role can be changed by the host at any time

---

## 3. Session Management

### 3.1 Session Creation

* Host can create a new session.
* Host selects session mode:

  * **Open session**

    * Anyone with the link can join immediately.
  * **Closed session**

    * Join requests require host approval.
* Once session starts:

  * A **join link** is generated.
  * A **QR code** for joining is displayed.

### 3.2 Joining a Session

* Participants must enter a **display name**.
* Display names must be **unique within the session**.

  * If a name already exists, joining is blocked with an error.
* Participants select **Voter** or **Observer** role on join.

### 3.3 Session State

* Session remains active until host ends it.
* Only one active session context exists at a time.
* No persistence once the session ends (except CSV export).

---

## 4. Participant Management

### 4.1 Host Controls

The host can:

* Approve or reject join requests (closed sessions)
* Change participant role:

  * Voter ↔ Observer
* Remove (kick) participants from the session
* Transfer host ownership to another participant

### 4.2 Participant Visibility

* All participants can see:

  * Current task
  * Voting timer
  * Whether voting is open or closed
* Observers:

  * Cannot vote
  * Can see results after reveal

---

## 5. Task Management

### 5.1 Task Structure

Each task contains:

* Task title (required)
* Final decided estimate (entered by host)
* Voting results (temporary, session-only)

### 5.2 Task Creation Rules

* **Open session** → any participant can add tasks
* **Closed session** → only host can add tasks
* Tasks are ordered in a simple list

### 5.3 Task Flow

* Host selects one task as the **active task**
* Only one task can be estimated at a time
* After voting and discussion:

  * Host enters the **final decided estimate**
  * Host moves to the next task

---

## 6. Voting Mechanics

### 6.1 Card Deck

The voting deck includes:

* Numeric cards:
  `0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89`
* Special cards:

  * `?`
  * `☕`

### 6.2 Voting Rules

* Host starts a voting round by setting a timer duration.
* When voting is open:

  * Voters can select **one card**
  * Votes can be **changed freely** until voting closes
* Voting closes when:

  * Timer expires (auto-close), or
  * Host manually clicks **Reveal Votes**

### 6.3 Timer Control

* Timer automatically closes voting when it reaches zero.
* Host can:

  * Add more time
  * End voting early by revealing votes

---

## 7. Reveal & Results

### 7.1 Reveal Behavior

* Votes are hidden during voting.
* On reveal:

  * Voting immediately ends
  * Results are shown to all participants

### 7.2 Results Display

Results include:

* **Aggregated vote counts per card**

  * Only cards that received votes are shown
  * No zero-count rows
* **Average estimate**

  * Calculated using numeric cards only
  * `?` and `☕` are excluded
* **Median estimate**

  * Calculated using numeric cards only

### 7.3 Vote Visibility

* Individual votes are visible **only on the cards themselves**
* No participant name-to-card mapping is displayed in results
* No per-person vote table

---

## 8. Final Estimate Decision

* After results are revealed:

  * Host manually enters the **final decided estimate**
  * The value is free-text (not restricted to deck values)
* Final estimate:

  * Is stored per task
  * Is included in CSV export
* Tasks **can be re-estimated** if host chooses (not locked)

---

## 9. History & Export

### 9.1 In-Session History

* No dedicated history view is required.
* Only the current task context is visible during estimation.

### 9.2 Export

* Host can export **current session data** as CSV.
* Export includes:

  * Task title
  * Final decided estimate
  * Average
  * Median
  * Vote distribution (counts per card)
* Export is available at any time during or at end of session.

---

## 10. UI & Experience

### 10.1 Look & Feel

* UI must be **minimal and distraction-free**
* Clear focus on:

  * Active task
  * Timer
  * Card selection
  * Results

### 10.2 Themes

* Support both:

  * **Dark mode**
  * **Light mode**

### 10.3 Branding

* Minimal branding
* App name displayed: **VibePlanningPoker**
* No logos or heavy styling required

---

## 11. Edge Cases & Rules

* Duplicate display names are blocked.
* Participants joining mid-vote:

  * Can vote only if voting is still open and they are a Voter.
* Observers cannot vote even if voting is open.
* If no numeric votes are cast:

  * Average and median are not shown.
* If all votes are special cards:

  * Results still show counts
  * Average and median are omitted.

Now 
## 12. Acceptance Criteria Summary (High Level)

* Host can fully control session flow.
* Voting is private until reveal.
* Results are aggregated, fair, and transparent.
* No unnecessary features or friction.
* CSV export provides usable estimation records.


