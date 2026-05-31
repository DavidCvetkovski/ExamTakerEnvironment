"""Request context middleware: correlation IDs and structured access logs."""
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings

logger = logging.getLogger("openvision.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a correlation ID to every request and emit a structured access log.

    The ``X-Request-ID`` header is read from the incoming request when
    provided by a trusted reverse proxy; otherwise a new UUID is generated.
    The same ID is returned on every response so clients can correlate
    errors with server logs.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        response.headers["X-Request-ID"] = request_id

        logger.info(
            "%s %s %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "environment": settings.ENVIRONMENT,
                "version": settings.APP_VERSION,
            },
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Set baseline security headers on every API response (§9.11).

    These are defense-in-depth: in production Nginx fronts the API and also
    sets HSTS / CSP for HTML responses, but the API should be safe even when
    reached directly (e.g. an internal caller or a misconfigured proxy).

    No Content-Security-Policy is set here — the API serves JSON, and CSP only
    governs document rendering, so it belongs on the frontend/Nginx responses.
    HSTS is emitted only in production to avoid pinning HTTPS during local dev.
    """

    # A locked-down Permissions-Policy: the API has no need for any of these
    # powerful browser capabilities.
    _PERMISSIONS_POLICY = (
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
        "magnetometer=(), microphone=(), payment=(), usb=()"
    )

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault("Permissions-Policy", self._PERMISSIONS_POLICY)
        if settings.ENVIRONMENT == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains",
            )
        return response
