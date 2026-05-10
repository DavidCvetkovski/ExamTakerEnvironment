from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
import uuid as _uuid

from app.core.dependencies import require_role
from app.core.prisma_db import prisma
from app.models.user import User, UserRole
from app.services.import_service import parse_text, persist_import
from app.services.import_service.schemas import ParseError

router = APIRouter()


class ImportPreviewRequest(BaseModel):
    raw_text: str = Field(..., max_length=500_000)


class PreviewBlock(BaseModel):
    name: str
    question_count: int
    question_summaries: list[str]


class ImportPreviewResponse(BaseModel):
    question_count: int
    block_count: int
    has_blueprint_header: bool
    blueprint_title: Optional[str]
    errors: list[ParseError]
    warnings: list[ParseError]
    blocks: list[PreviewBlock]
    can_commit: bool


class ImportCommitRequest(BaseModel):
    raw_text: str = Field(..., max_length=500_000)
    create_blueprint: bool = True


class ImportCommitResponse(BaseModel):
    status: str = "completed"
    created_lo_ids: list[str]
    blueprint_id: Optional[str] = None
    question_count: int
    warnings: list[ParseError]


async def _resolve_bank(author_user_id: str) -> str:
    """Return the first item bank id, creating a default one if none exist."""
    bank = await prisma.item_banks.find_first()
    if not bank:
        bank = await prisma.item_banks.create(data={
            "id": str(_uuid.uuid4()),
            "name": "Default Bank",
            "created_by": author_user_id,
        })
    return bank.id


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    body: ImportPreviewRequest,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Parse and validate import text without persisting anything."""
    result = parse_text(body.raw_text)

    blocks: list[PreviewBlock] = []
    if result.blueprint:
        for block in result.blueprint.blocks:
            summaries = [q.stem[:80] for q in block.questions]
            blocks.append(PreviewBlock(
                name=block.name,
                question_count=len(block.questions),
                question_summaries=summaries,
            ))

    return ImportPreviewResponse(
        question_count=result.question_count,
        block_count=len(result.blueprint.blocks) if result.blueprint else 0,
        has_blueprint_header=result.blueprint is not None and result.blueprint.header is not None,
        blueprint_title=result.blueprint.header.title if result.blueprint and result.blueprint.header else None,
        errors=result.errors,
        warnings=result.warnings,
        blocks=blocks,
        can_commit=not result.has_blocking_errors,
    )


@router.post("/commit", response_model=ImportCommitResponse, status_code=status.HTTP_201_CREATED)
async def commit_import(
    body: ImportCommitRequest,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Parse, validate, and persist questions. Always runs synchronously."""
    result = parse_text(body.raw_text)

    if result.has_blocking_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[e.model_dump() for e in result.errors],
        )

    if result.question_count == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No questions to import.",
        )

    bank_id = await _resolve_bank(str(current_user.id))

    persist_result = await persist_import(
        parsed=result.blueprint,
        bank_id=bank_id,
        create_blueprint=body.create_blueprint,
        author_user_id=str(current_user.id),
    )

    return ImportCommitResponse(
        created_lo_ids=persist_result.lo_ids,
        blueprint_id=persist_result.blueprint_id,
        question_count=len(persist_result.lo_ids),
        warnings=result.warnings,
    )
