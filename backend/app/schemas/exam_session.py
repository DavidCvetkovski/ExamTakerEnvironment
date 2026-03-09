from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import List, Optional, Dict, Any
from app.models.exam_session import ExamSessionMode, SessionStatus

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

    model_config = ConfigDict(from_attributes=True)
