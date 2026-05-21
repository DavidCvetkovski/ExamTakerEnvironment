from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import UUID

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.models.scheduled_exam_session import CourseSessionStatus
from app.models.user import UserRole
from app.schemas.course import EnrollmentCreateRequest


def serialize_enrollment(enrollment: Any) -> Dict[str, Any]:
    """Flatten the Prisma enrollment payload into the API response shape."""
    return {
        "id": enrollment.id,
        "course_id": enrollment.course_id,
        "student_id": enrollment.student_id,
        "student_email": enrollment.users.email,
        "is_active": enrollment.is_active,
        "enrolled_at": enrollment.enrolled_at,
    }


async def get_course_or_404(course_id: str) -> Any:
    """Fetch a course or raise a 404."""
    course = await prisma.courses.find_unique(where={"id": course_id})
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found.",
        )
    return course


async def create_course(payload: Any, current_user_id: str) -> Any:
    """Create a new course owned by the requesting staff user."""
    existing = await prisma.courses.find_unique(where={"code": payload.code})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A course with this code already exists.",
        )

    return await prisma.courses.create(
        data={
            "code": payload.code.strip(),
            "title": payload.title.strip(),
            "created_by": current_user_id,
        }
    )


async def list_courses() -> List[Any]:
    """Return all active courses ordered by title."""
    return await prisma.courses.find_many(
        where={"is_active": True},
        order={"title": "asc"},
    )


async def is_course_roster_locked(course_id: str) -> bool:
    """A course roster is frozen once any of its exams has started or ended.

    Derived from the session window (``starts_at <= now``) rather than the
    persisted status, so a not-yet-synced ACTIVE/CLOSED session still locks the
    roster. Canceled sessions never lock — they never ran.
    """
    started = await prisma.scheduled_exam_sessions.find_first(
        where={
            "course_id": course_id,
            "status": {"not": CourseSessionStatus.CANCELED.value},
            "starts_at": {"lte": datetime.now(timezone.utc)},
        }
    )
    return started is not None


async def assert_roster_mutable(course_id: str) -> None:
    """Reject roster edits once the course has a started or finished exam."""
    if await is_course_roster_locked(course_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Roster is locked — this course has an exam that has already started.",
        )


async def list_course_enrollments(course_id: UUID) -> Dict[str, Any]:
    """Return the active roster for a course plus whether it can still change."""
    await get_course_or_404(str(course_id))
    enrollments = await prisma.course_enrollments.find_many(
        where={"course_id": str(course_id), "is_active": True},
        include={"users": True},
        order={"enrolled_at": "asc"},
    )
    return {
        "enrollments": [serialize_enrollment(enrollment) for enrollment in enrollments],
        "roster_locked": await is_course_roster_locked(str(course_id)),
    }


async def list_student_candidates() -> List[Any]:
    """Expose active students so staff can add enrollments without hand-copying IDs."""
    return await prisma.users.find_many(
        where={"role": UserRole.STUDENT.value, "is_active": True},
        order={"email": "asc"},
    )


async def resolve_student_for_enrollment(payload: EnrollmentCreateRequest) -> Any:
    """Resolve an enrollment request into a concrete active student record."""
    student = None
    if payload.student_id:
        student = await prisma.users.find_unique(where={"id": str(payload.student_id)})
    elif payload.student_email:
        student = await prisma.users.find_unique(where={"email": payload.student_email})

    if not student or student.role != UserRole.STUDENT.value or not student.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active student not found for enrollment.",
        )
    return student


async def add_course_enrollment(
    course_id: UUID,
    payload: EnrollmentCreateRequest,
) -> Dict[str, Any]:
    """Create or reactivate a course enrollment for a student."""
    await get_course_or_404(str(course_id))
    await assert_roster_mutable(str(course_id))
    student = await resolve_student_for_enrollment(payload)

    existing = await prisma.course_enrollments.find_first(
        where={
            "course_id": str(course_id),
            "student_id": str(student.id),
        },
        include={"users": True},
    )
    if existing:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student is already enrolled in this course.",
            )

        reactivated = await prisma.course_enrollments.update(
            where={"id": existing.id},
            data={"is_active": True},
            include={"users": True},
        )
        return serialize_enrollment(reactivated)

    enrollment = await prisma.course_enrollments.create(
        data={
            "course_id": str(course_id),
            "student_id": str(student.id),
            "is_active": True,
        },
        include={"users": True},
    )
    return serialize_enrollment(enrollment)


async def remove_course_enrollment(course_id: UUID, student_id: UUID) -> Dict[str, str]:
    """Permanently remove a student from a course roster."""
    await get_course_or_404(str(course_id))
    await assert_roster_mutable(str(course_id))
    enrollment = await prisma.course_enrollments.find_first(
        where={
            "course_id": str(course_id),
            "student_id": str(student_id),
        }
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment not found.",
        )

    await prisma.course_enrollments.delete(where={"id": enrollment.id})
    return {"status": "removed"}
