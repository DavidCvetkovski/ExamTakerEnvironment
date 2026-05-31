"""Heartbeat worker entrypoint.

Run with:
    python -m app.workers.heartbeat_worker

The API container and worker container use the same Docker image; only the
startup command differs (see docker-compose.prod.yml).
"""
import asyncio
import logging

from app.services.heartbeat_ingestion.worker import run_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

if __name__ == "__main__":
    asyncio.run(run_worker())
