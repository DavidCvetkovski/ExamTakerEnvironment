from datetime import datetime
import uuid
import enum
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

class InteractionEventType(str, enum.Enum):
    ANSWER_CHANGE = "ANSWER_CHANGE"
    FLAG_TOGGLE = "FLAG_TOGGLE"
    NAVIGATION = "NAVIGATION"

class InteractionEvent(Base):
    __tablename__ = "interaction_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("exam_sessions.id"), nullable=False, index=True)
    
    # Optional: track specific LO/Version if the event is tied to a question
    learning_object_id = Column(UUID(as_uuid=True), nullable=True)
    item_version_id = Column(UUID(as_uuid=True), nullable=True)
    
    event_type = Column(Enum(InteractionEventType), nullable=False)
    payload = Column(JSONB, nullable=False, default=dict)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    session = relationship("ExamSession", backref="interaction_events")
