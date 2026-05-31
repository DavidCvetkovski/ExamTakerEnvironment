from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from app.core.prisma_db import prisma
from prisma import Json
from app.schemas.test_definition import TestDefinitionCreate

# Sentinel for "no course assigned" in the list filter (Epoch 8.9.1).
UNASSIGNED = "unassigned"


async def _validate_course(course_id: Optional[UUID]) -> Optional[str]:
    """Validate an optional blueprint course assignment (Epoch 8.9.1).

    Returns the course id as a string when valid, or None when unassigned.
    Raises 400 when a course id is supplied but the course is missing or
    inactive. Authoritative — the frontend selector is advisory (CLAUDE.md §1).
    """
    if course_id is None:
        return None
    course = await prisma.courses.find_unique(where={"id": str(course_id)})
    if not course or not course.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected course does not exist or is inactive.",
        )
    return str(course_id)


async def create_test_definition(
    payload: TestDefinitionCreate, current_user_id: str
) -> dict:
    blocks_data = [block.model_dump(mode="json") for block in payload.blocks]
    course_id = await _validate_course(payload.course_id)

    now = datetime.utcnow()
    new_test = await prisma.test_definitions.create(
        data={
            "title": payload.title,
            "description": payload.description,
            "created_by": str(current_user_id),
            "course_id": course_id,
            "blocks": Json(blocks_data),
            "duration_minutes": payload.duration_minutes,
            "shuffle_questions": payload.shuffle_questions,
            "scoring_config": Json(payload.scoring_config),
            # updated_at has no DB default — set it explicitly so the value
            # is never NULL/1970 on freshly created blueprints (Stage 18i).
            "created_at": now,
            "updated_at": now,
        }
    )
    return new_test


def _course_where(course_id: Optional[str]) -> dict:
    """Build the Prisma where-clause for the course filter (Epoch 8.9.1).

    None -> no filter (all); "unassigned" -> course_id IS NULL; uuid -> exact.
    """
    if course_id is None:
        return {}
    if course_id == UNASSIGNED:
        return {"course_id": None}
    return {"course_id": course_id}


async def list_test_definitions(course_id: Optional[str] = None) -> List[dict]:
    return await prisma.test_definitions.find_many(where=_course_where(course_id))

async def get_test_definition(test_id: UUID) -> dict:
    test = await prisma.test_definitions.find_unique(where={"id": str(test_id)})
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )
    return test

async def update_test_definition(
    test_id: UUID, payload: TestDefinitionCreate
) -> dict:
    blocks_data = [block.model_dump(mode="json") for block in payload.blocks]
    course_id = await _validate_course(payload.course_id)

    updated = await prisma.test_definitions.update(
        where={"id": str(test_id)},
        data={
            "title": payload.title,
            "description": payload.description,
            "course_id": course_id,
            "blocks": Json(blocks_data),
            "duration_minutes": payload.duration_minutes,
            "shuffle_questions": payload.shuffle_questions,
            "scoring_config": Json(payload.scoring_config),
            # Bump updated_at on every write so the blueprint card always
            # reflects the latest edit time (Stage 18i).
            "updated_at": datetime.utcnow(),
        }
    )
    # The blocks (and therefore the resolved item pool) may have changed, so
    # drop the cached snapshot for this blueprint.
    from app.services.exam_sessions_service import invalidate_test_definition_cache

    await invalidate_test_definition_cache(str(test_id))
    return updated
