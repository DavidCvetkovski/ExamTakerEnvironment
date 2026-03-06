from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.item_version import ItemStatus
from app.schemas.item_version import ItemVersionCreate, ItemVersionResponse
from app.schemas.learning_object import LearningObjectListResponse
from app.services import items_service as svc

router = APIRouter()

from app.core.prisma_db import get_prisma
from prisma import Prisma

@router.get("/learning-objects", response_model=List[LearningObjectListResponse])
async def list_learning_objects(
    current_user: User = Depends(get_current_user),
):
    """Return a list of all Learning Objects with their latest version metadata."""
    return await svc.list_learning_objects()

@router.post("/learning-objects", response_model=dict)
async def create_learning_object(
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Creates a new Learning Object and its initial DRAFT version."""
    return await svc.create_learning_object(current_user_id=current_user.id)

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

from pydantic import BaseModel, ConfigDict
from typing import Optional

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

@router.delete("/learning-objects/{lo_id}")
async def delete_learning_object(
    lo_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Soft-delete guard: marks all versions RETIRED."""
    return await svc.delete_learning_object(lo_id=lo_id)
