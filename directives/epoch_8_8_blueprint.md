# Epoch 8.8 — Enrollment Revamp, Analytics Literacy & Copy Cleanup

**Status:** ⬜ Planned. Branch off `main`. Authored 2026-05-20.

> **Type:** UX-correction epoch. A batch of distinct, mostly independent fixes surfaced through continued use of the Epoch 8.7 build: a full rework of the course-enrollment procedure, friendlier psychometric analytics, two broken back-navigation paths, a calendar guard, obsolete copy, and an import-format tweak.
> **Scope:** `courses` service/endpoints + enrollment drawer, grading per-submission navigation, the analytics test/drill-down surfaces, the session-scheduling date/time guard, sessions copy, the Question Library copy, and the import format guide + parser.
> **Origin:** User bug report on 2026-05-20.
>
> **Guiding principle:** Every rule the UI implies must be enforced at the backend service layer (`403`/`409`, not a disabled button). Every analytics label must be legible to a non-statistician professor. No new vocabulary, tokens, radii, or z-indexes — reuse what Sections 7–8 of `CLAUDE.md` already establish.

---

## Progress Tracking Matrix

Update the status cell as each substage lands. `⬜` not started · `🔵` in progress · `✅` done · `⛔` blocked.

| Stage | Substage | Surface | Backend? | Status |
|---|---|---|---|---|
| 1 | 1.1 Typeahead enroll (registered students only) | `CourseEnrollmentDrawer`, `StudentSearchSelect`, `useCourseStore` | — | ✅ |
| 1 | 1.2 Confirm-on-remove dialog | `CourseEnrollmentDrawer` | — | ✅ |
| 1 | 1.3 Hard removal (delete row, drop from roster) | `courses_service`, `useCourseStore`, drawer | ✅ | ✅ |
| 1 | 1.4 Freeze roster when course has ongoing/ended session | `courses_service`, endpoints, drawer | ✅ | ✅ |
| 1 | 1.5 Idempotent add — kill the "already enrolled" runtime error | `useCourseStore`, drawer | — | ✅ |
| 2 | — Per-submission grading back → run submissions list | grading run page + `[sessionId]` page | — | ✅ |
| 3 | 3.1 P-value shown as a percentage | `AllItemsTable`, `StatCard`, section panel, `analyticsFormat` | — | ✅ |
| 3 | 3.2 D-value labelled "Discrimination" with plain copy | `AllItemsTable`, section panel, `analyticsFormat` | — | ✅ |
| 3 | 3.3 Arrow-based column sort (reuse library `SortArrow`) | `AllItemsTable` | — | ✅ |
| 3 | 3.4 Readable "By section" panel | `SectionAnalyticsPanel` | — | ✅ |
| 3 | 3.5 Remove Version Trend from item drill-down | `analytics/items/[loId]`, deleted `PDValueTrendChart` | — | ✅ |
| 3 | 3.6 Fix drill-down back button | `analytics/items/[loId]`, `AllItemsTable` | — | ✅ |
| 3 | 3.7 Cut score = whole percentage | `CutScoreSlider` | — | ✅ |
| 4 | 4.1 Fix "Today" button jumping to wrong month | `DatePicker` | — | ✅ |
| 4 | 4.2 Disable past *times* on today in scheduling | `SessionCreateForm`, `TimePicker` | — | ✅ |
| 5 | 5.1 Retire "Session Manager" copy | `SessionCreateForm`, `SubmissionConfirmation` | — | ✅ |
| 5 | 5.2 Retire "Course Setup" copy | `SessionCreateForm` | — | ✅ |
| 5 | 5.3 "Learning objects" → "Questions" in Question Library | `items/page.tsx` | — | ✅ |
| 6 | — Require `Title:` in import format (when a `#BLUEPRINT` is declared) | `FormatGuideModal`, validator, persister | ✅ | ✅ |
| 7 | — Verification gates (tests, type/lint, build, grep) | backend + frontend | ✅ | ✅ |
| 8 | 8.1 Student result detail shows the full question (no `…`) | `my-results/[sessionId]` | — | ✅ |
| 8 | 8.2 Publish dialog: full details vs grades-only | grading run page, `Modal`, store, `session_results.details_visible` | ✅ | ✅ |
| 8 | 8.3 Hide inspect entry + block detail when grades-only | `my-grades`, detail route, results service | ✅ | ✅ |
| 8 | 8.4 Rename "View details" → "Inspect" as a real button | `my-grades` | — | ✅ |
| 8 | 8.5 Student inspect Back → `/my-grades` | `my-results/[sessionId]` | — | ✅ |
| 9 | 9.1 Drop cryptic "Across Test <id>" copy on item drill-down | `analytics/items/[loId]` | — | ✅ |
| 9 | 9.2 Section panel: drop Avg difficulty (dup of score); show Avg score as % | `SectionAnalyticsPanel` | — | ✅ |
| 9 | 9.3 Remove the Flagged Items section entirely | run analytics page, deleted `FlaggedItemsTable` | — | ✅ |
| 9 | 9.4 Flag filter survives a section change (no orphaned/empty state) | `AllItemsTable` | — | ✅ |
| 9 | 9.5 Fix section "Avg. score" >100% (normalise points to fraction of max) | `psychometrics_service` | ✅ | ✅ |
| 9 | 9.6 Sort All Items by Type and Flags | `AllItemsTable` | — | ✅ |
| 9 | 9.7 Item drill-down shows the full question stem (no `…`) | `items_service`, schema, `useLibraryStore`, `analytics/items/[loId]` | ✅ | ✅ |
| 9 | 9.8 Essay difficulty/discrimination = N/A; drill-down run-scoped + Avg. score card | `psychometrics_service`, `analytics/items/[loId]` | ✅ | ✅ |
| 9 | 9.9 "Avg. score" relabelled "Avg. difficulty"; stats count graded responses only ("Graded" column) | `SectionAnalyticsPanel`, `analytics/items/[loId]`, `AllItemsTable`, `psychometrics_service` | ✅ | ✅ |
| 9 | 9.10 Table Difficulty uses points-based difficulty (matches section/drill-down); drop row id | `AllItemsTable` | — | ✅ |
| 9 | 9.11 Exam timer auto-submit no longer crashes on an already-expired session | `exam/[id]` | — | ✅ |
| 9 | 9.12 Grading picker: closed run with 0 submissions says "Nothing to grade", not "Locked" | `grading/test/[testId]` | — | ✅ |
| 9 | 9.13 Time-out = auto-submit + auto-grade (timed-out attempts were never graded/counted) | `exam_sessions_service`, `interactions_service` | ✅ | ✅ |

---

## Stage 0 — Decisions

### 0.1 Enrollment removal is now hard, not soft

Today `remove_course_enrollment` flips `is_active = false` and the row stays in the roster, rendered as a disabled "Remove" button (`CourseEnrollmentDrawer.tsx:183`). The user wants the student gone from the list entirely.

**Decision:** `DELETE /courses/{course_id}/enrollments/{student_id}` performs a real `prisma.course_enrollments.delete`. The roster query returns only present enrollments; there is no "Inactive" state in the drawer anymore.

Why this is safe:
- A `course_enrollments` row carries no exam data — submissions live on `exam_sessions`, which reference the student directly, not the enrollment row. Deleting an enrollment does not orphan or cascade into any attempt.
- Re-enrolling is a fresh `create`, so the dormant "reactivate" branch in `add_course_enrollment` becomes dead code and should be removed (no dead code — Section 2).

Guard rail (see 0.2): deletion is refused once the course has a session that is ongoing or finished, so we never strip a roster mid-exam or rewrite history after the fact.

### 0.2 Roster is frozen once a course's exam has started or ended

> "you cannot meddle with enrollments when the session has started nor when its ended"

Enrollment is course-scoped; sessions are blueprint runs inside a course. The cleanest enforceable rule:

**A course's roster is mutable only while every scheduled session for that course is still `NEW`/`SCHEDULED` (in the future). The moment any session for the course becomes `ONGOING` or `COMPLETED`/`CANCELED`, both add and remove are refused.**

- Source of truth: a new `courses_service.is_course_roster_locked(course_id) -> bool` that asks `scheduled_sessions_service` whether the course has any session whose window has started (`starts_at <= server_now`). Reuse the existing lifecycle derivation — **do not** re-derive status inline (Section 8.1 spirit).
- Backend authority: `add_course_enrollment` and `remove_course_enrollment` call the guard and raise `409 Conflict` (`detail: "Roster is locked — this course has an exam that has already started."`) before mutating.
- Frontend advisory: the drawer fetches a `roster_locked` flag (extend the enrollments response, see 1.4) and, when locked, hides the add form and the per-row Remove buttons and shows an explanatory banner. Per Section 1 — the disabled button is advisory; the `409` is authoritative.

### 0.3 Analytics labels target a non-statistician

P and D stay as the underlying metrics, but the **primary visible label and value format** change:
- **P-value** → header reads `Difficulty` with the value rendered as a **percentage** (`72%`), since P *is* proportion-correct. Keep "P-value" only inside the existing `InfoTooltip`.
- **D-value** → header reads `Discrimination`. Value stays a 2-dp index (it is a correlation-like coefficient, not a percentage), but the tooltip leads with the plain-language meaning, and we add a one-word qualitative tag (`Good`/`Weak`/`Poor`) next to the number.

No new vocabulary is introduced into the lifecycle canon (Section 7.9); these are metric labels only.

---

## Stage 1 — Enrollment Procedure Revamp

Files: `frontend/src/components/sessions/CourseEnrollmentDrawer.tsx`, `frontend/src/stores/useCourseStore.ts`, `backend/app/services/courses_service.py`, `backend/app/api/endpoints/courses.py`, `backend/app/schemas/course.py`.

### 1.1 Typeahead enrollment (registered students only)

Replace the `<select>` dropdown of all candidates (`CourseEnrollmentDrawer.tsx:106`) with a typeahead:
- Input filters `studentCandidates` (already fetched via `GET /courses/student-candidates`) client-side by `email` substring as the user types.
- Show a small results dropdown (max ~8 rows); clicking a row selects that student's `id`. Enroll uses `{ student_id }`, never a free-typed string — this keeps "only already-registered students" true by construction.
- Already-enrolled students must be excluded from the suggestion list (filter out emails already in `enrollments`) so a professor can't pick someone who's on the roster — this is the front-line fix for the runtime error in 1.5.
- No new component primitive needed if a combobox doesn't already exist in `src/components/ui/`; if it doesn't, add a minimal `Combobox`/`StudentSearchInput` *there* (Section 7.3 — don't inline), token-styled, keyboard-navigable (↑/↓/Enter/Esc), `role="listbox"`.
- The "Add many" bulk-paste mode stays; it already resolves by email server-side and reports per-row failures.

### 1.2 Confirm-on-remove dialog

Wire the existing `useConfirm()` hook + `<ConfirmDialog />` (Section 7.3, 7.10) to the Remove button:
- Title: `Remove this student?`
- Message: `They will lose access to this course's exams. You can re-enroll them later.`
- Confirm label: `Yes, remove` (destructive tone). Cancel leaves the roster untouched.
- Only call `onRemoveEnrollment` after confirmation resolves.

### 1.3 Hard removal

- Backend: `remove_course_enrollment` → `prisma.course_enrollments.delete(where={"id": enrollment.id})`. Keep the 404 when no row matches.
- Remove the now-dead reactivate branch in `add_course_enrollment` and the `is_active` reactivation path; a re-add is always a `create`.
- Frontend: the row disappears on success (the store already refetches via `fetchEnrollments`). Drop the `is_active ? 'Active' : 'Inactive'` line and the `disabled={!enrollment.is_active}` on the button — there is no inactive state to render.
- `Enrollment` interface: `is_active` can stay on the type if other callers read it, but the roster query no longer returns inactive rows; prefer removing the field if grep shows no remaining consumer.

### 1.4 Freeze roster when the exam has started/ended

- Extend the enrollments endpoint response (or add `GET /courses/{course_id}/enrollments` returning `{ enrollments, roster_locked }`, or a sibling field) so the frontend learns the lock state in the same round-trip — avoid an extra request (Section 4, read-heavy economy).
- `useCourseStore`: store `rosterLockedByCourse: Record<string, boolean>` alongside `enrollmentsByCourse`.
- Drawer: when locked, hide the mode tabs + add form + Remove buttons, and render a `<EmptyState>`-style or banner note: title `Roster locked`, body `This course has an exam that has already started or finished, so enrollments can no longer change.`
- Backend guard enforced in both mutating services regardless of the flag (authoritative `409`).

### 1.5 Idempotent add — no more runtime error

Today adding an already-enrolled student throws `409` → the store rethrows → React surfaces the unhandled `Error` (`useCourseStore.ts:104`). Two-part fix:
- **Prevent it:** 1.1 removes enrolled students from suggestions, so the single-add path can't hit the conflict.
- **Handle it gracefully** for the bulk path and any race: in `addEnrollment`, treat the specific "already enrolled" `409` as a non-fatal outcome — surface it via `useToast()` (`Already enrolled`, description naming the email) and resolve, rather than `throw`. The bulk flow already swallows per-row errors via `Promise.allSettled`; keep that. The goal is that no enrollment action ever produces a red Next.js runtime overlay.

### Acceptance — Stage 1
- Typing an email narrows a suggestion list of registered, not-yet-enrolled students; selecting + Enroll adds them.
- Remove always prompts a confirm dialog; confirming deletes the row and it vanishes from the roster.
- No grayed-out Remove buttons and no "Inactive" rows anywhere.
- With a course whose session is ongoing/closed, the drawer shows the locked banner and the API rejects add/remove with `409`.
- Enrolling a duplicate never throws a runtime error.

---

## Stage 2 — Grading Back Navigation

Files: `frontend/src/app/grading/[sessionId]/page.tsx`, `frontend/src/app/grading/test/[testId]/run/[runId]/page.tsx`.

Problem: the per-submission grading page hardcodes `BackButton href="/grading" label="Back to dashboard"` (`[sessionId]/page.tsx:253`), but the user arrives from the run's submission list (`run/[runId]/page.tsx:345` pushes `/grading/${session.session_id}`). Back should return to that run's submission list, not the top-level dashboard — grading a stack of exams is painful otherwise.

Implementation (origin-aware, matching Section 8.4):
- When the run page navigates into a submission, append origin context to the URL: `router.push(`/grading/${sessionId}?fromTest=${testId}&fromRun=${runId}`)`.
- The `[sessionId]` grading page reads `useSearchParams()` and sets `BackButton` to `/grading/test/${fromTest}/run/${fromRun}` with label `Back to submissions` when both are present; fall back to `/grading` / `Back to dashboard` only when they're absent (deep-link safety).
- Confirm the submission page is a client component with access to `useSearchParams` (wrap in `<Suspense>` if Next requires it for that hook).

### Acceptance — Stage 2
- Grade a submission, hit Back → land on the same run's submission list with selection context intact.
- Direct-linking `/grading/[sessionId]` with no query still works and goes to the dashboard.

---

## Stage 3 — Analytics Literacy

Files: `frontend/src/components/analytics/AllItemsTable.tsx`, `SectionAnalyticsPanel.tsx`, `CutScoreSlider.tsx`, `frontend/src/app/analytics/items/[loId]/page.tsx`, `PDValueTrendChart.tsx` (deletion), plus `analytics.types.ts` if cut-score plumbing changes.

### 3.1 P-value as a percentage
- In `AllItemsTable` and the section panel, render P as `Math.round(p_value * 100)%` (P is stored 0–1). Column header `Difficulty`; keep the `P-value` mention inside the tooltip.
- `formatMetric` currently `toFixed(2)` for both P and D — split into `formatPercent(p)` and `formatIndex(d)` so the two metrics format differently. One helper pair, used everywhere (Section 2 single-source).

### 3.2 D-value labelled and qualified
- Header `Discrimination` (drop the bare `D`). Value stays 2-dp.
- Add a muted qualitative tag beside the number using existing semantic tokens: `≥ 0.30 → Good` (success fg), `0.15–0.30 → Weak` (warning fg), `< 0.15 or negative → Poor` (danger fg). Pure function in `src/lib/` (e.g. `discriminationTone(d)`) — no inline thresholds duplicated across components.
- Tooltip leads with plain language: "How well this question separates students who did well overall from those who didn't."

### 3.3 Arrow-based column sort
- Replace the pill row of `Sort Stem / Sort N / Sort P / Sort D` buttons (`AllItemsTable.tsx:63`) with clickable column headers using the **same `SortArrow` component the Question Library uses** (`↑`/`↓`, muted when inactive — Section 7.8). One active sort at all times; default first sortable column ascending.
- Sortable columns: Item (stem), Difficulty (P), Discrimination (D), Responses (N). Clicking toggles direction; clicking a new column activates it ascending.
- Reuse the library's sort header pattern verbatim rather than inventing a parallel one — find it in `items/page.tsx` and lift any shared bits into `src/lib/` or `src/components/ui/` if not already shared.

### 3.4 Readable "By section" panel
`SectionAnalyticsPanel.tsx` problems: "All sections" toggle is unintuitive, `P̄`/`D̄` glyphs read like a math formula, and the question count is cryptic (`12 q`).
- Make the All-sections control an explicit segmented toggle / clearly-labelled reset, with copy like `All sections` vs `Section: {name}`, so it's obvious it's a filter of the items table below (the hint text already exists — surface it more clearly).
- Replace `P̄` / `D̄` `<dt>` labels with full words `Avg. difficulty` / `Avg. discrimination` / `Avg. score`, difficulty as a percentage (3.1), discrimination via the index formatter (3.2).
- Make the count explicit: `12 questions` (and, where `graded_item_count` differs, `12 questions · 9 graded`) instead of `12 q`.

### 3.5 Remove Version Trend from item drill-down
Versions are no longer a product concept, so the trend is obsolete.
- Delete the entire `Version Trend` `<section>` (`items/[loId]/page.tsx:97-109`) and the `PDValueTrendChart` import + component file if it has no other consumer (grep first).
- The drill-down page becomes: header + Latest Distractor Breakdown only. If that leaves the page thin, keep the latest P/D summary as a small `StatCard` pair instead of the trend — but no version-over-time chart.

### 3.6 Fix drill-down back button
The page builds `sourceTestId` from `?fromTest=` else falls back to the latest history entry (`items/[loId]/page.tsx:36`). If the param is missing or history resolves to a different test, Back lands somewhere unexpected.
- Ensure `AllItemsTable`'s drill-down link always carries `?fromTest=${testId}` (it does at `:162`) **and** the run scope when drilling from a run (`&fromRun=`), then have `BackButton` return to `/analytics/tests/${fromTest}` (or the run page when `fromRun` present) deterministically — never rely on the history-derived fallback for the back target when the explicit param exists.
- Verify against both entry points: combined test analytics and per-run analytics.

### 3.7 Cut score as a whole percentage
`CutScoreSlider.tsx` uses `step={0.1}` and `toFixed(1)`.
- Set `step={1}`, render `Math.round(value)%`, drop the decimal everywhere (slider readout, baseline line, scenario labels).
- The debounce/sync logic (`Math.abs(displayValue - value) > 5`) still works with integers; verify the parent computation and any stored baseline compare as integers. If the backend persists a fractional baseline, round at the boundary only.

### Acceptance — Stage 3
- Item tables show `Difficulty` as a %, `Discrimination` as an index with a Good/Weak/Poor tag, and sort via header arrows.
- The By-section panel uses full words, percentages, and explicit question counts; the All-sections control reads as a filter.
- The item drill-down has no Version Trend; Back reliably returns to the originating test/run analytics.
- Cut score moves and displays in whole percent.

---

## Stage 4 — Scheduling Calendar Guard

Files: `frontend/src/components/sessions/SessionCreateForm.tsx`, `frontend/src/components/ui/TimePicker.tsx` (and any reschedule surface if one exists — grep `DatePicker`).

`DatePicker` already disables past *dates* via `min` and the form passes `min={new Date()}` (`SessionCreateForm.tsx:137`), so past calendar days are correctly greyed — the earlier "past dates aren't disabled" report was a misread caused by 4.1.

### 4.1 Fix the "Today" shortcut (✅ done)
The "Today" button called `selectDay(today.getDate())`, which combined today's *day number* with the *currently-viewed* month/year. Paging the calendar forward a month and clicking "Today" therefore selected day-N-of-next-month, not actual today; the trailing `setViewMonth`/`setViewYear` couldn't undo the already-fired `onChange`. Fixed in `DatePicker.tsx` by selecting today's full Y/M/D explicitly before syncing the view.

### 4.2 Disable past times on today
The remaining hole: on **today**, the `TimePicker` lets you pick an earlier hour, producing a session scheduled in the past.
- Audit every `DatePicker` instance in scheduling surfaces and confirm `min={new Date()}` is passed (add it anywhere missing).
- Guard past times: when the selected date is today, the `TimePicker` should disable / reject times before `now` (pass an optional `min` prop to `TimePicker`, mirroring `DatePicker`). On submit, `SessionCreateForm` must also reject `starts_at <= now` with an inline error (front-line validation; the scheduling service remains the authority).

### Acceptance — Stage 4
- "Today" always selects the real current date regardless of the viewed month.
- A today + past-hour combination is blocked both in the picker and on submit.

---

## Stage 5 — Copy Cleanup

### 5.1 Retire "Session Manager"
- `SessionCreateForm.tsx:80` eyebrow `Session Manager` — remove (the `PageHeader` already says "Exam Sessions"; per Section 7.6 don't restate the title as an eyebrow).
- `SubmissionConfirmation.tsx:21` `'Back to Session Manager'` → `'Back to Sessions'` for the `/sessions`-bound return path. Keep the `/my-exams` label as-is.

### 5.2 Retire "Course Setup"
- `SessionCreateForm.tsx:164` eyebrow `Course Setup` — remove; the `Create a New Course` heading is self-explanatory (Section 7.6 eyebrow rule).

### 5.3 "Learning objects" → "Questions" in the Question Library
- `items/page.tsx` subtitle (`:324`) and empty-state description (`:423`): replace user-facing "learning objects"/"learning object" with "questions"/"question".
- Scope to user-facing copy on the Question Library surface. Do **not** rename the `learning_objects` table, `LearningObject*` types, API routes, or `loId` params — that's internal identity (mirror the 8.7 stance on Subject→Topic: change copy, not the data model). Grep `items/page.tsx` for any other visible "learning object" strings.

### Acceptance — Stage 5
- No user-facing "Session Manager", "Course Setup", or "learning object(s)" copy on the named surfaces; internal identifiers untouched.

---

## Stage 6 — Import Format: Require a Title

Files: `frontend/src/components/import/FormatGuideModal.tsx`, `backend/app/services/import_service/validator.py`, `assembler.py`, `schemas.py`, `persister.py`.

Today `Title:` is optional (`FormatGuideModal.tsx:9`) and `persister.py:119` falls back to `"Imported Blueprint"`. Make it required.
- Format guide: flip the `Title:` row to `required: true` and update its description (`Blueprint display name. Required.`).
- Parser/validator: in the `#BLUEPRINT` block validation, error when no non-empty `TITLE` was captured — `detail`/message like `Import is missing a required Title:` with the offending line/section, consistent with existing validator error shape. Remove the `"Imported Blueprint"` default fallback in `persister.py` (no silent default once it's required).
- Keep `TITLE` in `METADATA_KEYS` (`lexer.py:5`) — it's still a recognized token, now mandatory.

### Acceptance — Stage 6
- An import with no `Title:` is rejected with a clear validation message; the format guide marks Title as required; no "Imported Blueprint" fallback remains.

---

## Stage 7 — Verification Gates

### Backend tests
- `backend/tests/test_courses.py`:
  - removal hard-deletes the row (roster no longer returns it).
  - add + remove are rejected `409` when the course has an ongoing/closed session; allowed when all sessions are future.
  - duplicate add still returns `409` (store handles it gracefully; API contract unchanged).
- `backend/tests/test_import_service.py`:
  - missing `Title:` fails validation; present `Title:` passes; no default-title fallback.
- Run: `pytest backend/tests/test_courses.py backend/tests/test_import_service.py`, then the broader suite if time permits.

### Frontend
- `npm exec tsc -- --noEmit` and targeted ESLint on changed files.
- `next build` must pass (Suspense boundary for any new `useSearchParams` usage).

### Playwright / manual smoke
- Enrollment: typeahead filters; confirm-on-remove; row disappears; locked banner on a started/closed course.
- Grading: submission → Back → run submission list.
- Analytics: % difficulty, discrimination tag, header-arrow sort, readable section panel, no version trend, working drill-down Back, integer cut score.
- Scheduling: past day greyed, today + past hour blocked.
- Copy: obsolete strings gone.

### Visual matrix (Section 7.12)
Verify under `dark`, `warm`, `light-blue`:
- Enrollment drawer (typeahead dropdown, locked banner, confirm dialog).
- `AllItemsTable` headers + discrimination tag tokens.
- `SectionAnalyticsPanel`.
- `CutScoreSlider`.

### Grep gates
```bash
# obsolete copy must be gone from product surfaces
rg -n "Session Manager|Course Setup" frontend/src/components frontend/src/app
rg -n "learning object" frontend/src/app/items/page.tsx
# color-token discipline on touched analytics/enrollment surfaces
grep -rE "(border|bg|text)-(blue|cyan|red|green|yellow|orange|purple|pink|indigo|amber|lime|emerald|teal|sky|violet|fuchsia|rose|slate|gray|zinc|neutral|stone)-[0-9]" frontend/src/components/analytics frontend/src/components/sessions
```
Both copy greps must be empty; the color grep must be empty (or a documented exception).

### Security / scalability checks (Section 1, 4)
- Aikido scan: zero new Critical/High before merge.
- Enrollment add/remove and roster-lock are enforced in the service layer, not just the UI.
- Roster-lock derivation reuses the existing session-lifecycle source — no duplicated status logic.
- Enrollments and student-candidate lists remain bounded (the candidate list already powers a typeahead; if it grows large, paginate/server-search rather than shipping the whole table — note for a future epoch, not required here).

---

## Stage 8 — Student Result Visibility & Inspect Flow

Origin: user request on 2026-05-20 after using the published-results flow.

### 8.1 Show the full question on the student result detail

`frontend/src/app/my-results/[sessionId]/page.tsx` renders each question twice: a plain-text heading truncated to 96 chars with `…` (`getQuestionHeading`), then the full rendered HTML in a box below. The truncated heading is redundant and looks broken.

- Drop `getQuestionHeading`; make the card header read `Question {n}` with the type as the subtitle.
- Keep the full `toExamContentHtml(question_content)` box — that is the real, untruncated question. No `…` anywhere.

### 8.2 Publish dialog — full details vs grades only

Publishing is per `test_definition_id` and currently fires immediately. Add a choice at publish time:

- New `details_visible` boolean on `session_results` (Prisma schema + SQLAlchemy model + `prisma db push`; default `true` for backward compatibility). Set at publish.
- `results_service.publish_results(test_definition_id, publisher_id, details_visible)` writes the flag onto every published row.
- `POST /grading/tests/{id}/publish-results` accepts `{ details_visible: bool }` (default `true`).
- Frontend: replace the direct `publishResults(testId)` call on the grading run page with a dialog (reusing `Modal` or a small dedicated component) offering **"Show full exam + grades"** and **"Grades only"**, plus Cancel. The store's `publishResults` takes a `detailsVisible` argument.

### 8.3 Gate the detail when grades-only

- `get_student_result_detail`: when a result is published but `details_visible` is `false`, raise `403` (`detail: "The instructor released grades only for this exam."`). Keep the existing not-published `403`.
- `get_student_published_results`: include `details_visible` in each row so the list can hide the entry point. Frontend `StudentResult` type gains `details_visible`.

### 8.4 Rename "View details" → "Inspect"

- In `my-grades`, replace the `View details →` text with a real **Inspect** button (use the `Button` primitive). Render it (and make the card a link) only when `details_visible` is `true`. When `false`, the card is non-interactive and shows a muted `Grades only` note instead.

### 8.5 Student inspect Back → My Grades

- `my-results/[sessionId]` `BackButton` href changes from `/my-exams` to `/my-grades`, label `Back to my grades`. The student reaches this page from My Grades, not My Exams.

### Acceptance — Stage 8
- The student result detail shows every question in full, never truncated.
- Publishing prompts the visibility choice; choosing grades-only hides the Inspect button and blocks the detail route (`403`).
- The button reads "Inspect"; Back returns to My Grades.

---

## Stage 9 — Analytics Follow-ups

Origin: user feedback on 2026-05-20 after using the Stage 3 analytics build.

### 9.1 Cryptic "Across Test <id>" copy
On the item drill-down (`analytics/items/[loId]`), the difficulty StatCard note and the distractor sentence interpolate `sourceHistoryEntry.test_title`, which for some blueprints is an auto-generated name like `Test 27379dc6`. Drop the raw title: the note becomes `Across all responses` and the distractor sentence drops the trailing test name. (The real defect is ugly seed titles, but the UI should not surface an opaque id either way.)

### 9.2 Section panel duplicate metric
In `SectionAnalyticsPanel`, `Avg. difficulty` (`p_value_mean`) and `Avg. score` (`mean_score`) read as the same number. Remove `Avg. difficulty`, keep `Avg. discrimination` and `Avg. score`, and render the score as a percentage (`formatPercent`). Collapse the grid from 3 to 2 columns.

### 9.3 Remove the Flagged Items section
The All Items table already lists flags and supports filtering/sorting by them, plus per-section filtering — so the separate `FlaggedItemsTable` is redundant. Remove the section from the run analytics page and delete `FlaggedItemsTable.tsx` (no other consumer).

### 9.4 Flag filter must survive a section change
In `AllItemsTable`, the flag chips are derived from the (already section-filtered) `items` prop. If `TOO_HARD` is the active filter and the user picks a section with no too-hard questions, the chip disappears *and* the table is empty with no way to recover. Fix: when the active flag is no longer present in the current item set, reset it to `ALL` so the section's questions show. (A `useEffect` watching `availableFlags`/`activeFlag`.)

### 9.5 Section "Avg. score" exceeding 100%
The section `mean_score` was the raw average of `points_awarded`, so a 4-point essay section rendered as `400%`. Normalise in `compute_section_analytics`: average each item's `mean_score / points_possible` instead of raw points, yielding a true 0–1 fraction that `formatPercent` renders correctly. (`p_value` can't be used — it's `None` for essays.)

### 9.6 Sort All Items by Type and Flags
Extend the All Items `SortKey` with `type` (alphabetical by question type) and `flags` (by flag count), reusing the existing header-arrow sort.

### Acceptance — Stage 9
- No opaque `Test <id>` strings on the item drill-down.
- Section "Avg. score" is always a sensible 0–100%.
- All Items sorts by Type and Flags as well as the existing columns.
- Section cards show discrimination + score (as %), no duplicate difficulty.
- No Flagged Items section anywhere; flags still visible/filterable in All Items.
- Switching sections never leaves the table stuck-empty behind a now-irrelevant flag filter.

---

## Out of Scope
- Server-side typeahead search for students (client filter on the existing candidate list is sufficient at current scale).
- Renaming the `learning_objects` table / `LearningObject` types / routes — copy only.
- Reworking how P/D are computed; this epoch changes presentation, not psychometrics.
- A per-session (rather than per-course) enrollment model — roster stays course-scoped.
- Reintroducing question versioning in any form (the Version Trend removal is final for now).
- Migrations: only add one if the roster-lock flag genuinely needs a stored column (it should be derivable at query time — prefer no migration).
