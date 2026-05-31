"""Accommodation CSV import: reuses the Epoch 10 accommodation write+audit path.

Header: ``vunet_id,provision_time_multiplier,enlarged_display``. Every applied
change writes accommodation audit rows via the shared service, tagged with the
``sis_import`` source so provenance is auditable.
"""

from pydantic import ValidationError

from app.core.prisma_db import prisma
from app.models.user import UserRole
from app.schemas.accommodation import AccommodationUpdate
from app.schemas.sis import SisImportJobResult, SisImportRowResult
from app.services.accommodations_service import apply_update
from app.services.sis.job_recorder import RowError, parse_bool, parse_csv, record_job

_REQUIRED = {"vunet_id", "provision_time_multiplier", "enlarged_display"}


async def import_accommodations(content: bytes, filename: str, actor_id: str) -> SisImportJobResult:
    """Validate and apply an accommodation CSV, returning a row-level report."""
    rows = parse_csv(content, _REQUIRED)
    results = []
    for i, raw in enumerate(rows, start=1):
        try:
            await _apply_row(raw, actor_id)
            results.append((i, SisImportRowResult(row_number=i, status="OK"), raw))
        except RowError as exc:
            results.append((i, SisImportRowResult(row_number=i, status="ERROR", message=str(exc)), raw))
    return await record_job(
        import_type="accommodation", filename=filename, actor_id=actor_id, results=results
    )


async def _apply_row(raw: dict, actor_id: str) -> None:
    vunet_id = raw["vunet_id"]
    if not vunet_id:
        raise RowError("vunet_id is required")

    student = await prisma.users.find_unique(where={"vunet_id": vunet_id})
    if not student:
        raise RowError(f"No user with vunet_id {vunet_id}")
    if student.role != UserRole.STUDENT.value:
        raise RowError(f"User {vunet_id} is not a student")

    try:
        patch = AccommodationUpdate(
            provision_time_multiplier=float(raw["provision_time_multiplier"]),
            enlarged_display=parse_bool(raw["enlarged_display"], default=False),
        )
    except ValidationError:
        raise RowError("provision_time_multiplier must be between 1.0 and 3.0")
    except ValueError:
        raise RowError(f"Invalid multiplier {raw['provision_time_multiplier']!r}")

    await apply_update(student, patch, actor_id, source="sis_import")
