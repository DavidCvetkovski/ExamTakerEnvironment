"""Schemas for QTI 2.1 import/export jobs and reports."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class QtiImportItemResult(BaseModel):
    """Per-item outcome of a QTI import."""

    identifier: str
    status: str  # OK | ERROR
    question_type: Optional[str] = None
    message: Optional[str] = None


class QtiImportJobResult(BaseModel):
    """Summary + per-item report for a QTI import job (dry-run or committed)."""

    job_id: UUID
    status: str  # COMPLETED | COMPLETED_WITH_ERRORS | FAILED
    committed: bool
    total_items: int
    success_items: int
    error_items: int
    items: List[QtiImportItemResult]
