from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.item_version import ItemVersion, ItemStatus, QuestionType
from app.models.learning_object import LearningObject
from app.models.item_bank import ItemBank
from app.schemas.item_version import ItemVersionCreate, ItemVersionResponse
from app.schemas.learning_object import LearningObjectListResponse, LearningObjectResponse

router = APIRouter()

# ---------------------------------------------------------------------------
# Status Transition Rules
# ---------------------------------------------------------------------------

# Maps (current_status, new_status) → set of roles allowed to make that move
STATUS_TRANSITIONS: dict[tuple[ItemStatus, ItemStatus], set[UserRole]] = {
    (ItemStatus.DRAFT, ItemStatus.READY_FOR_REVIEW): {UserRole.CONSTRUCTOR, UserRole.ADMIN},
    (ItemStatus.READY_FOR_REVIEW, ItemStatus.APPROVED):  {UserRole.REVIEWER, UserRole.ADMIN},
    (ItemStatus.READY_FOR_REVIEW, ItemStatus.DRAFT):    {UserRole.REVIEWER, UserRole.ADMIN},  # rejection
    (ItemStatus.APPROVED, ItemStatus.RETIRED):           {UserRole.ADMIN},
}


# ---------------------------------------------------------------------------
# GET  /learning-objects
# ---------------------------------------------------------------------------

@router.get("/learning-objects", response_model=List[LearningObjectListResponse])
def list_learning_objects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a list of all Learning Objects with their latest version metadata."""
    # Note: Soft-deleted objects will have their latest version status as RETIRED.
    objects = db.query(LearningObject).all()
    results = []
    
    for lo in objects:
        latest = (
            db.query(ItemVersion)
            .filter(ItemVersion.learning_object_id == lo.id)
            .order_by(ItemVersion.version_number.desc())
            .first()
        )
        if latest:
            # Basic preview extraction from TipTap JSON
            preview = "New Question"
            if isinstance(latest.content, dict):
                preview = str(latest.content)[:50] + "..."
                
            results.append(LearningObjectListResponse(
                id=lo.id,
                bank_id=lo.bank_id,
                created_at=lo.created_at,
                latest_version_number=latest.version_number,
                latest_status=latest.status,
                latest_question_type=latest.question_type,
                latest_content_preview=preview
            ))
            
    return results

# ---------------------------------------------------------------------------
# POST /learning-objects
# ---------------------------------------------------------------------------

@router.post("/learning-objects", response_model=dict)
def create_learning_object(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """
    Creates a new Learning Object and its initial DRAFT version.
    Used by the library's 'Create New' button.
    """
    # Simply grab the first item bank, or create a default one
    bank = db.query(ItemBank).first()
    if not bank:
        bank = ItemBank(name="Default Bank", created_by=current_user.id)
        db.add(bank)
        db.commit()
        db.refresh(bank)
        
    new_lo = LearningObject(bank_id=bank.id, created_by=current_user.id)
    db.add(new_lo)
    db.commit()
    db.refresh(new_lo)
    
    # Create the initial version
    initial_version = ItemVersion(
        learning_object_id=new_lo.id,
        status=ItemStatus.DRAFT,
        version_number=1,
        question_type=QuestionType.MULTIPLE_CHOICE,
        content={"type": "doc", "content": [{"type": "paragraph"}]},
        options={"question_type": "MULTIPLE_CHOICE", "choices": [{"id": "A", "text": "", "is_correct": True, "weight": 1.0}]},
        created_by=current_user.id
    )
    db.add(initial_version)
    db.commit()
    
    return {"status": "created", "learning_object_id": str(new_lo.id)}

# ---------------------------------------------------------------------------
# GET  /learning-objects/{lo_id}/versions
# ---------------------------------------------------------------------------

@router.get(
    "/learning-objects/{lo_id}/versions",
    response_model=List[ItemVersionResponse],
)
def get_item_versions(
    lo_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the complete version history of a Learning Object. Requires auth."""
    versions = (
        db.query(ItemVersion)
        .filter(ItemVersion.learning_object_id == lo_id)
        .order_by(ItemVersion.version_number.desc())
        .all()
    )
    return versions


# ---------------------------------------------------------------------------
# POST /learning-objects/{lo_id}/versions — Immutability Controller
# ---------------------------------------------------------------------------

@router.post(
    "/learning-objects/{lo_id}/versions",
    response_model=ItemVersionResponse,
)
def create_new_revision(
    lo_id: UUID,
    payload: ItemVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """
    Core Immutability Controller:
    - If highest version == DRAFT  → overwrite (debounced auto-save)
    - If highest version >= READY_FOR_REVIEW → create new DRAFT version (Version N+1)
    """
    latest = (
        db.query(ItemVersion)
        .filter(ItemVersion.learning_object_id == lo_id)
        .order_by(ItemVersion.version_number.desc())
        .first()
    )

    if latest and latest.status == ItemStatus.DRAFT:
        # Overwrite the active draft — no version bloat
        latest.content = payload.content
        latest.options = payload.options.model_dump()
        latest.metadata_tags = payload.metadata_tags
        latest.question_type = payload.question_type
        db.commit()
        db.refresh(latest)
        return latest

    next_v = (latest.version_number + 1) if latest else 1
    new_version = ItemVersion(
        learning_object_id=lo_id,
        version_number=next_v,
        status=ItemStatus.DRAFT,
        question_type=payload.question_type,
        content=payload.content,
        options=payload.options.model_dump(),
        metadata_tags=payload.metadata_tags,
        created_by=current_user.id,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return new_version


# ---------------------------------------------------------------------------
# PATCH /learning-objects/{lo_id}/versions/{version_id}/status
# ---------------------------------------------------------------------------

class StatusTransitionRequest(BaseModel):
    new_status: ItemStatus
    feedback: Optional[str] = None   # Reviewer rejection feedback


@router.patch(
    "/learning-objects/{lo_id}/versions/{version_id}/status",
    response_model=ItemVersionResponse,
)
def transition_item_status(
    lo_id: UUID,
    version_id: UUID,
    payload: StatusTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Transitions an ItemVersion between workflow states.
    Rules are enforced server-side per the STATUS_TRANSITIONS matrix.
    """
    version = db.query(ItemVersion).filter(
        and_(
            ItemVersion.id == version_id,
            ItemVersion.learning_object_id == lo_id,
        )
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="ItemVersion not found.")

    key = (version.status, payload.new_status)
    allowed_roles = STATUS_TRANSITIONS.get(key)

    if allowed_roles is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transition from {version.status.value} → {payload.new_status.value} is not allowed.",
        )

    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Transition requires one of: {[r.value for r in allowed_roles]}",
        )

    version.status = payload.new_status

    # Store reviewer feedback on rejections (READY_FOR_REVIEW → DRAFT)
    if payload.feedback and payload.new_status == ItemStatus.DRAFT:
        if version.metadata_tags is None:
            version.metadata_tags = {}
        version.metadata_tags = {**version.metadata_tags, "review_feedback": payload.feedback}

    db.commit()
    db.refresh(version)
    return version


# ---------------------------------------------------------------------------
# DELETE /learning-objects/{lo_id} — Soft-Delete Guard
# ---------------------------------------------------------------------------

@router.delete("/learning-objects/{lo_id}")
def delete_learning_object(
    lo_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """
    Soft-delete guard: marks all versions RETIRED instead of SQL DELETE.
    """
    lo = db.query(LearningObject).filter(LearningObject.id == lo_id).first()
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    versions = db.query(ItemVersion).filter(ItemVersion.learning_object_id == lo_id).all()
    for v in versions:
        v.status = ItemStatus.RETIRED

    db.commit()
    return {"status": "soft_deleted", "learning_object_id": str(lo_id)}
