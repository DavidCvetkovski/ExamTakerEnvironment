"""Batch-flush heartbeat events from Redis Stream messages to Postgres.

This module is the *write side* to the database: it takes a list of decoded
``HeartbeatQueueEvent`` instances and persists them with idempotency
enforcement via the ``(session_id, client_event_id)`` unique constraint.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from prisma import Json
from prisma.errors import UniqueViolationError

from app.core.prisma_db import prisma
from app.services.heartbeat_ingestion.schemas import HeartbeatQueueEvent

logger = logging.getLogger(__name__)


def _build_record(event: HeartbeatQueueEvent) -> Dict[str, Any]:
    """Convert a queue event to a Prisma create-many record dict."""
    return {
        "session_id": event.session_id,
        "client_event_id": event.client_event_id,
        "learning_object_id": event.learning_object_id,
        "item_version_id": event.item_version_id,
        "event_type": event.event_type,
        "payload": Json(event.payload),
        # Use client timestamp for ordering; fall back to received_at.
        "created_at": event.client_created_at or event.received_at,
        "received_at": event.received_at,
    }


async def flush_events(
    events: List[HeartbeatQueueEvent],
) -> Tuple[int, int]:
    """Persist a batch of heartbeat events to Postgres idempotently.

    Attempts ``create_many`` with ``skip_duplicates=True``.  If the Prisma
    client version does not support that flag the function falls back to
    individual inserts, silently discarding records that violate the unique
    constraint on ``(session_id, client_event_id)``.

    Args:
        events: List of decoded queue events ready for insertion.

    Returns:
        Tuple of (persisted_count, duplicate_count).
    """
    if not events:
        return 0, 0

    records = [_build_record(e) for e in events]

    try:
        count = await prisma.interaction_events.create_many(
            data=records,
            skip_duplicates=True,
        )
        duplicates = len(events) - count
        return count, duplicates

    except TypeError:
        # Fallback: Prisma version does not support skip_duplicates.
        persisted = 0
        duplicates = 0
        for record in records:
            try:
                await prisma.interaction_events.create(data=record)
                persisted += 1
            except UniqueViolationError:
                duplicates += 1
            except Exception as exc:
                logger.error(
                    "Failed to persist event session=%s client_event_id=%s: %s",
                    record.get("session_id"),
                    record.get("client_event_id"),
                    exc,
                )
                raise
        return persisted, duplicates
