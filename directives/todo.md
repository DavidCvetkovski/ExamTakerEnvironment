# OpenVision — Deferred TODO Backlog

> Items surfaced during epoch planning that didn't make it into a scheduled epoch. Each item has two layers:
>
> - **👤 For David** — plain-language framing of the question, why it matters, and the decision needed.
> - **🤖 For the AI** — once a decision is made, this is the structured execution brief (files, patterns, tests). Do not act on these without explicit approval — they're waiting on the human decision above.
>
> **Review cadence:** Before opening any new Epoch blueprint, scan this file. Items that have become relevant should be promoted into the new Epoch and removed from here.

---

## TODO-001 — Student vs. Staff Visual Fracture

**Status:** Awaiting product decision.
**Surfaced in:** Epoch 8.4 design audit.

### 👤 For David

The student-facing surface (`/my-results/[sessionId]` specifically) uses a separate color token (`--color-student-primary`) and a unique background gradient (`bg-[image:var(--gradient-student-page)]`). Everywhere else uses the standard `bg-shell-bg` shell.

The effect: it feels like two products bolted together. A student logging in sees a different visual language from a constructor logging in.

**Two paths:**

1. **Commit to "Student Mode" as a deliberate brand.** Extend the student treatment to `/my-exams`, `/my-grades`, the exam-taking screen, and the practice completion screen. Document it as a scoped theme overlay (similar to the login green tint planned in Epoch 8.4 Stage 13). Pros: makes the role-switch feel intentional, gives students a calmer/warmer experience. Cons: doubles the design surface; every new feature must be designed twice.

2. **Harmonise.** Remove `--color-student-primary` and the student gradient. Treat student pages as ordinary shell surfaces with `text-brand` accents. Pros: one design language, half the work going forward. Cons: loses whatever brand differentiation was originally intended.

**My recommendation:** Path 2, unless you have user research saying students respond well to the differentiated treatment. The fracture currently feels accidental, not designed.

**Decision needed:** Path 1 or Path 2?

### 🤖 For the AI (execute after decision)

**If Path 1 (commit to Student Mode):**
- Audit `frontend/src/app/globals.css` and confirm `--color-student-primary` and `--gradient-student-page` are defined for all three themes (`dark`, `warm`, `light-blue`).
- Add `data-theme-scope='student'` wrapper applied at the layout level in `/my-exams`, `/my-grades`, `/my-results/[sessionId]`, `/exam/[id]`, and the practice completion screen via `SubmissionConfirmation`.
- Document the scope in CLAUDE.md §7.9 alongside the existing `data-theme-scope='login'` exception.
- Add a Playwright snapshot per theme × per student route to lock the visual contract.

**If Path 2 (harmonise):**
- Remove `--color-student-primary` and `--gradient-student-page` from `globals.css`.
- Replace `border-student-primary`, `bg-[image:var(--gradient-student-page)]`, and any `text-student-*` usages with `text-brand` / `bg-shell-bg` equivalents.
- Audit: `grep -r "student-primary\|gradient-student" frontend/src` must return zero results.
- Confirm `/my-results/[sessionId]` and `/my-exams` still feel distinct enough from authoring pages via their content layout alone (StatCards, EmptyState, page width).

**Files touched (both paths):**
- `frontend/src/app/globals.css`
- `frontend/src/app/my-results/[sessionId]/page.tsx`
- `frontend/src/app/my-exams/page.tsx`
- `frontend/src/app/my-grades/page.tsx`
- `frontend/src/components/exam/SubmissionConfirmation.tsx`

---

## TODO-002 — Focus-Ring Inconsistency (a11y)

**Status:** Ready to execute (small ticket, not Epoch-sized).
**Surfaced in:** Epoch 8.4 design audit.

### 👤 For David

Three different focus styles in the codebase:
- `focus:outline-none focus:border-brand` — used on most inputs
- `focus-ring` utility class — used on some buttons
- `focus:outline-none focus:ring-2 focus:ring-brand` — used in a few spots

This is an accessibility issue. Keyboard users tabbing through the app see inconsistent visual feedback for "where am I?", which makes navigation harder than it needs to be. Also fails WCAG 2.4.7 (Focus Visible) under strict interpretation.

**Recommended fix:** Pick one canonical focus style — I'd recommend the `focus-ring` utility class (it already exists, semantic name, easy to tune in one place) — and migrate everything to it. A few hours of mechanical work.

**Decision needed:** Approve the standardisation pass? Either bundle into the next Epoch or do as a stand-alone `chore:` PR.

### 🤖 For the AI (execute after approval)

- Locate the `focus-ring` utility definition (likely in `frontend/src/app/globals.css` or a Tailwind plugin). Confirm it produces a 2px ring in `--color-brand` with `outline-offset: 2px` and `outline: none`.
- If the definition is not sufficient (e.g., contrast inadequate in light-blue theme), revise it once.
- Grep for all three patterns and migrate to `focus-ring`:
  ```bash
  grep -rn "focus:outline-none focus:border-brand\|focus:ring-2 focus:ring-brand" frontend/src
  ```
- Replace each match with the appropriate `focus-ring` invocation. Confirm visually that no element loses its focus indicator.
- Run Playwright a11y scan (`@axe-core/playwright`) — confirm zero new violations.
- Commit: `chore(a11y): standardize focus-ring across all interactive elements`.

---

## TODO-003 — Mobile/Responsive Pass

**Status:** Needs its own Epoch.
**Surfaced in:** Epoch 8.4 design audit.

### 👤 For David

Only `GlobalHeader` has any real mobile treatment. Tables on `/items`, `/grading`, `/sessions`, and `/blueprint` overflow horizontally on narrow viewports — no card mode, no column hiding, no graceful fallback. The home dashboard barely cares about screen size below `md:`.

This isn't a bug; it's just that we've been designing desktop-first. But for an exam-taking platform, students will inevitably try to take exams on tablets and phones. Right now the experience would be bad.

**Scope of work** (rough sizing):
- Define breakpoint strategy (sm/md/lg/xl already in Tailwind; need a documented convention for when each kicks in).
- Tables → mobile card mode below `md` (each row becomes a stacked card with primary preview + overflow menu).
- Navigation → bottom-tab bar below `md` for students; condensed top bar for staff.
- Modals → full-screen below `sm`.
- Exam-taking screen → currently `max-w-4xl`, needs a phone-friendly question/option layout.
- Touch targets → minimum 44×44px per WCAG 2.5.5.

**Probably its own Epoch 8.5 or 8.6** — not just a stage in another epoch. Estimate ~2–3 days of work spread across all surfaces.

**Decision needed:** Schedule it now (next epoch after 8.4 wraps), defer until after Epoch 9 (Media), or wait until you have real student-mobile data showing it's needed?

### 🤖 For the AI (sizing only — execution requires a full blueprint)

This is too large for a single sprint without a blueprint. When approved, the work should be:
1. **Audit pass.** Document every surface that currently breaks below `md`. Output: a table in the new Epoch blueprint with surface × failure mode × proposed fix.
2. **Token additions.** `--touch-target-min: 2.75rem`; mobile-specific spacing tokens if needed.
3. **Component upgrades.** `<Table>` gains a `mobileMode="cards"` variant. `<PageShell>` gains responsive padding. `<GlobalHeader>` extends its current `md:hidden` collapse.
4. **Surface-by-surface.** Items, grading, sessions, blueprints, my-exams, my-grades, exam-taking, my-results, analytics — each gets a stage.
5. **E2E.** Playwright tests with mobile viewport (`{ width: 375, height: 667 }`) per critical flow.

Do not attempt this incrementally without a blueprint — the responsive strategy needs upfront design, not piecemeal patches.

---

## TODO-004 — Account Settings Page (placeholder from Epoch 8.4)

**Status:** Placeholder route shipped in Epoch 8.4; real implementation deferred.
**Surfaced in:** Epoch 8.4 Stage 7 (account dropdown).

### 👤 For David

The Stage 7 account dropdown links to `/account` which renders a "Coming soon" empty state. Eventually this page needs to actually do something.

**Minimum useful contents:**
- Change password
- Update display name / email (if mutable in your domain)
- Theme preference (currently lives in localStorage; could be persisted to user record)
- Sign out (already in dropdown)
- Delete account / data export (GDPR — VU Amsterdam is in scope for EU data law)

**Decision needed:** When does this get prioritised? It's not flashy but it's table-stakes for a production system. Suggest folding into a future "polish & compliance" epoch.

### 🤖 For the AI (execute after blueprint approval)

- Page: `frontend/src/app/account/page.tsx`.
- Backend endpoints (under `backend/app/api/endpoints/users.py`):
  - `PATCH /users/me` — update display name; existing endpoint may cover this.
  - `POST /users/me/password` — old + new password, bcrypt verify.
  - `GET /users/me/export` — JSON dump of user's data (GDPR Article 20).
  - `DELETE /users/me` — soft-delete with grace period (GDPR Article 17).
- Service layer: `users_service.py` gains `update_password`, `export_user_data`, `request_account_deletion`.
- Tests: cover password verification failure path; export contains expected entity types; deletion sets `deleted_at` not row removal.
- All endpoints `require_role(...)` with the user being the resource owner.

---

## TODO-005 — Chart Series Token Family

**Status:** Folded into Epoch 8.4 Stage 15a (token hardening).
**Note:** When implementing Stage 15a, define `--color-chart-series-1` through `--color-chart-series-N` (start with N=4, extend as needed) in `globals.css` for all three themes. Replace inline `text-cyan-400` and similar in `PDValueTrendChart.tsx` with the new tokens. Document the palette in CLAUDE.md §7.1.

**Action:** No separate todo — execute as part of Epoch 8.4. Listed here only so future chart work knows where the palette lives.

---

## TODO-006 — Story Matrix / Visual Regression

**Status:** Optional from Epoch 8.4 Stage 14.
**Surfaced in:** Epoch 8.4 stage 14 ("Story matrix (optional but encouraged)").

### 👤 For David

The Epoch 8.4 blueprint mentions that *if feasible*, a Storybook-style component matrix would help lock in visual regressions across themes. Right now we have zero protection against someone accidentally breaking the look of a `<Badge>` or `<StatCard>`.

**Two ways to do this:**
1. **Add Storybook.** Industry standard, good DX, ~half-day setup, ongoing maintenance per component.
2. **Playwright visual regression.** Take screenshots of a `/dev/components` route showing each primitive in all three themes; commit baselines; assert diff in CI. Lighter weight, no Storybook dep.

Either works. Playwright is probably the better fit since we already use it for E2E.

**Decision needed:** Adopt either, or live without it for now?

### 🤖 For the AI (execute after approval)

**If Playwright path:**
- New route: `frontend/src/app/dev/components/page.tsx` — gated to dev env only (`if (process.env.NODE_ENV === 'production') return notFound()`).
- Renders one instance of each primitive (Button×variant, Badge×tone, Card×variant, Spinner×size, BlueprintStatusBadge×status, …).
- New test: `frontend/tests/visual.spec.ts` — for each theme `['dark', 'warm', 'light-blue']`, navigate to `/dev/components`, set theme, screenshot, compare to baseline.
- Commit baselines under `frontend/tests/__screenshots__/`.

**If Storybook path:** Larger lift, write a separate blueprint first.

---

## TODO-007 — Backwards-Compatibility Cleanup

**Status:** Tracked, awaiting a future epoch.
**Surfaced in:** Epoch 8.4 Stage 1 (status semantics).

### 👤 For David

Epoch 8.4 will introduce the new `BlueprintStatus` enum but keep the legacy `is_locked` and `is_permanently_locked` booleans on the `BlueprintUsage` API response for "one release" for backwards compatibility.

Need to remember to actually delete those booleans after the next epoch. Common drift trap: legacy fields linger forever because no one circles back.

**Decision needed:** Schedule the cleanup for Epoch 9 (Media Library) closing tasks, or a dedicated `chore:` PR right after Epoch 8.4 ships?

### 🤖 For the AI (execute after approval)

- Remove `is_locked` and `is_permanently_locked` from `BlueprintUsage` Pydantic model in `backend/app/api/endpoints/tests.py`.
- Grep frontend for any remaining consumer of those fields. Should be zero if Epoch 8.4 was done right, but verify:
  ```bash
  grep -rn "is_locked\|is_permanently_locked" frontend/src
  ```
- Update API consumers to read `status` instead.
- Commit: `chore: remove legacy is_locked/is_permanently_locked booleans (superseded by status enum)`.

---

## TODO-008 — Sort State Persistence

**Status:** Awaiting decision (small, would fit in any near-term epoch).
**Surfaced in:** Epoch 8.4 second-pass audit.

### 👤 For David

Tables on `/items`, `/grading`, `/blueprint` reset their sort state on every navigation. If you sort the question library by Subject ascending, click into a question, and come back — sort defaults to "Last edited descending" again. Annoying.

Epoch 8.4 already adds filter persistence for blueprints. Sort persistence is the same pattern, applied to sort.

**Tradeoff:** Persisting per-table sort across sessions means returning users see the same view. Persisting in `sessionStorage` only would scope it to the browser tab.

**Recommendation:** sessionStorage. Persisting across browser restarts feels presumptuous; persisting across navigations within a tab is just "what users expect".

**Decision needed:** Adopt sessionStorage-scoped sort persistence? Fold into Epoch 8.5 / 9 closing tasks or its own `feat:` PR?

### 🤖 For the AI (execute after approval)

- For each sortable table, add the table's `(sortKey, sortDir)` tuple to its owning Zustand store with the `persist` middleware configured with `storage: createJSONStorage(() => sessionStorage)`.
  - Items: `useLibraryStore` (already exists for `lastEditingLoId`) — add `librarySort: { key, dir }`.
  - Grading: `useGradingStore` — add `gradingSort: { key, dir }`.
  - Blueprint list: not currently sortable, but if it becomes so, same pattern.
- The local component state for sort is removed; the store value is read instead.
- Acceptance: sort an item table → navigate to author → return → sort persists.

---

## TODO-009 — Bulk Actions in Question Library

**Status:** Feature request — needs blueprint, not just decision.
**Surfaced in:** Epoch 8.4 second-pass audit.

### 👤 For David

Right now every action on `/items` is single-row. An educator with 200 questions in their bank can't:
- Bulk-duplicate a selection (e.g., to make variants).
- Bulk-export.
- Bulk-delete unused/orphaned questions.
- Bulk-retag (set Subject = "Algorithms" on 30 questions at once).

For early-stage usage this is fine. As item banks grow it becomes painful.

**Out of scope for Epoch 8.4** because it's a feature, not a design pass. Wanted to capture it before it slips through the cracks.

**Decision needed:** Schedule as part of Epoch 10+ ("Item bank power features"), or wait until users complain?

### 🤖 For the AI (execute after blueprint)

This needs a blueprint, not a one-shot ticket. The blueprint should cover:
- Checkbox column in items table (gated to staff roles).
- Sticky bulk-action bar at table bottom when ≥ 1 row selected.
- Backend bulk endpoints: `POST /learning-objects/bulk/duplicate`, `POST /learning-objects/bulk/delete`, `POST /learning-objects/bulk/retag`.
- Authorization: bulk-delete blocked when any item in selection is locked.
- E2E tests for partial-failure cases (some items lock-protected, others not).

---

## TODO-010 — Practice Button Semantics on Scheduled Sessions

**Status:** Question for product.
**Surfaced in:** Epoch 8.4 second-pass audit.

### 👤 For David

`ScheduledSessionsTable` shows a "Practice" button on planned sessions. But "Practice" is conceptually a blueprint-level thing — you practice a *blueprint*, not a *scheduled exam window*. Showing this in the sessions table might be confusing:

- "Practice this session" — does that mean go take it now, ignoring the schedule?
- Or just "practice the blueprint this session was built from"?

Right now the button does the latter (calls `startPracticeSession(testDefinitionId)`).

**Two options:**
1. **Remove the button from session rows.** Move practice to the blueprint card (where Epoch 8.4 already places it). Users practice from blueprints, not from sessions.
2. **Rename the button to "Practice blueprint"** to make the intent explicit while keeping the shortcut.

**Recommendation:** Option 1. Cleaner mental model.

**Decision needed:** Remove or rename?

### 🤖 For the AI (execute after decision)

**If Option 1 (remove):**
- Remove the `onPractice` prop chain from `ScheduledSessionsTable` and its child `SessionTable`.
- Remove the corresponding column / row action.
- Confirm practice is still reachable from `/blueprint` (Epoch 8.4 Stage 8 ensures this).

**If Option 2 (rename):**
- Change the button label from `Practice` to `Practice blueprint`.
- No code semantics change.

---

## TODO-011 — Email-based Password Reset

**Status:** Awaiting infrastructure (email transport).
**Surfaced in:** Epoch 9 (Account & Settings).

### 👤 For David

Epoch 9 ships *authenticated* password change — a logged-in user rotating their own
credential. It does **not** cover the "I forgot my password and can't log in" flow,
because that requires sending an email with a time-limited reset token, and we don't
run an email service (SMTP or a provider like Postmark/SES) yet.

**Decision needed:** Which email transport do we adopt, and when? Until then, a
locked-out user must be reset by an admin.

### 🤖 For the AI (execute after decision)

- Add an email transport abstraction (`services/email_service.py`) with a provider
  driver behind an interface; config in `.env`.
- `POST /api/auth/forgot-password` (always `204`, no user enumeration) → mint a
  single-use, short-TTL reset token (store a hash, not the token).
- `POST /api/auth/reset-password` → verify token, set new hash, bump `token_version`
  (reuse the Epoch 9 session-invalidation spine).
- Rate-limit both endpoints.

---

## TODO-012 — Password Strength Hardening

**Status:** Deferred (additive, low risk).
**Surfaced in:** Epoch 9 (Account & Settings).

### 👤 For David

Right now the only password rule is `min_length=8` (shared by register and the new
change-password flow). That's a low floor. We could require a mix of letter + digit
(and optionally a symbol) without much friction.

**Decision needed:** What's the policy? (e.g. ≥8 chars + at least one letter + one
digit.) Kept out of Epoch 9 so that epoch stays additive and doesn't retroactively
invalidate existing weak passwords on next login.

### 🤖 For the AI (execute after decision)

- Add a shared Pydantic field validator (`schemas/password.py`) encoding the policy.
- Reuse it in both `RegisterRequest` and `ChangePasswordRequest` (§2 single source —
  one rule, two consumers).
- Update frontend advisory client-side checks to mirror it (backend stays
  authoritative).
- Decide migration stance: enforce only on *new* passwords (recommended) vs. force a
  reset for non-compliant users.

---

## How to maintain this file

- **Adding an item:** Always include both 👤 and 🤖 sections. The 👤 section should be readable by someone who hasn't seen the code; the 🤖 section should be specific enough that an AI can execute it without re-research.
- **Promoting to an epoch:** When an item is added to an epoch blueprint, remove it from here. The blueprint becomes the source of truth.
- **Closing an item:** When work is shipped, delete the entry. This file is a *backlog*, not an *archive* — old items rot.
- **Re-prioritising:** If priority changes, edit the `Status:` line. Don't reorder the file by priority — items are stable by ID.
