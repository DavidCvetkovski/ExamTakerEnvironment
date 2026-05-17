# Epoch 8.6 — Reactive Lifecycle & Per-Run Drill-Ins

> **Type:** Mixed — one reactivity bug-fix worth treating as a small architectural refactor (Stage 1), and one information-architecture / data-shape gap that finally surfaced after Epoch 8.5's grading restructure (Stage 2).
> **Scope:** Two stages, both shipping behind `feature/epoch-8.6-reactive-lifecycle`. Stage 1 touches the scheduled-sessions dashboard, the student "My Exams" page, and the time-derivation primitives that power both. Stage 2 touches the grading and analytics route layers, the grading & psychometrics services, and the e2e seed.
> **Origin:** Reported 2026-05-16 after continued use of the Epoch 8.5 build.
>
> **Guiding principle (carried from §1–§7 of `CLAUDE.md`):** A lifecycle has exactly one source of truth. The frontend and backend may *render* it differently, but they must never *derive* it differently. Same goes for "which submissions belong to which exam window" — there is one answer, the FK, and every layer reads it the same way.

---

## Stage 0 — Verdict (read this first)

David asked: *"Is this impossible? Is it actually fine in the backend and only the seed is screwing it up?"*

**Bottom line: neither problem is impossible, and neither is purely a seed bug.** Honest breakdown per problem:

> **Working-tree context (2026-05-16).** Before reading further, note: `frontend/src/app/grading/page.tsx` has uncommitted modifications and `frontend/src/app/grading/test/[testId]/page.tsx` is untracked. These together amount to a **partial in-flight reversal of Epoch 8.5 Stage 9** — Stage 9 had landed `/grading` as a flat cross-blueprint session list (commit `49f2e16`), and the working tree has restructured back to "blueprint cards on `/grading`, per-blueprint submissions on `/grading/test/[testId]`". This Stage 2 plan **assumes that direction is the intended one** (it matches David's stated mental model) and inserts the missing middle layer — a per-run picker between the blueprint cards and the per-run submission list. **Before starting Stage 2 work, the WIP should be committed first** so the 8.6 diff is reviewable in isolation.

### Problem 1 — Timer stays in "Ongoing" past `ends_at` and counts upward

| Layer | Verdict |
|---|---|
| Backend | ✅ **Healthy.** `scheduled_sessions_service.ensure_scheduled_session_current()` already derives `ACTIVE`/`CLOSED`/`SCHEDULED` from `now` vs. `starts_at`/`ends_at` on every list call and persists transitions. The DB row is fine within one round-trip of any list fetch. |
| Frontend reactivity | ❌ **Two bugs + one missing primitive.** Detailed in Stage 1. |
| Seed | ⚠️ **Contributes to severity.** Session windows are only 2 minutes long with offsets `[-45s, -15s, +60s, +120s]` — *designed* to flip statuses while you're looking at the dashboard. That's good for testing, bad if the frontend can't keep up. Don't change the seed for this; fix the frontend. |

This is a **frontend refactor**, not a backend or seed problem. ~200 LOC, plus one defensive 5-line backend addition (server returns its `now()` so we can correct for client clock skew).

### Problem 2 — Grading shows blueprints, not the *sessions within* a blueprint; only closed sessions should be gradable; same for analytics

| Layer | Verdict |
|---|---|
| Data model | ✅ **Already correct.** `exam_sessions.scheduled_session_id` exists (nullable for practice), with FK to `scheduled_exam_sessions` and an index. The schema supports the requested view without migration. See `prisma/schema.prisma:30` and `prisma/schema.prisma:39`. |
| Grading service | ❌ **Incomplete.** `get_grading_overview(test_definition_id)` returns submitted sessions for a blueprint but never reads, exposes, or filters by `scheduled_session_id`. Same for `get_all_grading_sessions`. |
| Analytics service | ❌ **Incomplete in the same way.** Psychometrics aggregates across the entire blueprint with no run-level filter. (Aggregating *is* the right default for psychometric power, but a per-run lens is needed for cohort comparisons.) |
| Frontend | ❌ **Wrong shape.** `/grading` → `/grading/test/[testId]` jumps straight to "all submissions for the blueprint" with no run-picker in between. Analytics has the same gap. |
| Seed | ❌ **Major contributor.** Every `create_submitted_attempt` and `create_bulk_attempt` call hardcodes `scheduled_session_id=None` (see `backend/seed_e2e.py:483` and `:756`). So even if the backend exposed the link, the dev environment would have nothing to group on. |

This is a **moderate-scope cross-stack change**: ~1 new backend endpoint per surface + 1 service filter param, ~1 new frontend route + small refactor of the existing dashboard to accept a run-filter, plus a seed refit that creates a blueprint with **two** scheduled runs and links submissions appropriately. About a day's work.

**Recommendation: do both. Don't do Stage 2 by patching only the seed —** the day the seed gets re-written for a new feature, the grading view will silently revert to "all submissions across all runs" with no way to disentangle them. The contract belongs in the service.

---

## Stage Index

| # | Stage | Surface |
|---|---|---|
| 1 | Reactive lifecycle transitions on the sessions dashboard | `useCountdown`, new `useNow` + `sessionLifecycle.ts`, `ScheduledSessionsTable`, `/my-exams`, `scheduled_sessions_service` (server-now field) |
| 2 | Per-run grading & analytics drill-ins | `grading_service`, `psychometrics_service`, new `/grading/test/[testId]/run/[runId]` & `/analytics/tests/[testId]/run/[runId]` routes, new run-picker pages, `seed_e2e.py` |

---

## Progress Matrix

| # | Stage | Status | Commits | Visual verification |
|---|---|---|---|---|
| 1 | Reactive lifecycle | ⏳ Planned | — | ⏳ Pending — see acceptance §1.6 |
| 2 | Per-run drill-ins | ⏳ Planned | — | ⏳ Pending — see acceptance §2.7 |

---

## Stage 1 — Reactive Lifecycle Transitions on the Sessions Dashboard

### 1.1 Problem (observed behavior)

On the constructor `/sessions` page:
- A session in the **Ongoing** bucket whose `ends_at` passes does **not** move to **Completed**. Instead, the row stays in Ongoing and the "Ends in" countdown begins counting **up** (e.g. "0s", then "5s", then "1m 12s", increasing).
- A session in the **Scheduled** bucket whose `starts_at` passes does **not** move to Ongoing. The "Starts in" countdown likewise inverts and counts up.
- The misclassification self-heals after up to ~30 seconds, when the existing poll fires and the server-derived status comes back fresh. The countdown bug, however, never self-heals — it only resets on a hard page refresh.

The student `/my-exams` page has the milder version: cards don't flip from "Upcoming" → "Joinable now" until the 30s poll lands. No counting-up bug because there's no countdown there, just badge copy.

### 1.2 Root cause

Three independent issues compound:

1. **`useCountdown` uses `Math.abs(diff)`** — `frontend/src/hooks/useCountdown.ts:23`. When the target passes, the absolute value of the (negative) diff is rendered, which is exactly the count-up behavior the user observed. The hook also has no notion of a transition — callers can't react to "we just crossed zero".
2. **`ScheduledSessionsTable.effectiveStatus` reads `now` from a const captured at render time** (`const now = new Date()` at `ScheduledSessionsTable.tsx:174`). The bucket recomputation only fires when the component re-renders, which happens (a) when the sessions prop changes, or (b) when the 30s poll triggers a refetch. Between those events, `effectiveStatus` keeps returning the *stale* answer even as `useCountdown` ticks every second inside the row.
3. **There is no shared "ticking now" primitive**, so any future page that needs reactive lifecycle derivation will reinvent the same bug. The Epoch 8.4 lesson — derive lifecycle states from *one* source — applies to the *now* input too.

### 1.3 Solution — architecture

Add a small, testable layer between `Date.now()` and the UI:

```
src/lib/sessionLifecycle.ts   ← pure derivation (now, scheduled-session) → status
src/hooks/useNow.ts           ← shared ticking-now (1s default), singleton timer
src/hooks/useCountdown.ts     ← refactored: returns { display, msRemaining, hasElapsed }
src/hooks/useLifecycleSync.ts ← computes next transition, schedules a precise refetch
```

**Why a singleton timer.** Every row currently mounts its own `setInterval(1000)`. On a dashboard with 20 rows that's 20 timers drifting independently. A singleton tick (one `setInterval` exposed via `useSyncExternalStore`) keeps every component on the same second and reduces wakeups by an order of magnitude. This is the standard React 18 pattern for external time sources.

**Why a precise refetch (not a tighter poll).** Polling every 5s burns the backend and still leaves up to 5s of UI lag. Instead: at render time, find the soonest future `starts_at`/`ends_at` across visible sessions and `setTimeout(refetch, msUntilThatMoment + 500)`. The dashboard is then **silently** in sync within ~500ms of any actual transition, with zero polling pressure when no transition is imminent. Keep a 60s heartbeat poll as a safety net (clock drift, sessions canceled elsewhere, missed wake-ups in a backgrounded tab).

**Why also a server-now field.** Client clocks lie. If the user's laptop is 4 minutes ahead of the server, the frontend will flip a session to "Ongoing" four minutes early — and *every* call to that derivation will agree, masking the bug. Returning `server_now: <iso>` in the scheduled-sessions list response lets the frontend compute and apply a one-time `clientSkewMs` correction. Defensive, ~5 lines of backend code, eliminates an entire failure mode.

### 1.4 🤖 For the AI

**File: `frontend/src/lib/sessionLifecycle.ts`** *(new, ~40 lines)*
- Export `type ScheduledLifecycleStatus = 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELED'`.
- Export pure function `deriveScheduledStatus(session: { starts_at: string; ends_at: string; status: string }, now: Date): ScheduledLifecycleStatus`. Mirror the rules in `backend/app/services/scheduled_sessions_service.ensure_scheduled_session_current` exactly: `CANCELED` short-circuits; `now >= ends_at` → `CLOSED`; `now >= starts_at` → `ACTIVE`; else → `SCHEDULED`.
- Export `nextTransitionAt(sessions, now): Date | null` — soonest future `starts_at` or `ends_at` across non-`CANCELED`, non-`CLOSED` rows.
- **No React imports.** Test from `frontend/src/lib/__tests__/sessionLifecycle.test.ts` covering each branch + the "exactly at boundary" tie-breaking case.

**File: `frontend/src/hooks/useNow.ts`** *(new, ~30 lines)*
- Module-level `let listeners = new Set<() => void>()`; one `setInterval` started lazily on first subscribe, cleared on last unsubscribe.
- Export `useNow(intervalMs = 1000): Date` backed by `useSyncExternalStore`. Subscribers re-render at the next tick boundary.
- **No `Date.now()` calls in components from this point forward** — components that need a ticking clock use `useNow`.

**File: `frontend/src/hooks/useCountdown.ts`** *(modify)*
- Change signature to `useCountdown(targetIso: string): { display: string; msRemaining: number; hasElapsed: boolean }`.
- `msRemaining = new Date(targetIso).getTime() - useNow().getTime()`. `hasElapsed = msRemaining <= 0`.
- When `hasElapsed`, `display = '—'` (or `'Just now'`, copy TBD by David; lean toward `'—'` so an elapsed countdown reads as silently retired rather than alarming).
- **Remove `Math.abs`.** Negative values must never reach `formatDuration`.
- Update callers — `frontend/src/components/sessions/ScheduledSessionsTable.tsx:37` is the only consumer; if the new return shape conflicts, either destructure or expose a `useCountdownDisplay` thin wrapper that returns the legacy string for callers that don't need the metadata.

**File: `frontend/src/hooks/useLifecycleSync.ts`** *(new, ~40 lines)*
- Export `useLifecycleSync(sessions, refetch)`. Effect deps: `sessions`. Computes `nextTransitionAt(sessions, new Date())`; if non-null, `setTimeout(refetch, ms + 500)`. Cleans up the timeout on dep change/unmount. Independently sets up a 60s safety-poll interval. **Do not over-trigger:** if `refetch` is called and `sessions` changes within 500ms, debounce so we don't fire two refetches back-to-back.

**File: `frontend/src/components/sessions/ScheduledSessionsTable.tsx`** *(modify)*
- Replace `const now = new Date()` with `const now = useNow(1000)`. Replace local `effectiveStatus` with `deriveScheduledStatus(session, now)`.
- Replace the existing 30s poll effect with `useLifecycleSync(sessions, fetchScheduledSessions)`.
- The row-level "Ends in" / "Starts in" cell renders the new `useCountdown(...).display` directly; when `hasElapsed`, the row will have already moved to a different bucket on the same tick (because the parent re-rendered too — singleton `useNow` ticked all subscribers atomically), so the countdown only renders when meaningful.

**File: `frontend/src/app/my-exams/page.tsx`** *(modify)*
- Replace the 30s poll with `useLifecycleSync(sessions, fetchSessions)`. Same primitive, same behavior — Joinable-now flips at the actual `starts_at`, not "up to 30s later".
- `StudentExamCard` doesn't need a countdown today; if a countdown is added in a future stage, it will inherit the fixed hook for free.

**File: `frontend/src/components/student/StudentExamCard.tsx`** *(modify)*
- Replace `new Date()` inline comparisons (`StudentExamCard.tsx:57`, `:66`) with `useNow(60_000)` (1-minute resolution is plenty for "is this start in the past or future" copy — we don't need 1s precision for "Mar 12, 14:30" vs. "2 minutes ago").

**File: `backend/app/schemas/scheduled_session.py`** *(modify)*
- Add `server_now: datetime` to the list response wrapper. (If the current shape is `List[ScheduledSessionResponse]`, switch the list endpoint to a `{sessions: [...], server_now: ...}` envelope; the student endpoint should do the same. This is a breaking response shape change — update both the constructor store (`useSessionManagerStore`) and student store (`useStudentSessionsStore`) in the same commit.)

**File: `backend/app/services/scheduled_sessions_service.py`** *(modify)*
- Have `list_scheduled_sessions` and `list_student_scheduled_sessions` return `{"sessions": [...], "server_now": datetime.now(timezone.utc).isoformat()}`.

**File: stores** *(modify)*
- `useSessionManagerStore` and `useStudentSessionsStore` compute and store `clientSkewMs = server_now - client_now_at_response_time` on each fetch. Export `useServerNow()` → `useNow().getTime() + clientSkewMs`. All callers of `useNow` in lifecycle contexts switch to `useServerNow`. (Pure display callers — relative-time strings — can stay on `useNow`; the skew correction is only critical for status derivation.)

### 1.5 Files touched (summary)

| File | Change |
|---|---|
| `frontend/src/lib/sessionLifecycle.ts` | New |
| `frontend/src/lib/__tests__/sessionLifecycle.test.ts` | New |
| `frontend/src/hooks/useNow.ts` | New |
| `frontend/src/hooks/useLifecycleSync.ts` | New |
| `frontend/src/hooks/useCountdown.ts` | Refactor (return shape change) |
| `frontend/src/components/sessions/ScheduledSessionsTable.tsx` | Use shared primitives |
| `frontend/src/app/my-exams/page.tsx` | Use `useLifecycleSync` |
| `frontend/src/components/student/StudentExamCard.tsx` | Use `useNow` |
| `frontend/src/stores/useSessionManagerStore.ts` | Store `server_now`, expose skew |
| `frontend/src/stores/useStudentSessionsStore.ts` | Same |
| `backend/app/schemas/scheduled_session.py` | Add envelope with `server_now` |
| `backend/app/services/scheduled_sessions_service.py` | Return envelope |

### 1.6 Acceptance criteria

1. Open `/sessions` after running the seed. Within the next 60 seconds, watch a row in **Ongoing** whose `ends_at` is about to pass. **At the exact second `ends_at` crosses**, the row moves to **Completed** and the "Ends in" cell vanishes (or shows `—`). Verified visually with the developer tools clock open.
2. Same procedure for a **Scheduled** → **Ongoing** transition.
3. Hard-refresh the page. The bucket placement matches what the backend reports — no flicker, no momentary misplacement.
4. Open `/my-exams` as a student. A card with `starts_at` 30 seconds in the future flips from "Upcoming" to "Joinable now" within 1s of `starts_at`.
5. **Clock-skew defense:** set the OS clock 5 minutes ahead, reload `/sessions`. Bucket placement still matches the backend (skew correction works). Reset clock.
6. The audit grep `grep -rE "new Date\(\)" frontend/src/components/sessions frontend/src/components/student` returns zero hits (all lifecycle-relevant `new Date()` calls have moved to `useServerNow`/`useNow`).
7. Existing 8.5 work is unaffected: visual verification passes for `dark` / `warm` / `light-blue` across `/sessions` and `/my-exams`.

### 1.7 Out of scope (explicit non-goals)

- Real-time pushes (SSE/WebSockets). The polling-plus-precise-wakeup pattern is sufficient at our scale; revisit if we have >100 concurrent constructors.
- Backend reconciliation of stale `ACTIVE` rows for sessions whose `ends_at` passed without a list-call being made. The existing `ensure_scheduled_session_current` on every list call covers all observable paths; do not add a background reconciliation job.

---

## Stage 2 — Per-Run Grading & Analytics Drill-Ins

### 2.1 Problem (observed behavior)

David: *"Lets say I have assigned one blueprint #1 to session #2 and session #3 — when I go into grading that specific blueprint I want to be able to choose which session I will be grading, and I only want to actually enter into sessions that have concluded since I don't want to be grading ongoing nor scheduled session, nor blueprints that haven't even been scheduled. Same principle for the analytics."*

Today:
- `/grading` lists *blueprints*. Clicking a blueprint goes to `/grading/test/[testId]` which lists every submitted attempt across **every** run of that blueprint, mashed together with no way to tell which scheduled window any submission came from.
- `/analytics` is the same: blueprint cards → blueprint-wide aggregate. No way to view "just last Tuesday's cohort".
- There's no gate on whether the scheduled window has actually closed before you can grade it. (Submitted attempts from an ongoing window are technically gradable, but mixing them with practice attempts in one undifferentiated list is the visible symptom.)

### 2.2 Root cause

Per Stage 0's verdict table:
- **Data model has the FK** (`exam_sessions.scheduled_session_id`) but **services don't surface or filter on it**. `get_grading_overview` and `get_all_grading_sessions` join through `exam_sessions` but project zero scheduled-session fields. `psychometrics_service` aggregates over all sessions for a `test_definition_id` with no run filter.
- **Frontend's IA jumps a level.** There's no intermediate "which run of this blueprint?" page. The in-flight 8.5-Stage-9 reversal (working tree at the time of this writing) restored the blueprint → per-blueprint-submissions flow but didn't insert the run-picker step. This Stage finishes that direction the right way.
- **The seed sets `scheduled_session_id=None` on every demo submission** (`seed_e2e.py:483`, `:756`), so even after fixing services + adding the route, the dev environment wouldn't have a multi-run blueprint to demonstrate the split on.

### 2.3 Solution — architecture

Two parallel additions, one to grading, one to analytics. They share the same shape: insert a **runs picker** between the blueprint page and the existing per-blueprint dashboard, and add a `run_id` filter to the dashboard services.

```
Today:    /grading          → /grading/test/[testId]
                                    (all submissions across all runs, mashed)

Tomorrow: /grading          → /grading/test/[testId]
                                    (run picker — closed scheduled runs + Practice bucket)
                              → /grading/test/[testId]/run/[runId]
                                    (existing dashboard, filtered to this run)
```

Where `runId` is either a scheduled-session UUID or the literal string `practice`.

**Why an intermediate page, not a dropdown.** A dropdown buries the information. Per `CLAUDE.md` §8.4's eyebrow rule and §7.3's primitive-first principle, the run-list page is the right surface — it states "this blueprint ran on these days, here's the grading load per day". Each row links directly into the existing grading dashboard, scoped. Bookmarkable, shareable, role-aware.

**Why only closed runs in the grading picker.** Same psychometric reason as the existing "no grading until submitted" rule: marking an in-flight cohort encourages mid-flight comparisons that bias subsequent grading. Surface ongoing/scheduled runs in the picker with disabled "Grade" affordance + tooltip explaining when they'll unlock ("Available after Mar 12, 14:30") rather than hiding them — the constructor still wants situational awareness.

**Why analytics still defaults to "all runs combined".** Reliability (Cronbach's α), SEM, and discrimination indices need sample size. Splitting by run halves the data points. The combined view is the right default; the per-run lens is an explicit drill-in. Analytics picker presents both: a "Combined (recommended)" card pinned on top + one card per run below.

### 2.4 🤖 For the AI — backend

**File: `backend/app/services/grading_service.py` (or `results_service.py` — wherever the existing functions live)** *(modify + add)*
- Add new function `get_grading_runs(test_definition_id: str, requester) -> List[Dict]` returning per-scheduled-session grading aggregates:
  ```python
  [
    {
      "run_id": "<uuid>",             # scheduled_session_id
      "kind": "ASSIGNED",              # or "PRACTICE" for the synthetic bucket
      "course_id": "<uuid>",
      "course_code": "MATH-140",
      "course_title": "Quantitative Reasoning Studio",
      "starts_at": "...",
      "ends_at": "...",
      "lifecycle_status": "CLOSED",    # derived server-side from now vs. window
      "submissions_total": 12,
      "submissions_graded": 8,
      "ungraded_response_count": 11,
      "is_gradable": True              # lifecycle_status == "CLOSED" or "CANCELED"
    },
    ...,
    { "run_id": "practice", "kind": "PRACTICE", "submissions_total": 4, "ungraded_response_count": 0, "is_gradable": True, ... }
  ]
  ```
  Sort: closed runs by `ends_at` desc, then ongoing, then scheduled, then practice last.
- Modify `get_grading_overview(test_definition_id, scheduled_session_id: Optional[str] = None)` — when `scheduled_session_id` is `None`, behavior unchanged (back-compat); when set to a UUID, filter `exam_sessions` to that one run; when set to the sentinel `"practice"`, filter to `scheduled_session_id IS NULL AND session_mode='PRACTICE'`.
- Modify `get_all_grading_sessions` to include `scheduled_session_id` and `course_code` in each row payload (cheap join, frontend benefits even without using the run picker).

**File: `backend/app/api/endpoints/grading.py`** *(modify + add)*
- New endpoint `GET /grading/tests/{test_definition_id}/runs` → `_require_instructor_or_admin` + `_require_test_access` (port the access check from analytics — see `analytics.py:41`). Returns the list from `get_grading_runs`.
- Modify `GET /grading/tests/{test_definition_id}/grading-overview` to accept optional `?run_id=<uuid|practice>` query and pass it through.
- Modify `GET /grading/tests/{test_definition_id}/grading-queue` to accept the same `?run_id=` filter for symmetry — grading a closed run's essays should not pull in essays from an ongoing run.

**File: `backend/app/services/psychometrics_service.py`** *(modify)*
- Audit every function called by the analytics dashboard for a `test_definition_id` parameter (e.g. `compute_test_item_stats`, `compute_test_stats`, `compute_dashboard`, `compute_section_analytics`, `get_latest_test_analytics_bundle`). Add an optional `scheduled_session_id: Optional[str] = None` parameter — `None` preserves today's all-runs aggregate, a UUID filters the underlying `exam_sessions` query to that run.
- `recompute_test_analytics_bundle` likewise — the persisted bundle should record which `scheduled_session_id` it was scoped to (or `None` for combined) so we can cache per-run bundles separately.
- New function `list_analytics_runs(test_definition_id, requester)` — same shape as `get_grading_runs` above, sorted the same way. Lifecycle gating is *advisory* for analytics (a run with zero submissions is still listed but flagged "No data yet").

**File: `backend/app/api/endpoints/analytics.py`** *(modify + add)*
- New endpoint `GET /analytics/tests/{test_definition_id}/runs` analogous to grading's.
- Modify every existing `/analytics/tests/{test_definition_id}/*` endpoint to accept `?run_id=<uuid|combined>` and pass through. `combined` is the default sentinel.

**Security audit (mandatory before merge):**
- An instructor for blueprint A passing a `run_id` from blueprint B must get `404` (or `403`), not silently filtered results. Add the check to `get_grading_runs` and `list_analytics_runs`: every returned `scheduled_session_id` belongs to the requested `test_definition_id`, and every filtered query verifies the same on the way in. Test case mandatory in the per-endpoint test file.

### 2.5 🤖 For the AI — frontend

**Route restructure** (assumes the WIP from Stage 0's note is committed first; if it isn't, commit those files unchanged as the baseline):
- Move existing `frontend/src/app/grading/test/[testId]/page.tsx` content into a new file `frontend/src/app/grading/test/[testId]/run/[runId]/page.tsx`. Read `runId` from params; pass into `useGradingStore.fetchGradingOverview(testId, runId)`. The `runId` value `practice` translates to the practice-bucket filter; any UUID maps to that run.
- Replace `frontend/src/app/grading/test/[testId]/page.tsx` with a new **runs picker** component:
  - Fetches `GET /grading/tests/[testId]/runs`.
  - Renders one `<Card variant="surface" padding="md" interactive>` per run (use existing card primitive — see `CLAUDE.md` §7.3).
  - Each card shows: course code + title, scheduled window (use `formatScheduled` from `@/lib/relativeTime`), lifecycle badge (use `<Badge tone="…">`, tones mapped per §7.9 vocabulary), submission counts, "Grade →" button.
  - Disabled state for `lifecycle_status !== 'CLOSED' && lifecycle_status !== 'CANCELED'` rows with tooltip "Available after {formatScheduled(ends_at)}".
  - `EmptyState` (existing primitive) when there are no runs: `title="No runs to grade yet"`, `description="Schedule this blueprint and let a session close before students' work appears here."`
  - `BackButton href="/grading" label="All blueprints"` at the top (existing primitive — see §8.4 canon).

**Analytics route restructure (mirror):**
- Move `frontend/src/app/analytics/tests/[testId]/page.tsx` content into `frontend/src/app/analytics/tests/[testId]/run/[runId]/page.tsx`. `runId` may be `combined` or a UUID.
- New `frontend/src/app/analytics/tests/[testId]/page.tsx` is the runs picker. Pin one "Combined (recommended)" card at the top, then one card per run with submission count + `lifecycle_status` badge. No disabling — every run is a valid analytics target (zero-data runs render with a neutral "No data yet" message inside the card).

**Stores:**
- `useGradingStore`: add `fetchGradingRuns(testId)`, store the result keyed by `testId`. Modify `fetchGradingOverview` to take an optional `runId`. Cache key for overview becomes `(testId, runId)`.
- `useAnalyticsStore`: same shape. Bundle cache key becomes `(testId, runId)`. The existing `bundles[testId]` becomes `bundles[`${testId}:${runId}`]`. **Migration note:** Any consumer reading `bundles[testId]` directly needs to switch to `bundles[`${testId}:combined`]`.

**Lifecycle alignment:**
- The runs picker derives each run's `lifecycle_status` server-side — frontend should *also* run it through `deriveScheduledStatus` (Stage 1 primitive) using `useServerNow()`. If the two answers disagree, prefer the client-derived one (it's based on a fresher `now`), but log a warning to the console for debugging. This keeps Stage 1 and Stage 2 honest with each other.

**No new color tokens** for run/lifecycle states — reuse the existing `--color-success-*` (CLOSED/gradable), `--color-warning-*` (ONGOING/locked), `--color-info-*` (SCHEDULED/upcoming), `--color-danger-*` (CANCELED) families per §7.1 token discipline.

### 2.6 🤖 For the AI — seed

**File: `backend/seed_e2e.py`** *(modify)*
- Pick one blueprint that is used to demonstrate the per-run UX. Recommendation: `"Shuffle Lab: Numbers in Motion"` (already has three submitted attempts in the current seed).
- Create **two** scheduled sessions for that blueprint, both in the **past** so they're firmly `CLOSED`:
  - Run A: course `MATH-140`, `starts_at = now - 3 days`, `ends_at = now - 3 days + 2h`.
  - Run B: course `XLAB-200`, `starts_at = now - 1 day`, `ends_at = now - 1 day + 2h`.
- Split the existing three `create_submitted_attempt` calls: two attempts linked to Run A's `scheduled_session_id`, one linked to Run B's, plus one additional **practice** attempt (set `scheduled_session_id=None`, `session_mode=ExamSessionMode.PRACTICE`) so the Practice bucket isn't empty in dev.
- For analytics demo data, ensure the bulk-attempt cohort spans **both** runs proportionally (e.g. 60% Run A, 40% Run B) so the per-run analytics picker has differentiated numbers to display, not identical clones.
- **Do not change `create_submitted_attempt`'s signature gratuitously** — add an optional `scheduled_session_id: Optional[UUID] = None` parameter at the end, defaulting to today's behavior. Same for `create_bulk_attempt`.
- Keep the existing 2-minute live windows (`-45s`, `-15s`, `+60s`, `+120s`) — those are **Stage 1's** demo fixture and must continue to flip in real time.

### 2.7 Acceptance criteria

1. Run `./dev-up.sh --seed`. Navigate to `/grading`. Click "Shuffle Lab: Numbers in Motion". The runs picker shows **two enabled "Grade →" cards** (Run A on MATH-140, Run B on XLAB-200) and one Practice bucket. Each enabled card surfaces a non-zero submission count.
2. Click into Run A. The grading dashboard shows only Run A's submissions (two attempts). The blueprint title is still in the page header, with the course code visible as eyebrow / subtitle context.
3. Backend permission test: a constructor who didn't create the blueprint hits `GET /grading/tests/{id}/runs` and gets `403`. Documented in `backend/tests/test_grading_runs.py`.
4. Backend filter test: passing a `run_id` from a different blueprint to `/grading/tests/{id}/grading-overview?run_id=<other-run>` returns `404` or `403` (not silently filtered results). Documented in the same test file.
5. `/analytics` → "Shuffle Lab: Numbers in Motion" shows: pinned "Combined" card on top + Run A + Run B cards below. Clicking each opens the existing analytics dashboard scoped to that run. The "Combined" path is byte-identical to today's `/analytics/tests/[testId]` dashboard.
6. The Stage 1 timer behavior on `/sessions` is unchanged by this Stage's work (no regression). Verify by repeating Stage 1's acceptance §1.6.1–§1.6.4.
7. **Visual verification across `dark` / `warm` / `light-blue`** of both runs pickers per §7.12. New surfaces; need explicit theme proof.

### 2.8 Out of scope (explicit non-goals)

- Cross-run grade publication ("publish results for Run A but not Run B"). The current admin "Publish results" button operates on the whole test_definition. Splitting publication by run is a clean follow-up but doubles the publication workflow's mental model; defer until a constructor actually asks for it.
- "All runs combined" view *in grading*. Grading is per-submission; the existing combined dashboard at the old route is semantically the same as "grade every closed run sequentially". If the constructor wants one big grading queue, the unchanged `/grading` blueprint cards already aggregate ungraded counts across runs.
- CSV export filtered to a single run. The current export operates on the whole test_definition. Adding `?run_id=` to the export endpoint is trivial *once needed*; defer until requested.

---

## Cross-cutting requirements (apply to both stages)

- **Token discipline (§7.1):** any new component code must pass the widened audit grep before merge.
- **Primitive reuse (§7.3):** runs picker uses `Card`, `Badge`, `Button`, `EmptyState`, `BackButton`, `Spinner`. No new ad-hoc list components.
- **Date formatting (§7.11):** all timestamps in the runs picker go through `formatScheduled` / `formatAbsolute` / `formatRelativeTime`. No `.toLocaleString()` calls.
- **Lifecycle vocabulary (§7.9):** the runs picker uses `Scheduled` / `Ongoing` / `Completed` / `Canceled` labels exactly. The new pure-derivation helper returns the canonical `ACTIVE`/`SCHEDULED`/`CLOSED`/`CANCELED` enum; the UI maps that to the display labels.
- **Tests (§5):** every new endpoint gets at minimum one happy-path test + one cross-tenant (security) test. The new `sessionLifecycle.ts` gets a unit test per branch.
- **Conventional commits with `feat(8.6):` / `fix(8.6):` / `test(8.6):` scopes.**
- **Aikido scan must pass with zero Critical/High before merge to `main`.**

---

## Open questions to resolve before Stage 2 implementation

1. **Display copy when a countdown has elapsed.** Stage 1 §1.4 currently proposes `—`. Alternative: `"Just ended"` (Ongoing → Completed transition only) and `"Starting now"` (Scheduled → Ongoing). David's call.
2. **Practice bucket label in the grading runs picker.** Options: "Practice attempts", "Practice mode", "Ungated practice". Default to "Practice attempts" unless objected.
3. **Should the analytics "Combined" card be pinned to the top, or should the most recent run be the default?** This is a UX preference; the recommendation here is "Combined pinned" because it's the most psychometrically meaningful default, but a constructor whose workflow is "look at the latest cohort first" might disagree.

These do not block planning. Resolve when Stage 2 implementation begins.
