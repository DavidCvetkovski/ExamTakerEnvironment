from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import List, Optional

from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.item_version import ItemStatus
from app.schemas.item_version import ItemVersionCreate, ItemVersionResponse
from app.schemas.learning_object import LearningObjectListResponse, LearningObjectUpdate
from app.schemas.pagination import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, Page
from app.services import items_service as svc
from app.services.pagination import paginate

router = APIRouter()


@router.get("/learning-objects", response_model=Page[LearningObjectListResponse])
async def list_learning_objects(
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    current_user: User = Depends(get_current_user),
):
    """Return a paginated list of Learning Objects with latest-version metadata."""
    return paginate(await svc.list_learning_objects(), skip, limit)

@router.post("/learning-objects", response_model=dict)
async def create_learning_object(
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Creates a new Learning Object and its initial DRAFT version."""
    return await svc.create_learning_object(current_user_id=current_user.id)

@router.get("/learning-objects/{lo_id}", response_model=LearningObjectListResponse)
async def get_learning_object(
    lo_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Return a Learning Object summary with its latest version and course metadata."""
    return await svc.get_learning_object(lo_id=lo_id)

@router.patch("/learning-objects/{lo_id}", response_model=LearningObjectListResponse)
async def update_learning_object(
    lo_id: UUID,
    payload: LearningObjectUpdate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Update learning-object-level metadata such as course assignment."""
    return await svc.update_learning_object(lo_id=lo_id, payload=payload)

@router.get("/learning-objects/{lo_id}/versions", response_model=List[ItemVersionResponse])
async def get_item_versions(
    lo_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Return the complete version history of a Learning Object."""
    return await svc.get_item_versions(lo_id=lo_id)

@router.post("/learning-objects/{lo_id}/versions", response_model=ItemVersionResponse)
async def create_new_revision(
    lo_id: UUID,
    payload: ItemVersionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Core Immutability Controller: overwrite Draft or create new version."""
    return await svc.create_new_revision(lo_id=lo_id, payload=payload, current_user_id=current_user.id)


class StatusTransitionRequest(BaseModel):
    new_status: ItemStatus
    feedback: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

@router.patch("/learning-objects/{lo_id}/versions/{version_id}/status", response_model=ItemVersionResponse)
async def transition_item_status(
    lo_id: UUID,
    version_id: UUID,
    payload: StatusTransitionRequest,
    current_user: User = Depends(get_current_user),
):
    """Transitions an ItemVersion between workflow states."""
    return await svc.transition_item_status(
        lo_id=lo_id, 
        version_id=version_id, 
        new_status=payload.new_status, 
        current_user_role=current_user.role,
        feedback=payload.feedback
    )

@router.post("/learning-objects/{lo_id}/duplicate", response_model=dict)
async def duplicate_learning_object(
    lo_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create a copy of a Learning Object with its latest version content."""
    return await svc.duplicate_learning_object(lo_id=lo_id, current_user_id=current_user.id)

@router.delete("/learning-objects/{lo_id}")
async def delete_learning_object(
    lo_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Soft-delete guard: marks all versions RETIRED."""
    return await svc.delete_learning_object(lo_id=lo_id)
