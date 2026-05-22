from pydantic import BaseModel, Field, ConfigDict, field_validator
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
    # Optional course association (Epoch 8.9.1). None == "Unassigned".
    # Course existence/active state is validated in the service layer
    # (needs DB access), not here — see blueprints_service._validate_course.
    course_id: Optional[UUID] = None
    blocks: List[TestBlock]
    duration_minutes: int = Field(default=60, gt=0)
    shuffle_questions: bool = False
    scoring_config: Dict[str, Any] = Field(default_factory=dict)

class TestDefinitionCreate(TestDefinitionBase):
    @field_validator("blocks")
    @classmethod
    def _at_least_one_non_empty_block(cls, blocks: List[TestBlock]) -> List[TestBlock]:
        """A blueprint must contribute at least one question on write.

        Zero blocks, or every block empty, both fail — there'd be nothing
        to assemble at session-instantiation time. Enforced on
        ``TestDefinitionCreate`` (used by both POST and PUT) but
        intentionally *not* on ``TestDefinitionResponse`` so reading legacy
        rows that pre-date this rule still works. Frontend mirrors this in
        ``lib/validateBlueprint.ts`` (advisory); this validator is the
        authoritative rule per CLAUDE.md §1.
        """
        if not any(block.rules for block in blocks):
            raise ValueError(
                "Add at least one section with a question before saving."
            )
        return blocks

class TestDefinitionResponse(TestDefinitionBase):
    id: UUID
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
