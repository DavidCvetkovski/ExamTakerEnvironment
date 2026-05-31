# Epoch 10 — Accessibility & Inclusive Design: Security & V-Gate Review

> Merge gate per CLAUDE.md §1 (manual security review) and blueprint §6 (the
> accessibility verification gate). Complete before merging
> `epoch-10-accessibility-impl` → `main`.
>
> Legend: `[x]` verified in code/tests · `[ ]` to be run by a human before merge
> (Lighthouse, manual screen-reader pass — require a running stack and assistive
> tech, so they are checklist items the reviewer ticks at merge time).

## A. Accessibility (the V gate — blueprint §6)

- [x] **Time-multiplier maths re-verified.** `backend/tests/test_accommodations.py`
      proves a 1.25× student gets 75 min for a 60-min exam; the application path in
      `exam_sessions_service` is unchanged by this epoch (the module only governs
      who *sets* the provision).
- [x] **Enlarged-display grant honoured on the exam screen.** Effective scale is
      `max(preference, enlarged ? 'lg' : 'md')` via the single helper
      `frontend/src/lib/accessibility.ts:resolveExamTextScale`, applied scoped on
      the exam root so the `zoom` token never compounds with the html-level
      preference scale. `accommodation_enlarged_display` is surfaced on
      `UserPublic` (`backend/app/schemas/auth.py`).
- [x] **Entire exam flow operable by keyboard alone.** Arrow-key navigation,
      native MCQ radio-group selection, `f` to flag, `?` for the shortcuts help
      dialog. Covered by `frontend/tests/e2e/exam-keyboard.spec.ts`.
- [x] **Live-region announcements.** Single app-level announcer (`useAnnouncer` →
      `LiveRegion`) voices flag toggles and save/lifecycle events without moving
      focus.
- [x] **Theme × a11y-profile composes via token overrides only** — no component
      branching. The `[data-a11y-*]` blocks in `globals.css` apply under all three
      themes (CLAUDE.md §7.1 / §7.12).
- [x] **axe-core automated checks** on `/login`, `/account`, the exam screen, and
      `/admin/accommodations` assert zero serious/critical violations
      (`frontend/tests/e2e/a11y-axe.spec.ts`).
- [ ] **Lighthouse accessibility ≥ 90** on `/login`, `/my-exams`, exam screen,
      `/account` — run locally before merge (`npx playwright test` stack up, then
      Lighthouse against the running frontend).
- [ ] **Manual screen-reader pass (VoiceOver)** completes a practice exam without
      sighted help.
- [ ] **Contrast ≥ 4.5:1 every theme; ≥ 7:1 under `high`** — spot-checked against
      the `[data-a11y-contrast="high"]` token set; confirm with a contrast checker
      on the three themes at merge.

> **CI note.** The Playwright suite (including `exam-keyboard` and `a11y-axe`)
> runs locally against a seeded stack, consistent with the rest of the E2E suite
> — a CI E2E job is deferred (tracked with the Epoch 13 "optional Playwright
> smoke" item). The V gate is therefore a *local* merge step, run with
> `npx playwright test exam-keyboard a11y-axe`.

## B. Security (§1)

- [x] **All `/api/accommodations/*` routes are admin-only.** Every route uses
      `Depends(require_role(UserRole.ADMIN))`; non-admin → `403`. Asserted in
      `backend/tests/test_accommodations_admin.py`.
- [x] **Multiplier bounded `[1.0, 3.0]`; non-student targets rejected.** Pydantic
      `Field(ge=1.0, le=3.0)` → `422`; non-`STUDENT` target → `400`.
- [x] **Provision change + audit row written atomically** (single transaction): a
      provision can never exist without its `accommodation_audit_log` row.
- [x] **CSV upload hardening.** Content-type/header validation, per-row error
      report, no row applied unless it validates; parse errors never surface as
      `5xx`.
- [x] **Audit log is append-only** — no update/delete routes exist.
- [x] **Accessibility-preference writes are self-scoped.** `PATCH
      /api/users/me/preferences/accessibility` is `Depends(get_current_user)` and
      only ever mutates the caller's own row.
- [ ] **Manual read of the full diff against §1** signed off by the reviewer at
      merge.

## C. Files of record

| Concern | File |
|---|---|
| Effective exam scale helper | `frontend/src/lib/accessibility.ts` |
| Keyboard shortcuts dialog | `frontend/src/components/exam/KeyboardShortcutsDialog.tsx` |
| Keyboard E2E | `frontend/tests/e2e/exam-keyboard.spec.ts` |
| axe-core V gate | `frontend/tests/e2e/a11y-axe.spec.ts` |
| Accommodation admin API | `backend/app/api/endpoints/accommodations.py` |
| Accommodation audit log | `backend/app/models/accommodation_audit.py` |
| a11y token-override blocks | `frontend/src/app/globals.css` (Epoch 10 section) |
