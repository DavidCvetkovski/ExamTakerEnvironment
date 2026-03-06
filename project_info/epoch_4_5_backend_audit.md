## Epoch 4.5 Backend Cohesion Audit

This document records the current state of the backend (FastAPI/FastSQLAlchemy side) as of the start of Epoch 4.5 and highlights the main cohesion / modularity / contract issues to address.

---

### 1. Structure Overview

- **Core:**
  - `backend/app/core/config.py`
  - `backend/app/core/database.py`
  - `backend/app/core/security.py`
  - `backend/app/core/dependencies.py`
- **Models:**
  - `backend/app/models/user.py`
  - `backend/app/models/item_bank.py`
  - `backend/app/models/learning_object.py`
  - `backend/app/models/item_version.py`
  - `backend/app/models/test_definition.py`
  - `backend/app/models/exam_session.py`
- **Schemas (Pydantic):**
  - `backend/app/schemas/auth.py`
  - `backend/app/schemas/learning_object.py`
  - `backend/app/schemas/item_version.py`
  - `backend/app/schemas/test_definition.py`
  - `backend/app/schemas/exam_session.py`
- **API endpoints (FastAPI routers):**
  - `backend/app/api/endpoints/auth.py`
  - `backend/app/api/endpoints/items.py`
  - `backend/app/api/endpoints/tests.py`
  - `backend/app/api/endpoints/sessions.py`

The layout is clean and matches the Epoch blueprints, but **domain logic is currently concentrated in the endpoint modules** rather than separated into services.

---

### 2. Exam Sessions & Accommodations

**Files inspected:**
- `backend/app/models/exam_session.py`
- `backend/app/schemas/exam_session.py`
- `backend/app/api/endpoints/sessions.py`
- `backend/tests/test_sessions.py`
- `backend/tests/test_accommodations.py`

**Findings:**

- **Business logic living in endpoints:**
  - `instantiate_session` in `sessions.py` implements:
    - The **Freeze** (selecting item versions from `TestDefinition` and `ItemVersion`).
    - Random vs fixed rule handling, including tag-based JSONB queries.
    - Time/accommodation logic (`provision_time_multiplier`, `expires_at`).
  - `get_exam_session` implements:
    - Expiration checks (`STARTED` → `EXPIRED`).
    - Multi-tenancy / authorization logic.
  - All of this resides inside the FastAPI route, making it harder to unit-test in isolation and reuse.

- **Model/schema alignment:**
  - `ExamSession` model:
    - `items` JSONB field stores the frozen item snapshots.
    - `status`, `started_at`, `expires_at`, `submitted_at` fields match the intended lifecycle.
  - `ExamSessionResponse` schema:
    - Exposes `id`, `items`, `started_at`, `submitted_at`, `expires_at`, `status`, `test_definition_id`, `student_id`.
  - `useExamStore` on the frontend treats these fields consistently (stringified datetimes).
  - **Conclusion:** contracts are overall well-aligned, but they are implicit (no single place documenting the JSON shape of `items`).

- **Test coverage:**
  - `test_sessions.py`:
    - Covers instantiation, the Freeze behavior, and unauthorized access.
    - Validates that new `ItemVersion`s do not affect an existing session.
  - `test_accommodations.py`:
    - Covers time multiplier application (1.0 vs 1.25).
    - Covers auto-expiration upon retrieval.
  - **Gap:** tests exercise HTTP endpoints rather than a dedicated service layer; there are no smaller, service-level tests.

**Refactor targets (Ranked):**
1. **Extract an `exam_sessions_service` module**:
   - Performs selection/freeze, time calculations, and authorization.
   - Endpoints delegate to this service and become thin.
2. **Document the `items` JSON structure** in one canonical place (e.g., docstring in model, or a `contracts.md`) to de-risk future changes.
3. **Add service-level tests** independent of FastAPI, using SQLAlchemy session fixtures.

---

### 3. Test Definition / Blueprint Engine

**Files inspected:**
- `backend/app/api/endpoints/tests.py`
- `backend/app/models/test_definition.py`
- `backend/app/schemas/test_definition.py` (structure inferred from usage)
- `backend/tests/test_test_matrix.py`

**Findings:**

- **Endpoint responsibilities:**
  - `create_test_definition`, `update_test_definition`:
    - Perform simple mapping from Pydantic DTOs to the JSONB `blocks` field.
    - Directly manage DB session interactions.
  - `validate_test_blueprint`:
    - Implements core **validation logic**:
      - Iterates blocks and rules.
      - Performs tag-based queries on `ItemVersion.metadata_tags`.
      - Calculates `matching_count` for RANDOM rules.
      - Builds a structured validation response (`blocks[*].rule_validation[*]`).
    - This logic lives entirely inside the endpoint function.

- **Validation contract:**
  - Response shape:
    - `{"valid": bool, "blocks": [{ "title": str, "rule_validation": [ { "rule": str, "valid": bool, "matching_count"?: int, "reason": str } ] }]}`
  - `backend/tests/test_test_matrix.py` asserts:
    - Per-rule `valid` flags and overall `valid`.
    - Under-provisioning scenarios (random rule requesting more items than exist).
  - **Contract is sound but not explicitly documented outside the test and code.**

**Refactor targets (Ranked):**
1. **Extract a `blueprints_service` module**:
   - Encapsulates creation/update and validation logic.
   - Accepts DTO-like inputs and a DB session, returns domain objects or DTOs.
2. **Explicitly type the validation response**:
   - Either a Pydantic response schema or well-documented dict structure in `schemas/test_definition.py`.
3. **Add service-level tests**:
   - For rule validation, to complement `test_test_matrix.py`.

---

### 4. Cross-Cutting Concerns & Contracts

**Findings:**

- **Auth & RBAC:**
  - `require_role` in `core/dependencies.py` is used in `tests.py` (blueprints) to enforce constructor/admin roles.
  - `sessions.py` currently uses a manual role check for viewing sessions.
  - There is some inconsistency in how RBAC rules are applied (helpers vs inlined checks).

- **Error handling:**
  - Most errors use `HTTPException` with `detail` strings.
  - There is no shared error envelope or helper, but the current shape is simple and matches frontend expectations (strings in `response.data.detail`).

- **Logging:**
  - No visible centralized logging helper for critical flows.
  - Debugging is primarily via tests; runtime tracing in dev would benefit from structured logs at session instantiation and validation points.

**Refactor targets (Ranked):**
1. **Standardize RBAC checks**:
   - Prefer dependency helpers (`require_role`) over inline role checks where practical.
2. **Introduce a small logging helper** in `core/`:
   - Provide consistent structured logs for:
     - Session instantiation (selected items, durations).
     - Blueprint validation summaries.
3. **Optionally standardize error envelope**:
   - Keep current simplicity but document expectations (e.g., `{"detail": "...message..."}`) in contracts docs.

---

### 5. Summary of Highest-Impact Backend Changes for Epoch 4.5

1. **Create a dedicated `services/` layer**:
   - `exam_sessions_service.py` and `blueprints_service.py` as first-class modules.
   - Move Freeze logic, time/accommodations, and validation there.
2. **Thin the FastAPI route functions**:
   - Keep them focused on HTTP concerns (status codes, dependency injection) and minimal orchestration.
3. **Capture contracts explicitly**:
   - Document the JSON structure for:
     - Exam item snapshots inside `ExamSession.items`.
     - Validation responses for blueprint rules.
4. **Add service-level tests**:
   - Cover core decision paths independent of HTTP wiring.
5. **Add lightweight observability**:
   - Introduce logging and standardized RBAC helpers on critical flows.

