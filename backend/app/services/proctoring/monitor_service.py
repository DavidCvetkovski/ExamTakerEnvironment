"""Read models for the supervisor monitor and incident feed (Epoch 11 §9.5)."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from app.core.prisma_db import prisma
from app.models.exam_session import SessionStatus
from app.services.proctoring import presence_service


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
                "is_paused": s.paused_at is not None,
                "flagged_for_review": bool(s.flagged_for_review),
                "incident_count": incident_counts.get(s.id, 0),
            }
        )

    return {
        "scheduled_session_id": scheduled_session_id,
        "server_now": server_now,
        "total": total,
        "page": page,
        "page_size": page_size,
        "attempts": attempts,
    }


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
            "detail": r.detail if isinstance(r.detail, dict) else {},
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
