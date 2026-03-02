# OpenVision: Master Epoch Roadmap

> **Purpose:** This document is the single source of truth for the entire OpenVision project scope. It maps every feature of the VU Amsterdam TestVision ecosystem into a phased development plan. Each Epoch is a major milestone with clear goals, deliverables, and exit criteria. Detailed engineering blueprints for each Epoch live in their own `directives/epoch_N_*.md` files.
>
> **Reference:** This roadmap is derived from the *Architectural Deconstruction of the TestVision Ecosystem at VU Amsterdam* research document, ensuring feature parity with—and eventual improvement over—the production TestVision platform.

---

## Epoch 1 — Foundation & Infrastructure ✅

**Goal:** Establish the monorepo structure, local development environment, and verify basic connectivity across the entire stack.

**Deliverables:**
- Docker Compose orchestrating PostgreSQL and Redis containers.
- FastAPI backend scaffold with a `/health` endpoint and verified Postgres connection.
- Next.js frontend initialized with TypeScript, Tailwind CSS, and the App Router.
- Automated connection test script (`test_connections.py`) verifying Postgres and Redis.
- `.gitignore`, project structure, and `.env` configuration.

**Exit Criteria:**
- `docker-compose up` brings the full environment online.
- `python test_connections.py` prints green on both Postgres and Redis.
- `npm run build` compiles the frontend without errors.
- All changes committed and merged to `main`.

**TestVision Features Addressed:**
- Infrastructure foundation (SaaS backend, relational DB, caching layer).

**Status:** ✅ Complete. Merged to `main`.

---

## Epoch 2 — The Constructor's Workbench ✅

**Goal:** Build the advanced item authoring environment with immutable versioning, a rich-text WYSIWYG editor, and full-stack data persistence.

**Deliverables:**
- PostgreSQL schema: `User`, `ItemBank`, `LearningObject`, `ItemVersion`, `MediaAsset`.
- Alembic migration pipeline for schema version control.
- Pydantic DTOs with discriminated unions for MCQ and Essay validation.
- Immutability Controller: editing an APPROVED item creates a new DRAFT version.
- Soft-delete guard: retiring items instead of destroying psychometric history.
- TipTap WYSIWYG editor with toolbar (Bold, Italic, H2, Lists).
- Lowlight-powered code blocks with syntax highlighting (Python, Java, JS, etc.).
- MCQ answer options panel with correct-answer toggling.
- Zustand store with 3-second debounced auto-save to the backend.
- Full E2E flow: type question → add options → click Save → data persists in Postgres.

**Exit Criteria:**
- `pytest tests/test_schemas.py` — 5 passed.
- `pytest tests/test_items_api.py` — 2 passed (immutability + soft-delete).
- `npm run build` compiles without errors.
- Browser E2E shows "✓ All changes saved" with Version: 1.
- All changes committed and merged to `main`.

**TestVision Features Addressed:**
- Item Bank with versioned metadata (GUID, version number, status enum).
- WYSIWYG authoring for question stems.
- Code snippet embedding with syntax highlighting.
- Version control logic: new version on edit, lineage preserved.
- Reusable learning objects stored in centralized banks.

**Status:** ✅ Complete. Merged to `main`.

---

## Epoch 3 — Authentication, RBAC & Institutional Identity

**Goal:** Implement secure user authentication with JWT tokens, enforce the TestVision role hierarchy, and lay the groundwork for institutional SSO integration.

### 3.1 — User Registration & JWT Authentication

**Deliverables:**
- User registration endpoint (`POST /auth/register`) with email + hashed password.
- Login endpoint (`POST /auth/login`) returning a signed JWT access token + refresh token.
- Token refresh endpoint (`POST /auth/refresh`).
- Password hashing via `bcrypt` or `argon2`.
- Protected route middleware: all `/api/*` endpoints require a valid Bearer token.
- Unauthenticated requests return `401 Unauthorized`.

**TestVision Parity:** *"Access to TestVision is gated by VUnetID via SURFconext, ensuring that only authorized university members can access the platform."*

### 3.2 — Role-Based Access Control (RBAC)

**Deliverables:**
- Three enforced roles: `CONSTRUCTOR`, `REVIEWER`, `ADMIN`.
- `CONSTRUCTOR` can create/edit items, cannot approve or publish.
- `REVIEWER` can transition items from `READY_FOR_REVIEW` → `APPROVED`.
- `ADMIN` has full access including user management and system configuration.
- `STUDENT` role (read-only on exam content, write-only on responses).
- Role-checking middleware applied to all API endpoints.
- Item status workflow transitions enforced server-side:
  - `DRAFT` → `READY_FOR_REVIEW` (by Constructor)
  - `READY_FOR_REVIEW` → `APPROVED` (by Reviewer only)
  - `APPROVED` → `RETIRED` (by Admin or Constructor)

**TestVision Parity:** *"The 'all-in-one' approach where roles and rights are granularly managed allows for a collaborative authoring process where one user constructs a question and another provides the final 'publishing' check."*

### 3.3 — SSO & Institutional Identity (Preparation)

**Deliverables:**
- OAuth2 provider abstraction layer (so we can plug in SURFconext, Google, or OIDC later).
- `VUnetID` field on the User model for institutional identity mapping.
- Configuration schema for SSO providers in `.env`.
- Documentation for how SURFconext OIDC integration will work (deferred to production).

**TestVision Parity:** *"Single Sign-On (SSO): Access is gated by VUnetID via SURFconext."*

**Exit Criteria:**
- Unauthenticated `POST /api/learning-objects/.../versions` returns `401`.
- Constructor cannot call a `PATCH /items/{id}/approve` endpoint.
- Reviewer can transition an item to APPROVED.
- JWT expiry and refresh flow tested end-to-end.

---

## Epoch 4 — The Test Matrix & Blueprint Engine

**Goal:** Build the logic-heavy module that transforms an Item Bank into a structured exam. This is the core intellectual property of an assessment platform — the ability to generate psychometrically equivalent but unique exams per student.

### 4.1 — Test Definition (The Blueprint)

**Deliverables:**
- `TestDefinition` model: a named blueprint containing selection rules stored as JSONB.
- Blueprint UI for educators to define selection criteria:
  - Filter by topic tags, taxonomic level (Bloom's), difficulty range, status.
  - "At Random" rules: e.g., *"Select 5 items tagged 'Statistics' at Level 'Application'"*.
  - Fixed rules: e.g., *"Always include Item X as question 1"*.
  - Block structure: group questions into sections (e.g., "Part A: Multiple Choice", "Part B: Open Questions").
- Validation engine: ensures the selection rules can be satisfied by the current bank contents (warns if not enough items match).
- Preview mode: shows a sample instantiation of the blueprint without creating a session.

**TestVision Parity:** *"The Test Matrix allows for the definition of 'At Random' selection rules. A matrix might specify: select five items tagged with 'Topic: Statistics' and 'Level: Application' from a specific bank."*

### 4.2 — Session Instantiation (The Freeze)

**Deliverables:**
- `ExamSession` model: links a student to a specific TestDefinition.
- Session initialization logic: when a session is created, the system "freezes" the selected items into a `SessionItemSet` so the student sees the same questions even if the bank is updated mid-exam.
- Randomized question ordering per student (configurable: fixed or shuffled).
- Randomized answer option ordering for MCQ (configurable per item).
- Time-bound sessions with start time, end time, and duration calculated from test settings.
- Session states: `SCHEDULED`, `ACTIVE`, `PAUSED`, `SUBMITTED`, `GRADED`.

**TestVision Parity:** *"When a session is created, the system must 'freeze' the selection of items so that the student sees the same set even if the item bank is updated mid-exam."*

### 4.3 — Time Blocks & Scheduling

**Deliverables:**
- Support for time-block scheduling (e.g., Block 1: 08:30–11:15, Block 2: 12:15–14:30).
- Extra time accommodations: per-student time multiplier (e.g., 30 minutes extra for students with provisions).
- Automatic session termination when time expires.
- Grace period configuration (e.g., 5 minutes after deadline for network latency).

**TestVision Parity:** *"At VU Amsterdam, sessions are often time-bound to specific blocks. Students with approved provisions may receive extra time, automatically calculated and applied based on data imported from the Education Office."*

**Exit Criteria:**
- A TestDefinition with random rules generates a unique but valid set of items per session.
- Two sessions for the same test produce different question orderings.
- Frozen session items are unaffected when the bank is updated.
- Time-bound session auto-terminates after duration expires.

---

## Epoch 5 — The Student Frontier: Exam-Taking Interface

**Goal:** Build the high-stakes, production-grade exam-taking UI that prioritizes zero data loss, intuitive navigation, and accessibility.

### 5.1 — The Timeline Navigator

**Deliverables:**
- Visual timeline at the bottom of the exam screen showing all questions as navigable blocks.
- Real-time status indicators per question:
  - **Gray/Default** — Unanswered (not yet visited or saved).
  - **Green** — Current question (student's active position).
  - **Flagged** — Student marked for later review (three-line icon).
  - **Blue** — Block introduction / instructional text (non-scored).
  - **Answered** — Student has provided a response.
- Click-to-navigate: student can jump to any question.
- Keyboard navigation support (arrow keys, Tab).

**TestVision Parity:** *"The primary navigation tool is a visual timeline at the bottom of the screen. This component is a real-time status tracker for the exam progress."*

### 5.2 — Question Rendering Engine

**Deliverables:**
- Render different question types from the TipTap JSON content:
  - **Multiple Choice (single answer)** — radio buttons.
  - **Multiple Response (multiple answers)** — checkboxes.
  - **Open / Essay** — text area with word counter.
  - **Hotspot** — clickable image regions (future).
  - **Ordering / Drag-and-Drop** — sortable list (future).
- Rich content rendering: LaTeX math, syntax-highlighted code blocks, embedded images.
- Previous/Next navigation with keyboard shortcuts.
- Flagging toggle on every question.

**TestVision Parity:** *"When a student selects a radio button, types a character in an essay box, or clicks a hotspot, that data is transmitted to the server."*

### 5.3 — Direct Storage (The Heartbeat)

**Deliverables:**
- `InteractionEvent` model: granular log of every student interaction (answer change, flag toggle, navigation event).
- Custom React hook (`useHeartbeat`) that detects answer state changes and debounces a `PATCH` request to the backend every 2–3 seconds.
- Server-side acknowledgment: backend responds with a `200 OK` + server timestamp for each heartbeat.
- Session recovery: if a student's browser crashes or loses connection, re-authenticating retrieves the last known state — the student continues from the exact second they disconnected.
- Offline resilience: queue unsent heartbeats in `localStorage` and flush them when connectivity is restored.
- Visual "saved" indicator on the UI (green checkmark after each successful heartbeat).

**TestVision Parity:** *"TestVision treats every student interaction as a persistent event. If a student's laptop loses power, the work is already safe on the server. Upon rebooting and re-logging, the system retrieves the last known state."*

### 5.4 — Submission & Review Flow

**Deliverables:**
- "Review before submit" screen showing a summary of answered, unanswered, and flagged items.
- Confirm submission dialog with a warning about unanswered questions.
- Post-submission lock: once submitted, the session is immutable — no further changes allowed.
- Submission receipt: student sees a confirmation page with session ID and timestamp.

**Exit Criteria:**
- Timeline reflects real-time question states as the student navigates.
- Closing the browser mid-exam and re-opening recovers the exact session state.
- Heartbeat logs are persisted in the DB with correct timestamps.
- Submitted sessions cannot be modified via API.

---

## Epoch 6 — Automated Grading, Manual Review & Result Registration

**Goal:** Implement the grading pipeline: auto-grade objective questions, provide a manual grading UI for open questions, and export results.

### 6.1 — Automated Grading Engine

**Deliverables:**
- Auto-grading triggered on session submission.
- Scoring logic per question type:
  - **MCQ (single):** 1 point if correct, 0 otherwise.
  - **MCQ (multiple response):** partial credit configurable (all-or-nothing or per-option).
  - **Ordering:** scored based on correct position count.
- Negative marking configuration (optional penalty for incorrect answers).
- Raw score + percentage calculated per session.
- Grade boundaries configurable per test (e.g., 55% = pass at VU Amsterdam).

**TestVision Parity:** *"Grading is automated for objective questions."*

### 6.2 — Manual Grading Interface

**Deliverables:**
- Grading dashboard listing all submitted sessions for a test, with progress indicators.
- Per-student grading view: shows the student's essay response alongside the model answer.
- Rubric-based scoring: configurable point allocation with free-text feedback per question.
- "Blind grading" mode: student identity hidden during grading to prevent bias.
- Batch actions: "Give full marks to all" for questions everyone answered correctly.
- Auto-save grading progress (so the grader doesn't lose work).

**TestVision Parity:** *"Manual grading for open questions."*

### 6.3 — Result Registration & Export

**Deliverables:**
- Results overview dashboard: sortable table of all students, their scores, and pass/fail status.
- CSV/Excel export of results for upload to Osiris (VU Amsterdam's SIS).
- Per-student detailed report: shows each question, the student's answer, the correct answer, and the points awarded.
- Grade release workflow: results are invisible to students until the educator clicks "Publish Results".
- Email notification to students when results are published (optional).

**TestVision Parity:** *"Results must be moved to Osiris. This is often done via CSV/Excel exports or an automated API bridge."*

**Exit Criteria:**
- MCQ sessions are auto-graded within 1 second of submission.
- Manual grading UI saves rubric scores and feedback.
- CSV export matches the format expected by Osiris.
- Students cannot see results until the educator publishes them.

---

## Epoch 7 — Psychometric Analytics & Item Evaluation

**Goal:** Surface actionable psychometric statistics so educators can evaluate and improve their item banks over time. This is the "Evaluation" and "Improvement" phase of the TestVision test cycle.

### 7.1 — Per-Item Statistics

**Deliverables:**
- **Difficulty Index (P-value):** Proportion of students who answered correctly. Calculated as `P = Σ(correct) / N`.
- **Discrimination Index (D-value):** Correlation between performance on this item and overall test performance. High D-value = the item effectively separates strong from weak students.
- **Distractor analysis for MCQ:** For each incorrect option, show the percentage of students who selected it. A "non-functional distractor" (selected by <5% of students) is flagged for revision.
- **Version comparison:** Show how P-value and D-value change across different versions of the same item. *"This allows psychometricians to analyze how specific changes to a question influence its difficulty index over time."*
- Automatic flagging of "bad" items:
  - P < 0.20 → too hard.
  - P > 0.90 → too easy.
  - D < 0.15 → poor discrimination.

### 7.2 — Per-Test Statistics

**Deliverables:**
- **Score distribution histogram** with mean, median, and standard deviation.
- **Reliability coefficient (Cronbach's Alpha or KR-20)** to measure internal consistency.
- **Standard Error of Measurement (SEM).**
- **Pass rate** and comparison to historical pass rates for the same course.
- Cut-score analysis: "What happens to the pass rate if we move the boundary from 55% to 50%?"

### 7.3 — Analytics Dashboard

**Deliverables:**
- Interactive dashboard for educators:
  - Item-level drill-down with P/D value trend charts across semesters.
  - Test-level overview with distribution curves.
  - Flagged items list (items needing revision based on statistical thresholds).
- Export analytics reports as PDF for exam board reviews.

**TestVision Parity:** *"The system must recalculate statistics after every major exam block to provide constructors with up-to-date information for the 'Analysis' phase."*

**Exit Criteria:**
- After a graded test, P-values and D-values are computed for all items.
- Distractor analysis correctly identifies non-functional distractors.
- Dashboard renders score distributions and item performance charts.
- Flagged items are surfaced to the constructor.

---

## Epoch 8 — Media Management & Resource Library

**Goal:** Enable rich media uploads, build a reusable resource library, and support CDN-backed delivery for scalable media serving.

### 8.1 — Upload Pipeline

**Deliverables:**
- File upload endpoint (`POST /media/upload`) with multipart form data.
- Accepted formats: JPEG, PNG, GIF, SVG, MP4, WebM, PDF.
- File size limits enforced server-side (configurable, e.g., 50MB for video).
- Virus scanning / file type validation (magic bytes, not just extension).
- S3-compatible storage backend (MinIO for local dev, AWS S3 for production).
- Unique filename generation with original name preserved in metadata.

### 8.2 — Resource Library UI

**Deliverables:**
- Searchable, filterable media library accessible from the TipTap editor.
- Grid/List view toggle with thumbnails.
- Drag-and-drop upload directly into the library.
- Media reuse: a single image can be referenced by multiple questions across different item banks.
- Usage tracking: show which questions reference a given media asset.

**TestVision Parity:** *"Instead of storing BLOBs directly in the item record, the system utilizes a resource library. This allows a single asset to be referenced by multiple questions, optimizing storage."*

### 8.3 — TipTap Media Integration

**Deliverables:**
- "Insert Image" button in TipTap toolbar opening the resource library modal.
- "Insert Video" support with inline playback.
- Image resizing and alignment controls within the editor.
- Alt-text field (required) for accessibility compliance.

**Exit Criteria:**
- An image uploaded once can be inserted into 3 different questions.
- Deleting a question does not delete the shared media asset.
- Media loads via CDN URL, not direct database fetch.

---

## Epoch 9 — Accessibility & Inclusive Design

**Goal:** Ensure the platform meets WCAG 2.1 AA standards and provides the accommodations required for high-stakes university exams.

### 9.1 — Visual Accessibility

**Deliverables:**
- Theme provider with three modes:
  - **Default** — standard dark/light theme.
  - **High Contrast** — maximized contrast ratios for visually impaired students.
  - **Dyslexia-Friendly** — OpenDyslexic font, increased letter spacing, muted background.
- Font size controls: student can increase/decrease font size during the exam.
- All interactive elements have ≥ 4.5:1 contrast ratio.

### 9.2 — Keyboard & Screen Reader Support

**Deliverables:**
- Full keyboard navigation: Tab through questions, Enter to select, arrow keys for MCQ options.
- ARIA labels on all interactive elements.
- Screen reader announcements for state changes (e.g., "Answer saved", "Question flagged").
- Skip navigation links.
- Focus trap management in modals and dialogs.

### 9.3 — Examination Accommodations

**Deliverables:**
- Per-student time multiplier (e.g., 1.25x, 1.5x) set by the exam administrator.
- Enlarged display mode (triggered by accommodation flag, not just user preference).
- Accommodation audit log: records which students received which provisions.
- Integration-ready: accommodation data can be imported from a CSV or API (Osiris bridge).

**TestVision Parity:** *"TestVision incorporates font resizing, contrast adjustments, and specific accommodations for dyslexia. Students with approved provisions receive extra time, automatically calculated."*

**Exit Criteria:**
- Lighthouse accessibility audit scores ≥ 90.
- Screen reader can navigate the entire exam flow without sighted assistance.
- A student with 1.25x time gets 75 minutes for a 60-minute exam.

---

## Epoch 10 — Security: Safe Exam Browser & Proctoring

**Goal:** Lock down the exam environment to prevent cheating during summative assessments.

### 10.1 — Safe Exam Browser (SEB) Integration

**Deliverables:**
- Per-test configuration toggle: "Require SEB" (boolean in TestDefinition).
- Backend generates a unique **Browser Exam Key** per test session.
- Middleware validates the SEB header hash on every request during an active session.
- If the hash is missing or invalid → `403 Forbidden`, session flagged for supervisor review.
- SEB configuration file (`.seb`) generation and download for students.

**TestVision Parity:** *"When an exam is SEB-enabled, the TestVision server generates a unique Browser Exam Key. The student's SEB instance must send a matching hash in its request headers."*

### 10.2 — Supervisor Status Monitor

**Deliverables:**
- Real-time dashboard for exam supervisors showing:
  - List of all active sessions with student name, current question, and last heartbeat timestamp.
  - Color-coded status: Green (active), Yellow (no heartbeat for 30s), Red (disconnected).
  - Security alerts: SEB violation attempts, multiple login attempts, suspicious navigation patterns.
- Ability to pause/extend/terminate individual student sessions from the supervisor dashboard.
- Incident log: all security events timestamped and recorded for post-exam review.

**TestVision Parity:** *"If the student attempts to switch windows, the incident is logged for the supervisor's status monitor."*

### 10.3 — Anti-Cheating Measures

**Deliverables:**
- Context menu suppression and right-click disabling during exams (even without SEB).
- Copy/paste blocking within the exam interface (configurable per test).
- IP whitelisting for on-campus exams (optional).
- Browser fingerprinting to detect session sharing across devices.

**Exit Criteria:**
- An exam configured with "Require SEB" rejects connections from Chrome/Firefox.
- Supervisor dashboard shows live heartbeat status for 10+ concurrent students.
- SEB violation events are logged and visible in the incident log.

---

## Epoch 11 — LTI 1.3, Canvas Integration & Interoperability

**Goal:** Integrate with institutional systems so OpenVision functions as a seamless part of the VU Amsterdam digital learning ecosystem.

### 11.1 — LTI 1.3 Advantage Integration

**Deliverables:**
- LTI 1.3 tool provider implementation using `PyLTI1p3`.
- OIDC login initiation flow: Canvas sends a JWT → OpenVision validates and creates/maps the user.
- Deep linking: educators can embed specific tests as Canvas assignments.
- Assignment & Grade Services (AGS): auto-push grades back to Canvas gradebook after grading.
- Platform registration UI: admin can configure Canvas instance details (issuer, JWKS URL, etc.).

**TestVision Parity:** *"LTI 1.3 Advantage utilizes a secure OIDC handshake. A JWT is passed containing the student's identity and their role in the course."*

### 11.2 — SIS Integration (Osiris Bridge)

**Deliverables:**
- Grade export in Osiris-compatible CSV format.
- API endpoint for bulk grade push (when Osiris API access is available).
- Student roster import from CSV (VUnetID, name, course enrollment).
- Accommodation import from CSV (VUnetID + time multiplier).

### 11.3 — QTI & Interoperability (Future-Proofing)

**Deliverables:**
- QTI 2.1 export: export items and tests in the IMS Question & Test Interoperability standard.
- QTI import: ingest items from other platforms (Moodle, Blackboard, etc.).
- This ensures the item bank is not locked into OpenVision and can migrate to other systems.

**Exit Criteria:**
- A student clicking a Canvas assignment link is seamlessly SSO'd into the correct OpenVision exam.
- Grades submitted in OpenVision appear in the Canvas gradebook.
- A 50-item bank can be exported as QTI XML and re-imported without data loss.

---

## Epoch 12 — Scalability, Concurrency & Production Hardening

**Goal:** Prepare the system to handle "thundering herd" scenarios — hundreds of students logging in simultaneously for a high-stakes exam.

### 12.1 — Concurrency & Performance

**Deliverables:**
- **Async ingestion pipeline:** heartbeat writes go through a Redis queue → async worker flushes to Postgres. This prevents database locks during peak load.
- **Connection pooling:** SQLAlchemy + PgBouncer for efficient database connection management.
- **Load testing:** simulate 500 concurrent students using Locust or k6, targeting:
  - Login surge: 500 logins in 60 seconds.
  - Heartbeat throughput: 500 heartbeats/second with P99 latency < 200ms.
- **Caching layer:** Redis for session state, frequently accessed item metadata, and computed analytics.

**TestVision Parity:** *"The infrastructure must handle 'thundering herd' scenarios — 800 students logging in at precisely 08:30 AM. Server-side storage uses a non-blocking queue to prevent database locks."*

### 12.2 — Containerization & Deployment

**Deliverables:**
- Multi-stage Dockerfiles for frontend (Next.js) and backend (FastAPI).
- `docker-compose.prod.yml` for one-command production deployment.
- Nginx reverse proxy with SSL termination.
- Health check endpoints for container orchestration readiness probes.
- Environment-based configuration (dev / staging / production) with `.env` validation.

### 12.3 — CI/CD Pipeline

**Deliverables:**
- GitHub Actions workflow:
  - On PR: lint, type-check, run full test suite (unit + integration).
  - On merge to `main`: build Docker images, push to container registry.
  - Optional: auto-deploy to staging environment.
- Branch protection rules on `main`: require passing CI before merge.
- Code coverage reporting (target: ≥ 80%).

### 12.4 — Observability & Monitoring

**Deliverables:**
- Structured logging with correlation IDs per request.
- Error tracking (Sentry or equivalent).
- Performance metrics dashboard (response times, error rates, DB query performance).
- Alerting on critical failures (exam session errors, database connectivity loss).

### 12.5 — Security Hardening

**Deliverables:**
- Rate limiting on all endpoints (especially auth and heartbeat).
- Request validation and input sanitization.
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- SQL injection prevention (already handled by SQLAlchemy ORM, but additional parameterization audits).
- CORS policy locked to allowed origins only.
- Secrets management (no hardcoded credentials, all via environment variables).
- Dependency vulnerability scanning (Dependabot or Snyk).

**Exit Criteria:**
- Load test passes: 500 concurrent simulated students with zero data loss.
- Full stack deploys from a single `docker-compose up` command.
- CI pipeline blocks broken code from reaching `main`.
- Sentry captures and alerts on unhandled exceptions.

---

## Future Features (Backlog)

These are logged as GitHub Issues and will be scheduled into Epochs as priorities evolve:

| Feature | GitHub Issue | Priority | Notes |
|---------|-------------|----------|-------|
| **Bulk Import Exam Parser** | [#1](https://github.com/DavidCvetkovski/ExamTakerEnvironment/issues/1) | High | Celery background task; paste raw text → auto-parse into ItemVersions |
| **LaTeX / KaTeX Math Rendering** | — | High | TipTap extension; critical for STEM exams |
| **Hotspot Questions** | — | Medium | Clickable image regions for anatomy/geography exams |
| **Drag-and-Drop / Ordering Questions** | — | Medium | Sortable list question type |
| **Item Bank Sharing & Collaboration** | — | Medium | Multi-professor access to shared banks across courses |
| **Peer Review Workflow** | — | Low | Students review each other's open-ended answers |
| **AI-Assisted Item Generation** | — | Low | LLM generates draft questions from learning objectives |
| **Mobile-Responsive Exam View** | — | Medium | Touch-friendly interface for tablet-based exams |
| **Offline Exam Mode** | — | Low | PWA with full offline capability for field assessments |
| **Export to QTI / Moodle Format** | — | Medium | Interoperability with other LMS platforms |
| **Plagiarism Detection for Essays** | — | Low | Integration with Turnitin or similar |
| **Multi-Language Support (i18n)** | — | Medium | Dutch + English interface localization |

---

## Feature Coverage Matrix

This matrix maps every major TestVision capability to its corresponding Epoch, ensuring nothing is missed:

| TestVision Capability | Epoch | Status |
|---|---|---|
| Item Bank with GUID | 2 | ✅ Done |
| Version Control (lineage preservation) | 2 | ✅ Done |
| Status Workflow (Draft → Approved → Retired) | 2 + 3 | 🔵 Partial |
| WYSIWYG Authoring | 2 | ✅ Done |
| Code Snippet Embedding | 2 | ✅ Done |
| LaTeX Math Rendering | Backlog | ⬜ Planned |
| Multimedia Resource Library | 8 | ⬜ Planned |
| Metadata Taxonomy (Bloom's, tags) | 4 | ⬜ Planned |
| Test Matrix / Blueprint | 4 | ⬜ Planned |
| Random Item Selection | 4 | ⬜ Planned |
| Session Instantiation (The Freeze) | 4 | ⬜ Planned |
| Time-Bound Sessions | 4 | ⬜ Planned |
| Timeline Navigator | 5 | ⬜ Planned |
| Question Flagging | 5 | ⬜ Planned |
| Direct Storage (Heartbeat) | 5 | ⬜ Planned |
| Session Recovery | 5 | ⬜ Planned |
| MCQ Auto-Grading | 6 | ⬜ Planned |
| Manual Grading UI | 6 | ⬜ Planned |
| Result Export (CSV/Osiris) | 6 | ⬜ Planned |
| Difficulty Index (P-value) | 7 | ⬜ Planned |
| Discrimination Index (D-value) | 7 | ⬜ Planned |
| Distractor Analysis | 7 | ⬜ Planned |
| Analytics Dashboard | 7 | ⬜ Planned |
| JWT Authentication | 3 | ⬜ Planned |
| RBAC (Constructor/Reviewer/Admin/Student) | 3 | ⬜ Planned |
| SSO / SURFconext | 3 | ⬜ Planned |
| Safe Exam Browser | 10 | ⬜ Planned |
| Supervisor Monitor | 10 | ⬜ Planned |
| LTI 1.3 Canvas Integration | 11 | ⬜ Planned |
| Osiris Grade Push | 11 | ⬜ Planned |
| Accessibility (WCAG 2.1 AA) | 9 | ⬜ Planned |
| Dyslexia Mode | 9 | ⬜ Planned |
| Extra Time Accommodations | 9 | ⬜ Planned |
| CDN Media Delivery | 8 | ⬜ Planned |
| Thundering Herd Handling | 12 | ⬜ Planned |
| Docker Deployment | 12 | ⬜ Planned |
| CI/CD Pipeline | 12 | ⬜ Planned |
