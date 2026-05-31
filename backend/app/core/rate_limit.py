"""Redis-backed rate limiting primitives for OpenVision.

Uses a sliding-window counter pattern implemented with Redis INCR + EXPIRE.
Returns a standard ``RateLimitResult`` so callers can decide whether to
raise a 429 or log the breach.

Usage (inside a FastAPI dependency)::

    result = await check_rate_limit(redis, key="login:ip:1.2.3.4", limit=10, window_seconds=60)
    if result.exceeded:
        raise HTTPException(status_code=429, headers=result.retry_after_headers)
"""
import logging
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from app.core.dependencies import get_current_user as _get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)


@dataclass
class RateLimitResult:
    """Outcome of a single rate-limit check."""
    exceeded: bool
    current: int
    limit: int
    window_seconds: int

    @property
    def retry_after_headers(self) -> dict:
        """HTTP headers to return on 429 responses."""
        return {
            "Retry-After": str(self.window_seconds),
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(max(0, self.limit - self.current)),
        }


async def check_rate_limit(
    redis: Redis,
    *,
    key: str,
    limit: int,
    window_seconds: int,
) -> RateLimitResult:
    """Increment and check a sliding-window counter in Redis.

    The counter key is namespaced under ``rl:`` to avoid collisions.
    A new key is given a TTL equal to the window so it auto-expires.

    Args:
        redis:          Initialized async Redis client.
        key:            Unique rate-limit key (e.g., ``login:ip:1.2.3.4``).
        limit:          Maximum allowed calls within the window.
        window_seconds: Duration of the sliding window in seconds.

    Returns:
        ``RateLimitResult`` with ``exceeded=True`` when the caller is over limit.
    """
    namespaced = f"rl:{key}"
    try:
        current = await redis.incr(namespaced)
        if current == 1:
            # First request in this window — set the TTL
            await redis.expire(namespaced, window_seconds)
        exceeded = current > limit
        return RateLimitResult(
            exceeded=exceeded,
            current=current,
            limit=limit,
            window_seconds=window_seconds,
        )
    except Exception as exc:
        # If Redis is unavailable, fail open (do not block legitimate users).
        # Log a warning so ops are alerted.
        logger.warning("Rate limit check failed for key=%s: %s. Allowing request.", key, exc)
        return RateLimitResult(exceeded=False, current=0, limit=limit, window_seconds=window_seconds)


def make_login_key(ip: str, email: str) -> str:
    """Build a rate-limit key scoped to both IP and normalised email.

    Using both prevents one NAT from blocking an entire exam hall while still
    preventing per-account brute-force attacks.
    """
    normalized_email = email.lower().strip()
    return f"login:ip:{ip}:email:{normalized_email}"


def make_heartbeat_key(user_id: str, session_id: str) -> str:
    """Build a rate-limit key for heartbeat requests per user/session."""
    return f"heartbeat:user:{user_id}:session:{session_id}"


def make_refresh_key(user_id: Optional[str], ip: str) -> str:
    """Build a rate-limit key for token refresh attempts."""
    if user_id:
        return f"refresh:user:{user_id}"
    return f"refresh:ip:{ip}"


# ---------------------------------------------------------------------------
# FastAPI dependencies (§9.8 policy table)
# ---------------------------------------------------------------------------
#
# These wire the primitives above onto concrete routes.  They are deliberately
# resilient: if Redis is not initialized (e.g. unit tests that never call
# ``connect_redis``) the limiter fails open rather than 500-ing the route.

def client_ip(request: Request) -> str:
    """Best-effort client IP, preferring a trusted proxy header.

    Only the left-most ``X-Forwarded-For`` entry is used; in production this
    header is set by Nginx, which strips any client-supplied value.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _enforce(*, key: str, limit: int, window_seconds: int, endpoint: str) -> None:
    """Check one limit and raise 429 if exceeded. Fails open on Redis errors.

    The 429 includes ``Retry-After`` / ``X-RateLimit-*`` headers and the
    rejection is counted in the ``RATE_LIMIT_REJECTED_TOTAL`` metric. We never
    log the raw key (it can contain an email) — only the endpoint class.
    """
    # Imported lazily to avoid a circular import: redis.py -> config, and
    # metrics is import-light, but keeping these local keeps this module
    # usable from contexts where Redis was never initialized.
    from app.core.redis import get_redis
    from app.core.metrics import RATE_LIMIT_REJECTED_TOTAL

    try:
        redis = get_redis()
    except RuntimeError:
        # Redis not initialized — fail open.
        return

    result = await check_rate_limit(
        redis, key=key, limit=limit, window_seconds=window_seconds
    )
    if result.exceeded:
        RATE_LIMIT_REJECTED_TOTAL.labels(endpoint=endpoint).inc()
        logger.warning(
            "Rate limit exceeded endpoint=%s limit=%d/%ds current=%d",
            endpoint,
            limit,
            window_seconds,
            result.current,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again.",
            headers=result.retry_after_headers,
        )


async def _email_from_body(request: Request) -> str:
    """Read the ``email`` field from a JSON body without consuming it.

    FastAPI caches the request body, so reading it here still lets the route's
    Pydantic model parse the same bytes afterwards.
    """
    try:
        body = await request.json()
        return str(body.get("email", "")) if isinstance(body, dict) else ""
    except Exception:
        return ""


async def rate_limit_login(request: Request) -> None:
    """Login: 10/minute and 100/hour, keyed on IP + normalized email.

    IP+email (not IP alone) so one NAT'd exam hall can't lock itself out.
    """
    ip = client_ip(request)
    email = await _email_from_body(request)
    key = make_login_key(ip, email)
    await _enforce(key=key, limit=10, window_seconds=60, endpoint="login")
    await _enforce(key=f"{key}:hourly", limit=100, window_seconds=3600, endpoint="login")


async def rate_limit_register(request: Request) -> None:
    """Register: 5/minute per IP."""
    await _enforce(
        key=f"register:ip:{client_ip(request)}",
        limit=5,
        window_seconds=60,
        endpoint="register",
    )


async def rate_limit_refresh(request: Request) -> None:
    """Refresh: 60/minute, keyed on the refresh cookie if present else IP."""
    cookie = request.cookies.get("refresh_token")
    if cookie:
        # Hash the cookie so the raw token never lands in a Redis key.
        key = f"refresh:token:{hash(cookie) & 0xFFFFFFFFFFFF:x}"
    else:
        key = make_refresh_key(None, client_ip(request))
    await _enforce(key=key, limit=60, window_seconds=60, endpoint="refresh")


async def rate_limit_heartbeat(
    session_id: UUID,
    current_user: "User" = Depends(_get_current_user),
) -> None:
    """Heartbeat: 60/minute per user+session.

    60/min comfortably covers the 2-second frontend flush cadence plus retries
    and visibility-change flushes, while still capping a runaway client.
    ``get_current_user`` is shared (cached) with the route's own dependency, so
    this does not re-run authentication.
    """
    await _enforce(
        key=make_heartbeat_key(str(current_user.id), str(session_id)),
        limit=60,
        window_seconds=60,
        endpoint="heartbeat",
    )
