from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ParsedQuestionType(str, Enum):
    MCQ = "MCQ"
    MCQ_MULTI = "MCQ_MULTI"
    ESSAY = "ESSAY"


class BloomsLevel(str, Enum):
    REMEMBER = "Remember"
    UNDERSTAND = "Understand"
    APPLY = "Apply"
    ANALYZE = "Analyze"
    EVALUATE = "Evaluate"
    CREATE = "Create"


class Difficulty(str, Enum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"


class ParsedOption(BaseModel):
    letter: str
    text: str
    is_correct: bool


class ParsedQuestion(BaseModel):
    stem: str
    question_type: ParsedQuestionType
    bloom_level: BloomsLevel = BloomsLevel.REMEMBER
    difficulty: Difficulty = Difficulty.MEDIUM
    points: int = Field(default=1, ge=1)
    tags: list[str] = Field(default_factory=list)
    options: list[ParsedOption] = Field(default_factory=list)
    model_answer: Optional[str] = None
    source_line: int


class ParsedBlock(BaseModel):
    name: str
    questions: list[ParsedQuestion]


class ParsedBlueprintHeader(BaseModel):
    title: Optional[str] = None
    course: Optional[str] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None


class ParsedBlueprint(BaseModel):
    header: Optional[ParsedBlueprintHeader] = None
    blocks: list[ParsedBlock] = Field(default_factory=list)

    @property
    def all_questions(self) -> list[ParsedQuestion]:
        return [q for block in self.blocks for q in block.questions]


class ParseErrorSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


class ParseError(BaseModel):
    line: Optional[int] = None
    message: str
    severity: ParseErrorSeverity
    fix_hint: Optional[str] = None


class ParseResult(BaseModel):
    blueprint: Optional[ParsedBlueprint] = None
    errors: list[ParseError] = Field(default_factory=list)
    warnings: list[ParseError] = Field(default_factory=list)

    @property
    def has_blocking_errors(self) -> bool:
        return len(self.errors) > 0

    @property
    def question_count(self) -> int:
        return len(self.blueprint.all_questions) if self.blueprint else 0


class PersistResult(BaseModel):
    lo_ids: list[str]
    blueprint_id: Optional[str] = None
