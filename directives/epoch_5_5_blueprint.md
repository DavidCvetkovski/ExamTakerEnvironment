# Epoch 5.5 Blueprint — Course-Gated Scheduled Sessions + Role-Separated UX

## Summary
Epoch 5.5 will split blueprint authoring from session scheduling, introduce course enrollment constraints, and deliver a dedicated student experience that only shows joinable/upcoming exams. It will also remove blueprint validation and add stronger save animations for blueprint publishing.

This plan is decision-complete and implementation-ready.

## Current Code Status (Ground Truth)
- Blueprint authoring and session launch are currently mixed in one screen: `frontend/src/app/blueprint/page.tsx`.
- Session creation is immediate (`POST /api/sessions/`) and does not require scheduled date/time.
- No course or enrollment model exists in Prisma or backend domain models.
- Students can currently access non-student pages (`/items`, `/blueprint`).
- Student and professor/admin use mostly the same navigation shell.
- Submission confirmation has no explicit “return to home” button.
- Validation endpoint and UI are active (`POST /api/tests/{id}/validate` + Validate button).
- Heartbeat/submission exam flow exists and is stable (`backend/tests/test_interactions.py` passes).

## Target Behavior (Locked)
1. `Test Blueprints` and `Session Manager` are separate tabs/routes.
2. Scheduling a session requires:
   - selected course
   - selected blueprint
   - exam start datetime
3. Only students enrolled in the session course can join that session.
4. Student UI is isolated:
   - only “My Exams” dashboard
   - only future/current assigned sessions
   - no blueprint/library/authoring tabs
5. After finishing an exam:
   - student sees “Back to My Exams”
   - professor/admin practice attempt sees “Back to Session Manager”
6. Remove validation feature entirely:
   - remove backend endpoint/service
   - remove frontend validation state/button/panels
7. Blueprint save UX gets clear animation states:
   - saving
   - saved
   - error

## Public Interfaces and Data Contracts

### New backend enums
- `CourseSessionStatus`: `SCHEDULED | ACTIVE | CLOSED | CANCELED`
- `ExamSessionMode`: `ASSIGNED | PRACTICE`

### New backend models
- `Course`
  - `id`, `code`, `title`, `created_by`, `is_active`, timestamps
- `CourseEnrollment`
  - `id`, `course_id`, `student_id`, `is_active`, `enrolled_at`
  - unique `(course_id, student_id)`
- `ScheduledExamSession`
  - `id`, `course_id`, `test_definition_id`, `created_by`
  - `starts_at`, `ends_at`
  - `status`
  - optional `duration_minutes_override`
  - timestamps

### Updated model
- `ExamSession`
  - add `scheduled_session_id` nullable FK
  - add `session_mode` (`ASSIGNED` or `PRACTICE`)
  - existing `student_id` remains and represents “attempt owner” for both student and practice users

### New/changed API endpoints
- `POST /api/courses` (ADMIN, CONSTRUCTOR)
- `GET /api/courses` (ADMIN, CONSTRUCTOR)
- `GET /api/courses/{course_id}/enrollments` (ADMIN, CONSTRUCTOR)
- `POST /api/courses/{course_id}/enrollments` (ADMIN, CONSTRUCTOR)
- `DELETE /api/courses/{course_id}/enrollments/{student_id}` (ADMIN, CONSTRUCTOR)

- `POST /api/scheduled-sessions` (ADMIN, CONSTRUCTOR)
- `GET /api/scheduled-sessions` (ADMIN, CONSTRUCTOR)
- `PATCH /api/scheduled-sessions/{id}` (ADMIN, CONSTRUCTOR, only before start)
- `POST /api/scheduled-sessions/{id}/cancel` (ADMIN, CONSTRUCTOR)

- `GET /api/student/sessions` (STUDENT)
  - returns only future/current sessions where student has active enrollment
- `POST /api/student/sessions/{scheduled_session_id}/join` (STUDENT)
  - enforces enrollment and active time window
  - returns existing attempt if already created

- `POST /api/sessions/practice` (ADMIN, CONSTRUCTOR)
  - creates practice attempt directly from blueprint

- `POST /api/sessions/` becomes restricted:
  - temporary compatibility alias to practice path for ADMIN/CONSTRUCTOR only
  - STUDENT receives `403`

- `POST /api/tests/{id}/validate` removed

### Frontend routing contract
- `GET /blueprint` remains blueprint-only authoring page
- `GET /sessions` new professor/admin scheduling page
- `GET /my-exams` new student-only page
- Login redirect:
  - STUDENT -> `/my-exams`
  - ADMIN/CONSTRUCTOR -> `/sessions`

## Stage-by-Stage Implementation

### Stage 1 — Schema and migration foundation
- Add new Prisma entities and enums: `courses`, `course_enrollments`, `scheduled_exam_sessions`, `exam_session_mode`.
- Add exam session columns: `scheduled_session_id`, `session_mode`.
- Add Alembic migration for SQLAlchemy parity and runtime compatibility.
- Backfill existing `exam_sessions.session_mode = PRACTICE`.
- Keep `scheduled_session_id = NULL` for historical sessions.

Exit criteria:
- migrations apply cleanly
- existing sessions still retrievable
- no data loss

### Stage 2 — Backend domain and service layer
- Add model classes for Course/Enrollment/ScheduledSession.
- Add schemas for course CRUD, enrollment updates, schedule create/list/update, student session list/join.
- Add services:
  - `courses_service.py`
  - `scheduled_sessions_service.py`
- Update `exam_sessions_service.py`:
  - add `instantiate_practice_session`
  - add join/create attempt flow for scheduled sessions
  - preserve freeze logic and heartbeat compatibility

Exit criteria:
- instructor can create course, enroll students, create scheduled session
- student can join only when enrolled and active window

### Stage 3 — API and RBAC hardening
- Mount new routers for courses, scheduled sessions, student sessions.
- Lock down role access:
  - student cannot access course/scheduler admin endpoints
  - student cannot instantiate arbitrary session via old endpoint
- Remove validate route from tests endpoint.

Exit criteria:
- role matrix enforced with explicit 403 paths
- validation endpoint removed from OpenAPI

### Stage 4 — Navigation split and role-specific app shell
- Update global header links by role:
  - ADMIN/CONSTRUCTOR: `Question Library`, `Test Blueprints`, `Session Manager`, `Authoring Workbench`
  - STUDENT: `My Exams` only
- Remove STUDENT role from authoring/library/blueprint page guards.
- Update login redirect by role.

Exit criteria:
- student cannot navigate to builder/admin tabs
- instructor/admin still have full non-student surface

### Stage 5 — Session Manager UI (professor/admin)
- Build `/sessions` page with:
  - schedule creation form: course + blueprint + start datetime
  - scheduled session table with status badges and filters
  - action buttons: edit/cancel, start practice
- Remove “real session launch” from blueprint page.
- Keep optional “Practice Blueprint” action in blueprint view.

Exit criteria:
- all scheduled session creation happens in Session Manager
- blueprint screen is authoring-only plus optional practice shortcut

### Stage 6 — Student My Exams dashboard
- Build `/my-exams` student page:
  - “Current / joinable” section
  - “Upcoming” section
  - no historical/completed clutter by default
- Join action calls `POST /api/student/sessions/{id}/join` then routes to `/exam/{attemptId}`.

Exit criteria:
- student sees only enrolled future/current sessions
- student can join only active ones

### Stage 7 — Exam completion return flow
- Extend exam session response with `session_mode` and `return_path`.
- Update exam page and submission confirmation:
  - ASSIGNED -> button “Back to My Exams” (`/my-exams`)
  - PRACTICE -> button “Back to Session Manager” (`/sessions`)
- Keep this button visible after submit and after expired read-only state.

Exit criteria:
- both student and professor/admin always have explicit “go home” action after finishing

### Stage 8 — Remove blueprint validation feature
- Backend:
  - delete validation service function and endpoint wiring
- Frontend:
  - remove `validation` state and action from blueprint store
  - remove Validate button and validation issue panels

Exit criteria:
- no validate API usage remains
- blueprint save/publish flow still works

### Stage 9 — Blueprint save animation/feedback upgrade
- Add explicit save state machine in blueprint store:
  - `idle -> saving -> saved` or `error`
- Add animated save indicator component in blueprint footer.
- Add motion behaviors:
  - spinner/progress while saving
  - pulse/check on success
  - shake/red state on error
- Keep accessibility via `aria-live="polite"` status text.

Exit criteria:
- save feedback is visually obvious and state-driven
- no ambiguity for user about save outcome

### Stage 10 — QA and rollout hardening
- Update seed data to include course + enrollment + scheduled session examples.
- Add backend tests and frontend e2e for enrollment gates and separated UX.
- Remove or update old tests that depend on validate endpoint and mixed blueprint/session flow.

Exit criteria:
- core authz/session tests pass
- student UI isolation verified
- scheduling flow verified end-to-end

## File and Class Plan

### New files
- `backend/app/models/course.py`
  - `Course`
- `backend/app/models/course_enrollment.py`
  - `CourseEnrollment`
- `backend/app/models/scheduled_exam_session.py`
  - `ScheduledExamSession`, `CourseSessionStatus`
- `backend/app/schemas/course.py`
  - `CourseCreate`, `CourseResponse`, `EnrollmentUpdateRequest`, `EnrollmentResponse`
- `backend/app/schemas/scheduled_session.py`
  - `ScheduledSessionCreate`, `ScheduledSessionUpdate`, `ScheduledSessionResponse`, `StudentScheduledSessionResponse`
- `backend/app/services/courses_service.py`
- `backend/app/services/scheduled_sessions_service.py`
- `backend/app/api/endpoints/courses.py`
- `backend/app/api/endpoints/scheduled_sessions.py`
- `backend/app/api/endpoints/student_sessions.py`
- `backend/tests/test_courses.py`
- `backend/tests/test_scheduled_sessions.py`
- `backend/alembic/versions/<timestamp>_epoch_5_5_courses_and_scheduling.py`

- `frontend/src/app/sessions/page.tsx`
- `frontend/src/app/my-exams/page.tsx`
- `frontend/src/stores/useCourseStore.ts`
- `frontend/src/stores/useSessionManagerStore.ts`
- `frontend/src/stores/useStudentSessionsStore.ts`
- `frontend/src/components/sessions/SessionCreateForm.tsx`
- `frontend/src/components/sessions/ScheduledSessionsTable.tsx`
- `frontend/src/components/sessions/CourseEnrollmentDrawer.tsx`
- `frontend/src/components/student/StudentExamCard.tsx`
- `frontend/src/components/blueprint/BlueprintSaveIndicator.tsx`
- `frontend/tests/e2e/session-manager.spec.ts`
- `frontend/tests/e2e/student-my-exams.spec.ts`

### Modified files
- `prisma/schema.prisma`
- `backend/app/models/exam_session.py`
- `backend/app/models/__init__.py`
- `backend/app/schemas/exam_session.py`
- `backend/app/services/exam_sessions_service.py`
- `backend/app/services/blueprints_service.py`
- `backend/app/api/api.py`
- `backend/app/api/endpoints/sessions.py`
- `backend/app/api/endpoints/tests.py`
- `backend/seed.py`
- `backend/seed_e2e.py`
- `backend/tests/test_sessions.py`
- `backend/tests/test_test_matrix.py`

- `frontend/src/components/layout/GlobalHeader.tsx`
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/blueprint/page.tsx`
- `frontend/src/app/items/page.tsx`
- `frontend/src/app/author/page.tsx`
- `frontend/src/app/exam/[id]/page.tsx`
- `frontend/src/components/exam/SubmissionConfirmation.tsx`
- `frontend/src/stores/useAuthStore.ts`
- `frontend/src/stores/useBlueprintStore.ts`
- `frontend/src/stores/useExamStore.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/app/globals.css`
- `frontend/tests/e2e/blueprint-picker.spec.ts`
- `frontend/tests/e2e/exam-flow.spec.ts`

## Test Plan (Acceptance Matrix)
1. Scheduling flow:
   - instructor creates course, enrolls student, schedules blueprint with start datetime
   - scheduled session appears in instructor manager
2. Enrollment gate:
   - enrolled student can see and join active session
   - non-enrolled student cannot see or join (403)
3. Time gate:
   - before start: visible as upcoming, cannot join
   - active window: join succeeds
   - closed/canceled: join rejected
4. Role isolation:
   - student only has `/my-exams` nav
   - student blocked from `/items`, `/author`, `/blueprint`, `/sessions`
5. Practice mode:
   - admin/constructor can launch practice
   - after submit, return button goes to `/sessions`
6. Assigned student mode:
   - after submit, return button goes to `/my-exams`
7. Validation removal:
   - no frontend calls to `/tests/{id}/validate`
   - old validate route unavailable
8. Blueprint save animation:
   - clear saving/saved/error state transitions visible and testable

## Assumptions and Defaults (Locked)
- “Professor” maps to existing `CONSTRUCTOR` role.
- All schedule times are stored in UTC; UI input/output is local browser time.
- One active attempt per `(student_id, scheduled_session_id)`.
- Session `ends_at` defaults to `starts_at + blueprint duration`, unless override supplied.
- Existing historical sessions are treated as `PRACTICE` after migration backfill.
- Validation feature is intentionally removed with no replacement in Epoch 5.5.
- Grade publication/analytics remain out of scope for Epoch 5.5.
