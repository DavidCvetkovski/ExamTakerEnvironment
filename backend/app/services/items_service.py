from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import json
import re
from datetime import datetime, timezone

from app.core.prisma_db import prisma
from prisma import Json
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
from app.schemas.item_version import ItemVersionCreate
from app.schemas.learning_object import LearningObjectListResponse, LearningObjectUpdate

async def _invalidate_exam_item_pools() -> None:
    """Clear cached blueprint candidate pools after an item-version write.

    Selection draws from item versions by tag/status, so any item change can
    affect an arbitrary set of blueprints. Imported lazily to avoid an
    import-time cycle with ``exam_sessions_service``.
    """
    from app.services.exam_sessions_service import invalidate_all_test_definition_pools

    await invalidate_all_test_definition_pools()


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
            # 3. Stored HTML payload from seeded/editor content
            elif isinstance(node.get("raw_html"), str):
                text_parts.append(re.sub(r"<[^>]+>", " ", node["raw_html"]))
            
            # Recurse into children
            for key in ["content", "choices"]: # choices for MCQ options fallback
                children = node.get(key)
                if children:
                    _recurse(children)
        elif isinstance(node, list):
            for item in node:
                _recurse(item)
                
    _recurse(content)
    return " ".join(" ".join(text_parts).split()).strip()


SUBJECT_SORT_ORDER = {
    "Mathematics": 0,
    "Science": 1,
    "Humanities": 2,
    "Computing": 3,
}


def get_metadata_string(metadata: Optional[dict], key: str) -> str:
    if not isinstance(metadata, dict):
        return ""
    value = metadata.get(key)
    return value if isinstance(value, str) else ""

def serialize_learning_object_summary(lo) -> Optional[LearningObjectListResponse]:
    """Flatten a learning object with its latest version into list/detail DTO shape."""
    latest = lo.item_versions[0] if lo.item_versions else None
    if not latest:
        return None

    preview = "New Question"
    full_content = ""
    content_data = latest.content
    if isinstance(content_data, str):
        try:
            content_data = json.loads(content_data)
        except Exception:
            pass

    if isinstance(content_data, dict):
        full_text = extract_text_from_tiptap_json(content_data)
        if full_text:
            full_content = full_text
            preview = full_text[:100] + ("..." if len(full_text) > 100 else "")

    course = getattr(lo, "courses", None)
    updated_at = latest.created_at or lo.created_at or datetime.now(timezone.utc)
    return LearningObjectListResponse(
        id=UUID(lo.id),
        bank_id=UUID(lo.bank_id),
        course_id=UUID(lo.course_id) if lo.course_id else None,
        course_title=course.title if course else None,
        course_code=course.code if course else None,
        created_at=lo.created_at or updated_at,
        updated_at=updated_at,
        latest_version_number=latest.version_number,
        latest_status=ItemStatus(latest.status),
        latest_question_type=QuestionType(latest.question_type),
        latest_content_preview=preview,
        latest_content_full=full_content or preview,
        metadata_tags=latest.metadata_tags,
    )


async def list_learning_objects() -> List[LearningObjectListResponse]:
    """Return a list of all Learning Objects with their latest version metadata."""
    # Fetch all LOs with their versions, sorted by version_number desc.
    objects = await prisma.learning_objects.find_many(
        include={
            "courses": True,
            "item_versions": {
                "order_by": {"version_number": "desc"},
                "take": 1
            }
        }
    )
    
    results = []
    for lo in objects:
        summary = serialize_learning_object_summary(lo)
        if summary:
            results.append(summary)

    results.sort(
        key=lambda item: (
            (item.course_title or "").lower(),
            SUBJECT_SORT_ORDER.get(get_metadata_string(item.metadata_tags, "topic"), 99),
            get_metadata_string(item.metadata_tags, "focus").lower(),
            item.latest_content_preview.lower(),
        )
    )
    return results


async def get_learning_object(lo_id: UUID) -> LearningObjectListResponse:
    """Return a single Learning Object with its latest version and course metadata."""
    lo = await prisma.learning_objects.find_unique(
        where={"id": str(lo_id)},
        include={
            "courses": True,
            "item_versions": {
                "order_by": {"version_number": "desc"},
                "take": 1,
            },
        },
    )
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    summary = serialize_learning_object_summary(lo)
    if not summary:
        raise HTTPException(status_code=404, detail="No version found for this Learning Object.")
    return summary

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


async def update_learning_object(lo_id: UUID, payload: LearningObjectUpdate) -> LearningObjectListResponse:
    """Update learning-object-level metadata, such as course assignment."""
    lo = await prisma.learning_objects.find_unique(where={"id": str(lo_id)})
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    course_id = str(payload.course_id) if payload.course_id else None
    if course_id:
        course = await prisma.courses.find_unique(where={"id": course_id})
        if not course or not course.is_active:
            raise HTTPException(status_code=400, detail="Course not found or inactive.")

    await prisma.learning_objects.update(
        where={"id": str(lo_id)},
        data={"course_id": course_id},
    )
    return await get_learning_object(lo_id)

async def get_item_versions(lo_id: UUID) -> List[dict]:
    """Return the complete version history of a Learning Object."""
    versions = await prisma.item_versions.find_many(
        where={"learning_object_id": str(lo_id)},
        order={"version_number": "desc"}
    )
    return [v.__dict__ for v in versions] # Convert to dict if necessary, or let Prisma handle

async def create_new_revision(lo_id: UUID, payload: ItemVersionCreate, current_user_id: str) -> dict:
    """
    Immutability Controller: overwrite the current DRAFT in-place, or create a new DRAFT
    version when the latest version has already been advanced past DRAFT status.
    """
    latest = await prisma.item_versions.find_first(
        where={"learning_object_id": str(lo_id)},
        order={"version_number": "desc"}
    )

    content_obj = payload.content if not isinstance(payload.content, str) else json.loads(payload.content)
    options_obj = payload.options.model_dump()
    metadata_obj = payload.metadata_tags

    if latest and latest.status == ItemStatus.DRAFT.value:
        # Overwrite in place — same ID and version_number.
        result = await prisma.item_versions.update(
            where={"id": latest.id},
            data={
                "created_by": current_user_id,
                "question_type": payload.question_type.value,
                "content": Json(content_obj),
                "options": Json(options_obj),
                "metadata_tags": Json(metadata_obj) if metadata_obj else Json(None),
            }
        )
    else:
        # Latest version has been advanced (READY_FOR_REVIEW, APPROVED, etc.) — create next version.
        next_v = (latest.version_number + 1) if latest else 1
        result = await prisma.item_versions.create(
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

    await _invalidate_exam_item_pools()
    return result

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
            except json.JSONDecodeError:
                metadata = {}
        if not metadata:
            metadata = {}
        metadata["review_feedback"] = feedback
        data["metadata_tags"] = Json(metadata)

    updated = await prisma.item_versions.update(
        where={"id": version.id},
        data=data
    )
    await _invalidate_exam_item_pools()
    return updated

async def duplicate_learning_object(lo_id: UUID, current_user_id: str) -> dict:
    """Create a copy of a Learning Object with its latest version content."""
    original = await prisma.learning_objects.find_unique(where={"id": str(lo_id)})
    if not original:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    latest = await prisma.item_versions.find_first(
        where={"learning_object_id": str(lo_id)},
        order={"version_number": "desc"}
    )
    if not latest:
        raise HTTPException(status_code=404, detail="No version found for this Learning Object.")

    new_lo = await prisma.learning_objects.create(
        data={
            "bank_id": original.bank_id,
            "course_id": original.course_id,
            "created_by": current_user_id,
        }
    )

    # Copy the content; strip metadata like review_feedback from tags
    raw_tags = latest.metadata_tags or {}
    if isinstance(raw_tags, str):
        import json as _json
        try:
            raw_tags = _json.loads(raw_tags)
        except Exception:
            raw_tags = {}
    raw_tags.pop("review_feedback", None)

    await prisma.item_versions.create(
        data={
            "learning_object_id": new_lo.id,
            "created_by": current_user_id,
            "version_number": 1,
            "status": ItemStatus.DRAFT.value,
            "question_type": latest.question_type,
            "content": Json(latest.content if isinstance(latest.content, dict) else {}),
            "options": Json(latest.options if isinstance(latest.options, dict) else {}),
            "metadata_tags": Json(raw_tags),
        }
    )

    await _invalidate_exam_item_pools()
    return {"status": "duplicated", "learning_object_id": str(new_lo.id)}

async def delete_learning_object(lo_id: UUID) -> dict:
    """Soft-deletes a Learning Object by retiring all versions."""
    lo = await prisma.learning_objects.find_unique(where={"id": str(lo_id)})
    if not lo:
        raise HTTPException(status_code=404, detail="Learning Object not found.")

    await prisma.item_versions.update_many(
        where={"learning_object_id": str(lo_id)},
        data={"status": ItemStatus.RETIRED.value}
    )

    await _invalidate_exam_item_pools()
    return {"status": "soft_deleted", "learning_object_id": str(lo_id)}
