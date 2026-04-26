from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.question_grade import GradingStatus


class SessionResult(Base):
    """Stores the aggregated grading result for an entire exam session."""

    __tablename__ = "session_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("exam_sessions.id"), nullable=False, unique=True, index=True)
    test_definition_id = Column(UUID(as_uuid=True), ForeignKey("test_definitions.id"), nullable=False, index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Aggregates
    total_points = Column(Float, nullable=False, default=0.0)
    max_points = Column(Float, nullable=False, default=0.0)
    percentage = Column(Float, nullable=False, default=0.0)  # (total_points / max_points) * 100

    # Grading progress
    from sqlalchemy import Enum
    grading_status = Column(Enum(GradingStatus, name="gradingstatus"), nullable=False, default=GradingStatus.UNGRADED)
    questions_graded = Column(Integer, nullable=False, default=0)
    questions_total = Column(Integer, nullable=False, default=0)

    # Grade boundary result
    letter_grade = Column(String, nullable=True)
    passed = Column(Boolean, nullable=True)

    # Publication
    is_published = Column(Boolean, nullable=False, default=False)
    published_at = Column(DateTime, nullable=True)
    published_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("ExamSession", backref="session_result", uselist=False)
    test_definition = relationship("TestDefinition", backref="session_results")
    student = relationship("User", foreign_keys=[student_id], backref="session_results")
    publisher = relationship("User", foreign_keys=[published_by])
