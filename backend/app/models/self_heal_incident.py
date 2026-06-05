"""SQLAlchemy model + enums for the self-heal incident log (Epoch 15).

Mirrors the Prisma ``self_heal_incidents`` table. As with the rest of the
codebase, SQLAlchemy is used for type/enum parity only; Prisma owns queries.

This is the structured data foundation the autonomous fix loop consumes:
every unhandled runtime exception and every user bug report lands here as one
deduplicated row, so the agent has a clean, queryable backlog of "what broke,
when, and why" instead of scraping logs.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class SelfHealIncidentSource(str, enum.Enum):
    """How the incident entered the system."""

    RUNTIME_EXCEPTION = "RUNTIME_EXCEPTION"
    USER_FEEDBACK = "USER_FEEDBACK"


class SelfHealSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class SelfHealStatus(str, enum.Enum):
    """Triage / repair workflow state.

    Deliberately distinct from the §7.9 temporal lifecycle vocabulary — this is
    a work queue, not a calendar lifecycle. The autonomous loop advances rows:
    ``NEW -> TRIAGED -> IN_PROGRESS -> FIX_PROPOSED -> RESOLVED`` (or
    ``WONT_FIX`` for noise it deliberately declines).
    """

    NEW = "NEW"
    TRIAGED = "TRIAGED"
    IN_PROGRESS = "IN_PROGRESS"
    FIX_PROPOSED = "FIX_PROPOSED"
    RESOLVED = "RESOLVED"
    WONT_FIX = "WONT_FIX"


class SelfHealIncident(Base):
    __tablename__ = "self_heal_incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(Enum(SelfHealIncidentSource), nullable=False)
    severity = Column(Enum(SelfHealSeverity), nullable=False)
    status = Column(Enum(SelfHealStatus), nullable=False, default=SelfHealStatus.NEW)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    traceback = Column(Text, nullable=True)
    # Stable hash collapsing repeat occurrences of the same fault.
    fingerprint = Column(String, nullable=False, unique=True)
    occurrences = Column(Integer, nullable=False, default=1)
    request_method = Column(String, nullable=True)
    request_path = Column(String, nullable=True)
    request_id = Column(String, nullable=True)
    # Role only — never the user id or any PII (§1).
    user_role = Column(String, nullable=True)
    context = Column(JSONB, nullable=False, default=dict)
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
