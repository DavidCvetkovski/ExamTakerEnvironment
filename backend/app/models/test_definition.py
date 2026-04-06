from datetime import datetime
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

class TestDefinition(Base):
    __tablename__ = "test_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Nested structure of sections (blocks) and their selection rules
    # [
    #   {
    #      "title": "Section 1",
    #      "rules": [
    #       {"type": "FIXED", "lo_id": "uuid..."},
    #       {"type": "RANDOM", "tags": ["math"], "count": 5}
    #     ]
    #   }
    # ]
    blocks = Column(JSONB, nullable=False, default=list)
    
    # Global constraints
    duration_minutes = Column(Integer, nullable=False, default=60)
    shuffle_questions = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Grading configuration
    scoring_config = Column(JSONB, nullable=True, default=dict)

    # Relationship to user
    creator = relationship("User")
