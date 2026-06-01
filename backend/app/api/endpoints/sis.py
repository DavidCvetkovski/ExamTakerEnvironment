"""SIS / Osiris interchange endpoints: roster + accommodation import, grade export.

Imports are admin-only and bounded by file size; grade export is available to
admins and constructors and is always filtered (directive §8, CLAUDE.md §1/§4).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, HTTPException, status

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.sis import SisImportJobPage, SisImportJobResult
from app.services.sis import (
    accommodation_import_service,
    grade_export_service,
    job_recorder,
    roster_import_service,
)

router = APIRouter(prefix="/sis", tags=["sis"])

# CSV imports are bounded so a single upload cannot exhaust memory (directive §2.4).
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024

_require_admin = require_role(UserRole.ADMIN)
_require_exporter = require_role(UserRole.ADMIN, UserRole.CONSTRUCTOR)


async def _read_bounded(upload: UploadFile) -> bytes:
    """Read an uploaded file, rejecting anything over the size bound."""
    content = await upload.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )
    return content


@router.post("/rosters/import", response_model=SisImportJobResult)
async def import_roster(
    file: UploadFile = File(...),
    create_missing_courses: bool = Form(False),
    current_user: User = Depends(_require_admin),
):
    """Import a roster CSV, provisioning/matching users and enrollments."""
    content = await _read_bounded(file)
    return await roster_import_service.import_roster(
        content,
        file.filename or "roster.csv",
        str(current_user.id),
        create_missing_courses=create_missing_courses,
    )


@router.post("/accommodations/import", response_model=SisImportJobResult)
async def import_accommodations(
    file: UploadFile = File(...),
    current_user: User = Depends(_require_admin),
):
    """Import an accommodation CSV, reusing the audited accommodation write path."""
    content = await _read_bounded(file)
    return await accommodation_import_service.import_accommodations(
        content, file.filename or "accommodations.csv", str(current_user.id)
    )


@router.get("/jobs", response_model=SisImportJobPage)
async def list_import_jobs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(_require_admin),
):
    """List past SIS import jobs, newest first."""
    return await job_recorder.list_jobs(skip=skip, limit=limit)


@router.get("/jobs/{job_id}", response_model=SisImportJobResult)
async def get_import_job(
    job_id: UUID,
    _: User = Depends(_require_admin),
):
    """Return the full row-level report for a single import job."""
    return await job_recorder.get_job_report(str(job_id))


@router.get("/grades/export")
async def export_grades(
    course_id: UUID | None = Query(None),
    scheduled_session_id: UUID | None = Query(None),
    test_definition_id: UUID | None = Query(None),
    published_only: bool = Query(True),
    current_user: User = Depends(_require_exporter),
):
    """Return an Osiris-compatible grade CSV for the filtered result set.

    The body is built (DB query + audit) before the response is constructed, so
    a failure returns a clean error rather than breaking a started stream.
    """
    if course_id is None and scheduled_session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least a course_id or scheduled_session_id filter.",
        )
    body = await grade_export_service.build_grades_csv(
        course_id=str(course_id) if course_id else None,
        scheduled_session_id=str(scheduled_session_id) if scheduled_session_id else None,
        test_definition_id=str(test_definition_id) if test_definition_id else None,
        published_only=published_only,
        actor_id=str(current_user.id),
    )
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="grades_export.csv"'},
    )
