"""Redis-backed cache helpers for read-heavy metadata.

Provides a simple get/set/invalidate API with explicit TTLs and key
namespacing.  Redis is never the source of truth — a cache miss always
falls through to the database.

Rules from the Epoch 13 directive:
- Never cache auth token validation results.
- Never cache per-student answers as source of truth.
- Invalidate on mutation of the underlying resource.
"""
import json
import logging
from typing import Any, Optional, TypeVar

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Default TTLs (seconds)
TTL_TEST_DEFINITION = 300       # 5 minutes
TTL_ITEM_VERSION = 300
TTL_SCHEDULED_SESSION = 120     # 2 minutes — shorter, joins are live events

T = TypeVar("T")


async def cache_get(redis: Redis, key: str) -> Optional[Any]:
    """Fetch a JSON-serialised value from Redis.

    Returns ``None`` on cache miss or any Redis error (fail-open).
    """
    try:
        raw = await redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("cache_get failed key=%s: %s", key, exc)
        return None


async def cache_set(redis: Redis, key: str, value: Any, ttl: int) -> None:
    """Serialise ``value`` to JSON and store it in Redis with a TTL.

    Silently swallows Redis errors so a cache write failure never
    crashes a request.
    """
    try:
        await redis.setex(key, ttl, json.dumps(value))
    except Exception as exc:
        logger.warning("cache_set failed key=%s: %s", key, exc)


async def cache_delete(redis: Redis, key: str) -> None:
    """Delete a single key from Redis (cache invalidation).

    Silently swallows errors.
    """
    try:
        await redis.delete(key)
    except Exception as exc:
        logger.warning("cache_delete failed key=%s: %s", key, exc)


async def cache_delete_pattern(redis: Redis, pattern: str) -> int:
    """Delete all keys matching a glob pattern.

    Use sparingly — SCAN is O(N) over the keyspace.

    Returns the number of keys deleted.
    """
    deleted = 0
    try:
        async for key in redis.scan_iter(match=pattern, count=100):
            await redis.delete(key)
            deleted += 1
    except Exception as exc:
        logger.warning("cache_delete_pattern failed pattern=%s: %s", pattern, exc)
    return deleted


# ---------------------------------------------------------------------------
# Key constructors
# ---------------------------------------------------------------------------

def test_definition_key(test_id: str) -> str:
    """Cache key for a resolved test definition snapshot."""
    return f"test_definition:{test_id}:snapshot:v1"


def item_version_key(item_version_id: str) -> str:
    """Cache key for an approved item version."""
    return f"item_version:{item_version_id}:approved:v1"


def scheduled_session_key(scheduled_session_id: str) -> str:
    """Cache key for a scheduled session summary."""
    return f"scheduled_session:{scheduled_session_id}:summary:v1"
