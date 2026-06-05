from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from uuid import UUID
import uuid as _uuid
from datetime import datetime, timezone
from typing import List, Optional

from prisma import Json
from app.core.dependencies import get_current_user, require_role
from app.core.prisma_db import prisma
from app.models.blueprint_status import BlueprintStatus
from app.models.user import User, UserRole
from app.schemas.pagination import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, Page
from app.schemas.test_definition import TestDefinitionCreate, TestDefinitionResponse
from app.services.blueprint_status_service import (
    can_delete_blueprint,
    can_edit_blueprint,
    derive_blueprint_status,
    derive_next_session_at,
    mutation_error_message,
)
from app.services.blueprints_service import (
    create_test_definition as svc_create_test_definition,
    list_test_definitions as svc_list_test_definitions,
    get_test_definition as svc_get_test_definition,
    update_test_definition as svc_update_test_definition,
)
from app.services.pagination import paginate

router = APIRouter()


class BlueprintUsage(BaseModel):
    # Canonical lifecycle status (Epoch 8.4).
    status: BlueprintStatus
    # Earliest upcoming scheduled session start (UTC). Used by the blueprint
    # card subline; None when no future session exists. (Stage 8 tail.)
    next_session_at: Optional[datetime] = None


async def _assert_blueprint_mutable(test_id: str, allow_delete: bool = False) -> None:
    """Raise 403 when blueprint status prevents the requested mutation."""
    bp_status = await derive_blueprint_status(test_id)
    if allow_delete:
        if not can_delete_blueprint(bp_status):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This blueprint has scheduled or past sessions and cannot be deleted.",
            )
        return
    if not can_edit_blueprint(bp_status):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=mutation_error_message(bp_status),
        )


@router.post("/", response_model=TestDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_test_definition(
    payload: TestDefinitionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create a new Test Blueprint with blocks and rules."""
    return await svc_create_test_definition(payload=payload, current_user_id=current_user.id)

@router.get("/", response_model=Page[TestDefinitionResponse])
async def list_test_definitions(
    course_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    current_user: User = Depends(get_current_user),
):
    """List test blueprints, optionally filtered by course (Epoch 8.9.1).

    ``course_id`` accepts a course UUID, or the literal ``unassigned`` to
    return only blueprints with no course. Omit it to return all.
    """
    return paginate(await svc_list_test_definitions(course_id=course_id), skip, limit)

@router.get("/{test_id}/usage", response_model=BlueprintUsage)
async def get_blueprint_usage(
    test_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Return the blueprint's lifecycle status (and legacy boolean flags)."""
    bp_status = await derive_blueprint_status(str(test_id))
    next_at = await derive_next_session_at(str(test_id))
    return BlueprintUsage(
        status=bp_status,
        next_session_at=next_at,
    )

@router.get("/{test_id}", response_model=TestDefinitionResponse)
async def get_test_definition(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Fetch details of a specific test blueprint."""
    return await svc_get_test_definition(test_id=test_id)

@router.put("/{test_id}", response_model=TestDefinitionResponse)
async def update_test_definition(
    test_id: UUID,
    payload: TestDefinitionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Update an existing test blueprint."""
    await _assert_blueprint_mutable(str(test_id))
    return await svc_update_test_definition(
        test_id=test_id,
        payload=payload,
    )

@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_definition(
    test_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Permanently delete a blueprint that has no session history."""
    await _assert_blueprint_mutable(str(test_id), allow_delete=True)
    existing = await prisma.test_definitions.find_unique(where={"id": str(test_id)})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found.")
    await prisma.test_definitions.delete(where={"id": str(test_id)})

@router.post("/{test_id}/duplicate", response_model=dict, status_code=status.HTTP_201_CREATED)
async def duplicate_test_definition(
    test_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create an independent editable copy of a blueprint."""
    original = await prisma.test_definitions.find_unique(where={"id": str(test_id)})
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found.")
    now = datetime.now(timezone.utc)
    copy = await prisma.test_definitions.create(data={
        "id": str(_uuid.uuid4()),
        "title": f"{original.title} (Copy)",
        "description": original.description,
        "created_by": str(current_user.id),
        "course_id": original.course_id,
        "blocks": Json(original.blocks),
        "duration_minutes": original.duration_minutes,
        "shuffle_questions": original.shuffle_questions,
        "scoring_config": Json(original.scoring_config),
        # Explicit timestamps — `updated_at` has no DB default so leaving it
        # off renders as the Unix epoch on the client (Stage 18i).
        "created_at": now,
        "updated_at": now,
    })
    return {"id": copy.id}
