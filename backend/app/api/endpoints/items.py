from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional

from app.core.database import get_db
from app.models.item_version import ItemVersion, ItemStatus
from app.schemas.item_version import ItemVersionCreate, ItemVersionResponse

router = APIRouter()

# Placeholder: Returns None until real auth (Epoch 3+) is built.
# The endpoint gracefully handles None by not setting created_by.
def get_current_user():
    return None

@router.get("/learning-objects/{lo_id}/versions", response_model=List[ItemVersionResponse])
def get_item_versions(lo_id: UUID, db: Session = Depends(get_db)):
    """
    Fetch the complete version history of a Learning Object.
    """
    versions = db.query(ItemVersion)\
        .filter(ItemVersion.learning_object_id == lo_id)\
        .order_by(ItemVersion.version_number.desc())\
        .all()
    return versions

@router.post("/learning-objects/{lo_id}/versions", response_model=ItemVersionResponse)
def create_new_revision(
    lo_id: UUID,
    payload: ItemVersionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Core Immutability Controller: 
    - If highest local version == DRAFT -> Overwrite (Save action)
    - If highest local version >= READY_FOR_REVIEW -> Create a new DB row with Version + 1
    """
    
    # 1. Fetch the highest local version
    latest_version = db.query(ItemVersion)\
        .filter(ItemVersion.learning_object_id == lo_id)\
        .order_by(ItemVersion.version_number.desc())\
        .first()
        
    if latest_version and latest_version.status == ItemStatus.DRAFT:
        # Optimization: Overwrite the active draft to prevent version bloat
        latest_version.content = payload.content
        latest_version.options = payload.options.model_dump()
        latest_version.metadata_tags = payload.metadata_tags
        latest_version.question_type = payload.question_type
        db.commit()
        db.refresh(latest_version)
        return latest_version
    
    # If it was Approved or Retired, create a new branch in the timeline
    next_v_num = (latest_version.version_number + 1) if latest_version else 1
    
    new_version = ItemVersion(
        learning_object_id=lo_id,
        version_number=next_v_num,
        status=ItemStatus.DRAFT,
        question_type=payload.question_type,
        content=payload.content,
        options=payload.options.model_dump(),
        metadata_tags=payload.metadata_tags,
        created_by=current_user.id if current_user else None
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return new_version

@router.delete("/learning-objects/{lo_id}")
def delete_learning_object(lo_id: UUID, db: Session = Depends(get_db)):
    """
    Cascading Delete Safety Guard. 
    (In a real app, this checks against historical test_sessions).
    For now, we enforce a soft-deletion pattern (RETIRED metadata marking).
    """
    from app.models.learning_object import LearningObject
    
    lo = db.query(LearningObject).filter(LearningObject.id == lo_id).first()
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found")
        
    # Mark all versions as RETIRED instead of executing SQL DELETE
    versions = db.query(ItemVersion).filter(ItemVersion.learning_object_id == lo_id).all()
    for v in versions:
        v.status = ItemStatus.RETIRED
        
    db.commit()
    return {"status": "soft_deleted", "learning_object_id": str(lo_id)}
