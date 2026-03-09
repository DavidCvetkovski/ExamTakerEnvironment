from datetime import datetime, timedelta, timezone
import json
import random
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from prisma import Json

from app.core.prisma_db import prisma
from app.models.exam_session import ExamSessionMode, SessionStatus
from app.models.item_version import ItemStatus
from app.models.scheduled_exam_session import CourseSessionStatus
from app.models.user import UserRole
from app.services.scheduled_sessions_service import (
    ensure_scheduled_session_current,
)


def ensure_utc(value: datetime) -> datetime:
    """Normalize datetimes so backend comparisons stay timezone-safe."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_return_path(session_mode: str) -> str:
    """Map an exam session mode to the route the client should return to."""
    if session_mode == ExamSessionMode.ASSIGNED.value:
        return "/my-exams"
    return "/sessions"


def serialize_exam_session(session: Any) -> Dict[str, Any]:
    """Convert a Prisma record into the response shape expected by the API."""
    payload = dict(session.__dict__)
    payload["return_path"] = get_return_path(payload["session_mode"])
    return payload


def parse_test_blocks(raw_blocks: Any) -> List[Dict[str, Any]]:
    """Decode stored blueprint JSON into a Python list."""
    if isinstance(raw_blocks, str):
        return json.loads(raw_blocks)
    return raw_blocks or []


def metadata_has_tags(metadata: Any, tags: List[str]) -> bool:
    """Check whether the item metadata satisfies at least one requested tag."""
    if not tags:
        return True
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    if not isinstance(metadata, dict):
        return False
    return any(tag in metadata for tag in tags)


def build_item_snapshot(item_version: Any) -> Dict[str, Any]:
    """Freeze the latest item version into the session snapshot shape."""
    return {
        "learning_object_id": str(item_version.learning_object_id),
        "item_version_id": str(item_version.id),
        "content": item_version.content,
        "options": item_version.options,
        "question_type": item_version.question_type,
        "version_number": item_version.version_number,
    }


async def select_items_for_test_definition(test_definition: Any) -> List[Dict[str, Any]]:
    """Resolve blueprint rules into the frozen list of exam items."""
    selected_items: List[Dict[str, Any]] = []
    blocks = parse_test_blocks(test_definition.blocks)

    for block in blocks:
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                learning_object_id = str(rule["learning_object_id"])
                latest_item = await prisma.item_versions.find_first(
                    where={
                        "learning_object_id": learning_object_id,
                        "status": {
                            "in": [
                                ItemStatus.APPROVED.value,
                                ItemStatus.READY_FOR_REVIEW.value,
                                ItemStatus.DRAFT.value,
                            ]
                        },
                    },
                    order={"version_number": "desc"},
                )
                if not latest_item:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Fixed rule failed: LO {learning_object_id} has no available version.",
                    )
                selected_items.append(build_item_snapshot(latest_item))
                continue

            tags = rule.get("tags", [])
            count = rule.get("count", 1)
            candidates_all = await prisma.item_versions.find_many(
                where={
                    "status": {
                        "in": [
                            ItemStatus.APPROVED.value,
                            ItemStatus.READY_FOR_REVIEW.value,
                            ItemStatus.DRAFT.value,
                        ]
                    }
                },
                order={"version_number": "desc"},
            )

            candidates_by_learning_object: Dict[str, Any] = {}
            for candidate in candidates_all:
                learning_object_id = str(candidate.learning_object_id)
                if learning_object_id in candidates_by_learning_object:
                    continue
                if metadata_has_tags(candidate.metadata_tags, tags):
                    candidates_by_learning_object[learning_object_id] = candidate

            candidates = list(candidates_by_learning_object.values())
            if len(candidates) < count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Random rule failed: "
                        f"Found {len(candidates)} available items, but need {count}."
                    ),
                )

            for chosen in random.sample(candidates, count):
                selected_items.append(build_item_snapshot(chosen))

    return selected_items


async def create_exam_session_record(
    *,
    test_definition: Any,
    student_id: str,
    selected_items: List[Dict[str, Any]],
    duration_minutes: int,
    session_mode: ExamSessionMode,
    scheduled_session_id: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Persist a frozen exam attempt and return the serialized payload."""
    resolved_expires_at = ensure_utc(expires_at) if expires_at else datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    session = await prisma.exam_sessions.create(
        data={
            "test_definition_id": str(test_definition.id),
            "student_id": student_id,
            "scheduled_session_id": scheduled_session_id,
            "items": Json(selected_items),
            "status": SessionStatus.STARTED.value,
            "session_mode": session_mode.value,
            "started_at": datetime.now(timezone.utc),
            "expires_at": resolved_expires_at,
        }
    )
    return serialize_exam_session(session)


async def instantiate_practice_session(
    test_definition_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Create a practice attempt directly from a blueprint for staff users.
    """
    if current_user.role not in [UserRole.ADMIN.value, UserRole.CONSTRUCTOR.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students cannot create ad-hoc practice sessions.",
        )

    test_definition = await prisma.test_definitions.find_unique(
        where={"id": str(test_definition_id)}
    )
    if not test_definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    selected_items = await select_items_for_test_definition(test_definition)
    multiplier = getattr(current_user, "provision_time_multiplier", 1.0) or 1.0
    duration_minutes = max(1, int(test_definition.duration_minutes * multiplier))

    return await create_exam_session_record(
        test_definition=test_definition,
        student_id=str(current_user.id),
        selected_items=selected_items,
        duration_minutes=duration_minutes,
        session_mode=ExamSessionMode.PRACTICE,
    )


async def instantiate_session_for_student(
    test_definition_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Compatibility wrapper for the legacy endpoint. Staff can still create practice attempts,
    while students must use the scheduled-session join flow.
    """
    return await instantiate_practice_session(test_definition_id, current_user)


async def join_scheduled_session_for_student(
    scheduled_session_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Join a scheduled exam session. Reuses an existing attempt when present.
    """
    if current_user.role != UserRole.STUDENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can join assigned exam sessions.",
        )

    scheduled = await prisma.scheduled_exam_sessions.find_unique(
        where={"id": str(scheduled_session_id)},
        include={"courses": True, "test_definitions": True},
    )
    if not scheduled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled session not found.",
        )

    scheduled = await ensure_scheduled_session_current(scheduled)
    if scheduled.status == CourseSessionStatus.CANCELED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This scheduled session has been canceled.",
        )

    enrollment = await prisma.course_enrollments.find_first(
        where={
            "course_id": str(scheduled.course_id),
            "student_id": str(current_user.id),
            "is_active": True,
        }
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in the course for this exam session.",
        )

    if scheduled.status != CourseSessionStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This exam session is not currently joinable.",
        )

    existing_attempt = await prisma.exam_sessions.find_first(
        where={
            "scheduled_session_id": str(scheduled_session_id),
            "student_id": str(current_user.id),
        },
        order={"started_at": "desc"},
    )
    if existing_attempt:
        return serialize_exam_session(existing_attempt)

    selected_items = await select_items_for_test_definition(scheduled.test_definitions)
    multiplier = getattr(current_user, "provision_time_multiplier", 1.0) or 1.0
    base_minutes = scheduled.duration_minutes_override or scheduled.test_definitions.duration_minutes
    duration_minutes = max(1, int(base_minutes * multiplier))

    return await create_exam_session_record(
        test_definition=scheduled.test_definitions,
        student_id=str(current_user.id),
        selected_items=selected_items,
        duration_minutes=duration_minutes,
        session_mode=ExamSessionMode.ASSIGNED,
        scheduled_session_id=str(scheduled.id),
        expires_at=scheduled.ends_at,
    )


async def get_exam_session_for_user(
    session_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Retrieve an exam attempt while enforcing ownership and automatic expiry.
    """
    session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam session not found.",
        )

    if session.status == SessionStatus.STARTED.value:
        now = datetime.now(timezone.utc)
        expires_at = ensure_utc(session.expires_at)
        if now > expires_at:
            session = await prisma.exam_sessions.update(
                where={"id": session.id},
                data={"status": SessionStatus.EXPIRED.value},
            )

    if session.student_id != current_user.id and current_user.role not in [
        UserRole.ADMIN.value,
        UserRole.CONSTRUCTOR.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this session.",
        )

    return serialize_exam_session(session)
