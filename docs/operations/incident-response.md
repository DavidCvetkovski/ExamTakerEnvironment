# Incident Response

First-responder runbook for OpenVision production incidents. Goal: triage fast,
stop data loss, restore the exam-taking path.

## Triage order

The exam-taking path is the priority surface (students mid-exam). Restore it
before anything else.

1. **Is the API up?** `curl -fsS https://<host>/health/live`
2. **Are dependencies up?** `curl -fsS https://<host>/health/ready` — `503`
   means Postgres or Redis is unreachable.
3. **What's failing?** Filter logs by the `X-Request-ID` from the error response
   (JSON logs carry the correlation id), and check Sentry if `SENTRY_DSN` is set.
4. **How bad?** `/metrics` for error-rate and latency histograms.

## Symptom → action

| Symptom | Check | Action |
|---|---|---|
| `/health/ready` = 503, Postgres down | `docker compose … ps postgres` | restart Postgres; if PgBouncer is wedged, restart `pgbouncer`; verify `DATABASE_URL` |
| `/health/ready` = 503, Redis down | `redis-cli ping` | restart Redis. **Note:** rate limiting fails *open* (requests still served); caching falls back to live computation. Heartbeat **enqueue** fails — restore Redis promptly to avoid losing autosave events |
| Answers not reaching grading | `redis-cli XLEN openvision:heartbeat:v1` climbing | workers down/slow — scale `heartbeat-worker` (see [heartbeat-worker.md](heartbeat-worker.md)) |
| Login/refresh storms / abuse | `RATE_LIMIT_REJECTED_TOTAL` in `/metrics` | confirm limiter active (`RATE_LIMIT_ENABLED=true` + Redis up); limits are per §9.8 (login 10/min+100/hr, register 5/min, refresh 60/min, heartbeat 60/min) |
| Latency spike under load | `/metrics` histograms; DB connections | check PgBouncer pool saturation (`DEFAULT_POOL_SIZE=20`); scale API replicas; the blueprint candidate-pool cache (5-min TTL) should absorb join reads |
| Startup refuses (prod) | app logs | `assert_production_safe()` rejected `SECRET_KEY`/CORS — fix env, redeploy ([environment.md](environment.md#production-safety-gate)) |

## Caching note

The exam-join path caches the deterministic blueprint **candidate pool**
(`test_definition:{id}:snapshot:v1`, 5-min TTL); per-session sampling and
option-shuffle stay live. It is invalidated on blueprint edits and item-version
writes. If stale exam content is suspected after an emergency content change,
flush the key:

```bash
redis-cli DEL "test_definition:<test_id>:snapshot:v1"
```

## Data safety

- **Schema is forward-only / additive** (Prisma `db push`, no Alembic). Avoid
  ad-hoc destructive DDL during an incident.
- **Heartbeat events are idempotent** (`@@unique([session_id, client_event_id])`)
  — replaying the stream after a worker outage is safe.
- Never run the load seeder against production (it refuses when
  `ENVIRONMENT=production`, but don't rely on that alone).

## After the incident

- Capture the `X-Request-ID`(s), timeline, and `/metrics` snapshot.
- File a follow-up; if it's a recurring class, add a test (Epoch 13 §14) or an
  alert. Update this runbook if the playbook changed.
