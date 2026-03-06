from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import json

from app.core.prisma_db import prisma
from prisma import Json
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
from app.schemas.item_version import ItemVersionCreate
from app.schemas.learning_object import LearningObjectListResponse

# Maps (current_status, new_status) → set of roles allowed to make that move
STATUS_TRANSITIONS = {
    (ItemStatus.DRAFT, ItemStatus.READY_FOR_REVIEW): {UserRole.CONSTRUCTOR, UserRole.ADMIN},
    (ItemStatus.READY_FOR_REVIEW, ItemStatus.APPROVED): {UserRole.REVIEWER, UserRole.ADMIN},
    (ItemStatus.READY_FOR_REVIEW, ItemStatus.DRAFT): {UserRole.REVIEWER, UserRole.ADMIN},  # rejection
    (ItemStatus.APPROVED, ItemStatus.RETIRED): {UserRole.ADMIN},
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

async def list_learning_objects() -> List[LearningObjectListResponse]:
    """Return a list of all Learning Objects with their latest version metadata."""
    # Fetch all LOs with their versions, sorted by version_number desc
    objects = await prisma.learning_objects.find_many(
        include={
            "item_versions": {
                "order_by": {"version_number": "desc"},
                "take": 1
            }
        }
    )
    
    results = []
    for lo in objects:
        latest = lo.item_versions[0] if lo.item_versions else None
        if latest:
            # Better text extraction for preview
            preview = "New Question"
            
            content_data = latest.content
            # Prisma returns Json as dict/list, no need to json.loads unless it's a string double-encoded
            if isinstance(content_data, str):
                try:
                    content_data = json.loads(content_data)
                except:
                    pass

            if isinstance(content_data, dict):
                full_text = extract_text_from_tiptap_json(content_data)
                if full_text:
                    preview = full_text[:100] + ("..." if len(full_text) > 100 else "")
                
            results.append(LearningObjectListResponse(
                id=UUID(lo.id),
                bank_id=UUID(lo.bank_id),
                created_at=lo.created_at,
                latest_version_number=latest.version_number,
                latest_status=ItemStatus(latest.status),
                latest_question_type=QuestionType(latest.question_type),
                latest_content_preview=preview,
                metadata_tags=latest.metadata_tags
            ))
            
    return results

async def create_learning_object(current_user_id: str) -> dict:
    """Creates a new Learning Object and its initial DRAFT version."""
    bank = await prisma.item_banks.find_first()
    if not bank:
        bank = await prisma.item_banks.create(
            data={
                "name": "Default Bank",
                "created_by": current_user_id
            }
        )
        
    new_lo = await prisma.learning_objects.create(
        data={
            "bank_id": bank.id,
            "created_by": current_user_id
        }
    )
    
    await prisma.item_versions.create(
        data={
            "learning_object_id": new_lo.id,
            "created_by": current_user_id,
            "version_number": 1,
            "status": ItemStatus.DRAFT.value,
            "question_type": QuestionType.MULTIPLE_CHOICE.value,
            "content": Json({"type": "doc", "content": [{"type": "paragraph"}]}),
            "options": Json({"question_type": "MULTIPLE_CHOICE", "choices": [{"id": "A", "text": "", "is_correct": True, "weight": 1.0}]}),
        }
    )
    
    return {"status": "created", "learning_object_id": str(new_lo.id)}

async def get_item_versions(lo_id: UUID) -> List[dict]:
    """Return the complete version history of a Learning Object."""
    versions = await prisma.item_versions.find_many(
        where={"learning_object_id": str(lo_id)},
        order={"version_number": "desc"}
    )
    return [v.__dict__ for v in versions] # Convert to dict if necessary, or let Prisma handle

async def create_new_revision(lo_id: UUID, payload: ItemVersionCreate, current_user_id: str) -> dict:
    """Core Immutability Controller logic for revisions."""
    latest = await prisma.item_versions.find_first(
        where={"learning_object_id": str(lo_id)},
        order={"version_number": "desc"}
    )

    content_obj = payload.content if not isinstance(payload.content, str) else json.loads(payload.content)
    options_obj = payload.options.model_dump()
    metadata_obj = payload.metadata_tags

    next_v = (latest.version_number + 1) if latest else 1
    new_version = await prisma.item_versions.create(
        data={
            "learning_object_id": str(lo_id),
            "created_by": current_user_id,
            "version_number": next_v,
            "status": ItemStatus.DRAFT.value,
            "question_type": payload.question_type.value,
            "content": Json(content_obj),
            "options": Json(options_obj),
            "metadata_tags": Json(metadata_obj) if metadata_obj else Json(None),
        }
    )
    return new_version

async def transition_item_status(
    lo_id: UUID, 
    version_id: UUID, 
    new_status: ItemStatus, 
    current_user_role: UserRole,
    feedback: Optional[str] = None
) -> dict:
    """Enforces status transition rules."""
    version = await prisma.item_versions.find_first(
        where={
            "id": str(version_id),
            "learning_object_id": str(lo_id),
        }
    )

    if not version:
        raise HTTPException(status_code=404, detail="ItemVersion not found.")

    current_status = ItemStatus(version.status)
    key = (current_status, new_status)
    allowed_roles = STATUS_TRANSITIONS.get(key)

    if allowed_roles is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transition from {current_status.value} → {new_status.value} is not allowed.",
        )

    if current_user_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Transition requires one of: {[r.value for r in allowed_roles]}",
        )

    data = {"status": new_status.value}

    if feedback and new_status == ItemStatus.DRAFT:
        metadata = version.metadata_tags
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        if not metadata:
            metadata = {}
        metadata["review_feedback"] = feedback
        data["metadata_tags"] = Json(metadata)

    updated = await prisma.item_versions.update(
        where={"id": version.id},
        data=data
    )
    return updated

async def delete_learning_object(lo_id: UUID) -> dict:
    """Soft-deletes a Learning Object by retiring all versions."""
    lo = await prisma.learning_objects.find_unique(where={"id": str(lo_id)})
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    await prisma.item_versions.update_many(
        where={"learning_object_id": str(lo_id)},
        data={"status": ItemStatus.RETIRED.value}
    )

    return {"status": "soft_deleted", "learning_object_id": str(lo_id)}
