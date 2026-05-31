# Epoch 13 — Production Hardening: Security Review

> Merge gate per CLAUDE.md §1 (manual security review of the diff before merge
> to `main`). Complete before merging the Epoch 13 branch.
>
> Legend: `[x]` verified in code/tests · `[ ]` operator action at deploy time.

## A. Secrets & configuration

- [x] **No hardcoded secrets.** All credentials come from env (`.env` /
      orchestrator secret store); `.env` is git-ignored. `SECRET_KEY`,
      `POSTGRES_PASSWORD`, `LTI_PRIVATE_KEY_ENCRYPTION_KEY`, `SENTRY_DSN` read
      from `Settings` (`backend/app/core/config.py`).
- [x] **Production safety gate.** `assert_production_safe()` aborts startup when
      `ENVIRONMENT=production` and `SECRET_KEY` is the dev default or
      `CORS_ALLOWED_ORIGINS` contains a wildcard. Wired into the lifespan; covered
      by `tests/test_epoch13_infrastructure.py::TestConfigValidation`.
- [x] **`ENVIRONMENT` validated** against an allow-list.
- [ ] **Dedicated production secrets generated** (`SECRET_KEY` and a distinct
      `LTI_PRIVATE_KEY_ENCRYPTION_KEY`) and stored in the secret manager — not a
      committed `.env`. See [docs/operations/environment.md](../docs/operations/environment.md).

## B. Transport & headers

- [x] **Security headers** on every response (`SecurityHeadersMiddleware`):
      `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
      `Referrer-Policy: strict-origin-when-cross-origin`, a locked-down
      `Permissions-Policy`, and `Strict-Transport-Security` in production.
- [x] **CSP + baseline headers** also set at the Nginx edge
      (`deploy/nginx/conf.d/openvision.conf`).
- [x] **CORS is explicit** — `allow_origins=settings.CORS_ALLOWED_ORIGINS`; the
      wildcard is rejected in production by the safety gate.
- [ ] **TLS terminated at Nginx** with real certs (the repo ships a cert mount
      point, not certificates) — operator provides them at deploy.

## C. Abuse resistance

- [x] **Rate limiting** on the sensitive endpoints (login 10/min + 100/hr by
      IP+email, register 5/min/IP, refresh 60/min, heartbeat 60/min/user+session)
      via FastAPI deps. Emits `RATE_LIMIT_REJECTED_TOTAL`. Covered by
      `TestRateLimit`.
- [x] **Fails open, safely.** If Redis is down the limiter allows the request
      (availability over enforcement) — an accepted trade-off, documented in the
      incident runbook. It is not the authorization boundary.
- [x] **JWT discipline unchanged from prior epochs** — short-lived access tokens,
      refresh rotation, validated per request (no regression in this epoch).

## D. Data path & integrity

- [x] **Heartbeat idempotency.** `@@unique([session_id, client_event_id])` makes
      duplicate/replayed events no-ops; the worker ACKs after a successful flush
      and only then. Covered by `tests/test_epoch13_observability.py::TestWorkerProcessing`.
- [x] **Dead-letter on poison messages.** Un-parseable or max-retried entries go
      to `openvision:heartbeat:dead-letter:v1` and are ACKed off the main stream,
      so one bad event can't wedge the pipeline.
- [x] **Parameterised queries only** — Prisma client throughout; the single raw
      probe is a constant `SELECT 1` in the readiness check.

## E. Information exposure

- [x] **`/metrics` carries no high-cardinality / PII labels** (no `user_id`,
      `session_id`, `email`, `ip`). Asserted by
      `TestMetricsCardinality`. Intended to be reachable only from the internal
      Nginx network in production (not exposed publicly).
- [x] **Sentry scrubs PII** and tags environment/release when `SENTRY_DSN` is set;
      disabled by default.
- [x] **Structured logs** use a request-id correlation header, not user secrets.
- [x] **`/health/ready` returns 503 (not 200) when a dependency is down** —
      fixed this epoch (the endpoint previously returned a `(body, status)` tuple
      that FastAPI serialised as a 200). Covered by `TestHealthEndpoints`.

## F. Containers

- [x] **Non-root runtime** in both images (`appuser` / `nextjs`, uid 1001).
- [x] **Backend runtime image is Node-free** — the Prisma client + query engine
      are generated/cached in the builder stage; the slim runtime only runs the
      binary. Build verified locally (`docker build -f backend/Dockerfile .`).
- [x] **Internal network isolation** — Postgres/Redis/PgBouncer sit on an
      `internal: true` Docker network; only Nginx is published.
- [ ] **Dependency advisories triaged.** `pip-audit` + `npm audit` run in CI
      (non-blocking). Review the current report and ratchet to blocking once the
      backlog is clear.

## G. Sign-off

- [ ] **Manual read of the full diff against CLAUDE.md §1** completed by the
      reviewer immediately before merge (Aikido SAST retired — this is a human
      responsibility now).
