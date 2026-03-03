from datetime import datetime
import uuid
import enum
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, Text, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

class SessionStatus(str, enum.Enum):
    STARTED = "STARTED"
    SUBMITTED = "SUBMITTED"
    EXPIRED = "EXPIRED"

class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_definition_id = Column(UUID(as_uuid=True), ForeignKey("test_definitions.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # "The Freeze": A static snapshot of selected items
    # [
    #   {
    #     "learning_object_id": "...",
    #     "item_version_id": "...",
    #     "content": {...},
    #     "options": {...},
    #     "question_type": "...",
    #     "version_number": 1
    #   },
    #   ...
    # ]
    items = Column(JSONB, nullable=False, default=list)
    
    status = Column(Enum(SessionStatus), default=SessionStatus.STARTED, nullable=False)
    
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)

    # Relationships
    test_definition = relationship("TestDefinition")
    student = relationship("User")
