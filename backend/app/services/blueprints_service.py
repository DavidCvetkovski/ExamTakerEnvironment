from typing import List, Dict, Any, Optional
from uuid import UUID
import json

from fastapi import HTTPException, status
from app.core.prisma_db import prisma
from prisma import Json
from app.models.user import UserRole
from app.models.item_version import ItemStatus
from app.schemas.test_definition import TestDefinitionCreate

async def create_test_definition(
    payload: TestDefinitionCreate, current_user_id: str
) -> dict:
    blocks_data = [block.model_dump(mode="json") for block in payload.blocks]

    new_test = await prisma.test_definitions.create(
        data={
            "title": payload.title,
            "description": payload.description,
            "created_by": str(current_user_id),
            "blocks": Json(blocks_data),
            "duration_minutes": payload.duration_minutes,
            "shuffle_questions": payload.shuffle_questions,
        }
    )
    return new_test

async def list_test_definitions() -> List[dict]:
    return await prisma.test_definitions.find_many()

async def get_test_definition(test_id: UUID) -> dict:
    test = await prisma.test_definitions.find_unique(where={"id": str(test_id)})
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )
    return test

async def update_test_definition(
    test_id: UUID, payload: TestDefinitionCreate
) -> dict:
    blocks_data = [block.model_dump(mode="json") for block in payload.blocks]
    
    updated = await prisma.test_definitions.update(
        where={"id": str(test_id)},
        data={
            "title": payload.title,
            "description": payload.description,
            "blocks": Json(blocks_data),
            "duration_minutes": payload.duration_minutes,
            "shuffle_questions": payload.shuffle_questions,
        }
    )
    return updated

async def validate_test_blueprint(test_id: UUID) -> Dict[str, Any]:
    test = await prisma.test_definitions.find_unique(where={"id": str(test_id)})
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    # Convert blocks from JSON if string
    blocks = test.blocks
    if isinstance(blocks, str):
        blocks = json.loads(blocks)

    results = []
    for block in blocks:
        block_results = {"title": block["title"], "rule_validation": []}
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                lo_id = rule["learning_object_id"]
                latest = await prisma.item_versions.find_first(
                    where={
                        "learning_object_id": str(lo_id),
                        "status": {"in": [ItemStatus.APPROVED.value, ItemStatus.READY_FOR_REVIEW.value, ItemStatus.DRAFT.value]},
                    }
                )
                block_results["rule_validation"].append(
                    {
                        "rule": f"FIXED {lo_id}",
                        "valid": latest is not None,
                        "reason": "Found approved version"
                        if latest
                        else "No approved version found",
                    }
                )
            elif rule["rule_type"] == "RANDOM":
                tags = rule.get("tags", [])
                count = rule.get("count", 1)

                # For complex JSONB tag matching, we use query_raw for performance
                # This checks if any of the tags exist as keys in metadata_tags
                if tags:
                    tags_pg = "{" + ",".join(tags) + "}"
                    query = """
                        SELECT count(DISTINCT learning_object_id) 
                        FROM item_versions 
                        WHERE status = 'APPROVED' 
                        AND metadata_tags ?| %s::text[]
                    """
                    # Prisma query_raw expects positional params or raw string
                    # We'll fetch all approved versions and filter in python if query_raw is tricky with tags
                    # But let's try a simpler approach if possible.
                    # Actually, let's just fetch all approved versions with metadata_tags and count locally 
                    # for now until we optimize with query_raw correctly for the driver.
                    
                    approved_versions = await prisma.item_versions.find_many(
                        where={"status": {"in": [ItemStatus.APPROVED.value, ItemStatus.READY_FOR_REVIEW.value, ItemStatus.DRAFT.value]}}
                    )
                    
                    def has_tags(metadata):
                        if not metadata: return False
                        if isinstance(metadata, str):
                            try: metadata = json.loads(metadata)
                            except: return False
                        return any(tag in metadata for tag in tags)

                    matching_counts = set()
                    for v in approved_versions:
                        if has_tags(v.metadata_tags):
                            matching_counts.add(v.learning_object_id)
                    
                    matching_count = len(matching_counts)
                else:
                    # No tags, just count distinct LOs with approved versions
                    query_res = await prisma.item_versions.find_many(
                        where={"status": {"in": [ItemStatus.APPROVED.value, ItemStatus.READY_FOR_REVIEW.value, ItemStatus.DRAFT.value]}},
                        distinct=["learning_object_id"]
                    )
                    matching_count = len(query_res)

                block_results["rule_validation"].append(
                    {
                        "rule": f"RANDOM tags={tags} count={count}",
                        "valid": matching_count >= count,
                        "matching_count": matching_count,
                        "reason": f"Found {matching_count} candidates",
                    }
                )
        results.append(block_results)

    all_valid = all(
        all(rv["valid"] for rv in b["rule_validation"]) for b in results
    )
    return {"valid": all_valid, "blocks": results}
