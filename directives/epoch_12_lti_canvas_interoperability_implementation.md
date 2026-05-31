# Epoch 12 - LTI 1.3, Canvas Integration & Interoperability Implementation

> **Status:** Proposed implementation directive. Per `AGENTS.md` section 6, this file is the required blueprint before implementation work begins.
> **Branch:** `epoch-12-lti-canvas-interoperability`
> **Depends on:** Epoch 3 auth/RBAC/JWT, Epoch 5 exam-taking flow, Epoch 6 grading/results, Epoch 8.x blueprint and course association work, Epoch 8.9.1 course enrolment, Epoch 9 account/session hygiene, Epoch 10 accommodations CSV import groundwork.
> **Primary objective:** Make OpenVision interoperable with institutional platforms, especially Canvas through LTI 1.3 Advantage, while preserving OpenVision's internal security, course ownership, exam integrity, and auditability.

## 1. Executive Summary

Epoch 12 connects OpenVision to the outside world.

The core product already has users, courses, scheduled exams, exam attempts, grading, results, accommodations, and analytics. What it does not yet have is a secure bridge into the systems universities actually use to launch exams, manage rosters, and receive grades. This epoch adds that bridge in three layers:

1. **LTI 1.3 Advantage for Canvas**: secure OIDC launch, user linking, course/context mapping, resource-link mapping, deep linking, and Assignment & Grade Services passback.
2. **SIS/Osiris interoperability**: CSV roster import, accommodation import, grade export, and a future-ready API push boundary.
3. **QTI 2.1 import/export**: portable item/test packages so OpenVision does not trap content inside its own schema.

The danger in this epoch is not just "does Canvas open the exam." The danger is accidental privilege escalation, grade leakage, accepting forged launches, importing unsafe content, overwriting the wrong student, or pushing a grade into the wrong Canvas assignment. The design therefore treats every integration boundary as hostile until validated.

Epoch 12 should leave OpenVision with:

- A registered Canvas platform admin surface.
- A proper LTI OIDC login initiation and launch validation flow.
- A stable mapping between external platform users and OpenVision users.
- A stable mapping between Canvas resource links and OpenVision scheduled exams/test definitions.
- Deep linking so instructors can place OpenVision exams into Canvas assignments.
- AGS grade passback after grading and manual retry when a push fails.
- SIS roster/accommodation CSV import with row-level validation and audit.
- Osiris-compatible grade CSV export.
- QTI 2.1 package export and import with sanitization, validation, and loss reports.
- Integration audit logs that let admins answer: who launched, who linked, who imported, who exported, and what grade was sent where.

## 2. Non-Negotiable Engineering Constraints

This epoch touches authentication, authorization, student identity, grade records, file import, and XML parsing. The implementation must be conservative.

### 2.1 Security

- Never trust LTI launch parameters until the OIDC `id_token` is verified against the platform JWKS.
- Never trust `roles` claims from an unregistered issuer/client/deployment.
- Validate `iss`, `aud`, `azp` where present, `exp`, `iat`, `nonce`, `state`, `deployment_id`, `message_type`, and target link URI.
- Store LTI OIDC state and nonce server-side or in a signed, encrypted, short-lived store. Do not rely on client-only state.
- Require deployment registration before accepting any LTI launch.
- Enforce least privilege after launch: LTI students become OpenVision students; LTI instructors become constructors only in the launched context unless already admin.
- Do not grant global admin from LTI roles.
- Do not create or map a user by email alone unless the issuer and platform subject are verified.
- Do not accept grade passback destinations from the browser.
- Do not push grades unless the result belongs to the same mapped LTI resource link and student.
- Sanitize all HTML imported through QTI with the same frontend/backend sanitization posture used for authored content.
- Parse XML with XXE disabled and external entity resolution blocked.
- CSV imports must validate headers, row count, file size, encoding, role values, VUnetID format, email format, course existence, and duplicate identities.
- Every admin integration endpoint must require `ADMIN`; instructor-level deep-link actions require constructor/admin and verified LTI context.
- Secrets and private keys live in `.env` or encrypted database fields. Never hardcode platform credentials.
- Integration audit logs are append-only.

### 2.2 Maintainability

- Use feature-scoped modules: `lti`, `sis`, and `qti`.
- Keep route handlers thin: parse/validate, authorize, call services, return typed response.
- Put OIDC/JWT validation in one service, not scattered through endpoints.
- Put Canvas AGS client behavior in one client module with typed request/response wrappers.
- Put QTI mapping in focused converters. Do not mix XML walking with database writes in the same function.
- All public backend functions added by this epoch need docstrings.
- TypeScript UI/API types must be explicit; avoid `any`.
- Use structured row result types for imports instead of free-form strings.
- No placeholder TODOs in committed code. If work is deferred, capture it in this directive or `directives/todo.md`.

### 2.3 Modularity

Recommended backend layout:

```text
backend/app/api/endpoints/lti.py
backend/app/api/endpoints/sis.py
backend/app/api/endpoints/qti.py
backend/app/models/lti.py
backend/app/models/integration_audit.py
backend/app/schemas/lti.py
backend/app/schemas/sis.py
backend/app/schemas/qti.py
backend/app/services/lti/__init__.py
backend/app/services/lti/claims.py
backend/app/services/lti/deep_linking_service.py
backend/app/services/lti/grade_passback_service.py
backend/app/services/lti/jwks_service.py
backend/app/services/lti/launch_service.py
backend/app/services/lti/platform_client.py
backend/app/services/lti/platform_service.py
backend/app/services/sis/__init__.py
backend/app/services/sis/grade_export_service.py
backend/app/services/sis/roster_import_service.py
backend/app/services/qti/__init__.py
backend/app/services/qti/export_service.py
backend/app/services/qti/import_service.py
backend/app/services/qti/package.py
backend/app/services/qti/sanitizer.py
```

Recommended frontend layout:

```text
frontend/src/app/integrations/page.tsx
frontend/src/app/lti/launch/page.tsx
frontend/src/components/integrations/LtiPlatformForm.tsx
frontend/src/components/integrations/LtiPlatformTable.tsx
frontend/src/components/integrations/SisImportPanel.tsx
frontend/src/components/integrations/QtiImportExportPanel.tsx
frontend/src/stores/useIntegrationStore.ts
frontend/src/lib/integrations.ts
frontend/src/lib/integrations.types.ts
```

### 2.4 Scalability

- LTI launch validation must be fast and cache JWKS by issuer URL with TTL.
- Grade passback should be asynchronous/retryable once Epoch 13 workers exist; for Epoch 12 implement a durable retry table and a manual retry endpoint.
- CSV and QTI imports must be bounded by file size and row/item count.
- Bulk imports must use batch operations where possible.
- Grade exports must be paginated/streamed for large sessions.
- QTI import should stage parsed items before commit so one invalid item does not silently corrupt the bank.

### 2.5 Industry Standards

- Implement LTI 1.3 and LTI Advantage concepts using the standard OIDC launch, Deep Linking, and Assignment & Grade Services vocabulary.
- Use signed JWT validation through vetted libraries.
- Use `PyLTI1p3` if it fits the current FastAPI architecture. If it does not, use lower-level JOSE/JWKS validation but preserve the same spec checks and document the choice.
- Use proper HTTP status codes.
- Use Conventional Commits.
- Add happy-path, edge-case, integration, and security tests.
- Add a manual security review before merge.

## 3. Current System Baseline

### 3.1 Existing Useful Surfaces

Backend:

- Auth/RBAC: `backend/app/core/dependencies.py`
- Auth routes: `backend/app/api/endpoints/auth.py`
- Courses: `backend/app/api/endpoints/courses.py`, `backend/app/services/courses_service.py`
- Scheduled sessions: `backend/app/api/endpoints/scheduled_sessions.py`, `backend/app/services/scheduled_sessions_service.py`
- Student session join: `backend/app/api/endpoints/student_sessions.py`
- Grading/results: `backend/app/api/endpoints/grading.py`, `backend/app/services/grading_service.py`, `backend/app/services/results_service.py`
- Accommodations: `backend/app/api/endpoints/accommodations.py`, `backend/app/services/accommodations_service.py`
- Import parser for authored content: `backend/app/services/import_service/`
- Prisma schema: `prisma/schema.prisma`

Frontend:

- Session management page: `frontend/src/app/sessions/page.tsx`
- Import page: `frontend/src/app/import/page.tsx`
- Blueprint page: `frontend/src/app/blueprint/page.tsx`
- Grading page: `frontend/src/app/grading/page.tsx`
- API client: `frontend/src/lib/api.ts`
- Stores: `frontend/src/stores/`

### 3.2 Existing Gaps

- No LTI platform registrations.
- No tool JWKS endpoint.
- No OIDC login initiation endpoint.
- No LTI launch endpoint.
- No persistent external identity mapping.
- No Canvas resource-link mapping to OpenVision tests/scheduled sessions.
- No deep-linking response flow.
- No AGS line item or score passback.
- No SIS import/export module.
- No QTI package parser/exporter.
- No integration audit log.

## 4. Scope

| ID | Deliverable | Surfaces |
|---|---|---|
| F1 | LTI platform registration and tool key management | DB, admin UI, JWKS endpoint |
| F2 | LTI OIDC login initiation and launch validation | Backend endpoints, launch service, tests |
| F3 | External user/context/resource mapping | DB, services, LTI launch flow |
| F4 | Canvas launch-to-exam student experience | Backend session handoff, frontend launch route |
| F5 | Deep Linking | Backend deep-link response, frontend instructor picker |
| F6 | Assignment & Grade Services passback | AGS client, result hooks, retry UI |
| F7 | SIS/Osiris roster and accommodation import | CSV parser, service, audit, admin UI |
| F8 | Osiris-compatible grade export | CSV export endpoint, filters, audit |
| F9 | QTI 2.1 export | XML/package generator, export endpoint |
| F10 | QTI 2.1 import | Safe XML parser, mapper, validation report |
| F11 | Integration audit and observability | Audit table, logs, metrics hooks |
| F12 | Tests and security review | Pytest, frontend tests, fixtures, manual review |

## 5. Out of Scope

- Full Canvas admin API course provisioning beyond LTI Advantage.
- Live Osiris API integration unless credentials and API contract are provided.
- Moodle/Blackboard-specific LTI quirks beyond standards-compliant launches.
- SCORM/xAPI.
- QTI 3.0.
- Proctoring/SEB enforcement.
- High-scale worker queueing, except where grade passback retry tables are needed. Epoch 13 owns generalized workers.
- Automatic production deployment.

## 6. Data Model

Prisma remains the source of truth. Additive schema changes only unless explicitly approved.

### 6.1 LTI Platform Registration

```prisma
model lti_platforms {
  id                  String   @id @default(uuid()) @db.Uuid
  name                String   @db.VarChar
  issuer              String   @db.VarChar
  client_id           String   @db.VarChar
  auth_login_url      String   @db.VarChar
  auth_token_url      String   @db.VarChar
  auth_jwks_url       String   @db.VarChar
  deployment_ids      Json
  canvas_base_url     String?  @db.VarChar
  is_active           Boolean  @default(true)
  created_at          DateTime @default(now()) @db.Timestamp(6)
  updated_at          DateTime? @db.Timestamp(6)
  created_by          String?  @db.Uuid

  deployments         lti_deployments[]
  user_links          lti_user_links[]
  resource_links      lti_resource_links[]
  launch_audits       lti_launch_audits[]

  @@unique([issuer, client_id], map: "uq_lti_platform_issuer_client")
  @@index([issuer], map: "ix_lti_platforms_issuer")
  @@index([is_active], map: "ix_lti_platforms_is_active")
}
```

### 6.2 LTI Deployments

Use a deployment table even if `deployment_ids` is also stored in JSON for admin convenience. Deployment-level rows make authorization and resource mapping easier.

```prisma
model lti_deployments {
  id                 String   @id @default(uuid()) @db.Uuid
  platform_id        String   @db.Uuid
  deployment_id      String   @db.VarChar
  label              String?  @db.VarChar
  is_active          Boolean  @default(true)
  created_at         DateTime @default(now()) @db.Timestamp(6)
  platform           lti_platforms @relation(fields: [platform_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  resource_links     lti_resource_links[]

  @@unique([platform_id, deployment_id], map: "uq_lti_deployment_platform_deployment")
  @@index([deployment_id], map: "ix_lti_deployments_deployment_id")
}
```

### 6.3 Tool Key Pairs

The OpenVision tool needs a private key for LTI service authentication and a public JWKS endpoint for platforms.

```prisma
model lti_tool_keys {
  id                    String   @id @default(uuid()) @db.Uuid
  kid                   String   @unique @db.VarChar
  public_jwk            Json
  encrypted_private_jwk String   @db.Text
  algorithm             String   @default("RS256") @db.VarChar
  is_active             Boolean  @default(true)
  created_at            DateTime @default(now()) @db.Timestamp(6)
  rotated_at            DateTime? @db.Timestamp(6)

  @@index([is_active], map: "ix_lti_tool_keys_is_active")
}
```

Security:

- Private JWK must be encrypted at rest using an application encryption key from `.env`.
- Never return private key material through API responses.
- JWKS endpoint returns only active public keys.

### 6.4 External User Links

```prisma
model lti_user_links {
  id              String   @id @default(uuid()) @db.Uuid
  platform_id     String   @db.Uuid
  issuer          String   @db.VarChar
  subject         String   @db.VarChar
  user_id         String   @db.Uuid
  email           String?  @db.VarChar
  name            String?  @db.VarChar
  last_roles      Json?
  last_launch_at  DateTime? @db.Timestamp(6)
  created_at      DateTime @default(now()) @db.Timestamp(6)
  platform        lti_platforms @relation(fields: [platform_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  user            users @relation(fields: [user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([issuer, subject], map: "uq_lti_user_links_issuer_subject")
  @@index([user_id], map: "ix_lti_user_links_user_id")
  @@index([platform_id], map: "ix_lti_user_links_platform_id")
}
```

Identity rule:

- The canonical external key is `(issuer, subject)`, not email.
- Email can update the local user email only under a controlled admin-reviewed policy. Default behavior: preserve existing OpenVision email once linked.

### 6.5 Context Mapping

Canvas course/context IDs should map to OpenVision courses.

```prisma
model lti_context_links {
  id              String   @id @default(uuid()) @db.Uuid
  platform_id     String   @db.Uuid
  deployment_id   String   @db.Uuid
  context_id      String   @db.VarChar
  context_label   String?  @db.VarChar
  context_title   String?  @db.VarChar
  course_id       String?  @db.Uuid
  created_at      DateTime @default(now()) @db.Timestamp(6)
  updated_at      DateTime? @db.Timestamp(6)
  platform        lti_platforms @relation(fields: [platform_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  deployment      lti_deployments @relation(fields: [deployment_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  course          courses? @relation(fields: [course_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([platform_id, deployment_id, context_id], map: "uq_lti_context_platform_deployment_context")
  @@index([course_id], map: "ix_lti_context_links_course_id")
}
```

### 6.6 Resource Link Mapping

```prisma
model lti_resource_links {
  id                    String   @id @default(uuid()) @db.Uuid
  platform_id            String   @db.Uuid
  deployment_id          String   @db.Uuid
  context_link_id        String?  @db.Uuid
  resource_link_id       String   @db.VarChar
  resource_title         String?  @db.VarChar
  test_definition_id     String?  @db.Uuid
  scheduled_session_id   String?  @db.Uuid
  line_item_url          String?  @db.VarChar
  line_item_id           String?  @db.VarChar
  score_maximum          Float?
  created_at             DateTime @default(now()) @db.Timestamp(6)
  updated_at             DateTime? @db.Timestamp(6)
  platform               lti_platforms @relation(fields: [platform_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  deployment             lti_deployments @relation(fields: [deployment_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  context_link           lti_context_links? @relation(fields: [context_link_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  test_definition        test_definitions? @relation(fields: [test_definition_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  scheduled_session      scheduled_exam_sessions? @relation(fields: [scheduled_session_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  grade_passbacks        lti_grade_passbacks[]

  @@unique([platform_id, deployment_id, resource_link_id], map: "uq_lti_resource_platform_deployment_resource")
  @@index([test_definition_id], map: "ix_lti_resource_links_test_definition_id")
  @@index([scheduled_session_id], map: "ix_lti_resource_links_scheduled_session_id")
}
```

Rule:

- A resource link may point to a test definition for instructor preview/deep-link setup or to a scheduled session for student launch. Student launches require a scheduled session unless the product explicitly allows practice/ad-hoc launches.

### 6.7 Launch Audit

```prisma
model lti_launch_audits {
  id                String   @id @default(uuid()) @db.Uuid
  platform_id       String?  @db.Uuid
  issuer            String   @db.VarChar
  subject           String?  @db.VarChar
  user_id           String?  @db.Uuid
  deployment_id     String?  @db.VarChar
  context_id        String?  @db.VarChar
  resource_link_id  String?  @db.VarChar
  message_type      String?  @db.VarChar
  status            String   @db.VarChar
  failure_reason    String?  @db.VarChar
  request_id        String?  @db.VarChar
  created_at        DateTime @default(now()) @db.Timestamp(6)
  platform          lti_platforms? @relation(fields: [platform_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  user              users? @relation(fields: [user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([issuer], map: "ix_lti_launch_audits_issuer")
  @@index([user_id], map: "ix_lti_launch_audits_user_id")
  @@index([created_at], map: "ix_lti_launch_audits_created_at")
  @@index([status], map: "ix_lti_launch_audits_status")
}
```

### 6.8 Grade Passback Records

```prisma
model lti_grade_passbacks {
  id                  String   @id @default(uuid()) @db.Uuid
  resource_link_id    String   @db.Uuid
  session_result_id   String   @db.Uuid
  student_user_id     String   @db.Uuid
  platform_user_sub   String   @db.VarChar
  line_item_url       String   @db.VarChar
  score_given         Float
  score_maximum       Float
  activity_progress   String   @db.VarChar
  grading_progress    String   @db.VarChar
  status              String   @db.VarChar
  attempts            Int      @default(0)
  last_error          String?  @db.Text
  last_attempt_at     DateTime? @db.Timestamp(6)
  pushed_at           DateTime? @db.Timestamp(6)
  created_at          DateTime @default(now()) @db.Timestamp(6)
  resource_link       lti_resource_links @relation(fields: [resource_link_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  session_result      session_results @relation(fields: [session_result_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  student             users @relation(fields: [student_user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([resource_link_id, session_result_id], map: "uq_lti_grade_passback_resource_result")
  @@index([status], map: "ix_lti_grade_passbacks_status")
  @@index([student_user_id], map: "ix_lti_grade_passbacks_student_user_id")
}
```

### 6.9 SIS Import and Export Jobs

```prisma
model sis_import_jobs {
  id            String   @id @default(uuid()) @db.Uuid
  import_type   String   @db.VarChar
  filename      String   @db.VarChar
  status        String   @db.VarChar
  total_rows    Int      @default(0)
  success_rows  Int      @default(0)
  error_rows    Int      @default(0)
  created_by    String   @db.Uuid
  created_at    DateTime @default(now()) @db.Timestamp(6)
  completed_at  DateTime? @db.Timestamp(6)
  rows          sis_import_job_rows[]
  user          users @relation(fields: [created_by], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([created_by], map: "ix_sis_import_jobs_created_by")
  @@index([created_at], map: "ix_sis_import_jobs_created_at")
}

model sis_import_job_rows {
  id          String   @id @default(uuid()) @db.Uuid
  job_id      String   @db.Uuid
  row_number  Int
  status      String   @db.VarChar
  message     String?  @db.Text
  raw_data    Json
  created_at  DateTime @default(now()) @db.Timestamp(6)
  job         sis_import_jobs @relation(fields: [job_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([job_id], map: "ix_sis_import_job_rows_job_id")
  @@index([status], map: "ix_sis_import_job_rows_status")
}
```

### 6.10 QTI Jobs

```prisma
model qti_jobs {
  id            String   @id @default(uuid()) @db.Uuid
  job_type      String   @db.VarChar
  filename      String?  @db.VarChar
  status        String   @db.VarChar
  total_items   Int      @default(0)
  success_items Int      @default(0)
  error_items   Int      @default(0)
  report        Json?
  created_by    String   @db.Uuid
  created_at    DateTime @default(now()) @db.Timestamp(6)
  completed_at  DateTime? @db.Timestamp(6)
  user          users @relation(fields: [created_by], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([created_by], map: "ix_qti_jobs_created_by")
  @@index([created_at], map: "ix_qti_jobs_created_at")
}
```

### 6.11 Integration Audit Log

```prisma
model integration_audit_logs {
  id             String   @id @default(uuid()) @db.Uuid
  actor_user_id  String?  @db.Uuid
  integration    String   @db.VarChar
  action         String   @db.VarChar
  resource_type  String?  @db.VarChar
  resource_id    String?  @db.VarChar
  status         String   @db.VarChar
  metadata       Json?
  created_at     DateTime @default(now()) @db.Timestamp(6)
  actor          users? @relation(fields: [actor_user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([actor_user_id], map: "ix_integration_audit_actor_user_id")
  @@index([integration], map: "ix_integration_audit_integration")
  @@index([action], map: "ix_integration_audit_action")
  @@index([created_at], map: "ix_integration_audit_created_at")
}
```

## 7. Backend Implementation - LTI 1.3

### 7.1 Dependencies

Add to `backend/requirements.txt`:

```text
PyLTI1p3>=2.0
defusedxml>=0.7.1
lxml>=5.0
PyJWT[crypto]>=2.8
```

Notes:

- If `PyLTI1p3` conflicts with FastAPI or the current dependency tree, document the issue and implement the OIDC/JWT checks directly with `python-jose`/`PyJWT` and JWKS fetching.
- XML parsing must use `defusedxml` or an equivalently safe parser. Do not use default unsafe XML parsers.

### 7.2 Tool Public JWKS Endpoint

Endpoint:

- `GET /api/lti/jwks`

Behavior:

- Public endpoint.
- Returns active public JWKs from `lti_tool_keys`.
- Does not return private key material.
- Uses cache headers with short TTL, for example 5 minutes.

Response:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "openvision-2026-01",
      "use": "sig",
      "alg": "RS256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

Admin key operations:

- `POST /api/lti/tool-keys/rotate`
- `GET /api/lti/tool-keys`

Rules:

- Admin-only.
- Rotation creates a new active key.
- Old keys remain published until platforms no longer need them.
- Deactivation requires confirmation and audit.

### 7.3 Platform Registration API

Endpoints:

- `GET /api/lti/platforms`
- `POST /api/lti/platforms`
- `GET /api/lti/platforms/{platform_id}`
- `PATCH /api/lti/platforms/{platform_id}`
- `POST /api/lti/platforms/{platform_id}/deactivate`
- `POST /api/lti/platforms/{platform_id}/deployments`
- `PATCH /api/lti/deployments/{deployment_id}`

Authorization:

- Admin-only.

Pydantic schemas:

```python
class LtiPlatformCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    issuer: AnyHttpUrl
    client_id: str = Field(min_length=1, max_length=255)
    auth_login_url: AnyHttpUrl
    auth_token_url: AnyHttpUrl
    auth_jwks_url: AnyHttpUrl
    deployment_ids: list[str] = Field(min_length=1, max_length=50)
    canvas_base_url: AnyHttpUrl | None = None
```

Validation:

- Normalize URLs without stripping meaningful paths.
- Reject duplicate issuer/client pair.
- Reject empty deployment IDs.
- Store deployment IDs as normalized strings and create `lti_deployments` rows.

Audit:

- Log create, update, deactivate, deployment add/update.

### 7.4 OIDC Login Initiation

Endpoint:

- `GET /api/lti/login`
- Canvas may also POST depending on platform configuration; support both if feasible.

Expected request params:

- `iss`
- `login_hint`
- `target_link_uri`
- `lti_message_hint`
- `client_id`
- optional Canvas/platform extras

Flow:

1. Validate required params.
2. Look up active platform by `issuer` and `client_id`.
3. Generate cryptographically random `state` and `nonce`.
4. Store launch state with short TTL, recommended 5 minutes:
   - `state`
   - `nonce`
   - `issuer`
   - `client_id`
   - `target_link_uri`
   - `lti_message_hint`
   - created timestamp
5. Redirect to platform authorization endpoint with:
   - `scope=openid`
   - `response_type=id_token`
   - `response_mode=form_post`
   - `prompt=none`
   - `client_id`
   - `redirect_uri`
   - `login_hint`
   - `state`
   - `nonce`
   - `lti_message_hint`

State storage options:

- Development: signed server-side table or Redis if available.
- Preferred: `lti_oidc_states` table or Redis with TTL.

If Redis is not introduced until Epoch 13, use a short-lived table:

```prisma
model lti_oidc_states {
  state       String   @id @db.VarChar
  nonce       String   @db.VarChar
  issuer      String   @db.VarChar
  client_id   String   @db.VarChar
  target_link_uri String @db.VarChar
  message_hint String? @db.Text
  expires_at  DateTime @db.Timestamp(6)
  consumed_at DateTime? @db.Timestamp(6)
  created_at  DateTime @default(now()) @db.Timestamp(6)

  @@index([expires_at], map: "ix_lti_oidc_states_expires_at")
}
```

Security:

- State is single-use.
- State expires quickly.
- Consumed states cannot be reused.

### 7.5 LTI Launch Endpoint

Endpoint:

- `POST /api/lti/launch`

Canvas posts:

- `state`
- `id_token`

Flow:

1. Load state row.
2. Verify state exists, not expired, not consumed.
3. Decode unverified JWT header to get `kid`.
4. Fetch platform JWKS from registered `auth_jwks_url`.
5. Cache JWKS by platform with TTL.
6. Verify JWT signature.
7. Verify claims:
   - `iss` matches platform issuer.
   - `aud` contains registered `client_id`.
   - `azp` if present matches registered `client_id`.
   - `exp` not expired.
   - `iat` reasonable.
   - `nonce` matches stored nonce.
   - `https://purl.imsglobal.org/spec/lti/claim/deployment_id` is registered and active.
   - `https://purl.imsglobal.org/spec/lti/claim/message_type` is supported.
   - `https://purl.imsglobal.org/spec/lti/claim/version` is LTI 1.3.
8. Mark state consumed in the same transaction that records launch audit where possible.
9. Map or create local user.
10. Map context/course.
11. Map resource link.
12. Establish an OpenVision session:
   - For student launch: issue normal OpenVision JWT/refresh cookie and redirect to assigned exam route.
   - For instructor launch: issue normal OpenVision JWT/refresh cookie and redirect to deep-link picker, blueprint, or integration landing.

Supported message types:

- `LtiResourceLinkRequest`
- `LtiDeepLinkingRequest`

Unsupported message types:

- Return a friendly error page and audit failure.

### 7.6 LTI Claim Parser

Add:

- `backend/app/services/lti/claims.py`

Define typed helper:

```python
@dataclass(frozen=True)
class LtiLaunchClaims:
    issuer: str
    subject: str
    audience: list[str]
    deployment_id: str
    message_type: str
    version: str
    roles: list[str]
    context_id: str | None
    context_label: str | None
    context_title: str | None
    resource_link_id: str | None
    resource_link_title: str | None
    given_name: str | None
    family_name: str | None
    name: str | None
    email: str | None
    target_link_uri: str | None
    deep_link_return_url: str | None
    ags_line_items_url: str | None
    ags_line_item_url: str | None
    ags_scope: list[str]
```

Rules:

- All raw IMS claim URLs are parsed in this one module.
- Downstream services use typed fields only.
- Missing optional claims are `None`, not empty strings.

### 7.7 Role Mapping

Mapping rules:

| LTI role contains | OpenVision role |
|---|---|
| Learner | STUDENT |
| Instructor, TeachingAssistant, ContentDeveloper | CONSTRUCTOR |
| Administrator | CONSTRUCTOR by default, ADMIN only if existing linked OpenVision user is already ADMIN |

Never create a new OpenVision admin from an LTI launch.

If one user launches with both learner and instructor roles:

- Prefer the least privilege needed for the launch context.
- For a resource link student exam launch, learner path wins.
- For deep linking, instructor path is required.

### 7.8 User Linking and Provisioning

Function:

- `resolve_lti_user(claims, platform) -> users`

Rules:

1. Look up `lti_user_links` by `(issuer, subject)`.
2. If found, update last launch metadata and return linked OpenVision user.
3. If not found:
   - If email matches an existing active OpenVision user, do not auto-link unless domain and platform are trusted and policy allows it.
   - Recommended default: create a new user with a generated unusable password hash and `is_active=True`.
   - Set role from LTI role mapping.
   - Store email/name/vunet_id if available and valid.
   - Create `lti_user_links`.
4. For learner launches in a context mapped to a course, ensure active course enrollment.

Generated users:

- Must not have a known password.
- Password login can be disabled until they set a password through a controlled flow, or store a random hash.
- Account identity is still valid through LTI.

### 7.9 Context/Course Mapping

Function:

- `resolve_lti_context(claims, platform, deployment) -> lti_context_links`

Rules:

- If context exists, reuse it.
- If context does not exist:
  - For instructor launch, create an unmapped context link and show mapping UI.
  - For learner launch, require existing mapping to an OpenVision course or return a clear "course not configured" page.
- Admins/constructors can map Canvas context to an existing OpenVision course or create a new course.

Do not silently create courses for student launches. That turns a bad Canvas configuration into confusing data.

### 7.10 Resource Link Mapping

Function:

- `resolve_lti_resource_link(claims, platform, deployment, context_link)`

Rules:

- Resource link is keyed by platform, deployment, and resource link ID.
- If mapped to scheduled session, student launch joins that session.
- If unmapped:
  - Student launch returns "assignment not configured."
  - Instructor launch opens mapping/deep-link flow.
- If AGS claim includes line item URL, store/update it.

### 7.11 Student Launch to Exam

Student flow:

1. Canvas launches `LtiResourceLinkRequest`.
2. OpenVision validates launch.
3. OpenVision resolves user/context/resource.
4. OpenVision ensures enrollment in mapped course.
5. OpenVision creates normal JWT/refresh cookie.
6. OpenVision redirects to:
   - existing attempt if already started, or
   - join route for scheduled session, or
   - a launch resolver page that calls existing join endpoint.

Recommended frontend route:

- `frontend/src/app/lti/launch/page.tsx`

The route should show:

- Loading state while session is resolved.
- Clear configuration errors.
- Button back to Canvas if a return URL exists.

Security:

- Do not pass raw `id_token` to frontend.
- Do not expose Canvas line item URLs to untrusted clients.

### 7.12 Instructor Launch and Deep Linking

Deep Linking flow:

1. Canvas launches with `LtiDeepLinkingRequest`.
2. OpenVision validates launch and maps instructor.
3. Instructor selects an approved test definition or scheduled session.
4. Backend creates/updates `lti_resource_links`.
5. Backend creates a signed deep-linking response JWT using active tool key.
6. Browser auto-posts response to Canvas `deep_link_return_url`.

Deep link content item:

- Type: LTI Resource Link.
- Title: selected test/session title.
- Custom params include an opaque OpenVision resource mapping ID if needed.
- Never include internal secrets.

Frontend:

- Add instructor picker under integration/deep-link route.
- Use existing blueprint/session selectors where practical.
- Keep UI utilitarian: this is an operational setup surface, not a marketing page.

### 7.13 Assignment & Grade Services (AGS)

Service:

- `backend/app/services/lti/grade_passback_service.py`

Triggers:

- After grading completes and result is publishable.
- Manual retry from admin/grading UI.

Score mapping:

- `scoreGiven`: result total points or normalized score, depending on Canvas line item max.
- `scoreMaximum`: max points.
- `activityProgress`: `Completed`
- `gradingProgress`: `FullyGraded` when grading complete.
- `timestamp`: current UTC timestamp.
- `userId`: platform subject from `lti_user_links`.

Validation before push:

- Session result exists.
- Result belongs to student linked to same platform.
- Resource link exists and has line item URL.
- Resource link maps to same scheduled session/test as the result.
- AGS scope was granted in launch or platform registration supports it.

Token acquisition:

- Use LTI service authentication with tool private key.
- Cache access tokens by platform/scope until expiry.
- Never expose access tokens to frontend.

Passback record states:

- `PENDING`
- `PUSHING`
- `SUCCEEDED`
- `FAILED_RETRYABLE`
- `FAILED_PERMANENT`

Retry policy:

- Retry network/5xx failures.
- Do not retry 4xx without admin action unless token refresh fixes it.
- Store last error sanitized.
- Add manual retry endpoint:
  - `POST /api/lti/grade-passbacks/{id}/retry`

### 7.14 Integration Audit

Add helper:

- `backend/app/services/integration_audit_service.py`

Use for:

- Platform create/update/deactivate.
- LTI login initiation success/failure.
- LTI launch success/failure.
- User link created.
- Context/resource mapping changed.
- Deep link response created.
- Grade passback attempted/succeeded/failed.
- SIS import/export.
- QTI import/export.

Metadata:

- Include safe IDs and counts.
- Do not include full JWTs, access tokens, raw CSV contents, or full QTI XML.

## 8. Backend Implementation - SIS / Osiris

### 8.1 SIS Module

Add:

- `backend/app/api/endpoints/sis.py`
- `backend/app/schemas/sis.py`
- `backend/app/services/sis/roster_import_service.py`
- `backend/app/services/sis/grade_export_service.py`

Router prefix:

- `/api/sis`

Authorization:

- Admin-only for imports.
- Admin/constructor for exports, scoped to courses they own or legitimately manage.

### 8.2 Roster Import CSV

Endpoint:

- `POST /api/sis/rosters/import`

Content:

- `multipart/form-data`
- CSV only.

Headers:

```text
course_code,vunet_id,email,first_name,last_name,role,is_active
```

Rules:

- `course_code` must exist unless request has `create_missing_courses=true` and actor is admin.
- `role` allowed: `student`, `constructor`.
- `vunet_id` normalized and unique.
- `email` valid and normalized lowercase.
- Existing users are matched by VUnetID first, then email only if unambiguous.
- Enrollment is upserted.
- Deactivation in CSV only deactivates enrollment by default, not the whole user account.

Response:

```json
{
  "job_id": "...",
  "status": "COMPLETED_WITH_ERRORS",
  "total_rows": 250,
  "success_rows": 247,
  "error_rows": 3,
  "rows": [
    { "row_number": 17, "status": "ERROR", "message": "Unknown course_code TH-404" }
  ]
}
```

Performance:

- Parse and validate all rows first.
- Apply valid rows in batches.
- Record row-level results.

### 8.3 Accommodation Import

This may reuse existing accommodation admin service from Epoch 10.

Endpoint:

- `POST /api/sis/accommodations/import`

Headers:

```text
vunet_id,provision_time_multiplier,enlarged_display
```

Rules:

- Same multiplier bounds as accommodations module.
- Target user must be a student.
- Every change writes accommodation audit rows.
- SIS import job records row status.

### 8.4 Grade Export CSV

Endpoint:

- `GET /api/sis/grades/export`

Filters:

- `course_id`
- `scheduled_session_id`
- `test_definition_id`
- `published_only=true`

Output:

Osiris-compatible CSV, exact columns to confirm with institutional target. Initial proposed columns:

```text
course_code,test_title,scheduled_session_id,vunet_id,email,student_name,score,max_score,percentage,passed,letter_grade,submitted_at,graded_at
```

Rules:

- No unbounded exports. Require at least course or scheduled session filter.
- Actor must have access to requested course/session.
- Audit every export with row count and filters.
- Use streaming response if row count is large.

### 8.5 Future Bulk Grade Push Boundary

Endpoint placeholder only if API contract exists:

- `POST /api/sis/grades/push`

If no Osiris API credentials/contract exist:

- Do not implement fake live push.
- Implement `501 Not Implemented` only if the route is useful for frontend planning; otherwise leave it out.
- Document that CSV export is the accepted Epoch 12 deliverable.

## 9. Backend Implementation - QTI 2.1

### 9.1 QTI Module

Add:

- `backend/app/api/endpoints/qti.py`
- `backend/app/schemas/qti.py`
- `backend/app/services/qti/package.py`
- `backend/app/services/qti/export_service.py`
- `backend/app/services/qti/import_service.py`
- `backend/app/services/qti/sanitizer.py`
- `backend/app/services/qti/mappers.py`

Router prefix:

- `/api/qti`

Authorization:

- Export: constructor/admin with access to item bank/test.
- Import: constructor/admin.

### 9.2 Supported Question Types

Initial mapping:

| OpenVision | QTI 2.1 |
|---|---|
| MULTIPLE_CHOICE | choiceInteraction, maxChoices=1 |
| MULTIPLE_RESPONSE | choiceInteraction, maxChoices > 1 |
| ESSAY | extendedTextInteraction |

Unsupported:

- Hotspot, drag-and-drop, adaptive items, complex math response processing.

Unsupported items should be reported clearly during import, not silently dropped.

### 9.3 QTI Export

Endpoints:

- `GET /api/qti/items/export?bank_id=...`
- `GET /api/qti/tests/{test_definition_id}/export`

Output:

- IMS content package ZIP.
- `imsmanifest.xml`
- One XML item per exported item.
- Optional test XML for test definitions.

Rules:

- Export approved/latest item versions by default.
- Include metadata tags where representable.
- Preserve content HTML safely.
- Include correct responses for export only if actor has authoring access.
- Do not export student responses.

### 9.4 QTI Import

Endpoint:

- `POST /api/qti/import`

Content:

- ZIP package or XML file.

Flow:

1. Validate file size and extension.
2. Safely extract ZIP into temp directory.
3. Prevent zip slip by rejecting paths escaping extraction root.
4. Parse `imsmanifest.xml`.
5. Parse item XML with external entities disabled.
6. Map supported interactions to OpenVision item DTOs.
7. Sanitize HTML.
8. Validate with existing item schemas.
9. Create import job report.
10. If `commit=false`, return dry-run report only.
11. If `commit=true`, create learning objects/item versions in selected bank/course.

Response:

```json
{
  "job_id": "...",
  "status": "COMPLETED_WITH_ERRORS",
  "total_items": 50,
  "success_items": 48,
  "error_items": 2,
  "items": [
    { "identifier": "item-01", "status": "OK", "question_type": "MULTIPLE_CHOICE" },
    { "identifier": "item-49", "status": "ERROR", "message": "Unsupported interaction type: hotspotInteraction" }
  ]
}
```

### 9.5 Sanitization

Rules:

- Use backend sanitization for imported HTML.
- Frontend still uses DOMPurify before rendering.
- Strip scripts, event handlers, unsafe URLs, iframes unless explicitly allowed.
- Preserve KaTeX-compatible markup where safe.

### 9.6 Round-Trip Verification

Add a fixture test:

1. Export a 50-item bank.
2. Import into a new bank.
3. Compare:
   - item count
   - question types
   - prompts after sanitization
   - choices
   - correct answers
   - metadata where supported

Known acceptable losses must be reported, not hidden.

## 10. Frontend Implementation

### 10.1 Integrations Page

Add:

- `frontend/src/app/integrations/page.tsx`

Access:

- Admin only for platform/SIS config.
- Constructors may see QTI import/export and deep-link mapping only where allowed.

Sections:

- LTI platforms
- Tool registration details
- SIS imports/exports
- QTI import/export
- Integration audit log

Use existing `PageShell`, `PageHeader`, `Card`, `Button`, `Input`, `Table`, `Drawer`, and toast primitives.

### 10.2 LTI Platform Admin UI

Components:

- `LtiPlatformTable`
- `LtiPlatformForm`
- `LtiDeploymentEditor`
- `ToolJwksPanel`

Fields:

- Name
- Issuer
- Client ID
- Auth login URL
- Token URL
- JWKS URL
- Canvas base URL
- Deployment IDs
- Active status

Do not show private keys.

### 10.3 Deep-Link Picker

Route:

- `frontend/src/app/lti/deep-link/page.tsx`

Behavior:

- Shows approved test definitions and scheduled sessions for instructor's context.
- Allows mapping Canvas assignment to OpenVision scheduled session.
- Posts selection to backend.
- Backend returns an HTML auto-submit form or a response URL payload.

Security:

- The deep-link return JWT must be created server-side.
- Frontend never signs LTI messages.

### 10.4 Launch Resolver

Route:

- `frontend/src/app/lti/launch/page.tsx`

Behavior:

- Handles post-launch redirects from backend.
- Displays configuration errors cleanly.
- Redirects students into exam flow.
- Redirects instructors to setup flow.

### 10.5 SIS UI

Components:

- `SisImportPanel`
- `SisImportResultTable`
- `GradeExportPanel`

Behavior:

- Upload roster/accommodation CSV.
- Show row-level validation results.
- Provide grade export filters and download.

### 10.6 QTI UI

Components:

- `QtiImportExportPanel`
- `QtiImportReport`
- `QtiExportSelector`

Behavior:

- Export item banks/test definitions.
- Upload QTI package.
- Run dry-run validation first.
- Commit import after review.

### 10.7 Store and API Types

Add:

- `frontend/src/stores/useIntegrationStore.ts`
- `frontend/src/lib/integrations.ts`
- `frontend/src/lib/integrations.types.ts`

All API methods typed.

No `any`; use discriminated unions for job statuses.

## 11. API Endpoint Summary

### 11.1 LTI Public Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/lti/jwks` | Tool public keys |
| GET/POST | `/api/lti/login` | OIDC login initiation |
| POST | `/api/lti/launch` | OIDC launch response |

### 11.2 LTI Admin/Instructor Endpoints

| Method | Path | Role |
|---|---|---|
| GET | `/api/lti/platforms` | ADMIN |
| POST | `/api/lti/platforms` | ADMIN |
| PATCH | `/api/lti/platforms/{id}` | ADMIN |
| POST | `/api/lti/platforms/{id}/deactivate` | ADMIN |
| POST | `/api/lti/platforms/{id}/deployments` | ADMIN |
| GET | `/api/lti/resource-links` | ADMIN/CONSTRUCTOR scoped |
| PATCH | `/api/lti/resource-links/{id}` | ADMIN/CONSTRUCTOR scoped |
| POST | `/api/lti/deep-link/response` | ADMIN/CONSTRUCTOR with valid launch context |
| GET | `/api/lti/grade-passbacks` | ADMIN/CONSTRUCTOR scoped |
| POST | `/api/lti/grade-passbacks/{id}/retry` | ADMIN/CONSTRUCTOR scoped |

### 11.3 SIS Endpoints

| Method | Path | Role |
|---|---|---|
| POST | `/api/sis/rosters/import` | ADMIN |
| POST | `/api/sis/accommodations/import` | ADMIN |
| GET | `/api/sis/import-jobs/{id}` | ADMIN |
| GET | `/api/sis/grades/export` | ADMIN/CONSTRUCTOR scoped |

### 11.4 QTI Endpoints

| Method | Path | Role |
|---|---|---|
| GET | `/api/qti/items/export` | ADMIN/CONSTRUCTOR scoped |
| GET | `/api/qti/tests/{id}/export` | ADMIN/CONSTRUCTOR scoped |
| POST | `/api/qti/import` | ADMIN/CONSTRUCTOR |
| GET | `/api/qti/jobs/{id}` | ADMIN/CONSTRUCTOR scoped |

## 12. Testing Plan

### 12.1 LTI Unit Tests

Add:

- `backend/tests/test_lti_platforms.py`
- `backend/tests/test_lti_oidc.py`
- `backend/tests/test_lti_launch.py`
- `backend/tests/test_lti_deep_linking.py`
- `backend/tests/test_lti_grade_passback.py`

Cases:

- Platform create happy path.
- Duplicate issuer/client rejected.
- JWKS endpoint returns public keys only.
- Login initiation rejects unknown issuer.
- Login initiation stores state/nonce and redirects correctly.
- Launch rejects expired state.
- Launch rejects reused state.
- Launch rejects invalid signature.
- Launch rejects wrong issuer.
- Launch rejects wrong audience.
- Launch rejects missing deployment.
- Launch creates user link for new learner.
- Launch reuses existing user link.
- Instructor deep-link request requires instructor role.
- Student resource launch requires mapped resource link.
- Grade passback refuses mismatched resource/result.
- Grade passback records retryable failure on 5xx.

### 12.2 SIS Tests

Add:

- `backend/tests/test_sis_roster_import.py`
- `backend/tests/test_sis_accommodation_import.py`
- `backend/tests/test_sis_grade_export.py`

Cases:

- Valid roster creates users/enrollments.
- Duplicate VUnetID rows reported.
- Invalid email row rejected.
- Unknown course rejected unless admin create flag enabled.
- Accommodation import writes audit rows.
- Grade export requires scoped filter.
- Constructor cannot export another course.

### 12.3 QTI Tests

Add:

- `backend/tests/test_qti_export.py`
- `backend/tests/test_qti_import.py`
- `backend/tests/test_qti_security.py`

Cases:

- Export MCQ/MR/essay package.
- Import package dry-run.
- Commit import creates item versions.
- Unsupported interaction reported.
- XXE payload rejected.
- Zip-slip package rejected.
- Script tags stripped from imported HTML.
- 50-item round-trip fixture passes with documented acceptable losses.

### 12.4 Frontend Tests

Add:

- Admin integrations page renders.
- Non-admin cannot access admin platform config.
- Platform form validates required URL fields.
- SIS import shows row-level errors.
- QTI dry-run report must be reviewed before commit.
- Deep-link picker posts selection and handles backend auto-submit response.

### 12.5 Manual Canvas Sandbox Test

Before merge, test against a Canvas sandbox or documented mock:

1. Register OpenVision tool in Canvas.
2. Canvas opens LTI login initiation.
3. OpenVision validates launch.
4. Student lands in mapped exam.
5. Instructor deep links a scheduled exam.
6. Student submits exam.
7. Grade passback appears in Canvas gradebook.

If real Canvas sandbox is unavailable:

- Use signed JWT fixtures and mock AGS endpoints.
- Mark real Canvas verification as blocked with explicit reason.

## 13. Security Review Checklist

Create:

- `directives/epoch_12_security_review.md`

Checklist:

- [ ] LTI launch rejects unknown issuers.
- [ ] LTI launch rejects inactive platforms/deployments.
- [ ] JWT signatures verified against registered JWKS.
- [ ] `state` is single-use and short-lived.
- [ ] `nonce` is checked.
- [ ] `aud`/`azp` checks implemented.
- [ ] No LTI launch can create an admin.
- [ ] Student launch cannot auto-create courses or assignments.
- [ ] Resource links are scoped by platform/deployment/context.
- [ ] Grade passback validates result/resource/student relationship.
- [ ] Service access tokens are never exposed to frontend.
- [ ] Private keys encrypted at rest.
- [ ] CSV file size and row count bounded.
- [ ] CSV imports have row-level validation and audit.
- [ ] QTI XML parser blocks XXE.
- [ ] ZIP extraction blocks path traversal.
- [ ] Imported HTML sanitized.
- [ ] Integration logs do not store full JWTs, tokens, raw CSV, or raw XML.
- [ ] All admin endpoints use `require_role(UserRole.ADMIN)` or stricter scoped checks.
- [ ] No hardcoded credentials or platform URLs.
- [ ] No high-severity findings remain.

## 14. Operational Notes

Add:

- `docs/integrations/lti_canvas_setup.md`
- `docs/integrations/sis_osiris_csv.md`
- `docs/integrations/qti_import_export.md`

### 14.1 Canvas Setup Doc

Include:

- OpenVision tool login URL.
- OpenVision launch redirect URL.
- JWKS URL.
- Deep linking URL/placement notes.
- AGS scope requirements.
- Canvas developer key fields.
- How to register issuer/client/deployment in OpenVision.
- Troubleshooting launch failures by request ID.

### 14.2 SIS/Osiris CSV Doc

Include:

- Roster CSV template.
- Accommodation CSV template.
- Grade export column dictionary.
- Encoding expectations.
- Validation rules.

### 14.3 QTI Doc

Include:

- Supported QTI version.
- Supported item types.
- Known limitations.
- Export/import workflow.
- Dry-run interpretation.

## 15. Implementation Phases

### Phase 0 - Preflight

Tasks:

- Create branch `epoch-12-lti-canvas-interoperability`.
- Confirm this directive is approved.
- Run existing backend tests and frontend build.
- Record baseline failures before implementation.

Exit criteria:

- Baseline status documented.
- No unrelated worktree changes reverted.

### Phase 1 - Schema and Core Integration Audit

Tasks:

- Add Prisma models.
- Add SQLAlchemy mirrors if needed.
- Generate Prisma client.
- Add integration audit helper.
- Add admin-safe schemas.

Exit criteria:

- Schema applies cleanly.
- Audit helper test passes.

### Phase 2 - LTI Platform Registration and Tool Keys

Tasks:

- Add tool key generation/rotation.
- Add JWKS endpoint.
- Add platform CRUD.
- Add deployment management.
- Add admin UI.

Exit criteria:

- Admin can register Canvas sandbox.
- JWKS endpoint returns active public key.

### Phase 3 - OIDC Login and Launch Validation

Tasks:

- Add login initiation endpoint.
- Add state/nonce persistence.
- Add launch validation.
- Add claims parser.
- Add launch audit.

Exit criteria:

- Signed fixture launch succeeds.
- Forged/expired/reused launches fail.

### Phase 4 - User, Context, and Resource Mapping

Tasks:

- Add user link service.
- Add context mapping service/UI.
- Add resource link mapping service/UI.
- Wire student launch to existing scheduled session join.

Exit criteria:

- Student LTI launch reaches correct exam.
- Instructor launch reaches setup flow.

### Phase 5 - Deep Linking

Tasks:

- Add deep-link picker.
- Add server-side deep-link response JWT.
- Add resource link persistence.

Exit criteria:

- Instructor can place OpenVision exam as Canvas assignment.

### Phase 6 - AGS Grade Passback

Tasks:

- Add AGS client.
- Add token acquisition/cache.
- Add passback record table logic.
- Trigger after grading.
- Add manual retry UI/endpoint.

Exit criteria:

- Graded result pushes to Canvas mock/sandbox.
- Failed push is visible and retryable.

### Phase 7 - SIS/Osiris

Tasks:

- Add roster import.
- Add accommodation import reuse.
- Add grade export.
- Add UI panels.
- Add docs/templates.

Exit criteria:

- Roster import creates/enrolls users.
- Accommodation import audits changes.
- Grade export downloads scoped CSV.

### Phase 8 - QTI

Tasks:

- Add safe package parser.
- Add export generator.
- Add import dry-run/commit.
- Add UI panel.
- Add round-trip tests.

Exit criteria:

- 50-item bank can export/import with no undocumented loss.

### Phase 9 - Security Review and Final Verification

Tasks:

- Complete security review.
- Run all tests.
- Run Canvas sandbox/manual mock verification.
- Update docs.

Exit criteria:

- CI passes.
- Security review complete.
- No high-severity findings.

## 16. File-Level Work Plan

Expected additions:

```text
backend/app/api/endpoints/lti.py
backend/app/api/endpoints/qti.py
backend/app/api/endpoints/sis.py
backend/app/models/integration_audit.py
backend/app/models/lti.py
backend/app/schemas/lti.py
backend/app/schemas/qti.py
backend/app/schemas/sis.py
backend/app/services/integration_audit_service.py
backend/app/services/lti/__init__.py
backend/app/services/lti/claims.py
backend/app/services/lti/deep_linking_service.py
backend/app/services/lti/grade_passback_service.py
backend/app/services/lti/jwks_service.py
backend/app/services/lti/launch_service.py
backend/app/services/lti/platform_client.py
backend/app/services/lti/platform_service.py
backend/app/services/qti/__init__.py
backend/app/services/qti/export_service.py
backend/app/services/qti/import_service.py
backend/app/services/qti/mappers.py
backend/app/services/qti/package.py
backend/app/services/qti/sanitizer.py
backend/app/services/sis/__init__.py
backend/app/services/sis/grade_export_service.py
backend/app/services/sis/roster_import_service.py
backend/tests/test_lti_deep_linking.py
backend/tests/test_lti_grade_passback.py
backend/tests/test_lti_launch.py
backend/tests/test_lti_oidc.py
backend/tests/test_lti_platforms.py
backend/tests/test_qti_export.py
backend/tests/test_qti_import.py
backend/tests/test_qti_security.py
backend/tests/test_sis_accommodation_import.py
backend/tests/test_sis_grade_export.py
backend/tests/test_sis_roster_import.py
docs/integrations/lti_canvas_setup.md
docs/integrations/qti_import_export.md
docs/integrations/sis_osiris_csv.md
frontend/src/app/integrations/page.tsx
frontend/src/app/lti/deep-link/page.tsx
frontend/src/app/lti/launch/page.tsx
frontend/src/components/integrations/LtiDeploymentEditor.tsx
frontend/src/components/integrations/LtiPlatformForm.tsx
frontend/src/components/integrations/LtiPlatformTable.tsx
frontend/src/components/integrations/QtiImportExportPanel.tsx
frontend/src/components/integrations/SisImportPanel.tsx
frontend/src/components/integrations/ToolJwksPanel.tsx
frontend/src/lib/integrations.ts
frontend/src/lib/integrations.types.ts
frontend/src/stores/useIntegrationStore.ts
```

Expected modifications:

```text
backend/app/api/api.py
backend/app/services/grading_service.py
backend/app/services/results_service.py
backend/requirements.txt
frontend/src/components/layout/GlobalHeader.tsx
frontend/src/lib/api.ts
prisma/schema.prisma
```

## 17. Acceptance Criteria

Epoch 12 is complete when:

- Admin can register an LTI platform/deployment.
- OpenVision exposes a valid public JWKS endpoint.
- OIDC login initiation redirects correctly.
- Launch validation rejects forged, expired, replayed, wrong-audience, and unknown-deployment tokens.
- LTI user links are keyed by issuer+subject.
- LTI launch never creates admin users.
- Student Canvas launch reaches the correct OpenVision scheduled exam.
- Instructor deep linking creates a Canvas assignment/resource link mapping.
- Graded OpenVision result can be pushed to Canvas AGS or a compliant mock.
- Failed grade passback is recorded and retryable.
- SIS roster CSV import creates/updates users and enrollments with row-level report.
- SIS accommodation import updates provisions and writes audit rows.
- Osiris-compatible grade CSV export is scoped and audited.
- QTI export produces a valid package for supported item types.
- QTI import dry-run reports supported/unsupported items.
- QTI import commit creates valid item versions with sanitized content.
- XML/ZIP security tests pass.
- Integration audit logs cover all major actions.
- Frontend integration surfaces are role-gated and typed.
- Manual security review is complete.

## 18. Risks and Mitigations

### Risk: Forged LTI Launch Grants Access

Mitigation:

- Strict issuer/client/deployment lookup.
- JWKS signature validation.
- State/nonce replay protection.
- Role mapping never creates admin.
- Launch audit on every failure.

### Risk: Email-Based Account Takeover

Mitigation:

- Canonical link is issuer+subject.
- Email match does not automatically bind by default.
- Admin-reviewed linking policy only if needed.

### Risk: Grade Sent to Wrong Assignment

Mitigation:

- Grade passback validates resource link, result, scheduled session/test, student user, and platform subject.
- Browser never supplies line item URL for passback.

### Risk: QTI Import Executes Malicious XML/HTML

Mitigation:

- XXE-safe parser.
- Zip-slip protection.
- HTML sanitization.
- File size and item count bounds.

### Risk: CSV Import Corrupts Roster

Mitigation:

- Dry-run/row-level validation.
- Batch commit only valid rows.
- Import job rows for audit.
- Enrollment deactivation does not deactivate accounts by default.

### Risk: Canvas Sandbox Unavailable

Mitigation:

- Build signed JWT fixture tests and AGS mock server.
- Document real sandbox verification as blocked with exact missing dependency.

## 19. Rollback Plan

The schema changes are additive. If LTI behavior causes production issues:

1. Deactivate the affected LTI platform in admin UI.
2. Keep local username/password login working.
3. Disable grade passback retry jobs by setting passbacks to paused/failed state.
4. Continue using CSV exports while Canvas passback is fixed.
5. Leave user/resource links intact for later repair.

If QTI import causes issues:

1. Disable QTI import endpoint via feature flag.
2. Keep QTI export available if safe.
3. Preserve import job reports for diagnosis.

If SIS import causes issues:

1. Disable import endpoints.
2. Use audit rows/import job rows to identify affected users/enrollments.
3. Apply corrective admin actions through existing course/accommodation surfaces.

## 20. Definition of Done

- Implementation follows this directive.
- Tests added and passing.
- Canvas sandbox or mock verification complete.
- Security review complete.
- Docs added.
- No secrets committed.
- No unrelated refactors mixed in.
- Conventional commits used.

## 21. Suggested Commit Breakdown

1. `chore: add epoch 12 interoperability directive`
2. `feat: add lti schema and integration audit log`
3. `feat: add lti platform registration and jwks`
4. `feat: implement lti oidc login and launch validation`
5. `feat: map lti users contexts and resource links`
6. `feat: add canvas deep linking flow`
7. `feat: add lti grade passback records and client`
8. `feat: add sis roster and accommodation imports`
9. `feat: add osiris grade export`
10. `feat: add qti import and export`
11. `test: cover lti sis and qti security flows`
12. `docs: add canvas sis and qti integration guides`

## 22. Final Implementation Note

Epoch 12 succeeds when Canvas, SIS, and QTI feel like controlled doors into OpenVision rather than side entrances. The system should welcome external identity and content, but only after it has checked signatures, scoped roles, validated files, sanitized markup, preserved audit trails, and tied every external action back to an internal course, resource, user, and permission.

If implementation pressure forces tradeoffs, preserve these invariants first:

1. **Never accept an LTI launch that is not cryptographically verified.**
2. **Never map external identity by email alone without a verified issuer and subject.**
3. **Never pass back a grade unless the result, student, platform user, and resource link all match.**
4. **Never import XML/HTML/CSV content without bounded parsing, validation, sanitization, and audit.**
