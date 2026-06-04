"""SQLAlchemy model + enums for the append-only proctoring incident log (Epoch 11).

Mirrors the Prisma ``proctoring_incidents`` table. As with the rest of the
codebase, SQLAlchemy is used for type/enum parity only; Prisma owns queries.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base


class ProctoringIncidentType(str, enum.Enum):
    SEB_HEADER_MISSING = "SEB_HEADER_MISSING"
    SEB_HASH_INVALID = "SEB_HASH_INVALID"
    IP_NOT_ALLOWED = "IP_NOT_ALLOWED"
    FOCUS_LOST = "FOCUS_LOST"
    COPY_ATTEMPT = "COPY_ATTEMPT"
    PASTE_ATTEMPT = "PASTE_ATTEMPT"
    CONTEXT_MENU_ATTEMPT = "CONTEXT_MENU_ATTEMPT"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    DEVICE_FINGERPRINT_MISMATCH = "DEVICE_FINGERPRINT_MISMATCH"
    MULTIPLE_ACTIVE_SESSIONS = "MULTIPLE_ACTIVE_SESSIONS"
    SUPERVISOR_EXTEND = "SUPERVISOR_EXTEND"
    SUPERVISOR_PAUSE = "SUPERVISOR_PAUSE"
    SUPERVISOR_RESUME = "SUPERVISOR_RESUME"
    SUPERVISOR_TERMINATE = "SUPERVISOR_TERMINATE"
    # Epoch 14 audit C-1: the student's accommodation time could not be honoured
    # because the scheduled window closes before their individual expiry.
    ACCOMMODATION_CLIPPED = "ACCOMMODATION_CLIPPED"


class ProctoringSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class ProctoringIncidentSource(str, enum.Enum):
    SERVER = "SERVER"
    CLIENT = "CLIENT"


class ProctoringIncident(Base):
    __tablename__ = "proctoring_incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_session_id = Column(UUID(as_uuid=True), nullable=True)
    scheduled_session_id = Column(UUID(as_uuid=True), nullable=True)
    student_id = Column(UUID(as_uuid=True), nullable=True)
    incident_type = Column(Enum(ProctoringIncidentType), nullable=False)
    severity = Column(Enum(ProctoringSeverity), nullable=False)
    source = Column(Enum(ProctoringIncidentSource), nullable=False)
    detail = Column(JSONB, nullable=False, default=dict)
    client_ip = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
