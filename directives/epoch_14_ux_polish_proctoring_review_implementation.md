# Epoch 14 — UX Polish, Course Coherence & Proctoring Review

> **Status:** Implementation directive. Per `CLAUDE.md` §6, this file is the required blueprint before any implementation work begins.
> **Branch:** `feature/epoch-14-ux-proctoring-review`
> **Depends on:** Epoch 5 exam-taking (`useExamStore`, `QuestionRenderer`, keyboard nav), Epoch 6.5 session manager (`/sessions`, `ScheduledSessionsTable`), Epoch 7 analytics + Epoch 8.9.1 course association (course-grouped grading/analytics index), Epoch 8.4 blueprint lifecycle + design system (`RowActionMenu`, `BackButton`, `PageShell`), Epoch 9 account settings (`/users/me/preferences`), Epoch 11 SEB & proctoring (`proctoring_incidents`, monitor service/endpoints).
> **Primary objective:** A coherence-and-polish epoch. No new subsystems — instead we tidy surfaces that have accreted too many controls, make the proctoring record survive the exam window, and fix two concrete exam-taking bugs. Every change rides existing patterns (course grouping from grading/analytics, `RowActionMenu` overflow, origin-aware `BackButton`, the preferences PATCH flow).

---

## 1. Executive Summary

This epoch bundles a set of independent UX requests into one coherent pass. They share a theme: **reduce visual noise, finish half-built flows, and respect conventions already established elsewhere.**

1. **Blueprint list tidy-up (14.1).** Each blueprint card today exposes up to six inline buttons (Edit, Inspect, Practice, Duplicate, Copy ID, Delete). Demote the secondary ones into a `RowActionMenu` (three-dots), keeping only the two primary actions inline. Additionally, **group the blueprint list by course** exactly as `/grading` and `/analytics` already do, so the surface reads consistently.
2. **Inspect → editor back navigation (14.2).** Opening Inspect *from the editor* must return to the editor, not to the full list. Origin-aware back, mirroring `CLAUDE.md` §8.4.
3. **Exam-taking fixes (14.3).** (a) Selecting an option must never bleed into other options when arrow keys are pressed — radio/checkbox inputs currently capture native arrow-key cycling. (b) Vertical arrows (`↑`/`↓`) must do nothing; only `←`/`→` navigate between questions.
4. **QTI export simplification (14.4).** The "Whole item bank ID" field is dead weight — the deployment only ever has one bank. Replace the paste-a-UUID field with a single **"Export all questions"** button.
5. **Home dashboard (14.5).** Show **every** surface the user's role can reach (not a curated four), retitle to *"What would you like to work on today, {name}?"*, and strip each tile to a **single label** — no description subtext, no arrow. The `{name}` is a user-editable **display name** set in account settings.
6. **Sessions table tidy-up (14.6).** Move all per-row controls into a `RowActionMenu`, matching 14.1.
7. **Proctoring review & log export (14.7).** The supervisor "monitor" is mis-named for a *completed* session — it is then a **review**. Make the recorded proctoring data (attempts + the full incident log) reachable from a completed session, and add a **downloadable incident log** (CSV) generated server-side. The monitor entry point is relabelled by lifecycle: **Monitor** while ongoing, **Review** once closed.
8. **Minimal auth surfaces (14.8).** The landing (marketing) and `/login` pages are reduced to the essentials — wordmark, one line, the sign-in affordance — and pinned to the **warm** theme regardless of the stored preference.
9. **Analytics combined-card gating (14.9).** Do not render the "Combined" cohort card when there are no completed sessions / submissions to combine.

The non-negotiable principle: **reuse before reinvention.** Course grouping is copied from `grading/page.tsx`, overflow menus from `RowActionMenu`, the display-name persistence from the existing `preferences` PATCH flow, the log download from `lib/download.ts`. No new design primitives.

---

## 2. Non-Negotiable Engineering Constraints (`CLAUDE.md`)

### 2.1 Security (§1)
- The new **display-name** field is free user input: validated by a Pydantic model (length-bounded, trimmed), sanitized on render (it flows into `text` nodes only — never `dangerouslySetInnerHTML`). Persisted via the authenticated `/users/me/preferences` surface; a user can only change **their own** name (`get_current_user`, no id in the path).
- The **incident-log export** endpoint reuses the existing proctoring authorization (`require_role(CONSTRUCTOR, ADMIN)` + `assert_can_proctor`). It is **read-only** and emits **no new PII** beyond what the monitor feed already returns (student email, incident metadata) — never answer contents, tokens, or raw fingerprints, per Epoch 11 §2.1.
- The **"export all questions"** endpoint is staff-gated identically to the existing bank export, and scopes to the caller's authorable banks (same ownership model as `export_bank`).
- Theme pinning on auth pages is presentational only — no security surface.

### 2.2 Maintainability (§2)
- Course grouping logic is **not** re-derived a fourth time inline. Grading and analytics each hold a private `groupByCourse`; this is the third+ occurrence, so per the "three is the limit" rule the helper is **extracted** to `frontend/src/lib/courseGrouping.ts` and consumed by the blueprint list (and left available for grading/analytics to adopt). Generic over the row shape.
- Home nav tiles and `GlobalHeader` links derive from **one** source: `frontend/src/lib/navigation.ts` (`navLinksForRole(role)`). No parallel hard-coded lists.
- Route handlers stay thin; CSV rendering lives in a service function, not the endpoint.
- No dead code: the bank-id state/handler in `QtiSection` is removed, not commented out.

### 2.3 Modularity (§3)
- New pure utilities live in `src/lib/` (`courseGrouping.ts`, `navigation.ts`). No React imports.
- Backend: incident export is a function in `proctoring/monitor_service.py` (or a sibling `incident_export.py`), exposed by one new route in `api/endpoints/proctoring.py`. Display-name persistence extends `preferences_service.py` + `schemas/preferences.py`.

### 2.4 Scalability (§4)
- The incident-log export streams a bounded query ordered by `created_at`; it reuses the indexed `scheduled_session_id` filter. It is an export (full set by design) but single-table, indexed, and staff-only — acceptable, like the existing QTI bank export.

### 2.5 Industry Standards / Design System (§5, §7)
- Tokens only; no literal Tailwind colors. Run the §7.1 audit before merge.
- `RowActionMenu` for 3+ row actions (§7.3). `BackButton` for back nav (§8.4, origin-aware). Lifecycle vocabulary (§7.9): the review entry point uses **Monitor** (ongoing) / **Review** (completed) — not "Past"/"Archived".
- Toast/confirm copy per §7.10. Date utils per §7.11.
- Conventional Commits, scoped `feat(14.x): …`. Theme matrix (§7.12) verified for the home dashboard and settings; the auth pages are deliberately pinned to warm (documented exception).

---

## 3. Stage Breakdown

| Stage | Scope | Primary files |
|---|---|---|
| 14.1 | Blueprint list: overflow menu + course grouping | `app/blueprint/page.tsx`, `lib/courseGrouping.ts` |
| 14.2 | Inspect → editor origin-aware back | `app/blueprint/page.tsx` |
| 14.3 | Exam keyboard nav + option-selection fix | `app/exam/[id]/page.tsx`, `components/exam/MCQQuestion.tsx`, `MultipleResponseQuestion.tsx` |
| 14.4 | QTI "Export all questions" | `components/integrations/QtiSection.tsx`, `api/endpoints/qti.py`, `services/qti/export_service.py` |
| 14.5 | Home dashboard: all tabs, single label, display name | `app/page.tsx`, `lib/navigation.ts`, `components/layout/GlobalHeader.tsx` |
| 14.6 | Sessions table overflow menu | `components/sessions/ScheduledSessionsTable.tsx` |
| 14.7 | Proctoring review + CSV log export | `ScheduledSessionsTable.tsx`, `app/sessions/[scheduledId]/monitor/page.tsx`, `api/endpoints/proctoring.py`, `services/proctoring/monitor_service.py` |
| 14.8 | Minimal warm auth pages | `app/page.tsx` (marketing), `app/login/page.tsx` |
| 14.9 | Analytics combined gating | `app/analytics/tests/[testId]/page.tsx` |
| 14.x | Display-name backend + settings UI | `prisma/schema.prisma`, `schemas/auth.py`, `schemas/preferences.py`, `services/preferences_service.py`, `api/endpoints/preferences.py`, `components/account/*`, `stores/useAuthStore.ts` |

---

## 4. Detailed Design Notes

### 14.1 Blueprint list
- Keep **Edit** (or **Inspect** when locked) + **Practice** inline. Move **Duplicate**, **Copy ID**, **Inspect** (when editable), **Delete** into `RowActionMenu`. Delete keeps `tone:'danger'`.
- Group by `course_id` → course title from `useCourseStore`. Blueprints with no course fall into a "Practice & other" / "Unassigned" trailing group, matching grading. Preserve the existing status-filter chips and search/sort toolbar above the groups.
- The course **filter** dropdown becomes redundant with grouping but is retained (it narrows to one group) — acceptable; do not remove existing affordances unnecessarily.

### 14.2 Inspect back nav
- Track origin. When entering inspect from the editor (`?id=…&inspect=true&from=editor`), the inspector's `BackButton` returns to `/blueprint?id=…` (editor) with label "Back to editor". Otherwise it returns to the list ("All blueprints"). Read `from` query param (§8.4 origin-aware).

### 14.3 Exam fixes
- In `app/exam/[id]/page.tsx` keydown handler: remove `ArrowDown`/`ArrowUp` from navigation; `←`/`→` only. For vertical arrows, `preventDefault()` and no-op so they cannot scroll questions.
- Stop radio/checkbox native arrow cycling: the global handler must `preventDefault()` arrow keys **even when a radio/checkbox is focused** (today it early-returns for `HTMLInputElement`, letting the browser cycle the radio group). Continue to early-return only for genuine text entry (`HTMLTextAreaElement`, `contentEditable`). This guarantees "selecting an option then pressing an arrow" navigates (←/→) or does nothing (↑/↓) instead of changing the selection.

### 14.4 QTI export-all
- Backend: `GET /qti/questions/export-all` → exports every learning object the caller can author (reuse `export_learning_objects` over all ids, or add `export_all_questions`). Returns a zip like the bank export.
- Frontend: replace the "Whole item bank ID" `Field` with a single `Button` "Export all questions" calling the new endpoint via `downloadFile`.

### 14.5 Home dashboard
- `lib/navigation.ts`: `navLinksForRole(role): {name, href}[]` — the single source for both `GlobalHeader` and the home tiles. Move the existing `GlobalHeader` list here verbatim and have the header consume it.
- Home: title `What would you like to work on today, {firstName}?` where `firstName` = display name if set, else email local-part. Tiles render **one label only** — drop `description` and the `→`.

### 14.6 Sessions table
- Collapse Enrollments / Practice / Cancel / Copy ID / SEB download / Monitor|Review into a `RowActionMenu`. Keep the single most-primary action inline per row state if desired (e.g. **Monitor** while ongoing); everything else in the menu. Cancel keeps `tone:'danger'`.

### 14.7 Proctoring review + log export
- Completed/closed scheduled rows expose **Review** → the same `/sessions/[scheduledId]/monitor` page (data is durable: `exam_sessions` + `proctoring_incidents` persist; only live Redis presence is stale, which is expected post-close).
- Monitor page: title/subtitle adapt — "Exam monitor / Live status…" while ongoing, "Exam review / Recorded proctoring data…" once closed. Add a **Download log** button (always, but most useful post-close) that hits the export endpoint.
- Backend: `GET /scheduled-sessions/{id}/incidents/export` → `text/csv` attachment, columns: `created_at, student_email, incident_type, severity, source, detail`. Built in a service function; staff-gated + `assert_can_proctor`. `detail` JSON is serialized compactly.

### 14.8 Minimal warm auth pages
- Marketing landing + `/login`: strip rotating words, feature chips, marketing copy. Keep wordmark + one short line + the sign-in CTA/form. Force `data-theme="warm"` on these surfaces (scoped, not global) so they always render warm regardless of stored theme. Documented §7.5 exception already exists for these pages.

### 14.9 Analytics combined gating
- In `app/analytics/tests/[testId]/page.tsx`, render `CombinedCard` only when there is real data to combine (`combined && combined.submissions_total > 0`). When no sessions/submissions exist, the empty state stands alone.

### 14.x Display-name backend
- `prisma/schema.prisma` `users`: add `display_name String? @db.VarChar`. Apply with `prisma db push` (no Alembic — §Tech Stack).
- `schemas/auth.py UserPublic`: add `display_name: Optional[str]` and map it in `_nest_accessibility`.
- `schemas/preferences.py`: `DisplayNameUpdate { display_name: str | None }` (trim, max length e.g. 80).
- `preferences_service.py`: `update_display_name(user_id, name)`.
- `api/endpoints/preferences.py`: `PATCH /users/me/preferences/profile`.
- Frontend `useAuthStore`: carry `display_name`; a new `ProfileSettings` section (or extend `ProfileCard` into an editable name row) PATCHes and updates the store. Home reads it.

---

## 5. Testing (§5)
- **Backend:** display-name update (happy + over-length rejection); incident CSV export (happy: rows present & ordered; edge: empty session → header-only CSV; authz: student → 403); export-all-questions (happy + student 403).
- **Frontend/E2E (smoke):** exam arrow-key navigation no longer changes a selected option; home shows all role tabs with single labels; blueprint list groups by course; completed session exposes Review + log download.
- Manual: theme matrix for home + settings; warm-pinned auth pages.

## 6. Security Review
- Produce `directives/epoch_14_security_review.md` before merge: audit display-name input handling, the two new read endpoints' authz, and confirm no new PII in the CSV beyond the existing monitor feed.

## 7. Progress Matrix
- Track stages in `directives/epoch_14_progress_matrix.md`, updated incrementally as each stage lands (not batched).
