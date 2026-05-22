# Epoch 8.9 — Grading & Analytics Power Tools

**Status:** ✅ Implemented on branch `epoch-8.9-grading-analytics-power` (off the Epoch 8.8 commit). Do **not** merge to `main` yet.

> **Type:** Bug fixes + feature additions surfaced through continued use of the 8.8 build (2026-05-21).
> **Scope:** the row-action ("three dots") menu, the duplicate flow, course-enrollment locking, analytics item tooling, the analytics PDF report, per-test cut-score setting, and unpublished-grade analytics preview.
> **Origin:** user request on 2026-05-21.
>
> **Guiding principle:** every rule the UI implies is enforced in the service layer; reuse existing primitives and tokens; keep professor-only previews authoritative on the backend, not just hidden in the UI.

---

## Progress Tracking Matrix

`⬜` not started · `🔵` in progress · `✅` done

| Stage | Item | Surface | Backend? | Status |
|---|---|---|---|---|
| 1 | Fix the "three dots" row-action menu (clicks do nothing) | `RowActionMenu` | — | ✅ |
| 2 | Duplicate opens the editor as an **unsaved** new question (created only on Save) | `items/page`, `useAuthoringStore`, `author/page` | — | ✅ |
| 3 | Scheduled (future) sessions must still allow enrollment changes | `courses_service`, `CourseEnrollmentDrawer` | ✅ | ✅ |
| 4 | "Copy question ID" action in the analytics All Items table | `AllItemsTable` | — | ✅ |
| 5 | Analytics PDF: blueprint title, question text (+ id), nicer layout, sane filename | `analytics_pdf_service`, analytics endpoint, run page download | ✅ | ✅ |
| 6 | Set the pass **cut score** per test from grading | grading dashboard, results service, endpoint | ✅ | ✅ |
| 7 | Preview analytics for **unpublished** grades (before releasing) | analytics services + endpoints, analytics UI | ✅ | ✅ |

---

## Stage 1 — Fix the "three dots" row-action menu

### Problem
`RowActionMenu` was refactored to render its dropdown through `createPortal(..., document.body)`, but the outside-click handler only ignores clicks inside `triggerRef`. The portaled menu is **not** inside the trigger, so a `mousedown` on any menu item is treated as an outside click and closes the menu before the item's `onClick` fires — every action silently does nothing.

### Fix (`frontend/src/components/ui/RowActionMenu.tsx`)
- Re-introduce a `menuRef` on the portaled menu container and skip closing when the `mousedown` target is inside it (in addition to the trigger).
- Use `position: fixed` for the portaled menu so the `getBoundingClientRect()` viewport coordinates line up regardless of scroll (drop the stray `top-full`/`bottom-full` Tailwind classes that don't apply to a body-portaled node).
- Keep `z-50`-tier layering per §7.4.1 (the existing `z-[9999]` is a magic number — use `z-50`).

### Acceptance
- Clicking Duplicate / Copy ID / any row action in the Question Library actually runs.
- The menu still closes on outside click, Escape, and after an action.

---

## Stage 2 — Duplicate = unsaved new question

### Problem
Clicking Duplicate immediately `POST`s `/learning-objects/{id}/duplicate`, persisting a full copy server-side before the user has seen or saved anything. The user wants Duplicate to open the editor pre-filled with the source content as a **new, unsaved** question — created only when they hit Save (treated as unsaved changes), discardable by navigating away.

### Design
New questions already create an *empty, version-less* learning object (invisible in the library until the first version is saved). Mirror that for duplicate:
1. **`items/page.tsx` `handleDuplicate`:** create an empty LO (`POST /learning-objects`), then navigate to `/author?lo_id={newId}&seedFrom={sourceId}`. Do **not** call the `/duplicate` endpoint.
2. **`useAuthoringStore`:** add `seedFromSource(targetLoId, sourceLoId)` that loads the source's latest version (content, options, type, metadata minus `review_feedback`) and the source course, then sets state with `learningObjectId = targetLoId`, `serverSnapshot = null` (so everything reads dirty), `isDirty = true`. Save then writes the first version + course to the new LO via the existing `saveDraft` path.
3. **`author/page.tsx`:** when `seedFrom` is present, call `seedFromSource` instead of `fetchLatestVersion`; the page shows the standard unsaved-changes affordances.

The legacy `/duplicate` endpoint stays for now (it is still referenced by other callers / tests) but is no longer used by the library row action.

### Acceptance
- Duplicate opens the editor pre-filled, marked dirty, with no new row in the library until Save.
- Navigating away without saving leaves no visible duplicate.
- Saving creates a new question with the copied content/options/metadata/course.

---

## Stage 3 — Scheduled sessions must still allow enrollment changes

### Problem
Epoch 8.8's `is_course_roster_locked` locks a course roster whenever **any** session has `starts_at <= now` (i.e. has ever started). A course with a past/closed exam is therefore locked forever, so you cannot manage enrollments for a *future* scheduled session in that course.

### Fix (`backend/app/services/courses_service.py`)
Lock the roster only while a session is **currently ongoing** — `starts_at <= now < ends_at` and not `CANCELED`. Closed/past and future/scheduled sessions do not lock. This preserves "don't meddle mid-exam" while letting staff prepare upcoming sessions.

Update `test_courses.py` accordingly (a closed-but-not-ongoing session no longer locks; an ongoing one still returns `409`).

### Acceptance
- A course whose only sessions are scheduled (future) or closed (past) has an editable roster.
- A course with an in-progress session still rejects roster edits with `409`.

---

## Stage 4 — Copy question ID in analytics All Items

### Fix (`frontend/src/components/analytics/AllItemsTable.tsx`)
Add a small "Copy ID" affordance per row (an icon button in the Open/actions cell, or a `RowActionMenu`). On click, `navigator.clipboard.writeText(learning_object_id)` and `useToast({ title: 'ID copied' })` (copy matches §7.10).

### Acceptance
- Each analytics item row can copy its full learning-object id to the clipboard with a toast confirmation.

---

## Stage 5 — Better analytics PDF report

### Problems
`analytics_pdf_service.render_pdf` titles the report "Analytics Report" + raw test id, shows **only flagged items** keyed by a truncated id with no question text, omits the blueprint title, and the download is named `analytics_{uuid}.pdf`.

### Fix
- **Header:** show the blueprint **title** as the main heading; keep the test id as muted secondary text; include the run/cohort label and generated timestamp.
- **Item table:** render a full item-statistics table (not just flagged) with the **question text** (truncated to a sane length) alongside a short id, plus difficulty (points-based %), discrimination, graded N, and flags. Fetch stems via `extract_text_from_tiptap_json` over the items' frozen/version content.
- **Layout:** tighten spacing, consistent column widths, readable type labels; keep the histogram.
- **Filename:** `{{blueprint-title-slug}}_analytics_{{YYYY-MM-DD}}.pdf` (with run suffix when run-scoped). Set it both in the backend `Content-Disposition` and the frontend `a.download` (the frontend currently overrides with `analytics_{testId}.pdf` — derive from the loaded blueprint title instead).

### Acceptance
- The PDF leads with the blueprint title, lists questions by text + id, and downloads with a human-readable filename.

---

## Stage 6 — Set the pass cut score per test from grading

### Problem
The cut score only exists as a what-if slider in analytics (`scoring_config.pass_percentage` is read but there is no UI to set it). Professors need to set the actual pass threshold that determines `passed` for a test's results.

### Fix
- **Backend:** add `PATCH /grading/tests/{test_definition_id}/cut-score` (admin/constructor) that persists `scoring_config.pass_percentage` (integer 0–100) on the test definition and **re-derives `passed`** (and pass/fail driven fields) for that test's `session_results` using the new threshold. Keep letter-grade boundaries as-is unless they conflict; pass = `percentage >= cut_score`.
- **Frontend:** in the grading run dashboard, add a "Cut score" control (number input + Save) that calls the endpoint and refreshes the overview. Reuse the integer-percent formatting from 8.8.

### Acceptance
- Setting a cut score in grading persists it and updates which sessions are marked passed; analytics shows the same baseline.

---

## Stage 7 — Analytics preview for unpublished grades

### Problem
All analytics computations filter `is_published = True`, so a professor cannot see analytics until after releasing grades to students. They want to preview analytics on graded-but-unpublished results first.

### Fix
- **Backend:** thread an `include_unpublished: bool = False` flag through `compute_test_stats`, `compute_test_item_stats`, `compute_section_analytics`, the bundle/cut-score/section/PDF entry points, and their endpoints (admin/constructor only). When true, drop the `is_published` filter (still exclude practice via the existing run filter). Default stays published-only so nothing changes for the standard path.
- **Frontend:** on the analytics run dashboard, add a clearly-labelled "Include unpublished" toggle (educator-only) that reloads the bundle/sections with the flag and shows a banner that the view includes unreleased results.

### Acceptance
- A professor can view analytics for a test whose grades are graded but not yet published, with an explicit indicator; students are unaffected and published-only remains the default.

---

## Verification (all stages)
- Backend: extend/adjust `test_courses.py`, analytics tests, and any cut-score/results tests; run the affected suites.
- Frontend: `tsc --noEmit`, `next build`, ESLint on changed files.
- Visual matrix (`dark`/`warm`/`light-blue`) for the menu, grading cut-score control, and analytics toggle.
- Color/token + copy grep gates as in 8.8.

## Out of Scope
- Per-section or per-question cut scores (single test-level pass threshold for now).
- Auto-publishing or scheduling of grade release.
- Cleaning up abandoned empty LOs from the duplicate/new-question flow (pre-existing behavior; revisit if it becomes noise).
