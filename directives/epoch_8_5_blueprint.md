# Epoch 8.5 — Verification Debt + Targeted UX Corrections

> **Type:** Mixed — debt paydown (Stages 1–4) plus a targeted UX-correction batch (Stages 5–10) added after continued live use surfaced concrete issues in blueprint inspection, the question picker, analytics/grading information architecture, and the student exam viewport.
> **Scope:** Stages 1–4 are the original verification-debt set discovered during the Epoch 8.4 Stage 17/18 in-browser pass. Stages 5–10 are user-reported corrections that are small enough individually that none warrants its own epoch, but collectively reshape two top-level navigation surfaces (Analytics, Grading) and tighten three editor/student flows.
> **Origin:** Stages 1–4 were found walking every surface in Chrome across the three themes. Stages 5–10 were reported 2026-05-15 during continued use of the Epoch 8.4 build.
>
> **Guiding principle:** A verification pass that finds bugs but leaves them undocumented is worse than no verification. This Epoch closes the loop on both the verification debt *and* the corrections that surfaced once the platform was actually being used end-to-end.

---

## Stage Index

| # | Stage | Surface |
|---|---|---|
| 1 | Complete the color-token audit (exam components + widen the audit regex) | `src/components/exam/*`, `globals.css`, `CLAUDE.md` |
| 2 | Auth session persistence (survive hard navigation / refresh) | `useAuthStore`, app bootstrap, `ProtectedRoute` |
| 3 | Pre-existing backend test failures — triage & fix | `backend/tests/*`, versioning + accommodations services |
| 4 | Minor polish punch list | analytics index cards, misc |
| 5 | Blueprint inspect: full question + options + correct-answer hint | `BlueprintInspector`, new read-only question card |
| 6 | Blueprint inspect: truly read-only question inspection | `QuestionPickerModal` (inspect mode), question editor surfaces |
| 7 | Question picker: preview reliability + button-language consistency | `QuestionPickerModal` |
| 8 | Analytics IA: session-first, blueprint view secondary and hideable | `/analytics`, `/analytics/sessions/*`, `/analytics/tests/*` |
| 9 | Grading IA: session-first restructure (blueprint view removed) | `/grading`, grading routes & services |
| 10 | Exam take: next button reachable on small viewports | `frontend/src/app/exam/[id]/*`, exam footer/nav |

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
- **Fix:** Apply the same singular/plural rule — `1 section` / `4 sections` — to the analytics dashboard card meta. Extract a shared `pluralize(count, singular, plural?)` util in `src/lib/` — Stages 8 and 9 will also consume it (`1 participant` / `N participants`, `1 ungraded response` / `N ungraded responses`).

### Verification
- `/analytics` cards read `1 section` for single-section tests.
- `pluralize` util exists in `src/lib/` and is used by at least three call sites.

---

## Stage 5 — Blueprint Inspect: Full Questions With Options & Correct-Answer Hint

**Problem.** When an educator opens a blueprint in inspect mode and clicks a question, the inspector currently shows only metadata / a stem preview. To make inspection actually useful, the inspector should render the **full question** — stem, all options, and a *light* indication of which option is the correct answer — without leaving the inspect surface and without entering an editable form.

**Why "lightly indicating".** Inspect is for orientation, not authoring. A loud "CORRECT" badge competes with the question content. A muted accent (e.g. a check icon + `text-shell-muted` tone, or a subtle `border-l` on the option row) communicates the answer key without dominating.

### 🤖 For the AI
- **Build on Stage 6 first.** Stage 6 introduces the `<QuestionInspector>` primitive (a read-only viewer that is structurally distinct from the editor). Stage 5 *embeds* that primitive inside `BlueprintInspector` when a question row is selected. Implement Stage 6 → then Stage 5. Do not build two parallel read-only renderers.
- Use the existing read-only TipTap contract (`editor.setEditable(false)`, no toolbar, no caret — `CLAUDE.md` §7.7). The TipTap renderer **must use the same extension set as the editor** — images, KaTeX, code blocks, tables — or stems silently lose content. This is the same root cause as Stage 7's empty-preview bug; share the rendering component.
- **Per-question-type correctness rule.** "Correct" doesn't mean the same thing for every question type:
  - `SINGLE_CHOICE` / `MULTI_CHOICE` / `TRUE_FALSE` → muted `<CheckIcon />` on each correct option row.
  - `SHORT_ANSWER` / `FILL_IN_BLANK` → render the expected answer text (or accepted-answers list) in a muted `Expected:` line beneath the input-shaped placeholder. If a grading rubric exists, summarise it in a collapsed disclosure.
  - `MATCHING` / `ORDERING` → render the canonical pairing or order with a muted accent on the matched/positioned items.
  - Unknown / future types → render the raw options with no correctness marker rather than guessing; log a warning.
- Correctness marker style: a small `<CheckIcon />` plus tone-muted accent on the option row. No new color tokens — reuse `--color-success-fg` / `--color-success-border` at low opacity, or `text-brand` muted. Verify across all three themes.
- No new buttons, no edit affordances on this surface — see Stage 6.

### Verification
- Open any blueprint, switch to inspect, click each question type → full stem and options render, correct option(s) visibly but quietly marked, in all three themes.
- Question stems containing inline images, KaTeX, and code blocks render identically to how they appear in the live editor (smoke-check at least one of each).
- Locked / unlocked blueprints render identically (inspect is read-only either way).

---

## Stage 6 — Blueprint Inspect: Truly Read-Only Question Inspection

**Problem.** From inspect, clicking through to a question still drops the user into a UI where option text, correctness toggles, and other fields *look editable* — typing into them produces no save (the mutation is blocked server-side and the save button is hidden per `CLAUDE.md` §7.7), but the inputs still accept keystrokes. This is the exact "Inspect ≠ Edit" footgun §7.7 was written to prevent.

### 🤖 For the AI
- **Build `<QuestionInspector>` as a new primitive** under `src/components/items/` (or wherever the editor lives), structurally distinct from the editor — not the editor with `disabled` props. This is the primitive Stage 5 embeds and Stage 7's preview should also reuse.
- **Prop surface:** `{ item: LearningObject; showCorrectness?: boolean }`. Default `showCorrectness` to `true` (every current entry point is educator-side). Threading it as a prop now keeps the door open for future student-facing reuses (post-exam review, printed exams) without a fork.
- Options: render as static rows (no `<input>` elements). Correctness: muted icon, not a toggle. Metadata fields: plain text, not form inputs.
- **Scope — three entry points must route to `<QuestionInspector>`, not the editor:**
  1. The blueprint inspector's question-detail pane (Stage 5 host).
  2. The standalone item route `/author/items/[id]` when the item is **locked** (referenced by an `ONGOING` / `PASSED` blueprint per `CLAUDE.md` §8.2). Today this surface shows the editor with disabled inputs — the same §7.7 footgun on a different surface; fix it here.
  3. The `QuestionPickerModal` preview panel (Stage 7) — once `<QuestionInspector>` exists, the picker's inline preview should render through it for consistency.
- Cross-check `lib/blueprintPermissions.ts` and the `lockedQuestionIds` derivation (`CLAUDE.md` §8.1, §8.2) so the inspect surface and the lock guard share the same source of truth.
- **Authoring vs. inspect signal.** The route guard at `/author/items/[id]` decides which component to render: `lockedQuestionIds.has(id)` → `<QuestionInspector>`; else → editor. No URL change — same route, branched render — so existing deep links keep working.

### Verification
- Open a question via the blueprint inspector → no input is focusable, no text is selectable in a way that suggests edits, no save/cancel chrome present.
- Direct keyboard input on what was previously an editable field produces no visible change.
- Navigate directly to `/author/items/[id]` for an item locked by an `ONGOING` blueprint → renders `<QuestionInspector>`, not a disabled editor.

---

## Stage 7 — Question Picker: Preview Reliability & Button-Language Consistency

**Problem (three small issues, one surface — `QuestionPickerModal`).**

1. **Empty preview body.** When picking a question for a blueprint and clicking "Preview", the question text shows up for *some* items and is empty for most. The fetch / version-resolution path is inconsistent — at `QuestionPickerModal.tsx:92` the code falls back to a generic error, so silent empties point at the rendering side (TipTap JSON vs HTML, or a missing `latest_version` join) rather than the network.
2. **"Preview" is a text link, not a button.** It currently renders as plain text (`title="Preview question details"`). Sits next to the prominent "Add" button. Mixed affordance: one looks tappable, the other doesn't.
3. **"Select This Question" vs "Add" inconsistency.** In list rows the action button reads "Add" / "Added" (`QuestionPickerModal.tsx:302`). Inside the preview detail panel the equivalent action reads "Select This Question" / "Already Added" (`:199`). Two labels for the same action.

### 🤖 For the AI
- **Fix the empty preview by routing through `<QuestionInspector>` (Stage 6).** The empty-preview bug and the inspector's read-only viewer have the same root cause: TipTap content rendered with the wrong extension set drops images/KaTeX/code-blocks silently. Once Stage 6 ships `<QuestionInspector>`, the picker preview panel renders through it. No standalone preview renderer.
- **Preserve the existing failure copy.** Today the fetch error path shows `Failed to load question preview.` inline (`QuestionPickerModal.tsx:92`). Keep this as an inline state inside the preview panel — do not move it to a toast. (Toasts are for transient outcomes; this is a panel-level empty/error state, closer to `<EmptyState>` per §7.3.)
- **Promote "Preview" to a button** paired with "Add". Use the existing `<Button>` primitive at `size="sm"`: `variant="secondary"` (or `ghost`, whichever the design system already exposes for muted CTA) for Preview, `variant="primary"` for Add. The tone hierarchy carries the visual weight — keep both as full text buttons so the action affordance is unambiguous; do **not** downgrade Preview to an icon-only button. Same primitives inside the preview panel.
- **Unify the label to "Add" / "Added"** everywhere in the picker — list row *and* preview panel. Drop "Select This Question". The button is the action; the panel context already makes it clear which question is being added.
- Mind `CLAUDE.md` §7.10 toast/copy rules: title sentence case, no terminal punctuation.

### Verification
- Open the question picker on any blueprint, click "Preview" on five different questions of varying types → stem renders correctly every time (including questions with images, KaTeX, and code blocks).
- "Preview" and "Add" sit side-by-side as buttons in both list rows and the preview panel.
- No occurrence of "Select This Question" remains: `grep -r "Select This Question" frontend/src` is empty.
- The picker preview panel renders through the same `<QuestionInspector>` Stage 6 introduces — verified by component import (`grep`).

---

## Stage 8 — Analytics IA: Session-First, Blueprint View Secondary & Hideable

**Problem.** The current `/analytics` surface aggregates **per blueprint**, which conflates every session of a given blueprint into one view. The natural mental model for an educator reviewing real cohorts is **per session (completed)**: "How did the May 14 sitting of Algebra Midterm go?" — not "how has Algebra Midterm performed historically across all sittings". The per-blueprint view is still occasionally useful for longitudinal comparison, but it should not be the default landing nor the most prominent option.

### 🤖 For the AI
- **Two tabs** at `/analytics`:
  - `Sessions` (default, primary) — list of *completed* exam sessions with session details (blueprint name, scheduled start, finished-at, participant count, mean score) and a click-through to a per-session analytics detail page at **`/analytics/sessions/[sessionId]`**.
  - `Blueprints` (secondary) — the existing per-blueprint analytics, unchanged in content; demoted to a tab. Routes remain `/analytics/tests/[testId]`.
- **Feature-flag mechanism.** Use a single env flag — name it `NEXT_PUBLIC_ANALYTICS_BLUEPRINT_TAB` for symmetry with existing public flags. **Build-time is acceptable here**: flipping it off in this codebase means a redeploy, which the user has accepted as a one-way switch ("they may switch it off entirely"). If a runtime toggle is later desired, promote to a settings-table entry then; do not over-engineer now. Flag defaults to **enabled**. When false: hides the tab, removes any global-nav entry, and **redirects `/analytics/tests/*` → `/analytics`** (not 404 — a redirect keeps any internal links and bookmarks alive without surfacing dead routes).
- **Authorization scope.** The Sessions tab shows sessions for blueprints the educator **owns or co-authors**. `/analytics/sessions/[sessionId]` route handler must re-assert the same check — frontend filtering is advisory; `403` is authoritative (`CLAUDE.md` §1). Cross-org leakage is the failure mode to guard against.
- **Mean-score column with partial grading.** If a session contains responses still awaiting manual grading, the column shows `Pending` rather than a misleading partial score. If grading is complete, show the percentage. Sort behavior on this column: pending sessions sort last regardless of direction.
- **Backend service.** The session-analytics detail page reuses the existing `/analytics/tests/[testId]` decomposition (same charts and breakdowns) scoped to a single session. The analytics service needs a `session_id` filter on its aggregate queries — confirm whether one already exists (`grep` `session_id` in `backend/app/services/analytics_*`). If a new query path lands, add an index on `(session_id, ...)` for the hot columns — that **is** a DB migration; flag it in the PR description.
- **Surface conventions.**
  - `<PageShell width="wide">` for the list; `width="standard"` for the per-session detail (matches `/grading/[sessionId]`).
  - Lifecycle labels per `CLAUDE.md` §7.9 — list filters on `COMPLETED` sessions only; do not invent parallel vocabulary.
  - `<EmptyState>` per §7.3 when no completed sessions exist for the educator (title: `No completed sessions yet`; description: `They'll appear here once your scheduled sessions finish.`).
  - **Default sort:** `finished_at DESC` (most recent first). Secondary sort by blueprint name.
  - **Pagination:** standard list-endpoint pagination per `CLAUDE.md` §4. Page size 25.
  - Pluralization util — finish what Stage 4a started; the session card meta will need it for `1 participant` / `N participants`.
- **Data scope.** Only `COMPLETED` sessions appear. `CANCELED` sessions are excluded — they have no analytics value and including them would compete with the session-list signal. If a future need surfaces, open a follow-up; do not add a filter chip preemptively.

### Verification
- `/analytics` lands on the Sessions tab; the Blueprints tab is visible and switchable.
- Sessions list shows only sessions for blueprints the logged-in educator owns; an educator without any completed sessions sees `<EmptyState>`.
- `/analytics/sessions/[sessionId]` 403s for an educator who does not own the underlying blueprint.
- Mean-score column shows `Pending` for sessions with un-graded responses; numeric percentage for fully graded sessions.
- Setting the feature flag false removes the Blueprints tab, the global-nav entry (if present), and redirects `/analytics/tests/[id]` → `/analytics`.
- Session detail page renders for any completed session with the expected breakdowns.

---

## Stage 9 — Grading IA: Session-First Restructure (Blueprint View Removed)

**Problem.** Same diagnosis as Stage 8: grading is meaningful per **completed session**, not per blueprint. Unlike analytics, the per-blueprint grading view has **no longitudinal use case** — you grade the sitting you ran, not the abstract blueprint. The per-blueprint grading view should be removed outright.

### 🤖 For the AI
- Restructure `/grading` to land directly on a list of **completed sessions awaiting grading** (or with grading in progress). No tabs, no blueprint grouping above the session list.
- Existing `/grading/[sessionId]` detail page (the per-session grading workbench) keeps its current behaviour and remains the click-through target — same routes, just different entry point.
- **Remove**, do not flag-hide, any per-blueprint grading aggregation routes and components. If a route like `/grading/blueprints/*` or `/grading?testId=` exists, delete it; if any global-nav link points at a blueprint-scoped grading view, repoint it at the session list. **Add a redirect** from each deleted route → `/grading` (301 server-side or a tiny client route that `router.replace`s) so any bookmarked or externally-linked URL survives the restructure rather than hard-404ing.
- Cross-check the grading service for any "all-sessions-of-a-blueprint" query that exists only to feed the blueprint view, and remove it too (with a search-and-confirm-no-other-callers pass).
- **Authorization scope.** Same rule as Stage 8: educator sees sessions for blueprints they own or co-author; both the list endpoint and `/grading/[sessionId]` re-assert it. Backend `403` is authoritative.
- **Ungraded-response count is likely new.** Today the session model probably exposes per-session response counts but not specifically "ungraded responses awaiting manual grading". Confirm — if the field doesn't exist, add a service-layer aggregator (`COUNT(response WHERE manual_grade IS NULL AND requires_manual_grading)`) and surface it on the session list payload. Add a backend test for it.
- **List columns at minimum:** blueprint name, session finished-at, participant count, ungraded-response count, grading status (`Not started` / `In progress` / `Complete`), "Open" action.
- **Default sort:** ungraded-response count DESC (sessions needing the most work first), then finished-at DESC. Sessions with zero ungraded responses still appear (an educator may want to revisit) but sort to the bottom.
- **Pagination + empty state:** standard pagination per §4 (page size 25); `<EmptyState>` per §7.3 — title `No sessions to grade`, description `Completed sessions appear here when they need manual grading.`
- Reuse `RowActionMenu` for any 3+ row-action case (`CLAUDE.md` §7.3).

### Verification
- `/grading` shows a session list and only a session list. No blueprint grouping.
- No remaining route or component named like `*grading*blueprint*`; `grep -ri "grading.*blueprint\|blueprint.*grading" frontend/src` returns only references that have been intentionally retained (and each is justified inline).
- Each deleted per-blueprint grading route returns `301` → `/grading` (or equivalent client redirect on hit).
- `/grading` 403s an educator from sessions on blueprints they don't own.
- Ungraded-response count populates on every session row; backend test green.
- Session detail workbench unchanged in behaviour.

---

## Stage 10 — Exam Take: Next Button Reachable on Small Viewports

**Problem.** During an exam, a student on a small browser window (laptop side-by-side, small external display, scaled-up font) must scroll the question content to reach the Next / Previous button. On stem-heavy questions the button row falls below the fold *and* is visually occluded by the already-fixed `TimelineNavigator` at the bottom — a student reported it as "kinda very hidden and I cannot access it". This is a focus-mode usability bug, not a general responsive pass.

**Current state (audited 2026-05-15, `frontend/src/app/exam/[id]/page.tsx`).**
- Top: sticky header with timer + `Submit exam` button (always visible — this is the existing review/confirm trigger, separate concern from Next/Previous).
- Middle: scrollable `<main>` containing `<QuestionRenderer>` followed by an **inline** Prev / Next button row (`page.tsx:212–238`). This row scrolls with the question — that's the bug.
- Bottom: `<TimelineNavigator>` is `fixed bottom-0 left-0 right-0 z-20` (`TimelineNavigator.tsx:30`). Two issues: (a) `z-20` violates `CLAUDE.md` §7.4.1's `z-30` for sticky surfaces; (b) when the inline Prev/Next row is scrolled into view, it sits *above* the timeline but still scrolls away.

**Note.** `/exam/[id]` is a documented `PageShell` exception (full-bleed focus mode — `CLAUDE.md` §7.5). That is *why* its layout was hand-rolled and *why* the navigation footer was never validated against short viewport heights.

### 🤖 For the AI
- **Move the Prev / Next row out of scrollable `<main>`** and into a sticky exam footer that composes with `<TimelineNavigator>`. Two acceptable shapes; pick whichever reads cleaner during implementation:
  1. **Single composite footer** — one fixed surface containing the timeline strip on top and the Prev/Next row beneath it. Simpler stacking, one source of truth for footer height.
  2. **Two stacked fixed surfaces** — timeline pinned to bottom, Prev/Next pinned directly above it. Easier to keep the existing `TimelineNavigator` component untouched, harder to keep heights/safe-areas in sync.
- **Bump `TimelineNavigator` from `z-20` → `z-30`** to align with §7.4.1's sticky-surface layer. The new Prev/Next row sits at the same `z-30` if composited, or directly above it if stacked.
- **Submit stays in the header**, unchanged. The `Submit exam` button (header, top-right) already triggers `setShowReview(true)` → `<ReviewSummary onConfirm={handleSubmit}>` confirm flow. Stage 10 does **not** touch Submit's path — only Prev/Next reachability is in scope. Confirm in PR that no behaviour change to Submit/review/confirm has slipped in.
- **Stage 1 overlap.** The existing Next button uses `bg-brand text-white` (`page.tsx:231`) — `text-white` is the same hardcoded-color class Stage 1's widened audit will catch. While you're in this file, replace with the appropriate token (`text-[var(--color-brand-foreground)]` or whatever Stage 1 settles on); Stage 1 and Stage 10 share an implementer for this reason.
- **Short-viewport floor.** Header (~64 px) + composite footer (timeline strip + button row, ~96 px) + minimum content area = the layout's minimum height. At viewport heights **above** ~480 px, the footer is fixed and content scrolls. At viewport heights **below** ~480 px (extreme zoom / very small windows), unstick the footer and let the whole page scroll — fixed footers consume content space they no longer have. Use a `min-h-[480px]` breakpoint or a media query, your call.
- Mind the bottom safe-area on mobile (`env(safe-area-inset-bottom)`).
- No new tokens; reuse `bg-shell-surface` / `border-shell-border-deep` for the footer chrome. Verify in all three themes.
- Touch-target sizing: minimum 44×44 px hit area on Next / Previous (the actions a student is most likely to misclick under exam pressure).
- This is **not** a full mobile pass — `TODO-003` still owns that. We are fixing one specific reachability bug on the exam-take surface.

### Verification
- Resize browser to ~600 px tall, take a seeded exam → Next/Previous are always visible without scrolling, regardless of question stem length.
- Resize to ~400 px tall → footer un-sticks and the whole page scrolls; Next is reachable by scrolling once, no double-stuck overlap.
- `Submit exam` flow unchanged — `<ReviewSummary>` confirm modal still opens from the header.
- All three themes verified with a live session (paired with the Stage 1 visual pass — share the seed).
- Keyboard: `Tab` reaches Next without first paging through the question content; `Enter` advances.
- `TimelineNavigator` now renders at `z-30`.

---

## Out of Scope

- The deferred backlog in `directives/todo.md` (TODO-001…010) is unchanged by this Epoch — in particular **TODO-003 (Mobile/Responsive Pass)** still needs its own dedicated Epoch and is the natural large-ticket successor. Stage 10 fixes one acute reachability bug; it does **not** discharge TODO-003.
- New design-system tokens beyond the exam-navigation family in Stage 1 and (optionally) any muted correctness accent in Stage 5. No new radii, no new z-layers.
- A wholesale redesign of analytics or grading IA beyond the Sessions/Blueprints split described.

## Cross-Cutting Notes

- **DB migrations.** Stages 5–7 and 10 are route- and component-layer only — zero schema changes. Stages 8 and 9 may add an index on `(session_id, …)` for the analytics aggregate (Stage 8) and surface a new `ungraded_response_count` aggregator (Stage 9). Either is a backend-only change with a Prisma + SQLAlchemy migration — flag explicitly in the PR description so reviewers don't have to re-derive scope.
- **Linear tickets.** `CLAUDE.md` §6 — "if it's not tracked, it doesn't exist". Open a Linear issue per stage at epoch-open, linked to this blueprint. Stages 5+6 can share an issue (they share a primitive); Stages 8+9 should remain separate (different surfaces, different teardown profiles).
- **Verification artefacts.** Epoch 8.4 closed with per-theme screenshots of every changed surface. 8.5 has substantial visual changes in Stages 1, 5, 7, 8, and 10 — produce the same artefact set (dark / warm / light-blue per surface) at stage-close.
- **Implementation ordering.** Suggested sequence:
  1. Stage 4a (`pluralize` util) — unblocks Stages 8 and 9.
  2. Stage 6 (`<QuestionInspector>` primitive) — unblocks Stages 5 and 7.
  3. Stages 5 + 7 in parallel — both embed the primitive.
  4. Stages 1 + 10 in parallel — both touch the exam-take surface and share a verification seed.
  5. Stages 8 + 9 — independent of the above; can land at any point but pair well together (shared session-list pattern).
  6. Stages 2 and 3 — independent debt; slot wherever a fresh head is available.

---

## Exit Criteria (Epoch-Level)

- **Stages 1–4 (verification debt).**
  - Widened color audit returns zero hits; exam-taking screen verified across all three themes with a live session.
  - Hard refresh / deep-link on a protected route no longer logs the user out.
  - `pytest` exits 0 — all 4 pre-existing failures resolved.
  - `1 section` / `N sections` plural correct on `/analytics` index cards via a shared `pluralize` util.
- **Stages 5–10 (UX corrections).**
  - Blueprint inspector renders the full question (stem + options + muted correctness marker, per-type rule) for every question type, across all three themes, including stems with images/KaTeX/code blocks.
  - `<QuestionInspector>` exists as a structurally separate component from the editor and serves all three entry points (blueprint inspect, locked-item route, picker preview).
  - `QuestionPickerModal`: preview renders content reliably for every question type; Preview and Add sit side-by-side as buttons in both list and detail; "Select This Question" is gone everywhere.
  - `/analytics` lands on Sessions; new route `/analytics/sessions/[sessionId]` ships with authz gate; Blueprints tab demoted and hideable behind `NEXT_PUBLIC_ANALYTICS_BLUEPRINT_TAB`; mean-score column shows `Pending` for partially-graded sessions.
  - `/grading` lands on a session list only; per-blueprint grading routes/components/queries are deleted; deleted routes 301 → `/grading`; `ungraded_response_count` populates on every row.
  - Exam Prev/Next reachable at a 600 px viewport height in all three themes; un-sticks below ~480 px; Submit/review flow unchanged; `TimelineNavigator` at `z-30`.
- **Cross-cutting.**
  - Linear tickets opened per stage (5+6 may share); per-theme screenshots produced for Stages 1, 5, 7, 8, 10.
  - Any DB migrations (Stage 8 index, Stage 9 aggregator) called out explicitly in the PR description.
  - `tsc --noEmit` + `next build` pass.
  - Aikido scan: zero new Critical/High findings.
  - Conventional Commit subject: `feat(8.5): verification debt + UX corrections` (≤72 chars). Body lists the specific surfaces touched (inspect parity, picker, analytics/grading IA, exam footer) so the subject stays scannable in `git log --oneline`.
