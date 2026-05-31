"""Prometheus metrics registry for OpenVision.

All counters, histograms, and gauges are defined here so they can be
imported by the API and worker without circular-import issues.

Endpoint: ``GET /metrics`` (see main.py)
"""
from prometheus_client import Counter, Gauge, Histogram

# --- HTTP ---
HTTP_REQUESTS_TOTAL = Counter(
    "openvision_http_requests_total",
    "Total HTTP requests by method, route, and status code.",
    ["method", "route", "status_code"],
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "openvision_http_request_duration_seconds",
    "HTTP request latency histogram.",
    ["method", "route"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

# --- Auth ---
AUTH_LOGIN_TOTAL = Counter(
    "openvision_auth_login_total",
    "Login attempts by outcome (success / failure).",
    ["outcome"],
)
RATE_LIMIT_REJECTED_TOTAL = Counter(
    "openvision_rate_limit_rejected_total",
    "Requests rejected by the rate limiter, by endpoint.",
    ["endpoint"],
)

# --- Heartbeat pipeline ---
HEARTBEAT_EVENTS_ENQUEUED_TOTAL = Counter(
    "openvision_heartbeat_events_enqueued_total",
    "Interaction events accepted and enqueued to Redis Stream.",
)
HEARTBEAT_EVENTS_PERSISTED_TOTAL = Counter(
    "openvision_heartbeat_events_persisted_total",
    "Interaction events successfully written to Postgres by the worker.",
)
HEARTBEAT_EVENTS_DUPLICATE_TOTAL = Counter(
    "openvision_heartbeat_events_duplicate_total",
    "Duplicate interaction events skipped by the idempotency constraint.",
)
HEARTBEAT_EVENTS_DEAD_LETTERED_TOTAL = Counter(
    "openvision_heartbeat_events_dead_lettered_total",
    "Interaction events moved to the dead-letter stream after max retries.",
)
HEARTBEAT_WORKER_FLUSH_SECONDS = Histogram(
    "openvision_heartbeat_worker_flush_seconds",
    "Time taken for the worker to flush a batch to Postgres.",
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)
HEARTBEAT_STREAM_LAG = Gauge(
    "openvision_heartbeat_stream_lag",
    "Approximate number of pending messages in the heartbeat Redis Stream.",
)

# --- Redis / Postgres health ---
REDIS_ERRORS_TOTAL = Counter(
    "openvision_redis_errors_total",
    "Redis operation errors.",
    ["operation"],
)
POSTGRES_READINESS_ERRORS_TOTAL = Counter(
    "openvision_postgres_readiness_errors_total",
    "Postgres readiness check failures.",
)
