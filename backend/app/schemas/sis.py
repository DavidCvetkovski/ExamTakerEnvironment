"""Schemas for SIS / Osiris roster, accommodation, and grade interchange."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class SisImportRowResult(BaseModel):
    """Per-row outcome of a SIS import."""

    row_number: int
    status: str  # OK | ERROR | SKIPPED
    message: Optional[str] = None


class SisImportJobResult(BaseModel):
    """Summary + row-level report for a SIS import job."""

    job_id: UUID
    status: str  # COMPLETED | COMPLETED_WITH_ERRORS | FAILED
    total_rows: int
    success_rows: int
    error_rows: int
    rows: List[SisImportRowResult]


class SisImportJobSummary(BaseModel):
    """List representation of a past SIS import job (no row detail)."""

    id: UUID
    import_type: str
    filename: str
    status: str
    total_rows: int
    success_rows: int
    error_rows: int
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SisImportJobPage(BaseModel):
    """Paginated list of SIS import jobs."""

    items: List[SisImportJobSummary]
    total: int
