"""QTI 2.1 import/export endpoints (constructor/admin only)."""

import io
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.qti import QtiImportJobResult
from app.services.qti import export_service, import_service

router = APIRouter(prefix="/qti", tags=["qti"])

_require_author = require_role(UserRole.ADMIN, UserRole.CONSTRUCTOR)


def _zip_response(data: bytes, name: str) -> StreamingResponse:
    """Wrap package bytes as a downloadable ZIP response."""
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/items/export")
async def export_bank(
    bank_id: UUID = Query(...),
    include_correct: bool = Query(True),
    current_user: User = Depends(_require_author),
):
    """Export an item bank as a QTI 2.1 content package."""
    data = await export_service.export_bank(
        str(bank_id), include_correct=include_correct, actor_id=str(current_user.id)
    )
    return _zip_response(data, f"qti-bank-{bank_id}.zip")


@router.get("/tests/{test_definition_id}/export")
async def export_test(
    test_definition_id: UUID,
    include_correct: bool = Query(True),
    current_user: User = Depends(_require_author),
):
    """Export a test definition's items as a QTI 2.1 content package."""
    data = await export_service.export_test(
        str(test_definition_id), include_correct=include_correct, actor_id=str(current_user.id)
    )
    return _zip_response(data, f"qti-test-{test_definition_id}.zip")


@router.post("/import", response_model=QtiImportJobResult)
async def import_package(
    file: UploadFile = File(...),
    bank_id: UUID | None = Form(None),
    course_id: UUID | None = Form(None),
    commit: bool = Form(False),
    current_user: User = Depends(_require_author),
):
    """Import a QTI package. Dry-run by default; pass commit=true to persist."""
    data = await file.read()
    return await import_service.run_import(
        filename=file.filename or "package.zip",
        data=data,
        bank_id=str(bank_id) if bank_id else None,
        course_id=str(course_id) if course_id else None,
        commit=commit,
        actor_id=str(current_user.id),
    )
