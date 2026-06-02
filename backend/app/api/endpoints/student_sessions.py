from uuid import UUID

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import Response

from app.core.dependencies import require_role
from app.core.prisma_db import prisma
from app.models.user import User, UserRole
from app.schemas.exam_session import ExamSessionResponse
from app.schemas.scheduled_session import StudentScheduledSessionListResponse
from app.services.exam_sessions_service import join_scheduled_session_for_student
from app.services.proctoring import seb_config
from app.services.scheduled_sessions_service import (
    get_scheduled_session_or_404,
    list_student_scheduled_sessions,
)

router = APIRouter(prefix="/student/sessions", tags=["student-sessions"])


@router.get("/", response_model=StudentScheduledSessionListResponse)
async def list_student_sessions_endpoint(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
):
    """List the current student's upcoming and active assigned sessions.

    Returns an envelope ``{sessions, server_now}`` for client-side
    skew correction (see ``ScheduledSessionListResponse``).
    """
    return await list_student_scheduled_sessions(current_user)


@router.post("/{scheduled_session_id}/join", response_model=ExamSessionResponse)
async def join_student_session_endpoint(
    scheduled_session_id: UUID,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    x_device_fingerprint: Optional[str] = Header(default=None),
):
    """Join an active scheduled exam session.

    An optional ``X-Device-Fingerprint`` header lets the platform detect a single
    attempt being driven from two devices when the test enables sharing detection.
    """
    return await join_scheduled_session_for_student(
        scheduled_session_id, current_user, device_fingerprint=x_device_fingerprint
    )


@router.get("/{scheduled_session_id}/seb-config")
async def student_seb_config(
    scheduled_session_id: UUID,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
):
    """Download the .seb config so the student can launch the exam in SEB.

    Enrollment-gated: a student may only fetch the config for a course they are
    actively enrolled in.
    """
    scheduled = await get_scheduled_session_or_404(str(scheduled_session_id))
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
    data = await seb_config.generate_seb_file(str(scheduled_session_id), scheduled.test_definitions)
    return Response(
        content=data,
        media_type="application/seb",
        headers={"Content-Disposition": f'attachment; filename="exam-{scheduled_session_id}.seb"'},
    )
