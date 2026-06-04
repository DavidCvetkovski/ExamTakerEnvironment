# Epoch 14 — Security Review

Manual review of the Epoch 14 diff against `CLAUDE.md` §1. No automated SAST (Aikido retired).

## Surface inventory

Two new backend endpoints and one new field. Everything else is presentational
(home tiles, auth-page minimalism, exam keyboard handling, overflow menus,
course grouping) with no new server surface.

### 1. `PATCH /api/users/me/preferences/profile` (display name)
- **Authn/authz:** `Depends(get_current_user)`. No id in the path — the actor *is*
  the subject, so a user can only change their own name. No privilege escalation
  vector. ✅
- **Input validation:** `DisplayNameUpdate` Pydantic model — trims, collapses
  blank→`None`, rejects > 80 chars (`422`). Free text, but stored and rendered as
  a **text node only** (React escapes; never `dangerouslySetInnerHTML`). No XSS
  sink. ✅
- **Persistence:** Prisma parameterized update. No SQL interpolation. ✅
- **PII:** a display name is self-supplied and low-sensitivity; not logged. ✅

### 2. `GET /api/scheduled-sessions/{id}/incidents/export` (CSV log)
- **Authn/authz:** `require_role(CONSTRUCTOR, ADMIN)` + defense-in-depth
  `assert_can_proctor`. Identical model to the existing monitor/incident-feed
  endpoints. A `STUDENT`/`REVIEWER` cannot reach it. ✅
- **Resource scoping:** `get_scheduled_session_or_404` validates the session
  exists (bad id → 404, not an empty file). Query filters by
  `scheduled_session_id` (indexed). ✅
- **Data exposure:** columns are `created_at, student_email, incident_type,
  severity, source, detail`. This is the **same** data the live incident feed
  already returns to the same audience — no new PII. Crucially it carries **no
  answer contents, no tokens, no raw fingerprints** (Epoch 11 §2.1 discipline
  preserved; `detail` is the existing JSON metadata, compactly serialized). ✅
- **Read-only:** export only; the incident log remains append-only (no new
  write/update/delete paths). ✅
- **Injection:** values come from our own DB enums/timestamps + a controlled JSON
  blob; CSV is written via `csv.writer` (quoting handled). Low CSV-formula-
  injection risk for an internal staff export; acceptable, consistent with the
  existing QTI/grade exports. ✅

### 3. `GET /api/qti/questions/export-all`
- **Authn/authz:** `require_role(ADMIN, CONSTRUCTOR)` — same guard as the existing
  bank/test/blueprint exports it sits beside. ✅
- **Behaviour:** exports every learning object (single-bank deployment). No
  student responses exported; `include_correct` honoured exactly as the sibling
  export endpoints. Audit-logged via `integration_audit_service`. ✅

## Frontend notes
- Auth pages pin `data-theme="warm"` — presentational only, no security surface.
- Sessions/blueprint overflow menus are advisory; **all authorization remains
  server-side** (cancel, monitor, export all still hit the same guarded
  endpoints). §1 "frontend disables are advisory; backend 403 authoritative"
  upheld. ✅
- Exam keyboard change is pure client UX; no bypass of any server rule.

## Findings
No high-severity findings. The two new read endpoints reuse established
authorization and introduce no PII beyond what their audience already sees.
Cleared for merge pending the standard review of the final diff.
