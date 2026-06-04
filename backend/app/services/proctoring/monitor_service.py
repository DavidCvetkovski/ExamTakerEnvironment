"""Read models for the supervisor monitor and incident feed (Epoch 11 §9.5)."""
import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

import logging

from app.core.prisma_db import prisma
from app.models.exam_session import SessionStatus
from app.services.proctoring import presence_service

logger = logging.getLogger(__name__)


def _coerce_detail(detail: Any) -> Dict[str, Any]:
    """Normalise an incident ``detail`` to a dict for display/export.

    M-5: a legacy non-dict value (e.g. a raw JSON string) is preserved under a
    ``_raw`` key rather than silently discarded, and the fallback is logged so the
    data loss surfaces instead of vanishing from the feed and CSV.
    """
    if isinstance(detail, dict):
        return detail
    if detail is None:
        return {}
    logger.warning("incident detail was %s, preserving under _raw", type(detail).__name__)
    return {"_raw": detail}


async def build_monitor(scheduled_session_id: UUID, page: int, page_size: int) -> Dict[str, Any]:
    """Live roster for one scheduled session: attempts + presence + incident counts."""
    server_now = datetime.now(timezone.utc)
    where = {"scheduled_session_id": str(scheduled_session_id)}

    total = await prisma.exam_sessions.count(where=where)
    sessions = await prisma.exam_sessions.find_many(
        where=where,
        include={"users": True},
        order={"started_at": "asc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )

    session_ids = [s.id for s in sessions]
    presence_map = await presence_service.snapshot(session_ids)

    # Incident counts per attempt (one grouped pass — bounded by the page size).
    incident_counts: Dict[str, int] = {}
    if session_ids:
        rows = await prisma.proctoring_incidents.find_many(
            where={"exam_session_id": {"in": session_ids}}
        )
        for row in rows:
            if row.exam_session_id:
                incident_counts[row.exam_session_id] = incident_counts.get(row.exam_session_id, 0) + 1

    attempts = []
    for s in sessions:
        pres = presence_map.get(s.id, {})
        seen_raw = pres.get("seen_at")
        seen_at: Optional[datetime] = None
        if seen_raw:
            try:
                seen_at = datetime.fromisoformat(seen_raw)
            except ValueError:
                seen_at = None
        if seen_at is None:
            seen_at = s.last_seen_at  # durable fallback

        total_items = len(s.items) if isinstance(s.items, list) else None
        idx = pres.get("idx")
        label = None
        if isinstance(idx, int) and total_items:
            label = f"Q{idx + 1} / {total_items}"

        user = getattr(s, "users", None)
        attempts.append(
            {
                "exam_session_id": s.id,
                "student_id": s.student_id,
                "student_email": user.email if user else "",
                "student_name": getattr(user, "vunet_id", None) if user else None,
                "status": s.status,
                "current_question_index": idx if isinstance(idx, int) else None,
                "current_question_label": label,
                "last_seen_at": seen_at,
                "presence": presence_service.derive_presence(seen_at, server_now),
                "flagged_for_review": bool(s.flagged_for_review),
                "incident_count": incident_counts.get(s.id, 0),
                # S-2: surface the multiplier so supervisors can see who has extra time.
                "time_multiplier": getattr(user, "provision_time_multiplier", None) if user else None,
            }
        )

    # M-1 / S-1 / S-2: include session metadata so the monitor page can display
    # context (course, test, window end) without a second API call.
    scheduled = await prisma.scheduled_exam_sessions.find_unique(
        where={"id": str(scheduled_session_id)},
        include={"courses": True, "test_definitions": True},
    )
    session_meta = {
        "course_code": scheduled.courses.code if scheduled else None,
        "course_title": scheduled.courses.title if scheduled else None,
        "test_title": scheduled.test_definitions.title if scheduled else None,
        "ends_at": scheduled.ends_at if scheduled else None,
    }

    return {
        "scheduled_session_id": scheduled_session_id,
        "server_now": server_now,
        "total": total,
        "page": page,
        "page_size": page_size,
        "attempts": attempts,
        **session_meta,
    }


async def export_incidents_csv(scheduled_session_id: UUID) -> str:
    """Render the full incident log for one scheduled session as CSV (Epoch 14.7).

    The complete proctoring record for post-exam review and archival — every
    recorded incident in chronological order. Carries no PII beyond what the live
    monitor feed already exposes (student email + incident metadata); never answer
    contents, tokens, or raw fingerprints (Epoch 11 §2.1).
    """
    rows = await prisma.proctoring_incidents.find_many(
        where={"scheduled_session_id": str(scheduled_session_id)},
        order={"created_at": "asc"},
    )

    student_ids = {r.student_id for r in rows if r.student_id}
    email_by_id: Dict[str, str] = {}
    if student_ids:
        users = await prisma.users.find_many(where={"id": {"in": list(student_ids)}})
        email_by_id = {u.id: u.email for u in users}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["created_at", "student_email", "incident_type", "severity", "source", "detail"]
    )
    for r in rows:
        detail = _coerce_detail(r.detail)
        writer.writerow(
            [
                r.created_at.isoformat() if r.created_at else "",
                email_by_id.get(r.student_id, "") if r.student_id else "",
                r.incident_type,
                r.severity,
                r.source,
                json.dumps(detail, separators=(",", ":"), sort_keys=True),
            ]
        )
    return buffer.getvalue()


async def list_incidents(
    scheduled_session_id: UUID,
    page: int,
    page_size: int,
    severity: Optional[str] = None,
    incident_type: Optional[str] = None,
    exam_session_id: Optional[UUID] = None,
) -> Dict[str, Any]:
    """Paginated, filterable incident feed for one scheduled session.

    Pass ``exam_session_id`` to scope the feed to a single student's attempt.
    Each row is enriched with the student's email so the supervisor can read the
    feed without cross-referencing the roster.
    """
    where: Dict[str, Any] = {"scheduled_session_id": str(scheduled_session_id)}
    if severity:
        where["severity"] = severity
    if incident_type:
        where["incident_type"] = incident_type
    if exam_session_id:
        where["exam_session_id"] = str(exam_session_id)

    total = await prisma.proctoring_incidents.count(where=where)
    rows = await prisma.proctoring_incidents.find_many(
        where=where,
        order={"created_at": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )

    # Resolve student emails in one query for the page.
    student_ids = {r.student_id for r in rows if r.student_id}
    email_by_id: Dict[str, str] = {}
    if student_ids:
        users = await prisma.users.find_many(where={"id": {"in": list(student_ids)}})
        email_by_id = {u.id: u.email for u in users}

    incidents = [
        {
            "id": r.id,
            "incident_type": r.incident_type,
            "severity": r.severity,
            "source": r.source,
            "detail": _coerce_detail(r.detail),
            "created_at": r.created_at,
            "student_id": r.student_id,
            "student_email": email_by_id.get(r.student_id) if r.student_id else None,
            "exam_session_id": r.exam_session_id,
        }
        for r in rows
    ]

    return {
        "server_now": datetime.now(timezone.utc),
        "total": total,
        "page": page,
        "page_size": page_size,
        "incidents": incidents,
    }
