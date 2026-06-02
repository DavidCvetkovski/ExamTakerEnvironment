"""Session presence tracking for the supervisor monitor (Epoch 11 §9.4).

Presence is Redis-first so the heartbeat hot path stays off Postgres: each
accepted heartbeat refreshes a short-TTL key; the monitor reads those keys and
falls back to the durable ``exam_sessions.last_seen_at`` when a key has expired.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _presence_key(session_id: str) -> str:
    return f"presence:session:{session_id}"


def _try_get_redis():
    """Return the Redis client or None (graceful degradation in tests)."""
    try:
        from app.core.redis import get_redis

        return get_redis()
    except RuntimeError:
        return None


async def touch(session_id: str, current_index: Optional[int] = None) -> None:
    """Refresh a session's presence after an accepted heartbeat. O(1), no DB write."""
    redis = _try_get_redis()
    if redis is None:
        return
    value = json.dumps(
        {"seen_at": datetime.now(timezone.utc).isoformat(), "idx": current_index}
    )
    try:
        await redis.set(_presence_key(session_id), value, ex=settings.PRESENCE_DISCONNECTED_SECONDS)
    except Exception as exc:  # presence is best-effort
        logger.debug("presence touch failed for %s: %s", session_id, exc)


async def snapshot(session_ids: List[str]) -> Dict[str, dict]:
    """Return ``{session_id: {seen_at, idx}}`` for the given sessions from Redis."""
    redis = _try_get_redis()
    if redis is None or not session_ids:
        return {}
    out: Dict[str, dict] = {}
    try:
        keys = [_presence_key(sid) for sid in session_ids]
        values = await redis.mget(keys)
        for sid, raw in zip(session_ids, values):
            if raw:
                try:
                    out[sid] = json.loads(raw)
                except (ValueError, TypeError):
                    continue
    except Exception as exc:
        logger.debug("presence snapshot failed: %s", exc)
    return out


def derive_presence(seen_at: Optional[datetime], server_now: datetime) -> str:
    """Map a last-seen timestamp to ACTIVE / IDLE / DISCONNECTED.

    Single source of the thresholds (mirrored advisory-only on the client).
    """
    if seen_at is None:
        return "DISCONNECTED"
    if seen_at.tzinfo is None:
        seen_at = seen_at.replace(tzinfo=timezone.utc)
    age = (server_now - seen_at).total_seconds()
    if age < settings.PRESENCE_IDLE_SECONDS:
        return "ACTIVE"
    if age < settings.PRESENCE_DISCONNECTED_SECONDS:
        return "IDLE"
    return "DISCONNECTED"
