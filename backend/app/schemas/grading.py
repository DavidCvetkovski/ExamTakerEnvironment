"""Pydantic schemas for grading, manual grading input, and result responses."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class QuestionGradeResponse(BaseModel):
    """Response shape for a single question grade record."""
    id: UUID
    session_id: UUID
    learning_object_id: UUID
    item_version_id: UUID
    points_awarded: float
    points_possible: float
    is_correct: Optional[bool]
    is_auto_graded: bool
    feedback: Optional[str]
    rubric_data: Optional[Dict[str, Any]]
    student_answer: Dict[str, Any]
    correct_answer: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class SessionResultResponse(BaseModel):
    """Aggregated grading result for an exam session."""
    id: UUID
    session_id: UUID
    test_definition_id: UUID
    student_id: UUID
    total_points: float
    max_points: float
    percentage: float
    grading_status: str
    questions_graded: int
    questions_total: int
    letter_grade: Optional[str]
    passed: Optional[bool]
    is_published: bool
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class ManualGradeSubmit(BaseModel):
    """Payload for submitting or updating a manual grade on an essay question."""
    points_awarded: float
    feedback: Optional[str] = None
    rubric_data: Optional[Dict[str, Any]] = None

    @field_validator("points_awarded")
    @classmethod
    def points_must_be_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("points_awarded must be >= 0")
        return v


class ScoringConfigUpdate(BaseModel):
    """Payload for updating the scoring configuration on a test definition."""
    pass_percentage: Optional[float] = 55.0
    negative_marking: Optional[bool] = False
    negative_marking_penalty: Optional[float] = 0.25
    multiple_response_strategy: Optional[str] = "PARTIAL_CREDIT"
    grade_boundaries: Optional[List[Dict[str, Any]]] = None
    essay_points: Optional[Dict[str, float]] = None

    @field_validator("multiple_response_strategy")
    @classmethod
    def validate_strategy(cls, v: str) -> str:
        if v not in ("PARTIAL_CREDIT", "ALL_OR_NOTHING"):
            raise ValueError("strategy must be PARTIAL_CREDIT or ALL_OR_NOTHING")
        return v


class GradingQueueItem(BaseModel):
    """A single ungraded essay item in the grading queue."""
    grade_id: str
    session_id: str
    learning_object_id: Optional[str]
    item_version_id: Optional[str]
    student_answer: Dict[str, Any]
    points_possible: float
    points_awarded: float
    feedback: Optional[str]


class SessionGradingSummary(BaseModel):
    """Per-session information shown in the grading overview table."""
    session_id: str
    student_id: str
    student_email: Optional[str]
    student_vunet_id: Optional[str]
    submitted_at: Optional[datetime]
    grading_status: str
    questions_graded: int
    questions_total: int
    total_points: float
    max_points: float
    percentage: float
    is_published: bool
