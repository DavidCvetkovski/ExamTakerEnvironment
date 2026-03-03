from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any

from app.models.item_version import ItemStatus, QuestionType

class LearningObjectCreate(BaseModel):
    bank_id: UUID

class LearningObjectResponse(BaseModel):
    id: UUID
    bank_id: UUID
    created_at: datetime
    created_by: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)

class LearningObjectListResponse(BaseModel):
    id: UUID
    bank_id: UUID
    created_at: datetime
    
    # Latest version metadata
    latest_version_number: int
    latest_status: ItemStatus
    latest_question_type: QuestionType
    latest_content_preview: str  # First few words of the content

    model_config = ConfigDict(from_attributes=True)
