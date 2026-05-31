# Load Testing

k6 scenarios validate the Epoch 13 §6.1 scalability targets against the real
HTTP API. Full reference: [`load-tests/README.md`](../../load-tests/README.md);
this page is the operator's quick path.

## Targets (§6.1)

| Scenario | Script | Threshold |
|---|---|---|
| 500 logins in 60s | `k6/login-surge.js` | P95 < 750 ms, errors < 1% |
| 500 exam joins in 90s | `k6/exam-join-surge.js` | P95 < 1000 ms, errors < 1% |
| ~500 req/s heartbeats | `k6/heartbeat-throughput.js` | P99 < 200 ms, errors < 0.5% |
| 500 submissions in 120s | `k6/submission-burst.js` | P95 < 1500 ms |

Thresholds are encoded in each script's `options.thresholds`, so k6 exits
non-zero when a target is missed — suitable as a CI/CD smoke gate.

## Prerequisites

A running, seeded stack (backend + Redis + Postgres + **heartbeat worker**).
Never run against production — the seeder refuses when `ENVIRONMENT=production`
and uses an isolated `@loadtest.local` domain / `LOAD101` course.

## Run

```bash
# 1. Seed deterministic data (idempotent; writes load-tests/seed-manifest.json)
cd backend && STUDENT_COUNT=500 PYTHONPATH=. python seed_load.py

# 2. Point k6 at the stack
export BASE_URL=http://localhost:8000
export SCHEDULED_SESSION_ID=$(jq -r .SCHEDULED_SESSION_ID load-tests/seed-manifest.json)

# 3. Run a scenario (or all four)
k6 run load-tests/k6/login-surge.js
k6 run load-tests/k6/exam-join-surge.js
k6 run load-tests/k6/heartbeat-throughput.js
k6 run load-tests/k6/submission-burst.js
```

## CI

A manual `load-smoke` workflow (`.github/workflows/load-smoke.yml`) runs the
scenarios against a provided URL on demand (`workflow_dispatch`). It is **not**
wired into the per-PR pipeline — load tests need a dedicated, seeded environment.

## Reading results

- k6 prints per-threshold pass/fail and the exit code reflects it.
- Cross-reference `/metrics` (Prometheus) during the run for server-side latency
  histograms and `RATE_LIMIT_REJECTED_TOTAL`.
- Watch the heartbeat backlog (`redis-cli XLEN openvision:heartbeat:v1`) during
  the heartbeat scenario — see [heartbeat-worker.md](heartbeat-worker.md).

> **Baseline not yet captured.** No reference run report exists yet (Epoch 13
> matrix open item). Capture one against a representative stack and link it here.
