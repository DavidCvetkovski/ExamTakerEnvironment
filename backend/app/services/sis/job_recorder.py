"""Shared helpers for SIS CSV imports: parsing, row errors, and job recording.

Both importers follow the same shape: validate every row first, apply the valid
ones, then persist a job with a row-level report. This keeps the audit trail and
the response identical across import types (CLAUDE.md §2 single source).
"""

import csv
import io
from datetime import datetime, timezone
from typing import Dict, List, Tuple

from fastapi import HTTPException, status
from prisma import Json

from app.core.prisma_db import prisma
from app.schemas.sis import (
    SisImportJobPage,
    SisImportJobResult,
    SisImportJobSummary,
    SisImportRowResult,
)


class RowError(Exception):
    """Raised to mark a single CSV row as failed with a human message."""


def parse_csv(content: bytes, required_headers: set[str]) -> List[Dict[str, str]]:
    """Decode CSV bytes (BOM-tolerant) and validate the header set."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise RowError(f"File is not valid UTF-8: {exc}")
    reader = csv.DictReader(io.StringIO(text))
    headers = {h.strip() for h in (reader.fieldnames or [])}
    missing = required_headers - headers
    if missing:
        raise RowError(f"Missing required columns: {', '.join(sorted(missing))}")
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def parse_bool(value: str, *, default: bool = True) -> bool:
    """Parse a loose CSV boolean (true/false/yes/no/1/0)."""
    v = value.strip().lower()
    if v == "":
        return default
    if v in {"true", "1", "yes", "y"}:
        return True
    if v in {"false", "0", "no", "n"}:
        return False
    raise RowError(f"Invalid boolean value: {value!r}")


async def record_job(
    *,
    import_type: str,
    filename: str,
    actor_id: str,
    results: List[Tuple[int, SisImportRowResult, Dict[str, str]]],
) -> SisImportJobResult:
    """Persist a SIS import job and its row reports, returning the summary."""
    success = sum(1 for _, r, _ in results if r.status == "OK")
    errors = sum(1 for _, r, _ in results if r.status == "ERROR")
    status = "COMPLETED" if errors == 0 else "COMPLETED_WITH_ERRORS"

    job = await prisma.sis_import_jobs.create(
        data={
            "import_type": import_type,
            "filename": filename,
            "status": status,
            "total_rows": len(results),
            "success_rows": success,
            "error_rows": errors,
            "created_by": actor_id,
            "completed_at": datetime.now(timezone.utc),
        }
    )
    for row_number, result, raw in results:
        await prisma.sis_import_job_rows.create(
            data={
                "job_id": str(job.id),
                "row_number": row_number,
                "status": result.status,
                "message": result.message,
                "raw_data": Json(raw),
            }
        )
    return SisImportJobResult(
        job_id=job.id,
        status=status,
        total_rows=len(results),
        success_rows=success,
        error_rows=errors,
        rows=[r for _, r, _ in results],
    )


async def list_jobs(*, skip: int, limit: int) -> SisImportJobPage:
    """Return a paginated, newest-first list of SIS import jobs."""
    total = await prisma.sis_import_jobs.count()
    jobs = await prisma.sis_import_jobs.find_many(
        skip=skip, take=limit, order={"created_at": "desc"}
    )
    return SisImportJobPage(
        items=[SisImportJobSummary.model_validate(j) for j in jobs], total=total
    )


async def get_job_report(job_id: str) -> SisImportJobResult:
    """Return the full row-level report for a single import job (404 if absent)."""
    job = await prisma.sis_import_jobs.find_unique(
        where={"id": job_id}, include={"rows": True}
    )
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import job not found")
    rows = sorted(job.rows or [], key=lambda r: r.row_number)
    return SisImportJobResult(
        job_id=job.id,
        status=job.status,
        total_rows=job.total_rows,
        success_rows=job.success_rows,
        error_rows=job.error_rows,
        rows=[
            SisImportRowResult(row_number=r.row_number, status=r.status, message=r.message)
            for r in rows
        ],
    )
