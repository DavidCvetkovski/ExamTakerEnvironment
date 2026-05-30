"""Business logic for administrator-managed exam accommodations.

Governs *who sets* a provision and *how it's recorded* — distinct from
``exam_sessions_service``, which *honours* the provision at exam time. Every
change is written with its audit row in a single transaction, so a provision can
never exist without a record of who granted it.
"""

import csv
import io
from typing import List, Optional

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.models.user import UserRole
from app.schemas.accommodation import (
    AccommodationAuditEntry,
    AccommodationAuditPage,
    AccommodationStudent,
    AccommodationStudentPage,
    AccommodationUpdate,
    ImportResult,
    ImportRowResult,
)

# Field names recorded in the audit log (kept as constants — single source).
FIELD_MULTIPLIER = "provision_time_multiplier"
FIELD_ENLARGED = "accommodation_enlarged_display"


async def list_students(skip: int, limit: int, search: Optional[str]) -> AccommodationStudentPage:
    """Paginated list of students with their current provisions, optionally
    filtered by email / VUnetID substring."""
    where: dict = {"role": UserRole.STUDENT.value}
    if search:
        where["OR"] = [
            {"email": {"contains": search, "mode": "insensitive"}},
            {"vunet_id": {"contains": search, "mode": "insensitive"}},
        ]

    total = await prisma.users.count(where=where)
    records = await prisma.users.find_many(
        where=where,
        order={"email": "asc"},
        skip=skip,
        take=limit,
    )
    return AccommodationStudentPage(
        items=[AccommodationStudent.model_validate(r) for r in records],
        total=total,
        skip=skip,
        limit=limit,
    )


async def _load_student_or_400(student_id: str):
    student = await prisma.users.find_unique(where={"id": student_id})
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
    if student.role != UserRole.STUDENT.value:
        # Accommodations apply only to exam takers.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Accommodations can only be set for students.",
        )
    return student


def _diff(student, patch: AccommodationUpdate) -> List[dict]:
    """Compute the list of fields that actually change. Each entry carries the
    DB column, the audit field name, and stringified old/new values."""
    changes: List[dict] = []
    if patch.provision_time_multiplier is not None and (
        student.provision_time_multiplier != patch.provision_time_multiplier
    ):
        changes.append({
            "column": FIELD_MULTIPLIER,
            "field": FIELD_MULTIPLIER,
            "old": str(student.provision_time_multiplier),
            "new": str(patch.provision_time_multiplier),
            "value": patch.provision_time_multiplier,
        })
    if patch.enlarged_display is not None and (
        student.accommodation_enlarged_display != patch.enlarged_display
    ):
        changes.append({
            "column": FIELD_ENLARGED,
            "field": FIELD_ENLARGED,
            "old": str(student.accommodation_enlarged_display),
            "new": str(patch.enlarged_display),
            "value": patch.enlarged_display,
        })
    return changes


async def apply_update(student, patch: AccommodationUpdate, admin_id: str, source: str) -> bool:
    """Apply a provision change to an already-loaded student, writing one audit
    row per changed field in the same transaction. Returns True if anything
    changed. Shared by the manual PATCH route and the CSV importer (single
    source of the write-and-audit logic)."""
    changes = _diff(student, patch)
    if not changes:
        return False

    update_data = {c["column"]: c["value"] for c in changes}
    async with prisma.tx() as tx:
        await tx.users.update(where={"id": str(student.id)}, data=update_data)
        for c in changes:
            await tx.accommodation_audit_log.create(
                data={
                    "student_id": str(student.id),
                    "changed_by": admin_id,
                    "field": c["field"],
                    "old_value": c["old"],
                    "new_value": c["new"],
                    "source": source,
                }
            )
    return True


async def update_accommodation(student_id: str, patch: AccommodationUpdate, admin_id: str) -> AccommodationStudent:
    """Manual (UI) provision update for a single student."""
    student = await _load_student_or_400(student_id)
    await apply_update(student, patch, admin_id, source="manual")
    refreshed = await prisma.users.find_unique(where={"id": student_id})
    return AccommodationStudent.model_validate(refreshed)


async def get_audit(student_id: str, skip: int, limit: int) -> AccommodationAuditPage:
    where = {"student_id": student_id}
    total = await prisma.accommodation_audit_log.count(where=where)
    records = await prisma.accommodation_audit_log.find_many(
        where=where,
        order={"created_at": "desc"},
        skip=skip,
        take=limit,
    )
    return AccommodationAuditPage(
        items=[AccommodationAuditEntry.model_validate(r) for r in records],
        total=total,
        skip=skip,
        limit=limit,
    )


def _parse_bool(raw: str) -> bool:
    v = raw.strip().lower()
    if v in ("true", "1", "yes", "y"):
        return True
    if v in ("false", "0", "no", "n", ""):
        return False
    raise ValueError(f"invalid boolean '{raw}'")


async def import_csv(content: bytes, admin_id: str) -> ImportResult:
    """Bulk-provision from a CSV with columns
    ``vunet_id,provision_time_multiplier,enlarged_display``.

    Each row is validated through the same ``AccommodationUpdate`` model as the
    manual path (single source of the bounds), resolved by VUnetID, and applied
    with audit (``source='csv_import'``). Row errors are collected and reported;
    a row is never half-applied (the per-row write is transactional)."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))
    required = {"vunet_id", "provision_time_multiplier", "enlarged_display"}
    if reader.fieldnames is None or not required.issubset({f.strip() for f in reader.fieldnames}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV must have columns: {', '.join(sorted(required))}.",
        )

    rows: List[ImportRowResult] = []
    applied = unchanged = errors = 0

    for i, raw_row in enumerate(reader, start=2):  # row 1 is the header
        vunet_id = (raw_row.get("vunet_id") or "").strip()
        try:
            patch = AccommodationUpdate(
                provision_time_multiplier=float(raw_row["provision_time_multiplier"]),
                enlarged_display=_parse_bool(raw_row["enlarged_display"]),
            )
        except (ValueError, TypeError) as exc:
            errors += 1
            rows.append(ImportRowResult(row=i, vunet_id=vunet_id, status="error", message=str(exc)))
            continue

        student = await prisma.users.find_unique(where={"vunet_id": vunet_id}) if vunet_id else None
        if not student or student.role != UserRole.STUDENT.value:
            errors += 1
            rows.append(ImportRowResult(row=i, vunet_id=vunet_id, status="error", message="No matching active student."))
            continue

        changed = await apply_update(student, patch, admin_id, source="csv_import")
        if changed:
            applied += 1
            rows.append(ImportRowResult(row=i, vunet_id=vunet_id, status="applied"))
        else:
            unchanged += 1
            rows.append(ImportRowResult(row=i, vunet_id=vunet_id, status="unchanged"))

    return ImportResult(applied=applied, unchanged=unchanged, errors=errors, rows=rows)
