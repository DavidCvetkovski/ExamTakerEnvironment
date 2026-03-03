from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import List, Optional, Literal, Union, Dict, Any, Annotated
import enum

class RuleType(str, enum.Enum):
    FIXED = "FIXED"
    RANDOM = "RANDOM"

class FixedSelectionRule(BaseModel):
    rule_type: Literal[RuleType.FIXED]
    learning_object_id: UUID

class RandomSelectionRule(BaseModel):
    rule_type: Literal[RuleType.RANDOM]
    count: int = Field(gt=0)
    tags: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = None

SelectionRule = Annotated[Union[FixedSelectionRule, RandomSelectionRule], Field(discriminator="rule_type")]

class TestBlock(BaseModel):
    title: str
    rules: List[SelectionRule]

class TestDefinitionBase(BaseModel):
    title: str
    description: Optional[str] = None
    blocks: List[TestBlock]
    duration_minutes: int = Field(default=60, gt=0)
    shuffle_questions: bool = False

class TestDefinitionCreate(TestDefinitionBase):
    pass

class TestDefinitionResponse(TestDefinitionBase):
    id: UUID
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
