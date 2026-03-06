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

@router.get("/learning-objects", response_model=List[LearningObjectListResponse])
def list_learning_objects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a list of all Learning Objects with their latest version metadata."""
    return svc.list_learning_objects(db=db)

@router.post("/learning-objects", response_model=dict)
def create_learning_object(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Creates a new Learning Object and its initial DRAFT version."""
    return svc.create_learning_object(db=db, current_user=current_user)

@router.get("/learning-objects/{lo_id}/versions", response_model=List[ItemVersionResponse])
def get_item_versions(
    lo_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the complete version history of a Learning Object."""
    return svc.get_item_versions(db=db, lo_id=lo_id)

@router.post("/learning-objects/{lo_id}/versions", response_model=ItemVersionResponse)
def create_new_revision(
    lo_id: UUID,
    payload: ItemVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Core Immutability Controller: overwrite Draft or create new version."""
    return svc.create_new_revision(db=db, lo_id=lo_id, payload=payload, current_user=current_user)

from pydantic import BaseModel, ConfigDict
from typing import Optional

class StatusTransitionRequest(BaseModel):
    new_status: ItemStatus
    feedback: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

@router.patch("/learning-objects/{lo_id}/versions/{version_id}/status", response_model=ItemVersionResponse)
def transition_item_status(
    lo_id: UUID,
    version_id: UUID,
    payload: StatusTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transitions an ItemVersion between workflow states."""
    return svc.transition_item_status(
        db=db, 
        lo_id=lo_id, 
        version_id=version_id, 
        new_status=payload.new_status, 
        current_user=current_user,
        feedback=payload.feedback
    )

@router.delete("/learning-objects/{lo_id}")
def delete_learning_object(
    lo_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Soft-delete guard: marks all versions RETIRED."""
    return svc.delete_learning_object(db=db, lo_id=lo_id)
