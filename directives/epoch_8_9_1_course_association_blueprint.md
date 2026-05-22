# Epoch 8.9.1 — Course Association for Blueprints

> **Status:** Approved blueprint (per CLAUDE.md §6 — plan before code).
> **Branch:** `epoch-8.9.1-course-association`
> **Depends on:** Epoch 5.5 (courses & scheduling), Epoch 8.3/8.4 (blueprint lifecycle & locking), Epoch 8.3 (import drafts).

## 1. Motivation

Blueprints (test definitions) currently float free of any course. Questions
(`learning_objects`) already carry an optional `course_id` (Epoch 5.5 migration
`7d3f1b8a9c2e`), and scheduled sessions require both a `course_id` and a
`test_definition_id` — but nothing ties a blueprint to a course. This causes
three workflow problems this epoch fixes:

1. Authors cannot express "this exam belongs to STA1001," so the blueprint list
   is an undifferentiated pile as the bank grows.
2. When scheduling a session, the blueprint dropdown lists *every* blueprint,
   inviting the mistake of scheduling a Physics exam into a Statistics course.
3. The question library's topic filter lists every topic in the bank even after
   a course is chosen, including topics with zero matching items.

## 2. Scope (four deliverables)

| # | Deliverable | Surfaces |
|---|---|---|
| F1 | **Assign a blueprint to a course** (or leave it *Unassigned*), including via bulk import | Blueprint editor, import template + persister, DB, API |
| F2 | **Filter blueprints by course** | Blueprint list page, list API |
| F3 | **Gate session scheduling on course** — blueprint picker is disabled until a course is chosen, then shows only that course's blueprints **plus** unassigned ones | Session create form (FE) + scheduling service (BE authoritative) |
| F4 | **Course-aware topic filter in the question library** — the topic dropdown lists only topics present among items currently visible under the selected course | Items page (FE only) |

Out of scope: migrating existing blueprints to courses (they stay `Unassigned`),
per-course permissions/ownership, and any change to the student-facing flow.

## 3. Data model

Add a **nullable** `course_id` FK to `test_definitions`. Nullable is the whole
point: `NULL` = *Unassigned*, mirroring `learning_objects.course_id` exactly so
the two domains stay consistent (CLAUDE.md §2 single-source-of-truth for the
"course association" concept).

### 3.1 Alembic migration (`add_course_to_test_definitions`)

Model it on `7d3f1b8a9c2e_add_course_to_learning_objects.py`:

```python
down_revision = "7d3f1b8a9c2e"  # current head

def upgrade():
    op.add_column("test_definitions", sa.Column("course_id", sa.UUID(), nullable=True))
    op.create_index("ix_test_definitions_course_id", "test_definitions", ["course_id"])
    op.create_foreign_key(
        "fk_test_definitions_course_id_courses",
        "test_definitions", "courses", ["course_id"], ["id"],
    )

def downgrade():
    op.drop_constraint("fk_test_definitions_course_id_courses", "test_definitions", type_="foreignkey")
    op.drop_index("ix_test_definitions_course_id", table_name="test_definitions")
    op.drop_column("test_definitions", "course_id")
```

- Index on the FK column per CLAUDE.md §4 (every FK indexed; read-heavy filters).
- **DB reconciliation note:** the dev DB's `alembic_version` is behind the real
  schema (reads `eb86591258e8` while the schema already has
  `learning_objects.course_id`). Before applying, `alembic stamp head` if the
  column-adds it would replay are already present, then apply only the new
  revision. Verify with a guarded check (column existence) rather than blind
  `upgrade head`.

### 3.2 ORM + Prisma

- `models/test_definition.py`: add `course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)` and a `course` relationship.
- `prisma/schema.prisma`: add `course_id String? @db.Uuid`, the `courses` relation, and the `@@index`. Mirror the back-relation field on `courses` (`test_definitions test_definitions[]`). Regenerate the Prisma client (`prisma generate`).

## 4. Backend

### 4.1 Schemas (`schemas/test_definition.py`)

- `TestDefinitionBase`: add `course_id: Optional[UUID] = None`.
- `TestDefinitionResponse`: inherits it (already `from_attributes`).
- The create/update validator stays as-is for blocks. Course validity is
  enforced in the service (needs DB access), not the schema.

### 4.2 Service (`services/blueprints_service.py`)

- New helper `async def _validate_course(course_id) -> None`: when not `None`,
  fetch the course; 404/400 if missing or inactive. Reused by create + update.
- `create_test_definition` / `update_test_definition`: persist `course_id`
  (validated). Keep functions <40 lines (CLAUDE.md §2) — extract the validation.
- `list_test_definitions(course_id: str | None | "UNASSIGNED")`: push the filter
  into the Prisma `where` clause (DB-side, not in Python) per §4 scalability:
  - no filter → all
  - a UUID → `where={"course_id": id}`
  - sentinel `"unassigned"` → `where={"course_id": None}`
- `duplicate_test_definition` (in `endpoints/tests.py`): copy `course_id` too.

### 4.3 Endpoints (`endpoints/tests.py`)

- `GET /tests/?course_id=<uuid|unassigned>`: optional query param, passed to the
  service. Default unchanged (all). Authorization unchanged (any authenticated
  user can list; create/update/delete remain CONSTRUCTOR/ADMIN).
- Response models already flow `course_id` through `TestDefinitionResponse`.

### 4.4 Scheduling guard (`services/scheduled_sessions_service.py`) — **authoritative for F3**

Frontend disabling is advisory (CLAUDE.md §1). In `create_scheduled_session`
**and** `update_scheduled_session`, after loading the test definition, assert:

```
blueprint.course_id is None OR blueprint.course_id == payload.course_id
```

else `400 Bad Request` ("This blueprint is not available for the selected
course."). Extract to a shared `_assert_blueprint_allowed_for_course(...)`
helper (single source — §2).

### 4.5 Import (`services/import_service/persister.py` + template)

- The grammar already parses a `Course:` header into `header.course`, and the
  persister already resolves it to a `course_id` for the **questions**. Extend
  the same resolved `course_id` to the **blueprint** create call (one-line add
  to the `test_definitions.create` data). Single resolution, two consumers.
- `frontend/public/import-template.txt` + `FormatGuideModal.tsx`: clarify the
  `Course:` token now also **assigns the generated blueprint** to that course
  (today the copy only says it tags questions). Keep it optional; unknown/blank
  course code → Unassigned (no hard error, matches current question behavior).

## 5. Frontend

### 5.1 Blueprint editor (`app/blueprint/page.tsx`, `stores/useBlueprintStore.ts`) — F1

- `TestDefinition` interface: add `course_id?: string | null`.
- Editor: a `<Select>` "Course" control with options = `Unassigned` (value `''`
  → sent as `null`) + each course from `useCourseStore`. Persist into the draft
  via the existing `saveState` patch path, so dirty-tracking & autosave already
  cover it.
- The blueprint editor must fetch courses (`useCourseStore.fetchCourses`) on mount.

### 5.2 Blueprint list filter (`app/blueprint/page.tsx`) — F2

- Add a course filter `<Select>` alongside the existing status filter:
  `All courses` / `Unassigned` / each course. Default `All`.
- Persist per surface via Zustand `persist` (CLAUDE.md §7.8) — extend the
  existing `useBlueprintStore` persisted slice with `courseFilter`.
- Filtering is client-side over the already-fetched list for snappy UX, but the
  list API also supports `course_id` (4.3) for when the bank grows — wire the FE
  to pass it so we don't over-fetch. (Use the API filter as the source of truth.)

### 5.3 Session scheduling gate (`components/sessions/SessionCreateForm.tsx`) — F3

- Blueprint `<Select>` is `disabled` until `courseId` is truthy. Placeholder
  copy: "Select a course first".
- Once a course is chosen, options = blueprints where
  `blueprint.course_id === courseId || blueprint.course_id == null` (assigned to
  this course **or** unassigned).
- If the currently-selected blueprint becomes invalid after a course change,
  reset `testDefinitionId` to `''`.
- Backend (4.4) is the real guard; this is UX.

### 5.4 Library topic filter (`app/items/page.tsx`) — F4

- Today `uniqueTopics` is derived from **all** items. Change it to derive from
  the items left after applying the **course** filter (and search), so the topic
  dropdown only lists topics with visible items.
- When `courseFilter` changes and the active `topicFilter` is no longer in the
  available set, reset `topicFilter` to `'all'` (a `useEffect`).
- Pure-frontend; no API change. Derivation via `useMemo` keyed on `items` +
  `courseFilter` (+ search if we choose to include it).

## 6. Security, modularity, scalability checklist

- **Security:** course validity + the scheduling course/blueprint match are
  enforced in the **service layer** (authoritative), not just the UI. Role
  guards unchanged (CONSTRUCTOR/ADMIN for authoring & scheduling). Inputs typed
  via Pydantic; the `course_id` query param accepts only a UUID or the literal
  `unassigned`.
- **Modularity:** validation helpers extracted and reused (no copy-paste across
  create/update). FE filter state lives in the domain store, not prop-drilled.
- **Scalability:** blueprint list filter executes in the DB `where` clause with
  the new FK index; no N+1, no unbounded Python filtering.
- **Maintainability:** `course_id == NULL ⇒ Unassigned` is the single rule for
  "unassigned" across questions and blueprints. Lifecycle/lock semantics
  untouched.
- **Design system:** course selectors use the existing `<Select>` primitive and
  design tokens; no literal Tailwind colors; "Unassigned" label is canonical
  (not "None"/"No course").

## 7. Testing (REQUIRED — extra tests proving each feature works)

> Per CLAUDE.md §5: each feature ships with ≥1 happy-path, ≥1 error/edge case,
> and an integration test for cross-module flows. These are **new** tests added
> in this epoch, not a rerun of existing ones.

### 7.1 Backend (pytest — `backend/tests/`)

- `test_blueprint_course.py` (new):
  - **happy:** create a blueprint with a valid `course_id` → persisted & echoed.
  - **happy:** create with `course_id = null` → stored as Unassigned.
  - **edge/error:** create/update with a non-existent or inactive `course_id` → 4xx.
  - **happy:** `GET /tests/?course_id=<id>` returns only that course's blueprints; `?course_id=unassigned` returns only NULL ones; no param returns all.
  - **happy:** duplicate copies `course_id`.
- `test_scheduled_session_course_guard.py` (new) — F3 authoritative guard:
  - **happy:** schedule with a blueprint assigned to the same course → 201.
  - **happy:** schedule with an *unassigned* blueprint into any course → 201.
  - **error:** schedule with a blueprint assigned to a *different* course → 400.
  - **error:** same matrix for `PATCH` update.
- Extend `backend/tests/test_import_*` (or add `test_import_course_blueprint.py`):
  - **integration:** import text with `Course: <code>` → both the questions and
    the generated blueprint carry that `course_id`.
  - **edge:** unknown course code → questions + blueprint Unassigned, import still succeeds (warning, not error).

### 7.2 Frontend / E2E (Playwright — where the harness supports it)

- Blueprint editor: assign a course, save, reload → selection persists.
- Blueprint list: course filter narrows the list; `Unassigned` works.
- Session form: blueprint select disabled until course chosen; after choosing a
  course only matching + unassigned blueprints appear; switching course resets an
  now-invalid blueprint selection.
- Library: selecting a course prunes the topic dropdown to topics with visible
  items; switching course resets a stale topic selection.

(If the Playwright harness isn't runnable in this environment, the backend
integration tests above are the gating coverage and the FE behaviors are covered
by targeted unit tests on the pure filter/derivation helpers.)

### 7.3 Definition of done

- `alembic upgrade head` applies cleanly; `prisma generate` succeeds.
- All new + existing backend tests green (`pytest`).
- Frontend type-checks/builds; design-token audit grep (CLAUDE.md §7.1) empty.
- Manual smoke of all four surfaces in at least the default theme.

## 8. Execution order

1. Migration + ORM + Prisma schema + `prisma generate` + DB reconcile.
2. Backend schemas → service (validation + list filter) → endpoints → scheduling guard → import persister/template.
3. Backend tests (7.1) — write and run; iterate to green.
4. Frontend store types + blueprint editor (F1) → list filter (F2) → session gate (F3) → library topic filter (F4).
5. Frontend tests / helper unit tests (7.2).
6. Token audit, build, smoke. Commit in conventional `feat(8.9.1): …` slices.
