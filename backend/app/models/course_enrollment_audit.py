"""Append-only audit trail for course-roster changes (Epoch 15).

Courses are co-managed — any constructor may enroll or remove students — so this
log is what keeps a roster change attributable to whoever made it. Mirrors the
Prisma ``course_enrollment_audit`` table. Never updated or deleted (CLAUDE.md §1
— auditability). SQLAlchemy is used for type parity only; Prisma owns queries.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class CourseEnrollmentAction(str, enum.Enum):
    ENROLL = "ENROLL"
    REMOVE = "REMOVE"


class CourseEnrollmentAudit(Base):
    __tablename__ = "course_enrollment_audit"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    student_id = Column(UUID(as_uuid=True), nullable=False)
    changed_by = Column(UUID(as_uuid=True), nullable=False)
    action = Column(Enum(CourseEnrollmentAction), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
