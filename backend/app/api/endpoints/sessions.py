from fastapi import APIRouter, Depends, status
from uuid import UUID

from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.exam_session import ExamSessionCreate, ExamSessionResponse
from app.services.exam_sessions_service import (
    instantiate_session_for_student,
    get_exam_session_for_user,
    instantiate_practice_session,
)
from app.services.interactions_service import submit_exam_session

router = APIRouter()


@router.post("/", response_model=ExamSessionResponse, status_code=status.HTTP_201_CREATED)
async def instantiate_session(
    payload: ExamSessionCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Compatibility endpoint. Staff users may still create practice attempts here.
    Students are required to join scheduled sessions via /student/sessions/{id}/join.
    """
    return await instantiate_session_for_student(
        test_definition_id=payload.test_definition_id,
        current_user=current_user,
    )


@router.post("/practice", response_model=ExamSessionResponse, status_code=status.HTTP_201_CREATED)
async def instantiate_practice(
    payload: ExamSessionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Instantiate a practice exam attempt for a staff user."""
    return await instantiate_practice_session(
        test_definition_id=payload.test_definition_id,
        current_user=current_user,
    )


@router.get("/{session_id}", response_model=ExamSessionResponse)
async def get_exam_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Retrieve the frozen exam session."""
    return await get_exam_session_for_user(
        session_id=session_id,
        current_user=current_user,
    )


@router.post("/{session_id}/submit", response_model=ExamSessionResponse)
async def submit_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """
    Submit an exam session. Marks it as SUBMITTED and locks it
    against further heartbeat events. Returns 400 if already submitted,
    409 if expired.
    """
    return await submit_exam_session(session_id, current_user)
