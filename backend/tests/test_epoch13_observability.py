"""Epoch 13 — health/readiness, worker ack/dead-letter, and metrics-label tests.

Complements ``test_epoch13_infrastructure.py`` (config, rate limiter, queue,
cache) per directive §14.1/§14.2. All tests are mock-driven and anyio-marked so
the session-scoped autouse Prisma fixture is handled.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


def _prisma_mock(ok: bool = True) -> MagicMock:
    """A stand-in for the global Prisma client (its bound methods are read-only,
    so we replace the whole object rather than patching ``query_raw``)."""
    m = MagicMock()
    m.query_raw = (
        AsyncMock(return_value=[{"?column?": 1}])
        if ok
        else AsyncMock(side_effect=Exception("db down"))
    )
    return m


# ─────────────────────────────────────────────────────────────────────────────
# 1. Health / readiness endpoints
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthEndpoints:
    """Liveness is dependency-free; readiness reflects Postgres + Redis state."""

    async def test_live_returns_version(self, ac):
        resp = await ac.get("/health/live")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "live"
        assert "version" in body

    async def test_ready_ok_when_dependencies_up(self, ac):
        redis_mock = AsyncMock()
        redis_mock.ping = AsyncMock(return_value=True)
        with patch("app.main.prisma", _prisma_mock(ok=True)), \
                patch("app.main.get_redis", return_value=redis_mock):
            resp = await ac.get("/health/ready")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ready"
        assert body["checks"] == {"postgres": "ok", "redis": "ok"}

    async def test_ready_503_when_redis_down(self, ac):
        """A down dependency must surface as 503 — not a 200 with a tuple body."""
        redis_mock = AsyncMock()
        redis_mock.ping = AsyncMock(side_effect=Exception("Redis down"))
        with patch("app.main.prisma", _prisma_mock(ok=True)), \
                patch("app.main.get_redis", return_value=redis_mock):
            resp = await ac.get("/health/ready")
        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "unavailable"
        assert body["checks"]["postgres"] == "ok"
        assert body["checks"]["redis"].startswith("down")

    async def test_ready_503_when_postgres_down(self, ac):
        redis_mock = AsyncMock()
        redis_mock.ping = AsyncMock(return_value=True)
        with patch("app.main.prisma", _prisma_mock(ok=False)), \
                patch("app.main.get_redis", return_value=redis_mock):
            resp = await ac.get("/health/ready")
        assert resp.status_code == 503
        assert resp.json()["checks"]["postgres"].startswith("down")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Worker ack / dead-letter behaviour
# ─────────────────────────────────────────────────────────────────────────────

def _make_event_json(event_type: str = "ANSWER_CHANGE") -> str:
    return json.dumps(
        {
            "request_id": str(uuid4()),
            "session_id": str(uuid4()),
            "student_id": str(uuid4()),
            "received_at": "2026-05-31T00:00:00+00:00",
            "client_event_id": str(uuid4()),
            "learning_object_id": str(uuid4()),
            "item_version_id": str(uuid4()),
            "event_type": event_type,
            "payload": {"answer": "B"},
            "client_created_at": None,
        }
    )


class TestWorkerProcessing:
    """The batch processor ACKs on success and dead-letters un-parseable input."""

    async def test_decode_flags_invalid_messages(self):
        from app.services.heartbeat_ingestion import worker

        messages = [
            ("1-0", {"event": _make_event_json()}),
            ("2-0", {"event": "not-json{"}),
        ]
        parsed = worker._decode_messages(messages)
        assert parsed[0]["event"] is not None
        assert parsed[1]["event"] is None  # decode failure → flagged for dead-letter

    async def test_process_batch_acks_after_successful_flush(self):
        """Even with duplicates, every flushed stream id is ACKed (idempotent replay)."""
        from app.services.heartbeat_ingestion import worker

        redis_mock = AsyncMock()
        entries = worker._decode_messages(
            [("10-0", {"event": _make_event_json()}), ("11-0", {"event": _make_event_json()})]
        )

        # 1 persisted, 1 duplicate — the worker must still ACK both.
        with patch.object(worker, "flush_events", new=AsyncMock(return_value=(1, 1))):
            await worker._process_batch(redis_mock, entries)

        redis_mock.xack.assert_awaited_once()
        acked_ids = redis_mock.xack.await_args.args[2:]
        assert set(acked_ids) == {"10-0", "11-0"}

    async def test_process_batch_dead_letters_unparseable(self):
        from app.services.heartbeat_ingestion import worker

        redis_mock = AsyncMock()
        entries = worker._decode_messages([("99-0", {"event": "garbage{"})])

        with patch.object(worker, "flush_events", new=AsyncMock(return_value=(0, 0))) as flush:
            await worker._process_batch(redis_mock, entries)

        # Pushed to the dead-letter stream and never flushed.
        redis_mock.xadd.assert_awaited_once()
        assert redis_mock.xadd.await_args.args[0] == worker._DL_STREAM
        flush.assert_not_awaited()

    async def test_process_batch_leaves_pending_on_flush_error(self):
        """A transient DB error must NOT ACK — entries stay pending for retry."""
        from app.services.heartbeat_ingestion import worker

        redis_mock = AsyncMock()
        entries = worker._decode_messages([("20-0", {"event": _make_event_json()})])

        with patch.object(worker, "flush_events", new=AsyncMock(side_effect=Exception("db down"))):
            await worker._process_batch(redis_mock, entries)

        redis_mock.xack.assert_not_awaited()

    async def test_dead_letter_xadds_then_acks(self):
        from app.services.heartbeat_ingestion import worker

        redis_mock = AsyncMock()
        await worker._dead_letter(redis_mock, "5-0", _make_event_json(), "boom", attempts=5)

        redis_mock.xadd.assert_awaited_once()
        assert redis_mock.xadd.await_args.args[0] == worker._DL_STREAM
        redis_mock.xack.assert_awaited_once()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Metrics label cardinality
# ─────────────────────────────────────────────────────────────────────────────

class TestMetricsCardinality:
    """No metric may carry an unbounded (per-user / per-session) label."""

    async def test_heartbeat_counters_are_unlabelled(self):
        from app.core import metrics

        for counter in (
            metrics.HEARTBEAT_EVENTS_ENQUEUED_TOTAL,
            metrics.HEARTBEAT_EVENTS_PERSISTED_TOTAL,
            metrics.HEARTBEAT_EVENTS_DUPLICATE_TOTAL,
            metrics.HEARTBEAT_EVENTS_DEAD_LETTERED_TOTAL,
        ):
            assert counter._labelnames == ()

    async def test_no_high_cardinality_labels(self):
        from app.core import metrics

        banned = {"user_id", "student_id", "session_id", "request_id", "email", "ip"}
        for obj in vars(metrics).values():
            labelnames = getattr(obj, "_labelnames", None)
            if labelnames:
                assert banned.isdisjoint(labelnames), f"high-cardinality label on {obj}"

    async def test_http_counter_has_bounded_labels(self):
        from app.core.metrics import HTTP_REQUESTS_TOTAL

        assert set(HTTP_REQUESTS_TOTAL._labelnames) == {"method", "route", "status_code"}
