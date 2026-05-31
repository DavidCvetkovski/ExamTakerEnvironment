"""Heartbeat Redis Stream consumer worker.

This module implements the *read side* of the heartbeat pipeline.
It is designed to run as a standalone process (not inside the API
container) so it can be scaled independently:

    python -m app.workers.heartbeat_worker

Lifecycle:
    1. Connect Prisma and Redis.
    2. Ensure the consumer group exists on the stream (MKSTREAM safe).
    3. Loop: XREADGROUP → decode → batch flush → XACK.
    4. Periodically claim stale pending entries from crashed consumers.
    5. After HEARTBEAT_MAX_RETRIES failures, dead-letter the entry.
    6. Graceful shutdown on SIGINT / SIGTERM.
"""
import asyncio
import json
import logging
import os
import signal
import socket
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from app.core.config import settings
from app.core.prisma_db import connect_prisma, disconnect_prisma
from app.core.redis import connect_redis, disconnect_redis, get_redis
from app.services.heartbeat_ingestion.persistence import flush_events
from app.services.heartbeat_ingestion.schemas import HeartbeatQueueEvent

logger = logging.getLogger(__name__)

# Dead-letter stream key
_DL_STREAM = "openvision:heartbeat:dead-letter:v1"

# Unique name per worker pod/process
_CONSUMER_NAME = f"{socket.gethostname()}-pid{os.getpid()}"

# How long (ms) a message must be pending before another consumer reclaims it
_AUTOCLAIM_MIN_IDLE_MS = 30_000  # 30 seconds

_shutdown_event = asyncio.Event()


def _handle_signal(sig: int, _frame: Any) -> None:
    """Signal handler: request a clean shutdown."""
    logger.info("Received signal %s — shutting down heartbeat worker.", sig)
    _shutdown_event.set()


async def _ensure_consumer_group(redis: Redis) -> None:
    """Create the consumer group if it does not already exist."""
    try:
        await redis.xgroup_create(
            settings.HEARTBEAT_STREAM_NAME,
            settings.HEARTBEAT_CONSUMER_GROUP,
            id="0",
            mkstream=True,
        )
        logger.info("Created consumer group '%s'.", settings.HEARTBEAT_CONSUMER_GROUP)
    except ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            logger.debug("Consumer group already exists — continuing.")
        else:
            raise


def _decode_messages(
    messages: List[Any],
) -> List[Dict[str, Any]]:
    """Parse raw XREADGROUP messages into (stream_id, HeartbeatQueueEvent) tuples."""
    parsed = []
    for stream_id, fields in messages:
        raw_json = fields.get("event", "")
        try:
            event = HeartbeatQueueEvent.model_validate_json(raw_json)
            parsed.append({"id": stream_id, "event": event, "raw": raw_json, "attempts": 0})
        except Exception as exc:
            logger.error(
                "Failed to decode stream message id=%s: %s", stream_id, exc
            )
            parsed.append({"id": stream_id, "event": None, "raw": raw_json, "attempts": 0})
    return parsed


async def _dead_letter(
    redis: Redis,
    stream_id: str,
    raw_json: str,
    error: str,
    attempts: int,
) -> None:
    """Move a failing message to the dead-letter stream and acknowledge it."""
    await redis.xadd(
        _DL_STREAM,
        {
            "event": raw_json,
            "error": error,
            "failed_at": datetime.now(timezone.utc).isoformat(),
            "attempts": str(attempts),
            "source_stream_id": stream_id,
        },
    )
    await redis.xack(
        settings.HEARTBEAT_STREAM_NAME,
        settings.HEARTBEAT_CONSUMER_GROUP,
        stream_id,
    )
    logger.warning(
        "Dead-lettered message id=%s after %d attempts. Error: %s",
        stream_id,
        attempts,
        error,
    )


async def _process_batch(
    redis: Redis,
    entries: List[Dict[str, Any]],
) -> None:
    """Flush a batch to Postgres and ACK successful entries."""
    valid = [e for e in entries if e["event"] is not None]
    invalid = [e for e in entries if e["event"] is None]

    # Dead-letter immediately un-parseable messages
    for entry in invalid:
        await _dead_letter(
            redis,
            entry["id"],
            entry["raw"],
            "Failed to decode message from stream",
            attempts=1,
        )

    if not valid:
        return

    events = [e["event"] for e in valid]
    stream_ids = [e["id"] for e in valid]

    try:
        persisted, duplicates = await flush_events(events)
        logger.info(
            "Flushed batch: persisted=%d duplicates=%d stream_ids=%d",
            persisted,
            duplicates,
            len(stream_ids),
        )
        # ACK all after a successful flush (idempotency is handled in DB)
        await redis.xack(
            settings.HEARTBEAT_STREAM_NAME,
            settings.HEARTBEAT_CONSUMER_GROUP,
            *stream_ids,
        )
    except Exception as exc:
        # Transient error: leave pending so the autoclaim loop retries
        logger.error("DB flush failed, leaving %d messages pending: %s", len(valid), exc)


async def _autoclaim_stale(redis: Redis) -> None:
    """Claim pending messages older than AUTOCLAIM_MIN_IDLE_MS and reprocess.

    This recovers entries left by crashed worker instances.
    """
    try:
        result = await redis.xautoclaim(
            settings.HEARTBEAT_STREAM_NAME,
            settings.HEARTBEAT_CONSUMER_GROUP,
            _CONSUMER_NAME,
            min_idle_time=_AUTOCLAIM_MIN_IDLE_MS,
            start_id="0-0",
            count=settings.HEARTBEAT_WORKER_BATCH_SIZE,
        )
        # result is (next_start_id, messages, deleted_ids)
        messages = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
        if messages:
            logger.info("Autoclaimed %d stale messages.", len(messages))
            entries = _decode_messages(messages)
            # Check retry counts and dead-letter exhausted ones
            pending_info = await redis.xpending_range(
                settings.HEARTBEAT_STREAM_NAME,
                settings.HEARTBEAT_CONSUMER_GROUP,
                min="-",
                max="+",
                count=len(messages),
            )
            delivery_counts = {p["message_id"]: p["times_delivered"] for p in pending_info}
            for entry in entries:
                entry["attempts"] = delivery_counts.get(entry["id"], 1)

            exhausted = [
                e for e in entries if e["attempts"] >= settings.HEARTBEAT_MAX_RETRIES
            ]
            to_process = [
                e for e in entries if e["attempts"] < settings.HEARTBEAT_MAX_RETRIES
            ]

            for entry in exhausted:
                await _dead_letter(
                    redis,
                    entry["id"],
                    entry["raw"],
                    f"Exceeded max retries ({settings.HEARTBEAT_MAX_RETRIES})",
                    entry["attempts"],
                )

            if to_process:
                await _process_batch(redis, to_process)
    except Exception as exc:
        logger.warning("Autoclaim iteration failed: %s", exc)


async def run_worker() -> None:
    """Main worker loop: consume, flush, and acknowledge heartbeat events."""
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    logger.info(
        "Starting heartbeat worker consumer=%s stream=%s group=%s",
        _CONSUMER_NAME,
        settings.HEARTBEAT_STREAM_NAME,
        settings.HEARTBEAT_CONSUMER_GROUP,
    )

    await connect_prisma()
    await connect_redis()
    redis: Redis = get_redis()

    await _ensure_consumer_group(redis)

    last_autoclaim = time.monotonic()
    autoclaim_interval = 30.0  # seconds

    while not _shutdown_event.is_set():
        try:
            # Read a batch from our consumer group
            raw = await redis.xreadgroup(
                groupname=settings.HEARTBEAT_CONSUMER_GROUP,
                consumername=_CONSUMER_NAME,
                streams={settings.HEARTBEAT_STREAM_NAME: ">"},
                count=settings.HEARTBEAT_WORKER_BATCH_SIZE,
                block=settings.HEARTBEAT_WORKER_BLOCK_MS,
            )

            if raw:
                # raw: [[stream_name, [[id, fields], ...]]]
                for _stream_name, messages in raw:
                    entries = _decode_messages(messages)
                    await _process_batch(redis, entries)

            # Periodic autoclaim of stale entries
            now = time.monotonic()
            if now - last_autoclaim >= autoclaim_interval:
                await _autoclaim_stale(redis)
                last_autoclaim = now

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Unexpected worker error: %s", exc, exc_info=True)
            # Brief back-off to avoid tight error loops
            await asyncio.sleep(1)

    logger.info("Heartbeat worker shutting down cleanly.")
    await disconnect_redis()
    await disconnect_prisma()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(run_worker())
