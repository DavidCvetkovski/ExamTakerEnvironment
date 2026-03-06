from typing import List, Optional, Set
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.item_version import ItemVersion, ItemStatus, QuestionType
from app.models.learning_object import LearningObject
from app.models.item_bank import ItemBank
from app.schemas.item_version import ItemVersionCreate
from app.schemas.learning_object import LearningObjectListResponse

# Maps (current_status, new_status) → set of roles allowed to make that move
STATUS_TRANSITIONS: dict[tuple[ItemStatus, ItemStatus], set[UserRole]] = {
    (ItemStatus.DRAFT, ItemStatus.READY_FOR_REVIEW): {UserRole.CONSTRUCTOR, UserRole.ADMIN},
    (ItemStatus.READY_FOR_REVIEW, ItemStatus.APPROVED):  {UserRole.REVIEWER, UserRole.ADMIN},
    (ItemStatus.READY_FOR_REVIEW, ItemStatus.DRAFT):    {UserRole.REVIEWER, UserRole.ADMIN},  # rejection
    (ItemStatus.APPROVED, ItemStatus.RETIRED):           {UserRole.ADMIN},
}

def extract_text_from_tiptap_json(content: dict) -> str:
    """Recursively extracts text from TipTap JSON structure."""
    if not content:
        return ""
    
    text_parts = []
    
    def _recurse(node):
        if isinstance(node, dict):
            # 1. TipTap text node
            if node.get("type") == "text" and "text" in node:
                text_parts.append(str(node.get("text", "")))
            # 2. Simple container (like seed data {"text": "..."})
            elif "text" in node and not isinstance(node["text"], (dict, list)):
                text_parts.append(str(node["text"]))
            
            # Recurse into children
            for key in ["content", "choices"]: # choices for MCQ options fallback
                children = node.get(key)
                if children:
                    _recurse(children)
        elif isinstance(node, list):
            for item in node:
                _recurse(item)
                
    _recurse(content)
    return " ".join(text_parts).strip()

def list_learning_objects(db: Session) -> List[LearningObjectListResponse]:
    """Return a list of all Learning Objects with their latest version metadata."""
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
            # Better text extraction for preview
            preview = "New Question"
            
            content_data = latest.content
            if isinstance(content_data, str):
                import json
                try:
                    content_data = json.loads(content_data)
                except:
                    pass

            if isinstance(content_data, dict):
                full_text = extract_text_from_tiptap_json(content_data)
                if full_text:
                    preview = full_text[:100] + ("..." if len(full_text) > 100 else "")
                
            results.append(LearningObjectListResponse(
                id=lo.id,
                bank_id=lo.bank_id,
                created_at=lo.created_at,
                latest_version_number=latest.version_number,
                latest_status=latest.status,
                latest_question_type=latest.question_type,
                latest_content_preview=preview,
                metadata_tags=latest.metadata_tags
            ))
            
    return results

def create_learning_object(db: Session, current_user: User) -> dict:
    """Creates a new Learning Object and its initial DRAFT version."""
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

def get_item_versions(db: Session, lo_id: UUID) -> List[ItemVersion]:
    """Return the complete version history of a Learning Object."""
    return (
        db.query(ItemVersion)
        .filter(ItemVersion.learning_object_id == lo_id)
        .order_by(ItemVersion.version_number.desc())
        .all()
    )

def create_new_revision(db: Session, lo_id: UUID, payload: ItemVersionCreate, current_user: User) -> ItemVersion:
    """Core Immutability Controller logic for revisions."""
    latest = (
        db.query(ItemVersion)
        .filter(ItemVersion.learning_object_id == lo_id)
        .order_by(ItemVersion.version_number.desc())
        .first()
    )

    if latest and latest.status == ItemStatus.DRAFT:
        # Overwrite the active draft
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

def transition_item_status(
    db: Session, 
    lo_id: UUID, 
    version_id: UUID, 
    new_status: ItemStatus, 
    current_user: User,
    feedback: Optional[str] = None
) -> ItemVersion:
    """Enforces status transition rules."""
    version = db.query(ItemVersion).filter(
        ItemVersion.id == version_id,
        ItemVersion.learning_object_id == lo_id,
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="ItemVersion not found.")

    key = (version.status, new_status)
    allowed_roles = STATUS_TRANSITIONS.get(key)

    if allowed_roles is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transition from {version.status.value} → {new_status.value} is not allowed.",
        )

    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Transition requires one of: {[r.value for r in allowed_roles]}",
        )

    version.status = new_status

    if feedback and new_status == ItemStatus.DRAFT:
        if version.metadata_tags is None:
            version.metadata_tags = {}
        version.metadata_tags = {**version.metadata_tags, "review_feedback": feedback}

    db.commit()
    db.refresh(version)
    return version

def delete_learning_object(db: Session, lo_id: UUID) -> dict:
    """Soft-deletes a Learning Object by retiring all versions."""
    lo = db.query(LearningObject).filter(LearningObject.id == lo_id).first()
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    versions = db.query(ItemVersion).filter(ItemVersion.learning_object_id == lo_id).all()
    for v in versions:
        v.status = ItemStatus.RETIRED

    db.commit()
    return {"status": "soft_deleted", "learning_object_id": str(lo_id)}
