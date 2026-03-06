from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.exam_session import ExamSessionCreate, ExamSessionResponse
from app.services.exam_sessions_service import (
    instantiate_session_for_student,
    get_exam_session_for_user,
)

router = APIRouter()

@router.post("/", response_model=ExamSessionResponse, status_code=status.HTTP_201_CREATED)
def instantiate_session(
    payload: ExamSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Instantiate (Freeze) a Test Blueprint into a specific student session.
    """
    return instantiate_session_for_student(
        db=db,
        test_definition_id=payload.test_definition_id,
        current_user=current_user,
    )

@router.get("/{session_id}", response_model=ExamSessionResponse)
def get_exam_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the frozen exam session."""
    return get_exam_session_for_user(
        db=db,
        session_id=session_id,
        current_user=current_user,
    )
