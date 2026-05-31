"""Tests for Epoch 13 infrastructure: config validation, rate limiter, and heartbeat queue."""
import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

# ─────────────────────────────────────────────────────────────────────────────
# 1. Config validation
# ─────────────────────────────────────────────────────────────────────────────

class TestConfigValidation:
    """Settings model must reject unsafe production configurations."""

    # These checks are synchronous, but the suite's session-scoped autouse
    # ``initialize_prisma`` fixture is async; under the anyio plugin every test
    # must be anyio-driven for that fixture to be handled, so mark the class.
    pytestmark = pytest.mark.anyio

    async def test_valid_environment_values(self):
        """All documented ENVIRONMENT values are accepted."""
        from app.core.config import Settings
        for env in ("development", "test", "staging", "production"):
            s = Settings(
                ENVIRONMENT=env,
                SECRET_KEY="any-key",
                POSTGRES_USER="u",
                POSTGRES_PASSWORD="p",
                POSTGRES_DB="db",
                POSTGRES_HOST="localhost",
                POSTGRES_PORT="5432",
            )
            assert s.ENVIRONMENT == env

    async def test_invalid_environment_raises(self):
        """Unknown ENVIRONMENT values raise a validation error."""
        from pydantic import ValidationError
        from app.core.config import Settings
        with pytest.raises(ValidationError):
            Settings(
                ENVIRONMENT="banana",
                SECRET_KEY="any-key",
            )

    async def test_assert_production_safe_passes_with_custom_secret(self):
        """Production with a non-default SECRET_KEY should not raise."""
        from app.core.config import Settings
        s = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="a-very-long-random-secret-that-is-not-the-dev-default",
            CORS_ALLOWED_ORIGINS=["https://openvision.example.com"],
            POSTGRES_USER="u",
            POSTGRES_PASSWORD="p",
            POSTGRES_DB="db",
            POSTGRES_HOST="localhost",
            POSTGRES_PORT="5432",
        )
        s.assert_production_safe()  # Must not raise

    async def test_assert_production_safe_raises_with_dev_secret(self):
        """Production with the dev SECRET_KEY must raise RuntimeError."""
        from app.core.config import Settings
        s = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="dev-secret-key-change-in-production-please",
            CORS_ALLOWED_ORIGINS=["https://openvision.example.com"],
            POSTGRES_USER="u",
            POSTGRES_PASSWORD="p",
            POSTGRES_DB="db",
            POSTGRES_HOST="localhost",
            POSTGRES_PORT="5432",
        )
        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            s.assert_production_safe()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Rate limiter
# ─────────────────────────────────────────────────────────────────────────────

class TestRateLimit:
    """Sliding-window rate limiter returns correct outcomes."""

    @pytest.mark.anyio
    async def test_under_limit_not_exceeded(self):
        """Requests below the limit are allowed."""
        from app.core.rate_limit import check_rate_limit

        redis_mock = AsyncMock()
        redis_mock.incr = AsyncMock(return_value=1)
        redis_mock.expire = AsyncMock()

        result = await check_rate_limit(redis_mock, key="test:1", limit=10, window_seconds=60)

        assert not result.exceeded
        assert result.current == 1

    @pytest.mark.anyio
    async def test_over_limit_exceeded(self):
        """Requests over the limit are flagged as exceeded."""
        from app.core.rate_limit import check_rate_limit

        redis_mock = AsyncMock()
        redis_mock.incr = AsyncMock(return_value=11)
        redis_mock.expire = AsyncMock()

        result = await check_rate_limit(redis_mock, key="test:2", limit=10, window_seconds=60)

        assert result.exceeded
        assert result.current == 11

    @pytest.mark.anyio
    async def test_redis_error_fails_open(self):
        """When Redis is unavailable the limiter fails open (allows request)."""
        from app.core.rate_limit import check_rate_limit

        redis_mock = AsyncMock()
        redis_mock.incr = AsyncMock(side_effect=Exception("Redis down"))

        result = await check_rate_limit(redis_mock, key="test:3", limit=10, window_seconds=60)

        assert not result.exceeded

    @pytest.mark.anyio
    async def test_retry_after_headers(self):
        """retry_after_headers returns all required headers."""
        from app.core.rate_limit import RateLimitResult
        result = RateLimitResult(exceeded=True, current=11, limit=10, window_seconds=60)
        headers = result.retry_after_headers
        assert "Retry-After" in headers
        assert "X-RateLimit-Limit" in headers
        assert "X-RateLimit-Remaining" in headers
        assert headers["X-RateLimit-Remaining"] == "0"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Heartbeat queue enqueue
# ─────────────────────────────────────────────────────────────────────────────

class TestHeartbeatQueue:
    """Enqueue pushes one XADD per event and returns accepted count."""

    @pytest.mark.anyio
    async def test_enqueue_returns_accepted_count(self):
        """enqueue_events returns the number of events passed in."""
        from app.services.heartbeat_ingestion.queue import enqueue_events

        redis_mock = AsyncMock()
        pipe_mock = MagicMock()
        pipe_mock.xadd = MagicMock()
        pipe_mock.execute = AsyncMock(return_value=[])
        redis_mock.pipeline = MagicMock(return_value=pipe_mock)
        redis_mock.xinfo_groups = AsyncMock(return_value=[])

        events = [
            {
                "client_event_id": str(uuid4()),
                "learning_object_id": str(uuid4()),
                "item_version_id": str(uuid4()),
                "event_type": "ANSWER_CHANGE",
                "payload": {"answer": "B"},
                "client_created_at": None,
            }
            for _ in range(5)
        ]

        accepted, lag = await enqueue_events(
            redis=redis_mock,
            request_id=str(uuid4()),
            session_id=str(uuid4()),
            student_id=str(uuid4()),
            received_at=datetime.now(timezone.utc),
            raw_events=events,
        )

        assert accepted == 5
        assert pipe_mock.xadd.call_count == 5

    @pytest.mark.anyio
    async def test_enqueue_serialises_json(self):
        """Each XADD call contains a valid JSON 'event' field."""
        from app.services.heartbeat_ingestion.queue import enqueue_events

        captured_calls = []

        redis_mock = AsyncMock()
        pipe_mock = MagicMock()

        def capture_xadd(stream, fields):
            captured_calls.append(fields)

        pipe_mock.xadd = MagicMock(side_effect=capture_xadd)
        pipe_mock.execute = AsyncMock(return_value=[])
        redis_mock.pipeline = MagicMock(return_value=pipe_mock)
        redis_mock.xinfo_groups = AsyncMock(return_value=[])

        event_id = str(uuid4())
        events = [
            {
                "client_event_id": event_id,
                "learning_object_id": None,
                "item_version_id": None,
                "event_type": "NAVIGATION",
                "payload": {"to": 2},
                "client_created_at": None,
            }
        ]

        await enqueue_events(
            redis=redis_mock,
            request_id="req-1",
            session_id="session-abc",
            student_id="student-xyz",
            received_at=datetime.now(timezone.utc),
            raw_events=events,
        )

        assert len(captured_calls) == 1
        raw_json = captured_calls[0]["event"]
        parsed = json.loads(raw_json)
        assert parsed["client_event_id"] == event_id
        assert parsed["event_type"] == "NAVIGATION"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Cache helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestCache:
    """Cache helpers fail open on Redis errors."""

    @pytest.mark.anyio
    async def test_cache_get_returns_none_on_miss(self):
        """A cache miss returns None without raising."""
        from app.core.cache import cache_get
        redis_mock = AsyncMock()
        redis_mock.get = AsyncMock(return_value=None)
        result = await cache_get(redis_mock, "missing:key")
        assert result is None

    @pytest.mark.anyio
    async def test_cache_get_returns_parsed_value(self):
        """A cache hit deserialises the JSON value."""
        from app.core.cache import cache_get
        redis_mock = AsyncMock()
        redis_mock.get = AsyncMock(return_value=json.dumps({"id": "abc"}))
        result = await cache_get(redis_mock, "hit:key")
        assert result == {"id": "abc"}

    @pytest.mark.anyio
    async def test_cache_set_and_get_roundtrip(self):
        """set then get returns the same value."""
        from app.core.cache import cache_get, cache_set
        store: dict = {}
        redis_mock = AsyncMock()
        redis_mock.setex = AsyncMock(side_effect=lambda k, t, v: store.update({k: v}))
        redis_mock.get = AsyncMock(side_effect=lambda k: store.get(k))

        await cache_set(redis_mock, "roundtrip:key", {"score": 99}, ttl=300)
        result = await cache_get(redis_mock, "roundtrip:key")
        assert result == {"score": 99}

    @pytest.mark.anyio
    async def test_cache_get_fails_open_on_error(self):
        """Redis error in cache_get returns None without raising."""
        from app.core.cache import cache_get
        redis_mock = AsyncMock()
        redis_mock.get = AsyncMock(side_effect=Exception("Redis down"))
        result = await cache_get(redis_mock, "error:key")
        assert result is None
