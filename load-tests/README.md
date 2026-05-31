# OpenVision Load Tests (Epoch 13)

[k6](https://k6.io/) scenarios that validate the scalability targets in the
Epoch 13 directive (§6.1). They drive the real HTTP API, so a backend + Redis +
Postgres + heartbeat worker must be running and seeded first.

## Scenarios

| Script | Scenario | Target (§6.1) |
|---|---|---|
| `k6/login-surge.js` | 500 logins in 60s | P95 < 750 ms, errors < 1% |
| `k6/exam-join-surge.js` | 500 joins in 90s | P95 < 1000 ms, errors < 1% |
| `k6/heartbeat-throughput.js` | ~500 req/s, 1–20 events each | P99 < 200 ms, errors < 0.5% |
| `k6/submission-burst.js` | 500 submissions in 120s | P95 < 1500 ms |

Thresholds are encoded in each script's `options.thresholds`, so a run exits
non-zero when a target is missed — suitable for a CI smoke gate.

## 1. Seed deterministic data

```bash
cd backend
STUDENT_COUNT=500 PYTHONPATH=. python seed_load.py
```

This is idempotent and writes `load-tests/seed-manifest.json` containing the
`SCHEDULED_SESSION_ID` the join/heartbeat/submission scenarios need. All
accounts use the `@loadtest.local` domain and the `LOAD101` course — never
production data. The script refuses to run when `ENVIRONMENT=production`.

Seeded credentials: `load_student_<n>@loadtest.local` / `loadtest-pass-123`
(`n` from 1 to `STUDENT_COUNT`).

## 2. Run a scenario

```bash
export BASE_URL=http://localhost:8000
export SCHEDULED_SESSION_ID=$(jq -r .SCHEDULED_SESSION_ID load-tests/seed-manifest.json)

k6 run load-tests/k6/login-surge.js
k6 run -e SCHEDULED_SESSION_ID=$SCHEDULED_SESSION_ID load-tests/k6/exam-join-surge.js
k6 run -e SCHEDULED_SESSION_ID=$SCHEDULED_SESSION_ID load-tests/k6/heartbeat-throughput.js
k6 run -e SCHEDULED_SESSION_ID=$SCHEDULED_SESSION_ID load-tests/k6/submission-burst.js
```

Override defaults with `-e`: `BASE_URL`, `STUDENT_COUNT`, `STUDENT_PASSWORD`,
`SCHEDULED_SESSION_ID`.

## 3. Reporting

For a recorded run, emit a summary and inspect the heartbeat queue:

```bash
k6 run --summary-export=load-tests/reports/heartbeat.json \
       -e SCHEDULED_SESSION_ID=$SCHEDULED_SESSION_ID \
       load-tests/k6/heartbeat-throughput.js

# Queue lag should drain back toward zero within ~60s after the run.
redis-cli XLEN heartbeat:events
```

Reports under `load-tests/reports/` are git-ignored by default; commit only a
small baseline artifact when a PR explicitly references it.

## CI smoke

`.github/workflows/load-smoke.yml` runs a short, low-VU (`--vus 10 --duration
30s`) smoke of the heartbeat scenario against an already-running stack whose URL
you pass as a workflow input. It is `workflow_dispatch` (manual) so it never
blocks ordinary PRs, and it builds no images — the full targets above are
intended for a developer machine or a CI-sized runner on demand.
