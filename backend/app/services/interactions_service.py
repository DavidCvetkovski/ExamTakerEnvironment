"""Service layer for interaction event acceptance, queuing, and answer reconstruction.

Ownership validation and session-status checks live here.  The actual database
write path has been moved to the heartbeat_ingestion worker; this service only
validates and enqueues.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.core.redis import get_redis
from app.models.exam_session import SessionStatus
from app.models.interaction_event import InteractionEventType
from app.services.exam_sessions_service import finalize_timed_out_session, serialize_exam_session
from app.services.heartbeat_ingestion.queue import enqueue_events


def _latest_navigation_index(events: List[Dict[str, Any]]) -> Optional[int]:
    """Best-effort current-question index from the latest NAVIGATION event in a batch."""
    index: Optional[int] = None
    for event in events:
        if event.get("event_type") == InteractionEventType.NAVIGATION.value:
            payload = event.get("payload") or {}
            if isinstance(payload, dict):
                for key in ("index", "questionIndex", "to", "current_index"):
                    value = payload.get(key)
                    if isinstance(value, int):
                        index = value
                        break
    return index


async def _get_session_with_ownership_check(
    session_id: UUID, current_user
) -> Any:
    """
    Fetch an exam session and verify the current user is the session owner.
    Also checks for auto-expiration.

    Raises:
        404 if session not found.
        403 if user is not the session owner.
    """
    session = await prisma.exam_sessions.find_unique(
        where={"id": str(session_id)}
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam session not found.",
        )

    if session.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this session.",
        )

    # Auto-expire if past deadline
    if session.status == SessionStatus.STARTED.value:
        now = datetime.now(timezone.utc)
        sess_expires = session.expires_at
        if sess_expires.tzinfo is None:
            sess_expires = sess_expires.replace(tzinfo=timezone.utc)
        if now > sess_expires:
            session = await finalize_timed_out_session(session)

    return session


async def accept_interaction_events(
    session_id: UUID,
    events: List[Dict[str, Any]],
    current_user,
    request_id: str = "",
) -> Dict[str, Any]:
    """Validate session ownership and status, then enqueue events to Redis Stream.

    The heavy database work is performed asynchronously by the heartbeat worker.
    This function returns immediately after Redis accepts the batch, giving the
    student's browser a fast acknowledgement.

    Args:
        session_id:   The exam session to attach events to.
        events:       List of event dicts from the Pydantic-validated payload.
        current_user: The authenticated user making the request.
        request_id:   Correlation ID propagated from the HTTP request.

    Returns:
        {"saved": accepted, "accepted": accepted, "queued": accepted,
         "server_timestamp": datetime, "queue_lag_estimate": int|None}

    Raises:
        404 if session not found.
        403 if user is not the session owner.
        409 if session is SUBMITTED or EXPIRED.
    """
    session = await _get_session_with_ownership_check(session_id, current_user)

    if session.status != SessionStatus.STARTED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session is {session.status}. Cannot accept new events.",
        )

    received_at = datetime.now(timezone.utc)
    redis = get_redis()

    accepted, lag = await enqueue_events(
        redis=redis,
        request_id=request_id,
        session_id=str(session_id),
        student_id=str(current_user.id),
        received_at=received_at,
        raw_events=events,
    )

    # Epoch 11: refresh live presence for the supervisor monitor. Redis-first,
    # best-effort, off the durable write path. The latest NAVIGATION index (if
    # present in this batch) tells the monitor which question they are on.
    from app.services.proctoring.presence_service import touch as _presence_touch

    current_index = _latest_navigation_index(events)
    await _presence_touch(str(session_id), current_index)

    return {
        "saved": accepted,
        "accepted": accepted,
        "queued": accepted,
        "server_timestamp": received_at,
        "queue_lag_estimate": lag,
    }


async def get_latest_answers(
    session_id: UUID, current_user
) -> Dict[str, Any]:
    """
    Reconstruct the student's current answer and flag state from interaction
    events. For each learning_object_id, returns the latest ANSWER_CHANGE
    payload and the latest FLAG_TOGGLE state.

    Returns:
        {
            "answers": { lo_id: payload },
            "flags": { lo_id: bool }
        }
    """
    await _get_session_with_ownership_check(session_id, current_user)

    # Fetch all ANSWER_CHANGE events for this session, ordered by created_at desc
    answer_events = await prisma.interaction_events.find_many(
        where={
            "session_id": str(session_id),
            "event_type": InteractionEventType.ANSWER_CHANGE.value,
        },
        order={"created_at": "desc"},
    )

    # Fetch all FLAG_TOGGLE events
    flag_events = await prisma.interaction_events.find_many(
        where={
            "session_id": str(session_id),
            "event_type": InteractionEventType.FLAG_TOGGLE.value,
        },
        order={"created_at": "desc"},
    )

    # Reconstruct latest answer per LO (first occurrence in desc order = latest)
    answers: Dict[str, Any] = {}
    for event in answer_events:
        lo_id = event.learning_object_id
        if lo_id and lo_id not in answers:
            answers[lo_id] = event.payload

    # Reconstruct latest flag state per LO
    flags: Dict[str, bool] = {}
    for event in flag_events:
        lo_id = event.learning_object_id
        if lo_id and lo_id not in flags:
            payload = event.payload
            if isinstance(payload, dict):
                flags[lo_id] = payload.get("flagged", False)

    return {"answers": answers, "flags": flags}


async def submit_exam_session(
    session_id: UUID, current_user
) -> Any:
    """
    Submit an exam session. Sets status to SUBMITTED and records submitted_at.
    After submission, no further heartbeats are accepted.

    Raises:
        404 if session not found.
        403 if user is not the session owner.
        400 if session is already SUBMITTED or EXPIRED.
    """
    session = await _get_session_with_ownership_check(session_id, current_user)

    if session.status == SessionStatus.SUBMITTED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has already been submitted.",
        )

    if session.status == SessionStatus.EXPIRED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has expired and cannot be submitted.",
        )

    updated_session = await prisma.exam_sessions.update(
        where={"id": str(session_id)},
        data={
            "status": SessionStatus.SUBMITTED.value,
            "submitted_at": datetime.now(timezone.utc),
        },
    )

    # Trigger auto-grading immediately after submission (synchronous, fast)
    try:
        from app.services.grading_service import auto_grade_session
        await auto_grade_session(session_id)
    except Exception:
        # Grading failure must not prevent submission acknowledgement
        pass

    return serialize_exam_session(updated_session)


async def report_client_incident(
    session_id: UUID,
    payload,
    current_user,
    request,
) -> None:
    """Record a client-observed proctoring signal against an owned session (Epoch 11 §9.10).

    Ownership is enforced. The incident is tagged ``source=CLIENT`` and its
    severity is assigned server-side from the (constrained) type — the client
    cannot escalate its own report.
    """
    from app.core.rate_limit import client_ip
    from app.models.proctoring_incident import ProctoringIncidentSource
    from app.services.proctoring.incident_service import client_severity_for, record_incident

    session = await _get_session_with_ownership_check(session_id, current_user)
    incident_type = payload.incident_type.value

    await record_incident(
        incident_type=incident_type,
        severity=client_severity_for(incident_type),
        source=ProctoringIncidentSource.CLIENT,
        exam_session_id=str(session_id),
        scheduled_session_id=str(session.scheduled_session_id)
        if session.scheduled_session_id
        else None,
        student_id=str(current_user.id),
        client_ip=client_ip(request),
        # Keep only safe, bounded keys from the client's detail — never echo
        # arbitrary blobs into the audit trail.
        detail={"reason": str(payload.detail.get("reason", ""))[:200]}
        if isinstance(payload.detail, dict)
        else {},
    )
