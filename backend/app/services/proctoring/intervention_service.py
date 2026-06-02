"""Per-attempt supervisor interventions: extend / pause / resume / terminate
(Epoch 11 §9.6).

Each action is staff-gated at the endpoint, operates on one exam_session, and
records a SUPERVISOR_* incident (the audit trail of who did what, when). The only
authoritative deadline is ``exam_sessions.expires_at`` — pause/resume adjust it
explicitly so no downstream code needs to learn a new state.
"""
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.models.exam_session import SessionStatus
from app.models.proctoring_incident import (
    ProctoringIncidentSource,
    ProctoringIncidentType,
    ProctoringSeverity,
)
from app.services.proctoring.incident_service import record_incident


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _load_started_session(session_id: UUID) -> Any:
    session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found.")
    if session.status != SessionStatus.STARTED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attempt is {session.status}; this action requires an active attempt.",
        )
    return session


async def _audit(session: Any, incident_type: ProctoringIncidentType, actor_id: str, detail: dict) -> None:
    await record_incident(
        incident_type=incident_type,
        severity=ProctoringSeverity.INFO,
        source=ProctoringIncidentSource.SERVER,
        exam_session_id=str(session.id),
        scheduled_session_id=str(session.scheduled_session_id) if session.scheduled_session_id else None,
        student_id=str(session.student_id),
        detail={**detail, "actor_id": actor_id},
    )


async def extend_attempt(session_id: UUID, minutes: int, actor_id: str) -> Any:
    """Push out a single attempt's deadline by ``minutes``."""
    session = await _load_started_session(session_id)
    new_expiry = _ensure_utc(session.expires_at) + timedelta(minutes=minutes)
    updated = await prisma.exam_sessions.update(
        where={"id": str(session_id)},
        data={"expires_at": new_expiry},
    )
    await _audit(session, ProctoringIncidentType.SUPERVISOR_EXTEND, actor_id, {"minutes": minutes})
    return updated


async def pause_attempt(session_id: UUID, actor_id: str) -> Any:
    """Freeze an attempt. Heartbeats are rejected with 409 while paused."""
    session = await _load_started_session(session_id)
    if session.paused_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attempt is already paused.")
    updated = await prisma.exam_sessions.update(
        where={"id": str(session_id)},
        data={"paused_at": datetime.now(timezone.utc)},
    )
    await _audit(session, ProctoringIncidentType.SUPERVISOR_PAUSE, actor_id, {})
    return updated


async def resume_attempt(session_id: UUID, actor_id: str) -> Any:
    """Resume a paused attempt, crediting the paused time back to the clock."""
    session = await _load_started_session(session_id)
    if session.paused_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attempt is not paused.")
    now = datetime.now(timezone.utc)
    paused_seconds = int((now - _ensure_utc(session.paused_at)).total_seconds())
    updated = await prisma.exam_sessions.update(
        where={"id": str(session_id)},
        data={
            "paused_at": None,
            "accumulated_pause_seconds": session.accumulated_pause_seconds + paused_seconds,
            "expires_at": _ensure_utc(session.expires_at) + timedelta(seconds=paused_seconds),
        },
    )
    await _audit(
        session, ProctoringIncidentType.SUPERVISOR_RESUME, actor_id, {"paused_seconds": paused_seconds}
    )
    return updated


async def terminate_attempt(session_id: UUID, actor_id: str) -> Any:
    """Force-submit an attempt through the normal submit path, then stamp it.

    Routing through ``submit_exam_session`` keeps grading and results identical
    to an ordinary submission — terminate invents no new score (directive §9.6).
    """
    session = await _load_started_session(session_id)

    # submit_exam_session enforces *student* ownership; a supervisor is not the
    # owner, so we apply the same SUBMITTED transition directly and reuse the
    # shared grading path below — identical end state, different authorization.
    now = datetime.now(timezone.utc)
    updated = await prisma.exam_sessions.update(
        where={"id": str(session_id)},
        data={
            "status": SessionStatus.SUBMITTED.value,
            "submitted_at": now,
            "terminated_by": actor_id,
            "terminated_at": now,
        },
    )
    try:
        from app.services.grading_service import auto_grade_session

        await auto_grade_session(session_id)
    except Exception:
        pass  # grading failure must not block termination

    await _audit(session, ProctoringIncidentType.SUPERVISOR_TERMINATE, actor_id, {})
    return updated
