# Heartbeat Worker

The heartbeat pipeline decouples exam answer/flag/navigation autosave from the
request path: the API **enqueues** events to a Redis Stream and a separate
**worker** batches them into Postgres. This keeps the exam-taking path fast and
resilient under load.

## Flow

```
POST /api/sessions/{id}/heartbeat
        │  (validates ownership, rate-limited 60/min/user+session)
        ▼
Redis Stream  HEARTBEAT_STREAM_NAME (openvision:heartbeat:v1)
        │  consumer group: HEARTBEAT_CONSUMER_GROUP (heartbeat-workers)
        ▼
heartbeat-worker  ──▶ batch insert into interaction_events
        │             (idempotent via @@unique([session_id, client_event_id]))
        ▼
   XACK on success / retry up to HEARTBEAT_MAX_RETRIES / dead-letter
```

- **Idempotency:** every event carries a `client_event_id`; the unique index on
  `(session_id, client_event_id)` means duplicate deliveries are no-ops. Safe to
  retry.
- **Batching:** up to `HEARTBEAT_WORKER_BATCH_SIZE` (500) events per flush;
  reads block up to `HEARTBEAT_WORKER_BLOCK_MS` (2500 ms).
- Code: `backend/app/services/heartbeat_ingestion/` (queue + worker);
  entrypoint `backend/app/workers/heartbeat_worker.py`.

## Running

Same image as the API, different command:

```bash
# In the prod stack (already defined as the `heartbeat-worker` service):
docker compose -f docker-compose.prod.yml up -d heartbeat-worker

# Standalone / local:
cd backend && PYTHONPATH=. python -m app.workers.heartbeat_worker
```

Scale horizontally — the Redis consumer group distributes entries across
workers, so adding replicas increases throughput without double-processing:

```bash
docker compose -f docker-compose.prod.yml up -d --scale heartbeat-worker=3
```

## Operating

- **Backlog:** inspect stream depth and pending entries.
  ```bash
  redis-cli XLEN openvision:heartbeat:v1
  redis-cli XPENDING openvision:heartbeat:v1 heartbeat-workers
  ```
  A growing `XLEN` with low consumer throughput means workers are down or
  Postgres is the bottleneck — add worker replicas or check DB health.
- **Stuck/pending entries:** entries delivered but never `XACK`ed reappear after
  the idle timeout and are retried up to `HEARTBEAT_MAX_RETRIES`, then
  dead-lettered. Check worker logs (JSON, correlation-id tagged) for the failing
  batch.
- **Redis outage:** the enqueue path is the durability boundary. If Redis is
  down, `/health/ready` returns `503`; resolve Redis before accepting traffic so
  events aren't lost.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `XLEN` climbing, answers not appearing in grading | worker(s) down | restart/scale `heartbeat-worker`; check logs |
| Repeated retries on one batch | malformed event / DB constraint | inspect dead-letter + worker logs; the unique index makes replay safe |
| Duplicate-key errors absent but counts look doubled | (expected) idempotency no-ops | none — by design |
