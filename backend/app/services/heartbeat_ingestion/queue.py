"""Enqueue validated heartbeat events into the Redis Stream.

This module is the *write side* of the pipeline: the API calls
``enqueue_events`` after validating ownership and session status.
It publishes one Redis Stream entry per event and returns the total
accepted count together with an estimate of current queue lag.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from redis.asyncio import Redis

from app.core.config import settings
from app.services.heartbeat_ingestion.schemas import HeartbeatQueueEvent


async def enqueue_events(
    *,
    redis: Redis,
    request_id: str,
    session_id: str,
    student_id: str,
    received_at: datetime,
    raw_events: List[Dict[str, Any]],
) -> Tuple[int, Optional[int]]:
    """Push a batch of validated events onto the heartbeat Redis Stream.

    Each event is written as a single XADD call inside a pipeline so the
    entire batch is sent in one round-trip.

    Args:
        redis:        Initialized async Redis client.
        request_id:   Correlation ID from the HTTP request.
        session_id:   UUID string of the owning exam session.
        student_id:   UUID string of the authenticated student.
        received_at:  UTC timestamp when the API received the batch.
        raw_events:   List of event dicts (already Pydantic-validated by the
                      endpoint, passed in as plain dicts for speed).

    Returns:
        Tuple of (accepted_count, queue_lag_estimate).
        ``queue_lag_estimate`` is the approximate number of messages in the
        stream pending acknowledgement, or ``None`` if the check fails.
    """
    pipe = redis.pipeline(transaction=False)
    stream_name = settings.HEARTBEAT_STREAM_NAME

    for index, event in enumerate(raw_events):
        queue_event = HeartbeatQueueEvent(
            request_id=request_id,
            session_id=session_id,
            student_id=student_id,
            client_event_id=str(event["client_event_id"]),
            learning_object_id=(
                str(event["learning_object_id"]) if event.get("learning_object_id") else None
            ),
            item_version_id=(
                str(event["item_version_id"]) if event.get("item_version_id") else None
            ),
            event_type=event["event_type"],
            payload=event["payload"],
            client_created_at=event.get("client_created_at"),
            # Offset each event's arrival time by its position so intra-batch
            # order is preserved end-to-end. Reconstruction falls back to
            # received_at when the client sends no client_created_at, and an
            # identical timestamp for every event in a batch would otherwise
            # make "latest answer wins" non-deterministic. The step is 1ms
            # because Prisma stores DateTime at millisecond precision, so a
            # sub-millisecond offset would be truncated away.
            received_at=received_at + timedelta(milliseconds=index),
        )
        pipe.xadd(stream_name, {"event": queue_event.model_dump_json()})

    await pipe.execute()

    # Estimate lag: pending group length (cheap, best-effort)
    lag: Optional[int] = None
    try:
        info = await redis.xinfo_groups(stream_name)
        for group in info:
            if group.get("name") == settings.HEARTBEAT_CONSUMER_GROUP:
                lag = int(group.get("pending", 0))
                break
    except Exception:
        pass

    return len(raw_events), lag
