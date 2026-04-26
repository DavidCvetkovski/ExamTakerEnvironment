# Epoch 6 Blueprint — Automated Grading, Manual Review & Result Registration

> **Branch:** `feature/epoch-6-grading`
> **Prerequisites:** Epochs 1–5.5 complete and merged to `main`.
> **Reference:** `directives/epoch_roadmap.md` §6, `claude.md` for engineering principles.

---

## Overview

**Goal:** Build the complete grading pipeline for OpenVision. When a student submits an exam, objective questions (MCQ, Multiple Response) are auto-graded instantly. Open/essay questions are queued for manual grading by staff. Once all grading is complete, results are aggregated, held behind a publication gate, and exportable to CSV for Osiris (VU Amsterdam's SIS).

**What exists today:**
- `ExamSession` with `SUBMITTED` status and frozen `items` snapshot (JSONB).
- `InteractionEvent` log with every `ANSWER_CHANGE` event (payload contains selected options or essay text).
- `interactions_service.py` with `get_latest_answers()` that reconstructs the student's final answer state per question.
- Full heartbeat/submission pipeline — answers are already persisted and recoverable.
- Session immutability after submission — no further modifications via API.

**What this Epoch delivers:**
1. **Auto-grading engine** that scores MCQ/Multiple Response immediately on submission.
2. **Grade storage** with per-question scores, feedback, and rubric metadata.
3. **Manual grading dashboard** for essay/open questions with rubric support.
4. **Blind grading mode** where student identity is hidden.
5. **Results overview** with aggregated scores, pass/fail, and grade boundaries.
6. **Grade publication workflow** — results invisible to students until explicitly published.
7. **CSV export** in Osiris-compatible format.
8. **Per-student result report** showing detailed question-by-question breakdown.

---

## Architecture Decisions

### 1. Scoring Model Design

We introduce two new tables:
- `question_grades` — stores per-question scores for each exam session.
- `session_results` — stores aggregated session-level results (total score, percentage, pass/fail, grade).

**Why two tables?** Separation of concerns: `question_grades` are written during grading (auto or manual), while `session_results` are computed/aggregated after all questions are graded. This supports partial manual grading — staff can grade essay questions one at a time, and the system recalculates the aggregate whenever updated.

### 2. Auto-Grading Trigger

Auto-grading happens **synchronously** during the submission flow. When `submit_exam_session()` succeeds:
1. The service iterates through all frozen items.
2. For each MCQ/Multiple Response question, it compares the student's latest answer against the correct answer stored in the item snapshot.
3. `question_grades` rows are inserted in bulk.
4. If **all** questions in the session are auto-gradable (no essays), the `session_results` aggregate is computed immediately.

If the session contains essay questions, `session_results.grading_status` is set to `PARTIALLY_GRADED` until manual grading completes.

### 3. Answer Key Source

The correct answers come from the **frozen item snapshot** in `exam_sessions.items` JSONB. Each snapshot entry already contains `options` which for MCQ includes `is_correct` flags. This means we never need to query the live item bank during grading — the key is co-located with the student's attempt, ensuring immutability.

### 4. Scoring Strategies

| Question Type | Strategy | Configuration |
|---|---|---|
| MCQ (single) | Binary: 1 point if correct, 0 otherwise | Default |
| Multiple Response (all-or-nothing) | 1 point only if ALL correct options selected and NO incorrect | Configurable per test |
| Multiple Response (partial credit) | +1 per correct option, −1 per incorrect (min 0) | Configurable per test |
| Essay | Manual rubric-based scoring (0–N points) | Set per question |
| Negative marking | Optional −0.25/−0.33 per incorrect MCQ | Configurable per test |

### 5. Security Model

- **Students** can only view their own grades, and only after publication.
- **Constructors/Admins** can grade, view all grades, and manage publication.
- **Blind grading** strips student identity from the grading UI.
- **Grade immutability** — once results are published, grades can only be modified with an audit trail.
- **Rate limiting** on export endpoints to prevent abuse.

---

## Database Schema Changes

### New Enum: `gradingstatus`

```sql
CREATE TYPE gradingstatus AS ENUM ('UNGRADED', 'AUTO_GRADED', 'PARTIALLY_GRADED', 'FULLY_GRADED');
```

### New Enum: `scoringstrategy`

```sql
CREATE TYPE scoringstrategy AS ENUM ('ALL_OR_NOTHING', 'PARTIAL_CREDIT');
```

### New Table: `question_grades`

```sql
CREATE TABLE question_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exam_sessions(id),
    learning_object_id UUID NOT NULL,
    item_version_id UUID NOT NULL,
    
    -- Scoring
    points_awarded FLOAT NOT NULL DEFAULT 0,
    points_possible FLOAT NOT NULL DEFAULT 1,
    is_correct BOOLEAN,                  -- NULL for essay (pending), true/false for MCQ
    
    -- Auto vs Manual
    graded_by UUID REFERENCES users(id), -- NULL = auto-graded
    is_auto_graded BOOLEAN NOT NULL DEFAULT true,
    
    -- Feedback
    feedback TEXT,                        -- Manual grader's comment
    rubric_data JSONB,                   -- Structured rubric scores
    
    -- Student's final answer (denormalized for grading convenience)
    student_answer JSONB NOT NULL,
    correct_answer JSONB,                -- NULL for essays
    
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP,
    
    UNIQUE(session_id, learning_object_id)
);

CREATE INDEX idx_question_grades_session ON question_grades(session_id);
CREATE INDEX idx_question_grades_grader ON question_grades(graded_by);
```

### New Table: `session_results`

```sql
CREATE TABLE session_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES exam_sessions(id),
    test_definition_id UUID NOT NULL REFERENCES test_definitions(id),
    student_id UUID NOT NULL REFERENCES users(id),
    
    -- Aggregates
    total_points FLOAT NOT NULL DEFAULT 0,
    max_points FLOAT NOT NULL DEFAULT 0,
    percentage FLOAT NOT NULL DEFAULT 0,       -- (total_points / max_points) * 100
    
    -- Grading state
    grading_status gradingstatus NOT NULL DEFAULT 'UNGRADED',
    questions_graded INT NOT NULL DEFAULT 0,
    questions_total INT NOT NULL DEFAULT 0,
    
    -- Grade boundary result
    letter_grade VARCHAR,                       -- e.g. "Pass", "Fail", "A", "B" etc.
    passed BOOLEAN,
    
    -- Publication
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP,
    published_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_session_results_student ON session_results(student_id);
CREATE INDEX idx_session_results_test ON session_results(test_definition_id);
CREATE INDEX idx_session_results_published ON session_results(is_published);
```

### Modified Table: `test_definitions`

Add grading configuration columns:

```sql
ALTER TABLE test_definitions ADD COLUMN scoring_config JSONB DEFAULT '{}';
-- scoring_config shape:
-- {
--   "pass_percentage": 55,
--   "negative_marking": false,
--   "negative_marking_penalty": 0.25,
--   "multiple_response_strategy": "PARTIAL_CREDIT",  -- or "ALL_OR_NOTHING"
--   "grade_boundaries": [
--     {"min_percentage": 85, "grade": "A"},
--     {"min_percentage": 70, "grade": "B"},
--     {"min_percentage": 55, "grade": "C"},
--     {"min_percentage": 0, "grade": "F"}
--   ],
--   "essay_points": {
--     "<learning_object_id>": 10  -- max points per essay question
--   }
-- }
```

---

## Stage-by-Stage Implementation

### Stage 1 — Schema & Migration

**Objective:** Add the new tables, enums, and columns to the database.

#### Tasks

1. **Add Prisma models** to `prisma/schema.prisma`:
   - `question_grades` model with all columns and relations.
   - `session_results` model with all columns and relations.
   - `gradingstatus` and `scoringstrategy` enums.
   - Add `scoring_config` field to `test_definitions`.

2. **Add SQLAlchemy models:**
   - `backend/app/models/question_grade.py` — `QuestionGrade` class.
   - `backend/app/models/session_result.py` — `SessionResult` class with `GradingStatus` enum.
   - Update `backend/app/models/__init__.py` to export new models.

3. **Run Alembic migration:**
   ```bash
   cd backend && alembic revision --autogenerate -m "add grading tables and scoring config"
   alembic upgrade head
   ```

4. **Generate Prisma client:**
   ```bash
   npx prisma db pull && npx prisma generate
   ```

#### Exit Criteria
- `alembic upgrade head` runs without error.
- `SELECT * FROM question_grades LIMIT 1` executes (empty, no error).
- `SELECT * FROM session_results LIMIT 1` executes (empty, no error).
- Existing exam sessions and items are unaffected.
- New models are exported and importable.

**Commit:** `feat(database): add question_grades, session_results tables and scoring config`

---

### Stage 2 — Auto-Grading Engine

**Objective:** Build the backend service that automatically grades MCQ and Multiple Response questions on submission.

#### New File: `backend/app/services/grading_service.py`

```python
"""
Core grading logic. Auto-grades objective questions and manages
session result aggregation.
"""

async def auto_grade_session(session_id: UUID) -> Dict[str, Any]:
    """
    Called after successful exam submission.
    1. Fetch the session with frozen items.
    2. Fetch the latest answer state from interaction_events.
    3. For each MCQ/MR question, compare answer to correct answer in snapshot.
    4. Bulk-insert question_grades rows.
    5. Create or update session_results aggregate.
    Returns: { "graded": int, "pending_manual": int, "total_points": float }
    """

async def grade_mcq_single(
    student_answer: dict,
    correct_options: list,
    negative_marking: bool = False,
    penalty: float = 0.25
) -> Tuple[float, bool]:
    """
    Score a single-answer MCQ.
    Returns (points_awarded, is_correct).
    """

async def grade_multiple_response(
    student_answer: dict,
    correct_options: list,
    strategy: str = "PARTIAL_CREDIT",
    negative_marking: bool = False,
    penalty: float = 0.25
) -> Tuple[float, bool]:
    """
    Score a multi-select question.
    ALL_OR_NOTHING: 1 if all correct selected and no incorrect, else 0.
    PARTIAL_CREDIT: +1 per correct, -1 per incorrect, min 0, normalized.
    """

async def compute_session_aggregate(session_id: UUID) -> Dict[str, Any]:
    """
    Recalculate session_results from question_grades.
    Called after auto-grading and after each manual grade save.
    Applies grade boundaries from test_definition.scoring_config.
    """

def apply_grade_boundaries(
    percentage: float,
    boundaries: list
) -> Tuple[str, bool]:
    """
    Map a percentage to a letter grade and pass/fail.
    boundaries = [{"min_percentage": 55, "grade": "Pass"}, ...]
    """
```

#### Modified File: `backend/app/services/exam_sessions_service.py`

Update `submit_exam_session()` (currently in `interactions_service.py`) to trigger auto-grading after setting status to `SUBMITTED`:

```python
async def submit_exam_session(session_id: UUID, current_user) -> dict:
    # ... existing submission logic ...
    # After successful status transition:
    from app.services.grading_service import auto_grade_session
    grading_result = await auto_grade_session(session_id)
    # Include grading_result in response
```

#### New Pydantic Schemas: `backend/app/schemas/grading.py`

```python
class QuestionGradeResponse(BaseModel):
    id: UUID
    session_id: UUID
    learning_object_id: UUID
    item_version_id: UUID
    points_awarded: float
    points_possible: float
    is_correct: Optional[bool]
    is_auto_graded: bool
    feedback: Optional[str]
    student_answer: dict
    correct_answer: Optional[dict]
    created_at: datetime
    updated_at: Optional[datetime]

class SessionResultResponse(BaseModel):
    id: UUID
    session_id: UUID
    test_definition_id: UUID
    student_id: UUID
    total_points: float
    max_points: float
    percentage: float
    grading_status: str
    questions_graded: int
    questions_total: int
    letter_grade: Optional[str]
    passed: Optional[bool]
    is_published: bool
    published_at: Optional[datetime]

class ManualGradeSubmit(BaseModel):
    points_awarded: float
    feedback: Optional[str] = None
    rubric_data: Optional[dict] = None

    @validator("points_awarded")
    def validate_points(cls, v):
        if v < 0:
            raise ValueError("Points cannot be negative")
        return v

class ScoringConfigUpdate(BaseModel):
    pass_percentage: float = 55.0
    negative_marking: bool = False
    negative_marking_penalty: float = 0.25
    multiple_response_strategy: str = "PARTIAL_CREDIT"
    grade_boundaries: Optional[list] = None
    essay_points: Optional[dict] = None
```

#### Exit Criteria
- Submitting a fully-MCQ exam auto-generates `question_grades` rows with correct scoring.
- `session_results` is created with correct aggregate.
- Negative marking produces correct point deductions when enabled.
- Partial credit for multiple response is calculated correctly.
- Sessions with essay questions get `PARTIALLY_GRADED` status.

**Commit:** `feat(grading): implement auto-grading engine for MCQ and multiple response`

---

### Stage 3 — Grading API Endpoints

**Objective:** Expose the grading data and manual grading actions through the REST API.

#### New File: `backend/app/api/endpoints/grading.py`

```python
# --- Instructor/Admin Endpoints ---

@router.get("/sessions/{session_id}/grades")
async def get_session_grades(session_id: UUID, current_user = Depends(get_current_user)):
    """
    Fetch all question grades for a session.
    Requires ADMIN or CONSTRUCTOR role.
    Returns list of QuestionGradeResponse.
    """

@router.get("/sessions/{session_id}/result")
async def get_session_result(session_id: UUID, current_user = Depends(get_current_user)):
    """
    Fetch the aggregated session result.
    ADMIN/CONSTRUCTOR: always visible.
    STUDENT: only if is_published = true.
    """

@router.patch("/grades/{grade_id}")
async def update_manual_grade(
    grade_id: UUID,
    payload: ManualGradeSubmit,
    current_user = Depends(get_current_user)
):
    """
    Submit/update a manual grade for an essay question.
    Requires ADMIN or CONSTRUCTOR role.
    After saving, recalculates session aggregate.
    """

# --- Grading Dashboard Endpoints ---

@router.get("/tests/{test_definition_id}/grading-overview")
async def get_grading_overview(
    test_definition_id: UUID,
    current_user = Depends(get_current_user)
):
    """
    List all submitted sessions for a test with grading progress.
    Returns: [{ session_id, student_name (if not blind), grading_status,
                questions_graded, questions_total, total_points }]
    Requires ADMIN or CONSTRUCTOR role.
    """

@router.get("/tests/{test_definition_id}/grading-queue")
async def get_grading_queue(
    test_definition_id: UUID,
    question_index: Optional[int] = None,
    current_user = Depends(get_current_user)
):
    """
    Get ungraded essay questions across all sessions for a test.
    If question_index is provided, returns all student answers for that
    specific question (for "grade by question" workflow).
    Supports blind mode: student_id is replaced with anonymous ID.
    Requires ADMIN or CONSTRUCTOR role.
    """

# --- Publication ---

@router.post("/tests/{test_definition_id}/publish-results")
async def publish_results(
    test_definition_id: UUID,
    current_user = Depends(get_current_user)
):
    """
    Mark all session_results for this test as published.
    Only ADMIN can publish. Sets is_published=true, published_at, published_by.
    Only publishes FULLY_GRADED sessions (rejects if any are PARTIALLY_GRADED).
    """

@router.post("/tests/{test_definition_id}/unpublish-results")
async def unpublish_results(
    test_definition_id: UUID,
    current_user = Depends(get_current_user)
):
    """
    Retract published results (e.g., for grade corrections).
    Only ADMIN.
    """

# --- Results Export ---

@router.get("/tests/{test_definition_id}/export")
async def export_results_csv(
    test_definition_id: UUID,
    current_user = Depends(get_current_user)
):
    """
    Generate CSV of results for download.
    Columns: student_email, vunet_id, total_points, max_points,
             percentage, letter_grade, passed
    Requires ADMIN role.
    Returns StreamingResponse with CSV content.
    """

# --- Student Endpoint ---

@router.get("/my-results")
async def get_my_results(current_user = Depends(get_current_user)):
    """
    Student-facing: returns published results for the current user.
    Only returns session_results where is_published = true.
    """

@router.get("/my-results/{session_id}")
async def get_my_result_detail(
    session_id: UUID,
    current_user = Depends(get_current_user)
):
    """
    Student-facing: detailed question-by-question breakdown.
    Only available if is_published = true.
    Shows: question content, student answer, correct answer,
           points awarded, feedback.
    """
```

#### Modified File: `backend/app/api/api.py`

Mount the grading router:
```python
from app.api.endpoints import grading
app.include_router(grading.router, prefix="/api/grading", tags=["grading"])
```

#### Security Matrix

| Endpoint | ADMIN | CONSTRUCTOR | REVIEWER | STUDENT |
|---|---|---|---|---|
| `GET /sessions/{id}/grades` | ✅ | ✅ | ❌ | ❌ |
| `GET /sessions/{id}/result` | ✅ | ✅ | ❌ | ✅ (if published) |
| `PATCH /grades/{id}` | ✅ | ✅ | ❌ | ❌ |
| `GET /tests/{id}/grading-overview` | ✅ | ✅ | ❌ | ❌ |
| `GET /tests/{id}/grading-queue` | ✅ | ✅ | ❌ | ❌ |
| `POST /tests/{id}/publish-results` | ✅ | ❌ | ❌ | ❌ |
| `POST /tests/{id}/unpublish-results` | ✅ | ❌ | ❌ | ❌ |
| `GET /tests/{id}/export` | ✅ | ❌ | ❌ | ❌ |
| `GET /my-results` | ❌ | ❌ | ❌ | ✅ |
| `GET /my-results/{session_id}` | ❌ | ❌ | ❌ | ✅ |

#### Exit Criteria
- `GET /sessions/{id}/grades` returns question-level grades after submission.
- `PATCH /grades/{id}` updates manual grades and recalculates aggregate.
- `GET /tests/{id}/grading-overview` lists all sessions with progress.
- Students get `403` from grading endpoints.
- Students get `403` from unpublished results.
- CSV export produces valid, downloadable file.

**Commit:** `feat(api): add grading, results, and export endpoints with RBAC`

---

### Stage 4 — Grading Service Layer

**Objective:** Implement the full business logic for manual grading, aggregation, grade boundaries, and CSV export.

#### New File: `backend/app/services/results_service.py`

```python
"""
Manages session results, grade publication, and CSV export.
"""

async def get_grading_overview(test_definition_id: UUID, blind: bool = False) -> list:
    """
    Query all submitted exam_sessions for a test_definition.
    Join with session_results for grading progress.
    If blind=True, replace student info with anonymized IDs.
    Returns sorted list by student name (or anonymous ID).
    """

async def get_grading_queue(
    test_definition_id: UUID,
    question_index: Optional[int] = None
) -> list:
    """
    Fetch ungraded essay questions across all sessions.
    For each ungraded question_grade, return:
    - anonymous student ID (for blind mode)
    - question content from frozen snapshot
    - student's essay text from student_answer
    - rubric template from scoring_config.essay_points
    """

async def submit_manual_grade(
    grade_id: UUID,
    grader_id: UUID,
    points_awarded: float,
    feedback: Optional[str],
    rubric_data: Optional[dict]
) -> dict:
    """
    Update a question_grade with manual scoring.
    1. Validate points_awarded <= points_possible.
    2. Set graded_by, is_auto_graded=false, feedback, rubric_data.
    3. Recalculate session aggregate via compute_session_aggregate().
    4. If all questions now graded, set grading_status = FULLY_GRADED.
    """

async def publish_results(test_definition_id: UUID, publisher_id: UUID) -> dict:
    """
    1. Query all session_results for this test.
    2. If any are not FULLY_GRADED, raise 409.
    3. Set is_published=true, published_at=now(), published_by=publisher_id.
    4. Return count of published results.
    """

async def unpublish_results(test_definition_id: UUID) -> dict:
    """
    Set is_published=false for all results under this test.
    """

async def export_results_csv(test_definition_id: UUID) -> str:
    """
    Generate CSV content with columns:
    student_email, vunet_id, total_points, max_points, percentage, letter_grade, passed
    Uses Python csv.writer with StringIO.
    Only includes FULLY_GRADED + published sessions.
    """

async def get_student_result_detail(session_id: UUID, student_id: UUID) -> dict:
    """
    Build a detailed result view for a student:
    - Session info (test title, submitted_at)
    - Overall: total_points, max_points, percentage, letter_grade, passed
    - Per-question: question text, student answer, correct answer, points, feedback
    Only returns if session_result.is_published = true.
    """
```

#### Exit Criteria
- Manual grade submission updates the grade and recalculates session aggregate.
- Publication blocks if grading is incomplete.
- CSV export produces correct format with all required columns.
- Student detail view includes per-question breakdown.

**Commit:** `feat(grading): implement results service, publication workflow, and CSV export`

---

### Stage 5 — Scoring Configuration UI (Blueprint Extension)

**Objective:** Allow educators to configure grading settings when creating a blueprint.

#### Modified File: `frontend/src/stores/useBlueprintStore.ts`

Add `scoring_config` to the blueprint state:

```typescript
interface ScoringConfig {
    pass_percentage: number;             // default 55
    negative_marking: boolean;           // default false
    negative_marking_penalty: number;    // default 0.25
    multiple_response_strategy: 'ALL_OR_NOTHING' | 'PARTIAL_CREDIT';
    grade_boundaries: GradeBoundary[];
    essay_points: Record<string, number>; // learning_object_id -> max points
}

interface GradeBoundary {
    min_percentage: number;
    grade: string;
}
```

#### Modified File: `frontend/src/app/blueprint/page.tsx`

Add a "Grading Settings" collapsible panel to the blueprint editor:
- Pass percentage input (numeric, default 55%).
- Negative marking toggle with penalty input.
- Multiple response strategy dropdown.
- Grade boundaries table (editable rows: min %, grade label).
- Per-essay-question points assignment (auto-detected from blueprint items).

#### Exit Criteria
- Saving a blueprint persists `scoring_config` to the backend.
- Default scoring config is applied if not configured.
- Essay questions detected in blueprint show points input.

**Commit:** `feat(frontend): add scoring configuration to blueprint editor`

---

### Stage 6 — Grading Dashboard UI

**Objective:** Build the instructor-facing grading interface.

#### New File: `frontend/src/app/grading/page.tsx`

Main grading dashboard page:
- Select a test definition from a dropdown/list.
- Show grading overview table with columns:
  - Student (or anonymous ID in blind mode)
  - Status badge (AUTO_GRADED, PARTIALLY_GRADED, FULLY_GRADED)
  - Questions graded / total
  - Total points
  - Percentage
  - Action: "Grade" button (for essay grading)

#### New File: `frontend/src/app/grading/[sessionId]/page.tsx`

Per-session grading view:
- Student header (name + email, hidden in blind mode).
- For each question in the exam:
  - Question content (rendered from TipTap JSON).
  - Student's answer (displayed read-only).
  - For MCQ/MR: auto-graded result with checkmark/cross.
  - For essay: textarea for feedback, points slider/input, rubric if configured.
  - "Save Grade" button per question (auto-saves to backend).
  - Visual indicator: graded ✅ / ungraded ⬜.
- Session-level info: total points, percentage (recalculated live).
- Navigation: Previous/Next session (for batch grading).

#### New File: `frontend/src/stores/useGradingStore.ts`

```typescript
interface GradingState {
    // Overview
    selectedTestId: string | null;
    gradingOverview: SessionGradingSummary[];
    
    // Per-session grading
    currentSession: GradingSession | null;
    questionGrades: QuestionGrade[];
    
    // Blind mode
    blindMode: boolean;
    
    // Publication
    publishStatus: 'idle' | 'publishing' | 'published' | 'error';
    
    // Actions
    fetchGradingOverview: (testId: string) => Promise<void>;
    fetchSessionGrades: (sessionId: string) => Promise<void>;
    submitManualGrade: (gradeId: string, payload: ManualGradeSubmit) => Promise<void>;
    publishResults: (testId: string) => Promise<void>;
    unpublishResults: (testId: string) => Promise<void>;
    exportCsv: (testId: string) => Promise<void>;
    toggleBlindMode: () => void;
}
```

#### New File: `frontend/src/components/grading/GradingOverviewTable.tsx`

Sortable, filterable table showing all sessions for a test:
- Sort by: student name, percentage, grading status.
- Filter by: grading status.
- Batch action: "Give full marks to all" for a specific question.

#### New File: `frontend/src/components/grading/EssayGradingPanel.tsx`

Panel for grading a single essay:
- Student's essay text (read-only, scrollable).
- Model answer display (if configured).
- Points input (bounded: 0 to max points).
- Feedback textarea.
- Rubric checklist (if configured).
- Auto-save on change (debounced 1.5s).

#### New File: `frontend/src/components/grading/GradingSummaryBar.tsx`

Floating bar at the top of the grading view showing:
- Total sessions graded / total.
- Progress bar.
- "Publish Results" button (disabled until all FULLY_GRADED).
- "Export CSV" button.
- Blind mode toggle.

#### Modified File: `frontend/src/components/layout/GlobalHeader.tsx`

Add "Grading" nav link for ADMIN and CONSTRUCTOR roles.

#### Exit Criteria
- Grading dashboard loads and lists all submitted sessions for a test.
- Clicking a session opens the per-question grading view.
- Saving a manual grade updates the overview in real-time.
- Blind mode hides student identity throughout the UI.

**Commit:** `feat(frontend): implement grading dashboard and manual grading UI`

---

### Stage 7 — Results & Publication UI

**Objective:** Build the results overview for instructors and the student results view.

#### New File: `frontend/src/app/results/page.tsx`

Instructor results dashboard:
- Test selector.
- Results table: student, total points, percentage, grade, pass/fail.
- Sort and filter controls.
- Publication status indicator.
- "Publish Results" / "Unpublish" button.
- "Export CSV" download button.
- Summary statistics: mean, median, pass rate, standard deviation.

#### Modified File: `frontend/src/app/my-exams/page.tsx`

Add "My Results" section below the exam list:
- Shows published results for completed exams.
- Each result card: test title, date, total points, percentage, grade.
- "View Details" link to result detail page.

#### New File: `frontend/src/app/my-results/[sessionId]/page.tsx`

Student result detail page:
- Test title and submission timestamp.
- Overall result: total points, percentage, grade, pass/fail badge.
- Per-question breakdown:
  - Question text.
  - Student's answer (highlighted green/red for MCQ).
  - Correct answer.
  - Points awarded / possible.
  - Grader feedback (if any).

#### New File: `frontend/src/stores/useResultsStore.ts`

```typescript
interface ResultsState {
    // Student results
    myResults: StudentResult[];
    currentResultDetail: ResultDetail | null;
    
    // Actions
    fetchMyResults: () => Promise<void>;
    fetchResultDetail: (sessionId: string) => Promise<void>;
}
```

#### Exit Criteria
- Students see published results on their "My Exams" page.
- Students can view per-question breakdown with feedback.
- Instructors see aggregated results with sort, filter, and publication controls.
- CSV export downloads a valid file.

**Commit:** `feat(frontend): implement results dashboard and student result views`

---

### Stage 8 — Backend Tests

**Objective:** Comprehensive test coverage for the grading pipeline.

#### New File: `backend/tests/test_grading.py`

```python
"""
Tests for the auto-grading engine.
"""
class TestAutoGrading:
    async def test_mcq_single_correct(self):
        """Submit exam with correct MCQ answer → 1 point."""
    
    async def test_mcq_single_incorrect(self):
        """Submit exam with wrong MCQ answer → 0 points."""
    
    async def test_mcq_negative_marking(self):
        """Submit wrong MCQ with negative marking → -0.25 penalty."""
    
    async def test_multiple_response_all_or_nothing(self):
        """Select all correct options → full marks. Miss one → 0."""
    
    async def test_multiple_response_partial_credit(self):
        """Select some correct, some incorrect → proportional score."""
    
    async def test_mixed_exam_partial_grading(self):
        """Exam with MCQ + essay → PARTIALLY_GRADED after submission."""
    
    async def test_all_mcq_exam_fully_graded(self):
        """Exam with only MCQ → FULLY_GRADED immediately."""
    
    async def test_session_aggregate_calculation(self):
        """Verify total_points, max_points, percentage are correct."""
    
    async def test_grade_boundaries(self):
        """55% → Pass, 54% → Fail with standard boundaries."""
```

#### New File: `backend/tests/test_manual_grading.py`

```python
"""
Tests for manual grading workflow.
"""
class TestManualGrading:
    async def test_grade_essay_question(self):
        """Submit manual grade → question_grade updated, aggregate recalculated."""
    
    async def test_grade_exceeds_max_points(self):
        """points_awarded > points_possible → 400 Bad Request."""
    
    async def test_unauthorized_student_grading(self):
        """Student attempts to grade → 403."""
    
    async def test_grading_unsubmitted_session(self):
        """Attempt to grade a STARTED session → 400."""
    
    async def test_full_grading_to_published(self):
        """Grade all essays → FULLY_GRADED → publish → students can see."""
```

#### New File: `backend/tests/test_results.py`

```python
"""
Tests for results publication and export.
"""
class TestResults:
    async def test_publish_all_graded(self):
        """Publish FULLY_GRADED → is_published=true."""
    
    async def test_publish_blocks_partial(self):
        """Publish PARTIALLY_GRADED → 409 Conflict."""
    
    async def test_unpublish_results(self):
        """Unpublish → is_published=false."""
    
    async def test_student_sees_published_only(self):
        """GET /my-results returns only published results."""
    
    async def test_student_hidden_unpublished(self):
        """GET /my-results/{id} on unpublished → 403."""
    
    async def test_csv_export_format(self):
        """Verify CSV has correct headers and data."""
    
    async def test_csv_export_admin_only(self):
        """Non-admin → 403 on export."""
    
    async def test_student_result_detail(self):
        """GET /my-results/{id} returns full question breakdown."""
```

#### Exit Criteria
- `pytest backend/tests/test_grading.py` — all passing.
- `pytest backend/tests/test_manual_grading.py` — all passing.
- `pytest backend/tests/test_results.py` — all passing.

**Commit:** `test(grading): comprehensive test suite for auto-grading, manual grading, and results`

---

### Stage 9 — Frontend E2E Tests

**Objective:** End-to-end tests covering the full grading flow.

#### New File: `frontend/tests/e2e/grading-flow.spec.ts`

1. **Auto-grading flow:** Login as student → take MCQ-only exam → submit → verify grades appear for instructor.
2. **Manual grading flow:** Login as constructor → open grading dashboard → grade essay → verify aggregate updates.
3. **Publication flow:** Grade all questions → publish results → login as student → verify results visible.
4. **Blind mode:** Enable blind mode → verify student names are hidden in grading view.
5. **CSV export:** Click export → verify file downloads with correct headers.
6. **Student result detail:** After publication → student views per-question breakdown.

#### Exit Criteria
- All E2E tests pass.

**Commit:** `test(e2e): add grading, publication, and results E2E tests`

---

### Stage 10 — Seed Data & QA Hardening

**Objective:** Update seed data and perform final integration validation.

#### Modified File: `backend/seed.py`

Add grading-related seed data:
- Create a test definition with `scoring_config`.
- Create a submitted exam session with answers.
- Trigger auto-grading on seeded session.
- Create example manual grades for essay questions.
- Create published and unpublished session results.

#### QA Checklist

| Test Case | Expected Result |
|---|---|
| Submit MCQ exam | Auto-graded within 1 second, question_grades created |
| Submit mixed MCQ+essay exam | MCQ auto-graded, essays UNGRADED, session PARTIALLY_GRADED |
| Grade all essays manually | Session becomes FULLY_GRADED |
| Publish results (all graded) | is_published=true, students can see |
| Publish results (incomplete) | 409 Conflict, blocked |
| Student views unpublished results | 403 Forbidden |
| Student views published results | Full detail with per-question breakdown |
| CSV export | Downloads with correct VUnetID, email, scores |
| Negative marking enabled | Incorrect MCQ deducts configured penalty |
| Blind mode grading | Student identity hidden, only anonymous IDs shown |
| Grade boundary mapping | 55% → Pass, 54.9% → Fail (default config) |

**Commit:** `chore(seed): add grading and results seed data, QA hardening`

---

## File Manifest

### New Files

| File | Purpose |
|------|---------|
| `backend/app/models/question_grade.py` | QuestionGrade SQLAlchemy model |
| `backend/app/models/session_result.py` | SessionResult SQLAlchemy model + GradingStatus enum |
| `backend/app/schemas/grading.py` | Pydantic DTOs for grades, results, manual grading |
| `backend/app/services/grading_service.py` | Auto-grading engine + aggregation logic |
| `backend/app/services/results_service.py` | Publication, export, student result detail |
| `backend/app/api/endpoints/grading.py` | All grading/results API routes |
| `backend/tests/test_grading.py` | Auto-grading unit/integration tests |
| `backend/tests/test_manual_grading.py` | Manual grading tests |
| `backend/tests/test_results.py` | Results publication and export tests |
| `frontend/src/app/grading/page.tsx` | Grading dashboard page |
| `frontend/src/app/grading/[sessionId]/page.tsx` | Per-session grading view |
| `frontend/src/app/results/page.tsx` | Results overview page |
| `frontend/src/app/my-results/[sessionId]/page.tsx` | Student result detail page |
| `frontend/src/stores/useGradingStore.ts` | Grading state management |
| `frontend/src/stores/useResultsStore.ts` | Results state management |
| `frontend/src/components/grading/GradingOverviewTable.tsx` | Sortable grading table |
| `frontend/src/components/grading/EssayGradingPanel.tsx` | Essay grading component |
| `frontend/src/components/grading/GradingSummaryBar.tsx` | Grading progress + publish bar |
| `frontend/tests/e2e/grading-flow.spec.ts` | Full E2E grading tests |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add question_grades, session_results, enums, scoring_config |
| `backend/app/models/__init__.py` | Export QuestionGrade, SessionResult |
| `backend/app/api/api.py` | Mount grading router |
| `backend/app/services/exam_sessions_service.py` | Trigger auto-grading on submission |
| `backend/app/services/interactions_service.py` | Minor: export submit function cleanly |
| `frontend/src/stores/useBlueprintStore.ts` | Add scoring_config state |
| `frontend/src/app/blueprint/page.tsx` | Add grading settings panel |
| `frontend/src/app/my-exams/page.tsx` | Add "My Results" section |
| `frontend/src/components/layout/GlobalHeader.tsx` | Add "Grading" + "Results" nav |
| `frontend/src/lib/api.ts` | Add grading API helpers |
| `backend/seed.py` | Add grading seed data |

---

## Security Checklist (Epoch 6 Specific)

| Concern | Mitigation |
|---------|------------|
| Student views grades before publication | `is_published` check on every student-facing endpoint |
| Student modifies their own grades | No student-accessible write endpoints for grades |
| Instructor grades wrong session | Session ownership verified via test_definition association |
| Grade manipulation via API | Points validation: `points_awarded <= points_possible`, non-negative |
| CSV injection attack | Sanitize CSV cell values (prefix `=`, `+`, `-`, `@` with `'`) |
| Blind mode bypass | Student identity stripped server-side, not just hidden in frontend |
| Unauthorized publication | Only ADMIN can publish, enforced at middleware level |
| Concurrent grading conflicts | Last-write-wins with `updated_at` timestamps, atomic aggregate recalculation |
| XSS via grader feedback | DOMPurify on all rendered feedback text |

---

## Git Strategy for Epoch 6

1. Merge `feature/epoch-5-student-frontier` to `main` first.
2. Branch: `git checkout -b feature/epoch-6-grading` from `main`.
3. Commit per stage using Conventional Commits:
   - `feat(database): add question_grades, session_results tables and scoring config`
   - `feat(grading): implement auto-grading engine for MCQ and multiple response`
   - `feat(api): add grading, results, and export endpoints with RBAC`
   - `feat(grading): implement results service, publication workflow, and CSV export`
   - `feat(frontend): add scoring configuration to blueprint editor`
   - `feat(frontend): implement grading dashboard and manual grading UI`
   - `feat(frontend): implement results dashboard and student result views`
   - `test(grading): comprehensive test suite for auto-grading, manual grading, and results`
   - `test(e2e): add grading, publication, and results E2E tests`
   - `chore(seed): add grading and results seed data, QA hardening`
4. Run Aikido security scan before merge.
5. Merge to `main` once all tests pass and scan is clean.

---

## Assumptions and Defaults

- Auto-grading is synchronous (fast enough for typical exam sizes of 50–100 questions).
- Default pass percentage is 55% (VU Amsterdam standard).
- Default multiple response strategy is PARTIAL_CREDIT.
- Negative marking is disabled by default.
- Essay questions default to 10 points unless configured in `scoring_config.essay_points`.
- Grade boundaries default to VU Amsterdam's Pass/Fail at 55%.
- CSV export uses UTF-8 encoding with BOM for Excel compatibility.
- Blind mode is per-session (grader can toggle it on/off).
- Grade publication is all-or-nothing per test (cannot selectively publish some students).
