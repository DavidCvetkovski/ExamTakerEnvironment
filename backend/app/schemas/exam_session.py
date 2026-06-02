from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import List, Optional, Dict, Any
from app.models.exam_session import ExamSessionMode, SessionStatus
from app.schemas.proctoring import ClientProctoringView

class ExamItemSnapshot(BaseModel):
    learning_object_id: UUID
    item_version_id: UUID
    content: Dict[str, Any]
    options: Dict[str, Any]
    question_type: str
    version_number: int

class ExamSessionBase(BaseModel):
    test_definition_id: UUID
    student_id: UUID
    scheduled_session_id: Optional[UUID] = None
    status: SessionStatus = SessionStatus.STARTED
    session_mode: ExamSessionMode = ExamSessionMode.PRACTICE
    expires_at: datetime

class ExamSessionCreate(BaseModel):
    test_definition_id: UUID

class ExamSessionResponse(ExamSessionBase):
    id: UUID
    items: List[ExamItemSnapshot]
    started_at: datetime
    submitted_at: Optional[datetime] = None
    return_path: Optional[str] = None
    # Epoch 11 — proctoring state surfaced to the exam client (advisory UX).
    paused_at: Optional[datetime] = None
    flagged_for_review: bool = False
    proctoring: Optional[ClientProctoringView] = None

    model_config = ConfigDict(from_attributes=True)
