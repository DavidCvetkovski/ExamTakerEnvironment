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

class OptionsMultipleResponse(BaseModel):
    question_type: Literal[QuestionType.MULTIPLE_RESPONSE]
    choices: List[MCQOption]

class OptionsEssay(BaseModel):
    question_type: Literal[QuestionType.ESSAY]
    min_words: int
    max_words: int

# Using a discriminated union to parse based on 'question_type' field
OptionsSchema = Annotated[Union[OptionsMCQ, OptionsMultipleResponse, OptionsEssay], Field(discriminator="question_type")]

class ItemVersionCreate(BaseModel):
    learning_object_id: UUID
    status: ItemStatus
    question_type: QuestionType
    content: Dict[str, Any]  # The TipTap JSON State and/or raw HTML
    options: OptionsSchema
    metadata_tags: Optional[Dict[str, Any]] = None

# Response model is independent - handles what Prisma actually returns
class ItemVersionResponse(BaseModel):
    id: str
    learning_object_id: str
    version_number: int
    status: str
    question_type: str
    content: Optional[Any] = None
    options: Optional[Any] = None
    metadata_tags: Optional[Any] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
