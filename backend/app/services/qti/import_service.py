"""Import QTI 2.1 packages into OpenVision learning objects.

The flow stages every item first and only writes to the bank when
``commit=True``; a single bad item never corrupts the bank (directive §9.4,
§2.4). HTML is sanitized during mapping; items are validated against the same
item schemas authored content uses.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from prisma import Json
from pydantic import ValidationError

from app.core.prisma_db import prisma
from app.schemas.items_schemas import (
    ItemVersionContent,
    LearningObjectCreate,
    OptionContent,
    QuestionContent,
    QuestionType,
)
from app.schemas.qti import QtiImportItemResult, QtiImportJobResult
from app.services import integration_audit_service
from app.services.items_service import create_learning_object
from app.services.qti import mappers, package


def _to_content(mapped: dict) -> ItemVersionContent:
    """Validate a mapped item dict into the canonical item content DTO."""
    raw = mapped["content"]
    return ItemVersionContent(
        question=QuestionContent(prompt=raw["question"].get("prompt", "")),
        options=[OptionContent(**o) for o in raw.get("options", [])],
    )


async def _stage_item(name: str, blob: bytes) -> tuple[QtiImportItemResult, dict | None]:
    """Parse, map, and validate one item; never writes to the database."""
    try:
        root = package.parse_xml_safely(blob)
        identifier = root.get("identifier") or name
        mapped = mappers.xml_to_item(root)
        content = _to_content(mapped)
        QuestionType(mapped["question_type"])  # reject unknown types early
        staged = {"mapped": mapped, "content": content}
        return (
            QtiImportItemResult(
                identifier=identifier, status="OK", question_type=mapped["question_type"]
            ),
            staged,
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
        result, staged = await _stage_item(name, blob)
        if staged and commit:
            await _commit_item(staged, bank_id, course_id, actor_id)
        results.append(result)

    return await _record_job(filename, results, commit, actor_id)


async def _commit_item(staged: dict, bank_id: str | None, course_id: str | None, actor_id: str):
    """Persist one staged item as a new learning object."""
    payload = LearningObjectCreate(
        bank_id=bank_id,
        course_id=course_id,
        question_type=QuestionType(staged["mapped"]["question_type"]),
        content=staged["content"],
    )
    await create_learning_object(payload, actor_id)


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
    await integration_audit_service.record(
        integration="qti", action="import_commit" if commit else "import_dryrun",
        actor_user_id=actor_id, resource_type="qti_job", resource_id=str(job.id),
        metadata={"total": len(results), "success": success, "errors": errors},
    )
    return QtiImportJobResult(
        job_id=job.id, status=status_str, committed=commit,
        total_items=len(results), success_items=success, error_items=errors, items=results,
    )
