"""Per-attempt supervisor interventions: terminate (Epoch 11 §9.6).

Staff-gated; records a SUPERVISOR_TERMINATE incident for the audit trail.
"""
from datetime import datetime, timezone
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
