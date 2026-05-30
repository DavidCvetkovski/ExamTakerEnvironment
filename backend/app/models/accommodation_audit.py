"""Append-only audit trail for administrator-granted exam accommodations.

Every change to a student's provision (time multiplier, enlarged display) writes
one row here in the same transaction as the change itself, so a provision can
never exist without a record of who granted it and when. Never updated or
deleted (CLAUDE.md §1 — auditability).
"""
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime

from app.core.database import Base


class AccommodationAuditLog(Base):
    __tablename__ = "accommodation_audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    changed_by = Column(UUID(as_uuid=True), nullable=False)
    field = Column(String, nullable=False)  # 'provision_time_multiplier' | 'accommodation_enlarged_display'
    old_value = Column(String, nullable=False)
    new_value = Column(String, nullable=False)
    source = Column(String, nullable=False)  # 'manual' | 'csv_import'
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
