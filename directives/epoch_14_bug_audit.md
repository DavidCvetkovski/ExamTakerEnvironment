# OpenVision — Bug, UX & Ambiguity Audit (Epoch 14)

> Compiled from a full read of the Epoch 14 diff, plus a second deep pass over
> grading, student portal, analytics, proctoring hooks, and the schema.
> Issues are ordered by severity within each category. Every finding quotes the
> relevant code path so findings are self-contained and actionable.
>
> Pause and extend have been removed from the codebase — all findings that depended
> on those features have been dropped from this document.

---

## Verification pass (added) — every finding tested

Each finding below was re-checked against the live code and pinned with a test.
Verdicts are inline under each entry (search "VERIFIED REAL", "DISPROVEN",
"LATENT", "OVERTAKEN"). Tests:
- **Backend** — `backend/tests/test_epoch14_audit.py` (run with the dev DB +
  Redis). Real bugs assert the *intended* behaviour with
  `@pytest.mark.xfail(strict=True)` → an **xfail** confirms the bug; an unexpected
  **XPASS** would flag a non-bug.
- **Frontend** — `frontend/tests/epoch14_audit.test.mjs` (`node --test`, no new
  deps). Source assertions + exact logic ports with edge cases.

Latest run: backend **10 passed / 4 xfailed**, frontend **43 passed**. All 50
findings carry an inline verdict.

| Finding | Verdict | Finding | Verdict |
|---|---|---|---|
| C-1 accommodation clip | ✅ Real | M-3 review-proctoring always shown | ✅ Real |
| C-2 fullscreen inert | ✅ Real | M-4 offline queue not cleared | ✅ Real (fix caveat) |
| C-3 refresh-as-access token | ✅ Real → **Critical** | M-5 incident detail stripped | ✅ Real (legacy-data) |
| H-1 blank timer first render | ✅ Real | M-6 my-grades refresh spinner | ✅ Real |
| H-2 timer tab-switch resync | ❌ **Disproven** | M-7 missing grade index | ✅ Real |
| H-3 sendBeacon URL prefix | ⚠️ Real (conditional) | M-8 grading not atomic | ✅ Real (transient) |
| H-4 resume resets to Q1 | ✅ Real | M-9 autoclaim cursor | ✅ Real (low impact) |
| H-5 in-progress vanishes | ✅ Real | M-10 MCQ plain vs HTML | ✅ Real (+MultiResp) |
| H-6 review counts don't sum | ✅ Real | M-11 grading header z-10 | ✅ Real |
| H-7 double-click submit | ✅ Real | M-12 graded indicator | ✅ Real (fix caveat) |
| H-8 img tracking pixels | ✅ Real → security | M-13 no prev/next grading | ✅ Real |
| H-9 parallel-refresh logout | ❌ **Disproven** → optional | M-14 bulk enroll no count | ✅ Real |
| H-10 grades no ownership | ✅ Real → **Critical** | M-15 no window-close time | ✅ Real |
| L-1 exam header z-10 | ✅ Real | L-6 completed collapsed | ✅ Real |
| L-1 (cont.) | | L-10 nav startsWith | ⚠️ Latent |
| L-2 account back href | ✅ Real | L-11 no resume bucket | ✅ Real |
| L-3 role fallback | ✅ Real | L-12 SEB button label | ✅ Real (copy) |
| L-4 accommodation visibility | ✅ Valid (suggestion) | L-14 return label default | ✅ Real (latent) |
| L-5 low-time string-prefix | ⚠️ **Not active bug**, latent | L-15 answered truthiness | ⚠️ Latent |
| L-7 monitor auto-review | ✅ Valid (suggestion) | L-16 ⏳ emoji | ✅ Real (×2) |
| L-8 severity legend | ✅ Valid (suggestion) | L-17 grading no refresh | ✅ Real |
| L-9 SEB download SCHEDULED | ✅ Real | L-18 client-clock default | ✅ Real |
| L-19 roster-locked copy | ⚠️ **Overtaken** (refactored) | S-1 monitor countdown | ✅ Valid (suggestion) |
| S-2 multiplier on roster | ✅ Valid (suggestion) | S-4 beforeunload prompt | ✅ Real |
| S-5 pendingEvents cleared early | ✅ Real (low reach) | | |

**Headline corrections to the original audit:**
1. **H-9 and H-2 are not bugs** in this codebase (no token rotation; absolute-time
   timer). Downgraded with disproof tests.
2. **C-3 and H-10 are effectively Critical** (auth-scope escalation; cross-tenant
   student-answer disclosure), not High — flagged for the §1 security-review gate.
3. **M-12's proposed fix would break** (`points_awarded` is non-nullable, default
   `0.0`) and **M-4's `finally` fix would discard answers** on transient failures —
   both corrected inline.
4. **L-5 doesn't currently miscolor** anything (formatter emits `0m 59s`); it's a
   latent fragility, not an active bug.
5. Several findings under-scope the fix: **M-10** also affects MultipleResponse,
   **L-16** has two emoji, **L-15/H-6** share one truthiness root.

---

## Critical Bugs

### C-1 · Accommodation students can be silently short-changed on time

**File:** `backend/app/services/exam_sessions_service.py:474–476`

```python
now = datetime.now(timezone.utc)
individual_expiry = now + timedelta(minutes=duration_minutes)
expires_at = min(individual_expiry, ensure_utc(scheduled.ends_at))  # ← hard cap
```

A student with a 1.5× multiplier on a 60-minute test is entitled to 90 minutes.
If the scheduled window is only 70 minutes wide and the student joins 15 minutes
after it opens, their `individual_expiry` = 90 min from join, but `ends_at` is
only 55 minutes away, so they silently get 55 minutes instead of 90.

There is no warning to the student, no warning to the supervisor, and no record
that the accommodation could not be honoured. The student simply gets less time
than their accommodation grants.

**Fix:** Record a proctoring incident (e.g., a new `ACCOMMODATION_CLIPPED` type)
when `individual_expiry > ends_at` so the supervisor is aware. The scheduled
session creation flow should also warn the constructor if the window is too narrow
to honour the highest configured accommodation multiplier.

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py`
- `test_c1_clipping_is_real` (PASSED): a 1.5× student (entitled 90 min) joining a
  window with only ~30 min left is granted ~30 min, not 90 — the clip is real and
  silent.
- `test_c1_clip_records_incident` (XFAIL): after the clipped join, zero
  `proctoring_incidents` rows exist for the session — nothing records that the
  accommodation could not be honoured.

**Fix detail (implementation sketch):** In `join_scheduled_exam_session`
(`exam_sessions_service.py:474–476`), after computing `expires_at`:
```python
if individual_expiry > ensure_utc(scheduled.ends_at):
    clipped_minutes = int((individual_expiry - ensure_utc(scheduled.ends_at)).total_seconds() // 60)
    await record_incident(
        scheduled_session_id=str(scheduled.id),
        exam_session_id=str(created["id"]),
        student_id=str(current_user.id),
        incident_type=ProctoringIncidentType.ACCOMMODATION_CLIPPED,  # new enum value
        severity=ProctoringSeverity.WARNING,
        source=ProctoringIncidentSource.SYSTEM,
        detail={"entitled_minutes": duration_minutes, "granted_minutes": ...,
                "clipped_minutes": clipped_minutes},
    )
```
Add `ACCOMMODATION_CLIPPED` to the `proctoringincidenttype` enum (Prisma schema +
`prisma db push`) and emit the incident *after* `create_exam_session_record` so the
`exam_session_id` FK is valid. Constructor-side warning (narrow window vs. highest
multiplier) is a separate, lower-priority follow-up.

---

## High-Severity Bugs / Gaps

### H-1 · Empty timer display on first render

**File:** `frontend/src/app/exam/[id]/page.tsx:44, 244–255`

```typescript
const [timeLeft, setTimeLeft] = useState<string>('');  // starts empty
```

The first `setInterval` tick fires 1 second after mount. For that entire second
the time remaining display shows nothing. On a slow connection where the session
fetch takes additional time this blank state can last several seconds — the student
has no idea if the exam has loaded.

**Fix:** Compute the initial value synchronously once `currentSession` is set,
either in a `useMemo` or by setting state immediately inside the fetch callback
before the interval is registered.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::H-1`
- Source assertion (PASS): `timeLeft` is `useState<string>('')` and the only
  `setTimeLeft(...)` calls live *inside* the `setInterval` body — none runs
  synchronously before the interval registers. So the first painted value is the
  empty string until the first 1 s tick (longer if the session fetch is slow).

**Cleanest fix:** derive the display with `useMemo`/a helper from
`currentSession.expires_at` and seed `timeLeft` with it, so the very first render
already shows a value; the interval then just keeps it ticking. (Same
`formatTimeLeft(expires, now)` helper noted under H-2 — extract it once and reuse.)

---

### H-2 · ~~Timer does not resync with server after tab-switch~~ → ❌ NOT REAL

**File:** `frontend/src/app/exam/[id]/page.tsx:84–120`

**❌ DISPROVEN** — `frontend/tests/epoch14_audit.test.mjs::H-2`

The premise ("background throttling makes the displayed time stale / drifted") is
false. The timer does **not** decrement a local counter — every tick recomputes
`diff = expires_at − Date.now()` from the **absolute** server timestamp against the
**live wall clock** (page.tsx:88–94). Consequences:

- `H-2 [NOT REAL]` (PASS): porting the exact per-tick computation, the output is a
  pure function of `(expires_at, now)`. After a simulated 7-minute throttle gap the
  next tick shows the true remaining time with **zero accumulated drift** — it
  self-corrects within 1 s of the tab regaining focus.
- `expires_at` is **immutable after join** (pause/extend were removed this epoch —
  see the doc preamble), so "re-fetch the authoritative `expires_at`" would return
  the identical value already held locally. There is nothing fresher to sync.

The only residual is a ≤1 s window where the last pre-hide frame is shown before
the next tick repaints — cosmetic, sub-second, and already covered by the H-1 fix
(seed the value synchronously). No `visibilitychange` re-fetch is warranted.
Removed from the actionable list.

---

### H-3 · `sendBeacon` URL construction silently drops the API prefix on tab close

**File:** `frontend/src/hooks/useHeartbeat.ts:63–68`

```typescript
const heartbeatUrl = new URL(
    `sessions/${sessionId}/heartbeat`,
    api.defaults.baseURL ?? window.location.origin
).toString();
```

`new URL(relPath, base)` only merges correctly when `base` ends with a trailing
slash. If `api.defaults.baseURL` is `http://api/v1` (no trailing slash), `new URL`
resolves to `http://api/sessions/...`, silently dropping `/v1/`. The beacon fires
but hits a 404 — the student's last batch of answers is lost on tab close with no
error surfaced anywhere.

**Fix:** Use string interpolation: `` `${api.defaults.baseURL}/sessions/${sessionId}/heartbeat` ``
or guarantee the baseURL always ends with `/`.

**⚠️ VERIFIED REAL (conditional / latent)** — `frontend/tests/epoch14_audit.test.mjs::H-3`
- `H-3 [REAL, conditional]` (PASS): with the **default** base (`http://127.0.0.1:8000/api/`,
  trailing slash) the URL is correct — so the bug is **dormant in dev**. With a base
  that has **no trailing slash** (`https://x/api` → `https://x/sessions/â€¦`, or
  `https://x/api/v1` → `https://x/api/sessions/â€¦`) `new URL` replaces the last
  segment and the prefix is silently dropped → the beacon 404s and the last answer
  batch is lost on tab close.
- `H-3 fix` (PASS): the interpolation fix (with a `replace(/\/$/, '')` guard)
  preserves the prefix for every base shape.

**Why it still matters:** `NEXT_PUBLIC_API_BASE_URL` is a deploy-time env var
(api.ts:4). A prod deployment that sets it without a trailing slash — a very common
mistake — silently breaks unload-time answer recovery, and nothing surfaces the
404. The fix is cheap insurance; recommend also normalising the base once at the
`axios.create` call so every consumer is safe. Use the `.replace(/\/$/, '')` form,
not bare interpolation (a double slash `//sessions` can also 404 behind some proxies).

---

## Medium Issues

### M-1 · Monitor page shows no context about the session being watched

**File:** `frontend/src/app/sessions/[scheduledId]/monitor/page.tsx:158–169`

```tsx
<PageHeader
    title={isReview ? 'Exam review' : 'Exam monitor'}
    subtitle={isReview ? 'Recorded proctoring data...' : 'Live status...'}
/>
```

The page header says "Exam monitor" with no course name, test name, or scheduled
time window. A supervisor with multiple tabs open cannot tell which session they
are looking at without navigating back.

**Fix:** Fetch (or pass from the router) the scheduled session's `course_title`
and `test_title` — both are already in `useSessionManagerStore` — and include them
as the subtitle or a secondary eyebrow line.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-1` (PASS): the
`<PageHeader>` title/subtitle are static strings; no `course_title`/`test_title`/
`course_code` anywhere in the header region.

---

### M-2 · Canceling a live session shows no stronger confirmation

**File:** `frontend/src/components/sessions/ScheduledSessionsTable.tsx:53`,
`backend/app/services/scheduled_sessions_service.py:197–210`

```typescript
const canCancel = session.status !== 'CLOSED' && session.status !== 'CANCELED';
```

"Cancel session" is shown for ACTIVE sessions (students may currently be sitting
the exam). The backend permits this, but the frontend shows the same generic
confirm dialog whether the session is future-scheduled or live. There is no
warning that in-progress attempts will not be force-submitted.

**Fix:** When `deriveScheduledStatus(session, now) === 'ACTIVE'`, show a
`useConfirm` dialog with an explicit consequence message: "This session has
students actively taking the exam. Canceling now will not force-submit their
attempts — their work will be lost."

**✅ VERIFIED REAL (with a caveat)** — `frontend/tests/epoch14_audit.test.mjs::M-2` (PASS):
`handleRequestCancel` uses one static message regardless of status — no
`deriveScheduledStatus`/`ACTIVE` branch. **Caveat:** the existing copy *does*
already say *"Already active attempts are unaffected."*, so it's not the total
absence the finding implies — but that line is arguably *wrong/confusing* for a
live session (the attempts are very much affected once the window is gone). Lower
the severity to a copy-accuracy fix, but it's real. Reconcile with L-19 (window vs
attempt wording) and §7.10 confirm-dialog rules in the same edit.

---

### M-3 · "Review proctoring" shown for sessions that had no proctoring

**File:** `frontend/src/components/sessions/ScheduledSessionsTable.tsx:88–90`

```tsx
{ label: 'Review proctoring', onClick: () => router.push(`/sessions/${session.id}/monitor?mode=review`) }
```

This menu item appears for every completed session regardless of whether the
session's test definition had `proctoring_config` set. Clicking it on an
un-proctored session leads to a blank incident feed, which reads as either "the
data failed to load" or "something bad happened but wasn't recorded."

**Fix:** Expose a `has_proctoring` boolean on the `ScheduledSession` type (derived
from whether `proctoring_config` is non-null) and only render the menu item when
it is true.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-3` (PASS): the
"Review proctoring" item is gated only on `showReview`; the table source contains
no `has_proctoring`/`proctoring_config` check. Needs a backend field on the
session payload to derive `has_proctoring` (small schema-serialisation touch).

---

### M-4 · Offline heartbeat queue not cleared on drain failure

**File:** `frontend/src/stores/useExamStore.ts:329–352`

```typescript
const key = `openvision_heartbeat_queue_${sessionId}`;
const stored = localStorage.getItem(key);
if (stored) {
    await api.post(`/sessions/${sessionId}/heartbeat`, { events: queued });
    localStorage.removeItem(key);  // only runs on success
}
```

`localStorage.removeItem` only runs when the POST succeeds. If the drain returns a
403 (e.g., a different student logs in on the same device and the session is not
theirs) the error is swallowed and the queue stays. On every subsequent
`loadSavedAnswers` call it fires again and again, returning 403 indefinitely and
never clearing itself.

**Fix:** Move `localStorage.removeItem(key)` to a `finally` block so the queue is
cleared regardless of outcome. Stale queues for sessions the user no longer owns
should not persist.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-4` (PASS): in
`loadSavedAnswers`, `removeItem(key)` sits in the success path *after* the awaited
POST; the `catch` block clears nothing and there is no `finally`. A 403/404 drain
leaves the queue to re-POST (and re-fail) on every subsequent load.

**⚠️ Correction to the proposed fix — do NOT use a bare `finally`.** The queue's
whole purpose is to survive *transient* failures (offline tab-close → reopen). A
`finally` that clears unconditionally would **discard the student's recovered
answers** the moment a flaky network call fails — the opposite of the intent. Clear
the queue only on **success** or on a **definitive 4xx** (`403`/`404` — the session
isn't theirs / doesn't exist), and **keep** it on network errors / `5xx`:
```ts
try {
  await api.post(`/sessions/${sessionId}/heartbeat`, { events: queued });
  localStorage.removeItem(key);                 // success
} catch (err) {
  const s = err?.response?.status;
  if (s === 403 || s === 404) localStorage.removeItem(key);  // not ours → drop
  // else: transient → KEEP and retry next load
}
```

---

### M-5 · Incident detail silently stripped when stored as a string

**File:** `backend/app/services/proctoring/monitor_service.py:113`

```python
detail = r.detail if isinstance(r.detail, dict) else {}
```

If `r.detail` is a raw JSON string (written by an older code path) the detail is
replaced with `{}` in both the incident feed and the CSV export. The supervisor
loses all context with no indication anything was stripped.

**Fix:** Log a warning when the fallback fires and preserve the original value in
the CSV under a `"_raw"` key so auditors can recover the data manually.

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py::test_m5_string_detail_is_silently_dropped` (PASS)
- Porting the exact expression, a JSON-string detail → `{}` (context lost); the
  `{"_raw": detail}` fix preserves it. The lossy form appears at **two** sites:
  `monitor_service.py:112` (CSV export) **and** `:169` (incident feed) — fix both,
  ideally via one shared `_coerce_detail` helper (§2 single-source).

**Reality check on exposure:** this only bites if rows were ever written with a
non-dict `detail`. Current writers pass a dict, so it's a defensive/legacy-data
concern, not an active data-loss bug for new incidents. Low-to-medium priority;
still worth the `_raw` preservation + a `logger.warning` so silent drops surface.

---

## Low / UX

### L-1 · Exam header uses `z-10` — violates the z-index scale

**File:** `frontend/src/app/exam/[id]/page.tsx:233`

```tsx
<header className="sticky top-0 z-10 bg-shell-surface ...">
```

CLAUDE.md §7.4.1 specifies `z-30` for sticky surfaces. With `z-10` any element
at `z-20` can float above the timer bar — including any future overlay — which
undermines the timer as a trust surface.

**Fix:** Change `z-10` → `z-30`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-1` (PASS): the exam
`<header>` is `sticky top-0 z-10`. Trivially correct; one-token fix to `z-30`.

---

### L-2 · Account page "Back" always goes to `/` regardless of origin

**File:** `frontend/src/app/account/page.tsx:22`

```tsx
<BackButton href="/" label="Back" />
```

If the user navigated to `/account` from `/sessions`, the back button takes them
to the home dashboard instead. CLAUDE.md §8.4 establishes the `?from=` query param
pattern for origin-aware back nav.

**Fix:** Read `searchParams.get('from') ?? '/'` for the href, and have any nav
link that points to `/account` append `?from=<current-path>`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-2` (PASS):
`<BackButton href="/" label="Back" />` is hardcoded; no `from` param is read. Minor
deviation from §8.4 origin-aware back-nav.

---

### L-3 · Dashboard role fallback to `'CONSTRUCTOR'` silently misbehaves

**File:** `frontend/src/app/page.tsx:54`

```typescript
const role = user?.role ?? 'CONSTRUCTOR';
```

If `user.role` is undefined due to a partial hydration race, the dashboard renders
the Constructor navigation set for any role. A REVIEWER silently sees Constructor
links. The backend enforces 403 so no security issue, but the UX is wrong.

**Fix:** `const role = user?.role ?? null;` and update `navLinksForRole` to return
an empty array for `null` rather than defaulting to a staff view.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-3` (PASS): the
dashboard does `const role = user?.role ?? 'CONSTRUCTOR'`. A null/hydrating role
renders the Constructor nav for any user. UX-only (backend 403 is authoritative),
as the finding states.

---

### L-4 · Student cannot verify their accommodation was applied

The exam header shows only the raw countdown. A student with a 1.5× accommodation
sees a timer but has no way to confirm the multiplier was honoured. If they are
silently shorted (see C-1) they have no way to detect it.

**Suggested addition:** Add a secondary line below the countdown:
`"Your allowed time: 90 min (1.5× accommodation)"` derived from the session's
`duration_minutes` field.

**✅ VALID (gap confirmed)** — the exam header (`exam/[id]/page.tsx`) renders only
the countdown; no allowed-time/multiplier line exists. Genuine suggestion, and a
useful companion to the **C-1** fix (a student who is clipped would at least see
their intended allowance). Suggestion-tier.

---

### L-5 · Low-time warning is string-prefix based, not duration-based

**File:** `frontend/src/app/exam/[id]/page.tsx:248–251`

```typescript
timeLeft.startsWith('0m') || timeLeft.startsWith('1m') || timeLeft.startsWith('2m')
```

This breaks for sub-minute time (`59s` doesn't start with `0m`) and is fragile
to any formatting change. The intent is clear but the implementation is wrong.

**Fix:** Store the remaining milliseconds as a number alongside the display string
and check `msLeft < 3 * 60 * 1000` for the warning colour.

**⚠️ NOT AN ACTIVE BUG — REAL latent fragility** — `frontend/tests/epoch14_audit.test.mjs::L-5`
- `L-5 [NOT an active bug]` (PASS): the formatter **always** emits `0m 59s` (never
  bare `59s`), so `startsWith('0m')` *does* catch sub-minute times — the warning
  fires correctly across the whole 0–2m59s window and produces no false positives
  at 10/20 min or with hours. **The finding's stated failure ("59s doesn't start
  with 0m") does not occur.**
- `L-5 [REAL fragility]` (PASS): the logic is one formatter change away from
  silently breaking (`isLowTime('59s') === false`). The duration-based fix is
  immune. Keep the fix as a **maintainability/robustness** improvement, but
  downgrade the framing — it is not currently miscoloring anything.

---

## Fifth Pass — Additional Findings

---

### C-3 · Access tokens are not type-validated in the protected-route dependency

**Files:** `backend/app/core/dependencies.py:53`,
`backend/app/core/security.py:56–60`,
`backend/app/api/endpoints/auth.py:61`

```python
# dependencies.py:53 — no type check
payload = decode_token(token)

# auth.py:61 — refresh endpoint DOES check
if payload.get("type") != "refresh":
    raise HTTPException(...)
```

`decode_token` returns any valid signed JWT regardless of its `type` claim. The
refresh endpoint correctly rejects access tokens used on the refresh path, but
`get_current_user` in `dependencies.py` never asserts `payload.get("type") ==
"access"`. A refresh token — which has a much longer expiry (days vs minutes) —
can be presented as a Bearer token and will pass auth on every protected endpoint.

**Fix:** Add one line in `get_current_user`:

```python
payload = decode_token(token)
if payload.get("type") != "access":
    raise credentials_exception
```

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py`
- `test_c3_access_token_works` (PASS): genuine access token → `GET /auth/me` 200.
- `test_c3_refresh_token_rejected_as_bearer` (XFAIL): the refresh token from the
  login cookie, presented as `Authorization: Bearer`, is **accepted** (200) on
  `/auth/me` — it should be 401. Confirmed: access & refresh tokens share the
  exact same payload (`build_token_payload`: `sub`, `email`, `role`, `tv`); only
  the `type` claim and expiry differ, and `get_current_user` never inspects
  `type`. A days-long refresh token thus authenticates every protected endpoint.

**Severity note:** this belongs in the **Critical** tier — it's an
authentication-scope escalation (long-lived token usable where a short-lived one
is required), and the `/security-review` gate (CLAUDE.md §1) should block merge
until fixed. The one-line guard above is the complete fix; the existing
`assert_token_version` check stays unchanged.

---

## Sixth Pass — UI & Functionality

---

### M-10 · MCQ options render plain text in the exam but HTML in the results view

**Files:** `frontend/src/components/exam/MCQQuestion.tsx:55`,
`frontend/src/app/my-results/[sessionId]/page.tsx:53`

```tsx
// MCQQuestion.tsx:55 — plain text only
<span className="text-foreground">{choice.text}</span>

// my-results/[sessionId]/page.tsx:53 — correctly uses HTML
dangerouslySetInnerHTML={{ __html: sanitizeHtml(options[idx]?.html ?? ...) }}
```

A multiple-choice option that contains bold text, inline code, or a math
expression renders with formatting in the post-submission results view, but as
unstyled plain text during the actual exam. A student seeing `x² + y²` in an
option during the exam sees only `x2 + y2`. The data is there (`choice.html`),
it's just not used.

**Fix:** Replace the plain `<span>` in `MCQQuestion.tsx` with the same sanitized
HTML render already used in the results page:

```tsx
<span
    dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(choice.html ?? choice.text ?? '', ALLOWED),
    }}
/>
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-10`
- (PASS): `getExamChoiceContent` (`lib/examContent.ts`) returns `{ html, text }`
  for every option, yet `MCQQuestion.tsx:55` renders `{choice.text}` (plain) — and
  **so does `MultipleResponseQuestion.tsx:62`** (the audit only mentions MCQ; this
  is the same bug). `my-results/[sessionId]/page.tsx:53/72` render `options[idx].html`.
  So bold/code/math show after submission but not during the exam.

**Scope addition:** fix **both** `MCQQuestion` and `MultipleResponseQuestion`.
Route the render through the existing shared `sanitizeHtml` util (see H-8 — once it
gains the `img` URL guard, these inherit it). Prefer `choice.html ?? choice.text`
so a plain option still shows.

---

### M-11 · Grading session page sticky header uses `z-10` — same design system violation as exam header

**File:** `frontend/src/app/grading/[sessionId]/page.tsx:256`

```tsx
<div className="bg-shell-surface border-b border-shell-border px-6 py-4 sticky top-0 z-10">
```

CLAUDE.md §7.4.1 requires sticky surfaces to use `z-30`. Same issue as L-1 on
the exam page — anything at `z-20` can overlap the grading header.

**Fix:** `z-10` → `z-30`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-11` (PASS): the
grading sticky container is `sticky top-0 z-10`. Same one-token fix. (Worth a
repo-wide `grep -rn "sticky top-0 z-10" frontend/src` to catch any other
offenders in the same sweep.)

---

### M-12 · "Graded" indicator in `EssayGradingPanel` checks feedback presence, not grade status

**File:** `frontend/src/app/grading/[sessionId]/page.tsx:217–219`

```tsx
{grade.feedback !== null && !grade.is_auto_graded && (
    <span ...><CheckIcon /> Graded</span>
)}
```

An essay can be manually graded (points awarded, status set) with no feedback
text. In that case `grade.feedback === null` so the "Graded" checkmark never
appears — the grader sees no confirmation their save worked. Conversely, the
auto-save fires and stores feedback even mid-typing, so the indicator appears
prematurely.

**Fix:** Base the indicator on whether `points_awarded` has been set by a human:
```tsx
{!grade.is_auto_graded && grade.points_awarded !== null && grade.points_awarded >= 0 && (
    <span ...><CheckIcon /> Graded</span>
)}
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-12` (PASS): the
badge condition is `grade.feedback !== null && !grade.is_auto_graded` and the
surrounding region never consults `points_awarded`. So a points-only essay grade
(no feedback) shows no "Graded" badge, and a mid-typing autosave that persists
feedback shows it prematurely.

**Caveat on the proposed fix:** gating on `points_awarded !== null` is only correct
if the schema stores `null` for *ungraded* essays. In this codebase
`question_grades.points_awarded` is a non-nullable `Float` defaulting to `0.0` for
pending-manual rows (see `grading_service.py:155`), so `points_awarded !== null` is
**always true** and would show "Graded" for every essay. Gate on the **grading
status** instead (e.g. `grade.status === 'GRADED'` / `graded_by !== null` /
`pending_manual` flag) — confirm the exact field on the grade DTO before wiring it.

---

### M-13 · No prev/next navigation between student sessions on the grading page

**File:** `frontend/src/app/grading/[sessionId]/page.tsx`

To grade a cohort of 40 students, a grader must: open a session → grade → back
to submissions list → wait for page load → open next session → repeat. There is
no keyboard shortcut or "Next student →" button. The round-trip through the list
on every student is the entire grading workflow.

**Suggested addition:** Pass an ordered list of session IDs from the submissions
list page via query params or store state. Add prev/next buttons to the grading
header so the grader can advance without leaving the page:
```tsx
{nextSessionId && (
    <Button variant="secondary" size="sm" onClick={() => router.push(`/grading/${nextSessionId}?fromTest=...`)}>
        Next student →
    </Button>
)}
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-13` (PASS): the
grading page contains no `nextSessionId`/`prevSessionId`/"Next student" navigation.
Valid workflow improvement (Suggestion-tier rather than a bug).

---

### M-14 · Bulk enroll fires all requests with no preview of how many emails were parsed

**File:** `frontend/src/components/sessions/CourseEnrollmentDrawer.tsx:81–103`

```typescript
const emails = bulkEmails
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'))
    ...
if (emails.length === 0) return;
setBulkBusy(true);
```

A user who pastes 200 lines of text gets no preview of how many valid addresses
were detected before the button fires 200 parallel requests. If the paste
contained extra headers or malformed rows, the errors only appear after the
requests complete.

**Fix:** Show a live count below the textarea: "3 valid email addresses detected"
(recomputed on `onChange`). Disable the "Enroll all" button if `emails.length ===
0` and surface that count in the button label: "Enroll 3 students".

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-14` (PASS): the
button is the static "Enroll all"; email parsing lives entirely inside the click
handler with no live count or label interpolation.

---

### M-15 · Session create form gives no indication of when the exam window closes

**File:** `frontend/src/components/sessions/SessionCreateForm.tsx:86–99`

The form takes a start time and a blueprint, but the resulting end time (start +
blueprint duration) is never shown. A constructor who schedules a 90-minute exam
starting at 14:00 has no way to know the window closes at 15:30 without mentally
computing it. If the room is booked until 15:00, they'd set the wrong start time.

**Suggested addition:** Below the time picker, show a computed end time when both
blueprint and start time are selected:

```tsx
{testDefinitionId && startsAt && selectedBp && (
    <p className="mt-1 text-xs text-shell-muted-dim">
        ↳ Session closes at approximately{' '}
        <strong>{formatScheduled(new Date(startsAt.getTime() + selectedBp.duration_minutes * 60_000))}</strong>
    </p>
)}
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-15` (PASS): the
form uses `startsAt` + a blueprint but never renders a computed close time
(`closes at`/`formatScheduled`/`duration_minutes * 60`/`ends_at` all absent). Use
the `formatScheduled` util (§7.11) for the computed time, and account for any
`duration_minutes_override` if the form exposes one.

---

### L-16 · `my-results` page uses emoji `⏳` — banned by design system

**File:** `frontend/src/app/my-results/[sessionId]/page.tsx:277`

```tsx
<p className="text-2xl font-black text-[var(--color-warning-fg)]">⏳</p>
```

CLAUDE.md §7.2 explicitly bans emoji in UI ("📚, 🧪, 🎯, ⚠, ✗, ✓ as
text-content emoji are banned"). This one survives because it hides inside a
condition (`!result.letter_grade`).

**Fix:** Replace with an SVG icon or the `Spinner` component, or simply the word
"Pending" in the warning color.

**✅ VERIFIED REAL (worse than stated)** — `frontend/tests/epoch14_audit.test.mjs::L-16`
(PASS): the `⏳` emoji appears at **two** spots in `my-results/[sessionId]/page.tsx`
(lines 182 and 277), not just the one the audit cites. Both violate §7.2 — replace
both with a `<Spinner>` or "Pending" label.

---

### L-17 · Grading landing page fetches once and never refreshes

**File:** `frontend/src/app/grading/page.tsx:138–157`

The index is fetched once on mount. If a student submits during a grading session,
`pending_grading` counts are stale for the current grader. There is no refresh
button and no polling.

**Fix:** Add a manual refresh button next to the sort dropdown:

```tsx
<button onClick={() => refetch()} className="...">
    <RefreshIcon size={14} />
</button>
```

Or a 60-second background refresh — the data doesn't need to be real-time, just
not permanently stale.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-17` (PASS): the
grading index contains no `refetch`/`RefreshIcon`/`setInterval` — fetched once on
mount, no manual or background refresh. Low priority.

---

### L-18 · `SessionCreateForm` uses client clock for default start time

**File:** `frontend/src/components/sessions/SessionCreateForm.tsx:22–24`

```typescript
function defaultStartsAt(): Date {
    return new Date(Date.now() + 60_000);
}
```

The default is 1 minute from the client's local time. The submit handler then
validates `startsAt.getTime() <= Date.now()`, but the backend validates against
server time. If the client clock is behind by more than 1 minute the form
"passes" client validation but the backend rejects the session as already-started,
showing a generic error with no guidance to the user.

**Fix:** Validate against `serverNow` from `useServerNow()` instead of
`Date.now()`, matching the same skew-correction used on `ScheduledSessionsTable`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-18` (PASS): both the
default (`new Date(Date.now() + 60_000)`) and the client-side validation
(`startsAt.getTime() <= Date.now()`) use the client clock; no `useServerNow`. A
skewed client clock passes client validation but the backend rejects it with a
generic error. Low-to-medium (depends on client-clock skew in the field).

---

### L-19 · `CourseEnrollmentDrawer` "Roster locked" copy is inaccurate

**File:** `frontend/src/components/sessions/CourseEnrollmentDrawer.tsx:121–125`

```tsx
<p className="text-sm font-semibold text-[var(--color-warning-fg)]">Roster locked</p>
<p className="mt-1 text-sm text-shell-muted">
    This course has an exam in progress, so enrollments can't change until it ends.
</p>
```

The `rosterLocked` prop is passed from the sessions page based on whether any
scheduled session for this course is in `ACTIVE` status. It is not about
individual student attempts being in progress — a session is ACTIVE from
`starts_at` to `ends_at` even if zero students have joined. A new student
arriving 5 minutes before the window closes should arguably be enrollable, but
the message says "exam in progress" implying students are actively taking the
exam.

**Fix:** Change copy to: "This course has an active exam window. Enrollments are
locked until the window closes." This is accurate — the lock is window-based, not
attempt-based.

**⚠️ PARTIALLY OVERTAKEN BY EVENTS** — the quoted code (the single `rosterLocked`
banner at lines 121–125) **no longer exists**: `CourseEnrollmentDrawer` was
reworked (separate enrollment task) into `COMPLETED` vs `ONGOING` lock states with
distinct copy, and adding is now *allowed* during an ongoing window. The residual
wording nuance still applies to the **ONGOING** branch, which reads
*"This course has an exam in progress, so enrollments can't change until it ends."*
— inaccurate now, because adds **are** permitted while ongoing. Re-target the fix
at the current ONGOING copy (and reconcile with **M-2**'s cancel-dialog wording).
Re-verify against the live file before editing; old line numbers are stale.

---

### H-9 · ~~Multiple concurrent 401s race each other into logout~~ → ❌ DISPROVEN (downgraded to optional optimization)

**File:** `frontend/src/lib/api.ts:27–55`

**❌ NOT REAL AS DESCRIBED** — `tests/test_epoch14_audit.py`

The finding's mechanism is: *"With refresh token rotation the backend honours the
first call and invalidates the token. Calls 2 and 3 fail, both execute `logout()`."*
**This backend does not rotate/invalidate refresh tokens.** `refresh_tokens`
(`users_service.py:106–122`) re-issues a pair but never bumps `token_version`, and
refresh tokens are stateless JWTs validated only by signature + `tv`. So:

- `test_h9_old_refresh_token_not_invalidated` (PASS): the *same* refresh cookie
  replayed 3× (the exact parallel-refresh scenario) returns 200 every time.
- `test_h9_refresh_does_not_bump_token_version` (PASS): an access token minted
  *before* a refresh still works *after* it → no sibling invalidation.

Because every parallel `refreshToken()` resolves, the interceptor's `catch →
logout()` branch is never reached. The described spurious logout cannot occur.

**Residual (optional, low priority):** serializing refreshes with a shared
`pendingRefresh` promise would still avoid *N* redundant `/auth/refresh` POSTs when
several requests 401 together on page load. That's a minor efficiency nicety, not a
correctness bug — and it would only become a *correctness* requirement if refresh
rotation/invalidation is introduced later (at which point this finding becomes
real and should be re-promoted). Tracking note, not an Epoch-14 blocker.

---

### H-10 · `GET /sessions/{id}/grades` has no test ownership check

**File:** `backend/app/api/endpoints/grading.py:51–55`

```python
@router.get("/sessions/{session_id}/grades")
async def get_session_grades(
    session_id: UUID,
    current_user=Depends(_require_instructor_or_admin),  # role only, no ownership
):
```

Any CONSTRUCTOR can fetch all question grades — including student answers and
feedback — for sessions belonging to tests they did not create. The endpoint
checks role only. Compare with the publish and analytics endpoints which call
`assert_test_access` (line 212).

**Fix:** Fetch the session and check ownership before returning grades:

```python
session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
if session:
    await assert_test_access(str(session.test_definition_id), current_user)
```

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py`
- `test_h10_owner_can_read_grades` (PASS): the owning constructor gets 200.
- `test_h10_non_owner_forbidden` (XFAIL): a *different* constructor reads the
  session's `question_grades` — including `student_answer` (`"secret answer"`) and
  `feedback` (`"private feedback"`) — and gets 200 where 403 is required. The
  endpoint already loads `session` on line 61, so `assert_test_access` (already
  imported on line 22) can be called with zero extra queries.

**Severity note:** cross-tenant disclosure of student answers + feedback — also
**Critical**-tier. Note the fix must handle `session is None` (return 404 before
the access check) to avoid an `AttributeError`; the suggested `if session:` guard
silently returns an empty list for a missing session, which is acceptable but a
404 is cleaner:
```python
if not session:
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
await assert_test_access(str(session.test_definition_id), current_user)
```

---

### L-6 · Completed sessions collapsed by default even when nothing else exists

**File:** `frontend/src/components/sessions/ScheduledSessionsTable.tsx:213`

```typescript
const [showCompleted, setShowCompleted] = useState(false);
```

A constructor whose first session just closed lands on the page and sees nothing —
the completed section is hidden and neither the ongoing nor scheduled sections
exist. They have to discover the toggle.

**Fix:** Auto-expand when completed is the only non-empty bucket:
`useState(ongoing.length === 0 && scheduled.length === 0)`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-6` (PASS):
`showCompleted` is `useState(false)` — never derived from the other buckets, so a
constructor whose only sessions are completed sees an empty page until they find
the toggle. The proposed derived-default fix is correct (`ongoing`/`scheduled` are
in scope at that point). Low priority.

---

### L-7 · Monitor page doesn't auto-transition to review mode when session closes

A supervisor watching `/sessions/{id}/monitor` during a live session has no
indication when the session closes. The page keeps polling but the data stops
changing. There is no visual signal that the session ended and no automatic
switch to the static review view.

**Suggested addition:** When the poll response indicates all attempts have a
non-STARTED status and the scheduled window has passed, replace the URL with
`?mode=review` (router replace, not push) and stop polling. This also gives the
supervisor a bookmarkable link to the durable record.

**✅ VALID (gap confirmed)** — `frontend/tests/epoch14_audit.test.mjs::L-7` (PASS):
the monitor page has no `router.replace(... mode=review)` auto-transition. Genuine
suggestion. Suggestion-tier.

---

### L-8 · Incident severity levels have no explanation in the UI

The IncidentFeed filter chips show INFO / WARNING / CRITICAL with no tooltip or
legend. A first-time supervisor cannot tell whether INFO events require action.

**Suggested addition:** Add a tooltip or static legend:
- **INFO** — Supervisor actions and lifecycle events
- **WARNING** — Student behaviour worth reviewing (focus loss, copy attempts)
- **CRITICAL** — High-confidence violations (SEB integrity failure, session sharing)

**✅ VALID (gap confirmed)** — `frontend/tests/epoch14_audit.test.mjs::L-8` (PASS):
`IncidentFeed` renders the INFO/WARNING/CRITICAL filter chips but contains no
legend or explanatory copy for what each severity means. Suggestion-tier.

---

### L-9 · SEB config download unavailable for SCHEDULED (future) sessions

**File:** `frontend/src/components/sessions/ScheduledSessionsTable.tsx:93`

```typescript
...(showMonitor ? [{ label: 'Download SEB config', onClick: downloadSeb }] : []),
```

`showMonitor` is only passed for ACTIVE (ongoing) sessions. A constructor who
needs the `.seb` file to distribute to lab machines *before* the exam starts has
no way to download it from the sessions table.

**Fix:** Also show "Download SEB config" for SCHEDULED sessions (pass a
`showSebDownload` flag independent of `showMonitor`).

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-9` (PASS): the
SEB-download item is gated on `showMonitor` (ACTIVE only); no independent
`showSebDownload` flag exists, so a constructor can't fetch the `.seb` file before
the window opens.

---

## Suggestions / Missing Features

### S-1 · No session-level countdown visible on the monitor page

The monitor roster shows per-student presence and question position, but there is
no prominent "Session closes in X minutes" display. A supervisor managing a large
cohort may not notice the window is about to close.

**Suggested addition:** Show a countdown to `ends_at` in the monitor page header,
visually distinct from the per-student data.

**✅ VALID (gap confirmed)** — `frontend/tests/epoch14_audit.test.mjs::S-1` (PASS):
no "closes in"/countdown anywhere on the monitor page. Pairs naturally with **M-1**
(add session context to the header). Suggestion-tier.

---

### S-2 · Student's time multiplier not visible on the monitor roster

The MonitorTable shows email, status, current question, presence, and incident
count. It does not surface the student's accommodation multiplier. A supervisor
cannot tell at a glance who is entitled to extra time or how much.

**Suggested addition:** Add a `Time` column (or tooltip on the student name)
showing the student's `provision_time_multiplier` and their computed
`duration_minutes` for this attempt.

**✅ VALID (gap confirmed)** — `frontend/tests/epoch14_audit.test.mjs::S-2` (PASS):
`MonitorTable` references no `multiplier`/`provision_time`. Would need the field on
the monitor payload. Suggestion-tier; supports the **C-1** supervisor-awareness story.

---

## Third Pass — Additional Findings

---

### C-2 · `require_fullscreen` never actually enters fullscreen

**File:** `frontend/src/hooks/useProctoring.ts:108–115`

```typescript
if (policy.require_fullscreen) {
    const onFullscreenChange = () => {
        if (!document.fullscreenElement) report('FULLSCREEN_EXIT');
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
```

The hook only attaches a `fullscreenchange` listener; it never calls
`document.documentElement.requestFullscreen()`. A student who opens the exam
in a normal window is never prompted to go fullscreen, never fires a
`fullscreenchange` event, and therefore generates zero `FULLSCREEN_EXIT`
incidents — the policy is silently inert. The `ProctoringConfigPanel` description
reads "Prompt the student to stay in fullscreen and log exits," but neither the
prompt nor the enforcement exists.

**Fix:** On mount (when `require_fullscreen` is true and the document is not
already in fullscreen), call `document.documentElement.requestFullscreen()`. If
the request is denied (e.g. user gesture missing) surface a warning. The existing
`fullscreenchange` listener then correctly logs exits.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::C-2`
- Source assertion (PASS): `useProctoring.ts` contains a `fullscreenchange`
  listener but no `requestFullscreen`/`webkitRequestFullscreen` call anywhere in
  the hook — and a repo-wide grep (`grep -rn requestFullscreen src/`) returns
  nothing. The enforcement half of the policy is entirely missing.

**Fix detail:** `requestFullscreen()` must be triggered by a user gesture, so it
cannot fire bare on mount under most browsers' autoplay/gesture rules. Wire it to
the exam's existing "Begin" / acknowledgement action instead, e.g.:
```ts
// in the require_fullscreen block, expose an entry the start button calls:
const enterFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => report('FULLSCREEN_EXIT'));
    }
};
```
Returning `enterFullscreen` from the hook (or invoking it from the ProctoringGate
"start" handler) keeps the gesture requirement satisfied. The existing
`fullscreenchange` listener then logs subsequent exits correctly.

---

### H-4 · Resuming an in-progress exam always resets the student to Q1

**File:** `frontend/src/stores/useExamStore.ts:168–169`

```typescript
joinScheduledSession: async (scheduledSessionId: string) => {
    set({ isLoading: true, error: null, currentQuestionIndex: 0, answers: {}, flags: {}, pendingEvents: [] });
```

`currentQuestionIndex` is always reset to `0` in the store before joining. The
backend returns the existing attempt (the student's session is idempotent — same
attempt, same answers), and `loadSavedAnswers` restores the answer map and flags,
but the question index is never stored server-side and never restored. A student
who was on Q15 of a 20-question exam and navigates away — or whose browser
crashes — always comes back to Q1 with no visual cue that progress was retained.

**Fix:** Persist the last-seen question index server-side via the heartbeat
(already has a `current_index` field in the presence payload sent to Redis), or
save it to `localStorage` keyed by session ID and restore it in `loadSavedAnswers`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::H-4`
- Source assertion (PASS): `joinScheduledSession` sets `currentQuestionIndex: 0`,
  and the `loadSavedAnswers` implementation calls `set({ answers, flags })` with no
  reference to `currentQuestionIndex` anywhere — so a resumed attempt always lands
  on Q1 even though answers/flags are correctly restored.

**Fix detail:** `localStorage` is the lighter option and matches the existing
heartbeat-queue persistence already in `loadSavedAnswers`. Write the index in
`navigateTo` (`useExamStore.ts:246`) keyed by session
(`openvision_q_index_<sessionId>`), then restore it at the end of
`loadSavedAnswers` — clamped to `[0, items.length-1]` in case the test definition
changed. Clear the key on submit. (Server-side via heartbeat is more robust across
devices but needs a schema/worker touch; localStorage is fine for the
single-device resume case the finding describes.)

---

### H-5 · In-progress attempt disappears from My Exams when session window closes

**Files:** `backend/app/services/scheduled_sessions_service.py:244`,
`frontend/src/app/my-exams/page.tsx:31–36`

```python
# scheduled_sessions_service.py:244
if current_record.status == CourseSessionStatus.CLOSED.value:
    continue  # CLOSED sessions are silently dropped from the student list
```

```typescript
// my-exams/page.tsx:31-36
const isFinishedForStudent = (s) =>
    s.existing_attempt_status === 'SUBMITTED' || s.existing_attempt_status === 'EXPIRED';
const currentSessions = sessions.filter((s) => s.can_join && !isFinishedForStudent(s));
const upcomingSessions = sessions.filter((s) => !s.can_join && !isFinishedForStudent(s));
```

When the scheduled session window closes, the backend stops returning it in the
student list entirely. A student whose attempt was still `STARTED` at that moment
has a session in progress but no navigation path back to it. The attempt has not
yet been auto-submitted (that only happens on the next fetch of the specific
session). My Exams shows nothing; My Grades shows nothing (not yet submitted). The
student must know their session ID and navigate to `/exam/{id}` directly.

**Fix:** Include CLOSED sessions in the student list for a grace period when
`existing_attempt_status === 'STARTED'` (e.g., for up to 10 minutes after
`ends_at`) so the student can see a "Finish your exam" link. Alternatively
trigger auto-submission eagerly when `ends_at` passes rather than lazily on the
next session fetch.

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py`
- `test_h5_started_attempt_survivable_after_close` (XFAIL): a student with a
  `STARTED` attempt on a session whose window closed 2 min ago calls
  `GET /api/student/sessions/` and the session is **absent** from the response —
  `ensure_scheduled_session_current` flips it to `CLOSED` and line 244 `continue`s
  past it before the attempt status is ever consulted. The attempt is still
  `STARTED` (not auto-finalized — that only happens on `GET /sessions/{id}`), so it
  shows in neither My Exams nor My Grades.

**Recommended fix (eager finalize — preferred):** in the list loop, before the
`CLOSED → continue`, if the student has a `STARTED` attempt on a now-CLOSED
session, call `finalize_timed_out_session(attempt)` (already exists,
`exam_sessions_service.py:495`). The attempt becomes `SUBMITTED`+graded and
immediately surfaces in My Grades — no orphaned state, no grace-period UI needed.
The grace-period alternative leaves the attempt editable past `ends_at`, which
contradicts the hard `expires_at` cap, so eager finalize is the cleaner contract.
Guard it so only the owning student's attempt is finalized.

---

### M-6 · My Grades shows no loading indicator during background refresh

**File:** `frontend/src/app/my-grades/page.tsx:32`

```typescript
{myResultsLoading && myResults.length === 0 ? (
    <Spinner ... />
```

The spinner only renders on the initial empty load. A student who pulls to
refresh or triggers a re-fetch while already viewing results sees no feedback
— the stale list stays visible with no indication a request is in flight.

**Fix:** Show a subtle inline loading indicator (e.g., a faint spinner next to
the section header, or the `isLoading ? <span>Refreshing…</span>` pattern
already used on My Exams at `my-exams/page.tsx:58`) whenever `myResultsLoading`
is true, regardless of whether results are already displayed.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::M-6` (PASS): the
spinner condition is `myResultsLoading && myResults.length === 0`, and there's no
"Refreshing" affordance — a re-fetch with results already present shows nothing.

---

### M-7 · `question_grades` has no index on `learning_object_id`

**File:** `prisma/schema.prisma` (model `question_grades`)

```prisma
model question_grades {
  session_id         String   @db.Uuid
  learning_object_id String   @db.Uuid
  ...
  @@index([session_id], map: "ix_question_grades_session_id")
  // no index on learning_object_id
}
```

The grading and analytics paths need to find all grades for a given question
across sessions (e.g., "average score for this question across all attempts").
Without an index on `learning_object_id`, those queries do a full scan as the
grades table grows.

**Fix:** Add `@@index([learning_object_id], map: "ix_question_grades_lo_id")`.

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py::test_m7_no_index_on_learning_object_id`
- (PASS): the `question_grades` model has `ix_question_grades_session_id` but no
  `@@index` referencing `learning_object_id`, **and** a real query filters on it —
  `psychometrics_service.py:314`,
  `question_grades.find_many(where={"learning_object_id": learning_object_id})` (the
  per-question version-evolution analytic). Confirmed warranted, not speculative.

**Fix detail:** add the index in `prisma/schema.prisma` and apply with
`prisma db push` (CLAUDE.md tech-stack note — no Alembic). Note EXPLAIN won't show
a difference on dev-sized tables (Postgres prefers a seq scan until the table is
large), so the justification is the query pattern + table growth under load, not a
local plan diff. Aligns with §4 "index all FK and frequently-filtered fields."

---

## Low / UX (second pass)

### L-10 · Nav "active" highlight activates on all sub-paths due to `startsWith`

**File:** `frontend/src/components/layout/GlobalHeader.tsx:71`

```typescript
const isActive = pathname.startsWith(link.href);
```

`pathname.startsWith('/sessions')` is true for `/sessions`, `/sessions/new`, and
`/sessions/[id]/monitor`. This is intentional for most links. However `/analytics`
matches `/analytics/tests/[testId]`, `/blueprint` matches `/blueprint/[id]` — all
correct. One edge case: if a link were ever added for `/item`, it would also match
`/items`. Not currently broken, but the approach is fragile. A safer check would
be `pathname === link.href || pathname.startsWith(link.href + '/')`.

**Fix:** Change the active check to:
```typescript
const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
```

**⚠️ LATENT (finding self-identifies as "not currently broken")** —
`frontend/tests/epoch14_audit.test.mjs::L-10` (PASS): `startsWith` is confirmed in
use; it agrees with the proposed fix for all real nested routes
(`/sessions`→`/sessions/new`) and only diverges on the hypothetical `/item` vs
`/items` collision (no such link exists today). Correct, cheap, defensive fix —
Low priority.

---

### L-11 · `upcomingSessions` bucket on My Exams can silently include a STARTED attempt when `can_join` is false

**File:** `frontend/src/app/my-exams/page.tsx:35–36`

If a student begins an exam and their browser crashes mid-session, when they
return the backend may still show the session as ACTIVE with `can_join: true` and
`existing_attempt_status: 'STARTED'` — which is handled correctly (resume button).
However, if the window is ACTIVE but `can_join` is somehow false (e.g., a timing
edge case between server and client clocks), their STARTED attempt lands in
`upcomingSessions` with a disabled "Join exam" button. The card shows "Joinable
now" badge from the raw status but a disabled button — contradictory.

**Fix:** Add a dedicated "Resume in progress" bucket or label for
`existing_attempt_status === 'STARTED'` so a student with an in-progress attempt
always has a clear path back, regardless of `can_join`.

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-11` (PASS):
`upcomingSessions = sessions.filter((s) => !s.can_join && !isFinishedForStudent(s))`
and there is no resume bucket. A STARTED-but-not-joinable attempt lands in
"upcoming" with a disabled Join button. Closely related to **H-5** — fix together.

---

### L-12 · `ProctoringGate` offers SEB download from inside the browser it's blocking

**File:** `frontend/src/components/exam/ProctoringGate.tsx:37–62`

When `require_seb` is true and the student is not in SEB, the gate shows a
"Download exam configuration" button that fires an API request and creates a Blob
download. This is helpful but has an awkward edge case: the student downloads the
`.seb` file, double-clicks it to open in SEB, and SEB relaunches the exam URL.
But if the student already has an in-progress session (they started in a regular
browser, somehow got past a different check), they resume into SEB cleanly.
If not, the flow works. The issue is the button says "Download exam configuration"
which is not self-explanatory to a non-technical student.

**Fix / UX:** Change the button label to "Get the exam launcher file" and add
numbered steps below it: "1. Download the file. 2. Open it with Safe Exam Browser.
3. The exam will launch automatically."

**✅ VALID (copy confirmed)** — `frontend/tests/epoch14_audit.test.mjs::L-12` (PASS):
the button label is the unclear "Download exam configuration"; no launcher wording
or step list. Pure copy/UX improvement — Low priority.

---

### S-4 · No confirmation required before leaving the exam via browser back / close

The exam page blocks navigation via the `beforeunload` beacon flush
(`useHeartbeat.ts:57–88`), but it does not show a browser confirmation dialog
(`event.returnValue = ''`) when the student tries to close the tab or navigate
away. A student who accidentally presses Cmd+W or the browser back button will
lose their place without warning. Heartbeat recovery via localStorage partially
mitigates this, but the student has no indication the unload was dangerous.

**Fix:** In the `beforeunload` handler, set `event.returnValue = 'Your exam is in
progress. Are you sure you want to leave?'` to trigger the browser's native "Leave
page?" dialog. This is the standard pattern and is not affected by the heartbeat
flush (the flush still fires on `beforeunload`).

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::S-4` (PASS): the
`beforeunload` handler in `useHeartbeat.ts` flushes/beacons but never sets
`returnValue`, so no native "Leave page?" prompt appears. Note modern browsers show
only a **generic** string (custom text is ignored) and require prior page
interaction — still worth it. Suggestion/Low.

---

### S-5 · `joinScheduledSession` clears in-memory pending events before the flush completes

**File:** `frontend/src/stores/useExamStore.ts:169`

```typescript
set({ ..., pendingEvents: [] });
```

`pendingEvents` is cleared synchronously at the start of `joinScheduledSession`,
before the API call. If a student somehow triggers a join while events are
queued in memory (e.g., rapid navigation), those events are dropped and not
persisted to localStorage either (the localStorage write only happens in the
`flushEvents` catch path, which is also bypassed here).

**Fix:** Call `flushEvents(existingSessionId)` before resetting store state, or
only clear `pendingEvents` after the join API call succeeds.

**✅ VERIFIED REAL (low reachability)** — `frontend/tests/epoch14_audit.test.mjs::S-5`
(PASS): `joinScheduledSession` sets `pendingEvents: []` synchronously at the top,
with no `flushEvents` before the reset. **Reachability is low**: a join happens on
entry to an exam, before any answer events for *that* session exist, and prior
sessions flush on their own unmount/heartbeat. The dropped-events scenario needs an
unusual rapid re-join while events from another session sit in memory. Real but
edge-case — Low priority; the "flush before reset" fix is cheap insurance.

---

## Fourth Pass — Additional Findings

---

### H-6 · ReviewSummary flagged/answered/unanswered counts don't sum to total

**File:** `frontend/src/components/exam/ReviewSummary.tsx:21–23`

```typescript
const answeredItems   = items.filter((item) => !!answers[item.learning_object_id]);
const unansweredItems = items.filter((item) => !answers[item.learning_object_id]);
const flaggedItems    = items.filter((item) => flags[item.learning_object_id]);
```

The three lists are independent — a question that is **flagged but unanswered**
appears in both `unansweredItems` and `flaggedItems`. The stats panel displays
all three counts side-by-side, so a student with 10 questions, 7 answered (2
flagged), 3 unanswered (1 flagged) sees: **7 answered · 3 unanswered · 3 flagged**
— which adds to 13, not 10. The student is right to be confused.

Additionally, the "Unanswered questions" list below already shows flagged-and-
unanswered items, and they also appear in the "Flagged for review" list — a
question button appears in two places simultaneously.

**Fix:** Make the counts mutually exclusive. Flagged items that are also
unanswered should be counted and listed only under "Flagged" (the more urgent
category), not double-counted under "Unanswered":

```typescript
const flaggedIds      = new Set(items.filter(i => flags[i.learning_object_id]).map(i => i.learning_object_id));
const answeredItems   = items.filter(i => !!answers[i.learning_object_id]);
const unansweredItems = items.filter(i => !answers[i.learning_object_id] && !flaggedIds.has(i.learning_object_id));
const flaggedItems    = items.filter(i => flaggedIds.has(i.learning_object_id));
// Now answered + unanswered + flagged === total
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::H-6`
- `H-6 [REAL]` (PASS): porting the exact source expressions, a 10-item set with
  7 answered (2 flagged) + 3 unanswered (1 flagged) yields counts 7 / 3 / 3 that
  sum to **13**, not 10.
- `H-6 fix` (PASS): the mutually-exclusive buckets (flagged is its own; unanswered
  excludes flagged) sum to exactly the total across edge cases (all-flagged,
  no-flags). The audit's proposed fix is correct as written.

**Note:** also de-duplicate the *lists* below the stats — a flagged-and-unanswered
question currently renders a jump button under both "Unanswered" and "Flagged".
The same `flaggedIds` set fixes both the counts and the lists.

---

### H-7 · "Confirm Submission" button can be double-clicked — duplicate submit requests

**File:** `frontend/src/components/exam/ReviewSummary.tsx:112–117`,
`frontend/src/app/exam/[id]/page.tsx:174–181`

```tsx
// ReviewSummary.tsx:112–117
<button onClick={onConfirm} className="...">
    Confirm Submission
</button>
```

`ReviewSummary` never reads `isLoading` from the exam store. `onConfirm` calls
`submitExam`, which sets `isLoading: true` in the store — but the button doesn't
disable during the in-flight request. A student who double-clicks sends two
simultaneous POST requests to `/sessions/${sessionId}/submit`. The second one
returns an error (session already SUBMITTED), which `handleSubmit` swallows with
`catch { }`, but the `isLoading: true` state is now stuck (the second call's
`set({ isLoading: true })` ran after the first set it false). The review modal
may stay visible instead of transitioning to the confirmation screen.

**Fix:** Pass `isLoading` into `ReviewSummary` and disable + show a spinner on
the confirm button:

```tsx
<button onClick={onConfirm} disabled={isSubmitting} className="...">
    {isSubmitting ? <Spinner size="sm" /> : 'Confirm Submission'}
</button>
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::H-7`
- `confirm button has no disabled/loading guard` (PASS): the `onClick={onConfirm}`
  button opening tag contains no `disabled`, and `ReviewSummary` never references
  `isLoading`/`isSubmitting` at all.
- `page hides the review modal only AFTER the await resolves` (PASS): in
  `exam/[id]/page.tsx`, `setShowReview(false)` runs *after* `await submitExam(...)`,
  so the modal and its enabled button stay mounted during the in-flight POST — a
  second click fires a second `/submit`.

**Belt-and-suspenders:** besides disabling the button, the store's `submitExam`
should early-return if `get().isLoading` is already true (idempotent guard), so a
duplicate call can't fire even if a future caller forgets the `disabled` prop.

---

### H-8 · `img` tags in question HTML allow external tracking pixels

**File:** `frontend/src/components/exam/QuestionRenderer.tsx:19–21`

```typescript
DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [..., 'img'],
    ALLOWED_ATTR: ['class', 'src', 'alt'],
})
```

`src` is in `ALLOWED_ATTR` with no URL validation. A question authored with
`<img src="https://tracking.example.com/exam?student=...">` would silently fire
an HTTP request from the student's browser every time that question is rendered,
exfiltrating timing and presence data. DOMPurify's defaults only block
`javascript:` URIs — external HTTPS sources pass through.

**Fix:** Either remove `img` from `ALLOWED_TAGS` entirely (media should come
from the app's own CDN and be rendered via a dedicated `<ExamImage>` component),
or add a `FORBID_ATTR: ['src']` + `FORCE_BODY: true` and allow only relative
paths via a hook:

```typescript
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') ?? '';
        if (!src.startsWith('/')) node.removeAttribute('src');
    }
});
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::H-8`
- Source assertion (PASS): `QuestionRenderer.tsx` has `'img'` in `ALLOWED_TAGS`
  and `'src'` in `ALLOWED_ATTR`, and contains **no** `addHook`,
  `ALLOWED_URI_REGEXP`, or `FORBID_ATTR`. DOMPurify's documented default only
  strips dangerous URI schemes (`javascript:`, `data:` in some configs) — `https:`
  image sources pass through untouched, so an authored
  `<img src="https://tracker/â€¦?s=â€¦">` fires a request from the student's browser.

**Scope note:** the same `sanitizeHtml` shape appears in other render paths
(`my-results/[sessionId]/page.tsx`, MCQ option HTML once M-10 is fixed). Whichever
fix is chosen (drop `img` entirely, or the relative-only `afterSanitizeAttributes`
hook) should live in **one shared util** (`src/lib/examContent.ts` already exists)
so every consumer inherits it — per CLAUDE.md §2 single-source-of-truth.

---

### M-8 · Grading service: delete + create_many is not atomic

**File:** `backend/app/services/grading_service.py:165–171`

```python
# Upsert question_grades (skip if already exist to avoid race conditions)
if grade_records:
    await prisma.question_grades.delete_many(where={"session_id": str(session_id)})
    await prisma.question_grades.create_many(data=grade_records, skip_duplicates=True)
```

The comment says "to avoid race conditions" but the two statements are not wrapped
in a transaction. If `auto_grade_session` is called twice simultaneously (student
submit + server-side finalize-timeout firing at the same moment), one caller's
`delete_many` can remove rows the other just inserted, leaving the session with
zero question grades and a `session_result` record that has `total_points: 0`.

**Fix:** Wrap both calls in a Prisma interactive transaction:

```python
async with prisma.tx() as tx:
    await tx.question_grades.delete_many(where={"session_id": str(session_id)})
    await tx.question_grades.create_many(data=grade_records, skip_duplicates=True)
```

**✅ VERIFIED REAL (atomicity gap + reachable)** — `tests/test_epoch14_audit.py`
- `test_m8_delete_create_not_in_transaction` (PASS): the module contains the
  `delete_many` + `create_many` pair and **no** `prisma.tx(`/`async with prisma.tx`
  anywhere — the two writes are not atomic.
- `test_m8_grading_callers_have_no_atomic_status_guard` (PASS): `finalize_timed_out_session`
  updates the session with `where={"id": session.id}` — **no status fence** — then
  calls `auto_grade_session`. The submit path (`interactions_service.py:206–229`)
  guards with a *separate, non-atomic* read-check-then-update. So submit and
  finalize (or two submits) can both reach `auto_grade_session` concurrently.

**Severity nuance (be precise):** for *identical* input answers every interleaving
converges to the same N rows (`delete` is idempotent, `create_many` uses
`skip_duplicates`), so the audit's "leaves **zero** grades / `total_points: 0`"
permanent outcome is unlikely. The genuine, reproducible risk is a **transient
inconsistent read**: a concurrent `GET /grading/sessions/{id}/grades` or the
`session_result` total computed *between* one caller's `delete` and `create` sees a
partial/empty set. The transaction fix is still correct and cheap, and closes the
window cleanly. Recommend pairing it with an atomic status fence on the writers
(`update(where={"id": id, "status": "STARTED"}, ...)` and only grade if a row was
updated) so grading runs exactly once — that also resolves the H-7 double-submit
tail. **Keep at Medium** (transient, self-healing), not Critical.

---

### M-9 · Heartbeat autoclaim always rescans from stream start

**File:** `backend/app/services/heartbeat_ingestion/worker.py:171–178`

```python
result = await redis.xautoclaim(
    settings.HEARTBEAT_STREAM_NAME,
    settings.HEARTBEAT_CONSUMER_GROUP,
    _CONSUMER_NAME,
    min_idle_time=_AUTOCLAIM_MIN_IDLE_MS,
    start_id="0-0",          # ← always from the beginning
    count=settings.HEARTBEAT_WORKER_BATCH_SIZE,
)
```

`xautoclaim` returns `(next_start_id, messages, deleted_ids)` but `result[0]`
(the next cursor) is never stored. Every autoclaim cycle begins at `"0-0"`,
meaning the worker re-scans the entire pending entry list every 30 seconds.
As the stream grows under load (e.g., 10 k students), this becomes an O(n) scan
per cycle, degrading worker throughput.

**Fix:** Persist `next_start_id` between autoclaim calls:

```python
_autoclaim_cursor = "0-0"   # module-level

result = await redis.xautoclaim(..., start_id=_autoclaim_cursor, ...)
_autoclaim_cursor = result[0] or "0-0"
```

**✅ VERIFIED REAL** — `tests/test_epoch14_audit.py::test_m9_autoclaim_cursor_not_persisted` (PASS)
- `xautoclaim` is always called with `start_id="0-0"`, there is no
  `_autoclaim_cursor`, and only `result[1]` (messages) is read — `result[0]` (the
  next cursor) is discarded. Every cycle restarts the scan from the top.

**Severity nuance:** `xautoclaim` scans the **Pending Entries List** (un-acked
messages), not the whole stream. Under healthy operation messages are acked
promptly so the PEL is near-empty and the rescan is cheap — the O(n) cost is
proportional to the *backlog of stuck messages*, not to total throughput / student
count. So this is a latent efficiency issue that only bites during sustained
failure backlogs, not normal load. The cursor-persistence fix is the correct
idiom and cheap; **Low/Medium** priority. Mind the wraparound: when `result[0]`
comes back `"0-0"` you've completed a pass — keep the `or "0-0"` reset.

---

## Low / UX (fourth pass)

### L-14 · `SubmissionConfirmation` button label defaults to "Back to Sessions" for any unknown return path

**File:** `frontend/src/components/exam/SubmissionConfirmation.tsx:21`

```typescript
const returnLabel = returnPath === '/my-exams' ? 'Back to My Exams' : 'Back to Sessions';
```

The label is hardcoded to two known values. Any future session type whose
`return_path` is neither `/my-exams` nor `/sessions` (e.g., `/my-results`, a
course-specific path) silently gets "Back to Sessions" even if that's wrong.

**Fix:** Derive the label from the path or pass it explicitly from the session
payload:

```typescript
const returnLabel = returnPath.startsWith('/my-') ? 'Back to My Exams'
    : returnPath.startsWith('/sessions') ? 'Back to Sessions'
    : 'Continue';
```

**✅ VERIFIED REAL** — `frontend/tests/epoch14_audit.test.mjs::L-14` (PASS): porting
the ternary, `/my-results` and `/blueprint` both yield "Back to Sessions". Latent
(only two return paths exist today: `/my-exams`, `/sessions` — see §8.6), so it
mislabels only if a new return path is added. Low priority.

---

### L-15 · `ExamFooter` answered-count uses `!!value` — consistent with ReviewSummary bug but same root

**File:** `frontend/src/components/exam/ExamFooter.tsx:30` and `frontend/src/components/exam/ReviewSummary.tsx:21`

```typescript
const answeredCount = items.filter((item) => answers[item.learning_object_id]).length;
```

Same truthiness check as ReviewSummary. In the current question types (MCQ
options are UUID strings, essays are non-empty strings) this is safe because no
valid answer produces a falsy value. However, if a future question type stores a
numeric score or boolean (`0`, `false`) as its answer payload, these items would
count as unanswered even when the student has responded. The fix is the same for
both files: check key presence rather than value truthiness:

```typescript
const answeredCount = items.filter(
    (item) => item.learning_object_id in answers
).length;
```

**⚠️ LATENT (safe today)** — `frontend/tests/epoch14_audit.test.mjs::L-15` (PASS):
with today's payloads (non-empty option-id strings / objects) the truthiness count
matches the key-presence count. A future numeric/boolean payload of `0`/`false`/`''`
would be under-counted (`truthy` → 0, `keyed` → 3 in the test). Correct, cheap,
forward-proofing fix. **Note:** this is the same truthiness root as **H-6/answered**
in `ReviewSummary.tsx:21` — fix both call sites together.
