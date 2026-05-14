# Epoch 8.5 — Verification Debt: Token Audit Completion, Auth Persistence & Test Hygiene

> **Type:** Cleanup / debt-paydown Epoch.
> **Scope:** Items surfaced during the Epoch 8.4 Stage 17/18 in-browser verification pass that fell outside 8.4's documented scope but must not be allowed to rot.
> **Origin:** All four items below were found while walking every surface in Chrome across the `dark` / `warm` / `light-blue` themes. None were in 8.4's stage catalogue, so they were recorded rather than fixed mid-epoch.
>
> **Guiding principle:** A verification pass that finds bugs but leaves them undocumented is worse than no verification. This Epoch closes the loop.

---

## Stage Index

| # | Stage | Surface |
|---|---|---|
| 1 | Complete the color-token audit (exam components + widen the audit regex) | `src/components/exam/*`, `globals.css`, `CLAUDE.md` |
| 2 | Auth session persistence (survive hard navigation / refresh) | `useAuthStore`, app bootstrap, `ProtectedRoute` |
| 3 | Pre-existing backend test failures — triage & fix | `backend/tests/*`, versioning + accommodations services |
| 4 | Minor polish punch list | analytics index cards, misc |

---

## Stage 1 — Complete the Color-Token Audit

**Problem.** Epoch 8.4 Stage 15a's audit regex only covered `blue|cyan|red|green|yellow|orange|purple|pink|indigo`. Tailwind has more color families, and the exam-taking components use several of them directly — so the drift sailed past every 8.4 grep gate.

**Offending sites (audited 2026-05-14):**
- `frontend/src/components/exam/QuestionRenderer.tsx:51` — `bg-amber-500/20 text-amber-400 border-amber-500/40` (current-question state).
- `frontend/src/components/exam/QuestionRenderer.tsx:52` — `bg-gray-600/50 hover:bg-gray-600` (inactive state).
- `frontend/src/components/exam/TimelineNavigator.tsx:51` — `bg-emerald-500/20 border-emerald-400 text-emerald-300` (answered state).
- `frontend/src/components/exam/TimelineNavigator.tsx:54` — `hover:bg-gray-600/50` (unanswered hover).
- `frontend/src/components/exam/TimelineNavigator.tsx:60` — `bg-amber-400` (flagged-question dot).

These are *semantic exam-navigation states* — "current", "answered", "unanswered", "flagged" — not arbitrary decoration. They need their own token family, not a one-off remap to existing tokens.

### 🤖 For the AI
- **Define a token family** in `frontend/src/app/globals.css` for exam navigation state, e.g. `--color-exam-current-{bg,fg,border}`, `--color-exam-answered-*`, `--color-exam-flagged-*`, for all three themes (`dark` / `warm` / `light-blue`). Reuse `--color-warning-*` / `--color-success-*` where the semantics genuinely match rather than inventing duplicates.
- Replace the five sites above with the new tokens (or existing semantic tokens where appropriate). No `gray-600` — use `bg-shell-input-alt` / `border-shell-border-deep`.
- **Widen the audit regex** in `CLAUDE.md` §7.1 to the full Tailwind palette: add `amber|lime|emerald|teal|sky|violet|fuchsia|rose|slate|gray|zinc|neutral|stone`. Update the documented audit command so this class of drift can never pass a gate again.
- **Visual verification requires a live exam session** — `/exam/[id]` is full-bleed focus mode and these components only render mid-exam. Seed a joinable session, take the exam, and confirm the navigator/renderer states read correctly in all three themes. This is why the work could not be done blind during 8.4.

### Verification
- Widened `grep -rE "(border|bg|text)-(blue|cyan|red|green|yellow|orange|purple|pink|indigo|amber|lime|emerald|teal|sky|violet|fuchsia|rose|slate|gray|zinc|neutral|stone)-[0-9]" frontend/src/app frontend/src/components` → zero hits.
- Exam-taking screen verified across the three themes with a live session.

---

## Stage 2 — Auth Session Persistence

**Problem.** The access token lives only in memory (`useAuthStore`, no `persist` middleware). Any **hard page load** — browser refresh, opening a bookmarked deep link, or any non-client-side navigation — drops the token, and `ProtectedRoute` immediately bounces the user to `/login`. Only in-app `<Link>` / `router.push` navigation keeps a session alive.

Discovered repeatedly during the 8.4 verification pass: every `navigate()` to a deep URL logged the test user out. In normal use this means **a student who refreshes mid-workflow loses their session** — unacceptable for an exam platform.

**Note.** This is strictly an Epoch 3 (Authentication) concern, not a design issue. It is captured here only because the verification pass is what surfaced it; the actual fix may warrant promotion into a dedicated auth-hardening slot.

### 🤖 For the AI
- Confirm a refresh-token cookie exists and is `httpOnly`. If it does, implement a **rehydrate-on-load** flow: on app bootstrap, attempt a silent refresh before `ProtectedRoute` renders, so a valid refresh cookie restores the access token without a redirect.
- If no refresh-token mechanism exists, the minimum viable fix is persisting the access token (Zustand `persist`, `sessionStorage`) — but a refresh-rotation flow is the correct long-term answer per `CLAUDE.md` §1 ("Refresh tokens with rotation").
- Add a loading state to `ProtectedRoute` so it shows a spinner during the silent-refresh attempt rather than flashing the login page.
- **Tests:** a hard reload on a protected route keeps the user authenticated; an expired/absent refresh token still redirects to `/login`.

### Verification
- Log in, navigate to `/blueprint`, hard-refresh the browser → still on `/blueprint`, still authenticated.
- Open a deep link (`/analytics/tests/{id}`) in a fresh tab with a valid session → renders, no redirect.

---

## Stage 3 — Pre-Existing Backend Test Failures

**Problem.** `pytest` reports **4 failures** that predate Epoch 8.4 (the test files and their underlying services were untouched since the epoch began — confirmed via `git log 2e8d427..HEAD`). They are not 8.4-caused, but they block the "pytest clean" exit gate that every epoch's verification stage asserts.

**Failing tests:**
- `tests/test_accommodations.py::test_time_multiplier_application`
- `tests/test_accommodations.py::test_auto_expiration_on_retrieval`
- `tests/test_item_versioning_and_options.py::test_immutability_overwrite_draft`
- `tests/test_items_api.py::test_immutability_version_up_logic`

The versioning failures share a symptom: a draft edit that is expected to *overwrite in place* (stay `version_number == 1`) instead bumps the version (`assert 2 == 1`). That points at the version-up logic in `items_service` no longer matching the immutability contract the tests encode — either the logic regressed or the tests are stale relative to an intended behaviour change.

### 🤖 For the AI
- Triage each failure: is the **test** stale (behaviour intentionally changed and the test was never updated) or is the **code** wrong (regression against the documented contract)?
- For the two versioning failures, reconcile `items_service.py`'s draft-overwrite vs. version-up branching against the immutability rules in the Epoch 2 blueprint. Fix whichever side is wrong; do not just delete the assertion.
- For the accommodations failures, check `accommodations_service` time-multiplier application and auto-expiration-on-read against the Epoch 10 accommodations spec.
- Each fix needs the failing test green plus a one-line note in the commit explaining whether code or test was the source of truth.

### Verification
- `pytest` exits 0 with zero failures.

---

## Stage 4 — Minor Polish Punch List

Small items noticed in passing during verification. Each is a few minutes.

### 4a — "1 SECTIONS" plural on analytics index cards
- **Symptom:** Cards on `/analytics` render `1 SECTIONS` (e.g. "Shuffle Lab"). Epoch 8.4 Stage 18g fixed the singular/plural logic for *blueprint* cards but the analytics index cards were not in scope.
- **Fix:** Apply the same singular/plural rule — `1 section` / `4 sections` — to the analytics dashboard card meta. Consider extracting a shared `pluralize(count, noun)` util in `src/lib/` so this stops recurring.

### 4b — (reserve for further small items found before this Epoch opens)

### Verification
- `/analytics` cards read `1 section` for single-section tests.

---

## Out of Scope

- The deferred backlog in `directives/todo.md` (TODO-001…010) is unchanged by this Epoch — in particular **TODO-003 (Mobile/Responsive Pass)** still needs its own dedicated Epoch and is the natural large-ticket successor.
- No new design-system work; 8.5 is debt paydown, not a polish pass.

---

## Exit Criteria (Epoch-Level)

- Widened color audit returns zero hits; exam-taking screen verified across all three themes with a live session.
- Hard refresh / deep-link on a protected route no longer logs the user out.
- `pytest` exits 0 — all 4 pre-existing failures resolved.
- `tsc --noEmit` + `next build` pass.
- Aikido scan: zero new Critical/High findings.
- Conventional Commit: `feat(8.5): verification debt — token audit, auth persistence, test hygiene`.
