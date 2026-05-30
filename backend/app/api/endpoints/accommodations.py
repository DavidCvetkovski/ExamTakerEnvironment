"""Admin-only endpoints for managing exam accommodations."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.accommodation import (
    AccommodationAuditPage,
    AccommodationStudent,
    AccommodationStudentPage,
    AccommodationUpdate,
    ImportResult,
)
from app.services import accommodations_service as svc

# Every route requires ADMIN — the authoritative guard (frontend hiding is advisory).
router = APIRouter(
    prefix="/accommodations",
    tags=["accommodations"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)

MAX_CSV_BYTES = 1_000_000  # 1 MB cap — generous for a roster, blocks abuse.


@router.get("/students", response_model=AccommodationStudentPage)
async def list_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
):
    """Paginated list of students and their current provisions."""
    return await svc.list_students(skip=skip, limit=limit, search=search)


@router.patch("/students/{student_id}", response_model=AccommodationStudent)
async def update_student_accommodation(
    student_id: UUID,
    payload: AccommodationUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Set a student's time multiplier and/or enlarged-display accommodation."""
    return await svc.update_accommodation(str(student_id), payload, str(current_user.id))


@router.get("/students/{student_id}/audit", response_model=AccommodationAuditPage)
async def get_student_audit(
    student_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Paginated provision-change history for one student."""
    return await svc.get_audit(str(student_id), skip=skip, limit=limit)


@router.post("/import", response_model=ImportResult)
async def import_accommodations(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Bulk-provision from a CSV (vunet_id, provision_time_multiplier, enlarged_display)."""
    content = await file.read()
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV exceeds the 1 MB limit.",
        )
    return await svc.import_csv(content, str(current_user.id))
