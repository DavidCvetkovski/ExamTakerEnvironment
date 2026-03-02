from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Literal, Union, Dict, Any, Annotated
from uuid import UUID
from datetime import datetime
from app.models.item_version import ItemStatus, QuestionType

class MCQOption(BaseModel):
    id: str
    text: str
    is_correct: bool
    weight: float = 1.0

class OptionsMCQ(BaseModel):
    question_type: Literal[QuestionType.MULTIPLE_CHOICE]
    choices: List[MCQOption]

class OptionsEssay(BaseModel):
    question_type: Literal[QuestionType.ESSAY]
    min_words: int
    max_words: int

# Using a discriminated union to parse based on 'question_type' field
OptionsSchema = Annotated[Union[OptionsMCQ, OptionsEssay], Field(discriminator="question_type")]

class ItemVersionCreate(BaseModel):
    learning_object_id: UUID
    status: ItemStatus
    question_type: QuestionType
    content: Dict[str, Any]  # The TipTap JSON State and/or raw HTML
    options: OptionsSchema
    metadata_tags: Dict[str, Any] = Field(default_factory=dict)

class ItemVersionResponse(ItemVersionCreate):
    id: UUID
    version_number: int
    created_at: datetime
    created_by: Optional[UUID] = None
    
    model_config = ConfigDict(from_attributes=True)
