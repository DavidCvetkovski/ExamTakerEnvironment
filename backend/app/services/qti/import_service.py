"""Import QTI 2.1 packages into OpenVision learning objects.

The flow stages every item first and only writes to the bank when
``commit=True``; a single bad item never corrupts the bank (directive §9.4,
§2.4). HTML is sanitized during mapping and items are validated against the same
``ItemVersionCreate`` schema authored content uses.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from prisma import Json
from pydantic import ValidationError

from app.core.prisma_db import prisma
from app.models.item_version import ItemStatus, QuestionType
from app.schemas.item_version import ItemVersionCreate
from app.schemas.qti import QtiImportItemResult, QtiImportJobResult
from app.services import integration_audit_service
from app.services.qti import mappers, package


def _validate(mapped: dict) -> ItemVersionCreate:
    """Validate a mapped item against the canonical item-version schema."""
    qtype = QuestionType(mapped["question_type"])
    # The options discriminator is a Literal[QuestionType.*]; it will not coerce a
    # bare string, so hand it the actual enum member.
    options = {**mapped["options"], "question_type": qtype}
    return ItemVersionCreate(
        learning_object_id=uuid.uuid4(),  # placeholder; real id assigned on commit
        status=ItemStatus.DRAFT,
        question_type=qtype,
        content=mapped["content"],
        options=options,
    )


async def _stage_item(name: str, blob: bytes) -> tuple[QtiImportItemResult, dict | None]:
    """Parse, map, and validate one item; never writes to the database."""
    try:
        root = package.parse_xml_safely(blob)
        identifier = root.get("identifier") or name
        mapped = mappers.xml_to_item(root)
        _validate(mapped)
        return (
            QtiImportItemResult(
                identifier=identifier, status="OK", question_type=mapped["question_type"]
            ),
            mapped,
        )
    except mappers.UnsupportedInteraction as exc:
        return QtiImportItemResult(identifier=name, status="ERROR", message=str(exc)), None
    except (mappers.QtiMappingError, package.QtiPackageError, ValidationError, ValueError, KeyError) as exc:
        return QtiImportItemResult(identifier=name, status="ERROR", message=str(exc)), None


async def run_import(
    *, filename: str, data: bytes, bank_id: str | None, course_id: str | None,
    commit: bool, actor_id: str,
) -> QtiImportJobResult:
    """Import (or dry-run) a QTI package, returning a per-item report."""
    if commit and not bank_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bank_id is required to commit an import.",
        )
    try:
        files = package.read_package(filename, data)
    except package.QtiPackageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    results: list[QtiImportItemResult] = []
    for name, blob in files:
        result, mapped = await _stage_item(name, blob)
        if mapped and commit:
            await _commit_item(mapped, bank_id, course_id, actor_id)
        results.append(result)

    return await _record_job(filename, results, commit, actor_id)


async def _commit_item(mapped: dict, bank_id: str, course_id: str | None, actor_id: str) -> None:
    """Persist one mapped item as a new DRAFT learning object + version."""
    lo = await prisma.learning_objects.create(
        data={"bank_id": bank_id, "course_id": course_id, "created_by": actor_id}
    )
    await prisma.item_versions.create(
        data={
            "learning_object_id": str(lo.id),
            "created_by": actor_id,
            "version_number": 1,
            "status": ItemStatus.DRAFT.value,
            "question_type": mapped["question_type"],
            "content": Json(mapped["content"]),
            "options": Json(mapped["options"]),
        }
    )


async def _record_job(
    filename: str, results: list[QtiImportItemResult], commit: bool, actor_id: str
) -> QtiImportJobResult:
    """Write the qti_jobs row and build the response report."""
    success = sum(1 for r in results if r.status == "OK")
    errors = sum(1 for r in results if r.status == "ERROR")
    status_str = "COMPLETED" if errors == 0 else "COMPLETED_WITH_ERRORS"
    job = await prisma.qti_jobs.create(
        data={
            "job_type": "import_commit" if commit else "import_dryrun",
            "filename": filename,
            "status": status_str,
            "total_items": len(results),
            "success_items": success,
            "error_items": errors,
            "report": Json([r.model_dump() for r in results]),
            "created_by": actor_id,
            "completed_at": datetime.now(timezone.utc),
        }
    )
    await integration_audit_service.record_integration_audit(
        integration="qti", action="import_commit" if commit else "import_dryrun",
        status=status_str, actor_user_id=actor_id, resource_type="qti_job",
        resource_id=str(job.id),
        metadata={"total": len(results), "success": success, "errors": errors},
    )
    return QtiImportJobResult(
        job_id=job.id, status=status_str, committed=commit,
        total_items=len(results), success_items=success, error_items=errors, items=results,
    )
