# Epoch 8.7 - Course-Aware Authoring, Quiet Sessions, and Curriculum Seed Overhaul

> **Type:** Mixed - UI cleanup, metadata/data-model hardening, question-library ergonomics, and a large e2e seed expansion.
> **Scope:** Frontend sessions/student cards, authoring metadata, library table/filter/sort, learning-object API/schema, and `seed_e2e.py` plus seed data organization.
> **Origin:** User request on 2026-05-16 before the seed overhaul.
>
> **Guiding principle:** Course titles are the human-facing object. Course codes are implementation/admin disambiguators. Questions belong to a course and a topic; "subject" is not the right vocabulary for this app.

---

## Stage Index

| # | Stage | Surface |
|---|---|---|
| 1 | Hide course codes from ordinary session surfaces | `/sessions`, `/my-exams`, grading/analytics run labels |
| 2 | Make questions course-aware | DB migration, Prisma, SQLAlchemy model, learning-object API |
| 3 | Rename Subject -> Topic in authoring and selection | `/author`, question picker, blueprint/random-rule UI, copy cleanup |
| 4 | Upgrade question library filters, columns, and sort | `/items` |
| 5 | Curriculum-scale seed data architecture | seed catalog modules/factories |
| 6 | Expanded curriculum, practice exams, and functionality fixtures | `seed_e2e.py` |
| 7 | Verification gates and visual matrix | backend tests, frontend type/lint, Playwright smoke |

---

## Stage 0 - Decisions

### 0.1 Course Identity

Questions should store a real `course_id`, not just `metadata_tags.course` or a course code string.

**Decision:** Add nullable `course_id` to `learning_objects`, with a foreign key to `courses.id`.

Why:
- A learning object represents the stable question identity; versions represent edits to the stem/options/points/topic.
- Course membership should survive version edits.
- Filtering the library by course needs relational integrity, not string matching.
- This matches the project principle: maintain relational integrity with foreign keys where possible.

Backwards compatibility:
- Existing learning objects can have `course_id = null`.
- The UI renders null as `Unassigned`.
- The seed overhaul must assign every seeded learning object to a course.

### 0.2 Topic Vocabulary

Current implementation already stores the authoring text in `metadata_tags.topic`, but the UI labels it as `Subject` in several places.

**Decision:** Keep `metadata_tags.topic` as the canonical field and rename UI copy to `Topic`.

Compatibility:
- If old rows have `metadata_tags.subject` and no `topic`, migration/service fallback should copy or expose it as `topic`.
- After Epoch 8.7, new writes should not create `metadata_tags.subject`.

### 0.3 Course Codes

Course codes remain useful in creation/editing contexts, but should not dominate normal reading surfaces.

**Decision:** Course codes are visible only when selecting or creating a course, and optionally as muted secondary text or tooltip where disambiguation is genuinely needed. They are not bold labels above course titles.

---

## Stage 1 - Hide Course Codes From Ordinary Session Surfaces

### Problem

The sessions UI currently treats course code as the primary label:
- `ScheduledSessionsTable` renders `session.course_code` bold above `session.course_title`.
- `StudentExamCard` renders `session.course_code` as an eyebrow above the exam title.
- Some grading/analytics run labels use `course_code` when building run descriptions.

This creates visual clutter and makes the less meaningful identifier compete with the actual course title.

### Implementation

**File: `frontend/src/components/sessions/ScheduledSessionsTable.tsx`**
- In the Course column, render `session.course_title` as the primary text.
- Remove the visible bold course code.
- If needed, put the code in `title={session.course_code}` or in a visually muted secondary line only when two same-title courses exist. Do not render it by default.

**File: `frontend/src/components/student/StudentExamCard.tsx`**
- Remove the code eyebrow.
- Render course title as the quiet meta line under the test title.
- The top of the card should read: exam title, course title, status badge.

**Files:**
- `frontend/src/app/grading/test/[testId]/page.tsx`
- `frontend/src/app/grading/test/[testId]/run/[runId]/page.tsx`
- `frontend/src/app/analytics/tests/[testId]/page.tsx`
- `frontend/src/app/analytics/tests/[testId]/run/[runId]/page.tsx`

Replace "Run on CS-305" style labels with course title first:
- Good: `Database Systems`
- Acceptable secondary tooltip: `CS-305`
- Avoid: `CS-305 - Database Systems` as the default visible label.

**File: `frontend/src/components/sessions/SessionCreateForm.tsx`**
- Keep course code visible here, because creation/selection is where codes can help disambiguate.
- Course dropdown options should still lead with title: `Database Systems` with code as muted secondary text if custom select supports it. Native `<option>` may use `Database Systems (CS-305)`.

### Acceptance

- `/sessions` shows course titles, not bold course codes.
- `/my-exams` cards show course titles, not code eyebrows.
- Grading/analytics run pickers describe runs by course title and date.
- Course code still exists in course creation/selection surfaces.

---

## Stage 2 - Make Questions Course-Aware

### Backend Data Model

**Migration: new Alembic revision**
- Add `course_id UUID NULL` to `learning_objects`.
- Add FK: `learning_objects.course_id -> courses.id`.
- Add index: `ix_learning_objects_course_id`.
- No destructive backfill in migration. Existing data stays nullable.

**File: `backend/app/models/learning_object.py`**
- Add `course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True, index=True)`.
- Add relationship to `Course` if useful for SQLAlchemy seed code.

**File: `prisma/schema.prisma`**
- Add `course_id String? @db.Uuid` to `learning_objects`.
- Add `courses? @relation(fields: [course_id], references: [id], ...)`.
- Add `learning_objects learning_objects[]` relation to `courses`.
- Add `@@index([course_id], map: "ix_learning_objects_course_id")`.

### API Shape

**File: `backend/app/schemas/learning_object.py`**
- Extend `LearningObjectListResponse`:
  - `course_id: Optional[UUID]`
  - `course_title: Optional[str]`
  - `course_code: Optional[str]`
- Extend/create detail/update schemas:
  - `LearningObjectUpdate(course_id: Optional[UUID])`

**File: `backend/app/api/endpoints/items.py`**
- Add `PATCH /learning-objects/{lo_id}` for updating learning-object-level metadata such as `course_id`.
- Keep version content saves at `POST /learning-objects/{lo_id}/versions`.
- Authorization: constructor/admin only.
- Validate that the course exists and is active.

**File: `backend/app/services/items_service.py`**
- `list_learning_objects()` includes course relation/title/code.
- `create_learning_object()` accepts optional `course_id` if caller provides it later, but can still create an unassigned draft for current flow.
- `update_learning_object()` validates and persists course assignment.

### Frontend Store Types

**File: `frontend/src/stores/useLibraryStore.ts`**
- Extend `LearningObjectSummary` with:
  - `course_id?: string | null`
  - `course_title?: string | null`
  - `course_code?: string | null`

**File: `frontend/src/stores/useAuthoringStore.ts`**
- Add `courseId: string | null` to authoring state.
- Fetch latest version should also load the learning object's `course_id`.
- Add `setCourseId(courseId: string | null)`.
- Add `saveLearningObjectMetadata()` or include a coordinated save path that calls the new `PATCH /learning-objects/{lo_id}` when course changes.

### Acceptance

- A question can be assigned to a real course.
- Library API returns course title/code for each item.
- Invalid course ids are rejected server-side.
- Existing unassigned questions still render and can still be edited.

---

## Stage 3 - Rename Subject -> Topic in Authoring and Selection

### Problem

The UI says `Subject` where the user means `Topic`. This appears in:
- Author page metadata field.
- Library filter and column.
- Question picker filter.
- Blueprint inspector badges.
- Question inspector metadata strip.
- Format guide import copy.

### Implementation

**File: `frontend/src/app/author/page.tsx`**
- Rename field label `Subject` -> `Topic`.
- Placeholder becomes `e.g. Hashing`, `e.g. Normalisation`, or simply `Topic`.
- Keep writing to `metadataTags.topic`.

**Files:**
- `frontend/src/app/items/page.tsx`
- `frontend/src/components/blueprint/QuestionPickerModal.tsx`
- `frontend/src/components/blueprint/BlueprintInspector.tsx`
- `frontend/src/components/editor/QuestionInspector.tsx`

Rename visible text:
- `All subjects` -> `All topics`
- `Subject` column -> `Topic`
- `Subject` metadata strip -> `Topic`

**File: `frontend/src/lib/subjectColor.ts`**
- Either rename to `topicColor.ts`, or keep the internal filename for now and export `topicTone` as the preferred name.
- Avoid sweeping renames if they create noise; the user-facing copy is the important part.

**File: `frontend/src/components/import/FormatGuideModal.tsx`**
- Rename `SUBJECT:` format guide copy to `TOPIC:`.
- For backwards compatibility, parser may accept `SUBJECT:` as an alias with a warning for one release.

**Backend import service**
- `backend/app/services/import_service/persister.py` should write `metadata_tags.topic`.
- `SUBJECT:` legacy input maps to `topic`, not to `subject`.

### Acceptance

- No user-facing label says `Subject` for item metadata.
- New authoring/import writes use `topic`.
- Legacy `subject` metadata still displays as topic if `topic` is missing.

---

## Stage 4 - Upgrade Question Library Filters, Columns, and Sort

### Desired Library Shape

Columns should become:

| Column | Notes |
|---|---|
| Preview | Existing stem preview |
| Course | New, title-first; `Unassigned` if null |
| Topic | Renamed from Subject |
| Points | Existing |
| Type | Existing compact chip, now sortable |
| Lock | Separate lock status column |
| Last edited | Existing |
| First created | Existing |
| Actions | Kebab only |

If this becomes too wide at desktop sizes, prefer compacting Points/Type/Lock before dropping Course or Topic. Course and Topic are now core scan axes.

### Lock Column

Separate the lock indicator from the Type column.

Definitions:
- **Locked** means the item is referenced by an `ONGOING` or `PASSED` blueprint and should render read-only.
- **Referenced** by a `NEW` or `SCHEDULED` blueprint can still be shown in tooltip/count, but it is not "locked".

UI:
- Lock column uses a small lock icon or text label.
- Tooltip:
  - Locked: `Locked by completed or ongoing blueprint`
  - Unlocked but referenced: `Referenced by N blueprint(s)`
  - Unlocked and unreferenced: `Not used in a blueprint`

### Filters

Add:
- Course filter: `All courses`, then course titles.
- Lock filter: `All`, `Locked`, `Unlocked`.

Existing filters remain:
- Search
- Topic
- Type
- Points

### Sort

Extend `SortKey`:
- `course`
- `topic`
- `points`
- `type`
- `lock`
- `updated`
- `created`
- `preview`

Default sort should be stable and useful:
1. Course title ascending
2. Topic ascending
3. Preview ascending

If the UI allows only one active sort key, default to `course`, ascending.

### Files

**File: `frontend/src/app/items/page.tsx`**
- Extend `SortKey`.
- Add `courseFilter` and `lockFilter`.
- Add Course column.
- Rename SubjectPill to TopicPill, or keep implementation but use topic-facing labels.
- Move `LockGlyph` into its own table cell.
- Make Type header sortable.

**File: `frontend/src/stores/useLibraryStore.ts`**
- Add course fields to summary type.

### Acceptance

- Library can filter by course.
- Library can filter to only locked or only unlocked questions.
- Library can sort by Type.
- Lock status is no longer visually attached to the Type chip.
- Topic copy is used everywhere.

---

## Stage 5 - Curriculum-Scale Seed Data Architecture

### Problem

`backend/seed_e2e.py` is already large and mostly Computer Science centered. The requested seed overhaul needs a whole-curriculum feel, practice exams, short live tests, and functionality fixtures. Adding all of that inline will make the seed impossible to maintain.

### Implementation

Create seed data modules under `backend/seed_data/`:

| File | Purpose |
|---|---|
| `backend/seed_data/factories.py` | `tiptap_doc`, `mcq`, `multi`, `essay`, `fixed_rule`, `random_rule`, scoring helpers |
| `backend/seed_data/curriculum.py` | Course catalog and item catalogs grouped by course |
| `backend/seed_data/blueprints.py` | Blueprint specs grouped by course and purpose |
| `backend/seed_data/schedules.py` | Scheduled-session fixtures, including live 1-minute windows |
| `backend/seed_data/attempts.py` | Attempt/answer plans for grading + analytics demos |

`seed_e2e.py` becomes orchestration:
1. Reset database.
2. Create users.
3. Create courses.
4. Create item bank and learning objects with `course_id`.
5. Create blueprints.
6. Create scheduled runs.
7. Create submitted/practice attempts.
8. Print a concise summary of what was created.

### Naming Rules

Course titles should be human-readable and title-first:
- `Programming Foundations`
- `Discrete Mathematics`
- `Data Structures and Algorithms`
- `Database Systems`
- `Operating Systems`
- `Computer Networks`
- `Software Engineering`
- `Web Application Development`
- `Human-Computer Interaction`
- `Machine Learning`
- `Security Engineering`
- `Research Methods`

Course codes may exist internally for uniqueness, but they should not be the visible identity in the UI.

Blueprint names should be predictable:
- `{Course Title} - Quiz 1`
- `{Course Title} - Midterm`
- `{Course Title} - Final`
- `{Course Title} - Practice Exam`
- `Functionality Test - ...` for deliberate UI/test fixtures.

### Acceptance

- Seed data is grouped and readable.
- Adding a course requires touching one catalog entry, not editing scattered code blocks.
- `seed_e2e.py` remains the command users run.

---

## Stage 6 - Expanded Curriculum, Practice Exams, and Functionality Fixtures

### Course and Question Volume

Target seed size:
- 12-14 courses.
- 12-20 questions per course.
- At least 180 learning objects total.
- Mix per course:
  - 8-12 single-choice questions.
  - 2-4 multiple-response questions.
  - 2 essay questions.

Every seeded learning object must have:
- `course_id`
- `metadata_tags.topic`
- `metadata_tags.points`
- `metadata_tags.difficulty`
- `metadata_tags.estimated_time_mins`
- pool tags for random rules where useful.

### Blueprint Volume

Create at least:
- One short quiz per course.
- One midterm or final for most courses.
- One practice exam for at least six courses.
- A cross-course sampler blueprint.

Target:
- 30-40 blueprints total.

Blueprint categories:
- **Course exams:** normal curriculum exams.
- **Practice exams:** clearly named and useful for manual experimentation.
- **Analytics demos:** enough submitted attempts to make charts meaningful.
- **Functionality tests:** intentionally short or edge-case blueprints.

### Short Live Functionality Tests

Add a dedicated fixture group with 1-minute windows relative to seed time:

| Name | Timing | Purpose |
|---|---|---|
| `Functionality Test - Active 1 Minute` | starts at `now - 10s`, ends at `now + 50s` | Join/ongoing countdown |
| `Functionality Test - Starts In 1 Minute` | starts at `now + 60s`, ends at `now + 120s` | Scheduled -> active flip |
| `Functionality Test - Ends Soon` | starts at `now - 50s`, ends at `now + 10s` | Active -> completed flip |
| `Functionality Test - Already Closed` | ended before seed finishes | Grading/analytics closed-run demo |

These should use tiny 1-3 question blueprints so they are fast to click through.

### Practice Attempts

Seed a few practice attempts:
- Submitted practice attempt.
- Started-but-not-submitted practice attempt.
- Expired attempt.

These should keep the practice bucket in grading/analytics visible and testable.

### Grading/Analytics Attempts

For 3-5 major exams, seed multiple closed scheduled runs:
- 20+ submitted attempts across a course final.
- A second run for the same blueprint on a different date.
- Some manually graded essays complete.
- Some essays pending, so grading dashboards show realistic partial states.

Do not make every blueprint "Completed"; keep a healthy mix:
- New/editable blueprints.
- Scheduled/future blueprints.
- Ongoing short windows.
- Completed/locked blueprints.

### Acceptance

- After running seed, `/blueprint` feels like a real curriculum, not a small demo.
- `/items` has enough data for course/topic/type/lock filters to matter.
- `/sessions` always has at least one active or soon-starting 1-minute test immediately after seed.
- `/grading` has closed runs with real work.
- `/analytics` has enough submissions to populate charts meaningfully.

---

## Stage 7 - Verification Gates

### Backend

Add or update tests:
- `backend/tests/test_library.py`
  - list response includes course fields.
  - course filter support if added server-side.
- `backend/tests/test_items_api.py`
  - patch learning object course assignment.
  - invalid course id is rejected.
  - non-constructor/admin cannot update course assignment.
- `backend/tests/test_import_service.py`
  - `TOPIC:` writes `metadata_tags.topic`.
  - legacy `SUBJECT:` maps to topic.

Run:
- `pytest backend/tests/test_items_api.py backend/tests/test_library.py`
- Broader backend suite if time permits.

### Frontend

Run:
- `npm exec tsc -- --noEmit`
- Targeted ESLint on changed files.

Playwright smoke:
- `/sessions`: course titles visible, code not prominent.
- `/my-exams`: course title visible, code eyebrow gone.
- `/author`: course picker exists; topic label exists.
- `/items`: course column, topic column, lock column, lock filter, course filter, type sort.
- Question picker: topic wording and course-aware filtering if implemented there.

### Visual Matrix

Check `dark`, `warm`, and `light-blue` for:
- Sessions table.
- Student exam cards.
- Author metadata row.
- Question library table.
- Question picker modal.

### Grep Gates

Suggested copy gates:

```bash
rg -n "All subjects|Subject" frontend/src/app frontend/src/components
```

Allowed only if referring to unrelated prose or backward-compatible import documentation that explicitly says `SUBJECT:` is legacy.

Suggested course-code clutter gate:

```bash
rg -n "course_code" frontend/src/components/sessions frontend/src/components/student frontend/src/app/grading frontend/src/app/analytics
```

Each hit must be either a tooltip, a native select option, data plumbing, or a consciously muted secondary label.

---

## Out of Scope

- Removing course codes from the database. They remain useful identifiers.
- Multi-course questions. Start with one owning course per learning object. Revisit many-to-many only if real reuse across courses becomes common.
- Full seed localization into Dutch programme names. Use clear English course titles for now.
- A full curriculum editor. This epoch seeds a curriculum; it does not build a curriculum management product.
