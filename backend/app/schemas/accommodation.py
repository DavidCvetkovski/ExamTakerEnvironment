"""Schemas for administrator-managed exam accommodations."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AccommodationStudent(BaseModel):
    """A student row in the accommodations admin list."""
    id: UUID
    email: str
    vunet_id: Optional[str] = None
    provision_time_multiplier: float
    accommodation_enlarged_display: bool

    model_config = ConfigDict(from_attributes=True)


class AccommodationStudentPage(BaseModel):
    """Paginated student list (CLAUDE.md §4 — no unbounded result sets)."""
    items: List[AccommodationStudent]
    total: int
    skip: int
    limit: int


class AccommodationUpdate(BaseModel):
    """Partial provision update. Multiplier is bounded [1.0, 3.0]: never below
    1.0 (can't shorten an exam) and capped to catch fat-finger entries."""
    provision_time_multiplier: Optional[float] = Field(default=None, ge=1.0, le=3.0)
    enlarged_display: Optional[bool] = None


class AccommodationAuditEntry(BaseModel):
    id: UUID
    student_id: UUID
    changed_by: UUID
    field: str
    old_value: str
    new_value: str
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccommodationAuditPage(BaseModel):
    items: List[AccommodationAuditEntry]
    total: int
    skip: int
    limit: int


class ImportRowResult(BaseModel):
    """Per-row outcome of a CSV accommodation import."""
    row: int
    vunet_id: str
    status: str  # 'applied' | 'unchanged' | 'error'
    message: Optional[str] = None


class ImportResult(BaseModel):
    applied: int
    unchanged: int
    errors: int
    rows: List[ImportRowResult]
