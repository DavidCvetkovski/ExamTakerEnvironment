# Epoch 8.6.1 — Practice-Bucket Cleanup (Retrospective)

> **Type:** Small follow-up correction to Epoch 8.6 Stage 2 (per-run drill-ins).
> **Scope:** Backend run-filter helper + grading/analytics services; frontend pickers and drill-in pages for both surfaces; two TypeScript type unions trimmed.
> **Origin:** Reported 2026-05-18 while reviewing the live `/analytics/tests/[testId]` page: the "Practice bucket" section that 8.6 Stage 2 carried over from the previous data shape was still visible alongside the Combined card and Individual sessions list, polluting cohort views with author preview attempts.
> **Status:** ✅ Code-complete and shipped on `chore/8.6-practice-cleanup`.
>
> **Guiding principle:** A psychometric cohort is a *cohort* — students sitting one scheduled run under standard conditions. Mixing in `PRACTICE`-mode submissions (ad-hoc author previews from `/blueprint`) inflates `submissions_total`, distorts Cronbach's α / item discrimination, and clutters the grading queue with rows that aren't real student work. The data shape supports the distinction (`session_mode` ∈ `{ASSIGNED, PRACTICE}`); we just hadn't been honoring it consistently across surfaces.

---

## Background: what "practice" actually is

`exam_sessions.session_mode` has two values:

| Mode | `scheduled_session_id` | Who creates it | Purpose |
|---|---|---|---|
| `ASSIGNED` | FK → `scheduled_exam_sessions.id` | Student sitting a scheduled run | Real cohort data |
| `PRACTICE` | `NULL` | Anyone via "Try blueprint" from `/blueprint` | Ad-hoc author/student preview |

Epoch 8.6 Stage 2 surfaced a synthetic **Practice bucket** in both the grading and analytics per-blueprint pickers — one extra "run" card collecting every `PRACTICE`-mode submission under the sentinel `run_id = "practice"`. The intent was situational awareness ("don't lose those attempts"), but in practice (no pun intended) the bucket:

1. Pulled author preview submissions into the grading queue, where they aren't real student work to grade-and-publish.
2. Sat next to Combined and Individual-session cards on `/analytics/tests/[testId]`, implying these attempts belonged in the same cohort as scheduled-run submissions.
3. Was silently included in the Combined card's `submissions_total` count *and* in the downstream `compute_test_stats` / `compute_test_item_stats` reliability metrics, because the combined branch of `run_filter` returned an empty WHERE clause and the analytics queries filtered only by `test_definition_id + is_published`.

The fix is to stop surfacing practice in grading/analytics entirely and to exclude practice from Combined aggregates — without touching the underlying ability to *take* a practice attempt from `/blueprint`, which is a legitimate authoring feedback loop.

---

## What changed

### Backend

| File | Change |
|---|---|
| `backend/app/services/run_filter.py` | The `is_combined(run_id)` branch of both `build_exam_session_run_filter` and `build_session_results_run_filter` now returns `{"session_mode": "ASSIGNED"}` / `{"exam_sessions": {"session_mode": "ASSIGNED"}}` instead of an empty dict. Every downstream consumer (grading queue, grading overview, Combined analytics bundle, per-section aggregates, CSV export) inherits the exclusion through one helper. The `PRACTICE_SENTINEL` constant and its branches are preserved defensively so stale links 404 cleanly rather than crash; the UI just no longer points anywhere at them. Docstring rewritten to make the new contract explicit. |
| `backend/app/services/results_service.py` | `get_grading_runs` no longer emits a Practice bucket row — removed the dedicated count + push block and the practice tiebreaker in `_sort_key`. Removed the now-unused `PRACTICE_SENTINEL` import. Docstrings on `get_grading_overview`, `get_grading_runs`, and `get_grading_queue` updated to state the practice-exclusion contract. |
| `backend/app/services/psychometrics_service.py` | `list_analytics_runs` no longer emits a Practice bucket row, and the Combined sentinel's `combined_total` count is now scoped to `session_mode = "ASSIGNED"` so it matches the downstream `compute_test_stats` / `compute_test_item_stats` numbers (which inherit the same filter via `build_session_results_run_filter`). Removed the now-unused `PRACTICE_SENTINEL` import. Updated `compute_test_item_stats` docstring to state the practice-exclusion contract. |

### Frontend

| File | Change |
|---|---|
| `frontend/src/app/analytics/tests/[testId]/page.tsx` | Removed the entire "Practice bucket" `<section>`; dropped `practiceRun` resolution and the `isPractice` branches in `RunCard` (so a card always renders the scheduled-run shape). Updated the file-level docstring and pruned the `'oldest'` sort comment that referenced practice's no-window tiebreak. |
| `frontend/src/app/analytics/tests/[testId]/run/[runId]/page.tsx` | Removed the `activeRun?.kind === 'PRACTICE'` branch from the eyebrow ternary — only Combined and per-course-title labels remain. |
| `frontend/src/app/grading/test/[testId]/page.tsx` | Removed the Practice bucket `<section>`, the `practiceRun` resolution, and the `kind !== 'PRACTICE'` filter on `scheduledRuns`. `RunCard` collapsed the `isPractice` ternaries to the scheduled-run shape. Updated the file-level docstring. |
| `frontend/src/app/grading/test/[testId]/run/[runId]/page.tsx` | Removed the `currentRun.kind === 'PRACTICE'` subtitle branch. |
| `frontend/src/lib/analytics.ts` | `AnalyticsRun.kind` union narrowed from `'COMBINED' \| 'ASSIGNED' \| 'PRACTICE'` to `'COMBINED' \| 'ASSIGNED'` — the backend never returns `'PRACTICE'` now. |
| `frontend/src/stores/useGradingStore.ts` | `GradingRun.kind` union narrowed from `'ASSIGNED' \| 'PRACTICE'` to `'ASSIGNED'`. Docstring updated. |

### Untouched (deliberately)

- `ExamSessionMode.PRACTICE` enum (`backend/app/models/exam_session.py`) and the Prisma schema — no destructive migration, existing practice rows stay queryable.
- The exam-taking flow for practice attempts: `useExamStore`, `SubmissionConfirmation`, `exam_sessions_service.create_practice_session`, and the "Try blueprint" entry point from `/blueprint` all still work. Constructors can preview their blueprints exactly as before; those attempts just no longer surface in grading/analytics.
- The defensive `PRACTICE_SENTINEL` branches in `run_filter.py` — kept so any stale `run_id=practice` URL someone bookmarked from an earlier build returns an empty cohort cleanly instead of erroring.

---

## Why one helper, not eight callsite filters

The `is_combined` branch in `run_filter.py` is the *single* place where "what does Combined mean?" is answered. Both the grading queue queries (`get_grading_overview`, `get_grading_queue`) and the analytics aggregates (`compute_test_stats`, `compute_test_item_stats`, sections endpoint) spread `build_*_run_filter(run_id)` into their `where` clauses. Centralizing the exclusion there means:

- One place to read, one place to change.
- Combined aggregates and Combined card counts agree by construction — no class of bug where the picker shows "26 submissions" but the dashboard inside says "25 published, 1 unaccounted for" because of inconsistent filters.
- The `PRACTICE_SENTINEL` branch is preserved as the only explicit "I want practice" caller path — even though no UI uses it today, the contract stays expressible.

This is the same single-source-of-truth pattern Epoch 8.4 §8.1 established for `derive_blueprint_status` and that Epoch 8.6 Stage 1 reinforced with the shared `useNow` primitive.

---

## Acceptance / visual check

On `/analytics/tests/[testId]` for a blueprint that has at least one practice submission and one closed scheduled run:

- ❌ Before: three sections — "Combined", "Individual sessions", "Practice bucket".
- ✅ After: two sections — "Combined" and "Individual sessions".
- ✅ Combined card's submission count equals the sum of all scheduled-run submission counts (practice excluded).
- ✅ The dashboard reached by clicking Combined shows the same total in its header stat ("X published sessions") as the picker card claims.

On `/grading/test/[testId]` for the same blueprint:

- ❌ Before: "Individual sessions" section + a separate "Practice bucket" section with one card.
- ✅ After: only "Individual sessions".
- ✅ Pending-grading totals on the parent `/grading` index reflect only ASSIGNED-mode submissions.

`tsc --noEmit` exits 0. Backend modules parse. No data migration; no DB write.

---

## What this does *not* do (deferred)

- **Surface practice attempts anywhere else.** If we eventually want a separate "My drafts" view for an author to see/replay their own preview attempts, that's a new surface, not a regression. The data is still there.
- **Filter `list_analytics_index` aggregates by session_mode.** That function is part of in-flight Epoch 8.7 work and isn't on this branch's HEAD. When 8.7 lands, its `all_sessions` / `pending_grades` queries should pick up the same `"session_mode": "ASSIGNED"` filter so the index headline numbers stay consistent with the per-blueprint Combined card. Noted here so it isn't forgotten.
- **Remove the `PRACTICE` enum value or migrate existing rows.** Out of scope; the value remains a valid session mode for the "Try blueprint" flow.
