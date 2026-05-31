"""Structured JSON logging configuration for OpenVision.

Call ``configure_logging()`` once at startup.  After that, every
``logging.getLogger(__name__)`` call in the codebase emits JSON lines
compatible with log-aggregation tools (Loki, CloudWatch, Datadog, etc.).

Never log passwords, tokens, cookies, raw Authorization headers,
full answer payloads, or stack traces in the response body.
"""
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict


class _JsonFormatter(logging.Formatter):
    """Format log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Propagate extra context fields set by the request middleware
        for field in ("request_id", "method", "path", "status_code",
                      "duration_ms", "user_id", "role", "client_ip",
                      "environment", "version"):
            if hasattr(record, field):
                log[field] = getattr(record, field)

        if record.exc_info:
            log["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(log, default=str)


def configure_logging(level: str = "INFO", use_json: bool = True) -> None:
    """Set up the root logger with the chosen formatter.

    Args:
        level:    Logging level string (``"DEBUG"``, ``"INFO"``, etc.).
        use_json: When ``True`` emit JSON lines; when ``False`` use a
                  human-readable format useful for local development.
    """
    handler = logging.StreamHandler(sys.stdout)

    if use_json:
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(name)s  %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
