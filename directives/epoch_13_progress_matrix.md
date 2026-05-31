# Epoch 13 Progress Matrix

> Last updated: 2026-05-31
> Purpose: track Epoch 13 (Scalability, Concurrency & Production Hardening) implementation status across modular slices.

## Current Slice Summary

Core production-hardening backend is implemented and wired. The 2026-05-31 pass
fixed the failing infrastructure test suite and closed the three wiring gaps
(rate limiting, caching, security headers), then added the load-testing and
CI/dependency-scanning deliverables.

A second 2026-05-31 pass (closing-out slice) finished the remaining merge-gate
items: fixed the Docker build (context + Node-free runtime) and re-added the
`docker-build` CI job, wrote the operations runbooks + environment doc and both
security-review checklists, broadened backend test coverage (health/worker/
metrics), and fixed a `/health/ready` bug that always returned 200. Both
production images now build locally and in CI.

Remaining work is operator-time sign-off (the security-review manual diff read,
captured load-test baseline, PgBouncer-under-load validation) — see Known Gaps.

## Progress Matrix

| Area | Status | What is Done | Remaining Work | Key Files |
|---|---|---|---|---|
| Configuration | Complete | `pydantic-settings` `BaseSettings`, `ENVIRONMENT` validation, `assert_production_safe()` rejecting the dev `SECRET_KEY` in production. Called from lifespan. | — | `backend/app/core/config.py`, `backend/app/main.py` |
| Redis Lifecycle | Complete | Async client with `connect_redis`/`disconnect_redis`/`get_redis`, wired into lifespan. | — | `backend/app/core/redis.py`, `backend/app/main.py` |
| Health Checks | Complete | `/health`, `/health/live`, `/health/ready` (Postgres + Redis probes, 503 when down). | — | `backend/app/main.py` |
| Prisma Schema | Complete | `client_event_id` column + `@@unique([session_id, client_event_id])` idempotency index on `interaction_events`. | — | `prisma/schema.prisma` |
| Frontend Store | Complete | `client_event_id` generated/preserved per interaction event. | — | `frontend/src/stores/useExamStore.ts` |
| Heartbeat Enqueue | Complete | Endpoint validates ownership then enqueues to the Redis Stream via the ingestion queue. | — | `backend/app/api/endpoints/interactions.py`, `backend/app/services/heartbeat_ingestion/queue.py` |
| Heartbeat Worker | Complete | Stream consumer + batch flusher with duplicate detection; thin `python -m app.workers.heartbeat_worker` entrypoint delegates to the ingestion worker. | — | `backend/app/services/heartbeat_ingestion/worker.py`, `backend/app/workers/heartbeat_worker.py` |
| Caching (F5) | Complete | `cache.py` helpers wired into the exam-join path: the deterministic blueprint **candidate pool** is cached (`test_definition:{id}:snapshot:v1`, 5-min TTL) while per-session sampling/option-shuffle stay live. Invalidated on blueprint edit and item-version writes. | Consider caching `scheduled_session` summary if join latency needs it. | `backend/app/core/cache.py`, `backend/app/services/exam_sessions_service.py`, `backend/app/services/blueprints_service.py`, `backend/app/services/items_service.py` |
| Rate Limiting (F6) | Complete | Sliding-window limiter wired as FastAPI deps per §9.8: login (10/min + 100/hr, IP+email), register (5/min/IP), refresh (60/min), heartbeat (60/min/user+session). Fails open if Redis is down; emits `RATE_LIMIT_REJECTED_TOTAL`. | Optional: import/upload (10/min) + general-write (120/min) classes if/when those surfaces need it. | `backend/app/core/rate_limit.py`, `backend/app/api/endpoints/auth.py`, `backend/app/api/endpoints/interactions.py` |
| Structured Logging (F7) | Complete | JSON logs + `RequestContextMiddleware` correlation IDs (`X-Request-ID` in/out). | — | `backend/app/core/logging.py`, `backend/app/middleware/__init__.py` |
| Metrics (F7) | Complete | `/metrics` Prometheus endpoint; counters/histograms with no high-cardinality labels. | — | `backend/app/core/metrics.py`, `backend/app/main.py` |
| Security Headers | Complete | `SecurityHeadersMiddleware` (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy; HSTS in prod). CSP + baseline headers also set on the Nginx frontend location. | — | `backend/app/middleware/__init__.py`, `backend/app/main.py`, `deploy/nginx/conf.d/openvision.conf` |
| Sentry (F7) | Complete | Optional init when `SENTRY_DSN` set; PII scrubbed; environment/release tagged. | — | `backend/app/main.py` |
| Connection Pooling (F4) | Partial | `pgbouncer` service in prod compose; app `DATABASE_URL` points at it. | Verify Prisma-Python behaviour under PgBouncer transaction pooling; add `pgbouncer.ini`/`userlist` docs. | `docker-compose.prod.yml` |
| Containerization | Complete | Backend + frontend Dockerfiles (multi-stage, non-root), prod compose, Nginx config. **Build fixed**: backend uses a repo-root context so `prisma generate` reads the single-source schema, and generates the Python client in the builder stage so the runtime stage stays Node-free; frontend uses `output: "standalone"`. Both images build locally and in CI. | — | `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/next.config.ts`, `docker-compose.prod.yml`, `.dockerignore`, `deploy/nginx/` |
| CI Workflows | Complete | `ci.yml`: backend lint + Prisma generate/push + pytest w/ coverage + pip-audit; frontend lint + typecheck + build + npm audit; **`docker-build` job** building both production images (no push). Replaces `backend-tests.yml` (which never ran pytest). | Optional Playwright E2E smoke (shared with the Epoch 10 V-gate specs, currently local). | `.github/workflows/ci.yml` |
| Dependency Scanning | Complete | Dependabot (pip/npm/actions), `pip-audit` + `npm audit` (non-blocking) in CI. | Ratchet to blocking once the backlog is triaged. | `.github/dependabot.yml`, `.github/workflows/ci.yml` |
| Load Testing | Complete | k6 scenarios (login/join/heartbeat/submission) with §6.1 thresholds, deterministic `seed_load.py`, README, and a manual `load-smoke` workflow (runs against a provided URL). | Capture a baseline run report once a stack is available. | `load-tests/k6/*.js`, `backend/seed_load.py`, `load-tests/README.md`, `.github/workflows/load-smoke.yml` |
| Backend Tests | Complete (core) | `test_epoch13_infrastructure.py` (config, rate limiter, heartbeat queue, cache) + `test_epoch13_observability.py` (health/readiness incl. the 503 fix, worker ack/dead-letter/idempotent-replay, metrics-label cardinality). All assertions verified standalone; full pytest run executes in CI (needs the Prisma engine). | — | `backend/tests/test_epoch13_infrastructure.py`, `backend/tests/test_epoch13_observability.py` |
| Environment Docs | Complete | `.env.example` + `docs/operations/environment.md` (required vars, secret generation, CORS, PgBouncer, prod safety gate). | — | `.env.example`, `docs/operations/environment.md` |
| Runbooks | Complete | `docs/operations/{production-deploy,heartbeat-worker,load-testing,incident-response}.md`. | — | `docs/operations/*` |
| Security Review | Complete (pending sign-off) | `directives/epoch_13_security_review.md` checklist written; code-level items verified. | Operator sign-off: manual diff read, dependency-advisory triage, TLS certs at deploy. | `directives/epoch_13_security_review.md` |
| Health probe fix | Complete | `/health/ready` now returns `JSONResponse(status_code=503)` when a dependency is down (was returning a `(body, status)` tuple → always 200). | — | `backend/app/main.py` |

## 2026-05-31 Pass — What Changed

1. **Fixed the epoch-13 test suite.** `test_epoch13_infrastructure.py` used
   `@pytest.mark.asyncio`, but the repo uses the `anyio` plugin
   (`@pytest.mark.anyio`); the wrong marker left the session-scoped autouse
   async Prisma fixture unhandled and errored all 14 tests. Switched markers and
   made the sync config tests anyio-driven. Verified by clean collection plus a
   standalone run of all 14 assertions (the full `pytest` run needs Postgres +
   the Prisma query engine, which is available in CI).
2. **Wired rate limiting** onto login/register/refresh/heartbeat.
3. **Wired caching** for the blueprint candidate pool on the exam-join path,
   with correct invalidation and preserved per-session randomness.
4. **Added security headers** (backend middleware + Nginx).
5. **Added load testing** (k6 + seed) and **CI/dependency scanning**.

## 2026-05-31 Pass (closing-out slice) — What Changed

1. **Fixed the Docker build.** Backend image now builds from a repo-root context
   (`docker build -f backend/Dockerfile .`); the Prisma Python client is
   generated in the builder stage (Node present) and the engine binary is cached
   into the venv, so the runtime stage is Node-free. Frontend uses
   `output: "standalone"`. Added a root `.dockerignore`. Re-added the CI
   `docker-build` job. Both images verified building locally.
2. **Fixed `/health/ready`** — was returning a `(body, status)` tuple (serialised
   as a 200); now a `JSONResponse` with the correct 200/503.
3. **Broadened backend tests** — `test_epoch13_observability.py` (health, worker
   ack/dead-letter/idempotent-replay, metrics-label cardinality).
4. **Wrote operations docs** (`docs/operations/*`) and both security-review
   checklists (`directives/epoch_1{0,3}_security_review.md`).
5. **Greened the frontend lint job.** Fixed 6 pre-existing Next-16 React-Compiler
   rule errors (`react-hooks/refs` ref-during-render in `useClickOutside`/
   `useLifecycleSync`; `set-state-in-effect` in `Toast`/`InfoTooltip` via a new
   `useHydrated` hook, in `DatePicker` via adjust-state-during-render, and a
   scoped disable on `BlueprintInspector`'s data-fetch effect). `npm run lint`,
   `typecheck`, and `build` all pass.

## Known Gaps / Risks

- PgBouncer + Prisma-Python compatibility not yet verified **under load** (works
  functionally; capture a load-test baseline to confirm).
- Operator sign-off items remain in the security review: manual diff read,
  dependency-advisory triage (`pip-audit`/`npm audit` are non-blocking), and TLS
  certs supplied at deploy.
- The Playwright suite (Epoch 10 V-gate + flows) runs locally, not in CI — an
  optional CI E2E job is still deferred.
