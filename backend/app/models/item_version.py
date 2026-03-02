import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base

class ItemStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    APPROVED = "APPROVED"
    RETIRED = "RETIRED"

class QuestionType(str, enum.Enum):
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    MULTIPLE_RESPONSE = "MULTIPLE_RESPONSE"
    ESSAY = "ESSAY"
    HOTSPOT = "HOTSPOT"

class ItemVersion(Base):
    __tablename__ = "item_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    learning_object_id = Column(UUID(as_uuid=True), ForeignKey("learning_objects.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    
    status = Column(Enum(ItemStatus), default=ItemStatus.DRAFT, nullable=False)
    question_type = Column(Enum(QuestionType), nullable=False)
    
    # Structure: { "raw_html": "<p>...</p>", "json": {...} }
    # Using JSONB allows us to store arbitrary WYSIWYG editor state (e.g., TipTap schema)
    content = Column(JSONB, nullable=False) 
    
    # Structure (MCQ): [{"id": "A", "text": "Option 1", "is_correct": true, "weight": 1.0}, ...]
    # Structure (Essay): {"min_words": 100, "max_words": 500, "scoring_rubric": "..."}
    options = Column(JSONB, nullable=False)
    
    # Structure: {"bloom_level": "Analysis", "p_value": 0.8, "d_value": 0.2, "tags": ["math", "calculus"]}
    metadata_tags = Column(JSONB, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    learning_object = relationship("LearningObject", back_populates="versions")
