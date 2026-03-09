# Epoch 5 Blueprint — Student Frontier: Exam-Taking Interface

> **Branch:** `feature/epoch-5-student-frontier`
> **Prerequisites:** Epochs 1–4 complete, Epoch 4.5 cohesion pass done.
> **Reference:** `directives/epoch_roadmap.md` §5, `claude.md` for engineering principles.

---

## Overview

**Goal:** Build a production-grade, zero-data-loss exam-taking interface. When a student sits down for a 90-minute summative exam, every answer change, every flag toggle, and every navigation event is persisted within seconds. If their laptop dies mid-exam, they re-authenticate, and every response is exactly as they left it.

**What exists today (skeleton):**
- `ExamSession` model with frozen item snapshots and a session timer.
- `useExamStore` with `fetchSession` and `instantiateSession` — no answer persistence.
- `exam/[id]/page.tsx` renders questions with static radio buttons and textareas — inputs are uncontrolled and never saved.
- `sessions.py` endpoints for POST (create) and GET (retrieve) — no update/submit endpoints.

**What this Epoch delivers:**
1. A persistent `InteractionEvent` log that captures every student action.
2. A client-side heartbeat system that auto-saves every 2–3 seconds.
3. A visual Timeline Navigator showing answered/flagged/current question states.
4. Session recovery that restores exact state after browser crash or network loss.
5. A submission & review flow with immutability enforcement.
6. Offline resilience via localStorage queue.
7. Security hardening: students can only access their own sessions, submitted sessions are immutable.

---

## Stage 1 — Interaction Event Model & Migration

**Objective:** Create the database table that stores every student interaction.

### Backend Changes

#### New File: `backend/app/models/interaction_event.py`

```python
class InteractionEventType(str, Enum):
    ANSWER_CHANGE = "ANSWER_CHANGE"
    FLAG_TOGGLE = "FLAG_TOGGLE"  
    NAVIGATION = "NAVIGATION"

class InteractionEvent(Base):
    __tablename__ = "interaction_events"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    session_id      = Column(UUID, ForeignKey("exam_sessions.id"), nullable=False, index=True)
    learning_object_id = Column(UUID, nullable=True)    # NULL for NAVIGATION events
    item_version_id    = Column(UUID, nullable=True)     # NULL for NAVIGATION events
    event_type      = Column(Enum(InteractionEventType), nullable=False)
    payload         = Column(JSONB, nullable=False)      # answer data, flag state, or nav target
    created_at      = Column(DateTime, default=utcnow, nullable=False)
    
    session = relationship("ExamSession", backref="interaction_events")
```

**Payload schema by event type:**
```jsonc
// ANSWER_CHANGE (MCQ)
{ "selected_option_index": 2 }

// ANSWER_CHANGE (Multiple Response)
{ "selected_option_indices": [0, 2, 3] }

// ANSWER_CHANGE (Essay)
{ "text": "The student's current essay text..." }

// FLAG_TOGGLE
{ "flagged": true }

// NAVIGATION
{ "from_index": 2, "to_index": 5 }
```

#### New File: `backend/app/schemas/interaction_event.py`

```python
class InteractionEventCreate(BaseModel):
    learning_object_id: Optional[UUID] = None
    item_version_id: Optional[UUID] = None
    event_type: InteractionEventType
    payload: dict

class InteractionEventBulkCreate(BaseModel):
    events: list[InteractionEventCreate]
    
    @validator("events")
    def max_batch_size(cls, v):
        if len(v) > 100:
            raise ValueError("Maximum 100 events per heartbeat")
        return v

class InteractionEventResponse(BaseModel):
    id: UUID
    session_id: UUID
    event_type: InteractionEventType
    payload: dict
    created_at: datetime
```

#### Migration

```bash
cd backend && alembic revision --autogenerate -m "add interaction_events model"
alembic upgrade head
```

#### Update `prisma/schema.prisma`

Add `interaction_events` model with relation to `exam_sessions`.
Add `interactioneventtype` enum.

### Verification Gate

- [ ] `alembic upgrade head` runs without error.
- [ ] `SELECT * FROM interaction_events LIMIT 1` executes (empty table, no error).
- [ ] Model is exported in `models/__init__.py`.

**Commit:** `feat(database): add interaction_events model and migration`

---

## Stage 2 — Heartbeat API Endpoints

**Objective:** Build the backend endpoints that receive heartbeat event batches and serve the latest answer state for session recovery.

### Backend Changes

#### New File: `backend/app/services/interactions_service.py`

```python
async def save_interaction_events(session_id: UUID, events: list, current_user) -> dict:
    """
    Validate ownership, check session is STARTED, then bulk-insert events.
    Returns: { "saved": count, "server_timestamp": datetime }
    """
    # 1. Fetch session, verify student_id == current_user.id
    # 2. Verify session.status == STARTED (reject if SUBMITTED or EXPIRED)
    # 3. Bulk insert all events with session_id
    # 4. Return confirmation with server timestamp

async def get_latest_answers(session_id: UUID, current_user) -> dict:
    """
    Reconstruct the student's current answer state from interaction events.
    For each learning_object_id, return the latest ANSWER_CHANGE payload.
    Returns: { "answers": { lo_id: payload }, "flags": { lo_id: bool } }
    """
    # 1. Verify ownership
    # 2. Query latest ANSWER_CHANGE per learning_object_id (DISTINCT ON + ORDER BY created_at DESC)
    # 3. Query latest FLAG_TOGGLE per learning_object_id
    # 4. Return merged state
```

#### New File: `backend/app/api/endpoints/interactions.py`

```python
@router.post("/{session_id}/heartbeat", status_code=200)
async def heartbeat(session_id: UUID, payload: InteractionEventBulkCreate, current_user = Depends(get_current_user)):
    """Receive a batch of interaction events from the client."""
    return await save_interaction_events(session_id, payload.events, current_user)

@router.get("/{session_id}/answers", status_code=200)
async def get_answers(session_id: UUID, current_user = Depends(get_current_user)):
    """Reconstruct the latest answer state for session recovery."""
    return await get_latest_answers(session_id, current_user)
```

#### Modify: `backend/app/api/endpoints/sessions.py`

Add submission endpoint:

```python
@router.post("/{session_id}/submit", response_model=ExamSessionResponse)
async def submit_session(session_id: UUID, current_user = Depends(get_current_user)):
    """Submit the exam. Marks session as SUBMITTED, sets submitted_at, and locks it."""
    return await submit_exam_session(session_id, current_user)
```

#### New Function in `backend/app/services/exam_sessions_service.py`

```python
async def submit_exam_session(session_id: UUID, current_user) -> dict:
    """
    1. Verify ownership
    2. Verify session.status == STARTED
    3. Set status = SUBMITTED, submitted_at = utcnow
    4. Return updated session
    Raises 400 if already submitted. Raises 403 if not owner.
    """
```

### Security Considerations

- **Ownership check:** Every heartbeat and answer-retrieval request verifies `session.student_id == current_user.id`.
- **Session state guard:** Heartbeat events are rejected if session status is `SUBMITTED` or `EXPIRED` (HTTP 409 Conflict).
- **Rate limiting:** Max 100 events per heartbeat request. Consider future rate-limiting middleware.
- **Input validation:** All payloads validated by Pydantic. JSONB content is never rendered as HTML on the server.

### Verification Gate

- [ ] `POST /sessions/{id}/heartbeat` with valid events returns `200` + server timestamp.
- [ ] `POST /sessions/{id}/heartbeat` with wrong student returns `403`.
- [ ] `POST /sessions/{id}/heartbeat` on SUBMITTED session returns `409`.
- [ ] `GET /sessions/{id}/answers` returns reconstructed answer map.
- [ ] `POST /sessions/{id}/submit` transitions status to SUBMITTED.
- [ ] `POST /sessions/{id}/submit` on already-submitted session returns `400`.

**Commit:** `feat(api): add heartbeat, answers, and submit endpoints`

---

## Stage 3 — Frontend State Management & Heartbeat Hook

**Objective:** Extend the exam store with local answer/flag state and build a debounced heartbeat hook that syncs to the backend.

### Frontend Changes

#### Modify: `frontend/src/stores/useExamStore.ts`

Extend the store with:

```typescript
interface ExamState {
    // ... existing fields ...
    
    // Answer state: keyed by learning_object_id
    answers: Record<string, any>;         // { lo_id: { selected_option_index: 2 } }
    flags: Record<string, boolean>;       // { lo_id: true/false }
    currentQuestionIndex: number;
    
    // Heartbeat state
    pendingEvents: InteractionEvent[];    // Queue of unsent events
    saveStatus: 'idle' | 'saving' | 'saved' | 'error';
    lastSavedAt: string | null;
    
    // Actions
    setAnswer: (loId: string, ivId: string, questionType: string, payload: any) => void;
    toggleFlag: (loId: string, ivId: string) => void;
    navigateTo: (index: number) => void;
    queueEvent: (event: InteractionEvent) => void;
    flushEvents: () => Promise<void>;
    loadSavedAnswers: (sessionId: string) => Promise<void>;
    submitExam: (sessionId: string) => Promise<void>;
}
```

#### New File: `frontend/src/hooks/useHeartbeat.ts`

```typescript
/**
 * Custom hook that auto-saves pending interaction events every 2 seconds.
 * 
 * - Watches pendingEvents in the exam store
 * - Debounces flushEvents to avoid excessive API calls
 * - Shows "Saving..." / "Saved ✓" indicator via saveStatus
 * - On unmount or visibility change, flushes immediately
 * - If flush fails, events remain in the queue for retry
 * - On repeated failures, falls back to localStorage persistence
 */
export function useHeartbeat(sessionId: string) {
    // setInterval every 2000ms
    // If pendingEvents.length > 0, call flushEvents()
    // On window beforeunload, flush synchronously via navigator.sendBeacon
    // On visibilitychange to "hidden", flush immediately
}
```

#### New File: `frontend/src/hooks/useOfflineQueue.ts`

```typescript
/**
 * Manages a localStorage-backed queue of interaction events
 * for offline resilience.
 * 
 * - On flush failure, events are written to localStorage
 * - On reconnect / page load, queued events are replayed to the server
 * - Queue key: `openvision_heartbeat_queue_{sessionId}`
 */
```

### Verification Gate

- [ ] Selecting an MCQ option updates `answers[lo_id]` in the store.
- [ ] After 2 seconds, a network request is made to `/sessions/{id}/heartbeat`.
- [ ] `saveStatus` transitions: `idle` → `saving` → `saved`.
- [ ] Events that fail to send remain in `pendingEvents` for retry.

**Commit:** `feat(frontend): implement exam store state management and heartbeat hook`

---

## Stage 4 — Question Interaction Components

**Objective:** Replace the static, uncontrolled question inputs with interactive components wired to the exam store.

### Frontend Changes

#### New File: `frontend/src/components/exam/MCQQuestion.tsx`

- Renders radio buttons for single-choice questions.
- Calls `setAnswer(loId, ivId, 'MULTIPLE_CHOICE', { selected_option_index })` on change.
- Highlights the currently selected option from `answers[loId]`.
- Shows flag toggle button.

#### New File: `frontend/src/components/exam/MultipleResponseQuestion.tsx`

- Renders checkboxes for multi-select questions.
- Calls `setAnswer(loId, ivId, 'MULTIPLE_RESPONSE', { selected_option_indices })` on change.

#### New File: `frontend/src/components/exam/EssayQuestion.tsx`

- Renders a textarea with word count.
- Debounces `setAnswer` calls (500ms internal debounce to avoid flooding the event queue).
- Shows current word count.

#### New File: `frontend/src/components/exam/QuestionRenderer.tsx`

- Switch component that renders the correct question type based on `question_type`.
- Handles rich content rendering (TipTap JSON → HTML, LaTeX, code blocks).
- Renders the flag toggle button.
- Shows "Question X of Y" header.

#### Modify: `frontend/src/app/exam/[id]/page.tsx`

- Replace the monolithic question rendering with `<QuestionRenderer />`.
- Show one question at a time (paginated view, not scroll-based).
- Add Previous / Next navigation buttons.
- Integrate `useHeartbeat(sessionId)` hook.
- Add session recovery: on mount, call `loadSavedAnswers(sessionId)` to restore state.

### Verification Gate

- [ ] Clicking a radio button highlights it and updates the store.
- [ ] Typing in an essay textarea debounces and queues an ANSWER_CHANGE event.
- [ ] Flag toggle changes the icon state and queues a FLAG_TOGGLE event.
- [ ] Previous/Next buttons change `currentQuestionIndex`.

**Commit:** `feat(frontend): add interactive question components with store integration`

---

## Stage 5 — Timeline Navigator

**Objective:** Build the visual navigation bar that shows real-time question states at the bottom of the exam screen.

### Frontend Changes

#### New File: `frontend/src/components/exam/TimelineNavigator.tsx`

Visual timeline bar (horizontal, bottom of screen) with one cell per question:

| State      | Visual               |
|------------|----------------------|
| Unanswered | Gray circle          |
| Answered   | Filled indigo circle |
| Current    | Green ring           |
| Flagged    | Orange flag icon     |

- Click any cell to jump to that question (`navigateTo(index)`).
- Keyboard: Left/Right arrow keys to move between questions.
- Current question is always visible (auto-scroll if many questions).
- Shows "X of Y answered" summary.

#### New File: `frontend/src/components/exam/SaveIndicator.tsx`

Small persistent badge in the header:
- `idle`: hidden
- `saving`: "Saving..." with spinner
- `saved`: "Saved ✓" with green checkmark (fades after 2s)
- `error`: "Save failed — retrying..." with red dot

### Verification Gate

- [ ] Timeline shows the correct number of cells matching the question count.
- [ ] Answering a question turns its cell from gray to indigo.
- [ ] Flagging a question shows the flag icon on its cell.
- [ ] Clicking a cell navigates to that question.
- [ ] SaveIndicator shows "Saved ✓" after a successful heartbeat.

**Commit:** `feat(frontend): add timeline navigator and save indicator`

---

## Stage 6 — Session Recovery & Offline Resilience

**Objective:** Ensure that refreshing the page or losing connection does not lose any work.

### Implementation

1. **On page load:** `loadSavedAnswers(sessionId)` calls `GET /sessions/{id}/answers`, populates `answers` and `flags` in the store.
2. **localStorage fallback:** If the network call fails, check `localStorage` for a cached answer map.
3. **Offline queue:** If `flushEvents()` fails (network error), events are serialized to `localStorage`. On next successful heartbeat, the localStorage queue is drained first.
4. **`beforeunload` handler:** Uses `navigator.sendBeacon()` to fire a final heartbeat before the tab closes.
5. **Re-authentication flow:** If the JWT expires mid-exam, the heartbeat hook detects a `401` and prompts re-login without losing local state.

### Security Considerations

- **localStorage is per-origin.** Only the OpenVision domain can read the queue.
- **Queue entries are keyed by session ID.** Different sessions don't interfere.
- **Queue is cleared after successful drain.** No stale data remains.
- **Server is authoritative.** On recovery, server state always wins if there's a conflict (last-write-wins based on `created_at`).

### Verification Gate

- [ ] Start an exam, answer Q1, refresh the page. Q1 answer is restored.
- [ ] Start an exam, answer Q2, disconnect network, answer Q3, reconnect. Both Q2 and Q3 are persisted.
- [ ] `localStorage` key exists with queued events if network is down.
- [ ] `localStorage` key is cleaned up after successful drain.

**Commit:** `feat(frontend): implement session recovery and offline resilience`

---

## Stage 7 — Submission & Review Flow

**Objective:** Build the end-of-exam experience: review summary, confirmation dialog, and post-submission lock.

### Frontend Changes

#### New File: `frontend/src/components/exam/ReviewSummary.tsx`

Summary screen before submission showing:
- Total questions: X
- Answered: Y (green)
- Unanswered: Z (red, clickable to jump back)
- Flagged: W (orange, clickable to jump back)
- "Are you sure?" warning

#### New File: `frontend/src/components/exam/SubmissionConfirmation.tsx`

Post-submission page showing:
- ✅ "Your exam has been submitted."
- Session ID (for student records)
- Submitted at: timestamp
- "You may now close this tab."

#### Modify: `frontend/src/app/exam/[id]/page.tsx`

- "Submit Exam" button opens the ReviewSummary.
- After confirmation, calls `submitExam(sessionId)` in the store.
- On success, navigates to SubmissionConfirmation.
- If session is already SUBMITTED (e.g., on refresh), show read-only view.

### Backend Security

- `submit_exam_session` sets `status = SUBMITTED`, `submitted_at = utcnow()`.
- After submission, all heartbeat POSTs return `409 Conflict`.
- GET endpoint returns full session data but the frontend renders it as read-only.
- **Auto-expiration:** If `expires_at < now()` and session is still STARTED, the next GET or heartbeat call auto-transitions to EXPIRED.

### Verification Gate

- [ ] ReviewSummary correctly shows answered/unanswered/flagged counts.
- [ ] Clicking "Submit" transitions the session to SUBMITTED.
- [ ] After submission, the exam page shows read-only confirmation.
- [ ] API rejects heartbeat on submitted session (409).
- [ ] Expired sessions are auto-transitioned on access.

**Commit:** `feat: implement submission and review flow with immutability lock`

---

## Stage 8 — Integration Tests & E2E

**Objective:** Comprehensive test coverage for the full exam-taking flow.

### Backend Tests: `backend/tests/test_interactions.py`

- Test bulk heartbeat event persistence.
- Test ownership enforcement (other student → 403).
- Test submitted-session rejection (409).
- Test answer reconstruction logic (correct latest-event-wins behavior).
- Test auto-expiration on GET.

### Backend Tests: `backend/tests/test_submission.py`

- Test successful submission flow.
- Test double-submit rejection.
- Test submission by wrong student.

### E2E Tests: `frontend/tests/e2e/exam-taking.spec.ts`

1. **Happy path:** Login as student → start exam → answer all questions → submit → see confirmation.
2. **Session recovery:** Answer Q1 → refresh page → Q1 is still selected.
3. **Timeline navigation:** Answer Q1, flag Q2, verify timeline colors, click Q3 cell.
4. **Submission guard:** Submit with unanswered questions → see warning → confirm → submitted.
5. **Immutability:** After submission, verify no inputs are editable.

### Verification Gate

- [ ] `pytest backend/tests/test_interactions.py` — all passing.
- [ ] `pytest backend/tests/test_submission.py` — all passing.
- [ ] `npx playwright test exam-taking.spec.ts` — all passing.
- [ ] Aikido security scan: zero Critical/High findings.

**Commit:** `test: add interaction, submission, and E2E exam-taking tests`

---

## Security Checklist (Epoch 5 Specific)

| Concern | Mitigation |
|---------|-----------|
| Student accesses another student's session | Ownership check: `session.student_id == current_user.id` on every endpoint |
| Student modifies answers after submission | Status guard: heartbeat rejected with 409 if SUBMITTED/EXPIRED |
| Malicious heartbeat payload | Pydantic validation + max batch size (100 events) |
| XSS via question content | DOMPurify sanitization on render (already in place) |
| CSRF | JWT bearer tokens (no cookies), so CSRF is not applicable |
| JWT expiry mid-exam | Heartbeat detects 401, prompts re-auth without losing local state |
| Data loss on network failure | localStorage queue + sendBeacon on tab close |
| Replay attacks / duplicate events | Events are append-only with server timestamps; duplicates are harmless |

---

## File Manifest

### New Files
| File | Purpose |
|------|---------|
| `backend/app/models/interaction_event.py` | InteractionEvent SQLAlchemy model |
| `backend/app/schemas/interaction_event.py` | Pydantic DTOs for heartbeat payloads |
| `backend/app/services/interactions_service.py` | Business logic for event persistence & answer reconstruction |
| `backend/app/api/endpoints/interactions.py` | Heartbeat and answers API routes |
| `frontend/src/hooks/useHeartbeat.ts` | Auto-save hook with 2s debounce |
| `frontend/src/hooks/useOfflineQueue.ts` | localStorage-backed offline queue |
| `frontend/src/components/exam/MCQQuestion.tsx` | Interactive MCQ component |
| `frontend/src/components/exam/MultipleResponseQuestion.tsx` | Interactive multi-select component |
| `frontend/src/components/exam/EssayQuestion.tsx` | Interactive essay component with word count |
| `frontend/src/components/exam/QuestionRenderer.tsx` | Question type router/renderer |
| `frontend/src/components/exam/TimelineNavigator.tsx` | Visual timeline bar |
| `frontend/src/components/exam/SaveIndicator.tsx` | Save status badge |
| `frontend/src/components/exam/ReviewSummary.tsx` | Pre-submission review screen |
| `frontend/src/components/exam/SubmissionConfirmation.tsx` | Post-submission confirmation |
| `backend/tests/test_interactions.py` | Heartbeat & answer reconstruction tests |
| `backend/tests/test_submission.py` | Submission flow tests |
| `frontend/tests/e2e/exam-taking.spec.ts` | Full E2E exam-taking tests |

### Modified Files
| File | Changes |
|------|---------|
| `backend/app/models/__init__.py` | Export InteractionEvent |
| `backend/app/api/api.py` | Mount interactions router |
| `backend/app/api/endpoints/sessions.py` | Add submit endpoint |
| `backend/app/services/exam_sessions_service.py` | Add submit + auto-expire logic |
| `prisma/schema.prisma` | Add interaction_events model + enum |
| `frontend/src/stores/useExamStore.ts` | Add answers, flags, events, heartbeat state |
| `frontend/src/app/exam/[id]/page.tsx` | Paginated view, heartbeat integration, recovery |
