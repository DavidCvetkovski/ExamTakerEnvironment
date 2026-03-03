# Epoch 4: The Question Library & Blueprint Engine

## Engineering Blueprint

> **Prerequisite:** Epoch 3 complete. Authentication and Role-Based Access Control (RBAC) are fully functional.
>
> **Goal:** Transition the platform from a manual, "UUID-based" authoring workflow to a comprehensive **Question Library** and **Test Matrix**. Educators should be able to browse their item banks, create new questions with a single click, and assemble those items into version-controlled **Test Definitions** (Blueprints) and **Exam Sessions**.
>
> **Reference:** TestVision's "Item Bank" is the central repository. A user shouldn't need a "code" to find a question; they search, filter, and select. Epoch 4 bridges this gap.

---

## Design Philosophy

### Moving Beyond "Manual UUID Entry"
Currently, the Authoring Workbench requires a user to know and type a Learning Object UUID. In Epoch 4, we replace this with:
1. **The Question Library:** A searchable dashboard of all `LearningObjects` in an item bank.
2. **One-Click Creation:** A "Create New" button that automatically handles UUID generation and redirects to the editor.
3. **The Blueprint Engine:** Assembling these library items into a "Test" with randomized selection rules.

### The "Blueprint vs. Session" Paradigm
We separate the *definition* of an exam from its *instantiation*:
1. **`TestDefinition` (The Blueprint):** Created by a `CONSTRUCTOR`. Defines the rules for generating an exam. Which items to include? Include them fixed, or at random from a bank based on tags? How much time is allowed?
2. **`ExamSession` (The Instantiation):** Created for a specific `STUDENT`. When instantiated, the blueprint rules are executed, the items are selected, and the specific `ItemVersion` UUIDs are "frozen" into a `SessionItemSet`. The student answers *these exact versions*, even if a constructor updates the question later.

### Selection Rules Logic (JSONB)

Instead of complex relational tables for every possible rule (fixed item, random by topic, random by difficulty), we leverage PostgreSQL's `JSONB` to store the selection rules flexibly inside the `TestDefinition`. 
An educator can create "Blocks" of questions (e.g., "Part A", "Part B"), and each block has specific selection rules.

### Time Binding

Exams in higher education are strictly time-bound. We must implement server-side enforcement of start times, end times, and duration. A session state machine (`SCHEDULED` → `ACTIVE` → `SUBMITTED`) prevents students from accessing exams early or submitting them late.

---

## Current State Analysis

### What Exists (from Epoch 3)

| Component | Location | Current State | Needs Change? |
|-----------|----------|---------------|---------------|
| `User` model | `backend/app/models/user.py` | Fully functional auth & RBAC | ✅ No change needed |
| `ItemBank` & `LearningObject` | `backend/app/models/...` | Exists, but no listing UI | ✅ **Yes** — needs List API & UI |
| `ItemVersion` | `backend/app/models/...` | Immutable versions | ✅ No change needed |

### What We Need to Build (New Files & Models)

| File / Component | Purpose |
|------------------|---------|
| `backend/app/models/test_definition.py` | `TestDefinition` model (JSONB rules, configuration) |
| `backend/app/models/exam_session.py` | `ExamSession` and `SessionItemSet` models (The Freeze) |
| `backend/app/schemas/test_definition.py` | Pydantic DTOs for test blueprints and block rules |
| `backend/app/schemas/exam_session.py` | Pydantic DTOs for session lifecycle |
| `backend/app/api/endpoints/tests.py` | API for creating/managing blueprints |
| `backend/app/api/endpoints/sessions.py` | API for instantiating/starting/submitting sessions |
| `backend/tests/test_test_matrix.py` | Integration tests for rule validation & generation |
| `backend/tests/test_sessions.py` | Integration tests for the freeze and time enforcement |
| `frontend/src/app/blueprint/page.tsx` | UI for constructors to build test matrices |
| `frontend/src/stores/useBlueprintStore.ts` | State management for test rule building |

---

## Staged Development Plan

### Stage 0: The Question Library (Item Bank Dashboard)
**Goal:** Replace the manual UUID input with a searchable management dashboard.

#### Tasks
1. **List API (`GET /learning-objects`):**
   - Create an endpoint that returns a paginated list of all `LearningObjects`.
   - Include the `latest_version` metadata (title, status, version number) in the response.
   - Support filtering by `bank_id`, `status`, and `tags`.

2. **The Dashboard UI (`frontend/src/app/items/page.tsx`):**
   - A table showing all questions in the bank.
   - Columns: Title, Version, Status, Type (MCQ/Essay), Last Updated.
   - Search bar and status filters.
   - "Edit" button that navigates to `/author?lo_id={uuid}`.

3. **"Create New" Workflow:**
   - A button on the dashboard that calls `POST /learning-objects`.
   - The backend creates the LO and its initial DRAFT version.
   - The frontend redirects the user immediately into the editor for that new ID.

### Stage 1: The Blueprint (Test Definition)
**Goal:** Create the data structures, API, and UI for defining a Test Blueprint.

#### Tasks

1. **Create `backend/app/models/test_definition.py`:**
   ```python
   class TestDefinition(Base):
       __tablename__ = "test_definitions"
       
       id = Column(UUID, primary_key=True, default=uuid.uuid4)
       title = Column(String, nullable=False)
       created_by = Column(UUID, ForeignKey("users.id"))
       
       # List of dictionaries defining blocks and their selection rules
       # e.g., [{"title": "Math MCQ", "rules": [{"type": "RANDOM", "tags": ["algebra"], "count": 5}]}]
       blocks = Column(JSONB, nullable=False, default=list)
       
       # Configs
       duration_minutes = Column(Integer, nullable=False)
       shuffle_questions = Column(Boolean, default=False)
       
       created_at = Column(DateTime, default=datetime.utcnow)
   ```

2. **Create `backend/app/schemas/test_definition.py`:**
   - Define exact Pydantic types for `RuleType` (FIXED, RANDOM).
   - Validation ensuring `RANDOM` rules have a `count` and filter criteria (like `metadata_tags`).

3. **Create `backend/app/api/endpoints/tests.py`:**
   ```text
   POST /tests        → Create blueprint (requires CONSTRUCTOR/ADMIN)
   GET  /tests/{id}   → Fetch blueprint
   PUT  /tests/{id}   → Update blueprint
   POST /tests/{id}/validate → Dry-run the rules against the DB to ensure enough items exist in the item bank to satisfy the rules.
   ```

4. **Frontend Implementation:**
   - Create `useBlueprintStore.ts` to manage the complex nested state of Blocks and Rules.
   - Build `/blueprint` UI where a constructor can add a block, drag rules into it, and select specific items or specify tag-based random selection.

### Stage 2: The Freeze (Session Instantiation)

**Goal:** Execute the blueprint's rules for a specific student, selecting valid `ItemVersions` and locking them into an `ExamSession`.

#### Tasks

1. **Create `backend/app/models/exam_session.py`:**
   ```python
   class SessionStatus(str, enum.Enum):
       SCHEDULED = "SCHEDULED"
       ACTIVE = "ACTIVE"
       SUBMITTED = "SUBMITTED"

   class ExamSession(Base):
       __tablename__ = "exam_sessions"
       
       id = Column(UUID, primary_key=True, default=uuid.uuid4)
       test_definition_id = Column(UUID, ForeignKey("test_definitions.id"))
       student_id = Column(UUID, ForeignKey("users.id"))
       
       status = Column(Enum(SessionStatus), default=SessionStatus.SCHEDULED)
       
       # Time bounds
       start_time = Column(DateTime, nullable=True) # When the student clicked 'Start'
       time_limit_minutes = Column(Integer, nullable=False) # Copied from definition + provisions
       
       # The frozen payload of generated items
       # E.g., [{"block_idx": 0, "item_versions": ["uuid1", "uuid2"]}, ...]
       frozen_item_sets = Column(JSONB, nullable=False)
   ```

2. **The Generation Logic (`backend/app/services/generation.py`):**
   - Given a `TestDefinition`, iterate through its `blocks`.
   - For `FIXED` rules: fetch the *latest APPROVED version* of the specified `LearningObject`.
   - For `RANDOM` rules: query the DB for all *APPROVED versions* matching the tags/criteria, shuffle them, and pick `count`.
   - Take the resulting `ItemVersion` UUIDs, optionally shuffle the final list, and save them to `frozen_item_sets`.

3. **Create `/sessions` API endpoints:**
   ```text
   POST /sessions/generate → Generates sessions for a list of student_ids (ADMIN only)
   POST /sessions/{id}/start → Transitions from SCHEDULED to ACTIVE, sets start_time (STUDENT)
   GET  /sessions/me → Returns my active/scheduled sessions (STUDENT)
   ```

### Stage 3: Time Blocks & Accommodations

**Goal:** Enforce time limits and extra-time provisions for students.

#### Tasks

1. **Accommodations Logic:**
   - Update `User` model with `provision_time_multiplier` (default = 1.0).
   - When generating an `ExamSession`, calculate `time_limit_minutes = definition.duration_minutes * user.provision_time_multiplier`.

2. **Time Enforcement Middleware / Checks:**
   - Create a dependency `verify_session_active(session: ExamSession = Depends(get_session))`
   - Check if `utcnow() > session.start_time + time_limit_minutes`. 
   - If time expired, automatically transition status to `SUBMITTED` and return `403 Time Expired`.

### Stage 4: Integration Tests & UI Polish

**Goal:** Ensure the rule engine and freeze mechanics are bulletproof.

#### Tasks

1. **Write `backend/tests/test_test_matrix.py`:**
   - Test validation logic throws 400 if a rule asks for 10 items but only 5 match the tags.
   - Test generating 5 sessions results in 5 unique Item sets (for random rules).

2. **Write `backend/tests/test_sessions.py`:**
   - Test that starting a session sets exactly the right time limits based on user provisions.
   - Test that updating the `ItemBank` (creating a new version of a question) *does not* change the items in an already-generated `ExamSession`.

3. **UI Delivery:**
   - Complete the Student Dashboard (`/dashboard`) showing SCHEDULED tests.
   - Add a "Start Exam" button that calls the backend and redirects into the (placeholder) exam UI for Epoch 5.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Under-provisioned Item Bank (asking for 10 random questions when only 5 exist) | High | Implement `/validate` endpoint; refuse to instantiate if criteria cannot be met. |
| Time zones | High | Strictly enforce UTC datetimes on the backend. Frontend converts to local time. |
| Query Performance on Random Generation | Medium | Ensure proper indices on `metadata_tags` JSONB column (GIN index) and status fields. |
| Test Matrix State Complexity in React | High | Use Zustand with clear immer-based reducers to handle deep nested JSON arrays (Blocks > Rules). |

---

## Git Strategy for Epoch 4

1. Branch off `main` to `feature/epoch-4-matrix`.
2. Commit linearly:
   - `feat(matrix): add test definition schema and endpoints`
   - `feat(matrix): build frontend blueprint designer`
   - `feat(session): build generation engine and freeze logic`
   - `feat(session): enforce time limits and extra-time provisions`
   - `test(epoch4): extensive unit tests for test generation`
3. Merge back to `main`.
