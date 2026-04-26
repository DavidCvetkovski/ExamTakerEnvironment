from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from uuid import UUID

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.models.scheduled_exam_session import CourseSessionStatus


def ensure_utc(value: datetime) -> datetime:
    """Normalize datetimes so status comparisons stay timezone-safe."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def calculate_end_time(starts_at: datetime, duration_minutes: int) -> datetime:
    """Compute the scheduled session end time."""
    return ensure_utc(starts_at) + timedelta(minutes=duration_minutes)


def build_scheduled_session_response(record: Any) -> Dict[str, Any]:
    """Flatten related course and blueprint data into the API response shape."""
    return {
        "id": record.id,
        "course_id": record.course_id,
        "course_code": record.courses.code,
        "course_title": record.courses.title,
        "test_definition_id": record.test_definition_id,
        "test_title": record.test_definitions.title,
        "created_by": record.created_by,
        "starts_at": record.starts_at,
        "ends_at": record.ends_at,
        "status": record.status,
        "duration_minutes_override": record.duration_minutes_override,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


async def get_scheduled_session_or_404(session_id: str) -> Any:
    """Fetch a scheduled session with its related course and blueprint."""
    record = await prisma.scheduled_exam_sessions.find_unique(
        where={"id": session_id},
        include={"courses": True, "test_definitions": True},
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled session not found.",
        )
    return record


async def ensure_scheduled_session_current(record: Any) -> Any:
    """Persist derived ACTIVE/CLOSED states when time has moved on."""
    if record.status == CourseSessionStatus.CANCELED.value:
        return record

    now = datetime.now(timezone.utc)
    starts_at = ensure_utc(record.starts_at)
    ends_at = ensure_utc(record.ends_at)
    next_status = record.status

    if now >= ends_at:
        next_status = CourseSessionStatus.CLOSED.value
    elif now >= starts_at:
        next_status = CourseSessionStatus.ACTIVE.value
    else:
        next_status = CourseSessionStatus.SCHEDULED.value

    if next_status == record.status:
        return record

    return await prisma.scheduled_exam_sessions.update(
        where={"id": record.id},
        data={"status": next_status},
        include={"courses": True, "test_definitions": True},
    )


async def create_scheduled_session(payload: Any, current_user_id: str) -> Dict[str, Any]:
    """Create a future scheduled exam session for a course."""
    course = await prisma.courses.find_unique(where={"id": str(payload.course_id)})
    if not course or not course.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active course not found.",
        )

    test_definition = await prisma.test_definitions.find_unique(
        where={"id": str(payload.test_definition_id)}
    )
    if not test_definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    starts_at = ensure_utc(payload.starts_at)
    if starts_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled session must start in the future.",
        )

    duration_minutes = payload.duration_minutes_override or test_definition.duration_minutes
    record = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": str(payload.course_id),
            "test_definition_id": str(payload.test_definition_id),
            "created_by": current_user_id,
            "starts_at": starts_at,
            "ends_at": calculate_end_time(starts_at, duration_minutes),
            "status": CourseSessionStatus.SCHEDULED.value,
            "duration_minutes_override": payload.duration_minutes_override,
        },
        include={"courses": True, "test_definitions": True},
    )
    return build_scheduled_session_response(record)


async def list_scheduled_sessions() -> List[Dict[str, Any]]:
    """Return every scheduled exam session after syncing derived statuses."""
    records = await prisma.scheduled_exam_sessions.find_many(
        include={"courses": True, "test_definitions": True},
        order={"starts_at": "asc"},
    )
    results: List[Dict[str, Any]] = []
    for record in records:
        current_record = await ensure_scheduled_session_current(record)
        results.append(build_scheduled_session_response(current_record))
    return results


async def update_scheduled_session(
    session_id: UUID,
    payload: Any,
) -> Dict[str, Any]:
    """Update a scheduled session before it starts."""
    record = await get_scheduled_session_or_404(str(session_id))
    record = await ensure_scheduled_session_current(record)
    if record.status != CourseSessionStatus.SCHEDULED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only scheduled sessions can be edited.",
        )

    starts_at = ensure_utc(payload.starts_at) if payload.starts_at else ensure_utc(record.starts_at)
    if starts_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled session must start in the future.",
        )

    duration_minutes = payload.duration_minutes_override
    if duration_minutes is None:
        duration_minutes = record.duration_minutes_override or record.test_definitions.duration_minutes

    updated = await prisma.scheduled_exam_sessions.update(
        where={"id": str(session_id)},
        data={
            "starts_at": starts_at,
            "ends_at": calculate_end_time(starts_at, duration_minutes),
            "duration_minutes_override": payload.duration_minutes_override,
        },
        include={"courses": True, "test_definitions": True},
    )
    return build_scheduled_session_response(updated)


async def cancel_scheduled_session(session_id: UUID) -> Dict[str, Any]:
    """Cancel a scheduled session before or during its window."""
    record = await get_scheduled_session_or_404(str(session_id))
    if record.status == CourseSessionStatus.CLOSED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Closed sessions cannot be canceled.",
        )
    if record.status == CourseSessionStatus.CANCELED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is already canceled.",
        )

    updated = await prisma.scheduled_exam_sessions.update(
        where={"id": str(session_id)},
        data={"status": CourseSessionStatus.CANCELED.value},
        include={"courses": True, "test_definitions": True},
    )
    return build_scheduled_session_response(updated)


async def list_student_scheduled_sessions(current_user: Any) -> List[Dict[str, Any]]:
    """List the current student's future and current assigned sessions."""
    enrollments = await prisma.course_enrollments.find_many(
        where={"student_id": str(current_user.id), "is_active": True}
    )
    course_ids = [enrollment.course_id for enrollment in enrollments]
    if not course_ids:
        return []

    records = await prisma.scheduled_exam_sessions.find_many(
        where={
            "course_id": {"in": course_ids},
            "status": {"not": CourseSessionStatus.CANCELED.value},
        },
        include={"courses": True, "test_definitions": True},
        order={"starts_at": "asc"},
    )
    if not records:
        return []

    current_records: List[Any] = []
    for record in records:
        current_record = await ensure_scheduled_session_current(record)
        if current_record.status == CourseSessionStatus.CLOSED.value:
            continue
        current_records.append(current_record)

    if not current_records:
        return []

    attempts = await prisma.exam_sessions.find_many(
        where={
            "student_id": str(current_user.id),
            "scheduled_session_id": {"in": [record.id for record in current_records]},
        }
    )
    attempts_by_session_id = {
        attempt.scheduled_session_id: attempt
        for attempt in attempts
        if attempt.scheduled_session_id
    }

    results: List[Dict[str, Any]] = []
    for record in current_records:
        existing_attempt = attempts_by_session_id.get(record.id)
        can_join = record.status == CourseSessionStatus.ACTIVE.value
        results.append(
            {
                "id": record.id,
                "course_id": record.course_id,
                "course_code": record.courses.code,
                "course_title": record.courses.title,
                "test_definition_id": record.test_definition_id,
                "test_title": record.test_definitions.title,
                "starts_at": record.starts_at,
                "ends_at": record.ends_at,
                "status": record.status,
                "can_join": can_join,
                "existing_attempt_id": existing_attempt.id if existing_attempt else None,
            }
        )
    return results
