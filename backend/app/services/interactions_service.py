"""Service layer for interaction event persistence and answer reconstruction."""
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import UUID

from fastapi import HTTPException, status
from prisma import Json

from app.core.prisma_db import prisma
from app.models.exam_session import SessionStatus
from app.models.interaction_event import InteractionEventType
from app.services.exam_sessions_service import serialize_exam_session


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
            session = await prisma.exam_sessions.update(
                where={"id": session.id},
                data={"status": SessionStatus.EXPIRED.value},
            )

    return session


async def save_interaction_events(
    session_id: UUID,
    events: List[Dict[str, Any]],
    current_user,
) -> Dict[str, Any]:
    """
    Validate session ownership and status, then bulk-insert interaction events.

    Args:
        session_id: The exam session to attach events to.
        events: List of event dicts from the Pydantic-validated payload.
        current_user: The authenticated user making the request.

    Returns:
        { "saved": count, "server_timestamp": datetime }

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

    # Bulk-create all events, slightly staggering timestamps to guarantee deterministic ordering
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    records = [
        {
            "session_id": str(session_id),
            "learning_object_id": str(e["learning_object_id"]) if e.get("learning_object_id") else None,
            "item_version_id": str(e["item_version_id"]) if e.get("item_version_id") else None,
            "event_type": e["event_type"],
            "payload": Json(e["payload"]),
            "created_at": now + timedelta(milliseconds=i),
        }
        for i, e in enumerate(events)
    ]

    saved_count = await prisma.interaction_events.create_many(data=records)

    return {
        "saved": saved_count,
        "server_timestamp": now,
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
    session = await _get_session_with_ownership_check(session_id, current_user)

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

    return serialize_exam_session(updated_session)
