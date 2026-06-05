# OpenVision — Bug / UX / Declutter Audit

> Living audit started 2026-06-05. Severity: 🔴 bug · 🟡 UX/clarity · 🔵 cleanup.
> Codebase is clean overall (no leftover `console.log`, no `any` sprawl, §7.1
> color-token audit passes). Findings concentrate in the grading flow, which is
> where this audit began; later sections sweep the rest of the app.

## Remediation status (2026-06-05)

**Fixed & verified** (frontend `tsc`/`lint`/`next build` green; backend pytest green):
#1 #2 #3 #4 #5 #6 #7 #8(partial) #9 #11 #12 #13 #15 #16 #17 #18 #19 #21 #23
#24 #26 #27 #28 #29 #30 #32 #33 #34 #35 #36 #37 #39 #40 #41 #42 #43 #44 #45 — plus
the new shared pieces: `components/ui/SortArrow`, `hooks/useTableSort`,
`lib/studentLabel`, `lib/gradeState`,
`components/grading/{AnswerChoiceList,AutoGradeResult,EssayGradingPanel}`, and
(Epoch 15 grading-audit-fixes branch) `schemas/pagination.Page[T]` +
`services/pagination.paginate`, `services/student_results_service`,
`lib/api.fetchAllPaginated`, `ui/icons.{RefreshIcon,KeyboardIcon,LockIcon}`,
`services/courses_service` enrollment audit (`course_enrollment_audit`).
CLAUDE.md updated (§1 role/ownership rules, §7.8 shared table utils, §8.8/§8.9).

Resolved since the initial sweep (this branch):
- **#35** plain logout now revokes the refresh token server-side (`token_version` bump).
- **#41** course-roster stays co-managed (product call: shared ownership); enroll/remove
  are audited via the new `course_enrollment_audit` table, actor threaded through.
- **#12** redundant `useEffect` role-redirects removed (ProtectedRoute already guards).
- **#18** `my-exams` moved onto `PageShell`.
- **#38** extracted the three *named* functional icons (Refresh/Keyboard/Lock);
  the ~11 remaining inline SVGs are component-local presentational graphics
  (save spinners, proctoring shield, submission illustration) — left intentionally.
- **#27** `response_model` wired on the two single-resource grading reads, schemas
  reconciled to supersets first + a contract test so no field is silently stripped.
- **#28** student read path split into `student_results_service`.
- **#25** unbounded list endpoints paginated behind the LTI-style `Page[T]` envelope;
  frontend consumers keep list semantics via `fetchAllPaginated`.
- **#14** moot — no real `as any`, just a comment containing the substring.
- **#13** keyboard navigation and shortcuts (j/k/arrows, ⌘/Ctrl+Enter, help dialog) wired on the grading page and panel.

**Still deferred / out of scope:**
- **#10** grading dashboard toolbar declutter — product call: leave as-is (page is fine).
- **#31** move landing fetch into the store — cosmetic structure, not pursued this sweep.
- **#38** remaining presentational inline SVGs — intentionally left (see above).

## A. Grading session page — `frontend/src/app/grading/[sessionId]/page.tsx`

**1. 🟡 Sticky top bar crams 4 competing groups into one row.**
Lines 248–310: BackButton + Prev/Next pager + eyebrow/title + a 4-item result
summary (graded count, points, %, letter grade, pending-essays) share one flex
row with `gap-4`. Prev/Next sit jammed against BackButton (the "clumped up"
complaint). **Declutter proposal:**
- Header keeps only: `BackButton` · title · a clean centered pager.
- Pager becomes `‹ Submission 3 of 12 ›` with `IconButton` chevrons (not
  `← Prev` / `Next →` text buttons), and **add the position indicator** — right
  now you can't tell where you are in the queue.
- Move the result summary out of the header into a compact summary strip / a
  `StatCard` row at the top of the page body. It's reference info, not
  navigation — it doesn't belong in the sticky nav bar.

**2. 🟡 You can't see whose submission you're grading.** In non-blind mode the
header shows only the test title (L277–284) — no student name/email. Add the
student label (reuse `formatStudentLabel` from the dashboard) when `!blindMode`.

**3. 🔴 "Graded" is derived three different, contradicting ways.** Backend
already exposes `grading_status`, yet this page computes "graded" three times:
- Card border: `feedback !== null || points_awarded > 0` (L332)
- Panel "Graded" badge: `updated_at !== null` (L200 — its own comment says this
  is the real signal)
- Header "pending" count: `is_correct === null && !feedback` (L242)

An essay graded 0 points, no feedback → badge says "Graded", card border says
not graded, header counts it pending. All three disagree. Violates §2 single
source of truth. Fix: one helper keyed on `updated_at` / backend
`grading_status`.

**4. 🔴 `router.replace()` called during render.** L237–240 does the STUDENT
redirect in the component body (state update during render → React warning).
Redundant with the `ProtectedRoute` wrapper. Move to `useEffect` or delete.

**5. 🟡 Invalid grade input fails silently.** `handleSave` (L134–138) `return`s
on NaN / out-of-range with no feedback — Save button appears dead. Add inline
validation messaging.

**6. 🔵 Raw `<button>` + `text-white` instead of `Button` primitive.** Save
Grade button (L190–196) is hand-rolled while the file imports `Button`. §7.3
violation. `text-white` is a non-token literal (low priority — used app-wide on
brand buttons).

**7. 🔵 Prev/Next can build `?fromTest=null&fromRun=null` URLs.** L258/L268
interpolate possibly-null params. Harmless in normal flow but defensively wrong
— guard like `backHref` does.

## B. Grading landing — `frontend/src/app/grading/page.tsx`

**8. 🔵 Inline raw SVG refresh icon with `animate-spin`.** L182–184 inlines an
SVG instead of a `<RefreshIcon />` component — §7.3 says icons are components.

**9. 🔵 Duplicated fetch logic.** `fetchRows` (L138) and the mount `useEffect`
(L154–159) implement the same `/analytics/index` call twice. Effect should call
`fetchRows()`. §2 DRY.

## C. Grading dashboard — `frontend/src/app/grading/test/[testId]/run/[runId]/page.tsx`

**10. 🟡 Action toolbar is dense for admins.** L234–306 packs filter chips +
cut-score input + Set + Blind toggle + Export CSV + Publish into one wrapping
row. Group low-frequency admin actions (cut score, export, publish) behind a
`RowActionMenu`/overflow.

**11. 🟡 "Blind ON" / "Blind mode" toggle label is ambiguous.** Label changes
between states, so it's unclear if the label is the current state or the action.
Prefer a stateful switch with a fixed label.

## D. Cross-cutting / smaller

- **12. 🔵 STUDENT-redirect pattern copy-pasted** across ≥3 grading pages.
  Extract to `ProtectedRoute`/a hook.
- **13. 🟡 No keyboard navigation in grading.** Prev/Next + Save are mouse-only.
  `j/k`/arrows to move + `⌘/Ctrl+Enter` to save would speed the workflow.
  `KeyboardShortcutsDialog` already exists to register them.
- **14. 🔵 One `as any` in `grading/page.tsx`** — the only `any` in the frontend.

---

## E. Student-facing pages

**15. 🔴 `my-results/[sessionId]`: `router.replace()` during render.** L215–218
redirects non-students in the component body — same anti-pattern as grading
finding #4 (React state-update-during-render warning).

**16. 🟡 `my-results`: typography is off-system.** Uses raw `text-4xl` /
`text-3xl` / `text-2xl` + `font-black` (L248, 260, 264, 302) instead of the
`text-h1/h2/h3` tokens the rest of the app uses (`font-black` 900-weight appears
nowhere else). This page renders visibly heavier/bolder than every sibling page.

**17. 🔵 `my-results`: radius-scale drift (§7.4).** Cards use `rounded-2xl`
(L137, 246) where §7.4 reserves `2xl` for modals/hero panels — cards should be
`rounded-xl` (as the grading session card correctly does).

**18. 🔵 `my-results` + `my-exams`: bypass `PageShell` (§7.5).** `max-w-3xl`
(my-results L224) and `max-w-[1100px]` (my-exams L52) hand-roll the wrapper;
neither is a documented §7.5 exception, and neither width matches the
narrow/standard/wide scale.

**19. 🟡 `my-results`: `#` and `?` text glyphs used as status icons.** L142 puts
`'#'` (essay) and `'?'` (pending) as text content inside the status circle. §7.2
says status indicators are SVG icon components, not text glyphs.

## F. Exam-taking flow — `frontend/src/app/exam/[id]/page.tsx`

**20. 🔵 Inline SVG keyboard-shortcut icon.** L264–267 inlines an SVG instead of
a `<KeyboardIcon />` ui component (§7.3) — same inline-SVG pattern as the
grading refresh icon (#8). Worth a shared fix: sweep inline SVGs into `ui`.

**21. 🟡 Exam keyboard shortcuts ignore modifier keys.** The `keydown` handler
(L122–166) matches `f` and `?` without checking `metaKey`/`ctrlKey`, so
**Cmd/Ctrl+F (browser Find) is hijacked and flags the question** instead. Guard
with `if (e.metaKey || e.ctrlKey || e.altKey) return;`. (Low real-world risk
under SEB proctoring, but wrong in an unproctored/practice attempt.)

**22. 🔵 `text-white` literal on the "OV" logo badge** (L234). Non-token; low
priority (consistent with brand-button usage app-wide).

## G. Backend

**23. 🔴 Broken object-level authorization on the manual-grade mutation.**
`PATCH /grading/grades/{grade_id}` → `results_service.submit_manual_grade`
(`results_service.py:294`) validates points and role but **never calls
`assert_test_access`** — any `CONSTRUCTOR` can submit/overwrite a grade for a
session belonging to *another instructor's* test. The sibling **read** endpoint
`GET /grading/sessions/{id}/grades` *does* assert ownership (grading.py:62–67,
explicitly added by "Epoch 14 audit H-10"). The H-10 hardening was applied to
the read path and **missed on the write path**. Fix: load the session and call
`assert_test_access(session.test_definition_id, current_user)` before mutating.
Violates §1(c) "owns or has legitimate access to the resource."

**24. 🟡 Cross-tenant read of session aggregate.** `GET
/grading/sessions/{id}/result` (grading.py:113) uses bare `get_current_user`;
the student branch is correctly fenced (own + published), but instructors are
"always visible" with **no `assert_test_access`** — any `CONSTRUCTOR` can read
any session's `student_id`, score, percentage, and letter grade across tenants.
Same H-10 gap as #23, on the result endpoint. (Lower severity than #23: aggregate
PII, not full answers, and read-only.)

**25. 🟡 Unbounded list endpoints (§4).** No pagination on, notably,
`GET /learning-objects` (the *entire item bank* — §4 explicitly names this as
read-heavy and growth-prone), `GET /courses/student-candidates` (all active
students), `GET /tests`, plus several `/grading` and `/analytics` list routes.
§4: "Every list endpoint must support pagination. Never return unbounded result
sets." Add `skip`/`take` + a capped default page size.

## H. Code structure & elegance

> Context: `src/lib/` (24 pure utils) and `components/ui/` + `components/exam/`
> are genuinely well-factored. The structural debt is concentrated in the
> **grading + results surfaces**, which appear to predate that discipline. These
> are the changes that would make the codebase feel cohesive end-to-end.

**26. 🔵+🔴 Triplicated HTML sanitizer — consolidate to the canonical util.**
`lib/sanitizeHtml.ts` exports `sanitizeExamHtml` as the documented single source
of truth, including a security `img`-src guard (Epoch 14 H-8, blocks
tracking-pixel exfiltration). Yet `grading/[sessionId]/page.tsx` and
`my-results/[sessionId]/page.tsx` each define their **own local `sanitizeHtml`**
with a byte-identical (but stale) config that **omits `img`**. Two consequences:
(a) authored images render in the exam but **silently vanish in grading +
results**; (b) the copies are drift hazards — re-adding `img` locally without
the hook would reintroduce H-8. Replace both with `sanitizeExamHtml`. (Bridges
§2 single-source-of-truth and a real rendering bug.)

**27. 🟡 Grading response DTOs exist but are never wired.** `schemas/grading.py`
already defines `QuestionGradeResponse`, `SessionResultResponse`,
`GradingQueueItem`, `SessionGradingSummary` — but `api/endpoints/grading.py` has
**0 `response_model=`** and hand-builds `Dict[str, Any]` everywhere (e.g.
grading.py:89–109, 143–159). `items.py`/`courses.py`/`tests.py` all use typed
models; grading is the outlier. Wire the existing schemas as `response_model`
and delete the manual dict construction → OpenAPI contract, less code, and one
shape shared with the frontend store (which currently redeclares it as
`QuestionGrade` and can drift). Violates §2/§5 type-safety.

**28. 🟡 `results_service.py` is four services in a trench-coat (617 lines).** It
spans instructor dashboards (`get_grading_overview`/`_runs`/`_queue`), the
manual-grade mutation, the publication lifecycle (`set_test_cut_score`,
`publish_results`, `unpublish_results`), CSV export, and student result reads
(`get_student_*`). Split per §3 into e.g. `grading_overview_service`,
`results_publication_service`, `results_export_service`, `student_results_service`.
Also the **grading_service ↔ results_service boundary is muddy**: auto-grading
lives in `grading_service`, manual grading in `results_service` — co-locate both
grading paths so the names mean something.

**29. 🔵 Grading UI is monolithic.** `grading/[sessionId]/page.tsx` (396 lines)
inlines `AutoGradeResult`, `EssayGradingPanel`, `getQuestionHeading`, and the
duplicate `sanitizeHtml`. There is **no `components/grading/` folder** (contrast
the well-factored `components/exam/`). Extract the sub-components there.

**30. 🔵 Duplicated answer-choice renderer.** Grading's `AutoGradeResult` and
my-results' `MCQAnswerDisplay` reimplement the same option list — A/B/C labels
via `String.fromCharCode(65+idx)` and the identical selected/correct/incorrect
colour matrix. Extract one `<AnswerChoiceList>` shared by both (and re-usable by
the exam render path).

**31. 🔵 Inconsistent data-access layer.** Most pages route API calls through a
Zustand store (§3: "stores manage state and API calls"), but
`grading/page.tsx` calls `api.get('/analytics/index')` directly in the component
— twice (see bug #9). Move it into `useGradingStore`, which also kills that dup.

**32. 🔵 "Graded"-state derivation belongs in `lib/`.** Ties to bug #3: extract a
pure `deriveGradeState(grade)` to `lib/` so the card border, the panel badge,
and the header pending-count share one definition — mirroring how
`lib/sessionLifecycle.ts` and `lib/blueprintPermissions.ts` already centralize
derivations. Fixes the contradiction *and* makes it un-repeatable.

## I. File-by-file pass — auth & session core

> Focused read of the security-critical files. Good news first: the
> **exam-taking path is solid** — `get_exam_session` rejects cross-student access
> with 403, and reads go through a shared `_get_session_with_ownership_check`
> helper (exactly the single-source pattern §2 wants). `core/security.py`
> (bcrypt + signed JWTs, role re-fetched from DB so a stale token role is never
> authoritative) and `config.py` (`assert_production_safe` guards SECRET_KEY +
> CORS) are sound. The findings below are the exceptions.

**33. 🔴🔴 CRITICAL — privilege escalation via self-registration.**
`RegisterRequest` accepts a client-supplied `role` (`schemas/auth.py:16`,
defaulting to `STUDENT`), and `register_user` writes it straight to the DB:
`"role": payload.role.value` (`users_service.py`). The `/auth/register` route is
**unauthenticated** (rate-limited only). So anyone can:

```
POST /api/auth/register
{ "email": "x@x.com", "password": "12345678", "role": "ADMIN" }
```

and immediately receive a valid **ADMIN** session — full authentication/authorization
bypass and total system compromise. Violates §1 ("never trust client input",
"least privilege", "authorization on every endpoint"). **Fix:** drop `role` from
the public schema and hard-code `STUDENT` in `register_user`; privileged accounts
are created only by an admin-gated endpoint or the seed path. Add a regression
test asserting a registration body with `role: ADMIN` still yields a STUDENT.
This is the #1 priority of the entire audit.

**34. 🟡 Refresh-token cookie `Secure` flag hardcoded `False`.**
`set_refresh_cookie` (`users_service.py:31-39`) sets `secure=False  # Set True in
production` — it is not environment-driven, and `assert_production_safe()` does
not catch it. In production the long-lived (7-day) refresh token can be sent over
plain HTTP, exposing it to interception. **Fix:** `secure=(settings.ENVIRONMENT
== "production")`, and consider asserting it in `assert_production_safe`.

**35. 🔵 `logout` does not invalidate the refresh token server-side.**
`/auth/logout` only `delete_cookie`s (`users_service.py:218`); it does not bump
`token_version`, so a captured refresh token stays valid until expiry.
`logout-all` does bump. Reasonable as a tradeoff, but worth either documenting or
bumping `token_version` on plain logout too.

## J. Third pass — UI · Security · Elegance

### J.1 UI

**36. 🟡 `items` `TypeChip` labels are cryptic and the enum/label naming is
inverted.** (`items/page.tsx:68`) Shows `SC` / `MC` / `ESS`, decoded only by
tooltip — and `MULTIPLE_RESPONSE → "MC" → "Multiple choice"` while
`MULTIPLE_CHOICE → "SC" → "Single choice"`. A reader who knows the enums will
read it backwards. Use explicit short labels (`Single` / `Multiple` / `Essay`)
or a `<Badge>` with the full word.

**37. 🟡 `ImportedBanner` dismiss is a literal "Clear x".** (`items/page.tsx:556`)
The `x` is a text glyph standing in for a close icon — §7.2 bans this; use
`<XIcon />`. Looks unpolished next to the rest of the app.

**38. 🔵 Inline SVGs are systemic (§7.3): 16 across 13 files.** Not just the two
already filed (grading refresh #8, exam keyboard #20). Others: `items` lock
glyph, `ExamFooter`, `A11yQuickAdjust`, `SaveIndicator`, `QuestionRenderer`,
`ProctoringGate`, `SubmissionConfirmation`, `ChangePasswordForm`,
`BlueprintSaveIndicator`, `QuestionPickerModal`, `IntegrationInfo`. One sweep
into `components/ui` icon components clears the whole class.

**39. 🔵 `items` create-failure is silent + whole-bank client filtering.**
`handleCreateNew` swallows errors to `console.error` with no toast
(`items/page.tsx:303`) — inconsistent with `handleCopyId`'s success toast. And
the page fetches the entire bank, then filters/sorts in memory (L253–295) — the
client mirror of backend pagination gap #25; both must be fixed together.

### J.2 Security

**40. 🔴 Third instance of the missing `assert_test_access`.**
`PATCH /grading/tests/{id}/scoring-config` → `update_scoring_config`
(`grading.py:383`) is `_require_instructor_or_admin`, loads the test, 404s if
absent, but **never asserts ownership** — any `CONSTRUCTOR` can rewrite another
instructor's scoring rules (which re-grades everyone on that test). Same class as
#23 (PATCH grades) and #24 (GET result). **Systemic action:** audit *every*
`_require_instructor_or_admin` route and pair it with `assert_test_access` — the
Epoch 14 H-10 fix landed on the two GET-list routes and missed at least three
siblings.

**41. 🟡 Course-roster mutations don't verify course ownership.**
`add_course_enrollment`/`remove_course_enrollment` gate only on roster *lock
state* (`assert_can_enroll`/`assert_can_remove` take just `course_id`, no user —
`courses_service.py:110-129`). `create_course` records `created_by`, so
ownership exists in the model but isn't enforced: any `CONSTRUCTOR` can
enroll/remove students in any course. Decide if courses are co-managed (then
document it) or single-owner (then assert it).

**42. 🔵 Self-heal `/feedback` stores `context` unbounded (my own Epoch 15 code).**
`record_feedback` caps `message`/`traceback` but persists the client `context`
dict as-is (`self_heal_service.py`). A caller could POST a large object. Cap its
serialized size / key count before write. (Flagging my own addition for honesty.)

### J.3 Elegance

**43. 🔵 `SortArrow` is copy-pasted in 5 files** — `grading/.../run` page,
`admin/accommodations`, `items`, `proctoring/MonitorTable`,
`analytics/AllItemsTable` — all byte-similar. §7.8 already legislates its
behaviour ("renders only ↑ or ↓"), which is the tell that it should be one
`components/ui/SortArrow`. Extract once, import five times.

**44. 🔵 Table sort-state boilerplate repeats across those same 5 tables.** Every
one hand-rolls `if (sortKey === key) flipDir(); else { setKey; setDir('asc'); }`
plus the `useState` pair. Extract a `useTableSort<Key>()` hook returning
`{ sortKey, sortDir, toggle }`. Removes ~10 lines × 5 and guarantees the §7.8
"always an active sort" rule in one place.

**45. 🔵 `formatStudentLabel` is page-local but pure and reusable.**
(`grading/.../run/page.tsx:68`) It belongs in `lib/` — and UX finding #2 (show
*who* you're grading on the session page) needs exactly this function. Moving it
unblocks that fix without duplicating.

---

## Headline priorities

0. **#33** — 🔴🔴 **CRITICAL, fix first.** Unauthenticated self-registration as
   ADMIN. One-line root cause, total compromise. Drop `role` from the public
   register schema + hard-code STUDENT + regression test.
1. **#23 + #24 + #40** — the missing-`assert_test_access` cluster (three confirmed
   sibling routes: PATCH grades, GET result, PATCH scoring-config). Fix together
   and grep every `_require_instructor_or_admin` route for the paired assert.
2. **#34** — refresh-cookie `Secure=False` in production (auth hardening).
3. **#3 / #4** — grading session page's three-way "graded" contradiction +
   render-time redirect (correctness, in the file you flagged).
4. **#1 / #2** — the grading-header declutter you raised: strip to
   back · who+what · "N of M" pager; demote the score summary into the body.
5. **#24 / #25** — sibling read-auth gap + missing pagination (defense-in-depth
   + scalability).
6. **#26 / #27** — sanitizer consolidation (closes silent-image bug) + wire the
   already-written grading response DTOs.
