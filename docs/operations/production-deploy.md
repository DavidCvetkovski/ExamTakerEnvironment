# Production Deployment

How to stand up OpenVision with the production Docker Compose stack
(`docker-compose.prod.yml`). Pairs with [environment.md](environment.md).

## Topology

```
            ┌─────────┐   :80/:443
  client ──▶│  nginx  │──┬─────────────▶ frontend (Next.js standalone, :3000)
            └─────────┘  └─────────────▶ backend-api (FastAPI/uvicorn, :8000)
                                              │
                                  ┌───────────┼─────────────┐
                                  ▼           ▼             ▼
                             pgbouncer     redis      heartbeat-worker
                                  │           ▲             │
                                  ▼           └─────────────┘
                              postgres      (Redis Stream: heartbeats)
```

- **nginx** terminates TLS and serves CSP + baseline security headers
  (`deploy/nginx/conf.d/openvision.conf`).
- **backend-api** and **heartbeat-worker** share the *same image*; only the
  start command differs (`uvicorn …` vs `python -m app.workers.heartbeat_worker`).
- **pgbouncer** fronts Postgres in transaction-pooling mode.

## Images

Both images build in CI (`.github/workflows/ci.yml` → `docker-build`) and locally:

```bash
# Backend — build context is the REPO ROOT so prisma/schema.prisma is visible.
docker build -f backend/Dockerfile -t openvision-backend .

# Frontend — context is ./frontend; API base URL is baked at build time.
docker build -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -t openvision-frontend ./frontend
```

> The backend image generates the Prisma **Python** client at build time
> (`prisma generate --generator py_client`) using Node in the builder stage; the
> runtime stage is Node-free and runs the cached query-engine binary. The Next
> frontend uses `output: "standalone"` (`frontend/next.config.ts`).

## First deploy

```bash
# 1. Configure
cp .env.example .env
#    Fill: ENVIRONMENT=production, SECRET_KEY, DATABASE_URL (→ pgbouncer),
#    CORS_ALLOWED_ORIGINS (explicit), POSTGRES_PASSWORD, NEXT_PUBLIC_API_BASE_URL.

# 2. Build + start
docker compose -f docker-compose.prod.yml up -d --build

# 3. Apply the schema (Prisma is the single source of truth — no Alembic).
#    Run against Postgres directly (not pgbouncer) for DDL:
docker compose -f docker-compose.prod.yml exec backend-api \
  prisma db push --schema=prisma/schema.prisma

# 4. Verify health
curl -fsS http://localhost/health/ready
```

If `assert_production_safe()` aborts startup, fix the flagged env var (see
[environment.md](environment.md#production-safety-gate)) and redeploy.

## PgBouncer

The app's `DATABASE_URL` points at `pgbouncer:5432` (transaction pooling,
`DEFAULT_POOL_SIZE=20`, `MAX_CLIENT_CONN=500`). Caveats:

- **DDL / `prisma db push` should target Postgres directly**, not PgBouncer —
  schema migration over a transaction pool is unreliable.
- Prisma-Python under transaction pooling has **not yet been load-validated**
  (open risk, Epoch 13 matrix). Watch for prepared-statement errors under load;
  if they appear, set `SERVER_RESET_QUERY=DISCARD ALL` (already configured) and
  consider `pgbouncer` `ignore_startup_parameters` tuning.

## Health & observability

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + version. |
| `GET /health/live` | Process up (used by container HEALTHCHECK). |
| `GET /health/ready` | Postgres + Redis reachable; `503` when a dependency is down. |
| `GET /metrics` | Prometheus scrape target. |

Logs are JSON with an `X-Request-ID` correlation id (echoed in responses). Set
`SENTRY_DSN` to ship errors (PII scrubbed).

## Rollback

```bash
docker compose -f docker-compose.prod.yml up -d \
  backend-api=openvision-backend:<previous-tag>
```

Schema changes are additive by convention; a forward-only `prisma db push` is
preferred over down-migrations. If a deploy must be reverted, redeploy the prior
image tag and leave the (additive) schema in place.
