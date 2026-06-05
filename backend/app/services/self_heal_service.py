"""Self-heal incident store (Epoch 15).

The single write/read surface for the incident log that feeds the autonomous
fix loop. Two producers — the exception-capture middleware and the ``/feedback``
endpoint — and one consumer surface (the admin feed, and later the agent).

Design contract:
  * **Best-effort capture.** Recording must never raise into the request path;
    a failure to log a bug is not itself a user-facing error.
  * **Deduplication by fingerprint.** Recurring faults collapse onto one row
    with an incremented ``occurrences`` and a refreshed ``last_seen_at`` — so a
    crash-looping endpoint is one actionable item, not ten thousand.
  * **PII-light (§1).** We persist role, path, method and query *keys* — never
    the user id, query values, tokens, or request bodies.
"""
import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

from prisma import Json

from app.core.prisma_db import prisma
from app.models.self_heal_incident import (
    SelfHealIncidentSource,
    SelfHealSeverity,
    SelfHealStatus,
)

logger = logging.getLogger("openvision.self_heal")

# UUIDs and long digit runs in a path are per-request noise; normalize them out
# of the fingerprint so ``/sessions/<uuid-a>`` and ``/sessions/<uuid-b>`` that
# fail the same way collapse onto one incident.
_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
_NUM_RE = re.compile(r"\d+")

_MAX_MESSAGE = 8000
_MAX_TRACEBACK = 16000
# Client-supplied context is untrusted (§1) — bound it so a caller can't bloat
# the incident store with an arbitrarily large payload.
_MAX_CONTEXT_KEYS = 30
_MAX_CONTEXT_CHARS = 4000


def _bound_context(context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Clamp a client-supplied context dict to a safe size before persisting."""
    if not context:
        return {}
    bounded = dict(list(context.items())[:_MAX_CONTEXT_KEYS])
    import json

    serialized = json.dumps(bounded, default=str)
    if len(serialized) > _MAX_CONTEXT_CHARS:
        return {"_truncated": True, "preview": serialized[:_MAX_CONTEXT_CHARS]}
    return bounded


def _normalize_path(path: Optional[str]) -> str:
    if not path:
        return ""
    path = _UUID_RE.sub(":id", path)
    return _NUM_RE.sub(":n", path)


def compute_fingerprint(
    *,
    source: SelfHealIncidentSource,
    title: str,
    path: Optional[str],
) -> str:
    """Stable hash grouping recurrences of the same fault.

    For an exception this is ``(exception class, normalized route)`` — the same
    error from the same endpoint is one incident regardless of which user or row
    triggered it. Feedback is keyed on its source + path so distinct reports stay
    distinct (they carry their own text, which we don't fold into the hash).
    """
    basis = f"{source.value}|{title}|{_normalize_path(path)}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


async def record_incident(
    *,
    source: SelfHealIncidentSource,
    severity: SelfHealSeverity,
    title: str,
    message: str,
    fingerprint: str,
    traceback: Optional[str] = None,
    request_method: Optional[str] = None,
    request_path: Optional[str] = None,
    request_id: Optional[str] = None,
    user_role: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Upsert one incident, deduplicated by ``fingerprint``.

    Never raises: any failure to persist is logged and swallowed so the caller's
    own error handling (or success path) is unaffected.
    """
    try:
        await prisma.self_heal_incidents.upsert(
            where={"fingerprint": fingerprint},
            data={
                "create": {
                    "source": source.value,
                    "severity": severity.value,
                    "status": SelfHealStatus.NEW.value,
                    "title": title[:512],
                    "message": message[:_MAX_MESSAGE],
                    "traceback": traceback[:_MAX_TRACEBACK] if traceback else None,
                    "fingerprint": fingerprint,
                    "request_method": request_method,
                    "request_path": request_path,
                    "request_id": request_id,
                    "user_role": user_role,
                    "context": Json(context or {}),
                },
                # On recurrence: bump the counter and refresh recency only. We do
                # not reopen a RESOLVED row here — a fault recurring after a
                # claimed fix is a signal the loop should weigh, not silently
                # erase. (Reopen policy is deferred; see directive.)
                "update": {
                    "occurrences": {"increment": 1},
                    "last_seen_at": {"set": _now()},
                },
            },
        )
    except Exception:  # noqa: BLE001 — capture must never break the request path
        logger.exception("Failed to record self-heal incident (fingerprint=%s)", fingerprint)


async def record_exception(
    *,
    exc: BaseException,
    request_method: Optional[str] = None,
    request_path: Optional[str] = None,
    request_id: Optional[str] = None,
    user_role: Optional[str] = None,
    traceback_text: Optional[str] = None,
    query_keys: Optional[List[str]] = None,
) -> None:
    """Record an unhandled runtime exception as a CRITICAL incident."""
    title = type(exc).__name__
    message = str(exc) or title
    fingerprint = compute_fingerprint(
        source=SelfHealIncidentSource.RUNTIME_EXCEPTION,
        title=title,
        path=request_path,
    )
    context: Dict[str, Any] = {}
    if query_keys:
        context["query_keys"] = sorted(query_keys)
    await record_incident(
        source=SelfHealIncidentSource.RUNTIME_EXCEPTION,
        severity=SelfHealSeverity.CRITICAL,
        title=title,
        message=message,
        fingerprint=fingerprint,
        traceback=traceback_text,
        request_method=request_method,
        request_path=request_path,
        request_id=request_id,
        user_role=user_role,
        context=context,
    )


async def record_feedback(
    *,
    message: str,
    path: Optional[str] = None,
    user_role: Optional[str] = None,
    request_id: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Record a user-submitted bug report as a WARNING incident.

    Feedback is not deduplicated across distinct submissions: each report carries
    its own narrative, so the fingerprint includes a short content digest to keep
    genuinely different reports on separate rows while still collapsing exact
    re-submissions (a double-clicked "Send").
    """
    title = message.strip().splitlines()[0][:120] if message.strip() else "Feedback"
    content_digest = hashlib.sha256(message.strip().encode("utf-8")).hexdigest()[:12]
    fingerprint = compute_fingerprint(
        source=SelfHealIncidentSource.USER_FEEDBACK,
        title=content_digest,
        path=path,
    )
    await record_incident(
        source=SelfHealIncidentSource.USER_FEEDBACK,
        severity=SelfHealSeverity.WARNING,
        title=title,
        message=message,
        fingerprint=fingerprint,
        request_path=path,
        request_id=request_id,
        user_role=user_role,
        context=_bound_context(context),
    )


async def list_incidents(
    *,
    page: int = 1,
    page_size: int = 50,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    source: Optional[str] = None,
) -> Dict[str, Any]:
    """Paginated incident feed, newest activity first (§4: always paginate)."""
    where: Dict[str, Any] = {}
    if status:
        where["status"] = status
    if severity:
        where["severity"] = severity
    if source:
        where["source"] = source

    total = await prisma.self_heal_incidents.count(where=where)
    rows = await prisma.self_heal_incidents.find_many(
        where=where,
        order={"last_seen_at": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


def _now():
    """Wall-clock now in UTC. Wrapped so tests/callers don't import datetime here."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)
