## Epoch 4.5: Cohesion, Refactor & Integration Hardening

### Overview

**Goal:** Make the existing Epoch 1–5 functionality cohesive, modular, and easy to extend, with robust cross-feature behavior. Epoch 4.5 is a hardening pass, not a feature epoch: we focus on structure, contracts, debugging, and integration quality.

**Prerequisites:** Epochs 1–4 implemented; core flows exist for:
- Authoring and item versioning (Epoch 2).
- Authentication and RBAC (Epoch 3).
- Blueprint engine and exam sessions with accommodations (Epoch 4).
- Student exam UI (Epoch 5, basic form).

**Non-goals:**
- No major net-new features.
- Only light “glue” or observability features are allowed if required for debugging or cohesion.

---

### Phase 0 – Close Out Epoch 4 Stage 4

**Reference:** `directives/epoch_4_blueprint.md` → “Stage 4: Time Blocks & Accommodations” and “Stage 4: Integration Tests & UI Polish”.

**Objective:** Ensure Epoch 4 is genuinely complete before layering on refactors.

**Tasks:**
- **Backend test coverage:**
  - Confirm `backend/tests/test_test_matrix.py`:
    - Validates random rule under-provisioning (400 when a rule requests more items than exist).
    - Validates per-rule status in `/tests/{id}/validate` responses (already partially implemented).
  - Confirm and, if needed, extend:
    - `backend/tests/test_sessions.py` to cover freeze semantics and unauthorized access.
    - `backend/tests/test_accommodations.py` to cover:
      - Correct application of `provision_time_multiplier` in `expires_at`.
      - Auto-expiration on retrieval when `expires_at` is in the past.
- **UI polish for starting an exam:**
  - Make the constructor → student path for starting a test cohesive:
    - Blueprint creation in `/blueprint`.
    - Clean, discoverable “Start Test” flow that ends at `/exam/[id]`.
  - Add minimal UX feedback (loading/error states) so this flow feels complete and testable for E2E.

**Exit Criteria:**
- All Stage 4 tests in the Epoch 4 blueprint are implemented and passing.
- There is a clear, tested UI path from a saved blueprint to an instantiated exam session for a student.

---

### Phase 1 – Architecture & Consistency Audit

**Objective:** Identify structural and naming inconsistencies that make the system harder to reason about or extend.

**Backend audit:**
- Review `backend/app`:
  - `api/endpoints/` (auth, items, tests, sessions).
  - `models/` (user, test_definition, exam_session, item_version, learning_object, item_bank).
  - `schemas/` (auth, exam_session, test_definition, item_version, learning_object).
  - `core/` (config, security, dependencies, database).
- Produce a short checklist (stored in `project_info/epoch_4_5_backend_audit.md`) capturing:
  - Where business rules are embedded directly in endpoints.
  - Any duplicate logic across endpoints.
  - DTO ↔ model mismatches for key entities (`TestDefinition`, `ExamSession`, accommodations).

**Frontend audit:**
- Review `frontend/src`:
  - `app/` pages: `items`, `author`, `blueprint`, `exam/[id]`, `login`, root.
  - `stores/`: `useAuthoringStore`, `useBlueprintStore`, `useExamStore`, `useAuthStore`, `useLibraryStore`.
  - `components/`: editor components, `ProtectedRoute`, shared layout.
  - `lib/api.ts`: HTTP client and helpers.
- Produce `project_info/epoch_4_5_frontend_audit.md` summarizing:
  - Where pages contain heavy imperative logic or raw `fetch` calls.
  - Inconsistent store patterns (mixed DTO and view state).
  - Repeated UI patterns suitable for component extraction.

**Exit Criteria:**
- Two short audit documents exist under `project_info/`.
- A concrete list of 5–10 high-impact refactor targets (ranked) is agreed and used to scope Phases 2–3.

---

### Phase 2 – Backend Refactor for Modularity & Testability

**Objective:** Move core business logic out of FastAPI endpoint functions into explicit service modules, with clear contracts and tests.

**2.1 Introduce service layer modules**
- Create `backend/app/services/` with modules such as:
  - `exam_sessions_service.py`:
    - Session instantiation (“Freeze”): selecting item versions from `TestDefinition` + `ItemVersion`.
    - Time/accommodation logic (`provision_time_multiplier`, `expires_at`, status transitions).
    - Authorization checks for accessing sessions.
  - `blueprints_service.py`:
    - Creation/update of `TestDefinition`.
    - Rule validation and `/tests/{id}/validate` behavior.
  - (Optional, time permitting) `authoring_service.py` and `auth_service.py` for more cohesive domains.
- Refactor endpoints in:
  - `backend/app/api/endpoints/sessions.py`
  - `backend/app/api/endpoints/tests.py`
  - to defer heavy logic to these services, keeping route functions thin.

**2.2 Standardize schemas and contracts**
- Ensure Pydantic schemas in `backend/app/schemas/` match what the frontend actually consumes:
  - `ExamSessionResponse`: `id`, `test_definition_id`, `items[*]` snapshot, `started_at`, `expires_at`, `status`.
  - `TestDefinition` schemas: `title`, `blocks`, `duration_minutes`, any shuffle flags.
- Document, per endpoint used by the frontend:
  - Request DTO.
  - Response DTO.
  - Error shapes and HTTP codes.
- Optionally add a small “contract notes” section at the top of relevant schema files or a shared `contracts.md` in `project_info/`.

**2.3 Harden accommodations and time logic**
- Centralize:
  - Calculation of total minutes and `expires_at`.
  - Expiration checks and automatic status updates (`STARTED` → `EXPIRED`).
- Complement `backend/tests/test_accommodations.py` and `backend/tests/test_sessions.py` with:
  - Service-level tests that do not require HTTP wiring.
  - Edge cases (zero/invalid multipliers, near-boundary timestamps) as time permits.

**2.4 Error handling and logging**
- Introduce a lightweight logging helper in `backend/app/core/`:
  - Consistent logging format (endpoint, user id/role when available, session/test ids).
  - Debug-level logs around:
    - Session instantiation and item selection.
    - Accommodation multipliers and resulting durations.
    - Validation failures in `/tests/{id}/validate`.
- Ensure endpoints return predictable error envelopes and status codes for the frontend.

**Exit Criteria:**
- Exam session and blueprint logic live primarily in `services/`, with endpoints delegating.
- New or updated tests verify service behavior without going through FastAPI.
- Error and logging patterns are consistent on the main exam flows.

---

### Phase 3 – Frontend Cohesion & Reuse

**Objective:** Make exam- and blueprint-related UI easier to reason about by centralizing API calls, normalizing state management, and extracting shared components.

**3.1 Centralize API usage in `lib/api.ts`**
- Ensure all API calls from pages/stores go through `frontend/src/lib/api.ts`.
- Expose typed helpers for:
  - Auth flows.
  - Learning object and item listing.
  - TestDefinition creation, update, validation.
  - ExamSession instantiation and retrieval.
- Normalize error behavior:
  - Either consistently throw, or consistently return a `Result<T, ApiError>`-style object.

**3.2 Normalize Zustand stores**
- For `useAuthoringStore`, `useBlueprintStore`, `useExamStore`, `useAuthStore`, `useLibraryStore`:
  - Separate:
    - Server data (DTOs mirrored from backend).
    - View/UI state (selected ids, modal open flags, etc.).
  - Expose actions that internally call `lib/api.ts` helpers.
  - Remove stray `fetch` calls or ad-hoc HTTP from components/pages where they duplicate store responsibilities.

**3.3 Thin pages, rich hooks/components**
- Refactor key pages:
  - `/blueprint`
  - `/exam/[id]`
  - `/items`
  - `/author`
- Move orchestration (fetching, reacting to changes, navigation on success) into custom hooks such as:
  - `useBlueprintEditor()`
  - `useExamSession(sessionId)`
- Extract repeated UI patterns (panels, timers, badges, button styles) into small presentational components to reduce duplication.

**3.4 UX polish strictly for clarity**
- Within the timebox, only make UI changes that:
  - Improve error and loading feedback.
  - Make it clearer when data is frozen (`ExamSession` items, immutable versions).
  - Help debug issues (e.g., show key ids or timing info in dev-only labels if helpful).

**Exit Criteria:**
- Pages are primarily composition + layout.
- Stores and `lib/api.ts` encapsulate the bulk of the logic for exam and blueprint interactions.
- The constructor and student flows feel consistent in loading/error behavior.

---

### Phase 4 – Cross-Layer Contracts & Type Alignment

**Objective:** Align mental models and types for key entities across backend and frontend.

**4.1 Canonical shapes (conceptual)**
- Define canonical shapes for:
  - `User` (id, email, role, `provision_time_multiplier`).
  - `LearningObject` and `ItemVersion`.
  - `TestDefinition` (blocks, rules, duration, configuration).
  - `ExamSession` (id, test_definition_id, items snapshot, status, started_at, expires_at).
- Keep these definitions in a dev-facing markdown file under `project_info/epoch_4_5_contracts.md`.

**4.2 Alignment across stack**
- Ensure:
  - Backend schemas (Pydantic) line up with these shapes.
  - Frontend TypeScript interfaces reflect the same structure.
- Where divergences are required (e.g., derived fields or view-specific fields), document them explicitly.

**Exit Criteria:**
- A single markdown reference of canonical types exists.
- No major surprises when moving between backend models, schemas, and frontend interfaces for the core entities.

---

### Phase 5 – Debugging & Observability

**Objective:** Provide a disciplined way to trace and debug the main flows without ad-hoc print-debugging.

**5.1 Debugging checklists**
- For each cross-epoch flow, create a short checklist:
  - **Authoring flow:** item creation → versioning → approval.
  - **Blueprint flow:** blueprint creation → validation.
  - **Session flow:** session instantiation (freeze) → expiration behavior → role-based access.
  - **Exam-taking flow:** student login → exam start from blueprint → timer display.
- Each checklist includes:
  - Endpoints and services involved.
  - Expected DB changes (tables, fields).
  - Frontend views/stores touched.

**5.2 Observability improvements**
- Use the logging helper (Phase 2.4) to emit structured logs for:
  - Session instantiation (selected item versions, total minutes, user id).
  - Accommodation application and resulting `expires_at`.
  - Validation failures in blueprint rules.
- Optionally add a development “debug mode” toggle (e.g., env flag) to increase verbosity without affecting production defaults.

**Exit Criteria:**
- Written checklists in `project_info/` for the main flows.
- Log output clearly tells the story of a typical end-to-end run in development.

---

### Phase 6 – Integration & Cross-Feature Testing

**Objective:** Move beyond isolated unit tests and ensure features work correctly together across layers.

**6.1 Backend integration tests**
- Extend pytest suites with integration tests that exercise multiple endpoints and services, for example:
  - Create items → approve items → create blueprint → validate → instantiate session → verify frozen items and time logic.
  - Role-based scenarios: admin vs constructor vs student on the same endpoint sequences.
- Build on and not duplicate:
  - `backend/tests/test_test_matrix.py`
  - `backend/tests/test_sessions.py`
  - `backend/tests/test_accommodations.py`

**6.2 Frontend E2E flows**
- Based on `frontend/tests/e2e/exam-flow.spec.ts`, add E2E scenarios to:
  - Verify constructor + student flows, including accommodations, for different blueprints.
  - Surface meaningful UX errors when validation fails (e.g., under-provisioned random rules).
  - Confirm that blueprints created in the UI correspond to expected sessions in the backend.

**6.3 Minimal regression gate**
- Define a small but representative regression suite that must be green before future epochs:
  - Backend integration tests covering authoring → blueprint → session.
  - Frontend E2E tests covering constructor and student journeys.
  - Auth/RBAC smoke tests.

**Exit Criteria:**
- A named set of “must-pass” tests is documented (and can be scripted) as the verification gate after Epoch 4.5.

---

### Git Strategy for Epoch 4.5

**Branching:**
- Finish any remaining Epoch 4 Stage 4 work on `feature/epoch-4-matrix` (current branch), ensuring all Stage 4 tests and UI polish are complete and merged to `main`.
- Create a dedicated branch for this epoch:
  - `git checkout -b feature/epoch-4-5-cohesion` (from `main` once Epoch 4 is merged).

**Committing:**
- Follow the Stage-Gate commit model from `directives/epoch_git_strategy.md`:
  - Examples:
    - `refactor(backend): extract exam session service layer`
    - `refactor(frontend): centralize exam api client usage`
    - `test(integration): cover authoring to session lifecycle`
- Only commit after:
  - Relevant pytest suites pass for backend changes.
  - `npm test` / Playwright E2E passes for frontend integration changes when applicable.

**Merging:**
- Once all phases planned for Epoch 4.5 are complete and the regression suite (Phase 6.3) is green:
  - `git push origin feature/epoch-4-5-cohesion`
  - `git checkout main`
  - `git merge feature/epoch-4-5-cohesion`
  - `git push origin main`

