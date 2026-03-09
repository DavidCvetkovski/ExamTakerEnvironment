from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from app.core.prisma_db import prisma
from prisma import Json
from app.schemas.test_definition import TestDefinitionCreate

async def create_test_definition(
    payload: TestDefinitionCreate, current_user_id: str
) -> dict:
    blocks_data = [block.model_dump(mode="json") for block in payload.blocks]

    new_test = await prisma.test_definitions.create(
        data={
            "title": payload.title,
            "description": payload.description,
            "created_by": str(current_user_id),
            "blocks": Json(blocks_data),
            "duration_minutes": payload.duration_minutes,
            "shuffle_questions": payload.shuffle_questions,
        }
    )
    return new_test

async def list_test_definitions() -> List[dict]:
    return await prisma.test_definitions.find_many()

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
    
    updated = await prisma.test_definitions.update(
        where={"id": str(test_id)},
        data={
            "title": payload.title,
            "description": payload.description,
            "blocks": Json(blocks_data),
            "duration_minutes": payload.duration_minutes,
            "shuffle_questions": payload.shuffle_questions,
        }
    )
    return updated
