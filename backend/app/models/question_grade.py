from datetime import datetime
from enum import Enum as PyEnum
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class GradingStatus(str, PyEnum):
    UNGRADED = "UNGRADED"
    AUTO_GRADED = "AUTO_GRADED"
    PARTIALLY_GRADED = "PARTIALLY_GRADED"
    FULLY_GRADED = "FULLY_GRADED"


class QuestionGrade(Base):
    """Stores the score and feedback for a single question within an exam session."""

    __tablename__ = "question_grades"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("exam_sessions.id"), nullable=False, index=True)
    learning_object_id = Column(UUID(as_uuid=True), nullable=False)
    item_version_id = Column(UUID(as_uuid=True), nullable=False)

    # Scoring
    points_awarded = Column(Float, nullable=False, default=0.0)
    points_possible = Column(Float, nullable=False, default=1.0)
    is_correct = Column(Boolean, nullable=True)  # NULL for essay (pending)

    # Auto vs manual provenance
    graded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    is_auto_graded = Column(Boolean, nullable=False, default=True)

    # Feedback
    feedback = Column(Text, nullable=True)
    rubric_data = Column(JSONB, nullable=True)

    # Denormalized for grading convenience
    student_answer = Column(JSONB, nullable=False)
    correct_answer = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("ExamSession", backref="question_grades")
    grader = relationship("User", foreign_keys=[graded_by])
