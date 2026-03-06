from datetime import datetime, timedelta, timezone
import random
from typing import List, Optional
from uuid import UUID
import json

from fastapi import HTTPException, status
from app.core.prisma_db import prisma
from prisma import Json
from app.models.item_version import ItemStatus
from app.models.exam_session import SessionStatus

async def _select_items_for_test_definition(test) -> List[dict]:
    """
    Core selection / freeze logic using Prisma.
    """
    selected_items: List[dict] = []

    # Parse blocks if string
    blocks = test.blocks
    if isinstance(blocks, str):
        blocks = json.loads(blocks)

    for block in blocks:
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                lo_id = rule["learning_object_id"]
                latest_approved = await prisma.item_versions.find_first(
                    where={
                        "learning_object_id": str(lo_id),
                        "status": {"in": [ItemStatus.APPROVED.value, ItemStatus.READY_FOR_REVIEW.value, ItemStatus.DRAFT.value]},
                    },
                    order={"version_number": "desc"}
                )
                if not latest_approved:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Fixed rule failed: LO {lo_id} has no approved version.",
                    )

                selected_items.append(
                    {
                        "learning_object_id": str(latest_approved.learning_object_id),
                        "item_version_id": str(latest_approved.id),
                        "content": latest_approved.content,
                        "options": latest_approved.options,
                        "question_type": latest_approved.question_type,
                        "version_number": latest_approved.version_number,
                    }
                )

            elif rule["rule_type"] == "RANDOM":
                tags = rule.get("tags", [])
                count = rule.get("count", 1)

                # Fetch all approved items (latest versions)
                # In a large DB, this would be a raw query or optimized find_many.
                # Since we want industry standard, let's fetch only what's needed.
                
                # Logic: Find unique LOs that have at least one APPROVED version
                # If tags exist, they must match too.
                
                query_args = {
                    "where": {"status": {"in": [ItemStatus.APPROVED.value, ItemStatus.READY_FOR_REVIEW.value, ItemStatus.DRAFT.value]}},
                    "order": {"version_number": "desc"}
                }
                
                candidates_all = await prisma.item_versions.find_many(**query_args)
                
                # Group by LO ID and filter by tags
                candidates_by_lo = {}
                for v in candidates_all:
                    if v.learning_object_id not in candidates_by_lo:
                        # Check tags if present
                        if tags:
                            metadata = v.metadata_tags
                            if isinstance(metadata, str):
                                try: metadata = json.loads(metadata)
                                except: metadata = {}
                            if not metadata or not any(tag in metadata for tag in tags):
                                continue
                        candidates_by_lo[v.learning_object_id] = v

                candidates = list(candidates_by_lo.values())

                if len(candidates) < count:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "Random rule failed: "
                            f"Found {len(candidates)} approved items, but need {count}."
                        ),
                    )

                chosen = random.sample(candidates, count)
                for v in chosen:
                    selected_items.append(
                        {
                            "learning_object_id": str(v.learning_object_id),
                            "item_version_id": str(v.id),
                            "content": v.content,
                            "options": v.options,
                            "question_type": v.question_type,
                            "version_number": v.version_number,
                        }
                    )

    return selected_items

async def instantiate_session_for_student(
    test_definition_id: UUID, current_user
) -> dict:
    """
    Instantiate (freeze) a TestDefinition for the given student user.
    """
    test = await prisma.test_definitions.find_unique(where={"id": str(test_definition_id)})
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    selected_items = await _select_items_for_test_definition(test)

    # Provision time multiplier fallback
    multiplier = current_user.provision_time_multiplier if hasattr(current_user, 'provision_time_multiplier') else 1.0
    total_minutes = test.duration_minutes * multiplier
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=total_minutes)

    new_session = await prisma.exam_sessions.create(
        data={
            "test_definition_id": str(test.id),
            "student_id": str(current_user.id),
            "items": Json(selected_items),
            "status": SessionStatus.STARTED.value,
            "started_at": datetime.now(timezone.utc),
            "expires_at": expires_at,
        }
    )

    return new_session

async def get_exam_session_for_user(
    session_id: UUID, current_user
) -> dict:
    """
    Retrieve an ExamSession for the given user, applying expiration and
    authorization rules.
    """
    session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam session not found.",
        )

    # Expiration check
    if session.status == SessionStatus.STARTED.value:
        now = datetime.now(timezone.utc)
        # Ensure comparison is tz-aware if prisma returns naive
        sess_expires = session.expires_at
        if sess_expires.tzinfo is None:
            sess_expires = sess_expires.replace(tzinfo=timezone.utc)
            
        if now > sess_expires:
            session = await prisma.exam_sessions.update(
                where={"id": session.id},
                data={"status": SessionStatus.EXPIRED.value}
            )

    if session.student_id != current_user.id and current_user.role not in [
        "ADMIN",
        "CONSTRUCTOR",
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this session.",
        )

    return session
