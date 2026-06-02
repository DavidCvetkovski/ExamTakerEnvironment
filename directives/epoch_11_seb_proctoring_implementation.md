# Epoch 11 — Security: Safe Exam Browser & Proctoring Implementation

> **Status:** Proposed implementation directive. Per `AGENTS.md`/`CLAUDE.md` §6, this file is the required blueprint before any implementation work begins.
> **Branch:** `feature/epoch-11-seb-proctoring`
> **Depends on:** Epoch 3 auth/RBAC/JWT (`get_current_user`, `require_role`, `token_version`), Epoch 5 exam-taking + heartbeat flow (`exam_sessions_service`, `interactions_service`), Epoch 6.5 session manager (`scheduled_exam_sessions`, `/sessions` page), Epoch 8.x design system, Epoch 13 infrastructure (Redis client lifecycle, rate limiting, structured logging, request-context middleware, security-headers middleware).
> **Primary objective:** Lock down the *summative* exam environment so a high-stakes university exam taken on OpenVision is hard to cheat: enforce Safe Exam Browser (SEB) integrity at the server, give a supervisor a live view of every active attempt, and record every security-relevant event in an append-only incident log.

---

## 1. Executive Summary

Epoch 11 is a security epoch, not a feature epoch. Today the exam-taking path is functionally complete and pleasant (Epoch 5 + the Epoch 8.x design system), and Epoch 13 has already made it durable under load. What is missing is *trust*: nothing currently stops a student from taking a summative exam in an ordinary Chrome tab with a second monitor, a phone, copy-paste, and a friend on a screen-share.

This epoch adds three layers, mapped directly to the roadmap:

1. **Safe Exam Browser (SEB) integration (11.1).** A per-test "Require SEB" policy. When enabled, the backend refuses to serve the exam — session data, heartbeats, answers, submit — to any request that does not carry a valid SEB integrity header. OpenVision generates the `.seb` configuration file students launch, derives the cryptographic key that file produces, and validates the hash SEB attaches to every request. A missing or wrong hash is a `403` *and* a logged incident that flags the attempt for supervisor review.
2. **Supervisor status monitor (11.2).** A live dashboard, scoped to one scheduled exam session, listing every active attempt with the student's identity, their current question, their last-seen timestamp, and a color-coded presence state (green/yellow/red). The supervisor can extend, pause, resume, or terminate an individual attempt, and sees a real-time feed of security incidents.
3. **Anti-cheating measures (11.3).** Context-menu suppression and copy/paste blocking inside the exam UI (configurable per test, independent of SEB), optional IP allow-listing for on-campus exams, and lightweight browser fingerprinting to detect a single attempt being driven from two devices. Every client-observed violation is reported to the backend and recorded as an incident.

The non-negotiable design principle for the whole epoch is **CLAUDE.md §1 / §7.7**: *frontend disables are advisory; the backend `403` is authoritative.* Suppressing the context menu in JavaScript is a deterrent, not a control. The control is the SEB header check in the service layer, the IP check in the dependency layer, and the ownership check that already exists. Every guard in this epoch is asserted server-side; the frontend only mirrors policy for UX.

A second principle: **proctoring data is sensitive and must never leak.** Incident logs store identifiers, counts, hashes, and timestamps — never answer contents, never raw fingerprints, never tokens. This mirrors the discipline already established in `integration_audit_service` and `accommodation_audit_log`.

The end state is a clearly-bounded, testable proctoring capability: an exam marked "Require SEB" cannot be taken in a normal browser, a supervisor can watch 50+ concurrent attempts and intervene per-student, and every security event is durably recorded for post-exam review — with zero new authorization holes and zero PII in the audit trail.

---

## 2. Non-Negotiable Engineering Constraints

Every change in this epoch must respect the contract in `CLAUDE.md`. This section is the checklist the implementer re-reads before each commit.

### 2.1 Security (§1)

- Every new endpoint uses `Depends(get_current_user)` and, where the action is staff-only, `Depends(require_role(...))`. No new public endpoint except the documented `.seb` download (which is still authenticated).
- The SEB integrity check is enforced in the **service/dependency layer**, never only in the client. A student bypassing the frontend gate still hits a `403` from the API.
- Supervisor monitor and intervention endpoints verify three things, in order: authenticated, role permits proctoring, and the user has legitimate access to *this* scheduled session. Least privilege (§1): a `STUDENT` can never reach a monitor endpoint; a `REVIEWER` cannot terminate attempts.
- Every request body is a strict Pydantic model. Client-reported incidents are validated and *trust-tagged* as `CLIENT` source — they are evidence, not authorization.
- All queries go through Prisma. No interpolated SQL. IP/CIDR checks use a vetted stdlib (`ipaddress`), never string matching.
- Secrets (fingerprint salt, any SEB signing material) live in `.env` and `settings`. Nothing hardcoded. The `.seb` file must not embed OpenVision secrets — only the exam URL and SEB policy.
- The incident log is **append-only**. No update/delete endpoints. PII discipline as in §1: no answers, no raw fingerprints, no tokens, no full request bodies.
- A manual security review against §1 is mandatory before merge (`directives/epoch_11_security_review.md`).

### 2.2 Maintainability (§2)

- Route handlers stay thin: validate → authorize → delegate to a service → shape the response. No SEB hashing, no incident formatting, no presence math in endpoint files.
- A function over ~40 lines is decomposed. SEB key derivation, hash comparison, and `.seb` rendering are separate functions.
- Single source of truth (§2, "three is the limit"): proctoring *policy* is derived in exactly one place (`proctoring_policy.py`), presence color in exactly one place (frontend `lib/proctoringPresence.ts` + backend mirror), incident creation in exactly one service (`proctoring_incident_service.record_incident`).
- TypeScript: explicit interfaces, no `any`. New stores typed end to end.
- No dead code, no commented experiments, no placeholder TODOs at merge.

### 2.3 Modularity (§3)

- Backend feature module layout, mirroring the existing `lti/`, `qti/`, `sis/` services:
  - `app/services/proctoring/` — `seb_service.py`, `seb_config.py`, `presence_service.py`, `incident_service.py`, `intervention_service.py`, `policy.py`.
  - `app/api/endpoints/proctoring.py` — supervisor monitor, interventions, incident feed.
  - `app/schemas/proctoring.py` — all proctoring DTOs.
  - `app/models/proctoring_incident.py` — SQLAlchemy mirror + enums.
- Frontend: one Zustand store per domain — `useProctoringStore` (supervisor side). Pure logic in `src/lib/` (`proctoringPolicy.ts`, `proctoringPresence.ts`, `sebDetection.ts`, `deviceFingerprint.ts`). The exam-side runtime is a hook (`useProctoring`) + a gate component, no React-free logic inside components.
- No circular imports. `proctoring/seb_service.py` depends on `policy.py` and the session read, not the other way round.

### 2.4 Scalability (§4)

- Live presence is **not** a per-request Postgres write. Each accepted heartbeat refreshes a short-TTL Redis key; the worker denormalizes a durable `last_seen_at`. The monitor reads Redis, not a table scan.
- The monitor endpoint is **paginated** like every list endpoint. A 300-student hall must not return 300 rows unbounded.
- Incident writes are single-row inserts on an indexed table; the monitor's incident feed is paginated and indexed by `scheduled_session_id` + `created_at`.
- SEB hash validation is pure CPU (one SHA-256) and adds no DB round-trip beyond the session load the endpoint already does.
- The API stays stateless: all proctoring state lives in Postgres or Redis, never in process memory. Two API replicas behind a load balancer must serve the monitor identically.

### 2.5 Industry Standards (§5)

- Use the **real SEB integrity contract** (Config Key / Browser Exam Key, `X-SafeExamBrowser-ConfigKeyHash` / `X-SafeExamBrowser-RequestHash`), not an invented scheme. See §6.
- Proper REST verbs and codes: `403` SEB/IP rejection, `404` unknown session, `409` illegal state transition (e.g. resume a non-paused attempt), `201` on incident creation, `200` on monitor reads.
- Constant-time comparison for all hash checks (`hmac.compare_digest`).
- Conventional Commits with the epoch scope: `feat(11.1): ...`, `feat(11.2): ...`, `feat(11.3): ...`.
- Design-system discipline (§7): tokens only, no literal Tailwind colors, lifecycle vocabulary (§7.9), toast/confirm copy rules (§7.10), date utils (§7.11). The monitor's presence colors get their **own token family** (§7.1 charts rule), not inline `bg-green-500`.

---

## 3. Current System Baseline

This section is deliberately concrete so the implementer can verify assumptions before writing code. Everything below was read from the repository at the time this directive was written.

### 3.1 Backend surfaces this epoch builds on

- App entrypoint + middleware wiring: `backend/app/main.py` (CORS → `RequestContextMiddleware` → `SecurityHeadersMiddleware`, then `api_router` under `/api`). `request.state.request_id` is already populated by `RequestContextMiddleware`.
- API router registration: `backend/app/api/api.py`.
- Auth + RBAC dependencies: `backend/app/core/dependencies.py` — `get_current_user`, `require_role(*roles)`, `assert_token_version`.
- Settings: `backend/app/core/config.py` (`Settings`, `get_settings()`, `settings`). Already has `ENVIRONMENT`, `TRUSTED_HOSTS`, `FRONTEND_BASE_URL`, Redis config, `assert_production_safe()`.
- Redis lifecycle: `backend/app/core/redis.py` — `get_redis()`, connected in lifespan. Used by the heartbeat queue and cache today.
- Rate limiting: `backend/app/core/rate_limit.py` — exposes `rate_limit_heartbeat` (a dependency). New abuse-prone endpoints (incident reporting) follow the same pattern.
- Session model + status: `backend/app/models/exam_session.py` → `SessionStatus = {STARTED, SUBMITTED, EXPIRED}`, `ExamSessionMode = {ASSIGNED, PRACTICE}`. Prisma model `exam_sessions` (`prisma/schema.prisma:21`). Note the snapshot `items` JSONB and `expires_at`.
- Test definition: `backend/app/models/test_definition.py` + Prisma `test_definitions` (`schema.prisma:146`). Already carries a `scoring_config` JSONB — the established pattern for "a bag of per-test policy." Proctoring policy follows that exact precedent.
- Scheduled session: `backend/app/models/scheduled_exam_session.py` + Prisma `scheduled_exam_sessions` (`schema.prisma:74`). `CourseSessionStatus = {SCHEDULED, ACTIVE, CLOSED, CANCELED}`. `created_by` is the staff member who scheduled it. Status is derived/persisted by `scheduled_sessions_service.ensure_scheduled_session_current`.
- Exam-data endpoints that must become SEB-guarded:
  - `GET /api/sessions/{session_id}` → `sessions.get_exam_session` → `exam_sessions_service.get_exam_session_for_user`.
  - `POST /api/sessions/{session_id}/heartbeat` → `interactions.heartbeat` → `interactions_service.accept_interaction_events`.
  - `GET /api/sessions/{session_id}/answers` → `interactions.get_answers`.
  - `POST /api/sessions/{session_id}/submit` → `sessions.submit_session`.
- Heartbeat ingestion: `interactions_service.accept_interaction_events` validates ownership + status, then `enqueue_events` to a Redis stream. The worker (`app/workers/heartbeat_worker.py`, `services/heartbeat_ingestion/`) persists. **This is the natural place to refresh presence** (API side: fast Redis write; worker side: durable `last_seen_at`).
- Append-only audit precedents to copy: `services/integration_audit_service.record_integration_audit` + Prisma `integration_audit_logs` (`schema.prisma:470`), and `accommodation_audit_log` (`schema.prisma:204`). The incident table is modeled on these.

### 3.2 Frontend surfaces this epoch builds on

- Exam runtime page: `frontend/src/app/exam/[id]/page.tsx`. Already owns the keydown handler, the timer, the heartbeat hook (`useHeartbeat`), and the `SUBMITTED`/`EXPIRED` branches. This is where the proctoring hook + gate attach.
- Exam store: `frontend/src/stores/useExamStore.ts` (answer/flag/navigation events, `pendingEvents`, `flushEvents`). The current question index lives here.
- Heartbeat hook: `frontend/src/hooks/useHeartbeat.ts` (2s flush, visibility + unload flush, `sendBeacon`).
- Session manager (the supervisor monitor's sibling surface): `frontend/src/app/sessions/page.tsx`, `components/sessions/ScheduledSessionsTable.tsx`, `useSessionManagerStore`. The monitor is reached *from* a scheduled session row.
- Test/blueprint editor: where the "Security & Proctoring" config panel lands (see §10.2). Confirm the exact editor route during Phase 1 — it is the same surface that edits `scoring_config`.
- UI primitives to reuse (§7.3): `<Badge>`, `<RowActionMenu>`, `<EmptyState>`, `<Spinner>`, `<PageShell>`, `useConfirm()`, `useToast()`, `<Avatar>`, the `relativeTime` utils.
- API client + base URL: `frontend/src/lib/api.ts`.

### 3.3 What does **not** exist yet (the gaps Epoch 11 fills)

- No proctoring policy anywhere: `test_definitions` has no SEB/anti-cheat fields.
- No SEB awareness: no header validation, no `.seb` generation, no Config Key.
- No supervisor role and no monitor: `UserRole = {ADMIN, CONSTRUCTOR, REVIEWER, STUDENT}` has no `PROCTOR`/`SUPERVISOR`. There is no live attempt view and no per-attempt intervention (extend/pause/resume/terminate).
- No presence tracking: nothing records or exposes "last heartbeat at" per attempt.
- No incident concept: no table, no service, no endpoint, no client reporting.
- No IP allow-listing and no fingerprinting.

---

## 4. Scope

| ID | Deliverable | Main surfaces |
|---|---|---|
| F1 | Proctoring policy on the test definition | `prisma/schema.prisma`, `models/test_definition.py`, `schemas/test_definition.py`, `schemas/proctoring.py`, `services/proctoring/policy.py` |
| F2 | SEB integrity enforcement | `services/proctoring/seb_service.py`, `core/dependencies.py` (new `require_seb_integrity`), the four exam-data endpoints |
| F3 | `.seb` config file generation + Config Key derivation | `services/proctoring/seb_config.py`, student + staff download endpoints |
| F4 | Session presence tracking | `interactions_service.accept_interaction_events`, `heartbeat_ingestion` worker, `services/proctoring/presence_service.py`, Redis |
| F5 | Supervisor status monitor | `api/endpoints/proctoring.py`, `services/proctoring/*`, `schemas/proctoring.py` |
| F6 | Per-attempt interventions (extend / pause / resume / terminate) | `services/proctoring/intervention_service.py`, `exam_sessions` schema additions |
| F7 | Append-only incident log | `prisma/schema.prisma` (`proctoring_incidents`), `models/proctoring_incident.py`, `services/proctoring/incident_service.py` |
| F8 | Client anti-cheat runtime + incident reporting | `frontend/.../useProctoring.ts`, `ProctoringGate.tsx`, `POST /sessions/{id}/incidents` |
| F9 | IP allow-listing + device fingerprint sharing detection | `services/proctoring/seb_service.py`/`policy.py`, fingerprint capture on join |
| F10 | Frontend config panel + monitor UI | test editor panel, `/sessions/[scheduledId]/monitor`, `useProctoringStore` |
| F11 | Manual security review + operational runbook | `directives/epoch_11_security_review.md`, `docs/operations/proctoring.md` |

---

## 5. Out of Scope

- **Live video/webcam proctoring, screen recording, or AI gaze detection.** This epoch is environment lockdown + supervision, not biometric invigilation. A `proctoring_config` shape that *could* later carry such flags is fine; implementing capture is a future epoch.
- **WebRTC/WebSocket live streaming of student screens.** The monitor is presence + incidents, refreshed by polling/SSE (§9.5). A bidirectional realtime channel is a documented future enhancement, not a deliverable.
- **SEB on locked-down OS images / kiosk provisioning.** OpenVision generates the `.seb` file and validates the header; deploying SEB to lab machines is an institutional operations task.
- **Identity proofing / ID-card verification at exam start.** SSO identity is Epoch 12's concern.
- **Network-level controls** (firewall rules, VLAN isolation). IP allow-listing here is an application-layer guard, explicitly best-effort behind a proxy.
- **Rewriting the heartbeat pipeline.** Epoch 13 owns it; Epoch 11 only *reads* its acceptance to refresh presence.
- **New scoring or grading semantics.** Terminating an attempt force-submits through the existing grading path; it does not invent a new score.

---

## 6. SEB Integrity Background (read before implementing F2/F3)

Safe Exam Browser does not "log in" to the exam server. Instead it attaches, on **every HTTP request to the exam**, headers that prove the request originates from a SEB instance running a specific configuration. There are two independent hashes; OpenVision will primarily rely on the **Config Key** because OpenVision *generates* the configuration and can therefore compute the expected key deterministically.

### 6.1 The two keys

- **Config Key (CK).** A SHA-256 hash deterministically computed from the `.seb` settings themselves. Because the same settings always yield the same Config Key, a server that produced the `.seb` file can compute the CK without ever running SEB. SEB sends, per request:
  `X-SafeExamBrowser-ConfigKeyHash = SHA256(absoluteRequestURL + ConfigKey)`.
- **Browser Exam Key (BEK).** A SHA-256 hash binding the SEB *application binary* + the settings. It changes with SEB versions and is shown to the admin in SEB's config tool; the admin pastes it into the exam server. SEB sends, per request:
  `X-SafeExamBrowser-RequestHash = SHA256(absoluteRequestURL + BrowserExamKey)`.

### 6.2 Why Config Key is primary here

OpenVision controls `.seb` generation (F3), so it can compute the Config Key itself and store it on the test's proctoring policy. This avoids asking every educator to hand-copy a BEK out of SEB's config tool, and it keeps working across SEB minor versions. The implementer will:

1. Generate the `.seb` settings dictionary (F3).
2. Compute the Config Key from those settings using SEB's documented algorithm.
3. Store the CK hex string in `proctoring_config.seb_config_key`.
4. On each guarded request, recompute `SHA256(url + CK)` and constant-time-compare against the incoming header.

**BEK support is optional and additive:** the policy carries `allowed_browser_exam_keys: list[str]`. If an admin pastes one or more BEKs, the guard also accepts a matching `X-SafeExamBrowser-RequestHash`. A request passes if **either** the Config Key hash **or** any Browser Exam Key hash matches.

### 6.3 The Config Key algorithm (implementation note)

SEB's Config Key is computed from the JSON serialization of the settings with specific rules (keys sorted case-insensitively, certain keys such as `originatorVersion` excluded, particular formatting). This is the single most error-prone part of the epoch. Treat it like Epoch 13 treated PgBouncer/Prisma compatibility — **do not pretend it works until a real SEB instance validates it.**

Mitigation / staged approach:

1. Implement CK derivation in `seb_config.py` following the SEB specification, with the exact ordering/exclusion rules captured in code comments and unit-tested against published SEB test vectors.
2. **Verification gate:** the `.seb` file must be opened by a real SEB instance pointed at a running OpenVision, and a guarded request must pass. If CK parity cannot be achieved in the available time, fall back to **BEK-only** mode (admin pastes the BEK SEB shows them) and ship that, with CK derivation behind a clearly-documented `SEB_CONFIG_KEY_ENABLED` flag. Shipping BEK-only is acceptable and honest; shipping an unverified CK is not.

### 6.4 The URL problem (must get right)

SEB hashes the **absolute URL the browser used**, including scheme, host, port, path, and query. Behind Nginx/TLS termination (Epoch 13), the FastAPI app sees an internal URL, not the public one. The guard must reconstruct the browser-facing URL from a configured public base, not from `request.url`.

- Add `PUBLIC_EXAM_URL_BASE` to settings (e.g. `https://exams.vu.nl`). The guard builds `PUBLIC_EXAM_URL_BASE + request.url.path + ("?" + query if present)`.
- Document that Nginx must preserve the exact path SEB requested and forward `X-Forwarded-Proto`/`Host`. A trailing-slash or encoding mismatch silently breaks every hash — call this out in the runbook (§16).

---

## 7. Data Model Changes

All schema changes go in `prisma/schema.prisma` (the single source of truth — `prisma db push`, no Alembic). SQLAlchemy mirrors are updated in lockstep for enum/type parity. All additions are **additive and nullable/defaulted** so existing rows and in-flight attempts keep working.

### 7.1 Proctoring policy on `test_definitions` (F1)

Reuse the established "policy bag" precedent (`scoring_config`). Add one JSONB column:

```prisma
model test_definitions {
  // ... existing fields ...
  scoring_config    Json?
  proctoring_config Json?   // Epoch 11 — see schemas/proctoring.ProctoringConfig
}
```

The column is `NULL` for every legacy test, interpreted as "no proctoring" (all flags false). The shape is validated by Pydantic on write (§8.1), never stored raw-unchecked. Storing this as one JSONB column rather than a dozen scalar columns matches the codebase convention and keeps the policy a single cohesive object that travels with the test.

> **Why not discrete columns?** Discrete columns are queryable, but proctoring policy is never filtered on in SQL — it is read whole, per test, at session-join and per-request time. JSONB matches `scoring_config`, avoids a wide migration, and lets the policy evolve (future webcam flags) without schema churn. This is a deliberate, documented choice, not laziness.

### 7.2 Presence + intervention fields on `exam_sessions` (F4/F6)

```prisma
model exam_sessions {
  // ... existing fields ...
  last_seen_at             DateTime?  @db.Timestamp(6)  // F4: durable mirror of Redis presence
  paused_at                DateTime?  @db.Timestamp(6)  // F6: set while a supervisor pause is active
  accumulated_pause_seconds Int       @default(0)        // F6: total paused time, added back to the clock on resume
  device_fingerprint       String?    @db.VarChar        // F9: hash captured at join; mismatch ⇒ sharing incident
  flagged_for_review       Boolean    @default(false)    // F2/F8: any CRITICAL incident raises this
  terminated_by            String?    @db.Uuid           // F6: supervisor who force-ended the attempt
  terminated_at            DateTime?  @db.Timestamp(6)

  @@index([scheduled_session_id], map: "ix_exam_sessions_scheduled_session_id")  // existing
}
```

Notes:

- **No new `sessionstatus` enum value.** Pausing and review-flagging are orthogonal booleans/timestamps; adding `PAUSED`/`FLAGGED` to the status enum would ripple through every status check in grading, results, and the student list. Keep `status` as the canonical lifecycle (`STARTED`/`SUBMITTED`/`EXPIRED`) and model proctoring state alongside it. A terminated attempt becomes `SUBMITTED` via the normal submit path (§9.6) so grading and results are unchanged.
- **Pause semantics:** while `paused_at` is set, the student's client is frozen and heartbeats are rejected with a clear `409`. On resume, `accumulated_pause_seconds += now - paused_at`, `paused_at = NULL`, and `expires_at` is pushed out by the paused duration so the student is not penalized. The effective deadline is always `expires_at` (already extended) — no other code needs to know about pausing.
- `device_fingerprint` stores a **hash**, never raw client attributes (§9.9).

### 7.3 Incident log table (F7)

Modeled on `integration_audit_logs`/`accommodation_audit_log`: append-only, indexed, PII-light.

```prisma
model proctoring_incidents {
  id                   String                  @id @default(uuid()) @db.Uuid
  exam_session_id      String?                 @db.Uuid
  scheduled_session_id String?                 @db.Uuid
  student_id           String?                 @db.Uuid
  incident_type        proctoringincidenttype
  severity             proctoringseverity
  source               proctoringincidentsource           // SERVER (authoritative) vs CLIENT (reported)
  detail               Json                                // non-PII context: counts, route, hashes, reason codes
  client_ip            String?                 @db.VarChar  // best-effort, from trusted proxy header only
  created_at           DateTime                @default(now()) @db.Timestamp(6)

  exam_session         exam_sessions?          @relation(fields: [exam_session_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([scheduled_session_id], map: "ix_proctoring_incidents_scheduled_session_id")
  @@index([exam_session_id], map: "ix_proctoring_incidents_exam_session_id")
  @@index([scheduled_session_id, created_at], map: "ix_proctoring_incidents_scheduled_created_at")
  @@index([severity], map: "ix_proctoring_incidents_severity")
}

enum proctoringincidenttype {
  SEB_HEADER_MISSING
  SEB_HASH_INVALID
  IP_NOT_ALLOWED
  FOCUS_LOST
  COPY_ATTEMPT
  PASTE_ATTEMPT
  CONTEXT_MENU_ATTEMPT
  FULLSCREEN_EXIT
  DEVICE_FINGERPRINT_MISMATCH
  MULTIPLE_ACTIVE_SESSIONS
  SUPERVISOR_EXTEND
  SUPERVISOR_PAUSE
  SUPERVISOR_RESUME
  SUPERVISOR_TERMINATE
}

enum proctoringseverity {
  INFO
  WARNING
  CRITICAL
}

enum proctoringincidentsource {
  SERVER
  CLIENT
}
```

Add the `proctoring_incidents[]` back-relation on `exam_sessions` and the new enums to the SQLAlchemy side (`models/proctoring_incident.py`). Severity guidance:

- `CRITICAL` — server-proven integrity failure (`SEB_HASH_INVALID`, `IP_NOT_ALLOWED`, `DEVICE_FINGERPRINT_MISMATCH`, `MULTIPLE_ACTIVE_SESSIONS`). Sets `exam_sessions.flagged_for_review = true`.
- `WARNING` — client-reported behavioral signals (`COPY_ATTEMPT`, `CONTEXT_MENU_ATTEMPT`, `FOCUS_LOST` repeated). Visible to the supervisor; does not auto-flag.
- `INFO` — supervisor actions (the `SUPERVISOR_*` types) and benign one-off signals. The audit trail of who did what.

### 7.4 Index audit

- `proctoring_incidents`: covered above — the monitor's incident feed queries `(scheduled_session_id, created_at desc)`.
- `exam_sessions`: the monitor lists attempts by `scheduled_session_id` (already indexed) and filters `status = STARTED`. If profiling shows pressure, add `@@index([scheduled_session_id, status])`. Defer until measured.

---

## 8. Backend — Schemas (F1)

All proctoring DTOs live in `backend/app/schemas/proctoring.py`. The policy DTO is the contract for the JSONB column.

### 8.1 Proctoring policy DTO

```python
from pydantic import BaseModel, Field, field_validator
import ipaddress


class ProctoringConfig(BaseModel):
    """Per-test proctoring policy. Persisted as test_definitions.proctoring_config.

    Every field defaults to the *permissive* (no-proctoring) value so a missing
    or NULL column means "ordinary, unproctored test" — preserving every legacy
    blueprint without migration.
    """

    require_seb: bool = False
    seb_config_key: str | None = None              # hex SHA-256; server-derived, not user-set
    allowed_browser_exam_keys: list[str] = Field(default_factory=list)

    block_copy_paste: bool = False
    suppress_context_menu: bool = False
    detect_focus_loss: bool = True                 # client signal; cheap, on by default
    require_fullscreen: bool = False

    ip_allowlist: list[str] = Field(default_factory=list)   # CIDR strings, e.g. "145.108.0.0/16"
    detect_session_sharing: bool = False           # fingerprint mismatch ⇒ CRITICAL incident

    @field_validator("ip_allowlist")
    @classmethod
    def _validate_cidrs(cls, value: list[str]) -> list[str]:
        for entry in value:
            ipaddress.ip_network(entry, strict=False)   # raises ValueError on garbage
        return value

    @field_validator("allowed_browser_exam_keys", "seb_config_key")
    @classmethod
    def _validate_hex(cls, value):
        items = value if isinstance(value, list) else ([value] if value else [])
        for item in items:
            int(item, 16)               # hex sanity; full length checked in seb_service
        return value
```

Wire it into `TestDefinitionBase` (`schemas/test_definition.py`) as an optional field:

```python
class TestDefinitionBase(BaseModel):
    # ... existing fields ...
    scoring_config: Dict[str, Any] = Field(default_factory=dict)
    proctoring_config: ProctoringConfig = Field(default_factory=ProctoringConfig)
```

`seb_config_key` is **server-managed**: the write path (blueprint update) must ignore any client-supplied `seb_config_key`/`allowed_browser_exam_keys` change *unless* it came from the `.seb` regeneration flow. Simplest rule: the test editor sets the booleans and the IP list; the `seb_config_key` is (re)computed and written only by `seb_config.regenerate_for_test`. Document this so the key cannot be spoofed by a malicious blueprint PATCH.

### 8.2 Monitor + intervention + incident DTOs

```python
class MonitorAttemptRow(BaseModel):
    exam_session_id: UUID
    student_id: UUID
    student_email: str
    student_name: str | None
    status: str                       # STARTED / SUBMITTED / EXPIRED
    current_question_index: int | None
    current_question_label: str | None  # "Q4 / 20" — derived, never the question content
    last_seen_at: datetime | None
    presence: str                     # "ACTIVE" | "IDLE" | "DISCONNECTED" (server-derived; see §9.5)
    is_paused: bool
    flagged_for_review: bool
    incident_count: int

class MonitorResponse(BaseModel):
    scheduled_session_id: UUID
    server_now: datetime              # clock-skew correction, matching list_scheduled_sessions
    total: int
    page: int
    page_size: int
    attempts: list[MonitorAttemptRow]

class ExtendRequest(BaseModel):
    minutes: int = Field(gt=0, le=240)

class IncidentReport(BaseModel):
    """A single CLIENT-sourced incident posted by the exam runtime."""
    incident_type: ClientReportableIncidentType   # constrained Enum (subset; no SUPERVISOR_*/SEB_HASH_INVALID)
    detail: dict[str, Any] = Field(default_factory=dict)

class IncidentRow(BaseModel):
    id: UUID
    incident_type: str
    severity: str
    source: str
    detail: dict[str, Any]
    created_at: datetime
    student_id: UUID | None
    exam_session_id: UUID | None

class IncidentFeedResponse(BaseModel):
    server_now: datetime
    total: int
    page: int
    page_size: int
    incidents: list[IncidentRow]
```

`ClientReportableIncidentType` is a **constrained enum** — clients may only report behavioral signals (`FOCUS_LOST`, `COPY_ATTEMPT`, `PASTE_ATTEMPT`, `CONTEXT_MENU_ATTEMPT`, `FULLSCREEN_EXIT`). A client must never be able to assert `SEB_HASH_INVALID` or a `SUPERVISOR_*` action — those are server-authored only. This is the §1 "never trust client input" rule made structural.

---

## 9. Backend — Services & Endpoints

### 9.1 Policy resolution (`services/proctoring/policy.py`)

One function, the single source of truth for "what is this test's proctoring policy":

```python
def resolve_proctoring_config(test_definition: Any) -> ProctoringConfig:
    """Parse a test definition's proctoring_config JSONB into a validated policy.

    NULL / missing ⇒ the default (all-permissive) ProctoringConfig. This is the
    ONLY place that interprets the raw column; every guard calls through here so
    the 'no proctoring' default is defined once.
    """
```

Backend guards and the monitor both call this. Do not re-parse the JSON anywhere else (§2.2).

### 9.2 SEB integrity guard (`services/proctoring/seb_service.py` + dependency, F2)

Core comparison:

```python
import hashlib, hmac

def _seb_hash(absolute_url: str, key: str) -> str:
    return hashlib.sha256((absolute_url + key).encode("utf-8")).hexdigest()

def verify_seb_request(*, absolute_url: str, policy: ProctoringConfig, headers) -> bool:
    """True iff the request carries a valid SEB Config-Key OR Browser-Exam-Key hash."""
    if not policy.require_seb:
        return True

    config_hash = headers.get("X-SafeExamBrowser-ConfigKeyHash")
    request_hash = headers.get("X-SafeExamBrowser-RequestHash")
    if not config_hash and not request_hash:
        return False  # caller records SEB_HEADER_MISSING

    if policy.seb_config_key and config_hash:
        if hmac.compare_digest(_seb_hash(absolute_url, policy.seb_config_key), config_hash.lower()):
            return True

    for bek in policy.allowed_browser_exam_keys:
        if request_hash and hmac.compare_digest(_seb_hash(absolute_url, bek), request_hash.lower()):
            return True

    return False  # caller records SEB_HASH_INVALID
```

The reusable FastAPI dependency, in `core/dependencies.py` (so it sits beside `get_current_user`):

```python
def require_seb_integrity(session_id: UUID, request: Request,
                          current_user: User = Depends(get_current_user)) -> User:
    """Enforce SEB + IP policy for one exam-data request.

    Loads the session and its test policy, reconstructs the browser-facing URL
    from PUBLIC_EXAM_URL_BASE, validates the SEB hash and IP allowlist, records a
    CRITICAL incident + flags the session on failure, and raises 403. A no-policy
    test is a transparent pass-through.
    """
```

This dependency is added to the four exam-data endpoints (§3.1) **in addition to** their existing `get_current_user`. Because it itself depends on `get_current_user`, swap the endpoint signature to depend on `require_seb_integrity` and reuse its returned user (no double DB fetch — FastAPI caches the sub-dependency). Concretely, in `interactions.py`/`sessions.py`:

```python
@router.post("/{session_id}/heartbeat", ...)
async def heartbeat(session_id: UUID, payload: InteractionEventBulkCreate, request: Request,
                    current_user: User = Depends(require_seb_integrity)):
    ...
```

Failure path (inside the dependency / service):
1. Record an incident: `SEB_HEADER_MISSING` (no headers) or `SEB_HASH_INVALID` (present but wrong), severity `CRITICAL`, source `SERVER`, `detail = {"route": request.url.path, "had_config_hash": bool, "had_request_hash": bool}` — never the header values.
2. `exam_sessions.flagged_for_review = true`.
3. Raise `403` with a student-safe message ("This exam must be taken in Safe Exam Browser.").

IP allow-listing (F9) is checked in the same dependency: derive the client IP from the trusted proxy header (Epoch 13's request context already establishes proxy trust — reuse it; do **not** trust raw `X-Forwarded-For` unless the proxy is configured), and if `policy.ip_allowlist` is non-empty and the IP is not in any CIDR, record `IP_NOT_ALLOWED` (CRITICAL) and `403`.

> **Important §4 note:** the guard adds exactly one extra Postgres read (the session) — and the endpoints already load the session in their service. To avoid a double read, have `require_seb_integrity` stash the loaded session/policy on `request.state` and let the service reuse it, **or** accept the one extra indexed `find_unique` for clarity. Prefer clarity unless load tests object; document the choice.

### 9.3 `.seb` generation + Config Key (`services/proctoring/seb_config.py`, F3)

Responsibilities:

- `build_seb_settings(*, start_url, quit_url, policy) -> dict` — the SEB settings dictionary. Minimum keys: `startURL`, `quitURL` (back to the student portal), `sendBrowserExamKey = true`, `allowQuit`, `URLFilterEnable`, and the lockdown flags that mirror `policy` (disable right-click, copy/paste, etc. — SEB enforces these natively, complementing the web-layer deterrents).
- `compute_config_key(settings: dict) -> str` — SEB's deterministic CK algorithm (§6.3), heavily commented and unit-tested against known vectors.
- `render_seb_plist(settings: dict) -> bytes` — serialize to the XML plist `.seb` format. For v1, ship **unencrypted** plist (SEB accepts it); password/identity encryption is a documented later enhancement.
- `regenerate_for_test(test_definition_id) -> ProctoringConfig` — builds settings, computes CK, writes `proctoring_config.seb_config_key` back to the test. Called when an educator enables SEB or changes the exam URL. This is the **only** writer of `seb_config_key`.

Endpoints:

- `GET /api/scheduled-sessions/{id}/seb-config` — staff (`require_role(CONSTRUCTOR, ADMIN)`), returns the `.seb` file (`Content-Type: application/seb`, `Content-Disposition: attachment; filename="<course>-<exam>.seb"`). For distributing to lab machines / the LMS.
- `GET /api/student/sessions/{scheduled_id}/seb-config` — the enrolled student downloads the same `.seb` to launch their attempt. Authenticated + enrollment-checked (reuse the enrollment check from `join_scheduled_session_for_student`).

The `startURL` embedded in the `.seb` points the SEB browser at the frontend exam-launch route for that scheduled session (so SEB opens, the student authenticates, joins, and every subsequent request carries the SEB headers). Confirm the exact launch URL with the frontend route in Phase 4.

### 9.4 Presence tracking (`services/proctoring/presence_service.py`, F4)

Two writes, one read — all Redis-first for §4:

- **On accepted heartbeat** (extend `interactions_service.accept_interaction_events`, right after `enqueue_events` succeeds): `presence_service.touch(session_id, current_index)` writes a Redis hash `presence:session:{id} = {seen_at: <iso>, idx: <int>}` with a TTL (e.g. `PRESENCE_TTL_SECONDS = 90`). This is O(1), no Postgres write on the hot path.
  - `current_index` is derived from the batch: the latest `NAVIGATION` event's payload index, else leave the previous value. Keep it best-effort.
- **On worker flush** (in `heartbeat_ingestion` worker, after a successful batch persist): update `exam_sessions.last_seen_at = max(received_at)` for the affected sessions. This is the durable mirror, written off the request path, batched by the worker that is already writing. One extra `update` per session per flush window — cheap and already batched.
- **Monitor read:** `presence_service.snapshot(session_ids) -> dict[id, {seen_at, idx}]` does one Redis `MGET`/pipeline across the page's sessions. Missing key ⇒ fall back to `last_seen_at` from Postgres ⇒ if both absent, `DISCONNECTED`.

Presence derivation (single source, mirrored on the client in `lib/proctoringPresence.ts`):

| State | Rule | Token / Badge tone |
|---|---|---|
| `ACTIVE` | `now - seen_at < 30s` | `--color-presence-active` (green family) |
| `IDLE` | `30s ≤ now - seen_at < 90s` | `--color-presence-idle` (amber family) |
| `DISCONNECTED` | `≥ 90s` or no signal | `--color-presence-disconnected` (red family) |

Thresholds come from config (`PRESENCE_IDLE_SECONDS=30`, `PRESENCE_DISCONNECTED_SECONDS=90`), not magic numbers. Add a `--color-presence-*` token family to `globals.css` for all three themes (§7.1 — charts/data-viz must define their own tokens; never inline `bg-green-500`).

### 9.5 Supervisor monitor + incident feed (`api/endpoints/proctoring.py`, F5/F7)

A new router, all endpoints staff-gated and **session-scoped** (see §9.8 for the access rule):

- `GET /api/scheduled-sessions/{id}/monitor?page=&page_size=` → `MonitorResponse`. Lists the scheduled session's `exam_sessions`, joins student identity, overlays Redis presence + incident counts, paginated. Default `page_size=50`, hard cap (e.g. 200).
- `GET /api/scheduled-sessions/{id}/incidents?page=&page_size=&severity=&type=` → `IncidentFeedResponse`. Paginated, filterable, ordered `created_at desc`.

Both return `server_now` for the same clock-skew contract the session list already uses (`list_scheduled_sessions`).

**Realtime delivery:** v1 is **client polling** — the monitor page refetches `/monitor` every `MONITOR_POLL_MS` (e.g. 5000ms) and `/incidents` every 10s. This keeps the API stateless and horizontally scalable (§4) with zero new infrastructure. An SSE endpoint (`GET /monitor/stream`) is a documented, optional enhancement; WebSockets are explicitly out of scope (§5). Justify polling in the PR: at 50 supervisors × 1 req/5s it is trivial load, and it survives replica failover for free.

### 9.6 Interventions (`services/proctoring/intervention_service.py`, F6)

Each is a staff-gated action on one `exam_session`, scoped to a session the supervisor may proctor, and each writes a `SUPERVISOR_*` incident (the audit trail of who did what, when).

- **Extend** — `POST /api/exam-sessions/{id}/extend` body `{minutes}`. `expires_at += minutes`. Capped so it cannot exceed the scheduled session's `ends_at` *unless* the supervisor explicitly overrides (decision below). Records `SUPERVISOR_EXTEND` with `detail={"minutes": n}`. `409` if the attempt is not `STARTED`.
- **Pause** — `POST /api/exam-sessions/{id}/pause`. Set `paused_at = now` if not already paused (`409` otherwise). The student's next heartbeat gets a `409 SESSION_PAUSED`; the client freezes the UI and shows "Paused by supervisor". Records `SUPERVISOR_PAUSE`.
- **Resume** — `POST /api/exam-sessions/{id}/resume`. `409` if not paused. `accumulated_pause_seconds += now - paused_at`, `expires_at += (now - paused_at)`, `paused_at = NULL`. Records `SUPERVISOR_RESUME` with the paused duration.
- **Terminate** — `POST /api/exam-sessions/{id}/terminate`. Force-submit through the **existing** `submit_exam_session` path (so grading + results are identical to a normal submit), then stamp `terminated_by`/`terminated_at`. Records `SUPERVISOR_TERMINATE`. `409` if already `SUBMITTED`/`EXPIRED`.

These endpoints belong on a new `/exam-sessions` prefix (a proctor acts on an individual attempt, not on the scheduled container). Keep the existing student-facing `/sessions/...` prefix untouched to avoid confusing the two audiences.

**Decision needed at implementation:** may an extension push past the scheduled `ends_at`? Default to **no** (extension is capped at `ends_at`) for predictability; allow an explicit `?allow_past_close=true` only for `ADMIN`. Document whichever is chosen.

### 9.7 Incident service (`services/proctoring/incident_service.py`, F7)

One creator function, mirroring `record_integration_audit`:

```python
async def record_incident(*, incident_type, severity, source,
                          exam_session_id=None, scheduled_session_id=None,
                          student_id=None, client_ip=None, detail=None) -> None:
    """Append a proctoring incident. detail must be PII-light: counts, route,
    reason codes, hashes — never answers, raw fingerprints, tokens, or header values.
    A CRITICAL incident also sets exam_sessions.flagged_for_review = true."""
```

All incident creation (SEB guard, IP guard, client reports, supervisor actions, fingerprint mismatch) routes through here. Never `prisma.proctoring_incidents.create` directly elsewhere (§2.2 single source).

### 9.8 Authorization model for proctoring (decision: reuse staff roles, no new role)

`UserRole` has no `SUPERVISOR`/`PROCTOR`. **Recommended approach: do not add one.** Treat proctoring as a staff capability granted to `ADMIN` and `CONSTRUCTOR`, scoped to scheduled sessions they can access. Rationale:

- Adding an enum value ripples through seeds, JWT role claims, every `require_role` site, the frontend role gates, and `ProtectedRoute` — a large, risky surface for one epoch whose value is the *controls*, not the org chart.
- `CONSTRUCTOR`/`ADMIN` already create and cancel scheduled sessions (`scheduled_sessions.py` uses `require_role(CONSTRUCTOR, ADMIN)`); supervising the sessions they scheduled is a natural extension of the same authority.
- `REVIEWER` and `STUDENT` are correctly excluded.

Implementation: a small `assert_can_proctor(scheduled_session, user)` helper in `policy.py` — `ADMIN` always passes; `CONSTRUCTOR` passes (optionally tighten later to "creator or same-course staff"). All monitor/intervention endpoints use `require_role(CONSTRUCTOR, ADMIN)` **and** call this helper with the loaded session. Record the decision in the PR; note "introduce a dedicated `PROCTOR` role" as a future option if institutions want invigilators who are not item authors.

### 9.9 Device fingerprint sharing detection (F9)

- On join (`join_scheduled_session_for_student`), accept an optional client-supplied fingerprint hash (a stable hash of coarse, non-identifying browser attributes — UA, screen, timezone, language — hashed **with a server-side salt** `FINGERPRINT_SALT` so the stored value is not reversible and not correlatable across exams). Store on `exam_sessions.device_fingerprint` if empty; if already set and `detect_session_sharing` is on and the new hash differs, record `DEVICE_FINGERPRINT_MISMATCH` (CRITICAL) and flag the attempt.
- Also detect `MULTIPLE_ACTIVE_SESSIONS`: if a student already has a `STARTED` attempt for a different scheduled session in an overlapping window, that is suspicious — but keep this conservative to avoid false positives from legitimate reconnects (same fingerprint, same session = fine).
- **Privacy:** store only the salted hash. Never store raw UA strings or the attribute set. Document this in the security review — fingerprinting is the most privacy-sensitive control and must be defensible (and ideally disabled by default, which it is: `detect_session_sharing=False`).

### 9.10 Client incident reporting endpoint (F8)

- `POST /api/sessions/{session_id}/incidents` → `201`. Body `IncidentReport` (constrained type). Auth = session owner (reuse `_get_session_with_ownership_check`). Rate-limited (reuse the `rate_limit.py` pattern; a chatty `FOCUS_LOST` reporter must not DoS the table). Records the incident as `source=CLIENT`, severity per a server-side map (`FOCUS_LOST`→WARNING, etc.) — **the client never sets severity**. This is the structural enforcement of §1.

---

## 10. Frontend Implementation

### 10.1 Pure logic in `src/lib/` (§3 modularity)

- `proctoringPolicy.ts` — `ProctoringConfig` interface + a `resolveProctoringConfig(raw)` mirroring the backend default-permissive parse. Used by the editor panel and the exam gate.
- `proctoringPresence.ts` — `derivePresence(seenAt, serverNow): 'ACTIVE'|'IDLE'|'DISCONNECTED'` using the same 30s/90s thresholds (single source mirrored from backend; if they ever diverge the backend wins — the client value is advisory display).
- `sebDetection.ts` — `isLikelySeb(): boolean` (UA sniff for "SEB"/"SafeExamBrowser"). **Advisory only** — the real gate is the backend `403`. Comment this loudly so no one mistakes it for a control.
- `deviceFingerprint.ts` — `computeFingerprint(): string` (coarse attributes → hash). Sent on join.

### 10.2 Test editor "Security & Proctoring" panel (F10)

In the same editor that edits `scoring_config` (confirm route in Phase 1), add a collapsible **Security & Proctoring** section:

- Toggle: **Require Safe Exam Browser**. When on, reveal: a **Download `.seb` config** button (hits the staff `.seb` endpoint) and a note that enabling/Changing the exam URL regenerates the key.
- Toggles: **Block copy & paste**, **Suppress right-click menu**, **Require fullscreen**, **Detect tab switching** (`detect_focus_loss`), **Detect device sharing** (`detect_session_sharing`).
- **IP allow-list** textarea (one CIDR per line) with inline validation mirroring the backend `ipaddress` check (advisory; backend authoritative).

Design-system compliance: tokens only, `rounded-xl` cards, toggle primitives from `ui/`, copy per §7.10. No emoji (§7.2). The panel is hidden/disabled when the blueprint is locked (`ONGOING`/`PASSED`) per §8.1/§7.7 — render the read-only inspector variant, do not just disable inputs.

### 10.3 Exam-side runtime — `ProctoringGate` + `useProctoring` (F8)

`ProctoringGate` wraps the exam content in `app/exam/[id]/page.tsx`:

- Reads the session's resolved policy (add `proctoring` to the exam session payload, or fetch it). If `require_seb` and `!isLikelySeb()`, render a **blocking** screen: "This exam must be taken in Safe Exam Browser," a **Download `.seb`** button, and short instructions. The student cannot proceed in a normal tab — and even if they bypass the gate (devtools), the backend `403`s every data request. State both facts in the PR (defense in depth).
- If policy is permissive, render children unchanged.

`useProctoring(sessionId, policy)` hook (attached in the exam page alongside `useHeartbeat`):

- If `suppress_context_menu`: `addEventListener('contextmenu', preventDefault)` and report `CONTEXT_MENU_ATTEMPT`.
- If `block_copy_paste`: block `copy`/`paste`/`cut` on the exam region and report `COPY_ATTEMPT`/`PASTE_ATTEMPT`. **Carve-outs:** never block inside the answer `<textarea>`/TipTap essay editor (the student must type/paste *their own* answer there) — scope listeners to the question/stimulus region, not the answer inputs. Get this wrong and you break essay answering.
- If `detect_focus_loss`: on `visibilitychange`→hidden or `blur`, report `FOCUS_LOST` (debounced — one report per blur, not per millisecond).
- If `require_fullscreen`: request fullscreen on start; on exit, report `FULLSCREEN_EXIT` and prompt to re-enter.
- Reports go through a tiny throttled queue to `POST /sessions/{id}/incidents` (never block the UI; failures are swallowed like heartbeat failures).
- Sends the device fingerprint on join (or first mount) if `detect_session_sharing`.

All deterrents are **advisory UX**; the comment block at the top of the hook must say so and point to the server guards.

### 10.4 Supervisor monitor page — `/sessions/[scheduledId]/monitor` (F10)

Reached from a `RowActionMenu` item ("Monitor") on each `ACTIVE` scheduled-session row in `ScheduledSessionsTable`. New route under `app/sessions/[scheduledId]/monitor/page.tsx`, gated to `CONSTRUCTOR`/`ADMIN` via `ProtectedRoute`.

- `PageShell width="wide"` (data table, §7.5). `BackButton` to `/sessions`. Eyebrow only if it adds location context (§7.6).
- **Live attempts table** (`useProctoringStore.fetchMonitor`, polled every 5s): columns — Student (`<Avatar email>` + name), Presence (`<Badge>` in the `--color-presence-*` tone, label `Active`/`Idle`/`Disconnected`), Current question (`Q4 / 20`), Last seen (`formatRelativeTime`), Flags (a danger badge when `flagged_for_review`), Incidents (count, links to filtered feed), Actions (`RowActionMenu`: Extend… / Pause / Resume / Terminate…). Sorting per §7.8 (default by presence then student).
- **Extend** opens a small dialog (minutes); **Pause/Resume** are immediate with a toast; **Terminate** uses `useConfirm()` with §7.10 copy ("Terminate this attempt? This force-submits the student's exam and cannot be undone." / confirm "Yes, terminate").
- **Incident feed** panel (polled every 10s): reverse-chronological list of `IncidentRow`s with severity-toned badges, type, relative time, student. Filter chips by severity (persisted per §7.8). `<EmptyState>` when clean ("No incidents recorded").
- Auto-refresh respects tab visibility (pause polling when hidden) to avoid waste.

`useProctoringStore`: `{ attempts, incidents, serverNow, page, fetchMonitor(id), fetchIncidents(id, filters), extend(id,min), pause(id), resume(id), terminate(id) }` — typed, no `any`.

### 10.5 Tokens (F10, §7.1)

Add to `frontend/src/app/globals.css`, defined for `dark`, `warm`, and `light-blue` (§7.12, zero code branching):

```
--color-presence-active / -active-fg / -active-bg
--color-presence-idle / -idle-fg / -idle-bg
--color-presence-disconnected / -disconnected-fg / -disconnected-bg
```

These map onto the existing success/warning/danger palettes per theme but get their own semantic names so the monitor never reaches for a literal color. Verify the §7.1 audit grep stays empty after this work.

---

## 11. API Endpoint Summary

### 11.1 SEB / config (F2/F3)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/scheduled-sessions/{id}/seb-config` | CONSTRUCTOR/ADMIN | downloads `.seb` for distribution |
| GET | `/api/student/sessions/{scheduledId}/seb-config` | STUDENT (enrolled) | student downloads `.seb` to launch |
| — | (guard) the 4 exam-data endpoints | session owner + SEB | `require_seb_integrity` added |

### 11.2 Monitor / interventions (F5/F6)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/scheduled-sessions/{id}/monitor` | CONSTRUCTOR/ADMIN + `assert_can_proctor` | paginated live roster |
| GET | `/api/scheduled-sessions/{id}/incidents` | CONSTRUCTOR/ADMIN + `assert_can_proctor` | paginated, filterable |
| POST | `/api/exam-sessions/{id}/extend` | CONSTRUCTOR/ADMIN + proctor | `{minutes}` |
| POST | `/api/exam-sessions/{id}/pause` | CONSTRUCTOR/ADMIN + proctor | 409 if already paused |
| POST | `/api/exam-sessions/{id}/resume` | CONSTRUCTOR/ADMIN + proctor | 409 if not paused |
| POST | `/api/exam-sessions/{id}/terminate` | CONSTRUCTOR/ADMIN + proctor | force-submit path |

### 11.3 Client incident reporting (F8)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/sessions/{id}/incidents` | session owner | rate-limited; `source=CLIENT`; constrained type |

Register the new `proctoring` router in `app/api/api.py` (note both the `/scheduled-sessions` monitor routes and the `/exam-sessions` intervention routes can live in one `proctoring.py` module with two `APIRouter`s or explicit prefixes).

---

## 12. Testing Plan (§5 test-driven verification — happy + edge + integration per feature)

### 12.1 Backend unit tests

- `test_proctoring_policy.py` — NULL config ⇒ permissive default; bad CIDR rejected; non-hex BEK rejected; client cannot widen `seb_config_key` via blueprint PATCH.
- `test_seb_service.py` — valid Config-Key hash passes; valid BEK hash passes; missing headers fail (records `SEB_HEADER_MISSING`); wrong hash fails (records `SEB_HASH_INVALID`); comparison is constant-time (uses `compare_digest`); `require_seb=False` is a transparent pass; URL reconstruction uses `PUBLIC_EXAM_URL_BASE`, not the internal host.
- `test_seb_config.py` — settings dict contains required keys; Config Key matches published SEB vectors (or, if BEK-only mode shipped, this is `xfail` with the documented reason + a tracked follow-up).
- `test_proctoring_guard.py` — each of the 4 exam-data endpoints returns `403` for a SEB-required test without headers, `200`/normal with valid headers; IP not in allowlist ⇒ `403` + `IP_NOT_ALLOWED`.
- `test_presence_service.py` — `touch` writes Redis with TTL; `snapshot` falls back to `last_seen_at`; presence thresholds map correctly at 0s/45s/120s.
- `test_interventions.py` — extend bumps `expires_at` and caps at `ends_at`; pause then heartbeat ⇒ `409`; resume restores the clock by the paused duration; terminate force-submits and is idempotent-safe (second call ⇒ `409`); every action writes the matching `SUPERVISOR_*` incident.
- `test_incident_service.py` — CRITICAL sets `flagged_for_review`; `detail` is stored verbatim but tests assert no answer/token keys; client reports are forced to `source=CLIENT` and server-mapped severity.
- `test_proctoring_authz.py` — STUDENT/REVIEWER `403` on monitor + interventions; CONSTRUCTOR/ADMIN allowed; a staff user cannot proctor a session they may not access (if the tighter `assert_can_proctor` is implemented).

### 12.2 Backend integration tests

- End-to-end SEB: enable SEB on a test → generate `.seb` → compute CK → simulate a request with `SHA256(url+CK)` → guard passes → tamper one byte → `403` + incident.
- Presence E2E: accept heartbeat → Redis presence set → monitor row shows `ACTIVE` → advance clock past 90s → `DISCONNECTED`.
- Pause E2E: pause → student heartbeat `409` → resume → heartbeat accepted → `expires_at` extended.
- Terminate E2E: terminate → session `SUBMITTED` → result row exists (grading path ran) → `terminated_by` set.
- Token invalidation still applies (a stale `token_version` is rejected on every new endpoint).

### 12.3 Frontend tests

- `proctoringPresence` threshold unit tests.
- `useProctoring`: contextmenu/copy/paste blocked in the question region but **allowed in the essay editor**; `FOCUS_LOST` debounced to one report per blur; reports posted with the constrained type.
- `ProctoringGate`: SEB-required + non-SEB UA ⇒ blocking screen with `.seb` download; permissive ⇒ children render.
- Monitor store: polling fetch shape, pause/resume/terminate dispatch, filter chip persistence.

### 12.4 E2E (Playwright) smoke

1. Staff enables SEB + copy-paste block on a test, downloads `.seb`.
2. Student opens the exam in a normal browser ⇒ sees the SEB-required gate (and a direct API call to the session returns `403`).
3. Staff opens the monitor for an active session, sees the student's row, presence, and (after the student switches tabs) a `FOCUS_LOST` incident.
4. Staff extends, then terminates the attempt; student sees the submitted/terminated state.

### 12.5 Manual verification (before merge)

- Real SEB instance opens the generated `.seb`, launches OpenVision, completes a heartbeat — guard passes. (The §6.3 verification gate.)
- A normal Chrome request to the same session returns `403` with a clean message and a logged `CRITICAL` incident.
- Monitor shows green/yellow/red transitions for a real attempt over ~2 minutes.
- No answer content, fingerprint, token, or header value appears anywhere in the incident table or logs.

---

## 13. Security Review Checklist

Create `directives/epoch_11_security_review.md` and complete before merge (mandatory per §1 / git strategy):

- [ ] All new endpoints require auth; staff endpoints require role; monitor/interventions also pass `assert_can_proctor`.
- [ ] SEB integrity is enforced server-side on all four exam-data endpoints; the client gate is advisory only.
- [ ] Hash comparison is constant-time (`hmac.compare_digest`).
- [ ] The browser-facing URL is reconstructed from `PUBLIC_EXAM_URL_BASE`, not the internal request host.
- [ ] `seb_config_key` can only be written by the `.seb` regeneration flow; a blueprint PATCH cannot inject one.
- [ ] Client-reported incidents are tagged `source=CLIENT`, restricted to the constrained type set, and severity is server-assigned.
- [ ] IP allow-list uses `ipaddress`/CIDR, derives the client IP from a trusted proxy header only.
- [ ] Incident `detail`, `client_ip`, and all logs contain no answers, no tokens, no raw fingerprints, no SEB header values.
- [ ] Device fingerprint is a salted hash; raw attributes are never stored; sharing detection is off by default.
- [ ] The incident table is append-only (no update/delete endpoints).
- [ ] Pagination on monitor + incident endpoints; no unbounded result sets.
- [ ] Pause/terminate cannot be triggered by students; extend cannot exceed `ends_at` except by the documented ADMIN override.
- [ ] Rate limiting on the client incident endpoint.
- [ ] No new secrets hardcoded; `FINGERPRINT_SALT` and `PUBLIC_EXAM_URL_BASE` are env-driven.
- [ ] `prisma db push` applies cleanly; no Alembic reintroduced.
- [ ] §7.1 color-token audit grep is still empty (presence tokens used, no literal Tailwind colors).
- [ ] No high-severity findings remain unresolved.

---

## 14. Operational Notes & Runbook

Create `docs/operations/proctoring.md`:

- **Enabling SEB for an exam:** educator flow, the `.seb` download, distributing it to lab machines / via the LMS, and the warning that changing the exam URL (or `PUBLIC_EXAM_URL_BASE`) invalidates every previously distributed `.seb` (CK changes).
- **The URL-mismatch failure mode (§6.4):** the #1 support call. If every SEB request `403`s, check Nginx path preservation, `PUBLIC_EXAM_URL_BASE`, trailing slashes, and `X-Forwarded-Proto`. Include a one-liner to recompute the expected hash for a given URL to diff against the header.
- **Exam-day supervisor guide:** how to open the monitor, read green/yellow/red, what `flagged_for_review` means, and when to extend vs pause vs terminate. Note that yellow during a big exam often means a flaky Wi-Fi client, not cheating.
- **Incident triage:** how to read the incident feed post-exam, export for review, and the severity meaning. Note that CLIENT incidents are signals, not proof.
- **Fallback:** if SEB validation blocks a legitimate hall (wrong key distributed), the documented mitigation is to toggle `require_seb` off for that test (staff action) — not to edit the database. State the trade-off plainly.

---

## 15. Implementation Phases (stage-gate commits per git strategy)

### Phase 0 — Preflight
- Branch `feature/epoch-11-seb-proctoring` from `main`.
- Run backend tests + frontend build to record a clean baseline.
- Confirm the exact test-editor route and the exam-launch URL the `.seb` `startURL` must target.
- Exit: baseline documented; this directive approved.

### Phase 1 — Data model + policy (F1, F7 schema)
- Add `proctoring_config` to `test_definitions`; presence/intervention fields to `exam_sessions`; the `proctoring_incidents` table + enums. `prisma db push`. Mirror SQLAlchemy models.
- `schemas/proctoring.py` (`ProctoringConfig` + validators); wire into `TestDefinitionBase`.
- `policy.py` (`resolve_proctoring_config`, `assert_can_proctor`); `incident_service.record_incident`.
- Tests: policy defaults, validators, incident creation + flag.
- Commit: `feat(11.1): add proctoring policy, presence fields, and incident log schema`.

### Phase 2 — SEB enforcement + config (F2, F3)
- `seb_service.py` (hash + `verify_seb_request`), `require_seb_integrity` dependency, guard the 4 endpoints, IP allow-list.
- `seb_config.py` (settings, CK, plist) + the two `.seb` download endpoints.
- Tests + the **real-SEB verification gate** (§6.3); if CK parity fails, ship BEK-only behind the flag with a tracked follow-up.
- Commit: `feat(11.1): enforce safe exam browser integrity and seb config generation`.

### Phase 3 — Presence + monitor + interventions (F4, F5, F6)
- `presence_service.py`; hook presence into `accept_interaction_events` (API) and the heartbeat worker (durable `last_seen_at`).
- `intervention_service.py`; `proctoring.py` router (monitor, incidents, extend/pause/resume/terminate); register in `api.py`.
- Tests: presence thresholds, monitor pagination, every intervention + its incident, authz.
- Commit: `feat(11.2): add supervisor status monitor and per-attempt interventions`.

### Phase 4 — Frontend config panel + exam runtime (F8, F10 part 1)
- `lib/` utils; Security & Proctoring editor panel; `ProctoringGate` + `useProctoring`; `POST /sessions/{id}/incidents` + rate limit; fingerprint on join.
- Presence tokens in `globals.css` (3 themes).
- Tests: gate, hook carve-outs, debounce.
- Commit: `feat(11.3): add client anti-cheat runtime and proctoring config panel`.

### Phase 5 — Monitor UI (F10 part 2)
- `/sessions/[scheduledId]/monitor` page, `useProctoringStore`, polling, RowActionMenu, incident feed, confirm/toast copy.
- Playwright smoke (§12.4). Theme-matrix check (§7.12).
- Commit: `feat(11.2): add live supervisor monitor dashboard`.

### Phase 6 — Security review + docs + merge readiness (F11)
- Complete `directives/epoch_11_security_review.md`; resolve high-severity findings.
- `docs/operations/proctoring.md`; `directives/epoch_11_progress_matrix.md` (kept current as stages land, not batched).
- Confirm §7.1 audit grep empty; full suite + build green.
- Commit: `docs(11): add epoch 11 security review, progress matrix, and proctoring runbook`.
- Merge to `main` only after a clean review (git strategy §2).

---

## 16. File-Level Work Plan

Expected additions:

```text
backend/app/models/proctoring_incident.py
backend/app/schemas/proctoring.py
backend/app/services/proctoring/__init__.py
backend/app/services/proctoring/policy.py
backend/app/services/proctoring/seb_service.py
backend/app/services/proctoring/seb_config.py
backend/app/services/proctoring/presence_service.py
backend/app/services/proctoring/incident_service.py
backend/app/services/proctoring/intervention_service.py
backend/app/api/endpoints/proctoring.py
backend/tests/test_proctoring_policy.py
backend/tests/test_seb_service.py
backend/tests/test_seb_config.py
backend/tests/test_proctoring_guard.py
backend/tests/test_presence_service.py
backend/tests/test_interventions.py
backend/tests/test_incident_service.py
backend/tests/test_proctoring_authz.py
frontend/src/lib/proctoringPolicy.ts
frontend/src/lib/proctoringPresence.ts
frontend/src/lib/sebDetection.ts
frontend/src/lib/deviceFingerprint.ts
frontend/src/hooks/useProctoring.ts
frontend/src/stores/useProctoringStore.ts
frontend/src/components/exam/ProctoringGate.tsx
frontend/src/components/sessions/ProctoringConfigPanel.tsx
frontend/src/app/sessions/[scheduledId]/monitor/page.tsx
frontend/src/components/proctoring/MonitorTable.tsx
frontend/src/components/proctoring/IncidentFeed.tsx
directives/epoch_11_security_review.md
directives/epoch_11_progress_matrix.md
docs/operations/proctoring.md
```

Expected modifications:

```text
prisma/schema.prisma
backend/app/models/test_definition.py
backend/app/models/exam_session.py
backend/app/schemas/test_definition.py
backend/app/core/config.py                      # PUBLIC_EXAM_URL_BASE, FINGERPRINT_SALT, presence/poll thresholds, SEB_CONFIG_KEY_ENABLED
backend/app/core/dependencies.py                # require_seb_integrity
backend/app/api/api.py                           # register proctoring router
backend/app/api/endpoints/sessions.py            # SEB guard on get/submit
backend/app/api/endpoints/interactions.py        # SEB guard on heartbeat/answers; pause-aware 409
backend/app/services/interactions_service.py     # presence touch; reject heartbeat while paused
backend/app/services/exam_sessions_service.py    # accept fingerprint on join; expose policy in payload
backend/app/services/heartbeat_ingestion/worker.py  # durable last_seen_at on flush
backend/app/core/rate_limit.py                   # rate_limit_incident
frontend/src/app/exam/[id]/page.tsx              # ProctoringGate + useProctoring
frontend/src/app/globals.css                     # --color-presence-* tokens (3 themes)
frontend/src/components/sessions/ScheduledSessionsTable.tsx  # "Monitor" row action
frontend/src/lib/api.ts                          # proctoring endpoints (if typed client)
.env.example                                     # new settings documented
```

---

## 17. Acceptance Criteria

Epoch 11 is done when all of the following hold:

- A test marked **Require SEB** cannot be taken in Chrome/Firefox: the four exam-data endpoints return `403` without a valid SEB header, and each rejection is a `CRITICAL` incident that flags the attempt.
- OpenVision generates a `.seb` file that a real SEB instance opens, and a SEB request to a guarded endpoint passes the Config-Key (or, documented, Browser-Exam-Key) check.
- The supervisor monitor lists every active attempt for a scheduled session with student identity, current question, last-seen time, and a green/yellow/red presence state that transitions correctly with real heartbeat activity, paginated and stateless.
- A supervisor can extend, pause, resume, and terminate an individual attempt; each action is recorded as a `SUPERVISOR_*` incident; terminate force-submits through the existing grading path.
- Context-menu suppression and copy/paste blocking work in the exam UI when configured (without breaking essay answering), and every client-observed violation is recorded as a `CLIENT` incident with server-assigned severity.
- IP allow-listing rejects off-allowlist requests with `403` + incident; device-sharing detection records a `CRITICAL` incident on fingerprint mismatch when enabled.
- The incident log is append-only and contains zero answer content, tokens, raw fingerprints, or SEB header values; logs are equally clean.
- All proctoring endpoints enforce auth + role + session-scoped access; students and reviewers are fully excluded from supervisor surfaces.
- The UI works under all three themes with the new presence token family; the §7.1 color audit grep is empty.
- Backend + frontend tests pass; the manual SEB verification and security review are complete with no unresolved high-severity findings.

---

## 18. Risks & Mitigations

### Risk: SEB Config Key parity is hard to get exactly right
- **Mitigation:** treat it as a verification gate, not an assumption (§6.3). Unit-test against published vectors; validate with a real SEB before claiming done. Ship BEK-only behind a flag if CK parity slips, with a tracked follow-up — honest and still secure.

### Risk: URL reconstruction mismatch behind the proxy breaks every hash
- **Mitigation:** single `PUBLIC_EXAM_URL_BASE` source; runbook covers path/encoding/forwarded-proto; a debug helper recomputes the expected hash for a given URL (§14).

### Risk: Copy/paste blocking breaks legitimate essay answering
- **Mitigation:** scope listeners to the question/stimulus region; explicitly exclude answer inputs (textarea/TipTap). Covered by a frontend test (§12.3).

### Risk: Adding a SUPERVISOR role balloons the epoch
- **Mitigation:** reuse `ADMIN`/`CONSTRUCTOR` with a session-scoped `assert_can_proctor` (§9.8). Document a dedicated role as a clean future option.

### Risk: Presence writes overwhelm Postgres during a surge
- **Mitigation:** presence is Redis-first on the hot path; the durable `last_seen_at` is written off-path by the worker that is already batching. The monitor reads Redis (§9.4). Aligns with the Epoch 13 architecture.

### Risk: Fingerprinting raises privacy concerns
- **Mitigation:** salted hash only, never raw attributes; off by default; documented in the security review. It is a weak signal by design, not an identity store.

### Risk: Pause/extend clock math corrupts the deadline
- **Mitigation:** the *only* authoritative deadline is `expires_at`; pause/resume adjust it explicitly and record the delta; covered by integration tests (§12.2).

### Risk: A new sessionstatus enum value ripples through grading/results
- **Mitigation:** model pause/flag/terminate as orthogonal fields; terminate routes through the existing `SUBMITTED` path so no downstream code learns a new state (§7.2).

---

## 19. Rollback Plan

All schema changes are additive (new nullable columns, a new table, new enums). To disable proctoring without a code revert:

1. Per-test: set `proctoring_config.require_seb = false` (and other flags off) — the guard becomes a transparent pass-through immediately.
2. Global kill switch: a `PROCTORING_ENABLED` setting (default true). When false, `require_seb_integrity` short-circuits to a pass and the monitor still reads (presence/incidents are harmless to keep). Use only as an exam-day emergency valve, documented in incident notes.
3. The monitor and incident log are read-only/append-only and safe to leave running even if enforcement is disabled.
4. Roll back frontend gate independently of backend enforcement if the client gate is the failure source — the backend `403` remains the real control.

---

## 20. Definition of Done

- Code implemented per this directive; no unrelated refactors mixed in.
- Tests added and passing (unit + integration + frontend + E2E smoke).
- Real-SEB manual verification completed (or BEK-only fallback shipped with a documented, tracked follow-up).
- `directives/epoch_11_security_review.md` complete; no unresolved high-severity findings.
- `directives/epoch_11_progress_matrix.md` kept current through the epoch.
- `docs/operations/proctoring.md` written.
- Theme matrix (§7.12) and §7.1 color-token audit pass.
- Conventional Commit history; merged to `main` only after a clean security review.

---

## 21. Final Implementation Note

Epoch 11 is a trust epoch. The exam already works and already scales; this epoch makes a summative attempt *defensible*. If implementation pressure forces trade-offs, preserve these invariants in order:

1. **The server is the only real guard.** Every control must hold against a student who deletes the frontend. SEB, IP, ownership, and role checks live in the service/dependency layer; the client only mirrors them for UX.
2. **Never leak proctoring data.** No answers, tokens, raw fingerprints, or header values in incidents or logs — ever.
3. **Never invent SEB.** Use the real Config-Key / Browser-Exam-Key contract, and do not claim SEB works until a real SEB instance has validated against a running OpenVision.

Everything else — the monitor polish, the fingerprint heuristics, fullscreen enforcement — is refinement on top of those three.
