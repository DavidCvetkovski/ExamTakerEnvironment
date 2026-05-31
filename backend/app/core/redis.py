"""Redis connection setup and async client lifecycle helpers."""

from typing import Optional

from redis.asyncio import Redis

from app.core.config import settings

redis_client: Optional[Redis] = None


async def connect_redis() -> None:
    """Connect to the Redis server and verify it is reachable."""
    global redis_client
    redis_client = Redis.from_url(settings.get_redis_url, decode_responses=True)
    await redis_client.ping()


async def disconnect_redis() -> None:
    """Close the Redis client connection."""
    global redis_client
    if redis_client is not None:
        await redis_client.aclose()
        redis_client = None


def get_redis() -> Redis:
    """Dependency helper to retrieve the initialized Redis client."""
    if redis_client is None:
        raise RuntimeError("Redis client is not initialized or connected.")
    return redis_client
