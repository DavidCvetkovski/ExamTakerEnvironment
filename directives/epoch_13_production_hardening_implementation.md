# Epoch 13 — Scalability, Concurrency & Production Hardening Implementation

> **Status:** Proposed implementation directive. Per `AGENTS.md` §6, this file is the required blueprint before implementation work begins.
> **Branch:** `epoch-13-production-hardening`
> **Depends on:** Epoch 3 auth/RBAC/JWT, Epoch 5 exam-taking heartbeat flow, Epoch 6 grading, Epoch 8.x design system and frontend state stores, Epoch 9 account/session invalidation, Epoch 10 accommodations/accessibility, current Prisma schema ownership.
> **Primary objective:** Make OpenVision safe and predictable under high-stakes exam load: hundreds of students authenticating, joining, answering, auto-saving, submitting, and being observed concurrently.

## 1. Executive Summary

Epoch 13 is not a feature epoch. It is the moment OpenVision starts behaving like a production exam platform instead of a local prototype that happens to have good product surfaces.

The target failure mode is the classic university exam surge: 500 to 800 students sign in at the same wall-clock minute, join the same scheduled exam, and start sending heartbeat batches every few seconds. Today the core path works functionally, but several parts are still fragile under load:

- Heartbeats are written synchronously to Postgres on the request path.
- There is no durable ingestion queue, no dead-letter path, and no idempotency key for retried client events.
- Redis exists in `docker-compose.yml`, but it is not used as a production reliability primitive yet.
- CORS and secrets have permissive development defaults.
- The current CI workflow only covers backend schema verification and does not run the full test suite, frontend type checks, lint, Docker builds, or load tests.
- There are no production Dockerfiles, no reverse proxy config, and no production compose file.
- Logging, correlation IDs, metrics, and alert-worthy error visibility are not centralized.
- Rate limiting and security headers are not enforced consistently.

Epoch 13 fixes those gaps in a modular way:

1. **Harden configuration and runtime contracts** so production cannot boot with development secrets, wildcard origins, or missing infrastructure.
2. **Move heartbeat persistence behind Redis Streams** with an async worker, idempotency, batch flushes, dead-letter handling, and graceful degradation.
3. **Add Redis-backed caching and rate limiting** where it reduces read pressure and protects sensitive endpoints.
4. **Add production deployment artifacts**: multi-stage Dockerfiles, `docker-compose.prod.yml`, Nginx, health/readiness checks, and documented environment variables.
5. **Add observability**: request IDs, structured JSON logs, Prometheus-compatible metrics, worker metrics, and optional Sentry.
6. **Expand CI/CD** to run backend tests, frontend lint/type/build, Playwright smoke tests, Docker image builds, coverage, dependency checks, and load-test smoke gates.
7. **Run load tests** for login surge, exam join surge, heartbeat throughput, and submission burst.
8. **Perform a manual security review** of the changed surface before merge, per `AGENTS.md` §1.

The end state is not "infinite scale." The end state is a clear, testable capacity envelope with known controls, known dashboards, known bottlenecks, and no single synchronous write path that can collapse the exam experience during a surge.

## 2. Non-Negotiable Engineering Constraints

Every change in this epoch must respect the project contract in `AGENTS.md`.

### 2.1 Security

- Every route touched in this epoch continues to use `Depends(get_current_user)` or an explicit public health endpoint exception.
- Every request body is validated by Pydantic. No untyped dict request bodies on public endpoints.
- Every ownership check remains server-side. Heartbeat enqueue must validate that the user owns the session before accepting events.
- No hardcoded secrets, DSNs, Sentry keys, Redis passwords, cookie secrets, or registry credentials.
- Production startup must fail if `SECRET_KEY` is the development fallback.
- CORS must be configured from explicit allowed origins in environment variables.
- Rate limiting must protect auth, refresh, heartbeat, import, and write-heavy endpoints.
- Security headers must be applied globally on frontend/proxy responses.
- SQL access remains ORM-based through Prisma/SQLAlchemy. No interpolated SQL.
- The final PR must include a deliberate manual security review section.

### 2.2 Maintainability

- Route handlers stay thin: validate, authorize, delegate to services, shape response.
- Heartbeat queue logic lives in an `app/queues/` or `app/services/heartbeat_ingestion/` module, not inside endpoint files.
- Worker entrypoints are separate from API startup so API containers and worker containers can scale independently.
- Configuration is centralized in `app/core/config.py`.
- Public functions introduced in backend modules have docstrings.
- TypeScript changes avoid `any`; use explicit interfaces and `unknown` with narrowing when needed.
- No dead code, no commented-out experiments, no placeholder TODOs in implementation files.

### 2.3 Modularity

Epoch 13 adds infrastructure modules without swallowing business modules:

- `core/` owns config, logging, metrics, security headers, rate limiting primitives, Redis client lifecycle.
- `services/interactions_service.py` keeps domain rules for session ownership and answer reconstruction.
- A new heartbeat ingestion module owns queue serialization, Redis Streams, worker batch flushing, idempotency, and dead-letter handling.
- Deployment artifacts live at repo root and service-specific Dockerfiles live beside service roots.
- Load tests live in `load-tests/`.
- CI workflows live in `.github/workflows/`.

### 2.4 Scalability

- Heartbeat writes are accepted quickly and flushed in batches.
- Postgres connection usage is bounded and pool-aware.
- Frequently filtered DB fields must be indexed.
- All list endpoints remain paginated.
- Read-heavy metadata may be cached with explicit invalidation rules.
- Stateless API containers: all shared state lives in Postgres, Redis, or JWT/cookies.
- Workers can be scaled horizontally without duplicate event writes.

### 2.5 Industry Standards

- Use standard FastAPI middleware patterns.
- Use Redis Streams consumer groups for queue semantics rather than a hand-rolled list poller.
- Use Prometheus metrics naming conventions.
- Use Conventional Commits.
- CI blocks merges on lint, tests, type checks, builds, and security gates.
- Docker images run as non-root users.
- Health checks distinguish liveness from readiness.
- Load-test thresholds are written down and enforced in CI smoke mode.

## 3. Current System Baseline

This section is intentionally concrete so implementers can verify assumptions before coding.

### 3.1 Existing Backend Surfaces

- App entrypoint: `backend/app/main.py`
- API router: `backend/app/api/api.py`
- Auth routes: `backend/app/api/endpoints/auth.py`
- Session routes: `backend/app/api/endpoints/sessions.py`
- Heartbeat routes: `backend/app/api/endpoints/interactions.py`
- Heartbeat persistence: `backend/app/services/interactions_service.py`
- Auth dependency: `backend/app/core/dependencies.py`
- Settings: `backend/app/core/config.py`
- Prisma singleton: `backend/app/core/prisma_db.py`
- Interaction schemas: `backend/app/schemas/interaction_event.py`

Current heartbeat behavior:

1. Frontend accumulates answer, flag, and navigation events in `useExamStore`.
2. `useHeartbeat` flushes roughly every 2 seconds and on visibility/unload.
3. `POST /api/sessions/{session_id}/heartbeat` validates the Pydantic batch.
4. `save_interaction_events` verifies session ownership and status.
5. The request path calls `prisma.interaction_events.create_many`.

That is correct functionally, but it makes every student auto-save compete for direct database writes in the request path.

### 3.2 Existing Frontend Surfaces

- API client: `frontend/src/lib/api.ts`
- Exam store: `frontend/src/stores/useExamStore.ts`
- Heartbeat hook: `frontend/src/hooks/useHeartbeat.ts`
- Exam components: `frontend/src/components/exam/`

Current frontend retry behavior:

- In-memory pending events remain if the request fails.
- On failure/unload, events are copied to `localStorage`.
- On answer recovery, the store tries to drain `localStorage` back to the heartbeat endpoint.

This is a good foundation, but without idempotency, retried events can be inserted more than once after ambiguous network failures.

### 3.3 Existing Infrastructure

- `docker-compose.yml` starts Postgres and Redis for local development.
- No production Dockerfiles exist yet.
- No `docker-compose.prod.yml` exists yet.
- No Nginx reverse proxy config exists yet.
- Existing GitHub Actions workflow: `.github/workflows/backend-tests.yml`
- Current workflow provisions Postgres/Redis, installs backend dependencies, runs flake8 checks, applies Prisma schema, and runs `verify_stage1.py`.
- It does not run the full pytest suite, frontend lint/type/build, Docker image builds, Playwright checks, load tests, or dependency scans.

## 4. Scope

| ID | Deliverable | Main Surfaces |
|---|---|---|
| F1 | Environment and runtime configuration hardening | `backend/app/core/config.py`, `.env.example`, startup checks, CORS |
| F2 | Redis-backed heartbeat ingestion pipeline | Backend schemas, service, queue module, worker entrypoint, frontend event IDs |
| F3 | Idempotent event persistence and scalable answer recovery | Prisma schema, interaction service, worker, tests |
| F4 | Connection pooling and production database posture | SQLAlchemy/Prisma connection config, PgBouncer, Docker compose |
| F5 | Caching layer for read-heavy metadata | Redis client, item/test/session cache helpers, invalidation |
| F6 | Rate limiting and API abuse protection | Middleware/dependencies, Redis counters, endpoint policies |
| F7 | Observability and monitoring | Logging middleware, metrics endpoint, Sentry, dashboards docs |
| F8 | Containerization and deployment | Backend/frontend Dockerfiles, worker image mode, Nginx, production compose |
| F9 | CI/CD hardening | GitHub Actions workflows, coverage, dependency checks, Docker builds |
| F10 | Load testing and capacity gates | `load-tests/`, k6 or Locust scenarios, threshold reports |
| F11 | Manual security review and operational runbooks | `directives/epoch_13_security_review.md`, `docs/operations/` |

## 5. Out of Scope

- Kubernetes manifests. The production compose stack should be orchestration-ready, but Kubernetes is a later deployment epoch.
- Full LTI/Canvas scaling. Epoch 12 owns integration semantics; Epoch 13 only ensures general auth/session infrastructure can tolerate load.
- WebSocket proctoring. Epoch 11 owns SEB/proctoring.
- Multi-region database replication.
- Full disaster recovery automation.
- Rewriting Prisma to SQLAlchemy or vice versa.
- Replacing the frontend state architecture.
- Changing exam scoring semantics.

## 6. Target Capacity Envelope

This epoch must publish measured numbers, not vibes.

### 6.1 Minimum Load Targets

The implementation is accepted only if local/containerized load tests meet these thresholds on a reasonable developer machine or CI-sized runner. Production hardware can exceed them, but the software must prove the path is structurally sound.

| Scenario | Target | Threshold |
|---|---:|---:|
| Login surge | 500 logins in 60 seconds | P95 < 750 ms, error rate < 1% |
| Scheduled exam join | 500 joins in 90 seconds | P95 < 1000 ms, error rate < 1% |
| Heartbeat enqueue | 500 requests/sec, 1-20 events/request | API P99 < 200 ms, accepted error rate < 0.5% |
| Worker flush | 500 events/sec sustained for 10 minutes | Queue lag returns to < 1,000 pending within 60 seconds after test |
| Answer recovery | 500 students load saved answers | P95 < 750 ms |
| Submission burst | 500 submissions in 120 seconds | P95 < 1500 ms, grading failures logged and isolated |

### 6.2 Operational SLOs

Initial operational targets:

- API availability during active exam windows: 99.9%.
- Heartbeat accepted response: P99 under 200 ms while Redis and Postgres are healthy.
- Heartbeat durability: accepted event loss rate must be 0 under normal worker restart tests.
- Queue lag alert: page if heartbeat stream lag exceeds 10,000 events or oldest pending event exceeds 60 seconds during active exams.
- Auth rate limit false positives: 0 for expected exam login surge when requests are distributed across legitimate users.

## 7. Architecture Overview

### 7.1 High-Level Flow

```mermaid
flowchart LR
    Browser["Student Browser"] --> API["FastAPI API Container"]
    API --> Auth["Auth/RBAC Dependencies"]
    API --> Redis["Redis Streams + Cache + Rate Limits"]
    Redis --> Worker["Heartbeat Worker Container"]
    Worker --> PG["Postgres via PgBouncer"]
    API --> PG
    API --> Metrics["/metrics"]
    Worker --> MetricsWorker["Worker Metrics"]
    API --> Logs["Structured Logs"]
    Worker --> Logs
    Nginx["Nginx TLS Reverse Proxy"] --> Browser
    Browser --> Nginx
    Nginx --> API
    Nginx --> Next["Next.js Frontend"]
```

### 7.2 Runtime Components

- `frontend`: Next.js production server.
- `backend-api`: FastAPI app. Handles auth, session reads/writes, heartbeat enqueue, admin surfaces.
- `heartbeat-worker`: Same backend image, different command. Consumes Redis Streams and batch flushes interaction events.
- `postgres`: Primary relational database.
- `pgbouncer`: Connection pooler in front of Postgres for API and workers.
- `redis`: Queue, cache, and rate-limit backend.
- `nginx`: Reverse proxy, TLS termination, static security headers, request size limits.

### 7.3 Queue Choice

Use **Redis Streams** rather than simple lists:

- Consumer groups support multiple workers.
- Pending entries list supports worker crash recovery.
- Stream IDs provide ordering within a stream.
- Acknowledgement is explicit.
- Dead-letter handling can be deterministic after retry thresholds.

Do not use Celery for Epoch 13 unless there is a strong reason during implementation. Redis Streams are enough, keep the dependency surface smaller, and make the pipeline easier to inspect.

## 8. Data Model Changes

### 8.1 Interaction Event Idempotency

Add client-generated event IDs so retry paths are safe.

In `prisma/schema.prisma`, extend `interaction_events`:

```prisma
model interaction_events {
  id                 String               @id @default(uuid()) @db.Uuid
  session_id         String               @db.Uuid
  client_event_id    String?              @db.Uuid
  learning_object_id String?              @db.Uuid
  item_version_id    String?              @db.Uuid
  event_type         interactioneventtype
  payload            Json
  created_at         DateTime             @default(now()) @db.Timestamp(6)
  received_at        DateTime             @default(now()) @db.Timestamp(6)
  exam_sessions      exam_sessions        @relation(fields: [session_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([session_id], map: "ix_interaction_events_session_id")
  @@index([session_id, created_at], map: "ix_interaction_events_session_created_at")
  @@unique([session_id, client_event_id], map: "uq_interaction_events_session_client_event")
}
```

Notes:

- `client_event_id` is nullable during rollout so old clients do not break immediately.
- New clients must always send it.
- The worker treats missing `client_event_id` as non-idempotent legacy input, but tests should cover the new idempotent path.
- `received_at` records when the API accepted the event batch. `created_at` remains the ordering timestamp used for answer reconstruction.
- Add matching SQLAlchemy mirror fields in `backend/app/models/interaction_event.py`.

### 8.2 Heartbeat Queue Metadata

Do **not** create a Postgres `heartbeat_jobs` table in the first implementation. Redis Streams already represent pending work. Postgres should only receive durable interaction events.

If operations later require long-term audit of queue failures, add a dead-letter persistence table in a follow-up. For Epoch 13, dead-letter entries remain in a Redis stream with metrics and inspection commands.

### 8.3 Additional Index Audit

Review and add indexes where current high-traffic filters need them:

- `exam_sessions.student_id`
- `exam_sessions.student_id, scheduled_session_id`
- `exam_sessions.status`
- `interaction_events.session_id, created_at`
- `session_results.student_id`
- Existing FK indexes should remain intact.

Prisma example:

```prisma
model exam_sessions {
  // existing fields

  @@index([scheduled_session_id], map: "ix_exam_sessions_scheduled_session_id")
  @@index([student_id], map: "ix_exam_sessions_student_id")
  @@index([student_id, scheduled_session_id], map: "ix_exam_sessions_student_scheduled")
  @@index([status], map: "ix_exam_sessions_status")
}
```

## 9. Backend Implementation

### 9.1 Configuration Hardening (F1)

Replace the current permissive `os.environ.get` style with validated settings.

Target file:

- `backend/app/core/config.py`

Recommended dependency:

- `pydantic-settings`

Add to `backend/requirements.txt`:

```text
pydantic-settings==2.6.1
prometheus-client==0.21.1
slowapi==0.1.9
sentry-sdk[fastapi]==2.19.2
```

If exact versions need adjustment for compatibility, pin them after installation and record the reason in the PR.

Settings model:

```python
from functools import lru_cache
from pydantic import AnyHttpUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated runtime settings for OpenVision."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    ENVIRONMENT: str = Field(default="development")
    APP_VERSION: str = Field(default="0.1.0")
    SECRET_KEY: SecretStr
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    TRUSTED_HOSTS: list[str] = ["localhost", "127.0.0.1"]
    SENTRY_DSN: str | None = None
    RATE_LIMIT_ENABLED: bool = True
    HEARTBEAT_STREAM_NAME: str = "openvision:heartbeat:v1"
    HEARTBEAT_CONSUMER_GROUP: str = "heartbeat-workers"
    HEARTBEAT_WORKER_BATCH_SIZE: int = 500
    HEARTBEAT_WORKER_BLOCK_MS: int = 2500
    HEARTBEAT_MAX_RETRIES: int = 5

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        allowed = {"development", "test", "staging", "production"}
        if value not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of {sorted(allowed)}")
        return value

    def assert_production_safe(self) -> None:
        """Fail fast when production is configured with unsafe development defaults."""
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY.get_secret_value() == "dev-secret-key-change-in-production-please":
                raise RuntimeError("Production cannot start with the development SECRET_KEY.")
            if not self.CORS_ALLOWED_ORIGINS:
                raise RuntimeError("Production requires explicit CORS_ALLOWED_ORIGINS.")
```

Implementation rules:

- Use `@lru_cache` for `get_settings()`.
- Preserve compatibility with existing env names where possible.
- Production should fail fast; development should stay easy to boot.
- Add `.env.example` documenting every required variable.
- Do not commit a real `.env`.

### 9.2 Redis Client Lifecycle

Add:

- `backend/app/core/redis.py`

Responsibilities:

- Create a singleton async Redis client.
- Connect during FastAPI lifespan.
- Close during shutdown.
- Provide `get_redis()` dependency/helper.
- Provide a ping check for readiness.

Sketch:

```python
from redis.asyncio import Redis
from app.core.config import settings

redis_client: Redis | None = None


async def connect_redis() -> None:
    """Connect to Redis and verify the server is reachable."""
    global redis_client
    redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    await redis_client.ping()


async def disconnect_redis() -> None:
    """Close the Redis connection."""
    if redis_client is not None:
        await redis_client.aclose()


def get_redis() -> Redis:
    """Return the initialized Redis client."""
    if redis_client is None:
        raise RuntimeError("Redis client is not connected.")
    return redis_client
```

Wire this into `backend/app/main.py` lifespan after Prisma connects.

### 9.3 Health and Readiness Endpoints

Add explicit endpoints:

- `GET /health/live`
- `GET /health/ready`

Keep `GET /health` as a compatibility alias if useful.

Liveness:

- Returns process up.
- Does not perform network calls.

Readiness:

- Confirms Prisma/Postgres can answer a cheap query.
- Confirms Redis ping succeeds.
- Returns `503` if either required dependency is unavailable.

Response shape:

```json
{
  "status": "ready",
  "version": "0.1.0",
  "environment": "staging",
  "checks": {
    "postgres": "ok",
    "redis": "ok"
  }
}
```

Security note:

- Do not expose credentials, hostnames with passwords, stack traces, or internal exception detail in health responses.

### 9.4 Heartbeat API Contract (F2/F3)

Update schema:

- `backend/app/schemas/interaction_event.py`

New fields:

```python
class InteractionEventCreate(BaseModel):
    """Schema for a single interaction event within a heartbeat batch."""
    client_event_id: UUID
    learning_object_id: UUID | None = None
    item_version_id: UUID | None = None
    event_type: InteractionEventType
    payload: dict[str, Any]
    client_created_at: datetime | None = None
```

Add validators:

- `events` length 1-100 remains.
- `payload` serialized size must be bounded. Recommended max: 64 KB per event, 512 KB per request.
- For `ANSWER_CHANGE` and `FLAG_TOGGLE`, require `learning_object_id` and `item_version_id`.
- For `NAVIGATION`, allow both IDs to be null.
- Reject unknown event payload structures only where the event type has a stable schema. Keep essay answers flexible but size-limited.

Response shape:

```python
class HeartbeatResponse(BaseModel):
    """Response returned after heartbeat events are durably accepted for processing."""
    accepted: int
    queued: int
    server_timestamp: datetime
    queue_lag_estimate: int | None = None
```

Compatibility:

- The frontend currently expects `saved`. During rollout either keep `saved` as an alias or update all consumers in the same PR.
- Recommended response includes both for one release:

```json
{
  "accepted": 8,
  "queued": 8,
  "saved": 8,
  "server_timestamp": "2026-05-30T10:00:00Z"
}
```

### 9.5 Heartbeat Queue Module

Add a focused module:

- `backend/app/services/heartbeat_ingestion/__init__.py`
- `backend/app/services/heartbeat_ingestion/schemas.py`
- `backend/app/services/heartbeat_ingestion/queue.py`
- `backend/app/services/heartbeat_ingestion/worker.py`
- `backend/app/services/heartbeat_ingestion/persistence.py`

#### 9.5.1 Queue Message Shape

Internal queue payload:

```python
class HeartbeatQueueEvent(BaseModel):
    """A validated interaction event accepted by the API and awaiting persistence."""

    request_id: str
    session_id: str
    student_id: str
    client_event_id: str
    learning_object_id: str | None
    item_version_id: str | None
    event_type: str
    payload: dict[str, Any]
    client_created_at: datetime | None
    received_at: datetime
```

Serialize as compact JSON using `model_dump_json()`.

Redis Stream:

- Name: `settings.HEARTBEAT_STREAM_NAME`
- Field: `event`
- Value: JSON string

Dead-letter stream:

- Name: `openvision:heartbeat:dead-letter:v1`
- Fields: `event`, `error`, `failed_at`, `attempts`, `source_stream_id`

#### 9.5.2 Enqueue Logic

Endpoint path remains:

- `POST /api/sessions/{session_id}/heartbeat`

Route still delegates to `interactions_service`.

Modify `save_interaction_events` into a compatibility wrapper or replace with:

- `accept_interaction_events(session_id, events, current_user)`

Rules:

1. Load session by `session_id`.
2. Verify it exists.
3. Verify `session.student_id == current_user.id`.
4. Auto-finalize timed-out sessions exactly as today.
5. Reject non-`STARTED` sessions with `409`.
6. Convert Pydantic events into `HeartbeatQueueEvent`.
7. `XADD` all events to the Redis stream in one pipeline.
8. Return accepted count immediately.

Never skip ownership validation just because the worker will validate later. The API is the trust boundary.

#### 9.5.3 Worker Consumption

Worker command:

```bash
python -m app.workers.heartbeat_worker
```

Add:

- `backend/app/workers/__init__.py`
- `backend/app/workers/heartbeat_worker.py`

Worker lifecycle:

1. Connect Prisma.
2. Connect Redis.
3. Ensure stream consumer group exists (`XGROUP CREATE ... MKSTREAM`; ignore BUSYGROUP).
4. Loop with `XREADGROUP`.
5. Decode messages into `HeartbeatQueueEvent`.
6. Batch by configured batch size or block interval.
7. Flush to Postgres with idempotency.
8. `XACK` only after successful DB flush.
9. On validation/permanent errors, send to dead-letter stream and `XACK`.
10. On transient DB errors, leave pending for retry.
11. Periodically claim stale pending entries from crashed consumers.

Batch persistence:

- Group records by session where helpful, but do not sacrifice simplicity.
- Use `create_many(skip_duplicates=True)` if supported by Prisma Client Python for the target version. If not supported, fallback to a transaction with duplicate detection by `(session_id, client_event_id)`.
- The unique constraint is the authority for idempotency.

Flush record shape:

```python
{
    "session_id": event.session_id,
    "client_event_id": event.client_event_id,
    "learning_object_id": event.learning_object_id,
    "item_version_id": event.item_version_id,
    "event_type": event.event_type,
    "payload": Json(event.payload),
    "created_at": event.client_created_at or event.received_at,
    "received_at": event.received_at,
}
```

Ordering:

- Do not artificially stagger timestamps in the new worker.
- Client event IDs and client timestamps should be stable.
- If two events have identical `created_at`, answer recovery should order by `created_at desc, received_at desc, id desc` where supported.

#### 9.5.4 Pending and Retry Policy

Retry policy:

- Transient Postgres/Redis errors: leave message pending.
- Worker should periodically inspect pending entries older than 30 seconds and claim them.
- After `HEARTBEAT_MAX_RETRIES`, move to dead-letter and acknowledge.

Metrics:

- `openvision_heartbeat_events_enqueued_total`
- `openvision_heartbeat_events_persisted_total`
- `openvision_heartbeat_events_duplicate_total`
- `openvision_heartbeat_events_dead_lettered_total`
- `openvision_heartbeat_worker_flush_seconds`
- `openvision_heartbeat_stream_lag`
- `openvision_heartbeat_pending_oldest_seconds`

### 9.6 Answer Recovery Scalability

Current recovery fetches all answer events and all flag events for a session, then reconstructs latest state in Python. This is acceptable for small attempts but grows linearly with event count.

Epoch 13 has two acceptable implementation paths. Choose one during implementation after checking Prisma query support.

#### Option A — Snapshot Table (Preferred)

Add a table that tracks latest answer/flag state per session and learning object.

Prisma:

```prisma
model session_answer_state {
  id                 String   @id @default(uuid()) @db.Uuid
  session_id         String   @db.Uuid
  learning_object_id String   @db.Uuid
  item_version_id    String?  @db.Uuid
  answer_payload     Json?
  flagged            Boolean  @default(false)
  answer_event_id    String?  @db.Uuid
  flag_event_id      String?  @db.Uuid
  updated_at         DateTime @default(now()) @db.Timestamp(6)
  exam_sessions      exam_sessions @relation(fields: [session_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([session_id, learning_object_id], map: "uq_session_answer_state_session_lo")
  @@index([session_id], map: "ix_session_answer_state_session_id")
}
```

Worker updates this table in the same transaction/batch window as event insertion.

Pros:

- Answer recovery becomes one bounded query.
- Grading can read a canonical latest state.
- Fewer repeated scans during crash recovery.

Cons:

- More schema and worker complexity.
- Upsert semantics must be correct for ordering.

#### Option B — Indexed Query Optimization (Fallback)

Keep event-only storage but improve indexes and query limits:

- Add `(session_id, event_type, created_at)` index.
- Query only relevant fields.
- Use SQL distinct-on equivalent if Prisma supports it, or raw SQL only if parameterized and reviewed.

Option A is preferred because answer recovery is a core student reliability path.

### 9.7 Frontend Event IDs

Update:

- `frontend/src/stores/useExamStore.ts`
- `frontend/src/hooks/useHeartbeat.ts`

Interaction event interface:

```ts
export interface InteractionEvent {
    client_event_id: string;
    learning_object_id: string | null;
    item_version_id: string | null;
    event_type: 'ANSWER_CHANGE' | 'FLAG_TOGGLE' | 'NAVIGATION';
    payload: Record<string, unknown>;
    client_created_at: string;
}
```

Generation:

- Use `crypto.randomUUID()` when available.
- Provide a narrow fallback for older browsers:

```ts
function createClientEventId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Convert to RFC4122-ish UUID string.
}
```

Do not regenerate IDs when events move to localStorage or retry. The ID must travel with the event.

### 9.8 Rate Limiting (F6)

Add Redis-backed rate limiting.

Recommended module:

- `backend/app/core/rate_limit.py`

Policy table:

| Endpoint Class | Key | Limit |
|---|---|---:|
| Login | IP + normalized email | 10/minute, 100/hour |
| Register | IP | 5/minute |
| Refresh | user/session cookie if available, else IP | 60/minute |
| Heartbeat | user ID + session ID | 60/minute |
| Import/upload | user ID | 10/minute |
| General write endpoints | user ID | 120/minute |

Important exam nuance:

- Do not rate-limit legitimate heartbeat bursts too aggressively. The frontend flushes every 2 seconds, so 60/minute per user/session allows retries and visibility-change flushes.
- Login surge rate limiting must not lock out an entire exam hall behind one NAT. Use IP + email, not IP alone, for login.

Response:

- Return `429 Too Many Requests`.
- Include `Retry-After` where possible.
- Log rate-limit events with request ID, route pattern, user ID if known, and key hash, not raw password/email.

### 9.9 Caching (F5)

Add cache helpers without making Redis the source of truth.

Candidate module:

- `backend/app/core/cache.py`

Cache keys:

- `test_definition:{id}:snapshot:v1`
- `item_version:{id}:approved:v1`
- `scheduled_session:{id}:summary:v1`
- `user:{id}:public:v1` only if invalidation is reliable; otherwise skip user cache.

Recommended first cache:

- Cache resolved test definition metadata and item snapshots used during `join_scheduled_session_for_student`.

Invalidation:

- Invalidate when item versions are created/updated/reviewed.
- Invalidate when test definitions are changed.
- TTL fallback: 5 minutes for metadata, shorter during development.

Rules:

- Never cache auth token validation results in Epoch 13. Token version and `is_active` must remain database-authoritative unless a carefully designed invalidation strategy is added later.
- Never cache per-student answers in Redis as the source of truth. Redis can queue; Postgres remains durable.

### 9.10 Connection Pooling (F4)

Production target:

- API and worker connect to PgBouncer.
- PgBouncer connects to Postgres.
- Pool mode: transaction, unless Prisma Client Python has compatibility issues requiring session mode. Verify before finalizing.

Environment:

- `DATABASE_URL` for application containers points to PgBouncer.
- `DIRECT_DATABASE_URL` points to Postgres for schema application if needed.

Implementation:

- Add `pgbouncer` service in `docker-compose.prod.yml`.
- Add `pgbouncer/pgbouncer.ini`.
- Add `pgbouncer/userlist.txt` generation instructions, not real secrets.

Prisma warning:

- Prisma and PgBouncer have compatibility considerations. Test generated Python client under PgBouncer before accepting this deliverable.
- If PgBouncer blocks Prisma behavior, document the limitation and use bounded direct connections temporarily with worker/API concurrency caps. Do not pretend pooling is complete.

### 9.11 Security Headers

Backend middleware or Nginx should set:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` unless LTI embedding requires a narrower allowlist in Epoch 12 contexts.
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` with minimal browser capabilities.
- `Strict-Transport-Security` in production HTTPS only.
- Content Security Policy for frontend responses.

CSP initial policy:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://<api-domain>;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

If TipTap/KaTeX/Next require specific adjustments, document each exception.

### 9.12 Structured Logging (F7)

Add:

- `backend/app/core/logging.py`
- `backend/app/middleware/request_context.py`

Each API log line should include:

- `timestamp`
- `level`
- `message`
- `request_id`
- `method`
- `path`
- `route`
- `status_code`
- `duration_ms`
- `user_id` when authenticated and safe to include
- `role` when authenticated
- `client_ip` from trusted proxy headers only if configured
- `environment`
- `version`

Rules:

- Never log passwords, access tokens, refresh tokens, full Authorization headers, or raw cookies.
- Avoid logging full answer payloads. Log counts and sizes instead.
- Include exception stack traces in server logs, but not in API responses.

Request ID:

- Read `X-Request-ID` if provided by trusted proxy; otherwise generate UUID.
- Return `X-Request-ID` on every response.
- Add request ID to queue messages so worker logs can connect heartbeat acceptance to persistence.

### 9.13 Metrics (F7)

Add Prometheus endpoint:

- `GET /metrics`

Protecting `/metrics`:

- In local/dev, public is acceptable.
- In staging/prod, expose only internally via Nginx network rules or basic auth at proxy layer. Do not require app JWT for Prometheus scraping unless explicitly configured.

Metrics:

- HTTP request count by method, route, status.
- HTTP request latency histogram.
- Auth login success/failure count.
- Rate limit rejection count.
- Heartbeat enqueue count.
- Heartbeat enqueue latency.
- Worker batch flush count and latency.
- Worker dead-letter count.
- Redis ping/read/write errors.
- Postgres readiness errors.

Avoid high-cardinality labels:

- Do not label metrics by user ID, session ID, email, or request ID.

### 9.14 Sentry / Error Tracking (F7)

Optional but recommended for production:

- Add `sentry-sdk[fastapi]`.
- Initialize only when `SENTRY_DSN` is set.
- Set environment and release/version.
- Scrub PII and tokens.

Do not make Sentry mandatory for local development or tests.

## 10. Frontend Implementation

### 10.1 API Base URL Validation

Update:

- `frontend/src/lib/api.ts`

Rules:

- Keep development fallback.
- For production builds, require `NEXT_PUBLIC_API_BASE_URL`.
- Avoid silently pointing production browser clients to `127.0.0.1`.

### 10.2 Heartbeat Payload Contract

Update event creation sites:

- `setAnswer`
- `toggleFlag`
- `navigateTo`
- Any future direct `queueEvent` callers

Every event includes:

- `client_event_id`
- `client_created_at`

Retry/localStorage behavior must preserve both.

### 10.3 Save Status Semantics

Once backend returns accepted/queued instead of fully saved:

- UI text should avoid claiming "Saved" if the event has only been queued.
- Use terms like "Synced" only after the API accepted the event durably into Redis.
- Because Redis Streams are durable within configured persistence, "Saved" can remain acceptable if operational docs define Redis persistence. If Redis persistence is disabled, use "Queued".

Decision:

- In production compose, enable Redis AOF persistence.
- Therefore, API acceptance into Redis counts as saved from the browser's perspective.

### 10.4 Security Headers from Next/Nginx

Prefer Nginx for global production headers, but also set Next headers where useful:

- `frontend/next.config.ts`

This gives local production builds similar behavior.

### 10.5 Frontend Tests

Add or update tests for:

- Event ID generated once and preserved through retry.
- Failed heartbeat moves events to localStorage with IDs intact.
- Retry drains localStorage without regenerating IDs.
- API client does not infinite-refresh on auth endpoints.

## 11. Deployment Artifacts

### 11.1 Backend Dockerfile

Add:

- `backend/Dockerfile`

Requirements:

- Multi-stage build if helpful.
- Python runtime pinned to the project-supported version. Current CI uses Python 3.12; `AGENTS.md` mentions Python 3.14. Until the runtime is actually migrated, use the version that passes tests and document the mismatch.
- Install dependencies from `requirements.txt`.
- Generate Prisma Python client during build or startup, whichever is more reliable for the current client.
- Run as non-root user.
- Expose `8000`.
- Default command starts API:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Worker uses same image with overridden command:

```bash
python -m app.workers.heartbeat_worker
```

### 11.2 Frontend Dockerfile

Add:

- `frontend/Dockerfile`

Requirements:

- Multi-stage Node build.
- Install dependencies with `npm ci`.
- Build Next app.
- Run production server as non-root.
- Expose `3000`.
- Pass `NEXT_PUBLIC_API_BASE_URL` at build/runtime according to Next requirements.

### 11.3 Production Compose

Add:

- `docker-compose.prod.yml`

Services:

- `nginx`
- `frontend`
- `backend-api`
- `heartbeat-worker`
- `postgres`
- `pgbouncer`
- `redis`

Minimum hardening:

- No default database password in production compose. Use environment variables.
- Redis persistence enabled.
- Health checks for all long-running services.
- Restart policies.
- Named volumes for Postgres and Redis.
- Internal networks for database/Redis.
- Only Nginx publishes public ports.

### 11.4 Nginx

Add:

- `deploy/nginx/nginx.conf`
- `deploy/nginx/conf.d/openvision.conf`

Responsibilities:

- TLS termination.
- Proxy `/api/` to backend.
- Proxy `/health/` if desired.
- Proxy frontend routes to Next.
- Set security headers.
- Set body size limits.
- Set timeout values appropriate for API requests.
- Preserve `X-Request-ID` or generate one.
- Forward `X-Forwarded-For`, `X-Forwarded-Proto`, and `Host`.

### 11.5 Environment Documentation

Add:

- `.env.example`
- `docs/operations/environment.md`

Document:

- Required variables.
- Safe local defaults.
- Production-only required variables.
- Secret generation commands.
- CORS examples.
- Redis persistence expectations.
- PgBouncer notes.

## 12. CI/CD Implementation

### 12.1 Workflow Split

Replace or expand `.github/workflows/backend-tests.yml` into:

- `.github/workflows/ci.yml`
- Optional `.github/workflows/docker.yml`
- Optional `.github/workflows/load-smoke.yml`

Keep it simple if one workflow is easier, but all gates must be present.

### 12.2 CI Jobs

Required jobs:

1. Backend lint and tests
2. Frontend lint and type/build
3. Prisma schema generation and db push on ephemeral Postgres
4. Playwright smoke tests, at least login and one exam flow if runtime permits
5. Docker image build for backend and frontend
6. Dependency vulnerability checks
7. Load-test smoke scenario
8. Coverage report

Backend job:

```yaml
- name: Run backend tests
  env:
    DATABASE_URL: postgresql://postgres:password@localhost:5432/openvision
    REDIS_URL: redis://localhost:6379/0
    SECRET_KEY: ci-secret-key
    ENVIRONMENT: test
  run: |
    cd backend
    pytest --cov=app --cov-report=xml --cov-report=term-missing
```

Frontend job:

```yaml
- name: Frontend lint
  run: npm run lint
  working-directory: frontend

- name: Frontend build
  run: npm run build
  working-directory: frontend
```

Add a TypeScript check script if one does not exist:

```json
"typecheck": "tsc --noEmit"
```

### 12.3 Coverage Target

Target: 80%.

Pragmatic rollout:

- Do not block the first Epoch 13 PR if historical coverage is below 80%.
- Do block if coverage decreases.
- Add a follow-up gate to ratchet toward 80%.

### 12.4 Dependency Scanning

Minimum:

- GitHub Dependabot config for npm and pip.
- `npm audit --audit-level=high` in CI.
- `pip-audit` or equivalent for backend.

If a vulnerability is unfixable due to transitive constraints:

- Document it in the PR.
- Pin or override where safe.
- Open a tracked follow-up if accepted.

### 12.5 Branch Protection

Require before merge to `main`:

- CI passing.
- At least one review.
- Manual security review checklist completed.
- No unresolved high-severity findings.

## 13. Load Testing

### 13.1 Tool Choice

Use **k6** unless implementation discovers a strong reason to prefer Locust.

Why k6:

- Easy CI smoke runs.
- Thresholds are first-class.
- Good HTTP ergonomics.
- Lightweight container execution.

Add:

- `load-tests/k6/login-surge.js`
- `load-tests/k6/exam-join-surge.js`
- `load-tests/k6/heartbeat-throughput.js`
- `load-tests/k6/submission-burst.js`
- `load-tests/README.md`

### 13.2 Test Data

Add deterministic seed support:

- `backend/seed_load.py`

Creates:

- 1 admin
- 1 constructor
- 1 course
- 1 scheduled active exam
- 500-800 students with known credentials
- Enrollments for all load-test students
- A test definition with enough objective and essay items to exercise event payloads

Do not use production-like real names or emails.

### 13.3 Heartbeat Scenario

Each virtual user:

1. Logs in.
2. Joins assigned exam.
3. Sends heartbeat batches for random answers, flags, and navigation.
4. Occasionally retries the same batch to verify idempotency.
5. Optionally reloads answers.

Thresholds:

```js
export const options = {
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{endpoint:heartbeat}': ['p(99)<200'],
    'checks': ['rate>0.99'],
  },
};
```

### 13.4 Reporting

Every load-test run should produce:

- Summary JSON
- Human-readable markdown report
- Queue lag before/during/after
- Worker flush rate
- DB CPU/connection observations if available
- Error samples with request IDs

Store reports under:

- `load-tests/reports/`

Reports should not be committed unless they are small baseline artifacts explicitly referenced by the Epoch 13 PR.

## 14. Testing Plan

### 14.1 Backend Unit Tests

Add:

- `backend/tests/test_config.py`
- `backend/tests/test_health.py`
- `backend/tests/test_rate_limit.py`
- `backend/tests/test_heartbeat_queue.py`
- `backend/tests/test_heartbeat_worker.py`
- `backend/tests/test_metrics.py`

Coverage examples:

- Production config rejects default secret.
- CORS origins parse correctly.
- Readiness returns 503 when Redis is unavailable.
- Heartbeat enqueue validates ownership before queue write.
- Heartbeat enqueue rejects submitted sessions.
- Duplicate `client_event_id` does not duplicate rows.
- Worker acknowledges only after persistence.
- Worker dead-letters invalid payloads.
- Rate limit returns 429 and `Retry-After`.
- Metrics endpoint exposes expected counters without user/session labels.

### 14.2 Backend Integration Tests

Add:

- End-to-end heartbeat: API enqueue -> worker flush -> answer recovery.
- Worker restart: enqueue events, stop worker before ack simulation, restart, verify eventual persistence.
- Redis unavailable: heartbeat returns service unavailable and frontend can retry later.
- Postgres unavailable to worker: messages remain pending, not acknowledged.
- Token invalidation still applies to heartbeat endpoint.

### 14.3 Frontend Tests

Add:

- Typecheck gate.
- Heartbeat event ID generation.
- LocalStorage retry preserves event IDs.
- Save status transitions on accepted heartbeat.
- API production base URL validation behavior.

### 14.4 E2E Smoke Tests

At minimum:

1. Admin/constructor creates or uses seeded exam.
2. Student logs in.
3. Student joins assigned exam.
4. Student answers one item.
5. Heartbeat is accepted.
6. Page reload recovers answer.
7. Student submits.

### 14.5 Manual Verification

Before merge:

- Run local production compose.
- Confirm `/health/live`, `/health/ready`, `/metrics`.
- Confirm frontend loads through Nginx.
- Confirm CORS rejects an unapproved origin.
- Confirm rate limiting on login.
- Confirm heartbeat worker persists events.
- Confirm Redis queue lag drains to zero after load test.
- Confirm no secrets appear in logs.

## 15. Security Review Checklist

Create:

- `directives/epoch_13_security_review.md`

Checklist:

- [ ] All new endpoints have explicit auth or are documented public health/metrics exceptions.
- [ ] Heartbeat enqueue validates session ownership before queue write.
- [ ] Worker does not trust queued data as authorization proof for cross-user writes.
- [ ] Request payload sizes are bounded.
- [ ] Auth endpoints are rate limited.
- [ ] Heartbeat endpoints are rate limited per user/session.
- [ ] CORS is environment-driven and locked in production.
- [ ] Production rejects default `SECRET_KEY`.
- [ ] Cookies remain secure in production.
- [ ] Security headers are present in production responses.
- [ ] Logs scrub tokens, cookies, passwords, and answer payload contents.
- [ ] Metrics have no high-cardinality or PII labels.
- [ ] Docker containers run as non-root.
- [ ] Nginx does not expose Postgres, Redis, PgBouncer, or worker ports.
- [ ] Dependency scan reviewed.
- [ ] No raw SQL unless parameterized and explicitly justified.
- [ ] No `.env` or generated secrets committed.
- [ ] No high-severity findings remain unresolved.

## 16. Operational Runbooks

Add:

- `docs/operations/production-deploy.md`
- `docs/operations/heartbeat-worker.md`
- `docs/operations/load-testing.md`
- `docs/operations/incident-response.md`

### 16.1 Heartbeat Worker Runbook

Must document:

- How to inspect stream lag.
- How to inspect pending entries.
- How to start additional workers.
- How to inspect dead-letter messages.
- How to replay dead-letter messages safely.
- How to know whether answer persistence is delayed versus lost.

### 16.2 Exam-Day Checklist

Must document:

- Confirm database reachable.
- Confirm Redis persistence enabled.
- Confirm worker count.
- Confirm queue lag zero.
- Confirm scheduled exam visible.
- Confirm load-test smoke passes.
- Confirm admin/supervisor account works.
- Confirm rollback plan.

### 16.3 Incident Response

Must document:

- Redis down.
- Postgres down.
- Worker lag high.
- Login rate limiting too aggressive.
- Nginx/proxy unavailable.
- Sentry/logging outage.
- Need to temporarily pause non-critical background work.

## 17. Implementation Phases

### Phase 0 — Preflight

Tasks:

- Create branch `epoch-13-production-hardening`.
- Read current directives and confirm this file is approved.
- Run existing backend tests and frontend build to establish baseline.
- Record baseline failures, if any, before modifying code.

Exit criteria:

- Baseline status is documented in the PR.
- No unrelated dirty worktree changes are reverted.

### Phase 1 — Config, Health, Redis Lifecycle

Tasks:

- Add validated settings.
- Add `.env.example`.
- Add Redis lifecycle helper.
- Add liveness/readiness endpoints.
- Lock CORS to settings.
- Add tests.

Exit criteria:

- App boots in development with documented defaults.
- Production config fails without real secret/origins.
- Readiness reflects Postgres and Redis status.

### Phase 2 — Heartbeat Idempotency Contract

Tasks:

- Add `client_event_id` and `received_at` to Prisma schema.
- Add required frontend event IDs.
- Update Pydantic schemas.
- Preserve backward compatibility only where necessary.
- Add tests for duplicate event IDs.

Exit criteria:

- Retried heartbeat batches do not duplicate persisted events.
- Frontend localStorage retry preserves IDs.

### Phase 3 — Redis Stream Ingestion

Tasks:

- Add queue module.
- Modify heartbeat endpoint/service to enqueue.
- Add worker entrypoint.
- Add batch persistence.
- Add dead-letter stream.
- Add worker tests.

Exit criteria:

- API heartbeat path returns quickly after Redis acceptance.
- Worker persists events.
- Worker crash/retry test passes.

### Phase 4 — Answer Recovery Optimization

Tasks:

- Implement snapshot table or indexed query fallback.
- Update `get_latest_answers`.
- Add tests for latest answer/flag reconstruction after queued persistence.

Exit criteria:

- Answer recovery stays bounded and correct with thousands of events in one session.

### Phase 5 — Rate Limits, Security Headers, Logging, Metrics

Tasks:

- Add Redis-backed rate limiting.
- Add request ID middleware.
- Add structured logging.
- Add metrics endpoint.
- Add security headers.
- Add optional Sentry.
- Add tests.

Exit criteria:

- 429s behave predictably.
- Logs include request IDs but no secrets.
- Metrics expose expected counters/histograms.
- Security headers present.

### Phase 6 — Docker and Production Compose

Tasks:

- Add backend Dockerfile.
- Add frontend Dockerfile.
- Add worker command.
- Add Nginx config.
- Add PgBouncer config.
- Add production compose.
- Add operation docs.

Exit criteria:

- `docker compose -f docker-compose.prod.yml up --build` boots the stack with sample env.
- Only Nginx exposes public ports.
- Health checks pass.

### Phase 7 — CI/CD

Tasks:

- Expand GitHub Actions.
- Run backend full tests.
- Run frontend lint/type/build.
- Build Docker images.
- Add dependency scanning.
- Add load smoke test.
- Add coverage reporting.

Exit criteria:

- CI fails on real regressions.
- CI artifacts include test and coverage reports.

### Phase 8 — Load Testing and Tuning

Tasks:

- Add seed script for load data.
- Add k6 scenarios.
- Run baseline load tests.
- Tune worker batch size, rate limits, Redis persistence, and DB indexes.
- Record capacity results.

Exit criteria:

- Minimum capacity targets met or documented with explicit blockers.
- Queue lag drains after sustained load.

### Phase 9 — Manual Security Review and Merge Readiness

Tasks:

- Complete `directives/epoch_13_security_review.md`.
- Review diff against `AGENTS.md` §1.
- Resolve high-severity findings.
- Confirm docs and runbooks are complete.

Exit criteria:

- Security review completed.
- No high-severity findings remain.
- CI passes.
- Load-test summary attached to PR.

## 18. File-Level Work Plan

Expected additions:

```text
.env.example
.github/dependabot.yml
.github/workflows/ci.yml
backend/Dockerfile
backend/app/core/cache.py
backend/app/core/logging.py
backend/app/core/metrics.py
backend/app/core/rate_limit.py
backend/app/core/redis.py
backend/app/middleware/request_context.py
backend/app/services/heartbeat_ingestion/__init__.py
backend/app/services/heartbeat_ingestion/persistence.py
backend/app/services/heartbeat_ingestion/queue.py
backend/app/services/heartbeat_ingestion/schemas.py
backend/app/services/heartbeat_ingestion/worker.py
backend/app/workers/__init__.py
backend/app/workers/heartbeat_worker.py
backend/tests/test_config.py
backend/tests/test_health.py
backend/tests/test_heartbeat_queue.py
backend/tests/test_heartbeat_worker.py
backend/tests/test_metrics.py
backend/tests/test_rate_limit.py
deploy/nginx/nginx.conf
deploy/nginx/conf.d/openvision.conf
deploy/pgbouncer/pgbouncer.ini
docker-compose.prod.yml
docs/operations/environment.md
docs/operations/heartbeat-worker.md
docs/operations/incident-response.md
docs/operations/load-testing.md
docs/operations/production-deploy.md
frontend/Dockerfile
load-tests/README.md
load-tests/k6/heartbeat-throughput.js
load-tests/k6/login-surge.js
load-tests/k6/exam-join-surge.js
load-tests/k6/submission-burst.js
```

Expected modifications:

```text
.github/workflows/backend-tests.yml
backend/app/core/config.py
backend/app/main.py
backend/app/api/endpoints/interactions.py
backend/app/schemas/interaction_event.py
backend/app/services/interactions_service.py
backend/app/models/interaction_event.py
backend/requirements.txt
frontend/next.config.ts
frontend/package.json
frontend/src/hooks/useHeartbeat.ts
frontend/src/lib/api.ts
frontend/src/stores/useExamStore.ts
prisma/schema.prisma
```

## 19. Acceptance Criteria

Epoch 13 is done when all of the following are true:

- Production config cannot boot with known development secrets.
- CORS origins are environment-driven and locked down.
- Redis connects during startup and readiness checks fail when it is unavailable.
- Heartbeat API validates auth, ownership, session status, payload size, and event count before enqueue.
- Heartbeat API enqueues to Redis Streams instead of writing every event directly to Postgres.
- Heartbeat worker batch flushes events to Postgres.
- Duplicate client event IDs do not create duplicate interaction rows.
- Answer recovery remains correct after worker persistence.
- Rate limits protect auth and heartbeat without breaking expected exam traffic.
- Request IDs appear in API responses, API logs, worker logs, and queued messages.
- Metrics expose HTTP and heartbeat pipeline health without PII labels.
- Security headers are present in production responses.
- Backend and frontend Docker images build.
- Production compose boots frontend, API, worker, Postgres, PgBouncer, Redis, and Nginx.
- CI runs backend tests, frontend lint/type/build, Docker builds, dependency checks, and load smoke.
- Load-test scenarios exist and meet minimum thresholds, or blockers are explicitly documented before any release claim.
- Manual security review is complete.
- Operational runbooks exist.

## 20. Risks and Mitigations

### Risk: Redis accepted events but Redis persistence is disabled

Mitigation:

- Enable AOF in production compose.
- Document Redis persistence requirements.
- Surface Redis persistence status in operations docs.

### Risk: Worker falls behind during peak heartbeat traffic

Mitigation:

- Batch writes.
- Scale worker replicas.
- Monitor stream lag and oldest pending event age.
- Keep API response path independent from Postgres flush latency.

### Risk: Duplicate events after frontend retry

Mitigation:

- Client-generated stable UUID per event.
- Unique DB constraint on `(session_id, client_event_id)`.
- Worker skip-duplicate behavior.

### Risk: Rate limiting blocks a real exam hall

Mitigation:

- Login limit keyed by IP + email rather than IP only.
- Heartbeat limit keyed by user + session.
- Dry-run rate-limit logging mode in staging.
- Exam-day runbook includes temporary limit adjustment procedure.

### Risk: PgBouncer compatibility with Prisma Client Python

Mitigation:

- Verify under production compose.
- Use session pooling or direct bounded connections if transaction pooling is incompatible.
- Document the final chosen mode.

### Risk: Metrics cardinality explosion

Mitigation:

- Never label by user ID, session ID, request ID, or email.
- Use route templates, method, status class, and component names only.

### Risk: Security headers conflict with future LTI embedding

Mitigation:

- Default to `frame-ancestors 'none'`.
- If LTI requires embedding, add an explicit allowlist from environment and document why.

## 21. Rollback Plan

If heartbeat queue deployment causes issues:

1. Keep database schema additions; they are additive.
2. Add a feature flag: `HEARTBEAT_QUEUE_ENABLED`.
3. When disabled, heartbeat service can temporarily fall back to direct `create_many`.
4. Keep `client_event_id` idempotency active even in fallback mode.
5. Roll back worker replicas independently from API if worker is the failure source.

Feature flag rules:

- Default enabled in staging/production after validation.
- Direct-write fallback is a temporary safety valve, not the long-term architecture.
- Any fallback activation during an exam must be documented in incident notes.

## 22. Definition of Done

- Code implemented according to this directive.
- Tests added and passing.
- CI gates passing.
- Production compose verified locally.
- Load-test reports generated.
- Security review completed.
- Docs and runbooks committed.
- No unrelated refactors mixed into the epoch.
- Conventional commit history used.

## 23. Suggested Commit Breakdown

Use small reviewable commits:

1. `chore: add epoch 13 production hardening directive`
2. `feat: validate runtime settings and readiness checks`
3. `feat: add heartbeat event idempotency contract`
4. `feat: enqueue heartbeat events through redis streams`
5. `feat: add heartbeat worker batch persistence`
6. `feat: optimize answer recovery state`
7. `feat: add rate limiting and security headers`
8. `feat: add structured logging and metrics`
9. `chore: add production docker and nginx configuration`
10. `ci: expand quality gates and dependency scanning`
11. `test: add load-test scenarios for exam surge traffic`
12. `docs: add epoch 13 operations runbooks`

## 24. Final Implementation Note

Epoch 13 should be treated as a reliability migration, not a cosmetic cleanup. The happy path is already mostly built. The work here is making that path boring under pressure: bounded inputs, explicit queues, idempotent writes, visible lag, tested retries, hardened defaults, and documented operations.

If implementation pressure forces tradeoffs, preserve these three invariants first:

1. **Never accept unauthorized heartbeat data.**
2. **Never lose an accepted heartbeat under normal worker restart/failure recovery.**
3. **Never let production boot with development security defaults.**
