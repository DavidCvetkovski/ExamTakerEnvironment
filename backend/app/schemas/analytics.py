"""
Pydantic schemas for psychometric analytics responses (Epoch 7).
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class DistractorStat(BaseModel):
    option_index: int
    option_text: Optional[str]
    count: int
    percentage: float
    is_correct: bool
    is_non_functional: bool  # incorrect option selected by < 5% of respondents


class ItemFlag(BaseModel):
    code: str   # TOO_HARD | TOO_EASY | POOR_DISCRIMINATION
    message: str


class ItemVersionStats(BaseModel):
    learning_object_id: str
    item_version_id: str
    version_number: Optional[int]
    question_type: Optional[str]
    p_value: Optional[float]
    d_value: Optional[float]
    n_responses: int
    distractors: List[DistractorStat]
    flags: List[ItemFlag]


class TestItemAnalyticsResponse(BaseModel):
    test_definition_id: str
    total_sessions: int
    items: List[ItemVersionStats]


class VersionHistoryEntry(BaseModel):
    item_version_id: str
    version_number: Optional[int]
    test_definition_ids: List[str]
    p_value: Optional[float]
    d_value: Optional[float]
    n_responses: int
    flags: List[ItemFlag]


class ItemVersionHistoryResponse(BaseModel):
    learning_object_id: str
    versions: List[VersionHistoryEntry]


# ── Stage 2: per-test statistics ──────────────────────────────────────────────

class HistogramBucket(BaseModel):
    range: str           # "0-10", "10-20", …
    min: float
    max: float
    count: int


class CutScoreEntry(BaseModel):
    cut_score: float
    pass_count: int
    fail_count: int
    pass_rate: float


class TestStatsResponse(BaseModel):
    test_definition_id: str
    total_sessions: int
    distribution: List[HistogramBucket]
    mean: Optional[float]
    median: Optional[float]
    std_dev: Optional[float]
    min_score: Optional[float]
    max_score: Optional[float]
    pass_rate: Optional[float]
    pass_count: int
    fail_count: int
    cronbach_alpha: Optional[float]   # internal consistency (KR-20 for binary)
    sem: Optional[float]              # Standard Error of Measurement (in %-points)
    n_items: int
    cut_score_analysis: List[CutScoreEntry]
