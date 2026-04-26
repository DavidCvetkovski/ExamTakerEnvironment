from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.exam_session import ExamSessionResponse
from app.schemas.scheduled_session import StudentScheduledSessionResponse
from app.services.exam_sessions_service import join_scheduled_session_for_student
from app.services.scheduled_sessions_service import list_student_scheduled_sessions

router = APIRouter(prefix="/student/sessions", tags=["student-sessions"])


@router.get("/", response_model=List[StudentScheduledSessionResponse])
async def list_student_sessions_endpoint(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
):
    """List the current student's upcoming and active assigned sessions."""
    return await list_student_scheduled_sessions(current_user)


@router.post("/{scheduled_session_id}/join", response_model=ExamSessionResponse)
async def join_student_session_endpoint(
    scheduled_session_id: UUID,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
):
    """Join an active scheduled exam session."""
    return await join_scheduled_session_for_student(scheduled_session_id, current_user)
